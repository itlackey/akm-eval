import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { ResolvedCorpus } from "../../../lib/corpus.ts";
import { type Case, parseCases, refOf } from "./lib.ts";
import { retrievalSearches } from "./queries.ts";

const EVAL = join(import.meta.dir, "..");
const REPO = join(EVAL, "..", "..");
const PUBLIC: Case[] = parseCases(readFileSync(join(EVAL, "assets", "cases.jsonl"), "utf8"));

const dirs: string[] = [];
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "reflect queries "));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const publicCorpus: ResolvedCorpus = { name: "public", folder: join(EVAL, "assets"), rewrite: false, seed: null, flag: "--corpus public" };
const customCorpus = (folder: string, kind: "rewrite" | "own" = "rewrite"): ResolvedCorpus => ({ name: "custom", folder, rewrite: kind === "rewrite", seed: kind === "rewrite" ? "7" : null, flag: "--corpus custom" });
const messageOf = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return (e as Error).message;
  }
  return "did not throw";
};

/** The seeded rewrite of the public cases, made by generate once for the tests that need it, outside the repository. */
let made: string | undefined;
function rewrite(): string {
  if (made === undefined) {
    const out = temp();
    const run = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts"), "--seed", "7", "--out", out], { stdout: "pipe", stderr: "pipe" });
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);
    made = out;
  }
  return made;
}
const privateCases = (): Case[] => parseCases(readFileSync(join(rewrite(), "assets", "cases.jsonl"), "utf8"));

describe("retrievalSearches", () => {
  test("the public corpus gets the labelled queries of 49 of its 50 notes, as the retrieval eval labels them", () => {
    const searches = retrievalSearches(publicCorpus, REPO);
    const withQueries = PUBLIC.filter((c) => searches.has(refOf(c.path)));
    expect(PUBLIC).toHaveLength(50);
    expect(withQueries).toHaveLength(49); // q018 now labels three previously ungraded notes
    expect(PUBLIC.filter((c) => !searches.has(refOf(c.path))).map((c) => c.id).sort()).toEqual(["historical-02"]);
    expect(searches.get("skills/akm-migrate")).toEqual(["upgrade akm-cli across several 0.9 releases safely"]);
    for (const queries of searches.values()) expect(queries.length).toBeLessThanOrEqual(5);
  });

  test("a rewrite gets queries for the same cases as the public corpus, matched by public ref, with the words its own map renamed (#60)", () => {
    const folder = join(rewrite(), "assets");
    const searches = retrievalSearches(customCorpus(folder), REPO); // no private/retrieval in the repository: the retrieval eval's private assets are not read
    const pub = retrievalSearches(publicCorpus, REPO);
    const ids = (cases: Case[], s: Map<string, string[]>) => cases.filter((c) => s.has(refOf(c.path))).map((c) => c.id);
    expect(ids(privateCases(), searches)).toEqual(ids(PUBLIC, pub));
    expect(ids(privateCases(), searches)).toHaveLength(49);
    // the notes are renamed (akm becomes another word, and so does a tool name in a path), and so are the queries
    const was = PUBLIC.find((c) => c.id === "historical-01") as Case;
    const now = privateCases().find((c) => c.id === "historical-01") as Case;
    expect(refOf(now.path)).not.toBe(refOf(was.path));
    const renamed = (searches.get(refOf(now.path)) ?? [])[0] ?? "";
    const map = JSON.parse(readFileSync(join(rewrite(), "map.json"), "utf8")) as { words: Record<string, string> };
    expect(renamed).toBe(`upgrade ${map.words.akm}-cli across several 0.9 releases safely`);
    expect(renamed).not.toContain("akm");
    expect(now.source).toContain(`${map.words.akm}-`); // the note names the same word
    // no private query names a tool that the private note renamed
    const playwright = privateCases().find((c) => c.id === "retrieval-miss-01") as Case;
    expect(refOf(playwright.path)).toContain(map.words.playwright as string);
    expect((searches.get(refOf(playwright.path)) ?? []).join(" ")).not.toMatch(/playwright/i);
  }, 60_000);

  test("does not change the map it reads", () => {
    const file = join(rewrite(), "map.json");
    const before = readFileSync(file, "utf8");
    retrievalSearches(customCorpus(join(rewrite(), "assets")), REPO);
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  test("a missing map stops it with the instruction to make the assets again, and so does one that is not a rewrite map", () => {
    const out = temp();
    mkdirSync(join(out, "assets"));
    cpSync(join(rewrite(), "assets", "cases.jsonl"), join(out, "assets", "cases.jsonl"));
    expect(messageOf(() => retrievalSearches(customCorpus(join(out, "assets")), REPO))).toBe(
      `--retrieval-queries maps the queries through the rewrite map that generate writes beside the assets, and ${relative(REPO, join(out, "map.json"))} is missing. Make the private assets again with: ./generate-assets --only reflect`,
    );
    writeFileSync(join(out, "map.json"), "{ not json");
    expect(messageOf(() => retrievalSearches(customCorpus(join(out, "assets")), REPO))).toContain("which is not a rewrite map");
    writeFileSync(join(out, "map.json"), JSON.stringify({ words: {} }));
    expect(messageOf(() => retrievalSearches(customCorpus(join(out, "assets")), REPO))).toContain("it holds no seed");
    expect(messageOf(() => retrievalSearches(customCorpus(join(out, "assets")), REPO))).toContain("Make the private assets again with: ./generate-assets --only reflect");
  });

  test("a missing file of the retrieval eval, or an own corpus, stops it with a message that says what", () => {
    const root = temp();
    mkdirSync(join(root, "evals", "reflect"), { recursive: true });
    cpSync(join(EVAL, "assets"), join(root, "evals", "reflect", "assets"), { recursive: true });
    expect(messageOf(() => retrievalSearches(publicCorpus, root))).toBe("--retrieval-queries reads the retrieval eval's labelled queries, and evals/retrieval/assets/queries.jsonl is missing");
    expect(messageOf(() => retrievalSearches(customCorpus(temp(), "own"), REPO))).toContain("--retrieval-queries does not apply to --corpus custom");
  });
});
