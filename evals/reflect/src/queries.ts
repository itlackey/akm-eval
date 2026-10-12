// The searches that --retrieval-queries records for a corpus: the retrieval eval's labelled queries for the public notes (evals/retrieval/assets),
// matched to the notes of the corpus by public ref. A rewrite of the public cases has its own map of what it renamed, `map.json`, which generate
// writes beside the assets, and the queries go through it, so a query names what the rewritten note names. The retrieval eval's own private
// assets are not read: they were rewritten with another map, so their refs and terms are not those of reflect's private notes (#60).
//
// This file only reads files and applies the map. What is recorded for a case is decided by `searchesFor` in collect.ts, and shows in the
// `input_sha256` of the case, which digests the searches.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type RewriteMap, Rewriter } from "../../../lib/rewrite/rewrite.ts";
import { NAME, labelledQueries, searchesFor } from "./collect.ts";
import { parseCases } from "./lib.ts";

const REGENERATE = `Make the private assets again with: ./generate-assets --only ${NAME}`;

/** The query-writing function of the rewrite map in `file`: the words it renamed are renamed in a query. The map file is read and not changed. */
function rewriteWith(file: string, queries: string[]): (query: string) => string {
  let map: RewriteMap;
  try {
    map = JSON.parse(readFileSync(file, "utf8")) as RewriteMap;
    if (typeof map.seed !== "string") throw new Error("it holds no seed");
  } catch (e) {
    throw new Error(`--retrieval-queries maps the queries through the rewrite map ${file}, which is not a rewrite map (${(e as Error).message}). ${REGENERATE}`);
  }
  // As generate does for the labels of the cases: the names of a text are found in the text, and a word the map already has keeps its replacement.
  const rewriter = new Rewriter(map.seed, map);
  for (const q of queries) rewriter.collect(q);
  rewriter.finish();
  return (query) => rewriter.rewrite(query);
}

/**
 * The searches to record for each case of `corpus`, by the ref of its note, from the repository at `root`. Throws a message that says what is
 * missing, and what to do, when it cannot: the run calls it before anything runs, so a missing file stops the run at the start.
 */
export function retrievalSearches(corpus: ResolvedCorpus, root: string): Map<string, string[]> {
  const retrieval = join(root, "evals", "retrieval", "assets");
  for (const file of ["queries.jsonl", "qrels.jsonl"]) {
    if (!existsSync(join(retrieval, file))) throw new Error(`--retrieval-queries reads the retrieval eval's labelled queries, and ${relative(root, join(retrieval, file))} is missing`);
  }
  const labelled = labelledQueries(readFileSync(join(retrieval, "queries.jsonl"), "utf8"), readFileSync(join(retrieval, "qrels.jsonl"), "utf8"));
  const publicFile = join(root, "evals", NAME, "assets", "cases.jsonl");
  const publicCases = parseCases(readFileSync(publicFile, "utf8"), publicFile);
  if (corpus.name === "public") return searchesFor(publicCases, publicCases, labelled);
  if (!corpus.rewrite) throw new Error(`--retrieval-queries does not apply to ${corpus.flag}: the queries are those of the public notes, matched to a corpus by public ref, so the corpus has to be the public one or a rewrite of it`);
  const mapFile = join(dirname(corpus.folder), "map.json");
  if (!existsSync(mapFile)) throw new Error(`--retrieval-queries maps the queries through the rewrite map that generate writes beside the assets, and ${relative(root, mapFile)} is missing. ${REGENERATE}`);
  const casesFile = join(corpus.folder, "cases.jsonl");
  const cases = parseCases(readFileSync(casesFile, "utf8"), casesFile);
  return searchesFor(cases, publicCases, labelled, rewriteWith(mapFile, [...labelled.values()].flat()));
}
