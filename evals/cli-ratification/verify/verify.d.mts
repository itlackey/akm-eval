export interface Settings {
  root: string;
  cmd: string;
  akmRoot: string;
  logs: string;
  env: Record<string, string>;
}
export interface Result {
  reward: 0 | 1;
  checks: Record<string, { ok: boolean; detail: string }>;
  report: { present: boolean; bytes: number };
}
export function settings(root?: string, cmd?: string): Settings;
export function verify(expectedFile: string, config?: Settings): Result;
