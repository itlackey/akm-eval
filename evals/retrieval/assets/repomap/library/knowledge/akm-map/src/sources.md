---
description: "Repo map of akm src/sources at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/sources

## src/sources/

### src/sources/freshness.ts

- `export interface FreshnessCacheOptions`
- `export async function withFreshnessCache(options: FreshnessCacheOptions): Promise<void>`

### src/sources/include.ts

- `export interface IncludeConfig`
- `function readPackageJsonAt(dirPath: string): Record<string, unknown> | undefined`
- `function extractIncludeList(pkg: Record<string, unknown> | undefined): string[] | undefined`
- `export function findNearestIncludeConfig(startDir: string, boundary: string): IncludeConfig | undefined`
- `function isIncludeEntryPattern(entry: string): boolean`
- `function includeEntryToRegExp(entry: string): RegExp`
- `function isBrokenSymlink(candidate: string): boolean`
- `function listAllRelativePaths(dir: string, base: string): string[]`
- `function resolveIncludeEntry(entry: string, sourceDir: string): string[]`
- `export function copyIncludedPaths(includeGlobs: string[], sourceDir: string, destDir: string): void`
- `function copyDirectoryContents(sourceDir: string, destinationDir: string, containmentRoot: string): void`
- `function copyPath(sourcePath: string, destinationPath: string, containmentRoot: string): void`

### src/sources/provider-factory.ts

- `export function resolveSourceProviderFactory(type: string): SourceProviderFactory | null`

### src/sources/provider.ts

- `export interface SecretResolver`
- `export interface WebsiteMirrorOptions`
- `export type EnsureWebsiteMirror = (config: SourceConfigEntry, options?: WebsiteMirrorOptions) => Promise<unknown>;`
- `export interface SyncOptions`
- `export interface SourceProvider`
- `export type SourceProviderFactory = (config: SourceConfigEntry) => SourceProvider;`

### src/sources/resolve.ts

- `export async function resolveAssetPath(stashDir: string, type: string, name: string): Promise<string>`
- `function resolveInTypeDir(stashDir: string, typeDir: string, type: string, name: string): string`
- `function resolveAndValidateTypeRoot(root: string, type: string, name: string): void`
- `function readTypeRootStat(root: string, type: string, name: string): fs.Stats`
- `async function resolveByCanonicalName(stashDir: string, type: string, name: string): Promise<string | undefined>`

### src/sources/types.ts

- `export type AkmSearchType = string;`
- `export type SearchSource = "local" | "registry" | "all";`
- `export type SearchHitSize = "small" | "medium" | "large";`
- `export type BeliefFilterMode = "all" | "current" | "historical";`
- `export interface RecallOptions`
- `export type SearchExecutionMode = "semantic" | "keyword" | "fts-fallback";`
- `export type FragmentContextMode = "exact" | "lead";`
- `export interface FragmentProvenance`
- `export interface SourceSearchHit`
- `export interface RegistrySearchResultHit`
- `export type SearchHit = SourceSearchHit | RegistrySearchResultHit;`
- `export interface SearchResponse`
- `export interface WorkflowParameter`
- `export interface WorkflowStepOrchestrationSummary`
- `export interface WorkflowStepRef`
- `export interface WorkflowStepDefinition`
- `export type WorkflowRunStatus = "active" | "completed" | "blocked" | "failed";`
- `export type WorkflowRunStepStatus = "pending" | "completed" | "blocked" | "failed" | "skipped";`
- `export interface WorkflowRunStepState extends WorkflowStepDefinition`
- `export interface WorkflowRunSummary`
- `export interface AddResponse`
- `export interface SourceInstallStatus extends InstalledBundle`
- `export type SourceKind = "filesystem" | "git" | "npm" | "website";`
- `export interface SourceDescriptor`
- `export interface SourceLock`
- `export interface SourceComponent`
- `export interface SourceEntry`
- `export interface SourceListResponse`
- `export interface RemoveResponse`
- `export interface UpdateResultItem`
- `export interface UpdatePlainSyncedItem`
- `export interface UpdateSkippedItem`
- `export interface UpdateResponse`
- `export type ShowDetailLevel = "brief" | "summary" | "normal" | "full";`
- `export interface ShowLinkGroup`
- `export interface ShowResponse extends FragmentProvenance`
- `export type PluginHarness = "claude-code" | "codex" | "opencode" | "opencode-v2";`
- `export interface PluginUpgradeEntry`
- `export interface UpgradeLockstep`
- `export type UpgradeChannel = "latest" | "next";`
- `export interface UpgradeCheckResponse`
- `export interface UpgradeResponse`
- `export interface InfoResponse`

