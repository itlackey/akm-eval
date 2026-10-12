import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { type AkmArm, PINS, buildFingerprint, modelSettings, sha256Dir } from "../../../lib/harbor/harbor.ts";
import { harnessSha256 } from "../../../lib/provenance.ts";
import { type Trial, buildReport } from "../../../lib/harbor/report.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { sandboxRepo, writeFakeHarbor } from "./fakes.ts";
import { generate } from "./generate.ts";
import { jobConfig, runCorpus, selectTasks, sideBySide, taskNames } from "./run.ts";

const EVAL_DIR = join(import.meta.dir, "..");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "agent-ab-test-"));
  dirs.push(d);
  return d;
};

describe("selectTasks", () => {
  const names = ["a--1", "a--2", "a--3", "b--1", "b--2", "c--1"];

  test("takes every task without a limit, or with a limit that covers them", () => {
    expect(selectTasks(names)).toEqual(names);
    expect(selectTasks(names, 6)).toEqual(names);
    expect(selectTasks(names, 50)).toEqual(names);
  });

  test("takes the families in turn, each in name order", () => {
    expect(selectTasks(names, 3)).toEqual(["a--1", "b--1", "c--1"]);
    expect(selectTasks(names, 4)).toEqual(["a--1", "b--1", "c--1", "a--2"]);
    expect(selectTasks(names, 1)).toEqual(["a--1"]);
  });

  test("copes with a family of one task and with a task that has no family", () => {
    expect(selectTasks(["x", "y--1", "y--2"], 2)).toEqual(["x", "y--1"]);
  });
});

describe("sideBySide", () => {
  const trial = (task: string, arm: "control" | "akm", reward: number): Trial => ({ task, arm, trial: `${task}-${arm}`, reward, error: null, akm: arm === "akm" ? { akm_show: 1 } : null, tools: 2, tokens: null, costUsd: null, seconds: 1 });

  test("puts the two corpora in columns and pools nothing", () => {
    const pub = buildReport([trial("a", "control", 0), trial("a", "akm", 1), trial("b", "control", 0), trial("b", "akm", 1)]);
    const priv = buildReport([trial("c", "control", 0), trial("c", "akm", 0)]);
    const lines = sideBySide({ corpus: "public", report: pub }, { corpus: "private", report: priv });
    expect(lines[0]).toContain("side by side (not pooled)");
    expect(lines.join("\n")).toContain("public");
    expect(lines.find((l) => l.includes("difference"))).toContain("+1.000 [1.000, 1.000] over 2 tasks");
    expect(lines.find((l) => l.includes("difference"))).toContain("0.000 [0.000, 0.000] over 1 tasks");
    expect(lines.find((l) => l.includes("akm called in"))).toContain("2 of 2 akm trials");
  });

  test("copes with a run that scored nothing", () => {
    const empty = buildReport([]);
    expect(sideBySide({ corpus: "public", report: empty }, { corpus: "private", report: empty }).join("\n")).toContain("n/a");
  });
});

describe("jobConfig", () => {
  const cfg = jobConfig({ name: "agent-ab-public", model: "openai/gpt-6-luna", tasksDir: "/t", tasks: ["x--1", "x--2"], librariesDir: "/l", attempts: 3, jobsDir: "/j" }) as any;
  const [control, akm] = cfg.agents;

  test("runs both arms on the same tasks, model, opencode and config", () => {
    expect(control.name).toBe("opencode");
    expect(akm.import_path).toBe("akm_opencode:AkmOpenCode");
    expect(control.model_name).toBe("openai/gpt-6-luna");
    expect(akm.model_name).toBe(control.model_name);
    expect(akm.override_setup_timeout_sec).toBe(control.override_setup_timeout_sec);
    expect(akm.kwargs.version).toBe(PINS.opencode);
    expect(control.kwargs.version).toBe(PINS.opencode);
    expect(akm.kwargs.opencode_config).toEqual(control.kwargs.opencode_config);
    expect(cfg.datasets).toEqual([{ path: "/t", task_names: ["x--1", "x--2"] }]);
    expect(cfg.n_attempts).toBe(3);
  });

  test("gives the akm arm what it needs and the control arm nothing of akm's", () => {
    expect(akm.kwargs).toMatchObject({ akm_cli_version: PINS.akm_cli, akm_plugin_version: PINS.akm_plugin, libraries_dir: "/l" });
    expect(JSON.stringify(control)).not.toContain("akm");
    // The plugin is added by the agent, so the two configs differ in nothing but that.
    expect(JSON.stringify(akm.kwargs.opencode_config)).not.toContain("plugin");
  });

  test("turns off opencode's updates and keeps its side jobs on the one model", () => {
    expect(control.kwargs.opencode_config).toMatchObject({ autoupdate: false, small_model: "openai/gpt-6-luna" });
  });

  test("holds no credential", () => {
    expect(JSON.stringify(cfg)).not.toMatch(/api_?key|token|secret/i);
    expect(control.env).toBeUndefined();
    expect(akm.env).toBeUndefined();
  });
});

