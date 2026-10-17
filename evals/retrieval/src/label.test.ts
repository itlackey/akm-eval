import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createSandbox } from "../../../lib/akm/akm.ts";
import type { Answer } from "./akm.ts";
import { Bm25 } from "./bm25.ts";
import { type Judge, LEGACY_JUDGE, grade, labelCollection, makeJudge, pending, poolFromSamples, poolQueries, readRun, stampLegacy, staleKeys } from "./label.ts";
import { type Asset, PROMPT_SHA256, type Qrel, type Query, assetSha256, gradesByQuery, parseQrels } from "./lib.ts";
import type { Folders } from "./run.ts";

const dirs: string[] = [];
let server: ReturnType<typeof Bun.serve> | undefined;
afterEach(() => {
  server?.stop(true);
  server = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "retrieval-label-"));
  dirs.push(d);
  return d;
};

const queries: Query[] = [
  { id: "q1", query: "print the pdf", kind: "direct" },
  { id: "q2", query: "write tests", kind: "paraphrase" },
];
const answer = (refs: string[]): Answer => ({ refs, assets: [], mode: "keyword", seconds: 0 });

describe("poolQueries", () => {
  const bm25 = new Bm25([
    { ref: "a/print", text: "print the pdf for the printer" },
    { ref: "b/tests", text: "write tests" },
    { ref: "c/other", text: "nothing" },
  ]);

  test("pools the top of akm search, akm curate and BM25 for each query", async () => {
    const ask = async (system: "search" | "curate", query: string) => answer(query === "print the pdf" ? (system === "search" ? ["x/1", "a/print"] : ["x/2", "x/1"]) : ["b/tests"]);
    const pooled = await poolQueries(queries, ask, bm25, 10);
    expect(pooled.get("q1")).toEqual(["x/1", "a/print", "x/2"]);
    expect(pooled.get("q2")).toEqual(["b/tests"]);
  });

  test("adds the assets the author expected, graded like any other pooled asset", async () => {
    const ask = async () => answer(["x/1"]);
    const withExpected: Query[] = [{ ...queries[0], expected: ["a/print", "e/never-returned"] }, queries[1]];
    const pooled = await poolQueries(withExpected, ask, bm25, 10);
    expect(pooled.get("q1")).toEqual(["x/1", "a/print", "e/never-returned"]);
    expect(pooled.get("q2")).toEqual(["x/1", "b/tests"]);
  });

  test("takes only the top `depth` of each list", async () => {
    const ask = async (system: "search" | "curate") => answer(system === "search" ? ["s/1", "s/2", "s/3"] : ["c/1", "c/2", "c/3"]);
    const pooled = await poolQueries([queries[0]], ask, bm25, 2);
    expect(pooled.get("q1")).toEqual(["s/1", "s/2", "c/1", "c/2", "a/print"]);
  });

  test("stops when akm fails, since a pool without akm's results would be half a pool", async () => {
    const ask = async (system: "search" | "curate") => (system === "curate" ? { refs: [], assets: [], mode: null, seconds: 0, error: "akm curate exited 70: boom" } : answer(["a"]));
    await expect(poolQueries(queries, ask, bm25, 10)).rejects.toThrow("q1: akm curate exited 70: boom");
  });
});

describe("pending", () => {
  const pooled = new Map([
    ["q1", ["a", "b", "c"]],
    ["q2", ["a", "d"]],
  ]);

  test("lists the pooled pairs that have no grade, in query order", () => {
    expect(pending(queries, pooled, new Set())).toEqual([
      { id: "q1", query: "print the pdf", ref: "a" },
      { id: "q1", query: "print the pdf", ref: "b" },
      { id: "q1", query: "print the pdf", ref: "c" },
      { id: "q2", query: "write tests", ref: "a" },
      { id: "q2", query: "write tests", ref: "d" },
    ]);
    expect(pending(queries, pooled, new Set(["q1\tb", "q2\ta"])).map((t) => `${t.id}/${t.ref}`)).toEqual(["q1/a", "q1/c", "q2/d"]);
    expect(pending(queries, pooled, new Set(["q1\ta", "q1\tb", "q1\tc", "q2\ta", "q2\td"]))).toEqual([]);
  });
});

describe("grade", () => {
  const asset = (ref: string) => ({ asset: { ref, type: "knowledge", name: ref, description: "d", path: `${ref}.md` } as Asset, text: `text of ${ref}` });
  const todo = ["a", "b", "c", "d"].map((ref) => ({ id: "q1", query: "print the pdf", ref }));

  test("grades each pair with the judge's prompt and appends one qrels line per grade, as it goes", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const seen: string[] = [];
    const judge: Judge = async (messages) => {
      seen.push(messages[1].content);
      return `{"grade": ${seen.length % 4}, "reason": "reason ${seen.length}"}`;
    };
    const out = await grade(todo, asset, judge, qrels, { model: "the-judge", concurrency: 1 });
    expect(out).toEqual({ total: 4, graded: 4, failed: 0, retried: 0, stopped: false, gaveUp: false });
    expect(seen[0]).toContain("Query: print the pdf\n");
    expect(seen[0]).toContain("Ref: a\n");
    expect(seen[0]).toContain("Content:\ntext of a");
    expect(parseQrels(readFileSync(qrels, "utf8")).map((r) => [r.id, r.ref, r.grade])).toEqual([["q1", "a", 1], ["q1", "b", 2], ["q1", "c", 3], ["q1", "d", 0]]);
  });

  test("keeps the grades it has when it is stopped, and a second run grades only what is left", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    let calls = 0;
    const judge: Judge = async () => `{"grade": 2, "reason": "r"}`;
    const first = await grade(todo, asset, judge, qrels, { model: "the-judge", concurrency: 1, stop: () => calls++ >= 2 });
    expect(first).toMatchObject({ graded: 2, stopped: true });
    const done = new Set(parseQrels(readFileSync(qrels, "utf8")).map((r) => `${r.id}\t${r.ref}`));
    expect([...done]).toEqual(["q1\ta", "q1\tb"]);
    const left = pending(queries.slice(0, 1), new Map([["q1", ["a", "b", "c", "d"]]]), done);
    expect(left.map((t) => t.ref)).toEqual(["c", "d"]);
    const second = await grade(left, asset, judge, qrels, { model: "the-judge", concurrency: 1 });
    expect(second).toMatchObject({ graded: 2, stopped: false });
    expect(readFileSync(qrels, "utf8").trim().split("\n")).toHaveLength(4);
  });

  test("asks again once when a reply holds no grade, and counts it", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const replies = ["I need more room to think", '{"grade": 2, "reason": "second try"}', '{"grade": 3, "reason": "r"}'];
    const judge: Judge = async () => replies.shift() as string;
    const out = await grade(todo.slice(0, 2), asset, judge, qrels, { model: "the-judge", concurrency: 1 });
    expect(out).toMatchObject({ graded: 2, failed: 0, retried: 1 });
    expect(parseQrels(readFileSync(qrels, "utf8")).map((r) => [r.ref, r.grade, r.reason])).toEqual([["a", 2, "second try"], ["b", 3, "r"]]);
  });

  test("does not append a pair it could not grade, so the next run tries it again", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    // a: graded. b: no grade twice. c: the endpoint fails. d: graded.
    const replies = ['{"grade": 3, "reason": "r"}', "I cannot say.", "Still no JSON.", "boom", '{"grade": 1, "reason": "r"}'];
    const judge: Judge = async () => {
      const r = replies.shift() as string;
      if (r === "boom") throw new Error("HTTP 500");
      return r;
    };
    const lines: string[] = [];
    const out = await grade(todo, asset, judge, qrels, { model: "the-judge", concurrency: 1, log: (l) => lines.push(l) });
    expect(out).toMatchObject({ graded: 2, failed: 2, retried: 1, gaveUp: false, lastError: "HTTP 500" });
    expect(parseQrels(readFileSync(qrels, "utf8")).map((r) => r.ref)).toEqual(["a", "d"]);
    expect(lines.filter((l) => l.includes("FAILED"))).toHaveLength(2);
  });

  test("writes who graded, with which prompt, on what day, and a digest of the asset as the judge read it", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const judge: Judge = async () => '{"grade": 2, "reason": "r"}';
    await grade(todo.slice(0, 1), asset, judge, qrels, { model: "the-judge", date: "2026-10-11", concurrency: 1 });
    const row = JSON.parse(readFileSync(qrels, "utf8"));
    expect(row).toEqual({ id: "q1", ref: "a", grade: 2, reason: "r", judge: "the-judge", prompt_sha256: PROMPT_SHA256, date: "2026-10-11", asset_sha256: assetSha256("a", "text of a") });
    await grade(todo.slice(1, 2), asset, judge, qrels, { model: "the-judge", concurrency: 1 });
    expect(JSON.parse(readFileSync(qrels, "utf8").trim().split("\n")[1]).date).toBe(new Date().toISOString().slice(0, 10));
  });

  test("counts a pair whose asset cannot be found as failed and goes on, without giving up over it", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const lookup = (ref: string) => {
      if (ref.startsWith("x")) throw new Error(`akm returned ${ref}, which is not in its own asset listing`);
      return asset(ref);
    };
    const pairs = [...Array.from({ length: 12 }, (_, i) => `x${i}`), "a", "b"].map((ref) => ({ id: "q1", query: "print the pdf", ref }));
    const lines: string[] = [];
    const out = await grade(pairs, lookup, async () => '{"grade": 1, "reason": "r"}', qrels, { model: "the-judge", concurrency: 1, log: (l) => lines.push(l) });
    expect(out).toMatchObject({ total: 14, graded: 2, failed: 12, gaveUp: false, lastError: "akm returned x11, which is not in its own asset listing" });
    expect(parseQrels(readFileSync(qrels, "utf8")).map((r) => r.ref)).toEqual(["a", "b"]);
    expect(lines.filter((l) => l.includes("FAILED  x"))).toHaveLength(12);
  });

  test("gives up when the endpoint answers nothing, rather than failing every pair", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const many = Array.from({ length: 40 }, (_, i) => ({ id: "q1", query: "p", ref: `r${i}` }));
    let calls = 0;
    const judge: Judge = async () => {
      calls++;
      throw new Error("connection refused");
    };
    const out = await grade(many, asset, judge, qrels, { model: "the-judge", concurrency: 2 });
    expect(out).toMatchObject({ graded: 0, gaveUp: true, lastError: "connection refused" });
    expect(calls).toBeLessThan(15);
  });
});

