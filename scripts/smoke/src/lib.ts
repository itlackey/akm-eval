// The smoke run: a stub model, the list of evals it runs, and the check of one run. See ../README.md.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Schema } from "./schema.ts";

/** What the stub model answers to a chat completion unless it is given another answer: the object `{}` as the message, and token counts. */
export const EMPTY_ANSWER = "{}";

/** The chat completion object for a message. The token counts are fixed: nothing here is a measure of cost. */
export function completion(model: string, content: string = EMPTY_ANSWER): Record<string, unknown> {
  return {
    id: "chatcmpl-smoke",
    object: "chat.completion",
    created: 0,
    model,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

/** The part of a chat completion request the stub reads: akm sends the schema it wants the reply to fit as response_format. */
export interface ChatRequest {
  model?: unknown;
  messages?: { role?: unknown; content?: unknown }[];
  response_format?: { type?: unknown; json_schema?: { name?: unknown; schema?: Schema; strict?: unknown } };
}

/** The schema a request asks the reply to fit, or undefined when it sends none. */
export const schemaOf = (req: ChatRequest): Schema | undefined => {
  const schema = req.response_format?.json_schema?.schema;
  return typeof schema === "object" && schema !== null ? schema : undefined;
};

/** The text of the last user message of a request, for an answer to pick by what was asked. */
export const promptOf = (req: ChatRequest): string => {
  const users = (req.messages ?? []).filter((m) => m.role === "user");
  const content = users[users.length - 1]?.content;
  return typeof content === "string" ? content : "";
};

/** What a request was, for the stub to remember: the required keys of the schema it sent (null when it sent none), the start of its prompt and the reply it got. */
export interface Seen {
  keys: string[] | null;
  prompt: string;
  reply: string;
}

/** What the stub says to a request: the text of the assistant message. */
export type Answerer = (req: ChatRequest) => string;

export interface Stub {
  /** The base URL to give as MODEL_BASE_URL, with /v1 on it, as an OpenAI-compatible endpoint has. */
  url: string;
  /** How many chat completions it has answered since the start, or since `reset`. */
  calls(): number;
  /** The method and path of every request it did not answer, such as "POST /v1/responses". */
  unexpected(): string[];
  /** Every chat completion it has answered since the start, or since `reset`, in order. */
  seen(): Seen[];
  /** Changes what it answers from now on, until it is changed again. `reset` does not undo it. */
  answer(answerer: Answerer): void;
  /** Forgets the calls, the unserved requests and the requests seen. */
  reset(): void;
  stop(): void;
}

/**
 * A local server with one endpoint, POST /v1/chat/completions, that answers each call with `answerer` (by default `{}` to every call).
 * Any other request is a 404.
 */
export function startStub(answerer: Answerer = () => EMPTY_ANSWER): Stub {
  let calls = 0;
  let unexpected: string[] = [];
  let seen: Seen[] = [];
  let answerWith = answerer;
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const { pathname } = new URL(req.url);
      if (req.method === "POST" && pathname === "/v1/chat/completions") {
        const parsed: unknown = await req.json().catch(() => ({}));
        const body = (typeof parsed === "object" && parsed !== null ? parsed : {}) as ChatRequest & { max_tokens?: unknown; max_completion_tokens?: unknown };
        // The run's own one-token probe (lib/probe.ts) is answered and not counted: it is not the eval reaching the model.
        if (body.messages?.length === 1 && body.messages[0]?.content === "ping" && (body.max_tokens === 1 || body.max_completion_tokens === 1)) return Response.json(completion(typeof body.model === "string" ? body.model : "smoke-model", ""));
        calls++;
        const reply = answerWith(body);
        seen.push({ keys: schemaOf(body)?.required ?? (schemaOf(body) ? [] : null), prompt: promptOf(body).slice(0, 120), reply });
        return Response.json(completion(typeof body.model === "string" ? body.model : "smoke-model", reply));
      }
      unexpected.push(`${req.method} ${pathname}`);
      return Response.json({ error: { message: `the smoke stub answers POST /v1/chat/completions only, not ${req.method} ${pathname}`, type: "not_found" } }, { status: 404 });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/v1`,
    calls: () => calls,
    unexpected: () => [...unexpected],
    seen: () => [...seen],
    answer: (next) => void (answerWith = next),
    reset: () => {
      calls = 0;
      unexpected = [];
      seen = [];
    },
    stop: () => void server.stop(true),
  };
}

/** The environment of a run: the caller's, with the model and the judge set to the stub. The run scripts read .env after the environment, and a variable that is set wins. */
export function stubEnv(base: Record<string, string | undefined>, url: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) if (v !== undefined) env[k] = v;
  // Model and judge both: nothing in .env, a key included, is sent anywhere. AKM_EVAL_ENV_LOADED keeps the runs' lib/env.sh from
  // reading .env over the stub.
  return { ...env, AKM_EVAL_ENV_LOADED: "1", MODEL_BASE_URL: url, MODEL_API_KEY: "smoke-key", MODEL_NAME: "smoke-model", JUDGE_BASE_URL: url, JUDGE_API_KEY: "smoke-key", JUDGE_MODEL: "smoke-model" };
}

export interface Entry {
  /** The folder of the eval, from the repository root: evals/reflect. */
  dir: string;
  /** Why the smoke does not run it. Left out for one it runs. */
  skip?: string;
  /** What a run of it needs beyond akm and the stub, to say when it fails for want of it. */
  needs?: string;
  /** False for an eval that calls no model, such as retrieval. Left out for one that does. */
  model?: false;
  /** Cases to run; bakeoff needs five to exercise each process. */
  limit?: number;
  /**
   * For an eval that calls no model, so that nothing else shows akm answered: the columns of its samples.jsonl rows (each an object with
   * the `refs` akm returned) that must hold a ref in at least one row. Left out for an eval that calls a model.
   */
  answers?: string[];
}

/**
 * Every eval and benchmark that has a run script. The ones that drive akm are run once on one case; the others are skipped, and
 * the reason is printed. A test checks that no folder with a run script is missing here.
 */
export const ENTRIES: Entry[] = [
  { dir: "evals/retrieval", model: false, answers: ["search", "curate"] },
  { dir: "evals/judge-gate" },
  { dir: "evals/reflect" },
  { dir: "evals/distill" },
  { dir: "evals/consolidate" },
  { dir: "evals/extract" },
  { dir: "evals/nightly" },
  { dir: "evals/promotion", needs: "akm's embedding model, which akm downloads into .cache/models the first time (133 MB, from huggingface.co)" },
  { dir: "evals/agent-ab", skip: "needs Docker" },
  { dir: "evals/bakeoff", limit: 5 },
  { dir: "evals/memory-utility", skip: "requires explicit no-change counters newer than the smoke pin; run its opt-in real.test.ts with supported AKM" },
  { dir: "benchmarks/terminal-bench", skip: "needs Docker" },
  { dir: "benchmarks/longmemeval", skip: "downloads the LongMemEval dataset" },
  { dir: "benchmarks/skillret", skip: "downloads the SkillRet dataset" },
];

export const LABEL = "smoke";

export interface Outcome {
  dir: string;
  /** FAIL: the run did not end, or wrote no summary.json. WARN: it did, and something looks wrong that the smoke does not assert. */
  status: "ok" | "WARN" | "FAIL" | "skipped";
  /** The reason it was skipped, or what failed or looks wrong. Empty for a run that passed cleanly. */
  note: string;
  seconds: number;
  /** The exit code of the run script, null when it was killed or not run. */
  exit: number | null;
  /** The results folders the run made, from the repository root. */
  folders: string[];
  /** Chat completions the stub answered during the run. */
  calls: number;
  /** Rows of the run's samples.jsonl that carry an error, and what the first row says. */
  errored: number;
  firstRow: string;
  /** The last lines the run printed, for a failed run. */
  tail: string;
}

/** The names in `parent`, or none when it does not exist. */
export function listDirs(parent: string): string[] {
  return existsSync(parent) ? readdirSync(parent) : [];
}

/** The folders a run made for the smoke label: new since `before`, named `<UTC date>-smoke`, with a suffix for a collection or a repeated name. */
export function smokeFolders(before: string[], after: string[]): string[] {
  const had = new Set(before);
  return after.filter((name) => !had.has(name) && new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${LABEL}(-|$)`).test(name)).sort();
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** What a row says about its case, in the words the evals use: its outcome or state, its error, reason or detail. */
export function describeRow(row: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["outcome", "state", "error", "reason", "detail"]) {
    const v = row[key];
    if (typeof v === "string" && v.trim()) parts.push(`${key}: ${v.trim().replace(/\s+/g, " ")}`);
  }
  return parts.join("; ").slice(0, 400);
}

