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
  openAI?: OpenAISetupConfig;
  opencode?: OpencodeSetupConfig;
  beamRepoPath?: string;
}

interface SetupPackDefinition {
  id: SetupPackId;
  summary: string;
  supportedProviders: ProviderType[];
  repoManagedDataset?: 'LoCoMo' | 'LongMemEval';
  externalPrereqPrompt?: string;
  blockedWhenMissing: string;
}

interface SetupActionResult {
  name: string;
  ok: boolean;
  detail: string;
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
    blockedWhenMissing: 'LongMemEval still needs the external official evaluator command configured in pack.config.evaluatorCommand.',
  },
  {
    id: 'beam',
    summary: 'Official upstream BEAM repo and upstream evaluation pipeline.',
    supportedProviders: ['openai-compatible', 'opencode'],
    externalPrereqPrompt:
      'Do you already have the upstream BEAM checkout, prepared dataset, and judge credentials available',
    blockedWhenMissing:
      'BEAM remains blocked until the upstream repo, prepared dataset directories, and judge credentials exist outside this repo.',
  },
  {
    id: 'swe-bench',
    summary: 'Official SWE-bench Docker harness.',
    supportedProviders: ['openai-compatible', 'opencode'],
    externalPrereqPrompt: 'Do you already have Docker and the official swebench harness installed',
    blockedWhenMissing:
      'SWE-bench remains blocked until Docker and the official swebench Python harness are installed and runnable.',
  },
  {
    id: 'tau-bench',
    summary: 'Official tau-bench Python wrapper.',
    supportedProviders: ['openai-compatible'],
    externalPrereqPrompt: 'Do you already have Python and the official tau-bench package installed',
    blockedWhenMissing:
      'tau-bench remains blocked until Python and the official tau-bench package are installed outside this repo.',
  },
  {
    id: 'terminal-bench',
    summary: 'Official Terminal-Bench tb harness.',
    supportedProviders: ['opencode'],
    externalPrereqPrompt: 'Do you already have tb, Python, and Docker installed for Terminal-Bench',
    blockedWhenMissing:
      'Terminal-Bench remains blocked until the official tb CLI, Python, Docker, and an opencode config are available.',
  },
];

