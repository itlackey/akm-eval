---
description: "Repo map of akm src/llm at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/llm

## src/llm/

### src/llm/client.ts

- `export type LlmCallErrorCode = Exclude<LlmUsageErrorCode, "unknown_error">;`
- `function isHtmlResponse(body: string): boolean`
- `function htmlExcerpt(body: string): string`
- `export class LlmCallError extends Error`
- `export interface ChatMessage`
- `export type ChatCompletionConfig =`
- `interface ChatCompletionResponse`
- `export interface ChatCompletionOptions`
- `export function sleep(ms: number): Promise<void>`
- `async function waitForRetry(ms: number, wait: (ms: number) => Promise<void>, signal?: AbortSignal): Promise<void>`
- `const onAbort = ()`
- `function retryBackoffMs(): number`
- `export function isContextSizeError(message: string): boolean`
- `function isTransportFailure(err: LlmCallError): boolean`
- `function isRetryable(err: LlmCallError): boolean`
- `interface ChatCompletionInternalOptions extends ChatCompletionOptions`
- `export function _setChatCompletionForTests(fake?: typeof chatCompletionReal): void`
- `export async function chatCompletion`
- `function timeBudget(totalMs: number | null): () => number | null`
- `async function chatCompletionReal`
- `function connectionKey(config: ChatCompletionConfig): string`
- `export function _resetEndpointSupportTrackersForTests(): void`
- `export function isJsonSchemaKnownUnsupported(config: ChatCompletionConfig): boolean`
- `export function isThinkingControlKnownRejected(config: ChatCompletionConfig): boolean`
- `function isRejectedRequest(err: unknown): err is LlmCallError`
- `async function chatCompletionAttempt`
- `const flushHeld = (): void =>`
- `type HeldUsage = { record?: LlmUsageRecord };`
- `async function retryWithoutSchema`
- `function sendsThinkingFields(config: ChatCompletionConfig, options: ChatCompletionOptions | undefined): boolean`
- `function requestFields`
- `async function chatCompletionAttemptOnce`
- `const remainingAttemptMs = (): number | undefined`
- `export async function probeLlmEndpoint`
- `export function probeEndpointOnce<T>`

### src/llm/embedder.ts

- `interface EmbedderOverridesForTests`
- `export function _setEmbedderForTests(fakes?: EmbedderOverridesForTests): void`
- `function getLocalEmbedder(): LocalEmbedder`
- `export function resetLocalEmbedder(): void`
- `export function localEmbeddingRuntime(): LocalEmbedder["runtime"]`
- `export async function embed`
- `async function embedOnce`
- `export async function embedBatch`
- `export function resolveEmbeddingModelId(embeddingConfig?: EmbeddingConnectionConfig): string`
- `export async function checkEmbeddingAvailability`

### src/llm/index-passes.ts

- `export interface ResolvedIndexPassExecution`
- `export function resolveIndexPassExecution(passName: string, config: AkmConfig): ResolvedIndexPassExecution`

### src/llm/memory-infer.ts

- `export interface DerivedMemoryDraft`
- `export interface MemoryInferNoChange`
- `export function isMemoryInferNoChange(value: unknown): value is MemoryInferNoChange`
- `export interface MemoryInferTelemetry`
- `function configuredTemperature(runner: RunnerSpec): number | undefined`
- `function parseDerivedMemory(raw: string): DerivedMemoryDraft | MemoryInferNoChange | undefined`
- `export async function compressMemoryToDerivedMemory`

### src/llm/model-list.ts

- `export type EndpointModels`
- `export async function listEndpointModels`
- `export function isEmbeddingModel(id: string): boolean`

### src/llm/rerank-client.ts

- `export interface CurateRerankConfig`
- `export class RerankCallError extends Error`
- `export interface RerankResult`
- `interface RerankResponseBody`
- `export async function rerankDocuments`

### src/llm/structured-call.ts

