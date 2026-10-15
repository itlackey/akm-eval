#!/usr/bin/env bun
// retrieval generate: makes the private library, queries and qrels of each public collection (the library and the
// books) from the public ones with lib/rewrite.
//
//   evals/retrieval/generate --seed N --out private/retrieval
//
// For each collection, the library, every query and every qrel row go through one rewrite run, so one map renames
// them all and a name that the queries write means the same name in the library. Then the result is checked: every
// qrel ref and every expected ref must name an asset akm indexes in the private library, and every query must keep
// the relevant assets it had.
//
// akm, and every other executable that the library tells an agent to run (bun, uv, docker...), keep their names:
// terminal-bench hands the private library to an agent that runs the real tools.
//
// Everything is made in a folder beside the private assets and moved into place only when every collection is sound,
// so a failed run leaves the assets and maps of the run before as they were. generated.json, beside the assets, holds the seed.

import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { TOOLS } from "../../../lib/rewrite/lexicon.ts";
import * as akm from "./akm.ts";
import { GENERATED, filesUnder } from "./inputs.ts";
import { type Qrel, type Query, RELEVANT, parseQrels, parseQueries } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

/**
 * One file per query, one per query's expected assets and one per query's qrels, so the rewrite sees ordinary lines
 * and not JSON escapes. A qrels file holds the ref, reason and optional alias target per row. The grades stay out of the
 * text: nothing in them needs a rewrite.
 */
export function explode(queries: Query[], qrels: Qrel[], dir: string): void {
  for (const sub of ["queries", "expected", "qrels"]) mkdirSync(join(dir, sub), { recursive: true });
  for (const q of queries) {
    writeFileSync(join(dir, "queries", `${q.id}.txt`), `${q.query}\n`);
    if (q.expected?.length) writeFileSync(join(dir, "expected", `${q.id}.txt`), `${q.expected.join("\n")}\n`);
  }
  const byId = new Map<string, string[]>();
  for (const r of qrels) byId.set(r.id, [...(byId.get(r.id) ?? []), r.ref, r.reason.replace(/\s+/g, " ").trim(), ...(r.alias_of ? [r.alias_of] : [])]);
  for (const [id, lines] of byId) writeFileSync(join(dir, "qrels", `${id}.txt`), `${lines.join("\n")}\n`);
}

/** The queries and the qrels again, with the rewritten text. The ids, kinds and grades are kept. */
export function assemble(queries: Query[], qrels: Qrel[], dir: string): { queries: Query[]; qrels: Qrel[] } {
  const read = (file: string) => {
    if (!existsSync(file)) throw new Error(`the rewrite did not write ${file}`);
    return readFileSync(file, "utf8");
  };
  const lines = new Map<string, string[]>();
  for (const r of qrels) if (!lines.has(r.id)) lines.set(r.id, read(join(dir, "qrels", `${r.id}.txt`)).split("\n"));
  const used = new Map<string, number>();
  return {
    queries: queries.map((q) => ({
      ...q,
      query: read(join(dir, "queries", `${q.id}.txt`)).replace(/\n$/, ""),
      ...(q.expected ? { expected: q.expected.length ? read(join(dir, "expected", `${q.id}.txt`)).trim().split("\n") : [] } : {}),
    })),
    qrels: qrels.map((r) => {
      const at = used.get(r.id) ?? 0;
      used.set(r.id, at + (r.alias_of ? 3 : 2));
      const l = lines.get(r.id) as string[];
      const { asset_sha256: _publicText, ...kept } = r; // the digest is of the public asset, whose text the private one does not have
      return { ...kept, ref: l[at], reason: l[at + 1], ...(r.alias_of ? { alias_of: l[at + 2] } : {}) };
    }),
  };
}

