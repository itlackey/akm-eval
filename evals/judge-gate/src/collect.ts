// The collector of the judge-gate eval: gives akm's reflect quality judge one labelled proposal at a time, with the model under test as the judge,
// and builds each case's row from the verdict akm printed. It is the COLLECTOR part of the eval's measurement (see measurement.ts and
// lib/manifest.ts): the akm config it writes, the command it runs, the input it sends and what it records of the answer. The scoring is score.ts.
//
// A change to this file, or to the lib/ files measurement.ts lists with it, changes what akm is asked or what is recorded of its answer. Raw
// outputs from before the change are no longer comparable with raw outputs after it. It is a measurement change: bump the collector in
// MEASUREMENT.lock (scripts/measurement/run bump judge-gate collector --reason "...") in the same change.

import { type Sandbox, createSandbox, engineConfig, runAkm, writeConfig } from "../../../lib/akm/akm.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { exitMessage, hideEndpoint } from "../../../lib/cli.ts";
import { type Case, type Row, makeRow } from "./score.ts";

export const NAME = "judge-gate";

/** How many cases run at a time. */
export const CONCURRENCY = 2;
const JUDGE_TIMEOUT_MS = 15 * 60_000; // one case, on a slow local model

/**
 * `akm improve judge` reads the feedback as one string and judges it as negative feedback only when the
 * string starts with `[negative]`. Reflect passes one line per feedback event and asks whether any line is
 * negative. Putting the negative lines first makes the two agree.
 */
export function orderFeedback(feedback: string): string {
  const lines = feedback.split("\n").filter((l) => l.trim() !== "");
  const negative = lines.filter((l) => l.startsWith("[negative]"));
  const rest = lines.filter((l) => !l.startsWith("[negative]"));
  return [...negative, ...rest].join("\n");
}

/** The improve strategy the judge config names, and the one `--strategy` replaces. */
export const STRATEGY = "default";

/**
 * The akm config the judge runs under: one LLM engine, named as reflect's quality gate engine. Requests use temperature 0 and ask for
 * no thinking, as distill and extract do, so that two runs differ by the model and not by the sampling. `strategy` is the improve
 * strategy the config makes the default; akm's judge takes its gate from it.
 */
export function judgeConfig(baseUrl: string, model: string, hasKey: boolean, strategy = STRATEGY): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "judge");
  config.engines.judge.temperature = 0;
  config.engines.judge.enableThinking = false;
  config.defaults.improveStrategy = strategy;
  config.improve = { strategies: { [STRATEGY]: { engine: "judge", processes: { reflect: { qualityGate: { engine: "judge" } } } } } };
  return config;
}

/** The config the eval writes: the judge config with the strategy of the overrides as the default, and the config patch, if any, merged into it after. */
export const configFor = (baseUrl: string, model: string, hasKey: boolean, overrides: Overrides): Record<string, any> => patchedConfig(judgeConfig(baseUrl, model, hasKey, overrides.strategy), overrides);

/** A sandbox for the run, with the config written: every case of the run goes through it. The config names the model key as $MODEL_API_KEY. */
export function openSandbox(baseUrl: string, model: string, hasKey: boolean, overrides: Overrides = defaultOverrides(STRATEGY)): Sandbox {
  const sandbox = createSandbox(NAME, { keepModelKey: true });
  writeConfig(sandbox, configFor(baseUrl, model, hasKey, overrides));
  return sandbox;
}

/**
 * The fields of akm's verdict that the scorer reads, with the model endpoint written as <MODEL_BASE_URL> in its reason (results get
 * shared, and akm's messages name the endpoint it called). Anything that is not an object is kept as it is: the scorer calls it no verdict.
 */
export function verdictOf(parsed: unknown, baseUrl: string): unknown {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return parsed;
  const { pass, score, reviewNeeded, reason, criteria, engine } = parsed as Record<string, unknown>;
  return { pass, score, reviewNeeded, reason: typeof reason === "string" ? hideEndpoint(reason, baseUrl) : reason, criteria, engine };
}

/** What one case needs of the run: the sandbox with the config written, the model endpoint (masked in the row), and the time limit of one case. */
export interface CaseContext {
  sandbox: Sandbox;
  baseUrl: string;
  /** The time limit of one case, in milliseconds. Tests shorten it. */
  timeoutMs?: number;
}

/** One case: the source, the candidate and the feedback go to `akm improve judge` on stdin, and its verdict is scored. */
export async function judgeCase(c: Case, ctx: CaseContext): Promise<Row> {
  const hide = (text: string): string => hideEndpoint(text, ctx.baseUrl); // akm's errors name the endpoint it called, and results get shared
  const input = JSON.stringify({ source: c.source, candidate: c.candidate, feedback: orderFeedback(c.feedback) });
  let run: Awaited<ReturnType<typeof runAkm>>;
  try {
    run = await runAkm(ctx.sandbox, ["improve", "judge", "--format", "json"], { stdin: input, timeoutMs: ctx.timeoutMs ?? JUDGE_TIMEOUT_MS });
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
