#!/usr/bin/env bun
// retrieval label: makes assets/qrels.jsonl. For each task query it pools the top 10 of `akm search`, `akm curate`
// and a plain BM25 over the library, with the assets the author expected, and a judge model grades each pooled
// asset 0 to 3. A pair that is already in qrels.jsonl is not graded again unless its asset changed since, so the run can
// stop and resume. With --from it pools the results of a run instead, the semantic columns too.
// With --cases DIR it does the same for a set of your own, from akm's results alone. See ../README.md.
//
//   evals/retrieval/label [--corpus public|custom] [--cases DIR] [--limit N] [--from RESULTS_DIR] [--judge-model ID] [--akm COMMAND]

import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, type Sandbox, akmUsage, akmVersion, completionsUrl, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { Fatal } from "../../../lib/cli.ts";
import { CORPUS_OPTIONS, type ResolvedCorpus, confirmCases, resolveCorpora } from "../../../lib/corpus.ts";
import { JUDGE_OPTIONS, type ModelSettings, judgeUsage, useJudge } from "../../../lib/models.ts";
import * as akm from "./akm.ts";
import { Bm25 } from "./bm25.ts";
import { type Asset, DEPTH, GRADE_SCHEMA, MAX_DOC_CHARS, PROMPT_SHA256, PROMPT_VERSION, type Qrel, type Query, SYSTEMS, assetSha256, isTask, judgeMessages, parseGrade, parseQueries, parseQrels, pool, qrelProvenance } from "./lib.ts";
import { libraryRefs } from "./library.ts";
import { type Folders, collectionsFor } from "./run.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const CONCURRENCY = 2;
const GIVE_UP_AFTER = 10; // grades that fail one after another, and the endpoint is not answering
type Corpus = "public" | "own";

const USAGE = `Usage: evals/retrieval/label [--corpus public|custom] [--cases DIR] [--limit N] [--from RESULTS_DIR] [--stamp-legacy] [--judge-model ID] [--akm COMMAND]

Grades what akm search, akm curate and a plain BM25 return for each task query in assets/queries.jsonl, and the
assets the author expected, and appends the grades to assets/qrels.jsonl. A pair that already has a grade is
skipped, so run it again to resume, unless the asset changed since it was graded: then it is graded again, and the
new grade replaces the old. Each grade is written with the judge, a digest of the prompt, the date and a digest of
the asset as the judge read it. A pair graded before label wrote them has none, and is never graded again until
--stamp-legacy gives it the digest of its asset as it is now.
The judge is the model in JUDGE_BASE_URL, JUDGE_API_KEY and JUDGE_MODEL (.env at the repository root), or the one --judge-model names.
Use one judge for a set: label warns when the qrels were graded by another, or have grades that record no judge.

  --corpus  public (default) grades the public library. custom grades a set of your own (--cases DIR; the default custom
            corpus, the rewrite, is not graded: generate carries the public grades over to it).
  --cases   the folder of your own set, in the format of "Run your own set" in evals/retrieval/README.md. It is graded from
            what akm search and akm curate return for it (no BM25: the library is too big to list), and the grades are appended
            to its qrels.jsonl. It sends your notes to the judge: it says which one and asks first, and -y or --yes skips the question.
  --stamp-legacy  gives every row of assets/qrels.jsonl that records no digest of its asset the digest of the asset as the
            library has it now, and judge "legacy" when it records no judge, so that a later edit to the asset grades the pair
            again. It grades nothing, calls no judge and runs no akm, and can be run again: it stamps only what is not stamped.
            It does not change a grade. For the public library only.
  --limit   label only the first N task queries
  --from    pool the first ${DEPTH} results of every column of a run, semantic search included, from the samples.jsonl of
            RESULTS_DIR (a results folder of evals/retrieval/run of this set), instead of the pool above, and grade what
            has no grade yet. This is how results that nobody judged get judged. The run must be of the same corpus
            and collection, and of this library: a result that akm does not list in it is left out.
${judgeUsage}
${akmUsage}`;

