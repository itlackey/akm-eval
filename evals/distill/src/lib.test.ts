import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLASSES, type CaseRun, type Class, type LoadedCase, MAX_RATIO, type Proposal, type Row, checkLesson, claims, distillConfig, distillOutcome, errorRow, failureMessage, lessonFile, lessonProposals, lessonText, loadCases, memoryBody, memoryRef, mentions, metrics, normalize, scoreCase, selectCases, servedModels } from "./lib.ts";

const PUBLIC = join(import.meta.dir, "..", "assets");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** An assets folder with these cases, each with one memory. */
function assetsWith(cases: Record<string, unknown>[], memories: Record<string, string[]> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "distill-lib-"));
  dirs.push(root);
  writeFileSync(join(root, "cases.json"), JSON.stringify(cases));
  for (const c of cases) {
    const files = memories[c.id as string] ?? ["m"];
    mkdirSync(join(root, "bundles", c.id as string, "memories"), { recursive: true });
    for (const f of files) writeFileSync(join(root, "bundles", c.id as string, "memories", `${f}.md`), `---\ndescription: d\n---\nThe memory ${f}.\n`);
  }
  return root;
}

const lessonCase = (extra: Record<string, unknown> = {}) => ({ id: "l1", class: "lesson-worthy", expect: "lesson", required: [["a fact"]], forbidden: [["a claim"]], good: "g", bad: "b", note: "n", ...extra });
const noneCase = (extra: Record<string, unknown> = {}) => ({ id: "n1", class: "dated-status", expect: "none", note: "n", ...extra });

