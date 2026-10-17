// Helpers for the judge-gate eval that are neither its scorer nor its collector: reading and selecting the cases. run.ts uses them to run the
// eval and generate.ts to make the private cases.
//
// The scorer is score.ts and the collector is collect.ts (see measurement.ts); this file re-exports both, so the eval and its tests import
// from one place.

import { type Case } from "./score.ts";

export * from "./score.ts";
export * from "./collect.ts";

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
 * proportion as the whole set, each kind taken in file order, so a quick run still holds both: from
 * two cases on there is at least one good case, though good cases are under a third of the set.
 */
export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const good = cases.filter((c) => c.label === "good");
  const bad = cases.filter((c) => c.label === "bad");
  const share = Math.round((limit * good.length) / cases.length);
  const goodQuota = Math.min(good.length, limit >= 2 ? Math.min(limit - 1, Math.max(1, share)) : share);
  const badQuota = Math.min(bad.length, limit - goodQuota);
  const picked = new Set([...good.slice(0, goodQuota), ...bad.slice(0, badQuota)]);
  return cases.filter((c) => picked.has(c));
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
