// The tests of what lib/run.ts lets a spec say that not every spec has to: the mode and the eval settings of its manifest (`manifestExtras`), the results folder in
// its context (`ctx.resultsDir`), the label of a run without --label (`defaultLabel`), and a spec that runs its own cases (`collectAll`), whose summary has no
// `concurrency`. A fake eval (FIXTURE) runs through runEval in a process of its own, in a copy of lib/ in a temp folder so that its results are there and never in the
// repository, against a fake akm that logs what it is asked. The model endpoint is not asked (AKM_EVAL_NO_PROBE=1): the request to it is lib/run.test.ts's, with the rest
// of the driver.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { commandLine } from "./akm/akm.ts";
import { manifestProblems, readManifest } from "./manifest.ts";

/** An akm that answers `--version`, and `case ID`, which it says ok to. It logs every call to FAKE_LOG. */
const FAKE_AKM = `
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "--version") console.log("akm 0.9.99-test");
else if (args[0] === "case") console.log(JSON.stringify({ ok: true }));
else { console.error("unexpected " + args.join(" ")); process.exit(1); }
`;

/**
 * An eval that is only a spec: one akm call per case, every one ok. Its own flag is --note, which its setup puts in the context. The hooks of this file are switched on by the
 * environment: FAKE_MANIFEST (`both`, `mode` or `hints`: what manifestExtras gives, and with a mode the summary says the same mode), FAKE_DEFAULT_LABEL (a defaultLabel that
 * is not the model name as a slug), FAKE_RESULTS_DIR (an openRun, and what openRun, collectAll and each case of the pool were given as the results folder, logged to
 * FAKE_HOOK_LOG; collectAll writes a file of its own there) and FAKE_BATCH (the cases run in collectAll, and the spec has no runCase).
 */
const FIXTURE = `
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createSandbox, engineConfig, removeSandbox, runAkmJson } from "./lib/akm/akm.ts";
import { patchedConfig } from "./lib/akm/overrides.ts";
import { runEval } from "./lib/run.ts";

const count = (rows, test) => rows.filter(test).length;
const watching = process.env.FAKE_RESULTS_DIR === "1";
// What a hook was given as the results folder: where, whether it is there, and what it holds.
const seen = (hook, ctx) => {
  const dir = ctx.resultsDir;
  appendFileSync(process.env.FAKE_HOOK_LOG, JSON.stringify({ hook, resultsDir: dir ?? null, exists: dir ? existsSync(dir) : false, files: dir && existsSync(dir) ? readdirSync(dir).sort() : [] }) + "\\n");
};

async function one(c, ctx) {
  const sandbox = createSandbox("fake");
  try {
    await runAkmJson(sandbox, ["case", c.id], { timeoutMs: ctx.timeoutMs });
    return { id: c.id, outcome: "ok", seconds: 0 };
  } finally {
    removeSandbox(sandbox);
  }
}

const spec = {
  measurement: {
    eval: "fake",
    version: "0.1",
    caseId: (c) => c.id,
    input: (c) => ({ id: c.id }),
    labels: (c) => ({ id: c.id }),
    errored: (r) => r.outcome === "error",
    summarize: (rows) => ({ n_run: rows.length, n_scored: count(rows, (r) => r.outcome !== "error"), n_errored: count(rows, (r) => r.outcome === "error"), timeouts: 0, metrics: { ok: count(rows, (r) => r.outcome === "ok") } }),
  },
  dir: join(import.meta.dir, "evals", "fake"),
  strategy: "fake-only",
  defaultTimeoutMs: 900000,
  loadCases: (folder) => readFileSync(join(folder, "cases.jsonl"), "utf8").split("\\n").filter((l) => l.trim()).map((line) => JSON.parse(line)),
  selectCases: (all, limit) => (limit === undefined ? all : all.slice(0, limit)),
  assetsSha256: (folder) => createHash("sha256").update(readFileSync(join(folder, "cases.jsonl"))).digest("hex"),
  configFor: (ctx) => patchedConfig(engineConfig(ctx.baseUrl, ctx.model, ctx.hasKey, "fake", ctx.provider), ctx.overrides),
  runCase: async (c, ctx) => {
    if (watching) seen("runCase", ctx);
    return one(c, ctx);
  },
  progress: (c, row) => c.id + " " + row.outcome,
  prepare: (values) => () => ({ note: values.note }),
  printSummary: (s) => console.log("fake " + s.corpus + ": " + s.n_run + " of " + s.n_cases + " cases"),
  options: { note: { type: "string" } },
  usage: { about: "Runs the fake eval.", limit: "run the first N cases.", flags: "[--note TEXT]", extra: "  --note    a note for every case." },
};
if (watching) spec.openRun = async (ctx) => { seen("openRun", ctx); return {}; };
if (process.env.FAKE_BATCH === "1") {
  delete spec.runCase; // the spec has none: collectAll runs the cases
  spec.collectAll = async (cases, ctx, record) => {
    if (watching) {
      seen("collectAll", ctx);
      writeFileSync(join(ctx.resultsDir, "batch.json"), JSON.stringify({ cases: cases.map((c) => c.id) }));
    }
    const rows = [];
    for (const c of cases) {
      const row = await one(c, ctx);
      rows.push(row);
      record(row);
    }
    return { rows };
  };
}
const EXTRAS = {
  both: (ctx, corpus) => ({ mode: "pool", eval_settings: { embedder: ctx.note ?? "deterministic", attempts: 2, strict: true, seed: null, corpus: corpus.name } }),
  mode: () => ({ mode: "pool" }),
  hints: (ctx) => ({ eval_settings: { embedder: ctx.note ?? "real" } }),
};
if (process.env.FAKE_MANIFEST) {
  spec.manifestExtras = EXTRAS[process.env.FAKE_MANIFEST];
  if (process.env.FAKE_MANIFEST !== "hints") spec.summaryExtras = () => ({ mode: "pool" }); // the summary says its mode as consolidate --pool's does, and readManifest wants the manifest to say the same
}
if (process.env.FAKE_DEFAULT_LABEL === "1") spec.defaultLabel = (model) => model.replace(/[^A-Za-z0-9]+/g, "_") + "-hooked";
await runEval(spec);
`;