/** What is wrong with the private assets, as a list of sentences. Empty when they are sound. */
export function problems(pub: { queries: Query[]; qrels: Qrel[]; nAssets: number }, priv: { queries: Query[]; qrels: Qrel[]; refs: Set<string> }): string[] {
  const found: string[] = [];
  if (priv.refs.size !== pub.nAssets) found.push(`the private library has ${priv.refs.size} assets, the public one ${pub.nAssets}`);
  const named = [...priv.qrels.map((r) => priv.refs.has(r.ref) ? r.ref : (r.alias_of ?? r.ref)), ...priv.queries.flatMap((q) => q.expected ?? [])];
  const missing = [...new Set(named.filter((ref) => !priv.refs.has(ref)))];
  if (missing.length) found.push(`${missing.length} qrel or expected refs name no asset in the private library, such as ${missing.slice(0, 3).join(", ")}`);
  // A pair graded again has two rows in the public qrels, and keeps both: the rewrite must not make fewer pairs of them, which two assets that became one do.
  const pairs = (qrels: Qrel[]) => new Set(qrels.map((r) => `${r.id}\t${r.ref}`)).size;
  if (pairs(priv.qrels) !== pairs(pub.qrels)) found.push(`${pairs(pub.qrels) - pairs(priv.qrels)} qrel rows share a query and an asset after the rewrite, so two assets became one`);
  const relevant = (qrels: Qrel[], id: string) => qrels.filter((r) => r.id === id && r.grade >= RELEVANT).length;
  for (const q of pub.queries) {
    const before = relevant(pub.qrels, q.id);
    const after = relevant(priv.qrels, q.id);
    if (before !== after) found.push(`${q.id} had ${before} relevant assets and now has ${after}`);
  }
  if (priv.queries.length !== pub.queries.length) found.push(`${priv.queries.length} private queries for ${pub.queries.length} public ones`);
  return found;
}

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

interface Collection {
  name: string;
  /** The public library. */
  library: string;
  /** The public queries.jsonl and qrels.jsonl. */
  source: string;
  /** Where the private copy goes, under --out. */
  target: string;
  /** The rewrite map, under --out. */
  map: string;
}

/** The public collections of the repository at `root`, and where each one's private copy and map go. */
const collectionsOf = (root: string): Collection[] => [
  { name: "library", library: join(root, "corpus", "library"), source: join(root, "evals", "retrieval", "assets"), target: "assets", map: "map.json" },
  { name: "books", library: join(root, "evals", "retrieval", "assets", "books", "library"), source: join(root, "evals", "retrieval", "assets", "books"), target: join("assets", "books"), map: "books-map.json" },
];

/** The languages of a code fence that holds commands. A fence with no language is taken for one too. */
const SHELL_FENCE = /^(sh|bash|shell|zsh|fish|console|terminal|shellsession|shell-session|powershell|ps1|bat|cmd)?$/i;

/** Words that run the command after them: `sudo docker build` and `npx playwright test` run docker and playwright. */
const WRAPPERS = new Set(["sudo", "env", "time", "nohup", "exec", "xargs", "command", "npx", "pnpx", "bunx", "uvx"]);
/** Package runners, which run a command after `run`, `exec`, `x` or `dlx`: `uv run pytest` runs pytest, `pnpm exec playwright test` runs playwright. */
const RUNNERS = new Set(["uv", "poetry", "pipx", "pdm", "rye", "hatch", "bun", "npm", "pnpm", "yarn"]);
const RUN_WORDS = new Set(["run", "exec", "x", "dlx"]);

/**
 * The executables a text tells its reader to run: for each command on a line of a shell code block (a line that starts with # is a
 * comment), or in an inline code span that starts with a lowercase word and has a space in it (a bare `docker` is a mention), the word the command starts with, and the command that a wrapper
 * (sudo, env, npx...) or a package runner (`uv run`, `pnpm exec`) or `python -m` runs. A pipe, `&&`, `||` or `;` starts a new command.
 * It catches some words that are not commands, such as the first word of an inline `file name`: the caller keeps the names of tools only.
 */
