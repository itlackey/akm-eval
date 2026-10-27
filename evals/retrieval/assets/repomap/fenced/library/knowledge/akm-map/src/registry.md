---
description: "Repo map of akm src/registry at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  registry/
    providers/
      index.ts
      skills-sh.ts
      static-index.ts
      types.ts
    factory.ts
    network.ts
    origin-resolve.ts
    resolve.ts
    semver.ts
    types.ts
```

# Files

## File: src/registry/providers/index.ts
```typescript

```

## File: src/registry/providers/skills-sh.ts
```typescript
import type { RegistryConfigEntry } from "../../core/config/config";
import {
  formatRegistryCredentialWarning,
  formatRegistryError,
  formatRegistryLabel,
  hasRegistryUrlCredentials,
} from "../../core/registry-url";
import { md5Hex } from "../../runtime";
import { fetchCachedJson } from "../../storage/repositories/registry-index-cache-repository";
import { registerRegistryProvider } from "../factory";
import { fetchRegistryJson } from "../network";
import type { RegistrySearchHit } from "../types";
import type { RegistryProvider, RegistryProviderResult, RegistryProviderSearchOptions } from "./types";
⋮----
interface SkillsShEntry {
  id: string;
  name: string;
  installs: number;
  source: string;
}
⋮----
class SkillsShProvider implements RegistryProvider
⋮----
constructor(config: RegistryConfigEntry)
⋮----
async search(options: RegistryProviderSearchOptions): Promise<RegistryProviderResult>
⋮----
private async fetchSkills(query: string, limit: number): Promise<SkillsShEntry[]>
⋮----
// A fresh hit returns even an empty array; a stale fallback only when
// non-empty. Corrupt cache JSON is swallowed and treated as a miss.
⋮----
private mapToHits(entries: SkillsShEntry[]): RegistrySearchHit[]
⋮----
// Assign decreasing synthetic scores for merge compatibility
⋮----
private queryDbCacheKey(query: string, limit: number): string
⋮----
function parseSkillsResponse(data: unknown): SkillsShEntry[]
⋮----
function isValidSkillsEntry(entry: unknown): entry is SkillsShEntry
```

## File: src/registry/providers/static-index.ts
```typescript
import type { RegistryConfigEntry } from "../../core/config/config";
import { NotFoundError } from "../../core/errors";
import {
  formatRegistryCredentialWarning,
  formatRegistryError,
  formatRegistryLabel,
  hasRegistryUrlCredentials,
} from "../../core/registry-url";
import { warnOnce } from "../../core/warn";
import { asString } from "../../integrations/github";
import { fetchCachedJson } from "../../storage/repositories/registry-index-cache-repository";
import { registerRegistryProvider } from "../factory";
import { fetchRegistryJson } from "../network";
import { buildInstallRef } from "../resolve";
import type { InstallKind, RegistryAssetEntry, RegistrySearchHit } from "../types";
import type { RegistryProvider, RegistryProviderResult, RegistryProviderSearchOptions } from "./types";
⋮----
export interface RegistryIndex {

  version?: number;
  updatedAt?: string;
  stashes: RegistryBundleEntry[];
}
⋮----
export interface RegistryBundleEntry {
  id: string;
  name: string;
  description?: string;
  ref: string;
  source: "npm" | "github" | "git" | "local";
  homepage?: string;
  tags?: string[];
  assetTypes?: string[];
  assets?: RegistryAssetEntry[];
  author?: string;
  license?: string;
  latestVersion?: string;
}
⋮----
class StaticIndexProvider implements RegistryProvider
⋮----
constructor(config: RegistryConfigEntry)
⋮----
async search(options: RegistryProviderSearchOptions): Promise<RegistryProviderResult>
⋮----
private async loadBundles(warnings: string[]): Promise<Array<
⋮----
async function loadIndex(entry: RegistryConfigEntry): Promise<RegistryIndex | null>
⋮----
export function parseRegistryIndex(data: unknown): RegistryIndex | null
⋮----
function parseBundleEntry(raw: unknown): RegistryBundleEntry | null
⋮----
function scoreBundles(
  stashes: Array<{ stash: RegistryBundleEntry; registryName?: string }>,
  query: string,
  limit: number,
): RegistrySearchHit[]
⋮----
function scoreStash(stash: RegistryBundleEntry, tokens: string[]): number
⋮----
// Exact name match is strongest signal
⋮----
// Tag matches are high-signal (curated keywords)
⋮----
// Description substring
⋮----
// Author match
⋮----
// Normalize by token count so multi-word queries don't inflate scores
⋮----
function toSearchHit(stash: RegistryBundleEntry, score: number, registryName?: string): RegistrySearchHit
⋮----
function parseAssets(raw: unknown): RegistryAssetEntry[] | undefined
⋮----
function parseAssetEntry(raw: unknown): RegistryAssetEntry | null
⋮----
function asSource(value: unknown): InstallKind | undefined
⋮----
function asStringArray(value: unknown): string[] | undefined
```

## File: src/registry/providers/types.ts
```typescript
import type { RegistryConfigEntry } from "../../core/config/config";
import type { RegistrySearchHit } from "../types";
⋮----
export interface RegistryProviderSearchOptions {
  query: string;

