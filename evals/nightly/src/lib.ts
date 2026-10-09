// Pure helpers for the nightly eval: the planted items, which ones a run plants, the akm config, the night's proposals,
// the checks that score each item, and the metrics. build.ts makes the public night, run.ts runs it and generate.ts
// makes the private night. The checks of the consolidate, reflect and distill evals are used as they are.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { engineConfig } from "../../../lib/akm/akm.ts";
import { type Claim, EMBEDDER_ENV, type Relation, type Side, RELATIONS, claimProblems, noteAges } from "../../consolidate/src/lib.ts";
import { type Class as DistillClass, type Expect, checkLesson, lessonFile, lessonText, memoryBody } from "../../distill/src/lib.ts";
import { type Case as ReflectCase, type CaseClass, type Field, CLASSES, addedTitle, caseProblems, refOf, score as scoreReflect, splitFrontmatter } from "../../reflect/src/lib.ts";

export { EMBEDDER_ENV, noteAges };
export type { Claim, Relation, Side, Expect, Field };
export type { DistillClass, CaseClass };

/** The kinds of item, in the order a short run takes them: one of each kind first. */
export const KINDS = ["pair", "reflect", "distill", "fix", "untouched"] as const;
export type Kind = (typeof KINDS)[number];

/** Negative or positive feedback on one asset, as `akm feedback` records it. A fix carries an exact edit and where the correct fact comes from. */
export interface Feedback {
  ref: string;
  signal: "negative" | "positive";
  reason: string;
  fix?: { replace: string[]; with: string[]; source: string };
}

interface Base {
  id: string;
  kind: Kind;
  /** The canary string of the public night: do not train on it. */
  canary?: string;
  /** What the right outcome of the night is, in a sentence. */
  note: string;
  /** The library files the item owns, relative to the bundle. The night may change only these. */
  files: string[];
  /** The feedback recorded on the day before the night. */
  feedback: Feedback[];
}

/** Two memories whose right outcome is known by construction: `safe` are the sides that can be retired without losing a claim. */
export interface PairItem extends Base {
  kind: "pair";
  relation: Relation;
  older: Side | null;
  safe: Side[];
  claims: Claim[];
  a: string;
  b: string;
}

/** A note with a defect akm names, or a control, and the negative feedback on it: one case of the reflect eval. */
export interface ReflectItem extends Base {
  kind: "reflect";
  class: CaseClass;
  path: string;
  defect: string;
  correct: string;
  allow: Field[];
  fix?: Field;
  forbid?: string[];
  anchors?: string[];
}

/** A note that holds a wrong fact, with negative feedback that carries the exact fix. The night queues the fix and a person accepts it. */
export interface FixItem extends Base {
  kind: "fix";
  path: string;
}

/** A memory with positive feedback: one case of the distill eval, with the files that case holds. */
export interface DistillItem extends Base {
  kind: "distill";
  class: DistillClass;
  expect: Expect;
  memory: string;
  required: string[][];
  forbidden: string[][];
}

/** Notes that no process has a reason to touch. */
export interface UntouchedItem extends Base {
  kind: "untouched";
}

export type Item = PairItem | ReflectItem | FixItem | DistillItem | UntouchedItem;

/** The planted night: the items, and the text of every library file. */
export interface Night {
  items: Item[];
  files: Map<string, string>;
}

const isStringList = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");
const isPhraseGroups = (x: unknown): x is string[][] => Array.isArray(x) && x.every((g) => isStringList(g) && g.length > 0);

