// What the opencode session log of a trial says about how the agent used akm: the figures the verifier cannot give. Pure: no I/O. The stream is
// `agent/opencode.txt` (opencode run --format=json), which the harness writes. A call is counted once however many events it has.
//
// akm call:      a tool call named akm_* (the plugin's tools) or a shell command that runs akm (RUNS_AKM of lib/harbor/trials.ts).
// error:         an akm call that failed: a shell exit other than 0 (4 is `doctor`'s health warning, not a failure), or a plugin tool that errored.
// recovered:     the trial hit an error and still passed its verifier.
// unnecessary:   akm calls beyond the reference solution's (`ref_akm` of the task).
// deprecated:    an akm call whose output carries akm's `[deprecated]` notice. `old_used` is a call of the form the task invites that akm deprecated or
//                removed, and `moved_on` whether a later akm call used the form that replaces it.

import { RUNS_AKM } from "../../../lib/harbor/trials.ts";

export interface Call {
  tool: string;
  input: string;
  output: string;
  exit: number | null;
  failed: boolean;
}

export interface Spec {
  ref_akm: number;
  old: string;
  replacement: string;
}

export interface Metrics {
  calls: number;
  akm_calls: number;
  other_calls: number;
  ref_akm: number;
  unnecessary: number;
  errors: number;
  recovered: boolean | null;
  help_calls: number;
  usage_errors: number;
  repeated: number;
  deprecated_notices: number;
  old_used: boolean;
  moved_on: boolean | null;
  /** The akm commands in the order run, each shortened, for reading a transcript. */
  akm_sequence: string[];
}

const HELP = /(?:^|[\s;&|(`])(?:[\w.~$/{}-]*\/)?akm(?:\s+-{1,2}[\w=-]+)*\s+(?:help|hints)(?=[\s;&|)]|$)|\bakm\b[^;&|\n]*\s(?:-h|--help)(?=[\s;&|)]|$)/;
const USAGE_ERROR = /"code":\s*"(?:UNKNOWN_COMMAND|UNKNOWN_FLAG|INVALID_FLAG_VALUE|MISSING_[A-Z_]+|USAGE[A-Z_]*)"/;

/** The calls of an `opencode run --format=json` stream, each once, in order. */
export function parseCalls(stream: string): Call[] {
  const calls: Call[] = [];
  const index = new Map<string, number>();
  for (const line of stream.split("\n")) {
    if (!line.startsWith("{")) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== "tool_use" || typeof event.part?.tool !== "string") continue;
    const state = event.part.state ?? {};
    const command = state.input?.command;
    const call: Call = {
      tool: event.part.tool,
      input: typeof command === "string" ? command : JSON.stringify(state.input ?? {}),
      output: typeof state.output === "string" ? state.output : state.output === undefined ? "" : JSON.stringify(state.output),
      exit: typeof state.metadata?.exit === "number" ? state.metadata.exit : null,
      failed: state.status === "error",
    };
    const id = event.part.callID;
    const key = typeof id === "string" && id !== "" ? `${String(event.part.sessionID ?? event.sessionID ?? "")}/${id}` : null;
    const seen = key === null ? undefined : index.get(key);
    if (seen === undefined) {
      if (key !== null) index.set(key, calls.length);
      calls.push(call);
    } else {
      calls[seen] = call;
    }
  }
  return calls;
}

export const isAkm = (c: Call): boolean => c.tool.startsWith("akm_") || (c.tool === "bash" && RUNS_AKM.test(c.input));

/** Whether an akm call failed. `doctor` and `health` exit 4 for a warning they report: that is an answer, not a failure. */
export function isError(c: Call): boolean {
  if (c.tool.startsWith("akm_")) return c.failed || /^\s*\{\s*"ok":\s*false/.test(c.output) || /^\s*Error/i.test(c.output);
  if (c.exit === null || c.exit === 0) return false;
  if (c.exit === 4 && /\b(doctor|health)\b/.test(c.input)) return false;
  return true;
}

const short = (c: Call): string => (c.tool.startsWith("akm_") ? `${c.tool} ${c.input.slice(0, 80)}` : c.input.replace(/\s+/g, " ").slice(0, 110));

export function metricsOf(calls: Call[], spec: Spec, passed: boolean | null): Metrics {
  const akm = calls.filter(isAkm);
  const errors = akm.filter(isError);
  const first = errors.length ? akm.indexOf(errors[0]) : -1;
  const seen = new Map<string, string>();
  let repeated = 0;
  for (const c of akm) {
    const key = c.input.trim().replace(/\s+/g, " ");
    if (seen.get(key) === c.output) repeated++;
    seen.set(key, c.output);
  }
  const old = spec.old ? new RegExp(spec.old) : null;
  const replacement = spec.replacement ? new RegExp(spec.replacement) : null;
  const firstOld = old ? akm.findIndex((c) => old.test(c.input)) : -1;
  const notices = akm.filter((c) => c.output.includes("[deprecated]"));
  return {
    calls: calls.length,
    akm_calls: akm.length,
    other_calls: calls.length - akm.length,
    ref_akm: spec.ref_akm,
    unnecessary: Math.max(0, akm.length - spec.ref_akm),
    errors: errors.length,
    recovered: errors.length === 0 ? null : passed === null ? null : passed && akm.slice(first + 1).some((c) => !isError(c)),
    help_calls: akm.filter((c) => c.tool === "bash" && HELP.test(c.input)).length,
    usage_errors: akm.filter((c) => c.exit === 2 || USAGE_ERROR.test(c.output)).length,
    repeated,
    deprecated_notices: notices.length,
    old_used: firstOld >= 0 || notices.length > 0,
    moved_on: firstOld < 0 && notices.length === 0 ? null : replacement === null ? null : akm.slice(Math.max(firstOld, 0)).some((c) => replacement.test(c.input)),
    akm_sequence: akm.map(short),
  };
}