type Message = ReturnType<typeof judgeMessages>[number];
export type Judge = (messages: Message[]) => Promise<string>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
    /** How long the server asked us to wait, from its Retry-After header. */
    readonly retryAfterMs?: number,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

const RETRY_STATUS = [408, 425, 429, 500, 502, 503, 504];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The judge as a chat endpoint, for a local server such as llama.cpp: temperature 0, every spelling of "no visible
 * thinking" that a server might honour, and a JSON schema for the reply. When the endpoint refuses the schema (a 4xx
 * that is not a 429) the request is sent again without it. max_tokens leaves room for a model that thinks anyway.
 * A cloud endpoint can answer 400 to the thinking switches: run it through a local gateway.
 *
 * When the server says to wait (429 with Retry-After), every request of this judge waits, not only the one refused.
 */
export function makeJudge(baseUrl: string, apiKey: string, model: string, timeoutMs = 120_000, backoffMs = 2000, onWait: (ms: number, why: string) => void = () => {}): Judge {
  const url = completionsUrl(baseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
  let pausedUntil = 0;

  const post = async (payload: unknown): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      if (pausedUntil > Date.now()) await sleep(pausedUntil - Date.now());
      try {
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return await res.text();
        const wait = Number(res.headers.get("retry-after"));
        throw new HttpError(res.status, await res.text(), wait > 0 ? Math.min(wait, 120) * 1000 : undefined);
      } catch (e) {
        const retryable = !(e instanceof HttpError) || RETRY_STATUS.includes(e.status);
        if (attempt >= 5 || !retryable) throw e;
        const delay = (e instanceof HttpError && e.retryAfterMs) || Math.min(backoffMs * 2 ** attempt, 30_000);
        if (pausedUntil < Date.now()) onWait(delay, (e as Error).message.slice(0, 80));
        pausedUntil = Math.max(pausedUntil, Date.now() + delay);
      }
    }
  };

  return async (messages) => {
    const payload = {
      model,
      messages,
      temperature: 0,
      max_tokens: 2000,
      stream: false,
      // every spelling of "no visible thinking" that a server might honour
      chat_template_kwargs: { enable_thinking: false },
      enable_thinking: false,
      reasoning_effort: "none",
    };
    let raw: string;
    try {
      raw = await post({ ...payload, response_format: { type: "json_schema", json_schema: { name: "umbrela_grade", schema: GRADE_SCHEMA, strict: true } } });
    } catch (e) {
      if (!(e instanceof HttpError) || e.status >= 500 || e.status === 429 || e.status < 400) throw e;
      raw = await post(payload);
    }
    const message = (JSON.parse(raw) as { choices: { message: { content?: string; reasoning_content?: string; reasoning?: string } }[] }).choices[0].message;
    // A reasoning model that ran out of room can leave its answer in the reasoning text. parseGrade finds it there.
    return message.content?.trim() ? message.content : (message.reasoning_content ?? message.reasoning ?? "");
  };
}

/** For each task query, the assets its pool holds: the top `depth` of akm search, akm curate and BM25, and the assets the author expected. */
export async function poolQueries(queries: Query[], ask: (system: "search" | "curate", query: string) => Promise<akm.Answer>, bm25: Bm25, depth = DEPTH): Promise<Map<string, string[]>> {
  const pooled = new Map<string, string[]>();
  for (const q of queries) {
    const search = await ask("search", q.query);
    const curate = await ask("curate", q.query);
    for (const a of [search, curate]) if (a.error) throw new Error(`${q.id}: ${a.error}`);
    pooled.set(q.id, pool([search.refs, curate.refs, bm25.search(q.query, depth), q.expected ?? []], depth));
  }
  return pooled;
}

/**
 * For each task query, the pool a results folder gives: the first `depth` results of every column the run had (search and curate, on the
 * keyword index and on the semantic one), and the assets the author expected, each once. `samples` is the text of the run's samples.jsonl.
 * A query the run does not have, as in a run with --limit, has no entry.
 */
