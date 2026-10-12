// scripts/rescore on reflect, the first eval on the manifest: the runs are built from the raw outputs in fixtures/ of evals/reflect/golden, scored with the
// eval's own scorer, and written as results folders. A stale run is the same run with rows another scorer gave and the manifest of that scorer.

import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunManifest, UNVERSIONED, buildManifest, caseDigests, completionOf, manifestProblems, readManifest } from "../../../lib/manifest.ts";
import { endpointId, engineSettings } from "../../../lib/provenance.ts";
import { type Case, type Raw, type Row, assetsSha256, isDefect, reflectConfig } from "../../../evals/reflect/src/lib.ts";
import { MEASUREMENT } from "../../../evals/reflect/src/measurement.ts";
import { RescoreError, readStored, rescoreFolder, rescoreRun, rescoredName } from "./lib.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const jsonl = (file: string): any[] => readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const FIXTURES = join(ROOT, "evals", "reflect", "fixtures");
const CASES: Case[] = jsonl(join(FIXTURES, "cases.jsonl"));
const RAW: { case: string; note: string; raw: Raw }[] = jsonl(join(FIXTURES, "raw.jsonl"));
const raw = (id: string, note: string): Raw => (RAW.find((l) => l.case === id && l.note === note) as { raw: Raw }).raw;
const GOOD = (c: Case): Raw => raw(c.id, isDefect(c.class) ? "the model restores what the injection took away" : "the model leaves the note alone");
const BAD = (c: Case): Raw => raw(c.id, isDefect(c.class) ? "the model proposes no change" : "the model rewrites the description and the when_to_use");
const STALE = { version: "9.9", sha256: "c".repeat(64) }; // a scorer other than the live one
const OTHER_COLLECTOR = { version: "9.9", sha256: "d".repeat(64) };
const CONFIG = reflectConfig("https://gateway.example/deployment-A/v1", "the-model", true);

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "rescore-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Spec {
  name?: string;
  raw?: (c: Case) => Raw;
  manifest?: (m: RunManifest) => RunManifest | undefined;
  rows?: (rows: Row[]) => Record<string, any>[];
  summary?: Record<string, unknown>;
}

/** A results folder of the golden cases as harness-v3 writes it. A `manifest` that returns undefined leaves the summary without one: a legacy run. */
function run(spec: Spec = {}): string {
  const scored = CASES.map((c) => MEASUREMENT.score(c, (spec.raw ?? GOOD)(c)));
  const base = buildManifest({
    measurement: MEASUREMENT,
    corpus: "public",
    cases: caseDigests(MEASUREMENT, CASES),
    akm: { version: "0.9.99-test", bin: "akm" },
    config: CONFIG,
    settings: { strategy: "reflect-only" },
    completion: completionOf(MEASUREMENT, CASES.map((c) => c.id), scored),
  });
  const dir = join(tmp(), spec.name ?? "2026-10-12-golden");
  mkdirSync(dir, { recursive: true });
  const summary: Record<string, unknown> = {
    eval: "reflect",
    corpus: "public",
    label: "golden",
    date: "2026-10-12T09:00:00.000Z",
    harness_sha256: "b".repeat(64),
    model: "the-model",
    akm_version: "0.9.99-test",
    akm_bin: "akm",
    akm_build: null,
    akm_build_fingerprint: null,
    limit: null,
    strategy: "reflect-only",
    config_patch: null,
    config: JSON.parse(JSON.stringify(CONFIG)),
    engine: engineSettings(CONFIG),
    assets_sha256: assetsSha256(join(ROOT, "evals", "reflect", "assets")),
    seed: null,
    status: "complete",
    aborted_reason: null,
    n_cases: 50,
    ...MEASUREMENT.summarize(scored),
    ...spec.summary,
  };
  const manifest = spec.manifest ? spec.manifest(base) : base;
  if (manifest !== undefined) summary.manifest = manifest;
  writeFileSync(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  writeFileSync(join(dir, "samples.jsonl"), (spec.rows ? spec.rows(scored) : scored).map((r) => `${JSON.stringify(r)}\n`).join(""));
  return dir;
}
const text = (dir: string): string => readFileSync(join(dir, "summary.json"), "utf8") + readFileSync(join(dir, "samples.jsonl"), "utf8");
const rowsOf = (dir: string): any[] => jsonl(join(dir, "samples.jsonl"));
const summaryOf = (dir: string): any => JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));

