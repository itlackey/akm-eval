import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { generate, install, rewriteProblems } from "./generate.ts";
import { CASES_FILE, GENERATED, GENERATOR_CODE, assetsSha256, generatorSha256, loadCases, privateAssetsProblem, readGenerated } from "./inputs.ts";
import { corpusProblem } from "./run.ts";

const PUBLIC = join(import.meta.dir, "..", "assets");
const dirs: string[] = [];
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "bakeoff-gen-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A rewrite of the public assets, made once for the file: generate runs lib/rewrite in a subprocess. */
let made: string | undefined;
function rewrite(): string {
  if (made === undefined) {
    made = mkdtempSync(join(tmpdir(), "bakeoff-gen-shared-"));
    generate("42", made);
  }
  return made;
}
afterAll(() => {
  if (made !== undefined) rmSync(made, { recursive: true, force: true });
});
const copyOf = (): string => {
  const out = temp();
  cpSync(rewrite(), out, { recursive: true });
  return out;
};

describe("generate", () => {
  test("rewrites the files and the cases with one map, and every case still holds what it expects", () => {
    const out = rewrite();
    expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json"]);
    const here = loadCases(join(out, "assets"));
    const there = loadCases(PUBLIC);
    expect(here.map((c) => [c.id, c.process, c.files])).toEqual(there.map((c) => [c.id, c.process, c.files]));
    expect(rewriteProblems(join(out, "assets"), PUBLIC)).toEqual([]);
    // it is a rewrite: the dates of the memories are not the public ones
    expect(readFileSync(join(out, "assets", "memories", "operator-preference.md"), "utf8")).not.toBe(readFileSync(join(PUBLIC, "memories", "operator-preference.md"), "utf8"));
    // the session is still one JSON object to a line, with the id its file is named by
    for (const line of readFileSync(join(out, "assets", "sessions", "-home-dev-relay", "summary-release-session.jsonl"), "utf8").trim().split("\n")) expect((JSON.parse(line) as { sessionId: string }).sessionId).toBe("summary-release-session");
  });

  test("the same seed gives the same assets, and another seed gives other ones", () => {
    const again = temp();
    generate("42", again);
    expect(assetsSha256(join(again, "assets"))).toBe(assetsSha256(join(rewrite(), "assets")));
    const other = temp();
    generate("43", other);
    expect(assetsSha256(join(other, "assets"))).not.toBe(assetsSha256(join(rewrite(), "assets")));
  });

  test("generated.json holds the seed and the digests of the public assets, of the generator and of the assets as written", () => {
    const out = rewrite();
    expect(readGenerated(join(out, GENERATED))).toEqual({ version: 1, seed: "42", inputs_sha256: assetsSha256(PUBLIC), generator_sha256: generatorSha256(), outputs_sha256: assetsSha256(join(out, "assets")) });
  });

  test("the digest of the generator covers generate.ts, inputs.ts, lib/rewrite and its lexicon", () => {
    expect(GENERATOR_CODE.map((p) => p.split("/").join("/"))).toEqual(["evals/bakeoff/src/generate.ts", "evals/bakeoff/src/inputs.ts", "lib/rewrite/rewrite.ts", "lib/rewrite/lexicon.ts"]);
    // a change to any of them changes the digest: a copy of the repository's four files
    const root = temp();
    for (const rel of GENERATOR_CODE) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      cpSync(join(import.meta.dir, "..", "..", "..", rel), join(root, rel));
    }
    const same = generatorSha256(root);
    expect(same).toBe(generatorSha256());
    for (const rel of GENERATOR_CODE) {
      const before = readFileSync(join(root, rel), "utf8");
      writeFileSync(join(root, rel), `${before}\n// edited\n`);
      expect(generatorSha256(root)).not.toBe(same);
      writeFileSync(join(root, rel), before);
    }
    expect(generatorSha256(root)).toBe(same);
  });

  test("stops and writes nothing when a rewritten case no longer holds, and leaves the earlier assets, map and generated.json as they were", () => {
    const out = copyOf();
    const earlier = [assetsSha256(join(out, "assets")), readFileSync(join(out, GENERATED), "utf8"), readFileSync(join(out, "map.json"), "utf8")];
    // a public corpus whose case names a file that is not there: the rewritten case cannot hold what it expects
    const from = temp();
    cpSync(PUBLIC, from, { recursive: true });
    rmSync(join(from, "lessons", "missing-metadata.md"));
    expect(() => generate("7", out, from)).toThrow(/Nothing was written\. Try another seed\.[\s\S]*repair-lesson-metadata: lessons\/missing-metadata\.md is missing or empty/);
    expect([assetsSha256(join(out, "assets")), readFileSync(join(out, GENERATED), "utf8"), readFileSync(join(out, "map.json"), "utf8")]).toEqual(earlier);
    expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json"]); // no work folder is left behind
  });

  test("install puts the marker in last, so assets cut short have none", () => {
    const out = temp();
    const staged = temp();
    mkdirSync(join(staged, "assets"));
    writeFileSync(join(staged, "assets", CASES_FILE), "[]");
    writeFileSync(join(staged, "map.json"), "{}");
    writeFileSync(join(staged, GENERATED), "{}");
    mkdirSync(join(out, "assets"));
    writeFileSync(join(out, GENERATED), "old");
    install(staged, out);
    expect(readFileSync(join(out, GENERATED), "utf8")).toBe("{}");
    expect(existsSync(join(staged, "assets"))).toBe(false);
  });
});

