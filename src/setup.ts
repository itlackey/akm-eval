import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline/promises';
import type { AgentProviderConfig, EvalConfig, RunDefinition } from './core/types.ts';
import { runDoctorChecks } from './core/environment.ts';
import { validateConfig } from './config/validate-config.ts';

type SetupPackId = 'locomo' | 'longmemeval' | 'beam' | 'swe-bench' | 'tau-bench' | 'terminal-bench';
type ProviderType = 'openai-compatible' | 'opencode';

interface OpenAISetupConfig {
  baseURL: string;
  apiKey: string;
  defaultModel: string;
  timeout?: number;
}

interface OpencodeSetupConfig {
  configPath: string;
  defaultModel: string;
}

export interface StarterConfigOptions {
  rootDir: string;
  configPath: string;
  packs: SetupPackId[];
  primaryProvider: ProviderType;
  preferRepoManagedDatasetPaths?: boolean;
  openAI?: OpenAISetupConfig;
  opencode?: OpencodeSetupConfig;
  beamRepoPath?: string;
}

interface SetupPackDefinition {
  id: SetupPackId;
  summary: string;
  supportedProviders: ProviderType[];
  repoManagedDataset?: 'LoCoMo' | 'LongMemEval';
  blockedWhenMissing: string;
}

interface SetupActionResult {
  name: string;
  ok: boolean;
  detail: string;
}

interface SetupPackStatus {
  packId: SetupPackId;
  doctorResult: SetupActionResult | null;
  deeperCheckResult: SetupActionResult | null;
}

const SETUP_PACKS: SetupPackDefinition[] = [
  {
    id: 'locomo',
    summary: 'Official LoCoMo dataset plus bundled evaluator wrapper.',
    supportedProviders: ['openai-compatible', 'opencode'],
    repoManagedDataset: 'LoCoMo',
    blockedWhenMissing: 'LoCoMo still needs python3 plus numpy, regex, and nltk for the bundled evaluator wrapper.',
  },
  {
    id: 'longmemeval',
    summary: 'Official LongMemEval dataset plus external official evaluator command.',
    supportedProviders: ['openai-compatible', 'opencode'],
    repoManagedDataset: 'LongMemEval',
    blockedWhenMissing: 'LongMemEval still needs a configured evaluator command. Setup defaults to the bundled scripts/longmemeval-evaluator.py wrapper, but the Python environment running it still needs openai plus OPENAI_BASE_URL or OPENAI_API_KEY.',
  },
  {
    id: 'beam',
    summary: 'Official upstream BEAM repo and upstream evaluation pipeline.',
    supportedProviders: ['openai-compatible', 'opencode'],
    blockedWhenMissing:
      'BEAM remains blocked until the upstream repo, prepared dataset directories, and judge credentials exist outside this repo.',
  },
  {
    id: 'swe-bench',
    summary: 'Official SWE-bench Docker harness.',
    supportedProviders: ['openai-compatible', 'opencode'],
    blockedWhenMissing:
      'SWE-bench requires Docker plus a repo-local uv-managed harness environment under .akm/evals/venvs/swe-bench.',
  },
  {
    id: 'tau-bench',
    summary: 'Official tau-bench Python wrapper.',
    supportedProviders: ['openai-compatible'],
    blockedWhenMissing:
      'tau-bench remains blocked until the official tau-bench package is available in the runtime Python environment.',
  },
  {
    id: 'terminal-bench',
    summary: 'Official Terminal-Bench tb harness.',
    supportedProviders: ['opencode'],
    blockedWhenMissing:
      'Terminal-Bench requires Docker, an opencode config, and a repo-local uv-managed harness environment under .akm/evals/venvs/terminal-bench.',
  },
];

function printSetupStep(step: number, total: number, title: string): void {
  console.log(`Step ${step}/${total}: ${title}`);
}

function setupUsage(): string {
  return [
    'Usage:',
    '  bun run setup:legacy',
    '  bun run setup:legacy --help',
  ].join('\n');
}

