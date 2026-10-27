---
description: "Repo map of akm src/storage at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  storage/
    repositories/
      embeddings-repository.ts
      events-repository.ts
      extract-sessions-repository.ts
      improve-ledger-repository.ts
      improve-runs-repository.ts
      index-connection.ts
      index-db.ts
      index-entries-repository.ts
      index-entry-mapper.ts
      index-entry-schema.ts
      index-entry-types.ts
      index-fts-repository.ts
      index-links-repository.ts
      index-llm-cache-repository.ts
      index-meta-repository.ts
      index-schema.ts
      index-sql.ts
      index-utility-repository.ts
      index-vec-repository.ts
      metrics-repository.ts
      outcome-repository.ts
      proposals-repository.ts
      registry-index-cache-repository.ts
      salience-repository.ts
      task-history-repository.ts
      workflow-runs-repository.ts
    database.ts
    like-pattern.ts
    locations.ts
    managed-db.ts
    sqlite-migrations.ts
    sqlite-pragmas.ts
    sqlite-read-snapshot.ts
    sqlite-transaction.ts
    state-db-integrity.ts
```

# Files

## File: src/storage/repositories/embeddings-repository.ts
```typescript
import type { Database } from "../database";
⋮----
export function embeddingToBlob(vec: number[]): Uint8Array
⋮----
export function blobToEmbedding(blob: Uint8Array): number[]
⋮----
export function getBodyEmbeddings(
  db: Database,
  contentHashes: readonly string[],
  expectedModelId: string,
): Map<string, number[]>
⋮----
export function upsertBodyEmbeddings(
  db: Database,
  entries: Array<{ contentHash: string; embedding: number[]; modelId: string }>,
): void
```

## File: src/storage/repositories/events-repository.ts
```typescript
import type { EventEnvelope } from "../../core/events-types";
import { isReadOnlyFilesystemError } from "../../core/system-error";
import { error } from "../../core/warn";
import type { Database, SqlValue } from "../database";
⋮----
export interface EventRow {
  id: number;
  event_type: string;
  ts: string;
  ref: string | null;
  metadata_json: string;
}
⋮----
export function eventRowToEnvelope(row: EventRow): EventEnvelope
⋮----
export function insertEvent(
  db: Database,
  input: {
    eventType: string;
    ts: string;
    ref?: string;
    metadata?: Record<string, unknown>;
  },
): number | undefined
⋮----
export function insertEventStrict(
  db: Database,
  input: {
    eventType: string;
    ts: string;
    ref?: string;
    metadata?: Record<string, unknown>;
  },
): number
⋮----
export function insertEventOnce(
  db: Database,
  input: {
    eventType: string;
    ts: string;
    ref?: string;
    metadata: Record<string, unknown>;
    idempotencyKey: string;
    idempotencyMetadataKey?: string;
  },
): number
⋮----
export interface ReadStateEventsOptions {

  sinceId?: number;

  since?: string;

  type?: string;

  ref?: string;


















  limit?: number;
}
⋮----
export function readStateEvents(
  db: Database,
  options: ReadStateEventsOptions = {},
):
⋮----
export function purgeOldEvents(db: Database, retentionDays = 90): number
```

## File: src/storage/repositories/extract-sessions-repository.ts
```typescript
import type { Database } from "../database";
⋮----
export interface ExtractedSessionRow {
  harness: string;
  session_id: string;

  processed_at: string;

  session_ended_at: string | null;

  outcome:
    | "candidates_queued"
    | "candidates_blocked"
    | "proposal_write_failed"
    | "no_candidates"
    | "skipped"
    | "failed";
  candidate_count: number;
  proposal_count: number;

  rationale: string | null;

  source_run: string | null;
  metadata_json: string;







  content_hash: string | null;
}
⋮----
export function upsertExtractedSession(
  db: Database,
  input: {
    harness: string;
    sessionId: string;
    processedAt: string;
    sessionEndedAt?: number | null;
    outcome: ExtractedSessionRow["outcome"];
    candidateCount: number;
    proposalCount: number;
    rationale?: string | null;
    sourceRun?: string | null;
    metadata?: Record<string, unknown>;

    contentHash: string | null;
  },
): void
⋮----
export function getExtractedSession(db: Database, harness: string, sessionId: string): ExtractedSessionRow | undefined
⋮----
export function getExtractedSessionsMap(
  db: Database,
  harness: string,
  sessionIds: readonly string[],
): Map<string, ExtractedSessionRow>
⋮----
export function getLastExtractRunAt(db: Database, harness: string): number | null
⋮----
export interface ExtractOutcomeCount {
  harness: string;
  outcome: ExtractedSessionRow["outcome"];

  skipReason: string | null;

  engine: string | null;
  count: number;
}
⋮----
export function getExtractOutcomeCountsSince(db: Database, sinceIso: string): ExtractOutcomeCount[]
⋮----
export function shouldSkipAlreadyExtractedSession(
  prior: ExtractedSessionRow | undefined,
  currentContentHash: string,
): boolean
```

## File: src/storage/repositories/improve-ledger-repository.ts
```typescript
import type { Database } from "../database";
⋮----
export type ImproveLedgerOutcome = (typeof IMPROVE_LEDGER_OUTCOMES)[number];
⋮----
export interface ImproveLedgerRow {
  stashDir: string;

  ref: string;
  source: string;

  lastAttemptAt: string;
  outcome: ImproveLedgerOutcome;

  nextEligibleAt: string | null;
  proposalId: string | null;

  detail: string | null;







  contentHash: string | null;
}
⋮----
export function isContentDrivenDecision(source: string, outcome: ImproveLedgerOutcome): boolean
⋮----
export function isContentDrivenRow(row: Pick<ImproveLedgerRow, "source" | "outcome" | "contentHash">): boolean
⋮----
function windowDays(source: string, outcome: ImproveLedgerOutcome): number | null
⋮----
export function nextEligibleAt(
  source: string,
  outcome: ImproveLedgerOutcome,
  fromIso: string,
  contentHash?: string | null,
): string | null
⋮----
export function isLedgerBlocked(row: ImproveLedgerRow | undefined, nowIso: string, signalSinceIso?: string): boolean
⋮----
interface LedgerSqlRow {
  stash_dir: string;
  ref: string;
  source: string;
  last_attempt_at: string;
  outcome: string;
  next_eligible_at: string | null;
  proposal_id: string | null;
  detail: string | null;
  content_hash: string | null;
}
⋮----
function toRow(row: LedgerSqlRow): ImproveLedgerRow
⋮----
function trimDetail(detail: string | undefined): string | null
⋮----
export interface RecordImproveLedgerInput {
  stashDir: string;
  ref: string;
  source: string;
  outcome: ImproveLedgerOutcome;

  at: string;
  proposalId?: string;
  detail?: string;

  contentHash?: string;
}
⋮----
export function recordImproveLedger(db: Database, input: RecordImproveLedgerInput): ImproveLedgerRow
⋮----
export interface RecordImproveLedgerDecisionInput {
  proposalId: string;
  stashDir: string;





  ref: string;
  source: string;
  outcome: ImproveLedgerOutcome;

  at: string;
  detail?: string;






  contentHash?: string;
}
⋮----
export function recordImproveLedgerDecision(db: Database, input: RecordImproveLedgerDecisionInput): void
⋮----
export function reopenImproveLedgerDecision(
  db: Database,
  input: { proposalId: string; stashDir: string; source: string; at: string; detail?: string },
): void
⋮----
export function forgetImproveLedgerDecision(db: Database, stashDir: string, proposalId: string): void
⋮----
function hasContentHashColumn(db: Database): boolean
⋮----
export function getImproveLedgerRow(
  db: Database,
  stashDir: string,
  ref: string,
  source: string,
): ImproveLedgerRow | undefined
⋮----
export function listImproveLedgerRows(db: Database, stashDir: string, sources?: readonly string[]): ImproveLedgerRow[]
```

## File: src/storage/repositories/improve-runs-repository.ts
```typescript
import type { ImproveResultEnvelope } from "../../core/improve-result";
import { classifyImproveAction } from "../../core/improve-types";
import type { Database } from "../database";
⋮----
export interface ImproveRunRow {
  id: string;
  started_at: string;
  completed_at: string | null;
  stash_dir: string;
  dry_run: number;
  strategy: string | null;
  scope_mode: string;
  scope_value: string | null;
  guidance: string | null;
  ok: number;
  result_json: string;
  metrics_json: string | null;
  metadata_json: string;
}
⋮----
export interface ImproveRunMetrics {

