// The cli-ratification tests that need no model and no Docker: the cards and the folders generated from them, the prompts, the Harbor
// job, the reading of a job folder, the run's status and the check verdict. The verifier is in verify.test.ts, the trace in trace.test.ts
// and the scorer in score.test.ts.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FIXED_AKM_ENV } from "../../../lib/harbor/harbor.ts";
import { taskNames } from "../../agent-ab/src/inputs.ts";
import { CARDS, SEED, expectedOf } from "./cards.ts";
import { ARMS_FILE, PROJECTS, armOf, armsOf, jobConfig, loadCliTrials, readArms, specOf } from "./collect.ts";
import { AGENT_TIMEOUT_SEC, differences, render } from "./generate.ts";
import { casesIn } from "./measurement.ts";
import { DEFAULT_ARM, checkVerdict, statusOf } from "./run.ts";
import type { CliTrial } from "./score.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const TASKS = join(EVAL_DIR, "tasks");
const LIBRARIES = join(EVAL_DIR, "libraries");
const toml = (task: string) => Bun.TOML.parse(readFileSync(join(TASKS, task, "task.toml"), "utf8")) as { metadata: Record<string, any>; environment: { workdir: string; env: Record<string, string> }; agent: { timeout_sec: number } };
const CURL_LAYER = "RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*\n\n";

/** Command names, flags and the plugin's words that an instruction may not use: the card asks for an outcome. */
const COMMANDS = /\bakm (search|show|curate|remember|index|workflow|config|import|feedback)\b|--(filter|prefer|project|pack|format)\b|\b(curate|remember|reindex|resume|workflow run|akm index)\b/i;