function isSetupPackId(value: string): value is SetupPackId {
  return SETUP_PACKS.some((pack) => pack.id === value);
}

function relativePath(fromDir: string, targetPath: string): string {
  const relative = path.relative(fromDir, targetPath);
  return relative.length > 0 ? relative : '.';
}

function providerForPack(packId: SetupPackId, primaryProvider: ProviderType): ProviderType {
  if (packId === 'tau-bench') {
    return 'openai-compatible';
  }
  if (packId === 'terminal-bench') {
    return 'opencode';
  }
  return primaryProvider;
}

function createProviderConfig(providerType: ProviderType, options: StarterConfigOptions): AgentProviderConfig {
  if (providerType === 'openai-compatible') {
    if (!options.openAI) {
      throw new Error('openai-compatible provider config was not collected');
    }
    return {
      type: 'openai-compatible',
      baseURL: options.openAI.baseURL,
      apiKey: options.openAI.apiKey,
      defaultModel: options.openAI.defaultModel,
      ...(typeof options.openAI.timeout === 'number' ? { timeout: options.openAI.timeout } : {}),
    };
  }

  if (!options.opencode) {
    throw new Error('opencode provider config was not collected');
  }
  return {
    type: 'opencode',
    configPath: options.opencode.configPath,
    defaultModel: options.opencode.defaultModel,
  };
}

function providerKeyForType(providerType: ProviderType): string {
  return providerType;
}

function createPackConfig(packId: SetupPackId, options: StarterConfigOptions): Record<string, unknown> {
  switch (packId) {
    case 'locomo':
      return {
        smoke: true,
        maxSamples: 1,
        maxQuestions: 5,
        topK: 5,
        maxContextTokens: options.openAI?.baseURL && options.openAI.baseURL !== 'https://api.openai.com/v1' ? 8000 : 16000,
      };
    case 'longmemeval':
      return {
        ...(options.preferRepoManagedDatasetPaths !== false ? { datasetPath: 'datasets/longmemeval/dataset.json' } : {}),
        evaluatorCommand: 'python scripts/longmemeval-evaluator.py',
        smoke: true,
        maxQuestions: 5,
        questionCategories: ['single-session', 'multi-session'],
      };
    case 'beam':
      return {
        repoPath: options.beamRepoPath ?? 'vendor/BEAM',
        pythonBin: '.akm/evals/venvs/beam/bin/python',
        chatSizes: ['100K'],
        smoke: true,
        maxConversations: 1,
        maxQuestionsPerType: 1,
      };
    case 'swe-bench':
      return {
        datasetName: 'SWE-bench/SWE-bench_Verified',
        split: 'test',
        smoke: true,
        maxTasks: 1,
        maxWorkers: 1,
        timeoutSeconds: 1800,
        cacheLevel: 'env',
        namespace: 'swebench',
      };
    case 'tau-bench':
      return {
        env: 'retail',
        smoke: true,
        taskSplit: 'test',
        numTrials: 1,
        maxConcurrency: 1,
        agentStrategy: 'tool-calling',
        userStrategy: 'llm',
      };
    case 'terminal-bench':
      return {
        smoke: true,
        taskIds: ['hello-world'],
        nConcurrent: 1,
        nAttempts: 1,
        dataset: 'terminal-bench-core==0.1.1',
      };
  }
}

export function buildStarterConfig(options: StarterConfigOptions): EvalConfig {
  const configDir = path.dirname(options.configPath);
  const providerEntries = requiredProviderTypes(options.packs, options.primaryProvider).map((providerType) => [
    providerKeyForType(providerType),
    createProviderConfig(providerType, options),
  ] as const);
  const providers = Object.fromEntries(providerEntries);
  const runs: RunDefinition[] = options.packs.map((packId) => {
    const providerType = providerForPack(packId, options.primaryProvider);
    const outputDir = relativePath(configDir, path.resolve(options.rootDir, 'runs', 'legacy-setup', packId, 'baseline'));

    return {
      id: `${packId}-baseline`,
      pack: packId,
      variant: 'baseline',
      outputDir,
      memoryBackend: 'none',
      agentProvider: providerKeyForType(providerType),
      packConfig: createPackConfig(packId, options),
    };
  });

  return validateConfig({
    version: 1,
    defaults: {
      outputDir: relativePath(configDir, path.resolve(options.rootDir, 'runs', 'legacy-setup')),
      memoryBackend: 'none',
    },
    runs,
    providers,
  });
}