/** The rows of a samples.jsonl that are JSON objects. A line that is not JSON is skipped. */
export function readRows(file: string): Record<string, unknown>[] {
  if (!existsSync(file)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row: unknown = JSON.parse(line);
      if (isObject(row)) rows.push(row);
    } catch {
      // not a row
    }
  }
  return rows;
}

/** The object a summary.json holds, or undefined when the file is missing or holds anything else. */
export function readSummary(file: string): Record<string, unknown> | undefined {
  try {
    const summary: unknown = JSON.parse(readFileSync(file, "utf8"));
    return isObject(summary) ? summary : undefined;
  } catch {
    return undefined;
  }
}

/** What the rows of a samples.jsonl say: how many carry an error, and what the first row says. A line that is not JSON is not counted. */
export function readSamples(file: string): { errored: number; first: string } {
  let errored = 0;
  let first = "";
  for (const row of readRows(file)) {
    if (typeof row.error === "string" && row.error.trim()) errored++;
    first ||= describeRow(row);
  }
  return { errored, first };
}

/** Which of `columns` hold at least one ref in at least one row of a samples.jsonl: a retrieval row has a `search` and a `curate` object, each with the refs akm returned. */
export function columnsWithRefs(file: string, columns: readonly string[]): string[] {
  const rows = readRows(file);
  return columns.filter((name) => rows.some((row) => isObject(row[name]) && Array.isArray(row[name].refs) && row[name].refs.length > 0));
}

