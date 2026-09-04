import { describe, expect, test } from "bun:test";
import { type ProbeArtifact, gradePairedProbe } from "../src/probes/paired-grade.ts";

const artifact = (overrides: Partial<ProbeArtifact> = {}): ProbeArtifact => ({
  pack: "pack",
  questions: 20,
  evidenceScored: 20,
  zeroHitRate: 0,
  evidenceRecallAt5: 0.8,
  retrieval: { precisionAtK: 0.5, recallAtK: 0.6, mrr: 0.7, ndcgAtK: 0.65 },
  guardTripped: 0,
  scoreSaturatedTopKRate: 1,
  identityPermutation: {
    mode: "identity-permutation",
    rankingOrMetricDependent: false,
    queriesCompared: 20,
    rankChangedQueries: 0,
    metricChangedQueries: 0,
    missingQueryIds: [],
    extraQueryIds: [],
    duplicateBaselineQueryIds: [],
    duplicatePermutedQueryIds: [],
  },
  probeContext: {
    evaluatorCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    evaluatorDirty: "false",
    bunVersion: "1.3.13",
    datasetSha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    topK: 5,
    maxQuestions: 20,
    platform: "linux",
    arch: "x64",
    targetCommit: "published-or-unresolved",
    targetDirty: "false",
    targetVersion: "0.9.13",
    akmCommand: '["akm"]',
  },
  ...overrides,
});

const paired = (control: ProbeArtifact, candidate: ProbeArtifact) =>
  gradePairedProbe(
    { locomo: { ...control, pack: "locomo" }, longmemeval: { ...control, pack: "longmemeval" } },
    {
      locomo: { ...candidate, pack: "locomo" },
      longmemeval: { ...candidate, pack: "longmemeval" },
    },
  );

describe("paired release probe grading", () => {
  test("passes an equivalent hermetic candidate across all six metrics", () => {
    expect(paired(artifact(), artifact()).passed).toBe(true);
  });

  test("fails score regressions beyond the explicit tolerance and any zero-hit increase", () => {
    const candidate = artifact({
      zeroHitRate: 0.001,
      retrieval: { precisionAtK: 0.494, recallAtK: 0.6, mrr: 0.7, ndcgAtK: 0.65 },
    });
    const verdict = paired(artifact(), candidate);
    expect(verdict.passed).toBe(false);
    expect(
      verdict.packs[0]?.metrics.find((metric) => metric.metric === "zeroHitRate")?.verdict,
    ).toBe("regressed");
    expect(
      verdict.packs[0]?.metrics.find((metric) => metric.metric === "precisionAtK")?.verdict,
    ).toBe("regressed");
  });

  test("fails guards, missing identity checks, mismatched, unknown, and dirty contexts", () => {
    const candidate = artifact({
      guardTripped: 1,
      identityPermutation: undefined,
      probeContext: {
        evaluatorCommit: "different",
        bunVersion: "1",
        datasetSha256: "d",
        topK: 5,
        maxQuestions: 20,
      },
    });
    const verdict = paired(artifact(), candidate);
    expect(verdict.passed).toBe(false);
    expect(verdict.comparable).toBe(false);
    expect(verdict.contextMismatches).toContain(
      "locomo: evaluatorCommit: control=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa candidate=different",
    );
    const unknown = paired(
      artifact(),
      artifact({ probeContext: { ...artifact().probeContext, evaluatorCommit: "unknown" } }),
    );
    expect(unknown.contextMismatches).toContain("locomo candidate: unknown evaluator context");
    const dirty = paired(
      artifact(),
      artifact({ probeContext: { ...artifact().probeContext, targetDirty: "true" } }),
    );
    expect(dirty.contextMismatches).toContain("locomo candidate: dirty akm target");
  });

  test("rejects malformed context and a context split between pack artifacts", () => {
    const malformed = paired(artifact(), artifact({ probeContext: {} }));
    expect(malformed.comparable).toBe(false);
    expect(malformed.contextMismatches).toContain("locomo candidate: invalid evaluatorCommit");
    const clean = artifact();
    const split = gradePairedProbe(
      { locomo: { ...clean, pack: "locomo" }, longmemeval: { ...clean, pack: "longmemeval" } },
      {
        locomo: { ...clean, pack: "locomo" },
        longmemeval: {
          ...clean,
          pack: "longmemeval",
          probeContext: { ...clean.probeContext, akmCommand: '["other"]' },
        },
      },
    );
    expect(split.contextMismatches).toContain("candidate: locomo/longmemeval akmCommand differs");
  });

  test("rejects the wrong Bun pin and inconsistent question count", () => {
    const wrongBun = paired(
      artifact(),
      artifact({ probeContext: { ...artifact().probeContext, bunVersion: "1.4.0" } }),
    );
    expect(wrongBun.contextMismatches).toContain("locomo candidate: Bun must be pinned to 1.3.13");
    expect(paired(artifact(), artifact({ questions: 19 })).comparable).toBe(false);
  });
});
