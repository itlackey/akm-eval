import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { comparePair } from "../../../scripts/compare/src/lib.ts";
import { endpointHost, redactConfig, sha256Json } from "../../../lib/provenance.ts";
import { assetsSha256, bundleFiles, distillConfig, loadCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { defaultResults, runCorpus } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * An akm that does what the case's fake.json says (a case with none, such as those of the public set, is skipped by distill). `improve` prints a
 * result with one distill action and keeps the proposal, if any, for `proposal list`; `index` and `feedback` say ok, and `feedbackSleep` and
 * `listSleep` make a feedback and a queue read slow. Every call is logged to $FAKE_LOG with the environment it saw.
 */
const FAKE_AKM = `
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const env = process.env;
const log = (o) => appendFileSync(env.FAKE_LOG, JSON.stringify(o) + "\\n");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (args[0] === "--version") { console.log("0.9.99-test"); process.exit(0); }
const bundle = env.AKM_BUNDLE_DIR, state = env.AKM_STATE_DIR;
const seen = { args, bundle, leak: env.AKM_LEAK ?? null, judgeKey: env.JUDGE_API_KEY ?? null, modelKey: env.MODEL_API_KEY ?? null, cwd: process.cwd() };
const fakeFile = join(bundle, "fake.json");
const fake = existsSync(fakeFile) ? JSON.parse(readFileSync(fakeFile, "utf8")) : { result: { outcome: "skipped", skipReason: "nothing_reusable" } };
if (args[0] === "index") { log(seen); console.log(JSON.stringify({ ok: true })); process.exit(0); }
if (args[0] === "feedback") { log(seen); if (fake.feedbackSleep) await wait(fake.feedbackSleep); console.log(JSON.stringify({ ok: true })); process.exit(0); }
if (args[0] === "improve") {
  const config = JSON.parse(readFileSync(join(env.AKM_CONFIG_DIR, "config.json"), "utf8"));
  log({ ...seen, files: readdirSync(bundle, { recursive: true }).map(String).sort(), strategy: Object.keys(config.improve.strategies), engine: config.engines.model.model, config });
  if (fake.sleep) await wait(fake.sleep);
  if (fake.exit) { console.error(JSON.stringify({ ok: false, error: fake.error, code: "FAKE" })); process.exit(fake.exit); }
  if (fake.stdout !== undefined) { console.log(fake.stdout); process.exit(0); }
  if (fake.proposal) writeFileSync(join(state, "proposals.json"), JSON.stringify([fake.proposal]));
  const usageReport = fake.served ? { usageReport: { byProcessEngineModel: fake.served.map((model) => ({ process: "distill", engine: "model", model, calls: 1 })) } } : {};
  console.log(JSON.stringify({ ok: true, ...usageReport, actions: [{ mode: "reflect-skipped", result: { ok: true, reason: "process-disabled" } }, { mode: "distill", result: fake.result }] }));
  process.exit(0);
}
if (args[0] === "proposal" && args[1] === "list") {
  log(seen);
  if (fake.listSleep) await wait(fake.listSleep);
  const status = args[args.indexOf("--status") + 1];
  const file = join(state, "proposals.json");
  const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const proposals = all.filter((p) => (p.fakeStatus ?? "pending") === status);
  console.log(JSON.stringify({ totalCount: proposals.length, proposals }));
  process.exit(0);
}
console.error("unexpected " + args.join(" "));
process.exit(1);
`;

const memory = (text: string) => `---\ndescription: d\n---\n${text}\n`;
const lessonFile = (description: string) => `---\ndescription: ${JSON.stringify(description)}\nwhen_to_use: When it happens.\ntype: lesson\nxrefs:\n  - memories/m\n---\n`;
const proposal = (description: string, extra: Record<string, unknown> = {}) => ({
  id: "p1",
  ref: "bundle//lessons/memory-m-lesson",
  source: "distill",
  status: "pending",
  gateDecision: { outcome: "deferred", reason: "distill-review", scores: { novelty: 4, nonRedundancy: 4, grounding: 5 }, judgeReason: "ok" },
  payload: { content: lessonFile(description) },
  ...extra,
});

interface Scenario {
  id: string;
  class: string;
  fake: Record<string, unknown>;
  /** The feedback the case carries, which the eval records before it runs distill. */
  feedback?: { signal: string; reason?: string }[];
}

const GOOD = "The default is 30, so pass --limit 200.";
const BAD = "Every command is capped, so use --limit 1000.";
const LESSON = { required: [["30"], ["--limit"]], forbidden: [["every command"]], good: GOOD, bad: BAD };

const OLD = "The default is 30.";
const UPDATE = { existing: "old", required: [["60 s"]], forbidden: [["every command"]], good: `${OLD}\nThe ceiling is 60 s.`, bad: `${OLD}\nThe ceiling is 60 s for every command.` };
const updateProposal = (body: string, extra: Record<string, unknown> = {}) => ({
  ...proposal("x", extra),
  ref: "bundle//lessons/old",
  gateDecision: { outcome: "deferred", reason: "distill-update", scores: { novelty: 4, nonRedundancy: 4, grounding: 5 }, judgeReason: "adds a limit" },
  payload: { content: `---\ndescription: d\nwhen_to_use: w\ntype: lesson\n---\n${body}\n` },
});

/** An assets folder: one case per scenario, with its memory and the fake.json that tells the fake akm what to do. */
function assetsFor(scenarios: Scenario[]): { assets: string; results: string } {
  const root = mkdtempSync(join(tmpdir(), "distill-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  const cases = scenarios.map((s) => {
    const expectsLesson = s.class === "lesson-worthy" || s.class === "over-claim";
    const expectsUpdate = s.class === "lesson-update";
    mkdirSync(join(assets, "bundles", s.id, "memories"), { recursive: true });
    if (expectsUpdate) {
      mkdirSync(join(assets, "bundles", s.id, "lessons"), { recursive: true });
      writeFileSync(join(assets, "bundles", s.id, "lessons", "old.md"), `---\ndescription: d\nwhen_to_use: w\ntype: lesson\n---\n${OLD}\n`);
    }
    writeFileSync(join(assets, "bundles", s.id, "memories", "m.md"), memory(`The memory of ${s.id}, with enough words in it to compare. ${"More words. ".repeat(10)}`));
    writeFileSync(join(assets, "bundles", s.id, "fake.json"), JSON.stringify(s.fake));
    return { id: s.id, class: s.class, expect: expectsLesson ? "lesson" : expectsUpdate ? "update" : "none", ...(expectsLesson ? LESSON : {}), ...(expectsUpdate ? UPDATE : {}), ...(s.feedback ? { feedback: s.feedback } : {}), note: "n" };
  });
  writeFileSync(join(assets, "cases.json"), JSON.stringify(cases));
  return { assets, results: join(root, "results") };
}

/** The corpus an assets folder holds: the public one, or a custom one that is a rewrite (with its seed) or your own. */
type Custom = { rewrite: boolean; seed: string | null };
const corpusOf = (assets: string, custom?: Custom): ResolvedCorpus =>
  custom === undefined
    ? { name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" }
    : { name: "custom", folder: assets, ...custom, flag: "--corpus custom" };
/** runCorpus on an assets folder as made by assetsFor. */
const runFolders = (c: Parameters<typeof runCorpus>[1], folders: { assets: string; results: string }, custom?: Custom) => runCorpus(corpusOf(folders.assets, custom), c, folders.results);

const ctx = { baseUrl: "http://localhost:8080/v1", model: "the-model", hasKey: false, version: "0.9.99-test", label: "t" };
const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};

let saved: Record<string, string | undefined> = {};
let fakeRoot: string;
let log: string;
beforeAll(() => {
  const root = (fakeRoot = mkdtempSync(join(tmpdir(), "distill-fake-")));
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  log = join(root, "calls.jsonl");
  saved = { AKM_BIN: process.env.AKM_BIN, FAKE_LOG: process.env.FAKE_LOG, AKM_LEAK: process.env.AKM_LEAK, JUDGE_API_KEY: process.env.JUDGE_API_KEY, MODEL_API_KEY: process.env.MODEL_API_KEY };
  process.env.AKM_BIN = commandLine(["bun", script]);
  process.env.FAKE_LOG = log;
  process.env.AKM_LEAK = "the caller's bundle";
  process.env.JUDGE_API_KEY = "judge-secret";
  process.env.MODEL_API_KEY = "model-secret";
});
afterAll(() => {
  rmSync(fakeRoot, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/**
 * The keys of the summary.json that distill wrote before it was a spec of lib/run.ts: its Summary interface in the committed run.ts (0d89604), without
 * results_dir, which is returned and not written. scripts/ledger, scripts/compare and scripts/rescore read them, so none may go. A run adds
 * concurrency and timeout_ms to them.
 */
const SUMMARY_KEYS = ["eval", "corpus", "corpus_folder", "label", "date", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "served_models", "limit", "strategy", "config_patch", "config", "engine", "assets_sha256", "seed", "status", "aborted_reason", "n_cases", "n_run", "n_scored", "n_errored", "timeouts", "metrics", "model_calls", "semantic_verification", "manifest"];

const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const samplesIn = (dir: string) => readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

describe("runCorpus", () => {
  const scenarios: Scenario[] = [
    { id: "a-good", class: "lesson-worthy", fake: { result: { outcome: "queued" }, proposal: proposal(GOOD), served: ["served-a"] } },
    { id: "b-over", class: "over-claim", fake: { result: { outcome: "queued" }, proposal: proposal(`${GOOD} ${BAD}`), served: ["served-b", "served-a"] } },
    { id: "c-missed", class: "lesson-worthy", fake: { result: { outcome: "quality_rejected", reason: "restates the memory", score: 2 } } },
    { id: "d-wrong", class: "dated-status", fake: { result: { outcome: "queued" }, proposal: proposal("A status.") } },
    { id: "e-skip", class: "duplicate-lesson", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } },
    { id: "f-rejected", class: "restates-asset", fake: { result: { outcome: "quality_rejected", reason: "a paraphrase" } } },
    { id: "g-late", class: "dated-status", fake: { result: { outcome: "review_needed", reason: "mean of 3" }, proposal: proposal("A status.", { status: "pending", fakeStatus: "rejected", gateDecision: { outcome: "deferred", reason: "quality-review" } }) } },
    { id: "h-error", class: "dated-status", fake: { result: { outcome: "llm_failed", message: "no usable output" } } },
  ];

  test("runs each case in its own sandbox and scores what the queue holds", async () => {
    const folders = assetsFor(scenarios);
    const summary = await quiet(() => runFolders(ctx, folders));
    const rows = samplesIn(summary.results_dir);
    expect(rows.map((r) => [r.id, r.verdict, r.outcome])).toEqual([
      ["a-good", "good", "lesson"],
      ["b-over", "bad", "lesson"],
      ["c-missed", "missed", "rejected"],
      ["d-wrong", "wrong", "lesson"],
      ["e-skip", "right", "skipped"],
      ["f-rejected", "right", "rejected"],
      ["g-late", "wrong", "lesson"],
      ["h-error", "error", "error"],
    ]);
    expect(rows[1]).toMatchObject({ forbidden: ["every command"], missing: [] });
    expect(rows[0]).toMatchObject({ gate: "deferred/distill-review", status: "pending", scores: { novelty: 4, nonRedundancy: 4, grounding: 5 }, detail: "deferred/distill-review: ok" });
    expect(rows[0].lesson).toBe(`${GOOD}\nWhen it happens.`);
    expect(rows[6]).toMatchObject({ status: "rejected", gate: "deferred/quality-review" });
    expect(rows[2].detail).toBe("restates the memory");
    expect(rows[4].detail).toBe("lesson_exists");
    expect(rows[7].error).toBe("no usable output");
    expect(summary).toMatchObject({ eval: "distill", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 8, n_run: 8, n_scored: 7, n_errored: 1, limit: null });
    expect(rows.map((r) => r.served)).toEqual([["served-a"], ["served-a", "served-b"], [], [], [], [], [], []]);
    expect(summary.served_models).toEqual(["served-a", "served-b"]);
    expect(summary.metrics.good_lessons).toEqual({ n: 3, good: 1, rate: 0.3333, ambiguous: 0 });
    expect(summary.metrics.wrong_lessons).toEqual({ n: 4, wrong: 2, rate: 0.5 });
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.metrics.bad_by).toEqual({ missing_fact: 0, forbidden_claim: 1, contradiction: 0, too_long: 0, copied: 0 });
    expect(stored.results_dir).toBeUndefined();
  });

  test("an update to an existing lesson is its own outcome: right for an update case, wrong for a duplicate case, and counted apart", async () => {
    const folders = assetsFor([
      { id: "u-right", class: "lesson-update", fake: { result: { outcome: "queued", updatesExisting: true }, proposal: updateProposal(UPDATE.good) } },
      { id: "u-claim", class: "lesson-update", fake: { result: { outcome: "queued", updatesExisting: true }, proposal: updateProposal(UPDATE.bad) } },
      { id: "u-new", class: "lesson-update", fake: { result: { outcome: "queued" }, proposal: proposal("A new lesson.") } },
      { id: "u-none", class: "lesson-update", fake: { result: { outcome: "skipped", skipReason: "nothing_reusable" } } },
      { id: "d-update", class: "duplicate-lesson", fake: { result: { outcome: "queued", updatesExisting: true }, proposal: updateProposal(UPDATE.good) } },
      { id: "d-skip", class: "duplicate-lesson", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } },
    ]);
    const summary = await quiet(() => runFolders(ctx, folders));
    const rows = samplesIn(summary.results_dir);
    expect(rows.map((r) => [r.id, r.verdict, r.outcome])).toEqual([
      ["u-right", "right", "update"],
      ["u-claim", "bad", "update"],
      ["u-new", "bad", "lesson"],
      ["u-none", "missed", "skipped"],
      ["d-update", "wrong", "update"],
      ["d-skip", "right", "skipped"],
    ]);
    expect(rows[0]).toMatchObject({ gate: "deferred/distill-update", status: "pending", added: ["The ceiling is 60 s."], checks: { update_proposed: true, existing_kept: true, new_facts: true, no_extra_claims: true, no_new_lesson: true } });
    expect(rows[1].checks).toMatchObject({ update_proposed: true, no_extra_claims: false });
    expect(summary.metrics.lesson_updates).toEqual({ n: 4, right: 1, rate: 0.25, ambiguous: 0, checks: { update_proposed: 2, existing_kept: 2, new_facts: 2, no_extra_claims: 1, not_copied: 2, no_new_lesson: 3 } });
    expect(summary.metrics.good_lessons).toEqual({ n: 0, good: 0, rate: null, ambiguous: 0 });
    expect(summary.metrics.wrong_lessons).toEqual({ n: 2, wrong: 1, rate: 0.5 });
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.metrics.lesson_updates.right).toBe(1);
  });

  test("akm gets its own folders, a config with the model, the case's files and none of the caller's settings, and the summary's config is the one it read", async () => {
    const summary = await quiet(() => runFolders(ctx, assetsFor(scenarios.slice(0, 1))));
    const improve = calls().find((c) => c.args[0] === "improve");
    expect(improve.args).toEqual(["improve", "memories/m", "--strategy", "distill-only", "--no-sync", "--require-engines", "--json-to-stdout", "--format", "json"]);
    expect(improve.leak).toBeNull();
    expect(improve.judgeKey).toBeNull();
    expect(improve.modelKey).toBe("model-secret");
    expect(improve.bundle).toContain("akm-eval-distill-");
    expect(improve.cwd).toContain("akm-eval-distill-");
    expect(improve.files).toEqual(["fake.json", "memories", "memories/m.md"]);
    expect(improve.strategy).toEqual(["distill-only"]);
    expect(improve.engine).toBe("the-model");
    expect(existsSync(improve.bundle.replace(/\/bundle$/, ""))).toBe(false); // the sandbox is removed
    // the config the sandbox held is distill's, and it is what the summary records (the run builds it for the summary and again for each case)
    expect(improve.config).toEqual(distillConfig(ctx.baseUrl, ctx.model, ctx.hasKey));
    expect(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8")).config).toEqual(redactConfig(hideEndpoint(improve.config, ctx.baseUrl)));
  });

  test("runs the strategy it is given, and records it with the config patch's path and SHA-256", async () => {
    const overrides = { strategy: "lab-strategy", configPatch: { path: "patches/p.json", sha256: "abc123", patch: {} } };
    const summary = await quiet(() => runFolders({ ...ctx, overrides }, assetsFor(scenarios.slice(0, 1))));
    expect(calls().filter((c) => c.args[0] === "improve").at(-1).args.slice(0, 4)).toEqual(["improve", "memories/m", "--strategy", "lab-strategy"]);
    expect(summary).toMatchObject({ strategy: "lab-strategy", config_patch: { path: "patches/p.json", sha256: "abc123" } });
    const plain = await quiet(() => runFolders(ctx, assetsFor(scenarios.slice(0, 1))));
    expect(plain).toMatchObject({ strategy: "distill-only", config_patch: null });
  });

  test("the summary names what the run was made of: the config without secrets, the engine settings and a digest of the assets", async () => {
    // a patch could put a literal key in the config: the summary has it redacted, and the key the config names is only referred to
    const overrides = { strategy: "distill-only", configPatch: { path: "p.json", sha256: "a".repeat(64), patch: { engines: { model: { apiKey: "sk-literal-secret" } } } } };
    const folders = assetsFor(scenarios.slice(0, 1));
    const summary = await quiet(() => runFolders({ ...ctx, hasKey: true, overrides }, folders));
    const text = readFileSync(join(summary.results_dir, "summary.json"), "utf8");
    expect(text).not.toContain("sk-literal-secret");
    const stored = JSON.parse(text);
    expect(stored.config.engines.model).toMatchObject({ model: "the-model", temperature: 0, enableThinking: false, apiKey: "<redacted>" });
    expect(stored.config.improve.strategies["distill-only"].engine).toBe("model");
    expect(stored.engine).toEqual({ engine: "model", model: "the-model", endpoint: endpointHost("http://localhost:8080/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000, engines: { model: { model: "the-model", endpoint: endpointHost("http://localhost:8080/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 } } });
    expect(stored.assets_sha256).toBe(assetsSha256(folders.assets));
    expect(stored.seed).toBeNull();
    expect(stored).toMatchObject({ timeouts: 0, status: "complete" });
    expect(stored.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
    const keyed = await quiet(() => runFolders({ ...ctx, hasKey: true, label: "keyed" }, assetsFor(scenarios.slice(0, 1))));
    expect(JSON.parse(readFileSync(join(keyed.results_dir, "summary.json"), "utf8")).config.engines.model.apiKey).toBe("$MODEL_API_KEY"); // a key is named, never held
    // the same files give the same digest, whatever their folder; another memory gives another
    const again = await quiet(() => runFolders(ctx, assetsFor(scenarios.slice(0, 1))));
    expect(again.assets_sha256).toBe(summary.assets_sha256);
    const other = await quiet(() => runFolders(ctx, assetsFor(scenarios.slice(0, 2))));
    expect(other.assets_sha256).not.toBe(summary.assets_sha256);
  });

  test("a summary records where its corpus is from the repository root, and a rewrite records its seed", async () => {
    const stored = (s: { results_dir: string }) => JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"));
    const folders = [1, 2, 3].map(() => assetsFor(scenarios.slice(0, 1)));
    const publicRun = stored(await quiet(() => runFolders(ctx, folders[0])));
    expect(publicRun).toMatchObject({ corpus: "public", corpus_folder: null, seed: null }); // a public run records no folder
    const rewrite = stored(await quiet(() => runFolders(ctx, folders[1], { rewrite: true, seed: "42" })));
    expect(rewrite).toMatchObject({ corpus: "custom", corpus_folder: null, seed: "42", manifest: { corpus: "custom", settings: { seed: "42" } } });
    const own = stored(await quiet(() => runFolders(ctx, folders[2], { rewrite: false, seed: null })));
    expect(own).toMatchObject({ corpus: "custom", corpus_folder: null, seed: null, manifest: { corpus: "custom", settings: { seed: null } } });
    for (const run of [publicRun, rewrite, own]) for (const f of folders) expect(JSON.stringify(run)).not.toContain(f.assets); // no summary names the folder it read
  });

  test("two runs on identical own assets, made where private/seed holds different seeds, record no seed and compare (#70)", async () => {
    const stored = (s: { results_dir: string }) => JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"));
    const own: Custom = { rewrite: false, seed: null };
    const [a, b] = ["99", "100"].map((seed) => {
      const folders = assetsFor(scenarios.slice(0, 1));
      writeFileSync(join(folders.assets, "..", "seed"), `${seed}\n`); // the private/seed of that machine, next to the assets
      return folders;
    });
    const [sa, sb] = [stored(await quiet(() => runFolders(ctx, a, own))), stored(await quiet(() => runFolders(ctx, b, own)))];
    expect(sa.assets_sha256).toBe(sb.assets_sha256);
    expect([sa.seed, sb.seed, sa.manifest.settings.seed, sb.manifest.settings.seed]).toEqual([null, null, null, null]);
    const saved = (summary: any) => ({ dir: "test", summary, rows: summary.manifest.completion.selected.map((id: string) => ({ id })) });
    expect(comparePair(saved(sa), saved(sb)).warnings.join(" ")).not.toContain("seed differs");
    // a rewrite is different: its seed made the assets, so two seeds are two inputs
    const [ra, rb] = [stored(await quiet(() => runFolders(ctx, a, { rewrite: true, seed: "1" }))), stored(await quiet(() => runFolders(ctx, b, { rewrite: true, seed: "2" })))];
    expect(comparePair(saved(ra), saved(rb)).changes.find(c => c.field === "settings")).toBeDefined();
    expect(comparePair(saved(ra), saved(rb)).rows.find(row => row.key === "quality_percent")?.delta).toBe(0);
  });

  test("an akm that runs past its timeout is an errored case marked timed_out, and the summary counts the timeouts apart from the other errors", async () => {
    const folders = assetsFor([
      { id: "t-slow", class: "dated-status", fake: { sleep: 30_000 } },
      { id: "t-exit", class: "dated-status", fake: { exit: 78, error: "engine unreachable" } },
      { id: "t-ok", class: "dated-status", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } },
    ]);
    const summary = await quiet(() => runFolders({ ...ctx, timeoutMs: 1500 }, folders));
    const rows = samplesIn(summary.results_dir);
    expect(rows[0]).toMatchObject({ verdict: "error", timed_out: true, error: "akm exited 137: akm timed out after 1.5s" });
    expect("timed_out" in rows[1]).toBe(false);
    expect("timed_out" in rows[2]).toBe(false);
    expect(summary).toMatchObject({ n_run: 3, n_scored: 1, n_errored: 2, timeouts: 1, timeout_ms: 1500 });
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect([stored.timeouts, stored.timeout_ms, stored.manifest.settings.timeout_ms]).toEqual([1, 1500, 1500]); // the timeout the run had
  });

  test("the time limit is every akm command of a case, not the improve alone: a slow feedback and a slow queue read time out too, and the feedback is recorded after an index and before improve", async () => {
    const feedback = [{ signal: "negative", reason: "too long" }, { signal: "positive" }];
    const skipped = { result: { outcome: "skipped", skipReason: "lesson_exists" } };
    const before = calls().length;
    const folders = assetsFor([
      { id: "f-ok", class: "dated-status", fake: skipped, feedback },
      { id: "f-slow", class: "dated-status", fake: { ...skipped, feedbackSleep: 30_000 }, feedback },
      { id: "l-slow", class: "dated-status", fake: { ...skipped, listSleep: 30_000 } },
    ]);
    const summary = await quiet(() => runFolders({ ...ctx, timeoutMs: 1500 }, folders));
    const rows = samplesIn(summary.results_dir);
    expect(rows[0]).toMatchObject({ id: "f-ok", verdict: "right" });
    expect(rows[1]).toMatchObject({ id: "f-slow", verdict: "error", timed_out: true, error: "akm exited 137: akm timed out after 1.5s" });
    expect(rows[2]).toMatchObject({ id: "l-slow", verdict: "error", timed_out: true, error: "akm proposal timed out after 1.5s" });
    expect(summary).toMatchObject({ n_run: 3, n_errored: 2, timeouts: 2 });
    const mine = calls().slice(before);
    // the first case: an index (akm records feedback only against an indexed asset), each feedback with its signal and reason, then improve and the queue
    expect(mine.slice(0, 4).map((c) => c.args.join(" "))).toEqual([
      "index --format json",
      "feedback memories/m --negative --reason too long",
      "feedback memories/m --positive",
      "improve memories/m --strategy distill-only --no-sync --require-engines --json-to-stdout --format json",
    ]);
    expect(mine.filter((c) => c.args[0] === "improve")).toHaveLength(2); // the case whose feedback timed out never reached improve
  });

  test("each case has a sandbox of its own, and the queue is read back for every state", async () => {
    const before = calls().length;
    await quiet(() => runFolders(ctx, assetsFor(scenarios.slice(0, 2))));
    const mine = calls().slice(before);
    const improves = mine.filter((c) => c.args[0] === "improve");
    expect(improves).toHaveLength(2);
    expect(new Set(improves.map((c) => c.bundle)).size).toBe(2);
    expect(mine.filter((c) => c.args[0] === "proposal").map((c) => c.args.slice(0, 6).join(" "))).toEqual([
      ...["pending", "accepted", "rejected", "reverted"].map((s) => `proposal list --status ${s} --detail full`),
      ...["pending", "accepted", "rejected", "reverted"].map((s) => `proposal list --status ${s} --detail full`),
    ]);
  });

  test("--limit takes cases from each class in turn", async () => {
    const summary = await quiet(() => runFolders({ ...ctx, limit: 3 }, assetsFor(scenarios)));
    expect(samplesIn(summary.results_dir).map((r) => r.id)).toEqual(["a-good", "b-over", "d-wrong"]);
    expect(summary).toMatchObject({ n_cases: 8, n_run: 3, limit: 3 });
  });

  test("a failed akm is an errored case with akm's message, and a reply that is not JSON is one too", async () => {
    const folders = assetsFor([
      { id: "x-exit", class: "lesson-worthy", fake: { exit: 78, error: "engine unreachable" } },
      { id: "y-junk", class: "dated-status", fake: { stdout: "not json" } },
      { id: "z-ok", class: "dated-status", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } },
    ]);
    const summary = await quiet(() => runFolders(ctx, folders));
    const rows = samplesIn(summary.results_dir);
    expect(rows[0]).toMatchObject({ verdict: "error", error: "akm exited 78: engine unreachable (FAKE)" });
    expect(rows[1].verdict).toBe("error");
    expect(rows[1].error).toContain("akm exited 0");
    expect(summary).toMatchObject({ n_run: 3, n_scored: 1, n_errored: 2 });
  });

  test("keeps the endpoint out of an error, in the row and on the console", async () => {
    const folders = assetsFor([{ id: "x-url", class: "dated-status", fake: { exit: 78, error: "unreachable: http://localhost:8080/v1/chat/completions refused" } }]);
    const shown: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void shown.push(a.join(" "));
    const summary = await runFolders(ctx, folders).finally(() => (console.log = log));
    const [row] = samplesIn(summary.results_dir);
    expect(row.error).toBe("akm exited 78: unreachable: <MODEL_BASE_URL>/chat/completions refused (FAKE)");
    expect(JSON.stringify(row)).not.toContain("localhost:8080");
    expect(shown.join("\n")).toContain("<MODEL_BASE_URL>/chat/completions");
    expect(shown.join("\n")).not.toContain("localhost:8080");
  });

  test("stops after five cases in a row that errored, keeps what it has, and says why in the summary it writes before it fails; a scattering of errors does not stop it", async () => {
    const bad = (id: string) => ({ id, class: "dated-status", fake: { exit: 78, error: "engine unreachable" } });
    const ok = (id: string) => ({ id, class: "dated-status", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } });
    const folders = assetsFor(Array.from({ length: 7 }, (_, i) => bad(`e${i}`)));
    const why = "5 cases in a row errored, so the run stopped after 5 of 7. Last error: akm exited 78: engine unreachable (FAKE)"; // the last error is the one of the eval's row
    await expect(quiet(() => runFolders(ctx, folders))).rejects.toThrow(why);
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    expect(samplesIn(dir)).toHaveLength(5);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ status: "aborted", aborted_reason: why, n_run: 5, n_errored: 5, n_cases: 7 });
    const scattered = await quiet(() => runFolders(ctx, assetsFor([bad("a"), bad("b"), ok("c"), bad("d"), bad("e"), bad("f"), bad("g"), ok("h")])));
    expect(scattered).toMatchObject({ n_run: 8, n_scored: 2, n_errored: 6, status: "complete", aborted_reason: null });
  });
});

