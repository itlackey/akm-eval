import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harnessSha256 } from "../../../lib/provenance.ts";
import { assetsSha256 } from "./lib.ts";
import { actual, judgedLessons, report, route } from "./pass-bar.ts";

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

describe("judgedLessons", () => {
  const REAL = join(import.meta.dir, "..", "assets");
  const IDS = ["lesson-01", "lesson-02", "status-01", "upd-01"];
  /** The code the run ran, and the code here now, as far as these tests go: a digest each. */
  const RAN = "1".repeat(64);
  const OTHER = "2".repeat(64);
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

  const scores = { reusable: 5, nonRedundancy: 5, grounding: 5 };
  const base = { outcome: "lesson", gate: "deferred/distill-review", scores, lesson: null, rejected_lesson: null };
  /** The rows of a run: the good example for lesson-01, the bad one for lesson-02, a lesson for a case that expects none, an update (which is not judged here), and a row with no scores. */
  const rowsOf = (cases: Raw[]) => {
    const by = (id: string) => cases.find((c) => c.id === id) as Raw;
    return [
      { ...base, id: "lesson-01", class: "lesson-worthy", lesson: by("lesson-01").good },
      { ...base, id: "lesson-02", class: "lesson-worthy", lesson: by("lesson-02").bad },
      { ...base, id: "status-01", class: "dated-status", lesson: "Playwright polls for a heading." },
      { ...base, id: "upd-01", class: "lesson-update", lesson: "An update." },
      { ...base, id: "lesson-01", class: "lesson-worthy", outcome: "none", gate: null, scores: { reusable: 5, nonRedundancy: 5, grounding: 5 } },
    ];
  };
  /** The distill run of those cases that ran the code RAN: a summary.json, with `over` laid on it, and samples.jsonl. */
  function runOf(root: string, assets: string, over: Record<string, unknown> = {}, rows: object[] = rowsOf(realCases())): string {
    const run = join(root, "run");
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, "summary.json"), JSON.stringify({ corpus: "public", assets_sha256: assetsSha256(assets), harness_sha256: RAN, ...over }));
    writeFileSync(join(run, "samples.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
    return run;
  }
  const same = (root: string) => ({ root, harness: RAN });
  const goodness = (r: { judged: { id: string; good: boolean }[] }) => r.judged.map((j) => [j.id, j.good]);

  test("judges the lessons of a run that read these cases and ran this code, and reports the inputs", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets);
    const digest = assetsSha256(assets);
    const r = judgedLessons(run, same(root));
    expect(goodness(r)).toEqual([["lesson-01", true], ["lesson-02", false], ["status-01", false]]);
    expect(r.skipped).toBe(2); // the update, which is not judged, and the row with scores and no lesson text
    expect(r.inputs).toEqual({ mode: "stored", corpus: "public", assets: PUBLIC, assets_sha256: { stored: digest, current: digest }, harness_sha256: { stored: RAN, current: RAN }, differences: [], missing_cases: [] });
  });

  test("the digests are the ones distill's run computes: assetsSha256 of the corpus folder, and harnessSha256 of this src folder", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets, { harness_sha256: harnessSha256(import.meta.dir) });
    const { inputs } = judgedLessons(run, { root }); // no harness given: the code here
    expect(inputs.harness_sha256).toEqual({ stored: harnessSha256(import.meta.dir), current: harnessSha256(import.meta.dir) });
    expect(inputs.assets_sha256.current).toBe(assetsSha256(assets));
    expect(inputs.differences).toEqual([]);
  });

  test("unchanged artifacts are judged identically after an unrelated corpus regeneration", () => {
    const { root, assets, cases, write } = repo();
    const run = runOf(root, assets);
    const first = judgedLessons(run, same(root));
    // The private corpus is made again, a file is added beside the public cases, and the public file is written out again with the same bytes.
    write(cases.map((c) => ({ ...c, note: `${c.note} (rewritten)` })), join(root, "private", "distill", "assets"));
    writeFileSync(join(assets, "README.md"), "Notes about the cases.\n");
    const file = join(assets, "cases.json");
    const text = readFileSync(file, "utf8");
    rmSync(file);
    writeFileSync(file, text);
    expect(judgedLessons(run, same(root))).toEqual(first);
  });

  test("a case that changed since the run stops the read with both digests, and is judged by the new case only with --rescore", () => {
    const { root, assets, cases, write } = repo();
    const run = runOf(root, assets);
    const stored = assetsSha256(assets);
    expect(goodness(judgedLessons(run, same(root)))[0]).toEqual(["lesson-01", true]);
    write(cases.map((c) => (c.id === "lesson-01" ? { ...c, required: [...c.required, ["a fact the lesson never states"]] } : c)));
    const now = assetsSha256(assets);
    expect(now).not.toBe(stored);
    const said = `assets_sha256 differs: the run recorded ${stored}, the cases in ${PUBLIC} gives ${now}`;
    expect(() => judgedLessons(run, same(root))).toThrow(said);
    expect(() => judgedLessons(run, same(root))).toThrow("add --rescore");
    const rescored = judgedLessons(run, { ...same(root), rescore: true });
    expect(goodness(rescored)[0]).toEqual(["lesson-01", false]);
    expect(rescored.inputs).toEqual({ mode: "rescore", corpus: "public", assets: PUBLIC, assets_sha256: { stored, current: now }, harness_sha256: { stored: RAN, current: RAN }, differences: [said], missing_cases: [] });
  });

  test("a memory that changed since the run is a change of the corpus too", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets);
    const memories = join(assets, "bundles", "lesson-01", "memories");
    const memory = join(memories, readdirSync(memories)[0] as string);
    writeFileSync(memory, `${readFileSync(memory, "utf8")}\nA line added since.\n`);
    expect(() => judgedLessons(run, same(root))).toThrow("assets_sha256 differs");
    expect(judgedLessons(run, { ...same(root), rescore: true }).inputs.differences).toHaveLength(1);
  });

  test("a run made by other code stops the read with both digests, and is judged with --rescore", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets, { harness_sha256: OTHER });
    const said = `harness_sha256 differs: the run recorded ${OTHER}, the code here gives ${RAN}`;
    expect(() => judgedLessons(run, same(root))).toThrow(said);
    const rescored = judgedLessons(run, { ...same(root), rescore: true });
    expect(rescored.judged).toHaveLength(3);
    expect(rescored.inputs).toMatchObject({ mode: "rescore", harness_sha256: { stored: OTHER, current: RAN }, differences: [said] });
  });

  test("a summary without assets_sha256 or without harness_sha256 needs --rescore, and the report says which is missing", () => {
    const { root, assets } = repo();
    const noAssets = "assets_sha256 is missing from summary.json (or is not a sha256 digest), so nothing says which cases and memories the run read";
    const noHarness = "harness_sha256 is missing from summary.json (or is not a sha256 digest), so nothing says which code made the run";
    const digest = assetsSha256(assets);
    const cases: [string, Record<string, unknown>, string[], string | null, string | null][] = [
      ["no assets_sha256", { assets_sha256: undefined }, [noAssets], null, RAN],
      ["no harness_sha256", { harness_sha256: undefined }, [noHarness], digest, null],
      ["neither", { assets_sha256: undefined, harness_sha256: undefined }, [noAssets, noHarness], null, null],
      ["an assets_sha256 that is not a digest", { assets_sha256: "abc" }, [noAssets], null, RAN],
      ["a harness_sha256 that is not a string", { harness_sha256: 42 }, [noHarness], digest, null],
    ];
    for (const [what, over, said, assetsWas, harnessWas] of cases) {
      const run = runOf(root, assets, over);
      for (const line of said) expect(() => judgedLessons(run, same(root)), what).toThrow(line);
      const rescored = judgedLessons(run, { ...same(root), rescore: true });
      expect(rescored.inputs, what).toMatchObject({ mode: "rescore", assets_sha256: { stored: assetsWas, current: digest }, harness_sha256: { stored: harnessWas, current: RAN }, differences: said });
      expect(rescored.judged, what).toHaveLength(3);
    }
  });

  test("a case id of the run that the cases lack stops the read, and with --rescore leaves its row out and names it", () => {
    const { root, assets } = repo();
    const rows = [...rowsOf(realCases()), { ...base, id: "gone-01", class: "lesson-worthy", lesson: "A lesson." }, { ...base, id: "gone-02", class: "lesson-worthy", outcome: "none", gate: null, scores: null }];
    const run = runOf(root, assets, {}, rows);
    expect(() => judgedLessons(run, same(root))).toThrow(`the run has case ids that ${join(PUBLIC, "cases.json")} lacks: gone-01, gone-02`);
    const rescored = judgedLessons(run, { ...same(root), rescore: true });
    expect(rescored.judged.map((j) => j.id)).toEqual(["lesson-01", "lesson-02", "status-01"]);
    expect(rescored.inputs.missing_cases).toEqual(["gone-01", "gone-02"]);
    expect(rescored.inputs.differences).toEqual([]); // the digests agree: only the ids are the matter
    expect(rescored.skipped).toBe(2); // as without the rows of the gone cases: they are named in missing_cases, not counted as skipped
    const one = runOf(root, assets, {}, rows.slice(0, 6)); // the same folder, with only one id gone
    expect(() => judgedLessons(one, same(root))).toThrow(`the run has a case id that ${join(PUBLIC, "cases.json")} lacks: gone-01`);
  });

  test("reads the folder of the corpus the run names, and refuses a corpus it does not know", () => {
    const { root, assets, cases, write } = repo();
    for (const [corpus, folder] of [["private", join("private", "distill", "assets")], ["own", join("private", "distill", "own", "assets")], ["own-feedback", join("private", "distill", "own", "assets-feedback")]] as const) {
      const where = join(root, folder);
      cpSync(join(assets, "bundles"), join(where, "bundles"), { recursive: true });
      write(cases, where);
      const run = runOf(root, where, { corpus });
      expect(judgedLessons(run, same(root)).inputs, corpus).toMatchObject({ corpus, assets: folder, differences: [] });
    }
    expect(() => judgedLessons(runOf(root, assets, { corpus: "somewhere-else" }), same(root))).toThrow('names the corpus "somewhere-else", not public, private, own or own-feedback');
    expect(() => judgedLessons(runOf(root, assets, { corpus: undefined }), same(root))).toThrow("names the corpus undefined");
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

  /** A distill run of the first two public lesson cases as the code here made it: the good example of the first and the over-claiming one of the second. */
  function setup() {
    const results = mkdtempSync(join(tmpdir(), "pass-bar-cli-"));
    dirs.push(results);
    const [first, second] = (JSON.parse(readFileSync(join(REAL, "cases.json"), "utf8")) as Record<string, any>[]).filter((c) => c.expect === "lesson");
    const summary = { corpus: "public", assets_sha256: assetsSha256(REAL), harness_sha256: harnessSha256(SRC) };
    writeFileSync(join(results, "summary.json"), JSON.stringify(summary));
    const scores = { reusable: 5, nonRedundancy: 5, grounding: 5 };
    const rows = [
      { id: first.id, class: first.class, outcome: "lesson", gate: "deferred/distill-review", scores, lesson: first.good, rejected_lesson: null },
      { id: second.id, class: second.class, outcome: "lesson", gate: "deferred/distill-review", scores, lesson: second.bad, rejected_lesson: null },
    ];
    writeFileSync(join(results, "samples.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
    return { results, summary, tamper: (over: Record<string, unknown>) => writeFileSync(join(results, "summary.json"), JSON.stringify({ ...summary, ...over })) };
  }

  test("routes the lessons of a run of the corpus and the code here, and prints the inputs it used", () => {
    const { results, summary } = setup();
    const done = run([results]);
    expect(done.code).toBe(0);
    const out = JSON.parse(done.out);
    expect(out.n).toBe(2);
    expect(out.bars.shipped.pass).toEqual({ good: 1, bad: 1 });
    expect(out.inputs).toHaveLength(1);
    expect(out.inputs[0]).toMatchObject({ results, mode: "stored", corpus: "public", assets: join("evals", "distill", "assets"), assets_sha256: { stored: summary.assets_sha256, current: summary.assets_sha256 }, harness_sha256: { stored: summary.harness_sha256, current: summary.harness_sha256 }, differences: [], missing_cases: [] });
  });

  test("stops with exit 2 on a digest that differs or is missing, naming both, and runs with --rescore, which the report says", () => {
    const { results, summary, tamper } = setup();
    const was = "9".repeat(64);
    tamper({ assets_sha256: was, harness_sha256: undefined });
    const refused = run([results]);
    expect(refused.code).toBe(2);
    expect(refused.out).toBe("");
    expect(refused.err).toContain(`assets_sha256 differs: the run recorded ${was}, the cases in ${join("evals", "distill", "assets")} gives ${summary.assets_sha256}`);
    expect(refused.err).toContain("harness_sha256 is missing from summary.json");
    expect(refused.err).toContain("add --rescore");
    const rescored = run(["--rescore", results]);
    expect(rescored.code).toBe(0);
    const [inputs] = JSON.parse(rescored.out).inputs;
    expect(inputs).toMatchObject({ mode: "rescore", assets_sha256: { stored: was, current: summary.assets_sha256 }, harness_sha256: { stored: null, current: summary.harness_sha256 } });
    expect(inputs.differences).toHaveLength(2);
  });

  test("asks for a folder, and says what it takes with --help", () => {
    const none = run([]);
    expect(none.code).toBe(2);
    expect(none.err).toContain("name at least one results folder");
    const help = run(["--help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("--rescore");
    expect(run(["--no-such-flag", "x"]).code).toBe(2);
  });
});