### src/sources/website-url.ts

- `export interface WebsiteUrlValidationOptions`
- `export interface WebsiteCachePaths`
- `export function shouldAllowPrivateWebsiteHostsForTests(): boolean`
- `export function shouldAllowPrivateWebsiteUrlForTests(rawUrl: string): boolean`
- `export function getWebsiteCachePaths(siteUrl: string): WebsiteCachePaths`
- `export function validateWebsiteUrl(rawUrl: string, options?: WebsiteUrlValidationOptions): string`
- `export function validateWebsiteInputUrl(rawUrl: string, options?: WebsiteUrlValidationOptions): string`
- `function validateWebsiteUrlWithError`
- `export function normalizeSiteUrl(rawUrl: string): string`

## src/sources/providers/

### src/sources/providers/filesystem.ts

- `export function createFilesystemProvider(entry: SourceConfigEntry): SourceProvider`

### src/sources/providers/git-install.ts

- `export function runGit`
- `export interface GitUpstreamState`
- `export function inspectGitUpstream(repoDir: string, credential?: string): GitUpstreamState`
- `export function verifyClonedRevision(cloneDir: string, url: string, expectedRevision: string | undefined): void`
- `function gitRelation(repoDir: string, target: string):`
- `export function assertNoIgnoredPathOverwrite(repoDir: string, targetRevision: string): void`
- `function isCommitSha(ref: string): boolean`
- `function normalizeRemoteUrl(value: string): string`
- `export function replaceDirectory(stagedDir: string, destination: string): void`
- `export async function syncGitRef(ref: string, options?: SyncOptions): Promise<SourceLockData>`
- `async function doSyncGit(parsed: ParsedGitRef, options?: SyncOptions): Promise<SourceLockData>`
- `export function syncExistingWritableCheckout`
- `export function cloneRepo`
- `export function classifyCloneFailure`
- `function redactUrlUserinfo(text: string): string`

### src/sources/providers/git-provider.ts

- `export interface ParsedRepoUrl`
- `export class GitSourceProvider implements SourceProvider`
- `function resolveGitContentDir(config: SourceConfigEntry): string`
- `export function getCachePaths`
- `export async function ensureGitMirror`
- `export async function syncMirroredRepo(config: SourceConfigEntry, options?: SyncOptions): Promise<SourceLockData>`
- `function pullRepo(repoDir: string, credential?: string): void`
- `function hasExtractedRepo(repoDir: string): boolean`
- `export function parseGitRepoUrl(rawUrl: string): ParsedRepoUrl`

### src/sources/providers/git-stash.ts

