// The trace of a trial: what the agent ran, read from opencode's event stream (agent/opencode.txt), which the harness writes outside the
// agent's own files. From it come the figures the verifier cannot give: whether the answer was AKM-mediated, how many calls the agent
// made before its first useful akm operation, how much help it read, and how many commands akm refused. This is part of the collector:
// a change here is a change of what is stored in samples.jsonl, so it is a new version of the eval (measurement.ts).

import { RUNS_AKM } from "../../../lib/harbor/trials.ts";

/** One tool call of the agent, in the order it was made. */
export interface Call {
  index: number;
  tool: string;
  /** The shell command, or the tool's input as JSON. */
  input: string;
  output: string;
  /** The shell's exit status, when the stream has one. */
  exit: number | null;
  /** Milliseconds since the epoch at which the call started. */
  start: number | null;
}

/** What a task's metadata asks of the trace (task.toml: `evidence` and `commands`). */
export interface Spec {
  /** Values that must appear in the output of an akm call before the answer is written. */
  evidence: string[];
  /** Patterns of akm commands, one of which must have run. */
  commands: string[];
}

export interface Trace {
  calls: number;
  akm_calls: number;
  /** `akm help`, `akm hints` and any akm command with -h or --help; and the characters they printed. */
  help_calls: number;
  help_chars: number;
  /** Reads of the akm package's shipped files (docs, schemas), by any tool. */
  doc_reads: number;
  /** Characters akm printed to the agent. */
  akm_chars: number;
  /** akm commands akm refused as misused: exit 2, or a usage error code in the output. */
  invalid: number;
  /** akm commands typed again exactly as the one before, with the same output. */
  repeated: number;
  /** Tool calls up to and including the first useful akm operation, and the seconds from the first event to it; null when there was none. */
  first_useful_calls: number | null;
  first_useful_seconds: number | null;
  /** Reaches outside the container and the model gateway: a web tool, curl, wget, npm, git clone, akm upgrade, akm import of a URL. Each hit is leakage for triage (the answer, or another akm, may have come from outside). */
  leakage: string[];
}

