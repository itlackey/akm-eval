import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildNight, itemsText } from "./build.ts";
import {
  type DistillItem,
  type FixItem,
  type Item,
  KINDS,
  type Outcome,
  type PairItem,
  type Proposal,
  type ReflectItem,
  type UntouchedItem,
  actionFor,
  applyFix,
  callStats,
  describeAction,
  loadNight,
  metrics,
  nightProblems,
  nightlyConfig,
  outsideChanges,
  noteAges,
  parseItems,
  parseProposals,
  refOf,
  sameNote,
  scoreItem,
  selectItems,
} from "./lib.ts";

const night = loadNight(join(import.meta.dir, "..", "assets"));
const find = <T extends Item>(id: string): T => night.items.find((i) => i.id === id) as T;

/** The night as planted, with nothing done to it. Change `after`, add proposals or give akm's result to make a night. */
function quiet(over: Partial<Outcome> = {}): Outcome {
  return { before: new Map(night.files), after: new Map(night.files), proposals: [], improve: {}, ...over };
}

const proposal = (over: Partial<Proposal>): Proposal => ({ id: "p", ref: "", status: "pending", source: "reflect", gate: null, judgeReason: null, retirement: null, content: "", ...over });
const retire = (retired: string, successor: string, over: Partial<Proposal> = {}): Proposal => proposal({ source: "consolidate-pair", ref: retired, retirement: { retired, successor, label: "duplicate", reason: "same claims" }, ...over });

describe("the public night", () => {
  test("is 29 items: 7 pairs, 10 reflect cases, 7 distill memories, 1 exact fix and 4 notes to leave alone, in 38 files", () => {
    expect(night.items).toHaveLength(29);
    expect(KINDS.map((k) => night.items.filter((i) => i.kind === k).length)).toEqual([7, 10, 7, 1, 4]);
    expect(night.files.size).toBe(38);
    expect(new Set(night.items.map((i) => i.id)).size).toBe(29);
  });

  test("gives every file to one item, and every item feedback on its own files, and its pair relations, classes and exact fix", () => {
    // loadNight throws on a file that belongs to no item or to two, a file that is missing, and feedback on another note
    const owner = night.items.flatMap((i) => i.files);
    expect(new Set(owner).size).toBe(owner.length);
    const pairs = night.items.filter((i): i is PairItem => i.kind === "pair");
    expect(pairs.map((p) => p.relation)).toEqual(["duplicate", "duplicate", "subsumed", "supersedes", "contradicts", "overlap", "unrelated"]);
    expect(new Set(night.items.filter((i): i is ReflectItem => i.kind === "reflect").map((i) => i.class)).size).toBe(10);
    expect(night.items.filter((i): i is DistillItem => i.kind === "distill").filter((i) => i.expect === "lesson")).toHaveLength(3);
    const fix = find<FixItem>("exact-fix-01");
    expect(fix.feedback).toHaveLength(1);
    expect(fix.feedback[0]?.fix?.source).toBeTruthy();
    expect(night.items.filter((i) => i.kind === "pair" || i.kind === "untouched").every((i) => i.feedback.length === 0)).toBe(true);
  });

  test("hold what their items say: each deciding claim, planted defect and exact fix is where it must be", () => {
    expect(nightProblems(night)).toEqual([]);
  });

  test("are the ones build.ts makes, so the files are not out of date", () => {
    const built = buildNight();
    expect(built.items).toEqual(night.items);
    expect(built.files).toEqual(night.files);
  });

  test("hold no private detail", () => {
    const private_ = /\/home\/|192\.168\.|\.lan\b|\bsplinter\b|\brocksteady\b|\bkrang\b|itlackey|founder3|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}/i;
    const text = `${itemsText(night.items)}\n${[...night.files.values()].join("\n")}`;
    expect(text.match(private_)?.[0]).toBeUndefined();
  });
});

