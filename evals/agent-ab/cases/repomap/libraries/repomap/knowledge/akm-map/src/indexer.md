---
description: "Repo map of akm src/indexer at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/indexer

## src/indexer/

### src/indexer/bundle-identity-guard.ts

- `export function resetBundleIdentityGuardForTests(): void`
- `interface IndexedBundlePath`
- `function indexedBundlePaths(dbPath: string): IndexedBundlePath[] | undefined`
- `export function warnOnBundleRenameDrift(config: AkmConfig = loadConfig()): void`

### src/indexer/ensure-index.ts

- `export interface EnsureIndexOptions`
- `function getIndexableFiles(root: string, spec: AssetSpec): string[]`
- `function hasNewerIndexableFiles`
- `export function isIndexStale(stashDir: string): boolean`
- `function indexCanServeStash(stashDir: string, options:`
- `export async function ensureIndex(stashDir: string, options: EnsureIndexOptions`

### src/indexer/index-db-contention.ts

- `function describeIndexRebuildLockHolder(): string`
- `export function reclassifyIndexDbContention(error: unknown): unknown`

### src/indexer/index-rebuild-lock.ts

- `export type IndexRebuildLockAcquisition`
- `export function indexRebuildLockPath(): string`
- `export function tryAcquireIndexRebuildLock(skipIfLocked: boolean | undefined): IndexRebuildLockAcquisition`
- `const acquire = ()`
- `export function releaseIndexRebuildLock(ownership: LockOwnership): void`

### src/indexer/index-writer-lock.ts

- `export function _setAssetMutationLeaseSyncTimingForTests(overrides?:`
- `export interface AssetMutationLease`
- `export interface AcquireAssetMutationLeaseOptions`
- `function buildPayload(purpose: string): string`
- `function delay(ms: number): Promise<void>`
- `function describeAssetMutationHolder(lockPath: string): string`
- `function throwIfAborted(signal?: AbortSignal): void`
- `function createLease(lockPath: string, ownership: LockOwnership): AssetMutationLease`
- `const exitHandler = ()`
- `function tryAcquireAssetMutationLease(lockPath: string, purpose: string): AssetMutationLease | undefined`
- `export async function acquireAssetMutationLease`
- `export async function withAssetMutationLease<T>(purpose: string, run: () => Promise<T>): Promise<T>`
- `const execute = async (): Promise<T> =>`
- `export function withAssetMutationLeaseSync<T>(purpose: string, run: () => T): T`
- `export function probeAssetMutationLease()`

### src/indexer/index-written-assets.ts

- `export async function indexWrittenAssets`

### src/indexer/indexer.ts

