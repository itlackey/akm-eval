// The collector of the bakeoff eval: runs the akm command of each process in a sandbox of its own, with the model under test as the one
// engine, and builds each case's row from what akm wrote. It is the COLLECTOR part of the eval's measurement (see measurement.ts and
// lib/manifest.ts): the akm config it writes, the commands it runs and what it keeps of akm's answer. The scoring is score.ts.
//
// A change to this file, or to the lib/ files measurement.ts lists with it, changes what akm is asked or what is kept of its answer. Raw
// outputs from before the change are no longer comparable with raw outputs after it. It is a measurement change: bump the collector in
// MEASUREMENT.lock (scripts/measurement/run bump bakeoff collector --reason "...") in the same change.
//
// The prompts are akm's own. Each process is one command:
//
//   memory-inference     akm index, akm improve --strategy bakeoff-memory-inference   reads memories/<name>.derived.md
//   remember-enrich      akm remember --enrich --name <name>                          reads memories/<name>.md
//   schema-repair        akm index, akm improve <lesson> --strategy bakeoff-schema-repair    reads the proposal of source schema-repair
//   session-summary      akm proposal extract --type claude --session-id <id>         reads sessions/claude/<id>.md
//   consolidate-promote  akm index, akm improve --strategy bakeoff-consolidate-promote      reads consolidation.planned and the proposals of source consolidate

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { type Sandbox, createSandbox, engineConfig, removeSandbox, runAkm, runAkmJson, writeConfig } from "../../../lib/akm/akm.ts";
import { type ConfigPatch, patchedConfig } from "../../../lib/akm/overrides.ts";
import { exitMessage, hideEndpoint } from "../../../lib/cli.ts";
import { type Case, type Process, type Raw, type Row, makeRow } from "./score.ts";

export const NAME = "bakeoff";

/** The one engine of the config: the model under test. */
export const ENGINE = "bakeoff";

/** A case with the text of the files it reads, from the corpus folder. */
export interface LoadedCase extends Case {
  texts: Record<string, string>;
}

/** The strategy of each process that runs through `akm improve` or `akm proposal extract`. remember-enrich has none. */
export const STRATEGIES: Record<Exclude<Process, "remember-enrich">, string> = {
  "memory-inference": "bakeoff-memory-inference",
  "schema-repair": "bakeoff-schema-repair",
  "session-summary": "bakeoff-session-summary",
  "consolidate-promote": "bakeoff-consolidate-promote",
};

/** How long one akm command may run, in milliseconds. A command that calls a model can take minutes. */
export const TIMEOUT_MS = 15 * 60_000;

const OFF = { enabled: false };

/** A strategy that runs the processes in `on` and none of the others, with the model under test as the engine and no sync. */
const only = (on: Record<string, unknown>) => ({
  engine: ENGINE,
  processes: { reflect: OFF, distill: OFF, consolidate: OFF, memoryInference: OFF, extract: OFF, validation: OFF, triage: OFF, proactiveMaintenance: OFF, ...on },
  sync: { enabled: false, push: false },
});

/**
 * The akm config of a run: the model under test as the one engine, at temperature 0 and with thinking off, and a strategy for each process
 * that runs through improve. Memory inference writes a derived memory and rewrites the frontmatter of its parent, which akm keeps behind
 * `experimental.improveAutonomy`. Semantic search is off, so consolidate's pair pass finds no pairs and the promotion pass sees the pool in
 * the order it was written.
 */
export function bakeoffConfig(baseUrl: string, model: string, hasKey: boolean): Record<string, any> {
  const config = engineConfig(baseUrl, model, hasKey, ENGINE);
  config.engines[ENGINE].temperature = 0;
  config.engines[ENGINE].enableThinking = false;
  config.experimental = { improveAutonomy: true };
  config.improve = {
    strategies: {
      [STRATEGIES["memory-inference"]]: only({ memoryInference: { enabled: true } }),
      [STRATEGIES["schema-repair"]]: only({ validation: { enabled: true } }),
      [STRATEGIES["session-summary"]]: only({ extract: { enabled: true, indexSessions: true, minSessionDuration: 0, triage: { enabled: false } } }),
      [STRATEGIES["consolidate-promote"]]: only({ consolidate: { enabled: true, minPoolSize: 0 } }),
    },
  };
  return config;
}

