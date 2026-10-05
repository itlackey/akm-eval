import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DATA_FILE, QUESTION_TYPES, type Question, ensureDataset, parseQuestions, sampleQuestions } from "./dataset.ts";
import { pairedDifference, rate, retrievalMetrics, summarizeRetrieval } from "./metrics.ts";
import { isDecidable, isYes, judgePrompt, readerPrompt, renderSession } from "./prompts.ts";

const make = (id: string, type: string, extra: Partial<Question> = {}): Question => ({
  question_id: id,
  question_type: type,
  question: `Question ${id}?`,
  question_date: "2023/05/30 (Tue) 23:40",
  answer: "42",
  answer_session_ids: ["answer_1"],
  haystack_dates: ["2023/05/20 (Sat) 02:21"],
  haystack_session_ids: ["answer_1"],
  haystack_sessions: [[{ role: "user", content: "hello" }]],
  ...extra,
});

const dataset = (): Question[] => {
  const sizes: Record<string, number> = { "single-session-user": 14, "single-session-assistant": 11, "single-session-preference": 6, "multi-session": 27, "temporal-reasoning": 27, "knowledge-update": 15 };
  return QUESTION_TYPES.flatMap((t) => Array.from({ length: sizes[t] }, (_, i) => make(`${t}-${i}`, t)));
};

describe("sampleQuestions", () => {
  const all = dataset();

  test("takes everything when the limit covers it", () => {
    expect(sampleQuestions(all, undefined, 1)).toMatchObject({ order: "full", seed: null, n: 100, total: 100 });
    expect(sampleQuestions(all, 100, 1).items).toHaveLength(100);
  });

  test("draws in proportion to the types, keeps file order, and repeats under the same seed", () => {
    const a = sampleQuestions(all, 20, 7);
    expect(a.items).toHaveLength(20);
    expect(a.order).toBe("stratified-seeded");
    expect(Object.values(a.per_type).reduce((x, y) => x + y, 0)).toBe(20);
    expect(a.per_type["multi-session"]).toBe(5);
    const positions = a.items.map((q) => all.indexOf(q));
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
    expect(sampleQuestions(all, 20, 7).items.map((q) => q.question_id)).toEqual(a.items.map((q) => q.question_id));
    expect(sampleQuestions(all, 20, 8).items.map((q) => q.question_id)).not.toEqual(a.items.map((q) => q.question_id));
  });

  test("is never the first N", () => {
    const picked = sampleQuestions(all, 3, 42).items;
    expect(new Set(picked.map((q) => q.question_type)).size).toBe(3);
  });
});

describe("parseQuestions", () => {
  test("rejects a question that is not usable", () => {
    expect(parseQuestions(JSON.stringify([make("a", "multi-session")]))).toHaveLength(1);
    expect(() => parseQuestions(JSON.stringify([make("a", "novel-type")]))).toThrow("unknown type");
    expect(() => parseQuestions(JSON.stringify([make("a", "multi-session", { haystack_dates: [] })]))).toThrow("different lengths");
    expect(() => parseQuestions("[]")).toThrow("not a list");
  });
});

