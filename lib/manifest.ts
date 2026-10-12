// The run manifest: one typed, versioned statement of what a run was made of, written into every summary.json as `manifest`, and the
// declaration (`Measurement`) through which each eval says which of its files collect, which score, and how a stored case is scored again.
// Everything that decides whether two runs are comparable reads the manifest through readManifest, the one validator. See README.md ("How
// results stay comparable") and MEASUREMENT_CHANGELOG.md.
//
// A run has three parts, and each kind of change invalidates a different one:
//
//   collection   the cases go into a sandbox, akm is called with a config and a model, and its outputs come back. It needs akm and a model.
//                Its code is the COLLECTOR. A change to the collector makes earlier raw outputs incomparable: it is versioned, gated by
//                MEASUREMENT.lock, and compared only when declared as the treatment.
//   raw outputs  everything akm and the model returned for each case, stored in samples.jsonl.
//   scoring      the checks turn each case's raw output, with the case's labels, into a row and then metrics. It needs no akm. Its code is the
//                SCORER. A change to the scorer, or a relabelled case, invalidates no run: scripts/rescore scores every stored run again.
//
// THE CONTRACT OF AN EVAL (copy evals/reflect, the first one on it):
//
//   1. src/score.ts (the scorer): pure and deterministic. `makeRow(case, raw)` turns a case and its raw output into a row, and `metrics(rows)`
//      turns rows into the summary's metrics. It imports nothing that collects.
//   2. src/collect.ts (the collector): builds the sandbox and the akm config, runs the commands, and builds each row with the scorer's
//      `makeRow`. It stores in the row every field of the raw output that the scorer reads, so the row can be scored again without akm.
//   3. src/measurement.ts: `export const MEASUREMENT: Measurement`, the declaration below. It wires the two and is itself in neither digest.
//   4. src/run.ts writes `manifest: buildManifest(...)` into summary.json, after `lockedParts(MEASUREMENT)` at the start of the run. A run on a
//      custom corpus also writes `corpus_folder: corpusFolderOf(folder)`, and `loadCases(root, summary)` reads the cases of such a run from
//      `summary.corpus_folder` (scripts/rescore sets it from `--cases DIR` when the run could not record it).
//   5. golden/: raw outputs with their expected rows, and src/golden.test.ts, which runs `goldenProblems` (lib/golden.ts has the layout).
//   6. MEASUREMENT.lock has an entry for the eval: `scripts/measurement/run bump <eval> collector --reason "..."` writes the first one.
//   7. Tests read versions from `lockedParts(MEASUREMENT)`, never as literals: a bump is routine and must not break them. (The golden
//      files are bound to the scorer version on purpose; a scorer bump asks for UPDATE_GOLDEN=1.)
//
// A pure refactor that keeps every score still changes the scorer digest: it passes the golden test, and bumps the scorer with the reason
// "no score change".
//
// The version of a part is a string "MAJOR.MINOR" of whole numbers (isPartVersion), "0.1" at the first lock entry. A bump raises the minor
// number (nextVersion: "0.1" to "0.2", "0.9" to "0.10"); there is no bump of the major number yet. "0.0" (UNVERSIONED) is the collector of a
// result collected before harness-v3. Versions are compared for equality, and ordered (compareVersions) only to list them.

import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { chain, checkListed, importClosure } from "./closure.ts";
import { type EngineSetting, engineSettings, manifestDigest, redactConfig, sha256File, sha256Json, withoutEngineSettings } from "./provenance.ts";

/** The repository root, one folder above lib/. */
export const REPO_ROOT = resolve(import.meta.dir, "..");

export const MANIFEST_VERSION = 1;
export const LOCK_FILE = "MEASUREMENT.lock";

// ---- the version of a part ---------------------------------------------------------------------------------------------------

/**
 * The version of a collector or a scorer: a string "MAJOR.MINOR" of whole numbers, such as "0.1", shown as "v0.1". Two versions are the
 * same when the strings are the same, and a number has no leading zero, so "0.1" and "0.01" cannot both stand for one version.
 */
export function isPartVersion(x: unknown): x is string {
  return typeof x === "string" && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(x);
}

/** The version both parts of an eval start at, in its first lock entry. */
export const FIRST_VERSION = "0.1";

/** The collector version of a result collected before harness-v3 (a legacy run that scripts/rescore scored again): nobody versioned its code. */
export const UNVERSIONED = "0.0";

/** The version a bump gives a part: the minor number goes up by one ("0.1" to "0.2", "0.9" to "0.10"). There is no bump of the major number yet. */
export function nextVersion(version: string): string {
  if (!isPartVersion(version)) throw new Error(`${JSON.stringify(version)} is not a part version: it is "MAJOR.MINOR" of whole numbers, such as "0.1"`);
  const [major, minor] = version.split(".");
  return `${major}.${Number(minor) + 1}`;
}