- `export interface IndexCleanResult`
- `export interface IndexResponse`
- `export interface IndexProgressEvent`
- `interface IndexOptions`
- `function throwIfAborted(signal?: AbortSignal): void`
- `function sourceComponents(sources: readonly SearchSource[]): BundleComponent[]`
- `interface IndexSourceOwner`
- `function sourceOwners(sources: readonly SearchSource[]): IndexSourceOwner[]`
- `function parseStoredSourceOwners(raw: string | undefined): IndexSourceOwner[]`
- `function findRemovedSources(db: Database, sources: readonly SearchSource[]): RemovedIndexSource[]`
- `function applyRemovedSources`
- `export interface EmbeddingPassResult`
- `export async function runEmbeddingPass(params:`
- `function finalizeIndex(args:`
- `function vacuumIndexDb(db: Database, onProgress: (event: IndexProgressEvent) => void): void`
- `function runCleanPass(db: Database, dryRun: boolean): IndexCleanResult`
- `export function _setAkmIndexForTests(fake?: typeof akmIndexReal): void`
- `export async function akmIndex(options: IndexOptions): Promise<IndexResponse>`
- `export type IndexTransactionPoint = "records-persisted";`
- `export function _setIndexTransactionHookForTests(hook?: (point: IndexTransactionPoint) => void): void`
- `export function _setDrainObserverForTests(observer?: (dirPath: string, fileCount: number) => void): void`
- `function isReadableDirectory(root: string): boolean`
- `function detectAndPersistBundleAdapters`
- `async function akmIndexReal(options: IndexOptions): Promise<IndexResponse>`
- `type DirScanReason`
- `type DirRecord =`
- `type IndexedSourceOwner = Pick<EntryProvenance, "bundleId" | "componentId" | "adapterId">;`
- `function buildIndexedSourceOwners(sources: readonly SearchSource[]): Map<string, IndexedSourceOwner>`
- `type SourceScanPlan =`
- `type SourceScanResult =`
- `function removalsFirst(records: DirRecord[]): DirRecord[]`
- `function addEntryIds(target: Set<number>, ids: number[]): void`
- `function groupFileContextsByDir(fileContexts: FileContext[]): Map<string, FileContext[]>`
- `function sourceSnapshotRemovals`
- `function warnIfAdapterSkipsAkmContent`
- `function buildSourceScanPlans`
- `const addRemoval = (plan: SourceScanPlan, dirPath: string, stashDir: string) =>`
- `async function scanSourceDirs`
- `const reportScanProgress = (message: string)`
- `const reportDirDecision =`
- `const markSeenOrSkipDuplicate = (dirPath: string, currentStashDir: string, files: string[]): boolean =>`
- `function requiresWorkflowSourcePreflight(ctxs: readonly FileContext[]): boolean`
- `interface PersistedEntryRow`
- `function persistDirRecords`
- `function buildIndexSummaryMessage(options:`
- `function getEmbeddingProvider`
- `function verifyIndexState`
- `const verification =`
- `export interface IndexEntry`
- `export interface BundleRefLookupResolution`
- `async function resolveLookupSources(): Promise<SearchSource[]>`
- `type LookupDatabaseOpener = (dbPath: string) => Database | undefined;`
- `async function lookupBundleRefWithResolutionUsing`
- `const resolved = (entry: IndexEntry | null, owner?: AdapterConceptOwner): BundleRefLookupResolution =>`
- `export async function lookupBundleRefWithResolution(ref: BundleRef): Promise<BundleRefLookupResolution>`
- `export async function lookupBundleRefWithResolutionReadonly(ref: BundleRef): Promise<BundleRefLookupResolution>`
- `export async function lookupBundleRef(ref: BundleRef): Promise<IndexEntry | null>`
- `export async function lookupBundleRefReadonly(ref: BundleRef): Promise<IndexEntry | null>`
- `export async function lookupBundleRefsReadonly`
- `function readLookupEntry(db: Database, id: number, fallbackConceptId: string, sourceRoot: string): IndexEntry | null`
- `export async function lookup(ref: AssetRef): Promise<IndexEntry | null>`
- `export function recomputeUtilityScores(db: Database, stateDb: Database, onlyEntryId?: number): void`

### src/indexer/init.ts

- `export function initIndexer(): Promise<void>`

### src/indexer/installations.ts

- `export function deriveInstallations(sources: SearchSource[]): BundleInstallation[]`
- `export function deriveWritableBundleIds(sources: SearchSource[]): Set<string>`
- `export function deriveEntryProvenance`

### src/indexer/materialize-embeddings.ts

- `export function deriveSemanticProviderFingerprint(embedding?: EmbeddingConnectionConfig): string`
- `export interface EmbeddingProgressEvent`
- `export interface EmbeddingGenerationResult`
- `export interface GenerateEmbeddingsOptions`
- `export function formatEmbeddingHeartbeat(storedCount: number, total: number, failedCount: number): string`
- `function throwIfAborted(signal?: AbortSignal): void`
- `export async function generateEmbeddingsForDb`
- `const onSkip: EmbeddingSkipHandler = (skip) =>`
- `const onBatch: EmbeddingBatchCommit = (indices, batchEmbeddings, outcome) =>`
- `const printSkipList = (label: string, skipList: EmbeddingBatchSkip[]): void =>`
- `export function publishTargetedEmbeddingMeta(db: Database, config: AkmConfig): void`