export function poolFromSamples(queries: Query[], samples: string, depth = DEPTH, where = "samples.jsonl"): Map<string, string[]> {
  const rows = new Map<string, Record<string, { refs?: unknown } | undefined>>();
  samples.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let row: Record<string, { refs?: unknown } | undefined> & { id?: unknown };
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error(`${where}:${i + 1} is not valid JSON`);
    }
    if (typeof row !== "object" || row === null || typeof row.id !== "string") throw new Error(`${where}:${i + 1} has no string "id"`);
    rows.set(row.id, row);
  });
  const pooled = new Map<string, string[]>();
  for (const q of queries) {
    const row = rows.get(q.id);
    if (!row) continue;
    const lists = SYSTEMS.map((sys) => row[sys]?.refs).filter((refs): refs is string[] => Array.isArray(refs) && refs.every((r) => typeof r === "string"));
    pooled.set(q.id, pool([...lists, q.expected ?? []], depth));
  }
  return pooled;
}

/** The corpus a summary says it ran on: `public`, or what is not (`custom`, or `private` and `own` for a run from before the corpora were renamed). */
const ranOn = (summary: { corpus?: unknown }): string => String(summary.corpus);

/**
 * The samples.jsonl of a results folder of `run`, after checking that the run is of the set that `label` grades: the library of the
 * public corpus, or the own set. Throws an Error that says what is wrong.
 */
export function readRun(dir: string, corpus: Corpus): string {
  const summaryFile = join(dir, "summary.json");
  const samplesFile = join(dir, "samples.jsonl");
  if (!existsSync(summaryFile) || !existsSync(samplesFile)) throw new Error(`${dir} is not a results folder of evals/retrieval/run: it needs a summary.json and a samples.jsonl.`);
  let summary: { eval?: unknown; corpus?: unknown; collection?: unknown };
  try {
    summary = JSON.parse(readFileSync(summaryFile, "utf8"));
  } catch {
    throw new Error(`${summaryFile} is not valid JSON`);
  }
  const collection = corpus === "own" ? "own" : "library";
  if (summary.eval !== "retrieval" || (ranOn(summary) === "public") !== (corpus === "public") || summary.collection !== collection) {
    throw new Error(`${dir} is a run of ${summary.eval === "retrieval" ? `the ${String(summary.collection)} collection of the ${ranOn(summary)} corpus` : "another eval"}, and this grades the ${collection} collection of the ${corpus === "public" ? "public" : "custom"} corpus. Pass the results folder of that run.`);
  }
  return readFileSync(samplesFile, "utf8");
}

/** The pairs of the qrels, `id\tref`, whose last row was graded from an asset that has another digest now. `current` is the digest of an asset today, or undefined for one that cannot be read. A row with no digest is never stale. */
export function staleKeys(qrels: Qrel[], current: (ref: string) => string | undefined): Set<string> {
  const last = new Map<string, Qrel>();
  for (const r of qrels) last.set(`${r.id}\t${r.ref}`, r);
  const stale = new Set<string>();
  for (const [key, r] of last) {
    if (r.asset_sha256 === undefined) continue;
    const now = current(r.ref);
    if (now !== undefined && now !== r.asset_sha256) stale.add(key);
  }
  return stale;
}

export interface Todo {
  id: string;
  query: string;
  ref: string;
}

/** The pooled pairs that have no grade yet, in query order. */
export function pending(queries: Query[], pooled: Map<string, string[]>, done: Set<string>): Todo[] {
  return queries.flatMap((q) => (pooled.get(q.id) ?? []).filter((ref) => !done.has(`${q.id}\t${ref}`)).map((ref) => ({ id: q.id, query: q.query, ref })));
}

export interface Outcome {
  total: number;
  graded: number;
  failed: number;
  /** Replies that held no grade the first time and were asked for again. */
  retried: number;
  stopped: boolean;
  /** The run ended because GIVE_UP_AFTER grades failed one after another. */
  gaveUp: boolean;
  lastError?: string;
}

/**
 * Grades the pairs, `concurrency` at a time, and appends each grade to the qrels file as it arrives, with the judge `model`, the digest of
 * the prompt, the date and the digest of the asset as the judge read it. A pair whose asset cannot be found counts as failed, and the rest go on.
 */
