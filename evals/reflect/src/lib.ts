// Helpers for the reflect eval that are neither its scorer nor its collector: how a defect is injected into a clean note, the checks on a
// case itself, the digests of the corpus, and reading the cases. build.ts makes the public cases with them, generate.ts the private
// cases and run.ts runs the eval.
//
// The scorer is score.ts and the collector is collect.ts (see measurement.ts); this file re-exports both, so the eval and the evals that
// borrow its checks (nightly, extract) import from one place.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256File, sha256Text } from "../../../lib/provenance.ts";
import { CLASSES, type Case, type CaseClass, type Defect, type Field, HANGING, akmProblems, collapse, descriptionProblem, hasCopiedFrontmatter, isDefect, parse, splitFrontmatter, whenToUseProblem } from "./score.ts";

export * from "./score.ts";
export * from "./collect.ts";
export { atLeast } from "../../../lib/akm/akm.ts"; // the evals that borrow reflect's checks borrow this too

// --- Injecting a defect ------------------------------------------------------------------------------------------

/** The lines of a frontmatter key and the indented lines that continue it, as [start, end). */
function fieldSpan(lines: string[], key: string): [number, number] | undefined {
  const start = lines.findIndex((l) => new RegExp(`^${key}\\s*:`).test(l));
  if (start < 0) return undefined;
  let end = start + 1;
  while (end < lines.length && /^[ \t]/.test(lines[end] ?? "")) end++;
  return [start, end];
}

/** The note with its frontmatter lines changed by `edit`, or undefined when it has none or `edit` gives none back. */
function editFrontmatter(note: string, edit: (lines: string[]) => string[] | undefined): string | undefined {
  const m = note.match(/^(---\n)([\s\S]*?)(\n---\n?)([\s\S]*)$/);
  if (!m) return undefined;
  const lines = edit((m[2] ?? "").split("\n"));
  return lines && `${m[1]}${lines.join("\n")}${m[3]}${m[4]}`;
}

