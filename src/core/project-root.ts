import path from 'node:path';

const DEFAULT_PROJECT_ROOT = path.resolve(import.meta.dir, '..', '..');

export function getProjectRoot(): string {
  const configuredRoot = process.env.AKM_EVAL_PROJECT_ROOT;
  return configuredRoot && configuredRoot.trim().length > 0
    ? path.resolve(configuredRoot)
    : DEFAULT_PROJECT_ROOT;
}
