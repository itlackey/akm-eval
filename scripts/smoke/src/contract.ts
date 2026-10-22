// The contract mode of the smoke: what the stub model answers to each eval, and what the eval must then say. See ../README.md.
//
// The startup mode answers `{}` to every call and reads nothing of the rows. Here every call gets a reply that fits the schema
// the request sends (schema.ts builds it), or a canned reply where akm's own checks turn down a reply that only fits the schema,
// and the rows must reach the outcome the eval counts as the work done. A second run per eval answers with text that is not JSON,
// and its rows must reach the outcome the eval has for a reply akm cannot read.

import { join } from "node:path";
import { EMPTY_ANSWER, type Answerer, type ChatRequest, type Entry, type Outcome, type RunOptions, type Seen, type Stub, promptOf, readRows, readSummary, runEntry, schemaOf } from "./lib.ts";
import { type Schema, valueFor } from "./schema.ts";

/** One canned reply, for the requests it matches: those whose schema has exactly these required keys (`keys`) or at least these (`has`), and/or whose prompt holds this text. */
export interface Canned {
  keys?: string[];
  has?: string[];
  prompt?: string;
  /**
   * The reply: text as it is, anything else as JSON. A function gets the schema that the request sends and returns the reply, so that one
   * canned reply fits what several releases of akm ask for: akm 0.9.26 asks for a lesson of three texts and 0.9.31 for six keys, and the
   * judge's first criterion is novelty in one and reusable in the other.
   */
  reply: unknown;
}

const sameKeys = (a: string[], b: string[]): boolean => a.length === b.length && [...a].sort().every((k, i) => k === [...b].sort()[i]);

/** Does the canned reply match the request? A canned reply with none of `keys`, `has` and `prompt` matches nothing. */
export function matches(c: Canned, req: ChatRequest): boolean {
  if (c.keys === undefined && c.has === undefined && c.prompt === undefined) return false;
  const required = schemaOf(req)?.required ?? [];
  if (c.keys !== undefined && !sameKeys(c.keys, required)) return false;
  if (c.has !== undefined && !c.has.every((k) => required.includes(k))) return false;
  if (c.prompt !== undefined && !promptOf(req).includes(c.prompt)) return false;
  return true;
}

/** The text that a canned reply gives to a request that it matches: the reply as it is, or what its function makes of the request's schema. */
export function replyOf(c: Canned, req: ChatRequest): string {
  const reply = typeof c.reply === "function" ? (c.reply as (schema: Schema | undefined) => unknown)(schemaOf(req)) : c.reply;
  return typeof reply === "string" ? reply : JSON.stringify(reply);
}

/** An answerer that remembers which canned replies it has given. */
export type Answering = Answerer & { unused(): Canned[] };

/**
 * The stub's answerer for a table of canned replies: the first that matches, else the value that fits the request's schema, else (for a
 * request that sends no schema, such as akm's probe of the endpoint) `{}`. `unused()` lists the canned replies that no request has matched.
 */
export function answerFrom(canned: Canned[]): Answering {
  const used = new Set<Canned>();
  const answer: Answerer = (req) => {
    const hit = canned.find((c) => matches(c, req));
    if (hit) {
      used.add(hit);
      return replyOf(hit, req);
    }
    const schema = schemaOf(req);
    return schema ? JSON.stringify(valueFor(schema)) : EMPTY_ANSWER;
  };
  return Object.assign(answer, { unused: () => canned.filter((c) => !used.has(c)) });
}

/** What a canned reply is for, in the words of its match. */
export const describeCanned = (c: Canned): string =>
  [c.keys && `a schema that requires ${c.keys.join(", ") || "nothing"}`, c.has && `a schema that requires at least ${c.has.join(", ")}`, c.prompt && `a prompt with "${c.prompt}"`].filter(Boolean).join(" and ");

/** The kinds of request the stub has seen, once each: the required keys of its schema, or the start of the prompt when it sent none. */
const kindsSeen = (seen: Seen[]): string[] => [...new Set(seen.map((s) => (s.keys ? `a schema that requires ${s.keys.join(", ") || "nothing"}` : `no schema, prompt "${s.prompt.slice(0, 40)}"`)))];

/** The reply of the failure runs, to every request: text that is no JSON. */
export const MALFORMED_ANSWER = "I am sorry, I cannot answer that in JSON.";
export const malformed: Answerer = () => MALFORMED_ANSWER;

type Row = Record<string, unknown>;

