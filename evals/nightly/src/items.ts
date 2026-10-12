// What an item of the night is, and how the items of items.jsonl are read and checked: the planted notes with the labels that say what a right
// night does to them. The scorer (score.ts) takes the item types, the exact fix and the reflect case an item is from it, and generate.ts
// and build.ts make the night with it. It imports nothing of the collector, so the scorer's digest does not take in collection.

import { RELATIONS } from "../../consolidate/src/cases.ts";
import type { Claim, Relation, Side } from "../../consolidate/src/cases.ts";
import { type Case as ReflectCase, type CaseClass, CLASSES, type Field } from "../../reflect/src/score.ts";
import type { Class as DistillClass, Expect } from "../../distill/src/lib.ts"; // types only: nothing of distill is imported at run time

export type { Claim, Relation, Side, Expect, Field, DistillClass, CaseClass };

/** The kinds of item, in the order a short run takes them: one of each kind first. */
export const KINDS = ["pair", "reflect", "distill", "fix", "untouched", "silent"] as const;
export type Kind = (typeof KINDS)[number];

/** Negative or positive feedback on one asset, as `akm feedback` records it. A fix carries an exact edit and where the correct fact comes from. */
export interface Feedback {
  ref: string;
  signal: "negative" | "positive";
  reason: string;
  fix?: { replace: string[]; with: string[]; source: string };
}

interface Base {
  id: string;
  kind: Kind;
  /** The canary string of the public night: do not train on it. */
  canary?: string;
  /** What the right outcome of the night is, in a sentence. */
  note: string;
  /** The library files the item owns, relative to the bundle. The night may change only these. */
  files: string[];
  /** The feedback recorded on the day before the night. */
  feedback: Feedback[];
}

/** Two memories whose right outcome is known by construction: `safe` are the sides that can be retired without losing a claim. */
export interface PairItem extends Base {
  kind: "pair";
  relation: Relation;
  older: Side | null;
  safe: Side[];
  claims: Claim[];
  a: string;
  b: string;
}

/**
 * A note with a defect akm names, or a control, and the negative feedback on it: one case of the reflect eval. A `silent` item is
 * a defect note with no feedback at all: only the proactive lane can reach it, and its proposal waits for a person.
 */
export interface ReflectItem extends Base {
  kind: "reflect" | "silent";
  class: CaseClass;
  path: string;
  defect: string;
  correct: string;
  allow: Field[];
  fix?: Field;
  forbid?: string[];
  anchors?: string[];
}

/** A note that holds a wrong fact, with negative feedback that carries the exact fix. The right night ends with the note fixed and nothing else changed: akm 0.10 applies the fix at once, and 0.9.26 queued it as a proposal for a person to accept. */
export interface FixItem extends Base {
  kind: "fix";
  path: string;
}

/** A memory with positive feedback: one case of the distill eval, with the files that case holds. */
export interface DistillItem extends Base {
  kind: "distill";
  class: DistillClass;
  expect: Expect;
  memory: string;
  required: string[][];
  forbidden: string[][];
  /** What a lesson must not assert because it turns the memory's action round, as in the distill case (see the distill eval's assets README). A lesson item has some. */
  contradicts: string[][];
}

/** Notes that no process has a reason to touch. */
export interface UntouchedItem extends Base {
  kind: "untouched";
}

export type Item = PairItem | ReflectItem | FixItem | DistillItem | UntouchedItem;

/** The ref akm gives a note: its path without `.md`, and without `/SKILL` for a skill. The same rule as the reflect eval's. */
export const refOf = (path: string): string => path.replace(/\.md$/, "").replace(/\/SKILL$/, "");

const isStringList = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const isPhraseGroups = (x: unknown): x is string[][] => Array.isArray(x) && x.every((g) => isStringList(g) && g.length > 0);

