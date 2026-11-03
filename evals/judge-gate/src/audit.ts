#!/usr/bin/env bun
// judge-gate audit: reads the labelled cases and prints what the labels cover (label, severity, lane, set), how much feedback each label has,
// and whether any candidate changes the body beyond an added title (reflect cannot). See assets/README.md (the rubric) and
// assets/ADJUDICATION.md (the labels that were changed to follow it). That every candidate is what akm writes is reachable.ts's check.
//
//   bun evals/judge-gate/src/audit.ts [--assets DIR] [--json]
//
// It exits 1 when a candidate edits the body, so it can stand as a check. It reads files only.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES, rubricVersion } from "./inputs.ts";
import { type Case, type Lane, type Severity, laneOf, parseCases } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const PUBLIC_ASSETS = join(EVAL_DIR, "assets");

/** The record of the labels that were changed to follow the rubric, and of the cases left as they were because the rubric does not decide them. */
export const ADJUDICATION = "ADJUDICATION.md";

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

export type BodyChange = "unchanged" | "title" | "edited";

/** What a candidate does to the body of the asset, the markdown after its frontmatter, apart from whitespace: nothing, add a first-line `# ` title (all reflect can do), or edit it. */
export function bodyChange(source: string, candidate: string): BodyChange {
  const before = squash(bodyOf(source));
  if (squash(bodyOf(candidate)) === before) return "unchanged";
  if (squash(bodyOf(candidate).replace(/^\s*# .*\n/, "")) === before) return "title";
  return "edited";
}

/** The frontmatter as blocks: each top-level key's line with the indented lines under it. */
function blocks(text: string): { key: string; block: string }[] {
  const fm = FRONTMATTER.exec(text)?.[0] ?? "";
  const out: { key: string; block: string }[] = [];
  for (const line of fm.split("\n").slice(1)) {
    if (line.startsWith("---")) break;
    const key = /^([A-Za-z_][\w-]*):/.exec(line)?.[1];
    if (key) out.push({ key, block: line });
    else if (out.length > 0) (out[out.length - 1] as { block: string }).block += `\n${line}`;
  }
  return out;
}

/** The frontmatter keys other than description, when_to_use and title that differ between a source and its candidate: reflect keeps every other line as it is, so none may. */
export function otherFrontmatterChanges(source: string, candidate: string): string[] {
  const rest = (text: string) => blocks(text).filter((b) => !["description", "when_to_use", "title"].includes(b.key));
  const [was, now] = [rest(source), rest(candidate)];
  const names = new Set([...was, ...now].map((b) => b.key));
  return [...names].filter((k) => was.filter((b) => b.key === k).map((b) => b.block).join("\n") !== now.filter((b) => b.key === k).map((b) => b.block).join("\n"));
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
  /** The cases of each label (good, and bad by severity) on each lane. */
  lanes: Record<"good" | Severity, Record<Lane, number>>;
  /** The cases of each set, by label. */
  sets: Record<string, { good: number; bad: number }>;
  /** Cases whose candidate edits the body beyond an added title: reflect cannot, so none may. */
  body_edits: string[];
  /** Cases whose candidate changes a frontmatter line other than description, when_to_use and title (a stamp such as `type:`, `generated:` or `updated:`): reflect cannot, so none may. */
  frontmatter_edits: { id: string; keys: string[] }[];
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
    const m = /^\|\s*`([\w-]+)`\s*\|(.*)\|\s*$/.exec(line);
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
  const lanes = Object.fromEntries(["good", "harmful", "churn", "other"].map((k) => [k, { negative: 0, maintenance: 0 }])) as Audit["lanes"];
  for (const c of cases) lanes[c.label === "good" ? "good" : (c.severity as Severity)][laneOf(c.feedback)]++;
  return {
    rubric_version: rubric,
    n_cases: cases.length,
    labels: { good: g, bad: b },
    severity: { harmful: bad.filter((c) => c.severity === "harmful").length, churn: bad.filter((c) => c.severity === "churn").length, other: bad.filter((c) => c.severity === "other").length },
    lanes,
    sets,
    body_edits: cases.filter((c) => bodyChange(c.source, c.candidate) === "edited").map((c) => c.id),
    frontmatter_edits: cases.map((c) => ({ id: c.id, keys: otherFrontmatterChanges(c.source, c.candidate) })).filter((x) => x.keys.length > 0),
    feedback_shortcuts: {
      refuse_any_feedback: { good_passed: g.feedback.none, bad_passed: b.feedback.none },
      refuse_negative_feedback: { good_passed: g.feedback.none + g.feedback.positive_only, bad_passed: b.feedback.none + b.feedback.positive_only },
    },
    adjudication: adjudication === undefined ? null : readAdjudication(adjudication),
  };
}

/** Does the audit find a candidate that edits the body or a frontmatter line reflect leaves alone? */
export const disagrees = (a: Audit): boolean => a.body_edits.length > 0 || a.frontmatter_edits.length > 0;

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
  out.push(`  bad by severity: ${a.severity.harmful} harmful, ${a.severity.churn} churn, ${a.severity.other} other`, "", "Lanes: cases on the negative lane (a [negative] line) and the maintenance lane");
  row("", "negative", "maintenance");
  for (const [label, n] of Object.entries(a.lanes)) row(label, n.negative, n.maintenance);
  out.push("", "Cases of each set, by label");
  row("", "good", "bad");
  for (const [set, n] of Object.entries(a.sets).sort(([x], [y]) => x.localeCompare(y))) row(set, n.good, n.bad);
  const s = a.feedback_shortcuts;
  out.push(
    "",
    "Passed without judging anything",
    `  refusing every case with feedback passes ${s.refuse_any_feedback.good_passed} of ${a.labels.good.n} good and ${s.refuse_any_feedback.bad_passed} of ${a.labels.bad.n} bad`,
    `  refusing every case with a [negative] line passes ${s.refuse_negative_feedback.good_passed} of ${a.labels.good.n} good and ${s.refuse_negative_feedback.bad_passed} of ${a.labels.bad.n} bad`,
    "",
    "Candidates against what reflect can do (must be 0)",
    `  candidate edits the body beyond an added title: ${a.body_edits.length}`,
  );
  for (const id of a.body_edits) out.push(`    ${id}: body edited`);
  out.push(`  candidate changes a frontmatter line other than description, when_to_use and title: ${a.frontmatter_edits.length}`);
  for (const x of a.frontmatter_edits) out.push(`    ${x.id}: ${x.keys.join(", ")}`);
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
    console.log("Usage: bun evals/judge-gate/src/audit.ts [--assets DIR] [--json]\n\nPrints what the labels cover, the feedback each label carries and whether a candidate edits what reflect cannot.\n--assets DIR reads DIR/cases.jsonl (default: assets/). Exits 1 when a candidate edits the body or a frontmatter line other than description, when_to_use and title.");
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