- `export function isGitBackedStash(stashDir: string): boolean`
- `export interface GitPathQueryResult`
- `export function tryListGitChangedPaths(repoDir: string): GitPathQueryResult`
- `export function listGitChangedPaths(repoDir: string): string[]`
- `export function tryListGitTrackedPaths(repoDir: string, pathspec?: string): GitPathQueryResult`
- `export function tryListGitUnverifiablePaths(repoDir: string, pathspec?: string): GitPathQueryResult`
- `export interface GitPathSafetyResult`
- `export function checkGitPathSafety(repoDir: string, pathspec?: string): GitPathSafetyResult`
- `export interface SaveGitStashResult`
- `export class GitStashPushError extends Error`
- `export interface GitExactPathState`
- `export type GitExactPathSnapshots = Record<string, GitExactPathState | null>;`
- `export interface SaveGitStashOptions`
- `export type GitExactCommitPoint = "before-update-ref";`
- `export function _setGitExactCommitHookForTests(hook?: (point: GitExactCommitPoint) => void): void`
- `function gitExactCommitHook(point: GitExactCommitPoint): void`
- `export function resolveWritableOverride(config: AkmConfig): true | undefined`
- `export function saveGitStash`
- `function readHasRemote(repoDir: string): boolean`
- `function pushToUpstream`
- `function nothingToCommit(repoDir: string, output: string, syncWithRemote: boolean): SaveGitStashResult`
- `interface UpstreamConfig`
- `function readUpstreamConfig(repoDir: string): UpstreamConfig | undefined`
- `function isAncestor(repoDir: string, ancestor: string, descendant: string): boolean`
- `function integrateUpstream(repoDir: string):`
- `function managedFallbackPaths(repoDir: string, changedPaths: string[]): string[]`
- `function withoutIgnoredPaths(repoDir: string, paths: string[]): string[]`
- `function normalizeExactPaths(repoDir: string, paths: string[]): string[]`
- `function runExactPathChunks`
- `export function listIgnoredExactPaths`
- `export function assertNoIgnoredExactPaths(repoDir: string, paths: string[]): void`
- `function readOptionalHead(repoDir: string): string | undefined`
- `function readBranchRef(repoDir: string): string`
- `function readActualUpstream`
- `interface IndexEntry`
- `function readIndexEntries(repoDir: string, paths: string[]): Map<string, IndexEntry[]>`
- `function readTreeStates`
- `function assertIndexMatchesBase`
- `function indexMatchesTree`
- `export function reconcileGitExactPathIndex(repoDir: string, baseCommit: string, commit: string, paths: string[]): void`
- `function captureWorktreeState(repoDir: string, filePath: string): GitExactPathState | null`
- `function samePathState(left: GitExactPathState | null, right: GitExactPathState | null): boolean`
- `function assertWorktreeMatchesExpected`
- `function sameIndexEntries(left: Map<string, IndexEntry[]>, right: Map<string, IndexEntry[]>): boolean`
- `function resetRealIndexPaths`
- `function createExactPathCommit`
- `function findSyncStashByTarget(stashes: SourceConfigEntry[], target: string): SourceConfigEntry | undefined`
- `function matchesGitStashTarget(stash: SourceConfigEntry, target: string): boolean`
- `function buildGithubTargetAliases(canonicalUrl: string): Set<string>`

### src/sources/providers/git.ts

### src/sources/providers/install-types.ts

- `export interface SyncOptions`
- `export interface SourceLockData`

### src/sources/providers/npm.ts

- `class NpmSourceProvider implements SourceProvider`
- `function npmRefFromConfig(config: SourceConfigEntry): string`
- `export async function syncNpmRef(ref: string, options?: SyncOptions): Promise<SourceLockData>`
- `async function doSyncNpm(parsed: ParsedNpmRef, options?: SyncOptions): Promise<SourceLockData>`

### src/sources/providers/provider-utils.ts

- `export function sanitizeString(value: unknown, maxLength = 255): string`
- `function looksLikeAnyBundleRoot(root: string): boolean`
- `export function detectStashRoot(extractedDir: string): string`
- `function uniqueSlug(): string`
- `export function buildInstallCacheDir`
- `export function installRevisionDir(cacheRootDir: string, contentDir: string): string | undefined`
- `export function applyAkmIncludeConfig`
- `export async function downloadArchive(url: string, destination: string): Promise<void>`
- `export async function computeFileHash(filePath: string): Promise<string>`
- `export function copyDirectoryContents(sourceDir: string, destinationDir: string): void`
- `function copyPathWithoutSymlinks(sourcePath: string, destinationPath: string): void`
- `export function isDirectory(target: string): boolean`
- `function countStashDirs(dirPath: string): number`
- `function findShallowestStashRoot(root: string): string | undefined`

