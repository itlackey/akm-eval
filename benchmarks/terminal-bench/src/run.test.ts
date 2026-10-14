import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { commandLine } from "../../../lib/akm/akm.ts";
import { type ResolvedCorpus, resolveCorpora } from "../../../lib/corpus.ts";
import { type AkmArm, PINS, buildFingerprint, modelSettings, pinsOf, releaseArm, sha256Dir } from "../../../lib/harbor/harbor.ts";
import { endpointHost, harnessSha256, sha256Json, sha256Text } from "../../../lib/provenance.ts";
import { type Trial, buildReport } from "../../../lib/harbor/report.ts";
import { loadRunTrials } from "../../../lib/harbor/harbor.ts";
import { caseDigests, readManifest, HARNESS_VERSION } from "../../../lib/manifest.ts";
import { clearRunning } from "../../../lib/results.ts";
import { comparePair, loadRun } from "../../../scripts/compare/src/lib.ts";
import { RescoreError, readStored, rescoreFolder, rescoreRun } from "../../../scripts/rescore/src/lib.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { sandboxRepo, writeFakeHarbor } from "./fakes.ts";
import { MEASUREMENT, caseOf } from "./measurement.ts";
import { enforcedAssets, jobConfig, libraryOf, measureLibrary, otherDigests, readLock, runCorpus, selectTasks, sideBySide, summarize } from "./run.ts";

const BENCH_DIR = join(import.meta.dir, "..");
const ROOT = resolve(BENCH_DIR, "..", "..");
const lock = readLock();
// The corpora of a run, as the command line resolves them: the library is the retrieval eval's, so its custom corpus is retrieval's.
const corpora = (values: { corpus?: string; cases?: string } = {}): ResolvedCorpus[] => resolveCorpora({ eval: "retrieval", values, publicFolder: join(ROOT, "corpus") });
const PUBLIC = corpora()[0] as ResolvedCorpus;
const PRIVATE = corpora({ corpus: "custom" })[0] as ResolvedCorpus;
const CANARY = ["terminal-bench", "canary"].join("-"); // written so this file does not hold it

/** The rows of a samples.jsonl: one per task, with all its trials, the control's and the akm arm's. */
const rowsOf = (dir: string): any[] => readFileSync(join(dir, "samples.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const dirs: string[] = [];
const akmBin = process.env.AKM_BIN; // the caller's. Only the real-akm tests below, which have to be asked for, use it
// A test that counts a library sets the fake akm it wants (fakeAkm). One that forgets finds no akm, not the caller's.
beforeEach(() => {
  process.env.AKM_BIN = "no-such-akm-in-this-test";
});
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  if (akmBin === undefined) delete process.env.AKM_BIN;
  else process.env.AKM_BIN = akmBin;
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "terminal-bench-test-"));
  dirs.push(d);
  return d;
};

describe("the lock", () => {
  test("pins the dataset by digest, and names its 89 tasks and the ten of Harbor's sample", () => {
    expect(lock.registry).toBe("terminal-bench/terminal-bench-2-1");
    expect(lock.ref).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lock.licence).toBe("Apache-2.0");
    expect(Object.keys(lock.tasks)).toHaveLength(89);
    for (const digest of Object.values(lock.tasks)) expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(lock.sample).toHaveLength(10);
    for (const t of lock.sample) expect(lock.tasks[t]).toBeDefined();
  });

  test("is the only thing of the benchmark's data in this folder: no task, no solution, no test, no canary", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "results") continue;
        if (e.isDirectory()) walk(join(dir, e.name));
        else files.push(join(dir, e.name));
      }
    };
    walk(BENCH_DIR);
    for (const f of files) {
      expect(f).not.toMatch(/(instruction\.md|solve\.sh|task\.toml|test\.sh|Dockerfile)$/);
      expect(readFileSync(f, "utf8")).not.toContain(CANARY);
    }
  });
});

describe("selectTasks", () => {
  const small = { sample: ["m", "c"], tasks: { a: "", b: "", c: "", d: "", m: "", z: "" } };

  test("takes every task without a limit, the sample first and then the others by name", () => {
    expect(selectTasks(small)).toEqual(["m", "c", "a", "b", "d", "z"]);
  });

  test("takes the first N of that order, so a longer run holds the shorter one", () => {
    expect(selectTasks(small, 1)).toEqual(["m"]);
    expect(selectTasks(small, 2)).toEqual(["m", "c"]);
    expect(selectTasks(small, 4)).toEqual(["m", "c", "a", "b"]);
    expect(selectTasks(small, 50)).toEqual(selectTasks(small));
  });

  test("with the real lock, --limit 10 is Harbor's sample and a full run is all 89 tasks once", () => {
    expect(selectTasks(lock, 10)).toEqual(lock.sample);
    const all = selectTasks(lock);
    expect(all).toHaveLength(89);
    expect(new Set(all).size).toBe(89);
    expect(all.slice(0, 10)).toEqual(lock.sample);
    expect(selectTasks(lock, 25)).toEqual(all.slice(0, 25));
  });
});

