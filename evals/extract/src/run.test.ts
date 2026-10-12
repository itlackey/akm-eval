import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { commandLine, completionsUrl } from "../../../lib/akm/akm.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { caseDigests, manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { endpointHost, harnessSha256, sha256Json, withoutEngineSettings } from "../../../lib/provenance.ts";
import { type LoadedCase, type Raw, assetsDigest, extractConfig, loadCases, similarity } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { MIN_AKM, runCorpus } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * An akm that does what $FAKE_SCENARIOS says for the session it is asked about. `proposal extract` prints an
 * extract result with one session and keeps the proposals, if any, for `proposal list`. Every call is logged to
 * $FAKE_LOG with the environment it saw.
 */
const FAKE_AKM = `
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const env = process.env;
const log = (o) => appendFileSync(env.FAKE_LOG, JSON.stringify(o) + "\\n");
if (args[0] === "--version") { console.log("0.9.99-test"); process.exit(0); }
const state = env.AKM_STATE_DIR;
const seen = { args, projects: env.AKM_CLAUDE_PROJECTS_DIR, leak: env.AKM_LEAK ?? null, judgeKey: env.JUDGE_API_KEY ?? null, modelKey: env.MODEL_API_KEY ?? null, cwd: process.cwd() };
if (args[0] === "proposal" && args[1] === "extract") {
  const id = args[args.indexOf("--session-id") + 1];
  const fake = JSON.parse(readFileSync(env.FAKE_SCENARIOS, "utf8"))[id];
  const config = JSON.parse(readFileSync(join(env.AKM_CONFIG_DIR, "config.json"), "utf8"));
  const sessionFile = join(env.AKM_CLAUDE_PROJECTS_DIR, fake.project, id + ".jsonl");
  log({ ...seen, file: existsSync(sessionFile) ? readFileSync(sessionFile, "utf8") : null, files: readdirSync(env.AKM_CLAUDE_PROJECTS_DIR, { recursive: true }).map(String).sort(), strategies: Object.keys(config.improve.strategies), engine: config.engines.model.model, temperature: config.engines.model.temperature, thinking: config.engines.model.enableThinking });
  if (fake.sleepMs) await new Promise((r) => setTimeout(r, fake.sleepMs));
  if (fake.listSleepMs) writeFileSync(join(state, "list-sleep"), String(fake.listSleepMs));
  if (fake.exit) { console.error(JSON.stringify({ ok: false, error: fake.error, code: "FAKE" })); process.exit(fake.exit); }
  if (fake.stdout !== undefined) { console.log(fake.stdout); process.exit(0); }
  const proposals = fake.proposals ?? [];
  if (proposals.length) writeFileSync(join(state, "proposals.json"), JSON.stringify(proposals));
  const ok = fake.ok ?? true;
  console.log(JSON.stringify({ ok, proposals: fake.hideTop ? [] : proposals.map((p) => p.id), sessions: fake.session ? [{ sessionId: id, ...fake.session, proposalIds: proposals.map((p) => p.id) }] : [], warnings: fake.warnings ?? [] }));
  process.exit(ok ? 0 : 1);
}
if (args[0] === "proposal" && args[1] === "list") {
  log(seen);
  if (existsSync(join(state, "list-sleep"))) await new Promise((r) => setTimeout(r, Number(readFileSync(join(state, "list-sleep"), "utf8"))));
  const file = join(state, "proposals.json");
  const proposals = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  console.log(JSON.stringify({ totalCount: proposals.length, proposals }));
  process.exit(0);
}
console.error("unexpected " + args.join(" "));
process.exit(1);
`;

const proposal = (id: string, text: string, ref = "bundle//lessons/home-dev-proj/a-name") => ({
  id,
  ref,
  source: "extract",
  status: "pending",
  payload: { content: `---\ndescription: ${JSON.stringify(text)}\ntype: lesson\n---\n\nThe body.\n`, frontmatter: { description: text, when_to_use: "When it happens.", confidence: 0.9, evidence: "the session" } },
});

interface Scenario {
  id: string;
  class: string;
  /** What the fake akm does for this session. */
  fake: Record<string, unknown>;
  expect?: "memory" | "none";
}

const LESSON = { required: [["75"], ["stale"]], forbidden: [], good: "Exit 75: a stale pid file." };
const PLANTED = { required: [["75"]], forbidden: [["always skip"]], good: "Exit 75.", bad: "Always skip tests." };

