import { describe, expect, test } from "bun:test";
import { type Case, type Raw, containsTerm, makeRow, metrics, normalize, parseDocument, rawOf, refOf, summarize } from "./score.ts";

const c = (process: Case["process"], expected: Case["expected"], files: string[] = ["memories/m.md"]): Case => ({ id: "t", process, files, expected });
const ok = (over: Partial<Raw> = {}): Raw => ({ outcome: "output", reason: "", seconds: 1, ...over });
const list = (xs: string[]): string => xs.map((x) => `  - ${x}`).join("\n");
const derived = (o: { title?: string; description?: string; tags?: string[]; searchHints?: string[]; content?: string } = {}): string => {
  const d = { title: "Queue checkpoint", description: "The checkpoint follows both renames.", tags: ["queue", "checkpoint", "rename"], searchHints: ["checkpoint order", "rename failure", "retry job"], content: "The checkpoint is committed after both renames on 2026-02-14.", ...o };
  return `---\ninferred: true\ndescription: ${d.description}\ntags:\n${list(d.tags)}\nsearchHints:\n${list(d.searchHints)}\ntitle: ${d.title}\n---\n\n# ${d.title}\n\n${d.content}\n`;
};
const memory = (tags: string[], extra = ""): string => `---\ndescription: A retry policy for the queue.\ntags:\n${list(tags)}\n${extra}type: memory\n---\nBody.\n`;

describe("reading what akm wrote", () => {
  test("a markdown file is its frontmatter and its body", () => {
    expect(parseDocument("---\ndescription: \"A: B\"\ntags:\n  - a\nobserved_at: 2026-02-14\n---\n\nBody\n")).toEqual({ data: { description: "A: B", tags: ["a"], observed_at: "2026-02-14" }, body: "Body" });
    expect(parseDocument("no frontmatter")).toBeUndefined();
    expect(parseDocument(undefined)).toBeUndefined();
  });

  test("a frontmatter that is not YAML is read line by line", () => {
    expect(parseDocument("---\ndescription: it: is: odd\nbad line\n  - [unclosed\n---\nBody")?.data).toEqual({ description: "it: is: odd" });
  });

  test("a term is found in any case and spacing, and a term ending in y finds its inflections", () => {
    expect(containsTerm("The  Checkpoint\nis committed", "checkpoint is")).toBe(true);
    expect(containsTerm("retries back off", "retry")).toBe(true);
    expect(containsTerm("it retried twice", "retry")).toBe(true);
    expect(containsTerm("retrying", "retry")).toBe(true);
    expect(containsTerm("a retrofit", "retry")).toBe(false);
    expect(containsTerm("a phrase with y", "a phrase with y")).toBe(true);
    expect(containsTerm("a phrase with ies", "phrase with y")).toBe(false); // the stem rule is for a single word
    expect(normalize({ a: "x  y\nz" })).toBe('{"a":"x y z"}');
  });

  test("the ref of a file has no extension and no SKILL", () => {
    expect(refOf("memories/a.md")).toBe("memories/a");
    expect(refOf("skills/s/SKILL.md")).toBe("skills/s");
  });
});

