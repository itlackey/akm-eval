import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCases } from "./lib.ts";
import { type Akm, loadAkm, problems } from "./reachable.ts";
import type { Case } from "./score.ts";

/** The rules of akm's distill that problems() calls, as far as these tests need them: a stand-in, so the checks around them are tested without a checkout. */
const fake: Akm = {
  inputSchema: {},
  schemaVersion: 1,
  validate: (v) => (typeof (v as { lesson?: unknown }).lesson === "string" ? [] : ["$.lesson is missing"]),
  lint: (lesson) => (lesson.includes("NODESC") ? ["Lesson is missing `description`"] : []),
  quality: (lesson) => (lesson.includes("DATED") ? ["a dated status"] : []),
  diff: (existing, merged) => {
    const had = new Set(existing.split("\n").map((l) => l.trim()).filter(Boolean));
    const now = new Set(merged.split("\n").map((l) => l.trim()).filter(Boolean));
    return { dropped: [...had].filter((l) => !now.has(l)), added: [...now].filter((l) => !had.has(l)) };
  },
  parseFrontmatter: (raw) => {
    const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
    return m ? { data: Object.fromEntries(m[1]!.split("\n").map((l) => [l.split(":")[0]!, l.split(":").slice(1).join(":").trim()])), content: m[2]! } : { data: {}, content: raw };
  },
};

const base = (over: Partial<Case>, input: Partial<Case["input"]> = {}): Case => ({
  id: "x",
  mode: "new",
  label: "good",
  labelReason: "r",
  origin: "real",
  from: "lesson-01",
  memory: "memories/m",
  input: { lesson: "---\ndescription: d\nwhen_to_use: w\n---\n\nbody", source: "---\ntype: memory\n---\nthe memory", ...input },
  ...over,
});

describe("problems", () => {
  test("a new lesson that passes distill's gates, with feedback as distill writes it, is an input akm sends", () => {
    expect(problems(fake, base({}, { feedback: ["- [negative] too vague"], related: [{ ref: "lessons/a", content: "c" }] }))).toEqual([]);
  });

  test("names what distill would refuse before the judge, or what the judge's schema refuses", () => {
    expect(problems(fake, base({}, { lesson: "NODESC" }))[0]).toContain("lintLessonContent");
    expect(problems(fake, base({}, { lesson: "---\ndescription: d\n---\nDATED" }))[0]).toContain("collectLessonQualityFindings");
    expect(problems(fake, base({}, { feedback: ["negative: bad"] }))[0]).toContain("is not one distill writes");
    expect(problems(fake, base({}, { related: Array.from({ length: 4 }, () => ({ ref: "lessons/a", content: "c" })) }))[0]).toContain("at most 3");
    expect(problems(fake, base({}, { related: [{ ref: "memories/a", content: "c" }] }))[0]).toContain("not a lesson, knowledge note or skill");
    expect(problems(fake, base({}, { extending: "rule" }))[0]).toContain("no `extending`");
    expect(problems(fake, base({}, { source: "---\ntype: memory\n---\n" }))[0]).toContain("no body");
    expect(problems(fake, { ...base({}), input: { source: "s" } as never })[0]).toContain("not valid for the judge");
  });

  test("an update is the lesson it extends with lines added, and nothing else", () => {
    const update = (lesson: string, extending: string, over: Partial<Case["input"]> = {}) => base({ mode: "update" }, { lesson, extending, source: "memory body", ...over });
    const ok = update("---\ndescription: d\n---\nrule\nadded", "rule");
    expect(problems(fake, ok)).toEqual([]);
    expect(problems(fake, update("---\ndescription: d\n---\nreworded\nadded", "rule"))[0]).toContain("drops 1 line");
    expect(problems(fake, update("---\ndescription: d\n---\nrule", "rule"))[0]).toContain("adds no line");
    expect(problems(fake, update("rule\nadded", "rule"))[0]).toContain("frontmatter");
    expect(problems(fake, update("---\ndescription: d\n---\nrule\nadded", "rule", { related: [{ ref: "lessons/a", content: "c" }] }))[0]).toContain("no `related`");
    expect(problems(fake, update("---\ndescription: d\n---\nrule\nadded", "rule", { source: "---\ntype: memory\n---\nbody" }))[0]).toContain("without frontmatter");
  });
});

// These tests run akm's own distill code, so they need a checkout of akm with its dependencies installed: AKM_CHECKOUT=DIR bun test.
const checkout = process.env.AKM_CHECKOUT;

describe.skipIf(!checkout)("every case is an input akm's distill sends", () => {
  test("the cases of the set, and of the held-out part, pass akm's own gates", async () => {
    const akm = await loadAkm(checkout as string);
    for (const folder of [join(import.meta.dir, "..", "assets"), join(import.meta.dir, "..", "assets", "held-out")]) {
      const cases = parseCases(readFileSync(join(folder, "cases.jsonl"), "utf8"));
      expect(cases.map((c) => ({ id: c.id, why: problems(akm, c) })).filter((c) => c.why.length > 0)).toEqual([]);
    }
  });

  test("a case akm could not send is found", async () => {
    const akm = await loadAkm(checkout as string);
    expect(problems(akm, base({}, { lesson: "no frontmatter at all" })).length).toBeGreaterThan(0);
    expect(problems(akm, base({ mode: "update" }, { lesson: "---\ndescription: d\nwhen_to_use: w\n---\nreworded", extending: "the rule", source: "memory" })).join()).toContain("drops");
  });
});
