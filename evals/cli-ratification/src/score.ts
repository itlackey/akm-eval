// The scorer of the cli-ratification eval: the trials a run recorded, as each arm's outcome pass and AKM-mediated pass by family, the
// tokens per success, the calls to the first useful operation, help volume and invalid commands, and the paired difference of the arms.
// It is pure: no I/O, and nothing that collects (collect.ts reads Harbor's folders and the trace). The bootstrap and the sign test are
// lib/harbor/report.ts's, so an interval here means what it means in agent-ab. There is deliberately no composite score: a defect
// that hides inside a weighted number is the failure this eval exists to find.

import { AGENT_EXIT, type Delta, type Estimate, estimate, pairedEstimate, signTest, timedOut } from "../../../lib/harbor/report.ts";
import type { RunTrial } from "../../../lib/harbor/score.ts";
import type { Family } from "./cards.ts";
import type { Trace } from "./trace.ts";

export type { Family };
export const FAMILIES: Family[] = ["apply", "persist", "repair", "resume", "regression"];

/** The article's pilot limit on tool actions per trial. It is not enforced; a trial over it is counted. */
export const TOOL_ACTIONS = 40;

/** A trial as the run writes it to samples.jsonl: lib/harbor's, with its arm's label and what the verifier and the trace made of it. */
export interface CliTrial extends RunTrial {
  cli_arm: string;
  family: Family;
  /** The checks of the verifier that failed (verify.mjs: `<n>-<type>:<file>`); empty for a pass, null when it left no checks.json. */
  failed_checks: string[] | null;
  /** Whether the answer came through akm (trace.ts); null when there was no trace or the task cannot be judged. */
  mediated: boolean | null;
  trace: Trace | null;
}

export interface Raw {
  arms: string[];
  trials: CliTrial[];
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
  family: Family;
  tallies: Record<string, Tally>;
}

const round = (x: number, places = 3): number => Number(x.toFixed(places));
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]): number => sum(xs) / xs.length;
const median = (xs: number[]): number | null => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor((xs.length - 1) / 2)] : null);
const scored = (t: CliTrial): t is CliTrial & { reward: number } => t.reward !== null;
const used = (t: CliTrial): number | null => (t.tokens ? t.tokens.input + t.tokens.output : null);

export function makeRow(c: { id: string; family: Family }, raw: Raw): Row {
  const tallies: Record<string, Tally> = {};
  for (const arm of raw.arms) {
    const mine = raw.trials.filter((t) => t.cli_arm === arm);
    const ok = mine.filter(scored);
    tallies[arm] = { trials: mine.length, scored: ok.length, passed: ok.filter((t) => t.reward === 1).length, errored: mine.length - ok.length };
  }
  return { id: c.id, family: c.family, arms: raw.arms, trials: raw.trials, tallies };
}

/** A task has no verdict when one of its arms has no scored trial: it cannot enter the paired differences. */
export const errored = (row: Row): boolean => row.arms.some((a) => (row.tallies[a]?.scored ?? 0) === 0);

export interface FamilyReport {
  scored: number;
  passed: number;
  /** Passed trials whose answer came through akm; those that passed without it (raw file reading); those with no trace. */
  mediated: number;
  unmediated: number;
  unknown: number;
}

