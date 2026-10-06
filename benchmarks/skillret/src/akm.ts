// The akm calls the benchmark makes, on a sandbox from lib/akm: load the skills as assets and index them, then search
// and curate.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, runAkm } from "../../../lib/akm/akm.ts";
import type { Skill } from "./dataset.ts";

/** How many results the benchmark asks of search and of curate: the deepest cut-off it scores. */
export const DEPTH = 15;

/** Writes each skill as skills/<id>/SKILL.md in the sandbox's bundle and indexes them. Returns how many assets akm found. */
export async function load(sb: Sandbox, skills: Skill[]): Promise<number> {
  for (const skill of skills) {
    const dir = join(sb.dir, "bundle", "skills", skill.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), skill.text);
  }
  const { stdout, stderr, code } = await runAkm(sb, ["index", "--full", "--format", "json"], { timeoutMs: 30 * 60_000 });
  if (code !== 0) throw new Error(`akm index failed (exit ${code}): ${stderr.trim().slice(-300)}`);
  const total = (JSON.parse(stdout) as { totalEntries?: number }).totalEntries;
  if (typeof total !== "number") throw new Error("akm index did not say how many entries it found");
  return total;
}

export interface Answer {
  /** The skill ids in akm's order. */
  ranked: string[];
  /** akm's own name for how it searched: keyword, or something else when embeddings are on. */
  mode: string | null;
  /** How long the calls took, in seconds. */
  seconds: number;
  error?: string;
}

/**
 * One `akm search` or `akm curate` call. A call that fails is made once more, and one that fails again is an answer
 * with an error and no results. `known` are the skill ids of the library: a result that is not one of them is a failure.
 */
export async function ask(sb: Sandbox, system: "search" | "curate", query: string, known: ReadonlySet<string>): Promise<Answer> {
  let seconds = 0;
  let error = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = await runAkm(sb, [system, "--limit", String(DEPTH), "--shape", "agent", "--format", "json", "--", query], { timeoutMs: 120_000 }).catch((e: Error) => ({ stdout: "", stderr: e.message, code: 127, ms: 0 }));
    seconds += run.ms / 1000;
    if (run.code !== 0) {
      error = `akm ${system} exited ${run.code}: ${(run.stderr.trim() || run.stdout.trim()).slice(-300)}`;
      continue;
    }
    let out: { hits?: { ref?: unknown }[]; items?: { ref?: unknown }[]; searchMode?: unknown };
    try {
      out = JSON.parse(run.stdout);
    } catch {
      error = `akm ${system} printed no JSON: ${run.stdout.slice(0, 200)}`;
      continue;
    }
    const hits = (system === "search" ? out.hits : out.items) ?? [];
    const ranked = hits.map((hit) => (typeof hit.ref === "string" ? hit.ref.replace(/^skills\//, "") : ""));
    const stray = hits.find((_, i) => !known.has(ranked[i]));
    if (stray) {
      error = `akm ${system} returned ${JSON.stringify(stray.ref)}, which is not one of the skills it was given`;
      continue;
    }
    return { ranked, mode: typeof out.searchMode === "string" ? out.searchMode : null, seconds: Number(seconds.toFixed(2)) };
  }
  return { ranked: [], mode: null, seconds: Number(seconds.toFixed(2)), error };
}