describe("rescoreFolder", () => {
  test("scores a run again into a new folder beside it, with the same rows when the scorer is the same, and leaves the original as it was", () => {
    const dir = run();
    const before = text(dir);
    const { out, result } = rescoreFolder(dir);
    expect(out).toBe(`${dir}-rescored`);
    expect(readdirSync(join(dir, "..")).sort()).toEqual(["2026-10-12-golden", "2026-10-12-golden-rescored"]);
    expect(text(dir)).toBe(before);
    expect(rowsOf(out)).toEqual(rowsOf(dir));
    expect(result).toMatchObject({ changed: [], dropped: [], relabelled: [], legacy: false });
    const s = summaryOf(out);
    const o = summaryOf(dir);
    expect(s).toMatchObject({ label: "golden-rescored", n_run: 10, metrics: o.metrics, served: o.served, n_errored: o.n_errored });
    expect(manifestProblems(s.manifest)).toEqual([]);
    expect(s.manifest.rescored_from).toMatchObject({ results: "2026-10-12-golden", dropped: [] });
    expect(s.manifest.rescored_from.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(readManifest(s).kind).toBe("manifest");
  });

  test("takes the current scorer into the manifest and keeps the collector, the cases' inputs and everything else of the run", () => {
    const dir = run({ raw: BAD, manifest: (m) => ({ ...m, scorer: STALE, collector: OTHER_COLLECTOR }) });
    const { out } = rescoreFolder(dir);
    const was = summaryOf(dir).manifest as RunManifest;
    const now = summaryOf(out).manifest as RunManifest;
    expect(now.collector).toEqual(OTHER_COLLECTOR);
    expect(now.rescored_from?.scorer).toEqual(STALE);
    expect(now.cases).toEqual(was.cases);
    expect({ ...now, scorer: null, rescored_from: null }).toEqual({ ...was, scorer: null, rescored_from: null });
    const { manifest: _a, label: _l, ...rest } = summaryOf(dir);
    const { manifest: _b, label: _m, ...rest2 } = summaryOf(out);
    expect(rest2).toEqual(rest);
  });

  test("scores the stored raw outputs with the current scorer: rows another scorer gave are replaced, and the metrics follow", () => {
    const stale = run({ raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map((r) => ({ ...r, correct: true, checks: Object.fromEntries(Object.keys(r.checks ?? {}).map((k) => [k, true])) })) });
    expect(rowsOf(stale).every((r) => r.correct === true)).toBe(true); // an older scorer called every miss right
    const { out, result } = rescoreFolder(stale);
    expect(result.changed.length).toBe(CASES.length); // every row it gave is not the current one
    expect(summaryOf(out).metrics.defects).toEqual({ n: 6, correct: 0, rate: 0 });
    expect(rowsOf(out).every((r, i) => JSON.stringify(r) === JSON.stringify(MEASUREMENT.score(CASES[i] as Case, BAD(CASES[i] as Case))))).toBe(true);
  });

  test("a run that stores its raw output only under the fields the old rows had (a legacy run) is scored again too, and gets a manifest made from its summary", () => {
    const legacy = run({ manifest: () => undefined });
    expect(readManifest(summaryOf(legacy)).kind).toBe("legacy");
    const { out, result } = rescoreFolder(legacy);
    expect(result.legacy).toBe(true);
    expect(rowsOf(out)).toEqual(rowsOf(legacy));
    const m = summaryOf(out).manifest as RunManifest;
    expect(manifestProblems(m)).toEqual([]);
    expect(m).toMatchObject({ eval: "reflect", corpus: "public", harness_version: 0, collector: { version: UNVERSIONED }, akm: { version: "0.9.99-test", bin: "akm", build: null, build_fingerprint: null }, settings: { strategy: "reflect-only", config_patch_sha256: null, timeout_ms: null, seed: null } });
    expect(m.rescored_from).toMatchObject({ results: "2026-10-12-golden", scorer: null, dropped: [] });
    expect(Object.keys(m.cases)).toEqual(CASES.map((c) => c.id));
    expect(m.completion.selected).toEqual(CASES.map((c) => c.id));
    // the engine of an old summary has the endpoint's path in it, which the rescored one does not
    expect(m.engines.reflect).toMatchObject({ endpoint: "https://gateway.example", endpoint_id: endpointId("https://gateway.example/deployment-A/v1/chat/completions") });
  });

  test("a legacy run is not scored again against cases it did not read, or when its rows lack the searches it recorded", () => {
    expect(() => rescoreFolder(run({ manifest: () => undefined, summary: { assets_sha256: "9".repeat(64) } }))).toThrow(/was made before the manifest, and cannot be scored again: it read other cases than the ones in evals\/reflect\/assets now/);
    expect(() => rescoreFolder(run({ manifest: () => undefined, summary: { retrieval_queries: { cases: 46 } } }))).toThrow("it recorded searches for the notes (--retrieval-queries)");
  });

  test("a legacy run's engine with the path is shown without it", () => {
    const old = { model: "the-model", endpoint: "https://gateway.example/k-DUMMYSECRET0123/v1/chat/completions", temperature: 0, enableThinking: false, timeoutMs: 600000 };
    const dir = run({ manifest: () => undefined, summary: { engine: { engine: "reflect", ...old, engines: { reflect: old } } } });
    const { out } = rescoreFolder(dir);
    expect(readFileSync(join(out, "summary.json"), "utf8")).not.toMatch(/DUMMYSECRET|k-DUMMY/);
    expect(summaryOf(out).engine).toMatchObject({ endpoint: "https://gateway.example", endpoint_id: endpointId(old.endpoint), engines: { reflect: { endpoint: "https://gateway.example" } } });
  });
});

describe("what a rescore refuses", () => {
  test("a run whose rows lack the raw output the scorer reads, naming the fields and the rows", () => {
    const dir = run({ rows: (rows) => rows.map((r) => (r.outcome === "proposal" ? Object.fromEntries(Object.entries(r).filter(([k]) => k !== "proposal")) : r)) });
    expect(() => rescoreFolder(dir)).toThrow(/cannot be scored again: its rows lack the raw output the reflect scorer reads: proposal \(6 rows: [a-z0-9-]+, .*\)\. Only a run that stores them can be rescored\./);
    const noOutcome = run({ rows: (rows) => rows.map(({ outcome: _o, seconds: _s, ...r }) => r) });
    expect(() => rescoreFolder(noOutcome)).toThrow("outcome (10 rows:");
    expect(() => rescoreFolder(noOutcome)).toThrow("seconds (10 rows:");
    expect(readdirSync(join(noOutcome, ".."))).toEqual(["2026-10-12-golden"]); // and writes nothing
  });

  test("an eval that declares no measurement, a manifest that is not sound, and a folder that is not a run", () => {
    const other = run({ summary: { eval: "toy" }, manifest: (m) => ({ ...m, eval: "toy" }) });
    expect(() => rescoreFolder(other)).toThrow("is a run of toy, which declares no measurement yet (it has no src/measurement.ts), so there is no scorer to score it with");
    expect(() => rescoreFolder(run({ manifest: (m) => ({ ...m, manifest_version: 9 }) }))).toThrow("has a manifest that is not sound: manifest_version is 9");
    const empty = tmp();
    expect(() => rescoreFolder(empty)).toThrow("is not a results folder: it has no summary.json");
    const running = run();
    writeFileSync(join(running, ".running"), "1\n");
    expect(() => rescoreFolder(running)).toThrow("is still being written");
    const noSamples = run();
    rmSync(join(noSamples, "samples.jsonl"));
    expect(() => readStored(noSamples)).toThrow("has no samples.jsonl");
    expect(() => rescoreFolder(join(noSamples, "summary.json"))).toThrow(RescoreError);
  });
});

describe("the cases of the corpus now", () => {
  test("a case the corpus no longer has is left out and named, in the result and in the manifest", () => {
    const dir = run({ rows: (rows) => [...rows, { ...rows[0], id: "dropped-case-01" }] });
    const { out, result } = rescoreFolder(dir);
    expect(result.dropped).toEqual(["dropped-case-01"]);
    expect(rowsOf(out).map((r) => r.id)).toEqual(CASES.map((c) => c.id));
    expect(summaryOf(out).manifest.rescored_from.dropped).toEqual(["dropped-case-01"]);
    expect(summaryOf(out)).toMatchObject({ n_run: 10 });
  });

  test("a case whose labels changed since the run is named, and its label digest in the new manifest is the current one", () => {
    const dir = run({ manifest: (m) => ({ ...m, cases: { ...m.cases, [(CASES[2] as Case).id]: { ...(m.cases[(CASES[2] as Case).id] as object), label_sha256: "e".repeat(64) } } as RunManifest["cases"] }) });
    const { out, result } = rescoreFolder(dir);
    expect(result.relabelled).toEqual([(CASES[2] as Case).id]);
    expect((summaryOf(out).manifest as RunManifest).cases).toEqual((summaryOf(run()).manifest as RunManifest).cases);
  });

  test("a case that errored stays errored, in the completion too", () => {
    const err: Raw = { outcome: "error", reason: "non_zero_exit: HTTP 503", error: "non_zero_exit: HTTP 503", seconds: 2 };
    const dir = run({ raw: (c) => (c.id === (CASES[1] as Case).id ? err : GOOD(c)) });
    const { out } = rescoreFolder(dir);
    expect(summaryOf(out)).toMatchObject({ n_run: 10, n_scored: 9, n_errored: 1 });
    expect((summaryOf(out).manifest as RunManifest).completion.errored).toEqual([(CASES[1] as Case).id]);
  });
});

describe("the name of the new folder", () => {
  test("goes before the -rN of a repeat and its collection, else at the end, and is numbered when the folder is there", () => {
    expect(rescoredName("2026-10-12-base")).toBe("2026-10-12-base-rescored");
    expect(rescoredName("2026-10-12-base-r2")).toBe("2026-10-12-base-rescored-r2");
    expect(rescoredName("2026-10-12-base-r1-library")).toBe("2026-10-12-base-rescored-r1-library");
    expect(rescoredName("2026-10-12-pr1071-r2d2")).toBe("2026-10-12-pr1071-r2d2-rescored");
    const dir = run();
    expect(rescoreFolder(dir).out).toBe(`${dir}-rescored`);
    expect(rescoreFolder(dir).out).toBe(`${dir}-rescored-2`);
    expect(rowsOf(`${dir}-rescored-2`)).toEqual(rowsOf(dir));
  });
});

describe("rescoreRun", () => {
  test("works on a run in memory and does not write anything", () => {
    const dir = run({ raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }) });
    const stored = readStored(dir);
    const result = rescoreRun(stored, { now: new Date("2026-10-13T00:00:00.000Z") });
    expect(result.summary.manifest.rescored_from.at).toBe("2026-10-13T00:00:00.000Z");
    expect(readdirSync(join(dir, ".."))).toEqual(["2026-10-12-golden"]);
  });
});

