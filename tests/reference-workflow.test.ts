import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.resolve(
  rootDir,
  "config/reference/longmemeval-qwen35-9b-q4km-131k-v1.json",
);
const sourceCandidateDir = path.resolve(
  rootDir,
  "results/reference/longmemeval-qwen35-9b-q4km-131k-v1/akm-memory-lead",
);

function stageCompatibleCandidate(): string {
  const candidateDir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-reference-candidate-"));
  for (const file of [
    "answer-checkpoint.jsonl",
    "answer-checkpoint.manifest.json",
    "predictions.jsonl",
    "judge-results.jsonl",
  ]) {
    fs.symlinkSync(path.join(sourceCandidateDir, file), path.join(candidateDir, file));
  }
  const result = JSON.parse(fs.readFileSync(path.join(sourceCandidateDir, "result.json"), "utf8"));
  Object.assign(result.metadata, {
    datasetSha256: "d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442",
    questionIdsSha256: "a4849b8afda6b6ed31ead4fc28d00784d2d5fef945be87642f5ce3ab710b21c4",
    promptContract: "longmemeval-v2",
    promptProtocolSha256: "8ba824b9dc651ad28a9bd1a37209d954d5a96b36dceacfdc03ef3d39ab56a240",
    judgeScriptSha256: "5822a286ca6406b1c16567b6c281179a7594fdb8a2b88c2de214515ca5c0986a",
    judgeMaxTokens: 64,
    judgeMaxUnparseableRate: 0.02,
    answerModelArtifactSha256: "cd76ec205963b3b33350093e6904d9de16c4e666fd104e1f632d25c7f15f2a13",
    answerModelRuntimeImage:
      "ghcr.io/ggml-org/llama.cpp@sha256:e61f29b37c471f956a772f91f4e9952d29f237e5d1a1a748e14421aae090305f",
  });
  fs.writeFileSync(path.join(candidateDir, "result.json"), `${JSON.stringify(result)}\n`);
  return candidateDir;
}

function innerDryRun(extraEnv: Record<string, string>) {
  return spawnSync(
    "bash",
    [
      "bin/memory-eval",
      "longmemeval",
      "--config",
      "config/reference/longmemeval-qwen35-9b-q4km-131k-v1.json",
      "--variant",
      "baseline",
      "--out",
      "runs/reference-workflow-test",
      "--dry-run",
    ],
    {
      cwd: rootDir,
      encoding: "utf8",
      env: {
        ...process.env,
        AKM_EVAL_IN_CONTAINER: "1",
        AKM_EVAL_JUDGE_API_KEY: "judge-test-placeholder",
        AKM_EVAL_AGENT_API_KEY: "agent-test-placeholder",
        ...extraEnv,
      },
    },
  );
}

describe("official reference workflow", () => {
  test("pins all score-affecting answer settings across both endpoint providers", () => {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(config.packs[0].config).toMatchObject({
      evaluatorModel: "gpt-4o",
      smoke: false,
      resume: true,
      topK: 5,
    });
    expect(config.packs[0].config.maxQuestions).toBeUndefined();
    expect(config.packs[0].config.sampleSeed).toBeUndefined();
    expect(config.providers["reference-baseline"].options).toEqual(
      config.providers["reference-retrieval"].options,
    );
    expect(config.providers["reference-baseline"].options).toEqual({
      temperature: 0,
      max_tokens: 256,
      seed: 1337,
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(
      config.variants.find((variant: { id: string }) => variant.id === "akm-memory-lead").memory
        .config,
    ).toEqual({
      fragmentContext: { mode: "lead", maxChars: 3200 },
    });
  });

  test("memory-eval resolves only providers selected by the requested arms", () => {
    const result = innerDryRun({
      AKM_EVAL_BASELINE_BASE_URL: "http://baseline.invalid/v1",
      AKM_EVAL_RETRIEVAL_BASE_URL: "",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("reference-baseline (http://baseline.invalid/v1)");
    expect(result.stdout).toContain("ALL (no subset)");
    expect(result.stdout).not.toContain("reference-retrieval (");
  });

  test("memory-eval fails before execution when a selected provider env ref is missing", () => {
    const result = innerDryRun({
      AKM_EVAL_BASELINE_BASE_URL: "",
      AKM_EVAL_RETRIEVAL_BASE_URL: "http://retrieval.invalid/v1",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AKM_EVAL_BASELINE_BASE_URL is unset");
  });

  test("LoCoMo dry-run does not claim that its deterministic scorer uses a cloud judge", () => {
    const result = spawnSync(
      "bash",
      [
        "bin/memory-eval",
        "locomo",
        "--config",
        "config/common/locomo-akm-ab.json",
        "--variant",
        "baseline",
        "--out",
        "runs/locomo-dry-run-test",
        "--dry-run",
      ],
      {
        cwd: rootDir,
        encoding: "utf8",
        env: {
          ...process.env,
          AKM_EVAL_IN_CONTAINER: "1",
          OPENAI_API_KEY: "answer-test-placeholder",
        },
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("memory-eval: judge       deterministic (no LLM judge)");
    expect(result.stdout).not.toContain("judge       deterministic (no LLM judge) via");
  });

  test("strict comparison accepts a fully evidenced compatible AKM artifact", () => {
    const candidateDir = stageCompatibleCandidate();
    try {
      const compared = spawnSync(
        process.execPath,
        [
          "scripts/reference-results.ts",
          "compare",
          "--candidate",
          path.join(candidateDir, "result.json"),
        ],
        { cwd: rootDir, encoding: "utf8" },
      );
      expect(compared.status).toBe(0);
      expect(compared.stderr).toBe("");
      expect(compared.stdout).toContain("compatible with frozen reference round");
    } finally {
      fs.rmSync(candidateDir, { recursive: true, force: true });
    }
  });

  test("strict comparison rejects a candidate from different model bytes", () => {
    const candidateDir = stageCompatibleCandidate();
    try {
      const resultPath = path.join(candidateDir, "result.json");
      const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
      result.metadata.answerModelArtifactSha256 = "0".repeat(64);
      fs.writeFileSync(resultPath, `${JSON.stringify(result)}\n`);

      const compared = spawnSync(
        process.execPath,
        ["scripts/reference-results.ts", "compare", "--candidate", resultPath],
        { cwd: rootDir, encoding: "utf8" },
      );
      expect(compared.status).toBe(1);
      expect(compared.stderr).toContain("candidate model artifact");
      expect(compared.stdout).not.toContain("Candidate is compatible");
    } finally {
      fs.rmSync(candidateDir, { recursive: true, force: true });
    }
  });
});
