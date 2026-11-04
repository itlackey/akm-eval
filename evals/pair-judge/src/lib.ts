// Helpers for the pair-judge eval that are neither its scorer nor its collector: reading and selecting the cases. run.ts uses them to run the eval.
//
// The scorer is score.ts and the collector is collect.ts (see measurement.ts); this file re-exports both, so the eval and its tests import from one place.

import type { Case, PairNote } from "./score.ts";

export * from "./score.ts";
export * from "./collect.ts";

const NOTE_FIELDS = ["ref", "type", "created", "updated", "content"] as const;

/** What is wrong with a note of a case: a missing field, or a `created` that is not a date. */
function noteProblem(note: unknown): string | null {
  const n = note as Record<string, unknown> | null;
  if (typeof n !== "object" || n === null) return "is not an object";
  for (const key of NOTE_FIELDS) if (typeof n[key] !== "string") return `has no string "${key}"`;
  if (!Number.isFinite(Date.parse(n.created as string))) return `has a "created" that is not a date`;
  return null;
}

/** Reads a cases file. Throws a message that names the line, on a case akm could not be given or one that cannot be scored. */
export function parseCases(text: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  const ids = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${where}:${i + 1}`;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${at} is not valid JSON`);
    }
    for (const key of ["id", "kind", "set", "labelReason"] as const) if (typeof c[key] !== "string" || c[key] === "") throw new Error(`${at} has no string "${key}"`);
    if (ids.has(c.id)) throw new Error(`${at} repeats the id ${c.id}`);
    ids.add(c.id);
    if (c.source !== "pair-pass" && c.source !== "hand-written") throw new Error(`${at} has source "${c.source}", expected pair-pass or hand-written`);
    for (const side of ["a", "b"] as const) {
      const problem = noteProblem(c[side]);
      if (problem) throw new Error(`${at}: note ${side} ${problem}`);
    }
    if (Date.parse(c.a.created) > Date.parse(c.b.created)) throw new Error(`${at}: a is the older note, but its created is later than b's (akm's judge refuses that input)`);
    if (!Array.isArray(c.safe) || c.safe.some((s) => s !== "a" && s !== "b") || new Set(c.safe).size !== c.safe.length) throw new Error(`${at} has a "safe" that is not a list of a and b`);
    for (const key of ["only_a", "only_b"] as const) {
      if (!Array.isArray(c[key]) || c[key].some((s) => typeof s !== "string" || s === "")) throw new Error(`${at} has no list of strings "${key}"`);
    }
    // A side that is safe to retire holds no claim of its own; a side that is not holds one.
    for (const side of ["a", "b"] as const) {
      const claims: string[] = side === "a" ? c.only_a : c.only_b;
      if (c.safe.includes(side) && claims.length > 0) throw new Error(`${at}: ${side} is safe to retire but has claims of its own`);
      const note: PairNote = c[side];
      for (const claim of claims) {
        if (!note.content.includes(claim)) throw new Error(`${at}: the claim "${claim.slice(0, 50)}" is not word for word in note ${side}`);
      }
    }
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases in the proportions of the whole set by kind: each kind in turn, in file order, so a quick run holds
 * the kinds that can be unsafe (a pair with no safe note, or one) and the duplicates.
 */
export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const byKind = new Map<string, Case[]>();
  for (const c of cases) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  const picked = new Set<Case>();
  for (let round = 0; picked.size < limit; round++) {
    for (const list of byKind.values()) {
      const c = list[round];
      if (c && picked.size < limit) picked.add(c);
    }
  }
  return cases.filter((c) => picked.has(c));
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
