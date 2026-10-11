import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AkmArm, PINS, modelSettings, pinsOf, sha256Dir } from "../../../lib/harbor/harbor.ts";
import { type Trial, buildReport } from "../../../lib/harbor/report.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { jobConfig, libraryOf, measureLibrary, otherDigests, readLock, runCorpus, selectTasks, sideBySide, summarize } from "./run.ts";

const BENCH_DIR = join(import.meta.dir, "..");
const lock = readLock();
const CANARY = ["terminal-bench", "canary"].join("-"); // written so this file does not hold it

const dirs: string[] = [];
const akmBin = process.env.AKM_BIN;
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  if (akmBin === undefined) delete process.env.AKM_BIN;
  else process.env.AKM_BIN = akmBin;
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "terminal-bench-test-"));
  dirs.push(d);
  return d;
};

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
  const base = { name: "terminal-bench-public", model: "openai/gpt-6-luna", lock, tasks, librariesDir: "/l", jobsDir: "/j" };
  const cfg = jobConfig({ ...base, libraryAssets: 259 }) as any;
  const [control, akm] = cfg.agents;

  test("fetches the pinned dataset by its digest, and only the tasks asked for, under their registry names", () => {
    expect(cfg.datasets).toEqual([{ name: "terminal-bench/terminal-bench-2-1", ref: lock.ref, task_names: tasks.map((t) => `terminal-bench/${t}`) }]);
    expect(cfg.datasets[0].version).toBeUndefined();
  });

  test("runs each task once per arm by default, four trials at a time, on the pins", () => {
    expect(cfg.n_attempts).toBe(1);
    expect(cfg.n_concurrent_trials).toBe(4);
    expect(control.kwargs.version).toBe(PINS.opencode);
    expect(akm.kwargs).toMatchObject({ akm_cli_version: PINS.akm_cli, akm_plugin_version: PINS.akm_plugin });
  });

  test("runs each task as many times per arm as --attempts says", () => {
    expect((jobConfig({ ...base, attempts: 5 }) as any).n_attempts).toBe(5);
  });

  test("tells the akm arm which library to seed, for every task, and how many assets akm should index in it", () => {
    expect(akm.env).toEqual({ AKM_TASK_STASH: "library" });
    expect(akm.kwargs).toMatchObject({ libraries_dir: "/l", library_assets: 259 });
    expect(JSON.stringify(control)).not.toContain("akm");
    expect(control.env).toBeUndefined();
  });

  test("asks for at least one asset when the library's were not counted", () => {
    expect((jobConfig(base) as any).agents[1].kwargs.library_assets).toBe(1);
    expect((jobConfig({ ...base, libraryAssets: null }) as any).agents[1].kwargs.library_assets).toBe(1);
  });

  test("gives the akm arm the akm under test and the extra settings, and the control arm none of it", () => {
    const arm: AkmArm = { bin: "~/akm", build: "abc", cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: PINS.akm_plugin, tarball: null }, packages: "/pack" };
    const swept = jobConfig({ ...base, arm, packagesDir: "/run/akm-packages", akmEnv: { AKM_CURATE_TIMEOUT: "30" } }) as any;
    expect(swept.agents[1].kwargs).toMatchObject({ akm_cli_version: "0.9.27", packages_dir: "/run/akm-packages", akm_package: "akm-cli-0.9.27.tgz", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(swept.agents[0]).toEqual(control);
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
    const dir = tmp();
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
    const s = summarize({ corpus: "public", label: "t", model: "openai/x", limit: 10, lock, tasks: lock.sample, dir, exit: 0 });
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ eval: "terminal-bench", corpus: "public", model: "openai/x", limit: 10, n_tasks: 10, attempts: 1, harbor_exit: 0 });
    expect(stored.dataset).toEqual({ name: lock.registry, ref: lock.ref, source: lock.source, licence: lock.licence, tasks_in_dataset: 89, tasks_run_with_another_digest: [] });
    expect(stored.library).toEqual({ path: "corpus/library", assets: null, measured_with: null, sha256: null });
    expect(stored.results_dir).toBeUndefined();
    expect(s.report.control).toMatchObject({ trials: 2, scored: 2, timeouts: 1, passed: 1 });
    expect(s.report.akm).toMatchObject({ trials: 2, scored: 1, errored: 1 });
    expect(readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n")).toHaveLength(4);
  });

  test("names the akm as the other evals do, the settings it ran with, and what the run was made of", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode"), [`${one}__b`]: result(one, "akm-opencode") });
    const arm: AkmArm = { bin: "~/code/akm", build: "v0.9.27-3-gabc", cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: PINS.akm_plugin, tarball: null }, packages: "/p" };
    writeFileSync(join(dir, "jobs", "terminal-bench-public", `${one}__b`, "agent", "akm_install.json"), JSON.stringify({ akm_version: "0.9.27", plugin_akm_cli: "0.9.26", assets_indexed: 259, env: { AKM_CURATE_TIMEOUT: "30" } }));
    const library = { assets: 259, measured_with: { akm_version: "0.9.26", akm_bin: "akm", akm_build: null }, sha256: "ab".repeat(32) };
    const s = summarize({ corpus: "public", label: "t", model: "openai/x", lock, tasks: [one], dir, exit: 0, attempts: 3, arm, akmEnv: { AKM_CURATE_TIMEOUT: "30" }, packages: [{ file: "akm-cli-0.9.27.tgz", sha256: "0".repeat(64) }], library, job: { n_attempts: 3 } });
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ attempts: 3, akm_version: "0.9.27", akm_bin: "~/code/akm", akm_build: "v0.9.27-3-gabc", akm_env: { AKM_CURATE_TIMEOUT: "30" }, job: { n_attempts: 3 } });
    expect(stored.pins).toEqual(pinsOf(arm));
    expect(stored.pins.akm_cli).toBe("0.9.27");
    expect(stored.akm_install).toMatchObject({ from: "checkout", plugin_from: "release", packages: [{ file: "akm-cli-0.9.27.tgz" }], observed: { akm_version: ["0.9.27"], plugin_akm_cli: ["0.9.26"], assets_indexed: [259], env: { AKM_CURATE_TIMEOUT: "30" } } });
    expect(stored.library).toEqual({ path: "corpus/library", ...library });
    expect(s.results_dir).toBe(dir);
  });

  test("carries the keys --repeat needs, with the numbers of the report in metrics", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode", { verifier_result: { rewards: { reward: 0 } } }), [`${one}__b`]: result(one, "akm-opencode") });
    summarize({ corpus: "public", label: "t", model: "openai/x", lock, tasks: [one], dir, exit: 0 });
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    for (const key of ["eval", "corpus", "model", "akm_version", "akm_bin", "akm_build", "n_errored", "metrics"]) expect(Object.hasOwn(stored, key)).toBe(true);
    expect(stored.akm_version).toBe(PINS.akm_cli);
    expect(stored.akm_bin).toBe(`akm-cli@${PINS.akm_cli}`);
    expect(stored.akm_build).toBeNull();
    expect(stored.n_errored).toBe(0);
    expect(stored.metrics).toMatchObject({ control: { pass_rate: 0 }, akm: { pass_rate: 1 }, delta: { value: 1, n: 1 }, engagement: { control_calls: 0 } });
    expect(stored.report.delta.value).toBe(stored.metrics.delta.value);
  });

  test("counts the trials that ran out of time apart from the errors, and marks their rows", () => {
    const dir = runDir({
      [`${one}__a`]: result(one, "opencode", { exception_info: { exception_type: "AgentTimeoutError" } }), // verified all the same
      [`${one}__b`]: result(one, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "AgentSetupTimeoutError" } }), // a slow akm install
      [`${two}__a`]: result(two, "opencode"),
      [`${two}__b`]: result(two, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "RuntimeError" } }),
    });
    const s = summarize({ corpus: "public", label: "t", model: "openai/x", lock, tasks: [one, two], dir, exit: 0 });
    expect(s.timeouts).toEqual({ control: 1, akm: 1 });
    expect(s.metrics.control.timeouts).toBe(1);
    expect(s.metrics.akm.timeouts).toBe(1);
    expect(s.n_errored).toBe(2); // the two akm trials that got no reward, the slow install among them
    const rows = readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => [r.arm, r.task === one, r.timed_out])).toEqual([
      ["control", true, true],
      ["akm", true, true],
      ["control", false, false],
      ["akm", false, false],
    ]);
  });

  test("shows a plugin failure that a time-out hid: its exception, no reward, and a count of it", () => {
    const dir = runDir({
      [`${one}__a`]: result(one, "opencode"),
      [`${one}__b`]: result(one, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "AgentTimeoutError" } }),
    });
    writeFileSync(join(dir, "jobs", "terminal-bench-public", `${one}__b`, "agent", "akm_plugin_status.json"), JSON.stringify({ live: false, problem: "the plugin never logged 'AKM user feedback recorded'" }));
    const s = summarize({ corpus: "public", label: "t", model: "openai/x", lock, tasks: [one], dir, exit: 0 });
    expect(s.report.akm.exceptions).toEqual({ AkmPluginNotLoadedError: 1 });
    expect(s.report.akm).toMatchObject({ errored: 1, scored: 0 });
    expect(s.timeouts.akm).toBe(1);
    const row = JSON.parse(readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n")[1]);
    expect(row).toMatchObject({ arm: "akm", error: "AkmPluginNotLoadedError", reward: null, timed_out: true, plugin_problem: "the plugin never logged 'AKM user feedback recorded'" });
  });

  test("names a task that ran with a digest other than the lock's", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode", { task_id: { org: "terminal-bench", name: one, ref: `sha256:${"0".repeat(64)}` } }), [`${two}__a`]: result(two, "opencode") });
    expect(summarize({ corpus: "public", label: "t", model: "openai/x", lock, tasks: lock.sample, dir, exit: 0 }).dataset.tasks_run_with_another_digest).toEqual([one]);
  });
});