### src/sources/providers/sync-from-ref.ts

- `export async function syncFromRef(ref: string, options?: SyncOptions): Promise<SourceLockData>`
- `function syncLocalRef(parsed: ParsedLocalRef, options?: SyncOptions): SourceLockData`

### src/sources/providers/tar-utils.ts

- `export function verifyArchiveIntegrity`
- `export function extractTarGzSecure(archivePath: string, destinationDir: string): void`
- `function scanExtractedFiles(dir: string, root: string): void`
- `export function validateTarEntries(listOutput: string): void`

### src/sources/providers/website.ts

- `export interface WebsiteSourceProvider extends SourceProvider`
- `export function createWebsiteProvider(config: SourceConfigEntry): WebsiteSourceProvider`

## src/sources/snapshot-fetchers/

### src/sources/snapshot-fetchers/bluesky.ts

- `interface BlueskyPost`
- `export function extractBlueskyHandle(url: URL): string | null`
- `function safeLink(value: string): string`
- `function num(value: unknown): number`
- `function xrpcJson(url: string, timeoutMs: number, signal?: AbortSignal): Promise<unknown | null>`
- `async function resolveHandle(handle: string, timeoutMs: number, signal?: AbortSignal): Promise<string | null>`
- `function readPosts(feed: unknown, limit: number): BlueskyPost[]`
- `function permalink(handle: string, uri: string): string`
- `function renderMarkdown(handle: string, posts: BlueskyPost[]): string`

### src/sources/snapshot-fetchers/content-extract.ts

- `function scrubDangerousMarkup(html: string): string`
- `function stripDangerousNodes(root: HTMLElement): void`
- `function isExplicitlyHidden(node: HTMLElement): boolean`
- `function isHiddenRegion(node: HTMLElement): boolean`
- `function isInUnwantedRegion(node: HTMLElement): boolean`
- `function stripUnwantedNodes(root: HTMLElement, preserveSemanticChrome = false): void`
- `function enclosingArticle(node: HTMLElement): HTMLElement | null`
- `function hasMatchingAncestor(candidate: HTMLElement, matches: Set<HTMLElement>): boolean`
- `export function isSafeLinkUrl(url: URL): boolean`
- `function resolveEmittableUrl(raw: string, pageUrl: string): string | null`
- `function escapeMarkdownLabel(value: string): string`
- `function markdownDestination(url: string): string`
- `function exceedsNestingBudget(html: string): boolean`
- `function plainTextFallback(html: string): string`
- `function selectMainContentFromRoot(root: HTMLElement): string`
- `export function extractMainContentHtml(html: string): string`
- `function fenceLanguage(className: string): string`
- `function fenceFor(code: string): string`
- `function createTurndown(pageUrl: string): TurndownService`
- `const tableFor = (node: Node): Element | null =>`
- `const cellsFor = (row: Element): Element[]`
- `const hasUnsupportedSpan = (cell: Element): boolean =>`
- `const isSupportedTable = (table: Element): boolean =>`
- `const visit = (node: Node): void =>`
- `const isInSupportedTable = (node: Node): boolean =>`
- `function escapeResidualMarkup(markdown: string): string`
- `function escapeOutsideCodeFences(markdown: string): string`
- `function finalizeMarkdown(markdown: string): string`
- `function markdownFromRoot(root: HTMLElement, html: string, pageUrl: string): string`
- `function collectLinksFromRoot(root: HTMLElement, pageUrl: string): URL[]`
- `export function htmlToMarkdown(html: string, pageUrl: string): string`
- `export function htmlToMarkdownAndLinks(html: string, pageUrl: string):`

### src/sources/snapshot-fetchers/fetcher-util.ts

- `export function escapeMarkdownStructure(value: string): string`
- `export function coerceString(value: unknown): string`
- `export function avoidReservedBasename(relPath: string): string`

### src/sources/snapshot-fetchers/github.ts

- `export interface GithubRepository`
- `export function extractGithubRepository(url: URL): GithubRepository | null`

