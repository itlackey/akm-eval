// The runner end to end on a three-question dataset, with a fake akm and a fake model server: the flags, the saved result, and --resume.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tinyDataset } from "../../../benchmarks/longmemeval/src/fakes.ts";
import { REPO_ROOT } from "../../../lib/manifest.ts";
import { fakeModel, writeFakeAkm, type FakeModel } from "./lme-fakes.ts";

const work = mkdtempSync(join(tmpdir(), "memlme-run-"));
const label = `lme-run-test-${process.pid}`;
let model: FakeModel;
const results: string[] = [];
beforeAll(() => {
  model = fakeModel("BLUE42");
  mkdirSync(join(work, "cases"));
  writeFileSync(join(work, "cases/longmemeval_s_cleaned.json"), JSON.stringify(tinyDataset()));
});
afterAll(() => { model.stop(); rmSync(work, { recursive: true, force: true }); for (const d of results) rmSync(d, { recursive: true, force: true }); });

async function run(...args: string[]) {
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe",
    env: { ...process.env, AKM_BIN: `bun ${writeFakeAkm(work)}`, FAKE_AKM_LOG: join(work, "akm.log"), FAKE_AKM_IMPROVE_SLEEP: "", MODEL_NAME: "fake", MODEL_BASE_URL: model.url, MODEL_API_KEY: "", MODEL_PROVIDER: "openai", JUDGE_MODEL: "", JUDGE_BASE_URL: "" } });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  const dir = /Results: (.+)/.exec(out)?.[1];
  if (dir && !results.includes(dir)) results.push(dir);
  return { out, err, code, dir };
}
const base = ["--split", "dev", "--cases", join(work, "cases"), "--judge-model", "fake-judge", "--budgets", "250,4096", "--haystack", "1", "--label", label];
const improves = () => (existsSync(join(work, "akm.log")) ? readFileSync(join(work, "akm.log"), "utf8").split("\n").filter(l => l === "improve").length : 0);
const summaryOf = (dir: string) => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
const rowsOf = (dir: string) => readFileSync(join(dir, "samples.jsonl"), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));

