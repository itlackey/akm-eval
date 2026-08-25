import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseArtifacts = path.resolve(rootDir, "tests/.artifacts/summary-cli");

function writeResult(dirName: string) {
  const dir = path.resolve(baseArtifacts, dirName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.resolve(dir, "result.json"),
    JSON.stringify(
      {
        schemaVersion: "1.0",
        runId: "cli-run",
        pack: "beam",
        variant: "smoke",
        memoryBackend: "none",
        status: "passed",
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 1,
        warnings: [],
        notes: [],
        metrics: {
          retrieval: { queryCount: 0, precisionAtK: 0, recallAtK: 0, mrr: 0, ndcgAtK: 0 },
          answer: { exactMatch: 0.75, tokenF1: 0.75, containsExpected: 0.75, judgedPass: 0.75 },
          aggregate: { score: 0.75, retrievalWeight: 0, answerWeight: 1 },
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
          resultPath: path.resolve(dir, "result.json"),
          summaryPath: path.resolve(dir, "summary.md"),
        },
        metadata: { model: "cli-model" },
      },
      null,
      2,
    ),
  );
}

afterEach(() => {
  fs.rmSync(baseArtifacts, { recursive: true, force: true });
});

describe("summary CLI", () => {
  test("prints json summaries for a runs directory", () => {
    writeResult("run");

    const output = Bun.spawnSync({
      cmd: [process.execPath, "src/cli.ts", "summary", "--runs", baseArtifacts, "--format", "json"],
      cwd: rootDir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(output.exitCode).toBe(0);
    expect(output.stderr.toString()).toBe("");
    expect(JSON.parse(output.stdout.toString())).toEqual([
      {
        pack: "beam",
        variant: "smoke",
        runId: "cli-run",
        date: expect.any(String),
        score: 0.75,
        status: "passed",
        model: "cli-model",
        repoCommit: null,
        runnerType: null,
        benchmarkId: null,
        benchmarkVersion: null,
        resultPath: path.resolve(baseArtifacts, "run", "result.json"),
      },
    ]);
  });
});
