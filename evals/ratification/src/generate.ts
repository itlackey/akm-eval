#!/usr/bin/env bun
// Writes the tasks and libraries of the ratification suite from tasks.ts, in Harbor's task format (the folders are committed, so a run reads plain
// files, and a test regenerates them and compares):
//
//   tasks/<id>/instruction.md, task.toml, environment/{Dockerfile,workspace-<id>/...}, tests/{test.sh,verify.mjs,expected.json}
//   libraries/<id>/<the shared notes, the task's own files>   and the hidden .plant.sh and .solve.sh
//
//   evals/ratification/generate [--check]    --check writes nothing and fails when the folders differ from tasks.ts.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { BASE, TASKS, type Task, expectedOf } from "./tasks.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
export const AGENT_TIMEOUT_SEC = 600;

const str = (x: string) => JSON.stringify(x);

const taskToml = (t: Task) => `schema_version = "1.4"

[task]
name = "akm-eval/${t.id}"
version = "1.0.0"
description = ${str(t.description)}
authors = []
keywords = []

[metadata]
family = ${str(t.family)}
# How many akm calls the reference solution makes: the report counts akm calls beyond it as unnecessary.
ref_akm = ${t.refAkm}
# A form this task invites that akm deprecated or removed, and the form that replaces it (regular expressions over a shell command).
old = ${str(t.old)}
replacement = ${str(t.replacement)}

[verifier]
timeout_sec = 300.0

[agent]
timeout_sec = ${AGENT_TIMEOUT_SEC}.0

[environment]
workdir = "/work"

[environment.env]
AKM_TASK_STASH = ${str(t.id)}
`;

const dockerfile = (t: Task) =>
  `FROM ubuntu:24.04\n\nRUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*\n\nWORKDIR /work\n` +
  (Object.keys(t.workspace).length ? `COPY workspace-${t.id}/ /work/\n` : "");

const testSh = `#!/bin/bash
# Harbor entry point, run in the container after the agent has exited. verify.mjs judges the state left behind and writes
# /logs/verifier/reward.json and checks.json. A missing node is an unscored trial, not a failed one.
set -uo pipefail
mkdir -p /logs/verifier
exec node /tests/verify.mjs /tests/expected.json
`;

/** Every file of the suite's tasks and libraries, by path from the eval's folder. */
export function render(tasks: Task[] = TASKS): Record<string, string> {
  const verify = readFileSync(join(EVAL_DIR, "verify", "verify.mjs"), "utf8");
  const out: Record<string, string> = {};
  for (const t of tasks) {
    const d = `tasks/${t.id}`;
    out[`${d}/instruction.md`] = `${t.instruction}\n`;
    out[`${d}/task.toml`] = taskToml(t);
    out[`${d}/environment/Dockerfile`] = dockerfile(t);
    for (const [p, text] of Object.entries(t.workspace)) out[`${d}/environment/workspace-${t.id}/${p}`] = text;
    out[`${d}/tests/test.sh`] = testSh;
    out[`${d}/tests/verify.mjs`] = verify;
    out[`${d}/tests/expected.json`] = `${JSON.stringify(expectedOf(t), null, 2)}\n`;
    for (const [p, text] of Object.entries({ ...BASE, ...t.library })) out[`libraries/${t.id}/${p}`] = text;
    out[`libraries/${t.id}/.solve.sh`] = `#!/usr/bin/env bash\nset -uo pipefail\n${t.solve}`;
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

/** The paths that differ: only in tasks.ts, only on disk, or with other content. */
export function differences(): string[] {
  const want = render();
  const have = onDisk();
  return [...new Set([...Object.keys(want), ...Object.keys(have)])].sort().filter((p) => want[p] !== have[p]);
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const diff = differences();
    if (diff.length) {
      console.error(`ratification: the tasks and libraries differ from tasks.ts in ${diff.length} files, such as ${diff.slice(0, 3).join(", ")}. Run evals/ratification/generate.`);
      process.exit(1);
    }
    console.log("ratification: the tasks and libraries are those of tasks.ts");
  } else {
    for (const top of ["tasks", "libraries"]) rmSync(join(EVAL_DIR, top), { recursive: true, force: true });
    const files = render();
    for (const [p, text] of Object.entries(files)) {
      mkdirSync(dirname(join(EVAL_DIR, p)), { recursive: true });
      writeFileSync(join(EVAL_DIR, p), text);
    }
    console.log(`ratification: wrote ${Object.keys(files).length} files for ${TASKS.length} tasks`);
  }
}