describe("makeJudge", () => {
  const messages = [
    { role: "system" as const, content: "s" },
    { role: "user" as const, content: "u" },
  ];
  const reply = (content: string) => Response.json({ choices: [{ message: { content } }] });

  test("posts a chat request that asks for a JSON grade, with the key and no visible thinking", async () => {
    const seen: { url: string; auth: string | null; body: any }[] = [];
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        seen.push({ url: new URL(req.url).pathname, auth: req.headers.get("authorization"), body: await req.json() });
        return reply('{"grade": 2, "reason": "r"}');
      },
    });
    const judge = makeJudge(`http://127.0.0.1:${server.port}/v1/`, "secret", "the-model");
    expect(await judge(messages)).toBe('{"grade": 2, "reason": "r"}');
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("/v1/chat/completions");
    expect(seen[0].auth).toBe("Bearer secret");
    expect(seen[0].body).toMatchObject({ model: "the-model", messages, temperature: 0, stream: false, enable_thinking: false, reasoning_effort: "none", chat_template_kwargs: { enable_thinking: false } });
    expect(seen[0].body.max_tokens).toBeGreaterThanOrEqual(1000); // room for a model that thinks anyway
    expect(seen[0].body.response_format.json_schema.schema.required).toEqual(["grade", "reason"]);
  });

  test("puts /chat/completions on the path of an endpoint that has a query, before the query, and not twice", async () => {
    const seen: string[] = [];
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        seen.push(url.pathname + url.search);
        return reply("{}");
      },
    });
    const base = `http://127.0.0.1:${server.port}`;
    await makeJudge(`${base}/openai/deployments/d/v1?api-version=2024-10-21`, "", "m")(messages);
    await makeJudge(`${base}/v1/chat/completions?api-version=2024-10-21`, "", "m")(messages);
    await makeJudge(`${base}/v1/?api-version=2024-10-21`, "", "m")(messages);
    expect(seen).toEqual(["/openai/deployments/d/v1/chat/completions?api-version=2024-10-21", "/v1/chat/completions?api-version=2024-10-21", "/v1/chat/completions?api-version=2024-10-21"]);
  });

  test("sends no key header when there is no key", async () => {
    let auth: string | null = "unset";
    server = Bun.serve({
      port: 0,
      fetch(req) {
        auth = req.headers.get("authorization");
        return reply("{}");
      },
    });
    await makeJudge(`http://127.0.0.1:${server.port}/v1/chat/completions`, "", "m")(messages);
    expect(auth).toBeNull();
  });

  test("asks again without the schema when the endpoint refuses one, and not a third time", async () => {
    const bodies: any[] = [];
    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const body = await req.json();
        bodies.push(body);
        return body.response_format ? new Response("response_format is not supported", { status: 400 }) : reply('{"grade": 1, "reason": "r"}');
      },
    });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).toBe('{"grade": 1, "reason": "r"}');
    expect(bodies.map((b) => "response_format" in b)).toEqual([true, false]);

    bodies.length = 0;
    server.stop(true);
    server = Bun.serve({ port: 0, fetch: async (req) => (bodies.push(await req.json()), new Response("bad request", { status: 400 })) });
    await expect(makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).rejects.toThrow("HTTP 400");
    expect(bodies).toHaveLength(2);
  });

  test("retries a server error, then gives up", async () => {
    let calls = 0;
    server = Bun.serve({
      port: 0,
      fetch() {
        calls++;
        return calls < 3 ? new Response("busy", { status: 503 }) : reply("{}");
      },
    });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m", 5000, 1)(messages)).toBe("{}");
    expect(calls).toBe(3);

    calls = 0;
    server.stop(true);
    server = Bun.serve({ port: 0, fetch: () => (calls++, new Response("down", { status: 502 })) });
    await expect(makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m", 5000, 1)(messages)).rejects.toThrow("HTTP 502");
    expect(calls).toBe(6);
  });

  test("when the server says to wait, every request waits, not only the one it refused", async () => {
    const arrivals: number[] = [];
    server = Bun.serve({
      port: 0,
      fetch() {
        arrivals.push(Date.now());
        return arrivals.length === 1 ? new Response("slow down", { status: 429, headers: { "Retry-After": "0.3" } }) : reply('{"grade": 1, "reason": "r"}');
      },
    });
    const judge = makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m", 5000, 1);
    const a = judge(messages);
    await new Promise((r) => setTimeout(r, 100)); // the first request is refused by now
    const b = judge(messages);
    expect(await Promise.all([a, b])).toEqual(['{"grade": 1, "reason": "r"}', '{"grade": 1, "reason": "r"}']);
    expect(arrivals).toHaveLength(3);
    expect(arrivals[1] - arrivals[0]).toBeGreaterThanOrEqual(250);
    expect(arrivals[2] - arrivals[0]).toBeGreaterThanOrEqual(250);
  });

  test("falls back to the reasoning text when the reply has no content", async () => {
    const text = 'thinking... {"grade": 3, "reason": "r"} done';
    server = Bun.serve({ port: 0, fetch: () => Response.json({ choices: [{ message: { content: "", reasoning_content: text } }] }) });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).toBe(text);
    server.stop(true);
    server = Bun.serve({ port: 0, fetch: () => Response.json({ choices: [{ message: { content: null, reasoning: text } }] }) });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).toBe(text);
  });

  test("prefers the content when there is some", async () => {
    server = Bun.serve({ port: 0, fetch: () => Response.json({ choices: [{ message: { content: '{"grade": 1, "reason": "c"}', reasoning_content: '{"grade": 3, "reason": "r"}' } }] }) });
    expect(await makeJudge(`http://127.0.0.1:${server.port}/v1`, "", "m")(messages)).toBe('{"grade": 1, "reason": "c"}');
  });
});

