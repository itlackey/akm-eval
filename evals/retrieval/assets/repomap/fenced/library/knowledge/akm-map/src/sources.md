---
description: "Repo map of akm src/sources at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  sources/
    providers/
      filesystem.ts
      git-install.ts
      git-provider.ts
      git-stash.ts
      git.ts
      install-types.ts
      npm.ts
      provider-utils.ts
      sync-from-ref.ts
      tar-utils.ts
      website.ts
    snapshot-fetchers/
      bluesky.ts
      content-extract.ts
      fetcher-util.ts
      github.ts
      host-guard.ts
      registry.ts
      robots.ts
      rss.ts
      secret-seam.ts
      types.ts
      website-ingest.ts
      x.ts
      youtube.ts
    freshness.ts
    include.ts
    provider-factory.ts
    provider.ts
    resolve.ts
    types.ts
    website-url.ts
```

# Files

## File: src/sources/providers/filesystem.ts
```typescript
import { resolveStashDir } from "../../core/common";
import type { SourceConfigEntry } from "../../core/config/config";
import { ConfigError } from "../../core/errors";
import type { SourceProvider } from "../provider";
⋮----
export function createFilesystemProvider(entry: SourceConfigEntry): SourceProvider
⋮----
path()
```

## File: src/sources/providers/git-install.ts
```typescript
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isWithin } from "../../core/common";
import { UsageError } from "../../core/errors";
import { getRegistryCacheDir } from "../../core/paths";
import {
  gitCredentialEnvironment,
  parseRegistryRef,
  resolveRegistryArtifact,
  validateGitRef,
  validateGitUrl,
} from "../../registry/resolve";
import type { ParsedGitRef } from "../../registry/types";
import type { SourceLockData, SyncOptions } from "./install-types";
import { applyAkmIncludeConfig, buildInstallCacheDir, detectStashRoot, isDirectory } from "./provider-utils";
⋮----
export function runGit(
  args: string[],
  options?: Omit<SpawnSyncOptionsWithStringEncoding, "encoding">,
): SpawnSyncReturns<string>
⋮----
export interface GitUpstreamState {
  hasRemote: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
}
⋮----
export function inspectGitUpstream(repoDir: string, credential?: string): GitUpstreamState
⋮----
export function verifyClonedRevision(cloneDir: string, url: string, expectedRevision: string | undefined): void
⋮----
function gitRelation(repoDir: string, target: string):
⋮----
export function assertNoIgnoredPathOverwrite(repoDir: string, targetRevision: string): void
⋮----
function isCommitSha(ref: string): boolean
⋮----
function normalizeRemoteUrl(value: string): string
⋮----
/**
 * Move a fully materialized directory into place. POSIX cannot rename over a
 * non-empty directory, so the old one is renamed aside first and restored if
 * the second rename fails; the destination is missing for one syscall at most.
 */
export function replaceDirectory(stagedDir: string, destination: string): void
⋮----
// The new destination is live; a stale backup is safer than reporting a
// failed replacement after the swap already succeeded.
⋮----
/**
 * Materialize a Git install ref (`akm bundle add github:owner/repo` or
 * `akm bundle add git:url`) through the clone, strip, and include-filter pipeline.
 */
export async function syncGitRef(ref: string, options?: SyncOptions): Promise<SourceLockData>
⋮----
async function doSyncGit(parsed: ParsedGitRef, options?: SyncOptions): Promise<SourceLockData>
⋮----
export function syncExistingWritableCheckout(
  parsed: ParsedGitRef,
  resolved: Awaited<ReturnType<typeof resolveRegistryArtifact>>,
  contentRoot: string,
  syncedAt: string,
  requiredRoots: readonly string[] = [],
  credential?: string,
): SourceLockData
⋮----
export function cloneRepo(
  cloneUrl: string,
  ref: string | null,
  destDir: string,
  writable = false,
  credential?: string,
): void
⋮----
export function classifyCloneFailure(
  url: string,
  stderr: string | undefined | null,
  spawnError: NodeJS.ErrnoException | Error | undefined,
): string
⋮----
// `git` binary not on PATH.
⋮----
function redactUrlUserinfo(text: string): string
```

## File: src/sources/providers/git-provider.ts
```typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { akmAdapter } from "../../core/adapter/adapters/akm-adapter";
import { stashDirNames } from "../../core/asset/asset-placement";
import { resolveSecret, type SourceConfigEntry } from "../../core/config/config";
import { ConfigError, UsageError } from "../../core/errors";
import { getRegistryIndexCacheDir } from "../../core/paths";
import { validateGitUrl } from "../../registry/resolve";
import { withFreshnessCache } from "../freshness";
import type { SyncOptions as ProviderSyncOptions, SourceProvider } from "../provider";
import { assertNoIgnoredPathOverwrite, cloneRepo, inspectGitUpstream, runGit } from "./git-install";
import type { SourceLockData, SyncOptions } from "./install-types";
import { sanitizeString } from "./provider-utils";
⋮----
export interface ParsedRepoUrl {
  cloneUrl: string;
  ref: string | null;
  canonicalUrl: string;
}
⋮----
export class GitSourceProvider implements SourceProvider
⋮----
constructor(config: SourceConfigEntry)
⋮----
path(): string
⋮----
async sync(options?: ProviderSyncOptions): Promise<void>
⋮----
function resolveGitContentDir(config: SourceConfigEntry): string
⋮----
export function getCachePaths(
  repoUrl: string,
  cacheRootOverride?: string,
):
⋮----
export async function ensureGitMirror(
  repo: ParsedRepoUrl,
  cachePaths: ReturnType<typeof getCachePaths>,
  options?: { requireRepoDir?: boolean; writable?: boolean; force?: boolean; credential?: string },
): Promise<void>
⋮----
export async function syncMirroredRepo(config: SourceConfigEntry, options?: SyncOptions): Promise<SourceLockData>
⋮----
function pullRepo(repoDir: string, credential?: string): void
⋮----
function hasExtractedRepo(repoDir: string): boolean
⋮----
export function parseGitRepoUrl(rawUrl: string): ParsedRepoUrl
```

## File: src/sources/providers/git-stash.ts
```typescript
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { akmAdapter } from "../../core/adapter/adapters/akm-adapter";
import { stashDirNames } from "../../core/asset/asset-placement";
import { resolveStashDir } from "../../core/common";
import type { AkmConfig, SourceConfigEntry } from "../../core/config/config";
import { getSources, loadConfig, resolveConfiguredSources } from "../../core/config/config";
import { NotFoundError, UsageError } from "../../core/errors";
import { sanitizeCommitMessage } from "../../core/git-message";
import { lockContentRootFor } from "../../integrations/lockfile";
import { runGit } from "./git-install";
import { getCachePaths, parseGitRepoUrl } from "./git-provider";
⋮----
export function isGitBackedStash(stashDir: string): boolean
⋮----
export interface GitPathQueryResult {
  paths: string[];

  ok: boolean;
}
⋮----
export function tryListGitChangedPaths(repoDir: string): GitPathQueryResult
⋮----
export function listGitChangedPaths(repoDir: string): string[]
⋮----
export function tryListGitTrackedPaths(repoDir: string, pathspec?: string): GitPathQueryResult
⋮----
export function tryListGitUnverifiablePaths(repoDir: string, pathspec?: string): GitPathQueryResult
⋮----
export interface GitPathSafetyResult {

  ok: boolean;

  isSafe(repoRelativePath: string): boolean;
}
⋮----
isSafe(repoRelativePath: string): boolean;
⋮----
export function checkGitPathSafety(repoDir: string, pathspec?: string): GitPathSafetyResult
⋮----
export interface SaveGitStashResult {
  committed: boolean;
  pushed: boolean;
  skipped: boolean;
  reason?: string;
  output: string;

  commit?: string;
}
⋮----
export class GitStashPushError extends Error
⋮----
constructor(message: string, commit: string, committedNow = true)
⋮----
export interface GitExactPathState {
  oid: string;
  mode: "100644" | "100755" | "120000";
}
⋮----
export type GitExactPathSnapshots = Record<string, GitExactPathState | null>;
⋮----
export interface SaveGitStashOptions {
  push?: boolean;
  repoDir?: string;
  paths?: string[];
  transactionId?: string;

  expectedSnapshots?: GitExactPathSnapshots;

