import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type RunManifest, buildManifest, caseDigests } from "../../../lib/manifest.ts";
import { loadCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";
import { actual, judgedLessons, namesReusable, readScores, report, route } from "./pass-bar.ts";

const s = (reusable: number, nonRedundancy: number, grounding: number) => ({ reusable, nonRedundancy, grounding });

describe("route", () => {
  test("the shipped bar passes a lesson whose reusable and nonRedundancy are 4 or more, whatever its grounding is above 2", () => {
    expect(route(s(5, 5, 5), "shipped")).toBe("pass");
    expect(route(s(5, 4, 3), "shipped")).toBe("pass"); // "one stretches what the source says"
    expect(route(s(5, 5, 4), "with-grounding")).toBe("pass");
    expect(route(s(5, 5, 3), "with-grounding")).toBe("review");
  });

  test("a score of 2 or less on any criterion rejects, grounding included, under both bars", () => {
    for (const bar of ["shipped", "with-grounding"] as const) {
      expect(route(s(5, 5, 2), bar)).toBe("reject");
      expect(route(s(2, 5, 5), bar)).toBe("reject");
      expect(route(s(5, 1, 5), bar)).toBe("reject");
    }
  });

  test("otherwise a mean of the counted criteria of 2.5 or more is review, and a lower one rejects", () => {
    expect(route(s(4, 3, 5), "shipped")).toBe("review");
    expect(route(s(3, 3, 5), "shipped")).toBe("review");
    expect(route(s(3, 3, 3), "with-grounding")).toBe("review");
  });
});

describe("actual", () => {
  test("reads the verdict akm gave from the outcome and the gate", () => {
    expect(actual({ outcome: "rejected", gate: null })).toBe("reject");
    expect(actual({ outcome: "lesson", gate: "deferred/distill-review" })).toBe("pass");
    expect(actual({ outcome: "lesson", gate: "deferred/quality-review" })).toBe("review");
    expect(actual({ outcome: "skipped", gate: null })).toBeUndefined();
  });
});

describe("report", () => {
  test("counts good and bad lessons by verdict under each bar, and the lessons the bars treat differently", () => {
    const r = report([
      { id: "a", scores: s(5, 5, 5), actual: "pass", good: true },
      { id: "b", scores: s(5, 5, 3), actual: "pass", good: false },
      { id: "c", scores: s(5, 5, 2), actual: "reject", good: false },
      { id: "d", scores: s(5, 5, 3), actual: "pass", good: true },
    ]);
    expect(r.n).toBe(4);
    expect(r.mismatch).toBe(0);
    expect(r.bars.shipped).toEqual({ pass: { good: 2, bad: 1 }, review: { good: 0, bad: 0 }, reject: { good: 0, bad: 1 } });
    expect(r.bars["with-grounding"]).toEqual({ pass: { good: 1, bad: 0 }, review: { good: 1, bad: 1 }, reject: { good: 0, bad: 1 } });
    expect(r.differ.map((d) => [d.id, d.shipped, d["with-grounding"]])).toEqual([["b", "pass", "review"], ["d", "pass", "review"]]);
  });

  test("counts a lesson whose recorded verdict is not the shipped bar's as a mismatch", () => {
    expect(report([{ id: "a", scores: s(5, 5, 5), actual: "review", good: true }]).mismatch).toBe(1);
    expect(report([{ id: "a", scores: s(5, 5, 5), good: true }]).mismatch).toBe(0);
  });
});

describe("readScores", () => {
  test("reads reusable as it is, and novelty as reusable for an akm before 0.9.27-alpha.2 (#61)", () => {
    expect(readScores({ reusable: 4, nonRedundancy: 5, grounding: 3 }, "c", "0.9.27-alpha.2")).toEqual(s(4, 5, 3));
    expect(readScores({ reusable: 4, nonRedundancy: 5, grounding: 3 }, "c", "0.10.0")).toEqual(s(4, 5, 3));
    for (const version of ["0.9.26", "0.9.27-alpha.1", "0.9.9", "0.8.0"]) expect(readScores({ novelty: 4, nonRedundancy: 5, grounding: 3 }, "c", version), version).toEqual(s(4, 5, 3));
    expect(readScores(null, "c", "0.9.26")).toBeUndefined();
  });

  test("refuses scores it cannot read, naming the release the rename is in, whatever the version", () => {
    const novelty = { novelty: 4, nonRedundancy: 5, grounding: 3 };
    for (const version of ["0.9.27-alpha.2", "0.9.27", "0.10.0"]) expect(() => readScores(novelty, "claim-01", version), version).toThrow(/scores of the case claim-01 are grounding, nonRedundancy, novelty.*from akm 0\.9\.27-alpha\.2.*akm .* names it reusable/);
    expect(() => readScores(novelty, "claim-01", null)).toThrow(/an akm whose version the summary does not record/);
    expect(() => readScores(novelty, "claim-01", "not a version")).toThrow("before akm 0.9.27-alpha.2 it is called novelty");
    expect(() => readScores({ reusable: 4 }, "claim-01", "0.9.26")).toThrow("scores of the case claim-01 are reusable, and this tool reads");
    expect(() => readScores({}, "claim-01", "0.9.26")).toThrow("are empty");
  });

  test("namesReusable puts the boundary at 0.9.27-alpha.2", () => {
    expect([null, "0.9.26", "0.9.27-alpha.1", "0.9.27-alpha.2", "0.9.27-beta.1", "0.9.27", "0.10.0", "x"].map(namesReusable)).toEqual([null, false, false, true, true, true, true, null]);
  });
});

describe("judgedLessons", () => {
  const REAL = join(import.meta.dir, "..", "assets");
  const IDS = ["lesson-01", "lesson-02", "status-01", "upd-01"];
  const PUBLIC = join("evals", "distill", "assets");
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const temp = (): string => {
    const d = mkdtempSync(join(tmpdir(), "pass-bar-"));
    dirs.push(d);
    return d;
  };
  type Raw = Record<string, any>;
  const realCases = (): Raw[] => JSON.parse(readFileSync(join(REAL, "cases.json"), "utf8"));

  /** A repository holding four of the public cases (a lesson case, an over-claim case's neighbour, one that expects none and an update), with their bundles. */
  function repo() {
    const root = temp();
    const assets = join(root, PUBLIC);
    const cases = realCases().filter((c) => IDS.includes(c.id));
    mkdirSync(join(assets, "bundles"), { recursive: true });
    for (const c of cases) cpSync(join(REAL, "bundles", c.id), join(assets, "bundles", c.id), { recursive: true });
    const write = (list: Raw[] = cases, folder = assets) => {
      mkdirSync(folder, { recursive: true });
      writeFileSync(join(folder, "cases.json"), `${JSON.stringify(list, null, 2)}\n`);
    };
    write();
    return { root, assets, cases, write };
  }

  const NEW = { reusable: 5, nonRedundancy: 5, grounding: 5 }; // akm 0.9.27-alpha.2 and later
  const OLD = { novelty: 5, nonRedundancy: 5, grounding: 5 }; // akm 0.9.26
  const base = { outcome: "lesson", gate: "deferred/distill-review", scores: NEW, lesson: null, rejected_lesson: null };
  /** The rows of a run: the good example for lesson-01, the bad one for lesson-02, a lesson for a case that expects none, an update (which is not judged here), and a row with no scores. */
  const rowsOf = (cases: Raw[], scores: Raw = NEW) => {
    const by = (id: string) => cases.find((c) => c.id === id) as Raw;
    return [
      { ...base, scores, id: "lesson-01", class: "lesson-worthy", lesson: by("lesson-01").good },
      { ...base, scores, id: "lesson-02", class: "lesson-worthy", lesson: by("lesson-02").bad },
      { ...base, scores, id: "status-01", class: "dated-status", lesson: "Playwright polls for a heading." },
      { ...base, scores, id: "upd-01", class: "lesson-update", lesson: "An update." },
      { ...base, id: "lesson-01", class: "lesson-worthy", outcome: "none", gate: null, scores: null },
    ];
  };
  /** The manifest a run of these cases would write, scored by the scorer here, for an akm of this version. */
  function manifestOf(assets: string, version: string | null = "0.9.27-alpha.2"): RunManifest {
    const cases = loadCases(assets);
    const ids = cases.map((c) => c.id);
    return buildManifest({ measurement: MEASUREMENT, corpus: "public", cases: caseDigests(MEASUREMENT, cases), akm: { version }, completion: { selected: ids, scored: ids, errored: [] } });
  }
  /** The distill run of those cases: a summary.json, with `over` laid on it, and samples.jsonl. A manifest of null is a run from before the manifest. */
  function runOf(root: string, assets: string, over: Record<string, unknown> = {}, rows: object[] = rowsOf(realCases()), manifest: RunManifest | null = manifestOf(assets)): string {
    const run = join(root, "run");
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, "summary.json"), JSON.stringify({ eval: "distill", corpus: "public", akm_version: manifest?.akm.version ?? "0.9.26", ...(manifest ? { manifest } : {}), ...over }));
    writeFileSync(join(run, "samples.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
    return run;
  }
  const goodness = (r: { judged: { id: string; good: boolean }[] }) => r.judged.map((j) => [j.id, j.good]);

  test("judges the lessons of a run that was scored by this scorer against these cases, and reports the inputs", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets);
    const r = judgedLessons(run, { root });
    expect(goodness(r)).toEqual([["lesson-01", true], ["lesson-02", false], ["status-01", false]]);
    expect(r.skipped).toBe(1); // the update, which is not judged
    expect(r.noScores).toBe(1); // the row with no scores
    expect(r.inputs).toEqual({ mode: "stored", corpus: "public", assets: PUBLIC, manifest: "manifest", akm_version: "0.9.27-alpha.2", judge_first_criterion: "reusable", differences: [], changed_cases: [], missing_cases: [] });
  });

  test("a run of akm 0.9.26, whose judge names the first criterion novelty, is judged with novelty as reusable, and says so (#61)", () => {
    const { root, assets, cases } = repo();
    const rows = rowsOf(cases, { novelty: 4, nonRedundancy: 2, grounding: 5 });
    for (const manifest of [manifestOf(assets, "0.9.26"), null]) {
      const run = runOf(root, assets, { akm_version: "0.9.26" }, rows, manifest);
      const r = judgedLessons(run, { root, rescore: manifest === null });
      expect(goodness(r)).toEqual([["lesson-01", true], ["lesson-02", false], ["status-01", false]]);
      expect(r.judged.map((j) => j.scores)).toEqual([s(4, 2, 5), s(4, 2, 5), s(4, 2, 5)]);
      expect(r.inputs).toMatchObject({ akm_version: "0.9.26", judge_first_criterion: "novelty" });
      expect(report(r.judged).n).toBe(3); // and not 0
    }
  });

  test("the rename is read by release: novelty before 0.9.27-alpha.2, reusable from it, and a mismatch is refused naming the release", () => {
    const { root, assets, cases } = repo();
    const novelty = rowsOf(cases, OLD);
    const reusable = rowsOf(cases, NEW);
    for (const version of ["0.9.26", "0.9.27-alpha.1"]) expect(judgedLessons(runOf(root, assets, {}, novelty, manifestOf(assets, version)), { root }).judged, version).toHaveLength(3);
    for (const version of ["0.9.27-alpha.2", "0.9.27", "0.10.0"]) expect(judgedLessons(runOf(root, assets, {}, reusable, manifestOf(assets, version)), { root }).judged, version).toHaveLength(3);
    for (const version of ["0.9.27-alpha.2", "0.10.0"]) expect(() => judgedLessons(runOf(root, assets, {}, novelty, manifestOf(assets, version)), { root }), version).toThrow(/from akm 0\.9\.27-alpha\.2/);
    // reusable scores in a run of an old akm are read as they are (a patched akm, a backport)
    expect(judgedLessons(runOf(root, assets, {}, reusable, manifestOf(assets, "0.9.26")), { root }).judged).toHaveLength(3);
  });

  test("a run whose akm version is not recorded cannot be read with novelty, and is read with reusable", () => {
    const { root, assets, cases } = repo();
    const legacy = (rows: object[]) => runOf(root, assets, { akm_version: undefined }, rows, null);
    expect(() => judgedLessons(legacy(rowsOf(cases, OLD)), { root, rescore: true })).toThrow(/an akm whose version the summary does not record/);
    expect(judgedLessons(legacy(rowsOf(cases, NEW)), { root, rescore: true }).judged).toHaveLength(3);
  });

  test("a run is never reported as empty for want of a name: scores that cannot be read stop it, and a run with nothing to judge exits 1 with a message", () => {
    const { root, assets, cases } = repo();
    expect(() => judgedLessons(runOf(root, assets, {}, rowsOf(cases, { clarity: 5, nonRedundancy: 5, grounding: 5 }), manifestOf(assets, "0.9.26")), { root })).toThrow(/scores of the case lesson-01 are clarity, grounding, nonRedundancy.*novelty/);
    expect(() => judgedLessons(runOf(root, assets, {}, rowsOf(cases, { novelty: 5 }), manifestOf(assets, "0.9.26")), { root })).toThrow("reads reusable, nonRedundancy and grounding");
  });

  test("the digests are the ones the run records: the input and the labels of each case, from lib/manifest.ts", () => {
    const { root, assets } = repo();
    const m = manifestOf(assets);
    expect(Object.keys(m.cases)).toEqual(IDS);
    expect(judgedLessons(runOf(root, assets), { root }).inputs.differences).toEqual([]);
  });

  test("unchanged artifacts are judged identically after an unrelated corpus regeneration", () => {
    const { root, assets, cases, write } = repo();
    const run = runOf(root, assets);
    const first = judgedLessons(run, { root });
    // The private corpus is made again, a file is added beside the public cases, and the public file is written out again with the same bytes.
    write(cases.map((c) => ({ ...c, note: `${c.note} (rewritten)` })), join(root, "private", "distill", "assets"));
    writeFileSync(join(assets, "README.md"), "Notes about the cases.\n");
    const file = join(assets, "cases.json");
    const text = readFileSync(file, "utf8");
    rmSync(file);
    writeFileSync(file, text);
    expect(judgedLessons(run, { root })).toEqual(first);
  });

  test("a case whose labels changed since the run stops the read, naming it, and is judged by the new labels only with --rescore", () => {
    const { root, assets, cases, write } = repo();
    const run = runOf(root, assets);
    expect(goodness(judgedLessons(run, { root }))[0]).toEqual(["lesson-01", true]);
    write(cases.map((c) => (c.id === "lesson-01" ? { ...c, required: [...c.required, ["a fact the lesson never states"]] } : c)));
    const said = "the case lesson-01 has another input or other labels than when the run was made";
    expect(() => judgedLessons(run, { root })).toThrow(said);
    expect(() => judgedLessons(run, { root })).toThrow("add --rescore");
    const rescored = judgedLessons(run, { root, rescore: true });
    expect(goodness(rescored)[0]).toEqual(["lesson-01", false]);
    expect(rescored.inputs).toMatchObject({ mode: "rescore", changed_cases: ["lesson-01"], missing_cases: [] });
    expect(rescored.inputs.differences).toHaveLength(1);
    expect(rescored.inputs.differences[0]).toContain(said);
  });

  test("a memory that changed since the run is a change of the case's input", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets);
    const memories = join(assets, "bundles", "lesson-01", "memories");
    const memory = join(memories, readdirSync(memories)[0] as string);
    writeFileSync(memory, `${readFileSync(memory, "utf8")}\nA line added since.\n`);
    expect(() => judgedLessons(run, { root })).toThrow("the case lesson-01 has another input or other labels");
    expect(judgedLessons(run, { root, rescore: true }).inputs.changed_cases).toEqual(["lesson-01"]);
  });

  test("a run with no manifest has nothing to compare, and needs --rescore, which says so", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets, {}, rowsOf(realCases(), OLD), null);
    expect(() => judgedLessons(run, { root })).toThrow("the run has no manifest (it was made before harness-v3), so nothing says which cases it was scored against");
    expect(() => judgedLessons(run, { root })).toThrow("add --rescore");
    const rescored = judgedLessons(run, { root, rescore: true });
    expect(rescored.judged).toHaveLength(3);
    expect(rescored.inputs).toMatchObject({ mode: "rescore", manifest: "legacy", akm_version: "0.9.26", judge_first_criterion: "novelty" });
  });

  test("a manifest that is not sound, a manifest without the case, and a run of another eval are refused", () => {
    const { root, assets } = repo();
    const m = manifestOf(assets);
    expect(() => judgedLessons(runOf(root, assets, {}, undefined, { ...m, manifest_version: 9 }), { root })).toThrow("has a manifest that is not sound: manifest_version is 9");
    const { "lesson-02": _gone, ...cases } = m.cases;
    const without = runOf(root, assets, {}, undefined, { ...m, cases, completion: { selected: Object.keys(cases), scored: Object.keys(cases), errored: [] } });
    expect(() => judgedLessons(without, { root })).toThrow("the manifest of the run does not hold the case lesson-02");
    expect(judgedLessons(without, { root, rescore: true }).judged).toHaveLength(3);
    expect(() => judgedLessons(runOf(root, assets, { eval: "reflect" }), { root })).toThrow('is a run of "reflect", not of distill');
  });

  test("a case id of the run that the cases lack stops the read, and with --rescore leaves its row out and names it", () => {
    const { root, assets } = repo();
    const rows = [...rowsOf(realCases()), { ...base, id: "gone-01", class: "lesson-worthy", lesson: "A lesson." }, { ...base, id: "gone-02", class: "lesson-worthy", outcome: "none", gate: null, scores: null }];
    const run = runOf(root, assets, {}, rows);
    expect(() => judgedLessons(run, { root })).toThrow(`the run has case ids that ${join(PUBLIC, "cases.json")} lacks: gone-01, gone-02`);
    const rescored = judgedLessons(run, { root, rescore: true });
    expect(rescored.judged.map((j) => j.id)).toEqual(["lesson-01", "lesson-02", "status-01"]);
    expect(rescored.inputs.missing_cases).toEqual(["gone-01", "gone-02"]);
    expect(rescored.inputs.differences).toEqual([]); // the digests agree: only the ids are the matter
    expect(rescored.skipped).toBe(1);
    expect(rescored.noScores).toBe(1); // as without the rows of the gone cases: they are named in missing_cases, not counted
    const one = runOf(root, assets, {}, rows.slice(0, 6)); // the same folder, with only one id gone
    expect(() => judgedLessons(one, { root })).toThrow(`the run has a case id that ${join(PUBLIC, "cases.json")} lacks: gone-01`);
  });

  test("reads the folder a custom run records, the folder of the old corpus names, or the folder --cases gives", () => {
    const { root, assets, cases, write } = repo();
    const at = (folder: string) => {
      const where = join(root, folder);
      cpSync(join(assets, "bundles"), join(where, "bundles"), { recursive: true });
      write(cases, where);
      return where;
    };
    const own = at(join("private", "distill", "own", "assets"));
    const recorded = runOf(root, own, { corpus: "custom", corpus_folder: "private/distill/own/assets" }, undefined, { ...manifestOf(own), corpus: "custom" });
    expect(judgedLessons(recorded, { root }).inputs).toMatchObject({ corpus: "custom", assets: join("private", "distill", "own", "assets"), differences: [] });
    for (const [corpus, folder] of [["private", join("private", "distill", "assets")], ["own", join("private", "distill", "own", "assets")], ["own-feedback", join("private", "distill", "own", "assets-feedback")]] as const) {
      const where = at(folder);
      const run = runOf(root, where, { corpus }, undefined, { ...manifestOf(where), corpus });
      expect(judgedLessons(run, { root }).inputs, corpus).toMatchObject({ corpus, assets: folder, differences: [] });
    }
    // a custom run outside the repository records no folder: --cases names it
    const outside = runOf(root, own, { corpus: "custom", corpus_folder: null }, undefined, { ...manifestOf(own), corpus: "custom" });
    expect(() => judgedLessons(outside, { root })).toThrow("Name the folder with --cases DIR");
    expect(judgedLessons(outside, { root, cases: join("private", "distill", "own", "assets") }).inputs).toMatchObject({ assets: join("private", "distill", "own", "assets"), differences: [] });
    expect(() => judgedLessons(runOf(root, assets, { corpus: "somewhere-else" }, undefined, null), { root })).toThrow('read the corpus "somewhere-else"');
    expect(() => judgedLessons(runOf(root, assets, { corpus: undefined }), { root })).toThrow("read the corpus undefined");
  });
});

