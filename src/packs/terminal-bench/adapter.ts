import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ArtifactStore } from '../../core/artifact-store.ts';
import { BenchmarkRuntimeError } from '../../core/errors.ts';
import { runProcess } from '../../core/process.ts';
import type { RunContext } from '../../core/run-context.ts';
import type { NormalizedRunResult } from '../../core/types.ts';
import { loadOpencodeConfig, materializeOpencodeConfig, selectProviderForModel } from '../../opencode-config.ts';
import { markdownReportForResult } from '../../reporting/markdown.ts';
import type { MemoryBackend } from '../../memory/types.ts';
import type { PackAdapter } from '../types.ts';
import { parseTerminalBenchRawOutput } from './parse.ts';
import { scoreTerminalBenchAdapter } from './scorer.ts';

export interface TerminalBenchPackConfig {
  dataset?: string;
  datasetName?: string;
  datasetVersion?: string;
  datasetPath?: string;
  datasetConfig?: string;
  localRegistryPath?: string;
  registryUrl?: string;
  taskIds?: string[];
  excludeTaskIds?: string[];
  maxTasks?: number;
  smoke?: boolean;
  difficulty?: string;
  nConcurrent?: number;
  nAttempts?: number;
  globalTimeoutMultiplier?: number;
  globalAgentTimeoutSec?: number;
  globalTestTimeoutSec?: number;
  noRebuild?: boolean;
  cleanup?: boolean;
  livestream?: boolean;
  logLevel?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  agentImportPath?: string;
  agentKwargs?: Record<string, string | number | boolean>;
}

export interface TerminalBenchRuntime {
  tbCommand: string | null;
  tbVersion: string | null;
  pythonCommand: string | null;
  dockerVersion: string | null;
  problems: string[];
}

interface TerminalBenchTrialResult {
  trial_name: string;
  task_id: string;
  instruction: string;
  is_resolved: boolean | null;
  failure_mode: string;
  parser_results?: Record<string, string> | null;
  recording_path?: string | null;
  total_input_tokens?: number | null;
  total_output_tokens?: number | null;
  trial_started_at?: string | null;
  trial_ended_at?: string | null;
  agent_started_at?: string | null;
  agent_ended_at?: string | null;
  test_started_at?: string | null;
  test_ended_at?: string | null;
}

interface TerminalBenchBenchmarkResults {
  results: TerminalBenchTrialResult[];
  n_resolved: number;
  n_unresolved: number;
  accuracy: number;
  pass_at_k: Record<string, number>;
}

interface TerminalBenchRunMetadata {
  run_id: string;
  uuid: string;
  dataset_name?: string | null;
  dataset_version?: string | null;
  dataset_path?: string | null;
  output_path: string;
  agent_name: string;
  model_name?: string | null;
  n_concurrent_trials: number;
  n_attempts: number;
  start_time?: string | null;
  end_time?: string | null;
  agent_kwargs?: Record<string, unknown> | null;
}

export interface ParsedTerminalBenchArtifacts {
  benchmarkResults: TerminalBenchBenchmarkResults;
  runMetadata: TerminalBenchRunMetadata;
  taskSummaries: Array<{
    taskId: string;
    attempts: number;
    resolvedAttempts: number;
    unresolvedAttempts: number;
    failureModes: string[];
    parserResultKeys: string[];
    trialDirectories: string[];
    commandLogs: string[];
    paneLogs: string[];
    resultFiles: string[];
  }>;
}

const DEFAULT_TERMINAL_BENCH_DATASET = 'terminal-bench-core==0.1.1';
const TERMINAL_BENCH_AGENT_MODULE = 'tools.terminal_bench_agent';
const TERMINAL_BENCH_AGENT_CLASS = 'AkmEvalOpenCodeAgent';
const TERMINAL_BENCH_AGENT_IMPORT_PATH = `${TERMINAL_BENCH_AGENT_MODULE}:${TERMINAL_BENCH_AGENT_CLASS}`;

