// The declaration of the extract eval (measurement.ts): the digests of a case, the corpus a stored run is scored against again, and scripts/rescore on a
// stored run. The stored runs are built from the raw outputs in fixtures/ of ../fixtures, one case each, scored with the eval's own scorer.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { RescoreError, rescoreFolder } from "../../../scripts/rescore/src/lib.ts";
import { buildManifest, caseDigests, completionOf, manifestProblems, readManifest } from "../../../lib/manifest.ts";
import { sha256Json } from "../../../lib/provenance.ts";
import { type LoadedCase, type Raw, type Row, assetsDigest, extractConfig, loadCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const EVAL_DIR = join(import.meta.dir, "..");
const PUBLIC = join(EVAL_DIR, "assets");
const FIXTURES = join(import.meta.dir, "..", "fixtures");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const LINES: { case: string; note: string; raw: Record<string, any> }[] = jsonl(join(FIXTURES, "raw.jsonl"));
const PUBLIC_CASES = loadCases(PUBLIC);
/** The public cases the golden files cover, with the first raw output of each. */
const FIXTURE_CASES = jsonl(join(FIXTURES, "cases.jsonl")).map((g) => PUBLIC_CASES.find((c) => c.id === g.id) as LoadedCase);
const FIRST = (c: LoadedCase): Raw => (MEASUREMENT.rawOf({ id: c.id, ...(LINES.find((l) => l.case === c.id) as { raw: Record<string, any> }).raw }) as { raw: Raw }).raw;

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "extract-measurement-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A results folder of the golden cases, as harness-v3 writes it. */
function stored(options: { without?: string[]; name?: string; custom?: { folder: string | null; digest?: string }; before45?: string } = {}): string {
  const custom = options.custom;
  // `before45` is the note of a raw output of planted-01 to store in place of the first, as the scorer before #45 (which had no `ambiguous`) scored it
  const raw = (c: LoadedCase): Raw => (options.before45 !== undefined && c.id === "planted-01" ? (MEASUREMENT.rawOf({ id: c.id, ...(LINES.find((l) => l.case === c.id && l.note === options.before45) as { raw: Record<string, any> }).raw }) as { raw: Raw }).raw : FIRST(c));
  const rows = FIXTURE_CASES.map((c) => MEASUREMENT.score(c, raw(c)));
  const config = extractConfig("https://gateway.example/deployment-A/v1", "the-model", true);
  const dir = join(tmp(), options.name ?? "2026-10-12-golden");
  mkdirSync(dir, { recursive: true });
  const summary: Record<string, unknown> = {
    eval: "extract",
    corpus: custom ? "custom" : "public",
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
    strategy: "extract-only",
    config_patch: null,
    config: JSON.parse(JSON.stringify(config)),
    assets_sha256: assetsDigest(PUBLIC, PUBLIC_CASES),
    seed: null,
    status: "complete",
    aborted_reason: null,
    n_cases: PUBLIC_CASES.length,
    ...MEASUREMENT.summarize(rows),
  };
  if (options.before45 !== undefined) delete (summary.metrics as { planted: { ambiguous?: number } }).planted.ambiguous;
  summary.manifest = buildManifest({
    measurement: MEASUREMENT,
    corpus: custom ? "custom" : "public",
    cases: caseDigests(MEASUREMENT, FIXTURE_CASES),
    akm: { version: "0.9.99-test", bin: "akm" },
    config,
    settings: { strategy: "extract-only" },
    completion: completionOf(MEASUREMENT, FIXTURE_CASES.map((c) => c.id), rows),
  });
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  const kept = (r: Row) => Object.fromEntries(Object.entries(r).filter(([k]) => !(options.without ?? []).includes(k) && !(options.before45 !== undefined && k === "ambiguous")));
  writeFileSync(join(dir, "samples.jsonl"), rows.map((r) => `${JSON.stringify(kept(r))}\n`).join(""));
  return dir;
}
const rowsOf = (dir: string): any[] => jsonl(join(dir, "samples.jsonl"));
const summaryOf = (dir: string): any => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

describe("the digests of a case", () => {
  const one = (id: string): LoadedCase => PUBLIC_CASES.find((c) => c.id === id) as LoadedCase;

  test("a session that changes changes input_sha256 and not label_sha256, and a label that changes does the opposite", () => {
    const c = one("insight-01");
    const digest = (x: LoadedCase) => caseDigests(MEASUREMENT, [x])[x.id];
    const was = digest(c);
    expect(digest({ ...c, session: `${c.session}\n` })).toEqual({ input_sha256: expect.not.stringMatching(was.input_sha256), label_sha256: was.label_sha256 });
    expect(digest({ ...c, project: "-home-dev-other" })).toEqual({ input_sha256: expect.not.stringMatching(was.input_sha256), label_sha256: was.label_sha256 });
    expect(digest({ ...c, required: [...c.required, ["a new fact"]] })).toEqual({ input_sha256: was.input_sha256, label_sha256: expect.not.stringMatching(was.label_sha256) });
    expect(digest({ ...c, good: "Another good example." })).toEqual({ input_sha256: was.input_sha256, label_sha256: expect.not.stringMatching(was.label_sha256) });
    expect(digest({ ...c, note: "Another note, which no check reads.", bad: "Another bad example, which no check reads." })).toEqual(was);
    expect(was.input_sha256).toBe(sha256Json({ id: c.id, project: c.project, session: c.session }));
  });
});

describe("the corpus a stored run is scored against again", () => {
  /** A repository root with the public assets copied to the folders a run could have read. */
  function repo(): string {
    const root = tmp();
    for (const dir of [join("evals", "extract", "assets"), join("private", "extract", "assets"), join("private", "extract", "own")]) cpSync(PUBLIC, join(root, dir), { recursive: true });
    return root;
  }
  const ids = (cases: LoadedCase[]) => cases.map((c) => c.id);

  test("public is the committed cases, private (a run from before the corpora were renamed) the seeded rewrite, and a custom corpus the folder it recorded", () => {
    const root = repo();
    const expected = ids(PUBLIC_CASES);
    expect(ids(MEASUREMENT.loadCases(root, { corpus: "public" }))).toEqual(expected);
    expect(ids(MEASUREMENT.loadCases(root, { corpus: "private" }))).toEqual(expected);
    expect(ids(MEASUREMENT.loadCases(root, { corpus: "custom", corpus_folder: join("private", "extract", "own") }))).toEqual(expected);
    expect(ids(MEASUREMENT.loadCases(root, { corpus: "custom", corpus_folder: join(root, "private", "extract", "own") }))).toEqual(expected); // a folder named whole, as --cases would
  });

  test("a custom corpus that recorded no folder says how to name it", () => {
    expect(() => MEASUREMENT.loadCases(repo(), { corpus: "custom", corpus_folder: null })).toThrow("did not record the folder of its custom corpus (it was outside the repository). Give the folder to scripts/rescore with --cases DIR");
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
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [] });
    const [s, o] = [summaryOf(out), summaryOf(dir)];
    expect(s).toMatchObject({ label: "golden-rescored", n_run: FIXTURE_CASES.length, metrics: o.metrics, n_errored: o.n_errored, timeouts: o.timeouts });
    expect(manifestProblems(s.manifest)).toEqual([]);
    expect(readManifest(s).kind).toBe("manifest");
    expect(s.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", dropped: [] });
  });

  test("every row a real run stores gives the raw output the scorer needs, and scored again it is the same row", () => {
    const rows = LINES.map((l) => ({ line: l, row: MEASUREMENT.score(PUBLIC_CASES.find((c) => c.id === l.case) as LoadedCase, (MEASUREMENT.rawOf({ id: l.case, ...l.raw }) as { raw: Raw }).raw) }));
    for (const { line, row } of rows) {
      const read = MEASUREMENT.rawOf(row);
      expect("raw" in read).toBe(true);
      expect(MEASUREMENT.score(PUBLIC_CASES.find((c) => c.id === line.case) as LoadedCase, (read as { raw: Raw }).raw)).toEqual(row);
    }
  });

  test("a run whose rows lack the raw output is refused, with the fields named", () => {
    const dir = stored({ without: ["saved", "detail"] });
    expect(() => rescoreFolder(dir)).toThrow(RescoreError);
    expect(() => rescoreFolder(dir)).toThrow(/rows lack the raw output the extract scorer reads: detail \(11 rows: .*\); saved \(11 rows: /);
  });
});

describe("a run stored before the fix to the negation rule (#45)", () => {
  const NOTE = "the memory states the fix and holds the instruction behind do not think we should";

  test("is scored again to the new verdict: the case is flagged ambiguous, the count is in the metrics, and nothing else changes", () => {
    const dir = stored({ before45: NOTE });
    const was = rowsOf(dir).find((r) => r.id === "planted-01");
    expect(was).not.toHaveProperty("ambiguous"); // as the scorer before #45 stored it
    expect(was).toMatchObject({ correct: true, forbidden: [] });
    expect(summaryOf(dir).metrics.planted).toEqual({ n: 4, correct: expect.any(Number), rate: expect.any(Number), saved_instruction: expect.any(Number) });
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toHaveLength(rowsOf(dir).length); // every row gains the field
    const [before, after] = [rowsOf(dir), rowsOf(out)];
    const withoutField = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== "ambiguous"));
    expect(after.map(withoutField)).toEqual(before.map(withoutField)); // and no verdict changes: correct, forbidden and missing are as they were
    expect(after.find((r) => r.id === "planted-01").ambiguous).toEqual(["always skip"]);
    expect(after.filter((r) => r.id !== "planted-01").every((r) => Array.isArray(r.ambiguous) && r.ambiguous.length === 0)).toBe(true);
    const [planted, stored45] = [summaryOf(out).metrics.planted, summaryOf(dir).metrics.planted];
    expect(planted).toEqual({ ...stored45, ambiguous: 1 });
  });

  test("the command scripts/rescore does the same, and says how many rows differ", () => {
    const dir = stored({ before45: NOTE });
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "..", "..", "..", "scripts", "rescore", "src", "run.ts"), dir], { stdout: "pipe", stderr: "pipe" });
    expect(done.exitCode).toBe(0);
    expect(done.stdout.toString()).toContain(`${rowsOf(dir).length} cases scored again;`);
    expect(rowsOf(`${dir}-rescored`).find((r) => r.id === "planted-01").ambiguous).toEqual(["always skip"]);
  });
});

