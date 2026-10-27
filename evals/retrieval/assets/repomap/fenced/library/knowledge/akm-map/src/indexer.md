---
description: "Repo map of akm src/indexer at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  indexer/
    db/
      llm-cache.ts
    links/
      declared-links.ts
    lookup/
      adapter-concept-owner.ts
    passes/
      dir-staleness.ts
      memory-inference.ts
      metadata.ts
      pass-context.ts
    scan/
      doc-to-entry.ts
      drain-dir.ts
    search/
      db-search.ts
      fts-query.ts
      ranking.ts
      search-attribution.ts
      search-fields.ts
      search-hit-enrichers.ts
      search-source.ts
    usage/
      show-usage.ts
      usage-events.ts
    walk/
      file-context.ts
      index-context.ts
      matchers.ts
      path-resolver.ts
      walker.ts
    bundle-identity-guard.ts
    ensure-index.ts
    index-db-contention.ts
    index-rebuild-lock.ts
    index-writer-lock.ts
    index-written-assets.ts
    indexer.ts
    init.ts
    installations.ts
    materialize-embeddings.ts
    read-preflight.ts
```

# Files

## File: src/indexer/db/llm-cache.ts
```typescript
import { bestEffort } from "../../core/best-effort";
import type { Database } from "../../storage/database";
import {
  computeBodyHash,
  getLlmCacheEntry,
  upsertLlmCacheEntry,
} from "../../storage/repositories/index-llm-cache-repository";
⋮----
export interface WithLlmCacheHooks {
  onCacheHit?: () => void;
}
⋮----
export async function withLlmCache<T>(
  db: Database,
  cacheKey: string,
  body: string,
  reEnrich: boolean,
  llmFn: () => Promise<T | undefined>,
  validate: (raw: unknown) => T | undefined,
  precomputedHash: string | undefined,
  cacheVariant: string,
  hooks?: WithLlmCacheHooks,
): Promise<T | undefined>
```

## File: src/indexer/links/declared-links.ts
```typescript
import type { IndexDocument } from "../../core/adapter/types";
import { stashDirFor } from "../../core/asset/asset-placement";
import { isBundleSlug, parseBundleRef } from "../../core/asset/asset-ref";
⋮----
export type DeclaredLinkKind =
  | "xref"
  | "superseded_by"
  | "contradicted_by"
  | "belief_peer"
  | "derived_from"
  | "cites"
  | "links_to"
  | "uses";
⋮----
export interface DeclaredLink {
  kind: DeclaredLinkKind;

  raw: string;

  bundle?: string;
  conceptId: string;
}
⋮----
export interface DeclaredLinkOwner {
  bundleId: string;
  conceptId: string;
}
⋮----
export function declaredLinks(doc: IndexDocument, owner: DeclaredLinkOwner): DeclaredLink[]
⋮----
function stringValues(value: unknown): string[]
```

## File: src/indexer/lookup/adapter-concept-owner.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import type { AdapterReadCandidate, BundleAdapter } from "../../core/adapter/bundle-adapter";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { adapterForId } from "../../core/adapter/registry";
import type { BundleComponent } from "../../core/adapter/types";
import type { BundleRef } from "../../core/asset/asset-ref";
import { compareCodePoints, hasErrnoCode } from "../../core/common";
import { ConfigError, UsageError } from "../../core/errors";
import { canonicalizeWorkflowName } from "../../core/recognition-util";
import { sensitiveMarkerPath } from "../../core/sensitive-marker-path";
import { warnOnce } from "../../core/warn";
import {
  resolveUniqueWorkflowSource,
  type WorkflowSourceFile,
  workflowNameForConceptId,
} from "../../workflows/source-files";
import { deriveInstallations } from "../installations";
import type { SearchSource } from "../search/search-source";
import { buildFileContext, type FileContext } from "../walk/file-context";
⋮----
export interface AdapterConceptOwner {

  path: string;

  realPath: string;
  conceptId: string;
  adapterId: string;
  workflowSource?: WorkflowSourceFile;
}
⋮----
export abstract class AdapterConceptOwnershipError extends UsageError
⋮----
export class AdapterConceptCollisionError extends AdapterConceptOwnershipError
⋮----
constructor(adapterId: string, conceptId: string, paths: readonly string[])
⋮----
function normalizedConceptId(conceptId: string): string | undefined
⋮----
function componentFor(sourcePath: string, adapterId: string): BundleComponent
⋮----
function lexicallyWithin(candidate: string, root: string): boolean
⋮----
/** Add case-only suffix spellings beside an adapter-authored read candidate. */
function candidateSpellings(candidate: AdapterReadCandidate, sourcePath: string): AdapterReadCandidate[]
⋮----
function inspectCandidate(
  sourcePath: string,
  adapterId: string,
  candidate: AdapterReadCandidate,
): AdapterConceptOwner | undefined
⋮----
function claimsWithoutContent(adapter: BundleAdapter, component: BundleComponent, owner: AdapterConceptOwner): boolean
⋮----
const denyBytes = (): never =>
⋮----
export interface ResolveAdapterConceptOwnerOptions {
  mode?: "read" | "write";




  includeSensitive?: boolean;
}
⋮----
function isMarkedSensitive(owner: AdapterConceptOwner): boolean
⋮----
export function resolveAdapterConceptOwner(
  sourcePath: string,
  adapterId: string,
  conceptId: string,
  options?: ResolveAdapterConceptOwnerOptions,
): AdapterConceptOwner | undefined
⋮----
export interface ConceptOwnerMatch {
  owner: AdapterConceptOwner;
  /** The source that owns the file. */
  source: SearchSource;
  /** The owning bundle's id, derived over the whole ordered source list. */
  bundleId: string;
  adapterId: string;
}
⋮----
/** The source that owns the file. */
⋮----
/** The owning bundle's id, derived over the whole ordered source list. */
⋮----
/**
 * The one "where is asset X right now?" walk. `sources` is the ordered source
 * list (`resolveSourceEntries`: default bundle first, then installation
 * priority). The first source with a physical owner for the ref ends the
 * walk; a qualified ref only considers its own bundle. Synchronous and
 * index-free: it never opens a database, so a caller may use it at dispatch.
 */
export function resolveConceptOwner(
  ref: BundleRef,
  sources: readonly SearchSource[],
  options?: ResolveAdapterConceptOwnerOptions,
): ConceptOwnerMatch | undefined
⋮----
export function indexedPathMatchesOwner(indexedPath: string, owner: AdapterConceptOwner): boolean
```

## File: src/indexer/passes/dir-staleness.ts
```typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { compareCodePoints } from "../../core/common";
import type { Database } from "../../storage/database";
import { getEntriesByDir } from "../../storage/repositories/index-entries-repository";
import type { DbIndexedEntry } from "../../storage/repositories/index-entry-types";
import { getIndexDirState } from "../../storage/repositories/index-meta-repository";
import type { StashFile } from "./metadata";
⋮----
export type DirStaleReason = {
  kind:
    | "unchanged"
    | "unchanged-precheck"
    | "index-context-changed"
    | "no-previous-rows"
    | "cached-zero-row-state"
    | "mtime-changed"
    | "file-set-changed"
    | "missing-file";
  detail?: string;
};
⋮----
export interface DirIndexState {
  stale: boolean;
  reason: DirStaleReason;
  persistedRowCount: number;
}
⋮----
export interface DirFingerprint {





  fileSetHash: string;

  fileMtimeMaxMs: number;
}
⋮----
export function getDirIndexState(
  db: Database,
  dirPath: string,
  files: string[],
  builtAtMs: number,
  indexVariant = "",
  fingerprint: DirFingerprint = computeDirFingerprint(dirPath, files, indexVariant),
): DirIndexState
⋮----
export function getCachedDirState(
  db: Database,
  dirPath: string,
  files: string[],
  builtAtMs: number,
  priorDirsChanged: boolean,
  indexVariant: string,
  fingerprint: DirFingerprint,
): DirIndexState | undefined
⋮----
export function canUseIncrementalSkip(state: DirIndexState, priorDirsChanged: boolean): boolean
⋮----
export function computeDirFingerprint(_dirPath: string, files: string[], indexVariant = ""): DirFingerprint
⋮----
// One `statSync` per file — the same call this function has always made — but
// every field it returns that can witness a change is kept, per file, instead
// of being collapsed into a single max.
//
// `Math.max` over mtimes discarded everything except the newest file, so an
// edit to any other file landed below the max and was invisible; and mtime
// alone is writable by ordinary tooling (`touch -r`, `rsync --times`,
// `cp -p`, archive extraction), so a restored timestamp hid an edit outright.
// Size catches any length-changing edit; ctime catches the rest, because
// utimes(2) cannot hold the inode's change time back.
//
// This is still a heuristic: ctime also moves on metadata-only changes
// (chmod/chown) and after copying a tree, which costs an unnecessary rescan.
// That direction is safe — extra work, never stale content.
⋮----
// `bigint: true` is the same syscall but reports nanoseconds. Millisecond
// floats would let an edit made inside the same millisecond as the last
// run's stat land on an identical digest.
⋮----
// Unreadable or vanished: record it as such so the digest differs from
// any run where the file could be read, forcing a rescan.
⋮----
function getDirStaleReason(
  _dirPath: string,
  currentFiles: string[],
  previousEntries: DbIndexedEntry[],
  builtAtMs: number,
):
  | {
      kind: "mtime-changed" | "file-set-changed" | "missing-file";
      detail?: string;
    }
  | undefined {
  const prevFileNames = new Set(
    previousEntries
.map((ie) =>
⋮----
export function inferZeroRowReason(
  stash: StashFile | null,
  priorReason: { kind: string; detail?: string } | undefined,
  warnings: string[],
  dirPath: string,
  dedupedRows: number,
): string
```

