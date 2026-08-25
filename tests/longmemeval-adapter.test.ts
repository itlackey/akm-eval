import { afterEach, describe, expect, test } from "bun:test";
/**
 * Unit tests for src/packs/longmemeval/adapter.ts's retrieval wiring: does
 * the non-disabled-backend arm actually add() haystack sessions and
 * search() per question, is the model context built from exactly the
 * retrieved text, are retrieval metrics computed against evidence session
 * ids correctly, does the zero-hit warning fire, and is the disabled-backend
 * (baseline) arm's prompt byte-identical to what it was before this pack
 * routed retrieval through a memory backend at all.
 *
 * No real akm CLI, no docker, no network, no LLM judging: the memory backend
 * is a scripted in-process fake (deterministic search results, controlled by
 * the test), the model provider is a scripted fake AgentRunner, and the
 * "official evaluator" is a real subprocess fixture
 * (tests/fixtures/fake-longmemeval-evaluator.ts) that judges by deterministic
 * substring containment -- adequate for pinning THIS repo's own wiring, never
 * a stand-in for the real LLM-judged evaluator used in production.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentRunOptions, AgentRunResult, AgentRunner } from "../src/agent/types.ts";
import { createRunContext } from "../src/core/run-context.ts";
import type { EvalConfig, RunDefinition } from "../src/core/types.ts";
import type {
  MemoryBackend,
  MemoryDocument,
  MemoryQuery,
  MemorySearchResult,
} from "../src/memory/types.ts";
import {
  buildFullContextPrompt,
  buildRetrievedPrompt,
  longMemEvalAdapter,
  sessionToMemoryDocument,
} from "../src/packs/longmemeval/adapter.ts";
import type { LongMemEvalQuestion } from "../src/packs/longmemeval/dataset.ts";

/** Minimal LongMemEvalQuestion stand-in for prompt-builder unit checks -- only `.question`/`.conversation` are read by the functions under test here. */
function questionStub(overrides: Partial<LongMemEvalQuestion>): LongMemEvalQuestion {
  return {
    id: "stub",
    category: "single-session",
    conversation: [],
    haystackSessions: [],
    evidenceSessionIds: [],
    haystackSessionsSynthesized: false,
    question: "",
    expectedAnswer: "",
    ...overrides,
  };
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fakeEvaluatorPath = path.resolve(rootDir, "tests/fixtures/fake-longmemeval-evaluator.ts");
const fakeEvaluatorCommand = `bun ${JSON.stringify(fakeEvaluatorPath)}`;

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// ── Scripted fake MemoryBackend ──────────────────────────────────────────────

interface BackendCalls {
  resetCount: number;
  addCalls: MemoryDocument[][];
  searchCalls: MemoryQuery[];
}

/**
 * A deterministic fake MemoryBackend: reset()/add() just record what they
 * were called with, and search() returns the next array off a
 * caller-supplied queue (one entry per expected call, in call order) --
 * fully scripted, not driven by what was actually add()-ed, exactly what
 * "a scripted fake MemoryBackend (deterministic search results)" calls for.
 */
function createScriptedMemoryBackend(scriptedSearchResults: MemorySearchResult[][]): {
  backend: MemoryBackend;
  calls: BackendCalls;
} {
  const calls: BackendCalls = { resetCount: 0, addCalls: [], searchCalls: [] };
  let searchIndex = 0;
  const backend: MemoryBackend = {
    id: "fake-scripted",
    kind: "external",
    async reset() {
      calls.resetCount += 1;
    },
    async add(documents) {
      calls.addCalls.push(documents);
    },
    async search(query) {
      calls.searchCalls.push(query);
      const results = scriptedSearchResults[searchIndex] ?? [];
      searchIndex += 1;
      return results;
    },
    healthCheck() {
      return { status: "ok", detail: "scripted fake backend" } as const;
    },
  };
  return { backend, calls };
}

/** Wraps a real backend, recording call counts, without changing its behavior -- used to assert "never called" on the disabled path. */
function spyOnBackend(backend: MemoryBackend): { backend: MemoryBackend; calls: BackendCalls } {
  const calls: BackendCalls = { resetCount: 0, addCalls: [], searchCalls: [] };
  const spied: MemoryBackend = {
    id: backend.id,
    kind: backend.kind,
    async reset() {
      calls.resetCount += 1;
      return backend.reset();
    },
    async add(documents) {
      calls.addCalls.push(documents);
      return backend.add(documents);
    },
    async search(query) {
      calls.searchCalls.push(query);
      return backend.search(query);
    },
    healthCheck() {
      return backend.healthCheck();
    },
  };
  return { backend: spied, calls };
}

function createNoneBackendForTest(): MemoryBackend {
  return {
    id: "none",
    kind: "disabled",
    async add(): Promise<void> {},
    async search(): Promise<MemorySearchResult[]> {
      return [];
    },
    async reset(): Promise<void> {},
    healthCheck() {
      return { status: "ok", detail: "disabled backend active" } as const;
    },
  };
}

// ── Scripted fake AgentRunner ────────────────────────────────────────────────

/** Records every prompt it was called with, in order, and answers deterministically from a caller-supplied map keyed by question id embedded in the prompt via a marker the test controls. */
function createRecordingAgent(answerFor: (prompt: string, callIndex: number) => string): {
  agent: AgentRunner;
  prompts: string[];
} {
  const prompts: string[] = [];
  const agent: AgentRunner = {
    async run(options: AgentRunOptions): Promise<AgentRunResult> {
      prompts.push(options.prompt);
      const text = answerFor(options.prompt, prompts.length - 1);
      return { ok: true, text, usage: { input: 10, output: 2, total: 12 }, latencyMs: 5 };
    },
  };
  return { agent, prompts };
}

// ── Test dataset fixture ─────────────────────────────────────────────────────

function writeDatasetFixture(dir: string): string {
  const datasetPath = path.resolve(dir, "dataset.json");
  const rows = [
    {
      question_id: "q1",
      question_type: "single-session-user",
      question: "What is the user's favorite color?",
      answer: "blue",
      haystack_sessions: [
        [{ role: "user", content: "My favorite color is blue." }],
        [{ role: "user", content: "I like hiking on weekends." }],
      ],
      haystack_session_ids: ["q1-s1", "q1-s2"],
      haystack_dates: ["2024-01-01T00:00", "2024-01-02T00:00"],
      answer_session_ids: ["q1-s1"],
    },
    {
      question_id: "q2",
      question_type: "multi-session",
      question: "What hobby did the user mention?",
      answer: "painting",
      haystack_sessions: [[{ role: "user", content: "I enjoy painting on weekends." }]],
      haystack_session_ids: ["q2-s1"],
      haystack_dates: ["2024-02-01T00:00"],
      answer_session_ids: ["q2-s1"],
    },
  ];
  fs.writeFileSync(datasetPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  return datasetPath;
}

function buildContext(
  outputDir: string,
  datasetPath: string,
  extraPackConfig: Record<string, unknown> = {},
) {
  const config: EvalConfig = { version: 1, runs: [] };
  const run: RunDefinition = {
    pack: "longmemeval",
    variant: "test",
    outputDir,
    packConfig: {
      datasetPath,
      evaluatorCommand: fakeEvaluatorCommand,
      evaluatorModel: "fake-model",
      ...extraPackConfig,
    },
  };
  return createRunContext(rootDir, config, run);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("longmemeval adapter: retrieval wiring", () => {
  test("memory-backed arm adds haystack sessions once per instance, searches with the right query/topK, builds context from exactly the retrieved text, and scores retrieval metrics against evidence session ids", async () => {
    const outputDir = tempDir("akm-eval-longmemeval-retrieval-");
    const datasetPath = writeDatasetFixture(outputDir);

    // q1: two results, one relevant ("q1-s1", the real answer_session_ids entry).
    // q2: zero results -- the zero-hit case.
    const scriptedResults: MemorySearchResult[][] = [
      [
        { id: "q1-s1", text: "hit", score: 1, metadata: {} },
        { id: "q1-s2", text: "miss", score: 1, metadata: {} },
      ],
      [],
    ];
    const { backend, calls } = createScriptedMemoryBackend(scriptedResults);
    const { agent, prompts } = createRecordingAgent(() => "some answer");

    const context = buildContext(outputDir, datasetPath, { topK: 2 });
    const result = await longMemEvalAdapter.run(context, backend, agent);

    // -- sessions added once per instance (not once per session/turn) --
    expect(calls.addCalls.length).toBe(2);
    expect(calls.addCalls[0]).toEqual([
      sessionToMemoryDocument({
        sessionId: "q1-s1",
        timestamp: "2024-01-01T00:00",
        turns: [{ role: "user", content: "My favorite color is blue." }],
      }),
      sessionToMemoryDocument({
        sessionId: "q1-s2",
        timestamp: "2024-01-02T00:00",
        turns: [{ role: "user", content: "I like hiking on weekends." }],
      }),
    ]);
    expect(calls.addCalls[1]).toEqual([
      sessionToMemoryDocument({
        sessionId: "q2-s1",
        timestamp: "2024-02-01T00:00",
        turns: [{ role: "user", content: "I enjoy painting on weekends." }],
      }),
    ]);

    // -- search called with the right query text and configured topK --
    expect(calls.searchCalls).toEqual([
      { text: "What is the user's favorite color?", topK: 2 },
      { text: "What hobby did the user mention?", topK: 2 },
    ]);

    // -- reset() is called once per instance too (each question gets an isolated backend state) --
    // (one top-level reset() before the loop, plus one per question = 3 total)
    expect(calls.resetCount).toBe(3);

    // -- prompt sent to the model contains EXACTLY the retrieved text, nothing else --
    expect(prompts[0]).toBe(
      buildRetrievedPrompt(
        questionStub({ question: "What is the user's favorite color?" }),
        scriptedResults[0] ?? [],
      ),
    );
    expect(prompts[0]).toContain("hit\n\nmiss");
    expect(prompts[1]).toBe(
      buildRetrievedPrompt(questionStub({ question: "What hobby did the user mention?" }), []),
    );

    // -- retrieval metrics, hand-computed --
    // q1: evidence=['q1-s1'], results=[hit q1-s1, miss q1-s2], topK=2
    //   hits = [q1-s1] -> precisionAtK = 1/2 = 0.5, recallAtK = 1/1 = 1
    //   first relevant hit at rank 1 -> mrr = 1
    //   dcg = 1/log2(2) = 1 (rank1 relevant) + 0 (rank2 not relevant) = 1
    //   ideal = min(relevant.size=1, limited.length=2) = 1 term = 1/log2(2) = 1 -> ndcgAtK = 1
    // q2: evidence=['q2-s1'], results=[], topK=2
    //   limited=[] -> precisionAtK = 0; recallAtK = 0/1 = 0; mrr = 0; ideal = 0 terms -> ndcgAtK = 0
    // averaged: queryCount sums to 2; the four ratios are the mean of the two per-question values
    expect(result.metrics.retrieval).toEqual({
      queryCount: 2,
      precisionAtK: 0.25, // (0.5 + 0) / 2
      recallAtK: 0.5, // (1 + 0) / 2
      mrr: 0.5, // (1 + 0) / 2
      ndcgAtK: 0.5, // (1 + 0) / 2
    });

    // -- zero-hit warning: 1/2 = 50% >= threshold --
    expect(
      result.warnings.some((w) => w.includes("1/2 retrieval queries returned zero hits")),
    ).toBe(true);
    expect(result.metadata?.retrievalQueryCount).toBe(2);
    expect(result.metadata?.zeroHitQueries).toBe(1);
    expect(result.metadata?.zeroHitQueryRate).toBe(0.5);
    expect(result.metadata?.baselineIsLongContext).toBe(false);
    expect(result.metadata?.topK).toBe(2);

    // -- never-queried tripwire must NOT fire on the wired path --
    expect(result.warnings.some((w) => w.includes("NEVER QUERIED"))).toBe(false);
  });

  test("disabled-backend (baseline) arm is byte-identical to the pre-retrieval-wiring full-haystack prompt and never touches the memory backend", async () => {
    const outputDir = tempDir("akm-eval-longmemeval-baseline-");
    const datasetPath = writeDatasetFixture(outputDir);

    const { backend, calls } = spyOnBackend(createNoneBackendForTest());
    const { agent, prompts } = createRecordingAgent(() => "blue");

    const context = buildContext(outputDir, datasetPath);
    const result = await longMemEvalAdapter.run(context, backend, agent);

    // The backend is reset() once up front (parity with every other arm's
    // health/reset path) but add()/search() are NEVER called on this arm.
    expect(calls.addCalls.length).toBe(0);
    expect(calls.searchCalls.length).toBe(0);

    // Reconstructed independently of buildFullContextPrompt, matching the
    // exact literal prompt shape this adapter used before it routed
    // retrieval through a memory backend at all -- a true "byte identical to
    // before" pin, not just a check against the refactored helper.
    const expectedPrompt = [
      "Conversation history:",
      "user: My favorite color is blue.\nuser: I like hiking on weekends.",
      "",
      "Question: What is the user's favorite color?",
      "Answer with only the minimal factual answer needed.",
      "Do not add explanation, markdown, qualifiers, or extra context.",
      "If the answer is not in the conversation history, answer exactly: I don't know",
      "Answer:",
    ].join("\n");
    expect(prompts[0]).toBe(expectedPrompt);
    expect(prompts[0]).toBe(
      buildFullContextPrompt(
        questionStub({
          conversation: [
            { role: "user", content: "My favorite color is blue." },
            { role: "user", content: "I like hiking on weekends." },
          ],
          question: "What is the user's favorite color?",
        }),
      ),
    );

    expect(calls.resetCount).toBe(1);
    expect(result.warnings).toEqual([]);
    expect(result.metrics.retrieval).toEqual({
      queryCount: 0,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      ndcgAtK: 0,
    });
    expect(result.metadata?.baselineIsLongContext).toBe(true);
    expect(result.metadata).not.toHaveProperty("retrievalQueryCount");
  });

  test("a dataset with no answer_session_ids is disclosed, not published as a measured zero", async () => {
    // scoreRetrieval keys every metric on membership in evidenceSessionIds, so
    // a dataset carrying no `answer_session_ids` scores a hard 0 on all four
    // regardless of what the backend retrieved. Here the backend retrieves the
    // CORRECT session on every query and still scores 0.000 across the board --
    // if that ships without disclosure it reads as total retrieval failure,
    // and zeroHitQueries=0 actively suggests retrieval was healthy. Per the
    // repo trust policy the run must say so in result.json itself.
    const outputDir = tempDir("akm-eval-longmemeval-no-evidence-");
    const datasetPath = path.resolve(outputDir, "dataset.json");
    fs.writeFileSync(
      datasetPath,
      `${JSON.stringify(
        [
          {
            question_id: "n1",
            question_type: "single-session-user",
            question: "What is the user's favorite color?",
            answer: "blue",
            haystack_sessions: [
              [{ role: "user", content: "My favorite color is blue." }],
              [{ role: "user", content: "I like hiking." }],
            ],
            haystack_session_ids: ["n1-s1", "n1-s2"],
            // NOTE: no answer_session_ids -- the whole point of this fixture.
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    // Perfect retrieval: the evidence-bearing session, at rank 1, every time.
    const { backend } = createScriptedMemoryBackend([
      [{ id: "n1-s1", text: "user: My favorite color is blue.", score: 1, metadata: {} }],
    ]);
    const { agent } = createRecordingAgent(() => "blue");

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath),
      backend,
      agent,
    );

    // The metrics really are all zero, and the answer really did pass...
    expect(result.metrics.retrieval).toEqual({
      queryCount: 1,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      ndcgAtK: 0,
    });
    expect(result.metrics.answer.judgedPass).toBe(1);
    expect(result.metadata?.zeroHitQueries).toBe(0);

    // ...so the run MUST disclose that those zeros are structural, not measured.
    expect(result.metadata?.questionsWithoutEvidenceLabels).toBe(1);
    expect(result.metadata?.retrievalMetricsScoreable).toBe(false);
    expect(
      result.warnings.some(
        (w) =>
          w.includes("carry NO ground-truth evidence session ids") &&
          w.includes("NOT a measurement of retrieval quality"),
      ),
    ).toBe(true);
    expect(result.notes.some((n) => n.includes("no ground-truth evidence session ids"))).toBe(true);
  });

  test("a fully-labelled dataset reports retrieval metrics as scoreable and raises no evidence warning", async () => {
    const outputDir = tempDir("akm-eval-longmemeval-evidence-ok-");
    const datasetPath = writeDatasetFixture(outputDir);
    const { backend } = createScriptedMemoryBackend([
      [{ id: "q1-s1", text: "hit", score: 1, metadata: {} }],
      [{ id: "q2-s1", text: "hit", score: 1, metadata: {} }],
    ]);
    const { agent } = createRecordingAgent(() => "answer");

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath, { topK: 2 }),
      backend,
      agent,
    );

    expect(result.metadata?.questionsWithoutEvidenceLabels).toBe(0);
    expect(result.metadata?.retrievalMetricsScoreable).toBe(true);
    expect(result.warnings.some((w) => w.includes("ground-truth evidence session ids"))).toBe(
      false,
    );
    expect(result.notes.some((n) => n.includes("no ground-truth evidence session ids"))).toBe(
      false,
    );
    // and the metrics are genuinely non-zero, i.e. really measured
    expect(result.metrics.retrieval.recallAtK).toBe(1);
  });

  test("never-queried tripwire fires if a non-disabled arm somehow asks zero questions (retrievalQueryCount stays 0)", async () => {
    const outputDir = tempDir("akm-eval-longmemeval-tripwire-");
    const datasetPath = writeDatasetFixture(outputDir);

    const { backend, calls } = createScriptedMemoryBackend([]);
    const { agent, prompts } = createRecordingAgent(() => "unused");

    // A category filter matching nothing in the fixture drives questions.length to 0,
    // so the retrieval loop body never runs and retrievalQueryCount stays 0 --
    // exactly the condition the tripwire warning exists to catch.
    const context = buildContext(outputDir, datasetPath, { questionCategories: ["temporal"] });
    const result = await longMemEvalAdapter.run(context, backend, agent);

    expect(prompts.length).toBe(0);
    expect(calls.addCalls.length).toBe(0);
    expect(calls.searchCalls.length).toBe(0);
    expect(result.status).toBe("warning");
    expect(
      result.warnings.some(
        (w) =>
          w.includes("NEVER QUERIED") &&
          w.includes("Do not publish this run as evidence about the backend."),
      ),
    ).toBe(true);
    expect(result.metadata?.retrievalQueryCount).toBe(0);
  });

  test("a thrown memory.search() propagates out of run() instead of silently falling back to full-context", async () => {
    // Per this repo's trust policy ("no silent fallback"): if the configured
    // backend errors, the run must fail loudly, not quietly answer from
    // question.conversation as if memory.kind were 'disabled'.
    const outputDir = tempDir("akm-eval-longmemeval-search-throws-");
    const datasetPath = writeDatasetFixture(outputDir);

    const backend: MemoryBackend = {
      id: "fake-throwing",
      kind: "external",
      async reset() {},
      async add() {},
      async search() {
        throw new Error("simulated backend outage");
      },
      healthCheck() {
        return { status: "ok", detail: "fake" } as const;
      },
    };
    const { agent, prompts } = createRecordingAgent(() => "unused");

    await expect(
      longMemEvalAdapter.run(buildContext(outputDir, datasetPath), backend, agent),
    ).rejects.toThrow("simulated backend outage");
    // No agent call happened for the question whose search() threw -- confirms
    // the failure aborted before ever reaching buildFullContextPrompt.
    expect(prompts.length).toBe(0);
  });

  test("sessionToMemoryDocument does not leak timestamp into indexed metadata (only sessionId)", () => {
    // akm turns every metadata entry into a searchable tag (metadataToTags in
    // src/memory/backends/akm.ts) while raw-vector ignores metadata entirely --
    // a `timestamp` tag would be a harness-supplied surface only the akm arm
    // could match against, for reasons unrelated to either backend's actual
    // memory quality. Pinning this here so a future edit that re-adds it is
    // caught by this test's own assertion, not just by the adapter test above
    // that happens to build its expectations through the same function.
    const doc = sessionToMemoryDocument({
      sessionId: "s1",
      timestamp: "2024-01-01T00:00",
      turns: [{ role: "user", content: "hi" }],
    });
    expect(doc.metadata).toEqual({ sessionId: "s1" });
    expect(doc.metadata).not.toHaveProperty("timestamp");
  });

  test("evidence session ids that match none of the question's own haystack session ids are disclosed, not silently zeroed", async () => {
    // Reproduces the id-namespace-mismatch hazard: answer_session_ids present
    // (real dataset ids) but haystack_session_ids absent, so haystackSessions
    // gets synthesized fallback ids (`${question_id}-session-${i}`) that share
    // nothing with evidenceSessionIds. Without disclosure this silently scores
    // 0 on every retrieval metric even when the backend retrieves perfectly.
    const outputDir = tempDir("akm-eval-longmemeval-unmatchable-evidence-");
    const datasetPath = path.resolve(outputDir, "dataset.json");
    fs.writeFileSync(
      datasetPath,
      `${JSON.stringify(
        [
          {
            question_id: "q1",
            question_type: "single-session-user",
            question: "What is the favorite color?",
            answer: "blue",
            haystack_sessions: [[{ role: "user", content: "My favorite color is blue." }]],
            // NOTE: no haystack_session_ids -- sessionId synthesizes to 'q1-session-0'.
            answer_session_ids: ["sess_real_1"], // real dataset id namespace, never equal to the synthesized id.
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    // Perfect retrieval: the only session, at rank 1, every time.
    const { backend } = createScriptedMemoryBackend([
      [{ id: "q1-session-0", text: "user: My favorite color is blue.", score: 1, metadata: {} }],
    ]);
    const { agent } = createRecordingAgent(() => "blue");

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath),
      backend,
      agent,
    );

    expect(result.metrics.retrieval).toEqual({
      queryCount: 1,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      ndcgAtK: 0,
    });
    expect(result.metadata?.questionsWithUnmatchableEvidenceLabels).toBe(1);
    expect(result.metadata?.questionsWithoutEvidenceLabels).toBe(0);
    expect(result.metadata?.retrievalMetricsScoreable).toBe(false);
    expect(
      result.warnings.some((w) => w.includes("match NONE") && w.includes("id-namespace mismatch")),
    ).toBe(true);
  });

  test("a normalized dataset item with no session boundaries discloses that its haystack was synthesized into one document", async () => {
    const outputDir = tempDir("akm-eval-longmemeval-synthesized-haystack-");
    const datasetPath = path.resolve(outputDir, "dataset.json");
    fs.writeFileSync(
      datasetPath,
      `${JSON.stringify(
        [
          {
            id: "n1",
            category: "single-session",
            conversation: [
              { role: "user", content: "My favorite color is blue." },
              { role: "user", content: "I like hiking." },
            ],
            question: "What is the favorite color?",
            expectedAnswer: "blue",
            // NOTE: no haystackSessions -- triggers the single-synthetic-session fallback.
            // question_id/answer are ALSO set (even though this is the
            // normalized item shape) purely so the fake evaluator fixture --
            // which keys strictly on question_id/answer like the real
            // scripts/longmemeval-evaluator.py does -- can score this row;
            // isNormalizedItem only inspects id/category/conversation/
            // question/expectedAnswer, so these extra fields don't change
            // which dataset.ts branch loads this file.
            question_id: "n1",
            answer: "blue",
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    const { backend, calls } = createScriptedMemoryBackend([
      [
        {
          id: "n1-session-0",
          text: "user: My favorite color is blue.\nuser: I like hiking.",
          score: 1,
          metadata: {},
        },
      ],
    ]);
    const { agent } = createRecordingAgent(() => "blue");

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath),
      backend,
      agent,
    );

    // Exactly one document -- the whole haystack -- was added.
    expect(calls.addCalls[0]?.length).toBe(1);
    expect(result.metadata?.questionsWithSynthesizedHaystack).toBe(1);
    expect(
      result.warnings.some(
        (w) =>
          w.includes("no session boundaries") &&
          w.includes("indistinguishable from the full-context baseline"),
      ),
    ).toBe(true);
  });

  test("reports avgResultsReturned and thisArmContextMode in metadata for both arms", async () => {
    const outputDir = tempDir("akm-eval-longmemeval-context-mode-");
    const datasetPath = writeDatasetFixture(outputDir);
    const { backend } = createScriptedMemoryBackend([
      [{ id: "q1-s1", text: "hit", score: 1, metadata: {} }],
      [],
    ]);
    const { agent } = createRecordingAgent(() => "answer");

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath, { topK: 2 }),
      backend,
      agent,
    );
    expect(result.metadata?.avgResultsReturned).toBe(0.5); // (1 + 0) / 2
    expect(result.metadata?.thisArmContextMode).toBe("retrieved-only");

    const { backend: noneBackend } = spyOnBackend(createNoneBackendForTest());
    const { agent: agent2 } = createRecordingAgent(() => "answer");
    const baselineResult = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath),
      noneBackend,
      agent2,
    );
    expect(baselineResult.metadata?.thisArmContextMode).toBe("full-haystack");
  });

  test('discloses abstentionQuestionCount when the dataset contains "_abs" question ids, on every arm', async () => {
    const outputDir = tempDir("akm-eval-longmemeval-abstention-");
    const datasetPath = path.resolve(outputDir, "dataset.json");
    fs.writeFileSync(
      datasetPath,
      `${JSON.stringify(
        [
          {
            question_id: "q1_abs",
            question_type: "single-session-user",
            question: "What is the favorite color?",
            answer: "I don't know",
            haystack_sessions: [[{ role: "user", content: "Unrelated content." }]],
            haystack_session_ids: ["q1-s1"],
            answer_session_ids: [],
          },
        ],
        null,
        2,
      )}\n`,
      "utf8",
    );

    const { backend } = createScriptedMemoryBackend([[]]);
    const { agent } = createRecordingAgent(() => "I don't know");

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath),
      backend,
      agent,
    );
    expect(result.metadata?.abstentionQuestionCount).toBe(1);
    expect(result.notes.some((n) => n.includes("abstention") && n.includes("confound"))).toBe(true);
  });
});

// ── Transient-provider-failure disclosure (itlackey/akm-eval#4) ──────────────

describe("longmemeval adapter: agent retry disclosure", () => {
  test("sums the runner's retries into metadata.agentRetryCount", async () => {
    const outputDir = tempDir("akm-eval-longmemeval-retries-");
    const datasetPath = writeDatasetFixture(outputDir);
    const { backend } = createScriptedMemoryBackend([
      [{ id: "q1-s1", text: "hit", score: 1, metadata: {} }],
      [{ id: "q2-s1", text: "hit", score: 1, metadata: {} }],
    ]);
    // Two questions in the fixture, each answered only after two retries
    // through transient provider failures.
    const agent: AgentRunner = {
      async run(): Promise<AgentRunResult> {
        return {
          ok: true,
          text: "some answer",
          usage: { input: 10, output: 2, total: 12 },
          latencyMs: 5,
          retries: 2,
        };
      },
    };

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath, { topK: 2 }),
      backend,
      agent,
    );

    expect(result.metadata?.agentRetryCount).toBe(4);
  });

  test("records agentRetryCount 0 on a clean run rather than omitting the field", async () => {
    const outputDir = tempDir("akm-eval-longmemeval-noretries-");
    const datasetPath = writeDatasetFixture(outputDir);
    const { backend } = createScriptedMemoryBackend([
      [{ id: "q1-s1", text: "hit", score: 1, metadata: {} }],
      [{ id: "q2-s1", text: "hit", score: 1, metadata: {} }],
    ]);
    const { agent } = createRecordingAgent(() => "some answer");

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath, { topK: 2 }),
      backend,
      agent,
    );

    expect(result.metadata?.agentRetryCount).toBe(0);
  });

  test("reports the lexical answer metrics it does not compute as null, not as a measured 0, and leaves judgedPass/aggregate.score untouched", async () => {
    // LongMemEval scores on its official LLM judge and computes no lexical
    // overlap at all. Reporting exactMatch/tokenF1/containsExpected as 0 made
    // a byte-identical, judge-passing answer read as having zero token overlap
    // with gold -- a flat contradiction -- and invited comparison against
    // LoCoMo's genuinely measured tokenF1. `null` is "not computed"; only a
    // number means "measured".
    const outputDir = tempDir("akm-eval-longmemeval-na-metrics-");
    const datasetPath = writeDatasetFixture(outputDir);
    const { backend } = createScriptedMemoryBackend([
      [{ id: "q1-s1", text: "hit", score: 1, metadata: {} }],
      [{ id: "q2-s1", text: "hit", score: 1, metadata: {} }],
    ]);
    // The fake evaluator judges by substring containment, so echoing gold back
    // verbatim passes the judge on every question.
    const { agent } = createRecordingAgent((prompt) =>
      prompt.includes("q1") || prompt.includes("blue") ? "blue" : "hiking",
    );

    const result = await longMemEvalAdapter.run(
      buildContext(outputDir, datasetPath, { topK: 2 }),
      backend,
      agent,
    );

    expect(result.metrics.answer.exactMatch).toBeNull();
    expect(result.metrics.answer.tokenF1).toBeNull();
    expect(result.metrics.answer.containsExpected).toBeNull();

    // The judge score is the real signal and must be unchanged by this: still
    // a number, still equal to the aggregate score.
    expect(typeof result.metrics.answer.judgedPass).toBe("number");
    expect(result.metrics.answer.judgedPass).toBe(result.metrics.aggregate.score);
    expect(result.metadata?.overallAccuracy).toBe(result.metrics.aggregate.score);
  });
});
