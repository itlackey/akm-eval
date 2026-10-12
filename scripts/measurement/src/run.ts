#!/usr/bin/env bun
// measurement: checks MEASUREMENT.lock against the files each eval declares as its collector and scorer, and bumps a part when it changes.
// See the README's "How results stay comparable".

import { parseArgs } from "node:util";
import { REPO_ROOT } from "../../../lib/manifest.ts";
import { CHANGELOG, PARTS, type Part, bump, checkLock, listLock } from "./lib.ts";

const USAGE = `Usage: scripts/measurement/run check
       scripts/measurement/run list
       scripts/measurement/run bump EVAL collector|scorer --reason TEXT
       scripts/measurement/run bump harness --reason TEXT

Every eval that declares a MEASUREMENT (src/measurement.ts) has two parts in MEASUREMENT.lock: its collector, the files that decide what
akm is asked and what is kept of the answer, and its scorer, the files that turn a raw output into a score. Each has a version and a
digest of its files: the ones the eval lists and every file of the repository they import. The lock records that list. The collector
does not take the files of the scorer, and a scorer that imports a file of the collector is refused.

  check   recompute the digests and fail if a part changed without the lock being updated, or if an entry has no changelog row.
          scripts/check and CI run it.
  list    print the parts of every eval, their versions, and whether the lock is current.
  bump    record a change: the part's version goes up by one, the lock takes the new digest, and a row with the reason is added to
          ${CHANGELOG}. An eval with no entry gets one, at version 1. "bump harness" raises the harness version, a deliberate break of
          every eval. Say in the reason whether the scores change, or write "no score change".`;

function main(): number {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, strict: true, options: { reason: { type: "string" }, help: { type: "boolean", short: "h" } } });
  } catch (e) {
    console.error(`measurement: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed as { values: { reason?: string; help?: boolean }; positionals: string[] };
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const [command, ...rest] = positionals;
  try {
    if (command === "check" && rest.length === 0) {
      const problems = checkLock(REPO_ROOT);
      if (problems.length === 0) {
        console.log(`measurement: MEASUREMENT.lock matches the files of ${listLock(REPO_ROOT).length} evals`);
        return 0;
      }
      for (const p of problems) console.error(`measurement: ${p}`);
      return 1;
    }
    if (command === "list" && rest.length === 0) {
      for (const line of listLock(REPO_ROOT)) console.log(line);
      return 0;
    }
    if (command === "bump") {
      const [name = "", part = ""] = rest;
      const harness = rest.length === 1 && name === "harness";
      if (!harness && !(rest.length === 2 && (PARTS as readonly string[]).includes(part))) throw new Error(`bump takes an eval and collector or scorer, or harness\n\n${USAGE}`);
      if (values.reason === undefined) throw new Error("bump needs --reason: say what changed and whether the scores change");
      console.log(`measurement: ${bump(REPO_ROOT, name, harness ? "harness" : (part as Part), values.reason)}`);
      return 0;
    }
    throw new Error(`unknown command\n\n${USAGE}`);
  } catch (e) {
    console.error(`measurement: ${(e as Error).message}`);
    return 2;
  }
}

process.exit(main());
