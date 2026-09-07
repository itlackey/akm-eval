import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type LongMemEvalCheckpointEntry,
  appendCheckpoint,
  createCheckpointIdentity,
  prepareCheckpoint,
  resolveCheckpointPath,
} from "../src/packs/longmemeval/checkpoint.ts";

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-checkpoint-"));
  tempDirs.push(dir);
  return dir;
}

function identity(runtimeIdentity: string) {
  return createCheckpointIdentity({
    datasetPath: "/dataset.json",
    questions: [{ id: "q1", question: "where?", expectedAnswer: "there" }],
    memoryBackend: "akm",
    memoryBackendConfig: { fragmentContext: { mode: "lead", maxChars: 3200 } },
    topK: 5,
    agentProviderType: "openai-compatible",
    agentBaseURL: "https://example.invalid/v1",
    requestedAgentModel: "fixed-model",
    backendRuntimeIdentity: runtimeIdentity,
    evaluatorCodeSha256: "evaluator-code-a",
  });
}

function entry(signature: string): LongMemEvalCheckpointEntry {
  return {
    schemaVersion: 1,
    signature,
    question_id: "q1",
    hypothesis: "there",
    agent: { latencyMs: 10, retries: 0, resolvedModel: "fixed-model-2026" },
    retrievalProvenance: [],
    context: {
      nonAbstention: true,
      literalAnswerPresent: true,
      evidenceSessionHit: true,
    },
    counters: {
      retrievalQueried: true,
      zeroHit: false,
      withoutEvidence: false,
      unmatchableEvidence: false,
      synthesizedHaystack: false,
    },
  };
}

describe("LongMemEval answer checkpoints", () => {
  test("runtime identity changes invalidate the checkpoint signature", () => {
    const clean = identity(
      JSON.stringify({ version: "0.9.15", gitSha: "aaa", treeFingerprint: "tree-a" }),
    );
    const changedTree = identity(
      JSON.stringify({ version: "0.9.15", gitSha: "aaa", treeFingerprint: "tree-b" }),
    );
    expect(clean.signature).not.toBe(changedTree.signature);
  });

  test("round-trips fsynced entries and repairs only a torn final line", () => {
    const outputDir = tempDir();
    const resolved = identity("runtime-a");
    const checkpointPath = resolveCheckpointPath(outputDir, resolved.signature);
    prepareCheckpoint(checkpointPath, resolved.manifest, true, new Set(["q1"]));
    appendCheckpoint(checkpointPath, entry(resolved.signature));
    fs.appendFileSync(checkpointPath, '{"torn":');

    const loaded = prepareCheckpoint(checkpointPath, resolved.manifest, true, new Set(["q1"]));
    expect(loaded.recoveredPartialLine).toBe(true);
    expect(loaded.entries.get("q1")?.hypothesis).toBe("there");
    expect(fs.readFileSync(checkpointPath, "utf8")).not.toContain("torn");
  });

  test("configured checkpoints cannot escape the output directory", () => {
    expect(() => resolveCheckpointPath(tempDir(), "sig", "../outside.jsonl")).toThrow(
      /stay inside/,
    );
    expect(() => resolveCheckpointPath(tempDir(), "sig", "/absolute.jsonl")).toThrow(
      /must be relative/,
    );
  });
});
