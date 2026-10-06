// The report of the evals that run an agent in Harbor with and without akm (evals/agent-ab, benchmarks/terminal-bench):
// what Harbor wrote for each trial, as pass rates, the paired difference and the engagement split. Their run.ts uses it
// after the run. It reads trial folders and does no I/O besides that.
//
// A trial is one task run once by one arm. The control arm is opencode alone, the akm arm is opencode with the akm
// plugin. A trial is scored when the verifier gave it a reward, and errored when it did not: it never got far enough,
// or the plugin was not shown to be live. Errored trials are left out of the rates and counted. A trial whose agent ran
// out of time is counted apart, as a timeout: Harbor still verifies it, so it is usually scored too.

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
  /** Whether the agent read the curated results the plugin writes at the start of a session. Null for the control, and when the trial left no readable stream. */
  curated?: boolean | null;
  tokens: { input: number; cache: number; output: number } | null;
  costUsd: number | null;
  seconds: number | null;
  /** How long the agent's own run took, apart from the setup. */
  agentSeconds?: number | null;
  /** The digest of the task the trial ran, as Harbor recorded it for a task fetched from a registry. Null for a task in a folder. */
  digest?: string | null;
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
  /** Trials whose agent ran out of time. */
  timeouts: number;
  /** The mean per scored trial, over those that have the figure: minutes in all, minutes of the agent's own run, and dollars. An errored trial stopped in the setup and says nothing of what a run takes. */
  per_trial: { minutes: number | null; agent_minutes: number | null; cost_usd: number | null };
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
  /** Those tasks by who did better: the akm arm passed more of its attempts, the control did, or they passed the same share. */
  better: { akm: number; control: number; same: number };
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
  tasks: { task: string; control: string; akm: string; called: string }[];
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

/** Where the plugin writes what it curated for a session: the agent is told to read it. It is akm's other way in, apart from the tools. */
const CURATED_FILE = /\/akm-opencode\/curated\//;

/** Whether the opencode stream holds a read of the curated results. */
export function readsCurated(stream: string): boolean {
  for (const line of stream.split("\n")) {
    if (!line.startsWith("{") || !line.includes("curated")) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "tool_use" && event.part?.tool === "read" && CURATED_FILE.test(String(event.part?.state?.input?.filePath ?? ""))) return true;
    } catch {
      // a line that is not JSON, such as stderr
    }
  }
  return false;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Seconds from one ISO time to another, or null when either is missing. */
function between(from: unknown, to: unknown): number | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  const seconds = (Date.parse(to) - Date.parse(from)) / 1000;
  return Number.isFinite(seconds) ? round(seconds, 1) : null;
}