### src/sources/snapshot-fetchers/host-guard.ts

- `export interface HostGuardOptions`
- `export interface GuardedResponse`
- `export type WebsiteUrlErrorCtor = new (message: string) => Error;`
- `export function assertWebsiteRequestUrl`
- `export async function assertResolvedHostAllowed(hostname: string, options?: HostGuardOptions): Promise<void>`
- `function isForbiddenWebsiteHostname(hostname: string, options?: HostGuardOptions): boolean`
- `export function isLoopbackWebsiteHostname(hostname: string): boolean`
- `function redirectInit(init: RequestInit, currentUrl: string, nextUrl: string): RequestInit`
- `export async function fetchGuardedResponse`
- `export interface PinnedTextOptions`
- `export type PinnedJsonOptions = PinnedTextOptions;`
- `export async function fetchPinnedText(url: string, options: PinnedTextOptions): Promise<string | null>`
- `export async function fetchPinnedJson(url: string, options: PinnedJsonOptions): Promise<unknown | null>`

### src/sources/snapshot-fetchers/registry.ts

- `function isWikiSnapshotFetcher(value: unknown): value is WikiSnapshotFetcher`
- `export async function loadWikiSnapshotFetchers(stashDir?: string | null): Promise<WikiSnapshotFetcher[]>`

### src/sources/snapshot-fetchers/robots.ts

- `export type RobotsRuleKind = "allow" | "disallow";`
- `export interface RobotsPathRule`
- `export interface RobotsRuleSet`
- `export type RobotsFetchOutcome`
- `export type RobotsTxtLoader = (robotsUrl: string) => Promise<RobotsFetchOutcome>;`
- `export interface RobotsPolicy`
- `interface RobotsGroup`
- `function stripRobotsComment(line: string): string`
- `function parseCrawlDelayMs(raw: string): number | null`
- `export function parseRobotsTxt(text: string): RobotsRuleSet`
- `interface CompiledRobotsPattern`
- `function isUnreservedByte(byte: number): boolean`
- `function normalizePercentEncoding(value: string): string`
- `function compilePatternSegments(pattern: string): CompiledRobotsPattern`
- `function compiledPatternFor(rule: RobotsPathRule): CompiledRobotsPattern`
- `function matchesCompiledPattern(compiled: CompiledRobotsPattern, target: string): boolean`
- `export function isPathAllowedByRobots(rules: RobotsRuleSet, url: string): boolean`
- `function outcomeToRuleSet(outcome: RobotsFetchOutcome): RobotsRuleSet`
- `export function createRobotsPolicy(load: RobotsTxtLoader): RobotsPolicy`
- `function rulesForOrigin(origin: string): Promise<RobotsRuleSet>`
- `export function createAllowAllRobotsPolicy(): RobotsPolicy`

### src/sources/snapshot-fetchers/rss.ts

- `interface FeedItem`
- `function text(value: unknown): string`
- `function atomContent(value: unknown): string`
- `const collect = (node: unknown): string =>`
- `function atomLink(value: unknown): string`
- `function htmlToPlainText(value: string, baseUrl: string): string`
- `function singleLine(value: string): string`
- `function safeLinkOrEmpty(value: string, baseUrl: string): string`
- `function toIsoDate(value: string): string`
- `function readRssItems(channel: Record<string, unknown>, limit: number, baseUrl: string): FeedItem[]`
- `function readAtomEntries(feed: Record<string, unknown>, limit: number, baseUrl: string): FeedItem[]`
- `interface ParsedFeed`
- `export function parseFeed`
- `function looksLikeFeed(body: string): boolean`
- `function slugify(value: string): string`
- `function preferredNameFor(url: URL): string`
- `function renderMarkdown(feed: ParsedFeed, url: URL): string`

### src/sources/snapshot-fetchers/secret-seam.ts

- `export function resolveSecretFromStore(ref: string): string | null`

### src/sources/snapshot-fetchers/types.ts

