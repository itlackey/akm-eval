---
description: "Repo map of akm src/core at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/core

## src/core/

### src/core/abort-deadline.ts

- `export interface AbortDeadlineOptions`
- `export interface AbortDeadline`
- `export function armAbortDeadline(controller: AbortController, options: AbortDeadlineOptions): AbortDeadline`

### src/core/assert.ts

- `export function assertNever(x: never, context?: string): never`

### src/core/authoring-rules.ts

- `export function requiresDescription(type: string): boolean`
- `export function authoringRulesForType(type: string): string`

### src/core/best-effort.ts

- `export function bestEffort<T>(fn: () => T, context?: string): T | undefined`
- `export async function bestEffortAsync<T>(fn: () => Promise<T>, context?: string): Promise<T | undefined>`

### src/core/bundle-id.ts

- `export function slugForPath(sourcePath: string): string`
- `export function slugForRegistryId(registryId: string): string`
- `function slugify(name: string): string`
- `export function validateExplicitBundleName`
- `export function deriveBundleId(registryId: string | undefined, sourcePath: string, usedIds: Set<string>): string`
- `export function deriveBundleIds(sources: readonly`
- `function ensureUniqueId(preferred: string, sourcePath: string, used: Set<string>): string`
- `export function shortHash(input: string): string`

### src/core/bundle-rename.ts

- `export interface BundleRenamePlan`
- `export interface BundleRenameResult extends BundleRenamePlan`
- `function validateRename(config: AkmConfig, oldId: string, newId: string): void`
- `function bundleOfRef(ref: string): string | undefined`
- `function schedulerRefsToRewrite(config: AkmConfig, oldId: string): string[]`
- `function renameBundleInConfig(config: AkmConfig, oldId: string, newId: string): AkmConfig`
- `function filesStillMentioning(filePaths: string[], oldId: string): string[]`
- `function invocationNamesBundle(invocation: readonly string[] | undefined, bundleId: string): boolean`
- `async function nativeSchedulerRowsNamingBundle(sched: SchedulerBackend, oldId: string): Promise<string[]>`
- `async function buildPlan`
- `function taskSyncErrorMessage(cause: unknown): string`
- `async function removeStaleNativeSchedulerRows(sched: SchedulerBackend, oldId: string): Promise<void>`
- `export async function renameBundle`

### src/core/closest-match.ts

- `function editDistance(a: string, b: string): number`
- `export function closestMatch(attempted: string, candidates: readonly string[], threshold: number): string | undefined`

### src/core/common.ts

- `export function isHttpUrl(value: string | undefined): boolean`
- `export function isRemoteUrl(value: string | undefined): boolean`
- `export function readTextFileDescriptorWithLimit`
- `export function readTextFile(filePath: string, label = "File"): string`
- `export function stripJsonComments(text: string): string`
- `export function existingFileMode(filePath: string): number`
- `export function writeFileAtomic(target: string, content: string | Buffer, mode?: number): void`
- `export function resolveStashDir(env: NodeJS.ProcessEnv = process.env): string`
- `function validateStashDir(raw: string): string`
- `function isValidDirectory(dir: string): boolean`
- `function readStashDirFromConfig(): string | undefined`
- `export function toPosix(input: string): string`
- `export function compareCodePoints(left: string, right: string): number`
- `export function hasErrnoCode(error: unknown, code: string): boolean`
- `export function isChmodUnsupported(error: unknown): boolean`
- `export function isWithin(candidate: string, root: string): boolean`
- `export function isAkmRegistryCachePath(filePath: string): boolean`
- `export function isContainedResolvedPath(resolvedCandidate: string, resolvedRoot: string): boolean`
- `export function safeRealpath(p: string): string`
- `function normalizeFsPathForComparison(value: string): string`
- `export async function fetchWithTimeout`
- `const abortExternal = (): void`
- `export function shouldRetry(status: number): boolean`
- `export function backoffDelay(attempt: number, baseDelay = 500, maxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS): number`
- `export function computeRetryDelay`
- `export async function fetchWithRetry`
- `export function abortableDelay(ms: number, signal?: AbortSignal | null, abortMessage = "Aborted"): Promise<void>`
- `const onAbort = () =>`
- `export function tryReadStdinText(): string | undefined`
- `export class ResponseTooLargeError extends Error`
- `export class BodyReadTimeoutError extends Error`
- `export interface BodyReadLimits`
- `function bodyAbortError(signal: AbortSignal | undefined, url: string): Error`
- `export async function readChunkWithDeadline<T>`
- `type ReadResult = Awaited<ReturnType<ReadableStreamDefaultReader<T>["read"]>>;`
- `const cleanup = (): void =>`
- `export async function readBodyWithByteCap`
- `export async function jsonWithByteCap<T = unknown>`
- `export function toErrorMessage(error: unknown): string`
- `export function todayIso(): string`
- `export function localDateStamp(d: Date): string`
- `export function timestampForFilename(): string`
- `export function asNonEmptyString(value: unknown): string | undefined`
- `export function scanEnvKeyNames(text: string): string[]`
- `export function wellFormedUnicode(value: string): boolean`
- `export function isRecord(value: unknown): value is Record<string, unknown>`
- `export function asRecord(value: unknown): Record<string, unknown> | undefined`
- `function stripTrailingCommas(text: string): string`
- `export function parseJsonc(text: string): unknown`
- `export function tryParseJson(raw: string): unknown`
- `export function stringArray(value: unknown): string[]`
- `export function isProcessAlive(pid: unknown): boolean`
- `export function daysToMs(days: number): number`
- `export function groupBy<T>(values: T[], keyFn: (value: T) => string): Map<string, T[]>`

### src/core/concurrent.ts

- `export function serializeByKey<T>`
- `export async function concurrentMap<T, R>`
- `async function worker(): Promise<void>`

### src/core/content-safety.ts

- `export function containsRedactedContent(content: string): boolean`
- `export function containsReflectPromptScaffolding(content: string): boolean`
- `export function generatedContentRejection(content: string): string | undefined`

### src/core/endpoint-url.ts

- `function parse(endpoint: string): URL | undefined`
- `function basePathname(url: URL): string`
- `function withPathname(url: URL, pathname: string): string`
- `export function openAiBaseUrl(endpoint: string): string`
- `export function openAiOperationUrl(endpoint: string, operation: "chat/completions" | "models"): string`
- `export function sameEndpoint(a: string, b: string): boolean`

### src/core/env-secret-ref.ts

- `export function listEnvsRecursive`
- `const walk = (dir: string): void =>`
- `export function parseEnvRef(ref: string): AssetRef`
- `export function parseSecretRef(ref: string): AssetRef`
- `export function makeSecretRef(name: string, source?: IndexSearchSource): string`
- `function displayDefaultBundle(source?: IndexSearchSource, config: AkmConfig = loadConfig()): string | undefined`
- `export function resolveSecretPath(ref: string):`
- `export interface EnvWriteResolution`
- `export function resolveEnvWriteTarget`
- `export interface SecretWriteResolution`
- `export function resolveSecretWriteTarget`
- `export function withEnvSecretWrite<T>`

### src/core/errors.ts

- `export type ConfigErrorCode`
- `export type UsageErrorCode`
- `export type TransientErrorCode`
- `export type NotFoundErrorCode`
- `export type AkmErrorKind = "config" | "usage" | "not-found" | "transient";`
- `export abstract class AkmError extends Error`
- `export class ConfigError extends AkmError`
- `export class UsageError extends AkmError`
- `export class TransientError extends AkmError`
- `export class NotFoundError extends AkmError`
- `export function isTestIsolationError(err: unknown): boolean`
- `export function rethrowIfTestIsolationError(err: unknown): void`
- `export function isDataDirUnreadableError(err: unknown): err is ConfigError`
- `export function rethrowIfDataDirUnreadable(err: unknown): void`

### src/core/events-types.ts

- `export interface EventEnvelope`

### src/core/events.ts

- `export type EventType`
- `export interface AppendEventInput`
- `export interface EventsContext`
- `function resolveDbPath(ctx?: EventsContext): string`
- `function resolveNow(ctx?: EventsContext): () => number`
- `export function appendEvent(input: AppendEventInput, ctx?: EventsContext): void`
- `export interface ReadEventsOptions`
- `export interface ReadEventsResult`
- `export function readEvents(options: ReadEventsOptions`

### src/core/extra-params.ts

- `function protectedKeyRemedy(normalized: string): string | undefined`
- `export interface ExtraParamsIssue`
- `export function normalizeExtraParamKey(key: string): string`
- `export function validateExtraParams(value: unknown): ExtraParamsIssue[]`
- `const visit = (entry: unknown, path: (string | number)[]): void =>`
- `export function formatExtraParamsIssue(label: string, issue: ExtraParamsIssue): string`

### src/core/file-change.ts

- `export type FileChangeOp = "create" | "update" | "delete";`
- `export function proposalContent(p:`
- `export interface FileChange`

### src/core/file-lock.ts