describe("parseItems", () => {
  const line = (over: Record<string, unknown> = {}, id = "x") => JSON.stringify({ ...find<UntouchedItem>("untouched-01"), id, ...over });
  const problems = (over: Record<string, unknown>) => () => parseItems(line(over));

  test("reads JSONL and rejects what an item cannot be", () => {
    expect(parseItems(`${line()}\n\n${line({}, "y")}\n`)).toHaveLength(2);
    expect(problems({ kind: "later" })).toThrow('kind "later"');
    expect(problems({ id: "Not An Id" })).toThrow("needs an id");
    expect(() => parseItems(`${line()}\n${line()}`)).toThrow("repeats the id x");
    expect(problems({ files: [] })).toThrow("no files");
    expect(problems({ note: "" })).toThrow("no note");
    expect(problems({ feedback: [{ ref: "a", signal: "mixed", reason: "r" }] })).toThrow("not a ref, a signal and a reason");
    expect(problems({ feedback: [{ ref: "a", signal: "positive", reason: "r", fix: { replace: ["a"], with: ["b"], source: "s" } }] })).toThrow("fix on positive feedback");
    expect(problems({ feedback: [{ ref: "a", signal: "negative", reason: "r", fix: { replace: ["a", "c"], with: ["b"], source: "s" } }] })).toThrow("matching replace and with lists");
    expect(() => parseItems("not json")).toThrow("not valid JSON");
    expect(() => parseItems("\n")).toThrow("no items");
  });

  test("rejects a pair, a reflect case, a fix and a distill case that does not fit its kind", () => {
    const pair = find<PairItem>("duplicate-01");
    const reflect = find<ReflectItem>("description-period-01");
    const distill = find<DistillItem>("lesson-01");
    const as = (item: Item, over: Record<string, unknown>) => () => parseItems(JSON.stringify({ ...item, ...over }));
    expect(as(pair, { relation: "similar" })).toThrow('relation "similar"');
    expect(as(pair, { older: "c" })).toThrow('older "c"');
    expect(as(pair, { safe: ["c"] })).toThrow('"safe"');
    expect(as(pair, { a: "memories/elsewhere.md" })).toThrow("note a memories/elsewhere.md, which is not one of its files");
    expect(as(pair, { b: pair.a })).toThrow("both notes the path");
    expect(as(reflect, { class: "whatever" })).toThrow('class "whatever"');
    expect(as(reflect, { defect: "" })).toThrow('no "defect"');
    expect(as(find<FixItem>("exact-fix-01"), { feedback: [] })).toThrow("no fix in its feedback");
    expect(as(distill, { expect: "none" })).toThrow("expects none, so its required and forbidden do not fit");
    expect(as(distill, { memory: "memories/other.md" })).toThrow("its memory memories/other.md");
  });
});

describe("loadNight", () => {
  test("says where a file is missing, shared or owned by nobody", () => {
    expect(() => loadNight(join(import.meta.dir, "..", "assets", "library"))).toThrow();
  });
});

describe("selectItems", () => {
  const ids = (n?: number) => selectItems(night.items, n).map((i) => i.id);

  test("takes everything with no limit, or with one that is not smaller than the night", () => {
    expect(ids()).toHaveLength(29);
    expect(ids(29)).toHaveLength(29);
    expect(ids(500)).toHaveLength(29);
  });

  test("takes the first of each kind in turn, in the order of KINDS, and keeps file order", () => {
    expect(ids(1)).toEqual(["duplicate-01"]);
    expect(ids(3)).toEqual(["duplicate-01", "description-period-01", "lesson-01"]);
    expect(ids(5)).toEqual(["duplicate-01", "description-period-01", "lesson-01", "exact-fix-01", "untouched-01"]);
    expect(ids(7)).toEqual(["duplicate-01", "duplicate-02", "description-period-01", "retrieval-miss-01", "lesson-01", "exact-fix-01", "untouched-01"]);
  });
});