describe("the command line", () => {
  const SRC = import.meta.dir;
  const REAL = join(SRC, "..", "assets");
  const run = (args: string[]) => {
    const done = Bun.spawnSync(["bun", join(SRC, "pass-bar.ts"), ...args], { env: { PATH: process.env.PATH as string, HOME: process.env.HOME as string }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  /** A distill run of the first two public lesson cases as the code here made it, on an akm of this version: the good example of the first and the over-claiming one of the second. */
  function setup(version = "0.9.26", first = "reusable") {
    const results = mkdtempSync(join(tmpdir(), "pass-bar-cli-"));
    dirs.push(results);
    const cases = loadCases(REAL);
    const [one, two] = cases.filter((c) => c.expect === "lesson");
    const manifest = buildManifest({ measurement: MEASUREMENT, corpus: "public", cases: caseDigests(MEASUREMENT, cases), akm: { version }, completion: { selected: cases.map((c) => c.id), scored: [], errored: [] } });
    const summary = { eval: "distill", corpus: "public", akm_version: version, manifest };
    writeFileSync(join(results, "summary.json"), JSON.stringify(summary));
    const scores = { [first]: 5, nonRedundancy: 5, grounding: 5 };
    const rows = [
      { id: one.id, class: one.class, outcome: "lesson", gate: "deferred/distill-review", scores, lesson: one.good, rejected_lesson: null },
      { id: two.id, class: two.class, outcome: "lesson", gate: "deferred/distill-review", scores, lesson: two.bad, rejected_lesson: null },
    ];
    writeFileSync(join(results, "samples.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
    return { results, summary, rows, tamper: (over: Record<string, unknown>) => writeFileSync(join(results, "summary.json"), JSON.stringify({ ...summary, ...over })) };
  }

  test("routes the lessons of a run of akm 0.9.26 with novelty scores, and prints the inputs it used (#61)", () => {
    const { results, summary } = setup("0.9.26", "novelty");
    const done = run([results]);
    expect(done.code).toBe(0);
    const out = JSON.parse(done.out);
    expect(out.n).toBe(2);
    expect(out.mismatch).toBe(0);
    expect(out.bars.shipped.pass).toEqual({ good: 1, bad: 1 });
    expect(out.inputs).toHaveLength(1);
    expect(out.inputs[0]).toMatchObject({ results, mode: "stored", corpus: "public", assets: join("evals", "distill", "assets"), manifest: "manifest", akm_version: "0.9.26", judge_first_criterion: "novelty", differences: [], changed_cases: [], missing_cases: [] });
  });

  test("a run of a later akm with reusable scores is routed the same way", () => {
    const { results } = setup("0.9.27-alpha.2", "reusable");
    const out = JSON.parse(run([results]).out);
    expect(out.n).toBe(2);
    expect(out.inputs[0]).toMatchObject({ akm_version: "0.9.27-alpha.2", judge_first_criterion: "reusable" });
  });

  test("scores it does not know exit 2 with a message that names the release, and print nothing (#61)", () => {
    const { results } = setup("0.9.27", "novelty");
    const done = run([results]);
    expect(done.code).toBe(2);
    expect(done.out).toBe("");
    expect(done.err).toContain("from akm 0.9.27-alpha.2");
    expect(done.err).toContain("the judge's scores of the case");
  });

  test("a run with no judged lesson prints its report, then exits 1 with the reason: it is never silently n=0", () => {
    const { results, rows } = setup();
    writeFileSync(join(results, "samples.jsonl"), `${rows.map((r) => JSON.stringify({ ...r, scores: null })).join("\n")}\n`);
    const done = run([results]);
    expect(done.code).toBe(1);
    expect(JSON.parse(done.out)).toMatchObject({ n: 0, without_scores: 2 });
    expect(done.err).toContain("no lesson could be judged, so n is 0");
    expect(done.err).toContain("2 have no judge scores");
  });

  test("stops with exit 2 on a run with no manifest, naming it, and runs with --rescore, which the report says", () => {
    const { results, tamper } = setup();
    tamper({ manifest: undefined });
    const refused = run([results]);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("the run has no manifest");
    expect(refused.err).toContain("add --rescore");
    expect(JSON.parse(run(["--rescore", results]).out).inputs[0]).toMatchObject({ mode: "rescore", manifest: "legacy" });
  });

  test("asks for a folder, and says what it takes with --help", () => {
    const none = run([]);
    expect(none.code).toBe(2);
    expect(none.err).toContain("name at least one results folder");
    const help = run(["--help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("--rescore");
    expect(help.out).toContain("--cases");
    expect(help.out).toContain("0.9.27-alpha.2");
    expect(run(["--no-such-flag", "x"]).code).toBe(2);
  });
});
