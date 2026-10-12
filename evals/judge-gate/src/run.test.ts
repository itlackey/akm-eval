import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { commandLine, completionsUrl, createSandbox, writeConfig } from "../../../lib/akm/akm.ts";
import { caseDigests, manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { endpointHost, harnessSha256, sha256Json, withoutEngineSettings } from "../../../lib/provenance.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { casesSha256 } from "./inputs.ts";
import { type Case, type Raw, judgeConfig, parseCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { runCorpus } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const BASE_URL = "http://localhost:9/v1";

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
else if (word === "REWORDED") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: -1, reviewNeeded: true, reason: "the model's reply was not understood" }));
else if (word === "FAILCLOSED") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: -1, reason: "no engine configured — cannot judge, failing closed" }));
else if (word === "LEAK") console.log(JSON.stringify({ ok: true, engine: "judge", pass: false, score: 1.5, reason: "connect to ${BASE_URL}/chat/completions failed" }));
else if (word === "HANG") await Bun.sleep(60000);
else { console.error("boom ${BASE_URL}/chat/completions"); process.exit(70); }
`;

type Spec = { word: string; label: "good" | "bad"; feedback?: string; severity?: "churn" | "harmful" };

function setup(cases: Spec[]) {
  const root = mkdtempSync(join(tmpdir(), "judge-gate-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  const rows: Case[] = cases.map((c, i) => ({
    id: `case-${i + 1}`,
    kind: "reflect",
    set: "s",
    label: c.label,
    labelReason: "r",
    ...(c.label === "bad" ? { severity: c.severity ?? ("harmful" as const) } : {}),
    feedback: c.feedback ?? "",
    source: "source text",
    candidate: `${c.word} revised text`,
  }));
  writeFileSync(join(assets, "cases.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  const sandbox = { ...createSandbox("judge-gate-test"), cmd: ["bun", script] };
  dirs.push(sandbox.dir);
  const ctx = { sandbox, version: "0.9.99-test", model: "the-model", baseUrl: BASE_URL, label: "t" };
  return { ctx, folders: { assets, results: join(root, "results") } };
}

/** A corpus read from `assets`: the public one, or a custom one that is a rewrite (with its seed) or your own. */
type Custom = { rewrite: boolean; seed: string | null };
const corpusOf = (assets: string, custom?: Custom): ResolvedCorpus => (custom ? { name: "custom", folder: assets, ...custom, flag: "--corpus custom" } : { name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" });
const runPublic = (ctx: Parameters<typeof runCorpus>[1], folders: { assets: string; results: string }) => runCorpus(corpusOf(folders.assets), ctx, folders.results);

const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};

/** The one results folder a test made. */
const resultsOf = (folders: { results: string }) => {
  const dir = join(folders.results, readdirSync(folders.results)[0]);
  return {
    dir,
    summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")),
    rows: readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
  };
};

const repeat = (n: number, spec: Spec): Spec[] => Array.from({ length: n }, () => spec);

describe("runCorpus", () => {
  test("counts passes per label, keeps review apart from reject, counts a reply with no verdict as a review, and leaves a crash out", async () => {
    const { ctx, folders } = setup([
      { word: "PASS", label: "good" },
      { word: "REVIEW", label: "good" },
      { word: "PASS", label: "bad" },
      { word: "REJECT", label: "bad" },
      { word: "NOVERDICT", label: "bad", severity: "churn" },
      { word: "CRASH", label: "bad", severity: "churn" },
      { word: "UNREADABLE", label: "good" },
    ]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ eval: "judge-gate", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 7, n_run: 7, n_scored: 6, n_errored: 1, timeouts: 0, status: "complete", aborted_reason: null });
    expect(summary.harness_sha256).toMatch(/^[0-9a-f]{64}$/); // the digest of the eval's code and lib/, as lib/provenance.ts counts them
    expect(summary.harness_sha256).toBe(harnessSha256(import.meta.dir));
    expect(summary.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
    expect(summary.metrics.good).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    expect(summary.metrics.bad).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    expect(summary.metrics.precision).toEqual({ value: 0.5, passed_good: 1, passed: 2 });
    expect(summary.metrics.outcomes.good).toEqual({ pass: 1, review: 2, reject: 0, error: 0 });
    expect(summary.metrics.outcomes.bad).toEqual({ pass: 1, review: 1, reject: 1, error: 1 });

    const { dir, summary: stored, rows } = resultsOf(folders);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    expect(stored.results_dir).toBeUndefined();
    expect(stored.git_commit).toBeString();
    expect(rows).toHaveLength(7);
    expect(rows.find((r) => r.id === "case-6")).toMatchObject({ outcome: "error", error: expect.stringContaining("boom") });
    expect(rows.find((r) => r.id === "case-5")).toMatchObject({ outcome: "review", score: null, reason: "judge timeout/error" });
    expect(rows.find((r) => r.id === "case-5").error).toBeUndefined();
  });

  test("splits the bad revisions the judge passed by severity, in the summary and in the samples", async () => {
    const { ctx, folders } = setup([
      { word: "PASS", label: "bad", severity: "churn" },
      { word: "PASS", label: "bad", severity: "churn" },
      { word: "REJECT", label: "bad", severity: "churn" },
      { word: "PASS", label: "bad", severity: "harmful" },
      { word: "REJECT", label: "bad", severity: "harmful" },
      { word: "REVIEW", label: "bad", severity: "harmful" },
      { word: "PASS", label: "good" },
    ]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary.metrics.bad).toEqual({ n: 6, passed: 3, rate: 0.5 });
    expect(summary.metrics.bad_churn).toEqual({ n: 3, passed: 2, rate: 0.6667 });
    expect(summary.metrics.bad_harmful).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    const { summary: stored, rows } = resultsOf(folders);
    expect(stored.metrics.bad_harmful.rate).toBe(0.3333);
    expect(stored.metrics.bad_churn.rate).toBe(0.6667);
    // Two cases run at a time and each row is appended when its case finishes, so the file is in completion order. Look the rows up by id.
    const severityOf = (id: string) => rows.find((r) => r.id === id).severity;
    expect(["case-1", "case-2", "case-3", "case-4", "case-5", "case-6", "case-7"].map(severityOf)).toEqual(["churn", "churn", "churn", "harmful", "harmful", "harmful", undefined]);
  });

  test("a score of -1 routed to review is a review whatever the message says, and one routed nowhere is an error", async () => {
    const { ctx, folders } = setup([
      { word: "UNREADABLE", label: "good" },
      { word: "NOVERDICT", label: "good" },
      { word: "REWORDED", label: "good" },
      { word: "FAILCLOSED", label: "good" },
    ]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary).toMatchObject({ n_scored: 3, n_errored: 1, status: "complete" });
    expect(summary.metrics.good).toEqual({ n: 3, passed: 0, rate: 0 });
    expect(summary.metrics.outcomes.good).toEqual({ pass: 0, review: 3, reject: 0, error: 1 });
    expect(resultsOf(folders).rows.find((r) => r.id === "case-4")).toMatchObject({ outcome: "error", error: "no engine configured — cannot judge, failing closed" });
  });

  test("runs akm in the sandbox and puts negative feedback first", async () => {
    const { ctx, folders } = setup([{ word: "PASS", label: "good", feedback: "[positive] fine\n[negative] stale" }]);
    await quiet(() => runPublic(ctx, folders));
    const seen = JSON.parse(resultsOf(folders).rows[0].reason);
    expect(seen.feedback).toBe("[negative] stale\n[positive] fine");
    expect(seen.env).toBe(ctx.sandbox.env.AKM_CONFIG_DIR);
  });

  test("a limit runs a good/bad mix", async () => {
    const { ctx, folders } = setup([...repeat(4, { word: "PASS", label: "good" }), ...repeat(12, { word: "REJECT", label: "bad" })]);
    const summary = await quiet(() => runPublic({ ...ctx, limit: 4 }, folders));
    expect(summary).toMatchObject({ limit: 4, n_cases: 16, n_run: 4 });
    expect(summary.metrics.good.n).toBe(1);
    expect(summary.metrics.bad.n).toBe(3);
  });

  describe("giving up", () => {
    test("stops early when no case gets a verdict, writes the summary as aborted first, and says what to check", async () => {
      const { ctx, folders } = setup(repeat(12, { word: "CRASH", label: "bad" }));
      await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("5 cases in a row got no verdict");
      const { summary } = resultsOf(folders);
      expect(summary.n_run).toBeLessThan(12);
      expect(summary.n_scored).toBe(0);
      expect(summary.status).toBe("aborted");
      expect(summary.aborted_reason).toStartWith(`5 cases in a row got no verdict, so the run stopped after ${summary.n_run} of 12.`);
      await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("Check MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env");
    });

    test("stops on five errors in a row after the first verdict too", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }, ...repeat(10, { word: "CRASH", label: "bad" })]);
      await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("5 cases in a row got no verdict");
      const { summary, rows } = resultsOf(folders);
      expect(summary.n_run).toBeLessThan(11);
      expect(summary).toMatchObject({ status: "aborted", n_scored: 1, metrics: { good: { n: 1, passed: 1 } } });
      expect(rows.some((r) => r.outcome === "pass")).toBe(true);
    });

    test("a verdict in between starts the count again", async () => {
      const pattern: Spec[] = [];
      for (let i = 0; i < 4; i++) pattern.push({ word: "PASS", label: "good" }, ...repeat(2, { word: "CRASH", label: "bad" }));
      const { ctx, folders } = setup(pattern);
      const summary = await quiet(() => runPublic(ctx, folders));
      expect(summary).toMatchObject({ n_run: 12, n_errored: 8, status: "complete", aborted_reason: null });
    });

    test("five replies in a row that akm could not read stop the run, since the model gave no verdict either", async () => {
      const { ctx, folders } = setup(repeat(10, { word: "UNREADABLE", label: "bad" }));
      await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("Last: judge parse failed — routed to review");
      const { summary } = resultsOf(folders);
      expect(summary).toMatchObject({ status: "aborted", n_errored: 0 });
      expect(summary.metrics.bad.n).toBe(summary.n_run);
    });
  });

  test("masks the model endpoint in the error rows, in akm's reasons and in the reason for giving up", async () => {
    const { ctx, folders } = setup([{ word: "CRASH", label: "bad" }, { word: "LEAK", label: "bad" }]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(summary.n_errored).toBe(1);
    const { rows, dir } = resultsOf(folders);
    expect(rows.find((r) => r.id === "case-1").error).toBe("akm exited 70: boom <MODEL_BASE_URL>/chat/completions");
    expect(rows.find((r) => r.id === "case-2").reason).toBe("connect to <MODEL_BASE_URL>/chat/completions failed");
    expect(readFileSync(join(dir, "samples.jsonl"), "utf8")).not.toContain("localhost:9");
    expect(readFileSync(join(dir, "summary.json"), "utf8")).not.toContain("localhost:9");

    const dead = setup(repeat(8, { word: "CRASH", label: "bad" }));
    await expect(quiet(() => runPublic(dead.ctx, dead.folders))).rejects.toThrow("Last: akm exited 70: boom <MODEL_BASE_URL>/chat/completions");
    expect(readFileSync(join(resultsOf(dead.folders).dir, "summary.json"), "utf8")).not.toContain("localhost:9");
  });

  test("counts a case that akm did not answer in time as a timeout, apart from the other errors", async () => {
    const { ctx, folders } = setup([{ word: "HANG", label: "good" }, { word: "CRASH", label: "bad" }, { word: "PASS", label: "good" }]);
    const summary = await quiet(() => runPublic({ ...ctx, timeoutMs: 600 }, folders));
    expect(summary).toMatchObject({ n_errored: 2, timeouts: 1, n_scored: 1 });
    const { rows, summary: stored } = resultsOf(folders);
    expect(stored.timeouts).toBe(1);
    const hung = rows.find((r) => r.id === "case-1");
    expect(hung).toMatchObject({ outcome: "error", timed_out: true });
    expect(hung.error).toContain("timed out after 0.6s");
    expect(rows.find((r) => r.id === "case-2")).toMatchObject({ outcome: "error" });
    expect(rows.find((r) => r.id === "case-2").timed_out).toBeUndefined();
  });

  describe("what the summary records of the run's inputs", () => {
    const cfg = judgeConfig(BASE_URL, "the-model", true);

    test("the effective config, the engine's settings, the cases' digest, the strategy and no seed for the public corpus", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      writeConfig(ctx.sandbox, cfg);
      const summary = await quiet(() => runPublic(ctx, folders));
      const { summary: stored } = resultsOf(folders);
      const hidden = JSON.parse(JSON.stringify(cfg));
      hidden.engines.judge.endpoint = "<MODEL_BASE_URL>";
      expect(stored.config).toEqual(hidden);
      expect(stored.config.engines.judge).toMatchObject({ temperature: 0, enableThinking: false, apiKey: "$MODEL_API_KEY" });
      expect(stored.engine).toEqual({ engine: "judge", model: "the-model", endpoint: endpointHost("http://localhost:9/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000, engines: { judge: { model: "the-model", endpoint: endpointHost("http://localhost:9/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 } } });
      expect(stored.assets_sha256).toBe(casesSha256(folders.assets));
      expect(stored.assets_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(stored).toMatchObject({ strategy: "default", config_patch: null, seed: null, status: "complete", aborted_reason: null, timeouts: 0 });
      expect(summary.assets_sha256).toBe(stored.assets_sha256);
    });

    test("never a secret", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      writeConfig(ctx.sandbox, { ...cfg, engines: { judge: { ...cfg.engines.judge, apiKey: "sk-real-secret" } } });
      await quiet(() => runPublic(ctx, folders));
      const text = readFileSync(join(resultsOf(folders).dir, "summary.json"), "utf8");
      expect(text).not.toContain("sk-real-secret");
      expect(JSON.parse(text).config.engines.judge.apiKey).toBe("<redacted>");
    });

    test("never the model endpoint, which can hold a key in its query or credentials, but its host in engine", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      writeConfig(ctx.sandbox, judgeConfig("https://user:hunter2@secret-host.example:8443/v1?key=SECRET-KEY", "the-model", true));
      await quiet(() => runPublic(ctx, folders));
      const text = readFileSync(join(resultsOf(folders).dir, "summary.json"), "utf8");
      for (const leak of ["SECRET-KEY", "hunter2", "user:"]) expect(text).not.toContain(leak);
      const stored = JSON.parse(text);
      expect(stored.config.engines.judge.endpoint).toBe("<MODEL_BASE_URL>");
      expect(stored.engine.endpoint).toBe("https://secret-host.example:8443"); // the host and port: never the path
    });

    test("the digest changes with the cases, and a rewrite records its seed", async () => {
      const a = setup([{ word: "PASS", label: "good" }]);
      const b = setup([{ word: "REJECT", label: "good" }]);
      const rewrite = corpusOf(a.folders.assets, { rewrite: true, seed: "12345678901234567890" });
      const one = await quiet(() => runCorpus(rewrite, a.ctx, a.folders.results));
      const two = await quiet(() => runPublic(b.ctx, b.folders));
      expect(one.assets_sha256).not.toBe(two.assets_sha256);
      expect(one).toMatchObject({ corpus: "custom", seed: "12345678901234567890" });
      expect(one.manifest).toMatchObject({ corpus: "custom", settings: { seed: "12345678901234567890" } });
      expect(two).toMatchObject({ corpus: "public", seed: null });
    });

    test("your own cases are recorded as a custom corpus, and the folder is not recorded when it is outside the repository", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      const own = await quiet(() => runCorpus(corpusOf(folders.assets, { rewrite: false, seed: null }), ctx, folders.results));
      expect(own).toMatchObject({ corpus: "custom", seed: null, corpus_folder: null });
      expect(JSON.stringify(resultsOf(folders).summary)).not.toContain(folders.assets);
    });

    test("a custom corpus inside the repository records its folder from the repository root, written with /, and the public corpus records none", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      const inside = mkdtempSync(join(import.meta.dir, "..", ".custom-run-"));
      dirs.push(inside);
      cpSync(folders.assets, join(inside, "assets"), { recursive: true });
      const own = await quiet(() => runCorpus(corpusOf(join(inside, "assets"), { rewrite: false, seed: null }), ctx, folders.results));
      expect(own.corpus_folder).toBe(`evals/judge-gate/${basename(inside)}/assets`);
      expect(JSON.stringify(own)).not.toContain(inside); // never an absolute path
      expect((await quiet(() => runPublic({ ...ctx, label: "public" }, folders))).corpus_folder).toBeNull();
    });

    test("the version of the rubric the labels follow, from the public assets README, for either corpus and for a run that gave up", async () => {
      const readme = readFileSync(join(import.meta.dir, "..", "assets", "README.md"), "utf8");
      const version = Number(/^rubric_version: (\d+)$/m.exec(readme)?.[1]);
      expect(version).toBe(2);
      const pub = setup([{ word: "PASS", label: "good" }]);
      expect((await quiet(() => runPublic(pub.ctx, pub.folders))).rubric_version).toBe(version);
      expect(resultsOf(pub.folders).summary.rubric_version).toBe(version);
      const priv = setup([{ word: "PASS", label: "good" }]);
      expect((await quiet(() => runCorpus(corpusOf(priv.folders.assets, { rewrite: true, seed: "7" }), priv.ctx, priv.folders.results))).rubric_version).toBe(version);
      const dead = setup(repeat(8, { word: "CRASH", label: "bad" }));
      await expect(quiet(() => runPublic(dead.ctx, dead.folders))).rejects.toThrow("5 cases in a row got no verdict");
      expect(resultsOf(dead.folders).summary).toMatchObject({ status: "aborted", rubric_version: version });
    });

    test("the strategy and the config patch of the overrides", async () => {
      const { ctx, folders } = setup([{ word: "PASS", label: "good" }]);
      const configPatch = { path: "patches/tight.json", sha256: "ab".repeat(32), patch: { defaults: { improveStrategy: "tight" } } };
      await quiet(() => runPublic({ ...ctx, overrides: { strategy: "tight", configPatch } }, folders));
      expect(resultsOf(folders).summary).toMatchObject({ strategy: "tight", config_patch: { path: "patches/tight.json", sha256: "ab".repeat(32) } });
    });
  });
});

describe("the manifest of a run", () => {
  const specs: Spec[] = [
    { word: "PASS", label: "good" },
    { word: "REVIEW", label: "good" },
    { word: "REJECT", label: "bad" },
    { word: "NOVERDICT", label: "bad", severity: "churn" },
    { word: "FAILCLOSED", label: "bad" },
    { word: "CRASH", label: "bad" },
  ];

  test("is sound, names the parts the lock gives, and holds the digest of every selected case and what was scored", async () => {
    const { ctx, folders } = setup(specs);
    writeConfig(ctx.sandbox, judgeConfig(BASE_URL, "the-model", true));
    await quiet(() => runPublic(ctx, folders));
    const { summary: stored } = resultsOf(folders);
    const { manifest } = stored;
    expect(manifestProblems(manifest)).toEqual([]);
    expect(readManifest(stored).kind).toBe("manifest");
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(manifest).toMatchObject({ manifest_version: 1, eval: "judge-gate", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, treatment_hints: {} });
    expect(manifest.akm).toEqual({ version: "0.9.99-test", bin: stored.akm_bin, build: null, build_fingerprint: null });
    expect(manifest.settings).toEqual({ strategy: "default", config_patch_sha256: null, timeout_ms: null, seed: null });
    const loaded = parseCases(readFileSync(join(folders.assets, "cases.jsonl"), "utf8"));
    expect(Object.keys(manifest.cases)).toEqual(loaded.map((c) => c.id));
    expect(manifest.cases).toEqual(caseDigests(MEASUREMENT, loaded));
    const ids = loaded.map((c) => c.id);
    expect(manifest.completion).toEqual({ selected: ids, scored: ids.filter((id) => id !== "case-5" && id !== "case-6"), errored: ["case-5", "case-6"] });
    // the config without the engine's settings, and the engine with the digest of its endpoint
    expect(manifest.config.sha256).toBe(sha256Json(withoutEngineSettings(stored.config)));
    expect(JSON.stringify(manifest.config.redacted)).not.toContain("localhost");
    expect(manifest.engines).toEqual(stored.engine.engines);
    expect(manifest.engines.judge).toEqual({ model: "the-model", endpoint: endpointHost("http://localhost:9/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 });
  });

  test("stores in every row the raw output the scorer reads: scored again from the row, a case gives the row it stored", async () => {
    const mixed: Spec[] = [{ word: "PASS", label: "good" }, { word: "REVIEW", label: "good" }, { word: "REJECT", label: "bad" }, { word: "NOVERDICT", label: "bad", severity: "churn" }, { word: "PASS", label: "good" }, { word: "FAILCLOSED", label: "bad" }, { word: "REVIEW", label: "good" }, { word: "CRASH", label: "bad" }, { word: "REJECT", label: "bad" }, { word: "HANG", label: "good" }, { word: "PASS", label: "good" }, { word: "UNREADABLE", label: "good" }];
    const { ctx, folders } = setup(mixed);
    await quiet(() => runPublic({ ...ctx, timeoutMs: 600 }, folders));
    const { rows } = resultsOf(folders);
    const byId = new Map(parseCases(readFileSync(join(folders.assets, "cases.jsonl"), "utf8")).map((c) => [c.id, c]));
    expect(rows.map((r) => r.outcome).sort()).toEqual(["error", "error", "error", "pass", "pass", "pass", "reject", "reject", "review", "review", "review", "review"]);
    expect(rows.some((r) => r.timed_out === true)).toBe(true);
    for (const row of rows) {
      const read = MEASUREMENT.rawOf(row);
      expect({ id: row.id, missing: "missing" in read ? read.missing : [] }).toEqual({ id: row.id, missing: [] });
      expect(MEASUREMENT.score(byId.get(row.id) as Case, (read as { raw: Raw }).raw)).toEqual(row);
    }
    // what akm printed is in the row, as the scorer read it, with the endpoint masked and only the fields it reads
    expect(rows.find((r) => r.id === "case-2").verdict).toEqual({ pass: false, score: 3, reviewNeeded: true, reason: "needs a person", engine: "judge" });
    expect(rows.find((r) => r.id === "case-4").verdict).toEqual({ pass: false, score: -1, reviewNeeded: true, reason: "judge timeout/error", engine: "judge" });
    expect(rows.find((r) => r.id === "case-8")).not.toHaveProperty("verdict"); // akm printed none
  });

  test("a run that stops early keeps every selected case in the manifest, with those it never ran in neither list", async () => {
    const dead = setup(repeat(8, { word: "CRASH", label: "bad" }));
    await expect(quiet(() => runPublic(dead.ctx, dead.folders))).rejects.toThrow("5 cases in a row got no verdict");
    const { manifest, n_run } = resultsOf(dead.folders).summary;
    expect(manifestProblems(manifest)).toEqual([]);
    expect(manifest.completion.selected).toHaveLength(8);
    expect(manifest.completion.scored).toEqual([]);
    expect(manifest.completion.errored).toHaveLength(n_run);
    expect(n_run).toBeLessThan(8);
  });
});

describe("the command", () => {
  // Bun loads the .env of its working folder, and the repository's holds the model settings. So the command runs in a folder of its own
  // and with an akm that does not exist, and never reaches a model, whatever .env says.
  const run = (args: string[], env: Record<string, string> = {}) => {
    const { MODEL_BASE_URL: _u, MODEL_NAME: _m, AKM_BIN: _a, ...rest } = process.env;
    const cwd = mkdtempSync(join(tmpdir(), "judge-gate-cmd-"));
    dirs.push(cwd);
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { cwd, env: { ...rest, AKM_BIN: "no-such-akm-in-this-test", ...env }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };
  const model = { MODEL_BASE_URL: "http://localhost:1/v1", MODEL_NAME: "the-model" };

  test("a folder of your own cases that has none is missing, and the run stops before it asks for akm", () => {
    const notes = mkdtempSync(join(tmpdir(), "judge-gate-notes-"));
    dirs.push(notes);
    const done = run(["--cases", notes], model);
    expect(done.code).toBe(2);
    expect(done.err).toContain("the custom corpus is missing");
    expect(done.err).not.toContain("no-such-akm-in-this-test"); // the akm was never asked for
  });

  test("--corpus private, own and own-feedback were renamed: the run stops before it reaches akm", () => {
    for (const old of ["private", "own", "own-feedback"]) {
      const done = run(["--corpus", old], model);
      expect(done.code, old).toBe(2);
      expect(done.err, old).toContain(`judge-gate: --corpus ${old} was renamed in 0.2: use `);
      expect(done.err, old).not.toContain("no-such-akm-in-this-test");
    }
  });

  test("--corpus takes public, custom or all, and refuses another value", () => {
    expect(run(["--corpus", "everything"], model).err).toContain('--corpus must be public, custom or all, not "everything"');
    expect(run(["--help"]).out).toContain("[--corpus public|custom|all] [--cases DIR]");
  });

  test("refuses an akm older than the one it was built on", () => {
    const root = mkdtempSync(join(tmpdir(), "judge-gate-cmd-"));
    dirs.push(root);
    writeFileSync(join(root, "old-akm.ts"), 'console.log("akm 0.9.24");');
    const done = run([], { ...model, AKM_BIN: commandLine(["bun", join(root, "old-akm.ts")]) });
    expect(done.code).toBe(2);
    expect(done.err).toContain("akm 0.9.24 has no `improve judge` command. This eval needs akm 0.9.25-alpha.2 or later.");
  });
});

describe("the usage text", () => {
  test("names the flags and says what the private corpus is", () => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), "--help"], { stdout: "pipe", stderr: "pipe" });
    const text = done.stdout.toString();
    expect(done.exitCode).toBe(0);
    expect(text).toContain("[--strategy NAME] [--config-patch FILE]");
    expect(text).toContain("--strategy      the akm improve strategy to run in place of default");
    expect(text).toContain("--config-patch  FILE");
    expect(text).toContain("not held-out data");
  });
});
