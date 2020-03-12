import { spawnJSONCommandAsync } from './Utils';

type WorkspaceInfo = {
  location: string;
  workspaceDependencies: string[];
  mismatchedWorkspaceDependencies: string[];
};

export async function getInfoAsync(): Promise<WorkspaceInfo> {
  const info = await spawnJSONCommandAsync('yarn', ['workspaces', 'info', '--json']);
  return JSON.parse(info.data);
}