describe("the command", () => {
  const cmd = (...args: string[]) => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  test("rescores each folder, says what changed, and exits 2 when one is refused", () => {
    const stale = run({ name: "2026-10-12-stale", raw: BAD, manifest: (m) => ({ ...m, scorer: STALE }), rows: (rows) => rows.map((r) => ({ ...r, correct: true })) });
    const done = cmd(stale);
    expect(done.code).toBe(0);
    expect(done.out).toContain(`rescore: ${stale} -> ${stale}-rescored`);
    expect(done.out).toContain("10 cases scored again (manifest); 10 rows differ from the stored ones");
    const refused = cmd(stale, join(tmp(), "nothing"));
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("is not a results folder");
    expect(refused.out).toContain("-rescored-2"); // the first was still done
    expect(cmd().code).toBe(2);
    expect(cmd("--help").out).toContain("Usage: scripts/rescore/run [--cases DIR] RESULTS_DIR...");
    // it says what it does with a custom corpus that is a split of a dataset, which has no folder
    expect(cmd("--help").out).toContain('benchmarks/skillret is a split of its dataset and has no folder: its queries are drawn from the dataset files\nagain, with no --cases, and a --cases given with it has no folder to apply to and is left unused.');
  });
});

// ---- a custom corpus: where the cases of a run are (#47) ----------------------------------------------------------------------

