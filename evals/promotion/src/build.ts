#!/usr/bin/env bun
// promotion build: makes the public cases, assets/cases.jsonl, and the bundle they are judged against, assets/library/knowledge/,
// from knowledge notes in corpus/library. A good case is a note held out of the library, proposed as a new note. A bad case is a
// duplicate of a note that stays in the library, or a held-out note that says it is out of date or a status snapshot. Run it again
// after a change to the table below or to a note it reads: a test fails when the files are out of date.
//
//   bun evals/promotion/src/build.ts

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Case } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const LIBRARY = join(EVAL_DIR, "..", "..", "corpus", "library");
/** The notes a run holds in its bundle, as build.ts makes them: library/knowledge/. */
export const BUNDLE_DIR = join(EVAL_DIR, "assets", "library", "knowledge");
const STATUS_DATE = "2026-10-03";

// A note of a skill is named by its path in corpus/library (skills/<x>/references/a, without .md). akm gives it the ref
// knowledge/<that path>, and the library keeps it once, in the skill.
const AI = "skills/ai-skills";
const PRINT = "skills/print";

/** Notes held out of the library and proposed as they are: a new note nothing in the library says. */
const GOOD = [`${AI}/opencode-extensions/references/network`, `${AI}/opencode-extensions/references/config`, `${AI}/opencode-troubleshoot/references/log-analysis`, `${PRINT}/pdf-layout-reviewer/references/print-standards`, `${AI}/opencode-extensions/references/permissions`, `${PRINT}/pdf-layout-reviewer/references/vlm-prompts`];

/** Notes that stay in the library and are proposed again under a new name: three whole, three as their first half. */
const DUPLICATE = [`${AI}/agent-cli-tools/references/codex`, `${AI}/agent-cli-tools/references/claude-code`, `${AI}/agent-cli-tools/references/image-input`, `${PRINT}/pdf-review/references/print-quality-checklist`, `${AI}/agent-cli-tools/references/qwen-code`, `${AI}/opencode-extensions/references/plugins`];

/** Held-out notes that say a note of the library replaced them. */
const STALE: [string, string][] = [
  [`${PRINT}/pdf-layout-reviewer/CHANGELOG`, `${PRINT}/pdf-review/references/print-quality-checklist`],
  [`${AI}/opencode-extensions/references/plugins-docs`, `${AI}/opencode-extensions/references/plugins`],
  [`${AI}/llm-delegation-tool/README`, `${AI}/agent-cli-tools/references/codex`],
  [`${AI}/llm-delegation-tool/scripts/README`, `${AI}/agent-cli-tools/references/claude-code`],
];

/** Held-out notes that are a status snapshot: a date, a commit, a branch and what is left to do. */
const EPHEMERAL = [`${PRINT}/pdf-layout-reviewer/references/common-issues`, `${PRINT}/pdf-layout-reviewer/assets/report-template`, `${AI}/llm-delegation-tool/examples/claude-md-section`, `${AI}/agent-cli-tools/references/aider`];

/** Notes of skills that no case uses. They stay in the bundle beside the others, which are the library's knowledge/ folder and the notes the cases use. */
const OTHER = [`${PRINT}/pdf-review/README`, `${PRINT}/pdf-review/references/ttrpg-standards`, `${PRINT}/pdfx-print-pipeline/references/DRIVETHRURPG`, `${PRINT}/pdfx-print-pipeline/references/CSS_PRINT`, `${AI}/agent-cli-tools/assets/README`];

const read = (path: string): string => readFileSync(join(LIBRARY, `${path}.md`), "utf8");

/** The note with `lines` after its first level-1 heading, or after the frontmatter when it has none. */
export function insertAfterTitle(text: string, lines: string): string {
  const fm = /^---\n[\s\S]*?\n---\n/.exec(text)?.[0] ?? "";
  const body = text.slice(fm.length);
  const heading = /^# .*\n/m.exec(body);
  const at = heading ? heading.index + heading[0].length : 0;
  return `${fm}${body.slice(0, at)}\n${lines}\n${body.slice(at)}`;
}

