import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveCorpora } from "../../../lib/corpus.ts";
import { sha256Files } from "../../../lib/provenance.ts";
import { type AssetsDigests, REWRITE_CODE, assetsDigests, assetsSha256, filesUnder, inFolder, manifestSha256, publicInputs, publicInputsSha256, readGenerated, readSeed, rewriteSha256, staleAssets } from "./inputs.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "retrieval-inputs-")));
  dirs.push(d);
  return d;
};
const put = (dir: string, files: Record<string, string>) => {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
};

/** The public inputs of a repository: a library, the books and the four jsonl files. */
const REPO = {
  "corpus/library/skills/a.md": "a\n",
  "corpus/library/b.md": "b\n",
  "evals/retrieval/assets/queries.jsonl": "q\n",
  "evals/retrieval/assets/qrels.jsonl": "r\n",
  "evals/retrieval/assets/books/library/c.md": "c\n",
  "evals/retrieval/assets/books/queries.jsonl": "bq\n",
  "evals/retrieval/assets/books/qrels.jsonl": "br\n",
};

describe("inFolder", () => {
  test("runs in the folder and goes back to the old one, also when it throws", () => {
    const here = process.cwd();
    const dir = tmp();
    expect(inFolder(dir, () => process.cwd())).toBe(dir);
    expect(process.cwd()).toBe(here);
    expect(() => inFolder(dir, () => { throw new Error("boom"); })).toThrow("boom");
    expect(process.cwd()).toBe(here);
  });
});

