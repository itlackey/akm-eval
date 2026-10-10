import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createSandbox } from "../../../lib/akm/akm.ts";
import type { Answer } from "./akm.ts";
import { Bm25 } from "./bm25.ts";
import { type Judge, grade, labelCollection, makeJudge, pending, poolQueries } from "./label.ts";
import { type Asset, type Query, parseQrels } from "./lib.ts";
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
    const out = await grade(todo, asset, judge, qrels, { concurrency: 1 });
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
    const first = await grade(todo, asset, judge, qrels, { concurrency: 1, stop: () => calls++ >= 2 });
    expect(first).toMatchObject({ graded: 2, stopped: true });
    const done = new Set(parseQrels(readFileSync(qrels, "utf8")).map((r) => `${r.id}\t${r.ref}`));
    expect([...done]).toEqual(["q1\ta", "q1\tb"]);
    const left = pending(queries.slice(0, 1), new Map([["q1", ["a", "b", "c", "d"]]]), done);
    expect(left.map((t) => t.ref)).toEqual(["c", "d"]);
    const second = await grade(left, asset, judge, qrels, { concurrency: 1 });
    expect(second).toMatchObject({ graded: 2, stopped: false });
    expect(readFileSync(qrels, "utf8").trim().split("\n")).toHaveLength(4);
  });

  test("asks again once when a reply holds no grade, and counts it", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const replies = ["I need more room to think", '{"grade": 2, "reason": "second try"}', '{"grade": 3, "reason": "r"}'];
    const judge: Judge = async () => replies.shift() as string;
    const out = await grade(todo.slice(0, 2), asset, judge, qrels, { concurrency: 1 });
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
    const out = await grade(todo, asset, judge, qrels, { concurrency: 1, log: (l) => lines.push(l) });
    expect(out).toMatchObject({ graded: 2, failed: 2, retried: 1, gaveUp: false, lastError: "HTTP 500" });
    expect(parseQrels(readFileSync(qrels, "utf8")).map((r) => r.ref)).toEqual(["a", "d"]);
    expect(lines.filter((l) => l.includes("FAILED"))).toHaveLength(2);
  });

  test("gives up when the endpoint answers nothing, rather than failing every pair", async () => {
    const qrels = join(tmp(), "qrels.jsonl");
    const many = Array.from({ length: 40 }, (_, i) => ({ id: "q1", query: "p", ref: `r${i}` }));
    let calls = 0;
    const judge: Judge = async () => {
      calls++;
      throw new Error("connection refused");
    };
    const out = await grade(many, asset, judge, qrels, { concurrency: 2 });
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
 * bundle, and refs read `knowledge/<name>`. `search ""` lists them, and a query is answered from `answers`.
 */
const fakeAkm = (calls: string, answers: Answers) => `
import { appendFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, JSON.stringify([cmd, ...rest]) + "\\n");
if (cmd === "--version") { console.log("0.9.99-test"); process.exit(0); }
const config = JSON.parse(readFileSync(process.env.AKM_CONFIG_DIR + "/config.json", "utf8"));
const roots = config.bundles ? Object.entries(config.bundles).map(([name, b]) => [name + "//", b.path]) : [["", process.env.AKM_BUNDLE_DIR]];
const entries = roots.flatMap(([prefix, dir]) => readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => ({ ref: prefix + "knowledge/" + f.slice(0, -3), type: "knowledge", name: f.slice(0, -3), description: "about " + f.slice(0, -3), path: join(dir, f) })));
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

    // the new grades follow the old lines, in the format the file has: id, ref, grade, reason
    const after = set.qrels();
    expect(after.startsWith(before)).toBe(true);
    const added = after.slice(before.length).trim().split("\n").map((l) => JSON.parse(l));
    expect(added.map((r) => Object.keys(r))).toEqual([["id", "ref", "grade", "reason"], ["id", "ref", "grade", "reason"]]);
    expect(added.sort((x, y) => (x.id < y.id ? -1 : 1))).toEqual([
      { id: "q1", ref: "two//knowledge/b", grade: 2, reason: "reason for two//knowledge/b" },
      { id: "q2", ref: "two//knowledge/c", grade: 0, reason: "reason for two//knowledge/c" },
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

describe("the command", () => {
  // Bun loads the .env of its working folder. So the command runs in a folder of its own, with the judge settings it is given.
  const run = (args: string[], env: Record<string, string> = {}) => {
    const { JUDGE_BASE_URL: _u, JUDGE_MODEL: _m, JUDGE_API_KEY: _k, ...rest } = process.env;
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "label.ts"), ...args], { cwd: tmp(), env: { ...rest, ...env }, stdout: "pipe", stderr: "pipe" });
    return { code: done.exitCode, out: done.stdout.toString(), err: done.stderr.toString() };
  };

  test("refuses to send the own set to a judge that is not local, before it reads or runs anything", () => {
    // Hosts that never resolve: were the check gone, the command would run on the real own set, and its notes would still go nowhere.
    for (const url of ["https://judge.example.invalid/v1", "http://10.1.2.3.example.invalid:8080/v1", "https://localhost.example.invalid/v1"]) {
      const done = run(["--corpus", "own"], { JUDGE_BASE_URL: url, JUDGE_MODEL: "m", JUDGE_API_KEY: "secret" });
      expect(done.code).toBe(2);
      expect(done.err).toContain("--corpus own sends your notes to the judge");
      expect(done.err).not.toContain("secret");
      expect(done.out).toBe("");
    }
  });

  test("says what is wrong with its arguments, and exits 2", () => {
    const judge = { JUDGE_BASE_URL: "http://localhost:1/v1", JUDGE_MODEL: "m" };
    expect(run(["--corpus", "private"], judge)).toMatchObject({ code: 2 });
    expect(run(["--corpus", "private"], judge).err).toContain('--corpus must be public or own, not "private"');
    expect(run(["--limit", "0"], judge).err).toContain("--limit must be a positive integer");
    expect(run(["--corpus", "own"]).err).toContain("name the judge: pass --judge-model ID, or set JUDGE_MODEL in .env");
    expect(run(["--nope"]).err).toContain("Usage: evals/retrieval/label [--corpus public|own] [--limit N]");
    expect(run(["--help"]).out).toContain("--corpus  public (default)");
  });
});
