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
