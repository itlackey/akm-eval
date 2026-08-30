import type { MemoryBackend } from "./types.ts";

/**
 * Identify the memory backend a run actually exercised, for the run artifact.
 *
 * WHY THIS EXISTS
 *
 * Run artifacts recorded the evaluator/judge model but never the **backend
 * version under test**. Comparing two rounds therefore depended on someone
 * remembering which binary produced which file — and during the akm 0.9.1 ->
 * 0.9.3 work that memory was the only link between a results file and the
 * thing it measured. A retrieval fix that moves LongMemEval from 0.00 to 1.00
 * is uninterpretable if the artifact cannot say which CLI produced each half.
 *
 * The backend already knows: `healthCheck().detail` carries the resolved
 * version and command. This lifts it into metadata so the artifact is
 * self-describing.
 */
export interface MemoryProvenance {
  /** Backend id, e.g. `akm`, `raw-vector`, `none`. */
  backendId: string;
  /** Backend kind, e.g. `external` / `in-process` / `disabled`. */
  backendKind: string;
  /** Parsed semver of the backend under test, when it exposes one. */
  backendVersion?: string;
  /** Full health detail — the raw provenance string, including the resolved command. */
  backendDetail?: string;
}

/** `akm CLI 0.9.3 reachable via [...]` -> `0.9.3`. Undefined when absent. */
export function parseBackendVersion(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  const match = detail.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/);
  return match?.[1];
}

/**
 * Best-effort: a backend that cannot answer must not fail the run. A missing
 * version is recorded as absent rather than guessed — an artifact that says
 * nothing is honest, one that says the wrong version is not.
 */
export function describeMemoryProvenance(memory: MemoryBackend): MemoryProvenance {
  const base: MemoryProvenance = { backendId: memory.id, backendKind: memory.kind };
  try {
    const health = memory.healthCheck();
    const detail = typeof health.detail === "string" ? health.detail : undefined;
    const version = parseBackendVersion(detail);
    return {
      ...base,
      ...(version ? { backendVersion: version } : {}),
      ...(detail ? { backendDetail: detail } : {}),
    };
  } catch {
    return base;
  }
}
