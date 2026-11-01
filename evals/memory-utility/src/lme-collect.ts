// The collector of memory-utility's LongMemEval cases. Per case: native inference once over the case's sessions; then per arm one index, one
// search and one `show` per hit, whose shown text is packed at every budget; the reader answers once per distinct packed text and the
// benchmark's judge grades each answer. The labels (answer, evidence) are used only to grade, never sent to inference or the reader.

import { createSandbox, removeSandbox, writeConfig } from "../../../lib/akm/akm.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { sha256Text } from "../../../lib/provenance.ts";
import { grade } from "../../../benchmarks/longmemeval/src/collect.ts";
import { ChatError, chat, type ChatResult, type Endpoint } from "../../../benchmarks/longmemeval/src/llm.ts";
import { stripReasoning } from "../../../benchmarks/longmemeval/src/prompts.ts";
import { configFor, index, place, retrieve, runInference, sandboxRelative, seconds, type Options } from "./collect.ts";
import { type LmeCase, lmePrompt } from "./lme.ts";
import { type LmeBudgetRaw, type LmeRaw, blankBudget } from "./lme-score.ts";
import { ARMS, armOrder, pack, READER_DEFAULTS, sourceFiles, type ArmName, type Document } from "./protocol.ts";

export interface LmeOptions extends Options {
  budgets: number[];
  judge: Endpoint;
  /** Identical grading prompts share one verdict through this, for the run, as in the benchmark. */
  judgeCache: Map<string, ChatResult>;
}

export function lmePending(ordinal: number, seed: string, budgets: number[]): LmeRaw {
  const blank = () => ({ state: "not-run" as const, error: null, search: null, seconds: { index: 0, retrieval: 0, answer: 0, judge: 0 },
    budgets: Object.fromEntries(budgets.map(b => [String(b), blankBudget(pack([], b))])) });
  return { kind: "longmemeval", order: armOrder(ordinal, seed), children: {}, rewritten_parents: [],
    inference: { outcome: "not-run", report: null, error: null, index_seconds: 0, seconds: 0, model_calls: null },
    arms: Object.fromEntries(ARMS.map(a => [a, blank()])) as LmeRaw["arms"] };
}

/** The reader's answer at one budget and the judge's verdict on it. Never throws: a failure is the budget's `error`. */
async function answer(c: LmeCase, b: LmeBudgetRaw, prompt: string, o: LmeOptions): Promise<void> {
  let t = performance.now();
  let reply: ChatResult;
  try {
    reply = b.answer = await chat(o.endpoint, prompt, { ...READER_DEFAULTS, timeoutMs: o.timeoutMs });
  } catch (e) {
    b.state = "error"; b.error = hideEndpoint(String(e), o.endpoint.baseUrl);
    if (e instanceof ChatError) b.failed_usage = e.usage;
    return;
  } finally { b.seconds.answer = seconds(t); }
  // The judge sees the answer without its reasoning. A reply that was only reasoning is an empty answer: wrong, and not graded.
  b.hypothesis = stripReasoning(reply.text);
  if (b.hypothesis === "") { b.state = "complete"; return; }
  t = performance.now();
  const graded = await grade({ question_type: c.category, question_id: c.id, question: c.question, answer: c.answer }, b.hypothesis, o.judge, o.judgeCache);
  b.seconds.judge = seconds(t);
  if (graded.failed !== null) { b.state = "error"; b.error = hideEndpoint(graded.failed, o.judge.baseUrl); b.judge_usage = graded.judge_usage ?? null; return; }
  b.verdict = graded.verdict; b.judge_model = graded.judge_model; b.judge_usage = graded.judge_usage; b.judge_cached = graded.judge_cached;
  b.state = graded.error === null ? "complete" : "error"; b.error = graded.error;
}

/** Packs the shown text at every budget and gets one graded answer per distinct prompt; a budget with the same prompt as an earlier one takes that answer. */
async function read(c: LmeCase, raw: LmeRaw["arms"][ArmName], docs: Document[], o: LmeOptions, checkpoint: () => void): Promise<void> {
  const asked = new Map<string, number>();
  for (const budget of [...o.budgets].sort((x, y) => x - y)) {
    const b = raw.budgets[String(budget)]!;
    b.context = pack(docs, budget);
    const prompt = lmePrompt(c, b.context);
    b.prompt_sha256 = sha256Text(prompt);
    const earlier = asked.get(prompt);
    if (earlier !== undefined) {
      const from = raw.budgets[String(earlier)]!;
      Object.assign(b, { state: from.state, error: from.error, reused_from: earlier, hypothesis: from.hypothesis, verdict: from.verdict, judge_model: from.judge_model });
    } else { asked.set(prompt, budget); await answer(c, b, prompt, o); }
    raw.seconds.answer += b.seconds.answer; raw.seconds.judge += b.seconds.judge;
    checkpoint();
  }
}

const fail = (raw: LmeRaw["arms"][ArmName], message: string): void => {
  raw.state = "error"; raw.error = message;
  for (const b of Object.values(raw.budgets)) { b.state = "error"; b.error = message; }
};

/** Persist after each phase and arm. */
export async function lmeCollect(c: LmeCase, raw: LmeRaw, o: LmeOptions, checkpoint: () => void = () => {}): Promise<LmeRaw> {
  const config = configFor(o);
  const box = { source: sourceFiles(c), post_inference: null as Record<string, string> | null, inference: raw.inference };
  // The sessions are the memories: inference and the arms get the case's notes under hashed names, and no id, label or answer.
  await runInference(box, config, o, checkpoint);
  if (box.post_inference) {
    raw.children = Object.fromEntries(Object.entries(box.post_inference).filter(([file]) => !(file in box.source)));
    raw.rewritten_parents = Object.keys(box.source).filter(file => box.post_inference![file] !== box.source[file]);
  }
  for (const name of raw.order) {
    const arm = raw.arms[name];
    if (name === "inferred" && raw.inference.outcome === "error") { fail(arm, `inference: ${raw.inference.error}`); checkpoint(); continue; }
    let docs: Document[] = [];
    if (name !== "none") {
      const s = createSandbox(`memory-utility-${name}`);
      try {
        writeConfig(s, config);
        place(s, name === "source" ? box.source : box.post_inference!);
        let t = performance.now();
        try { await index(s, o); } finally { arm.seconds.index = seconds(t); }
        t = performance.now();
        try { docs = await retrieve(s, c.question, o, arm); } finally { arm.seconds.retrieval = seconds(t); }
      } catch (e) {
        fail(arm, sandboxRelative(hideEndpoint(String(e), o.endpoint.baseUrl), s.dir)); checkpoint(); continue;
      } finally { removeSandbox(s); }
    }
    await read(c, arm, docs, o, checkpoint);
    const failed = Object.values(arm.budgets).find(b => b.state === "error");
    arm.state = failed ? "error" : "complete"; arm.error = failed?.error ?? null;
    checkpoint();
  }
  return raw;
}
