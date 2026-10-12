// The declaration of the judge-gate eval (measurement.ts): the digests of a case, the corpus a stored run is scored against again, and
// scripts/rescore on a stored run. The stored runs are built from the raw outputs in fixtures/ of ../fixtures, scored with the eval's own scorer.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { RescoreError, rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { UNVERSIONED, buildManifest, caseDigests, completionOf, manifestProblems, readManifest } from "../../../lib/manifest.ts";
import { casesSha256 } from "./inputs.ts";
import { type Case, type Raw, type Row, judgeConfig, orderFeedback, parseCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const EVAL_DIR = join(import.meta.dir, "..");
const PUBLIC = join(EVAL_DIR, "assets");
const FIXTURES = join(import.meta.dir, "..", "fixtures");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const LINES: { case: string; note: string; raw: Record<string, any> }[] = jsonl(join(FIXTURES, "raw.jsonl"));
const PUBLIC_CASES = parseCases(readFileSync(join(PUBLIC, "cases.jsonl"), "utf8"));
/** The public cases the golden files cover, each with the first raw output of it. */
const FIXTURE_CASES = jsonl(join(FIXTURES, "cases.jsonl")).map((g) => PUBLIC_CASES.find((c) => c.id === g.id) as Case);
const FIRST = (c: Case): Raw => (MEASUREMENT.rawOf({ id: c.id, ...(LINES.find((l) => l.case === c.id) as { raw: Record<string, any> }).raw }) as { raw: Raw }).raw;

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "judge-gate-measurement-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A results folder of the golden cases. Without `legacy` it is as harness-v3 writes it; with it, a summary with no manifest, as an eval wrote it before. */
function stored(options: { legacy?: boolean; without?: string[]; name?: string; custom?: { folder: string | null } } = {}): string {
  const custom = options.custom;
  const rows = FIXTURE_CASES.map((c) => MEASUREMENT.score(c, FIRST(c)));
  const config = judgeConfig("https://gateway.example/deployment-A/v1", "the-model", true);
  const dir = join(tmp(), options.name ?? "2026-10-12-golden");
  mkdirSync(dir, { recursive: true });
  const summary: Record<string, unknown> = {
    eval: "judge-gate",
    corpus: custom ? "custom" : "public",
    corpus_kind: custom ? "own" : "public",
    corpus_private: custom !== undefined,
    corpus_folder: custom ? custom.folder : null,
    label: "golden",
    date: "2026-10-12T09:00:00.000Z",
    harness_sha256: "b".repeat(64),
    model: "the-model",
    akm_version: "0.9.99-test",
    akm_bin: "akm",
    akm_build: null,
    akm_build_fingerprint: null,
    limit: null,
    strategy: "default",
    config_patch: null,
    config: JSON.parse(JSON.stringify(config)),
    assets_sha256: casesSha256(PUBLIC),
    rubric_version: 2,
    seed: null,
    status: "complete",
    aborted_reason: null,
    n_cases: PUBLIC_CASES.length,
    ...MEASUREMENT.summarize(rows),
  };
  if (!options.legacy) {
    summary.manifest = buildManifest({
      measurement: MEASUREMENT,
      corpus: custom ? "custom" : "public",
      cases: caseDigests(MEASUREMENT, FIXTURE_CASES),
      akm: { version: "0.9.99-test", bin: "akm" },
      config,
      settings: { strategy: "default" },
      completion: completionOf(MEASUREMENT, FIXTURE_CASES.map((c) => c.id), rows),
    });
  }
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const kept = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => !(options.without ?? []).includes(k)));
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(kept(r))}\n`).join(""));
  return dir;
}
const rowsOf = (dir: string): any[] => jsonl(join(dir, "samples.jsonl"));
const summaryOf = (dir: string): any => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

describe("the digests of a case", () => {
  const digest = (c: Case) => caseDigests(MEASUREMENT, [c])[c.id];

  test("a source, a candidate or a feedback that changes changes input_sha256 and not label_sha256, and a label that changes does the opposite", () => {
    const c = PUBLIC_CASES.find((x) => x.label === "bad" && x.feedback.includes("[negative]")) as Case;
    const was = digest(c);
    for (const changed of [{ source: `${c.source}\n` }, { candidate: `${c.candidate}\n` }, { feedback: `${c.feedback}\n[positive] fine` }]) {
      expect(digest({ ...c, ...changed })).toEqual({ input_sha256: expect.not.stringMatching(was.input_sha256), label_sha256: was.label_sha256 });
    }
    for (const changed of [{ label: "good", severity: undefined }, { severity: c.severity === "churn" ? "harmful" : "churn" }, { set: "another-set" }] as Partial<Case>[]) {
      expect(digest({ ...c, ...changed })).toEqual({ input_sha256: was.input_sha256, label_sha256: expect.not.stringMatching(was.label_sha256) });
    }
    expect(digest({ ...c, labelReason: "Another reason, which the scorer does not read.", kind: "another", canary: "another canary" })).toEqual(was);
  });

  test("the input is what goes to akm, with the negative feedback first: reordered feedback of the same lines is the same input", () => {
    const c = { ...(PUBLIC_CASES[0] as Case), feedback: "[positive] fine\n[negative] stale" };
    expect(digest(c).input_sha256).toBe(digest({ ...c, feedback: orderFeedback(c.feedback) }).input_sha256);
  });
});

describe("the corpus a stored run is scored against again", () => {
  /** A repository root with the public assets copied to the folders a run could have read. */
  function repo(): string {
    const root = tmp();
    for (const dir of [join("evals", "judge-gate", "assets"), join("private", "judge-gate", "assets"), join("private", "judge-gate", "own")]) cpSync(PUBLIC, join(root, dir), { recursive: true });
    return root;
  }
  const ids = (cases: Case[]) => cases.map((c) => c.id);

  test("public is the committed cases, private (a run from before corpus.json) the seeded rewrite, and a custom corpus the folder it recorded", () => {
    const root = repo();
    const expected = ids(PUBLIC_CASES);
    expect(ids(MEASUREMENT.loadCases(root, { corpus: "public" }))).toEqual(expected);
    expect(ids(MEASUREMENT.loadCases(root, { corpus: "private" }))).toEqual(expected);
    expect(ids(MEASUREMENT.loadCases(root, { corpus: "custom", corpus_folder: join("private", "judge-gate", "own") }))).toEqual(expected);
    expect(ids(MEASUREMENT.loadCases(root, { corpus: "custom", corpus_folder: join(root, "private", "judge-gate", "own") }))).toEqual(expected); // a folder named whole, as --cases would
  });

  test("a custom corpus that recorded no folder says how to name it", () => {
    expect(() => MEASUREMENT.loadCases(repo(), { corpus: "custom", corpus_folder: null })).toThrow("did not record the folder of its custom corpus (it was outside the repository). Give the folder to scripts/rescore with --cases DIR");
  });

  test("a run from before the manifest can be scored again only when it read the cases that are here now", () => {
    const root = repo();
    const summary = { corpus: "public", assets_sha256: casesSha256(PUBLIC) };
    expect(MEASUREMENT.legacyProblem?.(root, summary)).toBeUndefined();
    expect(MEASUREMENT.legacyProblem?.(root, { ...summary, assets_sha256: "0".repeat(64) })).toBe(`it read other cases than the ones in ${join("evals", "judge-gate", "assets")} now (assets_sha256 is ${"0".repeat(64)})`);
    expect(MEASUREMENT.legacyProblem?.(root, { corpus: "public" })).toContain("assets_sha256 is not recorded");
    expect(MEASUREMENT.legacyProblem?.(root, { corpus: "custom", corpus_folder: null })).toContain("did not record the folder");
    rmSync(join(root, "evals", "judge-gate", "assets", "cases.jsonl"));
    expect(MEASUREMENT.legacyProblem?.(root, summary)).toContain("it read other cases than the ones in");
  });
});

describe("rescoring a stored run", () => {
  test("scores every case again from its row into a new folder beside the run, with the same rows and metrics, and leaves the run as it was", () => {
    const dir = stored();
    const before = readFileSync(join(dir, "samples.jsonl"), "utf8") + readFileSync(join(dir, "summary.json"), "utf8");
    const { out, result } = rescoreFolder(dir);
    expect(out).toBe(`${dir}-rescored`);
    expect(readdirSync(join(dir, "..")).sort()).toEqual(["2026-10-12-golden", "2026-10-12-golden-rescored"]);
    expect(readFileSync(join(dir, "samples.jsonl"), "utf8") + readFileSync(join(dir, "summary.json"), "utf8")).toBe(before);
    expect(rowsOf(out)).toEqual(rowsOf(dir));
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const [s, o] = [summaryOf(out), summaryOf(dir)];
    expect(s).toMatchObject({ label: "golden-rescored", n_run: FIXTURE_CASES.length, metrics: o.metrics, n_errored: o.n_errored, timeouts: o.timeouts, rubric_version: 2 });
    expect(manifestProblems(s.manifest)).toEqual([]);
    expect(readManifest(s).kind).toBe("manifest");
    expect(s.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", dropped: [] });
  });

  test("a relabelled case is scored again under its new label: the row, the metrics and the digest follow, and the case is named", () => {
    const dir = stored();
    const c = FIXTURE_CASES.find((x) => x.label === "bad" && x.severity === "harmful" && rowsOf(dir).some((r) => r.id === x.id)) as Case;
    // the run was made when this case was labelled churn: its row and its digest say so
    const was = { ...c, severity: "churn" as const };
    const manifest = summaryOf(dir).manifest;
    manifest.cases[c.id].label_sha256 = caseDigests(MEASUREMENT, [was])[c.id].label_sha256;
    const summary = summaryOf(dir);
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ ...summary, manifest }));
    writeFileSync(join(dir, "samples.jsonl"), rowsOf(dir).map((r) => `${JSON.stringify(r.id === c.id ? { ...r, severity: "churn" } : r)}\n`).join(""));
    const { out, result } = rescoreFolder(dir);
    expect(result.relabelled).toEqual([c.id]);
    expect(result.changed).toEqual([c.id]);
    expect(rowsOf(out).find((r) => r.id === c.id).severity).toBe("harmful");
    const stale = rowsOf(dir);
    expect(MEASUREMENT.summarize(stale).metrics.bad_churn.n).toBe(summary.metrics.bad_churn.n + (stale.find((r) => r.id === c.id).outcome === "error" ? 0 : 1)); // the stored rows count the case as churn
    expect(summaryOf(out).metrics).toEqual(summary.metrics); // the rescored summary counts it as harmful
    expect(summaryOf(out).manifest.cases[c.id].label_sha256).toBe(caseDigests(MEASUREMENT, [c])[c.id].label_sha256);
  });

  test("a run from before the manifest cannot be scored again: its rows lack the verdict, and the field is named", () => {
    const dir = stored({ legacy: true, without: ["verdict"] });
    expect(() => rescoreFolder(dir)).toThrow(RescoreError);
    expect(() => rescoreFolder(dir)).toThrow(/rows lack the raw output the judge-gate scorer reads: verdict \(\d+ rows?: /);
  });

  test("a summary with no manifest is scored again when its rows hold the raw output, with a manifest made from the summary", () => {
    const dir = stored({ legacy: true });
    const { out, result } = rescoreFolder(dir);
    expect(result).toMatchObject({ changed: [], legacy: true });
    const s = summaryOf(out);
    expect(manifestProblems(s.manifest)).toEqual([]);
    expect(s.manifest).toMatchObject({ corpus: "public", collector: { version: UNVERSIONED } });
  });
});

describe("rescoring a run on a custom corpus", () => {
  const CHANGED = (FIXTURE_CASES.find((c) => c.label === "bad" && c.severity === "harmful") as Case).id;
  /** A folder of your own cases inside the repository, which is where corpus_folder can name it: the public cases with one bad case relabelled churn. */
  function notes(): string {
    const inside = mkdtempSync(join(EVAL_DIR, ".custom-test-"));
    dirs.push(inside);
    mkdirSync(join(inside, "assets"));
    const cases = PUBLIC_CASES.map((c) => (c.id === CHANGED ? { ...c, severity: "churn" } : c));
    writeFileSync(join(inside, "assets", "cases.jsonl"), `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`);
    return join(inside, "assets");
  }
  const relativeFolder = (folder: string): string => `evals/judge-gate/${basename(join(folder, ".."))}/assets`;

  test("reads the cases from the corpus_folder the run recorded, from the repository root, and scores against them", () => {
    const folder = notes();
    const dir = stored({ custom: { folder: relativeFolder(folder) } });
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual([CHANGED]); // the stored row says harmful; the folder's case says churn
    expect(result.relabelled).toEqual([CHANGED]);
    expect(rowsOf(out).find((r) => r.id === CHANGED).severity).toBe("churn");
    expect(summaryOf(out)).toMatchObject({ corpus: "custom", corpus_folder: relativeFolder(folder) });
    expect(summaryOf(out).manifest.corpus).toBe("custom");
  });

  test("a folder the run could not record is named with --cases, from the root or whole, and the result records where it was read", () => {
    const folder = notes();
    const dir = () => stored({ custom: { folder: null } });
    expect(() => rescoreFolder(dir())).toThrow("was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts/rescore with --cases DIR");
    const whole = rescoreFolder(dir(), { cases: folder });
    expect(whole.result.changed).toEqual([CHANGED]);
    expect(summaryOf(whole.out).corpus_folder).toBe(relativeFolder(folder));
    expect(rescoreFolder(dir(), { cases: relativeFolder(folder) }).result.changed).toEqual([CHANGED]);
    const outside = tmp();
    cpSync(folder, join(outside, "my notes"), { recursive: true });
    const elsewhere = rescoreFolder(dir(), { cases: join(outside, "my notes") });
    expect(elsewhere.result.changed).toEqual([CHANGED]);
    expect(summaryOf(elsewhere.out).corpus_folder).toBeNull(); // outside the repository: never recorded
  });
});