describe("memory-inference", () => {
  const inference = c("memory-inference", { required: ["checkpoint", "renames"], date: "2026-02-14", forbidden: ["2026-02-12"] });

  test("a derived memory with the right shape that keeps the terms and the date is correct", () => {
    expect(makeRow(inference, ok({ derived: derived() }))).toMatchObject({ outcome: "output", structure: true, correct: true, checks: { "retains checkpoint": true, "retains renames": true, "retains explicit date": true, "does not invent 2026-02-12": true } });
  });

  test("two tags or seven search hints are a wrong shape, however right the facts are", () => {
    expect(makeRow(inference, ok({ derived: derived({ tags: ["a", "b"] }) }))).toMatchObject({ structure: false, correct: false });
    expect(makeRow(inference, ok({ derived: derived({ searchHints: ["a", "b", "c", "d", "e", "f", "g"] }) }))).toMatchObject({ structure: false, correct: false });
    expect(makeRow(inference, ok({ derived: derived({ tags: ["a", "b", "c", "d", "e", "f", "g", "h"] }) }))).toMatchObject({ structure: true });
    expect(makeRow(inference, ok({ derived: derived({ title: "" }) }))).toMatchObject({ structure: false });
  });

  test("a term can be found in the title, the description, a tag, a hint or the content, and the date in any of them", () => {
    expect(makeRow(inference, ok({ derived: derived({ content: "Nothing here.", title: "Renames and the checkpoint" }) })).checks).toMatchObject({ "retains checkpoint": true, "retains renames": true, "retains explicit date": false });
    expect(makeRow(inference, ok({ derived: derived({ searchHints: ["2026-02-14 order", "b", "c"] }) })).checks).toMatchObject({ "retains explicit date": true });
  });

  test("a forbidden term is found as the text, with its spacing squashed", () => {
    expect(makeRow(inference, ok({ derived: derived({ content: "It dates from 2026-02-12." }) })).checks).toMatchObject({ "does not invent 2026-02-12": false });
  });

  test("an unusable reply is never correct, an error has no verdict, and neither keeps an output", () => {
    expect(makeRow(inference, { outcome: "unusable", reason: "no derived memory", seconds: 2 })).toMatchObject({ structure: false, correct: false, outcome: "unusable" });
    const err = makeRow(inference, { outcome: "error", reason: "boom", seconds: 2, timedOut: true });
    expect(err).toMatchObject({ structure: null, correct: null, checks: null, error: "boom", timed_out: true });
    expect("derived" in err).toBe(false);
    // output an error row carried is not kept or scored
    expect(makeRow(inference, { outcome: "unusable", reason: "", seconds: 1, derived: derived() }).correct).toBe(false);
  });
});

describe("remember-enrich", () => {
  const dated = c("remember-enrich", { observed_at: "2026-02-14", keywords: ["queue", "retry"] });
  const undated = c("remember-enrich", { observed_at: null, keywords: ["queue"] });

  test("the date must be the one the memory writes, and no date means none", () => {
    expect(makeRow(dated, ok({ written: memory(["queue", "retry"], "observed_at: 2026-02-14\n") }))).toMatchObject({ structure: true, correct: true });
    expect(makeRow(dated, ok({ written: memory(["queue", "retry"]) })).checks).toMatchObject({ "preserves explicit date": false });
    expect(makeRow(dated, ok({ written: memory(["queue", "retry"], "observed_at: 2026-03-01\n") })).checks).toMatchObject({ "preserves explicit date": false });
    expect(makeRow(undated, ok({ written: memory(["queue"]) })).checks).toMatchObject({ "does not invent an observation date": true });
    expect(makeRow(undated, ok({ written: memory(["queue"], "observed_at: ''\n") })).checks).toMatchObject({ "does not invent an observation date": true });
    expect(makeRow(undated, ok({ written: memory(["queue"], "observed_at: 2026-02-14\n") })).checks).toMatchObject({ "does not invent an observation date": false });
  });

  test("one to five lowercase tags and a description are the shape", () => {
    expect(makeRow(undated, ok({ written: memory(["Queue"]) }))).toMatchObject({ structure: false });
    expect(makeRow(undated, ok({ written: memory(["a", "b", "c", "d", "e", "f"]) }))).toMatchObject({ structure: false });
    expect(makeRow(undated, ok({ written: "---\ndescription: Only.\n---\nBody" }))).toMatchObject({ structure: false }); // no tags
    expect(makeRow(undated, ok({ written: "---\ntags:\n  - queue\n---\nBody" }))).toMatchObject({ structure: false }); // no description
  });

  test("a keyword is covered by a tag or by the description, and an inflection is covered", () => {
    expect(makeRow(c("remember-enrich", { observed_at: null, keywords: ["retry", "queue"] }), ok({ written: memory(["retries"]).replace("for the queue", "for jobs") })).checks).toMatchObject({ "metadata covers retry": true, "metadata covers queue": false });
  });
});

