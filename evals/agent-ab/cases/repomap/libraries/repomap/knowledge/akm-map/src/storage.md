---
description: "Repo map of akm src/storage at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/storage

## src/storage/

### src/storage/database.ts

- `export type SqlValue = string | number | bigint | boolean | null | Uint8Array;`
- `export interface RunResult`
- `export interface Statement<Row = unknown>`
- `export interface Database`
- `export interface OpenDatabaseOptions`
- `export function openDatabase(path: string, opts?: OpenDatabaseOptions): Database`
- `export function openDatabaseFinalizing(path: string, opts?: OpenDatabaseOptions): Database`
- `function openBunDatabase(path: string, opts?: OpenDatabaseOptions): Database`
- `function bunOptions(opts: OpenDatabaseOptions):`
- `function loadBunSqlite(): typeof import("bun:sqlite")`
- `interface BetterSqlite3Ctor`
- `interface BetterSqliteDatabase`
- `function missingBindingRemedy(): string`
- `function loadBetterSqlite3(): BetterSqlite3Ctor`
- `function openNodeDatabase(path: string, opts?: OpenDatabaseOptions): Database`

### src/storage/like-pattern.ts

- `export function escapeLikePattern(text: string): string`

### src/storage/locations.ts

- `export interface StorageLocations`
- `export function resolveStorageLocations(): StorageLocations`

### src/storage/managed-db.ts

- `export interface ManagedDbSpec`
- `export function openManagedDatabase(spec: ManagedDbSpec): Database`
- `export function withManagedDb<T>(open: () => Database, fn: (db: Database) => T, opts?:`

### src/storage/sqlite-migrations.ts

- `export interface Migration`
- `export type MigrationLedgerStatus = "old" | "current" | "newer" | "inconsistent";`
- `export interface MigrationLedgerState`
- `export function assertMigrationRegistry(migrations: readonly Migration[]): void`
- `export function migrationLedgerExists(db: Database): boolean`
- `function inspectLedgerAgainst(db: Database, registryIds: readonly string[]): MigrationLedgerState`
- `export function inspectMigrationLedger(db: Database, migrations: readonly Migration[]): MigrationLedgerState`
- `export function assertMigrationLedger(db: Database, migrations: readonly Migration[]): MigrationLedgerState`
- `export function ensureMigrationsTable(db: Database): void`
- `export function pendingMigrations(db: Database, migrations: readonly Migration[]): readonly Migration[]`
- `export function runMigrations(db: Database, migrations: readonly Migration[]): string[]`

### src/storage/sqlite-pragmas.ts

- `export type JournalMode = "WAL" | "DELETE" | "TRUNCATE";`
- `export function resolveJournalMode(raw: string | undefined): JournalMode`
- `export function resolveConfiguredJournalMode(env: NodeJS.ProcessEnv = process.env): JournalMode`
- `function warnInvalidJournalModeOnce(raw: string): void`
- `export function isNetworkFilesystem(fsType: number | undefined): boolean`
- `export function applyReadonlyPragmas(db: Database): void`
- `export interface StandardPragmaOptions`
- `export function applyStandardPragmas(db: Database, opts: StandardPragmaOptions`
- `function warnNetworkFallbackOnce(dataDir: string): void`

### src/storage/sqlite-read-snapshot.ts

- `export class SqliteReadSnapshotUnavailableError extends Error`
- `function pathExists(filePath: string): boolean`
- `interface FileFingerprint`
- `interface DatabaseFingerprint`
- `function fileFingerprint(filePath: string): FileFingerprint | undefined`
- `function databaseFingerprint(dbPath: string): DatabaseFingerprint`
- `function fingerprintsEqual(left: DatabaseFingerprint, right: DatabaseFingerprint): boolean`
- `const sameFile = (a: FileFingerprint | undefined, b: FileFingerprint | undefined): boolean`
- `function copyFileOutsideThisProcess(source: string, destination: string): void`
- `export function copySqliteSnapshot(dbPath: string, snapshotPath: string): void`
- `export function openSqliteReadSnapshot(dbPath: string): Database | undefined`
- `const cleanup = (bestEffort: boolean): void =>`
- `const cleanupOnExit = (): void`

### src/storage/sqlite-transaction.ts

- `export function isSqliteContentionError(err: unknown): boolean`
- `function throwBeginFailure(err: unknown): never`
- `export function beginImmediateTransaction(db: Database): void`
- `export function withImmediateTransaction<T>(db: Database, fn: () => T): T`

