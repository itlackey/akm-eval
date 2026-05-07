import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { loadConfig } from '../src/config/load-config.ts';
import { validateConfig } from '../src/config/validate-config.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bunBinary = process.execPath;

setDefaultTimeout(15000);

describe('config loading', () => {
  test('loads planned example config and normalizes it for execution', () => {
    const config = loadConfig(path.resolve(rootDir, 'config/examples/memory-comparison.json'));
    expect(config.version).toBe(1);
    expect(config.runs.length).toBeGreaterThan(1);
    expect(config.runs.some((run) => run.variant === 'akm-memory')).toBe(true);
  });

  test('loads locomo smoke example config', () => {
    const config = loadConfig(path.resolve(rootDir, 'config/examples/locomo-smoke.json'));
    expect(config.version).toBe(1);
    expect(config.runs.some((run) => run.pack === 'locomo')).toBe(true);
    expect(config.runs.some((run) => run.memoryBackend === 'raw-vector')).toBe(true);
  });

  test('runnable smoke examples no longer include blocked akm-memory runs', () => {
    for (const relativePath of [
      'config/examples/beam-smoke.json',
      'config/examples/longmemeval-smoke.json',
      'config/examples/swe-bench-smoke.json',
      'config/examples/terminal-bench-smoke.json',
    ]) {
      const config = loadConfig(path.resolve(rootDir, relativePath));
      expect(config.runs.some((run) => run.memoryBackend === 'akm')).toBe(false);
    }
  });

  test('loads tau-bench smoke example config', () => {
    const config = loadConfig(path.resolve(rootDir, 'config/examples/tau-bench-smoke.json'));
    expect(config.version).toBe(1);
    expect(config.runs.some((run) => run.pack === 'tau-bench')).toBe(true);
    expect(config.runs.some((run) => run.agentProviderConfig?.type === 'openai-compatible')).toBe(true);
  });

  test('validates both planned and internal config shapes', () => {
    const planned = validateConfig({
      schemaVersion: 'akm.eval.config.v1',
      run: { id: 'x', outputDir: 'runs/x' },
      packs: [
        {
          id: 'longmemeval-smoke',
          adapter: 'longmemeval',
          enabled: true,
          config: { evaluatorCommand: 'python scripts/longmemeval-evaluator.py' },
        },
      ],
      variants: [
        {
          id: 'baseline',
          agent: { provider: 'openai-compatible', providerRef: 'openai', model: 'gpt-4o-mini' },
          akm: { enabled: false },
          memory: { backend: 'none' },
        },
      ],
      providers: {
        openai: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          apiKey: '{env:TEST_API_KEY}',
        },
      },
    });
    const internal = validateConfig({
      version: 1,
      runs: [
        {
          pack: 'beam-lite-proxy',
          variant: 'baseline',
          outputDir: 'runs/custom',
        },
      ],
    });
    expect(planned.version).toBe(1);
    expect(internal.runs).toHaveLength(1);
  });

  test('accepts beam planned config with evaluator model override', () => {
    const planned = validateConfig({
      schemaVersion: 'akm.eval.config.v1',
      run: { id: 'beam-smoke', outputDir: 'runs/beam-smoke' },
      packs: [
        {
          id: 'beam-smoke',
          adapter: 'beam',
          enabled: true,
          config: { repoPath: 'vendor/BEAM', evaluatorModel: 'gpt-4.1-mini' },
        },
      ],
      variants: [
        {
          id: 'baseline',
          agent: { provider: 'openai-compatible', providerRef: 'openai', model: 'gpt-4o-mini' },
          akm: { enabled: false },
          memory: { backend: 'none' },
        },
      ],
      providers: {
        openai: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          apiKey: '{env:TEST_API_KEY}',
        },
      },
    });

    expect(planned.runs[0]?.pack).toBe('beam');
    expect(planned.runs[0]?.packConfig?.evaluatorModel).toBe('gpt-4.1-mini');
  });

  test('resolves provider refs and env placeholders in planned configs', () => {
    process.env.TEST_API_KEY = 'secret123';
    const config = validateConfig({
      schemaVersion: 'akm.eval.config.v1',
      run: { id: 'x', outputDir: 'runs/x' },
      packs: [
        {
          id: 'longmemeval-smoke',
          adapter: 'longmemeval',
          enabled: true,
          config: { evaluatorCommand: 'python scripts/longmemeval-evaluator.py' },
        },
      ],
      variants: [
        {
          id: 'baseline',
          agent: { provider: 'openai-compatible', providerRef: 'openai', model: 'gpt-4' },
          akm: { enabled: false },
          memory: { backend: 'none' },
        },
      ],
      providers: {
        openai: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          apiKey: '{env:TEST_API_KEY}',
        },
      },
    });
    expect(config.providers?.openai.apiKey).toBe('secret123');
    expect(config.runs[0].agentProvider).toBe('openai');
    expect(config.runs[0].agentProviderConfig?.type).toBe('openai-compatible');
    delete process.env.TEST_API_KEY;
  });

  test('preserves agent env and akm config in planned runs', () => {
    const config = validateConfig({
      schemaVersion: 'akm.eval.config.v1',
      run: { id: 'terminal', outputDir: 'runs/terminal' },
      packs: [
        {
          id: 'terminal-bench-smoke',
          adapter: 'terminal-bench',
          enabled: true,
        },
      ],
      variants: [
        {
          id: 'akm-memory',
          agent: {
            provider: 'opencode',
            providerRef: 'opencode',
            model: 'opencode/gpt-4.1-mini',
            env: { FOO: 'bar' },
          },
          akm: { enabled: true, command: 'akm', env: { AKM_MODE: 'on' }, configPath: 'config/opencode.akm.json' },
          memory: { backend: 'akm' },
        },
      ],
      providers: {
        opencode: {
          type: 'opencode',
          configPath: 'config/opencode.json',
          defaultModel: 'opencode/gpt-4.1-mini',
        },
      },
    });

    expect(config.runs[0].agentEnvironment).toEqual({ FOO: 'bar' });
    expect(config.runs[0].akmEnabled).toBe(true);
    expect(config.runs[0].akmCommand).toBe('akm');
    expect(config.runs[0].akmEnvironment).toEqual({ AKM_MODE: 'on' });
    expect(config.runs[0].akmConfigPath).toBe('config/opencode.akm.json');
  });

  test('resolves env placeholders in direct config providers', () => {
    process.env.DIRECT_KEY = 'direct-secret';
    const config = validateConfig({
      version: 1,
      runs: [{ pack: 'docs-example', variant: 'baseline', outputDir: 'runs/example', agentProvider: 'local' }],
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:1234/v1',
          apiKey: '{env:DIRECT_KEY}',
          defaultModel: 'gpt-4o-mini',
        },
      },
    });
    expect(config.providers?.local.apiKey).toBe('direct-secret');
    expect(config.runs[0]?.agentProvider).toBe('local');
    expect(config.runs[0]?.agentProviderConfig?.type).toBe('openai-compatible');
    delete process.env.DIRECT_KEY;
  });

  test('resolves direct run provider references from global providers', () => {
    const config = validateConfig({
      version: 1,
      defaults: { outputDir: 'runs/example' },
      runs: [
        {
          id: 'longmemeval-baseline',
          pack: 'longmemeval',
          variant: 'baseline',
          outputDir: 'runs/example/longmemeval/baseline',
          memoryBackend: 'none',
          agentProvider: 'openai-compatible',
          packConfig: { evaluatorCommand: 'python scripts/longmemeval-evaluator.py' },
        },
      ],
      providers: {
        'openai-compatible': {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'test',
          defaultModel: 'gpt-4o-mini',
        },
      },
    });

    expect(config.runs[0]?.agentProvider).toBe('openai-compatible');
    expect(config.runs[0]?.agentProviderConfig).toEqual({
      type: 'openai-compatible',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'test',
      defaultModel: 'gpt-4o-mini',
    });
  });

  test('prefers the repo-managed longmemeval dataset when no datasetPath is configured', async () => {
    const datasetModule = await import('../src/packs/longmemeval/dataset.ts');
    const tmpRoot = path.resolve(rootDir, 'tests/.artifacts/longmemeval-dataset');
    fs.rmSync(tmpRoot, { recursive: true, force: true });
    fs.mkdirSync(path.resolve(tmpRoot, 'datasets/longmemeval'), { recursive: true });
    const repoDatasetPath = path.resolve(tmpRoot, 'datasets/longmemeval/dataset.json');
    fs.writeFileSync(repoDatasetPath, '[]\n');

    const resolved = await datasetModule.resolveDatasetFile(undefined, tmpRoot);
    expect(resolved).toBe(repoDatasetPath);

    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('accepts tau-bench configs with local openai-compatible endpoints and no API key', () => {
    const config = validateConfig({
      version: 1,
      runs: [
        {
          pack: 'tau-bench',
          variant: 'baseline',
          outputDir: 'runs/tau-bench',
          agentProvider: 'local',
          packConfig: { env: 'retail' },
        },
      ],
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://127.0.0.1:1234/v1',
          apiKey: '',
          defaultModel: 'qwen/qwen3.5-9b',
        },
      },
    });

    expect(config.runs[0]?.agentProviderConfig?.apiKey).toBe('');
    expect(config.runs[0]?.agentProviderConfig?.baseURL).toBe('http://127.0.0.1:1234/v1');
  });

  test('rejects direct run configs that reference unknown global providers', () => {
    expect(() =>
      validateConfig({
        version: 1,
        runs: [
          {
            pack: 'longmemeval',
            variant: 'baseline',
            agentProvider: 'missing',
            packConfig: { evaluatorCommand: 'python scripts/longmemeval-evaluator.py' },
          },
        ],
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'test',
            defaultModel: 'gpt-4o-mini',
          },
        },
      }),
    ).toThrow('references unknown provider "missing"');
  });

  test('rejects benchmark runs without a real model provider', () => {
    expect(() =>
      validateConfig({
        schemaVersion: 'akm.eval.config.v1',
        run: { id: 'x', outputDir: 'runs/x' },
        packs: [
          {
            id: 'terminal-bench-smoke',
            adapter: 'terminal-bench',
            enabled: true,
          },
        ],
        variants: [
          {
            id: 'baseline',
            agent: { provider: 'none' },
            akm: { enabled: false },
            memory: { backend: 'none' },
          },
        ],
      }),
    ).toThrow('has no real agent provider configured');
  });

  test('rejects opencode model ids without provider prefix', () => {
    expect(() =>
      validateConfig({
        schemaVersion: 'akm.eval.config.v1',
        run: { id: 'x', outputDir: 'runs/x' },
        packs: [
          {
            id: 'longmemeval-smoke',
            adapter: 'longmemeval',
            enabled: true,
            config: { evaluatorCommand: 'python scripts/longmemeval-evaluator.py' },
          },
        ],
        variants: [
          {
            id: 'baseline',
            agent: { provider: 'opencode', providerRef: 'opencode', model: 'gpt-4.1-mini' },
            akm: { enabled: false },
            memory: { backend: 'none' },
          },
        ],
        providers: {
          opencode: {
            type: 'opencode',
            configPath: 'config/opencode.json',
            defaultModel: 'opencode/gpt-4.1-mini',
          },
        },
      }),
    ).toThrow('must include the provider prefix');
  });

  test('cli smoke paths work for doctor, list, matrix, and run', () => {
    const doctor = Bun.spawnSync({ cmd: [bunBinary, path.resolve(rootDir, 'src/cli.ts'), 'doctor'], cwd: rootDir });
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout.toString()).toContain('memory:akm');
    expect(doctor.stdout.toString()).toContain('memory:raw-vector');
    expect(doctor.stdout.toString()).toContain('pack:beam');
    expect(doctor.stdout.toString()).toContain('pack:terminal-bench');
    expect(doctor.stdout.toString()).toContain('Truthful evaluated memory backends: none, raw-vector');

    const listPacks = Bun.spawnSync({ cmd: [bunBinary, path.resolve(rootDir, 'src/cli.ts'), 'list', 'packs'], cwd: rootDir });
    expect(listPacks.exitCode).toBe(0);
    expect(listPacks.stdout.toString()).toContain('akm-bench');
    expect(listPacks.stdout.toString()).toContain('tau-bench');
    // Verify qa pack was removed
    expect(listPacks.stdout.toString()).not.toContain('qa\t');

    const listVariants = Bun.spawnSync({ cmd: [bunBinary, path.resolve(rootDir, 'src/cli.ts'), 'list', 'variants'], cwd: rootDir });
    expect(listVariants.exitCode).toBe(0);
    expect(listVariants.stdout.toString()).toContain('akm-memory');

    const matrix = Bun.spawnSync({
      cmd: [
        bunBinary,
        path.resolve(rootDir, 'src/cli.ts'),
        'matrix',
        '--config',
        path.resolve(rootDir, 'config/examples/memory-comparison.json'),
      ],
      cwd: rootDir,
    });
    expect(matrix.exitCode).toBe(0);
    expect(matrix.stdout.toString()).toContain('| Memory Status |');
    expect(matrix.stdout.toString()).toContain('| longmemeval-smoke-akm-memory | longmemeval | akm-memory | akm | blocked: ');

    const blockedBackendRun = Bun.spawnSync({
      cmd: [
        bunBinary,
        path.resolve(rootDir, 'src/cli.ts'),
        'run',
        '--pack',
        'longmemeval',
        '--variant',
        'akm-memory',
        '--config',
        path.resolve(rootDir, 'config/examples/memory-comparison.json'),
      ],
      cwd: rootDir,
    });
    expect(blockedBackendRun.exitCode).toBe(1);
    expect(blockedBackendRun.stderr.toString()).toContain('not a truthful evaluated benchmark path in this repo yet');
    expect(blockedBackendRun.stderr.toString()).toContain('memory backend "akm"');

    // Create a temporary local dataset file so the run does not depend on network
    const tmpDir = path.resolve(rootDir, 'tests/.artifacts/tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpDatasetPath = path.resolve(tmpDir, 'dataset.json');
    fs.writeFileSync(
      tmpDatasetPath,
      JSON.stringify([
        {
          question_id: 'lme-001',
          question_type: 'single-session-user',
          haystack_sessions: [
            [
              { role: 'user', content: 'My favorite color is blue.' },
              { role: 'assistant', content: 'Blue is a great choice!' },
            ],
          ],
          question: 'What is my favorite color?',
          answer: 'blue',
        },
      ]),
    );

    const tmpConfigPath = path.resolve(tmpDir, 'longmemeval-smoke.json');
    fs.writeFileSync(
      tmpConfigPath,
      JSON.stringify({
        schemaVersion: 'akm.eval.config.v1',
        run: { id: 'longmemeval-smoke', outputDir: 'runs/longmemeval-smoke' },
        packs: [
          {
            id: 'longmemeval-smoke',
            adapter: 'longmemeval',
            enabled: true,
            config: {
              datasetPath: tmpDatasetPath,
              maxQuestions: 1,
              evaluatorCommand: 'python scripts/longmemeval-evaluator.py',
            },
          },
        ],
        variants: [
          {
            id: 'baseline',
            agent: { provider: 'openai-compatible', providerRef: 'local', model: 'gpt-4o-mini' },
            akm: { enabled: false },
            memory: { backend: 'none' },
          },
        ],
        providers: {
          local: {
            type: 'openai-compatible',
            baseURL: 'http://127.0.0.1:9/v1',
            apiKey: 'test',
          },
        },
      }),
    );

    const outDir = path.resolve(rootDir, 'tests/.artifacts/run-smoke');
    fs.rmSync(outDir, { recursive: true, force: true });
    const run = Bun.spawnSync({
      cmd: [
        bunBinary,
        path.resolve(rootDir, 'src/cli.ts'),
        'run',
        '--pack',
        'longmemeval',
        '--variant',
        'baseline',
        '--config',
        tmpConfigPath,
        '--out',
        outDir,
      ],
      cwd: rootDir,
    });

    expect(run.exitCode).toBe(1);
    expect(run.stderr.toString()).toContain('longmemeval agent run failed');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