- `export interface CallStructuredRequest`
- `export interface CallStructuredOptions`
- `export type StructuredOutcome = Dispatched;`
- `function own(value: object | undefined, key: PropertyKey): boolean`
- `export function resolveStructuredCurrent`
- `function requireTerminalUserMessage(messages: readonly ChatMessage[]):`
- `function failed(error: string, result?: AgentRunResult): Extract<StructuredOutcome,`
- `export function outcomeOf(result: AgentRunResult): StructuredOutcome`
- `export async function callStructured(opts: CallStructuredOptions): Promise<StructuredOutcome>`

### src/llm/structured.ts

- `export interface StructuredFailure`
- `export type Dispatched<F extends object = StructuredFailure> = { ok: true; raw: string } | ({ ok: false } & F);`
- `export interface Correction`
- `type Refusal = Extract<Parsed<unknown>, { ok: false }>;`
- `export interface StructuredLoopOptions<T, F extends object = StructuredFailure>`
- `export type StructuredLoopResult<T, F extends object = StructuredFailure>`
- `export function isRefused<T, F extends object>`
- `export function correctionText(refusal: Refusal): string`
- `export async function structuredLoop<T, F extends object = StructuredFailure>`
- `export function jsonParser<T>(validate: (candidate: unknown) => Parsed<T>): (raw: string) => Parsed<T>`

### src/llm/usage-persist.ts

- `type EventsContextSource = EventsContext | (() => EventsContext);`
- `function toEventMetadata(record: LlmUsageRecord): Record<string, unknown>`
- `export function installLlmUsagePersistence`
- `export function installLlmUsagePersistenceIfAbsent(ctx?: EventsContextSource): () => void`

### src/llm/usage-telemetry.ts

- `export interface LlmUsageRecord`
- `export type LlmUsageErrorCode`
- `export type LlmUsageSink = (record: LlmUsageRecord) => void;`
- `export interface LlmUsageAttribution`
- `export function withLlmStage<T>(stage: string, fn: () => T, attribution: Omit<LlmUsageAttribution, "stage">`
- `export function currentLlmStage(): string | undefined`
- `export function setLlmUsageSink(sink: LlmUsageSink): void`
- `export function getLlmUsageSink(): LlmUsageSink | undefined`
- `export function clearLlmUsageSink(): void`
- `export function hasLlmUsageSink(): boolean`
- `export function emitLlmUsage(record: LlmUsageRecord): void`
- `export interface RawUsage`
- `function asFiniteNonNegative(value: unknown): number | undefined`
- `function asLlmUsageErrorCode(value: unknown): LlmUsageErrorCode | undefined`
- `export function decodeLlmUsageRecord(value: unknown): LlmUsageRecord | undefined`
- `export function extractUsageTokens`

## src/llm/embedders/

### src/llm/embedders/cache.ts

- `export function embedCacheKey(text: string, config?: EmbeddingConnectionConfig): string`
- `export function getCachedEmbedding(key: string): EmbeddingVector | undefined`
- `export function setCachedEmbedding(key: string, value: EmbeddingVector): void`
- `export function clearEmbeddingCache(): void`

### src/llm/embedders/connection.ts

- `export function effectiveEmbedding(config: AkmConfig): EmbeddingConnectionConfig | undefined`

### src/llm/embedders/deterministic.ts

- `export function isDeterministicEmbedEnabled(): boolean`
- `function fnv1a(str: string): number`
- `function tokenize(text: string): string[]`
- `export function deterministicEmbed(text: string, dim: number = DETERMINISTIC_EMBED_DIM): EmbeddingVector`

### src/llm/embedders/local-model-files.ts

- `function isEnabledEnvironmentFlag(value: string | undefined): boolean`
- `async function downloadFile(url: string, target: string): Promise<void>`
- `export async function ensureLocalModelFiles(modelName: string): Promise<string>`

### src/llm/embedders/local.ts

