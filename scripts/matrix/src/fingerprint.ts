// What a matrix job was made from, as one digest: its arguments, the bytes of every file they name, the model settings it runs with, the akm it
// runs and this repository's code. A stage skips a job it already ran only when this digest is the same, so editing a config patch in place,
// pointing MODEL_BASE_URL somewhere else, switching the akm checkout's branch or committing a change to an eval runs the job again.
// See ../../../README.md ("Run a matrix").

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { akmBuild } from "../../../lib/akm/akm.ts";
import { canonical } from "../../compare/src/policy.ts";
import { type Job, type RunRecord, HARBOR, flagValue, readJson, runDirs, unusableReason } from "./lib.ts";

const sha256 = (data: string | Uint8Array): string => createHash("sha256").update(data).digest("hex");

export interface Fingerprint {
  /** The digest of the parts. */
  sha256: string;
  /** The digest of each part, by name: args, files, model, akm and harness. Enough to say which one changed, and nothing secret. */
  parts: Record<string, string>;
}

/** The flags whose value names a file or a folder the eval reads. A relative path is from the repository root, as the evals read it. */
const PATH_FLAGS = ["--config-patch", "--cases"];

/** The digest of a file's bytes, or of a folder's files by path and bytes, or "missing". */
function digestPath(root: string, path: string): string {
  const abs = isAbsolute(path) ? path : resolve(root, path);
  if (!existsSync(abs)) return "missing";
  if (!statSync(abs).isDirectory()) return sha256(readFileSync(abs));
  const files = (readdirSync(abs, { recursive: true }) as string[]).filter((f) => statSync(join(abs, f)).isFile()).sort();
  return sha256(files.map((f) => `${f}\0${sha256(readFileSync(join(abs, f)))}\n`).join(""));
}

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

const hostOf = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return `unreadable ${sha256(url).slice(0, 12)}`;
  }
};

/** The model settings a run uses, without a key: the model and the endpoint's host of the model under test and of the judge, and the digest of models.json (it holds no keys). */
function modelSettings(root: string, env: Env): Record<string, string | null> {
  return {
    MODEL_NAME: env.MODEL_NAME ?? null,
    MODEL_BASE_URL: hostOf(env.MODEL_BASE_URL),
    JUDGE_MODEL: env.JUDGE_MODEL ?? null,
    JUDGE_BASE_URL: hostOf(env.JUDGE_BASE_URL),
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
 * that command identifies (akmBuild() of lib/akm/akm.ts, which every eval records as `akm_build`). For a Harbor eval, `--akm` is a release
 * (the string) or a checkout (its folder, with the build of that checkout).
 */
function akmIdentity(args: string[], evalName: string, env: Env): { command: string; build: string | null } {
  const flag = flagValue(args, "--akm");
  if (HARBOR.includes(evalName)) {
    const folder = flag ? expandHome(flag) : "";
    return { command: flag ?? "", build: folder && existsSync(folder) && statSync(folder).isDirectory() ? describe(folder) : null };
  }
  const command = expandHome((flag ?? env.AKM_BIN ?? "").trim());
  const saved = process.env.AKM_BIN;
  try {
    if (command) process.env.AKM_BIN = command;
    else delete process.env.AKM_BIN;
    const { akm_bin, akm_build } = akmBuild();
    return { command: akm_bin, build: akm_build };
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
    model: sha256(canonical(modelSettings(root, full))),
    akm: sha256(canonical(akmIdentity(job.args, job.row.eval, full))),
    harness: sha256(harnessIdentity(root)),
  };
  return { sha256: sha256(canonical(parts)), parts };
}

const NAMES: Record<string, string> = { args: "its arguments", files: "a file its arguments name (a config patch or a cases folder)", model: "the model settings (MODEL_NAME, the endpoint's host, the judge, models.json)", akm: "the akm (AKM_BIN or --akm, or the build it runs)", harness: "this repository's code" };

/** Whether a stage may skip a job it already ran, and when not, why it runs again (empty for a job that was never run). */
export function resumable(root: string, prior: RunRecord | undefined, job: Pick<Job, "label" | "args">, fp: Fingerprint): { skip: boolean; why: string } {
  const again = (why: string) => ({ skip: false, why });
  if (!prior) return again("");
  if (prior.exit_code !== 0) return again(`its last run exited ${prior.exit_code}`);
  if (prior.label !== job.label || JSON.stringify(prior.args) !== JSON.stringify(job.args)) return again("its arguments changed");
  if (!prior.fingerprint || !prior.fingerprint_parts) return again("its last run did not record what it was made from");
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
