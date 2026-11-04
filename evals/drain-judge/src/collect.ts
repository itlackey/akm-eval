// The collector of the drain-judge eval: gives akm's proposal judgment one frozen promotion at a time, with the model under test as the judge, and builds each case's row
// from the verdict akm printed. It is the COLLECTOR part of the eval's measurement (see measurement.ts and lib/manifest.ts): the akm config it writes, the command it runs,
// the input it sends and what it records of the answer. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in measurement.ts by hand.

import { type Sandbox, engineConfig } from "../../../lib/akm/akm.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { type JudgeEnvelope, callJudge, harnessOf, openJudgeSandbox } from "../../../lib/judge.ts";
import { type Case, type Row, makeRow } from "./score.ts";

export const NAME = "drain-judge";

/** The judge this eval measures, and the schemaVersion of it that it reads. */
export const JUDGE = "proposal.judgment";
export const SCHEMA = 1;

/** How long akm gets for one case unless --timeout-ms says otherwise: a slow local model takes minutes. */
export const JUDGE_TIMEOUT_MS = 15 * 60_000;

/** What goes to `akm judge proposal.judgment` on stdin for a case: the input the drain built, as it is. */
export const judgeInput = (c: Pick<Case, "input">): Record<string, unknown> => c.input as unknown as Record<string, unknown>;

/**
 * The akm config the judge runs under: one LLM engine, the default, which the drain's judgment uses when no other is named. Requests use temperature 0 and ask for no
 * thinking, as the other evals do, so that two runs differ by the model and not by the sampling. `provider` is the provider kind of the engine (openai, anthropic, ...).
 */
export function judgeConfig(baseUrl: string, model: string, hasKey: boolean, provider = "openai"): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "judge", provider);
  config.engines.judge.temperature = 0;
  config.engines.judge.enableThinking = false;
  return config;
}

/** The config the eval writes: the judge config, and the config patch, if any, merged into it after. */
export const configFor = (baseUrl: string, model: string, hasKey: boolean, overrides: Overrides, provider = "openai"): Record<string, any> => patchedConfig(judgeConfig(baseUrl, model, hasKey, provider), overrides);

/** A sandbox for the run, with the config written: every case of the run goes through it (on a harness, see openJudgeSandbox in lib/judge.ts). */
export const openSandbox = (baseUrl: string, model: string, hasKey: boolean, overrides: Overrides = defaultOverrides(""), provider = "openai", harness?: string): Sandbox =>
  openJudgeSandbox(NAME, configFor(baseUrl, model, hasKey, overrides, provider), { baseUrl, model, hasKey, harness });

/**
 * The fields of the envelope `akm judge proposal.judgment --format json` printed that the scorer reads, with the model endpoint written as <MODEL_BASE_URL> in the reason
 * (results get shared, and akm's messages name the endpoint it called). `schemaVersion` is the judge's, kept so that a stored run says which verdicts it holds (rawOf).
 */
export function verdictOf(envelope: JudgeEnvelope, baseUrl: string): Record<string, unknown> {
  const v = envelope.outcome === "verdict" ? envelope.verdict! : {};
  const reason = envelope.outcome === "verdict" ? v.reason : envelope.reason;
  return { outcome: envelope.outcome, decision: v.decision, reason: typeof reason === "string" ? hideEndpoint(reason, baseUrl) : reason, engine: envelope.runner?.name, schemaVersion: envelope.schemaVersion };
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

/** One case: its frozen input goes to `akm judge proposal.judgment` on stdin, and the verdict is scored. */
export async function judgeCase(c: Case, ctx: CaseContext): Promise<Row> {
  const call = await callJudge(ctx.sandbox, JUDGE, judgeInput(c), { timeoutMs: ctx.timeoutMs ?? JUDGE_TIMEOUT_MS, hide: (text) => hideEndpoint(text, ctx.baseUrl), ...harnessOf(ctx) });
  if ("error" in call) return makeRow(c, { error: call.error, seconds: call.seconds, ...(call.timedOut ? { timedOut: true } : {}) });
  return makeRow(c, { verdict: verdictOf(call.envelope, ctx.baseUrl), seconds: call.seconds });
}
