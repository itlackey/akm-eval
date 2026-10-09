import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLASSES, type CaseRun, type Class, type LoadedCase, MAX_RATIO, type Proposal, type Row, type UpdateChecks, checkLesson, checkUpdate, claims, diffBody, distillConfig, distillOutcome, errorRow, failureMessage, lessonFile, lessonProposals, lessonText, loadCases, memoryBody, memoryRef, mentions, metrics, modelCalls, normalize, scoreCase, selectCases, servedModels } from "./lib.ts";

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
    if (c.expect === "update" && c.existing !== "missing" && c.existing !== undefined) {
      mkdirSync(join(root, "bundles", c.id as string, "lessons"), { recursive: true });
      writeFileSync(join(root, "bundles", c.id as string, "lessons", `${c.existing}.md`), "---\ndescription: d\n---\nThe old rule.\n");
    }
  }
  return root;
}

const lessonCase = (extra: Record<string, unknown> = {}) => ({ id: "l1", class: "lesson-worthy", expect: "lesson", required: [["a fact"]], forbidden: [["a claim"]], good: "g", bad: "b", note: "n", ...extra });
const updateCase = (extra: Record<string, unknown> = {}) => ({ id: "u1", class: "lesson-update", expect: "update", existing: "old", required: [["a new fact"]], forbidden: [["a claim"]], good: "g", bad: "b", note: "n", ...extra });
const noneCase = (extra: Record<string, unknown> = {}) => ({ id: "n1", class: "dated-status", expect: "none", note: "n", ...extra });