### src/storage/state-db-integrity.ts

- `export interface StateDbIntegrityResult`
- `export interface StateDbFreelistInfo`
- `export interface VacuumOutcome`
- `function firstColumn(row: Record<string, unknown> | undefined): unknown`
- `function openReadonlyStateDb(dbPath: string): Database`
- `export function runStateDbIntegrityCheck(dbPath: string): StateDbIntegrityResult`
- `export function readFreelistInfo(db: Database): StateDbFreelistInfo`
- `export function getStateDbFreelistInfo(dbPath: string): StateDbFreelistInfo`
- `export function vacuumIfReclaimable`

## src/storage/repositories/

### src/storage/repositories/embeddings-repository.ts

- `export function embeddingToBlob(vec: number[]): Uint8Array`
- `export function blobToEmbedding(blob: Uint8Array): number[]`
- `export function getBodyEmbeddings`
- `export function upsertBodyEmbeddings`

### src/storage/repositories/events-repository.ts

- `export interface EventRow`
- `export function eventRowToEnvelope(row: EventRow): EventEnvelope`
- `export function insertEvent`
- `export function insertEventStrict`
- `export function insertEventOnce`
- `export interface ReadStateEventsOptions`
- `export function readStateEvents`
- `export function purgeOldEvents(db: Database, retentionDays = 90): number`

### src/storage/repositories/extract-sessions-repository.ts

- `export interface ExtractedSessionRow`
- `export function upsertExtractedSession`
- `export function getExtractedSession(db: Database, harness: string, sessionId: string): ExtractedSessionRow | undefined`
- `export function getExtractedSessionsMap`
- `export function getLastExtractRunAt(db: Database, harness: string): number | null`
- `export interface ExtractOutcomeCount`
- `export function getExtractOutcomeCountsSince(db: Database, sinceIso: string): ExtractOutcomeCount[]`
- `export function shouldSkipAlreadyExtractedSession`

### src/storage/repositories/improve-ledger-repository.ts

- `export type ImproveLedgerOutcome = (typeof IMPROVE_LEDGER_OUTCOMES)[number];`
- `export interface ImproveLedgerRow`
- `export function isContentDrivenDecision(source: string, outcome: ImproveLedgerOutcome): boolean`
- `export function isContentDrivenRow(row: Pick<ImproveLedgerRow, "source" | "outcome" | "contentHash">): boolean`
- `function windowDays(source: string, outcome: ImproveLedgerOutcome): number | null`
- `export function nextEligibleAt`
- `export function isLedgerBlocked(row: ImproveLedgerRow | undefined, nowIso: string, signalSinceIso?: string): boolean`
- `interface LedgerSqlRow`
- `function toRow(row: LedgerSqlRow): ImproveLedgerRow`
- `function trimDetail(detail: string | undefined): string | null`
- `export interface RecordImproveLedgerInput`
- `export function recordImproveLedger(db: Database, input: RecordImproveLedgerInput): ImproveLedgerRow`
- `export interface RecordImproveLedgerDecisionInput`
- `export function recordImproveLedgerDecision(db: Database, input: RecordImproveLedgerDecisionInput): void`
- `export function reopenImproveLedgerDecision`
- `export function forgetImproveLedgerDecision(db: Database, stashDir: string, proposalId: string): void`
- `function hasContentHashColumn(db: Database): boolean`
- `export function getImproveLedgerRow`
- `export function listImproveLedgerRows(db: Database, stashDir: string, sources?: readonly string[]): ImproveLedgerRow[]`

### src/storage/repositories/improve-runs-repository.ts

- `export interface ImproveRunRow`
- `export interface ImproveRunMetrics`
- `export function computeImproveRunMetrics(result: ImproveResultEnvelope): ImproveRunMetrics`
- `export function recordImproveRun`
- `export interface ImproveRunSummaryRow`
- `export function queryImproveRuns(db: Database, since: string, until?: string): ImproveRunSummaryRow[]`
- `export function getImproveRunById(db: Database, id: string): ImproveRunRow | undefined`
- `export function getLatestImproveRun(db: Database): ImproveRunRow | undefined`
- `export function listRecentImproveRuns(db: Database, limit: number): ImproveRunSummaryRow[]`
- `export function purgeOldImproveRuns(db: Database, retentionDays = 90): number`

### src/storage/repositories/index-connection.ts

