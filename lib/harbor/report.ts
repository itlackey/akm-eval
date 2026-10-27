// The report of the evals that run an agent in Harbor with and without akm (evals/agent-ab, benchmarks/terminal-bench): the trials
// each run recorded, as pass rates, the paired difference with its sign test and the engagement split. This is the SCORER half: it
// does no I/O, and it imports nothing that collects (trials.ts reads Harbor's folders). A change here changes a score and invalidates
// no run, since scripts/rescore scores the stored trials again. See score.ts, which makes the rows and the summary fields from it.
//
// A trial is one task run once by one arm. The control arm is opencode alone, the akm arm is opencode with the akm
// plugin. A trial is scored when the verifier gave it a reward, and errored when it did not: it never got far enough,
// or the plugin was not shown to be live. Errored trials are left out of the rates and counted. A trial whose agent ran
// out of time is counted apart, as a timeout: Harbor still verifies it, so it is usually scored too.

export type Arm = "control" | "akm";

export interface Trial {
  task: string;
  arm: Arm;
  trial: string;
  /** The verifier's reward, 1 or 0. Null when the verifier never ran. */
  reward: number | null;
  /** The exception type, when Harbor recorded one. A trial can have both an exception and a reward: an agent that ran out of time is still verified. */
  error: string | null;
  /** Calls per akm tool, such as { akm_show: 1 }, and `akm (shell)` for akm run in the shell by an arm that has it. Null when the trial left no readable stream. */
  akm: Record<string, number> | null;
  /** All tool calls of the trial, akm's included. */
  tools: number | null;
  /** Whether the agent read the curated results the plugin writes at the start of a session. Null for the control, and when the trial left no readable stream. */
  curated?: boolean | null;
  tokens: { input: number; cache: number; output: number } | null;
  costUsd: number | null;
  seconds: number | null;
  /** How long the agent's own run took, apart from the setup. */
  agentSeconds?: number | null;
  /** The digest of the task the trial ran, as Harbor recorded it for a task fetched from a registry. Null for a task in a folder. */
  digest?: string | null;
  /** The agent, or its setup, ran out of time. The run sets it before it relabels a trial, so a trial that timed out and then failed the plugin check still counts as a timeout. Left out in a trial read straight from Harbor's folder, which says it by its exception. */
  timed_out?: boolean;
  /** The plugin was not shown to be live in this trial, and why. Left out otherwise. */
  plugin_problem?: string;
}

export interface Estimate {
  value: number;
  lo: number;
  hi: number;
  /** How many tasks the estimate averages over. */
  n: number;
}

/** The paired difference: an Estimate whose interval is the 95% interval of the paired bootstrap, and how it was resampled. */
export interface Delta extends Estimate {
  /** [lo, hi] again, as one value. */
  ci: [number, number];
  /** What the bootstrap resamples: the tasks, or the tasks and, inside each, its attempts. The second is used as soon as a task has more than one scored attempt in an arm. */
  resampled: "tasks" | "tasks and attempts";
}

/** An exact sign test on the tasks where the arms disagree. */
export interface SignTest {
  /** The tasks the akm arm did better on, and the tasks the control did better on. */
  akm: number;
  control: number;
  /** The tasks the arms disagree on: akm plus control. The tasks they did the same on carry no information and are left out. */
  n: number;
  /** The two-sided p-value: how often a split at least this lopsided turns up among n tasks when neither arm is better. 1 when n is 0. */
  p: number;
}

