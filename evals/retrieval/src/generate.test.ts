import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assemble, commandWords, explode, generate, install, pinnedTools, problems } from "./generate.ts";
import { publicInputsSha256, readGenerated, rewriteSha256, staleAssets } from "./inputs.ts";
import { type Qrel, type Query, parseQrels } from "./lib.ts";

const REWRITE = resolve(import.meta.dir, "..", "..", "..", "lib", "rewrite", "rewrite.ts");

const dirs: string[] = [];
const akmBin = process.env.AKM_BIN;
beforeEach(() => {
  process.env.AKM_BIN = akmBin;
  if (akmBin === undefined) delete process.env.AKM_BIN;
});
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  if (akmBin === undefined) delete process.env.AKM_BIN;
  else process.env.AKM_BIN = akmBin;
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "retrieval-generate-"));
  dirs.push(d);
  return d;
};

const queries: Query[] = [
  { id: "q1", query: "how do I reach Alice about the service", kind: "direct", expected: ["knowledge/alice-guide", "knowledge/other"] },
  { id: "q2", query: "bake bread", kind: "no-answer", expected: [] },
  { id: "n1", query: "thanks!", kind: "chitchat" },
];
const qrels: Qrel[] = [
  { id: "q1", ref: "knowledge/alice-guide", grade: 3, reason: "Says that Alice owns it." },
  { id: "q1", ref: "knowledge/other", grade: 0, reason: "Unrelated.\nTwo lines.", banned: true },
  { id: "q2", ref: "knowledge/other", grade: 1, reason: "Same topic." },
];

describe("explode and assemble", () => {
  test("write one file per query and one per query's qrels, and read them back unchanged", () => {
    const dir = tmp();
    explode(queries, qrels, dir);
    expect(readFileSync(join(dir, "queries", "q1.txt"), "utf8")).toBe("how do I reach Alice about the service\n");
    expect(readFileSync(join(dir, "expected", "q1.txt"), "utf8")).toBe("knowledge/alice-guide\nknowledge/other\n");
    expect(existsSync(join(dir, "expected", "q2.txt"))).toBe(false);
    expect(readFileSync(join(dir, "qrels", "q1.txt"), "utf8")).toBe("knowledge/alice-guide\nSays that Alice owns it.\nknowledge/other\nUnrelated. Two lines.\n");
    expect(existsSync(join(dir, "qrels", "n1.txt"))).toBe(false);
    const back = assemble(queries, qrels, dir);
    expect(back.queries).toEqual(queries);
    expect(back.qrels).toEqual(qrels.map((r) => ({ ...r, reason: r.reason.replace(/\s+/g, " ") })));
    expect(back.qrels[1].banned).toBe(true); // a banned asset stays banned in the private copy
  });

  test("keep the grades, the ids and the kinds, whatever the text becomes", () => {
    const dir = tmp();
    explode(queries, qrels, dir);
    writeFileSync(join(dir, "queries", "q2.txt"), "bake rye\n");
    writeFileSync(join(dir, "expected", "q1.txt"), "knowledge/new-one\nknowledge/new-two\n");
    writeFileSync(join(dir, "qrels", "q2.txt"), "knowledge/changed\nA new reason.\n");
    const back = assemble(queries, qrels, dir);
    expect(back.queries[0].expected).toEqual(["knowledge/new-one", "knowledge/new-two"]);
    expect(back.queries[1]).toEqual({ id: "q2", query: "bake rye", kind: "no-answer", expected: [] });
    expect(back.queries[2]).toEqual({ id: "n1", query: "thanks!", kind: "chitchat" });
    expect(back.qrels[2]).toEqual({ id: "q2", ref: "knowledge/changed", grade: 1, reason: "A new reason." });
  });

  test("leave out the digest of the public asset, which the private asset's text does not have, and keep who graded", () => {
    const graded: Qrel[] = [{ ...qrels[0], judge: "the-judge", prompt_sha256: "p".repeat(64), date: "2026-10-11", asset_sha256: "a".repeat(64) }, ...qrels.slice(1)];
    const dir = tmp();
    explode(queries, graded, dir);
    const back = assemble(queries, graded, dir);
    expect(back.qrels[0]).toEqual({ id: "q1", ref: "knowledge/alice-guide", grade: 3, reason: "Says that Alice owns it.", judge: "the-judge", prompt_sha256: "p".repeat(64), date: "2026-10-11" });
    expect(Object.hasOwn(back.qrels[0], "asset_sha256")).toBe(false);
  });

  test("say what is missing when the rewrite did not write a file", () => {
    const dir = tmp();
    explode(queries, qrels, dir);
    rmSync(join(dir, "queries", "n1.txt"));
    expect(() => assemble(queries, qrels, dir)).toThrow("the rewrite did not write");
  });
});

