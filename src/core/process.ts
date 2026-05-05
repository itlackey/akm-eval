import { spawnSync } from 'node:child_process';

export interface ProcessResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export function runProcess(command: string, args: string[], cwd: string): ProcessResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    success: result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status,
  };
}
