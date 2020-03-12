import path from 'path';

import { EXPOTOOLS_DIR } from '../Constants';

/**
 *
 */
export const BACKUP_FILE_NAME = '.publish-packages.backup.json';

/**
 *
 */
export const BACKUP_PATH = path.join(EXPOTOOLS_DIR, BACKUP_FILE_NAME);

/**
 *
 */
export const BACKUP_EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes

/**
 * An array of directories treated as containing native code.
 */
export const NATIVE_DIRECTORIES = ['ios', 'android'];

/**
 * An array of option names that are stored in the backup and
 * are required to stay the same to use the backup at next call.
 */
export const BACKUPABLE_OPTIONS_FIELDS = [
  'packageNames',
  'exclude',
  'prerelease',
  'commitMessage',
  'dry',
] as const;