  body?: string[];
}
⋮----
export type GitExactCommitPoint = "before-update-ref";
⋮----
export function _setGitExactCommitHookForTests(hook?: (point: GitExactCommitPoint) => void): void
⋮----
function gitExactCommitHook(point: GitExactCommitPoint): void
⋮----
export function resolveWritableOverride(config: AkmConfig): true | undefined
⋮----
export function saveGitStash(
  name?: string,
  message?: string,
  writableOverride?: boolean,
  options?: SaveGitStashOptions,
): SaveGitStashResult
⋮----
function readHasRemote(repoDir: string): boolean
⋮----
function pushToUpstream(
  repoDir: string,
  target: { remote: string; mergeRef: string; upstreamHead: string },
  head: string,
  commit: string,
  committedNow = true,
): string
⋮----
function nothingToCommit(repoDir: string, output: string, syncWithRemote: boolean): SaveGitStashResult
⋮----
interface UpstreamConfig {
  remote: string;
  mergeRef: string;
}
⋮----
function readUpstreamConfig(repoDir: string): UpstreamConfig | undefined
⋮----
function isAncestor(repoDir: string, ancestor: string, descendant: string): boolean
⋮----
function integrateUpstream(repoDir: string):
⋮----
function managedFallbackPaths(repoDir: string, changedPaths: string[]): string[]
⋮----
function withoutIgnoredPaths(repoDir: string, paths: string[]): string[]
⋮----
function normalizeExactPaths(repoDir: string, paths: string[]): string[]
⋮----
function runExactPathChunks(
  repoDir: string,
  command: string[],
  paths: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): ReturnType<typeof runGit>[]
⋮----
export function listIgnoredExactPaths(
  repoDir: string,
  paths: string[],
  options: { includeTracked?: boolean } = {},
): string[]
⋮----
export function assertNoIgnoredExactPaths(repoDir: string, paths: string[]): void
⋮----
function readOptionalHead(repoDir: string): string | undefined
⋮----
function readBranchRef(repoDir: string): string
⋮----
function readActualUpstream(
  repoDir: string,
  baseHead: string | undefined,
):
⋮----
interface IndexEntry {
  mode: string;
  oid: string;
  stage: number;
}
⋮----
function readIndexEntries(repoDir: string, paths: string[]): Map<string, IndexEntry[]>
⋮----
function readTreeStates(
  repoDir: string,
  treeish: string | undefined,
  paths: string[],
): Map<string, GitExactPathState | null>
⋮----
function assertIndexMatchesBase(
  paths: string[],
  indexEntries: Map<string, IndexEntry[]>,
  baseStates: Map<string, GitExactPathState | null>,
): void
⋮----
function indexMatchesTree(
  paths: string[],
  indexEntries: Map<string, IndexEntry[]>,
  treeStates: Map<string, GitExactPathState | null>,
): boolean
⋮----
export function reconcileGitExactPathIndex(repoDir: string, baseCommit: string, commit: string, paths: string[]): void
⋮----
function captureWorktreeState(repoDir: string, filePath: string): GitExactPathState | null
⋮----
function samePathState(left: GitExactPathState | null, right: GitExactPathState | null): boolean
⋮----
function assertWorktreeMatchesExpected(
  repoDir: string,
  paths: string[],
  expected: Map<string, GitExactPathState | null>,
): void
⋮----
function sameIndexEntries(left: Map<string, IndexEntry[]>, right: Map<string, IndexEntry[]>): boolean
⋮----
function resetRealIndexPaths(
  repoDir: string,
  commit: string,
  paths: string[],
  initial: Map<string, IndexEntry[]>,
): void
⋮----
function createExactPathCommit(
  repoDir: string,
  options: {
    baseHead?: string;
    commitMessage: string;
    paths: string[];
    transactionId?: string;
    expectedSnapshots?: GitExactPathSnapshots;
  },
): string | null
⋮----
function findSyncStashByTarget(stashes: SourceConfigEntry[], target: string): SourceConfigEntry | undefined
⋮----
function matchesGitStashTarget(stash: SourceConfigEntry, target: string): boolean
⋮----
function buildGithubTargetAliases(canonicalUrl: string): Set<string>
```

## File: src/sources/providers/git.ts
```typescript

```

## File: src/sources/providers/install-types.ts
```typescript
import type { InstallKind } from "../../registry/types";
⋮----
export interface SyncOptions {

  force?: boolean;

  now?: Date;

  writable?: boolean;

  writableRoot?: string;

  writableRequiredRoots?: readonly string[];

  cacheRootDir?: string;

  credential?: string;
}
⋮----
export interface SourceLockData {

  id: string;

  source: InstallKind;

  ref: string;

  artifactUrl: string;

  resolvedVersion?: string;

  resolvedRevision?: string;

  integrity?: string;

  contentDir: string;

  cacheDir: string;

  extractedDir: string;

  writable?: boolean;

  syncedAt: string;
}
```

## File: src/sources/providers/npm.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import type { SourceConfigEntry } from "../../core/config/config";
import { ConfigError, UsageError } from "../../core/errors";
import { getRegistryCacheDir } from "../../core/paths";
import { parseRegistryRef, resolveRegistryArtifact } from "../../registry/resolve";
import type { ParsedNpmRef } from "../../registry/types";
import type { SourceProvider } from "../provider";
import type { SourceLockData, SyncOptions } from "./install-types";
import {
  applyAkmIncludeConfig,
  buildInstallCacheDir,
  computeFileHash,
  detectStashRoot,
  downloadArchive,
  isDirectory,
} from "./provider-utils";
import { extractTarGzSecure, verifyArchiveIntegrity } from "./tar-utils";
⋮----
class NpmSourceProvider implements SourceProvider
⋮----
constructor(config: SourceConfigEntry)
⋮----
path(): string
⋮----
async sync(options?:
⋮----
function npmRefFromConfig(config: SourceConfigEntry): string
⋮----
export async function syncNpmRef(ref: string, options?: SyncOptions): Promise<SourceLockData>
⋮----
async function doSyncNpm(parsed: ParsedNpmRef, options?: SyncOptions): Promise<SourceLockData>
```

## File: src/sources/providers/provider-utils.ts
```typescript
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getAdapters } from "../../core/adapter/registry";
import { stashDirNames } from "../../core/asset/asset-placement";
import type { SourceSpec } from "../../core/config/config";
import { fetchRegistry } from "../../registry/network";
import { writeResponseToFileCapped } from "../../runtime";
import { copyIncludedPaths, findNearestIncludeConfig } from "../include";
⋮----
export function sanitizeString(value: unknown, maxLength = 255): string
⋮----
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — strip control chars from untrusted remote data
⋮----
/**
 * True when ANY built-in adapter's install-time `looksLikeRoot` probe claims
 * `root` — the ordered probe reduced to "is this the root of a bundle
 * of some format family?". A probe that throws (unreadable dir, race) does not
 * claim the root.
 */
function looksLikeAnyBundleRoot(root: string): boolean
⋮----
// a throwing probe does not claim the root — try the next adapter
⋮----
/**
 * Find the directory inside `extractedDir` that should be treated as the
 * bundle/stash root. Probes the top-level dir via the ordered §1.2 registry
 * probe; if nothing claims it, BFS for the shallowest nested candidate.
 */
export function detectStashRoot(extractedDir: string): string
⋮----
// WI-3.1 → wired to the static registry: the top-level root check now routes
// through the ordered §1.2 `looksLikeRoot` probe over ALL built-in adapters
// (`registry.getAdapters()`), not the single hardcoded `akm` probe. This is
// BEHAVIOR-IDENTICAL for akm roots — `akm.looksLikeRoot` reproduces the former
// `.stash`-marker + immediate-stash-subdir (`hasStashDirs`) checks VERBATIM
// (akm-adapter.looksLikeRoot) and `akm` is in the probe set — so those two
// local checks are now subsumed and were removed. It additionally recognizes
// NON-akm bundle roots (okf root index / llm-wiki / `.claude` / …) at the top
// level, which the single-adapter probe missed but the old final `return root`
// fallback also happened to yield. The shallowest-BFS nested-layout discovery
// is unchanged.
⋮----
/** A collision-resistant slug used to isolate cache dirs that lack a stable version. */
function uniqueSlug(): string
⋮----
/**
 * Build a per-source cache directory under `cacheRootDir`.
 *
 * Versioned sources get `${source}-${id}/${version}` for cache reuse;
 * `local` sources get a unique slug so each install is isolated.
 */
export function buildInstallCacheDir(
  cacheRootDir: string,
  source: SourceSpec["type"],
  id: string,
  version?: string,
): string
⋮----
export function installRevisionDir(cacheRootDir: string, contentDir: string): string | undefined
⋮----
/**
 * Apply an `akm.include` config (a `package.json` `akm.include` array — NOT
 * a `.akm-include` dotfile) if any, by copying the selected paths into a
 * sibling `selected/` directory and returning that path. Returns undefined
 * when no include config is found.
 */
export function applyAkmIncludeConfig(
  sourceRoot: string,
  cacheDir: string,
  searchRoot: string = sourceRoot,
): string | undefined
⋮----
export async function downloadArchive(url: string, destination: string): Promise<void>
⋮----
export async function computeFileHash(filePath: string): Promise<string>
⋮----
export function copyDirectoryContents(sourceDir: string, destinationDir: string): void
⋮----
function copyPathWithoutSymlinks(sourcePath: string, destinationPath: string): void
⋮----
export function isDirectory(target: string): boolean
⋮----
function countStashDirs(dirPath: string): number
⋮----
function findShallowestStashRoot(root: string): string | undefined
```