/** What the fake akm answers: for each query, the names of the files that `search` and `curate` return. */
type Answers = Record<string, { search: string[]; curate: string[] }>;

/**
 * An akm over .md files that logs each call to `calls`. When the sandbox's config names bundles (a library indexed where it
 * is), each is a folder of files and its refs read `<bundle>//knowledge/<name>`. Otherwise the files are those of the sandbox's
 * bundle, and refs read `knowledge/<name>`; a file in a folder (`knowledge/a.md`) has the ref of its path (`knowledge/a`).
 * `search ""` lists them, and a query is answered from `answers`.
 */
const fakeAkm = (calls: string, answers: Answers) => `
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, JSON.stringify([cmd, ...rest]) + "\\n");
if (cmd === "--version") { console.log("0.9.99-test"); process.exit(0); }
if (cmd === "search" && process.argv[3] === "--help") { console.log("--detail=<detail> Detail level, or agent"); process.exit(0); }
const config = JSON.parse(readFileSync(process.env.AKM_CONFIG_DIR + "/config.json", "utf8"));
const roots = config.bundles ? Object.entries(config.bundles).map(([name, b]) => [name + "//", b.path]) : [["", process.env.AKM_BUNDLE_DIR]];
const entries = roots.flatMap(([prefix, dir]) => readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".md")).sort().map((f) => { const stem = f.slice(0, -3); const name = stem.split("/").pop(); return { ref: prefix + (stem.includes("/") ? stem : "knowledge/" + stem), type: "knowledge", name, description: "about " + name, path: join(dir, f) }; }));
if (cmd === "index") { console.log(JSON.stringify({ ok: true, totalEntries: entries.length })); process.exit(0); }
if (rest[0] === "") { console.log(JSON.stringify({ hits: rest[rest.indexOf("--type") + 1] === "knowledge" ? entries : [] })); process.exit(0); }
const wanted = ${JSON.stringify(answers)}[rest[rest.indexOf("--") + 1]]?.[cmd] ?? [];
const hits = wanted.map((name) => entries.find((e) => e.name === name));
console.log(JSON.stringify(cmd === "search" ? { hits, searchMode: "keyword" } : { items: hits, searchMode: "keyword" }));
`;

const jsonl = (rows: object[]) => rows.map((r) => `${JSON.stringify(r)}\n`).join("");

/** A set in a temp folder: the library's files, queries.jsonl and qrels.jsonl, and a fake akm to run over them. */
function setup(files: Record<string, string>, queries: object[], qrels: object[], answers: Answers, bundles?: Record<string, string>) {
  const root = tmp();
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, "library", name)), { recursive: true });
    writeFileSync(join(root, "library", name), text);
  }
  mkdirSync(join(root, "set"));
  writeFileSync(join(root, "set", "queries.jsonl"), jsonl(queries));
  if (qrels.length) writeFileSync(join(root, "set", "qrels.jsonl"), jsonl(qrels));
  if (bundles) writeFileSync(join(root, "bundles.json"), JSON.stringify(bundles));
  const calls = join(root, "calls.jsonl");
  writeFileSync(calls, "");
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, fakeAkm(calls, answers));
  const folders: Folders = { library: join(root, "library"), assets: join(root, "set"), results: join(root, "results"), ...(bundles ? { bundles: join(root, "bundles.json") } : {}) };
  return {
    root,
    folders,
    ctx: (judge: Judge, limit?: number) => ({ model: "the-model", judge, limit, newSandbox: () => ({ ...createSandbox("label-test"), cmd: ["bun", script] }) }),
    calls: () => readFileSync(calls, "utf8").trim().split("\n").map((l) => JSON.parse(l) as string[]),
    qrels: () => readFileSync(join(root, "set", "qrels.jsonl"), "utf8"),
  };
}

/** A judge that grades each ref as `grades` says, 0 when it does not, and keeps what it was shown. */
function stubJudge(grades: Record<string, number>) {
  const seen: string[] = [];
  const judge: Judge = async (messages) => {
    const user = messages[1].content;
    seen.push(user);
    const ref = /Ref: (.*)\n/.exec(user)?.[1] ?? "";
    return JSON.stringify({ grade: grades[ref] ?? 0, reason: `reason for ${ref}` });
  };
  return { judge, seen };
}

/** Runs `f` and returns what it printed with console.log and console.error. */
async function printed<T>(f: () => Promise<T>): Promise<{ result: T; out: string[]; err: string[] }> {
  const { log, error } = console;
  const out: string[] = [];
  const err: string[] = [];
  console.log = (...a: unknown[]) => void out.push(a.join(" "));
  console.error = (...a: unknown[]) => void err.push(a.join(" "));
  try {
    return { result: await f(), out, err };
  } finally {
    console.log = log;
    console.error = error;
  }
}

