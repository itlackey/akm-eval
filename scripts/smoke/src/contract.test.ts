import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { CONTRACTS, type Canned, type Contract, MALFORMED_ANSWER, answerFrom, describeCanned, malformed, matches, runContract, verify } from "./contract.ts";
import { AKM_0_9_26_REQUESTS, type Fixture } from "./fixtures.ts";
import { ENTRIES, EMPTY_ANSWER, type ChatRequest, type Stub, startStub, stubEnv } from "./lib.ts";
import { type Schema, check, valueFor } from "./schema.ts";

const dirs: string[] = [];
const stubs: Stub[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  for (const s of stubs.splice(0)) s.stop();
});

/** The request akm made, as far as the stub reads it: the schema as response_format and the start of the prompt. */
function requestOf(f: Fixture): ChatRequest {
  return {
    model: "m",
    messages: [
      { role: "system", content: "Return only valid JSON. No prose." },
      { role: "user", content: `${f.prompt} and the rest of the prompt` },
    ],
    ...(f.schema ? { response_format: { type: "json_schema", json_schema: { name: "akm_response", schema: f.schema, strict: true } } } : {}),
  };
}

/** The fixtures an eval's run triggers. The nightly eval runs the consolidate pair pass, and its model calls are those of consolidate. */
const fixturesOf = (dir: string): Fixture[] => AKM_0_9_26_REQUESTS.filter((f) => f.eval === basename(dir) || (dir === "evals/nightly" && f.eval === "consolidate"));

const fixture = (name: string): Fixture => AKM_0_9_26_REQUESTS.find((f) => f.name === name) as Fixture;

describe("matches", () => {
  const req = requestOf(fixture("distill judge"));

  test("by the required keys of the schema, in any order", () => {
    expect(matches({ keys: ["scores", "reason"], reply: 1 }, req)).toBe(true);
    expect(matches({ keys: ["reason", "scores"], reply: 1 }, req)).toBe(true);
    expect(matches({ keys: ["scores"], reply: 1 }, req)).toBe(false);
    expect(matches({ keys: ["scores", "reason", "x"], reply: 1 }, req)).toBe(false);
  });

  test("by a text in the prompt, and by both when both are given", () => {
    expect(matches({ prompt: "proposed lesson asset", reply: 1 }, req)).toBe(true);
    expect(matches({ prompt: "proposed revision", reply: 1 }, req)).toBe(false);
    expect(matches({ keys: ["scores", "reason"], prompt: "proposed lesson asset", reply: 1 }, req)).toBe(true);
    expect(matches({ keys: ["scores", "reason"], prompt: "proposed revision", reply: 1 }, req)).toBe(false);
  });

  test("a reply with neither matches nothing, and a request with no schema has no keys", () => {
    expect(matches({ reply: 1 }, req)).toBe(false);
    const plain = requestOf(fixture("judgment"));
    expect(matches({ keys: [], reply: 1 }, plain)).toBe(true);
    expect(matches({ keys: ["scores"], reply: 1 }, plain)).toBe(false);
    expect(matches({ prompt: "adjudicating a pending", reply: 1 }, plain)).toBe(true);
  });
});