describe("noteAges, nightlyConfig", () => {
  test("the notes of a pair are dated as the consolidate eval dates them: the older 3 days old, the newer 1, a pair from one day 2 each", () => {
    expect(noteAges("a")).toEqual({ a: 3, b: 1 });
    expect(noteAges("b")).toEqual({ a: 1, b: 3 });
    expect(noteAges(null)).toEqual({ a: 2, b: 2 });
  });

  test("the config is one engine for every process and semantic search on, and it leaves the strategy to akm", () => {
    const c = nightlyConfig("http://localhost:8080/v1", "m", true);
    expect(c.engines.nightly).toMatchObject({ kind: "llm", model: "m", endpoint: "http://localhost:8080/v1/chat/completions", apiKey: "$MODEL_API_KEY" });
    expect(c.defaults).toEqual({ llmEngine: "nightly" });
    expect(c.semanticSearchMode).toBe("auto");
    expect(c.improve).toBeUndefined();
  });
});

describe("outsideChanges", () => {
  const items = [find<UntouchedItem>("untouched-01")];
  const own = items[0]?.files[0] as string;

  test("names the files no item owns that changed, appeared or vanished, and not the files an item owns", () => {
    const before = new Map([[own, "a"], ["x.md", "1"], ["y.md", "2"], ["z.md", "3"]]);
    const after = new Map([[own, "changed"], ["x.md", "1"], ["y.md", "two"], ["new.md", "4"]]);
    expect(outsideChanges(before, after, items)).toEqual(["new.md", "y.md", "z.md"]);
    expect(outsideChanges(before, before, items)).toEqual([]);
  });
});

describe("applyFix, sameNote", () => {
  test("applyFix swaps each text for its replacement once, in order, and takes a dollar sign as it is", () => {
    expect(applyFix("a b c", { replace: ["b", "c"], with: ["$& x", "d"], source: "s" })).toBe("a $& x d");
    expect(applyFix("a a", { replace: ["a"], with: ["b"], source: "s" })).toBe("b a");
    expect(applyFix("a", { replace: ["z"], with: ["b"], source: "s" })).toBe("a");
  });

  test("sameNote ignores the keys akm adds or stamps, and nothing else", () => {
    const note = "---\ndescription: One.\ntags: [a]\n---\n# T\n\nBody.\n";
    expect(sameNote(note, note)).toBe(true);
    expect(sameNote(note, note.replace("tags: [a]", "tags: [a]\ntype: skill"))).toBe(true);
    expect(sameNote(note, note.replace("tags: [a]", "tags: [a]\nupdated: 2026-01-01\ngenerated:\n  by: akm/0.9.26"))).toBe(true);
    expect(sameNote(note, note.replace("tags: [a]\n", "tags: [a, b]\n"))).toBe(false);
    expect(sameNote(note, note.replace("Body.", "Body!"))).toBe(false);
    expect(sameNote(note, note.replace("description: One.", "description: Two."))).toBe(false);
    expect(sameNote("no frontmatter", "no frontmatter")).toBe(true);
  });
});