- `function isCorruptionError(error: unknown): boolean`
- `export function openIndexDatabase(dbPath?: string, options?:`
- `export function openExistingDatabase(dbPath?: string): Database`
- `function checkIndexLayout(db: Database, resolvedPath: string): void`
- `export function assertIndexPathReadable(resolvedPath: string): void`
- `function openPlainReadonly(resolvedPath: string): Database | undefined`
- `function openIsolatedSnapshotOrFallBack(resolvedPath: string): Database | undefined`
- `export function openReadonlyExistingDatabase`
- `export function closeDatabase(db: Database): void`

### src/storage/repositories/index-db.ts

- `export interface WithIndexDbOptions`
- `export function withIndexDb<T>(fn: (db: Database) => T, opts?: WithIndexDbOptions): T`

### src/storage/repositories/index-entries-repository.ts

- `function embedHash(entry: IndexDocument): string`
- `export function upsertEntry`
- `const apply = (): number =>`
- `interface UpsertStmts`
- `interface ExistingUpsertRow`
- `function getUpsertStmts(db: Database): UpsertStmts`
- `export function getDerivedForParent(db: Database, parentRef: string, bundleId?: string): DbIndexedEntry | null`
- `export function getBaseBeliefStatesForDerivedTwins(db: Database, twinIds: number[]): Map<number, string>`
- `export function rekeyEntryInPlace(db: Database, opts: RekeyEntryOptions): number | null`
- `function rewriteUsageEventRefForMove(opts: RekeyEntryOptions): void`
- `const rename = (stateDb: Database, oldR: string, newR: string): void =>`
- `function selectRowsInDirectory<T extends { file_path: string }>`
- `function rowsInDirectory(db: Database, dirPath: string, bundleId?: string): Array<`
- `function deleteEntryRows`
- `export function deleteEntriesByDirAndBundle`
- `export function deleteEntriesByBundle(db: Database, bundleId: string): void`
- `export function getFilePathsByBundle(db: Database, bundleId: string): string[]`
- `export function renameEntriesBundleId(db: Database, oldBundleId: string, newBundleId: string): number`
- `export function deleteEntriesByDirExceptRefs`
- `function deleteRelatedRows`
- `export function deleteUsageEventsByEntryIds(entryIds: number[]): void`
- `export function deleteEntriesByIds(db: Database, ids: number[]): void`
- `function parseEntryRows(rows: Array<Record<string, unknown>>, context: string): DbIndexedEntry[]`
- `export function getAllEntries(db: Database, entryType?: string, excludeTypes?: string[]): DbIndexedEntry[]`
- `export function findEntryIdByRef(db: Database, ref: string, bundleId?: string): number | undefined`
- `function withMdVariants(name: string): string[]`
- `function findEntryIdByBundleRef(db: Database, ref: string, bundleId?: string): number | undefined`
- `function matchIdByItemRef`
- `export function getEntryCount(db: Database): number`
- `export function getEntryCountByType(db: Database): Record<string, number>`
- `export function getEmbeddableEntryCount(db: Database): number`
- `export function getEntriesByIds(db: Database, ids: readonly number[]): DbIndexedEntry[]`
- `export function getEntryById`
- `export function getEntryRefsAndTypes`
- `export function getEntriesByDir(db: Database, dirPath: string): DbIndexedEntry[]`
- `export function getIndexedDirPathsByBundleId(db: Database, bundleId: string): string[]`
- `export function getIndexedBundleIdsByDir(db: Database, dirPath: string): string[]`
- `export function getEntryIdByFilePath(db: Database, filePath: string): number | undefined`
- `export function getIndexedFilePaths(db: Database): Set<string>`
- `export function getIndexedFileHashes(db: Database): Map<string, string>`
- `export function getEntryFilePathById(db: Database, id: number): string | undefined`
- `export function getZeroResultSearches(db: Database, sinceDays = 30): string[]`
- `export function getEntryByRef(db: Database, ref: string):`
- `export interface LiveRefSnapshot`
- `export function getLiveRefSnapshot(db: Database): LiveRefSnapshot`
- `export function isRefLiveInSnapshot(snapshot: LiveRefSnapshot, ref: string): boolean`
- `export function getItemRefById(db: Database, id: number): string | null`
- `function resolveUsageEventEntryId(db: Database, ref: string): number | undefined`
- `export function relinkUsageEvents(indexDb: Database, stateDb: Database): void`

### src/storage/repositories/index-entry-mapper.ts

- `export type EntryRow =`
- `export function rowToIndexedEntry(row: EntryRow, context: string): DbIndexedEntry | null`

