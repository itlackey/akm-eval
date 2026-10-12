// The scorer of the bakeoff eval: what akm wrote for a case (a derived memory, an enriched memory, a repair proposal, a session asset, the
// promotions consolidate queued) is checked against what the case expects, with no judge model and no akm. It is the SCORER part of the
// eval's measurement (see measurement.ts and lib/manifest.ts): a change to this file changes what the eval scores. Bump the scorer in
// MEASUREMENT.lock (scripts/measurement/run bump bakeoff scorer --reason "...") in the same change, and write the golden files again.
//
// The checks are those of the Python bakeoff this eval replaced, ported where they still apply: the same terms are looked for the same way.
// What changed is what they are looked for in. They read the file or the proposal akm made, not a model's reply to a prompt of our own.

export const PROCESSES = ["memory-inference", "remember-enrich", "schema-repair", "session-summary", "consolidate-promote"] as const;
export type Process = (typeof PROCESSES)[number];

/** What a case expects. Which keys it uses depends on its process (see README.md, "The checks"). */
export interface Expected {
  /** Terms the output must keep (memory-inference, session-summary). */
  required?: string[];
  /** Terms the output must not hold (memory-inference, session-summary). */
  forbidden?: string[];
  /** A date a derived memory must keep (memory-inference). */
  date?: string;
  /** The date an enriched memory must carry, or null when the memory writes none (remember-enrich). */
  observed_at?: string | null;
  /** Terms the metadata must cover (remember-enrich, schema-repair). Any one is enough for schema-repair. */
  keywords?: string[];
  /** Terms a trigger sentence must hold, any one (schema-repair). */
  trigger?: string[];
  /** Terms the key topics of a session summary must hold (session-summary). */
  topics?: string[];
  /** The refs of the memories consolidate must promote (consolidate-promote). */
  promote?: string[];
  /** The refs of the memories consolidate must leave alone (consolidate-promote). */
  protected?: string[];
  /** consolidate must promote exactly `promote` and nothing else (consolidate-promote). */
  strict?: boolean;
}

export interface Case {
  id: string;
  process: Process;
  /** The files the case reads, from the corpus folder: memories, lessons, a session. */
  files: string[];
  expected: Expected;
}

/** The ref akm gives a file: its path without `.md`, and without `/SKILL` for a skill. */
export const refOf = (path: string): string => path.replace(/\.md$/, "").replace(/\/SKILL$/, "");

// --- Reading what akm wrote --------------------------------------------------------------------------------------

export interface Document {
  data: Record<string, unknown>;
  body: string;
}

/** A markdown file as akm writes it: a frontmatter block between two `---` lines, then the body. Undefined without a block. Where the block is not YAML, its `key: value` lines are read as they stand. */
export function parseDocument(text: string | undefined): Document | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text ?? "");
  if (!m) return undefined;
  let data: unknown;
  try {
    data = Bun.YAML.parse(m[1] as string);
  } catch {
    data = undefined;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    data = Object.fromEntries((m[1] as string).split("\n").flatMap((line) => (line.includes(":") ? [[line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()]] : [])));
  }
  return { data: data as Record<string, unknown>, body: (m[2] as string).trim() };
}

const text = (x: unknown): string => (typeof x === "string" ? x.trim() : "");
const strings = (x: unknown): string[] | undefined => (Array.isArray(x) && x.every((s) => typeof s === "string") ? (x as string[]).map((s) => s.trim()) : undefined);
const nonEmpty = (xs: string[]): boolean => xs.every((s) => s !== "");

const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Text as the checks compare it: one space between words, in lower case. A value that is not text is its JSON, with the same spacing in each string of it. */
export const normalize = (value: unknown): string => squash(typeof value === "string" ? value : JSON.stringify(value ?? "", (_key, v) => (typeof v === "string" ? squash(v) : v))).toLowerCase();

/** Does the value hold the term? A term that ends in y also matches y, ies, ied and ying ("retry" finds "retries"), so an inflection costs nothing. */
export function containsTerm(value: unknown, term: string): boolean {
  const haystack = normalize(value);
  const expected = normalize(term);
  if (haystack.includes(expected)) return true;
  if (!expected.includes(" ") && expected.endsWith("y")) return new RegExp(`\\b${expected.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:y|ies|ied|ying)\\b`).test(haystack);
  return false;
}

// --- The checks of each process ----------------------------------------------------------------------------------

export type Checks = Record<string, boolean>;

/** The shape of the output, and the checks. A case with no output is not well formed and holds none of what it expects, and its checks say so. */
interface Scored {
  structure: boolean;
  checks: Checks;
}

