import { describe, expect, test } from "bun:test";
import { buildReport } from "./report.ts";
import { type RunTrial, errored, makeRow, metricsOf, rawOf, summarize, timeoutsOf } from "./score.ts";

const trial = (task: string, arm: "control" | "akm", reward: number | null, extra: Partial<RunTrial> = {}): RunTrial => ({
  task,
  arm,
  trial: `${task}__${arm}${Math.random().toString(36).slice(2, 7)}`,
  reward,
  error: reward === null ? "RuntimeError" : null,
  akm: arm === "akm" ? { akm_show: 1 } : null,
  tools: 3,
  curated: arm === "akm" ? false : null,
  tokens: { input: 1000, cache: 800, output: 100 },
  costUsd: null,
  seconds: 60,
  agentSeconds: 40,
  digest: null,
  timed_out: false,
  ...extra,
});

describe("makeRow", () => {
  test("counts the trials of each arm: the scored ones, the passes, the errors and the time-outs", () => {
    const trials = [trial("t", "control", 0), trial("t", "control", 1), trial("t", "control", null, { error: "AgentSetupTimeoutError", timed_out: true }), trial("t", "akm", 1, { error: "AgentTimeoutError", timed_out: true }), trial("t", "akm", 1)];
    expect(makeRow({ id: "t" }, { trials })).toMatchObject({
      id: "t",
      control: { trials: 3, scored: 2, passed: 1, errored: 1, timed_out: 1 },
      akm: { trials: 2, scored: 2, passed: 2, errored: 0, timed_out: 1 },
      paired: true,
    });
    expect(makeRow({ id: "t" }, { trials }).trials).toBe(trials); // the raw output stays in the row
  });

  test("a task is paired only when both arms have a trial with a reward, and a task with no verdict is errored", () => {
    const oneArm = makeRow({ id: "t" }, { trials: [trial("t", "control", 1)] });
    const noReward = makeRow({ id: "t" }, { trials: [trial("t", "control", 1), trial("t", "akm", null)] });
    const none = makeRow({ id: "t" }, { trials: [] });
    expect([oneArm.paired, noReward.paired, none.paired]).toEqual([false, false, false]);
    expect([oneArm, noReward, none].map(errored)).toEqual([true, true, true]);
    expect(none).toMatchObject({ control: { trials: 0, scored: 0, passed: 0, errored: 0, timed_out: 0 }, akm: { trials: 0 } });
    expect(errored(makeRow({ id: "t" }, { trials: [trial("t", "control", 0), trial("t", "akm", 0)] }))).toBe(false); // a failed pair is a verdict
  });

  test("reads a time-out from the trial, and from its exception when the trial does not say", () => {
    const row = makeRow({ id: "t" }, { trials: [{ ...trial("t", "control", 1, { error: "AgentTimeoutError" }), timed_out: undefined as unknown as boolean }, trial("t", "akm", 1)] });
    expect(row.control.timed_out).toBe(1);
    expect(row.akm.timed_out).toBe(0);
  });
});

describe("rawOf", () => {
  test("is the trials of a stored row", () => {
    const trials = [trial("t", "control", 1), trial("t", "akm", null)];
    expect(rawOf({ id: "t", trials, control: {}, akm: {}, paired: false })).toEqual({ raw: { trials } });
    expect(rawOf({ id: "t", trials: [] })).toEqual({ raw: { trials: [] } });
  });

  test("names what a row lacks: the trials, or the fields of a trial the report reads", () => {
    expect(rawOf({ id: "t", task: "t", arm: "akm", reward: 1 })).toEqual({ missing: ["trials"] }); // a run from before the manifest wrote one line per trial
    const { reward: _reward, error: _error, ...partial } = trial("t", "akm", 1);
    expect(rawOf({ id: "t", trials: [partial, "x"] })).toEqual({ missing: ["trials[].reward", "trials[].error", "trials[]"] });
    expect(rawOf({ id: "t", trials: [{ ...trial("t", "akm", 1), reward: null }] })).toHaveProperty("raw"); // a null is a value
  });
});

describe("summarize", () => {
  const trials = [trial("a", "control", 0, { trial: "a__1" }), trial("a", "akm", 1, { trial: "a__2" }), trial("b", "control", 1, { trial: "b__1" }), trial("b", "akm", 1, { trial: "b__2", timed_out: true }), trial("c", "control", null, { trial: "c__1" })];
  const rows = ["a", "b", "c"].map((id) => makeRow({ id }, { trials: trials.filter((t) => t.task === id) }));

  test("is the report, its metrics, the time-outs by arm and the errored trials of the trials, taken in the order of their names", () => {
    const s = summarize(rows);
    expect(s.report).toEqual(buildReport(trials));
    expect(s.metrics).toEqual(metricsOf(buildReport(trials), trials));
    expect(s.timeouts).toEqual({ control: 0, akm: 1 });
    expect(timeoutsOf(trials)).toEqual(s.timeouts);
    expect(s.n_errored).toBe(1);
  });

  test("does not depend on the order of the rows", () => {
    expect(summarize([...rows].reverse())).toEqual(summarize(rows));
    expect(summarize([rows[2] as never, rows[0] as never, rows[1] as never])).toEqual(summarize(rows));
  });

  test("gives an empty report for no rows", () => {
    expect(summarize([])).toMatchObject({ n_errored: 0, timeouts: { control: 0, akm: 0 }, report: { delta: null } });
  });
});