describe("rescoring a run on a custom corpus", () => {
  /** A folder of your own cases inside the repository, which is where corpus_folder can name it: the public cases with a new fact required of insight-01. */
  function notes(): string {
    const inside = mkdtempSync(join(EVAL_DIR, ".custom-test-"));
    dirs.push(inside);
    cpSync(PUBLIC, join(inside, "assets"), { recursive: true });
    const file = join(inside, "assets", "cases.json");
    const cases = JSON.parse(readFileSync(file, "utf8"));
    cases.find((c: { id: string }) => c.id === "insight-01").required.push(["a new fact"]);
    writeFileSync(file, JSON.stringify(cases));
    return join(inside, "assets");
  }
  const relativeFolder = (folder: string): string => `evals/extract/${basename(join(folder, ".."))}/assets`;

  test("reads the cases from the corpus_folder the run recorded, from the repository root, and scores against them", () => {
    const folder = notes();
    const dir = stored({ custom: { folder: relativeFolder(folder) } });
    const { out, result } = rescoreFolder(dir);
    expect(result.changed).toEqual(["insight-01"]); // the stored row was right under the public label; the folder's case wants a new fact
    expect(rowsOf(out).find((r) => r.id === "insight-01")).toMatchObject({ correct: false, missing: ["a new fact"] });
    expect(summaryOf(out)).toMatchObject({ corpus: "custom", corpus_folder: relativeFolder(folder) });
    expect(summaryOf(out).manifest.corpus).toBe("custom");
  });

  test("a folder the run could not record is named with --cases, from the root or whole, and the result records where it was read", () => {
    const folder = notes();
    const dir = () => stored({ custom: { folder: null } });
    expect(() => rescoreFolder(dir())).toThrow("was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts/rescore with --cases DIR");
    const whole = rescoreFolder(dir(), { cases: folder });
    expect(whole.result.changed).toEqual(["insight-01"]);
    expect(summaryOf(whole.out).corpus_folder).toBe(relativeFolder(folder));
    const fromRoot = rescoreFolder(dir(), { cases: relativeFolder(folder) });
    expect(fromRoot.result.changed).toEqual(["insight-01"]);
    const outside = tmp();
    cpSync(folder, join(outside, "my notes"), { recursive: true });
    const elsewhere = rescoreFolder(dir(), { cases: join(outside, "my notes") });
    expect(elsewhere.result.changed).toEqual(["insight-01"]);
    expect(summaryOf(elsewhere.out).corpus_folder).toBeNull(); // outside the repository: never recorded
  });
});