/** What the rows of a run must say. */
export interface Expect {
  /** The field of a row that tells how its case went, and the values that are the wanted outcome. Left out for rows with no such field (retrieval). */
  field?: string;
  values?: unknown[];
  /** Further checks of the rows and the summaries of the run, each returning the problems it finds. */
  also?: (rows: Row[], summaries: Row[]) => string[];
}

export interface Contract {
  /** The canned replies of the run that must reach the outcome. A request that none matches gets the value that fits its schema. */
  canned: Canned[];
  /** What the rows say after it, and the exit code is 0. */
  success: Expect;
  /** What the rows say when every reply is malformed. Left out for an eval that calls no model. */
  failure?: Expect;
}

const show = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));

/** The problems of a run against what it was to say. A run of the success kind has no errored row and no summary that says it was aborted; every run has a row. */
export function verify(expect: Expect, rows: Row[], summaries: Row[], kind: "success" | "failure"): string[] {
  if (rows.length === 0) return ["the run wrote no rows"];
  const problems: string[] = [];
  const id = (r: Row) => (typeof r.id === "string" ? r.id : "a row");
  if (kind === "success") {
    for (const r of rows) if (typeof r.error === "string" && r.error.trim()) problems.push(`${id(r)} errored: ${r.error.trim().replace(/\s+/g, " ").slice(0, 300)}`);
    for (const s of summaries) if (s.status === "aborted") problems.push(`the summary says the run was aborted${typeof s.aborted_reason === "string" ? `: ${s.aborted_reason}` : ""}`);
  }
  if (expect.field !== undefined) {
    const wanted = expect.values ?? [];
    for (const r of rows) if (!wanted.some((v) => v === r[expect.field as string])) problems.push(`${id(r)}: ${expect.field} is ${show(r[expect.field])}, expected ${wanted.map(show).join(" or ")}`);
  }
  problems.push(...(expect.also?.(rows, summaries) ?? []));
  return problems;
}

/** A check that every row holds `value` in `field`, naming the row when it does not. */
const each = (field: string, test: (value: unknown) => boolean, wanted: string): ((rows: Row[]) => string[]) => (rows) =>
  rows.filter((r) => !test(r[field])).map((r) => `${typeof r.id === "string" ? r.id : "a row"}: ${field} is ${show(r[field])}, expected ${wanted}`);

const pairPass = (summaries: Row[]): { pairs_judged?: number; failed_judgments?: number } => (summaries[0]?.pair_pass ?? {}) as { pairs_judged?: number; failed_judgments?: number };

// The replies for the pair judge of consolidate, which the nightly eval's consolidate process asks for too. The value that fits the schema
// lists a claim that each note holds alone, and akm retires a note only when its judge lists none: so the judge answers a duplicate whose
// notes hold nothing of their own, and akm's second look, before it stages the retirement, finds nothing missing.
const PAIR_JUDGE: Canned[] = [
  {
    has: ["onlyInA", "onlyInB", "confidence", "reason"],
    reply: (schema: Schema | undefined) => ({
      ...(schema ? (valueFor(schema) as object) : {}),
      onlyInA: [], onlyInB: [], confidence: 0.9, reason: "Both notes state the same claims.",
      ...(schema?.properties?.relation ? { relation: "duplicate" } : {}),
      ...(schema?.properties?.redundant ? { redundant: "A" } : {}),
      ...(schema?.properties?.stale ? { stale: null } : {}),
    }),
  },
  { keys: ["missing"], reply: { missing: [] } },
];

/**
 * What each eval that drives akm must reach, by folder. The outcome values are those of the eval's own rows: see its README and src/lib.ts.
 * evals/retrieval calls no model, so it has no failure run: its rows are the answers of akm's search and curate, which the run checks
 * for a ref.
 */
