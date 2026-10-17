// The tests of lib/run.ts. A fake eval (FIXTURE) runs through runEval in a process of its own, in a copy of lib/ in a temp folder so that its
// private/ and results are there and never in the repository, against a fake akm that logs every call and sleeps as long as the case says, and
// a stub of the model endpoint (STUB_MODEL) in a process of its own, since a run is started synchronously and that blocks this process.
// What reflect adds to the run is in evals/reflect/src/run.test.ts.

import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commandLine } from "./akm/akm.ts";

/**
 * An akm that answers `--version` (FAKE_VERSION, else 0.9.99-test), and `case ID MS FAIL GATE`: it waits for the file GATE in FAKE_GATES, if it is given
 * one, sleeps MS, and then fails with FAIL as its error, or says ok. With FAKE_USAGE it records one model call in the sandbox's state.db. It logs every call
 * to FAKE_LOG.
 */
const FAKE_AKM = `
import { appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
const args = process.argv.slice(2);
const log = (o) => appendFileSync(process.env.FAKE_LOG, JSON.stringify({ at: Date.now(), ...o }) + "\\n");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (args[0] === "--version") { log({ cmd: "version" }); console.log("akm " + (process.env.FAKE_VERSION ?? "0.9.99-test")); }
else if (args[0] === "case") {
  const [, id, ms, fail, gate] = args;
  log({ cmd: "case", id, edge: "start", data: process.env.AKM_DATA_DIR });
  while (gate && !existsSync(join(process.env.FAKE_GATES, gate))) await wait(20);
  await wait(Number(ms));
  if (process.env.FAKE_USAGE) {
    const db = new Database(join(process.env.AKM_DATA_DIR, "state.db"));
    db.exec("CREATE TABLE IF NOT EXISTS events (event_type TEXT, metadata_json TEXT)");
    db.query("INSERT INTO events VALUES ('llm_usage', ?)").run(JSON.stringify({ outcome: "success", durationMs: 10, promptTokens: 1, completionTokens: 1 }));
    db.close();
  }
  log({ cmd: "case", id, edge: "end" });
  if (fail) { console.error(JSON.stringify({ error: fail, code: "FAKE" })); process.exit(70); }
  console.log(JSON.stringify({ ok: true }));
} else { console.error("unexpected " + args.join(" ")); process.exit(1); }
`;

/**
 * An eval that is only a spec: one akm call per case, scored ok or error. Its own flag is --note, which its setup, its cases' input and its summary carry,
 * and --note reverse selects from the end (selectCases is given the context). FAKE_CTX gets the context of every case, FAKE_CASES_FILE names the cases
 * file, and FAKE_SPEC is JSON that replaces fields of the spec. The rest of what a spec can have is switched on by the environment: FAKE_NO_STRATEGY,
 * FAKE_SHARED (a sandbox for all the cases of a run, opened and closed as FAKE_RUNS logs), FAKE_BATCH (runs the cases itself, last first, and with
 * FAKE_BATCH_ABORT gives up for that reason; "stray" records a row of no case) and FAKE_ABORT (gives up when no case was ok).
 */
const FIXTURE = `
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSandbox, engineConfig, removeSandbox, runAkmJson } from "./lib/akm/akm.ts";
import { patchedConfig } from "./lib/akm/overrides.ts";
import { runEval } from "./lib/run.ts";

const count = (rows, test) => rows.filter(test).length;
const CASES = process.env.FAKE_CASES_FILE ?? "cases.jsonl";
const spec = {
  measurement: {
    eval: "fake",
    version: "0.1",
    caseId: (c) => c.id,
    input: (c, note) => ({ id: c.id, note: note ?? null }),
    labels: (c) => ({ id: c.id }),
    errored: (r) => r.outcome === "error",
    summarize: (rows) => ({ n_run: rows.length, n_scored: count(rows, (r) => r.outcome !== "error"), n_errored: count(rows, (r) => r.outcome === "error"), timeouts: count(rows, (r) => r.timed_out), metrics: { ok: count(rows, (r) => r.outcome === "ok"), order: rows.map((r) => r.id) } }),
  },
  dir: join(import.meta.dir, "evals", "fake"),
  strategy: "fake-only",
  minAkm: "0.9.25",
  defaultTimeoutMs: 900000,
  loadCases: (folder) => {
    const file = join(folder, CASES);
    return readFileSync(file, "utf8").split("\\n").filter((l) => l.trim()).map((line, i) => {
      try { return JSON.parse(line); } catch { throw new Error(file + ":" + (i + 1) + " is not valid JSON"); }
    });
  },
  selectCases: (all, limit, ctx) => { const ordered = ctx.note === "reverse" ? [...all].reverse() : all; return limit === undefined ? ordered : ordered.slice(0, limit); },
  assetsSha256: (folder, all) => createHash("sha256").update(readFileSync(join(folder, CASES))).update("|" + all.length).digest("hex"),
  configFor: (ctx) => patchedConfig(engineConfig(ctx.baseUrl, ctx.model, ctx.hasKey, "fake", ctx.provider), ctx.overrides),
  runCase: async (c, ctx) => {
    appendFileSync(process.env.FAKE_CTX, JSON.stringify({ id: c.id, timeoutMs: ctx.timeoutMs, concurrency: ctx.concurrency, provider: ctx.provider, strategy: ctx.overrides.strategy, limit: ctx.limit ?? null, note: ctx.note ?? null }) + "\\n");
    if (c.throw) throw new Error("the fixture threw " + c.id);
    const t0 = performance.now();
    const seconds = () => Number(((performance.now() - t0) / 1000).toFixed(1));
    const sandbox = ctx.sandbox ?? createSandbox("fake");
    try {
      await runAkmJson(sandbox, ["case", c.id, String(c.ms ?? 0), c.fail ?? "", c.gate ?? ""], { timeoutMs: ctx.timeoutMs });
      return { id: c.id, outcome: "ok", seconds: seconds() };
    } catch (e) {
      const error = e.message.slice(0, 300);
      return { id: c.id, outcome: "error", error, ...(/timed out/.test(error) ? { timed_out: true } : {}), seconds: seconds() };
    } finally {
      if (!ctx.sandbox) removeSandbox(sandbox);
    }
  },
  progress: (c, row) => c.id.padEnd(6) + " " + row.outcome,
  caseContext: (c, ctx) => ctx.note,
  prepare: (values) => {
    if (values.note === "bad") throw new Error("--note cannot be bad");
    return () => ({ note: values.note });
  },
  summaryExtras: (cases, rows, ctx) => ({ extras: { note: ctx.note ?? null, selected: cases.length, sandbox_alive: ctx.sandbox ? existsSync(ctx.sandbox.dir) : null } }),
  printSummary: (s) => console.log("fake " + s.corpus + ": " + s.n_run + " of " + s.n_cases + " cases, " + s.n_errored + " errored"),
  sideBySide: (a, b) => [["ok", String(a.metrics.ok), String(b.metrics.ok)]],
  options: { note: { type: "string" } },
  usage: { about: "Runs the fake eval.", corpus: "            The default custom corpus is private/fake/assets.", limit: "run the first N cases.", flags: "[--note TEXT]", extra: "  --note    a note for every case." },
};
if (process.env.FAKE_NO_STRATEGY) delete spec.strategy;
if (process.env.FAKE_SHARED) {
  spec.openRun = async () => {
    const sandbox = createSandbox("fake");
    appendFileSync(process.env.FAKE_RUNS, "open\\n");
    return { sandbox, close() { appendFileSync(process.env.FAKE_RUNS, "close\\n"); removeSandbox(this.sandbox); } }; // a method: it is called on what openRun returned
  };
}
if (process.env.FAKE_BATCH) {
  spec.collectAll = async (cases, ctx, record) => {
    const rows = [];
    for (const c of [...cases].reverse()) {
      const row = await spec.runCase(c, ctx);
      rows.push(row);
      record(row);
    }
    if (process.env.FAKE_BATCH === "stray") record({ id: "nobody", outcome: "ok", seconds: 0 });
    return { rows, aborted: process.env.FAKE_BATCH_ABORT };
  };
}
if (process.env.FAKE_ABORT) spec.abortReason = (rows) => (rows.some((r) => r.outcome === "ok") ? null : "no case was ok, so there is no result");
Object.assign(spec, JSON.parse(process.env.FAKE_SPEC ?? "{}"));
await runEval(spec);
`;

/**
 * A model endpoint that prints its port and answers POST /v1/chat/completions with the model "stub", as the smoke's stub does. Under /echo/ it answers
 * with the model it was asked for, and under /denied/ with 401 and a long body that holds the key it was sent. /__seen is what it was sent since /__reset.
 */
