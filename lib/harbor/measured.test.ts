import { afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT, resolvedParts } from "../manifest.ts";
import { LOCKS_DIR } from "./harbor.ts";
import { HARBOR_COLLECTOR, HARBOR_SCORER } from "./measured.ts";

const harbor = { eval: "harbor", collector: HARBOR_COLLECTOR, scorer: HARBOR_SCORER };

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A copy of lib/ in a temporary folder laid out as the repository is, so a file can be edited without touching this one. */
function copyOfLib(): string {
  const root = mkdtempSync(join(tmpdir(), "harbor-measured-"));
  dirs.push(root);
  cpSync(join(REPO_ROOT, "lib"), join(root, "lib"), { recursive: true, filter: (src) => !/node_modules|__pycache__/.test(src) });
  return root;
}

describe("the collector and the scorer of the Harbor evals", () => {
  const parts = resolvedParts(harbor);

  test("the collector is the job, the akm arm, what Harbor's folders are read into and the lockfiles it installs from, and none of the scorer", () => {
    expect(parts.collector.files).toEqual(expect.arrayContaining(["lib/harbor/harbor.ts", "lib/harbor/trials.ts", "lib/harbor/akm_opencode.py", "lib/akm/akm.ts"]));
    const locks = readdirSync(LOCKS_DIR).flatMap((folder) => ["package.json", "package-lock.json"].map((f) => `lib/harbor/locks/${folder}/${f}`));
    expect(locks.length).toBeGreaterThanOrEqual(4); // the two pinned releases
    expect(parts.collector.files).toEqual(expect.arrayContaining(locks));
    for (const scorer of ["lib/harbor/report.ts", "lib/harbor/score.ts"]) expect(parts.collector.files).not.toContain(scorer);
  });

  test("the scorer is the report and the rows made from it, and nothing that collects", () => {
    expect(parts.scorer.files).toEqual(["lib/harbor/report.ts", "lib/harbor/score.ts"]);
  });

  test("an edit to the way trials are read changes the collector's digest and not the scorer's, and an edit to the report the other way round", () => {
    const edited = (file: string) => {
      const root = copyOfLib();
      appendFileSync(join(root, file), "\n// an edit\n");
      return resolvedParts(harbor, root);
    };
    const trials = edited("lib/harbor/trials.ts");
    expect(trials.collector.sha256).not.toBe(parts.collector.sha256);
    expect(trials.scorer.sha256).toBe(parts.scorer.sha256);
    const report = edited("lib/harbor/report.ts");
    expect(report.scorer.sha256).not.toBe(parts.scorer.sha256);
    expect(report.collector.sha256).toBe(parts.collector.sha256);
    // the akm arm and the lockfiles are the collector's too
    expect(edited("lib/harbor/akm_opencode.py").collector.sha256).not.toBe(parts.collector.sha256);
    expect(edited("lib/harbor/locks/akm-cli-0.9.26/package-lock.json").collector.sha256).not.toBe(parts.collector.sha256);
  });
});