export interface ArmSummary {
  trials: number;
  scored: number;
  errored: number;
  passed: number;
  tasks: number;
  /** The mean over tasks of each task's pass rate, so every task weighs the same however many attempts it has. */
  pass_rate: Estimate | null;
  /** Trials by exception type, scored or not. A trial that timed out and was still verified is in here and in `scored`. */
  exceptions: Record<string, number>;
  /** Trials whose agent, or its setup, ran out of time (`timedOut`). */
  timeouts: number;
  /** The mean per scored trial, over those that have the figure: minutes in all, minutes of the agent's own run, dollars, input and output tokens, and tool calls (akm's included). An errored trial stopped in the setup and says nothing of what a run takes. Summaries written before the last three were added lack them. */
  per_trial: { minutes: number | null; agent_minutes: number | null; cost_usd: number | null; input_tokens: number | null; output_tokens: number | null; tool_calls: number | null };
  tokens: { input: number; cache: number; output: number; cost_usd: number | null };
}

export interface Split {
  trials: number;
  passed: number;
  /** Treatment minus control on the tasks this split has trials for, paired by task. */
  delta: Delta | null;
}

export interface Report {
  control: ArmSummary;
  akm: ArmSummary;
  /** akm minus control, over the tasks both arms have a scored trial for. */
  delta: Delta | null;
  /** Those tasks by who did better: the akm arm passed more of its attempts, the control did, or they passed the same share. */
  better: { akm: number; control: number; same: number };
  /** The sign test on the tasks where the arms disagree, which are `better.akm` and `better.control`. Null when no task has a scored trial in both arms. */
  sign_test: SignTest | null;
  /** Per arm, the tasks whose scored attempts did not all agree, out of the tasks with more than one: how much the arm moves on a rerun, which is the noise a difference has to clear. */
  flips: { control: { tasks: number; of: number }; akm: { tasks: number; of: number } };
  engagement: {
    /** Scored akm trials whose stream could be read. */
    trials: number;
    called: number;
    rate: number | null;
    calls: Record<string, number>;
    /** The scored akm trials in which the agent read the curated results the plugin wrote for it, whether or not it called a tool. */
    curated_read: number;
    /** akm trials that called an akm tool, and the same trials that did not. */
    called_split: Split;
    not_called_split: Split;
    /** Control trials that called an akm tool. It should be 0: the control has no plugin. */
    control_calls: number;
  };
  tasks: {
    task: string;
    control: string;
    akm: string;
    called: string;
    /** Whether both arms were scored on the task and passed different shares of their attempts. */
    disagree: boolean;
    /** Per arm, the scored attempts that went against the task's majority outcome: 0 when they all agree or there is one, 1 for a 2-1 or 1-1 split. */
    flips: { control: number; akm: number };
  }[];
}

const EPSILON = 1e-9; // two task means that differ by less are the same
const RESAMPLES = 10_000;
const SEED = 1337;
const ALPHA = 0.05;

const round = (x: number, places = 3): number => Number(x.toFixed(places));
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number => sum(xs) / xs.length;

/** A small seeded generator (mulberry32), so a report of the same trials always gives the same intervals. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The mean of `values` and its 95% interval: the 2.5th and 97.5th percentile of the mean over 10,000 resamples of
 * the values with replacement. The values are per task, so the interval is over tasks. It says how much the mean
 * would move with other tasks like these, not how much it would move on a rerun of the same tasks.
 */
export function estimate(values: number[]): Estimate | null {
  if (values.length === 0) return null;
  const next = rng(SEED);
  const means: number[] = [];
  for (let i = 0; i < RESAMPLES; i++) {
    let total = 0;
    for (let j = 0; j < values.length; j++) total += values[Math.floor(next() * values.length)];
    means.push(total / values.length);
  }
  const [lo, hi] = interval(means);
  return { value: round(mean(values)), lo, hi, n: values.length };
}

/** The 2.5th and 97.5th percentile of the resampled means, sorted in place. */
function interval(means: number[]): [number, number] {
  means.sort((a, b) => a - b);
  const at = (q: number) => means[Math.min(RESAMPLES - 1, Math.max(0, Math.floor(q * RESAMPLES)))];
  return [round(at(ALPHA / 2)), round(at(1 - ALPHA / 2))];
}

