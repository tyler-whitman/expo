import JsonFile from '@expo/json-file';
import chalk from 'chalk';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import { set } from 'lodash';
import path from 'path';
import readline from 'readline';
import semver from 'semver';
import stripAnsi from 'strip-ansi';

import { EXPO_DIR, IOS_DIR } from '../Constants';
import Git from '../Git';
import logger from '../Logger';
import * as Npm from '../Npm';
import { getListOfPackagesAsync } from '../Packages';
import { Task } from '../TasksRunner';
import * as Utils from '../Utils';
import * as Workspace from '../Workspace';
import { getPackageGitLogsAsync } from './gitLogs';
import {
  createFabricAsync,
  distTagForVersion,
  getSuggestedReleaseType,
  resolveSuggestedVersion,
  recursivelyResolveDependentsAsync,
  printPackageFabric,
  tagFromOptions,
  doesSomeoneHaveNoAccessToPackage,
} from './helpers';
import { CommandOptions, Fabrics, TaskArgs } from './types';

const { green, yellow, cyan, blue, magenta, red, gray } = chalk;

/**
 * Gets a list of public packages in the monorepo, downloads `npm view` result of them,
 * creates their Changelog instance and fills given fabrics array (it's empty at the beginning).
 */
export const preparePackages = new Task<TaskArgs>(
  {
    name: 'preparePackages',
    required: true,
    backupable: false,
  },
  async (fabrics: Fabrics, options: CommandOptions) => {
    logger.info('🔎 Gathering data about packages...\n');

    const { exclude, packageNames } = options;
    const allPackages = await getListOfPackagesAsync();
    const filteredPackages = allPackages.filter(pkg => {
      const isPrivate = pkg.packageJson.private;
      const isScoped = packageNames.length === 0 || packageNames.includes(pkg.packageName);
      const isExcluded = exclude.includes(pkg.packageName);
      return !isPrivate && isScoped && !isExcluded;
    });

    fabrics.push(...(await Promise.all(filteredPackages.map(createFabricAsync))));

    if (packageNames.length > 0 && !options.excludeDeps) {
      // Even if some packages have been listed as command arguments,
      // we still want to include its dependencies.

      const allPackagesObj = allPackages.reduce((acc, pkg) => {
        acc[pkg.packageName] = pkg;
        return acc;
      }, {});

      const fabricsObj = fabrics.reduce((acc, fabric) => {
        acc[fabric.pkg.packageName] = fabric;
        return acc;
      }, {});

      await recursivelyResolveDependentsAsync(allPackagesObj, fabricsObj, fabrics);
    }
  }
);

/**
 * Checks packages integrity - package is integral if `gitHead` in `package.json` matches `gitHead`
 * of the package published under current version specified in `package.json`.
 */
export const checkPackagesIntegrity = new Task<TaskArgs>(
  {
    name: 'checkPackagesIntegrity',
    dependsOn: [preparePackages],
  },
  async (fabrics: Fabrics) => {
    logger.info('👁  Checking packages integrity...');

    for (const { pkg, pkgView, changelog, state } of fabrics) {
      if (!pkgView) {
        // If no package view, then the package hasn't been released yet - no need to check integrity.
        state.integral = true;
        continue;
      }

      const gitHead = pkg.packageJson.gitHead;
      const lastVersionInChangelog = await changelog.getLastPublishedVersionAsync();

      const gitHeadMatches = pkg.packageJson.gitHead === pkgView.gitHead;
      const versionMatches = !lastVersionInChangelog || pkgView.version === lastVersionInChangelog;

      state.integral = gitHeadMatches && versionMatches;

      if (state.integral) {
        // Checks passed.
        continue;
      }

      logger.warn(`Package integrity check failed for ${green(pkg.packageName)}.`);

      if (gitHead && !gitHeadMatches) {
        logger.warn(
          `Package head (${green(gitHead)}) doesn't match published head (${green(pkgView.gitHead)}`
        );
      }
      if (lastVersionInChangelog && !versionMatches) {
        logger.warn(
          `Package version (${cyan(
            pkg.packageVersion
          )}) doesn't match last version in its changelog (${cyan(lastVersionInChangelog)})`
        );
      }
    }
    logger.log();
  }
);