const lastLines = (text: string, n: number): string => text.trimEnd().split("\n").slice(-n).join("\n");

export interface RunOptions {
  root: string;
  env: Record<string, string>;
  /** akm's command for every eval (--akm), or none to use AKM_BIN and PATH as they are. */
  akm?: string;
  /** Wall-clock limit of one eval, in milliseconds. */
  timeoutMs: number;
  /** The stub, to count its calls during the run. */
  stub?: Pick<Stub, "calls" | "unexpected" | "reset">;
}

/**
 * Runs one entry's run script once, on one case of the public corpus, and checks what the smoke asserts: the run ended and wrote
 * a summary.json. A model that answers `{}` makes the cases error, so a run that errored on every case passes. What the cases said goes
 * in the outcome, to read, and three things that look wrong, without failing the run, are a WARN.
 */
export async function runEntry(entry: Entry, opts: RunOptions): Promise<Outcome> {
  const base: Outcome = { dir: entry.dir, status: "ok", note: "", seconds: 0, exit: 0, folders: [], calls: 0, errored: 0, firstRow: "", tail: "" };
  if (entry.skip) return { ...base, status: "skipped", note: entry.skip, exit: null };
  const results = join(opts.root, entry.dir, "results");
  const before = listDirs(results);
  opts.stub?.reset();
  const args = ["bash", join(opts.root, entry.dir, "run"), "--corpus", "public", "--limit", String(entry.limit ?? 1), "--label", LABEL, ...(opts.akm ? ["--akm", opts.akm] : [])];
  const t0 = performance.now();
  const proc = Bun.spawn(args, { cwd: opts.root, env: opts.env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: opts.timeoutMs, killSignal: "SIGKILL" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  const seconds = Number(((performance.now() - t0) / 1000).toFixed(1));
  const timedOut = proc.signalCode === "SIGKILL";
  const folders = smokeFolders(before, listDirs(results)).map((name) => join(entry.dir, "results", name));
  const out: Outcome = { ...base, seconds, exit: timedOut ? null : code, folders, calls: opts.stub?.calls() ?? 0, tail: lastLines(`${stdout}\n${stderr}`, 12) };
  const answered = new Set<string>();
  for (const f of folders) {
    const samples = join(opts.root, f, "samples.jsonl");
    const { errored, first } = readSamples(samples);
    out.errored += errored;
    out.firstRow ||= first;
    for (const name of columnsWithRefs(samples, entry.answers ?? [])) answered.add(name);
  }
  if (timedOut) return { ...out, status: "FAIL", note: `did not end within ${Math.round(opts.timeoutMs / 1000)}s and was killed` };
  if (folders.length === 0) return { ...out, status: "FAIL", note: `exit ${code}, and it made no results folder` };
  const missing = folders.filter((f) => !existsSync(join(opts.root, f, "summary.json")));
  if (missing.length > 0) return { ...out, status: "FAIL", note: `exit ${code}, and no summary.json in ${missing.join(", ")}` };
  // What the smoke does not assert but a reader should see. A request the stub does not serve: the eval or akm went to another endpoint.
  // An eval that uses a model and never reached it, on the one case it was given: what akm refusing a command, or printing JSON the
  // eval cannot read, looks like. An eval with no model has no call to count, so it has to show a ref instead: an akm that prints other
  // keys than the eval reads is an empty answer to it, with no error.
  const odd = opts.stub?.unexpected() ?? [];
  if (odd.length > 0) return { ...out, status: "WARN", note: `the stub was asked for ${[...new Set(odd)].join(", ")}, which it does not serve` };
  const empty = (entry.answers ?? []).filter((name) => !answered.has(name));
  if (empty.length > 0) return { ...out, status: "WARN", note: `${empty.join(" and ")} returned no ref on the one query: akm may print other JSON than the eval reads` };
  if (opts.stub && entry.model !== false && out.calls === 0) return { ...out, status: "WARN", note: "the eval never reached the model" };
  return out;
}