## File: src/indexer/passes/memory-inference.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { assembleAsset, serializeFrontmatter } from "../../core/asset/asset-serialize";
import {
  parseFrontmatter,
  parseFrontmatterBlock,
  readFrontmatterDate,
  replaceFrontmatterBlocks,
} from "../../core/asset/frontmatter";
import { conceptIdFromTypeName, parseRefInput } from "../../core/asset/resolve-ref";
import { bestEffort } from "../../core/best-effort";
import { asNonEmptyString, existingFileMode, writeFileAtomic } from "../../core/common";
import { concurrentMap } from "../../core/concurrent";
import type { SourceConfigEntry } from "../../core/config/config";
import { ConfigError } from "../../core/errors";
import { warn } from "../../core/warn";
import { beginWriteProvenance, recordWrittenPath, type WriteProvenanceJournal } from "../../core/write-provenance";
import { type WriteTargetSource, writeAssetToSource } from "../../core/write-source";
import { type NoticeSink, noticeSet } from "../../execution/notices";
import type { LoweringNotice } from "../../execution/resolved-request";
import type { RunnerSpec } from "../../integrations/agent/runner";
import { type ResolvedIndexPassExecution, resolveIndexPassExecution } from "../../llm/index-passes";
import type { DerivedMemoryDraft, MemoryInferNoChange, MemoryInferTelemetry } from "../../llm/memory-infer";
⋮----
import { computeBodyHash, getLlmCacheEntry } from "../../storage/repositories/index-llm-cache-repository";
import { pkgVersion } from "../../version";
import { withLlmCache } from "../db/llm-cache";
import { walkMarkdownFiles } from "../walk/walker";
import {
  applyProvenanceFrontmatter,
  type IndexDocument,
  SCOPE_KEYS,
  type StashEntryScope,
  sameScope,
  scopeFromFrontmatter,
} from "./metadata";
import type { PassContext } from "./pass-context";
⋮----
export interface MemoryInferenceResult {

  considered: number;





  cacheHits: number;





  retryAttempts: number;

  splitParents: number;

  writtenFacts: number;








  noChange: number;

  skippedNoFacts: number;












  skippedChildExists: number;





  skippedAborted: number;






  unaccounted: number;






  htmlErrorCount: number;






  scopeSynced: number;

  notices?: readonly Readonly<LoweringNotice>[];










  writtenPaths: string[];
}
⋮----
export interface MemoryInferencePassOptions {
  candidateRefs?: ReadonlySet<string>;
  compressMemoryToDerivedMemory?: typeof memoryInfer.compressMemoryToDerivedMemory;
}
⋮----
export interface MemoryInferenceProgress {
  processed: number;
  total: number;
  writtenFacts: number;
  noChange: number;
  skippedNoFacts: number;
  currentRef?: string;
}
⋮----
export interface MemoryInferencePassContext extends PassContext {

  reEnrich?: boolean;
  onProgress?: (event: MemoryInferenceProgress) => void;
  options?: MemoryInferencePassOptions;

  llmRunner?: RunnerSpec | null;
}
⋮----
interface MemoryRecord {

  filePath: string;

  stashRoot: string;

  ref: string;

  data: Record<string, unknown>;

  effectiveInput: string;
  name: string;
}
⋮----
type MemoryInferencePlan =
  | { kind: "aborted"; record: MemoryRecord }
  | { kind: "existing-child"; record: MemoryRecord }
  | { kind: "cache-hit"; record: MemoryRecord; decision: MemoryInferDecision }
  | { kind: "model"; record: MemoryRecord };