/** One task's scored rewards in each arm. */
export interface Pair {
  akm: number[];
  control: number[];
}

/** akm minus control on one task: the difference of the mean rewards. */
const difference = (p: Pair): number => mean(p.akm) - mean(p.control);

/**
 * The mean over tasks of akm minus control, and its 95% interval from a paired bootstrap: each of the 10,000 resamples
 * draws tasks with replacement, so a task takes its two arms with it, and inside a drawn task draws each arm's scored
 * attempts with replacement. So the interval holds the variance of a rerun of the same tasks as well as of other tasks.
 * That counts the attempts' noise twice (it is in each task's mean already), so it errs wide, not narrow. A task with
 * one attempt in an arm has nothing to resample there; when none has more, no attempt is drawn and the interval is
 * the bootstrap over tasks alone, the same numbers `estimate` gives for the per-task differences.
 */
export function pairedEstimate(pairs: Pair[]): Delta | null {
  if (pairs.length === 0) return null;
  const next = rng(SEED);
  const redraw = (xs: number[]): number => {
    if (xs.length === 1) return xs[0];
    let total = 0;
    for (let k = 0; k < xs.length; k++) total += xs[Math.floor(next() * xs.length)];
    return total / xs.length;
  };
  const means: number[] = [];
  for (let i = 0; i < RESAMPLES; i++) {
    let total = 0;
    for (let j = 0; j < pairs.length; j++) {
      const p = pairs[Math.floor(next() * pairs.length)];
      total += redraw(p.akm) - redraw(p.control);
    }
    means.push(total / pairs.length);
  }
  const [lo, hi] = interval(means);
  const resampled = pairs.some((p) => p.akm.length > 1 || p.control.length > 1) ? "tasks and attempts" : "tasks";
  return { value: round(mean(pairs.map(difference))), lo, hi, n: pairs.length, ci: [lo, hi], resampled };
}

/**
 * The two-sided exact sign test: the probability, if each of the `akm + control` tasks that differ were a fair coin,
 * of a split at least as lopsided as `akm` to `control`. 1 when no task differs.
 */
export function signTest(akm: number, control: number): number {
  const n = akm + control;
  if (n === 0) return 1;
  // P(X <= k) for X ~ Binomial(n, 1/2), summed in log space so a large n does not underflow
  let logTerm = -n * Math.LN2;
  let tail = 0;
  for (let i = 0; i <= Math.min(akm, control); i++) {
    tail += Math.exp(logTerm);
    logTerm += Math.log((n - i) / (i + 1));
  }
  return Math.min(1, 2 * tail);
}

/** The exceptions Harbor records when the agent, or the setup before it, runs out of time. The collector (trials.ts) has the same two, for the row it writes. */
const TIMEOUTS = new Set(["AgentTimeoutError", "AgentSetupTimeoutError"]);

const scored = (t: Trial): t is Trial & { reward: number } => t.reward !== null;
/** Whether a trial ran out of time. This is the one count of timeouts: the tables, the printed line, the summary's `timeouts` and its metrics all use it. */
export const timedOut = (t: Trial): boolean => t.timed_out ?? (t.error !== null && TIMEOUTS.has(t.error));
const called = (t: Trial): boolean => t.akm !== null && Object.keys(t.akm).length > 0;

/** The scored rewards of the given trials, by task. */
function rewardsByTask(trials: Trial[]): Map<string, number[]> {
  const rewards = new Map<string, number[]>();
  for (const t of trials.filter(scored)) rewards.set(t.task, [...(rewards.get(t.task) ?? []), t.reward]);
  return rewards;
}

/** Each task's mean reward over the given scored trials. */
function perTask(trials: Trial[]): Map<string, number> {
  return new Map([...rewardsByTask(trials)].map(([task, r]) => [task, mean(r)]));
}

