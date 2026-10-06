import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox, removeSandbox, runAkm, runAkmJson } from "../../../lib/akm/akm.ts";
import { PINS } from "../../../lib/harbor/harbor.ts";
import { type Trial, buildReport } from "../../../lib/harbor/report.ts";
import { LIBRARY_ASSETS, jobConfig, libraryOf, otherDigests, readLock, selectTasks, sideBySide, summarize } from "./run.ts";

const BENCH_DIR = join(import.meta.dir, "..");
const lock = readLock();
const CANARY = ["terminal-bench", "canary"].join("-"); // written so this file does not hold it

describe("the lock", () => {
  test("pins the dataset by digest, and names its 89 tasks and the ten of Harbor's sample", () => {
    expect(lock.registry).toBe("terminal-bench/terminal-bench-2-1");
    expect(lock.ref).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lock.licence).toBe("Apache-2.0");
    expect(Object.keys(lock.tasks)).toHaveLength(89);
    for (const digest of Object.values(lock.tasks)) expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lock.sample).toHaveLength(10);
    for (const t of lock.sample) expect(lock.tasks[t]).toBeDefined();
  });

  test("is the only thing of the benchmark's data in this folder: no task, no solution, no test, no canary", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "results") continue;
        if (e.isDirectory()) walk(join(dir, e.name));
        else files.push(join(dir, e.name));
      }
    };
    walk(BENCH_DIR);
    for (const f of files) {
      expect(f).not.toMatch(/(instruction\.md|solve\.sh|task\.toml|test\.sh|Dockerfile)$/);
      expect(readFileSync(f, "utf8")).not.toContain(CANARY);
    }
  });
});

describe("selectTasks", () => {
  const small = { sample: ["m", "c"], tasks: { a: "", b: "", c: "", d: "", m: "", z: "" } };

  test("takes every task without a limit, the sample first and then the others by name", () => {
    expect(selectTasks(small)).toEqual(["m", "c", "a", "b", "d", "z"]);
  });

  test("takes the first N of that order, so a longer run holds the shorter one", () => {
    expect(selectTasks(small, 1)).toEqual(["m"]);
    expect(selectTasks(small, 2)).toEqual(["m", "c"]);
    expect(selectTasks(small, 4)).toEqual(["m", "c", "a", "b"]);
    expect(selectTasks(small, 50)).toEqual(selectTasks(small));
  });

  test("with the real lock, --limit 10 is Harbor's sample and a full run is all 89 tasks once", () => {
    expect(selectTasks(lock, 10)).toEqual(lock.sample);
    const all = selectTasks(lock);
    expect(all).toHaveLength(89);
    expect(new Set(all).size).toBe(89);
    expect(all.slice(0, 10)).toEqual(lock.sample);
    expect(selectTasks(lock, 25)).toEqual(all.slice(0, 25));
  });
});

describe("jobConfig", () => {
  const tasks = selectTasks(lock, 10);
  const cfg = jobConfig({ name: "terminal-bench-public", model: "openai/gpt-6-luna", lock, tasks, librariesDir: "/l", jobsDir: "/j" }) as any;
  const [control, akm] = cfg.agents;

  test("fetches the pinned dataset by its digest, and only the tasks asked for, under their registry names", () => {
    expect(cfg.datasets).toEqual([{ name: "terminal-bench/terminal-bench-2-1", ref: lock.ref, task_names: tasks.map((t) => `terminal-bench/${t}`) }]);
    expect(cfg.datasets[0].version).toBeUndefined();
  });

  test("runs each task once per arm, four trials at a time, on the pins", () => {
    expect(cfg.n_attempts).toBe(1);
    expect(cfg.n_concurrent_trials).toBe(4);
    expect(control.kwargs.version).toBe(PINS.opencode);
    expect(akm.kwargs).toMatchObject({ akm_cli_version: PINS.akm_cli, akm_plugin_version: PINS.akm_plugin });
  });

  test("tells the akm arm which library to seed, for every task, and how many assets akm should index in it", () => {
    expect(akm.env).toEqual({ AKM_TASK_STASH: "library" });
    expect(akm.kwargs).toMatchObject({ libraries_dir: "/l", library_assets: LIBRARY_ASSETS });
    expect(JSON.stringify(control)).not.toContain("akm");
    expect(control.env).toBeUndefined();
  });

  test("keeps the task's own time limits, and holds no credential", () => {
    expect(JSON.stringify(cfg)).not.toMatch(/timeout_multiplier|override_timeout_sec|override_cpus|override_memory/);
    expect(JSON.stringify(cfg)).not.toMatch(/api_?key|token|secret/i);
  });
});

