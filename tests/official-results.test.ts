import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ledgerPath = path.resolve(rootDir, "results/official-results.json");
const schemaPath = path.resolve(rootDir, "config/schemas/official-results.schema.json");
const sha256Pattern = /^[a-f0-9]{64}$/;

interface ModelCensus {
  [model: string]: number;
}

interface OfficialArm {
  id: string;
  score: number;
  correct: number;
  questionCount: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
    averagePerQuestion: number;
    scope: string;
  };
  timing: {
    wallMs: number;
    wallPrecision: string;
    answerModelLatencyMs: number;
  };
  retries: number;
  resolvedAnswerModels: ModelCensus;
  resolvedJudgeModels: ModelCensus;
  checkpointSignature: string;
  artifacts: {
    resultPath: string;
    resultSha256: string;
    predictionsPath: string;
    predictionsSha256: string;
    judgeLogPath: string;
    judgeLogSha256: string;
  };
}

interface OfficialRound {
  id: string;
  recordedAt: string;
  status: string;
  benchmark: {
    questionCount: number;
    datasetSha256: string;
    questionIdsSha256: string;
    evaluatorCodeSha256: string;
  };
  answerModel: { resolvedModels: ModelCensus; artifactSha256: string };
  judge: { resolvedModels: ModelCensus; usageCaptured: boolean };
  protocol: {
    configSha256: string;
    configPath: string;
    reproductionConfigPath: string;
    reproductionConfigSha256: string;
    referenceProtocolPath: string;
    referenceProtocolSha256: string;
    artifactManifestPath: string;
    artifactManifestSha256: string;
    artifactRoot: string;
  };
  arms: OfficialArm[];
  comparisons: Array<{
    left: string;
    right: string;
    scoreDelta: number;
    correctDelta: number;
    tokenReduction: number;
  }>;
}

interface OfficialLedger {
  schemaVersion: string;
  updatedAt: string;
  policy: { canonical: boolean; appendOnly: boolean };
  rounds: OfficialRound[];
}

