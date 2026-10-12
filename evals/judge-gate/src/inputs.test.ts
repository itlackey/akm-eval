import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cpSync } from "node:fs";
import { CASES, GENERATED, RUBRIC, casesSha256, generatorFiles, generatorSha256, privateAssetsProblem, readGenerated, rubricVersion, staleAssets } from "./inputs.ts";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "judge-gate-inputs-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** An assets folder holding a cases file. */
const assetsWith = (cases: string, generated?: object): string => {
  const dir = join(tmp(), "assets");
  mkdirSync(dir);
  writeFileSync(join(dir, CASES), cases);
  if (generated) writeFileSync(join(dir, GENERATED), JSON.stringify(generated));
  return dir;
};

describe("casesSha256", () => {
  test("is the same for the same cases wherever the folder is, and changes with a case or a label", () => {
    const [a, b] = [assetsWith("one\ntwo\n"), assetsWith("one\ntwo\n")];
    expect(casesSha256(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(casesSha256(a)).toBe(casesSha256(b));
    expect(casesSha256(assetsWith("one\nTWO\n"))).not.toBe(casesSha256(a));
  });

  test("leaves the working folder as it was", () => {
    const before = process.cwd();
    casesSha256(assetsWith("x\n"));
    expect(process.cwd()).toBe(before);
  });

  test("fails with the working folder restored when the folder has no cases", () => {
    const before = process.cwd();
    const empty = tmp();
    expect(() => casesSha256(empty)).toThrow();
    expect(process.cwd()).toBe(before);
  });
});

describe("rubricVersion", () => {
  const readme = (text: string): string => {
    const dir = assetsWith("x\n");
    writeFileSync(join(dir, RUBRIC), text);
    return dir;
  };

  test("is the number on the rubric_version line of the assets README", () => {
    expect(rubricVersion(readme("# Judge gate\n\nrubric_version: 2\n\n## Severity\n"))).toBe(2);
    expect(rubricVersion(readme("rubric_version:   13  \n"))).toBe(13);
  });

  test("is not fooled by the name in a sentence, and fails when the line or the README is missing", () => {
    expect(() => rubricVersion(readme("`rubric_version` is the version.\nThe rubric_version: 2 is in prose.\n"))).toThrow('no "rubric_version: N" line');
    expect(() => rubricVersion(assetsWith("x\n"))).toThrow();
  });

  test("the public assets state one", () => {
    expect(rubricVersion(join(import.meta.dir, "..", "assets"))).toBe(2);
  });
});

describe("readGenerated", () => {
  test("reads generated.json, and is undefined for no file, bad JSON or another shape", () => {
    const good = { seed: "7", inputs_sha256: "abc", rewrite: "lib/rewrite" };
    expect(readGenerated(assetsWith("x\n", good))).toEqual(good);
    expect(readGenerated(assetsWith("x\n"))).toBeUndefined();
    expect(readGenerated(assetsWith("x\n", { seed: 7, inputs_sha256: "abc", rewrite: "lib/rewrite" }))).toBeUndefined();
    expect(readGenerated(assetsWith("x\n", { seed: "7" }))).toBeUndefined();
    const broken = assetsWith("x\n");
    writeFileSync(join(broken, GENERATED), "{not json");
    expect(readGenerated(broken)).toBeUndefined();
  });
});

describe("staleAssets", () => {
  const publicCases = "public one\npublic two\n";

  test("is undefined when the private cases were made from the public cases as they are", () => {
    const pub = assetsWith(publicCases);
    const priv = assetsWith("private\n", { seed: "7", inputs_sha256: casesSha256(pub), rewrite: generatorSha256() });
    expect(staleAssets(priv, pub)).toBeUndefined();
  });

  test("says to make them again when there is no generated.json", () => {
    const message = staleAssets(assetsWith("private\n"), assetsWith(publicCases), "private/judge-gate/assets");
    expect(message).toContain("private/judge-gate/assets/ have no generated.json");
    expect(message).toContain("./generate-assets --only judge-gate");
  });

  test("says so when the public cases have changed since, as a label or a case does", () => {
    const pub = assetsWith(publicCases);
    const priv = assetsWith("private\n", { seed: "7", inputs_sha256: casesSha256(pub), rewrite: "lib/rewrite" });
    writeFileSync(join(pub, CASES), "public one\npublic TWO\n");
    const message = staleAssets(priv, pub, "private/judge-gate/assets");
    expect(message).toContain("were made from public cases that have changed since");
    expect(message).toContain("./generate-assets --only judge-gate");
  });
});

describe("generatorSha256 (#44)", () => {
  const ROOT = join(import.meta.dir, "..", "..", "..");
  /** A copy of the files of the generator, in a repository root of its own. */
  function copyOfGenerator(): string {
    const root = tmp();
    for (const file of generatorFiles()) {
      mkdirSync(join(root, file, ".."), { recursive: true });
      cpSync(join(ROOT, file), join(root, file));
    }
    return root;
  }

  test("is one sha256 over the generator's files and the code of lib/rewrite with its lexicon, and not over its tests", () => {
    expect(generatorSha256()).toMatch(/^[0-9a-f]{64}$/);
    expect(generatorFiles()).toEqual(["evals/judge-gate/src/generate.ts", "evals/judge-gate/src/inputs.ts", "evals/judge-gate/src/lib.ts", "lib/rewrite/lexicon.ts", "lib/rewrite/rewrite.ts"]);
    const copy = copyOfGenerator();
    expect(generatorSha256(copy)).toBe(generatorSha256()); // the same wherever the repository is
  });

  test("changes with the generator, with the rewrite and with its lexicon, and with nothing else", () => {
    const was = generatorSha256();
    for (const file of generatorFiles()) {
      const root = copyOfGenerator();
      writeFileSync(join(root, file), `${readFileSync(join(root, file), "utf8")}\n// edited\n`);
      expect({ file, changed: generatorSha256(root) !== was }).toEqual({ file, changed: true });
    }
    const root = copyOfGenerator();
    writeFileSync(join(root, "lib", "rewrite", "rewrite.test.ts"), "// a test of the rewrite\n");
    mkdirSync(join(root, "evals", "judge-gate", "src"), { recursive: true });
    writeFileSync(join(root, "evals", "judge-gate", "src", "run.ts"), "// the runner\n");
    expect(generatorSha256(root)).toBe(was);
  });
});

describe("a generator that has changed since the private cases were made (#44)", () => {
  const publicCases = "public one\npublic two\n";
  const where = "private/judge-gate/assets";
  const made = (pub: string, rewrite: string) => assetsWith("private\n", { seed: "7", inputs_sha256: casesSha256(pub), rewrite });

  test("is refused when the stored digest is zeroed, is the literal older generates wrote, or is another generator's, and says to make them again", () => {
    const pub = assetsWith(publicCases);
    for (const stored of ["0".repeat(64), "lib/rewrite", "f".repeat(64), generatorSha256().replace(/^./, (c) => (c === "a" ? "b" : "a"))]) {
      const message = privateAssetsProblem(made(pub, stored), pub, where);
      expect({ stored, message }).toEqual({ stored, message: `the private cases in ${where}/ were made by a generator that has changed since, or before its code was digested: generate.ts, inputs.ts or lib.ts of this eval, or lib/rewrite and its lexicon (rewrite in generated.json differs). Make them again with: ./generate-assets --only judge-gate` });
    }
  });

  test("passes when the stored digest is the generator's now, and is refused once a file of the generator has changed", () => {
    const pub = assetsWith(publicCases);
    const priv = made(pub, generatorSha256());
    expect(privateAssetsProblem(priv, pub, where)).toBeUndefined();
    const copy = tmp();
    for (const file of generatorFiles()) {
      mkdirSync(join(copy, file, ".."), { recursive: true });
      cpSync(join(import.meta.dir, "..", "..", "..", file), join(copy, file));
    }
    expect(privateAssetsProblem(priv, pub, where, copy)).toBeUndefined();
    writeFileSync(join(copy, "lib", "rewrite", "lexicon.ts"), `${readFileSync(join(copy, "lib", "rewrite", "lexicon.ts"), "utf8")}\n`);
    expect(privateAssetsProblem(priv, pub, where, copy)).toContain("were made by a generator that has changed since");
  });

  test("is checked after the public cases: cases made from other public cases say so first", () => {
    const pub = assetsWith(publicCases);
    const priv = made(pub, "0".repeat(64));
    writeFileSync(join(pub, CASES), "public one\npublic changed\n");
    expect(privateAssetsProblem(priv, pub, where)).toContain("were made from public cases that have changed since");
  });
});

describe("privateAssetsProblem", () => {
  const publicCases = "public one\npublic two\n";
  const where = "private/judge-gate/assets";

  test("is undefined for private cases made from the public cases as they are", () => {
    const pub = assetsWith(publicCases);
    const priv = assetsWith("private\n", { seed: "7", inputs_sha256: casesSha256(pub), rewrite: generatorSha256() });
    expect(privateAssetsProblem(priv, pub, where)).toBeUndefined();
  });

  test("says the assets are missing when the folder has no cases, even with a generated.json", () => {
    const pub = assetsWith(publicCases);
    const none = join(tmp(), "assets");
    mkdirSync(none);
    expect(privateAssetsProblem(none, pub, where)).toBe(`the private assets are missing (${where}/cases.jsonl). Make them with: ./generate-assets --only judge-gate`);
    expect(privateAssetsProblem(join(tmp(), "no-such-folder"), pub, where)).toContain("the private assets are missing");
  });

  test("refuses cases with no generated.json, and cases made from public cases that have changed since", () => {
    const pub = assetsWith(publicCases);
    expect(privateAssetsProblem(assetsWith("private\n"), pub, where)).toContain(`${where}/ have no generated.json`);
    const priv = assetsWith("private\n", { seed: "7", inputs_sha256: casesSha256(pub), rewrite: "lib/rewrite" });
    writeFileSync(join(pub, CASES), "public one\npublic changed\n");
    expect(privateAssetsProblem(priv, pub, where)).toContain("were made from public cases that have changed since");
  });
});