/** One trial folder of a Harbor job, or null when it holds no result. The arm is the agent's name, which Harbor keeps in result.json. */
export function readTrial(dir: string, trial: string): Trial | null {
  const file = join(dir, "result.json");
  if (!existsSync(file)) return null;
  const r = JSON.parse(readFileSync(file, "utf8"));
  const agent: unknown = r.agent_info?.name;
  const arm: Arm | null = agent === "akm-opencode" ? "akm" : agent === "opencode" ? "control" : null;
  if (arm === null) throw new Error(`${file} is a trial of agent ${JSON.stringify(agent)}, which is neither opencode nor akm-opencode`);
  const streamFile = join(dir, "agent", "opencode.txt");
  const stream = existsSync(streamFile) ? readFileSync(streamFile, "utf8") : null;
  const calls = stream === null ? null : toolCalls(stream, arm === "akm");
  const usage = r.agent_result;
  const seconds = between(r.started_at, r.finished_at);
  const agentSeconds = between(r.agent_execution?.started_at, r.agent_execution?.finished_at);
  return {
    task: String(r.task_name ?? "").replace(/^[^/]*\//, ""),
    arm,
    trial,
    reward: num(r.verifier_result?.rewards?.reward),
    error: typeof r.exception_info?.exception_type === "string" ? r.exception_info.exception_type : null,
    akm: calls?.akm ?? null,
    tools: calls?.tools ?? null,
    curated: arm === "akm" && stream !== null ? readsCurated(stream) : null,
    tokens: usage && num(usage.n_input_tokens) !== null ? { input: num(usage.n_input_tokens) ?? 0, cache: num(usage.n_cache_tokens) ?? 0, output: num(usage.n_output_tokens) ?? 0 } : null,
    costUsd: num(usage?.cost_usd),
    seconds,
    agentSeconds,
    digest: typeof r.task_id?.ref === "string" ? r.task_id.ref : null,
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

/** The exception Harbor records when the agent runs out of time. */
const TIMEOUT = "AgentTimeoutError";

const scored = (t: Trial): t is Trial & { reward: number } => t.reward !== null;
const timedOut = (t: Trial): boolean => t.error === TIMEOUT;
const called = (t: Trial): boolean => t.akm !== null && Object.keys(t.akm).length > 0;

/** Each task's mean reward over the given scored trials. */
function perTask(trials: Trial[]): Map<string, number> {
  const rewards = new Map<string, number[]>();
  for (const t of trials.filter(scored)) rewards.set(t.task, [...(rewards.get(t.task) ?? []), t.reward]);
  return new Map([...rewards].map(([task, r]) => [task, mean(r)]));
}

/** akm minus control for each task in both maps. */
function differences(akm: Map<string, number>, control: Map<string, number>): number[] {
  return [...akm].filter(([task]) => control.has(task)).map(([task, v]) => v - (control.get(task) as number));
}

/** akm minus control over the tasks in both maps. */
function paired(akm: Map<string, number>, control: Map<string, number>): Estimate | null {
  return estimate(differences(akm, control));
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
  const controlMeans = perTask(control);
  const akmReadable = akm.filter((t) => scored(t) && t.akm !== null);
  const split = (rows: Trial[]): Split => ({ trials: rows.length, passed: rows.filter((t) => t.reward === 1).length, delta: paired(perTask(rows), controlMeans) });
  const calls: Record<string, number> = {};
  for (const t of akmReadable) for (const [tool, n] of Object.entries(t.akm ?? {})) calls[tool] = (calls[tool] ?? 0) + n;
  const nCalled = akmReadable.filter(called).length;

  const names = [...new Set(trials.map((t) => t.task))].sort();
  const cell = (rows: Trial[], keep: (t: Trial) => boolean = () => true) => {
    const ok = rows.filter(scored);
    const late = rows.filter(timedOut).length;
    return `${ok.filter((t) => keep(t) && t.reward === 1).length}/${ok.filter(keep).length}${late ? ` T${late > 1 ? late : ""}` : ""}`;
  };
  return {
    control: summarize(control),
    akm: summarize(akm),
    delta: paired(perTask(akm), controlMeans),
    better: ((d) => ({ akm: d.filter((x) => x > EPSILON).length, control: d.filter((x) => x < -EPSILON).length, same: d.filter((x) => Math.abs(x) <= EPSILON).length }))(differences(perTask(akm), controlMeans)),
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
      return { task, control: cell(control.filter((t) => t.task === task)), akm: cell(a), called: `${a.filter((t) => scored(t) && called(t)).length}/${a.filter((t) => scored(t) && t.akm !== null).length}` };
    }),
  };
}

const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(0)}%`);
const ci = (e: Estimate | null, signed = false): string => (e === null ? "n/a" : `${signed && e.value >= 0 ? "+" : ""}${e.value.toFixed(3)} [${e.lo.toFixed(3)}, ${e.hi.toFixed(3)}] over ${e.n} tasks`);

/** The report as the lines run.ts prints. */
export function formatReport(r: Report): string[] {
  const row = (name: string, a: ArmSummary) => {
    const why = Object.entries(a.exceptions).filter(([k]) => k !== TIMEOUT).map(([k, v]) => `${k} ${v}`).join(", ");
    return `  ${name.padEnd(8)} ${String(a.trials).padStart(3)} trials, ${a.scored} scored, ${a.errored} errored${why ? ` (exceptions: ${why})` : ""}, ${a.timeouts} timed out   pass rate ${ci(a.pass_rate)}`;
  };
  const e = r.engagement;
  const n = (x: number) => x.toLocaleString("en-US");
  const used = (name: string, a: ArmSummary) => `  ${name.padEnd(8)} ${n(a.tokens.input)} input tokens (${n(a.tokens.cache)} from cache), ${n(a.tokens.output)} output${a.tokens.cost_usd === null ? "" : `, ${a.tokens.cost_usd} USD as the model reports it`}`;
  const per = (name: string, a: ArmSummary) => {
    const p = a.per_trial;
    const minutes = (x: number | null) => (x === null ? "n/a" : x.toFixed(1));
    return `  ${name.padEnd(8)} per scored trial: ${minutes(p.minutes)} minutes, ${minutes(p.agent_minutes)} of them the agent's own run${p.cost_usd === null ? "" : `, ${p.cost_usd} USD`}`;
  };
  const split = (name: string, s: Split) => `    ${name.padEnd(11)} ${s.passed}/${s.trials} trials passed, difference from the control ${ci(s.delta, true)}`;
  const b = r.better;
  const lines = [row("control", r.control), row("akm", r.akm), `  difference (akm - control, paired by task)  ${ci(r.delta, true)}`];
  lines.push(`  of those ${b.akm + b.control + b.same} tasks, the akm arm did better on ${b.akm}, the control on ${b.control}, and they did the same on ${b.same}`);
  lines.push(`  akm called in ${e.called} of ${e.trials} akm trials (${pct(e.rate)})${Object.keys(e.calls).length ? `: ${Object.entries(e.calls).sort().map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}`);
  lines.push(`  the agent read the curated results the plugin wrote for it in ${e.curated_read} of ${e.trials} akm trials`);
  lines.push(split("called", e.called_split), split("not called", e.not_called_split));
  lines.push(used("control", r.control), used("akm", r.akm), per("control", r.control), per("akm", r.akm));
  if (e.control_calls) lines.push(`  WARNING: ${e.control_calls} control trials called akm, so the arms were not what they should be`);
  lines.push("", "  task".padEnd(66) + "control    akm     called akm");
  for (const t of r.tasks) lines.push(`  ${t.task.padEnd(64)}${t.control.padEnd(11)}${t.akm.padEnd(8)}${t.called}`);
  if (r.tasks.some((t) => /T\d*$/.test(t.control) || /T\d*$/.test(t.akm))) lines.push("  T: the agent ran out of time in that many trials of the task (the verifier still ran)");
  return lines;
}

/** The two corpora's reports as columns, never one pooled number. */
export function sideBySide(title: string, a: { corpus: string; report: Report }, b: { corpus: string; report: Report }): string[] {
  const rate = (r: ArmSummary) => (r.pass_rate ? `${r.pass_rate.value.toFixed(3)} [${r.pass_rate.lo.toFixed(3)}, ${r.pass_rate.hi.toFixed(3)}] over ${r.pass_rate.n} tasks` : "n/a");
  const diff = (r: Report) => (r.delta ? `${r.delta.value >= 0 ? "+" : ""}${r.delta.value.toFixed(3)} [${r.delta.lo.toFixed(3)}, ${r.delta.hi.toFixed(3)}] over ${r.delta.n} tasks` : "n/a");
  const called = (r: Report) => `${r.engagement.called} of ${r.engagement.trials} akm trials`;
  const late = (r: Report) => `${r.control.timeouts} control trials, ${r.akm.timeouts} akm trials`;
  const rows: [string, string, string][] = [
    ["", a.corpus, b.corpus],
    ["control pass rate", rate(a.report.control), rate(b.report.control)],
    ["akm pass rate", rate(a.report.akm), rate(b.report.akm)],
    ["difference", diff(a.report), diff(b.report)],
    ["akm called in", called(a.report), called(b.report)],
    ["timed out", late(a.report), late(b.report)],
  ];
  const w = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  return [`${title}: public and private side by side (not pooled)`, ...rows.map((r) => `  ${r[0].padEnd(w[0])}  ${r[1].padEnd(w[1])}  ${r[2].padEnd(w[2])}`)];
}
