// The scorer of the distill eval: the checks that turn what distill queued for a memory into a verdict, and the verdicts into metrics. It
// is the SCORER part of the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The
// collector (collect.ts) builds each row by calling `makeRow` with the raw output it got, and scripts/rescore calls the same function with
// the raw output it reads back from a stored row, so a fix to a check scores every stored run again.
//
// A change to this file, or to lib/negation.ts, changes what the eval scores. It is a measurement change: bump the scorer in
// MEASUREMENT.lock (scripts/measurement/run bump distill scorer --reason "...") and update the golden files (golden/) in the same change.
// evals/nightly scores its lessons with `checkLesson` from here.

import { negations, reaches } from "../../../lib/negation.ts";

// The checks read a lesson's frontmatter with bun's own YAML parser. Without it every lesson would be scored on its body alone.
if (typeof Bun.YAML?.parse !== "function") throw new Error("distill: this eval needs a bun that has Bun.YAML. Upgrade it with `bun upgrade`. See https://bun.sh");

export const CLASSES = ["lesson-worthy", "over-claim", "dated-status", "restates-asset", "duplicate-lesson", "lesson-update"] as const;
export type Class = (typeof CLASSES)[number];
export type Expect = "lesson" | "none" | "update";

/** A lesson longer than this many times its memory, in words, is too long. */
export const MAX_RATIO = 1.5;

/** A lesson that repeats more than this share of its memory word for word is a copy of the memory, not a lesson. */
export const MAX_COPIED = 0.75;

export interface Case {
  id: string;
  class: Class;
  expect: Expect;
  /**
   * What a lesson must state: facts, each a list of phrases, any one of which states it. A phrase that starts with `+` is an action, and a
   * negation right before it ("never wait for the heading") does not state it. For a lesson-update case, the new facts the memory adds.
   * Lesson and update cases only.
   */
  required: string[][];
  /** What a lesson must not claim: groups of phrases, any one of which makes the claim. Lesson and update cases only. */
  forbidden: string[][];
  /**
   * What a lesson must not assert because it turns the memory's action round: groups of phrases, any one of which fails the lesson, such as
   * "wait for networkidle" for a memory whose fix was to stop waiting for it. Matched like `forbidden`. Optional, so a case without it is
   * scored without it; every public lesson, over-claim and update case has it. Lesson and update cases only.
   */
  contradicts?: string[][];
  /** A lesson that passes, and one that over-claims. They keep the phrases honest. For a lesson-update case, the whole body of the updated lesson. Lesson and update cases only. */
  good?: string;
  bad?: string;
  /** A lesson that mentions the facts, makes no forbidden claim and still turns the memory's action round. It must fail, on a contradiction or a required action it does not assert. For a lesson-update case, the whole body of such an update. Optional. */
  reversed?: string;
  /** A lesson-update case only: the name of the lesson the library already holds, the file `lessons/<existing>.md` in the case's bundle. */
  existing?: string;
  /** What a correct result is, in a sentence. */
  note: string;
  /** Feedback recorded about the memory before distill runs (`akm feedback`), in order. Optional: the public cases have none. */
  feedback?: { signal: "positive" | "negative"; reason?: string }[];
}

export interface LoadedCase extends Case {
  contradicts: string[][];
  /** The case's bundle folder: the memory and the assets that go with it. */
  dir: string;
  /** The memory's name, so its ref is memories/<name>. */
  name: string;
  /** The memory file as written. */
  memory: string;
  /** A lesson-update case: the body of the lesson the library holds, without its frontmatter. */
  existingBody?: string;
}

export const expectOf = (klass: Class): Expect => (klass === "lesson-worthy" || klass === "over-claim" ? "lesson" : klass === "lesson-update" ? "update" : "none");

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

/** Words after which a phrase is a thing, not an action: "the wait for networkidle" is not "wait for networkidle". */
const DETERMINERS = "the|a|an|this|that|its|their|our|your";

/** Verbs that a phrase holds whole: "was" does not match "wasnt", as "isn't" is "isnt" once the apostrophe is gone, nor "has" "hasnt". */
const WHOLE_WORDS = new Set(["is", "was", "are", "were", "be", "been", "has", "have", "had", "do", "does", "did", "can", "could", "would", "should", "will", "may", "might", "must"]);