### src/indexer/read-preflight.ts

- `export interface ReadSourceEnvelope`
- `export function resolveReadSources(overrideStashDir?: string, existingConfig?: AkmConfig): ReadSourceEnvelope`
- `export async function ensurePrimaryIndexForRead(primarySource?: SearchSource): Promise<boolean>`

## src/indexer/db/

### src/indexer/db/llm-cache.ts

- `export interface WithLlmCacheHooks`
- `export async function withLlmCache<T>`

## src/indexer/links/

### src/indexer/links/declared-links.ts

- `export type DeclaredLinkKind`
- `export interface DeclaredLink`
- `export interface DeclaredLinkOwner`
- `export function declaredLinks(doc: IndexDocument, owner: DeclaredLinkOwner): DeclaredLink[]`
- `function stringValues(value: unknown): string[]`

## src/indexer/lookup/

### src/indexer/lookup/adapter-concept-owner.ts

- `export interface AdapterConceptOwner`
- `export abstract class AdapterConceptOwnershipError extends UsageError`
- `export class AdapterConceptCollisionError extends AdapterConceptOwnershipError`
- `function normalizedConceptId(conceptId: string): string | undefined`
- `function componentFor(sourcePath: string, adapterId: string): BundleComponent`
- `function lexicallyWithin(candidate: string, root: string): boolean`
- `function candidateSpellings(candidate: AdapterReadCandidate, sourcePath: string): AdapterReadCandidate[]`
- `function inspectCandidate`
- `function claimsWithoutContent(adapter: BundleAdapter, component: BundleComponent, owner: AdapterConceptOwner): boolean`
- `const denyBytes = (): never =>`
- `export interface ResolveAdapterConceptOwnerOptions`
- `function isMarkedSensitive(owner: AdapterConceptOwner): boolean`
- `export function resolveAdapterConceptOwner`
- `export interface ConceptOwnerMatch`
- `export function resolveConceptOwner`
- `export function indexedPathMatchesOwner(indexedPath: string, owner: AdapterConceptOwner): boolean`

## src/indexer/passes/

### src/indexer/passes/dir-staleness.ts

- `export type DirStaleReason =`
- `export interface DirIndexState`
- `export interface DirFingerprint`
- `export function getDirIndexState`
- `export function getCachedDirState`
- `export function canUseIncrementalSkip(state: DirIndexState, priorDirsChanged: boolean): boolean`
- `export function computeDirFingerprint(_dirPath: string, files: string[], indexVariant = ""): DirFingerprint`
- `function getDirStaleReason`
- `export function inferZeroRowReason`

### src/indexer/passes/memory-inference.ts

- `export interface MemoryInferenceResult`
- `export interface MemoryInferencePassOptions`
- `export interface MemoryInferenceProgress`
- `export interface MemoryInferencePassContext extends PassContext`
- `interface MemoryRecord`
- `type MemoryInferencePlan`
- `type MemoryInferDecision = DerivedMemoryDraft | MemoryInferNoChange;`
- `function validateDerivedMemoryDraft(raw: unknown): DerivedMemoryDraft | undefined`
- `function validateMemoryInferDecision(raw: unknown): MemoryInferDecision | undefined`
- `function readCachedMemoryDecision`
- `function planPendingMemoryRecord`
- `function memoryExecutionForContext`
- `async function inferPendingMemoryRecord`
- `const onRetryAttempt = () =>`
- `const infer = ()`
- `export async function runMemoryInferencePass(ctx: MemoryInferencePassContext): Promise<MemoryInferenceResult>`
- `async function runMemoryInferencePassBody`
- `const completeResult = (): MemoryInferenceResult =>`
- `const inCandidates = (ref: string)`
- `export function countPendingMemoriesNeedingDecision`
- `export function collectPendingMemories(stashRoot: string): MemoryRecord[]`
- `interface ScopeDrift`
- `function scanMemories(stashRoot: string):`
- `function isDerivedChildOf(fm: Record<string, unknown>, parentName: string): boolean`
- `function stringList(raw: unknown): string[]`
- `function memoryInferenceInput(body: string, fm: Record<string, unknown>): string`
- `export function isPendingMemory(frontmatter: Record<string, unknown>, filePath?: string): boolean`
- `function toMemoryName(memoriesDir: string, filePath: string): string | undefined`
- `interface WriteDerivedOutcome`
- `function derivedChildPath(parent: MemoryRecord): string`
- `async function writeDerivedMemory(parent: MemoryRecord, derived: DerivedMemoryDraft): Promise<WriteDerivedOutcome>`
- `function renderDerivedMemory(parent: MemoryRecord, derived: DerivedMemoryDraft): string`
- `function markParentProcessed(parent: MemoryRecord): void`
- `function syncDerivedChildScopes(drifts: readonly ScopeDrift[]): number`

