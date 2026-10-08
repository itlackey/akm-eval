import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repeatRuns, spreadOf } from "./repeat.ts";
import { RUNNING, makeResultsDir } from "./results.ts";

const DAY = new Date().toISOString().slice(0, 10);
const parents: string[] = [];
afterEach(() => {
  for (const d of parents.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("spreadOf", () => {
  test("replaces every number by its min, max and mean, in the shape of the metrics", () => {
    const spread = spreadOf([
      { recall: { value: 0.5, accepted: 3, of: 6 }, by_category: { stale: { n: 4, rate: 0.25 } }, outcomes: { good: { accept: 3 } } },
      { recall: { value: 1, accepted: 6, of: 6 }, by_category: { stale: { n: 4, rate: 0.5 } }, outcomes: { good: { accept: 6 } } },
      { recall: { value: 0.75, accepted: 4.5, of: 6 }, by_category: { stale: { n: 4, rate: 0.75 } }, outcomes: { good: { accept: 4 } } },
    ]);
    expect(spread).toEqual({
      recall: { value: { min: 0.5, max: 1, mean: 0.75 }, accepted: { min: 3, max: 6, mean: 4.5 }, of: { min: 6, max: 6, mean: 6 } },
      by_category: { stale: { n: { min: 4, max: 4, mean: 4 }, rate: { min: 0.25, max: 0.75, mean: 0.5 } } },
      outcomes: { good: { accept: { min: 3, max: 6, mean: 4.3333 } } },
    });
  });

  test("a null is left out of the spread, and a number that is null in every run is null", () => {
    expect(spreadOf([{ rate: null, share: null }, { rate: 0.5, share: null }, { rate: 1, share: null }])).toEqual({ rate: { min: 0.5, max: 1, mean: 0.75 }, share: null });
  });

  test("a key that only some runs have is spread over those runs", () => {
    expect(spreadOf([{ by_class: { a: { n: 2 } } }, { by_class: { a: { n: 4 }, b: { n: 1 } } }])).toEqual({ by_class: { a: { n: { min: 2, max: 4, mean: 3 } }, b: { n: { min: 1, max: 1, mean: 1 } } } });
  });
});

describe("repeatRuns", () => {
  const make = (parent: string) => async (label: string) => {
    const results_dir = makeResultsDir(parent, label);
    return { eval: "t", corpus: "public", model: "m", akm_version: "1", akm_bin: "akm", akm_build: null, n_errored: label.endsWith("r2") ? 2 : 0, metrics: { score: label.endsWith("r1") ? 1 : label.endsWith("r2") ? 3 : 0 }, results_dir };
  };

  test("without --repeat runs once under the label and writes nothing else", async () => {
    const parent = mkdtempSync(join(tmpdir(), "repeat-test-"));
    parents.push(parent);
    const runs = await repeatRuns(undefined, "base", make(parent));
    expect(runs).toHaveLength(1);
    expect(readdirSync(parent)).toEqual([`${DAY}-base`]);
  });

  test("with --repeat N runs N labelled folders and writes one repeat-summary.json next to them", async () => {
    const parent = mkdtempSync(join(tmpdir(), "repeat-test-"));
    parents.push(parent);
    const runs = await repeatRuns(2, "base", make(parent));
    expect(runs).toHaveLength(2);
    const files = readdirSync(parent).sort();
    expect(files).toEqual([`${DAY}-base-r1`, `${DAY}-base-r2`, expect.stringMatching(/^\d{4}-\d{2}-\d{2}-base-repeat-summary\.json$/)]);
    const stored = JSON.parse(readFileSync(join(parent, files[2]), "utf8"));
    expect(stored).toMatchObject({ eval: "t", corpus: "public", label: "base", repeat: 2, model: "m", akm_version: "1", akm_bin: "akm", akm_build: null, runs: [`${DAY}-base-r1`, `${DAY}-base-r2`], n_errored: { min: 0, max: 2, mean: 1 }, metrics: { score: { min: 1, max: 3, mean: 2 } } });
    expect(stored.seconds.min).toBeGreaterThanOrEqual(0); // wall time of each run
    expect(stored.seconds.max).toBeGreaterThanOrEqual(stored.seconds.min);
  });

  test("each run's .running file is gone when that run is done, while the next run is still going", async () => {
    const parent = mkdtempSync(join(tmpdir(), "repeat-test-"));
    parents.push(parent);
    const marker = (label: string) => join(parent, `${DAY}-${label}`, RUNNING);
    const seen: boolean[] = [];
    await repeatRuns(3, "base", async (label) => {
      const run = await make(parent)(label);
      if (label.endsWith("r2")) seen.push(existsSync(marker("base-r1")), existsSync(marker("base-r2")));
      if (label.endsWith("r3")) seen.push(existsSync(marker("base-r2")), existsSync(marker("base-r3")));
      return run;
    });
    expect(seen).toEqual([false, true, false, true]);
    expect(existsSync(marker("base-r3"))).toBe(false);
  });
});
