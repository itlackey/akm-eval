// A semantic index kept between runs. Embedding a library is what takes the time of a semantic run: a quarter of an hour for
// 6,000 skills, close to an hour for 24,000 assets. The index is the same every time, since the same akm embeds the same files
// with the same model, so it is kept in the repository's gitignored .cache/ and the next run uses it as it is.
//
//   const index = await cachedIndex({ name: "skillret-public", version, files }, (sandbox) => buildIndex(sandbox));
//   try { ...query index.sandbox... } finally { index.release(); }
//
// The index is used as it was built and never updated, because akm 0.9.26 does not update an index to what a new one would be:
//  - An asset that was changed or removed stays in the row count and the token totals of the keyword index, so every BM25
//    score after that differs a little from a new index's, and so do some rankings. 37 of 400 queries had another top 15
//    after 10 of 6,006 skills were changed, and 325 after 200 were.
//  - `akm index --full` on an index that exists counts every asset twice.
//  - The first update of the public library of the retrieval eval, an index of 259 assets, gave 15 to 17 of them new ids and new
//    embeddings though no file had changed, and 89 of its 136 queries then ranked otherwise.
// Only a new index is built by akm, and it is built in one go. So an index is kept for the collection it was built from, and
// is built again from nothing when a file changed, is gone or is new, or when akm, its embedding model or the index's folder
// is not the same. akm is asked what the kept index holds before it is used, and it has to be the build that was made:
// the same number of assets, the same build time, and embeddings.
//
// The index is in the repository's .cache/, which the repository ignores, and akm walks a bundle that is inside a git repository
// with `git ls-files`, which leaves out what the repository ignores: it would find no asset. So git is not let climb out of the
// index's folder, and akm walks the bundle itself.
//
// What the index was built from is in state.json, which is written last, after akm has indexed and the caller has checked the
// index. A folder without one holds an index that was not finished, and is removed.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { INDEX_CACHE, SEMANTIC_MODEL, type Sandbox, runAkmJson, sandboxIn, semanticConfig } from "./akm.ts";

export const digest = (content: string | Uint8Array): string => createHash("sha256").update(content).digest("hex");

/** Every file under `root`, links followed as a copy of the folder follows them: its path under `root`, and the sha256 of its content. */
export function digestTree(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile()) files[relative(root, path)] = digest(readFileSync(path));
    }
  };
  walk(root);
  return files;
}

export interface IndexSpec {
  /** The folder of the collection's index in the cache, such as skillret-public. */
  name: string;
  /** What akm says its version is. An index is never reused by another version. */
  version: string;
  /** What the collection holds: each file's path, and the sha256 of its content. */
  files: Record<string, string>;
  /** Whatever else makes an index different, such as where the bundles of a library that is indexed in place are. */
  extra?: string;
  /** Where the cache is, and the akm command to run in it: for tests. */
  root?: string;
  cmd?: string[];
  log?: (line: string) => void;
}

export interface CachedIndex {
  sandbox: Sandbox;
  /** cold: a new index was built. warm: the index of an earlier run is used as it is. rebuilt: the earlier index was not what it was built as, and a new one was built. */
  state: "cold" | "warm" | "rebuilt";
  /** How many assets the index holds. */
  entries: number;
  /** Lets go of the index, which stays in the cache. */
  release(): void;
}

interface State {
  key: string;
  files: Record<string, string>;
  /** How many assets akm indexed, and when akm says it built the index. */
  entries: number;
  builtAt: string;
}

const readState = (dir: string): State | undefined => {
  try {
    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8")) as State;
    return typeof state.key === "string" && state.files && typeof state.files === "object" && Number.isInteger(state.entries) && typeof state.builtAt === "string" ? state : undefined;
  } catch {
    return undefined;
  }
};

const alive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
};

