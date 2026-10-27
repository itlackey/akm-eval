---
description: "Repo map of akm src/setup at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/setup

## src/setup/

### src/setup/detect.ts

- `export interface AgentPlatform`
- `interface DetectOverridesForTests`
- `export function _setDetectForTests(fakes?: DetectOverridesForTests): void`
- `export function detectAgentPlatforms(): AgentPlatform[]`
- `export interface LocalServerResult`
- `export async function probeLocalEndpoint(baseUrl: string, label: string, timeoutMs = 2000): Promise<LocalServerResult>`
- `export async function detectLocalServers(): Promise<LocalServerResult[]>`
- `export interface StashDirSuggestion`
- `export function detectStashDir(opts?:`
- `const push = (p: string, reason: string, rank: number): void =>`
- `function findGitRepoRoot(start: string): string | undefined`
- `export interface InstalledHarness`
- `export function detectInstalledHarnesses(whichFn: WhichFn = defaultWhich): InstalledHarness[]`
- `export interface DetectedEnvironment`
- `export async function detectEnvironment(opts?:`
- `export function renderDetectionSummary(env: DetectedEnvironment): string`

### src/setup/endpoint.ts

- `export function normalizeEndpoint(input: string): string`
- `export function endpointProblem(input: string): string | undefined`

### src/setup/prompt.ts

- `export function bail(): never`
- `export async function onCancel(value: unknown): Promise<boolean>`
- `export async function prompt<T>(fn: () => Promise<T | symbol>): Promise<T>`
- `export async function promptOrBack<T>(fn: () => Promise<T | symbol>): Promise<T | null>`

### src/setup/registry-stash-loader.ts

- `export interface SetupBundleEntry`
- `export function _setLoadSetupStashesForTests(fake?: typeof loadSetupStashesReal): void`
- `export async function loadSetupStashes(registryUrl: string, timeoutMs = 4000): Promise<SetupBundleEntry[]>`
- `async function loadSetupStashesReal(registryUrl: string, timeoutMs = 4000): Promise<SetupBundleEntry[]>`
- `function authenticatedDefaultTarget(id: string, target: Pick<SetupBundleEntry, "installType" | "url">): boolean`
- `function setupInstallTarget(source: unknown, ref: unknown): Pick<SetupBundleEntry, "installType" | "url"> | undefined`

### src/setup/semantic-assets.ts

- `export function isRemoteEmbeddingConfig(embedding?: EmbeddingConnectionConfig): boolean`
- `export function describeSemanticSearchAssets(embedding?: EmbeddingConnectionConfig): string[]`
- `export async function prepareSemanticSearchAssets`

### src/setup/setup-flags.ts

- `export interface RawSetupFlags`
- `export interface SetupFlags`
- `function bad(flag: string, problem: string): never`
- `function endpointFlag(flag: string, value: string | undefined): string | undefined`
- `function envNameFlag(flag: string, value: string | undefined): string | undefined`
- `export function parseSetupFlags(raw: RawSetupFlags): SetupFlags`
- `export function hasSetupFlags(flags: SetupFlags): boolean`

### src/setup/setup-plan.ts

- `export type KeyAnswer = { readonly env: string } | { readonly pasted: string };`
- `export interface HarnessAnswer`
- `export interface ConnectionAnswer`
- `export type EmbeddingAnswer`
- `export interface SetupAnswers`
- `export type SetupPatch =`
- `export interface PendingCredential`
- `export interface SetupChange`
- `function freeName(taken: Readonly<Record<string, unknown>>, base: string): string`
- `export function harnessEntries`
- `const platformOf = (name: string)`
- `function connectionEntry(existing: ConnectionConfig | undefined, answer: ConnectionAnswer): ConnectionConfig`
- `function embeddingBlock`
- `export function applySetupAnswers(current: AkmConfig, answers: SetupAnswers): SetupChange`

### src/setup/setup.ts

- `export function assertSetupSandbox(stashDir: string, dirExplicitlyProvided: boolean): void`
- `function applyStashIsolationToEnv(stashDir: string, dirExplicitlyProvided: boolean): void`
- `export interface SetupSummary`
- `export function assertSetupConfigPreflight(): void`
- `function sameConfigValue(left: unknown, right: unknown): boolean`
- `function configArrayItemKey(value: unknown): string`
- `function setupConflict(pathParts: readonly string[]): never`
- `export function rebaseSetupChanges`
- `async function saveSetupConfig<T>`
- `function managedBundleIds(): Set<string>`
- `function setupSourceDescriptor(source: SourceConfigEntry): BundleConfigEntry | undefined`
- `function selectsExistingBundle(source: SourceConfigEntry, id: string, bundle: BundleConfigEntry): boolean`
- `type NewSetupBundle =`
- `function finalizeSetupDraft(draft: SetupDraftConfig): AkmConfig`
- `function processRow(config: AkmConfig, process: "agents" | "embedding"): ProcessRow | undefined`
- `async function prepareLocalEmbeddings(config: AkmConfig, noProbe: boolean | undefined): Promise<string | undefined>`
- `async function offerAgentRuntimeFetch(config: AkmConfig): Promise<void>`
- `interface SetupOutcome`
- `export function buildSetupSteps(options:`
- `const applyAnswers = (ctx: SetupContext, answers: SetupAnswers): void =>`
- `function storeCredentials(credentials: readonly PendingCredential[]): void`
- `function resolveIsolatedSetupConfig(opts?:`
- `export async function runSetupWizard(opts?:`
- `async function applyNonInteractiveDefaults`
- `export async function runSetupWithDefaults(opts:`
- `export async function runSetupFromConfig(opts:`
- `export async function loadSetupConfigFromFile`

