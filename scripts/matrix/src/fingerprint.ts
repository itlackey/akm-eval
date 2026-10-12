// What a matrix job was made from, as one digest: its arguments, the bytes of every file they name, the corpus it reads (the public assets, or
// the custom corpus: its folder and, for a rewrite, its generated.json; for an eval that declares a measurement the cases count
// by what they present to akm, `MEASUREMENT.input`, and not by their labels), the model settings it runs with (the endpoints whole, path
// included), the akm it runs and the eval's code. The code of an eval that declares a measurement is its collector, as the run's
// manifest will record it (lib/manifest.ts): a change to its scorer, or to another eval, is no reason to run the job again, since a stored
// result is scored again when it is compared. A stage skips a job it already ran only when this digest is the same, so editing a config
// patch in place, regenerating the private assets, pointing MODEL_BASE_URL at another deployment, switching the akm checkout's branch or
// committing a change to an eval's collector runs the job again.
// See ../../../README.md ("Run a matrix").

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { akmBuild, dirtyFingerprint, parseCommand } from "../../../lib/akm/akm.ts";
import { REPO_ROOT, corpusFolderOf, loadMeasurement, lockedParts } from "../../../lib/manifest.ts";
import { endpointIdentity, sha256Json } from "../../../lib/provenance.ts";
import { canonical } from "../../compare/src/policy.ts";
import { type Job, type RunRecord, HARBOR, corpusOf, customCorpus, flagValue, hasFlag, readJson, runDirs, runnerFolder, unusableReason } from "./lib.ts";

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

export interface Fingerprint {
  /** The digest of the parts. */
  sha256: string;
  /** The digest of each part, by name: args, files, corpus, model, akm and the code (collector for an eval on the manifest, else harness). Enough to say which one changed, and nothing secret. */
  parts: Record<string, string>;
}

/** The flags whose value names a file or a folder the eval reads. A relative path is from the repository root, as the evals read it. */
const PATH_FLAGS = ["--config-patch", "--cases"];

/**
 * The digest of a file's bytes, or of a folder's files by path from the folder and bytes, or "missing". It does not depend on where the folder
 * is, and it follows a link to a folder, which an own corpus may be. A link that points nowhere is "unreadable" in the digest, a difference and not an error.
 * A folder's files named in `skip` (by file name, at any depth) are left out.
 */
function digestPath(root: string, path: string, skip: readonly string[] = []): string {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  if (!existsSync(abs)) return "missing";
  if (!statSync(abs).isDirectory()) return sha256(readFileSync(abs));
  const lines = (readdirSync(abs, { recursive: true }) as string[]).sort().flatMap((f) => {
    if (skip.includes(basename(f))) return [];
    try {
      return statSync(join(abs, f)).isFile() ? [`${f}\0${sha256(readFileSync(join(abs, f)))}\n`] : [];
    } catch {
      return [`${f}\0unreadable\n`];
    }
  });
  return sha256(lines.join(""));
}

// ---- the corpus a job reads ---------------------------------------------------------------------------------------------

const SEED = "private/seed";

/** The queries and qrels of an eval's retrieval assets: what `reflect --retrieval-queries` reads of the retrieval eval. */
const queries = (assets: string): string[] => [`${assets}/queries.jsonl`, `${assets}/qrels.jsonl`];

/**
 * What each eval reads for its public corpus, by path from the repository root: the folders and files its run.ts opens, so that an input edited
 * in place changes the fingerprint. A folder counts by the path and bytes of every file in it. The labels are among the bytes, except for the evals
 * of CASE_FILES, whose case files count by the input of each case instead (a relabelled case does not run the job again: a stored result is scored again).
 */
const PUBLIC: Record<string, (args: string[]) => string[]> = {
  nightly: () => ["evals/nightly/assets"],
  consolidate: () => ["evals/consolidate/assets"], // --pool is the public assets/pool
  distill: () => ["evals/distill/assets"],
  reflect: (args) => ["evals/reflect/assets", ...(hasFlag(args, "--retrieval-queries") ? queries("evals/retrieval/assets") : [])], // --retrieval-queries reads the queries and qrels of the retrieval eval's matching corpus
  promotion: () => ["evals/promotion/assets"],
  "judge-gate": () => ["evals/judge-gate/assets"],
  extract: () => ["evals/extract/assets"],
  retrieval: () => ["corpus/library", "evals/retrieval/assets"],
  "agent-ab": () => ["evals/agent-ab/tasks", "evals/agent-ab/libraries"],
  "terminal-bench": () => [LOCK, "corpus/library"], // the Harbor benchmark's tasks are pinned by its lock
  bakeoff: () => ["evals/bakeoff/assets"],
  longmemeval: () => ["benchmarks/longmemeval/assets/ASSETS.lock"], // the dataset it fetches is pinned by its lock, by revision and checksum
  skillret: () => ["benchmarks/skillret/assets/ASSETS.lock"], // the same, for both splits
};
const LOCK = "benchmarks/terminal-bench/assets/ASSETS.lock";