/** Orders two part versions: negative when `a` is older than `b`, 0 when they are the same, positive when `a` is newer. The major number first, then the minor, as numbers. */
export function compareVersions(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0] = a.split(".").map(Number);
  const [bMajor = 0, bMinor = 0] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

type Obj = Record<string, any>;
const isObject = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const HEX = /^[0-9a-f]{64}$/;

// ---- the declaration ---------------------------------------------------------------------------------------------------------

/**
 * What an eval declares about itself. `Case` is one case with its labels, as the eval loads it. `Raw` is the raw output of one case: what
 * the collector got back from akm and the model, in the fields the scorer reads. `Row` is the scored row, one line of samples.jsonl.
 *
 * The three digests the manifest holds come from here:
 *  - `collector.sha256` is the digest of the files of the collector, `scorer.sha256` that of the files of the scorer. The lists are entry
 *    points: a part covers the files it lists and every file of the repository they import, and those import (lib/closure.ts), so an edit
 *    to a helper that is only reached through an import still changes the digest. MEASUREMENT.lock records the files that were covered.
 *    A file is in one part: a scorer digest must not change when only collector code changes, and the other way round. So the collector
 *    stops at the scorer's files (a collector that imports `makeRow` from score.ts does not take the scorer's changes), and a scorer that
 *    reaches a file of the collector is refused. Shared code in lib/ is listed in the list of the part that runs it (lib/akm/akm.ts is the
 *    collector of every eval that drives akm).
 *  - `input_sha256` of a case digests `input(case)`: what the case presents to akm. A changed input makes the case a different case.
 *  - `label_sha256` of a case digests `labels(case)`: what the scorer judges it by. A changed label means the run is scored again.
 */
