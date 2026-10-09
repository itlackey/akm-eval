import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfigPatch } from "../../../lib/akm/overrides.ts";
import { type Case, atLeast, inject, parseCases, refOf } from "./lib.ts";
import { MIN_AKM, runCorpus } from "./run.ts";

const dirs: string[] = [];
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_PLAN: process.env.FAKE_PLAN, FAKE_LOG: process.env.FAKE_LOG, MODEL_API_KEY: process.env.MODEL_API_KEY };
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/**
 * An akm that keeps its state in the sandbox, logs every call to FAKE_LOG, and answers as FAKE_PLAN says for the ref it is
 * given: what reflect did, and the proposal it made. It refuses to run reflect before feedback is recorded.
 */
const FAKE_AKM = `
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const args = process.argv.slice(2);
const [cmd, ...rest] = args;
const plan = JSON.parse(process.env.FAKE_PLAN ?? "{}");
const stateFile = process.env.AKM_STATE_DIR + "/fake.json";
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { fed: [] };
const save = () => writeFileSync(stateFile, JSON.stringify(state));
const out = (o) => console.log(JSON.stringify(o));
const note = (ref) => [ref + ".md", ref + "/SKILL.md"].map((p) => process.env.AKM_BUNDLE_DIR + "/" + p).find((p) => existsSync(p));
const config = JSON.parse(readFileSync(process.env.AKM_CONFIG_DIR + "/config.json", "utf8"));
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, bundle: process.env.AKM_BUNDLE_DIR, cwd: process.cwd(), model: config.engines?.reflect?.model, key: process.env.MODEL_API_KEY ?? null, note: rest[0] && note(rest[0]) ? readFileSync(note(rest[0]), "utf8") : null }) + "\\n");
if (cmd === "--version") console.log("akm 0.9.99-test");
else if (cmd === "index") out({ ok: true });
else if (cmd === "feedback") { state.fed.push(rest[0]); save(); out({ ok: true, ref: rest[0], signal: "negative" }); }
else if (cmd === "improve") {
  const ref = rest[0];
  if (!state.fed.includes(ref)) { console.error("no feedback was recorded for " + ref); process.exit(2); }
  const p = plan[ref] ?? { outcome: "none" };
  const action = (mode, result) => out({ ok: true, actions: [{ ref, mode, result }], usageReport: { byProcessEngineModel: [{ process: "reflect", engine: "reflect", model: p.served ?? "served-model", calls: 1 }] } });
  if (p.outcome === "crash") { console.error(JSON.stringify({ error: "boom", code: "INTERNAL" })); process.exit(70); }
  else if (p.outcome === "proposal") { state.proposal = { id: "prop-1", source: "reflect", ref, content: p.content }; save(); action("reflect", { ok: true, proposal: { id: "prop-1" } }); }
  else if (p.outcome === "none") action("reflect-skipped", { ok: false, reason: "no_change", error: "identical" });
  else if (p.outcome === "refused") action("reflect-failed", { ok: false, reason: "quality_rejected", error: "placeholder_added" });
  else if (p.outcome === "unusable") action("reflect-failed", { ok: false, reason: "parse_error", error: "not JSON" });
  else if (p.outcome === "provider") action("reflect-failed", { ok: false, reason: "non_zero_exit", error: "HTTP 500 from " + config.engines.reflect.endpoint });
  else if (p.outcome === "two") { state.proposal = { id: "prop-1", source: "reflect", ref, content: "x" }; state.two = true; save(); action("reflect", { ok: true, proposal: { id: "prop-1" } }); }
}
else if (cmd === "proposal" && rest[0] === "list") out({ totalCount: state.proposal ? 1 : 0, proposals: state.proposal ? [{ id: state.proposal.id, ref: "bundle//" + state.proposal.ref, source: state.proposal.source }, ...(state.two ? [{ id: "prop-2", ref: "bundle//" + state.proposal.ref, source: "reflect" }] : [])] : [] });
else if (cmd === "proposal" && rest[0] === "show") out({ proposal: { id: rest[1], ...(args.includes("full") ? { payload: { content: state.proposal.content } } : {}) } });
else { console.error("unexpected " + args.join(" ")); process.exit(1); }
`;

const NOTE = `---
name: key-rotation
type: knowledge
description: Explains how to rotate the signing keys of the example service without downtime and how to verify the new key.
when_to_use: Use when a signing key is about to expire or may have leaked.
updated: 2026-01-02
---

# Key rotation

Rotate the keys in staging first, then promote the change to production.
`;