export async function grade(
  todo: Todo[],
  asset: (ref: string) => { asset: Asset; text: string },
  judge: Judge,
  qrelsPath: string,
  opts: { model: string; date?: string; concurrency?: number; stop?: () => boolean; log?: (line: string) => void },
): Promise<Outcome> {
  const log = opts.log ?? (() => {});
  const out: Outcome = { total: todo.length, graded: 0, failed: 0, retried: 0, stopped: false, gaveUp: false };
  let next = 0;
  let inARow = 0;
  const worker = async () => {
    while (next < todo.length && inARow < GIVE_UP_AFTER) {
      if (opts.stop?.()) {
        out.stopped = true;
        return;
      }
      const t = todo[next++];
      let found: { asset: Asset; text: string };
      try {
        found = asset(t.ref);
      } catch (e) {
        // The endpoint did nothing wrong, so this does not count toward giving up.
        out.failed++;
        out.lastError = (e as Error).message;
        log(`[${out.graded + out.failed}/${todo.length}] ${t.id} FAILED  ${t.ref}  ${(e as Error).message.slice(0, 150)}`);
        continue;
      }
      const { asset: a, text } = found;
      try {
        const messages = judgeMessages(t.query, a, text);
        let g = parseGrade(await judge(messages));
        if (!g) {
          out.retried++;
          g = parseGrade(await judge(messages));
        }
        if (!g) throw new Error("the reply holds no grade from 0 to 3, twice");
        const row: Qrel = { id: t.id, ref: t.ref, grade: g.grade, reason: g.reason, judge: opts.model, prompt_sha256: PROMPT_SHA256, date: opts.date ?? new Date().toISOString().slice(0, 10), asset_sha256: assetSha256(a.ref, text) };
        appendFileSync(qrelsPath, `${JSON.stringify(row)}\n`);
        out.graded++;
        inARow = 0;
        log(`[${out.graded + out.failed}/${todo.length}] ${t.id} grade ${g.grade}  ${t.ref}`);
      } catch (e) {
        out.failed++;
        inARow++;
        out.lastError = (e as Error).message;
        log(`[${out.graded + out.failed}/${todo.length}] ${t.id} FAILED  ${t.ref}  ${(e as Error).message.slice(0, 150)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? CONCURRENCY, Math.max(todo.length, 1)) }, worker));
  out.gaveUp = inARow >= GIVE_UP_AFTER;
  return out;
}

const stamp = () => new Date().toTimeString().slice(0, 8);

/**
 * Labels one set: pools the results for its task queries, has the judge grade the pairs that have no grade yet, or whose
 * asset has changed since the grade was made, and appends the grades to the set's qrels.jsonl. A grade that is made again comes
 * after the old one, which a later row of a pair replaces. With `ctx.from`, a results folder of `run`, the pool is what that
 * run returned in every column, semantic search included, in place of the keyword search, curate and BM25 pool. Returns the exit code. The public library is listed whole and read, so
 * its pool holds a plain BM25 over it. The own library is tens of thousands of assets, and akm lists 200 for a call:
 * its pool is what akm search and akm curate return, and what akm said of an asset is all label knows of it.
 */
export async function labelCollection(corpus: Corpus, ctx: { model: string; judge: Judge; limit?: number; from?: string; newSandbox?: () => Sandbox }, folders: Folders): Promise<number> {
  const own = corpus === "own";
  const name = (file: string) => (own ? `private/retrieval/own/${file}` : `assets/${file}`);
  const queriesPath = join(folders.assets, "queries.jsonl");
  const qrelsPath = join(folders.assets, "qrels.jsonl");
  const missing = [folders.library, queriesPath].find((p) => !existsSync(p));
  if (missing) {
    console.error(`retrieval label: ${relative(ROOT, missing)} is missing.${own ? ' Your own set goes in private/retrieval/own/: see "Run your own set" in evals/retrieval/README.md.' : ""}`);
    return 2;
  }
  const queries = parseQueries(readFileSync(queriesPath, "utf8"), name("queries.jsonl"))
    .filter(isTask)
    .slice(0, ctx.limit);
  const existing = existsSync(qrelsPath) ? parseQrels(readFileSync(qrelsPath, "utf8"), name("qrels.jsonl")) : [];
  let samples: string | undefined;
  if (ctx.from !== undefined) {
    try {
      samples = readRun(ctx.from, corpus);
    } catch (e) {
      console.error(`retrieval label: ${(e as Error).message}`);
      return 2;
    }
  }

  const stops: (() => void)[] = [];
  const sb = (ctx.newSandbox ?? (() => createSandbox("retrieval")))();
  try {
    const version = await akmVersion(sb);
    const nAssets = await akm.load(sb, folders.library, folders.bundles);
    const listing: Asset[] = own ? [] : await akm.assets(sb, nAssets);
    const byRef = new Map(listing.map((a) => [a.ref, a]));
    const texts = new Map(listing.map((a) => [a.ref, readFileSync(join(folders.library, a.path), "utf8")]));
    const bm25 = new Bm25(listing.map((a) => ({ ref: a.ref, text: `${a.ref}\n${texts.get(a.ref)}` })));
    for (const q of queries) {
      for (const ref of q.expected ?? []) {
        if (byRef.has(ref)) continue;
        console.error(`retrieval label: ${q.id} expects ${ref}, which is not an asset akm indexes in the library${own ? " (the own library is not listed, so expected assets cannot be looked up)" : ""}`);
        return 2;
      }
    }
    console.log(`retrieval label${own ? " (own)" : ""}: akm ${version}, ${nAssets} assets, ${queries.length} task queries, judge ${ctx.model}, prompt ${PROMPT_VERSION}, first ${MAX_DOC_CHARS} characters of each asset`);
    // The last row of each pair is the grade in force. A row that records no judge is of one who is not known, and this run's grades sit beside it.
    const { judges, unrecorded } = qrelProvenance(existing);
    const others = judges.filter((j) => j !== ctx.model);
    const mixed = [...(others.length > 0 ? [`grades by ${others.join(", ")}`] : []), ...(unrecorded > 0 ? [`${unrecorded} grades that record no judge`] : [])];
    if (mixed.length > 0) console.error(`retrieval label: warning: ${name("qrels.jsonl")} has ${mixed.join(" and ")}, and this run grades with ${ctx.model}. Grades of different judges do not mix cleanly: use one judge for a set.`);

    // The own library has no listing: an asset is known by the first hit akm returned for it.
    const ask = async (system: "search" | "curate", q: string) => {
      const a = await akm.ask(sb, system, q);
      if (own) for (const h of a.assets) if (!byRef.has(h.ref)) byRef.set(h.ref, h);
      return a;
    };
    let pooled: Map<string, string[]>;
    if (samples === undefined) {
      pooled = await poolQueries(queries, ask, bm25);
    } else {
      // An own library has no listing: what akm says of an asset comes from the hits it returns for the query now.
      if (own) {
        for (const q of queries) {
          await ask("search", q.query);
          await ask("curate", q.query);
        }
      }
      pooled = poolFromSamples(queries, samples, DEPTH, `${ctx.from}/samples.jsonl`);
      let unknown = 0;
      for (const [id, refs] of pooled) {
        const known = refs.filter((ref) => byRef.has(ref));
        unknown += refs.length - known.length;
        pooled.set(id, known);
      }
      const absent = queries.filter((q) => !pooled.has(q.id)).length;
      console.log(`  pool from ${ctx.from}: ${queries.length - absent} of ${queries.length} task queries are in the run${unknown > 0 ? `, and ${unknown} of its results are not assets of this ${own ? "set as akm returns it now" : "library"} and are left out` : ""}`);
    }
    // A pair whose asset is not what the judge read is graded again. A pair graded before label wrote digests has none, and stays.
    const digestOf = (ref: string): string | undefined => {
      const a = byRef.get(ref);
      if (!a) return undefined;
      try {
        return assetSha256(ref, texts.get(ref) ?? readFileSync(resolve(folders.library, a.path), "utf8"));
      } catch {
        return undefined;
      }
    };
    const inScope = new Set(queries.map((q) => q.id));
    const stale = staleKeys(existing.filter((r) => inScope.has(r.id)), digestOf);
    for (const key of stale) {
      const [id, ref] = key.split("\t");
      const refs = pooled.get(id) ?? [];
      if (!refs.includes(ref)) pooled.set(id, [...refs, ref]);
    }
    const done = new Set(existing.map((r) => `${r.id}\t${r.ref}`).filter((key) => !stale.has(key)));
    const todo = pending(queries, pooled, done);
    const poolSize = [...pooled.values()].reduce((n, refs) => n + refs.length, 0);
    console.log(`  ${poolSize} pooled pairs, ${poolSize - todo.length} already graded, ${todo.length} to grade, ${CONCURRENCY} at a time${stale.size > 0 ? ` (${stale.size} of them were graded from an asset that has changed since)` : ""}`);
    if (todo.length === 0) return 0;

    let stopping = false;
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      const onSignal = () => {
        stopping = true;
        console.log(`\n${sig}: finishing the grades in flight, then stopping. Run it again to resume.`);
      };
      process.on(sig, onSignal);
      stops.push(() => process.off(sig, onSignal));
    }
    const started = Date.now();
    const out = await grade(
      todo,
      (ref) => {
        const a = byRef.get(ref);
        if (!a) throw new Error(`akm returned ${ref}, which is not in its own asset listing`);
        return { asset: a, text: texts.get(ref) ?? readFileSync(resolve(folders.library, a.path), "utf8") };
      },
      ctx.judge,
      qrelsPath,
      { model: ctx.model, stop: () => stopping, log: (l) => console.log(`  ${stamp()} ${l}`) },
    );
    const minutes = ((Date.now() - started) / 60_000).toFixed(1);
    console.log(`retrieval label: ${out.graded} graded, ${out.failed} failed, ${todo.length - out.graded - out.failed} left, in ${minutes} min (prompt ${PROMPT_VERSION}, model ${ctx.model}). ${out.retried} replies had no grade and were asked for again.`);
    if (out.gaveUp) console.log(`  It stopped after ${GIVE_UP_AFTER} failures in a row. The last error: ${out.lastError}. Run it again to resume.`);
    return out.graded === todo.length ? 0 : 1;
  } finally {
    for (const stop of stops) stop();
    removeSandbox(sb);
  }
}

/** The judge of the rows that were graded before label recorded one. The library's are known to be graded by one model (assets/README.md), but the rows do not say which. */
export const LEGACY_JUDGE = "legacy";

export interface Stamped {
  /** Rows given the digest of their asset. */
  stamped: number;
  /** Rows that had one already, or that a later row of their pair replaced. */
  left: number;
  /** The refs of rows that name no file of the library. Nothing is written while there is one. */
  missing: string[];
}

/**
 * Gives every row of the qrels at `qrelsPath` that records no `asset_sha256` the digest of its asset as the library at `library` has it now,
 * and the judge "legacy" when it records no judge, so that a later edit to the asset makes label grade the pair again. A grade is never
 * changed. Only the last row of a pair is stamped: an older row of a pair that was graded again is history, and the text it was graded
 * from is not the text of today. The file is written again only when every row's ref names a file of the library, and then in one move.
 * The refs of the files are worked out from the files alone (library.ts), which is how the public library is known to be laid out for akm,
 * so akm is not run. Stamping again stamps nothing.
 */
export function stampLegacy(qrelsPath: string, library: string): Stamped {
  const lines = readFileSync(qrelsPath, "utf8").split("\n");
  const rows = lines.map((line) => (line.trim() ? (JSON.parse(line) as Qrel) : null));
  const last = new Map<string, number>();
  rows.forEach((r, i) => r && last.set(`${r.id}\t${r.ref}`, i));
  const files = libraryRefs(library);
  const missing: string[] = [];
  const out = [...lines];
  let stamped = 0;
  let left = 0;
  rows.forEach((r, i) => {
    if (r === null) return;
    if (r.asset_sha256 !== undefined || last.get(`${r.id}\t${r.ref}`) !== i) return void left++;
    const file = files.get(r.ref)?.[0];
    if (file === undefined) return void missing.push(r.ref);
    out[i] = JSON.stringify({ ...r, judge: r.judge ?? LEGACY_JUDGE, asset_sha256: assetSha256(r.ref, readFileSync(join(library, file), "utf8")) });
    stamped++;
  });
  if (missing.length > 0 || stamped === 0) return { stamped: 0, left, missing: [...new Set(missing)] };
  writeFileSync(`${qrelsPath}.new`, out.join("\n"));
  renameSync(`${qrelsPath}.new`, qrelsPath);
  return { stamped, left, missing: [] };
}

async function main(): Promise<number> {
  let values: { corpus?: string; cases?: string; yes?: boolean; limit?: string; from?: string; "stamp-legacy"?: boolean; "judge-model"?: string; akm?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { ...CORPUS_OPTIONS, limit: { type: "string" }, from: { type: "string" }, "stamp-legacy": { type: "boolean" }, ...JUDGE_OPTIONS, ...AKM_OPTIONS, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`retrieval label: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const stop = (message: string): never => {
    throw new Error(message);
  };
  let corpora: ResolvedCorpus[];
  try {
    corpora = resolveCorpora({ eval: "retrieval", values, publicFolder: join(EVAL_DIR, "assets"), fail: stop });
  } catch (e) {
    console.error(`retrieval label: ${(e as Error).message}`);
    return 2;
  }
  const [chosen] = corpora;
  if (corpora.length > 1 || chosen.rewrite) {
    console.error(`retrieval label: ${corpora.length > 1 ? "--corpus all is for run" : "the rewrite in private/retrieval/assets is not graded: generate carries the public grades over to it"}. Grade the public library (the default), or a set of your own with --cases DIR.`);
    return 2;
  }
  const corpus: Corpus = chosen.name === "custom" ? "own" : "public";
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
    console.error("retrieval label: --limit must be a positive integer");
    return 2;
  }
  if (values.from !== undefined && !values.from.trim()) {
    console.error("retrieval label: --from needs the results folder of a run");
    return 2;
  }
  const folders = collectionsFor(chosen)[0].folders;
  if (values["stamp-legacy"]) {
    if (corpus === "own") {
      console.error("retrieval label: --stamp-legacy is for the public library, whose refs are worked out from its files. To have your own set's grades checked against its assets, grade them again with label.");
      return 2;
    }
    const qrels = join(folders.assets, "qrels.jsonl");
    const done = stampLegacy(qrels, folders.library);
    if (done.missing.length > 0) {
      console.error(`retrieval label: ${done.missing.length} refs of ${relative(ROOT, qrels)} name no file of the library, such as ${done.missing.slice(0, 3).join(", ")}. Nothing was changed.`);
      return 1;
    }
    console.log(`retrieval label: stamped ${done.stamped} rows of ${relative(ROOT, qrels)} with the digest of their asset${done.stamped > 0 ? ` (judge "${LEGACY_JUDGE}" where none was recorded)` : ""}; ${done.left} rows already had one or were replaced by a later row of their pair.`);
    return 0;
  }
  let judgeSettings: ModelSettings;
  try {
    useAkm(values, stop);
    judgeSettings = useJudge(values, stop);
  } catch (e) {
    console.error(`retrieval label: ${(e as Error).message}`);
    return 2;
  }
  const { baseUrl, name: model } = judgeSettings;
  try {
    await confirmCases(values, [{ role: "judge", name: model, baseUrl }]);
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`retrieval label: ${e.message}`);
    return e.code;
  }
  const judge = makeJudge(baseUrl, judgeSettings.apiKey, model, undefined, undefined, (ms, why) => console.log(`  ${stamp()} waiting ${Math.round(ms / 1000)} s: ${why}`));
  return labelCollection(corpus, { model, judge, limit, from: values.from === undefined ? undefined : resolve(values.from) }, folders);
}

if (import.meta.main) process.exit(await main());
