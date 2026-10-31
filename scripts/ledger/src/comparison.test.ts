import { expect, test } from "bun:test";
import { comparisonFields, coreColumns, distribution, scoreColumns } from "./comparison";
import { scores } from "./presentation";
import { presentRun } from "./data";

test("elapsed command distributions keep work sum separate from wall time and retain error timings", () => {
  const summary = { eval: "reflect", metrics: { defects: { rate: .75, correct: 3, n: 4 } } };
  const fields = comparisonFields(summary, [{ seconds: 1 }, { seconds: 2 }, { seconds: 3 }, { seconds: 4, error: "failed" }], scores(summary));
  expect(fields.case_mean_s).toBe(2.5);
  expect(fields.case_p50_s).toBe(2.5);
  expect(fields.case_p95_s).toBeCloseTo(3.85);
  expect(fields.case_work_s).toBe(10);
  expect(fields.run_wall_s).toBeNull();
  expect(fields.quality_percent).toBe(75);
  expect(fields.quality_cases).toBe(4);
  expect(distribution([null, undefined]).mean).toBeNull();
});

test("keyword and semantic search timings remain separate and primary ranking is explicitly named", () => {
  const summary = { eval: "skillret", n_queries: 2, query_seconds: 10, index_seconds: { keyword: 1, semantic: 8 },
    metrics: { search: { "NDCG@10": .5 }, semantic_search: { "NDCG@10": .8 } } };
  const fields = comparisonFields(summary, [
    { search: { seconds: 1 }, semantic_search: { seconds: 4 } },
    { search: { seconds: 3 }, semantic_search: { seconds: 8 } },
  ], scores(summary));
  expect(fields.keyword_mean_s).toBe(2);
  expect(fields.semantic_mean_s).toBe(6);
  expect(fields.query_wall_s).toBe(10);
  expect(fields.quality_metric).toBe("Keyword ranking · nDCG@10");
  expect(fields["score:Semantic ranking · nDCG@10"]).toBe(.8);
  expect(fields.case_mean_s).toBeNull();
});

test("paired answers expose per-arm timings and usage coverage including a failed call", () => {
  const summary = { eval: "longmemeval", metrics: { accuracy: {
    without_akm: { rate: .5, correct: 1, n: 2 }, with_akm: { rate: 1, correct: 1, n: 1 },
  } } };
  const fields = comparisonFields(summary, [
    { without_akm: { seconds: 4, prompt_tokens: 100, completion_tokens: 10 }, with_akm: { seconds: 1, prompt_tokens: 20, completion_tokens: 5 } },
    { without_akm: { seconds: 8, prompt_tokens: 200, completion_tokens: 20 }, with_akm: { error: "429", prompt_tokens: null, completion_tokens: null } },
  ], scores(summary));
  expect(fields.quality_metric).toBe("Correct answers with AKM");
  expect(fields.quality_percent).toBe(100);
  expect(fields.control_mean_s).toBe(6);
  expect(fields.akm_mean_s).toBe(1);
  expect(fields.input_tokens).toBe(320);
  expect(fields.akm_usage_cases).toBe(1);
  expect(fields.control_usage_cases).toBe(2);
  expect(fields.cost_usd).toBeNull();
});

test("paired improvement keeps percentage points and the recorded confidence interval separate from arm accuracy", () => {
  const fields = comparisonFields({ metrics: { accuracy: { difference: { value: .25, ci95: [-.1744, .6744], n: 4 } } } }, [], []);
  expect(fields.akm_delta_pp).toBe(25);
  expect(fields.akm_delta_lo_pp).toBeCloseTo(-17.44);
  expect(fields.akm_delta_hi_pp).toBeCloseTo(67.44);
  expect(fields.paired_cases).toBe(4);
});

test("nightly summary totals and agent trials use their recorded timing and token fields", () => {
  const night = comparisonFields({ seconds: { total: 250 }, calls_by: [
    { calls: 3, failures: 1, prompt_tokens: 100, completion_tokens: 10 },
    { calls: 2, failures: 0, prompt_tokens: 200, completion_tokens: 20 },
  ] }, [], []);
  expect([night.run_wall_s, night.calls, night.call_failures, night.input_tokens]).toEqual([250, 5, 1, 300]);
  const agent = comparisonFields({ eval: "agent-ab" }, [{ trials: [
    { arm: "control", seconds: 10, agentSeconds: 3, tokens: { input: 100, output: 5, cache: 10 }, costUsd: null },
    { arm: "akm", seconds: 20, agentSeconds: 4, tokens: { input: 200, output: 10, cache: 20 }, costUsd: null },
  ] }], []);
  expect([agent.control_mean_s, agent.akm_mean_s, agent.input_tokens, agent.cache_tokens]).toEqual([10, 20, 300, 30]);
  expect(agent.akm_agent_s).toBe(4);
  expect(agent.cost_usd).toBeNull();
});

