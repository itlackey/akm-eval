import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "bun:test";
import type { ChatResult } from "../../../benchmarks/longmemeval/src/llm.ts";
import { cycleOutcome, pendingHistory, replay, scoreHistory, type History } from "./maintenance.ts";
import type { RawArm } from "./score.ts";

const [retention, approval, incident] = JSON.parse(readFileSync(join(import.meta.dir, "../assets/maintenance-histories.json"), "utf8")) as [History, History, History];
const ok = { ok: true };
const drain = { ok: true, failed: [] };

test("each history appends identical observations without resetting writer state or exposing future questions", async () => {
  const h = pendingHistory(retention, 0);
  const paths = Object.keys(h.originals);
  const initial = paths.slice(0, retention.initial.length);
  const later = paths.at(-1)!;
  let library: Record<string, string> = {};
  const snapshots: Record<string, string>[] = [];
  let lastRun = -1;
  const result = await replay(h.originals, initial.length, h.cycles, {
    append: (files) => { library = { ...library, ...files }; },
    snapshot: () => ({ ...library }),
    run: async (cycle) => {
      lastRun++;
      snapshots.push({ ...library });
      expect(Object.values(library).some(s => s.includes(retention.questions[0]!.question))).toBe(false);
      if (lastRun === 0) library[initial[0]!] += "\nMaintained metadata.";
      cycle.improve = ok; cycle.drain = drain;
    },
    sanitize: String,
  });
  expect(Object.keys(snapshots[0]!)).toEqual(initial);
  expect(snapshots[1]![initial[0]!]).toBe(h.originals[initial[0]!] + "\nMaintained metadata.");
  expect(snapshots[1]![later]).toBeUndefined();
  expect(snapshots[2]![later]).toBe(h.originals[later]!);
  expect(result).toEqual(snapshots[2]!);
  expect(h.cycles.map(c => c.outcome)).toEqual(["changed", "no-change", "no-change"]);
  expect(h.cycles[2]!.changed_paths).toEqual([]); // an arrival is not a maintenance effect
  expect(h.order).toEqual(["originals", "maintained"]);
  expect(pendingHistory(approval, 1).order).toEqual(["maintained", "originals"]);
});

test("successful exit does not erase native failures, budget exhaustion, unavailable processes or missing status", async () => {
  expect(cycleOutcome({ ...ok, usageReport: { byProcessEngineModel: [{ failures: 1 }] } }, drain, [])).toBe("failed");
  expect(cycleOutcome(ok, { ...drain, failed: [{ id: "failed-drain" }] }, ["memories/unchanged.md"])).toBe("failed");
  expect(cycleOutcome({ ...ok, validationFailures: [{ ref: "memories/unreadable" }] }, drain, [])).toBe("failed");
  expect(cycleOutcome({ ...ok, actions: [{ result: { ok: false, error: "timeout: improve wall-clock budget exhausted" } }] }, drain, [])).toBe("failed");
  expect(cycleOutcome({ ...ok, skipped: { reason: "lock-held" } }, drain, [])).toBe("skipped");
  expect(cycleOutcome({ ...ok, skippedProcesses: [{ process: "consolidate", reason: "no engine" }] }, drain, ["a.md"])).toBe("skipped");
  expect(cycleOutcome({ actions: [] }, drain, [])).toBe("unsupported");
  expect(cycleOutcome(ok, { ok: true }, [])).toBe("unsupported");
  expect(cycleOutcome(ok, drain, [])).toBe("no-change");
  const h = pendingHistory(retention, 0);
  let files = {};
  const result = await replay(h.originals, retention.initial.length, h.cycles, {
    append: (newFiles) => { files = { ...files, ...newFiles }; },
    snapshot: () => files,
    run: async (cycle) => { cycle.improve = ok; cycle.drain = drain; throw new Error("drain timed out"); },
    sanitize: String,
  });
  expect(result).toBeNull();
  expect(h.cycles.map(c => c.outcome)).toEqual(["failed", "not-run", "not-run"]);
  expect(h.cycles[0]!.error).toContain("timed out");
});

