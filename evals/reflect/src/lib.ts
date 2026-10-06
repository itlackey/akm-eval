// Pure helpers for the reflect eval: the defects akm names, how one is injected into a clean note, the checks
// that score a result, and the metrics. build.ts makes the public cases with them, generate.ts the private
// cases and run.ts runs the eval.

import { engineConfig } from "../../../lib/akm/akm.ts";

export const DEFECTS = ["description-period", "description-quote", "description-truncated", "description-missing", "when-to-use-missing", "title-missing"] as const;
export const CONTROLS = ["retrieval-miss", "unsupported-ask", "historical", "body-defect"] as const;
export type Defect = (typeof DEFECTS)[number];
export type CaseClass = Defect | (typeof CONTROLS)[number];
export const CLASSES: readonly CaseClass[] = [...DEFECTS, ...CONTROLS];
export const isDefect = (c: CaseClass): c is Defect => (DEFECTS as readonly string[]).includes(c);

/** The three fields a reflect patch can change. `title` is the text of a level-1 heading akm adds to the body. */
export type Field = "description" | "when_to_use" | "title";

export interface Case {
  id: string;
  class: CaseClass;
  /** Where the note sits in the bundle. It is the note's path under corpus/library. */
  path: string;
  /** The note: a clean one, or a clean one with the defect injected. */
  source: string;
  /** The negative feedback a user leaves. */
  feedback: string;
  /** What was injected, or what the note is when there is no defect. */
  defect: string;
  /** What a correct result is. */
  correct: string;
  /** The field a fix has to repair. Defect classes only. */
  fix?: Field;
  /** The fields a result may change. A field outside this list that changes is churn. */
  allow: Field[];
  /** Terms the feedback asks for that the note does not support. No changed field may carry one. */
  forbid?: string[];
  /** The versions and dates the note records. A `historical` case only. */
  anchors?: string[];
  canary?: string;
}

/** The ref akm gives a note: its path without `.md`, and without `/SKILL` for a skill. */
export const refOf = (path: string): string => path.replace(/\.md$/, "").replace(/\/SKILL$/, "");

// --- What akm names ---------------------------------------------------------------------------------------------
// These mirror akm 0.9.26. `frontmatterProblems` in src/integrations/agent/prompts.ts lists the problems the prompt
// tells the model to fix. `detectTruncatedDescription` in src/core/text-truncation.ts and `isValidDescription` in
// src/commands/proposal/validators/proposal-quality-validators.ts say what a cut-off or invalid description is.
// `detectDoubleFrontmatter` in the same file says what frontmatter copied into the body is.

/** The text of a frontmatter block and the rest of the note. akm's `splitFrontmatter`. */
export function splitFrontmatter(note: string): { fm: string | null; body: string } {
  const m = note.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  return m ? { fm: m[1] ?? "", body: m[2] ?? "" } : { fm: null, body: note };
}

/** Words that end a sentence only when it was cut off. akm's `TRUNCATION_TRAILING_WORDS`. */
const HANGING = new Set(
  "a after an and are as at be been before being but by can could did do does for from had has have if in into is may might must of on onto or per shall should so than that the to upon via was were when which while will with would".split(" "),
);

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

/** akm reads a description from its first line and the indented lines after it. */
const rawDescription = (fm: string): string => collapse(fm.match(/^description\s*:(.*(?:\r?\n[ \t]+.*)*)/m)?.[1] ?? "");

