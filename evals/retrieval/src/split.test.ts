import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox, removeSandbox } from "../../../lib/akm/akm.ts";
import * as akm from "./akm.ts";
import { filesUnder } from "./inputs.ts";
import { parseMetadata, parseQrels, parseQueries } from "./lib.ts";
import { generateSplit, readConfig } from "./split.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const ASSETS = join(ROOT, "evals", "retrieval", "assets");
const LIBRARY = join(ROOT, "corpus", "library");
/** The digest of the split corpus. It changes with split.json, the public library and the public queries and qrels: update it when one of them is changed on purpose. */
const DIGEST = "b518f1e0575767e2bc322ecca5c531bbdff0919786b7101dc2f4c080929d40af";

const dirs: string[] = [];
const made = (): string => {
  const d = mkdtempSync(join(tmpdir(), "split-"));
  dirs.push(d);
  return join(d, "out");
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const config = readConfig(join(ASSETS, "selection-split"));
const out = made();
const split = generateSplit({ library: LIBRARY, assets: ASSETS, config, out });

describe("the split corpus", () => {
  test("is written from split.json at run time, and its digest is pinned", () => {
    expect(split.digest).toBe(DIGEST);
    expect(generateSplit({ library: LIBRARY, assets: ASSETS, config, out }).digest).toBe(DIGEST);
  });

  test("refuses to replace a folder it did not make", () => {
    const other = made();
    mkdirSync(other, { recursive: true });
    expect(() => generateSplit({ library: LIBRARY, assets: ASSETS, config, out: other })).toThrow("not made by");
  });

  test("tags the team files that have frontmatter, a project and the conflicting general assets", () => {
    expect(split.tagged).toEqual({ team: 38, project: 18, conflict: 6 });
    const meta = parseMetadata(readFileSync(join(out, "metadata.jsonl"), "utf8"));
    expect(Object.keys(meta)).toHaveLength(38 + 6);
    expect(Object.values(meta).filter((k) => k.channel === "publishing" || k.channel === "qa")).toHaveLength(38);
    expect(Object.entries(meta).filter(([, k]) => k.channel === "platform").every(([ref]) => ref.startsWith("general//skills/ai-skills/"))).toBe(true);
    const tagged = readFileSync(join(out, "library", "team", "skills", "print", "pagedjs", "SKILL.md"), "utf8");
    expect(tagged.startsWith("---\nscope_channel: publishing\n")).toBe(true);
  });

  test("writes each judged task query once for each selection, with the refs of its bundle", () => {
    const queries = parseQueries(readFileSync(join(out, "queries.jsonl"), "utf8"));
    const qrels = parseQrels(readFileSync(join(out, "qrels.jsonl"), "utf8"));
    expect(queries).toHaveLength(101 * 5);
    expect(queries.filter((q) => q.kind === "none").every((q) => q.selection === undefined)).toBe(true);
    expect(queries.find((q) => q.id === "q001@absent")).toMatchObject({ selection: { channel: config.absent }, same_as: "q001@none" });
    expect(queries.find((q) => q.id === "q001@both")?.selection).toEqual({ channel: ["publishing", "qa"] });
    expect(qrels.every((r) => /^(team|general)\/\//.test(r.ref))).toBe(true);
    expect(qrels.find((r) => r.ref === "team//skills/print/pagedjs")).toBeDefined();
  });

  test("every graded ref that has a file is in the bundle its file is in", () => {
    for (const r of parseQrels(readFileSync(join(out, "qrels.jsonl"), "utf8"))) {
      const [bundle, ref] = r.ref.split("//") as [string, string];
      const file = ref.startsWith("knowledge/skills/") ? ref.slice("knowledge/".length) : ref;
      for (const path of [`${file}.md`, `${file}/SKILL.md`, file]) if (existsSync(join(out, "library", bundle === "team" ? "general" : "team", path))) throw new Error(`${r.ref} is in the other bundle`);
    }
  });
});

// Tagging must change nothing a ranker scores: the keys are not ranked text. Needs a real akm: AKM_EVAL_REAL_AKM=1 and AKM_BIN.
describe.skipIf(process.env.AKM_EVAL_REAL_AKM !== "1")("the split against a real akm", () => {
  test("the lists of the queries without a selection are the same with the tags and without them", async () => {
    const untagged = made();
    cpSync(out, untagged, { recursive: true });
    for (const file of filesUnder(join(untagged, "library"))) {
      const text = readFileSync(file, "utf8");
      const bare = text.replace(/^---\n(?:scope_(?:channel|agent): .*\n)+/, "---\n");
      if (bare !== text) writeFileSync(file, bare);
    }
    const tagged = await listsOf(out);
    // Two failed or empty calls would compare equal: every call must succeed and most return something.
    expect(Object.values(tagged).filter((refs) => refs.length > 0).length).toBeGreaterThan(Object.keys(tagged).length * 0.9);
    expect(await listsOf(untagged)).toEqual(tagged);
  }, 900_000);
});

async function listsOf(root: string): Promise<Record<string, string[]>> {
  const sb = createSandbox("split-test", { isolateHome: true });
  try {
    await akm.load(sb, join(root, "library"), join(root, "bundles.json"));
    const lists: Record<string, string[]> = {};
    for (const q of parseQueries(readFileSync(join(root, "queries.jsonl"), "utf8")).filter((x) => x.kind === "none")) {
      for (const command of ["search", "curate"] as const) {
        const answer = await akm.ask(sb, command, q.query, 10);
        if (answer.error) throw new Error(`${q.id} ${command}: ${answer.error}`);
        lists[`${q.id} ${command}`] = answer.refs;
      }
    }
    return lists;
  } finally {
    removeSandbox(sb);
  }
}

describe("the hand-built selection set", () => {
  const dir = join(ASSETS, "selection");
  const queries = parseQueries(readFileSync(join(dir, "queries.jsonl"), "utf8"));
  const qrels = parseQrels(readFileSync(join(dir, "qrels.jsonl"), "utf8"));
  const meta = parseMetadata(readFileSync(join(dir, "metadata.jsonl"), "utf8"));
  const counts = Object.fromEntries([...new Set(queries.map((q) => q.kind))].map((k) => [k, queries.filter((q) => q.kind === k).length]));

  test("has the kinds of cases its README lists", () => {
    expect(counts).toEqual({ "team-first": 4, "general-only": 3, partial: 3, "missing-vs-conflict": 2, "multi-value": 2, control: 1, "no-match": 2, duplicate: 1, "untagged-team": 1, leak: 1 });
    expect(queries.filter((q) => q.same_as).every((q) => q.same_as === "s13")).toBe(true);
    expect(queries.some((q) => Array.isArray(q.selection?.channel))).toBe(true);
  });

  test("grades every note for every task query, and has no grades for the leak query", () => {
    const notes = new Set(qrels.map((r) => r.ref));
    expect(qrels.filter((r) => r.id === "s18")).toHaveLength(0);
    for (const q of queries.filter((x) => x.kind !== "leak")) expect(qrels.filter((r) => r.id === q.id)).toHaveLength(notes.size);
  });

  test("lists metadata only for notes that exist, and its keys are in their frontmatter", () => {
    for (const [ref, keys] of Object.entries(meta)) {
      const [bundle, rest] = ref.split("//") as [string, string];
      const file = join(dir, "library", bundle, `${rest}.md`);
      const text = readFileSync(file, "utf8");
      for (const [k, v] of Object.entries(keys)) expect(text).toContain(`scope_${k}: ${v}\n`);
    }
  });

  test("the codename of the leak query is in no text, only in metadata", () => {
    const hits = [...new Bun.Glob("**/*").scanSync({ cwd: join(dir, "library"), onlyFiles: true })].filter((f) => !/scope_agent: orchidfalcon/.test(readFileSync(join(dir, "library", f), "utf8")) && readFileSync(join(dir, "library", f), "utf8").includes("orchidfalcon"));
    expect(hits).toEqual([]);
  });
});
