// The project-intent tests that need no model and no Docker: the tasks and their library, the Harbor job, the reading of a job folder and
// the scorer.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sha256Dir } from "../../../lib/harbor/harbor.ts";
import { libraryProblems, nudges, specOf } from "../../agent-ab/src/lib.ts";
import { taskNames } from "../../agent-ab/src/inputs.ts";
import { ARMS_FILE, jobConfig, loadProjectTrials, readArms } from "./collect.ts";
import { casesIn, kindOf } from "./measurement.ts";
import { DEFAULT_ARM, statusOf } from "./run.ts";
import { type ProjectTrial, buildReport, makeRow } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const TASKS = join(EVAL_DIR, "tasks");
const LIBRARIES = join(EVAL_DIR, "libraries");
const toml = (task: string) => Bun.TOML.parse(readFileSync(join(TASKS, task, "task.toml"), "utf8")) as { metadata: Record<string, any>; environment: { workdir: string } };
/** The first run's published summary (28 tasks, 0.10.261111-beta): later task sets only append, so its trials can be pooled with theirs. */
const FIRST_RUN = JSON.parse(readFileSync(join(EVAL_DIR, "..", "..", "reports", "0.10.261111-beta", "project-intent", "2026-11-07-0.10.261111-beta-project-intent", "summary.json"), "utf8")).tasks_sha256 as Record<string, string>;
const frontmatter = (ref: string) => readFileSync(join(LIBRARIES, "teams", `${ref}.md`), "utf8").split("---")[1];

describe("the tasks", () => {
  const names = taskNames(TASKS);

  test("80 tasks: 68 conflict tasks (thirty-four questions in each of the two projects) and 12 that need only unscoped notes; the first 28 are unchanged", () => {
    expect(names).toHaveLength(80);
    expect(names.filter((t) => kindOf(join(TASKS, t)) === "conflict")).toHaveLength(68);
    const general = names.filter((t) => kindOf(join(TASKS, t)) === "general");
    expect(general).toHaveLength(12);
    expect(general.filter((t) => t in FIRST_RUN)).toEqual(["config--orchid", "exitcode--quill", "lockfile--quill", "rewind--orchid"]);
    expect(Object.keys(FIRST_RUN)).toHaveLength(28);
    for (const [t, sha] of Object.entries(FIRST_RUN)) expect(sha256Dir(join(TASKS, t))).toBe(sha);
    for (const t of names) expect(readFileSync(join(TASKS, t, "task.toml"), "utf8")).toContain(`workdir = "/work/${t.split("--")[1]}"`);
    expect(new Set(names.map((t) => t.split("--")[0])).size).toBe(46); // 34 questions, each in both directories, and 12 general tasks, each in one
  });

  test("each verifier's answer is in its gold note, and the task does not point the agent at akm", () => {
    for (const t of names) {
      expect(libraryProblems(join(TASKS, t), LIBRARIES)).toEqual([]);
      expect(nudges(join(TASKS, t))).toEqual([]);
      expect(specOf(join(TASKS, t)).library).toBe("teams");
    }
  });

  test("a conflict task's gold note is its project's, and the other project's note answers the same question differently", () => {
    for (const t of names.filter((n) => kindOf(join(TASKS, n)) === "conflict")) {
      const m = toml(t).metadata;
      const other = m.project === "orchid" ? "quill" : "orchid";
      expect(frontmatter(m.gold_ref)).toContain(`\nproject: ${m.project}\n`);
      expect(frontmatter(m.other_ref)).toContain(`\nproject: ${other}\n`);
      expect(frontmatter(m.gold_ref).replace(m.project, "")).toBe(frontmatter(m.other_ref).replace(other, "")); // the same description and tags
      const text = readFileSync(join(LIBRARIES, "teams", `${m.other_ref}.md`), "utf8");
      for (const token of m.other_tokens) expect(text).toContain(token);
      const verifier = readFileSync(join(TASKS, t, "tests", "test.sh"), "utf8");
      expect(verifier).toContain(`OTHER='${m.other_tokens[0]}'`);
      expect(t).toBe(`${t.split("--")[0]}--${m.project}`);
    }
  });

  test("a general task's note carries no project key, so a project's filter keeps it", () => {
    for (const t of names.filter((n) => kindOf(join(TASKS, n)) === "general")) expect(frontmatter(toml(t).metadata.gold_ref)).not.toContain("project:");
  });

  test("each task's working directory is inside the paths its project registers in every arm that has projects", () => {
    const arms = readArms(EVAL_DIR);
    expect(Object.keys(arms)).toEqual(["none", "bare", "explicit"]);
    expect(arms.none).toBeNull();
    for (const t of names) {
      const { metadata, environment } = toml(t);
      expect(environment.workdir).toBe(`/work/${metadata.project}`);
      for (const arm of ["bare", "explicit"]) expect((arms[arm] as any)[metadata.project].paths).toContain(environment.workdir);
    }
    expect(arms.bare).toEqual({ orchid: { paths: ["/work/orchid"] }, quill: { paths: ["/work/quill"] } }); // the bare entry: paths only
    expect((arms.explicit as any).orchid.filters).toEqual({ project: ["orchid", ""] });
  });
});

