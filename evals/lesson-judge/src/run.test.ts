// The tests of lesson-judge's spec (run.ts). What every eval that runs on lib/run.ts does the same way is tested in lib/run.test.ts; these are what
// lesson-judge adds: the input akm gets, the two modes' routes in a run, its config and its summary.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { caseDigests, manifestProblems, readManifest } from "../../../lib/manifest.ts";
import { casesSha256 } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { runCorpus } from "./run.ts";
import type { Case } from "./score.ts";

const dirs: string[] = [];
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_LOG: process.env.FAKE_LOG, FAKE_SCHEMA: process.env.FAKE_SCHEMA, FAKE_NOJUDGE: process.env.FAKE_NOJUDGE, MODEL_API_KEY: process.env.MODEL_API_KEY, TMPDIR: process.env.TMPDIR };
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const BASE_URL = "http://localhost:9/v1";

/** An akm whose lesson judge reads the first word of the lesson body and answers with that verdict. It logs the input it was given and the config it reads. */
const FAKE_AKM = `
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const [a, b] = process.argv.slice(2);
if (a === "--version") { console.log("0.10.261200-test"); process.exit(0); }
if (a === "judge" && b === "--list") {
  if (process.env.FAKE_NOJUDGE) { console.error("Unknown command judge"); process.exit(2); }
  console.log(JSON.stringify({ judges: [{ name: "distill.lesson", schemaVersion: Number(process.env.FAKE_SCHEMA ?? 1) }] }));
  process.exit(0);
}
if (a !== "judge" || b !== "distill.lesson") { console.error("unexpected " + process.argv.slice(2).join(" ")); process.exit(1); }
const input = JSON.parse(await Bun.stdin.text());
const word = String(input.lesson).split(" ")[0];
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ input, config: JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8")) }) + "\\n");
const env = (outcome, rest) => console.log(JSON.stringify({ judge: "distill.lesson", schemaVersion: 1, runner: { kind: "connection", name: "judge", model: null }, outcome, ...rest }));
const criteria = (r, n, g) => ({ reusable: r, nonRedundancy: n, grounding: g });
if (word === "PASS") env("verdict", { verdict: { pass: true, score: 4.5, criteria: criteria(5, 4, 5), reason: "fine" } });
else if (word === "REVIEW") env("verdict", { verdict: { pass: false, reviewNeeded: true, score: 3, criteria: criteria(3, 3, 3), reason: "unsure" } });
else if (word === "REJECT") env("verdict", { verdict: { pass: false, score: 1.5, criteria: criteria(1, 2, 4), reason: "status" } });
else if (word === "NOVERDICT") env("error", { reason: "judge timeout/error" });
else if (word === "UNREADABLE") env("unparseable", { reason: "the reply held no verdict" });
else if (word === "LEAK") env("verdict", { verdict: { pass: false, score: 1.5, reason: "connect to ${BASE_URL}/chat/completions failed" } });
else { console.error("boom ${BASE_URL}/chat/completions"); process.exit(70); }
`;

type Spec = { word: string; mode?: "new" | "update"; label: "good" | "bad"; kind?: Case["kind"] };

const casesOf = (specs: Spec[]): Case[] =>
  specs.map((c, i) => {
    const mode = c.mode ?? "new";
    return {
      id: `case-${i + 1}`,
      mode,
      label: c.label,
      ...(c.label === "bad" ? { kind: c.kind ?? (mode === "new" ? "dated-status" : "restated-update") } : {}),
      labelReason: "r",
      origin: "hand-written",
      from: "lesson-01",
      memory: "memories/m",
      input: { lesson: `${c.word} body`, source: "a memory", feedback: ["- [negative] stale"], ...(mode === "update" ? { extending: "the rule" } : { related: [{ ref: "lessons/a", content: "a" }] }) },
    };
  });