/**
 * Finds unpublished packages. Package is considered unpublished if there are
 * any new commits or changelog entries prior to previous publish on the current branch.
 */
export const findUnpublishedPackages = new Task<TaskArgs>(
  {
    name: 'findUnpublishedPackages',
    dependsOn: [preparePackages],
  },
  async (fabrics: Fabrics, options: CommandOptions): Promise<void | symbol> => {
    logger.info('👀 Searching for packages with unpublished changes...');

    const prerelease = options.prerelease === true ? 'rc' : options.prerelease || undefined;

    for (const fabric of fabrics) {
      const { pkg, pkgView, changelog, gitDir, state } = fabric;
      const { gitHead } = pkg.packageJson;

      const changelogChanges = await changelog.getChangesAsync();
      const logs = await getPackageGitLogsAsync(gitDir, gitHead);

      state.logs = logs;
      state.changelogChanges = changelogChanges;

      state.hasUnpublishedChanges =
        !logs || logs.commits.length > 0 || changelogChanges.totalCount > 0;

      state.releaseType = getSuggestedReleaseType(fabric, prerelease);
      state.releaseVersion = resolveSuggestedVersion(
        pkg.packageVersion,
        pkgView?.versions ?? [],
        state.releaseType,
        prerelease
      );

      if (!state.releaseType || !state.releaseVersion) {
        // @tsapeta: throw an error?
        continue;
      }
    }

    if (fabrics.filter(({ state }) => state.hasUnpublishedChanges).length === 0) {
      logger.log(green('\n✅ All packages are up-to-date.'));
      return Task.STOP;
    }
    logger.log();
  }
);

/**
 * Lists packages that have any unpublished changes.
 */
export const listUnpublishedPackages = new Task<TaskArgs>(
  {
    name: 'listUnpublishedPackages',
    dependsOn: [checkPackagesIntegrity, findUnpublishedPackages],
  },
  async (fabrics: Fabrics) => {
    const unpublished = fabrics.filter(({ state }) => state.hasUnpublishedChanges);

    logger.info('🧩 Unpublished packages:\n');
    unpublished.forEach(printPackageFabric);
  }
);

/**
 * Checks whether the command is run on master branch or package side-branch.
 * Otherwise, it prompts to confirm that you know what you're doing.
 */
export async function checkBranchNameAsync() {
  const branchName = await Git.getCurrentBranchNameAsync();

  // Publishes can be run on `master` or package's side-branches like `expo-package/1.x.x`
  if (branchName === 'master' || /^[\w\-@]+\/\d+\.(x\.x|\d+\.x)$/.test(branchName)) {
    return true;
  }

  logger.warn(
    `⚠️  It's recommended to publish from ${blue('master')} branch, while you're at ${blue(
      branchName
    )}`
  );

  const { confirmed } = await inquirer.prompt<{ confirmed: boolean }>([
    {
      type: 'confirm',
      name: 'confirmed',
      prefix: yellow('⚠️ '),
      message: yellow(`Do you want to proceed?`),
      default: true,
    },
  ]);
  logger.log();
  return confirmed;
}

/**
 * Checks whether the current branch is correct and working dir is not dirty.
 */
export const checkRepositoryStatus = new Task<TaskArgs>(
  {
    name: 'checkRepositoryStatus',
    required: true,
    backupable: false,
  },
  async (): Promise<void | symbol> => {
    logger.info(`🕵️‍♂️ Checking repository status...`);

    if (!(await checkBranchNameAsync())) {
      return Task.STOP;
    }
    if (await Git.hasUnstagedChangesAsync()) {
      logger.error(`🚫 Repository contains unstaged changes, please make sure to have it clear.\n`);
      return Task.STOP;
    }
  }
);

/**
 * Prompts which suggested packages are going to be published.
 */
