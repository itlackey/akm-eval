// scripts/rescore on nightly: a stored night is scored again from what its samples.jsonl holds, with no akm. The night is one run of many items, so each
// row holds its item's files, proposals and actions and the whole night's part. The runs are built from the golden raw outputs (../golden), scored with
// the eval's own scorer, and written as results folders.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, caseDigests, completionOf, lockedParts, manifestProblems } from "../../../lib/manifest.ts";
import { RescoreError, rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const GOLDEN = join(import.meta.dir, "..", "golden");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** The first golden raw output of each item: a night has one row per item. */
const onePerItem = (lines: { case: string; raw: any }[]) => lines.filter((l, i) => lines.findIndex((x) => x.case === l.case) === i);
const LINES = onePerItem(jsonl(join(GOLDEN, "raw.jsonl")));

/** A results folder of a night of the golden raw outputs `lines`, scored against the public night, as run.ts writes it. */
function stored(lines: { case: string; raw: any }[], edit: (rows: any[]) => any[] = (rows) => rows, extra: { corpus?: "public" | "custom"; corpus_folder?: string | null; scorer?: ReturnType<typeof lockedParts>["scorer"] } = {}): { dir: string; rows: any[] } {
  const corpus = MEASUREMENT.loadCases(ROOT, { corpus: "public" });
  const used = lines.map((l) => corpus.find((c) => c.id === l.case) as never);
  const rows = lines.map((l, i) => MEASUREMENT.score(used[i], (MEASUREMENT.rawOf({ id: l.case, ...l.raw }) as { raw: any }).raw));
  const parts = lockedParts(MEASUREMENT);
  const manifest = buildManifest({
    measurement: MEASUREMENT,
    parts: { ...parts, scorer: extra.scorer ?? parts.scorer },
    corpus: extra.corpus ?? "public",
    cases: caseDigests(MEASUREMENT, used),
    akm: { version: "0.9.99-test", bin: "akm" },
    settings: { strategy: "default" },
    treatment_hints: { embedder: "deterministic" },
    completion: completionOf(MEASUREMENT, used.map((c: any) => c.id), rows),
  });
  const dir = join(mkdtempSync(join(tmpdir(), "nightly-rescore-")), "2026-10-12-golden");
  dirs.push(join(dir, ".."));
  mkdirSync(dir, { recursive: true });
  const written = edit(rows);
  const summary = { eval: "nightly", corpus: extra.corpus ?? "public", ...(extra.corpus === "custom" ? { corpus_folder: extra.corpus_folder ?? null } : {}), label: "golden", status: "complete", aborted_reason: null, embedder: "deterministic", n_items: 35, n_planted: rows.length, ...MEASUREMENT.summarize(written), manifest };
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), written.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return { dir, rows: written };
}
const rowsOf = (dir: string): any[] => jsonl(join(dir, "samples.jsonl"));
const summaryOf = (dir: string): any => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

