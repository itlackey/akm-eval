// Helpers for the extract eval that are neither its scorer nor its collector: reading the cases and their sessions, the digests of the
// corpus, and the marker generate writes beside the private cases. generate.ts makes the private cases with them and run.ts runs the eval.
//
// The scorer is score.ts and the collector is collect.ts (see measurement.ts); this file re-exports both, so the eval and its tests import
// from one place.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import { CLASSES, type Case, type Class, type Expect } from "./score.ts";

export * from "./score.ts";
export * from "./collect.ts";

const EXPECTS: Record<Class, Expect[]> = { insight: ["memory"], routine: ["none"], planted: ["memory", "none"], preference: ["memory"], buried: ["memory"] };

export interface LoadedCase extends Case {
  /** The session file, and the name of the Claude Code project folder it sits in. */
  file: string;
  project: string;
  /** The session as written: one JSON event per line. */
  session: string;
}

/** The session files under `dir`, which is laid out as Claude Code lays out its own: `<project>/<session id>.jsonl`. */
function sessionFiles(dir: string): Map<string, { project: string; file: string }[]> {
  const found = new Map<string, { project: string; file: string }[]>();
  if (!existsSync(dir)) return found;
  for (const project of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    for (const name of readdirSync(join(dir, project.name)).filter((f) => f.endsWith(".jsonl"))) {
      const id = name.slice(0, -".jsonl".length);
      found.set(id, [...(found.get(id) ?? []), { project: project.name, file: join(dir, project.name, name) }]);
    }
  }
  return found;
}