describe("loadCases", () => {
  test("reads the public cases: 30, in five classes", () => {
    const cases = loadCases(PUBLIC);
    expect(cases).toHaveLength(30);
    const count = (k: Class) => cases.filter((c) => c.class === k).length;
    expect(CLASSES.map(count)).toEqual([8, 6, 6, 5, 5]);
    expect(new Set(cases.map((c) => c.id)).size).toBe(30);
    for (const c of cases) expect(c.memory.startsWith("---\n")).toBe(true);
  });

  test("a case that expects a lesson holds facts, claims and two examples; one that expects none holds none of them", () => {
    for (const c of loadCases(PUBLIC)) {
      if (c.expect === "lesson") {
        expect(c.required.length).toBeGreaterThanOrEqual(3);
        expect(c.forbidden.length).toBeGreaterThanOrEqual(2);
        expect(c.good && c.bad).toBeTruthy();
      } else {
        expect([c.required, c.forbidden, c.good, c.bad]).toEqual([[], [], undefined, undefined]);
      }
    }
  });

  test("asset cases carry the library asset, and duplicate cases carry a lesson", () => {
    for (const c of loadCases(PUBLIC)) {
      const files = readdirSync(c.dir, { recursive: true }).map(String).filter((f) => f.endsWith(".md"));
      if (c.class === "restates-asset") expect(files.filter((f) => f.startsWith("skills/") || f.startsWith("knowledge/")).length).toBeGreaterThanOrEqual(1);
      if (c.class === "duplicate-lesson") expect(files.filter((f) => f.startsWith("lessons/")).length).toBe(1);
    }
  });

  test("some duplicate cases hold the lesson where distill would write it, and some under another name", () => {
    const held = loadCases(PUBLIC).filter((c) => c.class === "duplicate-lesson").map((c) => existsSync(join(c.dir, lessonFile(c))));
    expect(held).toEqual([true, true, true, false, false]);
  });

  test("every memory has its own name", () => {
    const names = loadCases(PUBLIC).map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("rejects a case that is not well formed", () => {
    const fails = (cases: Record<string, unknown>[], message: string, memories?: Record<string, string[]>) => expect(() => loadCases(assetsWith(cases, memories))).toThrow(message);
    expect(loadCases(assetsWith([lessonCase(), noneCase()]))).toHaveLength(2);
    fails([lessonCase({ class: "mystery" })], 'class "mystery"');
    fails([lessonCase({ expect: "none" })], "expects lesson");
    fails([noneCase({ expect: "lesson" })], "expects none");
    fails([lessonCase({ required: [] })], "needs required and forbidden");
    fails([lessonCase({ required: [["###"]] })], "a letter or a digit");
    fails([lessonCase({ required: [[]] })], "list of lists");
    fails([lessonCase({ bad: undefined })], '"bad" example');
    fails([noneCase({ required: [["x"]] })], "no required or forbidden");
    fails([lessonCase({ note: " " })], "no note");
    fails([lessonCase(), lessonCase()], "repeats an id");
    fails([lessonCase({ id: "Bad Id" })], "lower case");
    fails([lessonCase()], "exactly one memory", { l1: [] });
    fails([lessonCase()], "exactly one memory", { l1: ["a", "b"] });
    expect(() => loadCases(assetsWith([]))).toThrow("no cases");
  });
});

describe("selectCases", () => {
  const cases = loadCases(PUBLIC);

  test("takes one case from each class in turn, in file order", () => {
    expect(selectCases(cases, 5).map((c) => c.id)).toEqual(["lesson-01", "claim-01", "status-01", "asset-01", "dup-01"]);
    expect(selectCases(cases, 3).map((c) => c.id)).toEqual(["lesson-01", "claim-01", "status-01"]);
    expect(selectCases(cases, 7).map((c) => c.id)).toEqual(["lesson-01", "lesson-02", "claim-01", "claim-02", "status-01", "asset-01", "dup-01"]);
  });

  test("a limit at or above the size runs everything", () => {
    expect(selectCases(cases, 30)).toHaveLength(30);
    expect(selectCases(cases, 99)).toHaveLength(30);
    expect(selectCases(cases)).toHaveLength(30);
  });
});

describe("normalize and mentions", () => {
  test("ignore case and punctuation, and split a number from its unit", () => {
    expect(normalize("Playwright's `networkidle` wait: 200MB, v2.4.0!")).toBe("playwrights networkidle wait 200 mb v 2 4 0");
    expect(mentions("Files over 200MB are rejected.", "200 mb")).toBe(true);
    expect(mentions("Wait for networkidle.", "NetworkIdle")).toBe(true);
    expect(mentions("It uses git push --follow-tags.", "follow tags")).toBe(true);
  });

  test("a word matches the start of a word, a number matches only itself", () => {
    expect(mentions("They retry twice, and retries are logged.", "retr")).toBe(true);
    expect(mentions("They retry twice.", "retries")).toBe(false);
    expect(mentions("Truncated lists", "truncat")).toBe(true);
    expect(mentions("Truncated lists", "runcat")).toBe(false);
    expect(mentions("limit of 300", "30")).toBe(false);
    expect(mentions("every 30s", "30")).toBe(true);
    expect(mentions("version 3.2.0", "3.2.0")).toBe(true);
    expect(mentions("version 3.2.10", "3.2.1")).toBe(false);
  });

  test("a word in a phrase is a whole word at its start, so a phrase is not found inside one", () => {
    expect(mentions("category", "cat")).toBe(true);
    expect(mentions("the scat", "cat")).toBe(false);
  });

  test("* stands for up to three words", () => {
    expect(mentions("all layouts", "all * layouts")).toBe(true);
    expect(mentions("all the page layouts", "all * layouts")).toBe(true);
    expect(mentions("all of the many page layouts", "all * layouts")).toBe(false);
    expect(mentions("every distinct page template", "every * template")).toBe(true);
    expect(mentions("template every", "every * template")).toBe(false);
  });

  test("a phrase with no word never matches", () => {
    expect(mentions("anything", "###")).toBe(false);
    expect(mentions("anything", "*")).toBe(false);
  });
});

describe("claims", () => {
  const groups = [["is enough", "all layouts"], ["no limit"]];

  test("finds an asserted phrase, one per group", () => {
    expect(claims("The fix works on all layouts and is enough.", groups)).toEqual(["is enough"]);
    expect(claims("There is no limit.", groups)).toEqual(["no limit"]);
    expect(claims("Nothing here.", groups)).toEqual([]);
  });

  test("a sentence that denies or doubts it does not assert it", () => {
    expect(claims("It is unconfirmed whether 0.125 is enough.", groups)).toEqual([]);
    expect(claims("That is not enough.", groups)).toEqual([]);
    expect(claims("It may work on all layouts.", groups)).toEqual([]);
    expect(claims("We do not know if it works on all layouts.", groups)).toEqual([]);
    expect(claims("It doesn't work on all layouts.", groups)).toEqual([]);
    expect(claims("It was only tried once. It works on all layouts.", groups)).toEqual(["all layouts"]);
  });

  test("the words of the phrase itself do not count as a denial", () => {
    expect(claims("Upgrading has no limit.", groups)).toEqual(["no limit"]);
  });

  test("a sentence ends at a full stop, a line break or a semicolon, not at the dot in a number", () => {
    expect(claims("The size is 0.125 inch and is enough", groups)).toEqual(["is enough"]);
    expect(claims("Not sure.\nIt is enough", groups)).toEqual(["is enough"]);
    expect(claims("Not sure; it is enough", groups)).toEqual(["is enough"]);
  });
});

describe("lessonText and memoryBody", () => {
  const content = `---
description: "A folded description
  over two lines."
when_to_use: When a thing happens.
xrefs:
  - memories/the-memory-name
type: lesson
updated: 2026-10-05
---

The body.
`;

  test("keeps the description, the when_to_use and the body, and none of the keys akm adds", () => {
    expect(lessonText(content)).toBe("A folded description over two lines.\nWhen a thing happens.\nThe body.");
    expect(mentions(lessonText(content), "the memory name")).toBe(false);
  });

  test("a lesson without frontmatter is its text, and unreadable frontmatter leaves the body", () => {
    expect(lessonText("Just text.\n")).toBe("Just text.");
    expect(lessonText("---\ndescription: [unclosed\n---\nThe body.\n")).toBe("The body.");
  });

  test("the body of a memory has no frontmatter", () => {
    expect(memoryBody("---\ndescription: d\n---\nOne two three.\n")).toBe("One two three.");
    expect(memoryBody("No frontmatter here")).toBe("No frontmatter here");
  });
});

describe("checkLesson", () => {
  const c = { required: [["30"], ["limit", "--limit"]], forbidden: [["every command"]] };
  const memory = "---\ndescription: d\n---\n" + "word ".repeat(40);

  test("good when it states every fact, makes no forbidden claim and is not much longer than the memory", () => {
    const k = checkLesson(c, "The default is 30, so pass a limit.", memory);
    expect(k).toEqual({ missing: [], forbidden: [], ratio: 0.2, good: true });
  });

  test("names the facts it leaves out and the claims it makes", () => {
    const k = checkLesson(c, "The default is 30.", memory);
    expect(k).toMatchObject({ missing: ["limit"], forbidden: [], good: false });
    const j = checkLesson(c, "Pass a limit of 30 on every command.", memory);
    expect(j).toMatchObject({ missing: [], forbidden: ["every command"], good: false });
  });

  test("too long is more than MAX_RATIO times the memory in words", () => {
    const body = (n: number) => `30 limit ${"x ".repeat(n)}`;
    expect(checkLesson(c, body(Math.floor(40 * MAX_RATIO) - 2), memory).good).toBe(true);
    expect(checkLesson(c, body(Math.floor(40 * MAX_RATIO) + 1), memory)).toMatchObject({ good: false, missing: [], forbidden: [] });
  });
});

describe("the public cases check themselves", () => {
  for (const c of loadCases(PUBLIC).filter((c) => c.expect === "lesson")) {
    describe(c.id, () => {
      test("every required fact is in the memory body, and no forbidden claim is", () => {
        const body = memoryBody(c.memory);
        for (const fact of c.required) expect(fact.some((p) => mentions(body, p)), `required: ${fact[0]}`).toBe(true);
        for (const group of c.forbidden) for (const p of group) expect(mentions(body, p), `forbidden: ${p}`).toBe(false);
      });

      test("the good lesson passes, and the over-claiming one fails on a forbidden claim", () => {
        expect(checkLesson(c, c.good as string, c.memory)).toMatchObject({ missing: [], forbidden: [], good: true });
        const bad = checkLesson(c, c.bad as string, c.memory);
        expect(bad.good).toBe(false);
        expect(bad.forbidden.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("distillConfig", () => {
  test("one LLM engine at temperature 0 with no thinking, and a strategy that runs distill and nothing else", () => {
    const c = distillConfig("http://localhost:8080/v1/", "m", false);
    expect(c.engines.model).toMatchObject({ kind: "llm", endpoint: "http://localhost:8080/v1/chat/completions", model: "m", temperature: 0, enableThinking: false });
    expect(c.engines.model.supportsJsonSchema).toBeUndefined();
    expect(c.engines.model.apiKey).toBeUndefined();
    expect(c.defaults).toMatchObject({ llmEngine: "model", improveStrategy: "distill-only" });
    const processes = c.improve.strategies["distill-only"].processes;
    expect(Object.entries(processes).filter(([, p]) => (p as { enabled: boolean }).enabled).map(([n]) => n)).toEqual(["distill"]);
    expect(Object.keys(processes).sort()).toEqual(["consolidate", "distill", "extract", "memoryInference", "proactiveMaintenance", "reflect", "triage", "validation"]);
    expect(c.improve.strategies["distill-only"].sync.enabled).toBe(false);
  });

  test("names the key by variable and never holds it", () => {
    expect(distillConfig("https://api.example.com/v1", "m", true).engines.model.apiKey).toBe("$MODEL_API_KEY");
  });
});

describe("refs", () => {
  test("the memory ref and the file distill writes its lesson to", () => {
    expect(memoryRef({ name: "retry-backoff" })).toBe("memories/retry-backoff");
    expect(lessonFile({ name: "retry-backoff" })).toBe("lessons/memory-retry-backoff-lesson.md");
    expect(lessonFile({ name: "Odd_Name.v2" })).toBe("lessons/memory-odd-name-v2-lesson.md");
  });
});

describe("what akm did", () => {
  const proposal = (extra: Record<string, unknown> = {}) => ({ id: "1", ref: "bundle//lessons/memory-m-lesson", source: "distill", payload: { content: "---\ndescription: d\nwhen_to_use: w\n---\nBody.\n" }, gateDecision: { outcome: "deferred", reason: "distill-review", scores: { novelty: 4 }, judgeReason: "fine" }, ...extra });

  test("lessonProposals keeps the lessons distill queued, in any state, with the gate's decision", () => {
    const found = lessonProposals([
      { status: "pending", proposals: [proposal(), proposal({ ref: "bundle//knowledge/x" }), proposal({ source: "reflect" })] },
      { status: "rejected", proposals: [proposal({ ref: "lessons/short-ref" })] },
      { status: "accepted" },
    ]);
    expect(found.map((p) => [p.ref, p.status, p.gate, p.reason])).toEqual([
      ["bundle//lessons/memory-m-lesson", "pending", "deferred/distill-review", "fine"],
      ["lessons/short-ref", "rejected", "deferred/distill-review", "fine"],
    ]);
    expect(found[0].scores).toEqual({ novelty: 4 });
    expect(lessonProposals([{ status: "pending", proposals: [proposal({ gateDecision: undefined })] }])[0]).toMatchObject({ gate: null, scores: null, reason: null });
  });

  const improve = (action: Record<string, unknown>) => ({ ok: true, actions: [{ mode: "reflect-skipped", result: { ok: true, reason: "process-disabled" } }, action] });

  test("distillOutcome reads the distill action", () => {
    const outcome = (result: Record<string, unknown>, mode = "distill") => distillOutcome(improve({ mode, result }));
    expect(outcome({ ok: true, outcome: "skipped", skipReason: "lesson_exists" })).toEqual({ outcome: "skipped", detail: "lesson_exists" });
    expect(outcome({ ok: true, outcome: "quality_rejected", reason: "restates it", score: 2 })).toEqual({ outcome: "rejected", detail: "restates it" });
    expect(outcome({ ok: false, outcome: "validation_failed", error: "no when_to_use" })).toEqual({ outcome: "invalid", detail: "no when_to_use" });
    expect(outcome({ ok: true, outcome: "llm_failed", message: "no usable output" })).toEqual({ outcome: "error", detail: "no usable output" });
    expect(outcome({ ok: true, outcome: "config_disabled", message: "disabled" })).toEqual({ outcome: "error", detail: "disabled" });
    expect(outcome({ ok: true, outcome: "review_needed", reason: "invalid description" })).toEqual({ outcome: "invalid", detail: "invalid description" });
    expect(outcome({ ok: true, outcome: "review_needed" })).toEqual({ outcome: "invalid", detail: "akm could not queue the lesson for review" });
    expect(outcome({ ok: true, outcome: "queued" }).outcome).toBe("error");
    expect(outcome({ ok: true, reason: "process-disabled" }, "distill-skipped")).toEqual({ outcome: "error", detail: "distill did not run: process-disabled" });
    expect(outcome({ ok: false, error: "boom" }, "error")).toEqual({ outcome: "error", detail: "boom" });
    expect(distillOutcome({ ok: true, actions: [] }).outcome).toBe("error");
    expect(distillOutcome(null).outcome).toBe("error");
  });

  const c = loadCases(PUBLIC).find((x) => x.id === "lesson-02") as LoadedCase;
  const status = loadCases(PUBLIC).find((x) => x.id === "status-01") as LoadedCase;
  const queued = (content: string, extra: Partial<Proposal> = {}): Proposal => ({ ref: "bundle//lessons/x", status: "pending", gate: "deferred/distill-review", scores: { novelty: 4 }, reason: "ok", content, ...extra });
  const run = (proposals: Proposal[], result: Record<string, unknown> = { outcome: "skipped", skipReason: "lesson_exists" }): CaseRun => ({ improve: improve({ mode: "distill", result }), proposals, seconds: 1.5 });

  test("scoreCase: a case that expects a lesson is good, bad or missed", () => {
    const lessonWith = (description: string) => `---\ndescription: ${JSON.stringify(description)}\nwhen_to_use: When counting issues.\n---\n`;
    expect(scoreCase(c, run([queued(lessonWith(c.good as string))]))).toMatchObject({ verdict: "good", outcome: "lesson", detail: "deferred/distill-review: ok", gate: "deferred/distill-review", status: "pending", scores: { novelty: 4 }, missing: [], forbidden: [] });
    const bad = scoreCase(c, run([queued(lessonWith(c.bad as string))]));
    expect(bad).toMatchObject({ verdict: "bad", outcome: "lesson" });
    expect(bad.forbidden.length).toBeGreaterThan(0);
    expect(scoreCase(c, run([]))).toMatchObject({ verdict: "missed", outcome: "skipped", detail: "lesson_exists", lesson: null });
    expect(scoreCase(c, run([], { outcome: "quality_rejected", reason: "restates" }))).toMatchObject({ verdict: "missed", outcome: "rejected", detail: "restates" });
  });

  test("scoreCase: a case that expects none is right unless a lesson was proposed", () => {
    expect(scoreCase(status, run([queued("---\ndescription: d\nwhen_to_use: w\n---\nBody.")]))).toMatchObject({ verdict: "wrong", outcome: "lesson", missing: [], forbidden: [], ratio: null });
    expect(scoreCase(status, run([]))).toMatchObject({ verdict: "right", outcome: "skipped" });
    expect(scoreCase(status, run([], { outcome: "quality_rejected", reason: "r" }))).toMatchObject({ verdict: "right", outcome: "rejected" });
    expect(scoreCase(status, run([], { ok: false, outcome: "validation_failed", error: "e" }))).toMatchObject({ verdict: "right", outcome: "invalid" });
  });

  test("scoreCase: the queue decides, so a lesson in any state counts, and the reason a lesson went to review is kept", () => {
    const review = { outcome: "review_needed", reason: "mean of 3", score: 3 };
    const row = scoreCase(status, run([queued("Body.", { status: "rejected", gate: "deferred/quality-review", reason: null, scores: null })], review));
    expect(row).toMatchObject({ verdict: "wrong", status: "rejected", detail: "deferred/quality-review: mean of 3" });
  });

  test("servedModels reads the names the endpoint reported from akm's usage report", () => {
    const usage = (...models: unknown[]) => ({ usageReport: { byProcessEngineModel: models.map((model) => ({ process: "distill", model })) } });
    expect(servedModels(usage("gpt-oss:120b", "openai/gpt-oss-120b", "gpt-oss:120b"))).toEqual(["gpt-oss:120b", "openai/gpt-oss-120b"]);
    expect(servedModels(usage(undefined, "", 7))).toEqual([]);
    expect(servedModels({ usageReport: { noCalls: [] } })).toEqual([]);
    expect(servedModels(null)).toEqual([]);
    const row = scoreCase(status, { improve: { ...usage("m-1"), actions: [{ mode: "distill", result: { outcome: "skipped", skipReason: "lesson_exists" } }] }, proposals: [], seconds: 1 });
    expect(row.served).toEqual(["m-1"]);
  });

  test("scoreCase: a failed run is an error, whatever the case expects", () => {
    expect(scoreCase(c, run([], { outcome: "llm_failed", message: "timeout" }))).toMatchObject({ verdict: "error", outcome: "error", error: "timeout" });
    expect(errorRow(status, "akm exited 78", 2)).toMatchObject({ verdict: "error", expect: "none", class: "dated-status", seconds: 2, error: "akm exited 78" });
  });
});

describe("metrics", () => {
  const row = (id: string, klass: Class, verdict: Row["verdict"], extra: Partial<Row> = {}): Row => ({
    ...errorRow({ id, class: klass, expect: klass === "lesson-worthy" || klass === "over-claim" ? "lesson" : "none" } as LoadedCase, "", 1),
    verdict,
    outcome: verdict === "good" || verdict === "bad" || verdict === "wrong" ? "lesson" : verdict === "right" ? "skipped" : verdict === "missed" ? "rejected" : "error",
    error: undefined,
    ...extra,
  });

  test("counts good lessons of the cases that expect one, wrong lessons of those that expect none, and each class", () => {
    const m = metrics([
      row("a", "lesson-worthy", "good"),
      row("b", "lesson-worthy", "bad", { missing: ["x"], forbidden: ["y"], ratio: 1.2 }),
      row("c", "over-claim", "bad", { ratio: 1.9 }),
      row("d", "over-claim", "missed"),
      row("e", "dated-status", "wrong"),
      row("f", "dated-status", "right"),
      row("g", "restates-asset", "right"),
      row("h", "duplicate-lesson", "error"),
    ]);
    expect(m.good_lessons).toEqual({ n: 4, good: 1, rate: 0.25 });
    expect(m.wrong_lessons).toEqual({ n: 3, wrong: 1, rate: 0.3333 });
    expect(m.by_class).toEqual({
      "lesson-worthy": { n: 2, good: 1, rate: 0.5 },
      "over-claim": { n: 2, good: 0, rate: 0 },
      "dated-status": { n: 2, wrong: 1, rate: 0.5 },
      "restates-asset": { n: 1, wrong: 0, rate: 0 },
      "duplicate-lesson": { n: 0, wrong: 0, rate: null },
    });
    expect(m.bad_by).toEqual({ missing_fact: 1, forbidden_claim: 1, too_long: 1 });
    expect(m.outcomes.lesson).toEqual({ lesson: 3, skipped: 0, rejected: 1, invalid: 0, error: 0 });
    expect(m.outcomes.none).toEqual({ lesson: 1, skipped: 2, rejected: 0, invalid: 0, error: 1 });
  });

  test("an empty run has no rates", () => {
    const m = metrics([]);
    expect(m.good_lessons).toEqual({ n: 0, good: 0, rate: null });
    expect(m.by_class).toEqual({});
  });
});

describe("failureMessage", () => {
  test("reads the JSON error akm prints on stderr", () => {
    expect(failureMessage(78, JSON.stringify({ ok: false, error: "engine unreachable", code: "LLM_NOT_CONFIGURED" }), "")).toBe("akm exited 78: engine unreachable (LLM_NOT_CONFIGURED)");
  });

  test("falls back to the last lines of what it printed", () => {
    expect(failureMessage(70, "line 1\nline 2\nline 3\nline 4", "")).toBe("akm exited 70: line 2 | line 3 | line 4");
    expect(failureMessage(70, "", "only stdout")).toBe("akm exited 70: only stdout");
  });
});
