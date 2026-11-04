// What the evals of akm's judges share: asking akm that a judge exists at the schema version an eval reads, calling `akm judge <name>` with one JSON input,
// and telling the envelope it prints apart from akm failing. What a case is, whether akm could send it, and how a verdict is scored are each eval's own.

import { rmSync } from "node:fs";
import { type Sandbox, createSandbox, removeSandbox, runAkm, writeConfig, writeOpencodeConfig } from "./akm/akm.ts";
import { exitMessage, fail } from "./cli.ts";

/** Where akm sends a proposal after its judge: pass (accepted), review (a person decides) or reject. */
export type Route = "pass" | "review" | "reject";

/**
 * The route of a judge verdict that has `pass` and `reviewNeeded`, as akm routes `reflect.quality` and `distill.lesson` on a new lesson: akm's own, since the
 * verdict carries it. A lesson update routes on `pass` alone (distill.ts `proposeLessonUpdate`), so it is not this.
 */
export const routeOf = (verdict: { pass?: unknown; reviewNeeded?: unknown }): Route => (verdict.pass === true ? "pass" : verdict.reviewNeeded ? "review" : "reject");

/**
 * How akm turns the criterion scores of a quality judge into a verdict (judgeQuality in akm's src/commands/improve/stage.ts). `counted` are the criteria
 * in the mean and the pass test; a criterion left out (a lesson's `grounding`) is scored and shown, and counts only toward `rejectAt`. The lowest counted
 * criterion at `passAt` or more passes; otherwise a mean of `reviewAt` or more is `reviewNeeded`, and a lower one is refused. A criterion at `rejectAt` or
 * less refuses the proposal whatever the mean is; null for a judge with no such floor.
 */
export interface PassRule {
  counted: string[];
  passAt: number;
  reviewAt: number;
  rejectAt: number | null;
}

/** The rules akm ships: reflect's review floor is 3.5 and has no reject floor; a lesson counts reusable and nonRedundancy, reviews from 2.5 and rejects a criterion of 2 or less. */
export const SHIPPED_RULES: Record<string, PassRule> = {
  "reflect.quality": { counted: ["need", "preservation", "quality"], passAt: 4, reviewAt: 3.5, rejectAt: null },
  "distill.lesson": { counted: ["reusable", "nonRedundancy"], passAt: 4, reviewAt: 2.5, rejectAt: 2 },
};

/** The verdict's `pass` and `reviewNeeded` for these criterion scores under `rule`. Null when a counted criterion is missing or is not a number. */
export function applyRule(criteria: Record<string, unknown>, rule: PassRule): { pass: boolean; reviewNeeded: boolean } | null {
  const counted = rule.counted.map((k) => criteria[k]);
  if (counted.length === 0 || !counted.every((x): x is number => typeof x === "number")) return null;
  const all = Object.values(criteria).filter((x): x is number => typeof x === "number");
  if (rule.rejectAt !== null && Math.min(...all) <= rule.rejectAt) return { pass: false, reviewNeeded: false };
  if (Math.min(...counted) >= rule.passAt) return { pass: true, reviewNeeded: false };
  return { pass: false, reviewNeeded: counted.reduce((a, b) => a + b, 0) / counted.length >= rule.reviewAt };
}

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