export const selectPackagesToPublish = new Task<TaskArgs>(
  {
    name: 'selectPackagesToPublish',
  },
  async (fabrics: Fabrics): Promise<void | symbol> => {
    const unpublished = fabrics.filter(({ state }) => state.hasUnpublishedChanges);

    logger.info('👉 Selecting packages to publish...\n');

    for (const fabric of unpublished) {
      const { pkg, dependents, state } = fabric;

      // Skip if no dependents have been selected.
      if (dependents && dependents.every(dependent => !dependent.state.isSelectedToPublish)) {
        continue;
      }

      printPackageFabric(fabric);

      const { selected } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'selected',
          prefix: '❔',
          message: `Do you want to publish ${green.bold(pkg.packageName)} as version ${cyan.bold(
            state.releaseVersion!
          )}?`,
          default: true,
        },
      ]);
      logger.log();

      state.isSelectedToPublish = selected;
    }

    if (unpublished.filter(({ state }) => state.isSelectedToPublish).length === 0) {
      logger.log(green('🤷‍♂️ There is nothing chosen to be published.\n'));
      return Task.STOP;
    }
  }
);

/**
 * Updates versions in packages selected to be published.
 */
export const updateVersions = new Task<TaskArgs>(
  {
    name: 'updateVersions',
    dependsOn: [selectPackagesToPublish],
    filesToStage: ['packages/**/package.json'],
  },
  async (fabrics: Fabrics) => {
    const toPublish = fabrics.filter(({ state }) => state.isSelectedToPublish);

    for (const { pkg, state } of toPublish) {
      const gitHead = state.logs?.[0]?.hash ?? pkg.packageJson.gitHead;

      if (!gitHead || !state.releaseVersion) {
        // TODO: do it better
        continue;
      }

      // Make a deep clone of `package.json` - `pkg.packageJson` should stay immutable.
      const packageJson = Utils.deepCloneObject(pkg.packageJson);

      logger.info(
        `📦 Updating ${magenta.bold('package.json')} in ${green.bold(pkg.packageName)} with...`
      );

      const update = {
        version: state.releaseVersion,
        gitHead,
      };

      for (const key in update) {
        logger.log(yellow(' >'), `${yellow.bold(key)}: ${cyan.bold(update[key])}`);
        set(packageJson, key, update[key]);
      }

      // Saving new contents of `package.json`.
      await JsonFile.writeAsync(path.join(pkg.path, 'package.json'), packageJson);

      logger.log();
    }
  }
);

/**
 * Updates `bundledNativeModules.json` file in `expo` package.
 * It's used internally by some `expo-cli` commands so we know which package versions are compatible with `expo` version.
 */
export const updateBundledNativeModulesFile = new Task<TaskArgs>(
  {
    name: 'updateBundledNativeModulesFile',
    dependsOn: [selectPackagesToPublish],
    filesToStage: ['packages/expo/bundledNativeModules.json'],
  },
  async (fabrics: Fabrics) => {
    const toPublish = fabrics.filter(({ state }) => state.isSelectedToPublish);

    if (toPublish.length === 0) {
      return;
    }

    const bundledNativeModulesPath = path.join(EXPO_DIR, 'packages/expo/bundledNativeModules.json');
    const bundledNativeModules = await JsonFile.readAsync<{ [key: string]: string }>(
      bundledNativeModulesPath
    );

    logger.info(`✏️  Updating ${magenta.bold('bundledNativeModules.json')} file...`);

    for (const { pkg, state } of toPublish) {
      const currentRange = bundledNativeModules[pkg.packageName];
      const newRange = `~${state.releaseVersion}`;

      if (!currentRange) {
        logger.log(yellow(' >'), green.bold(pkg.packageName), gray('is not defined.'));
        continue;
      }

      logger.log(
        yellow(' >'),
        green.bold(pkg.packageName),
        `${cyan.bold(currentRange)} -> ${cyan.bold(newRange)}`
      );

      bundledNativeModules[pkg.packageName] = newRange;
    }
    await JsonFile.writeAsync(bundledNativeModulesPath, bundledNativeModules);
  }
);

/**
 * Updates versions of packages to be published in other workspace projects depending on them.
 */