/**
 * A phrase as a pattern over normalized text. Each word matches the start of a word ("retr" matches "retry" and
 * "retries"), each number matches that number only, and `*` stands for up to three words. The verbs "is", "was", "has"
 * and the like match whole, so that "is safe" does not find "isn't safe". A word written with a leading `=` matches that
 * word only ("=wait" matches "wait" and not "waiting"), and a phrase that starts with one is not matched after "the", "a",
 * "its" and the like, where the word is a noun: "=wait for networkidle" is an instruction to wait and not "the wait for networkidle".
 * A `+` at the start of a phrase is not part of the pattern: see stated.
 */
function pattern(phrase: string): RegExp {
  const segments = phrase
    .split("*")
    .map((seg) => seg.split(/\s+/).flatMap((token) => normalize(token).split(" ").filter(Boolean).map((w) => ({ w, exact: token.startsWith("=") }))))
    .filter((s) => s.length > 0);
  if (segments.length === 0) return /(?!)/;
  const word = ({ w, exact }: { w: string; exact: boolean }) => (exact || /^\d+$/.test(w) || WHOLE_WORDS.has(w) ? `${w}(?![a-z0-9])` : `${w}[a-z0-9]*`);
  const verb = segments[0][0].exact ? `(?<!(?:^| )(?:${DETERMINERS}) )` : "";
  return new RegExp(`(?<![a-z0-9])${verb}${segments.map((s) => s.map(word).join(" ")).join(" (?:[a-z0-9]+ ){0,3}")}`);
}

/** Does `text` hold the phrase? */
export const mentions = (text: string, phrase: string): boolean => pattern(phrase).test(normalize(text));

/** Words that deny what they govern: "not", "no", "doesn't". */
const DENIES = /^(?:not|no|nor|isnt|arent|wasnt|werent|doesnt|dont|didnt|cant|cannot|wont|wouldnt|shouldnt|couldnt|hasnt|havent)$/;

/** Words that doubt what they hold, or ask about it, and leave it unasserted too: "unconfirmed whether", "if", "might". */
const DOUBTS = /(?<![a-z0-9])(?:unconfirmed|unverified|untested|unknown|unclear|unproven|whether|if|might|may|could|possibly|possible|perhaps|maybe|guess|suspect|suspected|unlikely)(?![a-z0-9])/;

/** Words that turn the action they govern round, in the clause they stand in: "never wait for", "avoid waiting for", "instead of waiting for". They are read for a contradiction, which is an action. */
const PROHIBITS = /^(?:never|avoid|avoids|avoiding|avoided|without|stop|stops|stopped|stopping|skip|skips|skipped|skipping)$/;

/** Is the word at `at` a prohibition? "Instead of" and "rather than" are two words, so the next one is read too. */
const prohibits = (words: string[], at: number): boolean =>
  PROHIBITS.test(words[at]) || (words[at] === "instead" && words[at + 1] === "of") || (words[at] === "rather" && words[at + 1] === "than");

/**
 * The words that deny, for a fact and for an action. A fact (a claim) is denied by a negation: "never" and "avoid" do not deny a fact, as
 * "never wait for networkidle and use waitForSelector" still claims waitForSelector. An action, which is what a contradiction and a required
 * action `+` are, is denied by a negation or a prohibition. In both, a negation that governs a verb that denies in turn is cancelled out
 * (see lib/negation.ts): "do not hesitate to wait for networkidle" tells the reader to wait for it, and "do not avoid waiting for the
 * heading" tells the reader to wait for the heading.
 */
const negatesClaim = (words: string[], at: number): boolean => DENIES.test(words[at]);
const negatesAction = (words: string[], at: number): boolean => DENIES.test(words[at]) || prohibits(words, at);

/** How many words around a phrase are read for a denial or a doubt: before it, and after it. */
const WORDS_BEFORE = 6;
const WORDS_AFTER = 3;

/** Where a clause starts: after a comma, a colon, a bracket or a dash, and at "but". A prohibition ends where its clause does. */
const CLAUSE_BREAK = /[,:()]|\s[-–—]+\s|[–—]|\b(?:but|whereas)\b/i;