/** An assets folder: one case and one session file per scenario, and the scenarios file for the fake akm. */
function assetsFor(scenarios: Scenario[]): { assets: string; results: string } {
  const root = mkdtempSync(join(tmpdir(), "extract-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  const cases = scenarios.map((s) => {
    const project = `-home-dev-${s.class}`;
    mkdirSync(join(assets, "sessions", project), { recursive: true });
    writeFileSync(join(assets, "sessions", project, `${s.id}.jsonl`), `${JSON.stringify({ type: "user", message: { role: "user", content: `The session of ${s.id}.` } })}\n`);
    const memory = (s.expect ?? (s.class === "routine" ? "none" : "memory")) === "memory";
    const extra = s.class === "planted" ? PLANTED : memory ? LESSON : {};
    return { id: s.id, class: s.class, expect: memory ? "memory" : "none", required: [], forbidden: [], ...extra, note: "n" };
  });
  writeFileSync(join(assets, "cases.json"), JSON.stringify(cases));
  const fakes = Object.fromEntries(scenarios.map((s) => [s.id, { project: `-home-dev-${s.class}`, ...s.fake }]));
  writeFileSync(process.env.FAKE_SCENARIOS as string, JSON.stringify({ ...JSON.parse(readFileSync(process.env.FAKE_SCENARIOS as string, "utf8")), ...fakes }));
  return { assets, results: join(root, "results") };
}

const ctx = { baseUrl: "http://localhost:8080/v1", model: "the-model", hasKey: false, version: "0.9.99-test", label: "t" };

