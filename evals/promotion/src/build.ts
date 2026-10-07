#!/usr/bin/env bun
// promotion build: makes the public cases, assets/cases.jsonl, from knowledge notes in corpus/library. A good case is a note
// held out of the library, proposed as a new note. A bad case is a duplicate of a note that stays in the library, or a held-out
// note that says it is out of date or a status snapshot. Run it again after a change to the table below: a test fails when the
// file is out of date.
//
//   bun evals/promotion/src/build.ts

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Case } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const KNOWLEDGE = join(EVAL_DIR, "..", "..", "corpus", "library", "knowledge");
const STATUS_DATE = "2026-10-03";

const AI = "skills/ai-skills";
const PRINT = "skills/print";

/** Notes held out of the library and proposed as they are: a new note nothing in the library says. */
const GOOD = [`${AI}/opencode-extensions/references/network`, `${AI}/opencode-extensions/references/config`, `${AI}/opencode-troubleshoot/references/log-analysis`, `${PRINT}/pdf-layout-reviewer/references/print-standards`, `${AI}/opencode-extensions/references/permissions`, `${PRINT}/pdfx-print-pipeline/references/CSS_PRINT`];

/** Notes that stay in the library and are proposed again under a new name: three whole, three as their first half. */
const DUPLICATE = [`${AI}/agent-cli-tools/references/codex`, `${AI}/agent-cli-tools/references/claude-code`, `${AI}/agent-cli-tools/references/image-input`, `${PRINT}/pdf-review/references/print-quality-checklist`, `${AI}/agent-cli-tools/references/qwen-code`, `${AI}/opencode-extensions/references/plugins`];

/** Held-out notes that say a note of the library replaced them. */
const STALE: [string, string][] = [
  [`${PRINT}/pdfx-print-pipeline/references/DRIVETHRURPG`, `${PRINT}/pdf-review/references/print-quality-checklist`],
  [`${AI}/opencode-extensions/references/plugins-docs`, `${AI}/opencode-extensions/references/plugins`],
  [`${AI}/llm-delegation-tool/README`, `${AI}/agent-cli-tools/references/codex`],
  [`${AI}/llm-delegation-tool/scripts/README`, `${AI}/agent-cli-tools/references/claude-code`],
];

/** Held-out notes that are a status snapshot: a date, a commit, a branch and what is left to do. */
const EPHEMERAL = [`${PRINT}/pdf-layout-reviewer/references/common-issues`, `${PRINT}/pdf-layout-reviewer/assets/report-template`, `${AI}/llm-delegation-tool/examples/claude-md-section`, `${AI}/agent-cli-tools/assets/README`];

const read = (path: string): string => readFileSync(join(KNOWLEDGE, `${path}.md`), "utf8");

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

if (import.meta.main) {
  writeFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), render(build()));
  console.log(`wrote ${build().length} cases to evals/promotion/assets/cases.jsonl`);
}
