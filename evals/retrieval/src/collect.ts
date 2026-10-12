// The collector of the retrieval eval: indexes a library in a sandbox for keyword search and, in a run that has it, in the cache for
// semantic search, and asks akm for the first results of every query. It is the COLLECTOR part of the eval's measurement (see
// measurement.ts and lib/manifest.ts): the akm config it writes, the commands it runs, how a library is laid out for akm and what is
// recorded of the answers. The scoring is score.ts.
//
// A change to this file, or to the files it imports (akm.ts, lib/akm), changes what akm is asked or what is recorded of its answer. Raw
// outputs from before the change are no longer comparable with raw outputs after it. It is a measurement change: bump the collector in
// MEASUREMENT.lock (scripts/measurement/run bump retrieval collector --reason "...") in the same change.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Sandbox, akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { type BuiltBy, type CachedIndex, type IndexSpec, cachedIndex } from "../../../lib/akm/index-cache.ts";
import { fail } from "../../../lib/cli.ts";
import { redactConfig } from "../../../lib/provenance.ts";
import * as akm from "./akm.ts";
import { type Case, type Raw, type RawAnswer, type Row, SYSTEMS, type System, makeRow } from "./score.ts";

export const NAME = "retrieval";

export type Mode = "keyword" | "semantic";
export const modeOf = (sys: System): Mode => (sys.startsWith("semantic_") ? "semantic" : "keyword");
export const commandOf = (sys: System): "search" | "curate" => (sys.endsWith("curate") ? "curate" : "search");

/** The columns a run collects: akm's two commands on the keyword index and, in a run that has the semantic index, on that too. */
export const systemsFor = (semantic: boolean): readonly System[] => (semantic ? SYSTEMS : ["search", "curate"]);

/** What a library is indexed from, and how: the semantic index is the one of lib/akm's index cache, which keeps it from run to run. */
export interface IndexInput {
  /** How the collection is named in messages: `public library`, `rewrite books`, `own`. */
  title: string;
  /** The folder of the kept semantic index in the cache, `retrieval-<name>`. */
  name: string;
  library: string;
  bundles?: string;
  /** akm.libraryFiles(library, bundles): the files akm is given, read once for the digest of the run and for the cache. */
  contents: akm.LibraryContents;
  semantic: boolean;
  /** A query for the first semantic search, which must say that akm used its embeddings. */
  probe: string;
  /** Makes the sandbox of the keyword index, for tests. */
  newSandbox?: () => Sandbox;
  /** Where the cache is, and the akm command to run in it, for tests. */
  cache?: Pick<IndexSpec, "root" | "cmd">;
}

export interface Indexes {
  boxes: Partial<Record<Mode, Sandbox>> & { keyword: Sandbox };
  version: string;
  nAssets: number;
  /** How long writing and indexing the library took, for each index. A new semantic index embeds every asset. */
  indexSeconds: { keyword: number; semantic?: number };
  semanticIndex?: CachedIndex["state"];
  builtBy?: BuiltBy;
  /** The akm config the eval wrote for each index, secrets redacted. */
  config: { keyword: unknown; semantic?: unknown };
  /** Lets go of the semantic index (it stays in the cache) and removes the sandboxes this run made. */
  close(): void;
}

/** How a semantic index came to be, in words. */
export const INDEX_STATE = { cold: "a new index", warm: "kept from an earlier run", rebuilt: "a new index, because the kept one was not what it was built as" } as const;

/** The spec of the kept semantic index: what is indexed and which akm it is for. */
export const indexSpec = (i: Pick<IndexInput, "name" | "contents" | "cache">, version: string): IndexSpec => ({ name: i.name, version, files: i.contents.files, extra: i.contents.extra, ...i.cache });

/**
 * Indexes the library for keyword search, in a sandbox that is removed by `close()`, and for semantic search when the run has it. Stops the
 * run before the first query when akm indexes another number of assets for the two, cannot embed the assets, or does not say that its first
 * semantic search used them.
 */
export async function openIndexes(i: IndexInput): Promise<Indexes> {
  const made: Sandbox[] = [];
  let release = (): void => {};
  const close = (): void => {
    release();
    for (const sb of made.splice(0)) removeSandbox(sb);
  };
  try {
    const boxes = { keyword: (i.newSandbox ?? (() => createSandbox(NAME)))() } as Indexes["boxes"];
    made.push(boxes.keyword);
    const version = await akmVersion(boxes.keyword);
    const indexSeconds: Indexes["indexSeconds"] = { keyword: 0 };
    const seconds = (t0: number): number => Number(((performance.now() - t0) / 1000).toFixed(1));
    console.log(`${NAME} (${i.title}): indexing for keyword search`);
    const t0 = performance.now();
    const nAssets = await akm.load(boxes.keyword, i.library, i.bundles);
    indexSeconds.keyword = seconds(t0);
    console.log(`  ${nAssets} assets indexed in ${indexSeconds.keyword} s`);
    let semanticIndex: CachedIndex["state"] | undefined;
    let builtBy: BuiltBy | undefined;
    if (i.semantic) {
      console.log(`${NAME} (${i.title}): indexing for semantic search`);
      const t1 = performance.now();
      const index = await cachedIndex(indexSpec(i, version), (sb) => akm.load(sb, i.library, i.bundles, true));
      release = index.release;
      boxes.semantic = index.sandbox;
      semanticIndex = index.state;
      builtBy = index.builtBy;
      if (index.entries !== nAssets) fail(`akm indexed ${nAssets} assets for keyword search and ${index.entries} for semantic search.`, 1);
      indexSeconds.semantic = seconds(t1);
      console.log(`  ${nAssets} assets indexed in ${indexSeconds.semantic} s: ${INDEX_STATE[index.state]}`);
      const probe = await akm.ask(index.sandbox, "search", i.probe, akm.LIMIT, "semantic");
      // A probe that does not say it searched with embeddings could be keyword rankings under a semantic name: ask() makes it an error, and this is the same check on the answer.
      if (probe.error || probe.mode !== "semantic") fail(`akm cannot search with its embedder: ${probe.error ?? `its answer says searchMode ${probe.mode ?? "nothing"}, not semantic`}`, 1);
    }
    const configOf = (sb: Sandbox) => redactConfig(JSON.parse(readFileSync(join(sb.dir, "config", "config.json"), "utf8")));
    const config = { keyword: configOf(boxes.keyword), ...(boxes.semantic ? { semantic: configOf(boxes.semantic) } : {}) };
    return { boxes, version, nAssets, indexSeconds, semanticIndex, builtBy, config, close };
  } catch (e) {
    close();
    throw e;
  }
}

/**
 * Asks akm for the first results of one query in every column of the run, and returns the row the scorer makes of them. `modes` is how akm
 * said it searched, for each call that said, for the summary. A call that fails is an answer with an error and no results (see akm.ask).
 */
export async function collectQuery(boxes: Indexes["boxes"], c: Case, systems: readonly System[], timeoutMs?: number): Promise<{ row: Row; modes: [Mode, string][] }> {
  const raw: Partial<Record<System, RawAnswer>> = {};
  const modes: [Mode, string][] = [];
  for (const sys of systems) {
    const a = await akm.ask(boxes[modeOf(sys)] as Sandbox, commandOf(sys), c.query, akm.LIMIT, modeOf(sys), timeoutMs);
    if (a.mode) modes.push([modeOf(sys), a.mode]);
    raw[sys] = { refs: a.refs, seconds: a.seconds, ...(a.error ? { error: a.error } : {}), ...(a.timedOut ? { timedOut: true } : {}) };
  }
  return { row: makeRow(c, raw as Raw), modes };
}
