// Helpers of the lesson-judge eval that are neither its scorer nor its collector: reading and selecting the cases, and what a run records of them.
// The scorer is score.ts and the collector is collect.ts (see measurement.ts); this file re-exports both, so the eval and its tests import from one place.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";
import { type Case, KINDS, MODES } from "./score.ts";

export * from "./score.ts";
export * from "./collect.ts";

/** The one data file of an assets folder. The labels and their reasons are in it. */
export const CASES = "cases.jsonl";

/** The page of the public assets that holds the labelling rubric and its `rubric_version`. */
export const RUBRIC = "README.md";

/** The version of the rubric the labels were adjudicated under, from the `rubric_version: N` line of the README of `assets`. A summary records it: scores from other labels do not compare. */
export function rubricVersion(assets: string): number {
  const found = /^rubric_version:\s*(\d+)\s*$/m.exec(readFileSync(join(assets, RUBRIC), "utf8"));
  if (!found) throw new Error(`${join(assets, RUBRIC)} has no "rubric_version: N" line`);
  return Number(found[1]);
}

/** assets_sha256 of summary.json: the digest of the cases file of an assets folder. It changes when a case or a label does. */
export function casesSha256(assets: string): string {
  const before = process.cwd();
  process.chdir(assets);
  try {
    return sha256Files([CASES]);
  } finally {
    process.chdir(before);
  }
}

export function parseCases(text: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${where}:${i + 1}`;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${at} is not valid JSON`);
    }
    if (typeof c.id !== "string" || seen.has(c.id)) throw new Error(`${at} has no id, or repeats one`);
    seen.add(c.id);
    if (!MODES.includes(c.mode)) throw new Error(`${at} has mode "${c.mode}", expected new or update`);
    if (c.label !== "good" && c.label !== "bad") throw new Error(`${at} has label "${c.label}", expected good or bad`);
    if (c.label === "bad" && !KINDS.includes(c.kind as never)) throw new Error(`${at} is a bad case with kind "${c.kind}", expected one of ${KINDS.join(", ")}`);
    if (c.label === "good" && c.kind !== undefined) throw new Error(`${at} is a good case with a kind: only bad cases have one`);
    if (typeof c.input?.lesson !== "string" || typeof c.input?.source !== "string") throw new Error(`${at} has no input.lesson and input.source`);
    if ((c.mode === "update") !== (c.input.extending !== undefined)) throw new Error(`${at} is mode ${c.mode}, so input.extending must be ${c.mode === "update" ? "there" : "absent"}`);
    if (c.mode === "update" && c.input.related !== undefined) throw new Error(`${at} is an update: distill sends no related list with one`);
    if (c.origin !== "real" && c.origin !== "hand-written") throw new Error(`${at} has origin "${c.origin}", expected real or hand-written`);
    if (typeof c.labelReason !== "string" || c.labelReason.trim() === "") throw new Error(`${at} has no labelReason`);
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases in the same good/bad proportion as the whole set, each kind taken in file
 * order, and from two cases on at least one good and one bad. The cases of a mode are not balanced: an update is judged by other criteria than a new lesson, and `--limit` is for a smoke run.
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