### src/indexer/passes/metadata.ts

- `export interface StashFile`
- `export function normalizeQuality(raw: string): string`
- `export function _resetUnknownQualityWarnings(): void`
- `export function isProposedQuality(quality: string | undefined): boolean`
- `export function validateStashEntry(entry: unknown): IndexDocument | null`
- `function normalizeScopeObject(raw: Record<string, unknown>): StashEntryScope | undefined`
- `export function applyScopeFrontmatter(entry: IndexDocument, fmData: Record<string, unknown>): void`
- `export function scopeFromFrontmatter(fm: Record<string, unknown>): StashEntryScope`
- `export function sameScope(a: StashEntryScope, b: StashEntryScope): boolean`
- `function normalizeIntent(value: unknown): StashIntent | undefined`
- `function normalizeMemoryBackref(value: string | undefined): string | undefined`
- `function derivedFromConceptId(source: string | undefined, derivedFrom: string | undefined): string | undefined`
- `export function applyCuratedFrontmatter(entry: IndexDocument, fmData: Record<string, unknown>): void`
- `function normalizeNonEmptyStringList(value: unknown): string[] | undefined`
- `export function extractCommandParameters(template: string): AssetParameter[] | undefined`
- `export function applyWikiFrontmatter(entry: IndexDocument, fmData: Record<string, unknown>): void`
- `function isWikiRole(value: unknown): value is NonNullable<IndexDocument["wikiRole"]>`
- `function parseVerifiedFamily(value: unknown):`
- `export function applyProvenanceFrontmatter(entry: IndexDocument, fmData: Record<string, unknown>): void`
- `export function extractScriptParameters(filePath: string, content?: string): AssetParameter[] | undefined`
- `function mergeParameters`
- `export interface CommentMetadata`
- `function splitCommentList(raw: string): string[]`
- `function parseCommentScope(raw: string): StashEntryScope | undefined`
- `function parseIntentCommentLine(cleaned: string, metadata: CommentMetadata): boolean`
- `export function extractCommentMetadata(filePath: string, content?: string): CommentMetadata | undefined`
- `export function applyCommentMetadata(entry: IndexDocument, metadata: CommentMetadata | undefined): void`
- `const use = <K extends keyof IndexDocument>(key: K, value: IndexDocument[K]): void =>`
- `function mergeAliases(existing: string[] | undefined, generated: string[]): string[] | undefined`
- `function findInnerFrontmatterBlock(lines: string[]):`
- `function hasSessionMemoryMarker(fmData: Record<string, unknown>, body: string): boolean`
- `function isFrontmatterShaped(lines: string[], block:`
- `function truncateUnicodeSafe(text: string, maxChars: number): string`
- `` type MarkdownFence = { marker: "`" | "~"; length: number }; ``
- `function parseMarkdownFenceOpening(line: string): MarkdownFence | undefined`
- `function isMarkdownFenceClosing(line: string, fence: MarkdownFence): boolean`
- `function stripMarkdownHtmlComments(line: string, state:`
- `function findBalancedMarkdownClose(text: string, openAt: number, open: string, close: string): number | undefined`
- `function findMarkdownDestinationClose(text: string, openAt: number): number | undefined`
- `function stripMarkdownLinkDestinations(text: string, nesting = 0): string`
- `export function projectMarkdownContent(body: string, truncationInfo?:`
- `function forEachVisibleMarkdownLine`
- `export function setMarkdownFragmentContent(entry: IndexDocument, content: string | undefined): void`
- `export function getMarkdownFragmentContent(entry: IndexDocument): string | undefined`
- `export function hasMarkdownFragmentContent(entry: IndexDocument): boolean`
- `export function withFileSize(entry: IndexDocument, filePath: string): IndexDocument`
- `export function projectMarkdownFragmentContent(raw: string): string | undefined`
- `export function applyPreContributorFields`
- `export function applyPostContributorFields`
- `export function buildMetadataSkipWarning(filePath: string, assetType: string, error: unknown): string`
- `export function isWorkflowSkipWarning(warning: string): boolean`
- `function normalizeTerms(values: string[]): string[]`
- `function buildAliases(name: string, tags: string[]): string[]`
- `export function extractDescriptionFromComments(filePath: string): string | null`
- `export function extractPackageMetadata`
- `export function fileNameToDescription(fileName: string): string`
- `export function extractTagsFromPath(filePath: string, rootDir: string): string[]`
- `export function extractDirTagsFromName(name: string): string[]`

