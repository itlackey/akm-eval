import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadTrials, readTrial, readsCurated, toolCalls } from "./trials.ts";

describe("toolCalls", () => {
  let id = 0;
  const line = (tool: string) => JSON.stringify({ type: "tool_use", part: { type: "tool", tool, callID: `call_${id++}` } });

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

  describe("a call with several events", () => {
    // opencode can write a tool call again as its state changes: the same callID, the input only once it is known
    const state = (callID: string, tool: string, status: string, command?: string, sessionID?: string) =>
      JSON.stringify({ type: "tool_use", sessionID, part: { type: "tool", callID, tool, state: { status, input: command === undefined ? {} : { command } } } });

    test("is counted once, as a tool and as an akm tool", () => {
      const stream = [state("c1", "akm_show", "running"), state("c1", "akm_show", "completed"), state("c2", "read", "running"), state("c2", "read", "completed"), state("c3", "bash", "completed", "ls")].join("\n");
      expect(toolCalls(stream)).toEqual({ akm: { akm_show: 1 }, tools: 3 });
    });

    test("takes the command from the event that has it, whichever comes first", () => {
      const pending = state("c1", "bash", "pending");
      const done = state("c1", "bash", "completed", "akm show skills/x");
      expect(toolCalls([pending, done].join("\n"), true)).toEqual({ akm: { "akm (shell)": 1 }, tools: 1 });
      expect(toolCalls([done, pending].join("\n"), true)).toEqual({ akm: { "akm (shell)": 1 }, tools: 1 });
      expect(toolCalls([state("c1", "bash", "pending"), state("c1", "bash", "completed", "ls")].join("\n"), true)).toEqual({ akm: {}, tools: 1 });
    });

    test("is one call per id within a session, so the same id in another session is another call", () => {
      const stream = [state("c1", "akm_show", "completed", undefined, "ses_1"), state("c1", "akm_show", "completed", undefined, "ses_2"), state("c1", "akm_show", "completed", undefined, "ses_1")].join("\n");
      expect(toolCalls(stream)).toEqual({ akm: { akm_show: 2 }, tools: 2 });
      const inPart = JSON.stringify({ type: "tool_use", part: { type: "tool", callID: "c1", tool: "read", sessionID: "ses_3" } });
      expect(toolCalls([inPart, inPart].join("\n")).tools).toBe(1);
    });

    test("cannot be matched without an id, so each event counts", () => {
      const noId = JSON.stringify({ type: "tool_use", part: { type: "tool", tool: "akm_show" } });
      const empty = JSON.stringify({ type: "tool_use", part: { type: "tool", tool: "akm_show", callID: "" } });
      expect(toolCalls([noId, noId, empty, empty].join("\n"))).toEqual({ akm: { akm_show: 4 }, tools: 4 });
    });
  });

  describe("akm run in the shell", () => {
    const bash = (command: string) => JSON.stringify({ type: "tool_use", part: { type: "tool", tool: "bash", state: { input: { command } } } });

    test("counts a command that runs akm, for the arm that has it", () => {
      for (const command of ["akm show skills/drillbit", "cd /app && akm search drillbit", "cat x | akm remember", "echo hi; akm hints", "(akm help)"]) {
        expect(toolCalls(bash(command), true).akm).toEqual({ "akm (shell)": 1 });
      }
    });

    test("counts akm in a substitution, behind sudo, xargs and the like, and by its path", () => {
      const commands = [
        "echo $(akm show skills/x)",
        "ref=$(akm search drillbit | head -1)",
        "echo `akm show skills/x`",
        "sudo akm index",
        "sudo -E akm index",
        "ls refs.txt | xargs akm show",
        "cat refs.txt | xargs -n 1 akm show",
        "/usr/local/bin/akm show skills/x",
        "~/.bun/bin/akm search drillbit",
        "$HOME/.bun/bin/akm search drillbit",
        "./akm help",
        "AKM_STASH_DIR=/tmp/x akm search drillbit",
        "env AKM_STASH_DIR=/tmp/x akm search drillbit",
        "time akm search drillbit",
        "timeout 30 akm search drillbit",
        "nohup akm index &",
        "bash -c 'akm show skills/x'",
        'sh -lc "cd /app && akm search drillbit"',
        "if akm show skills/x; then echo found; fi",
        "for r in a b; do akm show $r; done",
        "{ akm show skills/x; }",
        "echo start\nakm show skills/x",
        "akm",
        "x=$(akm)",
      ];
      for (const command of commands) expect([command, toolCalls(bash(command), true).akm]).toEqual([command, { "akm (shell)": 1 }]);
    });

    test("does not count a command that only looks for akm or names it as an argument", () => {
      const commands = ["which akm", "command -v akm", "type akm", "man akm", "echo $(which akm)", "sudo apt-get install akm", "xargs echo akm", "cd /opt/akm && ls", "ls ./akm/", "echo \"akm show x\"", "git commit -m 'use akm'", "cat ~/.bun/bin/akm", "nohup python akm.py &"];
      for (const command of commands) expect([command, toolCalls(bash(command), true).akm]).toEqual([command, {}]);
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
