import fs from 'node:fs';
import path from 'node:path';
import type { AgentRunner } from '../../agent/types.ts';
import { ArtifactStore } from '../../core/artifact-store.ts';
import { BenchmarkRuntimeError } from '../../core/errors.ts';
import type { RunContext } from '../../core/run-context.ts';
import type { NormalizedRunResult } from '../../core/types.ts';
import type { MemoryBackend } from '../../memory/types.ts';
import { markdownReportForResult } from '../../reporting/markdown.ts';
import type { PackAdapter } from '../types.ts';
import { requireAgentRunner } from '../runtime-requirements.ts';
import { parseSweBenchRawOutput } from './parse.ts';
import { scoreSweBenchAdapter } from './scorer.ts';

interface SweBenchPackConfig {
  datasetName?: string;
  split?: string;
  smoke?: boolean;
  maxTasks?: number;
  instanceIds?: string[];
  maxWorkers?: number;
  timeoutSeconds?: number;
  openFileLimit?: number;
  cacheLevel?: 'none' | 'base' | 'env' | 'instance';
  clean?: boolean;
  forceRebuild?: boolean;
  namespace?: string | null;
  instanceImageTag?: string;
  envImageTag?: string;
  pythonCommand?: string;
}

interface SweBenchRuntimeStatus {
  pythonCommand?: string;
  harnessVersion?: string;
  dockerVersion?: string;
  problems: string[];
}

interface SweBenchDatasetInstance {
  instance_id: string;
  repo: string;
  base_commit: string;
  problem_statement: string;
  hints_text?: string;
}

interface SweBenchDatasetSlice {
  dataset_name: string;
  split: string;
  count: number;
  instances: SweBenchDatasetInstance[];
}

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

const SWE_BENCH_SYSTEM_PROMPT =
  'You are fixing a real software repository issue from SWE-bench. Return only a unified git diff patch that can be applied with git apply. Do not include markdown fences or any explanation.';

function isOfficialDatasetName(value: string): boolean {
  return value.startsWith('SWE-bench/') || OFFICIAL_SWE_BENCH_DATASET_ALIASES.has(value.toLowerCase());
}

