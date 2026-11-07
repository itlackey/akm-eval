// The lessons condition of memory-utility (akm#1405, D4): does a lesson that akm's own distill wrote from the notes help the reader, beyond
// the notes themselves? The lessons are a fixture, built once by `evals/memory-utility/build-lessons` (akm's real distill, the model under
// test as its engine) and read by `run --lessons`, so a run asks the model no distill question and the arm is reproducible.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256Json } from "../../../lib/provenance.ts";
import { conceptId } from "../../distill/src/score.ts";
import type { Case } from "./inputs.ts";
import { sourceFiles } from "./protocol.ts";
import type { Row } from "./score.ts";

export const LESSONS_FILE = "lessons.json";

export interface LessonCase {
  /** SHA-256 of the case's source notes as `sourceFiles` places them: the lessons were written from exactly these. */
  source_sha256: string;
  /** What distill did with each note: `lesson` (a pending lesson), `none` (queued nothing), `rejected` (akm's judge refused it). */
  notes: Record<string, "lesson" | "none" | "rejected">;
  /** The pending lessons, as `lessons/<name>.md`: the text akm would write on accept. */
  files: Record<string, string>;
}
export interface LessonsFixture {
  fixture_version: 1;
  akm_version: string;
  model: string;
  strategy: string;
  /** SHA-256 of `cases` as stored. The run checks it, so an edited fixture is refused. */
  outputs_sha256: string;
  cases: Record<string, LessonCase>;
}

export const LESSON_PATH = /^lessons\/[a-zA-Z0-9._-]+\.md$/;

/** The pending distill lessons in the lists `akm proposal list --status <s> --detail full` printed: `lessons/<name>.md` -> text. Updates and knowledge docs are not lessons. */
export function pendingLessons(listed: { status: string; proposals?: unknown[] }[]): { files: Record<string, string>; rejected: number } {
  const files: Record<string, string> = {};
  let rejected = 0;
  for (const { status, proposals } of listed) {
    for (const p of (proposals ?? []) as Record<string, any>[]) {
      if (p?.source !== "distill" || typeof p.ref !== "string" || !conceptId(p.ref).startsWith("lessons/")) continue;
      if (status === "rejected") { rejected++; continue; }
      if (status !== "pending") continue;
      const content = p.payload?.content;
      if (typeof content !== "string" || !content.trim()) throw new Error(`distill queued ${p.ref} with no content`);
      const id = conceptId(p.ref);
      const path = id.endsWith(".md") ? id : `${id}.md`;
      if (!LESSON_PATH.test(path)) throw new Error(`unexpected lesson path: ${path}`);
      if (path in files) throw new Error(`two lessons at ${path}`);
      files[path] = content;
    }
  }
  return { files, rejected };
}

export const outputsDigest = (cases: Record<string, LessonCase>): string => sha256Json(cases);
export const sourceDigest = (c: Pick<Case, "id" | "notes">): string => sha256Json(sourceFiles(c));

export function makeFixture(meta: { akm_version: string; model: string; strategy: string }, cases: Record<string, LessonCase>): LessonsFixture {
  return { fixture_version: 1, ...meta, outputs_sha256: outputsDigest(cases), cases };
}

/** The fixture of a cases folder, checked against the selected cases and against itself. A case that has no entry is an error: "no lessons" is an entry with no files. */
export function loadLessons(folder: string, cases: Pick<Case, "id" | "notes">[]): LessonsFixture {
  const path = join(folder, LESSONS_FILE);
  if (!existsSync(path)) throw new Error(`${path} is missing. Build it with: evals/memory-utility/build-lessons --model ID`);
  const f = JSON.parse(readFileSync(path, "utf8")) as LessonsFixture;
  if (f.fixture_version !== 1 || !f.cases || typeof f.akm_version !== "string") throw new Error(`${path} is not a lessons fixture`);
  if (f.outputs_sha256 !== outputsDigest(f.cases)) throw new Error(`${path} was edited: its outputs digest does not match. Rebuild it with build-lessons.`);
  for (const c of cases) {
    const entry = f.cases[c.id];
    if (!entry) throw new Error(`${path} has no entry for case ${c.id}. Rebuild it with build-lessons.`);
    if (entry.source_sha256 !== sourceDigest(c)) throw new Error(`the notes of case ${c.id} changed since the lessons were built. Rebuild ${path} with build-lessons.`);
    for (const p of Object.keys(entry.files)) if (!LESSON_PATH.test(p)) throw new Error(`${path}: unexpected lesson path ${p}`);
  }
  return f;
}

/** The pass rule, written before any run (README, "The lessons condition"). Reads the summary's lessons - source difference and the reader's prompt tokens per correct answer. */
export interface Verdict {
  verdict: "earned" | "not shown" | "harmful" | "incomplete";
  rule: string;
  difference: number | null;
  ci95: [number, number] | null;
  p_value: number | null;
  cases_with_lessons: number;
  tokens_per_correct: { source: number | null; lessons: number | null };
  tokens_ok: boolean | null;
}
export const RULE = "earned = lessons - source on failure-inclusive exact accuracy over all cases has a 95% interval (Fay-Lumbard) above 0, AND the reader's prompt tokens per correct answer are not higher than source's; harmful = interval below 0; otherwise not shown. Unfinished or errored cases make it incomplete.";
export function lessonsVerdict(summary: any, rows: Row[], fixture: LessonsFixture): Verdict {
  const diff = summary.metrics.memory_inference.failure_inclusive;
  const perCorrect = (arm: "source" | "inferred"): number | null => {
    const correct = rows.filter(r => r.arms[arm].correct).length;
    const tokens = summary.metrics.arms[arm].reported_usage.prompt_tokens;
    return correct > 0 && tokens.total_reported !== null && tokens.reporting_count === tokens.attempted_calls ? Number((tokens.total_reported / correct).toFixed(1)) : null;
  };
  const tokens = { source: perCorrect("source"), lessons: perCorrect("inferred") };
  const tokensOk = tokens.source === null || tokens.lessons === null ? null : tokens.lessons <= tokens.source;
  const ci: [number, number] | null = diff.ci95;
  const complete = summary.n_errored === 0 && summary.n_unfinished === 0 && summary.n_scored === summary.n_cases;
  const verdict: Verdict["verdict"] = !complete || !ci ? "incomplete" : ci[1] < 0 ? "harmful" : ci[0] > 0 && tokensOk === true ? "earned" : "not shown";
  return { verdict, rule: RULE, difference: diff.value, ci95: ci, p_value: diff.p_value,
    cases_with_lessons: rows.filter(r => Object.keys(fixture.cases[r.id]?.files ?? {}).length > 0).length, tokens_per_correct: tokens, tokens_ok: tokensOk };
}