- `export type LockProbeResult`
- `export interface ReclaimStaleLockOptions`
- `export interface LockFileIdentity`
- `export interface LockOwnership`
- `function readLockSnapshot(lockPath: string):`
- `function sameIdentity(left: LockFileIdentity, right: LockFileIdentity): boolean`
- `function releaseLockRaw(lockPath: string): void`
- `export function tryAcquireLockSync(lockPath: string, payload: string): LockOwnership | undefined`
- `export function launcherPidFromEnv(): number | undefined`
- `export function createLockPayload(metadata: Record<string, unknown>`
- `export function probeLock(lockPath: string): LockProbeResult`
- `export function reclaimStaleLock`
- `export function releaseLock(ownership: LockOwnership): void`
- `function extractLockIdentity(content: string):`

### src/core/git-message.ts

- `export function sanitizeCommitMessage(input: string): string`

### src/core/improve-result.ts

- `export type ImproveResultEnvelope = AkmImproveResult;`
- `export interface DecodedImproveResult`
- `function fail(message: string): never`
- `function requireExactFields(value: Record<string, unknown>, allowed: Set<string>): void`
- `function requireNumber(value: Record<string, unknown>, field: string, path: string): void`
- `function requireCount(value: Record<string, unknown>, field: string, path: string): void`
- `function validateLoweringNotices(value: unknown): void`
- `function validateConsolidationPlan(value: unknown): void`
- `function validateProactivePlan(value: unknown): void`
- `function validateProcessRoutingRows(value: unknown): void`
- `function validateImprovePlan(value: unknown, dryRun: boolean, plannedRefNames: readonly string[]): void`
- `function validateCommon(value: Record<string, unknown>): void`
- `export function decodeImproveResult(input: string | unknown): DecodedImproveResult`

### src/core/improve-types.ts

- `export type MemoryPruneReason = "duplicate-derived" | "superseded-derived" | "obsolete-derived";`
- `export type RetireArchiveReason = "duplicate" | "subsumed" | "superseded" | "promoted";`
- `export type MemoryBeliefState = "active" | "asserted" | "deprecated" | "superseded" | "contradicted" | "archived";`
- `export interface MemoryPruneCandidate`
- `export interface MemoryConsolidationCandidate`
- `export interface MemoryContradictionCandidate`
- `export interface MemoryBeliefStateTransition`
- `export interface RelativeDateCandidate`
- `export interface DeadUrl`
- `export interface DeadUrlCoverage`
- `export interface ArchivedMemoryCleanupRecord`
- `export interface ImproveEligibleRef`
- `export type ImprovePlanLane = EligibilitySource | "distill-only";`
- `export interface ImprovePlanGate`
- `export interface ImproveIndexSnapshot`
- `export interface ImproveExecutionPlan`
- `export type ImproveActionMode`
- `export type ImproveActionClass = "accepted" | "rejected" | "skipped" | "error" | "noop";`
- `export function classifyImproveAction(mode: ImproveActionMode): ImproveActionClass`
- `export type ConsolidateOpKind = "merge" | "delete" | "promote" | "contradict";`
- `export interface ConsolidateResult`
- `export type ConsolidatePairJudgeLabel`
- `export interface ConsolidatePairPassResult`
- `export interface ConsolidatePerfTelemetry`
- `export type DistillOutcome`
- `export interface AkmDistillResult`
- `export interface ExtractedSessionResult`
- `export interface AkmExtractResult`
- `export interface AkmReflectFailure`
- `export interface AkmReflectSuccess`
- `export type AkmReflectResult = AkmReflectSuccess | AkmReflectFailure;`
- `export interface ImproveActionResult`
- `export interface DistillSkippedAggregate`
- `export function foldDistillSkipped(actions: ImproveActionResult[]):`
- `export interface ImproveMemoryCleanupResult`
- `export interface AkmImproveResult`

### src/core/json-schema.ts

- `export function validateJsonSchemaSubset`
- `export interface SchemaDefinitionIssue`
- `export function checkJsonSchemaDefinition(schema: Record<string, unknown>): SchemaDefinitionIssue[]`
- `function pointerFor(path: ReadonlyArray<string | number>): string`
- `function pushIssue`
- `function isSupportedEnumValue(value: unknown): value is string | number | boolean | null`
- `function checkDefinitionNode`
- `type JsonTypeName = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";`
- `function typeOf(value: unknown): JsonTypeName`
- `function matchesType(actual: JsonTypeName, expected: string): boolean`
- `interface EvalCtx`
- `function branchErrors(value: unknown, schema: Record<string, unknown>, path: string, ctx: EvalCtx): string[]`
- `function combinatorBranches(schema: Record<string, unknown>, keyword: string): Record<string, unknown>[]`
- `function summarizeBranchFailures(failures: Array<`
- `function validateCombinators(value: unknown, schema: Record<string, unknown>, path: string, ctx: EvalCtx): void`
- `function validateNode(value: unknown, schema: Record<string, unknown>, path: string, ctx: EvalCtx): void`

### src/core/lesson-lint.ts

- `export interface LessonLintFinding`
- `export interface LessonLintReport`
- `function isNonEmptyString(value: unknown): value is string`
- `export function lintLessonContent(raw: string, pathForMessages: string): LessonLintReport`

### src/core/llm-inference.ts

- `export type LlmInference = z.infer<typeof LlmInvocationOverridesSchema>;`
- `export function thinkingSetting(request: Readonly<Record<string, unknown>>): boolean | undefined`
- `export function inferenceWireFields(inference: LlmInference | undefined): Record<string, unknown>`
- `export function mergeRequestFields`
- `function withoutOwnedFields(request: Record<string, unknown>): Record<string, unknown>`
- `export function effectiveRequestFields`

### src/core/logs-db.ts

- `export function getLogsDbPath(): string`
- `export function openLogsDatabase(dbPath?: string): Database`
- `export function runMigrations(db: Database): void`
- `export type TaskLogStream = "stdout" | "stderr";`
- `export type TaskLogLevel = "info" | "warn" | "error";`
- `export interface TaskLogRow`
- `export function buildTaskRunId(taskId: string, startedAtIso: string): string`
- `export interface TaskLogLineInput`
- `export function insertTaskLogLines`
- `export interface QueryTaskLogsOptions`
- `export function queryTaskLogs(db: Database, options: QueryTaskLogsOptions`
- `export function getLoggedRunIds(db: Database, runIds: readonly string[]): Set<string>`
- `export function purgeOldTaskLogs(db: Database, retentionDays = 90): number`

### src/core/loopback.ts

- `export function isLoopbackHost(host: string): boolean`
- `export function isLoopbackEndpoint(endpoint: string | undefined): boolean`
- `export function defaultConcurrencyForEndpoint(endpoint: string | undefined): 1 | 2`

### src/core/mutation-target.ts

- `export interface ResolvedMutationTarget`
- `interface CanonicalSource`
- `function canonicalSources(config: AkmConfig): CanonicalSource[]`
- `function targetForCanonicalSource`
- `export function canonicalBundleIdForTarget(config: AkmConfig, target: ResolvedWriteTarget): string`
- `export function resolveBundleWriteTarget`
- `function resolveExplicitMutationTarget`
- `export function resolveMutationTarget`
- `export function defaultBundleForTarget(config: AkmConfig): string | undefined`

### src/core/network-policy.ts

- `export type HostnameResolver = (hostname: string) => Promise<string[]>;`
- `export type NetworkAddressClass`
- `export function bareHostname(hostname: string): string`
- `export async function resolveHostnameAddresses(hostname: string, resolver?: HostnameResolver): Promise<string[]>`
- `async function defaultResolveHostname(hostname: string): Promise<string[]>`
- `export function classifyNetworkHostname(hostname: string): NetworkAddressClass`
- `export function classifyNetworkAddress(address: string): NetworkAddressClass`
- `function classifyIpv4(address: string): NetworkAddressClass`
- `function classifyIpv6(address: string): NetworkAddressClass`
- `function inIpv6Range(value: bigint, prefix: string, bits: number): boolean`
- `function parseIpv6Words(address: string): number[] | null`
- `function ipv6Value(address: string): bigint | null`
- `function embeddedIpv4Address(words: number[]): string | null`
- `function ipv4FromHextets(high: number, low: number): string`

### src/core/non-task-input.ts

- `export function nonTaskInput(query: string): string | undefined`

### src/core/npm-package.ts