describe("schema-repair", () => {
  const repair = c("schema-repair", { keywords: ["publishers"], trigger: ["replace", "deploy"] }, ["lessons/l.md"]);
  const lesson = (description: string, when: string): string => `---\ntags:\n  - queue\ndescription: ${description}\nwhen_to_use: ${when}\ntype: lesson\n---\n\nBody.\n`;

  test("a grounded description and a concrete trigger are correct", () => {
    expect(makeRow(repair, ok({ proposal: lesson("Pause the publishers before replacing a worker image.", "Use when you replace the worker image.") }))).toMatchObject({ structure: true, correct: true, checks: { "generated fields are grounded in the body": true, "trigger is concrete": true } });
  });

  test("a description under 20 characters or a trigger under 15 characters is a wrong shape", () => {
    expect(makeRow(repair, ok({ proposal: lesson("Pause publishers.", "Use when you replace the worker image.") }))).toMatchObject({ structure: false });
    expect(makeRow(repair, ok({ proposal: lesson("Pause the publishers before replacing a worker image.", "Use to fix it.") }))).toMatchObject({ structure: false });
  });

  test("the description may carry the keyword, or the trigger, and the trigger alone decides the trigger check", () => {
    const row = makeRow(repair, ok({ proposal: lesson("Describes a useful practice for operators.", "Use when you want to deploy the service.") }));
    expect(row.checks).toEqual({ "generated fields are grounded in the body": false, "trigger is concrete": true });
  });
});

describe("session-summary", () => {
  const summary = c("session-summary", { required: ["relay-7", "object store"], topics: ["relay-7"], forbidden: ["forced"] }, ["sessions/p/s.jsonl"]);
  const asset = (description: string, topics: string[], tags = ["session", "claude"]): string => `---\nname: x\ntype: session\ntags:\n${list(tags)}\ndescription: ${description}\n---\n\n## Summary\n\n${description}\n\n## Key topics\n\n${topics.map((t) => `- ${t}`).join("\n") || "- (none extracted)"}\n`;
  const LONG = "The session promoted relay-7 after the canary wrote to the Object Store and the health checks stayed green for a while.";

  test("the summary is the description and the topics are the list under Key topics", () => {
    expect(makeRow(summary, ok({ asset: asset(LONG, ["relay-7", "canary"]) }))).toMatchObject({ structure: true, correct: true, checks: { "summary retains relay-7": true, "summary retains object store": true, "topics include relay-7": true, "summary omits forced": true } });
  });

  test("a topic is counted only in the list, and none extracted is an empty list", () => {
    expect(makeRow(summary, ok({ asset: asset(LONG, ["canary"]) })).checks).toMatchObject({ "topics include relay-7": false, "summary retains relay-7": true });
    expect(makeRow(summary, ok({ asset: asset(LONG, []) }))).toMatchObject({ structure: true });
  });

  test("a summary under 80 characters is a wrong shape, and a forbidden term in it fails its check", () => {
    expect(makeRow(summary, ok({ asset: asset("Short.", ["relay-7"]) }))).toMatchObject({ structure: false });
    expect(makeRow(summary, ok({ asset: asset(`${LONG} It was forced.`, ["relay-7"]) })).checks).toMatchObject({ "summary omits forced": false });
  });
});

describe("consolidate-promote", () => {
  const pool = ["memories/a.md", "memories/b.md", "memories/hot.md"];
  const strict = c("consolidate-promote", { promote: ["memories/a"], protected: ["memories/hot"], strict: true }, pool);
  const loose = c("consolidate-promote", { promote: ["memories/a"], protected: ["memories/hot"] }, pool);

  test("the plan must promote the expected memory and leave the protected one", () => {
    expect(makeRow(strict, ok({ planned: ["memories/a"], promoted: ["memories/a"] }))).toMatchObject({ structure: true, correct: true });
    expect(makeRow(loose, ok({ planned: ["memories/a", "memories/hot"] })).checks).toMatchObject({ "leaves protected memories/hot untouched": false });
    expect(makeRow(loose, ok({ planned: [] })).checks).toMatchObject({ "promotes memories/a": false });
  });

  test("a strict case allows no promotion more, and a loose one allows them", () => {
    expect(makeRow(strict, ok({ planned: ["memories/a", "memories/b"] })).checks).toMatchObject({ "no extra or missing promotions": false });
    expect(makeRow(loose, ok({ planned: ["memories/a", "memories/b"] })).correct).toBe(true);
  });

  test("a promotion of a memory outside the pool fails", () => {
    expect(makeRow(loose, ok({ planned: ["memories/a", "memories/elsewhere"] })).checks).toMatchObject({ "promotes only memories of the pool": false });
  });

  test("the plan is scored and the queue is only recorded: akm drops some promotions of its own", () => {
    const row = makeRow(strict, ok({ planned: ["memories/a", "memories/hot"], promoted: ["memories/a"] }));
    expect(row.correct).toBe(false);
    expect(row.promoted).toEqual(["memories/a"]);
  });
});

