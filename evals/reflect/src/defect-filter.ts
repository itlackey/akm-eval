#!/usr/bin/env bun
// defect-filter: replays akm's reflect defect filter (findReflectDefect, the check that refuses an edit before the judge sees
// it) on edits whose quality is known, and counts what it refuses. A good edit it refuses is a fix lost for 14 days. See ../README.md.
//
//   evals/reflect/defect-filter --akm-src DIR [--reflect RESULTS_DIR]... [--judge-gate public|private]...

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { parseCases } from "./lib.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

const USAGE = `Usage: evals/reflect/defect-filter --akm-src DIR [--reflect RESULTS_DIR]... [--judge-gate public|private]...

Runs the defect filter of the akm checkout DIR on each labelled edit and counts what it refuses, by label.

  --akm-src     a checkout of akm: the filter is src/commands/improve/reflect-noise.ts there, called as akm calls it.
  --reflect     the results folder of a reflect run, or its private folder: each proposal in samples.jsonl is an edit, good when
                it passed every check and bad when not. Run reflect with evals/reflect/patches/defect-filter-off.json, or
                the filter refuses edits before they are proposals and they are not in the results.
  --judge-gate  the 106 labelled reflect proposals of evals/judge-gate (good or bad by review), public or private.

Prints JSON: for each set of edits, the good and bad ones, how many the filter refused and by which rule, and the refused edits.`;

export interface Edit {
  id: string;
  label: "good" | "bad";
  source: string;
  candidate: string;
}

export type Find = (source: string, candidate: string) => string | undefined;

export interface Counts {
  n: number;
  refused: number;
  /** The refused edits by the rule that refused them. */
  rules: Record<string, number>;
}

export interface Replay {
  good: Counts;
  bad: Counts;
  /** The ids of the edits the filter refused, with the label and the rule. */
  hits: { id: string; label: Edit["label"]; rule: string }[];
}

/** Counts, by label, the edits `find` refuses. */
export function replay(edits: Edit[], find: Find): Replay {
  const out: Replay = { good: { n: 0, refused: 0, rules: {} }, bad: { n: 0, refused: 0, rules: {} }, hits: [] };
  for (const e of edits) {
    const counts = out[e.label];
    counts.n++;
    const rule = find(e.source, e.candidate);
    if (rule === undefined) continue;
    counts.refused++;
    counts.rules[rule] = (counts.rules[rule] ?? 0) + 1;
    out.hits.push({ id: e.id, label: e.label, rule });
  }
  return out;
}

const jsonl = <T>(file: string): T[] => readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as T);

/** The proposals of a reflect run as edits: good when the case was correct. The note is the case's, by id. */
export function reflectEdits(resultsDir: string, root = ROOT): Edit[] {
  const { corpus } = JSON.parse(readFileSync(join(resultsDir, "summary.json"), "utf8")) as { corpus: "public" | "private" };
  const assets = corpus === "public" ? join(root, "evals", "reflect", "assets") : join(root, "private", "reflect", "assets");
  const sources = new Map(parseCases(readFileSync(join(assets, "cases.jsonl"), "utf8")).map((c) => [c.id, c.source]));
  const edits: Edit[] = [];
  for (const row of jsonl<{ id: string; outcome: string; correct: boolean | null; proposal?: string }>(join(resultsDir, "samples.jsonl"))) {
    if (row.outcome !== "proposal" || row.proposal === undefined) continue;
    edits.push({ id: row.id, label: row.correct ? "good" : "bad", source: sources.get(row.id) as string, candidate: row.proposal });
  }
  return edits;
}

/** The labelled proposals of the judge-gate eval as edits. */
export function judgeGateEdits(corpus: "public" | "private", root = ROOT): Edit[] {
  const file = corpus === "public" ? join(root, "evals", "judge-gate", "assets", "cases.jsonl") : join(root, "private", "judge-gate", "assets", "cases.jsonl");
  return jsonl<{ id: string; label: "good" | "bad"; source: string; candidate: string }>(file).map(({ id, label, source, candidate }) => ({ id, label, source, candidate }));
}

/** akm's own filter, loaded from a checkout. */
export async function loadFilter(akmSrc: string): Promise<Find> {
  const file = resolve(akmSrc, "src", "commands", "improve", "reflect-noise.ts");
  if (!existsSync(file)) throw new Error(`${file} does not exist: --akm-src must be a checkout of akm that has the reflect defect filter`);
  const { findReflectDefect } = (await import(file)) as { findReflectDefect: Find };
  return findReflectDefect;
}

async function main(): Promise<void> {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "akm-src": { type: "string" }, reflect: { type: "string", multiple: true }, "judge-gate": { type: "string", multiple: true }, help: { type: "boolean", short: "h" } }, strict: true });
  if (values.help) {
    console.log(USAGE);
    return;
  }
  const fail = (message: string): never => {
    console.error(`defect-filter: ${message}\n\n${USAGE}`);
    process.exit(2);
  };
  if (!values["akm-src"]) fail("--akm-src is needed");
  if (!values.reflect?.length && !values["judge-gate"]?.length) fail("name something to replay: --reflect or --judge-gate");
  const find = await loadFilter(values["akm-src"] as string).catch((e: Error) => fail(e.message));
  const sets: Record<string, Replay> = {};
  for (const dir of values.reflect ?? []) sets[`reflect ${dir}`] = replay(reflectEdits(resolve(dir)), find as Find);
  for (const corpus of values["judge-gate"] ?? []) {
    if (corpus !== "public" && corpus !== "private") fail(`--judge-gate must be public or private, not "${corpus}"`);
    sets[`judge-gate ${corpus}`] = replay(judgeGateEdits(corpus as "public" | "private"), find as Find);
  }
  console.log(JSON.stringify(sets, null, 2));
}

if (import.meta.main) await main();