export const CONTRACTS: Record<string, Contract> = {
  "evals/retrieval": { canned: [], success: {} },
  // The value that fits the judge's schema scores every criterion 1, which is a verdict (reject). A reply akm cannot read is routed to review
  // with no score.
  "evals/judge-gate": {
    canned: [],
    success: { field: "outcome", values: ["pass", "review", "reject"], also: each("score", (v) => typeof v === "number", "a number: a verdict") },
    failure: { field: "outcome", values: ["review"], also: each("score", (v) => v === null, "null: no verdict") },
  },
  // akm takes a patch whose fields fit the schema.
  "evals/reflect": { canned: [], success: { field: "outcome", values: ["proposal"] }, failure: { field: "outcome", values: ["unusable"] } },
  // akm queues a lesson whose description has under 20 characters or whose when_to_use has under 15 for review with a note that it is invalid,
  // and the value that fits the schema is shorter (10 characters, from smoke-text); its judge's scores fit from 1, and a lesson scored 1 is
  // rejected. So the three texts of the lesson and the scores are canned. They are laid over what the schema of the request names, so that one
  // reply fits every release: the lesson has three keys in akm 0.9.26 and six in 0.9.31, where `reason`, `decision` and `tags` take the value
  // that fits (`decision` is `lesson`, the first of its enum), and the judge's first criterion is novelty in 0.9.26 and reusable from 0.9.27.
  // Every criterion that the schema names is scored 5. The lesson judge is found by the end of the first sentence of its prompt, which both
  // releases share: it begins "You are evaluating a proposed lesson asset" in 0.9.26 and "You are evaluating a lesson an agent wrote" in 0.9.31,
  // and the reflect judge's does not end so.
  "evals/distill": {
    canned: [
      {
        has: ["description", "when_to_use", "body"],
        reply: (schema: Schema | undefined) => ({
          ...(schema ? (valueFor(schema) as object) : {}),
          description: "A lesson restates in one sentence what the memory it comes from teaches.",
          when_to_use: "When the task at hand matches the situation the memory describes.",
          body: "Apply what the memory says to the task, and no more than it says.",
        }),
      },
      {
        keys: ["scores", "reason"],
        prompt: "for an akm knowledge base",
        reply: (schema: Schema | undefined) => ({
          scores: Object.fromEntries(Object.keys((schema?.properties?.scores as Schema | undefined)?.properties ?? {}).map((criterion) => [criterion, 5])),
          reason: "The lesson states what the memory says.",
        }),
      },
    ],
    success: { field: "outcome", values: ["lesson", "update"], also: each("status", (v) => v === "pending", "pending: queued for review") },
    failure: { field: "outcome", values: ["invalid"] },
  },
  "evals/consolidate": {
    canned: PAIR_JUDGE,
    success: {
      field: "outcome",
      values: ["retire"],
      also: (rows) => [
        ...each("paired", (v) => v === true, "true: akm paired the notes")(rows),
        ...each("judged_as", (v) => v === "duplicate", "duplicate: the label of the judge")(rows),
        ...each("staged", (v) => v === true, "true: akm staged the retirement")(rows),
      ],
    },
    failure: { field: "outcome", values: ["error"], also: each("error", (v) => typeof v === "string" && v.includes("no verdict"), "akm's judge gave no verdict") },
  },
  // The value that fits the schema is a candidate akm queues.
  "evals/extract": { canned: [], success: { field: "outcome", values: ["saved"] }, failure: { field: "outcome", values: ["unusable"] } },
  // One item: a pair of duplicates. The judge retires one note, and the drain accepts it.
  "evals/nightly": {
    canned: PAIR_JUDGE,
    success: {
      field: "ok",
      values: [true],
      also: (_rows, summaries) => [
        ...(pairPass(summaries).pairs_judged === 1 ? [] : [`the pair pass judged ${show(pairPass(summaries).pairs_judged)} pairs, expected 1`]),
        ...(pairPass(summaries).failed_judgments === 0 ? [] : [`the pair pass has ${show(pairPass(summaries).failed_judgments)} failed judgments, expected 0`]),
        ...(summaries.some((s) => s.improve_ok !== true) ? ["akm reported the improve run as not ok"] : []),
      ],
    },
    failure: { field: "ok", values: [false], also: (_rows, summaries) => ((pairPass(summaries).failed_judgments ?? 0) >= 1 ? [] : ["the pair pass has no failed judgment"]) },
  },
  // The judge of the tier answers in plain text, and akm reads the decision from it. A reply it cannot read is a defer.
  "evals/promotion": {
    canned: [{ prompt: "adjudicating a pending", reply: { decision: "accept", reason: "The proposal is a stable note that the bundle does not hold yet." } }],
    success: { field: "outcome", values: ["accept"] },
    failure: { field: "outcome", values: ["defer"] },
  },
  "evals/bakeoff": {
    canned: [
      { has: ["title", "description", "tags", "searchHints", "content"], reply: (schema: Schema | undefined) => ({ ...(schema?.properties?.noChange ? { noChange: false } : {}), title: "Queue checkpoint recovery", description: "Keep the checkpoint manifest and blob before resuming from the prior offset.", tags: ["queue", "checkpoint", "recovery"], searchHints: ["checkpoint manifest", "blob recovery", "prior offset"], content: "On 2026-02-14, recovery used the checkpoint manifest and blob to resume from the prior offset." }) },
      { prompt: "memory tagger", reply: { tags: ["queue", "checkpoint", "recovery"], description: "Queue checkpoint recovery from the manifest and blob.", observed_at: "2026-02-14" } },
      { prompt: "Generate the missing frontmatter", reply: { description: "The publisher drains the worker before a deployment and checks its health.", when_to_use: "When you deploy or replace a publisher worker in a release." } },
      { prompt: "summarizing an agent coding session", reply: { summary: "The session deployed relay-worker:7.4 with relay-canary-184, checked the object store and postgresql, and kept worker-stable as the rollback alias.", key_topics: ["relay-worker:7.4", "relay-canary-184", "worker-stable"], tags: ["release"] } },
      { prompt: "extracting durable engineering insights", reply: { candidates: [], rationale_if_empty: "The session holds no further durable insight." } },
      { keys: ["operations"], reply: { operations: [{ op: "promote", ref: "memories/signed-artifacts", knowledgeRef: "knowledge/signed-artifacts", reason: "A stable fact.", description: "The worker verifies artifact signatures before a release.", confidence: 0.95 }] } },
    ],
    success: { field: "outcome", values: ["output"], also: (rows) => {
      const processes = new Set(rows.map((r) => r.process));
      return rows.length === 5 && processes.size === 5 ? [] : ["bakeoff must reach all five processes"];
    } },
    failure: { field: "outcome", values: ["unusable"] },
  },
};