/** Runs `akm judge <name>` on `input` in the sandbox, on the default connection, or on `harness` with `model` (the harness's own spelling of it) when the call names one. */
export async function callJudge(sandbox: Sandbox, name: string, input: unknown, opts: { timeoutMs: number; hide?: (text: string) => string; harness?: { name: string; model: string } }): Promise<JudgeCall> {
  const hide = opts.hide ?? ((t: string) => t);
  let run: Awaited<ReturnType<typeof runAkm>>;
  const runner = opts.harness ? ["--harness", opts.harness.name, "--model", opts.harness.model] : [];
  try {
    run = await runAkm(sandbox, ["judge", name, ...runner, "--format", "json"], { stdin: JSON.stringify(input), timeoutMs: opts.timeoutMs });
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

// The harness a judge can run on (--harness), the same for every judge eval: the harness judge runs in a HOME of the sandbox's, with an opencode config of
// its own, so it reads nothing of the operator's setup (isolateHome in lib/akm/akm.ts).

/** The harnesses a run can put the judge on. Only opencode: a harness judge runs in an empty HOME, and claude has no login there. */
export const HARNESSES = ["opencode"] as const;

/** The provider of the model under test in the opencode config of a harness run: opencode's model is `eval/<the model's name>`. */
const HARNESS_PROVIDER = "eval";
export const harnessModel = (model: string): string => `${HARNESS_PROVIDER}/${model}`;

/**
 * The config of the opencode a harness judge runs: the model under test as the only provider, at the run's endpoint with temperature 0 and no
 * reasoning, as the connection runner has them, and no tool. Nothing else: opencode reads no config but this one (see isolateHome in lib/akm/akm.ts).
 * A tool would let the judge read any file of the machine by its path, and the akm plugin that gives it `akm_show` is not in the sandbox.
 */
export function opencodeConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  return {
    $schema: "https://opencode.ai/config.json",
    provider: { [HARNESS_PROVIDER]: { npm: "@ai-sdk/openai-compatible", name: HARNESS_PROVIDER, options: { baseURL: baseUrl, ...(hasKey ? { apiKey: "{env:MODEL_API_KEY}" } : {}) }, models: { [model]: { name: model, temperature: true, options: { reasoningEffort: "none" } } } } },
    agent: { build: { temperature: 0 } },
    permission: { "*": "deny" },
  };
}

/** The sandbox of a judge run with `config` written. On a harness it has a HOME of its own and an opencode config of its own. The config names the model key as $MODEL_API_KEY. */
export function openJudgeSandbox(name: string, config: Record<string, any>, o: { baseUrl: string; model: string; hasKey: boolean; harness?: string }): Sandbox {
  const sandbox = createSandbox(name, { keepModelKey: true, isolateHome: o.harness !== undefined });
  writeConfig(sandbox, o.harness === undefined ? config : { ...config, harnesses: { [o.harness]: {} } });
  if (o.harness !== undefined) writeOpencodeConfig(sandbox, opencodeConfig(o.baseUrl, o.model, o.hasKey));
  return sandbox;
}

/** The `opts.harness` of a case's callJudge: the run's harness with the model under test, or nothing on a connection. */
export const harnessOf = (ctx: { harness?: string; model?: string }): { harness?: { name: string; model: string } } => (ctx.harness && ctx.model ? { harness: { name: ctx.harness, model: harnessModel(ctx.model) } } : {});

/** What the run records of the harness the judge ran on: its name, the version it printed in the run's own sandbox, and that its HOME was the sandbox's. */
export type HarnessRecord = { name: string; version: string; isolated_home: true };

/** The version a harness prints, run as the judge runs it: in the sandbox's environment. It also makes the harness's database before the cases need it. */
function harnessVersion(sandbox: Sandbox, name: string): string {
  const run = Bun.spawnSync([name, "--version"], { env: sandbox.env, cwd: sandbox.dir, stdout: "pipe", stderr: "pipe", timeout: 60_000 });
  const version = run.stdout.toString().trim().match(/\d+\.\d+\.\d+\S*/)?.[0];
  if (run.exitCode !== 0 || !version) throw new Error(`could not run \`${name} --version\`: is ${name} installed and on PATH?`);
  // opencode makes its database on its first command, and two first commands at once fail with "database is locked". The cases run two at a time.
  Bun.spawnSync([name, "session", "list"], { env: sandbox.env, cwd: sandbox.dir, stdout: "ignore", stderr: "ignore", timeout: 60_000 });
  return version;
}

/**
 * What every judge eval's `openRun` does after it has made the sandbox: the harness's version, when there is a harness, and asking akm that `judge` is there at
 * `schema`. Either failing removes the sandbox and the run's empty results folder and ends the run with the message; `hint` says what akm build the eval needs.
 * Returns what the spec's openRun returns.
 */
export async function startJudgeRun(sandbox: Sandbox, ctx: { harness?: string; resultsDir?: string }, judge: string, schema: number, hint: string): Promise<{ sandbox: Sandbox; harnessRecord?: HarnessRecord; close(): void }> {
  const giveUp = (message: string): never => {
    removeSandbox(sandbox);
    if (ctx.resultsDir) rmSync(ctx.resultsDir, { recursive: true, force: true }); // the folder of a run that made no case
    return fail(message);
  };
  let harnessRecord: HarnessRecord | undefined;
  try {
    if (ctx.harness) harnessRecord = { name: ctx.harness, version: harnessVersion(sandbox, ctx.harness), isolated_home: true };
  } catch (e) {
    giveUp((e as Error).message);
  }
  // A version number does not say that `akm judge` is there at the schema this eval reads, so ask akm.
  await requireJudge(sandbox, judge, schema).catch((e: Error) => giveUp(`${e.message}. ${hint}`));
  return { sandbox, harnessRecord, close: () => removeSandbox(sandbox) };
}

/** The pieces of an eval's spec (lib/run.ts) that put its judge on a harness: the flag, its check, and the summary's and the manifest's record of it. */
export const harnessSpec = {
  options: { harness: { type: "string" } } as const,
  prepare: (values: Record<string, any>) => {
    if (values.harness !== undefined && !(HARNESSES as readonly string[]).includes(values.harness)) throw new Error(`--harness must be one of ${HARNESSES.join(", ")}, not "${values.harness}"`);
    return () => ({ harness: values.harness as string | undefined });
  },
  summary: (ctx: { harnessRecord?: HarnessRecord }): { harness?: HarnessRecord } => (ctx.harnessRecord ? { harness: ctx.harnessRecord } : {}),
  manifestExtras: (ctx: { harnessRecord?: HarnessRecord }) => (ctx.harnessRecord ? { eval_settings: { harness: ctx.harnessRecord.name, harness_version: ctx.harnessRecord.version, isolated_home: true } } : {}),
  flags: "[--harness opencode]",
  extra: `  --harness opencode  put the judge on the opencode harness (\`akm judge --harness\`) in place of the default connection, with the model under test.
            It runs in an empty HOME with an opencode config of its own, so it reads nothing of your setup. The summary records the harness and its version.`,
};
