// Pure helpers for the judge-gate eval: cases, selection, the akm judge config, metrics.
// run.ts uses them to run the eval and generate.ts to make the private cases.

import { engineConfig } from "../../../lib/akm/akm.ts";
import { type Overrides, patchedConfig } from "../../../lib/akm/overrides.ts";

/**
 * What a bad revision does to the asset. `churn`: every fact of the source survives and only the form changed (an intro, headings, a
 * table of contents, backticks, reworded prose). `harmful`: a fact is invented, reversed or dropped. Set by reading the label reason
 * and the diff; good cases have none.
 */
export type Severity = "churn" | "harmful";

export interface Case {
  id: string;
  kind: string;
  set: string;
  label: "good" | "bad";
  labelReason: string;
  /** Only on bad cases. See Severity. */
  severity?: Severity;
  feedback: string;
  source: string;
  candidate: string;
  canary?: string;
}

export type Outcome = "pass" | "review" | "reject" | "error";

export interface Row {
  id: string;
  set: string;
  label: "good" | "bad";
  outcome: Outcome;
  score: number | null;
  criteria: Record<string, number> | null;
  reason: string;
  engine: string | null;
  seconds: number;
  /** The case's severity, on bad rows, so the samples can be split without the cases. */
  severity?: Severity;
  error?: string;
  /** akm was killed at the time limit. The row is errored too: akm was slow, and said nothing. */
  timed_out?: true;
}