describe("parseProposals, actionFor, describeAction, callStats", () => {
  test("parseProposals reads every state, the gate, the judge's reason, the retirement and the content, and drops the bundle from the ref", () => {
    const listed = [
      { status: "pending", proposals: [{ id: "1", ref: "bundle//memories/a", source: "consolidate-pair", gateDecision: { outcome: "staged", reason: "duplicate" }, retirement: { retiredRef: "memories/a", successorRef: "memories/b", judgeLabel: "duplicate", judgeReason: "same" }, payload: {} }] },
      { status: "accepted", proposals: [{ id: "2", ref: "skills/x", source: "reflect", gateDecision: { outcome: "auto-accepted", reason: "judge-passed", judgeReason: "fine" }, retirement: { retiredRef: null }, payload: { content: "text" } }, { oops: true }] },
      { status: "rejected" },
    ];
    expect(parseProposals(listed)).toEqual([
      { id: "1", ref: "memories/a", status: "pending", source: "consolidate-pair", gate: "staged/duplicate", judgeReason: null, retirement: { retired: "memories/a", successor: "memories/b", label: "duplicate", reason: "same" }, content: "" },
      { id: "2", ref: "skills/x", status: "accepted", source: "reflect", gate: "auto-accepted/judge-passed", judgeReason: "fine", retirement: null, content: "text" },
    ]);
  });

  test("actionFor finds the action of one process on one ref, with or without the bundle in the ref", () => {
    const improve = { actions: [{ ref: "skills/x", mode: "reflect", result: { ok: true } }, { ref: "bundle//memories/m", mode: "distill", result: { outcome: "queued" } }, { ref: "memories/m", mode: "reflect-skipped" }] };
    expect(actionFor(improve, "skills/x", "reflect")?.mode).toBe("reflect");
    expect(actionFor(improve, "memories/m", "distill")?.mode).toBe("distill");
    expect(actionFor(improve, "memories/m", "reflect")?.mode).toBe("reflect-skipped");
    expect(actionFor(improve, "skills/y", "reflect")).toBeUndefined();
    // akm's report that a ref's turn failed, or that the budget ran out at it, is the ref's action for either process
    const stopped = { actions: [{ ref: "skills/z", mode: "error", result: { error: "timeout: improve wall-clock budget exhausted" } }] };
    expect(actionFor(stopped, "skills/z", "reflect")?.mode).toBe("error");
    expect(actionFor(stopped, "skills/z", "distill")?.mode).toBe("error");
    expect(actionFor(null, "skills/x", "reflect")).toBeUndefined();
  });

  test("describeAction says what reflect or distill did in a few words, and the error when a model call failed", () => {
    const d = (mode: string, result: Record<string, unknown>) => describeAction({ ref: "r", mode, result });
    expect(describeAction(undefined)).toEqual({ state: "not reached" });
    expect(d("reflect", { ok: true })).toEqual({ state: "proposed" });
    expect(d("reflect-skipped", { reason: "no_change" })).toEqual({ state: "no change" });
    expect(d("reflect-failed", { reason: "quality_rejected", error: "score=2" })).toEqual({ state: "rejected by the judge: score=2" });
    expect(d("reflect-failed", { reason: "timeout", error: "slow" })).toEqual({ state: "failed", error: "timeout: slow" });
    expect(d("reflect-guard-rejected", { reason: "content_policy_reject" }).state).toBe("refused: content_policy_reject");
    expect(d("distill", { outcome: "queued" })).toEqual({ state: "lesson queued" });
    expect(d("distill", { outcome: "review_needed", reason: "unsure" }).state).toBe("lesson queued for review: unsure");
    expect(d("distill", { outcome: "quality_rejected", reason: "restates" }).state).toBe("rejected by the judge: restates");
    expect(d("distill", { outcome: "skipped", skipReason: "lesson_exists" }).state).toBe("skipped: lesson_exists");
    expect(d("distill", { outcome: "llm_failed" })).toEqual({ state: "failed", error: "the model call failed" });
    expect(d("error", { error: "boom" })).toEqual({ state: "failed", error: "boom" });
  });

  test("callStats adds up the usage report by process and model, and is zero without one", () => {
    const improve = { usageReport: { byProcessEngineModel: [{ process: "reflect", model: "a", calls: 3, failures: 0, promptTokens: 300, completionTokens: 30 }, { process: "distill", model: "b", calls: 2, failures: 2 }, { process: "consolidate", model: "a", calls: 5, failures: 1, promptTokens: 4000, completionTokens: 500 }] } };
    expect(callStats(improve)).toEqual({
      calls: 10,
      failures: 3,
      by: [
        { process: "reflect", model: "a", calls: 3, failures: 0, prompt_tokens: 300, completion_tokens: 30 },
        { process: "distill", model: "b", calls: 2, failures: 2, prompt_tokens: 0, completion_tokens: 0 },
        { process: "consolidate", model: "a", calls: 5, failures: 1, prompt_tokens: 4000, completion_tokens: 500 },
      ],
    });
    expect(callStats({})).toEqual({ calls: 0, failures: 0, by: [] });
    expect(callStats(null).failures).toBe(0);
  });
});

