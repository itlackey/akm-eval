import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'bun:test';
import { collectRunSummaries, markdownSummaryForRuns } from '../src/reporting/summary.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseArtifacts = path.resolve(rootDir, 'tests/.artifacts/summary');

function writeResult(
  dirName: string,
  options: {
    runId: string;
    variant: string;
    score: number;
    status?: 'passed' | 'failed' | 'warning';
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  const dir = path.resolve(baseArtifacts, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.resolve(dir, 'result.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0',
        runId: options.runId,
        pack: 'beam',
        variant: options.variant,
        memoryBackend: 'none',
        status: options.status ?? 'passed',
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        warnings: [],
        notes: [],
        metrics: {
          retrieval: { queryCount: 1, precisionAtK: options.score, recallAtK: options.score, mrr: options.score, ndcgAtK: options.score },
          answer: { exactMatch: options.score, tokenF1: options.score, containsExpected: options.score, judgedPass: options.score },
          aggregate: { score: options.score, retrievalWeight: 0.5, answerWeight: 0.5 },
        },
        telemetry: {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
          estimatedCostUsd: 0,
          latencyMs: 1,
          logs: [],
        },
        artifacts: {
          resultPath: path.resolve(dir, 'result.json'),
          summaryPath: path.resolve(dir, 'summary.md'),
        },
        metadata: options.metadata,
      },
      null,
      2,
    ),
  );
  return dir;
}

afterEach(() => {
  fs.rmSync(baseArtifacts, { recursive: true, force: true });
});

describe('summary reporting', () => {
  test('collects result files recursively and uses metadata.model only', () => {
    const firstDir = writeResult('b-run', {
      runId: 'run-b',
      variant: 'baseline',
      score: 0.42,
      metadata: { modelKey: 'fallback-model' },
    });
    writeResult('a-run/nested', {
      runId: 'run-a',
      variant: 'memory',
      score: 0.91,
      metadata: { model: 'primary-model', modelKey: 'ignored-model' },
    });
    writeResult('c-run', {
      runId: 'run-c',
      variant: 'no-model',
      score: 0.1,
    });

    const summaries = collectRunSummaries(baseArtifacts);

    expect(summaries).toHaveLength(3);
    expect(summaries.map((entry) => entry.runId)).toEqual(['run-a', 'run-b', 'run-c']);
    expect(summaries.map((entry) => entry.model)).toEqual(['primary-model', null, null]);
    expect(summaries.map((entry) => entry.runnerType)).toEqual([null, null, null]);
    expect(summaries[1]?.resultPath).toBe(path.resolve(firstDir, 'result.json'));
  });

  test('renders markdown rows and throws for a missing runs directory', () => {
    writeResult('single-run', {
      runId: 'run-1',
      variant: 'baseline',
      score: 0.1236,
      status: 'warning',
    });

    const markdown = markdownSummaryForRuns(baseArtifacts);

    expect(markdown).toContain('# Run summary');
    expect(markdown).toContain('| beam | baseline | run-1 | ');
    expect(markdown).toContain(' | warning | 0.124 | - | - | - | - | - | ');
    expect(() => collectRunSummaries(path.resolve(baseArtifacts, 'missing'))).toThrow(/Runs path does not exist/);
  });
});
