// The scorer of the nightly eval: the checks that turn what one night of akm improve did to the planted library into a verdict for each item, and the
// verdicts into metrics. It is the SCORER part of the eval's measurement (see measurement.ts and lib/manifest.ts): pure, deterministic, and it needs
// no akm. The collector (collect.ts) builds each item's row by calling `makeRow` with the raw output it got, and scripts/rescore calls the same
// function with the raw output it reads back from a stored row, so a fix to a check scores every stored night again.
//
// The checks of the other evals are used as they are. A reflect item is scored by the reflect eval's `score` (evals/reflect/src/score.ts) and a
// distill item by distill's `checkLesson` (lesson-checks.ts, a copy of it: see there). A change to any of these files changes what this eval
// scores. It is a measurement change: bump the scorer in MEASUREMENT.lock (scripts/measurement/run bump nightly scorer --reason "...") and update
// the golden files (golden/) in the same change. Nothing here may import the collector, or anything it imports: a scorer that reaches
// collector code is refused.

import { addedTitle, score as scoreReflect, splitFrontmatter } from "../../reflect/src/score.ts";
import type { Case as ReflectCase } from "../../reflect/src/score.ts";
import { type DistillItem, type Feedback, type FixItem, type Item, type Kind, type PairItem, type ReflectItem, type Side, type UntouchedItem, applyFix, reflectCase, refOf } from "./items.ts";
import { checkLesson, lessonFile, lessonText, memoryBody } from "./lesson-checks.ts";

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

/** An action `akm improve` reports for a ref: what a process did to it, and what it says of that. */
export interface Action {
  ref: string;
  mode: string;
  result?: Record<string, any>;
}

/** What the improve result says of the proactive lane: how many refs it picked of how many were due, and which. Null when the lane did not run. */
export interface Lane {
  selected: number;
  due: number;
  refs: string[];
}

export const conceptId = (ref: string): string => (ref.includes("//") ? ref.slice(ref.indexOf("//") + 2) : ref);

/**
 * The action akm reported for a ref and a process (`reflect` or `distill`), or undefined when the night did not get to it. An `error`
 * action is akm's report that a ref's turn failed or that the run's budget ran out at it, and counts for either process.
 */