/** memory-inference: the derived memory akm writes next to the memory (memories/<name>.derived.md). */
function scoreInference(c: Case, derived: string | undefined): Scored {
  const doc = parseDocument(derived);
  const title = text(doc?.data.title);
  const description = text(doc?.data.description);
  const tags = strings(doc?.data.tags);
  const searchHints = strings(doc?.data.searchHints);
  // akm writes the body as `# <title>` and the content after it.
  const content = (doc?.body ?? "").replace(/^#[^\n]*\n*/, "").trim();
  const structure = !!doc && title !== "" && description !== "" && content !== "" && !!tags && tags.length >= 3 && tags.length <= 8 && nonEmpty(tags) && !!searchHints && searchHints.length >= 3 && searchHints.length <= 6 && nonEmpty(searchHints);
  const output = normalize({ title, description, tags: tags ?? [], searchHints: searchHints ?? [], content });
  const checks: Checks = {};
  for (const term of c.expected.required ?? []) checks[`retains ${term}`] = !!doc && containsTerm(output, term);
  if (c.expected.date) checks["retains explicit date"] = !!doc && output.includes(c.expected.date.toLowerCase());
  for (const term of c.expected.forbidden ?? []) checks[`does not invent ${term}`] = !doc || !output.includes(normalize(term));
  return { structure, checks };
}

/** remember-enrich: the memory `akm remember --enrich` wrote, with the tags, the description and the date the model gave. */
function scoreEnrich(c: Case, written: string | undefined): Scored {
  const doc = parseDocument(written);
  const tags = strings(doc?.data.tags);
  const description = text(doc?.data.description);
  const given = doc?.data.observed_at;
  const structure = !!doc && !!tags && tags.length >= 1 && tags.length <= 5 && tags.every((t) => t !== "" && t === t.toLowerCase()) && description !== "";
  const output = normalize({ tags: tags ?? [], description, observed_at: given ?? null });
  const checks: Checks = {};
  // The prompt asks for a date only when the memory writes one, so no date is absent, null or empty.
  if (c.expected.observed_at) checks["preserves explicit date"] = !!doc && given === c.expected.observed_at;
  else checks["does not invent an observation date"] = !!doc && (given === undefined || given === null || (typeof given === "string" && given.trim() === ""));
  for (const term of c.expected.keywords ?? []) checks[`metadata covers ${term}`] = !!doc && containsTerm(output, term);
  return { structure, checks };
}

/** schema-repair: the lesson akm queued with the description and the when_to_use the model gave. */
function scoreRepair(c: Case, proposal: string | undefined): Scored {
  const doc = parseDocument(proposal);
  const description = text(doc?.data.description);
  const whenToUse = text(doc?.data.when_to_use);
  const structure = !!doc && description.length >= 20 && whenToUse.length >= 15;
  const output = normalize({ description, when_to_use: whenToUse });
  const checks: Checks = { "generated fields are grounded in the body": !!doc && (c.expected.keywords ?? []).some((term) => containsTerm(output, term)) };
  checks["trigger is concrete"] = !!doc && (c.expected.trigger ?? []).some((term) => containsTerm(whenToUse, term));
  return { structure, checks };
}

/** The `- topic` lines under `## Key topics` of a session asset. akm writes `- (none extracted)` for none. */
function keyTopics(body: string): string[] {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## Key topics");
  if (start < 0) return [];
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .flatMap((line) => (/^-\s+\S/.test(line) ? [line.replace(/^-\s+/, "").trim()] : []))
    .filter((t) => t !== "(none extracted)");
}

/** session-summary: the session asset `akm proposal extract` wrote: the summary is its description, the topics are its `## Key topics` list. */
function scoreSummary(c: Case, asset: string | undefined): Scored {
  const doc = parseDocument(asset);
  const summary = text(doc?.data.description);
  const topics = doc ? keyTopics(doc.body) : [];
  const tags = strings(doc?.data.tags) ?? [];
  const structure = !!doc && summary.length >= 80 && nonEmpty(topics) && nonEmpty(tags);
  const output = normalize({ summary, key_topics: topics, tags });
  const topicText = normalize(topics);
  const checks: Checks = {};
  for (const term of c.expected.required ?? []) checks[`summary retains ${term}`] = !!doc && containsTerm(output, term);
  for (const term of c.expected.topics ?? []) checks[`topics include ${term}`] = !!doc && containsTerm(topicText, term);
  for (const term of c.expected.forbidden ?? []) checks[`summary omits ${term}`] = !doc || !output.includes(normalize(term));
  return { structure, checks };
}

/**
 * consolidate-promote: the memories the model's plan promotes, as akm accepted the plan (`consolidation.planned` of the improve result). The
 * checks read the plan and not the queue, because akm drops some promotions of its own before it queues them, a hot memory among them, and
 * that would hide the model's choice.
 */
function scorePromote(c: Case, planned: string[] | undefined): Scored {
  const chosen = planned ?? [];
  const pool = new Set(c.files.map(refOf));
  const checks: Checks = {};
  for (const ref of c.expected.promote ?? []) checks[`promotes ${ref}`] = chosen.includes(ref);
  for (const ref of c.expected.protected ?? []) checks[`leaves protected ${ref} untouched`] = !chosen.includes(ref);
  if (c.expected.strict) {
    const expected = new Set(c.expected.promote ?? []);
    checks["no extra or missing promotions"] = chosen.length === expected.size && chosen.every((ref) => expected.has(ref));
  }
  checks["promotes only memories of the pool"] = chosen.every((ref) => pool.has(ref));
  return { structure: planned !== undefined, checks };
}

// --- Rows and metrics --------------------------------------------------------------------------------------------

/** What akm gave back for the case: `output` is what the process makes (a file, a proposal, promotions), `unusable` is a case akm ran for and got nothing it could use from the model's reply, `error` is a case that did not run to the end. */
export type Outcome = "output" | "unusable" | "error";
export const OUTCOMES: readonly Outcome[] = ["output", "unusable", "error"];

/**
 * The raw output of one case: what the collector got back from akm, and nothing the scorer decides. The fields are the ones a row stores
 * under the same names (`timedOut` is `timed_out`), so a stored row holds everything `makeRow` reads and scripts/rescore can score it again.
 * Which of the five outputs a case has depends on its process.
 */
export interface Raw {
  outcome: Outcome;
  /** Why there is no output, as akm says it, with the model endpoint written as <MODEL_BASE_URL>. */
  reason?: string;
  /** The model that answered, as the response names it. */
  served?: string;
  seconds: number;
  /** memory-inference: the derived memory, memories/<name>.derived.md, as akm wrote it. */
  derived?: string;
  /** remember-enrich: the memory file `akm remember --enrich` wrote. */
  written?: string;
  /** schema-repair: the content of the proposal akm queued, the lesson with its two fields repaired. */
  proposal?: string;
  /** session-summary: the session asset akm wrote, without the sandbox's paths (`log_path`, `access`). */
  asset?: string;
  /** consolidate-promote: the refs of the memories the model's plan promotes, as akm accepted the plan. */
  planned?: string[];
  /** consolidate-promote: the refs of the memories akm queued a promotion for, after its own checks. Recorded, not scored. */
  promoted?: string[];
  /** consolidate-promote: why akm did not queue a promotion of the plan, by ref, as it says it (`promote_source_too_small`). Recorded, not scored. */
  skipped?: Record<string, string>;
  /** The message of an error: the case ended without an answer. */
  error?: string;
  /** The error was akm running past its timeout. */
  timedOut?: boolean;
}

export interface Row extends Omit<Raw, "outcome" | "timedOut" | "error"> {
  id: string;
  process: Process;
  outcome: Outcome;
  /** The output has the shape the process asks for. Null for an error. */
  structure: boolean | null;
  /** The shape is right and every check holds. Null for an error. */
  correct: boolean | null;
  checks: Checks | null;
  reason: string;
  error?: string;
  /** The error was a timeout: akm ran past its timeout and was killed. Absent on every other row. */
  timed_out?: true;
}

const OUTPUT_FIELD: Record<Process, keyof Raw> = {
  "memory-inference": "derived",
  "remember-enrich": "written",
  "schema-repair": "proposal",
  "session-summary": "asset",
  "consolidate-promote": "planned",
};

function score(c: Case, run: Raw): Scored {
  const output = run.outcome === "output" ? run[OUTPUT_FIELD[c.process]] : undefined;
  switch (c.process) {
    case "memory-inference":
      return scoreInference(c, output as string | undefined);
    case "remember-enrich":
      return scoreEnrich(c, output as string | undefined);
    case "schema-repair":
      return scoreRepair(c, output as string | undefined);
    case "session-summary":
      return scoreSummary(c, output as string | undefined);
    case "consolidate-promote":
      return scorePromote(c, output as string[] | undefined);
  }
}

/** A row for a case. An error has no verdict. A reply akm could not use is never correct. */
export function makeRow(c: Case, run: Raw): Row {
  // An error left no response, so nothing answered: the name akm reports then is only the one it asked for.
  const base = { id: c.id, process: c.process, outcome: run.outcome, reason: run.reason ?? "", ...(run.served && run.outcome !== "error" ? { served: run.served } : {}), seconds: run.seconds };
  if (run.outcome === "error") return { ...base, structure: null, correct: null, checks: null, error: run.error ?? run.reason, ...(run.timedOut ? { timed_out: true as const } : {}) };
  const { structure, checks } = score(c, run);
  const kept = Object.fromEntries((["derived", "written", "proposal", "asset", "planned", "promoted", "skipped"] as const).filter((k) => run[k] !== undefined).map((k) => [k, run[k]]));
  return { ...base, ...kept, structure, correct: structure && Object.values(checks).every(Boolean), checks };
}

export interface Rate {
  n: number;
  passed: number;
  rate: number | null;
}

export interface ProcessMetrics {
  /** The cases that ran to the end, with the output akm made or without it. */
  n: number;
  valid_output: number;
  passed: number;
  /** The mean over the cases of the share of their checks that held. A case without the right shape earns none. */
  checks: number | null;
  outcomes: Record<Outcome, number>;
  /** For each check, how many cases failed it. */
  failed: Record<string, number>;
}

export interface Metrics {
  /** Cases with output of the right shape, of the cases that ran to the end. */
  valid_output: Rate;
  /** Cases whose shape is right and whose every check holds. */
  case_pass: Rate;
  /** The mean share of checks that held. A case without the right shape earns none. */
  checks: { n: number; rate: number | null };
  median_seconds: number | null;
  by_process: Partial<Record<Process, ProcessMetrics>>;
}

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

/** The share of a case's checks that held. A case with the wrong shape earns none, however many checks pass by saying nothing. */
function share(row: Row): number {
  const checks = Object.values(row.checks ?? {});
  return row.structure && checks.length > 0 ? checks.filter(Boolean).length / checks.length : 0;
}

const meanShare = (rows: Row[]): number | null => ratio(rows.reduce((sum, r) => sum + share(r), 0), rows.length);

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return Number((sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2).toFixed(1));
};