function setupUsage(): string {
  return [
    'Usage:',
    '  bun run setup',
    '  bun run setup --help',
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
        maxContextTokens: 16000,
      };
    case 'longmemeval':
      return {
        evaluatorCommand: 'python scripts/longmemeval-evaluator.py',
        smoke: true,
        maxQuestions: 10,
        questionCategories: ['single-session', 'multi-session'],
      };
    case 'beam':
      return {
        repoPath: options.beamRepoPath ?? 'vendor/BEAM',
        pythonBin: 'python3.11',
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
    const outputDir = relativePath(configDir, path.resolve(options.rootDir, 'runs', 'setup', packId, 'baseline'));

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
      outputDir: relativePath(configDir, path.resolve(options.rootDir, 'runs', 'setup')),
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
      outputDir: relativePath(configDir, path.resolve(options.rootDir, 'runs', 'setup')),
      memoryBackend: 'none',
    },
    runs: options.packs.map((packId) => {
      const providerType = providerForPack(packId, options.primaryProvider);
      return {
        id: `${packId}-baseline`,
        pack: packId,
        variant: 'baseline',
        outputDir: relativePath(configDir, path.resolve(options.rootDir, 'runs', 'setup', packId, 'baseline')),
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

function preflightDoctorCheck(packId: SetupPackId): SetupActionResult | null {
  const check = runDoctorChecks().find((entry) => entry.name === `pack:${packId}`);
  if (!check) {
    return null;
  }
  return {
    name: `${packId} preflight`,
    ok: check.status === 'ok',
    detail: check.detail,
  };
}

function runRepoManagedDownloads(rootDir: string, datasetNames: string[]): SetupActionResult[] {
  return datasetNames.map((datasetName) => {
    const result = Bun.spawnSync({
      cmd: [process.execPath, path.resolve(rootDir, 'scripts/download-datasets.ts'), datasetName],
      cwd: rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
      env: process.env,
    });
    const stdout = result.stdout.toString().trim();
    const stderr = result.stderr.toString().trim();
    return {
      name: `download:${datasetName}`,
      ok: result.exitCode === 0,
      detail: stdout || stderr || `download exited with code ${result.exitCode}`,
    };
  });
}

function runBeamPreflight(rootDir: string, beamRepoPath: string): SetupActionResult {
  const scriptPath = path.resolve(rootDir, 'scripts/setup-beam-runtime.sh');
  const result = Bun.spawnSync({
    cmd: ['bash', scriptPath, '--check', '--require-judge', '--repo', beamRepoPath],
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
    env: process.env,
  });
  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();
  return {
    name: 'beam preflight',
    ok: result.exitCode === 0,
    detail: stdout || stderr || `beam preflight exited with code ${result.exitCode}`,
  };
}

function formatActionResult(result: SetupActionResult): string {
  return `${result.ok ? 'OK' : 'WARN'} ${result.name}: ${result.detail}`;
}

async function promptLine(
  rl: readline.Interface,
  message: string,
  defaultValue?: string,
): Promise<string> {
  const suffix = defaultValue !== undefined ? ` [${defaultValue}]` : '';
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
  return {
    baseURL: await promptLine(rl, 'OpenAI-compatible base URL', 'https://api.openai.com/v1'),
    apiKey: await promptLine(rl, 'API key value or env placeholder', '{env:OPENAI_API_KEY}'),
    defaultModel: await promptLine(rl, 'Default model', 'gpt-4o-mini'),
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
    console.log('This setup flow writes a starter config, can download repo-managed datasets, and can run limited preflight checks.');
    console.log('It does not pretend external blockers are solved when upstream harnesses, Docker, or credentials are missing.');
    console.log('');

    const packs = await promptPackSelection(rl);
    const primaryProvider = await promptProviderType(rl, packs);
    const providersNeeded = requiredProviderTypes(packs, primaryProvider);
    const openAI = providersNeeded.includes('openai-compatible') ? await promptOpenAIConfig(rl) : undefined;
    const opencode = providersNeeded.includes('opencode') ? await promptOpencodeConfig(rl) : undefined;
    const beamRepoPath = packs.includes('beam')
      ? await promptLine(rl, 'BEAM repo path', 'vendor/BEAM')
      : undefined;
    const repoManagedDatasets = summarizeRepoManagedDatasets(packs);
    const downloadDatasets = repoManagedDatasets.length > 0
      ? await promptYesNo(rl, `Download repo-managed datasets now (${repoManagedDatasets.join(', ')})`, true)
      : false;

    const prereqAnswers = new Map<SetupPackId, boolean>();
    for (const packId of packs) {
      const prompt = packDefinition(packId).externalPrereqPrompt;
      if (!prompt) {
        continue;
      }
      prereqAnswers.set(packId, await promptYesNo(rl, prompt, false));
    }

    const configPathInput = await promptLine(rl, 'Starter config path', 'config/examples/runs/setup-starter.json');
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
      openAI,
      opencode,
      beamRepoPath,
    });
    const configDocument = buildStarterConfigDocument({
      rootDir,
      configPath,
      packs,
      primaryProvider,
      openAI,
      opencode,
      beamRepoPath,
    });

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(configDocument, null, 2)}\n`, 'utf8');

    const actions: SetupActionResult[] = [];
    if (downloadDatasets) {
      actions.push(...runRepoManagedDownloads(rootDir, repoManagedDatasets));
    }
    for (const packId of packs) {
      if (prereqAnswers.get(packId) !== true) {
        continue;
      }
      if (packId === 'beam') {
        actions.push(runBeamPreflight(rootDir, beamRepoPath ?? 'vendor/BEAM'));
        continue;
      }
      const result = preflightDoctorCheck(packId);
      if (result) {
        actions.push(result);
      }
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
      .filter((packId) => prereqAnswers.get(packId) === false)
      .map((packId) => `${packId}: ${packDefinition(packId).blockedWhenMissing}`);
    if (blockers.length > 0) {
      console.log('');
      console.log('Explicit blockers still remaining:');
      blockers.forEach((detail) => console.log(`- ${detail}`));
    }

    const firstRun = config.runs[0];
    console.log('');
    if (firstRun) {
      console.log(
        `Next: bun run eval -- --pack ${firstRun.pack} --variant ${firstRun.variant} --config ${path.relative(rootDir, configPath) || configPath}`,
      );
    }
    return 0;
  } finally {
    rl.close();
  }
}