export const updateWorkspaceDependencies = new Task<TaskArgs>(
  {
    name: 'updateWorkspaceDependencies',
  },
  async (fabrics: Fabrics) => {
    const workspaceInfo = await Workspace.getInfoAsync();
    logger.info('📤 Updating workspace projects...');
  }
);

/**
 * Updates version props in packages containing Android's native code.
 */
export const updateAndroidProjects = new Task<TaskArgs>(
  {
    name: 'updateAndroidProjects',
    dependsOn: [selectPackagesToPublish],
    filesToStage: ['packages/**/android/build.gradle'],
  },
  async (fabrics: Fabrics) => {
    logger.info('🤖 Updating Android projects...');

    const toPublish = fabrics.filter(({ state }) => state.isSelectedToPublish);

    for (const { pkg, state } of toPublish) {
      const gradlePath = path.join(pkg.path, 'android/build.gradle');

      // Some packages don't have android code.
      if (!(await fs.pathExists(gradlePath))) {
        continue;
      }

      const relativeGradlePath = path.relative(EXPO_DIR, gradlePath);

      logger.log(
        yellow(' >'),
        `Updating ${yellow('version')} and ${yellow('versionCode')} in ${magenta(
          relativeGradlePath
        )}`
      );

      await Utils.transformFileAsync(gradlePath, [
        {
          // update version and versionName in android/build.gradle
          pattern: /\b(version\s*=\s*|versionName\s+)(['"])(.*?)\2/g,
          replaceWith: `$1$2${state.releaseVersion}$2`,
        },
        {
          pattern: /\bversionCode\s+(\d+)\b/g,
          replaceWith: (match, p1) => {
            const versionCode = parseInt(p1, 10);
            return `versionCode ${versionCode + 1}`;
          },
        },
      ]);
    }
  }
);

/**
 * Updates pods in Expo client's project (@todo: and bare-expo).
 */
export const updateIosProjects = new Task<TaskArgs>(
  {
    name: 'updateIosProjects',
    dependsOn: [selectPackagesToPublish],
    filesToStage: ['ios/Pods', 'ios/Podfile.lock'],
  },
  async (fabrics: Fabrics) => {
    logger.info('🍎 Updating iOS projects...');

    const podspecNames = fabrics
      .filter(
        ({ pkg, state }) =>
          state.isSelectedToPublish &&
          pkg.podspecName &&
          pkg.isIncludedInExpoClientOnPlatform('ios')
      )
      .map(({ pkg }) => pkg.podspecName) as string[];

    if (podspecNames.length === 0) {
      logger.log(yellow(' >'), 'No iOS pods to update.\n');
      return;
    }

    logger.log(yellow(' >'), 'Updating pods:', podspecNames.map(name => green(name)).join(', '));

    await Utils.spawnAsync('pod', ['update', ...podspecNames, '--no-repo-update'], {
      cwd: IOS_DIR,
      env: process.env,
    });
  }
);

/**
 * Cuts off changelogs - renames unpublished section heading
 * to the new version and adds new unpublished section on top.
 */
export const cutOffChangelogs = new Task<TaskArgs>(
  {
    name: 'cutOffChangelogs',
    dependsOn: [selectPackagesToPublish],
    filesToStage: ['packages/**/CHANGELOG.md'],
  },
  async (fabrics: Fabrics) => {
    const toPublish = fabrics.filter(({ state }) => state.isSelectedToPublish);

    if (toPublish.length === 0) {
      return;
    }

    logger.info('✂️  Cutting off changelogs...');

    for (const { pkg, changelog, state } of toPublish) {
      if (!(await changelog.fileExistsAsync())) {
        logger.log(
          yellow(' >'),
          green.bold(pkg.packageVersion),
          gray(`- skipped, no changelog file.`)
        );
        continue;
      }

      if (state.releaseVersion && !semver.prerelease(state.releaseVersion)) {
        logger.log(yellow(' >'), green.bold(pkg.packageName) + '...');
        await changelog.cutOffAsync(state.releaseVersion);
      } else {
        logger.log(
          yellow(' >'),
          green.bold(pkg.packageVersion),
          gray(`- skipped, it's a prerelease version.`)
        );
      }
    }
  }
);

/**
 * Commits changes made by all previous phases.
 */
export const commitStagedChanges = new Task<TaskArgs>(
  {
    name: 'commitStagedChanges',
    dependsOn: [selectPackagesToPublish],
  },
  async (fabrics: Fabrics, options: CommandOptions) => {
    const toPublish = fabrics.filter(({ state }) => state.isSelectedToPublish);

    logger.info('📼 Committing changes...');

    const commitDescription = toPublish
      .map(({ pkg, state }) => `${pkg.packageName}@${state.releaseVersion}`)
      .join('\n');

    await Git.commitAsync([options.commitMessage, commitDescription]);
  }
);

/**
 * Publishes all packages that have been selected to publish.
 */
export const publishPackages = new Task<TaskArgs>(
  {
    name: 'publishPackages',
    dependsOn: [
      preparePackages,
      selectPackagesToPublish,
      updateVersions,
      updateWorkspaceDependencies,
      updateAndroidProjects,
      updateIosProjects,
      cutOffChangelogs,
      commitStagedChanges,
    ],
  },
  async (fabrics: Fabrics, options: CommandOptions) => {
    const toPublish = fabrics.filter(({ state }) => state.isSelectedToPublish);

    if (toPublish.length === 0) {
      return;
    }

    logger.info('🚀 Publishing packages...');

    for (const { pkg, state } of fabrics) {
      logger.log(
        yellow(' >'),
        `${green(pkg.packageName)}@${cyan(state.releaseVersion!)} as ${yellow(options.tag)}`
      );

      await Npm.publishPackageAsync(pkg.path, options.tag, options.dry);
      state.published = true;
    }

    logger.log();
  }
);

/**
 * Grants package access to the whole team. Applies only when the package
 * wasn't published before or someone from the team is not included in maintainers list.
 */
export const grantTeamAccessToPackages = new Task<TaskArgs>(
  {
    name: 'grantTeamAccessToPackages',
    dependsOn: [preparePackages],
  },
  async (fabrics: Fabrics, options: CommandOptions) => {
    // There is no good way to check whether the package is added to organization team,
    // so let's get all team members and check if they all are declared as maintainers.
    // If they aren't, we grant access for the team. Sounds reasonable?
    const teamMembers = await Npm.getTeamMembersAsync(Npm.EXPO_DEVELOPERS_TEAM_NAME);
    const packagesToGrantAccess = fabrics.filter(
      ({ pkgView, state }) =>
        (pkgView || state.published) && doesSomeoneHaveNoAccessToPackage(teamMembers, pkgView)
    );

    if (packagesToGrantAccess.length === 0) {
      logger.success('🎖  Granting team access not required.');
      return;
    }

    if (!options.dry) {
      logger.info('🎖  Granting team access...');

      for (const { pkg } of packagesToGrantAccess) {
        logger.log(yellow(' >'), green(pkg.packageName));
        await Npm.grantReadWriteAccessAsync(pkg.packageName, Npm.EXPO_DEVELOPERS_TEAM_NAME);
      }
    } else {
      logger.info(
        '🎖  Team access would be granted to',
        packagesToGrantAccess.map(({ pkg }) => green(pkg.packageName)).join(', ')
      );
    }
  }
);

/**
 * Finds packages whose current version is not tagged as `targetTag` command option (defaults to `latest`).
 */
export const findPackagesToPromote = new Task<TaskArgs>(
  {
    name: 'findPackagesToPromote',
  },
  async (fabrics: Fabrics, options: CommandOptions): Promise<void | symbol> => {
    logger.info('👀 Searching for packages to promote...');

    const targetTag = tagFromOptions(options);

    for (const { pkg, pkgView, state } of fabrics) {
      const distTags = pkgView?.['dist-tags'] ?? {};
      const currentVersion = pkg.packageVersion;
      const currentDistTag = distTagForVersion(distTags, currentVersion);
      const versionToReplace = distTags?.[targetTag] ?? null;

      state.distTag = currentDistTag;
      state.versionToReplace = versionToReplace;
      state.canPromote = pkgView ? !!state.distTag && state.distTag !== targetTag : false;
      state.isDegrading = versionToReplace ? semver.lt(currentVersion, versionToReplace) : false;
    }

    if (fabrics.filter(({ state }) => state.canPromote).length === 0) {
      logger.success('\n✅ No packages to promote.\n');
      return Task.STOP;
    }
  }
);

/**
 * Prompts the user to select packages to promote.
 * Packages whose the current version is not assigned to any tags are skipped.
 */
export const selectPackagesToPromote = new Task<TaskArgs>(
  {
    name: 'selectPackagesToPromote',
    dependsOn: [findPackagesToPromote],
  },
  async (fabrics: Fabrics, options: CommandOptions): Promise<void> => {
    logger.info('👉 Selecting packages to promote...\n');

    const targetTag = tagFromOptions(options);
    const toPromote = fabrics.filter(({ state }) => state.canPromote);
    const maxLength = toPromote.reduce((acc, { pkg }) => Math.max(acc, pkg.packageName.length), 0);

    const choices = toPromote.map(({ pkg, state }) => {
      const from = cyan.bold(pkg.packageVersion);
      const to = `${yellow(targetTag)} (${cyan.bold(state.versionToReplace ?? 'none')})`;
      const actionStr = state.isDegrading ? red.bold('degrading') : 'promoting';

      return {
        name: `${green(pkg.packageName.padEnd(maxLength))} ${actionStr} ${from} to ${to}`,
        value: pkg.packageName,
        checked: !state.isDegrading,
      };
    });

    const { selectedPackageNames } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedPackageNames',
        message: 'Which packages do you want to promote?\n',
        choices: [
          // Choices unchecked by default (these being degraded) should be on top.
          // We could sort them, but JS sorting algorithm is unstable :/
          ...choices.filter(choice => !choice.checked),
          ...choices.filter(choice => choice.checked),
        ],
        pageSize: Math.min(15, process.stdout.rows ?? 15),
      },
    ]);

    // Inquirer shows all those selected choices by name and that looks so ugly due to line wrapping.
    // If possible, we clear everything that has been printed after the prompt.
    if (process.stdout.columns) {
      const bufferLength = choices.reduce(
        (acc, choice) => acc + stripAnsi(choice.name).length + 2,
        0
      );
      readline.moveCursor(process.stdout, 0, -Math.ceil(bufferLength / process.stdout.columns));
      readline.clearScreenDown(process.stdout);
    }

    logger.log(yellow(' >'), `Selected ${cyan(selectedPackageNames.length)} packages to promote.`);

    for (const { pkg, state } of fabrics) {
      state.isSelectedToPromote = selectedPackageNames.includes(pkg.packageName);
    }
  }
);

