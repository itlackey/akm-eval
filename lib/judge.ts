// What the evals of akm's judges share: asking akm that a judge exists at the schema version an eval reads, calling `akm judge <name>` with one JSON input,
// and telling the envelope it prints apart from akm failing. What a case is, whether akm could send it, and how a verdict is scored are each eval's own.

import { type Sandbox, runAkm } from "./akm/akm.ts";
import { exitMessage } from "./cli.ts";

/** Where akm sends a proposal after its judge: pass (accepted), review (a person decides) or reject. */
export type Route = "pass" | "review" | "reject";

/**
 * The route of a judge verdict that has `pass` and `reviewNeeded`, as akm routes `reflect.quality` and `distill.lesson` on a new lesson: akm's own, since the
 * verdict carries it. A lesson update routes on `pass` alone (distill.ts `proposeLessonUpdate`), so it is not this.
 */
export const routeOf = (verdict: { pass?: unknown; reviewNeeded?: unknown }): Route => (verdict.pass === true ? "pass" : verdict.reviewNeeded ? "review" : "reject");

/** What `akm judge <name> --format json` prints. `verdict` is there on outcome `verdict`, `reason` on `error` and `unparseable` (the judge gave no verdict). */
export interface JudgeEnvelope {
  judge: string;
  schemaVersion: number;
  runner: { kind?: string; name?: string; platform?: string; model?: string | null };
  outcome: "verdict" | "error" | "unparseable";
  verdict?: Record<string, any>;
  reason?: string;
}

/** One call: the envelope akm printed, or why it printed none (it failed, was killed at the time limit, or printed something else). `hide` is applied to a failure's message. */
export type JudgeCall = { envelope: JudgeEnvelope; seconds: number } | { error: string; seconds: number; timedOut: boolean };

const isEnvelope = (x: unknown): x is JudgeEnvelope => {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
  const e = x as Record<string, unknown>;
  return (e.outcome === "verdict" && typeof e.verdict === "object" && e.verdict !== null) || ((e.outcome === "error" || e.outcome === "unparseable") && e.verdict === undefined);
};

/** Runs `akm judge <name>` on `input` in the sandbox. */
export async function callJudge(sandbox: Sandbox, name: string, input: unknown, opts: { timeoutMs: number; hide?: (text: string) => string }): Promise<JudgeCall> {
  const hide = opts.hide ?? ((t: string) => t);
  let run: Awaited<ReturnType<typeof runAkm>>;
  try {
    run = await runAkm(sandbox, ["judge", name, "--format", "json"], { stdin: JSON.stringify(input), timeoutMs: opts.timeoutMs });
  } catch (e) {
    return { error: hide((e as Error).message), seconds: 0, timedOut: false };
  }
  const { stdout, stderr, code, ms, timedOut } = run;
  const seconds = Number((ms / 1000).toFixed(1));
  if (timedOut) return { error: hide(exitMessage(code, stderr, stdout)), seconds, timedOut: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { error: hide(exitMessage(code, stderr, stdout)), seconds, timedOut: false };
  }
  if (!isEnvelope(parsed)) return { error: hide(exitMessage(code, stderr, stdout)), seconds, timedOut: false };
  return { envelope: parsed, seconds };
}

/**
 * Asks akm whether judge `name` is there at exactly `schemaVersion` `version`. akm bumps a judge's schemaVersion when its input or verdict changes shape,
 * so a later one may mean something this eval does not read. A version number does not say that (`akm judge`
 * was cut into no release for a while), and a judge of an older schema prints verdicts an eval would misread (#51), so the eval asks before its first case.
 * Throws a message that says which of the two it is.
 */
export async function requireJudge(sandbox: Sandbox, name: string, version: number): Promise<void> {
  const listed = await runAkm(sandbox, ["judge", "--list", "--format", "json"], { timeoutMs: 120_000 }).catch(() => undefined);
  let judges: unknown;
  try {
    judges = listed && listed.code === 0 ? JSON.parse(listed.stdout).judges : undefined;
  } catch {
    judges = undefined;
  }
  const found = Array.isArray(judges) ? judges.find((j) => j?.name === name) : undefined;
  if (!found) throw new Error(`this akm has no \`akm judge ${name}\` (\`akm judge --list\` does not name it)`);
  if (found.schemaVersion !== version) {
    throw new Error(`this akm's \`${name}\` has schemaVersion ${found.schemaVersion ?? "none"}, and this eval reads ${version}`);
  }
}