const make = (id: string, cls: Case["class"], path: string, extra: Partial<Case> = {}): Case => {
  const source = inject(cls, NOTE) as string;
  const fix = cls === "when-to-use-missing" ? "when_to_use" : undefined;
  return { id, class: cls, path, source, feedback: `Feedback for ${id}.`, defect: "d", correct: "c", ...(fix ? { fix } : {}), allow: fix ? [fix] : [], ...extra };
};

/** Assets and a fake akm in a temp folder. `plan` says what the fake does for each ref. */
function setup(cases: Case[], plan: Record<string, object>) {
  const root = mkdtempSync(join(tmpdir(), "reflect-run-"));
  dirs.push(root);
  const assets = join(root, "assets");
  mkdirSync(assets);
  writeFileSync(join(assets, "cases.jsonl"), `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  process.env.AKM_BIN = `bun ${script}`;
  process.env.FAKE_PLAN = JSON.stringify(plan);
  process.env.FAKE_LOG = join(root, "calls.jsonl");
  process.env.MODEL_API_KEY = "model-secret";
  const ctx = { baseUrl: "http://localhost:9/v1", model: "the-model", hasKey: true, version: "0.9.99-test", label: "t" };
  const calls = () => (existsSync(process.env.FAKE_LOG as string) ? readFileSync(process.env.FAKE_LOG as string, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : []);
  return { ctx, calls, folders: { assets, results: join(root, "results") } };
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
  const cases = [
    make("fix-ok", "when-to-use-missing", "knowledge/a.md"),
    make("fix-none", "when-to-use-missing", "knowledge/b.md"),
    make("keep-ok", "retrieval-miss", "skills/c/SKILL.md"),
    make("keep-churn", "retrieval-miss", "knowledge/d.md"),
    make("refused", "retrieval-miss", "knowledge/e.md"),
    make("unusable", "retrieval-miss", "knowledge/f.md"),
    make("provider", "retrieval-miss", "knowledge/g.md"),
    make("crash", "retrieval-miss", "knowledge/h.md"),
  ];
  const plan = {
    "knowledge/a": { outcome: "proposal", content: NOTE },
    "knowledge/b": { outcome: "none", served: "other-name" },
    "skills/c": { outcome: "none" },
    "knowledge/d": { outcome: "proposal", content: NOTE.replace("Use when", "Use if") },
    "knowledge/e": { outcome: "refused" },
    "knowledge/f": { outcome: "unusable" },
    "knowledge/g": { outcome: "provider" },
    "knowledge/h": { outcome: "crash" },
  };

  test("scores each outcome, keeps the unusable and the refused as misses, and leaves an error out of the counts", async () => {
    const { ctx, folders } = setup(cases, plan);
    const summary = await quiet(() => runCorpus("public", ctx, folders));
    expect(summary).toMatchObject({ eval: "reflect", corpus: "public", model: "the-model", akm_version: "0.9.99-test", n_cases: 8, n_run: 8, n_scored: 6, n_errored: 2 });
    expect(summary.metrics.defects).toEqual({ n: 2, correct: 1, rate: 0.5 });
    expect(summary.metrics.controls).toEqual({ n: 4, correct: 1, rate: 0.25 });
    expect(summary.metrics.classes["retrieval-miss"]).toMatchObject({ n: 4, correct: 1, outcomes: { none: 1, proposal: 1, refused: 1, unusable: 1, error: 2 }, failed: { no_extra_change: 1 } });
    expect(summary.metrics.classes["when-to-use-missing"]).toMatchObject({ n: 2, correct: 1, outcomes: { proposal: 1, none: 1 }, failed: { defect_fixed: 1 } });
    expect(summary.metrics.proposals).toEqual({ n: 2, touched_body: 0 });
    expect(summary.served).toEqual({ "served-model": 5, "other-name": 1 }); // an error, whether akm crashed or the provider failed, answered nothing

    const dir = join(folders.results, readdirSync(folders.results)[0] as string);
    expect(dir).toMatch(/\d{4}-\d{2}-\d{2}-t$/);
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored.results_dir).toBeUndefined();
    expect(stored.git_commit).toBeString();
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => [r.id, r.outcome, r.correct])).toEqual([
      ["fix-ok", "proposal", true],
      ["fix-none", "none", false],
      ["keep-ok", "none", true],
      ["keep-churn", "proposal", false],
      ["refused", "refused", false],
      ["unusable", "unusable", false],
      ["provider", "error", null],
      ["crash", "error", null],
    ]);
    expect(rows[0]).toMatchObject({ changed: ["when_to_use"], values: { when_to_use: "Use when a signing key is about to expire or may have leaked." }, served: "served-model" });
    expect(rows[0].proposal).toBe(NOTE);
    expect(rows[1].proposal).toBeUndefined();
    expect(rows[1].served).toBe("other-name");
    expect(rows[6].served).toBeUndefined();
    expect(rows[7].served).toBeUndefined();
    expect(rows[6].error).toBe("non_zero_exit: HTTP 500 from <MODEL_BASE_URL>/chat/completions"); // the endpoint is not in the results
    expect(rows[7].error).toContain("boom");
  });

  test("runs each case in a bundle of its own, with the note in it, and records the feedback before reflect runs", async () => {
    const { ctx, calls, folders } = setup(cases.slice(0, 3), plan);
    await quiet(() => runCorpus("public", ctx, folders));
    const log = calls();
    const first = log.filter((c) => c.args[0] !== "--version").slice(0, 5);
    expect(first.map((c) => c.args.slice(0, 2).join(" "))).toEqual(["index --format", "feedback knowledge/a", "improve knowledge/a", "proposal list", "proposal show"]);
    expect(first[1].args).toEqual(["feedback", "knowledge/a", "--negative", "--reason", "Feedback for fix-ok.", "--format", "json"]);
    expect(first[2].args).toEqual(["improve", "knowledge/a", "--strategy", "reflect-only", "--json-to-stdout", "--format", "json"]);
    expect(first[4].args).toEqual(["proposal", "show", "prop-1", "--detail", "full", "--format", "json"]);
    expect(first[2].note).toBe(cases[0]?.source); // the note, byte for byte
    expect(log.find((c) => c.args[1] === "skills/c")?.note).toBe(cases[2]?.source); // a skill sits in its own folder, as SKILL.md
    // a fresh sandbox for each case, gone afterwards, with the model and its key
    const bundles = new Set(log.map((c) => c.bundle));
    expect(bundles.size).toBe(3);
    for (const b of bundles) expect(existsSync(b)).toBe(false);
    expect(new Set(log.map((c) => c.cwd)).size).toBe(3);
    expect(log.every((c) => c.model === "the-model" && c.key === "model-secret")).toBe(true);
  });

  test("runs the strategy it is given, with the config patch merged into the config, and records both", async () => {
    const { ctx, calls, folders } = setup(cases.slice(0, 1), plan);
    const root = mkdtempSync(join(tmpdir(), "reflect-patch-"));
    dirs.push(root);
    writeFileSync(join(root, "patch.json"), JSON.stringify({ engines: { reflect: { model: "patched-model" } } }));
    const configPatch = loadConfigPatch("patch.json", root);
    const summary = await quiet(() => runCorpus("public", { ...ctx, overrides: { strategy: "reflect-judged", configPatch } }, folders));
    const log = calls();
    expect(log.find((c) => c.args[0] === "improve").args).toEqual(["improve", "knowledge/a", "--strategy", "reflect-judged", "--json-to-stdout", "--format", "json"]);
    expect(log.filter((c) => c.args[0] !== "--version").every((c) => c.model === "patched-model")).toBe(true);
    expect(summary).toMatchObject({ strategy: "reflect-judged", config_patch: { path: "patch.json", sha256: configPatch.sha256 } });
  });

  test("without the flags it records its own strategy and no patch", async () => {
    const { ctx, folders } = setup(cases.slice(0, 1), plan);
    expect(await quiet(() => runCorpus("public", ctx, folders))).toMatchObject({ strategy: "reflect-only", config_patch: null });
  });

  test("a limit runs the first cases", async () => {
    const { ctx, calls, folders } = setup(cases, plan);
    const summary = await quiet(() => runCorpus("public", { ...ctx, limit: 2 }, folders));
    expect(summary).toMatchObject({ limit: 2, n_cases: 8, n_run: 2 });
    expect(calls().filter((c) => c.args[0] === "improve").map((c) => c.args[1])).toEqual(["knowledge/a", "knowledge/b"]);
  });

  test("a queue that does not hold the one proposal reflect made is an error, not a score", async () => {
    const { ctx, folders } = setup([make("two", "retrieval-miss", "knowledge/a.md")], { "knowledge/a": { outcome: "two" } });
    const summary = await quiet(() => runCorpus("public", ctx, folders));
    expect(summary).toMatchObject({ n_run: 1, n_scored: 0, n_errored: 1 });
    const dir = join(folders.results, readdirSync(folders.results)[0] as string);
    expect(JSON.parse(readFileSync(join(dir, "samples.jsonl"), "utf8")).error).toBe("reflect made a proposal but the queue holds 2");
  });

  test("stops early when no case gets an outcome, and says what to check", async () => {
    const many = Array.from({ length: 12 }, (_, i) => make(`c${i}`, "retrieval-miss", `knowledge/n${i}.md`));
    const { ctx, folders } = setup(many, Object.fromEntries(many.map((c) => [refOf(c.path), { outcome: "provider" }])));
    await expect(quiet(() => runCorpus("public", ctx, folders))).rejects.toThrow("the first 5 cases got no outcome");
    const dir = join(folders.results, readdirSync(folders.results)[0] as string);
    const summary = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(summary.n_run).toBe(5);
    expect(summary.n_scored).toBe(0);
  });
});

/** The akm on this machine, if it is new enough to run this eval. */
function realAkm(): string | undefined {
  const cmd = (process.env.AKM_BIN?.trim() || "akm").split(/\s+/);
  try {
    const out = Bun.spawnSync([...cmd, "--version"], { stdout: "pipe", stderr: "ignore" });
    const version = out.stdout.toString().match(/\d+\.\d+\.\d+\S*/)?.[0];
    return out.exitCode === 0 && version && atLeast(version, MIN_AKM) ? version : undefined;
  } catch {
    return undefined;
  }
}
const realVersion = realAkm();

describe.skipIf(!realVersion)(`with the akm on this machine (${realVersion})`, () => {
  const LIBRARY = join(import.meta.dir, "..", "..", "..", "corpus", "library");
  const cases = parseCases(readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl"), "utf8")).slice(0, 10); // one case of each class

  /** A model that answers as a script says. The oracle restores what the injection took away from the clean note. */
  function model(mode: "oracle" | "nothing" | "churn") {
    const byRef = new Map(cases.map((c) => [refOf(c.path), c]));
    const original = (c: Case) => {
      const clean = readFileSync(join(LIBRARY, c.path), "utf8");
      const fm = Bun.YAML.parse(clean.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "") as Record<string, string>;
      const squash = (s?: string) => (s ? s.replace(/\s+/g, " ").trim() : null);
      return { description: squash(fm.description), when_to_use: squash(fm.when_to_use), title: squash(fm.title) ?? clean.match(/^#[ \t]+(\S.*)$/m)?.[1] ?? null };
    };
    return Bun.serve({
      port: 0,
      async fetch(req) {
        const prompt: string = ((await req.json()) as { messages: { content: string }[] }).messages.at(-1)?.content ?? "";
        const c = byRef.get(prompt.match(/Target ref: (\S+)/)?.[1] ?? "") as Case;
        const o = original(c);
        const patch = { description: null as string | null, when_to_use: null as string | null, title: null as string | null };
        if (mode === "oracle") {
          if (c.fix === "description") patch.description = o.description;
          if (c.fix === "when_to_use") patch.when_to_use = o.when_to_use;
          if (c.fix === "title") patch.title = o.title;
        } else if (mode === "churn") {
          Object.assign(patch, { description: "A rewritten summary that says the same in new words and adds a claim about AWS.", when_to_use: "Use whenever you need help with anything related to this topic.", title: "A New Title" });
        }
        const content = JSON.stringify({ confidence: 0.9, frontmatterPatch: patch });
        return Response.json({ choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }], usage: {} });
      },
    });
  }

  async function runWith(mode: "oracle" | "nothing" | "churn") {
    const server = model(mode);
    const root = mkdtempSync(join(tmpdir(), "reflect-real-"));
    dirs.push(root);
    try {
      const ctx = { baseUrl: `http://127.0.0.1:${server.port}/v1`, model: "scripted", hasKey: false, version: realVersion as string, label: "t", limit: 10 };
      return await quiet(() => runCorpus("public", ctx, { assets: join(import.meta.dir, "..", "assets"), results: join(root, "results") }));
    } finally {
      server.stop();
    }
  }

  test("a model that restores what the injection took away fixes every defect and keeps every control", async () => {
    const m = (await runWith("oracle")).metrics;
    expect(m.defects).toEqual({ n: 6, correct: 6, rate: 1 });
    expect(m.controls).toEqual({ n: 4, correct: 4, rate: 1 });
    expect(m.proposals.touched_body).toBe(0);
  }, 120_000);

  test("a model that answers nothing fixes no defect, even where akm writes a description of its own, and keeps every control", async () => {
    const m = (await runWith("nothing")).metrics;
    expect(m.defects).toEqual({ n: 6, correct: 0, rate: 0 });
    expect(m.controls).toEqual({ n: 4, correct: 4, rate: 1 });
    expect(m.classes["description-missing"]?.outcomes.proposal).toBe(1); // akm's own description is a proposal the checks do not credit
  }, 120_000);

  test("a model that rewrites every field fixes no defect and keeps no control", async () => {
    const m = (await runWith("churn")).metrics;
    expect(m.defects.correct).toBe(0);
    expect(m.controls.correct).toBe(0);
    expect(m.proposals.n).toBe(10);
  }, 120_000);
});