## File: src/sources/providers/sync-from-ref.ts
```typescript
import { UsageError } from "../../core/errors";
import { parseRegistryRef } from "../../registry/resolve";
import type { ParsedLocalRef } from "../../registry/types";
import type { SourceLockData, SyncOptions } from "./install-types";
import { detectStashRoot } from "./provider-utils";
⋮----
export async function syncFromRef(ref: string, options?: SyncOptions): Promise<SourceLockData>
⋮----
function syncLocalRef(parsed: ParsedLocalRef, options?: SyncOptions): SourceLockData
```

## File: src/sources/providers/tar-utils.ts
```typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isWithin } from "../../core/common";
import type { SourceSpec } from "../../core/config/config";
import { warn } from "../../core/warn";
import { spawnSync } from "../../runtime";
⋮----
export function verifyArchiveIntegrity(
  archivePath: string,
  expected: string | undefined,
  source?: SourceSpec["type"],
): void
⋮----
export function extractTarGzSecure(archivePath: string, destinationDir: string): void
⋮----
function scanExtractedFiles(dir: string, root: string): void
⋮----
export function validateTarEntries(listOutput: string): void
```

## File: src/sources/providers/website.ts
```typescript
import type { SourceConfigEntry } from "../../core/config/config";
import { ConfigError } from "../../core/errors";
import type { SourceProvider, SyncOptions } from "../provider";
import { getWebsiteCachePaths, shouldAllowPrivateWebsiteUrlForTests, validateWebsiteUrl } from "../website-url";
⋮----
export interface WebsiteSourceProvider extends SourceProvider {
  readonly kind: "website";
  sync(options?: SyncOptions): Promise<void>;
}
⋮----
sync(options?: SyncOptions): Promise<void>;
⋮----
export function createWebsiteProvider(config: SourceConfigEntry): WebsiteSourceProvider
⋮----
path()
async sync(options?: SyncOptions)
```

## File: src/sources/snapshot-fetchers/bluesky.ts
```typescript
import { isSafeLinkUrl } from "./content-extract";
import { coerceString, escapeMarkdownStructure } from "./fetcher-util";
import { fetchPinnedJson } from "./host-guard";
import type { WikiSnapshotFetcher, WikiSnapshotResult } from "./types";
⋮----
interface BlueskyPost {
  text: string;
  createdAt: string;
  uri: string;
  likeCount: number;
  repostCount: number;
  externalUri: string;
}
⋮----
export function extractBlueskyHandle(url: URL): string | null
⋮----
/** Emit a link only when it is a safe absolute http(s) URL. */
function safeLink(value: string): string
⋮----
function num(value: unknown): number
⋮----
function xrpcJson(url: string, timeoutMs: number, signal?: AbortSignal): Promise<unknown | null>
⋮----
async function resolveHandle(handle: string, timeoutMs: number, signal?: AbortSignal): Promise<string | null>
⋮----
function readPosts(feed: unknown, limit: number): BlueskyPost[]
⋮----
function permalink(handle: string, uri: string): string
⋮----
function renderMarkdown(handle: string, posts: BlueskyPost[]): string
⋮----
matches(url)
async fetch(url, context): Promise<WikiSnapshotResult | null>
```

## File: src/sources/snapshot-fetchers/content-extract.ts
```typescript
import { type HTMLElement, parse } from "node-html-parser";
import TurndownService from "turndown";
import { escapeMarkdownStructure } from "./fetcher-util";
⋮----
function scrubDangerousMarkup(html: string): string
⋮----
function stripDangerousNodes(root: HTMLElement): void
⋮----
function isExplicitlyHidden(node: HTMLElement): boolean
⋮----
function isHiddenRegion(node: HTMLElement): boolean
⋮----
function isInUnwantedRegion(node: HTMLElement): boolean
⋮----
function stripUnwantedNodes(root: HTMLElement, preserveSemanticChrome = false): void
⋮----
function enclosingArticle(node: HTMLElement): HTMLElement | null
⋮----
function hasMatchingAncestor(candidate: HTMLElement, matches: Set<HTMLElement>): boolean
⋮----
export function isSafeLinkUrl(url: URL): boolean
⋮----
function resolveEmittableUrl(raw: string, pageUrl: string): string | null
⋮----
/**
 * Escape characters that would let attacker-controlled text break out of a
 * markdown link/image and start a new one. `alt` and link labels are raw page
 * strings; an alt of `x](javascript:alert(1))` otherwise emits a second,
 * unvalidated destination ahead of the validated `src`.
 */
function escapeMarkdownLabel(value: string): string
⋮----
function markdownDestination(url: string): string
⋮----
function exceedsNestingBudget(html: string): boolean
⋮----
function plainTextFallback(html: string): string
⋮----
/**
 * Select the main-content region of a document and return its HTML.
 *
 * Falls back to `<body>` minus page chrome, then to the whole document, so a
 * page with no semantic markup still yields content rather than nothing.
 */
/**
 * Select the content region from an already-parsed, already-scrubbed root
 * (dangerous nodes removed). Mutates the root when it falls back to `<body>`.
 */
function selectMainContentFromRoot(root: HTMLElement): string
⋮----
// Repeated cards/articles usually form a listing. Let a broader primary
// container (or the body fallback) retain all of them instead of silently
// truncating the page to the first match.
⋮----
// Ignore a region that matched structurally but carries no prose — a
// decorative wrapper should not shadow the real content below it.
⋮----
export function extractMainContentHtml(html: string): string
⋮----
/** Read a fence language off `class="language-ts"` / `class="lang-ts"`. */
function fenceLanguage(className: string): string
⋮----
/**
 * Size a fence so its own content cannot close it. Turndown's default rule
 * does this; the custom rule below must not regress it, or a page can end the
 * fence early and inject forged headings and prose into the snapshot.
 */
function fenceFor(code: string): string
⋮----
function createTurndown(pageUrl: string): TurndownService
⋮----
const tableFor = (node: Node): Element | null =>
const cellsFor = (row: Element): Element[]
const hasUnsupportedSpan = (cell: Element): boolean =>
const isSupportedTable = (table: Element): boolean =>
⋮----
const visit = (node: Node): void =>
⋮----
const isInSupportedTable = (node: Node): boolean =>
⋮----
function escapeResidualMarkup(markdown: string): string
⋮----
function escapeOutsideCodeFences(markdown: string): string
⋮----
function finalizeMarkdown(markdown: string): string
⋮----
function markdownFromRoot(root: HTMLElement, html: string, pageUrl: string): string
⋮----
function collectLinksFromRoot(root: HTMLElement, pageUrl: string): URL[]
⋮----
export function htmlToMarkdown(html: string, pageUrl: string): string
⋮----
export function htmlToMarkdownAndLinks(html: string, pageUrl: string):
```

## File: src/sources/snapshot-fetchers/fetcher-util.ts
```typescript
export function escapeMarkdownStructure(value: string): string
⋮----
export function coerceString(value: unknown): string
⋮----
/**
 * `index` and `log` are OKF reserved structural basenames at every depth — an
 * adapter never indexes them, so an asset written there imports but can never
 * be found by search or show. Remap the trailing segment (`x/index` ->
 * `x/index-content`). Idempotent: a `-content`-suffixed name is left alone.
 */
export function avoidReservedBasename(relPath: string): string
```

## File: src/sources/snapshot-fetchers/github.ts
```typescript
import { GITHUB_API_BASE, githubHeaders } from "../../integrations/github";
import { htmlToMarkdown } from "./content-extract";
import { avoidReservedBasename } from "./fetcher-util";
import { fetchPinnedText } from "./host-guard";
import type { WikiSnapshotFetcher, WikiSnapshotResult } from "./types";
⋮----
export interface GithubRepository {
  owner: string;
  repo: string;
}
⋮----
export function extractGithubRepository(url: URL): GithubRepository | null
⋮----
matches(url)
async fetch(url, context): Promise<WikiSnapshotResult | null>
```