### src/storage/repositories/index-entry-schema.ts

- `export function entriesFtsDdl(contentless: boolean): string`
- `export function supportsContentlessDelete(db: EntrySchemaInspectionDatabase): boolean`
- `export interface EntrySchemaInspectionDatabase`
- `function sqlString(value: string): string`
- `export function readTableSql(db: EntrySchemaInspectionDatabase, name: string): string | null`
- `export function tableExists(db: EntrySchemaInspectionDatabase, name: string): boolean`
- `function entryColumnNames(db: EntrySchemaInspectionDatabase): Set<string>`
- `export function missingEntryColumns(db: EntrySchemaInspectionDatabase): string[]`
- `export function retiredEntryColumns(db: EntrySchemaInspectionDatabase): string[]`
- `export function hasCurrentEntriesTable(db: EntrySchemaInspectionDatabase): boolean`
- `export function isContentlessFtsDdl(sql: string | null): boolean`

### src/storage/repositories/index-entry-types.ts

- `export interface EntryProvenance`
- `export interface DbIndexedEntry`
- `export interface DbVecResult`
- `export interface IndexDirState`
- `export interface RekeyEntryOptions`
- `export interface RetrievalCountOptions`
- `export interface UtilityScoreData`
- `export interface UtilityScoreRow extends UtilityScoreData`
- `export interface LlmCacheEntry`
- `export type CandidateFilter = (ids: readonly number[]) => ReadonlySet<number>;`

### src/storage/repositories/index-fts-repository.ts

- `function isContentlessFts(db: Database): boolean`
- `interface FtsMutationStatements`
- `function getFtsMutationStatements(db: Database): FtsMutationStatements`
- `function noteRemoval(statements: FtsMutationStatements, removed: RunResult): void`
- `export function replaceFtsEntry`
- `export function deleteFtsEntries(db: Database, entryIds: readonly number[]): void`
- `export interface FtsCandidate`
- `export function searchFts`
- `const keepBatch = () =>`
- `export function getIndexedMarkdownFragment`
- `function materializeIndexedMarkdownFragment`
- `export interface IndexedMarkdownFragment`
- `export function rebuildFts(db: Database): void`
- `export function rebuildFtsIfTotalsStale(db: Database): boolean`

### src/storage/repositories/index-links-repository.ts

- `interface LinkStatements`
- `function statements(db: Database): LinkStatements`
- `export function replaceEntryLinks`
- `export function deleteEntryLinks(db: Database, entryIds: readonly number[]): void`
- `export function rebuildAllEntryLinks(db: Database): void`
- `export interface EntryLinkRow`
- `export function readEntryLinks(db: Database, itemRef: string):`
- `export function countLinksByKind(db: Database): Record<string,`

### src/storage/repositories/index-llm-cache-repository.ts

- `export function getLlmCacheEntry`
- `export function getLlmCacheEntriesByRefs`
- `export function upsertLlmCacheEntry`
- `export function clearStaleCacheEntries(db: Database): void`
- `export function computeBodyHash(body: string): string`

### src/storage/repositories/index-meta-repository.ts

- `export function getMeta(db: Database, key: string): string | undefined`
- `export function setMeta(db: Database, key: string, value: string): void`
- `export function deleteMeta(db: Database, key: string): void`
- `export function getIndexDirState(db: Database, dirPath: string): IndexDirState | undefined`
- `export function upsertIndexDirState`
- `export function deleteIndexDirState(db: Database, dirPath: string): void`

### src/storage/repositories/index-schema.ts

- `export function newerIndexLayoutError(storedVersion: number, dbPath?: string): ConfigError`
- `function ensureEntriesLayout(db: Database): void`
- `function dropVecMirror(db: Database): void`
- `function replaceSearchTextWithHash(db: Database): void`
- `function ensureFtsLayout(db: Database): void`
- `function migrateToDeclaredLinks(db: Database): void`
- `function tableHasColumn(db: Database, table: string, column: string): boolean`
- `function ensureColumn(db: Database, table: string, column: string, type: string): boolean`
- `export function ensureSchema(db: Database): void`

### src/storage/repositories/index-sql.ts

### src/storage/repositories/index-utility-repository.ts

