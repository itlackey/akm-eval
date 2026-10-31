import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildManifest, caseDigests, completionOf, REPO_ROOT } from "../../../lib/manifest.ts";
import { comparePair } from "../../../scripts/compare/src/lib.ts";
import { rescoreRun } from "../../../scripts/rescore/src/lib.ts";
import { loadCases } from "./inputs.ts";
import { ARMS, armOrder, pack, promptFor, readerSettings } from "./protocol.ts";
import { blankArm, inferenceOutcome, pending } from "./collect.ts";
import { makeRow, parseAnswer, rawOf, scoreArm, summarize, type RawArm } from "./score.ts";
import { MEASUREMENT } from "./measurement.ts";

const cases = loadCases(join(import.meta.dir, "../assets"));
const c = cases[0]!;
const quote = "The Cedar image worker runs on host willow-07.";
function arm(value: string | null = "willow-07", citations = [{ ref: "memory", quote }]): RawArm {
  const text = JSON.stringify({ answers: { host: value }, citations: { host: citations } });
  return { ...blankArm(c.common), state: "complete", context: pack([{ ref: "memory", content: quote }], 100), answer: { text, model: "fixture", promptTokens: 10, completionTokens: 10, finishReason: "stop", seconds: 1, retries: 0, usage: { prompt_tokens: 10, completion_tokens: 10, cached_tokens: null, reasoning_tokens: null, cost_usd: null, seconds: 1, retries: 0, failed: false } } };
}
describe("memory utility protocol", () => {
  test("24 independent public libraries, diverse controls, no labels in no-memory prompts", () => {
    expect(cases).toHaveLength(24);
    expect(new Set(cases.map(c => JSON.stringify(c.notes))).size).toBe(24);
    expect(cases.filter(c => Object.values(c.fields).some(f => f.values === null)).length).toBeGreaterThanOrEqual(5);
    const prompt = promptFor(c, pack([], 100));
    expect(prompt).not.toContain("willow-07");
    expect(prompt).toContain('ref="common"');
  });
  test("all six orders occur, with deterministic balanced positions", () => {
    const orders = Array.from({ length: 6 }, (_, i) => armOrder(i, "fixed"));
    expect(new Set(orders.map(o => o.join())).size).toBe(6);
    for (let position = 0; position < 3; position++) for (const a of ARMS) expect(orders.filter(o => o[position] === a)).toHaveLength(2);
    expect(armOrder(4, "fixed")).toEqual(armOrder(4, "fixed"));
  });
  test("context budget includes headers, truncation preserves only visible bytes, exact duplicates count once", () => {
    const packed = pack([{ ref: "a", content: "x".repeat(500) }, { ref: "b", content: "x".repeat(500) }, { ref: "c", content: "tail" }], 40);
    expect(packed.text.length).toBeLessThanOrEqual(160);
    expect(packed.estimated_tokens).toBeLessThanOrEqual(40);
    expect(packed.duplicate_refs).toEqual(["b"]);
    expect(packed.truncated).toEqual(["a", "c"]);
    expect(packed.documents[0]!.content.length).toBeLessThan(500);
    expect(() => pack([], 0)).toThrow();
  });
  test("effective wire settings have one token limit", () => {
    expect(readerSettings({ max_completion_tokens: 2048, temperature: 0.7 })).toEqual({ temperature: 0.7, max_completion_tokens: 2048, retries: 0 });
    expect(readerSettings()).toEqual({ temperature: 0, max_tokens: 1024, retries: 0 });
  });
});
describe("objective answer scoring", () => {
  test("correct answer needs exact accepted value; citation proxy separate from correctness", () => {
    expect(scoreArm(c, arm())).toMatchObject({ correct: true, literal_evidence_supported_correct: true });
    expect(scoreArm(c, arm("willow-07", []))).toMatchObject({ correct: true, literal_evidence_supported_correct: false });
    expect(scoreArm(c, arm("maybe willow-07"))).toMatchObject({ correct: false });
  });
  test("malformed JSON, empty outputs, extra fields and false abstention are wrong", () => {
    for (const text of ["", "not json", "{}", '{"answers":{"host":false},"citations":{"host":[]}}']) {
      const a = arm(); a.answer!.text = text;
      expect(scoreArm(c, a)).toMatchObject({ evaluated: true, format_valid: false, correct: false });
    }
    expect(scoreArm(c, arm(null, []))).toMatchObject({ correct: false });
    expect(parseAnswer('{"answers":{"host":null},"citations":{"host":[{"ref":"a","quote":"x"}]}}', ["host"])).toBeNull();
  });
  test("correct factual values survive citation serialization errors, but protocol/citation outcomes fail", () => {
    const a = arm(); a.answer!.text = '{"answers":{"host":"willow-07"},"citations":[{"ref":"memory","quote":"Cedar image worker runs on host willow-07"}]}';
    expect(scoreArm(c, a)).toMatchObject({ correct: true, answer_values_valid: true, format_valid: false, protocol_correct: false, cited_correct: false });
  });
  test("long public source has real budget pressure at 512 estimated tokens", () => {
    const c = cases.find(c => c.id === "case-22")!;
    expect(pack(c.notes.map((content, i) => ({ ref: String(i), content })), 512).truncated.length).toBeGreaterThan(0);
  });
  test("unshown refs and truncated-away quotes cannot supply citation support", () => {
    expect(scoreArm(c, arm("willow-07", [{ ref: "never shown", quote }])).fields.host!.invalid_citation).toBe(true);
    const a = arm(); a.context = pack([{ ref: "memory", content: "x".repeat(500) + quote }], 50);
    expect(scoreArm(c, a)).toMatchObject({ correct: true, literal_evidence_supported_correct: false });
  });
  test("rescore uses saved common documentation, not later source changes", () => {
    const a = arm("willow-07", [{ ref: "common", quote }]);
    expect(scoreArm({ ...c, common: quote }, a).fields.host!.invalid_citation).toBe(true);
  });
  test("duplicate citations do not inflate evidence coverage", () => {
    const a = arm("willow-07", [{ ref: "memory", quote }, { ref: "memory", quote }]);
    expect(scoreArm(c, a).fields.host!.evidence_groups_matched).toBe(1);
  });
  test("outdated and wrong-scope values are explicitly distinguished", () => {
    const scoped = { ...c, fields: { host: { ...c.fields.host!, outdated: ["old-01"], wrong_scope: ["other-02"] } } };
    expect(scoreArm(scoped, arm("old-01")).fields.host!.outdated_answer).toBe(true);
    expect(scoreArm(scoped, arm("other-02")).fields.host!.wrong_scope_answer).toBe(true);
  });
  test("correct abstention is valid, guessed answers on unanswerable case are flagged", () => {
    const unknown = { ...c, fields: { host: { values: null, evidence: [] } } };
    expect(scoreArm(unknown, arm(null, []))).toMatchObject({ correct: true });
    expect(scoreArm(unknown, arm()).fields.host!.unsupported_unanswerable).toBe(true);
  });
});
describe("native outcome and error accounting", () => {
  const before = { "memories/a.md": "source" }, after = { ...before, "memories/a.derived.md": "child" };
  const report = (noChange: number, writtenFacts: number) => ({ memoryInference: { considered: 1, noChange, writtenFacts, skippedNoFacts: 0 } });
  test("no-change needs explicit counters and no child; output needs consistent counters", () => {
    expect(inferenceOutcome(report(1, 0), before, before)).toBe("no-change");
    expect(inferenceOutcome(report(0, 1), before, after)).toBe("output");
    expect(() => inferenceOutcome(report(1, 0), before, after)).toThrow();
    expect(() => inferenceOutcome({}, before, before)).toThrow();
    expect(() => inferenceOutcome({ ...report(0, 1), usageReport: { byProcessEngineModel: [{ process: "memoryInference", failures: 1 }] } }, before, after)).toThrow();
    expect(() => inferenceOutcome({ memoryInference: { considered: 1, noChange: 0, writtenFacts: 0, skippedNoFacts: 1 } }, before, before)).toThrow();
  });
  test("failure-inclusive denominator retains selected not-run cases without inventing ties", () => {
    const one = pending(c, 0, "1"), two = pending(cases[1]!, 1, "1");
    one.arms.none = arm(null, []); one.arms.source = arm(); one.arms.inferred = { ...blankArm(), state: "error", error: "inference failed" };
    const s = summarize([makeRow(c, one), makeRow(cases[1]!, two)]);
    expect(s.n_run).toBe(1); expect(s.n_selected).toBe(2); expect(s.n_errored).toBe(1); expect(s.n_unfinished).toBe(1);
    expect(s.metrics.arms.source.failure_inclusive_accuracy).toMatchObject({ correct: 1, n: 2, rate: 0.5 });
    expect(s.metrics.arms.source.evaluated_accuracy).toMatchObject({ n: 1, rate: 1 });
    expect(s.metrics.memory_inference.failure_inclusive).toMatchObject({ n: 2, complete_pairs: 0, incomplete_pairs: 2, helps: 0, harms: 0, ties: 0, ci95: null });
  });
  test("two all-win pairs do not imply certainty; singleton/no complete pair has no interval", () => {
    const rows = [c, { ...c, id: "independent-2" }].map((c, i) => {
      const raw = pending(c, i, "1"); raw.arms.none = arm(null, []); raw.arms.source = arm(); raw.arms.inferred = arm(); return makeRow(c, raw);
    });
    const s = summarize(rows), d = s.metrics.persistent_memory.failure_inclusive;
    expect(d.value).toBe(1); expect(d.ci95![0]).toBeLessThan(0); expect(d.ci95![1]).toBe(1);
    expect(summarize([rows[0]!]).metrics.persistent_memory.failure_inclusive.ci95).toBeNull();
    expect(summarize(rows)).toEqual(s);
  });
  test("failed reader work remains in observed costs; unknown cost is not zero", () => {
    const raw = pending(c, 0, "1"); raw.arms.source.state = "error"; raw.arms.source.seconds.retrieval = 9;
    const s = summarize([makeRow(c, raw)]);
    expect(s.metrics.arms.source.total_observed_phase_seconds.retrieval).toBe(9);
    expect(s.metrics.arms.source.reported_usage.cost_usd.total_reported).toBeNull();
  });
});
describe("saved result integration", () => {
  test("measurement separates inputs and labels, and comparative settings remain descriptive", () => {
    const first = caseDigests(MEASUREMENT, [c]);
    const changed = caseDigests(MEASUREMENT, [{ ...c, fields: { host: { ...c.fields.host!, values: ["different"] } } }]);
    expect(first[c.id]!.input_sha256).toBe(changed[c.id]!.input_sha256);
    expect(first[c.id]!.label_sha256).not.toBe(changed[c.id]!.label_sha256);
    const manifest = buildManifest({ measurement: MEASUREMENT, corpus: "public", cases: first, completion: { selected: [c.id], scored: [], errored: [] }, eval_settings: { context_tokens: 100 } });
    const a = { dir: "a", summary: { eval: "memory-utility", manifest }, rows: [] };
    const b = { dir: "b", summary: { eval: "memory-utility", manifest: { ...manifest, eval_settings: { context_tokens: 200 } } }, rows: [] };
    expect(comparePair(a, b).changes.some(c => c.field === "benchmark_settings")).toBe(true);
  });
  test("rescore exactly replays complete and pending rows without changing pending completion", () => {
    const raw = pending(c, 0, "1");
    const row = makeRow(c, raw), summary = { eval: "memory-utility", corpus: "public", status: "aborted", ...summarize([row]), manifest: buildManifest({ measurement: MEASUREMENT, corpus: "public", cases: caseDigests(MEASUREMENT, [c]), completion: { selected: [c.id], scored: [], errored: [] } }) };
    const res = rescoreRun({ dir: "fixture", summary, rows: [row] }, { root: REPO_ROOT, now: new Date("2026-04-01") });
    expect(res.rows).toEqual([row]); expect(res.summary.metrics).toEqual(summary.metrics);
    expect(res.summary.manifest.completion).toEqual({ selected: [c.id], scored: [], errored: [] });
    for (const a of ARMS) raw.arms[a] = arm();
    const complete = makeRow(c, raw);
    expect(MEASUREMENT.score(c, (rawOf(complete) as { raw: typeof raw }).raw)).toEqual(complete);
    expect(completionOf(MEASUREMENT, [c.id], [complete]).scored).toEqual([c.id]);
  });
  test("corrupt nested replay is rejected with an actionable raw-field problem", () => {
    const row = makeRow(c, pending(c, 0, "1"));
    (row.raw.arms.none.context as any).documents = null;
    expect(rawOf(row)).toEqual({ missing: ["raw.arms.none.context (invalid)"] });
  });
});