/** The tasks both arms have scored rewards for, each with its rewards in the two arms. */
function pair(akm: Map<string, number[]>, control: Map<string, number[]>): Pair[] {
  return [...akm].filter(([task]) => control.has(task)).map(([task, rewards]) => ({ akm: rewards, control: control.get(task) as number[] }));
}

/** How many of a task's attempts went against its majority outcome, a pass being a reward of 1. A 1-1 split counts 1. */
const minority = (rewards: number[]): number => {
  const passed = rewards.filter((x) => x === 1).length;
  return Math.min(passed, rewards.length - passed);
};

/** The tasks with more than one scored attempt, and how many of them had attempts that did not all agree. */
function flipped(rewards: Map<string, number[]>): { tasks: number; of: number } {
  const reruns = [...rewards.values()].filter((r) => r.length > 1);
  return { tasks: reruns.filter((r) => minority(r) > 0).length, of: reruns.length };
}

function summarize(trials: Trial[]): ArmSummary {
  const ok = trials.filter(scored);
  const exceptions: Record<string, number> = {};
  for (const t of trials) if (t.error) exceptions[t.error] = (exceptions[t.error] ?? 0) + 1;
  const withTokens = trials.filter((t) => t.tokens);
  const costs = trials.map((t) => t.costUsd).filter((c): c is number => c !== null);
  const average = (values: (number | null | undefined)[], places: number): number | null => {
    const known = values.filter((v): v is number => typeof v === "number");
    return known.length ? round(mean(known), places) : null;
  };
  return {
    trials: trials.length,
    scored: ok.length,
    errored: trials.length - ok.length,
    passed: ok.filter((t) => t.reward === 1).length,
    tasks: new Set(ok.map((t) => t.task)).size,
    pass_rate: estimate([...perTask(trials).values()]),
    exceptions,
    timeouts: trials.filter(timedOut).length,
    per_trial: {
      minutes: average(ok.map((t) => (t.seconds === null ? null : t.seconds / 60)), 1),
      agent_minutes: average(ok.map((t) => (t.agentSeconds == null ? null : t.agentSeconds / 60)), 1),
      cost_usd: average(ok.map((t) => t.costUsd), 4),
      input_tokens: average(ok.map((t) => t.tokens?.input), 0),
      output_tokens: average(ok.map((t) => t.tokens?.output), 0),
      tool_calls: average(ok.map((t) => t.tools), 1),
    },
    tokens: {
      input: sum(withTokens.map((t) => t.tokens?.input ?? 0)),
      cache: sum(withTokens.map((t) => t.tokens?.cache ?? 0)),
      output: sum(withTokens.map((t) => t.tokens?.output ?? 0)),
      cost_usd: costs.length ? round(sum(costs), 4) : null,
    },
  };
}