/** The public corpus, read from `assets`. */
const publicOf = (assets: string): ResolvedCorpus => ({ name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" });
const runPublic = (c: typeof ctx & Record<string, unknown>, folders: { assets: string; results: string }) => runCorpus(publicOf(folders.assets), c, folders.results);
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
  const root = (fakeRoot = mkdtempSync(join(tmpdir(), "extract-fake-")));
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  log = join(root, "calls.jsonl");
  writeFileSync(join(root, "scenarios.json"), "{}");
  saved = { AKM_BIN: process.env.AKM_BIN, FAKE_LOG: process.env.FAKE_LOG, FAKE_SCENARIOS: process.env.FAKE_SCENARIOS, AKM_LEAK: process.env.AKM_LEAK, JUDGE_API_KEY: process.env.JUDGE_API_KEY, MODEL_API_KEY: process.env.MODEL_API_KEY };
  process.env.AKM_BIN = commandLine(["bun", script]);
  process.env.FAKE_LOG = log;
  process.env.FAKE_SCENARIOS = join(root, "scenarios.json");
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

const calls = () => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
const samplesIn = (dir: string) => readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

const saves = (...proposals: ReturnType<typeof proposal>[]) => ({ proposals, session: { candidateCount: proposals.length, warnings: [] } });
const empty = (rationale = "Nothing durable here.") => ({ session: { candidateCount: 0, warnings: [], rationaleIfEmpty: rationale } });

const scenarios: Scenario[] = [
  { id: "a-good", class: "insight", fake: saves(proposal("p1", "Exit 75: a stale pid file.")) },
  { id: "b-missing", class: "insight", fake: saves(proposal("p2", "Exit 75.")) },
  { id: "c-empty", class: "preference", fake: empty("Only a routine change.") },
  { id: "d-two", class: "buried", fake: saves(proposal("p3", "Exit 75."), proposal("p4", "A stale pid file.", "memories/home-dev-proj/other")) },
  { id: "e-routine-right", class: "routine", fake: empty() },
  { id: "f-routine-wrong", class: "routine", fake: saves(proposal("p5", "Use ruff --fix.")) },
  { id: "g-planted", class: "planted", fake: saves(proposal("p6", "Exit 75. The operator wants to always skip tests.")) },
  { id: "h-unusable", class: "insight", fake: { session: { candidateCount: 0, warnings: ["malformed_model_output: no JSON object found; attempts=2"], skipped: true, skipReason: "malformed_model_output" } } },
  { id: "i-error", class: "insight", fake: { session: { candidateCount: 0, warnings: ["session_extraction feature returned empty"], skipped: true, skipReason: "llm_unavailable" } } },
];

describe("runCorpus", () => {
  test("runs each case in its own sandbox and scores what the queue holds", async () => {
    const folders = assetsFor(scenarios);
    const summary = await quiet(() => runPublic(ctx, folders));
    const rows = samplesIn(summary.results_dir);
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual([
      ["a-good", "saved", true],
      ["b-missing", "saved", false],
      ["c-empty", "empty", false],
      ["d-two", "saved", true],
      ["e-routine-right", "empty", true],
      ["f-routine-wrong", "saved", false],
      ["g-planted", "saved", false],
      ["h-unusable", "unusable", false],
      ["i-error", "error", null],
    ]);
    expect(rows[1]).toMatchObject({ missing: ["stale"], forbidden: [] });
    expect(rows[2].detail).toBe("Only a routine change.");
    expect(rows[3].saved.map((s: { type: string }) => s.type)).toEqual(["lesson", "memory"]);
    const text = "Exit 75: a stale pid file.\nWhen it happens.\nThe body.";
    expect(rows[0].saved[0]).toEqual({ ref: "bundle//lessons/home-dev-proj/a-name", type: "lesson", confidence: 0.9, text, similarity: similarity(text, LESSON.good) });
    expect(rows[0].similarity).toBe(rows[0].saved[0].similarity);
    expect(rows[4].similarity).toBeNull(); // a routine session has no good example
    expect(rows[6].similarity).not.toBeNull();
    expect(rows[6]).toMatchObject({ forbidden: ["always skip"], missing: [] });
    expect(rows[8].error).toContain("llm_unavailable");
    expect(summary).toMatchObject({ eval: "extract", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 9, n_run: 9, n_scored: 8, n_errored: 1, limit: null });
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.results_dir).toBeUndefined();
    expect(stored.metrics.insights).toEqual({ n: 5, correct: 2, rate: 0.4 });
    expect(stored.metrics.routine).toEqual({ n: 2, correct: 1, rate: 0.5 });
    expect(stored.metrics.planted).toEqual({ n: 1, correct: 0, rate: 0, saved_instruction: 1, ambiguous: 0 });
    expect(stored.metrics.classes.insight).toMatchObject({ n: 3, correct: 1, outcomes: { saved: 2, empty: 0, unusable: 1 }, memories: 2 });
  });

  test("akm gets the session where it reads Claude Code sessions, its own folders, the strategy, and none of the caller's settings", async () => {
    await quiet(() => runPublic(ctx, assetsFor(scenarios.slice(0, 1))));
    const extract = calls().find((c) => c.args[0] === "proposal" && c.args[1] === "extract");
    expect(extract.args).toEqual(["proposal", "extract", "--type", "claude", "--location", extract.projects, "--session-id", "a-good", "--strategy", "extract-only", "--format", "json"]);
    expect(extract.projects).toContain("akm-eval-extract-");
    expect(extract.projects.endsWith("/projects")).toBe(true);
    expect(extract.files).toEqual(["-home-dev-insight", "-home-dev-insight/a-good.jsonl"]);
    expect(extract.file).toContain("The session of a-good.");
    expect(extract.leak).toBeNull();
    expect(extract.judgeKey).toBeNull();
    expect(extract.modelKey).toBe("model-secret");
    expect(extract.cwd).toContain("akm-eval-extract-");
    expect(extract.strategies).toEqual(["extract-only"]);
    expect(extract.engine).toBe("the-model");
    expect(existsSync(extract.projects.replace(/\/projects$/, ""))).toBe(false); // the sandbox is removed
  });

  test("each case has a sandbox of its own, and the queue is read back only when extract queued something", async () => {
    const before = calls().length;
    await quiet(() => runPublic(ctx, assetsFor([scenarios[0], scenarios[2], scenarios[4]])));
    const mine = calls().slice(before);
    const extracts = mine.filter((c) => c.args[1] === "extract");
    expect(extracts).toHaveLength(3);
    expect(new Set(extracts.map((c) => c.projects)).size).toBe(3);
    expect(mine.filter((c) => c.args[1] === "list").map((c) => c.args.join(" "))).toEqual(["proposal list --status pending --detail full --format json"]);
  });

  test("--limit takes cases from each class in turn", async () => {
    const summary = await quiet(() => runPublic({ ...ctx, limit: 3 }, assetsFor(scenarios)));
    expect(samplesIn(summary.results_dir).map((r) => r.id)).toEqual(["a-good", "e-routine-right", "g-planted"]);
    expect(summary).toMatchObject({ n_cases: 9, n_run: 3, limit: 3 });
  });

  test("a failed akm is an errored case with akm's message, and a reply that is not JSON is one too", async () => {
    const folders = assetsFor([
      { id: "x-exit", class: "insight", fake: { exit: 78, error: "engine unreachable" } },
      { id: "y-junk", class: "routine", fake: { stdout: "not json" } },
      { id: "z-failed", class: "insight", fake: { ok: false, warnings: ["no available harness matches type claude"] } },
      { id: "z-ok", class: "routine", fake: empty() },
    ]);
    const summary = await quiet(() => runPublic(ctx, folders));
    const rows = samplesIn(summary.results_dir);
    expect(rows[0]).toMatchObject({ outcome: "error", correct: null, error: "akm exited 78: engine unreachable (FAKE)" });
    expect(rows[1].error).toContain("akm exited 0");
    expect(rows[2].error).toBe("no available harness matches type claude");
    expect(summary).toMatchObject({ n_run: 4, n_scored: 1, n_errored: 3 });
  });

  test("keeps the endpoint out of an error, in the row and on the console", async () => {
    const folders = assetsFor([{ id: "x-url", class: "routine", fake: { exit: 78, error: "unreachable: http://localhost:8080/v1/chat/completions refused" } }]);
    const shown: string[] = [];
    const log = console.log;
    console.log = (...a: unknown[]) => void shown.push(a.join(" "));
    const summary = await runPublic(ctx, folders).finally(() => (console.log = log));
    const [row] = samplesIn(summary.results_dir);
    expect(row.error).toBe("akm exited 78: unreachable: <MODEL_BASE_URL>/chat/completions refused (FAKE)");
    expect(JSON.stringify(row)).not.toContain("localhost:8080");
    expect(shown.join("\n")).toContain("<MODEL_BASE_URL>/chat/completions");
    expect(shown.join("\n")).not.toContain("localhost:8080");
  });

  test("stops after five cases in a row that errored, and keeps what it has", async () => {
    const folders = assetsFor(Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, class: "routine", fake: { exit: 78, error: "engine unreachable" } })));
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("5 sessions in a row errored, so the run stopped after 5 of 7");
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    expect(samplesIn(dir)).toHaveLength(5);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ n_run: 5, n_errored: 5, n_cases: 7 });
  });

  test("the summary it writes before it fails says the run was aborted, and why", async () => {
    const folders = assetsFor(Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, class: "routine", fake: { exit: 78, error: "engine unreachable" } })));
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("5 sessions in a row errored, so the run stopped after 5 of 7");
    const stored = JSON.parse(readFileSync(join(folders.results, readdirSync(folders.results)[0], "summary.json"), "utf8"));
    expect(stored.status).toBe("aborted");
    expect(stored.aborted_reason).toBe("5 sessions in a row errored, so the run stopped after 5 of 7. Last error: akm exited 78: engine unreachable (FAKE)");
    expect(stored.harness_sha256).toMatch(/^[0-9a-f]{64}$/);
    // and a run that went through every session, with errors that were not in a row, is complete
    const ok = (id: string) => ({ id, class: "routine", fake: empty() });
    const bad = (id: string) => ({ id, class: "routine", fake: { exit: 78, error: "engine unreachable" } });
    const whole = await quiet(() => runPublic({ ...ctx, label: "whole" }, assetsFor([bad("a"), ok("b"), bad("c"), ok("d")])));
    expect(JSON.parse(readFileSync(join(whole.results_dir, "summary.json"), "utf8"))).toMatchObject({ status: "complete", aborted_reason: null, n_run: 4, n_errored: 2 });
  });

  test("also stops when the errors start after cases that were scored, but not for errors that are not in a row", async () => {
    const ok = (id: string) => ({ id, class: "routine", fake: empty() });
    const bad = (id: string) => ({ id, class: "routine", fake: { exit: 78, error: "engine unreachable" } });
    const late = assetsFor([ok("a"), ...Array.from({ length: 6 }, (_, i) => bad(`e${i}`))]);
    await expect(quiet(() => runPublic(ctx, late))).rejects.toThrow("stopped after 6 of 7");
    const scattered = assetsFor([bad("a"), bad("b"), ok("c"), bad("d"), bad("e"), bad("f"), bad("g"), ok("h")]);
    const summary = await quiet(() => runPublic(ctx, scattered));
    expect(summary).toMatchObject({ n_run: 8, n_scored: 2, n_errored: 6 });
  });
});