/** A sentence as normalized words, and the offsets in it at which a clause starts. */
interface Sentence {
  s: string;
  starts: number[];
}

/** The sentences of `text`: a sentence ends at a full stop, a line break or a semicolon, and not at the dot in a number. */
function sentencesOf(text: string): Sentence[] {
  return text
    .split(/[.!?;]+(?=\s|$)|\n+/)
    .map((raw) => {
      let s = "";
      const starts: number[] = [];
      for (const part of raw.split(CLAUSE_BREAK).map(normalize)) {
        if (part === "") continue;
        starts.push(s === "" ? 0 : s.length + 1);
        s = s === "" ? part : `${s} ${part}`;
      }
      return { s, starts };
    })
    .filter((sentence) => sentence.s !== "");
}

/** The words of the sentence before `from`, back to the start of the clause that `from` is in. */
const clauseBefore = (sentence: Sentence, from: number): string => sentence.s.slice(Math.max(...sentence.starts.filter((start) => start <= from)), from);

/** Every place in the sentence where the phrase starts, also where it overlaps another. */
function* occurrences(re: RegExp, s: string): Generator<RegExpExecArray> {
  const all = new RegExp(re.source, "g");
  for (let m = all.exec(s); m !== null; m = all.exec(s)) {
    yield m;
    all.lastIndex = m.index + 1;
  }
}

const wordsOf = (s: string): string[] => s.split(" ").filter(Boolean);

/**
 * The phrases of `groups` that `text` asserts: one that a sentence holds, with no denial or doubt just before or after
 * it. A phrase in "it is unconfirmed whether 0.125 is enough" is not a claim. The first phrase of each group that is asserted.
 * A denial is a negation within six words before the phrase or three after, or a doubt; a negation that governs a verb that denies
 * in turn is cancelled out (see `negatesClaim`), so "we do not hesitate to say it works on all layouts" still asserts it.
 * With `actions`, the phrases are actions, as in a case's `contradicts`, and the denial is bound to the action: a negation or a prohibition
 * (never, avoid, without, stop, skip, instead of, rather than) before the phrase in its own clause, with the same cancelling out.
 * "Wait for networkidle" is not asserted by "never wait for networkidle", and is asserted by "do not hesitate to wait for networkidle"
 * and by "do not worry, wait for networkidle".
 */
export function claims(text: string, groups: string[][], actions = false): string[] {
  const sentences = sentencesOf(text);
  const around = (s: string, from: number, to: number): string => {
    const before = wordsOf(s.slice(0, from)).slice(-WORDS_BEFORE);
    const after = wordsOf(s.slice(to)).slice(0, WORDS_AFTER);
    return [...before, ...after].join(" ");
  };
  const denied = (sentence: Sentence, from: number, to: number): boolean => {
    const before = wordsOf(actions ? clauseBefore(sentence, from) : sentence.s.slice(0, from));
    const after = wordsOf(sentence.s.slice(to));
    return negations(before, actions ? negatesAction : negatesClaim).some((n) => n.at >= before.length - WORDS_BEFORE) || negations(after, negatesClaim).some((n) => n.at < WORDS_AFTER);
  };
  const found: string[] = [];
  for (const group of groups) {
    const hit = group.find((phrase) => {
      const re = pattern(phrase);
      return sentences.some((sentence) =>
        [...occurrences(re, sentence.s)].some((m) => {
          const to = m.index + m[0].length;
          return !DOUBTS.test(around(sentence.s, m.index, to)) && !denied(sentence, m.index, to);
        }),
      );
    });
    if (hit !== undefined) found.push(hit);
  }
  return found;
}

/**
 * Does `text` state the fact: does a sentence hold one of its phrases? A phrase that starts with `+` is an action the lesson must
 * assert, and it is not held by a sentence that negates or prohibits it right before it: "never wait for the visible heading" does not
 * state "+wait * heading". Only the words right before the phrase are read, in its clause, so a negation farther away does not matter
 * ("do not wait for networkidle, wait for the heading"). A negation that governs a verb that denies in turn is cancelled out, so
 * "do not hesitate to wait for the heading" states it. Any other phrase is a thing the lesson must mention, and a negation does not
 * unstate it: "annotated, not lightweight tags" mentions lightweight tags, and "the invoice-service was not checked" mentions the invoice-service.
 */
