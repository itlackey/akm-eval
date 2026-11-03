// The collector of the judge-gate eval: gives akm's reflect quality judge one labelled proposal at a time, with the model under test as the judge,
// and builds each case's row from the verdict akm printed. It is the COLLECTOR part of the eval's measurement (see measurement.ts and
// lib/manifest.ts): the akm config it writes, the command it runs, the input it sends and what it records of the answer. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { type Sandbox, createSandbox, engineConfig, runAkm, writeConfig } from "../../../lib/akm/akm.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { exitMessage, hideEndpoint } from "../../../lib/cli.ts";
import { type Case, type Row, makeRow } from "./score.ts";

export const NAME = "judge-gate";

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

/** A sandbox for the run, with the config written: every case of the run goes through it. The config names the model key as $MODEL_API_KEY. */
export function openSandbox(baseUrl: string, model: string, hasKey: boolean, overrides: Overrides = defaultOverrides(STRATEGY), provider = "openai"): Sandbox {
  const sandbox = createSandbox(NAME, { keepModelKey: true });
  writeConfig(sandbox, configFor(baseUrl, model, hasKey, overrides, provider));
  return sandbox;
}

/**
 * The fields of the verdict that the scorer reads, from what `akm judge reflect.quality --format json` printed, with the model endpoint written
 * as <MODEL_BASE_URL> in its reason (results get shared, and akm's messages name the endpoint it called). The envelope's `verdict` is read as
 * it is; its `engine` is the runner's name. An `error` or `unparseable` outcome is the judge giving no verdict, which akm's reflect sends to a
 * person (score -1, review needed), and the reason is the outcome's. Anything else is kept as it is: the scorer calls it no verdict.
 */
export function verdictOf(parsed: unknown, baseUrl: string): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return parsed;
  const envelope = parsed as Record<string, any>;
  const engine = typeof envelope.runner?.name === "string" ? envelope.runner.name : undefined;
  const v: Record<string, unknown> =
    envelope.outcome === "verdict" && typeof envelope.verdict === "object" && envelope.verdict !== null
      ? envelope.verdict
      : envelope.outcome === "error" || envelope.outcome === "unparseable"
        ? { pass: false, score: -1, reviewNeeded: true, reason: envelope.reason }
        : {};
  const { pass, score, reviewNeeded, reason, criteria } = v;
  return { pass, score, reviewNeeded, reason: typeof reason === "string" ? hideEndpoint(reason, baseUrl) : reason, criteria, engine };
}

/** What one case needs of the run: the sandbox with the config written, the model endpoint (masked in the row), and the time limit of one case. */
interface CaseContext {
  sandbox: Sandbox;
  baseUrl: string;
  /** The time limit of one case, in milliseconds. A run always sets it (--timeout-ms); without it JUDGE_TIMEOUT_MS applies. */
  timeoutMs?: number;
}

/** One case: the source, the candidate, the feedback lines and the ref go to `akm judge reflect.quality` on stdin, and its verdict is scored. */
export async function judgeCase(c: Case, ctx: CaseContext): Promise<Row> {
  const hide = (text: string): string => hideEndpoint(text, ctx.baseUrl); // akm's errors name the endpoint it called, and results get shared
  const input = JSON.stringify(judgeInput(c));
  let run: Awaited<ReturnType<typeof runAkm>>;
  try {
    run = await runAkm(ctx.sandbox, ["judge", "reflect.quality", "--format", "json"], { stdin: input, timeoutMs: ctx.timeoutMs ?? JUDGE_TIMEOUT_MS });
  } catch (e) {
    return makeRow(c, { error: hide((e as Error).message), seconds: 0 });
  }
  const { stdout, stderr, code, ms, timedOut } = run;
  const seconds = Number((ms / 1000).toFixed(1));
  if (timedOut) return makeRow(c, { error: hide(exitMessage(code, stderr, stdout)), seconds, timedOut: true });
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return makeRow(c, { error: hide(exitMessage(code, stderr, stdout)), seconds });
  }
  return makeRow(c, { verdict: verdictOf(parsed, ctx.baseUrl), seconds });
}
