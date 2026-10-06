import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { distillConfig } from "./lib.ts";
import { runCorpus } from "./run.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * An akm that does what the case's fake.json says. `improve` prints a result with one distill action and keeps the
 * proposal, if any, for `proposal list`. Every call is logged to $FAKE_LOG with the environment it saw.
 */
const FAKE_AKM = `
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const env = process.env;
const log = (o) => appendFileSync(env.FAKE_LOG, JSON.stringify(o) + "\\n");
if (args[0] === "--version") { console.log("0.9.99-test"); process.exit(0); }
const bundle = env.AKM_BUNDLE_DIR, state = env.AKM_STATE_DIR;
const seen = { args, bundle, leak: env.AKM_LEAK ?? null, judgeKey: env.JUDGE_API_KEY ?? null, modelKey: env.MODEL_API_KEY ?? null, cwd: process.cwd() };
if (args[0] === "improve") {
  const fake = JSON.parse(readFileSync(join(bundle, "fake.json"), "utf8"));
  const config = JSON.parse(readFileSync(join(env.AKM_CONFIG_DIR, "config.json"), "utf8"));
  log({ ...seen, files: readdirSync(bundle, { recursive: true }).map(String).sort(), strategy: Object.keys(config.improve.strategies), engine: config.engines.model.model });
  if (fake.exit) { console.error(JSON.stringify({ ok: false, error: fake.error, code: "FAKE" })); process.exit(fake.exit); }
  if (fake.stdout !== undefined) { console.log(fake.stdout); process.exit(0); }
  if (fake.proposal) writeFileSync(join(state, "proposals.json"), JSON.stringify([fake.proposal]));
  const usageReport = fake.served ? { usageReport: { byProcessEngineModel: fake.served.map((model) => ({ process: "distill", engine: "model", model, calls: 1 })) } } : {};
  console.log(JSON.stringify({ ok: true, ...usageReport, actions: [{ mode: "reflect-skipped", result: { ok: true, reason: "process-disabled" } }, { mode: "distill", result: fake.result }] }));
  process.exit(0);
}
if (args[0] === "proposal" && args[1] === "list") {
  log(seen);
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
}

const GOOD = "The default is 30, so pass --limit 200.";
const BAD = "Every command is capped, so use --limit 1000.";
const LESSON = { required: [["30"], ["--limit"]], forbidden: [["every command"]], good: GOOD, bad: BAD };

/** An assets folder: one case per scenario, with its memory and the fake.json that tells the fake akm what to do. */
function assetsFor(scenarios: Scenario[]): { assets: string; results: string } {
  const root = mkdtempSync(join(tmpdir(), "distill-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  const cases = scenarios.map((s) => {
    const expectsLesson = s.class === "lesson-worthy" || s.class === "over-claim";
    mkdirSync(join(assets, "bundles", s.id, "memories"), { recursive: true });
    writeFileSync(join(assets, "bundles", s.id, "memories", "m.md"), memory(`The memory of ${s.id}, with enough words in it to compare. ${"More words. ".repeat(10)}`));
    writeFileSync(join(assets, "bundles", s.id, "fake.json"), JSON.stringify(s.fake));
    return { id: s.id, class: s.class, expect: expectsLesson ? "lesson" : "none", ...(expectsLesson ? LESSON : {}), note: "n" };
  });
  writeFileSync(join(assets, "cases.json"), JSON.stringify(cases));
  return { assets, results: join(root, "results") };
}

const ctx = { config: distillConfig("http://localhost:8080/v1", "the-model", false), baseUrl: "http://localhost:8080/v1", version: "0.9.99-test", model: "the-model", label: "t" };
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
  process.env.AKM_BIN = `bun ${script}`;
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
    const summary = await quiet(() => runCorpus("public", ctx, folders));
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
    expect(summary.metrics.good_lessons).toEqual({ n: 3, good: 1, rate: 0.3333 });
    expect(summary.metrics.wrong_lessons).toEqual({ n: 4, wrong: 2, rate: 0.5 });
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(stored.metrics.bad_by).toEqual({ missing_fact: 0, forbidden_claim: 1, too_long: 0 });
    expect(stored.results_dir).toBeUndefined();
  });

  test("akm gets its own folders, a config with the model, the case's files and none of the caller's settings", async () => {
    await quiet(() => runCorpus("public", ctx, assetsFor(scenarios.slice(0, 1))));
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
  });

  test("each case has a sandbox of its own, and the queue is read back for every state", async () => {
    const before = calls().length;
    await quiet(() => runCorpus("public", ctx, assetsFor(scenarios.slice(0, 2))));
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
    const summary = await quiet(() => runCorpus("public", { ...ctx, limit: 3 }, assetsFor(scenarios)));
    expect(samplesIn(summary.results_dir).map((r) => r.id)).toEqual(["a-good", "b-over", "d-wrong"]);
    expect(summary).toMatchObject({ n_cases: 8, n_run: 3, limit: 3 });
  });

  test("a failed akm is an errored case with akm's message, and a reply that is not JSON is one too", async () => {
    const folders = assetsFor([
      { id: "x-exit", class: "lesson-worthy", fake: { exit: 78, error: "engine unreachable" } },
      { id: "y-junk", class: "dated-status", fake: { stdout: "not json" } },
      { id: "z-ok", class: "dated-status", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } },
    ]);
    const summary = await quiet(() => runCorpus("public", ctx, folders));
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
    const summary = await runCorpus("public", ctx, folders).finally(() => (console.log = log));
    const [row] = samplesIn(summary.results_dir);
    expect(row.error).toBe("akm exited 78: unreachable: <MODEL_BASE_URL>/chat/completions refused (FAKE)");
    expect(JSON.stringify(row)).not.toContain("localhost:8080");
    expect(shown.join("\n")).toContain("<MODEL_BASE_URL>/chat/completions");
    expect(shown.join("\n")).not.toContain("localhost:8080");
  });

  test("stops after five cases in a row that errored, and keeps what it has", async () => {
    const folders = assetsFor(Array.from({ length: 7 }, (_, i) => ({ id: `e${i}`, class: "dated-status", fake: { exit: 78, error: "engine unreachable" } })));
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("5 cases in a row errored, so the run stopped after 5 of 7");
    const dir = join(folders.results, readdirSync(folders.results)[0]);
    expect(samplesIn(dir)).toHaveLength(5);
    expect(JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"))).toMatchObject({ n_run: 5, n_errored: 5, n_cases: 7 });
  });

  test("also stops when the errors start after cases that were scored, but not for errors that are not in a row", async () => {
    const ok = (id: string) => ({ id, class: "dated-status", fake: { result: { outcome: "skipped", skipReason: "lesson_exists" } } });
    const bad = (id: string) => ({ id, class: "dated-status", fake: { exit: 78, error: "engine unreachable" } });
    const late = assetsFor([ok("a"), ...Array.from({ length: 6 }, (_, i) => bad(`e${i}`))]);
    await expect(quiet(() => runCorpus("public", ctx, late))).rejects.toThrow("stopped after 6 of 7");
    const scattered = assetsFor([bad("a"), bad("b"), ok("c"), bad("d"), bad("e"), bad("f"), bad("g"), ok("h")]);
    const summary = await quiet(() => runCorpus("public", ctx, scattered));
    expect(summary).toMatchObject({ n_run: 8, n_scored: 2, n_errored: 6 });
  });
});
