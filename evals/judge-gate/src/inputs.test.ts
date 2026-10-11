import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES, GENERATED, casesSha256, privateAssetsProblem, privateSeed, readGenerated, readSeed, staleAssets } from "./inputs.ts";

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

describe("readSeed and privateSeed", () => {
  test("readSeed is the text of private/seed, and null when there is none or it is empty", () => {
    const root = tmp();
    expect(readSeed(root)).toBeNull();
    mkdirSync(join(root, "private"));
    writeFileSync(join(root, "private", "seed"), "\n");
    expect(readSeed(root)).toBeNull();
    writeFileSync(join(root, "private", "seed"), "12345678901234567890\n");
    expect(readSeed(root)).toBe("12345678901234567890");
  });

  test("privateSeed is the seed generate used, else private/seed, else null", () => {
    const root = tmp();
    const made = assetsWith("x\n", { seed: "7", inputs_sha256: "a", rewrite: "lib/rewrite" });
    const bare = assetsWith("x\n");
    expect(privateSeed(made, root)).toBe("7");
    expect(privateSeed(bare, root)).toBeNull();
    mkdirSync(join(root, "private"));
    writeFileSync(join(root, "private", "seed"), "99\n");
    expect(privateSeed(bare, root)).toBe("99");
    expect(privateSeed(made, root)).toBe("7");
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
    const priv = assetsWith("private\n", { seed: "7", inputs_sha256: casesSha256(pub), rewrite: "lib/rewrite" });
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

describe("privateAssetsProblem", () => {
  const publicCases = "public one\npublic two\n";
  const where = "private/judge-gate/assets";

  test("is undefined for private cases made from the public cases as they are", () => {
    const pub = assetsWith(publicCases);
    const priv = assetsWith("private\n", { seed: "7", inputs_sha256: casesSha256(pub), rewrite: "lib/rewrite" });
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
