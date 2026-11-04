// Helpers for the drain-judge eval that are neither its scorer nor its collector: reading and selecting the cases.

import type { Case } from "./score.ts";

export * from "./score.ts";
export * from "./collect.ts";

export function parseCases(text: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${where}:${i + 1} is not valid JSON`);
    }
    if (typeof c.id !== "string" || c.id === "") throw new Error(`${where}:${i + 1} has no string "id"`);
    if (seen.has(c.id)) throw new Error(`${where}:${i + 1} repeats the id ${c.id}`);
    seen.add(c.id);
    const input = c.input as Case["input"] | undefined;
    if (!input || typeof input.proposal?.content !== "string" || typeof input.proposal?.ref !== "string" || typeof input.proposal?.source !== "string" || !Array.isArray(input.siblings)) {
      throw new Error(`${where}:${i + 1} has no input with a proposal (ref, source, content) and siblings`);
    }
    if (c.label !== "good" && c.label !== "bad") throw new Error(`${where}:${i + 1} has label "${c.label}", expected good or bad`);
    const bad = c.category === "ephemeral" || c.category === "duplicate" || c.category === "stale";
    if ((c.label === "bad") !== bad || (c.label === "good" && c.category !== "good")) throw new Error(`${where}:${i + 1} has label ${c.label} and category "${c.category}"`);
    if (!["real", "corpus", "constructed", "hand-written"].includes(c.origin)) throw new Error(`${where}:${i + 1} has origin "${c.origin}", expected real, corpus, constructed or hand-written`);
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases taken in turn from the categories (good, ephemeral, duplicate, stale) in file order, so a quick
 * run holds every category from 4 cases on.
 */
export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const groups = ["good", "ephemeral", "duplicate", "stale"].map((c) => cases.filter((x) => x.category === c));
  const picked = new Set<Case>();
  for (let i = 0; picked.size < limit && groups.some((g) => i < g.length); i++) {
    for (const g of groups) if (picked.size < limit && i < g.length) picked.add(g[i] as Case);
  }
  return cases.filter((c) => picked.has(c));
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