- `export interface WikiSnapshotResult`
- `export type SecretResolveFn = (ref: string) => string | null;`
- `export interface FetcherContext`
- `export interface WikiSnapshotFetcher`

### src/sources/snapshot-fetchers/website-ingest.ts

- `export function resolveCrawlTimeoutMs(value: unknown): number | null | undefined`
- `interface WebsitePage`
- `export interface WebsiteMarkdownSnapshot`
- `export interface FetchSnapshotOptions`
- `interface WebsiteValidationOptions extends WebsiteUrlValidationOptions`
- `function resolveFetcherStashDir(explicitStashDir?: string): string | null`
- `export async function ensureWebsiteMirror`
- `function hasExtractedSite(stashDir: string): boolean`
- `async function dispatchSnapshotFetchers`
- `async function fetchSnapshotViaRegistry`
- `export interface WebsiteSnapshotWriteEvent`
- `export function _setWebsiteSnapshotWriteHookForTests(hook?: (event: WebsiteSnapshotWriteEvent) => void): void`
- `function snapshotWriteHook(event: WebsiteSnapshotWriteEvent): void`
- `interface SnapshotStaging`
- `function snapshotSiblingPrefix(stashDir: string, kind: "staging" | "retired"): string`
- `function snapshotSiblingPath(stashDir: string, kind: "staging" | "retired"): string`
- `function sweepSnapshotStaging(stashDir: string): void`
- `function beginSnapshotStaging(stashDir: string): SnapshotStaging`
- `function publishSnapshotStaging(staging: SnapshotStaging): void`
- `function discardSnapshotStaging(staging: SnapshotStaging): void`
- `function writeSnapshotToStash(stashDir: string, snapshot: WikiSnapshotResult): void`
- `async function scrapeWebsiteToStash`
- `export async function fetchWebsiteMarkdownSnapshot`
- `function websiteMarkdownSnapshotFromResult(snapshot: WikiSnapshotResult): WebsiteMarkdownSnapshot`
- `function sleep(ms: number): Promise<void>`
- `async function isCrawlUrlAllowedByRobots`
- `function decideRobotsAllowance`
- `async function resolveCrawlRobotsDecision`
- `async function assertStartUrlAllowedByRobots(robots: RobotsPolicy, start: URL, rawStartUrl?: string): Promise<void>`
- `async function resolveAllowPrivateStartHost`
- `async function crawlWebsite`
- `class RobotsDisallowedRedirectError extends Error`
- `async function fetchWebsitePage`
- `interface WebsiteResponse`
- `async function websitePageFromResponse`
- `async function fetchWebsiteResponse`
- `export async function loadRobotsTxt`
- `export function resolveRespectRobots(value: unknown): boolean`
- `function buildMarkdownSnapshot(page: WebsitePage, slug: string, tags?: string[]): string`
- `export function isOriginRootUrl(url: URL): boolean`
- `export function parseLlmsTxtLinks(text: string, baseUrl: string): URL[]`
- `async function fetchLlmsManifest`
- `function normalizeCrawlUrl(rawUrl: string): string | null`
- `function avoidReservedBasename(relPath: string): string`
- `function urlToRelativePath(rawUrl: string): string`
- `function deriveImportPath(rawUrl: string): string`
- `function slugifySegment(value: string): string`
- `function uniqueSlug(base: string, used: Set<string>): string`
- `export function resolvePositiveInt(value: unknown, fallback: number, optionName: string): number`
- `function looksLikeMarkup(body: string): boolean`
- `function plainTextToMarkdown(body: string): string`
- `function isAssetLikePath(pathname: string): boolean`
- `function stripTags(value: string): string`
- `function decodeHtmlEntities(value: string): string`
- `function extractHtmlTitle(html: string): string | undefined`
- `function extractTextTitle(text: string): string | undefined`
- `function safeCodePointToString(value: number): string | undefined`

### src/sources/snapshot-fetchers/x.ts