/**
 * The files of an eval's corpus that hold its cases, by file name, for the evals that declare a measurement and whose cases are small enough to read at
 * every stage. A case file mixes what the case presents to akm with the labels it is scored by, and a relabelled case needs no new run: so the corpus
 * counts by `MEASUREMENT.input` of every case, and by the bytes of its other files (the library, the rubric, the sessions). The cases
 * of agent-ab and terminal-bench have no labels (the verifier is part of the task), and those of longmemeval and skillret are a published dataset
 * pinned by a lock, so they count by their bytes or their lock. A corpus whose cases cannot be read counts by the bytes of every file.
 */
const CASE_FILES: Record<string, string[]> = {
  nightly: ["items.jsonl"],
  consolidate: ["cases.jsonl"], // --pool reads assets/pool, which counts by its bytes
  reflect: ["cases.jsonl"],
  distill: ["cases.json"],
  extract: ["cases.json"],
  "judge-gate": ["cases.jsonl"],
  promotion: ["cases.jsonl"],
  retrieval: ["queries.jsonl", "qrels.jsonl"],
  bakeoff: ["cases.json"],
};

/**
 * What an eval reads of its custom corpus beyond the generated.json beside the folder: `inside`, the part of the folder it
 * opens (terminal-bench takes the library of retrieval's rewrite and nothing else of it), and `more`, other files its runner opens.
 */
const CUSTOM_READS: Record<string, { inside?: string; more?: (args: string[]) => string[] }> = {
  reflect: { more: (args) => (hasFlag(args, "--retrieval-queries") ? queries("private/retrieval/assets") : []) },
  "judge-gate": { more: () => ["evals/judge-gate/assets/README.md"] }, // the custom cases take the public rubric
  extract: { more: () => ["private/extract/map.json", SEED] }, // its seed is read from the map, else the seed file
  "terminal-bench": { inside: "library", more: () => [LOCK] },
};

/** A path for the digest: from the repository root when it is inside it, else as it is (a custom corpus may be a folder anywhere). */
const fromRoot = (root: string, abs: string): string => corpusFolderOf(abs, root) ?? abs;

/**
 * What a job reads of its custom corpus: the folder as lib/corpus.ts resolves it (`--cases DIR`, or the rewrite in private/<eval>/assets), the
 * generated.json beside a folder called `assets` (./generate-assets writes it there), and for a corpus of your own private/seed. A folder inside
 * the corpus folder is covered by the folder.
 */
function customPaths(root: string, evalName: string, args: string[]): string[] {
  if (evalName === "skillret") return PUBLIC[evalName]?.(args) ?? []; // drawn from the dataset the lock pins: there is no folder
  const found = customCorpus(root, evalName, args);
  const reads = CUSTOM_READS[evalName];
  if (found === null) return reads?.more?.(args) ?? [];
  const folder = found.folder;
  const beside = basename(folder) === "assets" ? [join(dirname(folder), "generated.json")] : [];
  const read = reads?.inside ? [join(folder, reads.inside), join(folder, "generated.json")] : [folder];
  return [...[...read, ...beside].map((p) => fromRoot(root, p)), ...(found.rewrite ? [] : [SEED]), ...(reads?.more?.(args) ?? [])];
}

/** The paths, from the repository root, of what a job reads for the corpus its flags name: the public one, the custom one, or both for `--corpus all`. A path outside the repository (a custom folder elsewhere) is absolute. */
export function corpusPaths(evalName: string, args: string[], root: string = REPO_ROOT): string[] {
  const publicPaths = PUBLIC[evalName];
  if (publicPaths === undefined) return [];
  const chosen = corpusOf(evalName, args);
  const names = chosen === "all" ? ["public", "custom"] : [chosen];
  return [...new Set(names.flatMap((name) => (name === "public" ? publicPaths(args) : name === "custom" ? customPaths(root, evalName, args) : [])))].sort();
}

