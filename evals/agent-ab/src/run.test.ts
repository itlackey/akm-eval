import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PINS } from "../../../lib/harbor/harbor.ts";
import { type Trial, buildReport } from "../../../lib/harbor/report.ts";
import { jobConfig, selectTasks, sideBySide, taskNames } from "./run.ts";

const EVAL_DIR = join(import.meta.dir, "..");

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
