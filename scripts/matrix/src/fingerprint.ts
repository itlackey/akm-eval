// What a matrix job was made from, as one digest: its arguments, the bytes of every file they name, the corpus it reads (the public assets, the
// private assets that ./generate-assets made with their generated.json, or an own corpus), the model settings it runs with (the endpoints
// whole, path included), the akm it runs and this repository's code. A stage skips a job it already ran only when this digest is the same, so
// editing a config patch in place, regenerating the private assets, pointing MODEL_BASE_URL at another deployment, switching the akm
// checkout's branch or committing a change to an eval runs the job again.
// See ../../../README.md ("Run a matrix").

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { akmBuild, dirtyFingerprint } from "../../../lib/akm/akm.ts";
import { endpointIdentity } from "../../../lib/provenance.ts";
import { canonical } from "../../compare/src/policy.ts";
import { type Job, type RunRecord, HARBOR, flagValue, hasFlag, readJson, runDirs, unusableReason } from "./lib.ts";

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

export interface Fingerprint {
  /** The digest of the parts. */
  sha256: string;
  /** The digest of each part, by name: args, files, corpus, model, akm and harness. Enough to say which one changed, and nothing secret. */
  parts: Record<string, string>;
}

/** The flags whose value names a file or a folder the eval reads. A relative path is from the repository root, as the evals read it. */
const PATH_FLAGS = ["--config-patch", "--cases"];

/**
 * The digest of a file's bytes, or of a folder's files by path from the folder and bytes, or "missing". It does not depend on where the folder
 * is, and it follows a link to a folder, which an own corpus may be. A link that points nowhere is "unreadable" in the digest, a difference and not an error.
 */
