// The scorer of the project-intent eval: the trials a run recorded, as each arm's pass rate, the paired difference of every two arms with
// its interval and sign test, tokens per trial and per correct outcome, how often akm was called, and how often an answer took the other
// project's convention. It is pure: no I/O, and nothing that collects (collect.ts reads Harbor's folders). The bootstrap and the sign
// test are lib/harbor/report.ts's, so an interval here means what it means in agent-ab.

import { AGENT_EXIT, type Estimate, type Delta, estimate, pairedEstimate, signTest, timedOut } from "../../../lib/harbor/report.ts";
import type { RunTrial } from "../../../lib/harbor/score.ts";

/** A trial as the run writes it to samples.jsonl: lib/harbor's, with its arm's label and the verifier's `other_project` (1: the answer holds the other project's value; null when the verifier gave none). */
export interface ProjectTrial extends RunTrial {
  project_arm: string;
  other_project: number | null;
}

/** `conflict`: the two projects' notes answer the task differently, and the working directory decides. `general`: the answer is in unscoped notes only. */
export type Kind = "conflict" | "general";

/** The raw output of a task: the arms the job ran, in the order of projects.json, and every trial of the task. */
export interface Raw {
  arms: string[];
  trials: ProjectTrial[];
}

export interface Tally {
  trials: number;
  scored: number;
  passed: number;
  errored: number;
}

/** One task of samples.jsonl. */
export interface Row extends Raw {
  id: string;
  kind: Kind;
  tallies: Record<string, Tally>;
}

const round = (x: number, places = 3): number => Number(x.toFixed(places));
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number => sum(xs) / xs.length;
const scored = (t: ProjectTrial): t is ProjectTrial & { reward: number } => t.reward !== null;
const called = (t: ProjectTrial): boolean => t.akm !== null && Object.keys(t.akm).length > 0;
const used = (t: ProjectTrial): number | null => (t.tokens ? t.tokens.input + t.tokens.output : null);

export function makeRow(c: { id: string; kind: Kind }, raw: Raw): Row {
  const tallies: Record<string, Tally> = {};
  for (const arm of raw.arms) {
    const mine = raw.trials.filter((t) => t.project_arm === arm);
    const ok = mine.filter(scored);
    tallies[arm] = { trials: mine.length, scored: ok.length, passed: ok.filter((t) => t.reward === 1).length, errored: mine.length - ok.length };
  }
  return { id: c.id, kind: c.kind, arms: raw.arms, trials: raw.trials, tallies };
}

/** A task has no verdict when one of its arms has no scored trial: it cannot enter the paired differences. */
export const errored = (row: Row): boolean => row.arms.some((a) => (row.tallies[a]?.scored ?? 0) === 0);

export interface ArmReport {
  trials: number;
  scored: number;
  passed: number;
  errored: number;
  timeouts: number;
  agent_exits: number;
  /** The mean over tasks of each task's pass rate, with a 95% bootstrap interval over tasks; then the same over each kind of task. */
  pass_rate: Estimate | null;
  conflict_pass_rate: Estimate | null;
  general_pass_rate: Estimate | null;
  /** Scored trials of conflict tasks whose answer held the other project's value. */
  other_project: { trials: number; count: number; rate: number | null };
  /** Scored trials whose stream could be read, and those in which the agent called an akm tool or ran akm in its shell. */
  akm_called: { trials: number; called: number; rate: number | null };
  /** Scored trials in which the agent read the results the plugin curated at session start. */
  curated_read: number;
  /** Tokens of every trial that reported them, errored ones too. `per_trial` and `per_correct` count input plus output. */
  tokens: { trials: number; input: number; cache: number; output: number; per_trial: number | null; per_correct: number | null };
}

export interface Comparison {
  /** `a` minus `b`, paired by task. */
  a: string;
  b: string;
  delta: Delta | null;
  better: { a: number; b: number; same: number };
  sign_test: { n: number; p: number } | null;
}