- `function sha512Integrity(file: string): Promise<string>`
- `export async function verifyIntegrity(file: string, expected: string): Promise<void>`
- `async function registryDocument(url: string): Promise<`
- `export async function fetchNpmPackageFiles`
- `` const partial = (file: string): string => path.join(directory, `.$ ``

### src/core/parent-watchdog.ts

- `export function isReparented(initialPpid: number, currentPpid: number): boolean`
- `export interface ParentDeathWatchdogOptions`
- `export interface ParentDeathWatchdog`
- `export function startParentDeathWatchdog(options: ParentDeathWatchdogOptions): ParentDeathWatchdog`

### src/core/parse.ts

- `export function stripThinkBlocks(raw: string): string`
- `export function stripCodeFences(raw: string): string`
- `export function escapeJsonStringControls(raw: string): string`
- `export function parseJsonResponse<T = unknown>(raw: string): T | undefined`
- `export function parseEmbeddedJsonResponse<T = unknown>(raw: string): T | undefined`

### src/core/path-access.ts

- `export type PathAccess = "present" | "absent" | "inaccessible";`
- `export interface PathAccessResult`
- `function errnoOf(error: unknown): string | undefined`
- `export function classifyPathAccess(target: string): PathAccessResult`
- `export function isPathAbsent(target: string): boolean`
- `export function describeInaccessiblePath(target: string, code?: string): string`

### src/core/paths.ts

- `function isUnderBunTest(env: NodeJS.ProcessEnv): boolean`
- `export function isTransientStashPath(p: string): boolean`
- `function testIsolationError(): ConfigError`
- `export function getConfigDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string`
- `export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string`
- `export function getCacheDir(env: NodeJS.ProcessEnv = process.env): string`
- `function homelessFallbackDir(kind: string): string`
- `export function getDataDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string`
- `export function getDbPath(env: NodeJS.ProcessEnv = process.env): string`
- `export function getIndexWriterLockPath(): string`
- `export function getIndexRebuildLockPath(): string`
- `export function getStateDbPathInDataDir(): string`
- `export function getLockfilePath(): string`
- `export function getLockfileLockPath(): string`
- `export function getRegistryCacheDir(): string`
- `export function getRegistryIndexCacheDir(): string`
- `export function getStateDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string`
- `export function getStashStateKey(stashDir: string): string`
- `function stashScopedDir(base: string, stashDir: string): string`
- `export function getUnresolvedSourcesDir(stashDir: string): string`
- `export function getStashLocksDir(stashDir: string): string`
- `export function akmLocations(): Record<string, string>`
- `export function childProcessEnv(): Record<string, string>`
- `export function getTaskLogDir(): string`
- `export function getRunLogDir(kind: "improve" | "index"): string`
- `export function getDefaultStashDir(env: NodeJS.ProcessEnv = process.env): string`
- `export function assertSafeStashDir(stashDir: string, env: NodeJS.ProcessEnv = process.env): void`

### src/core/platform.ts

### src/core/recognition-util.ts

- `export function canonicalizeWorkflowName(name: string): string`
- `export type KnownType = (typeof KNOWN_TYPES)[number];`
- `export function isKnownType(type: string): type is KnownType`

### src/core/redaction.ts

- `function normalizedQueryKey(key: string): string`
- `function collectCredentialParameters(params: URLSearchParams, values?: Set<string>): boolean`
- `function addEncodedCredentialVariants(rawValue: string, values?: Set<string>): void`
- `function collectEncodedCredentialParameters(raw: string, values?: Set<string>): boolean`
- `function collectCredentialFragment(fragment: string, values?: Set<string>): boolean`
- `function inspectCredentialBearingUrl(value: string, values?: Set<string>): boolean`
- `export function isInferredSecretName(name: string): boolean`
- `export function collectInferredSecretValues(env: NodeJS.ProcessEnv): string[]`
- `export function collectSensitiveValues(rawValues: Iterable<string | undefined>): string[]`
- `interface NormalizedText`
- `function utf8SequenceLength(firstByte: number): number`
- `function normalizeEncodedText(value: string, plusAsSpace: boolean): NormalizedText`
- `const append = (decoded: string, start: number): void =>`
- `function addMappedMatches(coverageDelta: Int32Array, haystack: NormalizedText, needle: string): void`
- `function addPlainMatches(coverageDelta: Int32Array, text: string, needle: string): void`
- `function identifierWords(identifier: string): string[]`
- `function isCredentialLikeKeyName(identifier: string): boolean`
- `function redactNamedCredentialValues(input: string): string`
- `export function redactCredentialPatterns(input: string): string`
- `export function redactErrorBody(input: string): string`
- `function jsonEscapedSpellings(value: string): string[]`
- `export function redactSensitiveText(text: string, sensitiveValues: Iterable<string>): string`
- `const addMatchesForMode = (plusAsSpace: boolean): void =>`
- `export function redactSensitiveValue<T>(value: T, sensitiveValues: Iterable<string>): T`
- `const redact = (entry: unknown): unknown =>`
- `export function redactUrlCredentials(value: string): string`

### src/core/ref-token.ts

- `function isRefBody(body: string, isBundleInstalled?: (bundle: string) => boolean): boolean`
- `export function isRefToken(value: string): boolean`
- `export function isSecretRefToken(value: string): boolean`
- `export interface RefTokenResolution`
- `export function substituteRefTokens`

### src/core/registry-url.ts

- `export interface RegistryUrlDescriptor`
- `type RegistryUrlScanMode = "strict" | "diagnostic";`
- `interface RegistryUrlStart`
- `interface UserinfoSpan`
- `type StrictInspectionReason = "credentials" | "malformed-encoding" | "inspection-limit";`
- `interface StrictInspection`
- `interface StrictWalkState`
- `interface PercentDecodeResult`
- `export function hasRegistryUrlCredentials(raw: string): boolean`
- `export function formatRegistryUrl(raw: string): string`
- `export function formatRegistryLabel(entry: RegistryUrlDescriptor): string`
- `export function formatRegistryCredentialWarning(entry: RegistryUrlDescriptor): string`
- `export function registryEntryForOutput<T extends RegistryUrlDescriptor>(entry: T): T`
- `export function redactCredentialBearingUrls(message: string): string`
- `export function formatRegistryError(error: unknown): string`
- `function inspectStrictRegistryUrl(raw: string): StrictInspection`
- `function inspectParsedStrictUrl(parsed: URL, state: StrictWalkState, depth: number): void`
- `function inspectAuthoredStrictComponent`
- `function inspectStrictComponent(raw: string, state: StrictWalkState, depth: number): void`
- `function unseenCandidateIndices`
- `function inspectStrictUrlCandidates`
- `function everyPercentEscapeIsCovered(raw: string, ranges: Array<`
- `function inspectDecodedCandidateUserinfo(raw: string, state: StrictWalkState, depth: number): number`
- `function strictAuthoritySlice(raw: string): string`
- `function decodePercentSafely(raw: string, mode: "component" | "query"): PercentDecodeResult`
- `function splitAuthoredFieldComponents(raw: string): string[]`
- `function findStrictComponentUserinfoSpan(raw: string, urlStart: RegistryUrlStart): UserinfoSpan | undefined`
- `function trimStrictCandidateSuffix(raw: string): string`
- `function hasCredentialLikeUrlEvidence(raw: string): boolean`
- `function looksLikeStrictUrlComponent(raw: string): boolean`
- `function decodePercentForEvidence(raw: string): string`
- `function stripMalformedPercentForEvidence(raw: string): string`
- `function redactDetectedUserinfo(raw: string, mode: RegistryUrlScanMode): string`
- `function registryUrlStarts(raw: string): RegistryUrlStart[]`
- `function findUserinfoSpan`
- `function userinfoSpan(authorityStart: number, lastAt: number): UserinfoSpan | undefined`
- `function looksLikeDiagnosticHostPrefix(raw: string): boolean`
- `function parseWholeHttpUrl(raw: string): URL | undefined`

### src/core/run-lock.ts

- `export interface RunLockHolder`
- `export function formatLockHolderPid(holder: Pick<RunLockHolder, "pid" | "launcherPid">): string`
- `export type RunLockAcquireResult`
- `export interface RunLockReclaimInfo`
- `export interface TryAcquireRunLockOptions`
- `function parseLockPayload`
- `function holderOf(lock:`
- `export function tryAcquireRunLock(lockPath: string, options: TryAcquireRunLockOptions): RunLockAcquireResult`
- `const lockPayload = () => createLockPayload`

### src/core/secret-value.ts

- `export function readValue(secretPath: string): string`

### src/core/sensitive-marker-path.ts

- `export function sensitiveMarkerPath(assetPath: string, type: "env" | "secret"): string`

### src/core/state-db-scope.ts

- `interface StateDbScope`
- `function installExitBackstop(): void`
- `function closeAllStateDbScopes(): void`
- `function closeScope(scope: StateDbScope): void`
- `export function borrowScopedStateDb(dbPath?: string): Database | undefined`
- `export async function withStateDbScope<T>(fn: () => Promise<T>, opts?:`
- `export function openScopedStateDbCount(): number`

### src/core/state-db.ts

- `export function getStateDbPath(): string`
- `function warnNewerStateLedger(ledger: MigrationLedgerState): void`
- `function backupBeforeDestructiveMigration`
- `export interface StateDatabaseMigrationReport`
- `function migrateStateDatabase(db: Database, dbPath: string): StateDatabaseMigrationReport`
- `function openAndMigrate(dbPath: string): StateDatabaseMigrationReport &`
- `export function openStateDatabase(dbPath: string = getStateDbPath()): Database`
- `export function openStateDatabaseWithReport`
- `export function listPendingStateMigrations(dbPath: string = getStateDbPath()): string[]`
- `export interface HistoricalStateUpgradeResult`
- `export function upgradeHistoricalStateDatabase(dbPath: string = getStateDbPath()): HistoricalStateUpgradeResult`
- `export function withStateDb<T>(fn: (db: Database) => T, opts?:`
- `export function withStateDbTelemetry(fn: (db: Database) => void, busyTimeoutMs = 250): void`
- `export function listExistingTableNames(db: Database, names: readonly string[]): Array<`

### src/core/structured.ts

- `export type Parsed<T>`
- `export function withSchemaInstruction(prompt: string, schema: unknown): string`

### src/core/subprocess.ts

- `export interface SpawnedSubprocess`
- `export type SpawnFn =`
- `export function spawnsOwnProcessGroup(platform: NodeJS.Platform = process.platform): boolean`
- `export function buildSpawnOptions`
- `export function killGroup(proc: SpawnedSubprocess, signal: "SIGINT" | "SIGTERM" | "SIGKILL"): void`
- `function groupRunning(proc: SpawnedSubprocess): boolean`
- `export function scheduleKillLadder`
- `const afterGrace = (run: () => void): void =>`
- `const terminate = (): void =>`
- `interface LiveGroupChild`
- `function removeSignalGuard(): void`
- `function registerLiveGroupChild(child: LiveGroupChild): () => void`
- `function installSignalGuard(): void`
- `const handler = (): void =>`
- `export interface StreamReadResult`
- `export function streamCaptureFailure(stdout: StreamReadResult, stderr: StreamReadResult): string | undefined`
- `function errorText(error: unknown): string`
- `function utf8BoundaryAtOrBefore(value: Uint8Array, limit: number): number`
- `export async function readStream`
- `const absorb = (value: Uint8Array): void =>`
- `const arm = () =>`
- `export interface RunManagedSubprocessOptions`
- `export interface ManagedSubprocessResult`
- `function toError(err: unknown): Error`
- `export async function runManagedSubprocess`
- `const onAbort = () =>`

### src/core/system-error.ts

- `export function systemErrorCode(error: unknown): string | undefined`
- `export function isReadOnlyFilesystemError(error: unknown): boolean`

### src/core/tar.ts

- `class ByteReader`
- `const field = (header: Buffer, start: number, end: number): string =>`
- `export async function extractTarGzMembers`
- `async function extractFrom`

### src/core/text-truncation.ts

- `export function detectTruncatedDescription(description: string): string | null`
- `function stripTrailingTruncationFragment(clause: string): string`
- `function splitSentences(text: string): string[]`
- `function isUsableClause(candidate: string): boolean`
- `function ensureTerminalPunctuation(clause: string): string`
- `export function repairTruncatedDescription(description: string, body?: string): string`

### src/core/time.ts

- `export function parseDuration(spec: string, units: Readonly<Record<string, number>> = DURATION_UNITS): number | null`
- `export function parseSinceToIso(since: string): string`

### src/core/trash.ts

- `function homeDir(): string`
- `function moveToXdgTrash(target: string): void`
- `export function moveToTrash(target: string, tools: ReadonlyArray<readonly string[]> = LINUX_TRASH_TOOLS): void`

### src/core/tty.ts

- `export function shouldDecorate(): boolean`
- `export function plainize(text: string): string`

### src/core/type-presentation.ts

- `export interface Presentation`
- `function shellQuote(value: string): string`
- `function buildWorkflowAction(ref: string): string`
- `export function presentationFor(type: string | undefined): Presentation`
- `export function allowsFragmentRef(type: string): boolean`

### src/core/warn.ts

- `export type WarnSinkForTests = (level: "info" | "warn" | "error" | "warnVerbose", args: unknown[]) => void;`
- `export function _setWarnSinkForTests(fake?: WarnSinkForTests): void`
- `export function setQuiet(value: boolean): void`
- `export function resetQuiet(): void`
- `export function isQuiet(): boolean`
- `export async function withQuiet<T>(fn: () => Promise<T>): Promise<T>`
- `export function setVerbose(value: boolean): void`
- `export function resetVerbose(): void`
- `export function isVerbose(): boolean`
- `export function setLogFile(filePath: string): void`
- `export function clearLogFile(): void`
- `function appendToLogFile(level: "INFO" | "WARN" | "ERROR", args: unknown[]): void`
- `export function info(...args: unknown[]): void`
- `export function warn(...args: unknown[]): void`
- `export function warnOnce(key: string, ...args: unknown[]): void`
- `export function _resetWarnOnceForTests(): void`
- `export function error(...args: unknown[]): void`
- `export function warnVerbose(...args: unknown[]): void`

### src/core/write-provenance.ts

- `interface JournalState`
- `export interface WriteProvenanceJournal`
- `export function beginWriteProvenance(): WriteProvenanceJournal`
- `const snapshot = (): string[]`
- `export function isWriteProvenanceActive(): boolean`
- `export function recordWrittenPath(filePath: string | undefined | null): void`
- `export function relativeWrittenPath(root: string, absolutePath: string): string | undefined`

### src/core/write-source.ts

- `export interface WriteTargetSource`
- `export interface ResolvedWriteTarget`
- `export function resolveWritable(entry: Pick<SourceConfigEntry, "type" | "writable">): boolean`
- `export function isSourceWriteActivated(source:`
- `export function isWriteCapableSourceKind(kind: string): kind is "filesystem" | "git"`
- `export interface WriteTargetOptions`
- `export function assertBundleNotDisabled(akmConfig: AkmConfig, name: string): void`
- `export function resolveWriteTarget`
- `export function resolveWorkingStashTarget`
- `function adaptConfiguredSource(runtime: ConfiguredSource): ResolvedWriteTarget`
- `export function resolveGitContentRoot(repoPath: string): string`
- `function pathFromConfiguredSource(runtime: ConfiguredSource): string | undefined`
- `export function assertAkmAssetWrite(source: WriteTargetSource, allowedAdapters: readonly string[] = ["akm"]): void`
- `export function prepareWriteTargetForMutation`
- `export async function writeAssetToSource`
- `export async function deleteAssetFromSource`
- `function ensureWritable(source: WriteTargetSource, config: SourceConfigEntry): void`
- `function assertSupportedKind(source: WriteTargetSource): void`
- `function resolveAssetFilePath(source: WriteTargetSource, ref: AssetRef): string`
- `export function findAbsoluteHomePaths(content: string): string[]`
- `export function formatRefForMessage(ref: AssetRef): string`
- `function repoDirFor(source: WriteTargetSource): string`
- `export function recordWriteTargetPath(source: WriteTargetSource, filePath: string): void`
- `function lstatOrNull(filePath: string): fs.Stats | null`
- `function assertWritePathsInsideSource(source: WriteTargetSource, filePaths: readonly string[]): void`
- `export function withWriteTargetMutation<T>`
- `export function commitWriteTargetBoundary`
- `const toRepoRelative = (filePath: string): string`
- `export function commitAcceptedPaths`

## src/core/adapter/

### src/core/adapter/adapter-ids.ts

### src/core/adapter/bundle-adapter.ts

- `export interface AdapterReadCandidate`
- `export interface BundleAdapter`

### src/core/adapter/detect-adapter.ts

- `function hasExtraAkmContent(root: string, winnerId: string): boolean`
- `export function detectAdapterId(root: string, fallback = "akm"): string`

### src/core/adapter/execution-source.ts

- `interface ParsedExecutionMarkdown`
- `function nextLine(text: string, start: number):`
- `export function parseExecutionMarkdown(raw: string, filePath?: string): ParsedExecutionMarkdown`
- `function own(data: StrictRecordSnapshot, key: string): boolean`
- `function requireMetadataMapping(value: unknown, path: string): StrictRecordSnapshot`
- `function nullableString(value: unknown, path: string): string | null`
- `function nullableObject(value: unknown, path: string): ExecutionJsonObject | null`
- `function nullableTimeout(value: unknown, path: string): string | number | null`
- `export function executionDefaultsFromFrontmatter`
- `type DefaultsProjection`
- `export interface RenderMarkdownExecutionSourceInput`
- `export function renderMarkdownExecutionSource`
- `export function renderMarkdownExecutionSource`
- `export function renderMarkdownExecutionSource`
- `export function renderMarkdownExecutionSource`

### src/core/adapter/recognize-match.ts

- `function winningMatch(hits: Array<`
- `export function recognizeMatch(file: FileContext): MatchResult | null`

### src/core/adapter/registry.ts

- `export function getAdapters(): BundleAdapter[]`
- `export function adapterForId(id: string): BundleAdapter | undefined`

### src/core/adapter/types.ts

- `export type BundleId = string;`
- `export type ComponentId = string;`
- `export type ItemRef = string;`
- `export interface BundleInstallation`
- `export interface BundleComponent`
- `export interface StashIntent`
- `export interface AssetParameter`
- `export interface StashEntryScope`
- `export type ScopeKey = keyof StashEntryScope;`
- `export interface IndexDocument`
- `export interface OkfSourceEntry`
- `export interface OkfVerifiedEntry`
- `export interface OkfProvenance`
- `export interface ValidateContext`
- `export interface Diagnostic`

### src/core/adapter/validate-context.ts

- `type OverlayValue = string | null;`
- `function buildOverlay(root: string, changes: readonly FileChange[]): Map<string, OverlayValue>`
- `function readDisk(absPath: string): string | null`
- `function existsOnDiskOrOverlay(relPath: string, root: string, overlay: Map<string, OverlayValue> | null): boolean`
- `function refEscapesBundle(conceptId: string): boolean`
- `function candidateRelPaths(conceptId: string): string[]`
- `function stripFragment(ref: string): string`
- `function stripBundlePrefix(ref: string): string`
- `export interface ValidateContextOptions`
- `export function createValidateContext(options: ValidateContextOptions): ValidateContext`
- `async function readFile(p: string): Promise<string | Uint8Array | null>`
- `async function list(dir: string): Promise<string[]>`
- `async function resolveRef(ref: string): Promise<`

## src/core/adapter/adapters/

### src/core/adapter/adapters/agent-skills-adapter.ts

- `function skillPackage(relPath: string):`
- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `function skillFieldDiagnostics(relPath: string, dirName: string, data: Record<string, unknown>): Diagnostic[]`
- `interface ManifestScanResult`
- `function missingManifestDiagnostic(dir: string): Diagnostic`
- `async function scanPackageCandidate`
- `async function missingManifestDiagnostics(ctx: ValidateContext): Promise<Diagnostic[]>`
- `async function validate(_c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`

### src/core/adapter/adapters/akm-adapter.ts

- `function isReservedFileName(name: string): boolean`
- `function akmStashAbstains(root: string, absPath: string): boolean`
- `function stashDirToType(stashDir: string): string | undefined`
- `function indexDocumentFromEntry`
- `function conceptIdForRecognizedType(root: string, filePath: string, type: string): string | undefined`
- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `function renderExecutionSource(c: BundleComponent, file: FileContext): AdapterRenderedExecutionSource | null`
- `function buildOverlayContext(root: string, relPathInput: string, raw: string): FileContext`
- `async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`

### src/core/adapter/adapters/akm-lint.ts

- `function checkMissingNameOrType(data: Record<string, unknown>, frontmatter: string | null): string | null`
- `function checkInvalidTypeValue(data: Record<string, unknown>, allowedTypes: readonly string[]): string | null`
- `function suggestSlug(filePath: string): string`
- `export function nameOrTypeDiagnostics`
- `function collectSuppressedKeys(raw: string): Set<string>`
- `export function dangerousEnvKeyDiagnostics(type: string | undefined, relPath: string, raw: string): Diagnostic[]`
- `export async function skillDirectoryDiagnostics`
- `export interface PerTypeCheckArgs`
- `export async function perTypeValidateChecks(args: PerTypeCheckArgs): Promise<Diagnostic[]>`
- `export function factDiagnostics(relPath: string, data: Record<string, unknown>): Diagnostic[]`
- `export function taskDiagnostics(relPath: string, raw: string): Diagnostic[]`
- `export function matchWorkflowPlaceholder(body: string): string | null`
- `export function workflowStructureDiagnostics`
- `function lineOf(err:`
- `export type WorkflowFrontendDiagnostic = Diagnostic &`
- `export interface WorkflowFrontendDiagnostics`
- `export function workflowFrontendDiagnostics`
- `function workflowDiagnostics(relPath: string, raw: string, body: string): Diagnostic[]`
- `export function memoryOrphanStubApplies(data: Record<string, unknown>, body: string): boolean`
- `async function memoryDiagnostics`

### src/core/adapter/adapters/akm-metadata.ts

- `export interface FoldedMetadata`
- `function extractDescriptionFromComments(content: string): string | null`
- `function applyFrontmatterDescriptionAndTags(fm: Record<string, unknown>, out: FoldedMetadata): void`
- `function storedCommandRef(action: ParsedBuiltinCommandAction | undefined): string | undefined`
- `function finalizeHints(out: FoldedMetadata, hints: Set<string>): void`
- `export function foldRecognizedMetadata(rendererName: string, file: FileContext): FoldedMetadata`
- `export function applyFoldedMetadata(entry: IndexDocument, folded: FoldedMetadata): void`

### src/core/adapter/adapters/akm-task-adapter.ts

- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `async function validate(_c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`
- `function isLegacyTaskDocument(yaml: string, filePath: string): boolean`

### src/core/adapter/adapters/akm-workflow-adapter.ts

- `function conceptIdOf(relPath: string): string`
- `function isReservedDocFile(fileName: string): boolean`
- `function isWorkflowFile(raw: string): boolean`
- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`
- `function hasTopLevelWorkflowFile(root: string, entries: fs.Dirent[]): boolean`

### src/core/adapter/adapters/claude-adapter.ts

- `function dirExists(p: string): boolean`
- `function claudeLooksLikeRoot(root: string): boolean`

### src/core/adapter/adapters/dotenv-adapter.ts

- `type DotenvType = "env" | "secret";`
- `function classify(relPath: string): DotenvType | null`
- `function hasSensitiveMarker(absPath: string, type: DotenvType): boolean`
- `function conceptIdForPath(type: DotenvType, relativePath: string): string`
- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `async function validate(_c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`

### src/core/adapter/adapters/generic-files-adapter.ts

- `type GenericType = "script" | "document" | "file";`
- `function isReserved(base: string): boolean`
- `function classify(ext: string): GenericType`
- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`

### src/core/adapter/adapters/index.ts

### src/core/adapter/adapters/llm-wiki-adapter.ts

- `function conceptIdOf(relPath: string): string`
- `interface WikiPageFrontmatter`
- `function parseWikiFrontmatter(raw: string): WikiPageFrontmatter`
- `function isReservedRootFile(relPath: string): boolean`
- `function firstSegment(relPath: string): string`
- `function resolveXref(xref: string, bundleId: string): string | null`
- `const push = (conceptId: string) =>`
- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `interface WikiValidateItem`
- `async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`

### src/core/adapter/adapters/okf-adapter.ts

- `function parseActorMapping(value: unknown): OkfVerifiedEntry | undefined`
- `function parseVerified(value: unknown): OkfVerifiedEntry[] | undefined`
- `function parseOkfSources(value: unknown): OkfSourceEntry[] | undefined`
- `function parseLifecycleStatus(value: unknown): "draft" | "stable" | "deprecated" | undefined`
- `function isReservedFileName(name: string): boolean`
- `export function resolveOkfLinks(body: string, fileRelPath: string): string[]`
- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`

### src/core/adapter/adapters/opencode-adapter.ts

- `function fileExists(p: string): boolean`
- `function dirExists(p: string): boolean`
- `function opencodeLooksLikeRoot(root: string): boolean`

### src/core/adapter/adapters/shared.ts

- `export function hashContent(content: string): string`
- `export function nonEmptyString(value: unknown): string | undefined`
- `export function readTags(value: unknown): string[] | undefined`
- `function checkMissingUpdated(data: Record<string, unknown>, frontmatterText: string | null): boolean`
- `function findStalePathCandidates(body: string): string[]`
- `function stripFencedBlocksSimple(body: string): string`
- `function isNonRefConceptId(conceptId: string): boolean`
- `function extractProseRefTokens(text: string): string[]`
- `function refTokenFromListValue(value: string): string | null`
- `function readRefStringOrArray(value: unknown): string[] | null`
- `export interface ParsedForValidate`
- `export async function runBaseValidateChecks`
- `export async function validateChangesWithBaseChecks`

### src/core/adapter/adapters/tool-dir-shared.ts

- `export interface ToolDirLayout`
- `type ToolDirType = "instruction" | "command" | "agent" | "skill";`
- `interface ToolDirClassification`
- `function isReserved(base: string): boolean`
- `function classify(relPath: string, layout: ToolDirLayout): ToolDirClassification | null`
- `export function recognizeToolDir(layout: ToolDirLayout, c: BundleComponent, file: FileContext): IndexDocument | null`
- `export function readCandidatesToolDir(layout: ToolDirLayout, c: BundleComponent, conceptId: string)`
- `function nameOrSignalDiagnostics`
- `export async function validateToolDir`
- `export function renderToolDirExecutionSource`
- `export function makeToolDirAdapter(layout: ToolDirLayout, looksLikeRoot: (root: string) => boolean): BundleAdapter`

### src/core/adapter/adapters/website-snapshot-adapter.ts

- `interface SnapshotFrontmatter`
- `function parseSnapshotFrontmatter(raw: string): SnapshotFrontmatter`
- `function isSnapshotPage(relPath: string): boolean`
- `function isReTypeGated(fm: SnapshotFrontmatter): boolean`
- `function conceptIdOf(relPath: string): string`
- `function recognize(c: BundleComponent, file: FileContext): IndexDocument | null`
- `async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>`

## src/core/asset/

### src/core/asset/akm-markdown.ts

- `export function ensureAkmMarkdownType(content: string, type: string, now: Date = new Date()): string`
- `export function normalizeAkmMarkdown(content: string, type: string, now: Date = new Date()): string`
- `function documentLineEnding(text: string): "\r\n" | "\n"`
- `function parsesTo(text: string, intended: Record<string, unknown>): boolean`

### src/core/asset/asset-create.ts

- `export function normalizeCreateSubPath(subPath: string | undefined): string`
- `export function assertFlatAssetName(name: string | undefined): void`
- `export function combineCreatePath(subPath: string, baseName: string): string`

### src/core/asset/asset-placement.ts

- `export interface AssetSpec`
- `type _BuiltinPlacementKeysAreKnownTypes = keyof typeof BUILTIN_PLACEMENT_SPECS extends KnownType ? true : never;`
- `export function placementSpecFor(type: string): AssetSpec | undefined`
- `export function placementSpecList(): readonly AssetSpec[]`
- `export function placementTypes(): readonly string[]`
- `export function stashDirFor(type: string): string | undefined`
- `export function typeForStashDir(stashDir: string): string | undefined`
- `export function stashDirNames(): string[]`
- `export function registerAssetSpec(type: string, spec: AssetSpec): void`
- `export function deregisterAssetSpec(type: string): void`
- `export function isRelevantAssetFile(assetType: string, fileName: string): boolean`
- `export function deriveCanonicalAssetName(assetType: string, typeRoot: string, filePath: string): string | undefined`
- `export function deriveCanonicalAssetNameFromStashRoot`
- `export function assetPathForName(assetType: string, typeRoot: string, name: string): string`
- `export function assetPathCandidatesForName(assetType: string, typeRoot: string, name: string): string[]`

### src/core/asset/asset-ref.ts

- `function validateName(name: string): void`
- `function normalizeName(name: string): string`
- `export interface BundleRef`
- `export function isBundleSlug(s: string): boolean`
- `function normalizeConceptId(raw: string): string`
- `export function makeBundleRef(bundle: string | undefined, conceptId: string, fragment?: string): string`

### src/core/asset/asset-serialize.ts

- `export function serializeFrontmatter(frontmatter: Record<string, unknown>): string`
- `export function serializeFrontmatterQuoted(frontmatter: Record<string, unknown>): string`
- `export function assembleAsset(frontmatter: Record<string, unknown>, body: string): string`
- `export function assembleAssetFromString(serializedFm: string, body: string): string`

### src/core/asset/frontmatter-lint.ts

- `export function checkUnquotedDescriptionColon(frontmatterText: string | null): string | null`

### src/core/asset/frontmatter.ts

- `export interface SalienceSubSignals`
- `export function parseFrontmatter(raw: string):`
- `export type FrontmatterDateKey = "observed" | "started" | "ended";`
- `export function readFrontmatterDate(fm: Record<string, unknown>, key: FrontmatterDateKey): string | undefined`
- `function normalizeYamlValues(value: unknown): unknown`
- `function parseFrontmatterLenient(frontmatter: string): Record<string, unknown>`
- `export function mutateFrontmatter`
- `export function parseFrontmatterBlock`
- `function countLines(text: string): number`
- `export function spliceFrontmatterLine(raw: string, line: string): string | null`
- `export function replaceFrontmatterLine(raw: string, key: string, line: string): string | null`
- `export function replaceFrontmatterBlocks`
- `function unquote(value: string): string`
- `export function removeFrontmatterListValues(raw: string, key: string, values: readonly string[]): string | null`
- `export function rewriteFrontmatterListValue`
- `export function parseYamlScalar(value: string): unknown`
- `function sha256Hex(content: string): string`
- `export function computeNormalizedContentHash(raw: string): string`
- `export function carryForwardBookkeepingFrontmatter(proposedRaw: string, liveRaw: string): string`
- `export function writeSalienceToFrontmatter(raw: string, score: number, inputs: SalienceSubSignals): string`
- `function roundTo2dp(n: number): number`

### src/core/asset/markdown-fragments.ts

- `export interface MarkdownFragment`
- `function hash(text: string): string`
- `function uniqueSlugs(body: string): Map<number, string>`
- `interface Piece`
- `function textOf(lines: readonly string[]): string`
- `function splitPiece(piece: Piece, maxChars: number): Piece[]`
- `export function splitMarkdownFragmentStats`
- `export function splitMarkdownFragments(body: string, maxChars = MARKDOWN_FRAGMENT_MAX_CHARS): MarkdownFragment[]`
- `export function fragmentForSelector(body: string, selector: string): MarkdownFragment | undefined`
- `export interface MarkdownLeadContext`
- `export function buildMarkdownLeadContext`

### src/core/asset/markdown-link-targets.ts

- `export function markdownLinkTargets(body: string, references: boolean): string[]`

### src/core/asset/markdown.ts

- `export interface TocHeading`
- `export interface KnowledgeToc`
- `export function markdownHeadingSlug(heading: string): string`
- `export function markdownFragmentSlugs(content: string): string[]`
- `export interface MarkdownTocEntry`
- `export function markdownToc(content: string): MarkdownTocEntry[]`
- `export function uniqueHeadingSlugs(headings: TocHeading[]): string[]`
- `export function parseMarkdownToc(content: string): KnowledgeToc`
- `export function extractSection`
- `export function stripMarkdownFences(raw: string): string`

### src/core/asset/memory-archive.ts

- `export function resetMemoryArchiveCache(): void`
- `export function archivedOriginalPaths(root: string): Set<string>`
- `export function isArchivedRelPath(relPath: string, root: string): boolean`

### src/core/asset/resolve-ref.ts

- `export interface AssetRef`
- `export interface RefResolutionBundle`
- `export interface RefContext`
- `export type ResolvedRef = BundleRef & { bundle: string };`
- `export function resolveRef(input: string | BundleRef, ctx: RefContext): ResolvedRef`
- `function notFound(conceptId: string, triedForms: string[], ctx: RefContext): NotFoundError`
- `export interface DisplayRefItem`
- `export function conceptIdFromTypeName(type: string, name: string): string`
- `export function conceptIdForStashFile(type: string, stashRoot: string, filePath: string): string`
- `export function displayRef(item: DisplayRefItem, defaultBundleId?: string): string`
- `export function displayRefForConceptId`
- `export interface AssetRefParts`
- `export function typeNameFromConceptId(conceptId: string): AssetRefParts | undefined`
- `function opaqueRefParts(conceptId: string, allowRoot = false): AssetRefParts | undefined`
- `export function parseRefInput(raw: string, originGiven = false): AssetRef`
- `export function parseQualifiedRefInput(raw: string): AssetRef`
- `export function isFullRefInput(raw: string): boolean`

### src/core/asset/stash-meta.ts

- `export interface MetaRef`
- `export interface ResolvedMetaFile`
- `export function parseMetaRef(ref: string): MetaRef | null`
- `function assertSafeMetaName(name: string): void`
- `function metaCandidates(name: string): string[]`
- `export function resolveMetaFilePath(sourceRoot: string, name: string): string | null`
- `export function readMetaFile(sourceRoot: string, name: string): ResolvedMetaFile | null`
- `function isSafeRegularMetaFile(sourceRoot: string, metaRoot: string, filePath: string): boolean`
- `function statOrNull(filePath: string): fs.Stats | null`
- `function metaPathEscape(): UsageError`

## src/core/config/

### src/core/config/config-io.ts

- `export function readConfigText(configPath: string): string | undefined`
- `export function parseConfigText(text: string, sourcePath?: string): Record<string, unknown>`
- `function describeJsonRoot(value: unknown): string`
- `export function writeConfigAtomic(configPath: string, config: Record<string, unknown>): void`
- `export interface ConfigBackupResult`
- `export function backupExistingConfig(configPath: string, now = new Date()): ConfigBackupResult | undefined`
- `export function copyToConfigBackups(source: string, name: (stamp: string) => string, now = new Date()): string`
- `function chmodIfSupported(target: string, mode: number): void`
- `function pruneOldBackups(backupDir: string): void`
- `function isTimestampedConfigBackup(name: string): boolean`
- `export function pruneToNewest(dir: string, keep: number, select: (entry: fs.Dirent) => boolean): void`
- `export function getConfigLockPath(): string`
- `function sleepSyncMs(ms: number): void`
- `export function acquireConfigLock(): () => void`
- `export function withConfigLock<T>(fn: () => T): T`

### src/core/config/config-schema.ts

- `export type AkmConfigParsed = z.output<typeof AkmConfigSchema>;`
- `export interface ConfigValidationIssue`
- `export function validateConfigShape`
- `export function listTopLevelConfigKeys(): string[]`

### src/core/config/config-sources.ts

- `export function bundleComponentConfig`
- `export function bundleContentRoot(entryPath: string, componentRoot?: string): string`
- `export function bundlePhysicalContentRoot(entryPath: string, componentRoot?: string): string`
- `export function isBundleEnabled(config: AkmConfig, bundleId: string): boolean`
- `export function bundleSourceId(config: AkmConfig, bundleId: string): string`
- `export function filesystemBundleSourceId(contentRoot: string): string`
- `function hashBundleSourceIdentity(identity: Readonly<Record<string, unknown>>): string`
- `export function primaryBundlePath(config: AkmConfig): string | undefined`
- `export function bundleContentRoots(config: AkmConfig):`
- `export function bundleKeyForContentRoot(config: AkmConfig, resolvedContentRoot: string): string | undefined`
- `export function bundlesToSourceEntries(config: AkmConfig): SourceConfigEntry[] | undefined`
- `export function bundleEntryToSourceEntry`
- `export function installedSourceDescriptor`
- `function normalizeInstalledGitRef(source: string, ref: string): string`
- `function deriveBundleName(entry: SourceConfigEntry): string`
- `export function parseSourceSpec(entry: SourceConfigEntry): SourceSpec | undefined`
- `export function resolveConfiguredSources(config: AkmConfig): ConfiguredSource[]`
- `export function resolveActiveConfiguredSources(config: AkmConfig): ConfiguredSource[]`
- `function toConfiguredSource(persisted: SourceConfigEntry, isPrimary: boolean): ConfiguredSource | undefined`

### src/core/config/config-types.ts

- `export type HarnessId = (typeof VALID_HARNESS_IDS)[number];`
- `export type EmbeddingConnectionConfig = z.infer<typeof import("./config-schema").EmbeddingConnectionConfigSchema> &`
- `export type ConnectionConfig = z.infer<typeof import("./config-schema").ConnectionSchema>;`
- `export type HarnessConfig = NonNullable<z.infer<typeof import("./config-schema").HarnessesSchema>[string]>;`
- `export type ImproveProcessConfig = z.infer<typeof import("./config-schema").ImproveProcessConfigSchema>;`
- `export type ImproveProfileConfig = z.infer<typeof import("./config-schema").ImproveProfileConfigSchema>;`
- `export type RegistryConfigEntry = z.infer<typeof import("./config-schema").RegistryConfigEntrySchema>;`
- `export type BundleConfigEntry = z.infer<typeof import("./config-schema").BundleConfigEntrySchema>;`
- `export type SourceSpec`
- `export interface ConfiguredSource`
- `export type SourceConfigEntry = z.infer<typeof import("./config-schema").SourceConfigEntrySchema>;`
- `export type OutputConfig = z.infer<typeof import("./config-schema").OutputConfigSchema>;`
- `export type IndexPassConfig = z.infer<typeof import("./config-schema").IndexPassConfigSchema>;`
- `export type IndexConfig = z.infer<typeof import("./config-schema").IndexConfigSchema>;`
- `export type ImproveConfig = z.infer<typeof import("./config-schema").ImproveConfigSchema>;`
- `export type ImproveWhere = z.infer<typeof import("./config-schema").ImproveWhereSchema>;`
- `export type SchedulerConfig = z.infer<typeof import("./config-schema").SchedulerConfigSchema>;`
- `export type AkmConfig = Partial<import("./config-schema").AkmConfigParsed> &`

### src/core/config/config-version.ts

- `export function compareConfigVersion`
- `function normalize(value: string | number | undefined): number[] | undefined`

### src/core/config/config-walker.ts

- `type Path = string[];`
- `function parsePath(dotted: string): Path`
- `function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny`
- `export function isOpaqueSchema(schema: z.ZodTypeAny): boolean`
- `export function resolveSchemaAt(path: Path, config?: Record<string, unknown>, raw?: string): z.ZodTypeAny | undefined`
- `function selectUnionObjectOption`
- `export function configGet(config: Record<string, unknown>, dotted: string): unknown`
- `export function configSet(config: Record<string, unknown>, dotted: string, raw: string): Record<string, unknown>`
- `function isTriageJudgmentPath(path: Path): boolean`
- `export function configUnset(config: Record<string, unknown>, dotted: string): Record<string, unknown>`
- `function isCredentialPath(path: Path): boolean`
- `function rejectApiKeyPath(path: Path, raw: string, dotted: string): void`
- `function holdsLiteralApiKey(value: unknown): boolean`
- `function rejectLiteralApiKeyInWholeObjectSet(path: Path, raw: string, dotted: string): void`
- `function rejectRegistryCredentialValue(value: unknown, dotted: string): void`
- `function bestEffortJsonValue(raw: string): unknown`
- `function coerceForSchema(schema: z.ZodTypeAny, raw: string, key: string): unknown`
- `function setPath(config: Record<string, unknown>, path: Path, value: unknown): Record<string, unknown>`
- `function unsetPath(config: Record<string, unknown>, path: Path): Record<string, unknown>`
- `export function unknownKeyHint(): string`

### src/core/config/config.ts

- `export function resetConfigCache(): void`
- `export function inheritedConnectionsOf(config: AkmConfig): ReadonlySet<string>`
- `export function isInheritedConnection(name: string): boolean`
- `export function loadUserConfig(): AkmConfig`
- `function runConfigFilePipeline(text: string, sourcePath?: string): Record<string, unknown>`
- `function readConfigFile(text: string, sourcePath?: string): Record<string, unknown>`
- `function modelsOverlay(): unknown`
- `function inheritedEntries`
- `export function retiredEngineTargets(): EngineTargets`
- `function readRetiredEngines(raw: Record<string, unknown>, sourcePath?: string): Record<string, unknown>`
- `export function liftRetiredSecretRef(value: string): string | undefined`
- `function readRetiredSecretRefs(node: unknown, keyPath: readonly string[], sourcePath?: string): unknown`
- `function readConfigVersion(raw: Record<string, unknown>, sourcePath?: string): Record<string, unknown>`
- `function buildEffectiveConfig(liftedLocalRaw: Record<string, unknown>, sourcePath?: string): AkmConfig`
- `export function unknownConfigKeyPaths`
- `function warnUnknownConfigKeys(raw: Record<string, unknown>, sourcePath?: string): void`
- `function deleteConfigPath(node: Record<string, unknown>, keyPath: readonly string[]): void`
- `function isPlainConfigObject(value: unknown): value is Record<string, unknown>`
- `function assertUniquePhysicalBundleRoots(config: AkmConfig, sourcePath?: string): void`
- `export function parseAndValidateConfigText(text: string, sourcePath?: string): AkmConfig`
- `interface ConfigLayer`
- `function collectExtendsLayers(localRaw: Record<string, unknown>, configPath: string | undefined): ConfigLayer[]`
- `function resolveExtendsChain`
- `function sanitizeInheritedConfig(raw: Record<string, unknown>, label: string): Record<string, unknown>`
- `function expandExtendsHomePath(p: string): string`
- `function looksLikeBundleAssetRef(ref: string): boolean`
- `function resolveConfigRefSource`
- `function resolveConfigFileRefSource`
- `function resolveConfigBundleRefSource`
- `function assertConfigExtendsPhysicalContainment(root: string, candidate: string, ref: string): void`
- `export function getConfigValueSource(dotted: string): string`
- `function hasRawPath(raw: unknown, segments: string[]): boolean`
- `export function getSources(config: AkmConfig): SourceConfigEntry[]`
- `export function getEffectiveRegistries(config: AkmConfig): RegistryConfigEntry[]`
- `type NamedKeys<T> = keyof`
- `export type ImproveProcessName = NamedKeys<NonNullable<ImproveProfileConfig["processes"]>>;`
- `export function getImproveProcessConfig`
- `function defaultEntry<T>(entries: Record<string, T> | undefined):`
- `export function ambiguousDefaultAdvice(config: AkmConfig): string | undefined`
- `export function defaultConnection(config: AkmConfig):`
- `export function defaultHarness(config: AkmConfig):`
- `export function loadConfig(): AkmConfig`
- `export function saveConfig(config: AkmConfig): void`
- `function saveConfigReal(config: AkmConfig): void`
- `export function validateCompleteConfig(config: AkmConfig): AkmConfig`
- `export interface ConfigMutationResult`
- `function pruneUnchangedInheritedFields(before: unknown, after: unknown, localRaw: unknown): unknown`
- `function applyEdit`
- `function followKeyOrder(target: Record<string, unknown>, order: Record<string, unknown>): void`
- `function editedConfigFile`
- `function refuseRemovalFromRetiredForm`
- `function configWriteBody`
- `export function unusableEntryAt`
- `export interface ConfigFileNormalization`
- `export interface NormalizeConfigOptions`
- `function keepUnusableEntries`
- `export function normalizeConfigFile(configPath: string, options: NormalizeConfigOptions): ConfigFileNormalization`
- `export function mutateConfig`
- `export async function mutateConfigWithPrecommit<T>`
- `export function schedulerSourceIdFor(config: AkmConfig, bundleId: string): string | undefined`
- `export function sanitizeConfigForWrite(config: AkmConfig, options?:`
- `export function updateConfig(partial: Partial<AkmConfig>): AkmConfig`
- `export type SecretStoreResolver = (ref: string) => string | null;`
- `export function resolveSecret(value: string | undefined, resolveFromStore?: SecretStoreResolver): string | undefined`

### src/core/config/convert-engine-references.ts

- `export type Retarget = (holder: unknown, where: string, harnessOk?: boolean) => void;`
- `export function retargeter(conversion: Conversion, target: (engine: string) => EngineTarget | undefined): Retarget`
- `export function moveStrategyExecution(improve: Dict, conversion: Conversion, retarget: Retarget): void`
- `const hoist = (holder: unknown, from: string, place: string, destination: () => Dict): void =>`
- `const processEntry = (name: string)`
- `export function improveStrategyDefault(out: Dict, defaults: Dict, improve: unknown): void`
- `export function dropJudgeEngine(out: Dict, conversion: Conversion): void`
- `export function convertIndexEngines(out: Dict, conversion: Conversion, retarget: Retarget): void`

### src/core/config/convert-engines-shared.ts

- `export type Dict = Record<string, unknown>;`
- `export type EngineTarget = { readonly connection: string } | { readonly harness: string };`
- `export interface Entries`
- `export interface Conversion`
- `export const str = (value: unknown): string | undefined`
- `export const asDict = (value: unknown): Dict => (isRecord(value) ? (value as Dict) :`
- `export function wireFieldsOf(inference: LlmInference, where: string, notes: string[]): Dict`
- `export function objectAt(holder: Dict, key: string): Dict`

### src/core/config/convert-engines.ts

- `export interface ConvertEnginesOptions`
- `export interface EngineKey`
- `export interface ConvertEnginesResult`
- `function implicitKeyVariables(name: string, defaults: Dict): string[]`
- `interface Converted`
- `interface Naming`
- `function runtimeEngine(name: string, engine: Dict, converted: Converted, conversion: Conversion): void`
- `function agentEngineToHarness(name: string, engine: Dict, converted: Converted): void`
- `function carryEngineKey`
- `function llmEngineToConnection`
- `function convertEngines`
- `function renameMap`
- `function nameDefaults(defaults: Dict, converted: Converted, conversion: Conversion, written: Entries): Naming`
- `const renamed = (entries: Dict, name: (engine: string)`
- `const target = (engine: string): EngineTarget | undefined =>`
- `function mergeWritten(out: Dict, naming: Naming): Entries`
- `function ownModelsOf(converted: Converted, naming: Naming): OwnModels`
- `export function convertEngineConfig(raw: Dict, options: ConvertEnginesOptions`

### src/core/config/convert-models-overlay.ts

- `const allAliases = (model: string | undefined): Dict | undefined`
- `function modelEntry(model: string, fields: Dict): unknown`
- `function modelsOf(entry: Dict): Dict`
- `const hasModel = (entry: unknown, alias: string): boolean`
- `function overlayRows(modelsOverlay: unknown): Array<`
- `const rank = (column: string): number`
- `export type OwnModels = { readonly connections: Map<string, string>; readonly harnesses: Map<string, string> };`
- `export interface ModelsFold`
- `export function foldModelsOverlay(modelsOverlay: unknown, fold: ModelsFold): void`
- `const configNames = (own: Dict, base: Dict, name: string, alias: string): boolean`
- `const platformOf = (name: string): string`
- `export function foldEngineModels(merged: Entries, ownModels: OwnModels): void`

### src/core/config/credentials.ts

- `export type CredentialSlot = { readonly connection: string } | { readonly service: "embedding" | "curateRerank" };`
- `export interface StoredCredential`
- `function storePath(): string`
- `function namespaceOf(slot: CredentialSlot):`
- `function describeSlot(slot: CredentialSlot): string`
- `type StoreRead = { readonly entries: Record<string, unknown> } | { readonly problem: string };`
- `function readStore(): StoreRead`
- `function writeStore(entries: Record<string, unknown>): void`
- `function groupOf(entries: Record<string, unknown>, group: (typeof NAMESPACES)[number]): Record<string, unknown>`
- `function isStoredCredential(value: unknown): value is StoredCredential`
- `export function storedCredential(slot: CredentialSlot): StoredCredential | undefined`
- `export function readCredential(slot: CredentialSlot, endpoint: string, storedKey?: boolean): string | undefined`
- `function writableStore(): Record<string, unknown>`
- `export function writeCredential(slot: CredentialSlot, key: string, endpoint: string): void`
- `export function storedCredentials(): Array<`
- `export type SlotStanding = "free" | "same" | "different";`
- `export function slotStanding`
- `export function fileFlatCredentials`
- `const rank = (name: string): number =>`
- `export function resolveApiKey`
- `export function apiKeyReference(apiKey: string | undefined): string | undefined`
- `export function collectCredentialValues`

### src/core/config/deep-merge.ts

- `type ConfigObject = Record<string, unknown>;`
- `export function isPlainObject(value: unknown): value is ConfigObject`
- `function copyConfigValue(value: unknown): unknown`
- `export function deepMergeConfig(base: ConfigObject, override: ConfigObject): ConfigObject`

### src/core/config/engine-semantics.ts

### src/core/config/experimental.ts

- `export interface ExperimentalConfigHolder`
- `export function isImproveAutonomyEnabled(config: ExperimentalConfigHolder | undefined): boolean`

### src/core/config/migrate-keys.ts

- `type Dict = Record<string, unknown>;`
- `export interface MovedKey`
- `export interface KeyMovePlan`
- `export interface KeyMoveOptions`
- `function readKeyFile(file: string): string | undefined`
- `function heldValue(value: string, options: KeyMoveOptions): string | undefined`
- `interface Candidate`
- `function documentCandidates(config: Dict, options: KeyMoveOptions): Candidate[]`
- `export function documentEndpoint(config: Dict, slot: CredentialSlot): string | undefined`
- `function engineCandidates`
- `export function planKeyMoves`

### src/core/config/model-aliases.ts

- `export type StandardAlias = (typeof STANDARD_ALIASES)[number];`
- `export function modelForEveryAlias(model: string): Record<StandardAlias, string>`
- `export type ModelEntry = string | { readonly model: string; readonly [field: string]: unknown };`
- `export function entryModel(entry: ModelEntry): string`
- `export function entryWithModel(entry: ModelEntry | undefined, model: string): ModelEntry`

### src/core/config/models-file.ts

- `function modelsFilePath(): string`
- `export function readModelsFile(): unknown`
- `export function modelsFileExists(): boolean`
- `export function retireModelsFile(now = new Date()): string`

### src/core/config/retired-engines.ts

- `export type EngineTargets = Readonly<Record<string, EngineTarget>>;`
- `function rememberedPath(): string`
- `function targetOf(value: unknown): EngineTarget | undefined`
- `export function rememberedEngineTargets(): EngineTargets`
- `export function rememberEngineTargets(targets: EngineTargets): void`
- `export function forgetEngineTargets(): void`

### src/core/config/unusable-entries.ts

- `type Dict = Record<string, unknown>;`
- `function firstIssue(error: ZodError): string`
- `function nameProblem(name: string): string | undefined`
- `function connectionProblem(name: string, entry: unknown): string | undefined`
- `function harnessProblem(name: string, entry: unknown): string | undefined`
- `export interface UnusableEntry`
- `export function findUnusableEntries(raw: Dict): UnusableEntry[]`
- `const check =`
- `export function dropUnusableEntries(raw: Dict, sourcePath?: string): Dict`

## src/core/config/schema/

### src/core/config/schema/connections.ts

### src/core/config/schema/embedding.ts

### src/core/config/schema/experimental.ts

### src/core/config/schema/feedback.ts

### src/core/config/schema/harnesses.ts

- `export function harnessNameProblem(name: string, harness:`

### src/core/config/schema/improve-processes.ts

- `function rejectExcludeRefPrefixesOutsideReflect(value: Record<string, unknown>, ctx: z.RefinementCtx): void`

### src/core/config/schema/improve.ts

### src/core/config/schema/index-config.ts

- `type IndexConfigOutput =`

### src/core/config/schema/output.ts

### src/core/config/schema/primitives.ts

- `export function isApiKeyReference(value: string): boolean`
- `export function isEnvReference(value: string): boolean`
- `export function envReferenceName(value: string): string | undefined`

### src/core/config/schema/scheduler.ts

### src/core/config/schema/search.ts

### src/core/config/schema/setup.ts

### src/core/config/schema/sources-bundles.ts

### src/core/config/schema/workflow.ts

## src/core/standards/

### src/core/standards/resolve-standards-context.ts

- `function refType(ref: string | undefined): string | undefined`
- `export function resolveStandardsContext(ref: string | undefined, stashRoot: string): string`

### src/core/standards/resolve-stash-standards.ts

- `function collectMarkdownFiles(dir: string): string[]`
- `function toFactRef(factsRoot: string, absPath: string): string`
- `export function resolveStashStandards(stashRoot: string): string`

### src/core/standards/resolve-type-conventions.ts

- `export function typeConventionRef(type: string): string`
- `export function resolveTypeConventions(stashRoot: string, type: string | undefined): string`

## src/core/state/

### src/core/state/migrations.ts

- `export type StateMigrationSafety = "additive" | "data-preserving-rebuild" | "historical-destructive";`
- `function assertStateMigrationSafetyRegistry(): void`
- `export function getStateMigrationSafety(migrationId: string): StateMigrationSafety`