describe("answerFrom", () => {
  const canned: Canned[] = [
    { keys: ["scores", "reason"], reply: { scores: { need: 5, preservation: 5, quality: 5 }, reason: "canned" } },
    { prompt: "adjudicating", reply: "plain text" },
  ];

  test("gives the first canned reply that matches, as JSON, or as it is when it is text", () => {
    const answer = answerFrom(canned);
    expect(JSON.parse(answer(requestOf(fixture("judge"))))).toEqual({ scores: { need: 5, preservation: 5, quality: 5 }, reason: "canned" });
    expect(answer(requestOf(fixture("judgment")))).toBe("plain text");
  });

  test("gives the value that fits the schema of a request that no canned reply matches", () => {
    const f = fixture("reflect");
    const reply = JSON.parse(answerFrom(canned)(requestOf(f)));
    expect(reply).toEqual(valueFor(f.schema as Schema));
    expect(check(f.schema as Schema, reply)).toEqual([]);
  });

  test("gives {} to a request that sends no schema and matches nothing, such as akm's probe of the endpoint", () => {
    expect(answerFrom([])(requestOf(fixture("probe")))).toBe(EMPTY_ANSWER);
    expect(answerFrom(canned)(requestOf(fixture("probe")))).toBe(EMPTY_ANSWER);
  });

  test("remembers which canned replies it has given, and lists the others as unused", () => {
    const answer = answerFrom(canned);
    expect(answer.unused()).toEqual(canned);
    answer(requestOf(fixture("reflect"))); // matches neither
    expect(answer.unused()).toEqual(canned);
    answer(requestOf(fixture("judgment")));
    expect(answer.unused()).toEqual([canned[0] as Canned]);
    answer(requestOf(fixture("judge")));
    expect(answer.unused()).toEqual([]);
    expect(describeCanned(canned[0] as Canned)).toBe("a schema that requires scores, reason");
    expect(describeCanned(canned[1] as Canned)).toBe('a prompt with "adjudicating"');
    expect(describeCanned({ keys: ["a"], prompt: "p", reply: 1 })).toBe('a schema that requires a and a prompt with "p"');
  });

  test("malformed answers text that is not JSON, to everything", () => {
    for (const f of AKM_0_9_26_REQUESTS) expect(malformed(requestOf(f))).toBe(MALFORMED_ANSWER);
    expect(() => JSON.parse(MALFORMED_ANSWER)).toThrow();
  });
});

