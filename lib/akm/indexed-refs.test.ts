import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSandbox, removeSandbox, runAkmJson, type Sandbox } from "./akm.ts";
import { indexedRef, indexedRefs } from "./indexed-refs.ts";

const sandboxes: Sandbox[] = [];
afterEach(() => { for (const sandbox of sandboxes.splice(0)) removeSandbox(sandbox); });
function setup(rows: [string, string][]) {
  const sandbox = createSandbox("indexed-refs-test");
  sandboxes.push(sandbox);
  const db = new Database(join(sandbox.env.AKM_DATA_DIR as string, "index.db"));
  db.exec("CREATE TABLE entries (file_path TEXT, concept_id TEXT)");
  for (const [path, ref] of rows) db.query("INSERT INTO entries VALUES (?, ?)").run(join(sandbox.dir, "bundle", path), ref);
  db.close();
  return sandbox;
}

describe("indexed file refs", () => {
  test("uses the indexed agent identity, ignores outside files and fragments, and records no usage", () => {
    const sandbox = setup([["knowledge/nested/community.md", "agents/knowledge/nested/community"], ["skills/x/SKILL.md", "skills/x"], ["skills/x/SKILL.md", "skills/x#example"], ["../other.md", "knowledge/other"]]);
    const refs = indexedRefs(sandbox);
    expect([...refs]).toEqual([["knowledge/nested/community.md", "agents/knowledge/nested/community"], ["skills/x/SKILL.md", "skills/x"]]);
    expect(indexedRef(refs, "knowledge/nested/community.md")).toBe("agents/knowledge/nested/community");
    expect(existsSync(join(sandbox.env.AKM_DATA_DIR as string, "state.db"))).toBe(false);
    expect(() => indexedRef(refs, "knowledge/missing.md")).toThrow("did not index the planted file");
  });
  test("refuses ambiguous file identities", () => {
    const sandbox = setup([["knowledge/x.md", "knowledge/x"], ["knowledge/x.md", "agents/knowledge/x"]]);
    expect(() => indexedRefs(sandbox)).toThrow("multiple refs");
  });
  test("a changed index schema cannot silently fall back to path-derived refs", () => {
    const sandbox = setup([]);
    const db = new Database(join(sandbox.env.AKM_DATA_DIR as string, "index.db"));
    db.exec("DROP TABLE entries; CREATE TABLE entries (file_path TEXT)");
    db.close();
    expect(() => indexedRefs(sandbox)).toThrow("concept_id");
  });
});

test.skipIf(process.env.AKM_EVAL_REAL_AKM !== "1")("real AKM indexes the nested agent and accepts feedback on the resolved ref", async () => {
  const sandbox = createSandbox("indexed-refs-real");
  sandboxes.push(sandbox);
  const path = "knowledge/skills/ai-skills/llm-delegation-tool/examples/agents/community-manager.md";
  const source = readFileSync(join(import.meta.dir, "../../evals/nightly/assets/library", path), "utf8");
  mkdirSync(dirname(join(sandbox.dir, "bundle", path)), { recursive: true });
  writeFileSync(join(sandbox.dir, "bundle", path), source);
  await runAkmJson(sandbox, ["index"]);
  const ref = indexedRef(indexedRefs(sandbox), path);
  expect(ref).toBe(`agents/${path.replace(/\.md$/, "")}`);
  await runAkmJson(sandbox, ["feedback", ref, "--negative", "--reason", "The planted title is missing."]);
});
