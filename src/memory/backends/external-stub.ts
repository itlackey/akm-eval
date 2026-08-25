import { MemoryBackendUnavailableError } from "../../core/errors.ts";
import type { MemoryBackend, MemoryDocument, MemoryQuery, MemorySearchResult } from "../types.ts";

/**
 * Shared factory for memory backends that are planned but not yet
 * implemented against a real, truthful add/search contract (mem0, zep,
 * openviking). `add`/`search` fail loudly instead of silently returning
 * empty results; `healthCheck` reports the same detail at `warn`.
 *
 * `unavailable` is annotated `(): never` on the const (not just on the arrow)
 * so TypeScript treats each call site as a never-returning call — without
 * that annotation `search`'s body typechecks as falling off the end of a
 * function declared to return `Promise<MemorySearchResult[]>`.
 */
export function createExternalStub(id: string, detail: string): MemoryBackend {
  const unavailable: () => never = () => {
    throw new MemoryBackendUnavailableError(id, detail);
  };

  return {
    id,
    kind: "external",
    async add(_documents: MemoryDocument[]): Promise<void> {
      unavailable();
    },
    async search(_query: MemoryQuery): Promise<MemorySearchResult[]> {
      unavailable();
    },
    async reset(): Promise<void> {},
    healthCheck() {
      return { status: "warn", detail } as const;
    },
  };
}