/** The collections of the retrieval eval, each of which has queries of its own. */
const COLLECTIONS = ["library", "books"];

/**
 * The digest of the inputs of the cases a job reads, `MEASUREMENT.input` of each case by id, for the corpora its flags name; or null for an eval that is
 * not in CASE_FILES, and when the cases cannot be read (the job will stop on that, and its fingerprint is then made of the bytes of the corpus). Nothing in
 * it is a label. What a run adds to the input of a case (reflect's searches, the library of retrieval) is covered by the bytes of the other files.
 */
export function inputsDigest(root: string, evalName: string, args: string[]): string | null {
  if (CASE_FILES[evalName] === undefined) return null;
  try {
    const measurement = loadMeasurement(evalName, root);
    if (!measurement) return null;
    const chosen = corpusOf(evalName, args);
    // the summary of a run on each corpus, as loadCases reads it, and the folder that holds its cases
    const corpora: { summary: Record<string, unknown>; folder: string }[] = [];
    if (chosen === "public" || chosen === "all") corpora.push({ summary: { corpus: "public" }, folder: join(root, runnerFolder(evalName), evalName, "assets") });
    if (chosen === "custom" || chosen === "all") {
      const custom = customCorpus(root, evalName, args);
      if (!custom) return null;
      corpora.push({ summary: { corpus: "custom", corpus_folder: custom.folder }, folder: custom.folder });
    }
    // retrieval has a table of queries for each collection; the books are in a folder of the corpus that a corpus of your own may not have
    const variants = corpora.flatMap(({ summary, folder }) =>
      evalName === "retrieval" ? COLLECTIONS.filter((c) => c === "library" || existsSync(join(folder, "books", "queries.jsonl"))).map((collection) => ({ ...summary, collection })) : [summary],
    );
    return sha256(canonical(variants.map((s) => [s.corpus, s.collection ?? "", measurement.loadCases(root, s).map((c) => [measurement.caseId(c), sha256Json(measurement.input(c))])])));
  } catch {
    return null;
  }
}

/**
 * The digest of the corpus a job reads: each path of corpusPaths, by name, with the digest of its bytes, and the digest of the inputs of its cases where
 * `inputs` has one, in which case the files that hold the cases are left out of the bytes (CASE_FILES). It holds no content and no checkout path. A folder
 * outside the repository is named by its last part only.
 */
const corpusDigest = (root: string, evalName: string, args: string[], inputs: string | null): string =>
  sha256(
    corpusPaths(evalName, args, root)
      .map((path) => `${isAbsolute(path) ? `outside/${basename(path)}` : path}\0${digestPath(root, path, inputs === null ? [] : CASE_FILES[evalName] ?? [])}\n`)
      .join("") + (inputs === null ? "" : `inputs\0${inputs}\n`),
  );

/** The settings of a `.env` the way lib/env.sh reads them: KEY=value lines, `export ` allowed, quotes dropped, an unquoted value ends at ` #`, a quoted one at its closing quote and a ` #` comment after it; the first line of a key wins. */
export function readDotEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    let line = raw.replace(/\r$/, "").trimStart();
    if (line === "" || line.startsWith("#")) continue;
    line = line.replace(/^export /, "").trimStart();
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trimEnd();
    let value = line.slice(eq + 1);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    const quoted = /^"([^"]*)"(?:\s+#[^]*|\s*)$/.exec(value) ?? /^'([^']*)'(?:\s+#[^]*|\s*)$/.exec(value) ?? /^"([^]*)"$/.exec(value) ?? /^'([^]*)'$/.exec(value);
    if (quoted) value = quoted[1];
    else if (!value.startsWith('"') && !value.startsWith("'")) {
      const stripped = value.replace(/\s#[^]*$/, "");// env.sh trims the space before a comment, and leaves the end of a value that has none
      if (stripped !== value) value = stripped.trimEnd();
    }
    if (!(key in out)) out[key] = value;
  }
  return out;
}

type Env = Record<string, string | undefined>;

/** The environment an eval's `run` script sees: the caller's, then the repository's .env for what the caller did not set. */
const effectiveEnv = (root: string, env: Env): Env => ({ ...readDotEnv(join(root, ".env")), ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) });

