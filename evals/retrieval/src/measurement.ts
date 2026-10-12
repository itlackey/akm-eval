// What the retrieval eval declares about its own measurement: which files collect, which files score, and how a stored query is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts.

import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { sha256File, sha256Json } from "../../../lib/provenance.ts";
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
 * The folder that holds the queries.jsonl and qrels.jsonl a run was scored against. A run records the folder of its corpus relative to the
 * repository (`corpus_folder`, null when it was outside it). A run from before that is found by its corpus: `public`, `private` (the
 * rewrite in private/retrieval/assets) or `own` (private/retrieval/own). The books are in the books/ folder of a corpus. Throws a message.
 */
export function setFolder(root: string, summary: Record<string, any>): string {
  const { collection } = summary;
  if (collection !== "library" && collection !== "books" && collection !== "own") throw new Error(`the summary names the collection ${JSON.stringify(collection)}, and the collections are library, books and own`);
  let folder: string | undefined;
  if (typeof summary.corpus_folder === "string") folder = summary.corpus_folder;
  else if (summary.corpus === "public") folder = join("evals", NAME, "assets");
  else if (summary.corpus === "private" || (summary.corpus === "custom" && summary.corpus_kind === "rewrite")) folder = join("private", NAME, "assets");
  else if (summary.corpus === "own") folder = join("private", NAME, "own");
  if (folder === undefined) throw new Error(`the run's corpus was a folder outside the repository, and its summary does not name it (corpus_folder is ${JSON.stringify(summary.corpus_folder ?? null)})`);
  if (isAbsolute(folder) || folder.split(/[\\/]/).includes("..")) throw new Error(`corpus_folder ${JSON.stringify(folder)} is not a folder of the repository`);
  return join(root, folder, collection === "books" ? "books" : "");
}

/** Everything the case presents to akm: its query, in the library the run indexed. */
const inputOf = (c: Case, library?: unknown): unknown => ({ query: c.query, library: library ?? null });

export const MEASUREMENT: Measurement<Case, Raw, Row> = {
  eval: NAME,
  // What decides what akm is asked and what is kept of its answer: how a library is laid out and indexed for akm, the config of the sandbox,
  // the commands that are run, and the lib/akm files that run akm and keep an index between runs.
  collector: ["evals/retrieval/src/collect.ts", "evals/retrieval/src/akm.ts", "lib/akm/akm.ts", "lib/akm/index-cache.ts", "lib/cli.ts"],
  // What turns the results of a query into a row and the rows into metrics. The labels are the qrels, digested per case.
  scorer: ["evals/retrieval/src/score.ts", "lib/ir.ts"],
  loadCases: (root, summary) => {
    const folder = setFolder(root, summary);
    const cases = casesOf(parseQueries(readFileSync(join(folder, "queries.jsonl"), "utf8"), join(folder, "queries.jsonl")), parseQrels(readFileSync(join(folder, "qrels.jsonl"), "utf8"), join(folder, "qrels.jsonl")));
    // A query that was reworded since the run, or asked of another library, is another case: the results the run stored were not made for it.
    const made = summary.manifest?.cases;
    if (made === null || typeof made !== "object") return cases;
    return cases.filter((c) => !Object.hasOwn(made, c.id) || made[c.id]?.input_sha256 === sha256Json(inputOf(c, libraryOf(summary))));
  },
  legacyProblem: (root, summary) => {
    let queries: string;
    try {
      queries = join(setFolder(root, summary), "queries.jsonl");
    } catch (e) {
      return (e as Error).message;
    }
    if (!existsSync(queries)) return `${relative(root, queries)} is missing`;
    if (summary.assets?.queries_sha256 !== sha256File(queries)) return `it read other queries than the ones in ${relative(root, queries)} now (queries_sha256 is ${summary.assets?.queries_sha256 ?? "not recorded"})`;
    return undefined;
  },
  caseId: (c) => c.id,
  input: inputOf,
  // Everything score() reads of the case: whether it is a task, the grade of each asset judged for it and the assets it bans.
  labels: (c) => ({ kind: c.kind, grades: c.grades, banned: [...c.banned].sort() }),
  rawOf,
  score: makeRow,
  errored,
  summarize: summarizeRows,
};
