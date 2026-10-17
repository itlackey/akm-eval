import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CASES, RUBRIC, casesSha256, rubricVersion } from "./inputs.ts";

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
const assetsWith = (cases: string): string => {
  const dir = join(tmp(), "assets");
  mkdirSync(dir);
  writeFileSync(join(dir, CASES), cases);
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
