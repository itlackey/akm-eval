import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildLmeCase, lmeCases, loadLmeCases } from "./lme.ts";
import { blankBudget, lmeRawOf, makeLmeRow, summarizeLme, type LmeRaw } from "./lme-score.ts";
import { lmePending } from "./lme-collect.ts";
import { pack } from "./protocol.ts";
import { tinyDataset } from "../../../benchmarks/longmemeval/src/fakes.ts";
import { MEASUREMENT } from "./measurement.ts";

const tiny = tinyDataset();
const usage = (prompt: number) => ({ prompt_tokens: prompt, completion_tokens: 5, cached_tokens: null, reasoning_tokens: null, cost_usd: null, seconds: 1, retries: 0, failed: false });
const judgeUsage = () => ({ ...usage(40), completion_tokens: 1 });

/** A raw whose answers are right or wrong as given, per arm and budget, as if the reader and the judge had been asked. */
function scripted(ok: Record<"none" | "source" | "inferred", boolean[]>, budgets = [2048, 4096], tokens = 3000): LmeRaw {
  const raw = lmePending(0, "1", budgets);
  raw.inference = { outcome: "output", report: null, error: null, index_seconds: 1, seconds: 5, model_calls: { calls: 3, errors: 0, prompt_tokens: 500, completion_tokens: 100, seconds: 2, output_tokens_per_second: 50 } };
  for (const arm of ["none", "source", "inferred"] as const) {
    raw.arms[arm].state = "complete";
    budgets.forEach((b, i) => {
      const slot = raw.arms[arm].budgets[String(b)]!;
      Object.assign(slot, { ...blankBudget(pack(arm === "none" ? [] : [{ ref: "memories/m1", content: "z".repeat(tokens * 4) }], b)), state: "complete", hypothesis: "an answer", verdict: ok[arm][i] ? "yes" : "no",
        answer: { text: "an answer", model: "m", promptTokens: 200 + b, completionTokens: 5, finishReason: "stop", seconds: 1, retries: 0, usage: usage(200 + b) }, judge_model: "judge", judge_usage: judgeUsage() });
    });
  }
  return raw;
}
const rows = (specs: { c?: number; ok: Record<"none" | "source" | "inferred", boolean[]> }[]) => specs.map((s, i) => makeLmeRow(buildLmeCase({ ...tiny[s.c ?? 0]!, question_id: `${tiny[s.c ?? 0]!.question_id}-${i}` }, 1, 1), scripted(s.ok)));