/** What one case needs of the run: the model, its endpoint, a config patch and the time limit of an akm command. */
export interface CaseContext {
  baseUrl: string;
  model: string;
  hasKey: boolean;
  configPatch?: ConfigPatch | null;
  /** How long one akm command may run, in milliseconds. The default is TIMEOUT_MS. */
  timeoutMs?: number;
}

/** The akm config of a run, with the config patch merged in. */
export const configFor = (ctx: Pick<CaseContext, "baseUrl" | "model" | "hasKey" | "configPatch">): Record<string, any> =>
  patchedConfig(bakeoffConfig(ctx.baseUrl, ctx.model, ctx.hasKey), { strategy: "", configPatch: ctx.configPatch ?? null });

/** Did the command run past its timeout? runAkm ends the stderr of a command it killed with "akm timed out after <N>s", and runAkmJson throws a message that says so. */
export const timedOutMessage = (message: string): boolean => /\btimed out after [\d.]+s\b/.test(message);

type Obj = Record<string, any>;
type Out = Omit<Raw, "seconds">;

/** The name of the model that answered a process, as the usage report of an improve run gives it. A gateway that serves one name from several providers may answer with a different name each time. */
function servedBy(improve: Obj, process: string): string | undefined {
  return (improve.usageReport?.byProcessEngineModel as Obj[] | undefined)?.find((p) => p.process === process)?.model;
}

/** Did a call of the process fail (the endpoint answered with an error, or did not answer), as opposed to answering with a reply akm could not use? */
function callFailed(improve: Obj, process: string): boolean {
  return ((improve.usageReport?.byProcessEngineModel as Obj[] | undefined) ?? []).some((p) => p.process === process && p.failures > 0);
}

/** The case's files, written into the sandbox's bundle at their paths. */
function place(c: LoadedCase, sandbox: Sandbox): void {
  for (const file of c.files) {
    const path = join(sandbox.dir, "bundle", file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, c.texts[file] as string);
  }
}

const bundleFile = (sandbox: Sandbox, path: string): string => join(sandbox.dir, "bundle", path);

/** The memory text, without its frontmatter, as a person would pass it to `akm remember`. */
const bodyOf = (text: string): string => (/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(text)?.[1] ?? text).trim();

type Collect = (c: LoadedCase, sandbox: Sandbox, timeoutMs: number) => Promise<Out>;

/** memory-inference: the memory in a bundle, `akm improve` with only memory inference on, and the derived memory it writes next to it. */
const memoryInference: Collect = async (c, sandbox, timeoutMs) => {
  const file = c.files[0] as string;
  place(c, sandbox);
  const opts = { timeoutMs };
  await runAkmJson(sandbox, ["index"], opts);
  const improve = await runAkmJson<Obj>(sandbox, ["improve", "--strategy", STRATEGIES["memory-inference"], "--no-sync", "--require-engines", "--json-to-stdout"], opts);
  const served = servedBy(improve, "memoryInference");
  const derived = bundleFile(sandbox, join(dirname(file), `${basename(file, ".md")}.derived.md`));
  if (existsSync(derived)) return { outcome: "output", derived: readFileSync(derived, "utf8"), served };
  if (!improve.memoryInference) throw new Error("improve ran no memory inference. Does this akm have it, behind experimental.improveAutonomy?");
  if (callFailed(improve, "memoryInference")) throw new Error("the model call of memory inference failed");
  return { outcome: "unusable", reason: "akm wrote no derived memory: the reply was not a derived memory with a title, a description, tags, search hints and content", served };
};

/** remember-enrich: `akm remember --enrich` on the text of the memory, and the memory file it wrote. akm exits 0 and writes the memory without enrichment when the model gives nothing, and says so on stderr. */
const rememberEnrich: Collect = async (c, sandbox, timeoutMs) => {
  const file = c.files[0] as string;
  const name = basename(file, ".md");
  const r = await runAkm(sandbox, ["remember", "--enrich", "--name", name, "--format", "json"], { stdin: bodyOf(c.texts[file] as string), timeoutMs });
  if (r.timedOut) throw new Error(`akm remember timed out after ${+(timeoutMs / 1000).toFixed(1)}s`);
  if (r.code !== 0) throw new Error(exitMessage(r.code, r.stderr, r.stdout));
  const said = r.stderr.split("\n").find((l) => /--enrich/.test(l))?.trim();
  if (said && /requires an engine|--enrich failed/.test(said)) throw new Error(said);
  if (said && /invalid JSON/.test(said)) return { outcome: "unusable", reason: said };
  const written = bundleFile(sandbox, join("memories", `${name}.md`));
  if (!existsSync(written)) throw new Error("akm remember wrote no memory");
  return { outcome: "output", written: readFileSync(written, "utf8") };
};