## File: src/sources/snapshot-fetchers/host-guard.ts
```typescript
import { fetchWithRetry, readBodyWithByteCap } from "../../core/common";
import {
  bareHostname,
  classifyNetworkAddress,
  classifyNetworkHostname,
  type HostnameResolver,
  resolveHostnameAddresses,
} from "../../core/network-policy";
⋮----
export interface HostGuardOptions {

  allowPrivateHosts?: boolean;

  resolveHostname?: HostnameResolver;
}
⋮----
export interface GuardedResponse {
  response: Response;
  finalUrl: string;
}
⋮----
export type WebsiteUrlErrorCtor = new (message: string) => Error;
⋮----
export function assertWebsiteRequestUrl(
  rawUrl: string,
  ErrorType: WebsiteUrlErrorCtor = Error,
  options?: HostGuardOptions,
): void
⋮----
export async function assertResolvedHostAllowed(hostname: string, options?: HostGuardOptions): Promise<void>
⋮----
function isForbiddenWebsiteHostname(hostname: string, options?: HostGuardOptions): boolean
⋮----
export function isLoopbackWebsiteHostname(hostname: string): boolean
⋮----
function redirectInit(init: RequestInit, currentUrl: string, nextUrl: string): RequestInit
⋮----
export async function fetchGuardedResponse(
  url: string,
  init: RequestInit,
  opts: { timeoutMs: number; retries?: number } & HostGuardOptions,
  redirectCount = 0,
): Promise<GuardedResponse>
⋮----
export interface PinnedTextOptions {
  headers: HeadersInit;
  byteCap: number;
  bodyTimeoutMs: number;
  timeoutMs: number;
  signal?: AbortSignal;
  retries?: number;
}
⋮----
export type PinnedJsonOptions = PinnedTextOptions;
⋮----
export async function fetchPinnedText(url: string, options: PinnedTextOptions): Promise<string | null>
⋮----
export async function fetchPinnedJson(url: string, options: PinnedJsonOptions): Promise<unknown | null>
```

## File: src/sources/snapshot-fetchers/registry.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { warn } from "../../core/warn";
import blueskyFetcher from "./bluesky";
import githubFetcher from "./github";
import rssFetcher from "./rss";
import type { WikiSnapshotFetcher } from "./types";
import xFetcher from "./x";
import youtubeFetcher from "./youtube";
⋮----
function isWikiSnapshotFetcher(value: unknown): value is WikiSnapshotFetcher
⋮----
export async function loadWikiSnapshotFetchers(stashDir?: string | null): Promise<WikiSnapshotFetcher[]>
```

## File: src/sources/snapshot-fetchers/robots.ts
```typescript
import { warnVerbose } from "../../core/warn";
⋮----
export type RobotsRuleKind = "allow" | "disallow";
⋮----
export interface RobotsPathRule {
  readonly kind: RobotsRuleKind;

  readonly pattern: string;

  readonly specificity: number;
}
⋮----
export interface RobotsRuleSet {

  readonly disallowAll: boolean;
  readonly rules: readonly RobotsPathRule[];

  readonly crawlDelayMs: number | null;
}
⋮----
export type RobotsFetchOutcome =
  | { readonly kind: "body"; readonly text: string }
  | { readonly kind: "unavailable" }
  | { readonly kind: "unreachable" };
⋮----
export type RobotsTxtLoader = (robotsUrl: string) => Promise<RobotsFetchOutcome>;
⋮----
export interface RobotsPolicy {

  rulesFor(url: string): Promise<RobotsRuleSet>;
  isAllowed(url: string): Promise<boolean>;

  crawlDelayMs(url: string): Promise<number>;
}
⋮----
rulesFor(url: string): Promise<RobotsRuleSet>;
isAllowed(url: string): Promise<boolean>;
⋮----
crawlDelayMs(url: string): Promise<number>;
⋮----
interface RobotsGroup {

  agents: string[];
  rules: RobotsPathRule[];

  crawlDelayMsRaw: number | null;
}
⋮----
function stripRobotsComment(line: string): string
⋮----
function parseCrawlDelayMs(raw: string): number | null
⋮----
export function parseRobotsTxt(text: string): RobotsRuleSet
⋮----
interface CompiledRobotsPattern {

  readonly anchored: boolean;

  readonly segments: readonly string[];
}
⋮----
function isUnreservedByte(byte: number): boolean
⋮----
function normalizePercentEncoding(value: string): string
⋮----
function compilePatternSegments(pattern: string): CompiledRobotsPattern
⋮----
function compiledPatternFor(rule: RobotsPathRule): CompiledRobotsPattern
⋮----
function matchesCompiledPattern(compiled: CompiledRobotsPattern, target: string): boolean
⋮----
// No wildcard at all: already a prefix match; anchored additionally
// requires the pattern to consume the whole target.
⋮----
// Greedy-leftmost is safe here: an earlier match of segment i can only
// give segment i+1 MORE room to be found later, never less, since the
// `*` between them absorbs any extra characters. No backtracking needed.
⋮----
/**
 * Pure. `url` is an absolute http(s) URL string. Matching uses
 * `pathname + search` of the parsed URL. Returns true when the URL cannot be
 * parsed (caller has already validated it; do not fail closed on a parse bug).
 */
export function isPathAllowedByRobots(rules: RobotsRuleSet, url: string): boolean
⋮----
return true; // M-32: fail open, never closed, on an unparseable URL.
⋮----
// Normalized the same way `compilePatternSegments` normalizes the rule
// pattern (see `normalizePercentEncoding`'s doc comment) — otherwise a
// percent-encoded alias of a disallowed path (e.g. `/%73ecret/` for a
// `Disallow: /secret/` rule) would never match because `URL.pathname`
// preserves %-escapes verbatim.
⋮----
// Tie goes to Allow (least restrictive) — order-independent: this only
// upgrades a disallow to an allow at equal specificity, never the reverse.
⋮----
function outcomeToRuleSet(outcome: RobotsFetchOutcome): RobotsRuleSet
⋮----
export function createRobotsPolicy(load: RobotsTxtLoader): RobotsPolicy
⋮----
function rulesForOrigin(origin: string): Promise<RobotsRuleSet>
⋮----
export function createAllowAllRobotsPolicy(): RobotsPolicy
```

## File: src/sources/snapshot-fetchers/rss.ts
```typescript
import { XMLParser } from "fast-xml-parser";
import { ResponseTooLargeError, readBodyWithByteCap } from "../../core/common";
import { htmlToMarkdown, isSafeLinkUrl } from "./content-extract";
import { fetchGuardedResponse } from "./host-guard";
import type { WikiSnapshotFetcher, WikiSnapshotResult } from "./types";
⋮----
interface FeedItem {
  title: string;
  link: string;
  date: string;
  summary: string;
}
⋮----
function text(value: unknown): string
⋮----
/**
 * Atom `<content>` may be type="text"/"html" (a #text body) or type="xhtml"
 * (child elements). fast-xml-parser gives the latter as an object with no
 * `#text`, which would otherwise read as an empty summary and silently drop
 * the whole article body.
 */
function atomContent(value: unknown): string
⋮----
const collect = (node: unknown): string =>
⋮----
/** Atom links are attribute-shaped and may repeat with different rels. */
function atomLink(value: unknown): string
⋮----
/**
 * Feed item bodies are attacker-controlled HTML (often inside CDATA or
 * entity-encoded). Route them through the same converter the website path
 * uses so dangerous-block removal and link-scheme policy apply here too — a
 * plain tag-strip keeps `<script>` BODIES and leaks attribute text.
 */
function htmlToPlainText(value: string, baseUrl: string): string
⋮----
/** Collapse whitespace so a value cannot forge markdown structure. */
function singleLine(value: string): string
⋮----
/**
 * Emit a link only when it resolves to a safe http(s) URL. Relative IRIs are
 * valid and common in Atom, so resolve against the feed URL before the scheme
 * check rather than dropping them.
 */
function safeLinkOrEmpty(value: string, baseUrl: string): string
⋮----
function toIsoDate(value: string): string
⋮----
function readRssItems(channel: Record<string, unknown>, limit: number, baseUrl: string): FeedItem[]
⋮----
function readAtomEntries(feed: Record<string, unknown>, limit: number, baseUrl: string): FeedItem[]
⋮----
interface ParsedFeed {
  title: string;
  items: FeedItem[];
}
⋮----
export function parseFeed(
  xml: string,
  limit = DEFAULT_ITEM_LIMIT,
  baseUrl = "https://feed.invalid/",
): ParsedFeed | null
⋮----
function looksLikeFeed(body: string): boolean
⋮----
function slugify(value: string): string
⋮----
function preferredNameFor(url: URL): string
⋮----
function renderMarkdown(feed: ParsedFeed, url: URL): string
⋮----
matches(url)
async fetch(url, context): Promise<WikiSnapshotResult | null>
```

## File: src/sources/snapshot-fetchers/secret-seam.ts
```typescript
import { resolveSecretPath } from "../../core/env-secret-ref";
import { readValue } from "../../core/secret-value";
import type { SecretResolver } from "../provider";
⋮----
export function resolveSecretFromStore(ref: string): string | null
```

## File: src/sources/snapshot-fetchers/types.ts
```typescript
export interface WikiSnapshotResult {
  url: string;
  title: string;
  markdown: string;
  preferredName?: string;
  tags?: string[];
}
⋮----
export type SecretResolveFn = (ref: string) => string | null;
⋮----
export interface FetcherContext {
  stashDir: string;
  timeoutMs: number;
  signal?: AbortSignal;