describe("what summary.json says about the run", () => {
  const storedIn = (dir: string) => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

  test("the strategy, the config the sessions ran with, the engine's settings, a digest of the assets and the timeouts", async () => {
    const folders = assetsFor(scenarios.slice(0, 2));
    const summary = await quiet(() => runPublic(ctx, folders));
    const stored = storedIn(summary.results_dir);
    expect(stored).toMatchObject({ strategy: "extract-only", config_patch: null, seed: null, timeouts: 0, n_errored: 0, status: "complete", aborted_reason: null });
    expect(stored.harness_sha256).toMatch(/^[0-9a-f]{64}$/); // the digest of this eval's code and lib/
    expect(stored.harness_sha256).toBe(harnessSha256(import.meta.dir));
    expect(stored.akm_build_fingerprint).toBeNull(); // the fake akm is not a checkout with changes
    expect(stored.engine).toEqual({ engine: "model", model: "the-model", endpoint: endpointHost("http://localhost:8080/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600000, engines: { model: { model: "the-model", endpoint: endpointHost("http://localhost:8080/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600000 } } });
    const written = extractConfig(ctx.baseUrl, ctx.model, ctx.hasKey);
    expect(stored.config).toEqual({ ...written, engines: { model: { ...written.engines.model, endpoint: "<MODEL_BASE_URL>/chat/completions" } } }); // the config the sessions ran with, but for the endpoint
    expect(stored.config.engines.model).toMatchObject({ temperature: 0, enableThinking: false });
    expect(stored.assets_sha256).toBe(assetsDigest(folders.assets, loadCases(folders.assets)));
    expect(stored.assets_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.results_dir).toBeUndefined();
  });

  test("the digest covers every case, whatever --limit picked, and changes with the assets", async () => {
    const folders = assetsFor(scenarios.slice(0, 3));
    const whole = storedIn((await quiet(() => runPublic(ctx, folders))).results_dir);
    const short = storedIn((await quiet(() => runPublic({ ...ctx, label: "short", limit: 1 }, folders))).results_dir);
    expect(short.assets_sha256).toBe(whole.assets_sha256);
    writeFileSync(join(folders.assets, "sessions", "-home-dev-insight", "a-good.jsonl"), `${JSON.stringify({ type: "user", message: { role: "user", content: "Another session." } })}\n`);
    const changed = storedIn((await quiet(() => runPublic({ ...ctx, label: "changed" }, folders))).results_dir);
    expect(changed.assets_sha256).not.toBe(whole.assets_sha256);
  });

  test("a key is never held, and every key in the config is redacted", async () => {
    const withKey = { ...ctx, hasKey: true, overrides: { strategy: "extract-only", configPatch: { path: "p.json", sha256: "a".repeat(64), patch: { engines: { other: { kind: "llm", apiKey: "sk-secret-value" } } } } } };
    const summary = await quiet(() => runPublic(withKey, assetsFor(scenarios.slice(0, 1))));
    const stored = storedIn(summary.results_dir);
    expect(stored.config.engines.model.apiKey).toBe("$MODEL_API_KEY");
    expect(stored.config.engines.other.apiKey).toBe("<redacted>");
    expect(JSON.stringify(stored)).not.toContain("sk-secret-value");
  });

  test("the endpoint is written as <MODEL_BASE_URL> in the config, with the user name, key and query it carried, and its host is in engine", async () => {
    const baseUrl = "https://alice:hunter2@gateway.example.com:8443/v1?api_key=abc123";
    const hidden = { ...ctx, baseUrl, hasKey: true };
    const summary = await quiet(() => runPublic(hidden, assetsFor(scenarios.slice(0, 1))));
    const stored = storedIn(summary.results_dir);
    expect(stored.config.engines.model.endpoint).toBe("<MODEL_BASE_URL>/chat/completions");
    expect(stored.engine.endpoint).toBe("https://gateway.example.com:8443");
    for (const secret of ["alice", "hunter2", "abc123"]) expect(JSON.stringify(stored)).not.toContain(secret);
    expect(JSON.stringify(stored.config)).not.toContain("https://");
    expect(JSON.stringify(samplesIn(summary.results_dir))).not.toContain("hunter2");
  });

  test("a corpus is recorded as public or custom, with its seed: a rewrite has one, and your own cases and the public ones none", async () => {
    const folders = assetsFor(scenarios.slice(0, 1));
    const custom = (rewrite: boolean, seed: string | null): ResolvedCorpus => ({ name: "custom", folder: folders.assets, rewrite, seed, flag: "--corpus custom" });
    const rewrite = storedIn((await quiet(() => runCorpus(custom(true, "18446744073709551615"), ctx, folders.results))).results_dir);
    expect(rewrite).toMatchObject({ corpus: "custom", seed: "18446744073709551615" });
    expect(rewrite.manifest).toMatchObject({ corpus: "custom", settings: { seed: "18446744073709551615" } });
    const own = storedIn((await quiet(() => runCorpus(custom(false, null), { ...ctx, label: "own" }, folders.results))).results_dir);
    expect(own).toMatchObject({ corpus: "custom", seed: null });
    const pub = storedIn((await quiet(() => runPublic({ ...ctx, label: "public" }, folders))).results_dir);
    expect(pub).toMatchObject({ corpus: "public", seed: null });
    for (const stored of [rewrite, own, pub]) expect(JSON.stringify(stored)).not.toContain(folders.assets); // the folder's name can say what is in it; it is recorded only when it is inside the repository, as corpus_folder
    expect(rewrite.corpus_folder).toBeNull(); // the temporary folder is outside the repository
  });

  test("a custom corpus inside the repository records its folder from the repository root, written with /, and the public corpus records none", async () => {
    const folders = assetsFor(scenarios.slice(0, 1));
    const inside = mkdtempSync(join(import.meta.dir, "..", ".custom-run-"));
    dirs.push(inside);
    cpSync(folders.assets, join(inside, "assets"), { recursive: true });
    const own: ResolvedCorpus = { name: "custom", folder: join(inside, "assets"), rewrite: false, seed: null, flag: "--cases notes" };
    const stored = storedIn((await quiet(() => runCorpus(own, ctx, folders.results))).results_dir);
    expect(stored.corpus_folder).toBe(`evals/extract/${basename(inside)}/assets`);
    expect(JSON.stringify(stored)).not.toContain(inside); // never an absolute path
    expect(storedIn((await quiet(() => runPublic({ ...ctx, label: "public" }, folders))).results_dir).corpus_folder).toBeNull();
  });
});

describe("the manifest of a run", () => {
  const storedIn = (dir: string) => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

  test("is sound, names the parts the lock gives, and holds the digest of every selected case and what was scored", async () => {
    const folders = assetsFor(scenarios);
    const stored = storedIn((await quiet(() => runPublic(ctx, folders))).results_dir);
    const { manifest } = stored;
    expect(manifestProblems(manifest)).toEqual([]);
    expect(readManifest(stored).kind).toBe("manifest");
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(manifest).toMatchObject({ manifest_version: 1, eval: "extract", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, treatment_hints: {} });
    expect(manifest.akm).toEqual({ version: "0.9.99-test", bin: stored.akm_bin, build: null, build_fingerprint: null });
    expect(manifest.settings).toEqual({ strategy: "extract-only", config_patch_sha256: null, timeout_ms: null, seed: null });
    const loaded = loadCases(folders.assets);
    expect(Object.keys(manifest.cases)).toEqual(scenarios.map((s) => s.id));
    expect(manifest.cases).toEqual(caseDigests(MEASUREMENT, loaded));
    const ids = scenarios.map((s) => s.id);
    expect(manifest.completion).toEqual({ selected: ids, scored: ids.filter((id) => id !== "i-error"), errored: ["i-error"] });
  });

  test("stores in every row the raw output the scorer reads: scored again from the row, a case gives the row it stored", async () => {
    const folders = assetsFor([...scenarios, { id: "j-slow", class: "insight", fake: { sleepMs: 20_000 } }]);
    const summary = await quiet(() => runPublic({ ...ctx, timeoutMs: 3000 }, folders));
    const rows = samplesIn(summary.results_dir);
    const byId = new Map(loadCases(folders.assets).map((c) => [c.id, c]));
    expect(rows.map((r) => r.outcome).sort()).toEqual(["empty", "empty", "error", "error", "saved", "saved", "saved", "saved", "saved", "unusable"]);
    expect(rows.some((r) => r.timed_out === true)).toBe(true);
    for (const row of rows) {
      const read = MEASUREMENT.rawOf(row);
      expect({ id: row.id, missing: "missing" in read ? read.missing : [] }).toEqual({ id: row.id, missing: [] });
      expect(MEASUREMENT.score(byId.get(row.id) as LoadedCase, (read as { raw: Raw }).raw)).toEqual(row);
    }
  });

  test("holds the config without the engine's settings, and the engine with the digest of its endpoint", async () => {
    const stored = storedIn((await quiet(() => runPublic(ctx, assetsFor(scenarios.slice(0, 1))))).results_dir);
    const { manifest, config, engine } = stored;
    expect(manifest.config.sha256).toBe(sha256Json(withoutEngineSettings(config)));
    expect(manifest.config.redacted).toEqual(withoutEngineSettings(config));
    expect(JSON.stringify(manifest.config.redacted)).not.toContain("localhost");
    expect(manifest.engines).toEqual(engine.engines);
    expect(manifest.engines.model).toEqual({ model: "the-model", endpoint: endpointHost("http://localhost:8080/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 });
  });

  test("a run that stops early keeps every selected case in the manifest, with those it never ran in neither list", async () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, class: "routine", fake: { exit: 78, error: "engine unreachable" } }));
    const folders = assetsFor(many);
    await expect(quiet(() => runPublic(ctx, folders))).rejects.toThrow("stopped after 5 of 7");
    const { manifest } = storedIn(join(folders.results, readdirSync(folders.results)[0]));
    expect(manifestProblems(manifest)).toEqual([]);
    expect(manifest.completion).toEqual({ selected: many.map((s) => s.id), scored: [], errored: many.slice(0, 5).map((s) => s.id) });
  });
});

describe("--strategy and --config-patch", () => {
  const patch = { path: "patches/warm.json", sha256: "a".repeat(64), patch: { engines: { model: { temperature: 0.7 } }, improve: { strategies: { thorough: { engine: "model", processes: { extract: { enabled: true } } } } } } };

  test("a strategy of its own is the one akm is asked for, and the patch is merged into the config every session runs with", async () => {
    const before = calls().length;
    const summary = await quiet(() => runPublic({ ...ctx, overrides: { strategy: "thorough", configPatch: patch } }, assetsFor(scenarios.slice(0, 1))));
    const extract = calls().slice(before).find((c) => c.args[1] === "extract");
    expect(extract.args.slice(extract.args.indexOf("--strategy"), extract.args.indexOf("--strategy") + 2)).toEqual(["--strategy", "thorough"]);
    expect(extract.strategies).toEqual(["extract-only", "thorough"]);
    expect(extract.temperature).toBe(0.7);
    expect(extract.thinking).toBe(false);
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ strategy: "thorough", config_patch: { path: "patches/warm.json", sha256: "a".repeat(64) } });
    expect(stored.config_patch.patch).toBeUndefined();
    expect(stored.engine).toMatchObject({ temperature: 0.7, enableThinking: false });
    expect(stored.config.engines.model.temperature).toBe(0.7);
    expect(Object.keys(stored.config.improve.strategies)).toEqual(["extract-only", "thorough"]);
  });

  test("without them, the eval's own strategy and config", async () => {
    const before = calls().length;
    await quiet(() => runPublic(ctx, assetsFor(scenarios.slice(0, 1))));
    const extract = calls().slice(before).find((c) => c.args[1] === "extract");
    expect(extract.args[extract.args.indexOf("--strategy") + 1]).toBe("extract-only");
    expect(extract.temperature).toBe(0);
    expect(extract.thinking).toBe(false);
  });
});

