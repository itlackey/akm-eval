import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT, loadMeasurement, readLock, resolvedParts } from "../../../lib/manifest.ts";
import { CHANGELOG, bump, checkLock, listLock } from "./lib.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A measurement that wires nothing: the lock only looks at the files it lists. */
const MEASUREMENT_TS = `export const MEASUREMENT = {
  eval: "toy",
  collector: ["evals/toy/src/collect.ts", "lib/shared.ts"],
  scorer: ["evals/toy/src/score.ts"],
  loadCases: () => [], caseId: (c) => c.id, input: (c) => c, labels: (c) => c,
  rawOf: () => ({ raw: {} }), score: (c) => c, errored: () => false, summarize: () => ({}),
};
`;

/** A repository with one eval, "toy", that declares a measurement, and a lock with no entries. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "measurement-test-"));
  dirs.push(root);
  const write = (path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write("evals/toy/src/measurement.ts", MEASUREMENT_TS);
  write("evals/toy/src/collect.ts", "export const collect = 1;\n");
  write("evals/toy/src/score.ts", "export const score = 1;\n");
  write("lib/shared.ts", "export const shared = 1;\n");
  write("MEASUREMENT.lock", JSON.stringify({ lock_version: 1, harness_version: 3, evals: {} }));
  write(CHANGELOG, "# Changelog\n");
  return root;
}
const edit = (root: string, path: string, text: string) => writeFileSync(join(root, path), text);
const DATE = { date: "2026-10-12" };

describe("checkLock", () => {
  test("says an eval that declares a measurement has no entry, and what to run", () => {
    expect(checkLock(repo())).toEqual(['toy declares a measurement and MEASUREMENT.lock has no entry for it. Add it: scripts/measurement/run bump toy collector --reason "first lock entry"']);
  });

  test("passes when the lock matches the files, and fails naming the part when a file of it changed", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    expect(checkLock(root)).toEqual([]);
    edit(root, "evals/toy/src/score.ts", "export const score = 2;\n");
    const problems = checkLock(root);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/^toy: the scorer changed since MEASUREMENT\.lock was written \(lock [0-9a-f]{12}, files now [0-9a-f]{12}\)\. A change to the scorer is a measurement change/);
    expect(problems[0]).toContain('scripts/measurement/run bump toy scorer --reason "..."');
    edit(root, "evals/toy/src/score.ts", "export const score = 1;\n");
    expect(checkLock(root)).toEqual([]); // put back, it matches again
  });

  test("a change to a file of the collector is a change to the collector only, and the other way round", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    edit(root, "lib/shared.ts", "export const shared = 2;\n");
    expect(checkLock(root).map((p) => /the (collector|scorer) changed/.exec(p)?.[1])).toEqual(["collector"]);
    edit(root, "lib/shared.ts", "export const shared = 1;\n");
    edit(root, "evals/toy/src/score.ts", "export const score = 3;\n");
    expect(checkLock(root).map((p) => /the (collector|scorer) changed/.exec(p)?.[1])).toEqual(["scorer"]);
  });

  test("a file added to or dropped from a part changes the part even if no file changed", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    edit(root, "evals/toy/src/measurement.ts", MEASUREMENT_TS.replace('["evals/toy/src/score.ts"]', '["evals/toy/src/score.ts", "lib/shared.ts"]'));
    expect(checkLock(root).join(" ")).toContain("is in both the collector and the scorer");
    edit(root, "evals/toy/src/measurement.ts", MEASUREMENT_TS.replace('["evals/toy/src/collect.ts", "lib/shared.ts"]', '["evals/toy/src/collect.ts"]'));
    expect(checkLock(root).join(" ")).toContain("toy: the collector changed");
  });

  test("a lock entry for an eval that declares nothing, and a part with no changelog row, are named", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    const lock = readLock(root);
    writeFileSync(join(root, "MEASUREMENT.lock"), JSON.stringify({ ...lock, evals: { ...lock.evals, ghost: lock.evals.toy } }));
    expect(checkLock(root)).toEqual(["MEASUREMENT.lock has an entry for ghost, which declares no measurement (it has no src/measurement.ts)"]);
    writeFileSync(join(root, "MEASUREMENT.lock"), JSON.stringify(lock));
    writeFileSync(join(root, CHANGELOG), "# Changelog\n");
    expect(checkLock(root)).toEqual([
      `toy: ${CHANGELOG} has no entry for the collector at version 1. Use scripts/measurement/run bump, which writes it.`,
      `toy: ${CHANGELOG} has no entry for the scorer at version 1. Use scripts/measurement/run bump, which writes it.`,
    ]);
  });

  test("a missing or broken lock is the one problem", () => {
    const root = repo();
    rmSync(join(root, "MEASUREMENT.lock"));
    expect(checkLock(root)[0]).toContain("MEASUREMENT.lock is missing");
    writeFileSync(join(root, "MEASUREMENT.lock"), "{");
    expect(checkLock(root)).toEqual(["MEASUREMENT.lock is not valid JSON"]);
  });
});

describe("the files a part covers", () => {
  const code = (root: string, path: string, text: string) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  const COLLECT = "evals/toy/src/collect.ts";
  const SCORE = "evals/toy/src/score.ts";

  test("an edit to a file that is only reached through an import fails the check, and the lock lists the files it covers", () => {
    const root = repo();
    code(root, COLLECT, 'import { helper } from "../../../lib/helper.ts";\nexport const collect = helper;\n');
    code(root, "lib/helper.ts", 'import { deep } from "./deep.ts";\nexport const helper = deep;\n');
    code(root, "lib/deep.ts", "export const deep = 1;\n");
    bump(root, "toy", "collector", "first lock entry", DATE);
    const lock = readLock(root);
    expect(lock.evals.toy?.collector.files).toEqual([COLLECT, "lib/deep.ts", "lib/helper.ts", "lib/shared.ts"]);
    expect(lock.evals.toy?.scorer.files).toEqual([SCORE]);
    expect(checkLock(root)).toEqual([]);

    code(root, "lib/deep.ts", "export const deep = 2;\n"); // listed nowhere, and two imports away from the entry point
    const problems = checkLock(root);
    expect(problems.length).toBe(1);
    expect(problems[0]).toMatch(/^toy: the collector changed since MEASUREMENT\.lock was written \(lock [0-9a-f]{12}, files now [0-9a-f]{12}\)\. A change to the collector is a measurement change/);
    expect(listLock(root)).toEqual(["toy: collector v1 (changed, not bumped), scorer v1"]);
    expect(bump(root, "toy", "collector", "deep.ts changed, no score change", DATE)).toBe("toy: collector is now version 2");
    expect(checkLock(root)).toEqual([]);
  });

  test("a new import changes the part, and the check names the file that is now covered, or no longer", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    code(root, "lib/helper.ts", "export const helper = 1;\n");
    code(root, COLLECT, 'import { helper } from "../../../lib/helper.ts";\nexport const collect = helper;\n');
    expect(checkLock(root).join("\n")).toContain("(lock ");
    expect(checkLock(root).join("\n")).toContain("now also covers lib/helper.ts)");
    expect(bump(root, "toy", "collector", "collect.ts uses helper.ts, no score change", DATE)).toBe("toy: collector is now version 2");
    code(root, COLLECT, "export const collect = 1;\n");
    expect(checkLock(root).join("\n")).toContain("no longer covers lib/helper.ts)");
  });

  test("a collector that imports the scorer does not take the scorer's changes, and the scorer's digest is its own", () => {
    const root = repo();
    code(root, COLLECT, 'import { score } from "./score.ts";\nexport const collect = score;\n');
    bump(root, "toy", "collector", "first lock entry", DATE);
    expect(readLock(root).evals.toy?.collector.files).toEqual([COLLECT, "lib/shared.ts"]);
    const before = readLock(root).evals.toy?.collector.sha256;
    code(root, SCORE, "export const score = 2;\n");
    expect(checkLock(root).map((p) => /the (collector|scorer) changed/.exec(p)?.[1])).toEqual(["scorer"]);
    expect(resolvedParts(loadMeasurement("toy", root) as NonNullable<ReturnType<typeof loadMeasurement>>, root).collector.sha256).toBe(before as string);
    code(root, "lib/shared.ts", "export const shared = 2;\n");
    expect(checkLock(root).map((p) => /the (collector|scorer) changed/.exec(p)?.[1])).toEqual(["collector", "scorer"]);
  });

  test("a scorer that imports collector code is refused, whether it reaches a listed file directly or a helper of the collector", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    code(root, SCORE, 'import { collect } from "./collect.ts";\nexport const score = collect;\n');
    const direct = checkLock(root);
    expect(direct.length).toBe(1);
    expect(direct[0]).toContain(`toy: the scorer reaches ${COLLECT} (the scorer reaches it as ${SCORE} -> ${COLLECT}, the collector as ${COLLECT}), which the collector covers.`);
    expect(direct[0]).toContain("A scorer must not depend on collection");
    expect(() => bump(root, "toy", "scorer", "x", DATE)).toThrow("which the collector covers");

    code(root, SCORE, 'import { via } from "../../../lib/via.ts";\nexport const score = via;\n');
    code(root, "lib/via.ts", 'import { shared } from "./shared.ts";\nexport const via = shared;\n');
    expect(checkLock(root)[0]).toContain("the scorer reaches lib/shared.ts (the scorer reaches it as evals/toy/src/score.ts -> lib/via.ts -> lib/shared.ts, the collector as lib/shared.ts)");

    code(root, SCORE, 'import { both } from "../../../lib/both.ts";\nexport const score = both;\n');
    code(root, COLLECT, 'import { both } from "../../../lib/both.ts";\nexport const collect = both;\n');
    code(root, "lib/both.ts", "export const both = 1;\n"); // a helper that neither part lists, reached by both
    expect(checkLock(root)[0]).toContain("the scorer reaches lib/both.ts");
  });

  test("an import that goes nowhere is named, so the files a part covers are never guessed", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    code(root, COLLECT, 'import { gone } from "./gone.ts";\nexport const collect = gone;\n');
    expect(checkLock(root)).toEqual([`toy: ${COLLECT} imports ./gone.ts, which does not exist`]);
  });
});

describe("bump", () => {
  test("gives an eval with no entry both parts at version 1, with a changelog row each", () => {
    const root = repo();
    expect(bump(root, "toy", "scorer", "harness-v3: first lock entry", DATE)).toBe("toy: first lock entry, collector and scorer at version 1");
    const lock = readLock(root);
    expect(lock.evals.toy?.collector).toMatchObject({ version: 1, files: ["evals/toy/src/collect.ts", "lib/shared.ts"] });
    expect(lock.evals.toy?.scorer).toMatchObject({ version: 1, files: ["evals/toy/src/score.ts"] });
    const rows = readFileSync(join(root, CHANGELOG), "utf8").split("\n").filter((l) => l.startsWith("| 2026"));
    expect(rows).toEqual([
      `| 2026-10-12 | toy | collector | 1 | harness-v3: first lock entry | ${lock.evals.toy?.collector.sha256.slice(0, 12)} |`,
      `| 2026-10-12 | toy | scorer | 1 | harness-v3: first lock entry | ${lock.evals.toy?.scorer.sha256.slice(0, 12)} |`,
    ]);
  });

  test("raises the version of the part that changed, takes its digest and writes the reason; the other part stays", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    const before = readLock(root);
    edit(root, "evals/toy/src/score.ts", "export const score = 2;\n");
    expect(bump(root, "toy", "scorer", "no score change | a refactor", DATE)).toBe("toy: scorer is now version 2");
    const after = readLock(root);
    expect(after.evals.toy?.scorer.version).toBe(2);
    expect(after.evals.toy?.scorer.sha256).not.toBe(before.evals.toy?.scorer.sha256);
    expect(after.evals.toy?.collector).toEqual(before.evals.toy?.collector);
    expect(readFileSync(join(root, CHANGELOG), "utf8")).toContain("| 2026-10-12 | toy | scorer | 2 | no score change \\| a refactor |");
    expect(checkLock(root)).toEqual([]);
  });

  test("refuses a bump with no reason, a part that has not changed, and an eval that declares nothing", () => {
    const root = repo();
    expect(() => bump(root, "toy", "collector", "  ", DATE)).toThrow("a bump needs --reason");
    bump(root, "toy", "collector", "first lock entry", DATE);
    expect(() => bump(root, "toy", "collector", "again", DATE)).toThrow("toy: the collector has not changed since the lock was written, so there is nothing to bump");
    expect(() => bump(root, "nothing", "scorer", "x", DATE)).toThrow("nothing declares no measurement: it has no src/measurement.ts");
  });

  test("harness raises the version every run records, and writes a row for all evals", () => {
    const root = repo();
    expect(bump(root, "harness", "harness", "a deliberate break of every eval", DATE)).toBe("harness_version is now 4");
    expect(readLock(root).harness_version).toBe(4);
    expect(readFileSync(join(root, CHANGELOG), "utf8")).toContain("| 2026-10-12 | all | harness | 4 | a deliberate break of every eval | - |");
  });
});

describe("listLock", () => {
  test("shows each eval's parts, and a part that changed without a bump", () => {
    const root = repo();
    bump(root, "toy", "collector", "first lock entry", DATE);
    expect(listLock(root)).toEqual(["toy: collector v1, scorer v1"]);
    edit(root, "lib/shared.ts", "export const shared = 2;\n");
    expect(listLock(root)).toEqual(["toy: collector v1 (changed, not bumped), scorer v1"]);
  });
});

describe("this repository", () => {
  test("MEASUREMENT.lock matches the files of every eval that declares a measurement", () => {
    expect(checkLock(REPO_ROOT)).toEqual([]);
    expect(readLock(REPO_ROOT).harness_version).toBeGreaterThanOrEqual(3);
  });

  test("the command checks, lists and refuses what it should", () => {
    const run = (...args: string[]) => {
      const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { stdout: "pipe", stderr: "pipe" });
      return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
    };
    expect(run("check")).toMatchObject({ code: 0 });
    expect(run("check").out).toContain("MEASUREMENT.lock matches the files of");
    expect(run("list").out).toContain("reflect: collector v");
    expect(run("bump", "reflect", "scorer")).toMatchObject({ code: 2 });
    expect(run("bump", "reflect", "scorer").err).toContain("bump needs --reason");
    expect(run("bump", "reflect")).toMatchObject({ code: 2 });
    expect(run("nonsense").code).toBe(2);
    expect(run("--help").out).toContain("Usage: scripts/measurement/run check");
  });
});
