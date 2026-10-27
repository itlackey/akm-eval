// What the retrieval eval declares about its own measurement: its version, and how a stored query is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "Run, save, compare" the story.
//
// This file only wires the parts together. What it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { casesOf, parseQrels, parseQueries } from "./lib.ts";
import { type Case, type Raw, type Row, errored, makeRow, rawOf, summarizeRows } from "./score.ts";

/** What a run adds to the input of every query: the library akm indexed and the bundle mapping. Another library gives akm other results for every query. */
export interface LibraryDigests {
  library_sha256: string | null;
  bundles_sha256: string | null;
}

/** The library of a summary, from the `assets` digests it records. */
export const libraryOf = (summary: Record<string, any>): LibraryDigests => ({ library_sha256: summary.assets?.library_sha256 ?? null, bundles_sha256: summary.assets?.bundles_sha256 ?? null });

/**
 * The folder that holds the queries.jsonl and qrels.jsonl a run was scored against. The public corpus is in the repository. A run on a custom
 * corpus records the folder of it as `corpus_folder` (lib/manifest.ts corpusFolderOf: from the repository root, null when it was outside), and
 * scripts/rescore sets it from `--cases DIR`, which may be absolute. A run from before the corpora were renamed is found by its corpus:
 * `private` (the rewrite in private/retrieval/assets) or `own` (private/retrieval/own). The books are in the books/ folder of a corpus. Throws a message.
 */
export function setFolder(root: string, summary: Record<string, any>): string {
  const { collection } = summary;
  if (collection !== "library" && collection !== "books" && collection !== "own") throw new Error(`the summary names the collection ${JSON.stringify(collection)}, and the collections are library, books and own`);
  let folder: string | undefined;
  if (summary.corpus === "public") folder = join("evals", NAME, "assets");
  else if (typeof summary.corpus_folder === "string") folder = summary.corpus_folder;
  else if (summary.corpus === "private" || (summary.corpus === "custom" && summary.corpus_kind === "rewrite")) folder = join("private", NAME, "assets");
  else if (summary.corpus === "own") folder = join("private", NAME, "own");
  if (folder === undefined) throw new Error(`the run's corpus was a folder outside the repository, and its summary does not name it (corpus_folder is ${JSON.stringify(summary.corpus_folder ?? null)}). Give it to scripts/rescore with --cases DIR`);
  return join(resolve(root, folder), collection === "books" ? "books" : "");
}

/** Everything the case presents to akm: its query, in the library the run indexed. */
const inputOf = (c: Case, library?: unknown): unknown => ({ query: c.query, library: library ?? null, ...(c.searchArgs ? { searchArgs: c.searchArgs } : {}) });

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.3",
  scoringVersion: "0.4",
  loadCases: (root, summary) => {
    const folder = setFolder(root, summary);
    const cases = casesOf(parseQueries(readFileSync(join(folder, "queries.jsonl"), "utf8"), join(folder, "queries.jsonl")), parseQrels(readFileSync(join(folder, "qrels.jsonl"), "utf8"), join(folder, "qrels.jsonl")));
    return cases;
  },
  caseId: (c) => c.id,
  input: inputOf,
  rescoreContexts: (_root, summary, cases) => new Map(cases.map(c => [c.id, libraryOf(summary)])),
  // Everything score() reads of the case: whether it is a task, the grade of each asset judged for it and the assets it bans.
  labels: (c) => ({ kind: c.kind, grades: c.grades, banned: [...c.banned].sort(), ...(c.aliases ? { aliases: c.aliases } : {}) }),
  rawOf,
  score: makeRow,
  errored,
  summarize: summarizeRows,
};
