import fs from "node:fs";
import path from "node:path";
import { ArtifactStore } from "../../core/artifact-store.ts";
import { BenchmarkRuntimeError } from "../../core/errors.ts";
import type { RunContext } from "../../core/run-context.ts";
import type { NormalizedRunResult } from "../../core/types.ts";
import { averageRetrieval, scoreRetrieval } from "../../memory/retrieval-metrics.ts";
import type { MemoryDocument, MemorySearchResult, RetrievalMetrics } from "../../memory/types.ts";
import { markdownReportForResult } from "../../reporting/markdown.ts";
import { requireAgentRunner, requireExistingFile } from "../runtime-requirements.ts";
import type { PackAdapter } from "../types.ts";
import {
  type LongMemEvalQuestion,
  type LongMemEvalSession,
  loadDataset,
  resolveDatasetFile,
} from "./dataset.ts";

interface LongMemEvalPackConfig {
  datasetPath?: string;
  maxQuestions?: number;
  questionCategories?: string[];
  smoke?: boolean;
  evaluatorCommand?: string;
  evaluatorModel?: string;
  predictionsPath?: string;
  evaluationLogPath?: string;
  topK?: number;
}

const DEFAULT_TOP_K = 5;

interface EvaluationLogEntry {
  question_id?: string;
  autoeval_label?: {
    model?: string;
    label?: boolean;
  };
}

function isOpenAICompatibleConfig(
  config: unknown,
): config is { type: "openai-compatible"; baseURL?: string; apiKey?: string } {
  return (
    typeof config === "object" &&
    config !== null &&
    (config as { type?: string }).type === "openai-compatible"
  );
}

function runCommand(
  command: string,
  cwd: string,
  env: Record<string, string | undefined>,
): { stdout: string; stderr: string; exitCode: number } {
  const proc = Bun.spawnSync(["bash", "-lc", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env,
  });

  return {
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
    exitCode: proc.exitCode,
  };
}

function readJsonLines(filePath: string): EvaluationLogEntry[] {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EvaluationLogEntry);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveEvaluationLogPath(evalStdout: string, fallbackPath: string): string {
  const candidate = evalStdout
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .at(-1);
  return candidate && fs.existsSync(candidate) ? candidate : fallbackPath;
}

function evaluatorWrapperPath(rootDir: string): string {
  return path.resolve(rootDir, "scripts/longmemeval-evaluator.py");
}

const ANSWER_INSTRUCTIONS = [
  "Answer with only the minimal factual answer needed.",
  "Do not add explanation, markdown, qualifiers, or extra context.",
  "If the answer is not in the conversation history, answer exactly: I don't know",
  "Answer:",
];

/**
 * The disabled-backend (baseline) arm's prompt: the FULL haystack, flattened,
 * placed directly in the prompt. Unchanged from before this pack routed
 * retrieval through a memory backend -- this is the asymmetry the akm-ab
 * config's notes call out deliberately: the baseline arm answers from
 * everything, the memory-backed arms answer from only what they retrieved.
 */
export function buildFullContextPrompt(question: LongMemEvalQuestion): string {
  const conversationHistory = question.conversation
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");
  return [
    "Conversation history:",
    conversationHistory,
    "",
    `Question: ${question.question}`,
    ...ANSWER_INSTRUCTIONS,
  ].join("\n");
}

/**
 * Exact joined text of every retrieved session, in result order -- what the
 * retrieval-arm prompt's context section is built from and nothing else.
 * Exported so unit tests can assert the prompt contains exactly this.
 */
export function buildRetrievedContext(searchResults: MemorySearchResult[]): string {
  return searchResults.map((entry) => entry.text).join("\n\n");
}

/** The memory-backend arm's prompt: only the retrieved session excerpts, not the full haystack. */
export function buildRetrievedPrompt(
  question: LongMemEvalQuestion,
  searchResults: MemorySearchResult[],
): string {
  return [
    "Conversation history (retrieved excerpts, not the full haystack):",
    buildRetrievedContext(searchResults),
    "",
    `Question: ${question.question}`,
    ...ANSWER_INSTRUCTIONS,
  ].join("\n");
}

