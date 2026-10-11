import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, firstHalf, insertAfterTitle, render } from "./build.ts";
import { Database } from "bun:sqlite";
import { type Case, EVENT_COLUMNS, PROPOSAL_COLUMNS, type Row, assetsSha256, corpusSeed, digestOf, dispatchFailures, hideEndpoint, metrics, parseCases, promotionConfig, proposalRow, readSeed, rowsFromDrain, schemaProblem, selectCases, timedOutText, uuidOf } from "./lib.ts";

const EVAL_DIR = join(import.meta.dir, "..");
const LIBRARY = join(EVAL_DIR, "..", "..", "corpus", "library", "knowledge");

const make = (id: string, category: Case["category"], extra: Partial<Case> = {}): Case => ({ id, label: category === "good" ? "good" : "bad", category, ref: `knowledge/${id}`, content: `---\ndescription: ${id}\n---\n\nbody of ${id}\n`, ...extra });

describe("parseCases", () => {
  test("reads JSONL, and refuses a bad label, category, ref or repeated id", () => {
    const line = JSON.stringify(make("a", "good"));
    expect(parseCases(`${line}\n\n`)).toHaveLength(1);
    expect(() => parseCases(JSON.stringify({ ...make("a", "good"), label: "maybe" }))).toThrow('label "maybe"');
    expect(() => parseCases(JSON.stringify({ ...make("a", "good"), category: "duplicate" }))).toThrow('category "duplicate" for a good case');
    expect(() => parseCases(JSON.stringify({ ...make("a", "duplicate"), category: "good" }))).toThrow('category "good" for a bad case');
    expect(() => parseCases(JSON.stringify({ ...make("a", "good"), ref: "memories/a" }))).toThrow("expected knowledge/<name>");
    expect(() => parseCases(`${line}\n${JSON.stringify({ ...make("b", "stale"), id: "a" })}`)).toThrow('repeats "a"');
    expect(() => parseCases("not json")).toThrow("not valid JSON");
    expect(() => parseCases("\n")).toThrow("no cases");
  });
});

describe("selectCases", () => {
  const cases = [...["g1", "g2"].map((i) => make(i, "good")), ...["d1", "d2", "d3"].map((i) => make(i, "duplicate")), ...["s1", "s2"].map((i) => make(i, "stale")), make("e1", "ephemeral")];

  test("takes one of each category in turn, and keeps file order", () => {
    expect(selectCases(cases, 4).map((c) => c.id)).toEqual(["g1", "d1", "s1", "e1"]);
    expect(selectCases(cases, 6).map((c) => c.id)).toEqual(["g1", "g2", "d1", "d2", "s1", "e1"]);
  });

  test("returns every case with no limit or a large one", () => {
    expect(selectCases(cases)).toBe(cases);
    expect(selectCases(cases, 100)).toBe(cases);
  });
});

