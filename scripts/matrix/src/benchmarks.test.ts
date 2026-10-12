// The confirm stage runs longmemeval and skillret with --repeat 3, as it runs the evals, and judges their rows.

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fakeAkmScript as memoriesAkm, writePublicAssets } from "../../../benchmarks/longmemeval/src/fakes.ts";
import { fakeAkmScript as skillsAkm, writeAssets } from "../../../benchmarks/skillret/src/fakes.ts";
import { commandLine } from "../../../lib/akm/akm.ts";

const REPO = resolve(import.meta.dir, "..", "..", "..");
const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "matrix-benchmarks-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("the confirm stage runs the two benchmarks with --repeat 3 and judges their rows", () => {
  /** Six skills and four requests for the fake akm of skillret to rank: a request needs one, two or three of them. */
  const SPLIT = {
    skills: [["t1", "git commit messages review staged changes"], ["t2", "docker container compose networking"], ["t3", "postgres database migration schema"], ["t4", "react component hooks state"], ["t5", "kubernetes deployment helm charts"], ["t6", "python testing pytest fixtures"]] as [string, string][],
    queries: [["q1", "review my staged changes and write commit messages", ["t1"]], ["q2", "compose containers with docker and migrate the postgres database schema", ["t2", "t3"]], ["q3", "react hooks, helm charts on kubernetes deployment", ["t4", "t5", "t6"]], ["q4", "docker networking", ["t2"]]] as [string, string, string[]][],
  };

  /**
   * A repository root of its own, as the runner finds its root: the matrix, compare and rescore, and lib/ of this checkout, the benchmark with
   * its run script and a tiny dataset, and a matrix file with a baseline and a config. The config runs another akm, one that answers with `fewer`
   * results than it is asked for, so its row has the build treatment. Both akms are scripts in a folder of their own.
   */
  function sweep(name: "skillret" | "longmemeval", flags: string[], fake: (dir: string) => string, assets: (folder: string) => void, fewer: string) {
    const root = tmp();
    for (const from of ["lib", "scripts/matrix/src", "scripts/compare/src", "scripts/rescore/src", `benchmarks/${name}/src`]) {
      cpSync(join(REPO, from), join(root, from), { recursive: true, filter: (src) => !["node_modules", "fixtures"].includes(basename(src)) && !src.endsWith(".test.ts") });
    }
    cpSync(join(REPO, "benchmarks", name, "run"), join(root, "benchmarks", name, "run"));
    assets(join(root, "benchmarks", name, "assets"));
    const bin = tmp();
    const good = fake(bin);
    const text = readFileSync(good, "utf8");
    const was = 'const k = Number(rest[rest.indexOf("--limit") + 1]);';
    expect(text).toContain(was);
    const worse = join(bin, "worse-akm.ts");
    writeFileSync(worse, text.replace(was, `const k = ${fewer};`));
    const akm = (script: string) => commandLine(["bun", script]);
    writeFileSync(join(root, "matrix.json"), JSON.stringify({ prefix: "sw", repeats: 3, baseline: { name: "base", eval: name, args: [...flags, "--akm", akm(good)] }, configs: [{ name: "cfg", eval: name, args: [...flags, "--akm", akm(worse)] }] }));
    const out = join(root, "matrix-results");
    return {
      root,
      out,
      results: join(root, "benchmarks", name, "results"),
      async confirm() {
        const proc = Bun.spawn([process.execPath, join(root, "scripts", "matrix", "src", "run.ts"), join(root, "matrix.json"), "--stage", "confirm", "--only", "cfg", "--out", out], { cwd: root, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? root, TMPDIR: process.env.TMPDIR ?? tmpdir() }, stdout: "pipe", stderr: "pipe" });
        const [stdout, stderr, code] = [await new Response(proc.stdout).text(), await new Response(proc.stderr).text(), await proc.exited];
        return { code, out: stdout + stderr };
      },
      state: (): Record<string, any> => JSON.parse(readFileSync(join(out, "state.json"), "utf8")),
      decision: (): { rows: Record<string, any>[] } => JSON.parse(readFileSync(join(out, "decision.json"), "utf8")),
    };
  }

  const cases = {
    skillret: () => sweep("skillret", ["--limit", "3"], skillsAkm, (folder) => writeAssets(folder, SPLIT, { skills: [["s1", "train skill"]], queries: [["p1", "a request", ["s1"]]] }), "1"),
    longmemeval: () => sweep("longmemeval", ["--retrieval-only"], memoriesAkm, (folder) => writePublicAssets(folder), "0"),
  };
  const main = { skillret: "search.NDCG@10", longmemeval: "retrieval.hit_rate" };

  for (const name of ["skillret", "longmemeval"] as const) {
    test(`${name}: the baseline and the config run --repeat 3 and a row has a verdict`, async () => {
      const t = cases[name]();
      const r = await t.confirm();
      expect(r.code, r.out).toBe(0);
      expect(r.out).toContain("--repeat 3 --label sw-base-c");
      expect(r.out).toContain("--repeat 3 --label sw-cfg-c");
      // each side is three runs and a repeat summary beside them, which the state points at
      const names = readdirSync(t.results).map((n) => n.replace(/^\d{4}-\d{2}-\d{2}-/, "")).sort();
      expect(names).toEqual(["sw-base-c-r1", "sw-base-c-r2", "sw-base-c-r3", "sw-base-c-repeat-summary.json", "sw-cfg-c-r1", "sw-cfg-c-r2", "sw-cfg-c-r3", "sw-cfg-c-repeat-summary.json"]);
      for (const side of ["base", "cfg"]) expect(t.state().confirm[side]).toMatchObject({ exit_code: 0, repeat: 3, results: [{ scope: "", kind: "repeat" }] });
      for (const dir of readdirSync(t.results).filter((n) => !n.endsWith(".json"))) expect(existsSync(join(t.results, dir, ".running")), dir).toBe(false);
      // the config answers with fewer results, and the row says it is worse, from three runs of each side, case by case
      const [row] = t.decision().rows;
      expect(row).toMatchObject({ config: "cfg", eval: name, stage: "confirm", n: 3, verdict: "worse", exploratory: [], treatment: ["build"], rescored: true });
      expect(row?.metrics.find((x: any) => x.path === main[name])).toMatchObject({ role: "main", signal: "worse" });
      expect(row?.paired).toMatchObject({ repeats: { baseline: 3, config: 3 } });
      expect(row?.paired.worse).toBeGreaterThan(0);
      expect(row?.paired.better).toBe(0);
    }, 180_000);
  }
});