describe("labelCollection", () => {
  const OWN_FILES = { "one/a.md": "alpha alpha alpha\n", "two/b.md": "---\ntitle: B\n---\nbody of b\n", "two/c.md": "body of c\n", "two/d.md": "alpha alpha alpha alpha alpha alpha\n" };
  const OWN_BUNDLES = { one: "akm", two: "claude" };
  const OWN_QUERIES = [
    { id: "q1", query: "alpha", kind: "task" },
    { id: "q2", query: "beta", kind: "question" },
    { id: "m1", query: "gamma", kind: "multihop-declared" },
    { id: "n1", query: "thanks", kind: "nontask" },
  ];
  const OWN_QRELS = [
    { id: "q1", ref: "one//knowledge/a", grade: 3, reason: "from the lab" },
    { id: "q2", ref: "one//knowledge/a", grade: 1, reason: "from the lab" },
  ];
  const OWN_ANSWERS: Answers = { alpha: { search: ["a", "b"], curate: ["a"] }, beta: { search: ["c"], curate: ["c", "a"] }, gamma: { search: [], curate: [] } };

  test("own: pools what akm search and curate return, grades the pairs that have no grade, and appends them to the set's qrels", async () => {
    const set = setup(OWN_FILES, OWN_QUERIES, OWN_QRELS, OWN_ANSWERS, OWN_BUNDLES);
    const before = readFileSync(join(set.folders.assets, "qrels.jsonl"), "utf8");
    const { judge, seen } = stubJudge({ "two//knowledge/b": 2 });
    const signals = process.listenerCount("SIGINT");
    const { result, out } = await printed(() => labelCollection("own", set.ctx(judge), set.folders));
    expect(result).toBe(0);
    expect(process.listenerCount("SIGINT")).toBe(signals); // it stops listening when it is done
    expect(out[0]).toContain("retrieval label (own): akm 0.9.99-test, 4 assets, 3 task queries, judge the-model");
    expect(out[1]).toBe("  4 pooled pairs, 2 already graded, 2 to grade, 2 at a time"); // q1: a, b. q2: c, a. a has a grade for both

    // the new grades follow the old lines, in the format the file has (id, ref, grade, reason) and with who graded: the judge, the prompt, the day and the asset
    const after = set.qrels();
    expect(after.startsWith(before)).toBe(true);
    const added = after.slice(before.length).trim().split("\n").map((l) => JSON.parse(l));
    const keys = ["id", "ref", "grade", "reason", "judge", "prompt_sha256", "date", "asset_sha256"];
    expect(added.map((r) => Object.keys(r))).toEqual([keys, keys]);
    const made = (ref: string, text: string) => ({ judge: "the-model", prompt_sha256: PROMPT_SHA256, date: new Date().toISOString().slice(0, 10), asset_sha256: assetSha256(ref, text) });
    expect(added.sort((x, y) => (x.id < y.id ? -1 : 1))).toEqual([
      { id: "q1", ref: "two//knowledge/b", grade: 2, reason: "reason for two//knowledge/b", ...made("two//knowledge/b", OWN_FILES["two/b.md"]) },
      { id: "q2", ref: "two//knowledge/c", grade: 0, reason: "reason for two//knowledge/c", ...made("two//knowledge/c", OWN_FILES["two/c.md"]) },
    ]);

    // the judge was told what akm said of the asset, and read its file without the front matter
    const b = seen.find((m) => m.includes("Ref: two//knowledge/b\n")) as string;
    expect(b).toContain("Query: alpha\n");
    expect(b).toContain("Type: knowledge\nRef: two//knowledge/b\nName: b\nDescription: about b\n");
    expect(b).toContain("Content:\nbody of b");
    expect(b).not.toContain("title: B");

    // no listing and no BM25: d holds the most "alpha" and is not what akm returned, so it is not pooled
    expect(seen.some((m) => m.includes("knowledge/d"))).toBe(false);
    expect(set.calls().filter(([cmd, query]) => cmd === "search" && query === "")).toEqual([]);
    expect(set.calls().some((c) => c.includes("thanks"))).toBe(false); // a non-task input is not pooled
  });

  test("own: a second run finds nothing to grade and does not call the judge", async () => {
    const set = setup(OWN_FILES, OWN_QUERIES, OWN_QRELS, OWN_ANSWERS, OWN_BUNDLES);
    const { judge, seen } = stubJudge({});
    await printed(() => labelCollection("own", set.ctx(judge), set.folders));
    const graded = set.qrels();
    seen.length = 0;
    const { result, out } = await printed(() => labelCollection("own", set.ctx(judge), set.folders));
    expect(result).toBe(0);
    expect(out[1]).toBe("  4 pooled pairs, 4 already graded, 0 to grade, 2 at a time");
    expect(seen).toEqual([]);
    expect(set.qrels()).toBe(graded);
  });

  test("own: --limit labels the first N task queries, and a set with no qrels yet gets its file", async () => {
    const set = setup(OWN_FILES, OWN_QUERIES, [], OWN_ANSWERS, OWN_BUNDLES);
    const { judge } = stubJudge({});
    const { result } = await printed(() => labelCollection("own", set.ctx(judge, 1), set.folders));
    expect(result).toBe(0);
    expect(parseQrels(set.qrels()).map((r) => `${r.id} ${r.ref}`).sort()).toEqual(["q1 one//knowledge/a", "q1 two//knowledge/b"]);
  });

  test("own: an expected asset cannot be looked up in a library that is not listed, so the run stops before it grades anything", async () => {
    const set = setup(OWN_FILES, [{ ...OWN_QUERIES[0], expected: ["two//knowledge/c"] }], [], OWN_ANSWERS, OWN_BUNDLES);
    const { judge, seen } = stubJudge({});
    const { result, err } = await printed(() => labelCollection("own", set.ctx(judge), set.folders));
    expect(result).toBe(2);
    expect(err.join("\n")).toContain("q1 expects two//knowledge/c");
    expect(err.join("\n")).toContain("the own library is not listed");
    expect(seen).toEqual([]);
  });

  test("own: says where the set goes when its folder holds none, and creates nothing", async () => {
    const root = tmp();
    const folders: Folders = { library: join(root, "library"), assets: join(root, "own"), results: join(root, "results"), bundles: join(root, "bundles.json") };
    const { judge } = stubJudge({});
    const { result, err } = await printed(() => labelCollection("own", { model: "m", judge }, folders));
    expect(result).toBe(2);
    expect(err.join("\n")).toContain("is missing. Your own set goes in private/retrieval/own/");
    expect(existsSync(folders.assets)).toBe(false);
  });

  test("public: lists the library, adds a BM25 and the expected assets to the pool, and appends to the set's qrels as before", async () => {
    const files = { "a.md": "print the pdf with bleed and margins\n", "b.md": "write tests with playwright\n", "c.md": "nothing about either subject\n" };
    const queries = [
      { id: "q1", query: "print the pdf", kind: "direct", expected: ["knowledge/c"] },
      { id: "q2", query: "write tests", kind: "paraphrase" },
      { id: "n1", query: "thanks", kind: "chitchat" },
    ];
    const answers: Answers = { "print the pdf": { search: ["b"], curate: ["b"] }, "write tests": { search: [], curate: [] } };
    const set = setup(files, queries, [{ id: "q1", ref: "knowledge/b", grade: 1, reason: "earlier" }], answers);
    const { judge, seen } = stubJudge({ "knowledge/a": 3, "knowledge/c": 2, "knowledge/b": 3 });
    const { result, out } = await printed(() => labelCollection("public", set.ctx(judge), set.folders));
    expect(result).toBe(0);
    expect(out[0]).toContain("retrieval label: akm 0.9.99-test, 3 assets, 2 task queries, judge the-model");
    // q1: akm returns b, BM25 returns a, and c is expected. b is graded. q2: BM25 returns b.
    expect(out[1]).toBe("  4 pooled pairs, 1 already graded, 3 to grade, 2 at a time");
    expect(set.calls().some(([cmd, query]) => cmd === "search" && query === "")).toBe(true); // the library is listed
    expect(
      parseQrels(set.qrels())
        .map((r) => `${r.id} ${r.ref} ${r.grade}`)
        .sort(),
    ).toEqual(["q1 knowledge/a 3", "q1 knowledge/b 1", "q1 knowledge/c 2", "q2 knowledge/b 3"]);
    expect(seen.find((m) => m.includes("Ref: knowledge/a\n"))).toContain("Content:\nprint the pdf with bleed and margins");
  });
});