- `export type XResource`
- `type XContentResource = Exclude<XResource, { kind: "profile" }>;`
- `function validXUsername(value: string | undefined): string | null`
- `function validXId(value: string | undefined): string | null`
- `export function extractXResource(url: URL): XResource | null`
- `export function extractXUsername(url: URL): string | null`
- `export function resolveXBearerToken(context?: Pick<FetcherContext, "resolveSecret">): string | null`
- `interface XTweet`
- `interface XPost extends XTweet`
- `interface PublicXArticle`
- `interface SerializedArticle extends PublicXArticle`
- `interface SerializedPayload`
- `interface SerializedObject extends SerializedPayload`
- `function closesControlCondition(source: string, code: Uint8Array, closeIndex: number): boolean`
- `function startsRegexLiteral(source: string, code: Uint8Array, slashIndex: number): boolean`
- `function executableCodeMask(source: string): Uint8Array`
- `function serializedScriptPayload(html: string): SerializedPayload | null`
- `async function xApiJson(url: string, token: string, context: FetcherContext): Promise<Record<string, unknown> | null>`
- `async function fetchProfileViaApi(username: string, token: string, context: FetcherContext): Promise<XTweet[] | null>`
- `async function fetchPostViaApi`
- `function toIsoDate(value: string): string`
- `function renderProfileMarkdown(username: string, tweets: XTweet[]): string`
- `function readJsonStringAt(value: string, quoteIndex: number):`
- `function readSerializedObjectAt(payload: SerializedPayload, openIndex: number): SerializedObject | null`
- `function isRelayAssignment(payload: SerializedPayload, assignmentIndex: number): boolean`
- `function objectContaining(payload: SerializedPayload, markerIndex: number): SerializedObject | null`
- `function topLevelPropertyValueIndexes(object: SerializedObject, property: string): number[]`
- `function nextExecutableIndex(object: SerializedObject, from: number): number`
- `function topLevelStringProperty(object: SerializedObject, property: string): string`
- `function topLevelObjectProperty(object: SerializedObject, property: string): SerializedObject | null`
- `function findObjectById(payload: SerializedPayload, id: string): SerializedObject | null`
- `function articleFromObject(object: SerializedObject): SerializedArticle | null`
- `function referencedObject`
- `function serializedArticles(payload: SerializedPayload): SerializedArticle[]`
- `function articleByRestId(payload: SerializedPayload, articleId: string): SerializedArticle | null`
- `export function extractPublicXArticle`
- `function escapeXPlainText(value: string): string`
- `function metaContent(root: ReturnType<typeof parse>, name: "og:title" | "og:description"): string`
- `function targetFullText(html: string, postId: string): string`
- `function publicPostFromHtml(html: string, postId: string, usernameHint?: string): XPost | null`
- `async function fetchPublicXHtml(url: URL, context: FetcherContext): Promise<`
- `function postSnapshot(post: XPost): WikiSnapshotResult`
- `function articleSnapshot`
- `export function buildXRssUrl(template: string | undefined, username: string): URL | null`
- `async function fetchProfile(username: string, context: FetcherContext): Promise<WikiSnapshotResult | null>`

### src/sources/snapshot-fetchers/youtube.ts

- `type YoutubeCaptionTrack =`
- `type YoutubePlayerResponse =`
- `function extractVideoId(url: URL): string | null`
- `function canonicalWatchUrl(videoId: string): string`
- `function decodeEntities(value: string): string`
- `const safeFromCodePoint = (codePoint: number, fallback: string) =>`
- `function stripTags(value: string): string`
- `function extractJsonObjectAfter(marker: string, source: string): string | null`
- `function parsePlayerResponse(html: string): YoutubePlayerResponse | null`
- `function chooseCaptionTrack(tracks: YoutubeCaptionTrack[]): string | null`
- `async function fetchText(url: string, timeoutMs: number, signal?: AbortSignal): Promise<string | null>`
- `function parseTranscript(xml: string): string | null`
- `async function fetchInnertubeCaptionTracks`
- `function extractInnertubeKey(html: string): string`