export function stated(text: string, fact: string[]): boolean {
  const sentences = sentencesOf(text);
  const denied = (sentence: Sentence, from: number): boolean => {
    const before = wordsOf(clauseBefore(sentence, from));
    return negations(before, negatesAction).some((n) => reaches(before, n));
  };
  return fact.some((phrase) => {
    const re = pattern(phrase);
    const action = phrase.startsWith("+");
    return sentences.some((sentence) => [...occurrences(re, sentence.s)].some((m) => !action || !denied(sentence, m.index)));
  });
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

/** A run of this many words that a text and a memory both have, in the same order, is repeated word for word. */
const COPY_RUN = 5;

/**
 * How much of the memory a text repeats word for word: the share of the memory's words that sit in a run of five or more words which the
 * text has too, in the same order. The memory pasted back repeats all of it (1), and a text that shares no run with it nothing (0). Case and
 * punctuation do not count. It is the share of the memory, not of the text, so a lesson that pads a paste with a description still repeats all of it.
 */
export function copiedShare(text: string, memory: string): number {
  const split = (s: string): string[] => normalize(s).split(" ").filter(Boolean);
  const own = split(text);
  const theirs = split(memory);
  const runs = new Set<string>();
  for (let i = 0; i + COPY_RUN <= own.length; i++) runs.add(own.slice(i, i + COPY_RUN).join(" "));
  const repeated = new Array<boolean>(theirs.length).fill(false);
  for (let i = 0; i + COPY_RUN <= theirs.length; i++) {
    if (runs.has(theirs.slice(i, i + COPY_RUN).join(" "))) repeated.fill(true, i, i + COPY_RUN);
  }
  return theirs.length === 0 ? 0 : Number((repeated.filter(Boolean).length / theirs.length).toFixed(2));
}

export interface Check {
  /** The first phrase of each required fact the lesson does not state. */
  missing: string[];
  /** The forbidden phrases it asserts, one per group at most. */
  forbidden: string[];
  /** The contradicting phrases it asserts, one per group at most: the ones that turn the memory's action round. */
  contradicted: string[];
  /** The lesson's words over the memory's. */
  ratio: number;
  /** The share of the memory's words that the lesson repeats word for word (see `copiedShare`). */
  copied: number;
  good: boolean;
}

/** What a case checks a lesson with. `contradicts` is optional, as in a case. */
type Checked = Pick<Case, "required" | "forbidden" | "contradicts">;

/**
 * Score a lesson against a case: every required fact stated, no forbidden claim, no contradiction of the memory, not much longer than its
 * memory, and not a copy of it (more than three quarters of the memory repeated word for word).
 */
export function checkLesson(c: Checked, lesson: string, memory: string): Check {
  const missing = c.required.filter((fact) => !stated(lesson, fact)).map((fact) => fact[0]);
  const forbidden = claims(lesson, c.forbidden);
  const contradicted = claims(lesson, c.contradicts ?? [], true);
  const ratio = Number((words(lesson) / Math.max(1, words(memoryBody(memory)))).toFixed(2));
  const copied = copiedShare(lesson, memoryBody(memory));
  return { missing, forbidden, contradicted, ratio, copied, good: missing.length === 0 && forbidden.length === 0 && contradicted.length === 0 && ratio <= MAX_RATIO && copied <= MAX_COPIED };
}

// ---- Scoring an update ------------------------------------------------------------------------------------------

/** The six checks of a lesson-update case. `null` is a check that could not run because no update was proposed. */
export interface UpdateChecks {
  /** One pending proposal sits on the existing lesson's ref, from distill, with the gate reason distill-update. */
  update_proposed: boolean;
  /** Every line of the existing body is still in the proposed body. */
  existing_kept: boolean | null;
  /** Each new fact the memory adds is in the lines the update added. */
  new_facts: boolean | null;
  /** The added lines make no forbidden claim and contradict nothing the memory shows. */
  no_extra_claims: boolean | null;
  /** The added lines are the new facts, not the memory pasted in: they repeat no more than three quarters of its words word for word. */
  not_copied: boolean | null;
  /** distill proposed no lesson of its own beside the update. */
  no_new_lesson: boolean;
}

const UPDATE_CHECKS = ["update_proposed", "existing_kept", "new_facts", "no_extra_claims", "not_copied", "no_new_lesson"] as const satisfies readonly (keyof UpdateChecks)[];

/** A body's lines as akm compares them: one space between words, no case, no punctuation, and no empty lines. */
const bodyLines = (body: string): string[] => body.split("\n").map(normalize).filter(Boolean);

/** What an updated body does to the lesson's: the existing lines it dropped, and the lines it added (as written). */
export function diffBody(existing: string, updated: string): { dropped: string[]; added: string[] } {
  const had = new Set(bodyLines(existing));
  const kept = new Set(bodyLines(updated));
  return { dropped: bodyLines(existing).filter((l) => !kept.has(l)), added: updated.split("\n").map((l) => l.trim()).filter((l) => normalize(l) !== "" && !had.has(normalize(l))) };
}

/**
 * Score the body of an updated lesson against a lesson-update case and its memory: the lines it kept, the facts it added, the claims it made,
 * what it contradicts, and how much of the memory the added lines repeat word for word.
 */
export function checkUpdate(c: Checked, existingBody: string, updatedBody: string, memory: string): { dropped: string[]; added: string[]; missing: string[]; forbidden: string[]; contradicted: string[]; copied: number } {
  const { dropped, added } = diffBody(existingBody, updatedBody);
  const text = added.join("\n");
  return { dropped, added, missing: c.required.filter((fact) => !stated(text, fact)).map((fact) => fact[0]), forbidden: claims(text, c.forbidden), contradicted: claims(text, c.contradicts ?? [], true), copied: copiedShare(text, memoryBody(memory)) };
}

/** The lesson's body, without its frontmatter. */
const bodyOf = (content: string): string => (FRONTMATTER.exec(content)?.[2] ?? content).trim();

// ---- What akm did ----------------------------------------------------------------------------------------------

/**
 * What distill did: it proposed a lesson, proposed an update to a lesson the library holds (akm with #1090), skipped
 * the memory, had the lesson rejected by its judge, made a lesson that is not valid or that akm could not queue, or failed.
 */
export type Outcome = "lesson" | "update" | "skipped" | "rejected" | "invalid" | "error";
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
  /** An update to a lesson the library already holds, not a new lesson: the gate reason is distill-update. */
  update: boolean;
}