function censusCount(census: ModelCensus): number {
  return Object.values(census).reduce((sum, count) => sum + count, 0);
}

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("official results ledger", () => {
  test("is tracked beside a published schema", () => {
    expect(fs.existsSync(ledgerPath)).toBe(true);
    expect(fs.existsSync(schemaPath)).toBe(true);

    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    expect(schema.$id).toBe("https://akm-eval.local/official-results.schema.json");
    expect(schema.properties.schemaVersion.const).toBe("akm.eval.official-results.v1");
  });

  test("contains internally consistent, appendable completed rounds", () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as OfficialLedger;
    expect(ledger.schemaVersion).toBe("akm.eval.official-results.v1");
    expect(ledger.policy).toMatchObject({ canonical: true, appendOnly: true });
    expect(Number.isNaN(Date.parse(ledger.updatedAt))).toBe(false);
    expect(ledger.rounds.length).toBeGreaterThan(0);
    expect(new Set(ledger.rounds.map((round) => round.id)).size).toBe(ledger.rounds.length);

    for (const round of ledger.rounds) {
      expect(Number.isNaN(Date.parse(round.recordedAt))).toBe(false);
      expect(["complete", "partial", "retracted"]).toContain(round.status);
      expect(round.arms.length).toBeGreaterThan(0);
      expect(new Set(round.arms.map((arm) => arm.id)).size).toBe(round.arms.length);
      expect(round.benchmark.datasetSha256).toMatch(sha256Pattern);
      expect(round.benchmark.questionIdsSha256).toMatch(sha256Pattern);
      expect(round.benchmark.evaluatorCodeSha256).toMatch(sha256Pattern);
      expect(round.answerModel.artifactSha256).toMatch(sha256Pattern);
      expect(round.protocol.configSha256).toMatch(sha256Pattern);
      expect(sha256(path.resolve(rootDir, round.protocol.configPath))).toBe(
        round.protocol.configSha256,
      );
      expect(sha256(path.resolve(rootDir, round.protocol.reproductionConfigPath))).toBe(
        round.protocol.reproductionConfigSha256,
      );
      for (const trackedPath of [
        round.protocol.referenceProtocolPath,
        round.protocol.artifactManifestPath,
        round.protocol.artifactRoot,
      ]) {
        expect(fs.existsSync(path.resolve(rootDir, trackedPath))).toBe(true);
      }
      expect(sha256(path.resolve(rootDir, round.protocol.referenceProtocolPath))).toBe(
        round.protocol.referenceProtocolSha256,
      );
      expect(sha256(path.resolve(rootDir, round.protocol.artifactManifestPath))).toBe(
        round.protocol.artifactManifestSha256,
      );
      expect(censusCount(round.answerModel.resolvedModels)).toBe(
        round.benchmark.questionCount * round.arms.length,
      );
      expect(censusCount(round.judge.resolvedModels)).toBe(
        round.benchmark.questionCount * round.arms.length,
      );

      const armsById = new Map(round.arms.map((arm) => [arm.id, arm]));
      for (const arm of round.arms) {
        expect(arm.questionCount).toBe(round.benchmark.questionCount);
        expect(arm.score).toBeCloseTo(arm.correct / arm.questionCount, 12);
        expect(arm.tokens.total).toBe(arm.tokens.prompt + arm.tokens.completion);
        expect(arm.tokens.averagePerQuestion).toBeCloseTo(arm.tokens.total / arm.questionCount, 9);
        expect(arm.tokens.scope).toBe("answer-model-only");
        expect(arm.timing.wallMs).toBeGreaterThan(0);
        expect(["exact", "approximate"]).toContain(arm.timing.wallPrecision);
        expect(arm.timing.answerModelLatencyMs).toBeGreaterThan(0);
        expect(arm.retries).toBeGreaterThanOrEqual(0);
        expect(censusCount(arm.resolvedAnswerModels)).toBe(arm.questionCount);
        expect(censusCount(arm.resolvedJudgeModels)).toBe(arm.questionCount);
        expect(arm.checkpointSignature).toMatch(sha256Pattern);
        expect(arm.artifacts.resultSha256).toMatch(sha256Pattern);
        expect(arm.artifacts.predictionsSha256).toMatch(sha256Pattern);
        expect(arm.artifacts.judgeLogSha256).toMatch(sha256Pattern);
        expect(sha256(path.resolve(rootDir, arm.artifacts.resultPath))).toBe(
          arm.artifacts.resultSha256,
        );
        expect(sha256(path.resolve(rootDir, arm.artifacts.predictionsPath))).toBe(
          arm.artifacts.predictionsSha256,
        );
        expect(sha256(path.resolve(rootDir, arm.artifacts.judgeLogPath))).toBe(
          arm.artifacts.judgeLogSha256,
        );
      }

      for (const comparison of round.comparisons) {
        const left = armsById.get(comparison.left);
        const right = armsById.get(comparison.right);
        expect(left).toBeDefined();
        expect(right).toBeDefined();
        if (!left || !right) continue;
        expect(comparison.scoreDelta).toBeCloseTo(left.score - right.score, 12);
        expect(comparison.correctDelta).toBe(left.correct - right.correct);
        expect(comparison.tokenReduction).toBeCloseTo(
          1 - left.tokens.total / right.tokens.total,
          12,
        );
      }

      if (!round.judge.usageCaptured) {
        expect(round.arms.every((arm) => arm.tokens.scope === "answer-model-only")).toBe(true);
      }
    }
  });

  test("reconstructs every completed round from its immutable evidence bundle", () => {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8")) as OfficialLedger;
    for (const round of ledger.rounds.filter((entry) => entry.status === "complete")) {
      const result = spawnSync(
        process.execPath,
        ["scripts/reference-results.ts", "verify", "--round", round.id],
        {
          cwd: rootDir,
          encoding: "utf8",
        },
      );
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain(`Verified reference round ${round.id}.`);
      for (const arm of round.arms) {
        expect(result.stdout).toContain(arm.tokens.total.toLocaleString("en-US"));
      }
    }
  });
});
