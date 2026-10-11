#!/usr/bin/env bun
// The domain mix of the public library: for each group of skills, the assets in the library and the graded pairs of qrels.jsonl whose asset is in
// it. The table in the Assets section of the README is this output. A test fails when the two differ.
//
//   bun evals/retrieval/src/mix.ts

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gradesByQuery, parseQrels } from "./lib.ts";
import { type MixRow, domainMix, libraryRefs, mixTable } from "./library.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

/** The mix of the library at `root`: its assets as the refs akm gives its files, and the pairs of its qrels, each counted once at its last grade. */
export function publicMix(root = ROOT): MixRow[] {
  const refs = [...libraryRefs(join(root, "corpus", "library")).keys()];
  const qrels = parseQrels(readFileSync(join(root, "evals", "retrieval", "assets", "qrels.jsonl"), "utf8"));
  const pairs = [...gradesByQuery(qrels).values()].flatMap((grades) => Object.entries(grades).map(([ref, grade]) => ({ ref, grade })));
  return domainMix(refs, pairs);
}

if (import.meta.main) console.log(mixTable(publicMix()));
