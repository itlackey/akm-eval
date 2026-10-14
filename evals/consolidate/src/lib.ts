// Helpers for the consolidate eval that are neither its scorer nor its collector: the `--embedder` flag, and the one place that the eval and the
// evals that borrow its code (nightly) import from.
//
// The cases are cases.ts, the scorer is score.ts (and pool-score.ts for `--pool`) and the collector is collect.ts (see measurement.ts); this
// file re-exports them. run.ts runs the eval and generate.ts makes the private cases.

import { EMBEDDERS, type Embedder } from "./sandbox.ts";
import { rawFromRun } from "./collect.ts";
import type { Case } from "./cases.ts";
import { type Row, makeRow } from "./score.ts";

export * from "./cases.ts";
export * from "./score.ts";
export * from "./collect.ts";
export * from "./sandbox.ts";

/** `--embedder`, for parseArgs, and its lines of an eval's usage text. */
export const EMBEDDER_OPTIONS = { embedder: { type: "string" } } as const;
export const embedderUsage = `  --embedder      deterministic (default) or real. How akm embeds the notes to find the pairs it judges. deterministic is akm's
                  word-hash embedder: no model, and the same pairs on every run. real is akm's built-in model (the one retrieval
                  uses, downloaded once into .cache/), as a real bundle runs it. The pairs were made to pair in the hash space, so
                  the real embedder may pair others, and its runs are not comparable with deterministic ones.`;

/** The embedder that `--embedder` names. `fail` ends the run with a message. */
export function parseEmbedder(value: string | undefined, fail: (message: string) => never, semantic = false): Embedder {
  if (semantic) {
    if (value !== undefined && value !== "real") fail("--semantic uses the real embedder; omit --embedder or use --embedder real");
    return "real";
  }
  if (value === undefined) return "deterministic";
  if (!(EMBEDDERS as readonly string[]).includes(value)) fail(`--embedder must be deterministic or real, not "${value}"`);
  return value as Embedder;
}

/** Turns what akm printed for one case into a row: the raw output of the run (rawFromRun), scored (makeRow). */
export const rowFromRun = (c: Case, improve: unknown, proposals: unknown, seconds: number): Row => makeRow(c, rawFromRun(improve, proposals, seconds));

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
