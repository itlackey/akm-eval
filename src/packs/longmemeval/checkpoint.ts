import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { BenchmarkRuntimeError } from "../../core/errors.ts";
import type { RetrievalMetrics } from "../../memory/types.ts";

export interface LongMemEvalRetrievalProvenance {
  id: string;
  score: number;
  textChars: number;
  textEstimatedTokens: number;
  textSha256: string;
  selectedRef?: string;
  parentRef?: string;
  fragmentOrdinal?: number;
  fragmentCount?: number;
  startLine?: number;
  endLine?: number;
  previousRef?: string | null;
  nextRef?: string | null;
  fragmentChars?: number;
  fragmentEstimatedTokens?: number;
  parentChars?: number;
  parentEstimatedTokens?: number;
  contextMode?: string;
  contextMaxChars?: number;
  contextTruncated?: boolean;
  matchStage?: string;
  descriptionChars?: number;
  descriptionSha256?: string;
}

export interface LongMemEvalContextObservation {
  nonAbstention: boolean;
  literalAnswerPresent: boolean;
  evidenceSessionHit: boolean;
}

export interface LongMemEvalCheckpointEntry {
  schemaVersion: 1;
  signature: string;
  question_id: string;
  hypothesis: string;
  retrieved_session_ids?: string[];
  agent: {
    usage?: { input: number; output: number; total: number };
    latencyMs: number;
    retries: number;
    resolvedModel?: string;
  };
  retrievalMetric?: RetrievalMetrics;
  retrievalProvenance: LongMemEvalRetrievalProvenance[];
  context: LongMemEvalContextObservation;
  counters: {
    retrievalQueried: boolean;
    zeroHit: boolean;
    withoutEvidence: boolean;
    unmatchableEvidence: boolean;
    synthesizedHaystack: boolean;
  };
}

export interface LongMemEvalCheckpointManifest {
  schemaVersion: 1;
  signature: string;
  datasetPath: string;
  questionCount: number;
  questionIdsSha256: string;
  memoryBackend: string;
  memoryBackendConfig: Record<string, unknown> | null;
  topK: number;
  agentProviderType: string | null;
  agentBaseURL: string | null;
  requestedAgentModel: string | null;
  agentProviderOptions: Record<string, unknown> | null;
  backendRuntimeIdentity: string;
  evaluatorCodeSha256: string;
  promptContract: "longmemeval-v2";
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createCheckpointIdentity(input: {
  datasetPath: string;
  questions: unknown[];
  memoryBackend: string;
  memoryBackendConfig?: Record<string, unknown>;
  topK: number;
  agentProviderType?: string;
  agentBaseURL?: string;
  requestedAgentModel?: string;
  agentProviderOptions?: Record<string, unknown>;
  backendRuntimeIdentity: string;
  evaluatorCodeSha256: string;
}): { signature: string; manifest: LongMemEvalCheckpointManifest } {
  const questionIds = input.questions.map((question) =>
    typeof question === "object" && question !== null && "id" in question
      ? String((question as { id: unknown }).id)
      : "",
  );
  const signature = sha256Text(
    JSON.stringify({
      schemaVersion: 1,
      datasetPath: path.resolve(input.datasetPath),
      questions: input.questions,
      memoryBackend: input.memoryBackend,
      memoryBackendConfig: input.memoryBackendConfig ?? null,
      topK: input.topK,
      agentProviderType: input.agentProviderType ?? null,
      agentBaseURL: input.agentBaseURL ?? null,
      requestedAgentModel: input.requestedAgentModel ?? null,
      agentProviderOptions: input.agentProviderOptions ?? null,
      backendRuntimeIdentity: input.backendRuntimeIdentity,
      evaluatorCodeSha256: input.evaluatorCodeSha256,
      promptContract: "longmemeval-v2",
    }),
  );
  return {
    signature,
    manifest: {
      schemaVersion: 1,
      signature,
      datasetPath: path.resolve(input.datasetPath),
      questionCount: input.questions.length,
      questionIdsSha256: sha256Text(JSON.stringify(questionIds)),
      memoryBackend: input.memoryBackend,
      memoryBackendConfig: input.memoryBackendConfig ?? null,
      topK: input.topK,
      agentProviderType: input.agentProviderType ?? null,
      agentBaseURL: input.agentBaseURL ?? null,
      requestedAgentModel: input.requestedAgentModel ?? null,
      agentProviderOptions: input.agentProviderOptions ?? null,
      backendRuntimeIdentity: input.backendRuntimeIdentity,
      evaluatorCodeSha256: input.evaluatorCodeSha256,
      promptContract: "longmemeval-v2",
    },
  };
}

export function resolveCheckpointPath(
  outputDir: string,
  signature: string,
  configuredPath?: string,
): string {
  const relativePath =
    configuredPath ?? path.join(".checkpoints", `longmemeval-${signature}.jsonl`);
  if (path.isAbsolute(relativePath)) {
    throw new BenchmarkRuntimeError(
      "longmemeval pack.config.checkpointPath must be relative to the run output directory",
    );
  }
  const resolvedOutput = path.resolve(outputDir);
  const resolved = path.resolve(resolvedOutput, relativePath);
  if (resolved !== resolvedOutput && !resolved.startsWith(`${resolvedOutput}${path.sep}`)) {
    throw new BenchmarkRuntimeError(
      "longmemeval pack.config.checkpointPath must stay inside the run output directory",
    );
  }
  return resolved;
}

function isCheckpointEntry(value: unknown): value is LongMemEvalCheckpointEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<LongMemEvalCheckpointEntry>;
  const context = entry.context as Partial<LongMemEvalContextObservation> | undefined;
  const counters = entry.counters as Partial<LongMemEvalCheckpointEntry["counters"]> | undefined;
  const agent = entry.agent as Partial<LongMemEvalCheckpointEntry["agent"]> | undefined;
  const usage = agent?.usage;
  const retrievalMetric = entry.retrievalMetric;
  return (
    entry.schemaVersion === 1 &&
    typeof entry.signature === "string" &&
    typeof entry.question_id === "string" &&
    typeof entry.hypothesis === "string" &&
    agent !== undefined &&
    typeof agent.latencyMs === "number" &&
    Number.isFinite(agent.latencyMs) &&
    typeof agent.retries === "number" &&
    Number.isInteger(agent.retries) &&
    agent.retries >= 0 &&
    (agent.resolvedModel === undefined || typeof agent.resolvedModel === "string") &&
    (usage === undefined ||
      (typeof usage.input === "number" &&
        typeof usage.output === "number" &&
        typeof usage.total === "number")) &&
    (entry.retrieved_session_ids === undefined ||
      (Array.isArray(entry.retrieved_session_ids) &&
        entry.retrieved_session_ids.every((id) => typeof id === "string"))) &&
    (retrievalMetric === undefined ||
      (typeof retrievalMetric.queryCount === "number" &&
        typeof retrievalMetric.precisionAtK === "number" &&
        typeof retrievalMetric.recallAtK === "number" &&
        typeof retrievalMetric.mrr === "number" &&
        typeof retrievalMetric.ndcgAtK === "number")) &&
    Array.isArray(entry.retrievalProvenance) &&
    entry.retrievalProvenance.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.id === "string" &&
        typeof item.score === "number" &&
        typeof item.textChars === "number" &&
        typeof item.textEstimatedTokens === "number" &&
        typeof item.textSha256 === "string",
    ) &&
    context !== undefined &&
    typeof context.nonAbstention === "boolean" &&
    typeof context.literalAnswerPresent === "boolean" &&
    typeof context.evidenceSessionHit === "boolean" &&
    counters !== undefined &&
    typeof counters.retrievalQueried === "boolean" &&
    typeof counters.zeroHit === "boolean" &&
    typeof counters.withoutEvidence === "boolean" &&
    typeof counters.unmatchableEvidence === "boolean" &&
    typeof counters.synthesizedHaystack === "boolean"
  );
}

