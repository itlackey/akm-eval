import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOverrides } from "../../../lib/akm/overrides.ts";
import { configFor as distillConfig } from "../../distill/src/collect.ts";
import { buildCase } from "./lessons-build.ts";
import { collect, pending, useLessons, type Options } from "./collect.ts";
import { fakeModel, type FakeModel } from "./lme-fakes.ts";
import { LESSONS_FILE, loadLessons, lessonsVerdict, makeFixture, pendingLessons, sourceDigest, type LessonCase } from "./lessons.ts";
import { sourceFiles } from "./protocol.ts";
import { loadCases } from "./inputs.ts";
import { makeRow, summarize } from "./score.ts";

// A fake akm over memories/ and lessons/: `improve memories/<n>` queues a lesson for a note that says LESSON, `proposal list` shows the queue.
const FAKE_AKM = `
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
const root = process.env.AKM_BUNDLE_DIR as string, queue = join(process.env.AKM_DATA_DIR as string, "queue.json");
const all = () => ["memories", "lessons"].flatMap((d) => { try { return readdirSync(join(root, d)).filter((f) => f.endsWith(".md")).map((f) => d + "/" + f.replace(/\\.md$/, "")); } catch { return []; } }).sort();
appendFileSync(process.env.FAKE_AKM_LOG as string, [cmd, ...rest.filter((a) => a.startsWith("memories/") || a.startsWith("--status"))].join(" ") + "\\n");
if (cmd === "--version") console.log("0.10.fake");
else if (cmd === "search" && rest[0] === "--help") console.log("--detail=<detail> Detail level, or agent");
else if (cmd === "index") console.log(JSON.stringify({ ok: true, totalEntries: all().length }));
else if (cmd === "improve") {
  const ref = rest[0] as string, text = readFileSync(join(root, ref + ".md"), "utf8");
  const q = existsSync(queue) ? JSON.parse(readFileSync(queue, "utf8")) : [];
  if (text.includes("LESSON")) q.push({ source: "distill", ref: "lessons/" + ref.slice(9) + "-lesson", status: text.includes("REJECT") ? "rejected" : "pending", payload: { content: "Lesson: " + text } });
  mkdirSync(process.env.AKM_DATA_DIR as string, { recursive: true }); writeFileSync(queue, JSON.stringify(q));
  console.log(JSON.stringify({ ok: true, actions: [] }));
} else if (cmd === "proposal") {
  const status = rest[rest.indexOf("--status") + 1], q = existsSync(queue) ? JSON.parse(readFileSync(queue, "utf8")) : [];
  console.log(JSON.stringify({ proposals: q.filter((p) => p.status === status) }));
} else if (cmd === "search") {
  const query = rest[rest.indexOf("--") + 1].toLowerCase().split(/\\W+/).filter((w) => w.length > 3);
  const hits = all().map((r) => ({ r, n: query.filter((w) => readFileSync(join(root, r + ".md"), "utf8").toLowerCase().includes(w)).length })).filter((s) => s.n > 0).sort((a, b) => b.n - a.n || a.r.localeCompare(b.r)).map((s) => ({ ref: s.r }));
  console.log(JSON.stringify({ hits, searchMode: "keyword" }));
} else if (cmd === "show") console.log(JSON.stringify({ ref: rest[0], content: readFileSync(join(root, rest[0] + ".md"), "utf8") }));
else { console.error("unknown " + cmd); process.exit(1); }
`;
const work = mkdtempSync(join(tmpdir(), "memlessons-test-"));
let model: FakeModel;
const saved = { AKM_BIN: process.env.AKM_BIN, FAKE_AKM_LOG: process.env.FAKE_AKM_LOG };
const log = join(work, "akm.log");
beforeAll(() => {
  model = fakeModel("BLUE42");
  writeFileSync(join(work, "fake-akm.ts"), FAKE_AKM);
  process.env.AKM_BIN = `bun ${join(work, "fake-akm.ts")}`; process.env.FAKE_AKM_LOG = log;
});
afterAll(() => {
  model.stop(); rmSync(work, { recursive: true, force: true });
  for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
});
const fail = (m: string): never => { throw new Error(m); };
const c = { id: "lesson-case", category: "fact", common: "docs", notes: ["plain note about gadgets", "LESSON the gadget code is BLUE42", "LESSON REJECT shaky"], question: "What is the gadget code?",
  fields: { code: { values: ["BLUE42"], evidence: [["BLUE42"]] } } };