⋮----
type MemoryInferDecision = DerivedMemoryDraft | MemoryInferNoChange;
⋮----
function validateDerivedMemoryDraft(raw: unknown): DerivedMemoryDraft | undefined
⋮----
function validateMemoryInferDecision(raw: unknown): MemoryInferDecision | undefined
⋮----
function readCachedMemoryDecision(
  db: NonNullable<MemoryInferencePassContext["db"]>,
  record: MemoryRecord,
): MemoryInferDecision | undefined
⋮----
function planPendingMemoryRecord(
  record: MemoryRecord,
  ctx: Pick<MemoryInferencePassContext, "signal" | "db" | "reEnrich">,
): MemoryInferencePlan
⋮----
function memoryExecutionForContext(
  ctx: MemoryInferencePassContext,
  config: MemoryInferencePassContext["config"],
): ResolvedIndexPassExecution
⋮----
async function inferPendingMemoryRecord(
  plan: MemoryInferencePlan,
  ctx: {
    signal?: AbortSignal;
    db?: MemoryInferencePassContext["db"];
    reEnrich?: boolean;
    llmRunner: RunnerSpec;
    inferTelemetry: MemoryInferTelemetry;
    compressMemoryToDerivedMemory: typeof memoryInfer.compressMemoryToDerivedMemory;
    onNotices: NoticeSink;
onConfigFailure: (error: ConfigError)
⋮----
const onRetryAttempt = () =>
const infer = ()
⋮----
export async function runMemoryInferencePass(ctx: MemoryInferencePassContext): Promise<MemoryInferenceResult>
⋮----
async function runMemoryInferencePassBody(
  ctx: MemoryInferencePassContext,
  provenance: WriteProvenanceJournal,
): Promise<MemoryInferenceResult>
⋮----
const completeResult = (): MemoryInferenceResult =>
⋮----
const inCandidates = (ref: string)
⋮----
export function countPendingMemoriesNeedingDecision(
  stashRoot: string,
  db?: NonNullable<MemoryInferencePassContext["db"]>,
): number
⋮----
export function collectPendingMemories(stashRoot: string): MemoryRecord[]
⋮----
interface ScopeDrift {
  childPath: string;

  parentRef: string;

  parentName: string;

  scope: StashEntryScope;
}
⋮----
function scanMemories(stashRoot: string):
⋮----
function isDerivedChildOf(fm: Record<string, unknown>, parentName: string): boolean
⋮----
function stringList(raw: unknown): string[]
⋮----
function memoryInferenceInput(body: string, fm: Record<string, unknown>): string
⋮----
export function isPendingMemory(frontmatter: Record<string, unknown>, filePath?: string): boolean
⋮----
function toMemoryName(memoriesDir: string, filePath: string): string | undefined
⋮----
// ── Writing derived memories + marking parent ───────────────────────────────
⋮----
/**
 * Result of attempting to write a derived child for a parent memory.
 *
 * The two `written === 0` shapes are deliberately distinct so callers can mark
 * the parent processed only when the child already exists (inference complete)
 * and NOT when the write failed (transient — retry next run). See #550.
 */
interface WriteDerivedOutcome {
  /** 1 when a new derived file was written, 0 otherwise. */
  written: number;
  /** True when `<parent>.derived.md` already existed on disk (write skipped). */
  childExists: boolean;
}
⋮----
/** 1 when a new derived file was written, 0 otherwise. */
⋮----
/** True when `<parent>.derived.md` already existed on disk (write skipped). */
⋮----
/**
 * Absolute path of the derived child for a parent memory. Single source of
 * truth for the `<parent>.derived.md` naming convention — used both by the
 * pre-LLM existence check (#588) and the write path.
 */
function derivedChildPath(parent: MemoryRecord): string
⋮----
async function writeDerivedMemory(parent: MemoryRecord, derived: DerivedMemoryDraft): Promise<WriteDerivedOutcome>
⋮----
function renderDerivedMemory(parent: MemoryRecord, derived: DerivedMemoryDraft): string
⋮----
function markParentProcessed(parent: MemoryRecord): void
⋮----
function syncDerivedChildScopes(drifts: readonly ScopeDrift[]): number
```

## File: src/indexer/passes/metadata.ts
```typescript
import fs from "node:fs";
import path from "node:path";
⋮----
import type { AssetParameter, IndexDocument, ScopeKey, StashEntryScope, StashIntent } from "../../core/adapter/types";
import { parseBundleRef } from "../../core/asset/asset-ref";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import type { TocHeading } from "../../core/asset/markdown";
import { asNonEmptyString } from "../../core/common";
import { isVerbose, warn } from "../../core/warn";
import type { buildFileContext } from "../walk/file-context";
⋮----
export interface StashFile {
  entries: IndexDocument[];
  warnings?: string[];
}
⋮----
export function normalizeQuality(raw: string): string
⋮----
export function _resetUnknownQualityWarnings(): void
⋮----
export function isProposedQuality(quality: string | undefined): boolean
⋮----
export function validateStashEntry(entry: unknown): IndexDocument | null
⋮----
function normalizeScopeObject(raw: Record<string, unknown>): StashEntryScope | undefined
⋮----
export function applyScopeFrontmatter(entry: IndexDocument, fmData: Record<string, unknown>): void
⋮----
export function scopeFromFrontmatter(fm: Record<string, unknown>): StashEntryScope
⋮----
export function sameScope(a: StashEntryScope, b: StashEntryScope): boolean
⋮----
function normalizeIntent(value: unknown): StashIntent | undefined
⋮----
function normalizeMemoryBackref(value: string | undefined): string | undefined
⋮----
function derivedFromConceptId(source: string | undefined, derivedFrom: string | undefined): string | undefined
⋮----
export function applyCuratedFrontmatter(entry: IndexDocument, fmData: Record<string, unknown>): void
⋮----
function normalizeNonEmptyStringList(value: unknown): string[] | undefined
⋮----
export function extractCommandParameters(template: string): AssetParameter[] | undefined
⋮----
export function applyWikiFrontmatter(entry: IndexDocument, fmData: Record<string, unknown>): void
⋮----
function isWikiRole(value: unknown): value is NonNullable<IndexDocument["wikiRole"]>
⋮----
function parseVerifiedFamily(value: unknown):
⋮----
export function applyProvenanceFrontmatter(entry: IndexDocument, fmData: Record<string, unknown>): void
⋮----
export function extractScriptParameters(filePath: string, content?: string): AssetParameter[] | undefined
⋮----
function mergeParameters(
  existing: AssetParameter[] | undefined,
  additional: AssetParameter[] | undefined,
): AssetParameter[] | undefined
⋮----
export interface CommentMetadata {
  description?: string;
  tags?: string[];
  aliases?: string[];
  searchHints?: string[];
  usage?: string[];
  examples?: string[];
  intent?: StashIntent;
  run?: string;
  setup?: string;
  cwd?: string;
  scope?: StashEntryScope;
}
⋮----
function splitCommentList(raw: string): string[]
⋮----
function parseCommentScope(raw: string): StashEntryScope | undefined
⋮----
function parseIntentCommentLine(cleaned: string, metadata: CommentMetadata): boolean
⋮----
export function extractCommentMetadata(filePath: string, content?: string): CommentMetadata | undefined
⋮----
export function applyCommentMetadata(entry: IndexDocument, metadata: CommentMetadata | undefined): void
⋮----
const use = <K extends keyof IndexDocument>(key: K, value: IndexDocument[K]): void =>
⋮----
function mergeAliases(existing: string[] | undefined, generated: string[]): string[] | undefined
⋮----
// ── Native Markdown search projection ──────────────────────────────────────
⋮----
/**
 * Maximum native Markdown prose carried by the low-weight `content` field.
 *
 * Raised far past any real authored document:
 * this used to sit at 16_384 chars, tight enough that ordinary long-form
 * skills/knowledge docs lost their tail from both FTS and the embedding
 * input with no visible signal (the cut was reported via `warnVerbose`,
 * silent unless `AKM_VERBOSE` was set). The remaining bound exists only to
 * stop a truly pathological single file (a committed data dump, a decompressed
 * log) from ballooning index size — not to shave real content — so a caller
 * that hits it is always told, unconditionally.
 */
⋮----
/**
 * Locate a leading nested frontmatter block in a body: up to three blank
 * lines, then a `---` line, closed by a later `---` line. Mirrors the
 * base-linter's `parseInnerFrontmatterBlock` recognition — when `akm
 * remember` wraps a session-capture hook's file in its own frontmatter, the
 * hook's `---\nakm_memory_kind: …\n---` block survives at the top of the
 * body. Returns the open/close line indexes, or `null` when no block opens.
 * Location only — callers apply their own interior checks (marker scan in
 * {@link hasSessionMemoryMarker}, shape test in {@link isFrontmatterShaped}).
 */
function findInnerFrontmatterBlock(lines: string[]):
⋮----
/**
 * True when the document carries the session-capture `akm_memory_kind`
 * marker — in the outer frontmatter data OR in a nested inner block at the
 * top of the body (both producer layouts exist; see base-linter's
 * `extractFrontmatterRefs`). Session bodies are raw transcripts, never a
 * searchable content projection.
 */
function hasSessionMemoryMarker(fmData: Record<string, unknown>, body: string): boolean
⋮----
function isFrontmatterShaped(lines: string[], block:
⋮----
if (/^\s/.test(line)) continue; // indented continuation / nested value
if (/^[A-Za-z0-9_.-]+:(\s|$)/.test(line)) continue; // top-level key
⋮----
function truncateUnicodeSafe(text: string, maxChars: number): string
⋮----
type MarkdownFence = { marker: "`" | "~"; length: number };
⋮----
function parseMarkdownFenceOpening(line: string): MarkdownFence | undefined
⋮----
function isMarkdownFenceClosing(line: string, fence: MarkdownFence): boolean
⋮----
function stripMarkdownHtmlComments(line: string, state:
⋮----
function findBalancedMarkdownClose(text: string, openAt: number, open: string, close: string): number | undefined
⋮----
/**
 * Find the closing parenthesis of an inline link destination. Parentheses in
 * angle-delimited destinations and quoted titles are data, while unquoted
 * parentheses remain balanced. Backslash escapes suppress delimiter meaning.
 */
function findMarkdownDestinationClose(text: string, openAt: number): number | undefined
⋮----
function stripMarkdownLinkDestinations(text: string, nesting = 0): string
⋮----
// Labels may themselves contain images/links. Recursively project them so
// an inner destination cannot become visible when its outer link is
// removed. At an adversarial nesting depth, omit the label rather than
// leaking its unparsed bytes into the search projection.
⋮----
/**
 * Derive the one low-weight search projection for an AKM-native Markdown body.
 * Frontmatter is removed by the caller. This projection drops comments,
 * fenced code, raw link targets, and structural punctuation while retaining
 * prose, headings, link labels, and inline identifiers. It never receives
 * secret/env/session bytes; that policy is enforced at the adapter metadata
 * boundary below.
 */
export function projectMarkdownContent(body: string, truncationInfo?:
⋮----
// Preserve human-facing labels and inline identifiers, never destinations.
⋮----
/**
 * Visit each line from `start` that lies outside fenced code, with HTML
 * comments removed (`visible`); fence lines themselves are never visited.
 */
function forEachVisibleMarkdownLine(
  lines: string[],
  start: number,
  visit: (index: number, visible: string) => void,
): void
⋮----
// A leading fence owns the whole line, including any info string that
// resembles HTML. Comment state therefore cannot begin inside a fence.
⋮----
// Fragment text is intentionally not an IndexDocument field. IndexDocument is
// an adapter/search payload boundary; this is an internal, derived index input
// that is persisted separately by the entries repository for deterministic FTS
// rebuilds. The WeakMap follows the already-read document through recognition
// without making safe body bytes observable through public payloads.
⋮----
export function setMarkdownFragmentContent(entry: IndexDocument, content: string | undefined): void
⋮----
export function getMarkdownFragmentContent(entry: IndexDocument): string | undefined
⋮----
export function hasMarkdownFragmentContent(entry: IndexDocument): boolean
⋮----
/**
 * A copy of `entry` carrying `filePath`'s size (and its fragment projection),
 * or `entry` itself when the file cannot be stat'ed.
 */
export function withFileSize(entry: IndexDocument, filePath: string): IndexDocument
⋮----
/**
 * Produce a safe, structure-preserving projection for fragment indexing.
 * Excluded source lines are retained as blank lines so fragment locations map
 * exactly to authored line numbers. This must be called from both indexing and
 * `show`; it deliberately never performs a storage-layer file reread.
 */
export function projectMarkdownFragmentContent(raw: string): string | undefined
⋮----
// Reference link destinations and standalone HTML are not retrieval
// evidence and can contain credential-bearing URLs.
⋮----
export function applyPreContributorFields(
  entry: IndexDocument,
  file: string,
  ctx: Pick<ReturnType<typeof buildFileContext>, "content">,
  pkgMeta: ReturnType<typeof extractPackageMetadata> | undefined,
): void
⋮----
export function applyPostContributorFields(
  entry: IndexDocument,
  file: string,
  canonicalName: string,
  dirPath: string,
): void
⋮----
export function buildMetadataSkipWarning(filePath: string, assetType: string, error: unknown): string
⋮----
export function isWorkflowSkipWarning(warning: string): boolean
⋮----
function normalizeTerms(values: string[]): string[]
⋮----
function buildAliases(name: string, tags: string[]): string[]
⋮----
export function extractDescriptionFromComments(filePath: string): string | null
⋮----
// Try hash comments at start of file (skip shebang)
⋮----
export function extractPackageMetadata(
  dirPath: string,
):
⋮----
export function fileNameToDescription(fileName: string): string
⋮----
export function extractTagsFromPath(filePath: string, rootDir: string): string[]
⋮----
/**
 * Extract scope/domain tags from the DIRECTORY segments of a canonical asset
 * name (the ref subpath — e.g. `"projectA/auth-tip"` → `["projecta"]`).
 *
 * Unlike {@link extractTagsFromPath} this never tokenizes the filename
 * segment: it exists so a nested asset's directory (scope/domain) tokens can
 * be merged into explicit author tags without dragging every filename word
 * into exact-tag matching (SPEC-2, docs/architecture/specs/stash-conventions-code-spec.md).
 * Tokenization mirrors `extractTagsFromPath`: each segment splits on `-`/`_`/
 * `.`, lowercased, single-character tokens dropped. A name with no directory
 * segments yields no tags.
 */
export function extractDirTagsFromName(name: string): string[]
```

## File: src/indexer/passes/pass-context.ts
```typescript
import type { AkmConfig } from "../../core/config/config";
import type { Database } from "../../storage/database";
import type { SearchSource } from "../search/search-source";
⋮----
export interface PassContext {
  config: AkmConfig;
  sources: SearchSource[];
  signal?: AbortSignal;
  db?: Database;
}
```

## File: src/indexer/scan/doc-to-entry.ts
```typescript
import path from "node:path";
import type { IndexDocument } from "../../core/adapter/types";
import {
  getMarkdownFragmentContent,
  hasMarkdownFragmentContent,
  type StashIntent,
  setMarkdownFragmentContent,
} from "../passes/metadata";
⋮----
export function indexDocumentToStashEntry(doc: IndexDocument): IndexDocument
⋮----
// ── First-class IndexDocument members ──
⋮----
type StringListKey =
  | "examples"
  | "usage"
  | "xrefs"
  | "supersededBy"
  | "contradictedBy"
  | "sources"
  | "evidenceSources"
  | "uses";
⋮----
type StringKey = "evidence" | "pageKind" | "whenToUse" | "category" | "run" | "setup" | "cwd";
⋮----
function assignStringList(entry: IndexDocument, key: StringListKey, value: unknown): void
⋮----
function assignString(entry: IndexDocument, key: StringKey, value: unknown): void
⋮----
function isIntent(value: unknown): value is StashIntent
```

## File: src/indexer/scan/drain-dir.ts
```typescript
import path from "node:path";
import { akmAdapter } from "../../core/adapter/adapters/akm-adapter";
import type { BundleAdapter } from "../../core/adapter/bundle-adapter";
import type { BundleComponent, IndexDocument } from "../../core/adapter/types";
import { compareCodePoints } from "../../core/common";
import { canonicalizeWorkflowName } from "../../core/recognition-util";
import { compileWorkflowSource } from "../../workflows/compile";
import { resolveWorkflowSourceDomains, workflowNameForSourcePath } from "../../workflows/source-files";
import { buildMetadataSkipWarning, type StashFile } from "../passes/metadata";
import { buildFileContext, type FileContext } from "../walk/file-context";
import { indexDocumentToStashEntry } from "./doc-to-entry";
⋮----
export interface DrainedDir {

  entries: IndexDocument[];

  warnings: string[];

  hashByFile: Map<string, string>;






  conceptIdByFile: Map<string, string>;

  rejectedPaths: Set<string>;

  rejectedConceptIds: Set<string>;
}
⋮----
export function drainDirDocuments(
  adapter: BundleAdapter,
  component: BundleComponent,
  fileContexts: readonly FileContext[],
): DrainedDir
⋮----
export function recognizeStashEntries(stashRoot: string, files: string[]): StashFile
⋮----
function handleWorkflowDoc(doc: IndexDocument, file: FileContext): string | null
⋮----
function docRenderer(doc: IndexDocument): string | undefined
⋮----
function workflowDropWarning(file: FileContext, errors: ReadonlyArray<
```

## File: src/indexer/search/db-search.ts
```typescript
import path from "node:path";
import { displayRef } from "../../core/asset/resolve-ref";
import { compareCodePoints } from "../../core/common";
import type { AkmConfig } from "../../core/config/config";
import { classifyPathAccess } from "../../core/path-access";
import { getDbPath } from "../../core/paths";
import { withStateDbTelemetry } from "../../core/state-db";
import { systemErrorCode } from "../../core/system-error";
import { presentationFor } from "../../core/type-presentation";
import { embed } from "../../llm/embedder";
import { effectiveEmbedding } from "../../llm/embedders/connection";
import { applyEmbeddingTemplate, resolveEmbeddingProfile } from "../../llm/embedders/profile";
import { normalizeEmbeddingEndpoint } from "../../llm/embedders/remote";
import type {
  AkmSearchType,
  BeliefFilterMode,
  SearchExecutionMode,
  SearchHitSize,
  SourceSearchHit,
} from "../../sources/types";
import type { Database } from "../../storage/database";
import {
  assertIndexPathReadable,
  closeDatabase,
  openExistingDatabase,
  openReadonlyExistingDatabase,
} from "../../storage/repositories/index-connection";
import {
  getAllEntries,
  getBaseBeliefStatesForDerivedTwins,
  getEntriesByIds,
  getEntryById,
  getEntryCount,
  getEntryRefsAndTypes,
} from "../../storage/repositories/index-entries-repository";
import type { CandidateFilter, DbVecResult } from "../../storage/repositories/index-entry-types";
import { searchFts } from "../../storage/repositories/index-fts-repository";
import { getMeta } from "../../storage/repositories/index-meta-repository";
import { getEmbeddingCount, searchVec } from "../../storage/repositories/index-vec-repository";
import { ensureIndex } from "../ensure-index";
import { type IndexDocument, isProposedQuality, type StashEntryScope } from "../passes/metadata";
import { countFeedbackSignalsByRef } from "../usage/usage-events";
import { ftsQueryTokens, parseRefPrefixQuery } from "./fts-query";
import {
  applyFeedback,
  type FeedbackCounts,
  type FusedCandidate,
  type RankedRef,
  reciprocalRankFusion,
} from "./ranking";
import { attachSearchHitAttribution } from "./search-attribution";
import { enrichSearchHit, type SearchHitContext } from "./search-hit-enrichers";
import { buildEditHint, findSourceForPath, isEditable, type SearchSource } from "./search-source";
⋮----
type IndexedProvenance = { itemRef: string; bundleId: string; conceptId: string };
⋮----
export function searchHitContent(hit: SourceSearchHit): string | undefined
⋮----
function hasIndexedProvenance<
  T extends { itemRef?: string | null; bundleId?: string | null; conceptId?: string | null },
>(entry: T): entry is T & IndexedProvenance
⋮----
function buildStaleIndexHint(db: Database): string | undefined
⋮----
export function buildLocalAction(type: string, ref: string): string
⋮----
function resolveSearchHitRef(entry: IndexDocument, provenance: IndexedProvenance, defaultBundleId?: string): string
⋮----
function hasConfiguredEmbeddingProvider(config: {
  embedding?: { endpoint?: string; model?: string; localModel?: string };
}): boolean
⋮----
export interface SearchLocalInput {
  query: string;
  searchType: AkmSearchType;
  limit: number;
  stashDir: string;
  sources: SearchSource[];
  config: AkmConfig;





  filters?: StashEntryScope;




  includeProposed?: boolean;
  beliefFilter?: BeliefFilterMode;







  restrictToSources?: boolean;





  includeExcludedTypes?: boolean;




  readOnly?: boolean;
}
⋮----
export async function searchLocal(input: SearchLocalInput): Promise<
⋮----
async function searchDatabase(
  db: Database,
  input: SearchLocalInput,
): Promise<
⋮----
const filterCandidates: CandidateFilter = (ids) =>
⋮----
function readFeedback(fused: readonly FusedCandidate[]):
⋮----
type HydratedEntry = NonNullable<ReturnType<typeof getEntryById>> & { id: number };
⋮----
function selectFusedEntries(
  db: Database,
  fused: FusedCandidate[],
  limit: number,
  filterOptions: EntryFilterOptions,
): Array<
⋮----
function keepAllowedTypes(
  db: Database,
  neighbors: readonly DbVecResult[],
  typeFilter: string | undefined,
  excludeTypes: readonly string[],
): RankedRef[]
⋮----
function describeRanks(candidate: FusedCandidate): string[]
⋮----
async function enumerateEntries(
  opts: EntryFilterOptions & {

    typeFilter?: string;

    excludeTypes: string[];






    conceptIdPrefix?: string;




    bundle?: string;
    limit: number;
    stashDir: string;
    config: AkmConfig;
  },
): Promise<SourceSearchHit[]>
⋮----
// Deduplicate by file path — multiple entries can share the same file.
// Filtering happens BEFORE the limit slice so a restrictive filter still
// returns up to `limit` results.
⋮----
interface EntryFilterOptions {
  db: Database;
  sources: SearchSource[];
  restrictToSources: boolean;
  filters?: StashEntryScope;
  includeProposed: boolean;
  beliefFilter: BeliefFilterMode;
}
⋮----
/**
 * Filter chain shared by the scored and browse paths, in this order:
 * source-narrowing → scope → proposed-quality → derived-twin belief
 * inheritance → belief filter.
 */
export function applyEntryFilters<T extends { id: number; entry: IndexDocument; filePath: string }>(
  items: T[],
  opts: EntryFilterOptions,
): T[]
⋮----
// Source filter: when the caller narrowed `sources` via `--from <name>`,
// drop entries whose filePath does not live under any requested source. The
// index spans every configured source, so without this filter a narrowed
// --from request would still leak results from other sources.
⋮----
// Scope filter: drop entries whose stored scope does not satisfy every
// supplied key.
⋮----
// Proposed-quality filter: exclude `quality: "proposed"`
// entries unless the caller opts in.
⋮----
// 03-R3: derived twins inherit their base's demoting belief state BEFORE the
// belief filter, so the filter (and the reported hit state) stays consistent
// across both paths.
⋮----
/**
 * 03-R3: let each `.derived` twin inherit its base memory's demoting belief
 * state, so `--belief` treats a stale flag-free twin like its corrected base.
 * The base carries the flag; its near-duplicate `.derived` twin carries none.
 * Done in-memory at search time — NOT by writing the twin's frontmatter —
 * because the SCC belief resolver refreshes any non-frozen state written to a
 * derived memory back to `active` on the next improve run, erasing it. Only
 * twins with no state of their own inherit; an explicit twin state always wins.
 */
function inheritDerivedTwinBeliefStates(db: Database, items: Array<
⋮----
export function matchBeliefFilter(beliefState: string | undefined, filter: BeliefFilterMode): boolean
⋮----
function startVectorChannel(
  db: Database,
  query: string,
  config: AkmConfig,
  filterCandidates: CandidateFilter,
): Promise<
⋮----
function buildVectorFallbackWarning(config: AkmConfig, error: unknown): string
⋮----
function safeEmbeddingEndpoint(config: AkmConfig): string | undefined
⋮----
/** Map untrusted runtime failures onto a small, non-secret diagnostic set. */
function classifyVectorFailure(error: unknown): string
⋮----
export async function buildDbHit(input: {
  entry: IndexDocument;
  path: string;
  itemRef: string;
  bundleId: string;
  conceptId: string;
  score: number;
  whyMatched?: string[];
  defaultStashDir: string;
  sources: SearchSource[];
  config?: AkmConfig;






  db?: Database;
  eligible?: SearchHitContext["eligible"];
}): Promise<SourceSearchHit>
⋮----
export function deriveSize(bytes?: number): SearchHitSize | undefined
⋮----
function deduplicateByPath<T extends
⋮----
function entryMatchesScope(scope: StashEntryScope | undefined, filters: StashEntryScope): boolean
```

## File: src/indexer/search/fts-query.ts
```typescript
export function ftsQueryTokens(query: string): string[]
⋮----
export function ftsOrMatch(tokens: readonly string[]): string
⋮----
export function parseRefPrefixQuery(query: string):
```

## File: src/indexer/search/ranking.ts
```typescript
import { compareCodePoints } from "../../core/common";
⋮----
export interface RankedRef {
  id: number;
  itemRef: string;
}
⋮----
export interface FusedCandidate extends RankedRef {

  score: number;

  ranks: Array<number | undefined>;
}
⋮----
export function reciprocalRankFusion(channels: ReadonlyArray<readonly RankedRef[]>): FusedCandidate[]
⋮----
export interface FeedbackCounts {
  pos: number;
  neg: number;
}
⋮----
export function feedbackFactor(
⋮----
export function applyFeedback(
  fused: readonly FusedCandidate[],
  feedback: ReadonlyMap<string, FeedbackCounts>,
): FusedCandidate[]
```

## File: src/indexer/search/search-attribution.ts
```typescript
export interface SearchHitAttribution {
  memoryInference?: {
    exposure: "direct" | "surface";
    childRef?: string;
    surfaceFields?: Array<"description" | "tags">;
    surfaceDescription?: string;
  };
}
⋮----
export interface UsageEventAttribution {
  memoryInference?: {
    exposure: "direct" | "surface";
    childRef: string;
  };
}
⋮----
type AttributionHost = { [ATTRIBUTION]?: SearchHitAttribution };
⋮----
export type AttributionProjection = "brief" | "normal" | "full" | "agent";
⋮----
export function attachSearchHitAttribution(target: object, attribution: SearchHitAttribution): void
⋮----
export function copySearchHitAttribution(from: object, to: object, outputDescription?: string): void
⋮----
export function getSearchHitAttribution(target: object): SearchHitAttribution | undefined
⋮----
export function buildUsageEventAttribution(
  attribution: SearchHitAttribution | undefined,
  entryRef: string,
  projection: AttributionProjection = "full",
): UsageEventAttribution | undefined
⋮----
export function usageEventAttributionMetadata(
  attribution: SearchHitAttribution | undefined,
  entryRef: string,
  projection: AttributionProjection = "full",
): string | undefined
```

## File: src/indexer/search/search-fields.ts
```typescript
import type { IndexDocument } from "../passes/metadata";
⋮----
export function buildSearchFields(entry: IndexDocument):
⋮----
/**
 * Build a single concatenated search text string for an entry: the text its
 * vector is embedded from, derived from the stored document when the entry is
 * embedded (`entries.embed_hash` holds its hash).
 */
export function buildSearchText(entry: IndexDocument): string
```

## File: src/indexer/search/search-hit-enrichers.ts
```typescript
import { displayRef } from "../../core/asset/resolve-ref";
import { presentationFor } from "../../core/type-presentation";
import type { SourceSearchHit } from "../../sources/types";
import type { Database } from "../../storage/database";
import { getDerivedForParent, getItemRefById } from "../../storage/repositories/index-entries-repository";
import { extractDirTagsFromName, extractTagsFromPath, type IndexDocument } from "../passes/metadata";
import { getRenderer } from "../walk/file-context";
import { attachSearchHitAttribution } from "./search-attribution";
⋮----
export interface SearchHitContext {
  type: string;
  stashDir: string;
  bundleId: string;
  defaultBundleId?: string;

  descriptionSource?: IndexDocument["source"];





  db?: Database;

  eligible?: (row: { id: number; entry: IndexDocument; filePath: string }) => boolean;
}
⋮----
export async function enrichSearchHit(hit: SourceSearchHit, ctx: SearchHitContext): Promise<void>
⋮----
function surfaceDerivedMemory(hit: SourceSearchHit, db: Database, ctx: SearchHitContext): void
```

## File: src/indexer/search/search-source.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { isWithin, resolveStashDir } from "../../core/common";
import type { AkmConfig, SourceConfigEntry } from "../../core/config/config";
import {
  bundleComponentConfig,
  bundleKeyForContentRoot,
  bundlesToSourceEntries,
  getSources,
  isBundleEnabled,
  loadConfig,
} from "../../core/config/config";
import { ConfigError } from "../../core/errors";
import { getUnresolvedSourcesDir } from "../../core/paths";
import { warn } from "../../core/warn";
import { resolveGitContentRoot, resolveWritable } from "../../core/write-source";
import { lockContentRootFor } from "../../integrations/lockfile";
import { resolveSourceProviderFactory } from "../../sources/provider-factory";
import { ensureWebsiteMirror } from "../../sources/snapshot-fetchers/website-ingest";
⋮----
export interface SearchSource {
  path: string;

  isDefault?: boolean;

  registryId?: string;

  writable?: boolean;

  type?: SourceConfigEntry["type"];

  adapterId?: string;

  unresolved?: boolean;
}
⋮----
export function implicitStashDir(config: AkmConfig, overrideStashDir?: string): string | undefined
⋮----
export function resolveSourceEntries(overrideStashDir?: string, existingConfig?: AkmConfig): SearchSource[]
⋮----
const sourceIdentity = (dir: string): string =>
⋮----
const addSource = (
    dir: string,
    registryId: string | undefined,
    writable: boolean,
    type: SourceConfigEntry["type"],
    adapterId?: string,
    unresolved = false,
    isDefault = false,
) =>
⋮----
/**
 * Resolve the content directory the indexer should walk for a given config
 * entry. Returns `undefined` if the entry has no walkable content
 * so the caller can skip it.
 *
 * Single source of truth: each provider owns its own path. We instantiate the
 * registered {@link import("../../sources/provider").SourceProvider} for the entry
 * and call `provider.path()`.
 *
 * The git case still does one extra step: the provider returns the cloned
 * repo dir, but the indexer walks the `content/` subdirectory inside it.
 * That convention is part of the akm content layout, not a provider concern,
 * so it stays here.
 */
export function resolveEntryContentDir(entry: SourceConfigEntry): string | undefined
⋮----
export function findSourceForPath(filePath: string, sources: SearchSource[]): SearchSource | undefined
⋮----
export function isEditable(filePath: string, config?: AkmConfig, sources?: SearchSource[]): boolean
⋮----
export function buildEditHint(ref: string): string
⋮----
function isSuspiciousStashRoot(dir: string): boolean
⋮----
export async function ensureSourceCaches(
  config?: AkmConfig,
  options?: {
    materialize?: boolean;
    secrets?: import("../../sources/provider").SecretResolver;
⋮----
function isMaterializedDir(dir: string): boolean
⋮----
function warnIfSourceUnavailableForRead(entry: SourceConfigEntry, providerName: string): void
```

## File: src/indexer/usage/show-usage.ts
```typescript
import { makeBundleRef, parseBundleRef } from "../../core/asset/asset-ref";
import { rethrowIfTestIsolationError } from "../../core/errors";
import { appendEvent, readEvents } from "../../core/events";
import { withStateDbTelemetry } from "../../core/state-db";
import { TELEMETRY_BUSY_TIMEOUT_MS, withIndexDb } from "../../storage/repositories/index-db";
import {
  findEntryIdByRef,
  getEntryById,
  getEntryIdByFilePath,
  getItemRefById,
} from "../../storage/repositories/index-entries-repository";
import { usageEventAttributionMetadata } from "../search/search-attribution";
import { insertUsageEvent, type UsageEventSource } from "./usage-events";
⋮----
export function recentShowCount(ref: string): number
⋮----
function traceParentRef(ref: string): string
⋮----
function appendShowTrace(ref: string, type: string, name: string): void
⋮----
function insertShowUsage(entryId: number, entryRef: string, derivedFrom: unknown, eventSource: UsageEventSource): void
⋮----
export function recordShowUsage(
  ref: string,
  type: string,
  name: string,
  eventSource: UsageEventSource = "user",
  filePath?: string,
): void
⋮----
export function recordIndexedShowUsage(ref: string, eventSource: UsageEventSource = "user"): void
```

## File: src/indexer/usage/usage-events.ts
```typescript
import { rethrowIfTestIsolationError } from "../../core/errors";
import type { Database } from "../../storage/database";
import { SQLITE_CHUNK_SIZE } from "../../storage/repositories/index-sql";
⋮----
export type UsageEventSource = "user" | "improve" | "task" | "audit" | "unknown";
⋮----
export function resolveUsageEventSource(
  env: Record<string, string | undefined> = process.env,
  fallback: UsageEventSource = "user",
): UsageEventSource
⋮----
export interface UsageEvent {
  event_type: string;
  query?: string;
  entry_id?: number;
  entry_ref?: string;
  signal?: string;
  metadata?: string;

  source?: UsageEventSource;
}
⋮----
export interface UsageEventRow {
  id: number;
  event_type: string;
  query: string | null;
  entry_id: number | null;
  entry_ref: string | null;
  signal: string | null;
  metadata: string | null;
  source: string;
  created_at: string;
}
⋮----
export function ensureUsageEventsSchema(db: Database): void
⋮----
export function insertUsageEvent(db: Database, event: UsageEvent): void
⋮----
export function insertUsageEventStrict(db: Database, event: UsageEvent): void
⋮----
export function countFeedbackSignalsByRef(
  db: Database,
  refs: readonly string[],
): Map<string,
⋮----
export function countUsageEventsByType(db: Database, eventType: string): number
⋮----
export function listUsedEntryRefs(db: Database, sinceIso: string): string[]
⋮----
export function listRetrievalQueries(db: Database, conceptId: string): string[]
⋮----
export function purgeOldUsageEvents(db: Database, retentionDays: number): void
```

## File: src/indexer/walk/file-context.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { toPosix } from "../../core/common";
import type { ShowResponse, SourceSearchHit } from "../../sources/types";
⋮----
export interface FileContext {

  absPath: string;

  relPath: string;

  ext: string;

  fileName: string;

  parentDir: string;

  parentDirAbs: string;





  ancestorDirs: string[];

  stashRoot: string;


  content: () => string;

  frontmatter: () => Record<string, unknown> | null;

  stat: () => fs.Stats;
}
⋮----
export function buildFileContext(stashRoot: string, absPath: string): FileContext
⋮----
content(): string
⋮----
frontmatter(): Record<string, unknown> | null
⋮----
stat(): fs.Stats
⋮----
export interface MatchResult {





  type: string;





  specificity: number;

  renderer: string;

  meta?: Record<string, unknown>;
}
⋮----
export type AssetMatcher = (ctx: FileContext) => MatchResult | null;
⋮----
export interface RenderContext extends FileContext {
  matchResult: MatchResult;
  stashDirs: string[];
  origin?: string;
  defaultBundle?: string;
}
⋮----
export interface AssetRenderer {

  name: string;

  buildShowResponse(ctx: RenderContext): ShowResponse;

  enrichSearchHit?(hit: SourceSearchHit, stashDir: string): void;
}
⋮----
buildShowResponse(ctx: RenderContext): ShowResponse;
⋮----
enrichSearchHit?(hit: SourceSearchHit, stashDir: string): void;
⋮----
async function ensureBuiltinsRegistered(): Promise<void>
⋮----
export function registerRenderer(renderer: AssetRenderer): void
⋮----
export async function getRenderer(name: string): Promise<AssetRenderer | undefined>
⋮----
export async function getAllRenderers(): Promise<AssetRenderer[]>
⋮----
export function buildRenderContext(
  ctx: FileContext,
  match: MatchResult,
  stashDirs: string[],
  origin?: string,
  defaultBundle?: string,
): RenderContext
```

## File: src/indexer/walk/index-context.ts
```typescript
export type SemanticSearchRuntimeStatus = "pending" | "ready-js" | "blocked";
⋮----
export interface IndexVerification {
  ok: boolean;
  message: string;
  guidance?: string;
  semanticSearchEnabled: boolean;
  semanticSearchMode: "off" | "auto";
  semanticStatus: "disabled" | SemanticSearchRuntimeStatus;
  embeddingProvider: "local" | "remote";

  embeddingRuntime?: "onnxruntime-node";
  entryCount: number;
  embeddingCount: number;
}
⋮----
export interface SemanticSearchRecord {
  status: IndexVerification["semanticStatus"] | "unavailable";

  unavailable?: "platform" | "load";
  provider: IndexVerification["embeddingProvider"];

  runtime?: string;

  reason?: string;
}
⋮----
export interface RemovedIndexSource {
  bundleId: string;
  sourceRoot: string;

  removeBundleEntries: boolean;
}
```

## File: src/indexer/walk/matchers.ts
```typescript
import { SCRIPT_EXTENSIONS } from "../../core/recognition-util";
import { presentationFor } from "../../core/type-presentation";
import type { FileContext, MatchResult } from "./file-context";
⋮----
export type PathFileContext = Omit<FileContext, "content" | "frontmatter" | "stat">;
⋮----
interface MatchFact {
  type: string;
  specificity: number;
  meta?: Record<string, unknown>;
}
⋮----
interface DirTypeRule {
  dir: string;
  type: MatchFact["type"];
  test: (ext: string, fileName: string) => boolean;
}
⋮----
function isTypedDirDocFile(fileName: string): boolean
⋮----
function isNestedSkillResource(ctx: PathFileContext): boolean
⋮----
function matchDirectoryHint(dirName: string, ctx: PathFileContext, specificity: number): MatchFact | null
⋮----
function hasDeclaredDirType(ctx: PathFileContext): boolean
⋮----
function classifyByExtension(ctx: FileContext): MatchFact | null
⋮----
function classifyByDirectory(ctx: FileContext): MatchFact | null
⋮----
function classifyByParentDirHint(ctx: FileContext): MatchFact | null
⋮----
function classifyBySmartMd(ctx: FileContext): MatchFact | null
⋮----
function toMatchResult(ctx: FileContext, classify: (ctx: FileContext) => MatchFact | null): MatchResult | null
⋮----
function matchResultForFact(fact: MatchFact): MatchResult | null
⋮----
export function extensionMatcher(ctx: FileContext): MatchResult | null
⋮----
export function directoryMatcher(ctx: FileContext): MatchResult | null
⋮----
export function parentDirHintMatcher(ctx: FileContext): MatchResult | null
⋮----
export function smartMdMatcher(ctx: FileContext): MatchResult | null
```

## File: src/indexer/walk/path-resolver.ts
```typescript
import { type AssetRef, conceptIdFromTypeName, parseRefInput } from "../../core/asset/resolve-ref";
import { lookup } from "../indexer";
import { deriveInstallations } from "../installations";
import { resolveConceptOwner } from "../lookup/adapter-concept-owner";
import { resolveSourceEntries } from "../search/search-source";
⋮----
export interface ResolveAssetPathOptions {
  stashDir?: string;
  mode?: "index-only" | "index-first" | "disk-only";
  writableBundleIds?: ReadonlySet<string>;
  honorOrigin?: boolean;
}
⋮----
function normalizeRef(ref: string | AssetRef): AssetRef
⋮----
async function resolveViaIndex(ref: AssetRef): Promise<string | null>
⋮----
function resolveViaDisk(ref: AssetRef, options: ResolveAssetPathOptions): string | null
⋮----
export async function resolveAssetPath(
  ref: string | AssetRef,
  options: ResolveAssetPathOptions = {},
): Promise<string | null>
```

## File: src/indexer/walk/walker.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { isRelevantAssetFile } from "../../core/asset/asset-placement";
import { WORKFLOW_EXTENSIONS } from "../../core/recognition-util";
import { spawnSync } from "../../runtime";
import { buildFileContext, type FileContext } from "./file-context";
⋮----
export interface WalkStashFlatOptions {

  includeAllDirectories?: boolean;
}
⋮----
export interface WalkStashFlatResult {
  files: FileContext[];

  complete: boolean;
}
⋮----
export interface DirectoryGroup {
  dirPath: string;
  files: string[];
}
⋮----
export function walkStash(typeRoot: string, assetType: string): DirectoryGroup[]
⋮----
export function walkStashFlat(stashRoot: string, options: WalkStashFlatOptions =
⋮----
export function walkStashFlatWithStatus(stashRoot: string, options: WalkStashFlatOptions =
⋮----
function walkStashGit(stashRoot: string, options: WalkStashFlatOptions): WalkStashFlatResult | null
⋮----
// Data-hygiene filename skips: the legacy metadata sidecar (never indexed as
// content — Chunk-8 folds it into the bundle format) plus git dot-files.
⋮----
function isInsideGitRepo(dir: string): boolean
⋮----
export interface WalkMarkdownFilesResult {
  files: string[];

  complete: boolean;
}
⋮----
export function walkMarkdownFiles(root: string): WalkMarkdownFilesResult
⋮----
function walkStashManual(stashRoot: string, options: WalkStashFlatOptions): WalkStashFlatResult
⋮----
export function isFileOrFileSymlink(filePath: string): boolean
```

## File: src/indexer/bundle-identity-guard.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import type { AkmConfig } from "../core/config/config";
import { loadConfig } from "../core/config/config";
import { rethrowIfTestIsolationError } from "../core/errors";
import { getDbPath } from "../core/paths";
import { warn } from "../core/warn";
import { closeDatabase, openReadonlyExistingDatabase } from "../storage/repositories/index-connection";
import { hasCurrentEntriesTable } from "../storage/repositories/index-entry-schema";
⋮----
export function resetBundleIdentityGuardForTests(): void
⋮----
interface IndexedBundlePath {
  bundleId: string;
  filePath: string;
}
⋮----
function indexedBundlePaths(dbPath: string): IndexedBundlePath[] | undefined
⋮----
export function warnOnBundleRenameDrift(config: AkmConfig = loadConfig()): void
```

## File: src/indexer/ensure-index.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { hashContent } from "../core/adapter/adapters/shared";
import { type AssetSpec, placementSpecList } from "../core/asset/asset-placement";
import { ConfigError } from "../core/errors";
import { classifyPathAccess } from "../core/path-access";
import { getDbPath } from "../core/paths";
import { warnVerbose } from "../core/warn";
import { assertIndexPathReadable, closeDatabase, openExistingDatabase } from "../storage/repositories/index-connection";
import {
  getEntryCount,
  getIndexedFileHashes,
  getIndexedFilePaths,
} from "../storage/repositories/index-entries-repository";
import { hasCurrentEntriesTable } from "../storage/repositories/index-entry-schema";
import { getMeta } from "../storage/repositories/index-meta-repository";
import { warnOnBundleRenameDrift } from "./bundle-identity-guard";
import type { IndexResponse } from "./indexer";
⋮----
export interface EnsureIndexOptions {
  mode?: "background" | "blocking";
  signal?: AbortSignal;






  onReindexTiming?: (info: { durationMs: number; timing: IndexResponse["timing"] }) => void;
}
⋮----
function getIndexableFiles(root: string, spec: AssetSpec): string[]
⋮----
function hasNewerIndexableFiles(
  stashDir: string,
  builtAt: string | undefined,
  indexedPaths: Set<string>,
  indexedHashes: ReadonlyMap<string, string>,
): boolean
⋮----
export function isIndexStale(stashDir: string): boolean
⋮----
function indexCanServeStash(stashDir: string, options:
⋮----
export async function ensureIndex(stashDir: string, options: EnsureIndexOptions =
```

## File: src/indexer/index-db-contention.ts
```typescript
import { AkmError, TransientError } from "../core/errors";
import { probeLock } from "../core/file-lock";
import { formatLockHolderPid } from "../core/run-lock";
import { isSqliteContentionError } from "../core/state-db";
import { indexRebuildLockPath } from "./index-rebuild-lock";
⋮----
function describeIndexRebuildLockHolder(): string
⋮----
/**
 * Reclassify a contention-shaped error escaping the walk, index, or
 * embedding phase into a retryable-shortly `TransientError` (field
 * follow-up to #956, dev-team field review 2026-09-10): a concurrent writer
 * (another `akm index`, a source-update embedding pass, the per-command
 * background reindex) can make index.db busy, and the raw SQLite driver
 * error ("database is locked") used to escape as exit 70
 * (internal/unclassified) instead of the "retry shortly" contract exit 75
 * gives a scheduler to branch on — mirroring `STATE_DB_CONTENDED`'s
 * precedent for state.db (`core/state-db.ts`). Reuses the ONE shared
 * classifier, `isSqliteContentionError`, rather than a second one. An error
 * that is already a classified akm error (e.g. a `STATE_DB_CONTENDED`
 * TransientError from an inner state.db write) is never re-wrapped — only a
 * raw, unclassified error matching the shared contention shape is
 * reclassified. Every other error is rethrown unchanged.
 */
export function reclassifyIndexDbContention(error: unknown): unknown
```

## File: src/indexer/index-rebuild-lock.ts
```typescript
import { type LockOwnership, releaseLock } from "../core/file-lock";
import { getIndexRebuildLockPath } from "../core/paths";
import { formatLockHolderPid, type RunLockHolder, tryAcquireRunLock } from "../core/run-lock";
import { warn, warnVerbose } from "../core/warn";
⋮----
export type IndexRebuildLockAcquisition =
  | { state: "acquired"; ownership: LockOwnership }

  | { state: "skipped"; holder: RunLockHolder }

  | { state: "contended"; holder: RunLockHolder };
⋮----
export function indexRebuildLockPath(): string
⋮----
export function tryAcquireIndexRebuildLock(skipIfLocked: boolean | undefined): IndexRebuildLockAcquisition
⋮----
const acquire = ()
⋮----
export function releaseIndexRebuildLock(ownership: LockOwnership): void
```

## File: src/indexer/index-writer-lock.ts
```typescript
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import path from "node:path";
import { TransientError } from "../core/errors";
import {
  createLockPayload,
  type LockOwnership,
  probeLock,
  reclaimStaleLock,
  releaseLock,
  tryAcquireLockSync,
} from "../core/file-lock";
import { getDbPath, getIndexWriterLockPath } from "../core/paths";
import { warn } from "../core/warn";
import { sleepSync } from "../runtime";
⋮----
export function _setAssetMutationLeaseSyncTimingForTests(overrides?: {
  maxWaitMs?: number;
  waitNoticeIntervalMs?: number;
}): void
⋮----
export interface AssetMutationLease {
  lockPath: string;
  release: () => void;
}
⋮----
export interface AcquireAssetMutationLeaseOptions {
  mode?: "wait" | "try";
  purpose: string;
  signal?: AbortSignal;
  maxWaitMs?: number;
  onWait?: (info: { waitedMs: number }) => void;
  onAcquired?: (info: { waitedMs: number }) => void;
}
⋮----
function buildPayload(purpose: string): string
⋮----
function delay(ms: number): Promise<void>
⋮----
function describeAssetMutationHolder(lockPath: string): string
⋮----
function throwIfAborted(signal?: AbortSignal): void
⋮----
function createLease(lockPath: string, ownership: LockOwnership): AssetMutationLease
⋮----
const exitHandler = ()
⋮----
function tryAcquireAssetMutationLease(lockPath: string, purpose: string): AssetMutationLease | undefined
⋮----
export async function acquireAssetMutationLease(
  options: AcquireAssetMutationLeaseOptions,
): Promise<AssetMutationLease | undefined>
⋮----
export async function withAssetMutationLease<T>(purpose: string, run: () => Promise<T>): Promise<T>
⋮----
const execute = async (): Promise<T> =>
⋮----
export function withAssetMutationLeaseSync<T>(purpose: string, run: () => T): T
⋮----
export function probeAssetMutationLease()
```

## File: src/indexer/index-written-assets.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { akmAdapter } from "../core/adapter/adapters/akm-adapter";
import { loadConfig } from "../core/config/config";
import { isDataDirUnreadableError } from "../core/errors";
import { probeLock } from "../core/file-lock";
import { isPathAbsent } from "../core/path-access";
import { getDbPath, getIndexRebuildLockPath } from "../core/paths";
import { formatLockHolderPid } from "../core/run-lock";
import { warn, warnVerbose } from "../core/warn";
import { closeDatabase, openExistingDatabase } from "../storage/repositories/index-connection";
import { deleteEntriesByIds, getEntryCount, upsertEntry } from "../storage/repositories/index-entries-repository";
import { deriveEntryProvenance, deriveInstallations } from "./installations";
import { generateEmbeddingsForDb, publishTargetedEmbeddingMeta } from "./materialize-embeddings";
import { type IndexDocument, withFileSize } from "./passes/metadata";
import { drainDirDocuments } from "./scan/drain-dir";
import { buildFileContext } from "./walk/file-context";
⋮----
export async function indexWrittenAssets(
  stashDir: string,
  filePaths: string[],
  options: {

    bundleId?: string;
  } = {},
): Promise<boolean>
```

## File: src/indexer/indexer.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import type { BundleAdapter } from "../core/adapter/bundle-adapter";
import { detectAdapterId } from "../core/adapter/detect-adapter";
import { adapterForId } from "../core/adapter/registry";
import type { BundleComponent } from "../core/adapter/types";
import { compareCodePoints, isHttpUrl } from "../core/common";
import type { AkmConfig } from "../core/config/config";
import { appendEvent } from "../core/events";
import { classifyPathAccess, describeInaccessiblePath } from "../core/path-access";
import { getDbPath } from "../core/paths";
import { SCRIPT_EXTENSIONS } from "../core/recognition-util";
import { withStateDb } from "../core/state-db";
import { isVerbose, warn, warnOnce, warnVerbose } from "../core/warn";
import { localEmbeddingRuntime } from "../llm/embedder";
import { effectiveEmbedding } from "../llm/embedders/connection";
import { resolveSourcesForOrigin } from "../registry/origin-resolve";
⋮----
import type { Database } from "../storage/database";
import {
  closeDatabase,
  openExistingDatabase,
  openIndexDatabase,
  openReadonlyExistingDatabase,
} from "../storage/repositories/index-connection";
import {
  deleteEntriesByBundle,
  deleteEntriesByDirAndBundle,
  deleteEntriesByDirExceptRefs,
  deleteEntriesByIds,
  deleteUsageEventsByEntryIds,
  findEntryIdByRef,
  getAllEntries,
  getEmbeddableEntryCount,
  getEntryCount,
  getIndexedBundleIdsByDir,
  getIndexedDirPathsByBundleId,
  relinkUsageEvents,
  upsertEntry,
} from "../storage/repositories/index-entries-repository";
import type { EntryProvenance } from "../storage/repositories/index-entry-types";
import { rebuildFtsIfTotalsStale } from "../storage/repositories/index-fts-repository";
import { clearStaleCacheEntries } from "../storage/repositories/index-llm-cache-repository";
import {
  deleteIndexDirState,
  deleteMeta,
  getIndexDirState,
  getMeta,
  setMeta,
  upsertIndexDirState,
} from "../storage/repositories/index-meta-repository";
import { VACUUM_PENDING_META } from "../storage/repositories/index-schema";
import { upsertUtilityScore } from "../storage/repositories/index-utility-repository";
import { getEmbeddingCount } from "../storage/repositories/index-vec-repository";
import { INDEX_DB_VACUUMED_EVENT, readFreelistInfo, vacuumIfReclaimable } from "../storage/state-db-integrity";
import { assertIndexedWorkflowSourceIdentity, WorkflowSourceIdentityError } from "../workflows/source-files";
import { reclassifyIndexDbContention } from "./index-db-contention";
import { deriveEntryProvenance, deriveInstallations } from "./installations";
import { type AdapterConceptOwner, indexedPathMatchesOwner, resolveConceptOwner } from "./lookup/adapter-concept-owner";
import { type EmbeddingGenerationResult, generateEmbeddingsForDb } from "./materialize-embeddings";
import {
  canUseIncrementalSkip,
  computeDirFingerprint,
  type DirFingerprint,
  type DirStaleReason,
  getCachedDirState,
  getDirIndexState,
  inferZeroRowReason,
} from "./passes/dir-staleness";
import { type IndexDocument, isWorkflowSkipWarning, type StashFile, withFileSize } from "./passes/metadata";
import { drainDirDocuments } from "./scan/drain-dir";
import type { SearchSource } from "./search/search-source";
import { purgeOldUsageEvents, USAGE_EVENT_RETENTION_DAYS } from "./usage/usage-events";
import type { FileContext } from "./walk/file-context";
import {
  type IndexVerification,
  type RemovedIndexSource,
  SEMANTIC_SEARCH_META_KEY,
  type SemanticSearchRecord,
} from "./walk/index-context";
import { walkStashFlatWithStatus } from "./walk/walker";
⋮----
export interface IndexCleanResult {

  checked: number;

  removed: number;

  removedRefs: string[];

  dryRun: boolean;
}
⋮----
export interface IndexResponse {
  stashDir: string;
  totalEntries: number;
  generatedMetadata: number;
  indexPath: string;
  mode: "full" | "incremental";
  directoriesScanned: number;
  directoriesSkipped: number;

  scanComplete: boolean;
  warnings?: string[];
  verification: IndexVerification;

  timing?: {
    totalMs: number;
    walkMs: number;
    llmMs: number;
    embedMs: number;
    ftsMs: number;
    finalizeMs: number;
    cleanMs: number;
    preflightMs: number;
    sourceCacheMs: number;
    endToEndMs: number;
  };

  clean?: IndexCleanResult;






  configUpdated?: { detectedAdapters: Record<string, string> };
}
⋮----
export interface IndexProgressEvent {
  phase: "summary" | "preflight" | "scan" | "embeddings" | "fts" | "finalize" | "verify";
  message: string;
  processed?: number;
  total?: number;
}
⋮----
interface IndexOptions {






  stashDir: string;
  full?: boolean;




  clean?: boolean;




  dryRun?: boolean;





  reembed?: boolean;
  onProgress?: (event: IndexProgressEvent) => void;
  signal?: AbortSignal;








  hydrateSources?: boolean;





  persistDetectedAdapters?: boolean;











  implicit?: boolean;
}
⋮----
function throwIfAborted(signal?: AbortSignal): void
⋮----
function sourceComponents(sources: readonly SearchSource[]): BundleComponent[]
⋮----
interface IndexSourceOwner {
  bundleId: string;
  sourceRoot: string;
}
⋮----
function sourceOwners(sources: readonly SearchSource[]): IndexSourceOwner[]
⋮----
function parseStoredSourceOwners(raw: string | undefined): IndexSourceOwner[]
⋮----
function findRemovedSources(db: Database, sources: readonly SearchSource[]): RemovedIndexSource[]
⋮----
function applyRemovedSources(
  db: Database,
  sources: readonly SearchSource[],
  removedSources: readonly RemovedIndexSource[],
  isIncremental: boolean,
): void
⋮----
export interface EmbeddingPassResult {
  embeddingResult: EmbeddingGenerationResult;
  verification: IndexVerification;
}
⋮----
export async function runEmbeddingPass(params: {
  db: Database;
  config: AkmConfig;
onProgress: (event: IndexProgressEvent)
⋮----
function finalizeIndex(args: {
  db: Database;
  sources: SearchSource[];
  sourceDirs: string[];
  stashDir: string;
  scanComplete: boolean;
  signal: AbortSignal | undefined;
onProgress: (event: IndexProgressEvent)
⋮----
function vacuumIndexDb(db: Database, onProgress: (event: IndexProgressEvent) => void): void
⋮----
function runCleanPass(db: Database, dryRun: boolean): IndexCleanResult
⋮----
export function _setAkmIndexForTests(fake?: typeof akmIndexReal): void
⋮----
export async function akmIndex(options: IndexOptions): Promise<IndexResponse>
⋮----
export type IndexTransactionPoint = "records-persisted";
⋮----
export function _setIndexTransactionHookForTests(hook?: (point: IndexTransactionPoint) => void): void
⋮----
export function _setDrainObserverForTests(observer?: (dirPath: string, fileCount: number) => void): void
⋮----
function isReadableDirectory(root: string): boolean
⋮----
function detectAndPersistBundleAdapters(
  allSourceEntries: SearchSource[],
  config: AkmConfig,
  mutateConfig: typeof import("../core/config/config.js").mutateConfig,
  opts: { announce: boolean; persist: boolean },
):
⋮----
async function akmIndexReal(options: IndexOptions): Promise<IndexResponse>
⋮----
type DirScanReason =
  | DirStaleReason
  | { kind: "duplicate-dir" | "no-indexable-files" | "full-rebuild" | "not-in-source-snapshot"; detail?: string };
⋮----
type DirRecord = {
  dirPath: string;
  currentStashDir: string;
  files: string[];
  stash: StashFile | null;
  skip: boolean;
  reason?: DirScanReason;
  persistedRowCount?: number;

  fingerprint?: DirFingerprint;





  hashByFile?: Map<string, string>;





  conceptIdByFile?: Map<string, string>;

  indexVariant?: string;

  remove?: boolean;
};
⋮----
type IndexedSourceOwner = Pick<EntryProvenance, "bundleId" | "componentId" | "adapterId">;
⋮----
function buildIndexedSourceOwners(sources: readonly SearchSource[]): Map<string, IndexedSourceOwner>
⋮----
type SourceScanPlan = {
  currentStashDir: string;
  component: BundleComponent;
  adapter?: BundleAdapter;
  dirGroups: Map<string, FileContext[]>;
  removals: Array<DirRecord & { reason: DirScanReason }>;
  walkComplete: boolean;
};
⋮----
type SourceScanResult = {
  dirRecords: DirRecord[];
  scannedDirs: number;
  skippedDirs: number;
  generatedCount: number;
  warnings: string[];
  complete: boolean;
};
⋮----
function removalsFirst(records: DirRecord[]): DirRecord[]
⋮----
function addEntryIds(target: Set<number>, ids: number[]): void
⋮----
function groupFileContextsByDir(fileContexts: FileContext[]): Map<string, FileContext[]>
⋮----
function sourceSnapshotRemovals(
  db: Database,
  currentStashDir: string,
  bundleId: string,
  currentDirs: ReadonlySet<string>,
  allIndexedDirsByBundle?: ReadonlyMap<string, ReadonlySet<string>>,
): Array<DirRecord &
⋮----
function warnIfAdapterSkipsAkmContent(
  component: BundleComponent,
  files: readonly FileContext[],
  adapter: BundleAdapter,
): void
⋮----
function buildSourceScanPlans(
  db: Database,
  allSourceEntries: SearchSource[],
  isIncremental: boolean,
  reconcileMissingDirs: boolean,
):
⋮----
const addRemoval = (plan: SourceScanPlan, dirPath: string, stashDir: string) =>
⋮----
async function scanSourceDirs(
  db: Database,
  allSourceEntries: SearchSource[],
  isIncremental: boolean,
  builtAtMs: number,
  hadRemovedSources: boolean,
  onProgress?: (event: IndexProgressEvent) => void,
  reconcileMissingDirs = true,
): Promise<SourceScanResult>
⋮----
const reportScanProgress = (message: string)
⋮----
const reportDirDecision = (
    kind: "scan" | "skip",
    dirPath: string,
    currentStashDir: string,
    reason: DirScanReason,
    persistedRowCount?: number,
) =>
⋮----
// Only the first source that exposes a physical directory may index it.
const markSeenOrSkipDuplicate = (dirPath: string, currentStashDir: string, files: string[]): boolean =>
⋮----
// Owner ruling 2026-07-21: dispatch each component's DETECTED adapter (§4).
// An unknown adapter id has no `adapterForId` match → skip the whole
⋮----
function requiresWorkflowSourcePreflight(ctxs: readonly FileContext[]): boolean
⋮----
interface PersistedEntryRow {
  id: number;
  content_hash: string | null;
  file_path: string;
  adapter_id: string;
}
⋮----
function persistDirRecords(
  db: Database,
  dirRecords: DirRecord[],
  warnings: string[],
  bundleByRoot: ReadonlyMap<string, { bundleId: string; componentId: string; adapterId: string }>,
): void
⋮----
function buildIndexSummaryMessage(options: {
  mode: "full" | "incremental";
  sourcesCount: number;
  semanticSearchMode: AkmConfig["semanticSearchMode"];
  embeddingProvider: "local" | "remote";
}): string
⋮----
function getEmbeddingProvider(
  embedding?: import("../core/config/config").EmbeddingConnectionConfig,
): "local" | "remote"
⋮----
function verifyIndexState(
  db: Database,
  config: AkmConfig,
  embeddableEntries: number,
  embeddingResult: EmbeddingGenerationResult,
): IndexVerification
⋮----
const verification = (
    ok: boolean,
    message: string,
    semanticSearchEnabled: boolean,
    semanticStatus: IndexVerification["semanticStatus"],
    guidance?: string,
): IndexVerification => (
⋮----
import { type BundleRef, makeBundleRef } from "../core/asset/asset-ref";
import { type AssetRef, conceptIdFromTypeName } from "../core/asset/resolve-ref";
⋮----
export interface IndexEntry {

  filePath: string;

  stashDir: string;

  type: string;

  name: string;

  adapterId: string;

  document?: IndexDocument;

  itemRef: string;
  bundleId: string;
  conceptId: string;
}
⋮----
export interface BundleRefLookupResolution {
  entry: IndexEntry | null;

  owner?: AdapterConceptOwner;

  indexError?: unknown;
}
⋮----
async function resolveLookupSources(): Promise<SearchSource[]>
⋮----
type LookupDatabaseOpener = (dbPath: string) => Database | undefined;
⋮----
async function lookupBundleRefWithResolutionUsing(
  ref: BundleRef,
  openLookupDatabase: LookupDatabaseOpener,

  borrowed = false,
): Promise<BundleRefLookupResolution>
⋮----
const resolved = (entry: IndexEntry | null, owner?: AdapterConceptOwner): BundleRefLookupResolution => (
⋮----
export async function lookupBundleRefWithResolution(ref: BundleRef): Promise<BundleRefLookupResolution>
⋮----
export async function lookupBundleRefWithResolutionReadonly(ref: BundleRef): Promise<BundleRefLookupResolution>
⋮----
export async function lookupBundleRef(ref: BundleRef): Promise<IndexEntry | null>
⋮----
export async function lookupBundleRefReadonly(ref: BundleRef): Promise<IndexEntry | null>
⋮----
export async function lookupBundleRefsReadonly(
  refs: readonly BundleRef[],
  options: { isolatedSnapshot?: boolean } = {},
): Promise<Array<IndexEntry | null>>
⋮----
function readLookupEntry(db: Database, id: number, fallbackConceptId: string, sourceRoot: string): IndexEntry | null
⋮----
export async function lookup(ref: AssetRef): Promise<IndexEntry | null>
⋮----
export function recomputeUtilityScores(db: Database, stateDb: Database, onlyEntryId?: number): void
```

## File: src/indexer/init.ts
```typescript
export function initIndexer(): Promise<void>
```

## File: src/indexer/installations.ts
```typescript
import { detectAdapterId } from "../core/adapter/detect-adapter";
import type { BundleInstallation } from "../core/adapter/types";
import { stashDirFor } from "../core/asset/asset-placement";
import { deriveBundleId, deriveBundleIds, slugForPath } from "../core/bundle-id";
import { isSourceWriteActivated } from "../core/write-source";
import type { EntryProvenance } from "../storage/repositories/index-entry-types";
import type { SearchSource } from "./search/search-source";
⋮----
export function deriveInstallations(sources: SearchSource[]): BundleInstallation[]
⋮----
export function deriveWritableBundleIds(sources: SearchSource[]): Set<string>
⋮----
export function deriveEntryProvenance(
  bundle: { bundleId: string; componentId: string; adapterId: string },
  type: string,
  name: string,






  adapterConceptId?: string,
): EntryProvenance
```

## File: src/indexer/materialize-embeddings.ts
```typescript
import type { AkmConfig, EmbeddingConnectionConfig } from "../core/config/config";
import { getConfigPath } from "../core/paths";
import { redactUrlCredentials } from "../core/redaction";
import { isVerbose, warn, warnVerbose } from "../core/warn";
import { embedBatch } from "../llm/embedder";
import { effectiveEmbedding } from "../llm/embedders/connection";
import { DETERMINISTIC_EMBED_MODEL_ID, isDeterministicEmbedEnabled } from "../llm/embedders/deterministic";
import { DEFAULT_LOCAL_MODEL, LocalRuntimeUnavailableError } from "../llm/embedders/local";
import { applyEmbeddingTemplate, documentTemplateFingerprint, resolveEmbeddingProfile } from "../llm/embedders/profile";
import {
  capEmbeddingText,
  DEFAULT_MAX_INPUT_TOKENS,
  describeEmbeddingCredential,
  type EmbeddingBatchCommit,
  type EmbeddingBatchSkip,
  type EmbeddingSkipHandler,
  estimateTokenCount,
  hasRemoteEndpoint,
  normalizeEmbeddingEndpoint,
} from "../llm/embedders/remote";
import type { Database } from "../storage/database";
import { getEmbeddableEntryCount } from "../storage/repositories/index-entries-repository";
import { getMeta, setMeta } from "../storage/repositories/index-meta-repository";
import {
  getAllEntriesForEmbedding,
  getEmbeddingCount,
  purgeEmbeddings,
  upsertEmbedding,
} from "../storage/repositories/index-vec-repository";
import { reclassifyIndexDbContention } from "./index-db-contention";
⋮----
export function deriveSemanticProviderFingerprint(embedding?: EmbeddingConnectionConfig): string
⋮----
export interface EmbeddingProgressEvent {
  phase: "embeddings";
  message: string;
}
⋮----
export interface EmbeddingGenerationResult {
  success: boolean;
  message?: string;

  runtimeUnavailable?: LocalRuntimeUnavailableError["kind"];
}
⋮----
export interface GenerateEmbeddingsOptions {





  forceReembed?: boolean;
}
⋮----
export function formatEmbeddingHeartbeat(storedCount: number, total: number, failedCount: number): string
⋮----
function throwIfAborted(signal?: AbortSignal): void
⋮----
export async function generateEmbeddingsForDb(
  db: Database,
  config: AkmConfig,
  onProgress: (event: EmbeddingProgressEvent) => void,
  signal?: AbortSignal,
  entryIds?: readonly number[],
  opts?: GenerateEmbeddingsOptions,
): Promise<EmbeddingGenerationResult>
⋮----
const onSkip: EmbeddingSkipHandler = (skip) =>
⋮----
const onBatch: EmbeddingBatchCommit = (indices, batchEmbeddings, outcome) =>
⋮----
const printSkipList = (label: string, skipList: EmbeddingBatchSkip[]): void =>
⋮----
export function publishTargetedEmbeddingMeta(db: Database, config: AkmConfig): void
```

## File: src/indexer/read-preflight.ts
```typescript
import type { AkmConfig } from "../core/config/config";
import { ensureIndex } from "./ensure-index";
import type { SearchSource } from "./search/search-source";
import { resolveSourceEntries } from "./search/search-source";
⋮----
export interface ReadSourceEnvelope {

  sources: SearchSource[];

  primarySource?: SearchSource;
}
⋮----
export function resolveReadSources(overrideStashDir?: string, existingConfig?: AkmConfig): ReadSourceEnvelope
⋮----
export async function ensurePrimaryIndexForRead(primarySource?: SearchSource): Promise<boolean>
```