function buildStarterConfigDocument(options: StarterConfigOptions): EvalConfig {
  const configDir = path.dirname(options.configPath);
  const providerEntries = requiredProviderTypes(options.packs, options.primaryProvider).map((providerType) => [
    providerKeyForType(providerType),
    createProviderConfig(providerType, options),
  ] as const);

  return {
    version: 1,
    defaults: {
      outputDir: relativePath(configDir, path.resolve(options.rootDir, 'runs', 'legacy-setup')),
      memoryBackend: 'none',
    },
    runs: options.packs.map((packId) => {
      const providerType = providerForPack(packId, options.primaryProvider);
      return {
        id: `${packId}-baseline`,
        pack: packId,
        variant: 'baseline',
        outputDir: relativePath(configDir, path.resolve(options.rootDir, 'runs', 'legacy-setup', packId, 'baseline')),
        memoryBackend: 'none',
        agentProvider: providerKeyForType(providerType),
        packConfig: createPackConfig(packId, options),
      };
    }),
    providers: Object.fromEntries(providerEntries),
  };
}

function summarizeRepoManagedDatasets(packs: SetupPackId[]): string[] {
  return Array.from(
    new Set(
      packs
        .map((packId) => SETUP_PACKS.find((pack) => pack.id === packId)?.repoManagedDataset)
        .filter((value): value is 'LoCoMo' | 'LongMemEval' => Boolean(value)),
    ),
  );
}

function preflightDoctorCheck(doctorChecks: ReturnType<typeof runDoctorChecks>, packId: SetupPackId): SetupActionResult | null {
  const check = doctorChecks.find((entry) => entry.name === `pack:${packId}`);
  if (!check) {
    return null;
  }
  return {
    name: `${packId} preflight`,
    ok: check.status === 'ok',
    detail: check.detail,
  };
}

async function runRepoManagedDownloads(rootDir: string, datasetNames: string[]): Promise<SetupActionResult[]> {
  const results: SetupActionResult[] = [];
  for (const datasetName of datasetNames) {
    console.log(`Running dataset download for ${datasetName}. This may take a while.`);
    const proc = Bun.spawn({
      cmd: [process.execPath, path.resolve(rootDir, 'bin/downloads'), datasetName],
      cwd: rootDir,
      stdout: 'inherit',
      stderr: 'inherit',
      env: process.env,
    });
    const exitCode = await proc.exited;
    results.push({
      name: `download:${datasetName}`,
      ok: exitCode === 0,
      detail: exitCode === 0 ? 'download completed' : `download exited with code ${exitCode}`,
    });
  }
  return results;
}

async function runBeamPreflight(rootDir: string, beamRepoPath: string): Promise<SetupActionResult> {
  const scriptPath = path.resolve(rootDir, 'scripts/setup-beam-runtime.sh');
  console.log('Running deeper BEAM preflight. This is read-only and may pause while it checks Python, repo, dataset, and judge configuration.');
  const proc = Bun.spawn({
    cmd: ['bash', scriptPath, '--check', '--require-judge', '--repo', beamRepoPath],
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  });
  const exitCode = await proc.exited;
  return {
    name: 'beam preflight',
    ok: exitCode === 0,
    detail: exitCode === 0 ? 'BEAM preflight completed' : `beam preflight exited with code ${exitCode}`,
  };
}

function formatActionResult(result: SetupActionResult): string {
  return `${result.ok ? 'OK' : 'WARN'} ${result.name}: ${result.detail}`;
}

function resultForPack(statuses: SetupPackStatus[], packId: SetupPackId): SetupActionResult | null {
  const status = statuses.find((entry) => entry.packId === packId);
  if (!status) {
    return null;
  }
  return status.deeperCheckResult ?? status.doctorResult;
}