export function buildReport(trials: Trial[]): Report {
  const control = trials.filter((t) => t.arm === "control");
  const akm = trials.filter((t) => t.arm === "akm");
  const controlRewards = rewardsByTask(control);
  const akmRewards = rewardsByTask(akm);
  const akmReadable = akm.filter((t) => scored(t) && t.akm !== null);
  const split = (rows: Trial[]): Split => ({ trials: rows.length, passed: rows.filter((t) => t.reward === 1).length, delta: pairedEstimate(pair(rewardsByTask(rows), controlRewards)) });
  const calls: Record<string, number> = {};
  for (const t of akmReadable) for (const [tool, n] of Object.entries(t.akm ?? {})) calls[tool] = (calls[tool] ?? 0) + n;
  const nCalled = akmReadable.filter(called).length;
  const both = pair(akmRewards, controlRewards);
  const d = both.map(difference);
  const better = { akm: d.filter((x) => x > EPSILON).length, control: d.filter((x) => x < -EPSILON).length, same: d.filter((x) => Math.abs(x) <= EPSILON).length };

  const names = [...new Set(trials.map((t) => t.task))].sort();
  const cell = (rows: Trial[], keep: (t: Trial) => boolean = () => true) => {
    const ok = rows.filter(scored);
    const late = rows.filter(timedOut).length;
    return `${ok.filter((t) => keep(t) && t.reward === 1).length}/${ok.filter(keep).length}${late ? ` T${late > 1 ? late : ""}` : ""}`;
  };
  return {
    control: summarize(control),
    akm: summarize(akm),
    delta: pairedEstimate(both),
    better,
    sign_test: both.length ? { akm: better.akm, control: better.control, n: better.akm + better.control, p: Number(signTest(better.akm, better.control).toPrecision(3)) } : null,
    flips: { control: flipped(controlRewards), akm: flipped(akmRewards) },
    engagement: {
      trials: akmReadable.length,
      called: nCalled,
      rate: akmReadable.length ? round(nCalled / akmReadable.length) : null,
      calls,
      curated_read: akmReadable.filter((t) => t.curated).length,
      called_split: split(akmReadable.filter(called)),
      not_called_split: split(akmReadable.filter((t) => !called(t))),
      control_calls: control.filter(called).length,
    },
    tasks: names.map((task) => {
      const a = akm.filter((t) => t.task === task);
      const c = controlRewards.get(task);
      const k = akmRewards.get(task);
      return {
        task,
        control: cell(control.filter((t) => t.task === task)),
        akm: cell(a),
        called: `${a.filter((t) => scored(t) && called(t)).length}/${a.filter((t) => scored(t) && t.akm !== null).length}`,
        disagree: c !== undefined && k !== undefined && Math.abs(mean(k) - mean(c)) > EPSILON,
        flips: { control: minority(c ?? []), akm: minority(k ?? []) },
      };
    }),
  };
}

const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const ci = (e: Estimate | Delta | null, signed = false): string =>
  e === null ? "n/a" : `${signed && e.value >= 0 ? "+" : ""}${e.value.toFixed(3)} [${e.lo.toFixed(3)}, ${e.hi.toFixed(3)}] over ${e.n} tasks${"resampled" in e && e.resampled === "tasks and attempts" ? " and their attempts" : ""}`;

