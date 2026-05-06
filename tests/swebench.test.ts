import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';
import { validateConfig } from '../src/config/validate-config.ts';
import { parseSweBenchRawOutput } from '../src/packs/swe-bench/parse.ts';
import { scoreSweBenchAdapter } from '../src/packs/swe-bench/scorer.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('swe-bench integration helpers', () => {
  test('parses official harness run and instance reports', () => {
    const tmpDir = path.resolve(rootDir, 'tests/.artifacts/swebench-parse');
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(path.resolve(tmpDir, 'logs/run_evaluation/demo-run/demo-model/astropy__astropy-12907'), {
      recursive: true,
    });

    const runReportPath = path.resolve(tmpDir, 'demo-model.demo-run.json');
    fs.writeFileSync(
      runReportPath,
      JSON.stringify({
        total_instances: 1,
        submitted_instances: 1,
        completed_instances: 1,
        resolved_instances: 1,
        unresolved_instances: 0,
        empty_patch_instances: 0,
        error_instances: 0,
        completed_ids: ['astropy__astropy-12907'],
        incomplete_ids: [],
        empty_patch_ids: [],
        submitted_ids: ['astropy__astropy-12907'],
        resolved_ids: ['astropy__astropy-12907'],
        unresolved_ids: [],
        error_ids: [],
        schema_version: 2,
      }),
      'utf8',
    );
    fs.writeFileSync(
      path.resolve(tmpDir, 'logs/run_evaluation/demo-run/demo-model/astropy__astropy-12907/report.json'),
      JSON.stringify({
        'astropy__astropy-12907': {
          resolved: true,
        },
      }),
      'utf8',
    );

    const parsed = parseSweBenchRawOutput({
      runReportPath,
      instanceLogRootDir: path.resolve(tmpDir, 'logs/run_evaluation/demo-run/demo-model'),
    });

    expect(parsed.runReport.resolved_instances).toBe(1);
    expect(parsed.instanceReports).toHaveLength(1);
    expect(parsed.instanceReports[0]?.instanceId).toBe('astropy__astropy-12907');
    expect(parsed.instanceReports[0]?.resolved).toBe(true);
  });

  test('normalizes score precision and bounds', () => {
    expect(scoreSweBenchAdapter(1 / 3)).toBe(0.333333);
    expect(scoreSweBenchAdapter(2)).toBe(1);
    expect(scoreSweBenchAdapter(Number.NaN)).toBe(0);
  });

  test('rejects non-official swe-bench dataset paths', () => {
    expect(() =>
      validateConfig({
        schemaVersion: 'akm.eval.config.v1',
        run: { id: 'x', outputDir: 'runs/x' },
        packs: [
          {
            id: 'swe-bench-smoke',
            adapter: 'swe-bench',
            enabled: true,
            config: { datasetName: './local-fixture.json' },
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
      }),
    ).toThrow('only accepts official dataset identifiers');
  });
});