  limit: number;
}
⋮----
export interface RegistryProviderResult {
  hits: RegistrySearchHit[];
  warnings?: string[];
}
⋮----
export interface RegistryProvider {

  readonly type: string;





  search(options: RegistryProviderSearchOptions): Promise<RegistryProviderResult>;
}
⋮----
search(options: RegistryProviderSearchOptions): Promise<RegistryProviderResult>;
⋮----
export type RegistryProviderFactory = (config: RegistryConfigEntry) => RegistryProvider;
```

## File: src/registry/factory.ts
```typescript
import type { RegistryProviderFactory } from "./providers/types";
⋮----
export function registerRegistryProvider(type: string, factory: RegistryProviderFactory): void
⋮----
export function resolveRegistryProviderFactory(type: string): RegistryProviderFactory | null
⋮----
export function unregisterRegistryProvider(type: string): void
```

## File: src/registry/network.ts
```typescript
import {
  abortableDelay,
  backoffDelay,
  computeRetryDelay,
  jsonWithByteCap,
  ResponseTooLargeError,
  shouldRetry,
  toErrorMessage,
} from "../core/common";
import { ConfigError, NotFoundError, TransientError } from "../core/errors";
import { formatRegistryUrl } from "../core/registry-url";
⋮----
export interface FetchRegistryOptions {
  headers?: HeadersInit;

  timeoutMs?: number;

  retries?: number;

  signal?: AbortSignal;
}
⋮----
export async function fetchRegistry(rawUrl: string, options: FetchRegistryOptions =
⋮----
export async function fetchRegistryJson<T = unknown>(
  rawUrl: string,
  options: FetchRegistryOptions & { maxBytes?: number } = {},
): Promise<T>
⋮----
function parseRegistryUrl(rawUrl: string): URL
⋮----
function statusError(status: number, rawUrl: string): NotFoundError | TransientError
⋮----
async function cancelBody(response: Response): Promise<void>
```

## File: src/registry/origin-resolve.ts
```typescript
import path from "node:path";
import { isBundleSlug } from "../core/asset/asset-ref";
import { deriveInstallations } from "../indexer/installations";
import type { SearchSource } from "../indexer/search/search-source";
import { parseRegistryRef } from "./resolve";
⋮----
export function resolveSourcesForOrigin(origin: string | undefined, allSources: SearchSource[]): SearchSource[]
⋮----
export function resolveSourcesForLocator(locator: string, allSources: SearchSource[]): SearchSource[]
⋮----
export function isRemoteOrigin(origin: string, allSources: SearchSource[]): boolean
```

## File: src/registry/resolve.ts
```typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ConfigError, NotFoundError, UsageError } from "../core/errors";
import { asRecord, asString, GITHUB_API_BASE, githubHeaders } from "../integrations/github";
import { fetchRegistryJson } from "./network";
import { isExactSemver, isSemverRange, maxSatisfying } from "./semver";
import type {
  InstallKind,
  ParsedGithubRef,
  ParsedGitRef,
  ParsedLocalRef,
  ParsedNpmRef,
  ParsedRegistryRef,
  ResolvedRegistryArtifact,
} from "./types";
⋮----
export function gitCredentialEnvironment(credential?: string): NodeJS.ProcessEnv
⋮----
export function validateGitUrl(url: string): void
⋮----
export function validateGitRef(ref: string): void
⋮----
export function parseRegistryRef(rawRef: string): ParsedRegistryRef
⋮----
export function buildInstallRef(
  source: InstallKind,
  ref: string,
  provenance: "operator" | "registry" = "operator",
): string
⋮----
function detectRegistrySearchId(ref: string): string | undefined
⋮----
export async function resolveRegistryArtifact(
  parsed: ParsedRegistryRef,
  options?: { gitCredential?: string },
): Promise<ResolvedRegistryArtifact>
⋮----
function parseNpmRef(input: string, originalRef: string): ParsedNpmRef
⋮----
function parseGithubShorthand(input: string, originalRef: string): ParsedGithubRef
⋮----
function parseRemoteUrl(rawUrl: string): ParsedGithubRef | ParsedGitRef
⋮----
function parseGithubUrl(url: URL, rawUrl: string): ParsedGithubRef
⋮----
function parseGitUrl(input: string, originalRef: string): ParsedGitRef
⋮----
function tryParseLocalRef(rawRef: string, explicitPath: boolean): ParsedLocalRef | undefined
⋮----
function isPathLikeRef(ref: string): boolean
⋮----
// R-007: a bare `owner/repo` (or `owner/repo#ref`) shorthand is ambiguous
// with a relative directory of the same shape, and is never an EXPLICIT
// local path the way `./owner/repo` is. Treating it as non-path here means
// `tryParseLocalRef` silently returns `undefined` (rather than throwing
// NotFoundError) when no such directory exists on disk, letting
// `parseRegistryRef`'s GitHub-shorthand fallback run instead. A directory
// that DOES exist with this shape is unaffected — `tryParseLocalRef`
// resolves it before the missing-path distinction ever matters.
⋮----
/** Default public npm registry host. */
⋮----
export function validateNpmTarballUrl(tarballUrl: string, packageRef: string, registryOrigin?: string): void
⋮----
function npmMetadataRegistry(): string
⋮----
async function resolveNpmArtifact(parsed: ParsedNpmRef): Promise<ResolvedRegistryArtifact>
⋮----
async function resolveGithubArtifact(parsed: ParsedGithubRef, credential?: string): Promise<ResolvedRegistryArtifact>
⋮----
function resolveGitRevisionFromRemote(url: string, requestedRef?: string, credential?: string): string | undefined
⋮----
async function resolveGitArtifact(parsed: ParsedGitRef, credential?: string): Promise<ResolvedRegistryArtifact>
⋮----
async function resolveLocalArtifact(parsed: ParsedLocalRef): Promise<ResolvedRegistryArtifact>
⋮----
function splitNpmNameAndVersion(input: string):
⋮----
function validateNpmPackageName(name: string): void
⋮----
function looksLikeGithubOwnerRepo(ref: string): boolean
⋮----
function splitRefSuffix(value: string): [string, string | undefined]
⋮----
/**
 * Strip the `git+` transport prefix from a ref, returning the inner URL.
 * Handles `git+https://...`, `git+ssh://...`, `git+http://...`, etc.
 */
