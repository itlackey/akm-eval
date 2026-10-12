// The scorer of the reflect eval: the checks that turn what reflect proposed for a note into a verdict, and the verdicts into metrics. It
// is the SCORER part of the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs no akm. The
// collector (collect.ts) builds each row by calling `makeRow` with the raw output it got, and scripts/rescore calls the same function with
// the raw output it reads back from a stored row, so a fix to a check scores every stored run again.
//
// A change to this file changes what the eval scores. It is a measurement change: bump the scorer in MEASUREMENT.lock
// (scripts/measurement/run bump reflect scorer --reason "...") and update the golden files (golden/) in the same change.

// The checks read frontmatter with bun's own YAML parser. Without it every result would look like broken YAML.
if (typeof Bun.YAML?.parse !== "function") throw new Error("reflect: this eval needs a bun that has Bun.YAML. Upgrade it with `bun upgrade`. See https://bun.sh");

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
export const HANGING = new Set(
  "a after an and are as at be been before being but by can could did do does for from had has have if in into is may might must of on onto or per shall should so than that the to upon via was were when which while will with would".split(" "),
);

export const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

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

// --- Scoring -----------------------------------------------------------------------------------------------------

export interface Note {
  body: string;
  /** The frontmatter as YAML reads it, or undefined when it does not parse. */
  data: Record<string, unknown> | undefined;
}

