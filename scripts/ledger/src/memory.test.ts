import { expect, test } from "bun:test";
import { memoryColumns, memoryFields } from "./memory";
import { comparisonColumns, comparisonFields } from "./comparison";
import { memoryDataset, memorySummary } from "./fixtures/memory";
import { scores } from "./presentation";

test("three arms, both paired contrasts and confidence bounds are distinct recorded measurements", () => {
  const fields = memoryFields(memorySummary());
  expect([fields.memory_none_accuracy, fields.memory_source_accuracy, fields.memory_inferred_accuracy]).toEqual([25, 50, 75]);
  expect(fields.memory_memory_inference_failure_inclusive_gain).toBe(25);
  expect(fields.memory_memory_inference_complete_pairs_gain).toBeCloseTo(33.33);
  expect(fields.memory_memory_inference_failure_inclusive_ci_low).toBe(-80);
  expect(fields.memory_memory_inference_failure_inclusive_ci_high).toBe(100);
  expect(fields.memory_memory_inference_failure_inclusive_complete_pairs).toBe(3);
  expect(fields.memory_memory_inference_failure_inclusive_incomplete_pairs).toBe(1);
  expect(fields.memory_persistent_memory_failure_inclusive_gain).toBe(25);
  expect(fields.memory_inferred_protocol_correct).toBe(50);
  expect(fields.memory_inferred_accuracy).toBe(75); // malformed citation structure must not alter factual accuracy
});
test("failed work, partial reporting and unknown costs are not hidden or imputed", () => {
  const fields = memoryFields(memorySummary());
  expect(fields.memory_inferred_answer_s).toBe(6);
  expect(fields.memory_inferred_prompt_tokens).toBe(300);
  expect(fields.memory_inferred_prompt_tokens_reported).toBe(2);
  expect(fields.memory_inferred_prompt_tokens_attempted).toBe(4);
  expect(fields.memory_inferred_cost_usd).toBeNull();
  expect(fields.memory_inference_no_change).toBe(1);
  expect(fields.memory_inference_errors).toBe(1);
  expect(memoryDataset().runs[1]!.comparison.memory_inferred_cost_usd).toBe(0);
  const missing = memoryFields({ eval: "memory-utility", metrics: { inference: { mean_seconds: NaN } } });
  expect(Object.values(missing).every(v => v === null)).toBe(true);
});
test("legacy runs gain no columns or comparison fields; memory fields are explicit and unique", () => {
  const legacy = { eval: "reflect", metrics: {} };
  expect(memoryFields(legacy)).toEqual({});
  expect(Object.keys(comparisonFields(legacy, [], scores(legacy))).some(k => k.startsWith("memory_"))).toBe(false);
  expect(comparisonColumns([{ scores: [] }]).some(c => c.key.startsWith("memory_"))).toBe(false);
  const columns = memoryColumns(), fields = memoryFields(memorySummary());
  expect(new Set(columns.map(c => c.key)).size).toBe(columns.length);
  expect(columns.map(c => c.key).sort()).toEqual(Object.keys(fields).sort());
  expect(columns.every(c => c.description && c.group.startsWith("Memory ·"))).toBe(true);
  expect(memoryDataset().columns.some(c => c.key === "memory_context_budget")).toBe(true);
});
test("LongMemEval budgets give columns per standard budget, with exact p-values, and leave a budget a run did not record empty", () => {
  const budget = (a: number, b: number, c: number, tokens: number, gain: number, p: number) => ({
    arms: { none: { failure_inclusive_accuracy: { rate: a }, mean_context_estimated_tokens: 0 }, source: { failure_inclusive_accuracy: { rate: b }, mean_context_estimated_tokens: tokens }, inferred: { failure_inclusive_accuracy: { rate: c }, mean_context_estimated_tokens: tokens - 10 } },
    persistent_memory: { failure_inclusive: { value: b - a, ci95: [0, 1], p_value: 0.001 } }, memory_inference: { failure_inclusive: { value: gain, ci95: [gain - .2, gain + .2], p_value: p } } });
  const summary = { eval: "memory-utility", metrics: { by_budget: { "8192": budget(.1, .4, .3, 250, -.1, .3), "4096": budget(.1, .6, .5, 900, -.1, .21875) } },
    manifest: { eval_settings: { case_source: "longmemeval", split: "dev", haystack: 16, budgets: "4096,8192", judge_model: "judge", sample_seed: 42 } } };
  const f = memoryFields(summary);
  expect([f.memory_b4096_none_accuracy, f.memory_b4096_source_accuracy, f.memory_b4096_inferred_accuracy]).toEqual([10, 60, 50]);
  expect([f.memory_b4096_source_tokens, f.memory_b4096_inferred_tokens, f.memory_b8192_source_tokens]).toEqual([900, 890, 250]);
  expect([f.memory_b4096_memory_inference_gain, f.memory_b4096_memory_inference_p_value]).toEqual([-10, 0.21875]);
  expect(f.memory_b4096_memory_inference_ci_low).toBeCloseTo(-30);
  expect(memoryFields({ ...summary, metrics: { by_budget: { "4096": summary.metrics.by_budget["4096"] } } }).memory_b8192_source_accuracy).toBeNull(); // a budget the run did not record
  expect([f.memory_split, f.memory_case_source, f.memory_judge_model, f.memory_haystack, f.memory_sample_seed]).toEqual(["dev", "longmemeval", "judge", 16, 42]);
  const column = memoryColumns().find(c => c.key === "memory_b4096_memory_inference_p_value")!;
  expect(column).toMatchObject({ label: "Inferred − notes @ 4096 p-value", group: "Memory · budgets" });
  expect(memoryColumns().map(c => c.key).sort()).toEqual(Object.keys(f).sort());
});
