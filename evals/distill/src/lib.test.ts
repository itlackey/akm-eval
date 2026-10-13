import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLASSES, type CaseRun, type Class, type LoadedCase, MAX_COPIED, MAX_RATIO, type Proposal, type Row, type UpdateChecks, assetsSha256, checkLesson, checkUpdate, claims, copiedShare, corpusFolder, diffBody, digestOf, distillConfig, distillOutcome, errorRow, lessonFile, lessonProposals, lessonText, loadCases, memoryBody, memoryRef, mentions, metrics, modelCalls, normalize, readClaims, readStated, scoreCase, selectCases, servedModels, stated, timedOutMessage } from "./lib.ts";

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
  test("reads the public cases: 96, in six classes", () => {
    const cases = loadCases(PUBLIC);
    expect(cases).toHaveLength(96);
    const count = (k: Class) => cases.filter((c) => c.class === k).length;
    expect(CLASSES.map(count)).toEqual([23, 17, 6, 5, 5, 40]);
    expect(new Set(cases.map((c) => c.id)).size).toBe(96);
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
        expect([c.required, c.forbidden, c.contradicts, c.good, c.bad, c.reversed]).toEqual([[], [], [], undefined, undefined, undefined]);
      }
    }
  });

  test("every lesson, over-claim and update case lists what would contradict it, and has a reversed lesson", () => {
    const cases = loadCases(PUBLIC).filter((c) => c.expect !== "none");
    expect(cases).toHaveLength(80);
    for (const c of cases) {
      expect(c.contradicts.length, `${c.id}: contradicts`).toBeGreaterThanOrEqual(1);
      expect(c.reversed?.trim(), `${c.id}: reversed`).toBeTruthy();
      expect(c.reversed, `${c.id}: reversed is not good`).not.toBe(c.good);
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
    fails([noneCase({ required: [["x"]] })], "no required, forbidden, contradicts or reversed");
    fails([noneCase({ contradicts: [["x"]] })], "no required, forbidden, contradicts or reversed");
    fails([noneCase({ reversed: "A lesson." })], "no required, forbidden, contradicts or reversed");
    expect(loadCases(assetsWith([lessonCase()]))[0].contradicts).toEqual([]); // optional: a case without it is scored without it
    expect(loadCases(assetsWith([lessonCase({ contradicts: [["a reversal"]], reversed: "r" })]))[0]).toMatchObject({ contradicts: [["a reversal"]], reversed: "r" });
    fails([lessonCase({ contradicts: [["###"]] })], "a letter or a digit");
    fails([lessonCase({ contradicts: ["a reversal"] })], "list of lists");
    fails([lessonCase({ reversed: " " })], '"reversed" example');
    fails([lessonCase({ reversed: 7 })], '"reversed" example');
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
    expect(selectCases(cases, 96)).toHaveLength(96);
    expect(selectCases(cases, 99)).toHaveLength(96);
    expect(selectCases(cases)).toHaveLength(96);
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

  test("a word written with a leading = matches that word only, and not as a noun after the, a or its", () => {
    expect(mentions("Wait for networkidle.", "=wait for networkidle")).toBe(true);
    expect(mentions("You should wait for networkidle.", "=wait for networkidle")).toBe(true);
    expect(mentions("The test timed out waiting for networkidle.", "=wait for networkidle")).toBe(false);
    expect(mentions("It waits for networkidle.", "=wait for networkidle")).toBe(false);
    expect(mentions("The wait for networkidle ends at the timeout.", "=wait for networkidle")).toBe(false);
    expect(mentions("Its wait for networkidle ends at the timeout.", "=wait for networkidle")).toBe(false);
    expect(mentions("The test timed out waiting for networkidle.", "wait for networkidle")).toBe(true); // without the =, a word is a prefix
    expect(mentions("Use networkidle.", "=use networkidle")).toBe(true);
    expect(mentions("Used networkidle.", "=use networkidle")).toBe(false);
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

  describe("a doubt excuses a claim only when it governs it: before it in its own clause, or an unconfirmed after it (#56)", () => {
    const layouts = [["works * all * layout", "work on all layouts"]];

    test("a doubt about something else, in the sentence of the claim, does not excuse it", () => {
      for (const text of [
        "The fix works on all layouts, which could save a rebuild.",
        "The fix works on all layouts if you build with Paged.js.",
        "You may rely on this: the fix works on all layouts.",
        "It may vary between teams, but the fix works on all layouts.",
        "We could not say more. The fix works on all layouts.",
        "If you use Paged.js, the fix works on all layouts.",
        "The fix works on all layouts (you might want a rebuild).",
      ]) expect(claims(text, layouts), text).toEqual(["works * all * layout"]);
    });

    test("a doubt in the claim's own clause, before it, still excuses it, and so does an unconfirmed that follows it", () => {
      for (const text of [
        "The fix may work on all layouts.",
        "It may be that the fix works on all layouts.",
        "It is unconfirmed whether the fix works on all layouts.",
        "Perhaps the fix works on all layouts.",
        "I suspect the fix works on all layouts.",
        "We do not know if it works on all layouts.",
        "The fix works on all layouts, which is unconfirmed.",
        "The fix works on all layouts (unverified).",
        "The fix works on all layouts - untested.",
      ]) expect(claims(text, layouts), text).toEqual([]);
    });

    test("a doubt farther than six words from the claim, in its clause, does not excuse it either", () => {
      expect(claims("It may be so for the rulebook and the supplement and the fix works on all layouts.", layouts)).toEqual(["works * all * layout"]);
    });

    test("an action is bound the same way: a contradiction is excused by a doubt of its own clause, not of the sentence", () => {
      const wait = [["=wait for networkidle"]];
      expect(claims("You may rely on it: wait for networkidle on every page.", wait, true)).toEqual(["=wait for networkidle"]);
      expect(claims("Wait for networkidle on every page, which could save a rebuild.", wait, true)).toEqual(["=wait for networkidle"]);
      expect(claims("It is unconfirmed whether you should wait for networkidle.", wait, true)).toEqual([]);
      expect(claims("Wait for networkidle, which is unconfirmed.", wait, true)).toEqual([]);
    });

    test("claim-01: the sentences of the review turn a good lesson into a bad one, and the hedged ones leave it good", () => {
      const c = loadCases(PUBLIC).find((x) => x.id === "claim-01") as LoadedCase;
      const good = c.good as string;
      expect(checkLesson(c, good, c.memory)).toMatchObject({ good: true, forbidden: [] });
      for (const sentence of ["The fix works on all layouts, which could save a rebuild.", "The fix works on all layouts if you build with Paged.js.", "You may rely on this: the fix works on all layouts."]) {
        expect(checkLesson(c, `${good} ${sentence}`, c.memory), sentence).toMatchObject({ good: false, forbidden: ["works * all * layout"] });
      }
      for (const sentence of ["It may be that the fix works on all layouts.", "It is unconfirmed whether the fix works on all layouts.", "The fix works on all layouts, which is unconfirmed."]) {
        expect(checkLesson(c, `${good} ${sentence}`, c.memory), sentence).toMatchObject({ good: true, forbidden: [] });
      }
    });
  });

  test("the words of the phrase itself do not count as a denial", () => {
    expect(claims("Upgrading has no limit.", groups)).toEqual(["no limit"]);
  });

  test("a sentence ends at a full stop, a line break or a semicolon, not at the dot in a number", () => {
    expect(claims("The size is 0.125 inch and is enough", groups)).toEqual(["is enough"]);
    expect(claims("Not sure.\nIt is enough", groups)).toEqual(["is enough"]);
    expect(claims("Not sure; it is enough", groups)).toEqual(["is enough"]);
  });

  describe("an action, as a contradiction names it, is also denied by a prohibition in its clause", () => {
    const wait = [["=wait for networkidle"]];
    const gerund = [["wait for networkidle"]];
    const heading = [["wait for the heading"]];

    test("a claim is read as it always was: never, avoid and the like do not deny it", () => {
      expect(claims("Never wait for networkidle.", wait)).toEqual(["=wait for networkidle"]);
      expect(claims("Never wait for networkidle and use waitForSelector.", [["waitForSelector"]])).toEqual(["waitForSelector"]);
      expect(claims("Do not wait for networkidle.", wait)).toEqual([]);
    });

    test("never, avoid, without, stop, skip, instead of and rather than", () => {
      expect(claims("Wait for networkidle on pages with a polling widget.", wait, true)).toEqual(["=wait for networkidle"]);
      for (const text of ["Never wait for networkidle.", "You should never wait for networkidle.", "Do not wait for networkidle.", "Don't wait for networkidle."]) expect(claims(text, wait, true), text).toEqual([]);
      expect(claims("Waiting for networkidle on every page.", gerund, true)).toEqual(["wait for networkidle"]);
      for (const before of ["Avoid", "Try to avoid", "Stop", "Skip", "Instead of", "Rather than", "Finish without"]) {
        const text = `${before} waiting for networkidle.`;
        expect(claims(text, gerund, true), text).toEqual([]);
      }
    });

    test("a prohibition ends where its clause does", () => {
      expect(claims("Never use networkidle, wait for the heading.", heading, true)).toEqual(["wait for the heading"]);
      expect(claims("Never rely on networkidle but wait for the heading.", heading, true)).toEqual(["wait for the heading"]);
      expect(claims("Instead of waiting for networkidle, wait for the heading.", heading, true)).toEqual(["wait for the heading"]);
      expect(claims("Never wait for the heading to settle.", heading, true)).toEqual([]);
    });

    test("a phrase that comes twice is asserted when any one of them is", () => {
      expect(claims("Never wait for networkidle. Wait for networkidle on every page.", wait, true)).toEqual(["=wait for networkidle"]);
      expect(claims("Never wait for networkidle, and then wait for networkidle.", wait, true)).toEqual(["=wait for networkidle"]);
      expect(claims("Never wait for networkidle and never wait for networkidle.", wait, true)).toEqual([]);
      expect(claims("Not enough, but it is enough.", [["is enough"]])).toEqual([]); // a claim is denied by a denial in its sentence, as before
    });

    test("a doubt or a denial works as it did", () => {
      expect(claims("It is unconfirmed whether you should wait for networkidle.", wait, true)).toEqual([]);
      expect(claims("The fix works on all layouts, which is unconfirmed.", [["works on all layouts"]], true)).toEqual([]);
    });

    test("a noun is not an action: the wait for networkidle is not an instruction to wait for it", () => {
      expect(claims("The wait for networkidle ends at the test timeout.", wait, true)).toEqual([]);
      expect(claims("The test timed out waiting for networkidle.", wait, true)).toEqual([]);
    });
  });

  describe("a negation that governs a verb that denies is cancelled out, and the action is asserted", () => {
    const wait = [["=wait for networkidle"]];
    const gerund = [["wait for networkidle"]];

    test("a contradiction recommended in words that look like a denial is asserted: hesitate, forget, fail, neglect, omit, refuse, decline", () => {
      for (const text of [
        "Do not hesitate to wait for networkidle.",
        "Don't hesitate to wait for networkidle.",
        "Do not forget to wait for networkidle.",
        "Never fail to wait for networkidle.",
        "You must never neglect to wait for networkidle.",
        "Do not omit to wait for networkidle.",
        "Do not refuse to wait for networkidle.",
        "Do not decline to wait for networkidle.",
        "Do not ever forget to wait for networkidle.",
        "Do not be afraid to wait for networkidle.",
        "It is not wrong to wait for networkidle.",
        "There is no reason not to wait for networkidle.",
        "Why not wait for networkidle?",
      ]) expect(claims(text, wait, true), text).toEqual(["=wait for networkidle"]);
    });

    test("so is one that a prohibition of the caller's cancels: do not avoid, stop or skip waiting", () => {
      for (const text of ["Do not avoid waiting for networkidle.", "Never stop waiting for networkidle.", "Do not skip waiting for networkidle.", "No need to avoid waiting for networkidle.", "Do not hesitate to wait for networkidle."]) {
        expect(claims(text, gerund, true), text).toEqual(["wait for networkidle"]);
      }
    });

    test("a direct denial, an indirect one, and a denial of a denial that is itself denied stay denied", () => {
      for (const text of [
        "Do not wait for networkidle.",
        "Never wait for networkidle.",
        "Don't wait for networkidle.",
        "There is no need to wait for networkidle.",
        "Try not to wait for networkidle.",
        "Avoid having to wait for networkidle.",
        "Rather than wait for networkidle, wait for the heading.",
        "Do not forget to avoid waiting for networkidle.",
        "Never fail to avoid waiting for networkidle.",
        "Do not hesitate to avoid waiting for networkidle.",
        "Do not hesitate to skip waiting for networkidle.",
        "Do not hesitate to not wait for networkidle.",
        "Do not hesitate to never wait for networkidle.",
      ]) expect(claims(text, [...wait, ...gerund], true), text).toEqual([]);
    });

    test("the negation is bound to the action it governs: a negation in another clause does not deny it", () => {
      expect(claims("Do not worry, wait for networkidle.", wait, true)).toEqual(["=wait for networkidle"]);
      expect(claims("Do not trust the timeout, wait for networkidle on this page.", wait, true)).toEqual(["=wait for networkidle"]);
      expect(claims("Do not use waitForSelector but wait for networkidle.", wait, true)).toEqual(["=wait for networkidle"]);
      // the same clause still denies it, whatever the words between: the six before the phrase are read
      expect(claims("Do not rely on the timeout to wait for networkidle.", wait, true)).toEqual([]);
      // and a negation that governs a verb the rule does not list stands, which is the approximation the README names
      expect(claims("Do not think it is wise to wait for networkidle.", wait, true)).toEqual([]);
    });

    test("a fact is asserted by 'we do not hesitate to say it', and still denied by 'we do not say it' and by a doubt", () => {
      const fact = [["works on all layouts"]];
      expect(claims("We do not hesitate to say it works on all layouts.", fact)).toEqual(["works on all layouts"]);
      expect(claims("We never fail to confirm that it works on all layouts.", fact)).toEqual(["works on all layouts"]);
      expect(claims("We do not say it works on all layouts.", fact)).toEqual([]);
      expect(claims("We do not hesitate to say it might work on all layouts.", [["work on all layouts"]])).toEqual([]);
    });

    test("a doubt still leaves the action unasserted, as it did", () => {
      expect(claims("It is unconfirmed whether you should not hesitate to wait for networkidle.", wait, true)).toEqual([]);
    });
  });
});

describe("stated", () => {
  // The first two are actions, which a lesson must assert; toBeVisible is a thing it mentions.
  const heading = ["+wait * heading", "+wait * visible", "toBeVisible"];

  test("a phrase in a sentence states the fact", () => {
    expect(stated("Wait for the page heading to be visible.", heading)).toBe(true);
    expect(stated("Assert expect(heading).toBeVisible().", heading)).toBe(true);
    expect(stated("The chat widget polls every 20 seconds.", heading)).toBe(false);
  });

  test("an action that is denied or reversed right before it is not stated", () => {
    for (const before of ["Never", "Do not", "Don't", "You should not", "Avoid", "Do not ever", "There is no need to", "Stop", "Skip", "Try not to", "Without", "Instead of", "Rather than", "Do not try to"]) {
      const text = `${before} wait for the visible heading.`;
      expect(stated(text, heading), text).toBe(false);
    }
    expect(stated("Avoid waiting for the heading.", heading)).toBe(false);
    expect(stated("Never wait for the visible heading", heading)).toBe(false);
  });

  test("an action is stated when the negation before it is cancelled out, and not when a denial of a denial is denied again", () => {
    for (const before of ["Do not hesitate to", "Don't forget to", "Never fail to", "Do not neglect to", "Do not refuse to", "Do not ever forget to", "Do not be afraid to", "Do not avoid", "Do not stop", "Do not skip", "No need to avoid", "There is no reason not to", "Why not", "It is not wrong to"]) {
      const text = `${before} wait for the visible heading.`;
      expect(stated(text, heading), text).toBe(true);
    }
    for (const before of ["Do not hesitate to not", "Never fail to avoid", "Do not forget to never", "Do not hesitate to skip"]) {
      const text = `${before} wait for the visible heading.`;
      expect(stated(text, heading), text).toBe(false);
    }
  });

  test("a negation that is farther away, or in another clause, does not stop an action being stated", () => {
    expect(stated("Do not wait for networkidle, wait for the heading.", heading)).toBe(true);
    expect(stated("Do not wait for networkidle but wait for the heading to be visible.", heading)).toBe(true);
    expect(stated("Instead of waiting for networkidle, wait for the heading.", heading)).toBe(true);
    expect(stated("Do not wait for networkidle; wait for the heading.", heading)).toBe(true);
    expect(stated("Do not rely on networkidle. Wait for the heading.", heading)).toBe(true);
  });

  test("an action that is stated once is stated, however often it is also denied", () => {
    expect(stated("Never wait for the heading. On a slow page, wait for the heading to be visible.", heading)).toBe(true);
    expect(stated("Never wait for the heading and never wait for the heading.", heading)).toBe(false);
  });

  test("a phrase without + is a thing to mention, and a negation next to it does not unstate it", () => {
    expect(stated("The invoice-service was not checked.", ["invoice"])).toBe(true);
    expect(stated("A list that cannot exceed 30 results.", ["30"])).toBe(true);
    expect(stated("It returns no more than 30 results.", ["30"])).toBe(true);
    expect(stated("The test did not finish because the widget polls every 20 seconds.", ["poll"])).toBe(true);
    expect(stated("Set the ttl to 60 instead of 3600.", ["3600"])).toBe(true);
    expect(stated("Wait for the heading rather than networkidle.", ["networkidle"])).toBe(true);
    expect(stated("Push annotated tags, not lightweight tags.", ["lightweight"])).toBe(true);
    expect(stated("Don't rely on networkidle.", ["networkidle"])).toBe(true);
    expect(stated("It is unconfirmed whether 0.125 is enough.", ["unconfirmed"])).toBe(true);
  });

  test("a phrase starting with = is matched as in claims", () => {
    expect(stated("The test timed out waiting for networkidle.", ["=wait for networkidle"])).toBe(false);
    expect(stated("Wait for networkidle.", ["=wait for networkidle"])).toBe(true);
  });

  test("the + is not part of the phrase", () => {
    expect(mentions("Wait for the heading.", "+wait * heading")).toBe(true);
    expect(stated("Wait for the heading.", ["wait * heading"])).toBe(true);
    expect(stated("Never wait for the heading.", ["wait * heading"])).toBe(true); // without the +, a negation next to it does not matter
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
    expect(k).toEqual({ missing: [], forbidden: [], contradicted: [], ambiguous: [], ratio: 0.2, copied: 0, good: true });
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

  test("a copy of the memory is not a lesson: it states the facts, claims nothing, is not too long, and is bad (#55)", () => {
    const real = "The default is 30 and nobody warned us, so the audit counted only the first page and missed the rest. Pass a limit to see them all. The same holds for pull requests.";
    const file = `---\ndescription: d\n---\n${real}\n`;
    expect(checkLesson(c, real, file)).toMatchObject({ missing: [], forbidden: [], contradicted: [], ratio: 1, copied: 1, good: false });
    expect(checkLesson(c, `A lesson about counting.\nWhen counting.\n${real}`, file)).toMatchObject({ missing: [], forbidden: [], copied: 1, good: false }); // padded, it still repeats all of it
    expect(checkLesson(c, "The default is 30, so pass a limit; the audit counted the first page only.", file)).toMatchObject({ copied: 0, good: true }); // a condensed lesson is not
  });
});

describe("copiedShare", () => {
  const memory = "one two three four five six seven eight nine ten";

  test("is 1 for the memory pasted back, and 0 for a text that has no run of five words in common with it", () => {
    expect(copiedShare(memory, memory)).toBe(1);
    expect(copiedShare("Nothing here is related to it at all, except the word one and the word ten.", memory)).toBe(0);
    expect(copiedShare("", memory)).toBe(0);
    expect(copiedShare(memory, "")).toBe(0);
  });

  test("ignores case and punctuation, and the order of the sentences", () => {
    const two = "The job reads the queue. It writes one file per tenant.";
    expect(copiedShare("IT WRITES ONE FILE PER TENANT!!! the job -- reads the queue", two)).toBe(1);
  });

  test("counts runs of five words or more: a shorter phrase in common is not a copy", () => {
    expect(copiedShare("one two three four five", memory)).toBe(0.5);
    expect(copiedShare("six seven eight nine ten", memory)).toBe(0.5);
    expect(copiedShare("one two three four five and six seven eight nine ten", memory)).toBe(1);
    expect(copiedShare("one two three four", memory)).toBe(0);
    expect(copiedShare("one two three four x six seven eight nine", memory)).toBe(0);
    expect(copiedShare("one two three five four", memory)).toBe(0); // the same words in another order
  });

  test("is the share of the memory, so text around the copy does not lower it, and half of the memory is half", () => {
    const words = Array.from({ length: 20 }, (_, i) => `w${i}`);
    expect(copiedShare(`${"extra ".repeat(100)}${words.join(" ")}`, words.join(" "))).toBe(1);
    expect(copiedShare(words.slice(0, 10).join(" "), words.join(" "))).toBe(0.5);
  });
});

/**
 * Other wordings of a correct lesson, for each lesson and over-claim case: the same facts and the same advice, said differently from the
 * case's `good`. Each must pass the real scoring. They keep the checks from becoming a test of one sentence.
 */
const ALTERNATES: Record<string, string[]> = {
  "lesson-01": [
    "A chat widget on every page polls its server every 20 seconds, so the page never reaches networkidle and the wait runs until the 30 second test timeout. Instead of waiting for networkidle, wait for the heading to be visible: expect(page.getByRole('heading')).toBeVisible().",
    "Do not use waitForLoadState('networkidle') on a page with a polling widget: the poll keeps the network busy, so the call only returns at the test timeout. Assert on one element instead, such as the Order history heading being visible.",
    "The order-history test timed out waiting for networkidle because the support chat widget polls every 20 seconds. Waiting for the page heading to be visible fixed it, and the test now finishes in about two seconds.",
    "Do not wait for networkidle on pages with a polling widget, because the poll keeps the network from going idle; wait for the page heading instead.",
  ],
  "lesson-02": [
    "By default gh issue list stops at 30 results and prints no warning, so counts taken from it are silently capped. Pass --limit with a number above the expected count, and treat a result equal to the limit as possibly truncated.",
    "An audit script that called gh issue list without --limit counted only 30 issues, because the default cuts the list off at 30. Always set --limit (200 worked), and have the script fail when the count equals the limit.",
  ],
  "lesson-03": [
    "Converting the images to CMYK did not clear the vendor's preflight, because the stylesheet's #000 text colour is written to the PDF as RGB black. Run the finished PDF through Ghostscript with -sColorConversionStrategy=CMYK, then preflight again.",
    "A cover with all-CMYK images was still rejected for RGB content: Chromium emits CSS black text as RGB. Convert the finished PDF to CMYK with Ghostscript and rerun the vendor preflight; it passes.",
  ],
  "lesson-04": [
    "The rpm_limit on a LiteLLM key is shared by every model that uses the key. The batch hit 429s at about 60 requests a minute because its summarizer and classifier drew on one budget; a separate key for the classifier fixed it.",
    "429 responses at roughly 60 a minute came from a key-wide rpm_limit, not a per-model one: both models shared the 60 request budget. Giving the classifier its own key with a higher rpm_limit removed the errors.",
  ],
  "lesson-05": [
    "Files in a shared drive returned 404 File not found for the service account because it was not a member of the shared drive. Adding it as a Viewer member fixed the exports; the API calls must also pass supportsAllDrives=true.",
    "A 404 on shared drive files means the account has no membership of that drive: sharing one folder with it was not enough. Make it a member of the shared drive and send supportsAllDrives=true with each request.",
  ],
  "lesson-06": [
    "In an Apprise URL a # starts a fragment, so everything after it is dropped and the room is never addressed; notify.sh showed no error. Write the # as %23 and confirm with a real test message.",
    "A Matrix room alias such as #ops-alerts:example.org must be percent-encoded in the Apprise URL (%23ops-alerts:example.org), otherwise the part after the # is silently dropped as a URL fragment.",
  ],
  "lesson-07": [
    "Deleting export_legacy_csv broke the nightly job: it assembled the handler name at runtime from a config value, so no search for the full name found it. Before removing a function whose name follows a pattern, search for the prefix and look in the config files too.",
    "A search finding no references does not prove a function is unused. The nightly job built its handler names dynamically from configuration, and production still set fmt to legacy_csv. Search for the name pattern's prefix and for the config before you delete.",
  ],
  "lesson-08": [
    "A lightweight tag created with a plain git tag command is not pushed by git push --follow-tags, which sends annotated tags only, so the tag-triggered release job never ran. Create release tags with git tag -a.",
    "--follow-tags only pushes annotated tags. Tagging the release with git tag v2.4.0 made a lightweight tag that stayed on the laptop, and the release workflow never started. Use git tag -a v2.4.0 -m 'Release' from now on.",
  ],
  "lesson-09": [
    "A KeyError for a column the CSV plainly has can come from a UTF-8 byte order mark glued to the first header name: the reader named the supplier's first column \\ufeffsku. Opening the file with encoding='utf-8-sig' removes the mark.",
    "The stock import raised KeyError on sku because the supplier's spreadsheet program writes a BOM, which csv.DictReader kept in the column name. Opening the CSV with utf-8-sig encoding fixed it.",
  ],
  "lesson-10": [
    "From cron, restic was not found because cron's default PATH is only /usr/bin:/bin and restic is installed in /usr/local/bin. Add a PATH line that includes /usr/local/bin at the top of the crontab.",
    "The Corbel wiki backup silently skipped nine nights: under cron, the PATH lacked /usr/local/bin, so the call to restic failed with command not found. Putting PATH=/usr/local/bin:/usr/bin:/bin at the top of the crontab made it run.",
  ],
  "lesson-11": [
    "A renewed certificate is not served until nginx reloads, because it loads certificates only when it starts or reloads. The status site showed an expired certificate five days after certbot renew. Add a certbot deploy hook that runs systemctl reload nginx.",
    "certbot had renewed the certificate, but nginx kept serving the old one because it had not been reloaded since July. A deploy hook now reloads nginx after every successful renewal.",
  ],
  "lesson-12": [
    "Copying the whole source before npm ci meant any file change invalidated the layer cache and reinstalled every dependency. Copy the package files (package.json and the lockfile) first, run npm ci, and copy the rest of the source afterwards.",
    "To keep Docker's cache for dependencies, copy package.json and package-lock.json and run npm ci before copying the rest of the source. In the Kestrel Dockerfile this cut a code-only rebuild from about six minutes to 40 seconds.",
  ],
  "lesson-13": [
    "CREATE INDEX on a big table locks out writes until it finishes; the orders migration stalled checkout for nine minutes. Build the index with CREATE INDEX CONCURRENTLY, and switch off the migration's transaction for that step, because CONCURRENTLY refuses to run in a transaction.",
    "A plain CREATE INDEX on the production orders table blocked inserts and updates while it built. CONCURRENTLY keeps writes flowing at the cost of a slower build, and it must run outside a transaction.",
  ],
  "lesson-14": [
    "The due-date test expected 1 October because the laptops run an hour ahead of UTC, but CI runs in UTC and printed 30 September: the function formats in local time. Running the test script with TZ=UTC makes every machine give the same date.",
    "A date test that formats in local time can pass on a laptop and fail in CI: 23:30 UTC on 30 September is already 1 October in Lisbon. Set TZ=UTC in the package.json test script.",
  ],
  "lesson-15": [
    "Merge fields only fill in when the column name matches exactly: the list column First Name never matched {{first_name}}, so the placeholder went out raw. Renaming the column to first_name fixed it, and the preview, which shows the first contact only, missed it.",
    "The newsletter's {{first_name}} greeting stayed unfilled for readers imported from a sheet headed First Name, because merge fields must match the column name exactly. Rename the header to first_name; the preview, which only shows one contact, will not show the problem.",
  ],
  "lesson-16": [
    "An EAN-13 barcode shrunk to 70 percent would not scan reliably and failed the printer's check, which asks for at least 80 percent. Put the barcode back at 100 percent and make room by moving other text.",
    "Keep an ISBN barcode at or above the printer's 80 percent minimum: at 70 percent the atlas cover failed prepress. The fix was to place the barcode at full size, 100 percent.",
  ],
  "lesson-17": [
    "A liveness probe that starts checking before the app is up kills it: the search pods load their index for about 70 seconds and were restarted in a loop. Add a startup probe so the liveness probe only runs once start-up has finished.",
    "The pods were killed and restarted again and again because index loading took about 70 seconds, longer than the liveness probe allowed. A startupProbe with a two-minute budget fixed it.",
  ],
  "lesson-18": [
    "Appending with RAW kept the booking dates as plain text, so the summary filtered them out. USER_ENTERED makes Sheets parse 2026-09-14 into a real date.",
    "Values sent with valueInputOption RAW are stored as entered: the dates arrived as strings and dropped out of the date filter. Send USER_ENTERED for values that should be parsed, and convert rows already written.",
  ],
  "lesson-19": [
    "Reset emails went to spam after the switch to a new sending service, because the domain's SPF record still named only the old one. Adding the new service with an include: in the SPF TXT record fixed delivery.",
    "Before sending from a new sending service, put its include into the SPF record; without it the new servers fail SPF and mail lands in spam, as the Quarry reset emails did.",
  ],
  "lesson-20": [
    "A prompt that asks for bare JSON still got replies in a json code fence about one time in eight, which json.loads cannot parse. Turning on JSON mode with response_format json_object made every reply parse.",
    "Code fences around the model's JSON broke parsing for one article in eight, and instructions in the prompt did not stop them; the request's response_format setting did.",
  ],
  "lesson-21": [
    "On the Windows agent Git converted the deploy scripts to CRLF at checkout, and bash in the Linux container stopped with bad interpreter. A .gitattributes line, *.sh text eol=lf, keeps shell scripts LF in every checkout.",
    "Shell scripts need LF line endings: a CRLF checkout gives /bin/bash^M: bad interpreter. Pin them with eol=lf in .gitattributes and leave each machine's Git settings as they are.",
  ],
  "lesson-22": [
    "Without a trailing slash on the source, rsync puts the folder itself inside the destination: the backup came out as /backup/site/site. With /srv/site/ as the source, rsync copies only the contents, which is the layout the restore expects.",
    "End the rsync source path with a trailing slash when you want the folder's contents copied; /srv/site without it nested the Brindle backup one level too deep, in /backup/site/site.",
  ],
  "lesson-23": [
    "With jest -u in the CI script every changed snapshot was rewritten instead of failing, so the snapshot tests always passed while the header was broken. Take -u out of CI and use jest --ci; update snapshots locally and review them.",
    "jest -u rewrites mismatching snapshots, so a CI job that runs it can never fail on them; the broken header went unnoticed for three weeks. CI should run jest --ci.",
  ],
  "claim-01": [
    "Long footnotes on page 14 of the Paged.js rulebook were clipped by a break-inside: avoid rule on the footnote area, and removing it from .footnote-area fixed the page. Only the single-column rulebook was rebuilt; whether the two-column supplement is affected is unknown.",
    "The footnote area's break-inside: avoid rule made Paged.js clip long footnotes in the rulebook (single column). Dropping the rule cured page 14. It has not been tried on the two-column supplement.",
  ],
  "claim-02": [
    "The checkout-address Playwright test failed about one run in five on the small CI runners. Adding retries: 2 made it pass 20 times in a row but only hides the failures. The cause is unknown; slow autocomplete is an untested guess, and the test stays marked @flaky until it is investigated.",
    "retries: 2 stopped the intermittent checkout-address failures on the two-vCPU runner without explaining them. Nobody has found the cause yet, so the retries mask a real problem.",
  ],
  "claim-03": [
    "Upgrading pdfkit-lite from 3.1.4 to 3.2.0 in the report-service removed the font subset deprecation warning, and its tests and three sample reports were fine. This says nothing about the invoice-service, which pins 3.1.4 and was left unchecked; the rest of the changelog is unread.",
    "report-service only: pdfkit-lite 3.2.0 dropped the deprecation warning and three sample reports rendered identically. The invoice-service was not upgraded or tested, and the changelog was read only as far as the deprecation notice.",
  ],
  "claim-04": [
    "On a 40-prompt set, fast-8b had a median latency of 4.2 s and deep-27b of 6.8 s, run one request at a time on a GPU that a labelling job was also using. Answer quality was not compared, so this is a timing sample only.",
    "Timing check, 40 prompts: median 4.2 s for fast-8b against 6.8 s for deep-27b. The GPU was shared with another job and quality was not compared, so no model is shown to be better, and times on an idle server will differ.",
  ],
  "claim-05": [
    "The Tallowmere book passed preflight at a 0.125 inch bleed, but the vendor's template asks for 0.25 inch and nobody asked them about it. Whether 0.125 inch is really accepted is not confirmed, so keep using 0.25 inch.",
    "A PDF with 0.125 inch bleed was accepted by the vendor's preflight although its template says 0.25 inch; whether the preflight minimum is really 0.125 is unverified. The earlier books used 0.25 inch.",
  ],
  "claim-06": [
    "On the staging preview server, lowering PREVIEW_CACHE_TTL from 3600 to 60 seconds fixed stale previews within a minute and raised CPU use from about 5 percent to about 9 percent. Production was not touched and still uses 3600; its CPU cost at ten times the traffic is unknown.",
    "Staging only: with PREVIEW_CACHE_TTL at 60 instead of 3600, stale preview pages disappeared in under a minute, at the price of roughly 4 extra points of CPU. Whether production can afford that load has not been measured.",
  ],
  "claim-07": [
    "Indexing orders.customer_id took the customer report from 14 s to 0.9 s, but only on a restored copy of production without live traffic. Its cost on writes has not been measured, the other reports were not tried, and production does not have the index.",
    "Timing on a copy restored on 2026-08-30: the customer report ran in 0.9 seconds with the new index, against 14 seconds before. The effect on inserts and updates is unmeasured.",
  ],
  "claim-08": [
    "On uncoated 120 gsm paper, Brightmoor's proof matched the old printer for greens and reds, and skin tones came out slightly warmer. Nothing has been proofed on the coated stock the atlas plates use.",
    "One proof, uncoated paper only: Brightmoor's colours were close to the old printer's, skin tones a little warmer. Whether they hold on coated 150 gsm paper is unknown.",
  ],
  "claim-09": [
    "A scroll listener that moved the header on every event made it jitter; position: sticky (top: 0) fixed that in Chrome and Firefox on desktop. Mobile Safari on iOS and Android browsers are still untested.",
    "Desktop only: sticky positioning replaced the jittery scroll listener in Chrome and Firefox. iOS and Android were not checked, and the listener code remains behind a flag.",
  ],
  "claim-10": [
    "On 50 invoices from a single supplier, Pellmark, three worked examples in the prompt lifted field accuracy from 71 percent to 84 percent. The examples came from the same supplier, so other layouts are untested.",
    "Few-shot examples helped on one supplier only: 84 percent of fields right instead of 71 across 50 Pellmark invoices. Whether other suppliers gain is unknown.",
  ],
  "claim-11": [
    "The backup timed out on five of twelve nights at 02:00; at 04:00 it has run four nights in a row. The log rotation at 02:00 is a suspect, and four nights is too few to call it fixed.",
    "Running the backup at 04:00 instead of 02:00 has avoided the timeouts for four nights so far. Whether the 02:00 log rotation was to blame is unverified.",
  ],
  "claim-12": [
    "Three of the four people who joined in September set up in one day after the guide shrank from 14 to six pages, against about two days before. With only four people, two of whom already knew the stack from a previous job, the guide's share of the gain is unknown.",
    "Cutting the onboarding guide from 14 pages to 6 coincided with faster setup for four hires, but the group is small and two had worked with the same stack at their last job.",
  ],
  "claim-13": [
    "Auto-accept is on for the Fernhall room: a single booking from an internal staff account was accepted within seconds. Whether external guests or recurring meetings are accepted is unknown.",
    "Only one booking, made from inside the domain, has tested the room's new automatic acceptance; external and recurring bookings are still untested.",
  ],
  "claim-14": [
    "One month of spot instances for CI: the bill fell 38 percent from August, and two interrupted jobs had to re-run from the start. Spot prices were unusually low that month, so the saving may not last.",
    "September's CI bill was 38 percent lower on spot runners, but that is a single month with prices unusually low in the region, and reclaimed instances interrupted two jobs.",
  ],
  "claim-15": [
    "With -n 4, pytest-xdist ran the suite in 7 minutes instead of 18, on the 8-core build machine only. Two tests sharing a temp folder had to stay in one worker, and the 2-core pull request runners are untested.",
    "Parallel tests via pytest-xdist: 18 minutes down to 7 minutes on eight cores. The 2-core runners were not tried, so their suite remains serial.",
  ],
  "claim-16": [
    "Of 860 email-matched customer pairs, only 50 were checked by hand (no false matches there); 810 were merged without a check. Customers without an email address were skipped by the script entirely.",
    "Matching on email found 860 duplicate pairs; a spot check of 50 was clean, the rest unchecked, and the 4 percent of records lacking an email were left out.",
  ],
  "claim-17": [
    "mini-embed agreed with the large model's top three on 18 of 20 queries at about half the latency, but every query was English; German and Portuguese are untested. Where it differed, it put an older version of the article first.",
    "In an English-only test of 20 help-centre queries, the small embedding model matched the large one on 18 and was faster, but twice it preferred an older version of an article.",
  ],
};

/** The lines an update case could add to the existing lesson, worded differently from the case's `good`. Each body, the existing lesson and these lines, must pass. */
const ALTERNATE_LINES: Record<string, string[]> = {
  "upd-01": ["In the export dialog the vendor's profile goes under the Output tab.\nWith the default profile the cover's blues came out shifted toward purple."],
  "upd-02": ["Since version 4.2 the runner sorts the test files by name, which is why the run order changed."],
  "upd-03": ["It took an hour to find the fix for TRK-212 by searching the history.\nThe close form asks for a link only on tickets labelled regression."],
  "upd-04": ["In one run the small model rewrote two billing files that the task never mentioned.\nThe large model, given the same task with no file list, stayed in scope."],
  "upd-05": ["Removing the direct entry was what closed the access; adding the group alone did not.\nChanges to the group take roughly ten minutes to reach the files."],
  "upd-06": ["The pager sent 41 alerts in 20 minutes.\nAlerts are grouped by the incident label, so a check without a label is still sent on its own."],
  "upd-07": ["The upload step failed with exit code 28 (a timeout) and the script printed done anyway, so the bucket still held yesterday's file."],
  "upd-08": ["In Paged.js 0.4 the property is ignored inside a flex container.\nUse break-after: avoid on headings."],
  "upd-09": ["When the linter's 16.0 release came out, a rule it switched on by default failed the build on 112 files nobody had touched."],
  "upd-10": ["Undoing the ledger migration meant restoring a 40 GB dump, which took 25 minutes against a planned 10 minutes: the restore had never been timed."],
  "upd-11": ["Without alt text, the setup diagram was read out as its file name, img_4471.png.\nThe docs build has been able to fail on missing alt text since 2.1; turning the check on flagged 37 other images."],
  "upd-12": ["The night the clocks went back, the local 01:00 hour came twice, and the report counted its 214 orders twice."],
  "upd-13": ["Without a limit the log shipper reached 6 GB in a weekend, and the kernel's OOM killer took down Postgres.\nIt now has a 512 MB limit, so it restarts and Postgres stays up."],
  "upd-14": ["Enlarged to 200 percent to fill the spread, the 300 ppi map file printed at an effective 150 ppi.\nThe cartographer exported it again at full spread size to meet the vendor's 300 ppi at final size."],
  "upd-15": ["Adding a month to 31 August with setMonth gives 1 October, so the test failed only on that day.\nvi.setSystemTime now fixes the clock at a mid-June date."],
  "upd-16": ["Votes and watchers reach the original only through the tracker's duplicate-of field, not a comment: TRK-388 had 3 votes while 31 people had hit the login crash."],
  "upd-17": ["Left to itself, the model ran only the unit tests and said everything passed, while make test-int failed on 3 tests.\nNaming make test-int as the command fixed that."],
  "upd-18": ["Because US clocks change three weeks before Europe's, a meeting kept in New York time ran an hour early in Porto for three weeks.\nThe event's own time zone is now Europe/Lisbon."],
  "upd-19": ["Push notifications on the phone cut the message at 60 characters, so an alert opening with the host name hid the words disk full and went unseen for 40 minutes."],
  "upd-20": ["SMTP_PORT=587x went unnoticed from the Friday deploy until Sunday's first reset email crashed the mailer, and resets were down for six hours."],
  "upd-21": ["After a debug flag produced 30 GB of logs in one day, the disk filled before the daily rotation.\nlogrotate now also rotates any log over 500 MB (maxsize 500M)."],
  "upd-22": ["212 rows went missing while the import still reported success: a quote escaped with a backslash made the importer skip the row and say so only in a debug message."],
  "upd-23": ["A note reading Refactored the auth module did not tell users they would be logged out after 3.4, and 40 support tickets followed; one line asking them to log in again would have done."],
  "upd-24": ["With a TTL of 86400, resolvers held the old address for a day after the move, and orders taken by the old server were moved by hand.\nA TTL of 300 set two days early made the next move take effect within minutes."],
  "upd-25": ["A white hairline showed on three zine pages where the background box ended at the trim and the cut drifted about half a millimetre.\nThe boxes now run 3 mm into the bleed."],
  "upd-26": ["18 tests broke when the French translation turned Save into Enregistrer, because they selected buttons by English text.\nThey now use the existing data-testid attributes, while the tests of the wording itself keep reading the text on purpose."],
  "upd-27": ["Deleting the committed .env file did not take it out of the history, and its payment key was still valid.\nThe key was rotated, and the history was kept as it was."],
  "upd-28": ["An alert at 95 percent gave six minutes of warning before the import filled the volume, too little to act.\nIt now fires at 80 percent."],
  "upd-29": ["Asked only for a date, the model invented one in 9 of 120 rows, taking the delivery date or the email date.\nWith unknown allowed, those rows came back unknown."],
  "upd-30": ["The header ended up on row 48 after the owner sorted the sheet with it included, which a protected range would not have prevented.\nRow 1 is now frozen as well, which keeps it out of sorts."],
  "upd-31": ["An apostrophe in a surname like O'Rourke ended the quoted value in an f-string query, so the export failed for three customers.\nThe name is now a query parameter, as are four more queries that were built the same way."],
  "upd-32": ["A plan for an engine version change showed forces replacement on the reporting database, which applying would have recreated empty.\nThe resource now has prevent_destroy."],
  "upd-33": ["With no lockfile, the Docker build picked up a transitive dependency's new minor release that no longer runs on Node 16.\nA committed package-lock.json and npm ci fixed the build."],
  "upd-34": ["Users on Python 3.8 hit AttributeError because a new helper used str.removeprefix, which arrived in 3.9, and CI tested only 3.12.\n3.8 is in the CI matrix now."],
  "upd-35": ["Built against staging, the template sent an unsubscribe link to the staging site, and 64 people who used it hit a login page.\nThe test send checked only the article links."],
  "upd-36": ["41 arrows came out as empty boxes in print because the body font lacks an arrow glyph; the editor had substituted another font, the PDF did not.\nThe exported PDF was never read, and 200 copies had to be printed again."],
  "upd-37": ["A Redis restart at 23:40 made the worker exit, and with no Restart setting it stayed down seven hours.\nIts unit now has Restart=on-failure and RestartSec=5."],
  "upd-38": ["Without steps, TRK-517 bounced between support and the developers for nine days; once written down they showed the bug, which needs an invoice edited after its discount was removed.\nThe steps field in the template is optional."],
  "upd-39": ["Calls made with requests and no timeout argument wait as long as the server lets them: requests has no default, and a stalled payment API tied up all 64 checkout threads.\nThe calls now pass a 3 second connect and 10 second read timeout."],
  "upd-40": ["The model's fix for test_rounding was to delete the test; the pricing code was untouched, and its summary left the deletion out.\nTasks now say that tests must not be removed or skipped."],
};

/** A text that mentions the words of a required fact without stating it, and the fact it leaves out. */
const UNRELATED: Record<string, [text: string, missing: string]> = {
  "lesson-01": ["The polling widget keeps networkidle from firing. The page heading is blue, and the sidebar is visible on wide screens.", "+wait * heading"],
  "lesson-02": ["gh issue list returns 30 results and silently cuts them. There is also a limit on the length of a title.", "unless * limit"],
  "lesson-03": ["The vendor's preflight found RGB content in the cover. The cover has a title and a text box, and the file went through Ghostscript.", "#000"],
  "lesson-05": ["A team member reported a 404 on a shared drive file; supportsAllDrives was unset.", "member of"],
  "claim-02": ["The retries setting was added to the flaky test on the runner. The cause was identified.", "not found"],
};

describe("the public cases check themselves", () => {
  for (const c of loadCases(PUBLIC).filter((c) => c.expect === "lesson")) {
    describe(c.id, () => {
      test("every required fact is stated in the memory body, and no forbidden claim and no contradiction is in it", () => {
        const body = memoryBody(c.memory);
        for (const fact of c.required) expect(stated(body, fact), `required: ${fact[0]}`).toBe(true);
        for (const group of [...c.forbidden, ...c.contradicts]) for (const p of group) expect(mentions(body, p), `forbidden or contradicting: ${p}`).toBe(false);
      });

      test("the good lesson passes, and the over-claiming one fails on a forbidden claim", () => {
        expect(checkLesson(c, c.good as string, c.memory)).toMatchObject({ missing: [], forbidden: [], contradicted: [], ambiguous: [], good: true });
        const bad = checkLesson(c, c.bad as string, c.memory);
        expect(bad.good).toBe(false);
        expect(bad.forbidden.length).toBeGreaterThan(0);
      });

      test("the reversed lesson fails: it makes no forbidden claim, and still contradicts the memory or leaves a fact unstated", () => {
        const reversed = checkLesson(c, c.reversed as string, c.memory);
        expect(reversed.good).toBe(false);
        expect(reversed.forbidden).toEqual([]);
        expect(reversed.contradicted.length + reversed.missing.length).toBeGreaterThan(0);
        expect(reversed.ratio).toBeLessThanOrEqual(MAX_RATIO);
      });

      test("the memory pasted back is not a lesson, as a file, as its body or under a description and a when_to_use, and the good lesson repeats well under the limit (#55)", () => {
        const forms = [lessonText(c.memory), memoryBody(c.memory), `A description of the lesson.\nWhen it happens again.\n${memoryBody(c.memory)}`];
        for (const text of forms) expect(checkLesson(c, text, c.memory), text.slice(0, 40)).toMatchObject({ missing: [], forbidden: [], contradicted: [], copied: 1, good: false });
        expect(checkLesson(c, c.good as string, c.memory).copied).toBeLessThanOrEqual(MAX_COPIED - 0.1);
      });

      test("correct alternate wordings of the good lesson pass", () => {
        const others = ALTERNATES[c.id] ?? [];
        expect(others.length, "an alternate wording").toBeGreaterThanOrEqual(1);
        for (const text of others) expect(checkLesson(c, text, c.memory), text).toMatchObject({ missing: [], forbidden: [], contradicted: [], ambiguous: [], good: true });
      });
    });
  }

  test("every lesson and over-claim case has alternate wordings, and nothing else does", () => {
    expect(Object.keys(ALTERNATES).sort()).toEqual(loadCases(PUBLIC).filter((c) => c.expect === "lesson").map((c) => c.id).sort());
  });

  test("a lesson that mentions the words of a fact without stating it leaves the fact out", () => {
    for (const [id, [text, fact]] of Object.entries(UNRELATED)) {
      const c = loadCases(PUBLIC).find((x) => x.id === id) as LoadedCase;
      expect(checkLesson(c, text, c.memory).missing, id).toContain(fact);
    }
  });

  test("the lesson of the review, 'Wait for networkidle on pages with a polling widget; never wait for the visible heading', is not good", () => {
    const c = loadCases(PUBLIC).find((x) => x.id === "lesson-01") as LoadedCase;
    const text = "Wait for networkidle on pages with a polling widget; never wait for the visible heading";
    // The old check: every word of every fact is in it, and no forbidden claim is.
    expect(c.required.every((fact) => fact.some((p) => mentions(text, p)))).toBe(true);
    expect(claims(text, c.forbidden)).toEqual([]);
    const check = checkLesson(c, text, c.memory);
    expect(check.good).toBe(false);
    expect(check.missing).toEqual(["+wait * heading"]);
    expect(check.contradicted).toEqual(["=wait for networkidle", "never wait for * heading"]);
    expect(check.forbidden).toEqual([]);
  });

  describe("a lesson that recommends the contradicted action in words that look like a denial", () => {
    const c = loadCases(PUBLIC).find((x) => x.id === "lesson-01") as LoadedCase;
    const right = "The polling widget prevents networkidle. Wait for the visible heading.";

    test("'Wait for the visible heading. Do not hesitate to wait for networkidle' is bad", () => {
      for (const last of ["Do not hesitate to wait for networkidle.", "Do not forget to wait for networkidle.", "Never fail to wait for networkidle.", "Don't be afraid to wait for networkidle.", "There is no reason not to wait for networkidle."]) {
        const text = `${right}\n${last}`;
        expect({ last, check: checkLesson(c, text, c.memory) }).toMatchObject({ last, check: { good: false, missing: [], forbidden: [], contradicted: ["=wait for networkidle"] } });
      }
    });

    test("one that says not to wait for networkidle and to wait for the heading stays good, whether it denies directly or indirectly", () => {
      for (const last of [
        "Do not wait for networkidle.",
        "Never wait for networkidle.",
        "Don't wait for networkidle.",
        "There is no need to wait for networkidle.",
        "Try not to wait for networkidle.",
        "Avoid having to wait for networkidle.",
        "Rather than wait for networkidle, wait for the heading.",
        "Do not forget to avoid having to wait for networkidle.",
        "Never fail to avoid having to wait for networkidle.",
        "Do not hesitate to not wait for networkidle.",
        "Do not hesitate to wait for the heading, and do not wait for networkidle.",
        "Do not worry about the timeout: never wait for networkidle.",
      ]) {
        const text = `${right}\n${last}`;
        expect({ last, check: checkLesson(c, text, c.memory) }).toMatchObject({ last, check: { good: true, missing: [], forbidden: [], contradicted: [] } });
      }
    });

    test("right and wrong advice together: the wrong advice is still found, however much right advice comes with it", () => {
      const text = "The polling widget prevents networkidle. Do not wait for networkidle; wait for the visible heading. Do not hesitate to wait for networkidle on the other pages.";
      expect(checkLesson(c, text, c.memory)).toMatchObject({ good: false, missing: [], contradicted: ["=wait for networkidle"] });
      expect(checkLesson(c, "The polling widget prevents networkidle. Do not hesitate to wait for the visible heading. Never wait for networkidle.", c.memory).good).toBe(true);
    });
  });
});

describe("the public update cases check themselves", () => {
  for (const c of loadCases(PUBLIC).filter((c) => c.expect === "update")) {
    describe(c.id, () => {
      const body = memoryBody(c.memory);
      const existing = c.existingBody as string;

      test("every new fact is stated in the memory and not in the existing lesson, and no forbidden claim or contradiction is in either", () => {
        for (const fact of c.required) {
          expect(stated(body, fact), `in the memory: ${fact[0]}`).toBe(true);
          expect(stated(existing, fact), `already in the lesson: ${fact[0]}`).toBe(false);
        }
        for (const group of [...c.forbidden, ...c.contradicts]) for (const p of group) expect([mentions(body, p), mentions(existing, p)], `forbidden or contradicting: ${p}`).toEqual([false, false]);
      });

      test("the memory restates the lesson, so it shares words with it", () => {
        const lessonWords = new Set(normalize(existing).split(" ").filter((w) => w.length > 3));
        const shared = normalize(body).split(" ").filter((w) => lessonWords.has(w));
        expect(new Set(shared).size).toBeGreaterThanOrEqual(3);
      });

      test("the good body keeps every line and adds the facts; the bad one adds a forbidden claim", () => {
        expect(checkUpdate(c, existing, c.good as string, c.memory)).toMatchObject({ dropped: [], missing: [], forbidden: [], contradicted: [], ambiguous: [] });
        const bad = checkUpdate(c, existing, c.bad as string, c.memory);
        expect(bad.dropped).toEqual([]);
        expect(bad.forbidden.length).toBeGreaterThan(0);
      });

      test("the reversed body keeps every line, makes no forbidden claim, and still contradicts the memory", () => {
        const reversed = checkUpdate(c, existing, c.reversed as string, c.memory);
        expect(reversed.dropped).toEqual([]);
        expect(reversed.forbidden).toEqual([]);
        expect(reversed.contradicted.length).toBeGreaterThan(0);
      });

      test("the existing lesson with the memory appended is not an update, and the good body repeats well under the limit (#55)", () => {
        const pasted = checkUpdate(c, existing, `${existing}\n${body}`, c.memory);
        expect(pasted).toMatchObject({ dropped: [], missing: [], forbidden: [], contradicted: [], copied: 1 });
        expect(checkUpdate(c, existing, c.good as string, c.memory).copied).toBeLessThanOrEqual(MAX_COPIED - 0.1);
      });

      test("another wording of the lines that are added passes", () => {
        const others = ALTERNATE_LINES[c.id] ?? [];
        expect(others.length, "an alternate wording").toBeGreaterThanOrEqual(1);
        for (const lines of others) expect(checkUpdate(c, existing, `${existing}\n${lines}`, c.memory), lines).toMatchObject({ dropped: [], missing: [], forbidden: [], contradicted: [], ambiguous: [] });
      });
    });
  }

  test("every update case has another wording", () => {
    expect(Object.keys(ALTERNATE_LINES).sort()).toEqual(loadCases(PUBLIC).filter((c) => c.expect === "update").map((c) => c.id).sort());
  });
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
    expect(checkUpdate(c, existing, `${existing}The export has a 10 s ceiling.\n`, "")).toMatchObject({ missing: [], forbidden: [] });
    expect(checkUpdate(c, existing, `${existing}The export has a ceiling.\n`, "").missing).toEqual(["10 s"]);
    expect(checkUpdate(c, existing, `${existing}A 10 s ceiling, always.\n`, "").forbidden).toEqual(["always"]);
    // the fact is in an existing line, not an added one
    expect(checkUpdate({ required: [["race"]], forbidden: [] }, existing, `${existing}Nothing new.\n`, "").missing).toEqual(["race"]);
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

describe("assetsSha256", () => {
  const copy = (): string => {
    const root = mkdtempSync(join(tmpdir(), "distill-digest-"));
    dirs.push(root);
    cpSync(PUBLIC, join(root, "assets"), { recursive: true });
    return join(root, "assets");
  };

  test("is the same for the same files in another folder, and does not read the README", () => {
    const other = copy();
    expect(assetsSha256(other)).toBe(assetsSha256(PUBLIC));
    expect(assetsSha256(PUBLIC)).toMatch(/^[0-9a-f]{64}$/);
    writeFileSync(join(other, "README.md"), "changed\n");
    expect(assetsSha256(other)).toBe(assetsSha256(PUBLIC));
  });

  test("changes with a case, a memory, a file added to a bundle and a file renamed", () => {
    const base = assetsSha256(PUBLIC);
    const edited = copy();
    writeFileSync(join(edited, "cases.json"), `${readFileSync(join(edited, "cases.json"), "utf8")} `);
    expect(assetsSha256(edited)).not.toBe(base);
    const memory = copy();
    writeFileSync(join(memory, "bundles", "dup-01", "memories", "pdf-fonts-not-embedded-vendor-reject.md"), "changed\n");
    expect(assetsSha256(memory)).not.toBe(base);
    const added = copy();
    writeFileSync(join(added, "bundles", "dup-01", "memories", "extra.md"), "x\n");
    expect(assetsSha256(added)).not.toBe(base);
    const renamed = copy();
    renameSync(join(renamed, "bundles", "dup-01", "memories", "pdf-fonts-not-embedded-vendor-reject.md"), join(renamed, "bundles", "dup-01", "memories", "renamed.md"));
    expect(assetsSha256(renamed)).not.toBe(base);
  });

  test("digestOf names files by the name it is given and not by where they are", () => {
    const root = mkdtempSync(join(tmpdir(), "distill-digest-"));
    dirs.push(root);
    writeFileSync(join(root, "a"), "one");
    writeFileSync(join(root, "b"), "two");
    expect(digestOf([["a", join(root, "a")], ["b", join(root, "b")]])).toBe(digestOf([["b", join(root, "b")], ["a", join(root, "a")]]));
    expect(digestOf([["a", join(root, "a")]])).not.toBe(digestOf([["c", join(root, "a")]]));
  });
});

describe("corpusFolder", () => {
  const root = join(tmpdir(), "a repo", "key-checkout");

  test("the public corpus is the one in the repository, whatever the summary says", () => {
    expect(corpusFolder(root, { corpus: "public", corpus_folder: "elsewhere" })).toBe(join(root, "evals", "distill", "assets"));
  });

  test("a custom corpus is the folder the run recorded, from the repository root, or the one given in its place", () => {
    expect(corpusFolder(root, { corpus: "custom", corpus_folder: "private/distill/own/assets" })).toBe(join(root, "private", "distill", "own", "assets"));
    expect(corpusFolder(root, { corpus: "custom", corpus_folder: join(tmpdir(), "my notes") })).toBe(join(tmpdir(), "my notes"));
  });

  test("a custom corpus whose folder was outside the repository is not found without being told, and the message says how", () => {
    expect(() => corpusFolder(root, { corpus: "custom", corpus_folder: null })).toThrow("whose folder it did not record");
    expect(() => corpusFolder(root, { corpus: "custom", corpus_folder: null })).toThrow("--cases DIR");
  });

  test("a run from before custom corpora names its folder by its old corpus name", () => {
    expect(corpusFolder(root, { corpus: "private" })).toBe(join(root, "private", "distill", "assets"));
    expect(corpusFolder(root, { corpus: "own" })).toBe(join(root, "private", "distill", "own", "assets"));
    expect(corpusFolder(root, { corpus: "own-feedback" })).toBe(join(root, "private", "distill", "own", "assets-feedback"));
    expect(() => corpusFolder(root, { corpus: "toString" })).toThrow("whose folder it did not record");
  });
});

describe("timeouts", () => {
  test("a message that says akm timed out is told from other failures", () => {
    expect(timedOutMessage("akm proposal timed out after 900s")).toBe(true);
    expect(timedOutMessage("akm exited 137: akm timed out after 0.3s")).toBe(true);
    expect(timedOutMessage("akm exited 137: ")).toBe(false);
    expect(timedOutMessage("akm exited 78: engine unreachable")).toBe(false);
  });

  test("an error row carries timed_out only when it was a timeout", () => {
    const c = { id: "x", class: "dated-status", expect: "none" } as LoadedCase;
    expect(errorRow(c, "akm exited 137: akm timed out after 900s", 900, true)).toMatchObject({ verdict: "error", timed_out: true });
    expect("timed_out" in errorRow(c, "akm exited 78", 1)).toBe(false);
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

  test("scoreCase: a lesson that turns the memory's action round is bad, and the row says what it contradicts", () => {
    const lessonWith = (description: string) => `---\ndescription: ${JSON.stringify(description)}\nwhen_to_use: When counting issues.\n---\n`;
    const good = scoreCase(c, run([queued(lessonWith(c.good as string))]));
    expect(good).toMatchObject({ verdict: "good", contradicted: [] });
    const reversed = scoreCase(c, run([queued(lessonWith(c.reversed as string))]));
    expect(reversed).toMatchObject({ verdict: "bad", outcome: "lesson", forbidden: [], contradicted: ["never pass --limit", "returns all * by default"] });
    expect(reversed.missing).toEqual(["unless * limit"]);
    expect(metrics([good, reversed]).bad_by).toEqual({ missing_fact: 1, forbidden_claim: 0, contradiction: 1, too_long: 0, copied: 0 });
  });

  test("scoreCase: the lesson of the review is bad, where the old checks called it good", () => {
    const lesson01 = loadCases(PUBLIC).find((x) => x.id === "lesson-01") as LoadedCase;
    const text = "Wait for networkidle on pages with a polling widget; never wait for the visible heading.";
    const row = scoreCase(lesson01, run([queued(`---\ndescription: ${JSON.stringify(text)}\nwhen_to_use: When a test waits.\n---\n`)]));
    expect(row).toMatchObject({ verdict: "bad", outcome: "lesson", forbidden: [], contradicted: ["=wait for networkidle", "never wait for * heading"], missing: ["+wait * heading"] });
  });

  test("scoreCase: a lesson that recommends the contradicted action in words that look like a denial is bad, and one that denies it is good", () => {
    const lesson01 = loadCases(PUBLIC).find((x) => x.id === "lesson-01") as LoadedCase;
    const score = (text: string) => scoreCase(lesson01, run([queued(`---\ndescription: ${JSON.stringify(text)}\nwhen_to_use: When a test waits.\n---\n`)]));
    const right = "The polling widget prevents networkidle. Wait for the visible heading.";
    for (const last of ["Do not hesitate to wait for networkidle.", "Do not forget to wait for networkidle.", "Never fail to wait for networkidle."]) {
      expect({ last, ...score(`${right}\n${last}`) }).toMatchObject({ last, verdict: "bad", outcome: "lesson", missing: [], forbidden: [], contradicted: ["=wait for networkidle"] });
    }
    for (const last of ["Do not wait for networkidle.", "Never wait for networkidle.", "Do not hesitate to avoid having to wait for networkidle."]) {
      expect({ last, ...score(`${right}\n${last}`) }).toMatchObject({ last, verdict: "good", missing: [], forbidden: [], contradicted: [] });
    }
  });

  test("scoreCase: the memory pasted back as the lesson is bad, and the row says how much of the memory it repeats (#55)", () => {
    const row = scoreCase(c, run([queued(c.memory)]));
    expect(row).toMatchObject({ verdict: "bad", outcome: "lesson", missing: [], forbidden: [], contradicted: [], copied: 1 });
    expect(metrics([row]).bad_by).toEqual({ missing_fact: 0, forbidden_claim: 0, contradiction: 0, too_long: 0, copied: 1 });
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
    const all: UpdateChecks = { update_proposed: true, existing_kept: true, new_facts: true, no_extra_claims: true, not_copied: true, no_new_lesson: true };

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

    test("the existing lesson with the memory appended passes the other checks and fails not_copied (#55)", () => {
      const row = scoreCase(u, run([update(`${(u.good as string).split("\n").slice(0, 2).join("\n")}\n${memoryBody(u.memory)}`)]));
      expect(row).toMatchObject({ verdict: "bad", outcome: "update", checks: { ...all, not_copied: false }, copied: 1, missing: [], forbidden: [], contradicted: [] });
      expect(metrics([row]).lesson_updates).toMatchObject({ n: 1, right: 0, checks: { update_proposed: 1, existing_kept: 1, new_facts: 1, no_extra_claims: 1, not_copied: 0, no_new_lesson: 1 } });
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
      row("b", "lesson-worthy", "bad", { missing: ["x"], forbidden: ["y"], contradicted: ["z"], ratio: 1.2 }),
      row("c", "over-claim", "bad", { ratio: 1.9 }),
      row("d", "over-claim", "missed"),
      row("e", "dated-status", "wrong"),
      row("f", "dated-status", "right"),
      row("g", "restates-asset", "right"),
      row("h", "duplicate-lesson", "error"),
    ]);
    expect(m.good_lessons).toEqual({ n: 4, good: 1, rate: 0.25, ambiguous: 0 });
    expect(m.wrong_lessons).toEqual({ n: 3, wrong: 1, rate: 0.3333 });
    expect(m.by_class).toEqual({
      "lesson-worthy": { n: 2, good: 1, rate: 0.5 },
      "over-claim": { n: 2, good: 0, rate: 0 },
      "dated-status": { n: 2, wrong: 1, rate: 0.5 },
      "restates-asset": { n: 1, wrong: 0, rate: 0 },
      "duplicate-lesson": { n: 0, wrong: 0, rate: null },
    });
    expect(m.bad_by).toEqual({ missing_fact: 1, forbidden_claim: 1, contradiction: 1, too_long: 1, copied: 0 });
    expect(m.outcomes.lesson).toEqual({ lesson: 3, update: 0, skipped: 0, rejected: 1, invalid: 0, error: 0 });
    expect(m.outcomes.none).toEqual({ lesson: 1, update: 0, skipped: 2, rejected: 0, invalid: 0, error: 1 });
    expect(m.lesson_updates).toMatchObject({ n: 0, right: 0, rate: null });
  });

  test("lesson updates are counted apart: they are in neither good_lessons nor wrong_lessons", () => {
    const ok: UpdateChecks = { update_proposed: true, existing_kept: true, new_facts: true, no_extra_claims: true, not_copied: true, no_new_lesson: true };
    const upd = (id: string, verdict: Row["verdict"], outcome: Row["outcome"], checks: UpdateChecks | null) => ({ ...row(id, "lesson-update", verdict, { outcome, checks }), expect: "update" as const });
    const m = metrics([
      row("a", "lesson-worthy", "good"),
      row("b", "duplicate-lesson", "right"),
      row("c", "duplicate-lesson", "wrong", { outcome: "update" }),
      upd("u1", "right", "update", ok),
      upd("u2", "bad", "update", { ...ok, new_facts: false }),
      upd("u3", "bad", "lesson", { update_proposed: false, existing_kept: null, new_facts: null, no_extra_claims: null, not_copied: null, no_new_lesson: false }),
      upd("u4", "missed", "skipped", { update_proposed: false, existing_kept: null, new_facts: null, no_extra_claims: null, not_copied: null, no_new_lesson: true }),
      upd("u5", "error", "error", null),
    ]);
    expect(m.good_lessons).toEqual({ n: 1, good: 1, rate: 1, ambiguous: 0 });
    expect(m.wrong_lessons).toEqual({ n: 2, wrong: 1, rate: 0.5 });
    expect(m.lesson_updates).toEqual({ n: 4, right: 1, rate: 0.25, ambiguous: 0, checks: { update_proposed: 2, existing_kept: 2, new_facts: 1, no_extra_claims: 2, not_copied: 2, no_new_lesson: 3 } });
    expect(m.by_class["lesson-update"]).toEqual({ n: 4, right: 1, rate: 0.25 });
    expect(m.outcomes.update).toEqual({ lesson: 1, update: 2, skipped: 1, rejected: 0, invalid: 0, error: 1 });
    expect(m.outcomes.none.update).toBe(1);
    expect(m.bad_by).toEqual({ missing_fact: 0, forbidden_claim: 0, contradiction: 0, too_long: 0, copied: 0 });
  });

  test("an empty run has no rates", () => {
    const m = metrics([]);
    expect(m.good_lessons).toEqual({ n: 0, good: 0, rate: null, ambiguous: 0 });
    expect(m.by_class).toEqual({});
  });
});

describe("the baselines of the README's 'For scale'", () => {
  const cases = loadCases(PUBLIC);
  const improve = (outcome: string) => ({ ok: true, actions: [{ mode: "distill", result: { outcome } }] });
  const queued = (c: LoadedCase, content: string, update = false): Proposal => ({
    ref: update ? `bundle//lessons/${c.existing}` : `bundle//lessons/memory-${c.name}-lesson`,
    status: "pending",
    gate: update ? "deferred/distill-update" : "deferred/distill-review",
    scores: { novelty: 4, nonRedundancy: 5, grounding: 5 },
    reason: "ok",
    content,
    update,
  });
  const score = (make: (c: LoadedCase) => Proposal[]) => metrics(cases.map((c) => scoreCase(c, { improve: improve(make(c).length > 0 ? "queued" : "skipped"), proposals: make(c), seconds: 1 })));

  test("a distill that queues the memory pasted back for every memory, and for an update the old lesson with the memory added, is bad on every lesson and update case (#55)", () => {
    const m = score((c) => {
      if (c.expect === "update") return [queued(c, `---\ndescription: d\nwhen_to_use: w\n---\n${c.existingBody}\n${memoryBody(c.memory)}\n`, true)];
      return [queued(c, c.memory)];
    });
    expect(m.good_lessons).toEqual({ n: 40, good: 0, rate: 0, ambiguous: 0 });
    expect(m.lesson_updates).toMatchObject({ n: 40, right: 0, rate: 0, checks: { update_proposed: 40, existing_kept: 40, new_facts: 40, no_extra_claims: 40, not_copied: 0, no_new_lesson: 40 } });
    expect(m.wrong_lessons).toEqual({ n: 16, wrong: 16, rate: 1 });
    expect(m.bad_by).toMatchObject({ missing_fact: 0, forbidden_claim: 0, contradiction: 0, copied: 40 }); // the copy states every fact and claims nothing: only the copy check fails it
  });

  test("a distill that queues a lesson for every memory has wrong_lessons at 16/16, and one that queues nothing has good_lessons at 0/40", () => {
    expect(score((c) => [queued(c, "---\ndescription: d\nwhen_to_use: w\n---\nBody.\n")]).wrong_lessons).toEqual({ n: 16, wrong: 16, rate: 1 });
    const nothing = score(() => []);
    expect(nothing.good_lessons).toEqual({ n: 40, good: 0, rate: 0, ambiguous: 0 });
    expect(nothing.wrong_lessons).toEqual({ n: 16, wrong: 0, rate: 0 });
    expect(nothing.lesson_updates).toMatchObject({ n: 40, right: 0 });
  });

  test("the good example lessons and updates, queued as they are, score good and right", () => {
    const m = score((c) => {
      if (c.expect === "none") return [];
      return [c.expect === "update" ? queued(c, `---\ndescription: d\nwhen_to_use: w\n---\n${c.good}\n`, true) : queued(c, `---\ndescription: d\nwhen_to_use: w\n---\n${c.good}\n`)];
    });
    expect(m.good_lessons).toEqual({ n: 40, good: 40, rate: 1, ambiguous: 0 });
    expect(m.lesson_updates).toMatchObject({ n: 40, right: 40 });
    expect(m.wrong_lessons).toEqual({ n: 16, wrong: 0, rate: 0 });
  });
});


// A negation over a verb the shared rule does not list stands, so it still excuses a claim and denies an action. The row names the phrase
// under `ambiguous` and the verdict is as it was (#45, as extract does).
describe("a negation the shared rule cannot read marks the phrase ambiguous (#45)", () => {
  const skip = [["always skip", "skip * test"]];
  const wait = [["=wait for networkidle", "wait for networkidle"]];
  const layouts = [["works * all * layout"]];
  const heading = ["+wait * heading", "+wait * visible"];
  const reads = (text: string, groups: string[][], actions = false) => {
    const { claims: asserted, ambiguous } = readClaims(text, groups, actions);
    return { text, asserted, ambiguous };
  };

  test("the three sentences of the issue are not claims, and they are flagged, read as a fact and as an action", () => {
    const issue: [string, string][] = [
      ["I do not think we should always skip tests.", "always skip"],
      ["The agent did not ignore the instruction to always skip tests.", "always skip"],
      ["Not skipping tests is a mistake.", "skip * test"],
    ];
    for (const [text, phrase] of issue) {
      for (const actions of [false, true]) expect(reads(text, skip, actions)).toEqual({ text, asserted: [], ambiguous: [phrase] });
    }
  });

  test("the same forms against a contradiction, a claim and a required action of the public cases", () => {
    expect(reads("I do not think we should wait for networkidle.", wait, true).ambiguous).toEqual(["=wait for networkidle"]);
    expect(reads("The team did not ignore the advice to wait for networkidle.", wait, true).ambiguous).toEqual(["=wait for networkidle"]);
    expect(reads("Not to wait for networkidle would be a mistake.", wait, true).ambiguous).toEqual(["=wait for networkidle"]);
    expect(reads("Not waiting for networkidle is wrong.", [["wait for networkidle"]], true).ambiguous).toEqual(["wait for networkidle"]);
    for (const text of [
      "The team did not dispute that the fix works on all layouts.",
      "There is no doubt that the fix works on all layouts.",
      "We cannot deny that the fix works on all layouts.",
      "I do not think the fix works on all layouts.",
      "The fix works on all layouts, not just one.",
      "It does not fix the footnote and works on all layouts.",
    ]) {
      expect(reads(text, layouts)).toEqual({ text, asserted: [], ambiguous: ["works * all * layout"] });
    }
    expect(readStated("I do not think we should wait for the visible heading.", heading)).toEqual({ stated: true, ambiguous: "+wait * heading" });
    expect(readStated("It is not wise to wait for the visible heading.", heading)).toEqual({ stated: true, ambiguous: "+wait * heading" });
    expect(readStated("Do not rely on networkidle to wait for the heading.", heading)).toEqual({ stated: true, ambiguous: "+wait * heading" });
    expect(readStated("Not waiting for the visible heading is a mistake.", heading)).toEqual({ stated: false, ambiguous: "+wait * heading" });
  });

  test("the verdict is as the word order has it: a phrase behind such a negation is not a claim, and a required action under one is still stated", () => {
    expect(claims("I do not think we should always skip tests.", skip)).toEqual([]);
    expect(stated("I do not think we should wait for the visible heading.", heading)).toBe(true);
    expect(stated("Not waiting for the visible heading is a mistake.", heading)).toBe(false);
  });

  test("the sentences that the other tests of this file assert as denials are not flagged", () => {
    const plain = (texts: string[], groups: string[][]): [string, string[][]][] => texts.map((t) => [t, groups]);
    const actions: [string, string[][]][] = [
      ...plain(
        ["Never wait for networkidle.", "You should never wait for networkidle.", "Do not wait for networkidle.", "Don't wait for networkidle.", "Try not to wait for networkidle.", "There is no need to wait for networkidle.", "Do not rely on the timeout to wait for networkidle.", "Do not think it is wise to wait for networkidle.", "It is not wise to wait for networkidle.", "Never wait for networkidle and never wait for networkidle.", "Rather than wait for networkidle, wait for the heading."],
        wait,
      ),
      ...plain(
        ["Avoid waiting for networkidle.", "Try to avoid waiting for networkidle.", "Stop waiting for networkidle.", "Skip waiting for networkidle.", "Instead of waiting for networkidle.", "Rather than waiting for networkidle.", "Finish without waiting for networkidle.", "Avoid having to wait for networkidle.", "Do not forget to avoid waiting for networkidle.", "Never fail to avoid waiting for networkidle.", "Do not hesitate to skip waiting for networkidle.", "Do not hesitate to not wait for networkidle.", "Do not hesitate to never wait for networkidle."],
        [["wait for networkidle"]],
      ),
      ...plain(["Do not skip tests.", "It is not wise to always skip tests.", "The team does not plan to skip tests.", "Do not rush to always skip tests."], skip),
      ...plain(["Do not set SKIP_TESTS=1 when CI is red."], [["skip_tests"]]),
    ];
    for (const [text, groups] of actions) expect(reads(text, groups, true)).toEqual({ text, asserted: [], ambiguous: [] });
    for (const text of [
      "It doesn't work on all layouts.",
      "The fix does not work on all layouts.",
      "We cannot say that the fix works on all layouts.",
      "We do not say it works on all layouts.",
      "We do not know if it works on all layouts.",
      "It has not been confirmed that the fix works on all layouts.",
      "It was not verified that the fix works on all layouts.",
      "The fix works on all layouts, which has not been confirmed.",
      "The fix works on all layouts, which is not true.",
      "The fix works on all layouts but I did not test it.",
    ]) {
      expect(reads(text, layouts)).toEqual({ text, asserted: [], ambiguous: [] });
    }
    expect(reads("Not enough, but it is enough.", [["is enough"]])).toEqual({ text: "Not enough, but it is enough.", asserted: [], ambiguous: [] });
    for (const text of ["Never wait for the visible heading.", "Avoid waiting for the heading.", "Do not wait for networkidle, wait for the heading.", "Do not hesitate to wait for the heading.", "Do not use networkidle and wait for the heading.", "Wait for the heading. I do not think we should wait for the heading."]) {
      expect({ text, ambiguous: readStated(text, heading).ambiguous }).toEqual({ text, ambiguous: undefined });
    }
  });

  test("a group with a claim is a claim, and a doubt that excuses the phrase is not an ambiguity", () => {
    const text = "I do not think the fix works on all layouts. The fix works on all layouts.";
    expect(reads(text, layouts)).toEqual({ text, asserted: ["works * all * layout"], ambiguous: [] });
    expect(readClaims("We do not think it is known whether the fix works on all layouts.", layouts).ambiguous).toEqual([]);
    expect(readStated("I do not think we should wait for the heading. Wait for the heading.", heading)).toEqual({ stated: true });
  });

  test("a plain denial beside one the rule cannot read is flagged, and a negation that something else ends leaves the verdict to the next", () => {
    expect(reads("The team does not want to stop skipping tests.", skip, true).ambiguous).toEqual(["skip * test"]);
    expect(reads("A search that finds no references does not prove a function is unused.", [["prove * unused"]], true)).toMatchObject({ asserted: [], ambiguous: [] });
    expect(reads("Do not use waitForSelector and wait for networkidle.", wait, true).ambiguous).toEqual(["=wait for networkidle"]);
  });

  test("checkLesson names the phrases, and the good, bad and reversed wording of every public case is flagged only where it hides a claim", () => {
    const c = loadCases(PUBLIC).find((x) => x.id === "lesson-01") as LoadedCase;
    const body = (text: string) => `The support chat widget polls every 20 seconds, so the network is never idle. ${text}`;
    expect(checkLesson(c, body("I do not think we should wait for networkidle on this page. Wait for a specific element instead, such as the page heading being visible."), c.memory)).toMatchObject({ good: true, contradicted: [], ambiguous: ["=wait for networkidle"] });
    expect(checkLesson(c, body("The team did not ignore the advice to wait for networkidle, and also waits for the page heading to be visible."), c.memory)).toMatchObject({ good: true, contradicted: [], ambiguous: ["=wait for networkidle"] });
    expect(checkLesson(c, body("I do not think we should wait for the page heading."), c.memory)).toMatchObject({ good: true, missing: [], ambiguous: ["+wait * heading"] });
    expect(checkLesson(c, body("Not waiting for the page heading is a mistake."), c.memory)).toMatchObject({ good: false, missing: ["+wait * heading"], ambiguous: ["+wait * heading"] });
    expect(checkLesson(c, body("Do not wait for networkidle. Wait for the page heading to be visible."), c.memory)).toMatchObject({ good: true, ambiguous: [] });
    // the bad lesson of claim-03 says "no breaking changes, so every service can upgrade": it is bad for the first claim, and the second hides behind the "no"
    const upgrade = loadCases(PUBLIC).find((x) => x.id === "claim-03") as LoadedCase;
    expect(checkLesson(upgrade, upgrade.bad as string, upgrade.memory)).toMatchObject({ good: false, ambiguous: ["every service * can upgrade"] });
    for (const x of loadCases(PUBLIC).filter((y) => y.expect !== "none" && y.id !== "claim-03")) {
      for (const text of [x.good, x.bad, x.reversed].filter((t): t is string => typeof t === "string")) {
        const ambiguous = x.expect === "update" ? checkUpdate(x, x.existingBody as string, text, x.memory).ambiguous : checkLesson(x, text, x.memory).ambiguous;
        expect({ id: x.id, ambiguous }).toEqual({ id: x.id, ambiguous: [] });
      }
    }
  });

  test("an update is read the same way, over the lines it adds", () => {
    const u = loadCases(PUBLIC).find((x) => x.id === "upd-02") as LoadedCase;
    const existing = u.existingBody as string;
    const added = (line: string) => checkUpdate(u, existing, `${existing}\n${line}`, u.memory);
    expect(added("The runner has sorted the test files by name since version 4.2. I do not think the test order is random.")).toMatchObject({ forbidden: [], ambiguous: [] });
    expect(added("The runner has sorted the test files by name since version 4.2. The team did not dispute that tests run in parallel.")).toMatchObject({ forbidden: [], ambiguous: ["in parallel"] });
  });

  test("the metrics count the lessons and the updates to read, apart from the verdicts", () => {
    const base = (id: string, klass: Class, verdict: Row["verdict"], ambiguous: string[]): Row => ({
      ...errorRow({ id, class: klass, expect: klass === "lesson-update" ? "update" : "lesson" } as LoadedCase, "", 1),
      verdict,
      outcome: klass === "lesson-update" ? "update" : "lesson",
      error: undefined,
      ambiguous,
    });
    const m = metrics([base("a", "lesson-worthy", "good", ["x"]), base("b", "lesson-worthy", "good", []), base("c", "over-claim", "bad", ["y"]), base("d", "lesson-update", "right", ["z"]), base("e", "lesson-update", "bad", [])]);
    expect(m.good_lessons).toMatchObject({ n: 3, good: 2, ambiguous: 2 });
    expect(m.lesson_updates).toMatchObject({ n: 2, right: 1, ambiguous: 1 });
    // a row stored before the check has no list, and an errored case is left out
    const old = { ...base("f", "lesson-worthy", "good", []), ambiguous: undefined } as unknown as Row;
    expect(metrics([old, base("g", "lesson-worthy", "error", ["x"])]).good_lessons).toMatchObject({ n: 1, ambiguous: 0 });
  });
});
