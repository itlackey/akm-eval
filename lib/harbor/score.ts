// The scorer of the evals that run an agent in Harbor (evals/agent-ab, benchmarks/terminal-bench): what turns the trials a run recorded into
// rows and the rows into the summary's report and metrics. It is the SCORER part of their measurement (see lib/manifest.ts and the
// README's "Run, save, compare"). It is pure and deterministic, needs no Docker and no akm, and imports nothing that collects: a
// change to the way trials are read from Harbor's folders is trials.ts, the collector's.
//
// The case is a task, and a row is one task with every trial of it, both arms and every attempt. The raw output of a row is its trials,
// as the run recorded them: the verifier's reward, the exception, the akm calls of the agent, the tokens and the times. The report is the
// paired comparison of the two arms over the tasks (report.ts), so it is computed from all the rows, and `summarize` gives it back.

import { type Arm, type Report, type Trial, buildReport, timedOut } from "./report.ts";

/** A trial as the run writes it to samples.jsonl: report.ts's, with whether it hit a time limit, and why the plugin was not live when it was not. */
export interface RunTrial extends Trial {
  /** The agent or its setup ran out of time (AgentTimeoutError, AgentSetupTimeoutError), whatever else the trial is later called. Counted apart from the other errors, so a slower akm shows as one. report.ts counts the timeouts of its tables from this. */
  timed_out: boolean;
}

/** The trials of one arm on one task, counted. */
export interface Tally {
  trials: number;
  /** Trials the verifier gave a reward. */
  scored: number;
  /** Scored trials with a reward of 1. */
  passed: number;
  /** Trials without a reward: they never got far enough, or the plugin was not shown to be live. */
  errored: number;
  timed_out: number;
}

/** What a task needs of its case to be scored: its name. The rest of a case is what the run presented to Harbor. */
export interface TaskCase {
  id: string;
}

/** The raw output of a task: every trial of it that Harbor left. */
export interface Raw {
  trials: RunTrial[];
}

/** One task of samples.jsonl: the raw trials, and what the scorer made of them. */
export interface Row extends Raw {
  id: string;
  control: Tally;
  akm: Tally;
  /** Both arms have a trial with a reward, so the task enters the paired difference. A task that is not has no verdict. */
  paired: boolean;
}

const tally = (trials: RunTrial[], arm: Arm): Tally => {
  const mine = trials.filter((t) => t.arm === arm);
  const scored = mine.filter((t) => t.reward !== null);
  return { trials: mine.length, scored: scored.length, passed: scored.filter((t) => t.reward === 1).length, errored: mine.length - scored.length, timed_out: mine.filter(timedOut).length };
};

/** The row for a task and its trials. */
export function makeRow(c: TaskCase, raw: Raw): Row {
  const control = tally(raw.trials, "control");
  const akm = tally(raw.trials, "akm");
  return { id: c.id, trials: raw.trials, control, akm, paired: control.scored > 0 && akm.scored > 0 };
}

/** What a trial of a stored row must hold, whatever its value (null included): the fields the report reads that a trial always has. */
const REQUIRED = ["task", "arm", "trial", "reward", "error", "akm"] as const;

/** The raw output of a stored row, or the names of the fields it lacks. A run from before the manifest wrote one row per trial, not per task, and has none of them. */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  if (!Array.isArray(row.trials)) return { missing: ["trials"] };
  const missing = new Set<string>();
  for (const t of row.trials) {
    if (typeof t !== "object" || t === null || Array.isArray(t)) missing.add("trials[]");
    else for (const field of REQUIRED) if (!(field in t)) missing.add(`trials[].${field}`);
  }
  return missing.size > 0 ? { missing: [...missing] } : { raw: { trials: row.trials as RunTrial[] } };
}

/** The task has no verdict: it is not in the paired difference, because one arm has no trial with a reward. */
export const errored = (row: Row): boolean => !row.paired;

/** Trials that hit a time limit, by arm: the count that report.ts makes of its tables (`timedOut`). */
export function timeoutsOf(trials: Trial[]): { control: number; akm: number } {
  const count = (arm: Arm) => trials.filter((t) => t.arm === arm && timedOut(t)).length;
  return { control: count("control"), akm: count("akm") };
}

/** Recorded benchmark metrics, also used by optional repeat summaries: numbers or null, none text. */
export function metricsOf(report: Report, trials: RunTrial[]) {
  const timeouts = timeoutsOf(trials);
  const arm = (a: Report["control"], name: Arm) => ({
    pass_rate: a.pass_rate?.value ?? null,
    passed: a.passed,
    scored: a.scored,
    errored: a.errored,
    timeouts: timeouts[name],
    minutes: a.per_trial.minutes,
    agent_minutes: a.per_trial.agent_minutes,
    cost_usd: a.per_trial.cost_usd,
  });
  const d = report.delta;
  const e = report.engagement;
  return {
    control: arm(report.control, "control"),
    akm: arm(report.akm, "akm"),
    delta: { value: d?.value ?? null, lo: d?.lo ?? null, hi: d?.hi ?? null, n: d?.n ?? null },
    better: { ...report.better },
    engagement: { rate: e.rate, called: e.called, trials: e.trials, curated_read: e.curated_read, control_calls: e.control_calls },
  };
}

/** The errored trials of both arms, for the summary's n_errored. */
export const erroredOf = (report: Report): number => report.control.errored + report.akm.errored;

/**
 * The fields of the summary that come from the rows: the report, its metrics, the timeouts by arm and the errored trials. The trials are
 * taken in the order Harbor's folders have, the order of their names, whatever the order of the rows: the bootstrap draws by position, so
 * the order the report reads them in is part of the number.
 */
export function summarize(rows: Row[]): { report: Report; metrics: ReturnType<typeof metricsOf>; timeouts: { control: number; akm: number }; n_errored: number } {
  const trials = rows.flatMap((r) => r.trials).sort((a, b) => a.trial.localeCompare(b.trial));
  const report = buildReport(trials);
  return { report, metrics: metricsOf(report, trials), timeouts: timeoutsOf(trials), n_errored: erroredOf(report) };
}