/**
 * reflect does not read `corpus_folder` yet, so these tests use a checkout of their own with an eval called tiny, whose `loadCases` reads the cases
 * of a custom run from `summary.corpus_folder` as the contract in lib/manifest.ts says. Its cases are `{id, q, want}`, a raw output is `answer`, and
 * a row is right when the answer is what the case wants.
 */
const TINY = `export const MEASUREMENT = {
  eval: "tiny",
  version: "0.1",
  loadCases: (root, summary) => {
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = summary.corpus === "public" ? path.join(root, "evals", "tiny", "assets") : path.resolve(root, summary.corpus_folder);
    return fs.readFileSync(path.join(dir, "cases.jsonl"), "utf8").split("\\n").filter(Boolean).map((l) => JSON.parse(l));
  },
  caseId: (c) => c.id,
  input: (c) => ({ q: c.q }),
  labels: (c) => ({ want: c.want }),
  rawOf: (row) => (row.answer === undefined ? { missing: ["answer"] } : { raw: { answer: row.answer } }),
  score: (c, raw) => ({ id: c.id, answer: raw.answer, ok: raw.answer === c.want }),
  errored: () => false,
  summarize: (rows) => ({ n_run: rows.length, n_errored: 0, metrics: { ok: { n: rows.length, rate: rows.filter((r) => r.ok).length / rows.length } } }),
};
`;

