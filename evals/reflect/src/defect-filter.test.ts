import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildManifest, caseDigests, lockedParts } from "../../../lib/manifest.ts";
import { harnessSha256 } from "../../../lib/provenance.ts";
import { type Edit, type Find, judgeGateEdits, loadFilter, reflectEdits, replay } from "./defect-filter.ts";
import { assetsSha256, parseCases } from "./lib.ts";
import { MEASUREMENT } from "./measurement.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "defect-filter-"));
  dirs.push(d);
  return d;
};

describe("replay", () => {
  // a stand-in for akm's filter: refuses a candidate that says "this revision", by the rule named for it
  const find: Find = (_source, candidate) => (candidate.includes("this revision") ? "meta_commentary_added" : candidate.includes("please confirm") ? "placeholder_added" : undefined);
  const edit = (id: string, label: Edit["label"], candidate: string): Edit => ({ id, label, source: "s", candidate });

  test("counts the edits the filter refuses, by label and by rule, and lists them", () => {
    const r = replay([edit("a", "bad", "this revision adds"), edit("b", "bad", "please confirm"), edit("c", "bad", "this revision too"), edit("d", "bad", "fine"), edit("e", "good", "fine"), edit("f", "good", "please confirm")], find);
    expect(r.bad).toEqual({ n: 4, refused: 3, rules: { meta_commentary_added: 2, placeholder_added: 1 } });
    expect(r.good).toEqual({ n: 2, refused: 1, rules: { placeholder_added: 1 } });
    expect(r.hits).toEqual([
      { id: "a", label: "bad", rule: "meta_commentary_added" },
      { id: "b", label: "bad", rule: "placeholder_added" },
      { id: "c", label: "bad", rule: "meta_commentary_added" },
      { id: "f", label: "good", rule: "placeholder_added" },
    ]);
  });

  test("an empty set has nothing", () => {
    expect(replay([], find)).toEqual({ good: { n: 0, refused: 0, rules: {} }, bad: { n: 0, refused: 0, rules: {} }, hits: [] });
  });
});