- `export function getUtilityScore(db: Database, entryId: number): UtilityScoreRow | undefined`
- `export function getUtilityScoresByIds(db: Database, ids: number[]): Map<number, UtilityScoreRow>`
- `export function upsertUtilityScore(db: Database, entryId: number, data: UtilityScoreData): boolean`
- `function bareRef(ref: string): string`
- `function bareRefCandidates(ref: string): string[]`
- `export function getRetrievalCounts`
- `function getSourceScopedRetrievalCounts`
- `const bundleFor = (entryId: number | null): string | null =>`
- `export interface UtilityWithRef`
- `export function listUtilityWithRefs(db: Database): UtilityWithRef[]`

### src/storage/repositories/index-vec-repository.ts

- `function currentEmbeddingModel(db: Database): string | undefined`
- `function hasModelColumn(db: Database): boolean`
- `function modelPredicate`
- `export function deleteEntryVectors(db: Database, id: number): void`
- `export function purgeEmbeddings(db: Database): void`
- `export function upsertEmbedding(db: Database, entryId: number, embedding: EmbeddingVector, model?: string): boolean`
- `export interface VecScope`
- `export function searchVec`
- `const result = (index: number): DbVecResult =>`
- `export function getNeighborsByEntryId(db: Database, id: number, k: number, scope?: VecScope): DbVecResult[]`
- `export function hasStoredEmbedding(db: Database, id: number): boolean`
- `export interface EntryForEmbedding`
- `export function getAllEntriesForEmbedding`
- `type Row = { id: number; documentJson: string; itemRef: string; filePath: string };`
- `export function getEmbeddingCount(db: Database, model?: string): number`

### src/storage/repositories/metrics-repository.ts

- `export interface MetricsQueryFilter`
- `export function listUsageEventRows(db: Database, filter: MetricsQueryFilter): UsageEventRow[]`
- `export function listFeedbackEventRows(db: Database, entryRef: string, limit: number): UsageEventRow[]`
- `export function countFeedbackBySignal(db: Database, entryRef: string): Record<string, number>`
- `export function listSelectEvents(db: Database, sinceIso: string, untilIso: string): Array<`
- `export function listIndexCompletedEvents`
- `export function listLowestOutcomeAssets(db: Database, limit: number): AssetOutcomeRow[]`
- `export function countProposalsByStatus(db: Database, sinceIso: string, untilIso: string): Record<string, number>`
- `export function summarizeWorkflowRuns`

### src/storage/repositories/outcome-repository.ts

- `export interface AssetOutcomeRow`
- `export interface AssetOutcomeUpsertValues`
- `export function upsertAssetOutcome(db: Database, values: AssetOutcomeUpsertValues): void`
- `export function getAssetOutcome(db: Database, ref: string): AssetOutcomeRow | undefined`
- `export function getAllAssetOutcomes(db: Database): AssetOutcomeRow[]`
- `export function getOutcomeScoresByRef(db: Database, refs: string[]): Map<string, number>`
- `export interface AssetOutcomeMissingRow`
- `export function listAssetOutcomeMissingState(db: Database): AssetOutcomeMissingRow[]`
- `export function stampAssetOutcomeMissing(db: Database, refs: readonly string[], now: number): number`
- `export function clearAssetOutcomeMissing(db: Database, refs: readonly string[]): number`
- `export function deleteAssetOutcomeMissingBefore(db: Database, cutoffMs: number): number`
- `export function countAssetOutcomeMissing(db: Database): number`

### src/storage/repositories/proposals-repository.ts

- `interface StoredFileChange`
- `function changesToStored(changes: FileChange[]): StoredFileChange[]`
- `function storedToChanges(stored: unknown, content: string): FileChange[]`
- `function currentProposalRef(ref: string, requireQualified = false): string`
- `function currentProposalTarget(value: unknown): NonNullable<Proposal["proposedTarget"]>`
- `function invalidPresentField(name: string): never`
- `function isRecord(value: unknown): value is Record<string, unknown>`
- `function isReviewHistoryEntry(value: unknown): boolean`
- `function validatePresentMetadata(meta: Record<string, unknown>): void`
- `export interface ProposalRow`
- `export function proposalRowToProposal(row: ProposalRow): Proposal`
- `export function proposalToRowValues(proposal: Proposal, stashDir: string): Omit<ProposalRow, "id"> &`
- `export function upsertProposal(db: Database, proposal: Proposal, stashDir: string): void`
- `export function listStateProposals`
- `export function getStateProposal(db: Database, id: string, stashDir?: string): Proposal | undefined`
- `export function listProposalRefSources(db: Database, stashDir: string): Array<`
- `export function listStateProposalIdsByPrefix(db: Database, stashDir: string, idPrefix: string): string[]`
- `export function countProposalsForBundleRename(db: Database, oldBundleId: string):`
- `export function renameProposalsBundleRef`