describe("poolFromSamples and readRun", () => {
  const row = (id: string, columns: Record<string, string[]>) => JSON.stringify({ id, kind: "direct", query: "x", n_relevant: 1, ...Object.fromEntries(Object.entries(columns).map(([k, refs]) => [k, { refs, grades: refs.map(() => null), seconds: 0.1 }])) });
  const many = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

  test("pools the first ten results of every column, the semantic ones too, and the expected assets, each once", () => {
    const samples = [row("q1", { search: ["a", "b"], curate: ["b", "c"], semantic_search: ["d", "a"], semantic_curate: many("s", 12) }), row("q2", { search: ["e"] })].join("\n");
    const pooled = poolFromSamples([{ ...queries[0], expected: ["z"] }, queries[1]], `${samples}\n`);
    expect(pooled.get("q1")).toEqual(["a", "b", "c", "d", ...many("s", 6), "z"].slice(0, 4).concat(many("s", 10), ["z"]));
    expect(pooled.get("q2")).toEqual(["e"]);
  });

  test("has no entry for a query the run did not have, and skips a column the run did not have or that failed", () => {
    const samples = [row("q1", { search: ["a"], curate: [] }), JSON.stringify({ id: "q2", search: { refs: [], error: "boom" } }), row("n1", { search: ["x"] })].join("\n");
    const pooled = poolFromSamples([...queries, { id: "q3", query: "x", kind: "direct" }], samples);
    expect([...pooled.keys()]).toEqual(["q1", "q2"]);
    expect(pooled.get("q1")).toEqual(["a"]);
    expect(pooled.get("q2")).toEqual([]);
  });

  test("says which line of samples.jsonl is not usable", () => {
    expect(() => poolFromSamples(queries, "{oops", 10, "run/samples.jsonl")).toThrow("run/samples.jsonl:1 is not valid JSON");
    expect(() => poolFromSamples(queries, `${row("q1", { search: ["a"] })}\n{"query": "no id"}`, 10, "run/samples.jsonl")).toThrow('run/samples.jsonl:2 has no string "id"');
  });

  const runFolder = (summary: object | null, samples = "") => {
    const dir = tmp();
    if (summary) writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
    writeFileSync(join(dir, "samples.jsonl"), samples);
    return dir;
  };

  test("takes the samples of a run of the same corpus and collection", () => {
    expect(readRun(runFolder({ eval: "retrieval", corpus: "public", collection: "library" }, "the samples"), "public")).toBe("the samples");
    expect(readRun(runFolder({ eval: "retrieval", corpus: "custom", collection: "own" }, "mine"), "own")).toBe("mine");
    expect(readRun(runFolder({ eval: "retrieval", corpus: "own", collection: "own" }, "old"), "own")).toBe("old"); // a run from before custom corpora
  });

  test("refuses the folder of another collection, another corpus, another eval, or no run at all", () => {
    expect(() => readRun(runFolder({ eval: "retrieval", corpus: "public", collection: "books" }), "public")).toThrow("is a run of the books collection of the public corpus, and this grades the library collection of the public corpus");
    expect(() => readRun(runFolder({ eval: "retrieval", corpus: "custom", collection: "library" }), "public")).toThrow("is a run of the library collection of the custom corpus");
    expect(() => readRun(runFolder({ eval: "retrieval", corpus: "private", collection: "library" }), "public")).toThrow("the library collection of the private corpus");
    expect(() => readRun(runFolder({ eval: "retrieval", corpus: "public", collection: "library" }), "own")).toThrow("this grades the own collection of the custom corpus");
    expect(() => readRun(runFolder({ eval: "nightly", corpus: "public" }), "public")).toThrow("is a run of another eval");
    expect(() => readRun(runFolder(null), "public")).toThrow("is not a results folder of evals/retrieval/run");
    expect(() => readRun(join(tmp(), "nothing"), "public")).toThrow("is not a results folder");
  });
});

describe("staleKeys", () => {
  const row = (id: string, ref: string, sha?: string): Qrel => ({ id, ref, grade: 2, reason: "r", ...(sha ? { asset_sha256: sha } : {}) });
  const now = (ref: string) => ({ a: "new", b: "same" })[ref];

  test("is a pair whose last row has a digest that is not the asset's now", () => {
    expect([...staleKeys([row("q1", "a", "old"), row("q1", "b", "same"), row("q2", "a", "new")], now)]).toEqual(["q1\ta"]);
  });

  test("never marks a row with no digest, or an asset that cannot be read, and goes by the last row of a pair", () => {
    expect([...staleKeys([row("q1", "a"), row("q1", "gone", "old")], now)]).toEqual([]);
    expect([...staleKeys([row("q1", "a", "old"), row("q1", "a", "new")], now)]).toEqual([]); // it was graded again after the change
    expect([...staleKeys([row("q1", "a", "new"), row("q1", "a")], now)]).toEqual([]); // the last row is the one that counts
  });
});

describe("labelCollection --from", () => {
  const FILES = { "a.md": "print the pdf with bleed\n", "b.md": "write tests\n", "c.md": "something else\n", "d.md": "unused\n" };
  const QUERIES = [
    { id: "q1", query: "print the pdf", kind: "direct" },
    { id: "q2", query: "write tests", kind: "paraphrase" },
    { id: "n1", query: "thanks", kind: "chitchat" },
  ];
  const ANSWERS: Answers = { "print the pdf": { search: ["a"], curate: ["a"] }, "write tests": { search: ["b"], curate: ["b"] } };
  const row = (id: string, columns: Record<string, string[]>) => JSON.stringify({ id, kind: "direct", query: "x", n_relevant: 1, ...Object.fromEntries(Object.entries(columns).map(([k, refs]) => [k, { refs, grades: refs.map(() => null), seconds: 0.1 }])) });
  const from = (rows: string[], summary: object = { eval: "retrieval", corpus: "public", collection: "library" }) => {
    const dir = tmp();
    writeFileSync(join(dir, "summary.json"), JSON.stringify(summary));
    writeFileSync(join(dir, "samples.jsonl"), `${rows.join("\n")}\n`);
    return dir;
  };

  test("grades the unjudged results of every column of the run, the semantic ones too, and nothing akm search returns now", async () => {
    const set = setup(FILES, QUERIES, [{ id: "q1", ref: "knowledge/a", grade: 3, reason: "earlier" }], ANSWERS);
    const dir = from([row("q1", { search: ["knowledge/a"], curate: ["knowledge/a"], semantic_search: ["knowledge/c", "knowledge/a"], semantic_curate: ["knowledge/d"] }), row("q2", { search: ["knowledge/b"] })]);
    const { judge, seen } = stubJudge({ "knowledge/c": 2, "knowledge/d": 1, "knowledge/b": 3 });
    const { result, out } = await printed(() => labelCollection("public", { ...set.ctx(judge), from: dir }, set.folders));
    expect(result).toBe(0);
    expect(out.join("\n")).toContain(`pool from ${dir}: 2 of 2 task queries are in the run`);
    expect(out.join("\n")).toContain("4 pooled pairs, 1 already graded, 3 to grade, 2 at a time"); // q1: a, c, d. q2: b. Not BM25, not what akm returns
    expect(seen.map((m) => /Ref: (.*)\n/.exec(m)?.[1]).sort()).toEqual(["knowledge/b", "knowledge/c", "knowledge/d"]);
    expect(set.calls().filter(([cmd]) => cmd === "search" || cmd === "curate").every((c) => c[1] === "--help" || c[1] === "")).toBe(true); // no query was asked
    const grades = gradesByQuery(parseQrels(set.qrels()));
    expect(grades.get("q1")).toEqual({ "knowledge/a": 3, "knowledge/c": 2, "knowledge/d": 1 });
    expect(grades.get("q2")).toEqual({ "knowledge/b": 3 });
  });

  test("leaves out a result that is not an asset of the library, and says how many", async () => {
    const set = setup(FILES, QUERIES.slice(0, 1), [], ANSWERS);
    const dir = from([row("q1", { semantic_search: ["knowledge/c", "knowledge/ghost", "knowledge/other-ghost"] })]);
    const { judge, seen } = stubJudge({});
    const { result, out } = await printed(() => labelCollection("public", { ...set.ctx(judge), from: dir }, set.folders));
    expect(result).toBe(0);
    expect(out.join("\n")).toContain("and 2 of its results are not assets of this library and are left out");
    expect(seen).toHaveLength(1);
  });

  test("says which task queries the run did not have, as for a run with --limit", async () => {
    const set = setup(FILES, QUERIES, [], ANSWERS);
    const dir = from([row("q1", { search: ["knowledge/a"] })]);
    const { out } = await printed(() => labelCollection("public", { ...set.ctx(stubJudge({}).judge), from: dir }, set.folders));
    expect(out.join("\n")).toContain("1 of 2 task queries are in the run");
  });

  test("stops before it asks akm or the judge for anything when the folder is not a run of this set", async () => {
    const set = setup(FILES, QUERIES, [], ANSWERS);
    const { judge, seen } = stubJudge({});
    const wrong = from([row("q1", { search: ["knowledge/a"] })], { eval: "retrieval", corpus: "private", collection: "library" });
    const { result, err } = await printed(() => labelCollection("public", { ...set.ctx(judge), from: wrong }, set.folders));
    expect(result).toBe(2);
    expect(err.join("\n")).toContain("retrieval label: ");
    expect(err.join("\n")).toContain("the library collection of the private corpus");
    expect(seen).toEqual([]);
    expect(readFileSync(join(set.root, "calls.jsonl"), "utf8")).toBe(""); // akm was never run
  });

  test("own: asks akm what it says of the assets the run returned, and grades the ones it can look up", async () => {
    const files = { "one/a.md": "alpha alpha\n", "two/b.md": "body of b\n" };
    const set = setup(files, [{ id: "q1", query: "alpha", kind: "task" }], [], { alpha: { search: ["a", "b"], curate: ["a"] } }, { one: "akm", two: "claude" });
    const dir = from([row("q1", { search: ["one//knowledge/a"], semantic_search: ["two//knowledge/b", "one//knowledge/missing"] })], { eval: "retrieval", corpus: "own", collection: "own" });
    const { judge, seen } = stubJudge({ "two//knowledge/b": 2 });
    const { result, out } = await printed(() => labelCollection("own", { ...set.ctx(judge), from: dir }, set.folders));
    expect(result).toBe(0);
    expect(out.join("\n")).toContain("and 1 of its results are not assets of this set as akm returns it now and are left out");
    expect(seen.map((m) => /Ref: (.*)\n/.exec(m)?.[1]).sort()).toEqual(["one//knowledge/a", "two//knowledge/b"]);
  });
});