function digestPath(root: string, path: string): string {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  if (!existsSync(abs)) return "missing";
  if (!statSync(abs).isDirectory()) return sha256(readFileSync(abs));
  const lines = (readdirSync(abs, { recursive: true }) as string[]).sort().flatMap((f) => {
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
/** The private assets that ./generate-assets makes for an eval: its assets folder, and generated.json, which sits beside it or in it. */
const made = (name: string): string[] => [`private/${name}/assets`, `private/${name}/generated.json`];

/**
 * What each eval reads for each of its corpora, by path from the repository root: the folders and files its run.ts opens, so that a corpus
 * regenerated with another seed, an input edited in place and an own corpus swapped for another each change the fingerprint. A folder counts by
 * the path and bytes of every file in it. The seed file is there for the corpora whose summary records it from there (an own corpus).
 * `--corpus all` is the public corpus and the second one the eval names (private, and own for promotion). Results folders are never inputs.
 */
const CORPORA: Record<string, (args: string[]) => Record<string, string[]>> = {
  nightly: () => ({ public: ["evals/nightly/assets"], private: made("nightly") }),
  consolidate: () => ({ public: ["evals/consolidate/assets"], private: made("consolidate") }), // --pool is the public assets/pool
  distill: () => ({
    public: ["evals/distill/assets"],
    private: made("distill"),
    own: ["private/distill/own/assets", SEED],
    "own-feedback": ["private/distill/own/assets-feedback", SEED],
  }),
  reflect: (args) => {
    // --retrieval-queries reads the queries and qrels of the retrieval eval's matching corpus
    const queries = (assets: string) => (hasFlag(args, "--retrieval-queries") ? [`${assets}/queries.jsonl`, `${assets}/qrels.jsonl`] : []);
    return { public: ["evals/reflect/assets", ...queries("evals/retrieval/assets")], private: [...made("reflect"), ...queries("private/retrieval/assets")] };
  },
  // --cases DIR is the own corpus from somewhere else: its bytes are in the files part
  promotion: (args) => ({ public: ["evals/promotion/assets"], own: [...(hasFlag(args, "--cases") ? [] : ["private/promotion/own"]), SEED] }),
  "judge-gate": () => ({ public: ["evals/judge-gate/assets"], private: [...made("judge-gate"), "evals/judge-gate/assets/README.md"] }), // the private cases take the public rubric
  extract: () => ({ public: ["evals/extract/assets"], private: [...made("extract"), "private/extract/map.json", SEED] }), // its seed is read from the map, else the seed file
  retrieval: () => ({ public: ["corpus/library", "evals/retrieval/assets"], private: made("retrieval"), own: ["private/retrieval/own"] }),
  "agent-ab": () => ({ public: ["evals/agent-ab/tasks", "evals/agent-ab/libraries"], private: made("agent-ab") }),
  // The Harbor benchmark's tasks are pinned by its lock. Its private corpus is the library that evals/retrieval made.
  "terminal-bench": () => {
    const lock = "benchmarks/terminal-bench/assets/ASSETS.lock";
    return { public: [lock, "corpus/library"], private: [lock, "private/retrieval/assets/library", "private/retrieval/assets/generated.json", "private/retrieval/generated.json"] };
  },
};

/** The paths, from the repository root, of what a job reads for the corpus its `--corpus` names (public, unless a promotion job names `--cases`). */
export function corpusPaths(evalName: string, args: string[]): string[] {
  const corpora = CORPORA[evalName]?.(args);
  if (corpora === undefined) return [];
  const chosen = flagValue(args, "--corpus") ?? (evalName === "promotion" && hasFlag(args, "--cases") ? "own" : "public");
  const names = chosen === "all" ? ["public", evalName === "promotion" ? "own" : "private"] : [chosen];
  return [...new Set(names.flatMap((name) => corpora[name] ?? []))].sort();
}

/** The digest of the corpus a job reads: each path of corpusPaths, by name, with the digest of its bytes. It holds no content and no checkout path. */
const corpusDigest = (root: string, evalName: string, args: string[]): string => sha256(corpusPaths(evalName, args).map((path) => `${path}\0${digestPath(root, path)}\n`).join(""));

/** The settings of a `.env` the way lib/env.sh reads them: KEY=value lines, `export ` allowed, quotes dropped, an unquoted value ends at ` #`; the first line of a key wins. */
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
    const quoted = /^"(.*)"$/.exec(value) ?? /^'(.*)'$/.exec(value);
    if (quoted) value = quoted[1];
    else if (!value.startsWith('"') && !value.startsWith("'")) value = value.replace(/\s#.*$/, "").trimEnd();
    if (!(key in out)) out[key] = value;
  }
  return out;
}

type Env = Record<string, string | undefined>;

/** The environment an eval's `run` script sees: the caller's, then the repository's .env for what the caller did not set. */
const effectiveEnv = (root: string, env: Env): Env => ({ ...readDotEnv(join(root, ".env")), ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) });

/** The endpoint a run calls, as lib/provenance.ts identifies it: scheme, host, port and path, with no credentials. A value that is no URL is told apart by a digest of it. */
const endpointOf = (url: string | undefined): string | null => endpointIdentity(url) ?? (url?.trim() ? `unreadable ${sha256(url).slice(0, 12)}` : null);

/** The model settings a run uses, without a key: the model and the whole endpoint of the model under test and of the judge, and the digest of models.json (it holds no keys). */
function modelSettings(root: string, env: Env): Record<string, string | null> {
  return {
    MODEL_NAME: env.MODEL_NAME ?? null,
    MODEL_BASE_URL: endpointOf(env.MODEL_BASE_URL),
    JUDGE_MODEL: env.JUDGE_MODEL ?? null,
    JUDGE_BASE_URL: endpointOf(env.JUDGE_BASE_URL),
    "models.json": existsSync(join(root, "models.json")) ? digestPath(root, "models.json") : null,
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
 * The akm a job runs. For an eval that runs akm on this machine: `--akm`, else AKM_BIN of the environment or .env, else `akm`, with the build
 * that command identifies (akmBuild() of lib/akm/akm.ts, which every eval records as `akm_build` and `akm_build_fingerprint`). For a Harbor
 * eval, `--akm` is a release (the string) or a checkout (its folder, with the build of that checkout and its uncommitted changes).
 */
function akmIdentity(args: string[], evalName: string, env: Env): { command: string; build: string | null; fingerprint: string | null } {
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
    return { command: akm_bin, build: akm_build, fingerprint: akm_build_fingerprint };
  } finally {
    if (saved === undefined) delete process.env.AKM_BIN;
    else process.env.AKM_BIN = saved;
  }
}

/** This repository's code as the job runs it: the commit, and the digest of the changes to tracked files that are not committed. */
function harnessIdentity(root: string): string {
  const head = git(root, ["rev-parse", "HEAD"]);
  if (!head.ok) return "not a git checkout";
  const diff = git(root, ["diff", "HEAD"]);
  return `${head.out.trim()}${diff.ok && diff.out !== "" ? `+${sha256(diff.out)}` : ""}`;
}

/** The fingerprint of a job: see the header. `env` is the environment the job runs in, the matrix process's by default. */
export function fingerprintOf(root: string, job: Pick<Job, "args" | "row">, env: Env = process.env): Fingerprint {
  const full = effectiveEnv(root, env);
  const files = PATH_FLAGS.flatMap((flag) => {
    const value = flagValue(job.args, flag);
    return value === undefined ? [] : [`${flag} ${digestPath(root, value)}`];
  });
  const parts: Record<string, string> = {
    args: sha256(canonical(job.args)),
    files: sha256(canonical(files)),
    corpus: corpusDigest(root, job.row.eval, job.args),
    model: sha256(canonical(modelSettings(root, full))),
    akm: sha256(canonical(akmIdentity(job.args, job.row.eval, full))),
    harness: sha256(harnessIdentity(root)),
  };
  return { sha256: sha256(canonical(parts)), parts };
}

const NAMES: Record<string, string> = { args: "its arguments", files: "a file its arguments name (a config patch or a cases folder)", corpus: "the corpus it reads (the assets, library and generated.json of the public, private or own corpus)", model: "the model settings (MODEL_NAME, the endpoints with their paths, the judge, models.json)", akm: "the akm (AKM_BIN or --akm, or the build it runs)", harness: "this repository's code" };

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