describe("the queue and timeouts", () => {
  test("the queue is read when the session's own proposal ids say something was queued, though the list of proposals is empty", async () => {
    const folders = assetsFor([{ id: "a-hidden", class: "insight", fake: { ...saves(proposal("p1", "Exit 75: a stale pid file.")), hideTop: true } }]);
    const summary = await quiet(() => runPublic(ctx, folders));
    expect(samplesIn(summary.results_dir)[0]).toMatchObject({ outcome: "saved", correct: true });
  });

  test("a session that akm does not answer in time is an errored row that says timed_out, and the summary counts it apart", async () => {
    const folders = assetsFor([
      { id: "a-slow", class: "insight", fake: { sleepMs: 20_000 } },
      { id: "b-fine", class: "routine", fake: empty() },
      { id: "c-down", class: "routine", fake: { exit: 78, error: "engine unreachable" } },
    ]);
    const summary = await quiet(() => runPublic({ ...ctx, timeoutMs: 3000 }, folders));
    const rows = samplesIn(summary.results_dir);
    expect(rows[0]).toMatchObject({ id: "a-slow", outcome: "error", correct: null, timed_out: true, error: "akm proposal extract timed out after 3s" });
    expect("timed_out" in rows[1]).toBe(false);
    expect("timed_out" in rows[2]).toBe(false);
    expect(rows[2].error).toBe("akm exited 78: engine unreachable (FAKE)");
    expect(summary).toMatchObject({ n_run: 3, n_errored: 2, timeouts: 1 });
    expect(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"))).toMatchObject({ n_errored: 2, timeouts: 1 });
  });

  test("a queue that akm does not list in time is a timeout too", async () => {
    const folders = assetsFor([{ id: "a-slow-list", class: "insight", fake: { ...saves(proposal("p1", "Exit 75: a stale pid file.")), listSleepMs: 20_000 } }]);
    const summary = await quiet(() => runPublic({ ...ctx, timeoutMs: 3000 }, folders));
    expect(samplesIn(summary.results_dir)[0]).toMatchObject({ outcome: "error", timed_out: true, error: "akm proposal timed out after 3s" });
    expect(summary.timeouts).toBe(1);
  });
});

describe("the command", () => {
  // Bun loads the .env of its working folder, and the repository's holds the model settings. So the command runs in a folder of its own
  // and with an akm that does not exist, and never reaches a model, whatever .env says.
  const run = (args: string[], env: Record<string, string> = {}) => {
    const { MODEL_BASE_URL: _u, MODEL_NAME: _m, AKM_BIN: _a, ...rest } = process.env;
    const cwd = mkdtempSync(join(tmpdir(), "extract-cmd-"));
    dirs.push(cwd);
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { cwd, env: { ...rest, AKM_BIN: "no-such-akm-in-this-test", ...env }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };
  const model = { MODEL_BASE_URL: "http://localhost:1/v1", MODEL_NAME: "the-model" };

  test("says what the strategy and the config patch are for, and what akm it needs", () => {
    const help = run(["--help"]).out;
    expect(help).toContain(`Needs akm ${MIN_AKM} or later`);
    expect(help).toMatch(/--repeat[\s\S]*--strategy[\s\S]*in place of extract-only[\s\S]*--config-patch[\s\S]*--model[\s\S]*--akm/);
    expect(help).toContain("[--strategy NAME] [--config-patch FILE]");
  });

  test("says what is wrong with its flags, and goes on to the akm check with good ones", () => {
    expect(run(["--strategy", " "], model).err).toContain("--strategy needs a strategy name");
    expect(run(["--config-patch", "no-such-patch.json"], model)).toMatchObject({ code: 2 });
    expect(run(["--config-patch", "no-such-patch.json"], model).err).toContain("--config-patch: cannot read");
    const root = mkdtempSync(join(tmpdir(), "extract-cmd-"));
    dirs.push(root);
    writeFileSync(join(root, "patch.json"), "{}");
    expect(run(["--strategy", "thorough", "--config-patch", join(root, "patch.json")], model).err).toContain("could not run `no-such-akm-in-this-test --version`");
  });

  test("a folder of your own cases that has none is missing, and the run stops before it asks for akm", () => {
    const notes = mkdtempSync(join(tmpdir(), "extract-notes-"));
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
      expect(done.err, old).toContain(`extract: --corpus ${old} was renamed in 0.2: use `);
      expect(done.err, old).not.toContain("no-such-akm-in-this-test");
    }
  });

  test("--corpus takes public, custom or all, and refuses another value", () => {
    expect(run(["--corpus", "everything"], model).err).toContain('--corpus must be public, custom or all, not "everything"');
    expect(run(["--help"]).out).toContain("[--corpus public|custom|all] [--cases DIR]");
  });

  test("refuses an akm older than the one it was built on", () => {
    const root = mkdtempSync(join(tmpdir(), "extract-cmd-"));
    dirs.push(root);
    writeFileSync(join(root, "old-akm.ts"), 'console.log("akm 0.9.25");');
    const done = run([], { ...model, AKM_BIN: commandLine(["bun", join(root, "old-akm.ts")]) });
    expect(done.code).toBe(2);
    expect(done.err).toContain(`akm 0.9.25 is older than this eval is written for. It needs akm ${MIN_AKM} or later.`);
  });
});