export interface Measurement<Case = any, Raw = any, Row extends Obj = Obj> {
  /** The eval's name, as `summary.eval` has it, and its folder under evals/ or benchmarks/. */
  eval: string;
  /** The entry points of the files that decide what akm is asked and what is recorded of its answer, from the repository root: the eval's run code, the sandbox and the config it builds, and the lib/ files it runs on. The files they import are covered too. */
  collector: string[];
  /** The entry points of the files that turn a raw output into a row and rows into metrics, from the repository root. The files they import are covered too. Not the labels (the cases): those have their digest per case. */
  scorer: string[];
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
  /**
   * For a run from before the manifest (a legacy summary): why its rows cannot be scored against the cases here, or undefined when they can.
   * The run read other cases than the ones in the repository now (compare its `assets_sha256`), or used something its rows do not record.
   * A run with a manifest does not need it: its cases carry their digests.
   */
  legacyProblem?(root: string, summary: Obj): string | undefined;
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

// ---- the lock ----------------------------------------------------------------------------------------------------------------

/** One part of an eval as MEASUREMENT.lock records it. `files` is the list the digest was made of, so a review can see what a bump covers. */
export interface LockPart {
  version: string;
  sha256: string;
  files: string[];
}

export interface Lock {
  lock_version: 1;
  /** The generation of the measurement foundation. It changes only by a deliberate break of every eval (`bump harness`). */
  harness_version: number;
  evals: Record<string, { collector: LockPart; scorer: LockPart }>;
}

/** MEASUREMENT.lock of the checkout at `root`. Throws a message when it is missing or is not a lock. */
export function readLock(root = REPO_ROOT): Lock {
  const file = join(root, LOCK_FILE);
  if (!existsSync(file)) throw new Error(`${LOCK_FILE} is missing from ${root}`);
  let lock: unknown;
  try {
    lock = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${LOCK_FILE} is not valid JSON`);
  }
  const part = (p: unknown): boolean => isObject(p) && isPartVersion(p.version) && p.version !== UNVERSIONED && typeof p.sha256 === "string" && HEX.test(p.sha256) && Array.isArray(p.files) && p.files.every((f: unknown) => typeof f === "string");
  if (!isObject(lock) || lock.lock_version !== 1 || !Number.isInteger(lock.harness_version) || !isObject(lock.evals)) throw new Error(`${LOCK_FILE} is not a lock: it needs lock_version 1, a harness_version and evals`);
  for (const [name, e] of Object.entries(lock.evals)) if (!isObject(e) || !part(e.collector) || !part(e.scorer)) throw new Error(`${LOCK_FILE} has a bad entry for ${name}: collector and scorer each need a version ("MAJOR.MINOR", such as "0.1"), a sha256 and files`);
  return lock as unknown as Lock;
}

/** The digest of the files of a part, by path from `root` and content, in the order of the paths. Throws a message naming a file that is missing or not a path inside the repository. */
export function partSha256(files: string[], root = REPO_ROOT): string {
  if (files.length === 0) throw new Error("a part of a measurement needs at least one file");
  const seen = new Set<string>();
  return manifestDigest(
    files.map((file) => {
      checkListed(file, root);
      if (seen.has(file)) throw new Error(`${file} is listed twice in one part`);
      seen.add(file);
      return [file, sha256File(join(root, file))];
    }),
  );
}

/** One part of an eval as the files are now: the files it covers, which are the ones it lists and everything they import, and the digest of them. */
export interface ResolvedPart {
  files: string[];
  sha256: string;
}

/**
 * The files the two parts of an eval cover, and their digests. A file may be listed in one part only. The collector stops at the files
 * the scorer lists, so a collector that calls the scorer's `makeRow` does not take the scorer's changes. Throws when the scorer reaches a
 * file that the collector covers: a scorer must not depend on collection.
 */
export function resolvedParts(m: Pick<Measurement, "eval" | "collector" | "scorer">, root = REPO_ROOT): { collector: ResolvedPart; scorer: ResolvedPart } {
  const both = m.collector.filter((f) => m.scorer.includes(f));
  if (both.length > 0) throw new Error(`${m.eval}: ${both.join(", ")} is in both the collector and the scorer. A file belongs to one part, so a change to it invalidates one thing.`);
  const scorer = importClosure(m.scorer, root);
  const collector = importClosure(m.collector, root, new Set(m.scorer));
  const shared = scorer.files.filter((f) => collector.from.has(f));
  if (shared.length > 0) {
    const named = shared.slice(0, 3).map((f) => `${f} (the scorer reaches it as ${chain(scorer, f)}, the collector as ${chain(collector, f)})`);
    throw new Error(
      `${m.eval}: the scorer reaches ${named.join("; ")}${shared.length > 3 ? ` and ${shared.length - 3} more` : ""}, which the collector covers. ` +
        "A scorer must not depend on collection: scripts/rescore runs it without akm, and a change to collector code must not change the scorer's digest. Keep what the scorer needs in files that only it imports.",
    );
  }
  return { collector: { files: collector.files, sha256: partSha256(collector.files, root) }, scorer: { files: scorer.files, sha256: partSha256(scorer.files, root) } };
}

/** The files each part of the eval covers now, imports included. */
export function measuredFiles(m: Pick<Measurement, "eval" | "collector" | "scorer">, root = REPO_ROOT): { collector: string[]; scorer: string[] } {
  const parts = resolvedParts(m, root);
  return { collector: parts.collector.files, scorer: parts.scorer.files };
}

/** The two parts of an eval as the files are now: the version the lock records, and the digest of the files as they are. */
export interface Parts {
  collector: { version: string; sha256: string };
  scorer: { version: string; sha256: string };
  harness_version: number;
}

/**
 * The versions the lock gives the eval and the digests of its files now. A digest that is not the lock's means the code was edited
 * without a bump: `scripts/measurement/run check` fails on it, and a run made from that tree records the digest it has. Throws, with
 * what to run, when the lock has no entry for the eval, so a run stops before it collects anything.
 */
export function lockedParts(m: Pick<Measurement, "eval" | "collector" | "scorer">, root = REPO_ROOT): Parts {
  const lock = readLock(root);
  const entry = lock.evals[m.eval];
  if (!entry) throw new Error(`${LOCK_FILE} has no entry for ${m.eval}. Add it with: scripts/measurement/run bump ${m.eval} collector --reason "first lock entry"`);
  const now = currentDigests(m, root);
  return { collector: { version: entry.collector.version, sha256: now.collector }, scorer: { version: entry.scorer.version, sha256: now.scorer }, harness_version: lock.harness_version };
}

/** The digests of the two parts of an eval as the files are now, whatever the lock says. */
export function currentDigests(m: Pick<Measurement, "eval" | "collector" | "scorer">, root = REPO_ROOT): { collector: string; scorer: string } {
  const parts = resolvedParts(m, root);
  return { collector: parts.collector.sha256, scorer: parts.scorer.sha256 };
}

// ---- the manifest ------------------------------------------------------------------------------------------------------------

export interface PartRef {
  version: string;
  sha256: string;
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
  /** The scorer that scored it, null when it had no manifest (a run from before harness-v3). */
  scorer: PartRef | null;
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
  /** The generation of the measurement foundation, from MEASUREMENT.lock. */
  harness_version: number;
  collector: PartRef;
  scorer: PartRef;
  /** Every case the run selected, by id. */
  cases: Record<string, CaseDigest>;
  akm: { version: string | null; bin: string | null; build: string | null; build_fingerprint: string | null };
  /** The akm config the eval wrote without the model's settings (those are in `engines`), secrets redacted, and the digest of it. */
  config: { sha256: string | null; redacted: unknown };
  /** What a run was set to do that is not in the akm config. */
  settings: { strategy: string | null; config_patch_sha256: string | null; timeout_ms: number | null; seed: string | null };
  /** The settings of every engine the config uses. `endpoint` is the host only and `endpoint_id` the digest of the endpoint's identity: never a path. */
  engines: Record<string, EngineSetting>;
  /** Settings that change what a run measures and belong to its scope, such as `embedder`: runs that differ in one are never compared. */
  treatment_hints: Record<string, string | number | boolean | null>;
  completion: Completion;
  /** Set only on a result made by scripts/rescore. */
  rescored_from?: RescoredFrom;
}

export interface ManifestInput<Case = any> {
  measurement: Pick<Measurement<Case>, "eval" | "collector" | "scorer">;
  /** The parts as `lockedParts` gave them at the start of the run. */
  parts: Parts;
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
    harness_version: input.parts.harness_version,
    collector: input.parts.collector,
    scorer: input.parts.scorer,
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

function partProblems(name: string, p: unknown, out: string[]): void {
  if (!isObject(p) || !isPartVersion(p.version) || !isHex(p.sha256)) out.push(`${name} needs a version ("MAJOR.MINOR", such as "0.1") and a sha256 digest`);
}

/** What is wrong with a manifest, as messages; empty when it is sound. This is the one validator: comparison, rescore and the replay tools all read a manifest through it. */
export function manifestProblems(x: unknown): string[] {
  if (!isObject(x)) return ["the manifest is not an object"];
  const out: string[] = [];
  if (x.manifest_version !== MANIFEST_VERSION) return [`manifest_version is ${JSON.stringify(x.manifest_version)}, and this harness reads ${MANIFEST_VERSION}`];
  if (!isString(x.eval) || x.eval === "") out.push("eval needs a name");
  if (!isString(x.corpus) || x.corpus === "") out.push("corpus needs a name");
  for (const k of ["collection", "mode"]) if (!nullable(isString)(x[k])) out.push(`${k} is a string or null`);
  if (!Number.isInteger(x.harness_version) || x.harness_version < 0) out.push("harness_version is a whole number");
  partProblems("collector", x.collector, out);
  partProblems("scorer", x.scorer, out);
  const ids = isObject(x.cases) ? Object.keys(x.cases) : null;
  if (ids === null) out.push("cases is an object of case ids");
  else for (const id of ids) if (!isObject(x.cases[id]) || !isHex(x.cases[id].input_sha256) || !isHex(x.cases[id].label_sha256)) out.push(`the case ${id} needs an input_sha256 and a label_sha256`);
  if (!isObject(x.akm) || !["version", "bin", "build", "build_fingerprint"].every((k) => nullable(isString)(x.akm[k]))) out.push("akm needs version, bin, build and build_fingerprint, each a string or null");
  if (!isObject(x.config) || !nullable(isHex)(x.config.sha256) || !("redacted" in x.config)) out.push("config needs a sha256 (or null) and redacted");
  if (!isObject(x.settings) || !nullable(isString)(x.settings.strategy) || !nullable(isString)(x.settings.config_patch_sha256) || !nullable((n) => typeof n === "number")(x.settings.timeout_ms) || !nullable(isString)(x.settings.seed)) out.push("settings needs strategy, config_patch_sha256, timeout_ms and seed");
  if (!isObject(x.engines)) out.push("engines is an object of engine settings");
  else {
    for (const [name, e] of Object.entries<any>(x.engines)) {
      if (!isObject(e) || !nullable(isString)(e.model) || !nullable(isHost)(e.endpoint) || !nullable(isHex)(e.endpoint_id)) out.push(`the engine ${name} needs a model, an endpoint that is a host with no path, and an endpoint_id digest`);
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
    if (!isObject(r) || !isString(r.results) || r.results.includes("/") || !isString(r.at) || !nullable((p) => isObject(p) && isPartVersion(p.version) && isHex(p.sha256))(r.scorer) || !isIdList(r.dropped)) out.push("rescored_from needs results (a folder name), scorer (or null), at and dropped");
  }
  return out;
}

export type ManifestReading = { kind: "manifest"; manifest: RunManifest } | { kind: "legacy" } | { kind: "invalid"; problems: string[] };

/**
 * What a summary says of how its run was made. A summary without `manifest` is legacy (written before harness-v3): comparable only as
 * exploratory. One with a manifest that is not sound, or that disagrees with the summary on the eval, corpus, collection or mode, is invalid.
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
