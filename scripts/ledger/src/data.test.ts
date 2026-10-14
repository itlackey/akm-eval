import { describe, expect, test } from "bun:test";
import { presentRun, publicText } from "./data";

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
    expect(run.scores[0]!.label).toBe("Correct fixes");
    expect(run.scores[0]!.value).toBe(1);
    expect(run.notes).toContain("1 AKM file-layout refusals");
    expect(run.summary_url).toBe(
      "https://github.com/itlackey/akm-eval/blob/revision/reports/0.10.1/reflect/real-r1/summary.json",
    );
  });
  test("retains saved measurement notes with public text redaction", () => {
    const run = presentRun(input(report({ notes: [
      "The Qwen judge differs from the benchmark judge.",
      "11 answers stopped at the token limit.",
      "Endpoint https://user:password@private.lab.example/v1 on /home/operator/data.",
      null, 7, "",
    ] }), "longmem/run", []))!;
    expect(run.notes).toContain("The Qwen judge differs from the benchmark judge.");
    expect(run.notes).toContain("11 answers stopped at the token limit.");
    expect(run.notes).toContain("[private endpoint] on ~/data.");
    expect(run.notes).not.toContain("user:password");
    expect(run.notes).not.toContain("private.lab.example");
    expect(run.notes).not.toContain("/home/operator");
  });
  test("exposes LongMemEval judge failures without rescoring identical answers", () => {
    const samples = [
      { without_akm: { ok: true, hypothesis: "Same answer.", correct: true }, with_akm: { ok: true, hypothesis: "Same answer.", correct: false } },
      { without_akm: { ok: true, hypothesis: "Different answer.", correct: true }, with_akm: { ok: true, hypothesis: "Another answer.", correct: false } },
      { without_akm: { ok: true, hypothesis: "Same answer.", correct: true }, with_akm: { ok: false, hypothesis: "Same answer.", correct: false } },
      { without_akm: { ok: true, hypothesis: null, correct: true }, with_akm: { ok: true, hypothesis: null, correct: false } },
      { without_akm: { ok: true, hypothesis: "Same answer.", correct: undefined }, with_akm: { ok: true, hypothesis: "Same answer.", correct: false } },
    ];
    const original = JSON.stringify(samples);
    const summary = report({ eval: "longmemeval", judge_undecidable: 1 });
    const run = presentRun(input(summary, "longmem/run", samples))!;
    expect(run.notes).toContain("1 judge response was undecidable.");
    expect(run.notes).toContain("1 identical answer received different grades across arms.");
    expect(JSON.stringify(samples)).toBe(original);
    expect(presentRun(input(report({ eval: "longmemeval", judge_undecidable: 0 }), "longmem/clean", []))!.notes).toBe("");
    expect(presentRun(input(report(), "reflect/run", samples))!.notes).not.toContain("identical answer");
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
    expect(run.scores).toEqual([]);
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

describe("independent saved runs", () => {
  test("unknown per-mode error counts remain unknown", () => {
    expect(presentRun(input(report({ n_errored: undefined, errored: { search: "unknown", semantic: 0 } })))!.errors).toBeNull();
  });
  test("retains each repeat and pilot, including missing dates and arbitrary IDs", () => {
    const runs = [report({ date: undefined }), report({ label: "r2" }), report({ limit: 1 })]
      .map((summary, i) => presentRun(input(summary, `run-${i}`, [{ id: "__proto__", correct: true }]))!);
    expect(runs).toHaveLength(3);
    expect(runs.map(r => r.id)).toEqual(["run-0", "run-1", "run-2"]);
    expect(runs[0]!.date).toBe("");
    expect(runs[2]!.role).toBe("Pilot");
    expect(runs.every(r => !("cohort_key" in r))).toBe(true);
  });
});
