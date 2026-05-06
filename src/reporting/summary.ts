import fs from 'node:fs';
import path from 'node:path';
import type { NormalizedRunResult } from '../core/types.ts';
import { loadNormalizedResult } from './normalized-result.ts';

export interface RunSummaryEntry {
  pack: string;
  variant: string;
  runId: string;
  score: number;
  status: string;
  model: string | null;
  resultPath: string;
}

function collectResultPaths(rootPath: string): string[] {
  const absolute = path.resolve(rootPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Runs path does not exist: ${absolute}`);
  }

  const resultPaths: string[] = [];
  const visit = (currentPath: string): void => {
    const stats = fs.statSync(currentPath);
    if (stats.isFile()) {
      if (path.basename(currentPath) === 'result.json') {
        resultPaths.push(currentPath);
      }
      return;
    }
    for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
      visit(path.resolve(currentPath, entry.name));
    }
  };

  visit(absolute);
  return resultPaths.sort();
}

export function collectRunSummaries(rootPath: string): RunSummaryEntry[] {
  return collectResultPaths(rootPath)
    .map((resultPath) => loadNormalizedResult(resultPath))
    .map((result: NormalizedRunResult) => ({
      pack: result.pack,
      variant: result.variant,
      runId: result.runId,
      score: result.metrics.aggregate.score,
      status: result.status,
      model:
        typeof result.metadata?.model === 'string'
          ? result.metadata.model
          : typeof result.metadata?.modelKey === 'string'
            ? result.metadata.modelKey
            : null,
      resultPath: result.artifacts.resultPath,
    }));
}

export function markdownSummaryForRuns(rootPath: string): string {
  const entries = collectRunSummaries(rootPath);
  const lines = [
    '# Run summary',
    '',
    '| Pack | Variant | Run ID | Status | Score | Model | Result |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
    ...entries.map(
      (entry) =>
        `| ${entry.pack} | ${entry.variant} | ${entry.runId} | ${entry.status} | ${entry.score.toFixed(3)} | ${entry.model ?? '-'} | ${entry.resultPath} |`,
    ),
    '',
  ];
  return lines.join('\n');
}