### src/setup/source-identity.ts

- `export function canonicalSetupGitUrl(value: string): string`

### src/setup/steps.ts

- `export type SetupDraftConfig = AkmConfig &`
- `export interface SetupContext`
- `export interface SetupStep<TResult = void>`
- `export function createSetupContext(initial: AkmConfig, options:`
- `export async function runSetupSteps(steps: SetupStep[], ctx: SetupContext): Promise<SetupDraftConfig>`

### src/setup/summary.ts

- `export interface SetupRuns`
- `export function runsReadOnly(platform: string, bin?: string): boolean`
- `export function unrestrictedModelWorkNote(name: string): string`
- `function modelSuffix(row: ProcessRow): string`
- `function describeWork(row: ProcessRow, rows: readonly TargetRow[], modelWork: boolean): string`
- `function describeEmbeddings(row: ProcessRow): string`
- `export function describeRuns(config: AkmConfig): SetupRuns`
- `const work = (name: ProcessRow["process"])`

## src/setup/steps/

### src/setup/steps/connection-shared.ts

- `export async function promptEndpoint(opts:`
- `export async function promptApiKey(message: string): Promise<string | undefined>`
- `export async function promptModelName(opts:`
- `export async function pickModel(message: string, models: readonly string[], initialValue?: string): Promise<string>`
- `export function warnUser(message: string, interactive: boolean): void`
- `export async function listModels`

### src/setup/steps/connection.ts

- `export interface ConnectionStepInput`
- `export interface ConnectionStepResult`
- `function listingKey`
- `function holdsKey(existing: ConnectionConfig, name: string): boolean`
- `async function pickAliases`
- `const current = (alias: string) =>`
- `function warnOfUnlistedPicks`
- `export async function stepConnection(input: ConnectionStepInput): Promise<ConnectionStepResult>`

### src/setup/steps/embeddings.ts

- `export interface SemanticSearchChoice`
- `export interface EmbeddingStepInput`
- `export interface EmbeddingStepResult`
- `function servingConnection(input: EmbeddingStepInput):`
- `function servedModels(input: EmbeddingStepInput): string[]`
- `function warnOfDroppedKey`
- `function fromFlags(input: EmbeddingStepInput): EmbeddingAnswer`
- `function embeddingAfter(input: EmbeddingStepInput, answer: EmbeddingAnswer): EmbeddingConnectionConfig | undefined`
- `async function askSource(input: EmbeddingStepInput): Promise<EmbeddingAnswer>`
- `export async function stepEmbeddings(input: EmbeddingStepInput): Promise<EmbeddingStepResult>`

### src/setup/steps/harnesses.ts

- `export interface HarnessStepResult`
- `export interface HarnessStepInput`
- `function readOnlyNote(platform: string, bin?: string): string`
- `function configuredPlatforms(current: AkmConfig): string[]`
- `function currentDefaultPlatform(current: AkmConfig): string | undefined`
- `function configuredBin(current: AkmConfig, platform: string): string | undefined`
- `function selectedHarness(current: AkmConfig, answer: HarnessAnswer | undefined)`
- `export async function stepHarnesses(input: HarnessStepInput): Promise<HarnessStepResult>`
- `const result = (modelCallsOnHarness: boolean, modelWork?: boolean): HarnessStepResult =>`
- `async function askHarnesses`

### src/setup/steps/output.ts

- `export async function stepOutputConfig(current: AkmConfig): Promise<OutputConfig>`

### src/setup/steps/platforms.ts

- `export async function stepAgentPlatforms(current: SetupDraftConfig): Promise<SourceConfigEntry[]>`

### src/setup/steps/sources.ts

- `function configuredSourceKey(source: SourceConfigEntry): string`
- `function configuredSourceTarget(source: SourceConfigEntry): string | undefined`
- `function configuredSourceIdentity(source: SourceConfigEntry): string | undefined`
- `function recommendedSourceIdentity(entry:`
- `type ConfiguredSourceOption =`
- `function describeConfiguredSource(source: SourceConfigEntry): ConfiguredSourceOption`
- `function renderConfiguredSourceList(sources: SourceConfigEntry[]): string`
- `function renderInstalledSourceList(managed: SourceConfigEntry[]): string`
- `export async function stepAdditionalSources(currentSources: SourceConfigEntry[]): Promise<SourceConfigEntry[]>`
- `export async function stepRegistries(current: AkmConfig): Promise<RegistryConfigEntry[] | undefined>`
- `export async function stepAddSources`

### src/setup/steps/stashdir.ts

- `export async function stepStashDir`

### src/setup/steps/tasks.ts

- `interface ScheduledTasksEnvOverridesForTests`
- `export function _setScheduledTasksEnvForTests(fakes?: ScheduledTasksEnvOverridesForTests): void`
- `export function isCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean`
- `export function detectServerDefault(): boolean`
- `function normaliseTaskIdForMatch(raw: string): string`
- `export interface SetupTaskDefinition`
- `export interface PreparedSetupTask`
- `export interface ScheduledTasksDeps`
- `export function listSetupTaskDefinitions(): SetupTaskDefinition[]`
- `export interface PrepareSetupTaskDefinitionsDeps`
- `export async function prepareSetupTaskDefinitions`
- `export async function stepScheduledTasks`
- `function displayTaskSchedules(task: SetupTaskDefinition): string`
