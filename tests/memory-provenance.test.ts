import { describe, expect, test } from "bun:test";
import { describeMemoryProvenance, parseBackendVersion } from "../src/memory/provenance.ts";
import type { MemoryBackend, MemoryHealth } from "../src/memory/types.ts";

function backend(
  id: string,
  kind: MemoryBackend["kind"],
  health: () => MemoryHealth,
): MemoryBackend {
  return {
    id,
    kind,
    add: async () => {},
    search: async () => [],
    reset: async () => {},
    healthCheck: health,
  };
}

describe("parseBackendVersion", () => {
  test("extracts the version from a real akm health detail", () => {
    expect(
      parseBackendVersion(
        'akm CLI 0.9.3 reachable via ["/usr/bin/akm"]; `akm info` responded successfully.',
      ),
    ).toBe("0.9.3");
  });

  test("keeps a prerelease suffix — 0.9.2-alpha.4 must not collapse to 0.9.2", () => {
    // The whole point is telling rounds apart; alpha.4 and stable 0.9.2
    // produced materially different numbers during the #819 work.
    expect(parseBackendVersion("akm CLI 0.9.2-alpha.4 reachable via [...]")).toBe("0.9.2-alpha.4");
  });

  test("returns undefined rather than guessing when there is no version", () => {
    expect(parseBackendVersion("in-process cosine store")).toBeUndefined();
    expect(parseBackendVersion(undefined)).toBeUndefined();
  });
});

describe("describeMemoryProvenance", () => {
  test("records id, kind, version and the raw detail for an external backend", () => {
    const p = describeMemoryProvenance(
      backend("akm", "external", () => ({
        status: "ok",
        detail: 'akm CLI 0.9.3 reachable via ["/usr/bin/akm"]',
      })),
    );
    expect(p.backendId).toBe("akm");
    expect(p.backendKind).toBe("external");
    expect(p.backendVersion).toBe("0.9.3");
    expect(p.backendDetail).toContain("/usr/bin/akm");
  });

  test("omits version instead of inventing one when the backend has none", () => {
    const p = describeMemoryProvenance(
      backend("raw-vector", "in-process", () => ({
        status: "ok",
        detail: "in-process cosine store",
      })),
    );
    expect(p.backendId).toBe("raw-vector");
    expect(p.backendVersion).toBeUndefined();
    expect(p.backendDetail).toBe("in-process cosine store");
  });

  test("a throwing healthCheck degrades to id+kind and never fails the run", () => {
    // Provenance is metadata. It must not be able to abort an expensive run.
    const p = describeMemoryProvenance(
      backend("akm", "external", () => {
        throw new Error("akm unreachable");
      }),
    );
    expect(p).toEqual({ backendId: "akm", backendKind: "external" });
  });
});
