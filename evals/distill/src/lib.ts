// Pure helpers for the distill eval: the cases, the checks that score a lesson, the akm config, the rows and the
// metrics. run.ts uses them to run the eval and generate.ts to make the private cases.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { engineConfig } from "../../../lib/akm/akm.ts";

// The checks read a lesson's frontmatter with bun's own YAML parser. Without it every lesson would be scored on its body alone.
if (typeof Bun.YAML?.parse !== "function") throw new Error("distill: this eval needs a bun that has Bun.YAML. Upgrade it with `bun upgrade`. See https://bun.sh");

export const CLASSES = ["lesson-worthy", "over-claim", "dated-status", "restates-asset", "duplicate-lesson"] as const;
export type Class = (typeof CLASSES)[number];
export type Expect = "lesson" | "none";

/** The strategy that runs distill and nothing else. */
export const STRATEGY = "distill-only";
/** A lesson longer than this many times its memory, in words, is too long. */
export const MAX_RATIO = 1.5;

export interface Case {
  id: string;
  class: Class;
  expect: Expect;
  /** What a lesson must state: facts, each a list of phrases, any one of which states it. Lesson cases only. */
  required: string[][];
  /** What a lesson must not claim: groups of phrases, any one of which makes the claim. Lesson cases only. */
  forbidden: string[][];
  /** A lesson that passes, and one that over-claims. They keep the phrases honest. Lesson cases only. */
  good?: string;
  bad?: string;
  /** What a correct result is, in a sentence. */
  note: string;
  /** Feedback recorded about the memory before distill runs (`akm feedback`), in order. Optional: the public cases have none. */
  feedback?: { signal: "positive" | "negative"; reason?: string }[];
}

export interface LoadedCase extends Case {
  /** The case's bundle folder: the memory and the assets that go with it. */
  dir: string;
  /** The memory's name, so its ref is memories/<name>. */
  name: string;
  /** The memory file as written. */
  memory: string;
}

const expectOf = (klass: Class): Expect => (klass === "lesson-worthy" || klass === "over-claim" ? "lesson" : "none");