/** The items in `items.jsonl`, checked field by field. */
export function parseItems(text: string, where = "items"): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${where}:${i + 1}`;
    let item: Item;
    try {
      item = JSON.parse(line) as Item;
    } catch {
      throw new Error(`${at} is not valid JSON`);
    }
    if (typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id)) throw new Error(`${at} needs an id of lower case letters, digits and dashes`);
    if (seen.has(item.id)) throw new Error(`${at} repeats the id ${item.id}`);
    seen.add(item.id);
    if (!KINDS.includes(item.kind)) throw new Error(`${at} has kind "${item.kind}", expected one of ${KINDS.join(", ")}`);
    if (typeof item.note !== "string" || !item.note) throw new Error(`${at} has no note`);
    if (!isStringList(item.files) || item.files.length === 0) throw new Error(`${at} has no files`);
    if (!Array.isArray(item.feedback)) throw new Error(`${at} has no feedback list`);
    for (const f of item.feedback) {
      if (typeof f?.ref !== "string" || !f.ref || (f.signal !== "negative" && f.signal !== "positive") || typeof f.reason !== "string" || !f.reason) throw new Error(`${at} has feedback that is not a ref, a signal and a reason`);
      if (f.fix && (!isStringList(f.fix.replace) || !isStringList(f.fix.with) || f.fix.replace.length === 0 || f.fix.replace.length !== f.fix.with.length || typeof f.fix.source !== "string" || !f.fix.source)) throw new Error(`${at} has a fix that is not matching replace and with lists and a source`);
      if (f.fix && f.signal !== "negative") throw new Error(`${at} has a fix on positive feedback`);
    }
    const inFiles = (path: unknown, what: string) => {
      if (typeof path !== "string" || !item.files.includes(path)) throw new Error(`${at} names ${what} ${String(path)}, which is not one of its files`);
    };
    if (item.kind === "pair") {
      if (!RELATIONS.includes(item.relation)) throw new Error(`${at} has relation "${item.relation}"`);
      if (item.older !== null && item.older !== "a" && item.older !== "b") throw new Error(`${at} has older "${item.older}", expected a, b or null`);
      if (!Array.isArray(item.safe) || !item.safe.every((s) => s === "a" || s === "b")) throw new Error(`${at} has a "safe" that is not a list of a and b`);
      if (!Array.isArray(item.claims) || !item.claims.every((k) => (k?.side === "a" || k?.side === "b" || k?.side === "both") && typeof k.text === "string" && k.text)) throw new Error(`${at} has a bad "claims" list`);
      inFiles(item.a, "note a");
      inFiles(item.b, "note b");
      if (item.a === item.b) throw new Error(`${at} gives both notes the path ${item.a}`);
    } else if (item.kind === "reflect" || item.kind === "silent") {
      if ((item.kind === "silent") !== (item.feedback.length === 0)) throw new Error(`${at} is ${item.kind}, so its feedback ${item.kind === "silent" ? "must be empty" : "may not be"}`);
      if (!CLASSES.includes(item.class)) throw new Error(`${at} has class "${item.class}"`);
      if (!Array.isArray(item.allow)) throw new Error(`${at} has no "allow" list`);
      for (const key of ["defect", "correct"] as const) if (typeof item[key] !== "string" || !item[key]) throw new Error(`${at} has no "${key}"`);
      inFiles(item.path, "its note");
    } else if (item.kind === "fix") {
      inFiles(item.path, "its note");
      if (!item.feedback.some((f) => f.fix)) throw new Error(`${at} is a fix with no fix in its feedback`);
    } else if (item.kind === "distill") {
      if (item.expect !== "lesson" && item.expect !== "none") throw new Error(`${at} has expect "${item.expect}"`);
      if (!isPhraseGroups(item.required) || !isPhraseGroups(item.forbidden) || !isPhraseGroups(item.contradicts)) throw new Error(`${at} needs required, forbidden and contradicts as lists of lists of phrases`);
      // A lesson item without contradictions would be scored without the check that catches a lesson turning the memory's advice round, so it is refused.
      if ([item.required, item.forbidden, item.contradicts].some((groups) => (item.expect === "lesson" ? groups.length === 0 : groups.length > 0))) throw new Error(`${at} expects ${item.expect}, so its required, forbidden and contradicts do not fit`);
      inFiles(item.memory, "its memory");
    }
    items.push(item);
  });
  if (items.length === 0) throw new Error(`${where} has no items`);
  return items;
}

/** The text with each `--replace` swapped for its `--with`, in order, each applied once. akm's own rule is that a `--replace` text appears exactly once. */
export function applyFix(text: string, fix: NonNullable<Feedback["fix"]>): string {
  return fix.replace.reduce((out, old, i) => {
    const at = out.indexOf(old);
    return at < 0 ? out : out.slice(0, at) + (fix.with[i] as string) + out.slice(at + old.length);
  }, text);
}

/** The reflect case this item is: the note as planted, and what a correct result is. */
export function reflectCase(item: ReflectItem, source: string): ReflectCase {
  return { id: item.id, class: item.class, path: item.path, source, feedback: item.feedback[0]?.reason ?? "", defect: item.defect, correct: item.correct, allow: item.allow, ...(item.fix ? { fix: item.fix } : {}), ...(item.forbid ? { forbid: item.forbid } : {}), ...(item.anchors ? { anchors: item.anchors } : {}) };
}