export interface ArmReport {
  trials: number;
  scored: number;
  passed: number;
  errored: number;
  timeouts: number;
  agent_exits: number;
  /** The mean over tasks of each task's pass rate, with a 95% bootstrap interval over tasks. */
  pass_rate: Estimate | null;
  by_family: Record<string, FamilyReport>;
  /** Scored trials in which the agent ran akm at all. */
  akm_called: { trials: number; called: number };
  /**
   * Every measured input and output token, failed and errored trials included, divided by the successful outcomes; null when there was no
   * success (undefined, not infinite). Harbor counts cached input in the input total, so the sum includes it; the cached share and the trials with no usage are shown apart.
   */
  tokens: { trials: number; missing: number; input: number; cache: number; output: number; per_success: number | null };
  /** Over scored trials with a trace. */
  calls: {
    traced: number;
    tool_calls: number;
    over_budget: number;
    to_first_useful_median: number | null;
    seconds_to_first_useful_median: number | null;
    no_useful_operation: number;
    help_calls: number;
    help_chars: number;
    doc_reads: number;
    akm_chars: number;
    invalid: number;
    repeated: number;
  };
  /** Trials whose trace shows a reach outside the container (web tools, curl, wget, npm, git clone, akm upgrade, akm import of a URL): each is leakage for triage. */
  leakage: { trials: number; hits: number; by_trial: { task: string; trial: string; hits: string[] }[] };
  /** The trials that failed or errored, for classifying before anything is changed: the checks that failed, or the exception. */
  failures: { task: string; trial: string; error: string | null; failed_checks: string[] | null; mediated: boolean | null }[];
}

export interface Comparison {
  /** `a` minus `b`, paired by task. */
  a: string;
  b: string;
  delta: Delta | null;
  better: { a: number; b: number; same: number };
  sign_test: { n: number; p: number } | null;
  /** `a`'s tokens per success over `b`'s, less one; null when either has no success. The design asks for a review above 0.1. */
  tokens_per_success_change: number | null;
}

export interface Report {
  arms: string[];
  by_arm: Record<string, ArmReport>;
  comparisons: Comparison[];
  tasks: { task: string; family: Family; cells: Record<string, string> }[];
}

const EPSILON = 1e-9;

function rewardsByTask(trials: CliTrial[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const t of trials.filter(scored)) out.set(t.task, [...(out.get(t.task) ?? []), t.reward]);
  return out;
}

function armReport(trials: CliTrial[]): ArmReport {
  const ok = trials.filter(scored);
  const passed = ok.filter((t) => t.reward === 1);
  const counted = trials.filter((t) => used(t) !== null);
  const traced = ok.filter((t) => t.trace !== null);
  const traces = traced.map((t) => t.trace as Trace);
  const useful = traces.filter((t) => t.first_useful_calls !== null);
  const by_family: Record<string, FamilyReport> = {};
  for (const f of FAMILIES) {
    const mine = ok.filter((t) => t.family === f);
    if (mine.length === 0) continue;
    const won = mine.filter((t) => t.reward === 1);
    by_family[f] = { scored: mine.length, passed: won.length, mediated: won.filter((t) => t.mediated === true).length, unmediated: won.filter((t) => t.mediated === false).length, unknown: won.filter((t) => t.mediated === null).length };
  }
  return {
    trials: trials.length,
    scored: ok.length,
    passed: passed.length,
    errored: trials.length - ok.length,
    timeouts: trials.filter(timedOut).length,
    agent_exits: trials.filter((t) => t.agent_exit ?? t.error === AGENT_EXIT).length,
    pass_rate: estimate([...rewardsByTask(trials)].map(([, r]) => mean(r))),
    by_family,
    akm_called: { trials: ok.filter((t) => t.trace !== null).length, called: traced.filter((t) => (t.trace as Trace).akm_calls > 0).length },
    tokens: {
      trials: counted.length,
      missing: trials.length - counted.length,
      input: sum(counted.map((t) => t.tokens?.input ?? 0)),
      cache: sum(counted.map((t) => t.tokens?.cache ?? 0)),
      output: sum(counted.map((t) => t.tokens?.output ?? 0)),
      per_success: passed.length ? Math.round(sum(counted.map((t) => used(t) as number)) / passed.length) : null,
    },
    calls: {
      traced: traces.length,
      tool_calls: sum(traces.map((t) => t.calls)),
      over_budget: traces.filter((t) => t.calls > TOOL_ACTIONS).length,
      to_first_useful_median: median(useful.map((t) => t.first_useful_calls as number)),
      seconds_to_first_useful_median: median(traces.flatMap((t) => (t.first_useful_seconds === null ? [] : [t.first_useful_seconds]))),
      no_useful_operation: traces.length - useful.length,
      help_calls: sum(traces.map((t) => t.help_calls)),
      help_chars: sum(traces.map((t) => t.help_chars)),
      doc_reads: sum(traces.map((t) => t.doc_reads)),
      akm_chars: sum(traces.map((t) => t.akm_chars)),
      invalid: sum(traces.map((t) => t.invalid)),
      repeated: sum(traces.map((t) => t.repeated)),
    },
    leakage: { trials: traces.filter((t) => t.leakage.length).length, hits: sum(traces.map((t) => t.leakage.length)), by_trial: ok.filter((t) => t.trace?.leakage.length).map((t) => ({ task: t.task, trial: t.trial, hits: (t.trace as Trace).leakage })) },
    failures: trials.filter((t) => t.reward !== 1).map((t) => ({ task: t.task, trial: t.trial, error: t.error, failed_checks: t.failed_checks, mediated: t.mediated })),
  };
}