describe("the cases of a run on a custom corpus", () => {
  /** The checkout, with the public cases and the folder `notes` inside it, and a folder of the same cases wanting something else outside it. */
  function checkout() {
    const root = tmp();
    const write = (file: string, text: string) => {
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, text);
    };
    write(join(root, "evals", "tiny", "src", "collect.ts"), "export const collect = 1;\n");
    write(join(root, "evals", "tiny", "src", "score.ts"), "export const score = 1;\n");
    write(join(root, "evals", "tiny", "src", "measurement.ts"), TINY);
    const cases = (want: string) => ["a", "b"].map((id) => JSON.stringify({ id, q: `q${id}`, want })).join("\n") + "\n";
    write(join(root, "evals", "tiny", "assets", "cases.jsonl"), cases("public"));
    write(join(root, "notes", "cases.jsonl"), cases("mine"));
    const outside = tmp();
    write(join(outside, "my notes", "cases.jsonl"), cases("elsewhere"));
    return { root, outside: join(outside, "my notes") };
  }

  /** A stored run of tiny whose answers were "mine"; it is a legacy run (no manifest), which is the case that needs the folder most. */
  function stored(summary: Record<string, unknown>) {
    const dir = join(tmp(), "2026-10-12-notes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ eval: "tiny", status: "complete", n_cases: 2, ...summary }));
    writeFileSync(join(dir, "samples.jsonl"), ["a", "b"].map((id) => `${JSON.stringify({ id, answer: "mine" })}\n`).join(""));
    return readStored(dir);
  }
  const rate = (r: { summary: Record<string, any> }) => r.summary.metrics.ok.rate;

  test("are read from the corpus_folder the summary records, from the repository root", () => {
    const { root } = checkout();
    const result = rescoreRun(stored({ corpus: "custom", corpus_folder: "notes" }), { root });
    expect(rate(result)).toBe(1); // the folder's cases want "mine"
    expect(result.summary.corpus_folder).toBe("notes");
    expect(rate(rescoreRun(stored({ corpus: "public", corpus_folder: null }), { root }))).toBe(0); // the public cases want something else
  });

  test("a folder outside the repository is not recorded, and --cases names it: absolute, or from the root; the result records where it was read", () => {
    const { root, outside } = checkout();
    const run = () => stored({ corpus: "custom", corpus_folder: null });
    expect(() => rescoreRun(run(), { root })).toThrow(/was made on a custom corpus outside the repository, so the folder of its cases is not known here. Give it to scripts\/rescore with --cases DIR/);
    const absolute = rescoreRun(run(), { root, cases: outside });
    expect(rate(absolute)).toBe(0); // the cases there want "elsewhere"
    expect(absolute.summary.corpus_folder).toBeNull(); // outside the repository: not recorded
    const inside = rescoreRun(run(), { root, cases: "notes" });
    expect(rate(inside)).toBe(1);
    expect(inside.summary.corpus_folder).toBe("notes");
    expect(rate(rescoreRun(run(), { root, cases: join(root, "notes") }))).toBe(1); // an absolute folder inside the repository is recorded from the root
    expect(rescoreRun(run(), { root, cases: join(root, "notes") }).summary.corpus_folder).toBe("notes");
  });

  test("--cases also names the cases of a run whose folder has moved, and of a run that predates corpus_folder", () => {
    const { root } = checkout();
    const moved = stored({ corpus: "custom", corpus_folder: "gone/notes" });
    expect(() => rescoreRun(moved, { root })).toThrow("was made on the custom corpus in gone/notes, which is not a folder here. Put it back, or give scripts/rescore its place with --cases DIR");
    expect(rate(rescoreRun(moved, { root, cases: "notes" }))).toBe(1);
    expect(rescoreRun(moved, { root, cases: "notes" }).summary.corpus_folder).toBe("notes");
    const before = stored({ corpus: "custom" }); // a custom run that did not record the field
    expect(() => rescoreRun(before, { root })).toThrow(/was made on a custom corpus and does not record where, so the folder of its cases is not known here/);
    expect(rate(rescoreRun(before, { root, cases: "notes" }))).toBe(1);
    // a file is no folder
    expect(() => rescoreRun(before, { root, cases: "notes/cases.jsonl" })).toThrow("which is not a folder here");
  });

  test("a run on the public corpus has no folder to name, and a run from before the corpora were renamed is read as it was", () => {
    const { root } = checkout();
    expect(() => rescoreRun(stored({ corpus: "public" }), { root, cases: "notes" })).toThrow('was made on the "public" corpus, and --cases names the folder of a custom one');
    // `private` and `own` runs have their cases where the eval put them; --cases can name them too
    for (const corpus of ["private", "own", "own-feedback"]) expect(rate(rescoreRun(stored({ corpus }), { root, cases: "notes" })), corpus).toBe(1);
  });

  test("the command passes --cases on, and refuses an empty one", () => {
    const dir = run(); // a run of the golden cases on the public corpus
    const cmd = (...args: string[]) => {
      const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
      return { code: done.exitCode, err: done.stderr.toString() };
    };
    const given = cmd("--cases", "private/reflect/assets", dir);
    expect(given.code).toBe(2);
    expect(given.err).toContain('was made on the "public" corpus, and --cases names the folder of a custom one');
    expect(cmd("--cases", " ", dir)).toMatchObject({ code: 2, err: expect.stringContaining("--cases needs a folder") });
  });
});