  allowPrivateHosts?: boolean;











  resolveSecret?: SecretResolveFn;
}
⋮----
export interface WikiSnapshotFetcher {
  name: string;
  matches(url: URL, context: FetcherContext): boolean;
  fetch(url: URL, context: FetcherContext): Promise<WikiSnapshotResult | null>;
}
⋮----
matches(url: URL, context: FetcherContext): boolean;
fetch(url: URL, context: FetcherContext): Promise<WikiSnapshotResult | null>;
```

## File: src/sources/snapshot-fetchers/website-ingest.ts
```typescript
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  fetchWithRetry,
  isWithin,
  ResponseTooLargeError,
  readBodyWithByteCap,
  resolveStashDir,
  todayIso,
} from "../../core/common";
import type { SourceConfigEntry } from "../../core/config/config";
import { ConfigError, UsageError } from "../../core/errors";
import { warn, warnOnce, warnVerbose } from "../../core/warn";
import { withFreshnessCache } from "../freshness";
import { sanitizeString } from "../providers/provider-utils";
import {
  getWebsiteCachePaths,
  normalizeSiteUrl,
  validateWebsiteInputUrl,
  validateWebsiteUrl,
  type WebsiteUrlValidationOptions,
} from "../website-url";
import { htmlToMarkdownAndLinks } from "./content-extract";
import { escapeMarkdownStructure } from "./fetcher-util";
import { assertResolvedHostAllowed, assertWebsiteRequestUrl, type HostnameResolver } from "./host-guard";
import { loadWikiSnapshotFetchers } from "./registry";
import {
  createAllowAllRobotsPolicy,
  createRobotsPolicy,
  isPathAllowedByRobots,
  ROBOTS_BODY_TIMEOUT_MS,
  ROBOTS_BYTE_CAP,
  type RobotsFetchOutcome,
  type RobotsPolicy,
  type RobotsRuleSet,
} from "./robots";
import type { FetcherContext, SecretResolveFn, WikiSnapshotResult } from "./types";
⋮----
export function resolveCrawlTimeoutMs(value: unknown): number | null | undefined
⋮----
interface WebsitePage {
  url: string;
  title: string;
  markdown: string;
}
⋮----
export interface WebsiteMarkdownSnapshot {
  url: string;
  title: string;
  markdown: string;
  preferredName: string;
  content: string;
}
⋮----
export interface FetchSnapshotOptions {
  stashDir?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  allowPrivateHosts?: boolean;

  resolveHostname?: HostnameResolver;






  resolveSecret?: SecretResolveFn;
}
⋮----
interface WebsiteValidationOptions extends WebsiteUrlValidationOptions {










  robots?: RobotsPolicy;






  signal?: AbortSignal;
}
⋮----
function resolveFetcherStashDir(explicitStashDir?: string): string | null
⋮----
export async function ensureWebsiteMirror(
  config: SourceConfigEntry,
  options?: {
    requireStashDir?: boolean;
    force?: boolean;
    allowPrivateHosts?: boolean;








    wallClockCapMs?: number;

    resolveSecret?: SecretResolveFn;
  },
): Promise<ReturnType<typeof getWebsiteCachePaths>>
⋮----
function hasExtractedSite(stashDir: string): boolean
⋮----
async function dispatchSnapshotFetchers(
  parsed: URL,
  context: FetcherContext,
  stashDir?: string | null,
): Promise<WikiSnapshotResult | null>
⋮----
async function fetchSnapshotViaRegistry(
  startUrl: string,
  stashDir: string | null,
  allowPrivateHosts?: boolean,
  resolveSecret?: SecretResolveFn,
): Promise<WikiSnapshotResult | null>
⋮----
// ── Snapshot staging (refresh atomicity, issue #759) ─────────────────────────
⋮----
/**
 * TEST-ONLY crash-window event, fired after each page file of a refresh lands.
 * See {@link _setWebsiteSnapshotWriteHookForTests}.
 */
export interface WebsiteSnapshotWriteEvent {
  point: "page-written";

  index: number;

  total: number;

  relPath: string;
}
⋮----
export function _setWebsiteSnapshotWriteHookForTests(hook?: (event: WebsiteSnapshotWriteEvent) => void): void
⋮----
function snapshotWriteHook(event: WebsiteSnapshotWriteEvent): void
⋮----
interface SnapshotStaging {

  readonly dir: string;

  readonly target: string;
}
⋮----
function snapshotSiblingPrefix(stashDir: string, kind: "staging" | "retired"): string
⋮----
function snapshotSiblingPath(stashDir: string, kind: "staging" | "retired"): string
⋮----
function sweepSnapshotStaging(stashDir: string): void
⋮----
function beginSnapshotStaging(stashDir: string): SnapshotStaging
⋮----
function publishSnapshotStaging(staging: SnapshotStaging): void
⋮----
function discardSnapshotStaging(staging: SnapshotStaging): void
⋮----
function writeSnapshotToStash(stashDir: string, snapshot: WikiSnapshotResult): void
⋮----
async function scrapeWebsiteToStash(
  startUrl: string,
  stashDir: string,
  options: {
    maxPages: number;
    maxDepth: number;
    respectRobots?: boolean;
    allowPrivateHosts?: boolean;
    wallClockCapMs?: number;
    rawStartUrl?: string;
    resolveSecret?: SecretResolveFn;
    fetcherStashDir?: string | null;

    crawlTimeoutMs?: number | null;
  },
): Promise<void>
⋮----
export async function fetchWebsiteMarkdownSnapshot(
  rawUrl: string,
  options?: FetchSnapshotOptions,
): Promise<WebsiteMarkdownSnapshot>
⋮----
function websiteMarkdownSnapshotFromResult(snapshot: WikiSnapshotResult): WebsiteMarkdownSnapshot
⋮----
function sleep(ms: number): Promise<void>
⋮----
async function isCrawlUrlAllowedByRobots(
  robots: RobotsPolicy,
  normalizedUrl: string,
  rawUrl?: string,
): Promise<boolean>
⋮----
function decideRobotsAllowance(
  rules: RobotsRuleSet,
  normalizedUrl: string,
  rawUrl?: string,
):
⋮----
async function resolveCrawlRobotsDecision(
  robots: RobotsPolicy,
  normalizedUrl: string,
  rawUrl?: string,
): Promise<
⋮----
async function assertStartUrlAllowedByRobots(robots: RobotsPolicy, start: URL, rawStartUrl?: string): Promise<void>
⋮----
async function resolveAllowPrivateStartHost(
  start: URL,
  requested: boolean | undefined,
  resolveHostname?: HostnameResolver,
): Promise<boolean>
⋮----
async function crawlWebsite(
  startUrl: string,
  options: {
    maxPages: number;
    maxDepth: number;
    respectRobots?: boolean;
    allowPrivateHosts?: boolean;
    wallClockCapMs?: number;

    crawlTimeoutMs?: number | null;









    rawStartUrl?: string;
  },
): Promise<WebsitePage[]>
⋮----
class RobotsDisallowedRedirectError extends Error
⋮----
constructor(url: string)
⋮----
async function fetchWebsitePage(
  pageUrl: string,
  options?: WebsiteValidationOptions,
): Promise<
⋮----
interface WebsiteResponse {
  response: Response;
  finalUrl: string;
}
⋮----
async function websitePageFromResponse(
  fetched: WebsiteResponse,
  pageUrl: string,
  options?: WebsiteValidationOptions,
): Promise<
⋮----
// Re-check robots.txt against the FINAL (post-redirect) URL, not just the
// pre-redirect URL crawlWebsite already gated. normalizeCrawlUrl strips
// trailing slashes before the initial gate, so a rule shaped like
// `Disallow: /secret/` correctly lets `/secret` through that gate; if the
// server then redirects to `/secret/` (a common trailing-slash
// canonicalization), the disallowed page would otherwise be fetched and
// stored without ever being weighed against robots.txt.
// Checks `rawFinalUrl` (the un-normalized `response.url`, slash intact) as
// well as `finalUrl`, per `isCrawlUrlAllowedByRobots` — `normalizeCrawlUrl`
// would otherwise strip the very trailing slash a `Disallow: /secret/`
// rule needs to match.
⋮----
async function fetchWebsiteResponse(
  pageUrl: string,
  redirectCount = 0,
  options?: WebsiteValidationOptions,
): Promise<WebsiteResponse>
⋮----
export async function loadRobotsTxt(
  robotsUrl: string,
  options?: WebsiteValidationOptions,
): Promise<RobotsFetchOutcome>
⋮----
export function resolveRespectRobots(value: unknown): boolean
⋮----
function buildMarkdownSnapshot(page: WebsitePage, slug: string, tags?: string[]): string
⋮----
/**
 * True for a start URL that names an origin's root (no path, no query).
 * Matches how `extractGithubRepository` restricts its own special-case match
 * to repository-root URLs — the llms.txt probe must not fire for a
 * user-supplied deep link, or `akm bundle add <site>/guides/foo` would
 * silently ingest the whole site's manifest instead of the page requested.
 */