### src/storage/repositories/registry-index-cache-repository.ts

- `export type RegistryIndexCacheRow =`
- `export function upsertRegistryIndexCache`
- `export function getRegistryIndexCache`
- `export async function withRegistryCacheDb<T>(fn: (db: Database | undefined) => Promise<T>): Promise<T>`
- `export interface FetchCachedJsonOptions<T>`
- `export async function fetchCachedJson<T>(opts: FetchCachedJsonOptions<T>): Promise<T>`

### src/storage/repositories/salience-repository.ts

- `export interface AssetSalienceRow`
- `interface SalienceVectorLike`
- `export function upsertAssetSalience(db: Database, ref: string, vector: SalienceVectorLike, now?: number): void`
- `export function getAssetSalience(db: Database, ref: string): AssetSalienceRow | undefined`
- `export function recordNoOp(db: Database, ref: string): void`
- `export function resetConsecutiveNoOps(db: Database, ref: string): void`
- `export function getConsecutiveNoOps(db: Database, ref: string): number`
- `export function getObservedRetrievalSalience(db: Database): Array<`
- `export interface AssetSalienceMissingRow`
- `export function listAssetSalienceMissingState(db: Database): AssetSalienceMissingRow[]`
- `export function stampAssetSalienceMissing(db: Database, refs: readonly string[], now: number): number`
- `export function clearAssetSalienceMissing(db: Database, refs: readonly string[]): number`
- `export function deleteAssetSalienceMissingBefore(db: Database, cutoffMs: number): number`
- `export function countAssetSalienceMissing(db: Database): number`

### src/storage/repositories/task-history-repository.ts

- `export type TaskHistoryDetail =`
- `export interface TaskHistoryMetadata`
- `function metadataError(message: string): never`
- `function validateDetail(value: unknown): asserts value is TaskHistoryDetail | null | undefined`
- `export function decodeTaskHistoryMetadata(input: string | unknown): TaskHistoryMetadata`
- `export interface TaskHistoryRow`
- `export function reserveTaskHistoryAttempt(db: Database, row: TaskHistoryRow): boolean`
- `export function finalizeTaskHistoryAttempt(db: Database, row: TaskHistoryRow): boolean`
- `export function upsertTaskHistory(db: Database, row: TaskHistoryRow): void`
- `export function getTaskHistory(db: Database, taskId: string): TaskHistoryRow | undefined`
- `export function getTaskHistoryRuns(db: Database, taskId: string, limit = 50): TaskHistoryRow[]`
- `export function queryTaskHistory`
- `export interface TaskIntervalRow`
- `export function queryCompletedTaskIntervals(db: Database, since: string, until?: string): TaskIntervalRow[]`
- `export function countTaskHistoryTargetRefs(db: Database, oldBundleId: string): number`
- `export function renameTaskHistoryTargetRefs(db: Database, oldBundleId: string, newBundleId: string): number`

### src/storage/repositories/workflow-runs-repository.ts

- `export type WorkflowRunRow =`
- `export type WorkflowRunStepRow =`
- `export type WorkflowRunUnitStatus = "pending" | "running" | "completed" | "failed" | "skipped";`
- `export type WorkflowRunUnitRow =`
- `export type WorkflowRunUnitAttemptPhaseV4 = "unit" | "gate";`
- `export type WorkflowRunUnitAttemptStatusV4 = "running" | "completed" | "failed" | "skipped";`
- `export interface WorkflowRunUnitAttemptRowV4`
- `export interface ReserveUnitAttemptV4Input`
- `export interface FinishUnitAttemptV4Input`
- `export interface WorkflowAttemptAccountingV4`
- `export interface ReserveUnitAttemptV4Result`
- `function dispatchingProcess(): string`
- `export interface InsertRunInput`
- `export interface InsertStepInput`
- `export interface PublishWorkflowRunV4Input`
- `export interface PublishChildWorkflowRunInput`
- `export interface ListRunsFilter`
- `export class WorkflowRunsRepository`
- `export function countWorkflowRunRefsForRename`
- `export function renameWorkflowRunRefs(db: Database, oldBundleId: string, newBundleId: string): number`
- `export async function withWorkflowRunsRepo<T>(fn: (repo: WorkflowRunsRepository) => T | Promise<T>): Promise<T>`
- `export function withWorkflowRunsConnection<T>(fn: () => Promise<T>): Promise<T>`
