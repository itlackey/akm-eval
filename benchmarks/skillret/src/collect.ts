// The collector of the skillret benchmark: writes the skills of a corpus into akm sandboxes as assets, indexes them for keyword search and, in a
// run without --limit, for semantic search, and asks akm search for the first 15 skills of every query, and akm curate for a sample of them. It
// builds each query's row with the scorer's `makeRow` from the ranked results akm gave. It is the COLLECTOR part of the benchmark's measurement
// (see measurement.ts and lib/manifest.ts): the sandboxes and the configs akm runs with, the layout of the bundle, the commands and what is
// recorded of the answers. The scoring is score.ts.
//
// A change to what this file asks akm, or to what it records of the answer, is a new version of the eval: change `version` in
// measurement.ts by hand.

import { readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { type Sandbox, akmVersion, createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import { type CachedIndex, type IndexSpec, cachedIndex } from "../../../lib/akm/index-cache.ts";
import { fail } from "../../../lib/cli.ts";
import * as akm from "./akm.ts";
import type { Corpus } from "./dataset.ts";
import { curateSample } from "./sample.ts";
import { type Call, type Mode, MODES, type Raw, type Row, SYSTEMS, type System, makeRow, modeOf } from "./score.ts";

export const NAME = "skillret";

/** akm calls in flight at once. A search only reads the index, so they can share it. */
export const WORKERS = Math.min(8, availableParallelism());

/**
 * The files of the code that lays out the bundle and that builds the semantic index: the cache keeps an index for the code that built it, so an edit
 * to how the skills are written or indexed builds a new one and does not reuse an index laid out the old way.
 */
export const BUILDER = [join(import.meta.dir, "akm.ts")];

/** Whether a run scores the semantic search as well. A run with --limit is for checking a setup, and is scored with keyword search alone. */
export const withSemantic = (limit?: number): boolean => limit === undefined;

/** Runs `work` for every item, `workers` at a time. */
async function inParallel<T>(items: T[], workers: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (next < items.length) await work(items[next++]);
    }),
  );
}

const seconds = (s: number): string => (s >= 120 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);

/** How a semantic index came to be, in words. */
export const INDEX_STATE = { cold: "a new index", warm: "kept from an earlier run", rebuilt: "a new index, because the kept one was not what it was built as" } as const;

export interface CollectContext {
  /** Whether the run has the semantic index and its line. */
  semantic: boolean;
  /** A sandbox for the keyword index, for tests. Default: a new one. */
  newSandbox?: () => Sandbox;
  /** Where the cache of the semantic index is, and which akm runs in it, for tests. `builder` replaces BUILDER. */
  cache?: Pick<IndexSpec, "root" | "cmd" | "builder">;
  workers?: number;
  callTimeoutMs?: number;
}

/** What a collection gives back besides the rows. */
export interface Collected {
  /** One row for each query, in the order of the corpus. */
  rows: Row[];
  version: string;
  /** What akm said it searched with, for each index. The run stops at a call that says anything else. */
  seen: Record<Mode, Set<string>>;
  semanticIndex?: CachedIndex["state"];
  builtBy?: CachedIndex["builtBy"];
  /** The akm config each index ran with, as the sandbox's config file has it. The caller redacts it. */
  configs: { keyword: unknown; semantic?: unknown };
  /** How long writing and indexing the skills took, in seconds. A new semantic index embeds every skill. */
  indexSeconds: { keyword: number; semantic: number };
  /** How long all the calls took, in seconds. */
  querySeconds: number;
  workers: number;
}

const configOf = (sb: Sandbox): unknown => JSON.parse(readFileSync(join(sb.dir, "config", "config.json"), "utf8"));

/**
 * Collects one corpus: index its skills for keyword search and, when `ctx.semantic`, for semantic search too, ask akm search for every query, and
 * ask akm curate for a sample of them. The keyword index is made for the run, in the sandbox that `ctx.newSandbox` makes. The semantic index is the
 * one of lib/akm's index cache, which keeps it from run to run. `begin` is called with the version of akm before anything is indexed, and `onRow`
 * with each query's row as soon as it is done.
 */