- `type LocalPipeline = (texts: string[]) => Promise<Float32Array[]>;`
- `export class LocalRuntimeUnavailableError extends Error`
- `export type LocalPipelineLoader = (modelName: string) => Promise<LocalPipeline>;`
- `export function _setLocalPipelineLoaderForTests(fake?: LocalPipelineLoader): void`
- `function resolveLocalModelName(overrideModel?: string): string`
- `async function loadRuntime(): ReturnType<typeof loadOnnxRuntime>`
- `function meanPooled(hidden: Float32Array, offset: number, tokens: number, dim: number): Float32Array`
- `async function loadOnnxPipeline(modelName: string): Promise<LocalPipeline>`
- `const readJson = (file: string): object`
- `export class LocalEmbedder implements Embedder`

### src/llm/embedders/onnx-runtime.ts

- `function thisPlatform(): string`
- `export function hasLocalEmbeddings(): boolean`
- `export function noLocalEmbeddingsReason(): string`
- `export class OnnxTensor`
- `interface Binding`
- `export interface OnnxSession`
- `async function fetchOnnxRuntime(directory: string): Promise<string>`
- `async function loadBinding(): Promise<Binding>`
- `export async function loadOnnxRuntime(): Promise<`

### src/llm/embedders/profile.ts

- `export interface EmbeddingProfile`
- `function embeddingModelName(config: EmbeddingConnectionConfig | undefined): string`
- `export function resolveEmbeddingProfile(config: EmbeddingConnectionConfig | undefined): EmbeddingProfile`
- `export function applyEmbeddingTemplate(template: string | undefined, text: string): string`
- `export function documentTemplateFingerprint(config: EmbeddingConnectionConfig | undefined): string`

### src/llm/embedders/remote.ts

- `export function estimateTokenCount(text: string): number`
- `export function capEmbeddingText(text: string, maxTokens: number):`
- `export function resolveEmbeddingTimeoutMs(config: EmbeddingConnectionConfig): number`
- `export function scaleEmbeddingTimeoutMs(timeoutMs: number, requestTokens: number, tokenBudget: number): number`
- `export function isEmbeddingTimeoutError(err: unknown): boolean`
- `export function _setEmbeddingTimeoutBackoffForTests(config?:`
- `export function embeddingTimeoutRetryBackoffMs(timeoutAttempt = 0): number`
- `export type EmbeddingSkipReason = "context-window-exceeded" | "batch-request-failed";`
- `export type EmbeddingFailureKind = "timeout" | "network-error";`
- `export interface EmbeddingBatchSkip`
- `export type EmbeddingSkipHandler = (skip: EmbeddingBatchSkip) => unknown;`
- `export interface EmbeddingBatchOutcome`
- `export type EmbeddingBatchCommit =`
- `export class ContextExceededError extends Error`
- `export function isContextExceededResponse(status: number, body: string): boolean`
- `export function resolveEmbeddingConcurrency(config: EmbeddingConnectionConfig): number`
- `interface TextBatch`
- `export function buildTokenBoundedBatches(texts: readonly string[], tokenBudget: number, maxCount: number): TextBatch[]`
- `const flush = (): void =>`
- `export class RemoteEmbedder implements Embedder`
- `const maybeShrinkBudget =`
- `const stopDispatch = (reason?: unknown): void =>`
- `const commitBatch =`
- `const requestAndCommit = async`
- `const runProviderBatch = async (textBatch: TextBatch, batchIndex: number): Promise<void> =>`
- `function l2Normalize(vec: number[]): number[]`
- `export function normalizeEmbeddingEndpoint(endpoint: string): string`
- `function embeddingEndpointPathHint(endpoint: string): string`
- `function resolveOllamaOptions(config: EmbeddingConnectionConfig):`
- `export function hasRemoteEndpoint(config: EmbeddingConnectionConfig): boolean`
- `function embeddingSlot(config: EmbeddingConnectionConfig): CredentialSlot`
- `export function describeEmbeddingCredential(config: EmbeddingConnectionConfig): string`

### src/llm/embedders/types.ts

- `export type EmbeddingVector = number[];`
- `export interface Embedder`
- `export type EmbeddingCheckResult`
- `export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number`