/** The report as the lines run.ts prints. */
export function formatReport(r: Report): string[] {
  const row = (name: string, a: ArmSummary) => {
    const why = Object.entries(a.exceptions).filter(([k]) => !TIMEOUTS.has(k)).map(([k, v]) => `${k} ${v}`).join(", ");
    return `  ${name.padEnd(8)} ${String(a.trials).padStart(3)} trials, ${a.scored} scored, ${a.errored} errored${why ? ` (exceptions: ${why})` : ""}, ${a.timeouts} timed out   pass rate ${ci(a.pass_rate)}`;
  };
  const e = r.engagement;
  const n = (x: number) => x.toLocaleString("en-US");
  const used = (name: string, a: ArmSummary) => `  ${name.padEnd(8)} ${n(a.tokens.input)} input tokens (${n(a.tokens.cache)} from cache), ${n(a.tokens.output)} output${a.tokens.cost_usd === null ? "" : `, ${a.tokens.cost_usd} USD as the model reports it`}`;
  const per = (name: string, a: ArmSummary) => {
    const p = a.per_trial;
    const minutes = (x: number | null) => (x === null ? "n/a" : x.toFixed(1));
    const count = (x: number | null, what: string) => (x === null ? "" : `, ${n(x)} ${what}`);
    return `  ${name.padEnd(8)} per scored trial: ${minutes(p.minutes)} minutes, ${minutes(p.agent_minutes)} of them the agent's own run${p.cost_usd === null ? "" : `, ${p.cost_usd} USD`}${count(p.input_tokens, "input tokens")}${count(p.output_tokens, "output tokens")}${count(p.tool_calls, "tool calls")}`;
  };
  const split = (name: string, s: Split) => `    ${name.padEnd(11)} ${s.passed}/${s.trials} trials passed, difference from the control ${ci(s.delta, true)}`;
  const b = r.better;
  const lines = [row("control", r.control), row("akm", r.akm), `  difference (akm - control, paired by task)  ${ci(r.delta, true)}`];
  lines.push(`  of those ${b.akm + b.control + b.same} tasks, the akm arm did better on ${b.akm}, the control on ${b.control}, and they did the same on ${b.same}`);
  const sign = r.sign_test;
  if (sign) lines.push(sign.n ? `  sign test on the ${sign.n} tasks the arms disagree on (akm better on ${sign.akm}, control on ${sign.control}): exact two-sided p = ${sign.p}` : "  sign test: the arms disagree on no task, so there is nothing to test");
  const f = r.flips;
  const reruns = f.control.of > 0 || f.akm.of > 0;
  if (reruns) lines.push(`  tasks whose attempts did not all agree: control ${f.control.tasks} of ${f.control.of}, akm ${f.akm.tasks} of ${f.akm.of} (of the tasks with more than one scored attempt)`);
  lines.push(`  akm called in ${e.called} of ${e.trials} akm trials (${pct(e.rate)})${Object.keys(e.calls).length ? `: ${Object.entries(e.calls).sort().map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}`);
  lines.push(`  the agent read the curated results the plugin wrote for it in ${e.curated_read} of ${e.trials} akm trials`);
  lines.push(split("called", e.called_split), split("not called", e.not_called_split));
  lines.push(used("control", r.control), used("akm", r.akm), per("control", r.control), per("akm", r.akm));
  if (e.control_calls) lines.push(`  WARNING: ${e.control_calls} control trials called akm, so the arms were not what they should be`);
  lines.push("", "  task".padEnd(66) + "control    akm     called akm" + (reruns ? "  flips c/a" : ""));
  for (const t of r.tasks) lines.push(`  ${t.task.padEnd(64)}${t.control.padEnd(11)}${t.akm.padEnd(8)}${reruns ? t.called.padEnd(12) : t.called}${reruns ? `${t.flips.control}/${t.flips.akm}` : ""}`);
  if (r.tasks.some((t) => /T\d*$/.test(t.control) || /T\d*$/.test(t.akm))) lines.push("  T: the agent ran out of time in that many trials of the task (the verifier still ran)");
  if (reruns) lines.push("  flips: the attempts of the task that went against its majority outcome, in the control and in the akm arm");
  return lines;
}

/** The two corpora's reports as columns, never one pooled number. */
export function sideBySide(title: string, a: { corpus: string; report: Report }, b: { corpus: string; report: Report }): string[] {
  const rate = (r: ArmSummary) => (r.pass_rate ? `${r.pass_rate.value.toFixed(3)} [${r.pass_rate.lo.toFixed(3)}, ${r.pass_rate.hi.toFixed(3)}] over ${r.pass_rate.n} tasks` : "n/a");
  const diff = (r: Report) => ci(r.delta, true);
  const sign = (r: Report) => (r.sign_test ? (r.sign_test.n ? `p = ${r.sign_test.p} (akm better on ${r.sign_test.akm}, control on ${r.sign_test.control})` : "no task differs") : "n/a");
  const called = (r: Report) => `${r.engagement.called} of ${r.engagement.trials} akm trials`;
  const late = (r: Report) => `${r.control.timeouts} control trials, ${r.akm.timeouts} akm trials`;
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["control pass rate", rate(a.report.control), rate(b.report.control)],
    ["akm pass rate", rate(a.report.akm), rate(b.report.akm)],
    ["difference", diff(a.report), diff(b.report)],
    ["sign test", sign(a.report), sign(b.report)],
    ["akm called in", called(a.report), called(b.report)],
    ["timed out", late(a.report), late(b.report)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  return [`${title}: ${a.corpus} and ${b.corpus} side by side (not pooled)`, ...rows.map((r) => `  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`)];
}