describe("jobConfig", () => {
  const tasks = selectTasks(lock, 10);
  const base = { name: "terminal-bench-public", model: "openai/gpt-6-luna", lock, tasks, librariesDir: "/l", jobsDir: "/j" };
  const cfg = jobConfig({ ...base, libraryAssets: 259 }) as any;
  const [control, akm] = cfg.agents;

  test("fetches the pinned dataset by its digest, and only the tasks asked for, under their registry names", () => {
    expect(cfg.datasets).toEqual([{ name: "terminal-bench/terminal-bench-2-1", ref: lock.ref, task_names: tasks.map((t) => `terminal-bench/${t}`) }]);
    expect(cfg.datasets[0].version).toBeUndefined();
  });

  test("runs each task once per arm by default, four trials at a time, on the pins", () => {
    expect(cfg.n_attempts).toBe(1);
    expect(cfg.n_concurrent_trials).toBe(4);
    expect(control.kwargs.version).toBe(PINS.opencode);
    expect(akm.kwargs).toMatchObject({ akm_cli_version: PINS.akm_cli, akm_plugin_version: PINS.akm_plugin });
  });

  test("runs each task as many times per arm as --attempts says", () => {
    expect((jobConfig({ ...base, attempts: 5 }) as any).n_attempts).toBe(5);
  });

  test("tells the akm arm which library to seed, for every task, and how many assets akm should index in it", () => {
    expect(akm.env).toEqual({ AKM_TASK_STASH: "library" });
    expect(akm.kwargs).toMatchObject({ libraries_dir: "/l", library_assets: 259 });
    expect(JSON.stringify(control)).not.toContain("akm");
    expect(control.env).toBeUndefined();
  });

  test("asks for at least one asset when the library's were not counted", () => {
    expect((jobConfig(base) as any).agents[1].kwargs.library_assets).toBe(1);
    expect((jobConfig({ ...base, libraryAssets: null }) as any).agents[1].kwargs.library_assets).toBe(1);
  });

  test("gives the akm arm the akm under test and the extra settings, and the control arm none of it", () => {
    const arm: AkmArm = { bin: "~/akm", build: "abc", cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: PINS.akm_plugin, tarball: null }, packages: "/pack" };
    const swept = jobConfig({ ...base, arm, packagesDir: "/run/akm-packages", akmEnv: { AKM_CURATE_TIMEOUT: "30" } }) as any;
    expect(swept.agents[1].kwargs).toMatchObject({ akm_cli_version: "0.9.27", packages_dir: "/run/akm-packages", akm_package: "akm-cli-0.9.27.tgz", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(swept.agents[0]).toEqual(control);
  });

  test("keeps the task's own time limits, and holds no credential", () => {
    expect(JSON.stringify(cfg)).not.toMatch(/timeout_multiplier|override_timeout_sec|override_cpus|override_memory/);
    expect(JSON.stringify(cfg)).not.toMatch(/api_?key|token|secret/i);
  });
});

describe("summarize", () => {
  const [one, two] = lock.sample;
  const result = (task: string, agent: string, over: Record<string, unknown> = {}) => ({
    task_name: `terminal-bench/${task}`,
    task_id: { org: "terminal-bench", name: task, ref: lock.tasks[task] },
    agent_info: { name: agent },
    agent_result: { n_input_tokens: 1000, n_cache_tokens: 900, n_output_tokens: 50, cost_usd: 0.01 },
    verifier_result: { rewards: { reward: 1 } },
    exception_info: null,
    started_at: "2026-10-06T04:00:00Z",
    finished_at: "2026-10-06T04:10:00Z",
    agent_execution: { started_at: "2026-10-06T04:01:00Z", finished_at: "2026-10-06T04:09:00Z" },
    ...over,
  });

  /** A results folder as a run leaves it: one Harbor job with these trials in it. */
  function runDir(trials: Record<string, unknown>): string {
    const dir = tmp();
    for (const [name, r] of Object.entries(trials)) {
      mkdirSync(join(dir, "jobs", "terminal-bench-public", name, "agent"), { recursive: true });
      writeFileSync(join(dir, "jobs", "terminal-bench-public", name, "result.json"), JSON.stringify(r));
    }
    return dir;
  }

  test("writes the report, the dataset the trials ran and one line per task, with its trials", () => {
    const dir = runDir({
      [`${one}__a`]: result(one, "opencode", { verifier_result: { rewards: { reward: 0 } }, exception_info: { exception_type: "AgentTimeoutError" } }),
      [`${one}__b`]: result(one, "akm-opencode"),
      [`${two}__a`]: result(two, "opencode"),
      [`${two}__b`]: result(two, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "RuntimeError" } }),
    });
    const s = summarize({ corpus: PUBLIC, label: "t", model: "openai/x", limit: 10, lock, tasks: lock.sample, dir, exit: 0 });
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ eval: "terminal-bench", corpus: "public", model: "openai/x", limit: 10, n_tasks: 10, attempts: 1, harbor_exit: 0 });
    expect(stored.dataset).toEqual({ name: lock.registry, ref: lock.ref, source: lock.source, licence: lock.licence, tasks_in_dataset: 89, tasks_run_with_another_digest: [] });
    expect(stored.library).toEqual({ path: "corpus/library", assets: null, measured_with: null, sha256: null });
    expect(stored.results_dir).toBeUndefined();
    expect(s.report.control).toMatchObject({ trials: 2, scored: 2, timeouts: 1, passed: 1 });
    expect(s.report.akm).toMatchObject({ trials: 2, scored: 1, errored: 1 });
    expect(rowsOf(dir).map((r) => [r.id, r.trials.length])).toEqual([[one, 2], [two, 2]]);
  });

  test("names the akm as the other evals do, the settings it ran with, and what the run was made of", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode"), [`${one}__b`]: result(one, "akm-opencode") });
    const arm: AkmArm = { bin: "~/code/akm", build: "v0.9.27-3-gabc-dirty", build_fingerprint: "e".repeat(64), cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: PINS.akm_plugin, tarball: null }, packages: "/p" };
    writeFileSync(join(dir, "jobs", "terminal-bench-public", `${one}__b`, "agent", "akm_install.json"), JSON.stringify({ akm_version: "0.9.27", plugin_akm_cli: "0.9.26", assets_indexed: 259, env: { AKM_CURATE_TIMEOUT: "30" } }));
    const library = { assets: 259, measured_with: { akm_version: "0.9.26", akm_bin: "akm", akm_build: null }, sha256: "ab".repeat(32) };
    const s = summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one], dir, exit: 0, attempts: 3, arm, akmEnv: { AKM_CURATE_TIMEOUT: "30" }, packages: [{ file: "akm-cli-0.9.27.tgz", sha256: "0".repeat(64) }], library, job: { n_attempts: 3 } });
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ attempts: 3, akm_version: "0.9.27", akm_bin: "~/code/akm", akm_build: "v0.9.27-3-gabc-dirty", akm_build_fingerprint: "e".repeat(64), akm_env: { AKM_CURATE_TIMEOUT: "30" }, job: { n_attempts: 3 } });
    expect(stored.pins).toEqual(pinsOf(arm));
    expect(stored.pins.akm_cli).toBe("0.9.27");
    expect(stored.akm_install).toMatchObject({ from: "checkout", plugin_from: "release", packages: [{ file: "akm-cli-0.9.27.tgz" }], observed: { akm_version: ["0.9.27"], plugin_akm_cli: ["0.9.26"], assets_indexed: [259], env: { AKM_CURATE_TIMEOUT: "30" } } });
    expect(stored.library).toEqual({ path: "corpus/library", ...library });
    expect(s.results_dir).toBe(dir);
  });

  test("carries the keys --repeat needs, with the numbers of the report in metrics", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode", { verifier_result: { rewards: { reward: 0 } } }), [`${one}__b`]: result(one, "akm-opencode") });
    summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one], dir, exit: 0 });
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    for (const key of ["eval", "corpus", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "harness_sha256", "status", "aborted_reason", "n_errored", "metrics"]) expect(Object.hasOwn(stored, key)).toBe(true);
    expect(stored.akm_version).toBe(PINS.akm_cli);
    expect(stored.akm_bin).toBe(`akm-cli@${PINS.akm_cli}`);
    expect(stored.akm_build).toBeNull();
    expect(stored.akm_build_fingerprint).toBeNull(); // a release has no checkout to fingerprint
    expect(stored.harness_sha256).toMatch(/^[0-9a-f]{64}$/); // the digest of this benchmark's code, the retrieval code it imports and lib/
    expect(stored.harness_sha256).toBe(harnessSha256(import.meta.dir, { also: [resolve(import.meta.dir, "..", "..", "..", "evals", "retrieval", "src")] }));
    expect(stored.n_errored).toBe(0);
    expect(stored.metrics).toMatchObject({ control: { pass_rate: 0 }, akm: { pass_rate: 1 }, delta: { value: 1, n: 1 }, engagement: { control_calls: 0 } });
    expect(stored.report.delta.value).toBe(stored.metrics.delta.value);
  });

  test("counts the trials that ran out of time apart from the errors, and marks their rows", () => {
    const dir = runDir({
      [`${one}__a`]: result(one, "opencode", { exception_info: { exception_type: "AgentTimeoutError" } }), // verified all the same
      [`${one}__b`]: result(one, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "AgentSetupTimeoutError" } }), // a slow akm install
      [`${two}__a`]: result(two, "opencode"),
      [`${two}__b`]: result(two, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "RuntimeError" } }),
    });
    const s = summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one, two], dir, exit: 0 });
    expect(s.timeouts).toEqual({ control: 1, akm: 1 });
    expect(s.metrics.control.timeouts).toBe(1);
    expect(s.metrics.akm.timeouts).toBe(1);
    expect(s.n_errored).toBe(2); // the two akm trials that got no reward, the slow install among them
    const rows = rowsOf(dir).flatMap((r) => r.trials);
    expect(rows.map((r) => [r.arm, r.task === one, r.timed_out])).toEqual([
      ["control", true, true],
      ["akm", true, true],
      ["control", false, false],
      ["akm", false, false],
    ]);
  });

  test("shows a plugin failure that a time-out hid: its exception, no reward, and a count of it", () => {
    const dir = runDir({
      [`${one}__a`]: result(one, "opencode"),
      [`${one}__b`]: result(one, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "AgentTimeoutError" } }),
    });
    writeFileSync(join(dir, "jobs", "terminal-bench-public", `${one}__b`, "agent", "akm_plugin_status.json"), JSON.stringify({ live: false, problem: "the plugin never logged 'AKM user feedback recorded'" }));
    const s = summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one], dir, exit: 0 });
    expect(s.report.akm.exceptions).toEqual({ AkmPluginNotLoadedError: 1 });
    expect(s.report.akm).toMatchObject({ errored: 1, scored: 0 });
    expect(s.timeouts.akm).toBe(1);
    const row = rowsOf(dir)[0].trials[1];
    expect(row).toMatchObject({ arm: "akm", error: "AkmPluginNotLoadedError", reward: null, timed_out: true, plugin_problem: "the plugin never logged 'AKM user feedback recorded'" });
  });

  test("says the run finished when Harbor exited 0 and every cell of the grid has a trial, errored ones included, and counts the cells", () => {
    const dir = runDir({
      [`${one}__a`]: result(one, "opencode"),
      [`${one}__b`]: result(one, "akm-opencode"),
      [`${two}__a`]: result(two, "opencode", { exception_info: { exception_type: "AgentTimeoutError" } }),
      [`${two}__b`]: result(two, "akm-opencode", { verifier_result: null, exception_info: { exception_type: "RuntimeError" } }),
    });
    const s = summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one, two], dir, exit: 0 });
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored).toMatchObject({ status: "complete", aborted_reason: null, harbor_exit: 0 });
    expect(stored.completion).toEqual({
      expected: 4,
      completed: 2,
      failed: 2,
      missing: 0,
      unexpected: 0,
      control: { expected: 2, completed: 1, failed: 1, missing: 0, unexpected: 0 }, // the second task timed out, though it was verified
      akm: { expected: 2, completed: 1, failed: 1, missing: 0, unexpected: 0 },
    });
    expect(s.status).toBe("complete");
  });

  test("a cell with no trial makes the run aborted, with the counts, even when Harbor exited 0; and a nonzero exit does, even with every cell there", () => {
    const trials = (...names: [string, string][]) => Object.fromEntries(names.map(([task, agent], i) => [`${task}__${i}`, result(task, agent)]));
    const three = trials([one, "opencode"], [one, "akm-opencode"], [two, "opencode"]);
    const cut = summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one, two], dir: runDir(three), exit: 0, attempts: 1 });
    expect(cut).toMatchObject({ status: "aborted", aborted_reason: "1 of 4 expected trials have no result (control 0, akm 1)", harbor_exit: 0 });
    expect(cut.completion).toMatchObject({ expected: 4, completed: 3, failed: 0, missing: 1, control: { missing: 0 }, akm: { completed: 1, missing: 1 } });
    expect(rowsOf(cut.results_dir).map((r) => [r.id, r.trials.length])).toEqual([[one, 2], [two, 1]]); // what finished is kept
    const four = trials([one, "opencode"], [one, "akm-opencode"], [two, "opencode"], [two, "akm-opencode"]);
    expect(summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one, two], dir: runDir(four), exit: 1 })).toMatchObject({ status: "aborted", aborted_reason: "Harbor exited 1", completion: { missing: 0 } });
  });

  test("expects each task once per arm for every attempt asked for", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode"), [`${one}__b`]: result(one, "akm-opencode") });
    const s = summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one], dir, exit: 0, attempts: 3 });
    expect(s.completion).toMatchObject({ expected: 6, completed: 2, missing: 4, control: { expected: 3, missing: 2 }, akm: { expected: 3, missing: 2 } });
    expect(s.status).toBe("aborted");
  });

  test("writes the model with the host of its endpoint and no key, and the job config with its secrets redacted", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode") });
    const job = { n_attempts: 1, agents: [{ name: "opencode", kwargs: { version: "1", api_key: "sk-job-key", opencode_config: { provider: { openai: { options: { apiKey: "sk-nested", baseURL: "$MODEL_BASE_URL", token: "$MODEL_TOKEN" } } } } } }] };
    summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one], dir, exit: 0, endpoint: endpointHost("http://gateway.example.com:8080/v1"), job });
    const stored = JSON.parse(readFileSync(join(dir, "summary.json"), "utf8"));
    expect(stored.engine).toEqual({ model: "openai/x", endpoint: "http://gateway.example.com:8080" });
    expect(stored.config.agents[0].kwargs.api_key).toBe("<redacted>");
    expect(stored.config.agents[0].kwargs.opencode_config.provider.openai.options).toEqual({ apiKey: "<redacted>", baseURL: "$MODEL_BASE_URL", token: "$MODEL_TOKEN" }); // a $NAME reference holds no secret
    expect(JSON.stringify(stored.config)).not.toMatch(/sk-job-key|sk-nested/);
    const bare = summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one], dir: runDir({}), exit: 0 });
    expect(bare.engine).toEqual({ model: "openai/x", endpoint: null });
    expect(bare.config).toEqual({});
  });

  test("assets_sha256 changes with the library, the selected tasks, the pinned dataset and the attempts, and with nothing else", () => {
    const sha = (over: Partial<Parameters<typeof summarize>[0]> = {}) => {
      const library = { assets: 259, measured_with: null, sha256: "ab".repeat(32) };
      return summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: [one, two], dir: runDir({}), exit: 0, attempts: 1, library, ...over });
    };
    const base = sha();
    expect(base.assets_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(base.library.sha256).toBe("ab".repeat(32)); // the component stays, to say which part moved

    expect(sha({ library: { assets: 259, measured_with: null, sha256: "cd".repeat(32) } }).assets_sha256).not.toBe(base.assets_sha256); // the library
    expect(sha({ tasks: [one] }).assets_sha256).not.toBe(base.assets_sha256); // the selected tasks
    expect(sha({ tasks: lock.sample.slice(0, 3) }).assets_sha256).not.toBe(base.assets_sha256);
    expect(sha({ attempts: 2 }).assets_sha256).not.toBe(base.assets_sha256); // the attempts
    expect(sha({ lock: { ...lock, ref: `sha256:${"1".repeat(64)}` } }).assets_sha256).not.toBe(base.assets_sha256); // the pinned dataset
    expect(sha({ lock: { ...lock, tasks: { ...lock.tasks, [two]: `sha256:${"2".repeat(64)}` } } }).assets_sha256).not.toBe(base.assets_sha256); // a selected task's digest
    expect(sha({ library: { assets: 1, measured_with: null, sha256: null } }).assets_sha256).not.toBe(base.assets_sha256); // no digest of the library

    expect(sha({ tasks: [two, one] }).assets_sha256).toBe(base.assets_sha256);
    expect(sha({ lock: { ...lock, tasks: { ...lock.tasks, [lock.sample[5]]: `sha256:${"3".repeat(64)}` } } }).assets_sha256).toBe(base.assets_sha256); // a task that was not selected
    expect(sha({ model: "openai/y", label: "other", exit: 1, limit: 2, library: { assets: 7, measured_with: null, sha256: "ab".repeat(32) } }).assets_sha256).toBe(base.assets_sha256); // the model, the label and the count of assets are other settings
  });

  test("names a task that ran with a digest other than the lock's", () => {
    const dir = runDir({ [`${one}__a`]: result(one, "opencode", { task_id: { org: "terminal-bench", name: one, ref: `sha256:${"0".repeat(64)}` } }), [`${two}__a`]: result(two, "opencode") });
    expect(summarize({ corpus: PUBLIC, label: "t", model: "openai/x", lock, tasks: lock.sample, dir, exit: 0 }).dataset.tasks_run_with_another_digest).toEqual([one]);
  });
});