describe("reflectEdits", () => {
  const note = (d: string) => `---\ndescription: ${d}\n---\n`;
  const PUBLIC = join("evals", "reflect", "assets");
  /** The code the run ran, and the code here now, as far as these tests go: a digest each. */
  const RAN = "1".repeat(64);
  const OTHER = "2".repeat(64);
  const ROWS = [
    { id: "a", outcome: "proposal", correct: true, proposal: note("a fixed") },
    { id: "b", outcome: "proposal", correct: false, proposal: note("b changed") },
    { id: "c", outcome: "none", correct: false },
  ];

  /** A repository with the public cases a, b and c, and a way to write them again. */
  function repo() {
    const root = temp();
    const assets = join(root, PUBLIC);
    mkdirSync(assets, { recursive: true });
    const write = (sources: Record<string, string>, folder = assets) => {
      mkdirSync(folder, { recursive: true });
      const c = (id: string, source: string) => ({ id, class: "when-to-use-missing", path: `knowledge/${id}.md`, source, feedback: "f", defect: "d", correct: "c", allow: ["when_to_use"] });
      writeFileSync(join(folder, "cases.jsonl"), `${Object.entries(sources).map(([id, source]) => JSON.stringify(c(id, source))).join("\n")}\n`);
    };
    write({ a: note("a"), b: note("b"), c: note("c") });
    return { root, assets, write };
  }
  /** The reflect run of those cases that ran the code RAN: a summary.json, with `over` laid on it, and samples.jsonl. */
  function runOf(root: string, assets: string, over: Record<string, unknown> = {}, rows: object[] = ROWS): string {
    const run = join(root, "run");
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, "summary.json"), JSON.stringify({ corpus: "public", assets_sha256: assetsSha256(assets), harness_sha256: RAN, ...over }));
    writeFileSync(join(run, "samples.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
    return run;
  }
  /** Those digests as reflect's own run writes them, for a replay by the code RAN. */
  const same = (root: string) => ({ root, harness: RAN });

  test("takes the proposals of a run that read these cases and ran this code, good when the case was correct, with the note the case holds", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets);
    const digest = assetsSha256(assets);
    expect(reflectEdits(run, same(root))).toEqual({
      edits: [
        { id: "a", label: "good", source: note("a"), candidate: note("a fixed") },
        { id: "b", label: "bad", source: note("b"), candidate: note("b changed") },
      ],
      inputs: { mode: "stored", corpus: "public", assets: PUBLIC, assets_sha256: { stored: digest, current: digest }, harness_sha256: { stored: RAN, current: RAN }, differences: [], missing_cases: [], manifest: null },
    });
  });

  test("the digests are the ones reflect's run computes: assetsSha256 of the cases folder, and harnessSha256 of this src folder", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets, { harness_sha256: harnessSha256(import.meta.dir) });
    const { inputs } = reflectEdits(run, { root }); // no harness given: the code here
    expect(inputs.harness_sha256).toEqual({ stored: harnessSha256(import.meta.dir), current: harnessSha256(import.meta.dir) });
    expect(inputs.assets_sha256.current).toBe(assetsSha256(assets));
    expect(inputs.differences).toEqual([]);
  });

  test("unchanged artifacts replay identically after an unrelated corpus regeneration", () => {
    const { root, assets, write } = repo();
    const run = runOf(root, assets);
    const first = reflectEdits(run, same(root));
    // The private corpus is made again from another seed, a file is added beside the public cases, and the public file is written out again with the same bytes.
    write({ a: note("rewritten a"), b: note("rewritten b"), c: note("rewritten c") }, join(root, "private", "reflect", "assets"));
    writeFileSync(join(assets, "README.md"), "Notes about the cases.\n");
    const cases = join(assets, "cases.jsonl");
    const text = readFileSync(cases, "utf8");
    rmSync(cases);
    writeFileSync(cases, text);
    expect(reflectEdits(run, same(root))).toEqual(first);
  });

  test("a case whose source changed since the run stops the replay with both digests, and is replayed against the new source only with --rescore", () => {
    const { root, assets, write } = repo();
    const run = runOf(root, assets);
    const stored = assetsSha256(assets);
    const find: Find = (source) => (source.includes("changed source") ? "meta_commentary_added" : undefined);
    expect(replay(reflectEdits(run, same(root)).edits, find).hits).toEqual([]); // the source the run was given: nothing refused
    write({ a: note("changed source"), b: note("b"), c: note("c") });
    const now = assetsSha256(assets);
    expect(now).not.toBe(stored);
    const said = `assets_sha256 differs: the run recorded ${stored}, the cases in ${PUBLIC} gives ${now}`;
    expect(() => reflectEdits(run, same(root))).toThrow(said);
    expect(() => reflectEdits(run, same(root))).toThrow("add --rescore");
    const rescored = reflectEdits(run, { ...same(root), rescore: true });
    expect(rescored.edits[0]).toEqual({ id: "a", label: "good", source: note("changed source"), candidate: note("a fixed") });
    expect(replay(rescored.edits, find).hits).toEqual([{ id: "a", label: "good", rule: "meta_commentary_added" }]);
    expect(rescored.inputs).toEqual({ mode: "rescore", corpus: "public", assets: PUBLIC, assets_sha256: { stored, current: now }, harness_sha256: { stored: RAN, current: RAN }, differences: [said], missing_cases: [], manifest: null });
  });

  test("a run made by other code stops the replay with both digests, and is replayed with --rescore", () => {
    const { root, assets } = repo();
    const run = runOf(root, assets, { harness_sha256: OTHER });
    const said = `harness_sha256 differs: the run recorded ${OTHER}, the code here gives ${RAN}`;
    expect(() => reflectEdits(run, same(root))).toThrow(said);
    const rescored = reflectEdits(run, { ...same(root), rescore: true });
    expect(rescored.edits.map((e) => e.id)).toEqual(["a", "b"]);
    expect(rescored.inputs).toMatchObject({ mode: "rescore", harness_sha256: { stored: OTHER, current: RAN }, differences: [said] });
    expect(rescored.inputs.assets_sha256.stored).toBe(rescored.inputs.assets_sha256.current);
  });

  test("a summary without assets_sha256 or without harness_sha256 needs --rescore, and the report says which is missing", () => {
    const { root, assets } = repo();
    const noAssets = "assets_sha256 is missing from summary.json (or is not a sha256 digest), so nothing says which cases the run read";
    const noHarness = "harness_sha256 is missing from summary.json (or is not a sha256 digest), so nothing says which code made the run";
    const digest = assetsSha256(assets);
    const cases: [string, Record<string, unknown>, string[], string | null, string | null][] = [
      ["no assets_sha256", { assets_sha256: undefined }, [noAssets], null, RAN],
      ["no harness_sha256", { harness_sha256: undefined }, [noHarness], digest, null],
      ["neither", { assets_sha256: undefined, harness_sha256: undefined }, [noAssets, noHarness], null, null],
      ["an assets_sha256 that is not a digest", { assets_sha256: "abc" }, [noAssets], null, RAN],
      ["a harness_sha256 that is not a string", { harness_sha256: 42 }, [noHarness], digest, null],
      ["a null digest", { harness_sha256: null }, [noHarness], digest, null],
    ];
    for (const [what, over, said, assetsWas, harnessWas] of cases) {
      const run = runOf(root, assets, over);
      for (const line of said) expect(() => reflectEdits(run, same(root)), what).toThrow(line);
      const rescored = reflectEdits(run, { ...same(root), rescore: true });
      expect(rescored.inputs, what).toMatchObject({ mode: "rescore", assets_sha256: { stored: assetsWas, current: digest }, harness_sha256: { stored: harnessWas, current: RAN }, differences: said });
      expect(rescored.edits.map((e) => e.id), what).toEqual(["a", "b"]);
    }
  });

  test("a case id of the run that the cases lack stops the replay, and is never an edit with no source", () => {
    const { root, assets } = repo();
    const rows = [...ROWS, { id: "gone", outcome: "proposal", correct: true, proposal: note("gone fixed") }, { id: "also-gone", outcome: "none", correct: false }];
    const run = runOf(root, assets, {}, rows);
    expect(() => reflectEdits(run, same(root))).toThrow(`the run has case ids that ${join(PUBLIC, "cases.jsonl")} lacks: gone, also-gone`);
    const rescored = reflectEdits(run, { ...same(root), rescore: true });
    expect(rescored.edits.map((e) => e.id)).toEqual(["a", "b"]);
    expect(rescored.edits.every((e) => typeof e.source === "string" && e.source.length > 0)).toBe(true);
    expect(rescored.inputs.missing_cases).toEqual(["gone", "also-gone"]);
    expect(rescored.inputs.differences).toEqual([]); // the digests agree: only the ids are the matter
    const one = runOf(root, assets, {}, rows.slice(0, 4)); // the same folder, with only one id gone
    expect(() => reflectEdits(one, same(root))).toThrow(`the run has a case id that ${join(PUBLIC, "cases.jsonl")} lacks: gone`);
  });

  test("reads the private cases for a private run, and refuses a corpus it does not know", () => {
    const { root, assets, write } = repo();
    write({ a: note("private a"), b: note("private b"), c: note("private c") }, join(root, "private", "reflect", "assets"));
    const run = runOf(root, join(root, "private", "reflect", "assets"), { corpus: "private" });
    const { edits, inputs } = reflectEdits(run, same(root));
    expect(edits.map((e) => e.source)).toEqual([note("private a"), note("private b")]);
    expect(inputs).toMatchObject({ corpus: "private", assets: join("private", "reflect", "assets"), differences: [] });
    // the public cases are another corpus: the digest of the run does not match them
    expect(() => reflectEdits(runOf(root, assets, { corpus: "private", assets_sha256: assetsSha256(assets) }), same(root))).toThrow("assets_sha256 differs");
    expect(() => reflectEdits(runOf(root, assets, { corpus: "own" }), same(root))).toThrow('names the corpus "own", not public or private');
    expect(() => reflectEdits(runOf(root, assets, { corpus: undefined }), same(root))).toThrow("names the corpus undefined, not public or private");
  });
});

