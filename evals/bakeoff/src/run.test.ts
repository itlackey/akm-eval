import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import { fail } from "../../../lib/cli.ts";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { manifestProblems, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { loadConfigPatch, parseOverrides } from "../../../lib/akm/overrides.ts";
import { FAKE_AKM } from "./fakes.ts";
import { type Case, assetsSha256, configFor, loadCases, selectCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { MIN_AKM, runCorpus } from "./run.ts";

const dirs: string[] = [];
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_PLAN: process.env.FAKE_PLAN, FAKE_LOG: process.env.FAKE_LOG, MODEL_API_KEY: process.env.MODEL_API_KEY };
const sandboxes = (): string[] => readdirSync(tmpdir()).filter((n) => n.startsWith("akm-eval-bakeoff-"));
const before = new Set(sandboxes());
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const MEMORY = "---\ndescription: Retry policy.\nupdated: 2026-03-05\n---\n\nOn 2026-03-04 we found that retries back off at 2 seconds. After 3 failures the job parks.\n";
const LESSON = "---\ntags: [queue]\n---\n\nBefore replacing a worker image, pause publishers and drain the workers.\n";
const event = (type: string, content: unknown, i: number) => JSON.stringify({ parentUuid: null, type, message: { role: type, content }, uuid: `00000000-0000-4000-8000-00000000000${i}`, timestamp: `2026-03-05T15:0${i}:00.000Z`, sessionId: "s1" });
const SESSION = `${event("user", "Promote app-7 after the canary.", 0)}\n${event("assistant", [{ type: "text", text: "Promoted app-7." }], 1)}\n`;

/** The file akm writes for a derived memory. */
const derived = (over: Record<string, unknown> = {}): string => {
  const d = { title: "Retry backoff", description: "Retries back off at two seconds.", tags: ["retry", "backoff", "queue"], searchHints: ["retry delay", "backoff seconds", "job parks"], content: "On 2026-03-04 retries wait 2 seconds. After 3 failures the job parks.", ...over };
  const list = (xs: unknown) => (xs as string[]).map((x) => `  - ${x}`).join("\n");
  return `---\ninferred: true\ncaptureMode: background\nsource: memories/retry-backoff\ndescription: ${d.description}\ntags:\n${list(d.tags)}\nsearchHints:\n${list(d.searchHints)}\ntitle: ${d.title}\nderivedFrom: retry-backoff\nupdated: 2026-10-12\n---\n\n# ${d.title}\n\n${d.content}\n`;
};
const enriched = (over: Record<string, unknown> = {}): string => {
  const d = { tags: ["retries", "backoff"], description: "Retries back off at 2 seconds.", observed_at: "2026-03-04", ...over };
  return `---\ndescription: ${d.description}\ntags:\n${(d.tags as string[]).map((t) => `  - ${t}`).join("\n")}\n${d.observed_at ? `observed_at: ${d.observed_at}\n` : ""}captureMode: hot\ntype: memory\nupdated: 2026-10-12\n---\nOn 2026-03-04 we found that retries back off at 2 seconds.\n`;
};
const repaired = `---\ntags:\n  - queue\ndescription: Pause publishers and drain the workers before replacing a worker image.\nwhen_to_use: Use when you replace the worker image in a release.\ntype: lesson\n---\n\nBefore replacing a worker image, pause publishers and drain the workers.\n`;
const asset = `---\nname: claude-session-2026-03-05-s1\ntype: session\nharness: claude\nsession_id: s1\ntags:\n  - session\n  - claude\n  - release\ndescription: The session promoted app-7 to production after the canary request passed and the health checks stayed green.\n---\n\n## Summary\n\nThe session promoted app-7 to production after the canary request passed and the health checks stayed green.\n\n## Key topics\n\n- app-7\n- canary\n`;

type Spec = { id: string; process: Case["process"]; files: Record<string, string>; expected: Case["expected"] };

const SPECS: Spec[] = [
  { id: "infer-ok", process: "memory-inference", files: { "memories/retry-backoff.md": MEMORY }, expected: { required: ["retries", "2 seconds"], date: "2026-03-04", forbidden: ["2025-01-01"] } },
  { id: "enrich-ok", process: "remember-enrich", files: { "memories/retry-backoff.md": MEMORY }, expected: { observed_at: "2026-03-04", keywords: ["retries", "backoff"] } },
  { id: "repair-ok", process: "schema-repair", files: { "lessons/pause-publishers.md": LESSON }, expected: { keywords: ["publishers"], trigger: ["replace"] } },
  { id: "summary-ok", process: "session-summary", files: { "sessions/-home-dev-app/s1.jsonl": SESSION }, expected: { required: ["app-7"], topics: ["app-7"] } },
  { id: "promote-ok", process: "consolidate-promote", files: { "memories/signed.md": "---\ndescription: Signing.\n---\nArtifacts are signed.\n", "memories/pref.md": "---\ncaptureMode: hot\n---\nKeep messages short.\n", "memories/other.md": "---\ndescription: Other.\n---\nSomething current.\n" }, expected: { promote: ["memories/signed"], protected: ["memories/pref"], strict: true } },
];

const PLAN = {
  infer: { "retry-backoff": { derived: derived() } },
  enrich: { "retry-backoff": { file: enriched() } },
  repair: { "lessons/pause-publishers": { outcome: "queued", content: repaired } },
  session: { s1: { asset } },
  promote: { refs: ["memories/signed"] },
};

/** A corpus folder, a fake akm and a results folder in a temp folder. `specs` are the cases, `plan` what the fake does. */
function setup(specs: Spec[], plan: object) {
  const root = mkdtempSync(join(tmpdir(), "bakeoff-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  for (const s of specs) for (const [path, text] of Object.entries(s.files)) {
    mkdirSync(dirname(join(assets, path)), { recursive: true });
    writeFileSync(join(assets, path), text);
  }
  writeFileSync(join(assets, "cases.json"), JSON.stringify(specs.map((s) => ({ id: s.id, process: s.process, files: Object.keys(s.files), expected: s.expected }))));
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  process.env.AKM_BIN = commandLine(["bun", script]);
  process.env.FAKE_PLAN = JSON.stringify(plan);
  process.env.FAKE_LOG = join(root, "calls.jsonl");
  process.env.MODEL_API_KEY = "model-secret";
  const corpus: ResolvedCorpus = { name: "public", folder: assets, rewrite: false, seed: null, flag: "--corpus public" };
  const ctx = { baseUrl: "http://localhost:9/v1", model: "the-model", hasKey: true, version: "0.9.99-test", label: "t" };
  const calls = () => (existsSync(process.env.FAKE_LOG as string) ? readFileSync(process.env.FAKE_LOG as string, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
  return { corpus, ctx, calls, results: join(root, "results"), root };
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

const samplesOf = (summary: { results_dir: string }): any[] => readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

/**
 * The keys of the summary.json that bakeoff wrote before it was a spec of lib/run.ts: its Summary interface in the committed run.ts, without results_dir, which is
 * returned and not written. The website, scripts/ledger and scripts/compare read them, so none may go. A run adds concurrency and timeout_ms to them. Bakeoff has no
 * strategy, so it never had a `strategy`.
 */
const SUMMARY_KEYS = ["eval", "corpus", "corpus_folder", "label", "date", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "limit", "process", "config_patch", "config", "engine", "assets_sha256", "seed", "status", "aborted_reason", "n_cases", "n_run", "n_scored", "n_errored", "timeouts", "served", "metrics", "model_calls", "semantic_verification", "manifest"];

describe("runCorpus", () => {
  test("runs the akm command of each process, scores what akm wrote, and records the raw output of every case", async () => {
    const { corpus, ctx, calls, results } = setup(SPECS, PLAN);
    const summary = await quiet(() => runCorpus(corpus, ctx, results));
    expect(summary).toMatchObject({ eval: "bakeoff", corpus: "public", seed: null, model: "the-model", akm_version: "0.9.99-test", status: "complete", aborted_reason: null, n_cases: 5, n_run: 5, n_scored: 5, n_errored: 0, timeouts: 0 });
    expect(summary.metrics.valid_output).toEqual({ n: 5, passed: 5, rate: 1 });
    expect(summary.metrics.case_pass).toEqual({ n: 5, passed: 5, rate: 1 });
    expect(Object.keys(summary.metrics.by_process)).toEqual(["memory-inference", "remember-enrich", "schema-repair", "session-summary", "consolidate-promote"]);
    expect(summary.served).toEqual({ "served-model": 3 }); // memory inference, schema repair and consolidate report the model that answered
    const rows = samplesOf(summary);
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual(SPECS.map((s) => [s.id, "output", true]));
    // the raw output the scorer reads is in the row, under the names rawOf reads
    expect(rows[0].derived).toBe(derived());
    expect(rows[1].written).toBe(enriched());
    expect(rows[2].proposal).toBe(repaired);
    expect(rows[3].asset).toBe(asset);
    expect(rows[4].promoted).toEqual(["memories/signed"]);
    expect(rows[4].planned).toEqual(["memories/signed"]);
    for (const row of rows) expect("raw" in (MEASUREMENT.rawOf(row) as object)).toBe(true);
    // the commands are those of the README
    const args = calls().map((c) => c.args.join(" "));
    expect(args).toEqual([
      "index --format json",
      "improve --strategy bakeoff-memory-inference --no-sync --require-engines --json-to-stdout --format json",
      "remember --enrich --name retry-backoff --format json",
      "index --format json",
      "improve lessons/pause-publishers --strategy bakeoff-schema-repair --no-sync --require-engines --json-to-stdout --format json",
      "proposal list --status pending --detail full --format json",
      `proposal extract --type claude --location ${calls().find((c) => c.args[1] === "extract").projects} --session-id s1 --strategy bakeoff-session-summary --format json`,
      "index --format json",
      "improve --strategy bakeoff-consolidate-promote --no-sync --require-engines --json-to-stdout --format json",
      "proposal list --status pending --detail full --format json",
    ]);
    // akm looks for the session where the sandbox put it, and the sandbox is not the caller's folder
    expect(calls().find((c) => c.args[1] === "extract").projects).toMatch(/akm-eval-bakeoff-[^/]+\/projects$/);
  });

  test("gives akm the text of the memory without its frontmatter, the model at temperature 0 with thinking off, and the key by reference", async () => {
    const { corpus, ctx, calls, results } = setup(SPECS.slice(0, 2), PLAN);
    const summary = await quiet(() => runCorpus(corpus, ctx, results));
    const enrich = calls().find((c) => c.args[0] === "remember");
    expect(enrich.stdin).toBe("On 2026-03-04 we found that retries back off at 2 seconds. After 3 failures the job parks.");
    expect(enrich).toMatchObject({ model: "the-model", temperature: 0, thinking: false, autonomy: true, key: "model-secret" });
    // the sandbox is not the caller's bundle, and it is gone when the case ends
    expect(dirname(enrich.bundle).startsWith(join(tmpdir(), "akm-eval-bakeoff-"))).toBe(true);
    expect(sandboxes().filter((n) => !before.has(n))).toEqual([]);
    // no summary or sample holds the key, and the config names it by reference
    const text = readFileSync(join(summary.results_dir, "summary.json"), "utf8") + readFileSync(join(summary.results_dir, "samples.jsonl"), "utf8");
    expect(text).not.toContain("model-secret");
    expect((summary.config as any).engines.bakeoff.apiKey).toBe("$MODEL_API_KEY");
    expect((summary.config as any).engines.bakeoff.endpoint).toBe("<MODEL_BASE_URL>/chat/completions");
    expect(summary.engine).toMatchObject({ model: "the-model", endpoint: "http://localhost:9", temperature: 0, enableThinking: false });
  });

  test("writes a manifest that names the collector and the scorer of the lock, the digest of each case and which cases were scored", async () => {
    const { corpus, ctx, results } = setup(SPECS, { ...PLAN, session: { s1: { none: true } } });
    const summary = await quiet(() => runCorpus(corpus, ctx, results));
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(manifestProblems(summary.manifest)).toEqual([]);
    expect(readManifest(JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"))).kind).toBe("manifest");
    expect(summary.manifest).toMatchObject({ eval: "bakeoff", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector, settings: { strategy: null, config_patch_sha256: null, timeout_ms: 900_000, seed: null } }); // the effective timeout: it used to be recorded as null
    expect(Object.keys(summary.manifest.cases)).toEqual(SPECS.map((s) => s.id));
    expect(summary.manifest.completion).toEqual({ selected: SPECS.map((s) => s.id), scored: SPECS.map((s) => s.id), errored: [] });
    expect(summary.manifest.akm).toMatchObject({ version: "0.9.99-test" });
    expect(summary.assets_sha256).toBe(assetsSha256(corpus.folder));
    expect(summary.corpus_folder).toBeNull(); // a folder outside the repository is not recorded
  });

  test("scores the plan of consolidate and not the queue, since akm drops a promotion of its own and says why", async () => {
    const plan = { ...PLAN, promote: { refs: ["memories/signed"], planned: ["memories/signed", "memories/pref"], skipped: { "memories/pref": "promote_source_too_small" } } };
    const { corpus, ctx, results } = setup([SPECS[4]] as Spec[], plan);
    const summary = await quiet(() => runCorpus(corpus, ctx, results));
    const [row] = samplesOf(summary);
    expect(row).toMatchObject({ outcome: "output", planned: ["memories/signed", "memories/pref"], promoted: ["memories/signed"], skipped: { "memories/pref": "promote_source_too_small" }, correct: false });
    expect(row.checks).toEqual({ "promotes memories/signed": true, "leaves protected memories/pref untouched": false, "no extra or missing promotions": false, "promotes only memories of the pool": true });
  });

  test("an unusable reply is scored as a failure, and a case that did not run to the end is an error left out of the counts", async () => {
    const plan = {
      ...PLAN,
      infer: { "retry-backoff": { skip: true } }, // akm skipped the memory: the reply was not a derived memory
      enrich: { "retry-backoff": { file: enriched({ tags: [] }), say: "Warning: --enrich received invalid JSON from the LLM. Writing memory without enrichment." } },
      repair: { "lessons/pause-publishers": { crash: true } },
      session: { s1: { none: true } }, // akm wrote no session asset and said nothing
      promote: { refs: [], failedChunks: 1, warnings: ["Chunk 1: invalid plan from AI — skipping."] },
    };
    const { corpus, ctx, results } = setup(SPECS, plan);
    const summary = await quiet(() => runCorpus(corpus, ctx, results));
    const rows = samplesOf(summary);
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual([["infer-ok", "unusable", false], ["enrich-ok", "unusable", false], ["repair-ok", "error", null], ["summary-ok", "unusable", false], ["promote-ok", "unusable", false]]);
    expect(rows[0].reason).toContain("akm wrote no derived memory");
    expect(rows[1].reason).toContain("invalid JSON");
    expect(rows[2].error).toContain("akm improve failed (exit 70)");
    expect(rows[3].reason).toContain("no session asset");
    expect(rows[4].reason).toBe("Chunk 1: invalid plan from AI — skipping.");
    expect(summary).toMatchObject({ n_run: 5, n_scored: 4, n_errored: 1 });
    expect(summary.metrics.valid_output).toEqual({ n: 4, passed: 0, rate: 0 });
    expect(summary.metrics.by_process["schema-repair"]).toMatchObject({ n: 0, outcomes: { output: 0, unusable: 0, error: 1 } });
    expect(summary.manifest.completion).toMatchObject({ scored: ["infer-ok", "enrich-ok", "summary-ok", "promote-ok"], errored: ["repair-ok"] });
  });

  test("a call that failed is an error, and a skipped session is one", async () => {
    const plan = {
      ...PLAN,
      infer: { "retry-backoff": { provider: true } },
      enrich: { "retry-backoff": { file: enriched({ tags: [] }), say: "Warning: --enrich failed (LLM provider error (500) http://localhost:9/v1/chat/completions: upstream failure). Writing memory without enrichment." } },
      session: { s1: { skip: "llm_unavailable" } },
      promote: { refs: [], failedChunks: 1, provider: true, warnings: ["LLM provider error (500) http://localhost:9/v1/chat/completions: upstream failure"] },
    };
    const { corpus, ctx, results } = setup([SPECS[0], SPECS[1], SPECS[3], SPECS[4]] as Spec[], plan);
    const summary = await quiet(() => runCorpus(corpus, ctx, results));
    const rows = samplesOf(summary);
    expect(rows.map((r) => [r.id, r.outcome])).toEqual([["infer-ok", "error"], ["enrich-ok", "error"], ["summary-ok", "error"], ["promote-ok", "error"]]);
    expect(rows[1].error).toContain("--enrich failed");
    expect(rows[1].error).not.toContain("http://localhost:9"); // the endpoint is written as <MODEL_BASE_URL>
    expect(rows[1].error).toContain("<MODEL_BASE_URL>/chat/completions");
    expect(rows[2].error).toBe("akm skipped the session: llm_unavailable");
    expect(summary.n_errored).toBe(4);
  });

  test("an akm command that runs past its timeout is an error, marked as a timeout", async () => {
    const { corpus, ctx, results } = setup([SPECS[0]] as Spec[], { infer: { "retry-backoff": { slow: true } } });
    const summary = await quiet(() => runCorpus(corpus, { ...ctx, timeoutMs: 1500 }, results));
    const [row] = samplesOf(summary);
    expect(row).toMatchObject({ outcome: "error", correct: null, timed_out: true });
    expect(row.error).toMatch(/timed out after 1\.5s/);
    expect(summary).toMatchObject({ n_errored: 1, timeouts: 1 });
    expect(summary.manifest.settings.timeout_ms).toBe(1500);
  });

  test("--process and --limit pick the cases, and the summary says which", async () => {
    const { corpus, ctx, results } = setup(SPECS, PLAN);
    const one = await quiet(() => runCorpus(corpus, { ...ctx, process: "schema-repair" }, results));
    expect(one).toMatchObject({ process: "schema-repair", n_cases: 5, n_run: 1 });
    expect(Object.keys(one.manifest.cases)).toEqual(["repair-ok"]);
    const short = await quiet(() => runCorpus(corpus, { ...ctx, limit: 3, label: "short" }, results));
    expect(short).toMatchObject({ limit: 3, process: null, n_run: 3 });
    expect(Object.keys(short.manifest.cases)).toEqual(["infer-ok", "enrich-ok", "repair-ok"]);
  });

  test("a config patch is merged into the config and recorded with its digest", async () => {
    const { corpus, ctx, calls, root, results } = setup([SPECS[0]] as Spec[], PLAN);
    const file = join(root, "patch.json");
    writeFileSync(file, JSON.stringify({ engines: { bakeoff: { temperature: 0.3 } } }));
    const configPatch = loadConfigPatch(file, root);
    const summary = await quiet(() => runCorpus(corpus, { ...ctx, overrides: { strategy: "", configPatch } }, results));
    expect(calls().find((c) => c.args[0] === "improve")?.temperature).toBe(0.3);
    expect(summary.config_patch).toEqual({ path: configPatch.path, sha256: configPatch.sha256 });
    expect(summary.manifest.settings.config_patch_sha256).toBe(configPatch.sha256);
    expect(summary.engine.temperature).toBe(0.3);
  });

  test("--semantic merges akm's native embedder into the config, with the config patch, and the run records no strategy of any kind", () => {
    const { ctx } = setup([SPECS[0]] as Spec[], PLAN);
    const overrides = parseOverrides({ semantic: true }, "", fail);
    const config = configFor({ ...ctx, overrides });
    expect(config).toMatchObject({ semanticSearchMode: "auto", embedding: { localModel: "Xenova/bge-small-en-v1.5" }, defaults: { llmEngine: "bakeoff" } });
    expect(configFor(ctx).semanticSearchMode).toBe("off"); // without it semantic search is off, so consolidate's pair pass finds no pairs
    expect(overrides).toMatchObject({ strategy: "", configPatch: { path: "--semantic" } });
  });

  test("gives the engine the provider kind of the context, in the config akm reads and in the summary, and openai without one", async () => {
    const { corpus, ctx, results } = setup([SPECS[1]] as Spec[], PLAN);
    const other = await quiet(() => runCorpus(corpus, { ...ctx, provider: "groq", label: "groq" }, results));
    expect((other.config as any).engines.bakeoff.provider).toBe("groq");
    expect((await quiet(() => runCorpus(corpus, ctx, results))).config).toMatchObject({ engines: { bakeoff: { provider: "openai" } } });
  });

  test("a corpus with no case for the process is refused before anything is made, with the process in the message", async () => {
    const { corpus, ctx, results } = setup([SPECS[0], SPECS[1]] as Spec[], PLAN);
    await expect(quiet(() => runCorpus(corpus, { ...ctx, process: "session-summary" }, results))).rejects.toThrow("no case to run: the corpus has none for session-summary");
    expect(existsSync(results)).toBe(false); // no results folder, no akm call
  });

  test("the summary has every key it has always had, which the website, scripts/ledger and scripts/compare read, and concurrency and timeout_ms besides: and no strategy", async () => {
    const { corpus, ctx, results } = setup(SPECS, PLAN);
    const summary = await quiet(() => runCorpus(corpus, ctx, results));
    const stored = JSON.parse(readFileSync(join(summary.results_dir, "summary.json"), "utf8"));
    expect(Object.keys(stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms"].sort());
    expect(Object.keys(summary).sort()).toEqual([...Object.keys(stored), "results_dir"].sort()); // what runCorpus returns also names the folder, which the file does not
    expect(stored).toMatchObject({ process: null, concurrency: 1, timeout_ms: 900_000, timeouts: 0 });
    expect("strategy" in stored).toBe(false);
  });
});

describe("the minimum akm", () => {
  test("is the release the commands were checked against", () => {
    expect(MIN_AKM).toBe("0.9.26");
  });
});

describe("selection", () => {
  test("a short run takes the first case of each process in turn, in corpus order", () => {
    const cases = SPECS.flatMap((s) => [s, { ...s, id: `${s.id}-2` }]).map((s) => ({ id: s.id, process: s.process }));
    expect(selectCases(cases, 5).map((c) => c.id)).toEqual(["infer-ok", "enrich-ok", "repair-ok", "summary-ok", "promote-ok"]);
    expect(selectCases(cases, 7).map((c) => c.id)).toEqual(["infer-ok", "infer-ok-2", "enrich-ok", "enrich-ok-2", "repair-ok", "summary-ok", "promote-ok"]);
    expect(selectCases(cases, undefined, "session-summary").map((c) => c.id)).toEqual(["summary-ok", "summary-ok-2"]);
  });
});

describe("the public corpus", () => {
  test("loads, and every case has the files and the refs it names", () => {
    const cases = loadCases(join(import.meta.dir, "..", "assets"));
    expect(cases.length).toBe(40);
    expect(new Set(cases.map((c) => c.process))).toEqual(new Set(["memory-inference", "remember-enrich", "schema-repair", "session-summary", "consolidate-promote"]));
  });
});

describe("the command", () => {
  const EVAL = join(import.meta.dir, "..");
  const REPO = join(EVAL, "..", "..");
  const model = { MODEL_BASE_URL: "http://127.0.0.1:9/v1", MODEL_NAME: "m", MODEL_API_KEY: "" };

  /** The run, started in a folder of its own, since Bun loads the .env of its working folder. akm is not there, so a run that gets past its checks stops at the version probe. */
  function run(args: string[]) {
    const cwd = mkdtempSync(join(tmpdir(), "bakeoff cmd-"));
    dirs.push(cwd);
    const p = Bun.spawnSync(["bun", join(EVAL, "src", "run.ts"), ...args], { cwd, env: { ...process.env, ...model, AKM_BIN: commandLine([join(cwd, "no-akm")]) }, stdout: "pipe", stderr: "pipe" });
    return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
  }

  test("--process takes one of the five processes, and says which are there when it is given another, before akm is asked anything", () => {
    for (const process of ["memory-inference", "remember-enrich", "schema-repair", "session-summary", "consolidate-promote"]) expect(run(["--process", process]).err).toContain("could not run");
    const done = run(["--process", "nope"]);
    expect(done.code).toBe(2);
    expect(done.err.trim()).toBe('bakeoff: --process must be one of memory-inference, remember-enrich, schema-repair, session-summary, consolidate-promote, not "nope"');
  });

  test("lists --process, --semantic and --config-patch and has no --strategy: each process has its own, so the flag is refused", () => {
    const help = run(["--help"]).out;
    expect(help).toContain("[--process NAME]");
    expect(help).toMatch(/--process NAME +the process to run, one of memory-inference/);
    expect(help).toContain("  --semantic ");
    expect(help).toContain("  --config-patch ");
    expect(help).not.toContain("--strategy");
    expect(help).not.toMatch(/--yes|--embedder/);
    const refused = run(["--strategy", "other"]);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("Unknown option '--strategy'");
    expect(run(["--semantic", "--config-patch", join(EVAL, "assets", "cases.json")]).err).not.toContain("Unknown option"); // both are taken, and the run goes on to its checks
  });

  test("--concurrency and --timeout-ms reach the run through bakeoff's flags: every case has its row, akm is probed once, and both are recorded", () => {
    const tree = mkdtempSync(join(tmpdir(), "bakeoff tree-"));
    dirs.push(tree);
    const keep = (path: string) => !path.includes("node_modules");
    cpSync(join(REPO, "lib"), join(tree, "lib"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "src"), join(tree, "evals", "bakeoff", "src"), { recursive: true, filter: keep });
    cpSync(join(EVAL, "assets"), join(tree, "evals", "bakeoff", "assets"), { recursive: true }); // so that the run writes its results here and never in the repository
    const script = join(tree, "fake-akm.ts");
    writeFileSync(script, FAKE_AKM);
    const log = join(tree, "calls.jsonl");
    const env = { ...process.env, ...model, AKM_BIN: commandLine(["bun", script]), FAKE_LOG: log, FAKE_PLAN: "{}" };
    const p = Bun.spawnSync(["bun", join(tree, "evals", "bakeoff", "src", "run.ts"), "--corpus", "public", "--limit", "5", "--concurrency", "3", "--timeout-ms", "20000", "--label", "flags"], { cwd: tree, env, stdout: "pipe", stderr: "pipe" });
    expect([p.exitCode, p.stderr.toString()]).toEqual([0, ""]);
    const results = join(tree, "evals", "bakeoff", "results");
    const folder = join(results, readdirSync(results).find((name) => name.endsWith("-flags")) as string);
    const stored = JSON.parse(readFileSync(join(folder, "summary.json"), "utf8"));
    const rows = readFileSync(join(folder, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(Object.keys(stored).sort()).toEqual([...SUMMARY_KEYS, "concurrency", "timeout_ms", "wall_seconds"].sort()); // wall_seconds is added by --repeat's runner, as it always was
    expect(stored).toMatchObject({ concurrency: 3, timeout_ms: 20_000, n_run: 5, status: "complete", process: null });
    expect(stored.manifest.settings.timeout_ms).toBe(20_000);
    expect(rows.map((r) => r.process).sort()).toEqual(["consolidate-promote", "memory-inference", "remember-enrich", "schema-repair", "session-summary"]); // the first case of each process, every one with a row
    expect(rows.map((r) => r.id).sort()).toEqual([...stored.manifest.completion.selected].sort());
    const calls = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(calls.filter((c) => c.args[0] === "--version")).toHaveLength(1);
  }, 60_000);
});
