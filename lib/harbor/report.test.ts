import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Trial, buildReport, estimate, formatReport, loadTrials, readTrial, readsCurated, sideBySide, toolCalls } from "./report.ts";

const trial = (task: string, arm: "control" | "akm", reward: number | null, extra: Partial<Trial> = {}): Trial => ({
  task,
  arm,
  trial: `${task}__${Math.random().toString(36).slice(2, 9)}`,
  reward,
  error: reward === null ? "SetupError" : null,
  akm: arm === "akm" ? {} : null,
  tools: 3,
  tokens: { input: 1000, cache: 800, output: 100 },
  costUsd: null,
  seconds: 60,
  ...extra,
});

describe("estimate", () => {
  test("is the mean with an interval that holds it, and the same every time", () => {
    const e = estimate([1, 1, 0, 0, 1, 0, 1, 1]);
    expect(e?.value).toBe(0.625);
    expect(e?.n).toBe(8);
    expect(e && e.lo <= 0.625 && 0.625 <= e.hi).toBe(true);
    expect(e && e.lo >= 0 && e.hi <= 1).toBe(true);
    expect(estimate([1, 1, 0, 0, 1, 0, 1, 1])).toEqual(e);
  });

  test("has no width when every value is the same, and none at all without values", () => {
    expect(estimate([1, 1, 1])).toEqual({ value: 1, lo: 1, hi: 1, n: 3 });
    expect(estimate([0.5])).toEqual({ value: 0.5, lo: 0.5, hi: 0.5, n: 1 });
    expect(estimate([])).toBeNull();
  });
});

describe("toolCalls", () => {
  const line = (tool: string) => JSON.stringify({ type: "tool_use", part: { type: "tool", tool, callID: "c" } });

  test("counts every tool call and the akm ones by name", () => {
    const stream = [line("bash"), line("akm_curate"), line("akm_show"), line("akm_show"), line("read")].join("\n");
    expect(toolCalls(stream)).toEqual({ akm: { akm_curate: 1, akm_show: 2 }, tools: 5 });
  });

  test("skips stderr, other events and broken lines", () => {
    const stream = ["Error: something on stderr", JSON.stringify({ type: "step_start" }), JSON.stringify({ type: "text", part: { text: "akm_show" } }), "{not json", line("bash")].join("\n");
    expect(toolCalls(stream)).toEqual({ akm: {}, tools: 1 });
    expect(toolCalls("")).toEqual({ akm: {}, tools: 0 });
  });

  test("does not count a tool that only has akm in its name", () => {
    expect(toolCalls(line("my_akm_helper")).akm).toEqual({});
  });

  describe("akm run in the shell", () => {
    const bash = (command: string) => JSON.stringify({ type: "tool_use", part: { type: "tool", tool: "bash", state: { input: { command } } } });

    test("counts a command that runs akm, for the arm that has it", () => {
      for (const command of ["akm show skills/drillbit", "cd /app && akm search drillbit", "cat x | akm remember", "echo hi; akm hints", "(akm help)"]) {
        expect(toolCalls(bash(command), true).akm).toEqual({ "akm (shell)": 1 });
      }
    });

    test("does not count text that only mentions akm, nor a count without the option", () => {
      for (const command of ["echo 'akm-show-ref: skills/x' > note.txt", "grep akmx file", "ls /opt/akm", "echo akm", "cat akm.txt"]) {
        expect(toolCalls(bash(command), true).akm).toEqual({});
      }
      expect(toolCalls(bash("akm show x")).akm).toEqual({});
      expect(toolCalls(bash("akm show x"), false).tools).toBe(1);
    });
  });
});

describe("readsCurated", () => {
  const read = (filePath: string) => JSON.stringify({ type: "tool_use", part: { type: "tool", tool: "read", state: { input: { filePath } } } });

  test("is true when the agent read the file the plugin wrote for the session", () => {
    expect(readsCurated(["stderr line", read("/tmp/akm-opencode/curated/ses_abc.md")].join("\n"))).toBe(true);
  });

  test("is false for any other read, other tool or text that only mentions the file", () => {
    const bash = JSON.stringify({ type: "tool_use", part: { type: "tool", tool: "bash", state: { input: { command: "cat /tmp/akm-opencode/curated/x.md" } } } });
    const said = JSON.stringify({ type: "text", part: { text: "/tmp/akm-opencode/curated/x.md" } });
    expect(readsCurated([read("/app/curated/notes.md"), read("/app/summary.csv"), bash, said, "{broken curated"].join("\n"))).toBe(false);
    expect(readsCurated("")).toBe(false);
  });
});