### src/indexer/passes/pass-context.ts

- `export interface PassContext`

## src/indexer/scan/

### src/indexer/scan/doc-to-entry.ts

- `export function indexDocumentToStashEntry(doc: IndexDocument): IndexDocument`
- `type StringListKey`
- `type StringKey = "evidence" | "pageKind" | "whenToUse" | "category" | "run" | "setup" | "cwd";`
- `function assignStringList(entry: IndexDocument, key: StringListKey, value: unknown): void`
- `function assignString(entry: IndexDocument, key: StringKey, value: unknown): void`
- `function isIntent(value: unknown): value is StashIntent`

### src/indexer/scan/drain-dir.ts

- `export interface DrainedDir`
- `export function drainDirDocuments`
- `export function recognizeStashEntries(stashRoot: string, files: string[]): StashFile`
- `function handleWorkflowDoc(doc: IndexDocument, file: FileContext): string | null`
- `function docRenderer(doc: IndexDocument): string | undefined`
- `function workflowDropWarning(file: FileContext, errors: ReadonlyArray<`

## src/indexer/search/

### src/indexer/search/db-search.ts

- `type IndexedProvenance = { itemRef: string; bundleId: string; conceptId: string };`
- `export function searchHitContent(hit: SourceSearchHit): string | undefined`
- `function hasIndexedProvenance<`
- `function buildStaleIndexHint(db: Database): string | undefined`
- `export function buildLocalAction(type: string, ref: string): string`
- `function resolveSearchHitRef(entry: IndexDocument, provenance: IndexedProvenance, defaultBundleId?: string): string`
- `function hasConfiguredEmbeddingProvider(config:`
- `export interface SearchLocalInput`
- `export async function searchLocal(input: SearchLocalInput): Promise<`
- `async function searchDatabase`
- `const filterCandidates: CandidateFilter = (ids) =>`
- `function readFeedback(fused: readonly FusedCandidate[]):`
- `type HydratedEntry = NonNullable<ReturnType<typeof getEntryById>> & { id: number };`
- `function selectFusedEntries`
- `function keepAllowedTypes`
- `function describeRanks(candidate: FusedCandidate): string[]`
- `async function enumerateEntries`
- `interface EntryFilterOptions`
- `export function applyEntryFilters<T extends { id: number; entry: IndexDocument; filePath: string }>`
- `function inheritDerivedTwinBeliefStates(db: Database, items: Array<`
- `export function matchBeliefFilter(beliefState: string | undefined, filter: BeliefFilterMode): boolean`
- `function startVectorChannel`
- `function buildVectorFallbackWarning(config: AkmConfig, error: unknown): string`
- `function safeEmbeddingEndpoint(config: AkmConfig): string | undefined`
- `function classifyVectorFailure(error: unknown): string`
- `export async function buildDbHit(input:`
- `export function deriveSize(bytes?: number): SearchHitSize | undefined`
- `function deduplicateByPath<T extends`
- `function entryMatchesScope(scope: StashEntryScope | undefined, filters: StashEntryScope): boolean`

