#!/usr/bin/env bun
// defect-filter: replays akm's reflect defect filter (findReflectDefect, the check that refuses an edit before the judge sees
// it) on edits whose quality is known, and counts what it refuses. A good edit it refuses is a fix lost for 14 days. See ../README.md.
//
//   evals/reflect/defect-filter --akm-src DIR [--reflect RESULTS_DIR]... [--judge-gate public|private]... [--rescore]

import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { readManifest } from "../../../lib/manifest.ts";
import { harnessSha256, sha256Json } from "../../../lib/provenance.ts";
import { STRATEGY } from "./collect.ts";
import { assetsSha256, parseCases } from "./lib.ts";
import { MEASUREMENT, casesFolder } from "./measurement.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

const USAGE = `Usage: evals/reflect/defect-filter --akm-src DIR [--reflect RESULTS_DIR]... [--judge-gate public|private]... [--rescore]

Runs the defect filter of the akm checkout DIR on each labelled edit and counts what it refuses, by label.

  --akm-src     a checkout of akm: the filter is src/commands/improve/reflect-noise.ts there, called as akm calls it.
  --reflect     the results folder of a reflect run, or of a custom corpus: each proposal in samples.jsonl is an edit, good when
                it passed every check and bad when not. Run reflect with evals/reflect/patches/defect-filter-off.json, or
                the filter refuses edits before they are proposals and they are not in the results. A run whose recorded config
                does not have the filter off (its defectFilter lists empty) is refused, with or without --rescore.
                The source of an edit is the case's, read from the cases here now. So the manifest of the run must hold the digest of
                each case's input as it is now (after a scorer fix, scripts/rescore the run first and replay that folder).
                Legacy runs remain readable and report unverified original input identity. Every case id of the run must be in the corpus.
  --rescore     replay the proposals of a --reflect run against the cases and code here now even though its summary.json records
                other digests, records none, or has a case id that is gone. The report names the stored and the current digests
                and the case ids left out.
  --judge-gate  the 106 labelled reflect proposals of evals/judge-gate (good or bad by review), public or private.

Prints JSON: for each set of edits, the good and bad ones, how many the filter refused and by which rule, and the refused edits.
A --reflect set also carries "inputs": the corpus folder the replay read, and the stored and the current digests.`;

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

const DIGEST = /^[0-9a-f]{64}$/;

/** The lists of akm's defect filter. A run has the filter off when its config empties all three, as patches/defect-filter-off.json does. */
const FILTER_LISTS = ["placeholders", "metaCommentary", "frontmatterKeys"];

/**
 * Why a run did not have the defect filter off, or null when it did. The filter refuses an edit before it is a proposal, so every proposal of
 * a run with it on has passed it, and a replay of them reports 0 refused whatever the filter does. The setting is read from the config the
 * run recorded, for the strategy it ran (a summary from before the strategy was recorded ran reflect-only).
 */
function filterOnProblem(dir: string, summary: Record<string, any>): string | null {
  const strategy = typeof summary.strategy === "string" ? summary.strategy : STRATEGY;
  const refused = (why: string) => `${dir} was not run with the defect filter off (${why}), so every proposal in it already passed the filter and a replay would report 0 refused. Run reflect again with --config-patch evals/reflect/patches/defect-filter-off.json and replay that folder.`;
  const config = summary.config;
  if (typeof config !== "object" || config === null || Array.isArray(config)) return refused("its summary.json records no config, so nothing says the filter was off");
  const filter = config.improve?.strategies?.[strategy]?.processes?.reflect?.defectFilter;
  const on = FILTER_LISTS.filter((name) => !(Array.isArray(filter?.[name]) && filter[name].length === 0));
  return on.length === 0 ? null : refused(`its recorded config does not empty ${on.join(", ")} for the strategy ${strategy}`);
}

/** A digest a summary.json holds, or null when it holds none or something that is not one. */
const digestIn = (value: unknown): string | null => (typeof value === "string" && DIGEST.test(value) ? value : null);

/** What a replay of a reflect run read, for the report: the corpus and the code the run recorded, and the ones the replay used. */
export interface Inputs {
  /** "stored" when the run read the cases and ran the code that are here now. "rescore" when --rescore was given. */
  mode: "stored" | "rescore";
  corpus: "public" | "custom" | "private";
  /** The folder of the cases the replay read, from the repository root. */
  assets: string;
  /** The assets_sha256 of the run (null when it has none) and the digest of that folder now, computed as the run computes it. */
  assets_sha256: { stored: string | null; current: string };
  /** The harness_sha256 of the run (null when it has none) and the digest of this code now. */
  harness_sha256: { stored: string | null; current: string };
  /** What a replay without --rescore would have stopped on: a digest that differs or is missing. Empty when nothing does. */
  differences: string[];
  /** The case ids of the run that the cases here now lack. The proposals of these are left out. */
  missing_cases: string[];
  /**
   * For a run with a manifest (harness-v3 and later), what was checked in place of the two digests above: what the cases' digests were
   * compared on, "input" (the note, the path and the feedback each case was given) or "labels" for a run that recorded searches, whose
   * input digest includes them.
   */
  manifest: { cases_compared_on: "input" | "labels" | "unverified" };
}

export interface ReplayOptions {
  /** The repository the cases are read from. This one, but for tests. */
  root?: string;
  /** The harness_sha256 of the code here now. The one harnessSha256 gives for this folder, but for tests. */
  harness?: string;
  /** Replay a run that read other cases or ran other code, and report both. */
  rescore?: boolean;
}

