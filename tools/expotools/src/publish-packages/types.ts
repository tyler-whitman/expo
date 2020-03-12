import { Changelog, ChangelogChanges } from '../Changelogs';
import { GitLog, GitFileLog, GitDirectory } from '../Git';
import { PackageViewType } from '../Npm';
import { Package } from '../Packages';
import { BACKUPABLE_OPTIONS_FIELDS } from './constants';

/**
 * Command's options.
 */
export type CommandOptions = {
  packageNames: string[];
  prerelease: boolean | string;
  exclude: string[];
  tag: string;
  retry: boolean;
  commitMessage: string;
  excludeDeps: boolean;
  skipRepoChecks: boolean;
  dry: boolean;

  /* exclusive options that affect what the command does */
  listUnpublished: boolean;
  promote: boolean | string;
  backport: boolean | string;
  grantAccess: boolean;
};

/**
 * CommandOptions without options that aren't backupable or just don't matter when restoring a backup.
 */
export type BackupableOptions = Pick<CommandOptions, typeof BACKUPABLE_OPTIONS_FIELDS[number]>;

/**
 * Represents command's backup data.
 */
export type PublishBackupData = {
  head: string;
  options: BackupableOptions;
  state: {
    [key: string]: PackageState;
  };
};

export type PublishState = {
  hasUnpublishedChanges?: boolean;
  isSelectedToPublish?: boolean;
  changelogChanges?: ChangelogChanges;
  integral?: boolean;
  logs?: PackageGitLogs;
  releaseType?: ReleaseType;
  releaseVersion?: string | null;
  published?: boolean;
};

export type PromoteState = {
  distTag?: string | null;
  versionToReplace?: string | null;
  canPromote?: boolean;
  isDegrading?: boolean;
  isSelectedToPromote?: boolean;
};

export type PackageState = PublishState & PromoteState;

/**
 * Type of objects that are being passed through command's tasks.
 * It's kind of a wrapper for all data related to the package.
 */
export type PackageFabric<State = PackageState> = {
  /**
   * Package instance that stores `package.json` object and some other useful data.
   */
  pkg: Package;

  /**
   * JSON object representing the result of `npm view` command run for the package.
   * Can be `null` if package is not published yet.
   */
  pkgView: PackageViewType | null;

  /**
   * Changelog instance that can read and modify package changelog.
   */
  changelog: Changelog;

  /**
   * Instance of GitDirectory that runs all git commands from package root directory.
   */
  gitDir: GitDirectory;

  /**
   * Lists of fabrics whose package depends on this one.
   */
  dependents: PackageFabric<State>[] | null;

  /**
   * Command's tasks should put their results in this object.
   * It's being serialized and saved in the backup after each task.
   */
  state: State;
};

/**
 * Shorthand form for an array of package fabrics.
 */
export type Fabrics<State = PackageState> = PackageFabric<State>[];

/**
 * Array type representing arguments passed to the tasks.
 */
export type TaskArgs = [Fabrics, CommandOptions];

/**
 * Enum of possible release types. It must be in sync with `semver.ReleaseType` union options.
 */
export enum ReleaseType {
  MAJOR = 'major',
  MINOR = 'minor',
  PATCH = 'patch',
  PREMAJOR = 'premajor',
  PREMINOR = 'preminor',
  PREPATCH = 'prepatch',
  PRERELEASE = 'prerelease',
}

/**
 * Type of the action. Certain command options may affect the action type.
 */
export enum ActionType {
  PUBLISH = 'publish',
  LIST = 'list',
  PROMOTE = 'promote',
  BACKPORT = 'backport',
}

/**
 * Object containing git logs. `null` if logs couldn't be resolved due to corrupted package data.
 */
export type PackageGitLogs = null | {
  commits: GitLog[];
  files: GitFileLog[];
};
