import fs from "node:fs";
import path from "node:path";
import type { NormalizedRunResult } from "../core/types.ts";
import { loadNormalizedResult } from "./normalized-result.ts";

export interface RunSummaryEntry {
  pack: string;
  variant: string;
  runId: string;
  date: string;
  score: number;
  status: string;
  model: string | null;
  repoCommit: string | null;
  runnerType: string | null;
  benchmarkId: string | null;
  benchmarkVersion: string | null;
  resultPath: string;
}

function displayModel(result: NormalizedRunResult): string | null {
  return metadataValue(result, "model");
}

function metadataValue(result: NormalizedRunResult, key: string): string | null {
  const value = result.metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
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
      if (path.basename(currentPath) === "result.json") {
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
      date: result.startedAt.split("T")[0] ?? result.startedAt,
      score: result.metrics.aggregate.score,
      status: result.status,
      model: displayModel(result),
      repoCommit: metadataValue(result, "repoCommit"),
      runnerType: metadataValue(result, "runnerType"),
      benchmarkId: metadataValue(result, "benchmarkId"),
      benchmarkVersion: metadataValue(result, "benchmarkVersion"),
      resultPath: result.artifacts.resultPath,
    }));
}

export function markdownSummaryForRuns(rootPath: string): string {
  const entries = collectRunSummaries(rootPath);
  const lines = [
    "# Run summary",
    "",
    "| Pack | Variant | Run ID | Date | Status | Score | Model | Runner | Benchmark | Version | Repo commit | Result |",
    "| --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |",
    ...entries.map(
      (entry) =>
        `| ${entry.pack} | ${entry.variant} | ${entry.runId} | ${entry.date} | ${entry.status} | ${entry.score.toFixed(3)} | ${entry.model ?? "-"} | ${entry.runnerType ?? "-"} | ${entry.benchmarkId ?? "-"} | ${entry.benchmarkVersion ?? "-"} | ${entry.repoCommit ?? "-"} | ${entry.resultPath} |`,
    ),
    "",
  ];
  return lines.join("\n");
}
