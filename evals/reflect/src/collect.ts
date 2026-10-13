// The collector of the reflect eval: runs akm's reflect on one note at a time in a sandbox of its own, with the model under test as the
// engine, and builds each case's row from what akm returned. It is the COLLECTOR part of the eval's measurement (see measurement.ts and
// lib/manifest.ts): the akm config it writes, the commands it runs and what it records of the answer. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSandbox, engineConfig, removeSandbox, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { indexedRef, indexedRefs } from "../../../lib/akm/indexed-refs.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { type Overrides, defaultOverrides, patchedConfig } from "../../../lib/akm/overrides.ts";
import { libraryFileOf } from "./build.ts";
import { type Case, type Outcome, type Row, makeRow } from "./score.ts";

export const NAME = "reflect";

/** The ref akm gives a note: its path without `.md`, and without `/SKILL` for a skill. */
export const refOf = (path: string): string => path.replace(/\.md$/, "").replace(/\/SKILL$/, "");

/** The strategy that runs reflect alone. */
export const STRATEGY = "reflect-only";

/**
 * The akm config for a run: the model under test as the one engine, at temperature 0 and with thinking off, and a strategy
 * that runs reflect on its own, with its quality judge off. judge-gate scores the judge, so here every proposal reaches the checks.
 */
export function reflectConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, "reflect");
  config.engines.reflect.temperature = 0;
  config.engines.reflect.enableThinking = false;
  const off = { enabled: false };
  config.defaults.improveStrategy = STRATEGY;
  config.improve = {
    strategies: {
      [STRATEGY]: {
        engine: "reflect",
        processes: { reflect: { enabled: true, qualityGate: off }, distill: off, consolidate: off, memoryInference: off, extract: off, validation: off, triage: off, proactiveMaintenance: off },
        sync: { enabled: false, push: false },
      },
    },
  };
  return config;
}


/** Did the command run past its timeout? runAkm ends the stderr of a command it killed with "akm timed out after <N>s", and runAkmJson throws a message that says so. */
export const timedOutMessage = (message: string): boolean => /\btimed out after [\d.]+s\b/.test(message);


/**
 * What reflect did on one asset, from the result of `akm improve <ref> --json-to-stdout`. akm exits 0 whatever
 * reflect did, so the outcome comes from the reflect action in the result.
 */
export function reflectOutcome(improve: unknown): { outcome: Outcome; reason: string } {
  const actions = (improve as { actions?: { mode?: string; result?: { ok?: boolean; reason?: string; error?: string } }[] } | null)?.actions ?? [];
  const action = actions.find((a) => a.mode?.startsWith("reflect"));
  if (!action?.result) return { outcome: "error", reason: "reflect did not run on the asset" };
  const { ok, reason = "", error = "" } = action.result;
  if (ok) return { outcome: "proposal", reason: "" };
  const why = `${reason}: ${error}`.slice(0, 300);
  if (reason === "no_change") return { outcome: "none", reason: why };
  if (reason === "quality_rejected" || action.mode === "reflect-guard-rejected") return { outcome: "refused", reason: why };
  if (reason === "parse_error") return { outcome: "unusable", reason: why };
  return { outcome: "error", reason: why };
}

/** The queries akm's retrieval check grades an edit on: at most 5, as akm takes. */
const MAX_QUERIES = 5;

/**
 * The queries the retrieval eval labels as finding each note (grade 2 or 3), by ref, best grade first, at most five. They
 * stand in for the searches that a real asset has in the usage log, which the retrieval check of akm's reflect grades the
 * edit on. `queries` and `qrels` are the two jsonl files of evals/retrieval/assets.
 */
export function labelledQueries(queries: string, qrels: string): Map<string, string[]> {
  const text = new Map<string, string>();
  for (const line of queries.split("\n")) if (line.trim()) text.set(JSON.parse(line).id, JSON.parse(line).query);
  const found = new Map<string, { query: string; grade: number; id: string }[]>();
  for (const line of qrels.split("\n")) {
    if (!line.trim()) continue;
    const q = JSON.parse(line) as { id: string; ref: string; grade: number };
    const query = text.get(q.id);
    if (query === undefined || q.grade < 2) continue;
    found.set(q.ref, [...(found.get(q.ref) ?? []), { query, grade: q.grade, id: q.id }]);
  }
  return new Map([...found].map(([ref, list]) => [ref, list.sort((a, b) => b.grade - a.grade || (a.id < b.id ? -1 : 1)).slice(0, MAX_QUERIES).map((q) => q.query)]));
}

/**
 * The searches to record for each case of a corpus, by the ref of the case's note. `labelled` holds the queries of the public notes, by their
 * refs (see `labelledQueries`). A corpus that is a rewrite of the public one has its notes at other paths and under other names, so a case takes
 * the queries of the public case with its id (the rewrite keeps ids), and `rewrite` writes each query as the rewrite wrote the note, so that the
 * same words change in both. The public corpus keeps them as they are.
 */
