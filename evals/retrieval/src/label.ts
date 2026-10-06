#!/usr/bin/env bun
// retrieval label: makes assets/qrels.jsonl. For each task query it pools the top 10 of `akm search`, `akm curate`
// and a plain BM25 over the library, with the assets the author expected, and a judge model grades each pooled
// asset 0 to 3. A pair that is already in qrels.jsonl is never graded again, so the run can stop and resume.
// See ../README.md.
//
//   evals/retrieval/label [--limit N]

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import * as akm from "./akm.ts";
import { Bm25 } from "./bm25.ts";
import { type Asset, DEPTH, GRADE_SCHEMA, PROMPT_VERSION, type Query, isTask, judgeMessages, parseGrade, parseQueries, parseQrels, pool } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const CONCURRENCY = 2;
const GIVE_UP_AFTER = 10; // grades that fail one after another, and the endpoint is not answering

const USAGE = `Usage: evals/retrieval/label [--limit N]

Grades what akm search, akm curate and a plain BM25 return for each task query in assets/queries.jsonl, and the
assets the author expected, and appends the grades to assets/qrels.jsonl. A pair that already has a grade is
skipped, so run it again to resume.
The judge is the model in JUDGE_BASE_URL, JUDGE_API_KEY and JUDGE_MODEL (.env at the repository root).

  --limit  label only the first N task queries`;

type Message = ReturnType<typeof judgeMessages>[number];
export type Judge = (messages: Message[]) => Promise<string>;

class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`);
  }
}

const RETRY_STATUS = [408, 425, 429, 500, 502, 503, 504];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The judge as a chat endpoint: temperature 0, no thinking, a JSON schema for the reply, and a retry without the schema when the endpoint refuses it. */
export function makeJudge(baseUrl: string, apiKey: string, model: string, timeoutMs = 120_000, backoffMs = 2000): Judge {
  const base = baseUrl.replace(/\/+$/, "");
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };

  const post = async (payload: unknown): Promise<string> => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
        if (res.ok) return await res.text();
        throw new HttpError(res.status, await res.text());
      } catch (e) {
        const retryable = !(e instanceof HttpError) || RETRY_STATUS.includes(e.status);
        if (attempt >= 5 || !retryable) throw e;
        await sleep(Math.min(backoffMs * 2 ** attempt, 30_000));
      }
    }
  };

  return async (messages) => {
    const payload = {
      model,
      messages,
      temperature: 0,
      stream: false,
      // every spelling of "no visible reasoning" a server might honour
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
    const message = (JSON.parse(raw) as { choices: { message: { content?: string; reasoning_content?: string } }[] }).choices[0].message;
    let text = message.content ?? "";
    if (!text.trim() && message.reasoning_content?.includes("{")) text = message.reasoning_content.slice(message.reasoning_content.indexOf("{"), message.reasoning_content.lastIndexOf("}") + 1);
    return text;
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
  stopped: boolean;
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
  const out: Outcome = { total: todo.length, graded: 0, failed: 0, stopped: false };
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
        const g = parseGrade(await judge(judgeMessages(t.query, a, text)));
        if (!g) throw new Error("the reply holds no grade from 0 to 3");
        appendFileSync(qrelsPath, `${JSON.stringify({ id: t.id, ref: t.ref, grade: g.grade, reason: g.reason })}\n`);
        out.graded++;
        inARow = 0;
        log(`[${out.graded + out.failed}/${todo.length}] ${t.id} grade ${g.grade}  ${t.ref}`);
      } catch (e) {
        out.failed++;
        inARow++;
        log(`[${out.graded + out.failed}/${todo.length}] ${t.id} FAILED  ${t.ref}  ${(e as Error).message.slice(0, 150)}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? CONCURRENCY, Math.max(todo.length, 1)) }, worker));
  return out;
}

async function main(): Promise<number> {
  let values: { limit?: string; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { limit: { type: "string" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`retrieval label: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
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
  const qrelsPath = join(EVAL_DIR, "assets", "qrels.jsonl");
  const queries = parseQueries(readFileSync(join(EVAL_DIR, "assets", "queries.jsonl"), "utf8"), "assets/queries.jsonl")
    .filter(isTask)
    .slice(0, limit);
  const done = new Set(existsSync(qrelsPath) ? parseQrels(readFileSync(qrelsPath, "utf8"), "assets/qrels.jsonl").map((r) => `${r.id}\t${r.ref}`) : []);

  const sb = createSandbox("retrieval");
  try {
    const version = await akmVersion(sb);
    const listing = await akm.assets(sb, await akm.load(sb, join(ROOT, "corpus", "library")));
    const byRef = new Map(listing.map((a) => [a.ref, a]));
    const texts = new Map(listing.map((a) => [a.ref, readFileSync(join(ROOT, "corpus", "library", a.path), "utf8")]));
    const bm25 = new Bm25(listing.map((a) => ({ ref: a.ref, text: `${a.ref}\n${texts.get(a.ref)}` })));
    for (const q of queries) {
      for (const ref of q.expected ?? []) {
        if (byRef.has(ref)) continue;
        console.error(`retrieval label: ${q.id} expects ${ref}, which is not an asset akm indexes in the library`);
        return 2;
      }
    }
    console.log(`retrieval label: akm ${version}, ${listing.length} assets, ${queries.length} task queries, judge ${model}`);

    const pooled = await poolQueries(queries, (system, q) => akm.ask(sb, system, q), bm25);
    const todo = pending(queries, pooled, done);
    const poolSize = [...pooled.values()].reduce((n, refs) => n + refs.length, 0);
    console.log(`  ${poolSize} pooled pairs, ${poolSize - todo.length} already graded, ${todo.length} to grade, ${CONCURRENCY} at a time`);
    if (todo.length === 0) return 0;

    let stopping = false;
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.on(sig, () => {
        stopping = true;
        console.log(`\n${sig}: finishing the grades in flight, then stopping. Run it again to resume.`);
      });
    }
    const judge = makeJudge(baseUrl, process.env.JUDGE_API_KEY?.trim() ?? "", model);
    const started = Date.now();
    const out = await grade(
      todo,
      (ref) => {
        const a = byRef.get(ref);
        if (!a) throw new Error(`akm returned ${ref}, which is not in its own asset listing`);
        return { asset: a, text: texts.get(ref) as string };
      },
      judge,
      qrelsPath,
      { stop: () => stopping, log: (l) => console.log(`  ${l}`) },
    );
    const minutes = ((Date.now() - started) / 60_000).toFixed(1);
    console.log(`retrieval label: ${out.graded} graded, ${out.failed} failed, ${todo.length - out.graded - out.failed} left, in ${minutes} min (prompt ${PROMPT_VERSION}, model ${model})`);
    return out.graded === todo.length ? 0 : 1;
  } finally {
    removeSandbox(sb);
  }
}

if (import.meta.main) process.exit(await main());
