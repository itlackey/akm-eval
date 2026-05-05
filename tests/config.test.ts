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
          agent: { provider: 'opencode', model: 'gpt-4.1-mini' },
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

  test('cli smoke paths work for doctor, list, matrix, and run', () => {
    const doctor = Bun.spawnSync({ cmd: [bunBinary, path.resolve(rootDir, 'src/cli.ts'), 'doctor'], cwd: rootDir });
    expect(doctor.exitCode).toBe(0);

    const listPacks = Bun.spawnSync({ cmd: [bunBinary, path.resolve(rootDir, 'src/cli.ts'), 'list', 'packs'], cwd: rootDir });
    expect(listPacks.exitCode).toBe(0);
    expect(listPacks.stdout.toString()).toContain('akm-bench');

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

    const outDir = path.resolve(rootDir, 'tests/.artifacts/run-smoke');
    fs.rmSync(outDir, { recursive: true, force: true });
    const run = Bun.spawnSync({
      cmd: [
        bunBinary,
        path.resolve(rootDir, 'src/cli.ts'),
        'run',
        '--pack',
        'longmemeval-smoke',
        '--variant',
        'raw-vector',
        '--config',
        path.resolve(rootDir, 'config/examples/longmemeval-smoke.json'),
        '--out',
        outDir,
      ],
      cwd: rootDir,
    });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toContain('"schemaVersion": "1.0"');
    expect(fs.existsSync(path.resolve(outDir, 'result.json'))).toBe(true);
  });
});