### src/indexer/search/fts-query.ts

- `export function ftsQueryTokens(query: string): string[]`
- `export function ftsOrMatch(tokens: readonly string[]): string`
- `export function parseRefPrefixQuery(query: string):`

### src/indexer/search/ranking.ts

- `export interface RankedRef`
- `export interface FusedCandidate extends RankedRef`
- `export function reciprocalRankFusion(channels: ReadonlyArray<readonly RankedRef[]>): FusedCandidate[]`
- `export interface FeedbackCounts`
- `export function feedbackFactor`
- `export function applyFeedback`

### src/indexer/search/search-attribution.ts

- `export interface SearchHitAttribution`
- `export interface UsageEventAttribution`
- `type AttributionHost = { [ATTRIBUTION]?: SearchHitAttribution };`
- `export type AttributionProjection = "brief" | "normal" | "full" | "agent";`
- `export function attachSearchHitAttribution(target: object, attribution: SearchHitAttribution): void`
- `export function copySearchHitAttribution(from: object, to: object, outputDescription?: string): void`
- `export function getSearchHitAttribution(target: object): SearchHitAttribution | undefined`
- `export function buildUsageEventAttribution`
- `export function usageEventAttributionMetadata`

### src/indexer/search/search-fields.ts

- `export function buildSearchFields(entry: IndexDocument):`
- `export function buildSearchText(entry: IndexDocument): string`

### src/indexer/search/search-hit-enrichers.ts

- `export interface SearchHitContext`
- `export async function enrichSearchHit(hit: SourceSearchHit, ctx: SearchHitContext): Promise<void>`
- `function surfaceDerivedMemory(hit: SourceSearchHit, db: Database, ctx: SearchHitContext): void`

### src/indexer/search/search-source.ts

- `export interface SearchSource`
- `export function implicitStashDir(config: AkmConfig, overrideStashDir?: string): string | undefined`
- `export function resolveSourceEntries(overrideStashDir?: string, existingConfig?: AkmConfig): SearchSource[]`
- `const sourceIdentity = (dir: string): string =>`
- `const addSource =`
- `export function resolveEntryContentDir(entry: SourceConfigEntry): string | undefined`
- `export function findSourceForPath(filePath: string, sources: SearchSource[]): SearchSource | undefined`
- `export function isEditable(filePath: string, config?: AkmConfig, sources?: SearchSource[]): boolean`
- `export function buildEditHint(ref: string): string`
- `function isSuspiciousStashRoot(dir: string): boolean`
- `export async function ensureSourceCaches`
- `function isMaterializedDir(dir: string): boolean`
- `function warnIfSourceUnavailableForRead(entry: SourceConfigEntry, providerName: string): void`

## src/indexer/usage/

### src/indexer/usage/show-usage.ts

- `export function recentShowCount(ref: string): number`
- `function traceParentRef(ref: string): string`
- `function appendShowTrace(ref: string, type: string, name: string): void`
- `function insertShowUsage(entryId: number, entryRef: string, derivedFrom: unknown, eventSource: UsageEventSource): void`
- `export function recordShowUsage`
- `export function recordIndexedShowUsage(ref: string, eventSource: UsageEventSource = "user"): void`

### src/indexer/usage/usage-events.ts

- `export type UsageEventSource = "user" | "improve" | "task" | "audit" | "unknown";`
- `export function resolveUsageEventSource`
- `export interface UsageEvent`
- `export interface UsageEventRow`
- `export function ensureUsageEventsSchema(db: Database): void`
- `export function insertUsageEvent(db: Database, event: UsageEvent): void`
- `export function insertUsageEventStrict(db: Database, event: UsageEvent): void`
- `export function countFeedbackSignalsByRef`
- `export function countUsageEventsByType(db: Database, eventType: string): number`
- `export function listUsedEntryRefs(db: Database, sinceIso: string): string[]`
- `export function listRetrievalQueries(db: Database, conceptId: string): string[]`
- `export function purgeOldUsageEvents(db: Database, retentionDays: number): void`

