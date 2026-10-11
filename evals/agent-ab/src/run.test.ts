import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AkmArm, PINS, modelSettings, sha256Dir } from "../../../lib/harbor/harbor.ts";
import { type Trial, buildReport } from "../../../lib/harbor/report.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
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
  /** A `uv` that is not Harbor. Given the job, it leaves the trial folders Harbor would leave, records the environment it was started in, and exits as FAKE_UV_EXIT says. */
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
job.datasets[0].task_names.forEach((task, i) => {
  for (const agent of job.agents) {
    const name = agent.name ?? "akm-opencode";
    const dir = join(job.jobs_dir, job.job_name, task + "__" + name);
    mkdirSync(join(dir, "agent"), { recursive: true });
    const trial = { task_name: task, agent_info: { name }, verifier_result: { rewards: { reward: name === "opencode" ? 0 : 1 } }, started_at: "2026-10-06T04:00:00Z", finished_at: "2026-10-06T04:05:00Z" };
    if (process.env.FAKE_UV_TIMEOUTS && i === 0 && name === "akm-opencode") { trial.exception_info = { exception_type: "AgentTimeoutError" }; }
    if (process.env.FAKE_UV_PLUGIN_DEAD && i === 1 && name === "akm-opencode") {
      trial.exception_info = { exception_type: "AgentTimeoutError" };
      trial.verifier_result = null;
      writeFileSync(join(dir, "agent", "akm_plugin_status.json"), JSON.stringify({ live: false, problem: "there is no opencode log" }));
    }
    if (name === "akm-opencode") writeFileSync(join(dir, "agent", "akm_install.json"), JSON.stringify({ akm_version: "0.9.99-test", plugin_akm_cli: "0.9.26", assets_indexed: 7, env: { AKM_CURATE_TIMEOUT: "15" } }));
    writeFileSync(join(dir, "result.json"), JSON.stringify(trial));
  }
});
process.exit(Number(process.env.FAKE_UV_EXIT ?? 0));
`,
    );
    chmodSync(join(root, "bin", "uv"), 0o755);
    return { root, env: { PATH: `${join(root, "bin")}:${process.env.PATH}` } };
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
    expect(stored.pins).toEqual(PINS);
    // The task list, the options of both agents and the concurrency, from job.json, with no folder of this machine.
    expect(stored.job.datasets).toEqual([{ path: "evals/agent-ab/tasks", task_names: selectTasks(taskNames(join(EVAL_DIR, "tasks")), 3) }]);
    expect(stored.job).toMatchObject({ n_attempts: 1, n_concurrent_trials: 4 });
    expect(stored.job.agents[0]).toMatchObject({ name: "opencode", override_setup_timeout_sec: 2700, kwargs: { opencode_config: { autoupdate: false } } });
    expect(stored.job.agents[1]).toMatchObject({ import_path: "akm_opencode:AkmOpenCode", override_setup_timeout_sec: 2700, kwargs: { akm_cli_version: PINS.akm_cli, libraries_dir: "evals/agent-ab/libraries" } });
    expect(stored.libraries_sha256).toBe(sha256Dir(join(EVAL_DIR, "libraries")));
    expect(stored.akm_install.observed).toMatchObject({ akm_version: ["0.9.99-test"], plugin_akm_cli: ["0.9.26"], assets_indexed: [7], env: { AKM_CURATE_TIMEOUT: "15" } });
    expect(JSON.stringify(stored.job)).not.toContain(root);
    expect(s.report.control).toMatchObject({ trials: 3, passed: 0 });
    expect(s.report.akm).toMatchObject({ trials: 3, passed: 3 });
  });

  test("installs the akm --akm names, keeps a copy of its tarballs with the run, and records the settings it ran with", async () => {
    const { root, env } = fakeUv();
    const packs = tmp();
    writeFileSync(join(packs, "akm-cli-0.9.27.tgz"), "an akm");
    writeFileSync(join(packs, "akm-opencode-0.9.27.tgz"), "a plugin");
    const arm: AkmArm = { bin: "~/code/akm", build: "v0.9.27-3-gabc", cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: "0.9.27", tarball: "akm-opencode-0.9.27.tgz" }, packages: packs };
    const s = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env, arm, akmEnv: { AKM_CURATE_TIMEOUT: "30" } }, join(root, "results")));
    const kwargs = readJson(join(s.results_dir, "job.json")).agents[1].kwargs;
    expect(kwargs).toMatchObject({ akm_cli_version: "0.9.27", akm_plugin_version: "0.9.27", akm_package: "akm-cli-0.9.27.tgz", plugin_package: "akm-opencode-0.9.27.tgz", packages_dir: join(s.results_dir, "akm-packages"), akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(readFileSync(join(s.results_dir, "akm-packages", "akm-opencode-0.9.27.tgz"), "utf8")).toBe("a plugin");
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored).toMatchObject({ akm_version: "0.9.27", akm_bin: "~/code/akm", akm_build: "v0.9.27-3-gabc", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(stored.pins).toEqual({ ...PINS, akm_cli: "0.9.27", akm_plugin: "0.9.27" });
    expect(stored.akm_install).toMatchObject({ from: "checkout", plugin_from: "checkout", plugin_version: "0.9.27", packages: [{ file: "akm-cli-0.9.27.tgz" }, { file: "akm-opencode-0.9.27.tgz" }] });
    expect(stored.job.agents[1].kwargs).toMatchObject({ packages_dir: "akm-packages", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
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
    const timeouts = await quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 2, env: { ...env, FAKE_UV_TIMEOUTS: "1" } }, join(root, "results")));
    expect(timeouts.timeouts).toEqual({ control: 0, akm: 1 });
    expect(timeouts.metrics.akm.timeouts).toBe(1);
    const rows = readFileSync(join(timeouts.results_dir, "samples.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.filter((r) => r.timed_out).map((r) => r.arm)).toEqual(["akm"]);
    const dead = await quiet(() => runCorpus("public", { model: "openai/x", label: "d", limit: 2, env: { ...env, FAKE_UV_PLUGIN_DEAD: "1" } }, join(root, "results")));
    expect(dead.report.akm.exceptions).toEqual({ AkmPluginNotLoadedError: 1 });
    expect(dead.n_errored).toBe(1);
    expect(dead.timeouts.akm).toBe(1);
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
    await expect(quiet(() => runCorpus("public", { model: "openai/x", label: "t", limit: 1, env: { ...env, FAKE_UV_EXIT: "3" } }, join(root, "results")))).rejects.toThrow("Harbor exited 3");
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