describe("the Harbor job", () => {
  test("one akm agent per arm, labelled, with its projects, and nothing else different; no control arm", () => {
    const arms = readArms(EVAL_DIR);
    const job = jobConfig({ name: "j", model: "openai/m", tasksDir: "/t", tasks: ["pool--orchid"], librariesDir: "/l", attempts: 3, jobsDir: "/j", arms, arm: DEFAULT_ARM }) as { agents: { import_path: string; kwargs: Record<string, any> }[] };
    expect(job.agents.map((a) => a.import_path)).toEqual(Array(3).fill("akm_opencode:AkmOpenCode"));
    expect(job.agents.map((a) => a.kwargs.arm)).toEqual(["none", "bare", "explicit"]);
    expect(job.agents[0].kwargs.projects).toBeUndefined();
    expect(job.agents[2].kwargs.projects).toEqual(arms.explicit);
    const rest = job.agents.map(({ kwargs: { arm: _a, projects: _p, ...k }, ...a }) => ({ ...a, kwargs: k }));
    expect(rest[1]).toEqual(rest[0]);
    expect(rest[2]).toEqual(rest[0]);
    expect(rest[0].kwargs.akm_cli_version).toBe("0.10.261111-beta");
    expect(rest[0].kwargs.akm_plugin_version).toBe("0.10.261110-beta");
  });

  test("the default plugin has a committed lockfile; the CLI has none, as npm ci from one drops its SQLite driver", () => {
    const locks = join(EVAL_DIR, "..", "..", "lib", "harbor", "locks");
    expect(readFileSync(join(locks, `akm-opencode-${DEFAULT_ARM.plugin.version}`, "package-lock.json"), "utf8")).toContain('"akm-cli": "0.10.261111-beta"');
    expect(existsSync(join(locks, `akm-cli-${DEFAULT_ARM.cli.version}`))).toBe(false);
  });

  test("an arms file with one arm, or a label that is not one, is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "project-intent-"));
    try {
      writeFileSync(join(dir, ARMS_FILE), JSON.stringify({ none: null }));
      expect(() => readArms(dir)).toThrow("a comparison needs two or more");
      writeFileSync(join(dir, ARMS_FILE), JSON.stringify({ none: null, "Bare Arm": {} }));
      expect(() => readArms(dir)).toThrow("is not lower-case");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("what a run left", () => {
  test("each trial gets its arm label and the verifier's other_project", () => {
    const dir = mkdtempSync(join(tmpdir(), "project-intent-job-"));
    const put = (trial: string, agent: string, rewards: Record<string, number>) => {
      mkdirSync(join(dir, trial, "agent"), { recursive: true });
      writeFileSync(join(dir, trial, "result.json"), JSON.stringify({ task_name: "akm-eval/pool--orchid", agent_info: { name: agent }, agent_result: { n_input_tokens: 1000, n_cache_tokens: 0, n_output_tokens: 100 }, verifier_result: { rewards }, exception_info: null }));
    };
    try {
      put("pool--orchid__a", "akm-opencode-none", { reward: 0, other_project: 1 });
      put("pool--orchid__b", "akm-opencode-explicit", { reward: 1, other_project: 0 });
      const { trials } = loadProjectTrials(dir);
      expect(trials.map((t) => [t.project_arm, t.arm, t.reward, t.other_project])).toEqual([
        ["none", "akm", 0, 1],
        ["explicit", "akm", 1, 0],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the cases of the public folder digest the arms with every task", () => {
    const cases = casesIn(EVAL_DIR);
    expect(new Set(cases.map((c) => c.arms_sha256)).size).toBe(1);
    expect(cases.find((c) => c.id === "rewind--orchid")?.kind).toBe("general");
  });

  test("a run is complete only when every arm has every cell", () => {
    const full = { expected: 3, completed: 3, failed: 0, missing: 0, unexpected: 0 };
    expect(statusOf({ exit: 0, jobWritten: true, trees: 1, completion: { none: full, bare: full }, outside: 0 }).status).toBe("complete");
    const r = statusOf({ exit: 0, jobWritten: true, trees: 1, completion: { none: full, bare: { ...full, completed: 2, missing: 1 } }, outside: 1 });
    expect(r.aborted_reason).toBe("1 of 3 expected trials of the bare arm have no result; 1 trials belong to no arm of projects.json");
  });
});

describe("the scorer", () => {
  let n = 0;
  const trial = (task: string, arm: string, reward: number | null, o: Partial<ProjectTrial> = {}): ProjectTrial => ({
    task, arm: "akm", trial: `${task}__${String(n++).padStart(3, "0")}`, reward, error: reward === null ? "AkmPluginNotLoadedError" : null, akm: { akm_search: 1 }, tools: 2, curated: false,
    tokens: { input: 1000, cache: 0, output: 100 }, costUsd: null, seconds: 60, timed_out: false, agent_exit: false, project_arm: arm, other_project: reward === null ? null : 0, ...o,
  });
  const arms = ["none", "bare", "explicit"];
  const rows = [
    makeRow({ id: "pool--orchid", kind: "conflict" }, { arms, trials: [trial("pool--orchid", "none", 0, { other_project: 1 }), trial("pool--orchid", "bare", 1), trial("pool--orchid", "explicit", 1)] }),
    makeRow({ id: "pool--quill", kind: "conflict" }, { arms, trials: [trial("pool--quill", "none", 1), trial("pool--quill", "bare", 1), trial("pool--quill", "explicit", 1, { akm: {} })] }),
    makeRow({ id: "rewind--orchid", kind: "general" }, { arms, trials: [trial("rewind--orchid", "none", 1), trial("rewind--orchid", "bare", 1), trial("rewind--orchid", "explicit", 0), trial("rewind--orchid", "explicit", null, { tokens: null })] }),
  ];
  const r = buildReport(rows);

  test("pass rates per arm and per kind of task", () => {
    expect(r.by_arm.none.pass_rate?.value).toBe(0.667);
    expect(r.by_arm.bare.pass_rate?.value).toBe(1);
    expect(r.by_arm.none.conflict_pass_rate?.value).toBe(0.5);
    expect(r.by_arm.explicit.general_pass_rate?.value).toBe(0);
    expect([r.by_arm.explicit.scored, r.by_arm.explicit.errored]).toEqual([3, 1]);
  });

  test("every later arm against every earlier one, paired by task", () => {
    expect(r.comparisons.map((c) => `${c.a}-${c.b}`)).toEqual(["bare-none", "explicit-none", "explicit-bare"]);
    expect(r.comparisons[0].delta?.value).toBe(0.333);
    expect(r.comparisons[0].better).toEqual({ a: 1, b: 0, same: 2 });
    expect(r.comparisons[2].better).toEqual({ a: 0, b: 1, same: 2 });
  });

  test("the other project's value, akm calls and tokens per correct outcome", () => {
    expect(r.by_arm.none.other_project).toEqual({ trials: 2, count: 1, rate: 0.5 });
    expect(r.by_arm.explicit.akm_called).toEqual({ trials: 3, called: 2, rate: 0.667 });
    expect(r.by_arm.none.tokens).toEqual({ trials: 3, input: 3000, cache: 0, output: 300, per_trial: 1100, per_correct: 1650 });
    expect(r.by_arm.explicit.tokens.per_correct).toBe(1650); // three trials with tokens, two passed; the errored trial reported none
  });

  test("a task with an arm that has no scored trial has no verdict", () => {
    expect(rows.map((row) => row.tallies.explicit)).toEqual([{ trials: 1, scored: 1, passed: 1, errored: 0 }, { trials: 1, scored: 1, passed: 1, errored: 0 }, { trials: 2, scored: 1, passed: 0, errored: 1 }]);
  });
});