export async function collect(corpus: Corpus, ctx: CollectContext, begin: (version: string) => void, onRow: (row: Row) => void): Promise<Collected> {
  const workers = ctx.workers ?? WORKERS;
  const modes: readonly Mode[] = ctx.semantic ? MODES : ["keyword"];
  const systems: readonly System[] = ctx.semantic ? SYSTEMS : ["search"];
  const made: Sandbox[] = [];
  let release = (): void => {};
  try {
    const boxes = { keyword: (ctx.newSandbox ?? (() => createSandbox(NAME)))() } as Record<Mode, Sandbox>;
    made.push(boxes.keyword);
    const version = await akmVersion(boxes.keyword).catch((e: Error) => fail(e.message));
    begin(version);
    const { skills, queries } = corpus;
    const sample = curateSample(queries);
    const checked = new Set(sample.map((q) => q.id));
    console.log(`${NAME} (${corpus.corpus === "public" ? "public" : "custom"}): akm ${version}, ${skills.length} skills, ${queries.length} queries, ${workers} akm calls at a time`);

    const indexSeconds = { keyword: 0, semantic: 0 };
    const indexed = (n: number): void => {
      if (n !== skills.length) fail(`akm indexed ${n} assets for ${skills.length} skills. The skills it left out could not be returned.`, 1);
    };
    // The semantic index first: the model download and the embedding are what can go wrong, and what takes the time.
    let semanticIndex: CachedIndex["state"] | undefined;
    let builtBy: CachedIndex["builtBy"] | undefined;
    if (ctx.semantic) {
      const t0 = performance.now();
      const index = await cachedIndex({ name: `${NAME}-${corpus.corpus}`, version, files: akm.skillFiles(skills), builder: BUILDER, ...ctx.cache }, async (sb) => {
        const n = await akm.load(sb, skills, true);
        indexed(n);
        return n;
      });
      release = index.release;
      boxes.semantic = index.sandbox;
      semanticIndex = index.state;
      builtBy = index.builtBy;
      indexed(index.entries);
      indexSeconds.semantic = (performance.now() - t0) / 1000;
      console.log(`  indexed for semantic search in ${seconds(indexSeconds.semantic)}: ${INDEX_STATE[index.state]}`);
    }
    {
      const t0 = performance.now();
      indexed(await akm.load(boxes.keyword, skills));
      indexSeconds.keyword = (performance.now() - t0) / 1000;
      console.log(`  indexed for keyword search in ${seconds(indexSeconds.keyword)}`);
    }

    const known = new Set(skills.map((s) => s.id));
    if (ctx.semantic) {
      const probe = await akm.ask(boxes.semantic, "search", queries[0].query, known, "semantic", ctx.callTimeoutMs);
      if (probe.error || probe.mode !== "semantic") fail(`akm cannot search with its embedder: ${probe.error ?? "the answer did not say it searched semantically"}`, 1);
    }
    const rows = new Map<string, Row>();
    const seen: Record<Mode, Set<string>> = { keyword: new Set(), semantic: new Set() };
    const step = Math.max(1, Math.round(queries.length / 20));
    const t1 = performance.now();
    const callOf = (a: akm.Answer): Call => ({ ranked: a.ranked, seconds: a.seconds, ...(a.error ? { error: a.error } : {}), ...(a.timedOut ? { timed_out: true as const } : {}) });
    await inParallel(queries, workers, async (q) => {
      const raw: Partial<Raw> = {};
      for (const sys of systems) {
        const a = await akm.ask(boxes[modeOf(sys)], "search", q.query, known, modeOf(sys), ctx.callTimeoutMs);
        if (a.mode) seen[modeOf(sys)].add(a.mode);
        raw[sys] = callOf(a);
      }
      if (checked.has(q.id)) {
        for (const mode of modes) raw[mode === "keyword" ? "curate" : "semantic_curate"] = callOf(await akm.ask(boxes[mode], "curate", q.query, known, mode, ctx.callTimeoutMs));
      }
      const row = makeRow(q, raw as Raw);
      rows.set(q.id, row);
      onRow(row);
      if (rows.size % step === 0 || rows.size === queries.length) {
        const errors = [...rows.values()].filter((r) => systems.some((sys) => r[sys]?.error) || r.curate?.error || r.semantic_curate?.error).length;
        console.log(`  [${String(rows.size).padStart(String(queries.length).length)}/${queries.length}] ${seconds((performance.now() - t1) / 1000)}${errors ? `, ${errors} queries with an error` : ""}`);
      }
    });
    const querySeconds = (performance.now() - t1) / 1000;
    return {
      rows: queries.map((q) => rows.get(q.id) as Row),
      version,
      seen,
      semanticIndex,
      builtBy,
      configs: { keyword: configOf(boxes.keyword), ...(ctx.semantic ? { semantic: configOf(boxes.semantic) } : {}) },
      indexSeconds,
      querySeconds,
      workers,
    };
  } finally {
    release();
    for (const sb of made) removeSandbox(sb);
  }
}
