export function createLogBuffer(lines: string[]): string[] {
  return lines.map((line) => `[akm-eval] ${line}`);
}