async function promptLine(
  rl: readline.Interface,
  message: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue !== undefined && defaultValue.length > 0 ? ` [${defaultValue}]` : '';
  const response = (await rl.question(`${message}${suffix}: `)).trim();
  return response.length > 0 ? response : (defaultValue ?? '');
}

async function promptYesNo(
  rl: readline.Interface,
  message: string,
  defaultValue: boolean,
): Promise<boolean> {
  const suffix = defaultValue ? 'Y/n' : 'y/N';
  while (true) {
    const response = (await rl.question(`${message} [${suffix}]: `)).trim().toLowerCase();
    if (!response) {
      return defaultValue;
    }
    if (['y', 'yes'].includes(response)) {
      return true;
    }
    if (['n', 'no'].includes(response)) {
      return false;
    }
    console.log('Enter yes or no.');
  }
}

async function promptPackSelection(rl: readline.Interface): Promise<SetupPackId[]> {
  console.log('Select pack(s) to include in the starter config. Enter ids or numbers separated by commas.');
  SETUP_PACKS.forEach((pack, index) => {
    console.log(`  ${index + 1}. ${pack.id} - ${pack.summary}`);
  });

  while (true) {
    const response = (await rl.question('Packs [locomo,longmemeval]: ')).trim();
    const rawValues = response.length > 0 ? response.split(',').map((value) => value.trim()).filter(Boolean) : ['locomo', 'longmemeval'];
    const resolved = rawValues.map((value) => {
      const numeric = Number(value);
      if (Number.isInteger(numeric) && numeric >= 1 && numeric <= SETUP_PACKS.length) {
        return SETUP_PACKS[numeric - 1]?.id;
      }
      return value;
    });

    if (resolved.every((value): value is SetupPackId => typeof value === 'string' && isSetupPackId(value))) {
      return Array.from(new Set(resolved));
    }

    console.log(`Unknown pack selection. Valid ids: ${SETUP_PACKS.map((pack) => pack.id).join(', ')}`);
  }
}

async function promptProviderType(
  rl: readline.Interface,
  packs: SetupPackId[],
): Promise<ProviderType> {
  const supportsOpenAI = packs.some((packId) => providerForPack(packId, 'openai-compatible') === 'openai-compatible');
  const supportsOpencode = packs.some((packId) => providerForPack(packId, 'opencode') === 'opencode');

  if (supportsOpenAI && !supportsOpencode) {
    console.log('Selected packs require openai-compatible provider config.');
    return 'openai-compatible';
  }

  if (supportsOpencode && !supportsOpenAI) {
    console.log('Selected packs require opencode provider config.');
    return 'opencode';
  }

  while (true) {
    const response = (await rl.question('Primary provider for packs that support both [openai-compatible/opencode] [openai-compatible]: '))
      .trim()
      .toLowerCase();
    if (!response || response === 'openai-compatible') {
      return 'openai-compatible';
    }
    if (response === 'opencode') {
      return 'opencode';
    }
    console.log('Enter openai-compatible or opencode.');
  }
}

async function promptOpenAIConfig(rl: readline.Interface): Promise<OpenAISetupConfig> {
  const baseURL = await promptLine(rl, 'OpenAI-compatible base URL', 'https://api.openai.com/v1');
  const defaultTimeout = baseURL === 'https://api.openai.com/v1' ? '120000' : '600000';
  const timeoutInput = await promptLine(
    rl,
    'Request timeout in milliseconds (increase this for slower local models)',
    defaultTimeout,
  );
  const parsedTimeout = Number(timeoutInput);
  return {
    baseURL,
    apiKey: await promptLine(
      rl,
      'API key value or env placeholder (leave blank if the endpoint does not require one)',
      baseURL === 'https://api.openai.com/v1' ? '{env:OPENAI_API_KEY}' : '',
    ),
    defaultModel: await promptLine(rl, 'Default model', 'gpt-4o-mini'),
    timeout: Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? Math.floor(parsedTimeout) : undefined,
  };
}

