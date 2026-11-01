import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOverrides } from "../../../lib/akm/overrides.ts";
import { buildManifest, caseDigests } from "../../../lib/manifest.ts";
import { tinyDataset } from "../../../benchmarks/longmemeval/src/fakes.ts";
import { IMPROVE_MS_PER_NOTE, improveTimeoutMs } from "./collect.ts";
import { buildLmeCase } from "./lme.ts";
import { lmeCollect, lmePending, type LmeOptions } from "./lme-collect.ts";
import { blankBudget, makeLmeRow, summarizeLme, whereWentEvidence, type LmeArm, type LmeBudgetRaw } from "./lme-score.ts";
import { fakeModel, writeFakeAkm, type FakeModel } from "./lme-fakes.ts";
import { MEASUREMENT } from "./measurement.ts";
import { pack, sourceFiles } from "./protocol.ts";
import { resumableRaws } from "./run.ts";

const work = mkdtempSync(join(tmpdir(), "memlme-test-"));
const log = join(work, "akm.log");
let model: FakeModel;
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_AKM_LOG: process.env.FAKE_AKM_LOG, FAKE_AKM_IMPROVE_SLEEP: process.env.FAKE_AKM_IMPROVE_SLEEP };
beforeAll(() => {
  model = fakeModel("BLUE42");
  process.env.AKM_BIN = `bun ${writeFakeAkm(work)}`; process.env.FAKE_AKM_LOG = log; process.env.FAKE_AKM_IMPROVE_SLEEP = "800";
});
afterAll(() => {
  model.stop(); rmSync(work, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const fail = (m: string): never => { throw new Error(m); };
const options = (budgets: number[]): LmeOptions => {
  const endpoint = { baseUrl: model.url, apiKey: "", model: "fake" };
  // timeoutMs is far below the 800 ms `improve` sleeps in the fake: only the per-note allowance lets it finish.
  return { endpoint, provider: "openai", overrides: parseOverrides({}, "", fail), semantic: false, contextTokens: 1024, searchLimit: 10, timeoutMs: 500, seed: "1", budgets, judge: endpoint, judgeCache: new Map() };
};
const commands = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
// The evidence turn of the first question is flagged, as the dataset flags it.
const tiny = tinyDataset();
const secret = { ...tiny[0]!, haystack_sessions: tiny[0]!.haystack_sessions.map((turns, i) => tiny[0]!.haystack_session_ids[i] === "answer_1" ? turns.map((t, j) => j === 0 ? { ...t, has_answer: true } : t) : turns) };

describe("collecting a LongMemEval case", () => {
  test("one inference and one search per arm serve every budget; the reader is asked once per distinct memory text", async () => {
    writeFileSync(log, ""); model.calls.length = 0;
    const budgets = [60, 250, 4000];
    const c = buildLmeCase(secret, 2, 1);
    expect(c.notes).toHaveLength(3);
    const raw = await lmeCollect(c, lmePending(0, "1", budgets), options(budgets));
    expect(raw.inference.outcome).toBe("output");
    const cmds = commands();
    expect(cmds.filter(x => x.startsWith("improve"))).toHaveLength(1); // inference ran once for the case, not once per budget
    expect(cmds.filter(x => x === "search")).toHaveLength(2); // one per arm that has memory
    for (const arm of ["source", "inferred"] as const) {
      expect(raw.arms[arm].state).toBe("complete");
      const hits = (raw.arms[arm].search as any).hits.length;
      expect(cmds.filter(x => x.startsWith("show")).length).toBeGreaterThanOrEqual(hits);
    }
    const asked = (arm: "none" | "source" | "inferred") => new Set(Object.values(raw.arms[arm].budgets).map(b => b.prompt_sha256)).size;
    expect(asked("none")).toBe(1); // no memory text, so one prompt at every budget
    expect(Object.values(raw.arms.none.budgets).filter(b => b.reused_from !== null)).toHaveLength(2);
    const readerCalls = model.calls.filter(x => !x.judge).length;
    expect(readerCalls).toBe(asked("none") + asked("source") + asked("inferred"));
    expect(readerCalls).toBeLessThan(3 * budgets.length);
    for (const arm of ["none", "source", "inferred"] as const) {
      // A budget that reuses an answer has none of its own, and its usage is not counted twice.
      const own = Object.values(raw.arms[arm].budgets).filter(b => b.answer !== null).length;
      expect(own).toBe(asked(arm));
    }
    // The packed text differs by budget (the memory is cut), and the generous budget lets the source arm see the answer.
    expect(raw.arms.source.budgets["60"]!.context.estimated_tokens).toBeLessThanOrEqual(60);
    expect(raw.arms.source.budgets["4000"]!.hypothesis).toContain("BLUE42");
    const row = makeLmeRow(c, raw);
    expect(row.arms.source["4000"]).toEqual({ evaluated: true, correct: true });
    expect(row.arms.none["4000"]).toEqual({ evaluated: true, correct: false });
  });

  test("no label reaches the reader or the memories; only the judge is sent the answer", async () => {
    const reader = model.calls.filter(x => !x.judge).map(x => x.prompt);
    expect(reader.length).toBeGreaterThan(0);
    for (const prompt of reader) for (const secretText of ["answer_1", "q-secret", "has_answer", "evidence"]) expect(prompt).not.toContain(secretText);
    const judge = model.calls.filter(x => x.judge).map(x => x.prompt);
    expect(judge.length).toBeGreaterThan(0);
    for (const prompt of judge) expect(prompt).toContain("Correct Answer: BLUE42");
  });

  test("a failed inference is the inferred arm's error and the other arms still run", async () => {
    const c = buildLmeCase(secret, 1, 1);
    process.env.FAKE_AKM_IMPROVE_FAIL = "1";
    let raw;
    try { raw = await lmeCollect(c, lmePending(0, "1", [250]), options([250])); } finally { delete process.env.FAKE_AKM_IMPROVE_FAIL; }
    expect(raw.inference.outcome).toBe("error");
    expect(raw.arms.inferred.state).toBe("error");
    expect(raw.arms.inferred.budgets["250"]!.state).toBe("error");
    expect(raw.arms.source.state).toBe("complete");
    expect(raw.arms.none.state).toBe("complete");
    const s = summarizeLme([makeLmeRow(c, raw)]);
    expect(s).toMatchObject({ n_cases: 1, n_errored: 1, n_scored: 0 });
    expect(s.metrics.memory_inference.failure_inclusive).toMatchObject({ n: 1, incomplete_pairs: 1 });
  });

  test("a verdict that is not yes or no errors the arm, which stays in the failure-inclusive pairs as wrong", async () => {
    const judge = Bun.serve({ port: 0, fetch: () => Response.json({ model: "fake-judge", choices: [{ message: { content: "maybe" }, finish_reason: "stop" }], usage: { prompt_tokens: 9, completion_tokens: 1 } }) });
    try {
      const c = buildLmeCase(secret, 1, 1);
      const o = { ...options([250, 4000]), judge: { baseUrl: `http://localhost:${judge.port}/v1`, apiKey: "", model: "fake-judge" }, judgeCache: new Map() };
      const raw = await lmeCollect(c, lmePending(0, "1", [250, 4000]), o);
      for (const arm of ["none", "source", "inferred"] as const) {
        expect(raw.arms[arm].state).toBe("error");
        for (const b of Object.values(raw.arms[arm].budgets)) { expect(b.state).toBe("error"); expect(b.error).toMatch(/^judge: undecidable verdict: maybe/); }
      }
      const s = summarizeLme([makeLmeRow(c, raw)]);
      expect(s).toMatchObject({ n_errored: 1, n_scored: 0 });
      expect(s.judge_undecidable).toBe(6);
      expect(s.metrics.memory_inference.failure_inclusive).toMatchObject({ n: 1, incomplete_pairs: 1, only_with_akm: 0, only_without_akm: 0 });
    } finally { judge.stop(true); }
  });
});

describe("the improve timeout", () => {
  test("is --timeout-ms, or 30 s a note when that is more", () => {
    expect(IMPROVE_MS_PER_NOTE).toBe(30_000);
    expect(improveTimeoutMs(120_000, 1)).toBe(120_000);
    expect(improveTimeoutMs(120_000, 4)).toBe(120_000);
    expect(improveTimeoutMs(120_000, 18)).toBe(540_000); // K=16 plus two evidence sessions
    expect(improveTimeoutMs(900_000, 18)).toBe(900_000);
  });
});

describe("where the evidence went", () => {
  const c = { ...buildLmeCase(secret, 2, 1) };
  const turn = "user: The secret answer is BLUE42.";
  const id = Object.keys(c.evidence_turns)[0]!;
  const file = (name: string) => `memories/${name}`;
  const mine = Object.keys(sourceFiles(c))[c.session_ids.indexOf(id)]!.replace(/\.md$/, "");
  const arm = (refs: string[]): LmeArm => ({ state: "complete", error: null, search: { hits: refs.map(ref => ({ ref })) }, seconds: { index: 0, retrieval: 0, answer: 0, judge: 0 }, budgets: {} });
  const budget = (docs: { ref: string; content: string }[], tokens: number): LmeBudgetRaw => ({ ...blankBudget(pack(docs, tokens)) });
  test("separates a retrieval miss, a cut, a summary that dropped it, and the turn shown", () => {
    const parent = { ref: mine, content: `# Chat session\n\n${turn}\n` };
    expect(c.evidence_turns[id]).toEqual([turn]);
    // shown: the turn is in the displayed text
    expect(whereWentEvidence(c, arm([mine]), budget([parent], 1000))).toEqual({ [id]: "shown" });
    // retrieval missed: no hit belongs to the session
    expect(whereWentEvidence(c, arm([file("m0000000000000000")]), budget([{ ref: file("m0000000000000000"), content: "other" }], 1000))).toEqual({ [id]: "retrieval_missed" });
    // packing cut: a hit of the session is cut by the budget
    expect(whereWentEvidence(c, arm([mine]), budget([{ ref: mine, content: `# Chat session\n\n${"x".repeat(2000)}${turn}` }], 100))).toEqual({ [id]: "packing_cut" });
    // a hit that did not fit at all is a cut too
    expect(whereWentEvidence(c, arm(["memories/other", mine]), budget([{ ref: "memories/other", content: "y".repeat(400) }, parent], 60))).toEqual({ [id]: "packing_cut" });
    // summary dropped: the session's child note is displayed in full and does not hold the turn
    const child = { ref: `${mine}.derived`, content: "Derived note: something else entirely." };
    expect(whereWentEvidence(c, arm([`${mine}.derived`]), budget([child], 1000))).toEqual({ [id]: "summary_dropped" });
    // the parent is cut but its summary is shown in full: the reader has the summary only, so it is the summary that did not hold the turn
    expect(whereWentEvidence(c, arm([`${mine}.derived`, mine]), budget([child, { ref: mine, content: `# Chat session\n\n${"x".repeat(2000)}${turn}` }], 120))).toEqual({ [id]: "summary_dropped" });
    // labels are not read for an arm that did not search
    expect(whereWentEvidence(c, { ...arm([]), search: null }, budget([], 100))).toBeNull();
  });
});

describe("resuming", () => {
  test("keeps the cases that were scored, and refuses a run made with other settings or one that is still going", async () => {
    const budgets = [250];
    const c = buildLmeCase(secret, 1, 1), c2 = buildLmeCase(tinyDataset()[1]!, 1, 1);
    process.env.FAKE_AKM_IMPROVE_SLEEP = "0";
    const done = await lmeCollect(c, lmePending(0, "1", budgets), options(budgets));
    const half = lmePending(1, "1", budgets);
    const rows = [makeLmeRow(c, done), makeLmeRow(c2, half)];
    const manifest = (settings: Record<string, string | number | boolean | null>) => buildManifest({ measurement: MEASUREMENT, corpus: "public", cases: caseDigests(MEASUREMENT, [c, c2]),
      eval_settings: settings, completion: { selected: [c.id, c2.id], scored: [c.id], errored: [] } });
    const dir = join(work, "stopped");
    mkdirSync(dir);
    const write = (m: ReturnType<typeof manifest>) => {
      writeFileSync(join(dir, "summary.json"), JSON.stringify({ eval: "memory-utility", corpus: "public", manifest: m }));
      writeFileSync(join(dir, "samples.jsonl"), rows.map(r => JSON.stringify(r) + "\n").join(""));
    };
    const same = manifest({ budgets: "250", haystack: 1 });
    write(same);
    const { kept, retried } = resumableRaws(dir, same, fail);
    expect([...kept.keys()]).toEqual([c.id]); // the pending case is asked again
    expect(done.arms.none.budgets["250"]!.verdict).toBe("no"); // the scored case has a wrong answer, and it is kept, not asked again
    expect([...retried]).toEqual([]); // an unfinished case is carried on, not retried
    expect(kept.get(c.id)!.arms.source.budgets["250"].verdict).toBe(done.arms.source.budgets["250"]!.verdict);
    expect(() => resumableRaws(dir, manifest({ budgets: "250,1024", haystack: 1 }), fail)).toThrow(/different eval settings/);
    expect(() => resumableRaws(dir, buildManifest({ measurement: { ...MEASUREMENT, version: "9.9" }, corpus: "public", cases: caseDigests(MEASUREMENT, [c, c2]), eval_settings: { budgets: "250", haystack: 1 }, completion: { selected: [c.id, c2.id], scored: [], errored: [] } }), fail)).toThrow(/different version/);
    writeFileSync(join(dir, ".running"), `${process.ppid}\n`); // a live process other than this one
    expect(() => resumableRaws(dir, same, fail)).toThrow(/still going/);
    rmSync(join(dir, ".running"));
    // an errored case is asked again too
    done.arms.source.state = "error";
    write(same);
    const again = resumableRaws(dir, same, fail);
    expect(again.kept.size).toBe(0);
    expect([...again.retried]).toEqual([c.id]); // only the errored case is marked as retried
  });
});