/** The cases in `assets/cases.json`, each with its memory read from `assets/bundles/<id>/memories/`. */
export function loadCases(assets: string): LoadedCase[] {
  const file = join(assets, "cases.json");
  let rows: unknown;
  try {
    rows = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${file} has no cases`);
  const seen = new Set<string>();
  return rows.map((row: Case, i) => {
    const at = `${file}: case ${i + 1}${typeof row?.id === "string" ? ` (${row.id})` : ""}`;
    if (typeof row?.id !== "string" || !/^[a-z0-9-]+$/.test(row.id)) throw new Error(`${at} needs an id of lower case letters, digits and dashes`);
    if (seen.has(row.id)) throw new Error(`${at} repeats an id`);
    seen.add(row.id);
    if (!CLASSES.includes(row.class)) throw new Error(`${at} has class "${row.class}", expected one of ${CLASSES.join(", ")}`);
    if (row.expect !== expectOf(row.class)) throw new Error(`${at} is ${row.class}, so it expects ${expectOf(row.class)}, not "${row.expect}"`);
    if (typeof row.note !== "string" || !row.note.trim()) throw new Error(`${at} has no note`);
    const groups = (key: "required" | "forbidden") => {
      const value = row[key] ?? [];
      const ok = Array.isArray(value) && value.every((g) => Array.isArray(g) && g.length > 0 && g.every((p) => typeof p === "string" && /[a-z0-9]/i.test(p)));
      if (!ok) throw new Error(`${at} needs ${key} as a list of lists of phrases, each with a letter or a digit`);
      return value;
    };
    const required = groups("required");
    const forbidden = groups("forbidden");
    if (row.expect === "lesson") {
      if (required.length === 0 || forbidden.length === 0) throw new Error(`${at} expects a lesson, so it needs required and forbidden`);
      for (const key of ["good", "bad"] as const) if (typeof row[key] !== "string" || !row[key]?.trim()) throw new Error(`${at} needs a "${key}" example lesson`);
    } else if (required.length > 0 || forbidden.length > 0) {
      throw new Error(`${at} expects no lesson, so it has no required or forbidden`);
    }
    const dir = join(assets, "bundles", row.id);
    const memories = existsSync(join(dir, "memories")) ? readdirSync(join(dir, "memories")).filter((f) => f.endsWith(".md")) : [];
    if (memories.length !== 1) throw new Error(`${at} needs exactly one memory in ${join(dir, "memories")}, found ${memories.length}`);
    const name = memories[0].slice(0, -".md".length);
    return { ...row, required, forbidden, dir, name, memory: readFileSync(join(dir, "memories", memories[0]), "utf8") };
  });
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases taken from each class in turn, in file
 * order, so a short run covers as many classes as it can.
 */
export function selectCases(cases: LoadedCase[], limit?: number): LoadedCase[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const queues = CLASSES.map((k) => cases.filter((c) => c.class === k)).filter((q) => q.length > 0);
  const picked = new Set<LoadedCase>();
  for (let round = 0; picked.size < limit; round++) {
    for (const queue of queues) if (picked.size < limit && round < queue.length) picked.add(queue[round]);
  }
  return cases.filter((c) => picked.has(c));
}

// ---- Matching phrases ------------------------------------------------------------------------------------------

/**
 * Lower case words and numbers, one space between them. Punctuation goes, and so does the border between a
 * number and a letter, so "200MB" and "200 mb" are the same.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A phrase as a pattern over normalized text. Each word matches the start of a word ("retr" matches "retry" and
 * "retries"), each number matches that number only, and `*` stands for up to three words.
 */
function pattern(phrase: string): RegExp {
  const segments = phrase.split("*").map((s) => normalize(s).split(" ").filter(Boolean)).filter((s) => s.length > 0);
  if (segments.length === 0) return /(?!)/;
  const word = (w: string) => (/^\d+$/.test(w) ? `${w}(?![a-z0-9])` : `${w}[a-z0-9]*`);
  return new RegExp(`(?<![a-z0-9])${segments.map((s) => s.map(word).join(" ")).join(" (?:[a-z0-9]+ ){0,3}")}`);
}

/** Does `text` hold the phrase? */
export const mentions = (text: string, phrase: string): boolean => pattern(phrase).test(normalize(text));

/** Words that say a sentence does not assert what it holds: it denies it, doubts it or asks about it. */
const NOT_ASSERTED = /(?<![a-z0-9])(?:not|no|nor|isnt|arent|wasnt|werent|doesnt|dont|didnt|cant|cannot|wont|wouldnt|shouldnt|couldnt|hasnt|havent|unconfirmed|unverified|untested|unknown|unclear|unproven|whether|if|might|may|could|possibly|possible|perhaps|maybe|guess|suspect|suspected|unlikely)(?![a-z0-9])/;

/** How many words around a phrase are read for a denial or a doubt: before it, and after it. */
const WORDS_BEFORE = 6;
const WORDS_AFTER = 3;

/**
 * The phrases of `groups` that `text` asserts: one that a sentence holds, with no denial or doubt just before or after
 * it. A phrase in "it is unconfirmed whether 0.125 is enough" is not a claim. The first phrase of each group that is
 * asserted.
 */
export function claims(text: string, groups: string[][]): string[] {
  const sentences = text.split(/[.!?;]+(?=\s|$)|\n+/).map(normalize).filter(Boolean);
  const around = (s: string, from: number, to: number): string => {
    const before = s.slice(0, from).split(" ").filter(Boolean).slice(-WORDS_BEFORE);
    const after = s.slice(to).split(" ").filter(Boolean).slice(0, WORDS_AFTER);
    return [...before, ...after].join(" ");
  };
  const found: string[] = [];
  for (const group of groups) {
    const hit = group.find((phrase) => {
      const re = pattern(phrase);
      return sentences.some((s) => {
        const m = re.exec(s);
        return m !== null && !NOT_ASSERTED.test(around(s, m.index, m.index + m[0].length));
      });
    });
    if (hit !== undefined) found.push(hit);
  }
  return found;
}

// ---- Scoring a lesson ------------------------------------------------------------------------------------------

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** The text of a lesson file: its description, its when_to_use and its body, without the keys akm adds. */
export function lessonText(content: string): string {
  const m = FRONTMATTER.exec(content);
  if (!m) return content.trim();
  let front: Record<string, unknown> = {};
  try {
    front = (Bun.YAML.parse(m[1]) as Record<string, unknown> | null) ?? {};
  } catch {
    // Unreadable frontmatter: the body alone is scored.
  }
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return [text(front.description), text(front.when_to_use), m[2].trim()].filter(Boolean).join("\n");
}

/** The body of a memory file, without its frontmatter. */
export const memoryBody = (memory: string): string => (FRONTMATTER.exec(memory)?.[2] ?? memory).trim();

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

export interface Check {
  /** The first phrase of each required fact the lesson does not state. */
  missing: string[];
  /** The forbidden phrases it asserts, one per group at most. */
  forbidden: string[];
  /** The lesson's words over the memory's. */
  ratio: number;
  good: boolean;
}

/** Score a lesson against a case: every required fact, no forbidden claim, and not much longer than its memory. */
export function checkLesson(c: Pick<Case, "required" | "forbidden">, lesson: string, memory: string): Check {
  const missing = c.required.filter((fact) => !fact.some((p) => mentions(lesson, p))).map((fact) => fact[0]);
  const forbidden = claims(lesson, c.forbidden);
  const ratio = Number((words(lesson) / Math.max(1, words(memoryBody(memory)))).toFixed(2));
  return { missing, forbidden, ratio, good: missing.length === 0 && forbidden.length === 0 && ratio <= MAX_RATIO };
}

// ---- The akm config --------------------------------------------------------------------------------------------

/** One LLM engine, the model under test, and a strategy that runs distill alone. Requests use temperature 0 and ask for no thinking. */
export function distillConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey);
  config.engines.model.temperature = 0;
  config.engines.model.enableThinking = false;
  config.defaults.improveStrategy = STRATEGY;
  const off = { enabled: false };
  config.improve = {
    strategies: {
      [STRATEGY]: {
        engine: "model",
        processes: { reflect: off, distill: { enabled: true, allowedTypes: ["memory"] }, consolidate: off, memoryInference: off, extract: off, validation: off, triage: off, proactiveMaintenance: off },
        sync: off,
      },
    },
  };
  return config;
}

/** The ref of a memory in a case, which `akm improve` takes as its scope. */
export const memoryRef = (c: Pick<LoadedCase, "name">): string => `memories/${c.name}`;

/** The file distill writes a memory's lesson to, in the bundle. A lesson already there makes distill skip the memory. */
export const lessonFile = (c: Pick<LoadedCase, "name">): string => {
  const clean = `memory-${c.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `lessons/${clean}-lesson.md`;
};

// ---- What akm did ----------------------------------------------------------------------------------------------

/**
 * What distill did: it proposed a lesson, skipped the memory, had the lesson rejected by its judge, made a lesson
 * that is not valid or that akm could not queue, or failed.
 */
export type Outcome = "lesson" | "skipped" | "rejected" | "invalid" | "error";
export type Verdict = "good" | "bad" | "missed" | "right" | "wrong" | "error";

export interface Proposal {
  ref: string;
  /** The queue's state: pending, accepted, rejected or reverted. */
  status: string;
  /** The gate's decision, such as deferred/distill-review: a person reviews it. */
  gate: string | null;
  scores: Record<string, number> | null;
  /** The judge's reason, when the gate kept one. */
  reason: string | null;
  content: string;
}

/** A proposal's ref without its bundle: `bundle//lessons/x` is `lessons/x`. */
const conceptId = (ref: string): string => (ref.includes("//") ? ref.slice(ref.indexOf("//") + 2) : ref);

/** The lesson proposals distill queued, from the lists `akm proposal list --detail full` printed for each state. */
export function lessonProposals(listed: { status: string; proposals?: unknown[] }[]): Proposal[] {
  const found: Proposal[] = [];
  for (const { status, proposals } of listed) {
    for (const p of (proposals ?? []) as Record<string, any>[]) {
      if (p?.source !== "distill" || typeof p.ref !== "string" || !conceptId(p.ref).startsWith("lessons/")) continue;
      const gate = p.gateDecision ? `${p.gateDecision.outcome}/${p.gateDecision.reason}` : null;
      const reason = typeof p.gateDecision?.judgeReason === "string" ? p.gateDecision.judgeReason : null;
      found.push({ ref: p.ref, status, gate, scores: p.gateDecision?.scores ?? null, reason, content: typeof p.payload?.content === "string" ? p.payload.content : "" });
    }
  }
  return found;
}

/** The action `akm improve` reports for the memory's distill: the run's own, or the error that stopped it. */
function distillAction(improve: unknown): { mode?: string; result?: Record<string, unknown> } | undefined {
  const actions = ((improve ?? {}) as { actions?: { mode?: string; result?: Record<string, unknown> }[] }).actions ?? [];
  return actions.find((a) => a.mode === "distill" || a.mode === "distill-skipped" || a.mode === "error");
}

/**
 * What `akm improve` said distill did with the memory, when it queued no lesson. A skip, a judge's rejection and
 * a lesson that is not valid are results of the model's work. A failed call, or no distill at all, is an error.
 */
export function distillOutcome(improve: unknown): { outcome: Outcome; detail: string } {
  const action = distillAction(improve);
  const result = action?.result ?? {};
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  if (action?.mode === "distill") {
    switch (result.outcome) {
      case "skipped":
        return { outcome: "skipped", detail: text(result.skipReason) || text(result.message) };
      case "quality_rejected":
        return { outcome: "rejected", detail: text(result.reason) };
      case "validation_failed":
        return { outcome: "invalid", detail: text(result.error) };
      case "review_needed":
        // akm sends the lesson to review and then queues it. When the proposal is refused, as for a lesson with an
        // invalid description, it reports review_needed all the same, and the queue holds nothing.
        return { outcome: "invalid", detail: text(result.reason) || "akm could not queue the lesson for review" };
      case "queued":
        return { outcome: "error", detail: "akm said it queued a lesson, and the queue holds none" };
      default:
        return { outcome: "error", detail: text(result.message) || `distill ended ${text(result.outcome)}` };
    }
  }
  if (action?.mode === "distill-skipped") return { outcome: "error", detail: `distill did not run: ${text(result.reason)}` };
  return { outcome: "error", detail: text(result.error) || "akm did not run distill on the memory" };
}

export interface Row {
  id: string;
  class: Class;
  expect: Expect;
  verdict: Verdict;
  outcome: Outcome;
  /** The skip reason, the judge's reason, or the error. */
  detail: string;
  /** The lesson as proposed: its description, when_to_use and body. */
  lesson: string | null;
  status: string | null;
  gate: string | null;
  /** The judge's criterion scores: from the queued lesson's gate decision, or from akm's result when the judge rejected the lesson or sent it to review. */
  scores: Record<string, number> | null;
  /** The lesson text the judge rejected or sent to review, as akm's result reports it (cut to 2000 characters), null when akm queued the lesson or its build does not report it. */
  rejected_lesson: string | null;
  missing: string[];
  forbidden: string[];
  ratio: number | null;
  /** The model names the endpoint reported for the case's calls, from akm's usage report. A gateway may serve one name with another model. */
  served: string[];
  seconds: number;
  error?: string;
}

/** What one case's akm run left behind. */
export interface CaseRun {
  improve: unknown;
  proposals: Proposal[];
  seconds: number;
}

export function errorRow(c: Case, message: string, seconds: number): Row {
  return { id: c.id, class: c.class, expect: c.expect, verdict: "error", outcome: "error", detail: message, lesson: null, status: null, gate: null, scores: null, rejected_lesson: null, missing: [], forbidden: [], ratio: null, served: [], seconds, error: message };
}

/** The model names the endpoint reported for the calls in `akm improve`'s result. */
export function servedModels(improve: unknown): string[] {
  const rows = ((improve ?? {}) as { usageReport?: { byProcessEngineModel?: { model?: unknown }[] } }).usageReport?.byProcessEngineModel ?? [];
  return [...new Set(rows.map((r) => r.model).filter((m): m is string => typeof m === "string" && m !== ""))].sort();
}

/**
 * The judge's criterion scores as akm's distill result reports them. Only a lesson the judge rejected or sent to review has them there. A
 * rejected lesson is queued nowhere, so its text comes from `rejectedContent` in the same result (see rejectedLesson).
 */
function judgeScores(improve: unknown): Record<string, number> | null {
  const result = distillAction(improve)?.result;
  const judged = result?.outcome === "quality_rejected" || result?.outcome === "review_needed";
  const criteria = result?.criteria;
  return judged && criteria && typeof criteria === "object" ? (criteria as Record<string, number>) : null;
}

/** The lesson text the judge turned away, from akm's distill result. Present on a rejection or a review, when this akm build reports it. */
function rejectedLesson(improve: unknown): string | null {
  const result = distillAction(improve)?.result;
  const judged = result?.outcome === "quality_rejected" || result?.outcome === "review_needed";
  return judged && typeof result?.rejectedContent === "string" ? result.rejectedContent : null;
}

/** Score a case from what akm did. The queue decides whether a lesson was proposed. */
export function scoreCase(c: LoadedCase, run: CaseRun): Row {
  const base = { id: c.id, class: c.class, expect: c.expect, seconds: run.seconds, served: servedModels(run.improve), lesson: null, status: null, gate: null, scores: null, rejected_lesson: null, missing: [], forbidden: [], ratio: null };
  const proposal = run.proposals[0];
  if (proposal) {
    const lesson = lessonText(proposal.content);
    const check = checkLesson(c, lesson, c.memory);
    const verdict: Verdict = c.expect === "none" ? "wrong" : check.good ? "good" : "bad";
    const ours = c.expect === "lesson" ? { missing: check.missing, forbidden: check.forbidden, ratio: check.ratio } : {};
    const action = distillAction(run.improve)?.result;
    const reason = proposal.reason ?? (action?.outcome === "review_needed" && typeof action.reason === "string" ? action.reason : "");
    const detail = [proposal.gate ?? proposal.status, reason].filter(Boolean).join(": ");
    return { ...base, ...ours, verdict, outcome: "lesson", detail, lesson, status: proposal.status, gate: proposal.gate, scores: proposal.scores ?? judgeScores(run.improve) };
  }
  const { outcome, detail } = distillOutcome(run.improve);
  if (outcome === "error") return errorRow(c, detail, run.seconds);
  return { ...base, scores: judgeScores(run.improve), rejected_lesson: rejectedLesson(run.improve), verdict: c.expect === "none" ? "right" : "missed", outcome, detail };
}

// ---- Metrics ---------------------------------------------------------------------------------------------------

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

export interface Metrics {
  /** Cases that expect a lesson: how many got a good one. */
  good_lessons: { n: number; good: number; rate: number | null };
  /** Cases that expect none: how many got a lesson anyway. */
  wrong_lessons: { n: number; wrong: number; rate: number | null };
  by_class: Record<string, { n: number; good?: number; wrong?: number; rate: number | null }>;
  /** What distill did, for the cases that expect a lesson and for those that expect none. */
  outcomes: Record<Expect, Record<Outcome, number>>;
  /** Why the lessons that were proposed for lesson cases were not good. A lesson can fail in more than one way. */
  bad_by: { missing_fact: number; forbidden_claim: number; too_long: number };
}

/** The numbers the eval reports, over the cases that ran without an error. */
export function metrics(rows: Row[]): Metrics {
  const scored = rows.filter((r) => r.verdict !== "error");
  const count = (rs: Row[], v: Verdict) => rs.filter((r) => r.verdict === v).length;
  const lessons = scored.filter((r) => r.expect === "lesson");
  const none = scored.filter((r) => r.expect === "none");
  const outcomes = { lesson: { lesson: 0, skipped: 0, rejected: 0, invalid: 0, error: 0 }, none: { lesson: 0, skipped: 0, rejected: 0, invalid: 0, error: 0 } };
  for (const r of rows) outcomes[r.expect][r.outcome]++;
  const by_class: Metrics["by_class"] = {};
  for (const klass of CLASSES) {
    if (rows.every((r) => r.class !== klass)) continue;
    const rs = scored.filter((r) => r.class === klass);
    by_class[klass] = klass === "lesson-worthy" || klass === "over-claim" ? { n: rs.length, good: count(rs, "good"), rate: ratio(count(rs, "good"), rs.length) } : { n: rs.length, wrong: count(rs, "wrong"), rate: ratio(count(rs, "wrong"), rs.length) };
  }
  const bad = lessons.filter((r) => r.verdict === "bad");
  return {
    good_lessons: { n: lessons.length, good: count(lessons, "good"), rate: ratio(count(lessons, "good"), lessons.length) },
    wrong_lessons: { n: none.length, wrong: count(none, "wrong"), rate: ratio(count(none, "wrong"), none.length) },
    by_class,
    outcomes,
    bad_by: {
      missing_fact: bad.filter((r) => r.missing.length > 0).length,
      forbidden_claim: bad.filter((r) => r.forbidden.length > 0).length,
      too_long: bad.filter((r) => (r.ratio ?? 0) > MAX_RATIO).length,
    },
  };
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

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
