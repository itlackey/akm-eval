// The agent-ab report: what Harbor wrote for each trial, as pass rates, the paired difference and the engagement split.
// run.ts uses it after the run. It reads trial folders and does no I/O besides that.
//
// A trial is one task run once by one arm. The control arm is opencode alone, the akm arm is opencode with the akm
// plugin. A trial is scored when the verifier gave it a reward, and errored when it did not: it never got far enough,
// or the plugin was not shown to be live. Errored trials are left out of the rates and counted.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
  tokens: { input: number; cache: number; output: number } | null;
  costUsd: number | null;
  seconds: number | null;
}

export interface Estimate {
  value: number;
  lo: number;
  hi: number;
  /** How many tasks the estimate averages over. */
  n: number;
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
  tokens: { input: number; cache: number; output: number; cost_usd: number | null };
}

export interface Split {
  trials: number;
  passed: number;
  /** Treatment minus control on the tasks this split has trials for, paired by task. */
  delta: Estimate | null;
}

export interface Report {
  control: ArmSummary;
  akm: ArmSummary;
  /** akm minus control, over the tasks both arms have a scored trial for. */
  delta: Estimate | null;
  engagement: {
    /** Scored akm trials whose stream could be read. */
    trials: number;
    called: number;
    rate: number | null;
    calls: Record<string, number>;
    /** akm trials that called an akm tool, and the same trials that did not. */
    called_split: Split;
    not_called_split: Split;
    /** Control trials that called an akm tool. It should be 0: the control has no plugin. */
    control_calls: number;
  };
  tasks: { task: string; control: string; akm: string; called: string }[];
}

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
  means.sort((a, b) => a - b);
  const at = (q: number) => means[Math.min(RESAMPLES - 1, Math.max(0, Math.floor(q * RESAMPLES)))];
  return { value: round(mean(values)), lo: round(at(ALPHA / 2)), hi: round(at(1 - ALPHA / 2)), n: values.length };
}