/** A sentence split by a stray period: a period, a space and a lowercase word, except after `e.g.` and the like. */
export function hasStrayPeriod(description: string): boolean {
  return [...description.matchAll(/[\w`)\]]\. [a-z]/g)].some((m) => !/\b(?:e\.g|i\.e|vs|etc|cf)$/i.test(description.slice(0, (m.index ?? 0) + 1)));
}

export const hasEscapedQuote = (description: string): boolean => description.includes('\\"');

/** A description that ends on a trailing mark, an ellipsis or a hanging word. akm's `detectTruncatedDescription`. */
export function isTruncated(description: string): boolean {
  const t = description.trim();
  if (!t) return false;
  if (/[,;:+]$/.test(t) || /\.{3,}$|…$/.test(t)) return true;
  return HANGING.has((t.split(/\s+/).pop() ?? "").toLowerCase());
}

/** The problems akm finds in a note's frontmatter, in the order it lists them. A note with no frontmatter has none. */
export function akmProblems(note: string): Defect[] {
  const { fm, body } = splitFrontmatter(note);
  if (fm === null) return [];
  const problems: Defect[] = [];
  const description = rawDescription(fm);
  if (!description.replace(/^["' ]+|["' ]+$/g, "")) problems.push("description-missing");
  else {
    if (hasStrayPeriod(description)) problems.push("description-period");
    else if (hasEscapedQuote(description)) problems.push("description-quote");
    if (isTruncated(description)) problems.push("description-truncated");
  }
  if (!/^when_to_use\s*:\s*(?:\S|\r?\n[ \t]+\S)/m.test(fm)) problems.push("when-to-use-missing");
  if (!/^title\s*:\s*\S/m.test(fm) && !/^#[ \t]+\S/m.test(body)) problems.push("title-missing");
  return problems;
}

/** Frontmatter copied into the body: more than two `---` lines, or a body line that restates a field. */
export function hasCopiedFrontmatter(note: string): boolean {
  if (note.split(/\r?\n/).filter((l) => /^---\s*$/.test(l)).length > 2) return true;
  return splitFrontmatter(note).body.split(/\r?\n/).some((l) => /^\s*(\*\*|__)?\s*(description|when_to_use)\s*(\*\*|__)?\s*:/i.test(l));
}

/** Descriptions that are a section heading, not a description. akm's `HEADING_FRAGMENT_PATTERNS`. */
const HEADING = [
  /^for example\b/i,
  /^to reduce\b/i,
  /^key (pitfalls|fixes|points|takeaways|considerations|steps|notes|tips|insights|features|benefits|risks)\b/i,
  /^(examples?|summary|overview|introduction|takeaways|conclusion|notes?|tips?)$/i,
];

/** What is wrong with a description as akm's `isValidDescription` sees it, or undefined when nothing is. */
export function descriptionProblem(value: string): string | undefined {
  const v = value.trim();
  if (v.length < 20 || v.length > 400) return `${v.length} characters, akm wants 20 to 400`;
  if (/^[\d#*\->`]/.test(v)) return "starts with a digit or a markdown mark";
  if (isTruncated(v) || HANGING.has(v.match(/([A-Za-z']+)[.!?]*$/)?.[1]?.toLowerCase() ?? "")) return "ends as if it was cut off";
  if (HEADING.some((re) => re.test(v))) return "is a heading";
  if (/^(def|function|async\s+def|async\s+function|class|const|let|var|export\s+function|export\s+const|export\s+default|import|public|private|protected|fn|func)\s+\S/i.test(v)) return "starts like code";
  if ((v.match(/`/g) ?? []).length % 2 !== 0) return "has an odd number of backticks";
  return undefined;
}

/** What is wrong with a `when_to_use`, or undefined when nothing is. */
export function whenToUseProblem(value: string, description: string): string | undefined {
  const v = value.trim();
  if (v.length < 15 || v.length > 400) return `${v.length} characters, akm wants 15 to 400`;
  if (/^when working with\b/i.test(v)) return "is the circular fallback";
  if (v.toLowerCase() === description.trim().toLowerCase()) return "repeats the description";
  return undefined;
}

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

// --- Scoring -----------------------------------------------------------------------------------------------------

interface Note {
  body: string;
  /** The frontmatter as YAML reads it, or undefined when it does not parse. */
  data: Record<string, unknown> | undefined;
}

function parse(note: string): Note {
  const { fm, body } = splitFrontmatter(note);
  if (fm === null) return { body, data: {} };
  try {
    const data: unknown = Bun.YAML.parse(fm);
    return { body, data: data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {} };
  } catch {
    return { body, data: undefined };
  }
}

/** What akm itself writes into a proposal's frontmatter (a `type:` line the note lacked): neither a fix nor churn. */
const BOOKKEEPING = new Set(["type", "generated", "verified"]);

const text = (value: unknown): string | undefined => (typeof value === "string" ? collapse(value) : undefined);
const wordsOf = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Does `after` keep every word of `before`? A repair that changes only the break keeps them all. */
function keeps(before: string, after: string): boolean {
  const kept = new Set(wordsOf(after));
  return wordsOf(before).every((w) => kept.has(w));
}

/** A cut-off description without the hanging words and marks at its end, which are what a repair may drop. */
function withoutTail(description: string): string {
  const words = collapse(description).replace(/[.,;:+…]+$/, "").split(" ");
  while (words.length > 0 && HANGING.has((words.at(-1) ?? "").toLowerCase())) words.pop();
  return words.join(" ");
}

/** The heading akm adds to a body that has none: `# Title`, a blank line, then the old body without its leading blank lines. */
function addedTitle(before: string, after: string): string | undefined {
  const m = after.match(/^\n# (\S[^\n]*)\n\n/);
  return m && after.slice(m[0].length) === before.replace(/^(\r?\n)+/, "") ? m[1] : undefined;
}

/** Words in a changed value that name something: a digit, two capitals, a path or a dotted name. Each must be in the note. */
function ungrounded(value: string, note: string): string[] {
  const haystack = note.toLowerCase();
  return value
    .split(/[\s-]+/)
    .map((t) => t.replace(/^[^\w`]+|[^\w`]+$/g, "").replace(/`/g, ""))
    .filter((t) => t !== "" && /\d|[A-Z].*[A-Z]|[a-z][/_.][a-z]/.test(t) && !haystack.includes(t.toLowerCase()));
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The ways a `when_to_use` may name what the note records: as written, and a date also as year and month. */
function anchorForms(anchor: string): string[] {
  const m = anchor.match(/^(\d{4})-(\d{2})-\d{2}$/);
  return m ? [anchor, `${m[1]}-${m[2]}`, `${MONTHS[Number(m[2]) - 1]} ${m[1]}`] : [anchor];
}

const HISTORICAL = /\b(historical|history|legacy|obsolete|outdated|out of date|deprecated|superseded|former|formerly|previous|previously|past|archived?|older|old|no longer|retired)\b/i;

export type CheckName = "body_kept" | "defect_fixed" | "no_extra_change" | "no_invented" | "not_current";
export type Checks = Partial<Record<CheckName, boolean>>;

export interface Scored {
  checks: Checks;
  /** The fields the result changes. `title` is a heading added to the body. */
  changed: string[];
  /** The new text of each changed field. */
  values: Record<string, string>;
}

/**
 * The description akm writes itself when a note has frontmatter but no description and the model gives none: from
 * the title, the first heading or the first sentence. akm's `deriveDescriptionFromAsset` in reflect.ts.
 */
function derivedDescription(note: Note): string | undefined {
  const line = note.body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^(#{1,6}\s|```|~~~|[-*+]\s|\d+\.\s|>|\||<!--)/.test(l));
  const candidates: [string | undefined, boolean][] = [
    [text(note.data?.title), true],
    [note.body.match(/^#{1,6}\s+(.+?)\s*$/m)?.[1], true],
    [line?.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? line, false],
  ];
  for (const [raw, isHeading] of candidates) {
    const name = collapse((raw ?? "").replace(/`/g, "").replace(/^[#>*\-\s]+/, ""));
    for (const v of !name ? [] : isHeading ? [`Reference notes on ${name}.`, name] : [name]) {
      if (descriptionProblem(v.slice(0, 400)) === undefined) return v.slice(0, 400).trimEnd();
    }
  }
  return undefined;
}

/** Is the defect repaired in `after`, with what the note said kept? */
function isFixed(c: Case, before: Note, after: Note, title: string | undefined): boolean {
  const [was, now] = [text(before.data?.description) ?? "", text(after.data?.description)];
  const ok = now !== undefined && descriptionProblem(now) === undefined;
  switch (c.class) {
    case "description-period":
      return ok && !hasStrayPeriod(now) && keeps(was, now);
    case "description-quote":
      return ok && !hasEscapedQuote(now) && keeps(was, now);
    case "description-truncated":
      return ok && keeps(withoutTail(was), now);
    case "description-missing":
      return ok && now !== derivedDescription(before); // the model's own description, not the one akm falls back to
    case "when-to-use-missing": {
      const w = text(after.data?.when_to_use);
      return w !== undefined && whenToUseProblem(w, now ?? "") === undefined;
    }
    case "title-missing":
      return title !== undefined;
    default:
      return false;
  }
}

/**
 * Score a result with checks that need no judge. `proposal` is the note as the proposal would leave it, or undefined
 * when reflect made none, which leaves the note as it is.
 */
export function score(c: Case, proposal: string | undefined): Scored {
  const [before, after] = [parse(c.source), parse(proposal ?? c.source)];
  const title = addedTitle(before.body, after.body);
  const changed = after.data === undefined || before.data === undefined ? ["frontmatter"] : [...new Set([...Object.keys(before.data), ...Object.keys(after.data)])].filter((k) => !BOOKKEEPING.has(k) && !sameJson(before.data?.[k], after.data?.[k]));
  if (title !== undefined) changed.push("title");
  const values: Record<string, string> = {};
  for (const k of changed) {
    const v = k === "title" ? title : k === "description" || k === "when_to_use" ? text(after.data?.[k]) : undefined;
    if (v !== undefined) values[k] = v;
  }
  const newText = Object.values(values).join("\n");
  const checks: Checks = {
    body_kept: after.body === before.body || (title !== undefined && c.allow.includes("title")),
    no_extra_change: changed.every((k) => (c.allow as string[]).includes(k)),
    no_invented: ungrounded(newText, c.source).length === 0 && !(c.forbid ?? []).some((t) => new RegExp(`(?<!\\w)${escapeRegExp(t)}(?!\\w)`, "i").test(newText)),
  };
  if (isDefect(c.class)) checks.defect_fixed = isFixed(c, before, after, title);
  if (c.class === "historical") {
    const w = values.when_to_use;
    checks.not_current = w === undefined || HISTORICAL.test(w) || (c.anchors ?? []).some((a) => anchorForms(a).some((form) => w.includes(form)));
  }
  return { checks, changed, values };
}

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

// --- akm --------------------------------------------------------------------------------------------------------

/** The strategy that runs reflect alone. */
export const STRATEGY = "reflect-only";

/**
 * The akm config for a run: the model under test as the one engine, and a strategy that runs reflect on its own,
 * with its quality judge off. judge-gate scores the judge, so here every proposal reaches the checks.
 */
export function reflectConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, unknown> {
  const config = engineConfig(baseUrl, model, hasKey, "reflect");
  const off = { enabled: false };
  config.defaults.improveStrategy = STRATEGY;
  config.improve = {
    strategies: {
      [STRATEGY]: {
        engine: "reflect",
        processes: { reflect: { enabled: true, qualityGate: off }, distill: off, consolidate: off, memoryInference: off, extract: off, validation: off, triage: off, proactiveMaintenance: off },
        sync: { enabled: false, push: false },
      },
    },
  };
  return config;
}

/** Is `version` at least `minimum`? Both are semver. A prerelease is below its release and ordered by its tag. */
export function atLeast(version: string, minimum: string): boolean {
  const parse = (v: string) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(v);
    if (!m) throw new Error(`not a version: ${v}`);
    return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4]?.split(".") ?? [] };
  };
  const a = parse(version);
  const b = parse(minimum);
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return (a.nums[i] ?? 0) > (b.nums[i] ?? 0);
  if (a.pre.length === 0 || b.pre.length === 0) return a.pre.length === 0; // a release is above any of its prereleases
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const [x, y] = [a.pre[i], b.pre[i]];
    if (x === undefined) return false;
    if (y === undefined) return true;
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Number(x) > Number(y);
    if (nx !== ny) return ny; // a number is below a word
    return x > y;
  }
  return true;
}

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

export type Outcome = "proposal" | "none" | "refused" | "unusable" | "error";

/**
 * What reflect did on one asset, from the result of `akm improve <ref> --json-to-stdout`. akm exits 0 whatever
 * reflect did, so the outcome comes from the reflect action in the result.
 */
export function reflectOutcome(improve: unknown): { outcome: Outcome; reason: string } {
  const actions = (improve as { actions?: { mode?: string; result?: { ok?: boolean; reason?: string; error?: string } }[] } | null)?.actions ?? [];
  const action = actions.find((a) => a.mode?.startsWith("reflect"));
  if (!action?.result) return { outcome: "error", reason: "reflect did not run on the asset" };
  const { ok, reason = "", error = "" } = action.result;
  if (ok) return { outcome: "proposal", reason: "" };
  const why = `${reason}: ${error}`.slice(0, 300);
  if (reason === "no_change") return { outcome: "none", reason: why };
  if (reason === "quality_rejected" || action.mode === "reflect-guard-rejected") return { outcome: "refused", reason: why };
  if (reason === "parse_error") return { outcome: "unusable", reason: why };
  return { outcome: "error", reason: why };
}

export interface Row {
  id: string;
  class: CaseClass;
  outcome: Outcome;
  correct: boolean | null;
  checks: Checks | null;
  changed: string[];
  values: Record<string, string>;
  reason: string;
  seconds: number;
  error?: string;
}

/** A row for a case. An error has no verdict. A reply akm could not use, or an edit its own filter refused, is never correct. */
export function makeRow(c: Case, run: { outcome: Outcome; proposal?: string; reason?: string; seconds: number; error?: string }): Row {
  const base = { id: c.id, class: c.class, outcome: run.outcome, reason: run.reason ?? "", seconds: run.seconds };
  if (run.outcome === "error") return { ...base, correct: null, checks: null, changed: [], values: {}, error: run.error ?? run.reason };
  const { checks, changed, values } = score(c, run.outcome === "proposal" ? run.proposal : undefined);
  const correct = (run.outcome === "proposal" || run.outcome === "none") && Object.values(checks).every(Boolean);
  return { ...base, correct, checks, changed, values };
}

export interface Stats {
  n: number;
  correct: number;
  rate: number | null;
}
export interface ClassStats extends Stats {
  outcomes: Record<Outcome, number>;
  failed: Partial<Record<CheckName, number>>;
}
export interface Metrics {
  defects: Stats;
  controls: Stats;
  classes: Partial<Record<CaseClass, ClassStats>>;
  proposals: { n: number; touched_body: number };
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));
const stats = (rows: Row[]): Stats => {
  const scored = rows.filter((r) => r.outcome !== "error");
  const correct = scored.filter((r) => r.correct).length;
  return { n: scored.length, correct, rate: ratio(correct, scored.length) };
};

/** Defects fixed and controls kept, in total and per class, over the cases reflect gave an outcome for. */
export function metrics(rows: Row[]): Metrics {
  const classes: Metrics["classes"] = {};
  for (const cls of CLASSES) {
    const mine = rows.filter((r) => r.class === cls);
    if (mine.length === 0) continue;
    const outcomes: Record<Outcome, number> = { proposal: 0, none: 0, refused: 0, unusable: 0, error: 0 };
    const failed: Partial<Record<CheckName, number>> = {};
    for (const r of mine) {
      outcomes[r.outcome]++;
      for (const [name, ok] of Object.entries(r.checks ?? {})) if (!ok) failed[name as CheckName] = (failed[name as CheckName] ?? 0) + 1;
    }
    classes[cls] = { ...stats(mine), outcomes, failed };
  }
  const proposals = rows.filter((r) => r.outcome === "proposal");
  return {
    defects: stats(rows.filter((r) => isDefect(r.class))),
    controls: stats(rows.filter((r) => !isDefect(r.class))),
    classes,
    proposals: { n: proposals.length, touched_body: proposals.filter((r) => r.checks?.body_kept === false).length },
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
