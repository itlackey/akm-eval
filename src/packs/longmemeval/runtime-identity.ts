import fs from "node:fs";
import path from "node:path";
import type { MemoryProvenance } from "../../memory/provenance.ts";
import { sha256Text } from "./checkpoint.ts";

/**
 * Files whose behavior can change a LongMemEval answer checkpoint.
 *
 * Backend implementations are deliberately selected per arm. An AKM release
 * must invalidate AKM answers without invalidating frozen baseline/vector
 * controls, and a raw-vector implementation change must invalidate vector
 * answers even when the rest of the evaluator is untouched.
 */
export function longMemEvalEvaluatorFiles(
  memoryBackend: string,
  repositoryRoot = path.resolve(import.meta.dir, "../../.."),
): string[] {
  const relativeFiles = [
    "src/packs/longmemeval/adapter.ts",
    "src/packs/longmemeval/checkpoint.ts",
    "src/packs/longmemeval/dataset.ts",
    "src/packs/longmemeval/runtime-identity.ts",
    "src/agent/openai-compatible-runner.ts",
    "src/agent/types.ts",
    "src/memory/provenance.ts",
    "src/memory/registry.ts",
    "src/memory/retrieval-metrics.ts",
    "src/memory/types.ts",
  ];
  const backendFile =
    memoryBackend === "akm"
      ? "src/memory/backends/akm.ts"
      : memoryBackend === "raw-vector"
        ? "src/memory/backends/raw-vector.ts"
        : memoryBackend === "none"
          ? "src/memory/backends/none.ts"
          : undefined;
  return [...relativeFiles, ...(backendFile ? [backendFile] : [])].map((file) =>
    path.resolve(repositoryRoot, file),
  );
}

export function longMemEvalEvaluatorCodeSha256(
  memoryBackend: string,
  repositoryRoot = path.resolve(import.meta.dir, "../../.."),
): string {
  return sha256Text(
    longMemEvalEvaluatorFiles(memoryBackend, repositoryRoot)
      .map((file) => `${path.relative(repositoryRoot, file)}\0${fs.readFileSync(file, "utf8")}`)
      .join("\0"),
  );
}

/**
 * Identify the backend binary/runtime that produced checkpointed answers.
 * AKM source fields apply only to the AKM arm; leaking them into `none` or
 * `raw-vector` made reusable controls depend on whichever AKM checkout happened
 * to be mounted next to them.
 */
export function longMemEvalBackendRuntimeIdentity(
  provenance: MemoryProvenance,
  env: Record<string, string | undefined> = process.env,
): string {
  return JSON.stringify({
    backendId: provenance.backendId,
    backendVersion: provenance.backendVersion ?? null,
    backendDetail: provenance.backendDetail ?? null,
    ...(provenance.backendId === "akm"
      ? {
          sourceGitSha: env.AKM_EVAL_AKM_SOURCE_SHA ?? null,
          sourceTreeFingerprint: env.AKM_EVAL_AKM_SOURCE_FINGERPRINT ?? null,
          sourceDirty: env.AKM_EVAL_AKM_SOURCE_DIRTY ?? null,
          explicitRuntimeFingerprint: env.AKM_EVAL_AKM_RUNTIME_FINGERPRINT ?? null,
        }
      : {}),
  });
}