/** An akm that counts as a fake does: every .md file in the bundle is a skill, and there are five facts, which are the scaffold's. */
const FAKE_AKM = `
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const walk = (dir: string): number => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".md") ? 1 : 0), 0);
if (process.env.FAKE_AKM_FAIL === args[0]) { console.error("akm cannot " + args[0]); process.exit(3); }
if (args[0] === "--version") console.log("akm " + (process.env.FAKE_AKM_VERSION ?? "0.9.99-test"));
else if (args[0] === "bundle") mkdirSync(args[args.indexOf("--dir") + 1], { recursive: true });
else if (args[0] === "index") {}
else if (args[0] === "info") console.log(JSON.stringify({ indexStats: { byType: { skill: walk(process.env.AKM_BUNDLE_DIR as string), fact: 5 } } }));
else { console.error("unknown command " + args[0]); process.exit(1); }
`;

/** Points AKM_BIN at the fake akm, or at no akm at all. */
function fakeAkm(fake: boolean): void {
  if (!fake) {
    process.env.AKM_BIN = "no-such-akm-in-this-test";
    return;
  }
  const script = join(tmp(), "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  process.env.AKM_BIN = commandLine(["bun", script]);
}

const mdFilesIn = (dir: string): number => readdirSync(dir, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? mdFilesIn(join(dir, e.name)) : e.name.endsWith(".md") ? 1 : 0), 0);
/** The .md files in the type folders of a library, as the fake akm counts them. Loose files are not copied into a bundle. */
const fakeCount = (library: string): number => readdirSync(library, { withFileTypes: true }).filter((e) => e.isDirectory()).reduce((n, e) => n + mdFilesIn(join(library, e.name)), 0);

describe("measureLibrary", () => {
  function library(): string {
    const dir = tmp();
    for (const [file, text] of Object.entries({ "skills/a/SKILL.md": "a", "skills/a/ref.md": "r", "agents/x.md": "x", "scripts/s.sh": "echo", "README.md": "loose" })) {
      mkdirSync(join(dir, file, ".."), { recursive: true });
      writeFileSync(join(dir, file), text);
    }
    return dir;
  }

  test("counts the assets akm indexes in the type folders of the library, and leaves the scaffold's facts out", async () => {
    fakeAkm(true);
    const lib = library();
    const m = await measureLibrary(lib);
    expect(m.assets).toBe(3); // three .md files in type folders. The README is loose, the script is no .md, the five facts are the scaffold's
    expect(m.reason).toBeUndefined();
    expect(m.measured_with).toMatchObject({ akm_version: "0.9.99-test", akm_build: null });
    expect(m.measured_with?.akm_bin).toContain("fake-akm.ts");
    writeFileSync(join(lib, "agents", "y.md"), "y"); // a library edit changes the count, with no constant to keep in step
    expect((await measureLibrary(lib)).assets).toBe(4);
    rmSync(join(lib, "skills"), { recursive: true });
    expect((await measureLibrary(lib)).assets).toBe(2);
  });

  test("is null, with the reason, when there is no akm to count with or it cannot index", async () => {
    fakeAkm(false);
    const none = await measureLibrary(library());
    expect(none).toMatchObject({ assets: null, measured_with: null });
    expect(none.reason).toContain("could not run");
    fakeAkm(true);
    process.env.FAKE_AKM_FAIL = "index";
    try {
      const broken = await measureLibrary(library());
      expect(broken).toMatchObject({ assets: null, measured_with: null });
      expect(broken.reason).toContain("akm index failed (exit 3): akm cannot index");
    } finally {
      delete process.env.FAKE_AKM_FAIL;
    }
  });
});

