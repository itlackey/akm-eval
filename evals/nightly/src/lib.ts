// Helpers for the nightly eval that are neither its scorer nor its collector, and the one place that the eval and its tests import from.
//
// The items are items.ts, the night as files is night.ts, the scorer is score.ts and the collector is collect.ts (see measurement.ts). The
// checks of the consolidate, reflect and distill evals are used as they are. build.ts makes the public night, run.ts runs it and generate.ts
// makes the private night.

export * from "./items.ts";
export * from "./library.ts";
export * from "./night.ts";
export * from "./score.ts";
export * from "./collect.ts";
export { noteAges } from "../../consolidate/src/sandbox.ts";

export const pct = (x: number | null): string => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