export function parseCases(text: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${where}:${i + 1} is not valid JSON`);
    }
    for (const key of ["id", "source", "candidate", "feedback"] as const) {
      if (typeof c[key] !== "string") throw new Error(`${where}:${i + 1} has no string "${key}"`);
    }
    if (c.label !== "good" && c.label !== "bad") throw new Error(`${where}:${i + 1} has label "${c.label}", expected good or bad`);
    if (c.label === "bad" && c.severity !== "churn" && c.severity !== "harmful") throw new Error(`${where}:${i + 1} is a bad case with severity "${c.severity}", expected churn or harmful`);
    if (c.label === "good" && c.severity !== undefined) throw new Error(`${where}:${i + 1} is a good case with a severity: only bad cases have one`);
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases in the same good/bad
 * proportion as the whole set, each kind taken in file order, so a quick run still holds both.
 */
export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const good = cases.filter((c) => c.label === "good");
  const bad = cases.filter((c) => c.label === "bad");
  const goodQuota = Math.min(good.length, Math.round((limit * good.length) / cases.length));
  const badQuota = Math.min(bad.length, limit - goodQuota);
  const picked = new Set([...good.slice(0, goodQuota), ...bad.slice(0, badQuota)]);
  return cases.filter((c) => picked.has(c));
}

/**
 * `akm improve judge` reads the feedback as one string and judges it as negative feedback only when the
 * string starts with `[negative]`. Reflect passes one line per feedback event and asks whether any line is
 * negative. Putting the negative lines first makes the two agree.
 */
export function orderFeedback(feedback: string): string {
  const lines = feedback.split("\n").filter((l) => l.trim() !== "");
  const negative = lines.filter((l) => l.startsWith("[negative]"));
  const rest = lines.filter((l) => !l.startsWith("[negative]"));
  return [...negative, ...rest].join("\n");
}

/** The improve strategy the judge config names, and the one `--strategy` replaces. */
export const STRATEGY = "default";

/**
 * The akm config the judge runs under: one LLM engine, named as reflect's quality gate engine. Requests use temperature 0 and ask for
 * no thinking, as distill and extract do, so that two runs differ by the model and not by the sampling. `strategy` is the improve
 * strategy the config makes the default; akm's judge takes its gate from it.
 */
export function judgeConfig(baseUrl: string, model: string, hasKey: boolean, strategy = STRATEGY): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "judge");
  config.engines.judge.temperature = 0;
  config.engines.judge.enableThinking = false;
  config.defaults.improveStrategy = strategy;
  config.improve = { strategies: { [STRATEGY]: { engine: "judge", processes: { reflect: { qualityGate: { engine: "judge" } } } } } };
  return config;
}

/** The config the eval writes: the judge config with the strategy of the overrides as the default, and the config patch, if any, merged into it after. */
export const configFor = (baseUrl: string, model: string, hasKey: boolean, overrides: Overrides): Record<string, any> => patchedConfig(judgeConfig(baseUrl, model, hasKey, overrides.strategy), overrides);

/** What a case's row carries of the case: its identity, its label and, for a bad case, its severity. */
const identity = (c: Case, seconds: number) => ({ id: c.id, set: c.set, label: c.label, seconds, ...(c.severity ? { severity: c.severity } : {}) });

/**
 * akm's `improve judge` verdict, as printed with --format json.
 *
 * A score of -1 is akm saying the judge gave no verdict, and `reviewNeeded` is akm routing the proposal to a person: it did not
 * pass. That covers a reply akm could not read, even after its one retry, and a judge call that timed out or failed inside akm, and the
 * verdict does not say which in a field, only in its free text. So every such verdict is a review and is counted, whatever its text says:
 * a reworded message cannot move a row out of the counts. Its `score` stays null, which is how the samples tell it from a judged review.
 * A -1 that is not routed to review is akm refusing to judge, such as with no engine configured, and is errored.
 */
export function rowFromVerdict(c: Case, verdict: unknown, seconds: number): Row {
  const v = (verdict ?? {}) as Record<string, unknown>;
  const base = identity(c, seconds);
  if (typeof v.pass !== "boolean" || typeof v.score !== "number") {
    return { ...base, outcome: "error", score: null, criteria: null, reason: "", engine: null, error: "the verdict has no pass and score" };
  }
  const reason = typeof v.reason === "string" ? v.reason : "";
  const criteria = v.criteria && typeof v.criteria === "object" ? (v.criteria as Record<string, number>) : null;
  const engine = typeof v.engine === "string" ? v.engine : null;
  if (v.score === -1) {
    if (v.reviewNeeded) return { ...base, outcome: "review", score: null, criteria, reason, engine };
    return { ...base, outcome: "error", score: null, criteria, reason, engine, error: reason || "no verdict" };
  }
  const outcome: Outcome = v.pass ? "pass" : v.reviewNeeded ? "review" : "reject";
  return { ...base, outcome, score: v.score, criteria, reason, engine };
}

/** Did akm give a verdict on the case? An errored row did not, and neither did a review that akm routed there with a score of -1. */
export const hasVerdict = (r: Row): boolean => r.score !== null;

/** A text with the model endpoint masked: akm's errors name the endpoint it called, and results get shared. */
export function hideEndpoint(text: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base === "" ? text : text.split(base).join("<MODEL_BASE_URL>");
}

/** The row with the endpoint masked in the two texts that can name it, akm's reason and the error. */
export function hideInRow(row: Row, baseUrl: string): Row {
  return { ...row, reason: hideEndpoint(row.reason, baseUrl), ...(row.error === undefined ? {} : { error: hideEndpoint(row.error, baseUrl) }) };
}

/** What akm said when it failed. It prints its error as a JSON object on stderr. */
export function failureMessage(code: number, stderr: string, stdout: string): string {
  const text = stderr.trim();
  try {
    const e = JSON.parse(text) as { error?: unknown; code?: unknown };
    if (typeof e.error === "string") return `akm exited ${code}: ${e.error}${typeof e.code === "string" ? ` (${e.code})` : ""}`.slice(0, 300);
  } catch {
    // not JSON: fall through to the last lines
  }
  return `akm exited ${code}: ${(text || stdout.trim()).split("\n").slice(-3).join(" | ")}`.slice(0, 300);
}

/** Is `version` at least `minimum`? Both are semver. A prerelease is below its release and ordered by its tag. */
export function atLeast(version: string, minimum: string): boolean {
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v);
    if (!m) throw new Error(`not a version: ${v}`);
    return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split(".") ?? [] };
  };
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === 0; // a release is above any of its prereleases
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const [x, y] = [a.pre[i], b.pre[i]];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) > Number(y);
    if (nx !== ny) return ny; // a number is below a word
    return x > y;
  }
  return true;
}

/** A case with no verdict: akm failed, or was killed at the time limit (`timedOut`). */
export function errorRow(c: Case, message: string, seconds: number, timedOut = false): Row {
  return { ...identity(c, seconds), outcome: "error", score: null, criteria: null, reason: "", engine: null, error: message, ...(timedOut ? { timed_out: true as const } : {}) };
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

/** How many cases the judge gave a verdict on, how many of those it passed, and the share. */
export interface Rate {
  n: number;
  passed: number;
  rate: number | null;
}

export interface Metrics {
  good: Rate;
  /** All bad revisions: the churn and the harmful together. Read the two below it as well, since they mean different things. */
  bad: Rate;
  /** The bad revisions that invent, reverse or drop a fact: what a gate must never pass. */
  bad_harmful: Rate;
  /** The bad revisions that change the form and keep every fact: an intro, headings, reworded prose. */
  bad_churn: Rate;
  precision: { value: number | null; passed_good: number; passed: number };
  outcomes: Record<"good" | "bad", Record<Outcome, number>>;
}

/** The numbers the eval reports, over the cases the judge gave a verdict on. */
export function metrics(rows: Row[]): Metrics {
  const outcomes = {
    good: { pass: 0, review: 0, reject: 0, error: 0 },
    bad: { pass: 0, review: 0, reject: 0, error: 0 },
  };
  for (const r of rows) outcomes[r.label][r.outcome]++;
  const scored = (label: "good" | "bad") => outcomes[label].pass + outcomes[label].review + outcomes[label].reject;
  const passedGood = outcomes.good.pass;
  const passedBad = outcomes.bad.pass;
  const ofSeverity = (severity: Severity): Rate => {
    const mine = rows.filter((r) => r.label === "bad" && r.severity === severity && r.outcome !== "error");
    const passed = mine.filter((r) => r.outcome === "pass").length;
    return { n: mine.length, passed, rate: ratio(passed, mine.length) };
  };
  return {
    good: { n: scored("good"), passed: passedGood, rate: ratio(passedGood, scored("good")) },
    bad: { n: scored("bad"), passed: passedBad, rate: ratio(passedBad, scored("bad")) },
    bad_harmful: ofSeverity("harmful"),
    bad_churn: ofSeverity("churn"),
    precision: { value: ratio(passedGood, passedGood + passedBad), passed_good: passedGood, passed: passedGood + passedBad },
    outcomes,
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
