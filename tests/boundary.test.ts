import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findBoundaryViolations } from "../scripts/check-boundary.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const tempRoots: string[] = [];

function tempRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-boundary-"));
  tempRoots.push(dir);
  return dir;
}

function writeFile(root: string, relativePath: string, contents: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, "utf8");
}

// Assembled at runtime rather than written literally: this file is itself
// walked by the "passes repository sources" test above, and a literal would
// make the checker report this test file as a violation.
const FORBIDDEN_SOURCE = `import { thing } from "@akm/${"bench"}";\n`;

afterAll(() => {
  for (const dir of tempRoots) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("boundary checker", () => {
  test("passes repository sources", () => {
    const violations = findBoundaryViolations(rootDir);
    expect(violations).toEqual([]);
  });

  test("flags a forbidden import in a source directory", () => {
    const root = tempRoot();
    writeFile(root, "src/bad.ts", FORBIDDEN_SOURCE);

    const violations = findBoundaryViolations(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe(path.join(root, "src", "bad.ts"));
  });

  test("does not descend into runs/, datasets/ or other output directories", () => {
    const root = tempRoot();
    // Deliberately plant the exact pattern the checker looks for inside each
    // skipped tree. If the skip set ever stops covering one of these, the
    // walker reads it again and this test reports the violation it found.
    writeFile(root, "runs/example/.akm-memory/leaked.ts", FORBIDDEN_SOURCE);
    writeFile(root, "datasets/example/leaked.ts", FORBIDDEN_SOURCE);
    writeFile(root, "node_modules/example/leaked.ts", FORBIDDEN_SOURCE);
    writeFile(root, ".akm/example/leaked.ts", FORBIDDEN_SOURCE);
    writeFile(root, "src/clean.ts", 'import { thing } from "./other.ts";\n');

    expect(findBoundaryViolations(root)).toEqual([]);
  });

  test("does not read files inside an unreadable runs/ directory", () => {
    const root = tempRoot();
    // Reproduces the real failure: `bin/eval` runs in a container as root, so
    // `runs/<run>/.akm-memory` lands on the host owned by root and mode 0700.
    // The walker used to stat every file under it and die with EACCES on a
    // clean tree. 0o000 stands in for "not ours to read".
    const unreadable = path.join(root, "runs", "example", ".akm-memory");
    fs.mkdirSync(unreadable, { recursive: true });
    fs.writeFileSync(path.join(unreadable, "state.json"), "{}", "utf8");
    fs.chmodSync(unreadable, 0o000);
    writeFile(root, "src/clean.ts", "export const ok = true;\n");

    try {
      expect(findBoundaryViolations(root)).toEqual([]);
    } finally {
      fs.chmodSync(unreadable, 0o700);
    }
  });
});
