// The run manifest: what a run was made of, written into every summary.json as `manifest`, and the declaration (`Measurement`)
// through which each eval says how a stored case is scored again. compare, the matrix and scripts/rescore read a manifest through
// readManifest. See README.md, "Compare two runs".
//
// Runs are compared by the eval's `version` (in its src/measurement.ts), changed by hand when what the eval asks akm changes. A scorer
// fix or a relabelled case needs no new version: every run stores each case's raw output, and scripts/rescore scores it again.

import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { type EngineSetting, engineSettings, redactConfig, sha256Json, withoutEngineSettings } from "./provenance.ts";

/** The repository root, one folder above lib/. */
export const REPO_ROOT = resolve(import.meta.dir, "..");

export const MANIFEST_VERSION = 1;

/** The generation of the harness. It changes only when every eval is broken at once, which harness-v3 did. */
export const HARNESS_VERSION = 3;

type Obj = Record<string, any>;
const isObject = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const HEX = /^[0-9a-f]{64}$/;

// ---- the declaration ---------------------------------------------------------------------------------------------------------

/**
 * What an eval declares about itself. `Case` is one case with its labels, `Raw` the raw output of one case (what akm and the model
 * returned, in the fields the scorer reads), `Row` the scored row, one line of samples.jsonl.
 */
export interface Measurement<Case = any, Raw = any, Row extends Obj = Obj> {
  /** The eval's name, as `summary.eval` has it, and its folder under evals/ or benchmarks/. */
  eval: string;
  /** The version of what the eval asks akm, such as "0.2". Runs are compared by it. */
  version: string;
  /** The cases a summary's corpus holds now, with their labels, read from `root`. This is what a run is scored against again. Throws a message when the corpus cannot be read. */
  loadCases(root: string, summary: Obj): Case[];
  /** The case's id, which is the `id` of its row in samples.jsonl. */
  caseId(c: Case): string;
  /**
   * Everything the case presents to akm, as a JSON value that is digested. `context` is what the run adds for this case that is not in the
   * case (reflect: the searches it records for the note). Whatever changes what akm sees must be in here.
   */
  input(c: Case, context?: unknown): unknown;
  /** Everything the scorer judges the case by, as a JSON value that is digested. The scorer must read nothing of the case that is not in here. */
  labels(c: Case): unknown;
  /** The raw output recovered from a stored row, or the names of the fields it lacks. A run that lacks one cannot be scored again. */
  rawOf(row: Obj): { raw: Raw } | { missing: string[] };
  /** The scored row for a case and its raw output: the function the collector builds each row with. Pure. */
  score(c: Case, raw: Raw): Row;
  /** The case ended in an error and has no verdict. Errored cases are left out of the counts. */
  errored(row: Row): boolean;
  /** The fields of the summary that come from the scored rows: its counts and `metrics`. Pure. A rescored summary takes these anew. */
  summarize(rows: Row[]): Obj;
}

// ---- the folder of a custom corpus --------------------------------------------------------------------------------------------

/**
 * What a summary records as `corpus_folder` for a run on a custom corpus read from `folder`: the path from the repository root, written with `/`
 * and with no leading `./` or `..`, when the folder is inside the repository, else null. It is never an absolute path: a folder outside the
 * repository (your notes) can name what is in it. `scripts/rescore` reads the cases of a custom run from this folder, and takes `--cases DIR`
 * when it is null. A public run records null.
 */
export function corpusFolderOf(folder: string, root = REPO_ROOT): string | null {
  const rel = relative(root, resolve(root, folder));
  return rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? null : rel.split(sep).join("/");
}

// ---- the manifest ------------------------------------------------------------------------------------------------------------

/** The version of a part of a run. Manifests written before the version was set by hand also hold the digest of its files. */
export interface PartRef {
  version: string;
  sha256?: string;
}

export interface CaseDigest {
  input_sha256: string;
  label_sha256: string;
}

/** The case ids of a run: those it selected, and of those the ones that got a verdict and the ones that errored. A selected case in neither was not run. */
export interface Completion {
  selected: string[];
  scored: string[];
  errored: string[];
}