export function parse(note: string): Note {
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
export function addedTitle(before: string, after: string): string | undefined {
  const m = after.match(/^\n# (\S[^\n]*)\n\n/);
  return m && after.slice(m[0].length) === before.replace(/^(\r?\n)+/, "") ? m[1] : undefined;
}

/** The words of a value that name something: a digit, two capitals, a path or a dotted name. Spaces, hyphens and dashes of every kind split words. */
function specifics(value: string): string[] {
  return value
    .split(/[\s\u2010-\u2015\u2212-]+/)
    .map((t) => t.replace(/^[^\w`]+|[^\w`]+$/g, "").replace(/`/g, ""))
    .filter((t) => t !== "" && /\d|[A-Z].*[A-Z]|[a-z][/_.][a-z]/.test(t));
}

/** The specific words of a changed value that the note does not hold. */
const ungrounded = (value: string, note: string): string[] => specifics(value).filter((t) => !note.toLowerCase().includes(t.toLowerCase()));

/** Does `after` still hold every name, number and path `before` had, however they are spelled or joined? Other words may change. */
function keepsNames(before: string, after: string): boolean {
  const kept = new Set(wordsOf(after));
  return specifics(before).every((t) => wordsOf(t).every((w) => kept.has(w)));
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
      return ok && keepsNames(withoutTail(was), now);
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



// --- Rows and metrics --------------------------------------------------------------------------------------------

export type Outcome = "proposal" | "none" | "refused" | "unusable" | "error";

/** What refused an edit: akm's pre-judge defect filter, the quality judge, or the retrieval check that runs after the judge passes it. */
export type Refusal = "filter" | "judge" | "retrieval" | "other";

/** Which of the three refused an edit, from the reason akm gives. */
export function refusalOf(reason: string): Refusal {
  if (/refused before the judge/.test(reason)) return "filter";
  if (/quality gate rejected/.test(reason)) return "judge";
  if (/retrieval/.test(reason)) return "retrieval";
  return "other";
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
  /** The model that answered, as the response names it. */
  served?: string;
  /** What the note would be if the proposal were accepted, so a result can be scored again when the checks change. */
  proposal?: string;
  seconds: number;
  error?: string;
  /** The error was a timeout: akm ran past its timeout and was killed. Absent on every other row. */
  timed_out?: true;
}

/**
 * The raw output of one case: what the collector got back from akm and the model, and nothing the scorer decides. The fields are the ones a
 * row stores under the same names (`timedOut` is `timed_out`), so a stored row holds everything `makeRow` reads and scripts/rescore can
 * score it again (see `rawOf`). `outcome` is what reflect did, which the collector reads from akm's result because it decides what to fetch next.
 */
export interface Raw {
  outcome: Outcome;
  /** The proposal's note, when reflect made one (`akm proposal show`). */
  proposal?: string;
  /** Why reflect made no proposal, as akm says it, with the model endpoint written as <MODEL_BASE_URL>. */
  reason?: string;
  /** The model that answered, as the response names it. */
  served?: string;
  seconds: number;
  /** The message of an error: the case ended without an answer. */
  error?: string;
  /** The error was akm running past its timeout. */
  timedOut?: boolean;
}

/** A row for a case. An error has no verdict. A reply akm could not use, or an edit its own filter refused, is never correct. */
export function makeRow(c: Case, run: Raw): Row {
  // An error left no response, so nothing answered: the name akm reports then is only the one it asked for.
  const base = { id: c.id, class: c.class, outcome: run.outcome, reason: run.reason ?? "", ...(run.served && run.outcome !== "error" ? { served: run.served } : {}), seconds: run.seconds };
  if (run.outcome === "error") return { ...base, correct: null, checks: null, changed: [], values: {}, error: run.error ?? run.reason, ...(run.timedOut ? { timed_out: true as const } : {}) };
  const { checks, changed, values } = score(c, run.outcome === "proposal" ? run.proposal : undefined);
  const correct = (run.outcome === "proposal" || run.outcome === "none") && Object.values(checks).every(Boolean);
  return { ...base, correct, checks, changed, values, ...(run.outcome === "proposal" && run.proposal !== undefined ? { proposal: run.proposal } : {}) };
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
  /** The refused edits, by what refused them (see `refusalOf`). */
  refused: Record<Refusal, number>;
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
  const refused: Metrics["refused"] = { filter: 0, judge: 0, retrieval: 0, other: 0 };
  for (const r of rows) if (r.outcome === "refused") refused[refusalOf(r.reason)]++;
  return {
    defects: stats(rows.filter((r) => isDefect(r.class))),
    controls: stats(rows.filter((r) => !isDefect(r.class))),
    classes,
    proposals: { n: proposals.length, touched_body: proposals.filter((r) => r.checks?.body_kept === false).length },
    refused,
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

// --- Scoring a stored row again -----------------------------------------------------------------------------------

const OUTCOMES: readonly Outcome[] = ["proposal", "none", "refused", "unusable", "error"];

/**
 * The raw output of a stored row: the fields of the row that `makeRow` reads, or the names of those the row lacks. A run whose rows lack
 * one cannot be scored again (scripts/rescore refuses it and names them). Rows written before the manifest hold all of these.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (!OUTCOMES.includes(row.outcome)) missing.push("outcome");
  if (typeof row.seconds !== "number") missing.push("seconds");
  if (row.outcome !== "error" && typeof row.reason !== "string") missing.push("reason");
  if (row.outcome === "proposal" && typeof row.proposal !== "string") missing.push("proposal");
  if (row.outcome === "error" && typeof row.error !== "string") missing.push("error");
  if (missing.length > 0) return { missing };
  return { raw: { outcome: row.outcome, proposal: row.proposal, reason: row.reason ?? "", served: row.served, seconds: row.seconds, error: row.error, timedOut: row.timed_out === true } };
}

/** A case that ended in an error has no verdict. */
export const errored = (row: Row): boolean => row.outcome === "error";

/** The fields of the summary that come from the rows: how many ran, were scored and errored, the model names that answered, and the metrics. */
export function summarize(rows: Row[]): { n_run: number; n_scored: number; n_errored: number; timeouts: number; served: Record<string, number>; metrics: Metrics } {
  const failed = rows.filter(errored).length;
  return {
    n_run: rows.length,
    n_scored: rows.length - failed,
    n_errored: failed,
    timeouts: rows.filter((r) => r.timed_out).length,
    served: rows.reduce<Record<string, number>>((n, r) => (r.served ? { ...n, [r.served]: (n[r.served] ?? 0) + 1 } : n), {}),
    metrics: metrics(rows),
  };
}