export function prepareCheckpoint(
  checkpointPath: string,
  manifest: LongMemEvalCheckpointManifest,
  resume: boolean,
  expectedQuestionIds: Set<string>,
): { entries: Map<string, LongMemEvalCheckpointEntry>; recoveredPartialLine: boolean } {
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  const manifestPath = `${checkpointPath}.manifest.json`;

  if (!resume) {
    fs.writeFileSync(checkpointPath, "", "utf8");
  }

  const entries = new Map<string, LongMemEvalCheckpointEntry>();
  let recoveredPartialLine = false;
  if (resume && fs.existsSync(checkpointPath)) {
    const raw = fs.readFileSync(checkpointPath, "utf8");
    const lines = raw.split("\n");
    let byteOffset = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      const nextByteOffset = byteOffset + Buffer.byteLength(line, "utf8") + 1;
      if (line.trim().length === 0) {
        byteOffset = nextByteOffset;
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        const isLastNonEmptyLine = lines.slice(index + 1).every((candidate) => !candidate.trim());
        if (!isLastNonEmptyLine) {
          throw new BenchmarkRuntimeError(
            `longmemeval checkpoint is corrupt before its final line at ${checkpointPath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        fs.truncateSync(checkpointPath, byteOffset);
        recoveredPartialLine = true;
        break;
      }
      if (!isCheckpointEntry(parsed)) {
        throw new BenchmarkRuntimeError(
          `longmemeval checkpoint has an invalid entry at ${checkpointPath}:${index + 1}`,
        );
      }
      if (parsed.signature !== manifest.signature) {
        throw new BenchmarkRuntimeError(
          `longmemeval checkpoint signature mismatch at ${checkpointPath}:${index + 1}`,
        );
      }
      if (!expectedQuestionIds.has(parsed.question_id)) {
        throw new BenchmarkRuntimeError(
          `longmemeval checkpoint contains unexpected question_id ${JSON.stringify(parsed.question_id)}`,
        );
      }
      if (entries.has(parsed.question_id)) {
        throw new BenchmarkRuntimeError(
          `longmemeval checkpoint contains duplicate question_id ${JSON.stringify(parsed.question_id)}`,
        );
      }
      entries.set(parsed.question_id, parsed);
      byteOffset = nextByteOffset;
    }
  }

  const temporaryManifestPath = `${manifestPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryManifestPath, manifestPath);
  return { entries, recoveredPartialLine };
}

export function appendCheckpoint(checkpointPath: string, entry: LongMemEvalCheckpointEntry): void {
  const fd = fs.openSync(checkpointPath, "a");
  try {
    fs.writeSync(fd, `${JSON.stringify(entry)}\n`, undefined, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}
