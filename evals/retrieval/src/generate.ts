#!/usr/bin/env bun
// retrieval generate: makes the private library, queries and qrels of each public collection (the library and the
// books) from the public ones with lib/rewrite.
//
//   evals/retrieval/generate --seed N --out private/retrieval
//
// For each collection, the library, every query and every qrel row go through one rewrite run, so one map renames
// them all and a name that the queries write means the same name in the library. Then the result is checked: every
// qrel ref and every expected ref must name an asset akm indexes in the private library, and every query must keep
// the relevant assets it had.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import * as akm from "./akm.ts";
import { type Qrel, type Query, RELEVANT, parseQrels, parseQueries } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

/**
 * One file per query, one per query's expected assets and one per query's qrels, so the rewrite sees ordinary lines
 * and not JSON escapes. A qrels file holds two lines per row: the ref, then the reason. The grades stay out of the
 * text: nothing in them needs a rewrite.
 */
export function explode(queries: Query[], qrels: Qrel[], dir: string): void {
  for (const sub of ["queries", "expected", "qrels"]) mkdirSync(join(dir, sub), { recursive: true });
  for (const q of queries) {
    writeFileSync(join(dir, "queries", `${q.id}.txt`), `${q.query}\n`);
    if (q.expected?.length) writeFileSync(join(dir, "expected", `${q.id}.txt`), `${q.expected.join("\n")}\n`);
  }
  const byId = new Map<string, string[]>();
  for (const r of qrels) byId.set(r.id, [...(byId.get(r.id) ?? []), r.ref, r.reason.replace(/\s+/g, " ").trim()]);
  for (const [id, lines] of byId) writeFileSync(join(dir, "qrels", `${id}.txt`), `${lines.join("\n")}\n`);
}

/** The queries and the qrels again, with the rewritten text. The ids, kinds and grades are kept. */
export function assemble(queries: Query[], qrels: Qrel[], dir: string): { queries: Query[]; qrels: Qrel[] } {
  const read = (file: string) => {
    if (!existsSync(file)) throw new Error(`the rewrite did not write ${file}`);
    return readFileSync(file, "utf8");
  };
  const lines = new Map<string, string[]>();
  for (const r of qrels) if (!lines.has(r.id)) lines.set(r.id, read(join(dir, "qrels", `${r.id}.txt`)).split("\n"));
  const used = new Map<string, number>();
  return {
    queries: queries.map((q) => ({
      ...q,
      query: read(join(dir, "queries", `${q.id}.txt`)).replace(/\n$/, ""),
      ...(q.expected ? { expected: q.expected.length ? read(join(dir, "expected", `${q.id}.txt`)).trim().split("\n") : [] } : {}),
    })),
    qrels: qrels.map((r) => {
      const at = used.get(r.id) ?? 0;
      used.set(r.id, at + 2);
      const l = lines.get(r.id) as string[];
      return { ...r, ref: l[at], reason: l[at + 1] };
    }),
  };
}

/** What is wrong with the private assets, as a list of sentences. Empty when they are sound. */
export function problems(pub: { queries: Query[]; qrels: Qrel[]; nAssets: number }, priv: { queries: Query[]; qrels: Qrel[]; refs: Set<string> }): string[] {
  const found: string[] = [];
  if (priv.refs.size !== pub.nAssets) found.push(`the private library has ${priv.refs.size} assets, the public one ${pub.nAssets}`);
  const named = [...priv.qrels.map((r) => r.ref), ...priv.queries.flatMap((q) => q.expected ?? [])];
  const missing = [...new Set(named.filter((ref) => !priv.refs.has(ref)))];
  if (missing.length) found.push(`${missing.length} qrel or expected refs name no asset in the private library, such as ${missing.slice(0, 3).join(", ")}`);
  const pairs = new Set(priv.qrels.map((r) => `${r.id}\t${r.ref}`));
  if (pairs.size !== priv.qrels.length) found.push(`${priv.qrels.length - pairs.size} qrel rows share a query and an asset after the rewrite, so two assets became one`);
  const relevant = (qrels: Qrel[], id: string) => qrels.filter((r) => r.id === id && r.grade >= RELEVANT).length;
  for (const q of pub.queries) {
    const before = relevant(pub.qrels, q.id);
    const after = relevant(priv.qrels, q.id);
    if (before !== after) found.push(`${q.id} had ${before} relevant assets and now has ${after}`);
  }
  if (priv.queries.length !== pub.queries.length) found.push(`${priv.queries.length} private queries for ${pub.queries.length} public ones`);
  return found;
}

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

