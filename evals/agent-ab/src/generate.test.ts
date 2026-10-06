import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { generate, harmonize, isFictional, leftovers, libraryOf, restoreNumbers } from "./generate.ts";
import { taskNames } from "./run.ts";

const EVAL_DIR = join(import.meta.dir, "..");

describe("harmonize", () => {
  test("gives a port that is also a number the number's replacement, and leaves the rest", () => {
    const map = { ports: { "6060": "4255", "8080": "7096" }, numbers: { "6060": "4918", "15": "16" } };
    expect(harmonize(map)).toEqual(["6060"]);
    expect(map.ports).toEqual({ "6060": "4918", "8080": "7096" });
    expect(map.numbers).toEqual({ "6060": "4918", "15": "16" });
  });

  test("does nothing when there is no overlap", () => {
    const map = { ports: { "9000": "5000" }, numbers: { "30": "25" } };
    expect(harmonize(map)).toEqual([]);
  });
});

describe("restoreNumbers", () => {
  const publicToml = ['name = "a/b"', "timeout_sec = 600.0", "budget_tokens = 25000", 'description = "30-day retention"', ""].join("\n");
  const privateToml = ['name = "a/c"', "timeout_sec = 864.0", "budget_tokens = 17913", 'description = "25-day retention"', ""].join("\n");

  test("puts back the lines that only set a number and keeps the rewritten text", () => {
    expect(restoreNumbers(publicToml, privateToml)).toBe(['name = "a/c"', "timeout_sec = 600.0", "budget_tokens = 25000", 'description = "25-day retention"', ""].join("\n"));
  });

  test("refuses a rewrite that changed the number of lines", () => {
    expect(() => restoreNumbers(publicToml, "one line")).toThrow("number of lines");
  });
});