describe("building the fixture with akm's own distill", () => {
  test("keeps only pending lessons, one entry per note, and stores what the run will check", async () => {
    writeFileSync(log, "");
    const cfg = distillConfig({ baseUrl: model.url, model: "fake", hasKey: false, provider: "openai", overrides: parseOverrides({}, "distill-only", fail) });
    const lc = await buildCase(c, cfg, s => s, 20000);
    const names = sourceFiles(c);
    expect(Object.values(lc.notes)).toEqual(["none", "lesson", "rejected"]);
    expect(Object.keys(names)).toEqual(Object.keys(lc.notes));
    const [path] = Object.keys(lc.files);
    expect(Object.keys(lc.files)).toHaveLength(1);
    expect(path).toMatch(/^lessons\/m[0-9a-f]{16}-lesson\.md$/);
    expect(lc.files[path!]).toContain("BLUE42");
    expect(lc.source_sha256).toBe(sourceDigest(c));
    const cmds = readFileSync(log, "utf8").split("\n");
    expect(cmds.filter(x => x.startsWith("improve"))).toHaveLength(3); // distill asked once per note, never on the whole library
  });
  test("pendingLessons ignores updates, knowledge and other sources, and refuses a bad path", () => {
    const p = (ref: string, source = "distill", content = "x") => ({ source, ref, payload: { content } });
    const ok = pendingLessons([{ status: "pending", proposals: [p("akm-stash//lessons/a"), p("knowledge/k"), p("lessons/b", "reflect")] }, { status: "accepted", proposals: [p("lessons/c")] }, { status: "rejected", proposals: [p("lessons/d")] }]);
    expect(ok).toEqual({ files: { "lessons/a.md": "x" }, rejected: 1 });
    expect(() => pendingLessons([{ status: "pending", proposals: [p("lessons/../x")] }])).toThrow("unexpected lesson path");
    expect(() => pendingLessons([{ status: "pending", proposals: [p("lessons/e", "distill", " ")] }])).toThrow("no content");
  });
});