describe("enforcedAssets", () => {
  const counted = (version: string) => ({ assets: 259, measured_with: { akm_version: version, akm_bin: "akm", akm_build: null } });
  const arm = (version: string) => ({ cli: { version, tarball: null } });

  test("is the count when the akm arm installs the version that counted it, and nothing to enforce when it installs another", () => {
    expect(enforcedAssets(counted("0.9.26"), arm("0.9.26"))).toBe(259);
    expect(enforcedAssets(counted("0.9.30"), arm("0.9.26"))).toBeNull();
    expect(enforcedAssets(counted("0.10.0"), arm("0.9.26"))).toBeNull();
    expect(enforcedAssets(counted("0.9.26"), arm("0.9.26-rc.1"))).toBeNull(); // a pre-release is not the release
  });

  test("is nothing to enforce when no akm counted", () => {
    expect(enforcedAssets({ assets: null, measured_with: null }, arm("0.9.26"))).toBeNull();
  });
});

describe("runCorpus", () => {
  /** A `uv` that is not Harbor (see fakes.ts), with the environment to start the runner in. */
  function fakeUv(): { root: string; env: Record<string, string> } {
    const root = tmp();
    return { root, env: { PATH: `${writeFakeHarbor(root)}:${process.env.PATH}` } };
  }

  /** Runs `f` with the console quiet. Pass `warnings` to get what it warned. */
  async function quiet<T>(f: () => Promise<T>, warnings: string[] = []): Promise<T> {
    const log = console.log;
    const warn = console.warn;
    console.log = () => {};
    console.warn = (...a: unknown[]) => void warnings.push(a.join(" "));
    try {
      return await f();
    } finally {
      console.log = log;
      console.warn = warn;
    }
  }

  const readJson = (file: string) => JSON.parse(readFileSync(file, "utf8"));

  test("writes the job, stages the library, runs Harbor and leaves the summary", async () => {
    fakeAkm(true);
    const { root, env } = fakeUv();
    const modelLimits = { context: 32768, output: 4096 };
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", modelLimits, label: "t", limit: 2, env }, join(root, "results")));
    for (const agent of JSON.parse(readFileSync(join(s.results_dir, "summary.json"), "utf8")).config.agents) expect(agent.kwargs.opencode_config.provider.openai.models.x.limit).toEqual(modelLimits);
    const dir = s.results_dir;
    expect(dir).toMatch(/results\/\d{4}-\d{2}-\d{2}-t$/);
    const job = readJson(join(dir, "job.json"));
    expect(job.datasets[0].task_names).toEqual(lock.sample.slice(0, 2).map((t) => `terminal-bench/${t}`));
    expect(job.agents[1].kwargs.libraries_dir).toBe(join(dir, "libraries"));
    expect(readdirSync(join(dir, "libraries"))).toEqual(["library"]);
    expect(existsSync(join(dir, "libraries", "library", "skills"))).toBe(true);
    expect(s.report.control).toMatchObject({ trials: 2, passed: 0 });
    expect(s.report.akm).toMatchObject({ trials: 2, passed: 2 });
    expect(readJson(join(dir, "summary.json"))).toMatchObject({ eval: "terminal-bench", corpus: "public", limit: 2, n_tasks: 2, attempts: 1, harbor_exit: 0 });
  });

  test("records that the run finished, the model's endpoint without its key, the config and the digest of the cases", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const withKey = { ...env, OPENAI_API_KEY: "sk-model-key", OPENAI_BASE_URL: "http://user:hunter2@192.0.2.5:8080/v1" };
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 2, env: withKey }, join(root, "results")));
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored).toMatchObject({ status: "complete", aborted_reason: null, harbor_exit: 0 });
    expect(stored.completion).toMatchObject({ expected: 4, completed: 4, failed: 0, missing: 0, control: { expected: 2 }, akm: { expected: 2 } });
    expect(stored.engine).toEqual({ model: "openai/x", endpoint: "http://192.0.2.5:8080" });
    expect(stored.corpus_folder).toBeNull(); // a public run has no folder to record
    expect(stored.config).toEqual(stored.job);
    expect(JSON.stringify(stored)).not.toMatch(/sk-model-key|hunter2/);
    expect(stored.assets_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.library.sha256).toBe(sha256Dir(libraryOf(PUBLIC))); // the component stays
    const more = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "m", limit: 3, env }, join(root, "results")));
    const again = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "a", limit: 2, env }, join(root, "results")));
    const attempts = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "n", limit: 2, attempts: 2, env }, join(root, "results")));
    expect(more.report.control.trials).toBe(3); // the tasks selected are not the same
    expect(readJson(join(more.results_dir, "summary.json")).assets_sha256).not.toBe(stored.assets_sha256);
    expect(readJson(join(attempts.results_dir, "summary.json")).assets_sha256).not.toBe(stored.assets_sha256); // other attempts
    expect(readJson(join(again.results_dir, "summary.json")).assets_sha256).toBe(stored.assets_sha256); // a rerun of the same
  });

  test("writes a manifest that says what the run was made of: the cases with their digests, the parts, the engine, the attempts and which tasks were scored", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "m", limit: 3, attempts: 2, env: { ...env, OPENAI_API_KEY: "sk-model-key", OPENAI_BASE_URL: "http://192.0.2.5:8080/v1" } }, join(root, "results")));
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(readManifest(stored).kind).toBe("manifest");
    const m = stored.manifest;
    const tasks = selectTasks(lock, 3);
    const parts = { harness_version: HARNESS_VERSION, collector: { version: MEASUREMENT.version } };
    expect(m).toMatchObject({ eval: "terminal-bench", corpus: "public", collection: null, mode: null, harness_version: parts.harness_version, collector: parts.collector });
    expect(m.akm).toEqual({ version: PINS.akm_cli, bin: `akm-cli@${PINS.akm_cli}`, build: null, build_fingerprint: stored.akm_build_fingerprint });
    expect(m.engines).toEqual({ opencode: { model: "openai/x", endpoint: "http://192.0.2.5:8080", temperature: null, enableThinking: null, timeoutMs: null } });
    expect(m.treatment_hints).toEqual({ attempts: 2 }); // a run of one attempt is not compared with a run of two
    expect(m.settings).toEqual({ strategy: null, config_patch_sha256: null, timeout_ms: null, seed: null });
    expect(m.config.redacted.datasets).toBeUndefined(); // the tasks are the cases
    // what each task presented to the agent: the task as the pinned dataset has it, and the library the akm arm seeded. The scorer reads nothing of the case.
    const library = stored.library.sha256;
    expect(library).toBe(sha256Dir(libraryOf(PUBLIC)));
    expect(Object.keys(m.cases).sort()).toEqual([...tasks].sort());
    for (const t of tasks) expect(m.cases[t]).toEqual({ input_sha256: sha256Json({ task_digest: lock.tasks[t], library_sha256: library }), label_sha256: sha256Json({}) });
    expect(m.cases).toEqual(caseDigests(MEASUREMENT, tasks.map((t) => caseOf(t, lock.tasks[t], library))));
    expect(m.completion).toEqual({ selected: tasks, scored: tasks, errored: [] });
    // one row per task in samples.jsonl, each with its trials: two attempts in each of the two arms
    expect(rowsOf(s.results_dir).map((r) => [r.id, r.trials.length, r.paired])).toEqual(tasks.map((t) => [t, 4, true]));
  });

  test("lists a task with a trial in one arm only as selected and not scored, and the tasks Harbor never started as selected only", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const tasks = selectTasks(lock, 2);
    await expect(quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "c", limit: 2, env: { ...env, UV_FAKE_MISSING: "1" } }, join(root, "results")))).rejects.toThrow("have no result");
    const cut = readdirSync(join(root, "results")).find((d) => d.endsWith("-c")) as string;
    expect(readJson(join(root, "results", cut, "summary.json")).manifest.completion).toEqual({ selected: tasks, scored: tasks.slice(0, 1), errored: tasks.slice(1) }); // the last task has the control's trial only
    await expect(quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "n", limit: 2, env: { ...env, UV_FAKE_NOTHING: "1" } }, join(root, "results")))).rejects.toThrow("Harbor wrote no job");
    const none = readdirSync(join(root, "results")).find((d) => d.endsWith("-n")) as string;
    expect(readJson(join(root, "results", none, "summary.json")).manifest.completion).toEqual({ selected: tasks, scored: [], errored: [] });
  });

  test("scores the trials to the report the code before the split gave them (buildReport over the trials in Harbor's order), and rescore gives it back from the stored rows", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "r", limit: 3, env: { ...env, UV_FAKE_TIMEOUTS: "1", UV_FAKE_PLUGIN_DEAD: "1" } }, join(root, "results")));
    clearRunning(s.results_dir); // a single run leaves its marker to the exit of the process, and a folder that is still being written is not rescored
    const trials = loadRunTrials(join(s.results_dir, "jobs", "terminal-bench-public")).trials;
    expect(s.report).toEqual(buildReport(trials));
    const stored = readJson(join(s.results_dir, "summary.json"));
    const before = readFileSync(join(s.results_dir, "summary.json"), "utf8");
    const { out, result } = rescoreFolder(s.results_dir);
    expect(out).toBe(`${s.results_dir}-rescored`);
    expect(result.changed).toEqual([]);
    const again = readJson(join(out, "summary.json"));
    for (const key of ["report", "metrics", "timeouts", "n_errored"]) expect(again[key], key).toEqual(stored[key]);
    expect(readFileSync(join(out, "samples.jsonl"), "utf8")).toBe(readFileSync(join(s.results_dir, "samples.jsonl"), "utf8"));
    expect(again.manifest.rescored_from).toMatchObject({ results: basename(s.results_dir), dropped: [] });
    expect(again.manifest.collector).toEqual(stored.manifest.collector);
    expect(again.manifest.cases).toEqual(stored.manifest.cases);
    expect(again.manifest.completion).toEqual(stored.manifest.completion);
    expect(readManifest(again).kind).toBe("manifest");
    expect(readFileSync(join(s.results_dir, "summary.json"), "utf8")).toBe(before); // the original is not touched
  });

  test("rescore reads the verdicts from the raw trials in the rows and not from the numbers stored beside them", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "e", limit: 3, env }, join(root, "results")));
    clearRunning(s.results_dir);
    const stored = readStored(s.results_dir);
    // the control passes the first task: change the reward of its trial, as a different scorer or verifier output would
    const edited = stored.rows.map((row, i) => (i === 0 ? { ...row, trials: row.trials.map((t: any) => (t.arm === "control" ? { ...t, reward: 1 } : t)) } : row));
    const result = rescoreRun({ ...stored, rows: edited });
    expect(result.changed).toEqual([stored.rows[0]?.id]);
    expect(result.summary.metrics.control.passed).toBe(stored.summary.metrics.control.passed + 1);
    expect(result.rows[0]).toMatchObject({ control: { passed: 1 } });
    expect(result.summary.report.control.passed).toBe(result.summary.metrics.control.passed);
  });

  test("a path segment of the model's URL is in no file of the results folder, and two deployments on one host are the same endpoint (#65)", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const summaries: Record<string, any>[] = [];
    for (const [label, path] of [["a", "k-DUMMYSECRET0123/v1"], ["b", "k-OTHERDEPLOYMENT456/v1"]]) {
      const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label, limit: 1, env: { ...env, OPENAI_API_KEY: "sk-model-key", OPENAI_BASE_URL: `https://gateway.example/${path}` } }, join(root, "results")));
      summaries.push(readJson(join(s.results_dir, "summary.json")));
      for (const file of ["summary.json", "samples.jsonl", "job.json"]) expect(readFileSync(join(s.results_dir, file), "utf8"), file).not.toMatch(/DUMMYSECRET0123|OTHERDEPLOYMENT456/);
    }
    expect(summaries.map((s) => s.engine.endpoint)).toEqual(["https://gateway.example", "https://gateway.example"]);
    expect((summaries[0] as any).manifest.engines).toEqual((summaries[1] as any).manifest.engines);
  });

  test("a Harbor that leaves one cell missing and exits 1 leaves an aborted summary with the counts and all its artifacts, and the run ends with an error", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const results = join(root, "results");
    const reason = "Harbor exited 1; 1 of 4 expected trials have no result (control 0, akm 1)";
    await expect(quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 2, env: { ...env, UV_FAKE_MISSING: "1", UV_FAKE_EXIT: "1" } }, results))).rejects.toMatchObject({ code: 1, message: expect.stringContaining(reason) });
    const [run] = readdirSync(results);
    const dir = join(results, run);
    const stored = readJson(join(dir, "summary.json"));
    expect(stored).toMatchObject({ status: "aborted", aborted_reason: reason, harbor_exit: 1 });
    expect(stored.completion).toEqual({
      expected: 4,
      completed: 3,
      failed: 0,
      missing: 1,
      unexpected: 0,
      control: { expected: 2, completed: 2, failed: 0, missing: 0, unexpected: 0 },
      akm: { expected: 2, completed: 1, failed: 0, missing: 1, unexpected: 0 },
    });
    for (const kept of ["job.json", "harbor.log", "samples.jsonl", "jobs", "libraries"]) expect(existsSync(join(dir, kept)), kept).toBe(true);
    expect(rowsOf(dir).flatMap((r) => r.trials)).toHaveLength(3); // the trials that finished
  });

  test("a cell missing aborts the run even when Harbor exited 0, and a full grid with errored trials does not", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    await expect(quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "m", limit: 2, env: { ...env, UV_FAKE_MISSING: "1" } }, join(root, "results")))).rejects.toThrow("1 of 4 expected trials have no result (control 0, akm 1)");
    const errored = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "e", limit: 2, env: { ...env, UV_FAKE_TIMEOUTS: "1" } }, join(root, "results")));
    expect(errored).toMatchObject({ status: "complete", aborted_reason: null, n_errored: 1 });
    expect(errored.completion).toMatchObject({ expected: 4, completed: 2, failed: 2, missing: 0 });
  });

  test("counts the library's assets on the host, tells the akm arm the number when it installs the same akm, and records it with the akm that counted and a digest of the library", async () => {
    fakeAkm(true);
    const { root, env } = fakeUv();
    const arm = releaseArm("0.9.99-test"); // the version the fake akm prints
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 1, env, arm }, join(root, "results")));
    const want = fakeCount(libraryOf(PUBLIC));
    expect(want).toBeGreaterThan(0);
    expect(readJson(join(s.results_dir, "job.json")).agents[1].kwargs.library_assets).toBe(want);
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored.library).toMatchObject({ path: "corpus/library", assets: want, measured_with: { akm_version: "0.9.99-test" } });
    expect(stored.library.sha256).toBe(sha256Dir(libraryOf(PUBLIC)));
    expect(stored.library.sha256).toBe(sha256Dir(join(s.results_dir, "libraries", "library")));
  });

  test("asks only for a non-empty index when the akm arm installs another version than the one that counted, keeps the count, and warns", async () => {
    fakeAkm(true); // the fake akm prints 0.9.99-test, and the default arm installs the pinned akm-cli
    const { root, env } = fakeUv();
    const said: string[] = [];
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 1, env }, join(root, "results")), said);
    const want = fakeCount(libraryOf(PUBLIC));
    expect(want).toBeGreaterThan(1);
    expect(readJson(join(s.results_dir, "job.json")).agents[1].kwargs).toMatchObject({ akm_cli_version: PINS.akm_cli, library_assets: 1 });
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored.library).toMatchObject({ assets: want, measured_with: { akm_version: "0.9.99-test" } }); // the count is still recorded
    expect(stored.job.agents[1].kwargs).not.toHaveProperty("library_assets"); // Harbor was given it (job.json above), the summary's config does not hold it
    expect(stored.config.agents[1].kwargs).not.toHaveProperty("library_assets");
    expect(said).toHaveLength(1);
    expect(said[0]).toContain(`the ${want} assets of the library were counted with akm 0.9.99-test, and the akm arm installs akm ${PINS.akm_cli}`);
    expect(said[0]).toContain("akm_install.observed.assets_indexed");
  });

  test("holds a checkout's akm to the count when it is the version that counted, and says nothing", async () => {
    fakeAkm(true);
    process.env.FAKE_AKM_VERSION = "0.9.27";
    const { root, env } = fakeUv();
    const packs = tmp();
    writeFileSync(join(packs, "akm-cli-0.9.27.tgz"), "an akm");
    const arm: AkmArm = { bin: "~/code/akm", build: null, cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: PINS.akm_plugin, tarball: null }, packages: packs };
    const said: string[] = [];
    try {
      const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 1, env, arm }, join(root, "results")), said);
      expect(readJson(join(s.results_dir, "job.json")).agents[1].kwargs.library_assets).toBe(fakeCount(libraryOf(PUBLIC)));
    } finally {
      delete process.env.FAKE_AKM_VERSION;
    }
    expect(said).toEqual([]);
  });

  test("asks only for a non-empty index, and says it did not count, when no akm can count", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 1, env }, join(root, "results")));
    expect(readJson(join(s.results_dir, "job.json")).agents[1].kwargs.library_assets).toBe(1);
    expect(readJson(join(s.results_dir, "summary.json")).library).toMatchObject({ assets: null, measured_with: null });
  });

  test("the host count remains recorded and different install settings do not block comparison (#73)", async () => {
    fakeAkm(true); // counts with 0.9.99-test
    const { root, env } = fakeUv();
    const results = join(root, "results");
    // The first run installs the pinned akm-cli, which is not the akm that counted: library_assets is 1. The second installs the one that counted: the count.
    const other = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "a", limit: 1, env }, results));
    const same = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "b", limit: 1, env, arm: releaseArm("0.9.99-test") }, results));
    const assets = (dir: string) => readJson(join(dir, "job.json")).agents[1].kwargs.library_assets;
    expect([assets(other.results_dir), assets(same.results_dir)]).toEqual([1, fakeCount(libraryOf(PUBLIC))]);
    const [a, b] = [other, same].map((r) => readJson(join(r.results_dir, "summary.json")));
    for (const summary of [a, b]) expect(summary.manifest.config.sha256).toMatch(/^[0-9a-f]{64}$/);
    for (const run of [other, same]) clearRunning(run.results_dir);
    expect(() => comparePair(loadRun(other.results_dir), loadRun(same.results_dir))).not.toThrow();
  });

  test("records the digest of the dependency tree the akm containers installed, in akm_install and in the build identity, and aborts a run whose containers differ (#68)", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 2, env }, join(root, "results")));
    const tree = "ee".repeat(32);
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored.akm_install).toMatchObject({ dependency_tree_sha256: tree, locked: true });
    expect(stored.akm_install.observed).toMatchObject({ dependency_trees: [tree], lockfiles: { akm_cli: "a".repeat(64), plugin: "b".repeat(64) } });
    expect(stored.akm_build_fingerprint).toBe(buildFingerprint(null, tree));
    expect(stored.manifest.akm.build_fingerprint).toBe(stored.akm_build_fingerprint); // what the comparison reads
    await expect(quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "d", limit: 2, env: { ...env, UV_FAKE_TREES: "differ" } }, join(root, "results")))).rejects.toThrow("the akm arm's containers installed 2 different dependency trees");
    const [run] = readdirSync(join(root, "results")).filter((n) => n.endsWith("-d"));
    expect(readJson(join(root, "results", run, "summary.json"))).toMatchObject({ status: "aborted", akm_install: { dependency_tree_sha256: null } });
  });

  test("runs each task as many times as --attempts says, and records it", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 1, env, attempts: 4 }, join(root, "results")));
    expect(readJson(join(s.results_dir, "job.json")).n_attempts).toBe(4);
    expect(s.attempts).toBe(4);
    expect(readJson(join(s.results_dir, "summary.json")).attempts).toBe(4);
    expect(readJson(join(s.results_dir, "summary.json")).job).toMatchObject({ n_attempts: 4, n_concurrent_trials: 4 });
  });

  test("installs the akm --akm names, keeps a copy of its tarballs with the run, and records the settings it ran with", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const packs = tmp();
    writeFileSync(join(packs, "akm-cli-0.9.27.tgz"), "an akm");
    const arm: AkmArm = { bin: "~/code/akm", build: "v0.9.27-3-gabc", cli: { version: "0.9.27", tarball: "akm-cli-0.9.27.tgz" }, plugin: { version: PINS.akm_plugin, tarball: null }, packages: packs };
    const s = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 1, env, arm, akmEnv: { AKM_CURATE_TIMEOUT: "30" } }, join(root, "results")));
    const kwargs = readJson(join(s.results_dir, "job.json")).agents[1].kwargs;
    expect(kwargs).toMatchObject({ akm_cli_version: "0.9.27", akm_package: "akm-cli-0.9.27.tgz", packages_dir: join(s.results_dir, "akm-packages"), akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(readFileSync(join(s.results_dir, "akm-packages", "akm-cli-0.9.27.tgz"), "utf8")).toBe("an akm");
    const stored = readJson(join(s.results_dir, "summary.json"));
    expect(stored).toMatchObject({ akm_version: "0.9.27", akm_bin: "~/code/akm", akm_build: "v0.9.27-3-gabc", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(stored.akm_install.packages).toEqual([{ file: "akm-cli-0.9.27.tgz", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) }]);
    expect(stored.akm_install.observed).toMatchObject({ akm_version: ["0.9.99-test"], assets_indexed: [7] });
    expect(stored.job.agents[1].kwargs).toMatchObject({ packages_dir: "akm-packages", libraries_dir: "libraries", akm_env: { AKM_CURATE_TIMEOUT: "30" } });
    expect(JSON.stringify(stored.job)).not.toContain(root); // no folder of this machine
  });

  test("starts Harbor with the model's variables and what Harbor needs, and not the judge's key or the rest of the host's", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const host = { MODEL_NAME: "openai/x", MODEL_API_KEY: "model-key", MODEL_BASE_URL: "http://192.0.2.5/v1", JUDGE_API_KEY: "judge-secret", AKM_BIN: "akm", ANTHROPIC_API_KEY: "other", HOME: process.env.HOME as string, PATH: env.PATH };
    const run = modelSettings(undefined, host, {});
    const s = await quiet(() => runCorpus(PUBLIC, { model: run.model, label: "t", limit: 1, env: run.env }, join(root, "results")));
    const seen = readJson(join(s.results_dir, "uv-env.json"));
    expect(seen).toMatchObject({ OPENAI_API_KEY: "model-key", OPENAI_BASE_URL: "http://192.0.2.5/v1", HOME: process.env.HOME });
    for (const leaked of ["JUDGE_API_KEY", "MODEL_API_KEY", "AKM_BIN", "ANTHROPIC_API_KEY"]) expect(seen[leaked]).toBeUndefined();
    expect(JSON.stringify(seen)).not.toContain("judge-secret");
    const stored = readFileSync(join(s.results_dir, "summary.json"), "utf8");
    expect(JSON.parse(stored).engine).toEqual({ model: "openai/x", endpoint: "http://192.0.2.5" });
    expect(stored).not.toMatch(/model-key|judge-secret/);
  });

  test("counts the time-outs apart and shows the plugin failure that one of them hid", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const timeouts = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 2, env: { ...env, UV_FAKE_TIMEOUTS: "1" } }, join(root, "results")));
    expect(timeouts.timeouts).toEqual({ control: 1, akm: 1 });
    // The slow install is a time-out of the setup, and counts in the report's tables, the summary and its metrics alike (#73).
    expect([timeouts.report.control.timeouts, timeouts.report.akm.timeouts]).toEqual([1, 1]);
    expect([timeouts.metrics.control.timeouts, timeouts.metrics.akm.timeouts]).toEqual([1, 1]);
    expect(timeouts.n_errored).toBe(1); // the slow install got no reward. The control's time-out was still verified
    expect(rowsOf(timeouts.results_dir).flatMap((r) => r.trials).filter((t) => t.timed_out)).toHaveLength(2);
    const dead = await quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "d", limit: 1, env: { ...env, UV_FAKE_PLUGIN_DEAD: "1" } }, join(root, "results")));
    expect(dead.report.akm.exceptions).toEqual({ AkmPluginNotLoadedError: 1 });
    expect(dead.timeouts.akm).toBe(1);
    expect(dead.report.akm.timeouts).toBe(1); // the one trial that timed out and then failed the plugin check
    expect(dead.metrics.akm.timeouts).toBe(1);
  });

  test("with --repeat, runs the benchmark into <label>-r1 to -rN and writes the spread of its metrics beside them", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    const results = join(root, "results");
    const runs = await quiet(() => repeatRuns(2, "t", (label) => runCorpus(PUBLIC, { model: "openai/x", label, limit: 2, env }, results)));
    expect(runs).toHaveLength(2);
    const names = readdirSync(results).sort();
    expect(names.filter((n) => /-t-r[12]$/.test(n))).toHaveLength(2);
    const file = names.find((n) => n.endsWith("-t-repeat-summary.json")) as string;
    const spread = readJson(join(results, file));
    expect(spread).toMatchObject({ eval: "terminal-bench", corpus: "public", repeat: 2, model: "openai/x", akm_version: PINS.akm_cli, akm_bin: `akm-cli@${PINS.akm_cli}`, akm_build: null });
    expect(spread.runs).toHaveLength(2);
    expect(spread.n_errored).toEqual({ min: 0, max: 0, mean: 0 });
    expect(spread.metrics.delta.value).toEqual({ min: 1, max: 1, mean: 1 });
    expect(spread.metrics.akm.pass_rate).toEqual({ min: 1, max: 1, mean: 1 });
    expect(spread.metrics.engagement.control_calls).toEqual({ min: 0, max: 0, mean: 0 });
    for (const run of runs) expect(existsSync(join(run.results_dir, ".running"))).toBe(false);
  });

  test("still leaves the summary when Harbor exits with an error, and says so", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    await expect(quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 1, env: { ...env, UV_FAKE_EXIT: "3" } }, join(root, "results")))).rejects.toThrow("Harbor exited 3");
    const [run] = readdirSync(join(root, "results"));
    expect(readJson(join(root, "results", run, "summary.json")).harbor_exit).toBe(3);
  });

  test("is an aborted run, with its summary kept, when Harbor left no job at all", async () => {
    fakeAkm(false);
    const { root, env } = fakeUv();
    await expect(quiet(() => runCorpus(PUBLIC, { model: "openai/x", label: "t", limit: 1, env: { ...env, UV_FAKE_NOTHING: "1" } }, join(root, "results")))).rejects.toThrow("Harbor wrote no job; 2 of 2 expected trials have no result (control 1, akm 1)");
    const [run] = readdirSync(join(root, "results"));
    expect(readJson(join(root, "results", run, "summary.json"))).toMatchObject({ status: "aborted", completion: { expected: 2, completed: 0, missing: 2 } }); // and the run's folder is kept
  });
});

