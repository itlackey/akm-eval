// The akm calls the benchmark makes, on a sandbox from lib/akm: load the skills as assets and index them, then search
// and curate. A semantic sandbox has akm embed the skills as it indexes them, and every call has to say that it searched
// with them.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, runAkm } from "../../../lib/akm/akm.ts";
import { digest } from "../../../lib/akm/index-cache.ts";
import type { Skill } from "./dataset.ts";

/** How many results the benchmark asks of search and of curate: the deepest cut-off it scores. */
export const DEPTH = 15;

/** Where a skill is in the bundle. */
const pathOf = (skill: Skill): string => join("skills", skill.id, "SKILL.md");

/** What the skills are to lib/akm's index cache: the path of each one's file in the bundle, and the sha256 of its text. */
export const skillFiles = (skills: Skill[]): Record<string, string> => Object.fromEntries(skills.map((skill) => [pathOf(skill), digest(skill.text)]));

/**
 * Writes each skill as skills/<id>/SKILL.md in the sandbox's bundle and indexes them. Returns how many assets akm found.
 * A semantic index takes minutes, the time akm needs to embed every skill, and has to hold an embedding of each.
 */
export async function load(sb: Sandbox, skills: Skill[], semantic = false): Promise<number> {
  for (const skill of skills) {
    const dir = join(sb.dir, "bundle", "skills", skill.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), skill.text);
  }
  const { stdout, stderr, code } = await runAkm(sb, ["index", "--full", "--format", "json"], { timeoutMs: semantic ? 4 * 3600_000 : 30 * 60_000 });
  if (code !== 0) throw new Error(`akm index failed (exit ${code}): ${stderr.trim().slice(-300)}`);
  const out = JSON.parse(stdout) as { totalEntries?: number; verification?: { embeddingCount?: number; message?: string } };
  const total = out.totalEntries;
  if (typeof total !== "number") throw new Error("akm index did not say how many entries it found");
  if (semantic && out.verification?.embeddingCount !== total) throw new Error(`akm embedded ${out.verification?.embeddingCount} of ${total} skills: ${out.verification?.message}`);
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
 * So is an answer that says it searched another way than `mode` (keyword or semantic): when akm cannot embed a query it
 * answers with keyword search, `fts-fallback`, and that is not the semantic result.
 */
export async function ask(sb: Sandbox, system: "search" | "curate", query: string, known: ReadonlySet<string>, mode: "keyword" | "semantic" = "keyword"): Promise<Answer> {
  let seconds = 0;
  let error = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const run = await runAkm(sb, [system, "--limit", String(DEPTH), "--shape", "agent", "--format", "json", "--", query], { timeoutMs: 120_000 }).catch((e: Error) => ({ stdout: "", stderr: e.message, code: 127, ms: 0 }));
    seconds += run.ms / 1000;
    if (run.code !== 0) {
      error = `akm ${system} exited ${run.code}: ${(run.stderr.trim() || run.stdout.trim()).slice(-300)}`;
      continue;
    }
    let out: { hits?: { ref?: unknown }[]; items?: { ref?: unknown }[]; searchMode?: unknown; warnings?: unknown };
    try {
      out = JSON.parse(run.stdout);
    } catch {
      error = `akm ${system} printed no JSON: ${run.stdout.slice(0, 200)}`;
      continue;
    }
    if (typeof out.searchMode === "string" && out.searchMode !== mode) {
      error = `akm ${system} searched with ${out.searchMode}, not ${mode}: ${JSON.stringify(out.warnings ?? null).slice(0, 300)}`;
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
