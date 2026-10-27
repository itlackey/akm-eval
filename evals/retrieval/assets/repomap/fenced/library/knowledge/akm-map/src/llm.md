---
description: "Repo map of akm src/llm at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  llm/
    embedders/
      cache.ts
      connection.ts
      deterministic.ts
      local-model-files.ts
      local.ts
      onnx-runtime.ts
      profile.ts
      remote.ts
      types.ts
    client.ts
    embedder.ts
    index-passes.ts
    memory-infer.ts
    model-list.ts
    rerank-client.ts
    structured-call.ts
    structured.ts
    usage-persist.ts
    usage-telemetry.ts
```

# Files

## File: src/llm/embedders/cache.ts
```typescript
import type { EmbeddingConnectionConfig } from "../../core/config/config";
import type { EmbeddingVector } from "./types";
⋮----
export function embedCacheKey(text: string, config?: EmbeddingConnectionConfig): string
⋮----
export function getCachedEmbedding(key: string): EmbeddingVector | undefined
⋮----
export function setCachedEmbedding(key: string, value: EmbeddingVector): void
⋮----
export function clearEmbeddingCache(): void
```

## File: src/llm/embedders/connection.ts
```typescript
import { defaultConnection } from "../../core/config/config";
import type { AkmConfig, EmbeddingConnectionConfig } from "../../core/config/config-types";
import { apiKeyReference } from "../../core/config/credentials";
import { openAiBaseUrl } from "../../core/endpoint-url";
import { warnOnce } from "../../core/warn";
⋮----
export function effectiveEmbedding(config: AkmConfig): EmbeddingConnectionConfig | undefined
```

## File: src/llm/embedders/deterministic.ts
```typescript
import type { EmbeddingVector } from "./types";
⋮----
export function isDeterministicEmbedEnabled(): boolean
⋮----
function fnv1a(str: string): number
⋮----
function tokenize(text: string): string[]
⋮----
export function deterministicEmbed(text: string, dim: number = DETERMINISTIC_EMBED_DIM): EmbeddingVector
```

## File: src/llm/embedders/local-model-files.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { fetchWithRetry } from "../../core/common";
import { getCacheDir } from "../../core/paths";
import { writeResponseToFileCapped } from "../../runtime";
⋮----
function isEnabledEnvironmentFlag(value: string | undefined): boolean
⋮----
async function downloadFile(url: string, target: string): Promise<void>
⋮----
// No overall deadline for a 127 MB file on a slow link (Transformers.js had none): only 60 s without bytes fails it.
⋮----
/**
 * Make sure every file of `modelName` (a Hub repo id) is cached and return the
 * directory holding them. With `HF_HUB_OFFLINE` set nothing is fetched and a
 * missing file is an error.
 */
export async function ensureLocalModelFiles(modelName: string): Promise<string>
```