export interface RescoredFrom {
  /** The name of the results folder that was scored again. Never a path. */
  results: string;
  /** The scorer that scored it, when its manifest recorded one. */
  scorer?: PartRef | null;
  /** When it was scored again, an ISO date. */
  at: string;
  /** Case ids the original run had and the corpus no longer has. They are not in the rescored result. */
  dropped: string[];
}

export interface RunManifest {
  manifest_version: number;
  eval: string;
  corpus: string;
  collection: string | null;
  /** The mode of the eval that has one (consolidate --pool), null for the rest. Another mode is another set of cases. */
  mode: string | null;
  /** HARNESS_VERSION when the run was made. */
  harness_version: number;
  /** The eval's version. */
  collector: PartRef;
  /** Only in manifests written before the version was set by hand. */
  scorer?: PartRef;
  /** Every case the run selected, by id. */
  cases: Record<string, CaseDigest>;
  akm: { version: string | null; bin: string | null; build: string | null; build_fingerprint: string | null };
  /** The akm config the eval wrote without the model's settings (those are in `engines`), secrets redacted, and the digest of it. */
  config: { sha256: string | null; redacted: unknown };
  /** What a run was set to do that is not in the akm config. */
  settings: { strategy: string | null; config_patch_sha256: string | null; timeout_ms: number | null; seed: string | null };
  /** The settings of every engine the config uses. `endpoint` is the host only: never a path. */
  engines: Record<string, EngineSetting>;
  /** Settings that change what a run measures and belong to its scope, such as `embedder`: runs that differ in one are never compared. */
  treatment_hints: Record<string, string | number | boolean | null>;
  completion: Completion;
  /** Set only on a result made by scripts/rescore. */
  rescored_from?: RescoredFrom;
}

export interface ManifestInput<Case = any> {
  measurement: Pick<Measurement<Case>, "eval" | "version">;
  corpus: string;
  collection?: string | null;
  mode?: string | null;
  cases: Record<string, CaseDigest>;
  akm?: Partial<RunManifest["akm"]>;
  /** The akm config the eval wrote, whole: the manifest redacts it and leaves the model's settings out. */
  config?: unknown;
  /** The engines, when they are not those of `config` (a run read from a summary that recorded them). */
  engines?: Record<string, EngineSetting>;
  settings?: Partial<RunManifest["settings"]>;
  treatment_hints?: RunManifest["treatment_hints"];
  completion: Completion;
}

/** The manifest of a run. The caller puts it in the summary as `manifest`. */
export function buildManifest(input: ManifestInput): RunManifest {
  const redacted = input.config === undefined ? null : withoutEngineSettings(redactConfig(input.config));
  return {
    manifest_version: MANIFEST_VERSION,
    eval: input.measurement.eval,
    corpus: input.corpus,
    collection: input.collection ?? null,
    mode: input.mode ?? null,
    harness_version: HARNESS_VERSION,
    collector: { version: input.measurement.version },
    cases: input.cases,
    akm: { version: input.akm?.version ?? null, bin: input.akm?.bin ?? null, build: input.akm?.build ?? null, build_fingerprint: input.akm?.build_fingerprint ?? null },
    config: { sha256: redacted === null ? null : sha256Json(redacted), redacted },
    settings: { strategy: input.settings?.strategy ?? null, config_patch_sha256: input.settings?.config_patch_sha256 ?? null, timeout_ms: input.settings?.timeout_ms ?? null, seed: input.settings?.seed ?? null },
    engines: input.engines ?? (input.config === undefined ? {} : engineSettings(input.config).engines),
    treatment_hints: input.treatment_hints ?? {},
    completion: input.completion,
  };
}

/** The digests of the cases a run selected, by id. `context` gives what the run adds to a case's input (see Measurement.input). */
export function caseDigests<Case>(m: Pick<Measurement<Case>, "caseId" | "input" | "labels">, cases: Case[], context?: (c: Case) => unknown): Record<string, CaseDigest> {
  const out: Record<string, CaseDigest> = {};
  for (const c of cases) {
    const id = m.caseId(c);
    if (Object.hasOwn(out, id)) throw new Error(`the case ${id} is twice in the corpus`);
    out[id] = { input_sha256: sha256Json(m.input(c, context?.(c))), label_sha256: sha256Json(m.labels(c)) };
  }
  return out;
}

