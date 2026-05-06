import type { AgentProviderConfig, EvalConfig, RunDefinition } from '../core/types.ts';
import type { EvalVariant } from '../variants/types.ts';
import { ConfigValidationError } from '../core/errors.ts';

const PACKS_REQUIRING_REAL_AGENT = new Set(['longmemeval', 'terminal-bench', 'swe-bench', 'tau-bench', 'beam', 'locomo', 'akm-bench']);
const OFFICIAL_SWE_BENCH_DATASET_ALIASES = new Set([
  'swe-bench',
  'swebench',
  'swe_bench',
  'swe-bench-lite',
  'swebench-lite',
  'swe_bench_lite',
  'swe-bench_lite',
  'lite',
  'swe-bench-verified',
  'swebench-verified',
  'swe_bench_verified',
  'swe-bench_verified',
  'verified',
]);

function isOfficialSweBenchDatasetName(value: string): boolean {
  return value.startsWith('SWE-bench/') || OFFICIAL_SWE_BENCH_DATASET_ALIASES.has(value.toLowerCase());
}

function validateRunDefinitions(runs: RunDefinition[]): void {
  const issues: string[] = [];

  for (const run of runs) {
    if (PACKS_REQUIRING_REAL_AGENT.has(run.pack) && !run.agentProviderConfig) {
      issues.push(
        `run "${run.id ?? `${run.pack}-${run.variant}`}" uses pack "${run.pack}" but has no real agent provider configured; use a real model-backed baseline instead of provider:none`,
      );
    }

    if (run.agentProviderConfig?.type === 'opencode') {
      const model = run.agentModel ?? run.agentProviderConfig.defaultModel;
      if (model && !model.includes('/')) {
        issues.push(
          `run "${run.id ?? `${run.pack}-${run.variant}`}" uses opencode with model "${model}". Opencode models must include the provider prefix, for example "opencode/gpt-4.1-mini".`,
        );
      }
    }

    if (run.pack === 'longmemeval') {
      const evaluatorCommand = run.packConfig?.evaluatorCommand;
      if (typeof evaluatorCommand !== 'string' || evaluatorCommand.trim().length === 0) {
        issues.push(
          `run "${run.id ?? `${run.pack}-${run.variant}`}" uses longmemeval but is missing pack.config.evaluatorCommand for the official evaluator`,
        );
      }
    }

    if (run.pack === 'locomo') {
      const maxContextTokens = run.packConfig?.maxContextTokens;
      if (maxContextTokens !== undefined && (typeof maxContextTokens !== 'number' || maxContextTokens <= 0)) {
        issues.push(
          `run "${run.id ?? `${run.pack}-${run.variant}`}" uses locomo but pack.config.maxContextTokens must be a positive number when provided`,
        );
      }
    }

    if (run.pack === 'swe-bench') {
      const datasetName = run.packConfig?.datasetName;
      if (typeof datasetName === 'string' && !isOfficialSweBenchDatasetName(datasetName)) {
        issues.push(
          `run "${run.id ?? `${run.pack}-${run.variant}`}" uses swe-bench with datasetName ${JSON.stringify(datasetName)}, but swe-bench only accepts official dataset identifiers`,
        );
      }
    }

    if (run.pack === 'beam') {
      const evaluatorModel = run.packConfig?.evaluatorModel;
      if (evaluatorModel !== undefined && (typeof evaluatorModel !== 'string' || evaluatorModel.trim().length === 0)) {
        issues.push(
          `run "${run.id ?? `${run.pack}-${run.variant}`}" uses beam but pack.config.evaluatorModel must be a non-empty string when provided`,
        );
      }
    }
  }

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveEnvRefsInProvider(config: AgentProviderConfig): AgentProviderConfig {
  const resolved: AgentProviderConfig = { ...config };
  if (resolved.apiKey) {
    resolved.apiKey = resolved.apiKey.replace(/\{env:([A-Z_][A-Z0-9_]*)\}/g, (_m, name) => process.env[name] ?? '');
  }
  return resolved;
}

function normalizePlannedConfig(value: Record<string, unknown>): EvalConfig {
  const run = value.run as Record<string, unknown>;
  const packs = value.packs as Array<Record<string, unknown>>;
  const variants = value.variants as EvalVariant[];
  const providers = value.providers as Record<string, AgentProviderConfig> | undefined;

  const resolvedProviders = providers
    ? Object.fromEntries(Object.entries(providers).map(([k, v]) => [k, resolveEnvRefsInProvider(v)]))
    : undefined;

  const runs: RunDefinition[] = [];
  for (const pack of packs) {
    if (pack.enabled === false) {
      continue;
    }
    for (const variant of variants) {
      let agentProvider: string | undefined;
      let agentProviderConfig: AgentProviderConfig | undefined;

      if (variant.agent.provider !== 'none') {
        if (variant.agent.providerRef) {
          if (!resolvedProviders || !(variant.agent.providerRef in resolvedProviders)) {
            throw new ConfigValidationError([
              `variant "${variant.id}" references unknown provider "${variant.agent.providerRef}"`,
            ]);
          }
          agentProvider = variant.agent.providerRef;
          agentProviderConfig = resolvedProviders[variant.agent.providerRef];
        } else if (resolvedProviders && Object.keys(resolvedProviders).length > 0) {
          const firstKey = Object.keys(resolvedProviders)[0];
          agentProvider = firstKey;
          agentProviderConfig = resolvedProviders[firstKey];
        }
      }

      runs.push({
        id: `${String(pack.id)}-${variant.id}`,
        pack: String(pack.adapter),
        variant: variant.id,
        outputDir: `${String(run.outputDir)}/${String(pack.id)}/${variant.id}`,
        memoryBackend: variant.memory.backend,
        agentEnvironment:
          variant.agent.env && typeof variant.agent.env === 'object'
            ? Object.fromEntries(
                Object.entries(variant.agent.env).filter(
                  (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
                ),
              )
            : undefined,
        akmEnabled: variant.akm.enabled,
        akmCommand: variant.akm.command,
        akmEnvironment:
          variant.akm.env && typeof variant.akm.env === 'object'
            ? Object.fromEntries(
                Object.entries(variant.akm.env).filter(
                  (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string',
                ),
              )
            : undefined,
        akmConfigPath: variant.akm.configPath,
        agentModel: variant.agent?.model,
        agentProvider,
        agentProviderConfig,
        packConfig: isPlainObject(pack.config) ? (pack.config as Record<string, unknown>) : undefined,
        metadata: {
          packId: String(pack.id),
          adapter: String(pack.adapter),
          configRunId: String(run.id),
        },
      });
    }
  }

  const normalized: EvalConfig = {
    version: 1,
    defaults: {
      outputDir: String(run.outputDir),
    },
    runs,
    ...(resolvedProviders ? { providers: resolvedProviders } : {}),
  };

  validateRunDefinitions(normalized.runs);
  return normalized;
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

  validateRunDefinitions(value.runs as RunDefinition[]);
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

  // Resolve env refs in providers for direct configs too
  if (isPlainObject(value.providers)) {
    const resolved = Object.fromEntries(
      Object.entries(value.providers as Record<string, AgentProviderConfig>).map(([k, v]) => [
        k,
        resolveEnvRefsInProvider(v),
      ]),
    );
    value.providers = resolved;
  }

  const config = value as EvalConfig;
  validateRunDefinitions(config.runs);
  return config;
}
