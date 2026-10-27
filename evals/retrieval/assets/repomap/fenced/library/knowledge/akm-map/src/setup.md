---
description: "Repo map of akm src/setup at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  setup/
    steps/
      connection-shared.ts
      connection.ts
      embeddings.ts
      harnesses.ts
      output.ts
      platforms.ts
      sources.ts
      stashdir.ts
      tasks.ts
    detect.ts
    endpoint.ts
    prompt.ts
    registry-stash-loader.ts
    semantic-assets.ts
    setup-flags.ts
    setup-plan.ts
    setup.ts
    source-identity.ts
    steps.ts
    summary.ts
```

# Files

## File: src/setup/steps/connection-shared.ts
```typescript
import { redactUrlCredentials } from "../../core/redaction";
import { warn } from "../../core/warn";
import { listEndpointModels } from "../../llm/model-list";
import { endpointProblem, normalizeEndpoint } from "../endpoint";
import { prompt } from "../prompt";
⋮----
export async function promptEndpoint(opts:
⋮----
export async function promptApiKey(message: string): Promise<string | undefined>
⋮----
export async function promptModelName(opts:
⋮----
export async function pickModel(message: string, models: readonly string[], initialValue?: string): Promise<string>
⋮----
export function warnUser(message: string, interactive: boolean): void
⋮----
export async function listModels(
  endpoint: string,
  apiKey: string | undefined,
  interactive: boolean,
): Promise<string[]>
```

## File: src/setup/steps/connection.ts
```typescript
import { type AkmConfig, type ConnectionConfig, defaultConnection } from "../../core/config/config";
import { apiKeyReference, resolveApiKey, storedCredential } from "../../core/config/credentials";
import { entryModel, STANDARD_ALIASES } from "../../core/config/model-aliases";
import { sameEndpoint } from "../../core/endpoint-url";
import { UsageError } from "../../core/errors";
import { redactUrlCredentials } from "../../core/redaction";
import { warn } from "../../core/warn";
import { isEmbeddingModel } from "../../llm/model-list";
import type { LocalServerResult } from "../detect";
import type { SetupFlags } from "../setup-flags";
import type { ConnectionAnswer, KeyAnswer } from "../setup-plan";
import { listModels, pickModel, promptApiKey, promptEndpoint, promptModelName, warnUser } from "./connection-shared";
⋮----
export interface ConnectionStepInput {
  current: AkmConfig;
  flags: SetupFlags;
  interactive: boolean;

  probe: boolean;

  modelCallsOnHarness: boolean;
  localServers: readonly LocalServerResult[];
}
⋮----
export interface ConnectionStepResult {

  answer?: ConnectionAnswer;

  listed: readonly string[];

  addedDefault: boolean;
}
⋮----
function listingKey(
  key: KeyAnswer | undefined,
  existing: { endpoint: string; apiKey?: string } | undefined,
  name: string,
  endpoint: string,
): string | undefined
⋮----
function holdsKey(existing: ConnectionConfig, name: string): boolean
⋮----
async function pickAliases(
  existing: ConnectionConfig | undefined,
  listed: readonly string[],
  interactive: boolean,
): Promise<Record<string, string>>
⋮----
const current = (alias: string) =>
⋮----
function warnOfUnlistedPicks(
  existing: ConnectionConfig | undefined,
  picks: Readonly<Record<string, string>>,
  listed: readonly string[],
  endpoint: string,
  interactive: boolean,
): void
⋮----
export async function stepConnection(input: ConnectionStepInput): Promise<ConnectionStepResult>
```

## File: src/setup/steps/embeddings.ts
```typescript
import {
  type AkmConfig,
  type ConnectionConfig,
  defaultConnection,
  type EmbeddingConnectionConfig,
} from "../../core/config/config";
import { apiKeyReference, resolveApiKey, storedCredential } from "../../core/config/credentials";
import { sameEndpoint } from "../../core/endpoint-url";
import { UsageError } from "../../core/errors";
import { redactUrlCredentials } from "../../core/redaction";
import { hasLocalEmbeddings, noLocalEmbeddingsReason } from "../../llm/embedders/onnx-runtime";
import { isEmbeddingModel } from "../../llm/model-list";
import { prompt } from "../prompt";
import { describeSemanticSearchAssets, isRemoteEmbeddingConfig } from "../semantic-assets";
import type { SetupFlags } from "../setup-flags";
import { applySetupAnswers, type ConnectionAnswer, type EmbeddingAnswer, type KeyAnswer } from "../setup-plan";
import { listModels, pickModel, promptApiKey, promptEndpoint, promptModelName, warnUser } from "./connection-shared";
⋮----
export interface SemanticSearchChoice {
  mode: "off" | "auto";
  prepareAssets: boolean;
}
⋮----
export interface EmbeddingStepInput {
  current: AkmConfig;
  flags: SetupFlags;
  interactive: boolean;
  probe: boolean;

  connection?: ConnectionAnswer;
  listed: readonly string[];

  addedDefaultConnection: boolean;
}
⋮----
export interface EmbeddingStepResult {

  answer?: EmbeddingAnswer;
  semantic: SemanticSearchChoice;
}
⋮----
function servingConnection(input: EmbeddingStepInput):
⋮----
function servedModels(input: EmbeddingStepInput): string[]
⋮----
function warnOfDroppedKey(
  current: EmbeddingConnectionConfig | undefined,
  endpoint: string,
  keyGiven: boolean,
  interactive: boolean,
): void
⋮----
function fromFlags(input: EmbeddingStepInput): EmbeddingAnswer
⋮----
function embeddingAfter(input: EmbeddingStepInput, answer: EmbeddingAnswer): EmbeddingConnectionConfig | undefined
⋮----
async function askSource(input: EmbeddingStepInput): Promise<EmbeddingAnswer>
⋮----
export async function stepEmbeddings(input: EmbeddingStepInput): Promise<EmbeddingStepResult>
```

## File: src/setup/steps/harnesses.ts
```typescript
import { type AkmConfig, defaultConnection, defaultHarness } from "../../core/config/config";
import { warn } from "../../core/warn";
import { getHarness } from "../../integrations/harnesses";
import type { InstalledHarness } from "../detect";
import { prompt } from "../prompt";
import type { SetupFlags } from "../setup-flags";
import { type HarnessAnswer, harnessEntries } from "../setup-plan";
import { runsReadOnly, unrestrictedModelWorkNote } from "../summary";
⋮----
export interface HarnessStepResult {

  answer?: HarnessAnswer;

  modelCallsOnHarness: boolean;





  modelWork?: boolean;
}
⋮----
export interface HarnessStepInput {
  current: AkmConfig;
  installed: readonly InstalledHarness[];
  flags: SetupFlags;
  interactive: boolean;
}
⋮----
function readOnlyNote(platform: string, bin?: string): string
⋮----
function configuredPlatforms(current: AkmConfig): string[]
⋮----
function currentDefaultPlatform(current: AkmConfig): string | undefined
⋮----
function configuredBin(current: AkmConfig, platform: string): string | undefined
⋮----
function selectedHarness(current: AkmConfig, answer: HarnessAnswer | undefined)
⋮----
export async function stepHarnesses(input: HarnessStepInput): Promise<HarnessStepResult>
⋮----
const result = (modelCallsOnHarness: boolean, modelWork?: boolean): HarnessStepResult => (
⋮----
async function askHarnesses(
  current: AkmConfig,
  installed: readonly InstalledHarness[],
  configured: readonly string[],
): Promise<HarnessAnswer | undefined>
```

## File: src/setup/steps/output.ts
```typescript
import type { AkmConfig, OutputConfig } from "../../core/config/config";
import { DEFAULT_CONFIG } from "../../core/config/config";
import { prompt } from "../prompt";
⋮----
export async function stepOutputConfig(current: AkmConfig): Promise<OutputConfig>
```

## File: src/setup/steps/platforms.ts
```typescript
import type { SourceConfigEntry } from "../../core/config/config";
import { detectAgentPlatforms } from "../detect";
import { prompt } from "../prompt";
import type { SetupDraftConfig } from "../steps";
⋮----
export async function stepAgentPlatforms(current: SetupDraftConfig): Promise<SourceConfigEntry[]>
```

## File: src/setup/steps/sources.ts
```typescript
import type { AkmConfig, RegistryConfigEntry, SourceConfigEntry } from "../../core/config/config";
import { DEFAULT_CONFIG, getEffectiveRegistries, getSources } from "../../core/config/config";
import { readLockfile } from "../../integrations/lockfile";
import { prompt, promptOrBack } from "../prompt";
import { loadSetupStashes } from "../registry-stash-loader";
import { canonicalSetupGitUrl } from "../source-identity";
⋮----
function configuredSourceKey(source: SourceConfigEntry): string
⋮----
function configuredSourceTarget(source: SourceConfigEntry): string | undefined
⋮----
function configuredSourceIdentity(source: SourceConfigEntry): string | undefined
⋮----
function recommendedSourceIdentity(entry:
⋮----
type ConfiguredSourceOption = {
  value: string;
  label: string;
  hint: string;
};
⋮----
function describeConfiguredSource(source: SourceConfigEntry): ConfiguredSourceOption
⋮----
function renderConfiguredSourceList(sources: SourceConfigEntry[]): string
⋮----
function renderInstalledSourceList(managed: SourceConfigEntry[]): string
⋮----
export async function stepAdditionalSources(currentSources: SourceConfigEntry[]): Promise<SourceConfigEntry[]>
⋮----
export async function stepRegistries(current: AkmConfig): Promise<RegistryConfigEntry[] | undefined>
⋮----
export async function stepAddSources(
  current: AkmConfig,
  options?: { promptForAdditional?: boolean },
): Promise<SourceConfigEntry[]>
```

## File: src/setup/steps/stashdir.ts
```typescript
import type { AkmConfig } from "../../core/config/config";
import { primaryBundlePath } from "../../core/config/config";
import { assertSafeStashDir, getDefaultStashDir } from "../../core/paths";
import { prompt } from "../prompt";
⋮----
export async function stepStashDir(
  current: AkmConfig,
  options?: { nonInteractive?: boolean; preferredDir?: string },
): Promise<string>
```

## File: src/setup/steps/tasks.ts
```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
⋮----
import { akmTasksSync } from "../../commands/tasks/tasks";
import { makeBundleRef } from "../../core/asset/asset-ref";
import { loadConfig, mutateConfig, resetConfigCache } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import {
  commitWriteTargetBoundary,
  deleteAssetFromSource,
  prepareWriteTargetForMutation,
  resolveWriteTarget,
  writeAssetToSource,
} from "../../core/write-source";
import { enabledRefsFromInstalled, isSchedulerBundleActive, schedulerEnabledRefs } from "../../tasks/activation-config";
import { backendNameForPlatform, selectBackend } from "../../tasks/backends";
import { type EmbeddedTask, listEmbeddedTasks } from "../../tasks/embedded";
import { parseSchedule } from "../../tasks/schedule";
import type { InstalledSchedulerBinding } from "../../tasks/scheduler-binding";
import { parseTaskSource } from "../../tasks/source/parse-task-source";
import { prompt } from "../prompt";
⋮----
interface ScheduledTasksEnvOverridesForTests {
  isCiEnvironment?: typeof isCiEnvironment;
  detectServerDefault?: typeof detectServerDefault;
}
⋮----
export function _setScheduledTasksEnvForTests(fakes?: ScheduledTasksEnvOverridesForTests): void
⋮----
export function isCiEnvironment(env: NodeJS.ProcessEnv = process.env): boolean
⋮----
export function detectServerDefault(): boolean
⋮----
function normaliseTaskIdForMatch(raw: string): string
⋮----
export interface SetupTaskDefinition {
  id: string;
  schedule: string;
  /** Every authored schedule, in parser/source order. */
  schedules?: readonly string[];
  enabled: boolean;
  description?: string;
}
⋮----
/** Every authored schedule, in parser/source order. */
⋮----
export interface PreparedSetupTask {
  task: EmbeddedTask;
  schedule: string;
  enabled: boolean;
  installed: boolean;
}
⋮----
export interface ScheduledTasksDeps {
  list: () => SetupTaskDefinition[] | Promise<SetupTaskDefinition[]>;
  prepare: (tasks: PreparedSetupTask[]) => Promise<number>;
  sync: typeof akmTasksSync;
  /** Read-only native scheduler inventory, used to pre-check the review truthfully. */
  inspectInstalled: () => Promise<{ installed: readonly InstalledSchedulerBinding[] }>;
}
⋮----
/** Read-only native scheduler inventory, used to pre-check the review truthfully. */
⋮----
export function listSetupTaskDefinitions(): SetupTaskDefinition[]
⋮----
export interface PrepareSetupTaskDefinitionsDeps {
  writeAsset?: typeof writeAssetToSource;
  deleteAsset?: typeof deleteAssetFromSource;
  commitBoundary?: typeof commitWriteTargetBoundary;
}
⋮----
export async function prepareSetupTaskDefinitions(
  tasks: PreparedSetupTask[],
  deps: PrepareSetupTaskDefinitionsDeps = {},
): Promise<number>
⋮----
export async function stepScheduledTasks(
  deps: ScheduledTasksDeps = DEFAULT_SCHEDULED_TASKS_DEPS,
  options: { nonInteractive?: boolean } = {},
): Promise<void>
⋮----
validate(value)
⋮----
function displayTaskSchedules(task: SetupTaskDefinition): string
```

## File: src/setup/detect.ts
```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HarnessId } from "../core/config/config";
import { defaultWhich, detectAgentCliProfiles, type WhichFn } from "../integrations/agent/detect";
import { HARNESS_CONFIG_PLATFORMS, SESSION_LOG_HARNESSES } from "../integrations/harnesses";
import { listEndpointModels } from "../llm/model-list";
⋮----
export interface AgentPlatform {
  name: string;
  path: string;
}
⋮----
interface DetectOverridesForTests {
  detectAgentPlatforms?: typeof detectAgentPlatforms;
}
⋮----
export function _setDetectForTests(fakes?: DetectOverridesForTests): void
⋮----
export function detectAgentPlatforms(): AgentPlatform[]
⋮----
export interface LocalServerResult {

  baseUrl: string;

  available: boolean;

  models: string[];

  label: string;
}
⋮----
export async function probeLocalEndpoint(baseUrl: string, label: string, timeoutMs = 2000): Promise<LocalServerResult>
⋮----
export async function detectLocalServers(): Promise<LocalServerResult[]>
⋮----
export interface StashDirSuggestion {

  path: string;

  reason: string;

  rank: number;
}
⋮----
export function detectStashDir(opts?: {
  existingStashDir?: string;
  cwd?: string;
  home?: string;
}): StashDirSuggestion[]
⋮----
const push = (p: string, reason: string, rank: number): void =>
⋮----
function findGitRepoRoot(start: string): string | undefined
⋮----
export interface InstalledHarness {
  platform: HarnessId;
  bin: string;

  path: string;
}
⋮----
export function detectInstalledHarnesses(whichFn: WhichFn = defaultWhich): InstalledHarness[]
⋮----
export interface DetectedEnvironment {

  harnesses: InstalledHarness[];

  localServers: LocalServerResult[];

  stashSuggestions: StashDirSuggestion[];

  agentPlatforms: AgentPlatform[];
}
⋮----
export async function detectEnvironment(opts?: {
  existingStashDir?: string;
  whichFn?: WhichFn;
  cwd?: string;
  home?: string;
  probe?: boolean;
}): Promise<DetectedEnvironment>
⋮----
export function renderDetectionSummary(env: DetectedEnvironment): string
```

## File: src/setup/endpoint.ts
```typescript
export function normalizeEndpoint(input: string): string
⋮----
export function endpointProblem(input: string): string | undefined
```

## File: src/setup/prompt.ts
```typescript
export function bail(): never
⋮----
export async function onCancel(value: unknown): Promise<boolean>
⋮----
export async function prompt<T>(fn: () => Promise<T | symbol>): Promise<T>
⋮----
export async function promptOrBack<T>(fn: () => Promise<T | symbol>): Promise<T | null>
```

## File: src/setup/registry-stash-loader.ts
```typescript
import { hasRegistryUrlCredentials } from "../core/registry-url";
import { fetchRegistryJson } from "../registry/network";
import { parseRegistryRef } from "../registry/resolve";
⋮----
export interface SetupBundleEntry {

  id: string;

  name: string;

  description: string;

  url: string;

  installType: "git" | "npm";

  source: "registry" | "fallback";

  defaultSelected: boolean;
}
⋮----
export function _setLoadSetupStashesForTests(fake?: typeof loadSetupStashesReal): void
⋮----
export async function loadSetupStashes(registryUrl: string, timeoutMs = 4000): Promise<SetupBundleEntry[]>
⋮----
async function loadSetupStashesReal(registryUrl: string, timeoutMs = 4000): Promise<SetupBundleEntry[]>
⋮----
function authenticatedDefaultTarget(id: string, target: Pick<SetupBundleEntry, "installType" | "url">): boolean
⋮----
function setupInstallTarget(source: unknown, ref: unknown): Pick<SetupBundleEntry, "installType" | "url"> | undefined
```

## File: src/setup/semantic-assets.ts
```typescript
import { isHttpUrl } from "../core/common";
import type { AkmConfig, EmbeddingConnectionConfig } from "../core/config/config";
import { checkEmbeddingAvailability, DEFAULT_LOCAL_MODEL } from "../llm/embedder";
import { effectiveEmbedding } from "../llm/embedders/connection";
import { ONNXRUNTIME_VERSION } from "../llm/embedders/onnx-runtime";
⋮----
export function isRemoteEmbeddingConfig(embedding?: EmbeddingConnectionConfig): boolean
⋮----
export function describeSemanticSearchAssets(embedding?: EmbeddingConnectionConfig): string[]
⋮----
export async function prepareSemanticSearchAssets(
  config: AkmConfig,
): Promise<
```

## File: src/setup/setup-flags.ts
```typescript
import { ENGINE_NAME_PATTERN_SOURCE } from "../core/config/engine-semantics";
import { UsageError } from "../core/errors";
import { HARNESS_CONFIG_PLATFORMS } from "../integrations/harnesses";
import { normalizeEndpoint } from "./endpoint";
⋮----
export interface RawSetupFlags {
  endpoint?: string;
  apiKeyEnv?: string;
  name?: string;
  harness?: string;
  embedding?: string;
  embeddingEndpoint?: string;
  embeddingApiKeyEnv?: string;
}
⋮----
export interface SetupFlags {

  endpoint?: string;

  apiKeyEnv?: string;

  name?: string;

  harness?: string[];

  embedding?: string;

  embeddingEndpoint?: string;
  embeddingApiKeyEnv?: string;
}
⋮----
function bad(flag: string, problem: string): never
⋮----
function endpointFlag(flag: string, value: string | undefined): string | undefined
⋮----
function envNameFlag(flag: string, value: string | undefined): string | undefined
⋮----
export function parseSetupFlags(raw: RawSetupFlags): SetupFlags
⋮----
export function hasSetupFlags(flags: SetupFlags): boolean
```

## File: src/setup/setup-plan.ts
```typescript
import {
  type AkmConfig,
  type ConnectionConfig,
  defaultHarness,
  type EmbeddingConnectionConfig,
  type HarnessConfig,
} from "../core/config/config";
import type { CredentialSlot } from "../core/config/credentials";
import { entryWithModel } from "../core/config/model-aliases";
import { sameEndpoint } from "../core/endpoint-url";
⋮----
export type KeyAnswer = { readonly env: string } | { readonly pasted: string };
⋮----
export interface HarnessAnswer {

  readonly platforms: readonly string[];

  readonly default?: string;
}
⋮----
export interface ConnectionAnswer {
  readonly name: string;
  readonly endpoint: string;

  readonly key?: KeyAnswer;

  readonly picks: Readonly<Record<string, string>>;
}
⋮----
export type EmbeddingAnswer =
  | { readonly kind: "off" }
  | { readonly kind: "local" }

  | { readonly kind: "connection"; readonly model: string }
  | { readonly kind: "endpoint"; readonly endpoint: string; readonly model: string; readonly key?: KeyAnswer };
⋮----
export interface SetupAnswers {
  readonly harnesses?: HarnessAnswer;

  readonly harnessModelWork?: boolean;
  readonly connection?: ConnectionAnswer;
  readonly embedding?: EmbeddingAnswer;
}
⋮----
export type SetupPatch = {
  connections?: Record<string, ConnectionConfig>;
  harnesses?: Record<string, HarnessConfig> | undefined;
  embedding?: EmbeddingConnectionConfig | undefined;
};
⋮----
export interface PendingCredential {
  readonly slot: CredentialSlot;
  readonly key: string;
  readonly endpoint: string;
}
⋮----
export interface SetupChange {
  readonly patch: SetupPatch;
  readonly credentials: readonly PendingCredential[];
}
⋮----
function freeName(taken: Readonly<Record<string, unknown>>, base: string): string
⋮----
export function harnessEntries(
  existing: Readonly<Record<string, HarnessConfig>> | undefined,
  platforms: readonly string[],
  defaultPlatform: string | undefined,
): Record<string, HarnessConfig>
⋮----
const platformOf = (name: string)
⋮----
function connectionEntry(existing: ConnectionConfig | undefined, answer: ConnectionAnswer): ConnectionConfig
⋮----
function embeddingBlock(
  current: EmbeddingConnectionConfig | undefined,
  answer: EmbeddingAnswer,
): EmbeddingConnectionConfig | undefined
⋮----
export function applySetupAnswers(current: AkmConfig, answers: SetupAnswers): SetupChange
```

## File: src/setup/setup.ts
```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
⋮----
import { akmInit } from "../commands/sources/init";
import { type ProcessRow, targetRows } from "../commands/targets";
import { deriveBundleIds } from "../core/bundle-id";
import { toErrorMessage } from "../core/common";
import type { AkmConfig, BundleConfigEntry, SourceConfigEntry } from "../core/config/config";
import {
  bundleEntryToSourceEntry,
  DEFAULT_CONFIG,
  defaultConnection,
  loadUserConfig,
  mutateConfigWithPrecommit,
  parseAndValidateConfigText,
  primaryBundlePath,
  validateCompleteConfig,
} from "../core/config/config";
import { readConfigText } from "../core/config/config-io";
import { listTopLevelConfigKeys } from "../core/config/config-schema";
import { writeCredential } from "../core/config/credentials";
import { deepMergeConfig, isPlainObject } from "../core/config/deep-merge";
import { ConfigError, UsageError } from "../core/errors";
import { getConfigPath, getDefaultStashDir, isTransientStashPath } from "../core/paths";
import { warn, warnOnce } from "../core/warn";
import { akmIndex } from "../indexer/indexer";
import { readLockfile } from "../integrations/lockfile";
import { checkEmbeddingAvailability } from "../llm/embedder";
import { effectiveEmbedding } from "../llm/embedders/connection";
import { type DetectedEnvironment, detectEnvironment, renderDetectionSummary } from "./detect";
import { bail, prompt } from "./prompt";
import { prepareSemanticSearchAssets } from "./semantic-assets";
import type { SetupFlags } from "./setup-flags";
import { applySetupAnswers, type PendingCredential, type SetupAnswers } from "./setup-plan";
import { canonicalSetupGitUrl } from "./source-identity";
import { createSetupContext, runSetupSteps, type SetupContext, type SetupDraftConfig, type SetupStep } from "./steps";
import { type ConnectionStepResult, stepConnection } from "./steps/connection";
import { type SemanticSearchChoice, stepEmbeddings } from "./steps/embeddings";
import { type HarnessStepResult, stepHarnesses } from "./steps/harnesses";
import { stepOutputConfig } from "./steps/output";
import { stepAgentPlatforms } from "./steps/platforms";
import { stepAdditionalSources, stepAddSources, stepRegistries } from "./steps/sources";
import { stepStashDir } from "./steps/stashdir";
import { stepScheduledTasks } from "./steps/tasks";
import { describeRuns, type SetupRuns } from "./summary";
⋮----
export function assertSetupSandbox(stashDir: string, dirExplicitlyProvided: boolean): void
⋮----
function applyStashIsolationToEnv(stashDir: string, dirExplicitlyProvided: boolean): void
⋮----
export interface SetupSummary {
  configPath: string;
  bundleDir: string;
  stashCreated: boolean;
  written: boolean;
  fields: string[];

  runs: SetupRuns;




  semanticAssets?: string;
}
⋮----
export function assertSetupConfigPreflight(): void
⋮----
function sameConfigValue(left: unknown, right: unknown): boolean
⋮----
function configArrayItemKey(value: unknown): string
⋮----
function setupConflict(pathParts: readonly string[]): never
⋮----
export function rebaseSetupChanges(
  original: unknown,
  desired: unknown,
  latest: unknown,
  pathParts: readonly string[] = [],
): unknown
⋮----
async function saveSetupConfig<T>(
  original: AkmConfig,
  desired: AkmConfig,
  precommit: (config: AkmConfig) => Promise<T>,
  options?: { persistTopLevelKeys?: readonly (keyof AkmConfig)[] },
): Promise<
⋮----
function managedBundleIds(): Set<string>
⋮----
function setupSourceDescriptor(source: SourceConfigEntry): BundleConfigEntry | undefined
⋮----
function selectsExistingBundle(source: SourceConfigEntry, id: string, bundle: BundleConfigEntry): boolean
⋮----
type NewSetupBundle = {
  descriptor: BundleConfigEntry;
  derivationPath: string;
  preferredId?: string;
  primary: boolean;
  writable?: boolean;
};
⋮----
function finalizeSetupDraft(draft: SetupDraftConfig): AkmConfig
⋮----
/** Where a process of `config` runs, as `akm info` and `akm health` say it. */
function processRow(config: AkmConfig, process: "agents" | "embedding"): ProcessRow | undefined
⋮----
async function prepareLocalEmbeddings(config: AkmConfig, noProbe: boolean | undefined): Promise<string | undefined>
⋮----
async function offerAgentRuntimeFetch(config: AkmConfig): Promise<void>
⋮----
interface SetupOutcome {
  semantic: SemanticSearchChoice;
  credentials: PendingCredential[];
}
⋮----
export function buildSetupSteps(options: {
  semanticSearchOutcome: SemanticSearchChoice;
  preferredStashDir?: string;
  detection?: DetectedEnvironment;
  flags?: SetupFlags;

  probe?: boolean;
}):
⋮----
const applyAnswers = (ctx: SetupContext, answers: SetupAnswers): void =>
⋮----
async run(ctx)
⋮----
function storeCredentials(credentials: readonly PendingCredential[]): void
⋮----
function resolveIsolatedSetupConfig(opts?:
⋮----
export async function runSetupWizard(opts?: {
  dir?: string;
  noInit?: boolean;
  flags?: SetupFlags;
  noProbe?: boolean;
}): Promise<void>
⋮----
async run(stepCtx)
⋮----
async function applyNonInteractiveDefaults(
  base: SetupDraftConfig,
  stashDir: string,
  opts: { noProbe?: boolean; flags?: SetupFlags },
): Promise<
⋮----
export async function runSetupWithDefaults(opts: {
  dir?: string;
  noInit?: boolean;
  flags?: SetupFlags;
  noProbe?: boolean;
}): Promise<SetupSummary>
⋮----
export async function runSetupFromConfig(opts: {
  configJson: string;
  dir?: string;
  noInit?: boolean;
  noProbe?: boolean;

  flags?: SetupFlags;





  applyDefaults?: boolean;
}): Promise<SetupSummary>
⋮----
export async function loadSetupConfigFromFile(
  filePath: string,
  opts?: { cwd?: string; homeDir?: string },
): Promise<
```

## File: src/setup/source-identity.ts
```typescript
export function canonicalSetupGitUrl(value: string): string
```

## File: src/setup/steps.ts
```typescript
import type { AkmConfig, SourceConfigEntry } from "../core/config/config";
import { deepMergeConfig } from "../core/config/deep-merge";
⋮----
export type SetupDraftConfig = AkmConfig & {
  primaryPath?: string;
  additionalSources?: SourceConfigEntry[];
};
⋮----
export interface SetupContext {




  readonly config: Readonly<SetupDraftConfig>;






  readonly nonInteractive: boolean;


  apply(delta: Partial<SetupDraftConfig>): void;





  replace(keys: Readonly<Record<string, unknown>>): void;
}
⋮----
apply(delta: Partial<SetupDraftConfig>): void;
⋮----
replace(keys: Readonly<Record<string, unknown>>): void;
⋮----
export interface SetupStep<TResult = void> {
  readonly id: string;
  readonly label: string;

  readonly nonInteractive?: boolean;
  run(ctx: SetupContext): Promise<TResult>;
}
⋮----
run(ctx: SetupContext): Promise<TResult>;
⋮----
export function createSetupContext(initial: AkmConfig, options:
⋮----
get config()
⋮----
apply(delta)
replace(keys)
⋮----
export async function runSetupSteps(steps: SetupStep[], ctx: SetupContext): Promise<SetupDraftConfig>
```

## File: src/setup/summary.ts
```typescript
import { type HarnessRow, type ProcessRow, type TargetRow, targetRows } from "../commands/targets";
import type { AkmConfig } from "../core/config/config";
import { getHarness } from "../integrations/harnesses";
⋮----
export interface SetupRuns {
  modelCalls: string;
  agentWork: string;
  embeddings: string;
}
⋮----
export function runsReadOnly(platform: string, bin?: string): boolean
⋮----
export function unrestrictedModelWorkNote(name: string): string
⋮----
function modelSuffix(row: ProcessRow): string
⋮----
/** Model calls or agent work: where the row says it runs, or what is wrong with the config that stops it. */
function describeWork(row: ProcessRow, rows: readonly TargetRow[], modelWork: boolean): string
⋮----
function describeEmbeddings(row: ProcessRow): string
⋮----
export function describeRuns(config: AkmConfig): SetupRuns
⋮----
const work = (name: ProcessRow["process"])
```
