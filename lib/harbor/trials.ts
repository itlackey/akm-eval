// What Harbor left for each trial, read into the rows the report scores: the COLLECTOR half of what used to be report.ts (a trial is one
// task run once by one arm). It reads a job folder: a trial's result.json and the opencode stream in its agent folder, and turns the stream
// into the agent's akm calls. What it reads is the raw output of the eval, and what it makes of it is stored in samples.jsonl, so a change
// here is a change of the collector: it is covered by the collector's digest, and the scorer (report.ts, score.ts) does not import it.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Arm, Trial } from "./report.ts";

/** The exceptions Harbor records when the agent, or the setup before it, runs out of time. The same two names are in report.ts, which counts them in a row that does not say. */
export const TIMEOUT_ERRORS = new Set(["AgentTimeoutError", "AgentSetupTimeoutError"]);

const round = (x: number, places = 3): number => Number(x.toFixed(places));

/**
 * Where a shell command can start: the start of the text, or after `;`, `&`, `|`, `(` (which covers `$(`), a backtick,
 * `{` or a new line, after a control word such as `then` or `do`, or just inside the quote of `bash -c`.
 */
const COMMAND_START = /(?:^|[;&|(`{\n]|\b(?:ba|z|da)?sh\s+(?:-\w+\s+)*-\w*c\s+["'])\s*(?:(?:if|then|do|else|elif|while|until|!)\s+)*/;
/** What can stand before the command and leave it the one that runs: `VAR=value`, and sudo, xargs, env, time and the like with their flags and numbers (`xargs -n 1`, `timeout 10`). */
const WRAPPERS = /(?:(?:sudo|xargs|env|time|nohup|exec|nice|timeout|stdbuf)\s+(?:(?:-\S+|\d+[smhd]?)\s+)*|[A-Za-z_]\w*=\S*\s+)*/;
/** The command itself: `akm`, or a path that ends in it (`/usr/local/bin/akm`, `~/.bun/bin/akm`, `./akm`), then a space, the end or a shell operator. */
const AKM_WORD = /(?:[\w.~$/{}-]*\/)?akm(?=[\s;&|)<>]|$)/;

/**
 * A shell command that runs akm: akm is the command that runs, bare or by its path, at the start or after an operator,
 * in `$(...)` or backticks, or behind sudo, xargs, env and the like. Text that only mentions akm (`echo akm`,
 * `ls /opt/akm`, `cat akm.txt`, `which akm`) is not a call. A line of a here-document that starts with akm is counted,
 * since the pattern cannot tell it from a command. Not covered: a flag that takes its own word (`sudo -u root akm`).
 */
const RUNS_AKM = new RegExp(COMMAND_START.source + WRAPPERS.source + AKM_WORD.source);

/**
 * The akm calls in an `opencode run --format=json` stream: the plugin's tools, which are named akm_*, and with
 * `shell` the commands that run akm in the shell, which the arm with akm installed can do too. A line that is not JSON,
 * such as stderr, is skipped. A call is counted once however many events it has: opencode can write a tool call again
 * as it changes state, each time with the same callID, and the last event that has the command tells what it ran.
 * Events with no callID cannot be matched, so each of them counts as a call.
 */
export function toolCalls(stream: string, shell = false): { akm: Record<string, number>; tools: number } {
  const calls: { tool: string; command: string | undefined }[] = [];
  const index = new Map<string, number>();
  for (const line of stream.split("\n")) {
    if (!line.startsWith("{")) continue;
    let event: { type?: string; sessionID?: unknown; part?: { tool?: unknown; callID?: unknown; sessionID?: unknown; state?: { input?: { command?: unknown } } } };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const tool = event.type === "tool_use" ? event.part?.tool : undefined;
    if (typeof tool !== "string") continue;
    const command = event.part?.state?.input?.command;
    const callID = event.part?.callID;
    // a call id is only unique within its session
    const key = typeof callID === "string" && callID !== "" ? `${String(event.part?.sessionID ?? event.sessionID ?? "")}/${callID}` : null;
    const seen = key === null ? undefined : index.get(key);
    if (seen === undefined) {
      if (key !== null) index.set(key, calls.length);
      calls.push({ tool, command: typeof command === "string" ? command : undefined });
    } else if (typeof command === "string") {
      calls[seen].command = command;
    }
  }
  const akm: Record<string, number> = {};
  for (const { tool, command } of calls) {
    const name = tool.startsWith("akm_") ? tool : shell && tool === "bash" && command !== undefined && RUNS_AKM.test(command) ? "akm (shell)" : undefined;
    if (name) akm[name] = (akm[name] ?? 0) + 1;
  }
  return { akm, tools: calls.length };
}

/** Where the plugin writes what it curated for a session: the agent is told to read it. It is akm's other way in, apart from the tools. */
const CURATED_FILE = /\/akm-opencode\/curated\//;

/** Whether the opencode stream holds a read of the curated results. */
export function readsCurated(stream: string): boolean {
  for (const line of stream.split("\n")) {
    if (!line.startsWith("{") || !line.includes("curated")) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === "tool_use" && event.part?.tool === "read" && CURATED_FILE.test(String(event.part?.state?.input?.filePath ?? ""))) return true;
    } catch {
      // a line that is not JSON, such as stderr
    }
  }
  return false;
}

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/** Seconds from one ISO time to another, or null when either is missing. */
function between(from: unknown, to: unknown): number | null {
  if (typeof from !== "string" || typeof to !== "string") return null;
  const seconds = (Date.parse(to) - Date.parse(from)) / 1000;
  return Number.isFinite(seconds) ? round(seconds, 1) : null;
}

/** One trial folder of a Harbor job, or null when it holds no result. The arm is the agent's name, which Harbor keeps in result.json. */
export function readTrial(dir: string, trial: string): Trial | null {
  const file = join(dir, "result.json");
  if (!existsSync(file)) return null;
  const r = JSON.parse(readFileSync(file, "utf8"));
  const agent: unknown = r.agent_info?.name;
  const arm: Arm | null = agent === "akm-opencode" ? "akm" : agent === "opencode" ? "control" : null;
  if (arm === null) throw new Error(`${file} is a trial of agent ${JSON.stringify(agent)}, which is neither opencode nor akm-opencode`);
  const streamFile = join(dir, "agent", "opencode.txt");
  const stream = existsSync(streamFile) ? readFileSync(streamFile, "utf8") : null;
  const calls = stream === null ? null : toolCalls(stream, arm === "akm");
  const usage = r.agent_result;
  const seconds = between(r.started_at, r.finished_at);
  const agentSeconds = between(r.agent_execution?.started_at, r.agent_execution?.finished_at);
  return {
    task: String(r.task_name ?? "").replace(/^[^/]*\//, ""),
    arm,
    trial,
    reward: num(r.verifier_result?.rewards?.reward),
    error: typeof r.exception_info?.exception_type === "string" ? r.exception_info.exception_type : null,
    akm: calls?.akm ?? null,
    tools: calls?.tools ?? null,
    curated: arm === "akm" && stream !== null ? readsCurated(stream) : null,
    tokens: usage && num(usage.n_input_tokens) !== null ? { input: num(usage.n_input_tokens) ?? 0, cache: num(usage.n_cache_tokens) ?? 0, output: num(usage.n_output_tokens) ?? 0 } : null,
    costUsd: num(usage?.cost_usd),
    seconds,
    agentSeconds,
    digest: typeof r.task_id?.ref === "string" ? r.task_id.ref : null,
  };
}

/** Every trial of a Harbor job folder, in folder order. */
export function loadTrials(jobDir: string): Trial[] {
  const trials: Trial[] = [];
  for (const entry of readdirSync(jobDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const t = readTrial(join(jobDir, entry.name), entry.name);
    if (t) trials.push(t);
  }
  return trials;
}