export function isOriginRootUrl(url: URL): boolean
⋮----
export function parseLlmsTxtLinks(text: string, baseUrl: string): URL[]
⋮----
async function fetchLlmsManifest(
  start: URL,
  robots: RobotsPolicy,
  options: { allowPrivateHosts?: boolean; signal?: AbortSignal },
): Promise<
⋮----
function normalizeCrawlUrl(rawUrl: string): string | null
⋮----
/**
 * D-R6: `index.md`/`log.md` are OKF reserved structural filenames at every
 * depth — no adapter indexes them, so a crawled page must never land on one.
 * Same remap convention as the content migration (`index.md` →
 * `index-content.md`). Segments are already lowercased by slugifySegment.
 */
function avoidReservedBasename(relPath: string): string
⋮----
function urlToRelativePath(rawUrl: string): string
⋮----
function deriveImportPath(rawUrl: string): string
⋮----
function slugifySegment(value: string): string
⋮----
function uniqueSlug(base: string, used: Set<string>): string
⋮----
export function resolvePositiveInt(value: unknown, fallback: number, optionName: string): number
⋮----
function looksLikeMarkup(body: string): boolean
⋮----
function plainTextToMarkdown(body: string): string
⋮----
function isAssetLikePath(pathname: string): boolean
⋮----
function stripTags(value: string): string
⋮----
function decodeHtmlEntities(value: string): string
⋮----
function extractHtmlTitle(html: string): string | undefined
⋮----
function extractTextTitle(text: string): string | undefined
⋮----
function safeCodePointToString(value: number): string | undefined
```

## File: src/sources/snapshot-fetchers/x.ts
```typescript
import { parse } from "node-html-parser";
import { ResponseTooLargeError, readBodyWithByteCap } from "../../core/common";
import { warn } from "../../core/warn";
import { avoidReservedBasename, coerceString, escapeMarkdownStructure } from "./fetcher-util";
import { fetchGuardedResponse, fetchPinnedJson } from "./host-guard";
import rssFetcher from "./rss";
import type { FetcherContext, WikiSnapshotFetcher, WikiSnapshotResult } from "./types";
⋮----
export type XResource =
  | { kind: "profile"; username: string }
  | { kind: "status"; postId: string; usernameHint?: string }
  | { kind: "article"; articleId: string };
