// A guard for the temporary folders of the tests (#36). Every `bun test` once left 20 to 40 of them behind, and a leaked sandbox can hold a
// copy of an akm config. This runs the test files that made them in a process of their own, with a TMPDIR that only that process uses, and
// asserts the folder is empty afterwards. It counts what those tests made and nothing else, by the folder and not by a name prefix, so a
// suite that runs beside this one in the same temp folder cannot make it fail.

import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

/** The test files that once left folders behind, each with the part of it to run (a test-name pattern), or all of it. This file is not among them. */
const FILES: { file: string; only?: string }[] = [
  { file: "lib/models.test.ts" },
  { file: "lib/provenance.e2e.test.ts" },
  { file: "lib/akm/akm.test.ts" },
  { file: "evals/retrieval/src/run.test.ts", only: "ask" }, // its sandboxes are made by the ask tests; the rest of the file takes 40 seconds
];

test("the tests that made temporary folders remove every one of them", () => {
  const own = mkdtempSync(join(tmpdir(), "temp-folders-guard-"));
  try {
    for (const { file, only } of FILES) {
      const run = Bun.spawnSync([process.execPath, "test", file, ...(only ? ["-t", only] : [])], { cwd: ROOT, env: { ...process.env, TMPDIR: own }, stdout: "pipe", stderr: "pipe" });
      expect([file, run.exitCode, run.exitCode === 0 ? "" : run.stderr.toString().slice(-1500)]).toEqual([file, 0, ""]);
    }
    expect(readdirSync(own)).toEqual([]);
  } finally {
    rmSync(own, { recursive: true, force: true });
  }
}, 120_000);