/** The description as words, or undefined unless it is a plain YAML scalar, which is what the injections need. */
function plainWords(lines: string[]): { words: string[]; span: [number, number] } | undefined {
  const span = fieldSpan(lines, "description");
  if (!span) return undefined;
  const text = collapse(lines.slice(...span).join(" ").replace(/^description\s*:/, ""));
  return /^["'|>]/.test(text) || text === "" ? undefined : { words: text.split(" "), span };
}

/** The note with the description's lines replaced by `lines(words)`. */
function rewriteDescription(note: string, lines: (words: string[]) => string[] | undefined): string | undefined {
  return editFrontmatter(note, (fm) => {
    const d = plainWords(fm);
    const out = d && lines(d.words);
    return d && out && [...fm.slice(0, d.span[0]), ...out, ...fm.slice(d.span[1])];
  });
}

const descriptionWords = (note: string): number => {
  const fm = splitFrontmatter(note).fm;
  return (fm && plainWords(fm.split("\n"))?.words.length) || 0;
};

const removeField = (note: string, key: string): string | undefined =>
  editFrontmatter(note, (lines) => {
    const span = fieldSpan(lines, key);
    return span && [...lines.slice(0, span[0]), ...lines.slice(span[1])];
  });

/** The ways to cut `n` words in two (2 to n-2 words first), the ones nearest `target` of the way along first. */
const cuts = (n: number, target = 0.5): number[] =>
  Array.from({ length: Math.max(0, n - 3) }, (_, i) => i + 2).sort((a, b) => Math.abs(a - n * target) - Math.abs(b - n * target));

/** The first candidate for which akm names the defect and nothing else. */
const firstThatWorks = (candidates: (string | undefined)[], expected: Defect): string | undefined =>
  candidates.find((note) => note !== undefined && akmProblems(note).join() === expected);

function injectPeriod(note: string): string | undefined {
  const candidates = cuts(descriptionWords(note)).map((at) => rewriteDescription(note, (w) => [`description: ${w.slice(0, at).join(" ")}.`, `  ${w.slice(at).join(" ")}`]));
  return firstThatWorks(candidates, "description-period");
}

function injectQuote(note: string): string | undefined {
  const candidates = cuts(descriptionWords(note)).map((at) =>
    rewriteDescription(note, (w) => {
      const [a, b] = [w[at], w[at + 1]];
      if (!a || !b || !/^[a-z][a-z-]{2,}$/.test(a) || !/^[a-z][a-z-]{2,}$/.test(b)) return undefined;
      return [`description: ${[...w.slice(0, at), `\\"${a}`, `${b}\\"`, ...w.slice(at + 2)].join(" ")}`];
    }),
  );
  return firstThatWorks(candidates, "description-quote");
}

/** Cut the description after a hanging word, as a model that ran out of output does. */
function injectTruncation(note: string): string | undefined {
  const candidates = cuts(descriptionWords(note), 0.65).map((at) =>
    rewriteDescription(note, (w) => {
      const last = (w[at - 1] ?? "").replace(/[.,;:]+$/, "");
      return at >= 6 && HANGING.has(last.toLowerCase()) ? [`description: ${[...w.slice(0, at - 1), last].join(" ")}`] : undefined;
    }),
  );
  return firstThatWorks(candidates, "description-truncated");
}

/** Drop the `title` key and the first level-1 heading. */
function injectNoTitle(note: string): string | undefined {
  const bare = removeField(note, "title") ?? note;
  const m = bare.match(/^(---\n[\s\S]*?\n---\n?)([\s\S]*)$/);
  return m ? firstThatWorks([`${m[1]}${(m[2] ?? "").replace(/^#[ \t]+\S.*\n(?:\n)?/m, "")}`], "title-missing") : undefined;
}

/** A second copy of the frontmatter at the top of the body. */
function injectCopiedFrontmatter(note: string): string | undefined {
  const m = note.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
  const out = m && `${m[1]}\n${m[1]}${m[2]}`;
  return out && akmProblems(out).length === 0 && hasCopiedFrontmatter(out) ? out : undefined;
}

/** A note is clean when akm names nothing in it, its two fields are valid and no frontmatter is copied into the body. */
export function cleanProblems(note: string): string[] {
  const { data } = parse(note);
  const description = typeof data?.description === "string" ? data.description : "";
  const whenToUse = typeof data?.when_to_use === "string" ? data.when_to_use : "";
  return [
    ...akmProblems(note),
    ...(hasCopiedFrontmatter(note) ? ["frontmatter-in-body"] : []),
    ...(data === undefined ? ["frontmatter does not parse"] : []),
    ...(descriptionProblem(description) ? [`description ${descriptionProblem(description)}`] : []),
    ...(whenToUseProblem(whenToUse, description) ? [`when_to_use ${whenToUseProblem(whenToUse, description)}`] : []),
  ];
}

/**
 * The clean note with the class's defect in it, or undefined when it cannot be made there or akm would name
 * anything but that one defect. A class with no defect to inject gives the note back, if it is clean.
 */
export function inject(cls: CaseClass, clean: string): string | undefined {
  if (cleanProblems(clean).length > 0) return undefined;
  switch (cls) {
    case "description-period":
      return injectPeriod(clean);
    case "description-quote":
      return injectQuote(clean);
    case "description-truncated":
      return injectTruncation(clean);
    case "description-missing":
      return firstThatWorks([removeField(clean, "description")], "description-missing");
    case "when-to-use-missing":
      return firstThatWorks([removeField(clean, "when_to_use")], "when-to-use-missing");
    case "title-missing":
      return injectNoTitle(clean);
    case "body-defect":
      return injectCopiedFrontmatter(clean);
    default:
      return clean;
  }
}

// --- The cases themselves -----------------------------------------------------------------------------------------

/** The field a class's fix has to repair. */
export const fixOf = (cls: CaseClass): Field | undefined => (cls === "title-missing" ? "title" : cls === "when-to-use-missing" ? "when_to_use" : cls.startsWith("description-") ? "description" : undefined);

/** The fields a result may change: the fix, or for a `historical` case the `when_to_use`. */
export const allowOf = (cls: CaseClass): Field[] => (cls === "historical" ? ["when_to_use"] : fixOf(cls) ? [fixOf(cls) as Field] : []);

/** The reasons a case is wrong: what akm names in its note is not what the case says, or its expectations do not fit. */
export function caseProblems(c: Case): string[] {
  const named = akmProblems(c.source);
  const problems: string[] = [];
  if (isDefect(c.class)) {
    if (named.join() !== c.class) problems.push(`akm names ${named.join(", ") || "nothing"}, not ${c.class}`);
  } else if (named.length > 0) problems.push(`akm names ${named.join(", ")} in a note with no defect to fix`);
  if (hasCopiedFrontmatter(c.source) !== (c.class === "body-defect")) problems.push(c.class === "body-defect" ? "no frontmatter is copied into the body" : "frontmatter is copied into the body");
  if (parse(c.source).data === undefined) problems.push("the frontmatter does not parse");
  if (c.fix !== fixOf(c.class)) problems.push(`fix is ${c.fix ?? "unset"}, expected ${fixOf(c.class) ?? "unset"}`);
  if (c.allow.join() !== allowOf(c.class).join()) problems.push(`allow is [${c.allow.join(", ")}], expected [${allowOf(c.class).join(", ")}]`);
  const haystack = c.source.toLowerCase();
  for (const t of c.forbid ?? []) if (haystack.includes(t.toLowerCase())) problems.push(`the note already says "${t}"`);
  for (const a of c.anchors ?? []) if (!c.source.includes(a)) problems.push(`the note does not record "${a}"`);
  if (c.class === "unsupported-ask" && !(c.forbid ?? []).length) problems.push("no forbidden term");
  if (c.class === "historical" && !(c.anchors ?? []).length) problems.push("no anchor");
  return problems;
}

// --- What a run read ----------------------------------------------------------------------------------------------

/**
 * One digest over files, each named by a name of its own: the digest of sha256Files, except that the name is not the path
 * the file is read from. A name relative to the corpus folder gives a digest that holds in another checkout.
 */
export function digestOf(files: [name: string, path: string][]): string {
  const sorted = [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Text(sorted.map(([name, path]) => `${name}\0${sha256File(path)}\n`).join(""));
}

/** The digest of what a run reads from a corpus folder: its cases.jsonl. */
export const assetsSha256 = (assets: string): string => digestOf([["cases.jsonl", join(assets, "cases.jsonl")]]);

export const GENERATED = "generated.json";

// --- Cases, outcomes and metrics ---------------------------------------------------------------------------------

export function parseCases(content: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  content.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${where}:${i + 1} is not valid JSON`);
    }
    for (const key of ["id", "path", "source", "feedback"] as const) if (typeof c[key] !== "string" || c[key] === "") throw new Error(`${where}:${i + 1} has no string "${key}"`);
    if (!CLASSES.includes(c.class)) throw new Error(`${where}:${i + 1} has class "${c.class}"`);
    if (!Array.isArray(c.allow)) throw new Error(`${where}:${i + 1} has no "allow" list`);
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/** The first N cases. The file is ordered so that any run of ten cases holds every class once. */
export const selectCases = (cases: Case[], limit?: number): Case[] => (limit === undefined ? cases : cases.slice(0, limit));

