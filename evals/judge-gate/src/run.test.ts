import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Case } from "./lib.ts";
import { runCorpus, sandboxEnv } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** An akm whose judge reads one word from the candidate and answers with that verdict. */
const FAKE_AKM = `
const [a, b] = process.argv.slice(2);
if (a === "--version") { console.log("0.9.99-test"); process.exit(0); }
if (a !== "improve" || b !== "judge") { console.error("unexpected " + process.argv.slice(2).join(" ")); process.exit(1); }
const input = JSON.parse(await Bun.stdin.text());
const word = String(input.candidate).split(" ")[0];
const seen = { feedback: input.feedback, env: process.env.AKM_CONFIG_DIR };
if (word === "PASS") console.log(JSON.stringify({ ok: true, engine: "judge", pass: true, score: 4.5, criteria: { need: 5, preservation: 4, quality: 5 }, reason: JSON.stringify(seen) }));
else if (word === "REVIEW") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, reviewNeeded: true, score: 3, reason: "needs a person" }));
else if (word === "REJECT") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: 1.5, reason: "churn" }));
else if (word === "NOVERDICT") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: -1, reviewNeeded: true, reason: "judge timeout/error" }));
else if (word === "UNREADABLE") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: -1, reviewNeeded: true, reason: "judge parse failed — routed to review" }));
else { console.error("boom"); process.exit(70); }
`;

function setup(cases: { word: string; label: "good" | "bad"; feedback?: string }[]) {
  const root = mkdtempSync(join(tmpdir(), "judge-gate-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  const rows: Case[] = cases.map((c, i) => ({ id: `case-${i + 1}`, kind: "reflect", set: "s", label: c.label, labelReason: "r", feedback: c.feedback ?? "", source: "source text", candidate: `${c.word} revised text` }));
  writeFileSync(join(assets, "cases.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  const sandbox = join(root, "sandbox");
  mkdirSync(sandbox);
  const ctx = { akm: ["bun", script], env: { ...(process.env as Record<string, string>), AKM_CONFIG_DIR: join(sandbox, "config") }, sandbox, version: "0.9.99-test", model: "the-model", label: "t" };
  return { ctx, folders: { assets, results: join(root, "results") } };
}

const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};

describe("sandboxEnv", () => {
  test("gives akm its own folders, drops the caller's AKM_ settings and the judge key, and keeps the model key", () => {
    const keep = { ...process.env };
    process.env.AKM_BUNDLE_DIR = "/live/bundle";
    process.env.AKM_DEBUG = "1";
    process.env.JUDGE_API_KEY = "judge-secret";
    process.env.MODEL_API_KEY = "model-secret";
    try {
      const env = sandboxEnv("/sandbox");
      expect(env.AKM_BUNDLE_DIR).toBe("/sandbox/bundle");
      for (const k of ["AKM_CONFIG_DIR", "AKM_DATA_DIR", "AKM_CACHE_DIR", "AKM_STATE_DIR"]) expect(env[k]).toStartWith("/sandbox/");
      for (const k of ["XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"]) expect(env[k]).toStartWith("/sandbox/");
      expect(env.AKM_DEBUG).toBeUndefined();
      expect(env.JUDGE_API_KEY).toBeUndefined();
      expect(env.MODEL_API_KEY).toBe("model-secret");
      expect(env.PATH).toBe(keep.PATH as string);
    } finally {
      for (const k of ["AKM_BUNDLE_DIR", "AKM_DEBUG", "JUDGE_API_KEY", "MODEL_API_KEY"]) {
        if (keep[k] === undefined) delete process.env[k];
        else process.env[k] = keep[k];
      }
    }
  });
});

describe("runCorpus", () => {
  test("counts passes per label, keeps review apart from reject, and counts a case with no verdict as errored", async () => {
    const { ctx, folders } = setup([
      { word: "PASS", label: "good" },
      { word: "REVIEW", label: "good" },
      { word: "PASS", label: "bad" },
      { word: "REJECT", label: "bad" },
      { word: "NOVERDICT", label: "bad" },
      { word: "CRASH", label: "bad" },
      { word: "UNREADABLE", label: "good" },
    ]);
    const summary = await quiet(() => runCorpus("public", ctx, folders));
    expect(summary).toMatchObject({ eval: "judge-gate", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 7, n_run: 7, n_scored: 5, n_errored: 2 });
    expect(summary.metrics.good).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    expect(summary.metrics.bad).toEqual({ n: 2, passed: 1, rate: 0.5 });
    expect(summary.metrics.precision).toEqual({ value: 0.5, passed_good: 1, passed: 2 });
    expect(summary.metrics.outcomes.good).toEqual({ pass: 1, review: 2, reject: 0, error: 0 });
    expect(summary.metrics.outcomes.bad).toEqual({ pass: 1, review: 0, reject: 1, error: 2 });

    const dir = join(folders.results, readdirSync(folders.results)[0]);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored.results_dir).toBeUndefined();
    expect(stored.git_commit).toBeString();
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.id === "case-6")).toMatchObject({ outcome: "error", error: expect.stringContaining("boom") });
    expect(rows.find((r) => r.id === "case-5")).toMatchObject({ outcome: "error", error: "judge timeout/error" });
  });

  test("runs akm in the sandbox and puts negative feedback first", async () => {
    const { ctx, folders } = setup([{ word: "PASS", label: "good", feedback: "[positive] fine\n[negative] stale" }]);
    await quiet(() => runCorpus("public", ctx, folders));
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const row = JSON.parse(readFileSync(join(dir, "samples.jsonl"), "utf8").trim());
    const seen = JSON.parse(row.reason);
    expect(seen.feedback).toBe("[negative] stale\n[positive] fine");
    expect(seen.env).toBe(ctx.env.AKM_CONFIG_DIR);
  });

  test("stops early when no case gets a verdict, and says what to check", async () => {
    const { ctx, folders } = setup(Array.from({ length: 12 }, () => ({ word: "CRASH", label: "bad" as const })));
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("the first 5 cases got no verdict");
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(summary.n_run).toBeLessThan(12);
    expect(summary.n_scored).toBe(0);
  });

  test("a limit runs a good/bad mix", async () => {
    const { ctx, folders } = setup([...Array.from({ length: 4 }, () => ({ word: "PASS", label: "good" as const })), ...Array.from({ length: 12 }, () => ({ word: "REJECT", label: "bad" as const }))]);
    const summary = await quiet(() => runCorpus("public", { ...ctx, limit: 4 }, folders));
    expect(summary).toMatchObject({ limit: 4, n_cases: 16, n_run: 4 });
    expect(summary.metrics.good.n).toBe(1);
    expect(summary.metrics.bad.n).toBe(3);
  });
});