export interface Report {
  arms: string[];
  by_arm: Record<string, ArmReport>;
  comparisons: Comparison[];
  tasks: { task: string; kind: Kind; cells: Record<string, string> }[];
}

const EPSILON = 1e-9;

/** Each task's scored rewards in one arm. */
function rewardsByTask(trials: ProjectTrial[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const t of trials.filter(scored)) out.set(t.task, [...(out.get(t.task) ?? []), t.reward]);
  return out;
}

function armReport(trials: ProjectTrial[], kinds: Map<string, Kind>): ArmReport {
  const ok = trials.filter(scored);
  const byTask = rewardsByTask(trials);
  const rate = (kind?: Kind) => estimate([...byTask].filter(([task]) => kind === undefined || kinds.get(task) === kind).map(([, r]) => mean(r)));
  const conflict = ok.filter((t) => kinds.get(t.task) === "conflict");
  const readable = ok.filter((t) => t.akm !== null);
  const counted = trials.filter((t) => used(t) !== null);
  const total = sum(counted.map((t) => used(t) as number));
  const passed = ok.filter((t) => t.reward === 1).length;
  return {
    trials: trials.length,
    scored: ok.length,
    passed,
    errored: trials.length - ok.length,
    timeouts: trials.filter(timedOut).length,
    agent_exits: trials.filter((t) => t.agent_exit ?? t.error === AGENT_EXIT).length,
    pass_rate: rate(),
    conflict_pass_rate: rate("conflict"),
    general_pass_rate: rate("general"),
    other_project: { trials: conflict.length, count: conflict.filter((t) => t.other_project === 1).length, rate: conflict.length ? round(conflict.filter((t) => t.other_project === 1).length / conflict.length) : null },
    akm_called: { trials: readable.length, called: readable.filter(called).length, rate: readable.length ? round(readable.filter(called).length / readable.length) : null },
    curated_read: ok.filter((t) => t.curated).length,
    tokens: {
      trials: counted.length,
      input: sum(counted.map((t) => t.tokens?.input ?? 0)),
      cache: sum(counted.map((t) => t.tokens?.cache ?? 0)),
      output: sum(counted.map((t) => t.tokens?.output ?? 0)),
      per_trial: counted.length ? Math.round(total / counted.length) : null,
      per_correct: passed ? Math.round(total / passed) : null,
    },
  };
}

function compare(a: string, b: string, trials: ProjectTrial[]): Comparison {
  const ra = rewardsByTask(trials.filter((t) => t.project_arm === a));
  const rb = rewardsByTask(trials.filter((t) => t.project_arm === b));
  const pairs = [...ra].filter(([task]) => rb.has(task)).map(([task, r]) => ({ akm: r, control: rb.get(task) as number[] }));
  const d = pairs.map((p) => mean(p.akm) - mean(p.control));
  const better = { a: d.filter((x) => x > EPSILON).length, b: d.filter((x) => x < -EPSILON).length, same: d.filter((x) => Math.abs(x) <= EPSILON).length };
  return { a, b, delta: pairedEstimate(pairs), better, sign_test: pairs.length ? { n: better.a + better.b, p: Number(signTest(better.a, better.b).toPrecision(3)) } : null };
}

/** The report of a run's rows. The trials are read in the order of their folder names, whatever the order of the rows: the bootstrap draws by position. */
export function buildReport(rows: Row[]): Report {
  const arms = rows[0]?.arms ?? [];
  const kinds = new Map(rows.map((r) => [r.id, r.kind]));
  const trials = rows.flatMap((r) => r.trials).sort((x, y) => x.trial.localeCompare(y.trial));
  const comparisons: Comparison[] = [];
  for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) comparisons.push(compare(arms[j], arms[i], trials));
  return {
    arms,
    by_arm: Object.fromEntries(arms.map((a) => [a, armReport(trials.filter((t) => t.project_arm === a), kinds)])),
    comparisons,
    tasks: [...rows].sort((x, y) => x.id.localeCompare(y.id)).map((r) => ({ task: r.id, kind: r.kind, cells: Object.fromEntries(arms.map((a) => [a, `${r.tallies[a]?.passed ?? 0}/${r.tallies[a]?.scored ?? 0}`])) })),
  };
}