const HELP = /(?:^|[\s;&|(`])(?:[\w.~$/{}-]*\/)?akm(?:\s+-{1,2}[\w=-]+)*\s+(?:help|hints)(?=[\s;&|)]|$)|\bakm\b[^;&|\n]*\s(?:-h|--help)(?=[\s;&|)]|$)/;
const USAGE_ERROR = /"code":\s*"(?:UNKNOWN_COMMAND|UNKNOWN_FLAG|INVALID_FLAG_VALUE|MISSING_[A-Z_]+|USAGE[A-Z_]*)"/;
const START = String.raw`(?:^|[;&|(\x60\n])\s*(?:sudo\s+|env\s+|time\s+)*`;
const LEAKS: [string, RegExp][] = [
  ["curl", new RegExp(`${START}curl\\b`)],
  ["wget", new RegExp(`${START}wget\\b`)],
  ["npm", new RegExp(`${START}(?:npm|npx|pnpm|yarn|bun)\\s+(?:-\\S+\\s+)*(?:i|install|add|ci|view|info|pack|exec|x|dlx|create)\\b`)],
  ["git clone", new RegExp(`${START}git\\s+clone\\b`)],
  ["akm upgrade", new RegExp(`${START}(?:[\\w.~$/{}-]*/)?akm\\s+(?:-\\S+\\s+)*upgrade\\b`)],
  ["akm import http", new RegExp(`${START}(?:[\\w.~$/{}-]*/)?akm\\s+(?:-\\S+\\s+)*import\\s+(?:-\\S+\\s+)*https?:`)],
];
const WEB_TOOLS = new Set(["webfetch", "websearch"]);

/** The reaches outside the container that a call made, by name. */
export function leaksOf(c: Call): string[] {
  if (WEB_TOOLS.has(c.tool)) return [c.tool];
  return c.tool === "bash" ? LEAKS.filter(([, re]) => re.test(c.input)).map(([name]) => name) : [];
}

const PACKAGE = /node_modules\/akm-cli\//;

/** The calls of an `opencode run --format=json` stream: a call is counted once however many events it has, and the last event that has the command tells what it ran. */
export function parseCalls(stream: string): { calls: Call[]; first: number | null } {
  const calls: Call[] = [];
  const index = new Map<string, number>();
  let first: number | null = null;
  for (const line of stream.split("\n")) {
    if (!line.startsWith("{")) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof event.timestamp === "number" && first === null) first = event.timestamp;
    if (event.type !== "tool_use" || typeof event.part?.tool !== "string") continue;
    const state = event.part.state ?? {};
    const command = state.input?.command;
    const call: Omit<Call, "index"> = {
      tool: event.part.tool,
      input: typeof command === "string" ? command : JSON.stringify(state.input ?? {}),
      output: typeof state.output === "string" ? state.output : "",
      exit: typeof state.metadata?.exit === "number" ? state.metadata.exit : null,
      start: typeof state.time?.start === "number" ? state.time.start : null,
    };
    const callID = event.part.callID;
    const key = typeof callID === "string" && callID !== "" ? `${String(event.part.sessionID ?? event.sessionID ?? "")}/${callID}` : null;
    const seen = key === null ? undefined : index.get(key);
    if (seen === undefined) {
      if (key !== null) index.set(key, calls.length);
      calls.push({ ...call, index: calls.length });
    } else {
      calls[seen] = { ...call, index: seen };
    }
  }
  return { calls, first };
}

/** A value as a word, as verify.mjs matches one: not inside a longer word, number or name, whatever the case. */
export const word = (token: string): RegExp => new RegExp(`(?<![\\w-])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i");
export const isAkm = (c: Call): boolean => c.tool === "bash" && RUNS_AKM.test(c.input);

/** The useful operations of a task: an akm call that printed a piece of evidence, or one of the akm commands the task is about. */
const useful = (c: Call, spec: Spec): boolean => isAkm(c) && (spec.evidence.some((t) => word(t).test(c.output)) || spec.commands.some((p) => new RegExp(p).test(c.input)));

/**
 * Whether the answer came through akm. Every command pattern of the task has a match among the akm calls (one of them, if several are
 * listed), and every piece of evidence appeared in the output of an akm call before the first other call that wrote it. A trial that read
 * the files akm keeps (`cat` of the bundle) and ran only `akm --version` passes its verifier and is not mediated. A task with neither
 * evidence nor commands cannot be judged: null.
 */
export function mediated(calls: Call[], spec: Spec): boolean | null {
  if (spec.evidence.length === 0 && spec.commands.length === 0) return null;
  const akm = calls.filter(isAkm);
  if (spec.commands.length > 0 && !akm.some((c) => spec.commands.some((p) => new RegExp(p).test(c.input)))) return false;
  const write = calls.find((c) => !isAkm(c) && spec.evidence.some((t) => word(t).test(c.input)));
  const limit = write ? write.index : Number.POSITIVE_INFINITY;
  return spec.evidence.every((t) => akm.some((c) => c.index < limit && word(t).test(c.output)));
}

/** The figures of a trial's calls. */
export function traceOf(calls: Call[], first: number | null, spec: Spec): Trace {
  const akm = calls.filter(isAkm);
  const help = akm.filter((c) => HELP.test(c.input));
  // A command typed again exactly, with the same output as before. Running it again after a change, to see the change, is not a repeat.
  const seen = new Map<string, string>();
  let repeated = 0;
  for (const c of akm) {
    const key = c.input.trim().replace(/\s+/g, " ");
    if (seen.get(key) === c.output) repeated++;
    seen.set(key, c.output);
  }
  const firstUseful = calls.find((c) => useful(c, spec));
  return {
    calls: calls.length,
    akm_calls: akm.length,
    help_calls: help.length,
    help_chars: help.reduce((n, c) => n + c.output.length, 0),
    doc_reads: calls.filter((c) => PACKAGE.test(c.input)).length,
    akm_chars: akm.reduce((n, c) => n + c.output.length, 0),
    invalid: akm.filter((c) => c.exit === 2 || USAGE_ERROR.test(c.output)).length,
    repeated,
    first_useful_calls: firstUseful ? firstUseful.index + 1 : null,
    leakage: calls.flatMap((c) => leaksOf(c).map((name) => `${name} (call ${c.index + 1})`)),
    first_useful_seconds: firstUseful && first !== null && firstUseful.start !== null ? Number(((firstUseful.start - first) / 1000).toFixed(1)) : null,
  };
}