function runSync(command: string, args: string[], cwd: string): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const proc = Bun.spawnSync([command, ...args], {
    cwd,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

function inspectSweBenchRuntime(cwd: string, explicitPython?: string): SweBenchRuntimeStatus {
  const problems: string[] = [];

  const docker = runSync('docker', ['info', '--format', '{{.ServerVersion}}'], cwd);
  const dockerVersion = docker.exitCode === 0 ? docker.stdout.trim() : undefined;
  if (!dockerVersion) {
    problems.push(`Docker daemon unavailable: ${docker.stderr.trim() || 'docker info failed'}`);
  }

  const pythonCandidates = explicitPython ? [explicitPython] : ['python3', 'python'];
  let pythonCommand: string | undefined;
  let harnessVersion: string | undefined;
  let lastPythonError = 'official SWE-bench harness import failed';

  for (const candidate of pythonCandidates) {
    const result = runSync(
      candidate,
      ['-c', "import swebench, swebench.harness.run_evaluation; print(getattr(swebench, '__version__', 'installed'))"],
      cwd,
    );
    if (result.exitCode === 0) {
      pythonCommand = candidate;
      harnessVersion = result.stdout.trim() || 'installed';
      break;
    }

    const stderr = result.stderr.trim();
    const stdout = result.stdout.trim();
    lastPythonError = stderr || stdout || `${candidate} could not import swebench.harness.run_evaluation`;
  }

  if (!pythonCommand) {
    problems.push(`official SWE-bench harness unavailable: ${lastPythonError}`);
  }

  return {
    pythonCommand,
    harnessVersion,
    dockerVersion,
    problems,
  };
}

function resolvePackConfig(context: RunContext): Required<Pick<SweBenchPackConfig, 'datasetName' | 'split' | 'maxWorkers' | 'timeoutSeconds' | 'openFileLimit' | 'cacheLevel' | 'clean' | 'forceRebuild' | 'instanceImageTag' | 'envImageTag'>> &
  Pick<SweBenchPackConfig, 'namespace' | 'pythonCommand'> & { maxTasks?: number; instanceIds: string[] } {
  const packConfig = (context.run.packConfig ?? {}) as SweBenchPackConfig;
  const datasetName = typeof packConfig.datasetName === 'string' ? packConfig.datasetName : 'SWE-bench/SWE-bench_Lite';
  if (!isOfficialDatasetName(datasetName)) {
    throw new BenchmarkRuntimeError(
      `swe-bench requires an official dataset identifier. Received ${JSON.stringify(datasetName)} instead of an official SWE-bench dataset name.`,
    );
  }

  const maxTasks = typeof packConfig.maxTasks === 'number' && packConfig.maxTasks > 0
    ? Math.floor(packConfig.maxTasks)
    : packConfig.smoke
      ? 1
      : undefined;

  return {
    datasetName,
    split: typeof packConfig.split === 'string' ? packConfig.split : 'test',
    maxTasks,
    instanceIds: Array.isArray(packConfig.instanceIds)
      ? packConfig.instanceIds.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
    maxWorkers: typeof packConfig.maxWorkers === 'number' && packConfig.maxWorkers > 0 ? Math.floor(packConfig.maxWorkers) : 1,
    timeoutSeconds:
      typeof packConfig.timeoutSeconds === 'number' && packConfig.timeoutSeconds > 0
        ? Math.floor(packConfig.timeoutSeconds)
        : 1800,
    openFileLimit:
      typeof packConfig.openFileLimit === 'number' && packConfig.openFileLimit > 0
        ? Math.floor(packConfig.openFileLimit)
        : 4096,
    cacheLevel: packConfig.cacheLevel ?? 'env',
    clean: packConfig.clean === true,
    forceRebuild: packConfig.forceRebuild === true,
    namespace: Object.prototype.hasOwnProperty.call(packConfig, 'namespace') ? (packConfig.namespace ?? null) : 'swebench',
    instanceImageTag: typeof packConfig.instanceImageTag === 'string' ? packConfig.instanceImageTag : 'latest',
    envImageTag: typeof packConfig.envImageTag === 'string' ? packConfig.envImageTag : 'latest',
    pythonCommand: typeof packConfig.pythonCommand === 'string' ? packConfig.pythonCommand : undefined,
  };
}

function buildAgentPrompt(instance: SweBenchDatasetInstance): string {
  const hints = instance.hints_text?.trim();
  return [
    `Repository: ${instance.repo}`,
    `Instance ID: ${instance.instance_id}`,
    `Base commit: ${instance.base_commit}`,
    '',
    'Problem statement:',
    instance.problem_statement.trim(),
    ...(hints
      ? [
          '',
          'Hints:',
          hints,
        ]
      : []),
    '',
    'Return only a unified diff patch against the repository root.',
  ].join('\n');
}

export function sanitizePatch(text: string): string {
  const normalized = text.replaceAll('\r\n', '\n');
  const trimmed = normalized.trim();
  if (!trimmed) {
    return '';
  }

  const fencedMatch = trimmed.match(/```(?:diff|patch)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    const extracted = fencedMatch[1]?.replaceAll('\r\n', '\n') ?? '';
    return extracted.length > 0 && !extracted.endsWith('\n') ? `${extracted}\n` : extracted;
  }

  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

export function validateUnifiedDiff(patch: string): string | null {
  const trimmed = patch.trim();
  if (!trimmed) {
    return null;
  }

  const lines = patch.replaceAll('\r\n', '\n').split('\n');
  const hasDiffHeader = lines.some((line) => line.startsWith('diff --git '));
  const hasFileHeaders = lines.some((line) => line.startsWith('--- ')) && lines.some((line) => line.startsWith('+++ '));
  const hunkStarts = lines.filter((line) => line.startsWith('@@ '));

  if (!hasDiffHeader && !hasFileHeaders) {
    return 'patch is not a unified diff (missing diff/file headers)';
  }
  if (hunkStarts.length === 0) {
    return 'patch is not a unified diff (missing @@ hunk headers)';
  }
  if (!patch.endsWith('\n')) {
    return 'patch must end with a newline';
  }
  if (patch.includes('```')) {
    return 'patch still contains markdown fences';
  }
  return null;
}

function loadDatasetSlice(rootDir: string, pythonCommand: string, config: ReturnType<typeof resolvePackConfig>): SweBenchDatasetSlice {
  const helperPath = path.resolve(rootDir, 'scripts', 'swebench_list_instances.py');
  const args = [
    helperPath,
    '--dataset_name',
    config.datasetName,
    '--split',
    config.split,
    ...(typeof config.maxTasks === 'number' ? ['--max_tasks', String(config.maxTasks)] : []),
    ...(config.instanceIds.length > 0 ? ['--instance_ids', ...config.instanceIds] : []),
  ];
  const result = runSync(pythonCommand, args, rootDir);
  if (result.exitCode !== 0) {
    throw new BenchmarkRuntimeError(
      `failed to load official SWE-bench dataset slice with ${pythonCommand}. stderr: ${result.stderr.trim() || '(empty)'}`,
    );
  }

  const parsed = JSON.parse(result.stdout) as SweBenchDatasetSlice;
  if (!Array.isArray(parsed.instances)) {
    throw new BenchmarkRuntimeError('official SWE-bench dataset helper returned malformed instance data.');
  }

  return parsed;
}

function modelNameForHarness(context: RunContext): string {
  return context.run.agentModel ?? context.run.agentProviderConfig?.defaultModel ?? context.run.agentProvider ?? 'unknown-model';
}

function harnessModelDir(modelName: string): string {
  return modelName.replaceAll('/', '__');
}

export const sweBenchAdapter: PackAdapter = {
  id: 'swe-bench',
  description: 'Official SWE-bench harness wrapper using Docker and authoritative evaluation artifacts.',
  checkInstalled() {
    return inspectSweBenchRuntime(process.cwd()).problems.length === 0;
  },
  getDoctorDetail() {
    const runtime = inspectSweBenchRuntime(process.cwd());
    if (runtime.problems.length > 0) {
      return {
        status: 'warn' as const,
        detail: runtime.problems.join(' '),
      };
    }

    return {
      status: 'ok' as const,
      detail: `official SWE-bench harness available via ${runtime.pythonCommand} (${runtime.harnessVersion}); Docker server ${runtime.dockerVersion}`,
    };
  },
  async run(
    context: RunContext,
    memory: MemoryBackend,
    agent?: AgentRunner,
  ): Promise<NormalizedRunResult> {
    const resolvedAgent = requireAgentRunner(agent, 'swe-bench');
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    await memory.reset();

    const packConfig = resolvePackConfig(context);
    const runtime = inspectSweBenchRuntime(context.rootDir, packConfig.pythonCommand);
    if (runtime.problems.length > 0 || !runtime.pythonCommand) {
      throw new BenchmarkRuntimeError(`swe-bench runtime requirements not met. ${runtime.problems.join(' ')}`);
    }

    const datasetSlice = loadDatasetSlice(context.rootDir, runtime.pythonCommand, packConfig);
    if (datasetSlice.instances.length === 0) {
      throw new BenchmarkRuntimeError('official SWE-bench dataset slice is empty; adjust pack.config.maxTasks or pack.config.instanceIds.');
    }

    const modelName = modelNameForHarness(context);
    const predictionsPath = path.resolve(context.outputDir, 'predictions.jsonl');
    const harnessWorkDir = path.resolve(context.outputDir, 'official-harness');
    fs.mkdirSync(harnessWorkDir, { recursive: true });

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalGenerationLatencyMs = 0;

    const predictions = [] as Array<{ instance_id: string; model_name_or_path: string; model_patch: string }>;
    for (const instance of datasetSlice.instances) {
      const agentResult = await resolvedAgent.run({
        prompt: buildAgentPrompt(instance),
        systemPrompt: SWE_BENCH_SYSTEM_PROMPT,
      });
      if (!agentResult.ok) {
        throw new BenchmarkRuntimeError(
          `swe-bench agent run failed for ${instance.instance_id}: ${agentResult.error ?? 'unknown error'}`,
        );
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
        throw new BenchmarkRuntimeError(`swe-bench produced an invalid patch for ${instance.instance_id}: ${patchError}`);
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

    const harnessProc = Bun.spawn([runtime.pythonCommand, ...harnessArgs], {
      cwd: harnessWorkDir,
      env: process.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [harnessStdout, harnessStderr, harnessExitCode] = await Promise.all([
      new Response(harnessProc.stdout).text(),
      new Response(harnessProc.stderr).text(),
      harnessProc.exited,
    ]);

    if (harnessExitCode !== 0) {
      throw new BenchmarkRuntimeError(
        `official SWE-bench harness failed with exit code ${harnessExitCode}. stderr: ${harnessStderr.trim() || '(empty)'}`,
      );
    }

    const modelDir = harnessModelDir(modelName);
    const runReportPath = path.resolve(harnessWorkDir, `${modelDir}.${runId}.json`);
    if (!fs.existsSync(runReportPath)) {
      throw new BenchmarkRuntimeError(
        `official SWE-bench harness finished without producing the final run report at ${runReportPath}`,
      );
    }

    const instanceLogRootDir = path.resolve(harnessWorkDir, 'logs', 'run_evaluation', runId, modelDir);
    const authoritative = parseSweBenchRawOutput({
      runReportPath,
      instanceLogRootDir,
    });
    const score = scoreSweBenchAdapter(
      authoritative.runReport.total_instances === 0
        ? 0
        : authoritative.runReport.resolved_instances / authoritative.runReport.total_instances,
    );

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));
    const warnings: string[] = [];
    if (authoritative.runReport.error_instances > 0) {
      warnings.push(`${authoritative.runReport.error_instances} instance(s) failed inside the official SWE-bench harness.`);
    }
    if (authoritative.runReport.empty_patch_instances > 0) {
      warnings.push(`${authoritative.runReport.empty_patch_instances} instance(s) submitted empty patches.`);
    }

    const result: NormalizedRunResult = {
      schemaVersion: '1.0',
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status:
        authoritative.runReport.total_instances === 0
          ? 'warning'
          : authoritative.runReport.error_instances > 0 ||
              authoritative.runReport.completed_instances < authoritative.runReport.total_instances
            ? 'warning'
            : score > 0
              ? 'passed'
              : 'failed',
      startedAt,
      finishedAt,
      durationMs,
      warnings,
      notes: [
        `SWE-bench evaluated ${authoritative.runReport.total_instances} instance(s) with the official Docker harness.`,
        `Resolved ${authoritative.runReport.resolved_instances}/${authoritative.runReport.total_instances} instances (${(score * 100).toFixed(1)}%).`,
        `Dataset: ${packConfig.datasetName} (${packConfig.split})`,
      ],
      metrics: {
        retrieval: {
          queryCount: 0,
          precisionAtK: 0,
          recallAtK: 0,
          mrr: 0,
          ndcgAtK: 0,
        },
        answer: {
          exactMatch: 0,
          tokenF1: 0,
          containsExpected: 0,
          judgedPass: score,
        },
        aggregate: {
          score,
          retrievalWeight: 0,
          answerWeight: 1,
        },
      },
      telemetry: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
        estimatedCostUsd: 0,
        latencyMs: durationMs,
        logs: [
          `pack=${context.run.pack}`,
          `variant=${context.run.variant}`,
          `memory=${memory.id}`,
          `model=${modelName}`,
          `dataset=${packConfig.datasetName}`,
          `split=${packConfig.split}`,
          `runId=${runId}`,
          `generationLatencyMs=${totalGenerationLatencyMs}`,
        ],
      },
      artifacts: {
        resultPath: '',
        summaryPath: '',
        rawOutputPath: '',
      },
      metadata: {
        ...context.run.metadata,
        benchmarkId: packConfig.datasetName,
        datasetName: packConfig.datasetName,
        split: packConfig.split,
        model: modelName,
        harnessPython: runtime.pythonCommand,
        harnessVersion: runtime.harnessVersion ?? 'installed',
        dockerVersion: runtime.dockerVersion ?? 'unknown',
        totalInstances: authoritative.runReport.total_instances,
        resolvedInstances: authoritative.runReport.resolved_instances,
        unresolvedInstances: authoritative.runReport.unresolved_instances,
        errorInstances: authoritative.runReport.error_instances,
        emptyPatchInstances: authoritative.runReport.empty_patch_instances,
      },
    };

    const harnessStdoutPath = store.writeText('harness-stdout.log', harnessStdout);
    const harnessStderrPath = store.writeText('harness-stderr.log', harnessStderr);
    result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
      pack: 'swe-bench',
      dataset: {
        name: datasetSlice.dataset_name,
        split: datasetSlice.split,
        count: datasetSlice.count,
        instances: datasetSlice.instances.map((entry) => ({
          instance_id: entry.instance_id,
          repo: entry.repo,
          base_commit: entry.base_commit,
        })),
      },
      predictionsPath,
      harnessWorkDir,
      harnessCommand: [runtime.pythonCommand, ...harnessArgs],
      harnessStdoutPath,
      harnessStderrPath,
      runReportPath,
      authoritative,
    });
    result.artifacts.resultPath = path.resolve(store.baseDir, 'result.json');
    result.artifacts.summaryPath = path.resolve(store.baseDir, 'summary.md');
    store.writeJson('result.json', result);
    store.writeText('summary.md', markdownReportForResult(result));
    return result;
  },
};