/** The custom corpus of a rewrite at `out`, as lib/corpus.ts resolves it. */
const corpusOf = (out: string): ResolvedCorpus => ({ name: "custom", folder: join(out, "assets"), config: { kind: "rewrite", private: false, seed: "42", generated: GENERATED }, configFile: join(out, "corpus.json"), flag: "--corpus custom" });

describe("run refuses a rewrite that does not fit the public assets and the generator as they are now (#44)", () => {
  const problem = (out: string): string | undefined => privateAssetsProblem(join(out, "assets"), join(out, GENERATED), PUBLIC, "private/bakeoff/assets");

  test("a rewrite just made passes", () => {
    expect(problem(rewrite())).toBeUndefined();
    expect(corpusProblem(corpusOf(rewrite()), PUBLIC)).toBeUndefined();
  });

  test("assets whose stored generator digest is zeroed are refused, with the instruction to make them again", () => {
    const out = copyOf();
    const made = JSON.parse(readFileSync(join(out, GENERATED), "utf8"));
    writeFileSync(join(out, GENERATED), JSON.stringify({ ...made, generator_sha256: "0".repeat(64) }));
    expect(problem(out)).toBe("the private assets in private/bakeoff/assets/ were made by a generator that has changed since: generate.ts or inputs.ts of this eval, or lib/rewrite and its lexicon (generator_sha256 in generated.json differs). Make them again with: ./generate-assets --only bakeoff");
    expect(corpusProblem(corpusOf(out), PUBLIC)).toContain("the --corpus custom corpus cannot be used: the private assets in ");
    expect(corpusProblem(corpusOf(out), PUBLIC)).toContain("generator_sha256 in generated.json differs");
  });

  test("assets made from other public assets are refused", () => {
    const out = copyOf();
    const made = JSON.parse(readFileSync(join(out, GENERATED), "utf8"));
    writeFileSync(join(out, GENERATED), JSON.stringify({ ...made, inputs_sha256: "0".repeat(64) }));
    expect(problem(out)).toContain("were made from public assets that have changed since");
    const from = temp();
    cpSync(PUBLIC, from, { recursive: true });
    appendTo(join(from, "memories", "signed-artifacts.md"), "\nAn added line.\n");
    expect(privateAssetsProblem(join(rewrite(), "assets"), join(rewrite(), GENERATED), from)).toContain("were made from public assets that have changed since");
  });

  test("assets changed after generate wrote them are refused", () => {
    const out = copyOf();
    appendTo(join(out, "assets", "memories", "signed-artifacts.md"), "\nEdited by hand.\n");
    expect(problem(out)).toContain("are not what generate wrote: a file in them was changed, added or removed since");
    const added = copyOf();
    writeFileSync(join(added, "assets", "memories", "extra.md"), "x");
    expect(problem(added)).toContain("are not what generate wrote");
  });

  test("assets with no generated.json, one that is not JSON or one in another format, or no assets at all, are refused", () => {
    const none = copyOf();
    rmSync(join(none, GENERATED));
    expect(problem(none)).toContain("have no generated.json in its current format");
    const text = copyOf();
    writeFileSync(join(text, GENERATED), "not json");
    expect(problem(text)).toContain("have no generated.json in its current format");
    const old = copyOf();
    writeFileSync(join(old, GENERATED), JSON.stringify({ seed: "42", inputs_sha256: assetsSha256(PUBLIC) }));
    expect(problem(old)).toContain("have no generated.json in its current format");
    const empty = temp();
    expect(problem(empty)).toBe("the private assets are missing (private/bakeoff/assets/cases.json). Make them with: ./generate-assets --only bakeoff");
    expect(corpusProblem(corpusOf(empty), PUBLIC)).toContain("has no cases.json");
  });

  test("a corpus of your own needs only its cases.json, and the public corpus nothing", () => {
    const own = temp();
    expect(corpusProblem({ name: "custom", folder: own, config: { kind: "own", private: true }, configFile: null, flag: "--cases mine" }, PUBLIC)).toContain("the --cases mine corpus has no cases.json in ");
    cpSync(PUBLIC, own, { recursive: true });
    expect(corpusProblem({ name: "custom", folder: own, config: { kind: "own", private: true }, configFile: null, flag: "--cases mine" }, PUBLIC)).toBeUndefined();
    expect(corpusProblem({ name: "public", folder: PUBLIC, config: { kind: "public", private: false }, configFile: null, flag: "--corpus public" }, PUBLIC)).toBeUndefined();
  });
});

function appendTo(file: string, text: string): void {
  writeFileSync(file, readFileSync(file, "utf8") + text);
}