describe("leftovers", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-ab-left-"));
  const file = (name: string, text: string) => {
    writeFileSync(join(dir, name), text);
    return join(dir, name);
  };
  const map = { words: { drillbit: "dubatuvo", akm: "akm", s3: "t3" } };

  test("finds a renamed word that is still there, in any case and inside an identifier", () => {
    expect(leftovers(map, [file("a.txt", "run Drillbit now")])).toEqual([`drillbit in ${join(dir, "a.txt")}`]);
    expect(leftovers(map, [file("b.txt", "DRILLBIT_HOST=x")])).toHaveLength(1);
  });

  test("ignores a word inside a longer word, one in a URL, a word kept as it is and a short word", () => {
    expect(leftovers(map, [file("c.txt", "see https://drillbit.example/docs and drillbits, akm show, s3")])).toEqual([]);
  });

  test("passes a clean file", () => {
    expect(leftovers(map, [file("d.txt", "dubatuvo scale")])).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("the public tasks", () => {
  test("six name made-up tools, and each of them has a library", () => {
    const tasks = taskNames(join(EVAL_DIR, "tasks"));
    const fictional = tasks.filter((t) => isFictional(join(EVAL_DIR, "tasks", t)));
    expect(fictional).toHaveLength(6);
    expect(fictional.every((t) => t.startsWith("drillbit--") || t.startsWith("inkwell--"))).toBe(true);
    expect(new Set(fictional.map((t) => libraryOf(join(EVAL_DIR, "tasks", t))))).toEqual(new Set(["drillbit", "inkwell"]));
  });
});

describe("generate", () => {
  /** A public folder of three fictional tasks and the library they seed: one sound, one whose answer holds no name or number to rewrite, one whose solution is wrong. */
  function fixture(): string {
    const root = mkdtempSync(join(tmpdir(), "agent-ab-gen-"));
    const put = (rel: string, text: string, mode = 0o644) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
      chmodSync(join(root, rel), mode);
    };
    const task = (name: string, instruction: string, solve: string, verify: string) => {
      put(`tasks/${name}/task.toml`, `[task]\nname = "akm-eval/${name}"\n\n[metadata]\ntools = "fictional"\n\n[agent]\ntimeout_sec = 600.0\n\n[environment.env]\nAKM_TASK_STASH = "drillbit"\n`);
      put(`tasks/${name}/instruction.md`, instruction);
      put(`tasks/${name}/solution/solve.sh`, `#!/bin/bash\n${solve}\n`, 0o755);
      put(`tasks/${name}/tests/verify.sh`, `#!/usr/bin/env bash\n${verify}\n`, 0o755);
      put(`tasks/${name}/tests/test.sh`, "#!/bin/bash\n# pytest runs here, and the rewrite must not touch this\n", 0o755);
      put(`tasks/${name}/environment/Dockerfile`, "FROM ubuntu:24.04\nRUN pip install pytest==8.4.1\n");
    };
    task("drillbit--scale", "Append to `commands.txt` the `drillbit` command that scales `dev-edge` to 40 replicas.", 'echo "drillbit scale dev-edge --replicas 40" >> commands.txt', '[ "$(cat commands.txt)" = "drillbit scale dev-edge --replicas 40" ]');
    task("drillbit--plain", "Write `hello` to `out.txt`.", "echo hello > out.txt", '[ "$(cat out.txt)" = "hello" ]');
    task("drillbit--wrong", "Append to `commands.txt` the `drillbit` command that scales `dev-edge` to 40 replicas.", "echo nothing", '[ "$(cat commands.txt)" = "drillbit scale dev-edge --replicas 40" ]');
    put("libraries/drillbit/skills/drillbit/SKILL.md", "---\ndescription: Operate drillbit\n---\n# drillbit\n\nScale with `drillbit scale <cluster> --replicas <n>`, for example `drillbit scale x --replicas 40`.\n");
    return root;
  }

  test("keeps the sound task, leaves out the two that fail the proof, and keeps the plumbing as it was", () => {
    const from = fixture();
    const out = mkdtempSync(join(tmpdir(), "agent-ab-out-"));
    try {
      const r = generate({ seed: "7", out, from });
      expect(r.kept).toHaveLength(1);
      expect(r.kept[0]).toMatch(/^[a-z]+--scale$/);
      expect(r.kept[0]).not.toContain("drillbit");
      expect(r.leftOut.map((t) => t.why.join(" "))).toEqual(
        expect.arrayContaining([expect.stringContaining("the answer did not change"), expect.stringContaining("the solution does not pass the verifier")]),
      );
      expect(r.problems).toEqual([]);

      const dir = join(out, "assets", "tasks", r.kept[0]);
      expect(readFileSync(join(dir, "environment", "Dockerfile"), "utf8")).toBe("FROM ubuntu:24.04\nRUN pip install pytest==8.4.1\n");
      expect(readFileSync(join(dir, "tests", "test.sh"), "utf8")).toContain("pytest runs here");
      const toml = readFileSync(join(dir, "task.toml"), "utf8");
      expect(toml).toContain("timeout_sec = 600.0");
      const library = readdirSync(join(out, "assets", "libraries"));
      expect(library).toHaveLength(1);
      expect(library[0]).not.toBe("drillbit");
      expect(toml).toContain(`AKM_TASK_STASH = "${library[0]}"`);
      expect(readFileSync(join(dir, "instruction.md"), "utf8")).not.toContain("drillbit");
      expect(existsSync(join(out, "map.json"))).toBe(true);
      expect(existsSync(join(out, ".work"))).toBe(false);
    } finally {
      rmSync(from, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("the same seed gives the same private tasks", () => {
    const from = fixture();
    const [a, b] = [mkdtempSync(join(tmpdir(), "agent-ab-out-")), mkdtempSync(join(tmpdir(), "agent-ab-out-"))];
    try {
      const one = generate({ seed: "7", out: a, from });
      const two = generate({ seed: "7", out: b, from });
      expect(two.kept).toEqual(one.kept);
      expect(readFileSync(join(b, "assets", "tasks", one.kept[0], "solution", "solve.sh"), "utf8")).toBe(readFileSync(join(a, "assets", "tasks", one.kept[0], "solution", "solve.sh"), "utf8"));
    } finally {
      for (const d of [from, a, b]) rmSync(d, { recursive: true, force: true });
    }
  });
});
