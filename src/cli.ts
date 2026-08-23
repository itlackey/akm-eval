import fs from 'node:fs';
import path from 'node:path';
import { createAgentRunner } from './agent/factory.ts';
import type { AgentRunner } from './agent/types.ts';
import { loadConfig } from './config/load-config.ts';
import { runDoctorChecks } from './core/environment.ts';
import { createRunContext } from './core/run-context.ts';
import { createUsageLines, normalizeCliArgs } from './cli-entry.ts';
import { runDownloadsCommand } from './downloads.ts';
import {
  createMemoryBackend,
  getMemoryBackendStatus,
  listBlockedMemoryBackends,
  listEvaluatedMemoryBackends,
  listMemoryBackends,
} from './memory/registry.ts';
import { packRegistry, resolvePack } from './packs/registry/index.ts';
import { compareResults } from './reporting/compare.ts';
import { toPrettyJson } from './reporting/json.ts';
import { markdownReportForComparison, markdownReportForResult } from './reporting/markdown.ts';
import { loadNormalizedResult } from './reporting/normalized-result.ts';
import { renderRunMatrix } from './reporting/matrix.ts';
import { collectRunSummaries, markdownSummaryForRuns } from './reporting/summary.ts';
import { variantRegistry } from './variants/registry.ts';
import { resolveVariant } from './variants/resolve-variant.ts';
import { getProjectRoot } from './core/project-root.ts';

interface ResolvedExecution {
  rootDir: string;
  configPath: string;
  config: ReturnType<typeof loadConfig>;
  selectedRun: NonNullable<ReturnType<typeof resolveSelectedRun>['selectedRun']>;
  pack: ReturnType<typeof resolvePack>;
  agentRunner?: AgentRunner;
  context: ReturnType<typeof createRunContext>;
}