describe("scoring a pair", () => {
  const dup = find<PairItem>("duplicate-01"); // safe: either note
  const sub = find<PairItem>("subsumed-02"); // safe: b, which is the newer
  const sup = find<PairItem>("supersedes-01");
  const keep = find<PairItem>("contradicts-04");
  const without = (item: PairItem, side: "a" | "b") => {
    const after = new Map(night.files);
    after.delete(item[side]);
    return after;
  };
  const [dupA, dupB] = [refOf(dup.a), refOf(dup.b)];

  test("a duplicate is right when the drain retires one note and the other stays as it is", () => {
    const r = scoreItem(dup, quiet({ after: without(dup, "a"), proposals: [retire(dupA, dupB, { status: "accepted", gate: "auto-accepted/duplicate" })] }));
    expect(r).toMatchObject({ ok: true, harm: false, class: "duplicate", state: "retired a", detail: { judged_as: "duplicate", proposed: ["a"], gone: ["a"], accepted: true, reason: "same claims" } });
  });

  test("a duplicate that is kept, or proposed and left waiting, is a miss and not harm", () => {
    expect(scoreItem(dup, quiet())).toMatchObject({ ok: false, harm: false, checks: { right_outcome: false }, state: "both notes kept" });
    const waiting = scoreItem(dup, quiet({ proposals: [retire(dupA, dupB)] }));
    expect(waiting).toMatchObject({ ok: false, harm: false, state: "retirement of a proposed, waiting" });
  });

  test("a retirement of the side that holds a claim the other lacks is harm once it is applied, and a miss while it waits", () => {
    const [subA, subB] = [refOf(sub.a), refOf(sub.b)]; // a is the note with the extra claim
    const applied = scoreItem(sub, quiet({ after: without(sub, "a"), proposals: [retire(subA, subB, { status: "accepted" })] }));
    expect(applied).toMatchObject({ ok: false, harm: true, checks: { no_unsafe_retirement: false, no_unsafe_proposal: false } });
    const waiting = scoreItem(sub, quiet({ proposals: [retire(subA, subB)] }));
    expect(waiting).toMatchObject({ ok: false, harm: false, checks: { no_unsafe_retirement: true, no_unsafe_proposal: false, right_outcome: false } });
  });

  test("a subset or a replaced note is right when its retirement is proposed, accepted or not, and wrong when nothing is", () => {
    const [subA, subB] = [refOf(sub.a), refOf(sub.b)];
    expect(scoreItem(sub, quiet({ proposals: [retire(subB, subA)] }))).toMatchObject({ ok: true, state: "retirement of b proposed, waiting" });
    expect(scoreItem(sub, quiet({ after: without(sub, "b"), proposals: [retire(subB, subA, { status: "accepted" })] })).ok).toBe(true);
    expect(scoreItem(sup, quiet({ proposals: [retire(refOf(sup.a), refOf(sup.b))] })).ok).toBe(true);
    expect(scoreItem(sup, quiet({ proposals: [retire(refOf(sup.b), refOf(sup.a))] })).ok).toBe(false);
    expect(scoreItem(sup, quiet()).ok).toBe(false);
  });

  test("notes that must both stay are right when nothing is proposed, and a proposal about them is wrong", () => {
    expect(scoreItem(keep, quiet())).toMatchObject({ ok: true, harm: false, state: "both notes kept" });
    const proposed = scoreItem(keep, quiet({ proposals: [retire(refOf(keep.a), refOf(keep.b))] }));
    expect(proposed).toMatchObject({ ok: false, harm: false, checks: { no_unsafe_proposal: false, right_outcome: false } });
  });

  test("a pair that loses both notes is harm, even a duplicate, whose notes are each safe to retire", () => {
    const both = new Map(night.files);
    both.delete(dup.a);
    both.delete(dup.b);
    expect(scoreItem(dup, quiet({ after: both, proposals: [retire(dupA, dupB, { status: "accepted" }), retire(dupB, dupA, { status: "accepted" })] }))).toMatchObject({ ok: false, harm: true, state: "retired a, b", checks: { no_unsafe_retirement: true, note_kept: false, right_outcome: false } });
  });

  test("a note of a pair that changed is harm, and a retirement of another pair does not count", () => {
    const after = new Map(night.files);
    after.set(keep.a, `${night.files.get(keep.a)}\nAn extra line.\n`);
    expect(scoreItem(keep, quiet({ after }))).toMatchObject({ ok: false, harm: true, checks: { survivors_unchanged: false } });
    expect(scoreItem(keep, quiet({ proposals: [retire(dupA, dupB)] })).ok).toBe(true);
  });
});

