import path from 'node:path';
import type { AgentRunner } from '../agent/types.ts';
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

export function createRunContext(rootDir: string, config: EvalConfig, run: RunDefinition, agentRunner?: AgentRunner): RunContext {
  const runId = run.id ?? `${run.pack}-${run.variant}`;
  const outputBase = run.outputDir ?? (config.defaults?.outputDir ? path.resolve(config.defaults.outputDir, runId) : `runs/${runId}`);
  const outputDir = path.resolve(rootDir, outputBase);

  return {
    rootDir,
    config,
    run,
    runId,
    outputDir,
    startedAt: new Date(),
    agentRunner,
  };
}