describe("the canned replies, against the requests akm 0.9.26 sends", () => {
  const contracts = Object.entries(CONTRACTS);

  test("every request an eval makes gets a reply that is JSON and, when the request sends a schema, fits it", () => {
    for (const [dir, contract] of contracts) {
      const answer = answerFrom(contract.canned);
      for (const f of fixturesOf(dir)) {
        const reply = JSON.parse(answer(requestOf(f)));
        if (f.schema) expect({ dir, request: f.name, problems: check(f.schema, reply) }).toEqual({ dir, request: f.name, problems: [] });
      }
    }
  });

  test("a canned reply is for a request the evals make, and differs from the value that fits the schema: the table holds only what akm needs said", () => {
    for (const [dir, contract] of contracts) {
      for (const c of contract.canned) {
        const hit = fixturesOf(dir).filter((f) => matches(c, requestOf(f)));
        expect({ dir, canned: JSON.stringify(c).slice(0, 60), requests: hit.length > 0 }).toEqual({ dir, canned: JSON.stringify(c).slice(0, 60), requests: true });
        for (const f of hit) if (f.schema) expect({ dir, request: f.name, same: JSON.stringify(c.reply) === JSON.stringify(valueFor(f.schema)) }).toEqual({ dir, request: f.name, same: false });
      }
    }
  });

  test("the evals whose rows reach the outcome on the value that fits the schema have no table", () => {
    expect(contracts.filter(([, c]) => c.canned.length === 0).map(([dir]) => dir)).toEqual(["evals/retrieval", "evals/judge-gate", "evals/reflect", "evals/extract"]);
  });

  test("the lesson that distill's writer is asked for is longer than akm's minimum, which the schema's is not", () => {
    const f = fixture("distill lesson");
    const schemaValue = valueFor(f.schema as Schema) as { description: string; when_to_use: string };
    // akm 0.9.26 queues a lesson whose description has under 20 characters or whose when_to_use has under 15 as invalid: "description is too short (10 chars; need >=20)".
    expect(schemaValue.description.length).toBeLessThan(20);
    expect(schemaValue.when_to_use.length).toBeLessThan(15);
    const lesson = JSON.parse(answerFrom((CONTRACTS["evals/distill"] as Contract).canned)(requestOf(f))) as { description: string; when_to_use: string; body: string };
    expect(lesson.description.length).toBeGreaterThanOrEqual(20);
    expect(lesson.description.length).toBeLessThanOrEqual(400);
    expect(lesson.when_to_use.length).toBeGreaterThanOrEqual(15);
    expect(lesson.description).toMatch(/^[A-Z][^`*#|]*\.$/); // a sentence: no leading When or If, no markdown, no trailing colon or comma
    expect(lesson.description).not.toMatch(/^(When|If) /);
    expect(lesson.body.length).toBeGreaterThan(0);
  });

  test("the judge of a distilled lesson scores it 5, where the schema's value would score 1 and have the lesson rejected", () => {
    const f = fixture("distill judge");
    expect((valueFor(f.schema as Schema) as { scores: Record<string, number> }).scores).toEqual({ novelty: 1, nonRedundancy: 1, grounding: 1 });
    expect((JSON.parse(answerFrom((CONTRACTS["evals/distill"] as Contract).canned)(requestOf(f))) as { scores: Record<string, number> }).scores).toEqual({ novelty: 5, nonRedundancy: 5, grounding: 5 });
  });

  test("the pair judge answers a duplicate with no claim of its own, and the second look finds nothing missing", () => {
    for (const dir of ["evals/consolidate", "evals/nightly"]) {
      const answer = answerFrom((CONTRACTS[dir] as Contract).canned);
      expect(JSON.parse(answer(requestOf(fixture("pair judge"))))).toMatchObject({ onlyInA: [], onlyInB: [], relation: "duplicate", redundant: "A", stale: null });
      expect(JSON.parse(answer(requestOf(fixture("pair second look"))))).toEqual({ missing: [] });
    }
  });

  test("the promotion judge answers an accept in the plain JSON akm reads between the first { and the last }", () => {
    const reply = answerFrom((CONTRACTS["evals/promotion"] as Contract).canned)(requestOf(fixture("judgment")));
    expect(JSON.parse(reply)).toMatchObject({ decision: "accept" });
    expect(reply.indexOf("{")).toBe(0);
    expect(reply.lastIndexOf("}")).toBe(reply.length - 1);
  });
});

describe("CONTRACTS", () => {
  test("holds a contract for every eval the smoke runs and for no other", () => {
    expect(Object.keys(CONTRACTS).sort()).toEqual(ENTRIES.filter((e) => !e.skip).map((e) => e.dir).sort());
  });

  test("has a failure run for every eval that calls a model, and none for retrieval, which calls none", () => {
    for (const e of ENTRIES.filter((e) => !e.skip)) expect({ dir: e.dir, failure: (CONTRACTS[e.dir] as Contract).failure !== undefined }).toEqual({ dir: e.dir, failure: e.model !== false });
  });

  test("wants a different outcome from the failure run than from the success run", () => {
    for (const [dir, c] of Object.entries(CONTRACTS)) {
      if (!c.failure) continue;
      expect({ dir, same: c.failure.field === c.success.field && JSON.stringify(c.failure.values) === JSON.stringify(c.success.values) }).toEqual({ dir, same: false });
    }
  });
});

/**
 * Rows as the evals write them for a run on one case, from real runs against akm 0.9.26 with the stub, shortened. `ok` is the row of the
 * success run and `bad` the row of the run with malformed replies. The summaries are what the run script keeps of the eval's summary.json.
 */
const RUNS: Record<string, { ok: Record<string, unknown>; bad: Record<string, unknown>; okSummary?: Record<string, unknown>; badSummary?: Record<string, unknown> }> = {
  "evals/judge-gate": {
    ok: { id: "1e35a0cc", set: "accepted-aug", label: "bad", outcome: "reject", score: 1, criteria: { need: 1, preservation: 1, quality: 1 }, reason: "smoke-text", engine: "judge" },
    bad: { id: "1e35a0cc", set: "accepted-aug", label: "bad", outcome: "review", score: null, criteria: null, reason: "judge parse failed — routed to review", engine: "judge" },
  },
  "evals/reflect": {
    ok: { id: "description-period-01", class: "description-period", outcome: "proposal", reason: "", correct: false },
    bad: { id: "description-period-01", class: "description-period", outcome: "unusable", reason: "parse_error: direct reflect response was not valid JSON", correct: false },
  },
  "evals/distill": {
    ok: { id: "lesson-01", expect: "lesson", outcome: "lesson", status: "pending", gate: "deferred/distill-review", detail: "deferred/distill-review: The lesson states what the memory says." },
    bad: { id: "lesson-01", expect: "lesson", outcome: "invalid", status: null, gate: null, detail: "Distilled lesson failed validation:\nLesson at distill:memories/x is missing required frontmatter field `when_to_use`." },
  },
  "evals/consolidate": {
    ok: { id: "duplicate-01", relation: "duplicate", paired: true, judged_as: "duplicate", outcome: "retire", retired: "a", safe: true, staged: true, reason: "Both notes state the same claims." },
    bad: { id: "duplicate-01", relation: "duplicate", paired: true, judged_as: null, outcome: "error", staged: false, error: "akm paired the notes but its judge gave no verdict (akm said: Chunk 1: invalid plan from AI — skipping.)" },
  },
  "evals/extract": {
    ok: { id: "insight-01", class: "insight", outcome: "saved", correct: false, detail: "" },
    bad: { id: "insight-01", class: "insight", outcome: "unusable", correct: false, detail: "malformed_model_output: LLM response: no JSON object found; attempts=2" },
  },
  "evals/nightly": {
    ok: { id: "duplicate-01", kind: "pair", ok: true, harm: false, state: "retired a" },
    bad: { id: "duplicate-01", kind: "pair", ok: false, harm: false, state: "both notes kept" },
    okSummary: { status: "complete", improve_ok: true, pair_pass: { pairs_judged: 1, failed_judgments: 0, labels: { duplicate: 1 } } },
    badSummary: { status: "complete", improve_ok: true, pair_pass: { pairs_judged: 0, failed_judgments: 1, labels: {} } },
  },
  "evals/promotion": {
    ok: { id: "good-01", label: "good", category: "good", reason: "judgment-accept", outcome: "accept" },
    bad: { id: "good-01", label: "good", category: "good", reason: "judgment-deferred", outcome: "defer" },
  },
};

describe("what a run must say", () => {
  test("every eval with a failure run takes the row of a run that reached the outcome, and not the row of a malformed one", () => {
    expect(Object.keys(RUNS).sort()).toEqual(Object.entries(CONTRACTS).filter(([, c]) => c.failure).map(([dir]) => dir).sort());
    for (const [dir, run] of Object.entries(RUNS)) {
      const c = CONTRACTS[dir] as Contract;
      const [ok, bad] = [{ ...run.ok }, { ...run.bad }];
      const [okSummary, badSummary] = [run.okSummary ? [run.okSummary] : [], run.badSummary ? [run.badSummary] : []];
      expect({ dir, reached: verify(c.success, [ok], okSummary, "success") }).toEqual({ dir, reached: [] });
      expect({ dir, malformed: verify(c.failure as NonNullable<Contract["failure"]>, [bad], badSummary, "failure") }).toEqual({ dir, malformed: [] });
      expect({ dir, wrong: verify(c.success, [bad], badSummary, "success").length > 0 }).toEqual({ dir, wrong: true });
      expect({ dir, wrong: verify(c.failure as NonNullable<Contract["failure"]>, [ok], okSummary, "failure").length > 0 }).toEqual({ dir, wrong: true });
    }
  });

  test("retrieval has only its rows to show: no error", () => {
    const c = CONTRACTS["evals/retrieval"] as Contract;
    expect(verify(c.success, [{ id: "q1", search: { refs: ["skills/a"] }, curate: { refs: ["skills/a"] } }], [{}], "success")).toEqual([]);
    expect(verify(c.success, [{ id: "q1", error: "akm search failed: exit 2" }], [{}], "success")).toEqual(["q1 errored: akm search failed: exit 2"]);
  });

  test("a run with no row says so", () => {
    expect(verify({ field: "outcome", values: ["proposal"] }, [], [], "success")).toEqual(["the run wrote no rows"]);
    expect(verify({}, [], [], "failure")).toEqual(["the run wrote no rows"]);
  });

  test("a success run fails on a row with an error, whatever its outcome says, and on an aborted summary", () => {
    const expect_ = { field: "outcome", values: ["saved"] };
    expect(verify(expect_, [{ id: "a", outcome: "saved", error: "boom\n  twice" }], [], "success")).toEqual(["a errored: boom twice"]);
    expect(verify(expect_, [{ id: "a", outcome: "saved" }], [{ status: "aborted", aborted_reason: "the first five cases got no outcome" }], "success")).toEqual(["the summary says the run was aborted: the first five cases got no outcome"]);
    expect(verify(expect_, [{ id: "a", outcome: "saved" }], [{ status: "complete" }, {}], "success")).toEqual([]); // a summary with no status is not aborted
    // a failure run is allowed an error and an aborted summary: it is the outcome that it must reach
    expect(verify({ field: "outcome", values: ["error"] }, [{ id: "a", outcome: "error", error: "boom" }], [{ status: "aborted" }], "failure")).toEqual([]);
  });

  test("names the row, the field, what it was and what was wanted", () => {
    expect(verify({ field: "outcome", values: ["proposal"] }, [{ id: "case-1", outcome: "unusable" }, { outcome: "none" }], [], "success")).toEqual([
      "case-1: outcome is unusable, expected proposal",
      "a row: outcome is none, expected proposal",
    ]);
    expect(verify({ field: "ok", values: [true] }, [{ id: "a", ok: false }], [], "success")).toEqual(["a: ok is false, expected true"]);
    expect(verify({ field: "outcome", values: ["accept", "reject"] }, [{ id: "a" }], [], "success")).toEqual(["a: outcome is undefined, expected accept or reject"]);
  });

  test("the checks of the rows add to the problems", () => {
    const c = CONTRACTS["evals/judge-gate"] as Contract;
    expect(verify(c.success, [{ id: "a", outcome: "review", score: null }], [], "success")).toEqual(["a: score is null, expected a number: a verdict"]);
    const n = CONTRACTS["evals/nightly"] as Contract;
    expect(verify(n.success, [{ id: "a", ok: true }], [{ status: "complete", improve_ok: false, pair_pass: { pairs_judged: 0, failed_judgments: 2 } }], "success")).toEqual([
      "the pair pass judged 0 pairs, expected 1",
      "the pair pass has 2 failed judgments, expected 0",
      "akm reported the improve run as not ok",
    ]);
    expect(verify(n.success, [{ id: "a", ok: true }], [{ status: "complete", improve_ok: true }], "success")).toEqual(["the pair pass judged undefined pairs, expected 1", "the pair pass has undefined failed judgments, expected 0"]);
  });

  test("consolidate wants the notes paired, judged a duplicate and the retirement staged", () => {
    const c = CONTRACTS["evals/consolidate"] as Contract;
    const row = { id: "d", outcome: "retire", paired: false, judged_as: "overlap", staged: false };
    expect(verify(c.success, [row], [], "success")).toEqual(["d: paired is false, expected true: akm paired the notes", "d: judged_as is overlap, expected duplicate: the label of the judge", "d: staged is false, expected true: akm staged the retirement"]);
  });
});

/** A repository with one eval, `evals/fake`, whose run script asks the stub for a reply to a request with a schema and writes a row that says what it got. */
function fakeRepo(extra = ""): string {
  const root = mkdtempSync(join(tmpdir(), "smoke-contract-"));
  dirs.push(root);
  mkdirSync(join(root, "evals", "fake", "results"), { recursive: true });
  writeFileSync(
    join(root, "evals", "fake", "run.ts"),
    `import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
const schema = { type: "object", required: ["x"], properties: { x: { type: "string" } } };
const res = await fetch(process.env.MODEL_BASE_URL + "/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "m", messages: [{ role: "user", content: "say x" }], response_format: { type: "json_schema", json_schema: { name: "akm_response", schema } } }) });
const reply = (await res.json()).choices[0].message.content;
const dir = "evals/fake/results/" + new Date().toISOString().slice(0, 10) + "-smoke-" + readdirSync("evals/fake/results").length;
mkdirSync(dir);
writeFileSync(dir + "/summary.json", JSON.stringify({ status: "complete" }));
writeFileSync(dir + "/samples.jsonl", JSON.stringify({ id: "a", outcome: reply.includes("fine") ? "good" : "bad", reply }) + "\\n");
${extra}
`,
  );
  writeFileSync(join(root, "evals", "fake", "run"), '#!/usr/bin/env bash\ncd "$(dirname "${BASH_SOURCE[0]}")/../.." && exec bun evals/fake/run.ts "$@"\n');
  chmodSync(join(root, "evals", "fake", "run"), 0o755);
  return root;
}

const startedStub = (): Stub => {
  const s = startStub();
  stubs.push(s);
  return s;
};

describe("runContract", () => {
  const fine: Canned[] = [{ keys: ["x"], reply: { x: "fine" } }];
  const contract: Contract = { canned: fine, success: { field: "outcome", values: ["good"] }, failure: { field: "outcome", values: ["bad"] } };

  test("runs the eval with the canned replies and then with malformed ones, and is ok when each reaches its outcome", async () => {
    const root = fakeRepo();
    const stub = startedStub();
    const out = await runContract({ dir: "evals/fake" }, contract, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(out).toMatchObject({ dir: "evals/fake", status: "ok", note: "" });
    expect(out.legs.map((l) => [l.kind, l.problems, l.run.status, l.run.firstRow])).toEqual([
      ["success", [], "ok", "outcome: good"],
      ["failure", [], "ok", "outcome: bad"],
    ]);
    expect(out.legs.map((l) => l.run.folders.length)).toEqual([1, 1]);
    expect(out.legs[0]?.run.folders).not.toEqual(out.legs[1]?.run.folders);
  });

  test("answers each leg from its own table: the second run sees the malformed text, whatever the first set", async () => {
    const root = fakeRepo();
    const stub = startedStub();
    await runContract({ dir: "evals/fake" }, contract, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(stub.seen().map((s) => s.reply)).toEqual([MALFORMED_ANSWER]); // reset before each run: what is left is the second run's call
    expect(stub.seen()[0]?.keys).toEqual(["x"]);
  });

  test("is FAIL when the success run does not reach the outcome, and says which row and what it was", async () => {
    const root = fakeRepo();
    const stub = startedStub();
    const wrong: Contract = { ...contract, success: { field: "outcome", values: ["great"] } };
    const out = await runContract({ dir: "evals/fake" }, wrong, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(out.status).toBe("FAIL");
    expect(out.legs[0]?.problems).toEqual(["a: outcome is good, expected great"]);
    expect(out.legs[1]?.problems).toEqual([]);
    expect(out.note).toBe("success: a: outcome is good, expected great");
  });

  test("answers a request that no canned reply matches with the value that fits its schema", async () => {
    const root = fakeRepo();
    const stub = startedStub();
    const out = await runContract({ dir: "evals/fake" }, { ...contract, canned: [] }, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(out.status).toBe("FAIL"); // "smoke-text" is not "fine"
    expect(out.legs[0]?.run.firstRow).toBe("outcome: bad");
  });

  test("is FAIL when a canned reply is never used, and says what akm sent instead: the run did not take the path the table was written for", async () => {
    const root = fakeRepo();
    const stub = startedStub();
    const stale: Contract = { ...contract, canned: [...fine, { keys: ["x", "reason"], reply: { x: "fine", reason: "r" } }, { prompt: "never asked", reply: "x" }] };
    const out = await runContract({ dir: "evals/fake" }, stale, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(out.status).toBe("FAIL");
    expect(out.legs[0]?.problems).toEqual([
      "the canned reply for a schema that requires x, reason was never used. akm sent: a schema that requires x",
      'the canned reply for a prompt with "never asked" was never used. akm sent: a schema that requires x',
    ]);
    expect(out.legs[1]?.problems).toEqual([]); // the malformed run uses no table
  });

  test("is FAIL when the malformed run reaches the success outcome: akm took a reply that was no JSON", async () => {
    const root = fakeRepo();
    const stub = startedStub();
    const out = await runContract({ dir: "evals/fake" }, { ...contract, failure: { field: "outcome", values: ["good"] } }, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(out.status).toBe("FAIL");
    expect(out.legs[1]?.problems).toEqual(["a: outcome is bad, expected good"]);
  });

  test("makes no failure run for a contract with none", async () => {
    const root = fakeRepo();
    const stub = startedStub();
    const out = await runContract({ dir: "evals/fake" }, { canned: fine, success: contract.success }, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(out.status).toBe("ok");
    expect(out.legs.map((l) => l.kind)).toEqual(["success"]);
  });

  test("fails a success run whose script exits non-zero after writing its summary", async () => {
    const root = fakeRepo("process.exit(1);");
    const stub = startedStub();
    const out = await runContract({ dir: "evals/fake" }, { canned: fine, success: contract.success }, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(out.status).toBe("FAIL");
    expect(out.legs[0]?.problems).toEqual(["the run exited 1"]);
  });

  test("is FAIL, with the run's own reason, when the run wrote no summary", async () => {
    const root = fakeRepo();
    writeFileSync(join(root, "evals", "fake", "run"), "#!/usr/bin/env bash\necho 'akm 0.0.1 is too old' >&2\nexit 2\n");
    const stub = startedStub();
    const out = await runContract({ dir: "evals/fake" }, contract, { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub });
    expect(out.status).toBe("FAIL");
    expect(out.legs[0]?.problems).toEqual(["exit 2, and it made no results folder"]);
    expect(out.legs[0]?.run.tail).toContain("akm 0.0.1 is too old");
  });

  test("is FAIL for an eval that has no contract, and skips one with a reason, running nothing", async () => {
    const root = fakeRepo();
    const stub = startedStub();
    const opts = { root, env: stubEnv(process.env, stub.url), timeoutMs: 30_000, stub };
    const none = await runContract({ dir: "evals/fake" }, undefined, opts);
    expect(none).toMatchObject({ status: "FAIL", legs: [] });
    expect(none.note).toContain("no contract");
    expect(await runContract({ dir: "evals/fake", skip: "needs Docker" }, contract, opts)).toEqual({ dir: "evals/fake", status: "skipped", note: "needs Docker", legs: [] });
    expect(stub.calls()).toBe(0);
  });
});

describe(".github/workflows/akm-smoke.yml", () => {
  const workflow = Bun.YAML.parse(readFileSync(resolve(import.meta.dir, "..", "..", "..", ".github", "workflows", "akm-smoke.yml"), "utf8")) as any;
  const job = workflow.jobs.smoke;

  /** The legs of a run. The matrix holds two JSON lists, the first for a pull request and the second for a night or a manual run. */
  const legs = (pullRequest: boolean): unknown => {
    const expression = job.strategy.matrix.leg as string;
    expect(expression).toContain("github.event_name == 'pull_request'");
    const lists = [...expression.matchAll(/'(\[[^']*\])'/g)].map((m) => JSON.parse(m[1] as string));
    expect(lists).toHaveLength(2);
    return lists[pullRequest ? 0 : 1];
  };
  const PINNED = { akm: "pinned", flags: "--contract", advisory: false };

  test("runs the contract mode on the pinned release as a leg that must pass, and the startup mode on the latest as an advisory one", () => {
    expect(job.strategy["fail-fast"]).toBe(false);
    expect(legs(false)).toEqual([PINNED, { akm: "latest", flags: "--strict", advisory: true }]);
    expect(job["continue-on-error"]).toBe("${{ matrix.leg.advisory }}"); // only the advisory leg may fail without failing the workflow
    expect(job.steps.find((s: any) => s.name === "scripts/smoke").run).toBe("scripts/smoke/run ${{ matrix.leg.flags }}");
    expect(job.name).toBe("smoke (${{ matrix.leg.akm }})");
  });

  test("a pull request that changes the evals or what they share runs the pinned contract leg alone", () => {
    expect(legs(true)).toEqual([PINNED]);
    expect(workflow.on.pull_request.paths).toEqual(expect.arrayContaining(["lib/**", "evals/**", "benchmarks/**", "corpus/**", "scripts/smoke/**", ".github/workflows/akm-smoke.yml"]));
  });

  test("installs the release that lib/harbor/harbor.ts pins for the pinned leg, and the latest for the other", () => {
    const install = job.steps.find((s: any) => s.name === "Install akm").run as string;
    expect(install).toContain('[ "${{ matrix.leg.akm }}" = latest ]');
    expect(install).toContain("lib/harbor/harbor.ts");
  });

  test("runs nightly, on demand and on a pull request, with no secret", () => {
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "schedule", "workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(readFileSync(resolve(import.meta.dir, "..", "..", "..", ".github", "workflows", "akm-smoke.yml"), "utf8")).not.toContain("secrets.");
  });
});