function setup(specs: Spec[], env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "lesson-judge-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "cases.jsonl"), `${casesOf(specs).map((r) => JSON.stringify(r)).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  const own = join(root, "tmp");
  mkdirSync(own);
  process.env.AKM_BIN = commandLine(["bun", script]);
  process.env.FAKE_LOG = join(root, "calls.jsonl");
  process.env.MODEL_API_KEY = "model-secret";
  process.env.TMPDIR = own;
  for (const k of ["FAKE_NOJUDGE", "FAKE_SCHEMA"]) delete process.env[k];
  Object.assign(process.env, env);
  const ctx = { baseUrl: BASE_URL, model: "the-model", hasKey: true, version: "0.10.261200-test", label: "t" };
  const corpus: ResolvedCorpus = { name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" };
  return { ctx, corpus, assets, results: join(root, "results"), calls: () => (existsSync(process.env.FAKE_LOG as string) ? readFileSync(process.env.FAKE_LOG as string, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []), leftover: () => readdirSync(own) };
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

describe("runCorpus", () => {
  test("scores a new lesson and an update by their own routes, keeps an error apart from an unparseable reply, and leaves a crash out", async () => {
    const t = setup([
      { word: "PASS", label: "good" },
      { word: "REVIEW", label: "good" },
      { word: "PASS", label: "bad" },
      { word: "UNREADABLE", label: "bad" },
      { word: "PASS", mode: "update", label: "good" },
      { word: "REVIEW", mode: "update", label: "bad" },
      { word: "NOVERDICT", mode: "update", label: "bad" },
      { word: "CRASH", label: "bad" },
    ]);
    const summary = await quiet(() => runCorpus(t.corpus, t.ctx, t.results));
    expect(summary).toMatchObject({ eval: "lesson-judge", corpus: "public", model: "the-model", akm_version: "0.10.261200-test", n_cases: 8, n_run: 8, n_scored: 7, n_errored: 1, status: "complete" });
    const m = summary.metrics;
    expect(m.good.new).toEqual({ n: 2, passed: 1, rate: 0.5 });
    expect(m.bad.new).toEqual({ n: 2, passed: 1, rate: 0.5 });
    expect(m.good.update).toEqual({ n: 1, passed: 1, rate: 1 });
    expect(m.bad.update).toEqual({ n: 2, passed: 0, rate: 0 });
    expect(m.review_share).toEqual({ n: 4, count: 2, rate: 0.5 }); // the REVIEW verdict and the unparseable reply, both new lessons
    expect(m.no_verdict.error.count).toBe(1);
    expect(m.no_verdict.unparseable.count).toBe(1);
    expect(m.akm_failed).toEqual({ n: 8, count: 1, rate: 0.125 });
    expect(m.routes["update/restated-update"]).toEqual({ pass: 0, review: 0, reject: 2 });
    expect(summary.rubric_version).toBeNumber();
  });

  test("sends the case's input to the judge exactly as it is, and writes distill's quality gate into the config", async () => {
    const t = setup([{ word: "PASS", label: "good" }, { word: "PASS", mode: "update", label: "good" }]);
    await quiet(() => runCorpus(t.corpus, { ...t.ctx, concurrency: 1 }, t.results));
    const [first, second] = t.calls();
    expect(first.input).toEqual(casesOf([{ word: "PASS", label: "good" }])[0]?.input);
    expect(second.input.extending).toBe("the rule");
    expect(second.input.related).toBeUndefined();
    const json = JSON.stringify(first.config);
    expect(json).toContain("MODEL_API_KEY");
    expect(json).toContain("the-model");
    expect(t.leftover()).toEqual([]); // the sandbox is removed
  });

  test("stops before the first case when the akm has no `akm judge`, or its distill.lesson is of another schemaVersion", async () => {
    const none = setup([{ word: "PASS", label: "good" }], { FAKE_NOJUDGE: "1" });
    await expect(quiet(() => runCorpus(none.corpus, none.ctx, none.results))).rejects.toThrow("has no `akm judge distill.lesson`");
    expect(none.calls()).toEqual([]);
    const other = setup([{ word: "PASS", label: "good" }], { FAKE_SCHEMA: "2" });
    await expect(quiet(() => runCorpus(other.corpus, other.ctx, other.results))).rejects.toThrow("has schemaVersion 2, and this eval reads 1");
    expect(other.calls()).toEqual([]);
    expect(existsSync(other.results) ? readdirSync(other.results) : []).toEqual([]);
  });

  test("masks the model endpoint in the rows and the summary", async () => {
    const t = setup([{ word: "CRASH", label: "bad" }, { word: "LEAK", label: "bad" }]);
    await quiet(() => runCorpus(t.corpus, t.ctx, t.results));
    const dir = join(t.results, readdirSync(t.results)[0] as string);
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.find((r) => r.id === "case-1").error).toBe("akm exited 70: boom <MODEL_BASE_URL>/chat/completions");
    expect(rows.find((r) => r.id === "case-2").reason).toBe("connect to <MODEL_BASE_URL>/chat/completions failed");
    expect(readFileSync(join(dir, "samples.jsonl"), "utf8")).not.toContain("localhost:9");
  });

  test("its manifest agrees with the cases and the scoring, so scripts/rescore can read the run", async () => {
    const t = setup([{ word: "PASS", label: "good" }, { word: "REJECT", label: "bad" }]);
    await quiet(() => runCorpus(t.corpus, t.ctx, t.results));
    const dir = join(t.results, readdirSync(t.results)[0] as string);
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(summary.assets_sha256).toBe(casesSha256(t.assets));
    expect(manifestProblems(summary.manifest)).toEqual([]);
    expect(readManifest(summary).kind).toBe("manifest");
    expect(summary.manifest).toMatchObject({ eval: "lesson-judge", corpus: "public", collector: { version: MEASUREMENT.version } });
    const cases = MEASUREMENT.loadCases(t.assets.replace(/\/assets$/, ""), { corpus: "custom", corpus_folder: "assets" });
    expect(Object.keys(caseDigests(MEASUREMENT, cases))).toEqual(["case-1", "case-2"]);
  });
});
