import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareResults } from "../src/reporting/compare.ts";
import { markdownReportForComparison } from "../src/reporting/markdown.ts";
import { loadNormalizedResult } from "../src/reporting/normalized-result.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseArtifacts = path.resolve(rootDir, "tests/.artifacts/compare");

function writeResult(dirName: string, score: number, cost: number, latencyMs: number) {
  const dir = path.resolve(baseArtifacts, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.resolve(dir, "result.json"),
    JSON.stringify(
      {
        schemaVersion: "1.0",
        runId: dirName,
        pack: "longmemeval",
        variant: dirName,
        memoryBackend: "raw-vector",
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: latencyMs,
        warnings: [],
        notes: [],
        metrics: {
          retrieval: { queryCount: 0, precisionAtK: 0, recallAtK: 0, mrr: 0, ndcgAtK: 0 },
          answer: { exactMatch: score, tokenF1: score, containsExpected: score, judgedPass: score },
          aggregate: { score, retrievalWeight: 0, answerWeight: 1 },
        },
        telemetry: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          estimatedCostUsd: cost,
          latencyMs,
          logs: [],
        },
        artifacts: {
          resultPath: path.resolve(dir, "result.json"),
          summaryPath: path.resolve(dir, "summary.md"),
        },
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

describe("comparison reporting", () => {
  test("compares two result folders with score, cost, and latency deltas", () => {
    const baselineDir = writeResult("baseline", 0.18, 0.31, 800);
    const candidateDir = writeResult("akm-memory", 0.74, 1.22, 1400);
    const report = compareResults(
      loadNormalizedResult(baselineDir),
      loadNormalizedResult(candidateDir),
    );
    expect(report.outcome).toBe("improved");
    expect(report.absoluteScoreDelta).toBe(0.56);
    expect(report.costDeltaUsd).toBe(0.91);
    expect(report.latencyDeltaMs).toBe(600);
    expect(markdownReportForComparison(report)).toContain("Absolute score delta");
  });
});