/**
 * Promotes selected packages from the current tag to the tag passed as an option.
 */
export const promotePackages = new Task<TaskArgs>(
  {
    name: 'promotePackages',
    dependsOn: [findPackagesToPromote, selectPackagesToPromote],
  },
  async (fabrics: Fabrics, options: CommandOptions): Promise<void> => {
    const toPromote = fabrics.filter(({ state }) => state.isSelectedToPromote);
    const targetTag = tagFromOptions(options);

    logger.info(`🚀 Promoting packages to ${yellow(targetTag)} tag...`);

    for (const { pkg, state } of toPromote) {
      const currentVersion = pkg.packageVersion;

      logger.log(yellow(' >'), green.bold(pkg.packageName));
      logger.log(yellow('  -'), `Setting ${cyan(currentVersion)} as ${yellow(targetTag)}`);

      await Npm.addTagAsync(pkg.packageName, pkg.packageVersion, targetTag);

      // If the current version had any tag assigned, can we remove this old tag?
      if (state.distTag) {
        logger.log(
          yellow('  -'),
          `Dropping ${yellow(state.distTag)} tag (${cyan(currentVersion)})...`
        );
        await Npm.removeTagAsync(pkg.packageName, state.distTag);
      }
    }

    logger.success(`\n✅ Successfully promoted ${cyan(toPromote.length + '')} packages.`);
  }
);