/** One run at a time uses an index. A lock left by a run that was killed is taken over. */
function lock(path: string): () => void {
  for (let attempt = 0; ; attempt++) {
    try {
      writeFileSync(path, String(process.pid), { flag: "wx" });
      return () => rmSync(path, { force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const pid = Number(readFileSync(path, "utf8"));
      if (attempt > 0 || alive(pid)) throw new Error(`another run is using the index in ${path} (pid ${pid}). Remove that file if no run is.`);
      rmSync(path, { force: true });
    }
  }
}

/** What akm says the index in the sandbox holds, without touching it. */
async function stats(sandbox: Sandbox): Promise<{ entries: number; builtAt: string; hasEmbeddings: boolean }> {
  const info = await runAkmJson<{ indexStats?: { entryCount?: number; lastBuiltAt?: string; hasEmbeddings?: boolean } }>(sandbox, ["info"], { timeoutMs: 120_000 });
  const s = info.indexStats;
  if (typeof s?.entryCount !== "number" || typeof s.lastBuiltAt !== "string") throw new Error("akm info did not say what the index holds");
  return { entries: s.entryCount, builtAt: s.lastBuiltAt, hasEmbeddings: s.hasEmbeddings === true };
}

/** Why the state of an earlier index is not the index of this collection, in a sentence. */
function whyNot(state: State | undefined, key: string, files: Record<string, string>): string {
  if (!state) return "it was not finished";
  if (state.key !== key) return "akm, its embedding model or the index's folder is not the same";
  const changed = Object.entries(state.files).filter(([path, sum]) => files[path] !== sum).length;
  const added = Object.keys(files).filter((path) => !(path in state.files)).length;
  return `${changed} of its ${Object.keys(state.files).length} files changed or are gone, and ${added} are new`;
}

/**
 * Opens the cached semantic index of a collection, in a folder of the cache that is the same for every run, since akm
 * records the paths of what it indexes. An index that was built from this collection is used as it is, once akm says that it
 * holds what the build made it hold. Otherwise `build` makes a new one in an empty sandbox: it writes the collection, has
 * akm index it, checks the index and throws when it is wrong, and returns how many assets akm indexed. If an index that was
 * kept is not what it was built as, a new one is built and the state says so: the cache never hides a failure.
 */
export async function cachedIndex(spec: IndexSpec, build: (sandbox: Sandbox) => Promise<number>): Promise<CachedIndex> {
  const log = spec.log ?? console.log;
  const base = spec.root ?? INDEX_CACHE;
  mkdirSync(base, { recursive: true });
  const root = realpathSync(base);
  const dir = join(root, spec.name);
  const release = lock(join(root, `${spec.name}.lock`));
  try {
    const key = digest([spec.version, SEMANTIC_MODEL, dir, spec.extra ?? "", JSON.stringify(semanticConfig())].join("\0"));
    const previous = readState(dir);
    const sandbox = (): Sandbox => {
      const sb = sandboxIn(dir, { semantic: true });
      return { ...sb, env: { ...sb.env, GIT_CEILING_DIRECTORIES: dir }, ...(spec.cmd ? { cmd: spec.cmd } : {}) };
    };
    const discard = () => rmSync(dir, { recursive: true, force: true });
    const same = (files: Record<string, string>) => Object.keys(files).length === Object.keys(spec.files).length && Object.entries(files).every(([path, sum]) => spec.files[path] === sum);
    let state: CachedIndex["state"] = "cold";
    if (previous && previous.key === key && same(previous.files)) {
      try {
        // What akm logged of the searches of the last run is not part of the index, and an akm that ranked with it would
        // give the rankings of the runs before. The state of akm goes, and the index stays.
        for (const file of readdirSync(join(dir, "data"))) if (file.startsWith("state.db")) rmSync(join(dir, "data", file), { force: true });
        for (const folder of ["state", "xdg-state", "cache"]) rmSync(join(dir, folder), { recursive: true, force: true });
        const sb = sandbox();
        const now = await stats(sb);
        if (now.entries !== previous.entries) throw new Error(`akm says the index holds ${now.entries} assets, and it was built with ${previous.entries}`);
        if (now.builtAt !== previous.builtAt) throw new Error(`akm says the index was built at ${now.builtAt}, and it was built at ${previous.builtAt}`);
        if (!now.hasEmbeddings) throw new Error("akm says the index holds no embeddings");
        return { sandbox: sb, state: "warm", entries: previous.entries, release };
      } catch (e) {
        log(`  the index of an earlier run is not what it was built as, and a new one is built from scratch. akm said: ${(e as Error).message}`);
        state = "rebuilt";
      }
    } else if (existsSync(dir)) {
      log(`  the index ${spec.name} in the cache cannot be reused: ${whyNot(previous, key, spec.files)}. Building a new one.`);
    }
    discard();
    const sb = sandbox();
    let entries: number;
    let builtAt: string;
    try {
      entries = await build(sb);
      const now = await stats(sb);
      if (now.entries !== entries) throw new Error(`akm indexed ${entries} assets, and says the index holds ${now.entries}`);
      builtAt = now.builtAt;
    } catch (e) {
      discard();
      throw e;
    }
    const next = join(dir, "state.json.tmp");
    writeFileSync(next, JSON.stringify({ key, files: spec.files, entries, builtAt } satisfies State));
    renameSync(next, join(dir, "state.json"));
    return { sandbox: sb, state, entries, release };
  } catch (e) {
    release();
    throw e;
  }
}
