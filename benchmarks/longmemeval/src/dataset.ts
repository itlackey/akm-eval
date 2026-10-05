// The dataset: fetched at run time from the revision pinned in assets/ASSETS.lock and checked against
// its checksum, read, and sampled. The data is never committed.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Turn } from "./prompts.ts";

export const DATA_FILE = "longmemeval_s_cleaned.json";

export interface LockedFile {
  url: string;
  bytes: number;
  sha256: string;
}

export interface Lock {
  dataset: string;
  source: string;
  licence: string;
  revision: string;
  files: Record<string, LockedFile>;
}

export function readLock(assetsDir: string): Lock {
  const lock = JSON.parse(readFileSync(join(assetsDir, "ASSETS.lock"), "utf8")) as Lock;
  if (!lock.revision || !lock.files?.[DATA_FILE]?.sha256) throw new Error(`${join(assetsDir, "ASSETS.lock")} does not pin ${DATA_FILE}`);
  return lock;
}

export async function sha256File(path: string): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  for await (const chunk of Bun.file(path).stream()) hasher.update(chunk);
  return hasher.digest("hex");
}

async function download(file: LockedFile, target: string, log: (line: string) => void): Promise<void> {
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
      const tenth = Math.floor((bytes / file.bytes) * 10);
      if (tenth > shown) log(`longmemeval: fetching ${DATA_FILE}: ${(shown = tenth) * 10}%`);
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
 * The path of the public dataset. A copy that is already in assets/ is used when it matches the pinned
 * checksum, and nothing is fetched. Otherwise it is fetched from the pinned revision, up to three tries.
 */
export async function ensureDataset(assetsDir: string, log: (line: string) => void = console.error, retryDelayMs = 3000): Promise<string> {
  const lock = readLock(assetsDir);
  const file = lock.files[DATA_FILE];
  const target = join(assetsDir, DATA_FILE);
  if (existsSync(target)) {
    const sha256 = await sha256File(target);
    if (sha256 !== file.sha256) throw new Error(`${target} has sha256 ${sha256}, not the ${file.sha256} that ASSETS.lock pins. Move it aside and run again to fetch it.`);
    return target;
  }
  mkdirSync(assetsDir, { recursive: true });
  log(`longmemeval: fetching ${DATA_FILE} (${Math.round(file.bytes / 1e6)} MB) from ${lock.source}, revision ${lock.revision.slice(0, 12)}`);
  for (let attempt = 1; ; attempt++) {
    try {
      await download(file, target, log);
      return target;
    } catch (e) {
      if (attempt >= 3) throw new Error(`could not fetch ${DATA_FILE}: ${(e as Error).message}`);
      log(`longmemeval: the fetch failed (${(e as Error).message}). Trying again.`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
  }
}

export interface Question {
  question_id: string;
  question_type: string;
  question: string;
  question_date: string;
  answer: string | number;
  answer_session_ids: string[];
  haystack_dates: string[];
  haystack_session_ids: string[];
  haystack_sessions: Turn[][];
}

export const QUESTION_TYPES = ["single-session-user", "single-session-assistant", "single-session-preference", "multi-session", "temporal-reasoning", "knowledge-update"];

export function parseQuestions(text: string, where = "the dataset"): Question[] {
  const data = JSON.parse(text) as Question[];
  if (!Array.isArray(data) || data.length === 0) throw new Error(`${where} is not a list of questions`);
  data.forEach((q, i) => {
    const at = `${where}, question ${i + 1}`;
    for (const key of ["question_id", "question_type", "question", "question_date"] as const) {
      if (typeof q[key] !== "string") throw new Error(`${at} has no string "${key}"`);
    }
    if (!QUESTION_TYPES.includes(q.question_type)) throw new Error(`${at} has the unknown type "${q.question_type}"`);
    if (typeof q.answer !== "string" && typeof q.answer !== "number") throw new Error(`${at} has no answer`);
    for (const key of ["answer_session_ids", "haystack_dates", "haystack_session_ids", "haystack_sessions"] as const) {
      if (!Array.isArray(q[key])) throw new Error(`${at} has no list "${key}"`);
    }
    if (q.haystack_dates.length !== q.haystack_sessions.length || q.haystack_session_ids.length !== q.haystack_sessions.length) {
      throw new Error(`${at} has haystack lists of different lengths`);
    }
  });
  return data;
}

export function loadQuestions(path: string): Question[] {
  return parseQuestions(readFileSync(path, "utf8"), path);
}

/** mulberry32: a small seeded generator, so a sample is the same on every machine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Sample {
  items: Question[];
  order: "full" | "stratified-seeded";
  seed: number | null;
  n: number;
  total: number;
  per_type: Record<string, number>;
}

/**
 * All the questions, or `limit` of them: drawn at random under the seed, in proportion to the size of each
 * question type, and kept in file order. It is never the first N, which would be one type.
 */
export function sampleQuestions(questions: Question[], limit: number | undefined, seed: number): Sample {
  const count = (qs: Question[]) => Object.fromEntries(QUESTION_TYPES.map((t) => [t, qs.filter((q) => q.question_type === t).length]).filter(([, n]) => (n as number) > 0));
  if (limit === undefined || limit >= questions.length) {
    return { items: questions, order: "full", seed: null, n: questions.length, total: questions.length, per_type: count(questions) };
  }
  const random = mulberry32(seed);
  const types = QUESTION_TYPES.filter((t) => questions.some((q) => q.question_type === t));
  const groups = new Map(types.map((t) => [t, questions.map((q, i) => (q.question_type === t ? i : -1)).filter((i) => i >= 0)]));
  // Whole shares first, then the leftover places go to the types with the biggest fractions, ties by the seed.
  const tiebreak = new Map(types.map((t) => [t, random()]));
  const exact = new Map(types.map((t) => [t, (limit * (groups.get(t) as number[]).length) / questions.length]));
  const quota = new Map(types.map((t) => [t, Math.floor(exact.get(t) as number)]));
  let left = limit - [...quota.values()].reduce((a, b) => a + b, 0);
  const byFraction = [...types].sort((a, b) => (exact.get(b) as number) - (quota.get(b) as number) - ((exact.get(a) as number) - (quota.get(a) as number)) || (tiebreak.get(a) as number) - (tiebreak.get(b) as number));
  for (const t of byFraction) {
    if (left-- <= 0) break;
    quota.set(t, (quota.get(t) as number) + 1);
  }
  const chosen: number[] = [];
  for (const t of types) {
    const indices = [...(groups.get(t) as number[])];
    const take = quota.get(t) as number;
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(random() * (indices.length - i));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    chosen.push(...indices.slice(0, take));
  }
  chosen.sort((a, b) => a - b);
  const items = chosen.map((i) => questions[i]);
  return { items, order: "stratified-seeded", seed, n: items.length, total: questions.length, per_type: count(items) };
}