/** A shell command that runs akm: `akm` is the command, at the start or after `;`, `&&`, `||`, `|`, `(` or a new line. */
const RUNS_AKM = /(^|[;&|(\n])\s*akm(\s|$)/;

/**
 * The akm calls in an `opencode run --format=json` stream: the plugin's tools, which are named akm_*, and with
 * `shell` the commands that run akm in the shell, which the arm with akm installed can do too. A line that is not JSON,
 * such as stderr, is skipped.
 */
export function toolCalls(stream: string, shell = false): { akm: Record<string, number>; tools: number } {
  const akm: Record<string, number> = {};
  let tools = 0;
  for (const line of stream.split("\n")) {
    if (!line.startsWith("{")) continue;
    let event: { type?: string; part?: { tool?: unknown; state?: { input?: { command?: unknown } } } };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const tool = event.type === "tool_use" ? event.part?.tool : undefined;
    if (typeof tool !== "string") continue;
    tools++;
    const command = event.part?.state?.input?.command;
    const name = tool.startsWith("akm_") ? tool : shell && tool === "bash" && typeof command === "string" && RUNS_AKM.test(command) ? "akm (shell)" : undefined;
    if (name) akm[name] = (akm[name] ?? 0) + 1;
  }
  return { akm, tools };
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** One trial folder of a Harbor job, or null when it holds no result. The arm is the agent's name, which Harbor keeps in result.json. */
export function readTrial(dir: string, trial: string): Trial | null {
  const file = join(dir, "result.json");
  if (!existsSync(file)) return null;
  const r = JSON.parse(readFileSync(file, "utf8"));
  const agent: unknown = r.agent_info?.name;
  const arm: Arm | null = agent === "akm-opencode" ? "akm" : agent === "opencode" ? "control" : null;
  if (arm === null) throw new Error(`${file} is a trial of agent ${JSON.stringify(agent)}, which is neither opencode nor akm-opencode`);
  const stream = join(dir, "agent", "opencode.txt");
  const calls = existsSync(stream) ? toolCalls(readFileSync(stream, "utf8"), arm === "akm") : null;
  const usage = r.agent_result;
  const seconds = r.started_at && r.finished_at ? (Date.parse(r.finished_at) - Date.parse(r.started_at)) / 1000 : null;
  return {
    task: String(r.task_name ?? "").replace(/^[^/]*\//, ""),
    arm,
    trial,
    reward: num(r.verifier_result?.rewards?.reward),
    error: typeof r.exception_info?.exception_type === "string" ? r.exception_info.exception_type : null,
    akm: calls?.akm ?? null,
    tools: calls?.tools ?? null,
    tokens: usage && num(usage.n_input_tokens) !== null ? { input: num(usage.n_input_tokens) ?? 0, cache: num(usage.n_cache_tokens) ?? 0, output: num(usage.n_output_tokens) ?? 0 } : null,
    costUsd: num(usage?.cost_usd),
    seconds: seconds !== null && Number.isFinite(seconds) ? round(seconds, 1) : null,
  };
}

/** Every trial of a Harbor job folder, in folder order. */
export function loadTrials(jobDir: string): Trial[] {
  const trials: Trial[] = [];
  for (const entry of readdirSync(jobDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const t = readTrial(join(jobDir, entry.name), entry.name);
    if (t) trials.push(t);
  }
  return trials;
}

const scored = (t: Trial): t is Trial & { reward: number } => t.reward !== null;
const called = (t: Trial): boolean => t.akm !== null && Object.keys(t.akm).length > 0;

/** Each task's mean reward over the given scored trials. */
function perTask(trials: Trial[]): Map<string, number> {
  const rewards = new Map<string, number[]>();
  for (const t of trials.filter(scored)) rewards.set(t.task, [...(rewards.get(t.task) ?? []), t.reward]);
  return new Map([...rewards].map(([task, r]) => [task, mean(r)]));
}

/** akm minus control over the tasks in both maps. */
function paired(akm: Map<string, number>, control: Map<string, number>): Estimate | null {
  return estimate([...akm].filter(([task]) => control.has(task)).map(([task, v]) => v - (control.get(task) as number)));
}

function summarize(trials: Trial[]): ArmSummary {
  const ok = trials.filter(scored);
  const exceptions: Record<string, number> = {};
  for (const t of trials) if (t.error) exceptions[t.error] = (exceptions[t.error] ?? 0) + 1;
  const withTokens = trials.filter((t) => t.tokens);
  const costs = trials.map((t) => t.costUsd).filter((c): c is number => c !== null);
  return {
    trials: trials.length,
    scored: ok.length,
    errored: trials.length - ok.length,
    passed: ok.filter((t) => t.reward === 1).length,
    tasks: new Set(ok.map((t) => t.task)).size,
    pass_rate: estimate([...perTask(trials).values()]),
    exceptions,
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
  const controlMeans = perTask(control);
  const akmReadable = akm.filter((t) => scored(t) && t.akm !== null);
  const split = (rows: Trial[]): Split => ({ trials: rows.length, passed: rows.filter((t) => t.reward === 1).length, delta: paired(perTask(rows), controlMeans) });
  const calls: Record<string, number> = {};
  for (const t of akmReadable) for (const [tool, n] of Object.entries(t.akm ?? {})) calls[tool] = (calls[tool] ?? 0) + n;
  const nCalled = akmReadable.filter(called).length;

  const names = [...new Set(trials.map((t) => t.task))].sort();
  const cell = (rows: Trial[], keep: (t: Trial) => boolean = () => true) => {
    const ok = rows.filter(scored);
    return `${ok.filter((t) => keep(t) && t.reward === 1).length}/${ok.filter(keep).length}`;
  };
  return {
    control: summarize(control),
    akm: summarize(akm),
    delta: paired(perTask(akm), controlMeans),
    engagement: {
      trials: akmReadable.length,
      called: nCalled,
      rate: akmReadable.length ? round(nCalled / akmReadable.length) : null,
      calls,
      called_split: split(akmReadable.filter(called)),
      not_called_split: split(akmReadable.filter((t) => !called(t))),
      control_calls: control.filter(called).length,
    },
    tasks: names.map((task) => {
      const a = akm.filter((t) => t.task === task);
      return { task, control: cell(control.filter((t) => t.task === task)), akm: cell(a), called: `${a.filter((t) => scored(t) && called(t)).length}/${a.filter((t) => scored(t) && t.akm !== null).length}` };
    }),
  };
}

const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const ci = (e: Estimate | null, signed = false): string => (e === null ? "n/a" : `${signed && e.value >= 0 ? "+" : ""}${e.value.toFixed(3)} [${e.lo.toFixed(3)}, ${e.hi.toFixed(3)}] over ${e.n} tasks`);

/** The report as the lines run.ts prints. */
export function formatReport(r: Report): string[] {
  const row = (name: string, a: ArmSummary) => {
    const why = Object.entries(a.exceptions).map(([k, v]) => `${k} ${v}`).join(", ");
    return `  ${name.padEnd(8)} ${String(a.trials).padStart(3)} trials, ${a.scored} scored, ${a.errored} errored${why ? ` (exceptions: ${why})` : ""}   pass rate ${ci(a.pass_rate)}`;
  };
  const e = r.engagement;
  const split = (name: string, s: Split) => `    ${name.padEnd(11)} ${s.passed}/${s.trials} trials passed, difference from the control ${ci(s.delta, true)}`;
  const lines = [row("control", r.control), row("akm", r.akm), `  difference (akm - control, paired by task)  ${ci(r.delta, true)}`];
  lines.push(`  akm called in ${e.called} of ${e.trials} akm trials (${pct(e.rate)})${Object.keys(e.calls).length ? `: ${Object.entries(e.calls).sort().map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}`);
  lines.push(split("called", e.called_split), split("not called", e.not_called_split));
  if (e.control_calls) lines.push(`  WARNING: ${e.control_calls} control trials called akm, so the arms were not what they should be`);
  lines.push("", "  task".padEnd(66) + "control    akm     called akm");
  for (const t of r.tasks) lines.push(`  ${t.task.padEnd(64)}${t.control.padEnd(11)}${t.akm.padEnd(8)}${t.called}`);
  return lines;
}
