// The dataset: fetched at run time from the revision pinned in assets/ASSETS.lock and checked against its checksums,
// read, and sampled. The data is never committed.
//
// public is SkillRet's test split. private is a library of the same size drawn from its train split, whose skill pool
// is disjoint from the test pool, with train queries drawn in the test split's mix of one, two and three skills.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Seeds every draw: the private skills, the private queries, and --limit. It is recorded in summary.json. */
export const SEED = 42;

export interface LockedFile {
  url: string;
  bytes: number;
  sha256: string;
  /** How many lines the file holds. */
  records: number;
}

export interface Lock {
  dataset: string;
  paper: string;
  source: string;
  licence: string;
  revision: string;
  files: Record<string, LockedFile>;
}

/** The files of each split, as ASSETS.lock names them. */
const FILES = { test: ["test-skills.jsonl", "test-queries.jsonl", "test-qrels.jsonl"], train: ["train-skills.jsonl", "train-queries.jsonl", "train-qrels.jsonl"] } as const;

export function readLock(assetsDir: string): Lock {
  const path = join(assetsDir, "ASSETS.lock");
  const lock = JSON.parse(readFileSync(path, "utf8")) as Lock;
  for (const name of [...FILES.test, ...FILES.train]) {
    const f = lock.files?.[name];
    if (!lock.revision || !f?.url || !f.sha256 || !(f.bytes > 0) || !(f.records > 0)) throw new Error(`${path} does not pin ${name}`);
  }
  return lock;
}

async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

async function download(name: string, file: LockedFile, target: string, log: (line: string) => void): Promise<void> {
  const partial = `${target}.partial-${process.pid}`;
  const response = await fetch(file.url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} from ${file.url}`);
  const hasher = new Bun.CryptoHasher("sha256");
  const out = Bun.file(partial).writer();
  let bytes = 0;
  let shown = 0;
  try {
    for await (const chunk of response.body) {
      hasher.update(chunk);
      out.write(chunk);
      bytes += chunk.length;
      const quarter = Math.floor((bytes / file.bytes) * 4);
      if (quarter > shown && file.bytes > 5e7) log(`skillret: fetching ${name}: ${(shown = quarter) * 25}%`);
    }
    await out.end();
  } catch (e) {
    await out.end();
    rmSync(partial, { force: true });
    throw e;
  }
  const sha256 = hasher.digest("hex");
  if (bytes !== file.bytes || sha256 !== file.sha256) {
    rmSync(partial, { force: true });
    throw new Error(`the download is ${bytes} bytes with sha256 ${sha256}. ASSETS.lock pins ${file.bytes} bytes and ${file.sha256}.`);
  }
  renameSync(partial, target);
}

/**
 * Makes sure these files of the lock are in assets/. A copy that is already there is used when it matches the pinned
 * checksum, and nothing is fetched. Otherwise the file is fetched from the pinned revision, up to three tries.
 */
export async function ensureFiles(assetsDir: string, names: readonly string[], log: (line: string) => void = console.error, retryDelayMs = 3000): Promise<void> {
  const lock = readLock(assetsDir);
  mkdirSync(assetsDir, { recursive: true });
  for (const name of names) {
    const file = lock.files[name];
    const target = join(assetsDir, name);
    if (existsSync(target)) {
      const sha256 = await sha256File(target);
      if (sha256 !== file.sha256) throw new Error(`${target} has sha256 ${sha256}, not the ${file.sha256} that ASSETS.lock pins. Move it aside and run again to fetch it.`);
      continue;
    }
    log(`skillret: fetching ${name} (${Math.round(file.bytes / 1e6)} MB) from ${lock.source}, revision ${lock.revision.slice(0, 12)}`);
    for (let attempt = 1; ; attempt++) {
      try {
        await download(name, file, target, log);
        break;
      } catch (e) {
        if (attempt >= 3) throw new Error(`could not fetch ${name}: ${(e as Error).message}`);
        log(`skillret: the fetch failed (${(e as Error).message}). Trying again.`);
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }
}

export interface Skill {
  id: string;
  /** The SKILL.md of the skill, as the dataset holds it: its front matter and its body. */
  text: string;
}

export interface Query {
  id: string;
  query: string;
  /** The ids of the skills the query needs. */
  relevant: string[];
}

function readLines(path: string, expected: number): Record<string, unknown>[] {
  const rows = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line, i) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        throw new Error(`${path}:${i + 1} is not valid JSON`);
      }
    });
  if (rows.length !== expected) throw new Error(`${path} has ${rows.length} lines, and ASSETS.lock pins ${expected}`);
  return rows;
}

const text = (row: Record<string, unknown>, key: string, where: string): string => {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${where} has no string "${key}"`);
  return value;
};

export function readSkills(assetsDir: string, name: string): Skill[] {
  const path = join(assetsDir, name);
  const skills = readLines(path, readLock(assetsDir).files[name].records).map((row, i) => ({ id: text(row, "id", `${path}, line ${i + 1}`), text: text(row, "skill_md", `${path}, line ${i + 1}`) }));
  if (new Set(skills.map((s) => s.id)).size !== skills.length) throw new Error(`${path} has a skill id twice`);
  return skills;
}