/** An akm that counts as a fake does: every .md file in the bundle is a skill, and there are five facts, which are the scaffold's. */
const FAKE_AKM = `
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const walk = (dir: string): number => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".md") ? 1 : 0), 0);
if (process.env.FAKE_AKM_FAIL === args[0]) { console.error("akm cannot " + args[0]); process.exit(3); }
if (args[0] === "--version") console.log("akm 0.9.99-test");
else if (args[0] === "bundle") mkdirSync(args[args.indexOf("--dir") + 1], { recursive: true });
else if (args[0] === "index") {}
else if (args[0] === "info") console.log(JSON.stringify({ indexStats: { byType: { skill: walk(process.env.AKM_BUNDLE_DIR as string), fact: 5 } } }));
else { console.error("unknown command " + args[0]); process.exit(1); }
`;

/** Points AKM_BIN at the fake akm, or at no akm at all. */
function fakeAkm(fake: boolean): void {
  if (!fake) {
    process.env.AKM_BIN = "no-such-akm-in-this-test";
    return;
  }
  const script = join(tmp(), "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  process.env.AKM_BIN = `bun ${script}`;
}

const mdFilesIn = (dir: string): number => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? mdFilesIn(join(dir, e.name)) : e.name.endsWith(".md") ? 1 : 0), 0);
/** The .md files in the type folders of a library, as the fake akm counts them. Loose files are not copied into a bundle. */
const fakeCount = (library: string): number => readdirSync(library, { withFileTypes: true }).filter((e) => e.isDirectory()).reduce((n, e) => n + mdFilesIn(join(library, e.name)), 0);