/**
 * One MemoryDocument per haystack session -- go through the backend's own
 * MemoryDocument/add() contract only, no akm-specific (or any other
 * backend-specific) code here. Text is rendered the same `role: content` way
 * the full-context prompt already renders turns, so the two arms differ only
 * in *which* text reaches the model, not in how a turn is formatted.
 *
 * Deliberately does NOT put `timestamp` in `metadata`: the akm backend turns
 * every metadata entry into an indexed, searchable tag (see
 * `metadataToTags` in src/memory/backends/akm.ts), while raw-vector only
 * ever vectorizes `document.text` and ignores metadata entirely. A
 * `timestamp:<date>` tag would therefore be a harness-supplied surface only
 * the akm arm can match against (e.g. a temporal-category question whose
 * text contains a date fragment) -- an asymmetry between the two compared
 * backends that has nothing to do with either system's actual memory
 * quality. `sessionId` is kept: it is already the document's own `id`, so it
 * gives akm no surface raw-vector's `id`-keyed results lack.
 */
export function sessionToMemoryDocument(session: LongMemEvalSession): MemoryDocument {
  return {
    id: session.sessionId,
    text: session.turns.map((turn) => `${turn.role}: ${turn.content}`).join("\n"),
    metadata: {
      sessionId: session.sessionId,
    },
  };
}