setDefaultTimeout(60_000); // every test starts processes

let tree: string;
let runs = 0;
beforeAll(() => {
  tree = mkdtempSync(join(tmpdir(), "run hooks tree-")); // a space in the name, so that a path that is not quoted somewhere fails here
  cpSync(import.meta.dir, join(tree, "lib"), { recursive: true, filter: (path) => !path.endsWith(".test.ts") });
  writeFileSync(join(tree, "fixture.ts"), FIXTURE);
  writeFileSync(join(tree, "fake-akm.ts"), FAKE_AKM);
  mkdirSync(join(tree, "evals", "fake", "assets"), { recursive: true });
});
afterAll(() => {
  rmSync(tree, { recursive: true, force: true });
});

const lines = (n: number): string => `${Array.from({ length: n }, (_, i) => JSON.stringify({ id: `c${i}` })).join("\n")}\n`;

/** Puts N cases in place as the public corpus. */
const setCases = (n: number): void => writeFileSync(join(tree, "evals", "fake", "assets", "cases.jsonl"), lines(n));

/** A folder of the tree with N cases in it, for --cases: the custom corpus of a run. */
function folderOf(name: string, n: number): string {
  mkdirSync(join(tree, name), { recursive: true });
  writeFileSync(join(tree, name, "cases.jsonl"), lines(n));
  return join(tree, name);
}