test("reflect's reported content rejection and per-item skip do not stop a maintenance history", async () => {
  const h = pendingHistory(retention, 0);
  const refused = { mode: "reflect-guard-rejected", result: { ok: false, reason: "quality_rejected", error: "placeholder_added" } };
  const unchanged = { mode: "reflect-skipped", result: { ok: false, reason: "no_change", error: "empty diff" } };
  const failed = { mode: "reflect-failed", result: { ok: false, reason: "aborted", error: "budget exhausted" } };
  let files = {};
  const observed = await replay(h.originals, retention.initial.length, h.cycles, {
    append: (newFiles) => { files = { ...files, ...newFiles }; },
    snapshot: () => files,
    run: async (cycle) => {
      cycle.improve = { ...ok, actions: [refused, unchanged] };
      cycle.drain = drain;
    },
    sanitize: String,
  });
  expect(observed).toEqual(h.originals);
  expect(h.cycles.map(c => c.outcome)).toEqual(["no-change", "no-change", "no-change"]);
  expect(cycleOutcome({ ...ok, actions: [refused, failed] }, drain, [])).toBe("failed");
});

function answer(arm: RawArm, fields: Record<string, string | null>) {
  const text = JSON.stringify({ answers: fields, citations: Object.fromEntries(Object.keys(fields).map(k => [k, []])) });
  const usage = { prompt_tokens: null, completion_tokens: null, cached_tokens: null, reasoning_tokens: null, cost_usd: null, seconds: 0, retries: 0, failed: false };
  const result: ChatResult = { text, model: null, promptTokens: null, completionTokens: null, finishReason: null, seconds: 0, retries: 0, usage };
  arm.state = "complete";
  arm.answer = result;
}

test("scoring catches a lost historical answer and a suspected cause turned into a fact", () => {
  const dated = pendingHistory(retention, 0);
  const [before, after] = dated.questions;
  answer(before!.arms.originals, { retention: "14 days" });
  answer(before!.arms.maintained, { retention: "30 days" });
  answer(after!.arms.originals, { retention: "30 days" });
  answer(after!.arms.maintained, { retention: "30 days" });
  const ds = scoreHistory(dated);
  expect(ds.delta).toBe(-1 / 2);
  expect(ds.harmed).toBe(1);
  expect(ds.questions[0]!.maintained.fields.retention!.outdated_answer).toBe(true);

  const unknown = pendingHistory(incident, 0);
  for (const q of unknown.questions) {
    const values = Object.fromEntries(Object.entries(q.case.fields).map(([key, field]) => [key, field.values?.[0] ?? null]));
    answer(q.arms.originals, values);
    answer(q.arms.maintained, values);
  }
  answer(unknown.questions[2]!.arms.maintained, { confirmed: "DNS" });
  const us = scoreHistory(unknown);
  expect(us.delta).toBe(-1 / 3);
  expect(us.harmed).toBe(1);
  expect(us.questions[2]!.maintained.fields.confirmed!.unsupported_unanswerable).toBe(true);
});

test("failed arms earn zero and remain in denominator; unfinished and unsupported runs do not claim a delta", () => {
  const h = pendingHistory(retention, 0);
  answer(h.questions[0]!.arms.originals, { retention: "14 days" });
  answer(h.questions[1]!.arms.originals, { retention: "30 days" });
  answer(h.questions[0]!.arms.maintained, { retention: "14 days" });
  const missing = h.questions[1]!.arms.maintained;
  const unfinished = scoreHistory(h);
  expect(unfinished).toMatchObject({ n: 2, delta: null, incomplete: true, operational_failures: 0 });
  missing.state = "error";
  missing.error = "follow-up: failed";
  expect(scoreHistory(h)).toMatchObject({ n: 2, correct: { originals: 2, maintained: 1 }, delta: -1 / 2, operational_failures: 1, harmed: 0 });
  h.cycles[2]!.outcome = "unsupported";
  expect(scoreHistory(h)).toMatchObject({ delta: null, unsupported: true });
});