describe("one rewrite run for the library, the queries and the qrels", () => {
  test("renames a name the same way in a file name, the file, a query, a ref and a reason", () => {
    const root = tmp();
    const input = join(root, "in");
    mkdirSync(join(input, "library", "knowledge"), { recursive: true });
    writeFileSync(join(input, "library", "knowledge", "alice-guide.md"), "# Guide\n\nAlice owns the service. Ask Alice before the first run.\n");
    writeFileSync(join(input, "library", "knowledge", "other.md"), "# Other\n\nSomething else entirely.\n");
    explode(queries, qrels, input);

    const map = join(root, "map.json");
    const run = Bun.spawnSync(["bun", REWRITE, "--seed", "7", "--map", map, input, join(root, "out")], { stdout: "pipe", stderr: "pipe" });
    expect(run.exitCode).toBe(0);
    const replacement = JSON.parse(readFileSync(map, "utf8")).words.alice as string;
    expect(replacement).toMatch(/^[a-z]+$/);
    expect(replacement).not.toBe("alice");

    const back = assemble(queries, qrels, join(root, "out"));
    const renamed = replacement[0].toUpperCase() + replacement.slice(1);
    expect(back.queries[0].query).toBe(`how do I reach ${renamed} about the service`);
    expect(back.qrels[0]).toMatchObject({ ref: `knowledge/${replacement}-guide`, grade: 3, reason: `Says that ${renamed} owns it.` });
    expect(back.qrels[1].ref).toBe("knowledge/other");
    expect(back.queries[0].expected).toEqual([`knowledge/${replacement}-guide`, "knowledge/other"]);
    expect(existsSync(join(root, "out", "library", "knowledge", `${replacement}-guide.md`))).toBe(true);
    expect(readFileSync(join(root, "out", "library", "knowledge", `${replacement}-guide.md`), "utf8")).toContain(`${renamed} owns the service`);
    expect(JSON.stringify(back).toLowerCase()).not.toContain("alice");
  });
});

