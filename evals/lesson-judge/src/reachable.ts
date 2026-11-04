// Is a case's input one that akm's distill can send the lesson judge? The input is built by distill's code from a writer's reply, a library search and the
// feedback events, so no function maps a case to its input. What can be checked is every rule distill applies to the input before it calls the judge, and
// the shape it builds. This file calls those rules, loaded from an akm checkout, so akm decides and not a copy of its rules:
//
//   - the input is valid for `distill.lesson`'s inputSchema, the one `akm judge` refuses an unknown field by;
//   - a new lesson passes `lintLessonContent` and `collectLessonQualityFindings`, the gates that send a lesson to a person or refuse it before the judge
//     (`assembleDistilledContent`), and has at most RELATED_COUNT (3) related assets of the types distill searches (lesson, knowledge, skill);
//   - an update (`proposeLessonUpdate`) is the existing lesson with lines added: `diffLessonBody` drops no line of `extending` and finds a line added,
//     the lesson has frontmatter, `source` is the memory's body as distill strips it, and no `related` is sent;
//   - every feedback line is one `feedbackLines` writes (`- [signal] text`).
//
// A real case was also captured from a run of this akm's pipeline (capture.ts); these checks are what is left to run later, on a newer akm, without a model.
//
//   bun evals/lesson-judge/src/reachable.ts --akm ~/code/akm [--cases DIR]
//
// Exits 1 and names the cases that fail, so they can be retired (assets/retired.jsonl).

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES, parseCases } from "./lib.ts";
import type { Case } from "./score.ts";

/** The parts of an akm checkout this file uses. */
export interface Akm {
  inputSchema: Record<string, unknown>;
  schemaVersion: number;
  validate(value: unknown, schema: Record<string, unknown>): string[];
  lint(lesson: string, path: string): string[];
  quality(lesson: string, memoryRef: string): string[];
  diff(existing: string, merged: string): { dropped: string[]; added: string[] };
  parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string };
}

/** akm's distill code, from the checkout at `dir` (its dependencies are installed there). */
export async function loadAkm(dir: string): Promise<Akm> {
  const at = (file: string) => import(join(resolve(dir), "src", file));
  const [stage, schema, lint, repair, update, frontmatter] = await Promise.all([
    at("commands/improve/stage.ts"),
    at("core/json-schema.ts"),
    at("core/lesson-lint.ts"),
    at("commands/improve/distill/content-repair.ts"),
    at("commands/improve/distill/lesson-update.ts"),
    at("core/asset/frontmatter.ts"),
  ]);
  const judge = stage.lessonQualityJudge;
  return {
    inputSchema: judge.inputSchema,
    schemaVersion: judge.schemaVersion,
    validate: schema.validateJsonSchemaSubset,
    lint: (lesson, path) => lint.lintLessonContent(lesson, path).findings.map((f: { message: string }) => f.message),
    quality: (lesson, ref) => repair.collectLessonQualityFindings(lesson, ref).map((f: { message: string }) => f.message),
    diff: update.diffLessonBody,
    parseFrontmatter: frontmatter.parseFrontmatter,
  };
}

/** What distill searches for the judge's `related` list: lessons, knowledge notes and skills, and how many assets (distill.ts RELATED_TYPES and RELATED_COUNT). */
const RELATED_FOLDERS = /^(lessons|knowledge|skills)\//;
const RELATED_COUNT = 3;

/** The reasons akm's distill could not send this case's input to the judge. Empty when it can. */
export function problems(akm: Akm, c: Case): string[] {
  const out = akm.validate(c.input, akm.inputSchema).map((e) => `the input is not valid for the judge: ${e}`);
  if (out.length > 0) return out; // distill's rules read the fields the schema requires
  for (const line of c.input.feedback ?? []) if (!/^- \[[^\]]+\] \S/.test(line)) out.push(`feedback line "${line.slice(0, 40)}" is not one distill writes (- [signal] text)`);
  const lesson = akm.parseFrontmatter(c.input.lesson);
  if (c.mode === "new") {
    if (c.input.extending !== undefined) out.push("a new lesson has no `extending`");
    out.push(...akm.lint(c.input.lesson, `distill:${c.memory}`).map((m) => `lintLessonContent: ${m}`));
    out.push(...akm.quality(c.input.lesson, c.memory).map((m) => `collectLessonQualityFindings: ${m}`));
    if (akm.parseFrontmatter(c.input.source).content.trim() === "") out.push("the source memory has no body");
    const related = c.input.related ?? [];
    if (related.length > RELATED_COUNT) out.push(`${related.length} related assets: distill sends at most ${RELATED_COUNT}`);
    for (const r of related) if (!RELATED_FOLDERS.test(r.ref)) out.push(`related ${r.ref} is not a lesson, knowledge note or skill`);
  } else {
    if (c.input.related !== undefined) out.push("an update sends no `related`");
    const existing = c.input.extending ?? "";
    if (Object.keys(lesson.data).length === 0) out.push("an update keeps the lesson's frontmatter, and this one has none");
    const { dropped, added } = akm.diff(existing, lesson.content.trim());
    if (dropped.length > 0) out.push(`the update drops ${dropped.length} line(s) of the lesson it extends (distill refuses that before the judge)`);
    if (added.length === 0) out.push("the update adds no line (distill refuses that before the judge)");
    if (akm.parseFrontmatter(c.input.source).content.trim() !== c.input.source) out.push("an update's `source` is the memory's body without frontmatter, as distill strips it");
  }
  return out;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { akm: { type: "string" }, cases: { type: "string" } } });
  if (!values.akm) {
    console.error("reachable: --akm DIR (an akm checkout) is needed");
    process.exit(2);
  }
  const file = join(values.cases ? resolve(values.cases) : join(import.meta.dir, "..", "assets"), CASES);
  const akm = await loadAkm(values.akm);
  const cases = parseCases(readFileSync(file, "utf8"), file);
  let off = 0;
  for (const c of cases) {
    const why = problems(akm, c);
    if (why.length > 0) {
      off++;
      console.error(`reachable: ${c.id} is not an input akm sends:\n  ${why.join("\n  ")}`);
    }
  }
  console.log(`reachable: ${cases.length - off} of ${cases.length} cases are inputs akm sends (judge schemaVersion ${akm.schemaVersion})`);
  if (off > 0) process.exit(1);
}