describe("ensureDataset", () => {
  const dirs: string[] = [];
  let server: ReturnType<typeof Bun.serve> | undefined;
  afterEach(() => {
    server?.stop(true);
    server = undefined;
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const setup = (served: string, pinned = served) => {
    const dir = mkdtempSync(join(tmpdir(), "lme-assets-"));
    dirs.push(dir);
    let hits = 0;
    server = Bun.serve({ port: 0, fetch: () => (hits++, new Response(served)) });
    writeFileSync(join(dir, "ASSETS.lock"), JSON.stringify({ dataset: "t", source: "s", licence: "MIT", revision: "r".repeat(40), files: { [DATA_FILE]: { url: `http://127.0.0.1:${server.port}/data.json`, bytes: pinned.length, sha256: createHash("sha256").update(pinned).digest("hex") } } }));
    return { dir, hits: () => hits };
  };

  test("fetches the pinned file, checks it, and then uses the copy it has", async () => {
    const { dir, hits } = setup('[{"x":1}]');
    const quiet = () => {};
    expect(await ensureDataset(dir, quiet)).toBe(join(dir, DATA_FILE));
    expect(hits()).toBe(1);
    await ensureDataset(dir, quiet);
    expect(hits()).toBe(1);
  });

  test("refuses a download that does not match the checksum, and keeps nothing", async () => {
    const { dir } = setup('[{"x":2}]', '[{"x":1}]');
    await expect(ensureDataset(dir, () => {}, 0)).rejects.toThrow("could not fetch");
    expect(existsSync(join(dir, DATA_FILE))).toBe(false);
    expect(readdirSync(dir)).toEqual(["ASSETS.lock"]);
  });

  test("refuses a copy that does not match the checksum", async () => {
    const { dir } = setup('[{"x":1}]');
    writeFileSync(join(dir, DATA_FILE), "tampered");
    await expect(ensureDataset(dir, () => {})).rejects.toThrow("not the");
  });
});

describe("retrievalMetrics", () => {
  test("scores the first k results against the evidence sessions", () => {
    expect(retrievalMetrics(["a"], ["x", "a", "y"], 5)).toEqual({ returned: 3, hit: true, recall: 1, precision: 0.2, mrr: 0.5, ndcg: 0.6309 });
    expect(retrievalMetrics(["a", "b"], ["a", "x", "y", "z", "b"], 5)).toMatchObject({ returned: 5, hit: true, recall: 1, precision: 0.4, mrr: 1 });
    expect(retrievalMetrics(["a", "b"], ["a", "x", "y", "z", "c", "b"], 5)).toMatchObject({ returned: 5, recall: 0.5, precision: 0.2 });
    expect(retrievalMetrics(["a"], [], 5)).toEqual({ returned: 0, hit: false, recall: 0, precision: 0, mrr: 0, ndcg: 0 });
    // fewer than k results do not raise the scores: the places that went unfilled count against them
    expect(retrievalMetrics(["a", "b"], ["a"], 5)).toMatchObject({ returned: 1, recall: 0.5, precision: 0.2 });
    expect(retrievalMetrics(["a", "b"], ["a"], 5).ndcg).toBeCloseTo(1 / (1 + 1 / Math.log2(3)), 4);
    expect(retrievalMetrics([], ["a"], 5).recall).toBe(0);
  });

  test("averages over questions", () => {
    const s = summarizeRetrieval([retrievalMetrics(["a"], ["a"], 5), retrievalMetrics(["a"], [], 5)], 5);
    expect(s).toMatchObject({ k: 5, n: 2, zero_hit_rate: 0.5, hit_rate: 0.5, recall: 0.5 });
    expect(summarizeRetrieval([], 5).hit_rate).toBeNull();
  });
});

describe("pairedDifference", () => {
  test("counts the questions where the arms disagree", () => {
    const pairs = [
      ...Array(6).fill({ without: true, with: true }),
      ...Array(3).fill({ without: false, with: true }),
      ...Array(1).fill({ without: true, with: false }),
      ...Array(10).fill({ without: false, with: false }),
    ];
    const d = pairedDifference(pairs);
    expect(d).toMatchObject({ n: 20, value: 0.1, both_correct: 6, only_with_akm: 3, only_without_akm: 1, neither: 10 });
    expect(d.ci95?.[0]).toBeLessThan(0.1);
    expect(d.ci95?.[1]).toBeGreaterThan(0.1);
  });

  test("keeps the interval inside what a difference can be", () => {
    const d = pairedDifference([{ without: false, with: true }, { without: true, with: true }]);
    expect(d.value).toBe(0.5);
    expect(d.ci95?.[1]).toBe(1);
    expect(d.ci95?.[0]).toBeGreaterThanOrEqual(-1);
  });

  test("has no interval when the arms never disagree, and nothing to say about no pairs", () => {
    expect(pairedDifference(Array(3).fill({ without: true, with: true }))).toMatchObject({ n: 3, value: 0, ci95: null, both_correct: 3 });
    expect(pairedDifference([])).toMatchObject({ n: 0, value: null, ci95: null });
    expect(rate(0, 0).rate).toBeNull();
  });
});

describe("prompts", () => {
  test("the reader prompt holds the sessions, the date and the question", () => {
    const sessions = [
      { date: "2023/05/20 (Sat) 02:21", turns: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] },
      { date: "2023/05/21 (Sun) 03:00", turns: [{ role: "user", content: "again" }] },
    ];
    const p = readerPrompt(sessions, "2023/05/30 (Tue) 23:40", "What?");
    expect(p).toContain("### Session 1\nSession Date: 2023/05/20 (Sat) 02:21\nuser: hi\nassistant: hello");
    expect(p).toContain("### Session 2\nSession Date: 2023/05/21 (Sun) 03:00\nuser: again");
    expect(p.endsWith("Current Date: 2023/05/30 (Tue) 23:40\nQuestion: What?\nAnswer:")).toBe(true);
    expect(readerPrompt([], "d", "q")).toContain("(there are no chats)");
    expect(renderSession(sessions[1], 9)).toStartWith("### Session 9");
  });

  test("the judge prompts are exactly the benchmark's, for each question type", () => {
    const fixture = JSON.parse(readFileSync(join(import.meta.dir, "judge-prompts.fixture.json"), "utf8"));
    expect(fixture.prompts).toHaveLength(7);
    for (const p of fixture.prompts) expect(judgePrompt(p.type, fixture.question, fixture.answer, fixture.response, p.abstention)).toBe(p.prompt);
  });

  test("the judge prompts differ by type in the way the benchmark's do", () => {
    const ask = (type: string, abs = false) => judgePrompt(type, "Q", "A", "R", abs);
    expect(ask("multi-session")).toContain("If the response only contains a subset of the information required by the answer, answer no.");
    expect(ask("temporal-reasoning")).toContain("do not penalize off-by-one errors for the number of days.");
    expect(ask("multi-session")).not.toContain("off-by-one");
    expect(ask("knowledge-update")).toContain("as long as the updated answer is the required answer");
    expect(ask("single-session-preference")).toContain("\n\nRubric: A\n\n");
    expect(ask("multi-session", true)).toContain("Does the model correctly identify the question as unanswerable?");
    expect(ask("multi-session")).toEndWith("\n\nQuestion: Q\n\nCorrect Answer: A\n\nModel Response: R\n\nIs the model response correct? Answer yes or no only.");
    expect(() => ask("unknown")).toThrow("unsupported");
  });

  test("a verdict is correct when it holds yes, and decidable when it is just yes or no", () => {
    expect(isYes("Yes.")).toBe(true);
    expect(isYes("no")).toBe(false);
    expect(isYes("We need to see... yes")).toBe(true);
    expect(isDecidable(" 'Yes.' ")).toBe(true);
    expect(isDecidable("No")).toBe(true);
    expect(isDecidable("We need to see")).toBe(false);
  });
});
