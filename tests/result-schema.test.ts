import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateNormalizedResult } from "../src/reporting/normalized-result.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("normalized result schema", () => {
  test("planned schema files exist and current result validator accepts internal payload", () => {
    expect(fs.existsSync(path.resolve(rootDir, "config/schemas/eval-config.schema.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.resolve(rootDir, "config/schemas/result.schema.json"))).toBe(true);
    expect(fs.existsSync(path.resolve(rootDir, "config/schemas/variant.schema.json"))).toBe(true);
    expect(fs.existsSync(path.resolve(rootDir, "config/schemas/memory-backend.schema.json"))).toBe(
      true,
    );

    const result = {
      schemaVersion: "1.0",
      runId: "demo",
      pack: "locomo",
      variant: "baseline",
      memoryBackend: "none",
      status: "passed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
      warnings: [],
      notes: [],
      metrics: {
        retrieval: { queryCount: 1, precisionAtK: 1, recallAtK: 1, mrr: 1, ndcgAtK: 1 },
        answer: { exactMatch: 1, tokenF1: 1, containsExpected: 1, judgedPass: 1 },
        aggregate: { score: 1, retrievalWeight: 0.5, answerWeight: 0.5 },
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
        resultPath: path.resolve(rootDir, "tests/.artifacts/result.json"),
        summaryPath: path.resolve(rootDir, "tests/.artifacts/summary.md"),
      },
    };

    expect(validateNormalizedResult(result)).toBe(true);
  });

  test("validator accepts answer-only results with retrieval queryCount set to zero", () => {
    const result = {
      schemaVersion: "1.0",
      runId: "answer-only",
      pack: "longmemeval",
      variant: "baseline",
      memoryBackend: "none",
      status: "failed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
      warnings: [],
      notes: [],
      metrics: {
        retrieval: { queryCount: 0, precisionAtK: 0, recallAtK: 0, mrr: 0, ndcgAtK: 0 },
        answer: { exactMatch: 0, tokenF1: 0, containsExpected: 0, judgedPass: 0 },
        aggregate: { score: 0, retrievalWeight: 0, answerWeight: 1 },
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
        resultPath: path.resolve(rootDir, "tests/.artifacts/result.json"),
        summaryPath: path.resolve(rootDir, "tests/.artifacts/summary.md"),
      },
    };

    expect(validateNormalizedResult(result)).toBe(true);
  });

  test("validator and JSON schema both accept null lexical answer metrics, and still reject non-numeric ones", () => {
    const base = {
      schemaVersion: "1.0",
      runId: "not-computed",
      pack: "longmemeval",
      variant: "akm-memory",
      memoryBackend: "akm",
      status: "passed",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 1,
      warnings: [],
      notes: [],
      metrics: {
        retrieval: { queryCount: 0, precisionAtK: 0, recallAtK: 0, mrr: 0, ndcgAtK: 0 },
        answer: { exactMatch: null, tokenF1: null, containsExpected: null, judgedPass: 1 },
        aggregate: { score: 1, retrievalWeight: 0, answerWeight: 1 },
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
        resultPath: path.resolve(rootDir, "tests/.artifacts/result.json"),
        summaryPath: path.resolve(rootDir, "tests/.artifacts/summary.md"),
      },
    };

    expect(validateNormalizedResult(base)).toBe(true);

    // null means "not computed"; it is not a licence for arbitrary junk.
    expect(
      validateNormalizedResult({
        ...base,
        metrics: {
          ...base.metrics,
          answer: { ...base.metrics.answer, tokenF1: "n/a" },
        },
      }),
    ).toBe(false);

    // judgedPass carries the real signal on these packs and stays required.
    expect(
      validateNormalizedResult({
        ...base,
        metrics: {
          ...base.metrics,
          answer: { ...base.metrics.answer, judgedPass: null },
        },
      }),
    ).toBe(false);

    // The published JSON schema must agree with the in-process validator.
    const schema = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "config/schemas/result.schema.json"), "utf8"),
    );
    const answerProps = schema.properties.metrics.properties.answer.properties;
    expect(answerProps.exactMatch.type).toEqual(["number", "null"]);
    expect(answerProps.tokenF1.type).toEqual(["number", "null"]);
    expect(answerProps.containsExpected.type).toEqual(["number", "null"]);
    expect(answerProps.judgedPass.type).toBe("number");
  });
});