/** The endpoint a run calls, as lib/provenance.ts identifies it: scheme, host, port and path, with no credentials. A value that is no URL is told apart by a digest of it. */
const endpointOf = (url: string | undefined): string | null => endpointIdentity(url) ?? (url?.trim() ? `unreadable ${sha256(url).slice(0, 12)}` : null);

/**
 * The model settings a run uses, without a key: the model and the whole endpoint of the model under test and of the judge, and the digest of
 * models.json (it holds no keys). The Harbor evals also read OPENAI_BASE_URL, which stands in for an empty MODEL_BASE_URL (lib/harbor/harbor.ts).
 */
function modelSettings(root: string, env: Env, evalName: string): Record<string, string | null> {
  return {
    MODEL_NAME: env.MODEL_NAME ?? null,
    MODEL_BASE_URL: endpointOf(env.MODEL_BASE_URL),
    JUDGE_MODEL: env.JUDGE_MODEL ?? null,
    JUDGE_BASE_URL: endpointOf(env.JUDGE_BASE_URL),
    "models.json": existsSync(join(root, "models.json")) ? digestPath(root, "models.json") : null,
    ...(HARBOR.includes(evalName) ? { OPENAI_BASE_URL: endpointOf(env.OPENAI_BASE_URL) } : {}),
  };
}

const git = (dir: string, args: string[]): { ok: boolean; out: string } => {
  const r = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "ignore" });
  return { ok: r.exitCode === 0, out: r.stdout.toString() };
};

/** `git describe --always --dirty` of a folder, or null when it is not a checkout. */
const describe = (dir: string): string | null => {
  const r = git(dir, ["describe", "--always", "--dirty"]);
  return r.ok ? r.out.trim() : null;
};

