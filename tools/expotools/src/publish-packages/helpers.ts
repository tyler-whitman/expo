import chalk from 'chalk';
import { pick } from 'lodash';
import semver from 'semver';

import * as Changelogs from '../Changelogs';
import * as Formatter from '../Formatter';
import Git, { GitFileLog } from '../Git';
import logger from '../Logger';
import * as Npm from '../Npm';
import { Package } from '../Packages';
import { BACKUPABLE_OPTIONS_FIELDS, NATIVE_DIRECTORIES } from './constants';
import { BackupableOptions, CommandOptions, Fabrics, PackageFabric, ReleaseType } from './types';

const { green, yellow, cyan, magenta } = chalk;

/**
 * Returns options that are capable of being backed up.
 * We will need just a few options to determine whether the backup is valid
 * and we can't pass them all because `options` is in fact commander's `Command` instance.
 */
export function pickBackupableOptions(options: CommandOptions): BackupableOptions {
  return pick(options, BACKUPABLE_OPTIONS_FIELDS);
}

/**
 * Returns suggested release type. Its result maps to one of `semver.ReleaseType` value.
 */
export function getSuggestedReleaseType(fabric: PackageFabric, prerelease?: string): ReleaseType {
  const { pkg, state } = fabric;
  const { logs, changelogChanges } = state;

  if (semver.prerelease(pkg.packageVersion)) {
    return ReleaseType.PRERELEASE;
  }
  const unpublishedChanges = changelogChanges?.versions.unpublished;
  const hasBreakingChanges = unpublishedChanges?.[Changelogs.ChangeType.BREAKING_CHANGES]?.length;
  const hasNativeChanges = logs && fileLogsContainNativeChanges(logs.files);

  const releaseType = hasBreakingChanges
    ? ReleaseType.MAJOR
    : hasNativeChanges
    ? ReleaseType.MINOR
    : ReleaseType.PATCH;

  if (prerelease) {
    return ('pre' + releaseType) as ReleaseType;
  }
  return releaseType;
}

/**
 * Returns prerelease identifier of given version or `null` if given version is not a prerelease version.
 * `semver.prerelease` returns an array of prerelease parts (`1.0.0-beta.0` results in `['beta', 0]`),
 * however we just need the identifier.
 */
export function getPrereleaseIdentifier(version: string): string | null {
  const prerelease = semver.prerelease(version);
  return Array.isArray(prerelease) && typeof prerelease[0] === 'string' ? prerelease[0] : null;
}

/**
 * Returns suggested version based on given current version, already published versions and suggested release type.
 */
export function resolveSuggestedVersion(
  versionToBump: string,
  otherVersions: string[],
  releaseType: ReleaseType,
  prereleaseIdentifier?: string | null
): string {
  const targetPrereleaseIdentifier = prereleaseIdentifier ?? getPrereleaseIdentifier(versionToBump);

  // Higher version might have already been published from another place,
  // so get the highest published version that satisfies release type.
  const highestSatisfyingVersion = otherVersions
    .filter(version => {
      return (
        semver.gt(version, versionToBump) &&
        semver.diff(version, versionToBump) === releaseType &&
        getPrereleaseIdentifier(version) === targetPrereleaseIdentifier
      );
    })
    .sort(semver.rcompare)[0];

  return semver.inc(
    highestSatisfyingVersion ?? versionToBump,
    releaseType,
    targetPrereleaseIdentifier
  ) as string;
}

/**
 * Determines whether git file logs contain any changes in directories with native code.
 */
export function fileLogsContainNativeChanges(fileLogs: GitFileLog[]): boolean {
  return fileLogs.some(fileLog => {
    return NATIVE_DIRECTORIES.some(dir => fileLog.relativePath.startsWith(`${dir}/`));
  });
}

/**
 * Wraps `Package` object into a fabric - convenient wrapper providing more package-related helpers.
 */
export async function createFabricAsync(pkg: Package): Promise<PackageFabric> {
  const pkgView = await Npm.getPackageViewAsync(pkg.packageName, pkg.packageVersion);
  const changelog = Changelogs.loadFrom(pkg.changelogPath);
  const gitDir = new Git.Directory(pkg.path);

  return {
    pkg,
    pkgView,
    changelog,
    gitDir,
    dependents: null,
    state: {},
  };
}

/**
 * Recursively resolves dependents for every chosen package.
 */
