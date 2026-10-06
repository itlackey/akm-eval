import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { type Item, applyFix, loadNight, refOf } from "./lib.ts";
import { feedbackArgs, hideEndpoint, plant, runCorpus } from "./run.ts";

const night = loadNight(join(import.meta.dir, "..", "assets"));
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/**
 * An akm that does what a scenario file says, so the night can be checked without a model. The scenario holds akm's improve result,
 * the proposals it queues and what the drain does: the proposals it accepts and the files it writes or removes. It records every
 * command it is given, and it needs what the real one needs: the deterministic embedder, semantic search, and the arguments of the nightly.
 */
const FAKE_AKM = `
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const args = process.argv.slice(2);
const [cmd, sub] = args;
const has = (flag) => args.includes(flag);
const json = (o) => console.log(JSON.stringify(o));
if (cmd === "--version") { console.log("akm 0.9.99-test"); process.exit(0); }
appendFileSync(process.env.FAKE_LOG, args.join(" ") + "\\n");
const scenario = JSON.parse(readFileSync(process.env.FAKE_SCENARIO, "utf8"));
const config = JSON.parse(readFileSync(join(process.env.AKM_CONFIG_DIR, "config.json"), "utf8"));
const state = join(process.env.AKM_STATE_DIR, "proposals.json");
const proposals = () => (existsSync(state) ? JSON.parse(readFileSync(state, "utf8")) : []);
const apply = (effects) => {
  for (const e of effects ?? []) {
    const file = join(process.env.AKM_BUNDLE_DIR, e.path);
    if (e.remove) rmSync(file, { force: true });
    else { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, e.write); }
  }
};
if (cmd === "index") {
  if (scenario.indexFails) { console.error(JSON.stringify({ ok: false, error: scenario.indexFails })); process.exit(70); }
  if (process.env.AKM_EMBED_DETERMINISTIC !== "1" || config.semanticSearchMode !== "auto") { console.error("no deterministic embedder or semantic search is off"); process.exit(3); }
  json({ ok: true });
} else if (cmd === "feedback") {
  json({ ok: true });
} else if (cmd === "improve") {
  const strategy = args[args.indexOf("--strategy") + 1];
  if (strategy !== "default" || !has("--require-engines") || !has("--no-sync") || !has("--json-to-stdout") || !has("--timeout-ms")) { console.error("unexpected " + args.join(" ")); process.exit(2); }
  if (scenario.improveFails) { console.error(JSON.stringify({ ok: false, error: scenario.improveFails })); process.exit(78); }
  apply(scenario.improveWrites);
  writeFileSync(state, JSON.stringify((scenario.proposals ?? []).map((p) => ({ ...p, status: "pending" }))));
  json(scenario.improve);
} else if (cmd === "proposal" && sub === "drain") {
  if (!has("--promote") || !has("--yes") || args[args.indexOf("--strategy") + 1] !== "default") { console.error("unexpected " + args.join(" ")); process.exit(2); }
  apply(scenario.drain?.apply);
  const accepted = new Set(scenario.drain?.accept ?? []);
  writeFileSync(state, JSON.stringify(proposals().map((p) => (accepted.has(p.id) ? { ...p, status: "accepted" } : p))));
  json({ ok: true, promoted: [...accepted], rejected: [], deferred: proposals().filter((p) => !accepted.has(p.id)).map((p) => ({ id: p.id })), failed: [] });
} else if (cmd === "proposal" && sub === "list") {
  if (!has("--detail")) { console.error("needs --detail full"); process.exit(2); }
  const status = args[args.indexOf("--status") + 1];
  const list = proposals().filter((p) => p.status === status);
  json({ totalCount: list.length, proposals: list });
} else { console.error("unexpected " + args.join(" ")); process.exit(1); }
`;

type Scenario = Record<string, unknown>;

