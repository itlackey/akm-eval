// The logic of scripts/rescore, without the command line: scoring a stored run again with the current scorer and the current labels, from
// the raw output each case's row holds. Explicit only: it never modifies the original or runs a model.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { type Measurement, completionOf, corpusFolderOf, loadMeasurement, REPO_ROOT } from "../../../lib/manifest.ts";
import { canonical } from "../../../lib/provenance.ts";

type Obj = Record<string, any>;

/** A refusal, with a message for the person at the command line. */
export class RescoreError extends Error {}

/** A stored run: the folder's name for messages, its summary and the rows of its samples.jsonl. */
export interface Stored {
  dir: string;
  summary: Obj;
  rows: Obj[];
}

export interface Rescored {
  summary: Obj;
  rows: Obj[];
  /** Case ids the run had and the corpus no longer has. They are not in the rescored result. */
  dropped: string[];
  /** Case ids whose scored row is not the one the run stored. */
  changed: string[];
}

export interface RescoreOptions {
  /** The checkout the cases and the scorer are read from. This one, but for tests. */
  root?: string;
  now?: Date;
  /**
   * The folder of the custom corpus the run was made on, when the run did not record it (`corpus_folder` is null: the folder was outside the
   * repository) or it has moved. From the repository root, as the evals' own `--cases`, or absolute. The cases are read from it, whatever the run says.
   */
  cases?: string;
}

const isObject = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const short = (ids: string[], n = 5): string => `${ids.slice(0, n).join(", ")}${ids.length > n ? `, and ${ids.length - n} more` : ""}`;

/** The measurement of the run's eval, or a refusal that says the eval is not on the manifest yet. */
function measurementOf(stored: Stored, root: string): Measurement {
  const name = stored.summary.eval;
  if (typeof name !== "string") throw new RescoreError(`${stored.dir}/summary.json is not an eval summary (it has no "eval")`);
  const m = loadMeasurement(name, root);
  if (!m) throw new RescoreError(`${stored.dir} is a run of ${name}, which declares no measurement yet (it has no src/measurement.ts), so there is no scorer to score it with. See lib/manifest.ts.`);
  return m;
}

/** The corpus names of a run on a custom corpus: `custom`, and the names a run from before the corpora were renamed has. */
const CUSTOM = ["custom", "private", "own", "own-feedback"];

/** The run is on skillret's custom corpus, a split of its dataset (the train split): it has no folder. */
const isSplit = (summary: Obj): boolean => summary.eval === "skillret" && summary.corpus === "custom";

/**
 * The summary the eval's `loadCases` reads to find the cases of the run. A run on the public corpus, and a run from before the corpora were renamed
 * (`private`, `own`), are read as they are: the eval knows where those cases are. A run on a custom corpus has them in `corpus_folder` (lib/manifest.ts
 * `corpusFolderOf`), and `cases` names the folder instead when the run did not record it or it has moved. Refuses, saying what to do, when the
 * folder is not known or is not there. The custom corpus of skillret (its train split) is drawn from a dataset and has no folder at all:
 * the eval finds its cases itself, so the summary is read as it is, and a `--cases` has no folder to apply to and is left unused.
 */
function summaryForCases(stored: Stored, root: string, cases: string | undefined): Obj {
  const { summary } = stored;
  if (isSplit(summary)) return summary;
  const custom = CUSTOM.includes(String(summary.corpus));
  if (cases === undefined && summary.corpus !== "custom") return summary;
  if (!custom) throw new RescoreError(`${stored.dir} was made on the ${JSON.stringify(summary.corpus)} corpus, and --cases names the folder of a custom one`);
  const folder = cases ?? summary.corpus_folder;
  if (typeof folder !== "string" || folder.trim() === "") {
    const why = summary.corpus_folder === null ? "outside the repository" : "and does not record where";
    throw new RescoreError(`${stored.dir} was made on a custom corpus ${why}, so the folder of its cases is not known here. Give it to scripts/rescore with --cases DIR, and compare the -rescored folder`);
  }
  const at = resolve(root, folder);
  if (!existsSync(at) || !statSync(at).isDirectory()) {
    throw new RescoreError(`${stored.dir} was made on the custom corpus in ${folder}, which is not a folder here. Put it back, or give scripts/rescore its place with --cases DIR`);
  }
  return { ...summary, corpus_folder: folder };
}

