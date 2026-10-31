// Independent review regressions: measurement corruption must not become success.
import { expect, test } from "bun:test";
import { join } from "node:path";
import { pending, sandboxRelative } from "./collect.ts";
import { type Case, loadCases } from "./inputs.ts";
import { pack, promptFor, sourceFiles } from "./protocol.ts";
import { makeRow, rawOf, scoreArm } from "./score.ts";

const fixture: Case = {
  id: "review-independent", category: "partial-knowledge", common: "Use null for unknown facts.",
  notes: ["The Orbit scanner's verified code is K-493. Its owner was never recorded."],
  question: "What code and owner are recorded for the Orbit scanner?",
  fields: { code: { values: ["K-493"], evidence: [["verified code is K-493"]] }, owner: { values: null, evidence: [] } },
};
function completed() {
  const raw = pending(fixture, 0, "review");
  const arm = raw.arms.source;
  arm.state = "complete";
  arm.context = pack([{ ref: "memories/review", content: fixture.notes[0]! }], 100);
  arm.answer = {
    text: JSON.stringify({ answers: { code: "K-493", owner: null }, citations: { code: [{ ref: "memories/review", quote: fixture.notes[0] }], owner: [] } }),
    model: "scripted-review", promptTokens: 25, completionTokens: 35, finishReason: "stop", seconds: 0.5, retries: 0,
    usage: { prompt_tokens: 25, completion_tokens: 35, cached_tokens: null, reasoning_tokens: null, cost_usd: null, seconds: 0.5, retries: 0, failed: false },
  };
  return raw;
}
test("mixed known and unknown fields must both be right, not merely the known field", () => {
  const arm = completed().arms.source;
  expect(scoreArm(fixture, arm).correct).toBe(true);
  const response = JSON.parse(arm.answer!.text);
  response.answers.owner = "someone";
  arm.answer!.text = JSON.stringify(response);
  const scored = scoreArm(fixture, arm);
  expect(scored.correct).toBe(false);
  expect(scored.fields.owner!.unsupported_unanswerable).toBe(true);
});
test("gold changes cannot change inference sources or reader request", () => {
  const altered = { ...fixture, fields: { ...fixture.fields, code: { values: ["SECRET-GOLD-ONLY"], evidence: [["SECRET-ANCHOR"]] } } };
  expect(sourceFiles(altered)).toEqual(sourceFiles(fixture));
  expect(promptFor(altered, pack([], 100))).toBe(promptFor(fixture, pack([], 100)));
});
test("corrupt saved common evidence is rejected before rescoring", () => {
  const row = makeRow(fixture, completed());
  (row.raw.arms.source as any).common = null;
  expect(rawOf(row)).toHaveProperty("missing");
});
test("missing saved usage fields cannot become NaN metrics or false reporting coverage", () => {
  const row = makeRow(fixture, completed());
  delete (row.raw.arms.source.answer!.usage as any).prompt_tokens;
  expect(rawOf(row)).toHaveProperty("missing");
});
test("invalid numeric saved usage cannot silently survive as measured cost", () => {
  const row = makeRow(fixture, completed());
  row.raw.arms.source.answer!.usage.completion_tokens = Number.NaN;
  expect(rawOf(row)).toHaveProperty("missing");
});

test("saved akm JSON names the sandbox folder, not the host path", () => {
  const dir = "/home/someone/tmp/akm-eval-memory-utility-source-AbC123";
  const found = { hits: [{ ref: "memories/m1", path: `${dir}/bundle/memories/m1.md` }], note: `see ${dir}` };
  expect(sandboxRelative(found, dir)).toEqual({ hits: [{ ref: "memories/m1", path: "<sandbox>/bundle/memories/m1.md" }], note: "see <sandbox>" });
  expect(sandboxRelative("Error: failed in C:\\t\\x", "C:\\t")).toBe("Error: failed in <sandbox>\\x");
});

test("summary model_calls counts the native inference calls and the reader's answers, with calls_by", async () => {
  const { runModelCalls } = await import("./score.ts");
  const usage = (prompt: number | null, completion: number | null, seconds: number, extra: object = {}) => ({ prompt_tokens: prompt, completion_tokens: completion, cached_tokens: null, reasoning_tokens: null, cost_usd: null, seconds, retries: 0, failed: false, ...extra });
  const answer = (u: object | null) => ({ state: u ? "complete" : "not-run", answer: u ? { text: "{}", model: "m", usage: u } : null, failed_usage: null });
  const row = (model_calls: unknown, usages: (object | null)[] = [null, null, null]) => ({ raw: { inference: { model_calls }, arms: { none: answer(usages[0]!), source: answer(usages[1]!), inferred: answer(usages[2]!) } } }) as any;
  const none = { model_calls: null, calls_by: [] };
  expect(runModelCalls([row(null)])).toEqual(none);
  // Native inference only (no reader answers yet): the previous shape, plus its calls_by row.
  expect(runModelCalls([
    row({ calls: 1, errors: 0, prompt_tokens: 600, completion_tokens: 200, seconds: 2, output_tokens_per_second: 100 }),
    row({ calls: 3, errors: 1, prompt_tokens: 300, completion_tokens: 50, seconds: 1, output_tokens_per_second: 50 }),
    row(null),
  ])).toEqual({ model_calls: { calls: 4, errors: 1, prompt_tokens: 400, completion_tokens: 100, seconds: 1.33, output_tokens_per_second: 75 },
    calls_by: [{ process: "native inference", model: "", calls: 4, failures: 1, prompt_tokens: 1200, completion_tokens: 300 }] });
  // Reader answers count too: 2 native calls + 3 + 2 reader calls (one failed, whose tokens never enter the means).
  const failed = row(null, [usage(100, 20, 2), usage(null, null, 5, { failed: true }), usage(300, 40, 4)]);
  failed.raw.arms.source.answer = null; failed.raw.arms.source.failed_usage = usage(null, null, 5, { failed: true });
  const run = runModelCalls([row({ calls: 2, errors: 0, prompt_tokens: 600, completion_tokens: 200, seconds: 2, output_tokens_per_second: 100 }, [usage(200, 10, 1), usage(200, 30, 1), usage(400, 30, 3)]), failed]);
  expect(run.model_calls).toEqual({ calls: 8, errors: 1, prompt_tokens: 342.9, completion_tokens: 75.7, seconds: 2.14, output_tokens_per_second: 35.3 });
  expect(run.calls_by).toEqual([
    { process: "native inference", model: "m", calls: 2, failures: 0, prompt_tokens: 1200, completion_tokens: 400 },
    { process: "reader", model: "m", calls: 6, failures: 1, prompt_tokens: 1200, completion_tokens: 130 },
  ]);
});

test("a common-only control states its answer in the common document, with no exception clause", () => {
  const controls = loadCases(join(import.meta.dir, "../assets")).filter(c => c.category === "common-only");
  expect(controls.map(c => c.id)).toEqual(["case-14"]);
  for (const c of controls) for (const f of Object.values(c.fields)) {
    expect(f.values!.every(v => c.common.includes(v))).toBe(true);
    expect(c.common).not.toMatch(/\bunless\b/i);
  }
});