describe("the fixture and the run", () => {
  const lc: LessonCase = { source_sha256: sourceDigest(c), notes: {}, files: { "lessons/gadget.md": "Lesson: the gadget code is BLUE42, from the notes." } };
  const folder = join(work, "assets");
  mkdirSync(folder, { recursive: true });
  const fixture = makeFixture({ akm_version: "0.10.fake", model: "fake", strategy: "distill-only" }, { [c.id]: lc });
  writeFileSync(join(folder, "cases.json"), JSON.stringify([c]));
  writeFileSync(join(folder, LESSONS_FILE), JSON.stringify(fixture));
  test("loads when intact; refuses an edited fixture, changed notes and a missing case", () => {
    expect(loadLessons(folder, [c]).outputs_sha256).toBe(fixture.outputs_sha256);
    expect(() => loadLessons(folder, [{ ...c, notes: ["other"] }])).toThrow("changed since the lessons were built");
    expect(() => loadLessons(folder, [{ ...c, id: "other" }])).toThrow("no entry for case other");
    const edited = JSON.parse(JSON.stringify(fixture)); edited.cases[c.id].files["lessons/gadget.md"] = "tampered";
    writeFileSync(join(work, "edited.json"), JSON.stringify(edited));
    mkdirSync(join(work, "e"), { recursive: true }); writeFileSync(join(work, "e", LESSONS_FILE), JSON.stringify(edited));
    expect(() => loadLessons(join(work, "e"), [c])).toThrow("was edited");
    expect(() => loadLessons(join(work, "none"), [c])).toThrow("build-lessons");
  });
  test("the public cases' fixture, once built, is checked against the shipped notes (skipped until it exists)", () => {
    const shipped = join(import.meta.dir, "..", "assets");
    try { readFileSync(join(shipped, LESSONS_FILE)); } catch { return; }
    expect(() => loadLessons(shipped, loadCases(shipped))).not.toThrow();
  });
  test("the third arm reads the notes plus the lessons, runs no inference, and the first two arms are as before", async () => {
    writeFileSync(log, "");
    const endpoint = { baseUrl: model.url, apiKey: "", model: "fake" };
    const o: Options = { endpoint, provider: "openai", overrides: parseOverrides({}, "", fail), semantic: false, contextTokens: 1024, searchLimit: 10, timeoutMs: 20000, seed: "1", lessons: loadLessons(folder, [c]) };
    const raw = await collect(c, pending(c, 0, "1"), o);
    expect(readFileSync(log, "utf8")).not.toContain("improve");
    expect(raw.inference.outcome).toBe("output");
    expect(Object.keys(raw.post_inference!).sort()).toEqual([...Object.keys(raw.source), "lessons/gadget.md"].sort());
    expect(raw.arms.source.context.documents.some(d => d.ref.startsWith("lessons/"))).toBe(false);
    expect(raw.arms.inferred.context.documents.some(d => d.ref === "lessons/gadget")).toBe(true);
    for (const a of ["none", "source", "inferred"] as const) expect(raw.arms[a].state).toBe("complete");
    const row = makeRow(c, raw);
    const s = summarize([row]);
    expect(s.metrics.inference.output).toBe(1);
    const fix = loadLessons(folder, [c]);
    const v = lessonsVerdict(s, [row], fix);
    expect(v.cases_with_lessons).toBe(1);
    expect(v.verdict).toBe("incomplete"); // one case has no interval
  });
  test("a case with no lessons gives the source library and is a no-change", () => {
    const raw = pending(c, 0, "1");
    useLessons(raw, c.id, makeFixture({ akm_version: "v", model: "m", strategy: "s" }, { [c.id]: { ...lc, files: {} } }));
    expect(raw.post_inference).toEqual(raw.source); expect(raw.inference.outcome).toBe("no-change");
  });
});

describe("the pass rule", () => {
  const fix = makeFixture({ akm_version: "v", model: "m", strategy: "s" }, {});
  const summaryOf = (ci: [number, number] | null, source: number, lessons: number, complete = true) => ({ n_errored: complete ? 0 : 1, n_unfinished: 0, n_scored: 24, n_cases: 24,
    metrics: { memory_inference: { failure_inclusive: { value: 0.2, ci95: ci, p_value: 0.03 } }, arms: { source: { reported_usage: { prompt_tokens: { total_reported: source, reporting_count: 24, attempted_calls: 24 } } }, inferred: { reported_usage: { prompt_tokens: { total_reported: lessons, reporting_count: 24, attempted_calls: 24 } } } } } });
  const rows = (s: number, l: number) => [...Array(24).keys()].map(i => ({ id: `r${i}`, arms: { source: { correct: i < s }, inferred: { correct: i < l } } })) as any;
  test("earned needs the interval above zero and tokens per correct not higher", () => {
    expect(lessonsVerdict(summaryOf([0.05, 0.4], 24000, 24000), rows(10, 16), fix).verdict).toBe("earned");
    expect(lessonsVerdict(summaryOf([0.05, 0.4], 24000, 40000), rows(10, 16), fix).verdict).toBe("not shown"); // 2400 vs 2500 tokens per correct answer
    expect(lessonsVerdict(summaryOf([-0.1, 0.4], 24000, 24000), rows(10, 16), fix).verdict).toBe("not shown");
    expect(lessonsVerdict(summaryOf([-0.5, -0.05], 24000, 24000), rows(16, 10), fix).verdict).toBe("harmful");
    expect(lessonsVerdict(summaryOf([0.05, 0.4], 24000, 24000, false), rows(10, 16), fix).verdict).toBe("incomplete");
    expect(lessonsVerdict(summaryOf(null, 24000, 24000), rows(10, 16), fix).verdict).toBe("incomplete");
  });
});