/** A proposal's ref without its bundle: `bundle//lessons/x` is `lessons/x`. */
export const conceptId = (ref: string): string => (ref.includes("//") ? ref.slice(ref.indexOf("//") + 2) : ref);

/** The action `akm improve` reports for the memory's distill: the run's own, or the error that stopped it. */
export function distillAction(improve: unknown): { mode?: string; result?: Record<string, unknown> } | undefined {
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
  /** A lesson-update case: the five checks, null for every other class. */
  checks: UpdateChecks | null;
  /** A lesson-update case: the lines the update added to the existing lesson, null when no update was proposed. */
  added: string[] | null;
  /** The lesson text the judge rejected or sent to review, as akm's result reports it (cut to 2000 characters), null when akm queued the lesson or its build does not report it. */
  rejected_lesson: string | null;
  missing: string[];
  forbidden: string[];
  /** The contradicting phrases the lesson (or the added lines of an update) asserts: the ones that turn the memory's action round. */
  contradicted: string[];
  ratio: number | null;
  /** The share of the memory's words that the lesson (or the added lines of an update) repeats word for word. Absent where the check did not run: a case that expects none, a lesson that was never proposed. */
  copied?: number;
  /** The model names the endpoint reported for the case's calls, from akm's usage report. A gateway may serve one name with another model. */
  served: string[];
  /** The model calls akm made for the case, from its usage report. Null when the report is missing. */
  calls: number | null;
  /** What the case was scored from, kept so the row can be scored again (see `Raw`). Absent on a row of a case that ended in an error before akm answered, and on rows from before the manifest. */
  improve?: unknown;
  proposals?: Proposal[];
  seconds: number;
  error?: string;
  /** The error was a timeout: akm ran past its timeout and was killed. Absent on every other row. */
  timed_out?: true;
}