describe("the public tasks", () => {
  const tasks = taskNames(join(EVAL_DIR, "tasks"));
  const stash = (task: string) => readFileSync(join(EVAL_DIR, "tasks", task, "task.toml"), "utf8").match(/^AKM_TASK_STASH\s*=\s*"([^"]+)"/m)?.[1];

  test("are the nine of the discriminating slice", () => {
    expect(tasks).toHaveLength(9);
    expect(tasks.filter((t) => t.startsWith("drillbit--"))).toHaveLength(3);
    expect(tasks.filter((t) => t.startsWith("inkwell--"))).toHaveLength(3);
    expect(tasks.filter((t) => t.startsWith("workflow-compliance--"))).toHaveLength(3);
  });

  test("each has an instruction, a solution, a verifier and a library to seed", () => {
    for (const t of tasks) {
      for (const f of ["instruction.md", "solution/solve.sh", "tests/test.sh", "environment/Dockerfile"]) expect(existsSync(join(EVAL_DIR, "tasks", t, f))).toBe(true);
      const lib = stash(t);
      expect(lib).toBeDefined();
      expect(existsSync(join(EVAL_DIR, "libraries", lib as string))).toBe(true);
    }
  });

  test("leave no library unused and no file loose in a library, where it would not be seeded", () => {
    const used = new Set(tasks.map(stash));
    const libraries = readdirSync(join(EVAL_DIR, "libraries"), { withFileTypes: true });
    expect(libraries.every((e) => e.isDirectory())).toBe(true);
    for (const l of libraries) {
      expect(used.has(l.name)).toBe(true);
      expect(readdirSync(join(EVAL_DIR, "libraries", l.name), { withFileTypes: true }).every((e) => e.isDirectory())).toBe(true);
    }
  });
});

