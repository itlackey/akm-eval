// What the skillret benchmark declares about its own measurement: which files collect, which files score, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts. A case is a query. The library the queries are asked of is the same for all of them,
// so its digest is the context of each query's input.

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { NAME } from "./collect.ts";
import { assetsDigest, corpusFiles, readCorpusQueries, type Query } from "./dataset.ts";
import { type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

/** The split a summary's corpus drew from: the test split for the public corpus, and the train split for the custom corpus (of kind "split"), which the first summaries called private. */
const splitOf = (summary: Record<string, any>): "public" | "private" => (summary.corpus === "public" ? "public" : "private");

const assetsOf = (root: string): string => join(root, "benchmarks", NAME, "assets");

export const MEASUREMENT: Measurement<Query, Raw, Row> = {
  eval: NAME,
  // What decides what akm is asked and what is kept of its answer: the sandboxes and configs, how the skills are written into the bundle and indexed,
  // the calls, the sample that curate is checked on. The lib/ files that run akm and keep the semantic index are covered through its imports.
  collector: ["benchmarks/skillret/src/collect.ts"],
  // What turns the ranked results of a query into its scores and the rows into metrics. The labels are the qrels, digested per query.
  scorer: ["benchmarks/skillret/src/score.ts"],
  // The queries are drawn from the data files in assets/ as the run drew them, with the --limit it recorded. Nothing is fetched.
  loadCases: (root, summary) => {
    const limit = typeof summary.sample?.limit === "number" ? summary.sample.limit : undefined;
    return readCorpusQueries(splitOf(summary), assetsOf(root), limit);
  },
  legacyProblem: (root, summary) => {
    const split = splitOf(summary);
    const assets = assetsOf(root);
    if (corpusFiles(split).some((name) => !existsSync(join(assets, name)))) return `the data files of ${relative(root, assets)} are not here (a run of the benchmark fetches them)`;
    if (summary.assets_sha256 !== assetsDigest(assets, split)) return `it read other data files than the ones in ${relative(root, assets)} now (assets_sha256 is ${summary.assets_sha256 ?? "not recorded"})`;
    return undefined;
  },
  caseId: (q) => q.id,
  // akm is asked the request as the dataset has it, of a library that is the same for every query (`library`: the digest of its skills).
  input: (q, library) => ({ query: q.query, library: library ?? null }),
  // Everything makeRow reads of the query: the skills it needs.
  labels: (q) => ({ relevant: q.relevant }),
  rawOf,
  score: makeRow,
  errored,
  summarize,
};