describe("rows and metrics", () => {
  const inference = c("memory-inference", { required: ["checkpoint"] });
  const rows = [
    makeRow(inference, ok({ derived: derived(), seconds: 4 })),
    makeRow(inference, ok({ derived: derived({ content: "Nothing." , title: "T", description: "D", tags: ["a", "b", "c"], searchHints: ["a", "b", "c"] }), seconds: 2 })),
    makeRow(inference, { outcome: "unusable", reason: "none", seconds: 6 }),
    makeRow(inference, { outcome: "error", reason: "boom", seconds: 100 }),
  ];

  test("a case that errored is left out of every count, and the shape and the checks are counted apart", () => {
    const m = metrics(rows);
    expect(m.valid_output).toEqual({ n: 3, passed: 2, rate: 0.6667 });
    expect(m.case_pass).toEqual({ n: 3, passed: 1, rate: 0.3333 });
    expect(m.checks).toEqual({ n: 3, rate: 0.3333 }); // 1 + 0 + 0 (a wrong shape earns none) over 3
    expect(m.median_seconds).toBe(4);
    expect(m.by_process["memory-inference"]).toMatchObject({ n: 3, valid_output: 2, passed: 1, outcomes: { output: 2, unusable: 1, error: 1 }, failed: { "retains checkpoint": 2 } });
  });

  test("the summary counts the cases that ran, were scored and errored, and the timeouts and the models", () => {
    expect(summarize([...rows, makeRow(inference, { outcome: "error", reason: "slow", seconds: 9, timedOut: true }), makeRow(inference, ok({ derived: derived(), served: "m1" }))])).toMatchObject({ n_run: 6, n_scored: 4, n_errored: 2, timeouts: 1, served: { m1: 1 } });
    expect(metrics([])).toEqual({ valid_output: { n: 0, passed: 0, rate: null }, case_pass: { n: 0, passed: 0, rate: null }, checks: { n: 0, rate: null }, median_seconds: null, by_process: {} });
  });
});

describe("scoring a stored row again", () => {
  test("a row gives back the raw output it was made from, and the same row when it is scored again", () => {
    const inference = c("memory-inference", { required: ["checkpoint"] });
    const row = makeRow(inference, ok({ derived: derived(), served: "m1" }));
    const read = rawOf(JSON.parse(JSON.stringify(row)));
    expect("raw" in read && makeRow(inference, read.raw)).toEqual(row);
    const err = makeRow(inference, { outcome: "error", reason: "x", seconds: 3, timedOut: true });
    const readErr = rawOf(JSON.parse(JSON.stringify(err)));
    expect("raw" in readErr && makeRow(inference, readErr.raw)).toEqual(err);
  });

  test("a row that lacks what the scorer reads is refused, and the fields are named", () => {
    expect(rawOf({ process: "memory-inference", outcome: "output", reason: "", seconds: 1 })).toEqual({ missing: ["derived"] });
    expect(rawOf({ process: "remember-enrich", outcome: "output", reason: "", seconds: 1 })).toEqual({ missing: ["written"] });
    expect(rawOf({ process: "schema-repair", outcome: "output", reason: "", seconds: 1 })).toEqual({ missing: ["proposal"] });
    expect(rawOf({ process: "session-summary", outcome: "output", reason: "", seconds: 1 })).toEqual({ missing: ["asset"] });
    expect(rawOf({ process: "consolidate-promote", outcome: "output", reason: "", seconds: 1, promoted: [] })).toEqual({ missing: ["planned"] });
    expect(rawOf({ process: "consolidate-promote", outcome: "output", reason: "", seconds: 1, planned: [] })).toHaveProperty("raw");
    expect(rawOf({ outcome: "error", seconds: 1 })).toEqual({ missing: ["error"] });
    expect(rawOf({ outcome: "maybe" })).toEqual({ missing: ["outcome", "seconds", "reason"] });
    expect(rawOf({ process: "memory-inference", outcome: "unusable", reason: "r", seconds: 1 })).toHaveProperty("raw"); // nothing was made, so nothing is missing
  });
});