/** The metrics over the cases that ran to the end. A case that errored is left out: it says nothing about the model. */
export function metrics(rows: Row[]): Metrics {
  const scored = rows.filter((r) => r.outcome !== "error");
  const valid = scored.filter((r) => r.structure).length;
  const passed = scored.filter((r) => r.correct).length;
  const by_process: Metrics["by_process"] = {};
  for (const process of PROCESSES) {
    const mine = rows.filter((r) => r.process === process);
    if (mine.length === 0) continue;
    const outcomes: Record<Outcome, number> = { output: 0, unusable: 0, error: 0 };
    const failed: Record<string, number> = {};
    for (const r of mine) {
      outcomes[r.outcome]++;
      for (const [name, ok] of Object.entries(r.checks ?? {})) if (!ok) failed[name] = (failed[name] ?? 0) + 1;
    }
    const ran = mine.filter((r) => r.outcome !== "error");
    by_process[process] = { n: ran.length, valid_output: ran.filter((r) => r.structure).length, passed: ran.filter((r) => r.correct).length, checks: meanShare(ran), outcomes, failed };
  }
  return {
    valid_output: { n: scored.length, passed: valid, rate: ratio(valid, scored.length) },
    case_pass: { n: scored.length, passed, rate: ratio(passed, scored.length) },
    checks: { n: scored.length, rate: meanShare(scored) },
    median_seconds: median(scored.map((r) => r.seconds)),
    by_process,
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

// --- Scoring a stored row again -----------------------------------------------------------------------------------

/**
 * The raw output of a stored row: the fields of the row that `makeRow` reads, or the names of those the row lacks. A run whose rows lack
 * one cannot be scored again (scripts/rescore refuses it and names them).
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (!OUTCOMES.includes(row.outcome)) missing.push("outcome");
  if (typeof row.seconds !== "number") missing.push("seconds");
  if (row.outcome !== "error" && typeof row.reason !== "string") missing.push("reason");
  if (row.outcome === "error" && typeof row.error !== "string") missing.push("error");
  // The row of a stored run says its process, so the field it lacks is named. A raw output on its own (a golden file) does not: any of the five will do.
  const fields = OUTPUT_FIELD[row.process as Process] ? [OUTPUT_FIELD[row.process as Process]] : Object.values(OUTPUT_FIELD);
  const has = (f: keyof Raw): boolean => (f === "planned" ? Array.isArray(row.planned) : typeof row[f] === "string");
  if (row.outcome === "output" && !fields.some(has)) missing.push(fields.length === 1 ? String(fields[0]) : `the output (${fields.slice(0, -1).join(", ")} or ${fields[fields.length - 1]})`);
  if (missing.length > 0) return { missing };
  const { derived, written, proposal, asset, promoted, planned, skipped } = row;
  return { raw: { outcome: row.outcome, reason: row.reason ?? "", served: row.served, seconds: row.seconds, derived, written, proposal, asset, planned, promoted, skipped, error: row.error, timedOut: row.timed_out === true } };
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