/** Score saved raw output with the current cases and scorer, without model calls or changing the original. */
export function rescoreRun(stored: Stored, options: RescoreOptions = {}): Rescored {
  const root = options.root ?? REPO_ROOT;
  const now = options.now ?? new Date();
  const { summary } = stored;
  const m = measurementOf(stored, root);
  const old = isObject(summary.manifest) ? summary.manifest : null;
  const seen = summaryForCases(stored, root, options.cases);

  let cases: any[];
  try {
    cases = m.loadCases(root, seen);
  } catch (e) {
    throw new RescoreError(`the cases ${stored.dir} was scored against cannot be read: ${(e as Error).message}`);
  }
  const byId = new Map(cases.map((c) => [m.caseId(c), c]));
  const rowIds = new Set<string>();
  for (const row of stored.rows) {
    if (!isObject(row) || typeof row.id !== "string" || !row.id || rowIds.has(row.id)) throw new RescoreError(`${stored.dir}: invalid or duplicate sample id`);
    rowIds.add(row.id);
  }
  const selected = stored.rows.map(row => row.id);
  const missing = selected.filter(id => !byId.has(id));
  if (missing.length) throw new RescoreError(`${stored.dir}: selected cases are missing or changed: ${short(missing)}. Provide the cases with --cases DIR; rescore does not drop cases.`);


  const lacks = new Map<string, string[]>();
  const dropped: string[] = [];
  const kept: { row: Obj; raw: any; c: any }[] = [];
  for (const row of stored.rows) {
    const c = byId.get(String(row.id));
    const read = m.rawOf(row);
    if ("missing" in read) for (const field of read.missing) lacks.set(field, [...(lacks.get(field) ?? []), String(row.id)]);
    else kept.push({ row, raw: read.raw, c });
  }
  if (lacks.size > 0) {
    const what = [...lacks].map(([field, ids]) => `${field} (${ids.length} ${ids.length === 1 ? "row" : "rows"}: ${short(ids)})`).join("; ");
    throw new RescoreError(`${stored.dir} cannot be scored again: its rows lack the raw output the ${m.eval} scorer reads: ${what}. Only a run that stores them can be rescored.`);
  }
  if (kept.length === 0) throw new RescoreError(`${stored.dir} has no case that the ${m.eval} corpus here still holds, so there is nothing to score again`);

  const rows = kept.map(({ c, raw }) => m.score(c, raw));
  const changed = kept.filter(({ row }, i) => canonical(row) !== canonical(rows[i])).map(({ row }) => String(row.id));
  // Old collection metadata is descriptive; rescoring needs the saved output and current cases.
  const rescored_from = { results: basename(stored.dir), scorer: old?.scorer, at: now.toISOString(), dropped };
  // A manifest from before 0.7.1 named eval_settings treatment_hints: the new folder is written with the current name.
  const { treatment_hints, ...kept_manifest } = old ?? {};
  const manifest = old ? { ...kept_manifest, ...(old.eval_settings ?? treatment_hints ? { eval_settings: old.eval_settings ?? treatment_hints } : {}),
    cases: undefined, completion: completionOf(m, selected, rows), scorer: { version: m.scoringVersion ?? m.version }, rescored_from } : undefined;
  const out: Obj = { ...summary, ...m.summarize(rows), manifest,
    scoring_version: m.scoringVersion ?? m.version, rescored_from };
  if (options.cases !== undefined && !isSplit(summary)) out.corpus_folder = corpusFolderOf(options.cases, root); // where the cases were read from this time
  if (typeof summary.label === "string") out.label = `${summary.label}-rescored`;
  return { summary: out, rows, dropped, changed };
}

/** The name of the folder beside `dir` that holds its rescored result: `-rescored` before a repeat's `-rN`, else at the end. */
export function rescoredName(name: string): string {
  const m = /^(.*?)(-r\d+(?:-.+)?)$/.exec(name);
  return m ? `${m[1]}-rescored${m[2]}` : `${name}-rescored`;
}

/** A saved snapshot of a results folder (or its summary.json); markers are reported, not used to refuse a read. */
export function readStored(path: string): Stored {
  let dir = resolve(path);
  if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
  if (!existsSync(join(dir, "summary.json"))) throw new RescoreError(`${path} is not a results folder: it has no summary.json`);
  if (!existsSync(join(dir, "samples.jsonl"))) throw new RescoreError(`${path} has no samples.jsonl`);
  let summary: unknown;
  try {
    summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
  } catch {
    throw new RescoreError(`${path}/summary.json is not valid JSON`);
  }
  if (!isObject(summary)) throw new RescoreError(`${path}/summary.json is not an eval summary`);
  const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").split("\n").filter((l) => l.trim()).map((l, i) => {
    try {
      return JSON.parse(l) as Obj;
    } catch {
      throw new RescoreError(`${path}/samples.jsonl:${i + 1} is not valid JSON`);
    }
  });
  const saved: Obj = summary;
  const snapshot: Obj = existsSync(join(dir, ".running")) ? { ...saved, notes: [
    ...(Array.isArray(saved.notes) ? saved.notes : []),
    "Source has a .running marker (possibly stale); rescoring uses the saved snapshot only.",
  ] } : saved;
  return { dir, summary: snapshot, rows };
}

/** Scores the results folder `path` again and writes the result to a new folder beside it (see `rescoredName`). The original is not touched. Returns the new folder. */
export function rescoreFolder(path: string, options: RescoreOptions = {}): { out: string; result: Rescored } {
  const stored = readStored(path);
  const result = rescoreRun(stored, options);
  const base = join(dirname(stored.dir), rescoredName(basename(stored.dir)));
  let out = base;
  for (let n = 2; existsSync(out); n++) out = `${base}-${n}`;
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "summary.json"), `${JSON.stringify(result.summary, null, 2)}\n`);
  writeFileSync(join(out, "samples.jsonl"), result.rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return { out, result };
}