describe("the cards", () => {
  const cards = CARDS();

  test("fourteen: three in each of the first four families, and the two regression cards", () => {
    expect(cards.map((c) => c.id)).toEqual(["apply--service-json", "apply--deploy-env", "apply--limits-json", "persist--canary-share", "persist--staging-host", "persist--release-address", "repair--stale-index", "repair--excluded-type", "repair--project-filter", "resume--release-3", "resume--release-4", "resume--release-last", "regression--1472-cross-project", "regression--1473-pack"]);
    const count = (f: string) => cards.filter((c) => c.family === f).length;
    expect([count("apply"), count("persist"), count("repair"), count("resume"), count("regression")]).toEqual([3, 3, 3, 3, 2]);
    expect(new Set(cards.map((c) => c.project))).toEqual(new Set(["orchid", "quill"]));
    expect(SEED).toBe("cli-ratification/1");
  });

  test("the folders on disk are exactly what the cards generate", () => {
    expect(differences()).toEqual([]);
    expect(taskNames(TASKS)).toEqual(cards.map((c) => c.id).sort());
  });

  test("a card is a Harbor task of its own library, in its project's directory, with the pilot's twelve minutes", () => {
    for (const c of cards) {
      const t = toml(c.id);
      expect(t.environment.workdir).toBe(`/work/${c.project}`);
      expect(t.environment.env.AKM_TASK_STASH).toBe(c.id);
      expect(existsSync(join(LIBRARIES, c.id))).toBe(true);
      expect(t.agent.timeout_sec).toBe(AGENT_TIMEOUT_SEC);
      expect(readFileSync(join(TASKS, c.id, "environment", "Dockerfile"), "utf8")).toContain(CURL_LAYER);
      expect(specOf(join(TASKS, c.id))).toEqual({ family: c.family, evidence: c.evidence, commands: c.commands });
    }
  });

  test("no two cards share a Dockerfile, so no two share image layers", () => {
    const files = cards.map((c) => readFileSync(join(TASKS, c.id, "environment", "Dockerfile"), "utf8"));
    expect(new Set(files).size).toBe(cards.length);
  });

  test("an instruction asks for an outcome: it names no command, flag or ref", () => {
    for (const c of cards) {
      expect(c.instruction.match(COMMANDS)?.[0]).toBeUndefined();
      expect(c.instruction).not.toMatch(/\b(memories|knowledge|workflows)\/[\w-]+/);
      expect(c.instruction.startsWith(`You are working in /work/${c.project}`)).toBe(true);
    }
  });

  test("the answers are in the library and nowhere the agent can see before it asks akm", () => {
    for (const c of cards.filter((k) => k.family === "apply" || k.family === "regression")) {
      const seen = [c.instruction, ...Object.values(c.workspace), readFileSync(join(TASKS, c.id, "environment", "Dockerfile"), "utf8")].join("\n");
      for (const answer of c.evidence) {
        expect(seen).not.toContain(answer);
        expect(Object.values(c.library).some((text) => text.includes(answer))).toBe(true);
      }
    }
  });

  test("the expected values are only in the verifier's folder, which Harbor uploads after the agent", () => {
    for (const c of cards) {
      const agentSees = Object.keys(render([c])).filter((p) => p.startsWith(`tasks/${c.id}/environment/`) || p === `tasks/${c.id}/instruction.md`);
      expect(agentSees.some((p) => p.includes("expected.json"))).toBe(false);
      expect(existsSync(join(TASKS, c.id, "tests", "expected.json"))).toBe(true);
      expect(JSON.parse(readFileSync(join(TASKS, c.id, "tests", "expected.json"), "utf8"))).toEqual(JSON.parse(JSON.stringify(expectedOf(c))));
    }
  });

  test("the seed counts every library file as an asset except the two hidden scripts, and only the reference gets the recipe", () => {
    for (const c of cards) {
      const files = readdirSync(join(LIBRARIES, c.id), { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
      const hidden = files.filter((e) => e.name.startsWith(".")).map((e) => e.name).sort();
      expect(hidden).toEqual(c.library[".plant.sh"] ? [".plant.sh", ".solve.sh"] : [".solve.sh"]);
      for (const e of files.filter((f) => !f.name.startsWith("."))) expect(e.parentPath.slice(join(LIBRARIES, c.id).length + 1).split("/")[0]).toMatch(/^(memories|knowledge|workflows)$/);
      expect(readFileSync(join(LIBRARIES, c.id, ".solve.sh"), "utf8")).toContain("The informed reference");
    }
  });

  test("a project's two notes read alike: their names and bodies never say which project they belong to", () => {
    for (const c of cards.filter((k) => k.family === "apply")) for (const [path, text] of Object.entries(c.library)) {
      expect(path).not.toMatch(/orchid|quill/i);
      if (path.startsWith("memories/") || path.startsWith("knowledge/")) expect(text.split("---\n").slice(2).join("")).not.toMatch(/orchid|quill/i);
    }
  });
});

describe("the arms and their prompts", () => {
  const prompts = join(EVAL_DIR, "prompts");

  test("CLI-minimal is the article's wrapper, exactly, and the card follows it", () => {
    expect(readFileSync(join(prompts, "minimal.md"), "utf8")).toBe(`AKM is installed as \`akm\`. Use it to complete the request below.
Work only with the disposable environment and files provided here.
You may inspect the installed tool and its shipped materials.
When finished, write REPORT.md with the outcome, what you verified,
and anything you had to guess or could not discover.

{{ instruction }}
`);
  });

  test("the guidance card is at most 150 words, is the wrapper plus the card plus the task, and gives no solution", () => {
    const card = readFileSync(join(prompts, "guidance-card.md"), "utf8").trim();
    expect(card.split(/\s+/).length).toBeLessThanOrEqual(150);
    const minimal = readFileSync(join(prompts, "minimal.md"), "utf8");
    expect(readFileSync(join(prompts, "guidance.md"), "utf8")).toBe(minimal.replace("{{ instruction }}", `${card}\n\n{{ instruction }}`));
    // concepts and discovery: no command that does a task, and none of the cards' words for what to do
    expect(card).not.toMatch(/\b(index|reindex|resume|remember|curate|config set|workflow run|--filter|--project|--pack)\b/i);
  });

  test("two model arms and two check arms, and the check arms call no model", () => {
    const arms = readArms(EVAL_DIR);
    expect(Object.keys(armsOf(arms, false))).toEqual(["minimal", "guidance"]);
    expect(Object.keys(armsOf(arms, true))).toEqual(["reference", "noop"]);
    for (const a of Object.values(arms)) if (a.prompt) expect(existsSync(join(EVAL_DIR, a.prompt))).toBe(true);
    expect(ARMS_FILE).toBe("arms.json");
  });

  test("an arm needs a prompt or a script, not both and not neither", () => {
    const dir = mkdtempSync(join(tmpdir(), "cli-rat-arms-"));
    try {
      for (const bad of [{ a: {} }, { a: { prompt: "p", script: "noop" } }, { A: { prompt: "p" } }, { a: { script: "other" } }]) {
        writeFileSync(join(dir, ARMS_FILE), JSON.stringify(bad));
        expect(() => readArms(dir)).toThrow(ARMS_FILE);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the Harbor job", () => {
  const arms = readArms(EVAL_DIR);
  const job = (which: boolean, model: string | null) =>
    jobConfig({ name: "j", model, tasksDir: TASKS, tasks: ["apply--service-json"], librariesDir: LIBRARIES, promptsDir: join(EVAL_DIR, "prompts"), attempts: 1, jobsDir: "/jobs", arms: armsOf(arms, which), arm: DEFAULT_ARM }) as { agents: { import_path: string; model_name?: string; kwargs: Record<string, any> }[]; environment: any; n_concurrent_trials: number };

  test("one CLI agent per arm: no plugin, the same projects, the arm's own prompt, two trials at a time on the shared network", () => {
    const j = job(false, "openai/gpt-6-luna");
    expect(j.agents.map((a) => a.import_path)).toEqual(["akm_cli:AkmCli", "akm_cli:AkmCli"]);
    expect(j.agents.map((a) => a.kwargs.arm)).toEqual(["minimal", "guidance"]);
    for (const a of j.agents) {
      expect(a.model_name).toBe("openai/gpt-6-luna");
      expect(a.kwargs.projects).toEqual(PROJECTS);
      expect(a.kwargs.akm_cli_version).toBe("0.10.261111-beta");
      expect(Object.keys(a.kwargs).filter((k) => /plugin/i.test(k))).toEqual([]);
      expect(a.kwargs.script).toBeUndefined();
      expect(a.kwargs.disable_web_search).toBe(true); // opencode's webfetch and websearch are off
      expect(a.kwargs.opencode_config.plugin).toBeUndefined();
    }
    expect(j.agents[0].kwargs.prompt_template_path).toBe(join(EVAL_DIR, "prompts", "minimal.md"));
    expect(j.agents[1].kwargs.prompt_template_path).toBe(join(EVAL_DIR, "prompts", "guidance.md"));
    expect(j.n_concurrent_trials).toBe(2);
    expect(JSON.stringify(j.environment)).toContain("shared-network.yaml");
    expect(j.agents.some((a) => a.import_path.includes("akm_opencode") || a.import_path.includes("eval_opencode"))).toBe(false);
  });

  test("the check arms run a script and no model, and have no prompt", () => {
    const j = job(true, null);
    expect(j.agents.map((a) => [a.kwargs.arm, a.kwargs.script])).toEqual([["reference", "reference"], ["noop", "noop"]]);
    for (const a of j.agents) {
      expect(a.model_name).toBeUndefined();
      expect(a.kwargs.opencode_config).toBeUndefined();
      expect(a.kwargs.prompt_template_path).toBeUndefined();
    }
  });

  test("the arm's fixed settings are those of lib/harbor, and `armOf` reads the agent name Harbor records", () => {
    expect(FIXED_AKM_ENV).toContain("AKM_BUNDLE_DIR");
    expect(armOf("akm-cli-minimal")).toBe("minimal");
    expect(armOf("akm-opencode-bare")).toBeNull();
    expect(armOf("opencode")).toBeNull();
  });
});

describe("reading a job folder", () => {
  const specs = new Map([["apply--service-json", specOf(join(TASKS, "apply--service-json"))]]);
  const dir = mkdtempSync(join(tmpdir(), "cli-rat-job-"));

  function trial(name: string, o: { agent: string; reward: number | null; checks?: Record<string, { ok: boolean }>; stream?: string; error?: string }) {
    const t = join(dir, name);
    mkdirSync(join(t, "verifier"), { recursive: true });
    mkdirSync(join(t, "agent"), { recursive: true });
    writeFileSync(join(t, "result.json"), JSON.stringify({ task_name: "akm-eval/apply--service-json", agent_info: { name: o.agent }, verifier_result: o.reward === null ? null : { rewards: { reward: o.reward } }, exception_info: o.error ? { exception_type: o.error } : null, agent_result: { n_input_tokens: 100, n_cache_tokens: 10, n_output_tokens: 20 } }));
    if (o.checks) writeFileSync(join(t, "verifier", "checks.json"), JSON.stringify({ reward: o.reward, checks: o.checks }));
    if (o.stream !== undefined) writeFileSync(join(t, "agent", "opencode.txt"), o.stream);
  }
  const call = (command: string, output: string) => JSON.stringify({ type: "tool_use", timestamp: 1000, part: { type: "tool", tool: "bash", callID: `c${command.length}`, state: { input: { command }, output, metadata: { exit: 0 }, time: { start: 2000 } } } });

  test("a trial gets its arm, its failed checks and its trace; a script arm has no trace", () => {
    const [port, where] = specs.get("apply--service-json")!.evidence;
    trial("t1", { agent: "akm-cli-minimal", reward: 1, checks: { "1-json-file:service.json": { ok: true } }, stream: [call("akm show memories/a", `port ${port} in ${where}`), call(`echo ${port} ${where} > service.json`, "")].join("\n") });
    trial("t2", { agent: "akm-cli-guidance", reward: 0, checks: { "1-json-file:service.json": { ok: false }, "3-preserved": { ok: true } }, stream: "" });
    trial("t3", { agent: "akm-cli-noop", reward: 0, checks: { "1-json-file:service.json": { ok: false } } });
    trial("t4", { agent: "akm-cli-minimal", reward: null, error: "AgentTimeoutError" });
    const { trials } = loadCliTrials(dir, specs);
    const by = Object.fromEntries(trials.map((t) => [t.trial, t]));
    expect(by.t1).toMatchObject({ cli_arm: "minimal", family: "apply", reward: 1, failed_checks: [], mediated: true, arm: "akm" });
    expect(by.t1.trace).toMatchObject({ calls: 2, akm_calls: 1, first_useful_calls: 1 });
    expect(by.t2).toMatchObject({ cli_arm: "guidance", failed_checks: ["1-json-file:service.json"], mediated: false });
    expect(by.t3).toMatchObject({ cli_arm: "noop", mediated: null, trace: null });
    expect(by.t4).toMatchObject({ reward: null, error: "AgentTimeoutError", failed_checks: null, timed_out: true });
  });

  test("a trial of a task the run did not ask for is an error", () => {
    expect(() => loadCliTrials(dir, new Map())).toThrow("not among the tasks of the run");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("the cases and the run's status", () => {
  test("a case is a task with its family, its library and the digest of the arms", () => {
    const cases = casesIn(EVAL_DIR);
    expect(cases.map((c) => c.id)).toEqual(taskNames(TASKS));
    expect(new Set(cases.map((c) => c.arms_sha256)).size).toBe(1);
    for (const c of cases) expect(c.library_sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  const cells = (o: Partial<{ expected: number; completed: number; failed: number; missing: number; unexpected: number }> = {}) => ({ expected: 14, completed: 14, failed: 0, missing: 0, unexpected: 0, ...o });
  const base = { exit: 0, jobWritten: true, trees: 1, completion: { minimal: cells(), guidance: cells() }, outside: 0 };

  test("complete only when every cell of every arm has a trial and nothing is wrong with the install", () => {
    expect(statusOf(base)).toEqual({ status: "complete", aborted_reason: null });
    expect(statusOf({ ...base, exit: 1 }).aborted_reason).toContain("Harbor exited 1");
    expect(statusOf({ ...base, trees: 2 }).aborted_reason).toContain("2 different dependency trees");
    expect(statusOf({ ...base, completion: { minimal: cells({ missing: 2, completed: 12 }), guidance: cells() } }).aborted_reason).toContain("2 of 14 expected trials of the minimal arm");
    expect(statusOf({ ...base, completion: { minimal: cells({ completed: 0, failed: 14 }), guidance: cells() } }).aborted_reason).toContain("every one errored");
  });

  test("a check passes only when the reference passed every card and the no-op failed every one", () => {
    const t = (task: string, arm: string, reward: number | null, failed: string[] = []) => ({ task, cli_arm: arm, reward, error: null, failed_checks: failed }) as unknown as CliTrial;
    expect(checkVerdict([t("a", "reference", 1), t("a", "noop", 0)], ["a"])).toEqual({ ok: true, problems: [] });
    const v = checkVerdict([t("a", "reference", 0, ["1-lookup"]), t("a", "noop", 1), t("b", "reference", null)], ["a", "b"]);
    expect(v.ok).toBe(false);
    expect(v.problems).toEqual(["a: the reference failed (1-lookup)", "a: the noop passed", "b: the reference was not scored", "b: the noop has no trial"]);
  });
});