describe("scoring a reflect case", () => {
  const period = find<ReflectItem>("description-period-01");
  const control = find<ReflectItem>("retrieval-miss-01");
  const source = night.files.get(period.path) as string;
  const mended = source.replace(/description: (.*)\.\n {2}([a-z])/, "description: $1 $2");

  test("a defect the drain fixed is right, and the proposal's gate is in the row", () => {
    const p = proposal({ ref: refOf(period.path), status: "accepted", gate: "auto-accepted/judge-passed", judgeReason: "ok" });
    const r = scoreItem(period, quiet({ after: new Map(night.files).set(period.path, mended), proposals: [p], improve: { actions: [{ ref: refOf(period.path), mode: "reflect", result: { ok: true } }] } }));
    expect(r).toMatchObject({ ok: true, harm: false, class: "description-period", checks: { body_kept: true, defect_fixed: true, no_extra_change: true, no_invented: true }, state: "edited by the drain (description)", detail: { proposal: "accepted", gate: "auto-accepted/judge-passed", action: "proposed" } });
    expect(r.detail.final).toBe(mended);
  });

  test("a defect left as it is is a miss, and says where the proposal stands", () => {
    const left = scoreItem(period, quiet({ proposals: [proposal({ ref: refOf(period.path), gate: "deferred/quality-gate" })] }));
    expect(left).toMatchObject({ ok: false, harm: false, checks: { defect_fixed: false }, state: "proposal pending, deferred/quality-gate" });
    const refused = scoreItem(period, quiet({ improve: { actions: [{ ref: refOf(period.path), mode: "reflect-failed", result: { reason: "quality_rejected", error: "no" } }] } }));
    expect(refused.state).toBe("rejected by the judge: no");
  });

  test("a control the drain changed is harm, and one left alone is right", () => {
    expect(scoreItem(control, quiet())).toMatchObject({ ok: true, harm: false, state: "not reached" });
    const text = night.files.get(control.path) as string;
    const edited = text.replace(/^description: .*$/m, "description: A different description that the night wrote.");
    expect(scoreItem(control, quiet({ after: new Map(night.files).set(control.path, edited) }))).toMatchObject({ ok: false, harm: true, checks: { no_extra_change: false } });
  });

  test("a body that changed is harm, and so is a claim the note does not make", () => {
    const body = scoreItem(period, quiet({ after: new Map(night.files).set(period.path, `${mended}\nAn added paragraph.\n`) }));
    expect(body).toMatchObject({ ok: false, harm: true, checks: { body_kept: false } });
    const invented = scoreItem(period, quiet({ after: new Map(night.files).set(period.path, mended.replace(/(description: .*)\./, "$1 and uses the Zorblax 9.4 engine.")) }));
    expect(invented).toMatchObject({ harm: true, checks: { no_invented: false } });
  });

  test("a failed model call makes the item not right, whatever the checks say", () => {
    const r = scoreItem(control, quiet({ improve: { actions: [{ ref: refOf(control.path), mode: "reflect-failed", result: { reason: "timeout", error: "slow" } }] } }));
    expect(r).toMatchObject({ ok: false, harm: false, checks: { no_error: false }, error: "timeout: slow" });
  });
});