  plannedCount: number;

  actionsCount: number;

  acceptedCount: number;

  rejectedCount: number;

  skippedCount: number;

  autoAcceptedCount: number;

  errorCount: number;
}
⋮----
export function computeImproveRunMetrics(result: ImproveResultEnvelope): ImproveRunMetrics
⋮----
export function recordImproveRun(
  db: Database,
  input: {
    id: string;
    startedAt: string;
    completedAt: string | null;
    stashDir: string;
    dryRun: boolean;
    strategy: string;
    scopeMode: "all" | "type" | "ref";
    scopeValue: string | null;
    guidance: string | null;
    ok: boolean;
    result: ImproveResultEnvelope;
    metrics?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  },
): void
⋮----
export interface ImproveRunSummaryRow {
  id: string;
  started_at: string;
  completed_at: string;
  ok: number;
  scope_mode: string;
  scope_value: string | null;
  strategy: string | null;
  result_json: string;
}
⋮----
export function queryImproveRuns(db: Database, since: string, until?: string): ImproveRunSummaryRow[]
⋮----
export function getImproveRunById(db: Database, id: string): ImproveRunRow | undefined
⋮----
export function getLatestImproveRun(db: Database): ImproveRunRow | undefined
⋮----
export function listRecentImproveRuns(db: Database, limit: number): ImproveRunSummaryRow[]
⋮----
export function purgeOldImproveRuns(db: Database, retentionDays = 90): number
```

## File: src/storage/repositories/index-connection.ts
```typescript
import fs from "node:fs";
import { ConfigError } from "../../core/errors";
import { classifyPathAccess, describeInaccessiblePath } from "../../core/path-access";
import { getDbPath } from "../../core/paths";
import { warn, warnOnce } from "../../core/warn";
import type { Database } from "../database";
import { openDatabase } from "../database";
import { openManagedDatabase } from "../managed-db";
import { SQLITE_BUSY_TIMEOUT_MS } from "../sqlite-pragmas";
import { openSqliteReadSnapshot, SqliteReadSnapshotUnavailableError } from "../sqlite-read-snapshot";
import { CANONICAL_INDEX_DB_VERSION } from "./index-entry-schema";
import { ensureSchema, newerIndexLayoutError } from "./index-schema";
⋮----
function isCorruptionError(error: unknown): boolean
⋮----
export function openIndexDatabase(dbPath?: string, options?:
⋮----
export function openExistingDatabase(dbPath?: string): Database
⋮----
function checkIndexLayout(db: Database, resolvedPath: string): void
⋮----
export function assertIndexPathReadable(resolvedPath: string): void
⋮----
function openPlainReadonly(resolvedPath: string): Database | undefined
⋮----
function openIsolatedSnapshotOrFallBack(resolvedPath: string): Database | undefined
⋮----
export function openReadonlyExistingDatabase(
  dbPath?: string,
  options?: { isolatedSnapshot?: boolean; busyTimeoutMs?: number },
): Database | undefined
⋮----
export function closeDatabase(db: Database): void
```

## File: src/storage/repositories/index-db.ts
```typescript
import type { Database } from "../database";
import { resolveStorageLocations } from "../locations";
import { withManagedDb } from "../managed-db";
import { openExistingDatabase, openReadonlyExistingDatabase } from "./index-connection";
⋮----
export interface WithIndexDbOptions {




  readOnly?: boolean;







  busyTimeoutMs?: number;
}
⋮----
export function withIndexDb<T>(fn: (db: Database) => T, opts?: WithIndexDbOptions): T
```

## File: src/storage/repositories/index-entries-repository.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { parseBundleRef } from "../../core/asset/asset-ref";
import { conceptIdFromTypeName } from "../../core/asset/resolve-ref";
import { bestEffort } from "../../core/best-effort";
import { isPathAbsent } from "../../core/path-access";
import { getStateDbPath, withStateDb } from "../../core/state-db";
import { warn } from "../../core/warn";
import {
  getMarkdownFragmentContent,
  hasMarkdownFragmentContent,
  type IndexDocument,
} from "../../indexer/passes/metadata";
import { buildSearchText } from "../../indexer/search/search-fields";
import { sha256Hex } from "../../runtime";
import type { Database, SqlValue } from "../database";
import { ENTRY_COLUMNS, type EntryRow, rowToIndexedEntry } from "./index-entry-mapper";
import type { DbIndexedEntry, EntryProvenance, RekeyEntryOptions } from "./index-entry-types";
import { deleteFtsEntries, replaceFtsEntry } from "./index-fts-repository";
import { deleteEntryLinks, replaceEntryLinks } from "./index-links-repository";
import { SQLITE_CHUNK_SIZE } from "./index-sql";
import { deleteEntryVectors } from "./index-vec-repository";
⋮----
function embedHash(entry: IndexDocument): string
⋮----
export function upsertEntry(
  db: Database,
  filePath: string,
  entry: IndexDocument,
  provenance: EntryProvenance,
  contentHash?: string,
): number
⋮----
const apply = (): number =>
⋮----
interface UpsertStmts {
  upsert: ReturnType<Database["prepare"]>;
  findByItemRef: ReturnType<Database["prepare"]>;
}
⋮----
interface ExistingUpsertRow {
  id: number;
  embed_hash: string | null;
}
⋮----
function getUpsertStmts(db: Database): UpsertStmts
⋮----
export function getDerivedForParent(db: Database, parentRef: string, bundleId?: string): DbIndexedEntry | null
⋮----
export function getBaseBeliefStatesForDerivedTwins(db: Database, twinIds: number[]): Map<number, string>
⋮----
export function rekeyEntryInPlace(db: Database, opts: RekeyEntryOptions): number | null
⋮----
function rewriteUsageEventRefForMove(opts: RekeyEntryOptions): void
⋮----
const rename = (stateDb: Database, oldR: string, newR: string): void =>
⋮----
function selectRowsInDirectory<T extends { file_path: string }>(
  db: Database,
  dirPath: string,
  columns: string,
  bundleId?: string,
): T[]
⋮----
function rowsInDirectory(db: Database, dirPath: string, bundleId?: string): Array<
⋮----
function deleteEntryRows(
  db: Database,
  rows: Array<{ id: number }>,
  options: { cleanupUsageEvents?: boolean } = {},
): number[]
⋮----
export function deleteEntriesByDirAndBundle(
  db: Database,
  dirPath: string,
  bundleId: string,
  options: { cleanupUsageEvents?: boolean } = {},
): number[]
⋮----
export function deleteEntriesByBundle(db: Database, bundleId: string): void
⋮----
export function getFilePathsByBundle(db: Database, bundleId: string): string[]
⋮----
export function renameEntriesBundleId(db: Database, oldBundleId: string, newBundleId: string): number
⋮----
export function deleteEntriesByDirExceptRefs(
  db: Database,
  dirPath: string,
  bundleId: string,
  keepRefs: ReadonlySet<string>,
  options: { cleanupUsageEvents?: boolean } = {},
): number[]
⋮----
function deleteRelatedRows(
  db: Database,
  ids: Array<{ id: number }>,
  options: { cleanupUsageEvents?: boolean } = {},
): void
⋮----
export function deleteUsageEventsByEntryIds(entryIds: number[]): void
⋮----
export function deleteEntriesByIds(db: Database, ids: number[]): void
⋮----
function parseEntryRows(rows: Array<Record<string, unknown>>, context: string): DbIndexedEntry[]
⋮----
export function getAllEntries(db: Database, entryType?: string, excludeTypes?: string[]): DbIndexedEntry[]
⋮----
export function findEntryIdByRef(db: Database, ref: string, bundleId?: string): number | undefined
⋮----
function withMdVariants(name: string): string[]
⋮----
function findEntryIdByBundleRef(db: Database, ref: string, bundleId?: string): number | undefined
⋮----
function matchIdByItemRef(
  db: Database,
  bundle: string | undefined,
  conceptId: string,
  bundleId?: string,
): number | undefined
⋮----
export function getEntryCount(db: Database): number
⋮----
export function getEntryCountByType(db: Database): Record<string, number>
⋮----
export function getEmbeddableEntryCount(db: Database): number
⋮----
export function getEntriesByIds(db: Database, ids: readonly number[]): DbIndexedEntry[]
⋮----
export function getEntryById(
  db: Database,
  id: number,
):
  | {
      filePath: string;
      entry: IndexDocument;
      itemRef: string;
      bundleId: string;
      componentId: string;
      conceptId: string;
      adapterId: string;
    }
  | undefined {
  const row = db
    .prepare(
      "SELECT file_path, document_json, item_ref, bundle_id, component_id, concept_id, adapter_id FROM entries WHERE id = ?",
    )
    .get(id) as
    | {
        file_path: string;
        document_json: string;
        item_ref: string;
        bundle_id: string;
        component_id: string;
        concept_id: string;
        adapter_id: string;
      }
    | undefined;
  if (!row) return undefined;
⋮----
export function getEntryRefsAndTypes(
  db: Database,
  ids: readonly number[],
): Map<number,
⋮----
export function getEntriesByDir(db: Database, dirPath: string): DbIndexedEntry[]
⋮----
export function getIndexedDirPathsByBundleId(db: Database, bundleId: string): string[]
⋮----
export function getIndexedBundleIdsByDir(db: Database, dirPath: string): string[]
⋮----
export function getEntryIdByFilePath(db: Database, filePath: string): number | undefined
⋮----
export function getIndexedFilePaths(db: Database): Set<string>
⋮----
export function getIndexedFileHashes(db: Database): Map<string, string>
⋮----
export function getEntryFilePathById(db: Database, id: number): string | undefined
⋮----
export function getZeroResultSearches(db: Database, sinceDays = 30): string[]
⋮----
export function getEntryByRef(db: Database, ref: string):
⋮----
export interface LiveRefSnapshot {
  itemRefs: ReadonlySet<string>;
  conceptIds: ReadonlySet<string>;
}
⋮----
export function getLiveRefSnapshot(db: Database): LiveRefSnapshot
⋮----
export function isRefLiveInSnapshot(snapshot: LiveRefSnapshot, ref: string): boolean
⋮----
export function getItemRefById(db: Database, id: number): string | null
⋮----
function resolveUsageEventEntryId(db: Database, ref: string): number | undefined
⋮----
export function relinkUsageEvents(indexDb: Database, stateDb: Database): void
```

## File: src/storage/repositories/index-entry-mapper.ts
```typescript
import { warn } from "../../core/warn";
import type { IndexDocument } from "../../indexer/passes/metadata";
import type { DbIndexedEntry } from "./index-entry-types";
⋮----
export type EntryRow = {
  id: number;

  item_ref: string;
  bundle_id: string;
  component_id: string;

  concept_id: string;

  adapter_id: string;
  type: string;
  file_path: string;
  content_hash: string | null;
  document_json: string;
};
⋮----
export function rowToIndexedEntry(row: EntryRow, context: string): DbIndexedEntry | null
```

## File: src/storage/repositories/index-entry-schema.ts
```typescript
export function entriesFtsDdl(contentless: boolean): string
⋮----
export function supportsContentlessDelete(db: EntrySchemaInspectionDatabase): boolean
⋮----
export interface EntrySchemaInspectionDatabase {
  prepare(sql: string): {
    all(): unknown[];
    get(): unknown;
  };
}
⋮----
prepare(sql: string):
⋮----
all(): unknown[];
get(): unknown;
⋮----
function sqlString(value: string): string
⋮----
export function readTableSql(db: EntrySchemaInspectionDatabase, name: string): string | null
⋮----
export function tableExists(db: EntrySchemaInspectionDatabase, name: string): boolean
⋮----
function entryColumnNames(db: EntrySchemaInspectionDatabase): Set<string>
⋮----
export function missingEntryColumns(db: EntrySchemaInspectionDatabase): string[]
⋮----
export function retiredEntryColumns(db: EntrySchemaInspectionDatabase): string[]
⋮----
export function hasCurrentEntriesTable(db: EntrySchemaInspectionDatabase): boolean
⋮----
export function isContentlessFtsDdl(sql: string | null): boolean
```

## File: src/storage/repositories/index-entry-types.ts
```typescript
import type { IndexDocument } from "../../indexer/passes/metadata";
⋮----
export interface EntryProvenance {
  itemRef: string;
  bundleId: string;
  componentId: string;
  conceptId: string;
  adapterId: string;
}
⋮----
export interface DbIndexedEntry {
  id: number;
  filePath: string;
  entry: IndexDocument;

  itemRef: string;






  conceptId: string;
  bundleId: string;
  componentId: string;
  adapterId: string;
  type: string;
  contentHash?: string;
}
⋮----
export interface DbVecResult {
  id: number;
  distance: number;
}
⋮----
export interface IndexDirState {
  dirPath: string;
  fileSetHash: string;
  fileMtimeMaxMs: number;
  reason: string;
  updatedAt: string;





  rowCount?: number;






  indexVariant?: string;
}
⋮----
export interface RekeyEntryOptions {

  newName: string;

  newFilePath: string;








  oldRef: string;

  newRef: string;

  sourceName: string;

  sourceRoot: string;





  newDerivedFrom?: string;
}
⋮----
export interface RetrievalCountOptions {

  sourceName?: string;
}
⋮----
export interface UtilityScoreData {
  utility: number;
  showCount: number;
  searchCount: number;
  selectRate: number;
  lastUsedAt?: string;
}
⋮----
export interface UtilityScoreRow extends UtilityScoreData {
  entryId: number;
  updatedAt: string;
}
⋮----
export interface LlmCacheEntry {
  assetRef: string;
  cacheVariant: string;
  bodyHash: string;
  resultJson: string;
  updatedAt: number;
}
⋮----
export type CandidateFilter = (ids: readonly number[]) => ReadonlySet<number>;
```

## File: src/storage/repositories/index-fts-repository.ts
```typescript
import { splitMarkdownFragments } from "../../core/asset/markdown-fragments";
import { warn } from "../../core/warn";
import type { IndexDocument } from "../../indexer/passes/metadata";
import { ftsOrMatch, ftsQueryTokens } from "../../indexer/search/fts-query";
import { buildSearchFields } from "../../indexer/search/search-fields";
import type { Database, RunResult, SqlValue } from "../database";
import { isContentlessFtsDdl, readTableSql } from "./index-entry-schema";
import type { CandidateFilter } from "./index-entry-types";
import { deleteMeta, getMeta } from "./index-meta-repository";
import { SQLITE_CHUNK_SIZE } from "./index-sql";
⋮----
function isContentlessFts(db: Database): boolean
⋮----
interface FtsMutationStatements {
  deleteOne: ReturnType<Database["prepare"]>;
  markTotalsStale: ReturnType<Database["prepare"]>;
  insert: ReturnType<Database["prepare"]>;
  upsertFragmentSource: ReturnType<Database["prepare"]>;
  deleteFragmentSource: ReturnType<Database["prepare"]>;
}
⋮----
function getFtsMutationStatements(db: Database): FtsMutationStatements
⋮----
function noteRemoval(statements: FtsMutationStatements, removed: RunResult): void
⋮----
export function replaceFtsEntry(
  db: Database,
  entryId: number,
  entry: IndexDocument,
  fragmentContent?: string | null,
): void
⋮----
export function deleteFtsEntries(db: Database, entryIds: readonly number[]): void
⋮----
export interface FtsCandidate {
  id: number;
  itemRef: string;
}
⋮----
export function searchFts(
  db: Database,
  query: string,
  limit: number,
  entryType?: string,
  excludeTypes: readonly string[] = [],
  filterCandidates?: CandidateFilter,
): FtsCandidate[]
⋮----
// Contentless FTS rows address their entry by rowid; the COALESCE also reads
// the content-bearing layout older releases wrote.
⋮----
// Stream matching rows in BM25 order, stopping at the eligible budget.
// No full-corpus materialization and no repeated OFFSET/restarted query.
⋮----
const keepBatch = () =>
⋮----
/**
 * Resolve an opaque fragment selector from the indexed safe projection, not
 * from current disk. A search result remains self-consistent across a later
 * file edit; the next index refresh atomically publishes the new revision.
 */
export function getIndexedMarkdownFragment(
  db: Database,
  itemRef: string,
  fragmentId: string,
): IndexedMarkdownFragment | undefined
⋮----
function materializeIndexedMarkdownFragment(
  fragment: ReturnType<typeof splitMarkdownFragments>[number],
  fragments: ReturnType<typeof splitMarkdownFragments>,
  parentChars: number,
): IndexedMarkdownFragment
⋮----
/** Indexed-safe fragment data used by show context assembly. */
export interface IndexedMarkdownFragment {
  content: string;
  /** Internal zero-based position. Public output converts this to one-based. */
  ordinal: number;
  count: number;
  startLine: number;
  endLine: number;
  previousFragmentId?: string;
  nextFragmentId?: string;
  fragmentChars: number;
  parentChars: number;
  /** Complete indexed revision; never surfaced directly in JSON. */
  fragments: ReturnType<typeof splitMarkdownFragments>;
}
⋮----
/** Internal zero-based position. Public output converts this to one-based. */
⋮----
/** Complete indexed revision; never surfaced directly in JSON. */
⋮----
/**
 * Explicitly rebuild `entries_fts` from canonical entries.
 * Ordinary entry mutations do not call this: `upsertEntry` and the delete
 * operations publish their FTS state in the same transaction as `entries`.
 * This remains a recovery/schema-verification primitive for regenerable
 * `index.db` state.
 *
 * Skipped corrupt-JSON rows are aggregated into one warning instead of
 * spamming stderr per-entry.
 */
export function rebuildFts(db: Database): void
⋮----
// `delete-all` also resets the BM25 totals, which a plain DELETE leaves as they were (#1048).
⋮----
export function rebuildFtsIfTotalsStale(db: Database): boolean
```

## File: src/storage/repositories/index-links-repository.ts
```typescript
import { type DeclaredLink, declaredLinks } from "../../indexer/links/declared-links";
import type { IndexDocument } from "../../indexer/passes/metadata";
import type { Database } from "../database";
import { tableExists } from "./index-entry-schema";
import { SQLITE_CHUNK_SIZE } from "./index-sql";
⋮----
interface LinkStatements {
  deleteForEntry: ReturnType<Database["prepare"]>;
  insert: ReturnType<Database["prepare"]>;
}
⋮----
function statements(db: Database): LinkStatements
⋮----
export function replaceEntryLinks(
  db: Database,
  entryId: number,
  document: IndexDocument,
  owner: { bundleId: string; conceptId: string },
): void
⋮----
export function deleteEntryLinks(db: Database, entryIds: readonly number[]): void
⋮----
export function rebuildAllEntryLinks(db: Database): void
⋮----
export interface EntryLinkRow {
  kind: string;

  bundleId?: string;
  conceptId?: string;
  type?: string;

  raw?: string;
}
⋮----
export function readEntryLinks(db: Database, itemRef: string):
⋮----
export function countLinksByKind(db: Database): Record<string,
```

## File: src/storage/repositories/index-llm-cache-repository.ts
```typescript
import { sha256Hex } from "../../runtime";
import type { Database, SqlValue } from "../database";
import type { LlmCacheEntry } from "./index-entry-types";
import { SQLITE_CHUNK_SIZE } from "./index-sql";
⋮----
export function getLlmCacheEntry(
  db: Database,
  assetRef: string,
  currentBodyHash: string,
  cacheVariant: string,
): LlmCacheEntry | undefined
⋮----
export function getLlmCacheEntriesByRefs(
  db: Database,
  refs: string[],
  cacheVariant: string,
): Map<string, LlmCacheEntry>
⋮----
export function upsertLlmCacheEntry(
  db: Database,
  assetRef: string,
  bodyHash: string,
  resultJson: string,
  cacheVariant: string,
): void
⋮----
export function clearStaleCacheEntries(db: Database): void
⋮----
export function computeBodyHash(body: string): string
```

## File: src/storage/repositories/index-meta-repository.ts
```typescript
import type { Database } from "../database";
import type { IndexDirState } from "./index-entry-types";
⋮----
export function getMeta(db: Database, key: string): string | undefined
⋮----
export function setMeta(db: Database, key: string, value: string): void
⋮----
export function deleteMeta(db: Database, key: string): void
⋮----
export function getIndexDirState(db: Database, dirPath: string): IndexDirState | undefined
⋮----
export function upsertIndexDirState(
  db: Database,
  state: Pick<IndexDirState, "dirPath" | "fileSetHash" | "fileMtimeMaxMs" | "reason" | "rowCount" | "indexVariant">,
): void
⋮----
export function deleteIndexDirState(db: Database, dirPath: string): void
```

## File: src/storage/repositories/index-schema.ts
```typescript
import { createRequire } from "node:module";
import path from "node:path";
import { ConfigError } from "../../core/errors";
import { warn } from "../../core/warn";
import { sha256Hex } from "../../runtime";
import type { Database } from "../database";
import {
  CANONICAL_ENTRY_SCHEMA_SQL,
  CANONICAL_INDEX_DB_VERSION,
  entriesFtsDdl,
  isContentlessFtsDdl,
  missingEntryColumns,
  readTableSql,
  retiredEntryColumns,
  supportsContentlessDelete,
  tableExists,
} from "./index-entry-schema";
import { rebuildFts } from "./index-fts-repository";
import { rebuildAllEntryLinks } from "./index-links-repository";
import { getMeta, setMeta } from "./index-meta-repository";
⋮----
export function newerIndexLayoutError(storedVersion: number, dbPath?: string): ConfigError
⋮----
function ensureEntriesLayout(db: Database): void
⋮----
function dropVecMirror(db: Database): void
⋮----
function replaceSearchTextWithHash(db: Database): void
⋮----
function ensureFtsLayout(db: Database): void
⋮----
function migrateToDeclaredLinks(db: Database): void
⋮----
function tableHasColumn(db: Database, table: string, column: string): boolean
⋮----
function ensureColumn(db: Database, table: string, column: string, type: string): boolean
⋮----
export function ensureSchema(db: Database): void
```

## File: src/storage/repositories/index-sql.ts
```typescript

```

## File: src/storage/repositories/index-utility-repository.ts
```typescript
import { conceptIdFromTypeName, parseRefInput } from "../../core/asset/resolve-ref";
import type { Database, SqlValue } from "../database";
import type { RetrievalCountOptions, UtilityScoreData, UtilityScoreRow } from "./index-entry-types";
import { SQLITE_CHUNK_SIZE } from "./index-sql";
⋮----
export function getUtilityScore(db: Database, entryId: number): UtilityScoreRow | undefined
⋮----
export function getUtilityScoresByIds(db: Database, ids: number[]): Map<number, UtilityScoreRow>
⋮----
export function upsertUtilityScore(db: Database, entryId: number, data: UtilityScoreData): boolean
⋮----
function bareRef(ref: string): string
⋮----
function bareRefCandidates(ref: string): string[]
⋮----
export function getRetrievalCounts(
  indexDb: Database,
  stateDb: Database,
  refs: string[],
  options: RetrievalCountOptions = {},
): Map<string, number>
⋮----
function getSourceScopedRetrievalCounts(
  indexDb: Database,
  stateDb: Database,
  refs: string[],
  options: RetrievalCountOptions,
): Map<string, number>
⋮----
const bundleFor = (entryId: number | null): string | null =>
⋮----
export interface UtilityWithRef {

  ref: string;
  score?: Pick<UtilityScoreRow, "utility" | "showCount" | "searchCount" | "selectRate" | "lastUsedAt">;
}
⋮----
export function listUtilityWithRefs(db: Database): UtilityWithRef[]
```

## File: src/storage/repositories/index-vec-repository.ts
```typescript
import type { IndexDocument } from "../../indexer/passes/metadata";
import { buildSearchText } from "../../indexer/search/search-fields";
import type { EmbeddingVector } from "../../llm/embedders/types";
import type { Database } from "../database";
import type { CandidateFilter, DbVecResult } from "./index-entry-types";
import { getMeta, setMeta } from "./index-meta-repository";
import { SQLITE_CHUNK_SIZE } from "./index-sql";
⋮----
function currentEmbeddingModel(db: Database): string | undefined
⋮----
function hasModelColumn(db: Database): boolean
⋮----
function modelPredicate(
  db: Database,
  model: string | undefined,
  alias = "embeddings",
):
⋮----
export function deleteEntryVectors(db: Database, id: number): void
⋮----
export function purgeEmbeddings(db: Database): void
⋮----
export function upsertEmbedding(db: Database, entryId: number, embedding: EmbeddingVector, model?: string): boolean
⋮----
export interface VecScope {
  type: string;
  bundleId: string;
}
⋮----
export function searchVec(
  db: Database,
  query: ArrayLike<number>,
  k: number,
  scope?: VecScope,
  filterCandidates?: CandidateFilter,
): DbVecResult[]
⋮----
// A Float32Array view needs 4-byte alignment; copy the rare row that lacks it.
⋮----
const result = (index: number): DbVecResult => (
⋮----
// Filter in similarity order, a batch at a time, so only the rows near the
// top are loaded and checked — not every embedded entry.
⋮----
/**
 * The k nearest neighbours of an already-indexed entry, by its stored vector —
 * no re-embedding, no network. Returns [] when the entry has no stored
 * vector. Unscoped, the entry itself is typically returned with distance ~0;
 * callers filter it out by id. A `scope` confines the neighbours to one
 * bundle's entries of one type (see {@link searchVec}).
 */
export function getNeighborsByEntryId(db: Database, id: number, k: number, scope?: VecScope): DbVecResult[]
⋮----
/** Whether the entry has a stored vector (what {@link getNeighborsByEntryId} reads). */
export function hasStoredEmbedding(db: Database, id: number): boolean
⋮----
/** One entry the embedding pass has to (re)embed, with the text its vector is embedded from. */
export interface EntryForEmbedding {
  id: number;
  searchText: string;
  itemRef: string;
  filePath: string;
}
⋮----
/**
 * Every entry that has no embedding row for `model` (any row when no model is
 * given), with its embedding input derived from the stored document
 * (`buildSearchText`, whose hash `upsertEntry` keeps in `entries.embed_hash`).
 * This is the embedding pass's cursor: a row generated under another model
 * counts as missing and is replaced when the entry is re-embedded, so a model
 * change re-embeds incrementally and an interrupted pass resumes where it
 * stopped. A row whose `document_json` does not parse has no text to embed
 * and is left out.
 */
export function getAllEntriesForEmbedding(
  db: Database,
  entryIds?: readonly number[],
  model?: string,
): EntryForEmbedding[]
⋮----
type Row = { id: number; documentJson: string; itemRef: string; filePath: string };
⋮----
export function getEmbeddingCount(db: Database, model?: string): number
```

## File: src/storage/repositories/metrics-repository.ts
```typescript
import type { UsageEventRow } from "../../indexer/usage/usage-events";
import type { Database } from "../database";
import type { AssetOutcomeRow } from "./outcome-repository";
⋮----
export interface MetricsQueryFilter {
  sinceIso: string;
  untilIso: string;

  source?: string;
}
⋮----
export function listUsageEventRows(db: Database, filter: MetricsQueryFilter): UsageEventRow[]
⋮----
export function listFeedbackEventRows(db: Database, entryRef: string, limit: number): UsageEventRow[]
⋮----
export function countFeedbackBySignal(db: Database, entryRef: string): Record<string, number>
⋮----
export function listSelectEvents(db: Database, sinceIso: string, untilIso: string): Array<
⋮----
export function listIndexCompletedEvents(
  db: Database,
  sinceIso: string,
  untilIso: string,
): Array<
⋮----
export function listLowestOutcomeAssets(db: Database, limit: number): AssetOutcomeRow[]
⋮----
export function countProposalsByStatus(db: Database, sinceIso: string, untilIso: string): Record<string, number>
⋮----
export function summarizeWorkflowRuns(
  db: Database,
  sinceIso: string,
  untilIso: string,
):
```

## File: src/storage/repositories/outcome-repository.ts
```typescript
import type { Database } from "../database";
⋮----
export interface AssetOutcomeRow {
  asset_ref: string;
  last_retrieved_at: number;
  retrieval_count: number;
  expected_retrieval_rate: number;
  negative_feedback_count: number;
  accepted_change_count: number;
  outcome_score: number;
  updated_at: number;
}
⋮----
export interface AssetOutcomeUpsertValues {
  ref: string;
  lastRetrievedAt: number;
  retrievalCount: number;
  expectedRetrievalRate: number;
  negativeFeedbackCount: number;
  acceptedChangeCount: number;
  outcomeScore: number;
  updatedAt: number;
}
⋮----
export function upsertAssetOutcome(db: Database, values: AssetOutcomeUpsertValues): void
⋮----
export function getAssetOutcome(db: Database, ref: string): AssetOutcomeRow | undefined
⋮----
export function getAllAssetOutcomes(db: Database): AssetOutcomeRow[]
⋮----
export function getOutcomeScoresByRef(db: Database, refs: string[]): Map<string, number>
⋮----
export interface AssetOutcomeMissingRow {
  asset_ref: string;
  missing_since: number | null;
}
⋮----
export function listAssetOutcomeMissingState(db: Database): AssetOutcomeMissingRow[]
⋮----
export function stampAssetOutcomeMissing(db: Database, refs: readonly string[], now: number): number
⋮----
export function clearAssetOutcomeMissing(db: Database, refs: readonly string[]): number
⋮----
export function deleteAssetOutcomeMissingBefore(db: Database, cutoffMs: number): number
⋮----
export function countAssetOutcomeMissing(db: Database): number
```

## File: src/storage/repositories/proposals-repository.ts
```typescript
import path from "node:path";
import type { Proposal, ProposalGateDecisionOutcome } from "../../commands/proposal/proposal-types";
import { stashDirFor } from "../../core/asset/asset-placement";
import { bundleRefToString, isBundleSlug, parseBundleRef } from "../../core/asset/asset-ref";
import type { FileChange } from "../../core/file-change";
import { warnOnce } from "../../core/warn";
import type { Database, SqlValue } from "../database";
import { escapeLikePattern } from "../like-pattern";
⋮----
interface StoredFileChange {
  path: string;
  op: FileChange["op"];
  after?: string;
}
⋮----
function changesToStored(changes: FileChange[]): StoredFileChange[]
⋮----
function storedToChanges(stored: unknown, content: string): FileChange[]
⋮----
function currentProposalRef(ref: string, requireQualified = false): string
⋮----
function currentProposalTarget(value: unknown): NonNullable<Proposal["proposedTarget"]>
⋮----
function invalidPresentField(name: string): never
⋮----
function isRecord(value: unknown): value is Record<string, unknown>
⋮----
function isReviewHistoryEntry(value: unknown): boolean
⋮----
function validatePresentMetadata(meta: Record<string, unknown>): void
⋮----
export interface ProposalRow {
  id: string;
  stash_dir: string;
  ref: string;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
  content: string;
  frontmatter_json: string | null;
  metadata_json: string;
}
⋮----
export function proposalRowToProposal(row: ProposalRow): Proposal
⋮----
export function proposalToRowValues(proposal: Proposal, stashDir: string): Omit<ProposalRow, "id"> &
⋮----
export function upsertProposal(db: Database, proposal: Proposal, stashDir: string): void
⋮----
export function listStateProposals(
  db: Database,
  options: { stashDir?: string; status?: string; ref?: string } = {},
): Proposal[]
⋮----
// Per-row skip-and-warn (#858/#859): a single row that fails to parse
// (invalid ref/status/metadata shape — genuine corruption, distinct from
// the tolerated legacy-missing-`changes` case in `storedToChanges` above)
// must not abort the entire list. Every caller of this function reads a
// multi-row archive; one bad row hiding the rest behind a thrown error is
// strictly worse than surfacing the well-formed rows plus a warning.
⋮----
// Once per row per process (#898): health alone reads this table several
// times per invocation.
⋮----
/**
 * Look up a single proposal by id, optionally scoped to one stash root.
 * Returns undefined when not found.
 */
export function getStateProposal(db: Database, id: string, stashDir?: string): Proposal | undefined
⋮----
/** `(ref, source)` of every proposal, any status, in one stash: no payload is read. */
export function listProposalRefSources(db: Database, stashDir: string): Array<
⋮----
export function listStateProposalIdsByPrefix(db: Database, stashDir: string, idPrefix: string): string[]
⋮----
export function countProposalsForBundleRename(db: Database, oldBundleId: string):
⋮----
export function renameProposalsBundleRef(
  db: Database,
  oldBundleId: string,
  newBundleId: string,
):
```

## File: src/storage/repositories/registry-index-cache-repository.ts
```typescript
import { rethrowIfTestIsolationError } from "../../core/errors";
import { formatRegistryError } from "../../core/registry-url";
import { warn } from "../../core/warn";
import type { Database } from "../database";
import { closeDatabase, openIndexDatabase } from "./index-connection";
⋮----
export type RegistryIndexCacheRow = {
  indexJson: string;
  etag: string | null;
  lastModified: string | null;
};
⋮----
export function upsertRegistryIndexCache(
  db: Database,
  registryUrl: string,
  indexJson: string,
  opts?: { etag?: string; lastModified?: string },
): void
⋮----
export function getRegistryIndexCache(
  db: Database,
  registryUrl: string,
  maxAgeMs = 3_600_000 ,
): RegistryIndexCacheRow | undefined
⋮----
export async function withRegistryCacheDb<T>(fn: (db: Database | undefined) => Promise<T>): Promise<T>
⋮----
export interface FetchCachedJsonOptions<T> {

  cacheKey: string;

  ttlMs: number;










  parseCache: (json: string, opts: { stale: boolean }) => T | undefined;





  fetchFresh: () => Promise<{ value: T; cacheJson: string }>;
}
⋮----
export async function fetchCachedJson<T>(opts: FetchCachedJsonOptions<T>): Promise<T>
```

## File: src/storage/repositories/salience-repository.ts
```typescript
import type { Database } from "../database";
⋮----
export interface AssetSalienceRow {
  asset_ref: string;
  encoding_salience: number;
  outcome_salience: number;
  retrieval_salience: number;
  rank_score: number;
  consecutive_no_ops: number;
  updated_at: number;






  encoding_source: "content" | "type-stub" | null;
}
⋮----
interface SalienceVectorLike {
  encoding: number;
  outcome: number;
  retrieval: number;
  rankScore: number;
  encodingSource?: "content" | "type-stub";
}
⋮----
export function upsertAssetSalience(db: Database, ref: string, vector: SalienceVectorLike, now?: number): void
⋮----
export function getAssetSalience(db: Database, ref: string): AssetSalienceRow | undefined
⋮----
export function recordNoOp(db: Database, ref: string): void
⋮----
export function resetConsecutiveNoOps(db: Database, ref: string): void
⋮----
export function getConsecutiveNoOps(db: Database, ref: string): number
⋮----
export function getObservedRetrievalSalience(db: Database): Array<
⋮----
export interface AssetSalienceMissingRow {
  asset_ref: string;
  missing_since: number | null;
}
⋮----
export function listAssetSalienceMissingState(db: Database): AssetSalienceMissingRow[]
⋮----
export function stampAssetSalienceMissing(db: Database, refs: readonly string[], now: number): number
⋮----
export function clearAssetSalienceMissing(db: Database, refs: readonly string[]): number
⋮----
export function deleteAssetSalienceMissingBefore(db: Database, cutoffMs: number): number
⋮----
export function countAssetSalienceMissing(db: Database): number
```

## File: src/storage/repositories/task-history-repository.ts
```typescript
import { isRecord } from "../../core/common";
import { warnOnce } from "../../core/warn";
import type { Database, SqlValue } from "../database";
import { escapeLikePattern } from "../like-pattern";
⋮----
export type TaskHistoryDetail = {
  runId?: string;
  reason?: string;
  error?: string;
  exitCode?: number | null;
};
⋮----
export interface TaskHistoryMetadata {
  metadataVersion: 2;
  durationMs: number;
  detail: TaskHistoryDetail | null;
  engine?: string | null;
}
⋮----
function metadataError(message: string): never
⋮----
function validateDetail(value: unknown): asserts value is TaskHistoryDetail | null | undefined
⋮----
export function decodeTaskHistoryMetadata(input: string | unknown): TaskHistoryMetadata
⋮----
export interface TaskHistoryRow {
  id?: number;
  task_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  failed_at: string | null;
  log_path: string | null;
  target_kind: string | null;
  target_ref: string | null;
  metadata_json: string;
}
⋮----
export function reserveTaskHistoryAttempt(db: Database, row: TaskHistoryRow): boolean
⋮----
export function finalizeTaskHistoryAttempt(db: Database, row: TaskHistoryRow): boolean
⋮----
export function upsertTaskHistory(db: Database, row: TaskHistoryRow): void
⋮----
export function getTaskHistory(db: Database, taskId: string): TaskHistoryRow | undefined
⋮----
export function getTaskHistoryRuns(db: Database, taskId: string, limit = 50): TaskHistoryRow[]
⋮----
export function queryTaskHistory(
  db: Database,
  options: {
    since?: string;
    until?: string;
    status?: string;
    targetKind?: string;
    targetRef?: string;
    limit?: number;
  } = {},
): TaskHistoryRow[]
⋮----
/**
 * Slim projection of a `task_history` row used by health interval analysis.
 */
export interface TaskIntervalRow {
  started_at: string;
  completed_at: string;
}
⋮----
/**
 * Read COMPLETED `akm-improve` task_history runs whose `started_at` falls in
 * `[since, until)` (or `started_at >= since` when `until` is omitted), ordered
 * oldest-first by `started_at`. Only rows with a non-null `completed_at` are
 * returned (in-flight runs are excluded). The `task_id = 'akm-improve'`
 * predicate is fixed because the only caller (commands/health.ts
 * `loadTaskIntervals`) builds wall-time intervals for the improve cron task.
 *
 * Owns the SQL formerly inlined in commands/health.ts. Note the bound is
 * EXCLUSIVE on the upper end (`started_at < ?`) — callers pass an already
 * widened window; this helper does not widen.
 *
 * Connection-lifetime rule (WS5): `.all()` materializes a plain array before
 * returning.
 */
export function queryCompletedTaskIntervals(db: Database, since: string, until?: string): TaskIntervalRow[]
⋮----
export function countTaskHistoryTargetRefs(db: Database, oldBundleId: string): number
⋮----
export function renameTaskHistoryTargetRefs(db: Database, oldBundleId: string, newBundleId: string): number
```

## File: src/storage/repositories/workflow-runs-repository.ts
```typescript
import { randomUUID } from "node:crypto";
import { NotFoundError, UsageError } from "../../core/errors";
import { openStateDatabase, withImmediateTransaction } from "../../core/state-db";
import { borrowScopedStateDb, withStateDbScope } from "../../core/state-db-scope";
import type { WorkflowRunStatus, WorkflowRunStepStatus } from "../../sources/types";
import { WORKFLOW_PLAN_VERSION } from "../../workflows/plan";
import type { Database } from "../database";
import { escapeLikePattern } from "../like-pattern";
import { resolveStorageLocations } from "../locations";
import { insertEventOnce, insertEventStrict } from "./events-repository";
⋮----
export type WorkflowRunRow = {
  id: string;
  workflow_ref: string;
  scope_key: string | null;
  workflow_entry_id: number | null;
  workflow_title: string;
  status: WorkflowRunStatus;
  params_json: string;
  current_step_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  agent_harness: string | null;
  agent_session_id: string | null;

  checkin_armed_at: string | null;

  plan_json: string | null;

  plan_hash: string | null;

  plan_ir_version?: number | null;

  engine_lease_until: string | null;
  engine_lease_holder: string | null;

  parent_run_id: string | null;








  parent_unit_id: string | null;

  invocation_key: string | null;














  outputs_json?: string | null;
};
⋮----
export type WorkflowRunStepRow = {
  run_id: string;
  step_id: string;
  step_title: string;
  instructions: string;
  completion_json: string | null;
  sequence_index: number;
  status: WorkflowRunStepStatus;
  notes: string | null;
  evidence_json: string | null;
  completed_at: string | null;
  summary: string | null;
};
⋮----
export type WorkflowRunUnitStatus = "pending" | "running" | "completed" | "failed" | "skipped";
⋮----
export type WorkflowRunUnitRow = {
  run_id: string;
  unit_id: string;
  step_id: string | null;
  node_id: string;
  parent_unit_id: string | null;
  phase: string | null;
  runner: string | null;

  engine?: string | null;
  model: string | null;
  status: WorkflowRunUnitStatus;
  input_hash: string | null;
  result_json: string | null;
  tokens: number | null;
  failure_reason: string | null;

  session_id: string | null;
  worktree_path: string | null;
  started_at: string | null;
  finished_at: string | null;

  last_checkin_at: string | null;




  attempts: number;

  claim_holder: string | null;

  claim_expires_at: string | null;
};
⋮----
export type WorkflowRunUnitAttemptPhaseV4 = "unit" | "gate";
export type WorkflowRunUnitAttemptStatusV4 = "running" | "completed" | "failed" | "skipped";
⋮----
export interface WorkflowRunUnitAttemptRowV4 {
  run_id: string;
  unit_id: string;
  attempt: number;
  dispatch_id: string;
  step_id: string;
  node_id: string;
  phase: WorkflowRunUnitAttemptPhaseV4;
  runner: string | null;
  engine: string | null;
  model: string | null;
  input_hash: string;
  status: WorkflowRunUnitAttemptStatusV4;
  result_json: string | null;
  tokens: number | null;
  failure_reason: string | null;
  session_id: string | null;
  worktree_path: string | null;
  started_at: string;
  finished_at: string | null;
  claim_holder: string;
  claim_expires_at: string;
}
⋮----
export interface ReserveUnitAttemptV4Input {
  runId: string;
  unitId: string;
  stepId: string;
  nodeId: string;
  parentUnitId?: string | null;
  phase: WorkflowRunUnitAttemptPhaseV4;
  runner: string | null;
  engine: string | null;
  model: string | null;
  inputHash: string;
  now: string;
}
⋮----
export interface FinishUnitAttemptV4Input {
  runId: string;
  unitId: string;
  attempt: number;
  dispatchId: string;
  status: Exclude<WorkflowRunUnitAttemptStatusV4, "running">;
  resultJson: string | null;
  tokens: number | null;
  failureReason: string | null;
  sessionId?: string | null;
  finishedAt: string;
}
⋮----
export interface WorkflowAttemptAccountingV4 {
  totalAttempts: number;
  totalTokens: number;
  dispatchAttempts: number;
  dispatchTokens: number;
  gateAttempts: number;
  gateTokens: number;
}
⋮----
export interface ReserveUnitAttemptV4Result {
  kind: "reserved" | "reclaimed";
  attempt: WorkflowRunUnitAttemptRowV4;
}
⋮----
function dispatchingProcess(): string
⋮----
export interface InsertRunInput {
  id: string;
  workflowRef: string;
  workflowTitle: string;
  paramsJson: string;
  currentStepId: string | null;
  createdAt: string;
  updatedAt: string;
  agentHarness: string | null;
  agentSessionId: string | null;
}
⋮----
export interface InsertStepInput {
  runId: string;
  stepId: string;
  stepTitle: string;
  instructions: string;
  completionJson: string | null;
  sequenceIndex: number;
}
⋮----
export interface PublishWorkflowRunV4Input {
  readonly run: InsertRunInput;
  readonly steps: InsertStepInput[];
  readonly planJson: string;
  readonly planHash: string;
}
⋮----
export interface PublishChildWorkflowRunInput {
  readonly parentRunId: string;

  readonly spawnedByUnitId: string;

  readonly invocationKey: string;
  readonly run: InsertRunInput;
  readonly steps: InsertStepInput[];

  readonly planJson: string;
  readonly planHash: string;
}
⋮----
export interface ListRunsFilter {
  workflowRef?: string;
  workflowRefs?: readonly string[];







  activeOnly?: boolean;







  includeChildren?: boolean;
}
⋮----
export class WorkflowRunsRepository
⋮----
constructor(private readonly db: Database)
⋮----
transaction<T>(fn: () => T): T
⋮----
immediateTransaction<T>(fn: (db: Database) => T): T
⋮----
getRunById(runId: string): WorkflowRunRow | undefined
⋮----
hasRun(runId: string): boolean
⋮----
resolveRunIdPrefix(prefix: string): string
⋮----
listRuns(filter: ListRunsFilter =
⋮----
getStepsForRun(runId: string): WorkflowRunStepRow[]
⋮----
getStep(runId: string, stepId: string): WorkflowRunStepRow | undefined
⋮----
insertRun(input: InsertRunInput): void
⋮----
insertSteps(steps: InsertStepInput[]): void
⋮----
reopenStepsForResume(runId: string, currentStepId: string): void
⋮----
markRunActive(runId: string, updatedAt: string): void
⋮----
updateStepCompletion(input: {
    status: WorkflowRunStepStatus;
    notes: string | null;
    evidenceJson: string | null;
    summary: string | null;
    completedAt: string;
    runId: string;
    stepId: string;
}): void
⋮----
updateRunState(input: {
    status: WorkflowRunStatus;
    currentStepId: string | null;
    updatedAt: string;
    completedAt: string | null;
    runId: string;
}): void
⋮----
markRunAbandoned(runId: string, updatedAt: string): boolean
⋮----
publishWorkflowRunV4(input: PublishWorkflowRunV4Input): void
⋮----
publishChildWorkflowRun(input: PublishChildWorkflowRunInput): WorkflowRunRow
⋮----
childRunsOf(parentRunId: string): WorkflowRunRow[]
⋮----
getRunByInvocationKey(parentRunId: string, key: string): WorkflowRunRow | undefined
⋮----
getUnitAttempts(runId: string, unitId: string): WorkflowRunUnitAttemptRowV4[]
⋮----
getAttemptAccounting(runId: string): WorkflowAttemptAccountingV4
⋮----
reserveUnitAttempt(input: ReserveUnitAttemptV4Input): ReserveUnitAttemptV4Result
⋮----
finishUnitAttempt(input: FinishUnitAttemptV4Input): boolean
⋮----
getUnitsForRun(runId: string): WorkflowRunUnitRow[]
⋮----
getUnitsForStep(runId: string, stepId: string): WorkflowRunUnitRow[]
⋮----
getUnit(runId: string, unitId: string): WorkflowRunUnitRow | undefined
⋮----
export function countWorkflowRunRefsForRename(
  db: Database,
  oldBundleId: string,
):
⋮----
export function renameWorkflowRunRefs(db: Database, oldBundleId: string, newBundleId: string): number
⋮----
export async function withWorkflowRunsRepo<T>(fn: (repo: WorkflowRunsRepository) => T | Promise<T>): Promise<T>
⋮----
export function withWorkflowRunsConnection<T>(fn: () => Promise<T>): Promise<T>
```

## File: src/storage/database.ts
```typescript
import { createRequire } from "node:module";
⋮----
export type SqlValue = string | number | bigint | boolean | null | Uint8Array;
⋮----
export interface RunResult {
  changes: number | bigint;
  lastInsertRowid: number | bigint;
}
⋮----
export interface Statement<Row = unknown> {
  get(...params: SqlValue[]): Row | null | undefined;
  all(...params: SqlValue[]): Row[];
  iterate(...params: SqlValue[]): IterableIterator<Row>;
  run(...params: SqlValue[]): RunResult;
}
⋮----
get(...params: SqlValue[]): Row | null | undefined;
all(...params: SqlValue[]): Row[];
iterate(...params: SqlValue[]): IterableIterator<Row>;
run(...params: SqlValue[]): RunResult;
⋮----
export interface Database {







  prepare<Row = any>(sql: string): Statement<Row>;

  exec(sql: string): void;

  run(sql: string, ...params: SqlValue[]): RunResult;




  transaction<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R;






  readonly inTransaction: boolean;





  loadExtension(path: string, entryPoint?: string): void;

  close(): void;
}
⋮----
prepare<Row = any>(sql: string): Statement<Row>;
⋮----
exec(sql: string): void;
⋮----
run(sql: string, ...params: SqlValue[]): RunResult;
⋮----
transaction<Args extends unknown[], R>(fn: (...args: Args)
⋮----
loadExtension(path: string, entryPoint?: string): void;
⋮----
close(): void;
⋮----
export interface OpenDatabaseOptions {

  readonly?: boolean;

  create?: boolean;
}
⋮----
export function openDatabase(path: string, opts?: OpenDatabaseOptions): Database
⋮----
export function openDatabaseFinalizing(path: string, opts?: OpenDatabaseOptions): Database
⋮----
function openBunDatabase(path: string, opts?: OpenDatabaseOptions): Database
⋮----
function bunOptions(opts: OpenDatabaseOptions):
⋮----
function loadBunSqlite(): typeof import("bun:sqlite")
⋮----
interface BetterSqlite3Ctor {
  new (path: string, options?: { readonly?: boolean; fileMustExist?: boolean }): BetterSqliteDatabase;
}
⋮----
interface BetterSqliteDatabase {
  prepare<Row = unknown>(sql: string): Statement<Row>;
  exec(sql: string): void;
  transaction<Args extends unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R;
  readonly inTransaction: boolean;
  loadExtension(path: string, entryPoint?: string): void;
  close(): void;
}
⋮----
prepare<Row = unknown>(sql: string): Statement<Row>;
⋮----
function missingBindingRemedy(): string
⋮----
function loadBetterSqlite3(): BetterSqlite3Ctor
⋮----
function openNodeDatabase(path: string, opts?: OpenDatabaseOptions): Database
⋮----
get inTransaction()
```

## File: src/storage/like-pattern.ts
```typescript
export function escapeLikePattern(text: string): string
```

## File: src/storage/locations.ts
```typescript
import {
  getCacheDir,
  getConfigDir,
  getDataDir,
  getDbPath,
  getDefaultStashDir,
  getLockfileLockPath,
  getLockfilePath,
} from "../core/paths";
import { getStateDbPath } from "../core/state-db";
⋮----
export interface StorageLocations {

  readonly indexDb: string;

  readonly stateDb: string;

  readonly lockfile: string;

  readonly lockfileSentinel: string;

  readonly dataDir: string;

  readonly cacheDir: string;

  readonly configDir: string;

  readonly stashDir: string;
}
⋮----
export function resolveStorageLocations(): StorageLocations
```

## File: src/storage/managed-db.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { type Database, openDatabase } from "./database";
import { applyStandardPragmas } from "./sqlite-pragmas";
⋮----
export interface ManagedDbSpec {

  path: string;

  pragmas?: Parameters<typeof applyStandardPragmas>[1];

  init?: (db: Database) => void;





  create?: boolean;
}
⋮----
export function openManagedDatabase(spec: ManagedDbSpec): Database
⋮----
export function withManagedDb<T>(open: () => Database, fn: (db: Database) => T, opts?:
```

## File: src/storage/sqlite-migrations.ts
```typescript
import type { Database } from "./database";
import { withImmediateTransaction } from "./sqlite-transaction";
⋮----
export interface Migration {
  id: string;
  up: string;
}
⋮----
export type MigrationLedgerStatus = "old" | "current" | "newer" | "inconsistent";
⋮----
export interface MigrationLedgerState {
  status: MigrationLedgerStatus;
  migrationIds: string[];
  detail?: string;
}
⋮----
export function assertMigrationRegistry(migrations: readonly Migration[]): void
⋮----
export function migrationLedgerExists(db: Database): boolean
⋮----
function inspectLedgerAgainst(db: Database, registryIds: readonly string[]): MigrationLedgerState
⋮----
export function inspectMigrationLedger(db: Database, migrations: readonly Migration[]): MigrationLedgerState
⋮----
export function assertMigrationLedger(db: Database, migrations: readonly Migration[]): MigrationLedgerState
⋮----
export function ensureMigrationsTable(db: Database): void
⋮----
export function pendingMigrations(db: Database, migrations: readonly Migration[]): readonly Migration[]
⋮----
export function runMigrations(db: Database, migrations: readonly Migration[]): string[]
```

## File: src/storage/sqlite-pragmas.ts
```typescript
import { warn } from "../core/warn";
import { statfsType } from "../runtime";
import type { Database } from "./database";
⋮----
export type JournalMode = "WAL" | "DELETE" | "TRUNCATE";
⋮----
export function resolveJournalMode(raw: string | undefined): JournalMode
⋮----
export function resolveConfiguredJournalMode(env: NodeJS.ProcessEnv = process.env): JournalMode
⋮----
function warnInvalidJournalModeOnce(raw: string): void
⋮----
export function isNetworkFilesystem(fsType: number | undefined): boolean
⋮----
export function applyReadonlyPragmas(db: Database): void
⋮----
export interface StandardPragmaOptions {





  foreignKeys?: boolean;





  dataDir?: string;





  fsTypeProbe?: (path: string) => number | undefined;





  env?: NodeJS.ProcessEnv;
}
⋮----
export function applyStandardPragmas(db: Database, opts: StandardPragmaOptions =
⋮----
function warnNetworkFallbackOnce(dataDir: string): void
```

## File: src/storage/sqlite-read-snapshot.ts
```typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sleepSync } from "../runtime";
import type { Database } from "./database";
import { openDatabaseFinalizing } from "./database";
⋮----
export class SqliteReadSnapshotUnavailableError extends Error
⋮----
constructor(message: string)
⋮----
function pathExists(filePath: string): boolean
⋮----
interface FileFingerprint {
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}
⋮----
interface DatabaseFingerprint {
  main: FileFingerprint;
  wal?: FileFingerprint;
}
⋮----
function fileFingerprint(filePath: string): FileFingerprint | undefined
⋮----
function databaseFingerprint(dbPath: string): DatabaseFingerprint
⋮----
function fingerprintsEqual(left: DatabaseFingerprint, right: DatabaseFingerprint): boolean
⋮----
const sameFile = (a: FileFingerprint | undefined, b: FileFingerprint | undefined): boolean
⋮----
function copyFileOutsideThisProcess(source: string, destination: string): void
⋮----
export function copySqliteSnapshot(dbPath: string, snapshotPath: string): void
⋮----
export function openSqliteReadSnapshot(dbPath: string): Database | undefined
⋮----
const cleanup = (bestEffort: boolean): void =>
const cleanupOnExit = (): void
```

## File: src/storage/sqlite-transaction.ts
```typescript
import { TransientError } from "../core/errors";
import { sleepSync } from "../runtime";
import type { Database } from "./database";
⋮----
export function isSqliteContentionError(err: unknown): boolean
⋮----
function throwBeginFailure(err: unknown): never
⋮----
export function beginImmediateTransaction(db: Database): void
⋮----
export function withImmediateTransaction<T>(db: Database, fn: () => T): T
```

## File: src/storage/state-db-integrity.ts
```typescript
import { appendEvent, type EventsContext } from "../core/events";
import { type Database, openDatabase } from "./database";
import { applyReadonlyPragmas } from "./sqlite-pragmas";
⋮----
export interface StateDbIntegrityResult {
  ok: boolean;

  lines: string[];

  error?: string;
}
⋮----
export interface StateDbFreelistInfo {
  freelistCount: number;
  pageCount: number;

  ratio: number;

  error?: string;
}
⋮----
export interface VacuumOutcome {
  ran: boolean;

  reason?: "below-threshold" | "busy" | "error";
  pagesBefore: number;

  pagesAfter?: number;

  error?: string;
}
⋮----
function firstColumn(row: Record<string, unknown> | undefined): unknown
⋮----
function openReadonlyStateDb(dbPath: string): Database
⋮----
export function runStateDbIntegrityCheck(dbPath: string): StateDbIntegrityResult
⋮----
export function readFreelistInfo(db: Database): StateDbFreelistInfo
⋮----
export function getStateDbFreelistInfo(dbPath: string): StateDbFreelistInfo
⋮----
export function vacuumIfReclaimable(
  db: Database,
  freelist: StateDbFreelistInfo,
  vacuum: { eventType: string; force?: boolean },
  eventsCtx?: EventsContext,
): VacuumOutcome
```