describe("summarize", () => {
  const [one, two] = lock.sample;
  const result = (task: string, agent: string, over: Record<string, unknown> = {}) => ({
    task_name: `terminal-bench/${task}`,
    task_id: { org: "terminal-bench", name: task, ref: lock.tasks[task] },
    agent_info: { name: agent },
    agent_result: { n_input_tokens: 1000, n_cache_tokens: 900, n_output_tokens: 50, cost_usd: 0.01 },
    verifier_result: { rewards: { reward: 1 } },
    exception_info: null,
    started_at: "2026-10-06T04:00:00Z",
    finished_at: "2026-10-06T04:10:00Z",
    agent_execution: { started_at: "2026-10-06T04:01:00Z", finished_at: "2026-10-06T04:09:00Z" },
    ...over,
  });

  /** A results folder as a run leaves it: one Harbor job with these trials in it. */
  function runDir(trials: Record<string, unknown>): string {
    const dir = mkdtempSync(join(tmpdir(), "terminal-bench-test-"));
    for (const [name, r] of Object.entries(trials)) {
      mkdirSync(join(dir, "jobs", "terminal-bench-public", name, "agent"), { recursive: true });
      writeFileSync(join(dir, "jobs", "terminal-bench-public", name, "result.json"), JSON.stringify(r));
    }
    return dir;
  }

  test("writes the report, the dataset the trials ran and one line per trial", () => {
    const dir = runDir({
      [`${one}__a`]: result(one, "opencode", { verifier_result: { rewards: { reward: 0 } }, exception_info: { exception_type: "AgentTimeoutError" } }),
      [`${one}__b`]: result(one, "akm-opencode"),
      [`${two}__a`]: result(two, "opencode"),
      [`${two}__b`]: result(two, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "RuntimeError" } }),
    });
    try {
      const s = summarize({ corpus: "public", label: "t", model: "openai/x", limit: 10, lock, tasks: lock.sample, dir, exit: 0 });
      const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
      expect(stored).toMatchObject({ eval: "terminal-bench", corpus: "public", model: "openai/x", limit: 10, n_tasks: 10, attempts: 1, harbor_exit: 0 });
      expect(stored.dataset).toEqual({ name: lock.registry, ref: lock.ref, source: lock.source, licence: lock.licence, tasks_in_dataset: 89, tasks_run_with_another_digest: [] });
      expect(stored.library).toEqual({ path: "corpus/library", assets: LIBRARY_ASSETS });
      expect(stored.results_dir).toBeUndefined();
      expect(s.report.control).toMatchObject({ trials: 2, scored: 2, timeouts: 1, passed: 1 });
      expect(s.report.akm).toMatchObject({ trials: 2, scored: 1, errored: 1 });
      expect(readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("names a task that ran with a digest other than the lock's", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode", { task_id: { org: "terminal-bench", name: one, ref: `sha256:${"0".repeat(64)}` } }), [`${two}__a`]: result(two, "opencode") });
    try {
      expect(summarize({ corpus: "public", label: "t", model: "openai/x", lock, tasks: lock.sample, dir, exit: 0 }).dataset.tasks_run_with_another_digest).toEqual([one]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("libraryOf", () => {
  test("is the public library for the public corpus and the private copy evals/retrieval makes for the private one", () => {
    expect(libraryOf("public")).toBe(join(BENCH_DIR, "..", "..", "corpus", "library"));
    expect(libraryOf("private")).toBe(join(BENCH_DIR, "..", "..", "private", "retrieval", "assets", "library"));
    expect(existsSync(join(libraryOf("public"), "skills"))).toBe(true);
  });
});

describe("otherDigests", () => {
  const trial = (task: string, digest: string | null | undefined): Trial => ({ task, arm: "control", trial: task, reward: 1, error: null, akm: null, tools: 1, tokens: null, costUsd: null, seconds: 1, digest });
  const name = lock.sample[0];
  const digest = lock.tasks[name];

  test("finds the tasks that ran with another digest than the lock's", () => {
    expect(otherDigests([trial(name, digest), trial(name, digest)], lock)).toEqual([]);
    expect(otherDigests([trial(name, `sha256:${"0".repeat(64)}`), trial(name, digest)], lock)).toEqual([name]);
  });

  test("flags a task the lock does not know, and skips a trial that recorded no digest", () => {
    expect(otherDigests([trial("not-a-task", "abc")], lock)).toEqual(["not-a-task"]);
    expect(otherDigests([trial(name, null), trial(name, undefined)], lock)).toEqual([]);
  });
});

describe("sideBySide", () => {
  test("is the shared table under this benchmark's name", () => {
    const empty = buildReport([]);
    const lines = sideBySide({ corpus: "public", report: empty }, { corpus: "private", report: empty });
    expect(lines[0]).toBe("terminal-bench: public and private side by side (not pooled)");
  });
});

/** The akm on this machine, when there is one. */
function realAkm(): boolean {
  const cmd = (process.env.AKM_BIN?.trim() || "akm").split(/\s+/);
  try {
    return Bun.spawnSync([...cmd, "--version"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
  } catch {
    return false;
  }
}

describe.skipIf(!realAkm())("with the akm on this machine", () => {
  /** The assets akm indexes in a library, seeded as the akm arm does it: the type folders copied into a new bundle. Facts are the scaffold's. */
  async function indexed(library: string): Promise<number> {
    const sandbox = createSandbox("terminal-bench-test");
    try {
      const bundle = join(sandbox.dir, "bundle");
      await runAkm(sandbox, ["bundle", "create", "--dir", bundle, "--set-default"]);
      for (const e of readdirSync(library, { withFileTypes: true })) if (e.isDirectory()) cpSync(join(library, e.name), join(bundle, e.name), { recursive: true });
      await runAkm(sandbox, ["index", "--full"]);
      const info = await runAkmJson<{ indexStats: { byType: Record<string, number> } }>(sandbox, ["info", "-q"]);
      return Object.entries(info.indexStats.byType).reduce((n, [type, count]) => n + (type === "fact" ? 0 : count), 0);
    } finally {
      removeSandbox(sandbox);
    }
  }

  test("the public library holds the number of assets the akm arm's setup checks for, though it has more files", async () => {
    expect(await indexed(libraryOf("public"))).toBe(LIBRARY_ASSETS);
  }, 120_000);

  test.skipIf(!existsSync(libraryOf("private")))("and so does the private copy", async () => {
    expect(await indexed(libraryOf("private"))).toBe(LIBRARY_ASSETS);
  }, 120_000);
});