/** What one case's akm run left behind. */
export interface CaseRun {
  improve: unknown;
  proposals: Proposal[];
  seconds: number;
}

/**
 * The raw output of one case: what the collector got back from akm, and nothing the scorer decides. `improve` is what `akm improve`
 * printed, cut to the fields the scorer reads (the distill action, the usage report's models and calls), and `proposals` the lesson
 * proposals in the queue, new lessons and updates, in the order of the states. A row stores both under these names, with `seconds`, `error`
 * and `timed_out`, so scripts/rescore can score it again (see `rawOf`). A case that ended in an error before akm answered has `error`
 * (a timeout also `timedOut`) and neither of the two.
 */
export interface Raw {
  improve?: unknown;
  proposals?: Proposal[];
  seconds: number;
  /** The message of an error that left no answer: akm failed, ran past its time limit, or printed no JSON. */
  error?: string;
  /** The error was akm running past its timeout. */
  timedOut?: boolean;
}

export function errorRow(c: Case, message: string, seconds: number, timedOut = false): Row {
  return { id: c.id, class: c.class, expect: c.expect, verdict: "error", outcome: "error", detail: message, lesson: null, status: null, gate: null, scores: null, checks: null, added: null, rejected_lesson: null, missing: [], forbidden: [], contradicted: [], ratio: null, served: [], calls: null, seconds, error: message, ...(timedOut ? { timed_out: true as const } : {}) };
}

/** The model names the endpoint reported for the calls in `akm improve`'s result. */
export function servedModels(improve: unknown): string[] {
  const rows = ((improve ?? {}) as { usageReport?: { byProcessEngineModel?: { model?: unknown }[] } }).usageReport?.byProcessEngineModel ?? [];
  return [...new Set(rows.map((r) => r.model).filter((m): m is string => typeof m === "string" && m !== ""))].sort();
}