export function actionFor(actions: Action[], ref: string, process: "reflect" | "distill"): Action | undefined {
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

// --- The raw output of a night -----------------------------------------------------------------------------------

/** What the night did that is not about one item: the same in every row of the night. */
export interface WholeNight {
  /** The paths that no planted item owns and that appeared or changed (see `outsideChanges`). */
  outside: string[];
  /** The model calls of the improve run and how many failed. */
  calls: { calls: number; failures: number };
  /** The proactive lane, null when it did not run. */
  lane: Lane | null;
  /** Every proposal of the night, in every state, without its content. */
  proposals: Pick<Proposal, "ref" | "source" | "status">[];
}

/**
 * The raw output of one item: what the collector got back from akm and the library for it, and nothing the scorer decides. The fields are the ones a
 * row stores under the same names, so a stored row holds everything `makeRow` reads and scripts/rescore can score it again (see `rawOf`). The night
 * is one run of many items, so each row holds the part of it that is the item's (its files before and after, the proposals and actions on its refs) and
 * the part of it that is the whole night's (`night`), which is the same in every row.
 */
export interface Raw {
  /** The text of the files the scorer reads for the item (see `watchedPaths`) before the night. A file that was not there is not listed. */
  before: Record<string, string>;
  /** The same after the night and its drain. A file that is gone is not listed. */
  after: Record<string, string>;
  /** The proposals on the item's refs, in every state. */
  proposals: Proposal[];
  /** The actions `akm improve` reported on the item's refs. */
  actions: Action[];
  night: WholeNight;
}

/** The library files the scorer reads for an item: its own, and for a distill item the lesson file distill writes for its memory. */
export function watchedPaths(item: Item): string[] {
  return item.kind === "distill" ? [...new Set([...item.files, lessonFile({ name: nameOfMemory(item.memory) })])] : item.files;
}

/** The refs the scorer reads proposals and actions for: those of `watchedPaths`. */
export const watchedRefs = (item: Item): string[] => watchedPaths(item).map(refOf);

const nameOfMemory = (memory: string): string => memory.replace(/^memories\//, "").replace(/\.md$/, "");

/** The files that changed, appeared or vanished between two readings of the library, and that no item owns. */
export function outsideChanges(before: Map<string, string>, after: Map<string, string>, items: Item[]): string[] {
  const owned = new Set(items.flatMap((i) => i.files));
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((p) => !owned.has(p) && before.get(p) !== after.get(p)).sort();
}

// --- Scoring -----------------------------------------------------------------------------------------------------

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
  /** Facts behind the checks, so a result can be read. */
  detail: Record<string, unknown>;
  /** akm reports an error for this item: a model call failed, or the run's budget ran out at it. */
  error?: string;
  // The raw output, kept so that the row can be scored again:
  before: Raw["before"];
  after: Raw["after"];
  proposals: Raw["proposals"];
  actions: Raw["actions"];
  night: WholeNight;
}

/** The night as the checks see it for one item: the text of its files before and after, its proposals and actions, and the proactive lane. */
export interface Outcome {
  before: Map<string, string>;
  after: Map<string, string>;
  proposals: Proposal[];
  actions: Action[];
  lane: Lane | null;
}

/** The checks that guard the library. Any of them failing is harm, not a miss. */
const GUARDS = new Set(["no_unsafe_retirement", "note_kept", "survivors_unchanged", "body_kept", "no_extra_change", "no_invented", "unchanged", "memory_kept", "lesson_not_accepted"]);

type Scored = Omit<Row, "before" | "after" | "proposals" | "actions" | "night">;

function row(item: Item, cls: string, scored: Record<string, boolean>, state: string, detail: Record<string, unknown>, error?: string): Scored {
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

/** A pair: no side that holds a claim the other lacks is retired, proposed or not, and what is retired fits the relation. */
function scorePair(item: PairItem, o: Outcome): Scored {
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

/** A reflect item: the note as the night left it passes the reflect eval's checks. */
function scoreReflectItem(item: ReflectItem, o: Outcome): Scored {
  const source = o.before.get(item.path) as string;
  const final = o.after.get(item.path) ?? "";
  const { checks, changed, values } = scoreReflect(reflectCase(item, source), final);
  const mine = o.proposals.filter((p) => p.source === "reflect" && p.ref === refOf(item.path));
  const proposal = mine.at(-1);
  const action = describeAction(actionFor(o.actions, refOf(item.path), "reflect"));
  const state = final !== source ? `edited by the drain (${changed.join(", ") || "frontmatter"})` : proposal ? `proposal ${proposal.status}${proposal.gate ? `, ${proposal.gate}` : ""}` : action.state;
  return row(item, item.class, checks, state, { changed, values, proposal: proposal?.status ?? null, gate: proposal?.gate ?? null, judge: proposal?.judgeReason ?? null, action: action.state, final: final !== source ? final : null }, action.error);
}

/**
 * A note with a defect and no feedback, which only the proactive lane can reach. The right night leaves a pending proposal that passes
 * the reflect eval's checks, which a person accepts, and leaves the note exactly as planted: a proposal of the lane is never accepted
 * unattended.
 */
function scoreSilentItem(item: ReflectItem, o: Outcome): Scored {
  const ref = refOf(item.path);
  const source = o.before.get(item.path) as string;
  // #73: the proposal that counts is one still waiting for a person. A proposal that was rejected or reverted is not a proposed fix; when there is
  // none pending, the last one is read for the state alone, and the check fails
  const mine = o.proposals.filter((p) => p.source === "reflect" && p.ref === ref);
  const proposal = mine.filter((p) => p.status === "pending").at(-1) ?? mine.at(-1);
  const { checks: reflected, changed, values } = scoreReflect(reflectCase(item, source), proposal?.content ?? source);
  const failed = Object.entries(reflected).filter(([, pass]) => !pass).map(([name]) => name);
  const action = describeAction(actionFor(o.actions, ref, "reflect"));
  const planned = o.lane?.refs.includes(ref) ?? false;
  const checks = { fix_proposed: proposal?.status === "pending" && failed.length === 0, unchanged: unchanged(o, item.path) };
  const state = !unchanged(o, item.path) ? `edited without a person (${proposal?.status ?? "no proposal"})` : proposal ? `proposal ${proposal.status}${failed.length > 0 ? `, fails ${failed.join(", ")}` : ""}` : planned ? action.state : "not planned";
  return row(item, item.class, checks, state, { planned, proposal: proposal?.status ?? null, gate: proposal?.gate ?? null, changed, values, failed, action: action.state }, action.error);
}

/** The exact fix: queued as a proposal that makes the note as the feedback says, and still waiting. The night changes nothing else, and nothing in the note itself. */
function scoreFix(item: FixItem, o: Outcome): Scored {
  const source = o.before.get(item.path) as string;
  const fix = item.feedback.find((f) => f.fix)?.fix as NonNullable<Feedback["fix"]>;
  const expected = applyFix(source, fix);
  const ref = refOf(item.path);
  const queued = o.proposals.filter((p) => p.source === "feedback" && p.ref === ref);
  const reflectOnIt = o.proposals.filter((p) => p.source === "reflect" && p.ref === ref).at(-1);
  const action = describeAction(actionFor(o.actions, ref, "reflect"));
  const control: ReflectCase = { id: item.id, class: "retrieval-miss", path: item.path, source, feedback: item.feedback[0]?.reason ?? "", defect: "", correct: "", allow: [] };
  const { checks: kept } = scoreReflect(control, o.after.get(item.path) ?? "");
  const checks = { fix_queued: queued.some((p) => sameNote(p.content, expected)), fix_waits: queued.length > 0 && queued.every((p) => p.status === "pending"), ...kept };
  const state = queued.length === 0 ? "no fix queued" : `fix ${queued.map((p) => p.status).join(", ")}`;
  return row(item, "exact-fix", checks, state, { fix: queued.map((p) => p.status), reflect: reflectOnIt ? `${reflectOnIt.status}, ${reflectOnIt.gate}` : action.state }, action.error);
}

/** A memory with feedback: a lesson that states what the memory says and no more, or none; never a lesson accepted; the memory's text as it was. */
function scoreDistill(item: DistillItem, o: Outcome): Scored {
  const memory = o.before.get(item.memory) as string;
  const name = nameOfMemory(item.memory);
  const lessonRef = lessonFile({ name }).replace(/\.md$/, "");
  const lessons = o.proposals.filter((p) => p.source === "distill" && p.ref === lessonRef);
  const lesson = lessons.at(-1);
  const action = describeAction(actionFor(o.actions, refOf(item.memory), "distill"));
  // required, forbidden and contradicts: a lesson that states every fact and still turns the memory's advice round is not good
  const check = lesson ? checkLesson({ required: item.required, forbidden: item.forbidden, contradicts: item.contradicts }, lessonText(lesson.content), memory) : undefined;
  const now = o.after.get(item.memory);
  const checks: Record<string, boolean> =
    item.expect === "lesson" ? { lesson_queued: lesson !== undefined, lesson_good: check?.good ?? false } : { no_lesson: lesson === undefined };
  // akm stamps a memory it distils (a salience score in its frontmatter), so its body is what must stay. Its other files keep their bodies too, whatever reflect adds to their frontmatter.
  checks.lesson_not_accepted = !lessons.some((p) => p.status === "accepted") && o.after.has(`${lessonRef}.md`) === o.before.has(`${lessonRef}.md`);
  checks.memory_kept = now !== undefined && memoryBody(now) === memoryBody(memory) && item.files.filter((p) => p !== item.memory).every((p) => bodyKept(o, p));
  const state = lesson ? `lesson ${lesson.status}${lesson.gate ? `, ${lesson.gate}` : ""}` : action.state;
  return row(item, item.class, checks, state, { lesson: lesson ? lessonText(lesson.content) : null, missing: check?.missing ?? [], forbidden: check?.forbidden ?? [], contradicted: check?.contradicted ?? [], ratio: check?.ratio ?? null, gate: lesson?.gate ?? null, judge: lesson?.judgeReason ?? null, action: action.state }, action.error);
}

/** Notes nothing has a reason to touch are the notes they were. */
function scoreUntouched(item: UntouchedItem, o: Outcome): Scored {
  const changed = item.files.filter((p) => !unchanged(o, p));
  return row(item, "untouched", { unchanged: changed.length === 0 }, changed.length === 0 ? "unchanged" : `changed: ${changed.join(", ")}`, { changed });
}

/** What the night did to one item, judged by its kind. */
export function scoreItem(item: Item, o: Outcome): Scored {
  switch (item.kind) {
    case "pair":
      return scorePair(item, o);
    case "reflect":
      return scoreReflectItem(item, o);
    case "silent":
      return scoreSilentItem(item, o);
    case "fix":
      return scoreFix(item, o);
    case "distill":
      return scoreDistill(item, o);
    case "untouched":
      return scoreUntouched(item, o);
  }
}

/** The row for an item and its raw output: the verdict, and the raw output beside it so that the row can be scored again. */
export function makeRow(item: Item, raw: Raw): Row {
  const outcome: Outcome = { before: new Map(Object.entries(raw.before)), after: new Map(Object.entries(raw.after)), proposals: raw.proposals, actions: raw.actions, lane: raw.night.lane };
  return { ...scoreItem(item, outcome), before: raw.before, after: raw.after, proposals: raw.proposals, actions: raw.actions, night: raw.night };
}

// --- Metrics -----------------------------------------------------------------------------------------------------

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
  /** The proactive lane: refs it picked of the `due` ones, and the reflect proposals on its picks: those on silent defects, and the rest, which a reviewer reads for nothing. Null when the lane did not run. */
  proactive: { selected: number; due: number; proposals: number; on_silent: number; on_others: number } | null;
}

/** The night's numbers: the rows, the paths changed outside the items, every proposal of the night, the model calls, and the proactive lane (null when it did not run). */
export function metrics(rows: Pick<Row, "kind" | "ok" | "harm" | "checks" | "detail">[], outside: string[], proposals: Pick<Proposal, "ref" | "source" | "status">[], calls: { calls: number; failures: number }, lane: Lane | null = null): Metrics {
  const by_kind: Metrics["by_kind"] = {};
  const failed: Record<string, number> = {};
  for (const r of rows) {
    const k = (by_kind[r.kind] ??= { n: 0, ok: 0 });
    k.n++;
    if (r.ok) k.ok++;
    for (const [name, pass] of Object.entries(r.checks)) if (!pass) failed[name] = (failed[name] ?? 0) + 1;
  }
  const ok = rows.filter((r) => r.ok).length;
  const onPicks = lane ? proposals.filter((p) => p.source === "reflect" && lane.refs.includes(p.ref)).length : 0;
  const onSilent = rows.filter((r) => r.kind === "silent" && r.detail.planned === true && r.detail.proposal !== null).length;
  return {
    items: { n: rows.length, ok, rate: ratio(ok, rows.length) },
    by_kind,
    failed,
    harm: { items: rows.filter((r) => r.harm).length, outside_changed: outside.length, lessons_accepted: proposals.filter((p) => p.source === "distill" && p.status === "accepted").length },
    calls: { n: calls.calls, failures: calls.failures },
    proactive: lane ? { selected: lane.selected, due: lane.due, proposals: onPicks, on_silent: onSilent, on_others: onPicks - onSilent } : null,
  };
}

// --- Scoring a stored row again ----------------------------------------------------------------------------------

const isObject = (x: unknown): x is Record<string, any> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * The raw output of a stored row: the fields of the row that `makeRow` reads, or the names of those the row lacks. A run whose rows lack one
 * cannot be scored again (scripts/rescore refuses it and names them). Rows written before the manifest hold none of them, so such a night is refused.
 */
export function rawOf(row: Record<string, any>): { raw: Raw } | { missing: string[] } {
  const missing: string[] = [];
  if (!isObject(row.before)) missing.push("before");
  if (!isObject(row.after)) missing.push("after");
  if (!Array.isArray(row.proposals)) missing.push("proposals");
  if (!Array.isArray(row.actions)) missing.push("actions");
  const n = row.night;
  if (!isObject(n) || !Array.isArray(n.outside) || !isObject(n.calls) || !(n.lane === null || isObject(n.lane)) || !Array.isArray(n.proposals)) missing.push("night");
  if (missing.length > 0) return { missing };
  return { raw: { before: row.before, after: row.after, proposals: row.proposals, actions: row.actions, night: row.night } };
}

/** An item akm reports an error for has no verdict: it was not decided at all. */
export const errored = (row: Pick<Row, "error">): boolean => row.error !== undefined;

/** The fields of the summary that come from the rows: how many items errored, the paths changed outside the items, and the metrics. */
export function summarize(rows: Row[]): { n_errored: number; outside_changed: string[]; metrics: Metrics } {
  const night = rows[0]?.night ?? { outside: [], calls: { calls: 0, failures: 0 }, lane: null, proposals: [] };
  return { n_errored: rows.filter(errored).length, outside_changed: night.outside, metrics: metrics(rows, night.outside, night.proposals, night.calls, night.lane) };
}