const STUB_MODEL = `
const seen = [];
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/__seen") return Response.json(seen);
    if (pathname === "/__reset") { seen.length = 0; return new Response("ok"); }
    const text = await req.text();
    const body = text ? JSON.parse(text) : {};
    const authorization = req.headers.get("authorization");
    seen.push({ path: pathname, authorization, body });
    if (pathname.startsWith("/denied/")) return new Response(JSON.stringify({ error: { message: "Incorrect API key provided: " + (authorization ?? "").replace("Bearer ", "") + ". " + "x".repeat(300) } }), { status: 401 });
    return Response.json({ model: pathname.startsWith("/echo/") ? body.model : "stub", choices: [{ message: { content: "{}" } }] });
  },
});
console.log(server.port);
`;

/** A case of the fake eval: it waits `ms`, and for the file `gate` if it has one, then fails with `fail` if it has one. A case with `throw` makes the eval throw. */
interface Case {
  id: string;
  ms?: number;
  fail?: string;
  gate?: string;
  throw?: boolean;
}
const ok = (n: number, ms = 0, name = "ok"): Case[] => Array.from({ length: n }, (_, i) => ({ id: `${name}${i}`, ms }));
const bad = (n: number, ms = 0, name = "bad"): Case[] => Array.from({ length: n }, (_, i) => ({ id: `${name}${i}`, ms, fail: "boom" }));
const held = (n: number, name = "held"): Case[] => Array.from({ length: n }, (_, i) => ({ id: `${name}${i}`, gate: `${name}${i}` }));
const lines = (cases: Case[]): string => `${cases.map((c) => JSON.stringify(c)).join("\n")}\n`;

/** What the run says when it gives up, after the reason. */
const CHECK = "Check MODEL_BASE_URL, MODEL_NAME and MODEL_API_KEY in .env, and that akm can reach the model.";

/** The last line of every usage text. */
const PROBE_NOTE = "The model gets one one-token request before the first case. AKM_EVAL_NO_PROBE=1 skips it, for an endpoint that does not serve chat completions.";

setDefaultTimeout(60_000); // every test starts processes

let tree: string;
let runs = 0;
let stub = ""; // the origin of the stub endpoint: a run's MODEL_BASE_URL is this and /v1
let stubProcess: Bun.Subprocess<"ignore", "pipe", "inherit">;
beforeAll(async () => {
  tree = mkdtempSync(join(tmpdir(), "run lib tree-")); // a space in the name, so that a path that is not quoted somewhere fails here
  cpSync(import.meta.dir, join(tree, "lib"), { recursive: true });
  writeFileSync(join(tree, "fixture.ts"), FIXTURE);
  writeFileSync(join(tree, "fake-akm.ts"), FAKE_AKM);
  // a git that logs its arguments to GIT_SHIM_LOG and runs the real one, to count how often the run reads which akm it runs
  mkdirSync(join(tree, "bin"));
  writeFileSync(join(tree, "bin", "git"), `#!/bin/sh\necho "$@" >> "$GIT_SHIM_LOG"\nexec ${Bun.which("git")} "$@"\n`);
  chmodSync(join(tree, "bin", "git"), 0o755);
  mkdirSync(join(tree, "evals", "fake", "assets"), { recursive: true });
  writeFileSync(join(tree, "stub-model.ts"), STUB_MODEL);
  stubProcess = Bun.spawn(["bun", join(tree, "stub-model.ts")], { stdin: "ignore", stdout: "pipe", stderr: "inherit" });
  const reader = stubProcess.stdout.getReader();
  let said = ""; // its port, once it listens
  while (!said.includes("\n")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    said += new TextDecoder().decode(chunk.value);
  }
  stub = `http://127.0.0.1:${said.trim()}`;
});
afterAll(() => {
  stubProcess.kill();
  rmSync(tree, { recursive: true, force: true });
});

/** What the stub has been sent since it was last reset: the path, the authorization and the body of each request. */
const sentToStub = async (): Promise<{ path: string; authorization: string | null; body: any }[]> => (await fetch(`${stub}/__seen`)).json() as Promise<any>;
const resetStub = async (): Promise<void> => void (await fetch(`${stub}/__reset`));

/** A port that nothing listens on: a connection to it is refused. */
function closedPort(): number {
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
  const port = server.port as number;
  server.stop(true);
  return port;
}

/** Puts the cases of the public corpus in place. */
const setCases = (cases: Case[]): void => writeFileSync(join(tree, "evals", "fake", "assets", "cases.jsonl"), lines(cases));

/** Puts a rewrite in place, the custom corpus of --corpus custom and --corpus all, as ./generate-assets leaves it, with its seed. */
function setRewrite(cases: Case[], seed = "7"): void {
  mkdirSync(join(tree, "private", "fake", "assets"), { recursive: true });
  writeFileSync(join(tree, "private", "fake", "assets", "cases.jsonl"), lines(cases));
  writeFileSync(join(tree, "private", "fake", "assets", "generated.json"), JSON.stringify({ seed }));
}

/** A folder of the tree with a cases.jsonl in it, for --cases. */
function folderOf(name: string, cases: Case[], text = lines(cases)): string {
  mkdirSync(join(tree, name), { recursive: true });
  writeFileSync(join(tree, name, "cases.jsonl"), text);
  return join(tree, name);
}

/** What a run of the fake eval is started with, and what it leaves: its command, its environment, and the reading of its logs and its TMPDIR once it ended. */
function setup(args: string[], env: Record<string, string>) {
  const n = ++runs;
  const own = mkdtempSync(join(tmpdir(), "run lib tmp-"));
  const [calls, contexts, events] = [join(tree, `calls-${n}.jsonl`), join(tree, `ctx-${n}.jsonl`), join(tree, `runs-${n}.log`)];
  const base = { ...process.env, MODEL_BASE_URL: `${stub}/v1`, MODEL_NAME: "the-model", MODEL_API_KEY: "model-secret", MODEL_PROVIDER: "", AKM_EVAL_NO_PROBE: "", NO_PROXY: "127.0.0.1,localhost", no_proxy: "127.0.0.1,localhost", AKM_BIN: commandLine(["bun", join(tree, "fake-akm.ts")]), FAKE_LOG: calls, FAKE_CTX: contexts, FAKE_RUNS: events, TMPDIR: own };
  const read = (file: string): any[] => {
    if (!existsSync(file)) return [];
    const text = readFileSync(file, "utf8");
    return text.slice(0, text.lastIndexOf("\n") + 1).split("\n").filter(Boolean).map((l) => JSON.parse(l)); // a line that is still being written has no newline yet, and is not read
  };
  return {
    argv: ["bun", join(tree, "fixture.ts"), ...args],
    options: { cwd: tree, env: { ...base, ...env }, stdout: "pipe" as const, stderr: "pipe" as const },
    calls: () => read(calls),
    result(code: number | null, out: string, err: string) {
      const leftover = readdirSync(own);
      rmSync(own, { recursive: true, force: true });
      expect(leftover).toEqual([]); // every sandbox the run made, the probe included, is gone, whichever way the run ended
      return { code, out, err, calls: read(calls), contexts: read(contexts), events: existsSync(events) ? readFileSync(events, "utf8").trim().split("\n") : [] };
    },
  };
}

/** The fake eval run with `args`, in a process of its own with a TMPDIR of its own: no sandbox may be left in it. */
function run(args: string[], env: Record<string, string> = {}) {
  const s = setup(args, env);
  const p = Bun.spawnSync(s.argv, s.options);
  return s.result(p.exitCode, p.stdout.toString(), p.stderr.toString());
}

/** A run that goes on while the test looks at it and lets its held cases go: `calls()` is what the fake akm has logged so far, and `done` is the run's result. */
function launch(args: string[], env: Record<string, string> = {}) {
  const s = setup(args, env);
  const proc = Bun.spawn(s.argv, s.options);
  const done = (async () => {
    const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return s.result(code, out, err);
  })();
  return { calls: s.calls, done };
}

/** A folder for the gates of cases to wait at, and the way to let one go. */
function gates() {
  const dir = mkdtempSync(join(tree, "gates-"));
  return { env: { FAKE_GATES: dir }, release: (...names: string[]) => names.forEach((name) => writeFileSync(join(dir, name), "")) };
}

/** Waits until `seen` holds, for as long as that takes up to half a minute, and fails if it never does. */
async function until(seen: () => boolean): Promise<void> {
  for (let i = 0; i < 1500 && !seen(); i++) await Bun.sleep(20);
  expect(seen()).toBe(true);
}