export function commandWords(text: string): Set<string> {
  const found = new Set<string>();
  const add = (segment: string) => {
    const words = segment.trim().replace(/^[$>]\s*/, "").split(/\s+/);
    let i = 0;
    const flags = () => {
      while (words[i]?.startsWith("-")) i++;
    };
    while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++; // VAR=value before the command
    while (i < words.length) {
      const word = words[i++];
      if (!/^[a-z][a-z0-9_.-]*$/.test(word)) break;
      found.add(word);
      if (WRAPPERS.has(word)) {
        flags();
        while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++; // env FOO=1 cmd
      } else if (RUNNERS.has(word) && RUN_WORDS.has(words[i] ?? "")) {
        i++;
        flags();
      } else if (/^python[0-9.]*$/.test(word) && words[i] === "-m") {
        i++;
      } else {
        break;
      }
    }
  };
  const fences = /^[ \t]*(```|~~~)[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)^[ \t]*\1/gm;
  for (const [, , language, body] of text.matchAll(fences)) {
    if (!SHELL_FENCE.test(language)) continue;
    for (const line of body.split("\n")) if (!line.trim().startsWith("#")) for (const segment of line.split(/\|\||&&|[;|]/)) add(segment);
  }
  for (const [, span] of text.replace(fences, "").matchAll(/`([a-z][^`\n]* [^`\n]*)`/g)) for (const segment of span.split(/\|\||&&|[;|]/)) add(segment);
  return found;
}

/**
 * The words the rewrite must leave as they are for a library: akm, and every tool of lib/rewrite's TOOLS that the library tells its reader to run (see commandWords).
 * The rewrite renames a tool everywhere otherwise, and an agent that follows the private library calls the real one.
 */
export function pinnedTools(library: string): string[] {
  const used = new Set<string>();
  for (const file of filesUnder(library)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const word of commandWords(text)) used.add(word);
  }
  // qwen3 is the tool qwen, as the rewrite reads it
  const tools = [...used].map((word) => (TOOLS.has(word) ? word : TOOLS.has(word.replace(/\d+$/, "")) ? word.replace(/\d+$/, "") : undefined)).filter((word): word is string => word !== undefined && word !== "akm");
  return ["akm", ...[...new Set(tools)].sort()];
}

/**
 * Makes the private copy of one collection under `out`, and returns the rewrite's summary line and what is wrong with the copy.
 * Nothing is moved into place here: `out` is the folder generate stages the whole run in.
 */
async function makeCollection(c: Collection, out: string, seed: string): Promise<{ queries: number; qrels: number; summary: string; found: string[] }> {
  const work = join(out, ".work");
  const target = join(out, c.target);
  const map = join(out, c.map);

  const queries = parseQueries(readFileSync(join(c.source, "queries.jsonl"), "utf8"), join(c.source, "queries.jsonl"));
  const qrels = parseQrels(readFileSync(join(c.source, "qrels.jsonl"), "utf8"), join(c.source, "qrels.jsonl"));

  const publicBox = createSandbox("retrieval");
  const privateBox = createSandbox("retrieval");
  try {
    await akmVersion(publicBox); // before anything is written: the check at the end needs akm
    rmSync(work, { recursive: true, force: true });
    rmSync(map, { force: true });
    cpSync(c.library, join(work, "in", "library"), { recursive: true });
    explode(queries, qrels, join(work, "in"));

    // A map that already holds akm and the executables the library runs, so they keep their names. Start from a map the rewrite
    // made, so the date shift is the rewrite's own, as agent-ab does.
    writeFileSync(join(work, "empty.txt"), "\n");
    rewrite(["--seed", seed, "--map", map, join(work, "empty.txt"), join(work, "empty-out.txt")]);
    const start = JSON.parse(readFileSync(map, "utf8")) as { words: Record<string, string> };
    for (const word of pinnedTools(c.library)) start.words[word] = word;
    writeFileSync(map, `${JSON.stringify(start, null, 2)}\n`);

    const summary = rewrite(["--seed", seed, "--map", map, join(work, "in"), join(work, "out")]);
    const rewritten = assemble(queries, qrels, join(work, "out"));

    mkdirSync(target, { recursive: true });
    cpSync(join(work, "out", "library"), join(target, "library"), { recursive: true });
    writeFileSync(join(target, "queries.jsonl"), `${rewritten.queries.map((q) => JSON.stringify(q)).join("\n")}\n`);
    writeFileSync(join(target, "qrels.jsonl"), `${rewritten.qrels.map((r) => JSON.stringify(r)).join("\n")}\n`);
    rmSync(work, { recursive: true, force: true });

    const nAssets = await akm.load(publicBox, c.library);
    const privateAssets = await akm.assets(privateBox, await akm.load(privateBox, join(target, "library")));
    const found = problems({ queries, qrels, nAssets }, { queries: rewritten.queries, qrels: rewritten.qrels, refs: new Set(privateAssets.map((a) => a.ref)) });
    return { queries: rewritten.queries.length, qrels: rewritten.qrels.length, summary: summary.split("\n").pop() as string, found };
  } finally {
    removeSandbox(publicBox);
    removeSandbox(privateBox);
  }
}

/** What generate puts in place under `out`, each moved in as a whole: the assets, with generated.json in them, and the two maps. */
const PRODUCTS = ["assets", "map.json", "books-map.json"];

/**
 * Moves the products from `staging` into `out`, each in place of the one before. If a move fails, the ones moved so far go back, so the
 * assets and the maps are either all of one run or all of the run before.
 */
export function install(staging: string, out: string, names = PRODUCTS): void {
  const old = join(out, ".old");
  rmSync(old, { recursive: true, force: true });
  mkdirSync(old, { recursive: true });
  const moved: string[] = [];
  try {
    for (const name of names) {
      if (existsSync(join(out, name))) renameSync(join(out, name), join(old, name));
      moved.push(name);
      renameSync(join(staging, name), join(out, name));
    }
  } catch (e) {
    for (const name of moved.reverse()) {
      rmSync(join(out, name), { recursive: true, force: true });
      if (existsSync(join(old, name))) renameSync(join(old, name), join(out, name));
    }
    throw e;
  } finally {
    rmSync(old, { recursive: true, force: true });
  }
}

export interface Options {
  seed: string;
  out: string;
  /** The repository that holds the public library and assets. Default: this one. */
  root?: string;
}

export interface Result {
  collections: { name: string; target: string; queries: number; qrels: number; summary: string; found: string[] }[];
  /** The assets and maps are in place. False when any collection was not sound: then `out` is as it was. */
  installed: boolean;
}

/**
 * Makes the private assets of every collection in a staging folder in `out`. When all of them are sound, writes generated.json into
 * the assets and moves the assets and the maps into place. Otherwise nothing under `out` changes.
 */
export async function generate(opts: Options): Promise<Result> {
  const root = opts.root ?? ROOT;
  const out = resolve(opts.out);
  const staging = join(out, ".staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    const collections: Result["collections"] = [];
    for (const c of collectionsOf(root)) collections.push({ name: c.name, target: c.target, ...(await makeCollection(c, staging, opts.seed)) });
    const installed = collections.every((c) => c.found.length === 0);
    if (installed) {
      writeFileSync(join(staging, "assets", GENERATED), `${JSON.stringify({ seed: opts.seed }, null, 2)}\n`);
      install(staging, out);
    }
    return { collections, installed };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/retrieval/generate --seed N --out private/retrieval");
    return 2;
  }
  const made = await generate({ seed: values.seed, out: values.out });
  for (const c of made.collections) {
    console.log(`retrieval: ${c.name}: ${c.queries} queries, ${c.qrels} qrels and the library${made.installed ? ` written to ${join(values.out, c.target)}` : " made"}`);
    console.log(c.summary);
    if (c.found.length) console.error(`retrieval: the private ${c.name} assets are not sound:\n  ${c.found.join("\n  ")}`);
    else console.log(`retrieval: ${c.name}: every qrel ref names an asset in the private library, and every query keeps its relevant assets`);
  }
  if (!made.installed) console.error(`retrieval: nothing was changed in ${values.out}: the assets and maps of the run before are as they were`);
  return made.installed ? 0 : 1;
}

if (import.meta.main) process.exit(await main());
