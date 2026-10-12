// The logic of scripts/rescore, without the command line: scoring a stored run again with the current scorer and the current labels, from
// the raw output each case's row holds. It never modifies the folder it reads; scripts/compare uses `rescoreRun` to bring two runs to one
// scorer before it compares them. See the README's "How results stay comparable".

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { type CaseDigest, type Measurement, type PartRef, type RunManifest, buildManifest, caseDigests, completionOf, corpusFolderOf, loadMeasurement, lockedParts, readManifest, REPO_ROOT } from "../../../lib/manifest.ts";
import { canonical, recordedEngine, sha256Json } from "../../../lib/provenance.ts";

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
  /** Case ids whose labels are not the ones the run was made with (they are not an error: that is what a rescore is for). Empty for a run with no manifest. */
  relabelled: string[];
  /** The run had no manifest: its collector is known only by its harness_sha256, and its case inputs are those of the cases here now. */
  legacy: boolean;
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
const ZEROS = "0".repeat(64);
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

/**
 * The summary the eval's `loadCases` reads to find the cases of the run. A run on the public corpus, and a run from before the corpora were renamed
 * (`private`, `own`), are read as they are: the eval knows where those cases are. A run on a custom corpus has them in `corpus_folder` (lib/manifest.ts
 * `corpusFolderOf`), and `cases` names the folder instead when the run did not record it or it has moved. Refuses, saying what to do, when the
 * folder is not known or is not there.
 */