describe("reflectEdits with a manifest", () => {
  const note = (d: string) => `---\ndescription: ${d}\n---\n`;
  const PUBLIC = join("evals", "reflect", "assets");
  const ROWS = [
    { id: "a", outcome: "proposal", correct: true, proposal: note("a fixed") },
    { id: "b", outcome: "proposal", correct: false, proposal: note("b changed") },
    { id: "c", outcome: "none", correct: false },
  ];
  const caseOf = (id: string, source: string, feedback = "f") => ({ id, class: "when-to-use-missing", path: `knowledge/${id}.md`, source, feedback, defect: "d", correct: "c", allow: ["when_to_use"] });

  /** A repository with the public cases a, b and c, and a way to write them again. */
  function repo() {
    const root = temp();
    const assets = join(root, PUBLIC);
    mkdirSync(assets, { recursive: true });
    const write = (cases: object[]) => writeFileSync(join(assets, "cases.jsonl"), `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`);
    const cases = [caseOf("a", note("a")), caseOf("b", note("b")), caseOf("c", note("c"))];
    write(cases);
    return { root, assets, cases, write };
  }
  /** A run of those cases as harness-v3 writes it: a summary with a manifest and no digest of the cases or the code, and its samples. */
  function runOf(root: string, cases: object[], over: Record<string, unknown> = {}, manifestOver: Record<string, unknown> = {}): string {
    const dir = join(root, "run");
    mkdirSync(dir, { recursive: true });
    const manifest = buildManifest({
      measurement: MEASUREMENT,
      parts: lockedParts(MEASUREMENT),
      corpus: "public",
      cases: caseDigests(MEASUREMENT, parseCases(cases.map((c) => JSON.stringify(c)).join("\n"))),
      completion: { selected: ["a", "b", "c"], scored: ["a", "b", "c"], errored: [] },
    });
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ eval: "reflect", corpus: "public", manifest: { ...manifest, ...manifestOver }, ...over }));
    writeFileSync(join(dir, "samples.jsonl"), `${ROWS.map((r) => JSON.stringify(r)).join("\n")}\n`);
    return dir;
  }

  test("replays a run whose cases and scorer are the ones here, with no digest of the cases or the code in its summary", () => {
    const { root, cases } = repo();
    const run = runOf(root, cases);
    const scorer = lockedParts(MEASUREMENT).scorer.sha256;
    const { edits, inputs } = reflectEdits(run, { root });
    expect(edits.map((e) => [e.id, e.label, e.source])).toEqual([["a", "good", note("a")], ["b", "bad", note("b")]]);
    expect(inputs).toMatchObject({ mode: "stored", differences: [], missing_cases: [], manifest: { scorer: { stored: scorer, current: scorer }, cases_compared_on: "input" } });
  });

  test("another version of the eval's collector, or of the harness, does not stop it: a replay reads proposals, not what produced them", () => {
    const { root, cases } = repo();
    const parts = lockedParts(MEASUREMENT);
    const run = runOf(root, cases, {}, { collector: { version: 9, sha256: "7".repeat(64) }, harness_version: 9 });
    expect(reflectEdits(run, { root }).inputs.differences).toEqual([]);
    expect(parts.collector.version).toBe(1);
  });

  test("a case whose note changed since the run stops the replay, and the replay with --rescore reads the new note and says so", () => {
    const { root, cases, write } = repo();
    const run = runOf(root, cases);
    write([caseOf("a", note("changed source")), cases[1] as object, cases[2] as object]);
    const said = "the case a has another input (note, path or feedback) than the manifest of the run holds";
    expect(() => reflectEdits(run, { root })).toThrow(said);
    const rescored = reflectEdits(run, { root, rescore: true });
    expect(rescored.edits[0]?.source).toBe(note("changed source"));
    expect(rescored.inputs).toMatchObject({ mode: "rescore", differences: [said] });
  });

  test("a run scored by another scorer than the one here stops the replay and is sent to scripts/rescore", () => {
    const { root, cases } = repo();
    const run = runOf(root, cases, {}, { scorer: { version: 1, sha256: "5".repeat(64) } });
    const now = lockedParts(MEASUREMENT).scorer.sha256;
    expect(() => reflectEdits(run, { root })).toThrow(`the scorer differs: the proposals were labelled good or bad by ${"5".repeat(64)}, the scorer here gives ${now}. Score the run again with scripts/rescore`);
    expect(reflectEdits(run, { root, rescore: true }).inputs.manifest).toEqual({ scorer: { stored: "5".repeat(64), current: now }, cases_compared_on: "input" });
    expect(reflectEdits(run, { root, scorer: "5".repeat(64) }).inputs.differences).toEqual([]); // the scorer the run was labelled by, given
  });

  test("a run that recorded searches is held to its cases' labels, which the feedback is not part of", () => {
    const { root, cases, write } = repo();
    const run = runOf(root, cases, { retrieval_queries: { cases: 2 } });
    write([caseOf("a", note("a"), "other feedback"), cases[1] as object, cases[2] as object]); // the feedback is an input, not a label
    expect(reflectEdits(run, { root }).inputs).toMatchObject({ differences: [], manifest: { cases_compared_on: "labels" } });
    write([caseOf("a", note("another note")), cases[1] as object, cases[2] as object]);
    expect(() => reflectEdits(run, { root })).toThrow("the case a has another label than the manifest of the run holds");
  });

  test("a case id the manifest does not hold, a case that is gone, and a manifest that is not sound are named", () => {
    const { root, cases } = repo();
    const manifest = JSON.parse(readFileSync(join(runOf(root, cases), "summary.json"), "utf8")).manifest;
    const { b: _b, ...fewer } = manifest.cases;
    const without = runOf(root, cases, {}, { cases: fewer, completion: { selected: ["a", "c"], scored: ["a", "c"], errored: [] } });
    expect(() => reflectEdits(without, { root })).toThrow("the case b has another input");
    expect(() => reflectEdits(runOf(root, cases, {}, { manifest_version: 7 }), { root })).toThrow("has a manifest that is not sound: manifest_version is 7");
    const gone = runOf(root, cases);
    writeFileSync(join(root, PUBLIC, "cases.jsonl"), `${JSON.stringify(cases[0])}\n${JSON.stringify(cases[2])}\n`);
    expect(() => reflectEdits(gone, { root })).toThrow(`the run has a case id that ${join(PUBLIC, "cases.jsonl")} lacks: b`);
    expect(reflectEdits(gone, { root, rescore: true }).inputs.missing_cases).toEqual(["b"]);
  });
});

