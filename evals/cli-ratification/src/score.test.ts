// The scorer: outcome pass and AKM-mediated pass by family, tokens per success with failed trials in the sum, and no composite.

import { describe, expect, test } from "bun:test";
import { type CliTrial, type Family, buildReport, errored, formatReport, makeRow, summarize } from "./score.ts";
import type { Trace } from "./trace.ts";

const trace = (o: Partial<Trace> = {}): Trace => ({ calls: 6, akm_calls: 3, help_calls: 1, help_chars: 200, doc_reads: 0, akm_chars: 900, invalid: 0, repeated: 0, first_useful_calls: 3, first_useful_seconds: 4, leakage: [], ...o });
let n = 0;
const trial = (task: string, family: Family, arm: string, o: Partial<CliTrial> = {}): CliTrial => ({
  task, arm: "akm", trial: `${task}__${String(n++).padStart(3, "0")}`, reward: 1, error: null, akm: { "akm (shell)": 3 }, tools: 6, tokens: { input: 1000, cache: 500, output: 100 }, costUsd: null, seconds: 60, timed_out: false, agent_exit: false,
  cli_arm: arm, family, failed_checks: [], mediated: true, trace: trace(), ...o,
});
const grid = (spec: Record<string, Partial<CliTrial>[]>, arms = ["minimal", "guidance"]) => {
  const ids = Object.keys(spec);
  return ids.map((id) => makeRow({ id, family: id.split("--")[0] as Family }, { arms, trials: arms.flatMap((arm, i) => [trial(id, id.split("--")[0] as Family, arm, spec[id][i] ?? {})]) }));
};

describe("outcome and AKM-mediated pass, by family", () => {
  test("a pass without akm is an outcome pass and not a mediated one; no trace is unknown", () => {
    const rows = grid({
      "apply--a": [{}, {}],
      "apply--b": [{ mediated: false }, { mediated: null, trace: null }],
      "repair--c": [{ reward: 0, failed_checks: ["1-lookup"], mediated: false }, {}],
    });
    const { report } = summarize(rows);
    expect(report.by_arm.minimal.by_family).toEqual({ apply: { scored: 2, passed: 2, mediated: 1, unmediated: 1, unknown: 0 }, repair: { scored: 1, passed: 0, mediated: 0, unmediated: 0, unknown: 0 } });
    expect(report.by_arm.guidance.by_family.apply).toEqual({ scored: 2, passed: 2, mediated: 1, unmediated: 0, unknown: 1 });
    expect(report.by_arm.minimal.failures).toEqual([{ task: "repair--c", trial: expect.any(String), error: null, failed_checks: ["1-lookup"], mediated: false }]);
  });

  test("there is no composite score in the metrics", () => {
    const { metrics } = summarize(grid({ "apply--a": [{}, {}] }));
    expect(Object.keys(metrics.arms.minimal).sort()).toEqual(["by_family", "calls_to_first_useful_median", "errored", "help_calls", "invalid_commands", "mediated_pass", "pass_rate", "passed", "scored", "tokens_per_success", "unmediated_pass"]);
    expect(metrics.arms.minimal.mediated_pass).toBe(1);
  });
});

describe("tokens per success", () => {
  test("every measured token counts, failed and errored trials included, divided by the successes", () => {
    const rows = grid({
      "apply--a": [{ tokens: { input: 1000, cache: 900, output: 100 } }, {}],
      "apply--b": [{ reward: 0, tokens: { input: 3000, cache: 0, output: 900 } }, {}],
      "apply--c": [{ reward: null, error: "AgentTimeoutError", tokens: { input: 2000, cache: 0, output: 0 } }, {}],
      "apply--d": [{ tokens: null }, {}],
    });
    const x = buildReport(rows).by_arm.minimal;
    expect(x.tokens).toMatchObject({ trials: 3, missing: 1, input: 6000, cache: 900, output: 1000 });
    expect(x.tokens.per_success).toBe(Math.round(7000 / 2)); // two successes: apply--a, apply--d (no usage: adds nothing)
  });

  test("no success: undefined, not zero and not infinite", () => {
    const x = buildReport(grid({ "apply--a": [{ reward: 0 }, {}] })).by_arm.minimal;
    expect(x.tokens.per_success).toBeNull();
    expect(formatReport(buildReport(grid({ "apply--a": [{ reward: 0 }, {}] }))).join("\n")).toContain("per success n/a");
  });

  test("a rise above 10% in one arm over the other is flagged for review", () => {
    const rows = grid({ "apply--a": [{ tokens: { input: 1200, cache: 0, output: 100 } }, { tokens: { input: 1000, cache: 0, output: 100 } }] });
    const c = buildReport(rows).comparisons[0];
    expect(c).toMatchObject({ a: "guidance", b: "minimal" });
    expect(c.tokens_per_success_change).toBe(-0.154);
    const up = buildReport(grid({ "apply--a": [{ tokens: { input: 1000, cache: 0, output: 100 } }, { tokens: { input: 1300, cache: 0, output: 100 } }] }));
    expect(up.comparisons[0].tokens_per_success_change).toBe(0.273);
    expect(formatReport(up).join("\n")).toContain("above the 10% review line");
  });
});

describe("the other figures", () => {
  test("calls to the first useful operation, help, invalid and repeated commands, trials over the tool budget", () => {
    const rows = grid({
      "apply--a": [{ trace: trace({ first_useful_calls: 2, calls: 5 }) }, {}],
      "apply--b": [{ trace: trace({ first_useful_calls: 8, calls: 45, invalid: 2, repeated: 1 }) }, {}],
      "apply--c": [{ trace: trace({ first_useful_calls: null, first_useful_seconds: null }) }, {}],
    });
    const c = buildReport(rows).by_arm.minimal.calls;
    expect(c).toMatchObject({ traced: 3, to_first_useful_median: 2, no_useful_operation: 1, invalid: 2, repeated: 1, help_calls: 3, over_budget: 1, tool_calls: 5 + 45 + 6 });
  });

  test("leakage is counted per trial for triage", () => {
    const rows = grid({ "apply--a": [{ trace: trace({ leakage: ["curl (call 2)", "npm (call 5)"] }) }, {}], "apply--b": [{}, {}] });
    expect(buildReport(rows).by_arm.minimal.leakage).toEqual({ trials: 1, hits: 2, by_trial: [{ task: "apply--a", trial: expect.any(String), hits: ["curl (call 2)", "npm (call 5)"] }] });
    expect(buildReport(rows).by_arm.guidance.leakage.hits).toBe(0);
  });

  test("a task with no scored trial in an arm has no verdict", () => {
    const [row] = grid({ "apply--a": [{ reward: null, error: "AgentSetupTimeoutError" }, {}] });
    expect(errored(row)).toBe(true);
    expect(row.tallies.minimal).toEqual({ trials: 1, scored: 0, passed: 0, errored: 1 });
  });

  test("the arms are compared task by task, with the sign test's counts", () => {
    const rows = grid({ "apply--a": [{ reward: 0 }, {}], "apply--b": [{ reward: 0 }, {}], "apply--c": [{}, {}] });
    const c = buildReport(rows).comparisons[0];
    expect(c.better).toEqual({ a: 2, b: 0, same: 1 });
    expect(c.delta?.value).toBe(0.667);
    expect(c.sign_test).toEqual({ n: 2, p: 0.5 });
  });
});
