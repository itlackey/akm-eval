import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ENTRIES, LABEL, type ChatRequest, type Stub, columnsWithRefs, completion, describeRow, promptOf, readSamples, readSummary, runEntry, schemaOf, smokeFolders, startStub, stubEnv } from "./lib.ts";
import type { Schema } from "./schema.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");

const dirs: string[] = [];
const stubs: Stub[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const s of stubs.splice(0)) s.stop();
});

const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "smoke-test-"));
  dirs.push(d);
  return d;
};

const stub = (): Stub => {
  const s = startStub();
  stubs.push(s);
  return s;
};

describe("the stub model", () => {
  test("answers POST /v1/chat/completions with a message of {} and token counts, and counts the calls", async () => {
    const s = stub();
    const res = await fetch(`${s.url}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "m1", messages: [] }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.choices[0].message).toEqual({ role: "assistant", content: "{}" });
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.model).toBe("m1");
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens + body.usage.completion_tokens);
    expect(JSON.parse(body.choices[0].message.content)).toEqual({});
    expect(s.calls()).toBe(1);
    expect(s.unexpected()).toEqual([]);
  });

  test("answers a body that is not JSON too, and anything else is a 404 that it remembers", async () => {
    const s = stub();
    expect((await fetch(`${s.url}/chat/completions`, { method: "POST", body: "not json" })).status).toBe(200);
    expect((await fetch(`${s.url}/chat/completions`, { method: "POST", body: "null" })).status).toBe(200); // JSON, but not a request
    expect(s.calls()).toBe(2);
    s.reset();
    expect((await fetch(`${s.url}/chat/completions`, { method: "POST", body: "not json" })).status).toBe(200);
    expect(s.calls()).toBe(1);
    const other = await fetch(`${s.url}/responses`, { method: "POST", body: "{}" });
    expect(other.status).toBe(404);
    expect(((await other.json()) as any).error.message).toContain("POST /v1/chat/completions only");
    expect((await fetch(`${s.url}/chat/completions`)).status).toBe(404); // a GET is not a completion
    expect(s.calls()).toBe(1);
    expect(s.unexpected()).toEqual(["POST /v1/responses", "GET /v1/chat/completions"]);
    s.reset();
    expect(s.calls()).toBe(0);
    expect(s.unexpected()).toEqual([]);
  });

  test("completion() is a chat completion object", () => {
    expect(completion("x")).toMatchObject({ object: "chat.completion", model: "x", choices: [{ index: 0, message: { content: "{}" } }] });
    expect(completion("x", "ok")).toMatchObject({ choices: [{ message: { role: "assistant", content: "ok" } }] });
  });

  const ask = (s: Stub, body: unknown) => fetch(`${s.url}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json() as Promise<any>);
  const schema = { type: "object", required: ["a", "b"], properties: { a: { type: "string" }, b: { type: "string" } } };
  const withSchema = { model: "m", messages: [{ role: "system", content: "s" }, { role: "user", content: "first" }, { role: "assistant", content: "{}" }, { role: "user", content: "the last question" }], response_format: { type: "json_schema", json_schema: { name: "akm_response", schema } } };

  test("answers with the reply of the answerer it is given, and tells it the request", async () => {
    const asked: unknown[] = [];
    const s = startStub((req) => {
      asked.push(req);
      return "from the answerer";
    });
    stubs.push(s);
    const body = await ask(s, withSchema);
    expect(body.choices[0].message.content).toBe("from the answerer");
    expect(asked).toEqual([withSchema]);
  });

  test("answer() changes the reply from the next call on, and reset() forgets the calls and keeps the answer", async () => {
    const s = stub();
    expect((await ask(s, withSchema)).choices[0].message.content).toBe("{}");
    s.answer(() => "second");
    expect((await ask(s, withSchema)).choices[0].message.content).toBe("second");
    s.reset();
    expect(s.calls()).toBe(0);
    expect(s.seen()).toEqual([]);
    expect((await ask(s, withSchema)).choices[0].message.content).toBe("second");
  });

  test("remembers the required keys of the schema of each call (null when it sent none), the start of its last user message and the reply", async () => {
    const s = stub();
    await ask(s, withSchema);
    await ask(s, { model: "m", messages: [{ role: "user", content: "Respond with just the word: ok" }] });
    await ask(s, { model: "m", messages: [], response_format: { type: "json_object" } });
    await ask(s, { model: "m", messages: [{ role: "user", content: "x".repeat(300) }], response_format: { type: "json_schema", json_schema: { schema: { type: "object" } } } });
    expect(s.seen()).toEqual([
      { keys: ["a", "b"], prompt: "the last question", reply: "{}" },
      { keys: null, prompt: "Respond with just the word: ok", reply: "{}" },
      { keys: null, prompt: "", reply: "{}" },
      { keys: [], prompt: "x".repeat(120), reply: "{}" },
    ]);
  });

  test("schemaOf and promptOf read what akm sends", () => {
    expect(schemaOf(withSchema as ChatRequest)).toEqual(schema as Schema);
    expect(schemaOf({ response_format: { type: "json_object" } })).toBeUndefined();
    expect(schemaOf({})).toBeUndefined();
    expect(promptOf(withSchema as ChatRequest)).toBe("the last question");
    expect(promptOf({ messages: [{ role: "assistant", content: "x" }] })).toBe("");
    expect(promptOf({ messages: [{ role: "user", content: [{ type: "text", text: "parts" }] }] })).toBe("");
    expect(promptOf({})).toBe("");
  });
});

describe("stubEnv", () => {
  test("points the model and the judge at the stub, with a key of its own, and keeps the rest of the environment", () => {
    const env = stubEnv({ PATH: "/bin", AKM_BIN: "akm", MODEL_BASE_URL: "https://real.example/v1", MODEL_API_KEY: "real-key", JUDGE_API_KEY: "real-judge-key", OPENAI_API_KEY: "x", GONE: undefined }, "http://127.0.0.1:1/v1");
    expect(env).toMatchObject({ PATH: "/bin", AKM_BIN: "akm", OPENAI_API_KEY: "x", AKM_EVAL_ENV_LOADED: "1", MODEL_BASE_URL: "http://127.0.0.1:1/v1", JUDGE_BASE_URL: "http://127.0.0.1:1/v1", MODEL_API_KEY: "smoke-key", JUDGE_API_KEY: "smoke-key", MODEL_NAME: "smoke-model", JUDGE_MODEL: "smoke-model" });
    expect(Object.values(env).join(" ")).not.toContain("real-key");
    expect("GONE" in env).toBe(false);
  });

  test("beats .env in a real run script: lib/env.sh does not read .env over the stub", () => {
    const root = tmp();
    mkdirSync(join(root, "lib"));
    writeFileSync(join(root, "lib", "env.sh"), readFileSync(join(ROOT, "lib", "env.sh")));
    writeFileSync(join(root, ".env"), "MODEL_BASE_URL=https://real.example/v1\nMODEL_API_KEY=real-key\n");
    const out = Bun.spawnSync(["bash", "-c", 'source lib/env.sh; echo "$MODEL_BASE_URL $MODEL_API_KEY"'], { cwd: root, env: stubEnv({ PATH: process.env.PATH }, "http://127.0.0.1:7/v1") });
    expect(out.stdout.toString().trim()).toBe("http://127.0.0.1:7/v1 smoke-key");
  });
});

describe("smokeFolders", () => {
  test("picks the folders made for the label since the run began", () => {
    const before = ["2026-10-10-smoke", "2026-10-10-base"];
    const after = [...before, "2026-10-11-smoke", "2026-10-11-smoke-2", "2026-10-11-smoke-library", "2026-10-11-smoke-books", "2026-10-11-base", "2026-10-11-smokey", "notes.md", "2026-10-11-smoke-repeat-summary.json"];
    expect(smokeFolders(before, after)).toEqual(["2026-10-11-smoke", "2026-10-11-smoke-2", "2026-10-11-smoke-books", "2026-10-11-smoke-library", "2026-10-11-smoke-repeat-summary.json"]);
  });

  test("a folder that was there before is not new, whatever its name", () => {
    expect(smokeFolders(["2026-10-11-smoke"], ["2026-10-11-smoke"])).toEqual([]);
  });
});

describe("what the rows say", () => {
  test("describeRow names the outcome, state, error, reason and detail a row has, and no other key", () => {
    expect(describeRow({ id: "a", outcome: "unusable", reason: "parse_error: x", seconds: 1 })).toBe("outcome: unusable; reason: parse_error: x");
    expect(describeRow({ state: "both notes kept", detail: { nested: true } })).toBe("state: both notes kept");
    expect(describeRow({ id: "a" })).toBe("");
    expect(describeRow({ error: "line one\n  line two" })).toBe("error: line one line two");
    expect(describeRow({ error: "x".repeat(900) }).length).toBe(400);
  });

  test("readSamples counts the rows with an error and reports the first row, and skips lines that are not rows", () => {
    const file = join(tmp(), "samples.jsonl");
    writeFileSync(file, [JSON.stringify({ id: "a", outcome: "ok" }), "not json", "", JSON.stringify({ id: "b", outcome: "error", error: "boom" }), JSON.stringify([1]), JSON.stringify({ id: "c", error: "" })].join("\n"));
    expect(readSamples(file)).toEqual({ errored: 1, first: "outcome: ok" });
    expect(readSamples(join(tmp(), "none.jsonl"))).toEqual({ errored: 0, first: "" });
  });

  test("readSummary gives the object a summary.json holds, and nothing for a missing file, bad JSON or another shape", () => {
    const dir = tmp();
    writeFileSync(join(dir, "ok.json"), JSON.stringify({ status: "complete", n: 1 }));
    writeFileSync(join(dir, "bad.json"), "{");
    writeFileSync(join(dir, "list.json"), "[1]");
    expect(readSummary(join(dir, "ok.json"))).toEqual({ status: "complete", n: 1 });
    expect(readSummary(join(dir, "bad.json"))).toBeUndefined();
    expect(readSummary(join(dir, "list.json"))).toBeUndefined();
    expect(readSummary(join(dir, "none.json"))).toBeUndefined();
  });

  test("columnsWithRefs names the columns that hold a ref in some row, and none for a missing file or a column of another shape", () => {
    const file = join(tmp(), "samples.jsonl");
    writeFileSync(file, [JSON.stringify({ id: "a", search: { refs: [] }, curate: { refs: [] } }), "not json", JSON.stringify({ id: "b", search: { refs: ["skills/x"] }, curate: { refs: [] }, other: { refs: "skills/x" }, flat: ["skills/x"] })].join("\n"));
    expect(columnsWithRefs(file, ["search", "curate", "other", "flat", "gone"])).toEqual(["search"]);
    expect(columnsWithRefs(file, [])).toEqual([]);
    expect(columnsWithRefs(join(tmp(), "none.jsonl"), ["search"])).toEqual([]);
  });
});

/** A repository with one eval whose run script is `body`, and the environment to run it in. */
function fakeRepo(body: string): { root: string; dir: string } {
  const root = tmp();
  const dir = "evals/fake";
  mkdirSync(join(root, dir, "results"), { recursive: true });
  writeFileSync(join(root, dir, "run"), `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(join(root, dir, "run"), 0o755);
  return { root, dir };
}

/** A line of bash that posts to the stub, with bun, which every machine that runs these tests has. */
const post = (path: string) => `bun -e 'await fetch(process.env.MODEL_BASE_URL + "/${path}", { method: "POST", body: "{}" })'`;

const makeFolder = (name = "$(date -u +%F)-smoke") => `mkdir -p "evals/fake/results/${name}"`;
const env = { PATH: process.env.PATH as string };

describe("runEntry", () => {
  test("passes a run that ends and writes a summary.json, whatever it exits with, and gives it the smoke flags", async () => {
    const { root, dir } = fakeRepo(`echo "$@" > args.txt\n${makeFolder()}\nf=evals/fake/results/$(date -u +%F)-smoke\necho '{}' > $f/summary.json\necho '{"id":"a","outcome":"error","error":"boom"}' > $f/samples.jsonl\nexit 1`);
    const s = stub();
    const out = await runEntry({ dir }, { root, env, timeoutMs: 20_000, stub: s });
    expect(readFileSync(join(root, "args.txt"), "utf8").trim()).toBe(`--corpus public --limit 1 --label ${LABEL}`);
    expect(out).toMatchObject({ dir, exit: 1, errored: 1, firstRow: "outcome: error; error: boom" });
    expect(out.folders).toHaveLength(1);
    expect(out.status).toBe("WARN"); // it never called the model, and it was meant to
    expect(out.note).toContain("never reached the model");
  });

  test("passes --akm on when it is given", async () => {
    const { root, dir } = fakeRepo(`echo "$@" > args.txt\n${makeFolder()}\necho '{}' > evals/fake/results/$(date -u +%F)-smoke/summary.json`);
    await runEntry({ dir, model: false }, { root, env, akm: "bun ~/akm/cli.ts", timeoutMs: 20_000 });
    expect(readFileSync(join(root, "args.txt"), "utf8").trim()).toBe("--corpus public --limit 1 --label smoke --akm bun ~/akm/cli.ts");
  });

  test("is ok when the eval reached the model, or calls none", async () => {
    const { root, dir } = fakeRepo(`${makeFolder()}\necho '{}' > evals/fake/results/$(date -u +%F)-smoke/summary.json\n${post("chat/completions")}`);
    const s = stub();
    const out = await runEntry({ dir }, { root, env: stubEnv(process.env, s.url), timeoutMs: 20_000, stub: s });
    expect(out).toMatchObject({ status: "ok", note: "", calls: 1 });
    const none = fakeRepo(`${makeFolder()}\necho '{}' > evals/fake/results/$(date -u +%F)-smoke/summary.json`);
    expect(await runEntry({ dir: none.dir, model: false }, { root: none.root, env, timeoutMs: 20_000, stub: s })).toMatchObject({ status: "ok", calls: 0 });
  });

  test("warns when the eval asked the stub for something it does not serve", async () => {
    const { root, dir } = fakeRepo(`${makeFolder()}\necho '{}' > evals/fake/results/$(date -u +%F)-smoke/summary.json\n${post("responses")}\n${post("chat/completions")}`);
    const s = stub();
    const out = await runEntry({ dir }, { root, env: stubEnv(process.env, s.url), timeoutMs: 20_000, stub: s });
    expect(out.status).toBe("WARN");
    expect(out.note).toContain("POST /v1/responses");
  });

  describe("an eval with no model, which has to show a ref", () => {
    /** A run script that writes a summary.json and a samples.jsonl of one row, whose search and curate answered with these refs. */
    const answering = (search: string[], curate: string[]) => {
      const row = JSON.stringify({ id: "q1", search: { refs: search }, curate: { refs: curate } });
      return fakeRepo(`${makeFolder()}\nf=evals/fake/results/$(date -u +%F)-smoke\necho '{}' > $f/summary.json\necho '${row}' > $f/samples.jsonl`);
    };
    const entry = (dir: string) => ({ dir, model: false as const, answers: ["search", "curate"] });

    test("is ok when search and curate each returned a ref", async () => {
      const { root, dir } = answering(["skills/a"], ["skills/a"]);
      expect(await runEntry(entry(dir), { root, env, timeoutMs: 20_000, stub: stub() })).toMatchObject({ status: "ok", note: "" });
    });

    test("warns when akm answered with no ref, which is what a JSON the eval cannot read looks like, and names the commands", async () => {
      const none = answering([], []);
      const out = await runEntry(entry(none.dir), { root: none.root, env, timeoutMs: 20_000, stub: stub() });
      expect(out).toMatchObject({ status: "WARN", errored: 0 });
      expect(out.note).toContain("search and curate returned no ref");
      const half = answering(["skills/a"], []);
      const one = await runEntry(entry(half.dir), { root: half.root, env, timeoutMs: 20_000 });
      expect(one.status).toBe("WARN");
      expect(one.note).toStartWith("curate returned no ref");
    });

    test("counts a ref from any results folder of the run, such as the library and the books", async () => {
      const library = JSON.stringify({ id: "a", search: { refs: ["x"] }, curate: { refs: [] } });
      const books = JSON.stringify({ id: "b", search: { refs: [] }, curate: { refs: ["y"] } });
      const { root, dir } = fakeRepo(
        [
          "d=evals/fake/results/$(date -u +%F)-smoke",
          'mkdir -p "$d-library" "$d-books"',
          'echo "{}" > "$d-library/summary.json"',
          'echo "{}" > "$d-books/summary.json"',
          `echo '${library}' > "$d-library/samples.jsonl"`,
          `echo '${books}' > "$d-books/samples.jsonl"`,
        ].join("\n"),
      );
      const out = await runEntry(entry(dir), { root, env, timeoutMs: 20_000 });
      expect(out.folders).toHaveLength(2);
      expect(out.status).toBe("ok");
    });

    test("is not asked of an eval that calls a model, whose rows have other keys", async () => {
      const { root, dir } = fakeRepo(`${makeFolder()}\necho '{}' > evals/fake/results/$(date -u +%F)-smoke/summary.json\n${post("chat/completions")}`);
      const s = stub();
      expect(await runEntry({ dir }, { root, env: stubEnv(process.env, s.url), timeoutMs: 20_000, stub: s })).toMatchObject({ status: "ok" });
    });
  });

  test("fails a run that made no results folder, and shows what it printed", async () => {
    const { root, dir } = fakeRepo(`echo "akm 0.0.1 is too old" >&2\nexit 2`);
    const out = await runEntry({ dir }, { root, env, timeoutMs: 20_000 });
    expect(out).toMatchObject({ status: "FAIL", exit: 2, folders: [] });
    expect(out.note).toContain("no results folder");
    expect(out.tail).toContain("akm 0.0.1 is too old");
  });

  test("fails a run whose results folder has no summary.json", async () => {
    const { root, dir } = fakeRepo(`${makeFolder()}\nexit 0`);
    const out = await runEntry({ dir }, { root, env, timeoutMs: 20_000 });
    expect(out.status).toBe("FAIL");
    expect(out.note).toContain("no summary.json");
  });

  test("kills a run that does not end", async () => {
    const { root, dir } = fakeRepo(`${makeFolder()}\nexec sleep 30`);
    const out = await runEntry({ dir }, { root, env, timeoutMs: 400 });
    expect(out).toMatchObject({ status: "FAIL", exit: null });
    expect(out.note).toContain("was killed");
  });

  test("does not mistake an older smoke folder for the run's own", async () => {
    const { root, dir } = fakeRepo(`exit 0`);
    mkdirSync(join(root, dir, "results", "2026-01-01-smoke"));
    writeFileSync(join(root, dir, "results", "2026-01-01-smoke", "summary.json"), "{}");
    const out = await runEntry({ dir }, { root, env, timeoutMs: 20_000 });
    expect(out.status).toBe("FAIL");
    expect(out.folders).toEqual([]);
  });

  test("runs nothing for an entry with a reason to skip", async () => {
    const { root, dir } = fakeRepo(`echo ran > ran.txt`);
    const out = await runEntry({ dir, skip: "needs Docker" }, { root, env, timeoutMs: 20_000 });
    expect(out).toMatchObject({ status: "skipped", note: "needs Docker" });
    expect(existsSync(join(root, "ran.txt"))).toBe(false);
  });
});

describe("ENTRIES", () => {
  const withRun = (parent: string): string[] =>
    readdirSync(join(ROOT, parent))
      .filter((n) => existsSync(join(ROOT, parent, n, "run")))
      .map((n) => `${parent}/${n}`);

  test("lists every eval and benchmark that has a run script, once, and nothing else", () => {
    const found = [...withRun("evals"), ...withRun("benchmarks")].sort();
    expect(ENTRIES.map((e) => e.dir).sort()).toEqual(found);
  });

  test("gives a reason for every one it skips", () => {
    for (const e of ENTRIES) if (e.skip !== undefined) expect(e.skip.trim().length).toBeGreaterThan(5);
    expect(ENTRIES.filter((e) => e.skip).map((e) => e.dir).sort()).toEqual(["benchmarks/longmemeval", "benchmarks/skillret", "benchmarks/terminal-bench", "evals/agent-ab"]);
  });

  test("says what an eval that calls no model must show, since no model call counts for it", () => {
    for (const e of ENTRIES.filter((e) => !e.skip)) {
      if (e.model === false) expect({ dir: e.dir, answers: e.answers }).toEqual({ dir: e.dir, answers: ["search", "curate"] });
      else expect(e.answers).toBeUndefined();
    }
    expect(ENTRIES.filter((e) => e.model === false).map((e) => e.dir)).toEqual(["evals/retrieval"]);
  });

  test("runs every eval that drives akm and uses no Docker and no dataset", () => {
    expect(ENTRIES.filter((e) => !e.skip).map((e) => e.dir)).toEqual(["evals/retrieval", "evals/judge-gate", "evals/reflect", "evals/distill", "evals/consolidate", "evals/extract", "evals/nightly", "evals/promotion", "evals/bakeoff"]);
  });
});

describe("scripts/smoke/run", () => {
  test("--list says what it runs and what it skips", () => {
    const out = Bun.spawnSync(["bash", join(ROOT, "scripts/smoke/run"), "--list"], { cwd: ROOT, env: process.env });
    expect(out.exitCode).toBe(0);
    const text = out.stdout.toString();
    expect(text).toContain("run   evals/reflect");
    expect(text).toContain("skip  evals/agent-ab  (needs Docker)");
    expect(text).toContain("skip  benchmarks/skillret  (downloads the SkillRet dataset)");
  });

  test("--help prints the usage, and an unknown name or flag is a usage error", () => {
    const run = (...args: string[]) => Bun.spawnSync(["bash", join(ROOT, "scripts/smoke/run"), ...args], { cwd: ROOT, env: process.env });
    expect(run("--help").stdout.toString()).toContain("Usage: scripts/smoke/run");
    expect(run("--help").stdout.toString()).toContain("--contract");
    const bad = run("--only", "nope");
    expect(bad.exitCode).toBe(2);
    expect(bad.stderr.toString()).toContain('--only names "nope"');
    expect(run("--bogus").exitCode).toBe(2);
  });

  test("fails with a message when no akm can be run, in the contract mode too", () => {
    for (const mode of [[], ["--contract"]]) {
      const out = Bun.spawnSync(["bash", join(ROOT, "scripts/smoke/run"), ...mode, "--akm", "/nonexistent/akm"], { cwd: ROOT, env: process.env });
      expect(out.exitCode).toBe(2);
      expect(out.stderr.toString()).toContain("could not run");
    }
  });
});