## File: src/llm/embedders/local.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { toErrorMessage } from "../../core/common";
import { ensureLocalModelFiles } from "./local-model-files";
import { hasLocalEmbeddings, loadOnnxRuntime, noLocalEmbeddingsReason, OnnxTensor } from "./onnx-runtime";
import type { Embedder, EmbeddingVector } from "./types";
⋮----
type LocalPipeline = (texts: string[]) => Promise<Float32Array[]>;
⋮----
export class LocalRuntimeUnavailableError extends Error
⋮----
constructor(
    message: string,
    readonly kind: "platform" | "load",
)
⋮----
export type LocalPipelineLoader = (modelName: string) => Promise<LocalPipeline>;
⋮----
export function _setLocalPipelineLoaderForTests(fake?: LocalPipelineLoader): void
⋮----
function resolveLocalModelName(overrideModel?: string): string
⋮----
async function loadRuntime(): ReturnType<typeof loadOnnxRuntime>
⋮----
// A `noexec` mount maps nothing executable, so the binding cannot load from the cache there.
⋮----
function meanPooled(hidden: Float32Array, offset: number, tokens: number, dim: number): Float32Array
⋮----
async function loadOnnxPipeline(modelName: string): Promise<LocalPipeline>
⋮----
const readJson = (file: string): object
⋮----
export class LocalEmbedder implements Embedder
⋮----
constructor(private readonly defaultModel?: string)
⋮----
reset(): void
⋮----
async embed(text: string, signal?: AbortSignal): Promise<EmbeddingVector>
⋮----
async embedBatch(
    texts: string[],
    signal?: AbortSignal,
    onBatch?: (indices: number[], embeddings: EmbeddingVector[]) => void,
): Promise<EmbeddingVector[]>
⋮----
async embedWithModel(text: string, modelName?: string): Promise<EmbeddingVector>
⋮----
async getPipeline(modelName?: string): Promise<LocalPipeline>
```

## File: src/llm/embedders/onnx-runtime.ts
```typescript
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { toErrorMessage } from "../../core/common";
import { fetchNpmPackageFiles, NPM_REGISTRY } from "../../core/npm-package";
import { getCacheDir } from "../../core/paths";
import { info } from "../../core/warn";
⋮----
function thisPlatform(): string
⋮----
export function hasLocalEmbeddings(): boolean
⋮----
export function noLocalEmbeddingsReason(): string
⋮----
export class OnnxTensor
⋮----
constructor(
⋮----
interface Binding {
  initOrtOnce(logLevel: number, tensor: typeof OnnxTensor): void;
  InferenceSession: new () => {
    loadModel(modelPath: string, options: object): void;
    readonly inputMetadata: ReadonlyArray<{ name: string }>;
    readonly outputMetadata: ReadonlyArray<{ name: string }>;
    run(feeds: Record<string, OnnxTensor>, fetches: Record<string, null>): Record<string, OnnxTensor>;
  };
}
⋮----
initOrtOnce(logLevel: number, tensor: typeof OnnxTensor): void;
⋮----
loadModel(modelPath: string, options: object): void;
⋮----
run(feeds: Record<string, OnnxTensor>, fetches: Record<string, null>): Record<string, OnnxTensor>;
⋮----
export interface OnnxSession {
  readonly inputNames: readonly string[];

  run(feeds: Record<string, OnnxTensor>): Record<string, OnnxTensor>;
}
⋮----
run(feeds: Record<string, OnnxTensor>): Record<string, OnnxTensor>;
⋮----
async function fetchOnnxRuntime(directory: string): Promise<string>
⋮----
async function loadBinding(): Promise<Binding>
⋮----
export async function loadOnnxRuntime(): Promise<
⋮----
createSession(modelPath)
```

## File: src/llm/embedders/profile.ts
```typescript
import { createHash } from "node:crypto";
import type { EmbeddingConnectionConfig } from "../../core/config/config";
import { isDeterministicEmbedEnabled } from "./deterministic";
import { DEFAULT_LOCAL_MODEL } from "./local";
⋮----
export interface EmbeddingProfile {
  queryTemplate?: string;
  documentTemplate?: string;
}
⋮----
function embeddingModelName(config: EmbeddingConnectionConfig | undefined): string
⋮----
/** The configured model's templates: its preset, with each side replaced by an explicit config value. */
export function resolveEmbeddingProfile(config: EmbeddingConnectionConfig | undefined): EmbeddingProfile
⋮----
/** Put `text` into `template`; no template returns the text unchanged. */
export function applyEmbeddingTemplate(template: string | undefined, text: string): string
⋮----
// A replacer function keeps `$&`-style sequences in the text literal.
⋮----
/**
 * The document template's part of the embedding fingerprint: empty without a
 * template, so vectors embedded without one stay current.
 */
export function documentTemplateFingerprint(config: EmbeddingConnectionConfig | undefined): string
```

## File: src/llm/embedders/remote.ts
```typescript
import { abortableDelay, backoffDelay, fetchWithTimeout, isHttpUrl, readBodyWithByteCap } from "../../core/common";
import { concurrentMap } from "../../core/concurrent";
import type { EmbeddingConnectionConfig } from "../../core/config/config";
import { apiKeyReference, type CredentialSlot, readCredential, resolveApiKey } from "../../core/config/credentials";
import { defaultConcurrencyForEndpoint } from "../../core/loopback";
import { redactErrorBody, redactSensitiveText, redactUrlCredentials } from "../../core/redaction";
import { warnVerbose } from "../../core/warn";
import type { Embedder, EmbeddingVector } from "./types";
⋮----
export function estimateTokenCount(text: string): number
⋮----
export function capEmbeddingText(text: string, maxTokens: number):
⋮----
export function resolveEmbeddingTimeoutMs(config: EmbeddingConnectionConfig): number
⋮----
export function scaleEmbeddingTimeoutMs(timeoutMs: number, requestTokens: number, tokenBudget: number): number
⋮----
export function isEmbeddingTimeoutError(err: unknown): boolean
⋮----
export function _setEmbeddingTimeoutBackoffForTests(config?:
⋮----
export function embeddingTimeoutRetryBackoffMs(timeoutAttempt = 0): number
⋮----
export type EmbeddingSkipReason = "context-window-exceeded" | "batch-request-failed";
⋮----
export type EmbeddingFailureKind = "timeout" | "network-error";
⋮----
export interface EmbeddingBatchSkip {

  index: number;
  reason: EmbeddingSkipReason;
  message: string;









  batchStart: boolean;

  batchSize: number;

  failureKind?: EmbeddingFailureKind;
}
⋮----
export type EmbeddingSkipHandler = (skip: EmbeddingBatchSkip) => unknown;
⋮----
export interface EmbeddingBatchOutcome {

  batchIndex: number;

  batchCount: number;

  docCount: number;

  requestTokens: number;

  elapsedMs: number;














  outcome: "stored" | "failed" | "retrying" | "budget-lowered";

  reason?: string;
}
⋮----
export type EmbeddingBatchCommit = (
  indices: number[],
  embeddings: (EmbeddingVector | undefined)[],
  outcome?: EmbeddingBatchOutcome,
) => void;
⋮----
export class ContextExceededError extends Error
⋮----
constructor(message: string)
⋮----
export function isContextExceededResponse(status: number, body: string): boolean
⋮----
export function resolveEmbeddingConcurrency(config: EmbeddingConnectionConfig): number
⋮----
interface TextBatch {

  indices: number[];

  oversized: boolean;
}
⋮----
export function buildTokenBoundedBatches(texts: readonly string[], tokenBudget: number, maxCount: number): TextBatch[]
⋮----
const flush = (): void =>
⋮----
export class RemoteEmbedder implements Embedder
⋮----
constructor(private readonly config: EmbeddingConnectionConfig)
⋮----
async embed(text: string, signal?: AbortSignal): Promise<EmbeddingVector>
⋮----
/**
   * Embed every text, batched by an estimated token budget (not a fixed
   * document count) and bounded by `config.batchSize` as a document-count
   * safety cap. Batching by count alone let a batch of ordinary-sized
   * documents balloon past the endpoint's context window and the 30s
   * request timeout (#874).
   *
   * A failing sub-batch or an oversized single document is SKIPPED, not
   * thrown — the rest of `texts` still gets embedded. Skips are reported via
   * `onSkip` (index into `texts` + a named reason) rather than silently
   * dropped; the returned array holds `undefined` at every skipped index.
   * A caller abort (`signal.aborted`) still propagates as a rejection.
   *
   * Provider batches are dispatched through a bounded pool sized by
   * `resolveEmbeddingConcurrency` (#954) instead of strictly sequentially, so
   * request latency overlaps. `onBatch`, when given, fires once per provider
   * batch (success or skip) as it completes, only after that batch's own
   * outcome has already been classified — pass it to commit each batch's
   * rows durably as they land rather than buffering the whole call.
   * Completion order does not matter to `results` placement, which is always
   * written by index regardless of dispatch order. A throw from `onBatch`
   * itself (e.g. the caller's own commit failing) is never mistaken for a
   * provider/network failure; it is captured and rethrown once every batch
   * has been dispatched, alongside the `signal.aborted` check. The FIRST
   * `onBatch` throw also stops the pool from dispatching any further
   * provider request (#954 gap fix) — a persistence failure means every
   * later batch's result can never be committed either, so there is no
   * point paying for more HTTP requests; a batch already in flight when this
   * happens is left to finish (never network-aborted) but its result is
   * discarded rather than committed.
   *
   * A batch rejected specifically for exceeding the endpoint's context window
   * (HTTP 413, or a recognised context-size error body — see
   * {@link isContextExceededResponse}) is split in half and retried
   * recursively rather than skipped outright, down to individual documents; a
   * single document that still fails this way becomes a genuine
   * `context-window-exceeded` skip.
   *
   * A request TIMEOUT (see {@link isEmbeddingTimeoutError}) never drops the
   * batch outright (#954): the field evidence
   * was that akm abandoning a timed-out request does not stop the server
   * from still computing it, so immediately skipping (or immediately
   * splitting, the prior behavior) just let the provider's queue grow
   * while every following batch died the same way. Instead, on a timeout,
   * this backs off ({@link embeddingTimeoutRetryBackoffMs}) and retries the
   * SAME request once; a second timeout splits it in half (like a
   * context-size rejection) and retries each half the same way, down to
   * single documents — a single document that times out twice is finally
   * skipped. Every other failure (network error, malformed response, a
   * non-timeout HTTP failure) keeps the original skip-the-whole-batch-
   * immediately behavior, at any size. The per-request timeout itself also
   * scales down with the request's estimated size via
   * {@link scaleEmbeddingTimeoutMs}, so a dead server is detected in seconds
   * on a small batch rather than always waiting out the full configured
   * `embedding.timeoutMs`.
   *
   * Run-scoped adaptive budget (#954, field report on beta.1): the FIRST
   * context-size rejection of the run shrinks the effective request budget
   * by {@link ADAPTIVE_BUDGET_SHRINK_FACTOR} (floored at
   * {@link ADAPTIVE_BUDGET_FLOOR_MULTIPLIER} times `maxInputTokens`) for
   * every batch not yet dispatched — the still-planned tail of `texts` is
   * re-batched with `buildTokenBoundedBatches` at the smaller budget, and a
   * `budget-lowered` `onBatch` event reports it once. This never touches the
   * split-and-retry of the rejected batch itself (above), and never fires a
   * second time in the same run even if a later batch is also rejected — a
   * static configured budget that is simply too big for the endpoint should
   * self-correct once, not ratchet down forever.
   */
async embedBatch(
    texts: string[],
    signal?: AbortSignal,
    onSkip?: EmbeddingSkipHandler,
    onBatch?: EmbeddingBatchCommit,
): Promise<(EmbeddingVector | undefined)[]>
⋮----
// #956: `contextLength` is Ollama's `num_ctx` ONLY (see
// resolveOllamaOptions below) — it used to double as this client-side
// request budget too, so a config author setting it for one purpose
// silently changed the other. `maxTokens` is the sole knob for the
// request budget now; unset falls back to DEFAULT_TOKEN_BUDGET.
//
// `effectiveTokenBudget` (#954) starts at the configured/default value
// and MAY shrink once, on the run's first context-size rejection — see
// `maybeShrinkBudget` below. `textBatches` is mutated in place (spliced)
// by that shrink rather than reassigned, so the in-flight
// `concurrentMap` pool below (which reads this same array by reference)
// picks up the re-planned tail without restarting.
⋮----
// How many of `textBatches` concurrentMap has already claimed (its own
// `nextIndex`, mirrored here so a budget shrink knows where the
// not-yet-dispatched tail begins). Assigned, not incremented, at the top
// of `runProviderBatch` — batches are claimed in strictly increasing
// order, so the highest `batchIndex` seen so far IS the claimed count.
⋮----
// Set once the run's first context-size rejection has shrunk the budget
// (#954) — guards `maybeShrinkBudget` so it never fires twice.
⋮----
// On the FIRST context-size rejection of this `embedBatch` call, shrink
// `effectiveTokenBudget` and re-plan every batch `concurrentMap` has not
// yet claimed from the smaller budget. Never touches `rejectedIndices`
// itself — the caller's own split-and-retry handles that batch — and is
// a no-op after the first call (`budgetShrunk`).
const maybeShrinkBudget = (
      rejectedIndices: number[],
      rejectedBatchIndex: number,
      rejectedRequestTokens: number,
): void =>
⋮----
const stopDispatch = (reason?: unknown): void =>
⋮----
callerAbortListener = ()
⋮----
const commitBatch = (
      indices: number[],
      embeddings: (EmbeddingVector | undefined)[],
      outcome?: EmbeddingBatchOutcome,
): void =>
⋮----
const requestAndCommit = async (
      indices: number[],
      batchIndex: number,
      isTimeoutRetry = false,
      timeoutAttempt = 0,
): Promise<void> =>
⋮----
const runProviderBatch = async (textBatch: TextBatch, batchIndex: number): Promise<void> =>
⋮----
private async requestBatch(
    batch: string[],
    headers: Record<string, string>,
    ollamaOpts: { num_ctx?: number } | undefined,
    timeoutMs: number,
    signal?: AbortSignal,
): Promise<EmbeddingVector[]>
⋮----
// Sort by index to guarantee correct order (OpenAI API doesn't guarantee order)
⋮----
private resolveKey(): string | undefined
⋮----
private buildHeaders(): Record<string, string>
⋮----
private safeErrorBody(body: string): string
⋮----
function l2Normalize(vec: number[]): number[]
⋮----
export function normalizeEmbeddingEndpoint(endpoint: string): string
⋮----
function embeddingEndpointPathHint(endpoint: string): string
⋮----
/**
 * Resolve Ollama-native `options` from the embedding config.
 *
 * Resolution order:
 *   1. `ollamaOptions` — forwarded verbatim (explicit opt-in, takes precedence).
 *   2. `contextLength` — wrapped as `{ num_ctx: contextLength }`.
 *   3. Neither set → returns `undefined` (no `options` field in the request body).
 *
 * These options are only meaningful for Ollama's native `/api/embed` endpoint.
 * OpenAI-compatible endpoints ignore unknown request fields, so passing them to
 * other providers is harmless but has no effect.
 */
function resolveOllamaOptions(config: EmbeddingConnectionConfig):
⋮----
/** Check whether an EmbeddingConnectionConfig has a valid remote endpoint. */
export function hasRemoteEndpoint(config: EmbeddingConnectionConfig): boolean
⋮----
/** Where the embedding key is stored: the serving connection's slot when a connection serves the model, else the embedding service's own. */
function embeddingSlot(config: EmbeddingConnectionConfig): CredentialSlot
⋮----
export function describeEmbeddingCredential(config: EmbeddingConnectionConfig): string
```

## File: src/llm/embedders/types.ts
```typescript
export type EmbeddingVector = number[];
⋮----
export interface Embedder {
  embed(text: string, signal?: AbortSignal): Promise<EmbeddingVector>;
  embedBatch(texts: string[], signal?: AbortSignal): Promise<(EmbeddingVector | undefined)[]>;
}
⋮----
embed(text: string, signal?: AbortSignal): Promise<EmbeddingVector>;
embedBatch(texts: string[], signal?: AbortSignal): Promise<(EmbeddingVector | undefined)[]>;
⋮----
export type EmbeddingCheckResult =
  | { available: true }
  | {
      available: false;
      reason: "runtime-unavailable" | "model-download-failed" | "remote-unreachable";
      message: string;
    };
⋮----
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number
⋮----
import { warn } from "../../core/warn";
```

## File: src/llm/client.ts
```typescript
import { fetchWithTimeout, readBodyWithByteCap } from "../core/common";
import { openAiBaseUrl, openAiOperationUrl } from "../core/endpoint-url";
import { formatExtraParamsIssue, validateExtraParams } from "../core/extra-params";
import { effectiveRequestFields, type LlmInference } from "../core/llm-inference";
import { redactErrorBody, redactSensitiveText, redactUrlCredentials } from "../core/redaction";
import { warn, warnVerbose } from "../core/warn";
import {
  emitLlmUsage,
  extractUsageTokens,
  type LlmUsageErrorCode,
  type LlmUsageRecord,
  type RawUsage,
} from "./usage-telemetry";
⋮----
export type LlmCallErrorCode = Exclude<LlmUsageErrorCode, "unknown_error">;
⋮----
function isHtmlResponse(body: string): boolean
⋮----
function htmlExcerpt(body: string): string
⋮----
export class LlmCallError extends Error
⋮----
constructor(
    message: string,
    public readonly code: LlmCallErrorCode,
    public readonly statusCode?: number,

    public readonly namesResponseFormat = false,
)
⋮----
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
⋮----
export type ChatCompletionConfig = {

  endpoint: string;
  model: string;

  apiKey?: string;
  timeoutMs?: number | null;

  contextLength?: number;

  request?: Readonly<Record<string, unknown>>;

  inference?: LlmInference;
};
⋮----
interface ChatCompletionResponse {

  model?: string;
  choices: Array<{
    message: {
      content: string;
      reasoning_content?: string;
    };
    finish_reason?: string;
  }>;

  usage?: RawUsage;

  error?: unknown;
}
⋮----
export interface ChatCompletionOptions {






  maxTokens?: number;

  temperature?: number;

  timeoutMs?: number | null;

  signal?: AbortSignal;








  responseSchema?: Record<string, unknown>;





  enableThinking?: boolean;






  onRetryAttempt?: () => void;
}
⋮----
export function sleep(ms: number): Promise<void>
⋮----
async function waitForRetry(ms: number, wait: (ms: number) => Promise<void>, signal?: AbortSignal): Promise<void>
⋮----
const onAbort = ()
⋮----
function retryBackoffMs(): number
⋮----
export function isContextSizeError(message: string): boolean
⋮----
function isTransportFailure(err: LlmCallError): boolean
⋮----
function isRetryable(err: LlmCallError): boolean
⋮----
interface ChatCompletionInternalOptions extends ChatCompletionOptions {

  sleep?: (ms: number) => Promise<void>;
}
⋮----
export function _setChatCompletionForTests(fake?: typeof chatCompletionReal): void
⋮----
export async function chatCompletion(
  config: ChatCompletionConfig,
  messages: ChatMessage[],
  options?: ChatCompletionInternalOptions,
): Promise<string>
⋮----
function timeBudget(totalMs: number | null): () => number | null
⋮----
async function chatCompletionReal(
  config: ChatCompletionConfig,
  messages: ChatMessage[],
  options?: ChatCompletionInternalOptions,
): Promise<string>
⋮----
function connectionKey(config: ChatCompletionConfig): string
⋮----
export function _resetEndpointSupportTrackersForTests(): void
⋮----
export function isJsonSchemaKnownUnsupported(config: ChatCompletionConfig): boolean
⋮----
export function isThinkingControlKnownRejected(config: ChatCompletionConfig): boolean
⋮----
function isRejectedRequest(err: unknown): err is LlmCallError
⋮----
async function chatCompletionAttempt(
  config: ChatCompletionConfig,
  messages: ChatMessage[],
  options: ChatCompletionOptions | undefined,
  budget: () => number | null,
  includeThinking = sendsThinkingFields(config, options) && !isThinkingControlKnownRejected(config),
): Promise<string>
⋮----
const flushHeld = (): void =>
⋮----
type HeldUsage = { record?: LlmUsageRecord };
⋮----
async function retryWithoutSchema(
  config: ChatCompletionConfig,
  messages: ChatMessage[],
  options: ChatCompletionOptions | undefined,
  budget: () => number | null,
  includeThinking: boolean,
  err: LlmCallError,
): Promise<string>
⋮----
function sendsThinkingFields(config: ChatCompletionConfig, options: ChatCompletionOptions | undefined): boolean
⋮----
function requestFields(
  config: ChatCompletionConfig,
  options: ChatCompletionOptions | undefined,
  includeThinking: boolean,
): Record<string, unknown>
⋮----
async function chatCompletionAttemptOnce(
  config: ChatCompletionConfig,
  messages: ChatMessage[],
  options: ChatCompletionOptions | undefined,
  timeoutMs: number | null,
  includeSchema: boolean,
  includeThinking: boolean,
  held?: HeldUsage,
): Promise<string>
⋮----
const remainingAttemptMs = (): number | undefined
⋮----
export async function probeLlmEndpoint(
  config: Pick<ChatCompletionConfig, "endpoint">,
  timeoutMs = 3_000,
): Promise<
⋮----
export function probeEndpointOnce<T>(
  connection: Pick<ChatCompletionConfig, "endpoint">,
  cache: Map<string, Promise<T>>,
  probe: (connection: Pick<ChatCompletionConfig, "endpoint">) => Promise<T>,
): Promise<T>
```

## File: src/llm/embedder.ts
```typescript
import type { EmbeddingConnectionConfig } from "../core/config/config";
import { embedCacheKey, getCachedEmbedding, setCachedEmbedding } from "./embedders/cache";
import {
  DETERMINISTIC_EMBED_MODEL_ID,
  deterministicEmbed,
  isDeterministicEmbedEnabled,
} from "./embedders/deterministic";
import { DEFAULT_LOCAL_MODEL, LocalEmbedder, LocalRuntimeUnavailableError } from "./embedders/local";
import type { EmbeddingBatchCommit, EmbeddingSkipHandler } from "./embedders/remote";
import { hasRemoteEndpoint, RemoteEmbedder } from "./embedders/remote";
import type { EmbeddingCheckResult, EmbeddingVector } from "./embedders/types";
⋮----
interface EmbedderOverridesForTests {
  embed?: typeof embed;
  embedBatch?: typeof embedBatch;
  resolveEmbeddingModelId?: typeof resolveEmbeddingModelId;
  checkEmbeddingAvailability?: typeof checkEmbeddingAvailability;
}
⋮----
export function _setEmbedderForTests(fakes?: EmbedderOverridesForTests): void
⋮----
function getLocalEmbedder(): LocalEmbedder
⋮----
export function resetLocalEmbedder(): void
⋮----
export function localEmbeddingRuntime(): LocalEmbedder["runtime"]
⋮----
export async function embed(
  text: string,
  embeddingConfig?: EmbeddingConnectionConfig,
  signal?: AbortSignal,
): Promise<EmbeddingVector>
⋮----
async function embedOnce(
  text: string,
  embeddingConfig: EmbeddingConnectionConfig | undefined,
  signal?: AbortSignal,
): Promise<EmbeddingVector>
⋮----
export async function embedBatch(
  texts: string[],
  embeddingConfig?: EmbeddingConnectionConfig,
  signal?: AbortSignal,
  onSkip?: EmbeddingSkipHandler,
  onBatch?: EmbeddingBatchCommit,
): Promise<(EmbeddingVector | undefined)[]>
⋮----
export function resolveEmbeddingModelId(embeddingConfig?: EmbeddingConnectionConfig): string
⋮----
export async function checkEmbeddingAvailability(
  embeddingConfig?: EmbeddingConnectionConfig,
): Promise<EmbeddingCheckResult>
```

## File: src/llm/index-passes.ts
```typescript
import type { AkmConfig, IndexPassConfig } from "../core/config/config";
import { SHIPPED_ALIAS } from "../core/config/model-aliases";
import { ConfigError } from "../core/errors";
import type { LoweringNotice } from "../execution/resolved-request";
import { executionDefaultsOf } from "../execution/source";
import { buildExecution, resolveExecution, shippedAlias } from "../integrations/agent/execution";
import type { RunnerSpec } from "../integrations/agent/runner";
⋮----
export interface ResolvedIndexPassExecution {
  readonly runner: RunnerSpec | undefined;
  readonly notices: readonly Readonly<LoweringNotice>[];
}
⋮----
export function resolveIndexPassExecution(passName: string, config: AkmConfig): ResolvedIndexPassExecution
```

## File: src/llm/memory-infer.ts
```typescript
import memoryInferSystemPrompt from "../assets/prompts/memory-infer-system.md" with { type: "text" };
import memoryInferUserPrompt from "../assets/prompts/memory-infer-user.md" with { type: "text" };
import { effectiveRequestFields } from "../core/llm-inference";
import { parseEmbeddedJsonResponse } from "../core/parse";
import { warn } from "../core/warn";
import type { LoweringNotice } from "../execution/resolved-request";
import type { RunnerSpec } from "../integrations/agent/runner";
import { callStructured } from "./structured-call";
⋮----
export interface DerivedMemoryDraft {
  title: string;
  description: string;
  tags: string[];
  searchHints: string[];
  content: string;
}
⋮----
export interface MemoryInferNoChange {
  noChange: true;
}
⋮----
export function isMemoryInferNoChange(value: unknown): value is MemoryInferNoChange
⋮----
export interface MemoryInferTelemetry {

  htmlErrorCount?: number;
}
⋮----
function configuredTemperature(runner: RunnerSpec): number | undefined
⋮----
function parseDerivedMemory(raw: string): DerivedMemoryDraft | MemoryInferNoChange | undefined
⋮----
export async function compressMemoryToDerivedMemory(
  llmRunner: RunnerSpec,
  body: string,
  signal?: AbortSignal,
  telemetry?: MemoryInferTelemetry,
  onRetryAttempt?: () => void,
  onNotices?: (notices: readonly Readonly<LoweringNotice>[]) => void,
): Promise<DerivedMemoryDraft | MemoryInferNoChange | undefined>
```

## File: src/llm/model-list.ts
```typescript
import { openAiOperationUrl } from "../core/endpoint-url";
⋮----
export type EndpointModels =
  | { readonly ok: true; readonly models: string[] }
  | { readonly ok: false; readonly error: string };
⋮----
export async function listEndpointModels(
  connection: { readonly endpoint: string; readonly apiKey?: string },
  timeoutMs = LIST_TIMEOUT_MS,
): Promise<EndpointModels>
⋮----
export function isEmbeddingModel(id: string): boolean
```

## File: src/llm/rerank-client.ts
```typescript
import { fetchWithTimeout, readBodyWithByteCap } from "../core/common";
import { resolveApiKey } from "../core/config/credentials";
import { redactErrorBody, redactSensitiveText, redactUrlCredentials } from "../core/redaction";
⋮----
export interface CurateRerankConfig {
  enabled?: boolean;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  topN?: number;
}
⋮----
export class RerankCallError extends Error
⋮----
constructor(message: string, code: RerankCallError["code"])
⋮----
export interface RerankResult {
  index: number;
  score: number;
}
⋮----
interface RerankResponseBody {
  results?: Array<{ index?: number; relevance_score?: number; score?: number }>;
}
⋮----
export async function rerankDocuments(
  config: CurateRerankConfig,
  query: string,
  documents: readonly string[],
): Promise<RerankResult[]>
```

## File: src/llm/structured-call.ts
```typescript
import { ConfigError } from "../core/errors";
import type { LoweringNotice, ResolvedConversationMessage } from "../execution/resolved-request";
import type { UnresolvedExecutionDefaults } from "../execution/source";
import { buildExecution, currentLayer, resolveExecution } from "../integrations/agent/execution";
import type { RunnerSpec } from "../integrations/agent/runner";
import { runExecution } from "../integrations/agent/runner-dispatch";
import type { AgentRunResult } from "../integrations/agent/spawn";
import type { ChatCompletionConfig, ChatMessage } from "./client";
import type { Dispatched } from "./structured";
⋮----
export interface CallStructuredRequest {
  temperature?: number;
  timeoutMs?: number | null;
  signal?: AbortSignal;
  responseSchema?: Record<string, unknown>;

  maxTokens?: number;

  enableThinking?: boolean;
  onRetryAttempt?: () => void;



  chat?: (
    config: ChatCompletionConfig,
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      timeoutMs?: number | null;
      signal?: AbortSignal;
      responseSchema?: Record<string, unknown>;
      maxTokens?: number;
      enableThinking?: boolean;
      onRetryAttempt?: () => void;
    },
  ) => Promise<string>;
}
⋮----
export interface CallStructuredOptions {

  runner: RunnerSpec;

  current?: UnresolvedExecutionDefaults;

  onNotices?: (notices: readonly Readonly<LoweringNotice>[]) => void;

  messages: ChatMessage[];

  request?: CallStructuredRequest;
}
⋮----
export type StructuredOutcome = Dispatched;
⋮----
function own(value: object | undefined, key: PropertyKey): boolean
⋮----
export function resolveStructuredCurrent(
  current: UnresolvedExecutionDefaults | undefined,
  request: CallStructuredRequest | undefined,
): UnresolvedExecutionDefaults | undefined
⋮----
function requireTerminalUserMessage(messages: readonly ChatMessage[]):
⋮----
function failed(error: string, result?: AgentRunResult): Extract<StructuredOutcome,
⋮----
export function outcomeOf(result: AgentRunResult): StructuredOutcome
⋮----
export async function callStructured(opts: CallStructuredOptions): Promise<StructuredOutcome>
```

## File: src/llm/structured.ts
```typescript
import { parseEmbeddedJsonResponse } from "../core/parse";
import type { Parsed } from "../core/structured";
import type { AgentRunResult } from "../integrations/agent/spawn";
⋮----
export interface StructuredFailure {
  reason: "timeout" | "aborted" | "error";
  error: string;

  result?: AgentRunResult;
}
⋮----
export type Dispatched<F extends object = StructuredFailure> = { ok: true; raw: string } | ({ ok: false } & F);
⋮----
export interface Correction {

  readonly text: string;

  readonly reply: string;
}
⋮----
type Refusal = Extract<Parsed<unknown>, { ok: false }>;
⋮----
export interface StructuredLoopOptions<T, F extends object = StructuredFailure> {

  dispatch: (correction?: Correction) => Promise<Dispatched<F>>;
  parse: (raw: string) => Parsed<T>;

  attempts?: number;

  correct?: (refusal: Refusal) => string;
}
⋮----
export type StructuredLoopResult<T, F extends object = StructuredFailure> =
  | { ok: true; value: T; raw: string; attempts: number }
  | {
      ok: false;
      reason: "parse_error" | "validation_error";
      errors: string[];

      raw: string;
      attempts: number;
    }
  | ({ ok: false; attempts: number } & F);
⋮----
export function isRefused<T, F extends object>(
  result: StructuredLoopResult<T, F>,
): result is Extract<StructuredLoopResult<T, F>,
⋮----
export function correctionText(refusal: Refusal): string
⋮----
export async function structuredLoop<T, F extends object = StructuredFailure>(
  options: StructuredLoopOptions<T, F>,
): Promise<StructuredLoopResult<T, F>>
⋮----
export function jsonParser<T>(validate: (candidate: unknown) => Parsed<T>): (raw: string) => Parsed<T>
```

## File: src/llm/usage-persist.ts
```typescript
import { appendEvent, type EventsContext } from "../core/events";
import {
  clearLlmUsageSink,
  getLlmUsageSink,
  hasLlmUsageSink,
  type LlmUsageRecord,
  setLlmUsageSink,
} from "./usage-telemetry";
⋮----
type EventsContextSource = EventsContext | (() => EventsContext);
⋮----
function toEventMetadata(record: LlmUsageRecord): Record<string, unknown>
⋮----
export function installLlmUsagePersistence(
  ctx?: EventsContextSource,
  onRecord?: (record: LlmUsageRecord) => void,
  options: { skipEmptySummary?: boolean } = {},
): () => void
⋮----
export function installLlmUsagePersistenceIfAbsent(ctx?: EventsContextSource): () => void
```

## File: src/llm/usage-telemetry.ts
```typescript
import { AsyncLocalStorage } from "node:async_hooks";
import { asNonEmptyString } from "../core/common";
⋮----
export interface LlmUsageRecord {

  stage?: string;

  engine?: string;

  process?: string;

  outcome: "success" | "error";

  modelSource: "response" | "configured";

  model?: string;

  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;

  reasoningTokens?: number;

  finishReason?: string;

  errorCode?: LlmUsageErrorCode;
}
⋮----
export type LlmUsageErrorCode =
  | "rate_limited"
  | "provider_error"
  | "provider_html_error"
  | "network_error"
  | "parse_error"
  | "timeout"
  | "aborted"
  | "unknown_error";
⋮----
export type LlmUsageSink = (record: LlmUsageRecord) => void;
⋮----
export interface LlmUsageAttribution {
  stage?: string;
  engine?: string;
  process?: string;
}
⋮----
export function withLlmStage<T>(stage: string, fn: () => T, attribution: Omit<LlmUsageAttribution, "stage"> =
⋮----
export function currentLlmStage(): string | undefined
⋮----
export function setLlmUsageSink(sink: LlmUsageSink): void
⋮----
export function getLlmUsageSink(): LlmUsageSink | undefined
⋮----
export function clearLlmUsageSink(): void
⋮----
export function hasLlmUsageSink(): boolean
⋮----
export function emitLlmUsage(record: LlmUsageRecord): void
⋮----
export interface RawUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  total_tokens?: unknown;
  completion_tokens_details?: { reasoning_tokens?: unknown } | null;
}
⋮----
function asFiniteNonNegative(value: unknown): number | undefined
⋮----
function asLlmUsageErrorCode(value: unknown): LlmUsageErrorCode | undefined
⋮----
export function decodeLlmUsageRecord(value: unknown): LlmUsageRecord | undefined
⋮----
export function extractUsageTokens(
  usage: RawUsage | null | undefined,
): Pick<LlmUsageRecord, "promptTokens" | "completionTokens" | "totalTokens" | "reasoningTokens">
```