describe("grading a pair again, and the judges of a set", () => {
  const FILES = { "a.md": "print the pdf version one\n", "b.md": "nothing\n" };
  const QUERIES = [{ id: "q1", query: "print the pdf", kind: "direct" }];
  const ANSWERS: Answers = { "print the pdf": { search: ["a"], curate: ["a"] } };
  const lastGrade = (set: ReturnType<typeof setup>) => gradesByQuery(parseQrels(set.qrels())).get("q1");

  test("grades a pair again when its asset changed since, and the new grade replaces the old", async () => {
    const set = setup(FILES, QUERIES, [], ANSWERS);
    const first = await printed(() => labelCollection("public", set.ctx(stubJudge({ "knowledge/a": 3 }).judge), set.folders));
    expect(first.out.join("\n")).toContain("1 pooled pairs, 0 already graded, 1 to grade, 2 at a time");
    expect(lastGrade(set)).toEqual({ "knowledge/a": 3 });

    const same = await printed(() => labelCollection("public", set.ctx(stubJudge({}).judge), set.folders));
    expect(same.out.join("\n")).toContain("1 pooled pairs, 1 already graded, 0 to grade, 2 at a time");

    writeFileSync(join(set.root, "library", "a.md"), "print the pdf version two\n");
    const { judge, seen } = stubJudge({ "knowledge/a": 1 });
    const again = await printed(() => labelCollection("public", set.ctx(judge), set.folders));
    expect(again.out.join("\n")).toContain("1 pooled pairs, 0 already graded, 1 to grade, 2 at a time (1 of them were graded from an asset that has changed since)");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("print the pdf version two");
    expect(parseQrels(set.qrels())).toHaveLength(2); // the old row stays, and the new one comes after it
    expect(lastGrade(set)).toEqual({ "knowledge/a": 1 });

    const settled = await printed(() => labelCollection("public", set.ctx(stubJudge({}).judge), set.folders));
    expect(settled.out.join("\n")).toContain("0 to grade");
  });

  test("grades again a changed asset that the pool no longer returns, for a library that is listed", async () => {
    const set = setup(FILES, QUERIES, [], ANSWERS);
    await printed(() => labelCollection("public", set.ctx(stubJudge({ "knowledge/a": 3 }).judge), set.folders));
    // the same qrels over a library whose a.md changed, with an akm that no longer returns it and a text that BM25 does not match to the query
    const other = setup(FILES, QUERIES, [], { "print the pdf": { search: [], curate: [] } });
    writeFileSync(join(other.folders.assets, "qrels.jsonl"), set.qrels());
    writeFileSync(join(other.folders.library, "a.md"), "something else entirely\n");
    const { judge, seen } = stubJudge({});
    const { out } = await printed(() => labelCollection("public", other.ctx(judge), other.folders));
    expect(out.join("\n")).toContain("1 pooled pairs, 0 already graded, 1 to grade, 2 at a time (1 of them were graded from an asset that has changed since)");
    expect(seen).toHaveLength(1);
  });

  test("never grades again a pair from before label wrote digests, even when the asset differs", async () => {
    const set = setup(FILES, QUERIES, [{ id: "q1", ref: "knowledge/a", grade: 3, reason: "from the first run" }], ANSWERS);
    const { judge, seen } = stubJudge({});
    const { out } = await printed(() => labelCollection("public", set.ctx(judge), set.folders));
    expect(out.join("\n")).toContain("1 pooled pairs, 1 already graded, 0 to grade");
    expect(seen).toEqual([]);
  });

  test("a limit leaves the pairs of the other queries as they are", async () => {
    const two = [...QUERIES, { id: "q2", query: "write tests", kind: "direct" }];
    const set = setup(FILES, two, [], { ...ANSWERS, "write tests": { search: ["b"], curate: ["b"] } });
    await printed(() => labelCollection("public", set.ctx(stubJudge({}).judge), set.folders));
    writeFileSync(join(set.root, "library", "b.md"), "changed\n");
    const { out } = await printed(() => labelCollection("public", set.ctx(stubJudge({}).judge, 1), set.folders));
    expect(out.join("\n")).toContain("0 to grade"); // q2's b changed, but only q1 is labelled
  });

  test("warns when the qrels have grades of another judge, and still grades", async () => {
    const set = setup(FILES, QUERIES, [{ id: "q1", ref: "knowledge/b", grade: 0, reason: "r", judge: "the-old-judge" }], ANSWERS);
    const { judge } = stubJudge({});
    const { result, err } = await printed(() => labelCollection("public", set.ctx(judge), set.folders));
    expect(result).toBe(0);
    expect(err.join("\n")).toContain("assets/qrels.jsonl has grades by the-old-judge, and this run grades with the-model. Grades of different judges do not mix cleanly");
    const same = setup(FILES, QUERIES, [{ id: "q1", ref: "knowledge/b", grade: 0, reason: "r", judge: "the-model" }], ANSWERS);
    expect((await printed(() => labelCollection("public", same.ctx(judge), same.folders))).err).toEqual([]);
  });

  test("warns when the qrels have grades that record no judge, as the library's from before label wrote one do", async () => {
    const set = setup(FILES, QUERIES, [{ id: "q1", ref: "knowledge/b", grade: 0, reason: "r" }], ANSWERS);
    const { err } = await printed(() => labelCollection("public", set.ctx(stubJudge({}).judge), set.folders));
    expect(err.join("\n")).toContain("assets/qrels.jsonl has 1 grades that record no judge, and this run grades with the-model. Grades of different judges do not mix cleanly");
    const both = setup(FILES, QUERIES, [{ id: "q1", ref: "knowledge/b", grade: 0, reason: "r" }, { id: "q1", ref: "knowledge/c", grade: 0, reason: "r", judge: "the-old-judge" }], ANSWERS);
    expect((await printed(() => labelCollection("public", both.ctx(stubJudge({}).judge), both.folders))).err.join("\n")).toContain("has grades by the-old-judge and 1 grades that record no judge, and this run grades with the-model");
  });

  test("does not warn of a judge whose grade this run has replaced by grading the pair again", async () => {
    const set = setup(FILES, QUERIES, [{ id: "q1", ref: "knowledge/a", grade: 2, reason: "r", judge: "the-old-judge", asset_sha256: "not-the-digest" }], ANSWERS);
    const first = await printed(() => labelCollection("public", set.ctx(stubJudge({ "knowledge/a": 3 }).judge), set.folders));
    expect(first.err.join("\n")).toContain("has grades by the-old-judge");
    expect(lastGrade(set)).toEqual({ "knowledge/a": 3 });
    const second = await printed(() => labelCollection("public", set.ctx(stubJudge({}).judge), set.folders));
    expect(second.err).toEqual([]);
  });
});