function summaryForCases(stored: Stored, root: string, cases: string | undefined): Obj {
  const { summary } = stored;
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

/**
 * Scores a stored run again: each row is read back into its raw output (`rawOf`), scored with the current scorer against the current case
 * (`score`), and the summary takes the counts and metrics from the new rows. The manifest is the run's own, with the current scorer, the
 * labels' digests as they are now, the completion of the new rows, and `rescored_from`. A legacy run (no manifest) gets one made from its
 * summary. Refuses, naming what is missing, a run whose rows lack a field the scorer reads.
 */
export function rescoreRun(stored: Stored, options: RescoreOptions = {}): Rescored {
  const root = options.root ?? REPO_ROOT;
  const now = options.now ?? new Date();
  const { summary } = stored;
  const m = measurementOf(stored, root);
  const reading = readManifest(summary);
  if (reading.kind === "invalid") throw new RescoreError(`${stored.dir} has a manifest that is not sound: ${reading.problems.join("; ")}`);
  const seen = summaryForCases(stored, root, options.cases);
  const legacy = reading.kind === "legacy";
  if (legacy) {
    const problem = m.legacyProblem?.(root, seen);
    if (problem) throw new RescoreError(`${stored.dir} was made before the manifest, and cannot be scored again: ${problem}`);
  }

  let cases: any[];
  try {
    cases = m.loadCases(root, seen);
  } catch (e) {
    throw new RescoreError(`the cases ${stored.dir} was scored against cannot be read: ${(e as Error).message}`);
  }
  const byId = new Map(cases.map((c) => [m.caseId(c), c]));

  const lacks = new Map<string, string[]>();
  const dropped: string[] = [];
  const kept: { row: Obj; raw: any; c: any }[] = [];
  for (const row of stored.rows) {
    const c = byId.get(String(row.id));
    if (c === undefined) {
      dropped.push(String(row.id));
      continue;
    }
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
  const parts = lockedParts(m, root);
  const labelOf = (id: string): string => sha256Json(m.labels(byId.get(id)));
  const scoredIds = kept.map(({ row }) => String(row.id));
  const rescoredFrom = { results: basename(stored.dir), scorer: reading.kind === "manifest" ? reading.manifest.scorer : null, at: now.toISOString(), dropped };

  let manifest: RunManifest;
  let relabelled: string[] = [];
  if (reading.kind === "manifest") {
    const old = reading.manifest;
    const stray = scoredIds.filter((id) => old.cases[id] === undefined);
    if (stray.length > 0) throw new RescoreError(`${stored.dir} has rows for cases its manifest does not hold: ${short(stray)}`);
    const selected = old.completion.selected.filter((id) => byId.has(id));
    const cases: Record<string, CaseDigest> = Object.fromEntries(selected.map((id) => [id, { input_sha256: (old.cases[id] as CaseDigest).input_sha256, label_sha256: labelOf(id) }]));
    relabelled = selected.filter((id) => (old.cases[id] as CaseDigest).label_sha256 !== cases[id]?.label_sha256);
    manifest = { ...old, scorer: parts.scorer, cases, completion: completionOf(m, selected, rows), rescored_from: rescoredFrom };
  } else {
    const engines = isObject(summary.engine?.engines) ? Object.fromEntries(Object.entries<any>(summary.engine.engines).map(([name, e]) => [name, recordedEngine(e)])) : {};
    manifest = {
      ...buildManifest({
        measurement: m,
        // a run before harness-v3 has no collector version: its code is known by the harness_sha256 it recorded, as version 0
        parts: { collector: { version: 0, sha256: typeof summary.harness_sha256 === "string" && /^[0-9a-f]{64}$/.test(summary.harness_sha256) ? summary.harness_sha256 : ZEROS }, scorer: parts.scorer, harness_version: 0 },
        corpus: String(summary.corpus),
        collection: typeof summary.collection === "string" ? summary.collection : null,
        mode: typeof summary.mode === "string" ? summary.mode : null,
        cases: caseDigests(m, kept.map(({ c }) => c)),
        akm: { version: summary.akm_version ?? null, bin: summary.akm_bin ?? null, build: summary.akm_build ?? null, build_fingerprint: summary.akm_build_fingerprint ?? null },
        config: isObject(summary.config) ? summary.config : undefined,
        engines,
        settings: { strategy: summary.strategy ?? null, config_patch_sha256: summary.config_patch?.sha256 ?? null, timeout_ms: summary.timeout_ms ?? null, seed: summary.seed ?? null },
        treatment_hints: typeof summary.embedder === "string" ? { embedder: summary.embedder } : {},
        completion: completionOf(m, scoredIds, rows),
      }),
      rescored_from: rescoredFrom,
    };
  }

  const engine = isObject(summary.engine) ? { ...summary.engine, ...recordedEngine(summary.engine), ...(isObject(summary.engine.engines) ? { engines: Object.fromEntries(Object.entries<any>(summary.engine.engines).map(([name, e]) => [name, recordedEngine(e)])) } : {}) } : summary.engine;
  const out: Obj = { ...summary, ...(engine === undefined ? {} : { engine }), ...m.summarize(rows), manifest };
  if (options.cases !== undefined) out.corpus_folder = corpusFolderOf(options.cases, root); // where the cases were read from this time
  if (typeof summary.label === "string") out.label = `${summary.label}-rescored`;
  return { summary: out, rows, dropped, changed, relabelled, legacy: reading.kind === "legacy" };
}

/** The name of the folder beside `dir` that holds its rescored result: `-rescored` before a repeat's `-rN`, else at the end. */
export function rescoredName(name: string): string {
  const m = /^(.*?)(-r\d+(?:-.+)?)$/.exec(name);
  return m ? `${m[1]}-rescored${m[2]}` : `${name}-rescored`;
}

/** A results folder (or its summary.json) read as a stored run. Refuses a folder that is still being written. */
export function readStored(path: string): Stored {
  let dir = resolve(path);
  if (existsSync(dir) && statSync(dir).isFile()) dir = dirname(dir);
  if (!existsSync(join(dir, "summary.json"))) throw new RescoreError(`${path} is not a results folder: it has no summary.json`);
  if (existsSync(join(dir, ".running"))) throw new RescoreError(`${path} is still being written: it holds a .running file`);
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
  return { dir, summary, rows };
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