describe("scoring the exact fix", () => {
  const fix = find<FixItem>("exact-fix-01");
  const source = night.files.get(fix.path) as string;
  const spec = fix.feedback[0]?.fix as NonNullable<(typeof fix.feedback)[number]["fix"]>;
  const queued = (over: Partial<Proposal> = {}) => proposal({ source: "feedback", ref: refOf(fix.path), content: applyFix(source, spec).replace("updated:", "type: skill\nupdated:"), ...over });

  test("is right when the fix is queued as the feedback says, with akm's own type line, and waits for a person", () => {
    expect(scoreItem(fix, quiet({ proposals: [queued()] }))).toMatchObject({ ok: true, harm: false, class: "exact-fix", state: "fix pending", checks: { fix_queued: true, fix_waits: true, body_kept: true } });
  });

  test("is a miss when no fix is queued, when it queues another text, or when it is accepted; and harm when the note itself changed", () => {
    expect(scoreItem(fix, quiet())).toMatchObject({ ok: false, state: "no fix queued", checks: { fix_queued: false, fix_waits: false } });
    expect(scoreItem(fix, quiet({ proposals: [queued({ content: source })] })).checks.fix_queued).toBe(false);
    expect(scoreItem(fix, quiet({ proposals: [queued({ status: "accepted" })] })).checks.fix_waits).toBe(false);
    const applied = scoreItem(fix, quiet({ after: new Map(night.files).set(fix.path, applyFix(source, spec)), proposals: [queued({ status: "accepted" })] }));
    expect(applied).toMatchObject({ ok: false, harm: true, checks: { body_kept: false } });
  });
});

describe("scoring a distill memory", () => {
  const worthy = find<DistillItem>("lesson-01");
  const status = find<DistillItem>("status-01");
  const lessonRef = "lessons/memory-playwright-networkidle-chat-widget-lesson";
  const good = "---\ndescription: Do not wait for networkidle on a page with a polling widget.\nwhen_to_use: A Playwright test hangs on a wait.\n---\nThe support chat widget polls every 20 seconds, so the network is never idle for networkidle. Wait for an element to be visible instead, such as the page heading.\n";
  const lesson = (over: Partial<Proposal> = {}) => proposal({ source: "distill", ref: lessonRef, gate: "deferred/distill-review", content: good, ...over });

  test("a lesson that states the facts and claims no more, waiting for review, is right", () => {
    expect(scoreItem(worthy, quiet({ proposals: [lesson()] }))).toMatchObject({ ok: true, harm: false, class: "lesson-worthy", state: "lesson pending, deferred/distill-review", checks: { lesson_queued: true, lesson_good: true, lesson_not_accepted: true, memory_kept: true } });
  });

  test("no lesson, or an over-claiming one, is a miss", () => {
    expect(scoreItem(worthy, quiet()).checks).toMatchObject({ lesson_queued: false, lesson_good: false });
    const bad = lesson({ content: "---\ndescription: networkidle is broken.\nwhen_to_use: Always.\n---\nNever use waitForLoadState; disable the chat widget in tests and use waitForSelector.\n" });
    expect(scoreItem(worthy, quiet({ proposals: [bad] }))).toMatchObject({ ok: false, harm: false, checks: { lesson_queued: true, lesson_good: false } });
  });

  test("a memory that deserves none is right with none, and a miss with a lesson", () => {
    expect(scoreItem(status, quiet({ improve: { actions: [{ ref: "memories/print-pipeline-release-blocked", mode: "distill", result: { outcome: "quality_rejected", reason: "dated" } }] } }))).toMatchObject({ ok: true, state: "rejected by the judge: dated", checks: { no_lesson: true } });
    const wrong = scoreItem(status, quiet({ proposals: [proposal({ source: "distill", ref: "lessons/memory-print-pipeline-release-blocked-lesson", content: "---\ndescription: d\nwhen_to_use: w\n---\nbody\n" })] }));
    expect(wrong).toMatchObject({ ok: false, harm: false, checks: { no_lesson: false } });
  });

  test("a lesson accepted, or written as a file, is harm", () => {
    expect(scoreItem(worthy, quiet({ proposals: [lesson({ status: "accepted" })] }))).toMatchObject({ ok: false, harm: true, checks: { lesson_not_accepted: false } });
    const written = new Map(night.files).set(`${lessonRef}.md`, good);
    expect(scoreItem(worthy, quiet({ after: written, proposals: [lesson()] }))).toMatchObject({ harm: true, checks: { lesson_not_accepted: false } });
  });

  test("a memory whose body changed is harm, and akm's stamp in its frontmatter is not", () => {
    const text = night.files.get(worthy.memory) as string;
    const stamped = text.replace("type: memory", "type: memory\nsalience: 0.7\nsalienceInputs:\n  novelty: 0.9");
    expect(scoreItem(worthy, quiet({ after: new Map(night.files).set(worthy.memory, stamped), proposals: [lesson()] })).checks.memory_kept).toBe(true);
    const edited = scoreItem(worthy, quiet({ after: new Map(night.files).set(worthy.memory, `${text}\nA new line.\n`), proposals: [lesson()] }));
    expect(edited).toMatchObject({ harm: true, checks: { memory_kept: false } });
  });

  test("a restated skill that changed is harm: the item's other files stay as they are", () => {
    const asset = find<DistillItem>("asset-01");
    const skill = asset.files.find((p) => p.startsWith("skills/")) as string;
    expect(scoreItem(asset, quiet({ after: new Map(night.files).set(skill, "changed") }))).toMatchObject({ harm: true, checks: { memory_kept: false } });
  });

  test("a model call that failed leaves the item not right, even when it expects no lesson", () => {
    const r = scoreItem(status, quiet({ improve: { actions: [{ ref: "memories/print-pipeline-release-blocked", mode: "distill", result: { outcome: "llm_failed" } }] } }));
    expect(r).toMatchObject({ ok: false, harm: false, state: "failed", error: "the model call failed", checks: { no_lesson: true, no_error: false } });
  });
});

