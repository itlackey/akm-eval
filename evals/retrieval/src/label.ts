#!/usr/bin/env bun
// retrieval label: makes assets/qrels.jsonl. For each task query it pools the top 10 of `akm search`, `akm curate`
// and a plain BM25 over the library, with the assets the author expected, and a judge model grades each pooled
// asset 0 to 3. A pair that is already in qrels.jsonl is never graded again, so the run can stop and resume.
// With --corpus own it does the same for the own set in private/retrieval/own/, from akm's results alone, and only
// with a judge on this machine or the local network, since the notes go to the judge. See ../README.md.
//
//   evals/retrieval/label [--corpus public|own] [--limit N]

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { type Sandbox, akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { localModelError } from "../../../lib/local-model.ts";
import * as akm from "./akm.ts";
import { Bm25 } from "./bm25.ts";
import { type Asset, DEPTH, GRADE_SCHEMA, MAX_DOC_CHARS, PROMPT_VERSION, type Query, isTask, judgeMessages, parseGrade, parseQueries, parseQrels, pool } from "./lib.ts";
import { type Folders, collectionsFor } from "./run.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const CONCURRENCY = 2;
const GIVE_UP_AFTER = 10; // grades that fail one after another, and the endpoint is not answering
type Corpus = "public" | "own";

const USAGE = `Usage: evals/retrieval/label [--corpus public|own] [--limit N]

Grades what akm search, akm curate and a plain BM25 return for each task query in assets/queries.jsonl, and the
assets the author expected, and appends the grades to assets/qrels.jsonl. A pair that already has a grade is
skipped, so run it again to resume.
The judge is the model in JUDGE_BASE_URL, JUDGE_API_KEY and JUDGE_MODEL (.env at the repository root).

  --corpus  public (default) grades the public library. own grades your own set in private/retrieval/own/, from what
            akm search and akm curate return for it (no BM25: the library is too big to list), and appends to its
            qrels.jsonl. It sends your notes to the judge, so it runs only when JUDGE_BASE_URL's host is, or resolves
            only to, an address on this machine or the private network.
  --limit   label only the first N task queries`;

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
  const base = baseUrl.replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
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

/** Grades the pairs, `concurrency` at a time, and appends each grade to the qrels file as it arrives. */
export async function grade(
  todo: Todo[],
  asset: (ref: string) => { asset: Asset; text: string },
  judge: Judge,
  qrelsPath: string,
  opts: { concurrency?: number; stop?: () => boolean; log?: (line: string) => void } = {},
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
      const { asset: a, text } = asset(t.ref);
      try {
        const messages = judgeMessages(t.query, a, text);
        let g = parseGrade(await judge(messages));
        if (!g) {
          out.retried++;
          g = parseGrade(await judge(messages));
        }
        if (!g) throw new Error("the reply holds no grade from 0 to 3, twice");
        appendFileSync(qrelsPath, `${JSON.stringify({ id: t.id, ref: t.ref, grade: g.grade, reason: g.reason })}\n`);
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
 * Labels one set: pools the results for its task queries, has the judge grade the pairs that have no grade yet, and
 * appends the grades to the set's qrels.jsonl. Returns the exit code. The public library is listed whole and read, so
 * its pool holds a plain BM25 over it. The own library is tens of thousands of assets, and akm lists 200 for a call:
 * its pool is what akm search and akm curate return, and what akm said of an asset is all label knows of it.
 */
export async function labelCollection(corpus: Corpus, ctx: { model: string; judge: Judge; limit?: number; newSandbox?: () => Sandbox }, folders: Folders): Promise<number> {
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
  const done = new Set(existsSync(qrelsPath) ? parseQrels(readFileSync(qrelsPath, "utf8"), name("qrels.jsonl")).map((r) => `${r.id}\t${r.ref}`) : []);

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

    // The own library has no listing: an asset is known by the first hit akm returned for it.
    const ask = async (system: "search" | "curate", q: string) => {
      const a = await akm.ask(sb, system, q);
      if (own) for (const h of a.assets) if (!byRef.has(h.ref)) byRef.set(h.ref, h);
      return a;
    };
    const pooled = await poolQueries(queries, ask, bm25);
    const todo = pending(queries, pooled, done);
    const poolSize = [...pooled.values()].reduce((n, refs) => n + refs.length, 0);
    console.log(`  ${poolSize} pooled pairs, ${poolSize - todo.length} already graded, ${todo.length} to grade, ${CONCURRENCY} at a time`);
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
      { stop: () => stopping, log: (l) => console.log(`  ${stamp()} ${l}`) },
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

async function main(): Promise<number> {
  let values: { corpus?: string; limit?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { corpus: { type: "string" }, limit: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`retrieval label: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const corpus = values.corpus ?? "public";
  if (corpus !== "public" && corpus !== "own") {
    console.error(`retrieval label: --corpus must be public or own, not "${corpus}"`);
    return 2;
  }
  const limit = values.limit === undefined ? undefined : Number(values.limit);
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) {
    console.error("retrieval label: --limit must be a positive integer");
    return 2;
  }
  const baseUrl = process.env.JUDGE_BASE_URL?.trim();
  const model = process.env.JUDGE_MODEL?.trim();
  if (!baseUrl || !model) {
    console.error("retrieval label: set JUDGE_BASE_URL and JUDGE_MODEL in .env (and JUDGE_API_KEY if the endpoint needs one). See .env.example.");
    return 2;
  }
  const refusal = corpus === "own" ? await localModelError(baseUrl, "JUDGE_BASE_URL", "--corpus own", "notes", "judge") : undefined;
  if (refusal) {
    console.error(`retrieval label: ${refusal}`);
    return 2;
  }
  const judge = makeJudge(baseUrl, process.env.JUDGE_API_KEY?.trim() ?? "", model, undefined, undefined, (ms, why) => console.log(`  ${stamp()} waiting ${Math.round(ms / 1000)} s: ${why}`));
  return labelCollection(corpus, { model, judge, limit }, collectionsFor(corpus)[0].folders);
}

if (import.meta.main) process.exit(await main());