describe("what summary.json holds", () => {
  test("every key it has always had, which scripts/ledger, compare and rescore read, and concurrency and timeout_ms besides", async () => {
    const summary = await quiet(() => runFolders(ctx, assetsFor([
      { id: "a-good", class: "lesson-worthy", fake: { result: { outcome: "queued" }, proposal: proposal(GOOD), served: ["served-a"] } },
      { id: "b-skip", class: "dated-status", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" }, served: ["served-b"] } },
    ])));
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(Object.keys(stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms"].sort());
    expect(Object.keys(summary).sort()).toEqual([...Object.keys(stored), "results_dir"].sort()); // what runCorpus returns also names the folder, which the file does not
    expect(stored).toMatchObject({ concurrency: 1, timeout_ms: 900_000, timeouts: 0 });
    expect(stored.served_models).toEqual(["served-a", "served-b"]);
  });

  test("a custom corpus puts its results in private/distill/results, whichever folder it reads, and the public one in the eval's own folder", () => {
    const REPO = join(import.meta.dir, "..", "..", "..");
    const custom = (folder: string): ResolvedCorpus => ({ name: "custom", folder, rewrite: false, seed: null, flag: "--cases x" });
    // the folder that was the corpus own-feedback, whose results went to own/results-feedback, is a custom corpus like any other
    for (const folder of [join(REPO, "private", "distill", "assets"), join(REPO, "private", "distill", "own", "assets"), join(REPO, "private", "distill", "own", "assets-feedback"), "/notes/distill"]) {
      expect(defaultResults(custom(folder), REPO)).toBe(join(REPO, "private", "distill", "results"));
    }
    expect(defaultResults({ name: "public", folder: "x", rewrite: false, seed: null, flag: "--corpus public" }, REPO)).toBe(join(REPO, "evals", "distill", "results"));
  });
});

describe("the manifest of a run", () => {
  const scenarios: Scenario[] = [
    { id: "a-good", class: "lesson-worthy", fake: { result: { outcome: "queued" }, proposal: proposal(GOOD), served: ["served-a"] } },
    { id: "b-rejected", class: "over-claim", fake: { result: { outcome: "quality_rejected", reason: "restates the memory", criteria: { novelty: 2, nonRedundancy: 3, grounding: 4 }, rejectedContent: "---\ndescription: d\n---\nthe lesson" } } },
    { id: "c-skip", class: "dated-status", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } },
    { id: "d-update", class: "lesson-update", fake: { result: { outcome: "queued", updatesExisting: true }, proposal: updateProposal(UPDATE.good) } },
    { id: "e-error", class: "dated-status", fake: { exit: 78, error: "engine unreachable" } },
  ];
  const stored = (s: { results_dir: string }) => JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8"));
  const samples = (s: { results_dir: string }) => samplesIn(s.results_dir);

  test("is sound, carries the eval's version, and a digest of the input and the labels of every case it selected", async () => {
    const folders = assetsFor(scenarios);
    const summary = await quiet(() => runFolders(ctx, folders));
    const { manifest } = stored(summary);
    expect(manifestProblems(manifest)).toEqual([]);
    expect(readManifest(stored(summary)).kind).toBe("manifest");
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(manifest).toMatchObject({ manifest_version: 1, eval: "distill", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, treatment_hints: {} });
    expect(manifest.akm).toEqual({ version: "0.9.99-test", bin: summary.akm_bin, build: null, build_fingerprint: null });
    expect(manifest.settings).toEqual({ strategy: "distill-only", config_patch_sha256: null, timeout_ms: 900_000, seed: null });
    expect(Object.keys(manifest.cases)).toEqual(scenarios.map((s) => s.id));
    const cases = loadCases(folders.assets);
    const first = cases[0];
    expect(manifest.cases["a-good"]).toEqual({
      input_sha256: sha256Json({ bundle: bundleFiles(first.dir), feedback: [] }),
      label_sha256: sha256Json({ class: "lesson-worthy", expect: "lesson", required: LESSON.required, forbidden: LESSON.forbidden, contradicts: [], existing: null, existing_body: null, memory: first.memory }),
    });
    expect(manifest.completion).toEqual({ selected: scenarios.map((s) => s.id), scored: ["a-good", "b-rejected", "c-skip", "d-update"], errored: ["e-error"] });
  });

  test("the input of a case is its bundle and its feedback, and its labels are what the scorer reads: a changed memory changes both, a changed phrase only the labels", async () => {
    const one = assetsFor(scenarios.slice(0, 1));
    const base = stored(await quiet(() => runFolders(ctx, one))).manifest.cases["a-good"];
    const again = stored(await quiet(() => runFolders(ctx, assetsFor(scenarios.slice(0, 1))))).manifest.cases["a-good"];
    expect(again).toEqual(base); // the same case in another folder
    // another phrase to look for: the same input, other labels
    const cases = JSON.parse(readFileSync(join(one.assets, "cases.json"), "utf8"));
    cases[0].required = [["another fact"]];
    writeFileSync(join(one.assets, "cases.json"), JSON.stringify(cases));
    const relabelled = stored(await quiet(() => runFolders(ctx, one))).manifest.cases["a-good"];
    expect(relabelled.input_sha256).toBe(base.input_sha256);
    expect(relabelled.label_sha256).not.toBe(base.label_sha256);
    // another memory: another input, and other labels, since the scorer measures a lesson against the memory
    writeFileSync(join(one.assets, "bundles", "a-good", "memories", "m.md"), memory("Another memory."));
    const edited = stored(await quiet(() => runFolders(ctx, one))).manifest.cases["a-good"];
    expect(edited.input_sha256).not.toBe(base.input_sha256);
    // the feedback a case carries is recorded before distill runs, so it is part of the input
    cases[0].feedback = [{ signal: "negative", reason: "too long" }];
    writeFileSync(join(one.assets, "cases.json"), JSON.stringify(cases));
    expect(stored(await quiet(() => runFolders(ctx, one))).manifest.cases["a-good"].input_sha256).not.toBe(edited.input_sha256);
  });

  test("the summary's config hides the endpoint, and the manifest holds the engines with a host and a digest and no path", async () => {
    const folders = assetsFor(scenarios.slice(0, 1));
    const url = "https://gateway.example/k-DUMMYSECRET0123/v1";
    const summary = await quiet(() => runFolders({ ...ctx, baseUrl: url }, folders));
    for (const file of ["summary.json", "samples.jsonl"]) {
      const text = readFileSync(join(summary.results_dir, file), "utf8");
      expect(text).not.toContain("DUMMYSECRET0123");
      expect(text).not.toContain("k-DUMMY");
    }
    const { manifest, engine, config: shown } = stored(summary);
    expect(shown.engines.model.endpoint).toBe("<MODEL_BASE_URL>/chat/completions");
    expect(manifest.engines.model).toMatchObject({ model: "the-model", endpoint: "https://gateway.example" });
    expect(engine.endpoint).toBe("https://gateway.example");
    expect(manifestProblems(manifest)).toEqual([]);
  });

  test("every row holds the raw output the scorer reads: scoring it again gives the row (a lesson, a rejection, a skip, an update, an error)", async () => {
    const folders = assetsFor(scenarios);
    const summary = await quiet(() => runFolders(ctx, folders));
    const rows = samples(summary);
    expect(rows.map((r) => [r.id, r.verdict, r.outcome])).toEqual([
      ["a-good", "good", "lesson"],
      ["b-rejected", "missed", "rejected"],
      ["c-skip", "right", "skipped"],
      ["d-update", "right", "update"],
      ["e-error", "error", "error"],
    ]);
    const cases = loadCases(folders.assets);
    rows.forEach((row, i) => {
      const read = MEASUREMENT.rawOf(row);
      expect("raw" in read, row.id).toBe(true);
      expect(MEASUREMENT.score(cases[i], (read as { raw: Parameters<typeof MEASUREMENT.score>[1] }).raw), row.id).toEqual(row);
    });
    expect(MEASUREMENT.summarize(rows)).toMatchObject({ n_run: 5, n_scored: 4, n_errored: 1, served_models: summary.served_models, metrics: summary.metrics });
    // what is kept of akm's result is what the scorer reads of it
    expect(rows[0].improve).toEqual({ actions: [{ mode: "distill", result: { outcome: "queued" } }], usageReport: { byProcessEngineModel: [{ model: "served-a", calls: 1 }] } });
    expect(rows[1].improve.actions[0].result).toEqual({ outcome: "quality_rejected", reason: "restates the memory", criteria: { novelty: 2, nonRedundancy: 3, grounding: 4 }, rejectedContent: "---\ndescription: d\n---\nthe lesson" });
    expect(rows[0].proposals).toHaveLength(1);
    expect(rows[0].proposals[0]).toMatchObject({ ref: "bundle//lessons/memory-m-lesson", status: "pending", gate: "deferred/distill-review", update: false });
    expect(rows[4].improve).toBeUndefined(); // akm failed, so there was no answer to keep
    expect(rows[4].proposals).toBeUndefined();
  });

  test("a run that stops early keeps every selected case in the manifest, with those it never ran in neither list", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, class: "dated-status", fake: { exit: 78, error: "engine unreachable" } }));
    const folders = assetsFor(many);
    await expect(quiet(() => runFolders(ctx, folders))).rejects.toThrow("stopped after 5 of 7");
    const { manifest } = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0], "summary.json"), "utf8"));
    expect(manifestProblems(manifest)).toEqual([]);
    expect(manifest.completion).toEqual({ selected: many.map((s) => s.id), scored: [], errored: many.slice(0, 5).map((s) => s.id) });
  });
});

