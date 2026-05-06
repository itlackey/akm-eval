import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';
import { loadConfig } from '../src/config/load-config.ts';
import { validateConfig } from '../src/config/validate-config.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bunBinary = process.execPath;

describe('config loading', () => {
  test('loads planned example config and normalizes it for execution', () => {
    const config = loadConfig(path.resolve(rootDir, 'config/examples/memory-comparison.json'));
    expect(config.version).toBe(1);
    expect(config.runs.length).toBeGreaterThan(1);
    expect(config.runs.some((run) => run.variant === 'akm-memory')).toBe(true);
  });

  test('validates both planned and internal config shapes', () => {
    const planned = validateConfig({
      schemaVersion: 'akm.eval.config.v1',
      run: { id: 'x', outputDir: 'runs/x' },
      packs: [{ id: 'longmemeval-smoke', adapter: 'longmemeval', enabled: true }],
      variants: [
        {
          id: 'baseline',
          agent: { provider: 'none' },
          akm: { enabled: false },
          memory: { backend: 'none' },
        },
      ],
    });
    const internal = validateConfig({
      version: 1,
      runs: [{ pack: 'beam', variant: 'baseline', outputDir: 'runs/custom' }],
    });
    expect(planned.version).toBe(1);
    expect(internal.runs).toHaveLength(1);
  });

  test('resolves provider refs and env placeholders in planned configs', () => {
    process.env.TEST_API_KEY = 'secret123';
    const config = validateConfig({
      schemaVersion: 'akm.eval.config.v1',
      run: { id: 'x', outputDir: 'runs/x' },
      packs: [{ id: 'longmemeval-smoke', adapter: 'longmemeval', enabled: true }],
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

  test('resolves env placeholders in direct config providers', () => {
    process.env.DIRECT_KEY = 'direct-secret';
    const config = validateConfig({
      version: 1,
      runs: [{ pack: 'longmemeval', variant: 'baseline', outputDir: 'runs/longmemeval' }],
      providers: {
        local: {
          type: 'openai-compatible',
          baseURL: 'http://localhost:1234/v1',
          apiKey: '{env:DIRECT_KEY}',
        },
      },
    });
    expect(config.providers?.local.apiKey).toBe('direct-secret');
    delete process.env.DIRECT_KEY;
  });

  test('cli smoke paths work for doctor, list, matrix, and run', () => {
    const doctor = Bun.spawnSync({ cmd: [bunBinary, path.resolve(rootDir, 'src/cli.ts'), 'doctor'], cwd: rootDir });
    expect(doctor.exitCode).toBe(0);

    const listPacks = Bun.spawnSync({ cmd: [bunBinary, path.resolve(rootDir, 'src/cli.ts'), 'list', 'packs'], cwd: rootDir });
    expect(listPacks.exitCode).toBe(0);
    expect(listPacks.stdout.toString()).toContain('akm-bench');
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

    // Create a temporary local dataset file so the run does not depend on network
    const tmpDir = path.resolve(rootDir, 'tests/.artifacts/tmp');
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpDatasetPath = path.resolve(tmpDir, 'dataset.json');
    fs.writeFileSync(
      tmpDatasetPath,
      JSON.stringify([
        {
          id: 'lme-001',
          category: 'single-session',
          conversation: [
            { role: 'user', content: 'My favorite color is blue.' },
            { role: 'assistant', content: 'Blue is a great choice!' },
          ],
          question: 'What is my favorite color?',
          expectedAnswer: 'blue',
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
            },
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

    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain('"schemaVersion": "1.0"');
    expect(fs.existsSync(path.resolve(outDir, 'result.json'))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