test("a memory-utility summary's model_calls and calls_by give the run's total calls and token totals", () => {
  const fields = comparisonFields({ eval: "memory-utility", model_calls: { calls: 8, errors: 1, prompt_tokens: 342.9, completion_tokens: 75.7, seconds: 2.14, output_tokens_per_second: 35.3 }, calls_by: [
    { process: "native inference", model: "m", calls: 2, failures: 0, prompt_tokens: 1200, completion_tokens: 400 },
    { process: "reader", model: "m", calls: 6, failures: 1, prompt_tokens: 1200, completion_tokens: 130 },
  ] }, [], []);
  expect([fields.calls, fields.call_failures, fields.input_tokens, fields.output_tokens, fields.model_mean_input_tokens]).toEqual([8, 1, 2400, 530, 342.9]);
});

test("columns have unique IDs and projected settings cannot leak config credentials or endpoints", () => {
  const run = presentRun({ path: "v/suite/run", sourceRevision: "revision", samples: [], summary: {
    eval: "reflect", corpus: "public", status: "complete", model: "model", strategy: "reflect-only",
    engine: { temperature: 0, apiKey: "SECRET" },
    manifest: { engines: { model: { temperature: 0, enableThinking: false, endpoint: "https://gateway.example.com", apiKey: "SECRET" } } },
  } })!;
  expect(run.comparison.temperature).toBe(0);
  expect(run.comparison.thinking).toBe("Off");
  expect(JSON.stringify(run.comparison)).not.toContain("SECRET");
  expect(JSON.stringify(run.comparison)).not.toContain("gateway.example");
  const columns = [...coreColumns, ...scoreColumns([run])];
  expect(new Set(columns.map(column => column.key)).size).toBe(columns.length);
  expect(columns.every(column => column.label && column.description)).toBe(true);
});

test("model-call telemetry shows means separately from totals, including missing usage and zero failures", () => {
  const fields = comparisonFields({ wall_seconds: 24, seconds: 9, model_calls: {
    calls: 4, errors: 0, prompt_tokens: 120.5, completion_tokens: 15.5, seconds: 2.5, output_tokens_per_second: 6.2,
  } }, [], []);
  expect([fields.run_wall_s, fields.calls, fields.call_failures]).toEqual([24, 4, 0]);
  expect(fields.run_wall_basis).toBe("Runner elapsed");
  expect(comparisonFields({ seconds: 9 }, [], []).run_wall_basis).toBe("Legacy collector elapsed");
  expect([fields.model_mean_input_tokens, fields.model_mean_output_tokens, fields.model_mean_request_s, fields.model_output_tokens_per_s]).toEqual([120.5, 15.5, 2.5, 6.2]);
  expect(fields.input_tokens).toBeNull(); // never mean × calls: usage coverage is not recorded
  expect(fields.output_tokens).toBeNull();
  const missing = comparisonFields({}, [], []);
  expect(missing.model_mean_request_s).toBeNull();
  expect(missing.model_output_tokens_per_s).toBeNull();
});


test("recorded query modes take precedence over explicitly marked semantic configuration", () => {
  const configured = { config: { semanticSearchMode: "auto", apiKey: "SECRET" } };
  expect(comparisonFields(configured, [], []).search_method).toBe("semantic (configured)");
  expect(comparisonFields({ ...configured, search_mode: "keyword" }, [], []).search_method).toBe("keyword");
  expect(comparisonFields({ akm_env: { AKM_EVAL_SEMANTIC_SEARCH: "1" } }, [], []).search_method).toBe("semantic (configured)");
  expect(comparisonFields({ config: { semanticSearchMode: "off" } }, [], []).search_method).toBe("keyword (configured)");
  const setup = { ...configured, akm_install: { observed: { search_mode: ["semantic"] } } };
  expect(comparisonFields(setup, [], []).search_method).toBe("semantic (setup verified)");
  expect(comparisonFields({ ...setup, search_mode: "keyword" }, [], []).search_method).toBe("keyword");
  expect(comparisonFields({}, [], []).search_method).toBeNull();
  expect(JSON.stringify(comparisonFields(configured, [], []))).not.toContain("SECRET");
});


test("LongMemEval totals include actual judge calls once and retain unknown billing", () => {
  const call = { prompt_tokens: 7, completion_tokens: 3, cached_tokens: 2, retries: 0, cost_usd: null };
  const rows = [{ without_akm: { prompt_tokens: 7, completion_tokens: 3, reader_usage: call, judge_usage: call }, with_akm: { prompt_tokens: 7, completion_tokens: 3, reader_usage: call, judge_usage: null, judge_cached: true } }];
  const fields = comparisonFields({ eval: "longmemeval" }, rows, []);
  expect(fields).toMatchObject({ calls: 3, input_tokens: 21, output_tokens: 9, cache_tokens: 6, cost_usd: null, usage_basis: "Reader + judge", control_input_tokens: 7, akm_input_tokens: 7 });
  expect(comparisonFields({ eval: "longmemeval" }, [{ without_akm: { prompt_tokens: 7 } }], []).usage_basis).toBe("Reader only; judge usage unavailable");
});