async function promptOpencodeConfig(rl: readline.Interface): Promise<OpencodeSetupConfig> {
  return {
    configPath: await promptLine(rl, 'Path to opencode config file', 'config/opencode.json'),
    defaultModel: await promptLine(rl, 'Default model', 'opencode/gpt-4.1-mini'),
  };
}

function requiredProviderTypes(packs: SetupPackId[], primaryProvider: ProviderType): ProviderType[] {
  return Array.from(new Set(packs.map((packId) => providerForPack(packId, primaryProvider))));
}

function packDefinition(packId: SetupPackId): SetupPackDefinition {
  const entry = SETUP_PACKS.find((pack) => pack.id === packId);
  if (!entry) {
    throw new Error(`Unknown setup pack ${packId}`);
  }
  return entry;
}

export async function runSetupCommand(rootDir: string, args: string[]): Promise<number> {
  if (args.includes('--help')) {
    console.log(setupUsage());
    return 0;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const totalSteps = 5;
    console.log('This legacy setup flow writes a starter config, can optionally download repo-managed datasets, and can optionally run read-only checks.');
    console.log('It does not install external tooling for you, and answering no skips the optional action instead of trying to install anything.');
    console.log('Primary operator flow now starts from committed example configs and direct wrapper commands.');
    console.log('');

    printSetupStep(1, totalSteps, 'choose packs');
    const packs = await promptPackSelection(rl);

    printSetupStep(2, totalSteps, 'choose provider connections');
    const primaryProvider = await promptProviderType(rl, packs);
    const providersNeeded = requiredProviderTypes(packs, primaryProvider);
    const openAI = providersNeeded.includes('openai-compatible') ? await promptOpenAIConfig(rl) : undefined;
    const opencode = providersNeeded.includes('opencode') ? await promptOpencodeConfig(rl) : undefined;

    printSetupStep(3, totalSteps, 'detect current runtime status');
    console.log('Checking the selected packs with the same runtime detection used by `bin/doctor`...');
    const doctorChecks = runDoctorChecks(rootDir);
    for (const packId of packs) {
      const detected = doctorChecks.find((entry) => entry.name === `pack:${packId}`);
      if (!detected) {
        continue;
      }
      console.log(`${detected.status.toUpperCase()} ${packId}: ${detected.detail}`);
    }

    printSetupStep(4, totalSteps, 'choose optional actions');
    const beamRepoPath = packs.includes('beam')
      ? await promptLine(rl, 'BEAM repo path', 'vendor/BEAM')
      : undefined;
    const repoManagedDatasets = summarizeRepoManagedDatasets(packs);
    const downloadDatasets = repoManagedDatasets.length > 0
      ? await promptYesNo(
        rl,
        `Download repo-managed datasets now (${repoManagedDatasets.join(', ')})? Yes = download now. No = only write the config`,
        true,
      )
      : false;
    const runBeamCheck = packs.includes('beam')
      ? await promptYesNo(
        rl,
        'Run deeper BEAM preflight now? Yes = run read-only checks now and it may pause. No = skip BEAM preflight',
        doctorChecks.find((entry) => entry.name === 'pack:beam')?.status === 'ok',
      )
      : false;

    printSetupStep(5, totalSteps, 'write starter config');
    const configPathInput = await promptLine(rl, 'Starter config path', 'config/examples/runs/legacy-setup-starter.json');
    const configPath = path.resolve(rootDir, configPathInput);
    if (fs.existsSync(configPath)) {
      const overwrite = await promptYesNo(rl, `Overwrite existing file ${configPathInput}`, false);
      if (!overwrite) {
        console.log('Aborted without changing the existing config file.');
        return 1;
      }
    }

    const config = buildStarterConfig({
      rootDir,
      configPath,
      packs,
      primaryProvider,
      preferRepoManagedDatasetPaths: downloadDatasets,
      openAI,
      opencode,
      beamRepoPath,
    });
    const configDocument = buildStarterConfigDocument({
      rootDir,
      configPath,
      packs,
      primaryProvider,
      preferRepoManagedDatasetPaths: downloadDatasets,
      openAI,
      opencode,
      beamRepoPath,
    });

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(configDocument, null, 2)}\n`, 'utf8');

    const actions: SetupActionResult[] = [];
    if (downloadDatasets) {
      actions.push(...(await runRepoManagedDownloads(rootDir, repoManagedDatasets)));
    }
    const packStatuses: SetupPackStatus[] = [];
    for (const packId of packs) {
      const doctorResult = preflightDoctorCheck(doctorChecks, packId);
      let deeperCheckResult: SetupActionResult | null = null;
      if (packId === 'beam' && runBeamCheck) {
          deeperCheckResult = await runBeamPreflight(rootDir, beamRepoPath ?? 'vendor/BEAM');
          actions.push(deeperCheckResult);
      }
      packStatuses.push({ packId, doctorResult, deeperCheckResult });
    }

    console.log('');
    console.log(`Wrote starter config to ${path.relative(rootDir, configPath) || path.basename(configPath)}.`);
    console.log('Selected runs:');
    for (const run of config.runs) {
      console.log(`- ${run.id}: pack=${run.pack}, provider=${run.agentProvider ?? 'unknown'}, output=${run.outputDir}`);
    }

    if (actions.length > 0) {
      console.log('');
      console.log('Actions:');
      actions.forEach((result) => console.log(`- ${formatActionResult(result)}`));
    }

    const blockers = packs
      .map((packId) => {
        const result = resultForPack(packStatuses, packId);
        if (result && !result.ok) {
          return `${packId}: ${result.detail}`;
        }
        return null;
      })
      .filter((detail): detail is string => Boolean(detail));
    if (blockers.length > 0) {
      console.log('');
      console.log('Explicit blockers still remaining:');
      blockers.forEach((detail) => console.log(`- ${detail}`));
    }

    const followUpNotes: string[] = [];
    if (packs.includes('longmemeval')) {
      followUpNotes.push(
        downloadDatasets
          ? 'longmemeval: the starter config points at the repo-managed dataset and bundled evaluator command, but the Python environment used by that evaluator still needs the `openai` package plus `OPENAI_BASE_URL` for a local compatible endpoint or `OPENAI_API_KEY` for cloud OpenAI.'
          : 'longmemeval: because you skipped downloading datasets now, the generated config leaves `datasetPath` unset so the built-in resolver can download the official dataset on first use.',
      );
    }
    if (!downloadDatasets && repoManagedDatasets.length > 0) {
      followUpNotes.push('No datasets were downloaded during setup. You can download them later with `bin/downloads` or use a committed example config that resolves datasets on first use.');
    }
    if (packs.includes('beam') && !runBeamCheck) {
      followUpNotes.push('beam: deeper BEAM preflight was skipped. Run `bin/doctor --pack beam` or `bin/beam-doctor` later when you want to verify the upstream repo, dataset, judge path, and repo-local runtime environment.');
    }
    if (openAI && openAI.apiKey.length === 0) {
      followUpNotes.push(
        'openai-compatible provider: blank API keys are allowed for no-auth local endpoints such as LM Studio. This repo omits the Authorization header for agent calls and supplies a dummy key only where an upstream client library requires a non-empty value.',
      );
    }
    if (followUpNotes.length > 0) {
      console.log('');
      console.log('Important notes:');
      followUpNotes.forEach((detail) => console.log(`- ${detail}`));
    }

    const nextRunnableRun = config.runs.find((run) => {
      const result = resultForPack(packStatuses, run.pack as SetupPackId);
      return !result || result.ok;
    });
    console.log('');
    if (nextRunnableRun) {
      console.log(
        `Next: bin/eval --pack ${nextRunnableRun.pack} --variant ${nextRunnableRun.variant} --config ${path.relative(rootDir, configPath) || configPath}`,
      );
    } else if (config.runs[0]) {
      console.log('Next: resolve the blocker(s) above before running `bin/eval ...`.');
    }
    return 0;
  } finally {
    rl.close();
  }
}
