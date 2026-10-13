import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { takeModelCalls, tallyCalls } from "./usage.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  takeModelCalls();
});

/** A data folder whose state.db holds these events, as akm writes them. */
function dataDir(events: [string, Record<string, unknown>][]): { dir: string; add: (events: [string, Record<string, unknown>][]) => void } {
  const dir = mkdtempSync(join(tmpdir(), "akm-usage-"));
  dirs.push(dir);
  const db = new Database(join(dir, "state.db"));
  db.run("CREATE TABLE events (id INTEGER PRIMARY KEY, event_type TEXT, metadata_json TEXT)");
  const add = (more: [string, Record<string, unknown>][]) => {
    for (const [type, m] of more) db.run("INSERT INTO events (event_type, metadata_json) VALUES (?, ?)", [type, JSON.stringify(m)]);
  };
  add(events);
  return { dir, add };
}

const ok = (promptTokens: number, completionTokens: number, durationMs: number) => ["llm_usage", { outcome: "success", promptTokens, completionTokens, durationMs }] as [string, Record<string, unknown>];

describe("model calls", () => {
  test("are the mean tokens and seconds of the calls that succeeded, with the failed ones counted apart", () => {
    const { dir } = dataDir([ok(1000, 100, 2000), ok(3000, 300, 4000), ["llm_usage", { outcome: "error", durationMs: 120000, errorCode: "timeout" }], ["proposal_created", {}]]);
    tallyCalls(dir);
    expect(takeModelCalls()).toEqual({ calls: 3, errors: 1, prompt_tokens: 2000, completion_tokens: 200, seconds: 3, output_tokens_per_second: 66.7 });
    expect(takeModelCalls()).toBeNull(); // taken once
  });

  test("a sandbox read again adds only the calls made since, so one that outlives a run is counted once", () => {
    const { dir, add } = dataDir([ok(10, 5, 1000)]);
    tallyCalls(dir);
    tallyCalls(dir);
    expect(takeModelCalls()).toMatchObject({ calls: 1 });
    add([ok(20, 10, 1000)]);
    tallyCalls(dir);
    expect(takeModelCalls()).toMatchObject({ calls: 1, prompt_tokens: 20 });
  });

  test("a provider that reports no tokens leaves the token figures null, and no state.db or no calls is null", () => {
    const { dir } = dataDir([["llm_usage", { outcome: "success", durationMs: 500 }]]);
    tallyCalls(dir);
    expect(takeModelCalls()).toEqual({ calls: 1, errors: 0, prompt_tokens: null, completion_tokens: null, seconds: 0.5, output_tokens_per_second: null });
    tallyCalls(join(dir, "nowhere"));
    tallyCalls(undefined);
    expect(takeModelCalls()).toBeNull();
  });
});
