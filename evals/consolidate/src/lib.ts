// Helpers for the consolidate eval that are neither its scorer nor its collector, and the one place that the eval and the evals that borrow its code
// (nightly) import from.
//
// The cases are cases.ts, the scorer is score.ts (and pool-score.ts for `--pool`) and the collector is collect.ts (see measurement.ts); this
// file re-exports them. run.ts runs the eval and generate.ts makes the private cases.

import type { Case } from "./cases.ts";
import { rawFromRun } from "./collect.ts";
import { type Row, makeRow } from "./score.ts";

export * from "./cases.ts";
export * from "./score.ts";
export * from "./collect.ts";
export * from "./sandbox.ts";

/** Turns what akm printed for one case into a row: the raw output of the run (rawFromRun), scored (makeRow). */
export const rowFromRun = (c: Case, improve: unknown, proposals: unknown, seconds: number): Row => makeRow(c, rawFromRun(improve, proposals, seconds));

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
