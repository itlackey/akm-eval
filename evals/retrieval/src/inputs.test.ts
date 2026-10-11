import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";
import { REWRITE_CODE, filesSha256, filesUnder, inFolder, publicInputs, publicInputsSha256, readGenerated, readSeed, rewriteSha256, staleAssets } from "./inputs.ts";

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

describe("filesSha256", () => {
  test("is the same for the same files in another folder, and changes with a file's name or content", () => {
    const [a, b] = [tmp(), tmp()];
    for (const dir of [a, b]) put(dir, { "queries.jsonl": "q\n", "qrels.jsonl": "r\n" });
    const files = (dir: string) => [join(dir, "queries.jsonl"), join(dir, "qrels.jsonl")];
    const first = filesSha256(a, files(a));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(filesSha256(b, files(b))).toBe(first);
    expect(filesSha256(a, [...files(a)].reverse())).toBe(first); // in the order of the paths, not of the list
    writeFileSync(join(b, "qrels.jsonl"), "r2\n");
    expect(filesSha256(b, files(b))).not.toBe(first);
    expect(filesSha256(a, [files(a)[0]])).not.toBe(first);
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
  test("is one digest over the rewrite, its lexicon and generate, read from this repository", () => {
    const root = resolve(import.meta.dir, "..", "..", "..");
    expect(REWRITE_CODE).toEqual([join("lib", "rewrite", "rewrite.ts"), join("lib", "rewrite", "lexicon.ts"), join("evals", "retrieval", "src", "generate.ts")]);
    expect(rewriteSha256()).toMatch(/^[0-9a-f]{64}$/);
    expect(rewriteSha256()).toBe(inFolder(root, () => sha256Files(REWRITE_CODE)));
    expect(rewriteSha256()).toBe(rewriteSha256()); // the working folder is put back
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
