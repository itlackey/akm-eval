import fs from "node:fs";
import path from "node:path";
import { ArtifactStore } from "../../core/artifact-store.ts";
import { BenchmarkRuntimeError } from "../../core/errors.ts";
import { runEvaluatorCommand } from "../../core/evaluator-command.ts";
import type { RunContext } from "../../core/run-context.ts";
import type { NormalizedRunResult } from "../../core/types.ts";
import { describeMemoryProvenance } from "../../memory/provenance.ts";
import { averageRetrieval, scoreRetrieval } from "../../memory/retrieval-metrics.ts";
import type { MemoryDocument, MemorySearchResult, RetrievalMetrics } from "../../memory/types.ts";
import { markdownReportForResult } from "../../reporting/markdown.ts";
import { requireAgentRunner, requireExistingFile } from "../runtime-requirements.ts";
import type { PackAdapter } from "../types.ts";
import {
  type LongMemEvalCheckpointEntry,
  type LongMemEvalRetrievalProvenance,
  appendCheckpoint,
  createCheckpointIdentity,
  prepareCheckpoint,
  resolveCheckpointPath,
  sha256Text,
} from "./checkpoint.ts";
import {
  type LongMemEvalQuestion,
  type LongMemEvalSession,
  loadDataset,
  resolveDatasetFile,
} from "./dataset.ts";

interface LongMemEvalPackConfig {
  datasetPath?: string;
  maxQuestions?: number;
  sampleSeed?: number;
  questionCategories?: string[];
  smoke?: boolean;
  evaluatorCommand?: string;
  evaluatorModel?: string;
  predictionsPath?: string;
  evaluationLogPath?: string;
  topK?: number;
  /** Resume already-paid agent answers from a signature-bound per-question checkpoint (default true). */
  resume?: boolean;
  /** Relative path under the run output dir; defaults to a signature-specific `.checkpoints/` file. */
  checkpointPath?: string;
}

const DEFAULT_TOP_K = 5;

function evaluatorCodeSha256(): string {
  const repositoryRoot = path.resolve(import.meta.dir, "../../..");
  const files = [
    import.meta.filename,
    path.resolve(import.meta.dir, "checkpoint.ts"),
    path.resolve(import.meta.dir, "dataset.ts"),
    path.resolve(import.meta.dir, "../../agent/openai-compatible-runner.ts"),
    path.resolve(import.meta.dir, "../../agent/types.ts"),
    path.resolve(import.meta.dir, "../../memory/backends/akm.ts"),
    path.resolve(import.meta.dir, "../../memory/registry.ts"),
    path.resolve(import.meta.dir, "../../memory/types.ts"),
  ];
  return sha256Text(
    files
      .map((file) => `${path.relative(repositoryRoot, file)}\0${fs.readFileSync(file, "utf8")}`)
      .join("\0"),
  );
}

