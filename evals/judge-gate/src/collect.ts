// The collector of the judge-gate eval: gives akm's reflect quality judge one labelled proposal at a time, with the model under test as the judge,
// and builds each case's row from the verdict akm printed. It is the COLLECTOR part of the eval's measurement (see measurement.ts and
// lib/manifest.ts): the akm config it writes, the command it runs, the input it sends and what it records of the answer. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { type Sandbox, createSandbox, engineConfig, writeConfig, writeOpencodeConfig } from "../../../lib/akm/akm.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { type JudgeEnvelope, callJudge } from "../../../lib/judge.ts";
import { type Case, type Row, makeRow } from "./score.ts";

export const NAME = "judge-gate";

/** The judge this eval measures, and the schemaVersion of it that it reads: 2 carries reflect's own route (the review floor, akm#1418) in `reviewNeeded`. */
export const JUDGE = "reflect.quality";
export const SCHEMA = 2;

/** How long akm gets for one case unless --timeout-ms says otherwise: a slow local model takes minutes. */
export const JUDGE_TIMEOUT_MS = 15 * 60_000;

/** The feedback lines akm's reflect passes the judge: one per line, in the order they were given (negative lines are not moved). */
export const feedbackLines = (feedback: string): string[] => feedback.split("\n").filter((l) => l.trim() !== "");

/** What goes to `akm judge reflect.quality` on stdin for a case. */
export const judgeInput = (c: Pick<Case, "source" | "candidate" | "feedback" | "ref">): Record<string, unknown> => ({ source: c.source, candidate: c.candidate, feedback: feedbackLines(c.feedback), ...(c.ref ? { ref: c.ref } : {}) });

/** The improve strategy the judge config names, and the one `--strategy` replaces. */
export const STRATEGY = "default";

/**
 * The akm config the judge runs under: one LLM engine, named as reflect's quality gate engine. Requests use temperature 0 and ask for
 * no thinking, as distill and extract do, so that two runs differ by the model and not by the sampling. `strategy` is the improve
 * strategy the config makes the default; akm's judge takes its gate from it. `provider` is the provider kind of the engine (openai, anthropic, ...).
 */
export function judgeConfig(baseUrl: string, model: string, hasKey: boolean, strategy = STRATEGY, provider = "openai"): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "judge", provider);
  config.engines.judge.temperature = 0;
  config.engines.judge.enableThinking = false;
  config.defaults.improveStrategy = strategy;
  config.improve = { strategies: { [STRATEGY]: { engine: "judge", processes: { reflect: { qualityGate: { engine: "judge" } } } } } };
  return config;
}

/** The config the eval writes: the judge config with the strategy of the overrides as the default, and the config patch, if any, merged into it after. */
export const configFor = (baseUrl: string, model: string, hasKey: boolean, overrides: Overrides, provider = "openai"): Record<string, any> => patchedConfig(judgeConfig(baseUrl, model, hasKey, overrides.strategy, provider), overrides);

/** The harnesses a run can put the judge on. Only opencode: a harness judge runs in an empty HOME, and claude has no login there. */
export const HARNESSES = ["opencode"] as const;

/** The provider of the model under test in the opencode config of a harness run: opencode's model is `eval/<the model's name>`. */
const HARNESS_PROVIDER = "eval";
export const harnessModel = (model: string): string => `${HARNESS_PROVIDER}/${model}`;

/**
 * The config of the opencode a harness judge runs: the model under test as the only provider, at the run's endpoint with temperature 0 and no
 * reasoning, as the connection runner has them. Nothing else: opencode reads no config but this one (see isolateHome in lib/akm/akm.ts).
 */
export function opencodeConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  return {
    $schema: "https://opencode.ai/config.json",
    provider: { [HARNESS_PROVIDER]: { npm: "@ai-sdk/openai-compatible", name: HARNESS_PROVIDER, options: { baseURL: baseUrl, ...(hasKey ? { apiKey: "{env:MODEL_API_KEY}" } : {}) }, models: { [model]: { name: model, temperature: true, options: { reasoningEffort: "none" } } } } },
    agent: { build: { temperature: 0 } },
  };
}

/**
 * A sandbox for the run, with the config written: every case of the run goes through it. The config names the model key as $MODEL_API_KEY.
 * On a harness the sandbox has a HOME of its own and an opencode config of its own, so the judge reads nothing of the operator's setup.
 */
export function openSandbox(baseUrl: string, model: string, hasKey: boolean, overrides: Overrides = defaultOverrides(STRATEGY), provider = "openai", harness?: string): Sandbox {
  const sandbox = createSandbox(NAME, { keepModelKey: true, isolateHome: harness !== undefined });
  const config = configFor(baseUrl, model, hasKey, overrides, provider);
  writeConfig(sandbox, harness === undefined ? config : { ...config, harnesses: { [harness]: {} } });
  if (harness !== undefined) writeOpencodeConfig(sandbox, opencodeConfig(baseUrl, model, hasKey));
  return sandbox;
}

/**
 * The fields of the verdict that the scorer reads, from the envelope `akm judge reflect.quality --format json` printed, with the model endpoint written
 * as <MODEL_BASE_URL> in its reason (results get shared, and akm's messages name the endpoint it called). `schemaVersion` is the judge's, kept so that a
 * stored run says which verdicts it holds (rawOf). The envelope's `engine` is the runner's name. An `error` or `unparseable` outcome is the judge giving no
 * verdict, which akm's reflect sends to a person (score -1, review needed), and the reason is the outcome's.
 */
export function verdictOf(envelope: JudgeEnvelope, baseUrl: string): Record<string, unknown> {
  const v = envelope.outcome === "verdict" ? envelope.verdict! : { pass: false, score: -1, reviewNeeded: true, reason: envelope.reason };
  const { pass, score, reviewNeeded, reason, criteria } = v;
  return { pass, score, reviewNeeded, reason: typeof reason === "string" ? hideEndpoint(reason, baseUrl) : reason, criteria, engine: envelope.runner?.name, schemaVersion: envelope.schemaVersion };
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

/** One case: the source, the candidate, the feedback lines and the ref go to `akm judge reflect.quality` on stdin, and its verdict is scored. */
export async function judgeCase(c: Case, ctx: CaseContext): Promise<Row> {
  const call = await callJudge(ctx.sandbox, JUDGE, judgeInput(c), { timeoutMs: ctx.timeoutMs ?? JUDGE_TIMEOUT_MS, hide: (text) => hideEndpoint(text, ctx.baseUrl), ...(ctx.harness && ctx.model ? { harness: { name: ctx.harness, model: harnessModel(ctx.model) } } : {}) });
  if ("error" in call) return makeRow(c, { error: call.error, seconds: call.seconds, ...(call.timedOut ? { timedOut: true } : {}) });
  return makeRow(c, { verdict: verdictOf(call.envelope, ctx.baseUrl), seconds: call.seconds });
}