export const longMemEvalAdapter: PackAdapter = {
  id: "longmemeval",
  description:
    "LongMemEval using the official dataset and a configured official-evaluator command (default wrapper bundled in this repo).",
  checkInstalled(rootDir = process.cwd()) {
    return fs.existsSync(evaluatorWrapperPath(rootDir));
  },
  getDoctorDetail(rootDir = process.cwd()) {
    if (!fs.existsSync(evaluatorWrapperPath(rootDir))) {
      return {
        status: "warn" as const,
        detail:
          "repo-bundled LongMemEval evaluator wrapper missing at scripts/longmemeval-evaluator.py; runs need a configured evaluator command and this repo does not fall back to heuristic local judging.",
      };
    }
    return {
      status: "ok" as const,
      detail:
        "repo-bundled LongMemEval evaluator wrapper available at scripts/longmemeval-evaluator.py; runs still need pack.config.evaluatorCommand plus Python openai and OPENAI_BASE_URL or OPENAI_API_KEY in that evaluator environment.",
    };
  },
  async run(context, memory, agent): Promise<NormalizedRunResult> {
    const resolvedAgent = requireAgentRunner(agent, "longmemeval");
    const store = new ArtifactStore(context.outputDir);
    store.ensureDir();

    await memory.reset();

    const packConfig = (context.run.packConfig ?? {}) as LongMemEvalPackConfig;
    const evaluatorCommand =
      typeof packConfig.evaluatorCommand === "string" ? packConfig.evaluatorCommand : undefined;
    if (!evaluatorCommand) {
      throw new BenchmarkRuntimeError(
        "longmemeval requires `pack.config.evaluatorCommand` pointing at the official LongMemEval evaluation script or wrapper. " +
          "This repo no longer falls back to heuristic local scoring.",
      );
    }

    const datasetPath = await resolveDatasetFile(packConfig.datasetPath, context.rootDir);
    const questions = await loadDataset({
      rootDir: context.rootDir,
      datasetPath: packConfig.datasetPath,
      maxQuestions: packConfig.maxQuestions,
      questionCategories: packConfig.questionCategories,
      smoke: packConfig.smoke,
    });

    const topK =
      typeof packConfig.topK === "number" && packConfig.topK > 0 ? packConfig.topK : DEFAULT_TOP_K;

    const predictions = [] as Array<{
      question_id: string;
      hypothesis: string;
      retrieved_session_ids?: string[];
    }>;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalLatencyMs = 0;
    const retrievalMetrics: RetrievalMetrics[] = [];
    // Declared-ceiling disclosure (see docs/memory-backends.md and locomo's
    // adapter, the reference pattern this mirrors): a memory-backed retrieval
    // arm can score near-zero for reasons that have nothing to do with answer
    // quality -- e.g. a query the backend structurally cannot answer.
    // `zeroHitQueries` makes that visible in every published result rather
    // than leaving a reader to infer it from a low score alone.
    let zeroHitQueries = 0;
    let retrievalQueryCount = 0;
    // Transient provider failures the agent runner retried through
    // (itlackey/akm-eval#4). Recorded unconditionally so a clean run and a
    // run that needed retries are distinguishable in the artifact.
    let agentRetryCount = 0;
    // Second declared-ceiling disclosure, and a distinct failure mode from
    // zeroHitQueries: `scoreRetrieval` keys precision/recall/MRR/nDCG on
    // membership in `evidenceSessionIds`, so a question whose source dataset
    // carries no `answer_session_ids` scores a hard 0 on all four NO MATTER
    // WHAT the backend retrieved -- a backend that returned exactly the right
    // session every time still publishes 0.000 across the board. Without this
    // counter that reads as measured retrieval failure (and zeroHitQueries=0
    // actively suggests retrieval was healthy), when the truth is that there
    // was no ground truth to score against at all. Per this repo's trust
    // policy, that has to be machine-visible in result.json rather than
    // inferable only by cross-checking the dataset.
    let questionsWithoutEvidence = 0;
    // Third declared-ceiling disclosure: unlike questionsWithoutEvidence
    // (empty evidenceSessionIds), this counts questions whose evidence ids
    // ARE present but match NONE of that question's own haystack session
    // ids -- an id-namespace mismatch (e.g. `answer_session_ids` present
    // without a parallel `haystack_session_ids`, so sessionId gets
    // synthesized while evidenceSessionIds keeps the real dataset ids).
    // scoreRetrieval still scores these a hard 0 on all four retrieval
    // metrics, indistinguishable in the aggregate from genuine retrieval
    // failure, even when the backend retrieved the semantically-correct
    // session. See LongMemEvalQuestion.haystackSessionsSynthesized for the
    // sibling disclosure this pairs with.
    let questionsWithUnmatchableEvidence = 0;
    // Fourth declared-ceiling disclosure: a pre-normalized dataset item with
    // no session boundaries collapses to ONE document covering the entire
    // haystack (see loadDataset), so retrieval for that question can only
    // ever return the whole haystack or nothing -- the retrieved-context
    // prompt's "not the full haystack" framing does not hold for it.
    let questionsWithSynthesizedHaystack = 0;
    // Total results returned across every search() call, so a reader can see
    // whether this run's precisionAtK denominators (limited.length in
    // scoreRetrieval) actually tracked topK or came back thinner -- backends
    // differ systematically here (e.g. raw-vector always returns
    // min(topK, N) results with no relevance threshold; akm returns only
    // genuine hits, often fewer), which changes precisionAtK's denominator
    // independently of retrieval quality and makes cross-backend precisionAtK
    // comparisons misleading unless this is visible alongside them.
    let totalResultsReturned = 0;
    // LongMemEval's "_abs" (abstention) question ids are graded on whether
    // the model correctly declines to answer, not on factual recall -- a
    // question this pack does not otherwise separate out. Disclosed here so
    // a reader comparing this run's overallAccuracy against a full-context
    // baseline knows a retrieval arm handed less context can score BETTER on
    // these purely because it has less surface to hallucinate from, which is
    // the inverse of (and separate from) the retrieval-loses-the-answer risk
    // this pack already discloses elsewhere.
    const abstentionQuestionCount = questions.filter((question) =>
      question.id.endsWith("_abs"),
    ).length;

    for (const question of questions) {
      let searchResults: MemorySearchResult[] = [];
      let prompt: string;

      if (memory.kind === "disabled") {
        prompt = buildFullContextPrompt(question);
      } else {
        // Each LongMemEval question IS its own instance, with its own
        // haystack -- unlike locomo, where several questions share one
        // sample's conversation. So the reset()+add() unit here is
        // per-question, not per-batch: every question gets an isolated
        // backend state containing only its own haystack sessions.
        await memory.reset();
        await memory.add(question.haystackSessions.map(sessionToMemoryDocument));
        searchResults = await memory.search({ text: question.question, topK });
        prompt = buildRetrievedPrompt(question, searchResults);
        retrievalMetrics.push(scoreRetrieval(question.evidenceSessionIds, searchResults, topK));
        retrievalQueryCount += 1;
        totalResultsReturned += searchResults.length;
        if (searchResults.length === 0) zeroHitQueries += 1;
        if (question.evidenceSessionIds.length === 0) {
          questionsWithoutEvidence += 1;
        } else {
          const haystackSessionIds = new Set(
            question.haystackSessions.map((session) => session.sessionId),
          );
          if (!question.evidenceSessionIds.some((id) => haystackSessionIds.has(id))) {
            questionsWithUnmatchableEvidence += 1;
          }
        }
        if (question.haystackSessionsSynthesized) questionsWithSynthesizedHaystack += 1;
      }

      const agentResult = await resolvedAgent.run({ prompt });
      if (!agentResult.ok) {
        throw new BenchmarkRuntimeError(
          `longmemeval agent run failed for ${question.id}: ${agentResult.error ?? "unknown error"}`,
        );
      }

      agentRetryCount += agentResult.retries ?? 0;
      totalPromptTokens += agentResult.usage?.input ?? 0;
      totalCompletionTokens += agentResult.usage?.output ?? 0;
      totalTokens += agentResult.usage?.total ?? 0;
      totalLatencyMs += agentResult.latencyMs;

      predictions.push({
        question_id: question.id,
        hypothesis: agentResult.text,
        ...(memory.kind !== "disabled"
          ? { retrieved_session_ids: searchResults.map((entry) => entry.id) }
          : {}),
      });
    }

    const predictionsPath = path.resolve(
      context.outputDir,
      typeof packConfig.predictionsPath === "string"
        ? packConfig.predictionsPath
        : "predictions.jsonl",
    );
    requireExistingFile(
      datasetPath,
      "longmemeval requires a concrete dataset file for the official evaluator.",
    );

    fs.writeFileSync(
      predictionsPath,
      `${predictions.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );

    const evaluatorModel =
      typeof packConfig.evaluatorModel === "string" ? packConfig.evaluatorModel : "gpt-4o";
    const evaluatorEnv: Record<string, string | undefined> = { ...process.env };
    const provider = context.run.agentProviderConfig;
    if (isOpenAICompatibleConfig(provider)) {
      if (provider.baseURL) {
        evaluatorEnv.OPENAI_BASE_URL = provider.baseURL;
      }
      if (provider.apiKey !== undefined) {
        evaluatorEnv.OPENAI_API_KEY = provider.apiKey;
      }
    }
    const evalResult = runCommand(
      `${evaluatorCommand} ${JSON.stringify(evaluatorModel)} ${JSON.stringify(predictionsPath)} ${JSON.stringify(datasetPath)}`,
      context.rootDir,
      evaluatorEnv,
    );
    if (evalResult.exitCode !== 0) {
      throw new BenchmarkRuntimeError(
        `longmemeval official evaluator failed with exit code ${evalResult.exitCode}. stderr: ${evalResult.stderr || "(empty)"}`,
      );
    }

    const configuredEvaluationLogPath =
      typeof packConfig.evaluationLogPath === "string"
        ? path.resolve(context.rootDir, packConfig.evaluationLogPath)
        : `${predictionsPath}.eval-results-${evaluatorModel}`;
    const evaluationLogPath = requireExistingFile(
      resolveEvaluationLogPath(evalResult.stdout, configuredEvaluationLogPath),
      "longmemeval official evaluator did not produce the expected evaluation log.",
    );

    const evaluationEntries = readJsonLines(evaluationLogPath);
    if (evaluationEntries.length !== questions.length) {
      // A partially-completed evaluator run would otherwise silently average
      // over a smaller, unannounced denominator — a plausible-looking score
      // hiding a real coverage gap. Fail loud instead.
      throw new BenchmarkRuntimeError(
        `longmemeval evaluation log at ${evaluationLogPath} has ${evaluationEntries.length} entries but ${questions.length} question(s) were asked. Refusing to score a partial evaluation log silently.`,
      );
    }
    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const perQuestion = evaluationEntries.map((entry) => {
      const questionId = entry.question_id;
      if (!questionId) {
        throw new BenchmarkRuntimeError(
          `longmemeval evaluation log entry is missing question_id: ${JSON.stringify(entry)}`,
        );
      }
      const question = questionMap.get(questionId);
      if (!question) {
        throw new BenchmarkRuntimeError(
          `longmemeval evaluation log referenced unknown question_id: ${questionId}`,
        );
      }
      const passed = entry.autoeval_label?.label === true;
      return {
        questionId,
        category: question.category,
        expectedAnswer: question.expectedAnswer,
        actualAnswer:
          predictions.find((prediction) => prediction.question_id === questionId)?.hypothesis ?? "",
        passed,
      };
    });

    const overallAccuracy = average(perQuestion.map((entry) => (entry.passed ? 1 : 0)));
    const categories = new Map<string, number[]>();
    for (const entry of perQuestion) {
      const bucket = categories.get(entry.category) ?? [];
      bucket.push(entry.passed ? 1 : 0);
      categories.set(entry.category, bucket);
    }

    const perCategoryAccuracy = Object.fromEntries(
      [...categories.entries()].map(([category, values]) => [
        category,
        Number(average(values).toFixed(6)),
      ]),
    );

    const startedAt = context.startedAt.toISOString();
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(1, Date.parse(finishedAt) - Date.parse(startedAt));
    const score = Number(overallAccuracy.toFixed(6));

    const result: NormalizedRunResult = {
      schemaVersion: "1.0",
      runId: context.runId,
      pack: context.run.pack,
      variant: context.run.variant,
      memoryBackend: memory.id,
      status: perQuestion.length === 0 ? "warning" : overallAccuracy > 0 ? "passed" : "failed",
      startedAt,
      finishedAt,
      durationMs,
      // This adapter now routes every non-disabled-backend arm through
      // MemoryBackend.add()/search() per question (see the run loop above),
      // so retrievalQueryCount should equal questions.length on every such
      // arm -- retrievalQueryCount === 0 here should be impossible. The
      // warning below is a TRIPWIRE for a future regression (e.g. someone
      // adding an early-return that skips the retrieval branch), not the
      // expected path: per this repo's trust policy ("no silent fallback"),
      // if the backend really does go inert again, that must be
      // machine-visible in result.json/summary.md, not just in docs.
      warnings: [
        ...(memory.kind !== "disabled" && retrievalQueryCount === 0
          ? [
              `memory backend "${memory.id}" was configured but NEVER QUERIED: retrievalQueryCount is 0. This should be impossible now that this adapter routes retrieval through MemoryBackend.search() for every non-disabled run -- treat this as a regression in the adapter, not a property of the backend. Do not publish this run as evidence about the backend.`,
            ]
          : []),
        ...(memory.kind !== "disabled" &&
        retrievalQueryCount > 0 &&
        zeroHitQueries / retrievalQueryCount >= 0.5
          ? [
              `${zeroHitQueries}/${retrievalQueryCount} retrieval queries returned zero hits (>=50%). The aggregate score for this run is dominated by prompts with no retrieved context at all, not by answer quality on retrieved context. See metadata.zeroHitQueries / metadata.retrievalCeiling* before publishing this number.`,
            ]
          : []),
        ...(memory.kind !== "disabled" &&
        retrievalQueryCount > 0 &&
        questionsWithoutEvidence / retrievalQueryCount >= 0.5
          ? [
              `${questionsWithoutEvidence}/${retrievalQueryCount} scored questions carry NO ground-truth evidence session ids (>=50%), so their precision/recall/MRR/nDCG are 0 by construction regardless of what the backend actually retrieved. metrics.retrieval for this run is NOT a measurement of retrieval quality. This means the dataset in use is missing \`answer_session_ids\`; do not publish these retrieval numbers.`,
            ]
          : []),
        ...(memory.kind !== "disabled" && questionsWithUnmatchableEvidence > 0
          ? [
              `${questionsWithUnmatchableEvidence}/${retrievalQueryCount} scored questions have evidence session ids that match NONE of that question's own haystack session ids -- an id-namespace mismatch (e.g. \`answer_session_ids\` present without a parallel \`haystack_session_ids\`, so haystack session ids were synthesized while evidenceSessionIds kept the real dataset ids). Their precision/recall/MRR/nDCG score a hard 0 by construction even if retrieval found the semantically-correct session. This usually indicates a dataset-loading defect, not a retrieval failure. See metadata.questionsWithUnmatchableEvidenceLabels before publishing these retrieval numbers.`,
            ]
          : []),
        ...(memory.kind !== "disabled" && questionsWithSynthesizedHaystack > 0
          ? [
              `${questionsWithSynthesizedHaystack}/${retrievalQueryCount} questions had no session boundaries in the source dataset, so their ENTIRE haystack was added as one document. Retrieval for these questions can only return the whole haystack or nothing -- the "retrieved excerpts, not the full haystack" prompt framing does not hold for them, making this arm indistinguishable from the full-context baseline on those specific questions. See metadata.questionsWithSynthesizedHaystack before publishing this run as a retrieval-quality result.`,
            ]
          : []),
      ],
      notes: [
        `LongMemEval executed ${questions.length} question(s) and scored them with the official evaluator command.`,
        `Overall accuracy: ${(overallAccuracy * 100).toFixed(1)}%`,
        `Evaluator model: ${evaluatorModel}`,
        memory.kind === "disabled"
          ? "Full-haystack baseline: every question is answered from its entire haystack conversation, flattened into the " +
            'prompt -- not a "no memory" null arm in the retrieval-quality sense, since it differs from the retrieval ' +
            "arms in prompt construction and context length, not only in `memory.backend`."
          : `Memory-backed retrieval mode using topK=${topK}; each question resets the backend and adds only its own haystack sessions (one document per session) before searching. The full-haystack (\`none\`/disabled-backend) arm in this same comparison answers every question from its ENTIRE haystack -- a lower score here than that arm does not necessarily mean retrieval quality is worse; it can mean retrieval lost an answer a full-context baseline structurally cannot lose. See metadata.thisArmContextMode.`,
        ...(memory.kind !== "disabled" && retrievalQueryCount > 0
          ? [
              `Retrieval zero-hit rate: ${zeroHitQueries}/${retrievalQueryCount} queries returned no results ` +
                `(${((zeroHitQueries / retrievalQueryCount) * 100).toFixed(1)}%).`,
              `Average results returned per query: ${(totalResultsReturned / retrievalQueryCount).toFixed(2)} (topK=${topK}). precisionAtK is divided by the number of results actually returned, not by topK, so a backend that returns fewer results per query (e.g. akm returning only genuine hits) reports a structurally higher precisionAtK than a backend that always returns topK results (e.g. raw-vector, with no relevance threshold) for the same underlying retrieval quality. Do not compare precisionAtK across backends with different result-count behavior without accounting for this.`,
            ]
          : []),
        ...(memory.kind !== "disabled" && questionsWithoutEvidence > 0
          ? [
              `${questionsWithoutEvidence}/${retrievalQueryCount} scored questions have no ground-truth evidence session ids; those contribute 0 to every retrieval metric by construction, not by measurement.`,
            ]
          : []),
        ...(memory.kind !== "disabled" && questionsWithUnmatchableEvidence > 0
          ? [
              `${questionsWithUnmatchableEvidence}/${retrievalQueryCount} scored questions have evidence session ids that do not match any of that question's own haystack session ids; those also contribute 0 to every retrieval metric by construction, indistinguishable in the aggregate from a genuine retrieval miss.`,
            ]
          : []),
        ...(memory.kind !== "disabled" && questionsWithSynthesizedHaystack > 0
          ? [
              `${questionsWithSynthesizedHaystack}/${retrievalQueryCount} questions had their entire haystack synthesized into one document (no session boundaries in the source dataset); retrieval for those questions can only return everything or nothing.`,
            ]
          : []),
        ...(abstentionQuestionCount > 0
          ? [
              `${abstentionQuestionCount}/${questions.length} questions are abstention ("_abs") instances, graded on whether the model correctly declines to answer rather than on factual recall. A retrieval arm handed little or no context can abstain more easily than a full-context baseline with more surface to hallucinate from, so part of any overallAccuracy difference between arms on this dataset reflects that confound rather than answer quality alone. See metadata.abstentionQuestionCount.`,
            ]
          : []),
        ...(memory.id === "akm"
          ? [
              "akm declared retrieval ceiling: description/tags/heading synthesized from the first sentence(s) of each " +
                "session document (never full body prose); a fixed deterministic stopword strip is applied to each query " +
                "before it reaches akm's conjunctive-AND FTS; the seeded akm skeleton corpus is stripped before ingestion " +
                "so no foreign content can appear in results. See src/memory/backends/akm.ts and docs/memory-backends.md.",
            ]
          : []),
      ],
      metrics: {
        retrieval: averageRetrieval(retrievalMetrics),
        answer: {
          // Not computed by this pack, so reported as `null` rather than `0`:
          // reporting a metric that was never measured as a number makes it
          // indistinguishable from a measured zero. See AnswerMetrics.
          exactMatch: null,
          tokenF1: null,
          containsExpected: null,
          judgedPass: score,
        },
        aggregate: {
          score,
          retrievalWeight: 0,
          answerWeight: 1,
        },
      },
      telemetry: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens,
        estimatedCostUsd: 0,
        latencyMs: totalLatencyMs || durationMs,
        logs: [
          `pack=${context.run.pack}`,
          `variant=${context.run.variant}`,
          `memory=${memory.id}`,
          `questions=${questions.length}`,
          `evaluatorModel=${evaluatorModel}`,
        ],
      },
      artifacts: {
        resultPath: "",
        summaryPath: "",
        rawOutputPath: "",
      },
      metadata: {
        ...context.run.metadata,
        benchmarkId: path.basename(datasetPath, path.extname(datasetPath)),
        questionCount: questions.length,
        overallAccuracy: score,
        evaluatorCommand,
        evaluatorModel,
        predictionsPath,
        evaluationLogPath,
        topK,
        agentRetryCount,
        // `baselineIsLongContext` is per-run but named as a claim about the
        // whole comparison -- on a treatment arm it emits `false`, i.e. the
        // treatment arm's own artifact machine-asserts that the baseline is
        // NOT long-context, the inverse of the truth. Kept for backward
        // compatibility; `thisArmContextMode` below is the field a reader
        // should actually use, since it states this arm's own condition
        // directly rather than a claim about a different run.
        baselineIsLongContext: memory.kind === "disabled",
        thisArmContextMode: memory.kind === "disabled" ? "full-haystack" : "retrieved-only",
        abstentionQuestionCount,
        ...(memory.kind !== "disabled"
          ? {
              retrievalQueryCount,
              zeroHitQueries,
              zeroHitQueryRate:
                retrievalQueryCount > 0
                  ? Number((zeroHitQueries / retrievalQueryCount).toFixed(6))
                  : 0,
              avgResultsReturned:
                retrievalQueryCount > 0
                  ? Number((totalResultsReturned / retrievalQueryCount).toFixed(6))
                  : 0,
              questionsWithoutEvidenceLabels: questionsWithoutEvidence,
              questionsWithUnmatchableEvidenceLabels: questionsWithUnmatchableEvidence,
              questionsWithSynthesizedHaystack,
              retrievalMetricsScoreable:
                retrievalQueryCount > 0 &&
                questionsWithoutEvidence + questionsWithUnmatchableEvidence < retrievalQueryCount,
            }
          : {}),
        ...(memory.id === "akm"
          ? {
              retrievalCeilingSynthesisRule:
                "first-sentence(s)-capped-250-chars+metadata-tags+id-heading",
              retrievalCeilingQueryTransform: "fixed-deterministic-stopword-strip",
              retrievalCeilingSemanticSearchMode: "off",
              retrievalCeilingSeededCorpusStripped: true,
            }
          : {}),
        ...Object.fromEntries(
          Object.entries(perCategoryAccuracy).map(([key, value]) => [`accuracy_${key}`, value]),
        ),
      },
    };

    result.artifacts.rawOutputPath = store.writeJson("raw-output.json", {
      pack: "longmemeval",
      predictionsPath,
      datasetPath,
      evaluationLogPath,
      evaluatorCommand,
      evaluatorModel,
      evaluatorStdout: evalResult.stdout,
      evaluatorStderr: evalResult.stderr,
      results: perQuestion,
      perCategoryAccuracy,
    });
    result.artifacts.resultPath = path.resolve(store.baseDir, "result.json");
    result.artifacts.summaryPath = path.resolve(store.baseDir, "summary.md");
    store.writeJson("result.json", result);
    store.writeText("summary.md", markdownReportForResult(result));
    return result;
  },
};