/** One run of an eval in the contract mode. */
export interface Leg {
  kind: "success" | "failure";
  /** The run, as runEntry reports it. */
  run: Outcome;
  /** What went wrong, empty for a leg that reached what it was to: the run's own FAIL or WARN, and what the rows said that was not wanted. */
  problems: string[];
}

export interface ContractOutcome {
  dir: string;
  status: "ok" | "FAIL" | "skipped";
  note: string;
  legs: Leg[];
}

/** The options of runEntry, with a stub whose answers the contract can set. */
export type ContractOptions = Omit<RunOptions, "stub"> & { stub: Pick<Stub, "calls" | "unexpected" | "reset" | "answer" | "seen"> };

/** One run of the eval with the stub set to `answerer`, and the check of its rows against `expect`. The results folders are left for the caller to remove. */
async function runLeg(entry: Entry, kind: Leg["kind"], answerer: Answerer, expect: Expect, opts: ContractOptions): Promise<Leg> {
  opts.stub.answer(answerer);
  const run = await runEntry(entry, opts);
  const problems: string[] = [];
  if (run.status !== "ok") problems.push(run.note);
  if (run.status !== "FAIL") {
    const rows = run.folders.flatMap((f) => readRows(join(opts.root, f, "samples.jsonl")));
    const summaries = run.folders.map((f) => readSummary(join(opts.root, f, "summary.json"))).filter((s): s is Row => s !== undefined);
    problems.push(...verify(expect, rows, summaries, kind));
    if (kind === "success" && run.exit !== 0) problems.push(`the run exited ${run.exit}`);
    // A canned reply that nothing asked for means the run did not take the path the table was written for: akm sent other requests than the
    // ones it was written against, and the outcome above was reached on the value that fits the schema, or by luck.
    const unused = "unused" in answerer ? (answerer as Answering).unused() : [];
    for (const c of unused) problems.push(`the canned reply for ${describeCanned(c)} was never used. akm sent: ${kindsSeen(opts.stub.seen()).join("; ") || "no request"}`);
  }
  return { kind, run, problems };
}

/**
 * Runs an eval against its contract: once with the canned replies, where it must reach the success outcome, and once with replies
 * that are no JSON, where it must reach the outcome it has for a reply akm cannot read. Both runs use the smoke label, and their folders stay
 * for the caller to remove (`legs[].run.folders`).
 */
export async function runContract(entry: Entry, contract: Contract | undefined, opts: ContractOptions): Promise<ContractOutcome> {
  if (entry.skip) return { dir: entry.dir, status: "skipped", note: entry.skip, legs: [] };
  if (!contract) return { dir: entry.dir, status: "FAIL", note: "it has no contract: add one to CONTRACTS in contract.ts, or skip the eval in ENTRIES with a reason", legs: [] };
  const legs = [await runLeg(entry, "success", answerFrom(contract.canned), contract.success, opts)];
  if (contract.failure) legs.push(await runLeg(entry, "failure", malformed, contract.failure, opts));
  const bad = legs.filter((l) => l.problems.length > 0);
  return { dir: entry.dir, status: bad.length ? "FAIL" : "ok", note: bad.map((l) => `${l.kind}: ${l.problems.join("; ")}`).join(" | "), legs };
}
