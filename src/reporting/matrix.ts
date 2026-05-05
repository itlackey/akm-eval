import type { EvalConfig } from '../core/types.ts';

export function renderRunMatrix(config: EvalConfig): string {
  const lines = [
    '| Run ID | Pack | Variant | Memory |',
    '| --- | --- | --- | --- |',
  ];

  for (const run of config.runs) {
    lines.push(
      `| ${run.id ?? `${run.pack}-${run.variant}`} | ${run.pack} | ${run.variant} | ${run.memoryBackend ?? config.defaults?.memoryBackend ?? 'none'} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}
