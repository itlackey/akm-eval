#!/usr/bin/env bun
// judge-gate audit: reads the labelled cases and prints where the labels disagree with the rubric, how much feedback each label has, and
// what the labels cover. See assets/README.md (the rubric) and assets/ADJUDICATION.md (the labels that were changed to follow it).
//
//   bun evals/judge-gate/src/audit.ts [--assets DIR] [--json]
//
// It exits 1 when a good case still disagrees with the rubric, so it can stand as a check. It reads files only.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES, rubricVersion } from "./inputs.ts";
import { type Case, type Severity, parseCases } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const PUBLIC_ASSETS = join(EVAL_DIR, "assets");

/** The record of the labels that were changed to follow the rubric, and of the cases left as they were because the rubric does not decide them. */
export const ADJUDICATION = "ADJUDICATION.md";

/**
 * The words the rubric uses for churn: the ones its label and severity sections name (an intro, headings, a table of contents, backticks,
 * a recased title, reworded prose, "only restates") and the reflow that the known limits name. A good case whose label reason uses one
 * of them says, in its own words, that the revision carries churn, and the rubric calls such a revision bad.
 */
export const CHURN_TERMS: [string, RegExp][] = [
  ["churn", /\bchurn\b/i],
  ["restates", /\brestat(?:e|es|ed|ing)\b/i],
  ["intro", /\bintro(?:duction)?\b/i],
  ["headings", /\bheadings?\b/i],
  ["table of contents", /\btable of contents\b/i],
  ["backticks", /\bbackticks?\b/i],
  ["recased", /\brecas(?:e|ed|ing)\b/i],
  ["reworded prose", /\breword(?:ed|ing)?\s+(?:prose|body)\b/i],
  ["reflow", /\b(?:reflow(?:ed|s)?|unwrapp?(?:ed|ing)|re-?wrapped)\b/i],
];

/** The names of the churn terms that a label reason uses. */
export const churnTerms = (reason: string): string[] => CHURN_TERMS.filter(([, pattern]) => pattern.test(reason)).map(([name]) => name);

/** What the feedback of a case says, the way akm's judge reads it: any `[negative]` line makes it negative feedback. */
export type FeedbackKind = "none" | "positive_only" | "negative";

