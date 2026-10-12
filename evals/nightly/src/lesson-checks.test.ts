// lesson-checks.ts is a copy of the distill eval's checks of a lesson (see there for why it is a copy). These tests hold the copy to the original: on every
// public distill case, with the lessons the case ships to pin its phrases (good, bad and reversed) and some that the case's own phrases make, both give
// the same answer. A change to distill's checks fails here until the copy follows it, and the nightly scorer is bumped.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import * as distill from "../../distill/src/lib.ts";
import * as copy from "./lesson-checks.ts";

const cases = distill.loadCases(join(import.meta.dir, "..", "..", "distill", "assets"));

/** The lessons to check a case with: the three the case ships, one made of its required facts, one of its forbidden claims, one of its contradictions, the memory itself and nothing. */
function lessonsOf(c: (typeof cases)[number]): string[] {
  const phrases = (groups: string[][]) => groups.map((g) => g[0] ?? "").join(". ");
  return [c.good, c.bad, c.reversed, phrases(c.required), phrases(c.forbidden), phrases(c.contradicts), c.memory, "", "We do not wait for networkidle; never avoid the heading."].filter((x): x is string => typeof x === "string");
}

describe("the copy of distill's checks of a lesson", () => {
  test("exists for the public distill cases, which are many and of every class", () => {
    expect(cases.length).toBeGreaterThan(20);
    expect(new Set(cases.map((c) => c.class)).size).toBe(6);
  });

  test("gives the same check as distill's for every case and lesson", () => {
    let checked = 0;
    for (const c of cases) {
      for (const lesson of lessonsOf(c)) {
        const [a, b] = [distill.checkLesson(c, lesson, c.memory), copy.checkLesson(c, lesson, c.memory)];
        expect({ case: c.id, check: b }).toEqual({ case: c.id, check: a });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  test("reads a lesson file and a memory as distill's does, and names the lesson file as distill does", () => {
    for (const c of cases) {
      for (const text of [c.good ?? "", c.memory, `---\ndescription: d\nwhen_to_use: w\n---\nBody\n`, "no frontmatter"]) {
        expect(copy.lessonText(text)).toBe(distill.lessonText(text));
        expect(copy.memoryBody(text)).toBe(distill.memoryBody(text));
      }
      expect(copy.lessonFile({ name: c.name })).toBe(distill.lessonFile({ name: c.name }));
    }
    expect(copy.MAX_RATIO).toBe(distill.MAX_RATIO);
  });

  test("matches phrases as distill does", () => {
    for (const c of cases) {
      const text = [c.good, c.bad, c.memory].filter(Boolean).join("\n");
      for (const group of [...c.required, ...c.forbidden, ...c.contradicts]) {
        expect(copy.stated(text, group)).toBe(distill.stated(text, group));
        expect(copy.claims(text, [group])).toEqual(distill.claims(text, [group]));
        expect(copy.claims(text, [group], true)).toEqual(distill.claims(text, [group], true));
        for (const phrase of group) expect(copy.mentions(text, phrase)).toBe(distill.mentions(text, phrase));
      }
    }
  });

  test("is the text of distill's, unchanged: every function it copies is in distill's file as it is written there", () => {
    const [mine, theirs] = ["./lesson-checks.ts", "../../distill/src/lib.ts"].map((f) => readFileSync(join(import.meta.dir, f), "utf8"));
    for (const name of ["normalize", "pattern", "claims", "stated", "lessonText", "checkLesson", "sentencesOf"]) {
      const body = (src: string, where: string) => {
        const at = src.search(new RegExp(`(?:export )?function ${name}\\b`));
        if (at < 0) throw new Error(`${where} does not define ${name}: if distill's checks moved, import them from where they are now (a file that imports nothing of the collector) and delete lesson-checks.ts`);
        return src.slice(at).split(/\n}\n/)[0];
      };
      expect({ name, text: body(mine as string, "lesson-checks.ts") }).toEqual({ name, text: body(theirs as string, "evals/distill/src/lib.ts") });
    }
  });
});
