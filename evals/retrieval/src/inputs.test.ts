import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type AssetsDigests, assetsDigests, assetsSha256, filesUnder, manifestSha256, readSeed } from "./inputs.ts";

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

describe("filesUnder", () => {
  test("follows a link to a folder, as a copy of the library does", () => {
    const root = tmp();
    const elsewhere = tmp();
    put(elsewhere, { "linked.md": "x\n" });
    put(root, { "corpus/library/b.md": "b\n", "corpus/library/skills/a.md": "a\n" });
    symlinkSync(elsewhere, join(root, "corpus", "library", "linked"));
    expect(filesUnder(join(root, "corpus", "library")).length).toBe(3);
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
