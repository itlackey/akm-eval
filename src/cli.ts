import fs from 'node:fs';
import path from 'node:path';
import { requireAgentRunner } from './packs/runtime-requirements.ts';
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
import { runSetupCommand } from './setup.ts';
import { variantRegistry } from './variants/registry.ts';
import { resolveVariant } from './variants/resolve-variant.ts';
import { getProjectRoot } from './core/project-root.ts';
import {
  buildAgentPrompt as buildSweBenchAgentPrompt,
  finalizeSweBenchRun,
  inspectSweBenchRuntime,
  loadDatasetSlice as loadSweBenchDatasetSlice,
  modelNameForHarness as sweBenchModelNameForHarness,
  resolvePackConfig as resolveSweBenchPackConfig,
  sanitizePatch,
  validateUnifiedDiff,
} from './packs/swe-bench/adapter.ts';

interface ResolvedExecution {
  rootDir: string;
  configPath: string;
  config: ReturnType<typeof loadConfig>;
  selectedRun: NonNullable<ReturnType<typeof resolveSelectedRun>>;
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

  const memoryBackend = createMemoryBackend(memoryBackendId, rootDir);
  const result = await pack.run(context, memoryBackend, agentRunner);
  process.stdout.write(toPrettyJson(result));
  return 0;
}