// ---- a custom corpus that is a split of a dataset: skillret's train split has no folder -----------------------------------------------------

describe("the custom corpus of skillret, a split of its dataset (no folder)", () => {
  /**
   * A checkout of its own with skillret's code and the lock of this one, through links, and a dataset of a few skills and queries in assets/ where the
   * benchmark's data files are fetched to. The train queries are drawn from it as a run draws them, so the cases of a custom run are there to be read.
   */
  async function checkout() {
    const root = tmp();
    mkdirSync(join(root, "benchmarks", "skillret", "assets"), { recursive: true });
    symlinkSync(join(ROOT, "lib"), join(root, "lib"));
    symlinkSync(join(ROOT, "benchmarks", "skillret", "src"), join(root, "benchmarks", "skillret", "src"));
    const assets = join(root, "benchmarks", "skillret", "assets");
    const lines = (rows: object[]) => rows.map((r) => `${JSON.stringify(r)}\n`).join("");
    const skills = (prefix: string) => ["1", "2", "3"].map((n) => ({ id: `${prefix}${n}`, skill_md: `---\nname: ${prefix}${n}\n---\nA skill.` }));
    const queries = (prefix: string, skill: string) => [
      { id: `${prefix}1`, query: "one", skill_ids: [`${skill}1`] },
      { id: `${prefix}2`, query: "two", skill_ids: [`${skill}2`] },
      { id: `${prefix}3`, query: "three", skill_ids: [`${skill}2`, `${skill}3`] },
    ];
    const qrels = (prefix: string, skill: string) => [[`${prefix}1`, `${skill}1`], [`${prefix}2`, `${skill}2`], [`${prefix}3`, `${skill}2`], [`${prefix}3`, `${skill}3`]].map(([query_id, skill_id]) => ({ query_id, skill_id, relevance: 1 }));
    const files: Record<string, object[]> = { "test-skills.jsonl": skills("t"), "test-queries.jsonl": queries("q", "t"), "test-qrels.jsonl": qrels("q", "t"), "train-skills.jsonl": skills("s"), "train-queries.jsonl": queries("a", "s"), "train-qrels.jsonl": qrels("a", "s") };
    for (const [name, rows] of Object.entries(files)) writeFileSync(join(assets, name), lines(rows));
    const locked = Object.fromEntries(Object.entries(files).map(([name, rows]) => [name, { url: `https://example.test/${name}`, bytes: 1, sha256: "a".repeat(64), records: rows.length }]));
    writeFileSync(join(assets, "ASSETS.lock"), JSON.stringify({ dataset: "tiny", paper: "", source: "", licence: "", revision: "r", files: locked }));
    const { MEASUREMENT } = (await import(join(root, "benchmarks", "skillret", "src", "measurement.ts"))) as { MEASUREMENT: any };
    return { root, MEASUREMENT };
  }

  /** The stored run of the split: every query found first by both lines, with the manifest of the scorer `scorer` and, optionally, scores another scorer gave. */
  function stored(M: any, root: string, scorer?: { version: string; sha256: string }, wrongScores = false) {
    const summary0 = { corpus: "custom", corpus_folder: null, sample: { limit: null } };
    const cases = M.loadCases(root, summary0);
    const raws = cases.map((q: any) => ({ search: { ranked: [...q.relevant, "x"], seconds: 1 }, semantic_search: { ranked: [...q.relevant, "x"], seconds: 2 } }));
    const rows = cases.map((q: any, i: number) => M.score(q, raws[i]));
    const written = wrongScores ? rows.map((r: any) => ({ ...r, search: { ...r.search, scores: { ...r.search.scores, "NDCG@10": 0.123 } } })) : rows;
    const manifest = buildManifest({ measurement: M, corpus: "custom", cases: caseDigests(M, cases), akm: { version: "0.9.99-test", bin: "akm" }, settings: { seed: "42" }, completion: completionOf(M, cases.map((q: any) => q.id), rows) });
    if (scorer) manifest.scorer = scorer; // a run from before the version was set by hand
    const dir = join(tmp(), "2026-10-12-split");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ eval: "skillret", ...summary0, label: "split", seed: "42", status: "complete", ...M.summarize(written), manifest }));
    writeFileSync(join(dir, "samples.jsonl"), written.map((r: any) => `${JSON.stringify(r)}\n`).join(""));
    return { dir, cases, rows };
  }

  test("is scored again from the dataset files, with no folder recorded and none asked for", async () => {
    const { root, MEASUREMENT: M } = await checkout();
    const { dir, cases, rows } = stored(M, root);
    expect(cases.map((q: any) => q.id)).toEqual(["a1", "a2", "a3"]); // the train queries, drawn as a run draws them
    const result = rescoreRun(readStored(dir), { root });
    expect(result).toMatchObject({ dropped: [], changed: [], relabelled: [], legacy: false });
    expect(result.rows).toEqual(rows);
    expect(result.summary).toMatchObject({ corpus: "custom", corpus_folder: null });
    expect(manifestProblems(result.summary.manifest)).toEqual([]);
    expect(result.summary.manifest).toMatchObject({ corpus: "custom", rescored_from: { results: "2026-10-12-split", dropped: [] } });
    // and into a folder beside the original, as the command does
    const { out } = rescoreFolder(dir, { root });
    expect(out).toBe(`${dir}-rescored`);
    expect(summaryOf(out)).toMatchObject({ corpus: "custom", corpus_folder: null });
  });

  test("a run scored by an older scorer is scored again with the current one, from the ranked results", async () => {
    const { root, MEASUREMENT: M } = await checkout();
    const older = { version: "9.9", sha256: "c".repeat(64) };
    const { dir, rows } = stored(M, root, older, true);
    expect(rowsOf(dir).every((r) => r.search.scores["NDCG@10"] === 0.123)).toBe(true);
    const result = rescoreRun(readStored(dir), { root });
    expect(result.changed).toEqual(["a1", "a2", "a3"]);
    expect(result.rows).toEqual(rows);
    expect(result.summary.manifest.rescored_from.scorer).toEqual(older);
  });

  test("a --cases given with it, as the benchmark's README used to say, has no folder to apply to: the run is scored the same, and no folder is recorded", async () => {
    const { root, MEASUREMENT: M } = await checkout();
    const { dir, rows } = stored(M, root);
    const result = rescoreRun(readStored(dir), { root, cases: "benchmarks/skillret/assets" });
    expect(result.rows).toEqual(rows);
    expect(result.summary).toMatchObject({ corpus: "custom", corpus_folder: null });
  });

  test("the data files not being there is a refusal that names them, as it is for the public corpus", async () => {
    const { root, MEASUREMENT: M } = await checkout();
    const { dir } = stored(M, root);
    rmSync(join(root, "benchmarks", "skillret", "assets", "train-queries.jsonl"));
    expect(() => rescoreRun(readStored(dir), { root })).toThrow(/the cases .* was scored against cannot be read: train-queries\.jsonl is not in .*benchmarks\/skillret\/assets\. A run of benchmarks\/skillret fetches them\./);
  });
});
