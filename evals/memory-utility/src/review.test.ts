// Independent review regressions: measurement corruption must not become success.
import { expect, test } from "bun:test";
import { pending } from "./collect.ts";
import type { Case } from "./inputs.ts";
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