describe("measureLibrary", () => {
  function library(): string {
    const dir = tmp();
    for (const [file, text] of Object.entries({ "skills/a/SKILL.md": "a", "skills/a/ref.md": "r", "agents/x.md": "x", "scripts/s.sh": "echo", "README.md": "loose" })) {
      mkdirSync(join(dir, file, ".."), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    return dir;
  }

  test("counts the assets akm indexes in the type folders of the library, and leaves the scaffold's facts out", async () => {
    fakeAkm(true);
    const lib = library();
    const m = await measureLibrary(lib);
    expect(m.assets).toBe(3); // three .md files in type folders. The README is loose, the script is no .md, the five facts are the scaffold's
    expect(m.reason).toBeUndefined();
    expect(m.measured_with).toMatchObject({ akm_version: "0.9.99-test", akm_build: null });
    expect(m.measured_with?.akm_bin).toContain("fake-akm.ts");
    writeFileSync(join(lib, "agents", "y.md"), "y"); // a library edit changes the count, with no constant to keep in step
    expect((await measureLibrary(lib)).assets).toBe(4);
    rmSync(join(lib, "skills"), { recursive: true });
    expect((await measureLibrary(lib)).assets).toBe(2);
  });

  test("is null, with the reason, when there is no akm to count with or it cannot index", async () => {
    fakeAkm(false);
    const none = await measureLibrary(library());
    expect(none).toMatchObject({ assets: null, measured_with: null });
    expect(none.reason).toContain("could not run");
    fakeAkm(true);
    process.env.FAKE_AKM_FAIL = "index";
    try {
      const broken = await measureLibrary(library());
      expect(broken).toMatchObject({ assets: null, measured_with: null });
      expect(broken.reason).toContain("akm index failed (exit 3): akm cannot index");
    } finally {
      delete process.env.FAKE_AKM_FAIL;
    }
  });
});

describe("runCorpus", () => {
  /** A `uv` that is not Harbor. Given the job, it leaves the trial folders Harbor would leave and exits as FAKE_UV_EXIT says. FAKE_UV_NOTHING makes it leave none. It also records the environment it was started in and the job it was given. */
  function fakeUv(): { root: string; env: Record<string, string> } {
    const root = tmp();
    mkdirSync(join(root, "bin"));
    writeFileSync(
      join(root, "bin", "uv"),
      `#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = Bun.argv.slice(2);
const job = JSON.parse(readFileSync(args[args.indexOf("-c") + 1], "utf8"));
writeFileSync(join(job.jobs_dir, "..", "uv-env.json"), JSON.stringify(process.env));
if (!process.env.FAKE_UV_NOTHING) {
  job.datasets[0].task_names.forEach((task, i) => {
    for (const agent of job.agents) {
      const name = agent.name ?? "akm-opencode";
      const dir = join(job.jobs_dir, job.job_name, task.split("/")[1] + "__" + name);
      mkdirSync(join(dir, "agent"), { recursive: true });
      const trial = { task_name: task, agent_info: { name }, verifier_result: { rewards: { reward: name === "opencode" ? 0 : 1 } }, started_at: "2026-10-06T04:00:00Z", finished_at: "2026-10-06T04:05:00Z" };
      if (process.env.FAKE_UV_TIMEOUTS && i === 0 && name === "opencode") trial.exception_info = { exception_type: "AgentTimeoutError" };
      if (process.env.FAKE_UV_TIMEOUTS && i === 1 && name === "akm-opencode") { trial.exception_info = { exception_type: "AgentSetupTimeoutError" }; trial.verifier_result = null; }
      if (process.env.FAKE_UV_PLUGIN_DEAD && i === 0 && name === "akm-opencode") {
        trial.exception_info = { exception_type: "AgentTimeoutError" };
        trial.verifier_result = null;
        writeFileSync(join(dir, "agent", "akm_plugin_status.json"), JSON.stringify({ live: false, problem: "there is no opencode log" }));
      }
      if (name === "akm-opencode") writeFileSync(join(dir, "agent", "akm_install.json"), JSON.stringify({ akm_version: "0.9.99-test", plugin_akm_cli: "0.9.26", assets_indexed: 7, env: { AKM_CURATE_TIMEOUT: "15" } }));
      writeFileSync(join(dir, "result.json"), JSON.stringify(trial));
    }
  });
}
process.exit(Number(process.env.FAKE_UV_EXIT ?? 0));
`,
    );
    chmodSync(join(root, "bin", "uv"), 0o755);
    return { root, env: { PATH: `${join(root, "bin")}:${process.env.PATH}` } };
  }

  async function quiet<T>(f: () => Promise<T>): Promise<T> {
    const log = console.log;
    const warn = console.warn;
    console.log = () => {};
    console.warn = () => {};
    try {
      return await f();
    } finally {
      console.log = log;
      console.warn = warn;
    }
  }

  const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

  test("writes the job, stages the library, runs Harbor and leaves the summary", async () => {
    fakeAkm(true);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 2, env }, join(root, "results")));
    const dir = s.results_dir;
    expect(dir).toMatch(/results\/\d{4}-\d{2}-\d{2}-t$/);
    const job = readJson(join(dir, "job.json"));
    expect(job.datasets[0].task_names).toEqual(lock.sample.slice(0, 2).map((t) => `terminal-bench/${t}`));
    expect(job.agents[1].kwargs.libraries_dir).toBe(join(dir, "libraries"));
    expect(readdirSync(join(dir, "libraries"))).toEqual(["library"]);
    expect(existsSync(join(dir, "libraries", "library", "skills"))).toBe(true);
    expect(s.report.control).toMatchObject({ trials: 2, passed: 0 });
    expect(s.report.akm).toMatchObject({ trials: 2, passed: 2 });
    expect(readJson(join(dir, "summary.json"))).toMatchObject({ eval: "terminal-bench", corpus: "public", limit: 2, n_tasks: 2, attempts: 1, harbor_exit: 0 });
  });

  test("counts the library's assets on the host, tells the akm arm the number, and records it with the akm that counted and a digest of the library", async () => {
    fakeAkm(true);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env }, join(root, "results")));
    const want = fakeCount(libraryOf("public"));
    expect(want).toBeGreaterThan(0);
    expect(readJson(join(s.results_dir, "job.json")).agents[1].kwargs.library_assets).toBe(want);
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored.library).toMatchObject({ path: "corpus/library", assets: want, measured_with: { akm_version: "0.9.99-test" } });
    expect(stored.library.sha256).toBe(sha256Dir(libraryOf("public")));
    expect(stored.library.sha256).toBe(sha256Dir(join(s.results_dir, "libraries", "library")));
  });

  test("asks only for a non-empty index, and says it did not count, when no akm can count", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env }, join(root, "results")));
    expect(readJson(join(s.results_dir, "job.json")).agents[1].kwargs.library_assets).toBe(1);
    expect(readJson(join(s.results_dir, "summary.json")).library).toMatchObject({ assets: null, measured_with: null });
  });

  test("runs each task as many times as --attempts says, and records it", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env, attempts: 4 }, join(root, "results")));
    expect(readJson(join(s.results_dir, "job.json")).n_attempts).toBe(4);
    expect(s.attempts).toBe(4);
    expect(readJson(join(s.results_dir, "summary.json")).attempts).toBe(4);
    expect(readJson(join(s.results_dir, "summary.json")).job).toMatchObject({ n_attempts: 4, n_concurrent_trials: 4 });
  });

  test("installs the akm --akm names, keeps a copy of its tarballs with the run, and records the settings it ran with", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const packs = tmp();
    writeFileSync(join(packs, "akm-cli-0.9.27.tgz"), "an akm");
    const arm: AkmArm = { bin: "~/code/akm", build: "v0.9.27-3-gabc", cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: PINS.akm_plugin, tarball: null }, packages: packs };
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env, arm, akmEnv: { AKM_CURATE_TIMEOUT: "30" } }, join(root, "results")));
    const kwargs = readJson(join(s.results_dir, "job.json")).agents[1].kwargs;
    expect(kwargs).toMatchObject({ akm_cli_version: "0.9.27", akm_package: "akm-cli-0.9.27.tgz", packages_dir: join(s.results_dir, "akm-packages"), akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(readFileSync(join(s.results_dir, "akm-packages", "akm-cli-0.9.27.tgz"), "utf8")).toBe("an akm");
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored).toMatchObject({ akm_version: "0.9.27", akm_bin: "~/code/akm", akm_build: "v0.9.27-3-gabc", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(stored.akm_install.packages).toEqual([{ file: "akm-cli-0.9.27.tgz", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(stored.akm_install.observed).toMatchObject({ akm_version: ["0.9.99-test"], assets_indexed: [7] });
    expect(stored.job.agents[1].kwargs).toMatchObject({ packages_dir: "akm-packages", libraries_dir: "libraries", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(JSON.stringify(stored.job)).not.toContain(root); // no folder of this machine
  });

  test("starts Harbor with the model's variables and what Harbor needs, and not the judge's key or the rest of the host's", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const host = { MODEL_NAME: "openai/x", MODEL_API_KEY: "model-key", MODEL_BASE_URL: "http://192.0.2.5/v1", JUDGE_API_KEY: "judge-secret", AKM_BIN: "akm", ANTHROPIC_API_KEY: "other", HOME: process.env.HOME as string, PATH: env.PATH };
    const run = modelSettings(undefined, host, {});
    const s = await quiet(() => runCorpus("public", { model: run.model, label: "t", limit: 1, env: run.env }, join(root, "results")));
    const seen = readJson(join(s.results_dir, "uv-env.json"));
    expect(seen).toMatchObject({ OPENAI_API_KEY: "model-key", OPENAI_BASE_URL: "http://192.0.2.5/v1", HOME: process.env.HOME });
    for (const leaked of ["JUDGE_API_KEY", "MODEL_API_KEY", "AKM_BIN", "ANTHROPIC_API_KEY"]) expect(seen[leaked]).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain("judge-secret");
  });

  test("counts the time-outs apart and shows the plugin failure that one of them hid", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const timeouts = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 2, env: { ...env, FAKE_UV_TIMEOUTS: "1" } }, join(root, "results")));
    expect(timeouts.timeouts).toEqual({ control: 1, akm: 1 });
    expect(timeouts.n_errored).toBe(1); // the slow install got no reward. The control's time-out was still verified
    const rows = readFileSync(join(timeouts.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.filter((r) => r.timed_out)).toHaveLength(2);
    const dead = await quiet(() => runCorpus("public", { model: "openai/x", label: "d", limit: 1, env: { ...env, FAKE_UV_PLUGIN_DEAD: "1" } }, join(root, "results")));
    expect(dead.report.akm.exceptions).toEqual({ AkmPluginNotLoadedError: 1 });
    expect(dead.timeouts.akm).toBe(1);
  });

  test("with --repeat, runs the benchmark into <label>-r1 to -rN and writes the spread of its metrics beside them", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const results = join(root, "results");
    const runs = await quiet(() => repeatRuns(2, "t", (label) => runCorpus("public", { model: "openai/x", label, limit: 2, env }, results)));
    expect(runs).toHaveLength(2);
    const names = readdirSync(results).sort();
    expect(names.filter((n) => /-t-r[12]$/.test(n))).toHaveLength(2);
    const file = names.find((n) => n.endsWith("-t-repeat-summary.json")) as string;
    const spread = readJson(join(results, file));
    expect(spread).toMatchObject({ eval: "terminal-bench", corpus: "public", repeat: 2, model: "openai/x", akm_version: PINS.akm_cli, akm_bin: `akm-cli@${PINS.akm_cli}`, akm_build: null });
    expect(spread.runs).toHaveLength(2);
    expect(spread.n_errored).toEqual({ min: 0, max: 0, mean: 0 });
    expect(spread.metrics.delta.value).toEqual({ min: 1, max: 1, mean: 1 });
    expect(spread.metrics.akm.pass_rate).toEqual({ min: 1, max: 1, mean: 1 });
    expect(spread.metrics.engagement.control_calls).toEqual({ min: 0, max: 0, mean: 0 });
    for (const run of runs) expect(existsSync(join(run.results_dir, ".running"))).toBe(false);
  });

  test("still leaves the summary when Harbor exits with an error, and says so", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    await expect(quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env: { ...env, FAKE_UV_EXIT: "3" } }, join(root, "results")))).rejects.toThrow("Harbor exited 3");
    const [run] = readdirSync(join(root, "results"));
    expect(readJson(join(root, "results", run, "summary.json")).harbor_exit).toBe(3);
  });

  test("stops when Harbor left no job at all", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    await expect(quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env: { ...env, FAKE_UV_NOTHING: "1" } }, join(root, "results")))).rejects.toThrow("Harbor wrote no job");
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
  const cmd = (akmBin?.trim() || "akm").split(/\s+/);
  try {
    return Bun.spawnSync([...cmd, "--version"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
  } catch {
    return false;
  }
}

describe.skipIf(!realAkm())("with the akm on this machine", () => {
  test("counts the public library's assets, which are fewer than its files", async () => {
    const m = await measureLibrary(libraryOf("public"));
    expect(m.reason).toBeUndefined();
    expect(m.assets).toBeGreaterThan(0);
    expect(m.assets).toBeLessThan(readdirSync(libraryOf("public"), { recursive: true }).length);
  }, 120_000);

  test.skipIf(!existsSync(libraryOf("private")))("and the private copy's", async () => {
    expect((await measureLibrary(libraryOf("private"))).assets).toBeGreaterThan(0);
  }, 120_000);
});

describe("the command line", () => {
  /** Runs the runner as a person would, with only the environment given. These all stop before Docker is asked about. */
  const run = (args: string[], env: Record<string, string> = {}) => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "run.ts"), ...args], { env: { PATH: process.env.PATH as string, HOME: process.env.HOME as string, ...env }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  test("--help describes the flags of the akm under test, and the model, and says AKM_BIN is not read", () => {
    const { code, out } = run(["--help"]);
    expect(code).toBe(0);
    for (const flag of ["--repeat", "--akm ", "--akm-env", "--model", "--attempts"]) expect(out).toContain(flag);
    expect(out).toMatch(/models\.json/);
    expect(out).toContain("AKM_BIN is not read");
    expect(out).toContain("akm-cli@x.y.z");
  });

  test("refuses a bad count, a bad --akm and a bad --akm-env with a message and exit 2, before it asks about Docker", () => {
    for (const [args, said] of [
      [["--repeat", "0"], "--repeat must be a positive integer"],
      [["--limit", "x"], "--limit must be a positive integer"],
      [["--attempts", "0"], "--attempts must be a positive integer"],
      [["--akm", "bun ~/code/akm/src/cli.ts"], "is a command"],
      [["--akm", "akm-cli@latest"], "exact release"],
      [["--akm", "/no/such/akm/checkout"], "neither akm-cli@x.y.z nor a folder"],
      [["--akm-env", "OPENAI_API_KEY=x"], "only AKM_* settings"],
      [["--akm-env", "AKM_BUNDLE_DIR=/x"], "the arm fixes it"],
      [["--akm-env", "AKM_LLM_API_KEY=secret"], "looks like a credential"],
      [["--akm-env", "AKM_X"], "takes KEY=VALUE"],
    ] as [string[], string][]) {
      const done = run(args);
      expect(done.code, args.join(" ")).toBe(2);
      expect(done.err, args.join(" ")).toContain(said);
    }
  });

  test("sends --model through models.json and the gateway as every eval does, and refuses a base URL for a model of another provider", () => {
    const gateway = { MODEL_BASE_URL: "https://gateway.example.com/v1", MODEL_API_KEY: "k" };
    const done = run(["--model", "anthropic/claude-sonnet-4-5"], gateway);
    expect(done.code).toBe(2);
    expect(done.err).toContain("anthropic/claude-sonnet-4-5 is sent to gateway.example.com, but Harbor passes a base URL on only to an openai model");
    const none = run([], {});
    expect(none.code).toBe(2);
    expect(none.err).toContain("name the model");
    expect(run(["--model", "my-model"], { MODEL_API_KEY: "k", MODEL_BASE_URL: "http://localhost:8080/v1" }).err).toContain("would be the container itself");
  });
});