/** The results folders a label made, in either results folder. */
const foldersOf = (label: string): string[] =>
  ["evals/fake/results", "private/fake/results"]
    .flatMap((parent) => (existsSync(join(tree, parent)) ? readdirSync(join(tree, parent)).filter((name) => new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${label}(-r\\d+)?$`).test(name)).map((name) => join(tree, parent, name)) : []))
    .sort();

/** Every folder in either results folder, whatever its label: a run that makes none leaves this as it was. */
const everyFolder = (): string[] => ["evals/fake/results", "private/fake/results"].flatMap((parent) => (existsSync(join(tree, parent)) ? readdirSync(join(tree, parent)).map((name) => `${parent}/${name}`) : [])).sort();

const rowsOf = (folder: string): any[] =>
  existsSync(join(folder, "samples.jsonl")) ? readFileSync(join(folder, "samples.jsonl"), "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];

/** The folders a label made with their summary.json and samples.jsonl: for a run that has ended. */
const resultsOf = (label: string) => foldersOf(label).map((folder) => ({ folder, summary: JSON.parse(readFileSync(join(folder, "summary.json"), "utf8")), rows: rowsOf(folder) }));

/** The rows a run with this label has written so far. */
const writtenBy = (label: string): any[] => foldersOf(label).flatMap(rowsOf);

const started = (calls: any[]): string[] => calls.filter((c) => c.cmd === "case" && c.edge === "start").map((c) => c.id);
const ended = (calls: any[]): string[] => calls.filter((c) => c.cmd === "case" && c.edge === "end").map((c) => c.id);

describe("the flags and the usage", () => {
  test("--help and -h print the usage, with every flag that all runs take and the eval's own, and run nothing", () => {
    for (const flag of ["--help", "-h"]) {
      const r = run([flag]);
      expect([r.code, r.err, r.calls]).toEqual([0, "", []]);
      expect(r.out).toStartWith("Usage: evals/fake/run [--corpus public|custom|all] [--cases DIR] [--limit N] [--repeat N] [--note TEXT] [--strategy NAME] [--config-patch FILE] [--label NAME] [--model ID] [--akm COMMAND] [--concurrency N] [--timeout-ms N]\n\nRuns the fake eval.\n");
      for (const line of [
        "  --corpus  public (default)",
        "  --cases   the folder of a custom corpus of your own",
        "            The default custom corpus is private/fake/assets.",
        "  --limit   run the first N cases.",
        "  --repeat  run the corpus N times, into <label>-r1 to <label>-rN",
        "  --note    a note for every case.",
        "  --strategy      the akm improve strategy to run in place of fake-only.",
        "  --semantic      enable native bge-small-en-v1.5 semantic search",
        "  --config-patch  FILE",
        "  --model         the model, as the gateway names it",
        "  --akm           the command that runs akm",
        "  --label   names the results folder: <UTC date>-<label>. Default: the model name.",
        "  --concurrency  run N cases at a time. Default: 1.",
        "  --timeout-ms   stop an akm command that is still running after N milliseconds. Default: 900000.",
      ]) expect(r.out).toContain(line);
      expect(r.out).toEndWith(`\n\nTested with akm 0.9.25 or later on PATH, or in AKM_BIN.\n${PROBE_NOTE}\n`);
      expect(r.out).not.toMatch(/--yes|-y\b/);
    }
  });

  test("an unknown flag, --yes, -y and a stray word stop the run with the usage and exit code 2, before akm is asked anything", () => {
    for (const args of [["--bogus"], ["--yes"], ["-y"], ["stray"], ["--limit"], ["--concurrency"]]) {
      const r = run(args);
      expect([args, r.code, r.calls]).toEqual([args, 2, []]);
      expect(r.err).toStartWith("fake: ");
      expect(r.err).toContain("\n\nUsage: evals/fake/run ");
    }
  });

  test("--limit, --repeat, --concurrency and --timeout-ms are positive whole numbers, and say which is not", () => {
    for (const flag of ["--limit", "--repeat", "--concurrency", "--timeout-ms"]) {
      for (const bad of [[flag, "0"], [`${flag}=-1`], [flag, "1.5"], [flag, "two"], [flag, ""]]) {
        const r = run(bad);
        expect([bad, r.code, r.err.trim(), r.calls]).toEqual([bad, 2, `fake: ${flag} must be a positive integer`, []]);
      }
    }
  });

  test("a label may use letters, digits, dot, dash and underscore, and without one it is the model's name", () => {
    setCases(ok(1));
    const r = run(["--label", "no spaces!"]);
    expect([r.code, r.err.trim(), r.calls]).toEqual([2, "fake: --label may use letters, digits, dot, dash and underscore", []]);
    expect(run(["--model", "Org/My Model.v2", "--label", ""]).err).toContain("--label may use letters"); // an empty label is no label
    expect(run(["--model", "Org/My Model.v2"]).code).toBe(0);
    expect(resultsOf("org-my-model-v2")).toHaveLength(1);
    expect(run(["--label", "a_b.c-d1"]).code).toBe(0);
    expect(resultsOf("a_b.c-d1")).toHaveLength(1);
  });

  test("a corpus that is not public, custom or all, and --cases beside public, are refused; so is a run with no model", () => {
    expect(run(["--corpus", "own"]).err.trim()).toBe('fake: --corpus must be public, custom or all, not "own"');
    expect(run(["--corpus", "public", "--cases", "notes"]).err.trim()).toBe("fake: --cases is a custom corpus: use it alone, or with --corpus custom");
    const none = run([], { MODEL_NAME: "" });
    expect([none.code, none.calls]).toEqual([2, []]);
    expect(none.err).toContain("fake: name the model: pass --model ID, or set MODEL_NAME in .env");
  });

  test("an akm that is not a command, from --akm or AKM_BIN, is one line and exit code 2, never a stack", () => {
    const flag = run(["--akm", "'not closed"]);
    expect([flag.code, flag.err.trim()]).toEqual([2, expect.stringContaining("fake: --akm is not a command:")]);
    const env = run([], { AKM_BIN: "'not closed" });
    expect(env.code).toBe(2);
    expect(env.err.trim()).toStartWith("fake: AKM_BIN is not a command: ");
    expect(env.err.trim().split("\n")).toHaveLength(1);
    expect(env.err).not.toMatch(/\n\s+at /);
  });
});

describe("the order of a run", () => {
  test("a custom corpus that is not there stops the run first, and says what to make only for the rewrite", () => {
    setCases(ok(1));
    const rewrite = run(["--corpus", "custom"]);
    expect([rewrite.code, rewrite.calls, resultsOf("none")]).toEqual([2, [], []]);
    expect(rewrite.err.trim()).toBe("fake: --corpus custom: private/fake/assets/cases.jsonl does not exist. The folder of a custom corpus holds cases.jsonl, as assets/ does. Make the rewrite with: ./generate-assets --only fake");
    const empty = mkdtempSync(join(tmpdir(), "run lib empty-"));
    try {
      for (const args of [["--cases", empty], ["--cases", empty, "--corpus", "custom"], ["--cases", empty, "--corpus", "all"]]) {
        const own = run(args);
        expect([own.code, own.calls]).toEqual([2, []]);
        expect(own.err.trim()).toBe(`fake: --cases ${empty}: ${empty}/cases.jsonl does not exist. The folder of a custom corpus holds cases.jsonl, as assets/ does.`);
      }
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
    const inside = run(["--cases", "notes"]); // from the repository root, as it is written
    expect(inside.err.trim()).toBe("fake: --cases notes: notes/cases.jsonl does not exist. The folder of a custom corpus holds cases.jsonl, as assets/ does.");
  });

  test("a cases file that does not read stops the run before akm is asked anything, in one line", () => {
    const notes = folderOf("broken", [], '{"id":"a"}\nthis is not json\n');
    const r = run(["--cases", notes, "--corpus", "all"]);
    expect([r.code, r.calls]).toEqual([2, []]);
    expect(r.err.trim()).toBe(`fake: ${notes}/cases.jsonl:2 is not valid JSON`);
  });

  test("the eval's own setup runs after the corpus files and before akm is asked, and its error is one line", () => {
    setCases(ok(1));
    const r = run(["--note", "bad"]);
    expect([r.code, r.err.trim(), r.calls]).toEqual([2, "fake: --note cannot be bad", []]);
    const missing = run(["--note", "bad", "--corpus", "custom"]);
    expect(missing.err).toContain("private/fake/assets/cases.jsonl does not exist"); // the corpus is checked first
  });

  test("--cases says where the cases go before the run starts, and a run without it says nothing of the kind", () => {
    const notes = folderOf("destination", ok(1));
    const own = run(["--cases", notes, "--label", "destination"]);
    expect(own.code).toBe(0);
    const [said, start] = [own.out.indexOf("The cases in "), own.out.indexOf("fake (custom): ")];
    expect(said).toBeGreaterThanOrEqual(0);
    expect(said).toBeLessThan(start);
    expect(own.out).toContain(`The cases in ${notes} will be sent to:\n  model  the-model at ${stub}/v1\n`);
    setCases(ok(1));
    expect(run(["--label", "nodestination"]).out).not.toContain("will be sent to");
  });

  test("akm is probed once and its build is read once for the whole run, whatever the corpora and repeats", () => {
    setCases(ok(2));
    setRewrite(ok(2));
    // akmBuild asks git which checkout the akm command runs from, for each word of the command: a run that reads it once asks as often for four summaries as for one
    const reads = (args: string[]) => {
      const log = join(tree, `git-${++runs}.log`);
      const r = run(args, { PATH: `${join(tree, "bin")}:${process.env.PATH}`, GIT_SHIM_LOG: log });
      return { r, asked: existsSync(log) ? readFileSync(log, "utf8").split("\n").filter((l) => l.includes("--show-toplevel")).length : 0 };
    };
    const [many, single] = [reads(["--corpus", "all", "--repeat", "2", "--label", "once"]), reads(["--label", "single-build"])];
    expect(many.asked).toBeGreaterThan(0);
    expect(many.asked).toBe(single.asked);
    const r = many.r;
    expect(r.code).toBe(0);
    expect(r.calls.filter((c) => c.cmd === "version")).toHaveLength(1);
    expect(r.calls.filter((c) => c.cmd === "case" && c.edge === "start")).toHaveLength(8); // 2 cases, 2 corpora, 2 repeats
    const done = resultsOf("once");
    expect(done.map((d) => [d.summary.corpus, d.summary.label])).toEqual([["public", "once-r1"], ["public", "once-r2"], ["custom", "once-r1"], ["custom", "once-r2"]]);
    expect(new Set(done.map((d) => JSON.stringify([d.summary.akm_bin, d.summary.akm_build, d.summary.akm_build_fingerprint, d.summary.akm_version]))).size).toBe(1);
    expect(done.map((d) => d.summary.seed)).toEqual([null, null, "7", "7"]);
    expect(readdirSync(join(tree, "evals", "fake", "results")).filter((n) => n.endsWith("once-repeat-summary.json"))).toHaveLength(1);
    expect(r.out).not.toContain("side by side"); // not with --repeat
  });

  test("public and custom run in turn, and their two summaries are printed as columns, not pooled", () => {
    setCases(ok(3));
    setRewrite(ok(3));
    const r = run(["--corpus", "all", "--label", "columns"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("fake: public and custom side by side (not pooled)\n      public  custom\n  ok  3       3     \n");
    expect(r.out.indexOf("fake (public): ")).toBeLessThan(r.out.indexOf("fake (custom): "));
    expect(run(["--label", "single"]).out).not.toContain("side by side");
  });

  test("an akm older than the tested release is warned of, with the wording it always had, and the run goes on", () => {
    setCases(ok(1));
    const r = run(["--label", "old"], { FAKE_VERSION: "0.9.24" });
    expect(r.code).toBe(0);
    expect(r.err.trim()).toBe("akm 0.9.24 predates the tested release 0.9.25; continuing with the requested build. Command or output errors will be recorded normally.");
    expect(resultsOf("old")[0]?.summary.akm_version).toBe("0.9.24");
    expect(run(["--label", "new"]).err).toBe("");
  });
});

describe("the model endpoint and the startup banner", () => {
  const echo = (): string => `${stub}/echo/v1`; // answers with the model it was asked for
  /** The lines of the banner a run printed: from its first line to the line of the first corpus. */
  const bannerOf = (out: string): string[] => out.slice(0, out.indexOf("fake (")).trimEnd().split("\n");

  test("the banner is one block after the version probe and before the first case, a line for each setting that decides what the run measures, in this order", () => {
    setCases(ok(2));
    const r = run(["--label", "banner"], { MODEL_BASE_URL: echo() });
    expect(r.code).toBe(0);
    expect(r.out).toStartWith(
      `fake: model the-model at ${stub} (provider openai)\n  search keyword\n  temperature unset, thinking unset\n  strategy fake-only\n  concurrency 1, timeout 900s per akm command\n  akm 0.9.99-test\nfake (public): 2 of 2 cases, one at a time\n`,
    );
    expect(r.out).not.toContain("model-secret"); // never the key
    expect(r.out).not.toContain("/echo/"); // and the endpoint is its host, not its path
    expect(r.calls.map((c) => c.cmd)).toEqual(["version", "case", "case", "case", "case"]); // the request to the endpoint is no akm call, and akm was probed first
  });

  test("the model line says what the endpoint served the model as when that is not the name asked for, and names the provider", () => {
    setCases(ok(1));
    expect(run(["--label", "served"]).out).toStartWith(`fake: model the-model at ${stub} (provider openai, served as stub)\n`);
    expect(run(["--label", "served-same", "--model", "model-x"], { MODEL_BASE_URL: echo() }).out).toStartWith(`fake: model model-x at ${stub} (provider openai)\n`);
    expect(run(["--label", "provider"], { MODEL_BASE_URL: echo(), MODEL_PROVIDER: "anthropic" }).out).toStartWith(`fake: model the-model at ${stub} (provider anthropic)\n`);
  });

  test("search is semantic when the config akm is given turns it on, by --semantic or by a patch, and keyword when not; temperature and thinking are the engine's in that config", () => {
    setCases(ok(1));
    const patch = join(tree, "banner-patch.json");
    const banner = (flags: string[]): string[] => bannerOf(run(["--label", "banner-config", ...flags], { MODEL_BASE_URL: echo() }).out).slice(1); // after the model line
    const tail = ["  concurrency 1, timeout 900s per akm command", "  akm 0.9.99-test"];

    expect(banner(["--semantic"])).toEqual(["  search semantic (Xenova/bge-small-en-v1.5)", "  temperature unset, thinking unset", "  strategy fake-only", "  config patch --semantic", ...tail]);
    writeFileSync(patch, JSON.stringify({ semanticSearchMode: "auto", engines: { fake: { temperature: 0, enableThinking: false } } }));
    expect(banner(["--config-patch", patch])).toEqual(["  search semantic", "  temperature 0, thinking off", "  strategy fake-only", "  config patch banner-patch.json", ...tail]);
    writeFileSync(patch, JSON.stringify({ semanticSearchMode: "off", engines: { fake: { temperature: 0.3, enableThinking: true } } }));
    expect(banner(["--config-patch", patch])).toEqual(["  search keyword", "  temperature 0.3, thinking on", "  strategy fake-only", "  config patch banner-patch.json", ...tail]);
    expect(banner(["--semantic", "--config-patch", patch]).slice(0, 4)).toEqual(["  search semantic (Xenova/bge-small-en-v1.5)", "  temperature 0.3, thinking on", "  strategy fake-only", "  config patch banner-patch.json + --semantic"]); // the flag wins over the patch
  });

  test("the banner's strategy is --strategy's, and the concurrency and the timeout are those of the run and in seconds; a spec with no strategy has no line for one, and one that runs its own cases none for concurrency", () => {
    setCases(ok(1));
    const banner = (flags: string[], env: Record<string, string> = {}): string[] => bannerOf(run(["--label", "banner-flags", ...flags], { MODEL_BASE_URL: echo(), ...env }).out).slice(3); // after the settings of the config
    const akm = "  akm 0.9.99-test";
    expect(banner([])).toEqual(["  strategy fake-only", "  concurrency 1, timeout 900s per akm command", akm]);
    expect(banner(["--strategy", "other", "--concurrency", "3", "--timeout-ms", "1500"])).toEqual(["  strategy other", "  concurrency 3, timeout 1.5s per akm command", akm]);
    expect(banner([], { FAKE_SPEC: JSON.stringify({ defaultConcurrency: 2, defaultTimeoutMs: 20_000 }) })).toEqual(["  strategy fake-only", "  concurrency 2, timeout 20s per akm command", akm]);
    expect(banner([], { FAKE_NO_STRATEGY: "1" })).toEqual(["  concurrency 1, timeout 900s per akm command", akm]);
    expect(banner([], { FAKE_BATCH: "1" })).toEqual(["  strategy fake-only", "  timeout 900s per akm command", akm]); // there is no pool, so no concurrency to say
  });

  test("the akm line names the build when akm runs from a checkout of it, and is the version alone otherwise", () => {
    setCases(ok(1));
    const repo = mkdtempSync(join(tmpdir(), "run lib akm checkout-"));
    try {
      writeFileSync(join(repo, "package.json"), '{"name":"akm-cli"}');
      writeFileSync(join(repo, "fake-akm.ts"), FAKE_AKM);
      const git = (...args: string[]) => Bun.spawnSync(["git", "-C", repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { stdout: "pipe", stderr: "pipe" });
      for (const args of [["init", "-q"], ["add", "."], ["commit", "-q", "-m", "akm"]]) expect(git(...args).exitCode).toBe(0);
      const build = git("describe", "--always", "--dirty").stdout.toString().trim();
      expect(build).not.toBe("");
      const r = run(["--label", "build"], { MODEL_BASE_URL: echo(), AKM_BIN: commandLine(["bun", join(repo, "fake-akm.ts")]) });
      expect(r.code).toBe(0);
      expect(bannerOf(r.out).at(-1)).toBe(`  akm 0.9.99-test build ${build}`);
      expect(resultsOf("build")[0]?.summary.akm_build).toBe(build);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
    expect(bannerOf(run(["--label", "no-build"], { MODEL_BASE_URL: echo() }).out).at(-1)).toBe("  akm 0.9.99-test");
  });

  test("a run with several corpora and repeats has one banner, once, and the endpoint is sent one request: the model and key of the run, one token to say, before any case", async () => {
    setCases(ok(2));
    setRewrite(ok(2));
    await resetStub();
    const r = run(["--corpus", "all", "--repeat", "2", "--model", "model-x", "--label", "once"], { MODEL_BASE_URL: echo() });
    expect(r.code).toBe(0);
    expect(r.out.match(/^fake: model /gm)).toHaveLength(1);
    expect(r.out.match(/^ {2}search /gm)).toHaveLength(1);
    expect(r.out.indexOf("fake: model ")).toBeLessThan(r.out.indexOf("fake (public): "));
    expect(await sentToStub()).toEqual([{ path: "/echo/v1/chat/completions", authorization: "Bearer model-secret", body: { model: "model-x", messages: [{ role: "user", content: "ping" }], max_tokens: 1 } }]);
    expect(r.calls.filter((c) => c.cmd === "version")).toHaveLength(1);
  });

  test("an endpoint that refuses the connection ends the run with exit code 2 and one message, before a case, a banner or a results folder", () => {
    setCases(ok(2));
    const host = `http://127.0.0.1:${closedPort()}`;
    const folders = everyFolder();
    const r = run(["--label", "refused"], { MODEL_BASE_URL: `${host}/v1/` });
    expect(r.code).toBe(2);
    const [what, check, ...more] = r.err.trim().split("\n");
    expect(what).toStartWith("fake: the model endpoint did not answer: ");
    expect(what).toEndWith(` (${host})`);
    expect(check).toBe("Check MODEL_BASE_URL, MODEL_API_KEY and the model name (the-model); the run made no case.");
    expect(more).toEqual([]); // not a stack
    expect(r.calls.map((c) => c.cmd)).toEqual(["version"]); // akm was probed first, and no case ran
    expect(r.out).toBe("");
    expect(everyFolder()).toEqual(folders); // no results folder was made
  });

  test("an endpoint that answers 401 ends it the same way, with the status and the start of its body in the message, and not the key", () => {
    setCases(ok(1));
    const folders = everyFolder();
    const r = run(["--label", "denied"], { MODEL_BASE_URL: `${stub}/denied/v1` });
    expect(r.code).toBe(2);
    const [what, check, ...more] = r.err.trim().split("\n");
    expect(what).toStartWith(`fake: the model endpoint did not answer: HTTP 401 from ${stub}: {"error":{"message":"Incorrect API key provided: <MODEL_API_KEY>. xxxx`);
    expect(what.slice(what.indexOf(": {") + 2)).toHaveLength(200); // the first 200 characters of the body
    expect(check).toBe("Check MODEL_BASE_URL, MODEL_API_KEY and the model name (the-model); the run made no case.");
    expect(more).toEqual([]);
    expect(r.err).not.toContain("model-secret");
    expect(r.calls.map((c) => c.cmd)).toEqual(["version"]);
    expect(r.out).toBe("");
    expect(everyFolder()).toEqual(folders);
  });

  test("a run that stops before the version probe sends the endpoint nothing, and an akm that cannot run is said before an endpoint that does not answer", async () => {
    await resetStub();
    for (const args of [["--help"], ["--bogus"], ["--cases", join(tree, "no such notes")]]) run(args);
    const noAkm = run(["--label", "no-akm"], { AKM_BIN: commandLine([join(tree, "no-akm")]), MODEL_BASE_URL: `http://127.0.0.1:${closedPort()}/v1` });
    expect(noAkm.code).toBe(2);
    expect(noAkm.err).toContain("could not run");
    expect(noAkm.err).not.toContain("did not answer");
    run(["--label", "no-akm-stub"], { AKM_BIN: commandLine([join(tree, "no-akm")]) });
    expect(await sentToStub()).toEqual([]);
  });

  test("AKM_EVAL_NO_PROBE=1 skips the request and the banner says so; any other value leaves it", async () => {
    setCases(ok(1));
    await resetStub();
    const refusing = `http://127.0.0.1:${closedPort()}`;
    const skipped = run(["--label", "no-probe"], { AKM_EVAL_NO_PROBE: "1", MODEL_BASE_URL: `${refusing}/v1` }); // an endpoint that would refuse
    expect(skipped.code).toBe(0);
    expect(skipped.out).toStartWith(`fake: model the-model at ${refusing} (provider openai, not probed)\n  search keyword\n`);
    expect(run(["--label", "no-probe-stub"], { AKM_EVAL_NO_PROBE: "1" }).code).toBe(0);
    expect(await sentToStub()).toEqual([]);
    for (const other of ["0", "true", ""]) {
      await resetStub();
      expect([other, run(["--label", "probe-stays"], { AKM_EVAL_NO_PROBE: other }).code]).toEqual([other, 0]);
      expect([other, (await sentToStub()).length]).toEqual([other, 1]);
    }
    expect(run(["--label", "probe-refused"], { AKM_EVAL_NO_PROBE: "yes", MODEL_BASE_URL: `${refusing}/v1` }).code).toBe(2);
  });
});