describe("memory-utility --split", () => {
  test("a stopped run is carried on, asking only the cases that were not scored", async () => {
    model.failing = true; // the reader is down: every answer is an error, so every case is errored
    const first = await run(...base);
    expect(first.code).toBe(0);
    const dir = first.dir!;
    let s = summaryOf(dir);
    expect(s).toMatchObject({ eval: "memory-utility", case_source: "longmemeval", split: "dev", haystack: 1, budgets: [250, 4096], primary_budget: 4096, judge_model: "fake-judge", model: "fake", n_cases: 3, n_scored: 0, n_errored: 3, status: "complete" });
    expect(s.manifest.eval_settings).toMatchObject({ case_source: "longmemeval", split: "dev", haystack: 1, budgets: "250,4096", primary_budget: 4096, sample_seed: 42, judge_model: "fake-judge", reader_model: "fake", context_tokens_estimated: 4096 });
    expect(s.manifest.engines.judge).toMatchObject({ model: "fake-judge", endpoint: "<MODEL_BASE_URL>" });
    expect(JSON.stringify(s)).not.toContain("localhost"); // the model's address is not saved
    expect(rowsOf(dir)).toHaveLength(3);
    expect(rowsOf(dir).some(r => "retried" in r.raw)).toBe(false); // nothing was asked again yet
    expect(improves()).toBe(3);

    model.failing = false;
    const second = await run(...base, "--resume", dir);
    expect(second.code).toBe(0);
    expect(second.dir).toBe(dir);
    s = summaryOf(dir);
    expect(s).toMatchObject({ n_scored: 3, n_errored: 0, resumed: true, status: "complete" });
    expect(improves()).toBe(6); // the three errored cases were asked again
    expect(rowsOf(dir)).toHaveLength(3);
    expect(rowsOf(dir).map(r => r.raw.retried)).toEqual([true, true, true]); // each sample says so

    const third = await run(...base, "--resume", dir);
    expect(third.code).toBe(0);
    expect(third.out).toContain("resuming: 3 of 3 cases already scored");
    expect(improves()).toBe(6); // nothing was asked again: a wrong answer is not an error, and the none arm is wrong on some cases
    expect(rowsOf(dir).map(r => r.raw.retried)).toEqual([true, true, true]); // the record is kept
    expect(summaryOf(dir).metrics).toEqual(s.metrics);

    // The answers are judged: the source arm sees the evidence and the none arm does not.
    const rows = rowsOf(dir);
    const secret = rows.find(r => r.id === "q-secret")!;
    expect(secret.arms.none["4096"]).toEqual({ evaluated: true, correct: false });
    expect(secret.arms.source["4096"]).toEqual({ evaluated: true, correct: true });
    expect(s.calls_by.map((r: any) => r.process)).toEqual(["reader", "judge"]); // the fake akm records no inference calls
    // No host path or login is saved.
    for (const file of ["samples.jsonl", "summary.json"]) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text).not.toContain("/home/");
      expect(text).not.toContain(process.env.USER ?? "\0");
    }

    const other = await run(...base, "--haystack", "2", "--resume", dir);
    expect(other.code).not.toBe(0);
    expect(other.err).toContain("different eval settings");
  }, 120_000);

  test("with 4096 and 8192 the summary and the console carry the cross-budget comparison and the Holm-adjusted p-values; without 8192 they do not", async () => {
    const both = await run(...base.slice(0, base.indexOf("--budgets")), "--budgets", "4096,8192", "--haystack", "1", "--label", `${label}-cross`);
    expect(both.code).toBe(0);
    const m = summaryOf(both.dir!).metrics;
    expect(m.cross_budget_inference.failure_inclusive).toMatchObject({ n: 3, test: expect.stringContaining("McNemar") });
    expect(m.primary_comparisons.comparisons.matched_budget.p_holm).toBeGreaterThanOrEqual(m.primary_comparisons.comparisons.matched_budget.p_value);
    expect(m.primary_comparisons.comparisons.cross_budget.p_holm).toBe(m.primary_comparisons.comparisons.matched_budget.p_holm); // two comparisons: both p_holm are at least the larger raw one's step
    expect(both.out).toContain("inferred@4096 - source@8192");
    expect(both.out).toContain("primary comparisons, p raw -> Holm (alpha 0.05)");
    const without = await run(...base, "--label", `${label}-nocross`);
    expect(without.code).toBe(0);
    expect(summaryOf(without.dir!).metrics).not.toHaveProperty("cross_budget_inference");
    expect(without.out).not.toContain("primary comparisons");
  }, 120_000);

  test("a held-out half runs only with the pre-registered settings, and the refusal comes before any akm call; dev runs are free", async () => {
    const held = ["--split", "heldout-a", "--cases", join(work, "cases"), "--corpus", "custom", "--label", `${label}-held`];
    const registered = ["--judge-model", "fast/qwen3.6-35b-a3b"];
    const log = () => existsSync(join(work, "akm.log")) ? readFileSync(join(work, "akm.log"), "utf8") : "", before = log();
    for (const [args, message] of [
      [["--judge-model", "fake-judge"], 'judge model "fake-judge" (pre-registered "fast/qwen3.6-35b-a3b")'],
      [[...registered, "--haystack", "8"], "haystack 8 (pre-registered 16)"],
      [[...registered, "--budgets", "4096"], "budgets, which fix the primary endpoint, [4096] (pre-registered [4096,8192])"],
      [[...registered, "--budgets", "2048,4096,8192"], "budgets, which fix the primary endpoint, [2048,4096,8192]"],
      [[...registered, "--sample-seed", "7"], "sample seed 7 (pre-registered 42)"],
      [["--judge-model", "fake-judge", "--haystack", "1", "--budgets", "250,4096", "--sample-seed", "1"], "judge model"],
    ] as [string[], string][]) {
      const r = await run(...held, ...args);
      expect(r.code).not.toBe(0);
      expect(r.err).toContain("--split heldout-a runs only with the pre-registered settings");
      expect(r.err).toContain(message);
      expect(r.out).not.toContain("Results:");
      expect(r.out).not.toContain("Reader/inference destination");
    }
    expect(log()).toBe(before); // akm was not called
    // With the pre-registered flags only the judge's line settings are left to differ (no models.json line sets them here), so only they are named.
    const flags = await run(...held, ...registered);
    expect(flags.code).not.toBe(0);
    expect(flags.err).toContain("judge chat.max_tokens undefined (pre-registered 64)");
    for (const named of ["haystack", "budgets", "sample seed", "judge model"]) expect(flags.err).not.toContain(named);
    // The same other settings on dev are not refused.
    const dev = await run("--split", "dev", "--cases", join(work, "cases"), "--judge-model", "fake-judge", "--budgets", "250,4096", "--haystack", "1", "--sample-seed", "7", "--limit", "1", "--label", `${label}-devfree`);
    expect(dev.code).toBe(0);
  }, 120_000);

  test("refuses to resume a run that is not there", async () => {
    const r = await run(...base, "--resume", join(work, "nothing"));
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("has no summary.json");
  });

  test("the 24 public cases run as before, with the exact McNemar statistics, and resume too", async () => {
    const args = ["--limit", "2", "--label", `${label}-public`];
    const before = improves();
    const first = await run(...args);
    expect(first.code).toBe(0);
    const s = summaryOf(first.dir!);
    expect(s).toMatchObject({ corpus: "public", version: "0.2", n_cases: 2, n_scored: 2, n_errored: 0, status: "complete" });
    expect(s.case_source).toBeUndefined();
    expect(s.metrics.persistent_memory.failure_inclusive).toMatchObject({ n: 2, p_value: 1 });
    expect(s.metrics.persistent_memory.failure_inclusive.test).toContain("McNemar");
    expect(s.metrics.persistent_memory.failure_inclusive.interval_method).toContain("Fay and Lumbard");
    expect(JSON.stringify(s)).not.toContain("Hoeffding");
    expect(rowsOf(first.dir!)).toHaveLength(2);
    expect(rowsOf(first.dir!)[0]).not.toHaveProperty("kind");
    expect(improves()).toBe(before + 2);
    const again = await run(...args, "--resume", first.dir!);
    expect(again.code).toBe(0);
    expect(again.out).toContain("resuming: 2 of 2 cases already scored");
    expect(improves()).toBe(before + 2);
  }, 120_000);
});