/** schema-repair: the lesson in a bundle, `akm improve <lesson>` with only validation on, which repairs a lesson that has no description, and the proposal it queues. */
const schemaRepair: Collect = async (c, sandbox, timeoutMs) => {
  const file = c.files[0] as string;
  place(c, sandbox);
  const opts = { timeoutMs };
  await runAkmJson(sandbox, ["index"], opts);
  const ref = file.replace(/\.md$/, "");
  const improve = await runAkmJson<Obj>(sandbox, ["improve", ref, "--strategy", STRATEGIES["schema-repair"], "--no-sync", "--require-engines", "--json-to-stdout"], opts);
  const served = servedBy(improve, "validation");
  const repair = (improve.schemaRepairs as Obj[] | undefined)?.find((r) => r.ref === ref);
  if (!repair) throw new Error("akm attempted no schema repair: it found nothing to repair in the lesson");
  if (repair.outcome === "queued") {
    const { proposals } = await runAkmJson<{ proposals: Obj[] }>(sandbox, ["proposal", "list", "--status", "pending", "--detail", "full"], opts);
    const mine = proposals.find((p) => p.id === repair.proposalId && p.source === "schema-repair");
    if (typeof mine?.payload?.content !== "string") throw new Error("akm queued a repair but the queue holds no proposal for it");
    return { outcome: "output", proposal: mine.payload.content, served };
  }
  const why = String(repair.error ?? repair.outcome).slice(0, 300);
  // The call failing is an error. A reply that is not JSON, or that akm's own check of the lesson refuses (a description without a when_to_use), is the model's.
  if (repair.outcome === "error" && /unparseable|invalid lesson structure/.test(why)) return { outcome: "unusable", reason: why.split("\n")[0], served };
  throw new Error(why);
};

/** The session asset without the paths of the sandbox it was made in. */
function withoutSandboxPaths(asset: string): string {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---[\s\S]*)$/.exec(asset);
  if (!m) return asset;
  const lines = (m[2] as string).split("\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^(log_path|access):/.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping && /^\s/.test(line)) continue;
    skipping = false;
    kept.push(line);
  }
  return `${m[1]}${kept.join("\n")}${m[3]}`;
}

/** session-summary: the session where akm reads Claude Code sessions, `akm proposal extract` on it with session indexing on, and the session asset it writes. */
const sessionSummary: Collect = async (c, sandbox, timeoutMs) => {
  const file = c.files[0] as string;
  const id = basename(file, ".jsonl");
  const projects = join(sandbox.dir, "projects");
  mkdirSync(join(projects, basename(dirname(file))), { recursive: true });
  writeFileSync(join(projects, basename(dirname(file)), `${id}.jsonl`), c.texts[file] as string);
  sandbox.env.AKM_CLAUDE_PROJECTS_DIR = projects; // akm looks for Claude Code sessions here, and never reads the caller's own
  const result = await runAkmJson<Obj>(sandbox, ["proposal", "extract", "--type", "claude", "--location", projects, "--session-id", id, "--strategy", STRATEGIES["session-summary"]], { timeoutMs });
  const session = (result.sessions as Obj[] | undefined)?.find((s) => s.sessionId === id);
  if (!session) throw new Error(`akm extract did not process the session: ${String((result.warnings as unknown[] | undefined)?.[0] ?? "no warning")}`.slice(0, 300));
  const asset = bundleFile(sandbox, join("sessions", "claude", `${id}.md`));
  if (existsSync(asset)) return { outcome: "output", asset: withoutSandboxPaths(readFileSync(asset, "utf8")) };
  // The summary comes after extract's own call, so a session extract skipped is never summarised.
  if (session.skipped && session.skipReason === "malformed_model_output") return { outcome: "unusable", reason: "akm skipped the session: the reply to extract's own call was not usable, so no summary was asked for" };
  if (session.skipped) throw new Error(`akm skipped the session: ${session.skipReason}`);
  // akm writes no asset, and says nothing, when the summary call fails or its reply is not usable.
  return { outcome: "unusable", reason: "akm wrote no session asset: the summary the model gave was missing or not usable, or the call failed (akm does not say which)" };
};

