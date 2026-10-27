---
description: "Repo map of akm src/integrations at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/integrations

## src/integrations/

### src/integrations/github.ts

- `function readGithubTokenFromEnv(): string | undefined`
- `function readGithubTokenFromGhCli(): string | undefined`
- `function resolveGithubToken(): string | undefined`
- `export function githubHeaders(url?: string): HeadersInit`
- `export function asRecord(value: unknown): Record<string, unknown>`
- `export function asString(value: unknown): string | undefined`

### src/integrations/lockfile.ts

- `export interface LockfileEntry`
- `export function _setLockAcquireTimeoutMsForTests(ms: number | undefined): void`
- `async function acquireLockSentinel(): Promise<() => void>`
- `export function readLockfile(): LockfileEntry[]`
- `function assertLockfilePathReadable(target: string): void`
- `function readLockfileOrThrow(): LockfileEntry[]`
- `export function lockContentRootFor(bundleId: string | undefined, type: string): string | undefined`
- `function writeLockfileUnlocked(entries: LockfileEntry[]): void`
- `export async function writeLockfile(entries: LockfileEntry[]): Promise<void>`
- `export async function upsertLockEntry(entry: LockfileEntry): Promise<void>`
- `export async function renameLockEntry(oldId: string, newId: string): Promise<boolean>`
- `export async function removeLockEntry(id: string): Promise<void>`
- `export function isValidLockfileEntry(value: unknown): value is LockfileEntry`

## src/integrations/agent/

### src/integrations/agent/akm-read-tools.ts

- `export interface AkmReadToolContext`
- `export interface AkmReadTool`
- `const sourceOf = (context: AkmReadToolContext | undefined): UsageEventSource | undefined`
- `const str = (value: unknown): string | undefined`
- `const positiveInt = (value: unknown): number | undefined`
- `function asCli(command: string, compute: (mode: ReturnType<typeof resolveOutputMode>) => Promise<unknown>)`
- `function required(input: Record<string, unknown>, key: string): string`

### src/integrations/agent/config.ts

### src/integrations/agent/conversation-fallback.ts

- `export function composeConversationFallbackPrompt`

### src/integrations/agent/detect.ts

- `export type WhichFn = (bin: string) => string | undefined;`
- `export function defaultWhich(bin: string, envSource: NodeJS.ProcessEnv = process.env): string | undefined`
- `export function probeVersion`
- `function executableSuffixes(envSource: NodeJS.ProcessEnv): string[]`
- `export interface AgentDetectionResult`
- `interface AgentDetectOverridesForTests`
- `export function _setAgentDetectForTests(fakes?: AgentDetectOverridesForTests): void`
- `export function detectAgentCliProfiles(agent?: AkmConfig, whichFn: WhichFn = defaultWhich): AgentDetectionResult[]`
- `function probeProfile(profile: AgentProfile, whichFn: WhichFn): AgentDetectionResult`

### src/integrations/agent/execution.ts

- `export interface ExecutionFieldProvenance`
- `export interface ExecutionLayer`
- `export function shippedAlias(alias: StandardAlias): ExecutionLayer`
- `export function currentLayer(values: UnresolvedExecutionDefaults): ExecutionLayer`
- `export interface ResolveExecutionInput`
- `export interface ResolvedExecution`
- `export interface BuiltExecution`
- `function has(values: object | null | undefined, key: string): boolean`
- `function nearest`
- `function explicit(layer: ExecutionLayer): ExecutionFieldProvenance`
- `function recordInferenceProvenance`
- `function applyLayers(runner: RunnerSpec, layers: readonly ExecutionLayer[]): RunnerSpec`
- `export function resolveExecution(input: ResolveExecutionInput): ResolvedExecution`
- `const select = (key: keyof UnresolvedExecutionDefaults, field: string): ExecutionLayer | undefined =>`
- `function nonEmpty(value: object | null | undefined): boolean`
- `function buildChat`
- `const skip = (field: string): void =>`
- `export function buildExecution(request: ResolvedExecutionRequestV1, runner: RunnerSpec): BuiltExecution`
- `export function buildExecutionFromWire(wire:`

### src/integrations/agent/index.ts

### src/integrations/agent/persona-fallback.ts

- `export interface PersonaFallbackComposition`
- `function withTrailingNewline(value: string): string`
- `export function composePersonaFallbackPrompt`

### src/integrations/agent/profiles.ts

- `export type AgentStdioMode = "captured" | "interactive";`
- `export interface AgentProfile`
- `function builtinProfiles(): Record<string, AgentProfile>`
- `export function getBuiltinAgentProfile(name: string): AgentProfile | undefined`
- `export function listBuiltinAgentProfiles(): Record<string, AgentProfile>`
- `export function harnessProfile(runner: HarnessRunner): AgentProfile`
- `export function runtimeProfile(connection: ConnectionRunner): AgentProfile`

