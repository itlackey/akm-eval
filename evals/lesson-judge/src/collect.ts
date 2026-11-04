// The collector of the lesson-judge eval: gives akm's lesson judge one labelled lesson at a time, with the model under test as the judge, and builds
// each case's row from the verdict akm printed. It is the COLLECTOR part of the eval's measurement (see measurement.ts and lib/manifest.ts): the akm
// config it writes, the command it runs, the input it sends and what it records of the answer. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in measurement.ts by hand.

import { type Sandbox, engineConfig } from "../../../lib/akm/akm.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { type JudgeEnvelope, callJudge, harnessOf, openJudgeSandbox } from "../../../lib/judge.ts";
import { type Case, type JudgeInput, type Row, makeRow } from "./score.ts";

export const NAME = "lesson-judge";

/** The judge this eval measures, and the schemaVersion of it that it reads. */
export const JUDGE = "distill.lesson";
export const SCHEMA = 1;

/** How long akm gets for one case unless --timeout-ms says otherwise: a slow local model takes minutes. */
export const JUDGE_TIMEOUT_MS = 15 * 60_000;

/** What goes to `akm judge distill.lesson` on stdin for a case: the input exactly as akm's distill built it. */
export const judgeInput = (c: Pick<Case, "input">): JudgeInput => c.input;

/** The improve strategy the judge config names, and the one `--strategy` replaces. */
export const STRATEGY = "default";

/**
 * The akm config the judge runs under: one LLM engine, named as distill's quality gate engine. Requests use temperature 0 and ask for no thinking, as distill does.
 * `strategy` is the improve strategy the config makes the default; akm's judge takes its gate from it.
 */
export function judgeConfig(baseUrl: string, model: string, hasKey: boolean, strategy = STRATEGY, provider = "openai"): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "judge", provider);
  config.engines.judge.temperature = 0;
  config.engines.judge.enableThinking = false;
  config.defaults.improveStrategy = strategy;
  config.improve = { strategies: { [STRATEGY]: { engine: "judge", processes: { distill: { qualityGate: { engine: "judge" } } } } } };
  return config;
}

/** The config the eval writes: the judge config with the strategy of the overrides as the default, and the config patch, if any, merged into it after. */
export const configFor = (baseUrl: string, model: string, hasKey: boolean, overrides: Overrides, provider = "openai"): Record<string, any> => patchedConfig(judgeConfig(baseUrl, model, hasKey, overrides.strategy, provider), overrides);

/** A sandbox for the run, with the config written: every case of the run goes through it (on a harness, see openJudgeSandbox in lib/judge.ts). */
export const openSandbox = (baseUrl: string, model: string, hasKey: boolean, overrides: Overrides = defaultOverrides(STRATEGY), provider = "openai", harness?: string): Sandbox =>
  openJudgeSandbox(NAME, configFor(baseUrl, model, hasKey, overrides, provider), { baseUrl, model, hasKey, harness });

/**
 * The fields of the verdict that the scorer reads, from the envelope `akm judge distill.lesson --format json` printed, with the model endpoint written as
 * <MODEL_BASE_URL> in its reason. `judge_outcome` is the envelope's `outcome`: `error` and `unparseable` are the judge giving no verdict, kept apart. `schemaVersion`
 * is the judge's, kept so that a stored run says which verdicts it holds (rawOf).
 */
export function verdictOf(envelope: JudgeEnvelope, baseUrl: string): Record<string, unknown> {
  const head = { judge_outcome: envelope.outcome, runner: envelope.runner?.name, schemaVersion: envelope.schemaVersion };
  if (envelope.outcome !== "verdict") return { ...head, reason: typeof envelope.reason === "string" ? hideEndpoint(envelope.reason, baseUrl) : envelope.reason };
  const { pass, score, reviewNeeded, reason, criteria } = envelope.verdict!;
  return { ...head, pass, score, reviewNeeded, reason: typeof reason === "string" ? hideEndpoint(reason, baseUrl) : reason, criteria };
}

/** What one case needs of the run: the sandbox with the config written, the model endpoint (masked in the row), and the time limit of one case. */
interface CaseContext {
  sandbox: Sandbox;
  baseUrl: string;
  /** The time limit of one case, in milliseconds. A run always sets it (--timeout-ms); without it JUDGE_TIMEOUT_MS applies. */
  timeoutMs?: number;
  /** The harness the judge runs on (--harness), and the model under test. Absent: the default connection. */
  harness?: string;
  model?: string;
}

/** One case: its input goes to `akm judge distill.lesson` on stdin, and the verdict is scored. */
export async function judgeCase(c: Case, ctx: CaseContext): Promise<Row> {
  const call = await callJudge(ctx.sandbox, JUDGE, judgeInput(c), { timeoutMs: ctx.timeoutMs ?? JUDGE_TIMEOUT_MS, hide: (text) => hideEndpoint(text, ctx.baseUrl), ...harnessOf(ctx) });
  if ("error" in call) return makeRow(c, { error: call.error, seconds: call.seconds, ...(call.timedOut ? { timedOut: true } : {}) });
  return makeRow(c, { verdict: verdictOf(call.envelope, ctx.baseUrl), seconds: call.seconds });
}