/** The queries and the skills each one needs, from the queries file and the qrels. The two must agree. */
export function readQueries(assetsDir: string, queriesName: string, qrelsName: string): Query[] {
  const lock = readLock(assetsDir);
  const queriesPath = join(assetsDir, queriesName);
  const qrelsPath = join(assetsDir, qrelsName);
  const rel = new Map<string, string[]>();
  readLines(qrelsPath, lock.files[qrelsName].records).forEach((row, i) => {
    const at = `${qrelsPath}, line ${i + 1}`;
    if (row.relevance !== 1) throw new Error(`${at} has relevance ${JSON.stringify(row.relevance)}, and the benchmark's are all 1`);
    const id = text(row, "query_id", at);
    rel.set(id, [...(rel.get(id) ?? []), text(row, "skill_id", at)]);
  });
  const queries = readLines(queriesPath, lock.files[queriesName].records).map((row, i) => {
    const at = `${queriesPath}, line ${i + 1}`;
    const id = text(row, "id", at);
    const relevant = rel.get(id) ?? [];
    const listed = row.skill_ids;
    if (!Array.isArray(listed) || [...listed].sort().join() !== [...relevant].sort().join() || relevant.length === 0) throw new Error(`${at}: the qrels of ${id} are not the skill_ids of the query`);
    return { id, query: text(row, "query", at), relevant };
  });
  if (new Set(queries.map((q) => q.id)).size !== queries.length) throw new Error(`${queriesPath} has a query id twice`);
  return queries;
}

/** mulberry32: a small seeded generator, so a draw is the same on every machine. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` of the items, drawn at random under the seed and kept in their order. */
export function draw<T>(items: T[], n: number, seed: number): T[] {
  if (n > items.length) throw new Error(`cannot draw ${n} of ${items.length}`);
  const random = mulberry32(seed);
  const order = items.map((_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (order.length - i));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => items[i]);
}

/** How many queries need one, two or three skills: size to count. */
export function mix(queries: Query[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const q of queries) counts[q.relevant.length] = (counts[q.relevant.length] ?? 0) + 1;
  return counts;
}

/** The mix of `n` queries drawn in the proportions of these queries: whole shares first, the rest to the biggest fractions. */
export function proportional(queries: Query[], n: number): Record<number, number> {
  const sizes = Object.entries(mix(queries)).map(([size, count]) => ({ size: Number(size), share: (n * count) / queries.length }));
  const quota = Object.fromEntries(sizes.map((s) => [s.size, Math.floor(s.share)]));
  let left = n - Object.values(quota).reduce((a, b) => a + b, 0);
  for (const s of [...sizes].sort((a, b) => b.share - Math.floor(b.share) - (a.share - Math.floor(a.share)) || a.size - b.size)) {
    if (left-- > 0) quota[s.size]++;
  }
  return quota;
}

/** `quota[size]` queries of each size, drawn at random under the seed and kept in file order. It is never the first N. */
export function stratified(queries: Query[], quota: Record<number, number>, seed: number): Query[] {
  const picked = new Set(
    Object.entries(quota).flatMap(([size, n]) =>
      draw(
        queries.filter((q) => q.relevant.length === Number(size)),
        n,
        seed,
      ),
    ),
  );
  return queries.filter((q) => picked.has(q));
}

export interface Corpus {
  corpus: "public" | "private";
  skills: Skill[];
  queries: Query[];
  /** How the corpus was made, for summary.json. */
  sample: Record<string, unknown>;
}

const limited = (queries: Query[], limit: number | undefined): Query[] => (limit === undefined || limit >= queries.length ? queries : stratified(queries, proportional(queries, limit), SEED));

/** The test split: its skills and its queries, or `limit` of the queries, in the same mix of sizes. */
export function publicCorpus(assetsDir: string, limit?: number): Corpus {
  const all = readQueries(assetsDir, "test-queries.jsonl", "test-qrels.jsonl");
  const skills = readSkills(assetsDir, "test-skills.jsonl");
  const ids = new Set(skills.map((s) => s.id));
  if (all.some((q) => q.relevant.some((id) => !ids.has(id)))) throw new Error("a test query needs a skill that is not in the test split");
  const queries = limited(all, limit);
  return { corpus: "public", skills, queries, sample: { split: "test", seed: SEED, limit: limit ?? null, n_queries: queries.length, queries_per_size: mix(queries) } };
}

/**
 * A library the size of the test pool, drawn from the train skills, and queries for it: train queries whose skills
 * are all in it, drawn in the mix of the test queries, or `limit` of those in the same mix. The train pool shares no
 * skill with the test pool.
 */
export function privateCorpus(assetsDir: string, limit?: number): Corpus {
  const poolSize = readLock(assetsDir).files["test-skills.jsonl"].records;
  const testMix = mix(readQueries(assetsDir, "test-queries.jsonl", "test-qrels.jsonl"));
  const skills = draw(readSkills(assetsDir, "train-skills.jsonl"), poolSize, SEED);
  const ids = new Set(skills.map((s) => s.id));
  const eligible = readQueries(assetsDir, "train-queries.jsonl", "train-qrels.jsonl").filter((q) => q.relevant.every((id) => ids.has(id)));
  const drawn = stratified(eligible, testMix, SEED);
  const queries = limited(drawn, limit);
  return { corpus: "private", skills, queries, sample: { split: "train", seed: SEED, limit: limit ?? null, n_skills: skills.length, n_eligible_queries: eligible.length, n_queries: queries.length, queries_per_size: mix(queries) } };
}

/** Fetches what the corpus needs that is not in assets/ yet, and reads it. */
export async function loadCorpus(corpus: "public" | "private", assetsDir: string, limit?: number): Promise<Corpus> {
  await ensureFiles(assetsDir, corpus === "public" ? FILES.test : [...FILES.train, "test-queries.jsonl", "test-qrels.jsonl"]);
  return corpus === "public" ? publicCorpus(assetsDir, limit) : privateCorpus(assetsDir, limit);
}