interface EvaluationLogEntry {
  question_id?: string;
  autoeval_label?: {
    model?: string;
    resolved_model?: string;
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

/**
 * Build the environment the official evaluator (the judge) runs under.
 *
 * The judge is part of the BENCHMARK; the agent is what we are measuring
 * (docs/comparability.md A4). They therefore may need different endpoints:
 * LongMemEval specifies `gpt-4o`, and the endpoint an agent arm runs on does
 * not necessarily serve it — opencode Zen, for instance, serves no gpt-4
 * family at all. Before this split the judge was pinned to whatever the agent
 * provider was, so a compliant judge was simply unreachable whenever the agent
 * ran anywhere other than cloud OpenAI.
 *
 * Precedence: explicit `AKM_EVAL_JUDGE_*` wins, then the agent provider (the
 * historical behaviour, still correct when both run on one endpoint), then
 * whatever `OPENAI_*` the ambient environment already carries.
 */
export function resolveJudgeEnv(
  processEnv: Record<string, string | undefined>,
  agentProvider?: { baseURL?: string; apiKey?: string },
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...processEnv };

  if (agentProvider) {
    if (agentProvider.baseURL) {
      env.OPENAI_BASE_URL = agentProvider.baseURL;
    }
    if (agentProvider.apiKey !== undefined) {
      env.OPENAI_API_KEY = agentProvider.apiKey;
    }
  }

  const judgeBaseUrl = processEnv.AKM_EVAL_JUDGE_BASE_URL;
  const judgeApiKey = processEnv.AKM_EVAL_JUDGE_API_KEY;

  if (judgeBaseUrl) {
    env.OPENAI_BASE_URL = judgeBaseUrl;
  }
  if (judgeApiKey) {
    env.OPENAI_API_KEY = judgeApiKey;
    // A judge key with no judge base URL means cloud OpenAI. Leaving the
    // agent's baseURL in place would send the judge key to the AGENT's
    // endpoint -- a credential sent to the wrong service, not just a
    // misconfiguration.
    if (!judgeBaseUrl) {
      env.OPENAI_BASE_URL = undefined;
    }
  }

  return env;
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

function normalizedLiteral(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * A transparent diagnostic proxy, not an answer-quality judge. It asks only
 * whether the normalized reference answer survived in the text handed to the
 * agent, so correct-parent / wrong-fragment failures are no longer hidden by
 * healthy session-level retrieval metrics.
 */
export function containsLiteralAnswer(context: string, expectedAnswer: string): boolean {
  const expected = normalizedLiteral(expectedAnswer);
  return expected.length > 0 && normalizedLiteral(context).includes(expected);
}

function metadataString(metadata: MemorySearchResult["metadata"], key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function metadataNumber(metadata: MemorySearchResult["metadata"], key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function retrievalProvenance(result: MemorySearchResult): LongMemEvalRetrievalProvenance {
  const metadata = result.metadata;
  const description = metadataString(metadata, "description");
  const nullableRef = (key: "previousRef" | "nextRef"): string | null | undefined => {
    const value = metadata?.[key];
    return value === null || typeof value === "string" ? value : undefined;
  };
  return {
    id: result.id,
    score: result.score,
    textChars: result.text.length,
    textEstimatedTokens: Math.max(1, Math.ceil(result.text.length / 4)),
    textSha256: sha256Text(result.text),
    ...(metadataString(metadata, "selectedRef")
      ? { selectedRef: metadataString(metadata, "selectedRef") }
      : {}),
    ...(metadataString(metadata, "parentRef")
      ? { parentRef: metadataString(metadata, "parentRef") }
      : {}),
    ...(metadataNumber(metadata, "fragmentOrdinal") !== undefined
      ? { fragmentOrdinal: metadataNumber(metadata, "fragmentOrdinal") }
      : {}),
    ...(metadataNumber(metadata, "fragmentCount") !== undefined
      ? { fragmentCount: metadataNumber(metadata, "fragmentCount") }
      : {}),
    ...(metadataNumber(metadata, "startLine") !== undefined
      ? { startLine: metadataNumber(metadata, "startLine") }
      : {}),
    ...(metadataNumber(metadata, "endLine") !== undefined
      ? { endLine: metadataNumber(metadata, "endLine") }
      : {}),
    ...(nullableRef("previousRef") !== undefined
      ? { previousRef: nullableRef("previousRef") }
      : {}),
    ...(nullableRef("nextRef") !== undefined ? { nextRef: nullableRef("nextRef") } : {}),
    ...(metadataNumber(metadata, "fragmentChars") !== undefined
      ? { fragmentChars: metadataNumber(metadata, "fragmentChars") }
      : {}),
    ...(metadataNumber(metadata, "fragmentEstimatedTokens") !== undefined
      ? { fragmentEstimatedTokens: metadataNumber(metadata, "fragmentEstimatedTokens") }
      : {}),
    ...(metadataNumber(metadata, "parentChars") !== undefined
      ? { parentChars: metadataNumber(metadata, "parentChars") }
      : {}),
    ...(metadataNumber(metadata, "parentEstimatedTokens") !== undefined
      ? { parentEstimatedTokens: metadataNumber(metadata, "parentEstimatedTokens") }
      : {}),
    ...(metadataString(metadata, "contextMode")
      ? { contextMode: metadataString(metadata, "contextMode") }
      : {}),
    ...(metadataNumber(metadata, "contextMaxChars") !== undefined
      ? { contextMaxChars: metadataNumber(metadata, "contextMaxChars") }
      : {}),
    ...(typeof metadata?.contextTruncated === "boolean"
      ? { contextTruncated: metadata.contextTruncated }
      : {}),
    ...(metadataString(metadata, "matchStage")
      ? { matchStage: metadataString(metadata, "matchStage") }
      : {}),
    ...(description
      ? { descriptionChars: description.length, descriptionSha256: sha256Text(description) }
      : {}),
  };
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
      sampleSeed: packConfig.sampleSeed,
      questionCategories: packConfig.questionCategories,
      smoke: packConfig.smoke,
    });

    const topK =
      typeof packConfig.topK === "number" && packConfig.topK > 0 ? packConfig.topK : DEFAULT_TOP_K;

    const memoryProvenance = describeMemoryProvenance(memory);
    const backendRuntimeIdentity = JSON.stringify({
      backendId: memoryProvenance.backendId,
      backendVersion: memoryProvenance.backendVersion ?? null,
      backendDetail: memoryProvenance.backendDetail ?? null,
      sourceGitSha: process.env.AKM_EVAL_AKM_SOURCE_SHA ?? null,
      sourceTreeFingerprint: process.env.AKM_EVAL_AKM_SOURCE_FINGERPRINT ?? null,
      sourceDirty: process.env.AKM_EVAL_AKM_SOURCE_DIRTY ?? null,
      explicitRuntimeFingerprint: process.env.AKM_EVAL_AKM_RUNTIME_FINGERPRINT ?? null,
    });
    const checkpointIdentity = createCheckpointIdentity({
      datasetPath,
      questions,
      memoryBackend: memory.id,
      memoryBackendConfig: context.run.memoryBackendConfig,
      topK,
      agentProviderType: context.run.agentProviderConfig?.type,
      agentBaseURL: context.run.agentProviderConfig?.baseURL,
      requestedAgentModel: context.run.agentModel,
      agentProviderOptions: context.run.agentProviderConfig?.options,
      backendRuntimeIdentity,
      evaluatorCodeSha256: evaluatorCodeSha256(),
    });
    const checkpointPath = resolveCheckpointPath(
      context.outputDir,
      checkpointIdentity.signature,
      packConfig.checkpointPath,
    );
    const checkpointState = prepareCheckpoint(
      checkpointPath,
      checkpointIdentity.manifest,
      packConfig.resume !== false,
      new Set(questions.map((question) => question.id)),
    );
    const completedEntries = new Map<string, LongMemEvalCheckpointEntry>();
    let resumedQuestionCount = 0;

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
    let nonAbstentionContextQueryCount = 0;
    let literalAnswerPresentCount = 0;
    let evidenceHitQueryCount = 0;
    let evidenceHitAnswerPresentCount = 0;
    const resolvedAgentModels = new Map<string, number>();
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
      let completed = checkpointState.entries.get(question.id);
      if (completed) {
        resumedQuestionCount += 1;
      } else {
        let searchResults: MemorySearchResult[] = [];
        let prompt: string;
        let contextText: string;
        let retrievalMetric: RetrievalMetrics | undefined;
        let withoutEvidence = false;
        let unmatchableEvidence = false;

        if (memory.kind === "disabled") {
          prompt = buildFullContextPrompt(question);
          contextText = question.conversation
            .map((turn) => `${turn.role}: ${turn.content}`)
            .join("\n");
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
          contextText = buildRetrievedContext(searchResults);
          retrievalMetric = scoreRetrieval(question.evidenceSessionIds, searchResults, topK);
          withoutEvidence = question.evidenceSessionIds.length === 0;
          if (!withoutEvidence) {
            const haystackSessionIds = new Set(
              question.haystackSessions.map((session) => session.sessionId),
            );
            unmatchableEvidence = !question.evidenceSessionIds.some((id) =>
              haystackSessionIds.has(id),
            );
          }
        }

        const agentResult = await resolvedAgent.run({ prompt });
        if (!agentResult.ok) {
          throw new BenchmarkRuntimeError(
            `longmemeval agent run failed for ${question.id}: ${agentResult.error ?? "unknown error"}. ` +
              `Completed answers are checkpointed at ${checkpointPath}; rerun the same command to resume them.`,
          );
        }

        const nonAbstention = !question.id.endsWith("_abs");
        const literalAnswerPresent =
          nonAbstention && containsLiteralAnswer(contextText, question.expectedAnswer);
        const evidenceSessionHit = question.evidenceSessionIds.some((evidenceId) =>
          searchResults.some((result) => result.id === evidenceId),
        );
        completed = {
          schemaVersion: 1,
          signature: checkpointIdentity.signature,
          question_id: question.id,
          hypothesis: agentResult.text,
          ...(memory.kind !== "disabled"
            ? { retrieved_session_ids: searchResults.map((entry) => entry.id) }
            : {}),
          agent: {
            ...(agentResult.usage ? { usage: agentResult.usage } : {}),
            latencyMs: agentResult.latencyMs,
            retries: agentResult.retries ?? 0,
            ...(agentResult.resolvedModel ? { resolvedModel: agentResult.resolvedModel } : {}),
          },
          ...(retrievalMetric ? { retrievalMetric } : {}),
          retrievalProvenance: searchResults.map(retrievalProvenance),
          context: { nonAbstention, literalAnswerPresent, evidenceSessionHit },
          counters: {
            retrievalQueried: memory.kind !== "disabled",
            zeroHit: memory.kind !== "disabled" && searchResults.length === 0,
            withoutEvidence,
            unmatchableEvidence,
            synthesizedHaystack: memory.kind !== "disabled" && question.haystackSessionsSynthesized,
          },
        };
        appendCheckpoint(checkpointPath, completed);
      }

      completedEntries.set(question.id, completed);
      predictions.push({
        question_id: completed.question_id,
        hypothesis: completed.hypothesis,
        ...(completed.retrieved_session_ids
          ? { retrieved_session_ids: completed.retrieved_session_ids }
          : {}),
      });
      agentRetryCount += completed.agent.retries;
      totalPromptTokens += completed.agent.usage?.input ?? 0;
      totalCompletionTokens += completed.agent.usage?.output ?? 0;
      totalTokens += completed.agent.usage?.total ?? 0;
      totalLatencyMs += completed.agent.latencyMs;
      if (completed.agent.resolvedModel) {
        resolvedAgentModels.set(
          completed.agent.resolvedModel,
          (resolvedAgentModels.get(completed.agent.resolvedModel) ?? 0) + 1,
        );
      }
      if (completed.retrievalMetric) retrievalMetrics.push(completed.retrievalMetric);
      if (completed.counters.retrievalQueried) retrievalQueryCount += 1;
      if (completed.counters.zeroHit) zeroHitQueries += 1;
      if (completed.counters.withoutEvidence) questionsWithoutEvidence += 1;
      if (completed.counters.unmatchableEvidence) questionsWithUnmatchableEvidence += 1;
      if (completed.counters.synthesizedHaystack) questionsWithSynthesizedHaystack += 1;
      totalResultsReturned += completed.retrievalProvenance.length;
      if (completed.context.nonAbstention) {
        nonAbstentionContextQueryCount += 1;
        if (completed.context.literalAnswerPresent) literalAnswerPresentCount += 1;
        if (completed.context.evidenceSessionHit) {
          evidenceHitQueryCount += 1;
          if (completed.context.literalAnswerPresent) evidenceHitAnswerPresentCount += 1;
        }
      }
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

    fs.mkdirSync(path.dirname(predictionsPath), { recursive: true });
    fs.writeFileSync(
      predictionsPath,
      `${predictions.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
      "utf8",
    );

    const evaluatorModel =
      typeof packConfig.evaluatorModel === "string" ? packConfig.evaluatorModel : "gpt-4o";
    const provider = context.run.agentProviderConfig;
    const evaluatorEnv = resolveJudgeEnv(
      process.env,
      isOpenAICompatibleConfig(provider)
        ? { baseURL: provider.baseURL, apiKey: provider.apiKey }
        : undefined,
    );
    evaluatorEnv.AKM_EVAL_JUDGE_RESUME = packConfig.resume === false ? "0" : "1";
    const evalResult = runEvaluatorCommand(
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
      const checkpoint = completedEntries.get(questionId);
      if (!checkpoint) {
        throw new BenchmarkRuntimeError(
          `longmemeval internal checkpoint is missing completed question ${questionId}`,
        );
      }
      return {
        questionId,
        category: question.category,
        expectedAnswer: question.expectedAnswer,
        actualAnswer:
          predictions.find((prediction) => prediction.question_id === questionId)?.hypothesis ?? "",
        passed,
        requestedAgentModel: context.run.agentModel ?? null,
        resolvedAgentModel: checkpoint.agent.resolvedModel ?? null,
        requestedJudgeModel: entry.autoeval_label?.model ?? evaluatorModel,
        resolvedJudgeModel:
          entry.autoeval_label?.resolved_model ?? entry.autoeval_label?.model ?? null,
        retrievedSessionIds: checkpoint.retrieved_session_ids ?? [],
        retrievalProvenance: checkpoint.retrievalProvenance,
        contextSufficiency: checkpoint.context,
      };
    });
    const resolvedJudgeModels = new Map<string, number>();
    for (const entry of evaluationEntries) {
      const model = entry.autoeval_label?.resolved_model ?? entry.autoeval_label?.model;
      if (model) resolvedJudgeModels.set(model, (resolvedJudgeModels.get(model) ?? 0) + 1);
    }

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
        ...(checkpointState.recoveredPartialLine
          ? [
              `Recovered and truncated an incomplete final checkpoint line at ${checkpointPath}; all preceding per-question answers were retained.`,
            ]
          : []),
        ...(resolvedAgentModels.size > 1
          ? [
              `The answer provider resolved this run to ${resolvedAgentModels.size} different models (${[
                ...resolvedAgentModels.entries(),
              ]
                .map(([model, count]) => `${model}=${count}`)
                .join(
                  ", ",
                )}). Treat an alias such as "auto" as a production-routing run, not a fixed-model causal comparison.`,
            ]
          : []),
        ...(resolvedJudgeModels.size > 1
          ? [
              `The judge provider resolved this run to ${resolvedJudgeModels.size} different models (${[
                ...resolvedJudgeModels.entries(),
              ]
                .map(([model, count]) => `${model}=${count}`)
                .join(", ")}); the score is not attributable to one fixed judge.`,
            ]
          : []),
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
        `Per-question answer checkpoint: ${checkpointPath} (${resumedQuestionCount}/${questions.length} answer(s) resumed).`,
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
              "akm indexing (akm >= 0.9.2): full body prose is indexed, not just synthesized " +
                "description/tags/heading — the pre-0.9.2 body-prose ceiling was lifted by akm#819 " +
                "(see docs/memory-backends.md for older runs measured under it). This backend still " +
                "synthesizes description/tags/heading from the first sentence(s) of each session " +
                "document and still applies a fixed deterministic stopword strip to each query, but " +
                "akm search now runs a progressive strict-AND -> prefix-AND -> OR/prefix-OR fallback " +
                "rather than a hard conjunctive-AND, so a full-AND miss no longer means zero hits. The " +
                "seeded akm skeleton corpus is stripped before ingestion so no foreign content can " +
                "appear in results. See src/memory/backends/akm.ts and docs/memory-backends.md.",
            ]
          : []),
      ],
      metrics: {
        retrieval: averageRetrieval(retrievalMetrics),
        context: {
          queryCount: questions.length,
          nonAbstentionQueryCount: nonAbstentionContextQueryCount,
          literalAnswerContainment:
            nonAbstentionContextQueryCount > 0
              ? Number((literalAnswerPresentCount / nonAbstentionContextQueryCount).toFixed(6))
              : 0,
          evidenceHitQueryCount,
          evidenceHitContextAnswerContainment:
            evidenceHitQueryCount > 0
              ? Number((evidenceHitAnswerPresentCount / evidenceHitQueryCount).toFixed(6))
              : 0,
          evidenceHitButAnswerMissingCount: evidenceHitQueryCount - evidenceHitAnswerPresentCount,
        },
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
        ...(resolvedAgentModels.size > 0
          ? { resolvedModels: Object.fromEntries([...resolvedAgentModels.entries()].sort()) }
          : {}),
      },
      artifacts: {
        resultPath: "",
        summaryPath: "",
        rawOutputPath: "",
      },
      metadata: {
        ...context.run.metadata,
        ...memoryProvenance,
        benchmarkId: path.basename(datasetPath, path.extname(datasetPath)),
        questionCount: questions.length,
        overallAccuracy: score,
        evaluatorCommand,
        evaluatorModel,
        predictionsPath,
        evaluationLogPath,
        topK,
        agentRetryCount,
        checkpointPath,
        checkpointSignature: checkpointIdentity.signature,
        checkpointResumeEnabled: packConfig.resume !== false,
        resumedQuestionCount,
        agentResolvedModelCount: resolvedAgentModels.size,
        agentResolvedModels:
          resolvedAgentModels.size > 0
            ? [...resolvedAgentModels.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([model, count]) => `${model}=${count}`)
                .join(",")
            : null,
        judgeResolvedModelCount: resolvedJudgeModels.size,
        judgeResolvedModels:
          resolvedJudgeModels.size > 0
            ? [...resolvedJudgeModels.entries()]
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([model, count]) => `${model}=${count}`)
                .join(",")
            : null,
        contextSufficiencyDefinition:
          "normalized-literal-answer-containment; evidence-hit rate conditions on a retrieved ground-truth session; abstention questions excluded",
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
              akmFragmentContextMode:
                (context.run.memoryBackendConfig?.fragmentContext as { mode?: unknown } | undefined)
                  ?.mode === "lead"
                  ? "lead"
                  : "exact",
              akmFragmentContextMaxChars:
                typeof (
                  context.run.memoryBackendConfig?.fragmentContext as
                    | { maxChars?: unknown }
                    | undefined
                )?.maxChars === "number"
                  ? (context.run.memoryBackendConfig?.fragmentContext as { maxChars: number })
                      .maxChars
                  : null,
              akmFragmentContextMaxTokens:
                typeof (
                  context.run.memoryBackendConfig?.fragmentContext as
                    | { maxTokens?: unknown }
                    | undefined
                )?.maxTokens === "number"
                  ? (context.run.memoryBackendConfig?.fragmentContext as { maxTokens: number })
                      .maxTokens
                  : null,
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
      checkpointPath,
      checkpointSignature: checkpointIdentity.signature,
      resumedQuestionCount,
      resolvedAgentModels: Object.fromEntries([...resolvedAgentModels.entries()].sort()),
      resolvedJudgeModels: Object.fromEntries([...resolvedJudgeModels.entries()].sort()),
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