function stripGitTransport(ref: string): string
⋮----
return ref.slice(4); // strip "git+"
⋮----
/**
 * Convert a `file:` URI to a local filesystem path.
 *
 * Standard `file:///absolute` forms are handled by Node's `fileURLToPath`.
 * Non-standard `file:./relative` and `file:../relative` shorthand forms
 * (not a valid RFC 8089 URL) are handled with a custom fallback.
 */
function fileUriToPath(ref: string): string
⋮----
function toReadableLocalId(absolutePath: string): string
⋮----
function findGitRepoRoot(startDir: string): string | undefined
⋮----
function readGitValue(repoRoot: string, ...args: string[]): string | undefined
⋮----
async function fetchJson<T>(url: string, headers: HeadersInit | undefined): Promise<T>
⋮----
async function tryFetchJson<T>(url: string, headers: HeadersInit | undefined): Promise<T | null>
```

## File: src/registry/semver.ts
```typescript
import semver from "semver";
⋮----
export function isExactSemver(version: string): boolean
⋮----
export function isSemverRange(input: string): boolean
⋮----
export function maxSatisfying(versions: string[], range: string): string | undefined
⋮----
export function satisfiesRange(version: string, range: string): boolean
```

## File: src/registry/types.ts
```typescript
export type InstallKind = ParsedRegistryRef["source"];
⋮----
export interface RegistryRefBase {
  source: InstallKind;
  ref: string;
  id: string;
}
⋮----
export interface ParsedNpmRef extends RegistryRefBase {
  source: "npm";
  packageName: string;
  requestedVersionOrTag?: string;
}
⋮----
export interface ParsedGithubRef extends RegistryRefBase {
  source: "github";
  owner: string;
  repo: string;
  requestedRef?: string;
}
⋮----
export interface ParsedGitRef extends RegistryRefBase {
  source: "git";
  url: string;
  requestedRef?: string;
}
⋮----
export interface ParsedLocalRef extends RegistryRefBase {
  source: "local";
  repoRoot?: string;
  sourcePath: string;
}
⋮----
export type ParsedRegistryRef = ParsedNpmRef | ParsedGithubRef | ParsedGitRef | ParsedLocalRef;
⋮----
export interface ResolvedRegistryArtifact {
  id: string;
  source: InstallKind;
  ref: string;
  artifactUrl: string;
  resolvedVersion?: string;
  resolvedRevision?: string;
}
⋮----
export interface InstalledBundle {
  id: string;
  source: InstallKind;
  ref: string;
  resolvedVersion?: string;
  resolvedRevision?: string;
  artifactUrl: string;
  stashRoot: string;
  cacheDir: string;
  installedAt: string;
  writable?: boolean;
}
⋮----
export interface RegistryAssetEntry {
  type: string;
  name: string;
  description?: string;
  tags?: string[];
  estimatedTokens?: number;
}
⋮----
export interface RegistrySearchHit {
  source: InstallKind;
  id: string;
  title: string;
  description?: string;
  ref: string;

  installRef: string;
  homepage?: string;








  score?: number;
  metadata?: Record<string, string>;

  registryName?: string;





  warnings?: string[];
}
⋮----
export interface RegistrySearchResponse {
  query: string;
  hits: RegistrySearchHit[];
  warnings: string[];
}
```