### src/integrations/agent/prompts.ts

- `export interface AgentProposalPayload`
- `function hintForType(type: string): string`
- `function knownTypeList(): string`
- `export interface RejectedProposalContext`
- `export interface ReflectPromptInput`
- `export type ReflectOutputMode = "json_schema" | "framed_markdown";`
- `export function reflectResponseContract(mode: ReflectOutputMode, targetScoped: boolean): string`
- `export function buildReflectOutputRepairPrompt(mode: ReflectOutputMode, targetScoped: boolean): string`
- `function sourceHasNonEmptyDescription(assetContent: string | undefined): boolean`
- `function frontmatterProblems(assetContent: string | undefined): string[]`
- `export interface ReflectPromptResult`
- `export function buildReflectPrompt(input: ReflectPromptInput): ReflectPromptResult`
- `export interface ProposePromptInput`
- `export function buildProposePrompt(input: ProposePromptInput): string`
- `export function parseAgentProposalPayload(stdout: string): AgentProposalPayload`
- `export function validateProposalPayload(parsed: unknown): Parsed<AgentProposalPayload>`

### src/integrations/agent/request-lowering.ts

- `export function untranslated(adapter: string, field: string): Readonly<LoweringNotice>`
- `export function lowerRequest(target: LowerTarget, request: ResolvedExecutionRequestV1): LoweredAgentDispatch`
- `const skip = (field: string): void =>`

### src/integrations/agent/resolution.ts

- `export interface ResolveTargetInput`
- `function present(layer: UnresolvedExecutionDefaults, key: keyof UnresolvedExecutionDefaults): boolean`
- `function nearest<K extends keyof UnresolvedExecutionDefaults>`
- `export function parseTimeout(value: unknown): number | null`
- `export function withReasoningEffort(inference: ExecutionJsonObject): ExecutionJsonObject`
- `export function mergeLayerInference`
- `type Target`
- `export function retiredEngineSelection`
- `function namedByLayers`
- `function defaultTarget(config: AkmConfig, modelWork: boolean): Target | undefined`
- `function harnessesOnPlatform(config: AkmConfig, platform: string): string[]`
- `function harnessNamed(config: AkmConfig, selector: string):`
- `export function selectionNotConfigured(config: AkmConfig, kind: "connection" | "harness", name: string): ConfigError`
- `function selectTarget(input: ResolveTargetInput): Target`
- `function knownAliases(config: AkmConfig): ReadonlySet<string>`
- `function modelEntry`
- `function firstTimeout(...timeouts: readonly (number | null | undefined)[]): number | null`
- `function defaultTimeout(modelWork: boolean): number | null`
- `function layerTimeout(layers: readonly UnresolvedExecutionDefaults[]): number | null | undefined`
- `function connectionRunner`
- `function harnessAliasModel(name: string, alias: string, entry: NonNullable<HarnessConfig["models"]>[string]): string`
- `function harnessModel`
- `function harnessRunner`
- `export function resolveTarget(input: ResolveTargetInput): RunnerSpec`

### src/integrations/agent/runner-dispatch.ts

- `export interface RunExecutionOptions`
- `export function collectDispatchSensitiveValues`
- `function redactResult(result: AgentRunResult, sensitiveValues: readonly string[]): AgentRunResult`
- `function llmFailureReason(error: unknown): AgentFailureReason`
- `type LlmCall = (connection: ChatCompletionConfig, opts: RunAgentOptions) => Promise<AgentRunResult>;`
- `function dispatchedModel`
- `function recordDispatchUsage(execution: BuiltExecution, result: AgentRunResult): void`
- `export function materializeConnection`
- `interface DispatchTarget`
- `async function dispatchRunner`
- `const spawn = (spawnOpts: RunAgentOptions)`
- `async function inScratchDirectory`
- `function isConfinedAgentWork(execution: BuiltExecution): boolean`
- `function modelWorkAnswer(runner: RunnerSpec, result: AgentRunResult): AgentRunResult`
- `export async function runExecution`
- `export interface InteractiveAgentInvocationOptions`
- `export interface InteractiveAgentInvocationResult`
- `export async function executeInteractiveAgentInvocation`

### src/integrations/agent/runner.ts

- `export interface ConnectionRunner`
- `export interface HarnessRunner`
- `export type RunnerSpec = ConnectionRunner | HarnessRunner;`
- `export function decodeFrozenRunnerSpec(value: unknown): RunnerSpec`

### src/integrations/agent/runtime-port.ts

- `export interface AgentRuntime`

### src/integrations/agent/runtime.ts

### src/integrations/agent/spawn.ts