async function internalSweBenchPrepare(args: string[]): Promise<number> {
  const datasetSlicePath = valueAfter(args, '--dataset-slice');
  if (!datasetSlicePath) {
    throw new Error('internal swe-bench-prepare requires --dataset-slice <path>');
  }
  const { rootDir, config, selectedRun, context, agentRunner } = resolveExecution(args);
  if (selectedRun.pack !== 'swe-bench') {
    throw new Error(`internal swe-bench prepare expected pack swe-bench, received ${selectedRun.pack}`);
  }

  const memoryBackendId = selectedRun.memoryBackend ?? config.defaults?.memoryBackend ?? 'none';
  const memoryBackendStatus = getMemoryBackendStatus(memoryBackendId, rootDir);
  if (!memoryBackendStatus.evaluated) {
    throw new Error(
      `Run "${selectedRun.id ?? `${selectedRun.pack}-${selectedRun.variant}`}" selects memory backend "${memoryBackendId}", ` +
        `but this backend is not a truthful evaluated benchmark path in this repo yet. ${memoryBackendStatus.detail}`,
    );
  }

  const resolvedAgent = requireAgentRunner(agentRunner, 'swe-bench');
  const packConfig = resolveSweBenchPackConfig(context);
  const datasetSlice = JSON.parse(fs.readFileSync(path.resolve(datasetSlicePath), 'utf8')) as ReturnType<typeof loadSweBenchDatasetSlice>;
  if (datasetSlice.instances.length === 0) {
    throw new Error('official SWE-bench dataset slice is empty; adjust pack.config.maxTasks or pack.config.instanceIds.');
  }

  const modelName = sweBenchModelNameForHarness(context);
  const predictionsPath = path.resolve(context.outputDir, 'predictions.jsonl');
  const harnessWorkDir = path.resolve(context.outputDir, 'official-harness');
  fs.mkdirSync(harnessWorkDir, { recursive: true });
  fs.mkdirSync(context.outputDir, { recursive: true });

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalGenerationLatencyMs = 0;

  const predictions = [] as Array<{ instance_id: string; model_name_or_path: string; model_patch: string }>;
  for (const instance of datasetSlice.instances) {
    const agentResult = await resolvedAgent.run({
      prompt: buildSweBenchAgentPrompt(instance),
      systemPrompt: 'You are fixing a real software repository issue from SWE-bench. Return only a unified git diff patch that can be applied with git apply. Do not include markdown fences or any explanation.',
    });
    if (!agentResult.ok) {
      throw new Error(`swe-bench agent run failed for ${instance.instance_id}: ${agentResult.error ?? 'unknown error'}`);
    }

    totalPromptTokens += agentResult.usage?.input ?? 0;
    totalCompletionTokens += agentResult.usage?.output ?? 0;
    totalTokens += agentResult.usage?.total ?? 0;
    totalGenerationLatencyMs += agentResult.latencyMs;

    predictions.push({
      instance_id: instance.instance_id,
      model_name_or_path: modelName,
      model_patch: sanitizePatch(agentResult.text),
    });
    const patchError = validateUnifiedDiff(predictions[predictions.length - 1]!.model_patch);
    if (patchError) {
      throw new Error(`swe-bench produced an invalid patch for ${instance.instance_id}: ${patchError}`);
    }
  }

  fs.writeFileSync(predictionsPath, `${predictions.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
  const runId = `${context.runId}-${Date.now()}`;
  const harnessArgs = [
    '-m',
    'swebench.harness.run_evaluation',
    '--dataset_name',
    packConfig.datasetName,
    '--split',
    packConfig.split,
    '--predictions_path',
    predictionsPath,
    '--max_workers',
    String(packConfig.maxWorkers),
    '--open_file_limit',
    String(packConfig.openFileLimit),
    '--timeout',
    String(packConfig.timeoutSeconds),
    '--force_rebuild',
    String(packConfig.forceRebuild),
    '--cache_level',
    packConfig.cacheLevel,
    '--clean',
    String(packConfig.clean),
    '--run_id',
    runId,
    '--namespace',
    packConfig.namespace === null ? 'none' : packConfig.namespace,
    '--instance_image_tag',
    packConfig.instanceImageTag,
    '--env_image_tag',
    packConfig.envImageTag,
    '--rewrite_reports',
    'false',
    '--modal',
    'false',
    ...(datasetSlice.instances.length > 0 ? ['--instance_ids', ...datasetSlice.instances.map((entry) => entry.instance_id)] : []),
  ];

  process.stdout.write(
    `${JSON.stringify({
      runId,
      modelName,
      predictionsPath,
      harnessWorkDir,
      harnessArgs,
      datasetSlice,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      totalGenerationLatencyMs,
    })}\n`,
  );
  return 0;
}

async function internalSweBenchConfig(args: string[]): Promise<number> {
  const { selectedRun, context } = resolveExecution(args);
  if (selectedRun.pack !== 'swe-bench') {
    throw new Error(`internal swe-bench-config expected pack swe-bench, received ${selectedRun.pack}`);
  }

  const packConfig = resolveSweBenchPackConfig(context);
  process.stdout.write(
    `${JSON.stringify({
      datasetName: packConfig.datasetName,
      split: packConfig.split,
      maxTasks: packConfig.maxTasks ?? null,
      instanceIds: packConfig.instanceIds,
    })}\n`,
  );
  return 0;
}

async function internalSweBenchFinalize(args: string[]): Promise<number> {
  const planPath = valueAfter(args, '--plan');
  const stdoutFile = valueAfter(args, '--stdout-file');
  const stderrFile = valueAfter(args, '--stderr-file');
  const pythonCommand = valueAfter(args, '--python-command');
  const harnessVersion = valueAfter(args, '--harness-version');
  const dockerVersion = valueAfter(args, '--docker-version');
  if (!planPath || !stdoutFile || !stderrFile) {
    throw new Error('internal swe-bench-finalize requires --plan, --stdout-file, and --stderr-file');
  }

  const { rootDir, config, selectedRun, context } = resolveExecution(args);
  if (selectedRun.pack !== 'swe-bench') {
    throw new Error(`internal swe-bench finalize expected pack swe-bench, received ${selectedRun.pack}`);
  }

  const memoryBackendId = selectedRun.memoryBackend ?? config.defaults?.memoryBackend ?? 'none';
  const memoryBackend = createMemoryBackend(memoryBackendId, rootDir);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8')) as {
    runId: string;
    modelName: string;
    predictionsPath: string;
    harnessWorkDir: string;
    harnessArgs: string[];
    datasetSlice: Parameters<typeof finalizeSweBenchRun>[5];
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    totalGenerationLatencyMs: number;
  };
  const packConfig = resolveSweBenchPackConfig(context);
  const result = finalizeSweBenchRun(
    context,
    memoryBackend,
    packConfig,
    {
      pythonCommand: pythonCommand ?? 'python3',
      harnessVersion: harnessVersion ?? 'installed',
      dockerVersion: dockerVersion ?? 'unknown',
    },
    plan.datasetSlice,
    plan.modelName,
    plan.runId,
    plan.predictionsPath,
    plan.harnessWorkDir,
    plan.harnessArgs,
    fs.readFileSync(stdoutFile, 'utf8'),
    fs.readFileSync(stderrFile, 'utf8'),
    plan.totalPromptTokens,
    plan.totalCompletionTokens,
    plan.totalTokens,
    plan.totalGenerationLatencyMs,
  );
  process.stdout.write(toPrettyJson(result));
  return 0;
}

function internalTerminalBenchBlocked(): number {
  throw new Error(
    'terminal-bench remains blocked under the current architecture: the official installed-agent path still expects runtime setup inside benchmark containers, and this repo does not yet have a truthful prebuilt-image replacement for that upstream contract.',
  );
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

    if (command === 'setup') {
      return await runSetupCommand(getProjectRoot(), args.slice(1));
    }

    if (command === 'downloads') {
      return await runDownloadsCommand(args.slice(1));
    }

    if (command === 'internal' && subcommand === 'swe-bench-prepare') {
      return await internalSweBenchPrepare(args.slice(2));
    }

    if (command === 'internal' && subcommand === 'swe-bench-finalize') {
      return await internalSweBenchFinalize(args.slice(2));
    }

    if (command === 'internal' && subcommand === 'swe-bench-config') {
      return await internalSweBenchConfig(args.slice(2));
    }

    if (command === 'internal' && (subcommand === 'terminal-bench-prepare' || subcommand === 'terminal-bench-finalize')) {
      return internalTerminalBenchBlocked();
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
