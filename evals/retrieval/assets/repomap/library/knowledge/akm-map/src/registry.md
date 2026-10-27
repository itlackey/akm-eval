---
description: "Repo map of akm src/registry at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/registry

## src/registry/

### src/registry/factory.ts

- `export function registerRegistryProvider(type: string, factory: RegistryProviderFactory): void`
- `export function resolveRegistryProviderFactory(type: string): RegistryProviderFactory | null`
- `export function unregisterRegistryProvider(type: string): void`

### src/registry/network.ts

- `export interface FetchRegistryOptions`
- `export async function fetchRegistry(rawUrl: string, options: FetchRegistryOptions`
- `export async function fetchRegistryJson<T = unknown>`
- `function parseRegistryUrl(rawUrl: string): URL`
- `function statusError(status: number, rawUrl: string): NotFoundError | TransientError`
- `async function cancelBody(response: Response): Promise<void>`

### src/registry/origin-resolve.ts

- `export function resolveSourcesForOrigin(origin: string | undefined, allSources: SearchSource[]): SearchSource[]`
- `export function resolveSourcesForLocator(locator: string, allSources: SearchSource[]): SearchSource[]`
- `export function isRemoteOrigin(origin: string, allSources: SearchSource[]): boolean`

### src/registry/resolve.ts

- `export function gitCredentialEnvironment(credential?: string): NodeJS.ProcessEnv`
- `export function validateGitUrl(url: string): void`
- `export function validateGitRef(ref: string): void`
- `export function parseRegistryRef(rawRef: string): ParsedRegistryRef`
- `export function buildInstallRef`
- `function detectRegistrySearchId(ref: string): string | undefined`
- `export async function resolveRegistryArtifact`
- `function parseNpmRef(input: string, originalRef: string): ParsedNpmRef`
- `function parseGithubShorthand(input: string, originalRef: string): ParsedGithubRef`
- `function parseRemoteUrl(rawUrl: string): ParsedGithubRef | ParsedGitRef`
- `function parseGithubUrl(url: URL, rawUrl: string): ParsedGithubRef`
- `function parseGitUrl(input: string, originalRef: string): ParsedGitRef`
- `function tryParseLocalRef(rawRef: string, explicitPath: boolean): ParsedLocalRef | undefined`
- `function isPathLikeRef(ref: string): boolean`
- `export function validateNpmTarballUrl(tarballUrl: string, packageRef: string, registryOrigin?: string): void`
- `function npmMetadataRegistry(): string`
- `async function resolveNpmArtifact(parsed: ParsedNpmRef): Promise<ResolvedRegistryArtifact>`
- `async function resolveGithubArtifact(parsed: ParsedGithubRef, credential?: string): Promise<ResolvedRegistryArtifact>`
- `function resolveGitRevisionFromRemote(url: string, requestedRef?: string, credential?: string): string | undefined`
- `async function resolveGitArtifact(parsed: ParsedGitRef, credential?: string): Promise<ResolvedRegistryArtifact>`
- `async function resolveLocalArtifact(parsed: ParsedLocalRef): Promise<ResolvedRegistryArtifact>`
- `function splitNpmNameAndVersion(input: string):`
- `function validateNpmPackageName(name: string): void`
- `function looksLikeGithubOwnerRepo(ref: string): boolean`
- `function splitRefSuffix(value: string): [string, string | undefined]`
- `function stripGitTransport(ref: string): string`
- `function fileUriToPath(ref: string): string`
- `function toReadableLocalId(absolutePath: string): string`
- `function findGitRepoRoot(startDir: string): string | undefined`
- `function readGitValue(repoRoot: string, ...args: string[]): string | undefined`
- `async function fetchJson<T>(url: string, headers: HeadersInit | undefined): Promise<T>`
- `async function tryFetchJson<T>(url: string, headers: HeadersInit | undefined): Promise<T | null>`

### src/registry/semver.ts

- `export function isExactSemver(version: string): boolean`
- `export function isSemverRange(input: string): boolean`
- `export function maxSatisfying(versions: string[], range: string): string | undefined`
- `export function satisfiesRange(version: string, range: string): boolean`

### src/registry/types.ts

- `export type InstallKind = ParsedRegistryRef["source"];`
- `export interface RegistryRefBase`
- `export interface ParsedNpmRef extends RegistryRefBase`
- `export interface ParsedGithubRef extends RegistryRefBase`
- `export interface ParsedGitRef extends RegistryRefBase`
- `export interface ParsedLocalRef extends RegistryRefBase`
- `export type ParsedRegistryRef = ParsedNpmRef | ParsedGithubRef | ParsedGitRef | ParsedLocalRef;`
- `export interface ResolvedRegistryArtifact`
- `export interface InstalledBundle`
- `export interface RegistryAssetEntry`
- `export interface RegistrySearchHit`
- `export interface RegistrySearchResponse`

## src/registry/providers/

### src/registry/providers/index.ts

### src/registry/providers/skills-sh.ts

- `interface SkillsShEntry`
- `class SkillsShProvider implements RegistryProvider`
- `function parseSkillsResponse(data: unknown): SkillsShEntry[]`
- `function isValidSkillsEntry(entry: unknown): entry is SkillsShEntry`

### src/registry/providers/static-index.ts

- `export interface RegistryIndex`
- `export interface RegistryBundleEntry`
- `class StaticIndexProvider implements RegistryProvider`
- `async function loadIndex(entry: RegistryConfigEntry): Promise<RegistryIndex | null>`
- `export function parseRegistryIndex(data: unknown): RegistryIndex | null`
- `function parseBundleEntry(raw: unknown): RegistryBundleEntry | null`
- `function scoreBundles`
- `function scoreStash(stash: RegistryBundleEntry, tokens: string[]): number`
- `function toSearchHit(stash: RegistryBundleEntry, score: number, registryName?: string): RegistrySearchHit`
- `function parseAssets(raw: unknown): RegistryAssetEntry[] | undefined`
- `function parseAssetEntry(raw: unknown): RegistryAssetEntry | null`
- `function asSource(value: unknown): InstallKind | undefined`
- `function asStringArray(value: unknown): string[] | undefined`

### src/registry/providers/types.ts

- `export interface RegistryProviderSearchOptions`
- `export interface RegistryProviderResult`
- `export interface RegistryProvider`
- `export type RegistryProviderFactory = (config: RegistryConfigEntry) => RegistryProvider;`