describe("libraryOf", () => {
  test("is the public library for the public corpus and the private copy evals/retrieval makes for the private one", () => {
    expect(libraryOf(PUBLIC)).toBe(join(BENCH_DIR, "..", "..", "corpus", "library"));
    expect(libraryOf(PRIVATE)).toBe(join(BENCH_DIR, "..", "..", "private", "retrieval", "assets", "library"));
    expect(existsSync(join(libraryOf(PUBLIC), "skills"))).toBe(true);
  });
});

describe("otherDigests", () => {
  const trial = (task: string, digest: string | null | undefined): Trial => ({ task, arm: "control", trial: task, reward: 1, error: null, akm: null, tools: 1, tokens: null, costUsd: null, seconds: 1, digest });
  const name = lock.sample[0];
  const digest = lock.tasks[name];

  test("finds the tasks that ran with another digest than the lock's", () => {
    expect(otherDigests([trial(name, digest), trial(name, digest)], lock)).toEqual([]);
    expect(otherDigests([trial(name, `sha256:${"0".repeat(64)}`), trial(name, digest)], lock)).toEqual([name]);
  });

  test("flags a task the lock does not know, and skips a trial that recorded no digest", () => {
    expect(otherDigests([trial("not-a-task", "abc")], lock)).toEqual(["not-a-task"]);
    expect(otherDigests([trial(name, null), trial(name, undefined)], lock)).toEqual([]);
  });
});