/** The lines of a log that hold JSON. */
const read = (file: string): any[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

/** The fake eval run with `args` in a process of its own, to its end: what it printed, what the hooks logged and what akm was asked. */
function run(args: string[], env: Record<string, string> = {}) {
  const n = ++runs;
  const [akm, hooks] = [join(tree, `akm-${n}.log`), join(tree, `hooks-${n}.log`)];
  const base = { ...process.env, MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "the-model", MODEL_API_KEY: "", MODEL_PROVIDER: "", AKM_EVAL_NO_PROBE: "1", AKM_BIN: commandLine(["bun", join(tree, "fake-akm.ts")]), FAKE_LOG: akm, FAKE_HOOK_LOG: hooks }; // nothing listens on port 9, and the run is not to ask it
  const p = Bun.spawnSync(["bun", join(tree, "fixture.ts"), ...args], { cwd: tree, env: { ...base, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString(), akm: read(akm) as string[][], hooks: read(hooks) as { hook: string; resultsDir: string | null; exists: boolean; files: string[] }[] };
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The results folders a label made, in either results folder. */
const foldersOf = (label: string): string[] =>
  ["evals/fake/results", "private/fake/results"]
    .flatMap((parent) => (existsSync(join(tree, parent)) ? readdirSync(join(tree, parent)).filter((name) => new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escaped(label)}(-r\\d+)?$`).test(name)).map((name) => join(tree, parent, name)) : []))
    .sort();

/** The folders a label made, with their summary.json and samples.jsonl: for a run that has ended. */
const resultsOf = (label: string) =>
  foldersOf(label).map((folder) => ({ folder, summary: JSON.parse(readFileSync(join(folder, "summary.json"), "utf8")), rows: read(join(folder, "samples.jsonl")) }));

/** What is in a results folder besides the marker of a run that is going on. */
const filesIn = (folder: string): string[] => readdirSync(folder).filter((name) => name !== ".running").sort();

const day = (): string => new Date().toISOString().slice(0, 10);

describe("manifestExtras", () => {
  test("a hook that gives a mode and hints puts both in the manifest, one that gives only one leaves the other as it is without a hook, and a spec with no hook has neither", () => {
    setCases(1);
    const manifestOf = (label: string, env: Record<string, string>) => {
      const r = run(["--label", label], env);
      expect([label, r.code, r.err]).toEqual([label, 0, ""]);
      return resultsOf(label)[0]?.summary.manifest;
    };
    const both = manifestOf("extras-both", { FAKE_MANIFEST: "both" });
    expect([both.mode, both.eval_settings]).toEqual(["pool", { embedder: "deterministic", attempts: 2, strict: true, seed: null, corpus: "public" }]); // a string, a number, a boolean and a null arrive as they are
    const mode = manifestOf("extras-mode", { FAKE_MANIFEST: "mode" });
    expect([mode.mode, mode.eval_settings]).toEqual(["pool", {}]);
    const hints = manifestOf("extras-hints", { FAKE_MANIFEST: "hints" });
    expect([hints.mode, hints.eval_settings]).toEqual([null, { embedder: "real" }]);
    const none = manifestOf("extras-none", {});
    expect([none.mode, none.eval_settings]).toEqual([null, {}]);
  });

  test("the hook is given the context, with what the eval's own setup put in it, and the corpus, for each run of each corpus; the manifest is sound and agrees with the summary on the mode", () => {
    setCases(2);
    const r = run(["--corpus", "all", "--cases", folderOf("extras-own", 2), "--repeat", "2", "--note", "the-note", "--label", "extras-runs"], { FAKE_MANIFEST: "both" });
    expect([r.code, r.err]).toEqual([0, ""]);
    const done = resultsOf("extras-runs");
    expect(done.map((d) => [d.summary.corpus, d.summary.label, d.summary.manifest.eval_settings])).toEqual([
      ["public", "extras-runs-r1", { embedder: "the-note", attempts: 2, strict: true, seed: null, corpus: "public" }],
      ["public", "extras-runs-r2", { embedder: "the-note", attempts: 2, strict: true, seed: null, corpus: "public" }],
      ["custom", "extras-runs-r1", { embedder: "the-note", attempts: 2, strict: true, seed: null, corpus: "custom" }],
      ["custom", "extras-runs-r2", { embedder: "the-note", attempts: 2, strict: true, seed: null, corpus: "custom" }],
    ]);
    for (const { summary } of done) {
      expect(summary.mode).toBe("pool");
      expect(manifestProblems(summary.manifest)).toEqual([]);
      expect(readManifest(summary).kind).toBe("manifest"); // it is "invalid" when the summary says a mode that the manifest does not
    }
  });
});

describe("ctx.resultsDir", () => {
  test("is the results folder of the run in openRun and in collectAll, which is there before either, and what collectAll writes there lands beside samples.jsonl and summary.json", () => {
    setCases(3);
    const r = run(["--label", "dir-batch"], { FAKE_RESULTS_DIR: "1", FAKE_BATCH: "1" });
    expect([r.code, r.err]).toEqual([0, ""]);
    const [folder] = foldersOf("dir-batch") as [string];
    expect(basename(folder)).toBe(`${day()}-dir-batch`);
    expect(r.hooks.map((h) => h.hook)).toEqual(["openRun", "collectAll"]);
    for (const h of r.hooks) {
      expect([h.hook, h.exists]).toEqual([h.hook, true]);
      expect(realpathSync(h.resultsDir as string)).toBe(realpathSync(folder));
    }
    expect(r.hooks[0]?.files).toContain("samples.jsonl"); // the run opens samples.jsonl before it opens anything of the spec's
    expect(filesIn(folder)).toEqual(["batch.json", "samples.jsonl", "summary.json"]);
    expect(JSON.parse(readFileSync(join(folder, "batch.json"), "utf8"))).toEqual({ cases: ["c0", "c1", "c2"] });
    expect(r.akm.filter((a) => a[0] === "case")).toHaveLength(3); // collectAll ran the cases, with no runCase to run them
  });

  test("is given to the cases that the pool runs, too, and to openRun before the first of them", () => {
    setCases(3);
    const r = run(["--label", "dir-pool"], { FAKE_RESULTS_DIR: "1" });
    expect([r.code, r.err]).toEqual([0, ""]);
    const [folder] = foldersOf("dir-pool") as [string];
    expect(r.hooks.map((h) => h.hook)).toEqual(["openRun", "runCase", "runCase", "runCase"]);
    for (const h of r.hooks) expect(realpathSync(h.resultsDir as string)).toBe(realpathSync(folder));
    expect(filesIn(folder)).toEqual(["samples.jsonl", "summary.json"]);
  });

  test("is the folder of each run of several corpora and repeats, and not that of the first", () => {
    setCases(2);
    const r = run(["--corpus", "all", "--cases", folderOf("dir-own", 2), "--repeat", "2", "--label", "dir-runs"], { FAKE_RESULTS_DIR: "1", FAKE_BATCH: "1" });
    expect([r.code, r.err]).toEqual([0, ""]);
    const folders = foldersOf("dir-runs").map((f) => realpathSync(f));
    expect(folders).toHaveLength(4); // public and custom, twice each
    expect(new Set(folders).size).toBe(4);
    expect(r.hooks.map((h) => [h.hook, realpathSync(h.resultsDir as string)])).toEqual(folders.flatMap((f) => [["openRun", f], ["collectAll", f]])); // the runs are in order: public twice, custom twice
  });
});

describe("defaultLabel", () => {
  const hooked = { FAKE_DEFAULT_LABEL: "1" };

  test("names the results folder of a run without --label, from the model name as it was given, and the summary says it", () => {
    setCases(1);
    const r = run(["--model", "Org/My Model.v2"], hooked);
    expect([r.code, r.err]).toEqual([0, ""]);
    const done = resultsOf("Org_My_Model_v2-hooked");
    expect(done.map((d) => basename(d.folder))).toEqual([`${day()}-Org_My_Model_v2-hooked`]);
    expect(done[0]?.summary).toMatchObject({ label: "Org_My_Model_v2-hooked", model: "Org/My Model.v2" });
    expect(run(["--model", "Org/My Model.v2"]).code).toBe(0); // a spec without the hook names it for the model as a slug
    expect(foldersOf("org-my-model-v2")).toHaveLength(1);
  });

  test("gives way to --label, which names the folder as it always did", () => {
    setCases(1);
    const r = run(["--model", "Label Model", "--label", "mine"], hooked);
    expect([r.code, r.err]).toEqual([0, ""]);
    expect(resultsOf("mine").map((d) => [basename(d.folder), d.summary.label])).toEqual([[`${day()}-mine`, "mine"]]);
    expect(foldersOf("Label_Model-hooked")).toEqual([]); // the hook's name made no folder
  });

  test("is the label that --repeat numbers: <label>-r1 to <label>-rN, with the spread beside them", () => {
    setCases(1);
    const r = run(["--model", "Repeat Model", "--repeat", "2"], hooked);
    expect([r.code, r.err]).toEqual([0, ""]);
    expect(foldersOf("Repeat_Model-hooked").map((f) => basename(f))).toEqual([`${day()}-Repeat_Model-hooked-r1`, `${day()}-Repeat_Model-hooked-r2`]);
    expect(readdirSync(join(tree, "evals", "fake", "results")).filter((name) => name === `${day()}-Repeat_Model-hooked-repeat-summary.json`)).toHaveLength(1);
  });
});

describe("a spec that runs its own cases", () => {
  test("has no concurrency in its summary, and no other key less than the same eval that uses the pool; it takes no --concurrency", () => {
    setCases(3);
    const batch = run(["--label", "no-concurrency"], { FAKE_BATCH: "1" });
    expect([batch.code, batch.err]).toEqual([0, ""]);
    const pooled = run(["--label", "concurrency", "--concurrency", "2"]);
    expect([pooled.code, pooled.err]).toEqual([0, ""]);
    const [a, b] = [resultsOf("no-concurrency")[0], resultsOf("concurrency")[0]];
    expect(a?.rows.map((row) => row.id)).toEqual(["c0", "c1", "c2"]);
    expect(a?.summary).not.toHaveProperty("concurrency");
    expect(a?.summary).toMatchObject({ timeout_ms: 900_000, n_cases: 3, n_run: 3, n_scored: 3, status: "complete" });
    expect(b?.summary.concurrency).toBe(2); // the pool records how many cases it ran at once
    expect(Object.keys(a?.summary).sort()).toEqual(Object.keys(b?.summary).filter((key) => key !== "concurrency").sort());
    const refused = run(["--label", "refused", "--concurrency", "2"], { FAKE_BATCH: "1" });
    expect([refused.code, refused.err]).toEqual([2, expect.stringContaining("Unknown option '--concurrency'")]);
  });
});