interface Collection {
  name: string;
  /** The public library. */
  library: string;
  /** The public queries.jsonl and qrels.jsonl. */
  source: string;
  /** Where the private copy goes, under --out. */
  target: string;
  /** The rewrite map, under --out. */
  map: string;
}

const COLLECTIONS: Collection[] = [
  { name: "library", library: join(ROOT, "corpus", "library"), source: join(EVAL_DIR, "assets"), target: "assets", map: "map.json" },
  { name: "books", library: join(EVAL_DIR, "assets", "books", "library"), source: join(EVAL_DIR, "assets", "books"), target: join("assets", "books"), map: "books-map.json" },
];

/** Makes the private copy of one collection under `out`, and returns the rewrite's summary line and what is wrong with the copy. */
async function makeCollection(c: Collection, out: string, seed: string): Promise<{ queries: number; qrels: number; summary: string; found: string[] }> {
  const work = join(out, ".work");
  const target = join(out, c.target);
  const map = join(out, c.map);

  const queries = parseQueries(readFileSync(join(c.source, "queries.jsonl"), "utf8"), join(c.source, "queries.jsonl"));
  const qrels = parseQrels(readFileSync(join(c.source, "qrels.jsonl"), "utf8"), join(c.source, "qrels.jsonl"));

  const publicBox = createSandbox("retrieval");
  const privateBox = createSandbox("retrieval");
  try {
    await akmVersion(publicBox); // before anything is written: the check at the end needs akm
    rmSync(work, { recursive: true, force: true });
    rmSync(map, { force: true });
    cpSync(c.library, join(work, "in", "library"), { recursive: true });
    explode(queries, qrels, join(work, "in"));
    const summary = rewrite(["--seed", seed, "--map", map, join(work, "in"), join(work, "out")]);
    const rewritten = assemble(queries, qrels, join(work, "out"));

    for (const entry of ["library", "queries.jsonl", "qrels.jsonl"]) rmSync(join(target, entry), { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    cpSync(join(work, "out", "library"), join(target, "library"), { recursive: true });
    writeFileSync(join(target, "queries.jsonl"), `${rewritten.queries.map((q) => JSON.stringify(q)).join("\n")}\n`);
    writeFileSync(join(target, "qrels.jsonl"), `${rewritten.qrels.map((r) => JSON.stringify(r)).join("\n")}\n`);
    rmSync(work, { recursive: true, force: true });

    const nAssets = await akm.load(publicBox, c.library);
    const privateAssets = await akm.assets(privateBox, await akm.load(privateBox, join(target, "library")));
    const found = problems({ queries, qrels, nAssets }, { queries: rewritten.queries, qrels: rewritten.qrels, refs: new Set(privateAssets.map((a) => a.ref)) });
    return { queries: rewritten.queries.length, qrels: rewritten.qrels.length, summary: summary.split("\n").pop() as string, found };
  } finally {
    removeSandbox(publicBox);
    removeSandbox(privateBox);
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/retrieval/generate --seed N --out private/retrieval");
    return 2;
  }
  const out = resolve(values.out);
  let status = 0;
  for (const c of COLLECTIONS) {
    const made = await makeCollection(c, out, values.seed);
    console.log(`retrieval: ${c.name}: ${made.queries} queries, ${made.qrels} qrels and the library written to ${join(values.out, c.target)}`);
    console.log(made.summary);
    if (made.found.length) {
      console.error(`retrieval: the private ${c.name} assets are not sound:\n  ${made.found.join("\n  ")}`);
      status = 1;
    } else {
      console.log(`retrieval: ${c.name}: every qrel ref names an asset in the private library, and every query keeps its relevant assets`);
    }
  }
  return status;
}

if (import.meta.main) process.exit(await main());