/**
 * The proposals of a reflect run as edits: good when the case was correct. The note is the case's, by id, read from the cases here now,
 * so the run must have read the same ones.
 *
 * A run with a manifest is held to its case digests and its scorer: the input of each case it ran (the note, its path and the feedback; the
 * labels instead for a run that recorded searches) must be the digest the manifest holds. After a scorer fix, a run is scored again by
 * scripts/rescore and that folder replayed. Legacy runs report unverified original input identity.
 * Each case id of the run must be in the corpus. Otherwise this throws and says what differs. With `rescore` it replays
 * anyway, leaves out the proposals of a case that is gone, and says both in `inputs`. A run that had the defect filter on is refused
 * either way (see filterOnProblem).
 */
export function reflectEdits(resultsDir: string, options: ReplayOptions = {}): { edits: Edit[]; inputs: Inputs } {
  const root = options.root ?? ROOT;
  const summary = JSON.parse(readFileSync(join(resultsDir, "summary.json"), "utf8")) as Record<string, any>;
  const reading = readManifest(summary);
  if (reading.kind === "invalid") throw new Error(`${join(resultsDir, "summary.json")} has a manifest that is not sound: ${reading.problems.join("; ")}`);
  const filterOn = filterOnProblem(resultsDir, summary);
  if (filterOn !== null) throw new Error(filterOn); // not for --rescore to waive: it is about what the run means, not its digests
  const corpus = summary.corpus;
  // a run from before the corpus change called the seeded rewrite "private"
  if (corpus !== "public" && corpus !== "custom" && corpus !== "private") throw new Error(`${join(resultsDir, "summary.json")} names the corpus ${JSON.stringify(corpus)}, not public or custom`);
  const assets = casesFolder(root, summary);
  const where = relative(root, assets);
  const byId = new Map(parseCases(readFileSync(join(assets, "cases.jsonl"), "utf8"), join(assets, "cases.jsonl")).map((c) => [c.id, c]));

  const stored = { assets: digestIn(summary.assets_sha256), harness: digestIn(summary.harness_sha256) };
  const current = { assets: assetsSha256(assets), harness: options.harness ?? harnessSha256(import.meta.dir) };
  const differences: string[] = [];
  const rows = jsonl<{ id: string; outcome: string; correct: boolean | null; proposal?: string }>(join(resultsDir, "samples.jsonl"));
  let checked: Inputs["manifest"] = { cases_compared_on: "unverified" };
  if (reading.kind === "manifest") {
    const { manifest } = reading;
    const on = summary.retrieval_queries == null ? "input" : "labels";
    const moved = [...new Set(rows.map((r) => r.id))].filter((id) => {
      const c = byId.get(id);
      const was = manifest.cases[id];
      if (c === undefined) return false; // a case that is gone is listed below
      if (was === undefined) return true;
      return on === "input" ? was.input_sha256 !== sha256Json(MEASUREMENT.input(c)) : was.label_sha256 !== sha256Json(MEASUREMENT.labels(c));
    });
    if (moved.length > 0) differences.push(`${moved.length === 1 ? "the case" : `${moved.length} cases`} ${moved.join(", ")} ${moved.length === 1 ? "has" : "have"} another ${on === "input" ? "input (note, path or feedback)" : "label"} than the manifest of the run holds`);
    checked = { cases_compared_on: on };
  }

  const missing = [...new Set(rows.map((r) => r.id).filter((id) => !byId.has(id)))];
  if (!options.rescore && (differences.length > 0 || missing.length > 0)) {
    const lines = [...differences, ...(missing.length > 0 ? [`the run has ${missing.length === 1 ? "a case id" : "case ids"} that ${where}/cases.jsonl lacks: ${missing.join(", ")}`] : [])];
    throw new Error(`${resultsDir} cannot be replayed against the cases and code here now:\n  - ${lines.join("\n  - ")}\nThe source of each edit would not be the one the run was given. To score its proposals against what is here now on purpose, add --rescore.`);
  }

  if (reading.kind === "legacy") differences.push("Original input digests were not recorded; replay uses the current cases and input identity is unverified.");

  const edits: Edit[] = [];
  for (const row of rows) {
    const source = byId.get(row.id)?.source;
    if (row.outcome !== "proposal" || row.proposal === undefined || source === undefined) continue;
    edits.push({ id: row.id, label: row.correct ? "good" : "bad", source, candidate: row.proposal });
  }
  const inputs: Inputs = {
    mode: options.rescore ? "rescore" : "stored",
    corpus,
    assets: where,
    assets_sha256: { stored: stored.assets, current: current.assets },
    harness_sha256: { stored: stored.harness, current: current.harness },
    differences,
    missing_cases: missing,
    manifest: checked,
  };
  return { edits, inputs };
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
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { "akm-src": { type: "string" }, reflect: { type: "string", multiple: true }, "judge-gate": { type: "string", multiple: true }, rescore: { type: "boolean" }, help: { type: "boolean", short: "h" } }, strict: true });
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
  if (values.rescore && !values.reflect?.length) fail("--rescore is for --reflect: a judge-gate set is read as it is now and has no run to hold it to");
  const sets: Record<string, Replay & { inputs?: Inputs }> = {};
  for (const dir of values.reflect ?? []) {
    let loaded: ReturnType<typeof reflectEdits>;
    try {
      loaded = reflectEdits(resolve(dir), { rescore: values.rescore });
    } catch (e) {
      return fail((e as Error).message);
    }
    sets[`reflect ${dir}`] = { ...replay(loaded.edits, find as Find), inputs: loaded.inputs };
  }
  for (const corpus of values["judge-gate"] ?? []) {
    if (corpus !== "public" && corpus !== "private") fail(`--judge-gate must be public or private, not "${corpus}"`);
    sets[`judge-gate ${corpus}`] = replay(judgeGateEdits(corpus as "public" | "private"), find as Find);
  }
  console.log(JSON.stringify(sets, null, 2));
}

if (import.meta.main) await main();
