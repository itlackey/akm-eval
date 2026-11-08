#!/usr/bin/env bun
// Writes the tasks and libraries of cli-ratification from cards.ts (the cards are the source; the folders are their output, committed so
// that a run reads plain files, and a test regenerates them and compares). Harbor's task format, one folder per card:
//
//   tasks/<card>/instruction.md, task.toml, environment/{Dockerfile,workspace/...}, tests/{test.sh,verify.mjs,expected.json}
//   libraries/<card>/{memories,knowledge,workflows}/...   and the hidden .plant.sh and .solve.sh
//
//   evals/cli-ratification/generate [--check]    --check writes nothing and fails when the folders differ from the cards.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { CARDS, type Card, expectedOf } from "./cards.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const CURL_LAYER = "RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*\n\n";

/** The article's pilot limit: twelve minutes for the agent. */
export const AGENT_TIMEOUT_SEC = 720;

const str = (x: string) => JSON.stringify(x);
const list = (xs: string[]) => `[${xs.map(str).join(", ")}]`;

const taskToml = (c: Card) => `schema_version = "1.4"

[task]
name = "akm-eval/${c.id}"
version = "1.0.0"
description = ${str(c.description)}
authors = []
keywords = []

[metadata]
family = ${str(c.family)}
project = ${str(c.project)}
# Values that must appear in the output of an akm call, before the answer is written, for the answer to be AKM-mediated; and patterns of
# akm commands, one of which must have run. The trace is read on the host (src/trace.ts); the agent never sees this file.
evidence = ${list(c.evidence)}
commands = ${list(c.commands)}

[verifier]
timeout_sec = 300.0

[agent]
timeout_sec = ${AGENT_TIMEOUT_SEC}.0

[environment]
workdir = "/work/${c.project}"

[environment.env]
AKM_TASK_STASH = ${str(c.id)}
`;

/**
 * The label makes every card's image chain its own. Without it two cards of one project have the same first layers, and a COPY of
 * workspace files that agree in path, size and modification second (a README of two names of six letters, written in one run of generate)
 * can come out of the build cache with the other card's content: seen in a check run as a README that "changed".
 */
const dockerfile = (c: Card) => `FROM ubuntu:24.04\n\nLABEL org.akm-eval.card=${str(c.id)}\n\n${CURL_LAYER}WORKDIR /work/${c.project}\nCOPY workspace/ /work/${c.project}/\n`;

const testSh = `#!/bin/bash
# Harbor entry point, run in the container after the agent has exited. verify.mjs judges the state left behind and writes
# /logs/verifier/reward.json and checks.json. A missing node is an unscored trial, not a failed one.
set -uo pipefail
mkdir -p /logs/verifier
exec node /tests/verify.mjs /tests/expected.json
`;

/** Every file of the suite's tasks and libraries, by path from the eval's folder. */
export function render(cards: Card[] = CARDS()): Record<string, string> {
  const verify = readFileSync(join(EVAL_DIR, "verify", "verify.mjs"), "utf8");
  const out: Record<string, string> = {};
  for (const c of cards) {
    const t = `tasks/${c.id}`;
    out[`${t}/instruction.md`] = `${c.instruction}\n`;
    out[`${t}/task.toml`] = taskToml(c);
    out[`${t}/environment/Dockerfile`] = dockerfile(c);
    for (const [p, text] of Object.entries(c.workspace)) out[`${t}/environment/workspace/${p}`] = text;
    out[`${t}/tests/test.sh`] = testSh;
    out[`${t}/tests/verify.mjs`] = verify;
    out[`${t}/tests/expected.json`] = `${JSON.stringify(expectedOf(c), null, 2)}\n`;
    for (const [p, text] of Object.entries(c.library)) out[`libraries/${c.id}/${p}`] = text;
    out[`libraries/${c.id}/.solve.sh`] = c.solve;
  }
  return out;
}

function onDisk(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out[relative(EVAL_DIR, p).split("\\").join("/")] = readFileSync(p, "utf8");
    }
  };
  for (const top of ["tasks", "libraries"]) if (existsSync(join(EVAL_DIR, top))) walk(join(EVAL_DIR, top));
  return out;
}

/** The paths that differ: only in the cards, only on disk, or with other content. */
export function differences(): string[] {
  const want = render();
  const have = onDisk();
  return [...new Set([...Object.keys(want), ...Object.keys(have)])].sort().filter((p) => want[p] !== have[p]);
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const diff = differences();
    if (diff.length) {
      console.error(`cli-ratification: the tasks and libraries differ from the cards in ${diff.length} files, such as ${diff.slice(0, 3).join(", ")}. Run evals/cli-ratification/generate.`);
      process.exit(1);
    }
    console.log("cli-ratification: the tasks and libraries are those of the cards");
  } else {
    for (const top of ["tasks", "libraries"]) rmSync(join(EVAL_DIR, top), { recursive: true, force: true });
    const files = render();
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(dirname(join(EVAL_DIR, p)), { recursive: true });
      writeFileSync(join(EVAL_DIR, p), text);
    }
    console.log(`cli-ratification: wrote ${Object.keys(files).length} files for ${CARDS().length} cards`);
  }
}