export function inspectTerminalBenchRuntime(rootDir: string): TerminalBenchRuntime {
  const tbResult = runProcess('tb', ['--help'], rootDir);
  const python3Version = runProcess('python3', ['--version'], rootDir);
  const pythonVersion = runProcess('python', ['--version'], rootDir);
  const dockerResult = runProcess('docker', ['--version'], rootDir);

  const problems: string[] = [];
  const tbCommand = tbResult.success ? 'tb' : null;
  const pythonCommand = python3Version.success ? 'python3' : pythonVersion.success ? 'python' : null;

  if (!tbCommand) {
    problems.push('Terminal-Bench CLI `tb` not found in PATH. Install the official harness with `uv tool install terminal-bench` or `pip install terminal-bench`.');
  }

  if (!pythonCommand) {
    problems.push('Python runtime not found in PATH. Terminal-Bench requires Python 3.12+.');
  }

  if (!dockerResult.success) {
    problems.push('Docker not found in PATH. Terminal-Bench requires Docker.');
  }

  return {
    tbCommand,
    tbVersion: tbCommand ? (tbResult.stdout.trim().split('\n')[0] ?? 'installed') : null,
    pythonCommand,
    dockerVersion: dockerResult.success ? dockerResult.stdout.trim().split('\n')[0] ?? 'installed' : null,
    problems,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function resolvePackConfig(context: RunContext): TerminalBenchPackConfig {
  const packConfig = (context.run.packConfig ?? {}) as TerminalBenchPackConfig;
  return {
    ...packConfig,
    nConcurrent:
      typeof packConfig.nConcurrent === 'number' && packConfig.nConcurrent > 0
        ? Math.floor(packConfig.nConcurrent)
        : 1,
    nAttempts:
      typeof packConfig.nAttempts === 'number' && packConfig.nAttempts > 0
        ? Math.floor(packConfig.nAttempts)
        : 1,
    cleanup: packConfig.cleanup ?? true,
    noRebuild: packConfig.noRebuild ?? false,
    livestream: packConfig.livestream ?? false,
    logLevel: packConfig.logLevel ?? 'info',
  };
}

export function resolveDatasetSelector(packConfig: TerminalBenchPackConfig): string | null {
  if (isNonEmptyString(packConfig.dataset)) {
    return packConfig.dataset.trim();
  }

  if (isNonEmptyString(packConfig.datasetName)) {
    const version = isNonEmptyString(packConfig.datasetVersion) ? packConfig.datasetVersion.trim() : 'head';
    return `${packConfig.datasetName.trim()}==${version}`;
  }

  if (isNonEmptyString(packConfig.datasetPath) || isNonEmptyString(packConfig.datasetConfig)) {
    return null;
  }

  return DEFAULT_TERMINAL_BENCH_DATASET;
}

export function resolveTaskSelection(packConfig: TerminalBenchPackConfig): string[] | undefined {
  if (Array.isArray(packConfig.taskIds) && packConfig.taskIds.length > 0) {
    return packConfig.taskIds.filter((entry): entry is string => isNonEmptyString(entry)).map((entry) => entry.trim());
  }

  if (packConfig.smoke) {
    return ['hello-world'];
  }

  return undefined;
}

function buildAgentKwargEntries(packConfig: TerminalBenchPackConfig): string[] {
  const entries: string[] = [];
  if (!packConfig.agentKwargs) {
    return entries;
  }

  for (const [key, value] of Object.entries(packConfig.agentKwargs)) {
    entries.push(`${key}=${String(value)}`);
  }
  return entries;
}

export function writeTerminalBenchOpencodeConfig(context: RunContext): { configDir: string; configPath: string; configContent: string } {
  const provider = context.run.agentProviderConfig;
  const model = context.run.agentModel ?? provider?.defaultModel;
  if (!provider || provider.type !== 'opencode' || !model) {
    throw new BenchmarkRuntimeError(
      'terminal-bench currently requires an opencode-backed provider so the official harness can run the official Terminal-Bench opencode installed-agent.',
    );
  }

  const sourceConfigPath = context.run.akmEnabled ? context.run.akmConfigPath ?? provider.configPath : provider.configPath;
  if (!sourceConfigPath) {
    throw new BenchmarkRuntimeError('terminal-bench opencode provider requires providers.<id>.configPath pointing at a standard opencode config file.');
  }
  if (context.run.akmEnabled && !context.run.akmConfigPath) {
    throw new BenchmarkRuntimeError(
      'terminal-bench AKM variants require variants[].akm.configPath so the official harness runs against a concrete AKM-specific opencode provider config instead of silently reusing the baseline config.',
    );
  }

  const loaded = loadOpencodeConfig(path.resolve(sourceConfigPath));
  const selected = selectProviderForModel(loaded, model);
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akm-eval-terminal-bench-opencode-'));
  materializeOpencodeConfig(configDir, selected, model);
  const configPath = path.join(configDir, 'opencode.json');
  return {
    configDir,
    configPath,
    configContent: fs.readFileSync(configPath, 'utf8'),
  };
}

function collectTrialArtifacts(runDirectory: string, taskId: string): {
  attempts: number;
  resolvedAttempts: number;
  unresolvedAttempts: number;
  failureModes: string[];
  parserResultKeys: string[];
  trialDirectories: string[];
  commandLogs: string[];
  paneLogs: string[];
  resultFiles: string[];
} {
  const taskDir = path.resolve(runDirectory, taskId);
  if (!fs.existsSync(taskDir) || !fs.statSync(taskDir).isDirectory()) {
    return {
      attempts: 0,
      resolvedAttempts: 0,
      unresolvedAttempts: 0,
      failureModes: [],
      parserResultKeys: [],
      trialDirectories: [],
      commandLogs: [],
      paneLogs: [],
      resultFiles: [],
    };
  }

  const trialDirectories = fs
    .readdirSync(taskDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.resolve(taskDir, entry.name))
    .sort();

  const failureModes = new Set<string>();
  const parserResultKeys = new Set<string>();
  const commandLogs: string[] = [];
  const paneLogs: string[] = [];
  const resultFiles: string[] = [];
  let resolvedAttempts = 0;
  let unresolvedAttempts = 0;

  for (const trialDir of trialDirectories) {
    const resultFile = path.resolve(trialDir, 'results.json');
    if (fs.existsSync(resultFile)) {
      resultFiles.push(resultFile);
      const parsed = JSON.parse(fs.readFileSync(resultFile, 'utf8')) as TerminalBenchTrialResult;
      if (parsed.is_resolved) {
        resolvedAttempts += 1;
      } else {
        unresolvedAttempts += 1;
      }
      if (isNonEmptyString(parsed.failure_mode)) {
        failureModes.add(parsed.failure_mode);
      }
      if (parsed.parser_results) {
        for (const key of Object.keys(parsed.parser_results)) {
          parserResultKeys.add(key);
        }
      }
    }

    const commandsPath = path.resolve(trialDir, 'commands.txt');
    if (fs.existsSync(commandsPath)) {
      commandLogs.push(commandsPath);
    }

    const panesDir = path.resolve(trialDir, 'panes');
    if (fs.existsSync(panesDir) && fs.statSync(panesDir).isDirectory()) {
      for (const paneFile of fs.readdirSync(panesDir)) {
        paneLogs.push(path.resolve(panesDir, paneFile));
      }
    }
  }

  return {
    attempts: trialDirectories.length,
    resolvedAttempts,
    unresolvedAttempts,
    failureModes: [...failureModes].sort(),
    parserResultKeys: [...parserResultKeys].sort(),
    trialDirectories,
    commandLogs,
    paneLogs: paneLogs.sort(),
    resultFiles,
  };
}

export function parseTerminalBenchArtifacts(runDirectory: string): ParsedTerminalBenchArtifacts {
  const resultsPath = path.resolve(runDirectory, 'results.json');
  const runMetadataPath = path.resolve(runDirectory, 'run_metadata.json');

  if (!fs.existsSync(resultsPath)) {
    throw new BenchmarkRuntimeError(`official Terminal-Bench run finished without results.json at ${resultsPath}`);
  }
  if (!fs.existsSync(runMetadataPath)) {
    throw new BenchmarkRuntimeError(`official Terminal-Bench run finished without run_metadata.json at ${runMetadataPath}`);
  }

  const benchmarkResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8')) as TerminalBenchBenchmarkResults;
  const runMetadata = JSON.parse(fs.readFileSync(runMetadataPath, 'utf8')) as TerminalBenchRunMetadata;
  const taskIds = Array.from(new Set((benchmarkResults.results ?? []).map((entry) => entry.task_id))).sort();
  const taskSummaries = taskIds.map((taskId) => ({ taskId, ...collectTrialArtifacts(runDirectory, taskId) }));
  return parseTerminalBenchRawOutput({ benchmarkResults, runMetadata, taskSummaries });
}

export function buildHarnessCommand(
  runtime: TerminalBenchRuntime,
  context: RunContext,
  packConfig: TerminalBenchPackConfig,
  runDirectory: string,
): { args: string[]; selectedTasks: string[] | undefined } {
  if (!runtime.tbCommand) {
    throw new BenchmarkRuntimeError('official Terminal-Bench harness is not installed.');
  }

  const datasetSelector = resolveDatasetSelector(packConfig);
  const selectedTasks = resolveTaskSelection(packConfig);
  const args = ['run'];

  if (datasetSelector) {
    args.push('--dataset', datasetSelector);
  }
  if (isNonEmptyString(packConfig.datasetPath)) {
    args.push('--dataset-path', path.resolve(context.rootDir, packConfig.datasetPath));
  }
  if (isNonEmptyString(packConfig.datasetConfig)) {
    args.push('--dataset-config', path.resolve(context.rootDir, packConfig.datasetConfig));
  }
  if (isNonEmptyString(packConfig.registryUrl)) {
    args.push('--registry-url', packConfig.registryUrl);
  }
  if (isNonEmptyString(packConfig.localRegistryPath)) {
    args.push('--local-registry-path', path.resolve(context.rootDir, packConfig.localRegistryPath));
  }

  args.push('--output-path', context.outputDir, '--run-id', path.basename(runDirectory));

  if (isNonEmptyString(packConfig.agentImportPath)) {
    args.push('--agent-import-path', packConfig.agentImportPath);
  } else {
    args.push('--agent-import-path', TERMINAL_BENCH_AGENT_IMPORT_PATH);
  }

  const model = context.run.agentModel ?? context.run.agentProviderConfig?.defaultModel;
  if (!model) {
    throw new BenchmarkRuntimeError('terminal-bench requires a configured model. Set variant.agent.model or providers.<id>.defaultModel.');
  }
  args.push('--model', model);

  if (selectedTasks) {
    for (const taskId of selectedTasks) {
      args.push('--task-id', taskId);
    }
  }

  if (Array.isArray(packConfig.excludeTaskIds)) {
    for (const taskId of packConfig.excludeTaskIds.filter((entry): entry is string => isNonEmptyString(entry))) {
      args.push('--exclude-task-id', taskId.trim());
    }
  }

  if (typeof packConfig.maxTasks === 'number' && packConfig.maxTasks > 0) {
    args.push('--n-tasks', String(Math.floor(packConfig.maxTasks)));
  }

  args.push('--n-concurrent', String(packConfig.nConcurrent ?? 1));
  args.push('--n-attempts', String(packConfig.nAttempts ?? 1));
  args.push('--log-level', packConfig.logLevel ?? 'info');
  args.push(packConfig.cleanup === false ? '--no-cleanup' : '--cleanup');
  args.push(packConfig.noRebuild === true ? '--no-rebuild' : '--rebuild');
  if (packConfig.livestream) {
    args.push('--livestream');
  }
  if (typeof packConfig.globalTimeoutMultiplier === 'number' && Number.isFinite(packConfig.globalTimeoutMultiplier)) {
    args.push('--global-timeout-multiplier', String(packConfig.globalTimeoutMultiplier));
  }
  if (typeof packConfig.globalAgentTimeoutSec === 'number' && Number.isFinite(packConfig.globalAgentTimeoutSec)) {
    args.push('--global-agent-timeout-sec', String(packConfig.globalAgentTimeoutSec));
  }
  if (typeof packConfig.globalTestTimeoutSec === 'number' && Number.isFinite(packConfig.globalTestTimeoutSec)) {
    args.push('--global-test-timeout-sec', String(packConfig.globalTestTimeoutSec));
  }

  const agentKwargs = buildAgentKwargEntries(packConfig);
  for (const kwarg of agentKwargs) {
    args.push('--agent-kwarg', kwarg);
  }

  return { args, selectedTasks };
}

export function buildHarnessEnvironment(
  context: RunContext,
  runtime: TerminalBenchRuntime,
  opencodeConfigContent: string,
): Record<string, string> {
  const provider = context.run.agentProviderConfig;
  const model = context.run.agentModel ?? provider?.defaultModel;
  if (!provider || provider.type !== 'opencode' || !model) {
    throw new BenchmarkRuntimeError('terminal-bench currently only supports opencode-backed providers in this repo.');
  }

  const configPath = provider.configPath;
  if (!configPath) {
    throw new BenchmarkRuntimeError('terminal-bench opencode provider requires configPath.');
  }

  const loaded = loadOpencodeConfig(path.resolve(configPath));
  const envRefs = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      const match = value.match(/^\{env:([A-Z_][A-Z0-9_]*)\}$/);
      if (match) {
        envRefs.add(match[1]);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        visit(entry);
      }
      return;
    }
    if (value && typeof value === 'object') {
      for (const child of Object.values(value as Record<string, unknown>)) {
        visit(child);
      }
    }
  };
  visit(loaded.provider);

  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const forwardedEnvNames = new Set<string>(envRefs);
  for (const key of envRefs) {
    const value = process.env[key];
    if (value) {
      env[key] = value;
    }
  }

  env.PYTHONPATH = [context.rootDir, env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  env.AKM_EVAL_TERMINAL_BENCH_OPENCODE_CONFIG_CONTENT = opencodeConfigContent;
  env.AKM_EVAL_TERMINAL_BENCH_MODEL = model;
  env.AKM_EVAL_TERMINAL_BENCH_VARIANT = context.run.variant;
  env.AKM_EVAL_TERMINAL_BENCH_MEMORY_BACKEND = context.run.memoryBackend ?? 'none';
  env.AKM_EVAL_TERMINAL_BENCH_AKM_ENABLED = context.run.akmEnabled ? '1' : '0';

  if (context.run.agentEnvironment) {
    Object.assign(env, context.run.agentEnvironment);
    Object.keys(context.run.agentEnvironment).forEach((key) => forwardedEnvNames.add(key));
  }
  if (context.run.akmEnvironment) {
    Object.assign(env, context.run.akmEnvironment);
    Object.keys(context.run.akmEnvironment).forEach((key) => forwardedEnvNames.add(key));
  }

  if (context.run.akmEnabled && isNonEmptyString(context.run.akmCommand)) {
    env.AKM_EVAL_TERMINAL_BENCH_AKM_COMMAND = context.run.akmCommand;
  }
  if (isNonEmptyString(context.run.akmConfigPath)) {
    env.AKM_EVAL_TERMINAL_BENCH_AKM_CONFIG_PATH = path.resolve(context.rootDir, context.run.akmConfigPath);
  }
  if (runtime.pythonCommand) {
    env.AKM_EVAL_TERMINAL_BENCH_PYTHON = runtime.pythonCommand;
  }
  env.AKM_EVAL_TERMINAL_BENCH_FORWARD_ENV_NAMES = [...forwardedEnvNames].sort().join(',');

  return env;
}

export function benchmarkMetadataFromRunMetadata(runMetadata: TerminalBenchRunMetadata): { benchmarkId: string | null; benchmarkVersion: string | null } {
  return {
    benchmarkId: runMetadata.dataset_name ?? null,
    benchmarkVersion: runMetadata.dataset_version ?? null,
  };
}

export function finalizeTerminalBenchRun(
  context: RunContext,
  memory: MemoryBackend,
  packConfig: TerminalBenchPackConfig,
  runtime: Pick<TerminalBenchRuntime, 'tbCommand' | 'tbVersion' | 'pythonCommand' | 'dockerVersion'>,
  args: string[],
  selectedTasks: string[] | undefined,
  authoritative: ParsedTerminalBenchArtifacts,
  harnessStdout: string,
  harnessStderr: string,
): NormalizedRunResult {
  const store = new ArtifactStore(context.outputDir);
  store.ensureDir();
  const benchmarkMetadata = benchmarkMetadataFromRunMetadata(authoritative.runMetadata);
  const score = scoreTerminalBenchAdapter(authoritative.benchmarkResults.accuracy ?? 0);
  const totalTrials = authoritative.benchmarkResults.results.length;
  const promptTokens = authoritative.benchmarkResults.results.reduce(
    (sum, entry) => sum + (typeof entry.total_input_tokens === 'number' ? entry.total_input_tokens : 0),
    0,
  );
  const completionTokens = authoritative.benchmarkResults.results.reduce(
    (sum, entry) => sum + (typeof entry.total_output_tokens === 'number' ? entry.total_output_tokens : 0),
    0,
  );
  const totalTokens = promptTokens + completionTokens;

  const startedAt = context.startedAt.toISOString();
  const finishedAt = authoritative.runMetadata.end_time ?? new Date().toISOString();
  const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));
  const warnings: string[] = [];
  const unresolved = authoritative.benchmarkResults.n_unresolved ?? 0;
  if (unresolved > 0) {
    warnings.push(`${unresolved} Terminal-Bench trial(s) were unresolved according to the official harness.`);
  }
  if (totalTrials === 0) {
    warnings.push('Official Terminal-Bench harness produced zero trials.');
  }

  const result: NormalizedRunResult = {
    schemaVersion: '1.0',
    runId: context.runId,
    pack: context.run.pack,
    variant: context.run.variant,
    memoryBackend: memory.id,
    status: totalTrials === 0 ? 'warning' : unresolved > 0 ? 'warning' : score > 0 ? 'passed' : 'failed',
    startedAt,
    finishedAt,
    durationMs,
    warnings,
    notes: [
      'Terminal-Bench evaluated trial(s) through the official `tb run` harness.'.replace('trial(s)', `${totalTrials} trial(s)`),
      `Resolved ${authoritative.benchmarkResults.n_resolved}/${totalTrials} trial(s) (${(score * 100).toFixed(1)}%).`,
      `Agent: ${authoritative.runMetadata.agent_name} ${authoritative.runMetadata.model_name ? `(${authoritative.runMetadata.model_name})` : ''}`.trim(),
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
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: 0,
      latencyMs: durationMs,
      logs: [
        `pack=${context.run.pack}`,
        `variant=${context.run.variant}`,
        `memory=${memory.id}`,
        `tbVersion=${runtime.tbVersion ?? 'unknown'}`,
        `dockerVersion=${runtime.dockerVersion ?? 'unknown'}`,
        `model=${authoritative.runMetadata.model_name ?? context.run.agentModel ?? ''}`,
        `dataset=${authoritative.runMetadata.dataset_name ?? resolveDatasetSelector(packConfig) ?? authoritative.runMetadata.dataset_path ?? 'local'}`,
        `selectedTasks=${selectedTasks?.join(',') ?? '(all)'}`,
      ],
    },
    artifacts: {
      resultPath: '',
      summaryPath: '',
      rawOutputPath: '',
    },
    metadata: {
      ...context.run.metadata,
      benchmarkId: benchmarkMetadata.benchmarkId,
      benchmarkVersion: benchmarkMetadata.benchmarkVersion,
      datasetName: authoritative.runMetadata.dataset_name ?? null,
      datasetVersion: authoritative.runMetadata.dataset_version ?? null,
      datasetPath: authoritative.runMetadata.dataset_path ?? null,
      model: authoritative.runMetadata.model_name ?? context.run.metadata?.model ?? null,
      harnessCommand: runtime.tbCommand,
      harnessVersion: runtime.tbVersion ?? 'installed',
      dockerVersion: runtime.dockerVersion ?? 'unknown',
      pythonCommand: runtime.pythonCommand ?? 'unknown',
      totalTrials,
      resolvedTrials: authoritative.benchmarkResults.n_resolved,
      unresolvedTrials: authoritative.benchmarkResults.n_unresolved,
      attemptsPerTask: authoritative.runMetadata.n_attempts,
    },
  };

  const harnessStdoutPath = store.writeText('harness-stdout.log', harnessStdout);
  const harnessStderrPath = store.writeText('harness-stderr.log', harnessStderr);
  result.artifacts.rawOutputPath = store.writeJson('raw-output.json', {
    pack: 'terminal-bench',
    harnessCommand: [runtime.tbCommand ?? 'tb', ...args],
    harnessRunDirectory: path.resolve(context.outputDir, 'official-harness', context.runId),
    harnessStdoutPath,
    harnessStderrPath,
    authoritative,
  });
  result.artifacts.resultPath = path.resolve(store.baseDir, 'result.json');
  result.artifacts.summaryPath = path.resolve(store.baseDir, 'summary.md');
  store.writeJson('result.json', result);
  store.writeText('summary.md', markdownReportForResult(result));
  return result;
}

export const terminalBenchAdapter: PackAdapter = {
  id: 'terminal-bench',
  description: 'Official Terminal-Bench tb harness with opencode installed-agent integration and authoritative artifacts.',
  optionalDependency: 'terminal-bench',
  checkInstalled(rootDir = process.cwd()) {
    const runtime = inspectTerminalBenchRuntime(rootDir);
    return runtime.problems.length === 0;
  },
  getDoctorDetail(rootDir = process.cwd()) {
    const runtime = inspectTerminalBenchRuntime(rootDir);
    if (runtime.problems.length > 0) {
      return {
        status: 'warn' as const,
        detail: runtime.problems.join(' '),
      };
    }

    return {
      status: 'ok' as const,
      detail:
        'terminal-bench runs through the official host-side tb harness. The host needs tb, Python, Docker, and an opencode config; the installed-agent setup may install Node/opencode-ai inside benchmark containers at run time.',
    };
  },
  async run(context, memory): Promise<NormalizedRunResult> {
    void context;
    void memory;
    throw new BenchmarkRuntimeError(
      'terminal-bench should run through the host-side wrapper. Use bin/eval --pack terminal-bench ... or bin/terminal-bench-eval so the official tb harness runs from the repo-local uv environment.',
    );
  },
};