## src/indexer/walk/

### src/indexer/walk/file-context.ts

- `export interface FileContext`
- `export function buildFileContext(stashRoot: string, absPath: string): FileContext`
- `export interface MatchResult`
- `export type AssetMatcher = (ctx: FileContext) => MatchResult | null;`
- `export interface RenderContext extends FileContext`
- `export interface AssetRenderer`
- `async function ensureBuiltinsRegistered(): Promise<void>`
- `export function registerRenderer(renderer: AssetRenderer): void`
- `export async function getRenderer(name: string): Promise<AssetRenderer | undefined>`
- `export async function getAllRenderers(): Promise<AssetRenderer[]>`
- `export function buildRenderContext`

### src/indexer/walk/index-context.ts

- `export type SemanticSearchRuntimeStatus = "pending" | "ready-js" | "blocked";`
- `export interface IndexVerification`
- `export interface SemanticSearchRecord`
- `export interface RemovedIndexSource`

### src/indexer/walk/matchers.ts

- `export type PathFileContext = Omit<FileContext, "content" | "frontmatter" | "stat">;`
- `interface MatchFact`
- `interface DirTypeRule`
- `function isTypedDirDocFile(fileName: string): boolean`
- `function isNestedSkillResource(ctx: PathFileContext): boolean`
- `function matchDirectoryHint(dirName: string, ctx: PathFileContext, specificity: number): MatchFact | null`
- `function hasDeclaredDirType(ctx: PathFileContext): boolean`
- `function classifyByExtension(ctx: FileContext): MatchFact | null`
- `function classifyByDirectory(ctx: FileContext): MatchFact | null`
- `function classifyByParentDirHint(ctx: FileContext): MatchFact | null`
- `function classifyBySmartMd(ctx: FileContext): MatchFact | null`
- `function toMatchResult(ctx: FileContext, classify: (ctx: FileContext) => MatchFact | null): MatchResult | null`
- `function matchResultForFact(fact: MatchFact): MatchResult | null`
- `export function extensionMatcher(ctx: FileContext): MatchResult | null`
- `export function directoryMatcher(ctx: FileContext): MatchResult | null`
- `export function parentDirHintMatcher(ctx: FileContext): MatchResult | null`
- `export function smartMdMatcher(ctx: FileContext): MatchResult | null`

### src/indexer/walk/path-resolver.ts

- `export interface ResolveAssetPathOptions`
- `function normalizeRef(ref: string | AssetRef): AssetRef`
- `async function resolveViaIndex(ref: AssetRef): Promise<string | null>`
- `function resolveViaDisk(ref: AssetRef, options: ResolveAssetPathOptions): string | null`
- `export async function resolveAssetPath`

### src/indexer/walk/walker.ts

- `export interface WalkStashFlatOptions`
- `export interface WalkStashFlatResult`
- `export interface DirectoryGroup`
- `export function walkStash(typeRoot: string, assetType: string): DirectoryGroup[]`
- `export function walkStashFlat(stashRoot: string, options: WalkStashFlatOptions`
- `export function walkStashFlatWithStatus(stashRoot: string, options: WalkStashFlatOptions`
- `function walkStashGit(stashRoot: string, options: WalkStashFlatOptions): WalkStashFlatResult | null`
- `function isInsideGitRepo(dir: string): boolean`
- `export interface WalkMarkdownFilesResult`
- `export function walkMarkdownFiles(root: string): WalkMarkdownFilesResult`
- `function walkStashManual(stashRoot: string, options: WalkStashFlatOptions): WalkStashFlatResult`
- `export function isFileOrFileSymlink(filePath: string): boolean`