describe("rescoring a night", () => {
  test("scores a stored night again from samples.jsonl alone, into a new folder, with the same rows, the same summary figures and the manifest of the current scorer", () => {
    const { dir, rows } = stored(LINES);
    const { out, result } = rescoreFolder(dir);
    expect(out).toBe(`${dir}-rescored`);
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const was = summaryOf(dir);
    const now = summaryOf(out);
    expect(now).toMatchObject({ label: "golden-rescored", n_planted: LINES.length, metrics: was.metrics, n_errored: was.n_errored, outside_changed: was.outside_changed });
    expect(manifestProblems(now.manifest)).toEqual([]);
    expect(now.manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
    expect(now.manifest.treatment_hints).toEqual({ embedder: "deterministic" });
    expect(now.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", dropped: [] });
  });

  test("scores the raw output, not the verdict stored beside it: a file put back in a stored row gives another verdict", () => {
    const touched = LINES.find((l) => l.case === "untouched-01");
    expect(touched).toBeDefined();
    // the golden line for untouched-01 is the right night; edit its stored files so the note changed
    const edit = (rows: any[]) => rows.map((r) => (r.id === "untouched-01" ? { ...r, after: Object.fromEntries(Object.entries(r.after).map(([path, text]) => [path, `${text}\nan added line\n`])) } : r));
    const { dir } = stored(LINES, edit);
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual(["untouched-01"]);
    expect(rowsOf(out).find((r) => r.id === "untouched-01")).toMatchObject({ ok: false, harm: true, checks: { unchanged: false } });
    expect(summaryOf(out).metrics.harm.items).toBe(summaryOf(dir).metrics.harm.items + 1);
  });

  test("scores the whole night's part again from the rows: the paths changed outside the items, and the items akm reports an error for", () => {
    // every row of a real night holds the same part of the night, and the summary takes it from the first; here each golden line is a night of its own
    const stray = LINES.filter((l) => l.case === "unrelated-06");
    const { dir } = stored(stray);
    const { out } = rescoreFolder(dir);
    expect(summaryOf(out).outside_changed).toEqual(["lessons/stray-lesson.md"]);
    expect(summaryOf(out).metrics.harm.outside_changed).toBe(1);
    const { dir: all } = stored(LINES);
    const errors = rowsOf(rescoreFolder(all).out).filter((r) => r.error);
    expect(errors.map((r) => r.id)).toEqual(["retrieval-miss-01", "lesson-02"]);
    expect(summaryOf(`${all}-rescored`).n_errored).toBe(2);
  });

  test("refuses a night from before the manifest, whose rows hold no raw output, and names the fields", () => {
    const strip = (rows: any[]) => rows.map(({ before: _b, after: _a, proposals: _p, actions: _c, night: _n, ...row }) => row);
    const { dir } = stored(LINES, strip);
    expect(() => rescoreFolder(dir)).toThrow(RescoreError);
    expect(() => rescoreFolder(dir)).toThrow(/its rows lack the raw output the nightly scorer reads: before \(\d+ rows: .*\); after \(\d+ rows: .*\); proposals \(\d+ rows: .*\); actions \(\d+ rows: .*\); night \(\d+ rows: .*\)/);
  });
});

// #73: a silent item scored ok when the lane's proposal had been rejected or reverted, because only the existence of a proposal that passed the reflect checks
// was asked. The proposal has to be pending. The nights below were stored by the scorer before that: each silent row is written as that scorer wrote it (the
// verdict and the state in the pre-fix table), from raw output that is the same today, and scripts/rescore gives the verdict of the scorer now.
describe("rescoring a night stored before a proposal had to be pending (#73)", () => {
  const RAW = jsonl(join(GOLDEN, "raw.jsonl"));
  const line = (note: string) => RAW.find((l) => l.note === note) as { case: string; raw: any; note: string };
  /** What the scorer before the fix wrote for the silent items of the golden raw outputs, by the note that names the night. */
  const BEFORE: Record<string, { ok: boolean; fix_proposed: boolean; state: string; proposal: string }> = {
    "the lane's proposal was rejected": { ok: true, fix_proposed: true, state: "proposal rejected", proposal: "rejected" },
    "the lane's proposal was reverted after it was accepted": { ok: true, fix_proposed: true, state: "proposal reverted", proposal: "reverted" },
    "a rejected proposal and a pending one for the same note": { ok: true, fix_proposed: true, state: "proposal rejected", proposal: "rejected" },
    "the note was edited without a person": { ok: false, fix_proposed: true, state: "edited without a person (accepted)", proposal: "accepted" },
    "the lane plans the note and leaves a pending fix for a person": { ok: true, fix_proposed: true, state: "proposal pending", proposal: "pending" },
  };
  /** The run stored by the scorer before the fix: the silent row as it wrote it, and the manifest of a scorer older than the live one. */
  function storedBefore(note: string) {
    const was = BEFORE[note] as (typeof BEFORE)[string];
    const parts = lockedParts(MEASUREMENT);
    const old = { ...parts.scorer, version: "0.0", sha256: "e".repeat(64) }; // older than any version the lock can have
    const edit = (rows: any[]) => rows.map((r) => ({ ...r, ok: was.ok, checks: { ...r.checks, fix_proposed: was.fix_proposed }, state: was.state, detail: { ...r.detail, proposal: was.proposal } }));
    return { ...stored([line(note)], edit, { scorer: old }), old };
  }

  for (const note of ["the lane's proposal was rejected", "the lane's proposal was reverted after it was accepted"]) {
    test(`a stored miss that scored ok (${JSON.stringify(note)}) is a miss when it is scored again, and the summary follows`, () => {
      const { dir, rows, old } = storedBefore(note);
      expect(rows[0]).toMatchObject({ kind: "silent", ok: true, checks: { fix_proposed: true, unchanged: true } });
      const { out, result } = rescoreFolder(dir);
      expect(result.changed).toEqual([rows[0].id]);
      expect(rowsOf(out)[0]).toMatchObject({ ok: false, harm: false, checks: { fix_proposed: false, unchanged: true }, state: BEFORE[note]?.state });
      const [was, now] = [summaryOf(dir), summaryOf(out)];
      expect(was.metrics.items).toMatchObject({ n: 1, ok: 1 });
      expect(now.metrics.items).toMatchObject({ n: 1, ok: 0 });
      expect(now.metrics.failed).toEqual({ fix_proposed: 1 });
      expect(now.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", scorer: old });
      expect(now.manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
    });
  }

  test("a stored hit with a pending proposal stays a hit, and so does a night with a rejected proposal and a pending one for the same note (the pending one counts)", () => {
    const pending = storedBefore("the lane plans the note and leaves a pending fix for a person");
    expect(rescoreFolder(pending.dir).result.changed).toEqual([]);
    const both = storedBefore("a rejected proposal and a pending one for the same note");
    const { out, result } = rescoreFolder(both.dir);
    expect(result.changed).toEqual([both.rows[0].id]); // it is the proposal that counts that is read now: its state and the detail change, and the verdict does not
    expect(rowsOf(out)[0]).toMatchObject({ ok: true, checks: { fix_proposed: true, unchanged: true }, state: "proposal pending", detail: { proposal: "pending" } });
  });

  test("an accepted proposal on a note that was edited without a person was never a proposal that waits: the check fails now, and the item was a miss already", () => {
    const { dir, rows } = storedBefore("the note was edited without a person");
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual([rows[0].id]);
    expect(rowsOf(out)[0]).toMatchObject({ ok: false, harm: true, checks: { fix_proposed: false, unchanged: false } });
    expect(summaryOf(out).metrics.harm.items).toBe(summaryOf(dir).metrics.harm.items);
  });
});

// #75: the exact fix passed only while its proposal was pending and the note unchanged, which is akm 0.9's rule. akm 0.10 applies a manual fix at once, so the night
// that ends with the note correct failed, and the applied fix read as harm. The fix is scored by the note's end state now. The nights below were stored by the
// scorer before that: the exact-fix row is written as that scorer wrote it (its checks, its verdict and its state), from raw output that is the same today.
describe("rescoring a night stored before the exact fix was scored by the end state of the note (#75)", () => {
  const RAW = jsonl(join(GOLDEN, "raw.jsonl"));
  const line = (note: string) => RAW.find((l) => l.note === note) as { case: string; raw: any; note: string };
  /** The exact-fix row as the scorer before wrote it: a fix applied (the proposal accepted) failed fix_waits and body_kept, and was harm. */
  const WAS_APPLIED = { ok: false, harm: true, checks: { fix_queued: true, fix_waits: false, body_kept: false, no_extra_change: true, no_invented: true }, state: "fix accepted", detail: { fix: ["accepted"], reflect: "not reached" } };
  /** The same for a fix that waits: it was right. */
  const WAS_WAITING = { ok: true, harm: false, checks: { fix_queued: true, fix_waits: true, body_kept: true, no_extra_change: true, no_invented: true }, state: "fix pending", detail: { fix: ["pending"], reflect: "no change" } };
  function storedBefore(note: string, was: Record<string, unknown>) {
    const parts = lockedParts(MEASUREMENT);
    const old = { ...parts.scorer, version: "0.0", sha256: "e".repeat(64) }; // older than any version the lock can have
    const { dir, rows } = stored([line(note)], (rs) => rs.map((r) => ({ ...r, ...was })), { scorer: old });
    return { dir, rows, old };
  }

  test("a night in which akm 0.10 applied the fix at once failed under the scorer before and passes when it is scored again, and the summary follows", () => {
    const { dir, rows, old } = storedBefore("the exact fix is applied at once and its proposal accepted, stamped by akm (akm 0.10)", WAS_APPLIED);
    expect(rows[0]).toMatchObject({ id: "exact-fix-01", ok: false, harm: true, state: "fix accepted" });
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual(["exact-fix-01"]);
    expect(rowsOf(out)[0]).toMatchObject({ ok: true, harm: false, state: "fix applied", checks: { fix_done: true, only_the_fix: true }, detail: { fix: ["accepted"], applied: true } });
    const [was, now] = [summaryOf(dir), summaryOf(out)];
    expect(was.metrics.items).toMatchObject({ n: 1, ok: 0 });
    expect(was.metrics.harm.items).toBe(1);
    expect(was.metrics.failed).toEqual({ fix_waits: 1, body_kept: 1 });
    expect(now.metrics.items).toMatchObject({ n: 1, ok: 1 });
    expect(now.metrics.harm.items).toBe(0);
    expect(now.metrics.failed).toEqual({});
    expect(now.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", scorer: old });
    expect(now.manifest.scorer).toEqual(lockedParts(MEASUREMENT).scorer);
  });

  test("a night in which the fix waited as a pending proposal (akm 0.9.26) was right and stays right", () => {
    const { dir } = storedBefore("the exact fix is queued, stamped by akm, and waits", WAS_WAITING);
    const { out } = rescoreFolder(dir);
    expect(rowsOf(out)[0]).toMatchObject({ ok: true, harm: false, state: "fix pending", checks: { fix_done: true, only_the_fix: true } });
    expect(summaryOf(out).metrics.items).toMatchObject({ n: 1, ok: 1 });
  });

  for (const note of ["the exact fix is applied with the wrong text and its proposal accepted", "the exact fix is applied and the description was edited too"]) {
    test(`a night with a wrong or extra change (${JSON.stringify(note)}) was harm and stays harm`, () => {
      const { dir } = storedBefore(note, WAS_APPLIED);
      const { out } = rescoreFolder(dir);
      expect(rowsOf(out)[0]).toMatchObject({ ok: false, harm: true, state: "note changed beyond the fix", checks: { fix_done: false, only_the_fix: false } });
      expect(summaryOf(out).metrics.harm.items).toBe(1);
    });
  }
});

describe("rescoring a night on a custom corpus", () => {
  test("reads the items from the corpus_folder the run recorded, which is from the repository root", () => {
    // a folder of the repository that holds an items.jsonl and a library/: the committed night stands in for a folder of a custom corpus
    const { dir, rows } = stored(LINES, undefined, { corpus: "custom", corpus_folder: "evals/nightly/assets" });
    const { out, result } = rescoreFolder(dir);
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    expect(summaryOf(out)).toMatchObject({ corpus: "custom", corpus_folder: "evals/nightly/assets" });
  });

  test("refuses a run whose folder was outside the repository, and says to give it with --cases", () => {
    const { dir } = stored(LINES, undefined, { corpus: "custom", corpus_folder: null });
    expect(() => rescoreFolder(dir)).toThrow(/was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts\/rescore with --cases DIR/);
  });

  test("reads the items from the folder --cases names, a folder of your own outside the repository, and records it as null", () => {
    const { dir, rows } = stored(LINES, undefined, { corpus: "custom", corpus_folder: null });
    const mine = mkdtempSync(join(tmpdir(), "nightly rescore notes-"));
    dirs.push(mine);
    cpSync(join(ROOT, "evals", "nightly", "assets"), mine, { recursive: true });
    const { out, result } = rescoreFolder(dir, { cases: mine });
    expect(rowsOf(out)).toEqual(rows);
    expect(result).toMatchObject({ changed: [], dropped: [] });
    expect(summaryOf(out).corpus_folder).toBeNull();
  });
});