describe("reading a Harbor job folder", () => {
  const result = (name: string, over: Record<string, unknown> = {}) => ({
    task_name: "akm-eval/drillbit--backup-policy-train",
    agent_info: { name },
    agent_result: { n_input_tokens: 2000, n_cache_tokens: 1500, n_output_tokens: 300, cost_usd: null },
    verifier_result: { rewards: { reward: 1.0 } },
    exception_info: null,
    task_id: { org: "terminal-bench", name: "drillbit--backup-policy-train", ref: "sha256:abc123" },
    started_at: "2026-10-06T04:00:00Z",
    finished_at: "2026-10-06T04:01:30Z",
    agent_execution: { started_at: "2026-10-06T04:00:30Z", finished_at: "2026-10-06T04:01:10Z" },
    ...over,
  });

  function job(trials: Record<string, { result: unknown; stream?: string }>): string {
    const dir = mkdtempSync(join(tmpdir(), "agent-ab-test-"));
    writeFileSync(join(dir, "result.json"), "{}"); // the job's own result, not a trial
    for (const [name, t] of Object.entries(trials)) {
      mkdirSync(join(dir, name, "agent"), { recursive: true });
      writeFileSync(join(dir, name, "result.json"), JSON.stringify(t.result));
      if (t.stream !== undefined) writeFileSync(join(dir, name, "agent", "opencode.txt"), t.stream);
    }
    return dir;
  }

  test("reads the arm, the reward, the tokens and the tool calls", () => {
    const stream = [JSON.stringify({ type: "tool_use", part: { tool: "akm_show" } }), JSON.stringify({ type: "tool_use", part: { tool: "read", state: { input: { filePath: "/tmp/akm-opencode/curated/ses_1.md" } } } })].join("\n");
    const dir = job({ a__1: { result: result("akm-opencode"), stream }, c__1: { result: result("opencode", { verifier_result: { rewards: { reward: 0.0 } } }), stream: "" } });
    try {
      const trials = loadTrials(dir);
      expect(trials.map((t) => [t.arm, t.reward, t.task])).toEqual([
        ["akm", 1, "drillbit--backup-policy-train"],
        ["control", 0, "drillbit--backup-policy-train"],
      ]);
      expect(trials[0].akm).toEqual({ akm_show: 1 });
      expect(trials[0].curated).toBe(true);
      expect(trials[1].akm).toEqual({});
      expect(trials[1].curated).toBeNull(); // the control has no plugin to curate
      expect(trials[0].tokens).toEqual({ input: 2000, cache: 1500, output: 300 });
      expect(trials[0].seconds).toBe(90);
      expect(trials[0].agentSeconds).toBe(40);
      expect(trials[0].digest).toBe("sha256:abc123");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a trial with no verifier result is errored, one that timed out but was verified keeps its reward", () => {
    const dir = job({
      a__1: { result: result("akm-opencode", { verifier_result: null, exception_info: { exception_type: "AkmPluginNotLoadedError" } }) },
      a__2: { result: result("akm-opencode", { exception_info: { exception_type: "AgentTimeoutError" } }) },
    });
    try {
      const [errored, timedOut] = loadTrials(dir);
      expect([errored.reward, errored.error, errored.akm]).toEqual([null, "AkmPluginNotLoadedError", null]);
      expect([timedOut.reward, timedOut.error]).toEqual([1, "AgentTimeoutError"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("refuses a trial of some other agent", () => {
    const dir = job({ x__1: { result: result("oracle") } });
    try {
      expect(() => readTrial(join(dir, "x__1"), "x__1")).toThrow("neither opencode nor akm-opencode");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("buildReport", () => {
  // Three tasks, two attempts each. The control passes t3 only. The akm arm passes t1 and t2 in full and t3 once.
  const trials: Trial[] = [
    trial("t1", "control", 0),
    trial("t1", "control", 0),
    trial("t2", "control", 0),
    trial("t2", "control", 0),
    trial("t3", "control", 1),
    trial("t3", "control", 1),
    trial("t1", "akm", 1, { akm: { akm_curate: 1, akm_show: 1 } }),
    trial("t1", "akm", 1, { akm: { akm_show: 1 } }),
    trial("t2", "akm", 1, { akm: { akm_show: 2 } }),
    trial("t2", "akm", 1, { akm: { akm_search: 1 } }),
    trial("t3", "akm", 1, { akm: {} }),
    trial("t3", "akm", 0, { akm: {} }),
  ];

  test("the pass rate of an arm is the mean over tasks of the task's own rate", () => {
    const r = buildReport(trials);
    expect(r.control.pass_rate?.value).toBe(0.333);
    expect(r.akm.pass_rate?.value).toBe(0.833);
    expect(r.control).toMatchObject({ trials: 6, scored: 6, errored: 0, passed: 2, tasks: 3 });
    expect(r.akm).toMatchObject({ trials: 6, scored: 6, passed: 5 });
  });

  test("the difference is paired by task", () => {
    const r = buildReport(trials);
    // t1 +1, t2 +1, t3 -0.5
    expect(r.delta?.value).toBe(0.5);
    expect(r.delta?.n).toBe(3);
  });

  test("counts the tasks by which arm did better", () => {
    expect(buildReport(trials).better).toEqual({ akm: 2, control: 1, same: 0 });
    const r = buildReport([trial("a", "control", 1), trial("a", "akm", 1), trial("b", "control", 0), trial("b", "akm", 0), trial("c", "control", 0), trial("c", "akm", 1), trial("d", "control", 1)]);
    expect(r.better).toEqual({ akm: 1, control: 0, same: 2 }); // d has no akm trial
    expect(formatReport(r).join("\n")).toContain("of those 3 tasks, the akm arm did better on 1, the control on 0, and they did the same on 2");
    expect(buildReport([]).better).toEqual({ akm: 0, control: 0, same: 0 });
  });

  test("counts the trials in which the agent read the curated results, apart from those that called akm", () => {
    const r = buildReport([trial("t1", "akm", 1, { akm: {}, curated: true }), trial("t2", "akm", 1, { akm: { akm_show: 1 }, curated: false }), trial("t3", "akm", 0, { akm: {}, curated: null })]);
    expect(r.engagement).toMatchObject({ trials: 3, called: 1, curated_read: 1 });
    expect(formatReport(r).join("\n")).toContain("read the curated results the plugin wrote for it in 1 of 3 akm trials");
  });

  test("splits the akm trials by whether they called akm, each against the control on the same tasks", () => {
    const e = buildReport(trials).engagement;
    expect(e).toMatchObject({ trials: 6, called: 4, rate: 0.667, control_calls: 0 });
    expect(e.calls).toEqual({ akm_curate: 1, akm_show: 4, akm_search: 1 });
    expect(e.called_split).toMatchObject({ trials: 4, passed: 4 });
    expect(e.called_split.delta?.value).toBe(1); // t1 and t2: 1 - 0
    expect(e.called_split.delta?.n).toBe(2);
    expect(e.not_called_split).toMatchObject({ trials: 2, passed: 1 });
    expect(e.not_called_split.delta?.value).toBe(-0.5); // t3: 0.5 - 1
    expect(e.not_called_split.delta?.n).toBe(1);
  });

  test("leaves errored trials out of the rates and counts them, and drops a task one arm never scored", () => {
    const withErrors = [...trials, trial("t4", "control", 1), trial("t4", "akm", null), trial("t1", "akm", null, { error: "AkmPluginNotLoadedError" })];
    const r = buildReport(withErrors);
    expect(r.akm).toMatchObject({ trials: 8, scored: 6, errored: 2 });
    expect(r.akm.exceptions).toEqual({ SetupError: 1, AkmPluginNotLoadedError: 1 });
    expect(r.akm.pass_rate?.value).toBe(0.833); // the errored trials are not zeros
    expect(r.control.pass_rate?.n).toBe(4);
    expect(r.delta?.n).toBe(3); // t4 has no scored akm trial
    expect(r.engagement.trials).toBe(6);
  });

  test("an unreadable stream is in the pass rate and out of the engagement split", () => {
    const r = buildReport([trial("t1", "control", 0), trial("t1", "akm", 1, { akm: null })]);
    expect(r.akm.pass_rate?.value).toBe(1);
    expect(r.engagement).toMatchObject({ trials: 0, called: 0, rate: null });
    expect(r.engagement.called_split.delta).toBeNull();
  });

  test("counts control trials that called akm, which should be none", () => {
    const r = buildReport([trial("t1", "control", 1, { akm: { akm_show: 1 } }), trial("t1", "akm", 1, { akm: {} })]);
    expect(r.engagement.control_calls).toBe(1);
    expect(formatReport(r).join("\n")).toContain("WARNING: 1 control trials called akm");
  });

  test("lists each task with both arms and the trials that called akm", () => {
    const r = buildReport(trials);
    expect(r.tasks).toEqual([
      { task: "t1", control: "0/2", akm: "2/2", called: "2/2" },
      { task: "t2", control: "0/2", akm: "2/2", called: "2/2" },
      { task: "t3", control: "2/2", akm: "1/2", called: "0/2" },
    ]);
  });

  test("prints the numbers a reader looks for", () => {
    const text = formatReport(buildReport(trials)).join("\n");
    expect(text).toContain("pass rate 0.333");
    expect(text).toContain("pass rate 0.833");
    expect(text).toContain("difference (akm - control, paired by task)  +0.500");
    expect(text).toContain("akm called in 4 of 6 akm trials (67%)");
    expect(text).toContain("control  6,000 input tokens (4,800 from cache), 600 output");
    expect(text).toContain("t3");
  });

  test("an empty run reports nothing and does not throw", () => {
    const r = buildReport([]);
    expect(r.delta).toBeNull();
    expect(r.control.pass_rate).toBeNull();
    expect(formatReport(r).join("\n")).toContain("n/a");
  });
});

describe("timeouts, minutes and dollars", () => {
  test("a trial that ran out of time is counted apart, and is scored when it was still verified", () => {
    const r = buildReport([
      trial("t1", "control", 1, { error: "AgentTimeoutError" }),
      trial("t2", "control", null, { error: "AgentTimeoutError" }),
      trial("t3", "control", null, { error: "SetupError" }),
      trial("t4", "control", 0),
    ]);
    expect(r.control).toMatchObject({ trials: 4, scored: 2, errored: 2, timeouts: 2 });
    expect(r.control.exceptions).toEqual({ AgentTimeoutError: 2, SetupError: 1 });
    expect(r.control.pass_rate?.value).toBe(0.5); // t1 passed, t4 failed. The unverified ones are not zeros
    const row = formatReport(r).find((l) => l.includes("control") && l.includes("pass rate"));
    expect(row).toContain("2 errored (exceptions: SetupError 1), 2 timed out");
  });

  test("marks the tasks that timed out in the table, and says what the mark means", () => {
    const r = buildReport([trial("t1", "control", 1, { error: "AgentTimeoutError" }), trial("t1", "akm", 0), trial("t2", "control", 1), trial("t2", "akm", 1)]);
    expect(r.tasks).toEqual([
      { task: "t1", control: "1/1 T", akm: "0/1", called: "0/1" },
      { task: "t2", control: "1/1", akm: "1/1", called: "0/1" },
    ]);
    expect(formatReport(r).join("\n")).toContain("T: the agent ran out of time");
    expect(formatReport(buildReport([trial("t1", "control", 1)])).join("\n")).not.toContain("T: the agent");
  });

  test("averages the minutes and the dollars over the scored trials that have them", () => {
    const r = buildReport([
      trial("t1", "akm", 1, { seconds: 600, agentSeconds: 300, costUsd: 0.1 }),
      trial("t2", "akm", 1, { seconds: 1200, agentSeconds: 900, costUsd: 0.3 }),
      trial("t3", "akm", 0, { seconds: null, agentSeconds: null, costUsd: null }),
      trial("t4", "akm", null, { seconds: 60, agentSeconds: null, costUsd: null }), // stopped in the setup
    ]);
    expect(r.akm.per_trial).toEqual({ minutes: 15, agent_minutes: 10, cost_usd: 0.2 });
    expect(buildReport([]).control.per_trial).toEqual({ minutes: null, agent_minutes: null, cost_usd: null });
    expect(formatReport(r).join("\n")).toContain("akm      per scored trial: 15.0 minutes, 10.0 of them the agent's own run, 0.2 USD");
  });
});

describe("sideBySide", () => {
  test("puts the two corpora in columns, with their timeouts, and pools nothing", () => {
    const a = buildReport([trial("a", "control", 0), trial("a", "akm", 1, { akm: { akm_show: 1 } })]);
    const b = buildReport([trial("c", "control", 1, { error: "AgentTimeoutError" }), trial("c", "akm", 0)]);
    const lines = sideBySide("bench", { corpus: "public", report: a }, { corpus: "private", report: b });
    expect(lines[0]).toBe("bench: public and private side by side (not pooled)");
    expect(lines.find((l) => l.includes("timed out"))).toContain("1 control trials, 0 akm trials");
    expect(lines.find((l) => l.includes("akm called in"))).toContain("1 of 1 akm trials");
  });
});
