// What the terminal-bench tests stand in for: a `uv` and a `docker` that are not Harbor and Docker, and a copy of the
// repository's code that runs the CLI in a folder of its own.

import { chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

/**
 * A `uv` that is not Harbor, and a `docker` that says it is up, in `<root>/bin`. Given the job, the `uv` leaves the trial folders Harbor would
 * leave, `n_attempts` of them for each task and arm, records the environment it was started in and the job it was given, and exits as
 * UV_FAKE_EXIT says. UV_FAKE_MISSING leaves out the akm arm's trials of the last task, as a Harbor that stopped before it got there does.
 * UV_FAKE_NOTHING leaves no trial at all. Returns the folder of the two, for PATH. The knobs are UV_* variables because those are the ones
 * the runner passes on to Harbor.
 */
export function writeFakeHarbor(root: string): string {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, "uv"),
    `#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = Bun.argv.slice(2);
const job = JSON.parse(readFileSync(args[args.indexOf("-c") + 1], "utf8"));
writeFileSync(join(job.jobs_dir, "..", "uv-env.json"), JSON.stringify(process.env));
if (!process.env.UV_FAKE_NOTHING) {
  const tasks = job.datasets[0].task_names;
  tasks.forEach((task, i) => {
    for (const agent of job.agents) {
      const name = agent.name ?? "akm-opencode";
      if (process.env.UV_FAKE_MISSING && i === tasks.length - 1 && name === "akm-opencode") continue;
      for (let k = 0; k < job.n_attempts; k++) {
        const dir = join(job.jobs_dir, job.job_name, task.split("/")[1] + "__" + name + "__" + k);
        mkdirSync(join(dir, "agent"), { recursive: true });
        const trial = { task_name: task, agent_info: { name }, verifier_result: { rewards: { reward: name === "opencode" ? 0 : 1 } }, started_at: "2026-10-06T04:00:00Z", finished_at: "2026-10-06T04:05:00Z" };
        if (process.env.UV_FAKE_TIMEOUTS && i === 0 && name === "opencode") trial.exception_info = { exception_type: "AgentTimeoutError" };
        if (process.env.UV_FAKE_TIMEOUTS && i === 1 && name === "akm-opencode") { trial.exception_info = { exception_type: "AgentSetupTimeoutError" }; trial.verifier_result = null; }
        if (process.env.UV_FAKE_PLUGIN_DEAD && i === 0 && name === "akm-opencode") {
          trial.exception_info = { exception_type: "AgentTimeoutError" };
          trial.verifier_result = null;
          writeFileSync(join(dir, "agent", "akm_plugin_status.json"), JSON.stringify({ live: false, problem: "there is no opencode log" }));
        }
        if (name === "akm-opencode") {
          // UV_FAKE_TREES=differ: each container installed another dependency tree.
          const tree = (process.env.UV_FAKE_TREES === "differ" ? String(i * 10 + k).padStart(2, "0") : "ee").repeat(32);
          writeFileSync(join(dir, "agent", "akm_install.json"), JSON.stringify({ akm_version: "0.9.99-test", plugin_akm_cli: "0.9.26", assets_indexed: 7, env: { AKM_CURATE_TIMEOUT: "15" }, lockfiles: { akm_cli: "a".repeat(64), plugin: "b".repeat(64) }, dependency_tree_sha256: tree }));
        }
        writeFileSync(join(dir, "result.json"), JSON.stringify(trial));
      }
    }
  });
}
process.exit(Number(process.env.UV_FAKE_EXIT ?? 0));
`,
  );
  writeFileSync(join(bin, "docker"), "#!/bin/sh\nexit 0\n");
  for (const f of ["uv", "docker"]) chmodSync(join(bin, f), 0o755);
  return bin;
}

/**
 * A copy of the code of this repository that run.ts imports, laid out as the repository is, with its MEASUREMENT.lock and the public library linked in. The CLI
 * runs in it as a person would run it, and what it writes (results/) lands in it and not in this repository.
 */
export function sandboxRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "terminal-bench-repo-"));
  const code = (rel: string) => cpSync(join(ROOT, rel), join(root, rel), { recursive: true, filter: (src) => !/\.test\.ts$|node_modules|test_.*\.py$|__pycache__/.test(src) });
  for (const rel of ["lib", join("evals", "retrieval", "src"), join("benchmarks", "terminal-bench", "src"), join("benchmarks", "terminal-bench", "assets")]) code(rel);
  copyFileSync(join(ROOT, "MEASUREMENT.lock"), join(root, "MEASUREMENT.lock")); // a run stops without an entry for the benchmark
  symlinkSync(join(ROOT, "corpus"), join(root, "corpus"));
  mkdirSync(join(root, "benchmarks", "terminal-bench", "results"), { recursive: true });
  return root;
}
