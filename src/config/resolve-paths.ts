import path from 'node:path';
import type { EvalConfig } from '../core/types.ts';

export function resolveConfigPaths(config: EvalConfig, baseDir: string): EvalConfig {
  return {
    ...config,
    defaults: config.defaults
      ? {
          ...config.defaults,
          outputDir: config.defaults.outputDir
            ? path.resolve(baseDir, config.defaults.outputDir)
            : undefined,
        }
      : undefined,
    runs: config.runs.map((run) => ({
      ...run,
      outputDir: run.outputDir ? path.resolve(baseDir, run.outputDir) : undefined,
    })),
  };
}
