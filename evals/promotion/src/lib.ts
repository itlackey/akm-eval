// Helpers for the promotion eval that are neither its scorer nor its collector: reading the cases, choosing which to run, and the digests
// of the corpus. build.ts makes the public cases and run.ts runs the eval.
//
// The scorer is score.ts and the collector is collect.ts (see measurement.ts); this file re-exports both, so the eval imports from one place.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import { BAD, type Case } from "./score.ts";

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
    for (const key of ["id", "ref", "content"] as const) {
      if (typeof c[key] !== "string" || c[key] === "") throw new Error(`${where}:${i + 1} has no string "${key}"`);
    }
    if (c.label !== "good" && c.label !== "bad") throw new Error(`${where}:${i + 1} has label "${c.label}", expected good or bad`);
    const category = c.label === "good" ? ["good"] : BAD;
    if (!(category as readonly string[]).includes(c.category)) throw new Error(`${where}:${i + 1} has category "${c.category}" for a ${c.label} case`);
    if (!/^knowledge\/\S+$/.test(c.ref)) throw new Error(`${where}:${i + 1} has ref "${c.ref}", expected knowledge/<name>`);
    for (const key of [c.id, c.ref]) {
      if (seen.has(key)) throw new Error(`${where}:${i + 1} repeats "${key}"`);
      seen.add(key);
    }
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/** The order `--limit` takes cases in: one of each category in turn, so a small run holds every kind. */
const ORDER: Case["category"][] = ["good", "duplicate", "stale", "ephemeral"];

export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const queues = ORDER.map((category) => cases.filter((c) => c.category === category));
  const picked = new Set<Case>();
  for (let round = 0; picked.size < limit; round++) {
    for (const queue of queues) if (queue[round] && picked.size < limit) picked.add(queue[round]);
  }
  return cases.filter((c) => picked.has(c));
}

/**
 * One digest over files, each named by a name of its own: the digest of sha256Files, except that the name is not the path
 * the file is read from. A name relative to the corpus folder gives a digest that holds in another checkout.
 */
export function digestOf(files: [name: string, path: string][]): string {
  const sorted = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Text(sorted.map(([name, path]) => `${name}\0${sha256File(path)}\n`).join(""));
}

/** The files of the library's knowledge/ folder, by path under it. */
function notesOf(libraryDir: string): string[] {
  const knowledge = join(libraryDir, "knowledge");
  return existsSync(knowledge) ? readdirSync(knowledge, { recursive: true }).map(String).filter((f) => statSync(join(knowledge, f)).isFile()) : [];
}

/** The digest of what a run reads: the cases file, and every file of the library's knowledge/ folder, which is copied into the bundle. Named `cases.jsonl` and `library/knowledge/...`. */
export function assetsSha256(casesFile: string, libraryDir: string): string {
  return digestOf([["cases.jsonl", casesFile], ...notesOf(libraryDir).map((f): [string, string] => [`library/knowledge/${f}`, join(libraryDir, "knowledge", f)])]);
}

/**
 * The digest of the notes the bundle of a run holds: the library's knowledge/ folder without the note that each of `cases` would write (see `plant`).
 * The judge compares a proposal with these, so they are part of what every case presents to akm. A run of fewer cases holds more of them.
 */
export function bundleSha256(libraryDir: string, cases: Case[]): string {
  const written = new Set(cases.map((c) => `${c.ref}.md`));
  return digestOf(notesOf(libraryDir).filter((f) => !written.has(`knowledge/${f}`)).map((f): [string, string] => [`knowledge/${f}`, join(libraryDir, "knowledge", f)]));
}

/** The content of a seed file such as private/seed, trimmed, or null when there is none. */
export function readSeed(file: string): string | null {
  try {
    return readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** The seed to record for a corpus: none for the public one, private/seed for an own one. promotion has no generated assets, so no run has a seed of its own. */
export const corpusSeed = (corpus: string, seedFile: string): string | null => (corpus === "public" ? null : readSeed(seedFile));
