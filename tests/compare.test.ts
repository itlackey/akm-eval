import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareResults } from "../src/reporting/compare.ts";
import { markdownReportForComparison, markdownReportForResult } from "../src/reporting/markdown.ts";
import { loadNormalizedResult } from "../src/reporting/normalized-result.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseArtifacts = path.resolve(rootDir, "tests/.artifacts/compare");

function writeResult(
  dirName: string,
  score: number,
  cost: number,
  latencyMs: number,
  answerOverrides: Partial<{
    exactMatch: number | null;
    tokenF1: number | null;
    containsExpected: number | null;
  }> = {},
) {
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
          answer: {
            exactMatch: score,
            tokenF1: score,
            containsExpected: score,
            judgedPass: score,
            ...answerOverrides,
          },
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

  test("a metric neither side computed reports no delta and renders as n/a, never as 0 or a bare negative", () => {
    // Both arms are LLM-judged packs that compute no lexical overlap, so all
    // three lexical metrics are null on both sides. Subtracting them as if
    // they were zeros would print a `0` delta for something never measured;
    // comparing one against a pack that DID measure it would print a bare
    // `-0.2` attributable to nothing.
    const notComputed = { exactMatch: null, tokenF1: null, containsExpected: null };
    const baselineDir = writeResult("baseline-na", 0.4, 0.31, 800, notComputed);
    const candidateDir = writeResult("candidate-na", 0.6, 1.22, 1400, notComputed);

    const report = compareResults(
      loadNormalizedResult(baselineDir),
      loadNormalizedResult(candidateDir),
    );

    for (const metricName of ["answer.exactMatch", "answer.tokenF1", "answer.containsExpected"]) {
      const delta = report.metricDeltas.find((entry) => entry.metric === metricName);
      expect(delta).toBeDefined();
      expect(delta?.baseline).toBeNull();
      expect(delta?.candidate).toBeNull();
      expect(delta?.delta).toBeNull();
    }

    // The judged metric was computed by both arms, so it keeps a real delta.
    const judged = report.metricDeltas.find((entry) => entry.metric === "answer.judgedPass");
    expect(judged?.delta).toBe(0.2);

    const markdown = markdownReportForComparison(report);
    expect(markdown).toContain("| answer.tokenF1 | n/a | n/a | n/a |");
    expect(markdown).toContain("| answer.exactMatch | n/a | n/a | n/a |");
    expect(markdown).toContain("| answer.containsExpected | n/a | n/a | n/a |");
    expect(markdown).toContain("| answer.judgedPass | 0.4 | 0.6 | 0.2 |");
  });

  test("a run report renders non-computed answer metrics as n/a while keeping measured zeros as 0", () => {
    const naDir = writeResult("report-na", 0.5, 0.1, 100, {
      exactMatch: null,
      tokenF1: null,
      containsExpected: 0,
    });

    const markdown = markdownReportForResult(loadNormalizedResult(naDir));

    expect(markdown).toContain("- exact match: n/a");
    expect(markdown).toContain("- token f1: n/a");
    // A genuinely measured zero must still read as a zero.
    expect(markdown).toContain("- contains expected: 0");
    expect(markdown).toContain("- judged pass: 0.5");
  });
});