/** The summary fields that come from the rows: the report and its numbers as `metrics`, for scripts/compare and a rescore. */
export function summarize(rows: Row[]) {
  const report = buildReport(rows);
  const metrics = {
    arms: Object.fromEntries(report.arms.map((a) => {
      const r = report.by_arm[a];
      return [a, { pass_rate: r.pass_rate?.value ?? null, conflict_pass_rate: r.conflict_pass_rate?.value ?? null, general_pass_rate: r.general_pass_rate?.value ?? null, passed: r.passed, scored: r.scored, errored: r.errored, other_project_rate: r.other_project.rate, akm_called_rate: r.akm_called.rate, tokens_per_trial: r.tokens.per_trial, tokens_per_correct: r.tokens.per_correct }];
    })),
    comparisons: Object.fromEntries(report.comparisons.map((c) => [`${c.a}-${c.b}`, { value: c.delta?.value ?? null, lo: c.delta?.lo ?? null, hi: c.delta?.hi ?? null, n: c.delta?.n ?? null, sign_p: c.sign_test?.p ?? null }])),
  };
  return { report, metrics, n_errored: sum(report.arms.map((a) => report.by_arm[a].errored)) };
}

const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const ci = (e: Estimate | Delta | null, signed = false): string => (e === null ? "n/a" : `${signed && e.value >= 0 ? "+" : ""}${e.value.toFixed(3)} [${e.lo.toFixed(3)}, ${e.hi.toFixed(3)}] over ${e.n} tasks`);
const n = (x: number | null): string => (x === null ? "n/a" : x.toLocaleString("en-US"));

/** The report as the lines run.ts prints. */
export function formatReport(r: Report): string[] {
  const w = Math.max(8, ...r.arms.map((a) => a.length));
  const lines: string[] = [];
  for (const a of r.arms) {
    const x = r.by_arm[a];
    lines.push(`  ${a.padEnd(w)} ${x.trials} trials, ${x.scored} scored, ${x.errored} errored, ${x.timeouts} timed out, ${x.agent_exits} agent exit non-zero   pass rate ${ci(x.pass_rate)}`);
    lines.push(`  ${"".padEnd(w)} conflict ${ci(x.conflict_pass_rate)}, general ${ci(x.general_pass_rate)}`);
    lines.push(`  ${"".padEnd(w)} other project's value in ${x.other_project.count} of ${x.other_project.trials} conflict trials (${pct(x.other_project.rate)}); akm called in ${x.akm_called.called} of ${x.akm_called.trials} (${pct(x.akm_called.rate)}); curated results read in ${x.curated_read}`);
    lines.push(`  ${"".padEnd(w)} tokens ${n(x.tokens.input)} input (${n(x.tokens.cache)} from cache), ${n(x.tokens.output)} output; per trial ${n(x.tokens.per_trial)}, per correct outcome ${n(x.tokens.per_correct)}`);
  }
  for (const c of r.comparisons) {
    const s = c.sign_test;
    lines.push(`  ${`${c.a} - ${c.b}`.padEnd(2 * w + 3)} ${ci(c.delta, true)}; ${c.a} better on ${c.better.a}, ${c.b} on ${c.better.b}, same on ${c.better.same}${s && s.n ? `; sign test p = ${s.p}` : ""}`);
  }
  lines.push("", `  ${"task".padEnd(22)}${"kind".padEnd(10)}${r.arms.map((a) => a.padEnd(10)).join("")}`);
  for (const t of r.tasks) lines.push(`  ${t.task.padEnd(22)}${t.kind.padEnd(10)}${r.arms.map((a) => (t.cells[a] ?? "").padEnd(10)).join("")}`);
  return lines;
}