describe("sideBySide", () => {
  test("is the shared table under this benchmark's name", () => {
    const empty = buildReport([]);
    const lines = sideBySide({ corpus: "public", report: empty }, { corpus: "custom", report: empty });
    expect(lines[0]).toBe("terminal-bench: public and custom side by side (not pooled)");
  });
});

/**
 * The tests that run a real akm. They run only when asked for, with AKM_EVAL_REAL_AKM=1, and not because an akm happens to be installed:
 * they use AKM_BIN, else `akm` on PATH, and expect the version below. Another version fails the first test by saying which one it found.
 */
const REAL_AKM = process.env.AKM_EVAL_REAL_AKM === "1";
const REAL_AKM_VERSION = "0.9.26"; // the akm these assertions were written against: 259 assets in 317 files of the public library

describe.skipIf(!REAL_AKM)("with a real akm (AKM_EVAL_REAL_AKM=1)", () => {
  beforeEach(() => {
    if (akmBin === undefined) delete process.env.AKM_BIN;
    else process.env.AKM_BIN = akmBin;
  });

  test(`is akm ${REAL_AKM_VERSION}`, async () => {
    const m = await measureLibrary(libraryOf(PUBLIC));
    expect(m.reason).toBeUndefined();
    expect(m.measured_with?.akm_version).toBe(REAL_AKM_VERSION);
  }, 120_000);

  test("counts the public library's assets, which are fewer than its files", async () => {
    const m = await measureLibrary(libraryOf(PUBLIC));
    expect(m.reason).toBeUndefined();
    expect(m.assets).toBeGreaterThan(0);
    expect(m.assets).toBeLessThan(readdirSync(libraryOf(PUBLIC), { recursive: true }).length);
  }, 120_000);

  test.skipIf(!existsSync(libraryOf(PRIVATE)))("and the private copy's", async () => {
    expect((await measureLibrary(libraryOf(PRIVATE))).assets).toBeGreaterThan(0);
  }, 120_000);
});