export function feedbackKind(feedback: string): FeedbackKind {
  const lines = feedback.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return "none";
  return lines.some((l) => l.startsWith("[negative]")) ? "negative" : "positive_only";
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;
const bodyOf = (text: string): string => text.replace(FRONTMATTER, "");
const squash = (text: string): string => text.split(/\s+/).filter(Boolean).join(" ");

/**
 * What a revision does to the body of the asset, the markdown after its frontmatter, apart from whitespace: `unchanged`; `title`, which
 * is a first-line `# ` heading and nothing else added (the rubric's "missing title" defect); or `edited`, anything more, such as an intro,
 * headings, reworded prose, or a duplicated block removed. A good case is allowed the first two. A reflow that only moves whitespace is
 * `unchanged` here, and the label reason is the only check that sees it.
 */
export function bodyChange(source: string, candidate: string): "unchanged" | "title" | "edited" {
  const before = squash(bodyOf(source));
  if (squash(bodyOf(candidate)) === before) return "unchanged";
  return squash(bodyOf(candidate).replace(/^\s*# .*\n/, "")) === before ? "title" : "edited";
}

export interface Coverage {
  n: number;
  feedback: Record<FeedbackKind, number>;
}

export interface Adjudication {
  /** Cases whose label changed: the id and the whole row of the table, as written. */
  changed: { id: string; cells: string[] }[];
  /** Cases left as they were because the rubric does not clearly decide them: the id and the reason. */
  borderline: { id: string; set: string; why: string }[];
}

export interface Audit {
  rubric_version: number;
  n_cases: number;
  labels: { good: Coverage; bad: Coverage };
  /** The bad cases by severity. */
  severity: Record<Severity, number>;
  /** The cases of each set, by label. */
  sets: Record<string, { good: number; bad: number }>;
  /** The body of the good cases against their source. Only `edited` disagrees with the rubric. */
  good_body: Record<"unchanged" | "title" | "edited", number>;
  /** Good cases whose label reason uses a word the rubric names as churn. Must be empty. */
  reason_disagreements: { id: string; terms: string[] }[];
  /** Good cases whose candidate edits the body beyond a title. Must be empty. */
  body_disagreements: string[];
  /** What a judge that decided on the feedback alone would pass, without judging anything. */
  feedback_shortcuts: Record<"refuse_any_feedback" | "refuse_negative_feedback", { good_passed: number; bad_passed: number }>;
  adjudication: Adjudication | null;
}

/** The rows of a table in the section of `markdown` whose heading starts with `heading`: lines that start with a backticked id. A cell has no pipe in it. */
function sectionRows(markdown: string, heading: string): { id: string; cells: string[] }[] {
  const lines = markdown.split("\n");
  const at = lines.findIndex((l) => l.startsWith("## ") && l.slice(3).startsWith(heading));
  if (at < 0) return [];
  const rows: { id: string; cells: string[] }[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith("## ")) break;
    const m = /^\|\s*`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`\s*\|(.*)\|\s*$/.exec(line);
    if (m) rows.push({ id: m[1], cells: m[2].split("|").map((c) => c.trim()) });
  }
  return rows;
}

/** The record in an ADJUDICATION.md: the cases whose label changed and the borderline ones. */
export function readAdjudication(markdown: string): Adjudication {
  return {
    changed: sectionRows(markdown, "Relabelled"),
    borderline: sectionRows(markdown, "Borderline").map((r) => ({ id: r.id, set: r.cells[0] ?? "", why: r.cells[1] ?? "" })),
  };
}

const count = <K extends string>(keys: K[], values: K[]): Record<K, number> => Object.fromEntries(keys.map((k) => [k, values.filter((v) => v === k).length])) as Record<K, number>;

/** The audit of a set of cases. `adjudication` is the text of ADJUDICATION.md, when there is one. */
export function audit(cases: Case[], rubric: number, adjudication?: string): Audit {
  const of = (label: "good" | "bad") => cases.filter((c) => c.label === label);
  const [good, bad] = [of("good"), of("bad")];
  const coverage = (rows: Case[]): Coverage => ({ n: rows.length, feedback: count(["none", "positive_only", "negative"], rows.map((c) => feedbackKind(c.feedback))) });
  const [g, b] = [coverage(good), coverage(bad)];
  const sets: Audit["sets"] = {};
  for (const c of cases) (sets[c.set] ??= { good: 0, bad: 0 })[c.label]++;
  const bodies = good.map((c) => ({ id: c.id, change: bodyChange(c.source, c.candidate) }));
  return {
    rubric_version: rubric,
    n_cases: cases.length,
    labels: { good: g, bad: b },
    severity: { harmful: bad.filter((c) => c.severity === "harmful").length, churn: bad.filter((c) => c.severity === "churn").length },
    sets,
    good_body: count(["unchanged", "title", "edited"], bodies.map((x) => x.change)),
    reason_disagreements: good.map((c) => ({ id: c.id, terms: churnTerms(c.labelReason ?? "") })).filter((x) => x.terms.length > 0),
    body_disagreements: bodies.filter((x) => x.change === "edited").map((x) => x.id),
    feedback_shortcuts: {
      refuse_any_feedback: { good_passed: g.feedback.none, bad_passed: b.feedback.none },
      refuse_negative_feedback: { good_passed: g.feedback.none + g.feedback.positive_only, bad_passed: b.feedback.none + b.feedback.positive_only },
    },
    adjudication: adjudication === undefined ? null : readAdjudication(adjudication),
  };
}

/** Does the audit find a good case that disagrees with the rubric? */
export const disagrees = (a: Audit): boolean => a.reason_disagreements.length > 0 || a.body_disagreements.length > 0;

/** The audit as the text the command prints. */
export function format(a: Audit): string {
  const out: string[] = [];
  const row = (label: string, ...cells: (string | number)[]) => out.push(`  ${label.padEnd(26)}${cells.map((c) => String(c).padStart(14)).join("")}`);
  out.push(`judge-gate audit | rubric_version ${a.rubric_version} | ${a.n_cases} cases`, "", "Label coverage, and the feedback each label carries");
  row("", "cases", "no feedback", "positive only", "[negative]");
  for (const label of ["good", "bad"] as const) {
    const c = a.labels[label];
    row(label, c.n, c.feedback.none, c.feedback.positive_only, c.feedback.negative);
  }
  out.push(`  bad by severity: ${a.severity.harmful} harmful, ${a.severity.churn} churn`, "", "Cases of each set, by label");
  row("", "good", "bad");
  for (const [set, n] of Object.entries(a.sets).sort(([x], [y]) => x.localeCompare(y))) row(set, n.good, n.bad);
  const s = a.feedback_shortcuts;
  out.push(
    "",
    "Passed without judging anything",
    `  refusing every case with feedback passes ${s.refuse_any_feedback.good_passed} of ${a.labels.good.n} good and ${s.refuse_any_feedback.bad_passed} of ${a.labels.bad.n} bad`,
    `  refusing every case with a [negative] line passes ${s.refuse_negative_feedback.good_passed} of ${a.labels.good.n} good and ${s.refuse_negative_feedback.bad_passed} of ${a.labels.bad.n} bad`,
    "",
    "Good cases against the rubric (each must be 0)",
    `  label reason uses a churn word: ${a.reason_disagreements.length}`,
    `  candidate edits the body beyond a title: ${a.body_disagreements.length}   (body of the good cases: ${a.good_body.unchanged} unchanged, ${a.good_body.title} title only, ${a.good_body.edited} edited)`,
  );
  for (const d of a.reason_disagreements) out.push(`    ${d.id}: ${d.terms.join(", ")}`);
  for (const id of a.body_disagreements) out.push(`    ${id}: body edited`);
  if (a.adjudication === null) out.push("", `No ${ADJUDICATION} beside the cases.`);
  else {
    out.push("", `Adjudication record (${ADJUDICATION}): ${a.adjudication.changed.length} labels changed, ${a.adjudication.borderline.length} borderline cases left as they were`);
    for (const x of a.adjudication.borderline) out.push(`    ${x.id}  ${x.why}`);
  }
  return out.join("\n");
}

function main(): void {
  let values: { assets?: string; json?: boolean; help?: boolean };
  try {
    values = parseArgs({ args: Bun.argv.slice(2), options: { assets: { type: "string" }, json: { type: "boolean" }, help: { type: "boolean", short: "h" } }, strict: true }).values;
  } catch (e) {
    console.error(`judge-gate audit: ${(e as Error).message}\nUsage: bun evals/judge-gate/src/audit.ts [--assets DIR] [--json]`);
    process.exit(2);
  }
  if (values.help) {
    console.log("Usage: bun evals/judge-gate/src/audit.ts [--assets DIR] [--json]\n\nPrints where the labels of the cases disagree with the rubric, the feedback each label carries and what the labels cover.\n--assets DIR reads DIR/cases.jsonl (default: assets/). Exits 1 when a good case disagrees with the rubric.");
    return;
  }
  const dir = resolve(values.assets ?? PUBLIC_ASSETS);
  const file = join(dir, CASES);
  const record = join(dir, ADJUDICATION);
  const result = audit(parseCases(readFileSync(file, "utf8"), file), rubricVersion(PUBLIC_ASSETS), existsSync(record) ? readFileSync(record, "utf8") : undefined);
  console.log(values.json ? JSON.stringify(result, null, 2) : format(result));
  if (disagrees(result)) process.exit(1);
}

if (import.meta.main) main();