describe("problems", () => {
  const pub = { queries, qrels, nAssets: 2 };
  const refs = new Set(["knowledge/alice-guide", "knowledge/other"]);

  test("finds none in a sound private set", () => {
    expect(problems(pub, { queries, qrels, refs })).toEqual([]);
  });

  test("finds a qrel ref or an expected ref that names no asset in the private library", () => {
    const priv = { queries, qrels: [{ ...qrels[0], ref: "knowledge/gone" }, ...qrels.slice(1)], refs };
    expect(problems(pub, priv).join("\n")).toContain("1 qrel or expected refs name no asset in the private library, such as knowledge/gone");
    const lost = { queries: [{ ...queries[0], expected: ["knowledge/lost"] }, ...queries.slice(1)], qrels, refs };
    expect(problems(pub, lost).join("\n")).toContain("1 qrel or expected refs name no asset in the private library, such as knowledge/lost");
  });

  test("finds two assets that became one", () => {
    const priv = { queries, qrels: [qrels[0], { ...qrels[1], ref: qrels[0].ref }, qrels[2]], refs };
    expect(problems(pub, priv).join("\n")).toContain("1 qrel rows share a query and an asset after the rewrite");
  });

  test("does not take a pair that was graded again, which has two rows, for two assets that became one", () => {
    const twice = [...qrels, { ...qrels[0], reason: "Again." }];
    expect(problems({ queries, qrels: twice, nAssets: 2 }, { queries, qrels: twice, refs })).toEqual([]);
    const merged = [twice[0], { ...twice[1], ref: twice[0].ref }, ...twice.slice(2)];
    expect(problems({ queries, qrels: twice, nAssets: 2 }, { queries, qrels: merged, refs }).join("\n")).toContain("1 qrel rows share a query and an asset after the rewrite");
  });

  test("finds a query that lost a relevant asset", () => {
    const priv = { queries, qrels: [{ ...qrels[0], grade: 1 }, ...qrels.slice(1)], refs };
    expect(problems(pub, priv)).toEqual(["q1 had 1 relevant assets and now has 0"]);
  });

  test("finds a library that lost an asset, and a query that went missing", () => {
    expect(problems(pub, { queries: queries.slice(1), qrels, refs: new Set(["knowledge/alice-guide", "knowledge/other", "knowledge/extra"]) }).join("\n")).toContain("the private library has 3 assets, the public one 2");
    expect(problems(pub, { queries: queries.slice(1), qrels, refs }).join("\n")).toContain("2 private queries for 3 public ones");
  });
});

describe("commandWords", () => {
  const sorted = (text: string) => [...commandWords(text)].sort();

  test("reads the command each line of a shell code block starts with, after a prompt and variables, and skips comments", () => {
    const text = ["Run it:", "```bash", "# a comment: notacommand", "$ bun run build", "CI=1 FOO=2 cargo build --release", "```"].join("\n");
    expect(sorted(text)).toEqual(["build", "bun", "cargo"]); // build is what bun runs: a script, which is no tool and is kept out by the caller
  });

  test("reads a command after a pipe, && , || and ;", () => {
    expect(sorted("```sh\ncat file | grep x && make test || echo no; ls\n```\n")).toEqual(["cat", "echo", "grep", "ls", "make"]);
  });

  test("reads the command that a wrapper or a package runner runs", () => {
    const text = ["```sh", "sudo -E docker build .", "npx playwright test", "env FOO=1 terraform plan", "uv run pytest -q", "pnpm exec vitest", "python3 -m http.server", "poetry run ruff check", "```"].join("\n");
    expect(sorted(text)).toEqual(["docker", "env", "http.server", "npx", "playwright", "pnpm", "poetry", "pytest", "python3", "ruff", "sudo", "terraform", "uv", "vitest"]);
  });

  test("does not read the arguments of a command, or the subcommand of a tool that is not a runner", () => {
    const words = commandWords("```sh\ndocker compose up -d\ngit clone https://github.com/x/y\nbun test\nnpm install react\n```\n");
    expect(words.has("docker")).toBe(true);
    for (const word of ["compose", "react", "github", "install", "clone"]) expect(words.has(word)).toBe(false);
    expect(words.has("test")).toBe(false); // bun is a runner only for run, exec, x and dlx
  });

  test("reads a block with no language, and a fence of tildes that is indented, and not a block in another language", () => {
    expect(sorted("```\nollama pull x\n```\n")).toEqual(["ollama"]);
    expect(sorted("  ~~~sh\n  gcloud auth login\n  ~~~\n")).toEqual(["gcloud"]);
    expect(commandWords('```python\nimport pydantic\nfoo bar\n```\n```json\n{ "docker": 1 }\n```\n').size).toBe(0);
  });

  test("reads an inline code span that is a command with arguments, and not a bare name or prose", () => {
    const words = commandWords('Call `akm search "pdf"` or `env FOO=1 terraform plan`, or ask `docker`, or read about Grafana and `Jenkins build` terms.');
    expect(sorted('Call `akm search "pdf"` or `env FOO=1 terraform plan`.')).toEqual(["akm", "env", "terraform"]);
    for (const word of ["docker", "grafana", "jenkins"]) expect(words.has(word)).toBe(false);
    expect(commandWords("no commands here, only words like docker and bun").size).toBe(0);
  });
});