export function searchesFor(cases: Case[], publicCases: Case[], labelled: Map<string, string[]>, rewrite: (query: string) => string = (query) => query): Map<string, string[]> {
  const publicOf = new Map(publicCases.map((c) => [c.id, c]));
  const found = new Map<string, string[]>();
  for (const c of cases) {
    const publicPath = publicOf.get(c.id)?.path;
    // The retrieval eval labels a note of a skill by its library file under knowledge/, wherever the case puts it.
    const file = publicPath === undefined ? undefined : libraryFileOf(publicPath);
    const queries = publicPath === undefined ? undefined : labelled.get(refOf(file === publicPath ? publicPath : `knowledge/${file}`));
    if (queries && queries.length > 0) found.set(refOf(c.path), queries.map(rewrite));
  }
  return found;
}

/**
 * The model that answered reflect, as the response names it, from the usage report in the improve result. A gateway that
 * serves one name from several providers may answer with a different name each time.
 */
export function servedModel(improve: unknown): string | undefined {
  const usage = (improve as { usageReport?: { byProcessEngineModel?: { process?: string; model?: string }[] } } | null)?.usageReport;
  return usage?.byProcessEngineModel?.find((p) => p.process === "reflect")?.model;
}

/** What one case needs of the run: the model, its endpoint, the strategy and patch, the time limit of an akm command, and the searches to record by ref. */
export interface CaseContext {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  overrides?: Overrides;
  /** How long one akm command may run, in milliseconds. The default is runAkm's. */
  timeoutMs?: number;
  /** Searches to record for a note, by ref (see `labelledQueries`). Without it none are recorded. */
  queries?: Map<string, string[]>;
}

/** The akm config of a run: the engine at temperature 0 with thinking off, and the strategy, with the config patch merged in. */
export const configFor = (ctx: Pick<CaseContext, "baseUrl" | "model" | "hasKey" | "overrides">): Record<string, unknown> => patchedConfig(reflectConfig(ctx.baseUrl, ctx.model, ctx.hasKey), ctx.overrides ?? defaultOverrides(STRATEGY));

/**
 * One case in a bundle of its own: the note, the negative feedback recorded, reflect run on that asset alone, and the
 * proposal read back from the queue. akm exits 0 whatever reflect did, so what reflect did comes from the result.
 */
export async function runCase(c: Case, ctx: CaseContext): Promise<Row> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  const hide = (text: string): string => hideEndpoint(text, ctx.baseUrl); // akm's errors name the endpoint it called, and results get shared
  try {
    const overrides = ctx.overrides ?? defaultOverrides(STRATEGY);
    writeConfig(sandbox, configFor(ctx));
    const file = join(sandbox.dir, "bundle", c.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, c.source);
    const opts = { timeoutMs: ctx.timeoutMs };
    await runAkmJson(sandbox, ["index"], opts);
    const ref = indexedRef(indexedRefs(sandbox), c.path);
    await runAkmJson(sandbox, ["feedback", ref, "--negative", "--reason", c.feedback], opts);
    recordSearches(sandbox.env.AKM_DATA_DIR as string, ref, ctx.queries?.get(refOf(c.path)) ?? []);
    const improve = await runAkmJson(sandbox, ["improve", ref, "--strategy", overrides.strategy, "--json-to-stdout"], opts);
    const { outcome, reason } = reflectOutcome(improve);
    const served = servedModel(improve);
    if (outcome !== "proposal") return makeRow(c, { outcome, reason: hide(reason), served, seconds: seconds() });
    const { proposals } = await runAkmJson<{ proposals: { id: string; source: string }[] }>(sandbox, ["proposal", "list"], opts);
    const mine = proposals.filter((p) => p.source === "reflect");
    if (mine.length !== 1) throw new Error(`reflect made a proposal but the queue holds ${mine.length}`);
    const shown = await runAkmJson<{ proposal: { payload?: { content?: unknown } } }>(sandbox, ["proposal", "show", mine[0]?.id ?? "", "--detail", "full"], opts);
    const content = shown.proposal.payload?.content;
    if (typeof content !== "string") throw new Error("the proposal has no content");
    return makeRow(c, { outcome: "proposal", proposal: content, served, seconds: seconds() });
  } catch (e) {
    const message = hide((e as Error).message);
    return makeRow(c, { outcome: "error", reason: message.slice(0, 300), seconds: seconds(), timedOut: timedOutMessage(message) });
  } finally {
    removeSandbox(sandbox);
  }
}

/** The searches akm logs when a user finds a note: a usage event for the query and the note, which the retrieval check reads. */
function recordSearches(dataDir: string, ref: string, queries: string[]): void {
  if (queries.length === 0) return;
  const db = new Database(join(dataDir, "state.db"));
  try {
    const insert = db.prepare("INSERT INTO usage_events (event_type, query, entry_ref, source) VALUES ('search', ?, ?, 'user')");
    for (const q of queries) insert.run(q, `bundle//${ref}`);
  } finally {
    db.close();
  }
}