describe("scoring a note to leave alone", () => {
  const item = find<UntouchedItem>("untouched-01");

  test("is right when the note is as it was, and harm when it is not", () => {
    expect(scoreItem(item, quiet())).toMatchObject({ ok: true, harm: false, class: "untouched", state: "unchanged" });
    const after = new Map(night.files).set(item.files[0] as string, "different");
    expect(scoreItem(item, quiet({ after }))).toMatchObject({ ok: false, harm: true, state: `changed: ${item.files[0]}` });
    const gone = new Map(night.files);
    gone.delete(item.files[0] as string);
    expect(scoreItem(item, quiet({ after: gone })).harm).toBe(true);
  });
});

describe("metrics", () => {
  const rows = night.items.map((i) => scoreItem(i, quiet()));

  test("counts items right, by kind and by failed check, harm, and the model calls", () => {
    const m = metrics(rows, [], [], { calls: 12, failures: 1 });
    // with nothing done: the notes to leave alone are right, the exact fix and the lessons are missed, and so on
    expect(m.items.n).toBe(29);
    expect(m.by_kind.untouched).toEqual({ n: 4, ok: 4 });
    expect(m.by_kind.pair?.n).toBe(7);
    expect(m.failed.right_outcome).toBe(4); // the two duplicates, the subset and the replaced note are not retired. The three pairs to keep are right.
    expect(m.harm).toEqual({ items: 0, outside_changed: 0, lessons_accepted: 0 });
    expect(m.calls).toEqual({ n: 12, failures: 1 });
    expect(m.items.rate).toBe(Number((m.items.ok / 29).toFixed(4)));
  });

  test("adds the paths that changed outside the items and the distilled lessons accepted", () => {
    const accepted = [proposal({ source: "distill", status: "accepted" }), proposal({ source: "distill", status: "pending" }), proposal({ source: "reflect", status: "accepted" })];
    expect(metrics([], ["a.md", "b.md"], accepted, { calls: 0, failures: 0 }).harm).toEqual({ items: 0, outside_changed: 2, lessons_accepted: 1 });
    expect(metrics([], [], [], { calls: 0, failures: 0 }).items).toEqual({ n: 0, ok: 0, rate: null });
  });
});
