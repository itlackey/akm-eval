// The collector of the pair-judge eval: gives akm's consolidate pair judge one labelled pair of notes at a time, with the model under test as the
// judge, and builds each case's row from the verdict akm printed. It is the COLLECTOR part of the eval's measurement (see measurement.ts and
// lib/manifest.ts): the akm config it writes, the command it runs, the input it sends and what it records of the answer. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { type Sandbox, createSandbox, engineConfig, writeConfig } from "../../../lib/akm/akm.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { type JudgeEnvelope, callJudge } from "../../../lib/judge.ts";
import { type Case, type Raw, type Row, makeRow } from "./score.ts";

export const NAME = "pair-judge";

/** The judge this eval measures, and the schemaVersion of it that it reads. */
export const JUDGE = "consolidate.pair";
export const SCHEMA = 1;

/** How long akm gets for one case unless --timeout-ms says otherwise: a slow local model takes minutes. */
export const JUDGE_TIMEOUT_MS = 15 * 60_000;

/** What goes to `akm judge consolidate.pair` on stdin for a case: the two notes as the pass builds them. */
export const judgeInput = (c: Pick<Case, "a" | "b">): Record<string, unknown> => ({ a: c.a, b: c.b });

/**
 * The akm config the judge runs under: one LLM engine, the model under test, as the default. The judge picks its runner as the consolidate process does
 * (`resolveImproveExecution`), which with no strategy configured is that engine. Requests use temperature 0, and the judge asks for no thinking itself;
 * the engine says so too, so that the banner and the summary show it.
 */
export function judgeConfig(baseUrl: string, model: string, hasKey: boolean, provider = "openai"): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "judge", provider);
  config.engines.judge.temperature = 0;
  config.engines.judge.enableThinking = false;
  return config;
}

/** The config the eval writes: the judge config, and the config patch, if any, merged into it after. */
export const configFor = (baseUrl: string, model: string, hasKey: boolean, overrides: Overrides, provider = "openai"): Record<string, any> => patchedConfig(judgeConfig(baseUrl, model, hasKey, provider), overrides);

/** A sandbox for the run, with the config written: every case of the run goes through it. The config names the model key as $MODEL_API_KEY. */
export function openSandbox(baseUrl: string, model: string, hasKey: boolean, overrides: Overrides = defaultOverrides(""), provider = "openai"): Sandbox {
  const sandbox = createSandbox(NAME, { keepModelKey: true });
  writeConfig(sandbox, configFor(baseUrl, model, hasKey, overrides, provider));
  return sandbox;
}

/**
 * What the scorer reads of the envelope `akm judge consolidate.pair --format json` printed, with the model endpoint written as <MODEL_BASE_URL> in the text
 * (results get shared, and akm's messages name the endpoint it called). The verdict keeps `schemaVersion`, the judge's, so that a stored run says which verdicts it
 * holds (rawOf). An `error` or `unparseable` outcome is the judge giving no verdict.
 */
export function rawFromEnvelope(envelope: JudgeEnvelope, baseUrl: string): Pick<Raw, "verdict" | "noVerdict"> {
  if (envelope.outcome !== "verdict") return { noVerdict: { outcome: envelope.outcome, reason: hideEndpoint(envelope.reason ?? "", baseUrl) } };
  const { onlyInA, onlyInB, relation, redundant, confidence, reason } = envelope.verdict!;
  return { verdict: { onlyInA, onlyInB, relation, redundant, confidence, reason: typeof reason === "string" ? hideEndpoint(reason, baseUrl) : reason, engine: envelope.runner?.name, schemaVersion: envelope.schemaVersion } };
}

/** What one case needs of the run: the sandbox with the config written, the model endpoint (masked in the row), and the time limit of one case. */
interface CaseContext {
  sandbox: Sandbox;
  baseUrl: string;
  /** The time limit of one case, in milliseconds. A run always sets it (--timeout-ms); without it JUDGE_TIMEOUT_MS applies. */
  timeoutMs?: number;
}

/** One case: the two notes go to `akm judge consolidate.pair` on stdin, and its verdict is scored. */
export async function judgeCase(c: Case, ctx: CaseContext): Promise<Row> {
  const call = await callJudge(ctx.sandbox, JUDGE, judgeInput(c), { timeoutMs: ctx.timeoutMs ?? JUDGE_TIMEOUT_MS, hide: (text) => hideEndpoint(text, ctx.baseUrl) });
  if ("error" in call) return makeRow(c, { error: call.error, seconds: call.seconds, ...(call.timedOut ? { timedOut: true } : {}) });
  return makeRow(c, { ...rawFromEnvelope(call.envelope, ctx.baseUrl), seconds: call.seconds });
}