describe("the command line", () => {
  const SRC = import.meta.dir;
  const run = (args: string[]) => {
    const done = Bun.spawnSync(["bun", join(SRC, "defect-filter.ts"), ...args], { env: { PATH: process.env.PATH as string, HOME: process.env.HOME as string }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  /** A fake akm checkout whose filter refuses a candidate that says PLACEHOLDER, and a reflect run of the first two public cases as the code here made it. */
  function setup() {
    const akm = temp();
    mkdirSync(join(akm, "src", "commands", "improve"), { recursive: true });
    writeFileSync(join(akm, "src", "commands", "improve", "reflect-noise.ts"), 'export const findReflectDefect = (_s: string, c: string) => (c.includes("PLACEHOLDER") ? "placeholder_added" : undefined);\n');
    const assets = join(SRC, "..", "assets");
    const [first, second] = parseCases(readFileSync(join(assets, "cases.jsonl"), "utf8"));
    const results = temp();
    const summary = { corpus: "public", assets_sha256: assetsSha256(assets), harness_sha256: harnessSha256(SRC) };
    writeFileSync(join(results, "summary.json"), JSON.stringify(summary));
    const rows = [
      { id: first.id, outcome: "proposal", correct: true, proposal: first.source },
      { id: second.id, outcome: "proposal", correct: false, proposal: `${second.source}\nPLACEHOLDER\n` },
    ];
    writeFileSync(join(results, "samples.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
    return { akm, results, assets, summary, tamper: (over: Record<string, unknown>) => writeFileSync(join(results, "summary.json"), JSON.stringify({ ...summary, ...over })) };
  }

  test("replays a run of the corpus and the code here, and prints the inputs it used", () => {
    const { akm, results, summary } = setup();
    const done = run(["--akm-src", akm, "--reflect", results]);
    expect(done.code).toBe(0);
    const set = JSON.parse(done.out)[`reflect ${results}`];
    expect(set.good).toEqual({ n: 1, refused: 0, rules: {} });
    expect(set.bad).toEqual({ n: 1, refused: 1, rules: { placeholder_added: 1 } });
    expect(set.inputs).toMatchObject({ mode: "stored", corpus: "public", assets: join("evals", "reflect", "assets"), assets_sha256: { stored: summary.assets_sha256, current: summary.assets_sha256 }, harness_sha256: { stored: summary.harness_sha256, current: summary.harness_sha256 }, differences: [], missing_cases: [] });
  });

  test("stops with exit 2 on a digest that differs or is missing, naming both, and runs with --rescore, which the report says", () => {
    const { akm, results, summary, tamper } = setup();
    const was = "9".repeat(64);
    tamper({ assets_sha256: was, harness_sha256: undefined });
    const refused = run(["--akm-src", akm, "--reflect", results]);
    expect(refused.code).toBe(2);
    expect(refused.out).toBe("");
    expect(refused.err).toContain(`assets_sha256 differs: the run recorded ${was}, the cases in ${join("evals", "reflect", "assets")} gives ${summary.assets_sha256}`);
    expect(refused.err).toContain("harness_sha256 is missing from summary.json");
    expect(refused.err).toContain("add --rescore");
    const rescored = run(["--akm-src", akm, "--reflect", results, "--rescore"]);
    expect(rescored.code).toBe(0);
    const { inputs } = JSON.parse(rescored.out)[`reflect ${results}`];
    expect(inputs).toMatchObject({ mode: "rescore", assets_sha256: { stored: was, current: summary.assets_sha256 }, harness_sha256: { stored: null, current: summary.harness_sha256 } });
    expect(inputs.differences).toHaveLength(2);
  });

  test("--rescore without a run to hold is refused", () => {
    const { akm } = setup();
    const done = run(["--akm-src", akm, "--judge-gate", "public", "--rescore"]);
    expect(done.code).toBe(2);
    expect(done.err).toContain("--rescore is for --reflect");
  });
});

describe("judgeGateEdits", () => {
  test("is the 106 labelled proposals of the public judge-gate set", () => {
    const edits = judgeGateEdits("public");
    expect(edits.length).toBe(106);
    expect(edits.filter((e) => e.label === "good").length).toBe(11); // rubric version 2 (evals/judge-gate/assets/ADJUDICATION.md)
    expect(edits.every((e) => e.source.length > 0 && e.candidate.length > 0)).toBe(true);
  });
});

describe("loadFilter", () => {
  test("says what is wrong when the folder is not an akm checkout", async () => {
    await expect(loadFilter(temp())).rejects.toThrow("must be a checkout of akm");
  });

  test("loads findReflectDefect from the checkout's source", async () => {
    const akm = temp();
    mkdirSync(join(akm, "src", "commands", "improve"), { recursive: true });
    writeFileSync(join(akm, "src", "commands", "improve", "reflect-noise.ts"), 'export const findReflectDefect = (s: string, c: string) => (c.includes("x") ? "placeholder_added" : undefined);\n');
    const find = await loadFilter(akm);
    expect(find("a", "xx")).toBe("placeholder_added");
    expect(find("a", "b")).toBeUndefined();
  });
});
