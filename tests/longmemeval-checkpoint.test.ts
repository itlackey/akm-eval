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
import {
  longMemEvalBackendRuntimeIdentity,
  longMemEvalEvaluatorFiles,
} from "../src/packs/longmemeval/runtime-identity.ts";

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
  test("AKM source identity invalidates only the AKM arm", () => {
    const sourceA = {
      AKM_EVAL_AKM_SOURCE_SHA: "source-a",
      AKM_EVAL_AKM_SOURCE_FINGERPRINT: "tree-a",
      AKM_EVAL_AKM_SOURCE_DIRTY: "0",
      AKM_EVAL_AKM_RUNTIME_FINGERPRINT: "runtime-a",
    };
    const sourceB = {
      AKM_EVAL_AKM_SOURCE_SHA: "source-b",
      AKM_EVAL_AKM_SOURCE_FINGERPRINT: "tree-b",
      AKM_EVAL_AKM_SOURCE_DIRTY: "1",
      AKM_EVAL_AKM_RUNTIME_FINGERPRINT: "runtime-b",
    };

    for (const backendId of ["none", "raw-vector"]) {
      const provenance = { backendId, backendKind: "in-process", backendDetail: backendId };
      expect(longMemEvalBackendRuntimeIdentity(provenance, sourceA)).toBe(
        longMemEvalBackendRuntimeIdentity(provenance, sourceB),
      );
    }

    const akm = { backendId: "akm", backendKind: "external", backendDetail: "akm CLI" };
    expect(longMemEvalBackendRuntimeIdentity(akm, sourceA)).not.toBe(
      longMemEvalBackendRuntimeIdentity(akm, sourceB),
    );
  });

  test("evaluator hashes include exactly the selected backend implementation", () => {
    const relative = (backend: string) =>
      longMemEvalEvaluatorFiles(backend).map((file) => path.relative(process.cwd(), file));

    expect(relative("raw-vector")).toContain("src/memory/backends/raw-vector.ts");
    expect(relative("raw-vector")).not.toContain("src/memory/backends/akm.ts");
    expect(relative("akm")).toContain("src/memory/backends/akm.ts");
    expect(relative("akm")).not.toContain("src/memory/backends/raw-vector.ts");
    expect(relative("none")).toContain("src/memory/backends/none.ts");
    expect(relative("none")).not.toContain("src/memory/backends/akm.ts");
  });

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