/** A temp folder holding a small night of the public night's items, a scenario, and a context that runs the fake akm. */
function setup(ids: string[], scenario: Scenario) {
  const root = mkdtempSync(join(tmpdir(), "nightly-run-"));
  dirs.push(root);
  const items = ids.map((id) => night.items.find((i) => i.id === id) as Item);
  const assets = join(root, "assets");
  for (const path of items.flatMap((i) => i.files)) {
    mkdirSync(dirname(join(assets, "library", path)), { recursive: true });
    writeFileSync(join(assets, "library", path), night.files.get(path) as string);
  }
  writeFileSync(join(assets, "items.jsonl"), `${items.map((i) => JSON.stringify(i)).join("\n")}\n`);
  writeFileSync(join(root, "fake-akm.ts"), FAKE_AKM);
  writeFileSync(join(root, "scenario.json"), JSON.stringify(scenario));
  process.env.FAKE_SCENARIO = join(root, "scenario.json");
  process.env.FAKE_LOG = join(root, "commands.log");
  writeFileSync(process.env.FAKE_LOG, "");
  const newSandbox = () => ({ ...createSandbox("nightly-test", { keepModelKey: true }), cmd: ["bun", join(root, "fake-akm.ts")] });
  const ctx = { newSandbox, baseUrl: "http://localhost:1/v1", model: "the-model", hasKey: false, version: "0.9.99-test", label: "t" };
  return { ctx, folders: { assets, results: join(root, "results") }, root, commands: () => readFileSync(join(root, "commands.log"), "utf8").trim().split("\n") };
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

const resultsOf = (folders: { results: string }) => {
  const dir = join(folders.results, readdirSync(folders.results)[0] as string);
  const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { dir, rows, summary: JSON.parse(readFileSync(join(dir, "summary.json"), "utf8")) };
};

const textOf = (path: string) => night.files.get(path) as string;
const item = <T extends Item>(id: string) => night.items.find((i) => i.id === id) as T;

// What a good night looks like, for the items of these tests: the first duplicate is retired, the reflect case is fixed, the control is
// left alone, the exact fix waits, the lesson waits for review, and the note to leave alone is as it was.
const dup = item<Extract<Item, { kind: "pair" }>>("duplicate-01");
const period = item<Extract<Item, { kind: "reflect" }>>("description-period-01");
const fix = item<Extract<Item, { kind: "fix" }>>("exact-fix-01");
const lesson = item<Extract<Item, { kind: "distill" }>>("lesson-01");
const GOOD_LESSON = "---\ndescription: Do not wait for networkidle on a page with a polling widget.\nwhen_to_use: A Playwright test hangs on a wait.\n---\nThe support chat widget polls every 20 seconds, so the network is never idle for networkidle. Wait for an element to be visible instead, such as the page heading.\n";
const IDS = ["duplicate-01", "description-period-01", "retrieval-miss-01", "lesson-01", "exact-fix-01", "untouched-01"];

const good = (): Scenario => ({
  improve: {
    ok: true,
    strategy: "default",
    actions: [
      { ref: refOf(period.path), mode: "reflect", result: { ok: true } },
      { ref: "agents/playwright/playwright-explorer", mode: "reflect-skipped", result: { reason: "no_change" } },
      { ref: refOf(fix.path), mode: "reflect-skipped", result: { reason: "no_change" } },
      { ref: "memories/playwright-networkidle-chat-widget", mode: "distill", result: { outcome: "review_needed", reason: "unsure" } },
    ],
    consolidation: { pairPass: { pairsJudged: 1, failedJudgments: 0, labelCounts: { duplicate: 1, overlap: 0 } } },
    usageReport: { byProcessEngineModel: [{ process: "consolidate", engine: "nightly", model: "served-a", calls: 3, failures: 0 }, { process: "reflect", engine: "nightly", model: "served-b", calls: 4, failures: 0 }, { process: "distill", engine: "nightly", model: "the-model", calls: 2, failures: 0 }] },
  },
  proposals: [
    { id: "p1", ref: `bundle//${refOf(dup.a)}`, source: "consolidate-pair", gateDecision: { outcome: "staged", reason: "duplicate" }, retirement: { retiredRef: refOf(dup.a), successorRef: refOf(dup.b), judgeLabel: "duplicate", judgeReason: "same claims" }, payload: {} },
    { id: "p2", ref: `bundle//${refOf(period.path)}`, source: "reflect", gateDecision: { outcome: "staged", reason: "quality-judge" }, retirement: { retiredRef: null }, payload: { content: "(not read: the file on disk is)" } },
    { id: "p3", ref: `bundle//${refOf(fix.path)}`, source: "feedback", gateDecision: null, retirement: { retiredRef: null }, payload: { content: applyFix(textOf(fix.path), fix.feedback[0]?.fix as never) } },
    { id: "p4", ref: "bundle//lessons/memory-playwright-networkidle-chat-widget-lesson", source: "distill", gateDecision: { outcome: "deferred", reason: "distill-review" }, retirement: { retiredRef: null }, payload: { content: GOOD_LESSON } },
    { id: "p5", ref: "bundle//knowledge/ostler-retry-policy", source: "consolidate", gateDecision: null, retirement: { retiredRef: null }, payload: { content: "a promotion" } },
  ],
  drain: {
    accept: ["p1", "p2"],
    apply: [{ path: dup.a, remove: true }, { path: period.path, write: textOf(period.path).replace(/description: (.*)\.\n {2}([a-z])/, "description: $1 $2") }],
  },
});

describe("plant", () => {
  const day = 86_400_000;
  const daysOld = (sandbox: { dir: string }, path: string) => Math.round((Date.now() - statSync(join(sandbox.dir, "bundle", path)).mtimeMs) / day) + 0; // + 0: a file from this instant is -0 days old

  test("writes each item's files into the bundle, the notes of a pair dated by file time, and nothing else", () => {
    const sandbox = createSandbox("nightly-test");
    try {
      const items = [dup, item("untouched-01"), lesson];
      plant(sandbox, items, night.files);
      for (const path of items.flatMap((i) => i.files)) expect(readFileSync(join(sandbox.dir, "bundle", path), "utf8")).toBe(textOf(path));
      expect([daysOld(sandbox, dup.a), daysOld(sandbox, dup.b)]).toEqual([3, 1]); // duplicate-01: the note a is the older
      expect(daysOld(sandbox, lesson.memory)).toBe(0);
    } finally {
      removeSandbox(sandbox);
    }
  });

  test("dates a pair from one day 2 days each, and the note b as the older when it is", () => {
    const sandbox = createSandbox("nightly-test");
    try {
      const pairs = night.items.filter((i): i is Extract<Item, { kind: "pair" }> => i.kind === "pair");
      const b = pairs.find((p) => p.older === "b") as (typeof pairs)[number];
      const both = pairs.find((p) => p.older === null);
      plant(sandbox, [b], night.files);
      expect([daysOld(sandbox, b.a), daysOld(sandbox, b.b)]).toEqual([1, 3]);
      if (both) {
        plant(sandbox, [both], night.files);
        expect([daysOld(sandbox, both.a), daysOld(sandbox, both.b)]).toEqual([2, 2]);
      }
    } finally {
      removeSandbox(sandbox);
    }
  });
});

describe("feedbackArgs", () => {
  test("is a reason with the signal, and a fix adds each replace and with, as a flag with its value, and the source", () => {
    expect(feedbackArgs({ ref: "skills/x", signal: "positive", reason: "It helped." })).toEqual(["feedback", "skills/x", "--positive", "--reason", "It helped."]);
    expect(feedbackArgs({ ref: "skills/x", signal: "negative", reason: "Wrong.", fix: { replace: ["- a", "b"], with: ["- c", "d"], source: "npm help version" } })).toEqual([
      "feedback",
      "skills/x",
      "--negative",
      "--reason",
      "Wrong.",
      "--replace=- a",
      "--with=- c",
      "--replace=b",
      "--with=d",
      "--source=npm help version",
    ]);
  });
});

describe("hideEndpoint", () => {
  test("writes the endpoint as <MODEL_BASE_URL>, with or without a closing slash, and leaves other text alone", () => {
    expect(hideEndpoint("failed: http://localhost:8080/v1/chat/completions refused", "http://localhost:8080/v1")).toBe("failed: <MODEL_BASE_URL>/chat/completions refused");
    expect(hideEndpoint("failed: http://localhost:8080/v1/chat/completions", "http://localhost:8080/v1/")).toBe("failed: <MODEL_BASE_URL>/chat/completions");
    expect(hideEndpoint("nothing to hide", "http://localhost:8080/v1")).toBe("nothing to hide");
    expect(hideEndpoint("anything", "")).toBe("anything");
  });
});

describe("runCorpus", () => {
  test("runs the night as the nightly does: index, the feedback, improve with the default strategy, then the drain, then the proposals", async () => {
    const { ctx, folders, commands } = setup(IDS, good());
    const summary = await quiet(() => runCorpus("public", ctx, folders));
    const log = commands();
    expect(log[0]).toBe("index --full --format json");
    expect(log.filter((l) => l.startsWith("feedback ")).map((l) => l.split(" ")[1])).toEqual([refOf(period.path), "agents/playwright/playwright-explorer", "memories/playwright-networkidle-chat-widget", refOf(fix.path)]);
    expect(log.find((l) => l.startsWith("feedback skills/coding/git-release"))).toContain("--replace=(creates only a tag) --with=(creates commit + tag) --source=npm help version");
    const at = (prefix: string) => log.findIndex((l) => l.startsWith(prefix));
    expect(at("improve ")).toBeGreaterThan(at("feedback "));
    expect(log[at("improve ")]).toBe("improve --strategy default --require-engines --no-sync --timeout-ms 2700000 --json-to-stdout --format json");
    expect(at("proposal drain")).toBeGreaterThan(at("improve "));
    expect(log[at("proposal drain")]).toBe("proposal drain --promote --strategy default --yes --format json");
    expect(log.slice(at("proposal drain") + 1)).toEqual(["pending", "accepted", "rejected", "reverted"].map((s) => `proposal list --status ${s} --detail full --format json`));
    expect(summary).toMatchObject({ eval: "nightly", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_items: 6, n_planted: 6, improve_ok: true, skipped_processes: [] });
  });

  test("scores a good night: every item right, no harm, no failed call, and the timing, the drain and the pair pass in the summary", async () => {
    const { ctx, folders } = setup(IDS, good());
    await quiet(() => runCorpus("public", ctx, folders));
    const { dir, rows, summary } = resultsOf(folders);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    expect(summary.results_dir).toBeUndefined();
    expect(summary.metrics.items).toEqual({ n: 6, ok: 6, rate: 1 });
    expect(summary.metrics.harm).toEqual({ items: 0, outside_changed: 0, lessons_accepted: 0 });
    expect(summary.metrics.calls).toEqual({ n: 9, failures: 0 });
    expect(summary.metrics.by_kind).toEqual({ pair: { n: 1, ok: 1 }, reflect: { n: 2, ok: 2 }, distill: { n: 1, ok: 1 }, fix: { n: 1, ok: 1 }, untouched: { n: 1, ok: 1 } });
    expect(summary.drain).toEqual({ promoted: 2, rejected: 0, deferred: 3, failed: 0 });
    expect(summary.pair_pass).toEqual({ pairs_judged: 1, failed_judgments: 0, labels: { duplicate: 1 } });
    expect(summary.outside_changed).toEqual([]);
    expect(summary.calls_by.map((r: { model: string }) => r.model)).toEqual(["served-a", "served-b", "the-model"]);
    expect(Object.keys(summary.seconds)).toEqual(["index", "feedback", "improve", "drain", "total"]);
    expect(rows.map((r) => [r.id, r.ok])).toEqual(IDS.map((id) => [id, true]).sort((a, b) => IDS.indexOf(a[0] as string) - IDS.indexOf(b[0] as string)));
    expect(rows.find((r) => r.id === "duplicate-01")).toMatchObject({ kind: "pair", state: "retired a", detail: { judged_as: "duplicate" } });
    expect(rows.find((r) => r.id === "lesson-01")).toMatchObject({ state: "lesson pending, deferred/distill-review", detail: { gate: "deferred/distill-review", missing: [], forbidden: [] } });
    expect(rows.find((r) => r.id === "lesson-01")?.detail.lesson).toContain("polls every 20 seconds");
  });

  test("counts the harm of a bad night: an unsafe retirement, a note changed outside the items, a lesson accepted, a model call failed", async () => {
    const bad = good();
    const guard = (bad.drain as { apply: unknown[]; accept: string[] });
    guard.accept.push("p4");
    guard.apply.push({ path: "knowledge/stray.md", write: "a note nobody planted" }, { path: night.items.find((i) => i.id === "untouched-01")?.files[0] as string, write: "changed" }, { path: dup.b, remove: true });
    (bad.improve as { usageReport: { byProcessEngineModel: { failures: number }[] } }).usageReport.byProcessEngineModel[2]!.failures = 2;
    const { ctx, folders } = setup(IDS, bad);
    const summary = await quiet(() => runCorpus("public", ctx, folders));
    expect(summary.metrics.harm).toEqual({ items: 3, outside_changed: 1, lessons_accepted: 1 }); // the pair lost both notes, the lesson was accepted, the note changed
    expect(summary.outside_changed).toEqual(["knowledge/stray.md"]);
    expect(summary.metrics.calls).toEqual({ n: 9, failures: 2 });
    expect(summary.metrics.items.ok).toBeLessThan(6);
  });

  test("writes the endpoint as <MODEL_BASE_URL> wherever akm's errors name it in a row", async () => {
    const leaky = good();
    (leaky.improve as { actions: unknown[] }).actions.unshift({ ref: "agents/playwright/playwright-explorer", mode: "reflect-failed", result: { reason: "provider_error", error: "request to http://localhost:1/v1/chat/completions failed" } });
    const { ctx, folders } = setup(IDS, leaky);
    await quiet(() => runCorpus("public", ctx, folders));
    const text = readFileSync(join(resultsOf(folders).dir, "samples.jsonl"), "utf8");
    expect(text).not.toContain("localhost:1");
    expect(text).toContain("request to <MODEL_BASE_URL>/chat/completions failed");
  });

  test("plants only the items of a limit, taking the first of each kind in turn", async () => {
    const { ctx, folders, commands } = setup(IDS, good());
    const summary = await quiet(() => runCorpus("public", { ...ctx, limit: 3 }, folders));
    expect(summary).toMatchObject({ limit: 3, n_items: 6, n_planted: 3 });
    expect(resultsOf(folders).rows.map((r) => r.id)).toEqual(["duplicate-01", "description-period-01", "lesson-01"]);
    expect(commands().filter((l) => l.startsWith("feedback ")).map((l) => l.split(" ")[1])).toEqual([refOf(period.path), "memories/playwright-networkidle-chat-widget"]);
  });

  test("ends with akm's own message when improve fails, with the endpoint hidden, and leaves nothing behind", async () => {
    const before = readdirSync(tmpdir()).filter((f) => f.startsWith("akm-eval-nightly-test-")).length;
    const { ctx, folders } = setup(IDS, { improveFails: "unreachable: http://localhost:1/v1/chat/completions refused" });
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("akm improve failed (exit 78): unreachable: <MODEL_BASE_URL>/chat/completions refused");
    expect(readdirSync(tmpdir()).filter((f) => f.startsWith("akm-eval-nightly-test-")).length).toBe(before);
  });

  test("ends with akm's message when a step before improve fails, and says when akm reports the run as not ok", async () => {
    const { ctx, folders } = setup(IDS, { indexFails: "no index" });
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow('akm index failed (exit 70): {"ok":false,"error":"no index"}');
    const notOk = good();
    (notOk.improve as { ok: boolean }).ok = false;
    const second = setup(IDS, notOk);
    expect((await quiet(() => runCorpus("public", second.ctx, second.folders))).improve_ok).toBe(false);
  });

  test("removes every sandbox it makes", async () => {
    const before = readdirSync(tmpdir()).filter((f) => f.startsWith("akm-eval-nightly-test-")).length;
    const { ctx, folders } = setup(IDS, good());
    await quiet(() => runCorpus("public", ctx, folders));
    expect(readdirSync(tmpdir()).filter((f) => f.startsWith("akm-eval-nightly-test-")).length).toBe(before);
  });

  test("gives akm what it needs: semantic search and the deterministic embedder (the fake refuses to index without them)", async () => {
    const { ctx, folders } = setup(IDS, good());
    await expect(quiet(() => runCorpus("public", ctx, folders))).resolves.toBeDefined();
  });
});
