import { describe, expect, test } from "bun:test";
import { latestGroups, presentRun, publicText, repeatVariation, sampleVerdicts } from "./data";

function report(overrides: Record<string, unknown> = {}) {
  return {
    eval: "reflect",
    corpus: "public",
    status: "complete",
    label: "real-r1",
    date: "2026-10-13T01:00:00Z",
    model: "model",
    akm_version: "0.10.1",
    harness_sha256: "harness",
    assets_sha256: "assets",
    n_scored: 2,
    n_errored: 1,
    metrics: { defects: { n: 1, correct: 1, rate: 1 }, controls: { n: 1, correct: 1 } },
    manifest: { collector: { version: "0.3" }, config: { sha256: "config" }, cases: { a: { input_sha256: "input" } } },
    ...overrides,
  };
}
function input(
  summary: unknown = report(),
  path = "0.10.1/reflect/real-r1",
  samples: unknown[] | null = [
    { id: "a", correct: true },
    { id: "b", correct: true },
    { id: "c", outcome: "error", error: "unsupported_type: Reflect refused: the file for agent is /tmp/source" },
  ],
) {
  return { summary, samples, path, sourceRevision: "revision" };
}

describe("published eval projection", () => {
  test("retains reduced denominators and classifies the actual refusal", () => {
    const run = presentRun(input())!;
    expect([run.recorded, run.scored, run.errors]).toEqual([3, 2, 1]);
    expect(run.result).toBe("Defects 1/1 · 100.00%");
    expect(run.notes).toContain("1 AKM file-layout refusals");
    expect(run.summary_url).toBe(
      "https://github.com/itlackey/akm-eval/blob/revision/reports/0.10.1/reflect/real-r1/summary.json",
    );
  });
  test("excludes private and incomplete results", () => {
    expect(presentRun(input(report({ corpus: "custom" })))).toBeNull();
    expect(presentRun(input(report({ status: "aborted" })))).toBeNull();
    expect(presentRun(input(report({ status: "running" })))).toBeNull();
  });
  test("uses sampling metadata and preserves diagnostic scope", () => {
    expect(presentRun(input(report({ limit: 3 })))!.role).toBe("Pilot");
    expect(presentRun(input(report({ sample: { n: 5, total: 500 } })))!.role).toBe("Pilot");
    expect(presentRun(input(report({ eval: "agent-ab", label: "bifrost-gpt120-pilot" })))!.role).toBe("Diagnostic");
  });
  test("does not invent zero counts or metrics for unfamiliar summaries", () => {
    const run = presentRun(
      input(
        report({ eval: "new-suite", n_scored: undefined, n_errored: undefined, metrics: { new_metric: 0.7 } }),
        "future/new-suite/run",
        null,
      ),
    )!;
    expect(run.recorded).toBeNull();
    expect(run.scored).toBeNull();
    expect(run.errors).toBeNull();
    expect(run.metrics.new_metric).toBe(0.7);
    expect(run.result).toBe("See recorded metrics");
  });
  test("whitelists presentation fields and removes private endpoints and credentials", () => {
    const run = presentRun(
      input(
        report({
          config: { apiKey: "DO_NOT_PUBLISH" },
          engine: { endpoint: "https://private.lab.example/v1" },
          metrics: {
            notes: "https://user:password@example.org/report and https://192.168.0.1/api and /home/operator/file",
          },
        }),
      ),
    )!;
    const encoded = JSON.stringify(run);
    expect(encoded).not.toContain("DO_NOT_PUBLISH");
    expect(encoded).not.toContain("user:password");
    expect(encoded).not.toContain("private.lab.example");
    expect(encoded).not.toContain("192.168.0.1");
    expect(encoded).not.toContain("/home/operator");
    expect(publicText("https://user:pass@host.lab.example/path")).toBe("[private endpoint]");
  });
});

describe("compatible recorded repeat groups", () => {
  test("unknown per-mode error counts remain unknown", () => {
    const run = presentRun(input(report({ n_errored: undefined, errored: { search: "unavailable", semantic: 0 } })))!;
    expect(run.errors).toBeNull();
  });
  test("accepts arbitrary case IDs and preserves groups with unspecified dates", () => {
    const verdicts = sampleVerdicts([{ id: "__proto__", correct: true }, { id: "constructor", correct: false }]);
    expect(Object.keys(verdicts.values)).toEqual(["__proto__", "constructor"]);
    const run = presentRun(input(report({ date: undefined })))!;
    expect(latestGroups([run], new Map())).toHaveLength(1);
  });
  test("counts pairwise flips and excludes a case errored in any repeat", () => {
    const variation = repeatVariation([
      sampleVerdicts([
        { id: "a", correct: true },
        { id: "b", correct: true },
        { id: "c", correct: true },
      ]),
      sampleVerdicts([
        { id: "a", correct: false },
        { id: "b", correct: true },
        { id: "c", outcome: "error" },
      ]),
      sampleVerdicts([
        { id: "a", correct: true },
        { id: "b", correct: true },
        { id: "c", correct: false },
      ]),
    ])!;
    expect(variation.n).toBe(2);
    expect(variation.unstable).toBe(1);
    expect(variation.flip_rate).toBeCloseTo(1 / 3);
    expect(variation.kind).toBe("correctness");
  });
  test("labels outcome flips and refuses mismatched or single-run verdict sets", () => {
    const outcome = sampleVerdicts([{ id: "a", outcome: "accept" }]);
    expect(outcome.kind).toBe("outcome");
    expect(repeatVariation([outcome])).toBeNull();
    expect(repeatVariation([outcome, sampleVerdicts([{ id: "a", correct: true }])])).toBeNull();
  });
  test("separates changed collectors, inputs and harnesses; selects the newest group", () => {
    const old = presentRun(input(report({ date: "2026-10-12T01:00:00Z", harness_sha256: "old" }), "v/suite/old"))!;
    const fresh = presentRun(input())!;
    const next = presentRun(input(report({ date: "2026-10-13T02:00:00Z", label: "real-r2" }), "v/suite/next"))!;
    const pilot = presentRun(input(report({ date: "2026-10-14T01:00:00Z", limit: 1 }), "v/suite/pilot"))!;
    const groups = latestGroups([old, fresh, next, pilot], new Map());
    expect(groups).toHaveLength(1);
    expect(groups[0]!.ids).toEqual([fresh.id, next.id]);
    expect(presentRun(input(report({ assets_sha256: "changed" })))!.cohort_key).not.toBe(fresh.cohort_key);
    expect(presentRun(input(report({ manifest: { collector: { version: "0.4" } } })))!.cohort_key).not.toBe(
      fresh.cohort_key,
    );
  });
});