export async function recursivelyResolveDependentsAsync(
  allPackagesObject: { [key: string]: Package },
  fabricsObject: { [key: string]: PackageFabric },
  fabrics: Fabrics
): Promise<void> {
  const newFabrics: Fabrics = [];

  await Promise.all(
    fabrics.map(fabric => {
      const dependencies = fabric.pkg.getDependencies().filter(dependency => {
        return dependency.versionRange !== '*' && allPackagesObject[dependency.name];
      });

      return Promise.all(
        dependencies.map(async ({ name }) => {
          const dependencyPkg = allPackagesObject[name];
          let dependencyFabric = fabricsObject[name];

          // If a fabric for this dependency doesn't exist yet, let's create it.
          if (!dependencyFabric) {
            dependencyFabric = await createFabricAsync(dependencyPkg);
            fabricsObject[name] = dependencyFabric;
            newFabrics.push(dependencyFabric);
          }

          dependencyFabric.dependents = dependencyFabric.dependents ?? [];
          dependencyFabric.dependents.push(fabric);
        })
      );
    })
  );

  if (newFabrics.length > 0) {
    await recursivelyResolveDependentsAsync(allPackagesObject, fabricsObject, newFabrics);
    fabrics.push(...newFabrics);
  }
}

/**
 * Prints gathered crucial informations about the package.
 */
export function printPackageFabric(fabric: PackageFabric): void {
  const { pkg, pkgView, state, dependents } = fabric;
  const { logs, changelogChanges, releaseType, releaseVersion } = state;
  const gitHead = pkg.packageJson.gitHead;

  logger.log(
    '📦',
    `${green.bold(pkg.packageName)},`,
    `version ${cyan.bold(pkg.packageVersion)},`,
    pkgView ? `published from ${Formatter.formatCommitHash(gitHead)}` : 'not published yet'
  );

  if (!pkgView) {
    logger.log(yellow(' >'), `version ${cyan.bold(pkg.packageVersion)} hasn't been published yet.`);
  } else if (!logs) {
    logger.warn(" > We couldn't determine new commits for this package.");

    if (pkg.packageJson.gitHead) {
      // There are no logs and `gitHead` is there, so probably it's unreachable.
      logger.warn(' > Git head of its current version is not reachable from this branch.');
    } else {
      logger.warn(" > It doesn't seem to be published by this script yet.");
    }
  }

  if (dependents) {
    logger.log(yellow(' >'), magenta('Package is a dependency of other suggested packages:'));

    dependents.forEach(dependent => {
      logger.log(yellow('   -'), green(dependent.pkg.packageName));
    });
  }
  if (logs && logs.commits.length > 0) {
    logger.log(yellow(' >'), magenta('New commits:'));

    logs.commits.forEach(commitLog => {
      logger.log(yellow('   -'), Formatter.formatCommitLog(commitLog));
    });
  }
  if (logs && logs.files.length > 0) {
    logger.log(yellow(' >'), magenta('File changes:'));

    logs.files.forEach(fileLog => {
      logger.log(yellow('   -'), Formatter.formatFileLog(fileLog));
    });
  }

  const unpublishedChanges =
    changelogChanges?.versions.unpublished ?? changelogChanges?.versions.master ?? {};

  for (const changeType in unpublishedChanges) {
    const changes = unpublishedChanges[changeType];

    if (changes.length > 0) {
      logger.log(yellow(' >'), magenta(`${Formatter.stripNonAsciiChars(changeType).trim()}:`));

      for (const change of unpublishedChanges[changeType]) {
        logger.log(yellow('   -'), Formatter.formatChangelogEntry(change));
      }
    }
  }

  if (releaseType && releaseVersion) {
    const version = pkg.packageVersion;

    logger.log(
      yellow(' >'),
      magenta(
        `Suggested ${cyan.bold(releaseType)} upgrade from ${cyan.bold(version)} to ${cyan.bold(
          releaseVersion
        )}`
      )
    );
  }

  logger.log();
}

/**
 * Returns boolean value determining if someone from given users list is not a maintainer of the package.
 */
export function doesSomeoneHaveNoAccessToPackage(
  users: string[],
  pkgView?: Npm.PackageViewType | null
): boolean {
  if (!pkgView) {
    return true;
  }
  // Maintainers array has items of shape: "username <user@domain.com>" so we strip everything after whitespace.
  const maintainers = pkgView.maintainers.map(maintainer => maintainer.replace(/^(.+)\s.*$/, '$1'));
  return users.every(user => maintainers.includes(user));
}

/**
 * Iterates through dist tags returned by npm to determine the tag to which given version is bound.
 */
export function distTagForVersion(
  distTags: { [tag: string]: string },
  version: string
): string | null {
  for (const tag in distTags) {
    if (distTags[tag] === version) {
      return tag;
    }
  }
  return null;
}

/**
 * Returns a string passed as `promote` option or falls back to `latest`.
 */
export function tagFromOptions(options: CommandOptions): string {
  return typeof options.promote === 'string' ? options.promote : 'latest';
}