describe("the cases of a run", () => {
  test("each case gets a progress line with its counter, and a row in samples.jsonl", () => {
    setCases([...ok(9), ...bad(2)]);
    const r = run(["--label", "progress"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("fake (public): 11 of 11 cases, one at a time\n");
    const counters = [...r.out.matchAll(/^ {2}\[ ?(\d+)\/11\] (\S+) +(ok|error)$/gm)];
    expect(counters.map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.out).toContain("  [ 1/11] ok0    ok\n");
    expect(r.out).toContain("  [11/11] bad1   error\n");
    expect(r.out).toContain("fake public: 11 of 11 cases, 2 errored\n"); // printSummary, after the file is written
    const [done] = resultsOf("progress");
    expect(done?.rows.map((row) => row.id)).toEqual(counters.map((m) => m[2]));
  });

  test("--limit takes the first cases, and the summary says how many there were", () => {
    setCases(ok(6));
    const r = run(["--limit", "2", "--label", "limited"]);
    const [done] = resultsOf("limited");
    expect(started(r.calls)).toEqual(["ok0", "ok1"]);
    expect(done?.summary).toMatchObject({ limit: 2, n_cases: 6, n_run: 2 });
  });

  test("the summary has the common fields and the eval's own, records what the run was made of, and leaves the results folder out of the file", () => {
    setCases(ok(3));
    const r = run(["--limit", "2", "--label", "keys", "--model", "model-x", "--strategy", "other"]);
    expect(r.code).toBe(0);
    const [done] = resultsOf("keys");
    const s = done?.summary;
    expect(Object.keys(s).sort()).toEqual(
      ["eval", "corpus", "corpus_folder", "label", "date", "git_commit", "model", "akm_version", "akm_bin", "akm_build", "akm_build_fingerprint", "limit", "strategy", "config_patch", "config", "engine", "assets_sha256", "seed", "status", "aborted_reason", "n_cases", "n_run", "n_scored", "n_errored", "model_calls", "semantic_verification", "concurrency", "timeout_ms", "manifest", "timeouts", "metrics", "extras", "wall_seconds"].sort(),
    );
    expect(s).toMatchObject({
      eval: "fake", corpus: "public", corpus_folder: null, label: "keys", model: "model-x", akm_version: "0.9.99-test", akm_build: null, akm_build_fingerprint: null, limit: 2, strategy: "other", config_patch: null,
      assets_sha256: createHash("sha256").update(readFileSync(join(tree, "evals", "fake", "assets", "cases.jsonl"))).update("|3").digest("hex"), seed: null, status: "complete", aborted_reason: null, // the fixture digests the file and how many cases it holds
      n_cases: 3, n_run: 2, n_scored: 2, n_errored: 0, timeouts: 0, metrics: { ok: 2 }, model_calls: null, semantic_verification: null, concurrency: 1, timeout_ms: 900_000, extras: { note: null, selected: 2 },
    });
    expect(s.akm_bin).toContain("fake-akm.ts");
    expect(s.git_commit).toBe("unknown"); // the temp folder is no checkout
    expect(s.wall_seconds).toBeNumber();
    expect(s.config.engines.fake).toMatchObject({ provider: "openai", model: "model-x", endpoint: "<MODEL_BASE_URL>/chat/completions", apiKey: "$MODEL_API_KEY" }); // the endpoint is hidden, and the key is named, never held
    expect(s.engine).toMatchObject({ engine: "fake", model: "model-x", endpoint: stub });
    expect(JSON.stringify(s)).not.toContain("model-secret");
    expect(s.manifest).toMatchObject({ eval: "fake", corpus: "public", collector: { version: "0.1" }, settings: { strategy: "other", config_patch_sha256: null, timeout_ms: 900_000, seed: null }, completion: { selected: ["ok0", "ok1"], scored: ["ok0", "ok1"], errored: [] } });
    expect(Object.keys(s.manifest.cases)).toEqual(["ok0", "ok1"]);
  });

  test("a custom corpus records its folder from the repository root, or none when the folder is outside it, and the eval's setup and extras reach the manifest and the summary", () => {
    const inside = folderOf("my notes", ok(2));
    const outside = mkdtempSync(join(tmpdir(), "run lib outside-"));
    try {
      writeFileSync(join(outside, "cases.jsonl"), lines(ok(2)));
      const a = run(["--cases", inside, "--label", "inside", "--note", "one"]);
      const b = run(["--cases", outside, "--label", "outside", "--note", "two"]);
      expect([a.code, b.code]).toEqual([0, 0]);
      const [x, y] = [resultsOf("inside")[0]?.summary, resultsOf("outside")[0]?.summary];
      expect([x.corpus, x.corpus_folder, x.seed, x.extras]).toEqual(["custom", "my notes", null, { note: "one", selected: 2, sandbox_alive: null }]);
      expect([y.corpus, y.corpus_folder, y.seed, y.extras]).toEqual(["custom", null, null, { note: "two", selected: 2, sandbox_alive: null }]);
      expect(JSON.stringify(y)).not.toContain(outside); // the folder of a corpus can name what is in it
      expect(a.contexts.map((c) => c.note)).toEqual(["one", "one"]); // what setup returned for the corpus is in the context of every case
      // what the run adds to a case's input is in its digest: the same case with another note is another input
      expect(x.manifest.cases.ok0.input_sha256).not.toBe(y.manifest.cases.ok0.input_sha256);
      expect(x.manifest.cases.ok0.label_sha256).toBe(y.manifest.cases.ok0.label_sha256);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("the provider kind of the model reaches the context and the config: openai, or MODEL_PROVIDER", () => {
    setCases(ok(1));
    const plain = run(["--label", "openai"]);
    expect(plain.contexts[0]?.provider).toBe("openai");
    expect(resultsOf("openai")[0]?.summary.config.engines.fake.provider).toBe("openai");
    const other = run(["--label", "anthropic"], { MODEL_PROVIDER: "anthropic" });
    expect(other.contexts[0]?.provider).toBe("anthropic");
    expect(resultsOf("anthropic")[0]?.summary.config.engines.fake.provider).toBe("anthropic");
  });
});

describe("--concurrency and --timeout-ms", () => {
  test("the context of every case has them: the defaults without the flags, and the flags' values with them", () => {
    setCases(ok(2));
    const plain = run(["--label", "defaults"]);
    expect(plain.contexts.map((c) => [c.timeoutMs, c.concurrency])).toEqual([[900_000, 1], [900_000, 1]]);
    const set = run(["--label", "flags", "--concurrency", "2", "--timeout-ms", "1234", "--limit", "2"]);
    expect(set.contexts.map((c) => [c.timeoutMs, c.concurrency, c.limit])).toEqual([[1234, 2, 2], [1234, 2, 2]]);
    const [done] = resultsOf("flags");
    expect([done?.summary.concurrency, done?.summary.timeout_ms, done?.summary.manifest.settings.timeout_ms]).toEqual([2, 1234, 1234]); // the timeout the run had, not null
  });

  test("an akm command that runs past --timeout-ms is killed, and its case is an errored row marked timed_out", () => {
    setCases(held(2, "stuck")); // each waits for a gate that is never opened, so only the timeout ends it
    const r = run(["--label", "timeout", "--timeout-ms", "600"], gates().env);
    expect(r.code).toBe(0);
    const [done] = resultsOf("timeout");
    expect(done?.rows).toMatchObject([
      { id: "stuck0", outcome: "error", timed_out: true, error: "akm case timed out after 0.6s" },
      { id: "stuck1", outcome: "error", timed_out: true, error: "akm case timed out after 0.6s" },
    ]);
    expect(done?.summary).toMatchObject({ n_run: 2, n_scored: 0, n_errored: 2, timeouts: 2, timeout_ms: 600 });
  });

  test("with --concurrency 3 three cases are running at once, and without it one: held cases show how many have begun while none has ended", async () => {
    setCases(held(4));
    for (const [flags, running] of [[["--concurrency", "3"], 3], [[], 1]] as const) {
      const gate = gates();
      const r = launch([...flags, "--label", `pool-${running}`], gate.env);
      await until(() => started(r.calls()).length >= running);
      await Bun.sleep(300); // a case that should not have begun yet has had the time to
      expect(started(r.calls())).toHaveLength(running);
      expect(ended(r.calls())).toEqual([]);
      gate.release("held0", "held1", "held2", "held3");
      const done = await r.done;
      expect(done.code).toBe(0);
      expect(started(done.calls)).toHaveLength(4);
      expect(done.out).toContain(`fake (public): 4 of 4 cases, ${running === 1 ? "one" : running} at a time\n`);
    }
  });

  test("with --concurrency 3 every case has a row, and the summary is the one --concurrency 1 makes except for its timing and the concurrency it records", () => {
    const cases: Case[] = [...ok(8).map((c, i) => ({ ...c, ms: 60 * ((i * 5) % 4) })), { id: "bad-a", fail: "boom", ms: 40 }, { id: "bad-b", fail: "boom", ms: 120 }];
    setCases(cases);
    const serial = run(["--label", "same1", "--concurrency", "1"]);
    const pooled = run(["--label", "same3", "--concurrency", "3"]);
    expect([serial.code, pooled.code]).toEqual([0, 0]);
    const [a, b] = [resultsOf("same1")[0], resultsOf("same3")[0]];
    expect(b?.rows.map((r) => r.id).sort()).toEqual(cases.map((c) => c.id).sort());
    expect(started(pooled.calls).sort()).toEqual(cases.map((c) => c.id).sort());
    const strip = ({ date: _d, wall_seconds: _w, concurrency: _c, label: _l, ...rest }: any) => rest;
    expect(strip(b?.summary)).toEqual(strip(a?.summary));
    expect([a?.summary.concurrency, b?.summary.concurrency]).toEqual([1, 3]);
    expect(b?.summary).toMatchObject({ n_run: 10, n_scored: 8, n_errored: 2, status: "complete" });
    const bare = (rows: any[]) => rows.map(({ seconds: _s, ...rest }) => rest).sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(bare(b?.rows ?? [])).toEqual(bare(a?.rows ?? []));
    // the progress counter counts the cases that have finished, in the order they finish
    expect([...pooled.out.matchAll(/^ {2}\[ ?(\d+)\/10\]/gm)].map((m) => Number(m[1]))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  test("rows go to samples.jsonl as their cases finish, and to the summary in the order of the cases", async () => {
    setCases([{ id: "first", gate: "first" }, ...ok(4)]);
    const gate = gates();
    const r = launch(["--label", "order", "--concurrency", "2"], gate.env);
    await until(() => writtenBy("order").length === 4); // the other four are done and written while the first is held
    gate.release("first");
    expect((await r.done).code).toBe(0);
    const [done] = resultsOf("order");
    expect(done?.rows.map((row) => row.id)).toEqual(["ok0", "ok1", "ok2", "ok3", "first"]); // in the order they finished
    expect(done?.summary.metrics.order).toEqual(["first", "ok0", "ok1", "ok2", "ok3"]); // what the eval's summarize is given: the order of the cases
    expect(done?.summary.manifest.completion.selected).toEqual(["first", "ok0", "ok1", "ok2", "ok3"]);
    expect(done?.summary.manifest.completion.scored).toEqual(["first", "ok0", "ok1", "ok2", "ok3"]);
  });
});

describe("what a spec can set", () => {
  test("defaultConcurrency and defaultTimeoutMs are the defaults of the flags, in --help and in the context of every case, and the flags win", () => {
    setCases(ok(4));
    const spec = { FAKE_SPEC: JSON.stringify({ defaultConcurrency: 2, defaultTimeoutMs: 20_000 }) };
    const help = run(["--help"], spec).out;
    expect(help).toContain("  --concurrency  run N cases at a time. Default: 2.\n");
    expect(help).toContain("  --timeout-ms   stop an akm command that is still running after N milliseconds. Default: 20000.\n");
    const plain = run(["--label", "spec-defaults"], spec);
    expect(plain.contexts.map((c) => [c.concurrency, c.timeoutMs])).toEqual(Array(4).fill([2, 20_000]));
    expect(resultsOf("spec-defaults")[0]?.summary).toMatchObject({ concurrency: 2, timeout_ms: 20_000 });
    const flags = run(["--label", "spec-flags", "--concurrency", "1", "--timeout-ms", "30000"], spec);
    expect(flags.contexts.map((c) => [c.concurrency, c.timeoutMs])).toEqual(Array(4).fill([1, 30_000]));
  });

  test("the pool is as wide as defaultConcurrency says: with 2 two held cases are running at once", async () => {
    setCases(held(3));
    const gate = gates();
    const r = launch(["--label", "spec-pool"], { ...gate.env, FAKE_SPEC: JSON.stringify({ defaultConcurrency: 2 }) });
    await until(() => started(r.calls()).length >= 2);
    await Bun.sleep(300);
    expect(started(r.calls())).toHaveLength(2);
    gate.release("held0", "held1", "held2");
    expect((await r.done).code).toBe(0);
  });

  test("minAkm is optional: without it the usage says akm is needed, and no akm is warned of", () => {
    setCases(ok(1));
    const spec = { FAKE_SPEC: JSON.stringify({ minAkm: null }) };
    expect(run(["--help"], spec).out).toEndWith(`\n\nNeeds akm on PATH, or in AKM_BIN.\n${PROBE_NOTE}\n`);
    const old = run(["--label", "no-minimum"], { ...spec, FAKE_VERSION: "0.1.0" });
    expect([old.code, old.err]).toEqual([0, ""]);
  });

  test("casesFile names the file of a custom corpus, and rewrite: false leaves the custom corpus to --cases alone", () => {
    mkdirSync(join(tree, "json notes"), { recursive: true });
    writeFileSync(join(tree, "json notes", "cases.json"), lines(ok(2)));
    const spec = { FAKE_SPEC: JSON.stringify({ casesFile: "cases.json", rewrite: false }), FAKE_CASES_FILE: "cases.json" };
    const own = run(["--cases", join(tree, "json notes"), "--label", "casesfile"], spec);
    expect(own.code).toBe(0);
    expect(resultsOf("casesfile")[0]?.summary).toMatchObject({ corpus: "custom", corpus_folder: "json notes", n_cases: 2 });
    const missing = run(["--cases", join(tree, "elsewhere")], spec);
    expect(missing.err.trim()).toBe(`fake: --cases ${join(tree, "elsewhere")}: elsewhere/cases.json does not exist. The folder of a custom corpus holds cases.json, as assets/ does.`);
    const noRewrite = run(["--corpus", "custom"], spec);
    expect([noRewrite.code, noRewrite.err.trim(), noRewrite.calls]).toEqual([2, "fake: fake has no rewrite: its custom corpus is a folder of your own cases. Use --cases DIR", []]);
  });

  test("selectCases is given the context and assetsSha256 the cases, so an eval's own flag can select and its digest can cover what was loaded", () => {
    setCases(ok(5));
    const r = run(["--label", "reversed", "--note", "reverse", "--limit", "2"]);
    expect(started(r.calls)).toEqual(["ok4", "ok3"]);
    const [done] = resultsOf("reversed");
    expect(done?.summary).toMatchObject({ n_cases: 5, n_run: 2 });
    expect(done?.summary.assets_sha256).toBe(createHash("sha256").update(readFileSync(join(tree, "evals", "fake", "assets", "cases.jsonl"))).update("|5").digest("hex"));
  });
});

describe("a spec with no strategy", () => {
  test("has no --strategy in its usage and refuses it as a flag, keeps --config-patch and --semantic, and its summary has no strategy", () => {
    setCases(ok(2));
    const none = { FAKE_NO_STRATEGY: "1" };
    const help = run(["--help"], none).out;
    expect(help).not.toContain("--strategy");
    expect(help).toContain("[--note TEXT] [--config-patch FILE] [--label NAME]");
    expect(help).toContain("  --semantic      enable native bge-small-en-v1.5 semantic search");
    expect(help).toContain("  --config-patch  FILE: a JSON file deep-merged");
    const refused = run(["--strategy", "other"], none);
    expect([refused.code, refused.calls]).toEqual([2, []]);
    expect(refused.err).toContain("Unknown option '--strategy'");

    const patch = join(tree, "patch.json");
    writeFileSync(patch, '{"engines":{"fake":{"temperature":0.3}}}');
    const r = run(["--label", "no-strategy", "--config-patch", patch], none);
    expect(r.code).toBe(0);
    expect(r.contexts.map((c) => c.strategy)).toEqual(["", ""]); // overrides.strategy is empty, not a name
    const s = resultsOf("no-strategy")[0]?.summary;
    expect("strategy" in s).toBe(false); // not null: the key is not there
    expect(s.config_patch).toEqual({ path: "patch.json", sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(s.config.engines.fake.temperature).toBe(0.3); // the patch is merged as it is for a spec with a strategy
    expect(s.manifest.settings).toEqual({ strategy: null, config_patch_sha256: s.config_patch.sha256, timeout_ms: 900_000, seed: null });
  });

  test("a spec that has one records it in the summary and the manifest, and --strategy replaces it in both and in the context", () => {
    setCases(ok(1));
    run(["--label", "strategy-default"]);
    const r = run(["--label", "strategy-flag", "--strategy", "other"]);
    expect(resultsOf("strategy-default")[0]?.summary).toMatchObject({ strategy: "fake-only", manifest: { settings: { strategy: "fake-only" } } });
    expect(resultsOf("strategy-flag")[0]?.summary).toMatchObject({ strategy: "other", manifest: { settings: { strategy: "other" } } });
    expect(r.contexts[0]?.strategy).toBe("other");
  });
});

describe("a spec that is not one case after another", () => {
  test("openRun's resources are in the context of the cases and of the summary's own fields, and are closed after the cases and before the model calls are counted", () => {
    setCases(ok(3));
    const shared = run(["--label", "shared"], { FAKE_SHARED: "1", FAKE_USAGE: "1" });
    expect(shared.code).toBe(0);
    expect(shared.events).toEqual(["open", "close"]);
    const sandboxes = (calls: any[]) => new Set(calls.filter((c) => c.cmd === "case" && c.edge === "start").map((c) => c.data));
    expect(sandboxes(shared.calls).size).toBe(1); // one sandbox for the three cases
    const s = resultsOf("shared")[0]?.summary;
    expect(s.extras.sandbox_alive).toBe(true); // summaryExtras was asked while the sandbox was there
    expect(s.model_calls).toMatchObject({ calls: 3, errors: 0 }); // closing the sandbox counted its calls, so close came before model_calls was taken
    // without the hook each case has a sandbox of its own, which the eval removes
    const own = run(["--label", "own"], { FAKE_USAGE: "1" });
    expect(sandboxes(own.calls).size).toBe(3);
    expect(own.events).toEqual([]);
    expect(resultsOf("own")[0]?.summary).toMatchObject({ extras: { sandbox_alive: null }, model_calls: { calls: 3 } });
  });

  test("a run of each corpus and each repeat opens its own and closes it before its summary", () => {
    setCases(ok(2));
    setRewrite(ok(2));
    const r = run(["--label", "shared-twice", "--corpus", "all", "--repeat", "2"], { FAKE_SHARED: "1", FAKE_USAGE: "1" });
    expect(r.code).toBe(0);
    expect(r.events).toEqual(Array(4).fill(["open", "close"]).flat());
    expect(resultsOf("shared-twice").map((d) => d.summary.model_calls.calls)).toEqual([2, 2, 2, 2]); // each summary has the calls of its own sandbox, and no other's
  });

  test("close runs when the cases throw, so that no sandbox is left behind", () => {
    setCases([...ok(1), { id: "boom", throw: true }]);
    const r = run(["--label", "threw"], { FAKE_SHARED: "1" }); // run() also checks that nothing is left in TMPDIR
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("the fixture threw boom");
    expect(r.events).toEqual(["open", "close"]);
  });

  test("collectAll runs the cases in place of the pool: record writes the rows and the progress lines, and the rows it returns are the summary's", () => {
    setCases(ok(4));
    const r = run(["--label", "batch"], { FAKE_BATCH: "1" });
    expect(r.code).toBe(0);
    expect(r.out).toContain("fake (public): 4 of 4 cases\n"); // there is no pool, so no "at a time"
    expect([...r.out.matchAll(/^ {2}\[(\d)\/4\] (\S+)/gm)].map((m) => [m[1], m[2]])).toEqual([["1", "ok3"], ["2", "ok2"], ["3", "ok1"], ["4", "ok0"]]);
    const [done] = resultsOf("batch");
    expect(done?.rows.map((row) => row.id)).toEqual(["ok3", "ok2", "ok1", "ok0"]);
    expect(done?.summary.metrics.order).toEqual(["ok3", "ok2", "ok1", "ok0"]); // the rows it returned, as it returned them
    expect(done?.summary).toMatchObject({ status: "complete", aborted_reason: null, n_run: 4, n_scored: 4 });
    expect(done?.summary.manifest.completion.selected).toEqual(["ok0", "ok1", "ok2", "ok3"]);
  });

  test("a spec with collectAll has no --concurrency, and gives up for its own reason", () => {
    setCases(ok(2));
    const batch = { FAKE_BATCH: "1" };
    const help = run(["--help"], batch).out;
    expect(help).not.toContain("--concurrency");
    expect(help).toContain("  --timeout-ms   stop an akm command");
    const refused = run(["--concurrency", "2"], batch);
    expect([refused.code, refused.calls]).toEqual([2, []]);
    expect(refused.err).toContain("Unknown option '--concurrency'");
    const gaveUp = run(["--label", "batch-abort"], { ...batch, FAKE_BATCH_ABORT: "the batch saw no verdict" });
    expect(gaveUp.code).toBe(1);
    expect(gaveUp.err.trim().split("\n")).toEqual(["fake: the batch saw no verdict", CHECK]);
    expect(resultsOf("batch-abort")[0]?.summary).toMatchObject({ status: "aborted", aborted_reason: "the batch saw no verdict", n_run: 2 });
    expect(gaveUp.out).toContain("fake public: 2 of 2 cases, 0 errored\n"); // the summary is written and printed before the run fails
  });

  test("a row that collectAll records for a case that was not selected is a bug of the eval, and stops the run", () => {
    setCases(ok(2));
    const r = run(["--label", "stray"], { FAKE_BATCH: "stray" });
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("fake: a row for nobody, which is not a case that was selected");
  });

  test("abortReason gives up on what only all the rows show, when the pool has not, and the pool's own reason comes first", () => {
    const check = { FAKE_ABORT: "1" };
    setCases(bad(3));
    const r = run(["--label", "none-ok"], check);
    expect(r.code).toBe(1);
    expect(r.err.trim().split("\n")).toEqual(["fake: no case was ok, so there is no result", CHECK]);
    expect(resultsOf("none-ok")[0]?.summary).toMatchObject({ status: "aborted", aborted_reason: "no case was ok, so there is no result", n_run: 3, n_errored: 3 });
    expect(r.out).toContain("fake public: 3 of 3 cases, 3 errored\n"); // the summary is written and printed before the run fails
    setCases([...bad(2), ...ok(1)]); // one is ok
    expect(run(["--label", "one-ok"], check).code).toBe(0);
    setCases(bad(6)); // five errors in a row stop the pool first
    const pool = run(["--label", "pool-first"], check);
    expect(pool.err).toContain("fake: 5 cases in a row errored, so the run stopped after 5 of 6.");
    expect(pool.err).not.toContain("no case was ok");
  });
});

describe("the run gives up", () => {
  test("after five errored rows in a row: no case starts after them, the summary says aborted and why, and the run fails with exit code 1 and what to check", () => {
    setCases([...bad(8)]);
    const r = run(["--label", "giveup"]);
    expect(r.code).toBe(1);
    const reason = expect.stringMatching(/^5 cases in a row errored, so the run stopped after 5 of 8\. Last error: akm case failed \(exit 70\): .*boom/);
    expect(r.err.trim().split("\n")).toEqual([expect.stringMatching(/^fake: 5 cases in a row errored, so the run stopped after 5 of 8\. Last error: .*boom/), CHECK]);
    expect(started(r.calls)).toEqual(["bad0", "bad1", "bad2", "bad3", "bad4"]);
    const [done] = resultsOf("giveup");
    expect(done?.rows).toHaveLength(5);
    expect(done?.summary).toMatchObject({ status: "aborted", aborted_reason: reason, n_cases: 8, n_run: 5, n_scored: 0, n_errored: 5 });
    expect(done?.summary.manifest.completion).toEqual({ selected: ["bad0", "bad1", "bad2", "bad3", "bad4", "bad5", "bad6", "bad7"], scored: [], errored: ["bad0", "bad1", "bad2", "bad3", "bad4"] });
    expect(r.out).toContain("fake public: 5 of 8 cases, 5 errored\n"); // the summary is printed before the run fails
    expect(existsSync(join(done?.folder ?? "", ".running"))).toBe(false);
  });

  test("a row that is not errored starts the count again", () => {
    setCases([...bad(4, 0, "x"), ...ok(1), ...bad(4, 0, "y")]);
    const r = run(["--label", "reset"]);
    expect(r.code).toBe(0);
    expect(resultsOf("reset")[0]?.summary).toMatchObject({ status: "complete", aborted_reason: null, n_run: 9, n_errored: 8 });
  });

  test("the count is of rows in the order they finish: a good case that finishes before the fifth error, however early it began, is in the way of none", async () => {
    // In the order of the cases bad0, ok0, bad1..bad4 are never five errors in a row. bad0 is held until ok0 and bad1..bad4 are done, so in the order they
    // finish they are ok0, bad1..bad4 and then bad0, the fifth error.
    setCases([{ id: "bad0", fail: "boom", gate: "bad0" }, ...ok(1), ...bad(5).slice(1)]);
    const gate = gates();
    const r = launch(["--label", "finish", "--concurrency", "2"], gate.env);
    await until(() => writtenBy("finish").length === 5);
    gate.release("bad0");
    expect((await r.done).code).toBe(1);
    expect(resultsOf("finish")[0]?.summary).toMatchObject({ status: "aborted", n_run: 6, n_errored: 5 });
    // the same cases, finishing in the order of the cases, are not five in a row
    setCases([{ id: "bad0", fail: "boom" }, ...ok(1), ...bad(5).slice(1)]);
    expect(run(["--label", "finish-in-order"]).code).toBe(0);
  });

  test("with several cases running, no new one starts once the fifth error is in, and those running finish and are kept", () => {
    setCases(bad(14, 100));
    const r = run(["--label", "pooled", "--concurrency", "3"]);
    expect(r.code).toBe(1);
    const [done] = resultsOf("pooled");
    const n = done?.rows.length ?? 0;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(5 + 2); // the fifth error leaves at most two others running
    expect(done?.summary).toMatchObject({ status: "aborted", n_run: n, n_errored: n, n_cases: 14 });
    expect(started(r.calls)).toHaveLength(n); // every case that began has its row
    expect(r.calls.filter((c) => c.cmd === "case" && c.edge === "end")).toHaveLength(n);
    expect(r.err).toContain(`fake: 5 cases in a row errored, so the run stopped after ${n} of 14.`);
    expect(r.err).toContain(CHECK);
  });

  test("a run with --repeat that gives up in its first run stops there", () => {
    setCases(bad(6));
    const r = run(["--label", "repeat-giveup", "--repeat", "2"]);
    expect(r.code).toBe(1);
    expect(resultsOf("repeat-giveup").map((d) => d.summary.label)).toEqual(["repeat-giveup-r1"]);
  });
});
