// What the consolidate eval declares about its own measurement: which files collect, which files score, and how a stored case is scored
// again. lib/manifest.ts has the contract (`Measurement`) and the README's "How results stay comparable" the story.
//
// This file only wires the parts together. It is in neither digest: what it digests per case (`input` and `labels`) shows in the case
// digests of a run, and the scoring itself is in score.ts and pool-score.ts.
//
// One declaration covers both modes. In the per-case run a case is a pair of notes. In `--pool` (summary.mode "pool") a case is a cluster of
// the pool, scored from the one `akm improve` run that all the clusters were in.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Measurement } from "../../../lib/manifest.ts";
import { type Case, parseCases } from "./cases.ts";
import { NAME } from "./collect.ts";
import { loadPool, poolCases } from "./pool.ts";
import { type PoolCase, type PoolRaw, type PoolRow, isPoolRow, makePoolRow, poolErrored, poolRawOf, poolSummarize } from "./pool-score.ts";
import { type Raw, type Row, errored, makeRow, rawOf, summarize } from "./score.ts";

type AnyCase = Case | PoolCase;
type AnyRow = Row | PoolRow;

const isPool = (c: AnyCase): c is PoolCase => "retire" in c;

/**
 * Where the cases of a summary's corpus are: the committed ones, the folder a custom run recorded (`corpus_folder`, from the repository root, or the one
 * scripts/rescore was given with --cases), or for a run from before the corpora were renamed (`private`) the folder generate makes.
 */
function assetsOf(root: string, summary: Record<string, any>): string {
  if (summary.corpus === "public") return join(root, "evals", NAME, "assets");
  if (summary.corpus === "custom") {
    if (typeof summary.corpus_folder !== "string" || summary.corpus_folder === "") throw new Error("the custom corpus of the run was not in the repository, so its folder was not recorded. Give it with --cases DIR");
    return resolve(root, summary.corpus_folder);
  }
  if (summary.corpus === "private") return join(root, "private", NAME, "assets");
  throw new Error(`the run was made on the ${JSON.stringify(summary.corpus)} corpus, which this eval does not know`);
}

export const MEASUREMENT: Measurement<AnyCase, Raw | PoolRaw, AnyRow> = {
  eval: NAME,
  // The version of what this eval asks akm. Change it by hand when that changes; runs are compared by it.
  version: "0.2",
  loadCases: (root, summary) => {
    if (summary.mode === "pool") return poolCases(loadPool(join(root, "evals", NAME, "assets", "pool")));
    const file = join(assetsOf(root, summary), "cases.jsonl");
    return parseCases(readFileSync(file, "utf8"), file);
  },
  caseId: (c) => c.id,
  // The notes go into the bundle under their names, dated by file time (a pair: older says which is older). A cluster of the pool is run in
  // the one bundle with every other note, so the whole pool is part of what akm saw.
  input: (c) => (isPool(c) ? { notes: c.notes.map((name) => ({ name, text: c.texts[name], age_days: c.ages[name] })), pool_sha256: c.pool_sha256 } : { a: c.a, b: c.b, older: c.older }),
  // Everything the scorer reads of the case: which side is safe and the relation, or the cluster's kind and what each note may be retired for.
  labels: (c) => (isPool(c) ? { kind: c.kind, notes: c.notes, retire: c.retire } : { relation: c.relation, safe: c.safe, a: c.a.name, b: c.b.name }),
  rawOf: (row) => (isPoolRow(row) || Array.isArray(row.may_retire) ? poolRawOf(row) : rawOf(row)), // a pool row from before the manifest has no run, but it has may_retire
  score: (c, raw) => (isPool(c) ? makePoolRow(c, raw as PoolRaw) : makeRow(c, raw as Raw)),
  errored: (row) => (isPoolRow(row) ? poolErrored(row as PoolRow) : errored(row as Row)),
  summarize: (rows) => (rows.length > 0 && isPoolRow(rows[0] as AnyRow) ? poolSummarize(rows as PoolRow[]) : summarize(rows as Row[])),
};