- `export type AgentFailureReason`
- `export interface RunAgentOptions`
- `export interface AgentTokenUsage`
- `export interface AgentRunResult`
- `export function buildChildEnv(options: Pick<RunAgentOptions, "env">): Record<string, string>`
- `function streamFailureMessage(label: string, stdout: StreamReadResult, stderr: StreamReadResult): string | undefined`
- `function failed(reason: AgentFailureReason, error: string, rest: Partial<AgentRunResult>`
- `export async function runAgent(profile: AgentProfile, options: RunAgentOptions`
- `export interface ReadyCommand`
- `export async function runBuiltCommand`

## src/integrations/harnesses/

### src/integrations/harnesses/harness.ts

- `export interface LowerTarget`
- `export interface HarnessSpawn`
- `export interface AgentDispatchRequest`
- `export interface LoweredAgentDispatch`
- `export interface BuiltCommand`
- `export interface HarnessProfileDefaults`
- `export interface AkmHarness extends LowerTarget`
- `export type HarnessBuilder = Pick<AkmHarness, "build">;`
- `export function modelFromArgs(args: readonly string[]): string | undefined`
- `export function withoutModelFlag(args: readonly string[]): string[]`
- `export function withoutLeading(args: readonly string[], subcommand: string): string[]`

### src/integrations/harnesses/index.ts

- `type SessionLogCapable = AkmHarness & { readonly sessionLogProvider: () => SessionLogHarness };`
- `export function getHarness(id: string): AkmHarness | undefined`

## src/integrations/harnesses/aider/

### src/integrations/harnesses/aider/index.ts

- `export class AiderHarness implements AkmHarness`

## src/integrations/harnesses/amazonq/

### src/integrations/harnesses/amazonq/index.ts

- `export class AmazonqHarness implements AkmHarness`

## src/integrations/harnesses/claude/

### src/integrations/harnesses/claude/index.ts

- `export class ClaudeHarness implements AkmHarness`

### src/integrations/harnesses/claude/session-log.ts

- `function claudeProjectsDir(): string`
- `function subagentProvenance(jsonlPath: string): string`
- `function parseClaudeEvent`
- `export class ClaudeCodeProvider extends AbstractSessionLogProvider implements SessionLogHarness`

## src/integrations/harnesses/codex/

### src/integrations/harnesses/codex/index.ts

- `export class CodexHarness implements AkmHarness`

### src/integrations/harnesses/codex/session-log.ts

- `function codexSessionsDir(): string`
- `interface RolloutMeta`
- `function parseSessionMeta(entry: unknown): RolloutMeta | undefined`
- `function blockText(blocks: unknown, keep: (text: string) => boolean = () => true): string`
- `function toolInputText(input: unknown): string`
- `function parseCodexRecord`
- `export class CodexProvider extends AbstractSessionLogProvider implements SessionLogHarness`

## src/integrations/harnesses/copilot/

### src/integrations/harnesses/copilot/index.ts

- `export class CopilotHarness implements AkmHarness`

## src/integrations/harnesses/gemini/

### src/integrations/harnesses/gemini/index.ts

- `export class GeminiHarness implements AkmHarness`

## src/integrations/harnesses/opencode/

### src/integrations/harnesses/opencode/agent-builder.ts

- `function modelWorkConfig(): string`
- `function userConfig(content: string): Record<string, unknown> | undefined`
- `function jsoncObject(content: string): Record<string, unknown> | undefined`
- `function withEnvReferences(content: string): string`
- `const replaced = (escaped: boolean): string`

### src/integrations/harnesses/opencode/index.ts

- `export class OpencodeHarness implements AkmHarness`

### src/integrations/harnesses/opencode/plugin-layout.ts

- `export interface OpenCodeFlavor`
- `export function newestBuildDir(folder: string): string | undefined`
- `export function readPackageVersion(file: string): string | undefined`

### src/integrations/harnesses/opencode/roots.ts

- `function xdgRoot(name: string, fallback: readonly string[], env: NodeJS.ProcessEnv): string`
- `function opencodeDataDir(env: NodeJS.ProcessEnv = process.env): string`
- `export function opencodeCacheDir(env: NodeJS.ProcessEnv = process.env): string`
- `export function opencodeConfigDir(env: NodeJS.ProcessEnv = process.env): string`
- `export function databaseIn(directory: string): string`
- `export function akmRuntimeDir(): string`
- `export function opencodeDatabasePath(env: NodeJS.ProcessEnv = process.env): string`
- `export function akmOpencodeDatabasePath(): string`

### src/integrations/harnesses/opencode/session-log-v1.ts

- `export interface OpenCodeSessionMeta`
- `export interface OpenCodeSessionRead`
- `type SessionRow =`
- `export function toMeta(r: Partial<SessionRow>, sessionId: string): OpenCodeSessionMeta`
- `export function listV1Sessions(db: Database, sinceMs: number): OpenCodeSessionMeta[]`
- `export function readV1Session(db: Database, harness: string, sessionId: string, filePath: string): OpenCodeSessionRead`