/** The completion of a run from its scored rows, in the order of `selected`. A selected case with no row was not run. */
export function completionOf<Row extends Obj>(m: Pick<Measurement<any, any, Row>, "errored">, selected: string[], rows: Row[]): Completion {
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const ran = selected.filter((id) => byId.has(id));
  return { selected, scored: ran.filter((id) => !m.errored(byId.get(id) as Row)), errored: ran.filter((id) => m.errored(byId.get(id) as Row)) };
}

// ---- the validator -----------------------------------------------------------------------------------------------------------

const isString = (x: unknown): x is string => typeof x === "string";
const nullable = (check: (x: unknown) => boolean) => (x: unknown): boolean => x === null || check(x);
const isHex = (x: unknown): boolean => isString(x) && HEX.test(x);
const isIdList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isString) && new Set(x).size === x.length;
/** A host as endpointHost writes it: scheme, host and port, with nothing after them. A path in a summary is what #65 closes. */
const isHost = (x: unknown): boolean => isString(x) && /^[a-z][a-z0-9+.-]*:\/\/[^/?#@\s]+$/i.test(x);

const isPart = (p: unknown): boolean => isObject(p) && isString(p.version) && p.version !== "" && (p.sha256 === undefined || isHex(p.sha256));

/** What is wrong with a manifest, as messages; empty when it is sound. This is the one validator: comparison, rescore and the replay tools all read a manifest through it. */
export function manifestProblems(x: unknown): string[] {
  if (!isObject(x)) return ["the manifest is not an object"];
  const out: string[] = [];
  if (x.manifest_version !== MANIFEST_VERSION) return [`manifest_version is ${JSON.stringify(x.manifest_version)}, and this harness reads ${MANIFEST_VERSION}`];
  if (!isString(x.eval) || x.eval === "") out.push("eval needs a name");
  if (!isString(x.corpus) || x.corpus === "") out.push("corpus needs a name");
  for (const k of ["collection", "mode"]) if (!nullable(isString)(x[k])) out.push(`${k} is a string or null`);
  if (!Number.isInteger(x.harness_version) || x.harness_version < 0) out.push("harness_version is a whole number");
  if (!isPart(x.collector)) out.push("collector needs a version");
  if (x.scorer !== undefined && !isPart(x.scorer)) out.push("scorer, when there is one, needs a version");
  const ids = isObject(x.cases) ? Object.keys(x.cases) : null;
  if (ids === null) out.push("cases is an object of case ids");
  else for (const id of ids) if (!isObject(x.cases[id]) || !isHex(x.cases[id].input_sha256) || !isHex(x.cases[id].label_sha256)) out.push(`the case ${id} needs an input_sha256 and a label_sha256`);
  if (!isObject(x.akm) || !["version", "bin", "build", "build_fingerprint"].every((k) => nullable(isString)(x.akm[k]))) out.push("akm needs version, bin, build and build_fingerprint, each a string or null");
  if (!isObject(x.config) || !nullable(isHex)(x.config.sha256) || !("redacted" in x.config)) out.push("config needs a sha256 (or null) and redacted");
  if (!isObject(x.settings) || !nullable(isString)(x.settings.strategy) || !nullable(isString)(x.settings.config_patch_sha256) || !nullable((n) => typeof n === "number")(x.settings.timeout_ms) || !nullable(isString)(x.settings.seed)) out.push("settings needs strategy, config_patch_sha256, timeout_ms and seed");
  if (!isObject(x.engines)) out.push("engines is an object of engine settings");
  else {
    for (const [name, e] of Object.entries<any>(x.engines)) {
      if (!isObject(e) || !nullable(isString)(e.model) || !nullable(isHost)(e.endpoint)) out.push(`the engine ${name} needs a model and an endpoint that is a host with no path`);
    }
  }
  if (!isObject(x.treatment_hints) || !Object.values(x.treatment_hints).every((v) => v === null || ["string", "number", "boolean"].includes(typeof v))) out.push("treatment_hints is an object of strings, numbers, booleans and nulls");
  const c = x.completion;
  if (!isObject(c) || !isIdList(c.selected) || !isIdList(c.scored) || !isIdList(c.errored)) out.push("completion needs the lists selected, scored and errored of case ids");
  else {
    if (ids !== null && c.selected.some((id: string) => !ids.includes(id))) out.push("completion.selected names a case that cases does not hold");
    if ([...c.scored, ...c.errored].some((id: string) => !c.selected.includes(id))) out.push("completion.scored and completion.errored name a case that was not selected");
    if (c.scored.some((id: string) => c.errored.includes(id))) out.push("a case is both scored and errored");
  }
  if (x.rescored_from !== undefined) {
    const r = x.rescored_from;
    if (!isObject(r) || !isString(r.results) || r.results.includes("/") || !isString(r.at) || !(r.scorer === undefined || nullable(isPart)(r.scorer)) || !isIdList(r.dropped)) out.push("rescored_from needs results (a folder name), scorer (or null), at and dropped");
  }
  return out;
}

export type ManifestReading = { kind: "manifest"; manifest: RunManifest } | { kind: "legacy" } | { kind: "invalid"; problems: string[] };

/** What compare, the matrix and scripts/rescore say of a run whose summary has no manifest. */
export const noManifest = (folder: string): string => `${folder} was made before akm-eval 0.2 (it has no manifest), so it cannot be compared or scored again: run it again`;

/**
 * What a summary says of how its run was made. A summary without `manifest` is legacy (made before akm-eval 0.2, see noManifest). One with a
 * manifest that is not sound, or that disagrees with the summary on the eval, corpus, collection or mode, is invalid.
 */
export function readManifest(summary: Obj): ManifestReading {
  if (!isObject(summary) || summary.manifest === undefined) return { kind: "legacy" };
  const problems = manifestProblems(summary.manifest);
  if (problems.length === 0) {
    const m = summary.manifest as RunManifest;
    for (const k of ["eval", "corpus", "collection", "mode"] as const) if (summary[k] !== undefined && (summary[k] ?? null) !== m[k]) problems.push(`the manifest says ${k} is ${JSON.stringify(m[k])} and the summary says ${JSON.stringify(summary[k])}`);
  }
  return problems.length > 0 ? { kind: "invalid", problems } : { kind: "manifest", manifest: summary.manifest as RunManifest };
}

// ---- finding an eval's declaration -------------------------------------------------------------------------------------------

const nodeRequire = createRequire(import.meta.url);

/** The folders that hold evals, under the repository root. */
export const EVAL_FOLDERS = ["evals", "benchmarks"] as const;

/** The path of an eval's declaration from the repository root, or null when the eval has none yet (it is not on the manifest). */
export function measurementPath(name: string, root = REPO_ROOT): string | null {
  for (const folder of EVAL_FOLDERS) {
    const rel = `${folder}/${name}/src/measurement.ts`;
    if (existsSync(join(root, rel))) return rel;
  }
  return null;
}

/** The names of the evals that declare a measurement, in order. */
export function measuredEvals(root = REPO_ROOT): string[] {
  const names: string[] = [];
  for (const folder of EVAL_FOLDERS) {
    const dir = join(root, folder);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) if (entry.isDirectory() && measurementPath(entry.name, root)) names.push(entry.name);
  }
  return names.sort();
}

/** The `MEASUREMENT` of an eval, loaded from the checkout at `root`, or null when the eval declares none. */
export function loadMeasurement(name: string, root = REPO_ROOT): Measurement | null {
  const rel = measurementPath(name, root);
  if (rel === null) return null;
  const file = join(root, rel);
  delete nodeRequire.cache[file]; // the file is read again, so a declaration edited since it was first loaded is the one that is used
  const mod = nodeRequire(file) as { MEASUREMENT?: Measurement };
  if (!mod.MEASUREMENT || mod.MEASUREMENT.eval !== name) throw new Error(`${rel} must export MEASUREMENT with eval "${name}"`);
  return mod.MEASUREMENT;
}