describe("the digests of a run's assets", () => {
  const library = { "a.md": "sum-a", "skills/b.md": "sum-b" };
  const write = (dir: string) => put(dir, { "queries.jsonl": "q\n", "qrels.jsonl": "r\n" });
  const digests = (dir: string, files: Record<string, string> = library, adapters?: Record<string, string>) => assetsDigests({ files, adapters }, join(dir, "queries.jsonl"), join(dir, "qrels.jsonl"));

  test("manifestSha256 is the same for the same paths and contents, in any order, and changes with a path or a content", () => {
    const first = manifestSha256(library);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(manifestSha256({ "skills/b.md": "sum-b", "a.md": "sum-a" })).toBe(first);
    expect(manifestSha256({ ...library, "a.md": "sum-a2" })).not.toBe(first);
    expect(manifestSha256({ "renamed.md": "sum-a", "skills/b.md": "sum-b" })).not.toBe(first);
    expect(manifestSha256({ ...library, "c.md": "sum-c" })).not.toBe(first);
    expect(manifestSha256({ "a.md": "sum-a" })).not.toBe(first);
  });

  test("have the library, the bundle mapping, the queries and the qrels, the same for the same files in another folder", () => {
    const [a, b] = [tmp(), tmp()];
    write(a);
    write(b);
    const first = digests(a);
    for (const key of ["library_sha256", "queries_sha256", "qrels_sha256"] as const) expect(first[key]).toMatch(/^[0-9a-f]{64}$/);
    expect(first.bundles_sha256).toBeNull();
    expect(digests(b)).toEqual(first);
    expect(assetsSha256(digests(b))).toBe(assetsSha256(first));
    expect(assetsSha256(first)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("each digest changes with its own input and with no other, and assets_sha256 with every one of them", () => {
    const a = tmp();
    write(a);
    const first = digests(a);
    const mapped = digests(a, library, { one: "akm", two: "claude" });
    expect(mapped.bundles_sha256).toMatch(/^[0-9a-f]{64}$/);
    const unmapped: AssetsDigests = { ...mapped, bundles_sha256: null };
    expect(unmapped).toEqual(first);
    expect(digests(a, library, { two: "claude", one: "akm" })).toEqual(mapped); // in the order of the names
    expect(digests(a, library, { one: "akm", two: "akm" }).bundles_sha256).not.toBe(mapped.bundles_sha256);
    const more = digests(a, { ...library, "c.md": "sum-c" });
    expect(more.library_sha256).not.toBe(first.library_sha256);
    expect({ ...more, library_sha256: first.library_sha256 }).toEqual(first);
    writeFileSync(join(a, "qrels.jsonl"), "r2\n");
    const graded = digests(a);
    expect(graded.qrels_sha256).not.toBe(first.qrels_sha256);
    expect({ ...graded, qrels_sha256: first.qrels_sha256 }).toEqual(first);
    writeFileSync(join(a, "queries.jsonl"), "q2\n");
    const asked = digests(a);
    expect(asked.queries_sha256).not.toBe(first.queries_sha256);
    expect({ ...asked, queries_sha256: first.queries_sha256, qrels_sha256: first.qrels_sha256 }).toEqual(first);
    const all: AssetsDigests[] = [first, mapped, more, graded, asked];
    expect(new Set(all.map(assetsSha256)).size).toBe(5);
  });
});

describe("publicInputs", () => {
  test("lists the library, the books' library and the four jsonl files, by their path from the root", () => {
    const root = tmp();
    put(root, REPO);
    expect(publicInputs(root).sort()).toEqual(Object.keys(REPO).sort());
  });

  test("follows a link to a folder, as a copy of the library does", () => {
    const root = tmp();
    const elsewhere = tmp();
    put(elsewhere, { "linked.md": "x\n" });
    put(root, { ...REPO, "corpus/library/b.md": "b\n" });
    symlinkSync(elsewhere, join(root, "corpus", "library", "linked"));
    expect(publicInputs(root)).toContain(join("corpus", "library", "linked", "linked.md"));
    expect(filesUnder(join(root, "corpus", "library")).length).toBe(3);
  });

  test("has a digest that is the same in another folder and changes when any input does", () => {
    const [one, two] = [tmp(), tmp()];
    put(one, REPO);
    put(two, REPO);
    const digest = publicInputsSha256(one);
    expect(publicInputsSha256(two)).toBe(digest);
    for (const name of Object.keys(REPO)) {
      const changed = tmp();
      put(changed, { ...REPO, [name]: "changed\n" });
      expect(publicInputsSha256(changed)).not.toBe(digest);
    }
    put(two, { "corpus/library/new.md": "n\n" });
    expect(publicInputsSha256(two)).not.toBe(digest);
  });
});

describe("readSeed", () => {
  test("is the text of private/seed, and null when there is none or it is empty", () => {
    const root = tmp();
    expect(readSeed(root)).toBeNull();
    put(root, { "private/seed": "12345678901234567890\n" });
    expect(readSeed(root)).toBe("12345678901234567890");
    put(root, { "private/seed": "\n" });
    expect(readSeed(root)).toBeNull();
  });
});

describe("rewriteSha256", () => {
  test("is one digest over the rewrite, its lexicon, generate and the file that lists what generate reads, read from this repository", () => {
    const root = resolve(import.meta.dir, "..", "..", "..");
    expect(REWRITE_CODE).toEqual([join("lib", "rewrite", "rewrite.ts"), join("lib", "rewrite", "lexicon.ts"), join("evals", "retrieval", "src", "generate.ts"), join("evals", "retrieval", "src", "inputs.ts")]);
    expect(rewriteSha256()).toMatch(/^[0-9a-f]{64}$/);
    expect(rewriteSha256()).toBe(inFolder(root, () => sha256Files(REWRITE_CODE)));
    expect(rewriteSha256()).toBe(rewriteSha256()); // the working folder is put back
  });
});

describe("what the digest of the generator covers (#44)", () => {
  const root = resolve(import.meta.dir, "..", "..", "..");

  /** The files a source file imports by a relative path, from the repository root with forward slashes. (lib/closure.ts cannot read a file that starts with a #! line, which both of these do.) */
  const importsOf = (file: string): string[] =>
    new Bun.Transpiler({ loader: "ts" })
      .scanImports(readFileSync(join(root, file), "utf8").replace(/^#!.*\n/, ""))
      .map((i) => i.path)
      .filter((p) => p.startsWith("."))
      .map((p) => join(dirname(file), p));

  test("every file of lib/rewrite that runs, and every file the rewrite imports, is in it", () => {
    const code = readdirSync(join(root, "lib", "rewrite")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join("lib", "rewrite", f)).sort();
    expect(code).toEqual([join("lib", "rewrite", "lexicon.ts"), join("lib", "rewrite", "rewrite.ts")]); // a new file here must be added to REWRITE_CODE and to this list
    for (const file of code) expect(REWRITE_CODE).toContain(file);
    // generate runs lib/rewrite/rewrite.ts as a command: what that imports is covered as well
    expect(importsOf(join("lib", "rewrite", "rewrite.ts"))).toEqual([join("lib", "rewrite", "lexicon.ts")]);
    expect(importsOf(join("lib", "rewrite", "lexicon.ts"))).toEqual([]);
  });

  test("generate.ts is in it, and what it imports besides the rewrite and inputs.ts only checks the result or reads the public files", () => {
    expect(REWRITE_CODE).toContain(join("evals", "retrieval", "src", "generate.ts"));
    const outside = importsOf(join("evals", "retrieval", "src", "generate.ts")).filter((f) => !REWRITE_CODE.includes(f)).sort();
    // akm.ts and lib/akm index the made library in a sandbox to check it, and lib.ts parses the public queries and qrels. A new import is a decision: does it change what generate writes?
    expect(outside).toEqual([join("evals", "retrieval", "src", "akm.ts"), join("evals", "retrieval", "src", "lib.ts"), join("lib", "akm", "akm.ts")]);
  });

  test("a change to any of the four files changes the digest", () => {
    const copy = tmp();
    for (const file of REWRITE_CODE) put(copy, { [file]: `// ${file}\n` });
    const digest = () => inFolder(copy, () => sha256Files(REWRITE_CODE));
    const before = digest();
    for (const file of REWRITE_CODE) {
      put(copy, { [file]: `// ${file}\n// edited\n` });
      expect(digest()).not.toBe(before);
      put(copy, { [file]: `// ${file}\n` });
      expect(digest()).toBe(before);
    }
  });

  test("assets whose stored digest is zeroed are refused, and freshly made ones pass, as the rewrite that --corpus custom reads", () => {
    const repo = tmp();
    put(repo, REPO);
    const dir = join(repo, "private", "retrieval");
    const assets = join(dir, "assets");
    put(assets, { "generated.json": JSON.stringify({ seed: "7", inputs_sha256: publicInputsSha256(repo), rewrite: rewriteSha256() }) });
    const [custom] = resolveCorpora({ eval: "retrieval", values: { corpus: "custom" }, publicFolder: join(repo, "evals", "retrieval", "assets"), root: repo });
    expect(custom).toMatchObject({ name: "custom", folder: assets, rewrite: true, seed: "7" });
    expect(staleAssets(custom.folder, repo, "private/retrieval/assets")).toBeUndefined();
    put(assets, { "generated.json": JSON.stringify({ seed: "7", inputs_sha256: publicInputsSha256(repo), rewrite: "0".repeat(64) }) });
    expect(staleAssets(custom.folder, repo, "private/retrieval/assets")).toBe(
      "the private assets in private/retrieval/assets/ were made by a rewrite that has changed since: lib/rewrite, its lexicon or the tools that generate pins. Make them again with: ./generate-assets --only retrieval",
    );
  });
});

describe("readGenerated and staleAssets", () => {
  const made = (inputs: string, rewrite = rewriteSha256()) => JSON.stringify({ seed: "7", inputs_sha256: inputs, rewrite });

  test("read generated.json when it is in the format, and nothing when it is not", () => {
    const assets = tmp();
    expect(readGenerated(assets)).toBeUndefined();
    put(assets, { "generated.json": made("abc", "def") });
    expect(readGenerated(assets)).toEqual({ seed: "7", inputs_sha256: "abc", rewrite: "def" });
    for (const bad of ["{oops", "[]", JSON.stringify({ seed: 7, inputs_sha256: "abc", rewrite: "x" }), JSON.stringify({ seed: "7" })]) {
      put(assets, { "generated.json": bad });
      expect(readGenerated(assets)).toBeUndefined();
    }
  });

  test("say to make the assets again when the file is missing or the inputs changed, and nothing when they match", () => {
    const root = tmp();
    put(root, REPO);
    const assets = join(root, "private", "retrieval", "assets");
    put(assets, { "queries.jsonl": "x\n" });
    expect(staleAssets(assets, root, "private/retrieval/assets")).toContain("have no generated.json");
    expect(staleAssets(assets, root, "private/retrieval/assets")).toEndWith("Make them again with: ./generate-assets --only retrieval");
    put(assets, { "generated.json": made(publicInputsSha256(root)) });
    expect(staleAssets(assets, root)).toBeUndefined();
    put(root, { "evals/retrieval/assets/qrels.jsonl": "r\nmore\n" });
    expect(staleAssets(assets, root, "private/retrieval/assets")).toContain("were made from public inputs that have changed since");
    expect(staleAssets(assets, root, "private/retrieval/assets")).toEndWith("./generate-assets --only retrieval");
  });

  test("refuse assets made by another rewrite, such as a changed lib/rewrite, lexicon or pin logic, or by a generate that wrote its name", () => {
    const root = tmp();
    put(root, REPO);
    const assets = join(root, "private", "retrieval", "assets");
    put(assets, { "generated.json": made(publicInputsSha256(root)) });
    expect(staleAssets(assets, root)).toBeUndefined();
    for (const other of ["0".repeat(64), "lib/rewrite"]) {
      put(assets, { "generated.json": made(publicInputsSha256(root), other) });
      expect(staleAssets(assets, root, "private/retrieval/assets")).toBe(
        "the private assets in private/retrieval/assets/ were made by a rewrite that has changed since: lib/rewrite, its lexicon or the tools that generate pins. Make them again with: ./generate-assets --only retrieval",
      );
    }
    // the inputs are checked first: assets made from other inputs by another rewrite say so about the inputs
    put(assets, { "generated.json": made("not-the-digest", "0".repeat(64)) });
    expect(staleAssets(assets, root)).toContain("were made from public inputs that have changed since");
  });
});
