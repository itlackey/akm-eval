// What the agent-ab tests stand in for: a public folder of fictional-tool tasks and the library they seed, a copy of the
// repository's code that runs the CLI in a folder of its own, and a `uv` and a `docker` that are not Harbor and Docker.

import { chmodSync, cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

/** A public folder (tasks/ and libraries/) of four fictional tasks and the library they seed: one sound, one whose answer holds no name or number to rewrite, one whose solution is wrong, one whose verifier wants a flag the library does not document. */
export function publicFixture(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-ab-gen-"));
  const put = (rel: string, text: string, mode = 0o644) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
    chmodSync(join(root, rel), mode);
  };
  const task = (name: string, instruction: string, solve: string, verify: string, tokens = ["scale", "--replicas"]) => {
    const declared = `gold_ref = "skills/drillbit"\nlibrary_tokens = [${tokens.map((k) => JSON.stringify(k)).join(", ")}]`;
    put(`tasks/${name}/task.toml`, `[task]\nname = "akm-eval/${name}"\n\n[metadata]\ntools = "fictional"\n${declared}\n\n[agent]\ntimeout_sec = 600.0\n\n[environment.env]\nAKM_TASK_STASH = "drillbit"\n`);
    put(`tasks/${name}/instruction.md`, instruction);
    put(`tasks/${name}/solution/solve.sh`, `#!/bin/bash\n${solve}\n`, 0o755);
    put(`tasks/${name}/tests/verify.sh`, `#!/usr/bin/env bash\n${verify}\n`, 0o755);
    put(`tasks/${name}/tests/test.sh`, "#!/bin/bash\n# pytest runs here, and the rewrite must not touch this\n", 0o755);
    put(`tasks/${name}/environment/Dockerfile`, "FROM ubuntu:24.04\nRUN pip install pytest==8.4.1\n");
  };
  task("drillbit--scale", "Append to `commands.txt` the `drillbit` command that scales `dev-edge` to 40 replicas.", 'echo "drillbit scale dev-edge --replicas 40" >> commands.txt', '[ "$(cat commands.txt)" = "drillbit scale dev-edge --replicas 40" ]');
  task("drillbit--plain", "Write `hello` to `out.txt`.", "echo hello > out.txt", '[ "$(cat out.txt)" = "hello" ]');
  task("drillbit--wrong", "Append to `commands.txt` the `drillbit` command that scales `dev-edge` to 40 replicas.", "echo nothing", '[ "$(cat commands.txt)" = "drillbit scale dev-edge --replicas 40" ]');
  task("drillbit--lacks", "Append to `commands.txt` the `drillbit` command that scales `dev-edge` to 55 replicas.", 'echo "drillbit scale dev-edge --replicas 55" >> commands.txt', '[ "$(cat commands.txt)" = "drillbit scale dev-edge --replicas 55" ]', ["scale", "--tier"]);
  put("libraries/drillbit/skills/drillbit/SKILL.md", "---\ndescription: Operate drillbit\n---\n# drillbit\n\nScale with `drillbit scale <cluster> --replicas <n>`, for example `drillbit scale x --replicas 40`.\n");
  return root;
}

/**
 * A copy of the code of this repository that run.ts and generate.ts import, laid out as the repository is, with `publicFixture()` as
 * the eval's tasks and libraries. The CLI runs in it as a person would run it, and what it writes (results/, private/) lands in it and
 * not in this repository.
 */
export function sandboxRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "agent-ab-repo-"));
  const code = (rel: string) => cpSync(join(ROOT, rel), join(root, rel), { recursive: true, filter: (src) => !/\.test\.ts$|node_modules|test_.*\.py$|__pycache__/.test(src) });
  code("lib");
  code(join("evals", "agent-ab", "src"));
  const fixture = publicFixture();
  cpSync(join(fixture, "tasks"), join(root, "evals", "agent-ab", "tasks"), { recursive: true });
  cpSync(join(fixture, "libraries"), join(root, "evals", "agent-ab", "libraries"), { recursive: true });
  mkdirSync(join(root, "evals", "agent-ab", "results"), { recursive: true });
  return root;
}

/**
 * A `uv` that is not Harbor, and a `docker` that says it is up, in `<root>/bin`. Given the job, the `uv` leaves the trial folders Harbor would
 * leave, `n_attempts` of them for each task and arm, records the environment it was started in, and exits as UV_FAKE_EXIT says.
 * UV_FAKE_MISSING leaves out the akm arm's trials of the last task, as a Harbor that stopped before it got there does. UV_FAKE_NOTHING leaves no job at all.
 * Returns the folder of the two, for PATH. The knobs are UV_* variables because those are the ones the runner passes on to Harbor.
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
const tasks = process.env.UV_FAKE_NOTHING ? [] : job.datasets[0].task_names;
tasks.forEach((task, i) => {
  for (const agent of job.agents) {
    const name = agent.name ?? "akm-opencode";
    if (process.env.UV_FAKE_MISSING && i === tasks.length - 1 && name === "akm-opencode") continue;
    for (let k = 0; k < job.n_attempts; k++) {
      const dir = join(job.jobs_dir, job.job_name, task + "__" + name + "__" + k);
      mkdirSync(join(dir, "agent"), { recursive: true });
      const trial = { task_name: task, agent_info: { name }, verifier_result: { rewards: { reward: name === "opencode" ? 0 : 1 } }, started_at: "2026-10-06T04:00:00Z", finished_at: "2026-10-06T04:05:00Z" };
      if (process.env.UV_FAKE_TIMEOUTS && i === 0 && name === "akm-opencode") { trial.exception_info = { exception_type: "AgentTimeoutError" }; }
      if (process.env.UV_FAKE_PLUGIN_DEAD && i === 1 && name === "akm-opencode") {
        trial.exception_info = { exception_type: "AgentTimeoutError" };
        trial.verifier_result = null;
        writeFileSync(join(dir, "agent", "akm_plugin_status.json"), JSON.stringify({ live: false, problem: "there is no opencode log" }));
      }
      if (name === "akm-opencode") writeFileSync(join(dir, "agent", "akm_install.json"), JSON.stringify({ akm_version: "0.9.99-test", plugin_akm_cli: "0.9.26", assets_indexed: 7, env: { AKM_CURATE_TIMEOUT: "15" } }));
      writeFileSync(join(dir, "result.json"), JSON.stringify(trial));
    }
  }
});
process.exit(Number(process.env.UV_FAKE_EXIT ?? 0));
`,
  );
  writeFileSync(join(bin, "docker"), "#!/bin/sh\nexit 0\n");
  for (const f of ["uv", "docker"]) chmodSync(join(bin, f), 0o755);
  return bin;
}
