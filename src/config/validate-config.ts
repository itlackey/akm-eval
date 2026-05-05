import type { EvalConfig, RunDefinition } from '../core/types.ts';
import type { EvalVariant } from '../variants/types.ts';
import { ConfigValidationError } from '../core/errors.ts';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePlannedConfig(value: Record<string, unknown>): EvalConfig {
  const run = value.run as Record<string, unknown>;
  const packs = value.packs as Array<Record<string, unknown>>;
  const variants = value.variants as EvalVariant[];

  const runs: RunDefinition[] = [];
  for (const pack of packs) {
    if (pack.enabled === false) {
      continue;
    }
    for (const variant of variants) {
      runs.push({
        id: `${String(pack.id)}-${variant.id}`,
        pack: String(pack.adapter),
        variant: variant.id,
        outputDir: `${String(run.outputDir)}/${String(pack.id)}/${variant.id}`,
        memoryBackend: variant.memory.backend,
        metadata: {
          packId: String(pack.id),
          adapter: String(pack.adapter),
          configRunId: String(run.id),
        },
      });
    }
  }

  return {
    version: 1,
    defaults: {
      outputDir: String(run.outputDir),
    },
    runs,
  };
}

export function validateConfigShape(value: unknown): asserts value is EvalConfig {
  const issues: string[] = [];

  if (!isPlainObject(value)) {
    throw new ConfigValidationError(['config must be an object']);
  }

  if (value.version !== 1) {
    issues.push('version must be 1');
  }

  if (!Array.isArray(value.runs) || value.runs.length === 0) {
    issues.push('runs must be a non-empty array');
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
}

export function validateConfig(value: unknown): EvalConfig {
  if (!isPlainObject(value)) {
    throw new ConfigValidationError(['config must be an object']);
  }

  if (value.schemaVersion === 'akm.eval.config.v1') {
    const issues: string[] = [];
    if (!isPlainObject(value.run)) {
      issues.push('run must be an object');
    }
    if (!Array.isArray(value.packs) || value.packs.length === 0) {
      issues.push('packs must be a non-empty array');
    }
    if (!Array.isArray(value.variants) || value.variants.length === 0) {
      issues.push('variants must be a non-empty array');
    }
    if (issues.length > 0) {
      throw new ConfigValidationError(issues);
    }
    return normalizePlannedConfig(value);
  }

  validateConfigShape(value);
  return value;
}