describe("pinnedTools", () => {
  test("is akm and the tools of lib/rewrite that the library tells its reader to run, and not a tool it only writes about", () => {
    const library = tmp();
    mkdirSync(join(library, "skills"), { recursive: true });
    writeFileSync(join(library, "skills", "a.md"), "Use `akm show skill:x`.\n\n```sh\nuv run pytest\ndocker build .\ngit status\nnpm install react\n```\n\nGrafana and Jenkins draw the charts, with `openai` keys.\n");
    writeFileSync(join(library, "skills", "b.md"), "```\nbun test\nqwen3 serve\n```\n");
    expect(pinnedTools(library)).toEqual(["akm", "bun", "docker", "pytest", "qwen", "uv"]); // git and npm are not renamed anyway, and react, grafana, jenkins and openai are not run
  });

  test("is akm for a library with no commands", () => {
    const library = tmp();
    writeFileSync(join(library, "notes.md"), "Just prose about the weather.\n");
    expect(pinnedTools(library)).toEqual(["akm"]);
  });

  test("covers the commands of the real public library that the rewrite would rename", () => {
    const pinned = pinnedTools(resolve(import.meta.dir, "..", "..", "..", "corpus", "library"));
    for (const tool of ["akm", "bun", "uv", "docker"]) expect(pinned).toContain(tool);
    for (const tool of ["grafana", "jenkins"]) expect(pinned).not.toContain(tool); // written about, not run
  });
});

describe("install", () => {
  const put = (dir: string, files: Record<string, string>) => {
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
  };

  test("puts the products of the staging folder in place of the ones before, and leaves nothing behind", () => {
    const out = tmp();
    put(out, { "assets/old.txt": "old", "map.json": "old map", "own/keep.txt": "mine" });
    put(join(out, ".staging"), { "assets/new.txt": "new", "map.json": "new map" });
    install(join(out, ".staging"), out, ["assets", "map.json"]);
    expect(readdirSync(join(out, "assets"))).toEqual(["new.txt"]);
    expect(readFileSync(join(out, "map.json"), "utf8")).toBe("new map");
    expect(readFileSync(join(out, "own", "keep.txt"), "utf8")).toBe("mine"); // what generate did not make is not touched
    expect(existsSync(join(out, ".old"))).toBe(false);
  });

  test("puts the first ones back when a later one cannot be moved", () => {
    const out = tmp();
    put(out, { "assets/old.txt": "old", "map.json": "old map" });
    put(join(out, ".staging"), { "assets/new.txt": "new" }); // no map.json to move
    expect(() => install(join(out, ".staging"), out, ["assets", "map.json"])).toThrow();
    expect(readdirSync(join(out, "assets"))).toEqual(["old.txt"]);
    expect(readFileSync(join(out, "map.json"), "utf8")).toBe("old map");
    expect(existsSync(join(out, ".old"))).toBe(false);
  });

  test("works when there is nothing there yet", () => {
    const out = tmp();
    put(join(out, ".staging"), { "assets/new.txt": "new", "map.json": "m", "books-map.json": "b" });
    install(join(out, ".staging"), out);
    expect(readdirSync(out).sort()).toEqual([".staging", "assets", "books-map.json", "map.json"]);
  });
});