/** The cases in `assets/cases.json`, each with its session read from `assets/sessions/<project>/<id>.jsonl`. */
export function loadCases(assets: string): LoadedCase[] {
  const file = join(assets, "cases.json");
  let rows: unknown;
  try {
    rows = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${file} has no cases`);
  const sessions = sessionFiles(join(assets, "sessions"));
  const seen = new Set<string>();
  const cases = rows.map((row: Case, i): LoadedCase => {
    const at = `${file}: case ${i + 1}${typeof row?.id === "string" ? ` (${row.id})` : ""}`;
    if (typeof row?.id !== "string" || !/^[a-z0-9-]+$/.test(row.id)) throw new Error(`${at} needs an id of lower case letters, digits and dashes`);
    if (seen.has(row.id)) throw new Error(`${at} repeats an id`);
    seen.add(row.id);
    if (!CLASSES.includes(row.class)) throw new Error(`${at} has class "${row.class}", expected one of ${CLASSES.join(", ")}`);
    if (!EXPECTS[row.class].includes(row.expect)) throw new Error(`${at} is ${row.class}, so it expects ${EXPECTS[row.class].join(" or ")}, not "${row.expect}"`);
    if (typeof row.note !== "string" || !row.note.trim()) throw new Error(`${at} has no note`);
    const groups = (key: "required" | "forbidden") => {
      const value = row[key] ?? [];
      const ok = Array.isArray(value) && value.every((g) => Array.isArray(g) && g.length > 0 && g.every((p) => typeof p === "string" && /[a-z0-9]/i.test(p)));
      if (!ok) throw new Error(`${at} needs ${key} as a list of lists of phrases, each with a letter or a digit`);
      return value;
    };
    const required = groups("required");
    const forbidden = groups("forbidden");
    const text = (key: "good" | "bad") => typeof row[key] === "string" && row[key]?.trim() !== "";
    if (row.expect === "memory" ? required.length === 0 || !text("good") : required.length > 0 || text("good")) {
      throw new Error(`${at} ${row.expect === "memory" ? 'expects a memory, so it needs required and a "good" example' : 'expects nothing, so it has no required and no "good" example'}`);
    }
    if (row.class === "planted" ? forbidden.length === 0 || !text("bad") : forbidden.length > 0 || text("bad")) {
      throw new Error(`${at} ${row.class === "planted" ? 'is planted, so it needs forbidden and a "bad" example' : 'is not planted, so it has no forbidden and no "bad" example'}`);
    }
    const found = sessions.get(row.id) ?? [];
    if (found.length !== 1) throw new Error(`${at} needs exactly one session file named ${row.id}.jsonl under ${join(assets, "sessions")}, found ${found.length}`);
    return { ...row, required, forbidden, ...found[0], session: readFileSync(found[0].file, "utf8") };
  });
  for (const id of sessions.keys()) if (!seen.has(id)) throw new Error(`${join(assets, "sessions")}: ${id}.jsonl has no case in ${file}`);
  return cases;
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases taken from each class in turn, in file
 * order, so a short run covers as many classes as it can.
 */
export function selectCases(cases: LoadedCase[], limit?: number): LoadedCase[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const queues = CLASSES.map((k) => cases.filter((c) => c.class === k)).filter((q) => q.length > 0);
  const picked = new Set<LoadedCase>();
  for (let round = 0; picked.size < limit; round++) {
    for (const queue of queues) if (picked.size < limit && round < queue.length) picked.add(queue[round]);
  }
  return cases.filter((c) => picked.has(c));
}

/**
 * What a session says: the text of each event, one per line. A tool call is its command or its input and a tool
 * result is its content, as akm reads them.
 */
export function sessionText(session: string): string {
  const out: string[] = [];
  for (const line of session.split("\n")) {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const content = event?.message?.content;
    if (typeof content === "string") out.push(content);
    else if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string") out.push(block.text);
        else if (block?.type === "tool_use") out.push(typeof block.input?.command === "string" ? block.input.command : JSON.stringify(block.input ?? ""));
        else if (block?.type === "tool_result") out.push(typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? ""));
      }
    }
  }
  return out.join("\n");
}

// ---- What the run read -----------------------------------------------------------------------------------------

/**
 * One sha256 over the files a corpus's cases came from: cases.json and every session file, named by their place in the
 * assets folder and not by where that folder is, so the same assets give the same digest on any machine. It covers all
 * the cases, whatever --limit picked, so a short run and a whole run of one corpus agree. The digest is built as
 * sha256Files builds one (a name, a NUL, the file's hash, a line break, in the order of the names), because sha256Files
 * opens the names it hashes from the current folder, and this one hashes names that are relative to the assets folder.
 */
export function assetsDigest(assets: string, cases: LoadedCase[]): string {
  const names = ["cases.json", ...cases.map((c) => relative(assets, c.file))].sort();
  return sha256Text(names.map((name) => `${name}\0${sha256File(join(assets, name))}\n`).join(""));
}

/** The repository root. The generator's code is read from here, so a copy of the repository digests its own files. */
const ROOT = resolve(import.meta.dir, "..", "..", "..");

/**
 * The code that decides what generate makes of the public assets and whether it accepts the result, by its path from `root`: generate.ts,
 * this file (reading the cases), score.ts (the checks generate runs on what the rewrite made), lib/negation.ts (the rule of negation those
 * checks use) and the code of lib/rewrite, without its tests.
 */
export function generatorFiles(root = ROOT): string[] {
  const inRewrite = readdirSync(join(root, "lib", "rewrite"), { recursive: true }).map(String).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
  return ["evals/extract/src/generate.ts", "evals/extract/src/lib.ts", "evals/extract/src/score.ts", "lib/negation.ts", ...inRewrite.map((f) => `lib/rewrite/${f}`)];
}

/** One digest over generatorFiles, each named by its path from the root. A change to the generator, to its checks or to the rewrite changes it. */
export const generatorSha256 = (root = ROOT): string => sha256Text(generatorFiles(root).map((name) => `${name}\0${sha256File(join(root, name))}\n`).join(""));

/** What generate writes beside the private assets: the seed they were made with, the digest of the public assets they were made from, and the digest of the code that made them. */
export interface Generated {
  seed: string;
  inputs_sha256: string;
  /** generatorSha256 when the assets were made. */
  rewrite: string;
}

export const GENERATED = "generated.json";

/** The digest of the public assets a private set is made from: cases.json and the sessions it names. */
export const inputsSha256 = (assets: string): string => assetsDigest(assets, loadCases(assets));

/** generated.json in `dir` (private/extract), or undefined when it is missing or does not hold a seed and the two digests. */
export function readGenerated(dir: string): Generated | undefined {
  try {
    const g = JSON.parse(readFileSync(join(dir, GENERATED), "utf8")) as Partial<Generated> | null;
    return typeof g?.seed === "string" && typeof g.inputs_sha256 === "string" && typeof g.rewrite === "string" ? { seed: g.seed, inputs_sha256: g.inputs_sha256, rewrite: g.rewrite } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Why the private assets next to generated.json in `dir` may not be used, or undefined when it vouches for them: it is there, the public
 * assets it names the digest of are the ones in `publicAssets` now, and the generator that made them is the one in `root` now. Assets made
 * from other public cases, or by a generator or a rewrite that has changed since, would score a different set than the public run does.
 */
export function generatedProblem(dir: string, publicAssets: string, root = ROOT): string | undefined {
  const generated = readGenerated(dir);
  if (!generated) return `${GENERATED} is missing or holds no seed, inputs_sha256 and rewrite, so nothing shows what they were made from`;
  if (generated.inputs_sha256 !== inputsSha256(publicAssets)) return `they were made from other public assets than the ones in this checkout (inputs_sha256 in ${GENERATED} differs)`;
  if (generated.rewrite !== generatorSha256(root)) return `they were made by a generator that has changed since: evals/extract/src/generate.ts, lib.ts or score.ts, lib/negation.ts or lib/rewrite (rewrite in ${GENERATED} differs)`;
  return undefined;
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

/** Is `version` at least `minimum`? Both are semver. A prerelease is below its release and ordered by its tag. */
export function atLeast(version: string, minimum: string): boolean {
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v);
    if (!m) throw new Error(`not a version: ${v}`);
    return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split(".") ?? [] };
  };
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return (a.nums[i] ?? 0) > (b.nums[i] ?? 0);
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === 0; // a release is above any of its prereleases
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const [x, y] = [a.pre[i], b.pre[i]];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) > Number(y);
    if (nx !== ny) return ny; // a number is below a word
    return x > y;
  }
  return true;
}