describe("jobConfig with an akm under test", () => {
  const base = { name: "agent-ab-public", model: "openai/gpt-6-luna", tasksDir: "/t", tasks: ["x--1"], librariesDir: "/l", attempts: 3, jobsDir: "/j" };

  test("installs the pinned release unless told otherwise", () => {
    const akm = (jobConfig(base) as any).agents[1];
    expect(akm.kwargs).toMatchObject({ akm_cli_version: PINS.akm_cli, akm_plugin_version: PINS.akm_plugin });
    for (const key of ["packages_dir", "akm_package", "plugin_package", "akm_env"]) expect(akm.kwargs[key]).toBeUndefined();
  });

  test("gives the akm arm the tarballs of a checkout and the extra settings, and the control arm none of it", () => {
    const arm: AkmArm = { bin: "~/akm", build: "abc", cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: "0.9.27", tarball: "akm-opencode-0.9.27.tgz" }, packages: "/pack" };
    const cfg = jobConfig({ ...base, arm, packagesDir: "/run/akm-packages", akmEnv: { AKM_CURATE_TIMEOUT: "30" } }) as any;
    expect(cfg.agents[1].kwargs).toMatchObject({ akm_cli_version: "0.9.27", akm_plugin_version: "0.9.27", packages_dir: "/run/akm-packages", akm_package: "akm-cli-0.9.27.tgz", plugin_package: "akm-opencode-0.9.27.tgz", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(JSON.stringify(cfg.agents[0])).not.toContain("akm");
    expect(JSON.stringify(cfg)).not.toMatch(/api_?key|token|secret/i);
  });
});

describe("runCorpus", () => {
  /** A `uv` that is not Harbor (see fakes.ts), with the environment to start the runner in. */
  function fakeUv(): { root: string; env: Record<string, string> } {
    const root = tmp();
    return { root, env: { PATH: `${writeFakeHarbor(root)}:${process.env.PATH}` } };
  }

  async function quiet<T>(f: () => Promise<T>): Promise<T> {
    const log = console.log;
    console.log = () => {};
    try {
      return await f();
    } finally {
      console.log = log;
    }
  }

  const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

  test("writes the job, runs Harbor and leaves a summary that names the akm, the tasks, the settings and the library", async () => {
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 3, env }, join(root, "results")));
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored).toMatchObject({ eval: "agent-ab", corpus: "public", model: "openai/x", limit: 3, n_tasks: 3, attempts: 1, harbor_exit: 0 });
    expect(stored).toMatchObject({ akm_version: PINS.akm_cli, akm_bin: `akm-cli@${PINS.akm_cli}`, akm_build: null, akm_env: {} });
    expect(stored.akm_build_fingerprint).toBe(buildFingerprint(null, "ee".repeat(32))); // no uncommitted changes; the dependency tree the containers installed
    expect(stored.harness_sha256).toMatch(/^[0-9a-f]{64}$/); // the digest of this eval's code and lib/
    expect(stored.harness_sha256).toBe(harnessSha256(import.meta.dir));
    expect(stored.pins).toEqual(PINS);
    // The task list, the options of both agents and the concurrency, from job.json, with no folder of this machine. Harbor reads the run's own copy of the tasks and the libraries.
    expect(stored.job.datasets).toEqual([{ path: "tasks", task_names: selectTasks(taskNames(join(EVAL_DIR, "tasks")), 3) }]);
    expect(stored.job).toMatchObject({ n_attempts: 1, n_concurrent_trials: 4 });
    expect(stored.job.agents[0]).toMatchObject({ name: "opencode", override_setup_timeout_sec: 2700, kwargs: { opencode_config: { autoupdate: false } } });
    expect(stored.job.agents[1]).toMatchObject({ import_path: "akm_opencode:AkmOpenCode", override_setup_timeout_sec: 2700, kwargs: { akm_cli_version: PINS.akm_cli, libraries_dir: "libraries" } });
    expect(stored.libraries_sha256).toBe(sha256Dir(join(EVAL_DIR, "libraries")));
    expect(stored.libraries_sha256).toBe(sha256Dir(join(s.results_dir, "libraries")));
    expect(readJson(join(s.results_dir, "job.json")).datasets[0].path).toBe(join(s.results_dir, "tasks"));
    expect(readdirSync(join(s.results_dir, "tasks")).sort()).toEqual([...selectTasks(taskNames(join(EVAL_DIR, "tasks")), 3)].sort()); // the tasks the run selected, and no others
    expect(stored.akm_install.observed).toMatchObject({ akm_version: ["0.9.99-test"], plugin_akm_cli: ["0.9.26"], assets_indexed: [7], env: { AKM_CURATE_TIMEOUT: "15" } });
    expect(JSON.stringify(stored.job)).not.toContain(root);
    expect(s.report.control).toMatchObject({ trials: 3, passed: 0 });
    expect(s.report.akm).toMatchObject({ trials: 3, passed: 3 });
  });

  test("records that the run finished: its status, the grid of trials, the model's endpoint without a key, the job config and the digest of the cases", async () => {
    const { root, env } = fakeUv();
    const withKey = { ...env, OPENAI_API_KEY: "sk-model-key", OPENAI_BASE_URL: "http://user:hunter2@192.0.2.5:8080/v1" };
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 3, env: withKey }, join(root, "results")));
    const stored = readJson(join(s.results_dir, "summary.json"));
    const cells = (n: number) => ({ expected: n, completed: n, failed: 0, missing: 0, unexpected: 0 });
    expect(stored).toMatchObject({ status: "complete", aborted_reason: null, harbor_exit: 0 });
    expect(stored.completion).toEqual({ ...cells(6), control: cells(3), akm: cells(3) });
    expect(stored.engine).toEqual({ model: "openai/x", endpoint: "http://192.0.2.5:8080/v1" });
    expect(stored.config).toEqual(stored.job);
    expect(JSON.stringify(stored)).not.toMatch(/sk-model-key|hunter2/);
    const tasks = selectTasks(taskNames(join(EVAL_DIR, "tasks")), 3);
    expect(Object.keys(stored.tasks_sha256).sort()).toEqual([...tasks].sort());
    for (const t of tasks) expect(stored.tasks_sha256[t]).toBe(sha256Dir(join(EVAL_DIR, "tasks", t)));
    expect(stored.assets_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.libraries_sha256).toBe(sha256Dir(join(EVAL_DIR, "libraries"))); // the component stays, to say which part moved
  });

  test("a Harbor that leaves one cell missing and exits 1 leaves an aborted summary with the counts and all its artifacts, and the run ends with an error", async () => {
    const { root, env } = fakeUv();
    const results = join(root, "results");
    const reason = "Harbor exited 1; 1 of 6 expected trials have no result (control 0, akm 1)";
    await expect(quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 3, env: { ...env, UV_FAKE_MISSING: "1", UV_FAKE_EXIT: "1" } }, results))).rejects.toMatchObject({ code: 1, message: expect.stringContaining(reason) });
    const [run] = readdirSync(results);
    const dir = join(results, run);
    const stored = readJson(join(dir, "summary.json"));
    expect(stored).toMatchObject({ status: "aborted", aborted_reason: reason, harbor_exit: 1 });
    expect(stored.completion).toEqual({
      expected: 6,
      completed: 5,
      failed: 0,
      missing: 1,
      unexpected: 0,
      control: { expected: 3, completed: 3, failed: 0, missing: 0, unexpected: 0 },
      akm: { expected: 3, completed: 2, failed: 0, missing: 1, unexpected: 0 },
    });
    for (const kept of ["job.json", "harbor.log", "samples.jsonl", "jobs"]) expect(existsSync(join(dir, kept)), kept).toBe(true);
    expect(readFileSync(join(dir, "samples.jsonl"), "utf8").trim().split("\n")).toHaveLength(5);
    expect(stored.report.control.trials + stored.report.akm.trials).toBe(5);
  });

  test("a cell missing aborts the run even when Harbor exited 0, and a full grid with errored trials does not", async () => {
    const { root, env } = fakeUv();
    await expect(quiet(() => runCorpus("public", { model: "openai/x", label: "m", limit: 2, env: { ...env, UV_FAKE_MISSING: "1" } }, join(root, "results")))).rejects.toThrow("1 of 4 expected trials have no result (control 0, akm 1)");
    const errored = await quiet(() => runCorpus("public", { model: "openai/x", label: "e", limit: 2, env: { ...env, UV_FAKE_PLUGIN_DEAD: "1" } }, join(root, "results")));
    expect(errored).toMatchObject({ status: "complete", aborted_reason: null, n_errored: 1 });
    expect(errored.completion).toMatchObject({ expected: 4, completed: 3, failed: 1, missing: 0 });
  });

  test("a Harbor that made no job at all is an aborted run with every cell missing, and its summary is kept", async () => {
    const { root, env } = fakeUv();
    const results = join(root, "results");
    await expect(quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env: { ...env, UV_FAKE_NOTHING: "1" } }, results))).rejects.toThrow("Harbor wrote no job; 2 of 2 expected trials have no result (control 1, akm 1)");
    const [run] = readdirSync(results);
    const stored = readJson(join(results, run, "summary.json"));
    expect(stored).toMatchObject({ status: "aborted", harbor_exit: 0, completion: { expected: 2, completed: 0, failed: 0, missing: 2 } });
    expect(readFileSync(join(results, run, "samples.jsonl"), "utf8")).toBe("");
  });

  test("installs the akm --akm names, keeps a copy of its tarballs with the run, and records the settings it ran with", async () => {
    const { root, env } = fakeUv();
    const packs = tmp();
    writeFileSync(join(packs, "akm-cli-0.9.27.tgz"), "an akm");
    writeFileSync(join(packs, "akm-opencode-0.9.27.tgz"), "a plugin");
    const arm: AkmArm = { bin: "~/code/akm", build: "v0.9.27-3-gabc-dirty", build_fingerprint: "e".repeat(64), cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: "0.9.27", tarball: "akm-opencode-0.9.27.tgz" }, packages: packs };
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env, arm, akmEnv: { AKM_CURATE_TIMEOUT: "30" } }, join(root, "results")));
    const kwargs = readJson(join(s.results_dir, "job.json")).agents[1].kwargs;
    expect(kwargs).toMatchObject({ akm_cli_version: "0.9.27", akm_plugin_version: "0.9.27", akm_package: "akm-cli-0.9.27.tgz", plugin_package: "akm-opencode-0.9.27.tgz", packages_dir: join(s.results_dir, "akm-packages"), akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(readFileSync(join(s.results_dir, "akm-packages", "akm-opencode-0.9.27.tgz"), "utf8")).toBe("a plugin");
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored).toMatchObject({ akm_version: "0.9.27", akm_bin: "~/code/akm", akm_build: "v0.9.27-3-gabc-dirty", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(stored.akm_build_fingerprint).toBe(buildFingerprint("e".repeat(64), "ee".repeat(32))); // the checkout's changes and the dependency tree both
    expect(stored.pins).toEqual({ ...PINS, akm_cli: "0.9.27", akm_plugin: "0.9.27" });
    expect(stored.akm_install).toMatchObject({ from: "checkout", plugin_from: "checkout", plugin_version: "0.9.27", packages: [{ file: "akm-cli-0.9.27.tgz" }, { file: "akm-opencode-0.9.27.tgz" }] });
    expect(stored.job.agents[1].kwargs).toMatchObject({ packages_dir: "akm-packages", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
  });

  test("records the digest of the dependency tree the akm containers installed, in akm_install and in the build identity, and the lockfiles they came from (#68)", async () => {
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 2, env }, join(root, "results")));
    const stored = readJson(join(s.results_dir, "summary.json"));
    const tree = "ee".repeat(32);
    expect(stored.akm_install).toMatchObject({ dependency_tree_sha256: tree, locked: true });
    expect(stored.akm_install.observed).toMatchObject({ dependency_trees: [tree], lockfiles: { akm_cli: "a".repeat(64), plugin: "b".repeat(64) } });
    expect(stored.akm_build_fingerprint).toBe(buildFingerprint(null, tree)); // the build identity the comparison reads holds it
    expect(stored.status).toBe("complete");
  });

  test("aborts a run whose akm containers installed different dependency trees, and says how many", async () => {
    const { root, env } = fakeUv();
    await expect(quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 2, env: { ...env, UV_FAKE_TREES: "differ" } }, join(root, "results")))).rejects.toThrow("the akm arm's containers installed 2 different dependency trees");
    const [run] = readdirSync(join(root, "results"));
    const stored = readJson(join(root, "results", run, "summary.json"));
    expect(stored).toMatchObject({ status: "aborted", akm_build_fingerprint: null });
    expect(stored.akm_install.dependency_tree_sha256).toBeNull();
    expect(stored.akm_install.observed.dependency_trees).toHaveLength(2);
  });

  test("starts Harbor with the model's variables and what Harbor needs, and not the judge's key or the rest of the host's", async () => {
    const { root, env } = fakeUv();
    const host = { MODEL_NAME: "openai/x", MODEL_API_KEY: "model-key", MODEL_BASE_URL: "http://192.0.2.5/v1", JUDGE_API_KEY: "judge-secret", AKM_BIN: "akm", HOME: process.env.HOME as string, PATH: env.PATH };
    const run = modelSettings(undefined, host, {});
    const s = await quiet(() => runCorpus("public", { model: run.model, label: "t", limit: 1, env: run.env }, join(root, "results")));
    const seen = readJson(join(s.results_dir, "uv-env.json"));
    expect(seen).toMatchObject({ OPENAI_API_KEY: "model-key", OPENAI_BASE_URL: "http://192.0.2.5/v1" });
    for (const leaked of ["JUDGE_API_KEY", "MODEL_API_KEY", "AKM_BIN"]) expect(seen[leaked]).toBeUndefined();
  });

  test("counts the time-outs apart and shows the plugin failure that one of them hid", async () => {
    const { root, env } = fakeUv();
    const timeouts = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 2, env: { ...env, UV_FAKE_TIMEOUTS: "1" } }, join(root, "results")));
    expect(timeouts.timeouts).toEqual({ control: 0, akm: 1 });
    expect(timeouts.metrics.akm.timeouts).toBe(1);
    expect([timeouts.report.control.timeouts, timeouts.report.akm.timeouts]).toEqual([0, 1]); // the report's tables count the same trials
    const rows = readFileSync(join(timeouts.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.filter((r) => r.timed_out).map((r) => r.arm)).toEqual(["akm"]);
    const dead = await quiet(() => runCorpus("public", { model: "openai/x", label: "d", limit: 2, env: { ...env, UV_FAKE_PLUGIN_DEAD: "1" } }, join(root, "results")));
    expect(dead.report.akm.exceptions).toEqual({ AkmPluginNotLoadedError: 1 });
    expect(dead.n_errored).toBe(1);
    expect(dead.timeouts.akm).toBe(1);
    expect(dead.report.akm.timeouts).toBe(1); // the trial that timed out and then failed the plugin check is one timeout in both places
    expect(dead.metrics.akm.timeouts).toBe(1);
  });

  test("with --repeat, runs the eval into <label>-r1 to -rN and writes the spread of its metrics beside them", async () => {
    const { root, env } = fakeUv();
    const results = join(root, "results");
    const runs = await quiet(() => repeatRuns(3, "t", (label) => runCorpus("public", { model: "openai/x", label, limit: 3, env }, results)));
    expect(runs).toHaveLength(3);
    const names = readdirSync(results).sort();
    expect(names.filter((n) => /-t-r[123]$/.test(n))).toHaveLength(3);
    const file = names.find((n) => n.endsWith("-t-repeat-summary.json")) as string;
    const spread = readJson(join(results, file));
    expect(spread).toMatchObject({ eval: "agent-ab", corpus: "public", repeat: 3, model: "openai/x", akm_version: PINS.akm_cli, akm_bin: `akm-cli@${PINS.akm_cli}`, akm_build: null });
    expect(spread.n_errored).toEqual({ min: 0, max: 0, mean: 0 });
    expect(spread.metrics.delta.value).toEqual({ min: 1, max: 1, mean: 1 });
    expect(spread.metrics.control.pass_rate).toEqual({ min: 0, max: 0, mean: 0 });
    for (const run of runs) expect(existsSync(join(run.results_dir, ".running"))).toBe(false);
  });

  test("still leaves the summary when Harbor exits with an error, and says so", async () => {
    const { root, env } = fakeUv();
    await expect(quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env: { ...env, UV_FAKE_EXIT: "3" } }, join(root, "results")))).rejects.toThrow("Harbor exited 3");
    const [run] = readdirSync(join(root, "results"));
    expect(readJson(join(root, "results", run, "summary.json")).harbor_exit).toBe(3);
  });
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
    for (const flag of ["--repeat", "--akm ", "--akm-env", "--model"]) expect(out).toContain(flag);
    expect(out).toMatch(/models\.json/);
    expect(out).toContain("AKM_BIN is not read");
    expect(out).toContain("akm-cli@x.y.z");
  });

  test("refuses a bad count, a bad --akm and a bad --akm-env with a message and exit 2, before it asks about Docker", () => {
    for (const [args, said] of [
      [["--repeat", "0"], "--repeat must be a positive integer"],
      [["--limit", "x"], "--limit must be a positive integer"],
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

  test("sends --model through models.json and the gateway as every eval does: a gateway's model id may have a slash, and OpenAI's key is not sent to a gateway", () => {
    // Past the model's name and URL, to the check that a container can reach the server: the id is the gateway's, as opencode's openai provider takes it.
    const local = run(["--model", "Qwen/Qwen2.5-7B"], { MODEL_BASE_URL: "http://localhost:8080/v1", MODEL_API_KEY: "k" });
    expect(local.code).toBe(2);
    expect(local.err).toContain("the endpoint of openai/Qwen/Qwen2.5-7B, http://localhost:8080/v1, would be the container itself");
    expect(local.err).not.toContain("is sent to");
    const gateway = run(["--model", "gpt-6"], { MODEL_BASE_URL: "https://gw.example.net/v1", OPENAI_API_KEY: "sk-real-openai-key" });
    expect(gateway.code).toBe(2);
    expect(gateway.err).toContain("no model key for openai/gpt-6");
    expect(gateway.err + gateway.out).not.toContain("sk-real-openai-key");
    const none = run([], {});
    expect(none.code).toBe(2);
    expect(none.err).toContain("name the model");
    expect(run(["--model", "my-model"], { MODEL_API_KEY: "k", MODEL_BASE_URL: "http://localhost:8080/v1" }).err).toContain("would be the container itself");
  });
});

describe("the command line with a fake Harbor, in a copy of the repository", () => {
  const repos: string[] = [];
  afterEach(() => {
    for (const d of repos.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  /** A copy of the code laid out as the repository is, a fake uv and docker to put on PATH, and a way to run the CLI in it as a person would. */
  function repo() {
    const root = sandboxRepo();
    const bin = writeFakeHarbor(root);
    repos.push(root);
    const run = (args: string[], env: Record<string, string> = {}) => {
      const done = Bun.spawnSync(["bun", join(root, "evals", "agent-ab", "src", "run.ts"), ...args], {
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME as string, MODEL_NAME: "openai/x", MODEL_API_KEY: "sk-test-key", ...env },
        stdout: "pipe",
        stderr: "pipe",
      });
      return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
    };
    const summary = (label: string, corpus: "public" | "private" = "public") => {
      const results = corpus === "public" ? join(root, "evals", "agent-ab", "results") : join(root, "private", "agent-ab", "results");
      return JSON.parse(readFileSync(join(results, readdirSync(results).find((d) => d.endsWith(`-${label}`)) as string, "summary.json"), "utf8"));
    };
    return { root, run, summary };
  }

  test("ends with exit 1 and an aborted summary when Harbor leaves a cell missing and exits 1, and with exit 0 and a complete one otherwise", () => {
    const { run, summary } = repo();
    const aborted = run(["--limit", "3", "--label", "cut"], { UV_FAKE_MISSING: "1", UV_FAKE_EXIT: "1" });
    expect(aborted.code).toBe(1);
    expect(aborted.err).toContain("agent-ab: Harbor exited 1; 1 of 6 expected trials have no result (control 0, akm 1)");
    expect(aborted.out).toContain("ABORTED");
    expect(summary("cut")).toMatchObject({ status: "aborted", harbor_exit: 1, completion: { expected: 6, completed: 5, failed: 0, missing: 1 } });
    const whole = run(["--limit", "3", "--label", "whole"]);
    expect(whole.code).toBe(0);
    expect(summary("whole")).toMatchObject({ status: "complete", aborted_reason: null, completion: { expected: 6, completed: 6, missing: 0 } });
  }, 60_000);

  test("a change to the library, to a selected task, to the tasks selected or to the attempts changes assets_sha256, and a rerun does not", () => {
    const { root, run, summary } = repo();
    const library = join(root, "evals", "agent-ab", "libraries", "drillbit", "skills", "drillbit", "SKILL.md");
    const instruction = join(root, "evals", "agent-ab", "tasks", "drillbit--scale", "instruction.md");
    const [libraryText, instructionText] = [readFileSync(library, "utf8"), readFileSync(instruction, "utf8")];
    let n = 0;
    const go = (...args: string[]) => {
      n++;
      expect(run([...args, "--label", `r${n}`]).code).toBe(0);
      const s = summary(`r${n}`);
      return { assets: s.assets_sha256 as string, libraries: s.libraries_sha256 as string, tasks: s.tasks_sha256 as Record<string, string>, attempts: s.attempts as number };
    };
    const base = go("--limit", "4"); // all four tasks, one attempt
    expect(base.assets).toMatch(/^[0-9a-f]{64}$/);
    expect(go("--limit", "4").assets).toBe(base.assets);

    writeFileSync(library, `${libraryText}\nAnother line of the library.\n`);
    const otherLibrary = go("--limit", "4");
    expect(otherLibrary.libraries).not.toBe(base.libraries);
    expect(otherLibrary.assets).not.toBe(base.assets);
    expect(otherLibrary.tasks).toEqual(base.tasks);
    writeFileSync(library, libraryText);

    writeFileSync(instruction, `${instructionText}\nAnd one more thing.\n`);
    const otherTask = go("--limit", "4");
    expect(otherTask.libraries).toBe(base.libraries);
    expect(otherTask.assets).not.toBe(base.assets);
    expect(otherTask.tasks["drillbit--scale"]).not.toBe(base.tasks["drillbit--scale"]);
    expect(otherTask.tasks["drillbit--plain"]).toBe(base.tasks["drillbit--plain"]);
    writeFileSync(instruction, instructionText);

    const fewer = go("--limit", "2"); // other tasks selected, the same library and attempts
    expect(Object.keys(fewer.tasks)).toHaveLength(2);
    expect(fewer.libraries).toBe(base.libraries);
    expect(fewer.assets).not.toBe(base.assets);

    const more = go(); // the same four tasks and library, three attempts
    expect(more.attempts).toBe(3);
    expect(more.tasks).toEqual(base.tasks);
    expect(more.libraries).toBe(base.libraries);
    expect(more.assets).not.toBe(base.assets);
    expect(go("--limit", "4").assets).toBe(base.assets);
  }, 60_000);

  test("an edit to a task or a library while Harbor runs changes neither what the trials were given nor the digests the summary records (#67)", () => {
    const { root, run, summary } = repo();
    const eval_ = join(root, "evals", "agent-ab");
    const [skill, instruction] = [join(eval_, "libraries", "drillbit", "skills", "drillbit", "SKILL.md"), join(eval_, "tasks", "drillbit--scale", "instruction.md")];
    const [libraries, tasks] = [sha256Dir(join(eval_, "libraries")), Object.fromEntries(readdirSync(join(eval_, "tasks")).map((t) => [t, sha256Dir(join(eval_, "tasks", t))]))];
    const done = run(["--limit", "4", "--label", "edited"], { UV_FAKE_EDIT: JSON.stringify([skill, instruction]) });
    expect(done.code, done.err).toBe(0);
    // The fake Harbor edited the live files, as a person would.
    expect(readFileSync(skill, "utf8")).toContain("Edited while Harbor was running.");
    expect(readFileSync(instruction, "utf8")).toContain("Edited while Harbor was running.");
    expect(sha256Dir(join(eval_, "libraries"))).not.toBe(libraries);
    const s = summary("edited");
    // What the summary records is what the run started with.
    expect(s.libraries_sha256).toBe(libraries);
    expect(s.tasks_sha256).toEqual(tasks);
    // What Harbor was given is the run's copy of it, and that copy is unchanged and has those digests.
    const dir = join(eval_, "results", readdirSync(join(eval_, "results")).find((d) => d.endsWith("-edited")) as string);
    const job = JSON.parse(readFileSync(join(dir, "job.json"), "utf8"));
    expect(job.datasets[0].path).toBe(join(dir, "tasks"));
    expect(job.agents[1].kwargs.libraries_dir).toBe(join(dir, "libraries"));
    expect(sha256Dir(join(dir, "libraries"))).toBe(libraries);
    for (const [name, digest] of Object.entries(tasks)) expect(sha256Dir(join(dir, "tasks", name)), name).toBe(digest);
    expect(readFileSync(join(dir, "libraries", "drillbit", "skills", "drillbit", "SKILL.md"), "utf8")).not.toContain("Edited while Harbor was running.");
    // The same run on files that were not edited records the same cases.
    writeFileSync(skill, readFileSync(skill, "utf8").replace("\nEdited while Harbor was running.\n", ""));
    writeFileSync(instruction, readFileSync(instruction, "utf8").replace("\nEdited while Harbor was running.\n", ""));
    expect(run(["--limit", "4", "--label", "plain"]).code).toBe(0);
    expect(summary("plain").assets_sha256).toBe(s.assets_sha256);
  }, 60_000);

  test("run --corpus private refuses a tree with no manifest, one made from other public inputs or by another generator, and one whose files are not what generate wrote, and runs one that is sound", () => {
    const { root, run, summary } = repo();
    const out = join(root, "private", "agent-ab");
    const assets = join(out, "assets");
    const refused = (said: string) => {
      const done = run(["--corpus", "private", "--limit", "1", "--label", "p"]);
      expect(done.code).toBe(2);
      expect(done.err).toContain(said);
    };

    refused("the private assets are missing (private/agent-ab/assets/tasks)");
    expect(generate({ seed: "7", out, from: join(root, "evals", "agent-ab") }).installed).toBe(true);

    const manifest = readFileSync(join(assets, "generated.json"), "utf8");
    rmSync(join(assets, "generated.json"));
    refused("the private assets in private/agent-ab/assets/ have no generated.json in its current format");
    writeFileSync(join(assets, "generated.json"), manifest);

    const library = join(root, "evals", "agent-ab", "libraries", "drillbit", "skills", "drillbit", "SKILL.md");
    const libraryText = readFileSync(library, "utf8");
    writeFileSync(library, `${libraryText}\nChanged after the private tasks were made.\n`);
    refused("were made from public tasks or libraries that have changed since");
    writeFileSync(library, libraryText);

    // Made by another generator: the manifest of assets an older generate wrote, with the same public inputs and the same files.
    writeFileSync(join(assets, "generated.json"), JSON.stringify({ ...JSON.parse(manifest), generator_sha256: "0".repeat(64) }));
    refused("were made by a generator that has changed since");
    writeFileSync(join(assets, "generated.json"), manifest);

    const task = join(assets, "tasks", readdirSync(join(assets, "tasks"))[0], "instruction.md");
    const taskText = readFileSync(task, "utf8");
    writeFileSync(task, `${taskText}\nEdited by hand.\n`);
    refused("are not what generate wrote");
    writeFileSync(task, taskText);

    const ran = run(["--corpus", "private", "--limit", "1", "--label", "p"]);
    expect(ran.code).toBe(0);
    expect(summary("p", "private")).toMatchObject({ corpus: "private", status: "complete", completion: { expected: 2, completed: 2 } });
  }, 60_000);
});

describe("the test doubles", () => {
  test("sandboxRepo leaves the repository it returns in the temporary folder, and no fixture beside it (#36)", () => {
    // Its own temporary folder, so the folders of other tests cannot be counted by mistake.
    const base = tmp();
    const was = process.env.TMPDIR;
    process.env.TMPDIR = base;
    let root = "";
    try {
      root = sandboxRepo();
    } finally {
      if (was === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = was;
    }
    expect(dirname(root)).toBe(base);
    expect(readdirSync(base)).toEqual([basename(root)]);
    expect(existsSync(join(root, "evals", "agent-ab", "tasks", "drillbit--scale", "task.toml"))).toBe(true); // the fixture was copied before it was removed
  });
});