/** An akm over .md files: the version, an index that counts them, and `search "" --type knowledge` that lists them. */
const FAKE_AKM = `
import { readdirSync } from "node:fs";
import { join } from "node:path";
const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "--version") { console.log("0.9.99-test"); process.exit(0); }
if (cmd === "search" && process.argv[3] === "--help") { console.log("--detail=<detail> Detail level, or agent"); process.exit(0); }
const dir = process.env.AKM_BUNDLE_DIR;
const entries = readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => ({ ref: "knowledge/" + f.slice(0, -3), type: "knowledge", name: f.slice(0, -3), description: "", path: join(dir, f) }));
if (cmd === "index") { console.log(JSON.stringify({ ok: true, totalEntries: entries.length })); process.exit(0); }
console.log(JSON.stringify({ hits: rest[rest.indexOf("--type") + 1] === "knowledge" ? entries : [] }));
`;

const GUIDE = [
  "# Guide",
  "",
  'Alice owns the service. Ask Alice before the first run. Run `akm search "pdf"` to find it, then:',
  "",
  "```bash",
  "$ bun run build",
  "uv run pytest",
  "sudo docker compose up | grep ok",
  "```",
  "",
  "Grafana shows the metrics.",
  "",
].join("\n");

const jsonl = (rows: object[]) => `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;

/** A small repository of public inputs: the library with a guide, its queries and qrels, and a books collection of one asset. */
function publicRepo() {
  const root = tmp();
  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  write("corpus/library/alice-guide.md", GUIDE);
  write("corpus/library/other.md", "# Other\n\nSomething else entirely.\n");
  write("evals/retrieval/assets/queries.jsonl", jsonl([{ id: "q1", query: "how do I reach Alice about the service", kind: "direct", expected: ["knowledge/alice-guide"] }, { id: "n1", query: "thanks!", kind: "chitchat" }]));
  write(
    "evals/retrieval/assets/qrels.jsonl",
    jsonl([
      { id: "q1", ref: "knowledge/alice-guide", grade: 3, reason: "Says that Alice owns it.", judge: "the-judge", date: "2026-10-11", asset_sha256: "a".repeat(64) },
      { id: "q1", ref: "knowledge/other", grade: 0, reason: "Unrelated." },
    ]),
  );
  write("evals/retrieval/assets/books/library/bread.md", "# Bread\n\nKnead the dough, then let it rise.\n");
  write("evals/retrieval/assets/books/queries.jsonl", jsonl([{ id: "b1", query: "how do I bake bread", kind: "direct" }]));
  write("evals/retrieval/assets/books/qrels.jsonl", jsonl([{ id: "b1", ref: "knowledge/bread", grade: 3, reason: "Bakes bread." }]));
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  process.env.AKM_BIN = `bun ${script}`;
  return { root, out: join(root, "private", "retrieval"), write };
}

const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};

describe("generate", () => {
  test("keeps akm and the executables the library runs as they are, and renames the rest", async () => {
    const { root, out } = publicRepo();
    const made = await generate({ seed: "7", out, root });
    expect(made.installed).toBe(true);
    expect(made.collections.map((c) => [c.name, c.found])).toEqual([["library", []], ["books", []]]);

    const files = readdirSync(join(out, "assets", "library"));
    const guide = files.find((f) => f.endsWith("-guide.md")) as string;
    expect(guide).toBeDefined();
    expect(guide).not.toContain("alice");
    const text = readFileSync(join(out, "assets", "library", guide), "utf8");
    expect(text).toContain('Run `akm search "pdf"` to find it');
    expect(text).toContain("$ bun run build\nuv run pytest\nsudo docker compose up | grep ok"); // pytest is run by uv, and is kept as well
    expect(text).not.toMatch(/alice|grafana/i); // a name, and a tool that is only written about, are renamed
    const map = JSON.parse(readFileSync(join(out, "map.json"), "utf8"));
    expect(map.words).toMatchObject({ akm: "akm", bun: "bun", uv: "uv", docker: "docker", pytest: "pytest" });
    expect(map.words.alice).toMatch(/^[a-z]+$/);
    expect(map.words.grafana).not.toBe("grafana");
    // the queries and the qrels follow the library
    const queries = readFileSync(join(out, "assets", "queries.jsonl"), "utf8");
    expect(queries).toContain(guide.replace(/\.md$/, ""));
    expect(queries.toLowerCase()).not.toContain("alice");
  });

  test("carries who graded into the private qrels, without the digest of the public asset", async () => {
    const { root, out } = publicRepo();
    await generate({ seed: "7", out, root });
    const qrels = parseQrels(readFileSync(join(out, "assets", "qrels.jsonl"), "utf8"));
    expect(qrels[0]).toMatchObject({ judge: "the-judge", date: "2026-10-11", grade: 3 });
    expect(qrels.some((r) => r.asset_sha256 !== undefined)).toBe(false);
  });

  test("writes generated.json beside the assets: the seed, a digest of the public inputs, and a digest of the rewrite's code", async () => {
    const { root, out } = publicRepo();
    await generate({ seed: "7", out, root });
    expect(JSON.parse(readFileSync(join(out, "assets", "generated.json"), "utf8"))).toEqual({ seed: "7", inputs_sha256: publicInputsSha256(root), rewrite: rewriteSha256() });
    expect(readGenerated(join(out, "assets"))?.rewrite).toMatch(/^[0-9a-f]{64}$/);
    expect(readGenerated(join(out, "assets"))?.seed).toBe("7");
    expect(readdirSync(out).sort()).toEqual(["assets", "books-map.json", "map.json"]); // no staging folder is left
  });

  test("makes the same assets from the same seed", async () => {
    const { root, out } = publicRepo();
    await generate({ seed: "7", out, root });
    const first = readFileSync(join(out, "assets", "queries.jsonl"), "utf8") + readFileSync(join(out, "map.json"), "utf8");
    await generate({ seed: "7", out, root });
    expect(readFileSync(join(out, "assets", "queries.jsonl"), "utf8") + readFileSync(join(out, "map.json"), "utf8")).toBe(first);
  });

  test("leaves the assets and maps of the run before as they were when a collection is not sound", async () => {
    const { root, out, write } = publicRepo();
    await generate({ seed: "7", out, root });
    const before = { generated: readFileSync(join(out, "assets", "generated.json"), "utf8"), map: readFileSync(join(out, "map.json"), "utf8"), books: readFileSync(join(out, "assets", "books", "qrels.jsonl"), "utf8") };
    // the books' qrels name an asset the library does not have: that is found after the library collection was made
    write("evals/retrieval/assets/books/qrels.jsonl", jsonl([{ id: "b1", ref: "knowledge/bread", grade: 3, reason: "Bakes bread." }, { id: "b1", ref: "knowledge/missing", grade: 0, reason: "Not there." }]));
    const made = await quiet(() => generate({ seed: "8", out, root }));
    expect(made.installed).toBe(false);
    expect(made.collections[0].found).toEqual([]);
    expect(made.collections[1].found.join("\n")).toContain("name no asset in the private library, such as knowledge/missing");
    expect(readFileSync(join(out, "assets", "generated.json"), "utf8")).toBe(before.generated);
    expect(readFileSync(join(out, "map.json"), "utf8")).toBe(before.map);
    expect(readFileSync(join(out, "assets", "books", "qrels.jsonl"), "utf8")).toBe(before.books);
    expect(readdirSync(out).sort()).toEqual(["assets", "books-map.json", "map.json"]);
  });

  test("writes nothing under the target when the first run is not sound, and leaves no staging folder", async () => {
    const { root, out, write } = publicRepo();
    write("evals/retrieval/assets/books/qrels.jsonl", jsonl([{ id: "b1", ref: "knowledge/missing", grade: 3, reason: "Not there." }]));
    const made = await quiet(() => generate({ seed: "7", out, root }));
    expect(made.installed).toBe(false);
    expect(existsSync(join(out, "assets"))).toBe(false);
    expect(readdirSync(out)).toEqual([]);
  });

  test("leaves the previous assets alone when generation stops with an error", async () => {
    const { root, out } = publicRepo();
    await generate({ seed: "7", out, root });
    const before = readFileSync(join(out, "assets", "generated.json"), "utf8");
    process.env.AKM_BIN = join(root, "no-such-akm");
    await expect(generate({ seed: "9", out, root })).rejects.toThrow("could not run");
    expect(readFileSync(join(out, "assets", "generated.json"), "utf8")).toBe(before);
    expect(readdirSync(out).sort()).toEqual(["assets", "books-map.json", "map.json"]);
  });

  test("run --corpus private takes the assets it made and refuses them once the public inputs change", async () => {
    const { root, out, write } = publicRepo();
    await generate({ seed: "7", out, root });
    const assets = join(out, "assets");
    expect(staleAssets(assets, root)).toBeUndefined();

    // label graded a pair again: its row comes after the old one, and the pair has two rows
    write("evals/retrieval/assets/qrels.jsonl", `${readFileSync(join(root, "evals/retrieval/assets/qrels.jsonl"), "utf8")}${JSON.stringify({ id: "q1", ref: "knowledge/other", grade: 1, reason: "Graded again." })}\n`);
    expect(staleAssets(assets, root, "private/retrieval/assets")).toBe(
      "the private assets in private/retrieval/assets/ were made from public inputs that have changed since: the library, the queries or the qrels. Make them again with: ./generate-assets --only retrieval",
    );
    const again = await generate({ seed: "7", out, root });
    expect(again.installed).toBe(true); // a pair with two rows is not two assets that became one
    expect(staleAssets(assets, root)).toBeUndefined();
    write("corpus/library/other.md", "# Other\n\nChanged.\n");
    expect(staleAssets(assets, root)).toContain("have changed since");
  });

  test("run --corpus private refuses assets that another rewrite made", async () => {
    const { root, out } = publicRepo();
    await generate({ seed: "7", out, root });
    const assets = join(out, "assets");
    const made = JSON.parse(readFileSync(join(assets, "generated.json"), "utf8"));
    writeFileSync(join(assets, "generated.json"), JSON.stringify({ ...made, rewrite: "0".repeat(64) }));
    expect(staleAssets(assets, root, "private/retrieval/assets")).toBe(
      "the private assets in private/retrieval/assets/ were made by a rewrite that has changed since: lib/rewrite, its lexicon or the tools that generate pins. Make them again with: ./generate-assets --only retrieval",
    );
    writeFileSync(join(assets, "generated.json"), JSON.stringify(made)); // the digest it wrote is the one it checks
    expect(staleAssets(assets, root)).toBeUndefined();
  });

  test("run --corpus private refuses assets that have no generated.json", async () => {
    const { root, out } = publicRepo();
    await generate({ seed: "7", out, root });
    rmSync(join(out, "assets", "generated.json"));
    expect(staleAssets(join(out, "assets"), root, "private/retrieval/assets")).toBe(
      "the private assets in private/retrieval/assets/ have no generated.json, so nothing says what they were made from (an older generate, or a generate that stopped). Make them again with: ./generate-assets --only retrieval",
    );
    writeFileSync(join(out, "assets", "generated.json"), "{not json");
    expect(staleAssets(join(out, "assets"), root)).toContain("have no generated.json");
  });
});

describe("the command", () => {
  test("says how to use it, and exits 2, without a seed and an out folder", () => {
    const done = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts")], { cwd: tmp(), stdout: "pipe", stderr: "pipe" });
    expect(done.exitCode).toBe(2);
    expect(done.stderr.toString()).toContain("Usage: evals/retrieval/generate --seed N --out private/retrieval");
  });
});
