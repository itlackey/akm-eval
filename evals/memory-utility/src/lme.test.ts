import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Question } from "../../../benchmarks/longmemeval/src/dataset.ts";
import { caseDigests } from "../../../lib/manifest.ts";
import { DEFAULT_BUDGETS, DEFAULT_HAYSTACK, DEFAULT_SAMPLE_SEED, DEV_QUESTIONS, PRIMARY_BUDGET, SPLIT_SALT, buildLmeCase, distractorSeed, lmeCases, lmePrompt, splitQuestions } from "./lme.ts";
import { MEASUREMENT } from "./measurement.ts";
import { pack, sourceFiles } from "./protocol.ts";

/** The id and type of the 500 questions of the pinned dataset. The split depends on nothing else. */
const ids: [string, string][] = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/longmemeval-ids.json"), "utf8"));
const idsOnly = (): Question[] => ids.map(([question_id, question_type]) => ({ question_id, question_type }) as Question);
const sha = (list: string[]) => createHash("sha256").update([...list].sort().join("\n")).digest("hex");

describe("the dev / held-out split", () => {
  const { dev, heldout } = splitQuestions(idsOnly());
  test("is 100 dev and 400 held-out questions, stratified by type, covering the 500 once", () => {
    expect(dev).toHaveLength(100); expect(heldout).toHaveLength(400);
    expect(new Set([...dev, ...heldout].map(q => q.question_id)).size).toBe(500);
    const per = (qs: Question[]) => Object.fromEntries([...new Set(ids.map(i => i[1]))].sort().map(t => [t, qs.filter(q => q.question_type === t).length]));
    expect(per(dev)).toEqual({ "knowledge-update": 15, "multi-session": 27, "single-session-assistant": 11, "single-session-preference": 6, "single-session-user": 14, "temporal-reasoning": 27 });
    expect(per(heldout)).toEqual({ "knowledge-update": 63, "multi-session": 106, "single-session-assistant": 45, "single-session-preference": 24, "single-session-user": 56, "temporal-reasoning": 106 });
  });
  test("is the same split every time: a pinned digest of the dev ids", () => {
    expect(sha(dev.map(q => q.question_id))).toBe("31b89bba327b0ae23464fde264a16d84c6dcee8e76935baa9b9b663acbeabb4d");
  });
  test("does not depend on the order of the file, or on anything of a question but its id and type", () => {
    const shuffled = [...idsOnly()].reverse().map(q => ({ ...q, question: "other text", answer: "other" }) as Question);
    expect(sha(splitQuestions(shuffled).dev.map(q => q.question_id))).toBe(sha(dev.map(q => q.question_id)));
    const devIds = new Set(dev.map(q => q.question_id));
    expect(splitQuestions(shuffled).dev.map(q => q.question_id)).toEqual(shuffled.map(q => q.question_id).filter(id => devIds.has(id))); // each list keeps the order of its input
  });
  test("another salt is another split", () => {
    expect(sha(splitQuestions(idsOnly(), `${SPLIT_SALT}/other`).dev.map(q => q.question_id))).not.toBe(sha(dev.map(q => q.question_id)));
  });
});

/** A question with 30 sessions: 2 evidence (one with a flagged turn) and 28 others. */
function question(id = "q-split", answer = "GOLD-ANSWER-7731"): Question {
  const sessions = Array.from({ length: 30 }, (_, i) => [{ role: "user", content: `Session ${i}: my favourite number is ${i}.` }, { role: "assistant", content: `Noted ${i}.` }]);
  const haystack_session_ids = sessions.map((_, i) => i === 4 ? "answer_EVID4" : i === 21 ? "answer_EVID21" : `filler_${i}`);
  (sessions[4]![0] as any).has_answer = true;
  sessions[4]![0]!.content = `The detail I want you to remember is ${answer}.`;
  return { question_id: id, question_type: "multi-session", question: "What is the detail?", question_date: "2023/05/30 (Tue) 23:40", answer,
    answer_session_ids: ["answer_EVID4", "answer_EVID21"], haystack_dates: sessions.map((_, i) => `2023/05/${String(1 + (i % 28)).padStart(2, "0")} (Mon) 10:00`), haystack_session_ids, haystack_sessions: sessions };
}