describe("the caller's AKM_BIN", () => {
  test("is not what the tests that count a library use: they use the fake they set", async () => {
    process.env.AKM_BIN = "the-callers-akm-that-would-fail"; // as if the caller had set one
    fakeAkm(true);
    const m = await measureLibrary(libraryOf(PUBLIC));
    expect(m.reason).toBeUndefined();
    expect(m.measured_with).toMatchObject({ akm_version: "0.9.99-test" });
    expect(m.measured_with?.akm_bin).toContain("fake-akm.ts");
  });
});

describe("the command line", () => {
  /** Runs the runner as a person would, with only the environment given. These all stop before Docker is asked about. */
  const run = (args: string[], env: Record<string, string> = {}) => {
    const done = Bun.spawnSync(["bun", "--no-env-file", join(import.meta.dir, "run.ts"), ...args], { env: { PATH: process.env.PATH as string, HOME: process.env.HOME as string, ...env }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  test("--help describes the flags of the akm under test, and the model, and says AKM_BIN is not read", () => {
    const { code, out } = run(["--help"]);
    expect(code).toBe(0);
    for (const flag of ["--repeat", "--akm ", "--akm-env", "--model", "--attempts", "--corpus", "--cases"]) expect(out).toContain(flag);
    expect(out).toMatch(/models\.json/);
    expect(out).toContain("AKM_BIN is not read");
    expect(out).toContain("akm-cli@x.y.z");
  });

  test("refuses a bad count, a bad --akm and a bad --akm-env with a message and exit 2, before it asks about Docker", () => {
    for (const [args, said] of [
      [["--repeat", "0"], "--repeat must be a positive integer"],
      [["--limit", "x"], "--limit must be a positive integer"],
      [["--attempts", "0"], "--attempts must be a positive integer"],
      [["--akm", "bun ~/code/akm/src/cli.ts"], "is a command"],
      [["--akm", "akm-cli@latest"], "exact release"],
      [["--akm", "/no/such/akm/checkout"], "neither akm-cli@x.y.z nor a folder"],
      [["--akm-env", "OPENAI_API_KEY=x"], "only AKM_* settings"],
      [["--akm-env", "AKM_BUNDLE_DIR=/x"], "the arm fixes it"],
      [["--akm-env", "AKM_LLM_API_KEY=secret"], "looks like a credential"],
      [["--akm-env", "AKM_X"], "takes KEY=VALUE"],
    ] as [string[], string][]) {
      const done = run(args);
      expect(done.code, args.join(" ")).toBe(2);
      expect(done.err, args.join(" ")).toContain(said);
    }
  });

  test("sends --model through models.json and the gateway as every eval does: a gateway's model id may have a slash, and OpenAI's key is not sent to a gateway", () => {
    // Past the model's name and URL, to the check that a container can reach the server: the id is the gateway's, as opencode's openai provider takes it.
    const local = run(["--model", "Qwen/Qwen2.5-7B"], { MODEL_BASE_URL: "http://localhost:8080/v1", MODEL_API_KEY: "k" });
    expect(local.code).toBe(2);
    expect(local.err).toContain("the endpoint of openai/Qwen/Qwen2.5-7B, http://localhost:8080/v1, would be the container itself");
    expect(local.err).not.toContain("is sent to");
    const gateway = run(["--model", "gpt-6"], { MODEL_BASE_URL: "https://gw.example.net/v1", OPENAI_API_KEY: "sk-real-openai-key" });
    expect(gateway.code).toBe(2);
    expect(gateway.err).toContain("no model key for openai/gpt-6");
    expect(gateway.err + gateway.out).not.toContain("sk-real-openai-key");
    const none = run([], {});
    expect(none.code).toBe(2);
    expect(none.err).toContain("name the model");
    expect(run(["--model", "my-model"], { MODEL_API_KEY: "k", MODEL_BASE_URL: "http://localhost:8080/v1" }).err).toContain("would be the container itself");
  });
});

describe("the command line with a fake Harbor, in a copy of the repository", () => {
  test("ends with exit 1 and an aborted summary when Harbor leaves a cell missing and exits 1, and with exit 0 and a complete one otherwise", () => {
    const root = sandboxRepo();
    dirs.push(root);
    const bin = writeFakeHarbor(root);
    const run = (label: string, env: Record<string, string> = {}) => {
      const done = Bun.spawnSync(["bun", "--no-env-file", join(root, "benchmarks", "terminal-bench", "src", "run.ts"), "--limit", "2", "--label", label], {
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME as string, MODEL_NAME: "openai/x", MODEL_API_KEY: "sk-test-key", ...env },
        stdout: "pipe",
        stderr: "pipe",
      });
      const results = join(root, "benchmarks", "terminal-bench", "results");
      const folder = readdirSync(results).find((d) => d.endsWith(`-${label}`)) as string;
      return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString(), summary: JSON.parse(readFileSync(join(results, folder, "summary.json"), "utf8")) };
    };
    const cut = run("cut", { UV_FAKE_MISSING: "1", UV_FAKE_EXIT: "1" });
    expect(cut.code).toBe(1);
    expect(cut.err).toContain("terminal-bench: Harbor exited 1; 1 of 4 expected trials have no result (control 0, akm 1)");
    expect(cut.out).toContain("ABORTED");
    expect(cut.summary).toMatchObject({ status: "aborted", harbor_exit: 1, completion: { expected: 4, completed: 3, failed: 0, missing: 1 } });
    const quiet = run("whole", { UV_FAKE_MISSING: "1" }); // Harbor says it succeeded, but did not get to a cell
    expect(quiet.code).toBe(1);
    expect(quiet.summary).toMatchObject({ status: "aborted", harbor_exit: 0 });
    const whole = run("full");
    expect(whole.code).toBe(0);
    expect(whole.summary).toMatchObject({ status: "complete", aborted_reason: null, completion: { expected: 4, completed: 4, missing: 0 } });
  }, 60_000);

  /** A copy of the repository with a fake Harbor, and a way to run the CLI in it. */
  function repo() {
    const root = sandboxRepo();
    dirs.push(root);
    const bin = writeFakeHarbor(root);
    const run = (args: string[], env: Record<string, string> = {}) => {
      const done = Bun.spawnSync(["bun", "--no-env-file", join(root, "benchmarks", "terminal-bench", "src", "run.ts"), ...args], {
        env: { PATH: `${bin}:${process.env.PATH}`, HOME: process.env.HOME as string, MODEL_NAME: "openai/x", MODEL_API_KEY: "sk-test-key", ...env },
        stdout: "pipe",
        stderr: "pipe",
      });
      return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
    };
    /** The results folder of a run by its label. A custom corpus's results are not published. */
    const folder = (label: string, corpus: "public" | "custom" = "public") => {
      const results = corpus === "public" ? join(root, "benchmarks", "terminal-bench", "results") : join(root, "private", "terminal-bench", "results");
      return join(results, readdirSync(results).find((d) => d.endsWith(`-${label}`)) as string);
    };
    const summary = (label: string, corpus: "public" | "custom" = "public") => JSON.parse(readFileSync(join(folder(label, corpus), "summary.json"), "utf8"));
    return { root, run, summary, folder };
  }

  test("a run on a custom corpus records its folder from the repository root and rescore reads the library there; a folder outside the repository is not written down, and --cases DIR gives it to rescore", () => {
    const { root, run, summary, folder } = repo();
    const ownLibrary = (to: string) => {
      cpSync(join(root, "corpus", "library"), join(to, "library"), { recursive: true });
    };
    // the public corpus has no folder to record
    expect(run(["--limit", "2", "--label", "pub"]).code).toBe(0);
    expect(summary("pub").corpus_folder).toBeNull();
    expect(rescoreFolder(folder("pub"), { root }).result.changed).toEqual([]);

    // a folder inside the repository: recorded, and rescore reads the library there
    const mine = join(root, "notes", "mine");
    ownLibrary(mine);
    expect(run(["--cases", "notes/mine", "-y", "--limit", "2", "--label", "in"]).code).toBe(0);
    const stored = summary("in", "custom");
    expect(stored).toMatchObject({ corpus: "custom", corpus_folder: "notes/mine" });
    const inside = rescoreFolder(folder("in", "custom"), { root });
    expect(inside.result.changed).toEqual([]);
    const rescored = JSON.parse(readFileSync(join(inside.out, "summary.json"), "utf8"));
    expect(rescored).toMatchObject({ corpus: "custom", corpus_folder: "notes/mine", report: stored.report });
    expect(rescored.manifest.cases).toEqual(stored.manifest.cases);
    // the folder has moved: rescore says so and where to say it is
    renameSync(mine, join(root, "notes", "moved"));
    expect(() => rescoreFolder(folder("in", "custom"), { root })).toThrow("notes/mine, which is not a folder here");
    const moved = rescoreFolder(folder("in", "custom"), { root, cases: "notes/moved" });
    expect(moved.result.changed).toEqual([]);
    expect(JSON.parse(readFileSync(join(moved.out, "summary.json"), "utf8")).corpus_folder).toBe("notes/moved");

    // a folder outside the repository: its path is not in the summary, and rescore needs --cases DIR
    const outside = tmp();
    ownLibrary(outside);
    expect(run(["--cases", outside, "-y", "--limit", "2", "--label", "out"]).code).toBe(0);
    const away = summary("out", "custom");
    expect(away).toMatchObject({ corpus: "custom", corpus_folder: null });
    for (const file of ["summary.json", "samples.jsonl", "job.json"]) expect(readFileSync(join(folder("out", "custom"), file), "utf8"), file).not.toContain(outside);
    expect(() => rescoreFolder(folder("out", "custom"), { root })).toThrow("outside the repository");
    expect(() => rescoreFolder(folder("out", "custom"), { root })).toThrow("--cases DIR");
    const given = rescoreFolder(folder("out", "custom"), { root, cases: outside });
    expect(given.result.changed).toEqual([]);
    const again = JSON.parse(readFileSync(join(given.out, "summary.json"), "utf8"));
    expect(again.report).toEqual(away.report);
    expect(again.corpus_folder).toBeNull(); // the folder it was given is outside too, and is not written down
    expect(readFileSync(join(given.out, "summary.json"), "utf8")).not.toContain(outside);
  }, 120_000);

  test("takes a library of your own with --cases, and refuses a folder without a library", () => {
    const { root, run, summary } = repo();
    const mine = join(root, "mine");
    cpSync(join(root, "corpus", "library"), join(mine, "library"), { recursive: true });
    const ran = run(["--cases", "mine", "-y", "--limit", "1", "--label", "own"]);
    expect(ran.code, ran.err).toBe(0);
    expect(summary("own", "custom")).toMatchObject({ corpus: "custom", seed: null, library: { path: "mine/library" }, status: "complete" });
    expect(summary("own", "custom").manifest).toMatchObject({ corpus: "custom", settings: { seed: null } });
    rmSync(join(mine, "library"), { recursive: true });
    const empty = run(["--cases", "mine", "--limit", "1", "--label", "empty"]);
    expect(empty.code).toBe(2);
    expect(empty.err).toContain("the custom library is missing (mine/library)");
  }, 60_000);

  test("resolves --corpus as evals/retrieval does: custom is its rewritten library, private, own and own-feedback were renamed, and a value that is none of them is refused", () => {
    const { run } = repo();
    const missing = run(["--corpus", "custom"]);
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("the custom library is missing (private/retrieval/assets/library). Make it with: ./generate-assets --only retrieval");
    for (const old of ["private", "own", "own-feedback"]) {
      const renamed = run(["--corpus", old]);
      expect(renamed.code, old).toBe(2);
      expect(renamed.err, old).toContain(`terminal-bench: --corpus ${old} was renamed in 0.2: use `);
      expect(renamed.err, old).not.toContain("library is missing");
    }
    const bad = run(["--corpus", "elsewhere"]);
    expect(bad.code).toBe(2);
    expect(bad.err).toContain('--corpus must be public, custom or all, not "elsewhere"');
    expect(run(["--corpus", "public", "--cases", "x"]).err).toContain("--cases is a custom corpus");
  }, 60_000);
});


test("Terminal-Bench forwards custom model limits to the saved configuration of both arms", () => {
  const limits = { context: 32768, output: 4096 };
  const cfg = jobConfig({ name: "limits", model: "openai/fast/local", modelLimits: limits, lock, tasks: [Object.keys(lock.tasks)[0]!], librariesDir: "/libraries", jobsDir: "/jobs" }) as any;
  for (const agent of cfg.agents) expect(agent.kwargs.opencode_config.provider.openai.models["fast/local"].limit).toEqual(limits);
});