const expandHome = (command: string): string => command.replace(/(^|\s)~\//g, `$1${homedir()}/`);

/**
 * What `akm --version` prints for a command (empty: `akm`), or null when it cannot be run. An installed release is no git checkout and has no
 * build, so the command is the same before and after an upgrade and the version is all that tells the two apart.
 */
function printedVersion(command: string): string | null {
  try {
    const run = Bun.spawnSync([...parseCommand(command || "akm"), "--version"], { stdin: "ignore", stdout: "pipe", stderr: "ignore", timeout: 30_000 });
    return run.exitCode === 0 ? run.stdout.toString().trim() || null : null;
  } catch {
    return null; // not installed, or not a command
  }
}

/**
 * The akm a job runs. For an eval that runs akm on this machine: `--akm`, else AKM_BIN of the environment or .env, else `akm`, with the build
 * that command identifies (akmBuild() of lib/akm/akm.ts, which every eval records as `akm_build` and `akm_build_fingerprint`) and the version it
 * prints. For a Harbor eval, `--akm` is a release (the string) or a checkout (its folder, with the build of that checkout and its uncommitted
 * changes).
 */
function akmIdentity(args: string[], evalName: string, env: Env): { command: string; build: string | null; fingerprint: string | null; version?: string | null } {
  const flag = flagValue(args, "--akm");
  if (HARBOR.includes(evalName)) {
    const folder = flag ? expandHome(flag) : "";
    const checkout = folder !== "" && existsSync(folder) && statSync(folder).isDirectory();
    return { command: flag ?? "", build: checkout ? describe(folder) : null, fingerprint: checkout ? dirtyFingerprint(folder) : null };
  }
  const command = expandHome((flag ?? env.AKM_BIN ?? "").trim());
  const saved = process.env.AKM_BIN;
  try {
    if (command) process.env.AKM_BIN = command;
    else delete process.env.AKM_BIN;
    const { akm_bin, akm_build, akm_build_fingerprint } = akmBuild();
    return { command: akm_bin, build: akm_build, fingerprint: akm_build_fingerprint, version: printedVersion(command) };
  } finally {
    if (saved === undefined) delete process.env.AKM_BIN;
    else process.env.AKM_BIN = saved;
  }
}

/** This repository's code as the job runs it: the commit, and the digest of the changes to tracked files that are not committed. */
function repositoryCode(root: string): string {
  const head = git(root, ["rev-parse", "HEAD"]);
  if (!head.ok) return "not a git checkout";
  const diff = git(root, ["diff", "HEAD"]);
  return `${head.out.trim()}${diff.ok && diff.out !== "" ? `+${sha256(diff.out)}` : ""}`;
}

/**
 * The collector of an eval that declares a measurement and has a lock entry, as the manifest of the run will record it: the harness version, and the
 * collector's version and digest (lib/manifest.ts; the same `lockedParts` the run takes them from). The scorer is left out on purpose: a scorer change
 * leaves a stored result as it was, and the decision scores both sides again. Null for any other eval, whose code is then the repository's.
 */
function collectorIdentity(root: string, evalName: string): string | null {
  try {
    const m = loadMeasurement(evalName, root);
    if (!m) return null;
    const parts = lockedParts(m, root);
    return canonical({ harness_version: parts.harness_version, ...parts.collector });
  } catch {
    return null; // no lock entry yet, or a declaration that cannot be read: the run itself stops on it
  }
}

/** The fingerprint of a job: see the header. `env` is the environment the job runs in, the matrix process's by default. */
export function fingerprintOf(root: string, job: Pick<Job, "args" | "row">, env: Env = process.env): Fingerprint {
  const full = effectiveEnv(root, env);
  // the inputs of the cases of the corpus, where the eval has them: its case files then count by those, in the folder --cases names too
  const inputs = inputsDigest(root, job.row.eval, job.args);
  const caseFiles = inputs === null ? [] : CASE_FILES[job.row.eval] ?? [];
  const files = PATH_FLAGS.flatMap((flag) => {
    const value = flagValue(job.args, flag);
    return value === undefined ? [] : [`${flag} ${digestPath(root, value, flag === "--cases" ? caseFiles : [])}`];
  });
  const parts: Record<string, string> = {
    args: sha256(canonical(job.args)),
    files: sha256(canonical(files)),
    corpus: corpusDigest(root, job.row.eval, job.args, inputs),
    model: sha256(canonical(modelSettings(root, full, job.row.eval))),
    akm: sha256(canonical(akmIdentity(job.args, job.row.eval, full))),
  };
  // An eval on the manifest is made from its collector, the others from this repository's code.
  const collector = collectorIdentity(root, job.row.eval);
  if (collector !== null) parts.collector = sha256(collector);
  else parts.harness = sha256(repositoryCode(root));
  return { sha256: sha256(canonical(parts)), parts };
}

const NAMES: Record<string, string> = { args: "its arguments", files: "a file its arguments name (a config patch or a cases folder)", corpus: "the corpus it reads (the public assets, or the folder and generated.json of the custom corpus)", model: "the model settings (MODEL_NAME, the endpoints with their paths, the judge, models.json, OPENAI_BASE_URL for a Harbor eval)", akm: "the akm (AKM_BIN or --akm, or the build or version it runs)", harness: "this repository's code", collector: "the eval's collector (the code that decides what akm is asked, its version and the harness version)" };

/** Whether a stage may skip a job it already ran, and when not, why it runs again (empty for a job that was never run). */
export function resumable(root: string, prior: RunRecord | undefined, job: Pick<Job, "label" | "args">, fp: Fingerprint): { skip: boolean; why: string } {
  const again = (why: string) => ({ skip: false, why });
  if (!prior) return again("");
  if (prior.exit_code !== 0) return again(`its last run exited ${prior.exit_code}`);
  if (prior.label !== job.label || JSON.stringify(prior.args) !== JSON.stringify(job.args)) return again("its arguments changed");
  // A record from before a part existed (the corpus) cannot vouch for it, so it runs once more.
  if (!prior.fingerprint || !prior.fingerprint_parts || Object.keys(fp.parts).some((k) => !(k in prior.fingerprint_parts!))) return again("its last run did not record what it was made from");
  if (prior.fingerprint !== fp.sha256) {
    const changed = Object.keys(fp.parts).filter((k) => prior.fingerprint_parts![k] !== fp.parts[k]).map((k) => NAMES[k] ?? k);
    return again(`${changed.join(" and ") || "what it was made from"} changed since its last run`);
  }
  if (prior.results.length === 0) return again("its last run wrote no result");
  for (const ref of prior.results) {
    const file = join(root, ref.file);
    const s = readJson(file);
    if (s === null || runDirs(file, s, ref.kind).some((d) => readJson(join(d, "summary.json")) === null)) return again(`its result file ${ref.file} is missing or cannot be read`);
  }
  const unusable = unusableReason(root, prior);
  return unusable ? again(`its last result is no result: the run ${unusable}`) : { skip: true, why: "" };
}