function compare(a: string, b: string, trials: CliTrial[], by: Record<string, ArmReport>): Comparison {
  const ra = rewardsByTask(trials.filter((t) => t.cli_arm === a));
  const rb = rewardsByTask(trials.filter((t) => t.cli_arm === b));
  const pairs = [...ra].filter(([task]) => rb.has(task)).map(([task, r]) => ({ akm: r, control: rb.get(task) as number[] }));
  const d = pairs.map((p) => mean(p.akm) - mean(p.control));
  const better = { a: d.filter((x) => x > EPSILON).length, b: d.filter((x) => x < -EPSILON).length, same: d.filter((x) => Math.abs(x) <= EPSILON).length };
  const [ta, tb] = [by[a].tokens.per_success, by[b].tokens.per_success];
  return { a, b, delta: pairedEstimate(pairs), better, sign_test: pairs.length ? { n: better.a + better.b, p: Number(signTest(better.a, better.b).toPrecision(3)) } : null, tokens_per_success_change: ta !== null && tb !== null ? round(ta / tb - 1) : null };
}

/** The report of a run's rows. The trials are read in the order of their folder names, whatever the order of the rows: the bootstrap draws by position. */
export function buildReport(rows: Row[]): Report {
  const arms = rows[0]?.arms ?? [];
  const trials = rows.flatMap((r) => r.trials).sort((x, y) => x.trial.localeCompare(y.trial));
  const by_arm = Object.fromEntries(arms.map((a) => [a, armReport(trials.filter((t) => t.cli_arm === a))]));
  const comparisons: Comparison[] = [];
  for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) comparisons.push(compare(arms[j], arms[i], trials, by_arm));
  return {
    arms,
    by_arm,
    comparisons,
    tasks: [...rows].sort((x, y) => x.id.localeCompare(y.id)).map((r) => ({ task: r.id, family: r.family, cells: Object.fromEntries(arms.map((a) => [a, `${r.tallies[a]?.passed ?? 0}/${r.tallies[a]?.scored ?? 0}`])) })),
  };
}

