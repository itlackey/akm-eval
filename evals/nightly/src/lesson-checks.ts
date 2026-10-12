// The checks of a lesson that the nightly eval scores its distill items by: the same checks the distill eval scores a lesson with (checkLesson, and
// what it calls), as they are in evals/distill/src/lib.ts at 3ae7c07, text unchanged. They are copied, and not imported, because distill's lib.ts also
// builds distill's akm config, so a scorer that imported it would reach lib/akm/akm.ts, which the collector covers, and a scorer must not depend on
// collection (see lib/manifest.ts). lesson-checks.test.ts checks this copy against distill's on the public cases, so a change to distill's checks fails until
// this file follows it. When distill's checks are in a file of their own that imports nothing of the collector, import them from there and delete this one.
//
// A change to this file changes what the eval scores. It is a measurement change: bump the scorer in MEASUREMENT.lock and update the golden files.

import { negations, reaches } from "../../../lib/negation.ts";

// The checks read a lesson's frontmatter with bun's own YAML parser. Without it every lesson would be scored on its body alone.
if (typeof Bun.YAML?.parse !== "function") throw new Error("nightly: this eval needs a bun that has Bun.YAML. Upgrade it with `bun upgrade`. See https://bun.sh");

/** A lesson longer than this many times its memory, in words, is too long. */
export const MAX_RATIO = 1.5;

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

export interface Check {
  /** The first phrase of each required fact the lesson does not state. */
  missing: string[];
  /** The forbidden phrases it asserts, one per group at most. */
  forbidden: string[];
  /** The contradicting phrases it asserts, one per group at most: the ones that turn the memory's action round. */
  contradicted: string[];
  /** The lesson's words over the memory's. */
  ratio: number;
  good: boolean;
}

/** What a case checks a lesson with. `contradicts` is optional, as in a case. */
type Checked = { required: string[][]; forbidden: string[][]; contradicts?: string[][] };

/** Score a lesson against a case: every required fact stated, no forbidden claim, no contradiction of the memory, and not much longer than its memory. */
export function checkLesson(c: Checked, lesson: string, memory: string): Check {
  const missing = c.required.filter((fact) => !stated(lesson, fact)).map((fact) => fact[0]);
  const forbidden = claims(lesson, c.forbidden);
  const contradicted = claims(lesson, c.contradicts ?? [], true);
  const ratio = Number((words(lesson) / Math.max(1, words(memoryBody(memory)))).toFixed(2));
  return { missing, forbidden, contradicted, ratio, good: missing.length === 0 && forbidden.length === 0 && contradicted.length === 0 && ratio <= MAX_RATIO };
}

// ---- Where distill writes a lesson ---------------------------------------------------------------------------------

/** The file distill writes a memory's lesson to, in the bundle. A lesson already there makes distill skip the memory. */
export const lessonFile = (c: { name: string }): string => {
  const clean = `memory-${c.name}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `lessons/${clean}-lesson.md`;
};