/** The items in `items.jsonl`, checked field by field. */
export function parseItems(text: string, where = "items"): Item[] {
  const items: Item[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${where}:${i + 1}`;
    let item: Item;
    try {
      item = JSON.parse(line) as Item;
    } catch {
      throw new Error(`${at} is not valid JSON`);
    }
    if (typeof item.id !== "string" || !/^[a-z0-9-]+$/.test(item.id)) throw new Error(`${at} needs an id of lower case letters, digits and dashes`);
    if (seen.has(item.id)) throw new Error(`${at} repeats the id ${item.id}`);
    seen.add(item.id);
    if (!KINDS.includes(item.kind)) throw new Error(`${at} has kind "${item.kind}", expected one of ${KINDS.join(", ")}`);
    if (typeof item.note !== "string" || !item.note) throw new Error(`${at} has no note`);
    if (!isStringList(item.files) || item.files.length === 0) throw new Error(`${at} has no files`);
    if (!Array.isArray(item.feedback)) throw new Error(`${at} has no feedback list`);
    for (const f of item.feedback) {
      if (typeof f?.ref !== "string" || !f.ref || (f.signal !== "negative" && f.signal !== "positive") || typeof f.reason !== "string" || !f.reason) throw new Error(`${at} has feedback that is not a ref, a signal and a reason`);
      if (f.fix && (!isStringList(f.fix.replace) || !isStringList(f.fix.with) || f.fix.replace.length === 0 || f.fix.replace.length !== f.fix.with.length || typeof f.fix.source !== "string" || !f.fix.source)) throw new Error(`${at} has a fix that is not matching replace and with lists and a source`);
      if (f.fix && f.signal !== "negative") throw new Error(`${at} has a fix on positive feedback`);
    }
    const inFiles = (path: unknown, what: string) => {
      if (typeof path !== "string" || !item.files.includes(path)) throw new Error(`${at} names ${what} ${String(path)}, which is not one of its files`);
    };
    if (item.kind === "pair") {
      if (!RELATIONS.includes(item.relation)) throw new Error(`${at} has relation "${item.relation}"`);
      if (item.older !== null && item.older !== "a" && item.older !== "b") throw new Error(`${at} has older "${item.older}", expected a, b or null`);
      if (!Array.isArray(item.safe) || !item.safe.every((s) => s === "a" || s === "b")) throw new Error(`${at} has a "safe" that is not a list of a and b`);
      if (!Array.isArray(item.claims) || !item.claims.every((k) => (k?.side === "a" || k?.side === "b" || k?.side === "both") && typeof k.text === "string" && k.text)) throw new Error(`${at} has a bad "claims" list`);
      inFiles(item.a, "note a");
      inFiles(item.b, "note b");
      if (item.a === item.b) throw new Error(`${at} gives both notes the path ${item.a}`);
    } else if (item.kind === "reflect") {
      if (!CLASSES.includes(item.class)) throw new Error(`${at} has class "${item.class}"`);
      if (!Array.isArray(item.allow)) throw new Error(`${at} has no "allow" list`);
      for (const key of ["defect", "correct"] as const) if (typeof item[key] !== "string" || !item[key]) throw new Error(`${at} has no "${key}"`);
      inFiles(item.path, "its note");
    } else if (item.kind === "fix") {
      inFiles(item.path, "its note");
      if (!item.feedback.some((f) => f.fix)) throw new Error(`${at} is a fix with no fix in its feedback`);
    } else if (item.kind === "distill") {
      if (item.expect !== "lesson" && item.expect !== "none") throw new Error(`${at} has expect "${item.expect}"`);
      if (!isPhraseGroups(item.required) || !isPhraseGroups(item.forbidden)) throw new Error(`${at} needs required and forbidden as lists of lists of phrases`);
      if ((item.expect === "lesson") !== (item.required.length > 0 && item.forbidden.length > 0)) throw new Error(`${at} expects ${item.expect}, so its required and forbidden do not fit`);
      inFiles(item.memory, "its memory");
    }
    items.push(item);
  });
  if (items.length === 0) throw new Error(`${where} has no items`);
  return items;
}

/** akm's own folder in a bundle. It holds what a retirement archives, and is not part of the library. */
export const AKM_FOLDER = ".akm";

/** Every file under `dir`, as paths relative to it, in order. akm's own folder is left out. */
export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .filter((p) => p !== AKM_FOLDER && !p.startsWith(`${AKM_FOLDER}/`) && statSync(join(dir, p)).isFile())
    .sort();
}

/** The night in `assets`: its items, and the library files they name. Every file belongs to one item, and every item's file is there. */
export function loadNight(assets: string): Night {
  const file = join(assets, "items.jsonl");
  const items = parseItems(readFileSync(file, "utf8"), file);
  const library = join(assets, "library");
  const files = new Map<string, string>();
  for (const path of listFiles(library)) files.set(path, readFileSync(join(library, path), "utf8"));
  const owner = new Map<string, string>();
  for (const item of items) {
    for (const path of item.files) {
      if (!files.has(path)) throw new Error(`${file}: ${item.id} names ${path}, which is not in ${library}`);
      if (owner.has(path)) throw new Error(`${file}: ${path} belongs to both ${owner.get(path)} and ${item.id}`);
      owner.set(path, item.id);
    }
    for (const f of item.feedback) if (!item.files.some((p) => refOf(p) === f.ref)) throw new Error(`${file}: ${item.id} has feedback on ${f.ref}, which is not one of its files`);
  }
  for (const path of files.keys()) if (!owner.has(path)) throw new Error(`${file}: ${path} is in ${library} and belongs to no item`);
  return { items, files };
}

/**
 * The items a run plants. Without a limit, all of them. With one, N items, taking the first of each kind in turn, in the order
 * of KINDS, so a short night holds as many kinds as it can. They come back in file order.
 */
export function selectItems(items: Item[], limit?: number): Item[] {
  if (limit === undefined || limit >= items.length) return items;
  const queues = KINDS.map((k) => items.filter((i) => i.kind === k)).filter((q) => q.length > 0);
  const picked = new Set<Item>();
  for (let round = 0; picked.size < limit; round++) {
    for (const q of queues) if (picked.size < limit && q[round]) picked.add(q[round] as Item);
  }
  return items.filter((i) => picked.has(i));
}

// --- What the night runs ---------------------------------------------------------------------------------------------

/** The akm config of a night: one LLM engine, the model under test, for every process, and semantic search on, which the pair pass needs. The strategy is akm's own `default`. */
export function nightlyConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "nightly");
  config.semanticSearchMode = "auto";
  return config;
}

/** The text of each file under `dir`, by path. */
export function readLibrary(dir: string): Map<string, string> {
  return new Map(listFiles(dir).map((p) => [p, readFileSync(join(dir, p), "utf8")]));
}

/** The files that changed, appeared or vanished between two readings of the library, and that no item owns. */
export function outsideChanges(before: Map<string, string>, after: Map<string, string>, items: Item[]): string[] {
  const owned = new Set(items.flatMap((i) => i.files));
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((p) => !owned.has(p) && before.get(p) !== after.get(p)).sort();
}

// --- What akm says -----------------------------------------------------------------------------------------------

export interface Proposal {
  id: string;
  /** The ref without its bundle: `bundle//lessons/x` is `lessons/x`. */
  ref: string;
  /** The queue's state: pending, accepted, rejected or reverted. */
  status: string;
  /** What generated it: consolidate-pair, consolidate, reflect, distill or feedback. */
  source: string;
  /** The gate's decision, such as `staged/quality-gate` or `deferred/distill-review`. */
  gate: string | null;
  /** The judge's reason, when the gate kept one. */
  judgeReason: string | null;
  /** A retire proposal: the note it retires, the note that stays, and the pair judge's label. */
  retirement: { retired: string; successor: string; label: string; reason: string } | null;
  content: string;
}

const conceptId = (ref: string): string => (ref.includes("//") ? ref.slice(ref.indexOf("//") + 2) : ref);

/** The proposals in the lists `akm proposal list --status <state> --detail full` printed for each state. */
export function parseProposals(listed: { status: string; proposals?: unknown[] }[]): Proposal[] {
  const found: Proposal[] = [];
  for (const { status, proposals } of listed) {
    for (const p of (proposals ?? []) as Record<string, any>[]) {
      if (typeof p?.id !== "string" || typeof p.ref !== "string" || typeof p.source !== "string") continue;
      const g = p.gateDecision;
      const r = p.retirement;
      found.push({
        id: p.id,
        ref: conceptId(p.ref),
        status,
        source: p.source,
        gate: g ? `${g.outcome}/${g.reason}` : null,
        judgeReason: typeof g?.judgeReason === "string" ? g.judgeReason : null,
        retirement: typeof r?.retiredRef === "string" ? { retired: conceptId(r.retiredRef), successor: conceptId(String(r.successorRef ?? "")), label: String(r.judgeLabel ?? ""), reason: String(r.judgeReason ?? "") } : null,
        content: typeof p.payload?.content === "string" ? p.payload.content : "",
      });
    }
  }
  return found;
}

interface Action {
  ref: string;
  mode: string;
  result?: Record<string, any>;
}

/**
 * The action `akm improve` reports for a ref and a process (`reflect` or `distill`), or undefined when the night did not get to it.
 * An `error` action is akm's report that a ref's turn failed or that the run's budget ran out at it, and counts for either process.
 */
export function actionFor(improve: unknown, ref: string, process: "reflect" | "distill"): Action | undefined {
  const actions = ((improve ?? {}) as { actions?: Action[] }).actions ?? [];
  return actions.find((a) => conceptId(a.ref) === ref && (a.mode.startsWith(process) || a.mode === "error"));
}

/** What a reflect or distill action says in a few words, and its error when the model failed. */
export function describeAction(action: Action | undefined): { state: string; error?: string } {
  if (!action) return { state: "not reached" };
  const r = action.result ?? {};
  const why = (s: unknown) => (typeof s === "string" && s ? `: ${s.replace(/\s+/g, " ").slice(0, 120)}` : "");
  if (action.mode === "reflect") return { state: "proposed" };
  if (action.mode === "reflect-skipped") return { state: r.reason === "no_change" ? "no change" : `skipped${why(r.reason)}` };
  if (action.mode === "reflect-guard-rejected") return { state: `refused${why(r.reason)}` };
  if (action.mode === "reflect-failed") return r.reason === "quality_rejected" ? { state: `rejected by the judge${why(r.error)}` } : { state: "failed", error: `${r.reason ?? "error"}${why(r.error)}` };
  if (action.mode === "error") return { state: "failed", error: String(r.error ?? "error").slice(0, 160) };
  if (action.mode !== "distill") return { state: action.mode };
  switch (r.outcome) {
    case "queued":
      return { state: "lesson queued" };
    case "review_needed":
      return { state: `lesson queued for review${why(r.reason)}` };
    case "quality_rejected":
      return { state: `rejected by the judge${why(r.reason)}` };
    case "skipped":
      return { state: `skipped${why(r.skipReason ?? r.message)}` };
    case "validation_failed":
      return { state: `invalid lesson${why(r.error)}` };
    case "llm_failed":
      return { state: "failed", error: "the model call failed" };
    default:
      return { state: String(r.outcome ?? "unknown") };
  }
}

export interface CallRow {
  process: string;
  /** The model name the endpoint reported. A call that got no answer is filed under the name that was asked for. */
  model: string;
  calls: number;
  failures: number;
  prompt_tokens: number;
  completion_tokens: number;
}

/** The night's model calls from akm's usage report: how many, how many failed, and the rows by process and model. */
export function callStats(improve: unknown): { calls: number; failures: number; by: CallRow[] } {
  const rows = (improve as { usageReport?: { byProcessEngineModel?: Record<string, unknown>[] } } | null)?.usageReport?.byProcessEngineModel;
  const by: CallRow[] = [];
  for (const r of Array.isArray(rows) ? rows : []) by.push({ process: String(r.process), model: String(r.model), calls: Number(r.calls ?? 0), failures: Number(r.failures ?? 0), prompt_tokens: Number(r.promptTokens ?? 0), completion_tokens: Number(r.completionTokens ?? 0) });
  return { calls: by.reduce((n, r) => n + r.calls, 0), failures: by.reduce((n, r) => n + r.failures, 0), by };
}

// --- Scoring ---------------------------------------------------------------------------------------------------

export interface Row {
  id: string;
  kind: Kind;
  /** The relation, reflect class or distill class: what sort of item it is. */
  class: string;
  /** Every check passed. */
  ok: boolean;
  /** A check failed that guards the library: an unsafe retirement, an edit that went beyond the fix, a note that changed. */
  harm: boolean;
  checks: Record<string, boolean>;
  /** What the night did to the item, in a few words. */
  state: string;
  /** Facts behind the checks, so a result can be read, and scored again when the checks change. */
  detail: Record<string, unknown>;
  /** akm reports an error for this item: a model call failed, or the run's budget ran out at it. */
  error?: string;
}

/** The night as the checks see it: the text of the library files before and after, the proposals in every state and akm's result of the improve run. */
export interface Outcome {
  before: Map<string, string>;
  after: Map<string, string>;
  proposals: Proposal[];
  improve: unknown;
}

/** The checks that guard the library. Any of them failing is harm, not a miss. */
const GUARDS = new Set(["no_unsafe_retirement", "note_kept", "survivors_unchanged", "body_kept", "no_extra_change", "no_invented", "unchanged", "memory_kept", "lesson_not_accepted"]);

function row(item: Item, cls: string, scored: Record<string, boolean>, state: string, detail: Record<string, unknown>, error?: string): Row {
  // An item akm reports an error for, such as a failed model call, was not decided at all, so it is not right, whatever the checks say.
  const checks = error ? { ...scored, no_error: false } : scored;
  const failed = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
  return { id: item.id, kind: item.kind, class: cls, ok: failed.length === 0, harm: failed.some((n) => GUARDS.has(n)), checks, state, detail, ...(error ? { error } : {}) };
}

const unchanged = (o: Outcome, path: string): boolean => o.before.get(path) === o.after.get(path);

/** A reference note the night left with its body: the frontmatter may gain fields (the proactive lane's reflect fills and stamps it), and a `# title` heading may be added at the top of a body that had none. */
const bodyKept = (o: Outcome, path: string): boolean => {
  const [before, after] = [o.before.get(path), o.after.get(path)];
  if (before === undefined || after === undefined) return false;
  const [x, y] = [splitFrontmatter(before).body, splitFrontmatter(after).body];
  return x === y || addedTitle(x, y) !== undefined;
};

/** The frontmatter keys akm adds or stamps itself when it queues or accepts a proposal. They are neither a fix nor a change. */
const AKM_KEYS = ["type", "updated", "generated", "verified"];

/** Do two notes say the same, whatever akm stamps on a proposal? Same body, same frontmatter apart from the keys akm adds. */
export function sameNote(a: string, b: string): boolean {
  const read = (note: string) => {
    const { fm, body } = splitFrontmatter(note);
    let data: Record<string, unknown> = {};
    try {
      data = (fm === null ? {} : (Bun.YAML.parse(fm) as Record<string, unknown> | null)) ?? {};
    } catch {
      data = { unreadable: fm };
    }
    for (const key of AKM_KEYS) delete data[key];
    return { body, data: JSON.stringify(Object.entries(data).sort(([x], [y]) => (x < y ? -1 : 1))) };
  };
  const [x, y] = [read(a), read(b)];
  return x.body === y.body && x.data === y.data;
}

/** The text with each `--replace` swapped for its `--with`, in order, each applied once. akm's own rule is that a `--replace` text appears exactly once. */
export function applyFix(text: string, fix: NonNullable<Feedback["fix"]>): string {
  return fix.replace.reduce((out, old, i) => {
    const at = out.indexOf(old);
    return at < 0 ? out : out.slice(0, at) + (fix.with[i] as string) + out.slice(at + old.length);
  }, text);
}

/** A pair: no side that holds a claim the other lacks is retired, proposed or not, and what is retired fits the relation. */
function scorePair(item: PairItem, o: Outcome): Row {
  const [nameA, nameB] = [refOf(item.a), refOf(item.b)];
  const sideOf = (ref: string): Side | undefined => (ref === nameA ? "a" : ref === nameB ? "b" : undefined);
  const retires = o.proposals.filter((p) => p.source === "consolidate-pair" && p.retirement && sideOf(p.retirement.retired));
  const proposed = [...new Set(retires.map((p) => sideOf((p.retirement as { retired: string }).retired) as Side))].sort();
  const gone = (["a", "b"] as const).filter((s) => !o.after.has(item[s]));
  const survivors = (["a", "b"] as const).filter((s) => o.after.has(item[s]));
  const unsafe = (s: Side) => !item.safe.includes(s);
  const right =
    item.relation === "duplicate" ? gone.length === 1 // a staged duplicate is retired by the drain: one note goes, the other stays
    : item.relation === "subsumed" || item.relation === "supersedes" ? proposed.some((s) => item.safe.includes(s)) // it waits for a person
    : proposed.length === 0 && gone.length === 0; // contradicts, overlap, unrelated: both notes stay, and nothing is proposed
  const accepted = retires.some((p) => p.status === "accepted");
  const checks = {
    no_unsafe_retirement: !gone.some(unsafe),
    note_kept: survivors.length > 0, // a pair never loses both notes: a duplicate keeps one
    no_unsafe_proposal: !proposed.some(unsafe),
    survivors_unchanged: survivors.every((s) => unchanged(o, item[s])),
    right_outcome: right,
  };
  const label = retires[0]?.retirement?.label ?? null;
  const state = gone.length > 0 ? `retired ${gone.join(", ")}` : proposed.length > 0 ? `retirement of ${proposed.join(", ")} proposed, waiting` : "both notes kept";
  return row(item, item.relation, checks, state, { judged_as: label, proposed, gone, accepted, gate: retires[0]?.gate ?? null, reason: retires[0]?.retirement?.reason || null });
}

/** The reflect case this item is: the note as planted, and what a correct result is. */
export function reflectCase(item: ReflectItem, source: string): ReflectCase {
  return { id: item.id, class: item.class, path: item.path, source, feedback: item.feedback[0]?.reason ?? "", defect: item.defect, correct: item.correct, allow: item.allow, ...(item.fix ? { fix: item.fix } : {}), ...(item.forbid ? { forbid: item.forbid } : {}), ...(item.anchors ? { anchors: item.anchors } : {}) };
}

/** A reflect item: the note as the night left it passes the reflect eval's checks. */
function scoreReflectItem(item: ReflectItem, o: Outcome): Row {
  const source = o.before.get(item.path) as string;
  const final = o.after.get(item.path) ?? "";
  const { checks, changed, values } = scoreReflect(reflectCase(item, source), final);
  const mine = o.proposals.filter((p) => p.source === "reflect" && p.ref === refOf(item.path));
  const proposal = mine.at(-1);
  const action = describeAction(actionFor(o.improve, refOf(item.path), "reflect"));
  const state = final !== source ? `edited by the drain (${changed.join(", ") || "frontmatter"})` : proposal ? `proposal ${proposal.status}${proposal.gate ? `, ${proposal.gate}` : ""}` : action.state;
  return row(item, item.class, checks, state, { changed, values, proposal: proposal?.status ?? null, gate: proposal?.gate ?? null, judge: proposal?.judgeReason ?? null, action: action.state, final: final !== source ? final : null }, action.error);
}

/** The exact fix: queued as a proposal that makes the note as the feedback says, and still waiting. The night changes nothing else, and nothing in the note itself. */
function scoreFix(item: FixItem, o: Outcome): Row {
  const source = o.before.get(item.path) as string;
  const fix = item.feedback.find((f) => f.fix)?.fix as NonNullable<Feedback["fix"]>;
  const expected = applyFix(source, fix);
  const ref = refOf(item.path);
  const queued = o.proposals.filter((p) => p.source === "feedback" && p.ref === ref);
  const reflectOnIt = o.proposals.filter((p) => p.source === "reflect" && p.ref === ref).at(-1);
  const action = describeAction(actionFor(o.improve, ref, "reflect"));
  const control: ReflectCase = { id: item.id, class: "retrieval-miss", path: item.path, source, feedback: item.feedback[0]?.reason ?? "", defect: "", correct: "", allow: [] };
  const { checks: kept } = scoreReflect(control, o.after.get(item.path) ?? "");
  const checks = { fix_queued: queued.some((p) => sameNote(p.content, expected)), fix_waits: queued.length > 0 && queued.every((p) => p.status === "pending"), ...kept };
  const state = queued.length === 0 ? "no fix queued" : `fix ${queued.map((p) => p.status).join(", ")}`;
  return row(item, "exact-fix", checks, state, { fix: queued.map((p) => p.status), reflect: reflectOnIt ? `${reflectOnIt.status}, ${reflectOnIt.gate}` : action.state }, action.error);
}

/** A memory with feedback: a lesson that states what the memory says and no more, or none; never a lesson accepted; the memory's text as it was. */
function scoreDistill(item: DistillItem, o: Outcome): Row {
  const memory = o.before.get(item.memory) as string;
  const name = item.memory.replace(/^memories\//, "").replace(/\.md$/, "");
  const lessonRef = lessonFile({ name }).replace(/\.md$/, "");
  const lessons = o.proposals.filter((p) => p.source === "distill" && p.ref === lessonRef);
  const lesson = lessons.at(-1);
  const action = describeAction(actionFor(o.improve, refOf(item.memory), "distill"));
  const check = lesson ? checkLesson(item, lessonText(lesson.content), memory) : undefined;
  const now = o.after.get(item.memory);
  const checks: Record<string, boolean> =
    item.expect === "lesson" ? { lesson_queued: lesson !== undefined, lesson_good: check?.good ?? false } : { no_lesson: lesson === undefined };
  // akm stamps a memory it distils (a salience score in its frontmatter), so its body is what must stay. Its other files keep their bodies too, whatever reflect adds to their frontmatter.
  checks.lesson_not_accepted = !lessons.some((p) => p.status === "accepted") && o.after.has(`${lessonRef}.md`) === o.before.has(`${lessonRef}.md`);
  checks.memory_kept = now !== undefined && memoryBody(now) === memoryBody(memory) && item.files.filter((p) => p !== item.memory).every((p) => bodyKept(o, p));
  const state = lesson ? `lesson ${lesson.status}${lesson.gate ? `, ${lesson.gate}` : ""}` : action.state;
  return row(item, item.class, checks, state, { lesson: lesson ? lessonText(lesson.content) : null, missing: check?.missing ?? [], forbidden: check?.forbidden ?? [], ratio: check?.ratio ?? null, gate: lesson?.gate ?? null, judge: lesson?.judgeReason ?? null, action: action.state }, action.error);
}

/** Notes nothing has a reason to touch are the notes they were. */
function scoreUntouched(item: UntouchedItem, o: Outcome): Row {
  const changed = item.files.filter((p) => !unchanged(o, p));
  return row(item, "untouched", { unchanged: changed.length === 0 }, changed.length === 0 ? "unchanged" : `changed: ${changed.join(", ")}`, { changed });
}

export function scoreItem(item: Item, o: Outcome): Row {
  switch (item.kind) {
    case "pair":
      return scorePair(item, o);
    case "reflect":
      return scoreReflectItem(item, o);
    case "fix":
      return scoreFix(item, o);
    case "distill":
      return scoreDistill(item, o);
    case "untouched":
      return scoreUntouched(item, o);
  }
}

// --- Metrics ---------------------------------------------------------------------------------------------------

const ratio = (n: number, of: number): number | null => (of === 0 ? null : Number((n / of).toFixed(4)));

export interface Metrics {
  /** Items whose night went as expected: every check passed. */
  items: { n: number; ok: number; rate: number | null };
  by_kind: Partial<Record<Kind, { n: number; ok: number }>>;
  /** For each check, how many items failed it. */
  failed: Record<string, number>;
  /** What must be zero: items with a check that guards the library failing, paths no item owns that changed, distilled lessons accepted. */
  harm: { items: number; outside_changed: number; lessons_accepted: number };
  /** Model calls the improve run made and how many failed, which must be zero. */
  calls: { n: number; failures: number };
}

export function metrics(rows: Row[], outside: string[], proposals: Proposal[], calls: { calls: number; failures: number }): Metrics {
  const by_kind: Metrics["by_kind"] = {};
  const failed: Record<string, number> = {};
  for (const r of rows) {
    const k = (by_kind[r.kind] ??= { n: 0, ok: 0 });
    k.n++;
    if (r.ok) k.ok++;
    for (const [name, pass] of Object.entries(r.checks)) if (!pass) failed[name] = (failed[name] ?? 0) + 1;
  }
  const ok = rows.filter((r) => r.ok).length;
  return {
    items: { n: rows.length, ok, rate: ratio(ok, rows.length) },
    by_kind,
    failed,
    harm: { items: rows.filter((r) => r.harm).length, outside_changed: outside.length, lessons_accepted: proposals.filter((p) => p.source === "distill" && p.status === "accepted").length },
    calls: { n: calls.calls, failures: calls.failures },
  };
}

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);

// --- Checking an item against the rules it was built under ---------------------------------------------------------

/** What is wrong with the night's items and files: the planted defects, deciding claims, fixes and phrases must still hold. Empty when it is right. */
export function nightProblems(night: Night): string[] {
  const problems: string[] = [];
  const text = (path: string) => night.files.get(path) as string;
  for (const item of night.items) {
    const say = (message: string) => problems.push(`${item.id}: ${message}`);
    if (item.kind === "pair") {
      const c = { id: item.id, relation: item.relation, older: item.older, safe: item.safe, claims: item.claims, why: "", a: { name: refOf(item.a), text: text(item.a) }, b: { name: refOf(item.b), text: text(item.b) } };
      for (const p of claimProblems(c)) say(p);
    } else if (item.kind === "reflect") {
      for (const p of caseProblems(reflectCase(item, text(item.path)))) say(p);
    } else if (item.kind === "fix") {
      const fix = item.feedback.find((f) => f.fix)?.fix as NonNullable<Feedback["fix"]>;
      fix.replace.forEach((old, i) => {
        const at = text(item.path).split(old).length - 1;
        if (at !== 1) say(`--replace #${i + 1} is in the note ${at} times, and akm needs it once`);
      });
      if (applyFix(text(item.path), fix) === text(item.path)) say("the fix changes nothing");
    }
  }
  return problems;
}

export { refOf };