describe("the planted proposal", () => {
  test("has an id made from the case id, the same every time, in the shape of a UUID", () => {
    expect(uuidOf("a")).toBe(uuidOf("a"));
    expect(uuidOf("a")).not.toBe(uuidOf("b"));
    expect(uuidOf("duplicate-01")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("is a pending promotion of consolidate that creates the note in the bundle", () => {
    const [id, stash, ref, status, source, , , content, frontmatter, meta] = proposalRow(make("a", "good"), "/tmp/x/bundle", "2026-10-07T00:00:00Z");
    expect({ id, stash, ref, status, source, content, frontmatter }).toEqual({ id: uuidOf("a"), stash: "/tmp/x/bundle", ref: "bundle//knowledge/a", status: "pending", source: "consolidate", content: make("a", "good").content, frontmatter: null });
    expect(JSON.parse(meta as string)).toMatchObject({ changes: [{ path: "knowledge/a.md", op: "create" }], proposedTarget: { source: "bundle", root: "/tmp/x/bundle" }, promotionSource: "memories/a" });
  });
});

const temps: string[] = [];
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("promotionConfig", () => {
  test("names the model as the one engine and turns triage's judgment on, in queue mode", () => {
    const config = promotionConfig("http://localhost:8080/v1/", "m", true);
    expect(config.engines.judge).toMatchObject({ kind: "llm", model: "m", endpoint: "http://localhost:8080/v1/chat/completions", apiKey: "$MODEL_API_KEY" });
    expect(config).toMatchObject({ semanticSearchMode: "auto", embedding: { localModel: "Xenova/bge-small-en-v1.5" } });
    expect(config.improve.strategies.promotion).toEqual({ engine: "judge", processes: { triage: { enabled: true, applyMode: "queue", judgment: { enabled: true } } } });
  });

  test("sets the engine to temperature 0 with thinking off, as distill does", () => {
    const engine = promotionConfig("http://localhost:8080/v1", "m", false).engines.judge;
    expect(engine.temperature).toBe(0);
    expect(engine.enableThinking).toBe(false);
  });
});

describe("akm's tables", () => {
  const proposals = "CREATE TABLE proposals (id TEXT PRIMARY KEY, stash_dir TEXT NOT NULL, ref TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', source TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', frontmatter_json TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')";
  const events = "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_type TEXT NOT NULL, ts TEXT NOT NULL, ref TEXT, metadata_json TEXT NOT NULL DEFAULT '{}')";
  const memory = (...ddl: string[]) => {
    const db = new Database(":memory:");
    for (const d of ddl) db.run(d);
    return db;
  };

  test("the columns the eval writes are the ten that a planted proposal has values for, and akm's table takes them", () => {
    const row = proposalRow(make("a", "good"), "/tmp/x/bundle", "2026-10-07T00:00:00Z");
    expect(PROPOSAL_COLUMNS).toHaveLength(10);
    expect(row).toHaveLength(PROPOSAL_COLUMNS.length);
    const db = memory(proposals);
    db.prepare(`INSERT INTO proposals (${PROPOSAL_COLUMNS.join(", ")}) VALUES (${PROPOSAL_COLUMNS.map(() => "?").join(", ")})`).run(...row);
    expect(db.query("SELECT id, ref, source FROM proposals").get()).toEqual({ id: uuidOf("a"), ref: "bundle//knowledge/a", source: "consolidate" });
  });

  test("a table that has every column it needs is fine, whatever else it has", () => {
    expect(schemaProblem(memory(proposals), "proposals", PROPOSAL_COLUMNS)).toBeUndefined();
    expect(schemaProblem(memory(proposals.replace("frontmatter_json TEXT,", "frontmatter_json TEXT, extra TEXT,")), "proposals", PROPOSAL_COLUMNS)).toBeUndefined();
    expect(schemaProblem(memory(events), "events", EVENT_COLUMNS)).toBeUndefined();
  });

  test("names the columns that a table has lost or renamed", () => {
    expect(schemaProblem(memory(proposals.replace("stash_dir", "stash")), "proposals", PROPOSAL_COLUMNS)).toBe("akm's proposals table has no column stash_dir (it has id, stash, ref, status, source, created_at, updated_at, content, frontmatter_json, metadata_json)");
    const two = memory(proposals.replace(" frontmatter_json TEXT,", "").replace("content TEXT NOT NULL DEFAULT '', ", ""));
    expect(schemaProblem(two, "proposals", PROPOSAL_COLUMNS)).toContain("has no column content, frontmatter_json (");
    expect(schemaProblem(memory(events.replace("event_type", "kind")), "events", EVENT_COLUMNS)).toContain("has no column event_type (");
  });

  test("names a table that is not there", () => {
    expect(schemaProblem(memory(), "proposals", PROPOSAL_COLUMNS)).toBe("akm's state.db has no proposals table");
    expect(schemaProblem(memory(events), "proposals", PROPOSAL_COLUMNS)).toBe("akm's state.db has no proposals table");
  });
});

describe("timeouts", () => {
  test("a failure that says the call timed out is told from one that does not", () => {
    for (const text of ["timed out", "LLM request timed out after 600000ms", "The operation timed out.", "request timeout", "Timeout of 60000ms exceeded", "time-out"]) expect(timedOutText(text)).toBe(true);
    for (const text of ["LLM request failed: refused", "HTTP 500", "boom", "timeouts are fine"]) expect(timedOutText(text)).toBe(text === "timeouts are fine");
  });

  test("a row for a call that timed out says so, and no other row does", () => {
    const cases = [make("slow", "duplicate"), make("down", "duplicate")];
    const rows = rowsFromDrain(cases, {}, new Map(), new Map([[uuidOf("slow"), "LLM request timed out after 600000ms"], [uuidOf("down"), "LLM request failed: refused"]]));
    expect(rows[0]).toMatchObject({ outcome: "error", timed_out: true });
    expect(rows[1].outcome).toBe("error");
    expect("timed_out" in rows[1]).toBe(false);
  });
});

describe("what a run read", () => {
  const folder = (notes: Record<string, string>, cases = "{}\n") => {
    const dir = mkdtempSync(join(tmpdir(), "promotion-digest-"));
    temps.push(dir);
    writeFileSync(join(dir, "cases.jsonl"), cases);
    for (const [name, text] of Object.entries(notes)) {
      mkdirSync(join(dir, "library", "knowledge", name, ".."), { recursive: true });
      writeFileSync(join(dir, "library", "knowledge", name), text);
    }
    return { cases: join(dir, "cases.jsonl"), library: join(dir, "library"), dir };
  };
  const digest = (f: { cases: string; library: string }) => assetsSha256(f.cases, f.library);

  test("the digest is the same for the same files in another folder, and changes with a case, a note, a new note and a renamed note", () => {
    const base = digest(folder({ "a.md": "one", "sub/b.md": "two" }));
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(digest(folder({ "a.md": "one", "sub/b.md": "two" }))).toBe(base);
    expect(digest(folder({ "a.md": "one", "sub/b.md": "changed" }))).not.toBe(base);
    expect(digest(folder({ "a.md": "one", "sub/b.md": "two", "c.md": "three" }))).not.toBe(base);
    expect(digest(folder({ "a.md": "one", "sub/renamed.md": "two" }))).not.toBe(base);
    expect(digest(folder({ "a.md": "one", "sub/b.md": "two" }, "{\"id\":\"x\"}\n"))).not.toBe(base);
  });

  test("the public assets have a digest", () => {
    expect(assetsSha256(join(EVAL_DIR, "assets", "cases.jsonl"), join(EVAL_DIR, "..", "..", "corpus", "library"))).toMatch(/^[0-9a-f]{64}$/);
  });

  test("digestOf names files by the name it is given and not by where they are", () => {
    const f = folder({ "a.md": "one" });
    expect(digestOf([["a", f.cases]])).not.toBe(digestOf([["b", f.cases]]));
    expect(digestOf([["a", f.cases], ["b", join(f.library, "knowledge", "a.md")]])).toBe(digestOf([["b", join(f.library, "knowledge", "a.md")], ["a", f.cases]]));
  });

  test("the seed to record: none for the public corpus, private/seed for an own one when there is a file", () => {
    const f = folder({});
    writeFileSync(join(f.dir, "seed"), "123456789012345678\n");
    expect(corpusSeed("public", join(f.dir, "seed"))).toBeNull();
    expect(corpusSeed("own", join(f.dir, "seed"))).toBe("123456789012345678");
    expect(corpusSeed("own", join(f.dir, "no-seed"))).toBeNull();
    expect(readSeed(join(f.dir, "seed"))).toBe("123456789012345678");
  });
});

describe("rowsFromDrain", () => {
  const cases = ["accept", "promote", "reject", "defer", "fail", "stderr", "lost"].map((i) => make(i, "duplicate"));
  const id = (name: string) => uuidOf(name);
  const drained = {
    staged: [id("accept")],
    promoted: [id("promote")],
    rejected: [id("reject")],
    deferred: [{ id: id("defer") }, { id: id("stderr") }],
    failed: [{ id: id("fail"), reason: "promote-error", detail: "boom" }],
  };
  const rows = rowsFromDrain(cases, drained, new Map([[id("reject"), "a duplicate"]]), new Map([[id("stderr"), "timed out"]]));

  test("reads a staged or promoted proposal as accepted, a rejection with its reason, and a deferral as left for a person", () => {
    expect(rows.map((r) => r.outcome)).toEqual(["accept", "accept", "reject", "defer", "error", "error", "error"]);
    expect(rows[2].reason).toBe("a duplicate");
  });

  test("makes an error of a failed drain, a failed model call and a proposal the drain did not list", () => {
    expect(rows[4].error).toBe("boom");
    expect(rows[5].error).toBe("timed out");
    expect(rows[6].error).toBe("the drain did not list the proposal");
  });

  test("reads the failed judgment calls from stderr", () => {
    const stderr = `[triage] auto-promote active\n[triage] judgment dispatch failed for ${id("a")}: LLM request failed: http://x/v1 refused\nother\n`;
    expect(dispatchFailures(stderr)).toEqual(new Map([[id("a"), "LLM request failed: http://x/v1 refused"]]));
  });
});

describe("metrics", () => {
  const row = (label: "good" | "bad", category: Row["category"], outcome: Row["outcome"]): Row => ({ id: "x", label, category, ref: "knowledge/x", outcome, reason: "" });
  const rows = [
    row("good", "good", "accept"),
    row("good", "good", "defer"),
    row("good", "good", "reject"),
    row("bad", "duplicate", "accept"),
    row("bad", "duplicate", "reject"),
    row("bad", "stale", "accept"),
    row("bad", "stale", "defer"),
    row("bad", "ephemeral", "reject"),
    row("bad", "ephemeral", "error"),
  ];

  test("counts what the judge accepted, and which of it was good", () => {
    const m = metrics(rows);
    expect(m.proposals).toEqual({ n: 8, good: 3, share_good: 0.375 });
    expect(m.accepted).toEqual({ n: 3, good: 1 });
    expect(m.recall).toEqual({ value: 0.3333, accepted: 1, of: 3 });
    expect(m.precision).toEqual({ value: 0.3333, good: 1, of: 3 });
    expect(m.bad_accepted).toEqual({ value: 0.4, accepted: 2, of: 5 });
  });

  test("gives the accept rate of each bad category, and leaves an errored proposal out", () => {
    const m = metrics(rows);
    expect(m.by_category).toEqual({ duplicate: { n: 2, accepted: 1, rate: 0.5 }, stale: { n: 2, accepted: 1, rate: 0.5 }, ephemeral: { n: 1, accepted: 0, rate: 0 } });
    expect(m.outcomes.bad).toEqual({ accept: 2, reject: 2, defer: 1, error: 1 });
    expect(m.outcomes.good).toEqual({ accept: 1, reject: 1, defer: 1, error: 0 });
  });

  test("has no precision when nothing was accepted, and no recall when nothing was good", () => {
    expect(metrics([row("bad", "stale", "reject")])).toMatchObject({ precision: { value: null, of: 0 }, recall: { value: null, of: 0 }, bad_accepted: { value: 0 } });
  });
});

describe("hideEndpoint", () => {
  test("writes the endpoint as <MODEL_BASE_URL>", () => {
    expect(hideEndpoint("failed: http://host:1/v1/chat/completions", "http://host:1/v1/")).toBe("failed: <MODEL_BASE_URL>/chat/completions");
    expect(hideEndpoint("x", "")).toBe("x");
  });
});

describe("the public cases", () => {
  const cases = parseCases(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8"));

  test("are the ones build.ts makes", () => {
    expect(readFileSync(join(EVAL_DIR, "assets", "cases.jsonl"), "utf8")).toBe(render(build()));
  });

  test("are 6 good proposals, and 6 duplicate, 4 stale and 4 ephemeral ones", () => {
    const n = (category: string) => cases.filter((c) => c.category === category).length;
    expect([n("good"), n("duplicate"), n("stale"), n("ephemeral")]).toEqual([6, 6, 4, 4]);
  });

  test("a good, stale or ephemeral proposal is a note of the library, which a run holds out, and a duplicate is a note under a new name", () => {
    const exists = (ref: string) => existsSync(join(LIBRARY, `${ref.slice("knowledge/".length)}.md`));
    for (const c of cases) {
      if (c.category === "duplicate") expect([exists(c.ref), exists(c.ref.replace(/-notes$/, ""))]).toEqual([false, true]);
      else expect(exists(c.ref)).toBe(true);
    }
  });

  test("a stale note names a replacement that is in the library and is not itself held out", () => {
    const held = new Set(cases.map((c) => c.ref.slice(10)));
    for (const c of cases.filter((c) => c.category === "stale")) {
      const by = /\[\[(.+?)\]\]/.exec(c.content)?.[1] as string;
      expect(existsSync(join(LIBRARY, `${by}.md`))).toBe(true);
      expect(held.has(by)).toBe(false);
    }
  });

  test("a duplicate is a note of the library in whole or in its first half", () => {
    const dups = cases.filter((c) => c.category === "duplicate");
    const bodies = dups.map((c) => ({ c, original: readFileSync(join(LIBRARY, `${c.ref.slice("knowledge/".length).replace(/-notes$/, "")}.md`), "utf8") }));
    expect(bodies.filter(({ c, original }) => c.content === original)).toHaveLength(3);
    for (const { c, original } of bodies.filter(({ c, original }) => c.content !== original)) {
      expect(original.startsWith(c.content.trimEnd())).toBe(true);
      expect(c.content.length).toBeLessThan(original.length);
    }
  });
});

describe("build helpers", () => {
  test("insertAfterTitle puts the lines after the first level-1 heading, or after the frontmatter", () => {
    expect(insertAfterTitle("---\na: 1\n---\n\n# T\n\ntext\n", "> x")).toBe("---\na: 1\n---\n\n# T\n\n> x\n\ntext\n");
    expect(insertAfterTitle("---\na: 1\n---\nno title\n", "> x")).toContain("---\n\n> x\nno title");
  });

  test("firstHalf cuts at the paragraph break nearest the middle of the body", () => {
    const text = "---\na: 1\n---\n\naaaa\n\nbbbb\n\ncccc\n\ndddd\n";
    expect(firstHalf(text)).toBe("---\na: 1\n---\n\naaaa\n\nbbbb\n");
  });
});