describe("stampLegacy (#49)", () => {
  const FILES = {
    "knowledge/a.md": "---\ntitle: A\n---\nalpha alpha alpha\n",
    "skills/s/SKILL.md": "---\nname: s\ndescription: a skill\n---\nthe skill body\n",
    "commands/c.md": "run it with $ARGUMENTS\n",
    "README.md": "not an asset\n",
  };
  /** The file each ref of FILES is, by akm's rules (library.ts). */
  const FILE_OF: Record<string, string> = { "knowledge/a": "knowledge/a.md", "skills/s": "skills/s/SKILL.md", "commands/c": "commands/c.md" };
  const digest = (library: string, ref: string) => assetSha256(ref, readFileSync(join(library, FILE_OF[ref] as string), "utf8"));
  const row = (id: string, ref: string, grade: number, extra: object = {}) => ({ id, ref, grade, reason: `why ${id} ${ref}`, ...extra });

  /** A library in a temp folder with the files above, and a qrels file with these rows. */
  function set(rows: object[]) {
    const root = tmp();
    for (const [name, text] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, "library", name)), { recursive: true });
      writeFileSync(join(root, "library", name), text);
    }
    const qrels = join(root, "qrels.jsonl");
    writeFileSync(qrels, jsonl(rows));
    return { root, library: join(root, "library"), qrels, lines: () => readFileSync(qrels, "utf8").trim().split("\n").map((l) => JSON.parse(l)) };
  }

  test("gives each row that records no digest the digest of its asset as the library has it, and the judge 'legacy' when it records none, and changes nothing else", () => {
    const s = set([row("q1", "knowledge/a", 3), row("q1", "skills/s", 0), row("q2", "knowledge/a", 1), row("q3", "commands/c", 2, { judge: "someone" }), row("q4", "knowledge/a", 2, { banned: undefined })]);
    const before = readFileSync(s.qrels, "utf8");
    expect(stampLegacy(s.qrels, s.library)).toEqual({ stamped: 5, left: 0, missing: [] });
    const after = s.lines();
    expect(after.map((r) => r.asset_sha256)).toEqual([digest(s.library, "knowledge/a"), digest(s.library, "skills/s"), digest(s.library, "knowledge/a"), digest(s.library, "commands/c"), digest(s.library, "knowledge/a")]);
    expect(after.map((r) => r.judge)).toEqual([LEGACY_JUDGE, LEGACY_JUDGE, LEGACY_JUDGE, "someone", LEGACY_JUDGE]); // a row that names its judge keeps it
    expect(LEGACY_JUDGE).toBe("legacy");
    // every grade, reason, id and ref is as it was, in the same order, in the same format
    const was = before.trim().split("\n").map((l) => JSON.parse(l));
    expect(after.map(({ judge: _j, asset_sha256: _a, ...r }) => r)).toEqual(was.map(({ judge: _j, ...r }) => r));
    expect(readFileSync(s.qrels, "utf8").endsWith("\n")).toBe(true);
    expect(readFileSync(s.qrels, "utf8").split("\n")[0]).toBe(JSON.stringify({ ...was[0], judge: "legacy", asset_sha256: digest(s.library, "knowledge/a") }));
    expect(gradesByQuery(parseQrels(readFileSync(s.qrels, "utf8")))).toEqual(gradesByQuery(parseQrels(before)));
    expect(readdirSync(s.root).sort()).toEqual(["library", "qrels.jsonl"]); // no file is left beside it
  });

  test("can be run again: it stamps only what is not stamped, and leaves the file as it is when there is nothing to do", () => {
    const s = set([row("q1", "knowledge/a", 3, { judge: "the-model", prompt_sha256: "p", date: "2026-10-11", asset_sha256: "e".repeat(64) }), row("q2", "skills/s", 2)]);
    expect(stampLegacy(s.qrels, s.library)).toEqual({ stamped: 1, left: 1, missing: [] });
    const once = readFileSync(s.qrels, "utf8");
    expect(s.lines()[0]).toEqual({ id: "q1", ref: "knowledge/a", grade: 3, reason: "why q1 knowledge/a", judge: "the-model", prompt_sha256: "p", date: "2026-10-11", asset_sha256: "e".repeat(64) }); // a row label wrote is not touched
    expect(stampLegacy(s.qrels, s.library)).toEqual({ stamped: 0, left: 2, missing: [] });
    expect(readFileSync(s.qrels, "utf8")).toBe(once);
    // a row added later without a digest is stamped by the next run
    writeFileSync(s.qrels, `${once}${JSON.stringify(row("q5", "commands/c", 1))}\n`);
    expect(stampLegacy(s.qrels, s.library)).toEqual({ stamped: 1, left: 2, missing: [] });
    expect(s.lines()[2]).toMatchObject({ id: "q5", judge: "legacy", asset_sha256: digest(s.library, "commands/c") });
  });

  test("stamps only the last row of a pair: an older row of a pair that was graded again is history", () => {
    const s = set([row("q1", "knowledge/a", 1), row("q1", "knowledge/a", 3, { judge: "the-model", asset_sha256: "f".repeat(64) }), row("q2", "knowledge/a", 2), row("q2", "knowledge/a", 3)]);
    expect(stampLegacy(s.qrels, s.library)).toEqual({ stamped: 1, left: 3, missing: [] });
    expect(s.lines().map((r) => r.asset_sha256)).toEqual([undefined, "f".repeat(64), undefined, digest(s.library, "knowledge/a")]);
  });

  test("writes nothing when a row names a ref that no file of the library gives, and names the refs", () => {
    const s = set([row("q1", "knowledge/a", 3), row("q1", "knowledge/gone", 2), row("q2", "knowledge/gone", 2), row("q2", "agents/missing", 1)]);
    const before = readFileSync(s.qrels, "utf8");
    expect(stampLegacy(s.qrels, s.library)).toEqual({ stamped: 0, left: 0, missing: ["knowledge/gone", "agents/missing"] });
    expect(readFileSync(s.qrels, "utf8")).toBe(before);
  });

  test("a later edit to an asset makes label grade the pair again, which it did not for a row without a digest", async () => {
    // a library laid out as akm lays it out, graded before label wrote digests
    const files = { "knowledge/a.md": "print the pdf version one\n", "knowledge/b.md": "nothing\n" };
    const legacy = [{ id: "q1", ref: "knowledge/a", grade: 3, reason: "from the first run" }];
    const queries = [{ id: "q1", query: "print the pdf", kind: "direct" }];
    const answers: Answers = { "print the pdf": { search: ["a"], curate: ["a"] } };

    const before = setup(files, queries, legacy, answers);
    writeFileSync(join(before.root, "library", "knowledge", "a.md"), "print the pdf version two\n");
    const unchanged = await printed(() => labelCollection("public", before.ctx(stubJudge({}).judge), before.folders));
    expect(unchanged.out.join("\n")).toContain("1 pooled pairs, 1 already graded, 0 to grade"); // an edit to the asset changed nothing

    const set = setup(files, queries, legacy, answers);
    expect(stampLegacy(join(set.folders.assets, "qrels.jsonl"), set.folders.library)).toEqual({ stamped: 1, left: 0, missing: [] });
    const settled = await printed(() => labelCollection("public", set.ctx(stubJudge({}).judge), set.folders));
    expect(settled.out.join("\n")).toContain("1 pooled pairs, 1 already graded, 0 to grade"); // the asset is as it was when it was stamped
    expect(settled.err.join("\n")).toContain("assets/qrels.jsonl has grades by legacy, and this run grades with the-model. Grades of different judges do not mix cleanly"); // the legacy grades are of another judge than this one

    writeFileSync(join(set.root, "library", "knowledge", "a.md"), "print the pdf version two\n");
    const { judge, seen } = stubJudge({ "knowledge/a": 1 });
    const again = await printed(() => labelCollection("public", set.ctx(judge), set.folders));
    expect(again.out.join("\n")).toContain("1 pooled pairs, 0 already graded, 1 to grade, 2 at a time (1 of them were graded from an asset that has changed since)");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("print the pdf version two");
    const rows = parseQrels(set.qrels());
    expect(rows.map((r) => [r.judge, r.grade])).toEqual([["legacy", 3], ["the-model", 1]]); // the old row stays as history, the new grade replaces it
    expect(gradesByQuery(rows).get("q1")).toEqual({ "knowledge/a": 1 });
    const last = await printed(() => labelCollection("public", set.ctx(stubJudge({}).judge), set.folders));
    expect(last.err).toEqual([]); // and it is not once the pair has been graded again
  });

  test("the library's own qrels all record the digest of their asset and a judge, and the digests are those of asset files", () => {
    const rows = parseQrels(readFileSync(join(import.meta.dir, "..", "assets", "qrels.jsonl"), "utf8"));
    expect(rows.length).toBe(1876);
    expect(rows.filter((r) => !/^[0-9a-f]{64}$/.test(r.asset_sha256 ?? "")).length).toBe(0);
    expect(rows.filter((r) => r.judge === undefined).length).toBe(0);
    expect(new Set(rows.map((r) => r.judge))).toEqual(new Set([LEGACY_JUDGE, "chat/qwen3.8-27b", "codex-review"])); // original grades plus the documented coverage expansion
  });

  test("the command: --stamp-legacy is for the public library, and says so for a set of your own", () => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "label.ts"), "--stamp-legacy", "--cases", "notes"], { cwd: tmp(), stdout: "pipe", stderr: "pipe" });
    expect(done.exitCode).toBe(2);
    expect(done.stderr.toString()).toContain("--stamp-legacy is for the public library, whose refs are worked out from its files.");
  });
});