/** consolidate-promote: the pool of memories in a bundle, `akm improve` with only consolidate on, and the promotions it queued (the pair pass finds no pairs without embeddings). */
const consolidatePromote: Collect = async (c, sandbox, timeoutMs) => {
  place(c, sandbox);
  const opts = { timeoutMs };
  await runAkmJson(sandbox, ["index"], opts);
  const improve = await runAkmJson<Obj>(sandbox, ["improve", "--strategy", STRATEGIES["consolidate-promote"], "--no-sync", "--require-engines", "--json-to-stdout"], opts);
  const served = servedBy(improve, "consolidate");
  const consolidation = improve.consolidation as Obj | undefined;
  if (!consolidation) throw new Error("improve printed no consolidation result. Is consolidate on in the strategy?");
  if ((consolidation.failedChunks ?? 0) > 0) {
    const why = ((consolidation.warnings as string[] | undefined) ?? []).filter((w) => !/^Anti-collapse/.test(w)).join("; ").slice(0, 300) || "a chunk of the pool failed";
    if (callFailed(improve, "consolidate")) throw new Error(why);
    return { outcome: "unusable", reason: why, served };
  }
  const { proposals } = await runAkmJson<{ proposals: Obj[] }>(sandbox, ["proposal", "list", "--status", "pending", "--detail", "full"], opts);
  const promoted = [...new Set(proposals.filter((p) => p.source === "consolidate" && typeof p.promotionSource === "string").map((p) => p.promotionSource as string))];
  const planned = [...new Set(((consolidation.planned as Obj[] | undefined) ?? []).flatMap((op) => (typeof op.ref === "string" ? [op.ref] : [])))];
  // akm drops a promotion of the plan before it queues it, for a reason it gives by ref: a source that is too small, say.
  const skipped = Object.fromEntries(((consolidation.skipReasons as Obj[] | undefined) ?? []).flatMap((s) => (typeof s.ref === "string" ? [[s.ref, ((s.skips as Obj[] | undefined) ?? []).map((k) => String(k.reason)).join(", ")]] : [])));
  return { outcome: "output", promoted, planned, ...(Object.keys(skipped).length > 0 ? { skipped } : {}), served };
};

const COLLECTORS: Record<Process, Collect> = {
  "memory-inference": memoryInference,
  "remember-enrich": rememberEnrich,
  "schema-repair": schemaRepair,
  "session-summary": sessionSummary,
  "consolidate-promote": consolidatePromote,
};

/**
 * One case in a sandbox of its own: its files in a bundle, the akm command of its process, and what akm wrote read back. akm exits 0
 * whatever the model did, so what happened comes from the output (a file, a proposal) and from akm's own counts. A case that
 * did not run to the end is an error and has no verdict.
 */
export async function runCase(c: LoadedCase, ctx: CaseContext): Promise<Row> {
  const t0 = performance.now();
  const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
  const sandbox = createSandbox(NAME, { keepModelKey: true }); // the config names the model key as $MODEL_API_KEY
  const hide = (text: string): string => hideEndpoint(text, ctx.baseUrl); // akm's errors name the endpoint it called, and results get shared
  try {
    writeConfig(sandbox, configFor(ctx));
    const out = await COLLECTORS[c.process](c, sandbox, ctx.timeoutMs ?? TIMEOUT_MS);
    return makeRow(c, { ...out, ...(out.reason === undefined ? {} : { reason: hide(out.reason) }), seconds: seconds() });
  } catch (e) {
    const message = hide((e as Error).message);
    return makeRow(c, { outcome: "error", reason: message.slice(0, 300), seconds: seconds(), timedOut: timedOutMessage(message) });
  } finally {
    removeSandbox(sandbox);
  }
}
