import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox, engineConfig, removeSandbox, runAkmJson, semanticConfig, writeConfig } from "./akm.ts";
import { takeSemanticVerification, verifySemantic } from "./semantic.ts";

const dirs: string[] = [];
afterEach(() => {
  dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
  takeSemanticVerification();
});
const folder = () => { const dir = mkdtempSync(join(tmpdir(), "akm-semantic-proof-")); dirs.push(dir); return dir; };
const index = (embedded = 2) => JSON.stringify({ totalEntries: 2, verification: { embeddingCount: embedded } });

test("checks full embedding coverage before a semantic run proceeds", () => {
  const state = { lastEvent: 0 }, dir = folder();
  expect(verifySemantic(state, dir, "index", index())).toBeNull();
  expect(verifySemantic(state, dir, "index", index(1))).toContain("embedded 1 of 2");
  expect(takeSemanticVerification()).toMatchObject({ index_checks: 2, indexed_entries: 4, embedded_entries: 3, failures: 1 });
});

test("observes the eval's own search modes once without adding usage events", () => {
  const dir = folder(), state = { lastEvent: 0 };
  const db = new Database(join(dir, "state.db"));
  db.run("CREATE TABLE events (event_type TEXT, metadata_json TEXT)");
  const add = (mode: string | null) => db.run("INSERT INTO events VALUES ('search', ?)", [JSON.stringify(mode === null ? {} : { mode })]);
  try {
    add("semantic");
    expect(verifySemantic(state, dir, "improve", "{}")).toBeNull();
    expect(verifySemantic(state, dir, "proposal", "{}")).toBeNull();
    add("keyword"); add(null);
    expect(verifySemantic(state, dir, "improve", "{}")).toContain("keyword");
    expect(db.query("SELECT COUNT(*) AS n FROM events").get()).toEqual({ n: 3 });
    expect(takeSemanticVerification()).toMatchObject({ searches: { semantic: 1, non_semantic: 1, unknown: 1 }, failures: 2 });
  } finally { db.close(); }
});

test("zero searches is reported as zero, and the tally resets between runs", () => {
  expect(takeSemanticVerification()).toBeNull();
  verifySemantic({ lastEvent: 0 }, folder(), "index", index());
  expect(takeSemanticVerification()?.searches).toEqual({ semantic: 0, non_semantic: 0, unknown: 0 });
  expect(takeSemanticVerification()).toBeNull();
});

test("runAkmJson rejects an incomplete semantic index", async () => {
  const sandbox = createSandbox("semantic-reject");
  const script = join(folder(), "akm.ts");
  writeFileSync(script, `console.log(${JSON.stringify(index(1))})`);
  sandbox.cmd = ["bun", script];
  writeConfig(sandbox, { ...engineConfig("https://example.invalid/v1", "test", false), ...semanticConfig() });
  try { await expect(runAkmJson(sandbox, ["index"])).rejects.toThrow("incomplete semantic index"); }
  finally { removeSandbox(sandbox); }
});

test("reindexing does not count an earlier search twice", () => {
  const dir = folder(), state = { lastEvent: 0 };
  const db = new Database(join(dir, "state.db"));
  try {
    db.run("CREATE TABLE events (event_type TEXT, metadata_json TEXT)");
    db.run("INSERT INTO events VALUES ('search', '{\"mode\":\"semantic\"}')");
    verifySemantic(state, dir, "improve", "{}");
    verifySemantic(state, dir, "index", index());
    verifySemantic(state, dir, "proposal", "{}");
    expect(takeSemanticVerification()?.searches.semantic).toBe(1);
  } finally { db.close(); }
});

test("unavailable event telemetry is visible without claiming semantic searches", () => {
  const dir = folder(), db = new Database(join(dir, "state.db"));
  db.close();
  expect(verifySemantic({ lastEvent: 0 }, dir, "improve", "{}")).toBeNull();
  expect(takeSemanticVerification()).toMatchObject({ telemetry_errors: 1, searches: { semantic: 0, non_semantic: 0, unknown: 0 } });
});