describe("summarizing LongMemEval rows", () => {
  // inferred beats source in 1 case and loses in 5 at 4096: the discordant counts of the McNemar worked example (1 against 5).
  const losing = rows([
    { ok: { none: [false, false], source: [false, false], inferred: [true, true] } },
    ...Array.from({ length: 5 }, () => ({ ok: { none: [false, false], source: [true, true], inferred: [false, false] } })),
    ...Array.from({ length: 10 }, () => ({ ok: { none: [false, false], source: [true, true], inferred: [true, true] } })),
  ]);
  const s = summarizeLme(losing);
  test("gives each budget its own arms and paired differences, and the primary budget at the top", () => {
    expect(s.metrics.budgets).toEqual([2048, 4096]);
    expect(Object.keys(s.metrics.by_budget)).toEqual(["2048", "4096"]);
    expect(s.metrics.primary_budget).toBe(4096);
    expect(s.metrics.arms.source.failure_inclusive_accuracy).toEqual(s.metrics.by_budget["4096"]!.arms.source.failure_inclusive_accuracy);
    expect(s.metrics.memory_inference).toEqual(s.metrics.by_budget["4096"]!.memory_inference);
  });
  test("tests the paired difference with the exact McNemar test over the discordant pairs", () => {
    const d = s.metrics.memory_inference.failure_inclusive;
    expect(d).toMatchObject({ n: 16, only_with_akm: 1, only_without_akm: 5, helps: 1, harms: 5, ties: 10, p_value: 0.21875 });
    expect(d.value).toBe(-0.25);
    expect(d.ci95![0]).toBeLessThan(-0.25); expect(d.ci95![1]).toBeGreaterThan(-0.25);
    expect(s.metrics.persistent_memory.failure_inclusive).toMatchObject({ helps: 15, harms: 0, p_value: 0.0000610352 });
  });
  test("reports the mean packed tokens and the reader's prompt tokens per arm and budget", () => {
    expect(s.metrics.by_budget["2048"]!.arms.source.mean_context_estimated_tokens).toBeLessThanOrEqual(2048);
    expect(s.metrics.by_budget["4096"]!.arms.source.mean_context_estimated_tokens).toBeGreaterThan(s.metrics.by_budget["2048"]!.arms.source.mean_context_estimated_tokens!);
    expect(s.metrics.by_budget["4096"]!.arms.none.mean_context_estimated_tokens).toBe(0);
    expect(s.metrics.by_budget["4096"]!.arms.source.mean_reported_prompt_tokens).toBe(200 + 4096);
  });
  test("counts every call, the judge's too, and a reused answer none", () => {
    expect(s.model_calls!.calls).toBe(16 * (3 + 6 + 6)); // 3 inference calls, 3 arms x 2 budgets of reader answers and as many verdicts
    const by = Object.fromEntries(s.calls_by.map(r => [r.process, r.calls]));
    expect(by).toEqual({ "native inference": 16 * 3, reader: 16 * 6, judge: 16 * 6 });
  });
  test("splits the accuracy by question type and by abstention, apart from the pooled rate", () => {
    const mixed = summarizeLme(rows([
      { c: 0, ok: { none: [false, false], source: [true, true], inferred: [true, true] } },
      { c: 1, ok: { none: [false, false], source: [true, true], inferred: [false, false] } },
      { c: 2, ok: { none: [true, true], source: [true, true], inferred: [false, false] } }, // the abstention question
    ]));
    expect(Object.keys(mixed.metrics.by_type).sort()).toEqual(["multi-session", "single-session-user", "temporal-reasoning"]);
    expect(mixed.metrics.by_type["single-session-user"]!.n).toBe(1);
    expect(mixed.metrics.abstention).toMatchObject({ n: 1, memory_inference: { helps: 0, harms: 1 } });
    expect(mixed.metrics.abstention.accuracy.inferred).toMatchObject({ correct: 0, n: 1 });
  });
  test("an unanswered arm is wrong in the failure-inclusive difference and left out of the complete pairs", () => {
    const raw = scripted({ none: [false, false], source: [true, true], inferred: [true, true] });
    raw.arms.inferred.budgets["4096"]!.state = "error"; raw.arms.inferred.budgets["4096"]!.error = "reader down"; raw.arms.inferred.state = "error";
    const t = summarizeLme([makeLmeRow(buildLmeCase(tiny[0]!, 1, 1), raw)]);
    expect(t).toMatchObject({ n_cases: 1, n_errored: 1, n_scored: 0 });
    expect(t.metrics.memory_inference.failure_inclusive).toMatchObject({ n: 1, value: -1, only_without_akm: 1, incomplete_pairs: 1, harms: 0 });
    expect(t.metrics.memory_inference.complete_pairs).toMatchObject({ n: 0, value: null, ci95: null });
  });
});

describe("saved LongMemEval rows", () => {
  const c = buildLmeCase(tiny[0]!, 1, 1);
  test("are read back from their raw output and scored again exactly", () => {
    const row = makeLmeRow(c, scripted({ none: [false, false], source: [true, true], inferred: [true, false] }));
    const reread = lmeRawOf(JSON.parse(JSON.stringify(row)));
    expect("raw" in reread && MEASUREMENT.score(c, reread.raw)).toEqual(row);
    expect(MEASUREMENT.rawOf(JSON.parse(JSON.stringify(row)))).toHaveProperty("raw");
    const broken = JSON.parse(JSON.stringify(row)); broken.raw.arms.source.budgets["2048"].context = null;
    expect(lmeRawOf(broken)).toEqual({ missing: ["raw.arms.source.budgets.2048 (invalid)"] });
  });
  test("their cases are rebuilt from the settings the summary records, for scoring again", () => {
    const root = mkdtempSync(join(tmpdir(), "memlme-root-"));
    try {
      mkdirSync(join(root, "benchmarks/longmemeval/assets"), { recursive: true });
      writeFileSync(join(root, "benchmarks/longmemeval/assets/longmemeval_s_cleaned.json"), JSON.stringify(tiny));
      const summary = { corpus: "public", case_source: "longmemeval", split: "dev", haystack: 1, sample_seed: 7, limit: 2 };
      const rebuilt = loadLmeCases(root, summary);
      expect(rebuilt).toEqual(lmeCases(tiny, { split: "dev", limit: 2, haystack: 1, sampleSeed: 7 }).cases);
      expect(MEASUREMENT.loadCases(root, summary)).toEqual(rebuilt);
      expect(() => loadLmeCases(root, { ...summary, haystack: undefined })).toThrow(/does not record haystack/);
      expect(() => loadLmeCases(root, { ...summary, corpus: "custom", corpus_folder: null })).toThrow(/which folder/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