describe("the command", () => {
  // Bun loads the .env of its working folder. So the command runs in a folder of its own, with the judge settings it is given.
  const run = (args: string[], env: Record<string, string> = {}) => {
    const { JUDGE_BASE_URL: _u, JUDGE_MODEL: _m, JUDGE_API_KEY: _k, ...rest } = process.env;
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "label.ts"), ...args], { cwd: tmp(), env: { ...rest, ...env }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  test("--cases reports the judge and proceeds without a terminal or a confirmation", () => {
    const judge = { JUDGE_BASE_URL: "http://localhost:1/v1", JUDGE_MODEL: "m", JUDGE_API_KEY: "secret" };
    const done = run(["--cases", "notes"], judge);
    expect(done.out).toContain("The cases in notes will be sent to:");
    expect(done.out).toContain("  judge  m at http://localhost:1/v1");
    expect(done.out).not.toContain("Continue?");
    expect(done.err).toContain("is missing"); // no cases to read, so no judge call
    expect(done.err + done.out).not.toContain("secret");
  });

  test("-y and --yes are not flags: it stops with the usage, which does not list them, before it reads or runs anything", () => {
    const judge = { JUDGE_BASE_URL: "http://localhost:1/v1", JUDGE_MODEL: "m", JUDGE_API_KEY: "secret" };
    for (const flag of ["-y", "--yes"]) {
      const done = run(["--cases", "notes", flag], judge);
      expect(done.code, flag).toBe(2);
      expect(done.err, flag).toContain(`retrieval label: Unknown option '${flag}'`);
      expect(done.err, flag).toContain("Usage: evals/retrieval/label");
      expect(done.err + done.out, flag).not.toContain("secret");
      expect(done.out, flag).toBe("");
    }
    expect(run(["--help"]).out).not.toMatch(/(^|\s)(-y|--yes)\b/);
  });

  test("grades the public library or a set of your own, and says so for the rewrite and for all", () => {
    const judge = { JUDGE_BASE_URL: "http://localhost:1/v1", JUDGE_MODEL: "m" };
    const done = run(["--corpus", "custom"], judge);
    expect(done.code).toBe(2);
    expect(done.err).toContain("the rewrite in private/retrieval/assets is not graded: generate carries the public grades over to it. Grade the public library (the default), or a set of your own with --cases DIR.");
    expect(run(["--corpus", "all"], judge).err).toContain("--corpus all is for run. Grade the public library (the default), or a set of your own with --cases DIR.");
    expect(run(["--corpus", "nope"], judge).err).toContain('--corpus must be public, custom or all, not "nope"');
    expect(run(["--cases", "notes", "--corpus", "public"], judge).err).toContain("--cases is a custom corpus");
  });

  test("says what is wrong with its arguments, and exits 2", () => {
    const judge = { JUDGE_BASE_URL: "http://localhost:1/v1", JUDGE_MODEL: "m" };
    expect(run(["--limit", "0"], judge).err).toContain("--limit must be a positive integer");
    expect(run(["--from", " "], judge).err).toContain("--from needs the results folder of a run");
    expect(run(["--cases", "notes", "--judge-model", ""]).err).toContain("--judge-model needs a model id");
    expect(run(["--cases", "notes"]).err).toContain("name the judge: pass --judge-model ID, or set JUDGE_MODEL in .env");
    expect(run(["--nope"]).err).toContain("Usage: evals/retrieval/label [--corpus public|custom] [--cases DIR] [--limit N]");
    expect(run(["--help"]).out).toContain("--corpus  public (default)");
  });

  test("describes --from and --stamp-legacy", () => {
    const help = run(["--help"]).out;
    expect(help).not.toContain('"private": true');
    expect(help).not.toContain("private network");
    expect(help).not.toContain("chat/, fast/");
    expect(help).toContain("--from    pool the first 10 results of every column of a run, semantic search included");
    expect(help).toContain("[--from RESULTS_DIR] [--stamp-legacy]");
    expect(help).toContain("--stamp-legacy  gives every row of assets/qrels.jsonl that records no digest of its asset");
  });

  test("stops with 2 when --from names a folder that is not a run", () => {
    const done = run(["--from", join(tmp(), "nothing")], { JUDGE_BASE_URL: "http://localhost:1/v1", JUDGE_MODEL: "m" });
    expect(done.code).toBe(2);
    expect(done.err).toContain("is not a results folder of evals/retrieval/run");
  });
});