describe("LongMemEval cases", () => {
  test("hold the evidence sessions and exactly K distractors, whole, in history order", () => {
    const c = buildLmeCase(question(), 16, 42);
    expect(c.notes).toHaveLength(18);
    expect(c.evidence_ids).toEqual(["answer_EVID4", "answer_EVID21"]);
    expect(c.session_ids.filter(id => id.startsWith("filler_"))).toHaveLength(16);
    const order = c.session_ids.map(id => question().haystack_session_ids.indexOf(id));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(c.notes[c.session_ids.indexOf("answer_EVID4")]).toContain("GOLD-ANSWER-7731"); // the notes are the sessions, the benchmark's memory text
    expect(c.notes[0]).toMatch(/^# Chat session\n\nSession date: /);
    expect(c.evidence_turns).toEqual({ answer_EVID4: ["user: The detail I want you to remember is GOLD-ANSWER-7731."] });
  });
  test("draw the same distractors for the same seed, other ones for another seed, whatever else is drawn", () => {
    const a = buildLmeCase(question(), 16, 42), b = buildLmeCase(question(), 16, 42), other = buildLmeCase(question(), 16, 43);
    expect(a.session_ids).toEqual(b.session_ids);
    expect(other.session_ids).not.toEqual(a.session_ids);
    expect(distractorSeed(42, "q-split")).toBe(distractorSeed(42, "q-split"));
    expect(distractorSeed(42, "q-split")).not.toBe(distractorSeed(42, "q-split-2"));
    expect(distractorSeed(42, "q-split")).not.toBe(distractorSeed(43, "q-split"));
    const two = lmeCases([question("q-a"), question("q-split")], { split: "dev", haystack: 16, sampleSeed: 42 }).cases;
    const alone = lmeCases([question("q-split")], { split: "dev", haystack: 16, sampleSeed: 42 }).cases;
    expect(two.find(c => c.id === "q-split")!.session_ids).toEqual(alone[0]!.session_ids);
  });
  test("K sets the number of distractors, and a K beyond the history takes all of it", () => {
    expect(buildLmeCase(question(), 4, 42).notes).toHaveLength(6);
    expect(buildLmeCase(question(), 100, 42).notes).toHaveLength(30);
    expect(buildLmeCase(question(), 28, 42).session_ids).toEqual(question().haystack_session_ids);
  });
  test("an evidence session missing from the haystack is refused", () => {
    expect(() => buildLmeCase({ ...question(), answer_session_ids: ["nowhere"] }, 4, 1)).toThrow(/not in its haystack/);
  });
  test("the labels never reach inference, the arms' memories or the reader's prompt", () => {
    const c = buildLmeCase(question(), 16, 42);
    // The answer is in the evidence session by construction (the session is the memory). Everything else a label knows must be absent.
    const written = Object.entries(sourceFiles(c));
    expect(written).toHaveLength(c.notes.length);
    for (const [file, text] of written) {
      expect(file).toMatch(/^memories\/m[0-9a-f]{16}\.md$/);
      for (const secret of ["answer_EVID", "has_answer", "filler_", "q-split"]) expect(`${file}\n${text}`).not.toContain(secret);
    }
    const prompt = lmePrompt(c, pack(c.notes.map((content, i) => ({ ref: `memories/${i}`, content })), 4096));
    for (const secret of ["answer_EVID", "has_answer", "evidence", "q-split", "filler_"]) expect(prompt).not.toContain(secret);
    // The gold answer is only in the prompt through the evidence session's own text; a case with no evidence text has none of it.
    const blind = lmePrompt(c, pack([], 4096));
    expect(blind).not.toContain("GOLD-ANSWER-7731");
    expect(blind).toContain("(there are no chats)");
    expect(blind).toContain("Current Date: 2023/05/30 (Tue) 23:40");
  });
  test("the digest of what a case presents does not move with its labels; the digest of its labels does", () => {
    const first = lmeCases([question("q-a")], { split: "dev", haystack: 16, sampleSeed: 42 }).cases[0]!;
    const relabelled = { ...first, answer: "SOMETHING ELSE", evidence_turns: {}, evidence_ids: [] };
    const a = caseDigests(MEASUREMENT, [first])[first.id]!, b = caseDigests(MEASUREMENT, [relabelled])[first.id]!;
    expect(b.input_sha256).toBe(a.input_sha256);
    expect(b.label_sha256).not.toBe(a.label_sha256);
  });
  test("the pre-registration holds the constants the code uses", () => {
    const text = readFileSync(join(import.meta.dir, "../PREREGISTRATION.md"), "utf8");
    const block = JSON.parse(/```json\n([\s\S]*?)```/.exec(text)![1]!);
    // Each value is held to the constant the code runs with, not to a copy of it here.
    expect(block.split_salt).toBe(SPLIT_SALT);
    expect(block.split_sizes).toEqual({ dev: DEV_QUESTIONS, heldout: ids.length - DEV_QUESTIONS });
    expect(block.haystack).toBe(DEFAULT_HAYSTACK);
    expect(block.budgets).toEqual(DEFAULT_BUDGETS);
    expect(block.primary_budget).toBe(PRIMARY_BUDGET);
    expect(block.sample_seed).toBe(DEFAULT_SAMPLE_SEED);
    expect(distractorSeed(DEFAULT_SAMPLE_SEED, "q")).toBe(parseInt(createHash("sha256").update(`${DEFAULT_SAMPLE_SEED}:q`).digest("hex").slice(0, 8), 16)); // "the first 32 bits of sha256(sample_seed:question_id)"
    expect(block.judge).toBe("eval-judge-35b");
  });
});