⋮----
type XContentResource = Exclude<XResource, { kind: "profile" }>;
⋮----
function validXUsername(value: string | undefined): string | null
⋮----
function validXId(value: string | undefined): string | null
⋮----
export function extractXResource(url: URL): XResource | null
⋮----
export function extractXUsername(url: URL): string | null
⋮----
export function resolveXBearerToken(context?: Pick<FetcherContext, "resolveSecret">): string | null
⋮----
interface XTweet {
  id: string;
  text: string;
  createdAt: string;
}
⋮----
interface XPost extends XTweet {
  username: string;
}
⋮----
interface PublicXArticle {
  title: string;
  body: string;
}
⋮----
interface SerializedArticle extends PublicXArticle {
  restId: string;
}
⋮----
interface SerializedPayload {
  source: string;
  code: Uint8Array;
}
⋮----
interface SerializedObject extends SerializedPayload {
  start: number;
  end: number;
}
⋮----
function closesControlCondition(source: string, code: Uint8Array, closeIndex: number): boolean
⋮----
function startsRegexLiteral(source: string, code: Uint8Array, slashIndex: number): boolean
⋮----
function executableCodeMask(source: string): Uint8Array
⋮----
function serializedScriptPayload(html: string): SerializedPayload | null
⋮----
async function xApiJson(url: string, token: string, context: FetcherContext): Promise<Record<string, unknown> | null>
⋮----
async function fetchProfileViaApi(username: string, token: string, context: FetcherContext): Promise<XTweet[] | null>
⋮----
async function fetchPostViaApi(
  postId: string,
  usernameHint: string | undefined,
  token: string,
  context: FetcherContext,
): Promise<XPost | null>
⋮----
function toIsoDate(value: string): string
⋮----
function renderProfileMarkdown(username: string, tweets: XTweet[]): string
⋮----
function readJsonStringAt(value: string, quoteIndex: number):
⋮----
function readSerializedObjectAt(payload: SerializedPayload, openIndex: number): SerializedObject | null
⋮----
function isRelayAssignment(payload: SerializedPayload, assignmentIndex: number): boolean
⋮----
function objectContaining(payload: SerializedPayload, markerIndex: number): SerializedObject | null
⋮----
function topLevelPropertyValueIndexes(object: SerializedObject, property: string): number[]
⋮----
function nextExecutableIndex(object: SerializedObject, from: number): number
⋮----
function topLevelStringProperty(object: SerializedObject, property: string): string
⋮----
function topLevelObjectProperty(object: SerializedObject, property: string): SerializedObject | null
⋮----
function findObjectById(payload: SerializedPayload, id: string): SerializedObject | null
⋮----
function articleFromObject(object: SerializedObject): SerializedArticle | null
⋮----
function referencedObject(
  payload: SerializedPayload,
  object: SerializedObject,
  property: string,
): SerializedObject | null
⋮----
function serializedArticles(payload: SerializedPayload): SerializedArticle[]
⋮----
function articleByRestId(payload: SerializedPayload, articleId: string): SerializedArticle | null
⋮----
export function extractPublicXArticle(
  html: string,
  target?: { postId?: string; articleId?: string },
): PublicXArticle | null
⋮----
function escapeXPlainText(value: string): string
⋮----
function metaContent(root: ReturnType<typeof parse>, name: "og:title" | "og:description"): string
⋮----
function targetFullText(html: string, postId: string): string
⋮----
function publicPostFromHtml(html: string, postId: string, usernameHint?: string): XPost | null
⋮----
async function fetchPublicXHtml(url: URL, context: FetcherContext): Promise<
⋮----
function postSnapshot(post: XPost): WikiSnapshotResult
⋮----
function articleSnapshot(
  article: PublicXArticle,
  resource: XContentResource,
  usernameHint?: string,
): WikiSnapshotResult
⋮----
/** Build the RSS fallback URL from a template containing `{username}`. */
export function buildXRssUrl(template: string | undefined, username: string): URL | null
⋮----
async function fetchProfile(username: string, context: FetcherContext): Promise<WikiSnapshotResult | null>
⋮----
matches(url)
async fetch(url, context): Promise<WikiSnapshotResult | null>
```

## File: src/sources/snapshot-fetchers/youtube.ts
```typescript
import { fetchWithRetry } from "../../core/common";
import type { WikiSnapshotFetcher, WikiSnapshotResult } from "./types";
⋮----
type YoutubeCaptionTrack = {
  baseUrl?: unknown;
  languageCode?: unknown;
  kind?: unknown;
};
⋮----
type YoutubePlayerResponse = {
  videoDetails?: {
    title?: unknown;
    shortDescription?: unknown;
  };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: YoutubeCaptionTrack[];
    };
  };
};
⋮----
function extractVideoId(url: URL): string | null
⋮----
function canonicalWatchUrl(videoId: string): string
⋮----
function decodeEntities(value: string): string
⋮----
const safeFromCodePoint = (codePoint: number, fallback: string) =>
⋮----
function stripTags(value: string): string
⋮----
function extractJsonObjectAfter(marker: string, source: string): string | null
⋮----
function parsePlayerResponse(html: string): YoutubePlayerResponse | null
⋮----
function chooseCaptionTrack(tracks: YoutubeCaptionTrack[]): string | null
⋮----
async function fetchText(url: string, timeoutMs: number, signal?: AbortSignal): Promise<string | null>
⋮----
function parseTranscript(xml: string): string | null
⋮----
async function fetchInnertubeCaptionTracks(
  videoId: string,
  apiKey: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<YoutubeCaptionTrack[]>
⋮----
function extractInnertubeKey(html: string): string
⋮----
matches(url)
async fetch(url, context): Promise<WikiSnapshotResult | null>
⋮----
// Prefer ungated ANDROID InnerTube caption tracks; fall back to the
// (now usually empty) watch-page tracks so a description-only snapshot
// still works when InnerTube is unavailable.
```

## File: src/sources/freshness.ts
```typescript
import fs from "node:fs";
⋮----
export interface FreshnessCacheOptions {

  markerPath: string;

  force?: boolean;




  isUsable?: () => boolean;




  refresh: () => Promise<void>;
}
⋮----
export async function withFreshnessCache(options: FreshnessCacheOptions): Promise<void>
```

## File: src/sources/include.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { isWithin } from "../core/common";
import { warnOnce } from "../core/warn";
⋮----
export interface IncludeConfig {
  baseDir: string;
  include: string[];
}
⋮----
function readPackageJsonAt(dirPath: string): Record<string, unknown> | undefined
⋮----
function extractIncludeList(pkg: Record<string, unknown> | undefined): string[] | undefined
⋮----
export function findNearestIncludeConfig(startDir: string, boundary: string): IncludeConfig | undefined
⋮----
function isIncludeEntryPattern(entry: string): boolean
⋮----
function includeEntryToRegExp(entry: string): RegExp
⋮----
/** A symlink whose lstat succeeds but whose target does not exist — `copyPath` reports this case with its own specific warning. */
function isBrokenSymlink(candidate: string): boolean
⋮----
/** Every path under `dir`, `/`-joined and relative to `base`, without following symlinked directories. */
function listAllRelativePaths(dir: string, base: string): string[]
⋮----
function resolveIncludeEntry(entry: string, sourceDir: string): string[]
⋮----
export function copyIncludedPaths(includeGlobs: string[], sourceDir: string, destDir: string): void
⋮----
function copyDirectoryContents(sourceDir: string, destinationDir: string, containmentRoot: string): void
⋮----
function copyPath(sourcePath: string, destinationPath: string, containmentRoot: string): void
```

## File: src/sources/provider-factory.ts
```typescript
import type { SourceProviderFactory } from "./provider";
import { createFilesystemProvider } from "./providers/filesystem";
import { GitSourceProvider } from "./providers/git-provider";
import { NpmSourceProvider } from "./providers/npm";
import { createWebsiteProvider } from "./providers/website";
⋮----
export function resolveSourceProviderFactory(type: string): SourceProviderFactory | null
```

## File: src/sources/provider.ts
```typescript
import type { SourceConfigEntry } from "../core/config/config";
import type { SourceKind } from "./types";
⋮----
export interface SecretResolver {
  resolveSecret(ref: string): string | null;
}
⋮----
resolveSecret(ref: string): string | null;
⋮----
export interface WebsiteMirrorOptions {
  requireStashDir?: boolean;
  force?: boolean;
  allowPrivateHosts?: boolean;
  resolveSecret?: SecretResolver["resolveSecret"];
}
⋮----
export type EnsureWebsiteMirror = (config: SourceConfigEntry, options?: WebsiteMirrorOptions) => Promise<unknown>;
⋮----
export interface SyncOptions {

  force?: boolean;





  secrets?: SecretResolver;






  ensureWebsiteMirror?: EnsureWebsiteMirror;
}
⋮----
export interface SourceProvider {
  readonly name: string;
  readonly kind: SourceKind;





  path(): string;




  sync?(options?: SyncOptions): Promise<void>;
}
⋮----
path(): string;
⋮----
sync?(options?: SyncOptions): Promise<void>;
⋮----
export type SourceProviderFactory = (config: SourceConfigEntry) => SourceProvider;
```

## File: src/sources/resolve.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { recognizeMatch } from "../core/adapter/recognize-match";
import {
  assetPathForName,
  deriveCanonicalAssetNameFromStashRoot,
  isRelevantAssetFile,
  stashDirFor,
} from "../core/asset/asset-placement";
import { conceptIdFromTypeName } from "../core/asset/resolve-ref";
import { hasErrnoCode, isContainedResolvedPath } from "../core/common";
import { NotFoundError, UsageError } from "../core/errors";
import { walkStashFlat } from "../indexer/walk/walker";
⋮----
export async function resolveAssetPath(stashDir: string, type: string, name: string): Promise<string>
⋮----
function resolveInTypeDir(stashDir: string, typeDir: string, type: string, name: string): string
⋮----
function resolveAndValidateTypeRoot(root: string, type: string, name: string): void
⋮----
function readTypeRootStat(root: string, type: string, name: string): fs.Stats
⋮----
async function resolveByCanonicalName(stashDir: string, type: string, name: string): Promise<string | undefined>
```

## File: src/sources/types.ts
```typescript
import type { TargetRow } from "../commands/targets";
import type { OkfProvenance } from "../core/adapter/types";
import type { MarkdownTocEntry } from "../core/asset/markdown";
import type { StashEntryScope } from "../indexer/passes/metadata";
import type { SemanticSearchRuntimeStatus } from "../indexer/walk/index-context";
import type { InstalledBundle, InstallKind } from "../registry/types";
import type { WorkflowExec as ProgramExecCore } from "../workflows/plan";
⋮----
export type AkmSearchType = string;
export type SearchSource = "local" | "registry" | "all";
export type SearchHitSize = "small" | "medium" | "large";
export type BeliefFilterMode = "all" | "current" | "historical";
⋮----
export interface RecallOptions {

  filters?: StashEntryScope;

  belief?: BeliefFilterMode;
  type?: string;
  source?: SearchSource | string;
}
⋮----
export type SearchExecutionMode = "semantic" | "keyword" | "fts-fallback";
export type FragmentContextMode = "exact" | "lead";
⋮----
export interface FragmentProvenance {

  selectedRef?: string;

  parentRef?: string;

  fragmentOrdinal?: number;
  fragmentCount?: number;

  startLine?: number;
  endLine?: number;
  previousRef?: string;
  nextRef?: string;
  fragmentChars?: number;
  fragmentEstimatedTokens?: number;
  parentChars?: number;
  parentEstimatedTokens?: number;
}
⋮----
export interface SourceSearchHit {
  type: string;
  name: string;
  path: string;
  ref: string;
  origin?: string | null;

  keys?: string[];

  editable?: boolean;

  editHint?: string;
  description?: string;
  tags?: string[];
  size?: SearchHitSize;
  action?: string;
  score?: number;
  whyMatched?: string[];
  run?: string;





  estimatedTokens?: number;





  warnings?: string[];






  quality?: string;
  beliefState?: string;
  currentBeliefRefs?: string[];














  expandTo?: string;
}
⋮----
export interface RegistrySearchResultHit {
  type: "registry";
  name: string;
  id: string;
  description?: string;
  tags?: string[];
  action?: string;

  installRef?: string;
  score?: number;
  whyMatched?: string[];

  registryName?: string;





  warnings?: string[];
}
⋮----
export type SearchHit = SourceSearchHit | RegistrySearchResultHit;
⋮----
export interface SearchResponse {
  schemaVersion: number;
  bundleDir: string;
  source: SearchSource;
  hits: SearchHit[];
  registryHits?: RegistrySearchResultHit[];
  tip?: string;
  warnings?: string[];

  searchMode?: SearchExecutionMode;

  timing?: { totalMs: number; rankMs?: number; embedMs?: number };
}
⋮----
export interface WorkflowParameter {
  name: string;
  description?: string;
}
⋮----
export interface WorkflowStepOrchestrationSummary {
  engine?: string;
  model?: string;
  timeoutMs?: number | null;










  exec?: ProgramExecCore;
  fanOut?: { over: string; concurrency?: number; reducer?: string };
  hasSchema?: boolean;
  env?: string[];

  workflow?: string;





  refs?: WorkflowStepRef[];

  unresolved?: Array<Pick<WorkflowStepRef, "ref" | "in">>;
}
⋮----
export interface WorkflowStepRef {

  ref: string;

  resolved: string;
  in: "argv" | "cwd" | "env" | "workflow";
}
⋮----
export interface WorkflowStepDefinition {
  id: string;
  title: string;
  instructions: string;
  completionCriteria?: string[];
  sequenceIndex?: number;

  orchestration?: WorkflowStepOrchestrationSummary;
}
⋮----
export type WorkflowRunStatus = "active" | "completed" | "blocked" | "failed";
export type WorkflowRunStepStatus = "pending" | "completed" | "blocked" | "failed" | "skipped";
⋮----
export interface WorkflowRunStepState extends WorkflowStepDefinition {
  status: WorkflowRunStepStatus;
  notes?: string;
  evidence?: Record<string, unknown>;

  summary?: string;
  completedAt?: string | null;
}
⋮----
export interface WorkflowRunSummary {
  id: string;
  workflowRef: string;
  workflowEntryId?: number | null;
  workflowTitle: string;
  status: WorkflowRunStatus;
  currentStepId?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  params?: Record<string, unknown>;

  agentHarness?: string | null;

  agentSessionId?: string | null;

  planIrVersion?: number | null;





  outputs?: Record<string, unknown>;

  parentRunId?: string;

  spawnedByUnitId?: string;
}
⋮----
export interface AddResponse {
  schemaVersion: number;
  bundleDir: string;
  ref: string;

  bundleId: string;

  registryId?: string;

  installed?: {
    id: string;
    source: InstallKind;
    ref: string;
    artifactUrl: string;
    resolvedVersion?: string;
    resolvedRevision?: string;
    stashRoot: string;
    cacheDir: string;
    extractedDir: string;
    installedAt: string;
  };

  sourceAdded?:
    | {
        type: "filesystem";
        path: string;
        name?: string;
        stashRoot: string;
      }
    | {
        type: "website";
        url: string;
        name?: string;
        stashRoot: string;
      };
  config: {
    sourceCount: number;
  };
  index: {
    mode: "full" | "incremental";
    totalEntries: number;
    directoriesScanned: number;
    directoriesSkipped: number;
    warnings?: string[];
  };
}
⋮----
export interface SourceInstallStatus extends InstalledBundle {
  extractedDir: string;
}
⋮----
export type SourceKind = "filesystem" | "git" | "npm" | "website";
⋮----
export interface SourceDescriptor {
  kind: "path" | "git" | "npm" | "website";
  locator: string;
  maxPages?: number;
}
⋮----
export interface SourceLock {
  source: InstallKind;
  ref: string;
  resolvedVersion?: string;
  resolvedRevision?: string;
  integrity?: string;
  localRoot?: string;
  manifestDigest?: string;
  adapterIds?: string[];
  installedAt?: string;
}
⋮----
export interface SourceComponent {
  name: string;
  root?: string;

  adapter?: string;

  detected?: boolean;
  writable?: boolean;
}
⋮----
export interface SourceEntry {
  name: string;
  kind: SourceKind;
  default: boolean;
  source: SourceDescriptor;
  path?: string;
  ref?: string;
  provider?: string;
  version?: string;
  writable: boolean;
  registryId?: string;
  components: SourceComponent[];
  lock: SourceLock | null;
  itemCount: number;
  byType: Record<string, number>;
  status: { exists: boolean };
}
⋮----
export interface SourceListResponse {
  schemaVersion: number;
  bundleDir: string;
  defaultBundle: string | null;
  sources: SourceEntry[];
  totalSources: number;
}
⋮----
export interface RemoveResponse {
  schemaVersion: number;
  bundleDir: string;
  target: string;
  removed: {
    id: string;
    source: string;
    ref: string;
    cacheDir: string;
    stashRoot: string;
  };
  config: {
    sourceCount: number;
  };
  index: {
    mode: "full" | "incremental";
    totalEntries: number;
    directoriesScanned: number;
    directoriesSkipped: number;
  };
}
⋮----
export interface UpdateResultItem {
  id: string;
  source: InstallKind;
  ref: string;
  previous: {
    resolvedVersion?: string;
    resolvedRevision?: string;
    cacheDir: string;
  };
  installed: SourceInstallStatus;
  changed: {
    version: boolean;
    revision: boolean;
    any: boolean;
  };
}
⋮----
export interface UpdatePlainSyncedItem {
  id: string;
  kind: "filesystem" | "git" | "website";
  ref: string;
}
⋮----
export interface UpdateSkippedItem {
  id: string;
  kind: SourceKind;

  status?: "failed" | "skipped";

  code?: string;
  reason: string;
}
⋮----
export interface UpdateResponse {
  schemaVersion: number;
  bundleDir: string;
  target?: string;
  all: boolean;
  processed: UpdateResultItem[];

  plainSynced?: UpdatePlainSyncedItem[];

  skipped?: UpdateSkippedItem[];
  config: {
    sourceCount: number;
  };
  index: {
    mode: "full" | "incremental";
    totalEntries: number;
    directoriesScanned: number;
    directoriesSkipped: number;

    scanComplete?: boolean;









    semanticStatus?: "disabled" | SemanticSearchRuntimeStatus;
  };
}
⋮----
export type ShowDetailLevel = "brief" | "summary" | "normal" | "full";
⋮----
export interface ShowLinkGroup {
  total: number;
  refs: string[];
}
⋮----
export interface ShowResponse extends FragmentProvenance {
  beliefState?: string;

  evidence?: string;
  evidenceSources?: string[];
  provenance?: OkfProvenance;
  schemaVersion?: number;
  type: string;
  name: string;
  path: string;

  ref?: string;
  content?: string;
  template?: string;
  prompt?: string;





  toc?: MarkdownTocEntry[];
  description?: string;
  tags?: string[];
  modelHint?: string;

  agent?: string;

  run?: string;

  setup?: string;

  cwd?: string;
  origin?: string | null;
  action?: string;
  parameters?: string[];
  workflowTitle?: string;
  workflowParameters?: WorkflowParameter[];
  steps?: WorkflowStepDefinition[];

  editable?: boolean;

  editHint?: string;





  keys?: string[];







  links?: {
    outgoing?: Record<string, ShowLinkGroup>;
    incoming?: Record<string, ShowLinkGroup>;
    unresolved?: Record<string, ShowLinkGroup>;
  };

  contextMode?: FragmentContextMode;

  contextMaxChars?: number;

  contextTruncated?: boolean;
}
⋮----
export type PluginHarness = "claude-code" | "codex" | "opencode" | "opencode-v2";
⋮----
export interface PluginUpgradeEntry {
  harness: PluginHarness;
  outcome: "updated" | "current" | "skipped" | "deferred" | "failed" | "pending" | "unknown";
  from?: string;
  to?: string;
  message?: string;
}
⋮----
export interface UpgradeLockstep {
  plugin: "akm-opencode" | "akm-opencode-v2";

  pinnedVersion: string | null;
  newestVersion: string;
  heldBack: boolean;

  reason?: string;
}
⋮----
export type UpgradeChannel = "latest" | "next";
⋮----
export interface UpgradeCheckResponse {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  installMethod: "binary" | "bun" | "npm" | "pnpm" | "package-local" | "unknown";

  channel?: UpgradeChannel;
  lockstep?: UpgradeLockstep;

  plugins?: PluginUpgradeEntry[];
}
⋮----
export interface UpgradeResponse {
  currentVersion: string;
  newVersion: string;
  upgraded: boolean;
  installMethod: "binary" | "bun" | "npm" | "pnpm" | "package-local" | "unknown";
  binaryPath?: string;
  checksumVerified?: boolean;
  message?: string;




  postUpgrade?: {
    ok: boolean;
    skipped: boolean;
    exitCode?: number | null;
    message: string;
  };





  migration?: { status: "current" | "ready" | "blocked" | "failed"; error?: string } & Record<string, unknown>;

  channel?: UpgradeChannel;
  lockstep?: UpgradeLockstep;

  plugins?: PluginUpgradeEntry[];
}
⋮----
export interface InfoResponse {
  schemaVersion: number;
  version: string;

  bundleDir: string;

  defaultBundle: string | null;








  configError?: string;








  bundleDirError?: string;







  dataDir: string;
  configDir: string;
  cacheDir: string;
  stateDir: string;
  assetTypes: string[];
  searchModes: string[];
  semanticSearch: {
    mode: "off" | "auto";

    status: "disabled" | "pending" | "ready-js";
  };
  registries: Array<{ url: string; name?: string; provider?: string; enabled?: boolean }>;





  connectionsAndHarnesses: TargetRow[];
  sourceProviders: Array<{ type: string; name?: string; path?: string; url?: string; enabled?: boolean }>;
  indexStats: {
    entryCount: number;

    byType: Record<string, number>;




    links?: Record<string, { total: number; unresolved: number }>;
    lastBuiltAt: string | null;
    hasEmbeddings: boolean;








    unreadable?: string;










    unavailable?: string;
  };
}
```

## File: src/sources/website-url.ts
```typescript
import { createHash } from "node:crypto";
import path from "node:path";
import { ConfigError, UsageError } from "../core/errors";
import { classifyNetworkHostname } from "../core/network-policy";
import { getRegistryIndexCacheDir } from "../core/paths";
import { warnOnce } from "../core/warn";
import { assertWebsiteRequestUrl, type HostnameResolver } from "./snapshot-fetchers/host-guard";
⋮----
export interface WebsiteUrlValidationOptions {
  allowPrivateHosts?: boolean;

  resolveHostname?: HostnameResolver;
}
⋮----
export interface WebsiteCachePaths {
  rootDir: string;
  stashDir: string;
  manifestPath: string;
}
⋮----
export function shouldAllowPrivateWebsiteHostsForTests(): boolean
⋮----
export function shouldAllowPrivateWebsiteUrlForTests(rawUrl: string): boolean
⋮----
export function getWebsiteCachePaths(siteUrl: string): WebsiteCachePaths
⋮----
export function validateWebsiteUrl(rawUrl: string, options?: WebsiteUrlValidationOptions): string
⋮----
export function validateWebsiteInputUrl(rawUrl: string, options?: WebsiteUrlValidationOptions): string
⋮----
function validateWebsiteUrlWithError(
  rawUrl: string,
  ErrorType: typeof ConfigError | typeof UsageError,
  options?: WebsiteUrlValidationOptions,
): string
⋮----
export function normalizeSiteUrl(rawUrl: string): string
```