function usage(): string {
  return createUsageLines().join('\n');
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function resolveSelectedRun(args: string[]) {
  const rootDir = getProjectRoot();
  const configPath = valueAfter(args, '--config') ?? path.resolve(rootDir, 'config/examples/memory-comparison.json');
  const config = loadConfig(configPath);
  const runId = valueAfter(args, '--run-id');
  const packId = valueAfter(args, '--pack');
  const variantId = valueAfter(args, '--variant');
  const outDir = valueAfter(args, '--out');
  const selectedRun = runId
    ? config.runs.find((entry) => (entry.id ?? `${entry.pack}-${entry.variant}`) === runId)
    : packId && variantId
      ? config.runs.find(
          (entry) =>
            (entry.metadata?.packId === packId || entry.pack === packId) &&
            entry.variant === variantId,
        )
      : config.runs[0];

  return {
    rootDir,
    configPath,
    config,
    outDir,
    selectedRun,
  };
}

function resolveExecution(args: string[]): ResolvedExecution {
  const { rootDir, configPath, config, outDir, selectedRun } = resolveSelectedRun(args);
  if (!selectedRun) {
    const packId = valueAfter(args, '--pack');
    const variantId = valueAfter(args, '--variant');
    const runId = valueAfter(args, '--run-id');
    throw new Error(`Run not found: ${runId ?? `${packId ?? ''}/${variantId ?? ''}`}`);
  }

  resolveVariant(selectedRun.variant);
  const pack = resolvePack(selectedRun.pack);

  let agentRunner: AgentRunner | undefined;
  if (selectedRun.agentProviderConfig) {
    const model = selectedRun.agentModel ?? selectedRun.agentProviderConfig.defaultModel ?? '';
    if (!model) {
      throw new Error(
        `No model specified for run "${selectedRun.id ?? `${selectedRun.pack}-${selectedRun.variant}`}". Set agent.model or provider.defaultModel.`,
      );
    }
    agentRunner = createAgentRunner(selectedRun.agentProviderConfig.type, selectedRun.agentProviderConfig, model);
  }

  const context = createRunContext(
    rootDir,
    config,
    {
      ...selectedRun,
      outputDir: outDir ?? selectedRun.outputDir,
    },
    agentRunner,
  );

  return {
    rootDir,
    configPath,
    config,
    selectedRun,
    pack,
    agentRunner,
    context,
  };
}

async function doctor(args: string[]): Promise<number> {
  const rootDir = getProjectRoot();
  const packId = valueAfter(args, '--pack');
  if (packId) {
    resolvePack(packId);
  }

  const checks = runDoctorChecks(rootDir, { packId });
  for (const check of checks) {
    console.log(`${check.status.toUpperCase()} ${check.name}: ${check.detail}`);
  }
  if (packId) {
    return 0;
  }
  console.log(`Available memory backends: ${listMemoryBackends().join(', ')}`);
  console.log(`Truthful evaluated memory backends: ${listEvaluatedMemoryBackends().join(', ')}`);
  console.log(`Blocked/planned memory backends: ${listBlockedMemoryBackends().join(', ')}`);
  return 0;
}

function listPacks(): number {
  for (const pack of packRegistry) {
    console.log(`${pack.id}\t${pack.description}`);
  }
  return 0;
}

function listVariants(): number {
  for (const variant of variantRegistry) {
    console.log(`${variant.id}\t${variant.description}`);
  }
  return 0;
}

async function runCommand(args: string[]): Promise<number> {
  const { rootDir, config, selectedRun, pack, agentRunner, context } = resolveExecution(args);
  const memoryBackendId = selectedRun.memoryBackend ?? config.defaults?.memoryBackend ?? 'none';
  const memoryBackendStatus = getMemoryBackendStatus(memoryBackendId, rootDir);
  if (!memoryBackendStatus.evaluated) {
    throw new Error(
      `Run "${selectedRun.id ?? `${selectedRun.pack}-${selectedRun.variant}`}" selects memory backend "${memoryBackendId}", ` +
        `but this backend is not a truthful evaluated benchmark path in this repo yet. ${memoryBackendStatus.detail}`,
    );
  }

  // The akm backend uses `workDir` as a per-instance hermetic root for its
  // AKM_* directories; every other backend ignores the extra argument. Nest
  // it under the run's own output dir so it is unique per run and cleaned up
  // alongside the run's artifacts.
  const memoryBackend = createMemoryBackend(memoryBackendId, rootDir, path.join(context.outputDir, '.akm-memory'));
  const result = await pack.run(context, memoryBackend, agentRunner);
  process.stdout.write(toPrettyJson(result));
  return 0;
}

function matrixCommand(args: string[]): number {
  const rootDir = getProjectRoot();
  const configPath =
    valueAfter(args, '--config') ?? path.resolve(rootDir, 'config/examples/memory-comparison.json');
  const config = loadConfig(configPath);
  process.stdout.write(renderRunMatrix(config));
  return 0;
}

function compareCommand(args: string[]): number {
  const format = valueAfter(args, '--format') ?? 'markdown';
  const baselinePath = valueAfter(args, '--baseline');
  const candidatePath = valueAfter(args, '--candidate');
  const outPath = valueAfter(args, '--out');
  if (!baselinePath || !candidatePath) {
    throw new Error('compare requires baseline and candidate result folders');
  }

  const report = compareResults(loadNormalizedResult(baselinePath), loadNormalizedResult(candidatePath));
  const output = format === 'json' ? toPrettyJson(report) : markdownReportForComparison(report);
  if (outPath) {
    const resolvedOut = path.resolve(outPath);
    fs.mkdirSync(path.dirname(resolvedOut), { recursive: true });
    fs.writeFileSync(resolvedOut, `${output}\n`, 'utf8');
  } else {
    process.stdout.write(`${output}\n`);
  }
  return 0;
}

function reportCommand(args: string[]): number {
  const format = valueAfter(args, '--format') ?? 'markdown';
  const resultPath = valueAfter(args, '--run') ?? args[0];
  if (!resultPath) {
    throw new Error('report requires a result folder');
  }

  const result = loadNormalizedResult(resultPath);
  process.stdout.write(format === 'json' ? toPrettyJson(result) : `${markdownReportForResult(result)}\n`);
  return 0;
}

function summaryCommand(args: string[]): number {
  const format = valueAfter(args, '--format') ?? 'markdown';
  const runsPath = valueAfter(args, '--runs') ?? args[0];
  if (!runsPath) {
    throw new Error('summary requires a runs directory');
  }

  const output = format === 'json' ? toPrettyJson(collectRunSummaries(runsPath)) : `${markdownSummaryForRuns(runsPath)}\n`;
  process.stdout.write(output);
  return 0;
}

export async function main(): Promise<number> {
  const args = normalizeCliArgs(process.argv);
  if (args.length === 0) {
    console.log(usage());
    return 1;
  }

  const [command, subcommand] = args;

  try {
    if (command === 'doctor') {
      return await doctor(args.slice(1));
    }

    if (command === 'list' && subcommand === 'packs') {
      return listPacks();
    }

    if (command === 'list' && subcommand === 'variants') {
      return listVariants();
    }

    if (command === 'run') {
      return await runCommand(args.slice(1));
    }

    if (command === 'matrix') {
      return matrixCommand(args.slice(1));
    }

    if (command === 'compare') {
      return compareCommand(args.slice(1));
    }

    if (command === 'report') {
      return reportCommand(args.slice(1));
    }

    if (command === 'summary') {
      return summaryCommand(args.slice(1));
    }

    if (command === 'downloads') {
      return await runDownloadsCommand(args.slice(1));
    }

    console.log(usage());
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    return 1;
  }
}

if (import.meta.main) {
  main().then((code) => process.exit(code));
}