/** The note up to the end of the paragraph nearest the middle of its body. */
export function firstHalf(text: string): string {
  const fm = /^---\n[\s\S]*?\n---\n/.exec(text)?.[0] ?? "";
  const body = text.slice(fm.length);
  const breaks = [...body.matchAll(/\n\n/g)].map((m) => m.index);
  const cut = breaks.reduce((best, b) => (Math.abs(b - body.length / 2) < Math.abs(best - body.length / 2) ? b : best), breaks[0] ?? body.length);
  return `${fm}${body.slice(0, cut)}\n`;
}

const sha7 = (path: string): string => createHash("sha1").update(path).digest("hex").slice(0, 7);

export function build(): Case[] {
  const cases: Case[] = [];
  const add = (category: Case["category"], n: number, ref: string, content: string, labelReason: string) =>
    cases.push({ id: `${category}-${String(n).padStart(2, "0")}`, label: category === "good" ? "good" : "bad", category, ref: `knowledge/${ref}`, content, labelReason });

  GOOD.forEach((path, i) => add("good", i + 1, path, read(path), "A reference note that no note of the library repeats, with nothing in it that is out of date."));
  DUPLICATE.forEach((path, i) => {
    const whole = i < 3;
    add("duplicate", i + 1, `${path}-notes`, whole ? read(path) : firstHalf(read(path)), `${whole ? "A copy of" : "The first half of"} knowledge/${path}, which is in the library: every claim is already there.`);
  });
  STALE.forEach(([path, by], i) => {
    const text = insertAfterTitle(read(path).replace(/^---\n/, "---\nbeliefState: deprecated\n"), `> Status: superseded. The setup this note describes was retired on 2026-09-18 and replaced by [[${by}]]. Do not follow the steps below.`);
    add("stale", i + 1, path, text, `Says it was retired and replaced by knowledge/${by}, which is in the library.`);
  });
  EPHEMERAL.forEach((path, i) =>
    add("ephemeral", i + 1, path, insertAfterTitle(read(path), `> Status snapshot as of ${STATUS_DATE} (commit ${sha7(path)}, branch feature/${path.split("/").pop()?.toLowerCase()}-wave-2): 14 of 20 items done, rollout awaiting review. Check again on 2026-10-06 before relying on any of it.`), "A status snapshot with a date, a commit and a branch, which is out of date within days."),
  );
  return cases;
}

export const render = (cases: Case[]): string => cases.map((c) => `${JSON.stringify(c)}\n`).join("");

/** The files under `dir`, relative to it. */
function filesUnder(dir: string, below = ""): string[] {
  return readdirSync(join(dir, below), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(dir, join(below, e.name)) : [join(below, e.name)]));
}

/**
 * The notes of the bundle a run judges the cases against, by path under knowledge/: the library's own knowledge/ folder, and the notes of skills
 * that the cases and OTHER name. A run holds a note of a skill where akm gives it its ref, knowledge/skills/<x>/references/a.md, and the library
 * keeps it once, in the skill, so the bundle is made here and not copied from the library.
 */
export function bundle(): Map<string, string> {
  const notes = new Map<string, string>();
  for (const file of filesUnder(join(LIBRARY, "knowledge")).sort()) notes.set(file, readFileSync(join(LIBRARY, "knowledge", file), "utf8"));
  const named = [...GOOD, ...DUPLICATE, ...STALE.flat(), ...EPHEMERAL, ...OTHER];
  for (const path of [...new Set(named)].sort()) notes.set(`${path}.md`, read(path));
  return notes;
}

/** Writes the bundle into `dir`, which it empties first. */
export function writeBundle(notes: Map<string, string>, dir = BUNDLE_DIR): void {
  rmSync(dir, { recursive: true, force: true });
  for (const [file, text] of notes) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
}

if (import.meta.main) {
  const cases = build();
  writeFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), render(cases));
  const notes = bundle();
  writeBundle(notes);
  console.log(`wrote ${cases.length} cases to evals/promotion/assets/cases.jsonl and ${notes.size} notes to evals/promotion/assets/library/knowledge/`);
}