/** The model calls in `akm improve`'s usage report, null when it has none. */
export function modelCalls(improve: unknown): number | null {
  const rows = ((improve ?? {}) as { usageReport?: { byProcessEngineModel?: { calls?: unknown }[] } }).usageReport?.byProcessEngineModel;
  return rows === undefined ? null : rows.reduce((sum, r) => sum + (typeof r.calls === "number" ? r.calls : 0), 0);
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

/** The ref of a lesson without its bundle or its extension, to compare with a case's `lessons/<existing>`. */
const sameRef = (a: string, b: string): boolean => conceptId(a).replace(/\.md$/, "") === conceptId(b).replace(/\.md$/, "");

/** Score a lesson-update case: the five checks on what the queue holds. The update is the proposal on the existing lesson's ref. */
function scoreUpdate(c: LoadedCase, run: CaseRun, base: Omit<Row, "verdict" | "outcome" | "detail">): Row {
  const updates = run.proposals.filter((p) => p.update);
  const target = updates.find((p) => sameRef(p.ref, `lessons/${c.existing}`) && p.status === "pending");
  const checks: UpdateChecks = { update_proposed: target !== undefined, existing_kept: null, new_facts: null, no_extra_claims: null, not_copied: null, no_new_lesson: run.proposals.every((p) => p.update) };
  let extra: Partial<Row> = {};
  if (target) {
    const r = checkUpdate(c, c.existingBody ?? "", bodyOf(target.content), c.memory);
    checks.existing_kept = r.dropped.length === 0;
    checks.new_facts = r.missing.length === 0;
    checks.no_extra_claims = r.forbidden.length === 0 && r.contradicted.length === 0;
    checks.not_copied = r.copied <= MAX_COPIED;
    extra = { missing: r.missing, forbidden: r.forbidden, contradicted: r.contradicted, added: r.added, copied: r.copied };
  }
  const shown = target ?? updates[0] ?? run.proposals[0];
  const detail = [shown.gate ?? shown.status, shown.reason ?? ""].filter(Boolean).join(": ");
  const right = Object.values(checks).every((v) => v === true);
  return { ...base, ...extra, checks, verdict: right ? "right" : "bad", outcome: updates.length > 0 ? "update" : "lesson", detail, lesson: lessonText(shown.content), status: shown.status, gate: shown.gate, scores: shown.scores ?? judgeScores(run.improve) };
}

function scoreRun(c: LoadedCase, run: CaseRun): Row {
  const base = { id: c.id, class: c.class, expect: c.expect, seconds: run.seconds, served: servedModels(run.improve), calls: modelCalls(run.improve), lesson: null, status: null, gate: null, scores: null, checks: null, added: null, rejected_lesson: null, missing: [], forbidden: [], contradicted: [], ratio: null };
  const proposal = run.proposals[0];
  if (proposal && c.expect === "update") return scoreUpdate(c, run, base);
  if (proposal) {
    const lesson = lessonText(proposal.content);
    // A case that expects a lesson wants a new one. An update to a lesson the library holds is not that, so it is missed, and the text is kept to read.
    const update = run.proposals.some((p) => p.update);
    const check = checkLesson(c, lesson, c.memory);
    const verdict: Verdict = c.expect === "none" ? "wrong" : update ? "missed" : check.good ? "good" : "bad";
    const ours = c.expect === "lesson" && !update ? { missing: check.missing, forbidden: check.forbidden, contradicted: check.contradicted, ratio: check.ratio, copied: check.copied } : {};
    const action = distillAction(run.improve)?.result;
    const reason = proposal.reason ?? (action?.outcome === "review_needed" && typeof action.reason === "string" ? action.reason : "");
    const detail = [proposal.gate ?? proposal.status, reason].filter(Boolean).join(": ");
    return { ...base, ...ours, verdict, outcome: update ? "update" : "lesson", detail, lesson, status: proposal.status, gate: proposal.gate, scores: proposal.scores ?? judgeScores(run.improve) };
  }
  const { outcome, detail } = distillOutcome(run.improve);
  if (outcome === "error") return errorRow(c, detail, run.seconds);
  // An update case with nothing queued: no update, and no new lesson either.
  const checks = c.expect === "update" ? { update_proposed: false, existing_kept: null, new_facts: null, no_extra_claims: null, not_copied: null, no_new_lesson: true } : null;
  return { ...base, checks, scores: judgeScores(run.improve), rejected_lesson: rejectedLesson(run.improve), verdict: c.expect === "none" ? "right" : "missed", outcome, detail };
}

/** Score a case from what akm did. The queue decides whether a lesson, or an update to one, was proposed. The row keeps what it was scored from. */
export const scoreCase = (c: LoadedCase, run: CaseRun): Row => ({ ...scoreRun(c, run), improve: run.improve, proposals: run.proposals });

/** A row for a case from its raw output: an error that left no answer, or what akm did. */
export function makeRow(c: LoadedCase, raw: Raw): Row {
  if (raw.error !== undefined) return errorRow(c, raw.error, raw.seconds, raw.timedOut === true);
  return scoreCase(c, { improve: raw.improve, proposals: raw.proposals ?? [], seconds: raw.seconds });
}

// ---- Metrics ---------------------------------------------------------------------------------------------------

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

export interface Metrics {
  /** Cases that expect a lesson: how many got a good one. */
  good_lessons: { n: number; good: number; rate: number | null };
  /** Cases that expect none: how many got a lesson anyway. */
  wrong_lessons: { n: number; wrong: number; rate: number | null };
  /** Cases that expect an update to a lesson the library holds: how many got the right one, and how many passed each check. */
  lesson_updates: { n: number; right: number; rate: number | null; checks: Record<keyof UpdateChecks, number> };
  by_class: Record<string, { n: number; good?: number; wrong?: number; right?: number; rate: number | null }>;
  /** What distill did, for the cases that expect a lesson, those that expect none and those that expect an update. */
  outcomes: Record<Expect, Record<Outcome, number>>;
  /** Why the lessons that were proposed for lesson cases were not good. A lesson can fail in more than one way. */
  bad_by: { missing_fact: number; forbidden_claim: number; contradiction: number; too_long: number; copied: number };
}

/** The numbers the eval reports, over the cases that ran without an error. */
export function metrics(rows: Row[]): Metrics {
  const scored = rows.filter((r) => r.verdict !== "error");
  const count = (rs: Row[], v: Verdict) => rs.filter((r) => r.verdict === v).length;
  const lessons = scored.filter((r) => r.expect === "lesson");
  const none = scored.filter((r) => r.expect === "none");
  const updates = scored.filter((r) => r.expect === "update");
  const counts = (): Record<Outcome, number> => ({ lesson: 0, update: 0, skipped: 0, rejected: 0, invalid: 0, error: 0 });
  const outcomes: Metrics["outcomes"] = { lesson: counts(), none: counts(), update: counts() };
  for (const r of rows) outcomes[r.expect][r.outcome]++;
  const by_class: Metrics["by_class"] = {};
  for (const klass of CLASSES) {
    if (rows.every((r) => r.class !== klass)) continue;
    const rs = scored.filter((r) => r.class === klass);
    by_class[klass] = klass === "lesson-worthy" || klass === "over-claim" ? { n: rs.length, good: count(rs, "good"), rate: ratio(count(rs, "good"), rs.length) } : klass === "lesson-update" ? { n: rs.length, right: count(rs, "right"), rate: ratio(count(rs, "right"), rs.length) } : { n: rs.length, wrong: count(rs, "wrong"), rate: ratio(count(rs, "wrong"), rs.length) };
  }
  const bad = lessons.filter((r) => r.verdict === "bad");
  return {
    good_lessons: { n: lessons.length, good: count(lessons, "good"), rate: ratio(count(lessons, "good"), lessons.length) },
    wrong_lessons: { n: none.length, wrong: count(none, "wrong"), rate: ratio(count(none, "wrong"), none.length) },
    lesson_updates: {
      n: updates.length,
      right: count(updates, "right"),
      rate: ratio(count(updates, "right"), updates.length),
      checks: Object.fromEntries(UPDATE_CHECKS.map((k) => [k, updates.filter((r) => r.checks?.[k] === true).length])) as Record<keyof UpdateChecks, number>,
    },
    by_class,
    outcomes,
    bad_by: {
      missing_fact: bad.filter((r) => r.missing.length > 0).length,
      forbidden_claim: bad.filter((r) => r.forbidden.length > 0).length,
      contradiction: bad.filter((r) => (r.contradicted ?? []).length > 0).length, // rows of a run before this check have no list
      too_long: bad.filter((r) => (r.ratio ?? 0) > MAX_RATIO).length,
      copied: bad.filter((r) => (r.copied ?? 0) > MAX_COPIED).length, // rows of a run before this check have no share
    },
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

// ---- Scoring a stored row again ---------------------------------------------------------------------------------

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * The raw output of a stored row: the fields of the row that `makeRow` reads, or the names of those the row lacks. A run whose rows lack
 * one cannot be scored again (scripts/rescore refuses it and names them). Rows from before the manifest hold no `improve` and `proposals`.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (typeof row.seconds !== "number") missing.push("seconds");
  const answered = row.improve !== undefined || row.proposals !== undefined;
  if (!answered && typeof row.error === "string") {
    if (missing.length > 0) return { missing };
    return { raw: { error: row.error, timedOut: row.timed_out === true, seconds: row.seconds } };
  }
  if (!isObject(row.improve)) missing.push("improve");
  if (!Array.isArray(row.proposals)) missing.push("proposals");
  if (missing.length > 0) return { missing };
  return { raw: { improve: row.improve, proposals: row.proposals, seconds: row.seconds } };
}

/** A case that ended in an error has no verdict. */
export const errored = (row: Row): boolean => row.verdict === "error";

/** The fields of the summary that come from the rows: how many ran, were scored and errored, the model names that answered, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; served_models: string[]; metrics: Metrics } {
  const failed = rows.filter(errored).length;
  return {
    n_run: rows.length,
    n_scored: rows.length - failed,
    n_errored: failed,
    timeouts: rows.filter((r) => r.timed_out).length,
    served_models: [...new Set(rows.flatMap((r) => r.served))].sort(),
    metrics: metrics(rows),
  };
}