### src/integrations/harnesses/opencode/session-log-v2.ts

- `type Json = Record<string, unknown>;`
- `function asNumber(v: unknown): number | undefined`
- `function toolInputText(input: unknown): string`
- `function toolContentText(content: unknown): string`
- `function structuredErrorText(err: unknown): string`
- `export function opencodeMessageEvents`
- `const push = (role: SessionEvent["role"], text: string, ts: number | undefined) =>`
- `export function hasV2Tables(db: Database): boolean`
- `type V2SessionRow =`
- `export function listV2Sessions(db: Database, sinceMs: number): OpenCodeSessionMeta[]`
- `export function v2SessionTokens`
- `export function readV2Session(db: Database, harness: string, sessionId: string, filePath: string): OpenCodeSessionRead`

### src/integrations/harnesses/opencode/session-log.ts

- `type Layout = "v2" | "v1" | "unsupported";`
- `function layoutOf(db: Database): Layout`
- `export class OpenCodeProvider extends AbstractSessionLogProvider implements SessionLogHarness`

### src/integrations/harnesses/opencode/version.ts

- `interface OpencodeVersionInfo`
- `type OpencodeVersionProbe = (bin: string) => string | undefined;`
- `const defaultProbe: OpencodeVersionProbe = (bin)`
- `export function _setOpencodeVersionProbeForTests(fake?: OpencodeVersionProbe): void`
- `function lookup(bin: string): string | undefined`
- `function parseOpencodeMajor(versionOutput: string): number | undefined`
- `export function resolveOpencodeBin(): string`
- `export function detectOpencodeMajor(bin: string): OpencodeVersionInfo`
- `export function isOpencode2(bin: string): boolean`

## src/integrations/harnesses/opencode/runtime/

### src/integrations/harnesses/opencode/runtime/binary.ts

- `export interface HostTraits`
- `export function opencodePackage`
- `function run(command: string, args: string[], timeout: number): SpawnSyncReturns<string>`
- `function hasAvx2(platform: HostTraits["platform"]): boolean`
- `function isMusl(): boolean`
- `export function detectHost`
- `export function runtimeBinaryPath(platform: NodeJS.Platform = process.platform): string`
- `async function fetchForThisMachine(binary: string): Promise<string>`
- `export function ensureRuntimeBinary(): Promise<string>`

### src/integrations/harnesses/opencode/runtime/command.ts

- `export interface RuntimeLocations`
- `const positiveInteger = (value: unknown): number | undefined`
- `function fileReference(file: string): string`
- `export function runtimeConfig`
- `export function runtimeEnv(config: Record<string, unknown>, where: RuntimeLocations): Record<string, string>`
- `const at = (...parts: string[]): string`
- `export function runtimePrepareArgv(binary: string): string[]`
- `export function runtimeArgv`

### src/integrations/harnesses/opencode/runtime/index.ts

- `function writeKeyFile(file: string, key: string): void`
- `function installPlugin(directory: string): string`
- `async function prepareDatabase(directory: string, command: ReadyCommand, opts: RunAgentOptions): Promise<void>`
- `const prepared = (): boolean`
- `function sessionRecord(sessionId: string): Pick<AgentRunResult, "sessionId" | "usage">`

## src/integrations/harnesses/openhands/

### src/integrations/harnesses/openhands/index.ts

- `export class OpenhandsHarness implements AkmHarness`

## src/integrations/harnesses/pi/

### src/integrations/harnesses/pi/index.ts

- `export class PiHarness implements AkmHarness`

## src/integrations/session-logs/

### src/integrations/session-logs/index.ts

- `export function getAvailableHarnesses(): SessionLogHarness[]`

### src/integrations/session-logs/inline-refs.ts

- `export function extractInlineRefMentions(text: string, ts?: number): InlineRefMention[]`

### src/integrations/session-logs/pre-filter.ts

- `export interface PreFilterStats`
- `export interface PreFilterResult`
- `export interface PreFilterOptions`
- `function classifyEvent`
- `function decodeXmlEntities(text: string): string`
- `function diceSimilarity(a: string, b: string): number`
- `const bigrams = (s: string): Map<string, number> =>`
- `function dedupeTaskNotifications(kept: readonly SessionEvent[]): SessionEvent[]`
- `export function preFilterSession(data: SessionData, options: PreFilterOptions`
- `type KeptEvent = { event: SessionEvent; truncated: boolean; chars: number };`

### src/integrations/session-logs/provider-base.ts

- `export abstract class AbstractSessionLogProvider implements SessionLogHarness`

### src/integrations/session-logs/types.ts

- `export interface SessionEvent`
- `export interface SessionRef`
- `export interface SessionSummary extends SessionRef`
- `export interface InlineRefMention`
- `export interface SessionData`
- `export interface SessionLogHarness`