describe("loadCases", () => {
  test("reads the public cases: 38, in six classes", () => {
    const cases = loadCases(PUBLIC);
    expect(cases).toHaveLength(38);
    const count = (k: Class) => cases.filter((c) => c.class === k).length;
    expect(CLASSES.map(count)).toEqual([8, 6, 6, 5, 5, 8]);
    expect(new Set(cases.map((c) => c.id)).size).toBe(38);
    for (const c of cases) expect(c.memory.startsWith("---\n")).toBe(true);
  });

  test("a case that expects a lesson holds facts, claims and two examples; one that expects none holds none of them", () => {
    for (const c of loadCases(PUBLIC)) {
      if (c.expect === "lesson") {
        expect(c.required.length).toBeGreaterThanOrEqual(3);
        expect(c.forbidden.length).toBeGreaterThanOrEqual(2);
        expect(c.good && c.bad).toBeTruthy();
      } else if (c.expect === "update") {
        expect(c.required.length).toBeGreaterThanOrEqual(1);
        expect(c.forbidden.length).toBeGreaterThanOrEqual(3);
        expect(c.good && c.bad && c.existing && c.existingBody).toBeTruthy();
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
      if (c.class === "lesson-update") expect(files.filter((f) => f.startsWith("lessons/"))).toEqual([`lessons/${c.existing}.md`]);
    }
  });

  test("an update case holds its lesson under another name, so distill does not skip the memory", () => {
    for (const c of loadCases(PUBLIC).filter((c) => c.class === "lesson-update")) expect(existsSync(join(c.dir, lessonFile(c)))).toBe(false);
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
    expect(loadCases(assetsWith([updateCase()]))[0]).toMatchObject({ expect: "update", existing: "old", existingBody: "The old rule." });
    fails([updateCase({ existing: undefined })], '"existing"');
    fails([updateCase({ existing: "memory-m-lesson" })], "would skip the memory");
    fails([updateCase({ existing: "missing" })], '"existing"');
    fails([updateCase({ required: [] })], "expects an update");
    fails([updateCase({ expect: "lesson" })], "expects update");
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
    expect(selectCases(cases, 6).map((c) => c.id)).toEqual(["lesson-01", "claim-01", "status-01", "asset-01", "dup-01", "upd-01"]);
    expect(selectCases(cases, 7).map((c) => c.id)).toEqual(["lesson-01", "lesson-02", "claim-01", "status-01", "asset-01", "dup-01", "upd-01"]);
  });

  test("a limit at or above the size runs everything", () => {
    expect(selectCases(cases, 38)).toHaveLength(38);
    expect(selectCases(cases, 99)).toHaveLength(38);
    expect(selectCases(cases)).toHaveLength(38);
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

  test("a denial or a doubt counts when it is within six words before the phrase or three after, and not when it is farther", () => {
    expect(claims("It may vary a lot between teams and projects, and the fix works on all layouts.", [["works on all layouts"]])).toEqual(["works on all layouts"]);
    expect(claims("The fix works on all layouts, which is unconfirmed.", [["works on all layouts"]])).toEqual([]);
    expect(claims("Ensure test suites explicitly exercise every format defined in production configs, not just the modern ones.", [["exercise every"]])).toEqual(["exercise every"]);
    expect(claims("We cannot say that the fix works on all layouts.", [["works on all layouts"]])).toEqual([]);
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

describe("the public update cases check themselves", () => {
  for (const c of loadCases(PUBLIC).filter((c) => c.expect === "update")) {
    describe(c.id, () => {
      const body = memoryBody(c.memory);
      const existing = c.existingBody as string;

      test("every new fact is in the memory and not in the existing lesson, and no forbidden claim is in either", () => {
        for (const fact of c.required) {
          expect(fact.some((p) => mentions(body, p)), `in the memory: ${fact[0]}`).toBe(true);
          expect(fact.some((p) => mentions(existing, p)), `already in the lesson: ${fact[0]}`).toBe(false);
        }
        for (const group of c.forbidden) for (const p of group) expect([mentions(body, p), mentions(existing, p)], `forbidden: ${p}`).toEqual([false, false]);
      });

      test("the memory restates the lesson, so it shares words with it", () => {
        const lessonWords = new Set(normalize(existing).split(" ").filter((w) => w.length > 3));
        const shared = normalize(body).split(" ").filter((w) => lessonWords.has(w));
        expect(new Set(shared).size).toBeGreaterThanOrEqual(3);
      });

      test("the good body keeps every line and adds the facts; the bad one adds a forbidden claim", () => {
        expect(checkUpdate(c, existing, c.good as string)).toMatchObject({ dropped: [], missing: [], forbidden: [] });
        const bad = checkUpdate(c, existing, c.bad as string);
        expect(bad.dropped).toEqual([]);
        expect(bad.forbidden.length).toBeGreaterThan(0);
      });
    });
  }
});

describe("diffBody and checkUpdate", () => {
  const existing = "- Wait for the first row.\n- A sleep hides the race.\n";

  test("a body that keeps every line and adds some drops nothing; the added lines are as written", () => {
    expect(diffBody(existing, "- Wait for the first row.\n- A sleep hides the race.\n- The export takes 10 s.\n")).toEqual({ dropped: [], added: ["- The export takes 10 s."] });
  });

  test("lines match in any case and spacing, and wherever they sit in the body", () => {
    expect(diffBody(existing, "A  sleep hides THE race!\nNew line.\nWait for the first row\n")).toEqual({ dropped: [], added: ["New line."] });
  });

  test("a reworded, shortened or dropped line is dropped", () => {
    expect(diffBody(existing, "- Wait for the first table row.\n- A sleep hides the race.\n").dropped).toEqual(["wait for the first row"]);
    expect(diffBody(existing, "- Wait for the first row.\n").dropped).toEqual(["a sleep hides the race"]);
    expect(diffBody(existing, "").dropped).toHaveLength(2);
  });

  test("nothing added is an empty list", () => {
    expect(diffBody(existing, existing).added).toEqual([]);
  });

  const c = { required: [["10 s", "10 seconds"], ["ceiling"]], forbidden: [["always"]] };

  test("the new facts are looked for in the added lines only, and so are the claims", () => {
    expect(checkUpdate(c, existing, `${existing}The export has a 10 s ceiling.\n`)).toMatchObject({ missing: [], forbidden: [] });
    expect(checkUpdate(c, existing, `${existing}The export has a ceiling.\n`).missing).toEqual(["10 s"]);
    expect(checkUpdate(c, existing, `${existing}A 10 s ceiling, always.\n`).forbidden).toEqual(["always"]);
    // the fact is in an existing line, not an added one
    expect(checkUpdate({ required: [["race"]], forbidden: [] }, existing, `${existing}Nothing new.\n`).missing).toEqual(["race"]);
  });
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

  test("lessonProposals marks the proposals that extend an existing lesson: the gate reason is distill-update", () => {
    const found = lessonProposals([
      { status: "pending", proposals: [proposal(), proposal({ ref: "bundle//lessons/old", gateDecision: { outcome: "deferred", reason: "distill-update", judgeReason: "adds a limit" } })] },
    ]);
    expect(found.map((p) => [p.ref, p.update, p.gate])).toEqual([
      ["bundle//lessons/memory-m-lesson", false, "deferred/distill-review"],
      ["bundle//lessons/old", true, "deferred/distill-update"],
    ]);
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
  const queued = (content: string, extra: Partial<Proposal> = {}): Proposal => ({ ref: "bundle//lessons/x", status: "pending", gate: "deferred/distill-review", scores: { novelty: 4 }, reason: "ok", content, update: false, ...extra });
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

  test("scoreCase: a lesson the judge rejected keeps the judge's scores and reason, and the rest of the row is as before", () => {
    const rejected = { outcome: "quality_rejected", reason: "restates the memory", score: 2.3, criteria: { novelty: 2, nonRedundancy: 1, grounding: 4 } };
    const row = scoreCase(c, run([], rejected));
    expect(row).toMatchObject({ verdict: "missed", outcome: "rejected", detail: "restates the memory", lesson: null, status: null, gate: null, scores: { novelty: 2, nonRedundancy: 1, grounding: 4 } });
    // without the new fields the row has the same verdict, outcome and detail
    const { criteria: _c, score: _s, ...bare } = rejected;
    expect(scoreCase(c, run([], bare))).toMatchObject({ verdict: row.verdict, outcome: row.outcome, detail: row.detail, scores: null });
    // a skip carries no judge evidence, whatever else the result holds
    expect(scoreCase(c, run([], { outcome: "skipped", skipReason: "x", score: 4, criteria: { novelty: 4 } }))).toMatchObject({ outcome: "skipped", scores: null });
  });

  test("scoreCase: the text of a rejected lesson comes from akm's result, null when its build does not report it or the lesson was queued", () => {
    const rejected = { outcome: "quality_rejected", reason: "r", score: 2, criteria: { novelty: 2 }, rejectedContent: "---\ndescription: d\n---\nthe lesson" };
    expect(scoreCase(c, run([], rejected)).rejected_lesson).toBe("---\ndescription: d\n---\nthe lesson");
    const { rejectedContent: _t, ...older } = rejected;
    expect(scoreCase(c, run([], older)).rejected_lesson).toBeNull();
    expect(scoreCase(c, run([], { outcome: "skipped", skipReason: "x", rejectedContent: "t" })).rejected_lesson).toBeNull();
    expect(scoreCase(status, run([queued("Body.")], { outcome: "review_needed", reason: "r", rejectedContent: "t" })).rejected_lesson).toBeNull();
  });

  test("scoreCase: a lesson sent to review with no gate scores gets the judge's from akm's result", () => {
    const review = { outcome: "review_needed", reason: "mean of 3", score: 3, criteria: { novelty: 3 } };
    expect(scoreCase(status, run([queued("Body.", { scores: null })], review))).toMatchObject({ scores: { novelty: 3 } });
    expect(scoreCase(status, run([queued("Body.", { scores: { novelty: 4 } })], review))).toMatchObject({ scores: { novelty: 4 } });
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

  describe("scoreCase: a lesson-update case", () => {
    const u = loadCases(PUBLIC).find((x) => x.id === "upd-02") as LoadedCase;
    const front = "---\ndescription: d\nwhen_to_use: w\ntype: lesson\nxrefs:\n  - memories/m\n---\n";
    const update = (body: string, extra: Partial<Proposal> = {}): Proposal => queued(front + body, { ref: `bundle//lessons/${u.existing}`, gate: "deferred/distill-update", update: true, ...extra });
    const all: UpdateChecks = { update_proposed: true, existing_kept: true, new_facts: true, no_extra_claims: true, no_new_lesson: true };

    test("right when one pending update on the existing lesson keeps every line, adds the facts and claims nothing else", () => {
      const row = scoreCase(u, run([update(u.good as string)]));
      expect(row).toMatchObject({ verdict: "right", outcome: "update", checks: all, gate: "deferred/distill-update", status: "pending", missing: [], forbidden: [], ratio: null });
      expect(row.added).toEqual(["The runner has sorted the test files by name since version 4.2, which is when the order changed."]);
    });

    test("bad, naming the check that failed: a dropped line, a missing fact, a claim", () => {
      const lines = (u.good as string).split("\n");
      expect(scoreCase(u, run([update(lines.slice(1).join("\n"))]))).toMatchObject({ verdict: "bad", checks: { ...all, existing_kept: false } });
      expect(scoreCase(u, run([update(`${lines.slice(0, 2).join("\n")}\nThe order changed.`)]))).toMatchObject({ verdict: "bad", checks: { ...all, new_facts: false }, missing: ["sorted * by name", "4.2"] });
      const over = scoreCase(u, run([update(u.bad as string)]));
      expect(over).toMatchObject({ verdict: "bad", checks: { ...all, no_extra_claims: false } });
      expect(over.forbidden.length).toBeGreaterThan(0);
    });

    test("an update that adds nothing has no new facts", () => {
      const row = scoreCase(u, run([update(`${(u.good as string).split("\n").slice(0, 2).join("\n")}\n`)]));
      expect(row).toMatchObject({ verdict: "bad", checks: { ...all, new_facts: false }, added: [] });
    });

    test("a new lesson instead of the update is bad, and so is a new lesson beside it", () => {
      const lesson = queued("---\ndescription: d\nwhen_to_use: w\n---\nCreate its own data.");
      expect(scoreCase(u, run([lesson]))).toMatchObject({ verdict: "bad", outcome: "lesson", checks: { update_proposed: false, existing_kept: null, new_facts: null, no_extra_claims: null, no_new_lesson: false } });
      expect(scoreCase(u, run([update(u.good as string), lesson]))).toMatchObject({ verdict: "bad", outcome: "update", checks: { ...all, no_new_lesson: false } });
    });

    test("an update on another lesson, or one that is not pending, is not the update", () => {
      expect(scoreCase(u, run([update(u.good as string, { ref: "bundle//lessons/another" })])).checks).toMatchObject({ update_proposed: false, existing_kept: null });
      expect(scoreCase(u, run([update(u.good as string, { status: "rejected" })])).checks).toMatchObject({ update_proposed: false });
    });

    test("no proposal is missed, for a skip and for a judge's rejection; that is the result of akm without #1090 too", () => {
      expect(scoreCase(u, run([], { outcome: "skipped", skipReason: "nothing_reusable" }))).toMatchObject({ verdict: "missed", outcome: "skipped", checks: { update_proposed: false, existing_kept: null, new_facts: null, no_extra_claims: null, no_new_lesson: true }, added: null });
      expect(scoreCase(u, run([], { outcome: "quality_rejected", reason: "redundant" }))).toMatchObject({ verdict: "missed", outcome: "rejected" });
    });
  });

  test("scoreCase: an update proposal is its own outcome. It is wrong for a case that expects none, and missed for a case that expects a new lesson", () => {
    const update = queued("---\ndescription: d\nwhen_to_use: w\n---\nBody.", { gate: "deferred/distill-update", update: true });
    expect(scoreCase(status, run([update]))).toMatchObject({ verdict: "wrong", outcome: "update", gate: "deferred/distill-update" });
    const row = scoreCase(c, run([update]));
    expect(row).toMatchObject({ verdict: "missed", outcome: "update", missing: [], forbidden: [], ratio: null });
    expect(row.lesson).toContain("Body.");
  });

  test("modelCalls adds up the calls in akm's usage report, and is null without one", () => {
    expect(modelCalls({ usageReport: { byProcessEngineModel: [{ model: "a", calls: 3 }, { model: "b", calls: 1 }] } })).toBe(4);
    expect(modelCalls({ usageReport: { byProcessEngineModel: [] } })).toBe(0);
    expect(modelCalls({ ok: true })).toBeNull();
    expect(modelCalls(null)).toBeNull();
    expect(scoreCase(c, { improve: { usageReport: { byProcessEngineModel: [{ model: "a", calls: 2 }] }, actions: [{ mode: "distill", result: { outcome: "skipped", skipReason: "nothing_reusable" } }] }, proposals: [], seconds: 1 }).calls).toBe(2);
  });

  test("scoreCase: a failed run is an error, whatever the case expects", () => {
    expect(scoreCase(c, run([], { outcome: "llm_failed", message: "timeout" }))).toMatchObject({ verdict: "error", outcome: "error", error: "timeout" });
    expect(errorRow(status, "akm exited 78", 2)).toMatchObject({ verdict: "error", expect: "none", class: "dated-status", seconds: 2, error: "akm exited 78" });
  });
});

describe("metrics", () => {
  const row = (id: string, klass: Class, verdict: Row["verdict"], extra: Partial<Row> = {}): Row => ({
    ...errorRow({ id, class: klass, expect: klass === "lesson-worthy" || klass === "over-claim" ? "lesson" : klass === "lesson-update" ? "update" : "none" } as LoadedCase, "", 1),
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
    expect(m.outcomes.lesson).toEqual({ lesson: 3, update: 0, skipped: 0, rejected: 1, invalid: 0, error: 0 });
    expect(m.outcomes.none).toEqual({ lesson: 1, update: 0, skipped: 2, rejected: 0, invalid: 0, error: 1 });
    expect(m.lesson_updates).toMatchObject({ n: 0, right: 0, rate: null });
  });

  test("lesson updates are counted apart: they are in neither good_lessons nor wrong_lessons", () => {
    const ok: UpdateChecks = { update_proposed: true, existing_kept: true, new_facts: true, no_extra_claims: true, no_new_lesson: true };
    const upd = (id: string, verdict: Row["verdict"], outcome: Row["outcome"], checks: UpdateChecks | null) => ({ ...row(id, "lesson-update", verdict, { outcome, checks }), expect: "update" as const });
    const m = metrics([
      row("a", "lesson-worthy", "good"),
      row("b", "duplicate-lesson", "right"),
      row("c", "duplicate-lesson", "wrong", { outcome: "update" }),
      upd("u1", "right", "update", ok),
      upd("u2", "bad", "update", { ...ok, new_facts: false }),
      upd("u3", "bad", "lesson", { update_proposed: false, existing_kept: null, new_facts: null, no_extra_claims: null, no_new_lesson: false }),
      upd("u4", "missed", "skipped", { update_proposed: false, existing_kept: null, new_facts: null, no_extra_claims: null, no_new_lesson: true }),
      upd("u5", "error", "error", null),
    ]);
    expect(m.good_lessons).toEqual({ n: 1, good: 1, rate: 1 });
    expect(m.wrong_lessons).toEqual({ n: 2, wrong: 1, rate: 0.5 });
    expect(m.lesson_updates).toEqual({ n: 4, right: 1, rate: 0.25, checks: { update_proposed: 2, existing_kept: 2, new_facts: 1, no_extra_claims: 2, no_new_lesson: 3 } });
    expect(m.by_class["lesson-update"]).toEqual({ n: 4, right: 1, rate: 0.25 });
    expect(m.outcomes.update).toEqual({ lesson: 1, update: 2, skipped: 1, rejected: 0, invalid: 0, error: 1 });
    expect(m.outcomes.none.update).toBe(1);
    expect(m.bad_by).toEqual({ missing_fact: 0, forbidden_claim: 0, too_long: 0 });
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