describe("run --corpus custom", () => {
  const EVAL = join(import.meta.dir, "..");
  const REPO = join(EVAL, "..", "..");

  /** A copy of the code and the public assets in a temp folder, so that the run finds private/ there and never in the repository. */
  function copyOfRepo(): string {
    const tree = mkdtempSync(join(tmpdir(), "distill-tree-"));
    dirs.push(tree);
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(REPO, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "src"), join(tree, "evals", "distill", "src"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "assets"), join(tree, "evals", "distill", "assets"), { recursive: true });
    return tree;
  }
  const bun = (tree: string, script: string, args: string[]) => {
    // akm is not there, so a run that gets past its checks stops at the version probe, before it calls a model.
    const env = { ...process.env, MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "m", MODEL_API_KEY: "", AKM_BIN: commandLine([join(tree, "no-akm")]) };
    const p = Bun.spawnSync(["bun", join(tree, "evals", "distill", "src", script), ...args], { cwd: tree, env, stdout: "pipe", stderr: "pipe" });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  };

  test("--help says what the eval does, what its flags default to, and that it needs akm and no release of it", () => {
    const run = bun(copyOfRepo(), "run.ts", ["--help"]);
    expect(run.code).toBe(0);
    expect(run.out).toStartWith("Usage: evals/distill/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]\n\nRuns akm's distill on the memory of each case, with the model in MODEL_BASE_URL, MODEL_API_KEY and MODEL_NAME\nas akm's engine, and scores the lessons it queues. Settings come from .env at the repository root.\n");
    for (const line of [
      "            Your own labelled memories are a custom corpus too: --cases DIR, with the feedback recorded about them in the cases that carry it.",
      "  --limit   run N cases, taken from each class in turn",
      "  --strategy      the akm improve strategy to run in place of distill-only.",
      "  --concurrency  run N cases at a time, each in a sandbox of its own. Default: 1.",
      "  --timeout-ms   stop an akm command that is still running after N milliseconds. Default: 900000.",
    ]) expect(run.out).toContain(line);
    expect(run.out).toEndWith("\n\nNeeds akm on PATH, or in AKM_BIN.\n");
    expect(run.out).not.toMatch(/--yes|-y\b/);
  }, 60_000);

  test("a folder of your own, laid out like assets/, goes on to the akm check", () => {
    const tree = copyOfRepo();
    const notes = join(tree, "my notes");
    cpSync(join(EVAL, "assets"), notes, { recursive: true });
    const run = bun(tree, "run.ts", ["--cases", notes]);
    expect(run.out).toContain(`The cases in ${notes} will be sent to:`);
    expect(run.out).toContain("  model  m at http://127.0.0.1:9/v1");
    expect(run.err).toContain("could not run"); // missing test AKM stops execution before model calls
  }, 60_000);

  test("stops before akm is asked when the custom corpus has no cases.json, and says to make the rewrite only for the rewrite", () => {
    const tree = copyOfRepo();
    const missing = bun(tree, "run.ts", ["--corpus", "custom"]);
    expect(missing.code).toBe(2);
    expect(missing.err.trim()).toBe("distill: --corpus custom: private/distill/assets/cases.json does not exist. The folder of a custom corpus holds cases.json, as assets/ does. Make the rewrite with: ./generate-assets --only distill");
    const empty = mkdtempSync(join(tmpdir(), "distill empty notes-")); // outside the tree, so the message names it as it was given
    dirs.push(empty);
    const own = bun(tree, "run.ts", ["--cases", empty]);
    expect(own.code).toBe(2);
    expect(own.err.trim()).toBe(`distill: --cases ${empty}: ${empty}/cases.json does not exist. The folder of a custom corpus holds cases.json, as assets/ does.`);
    expect(own.err).not.toContain("generate-assets"); // a folder of your own is not made by it
    expect(own.err).not.toContain("could not run");
  });

  test("runs on the assets generate wrote, with --corpus custom and --corpus all", () => {
    const tree = copyOfRepo();
    expect(bun(tree, "generate.ts", ["--seed", "5", "--out", join(tree, "private", "distill")]).code).toBe(0);
    for (const flags of [["--corpus", "custom"], ["--corpus", "all"]]) expect(bun(tree, "run.ts", flags).err, flags.join(" ")).toContain("could not run"); // past the checks, stopped for want of akm
  }, 120_000);

  test("--concurrency and --timeout-ms reach the run through distill's flags: every case has its row, the slow one is killed, and both are recorded", () => {
    const tree = copyOfRepo();
    const script = join(tree, "fake-akm.ts");
    writeFileSync(script, FAKE_AKM);
    const calls = join(tree, "calls.jsonl");
    const notes = assetsFor([
      { id: "s-slow", class: "dated-status", fake: { sleep: 30_000 } },
      { id: "s-ok", class: "dated-status", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } },
      { id: "s-good", class: "lesson-worthy", fake: { result: { outcome: "queued" }, proposal: proposal(GOOD) } },
    ]).assets;
    const env = { ...process.env, MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "m", MODEL_API_KEY: "", AKM_BIN: commandLine(["bun", script]), FAKE_LOG: calls };
    const p = Bun.spawnSync(["bun", join(tree, "evals", "distill", "src", "run.ts"), "--cases", notes, "--concurrency", "2", "--timeout-ms", "1500", "--label", "flags"], { cwd: tree, env, stdout: "pipe", stderr: "pipe" });
    expect([p.exitCode, p.stderr.toString()]).toEqual([0, ""]);
    const results = join(tree, "private", "distill", "results"); // a custom corpus of your own, in the one folder every eval has
    const folder = join(results, readdirSync(results).find((name) => name.endsWith("-flags")) as string);
    const stored = JSON.parse(readFileSync(join(folder, "summary.json"), "utf8"));
    const rows = readFileSync(join(folder, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(Object.keys(stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms", "wall_seconds"].sort()); // wall_seconds is added by --repeat's runner, as it always was
    expect(stored).toMatchObject({ corpus: "custom", concurrency: 2, timeout_ms: 1500, n_run: 3, n_errored: 1, timeouts: 1, status: "complete" });
    expect(stored.manifest.settings.timeout_ms).toBe(1500);
    expect(rows.map((r) => r.id).sort()).toEqual(["s-good", "s-ok", "s-slow"]);
    expect(rows.find((r) => r.id === "s-slow")).toMatchObject({ verdict: "error", timed_out: true });
    const log = readFileSync(calls, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(log.filter((c) => c.args[0] === "improve")).toHaveLength(3);
  }, 60_000);
});