/** The summary fields that come from the rows: the report, and its numbers as `metrics` for scripts/compare and a rescore. */
export function summarize(rows: Row[]) {
  const report = buildReport(rows);
  const metrics = {
    arms: Object.fromEntries(report.arms.map((a) => {
      const r = report.by_arm[a];
      return [a, {
        pass_rate: r.pass_rate?.value ?? null, passed: r.passed, scored: r.scored, errored: r.errored,
        mediated_pass: sum(Object.values(r.by_family).map((f) => f.mediated)),
        unmediated_pass: sum(Object.values(r.by_family).map((f) => f.unmediated)),
        tokens_per_success: r.tokens.per_success,
        calls_to_first_useful_median: r.calls.to_first_useful_median,
        help_calls: r.calls.help_calls, invalid_commands: r.calls.invalid,
        by_family: Object.fromEntries(Object.entries(r.by_family).map(([f, x]) => [f, { passed: x.passed, scored: x.scored, mediated: x.mediated }])),
      }];
    })),
    comparisons: Object.fromEntries(report.comparisons.map((c) => [`${c.a}-${c.b}`, { value: c.delta?.value ?? null, lo: c.delta?.lo ?? null, hi: c.delta?.hi ?? null, n: c.delta?.n ?? null, sign_p: c.sign_test?.p ?? null, tokens_per_success_change: c.tokens_per_success_change }])),
  };
  return { report, metrics, n_errored: sum(report.arms.map((a) => report.by_arm[a].errored)) };
}

const n = (x: number | null): string => (x === null ? "n/a" : x.toLocaleString("en-US"));
const ci = (e: Estimate | Delta | null, signed = false): string => (e === null ? "n/a" : `${signed && e.value >= 0 ? "+" : ""}${e.value.toFixed(3)} [${e.lo.toFixed(3)}, ${e.hi.toFixed(3)}] over ${e.n} tasks`);

/** The report as the lines run.ts prints. */
export function formatReport(r: Report): string[] {
  const w = Math.max(9, ...r.arms.map((a) => a.length));
  const lines: string[] = [];
  for (const a of r.arms) {
    const x = r.by_arm[a];
    lines.push(`  ${a.padEnd(w)} ${x.trials} trials, ${x.scored} scored, ${x.errored} errored, ${x.timeouts} timed out   outcome pass ${x.passed}/${x.scored}`);
    for (const [f, y] of Object.entries(x.by_family)) lines.push(`  ${"".padEnd(w)} ${f.padEnd(11)} pass ${y.passed}/${y.scored}, through akm ${y.mediated} (read from the agent-writable stream), without ${y.unmediated}, no trace ${y.unknown}`);
    lines.push(`  ${"".padEnd(w)} tokens ${n(x.tokens.input)} input (of which ${n(x.tokens.cache)} cached), ${n(x.tokens.output)} output, ${x.tokens.missing} trials without usage; per success ${n(x.tokens.per_success)}`);
    const c = x.calls;
    lines.push(`  ${"".padEnd(w)} calls to first useful operation: median ${n(c.to_first_useful_median)} (${c.no_useful_operation} of ${c.traced} had none); help ${c.help_calls} calls / ${n(c.help_chars)} chars, shipped files read ${c.doc_reads}; invalid ${c.invalid}, repeated ${c.repeated}; leakage hits ${x.leakage.hits} in ${x.leakage.trials} trials; akm printed ${n(c.akm_chars)} chars; ${c.over_budget} trials over ${TOOL_ACTIONS} tool calls`);
  }
  // Fourteen single attempts: the printed report gives the counts and the token change, not an interval or a p-value (summary.json keeps them).
  for (const c of r.comparisons) {
    lines.push(`  ${`${c.a} - ${c.b}`.padEnd(2 * w + 3)} ${c.a} better on ${c.better.a} cards, ${c.b} on ${c.better.b}, same on ${c.better.same}${c.tokens_per_success_change === null ? "" : `; tokens per success ${c.tokens_per_success_change >= 0 ? "+" : ""}${(c.tokens_per_success_change * 100).toFixed(0)}%${c.tokens_per_success_change > 0.1 ? " (above the 10% review line)" : ""}`}`);
  }
  lines.push("", `  ${"task".padEnd(30)}${"family".padEnd(12)}${r.arms.map((a) => a.padEnd(w + 1)).join("")}`);
  for (const t of r.tasks) lines.push(`  ${t.task.padEnd(30)}${t.family.padEnd(12)}${r.arms.map((a) => (t.cells[a] ?? "").padEnd(w + 1)).join("")}`);
  return lines;
}
