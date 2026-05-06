import path from 'node:path';
import type { AgentRunner } from '../agent/types.ts';
import { runProcess } from './process.ts';
import type { EvalConfig, RunDefinition } from './types.ts';

export interface RunContext {
  rootDir: string;
  config: EvalConfig;
  run: RunDefinition;
  runId: string;
  outputDir: string;
  startedAt: Date;
  agentRunner?: AgentRunner;
}

function hasOwnMetadataKey(metadata: Record<string, string | number | boolean | null>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(metadata, key);
}

function detectRepoCommit(rootDir: string): string | null {
  const result = runProcess('git', ['rev-parse', 'HEAD'], rootDir);
  if (!result.success) {
    return null;
  }

  const commit = result.stdout.trim().split('\n')[0]?.trim();
  return commit ? commit : null;
}

function withDerivedRunMetadata(rootDir: string, run: RunDefinition): RunDefinition {
  const metadata = { ...(run.metadata ?? {}) };

  if (!hasOwnMetadataKey(metadata, 'repoCommit')) {
    const repoCommit = detectRepoCommit(rootDir);
    if (repoCommit) {
      metadata.repoCommit = repoCommit;
    }
  }

  if (!hasOwnMetadataKey(metadata, 'runnerType')) {
    const runnerType = run.agentProviderConfig?.type ?? run.agentProvider;
    if (runnerType) {
      metadata.runnerType = runnerType;
    }
  }

  return {
    ...run,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function createRunContext(rootDir: string, config: EvalConfig, run: RunDefinition, agentRunner?: AgentRunner): RunContext {
  const normalizedRun = withDerivedRunMetadata(rootDir, run);
  const runId = normalizedRun.id ?? `${normalizedRun.pack}-${normalizedRun.variant}`;
  const outputBase = normalizedRun.outputDir ?? (config.defaults?.outputDir ? path.resolve(config.defaults.outputDir, runId) : `runs/${runId}`);
  const outputDir = path.resolve(rootDir, outputBase);

  return {
    rootDir,
    config,
    run: normalizedRun,
    runId,
    outputDir,
    startedAt: new Date(),
    agentRunner,
  };
}
