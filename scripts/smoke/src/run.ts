#!/usr/bin/env bun
// smoke: runs each eval that drives akm once, on one case, against a stub model, to see that akm's flags and JSON still fit the evals.
// See ../README.md.

import { rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { AKM_OPTIONS, akmBuild, akmUsage, akmVersion, createSandbox, removeSandbox, useAkm } from "../../../lib/akm/akm.ts";
import { ENTRIES, LABEL, type Outcome, runEntry, startStub, stubEnv } from "./lib.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const DEFAULT_TIMEOUT_SEC = 15 * 60;

const USAGE = `Usage: scripts/smoke/run [--only A,B] [--skip A,B] [--akm COMMAND] [--timeout SEC] [--strict] [--keep] [--list]

Starts a stub model, a local server whose one endpoint, POST /v1/chat/completions, answers every call with the message {}, and runs each
eval that drives akm once, on one case of the public corpus: <eval>/run --corpus public --limit 1 --label ${LABEL}. The model and the
judge of every run are the stub, whatever .env says. A run passes when it ends and writes a summary.json. A model that answers {}
makes every case error, so the point is not the scores: it is that the commands the evals give akm are still accepted and the JSON
akm prints is still readable. Read what the first row of each run says, and the output of a run that failed.

  --only A,B     run these only, by folder name (reflect, retrieval, ...)
  --skip A,B     run all but these
  --akm          the command that runs akm, such as "bun ~/code/akm/src/cli.ts". Default: AKM_BIN in .env, else akm on PATH.
  --timeout SEC  stop an eval that is still running after SEC seconds (default ${DEFAULT_TIMEOUT_SEC})
  --strict       fail on a WARN too: an eval that uses a model and never reached it, or a request the stub does not serve
  --keep         keep the results folders the runs made (they are removed otherwise)
  --list         print what the smoke runs and what it skips, and why

It skips what needs Docker (agent-ab, terminal-bench), what downloads a dataset (longmemeval, skillret), and bakeoff, which never runs akm.
Needs akm on PATH, or in AKM_BIN.`;

class Fatal extends Error {}
const fail = (message: string): never => {
  throw new Fatal(message);
};

const name = (dir: string): string => basename(dir);

function row(o: Outcome): string {
  const calls = o.status === "ok" || o.status === "WARN" ? `${o.calls} model calls, ${o.errored} errored rows` : "";
  return `${o.status.padEnd(7)} ${name(o.dir).padEnd(14)} ${String(o.seconds).padStart(6)}s  ${[o.note, calls].filter(Boolean).join(". ")}`;
}

async function main(): Promise<number> {
  let values: { only?: string; skip?: string; akm?: string; timeout?: string; strict?: boolean; keep?: boolean; list?: boolean; help?: boolean };
  try {
    values = parseArgs({
      args: Bun.argv.slice(2),
      options: { only: { type: "string" }, skip: { type: "string" }, ...AKM_OPTIONS, timeout: { type: "string" }, strict: { type: "boolean" }, keep: { type: "boolean" }, list: { type: "boolean" }, help: { type: "boolean", short: "h" } },
      strict: true,
    }).values;
  } catch (e) {
    console.error(`smoke: ${(e as Error).message}\n\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const names = (flag: string, value: string | undefined): string[] | undefined => {
    const list = value?.split(",").map((s) => s.trim()).filter(Boolean);
    for (const n of list ?? []) if (!ENTRIES.some((e) => name(e.dir) === n)) fail(`${flag} names "${n}", which is not one of: ${ENTRIES.map((e) => name(e.dir)).join(", ")}`);
    return list;
  };
  const only = names("--only", values.only);
  const skip = names("--skip", values.skip) ?? [];
  const entries = ENTRIES.filter((e) => (!only || only.includes(name(e.dir))) && !skip.includes(name(e.dir)));
  if (values.list) {
    for (const e of ENTRIES) console.log(`${e.skip ? "skip" : "run "}  ${e.dir}${e.skip ? `  (${e.skip})` : e.needs ? `  (needs ${e.needs})` : ""}`);
    return 0;
  }
  const timeoutSec = values.timeout === undefined ? DEFAULT_TIMEOUT_SEC : Number(values.timeout);
  if (!(Number.isFinite(timeoutSec) && timeoutSec > 0)) fail("--timeout must be a positive number of seconds");
  useAkm(values, fail);

  const probe = createSandbox("smoke");
  let version: string;
  try {
    version = await akmVersion(probe).catch((e: Error) => fail(e.message));
  } finally {
    removeSandbox(probe);
  }
  const { akm_bin, akm_build } = akmBuild();
  console.log(`smoke: akm ${version} (${akm_bin}${akm_build ? `, build ${akm_build}` : ""}), a stub model for the model and the judge\n`);

  const stub = startStub();
  const env = stubEnv(process.env, stub.url);
  const outcomes: Outcome[] = [];
  try {
    for (const entry of entries) {
      const outcome = await runEntry(entry, { root: ROOT, env, akm: values.akm, timeoutMs: timeoutSec * 1000, stub });
      outcomes.push(outcome);
      console.log(row(outcome));
      if (outcome.status !== "skipped" && outcome.firstRow) console.log(`          first row: ${outcome.firstRow}`);
      if (outcome.status === "FAIL") {
        console.log(outcome.tail.replace(/^/gm, "          | "));
        if (entry.needs) console.log(`          this run needs ${entry.needs}`);
      }
      if (!values.keep) for (const f of outcome.folders) rmSync(join(ROOT, f), { recursive: true, force: true });
    }
  } finally {
    stub.stop();
  }

  const ran = outcomes.filter((o) => o.status !== "skipped");
  const failed = ran.filter((o) => o.status === "FAIL" || (values.strict && o.status === "WARN"));
  const warned = ran.filter((o) => o.status === "WARN" && !values.strict);
  console.log(
    `\nsmoke: ${ran.length} run, ${ran.length - failed.length - warned.length} passed, ${outcomes.length - ran.length} skipped` +
      `${warned.length ? `, ${warned.length} with a WARN: ${warned.map((o) => name(o.dir)).join(", ")}` : ""}` +
      `${failed.length ? `, ${failed.length} FAILED: ${failed.map((o) => name(o.dir)).join(", ")}` : ""}`,
  );
  return failed.length ? 1 : 0;
}

try {
  process.exit(await main());
} catch (e) {
  if (!(e instanceof Fatal)) throw e;
  console.error(`smoke: ${e.message}`);
  process.exit(2);
}
