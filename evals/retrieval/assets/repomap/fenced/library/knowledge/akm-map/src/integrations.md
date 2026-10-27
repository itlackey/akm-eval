---
description: "Repo map of akm src/integrations at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  integrations/
    agent/
      akm-read-tools.ts
      config.ts
      conversation-fallback.ts
      detect.ts
      execution.ts
      index.ts
      persona-fallback.ts
      profiles.ts
      prompts.ts
      request-lowering.ts
      resolution.ts
      runner-dispatch.ts
      runner.ts
      runtime-port.ts
      runtime.ts
      spawn.ts
    harnesses/
      aider/
        index.ts
      amazonq/
        index.ts
      claude/
        index.ts
        session-log.ts
      codex/
        index.ts
        session-log.ts
      copilot/
        index.ts
      gemini/
        index.ts
      opencode/
        runtime/
          binary.ts
          command.ts
          index.ts
        agent-builder.ts
        index.ts
        plugin-layout.ts
        roots.ts
        session-log-v1.ts
        session-log-v2.ts
        session-log.ts
        version.ts
      openhands/
        index.ts
      pi/
        index.ts
      harness.ts
      index.ts
    session-logs/
      index.ts
      inline-refs.ts
      pre-filter.ts
      provider-base.ts
      types.ts
    github.ts
    lockfile.ts
```

# Files

## File: src/integrations/agent/akm-read-tools.ts
```typescript
import { renderOutput } from "../../cli/shared";
import { akmSearch } from "../../commands/read/search";
import { runCurate } from "../../commands/read/search-cli";
import { akmShowUnified } from "../../commands/read/show";
import { loadConfig } from "../../core/config/config";
import { withQuiet } from "../../core/warn";
import { resolveUsageEventSource, type UsageEventSource } from "../../indexer/usage/usage-events";
import { resolveOutputMode } from "../../output/context";
import { stdoutText } from "../../output/stdout";
⋮----
export interface AkmReadToolContext {

  readonly eventSource?: string;
}
⋮----
export interface AkmReadTool {
  readonly name: "akm_search" | "akm_show" | "akm_curate";
  readonly description: string;

  readonly inputSchema: Record<string, unknown>;
  readonly run: (input: Record<string, unknown>, context?: AkmReadToolContext) => Promise<string>;
}
⋮----
const sourceOf = (context: AkmReadToolContext | undefined): UsageEventSource | undefined
⋮----
const str = (value: unknown): string | undefined
const positiveInt = (value: unknown): number | undefined
⋮----
function asCli(command: string, compute: (mode: ReturnType<typeof resolveOutputMode>) => Promise<unknown>)
⋮----
function required(input: Record<string, unknown>, key: string): string
```

## File: src/integrations/agent/config.ts
```typescript

```

## File: src/integrations/agent/conversation-fallback.ts
```typescript
import type { ResolvedConversationMessage } from "../../execution/resolved-request";
⋮----
export function composeConversationFallbackPrompt(
  conversation: readonly Readonly<ResolvedConversationMessage>[],
  command: string,
): string
```

## File: src/integrations/agent/detect.ts
```typescript
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { AkmConfig } from "../../core/config/config";
import { childProcessEnv } from "../../core/paths";
import { type AgentProfile, getBuiltinAgentProfile, listBuiltinAgentProfiles } from "./profiles";
⋮----
export type WhichFn = (bin: string) => string | undefined;
⋮----
export function defaultWhich(bin: string, envSource: NodeJS.ProcessEnv = process.env): string | undefined
⋮----
// Absolute / relative paths: caller already specified location.
⋮----
/* try the next extension */
⋮----
/* keep walking */
⋮----
/**
 * `<bin> --version`: its trimmed standard output, or undefined when it could not be run or did not
 * exit 0. The one version probe: OpenCode's major detection and `akm health` both ask it, and like
 * any program akm starts it gets the environment akm runs in.
 */
export function probeVersion(
  bin: string,
  timeoutMs: number,
  spawn: typeof childProcess.spawnSync = childProcess.spawnSync,
): string | undefined
⋮----
/** Windows PATHEXT default, used when the env carries no explicit list. */
⋮----
function executableSuffixes(envSource: NodeJS.ProcessEnv): string[]
⋮----
/** Result of probing one profile during setup. */
export interface AgentDetectionResult {
  /** Profile name. */
  name: string;
  /** Bin checked on PATH. */
  bin: string;
  /** Resolved path on PATH, or `undefined` when not found. */
  resolvedPath?: string;
  /** True iff the binary was found. */
  available: boolean;
}
⋮----
/** Profile name. */
⋮----
/** Bin checked on PATH. */
⋮----
/** Resolved path on PATH, or `undefined` when not found. */
⋮----
/** True iff the binary was found. */
⋮----
// ── Test seam ────────────────────────────────────────────────────────────────
// Swap-and-restore override. Inert in production; only tests call the setter.
interface AgentDetectOverridesForTests {
  detectAgentCliProfiles?: typeof detectAgentCliProfiles;
}
⋮----
/** TEST-ONLY. Swap the detection implementations; pass undefined to restore. */
export function _setAgentDetectForTests(fakes?: AgentDetectOverridesForTests): void
⋮----
/**
 * Probe every resolvable agent profile (built-ins plus user overrides)
 * for an installed CLI.
 *
 * @param agent  Optional `agent` config block. When omitted we probe the
 *               built-ins.
 * @param whichFn  Binary lookup. Tests should inject a stub.
 */
export function detectAgentCliProfiles(agent?: AkmConfig, whichFn: WhichFn = defaultWhich): AgentDetectionResult[]
⋮----
function probeProfile(profile: AgentProfile, whichFn: WhichFn): AgentDetectionResult
```

## File: src/integrations/agent/execution.ts
```typescript
import type { AkmConfig } from "../../core/config/config-types";
import type { StandardAlias } from "../../core/config/model-aliases";
import { ConfigError } from "../../core/errors";
import { PORTABLE_INFERENCE_KEYS } from "../../core/llm-inference";
import {
  createInlineResolvedCommand,
  createResolvedExecutionRequest,
  decodeResolvedExecutionRequest,
  type LoweringNotice,
  type ResolvedCommandContent,
  type ResolvedConversationMessage,
  type ResolvedExecutionRequestV1,
  type ResolvedModelSelection,
  type ResolvedPersonaContent,
} from "../../execution/resolved-request";
import { isPortableExecutionAgentSelector, type UnresolvedExecutionDefaults } from "../../execution/source";
import type { ChatCompletionOptions, ChatMessage } from "../../llm/client";
import { getHarness } from "../harnesses";
import { type AgentProfile, harnessProfile, runtimeProfile } from "./profiles";
import { lowerRequest, untranslated } from "./request-lowering";
import { mergeLayerInference, parseTimeout, resolveTarget, withReasoningEffort } from "./resolution";
import { decodeFrozenRunnerSpec, type RunnerSpec } from "./runner";
import { agentRuntime } from "./runtime";
import type { RunAgentOptions } from "./spawn";
⋮----
export interface ExecutionFieldProvenance {
  readonly layer: string;
  readonly kind: "agent" | "command" | "invocation-defaults" | "current" | "installation";

  readonly via: "explicit" | "source" | "default";
}
⋮----
export interface ExecutionLayer {
  readonly id: string;
  readonly kind: ExecutionFieldProvenance["kind"];
  readonly values: UnresolvedExecutionDefaults;
}
⋮----
export function shippedAlias(alias: StandardAlias): ExecutionLayer
⋮----
export function currentLayer(values: UnresolvedExecutionDefaults): ExecutionLayer
⋮----
export interface ResolveExecutionInput {

  readonly command?: ResolvedCommandContent;
  readonly content?: string;
  readonly argumentInput?: string;

  readonly config?: AkmConfig;

  readonly runner?: RunnerSpec;

  readonly conversation?: readonly Readonly<ResolvedConversationMessage>[];
  readonly persona?: ResolvedPersonaContent | null;

  readonly layers?: readonly ExecutionLayer[];

  readonly modelWork?: boolean;
}
⋮----
export interface ResolvedExecution {
  readonly request: ResolvedExecutionRequestV1;

  readonly runner: RunnerSpec;

  readonly provenance: Readonly<Record<string, ExecutionFieldProvenance>>;
}
⋮----
export interface BuiltExecution {
  readonly request: ResolvedExecutionRequestV1;
  readonly runner: RunnerSpec;

  readonly options: Readonly<RunAgentOptions>;

  readonly profile?: AgentProfile;

  readonly messages?: readonly ChatMessage[];
  readonly chatOptions?: Readonly<ChatCompletionOptions>;
  readonly notices: readonly Readonly<LoweringNotice>[];
}
⋮----
function has(values: object | null | undefined, key: string): boolean
⋮----
function nearest(
  layers: readonly ExecutionLayer[],
  key: keyof UnresolvedExecutionDefaults,
): ExecutionLayer | undefined
⋮----
function explicit(layer: ExecutionLayer): ExecutionFieldProvenance
⋮----
function recordInferenceProvenance(
  layers: readonly ExecutionLayer[],
  provenance: Record<string, ExecutionFieldProvenance>,
): void
⋮----
function applyLayers(runner: RunnerSpec, layers: readonly ExecutionLayer[]): RunnerSpec
⋮----
export function resolveExecution(input: ResolveExecutionInput): ResolvedExecution
⋮----
const select = (key: keyof UnresolvedExecutionDefaults, field: string): ExecutionLayer | undefined =>
⋮----
function nonEmpty(value: object | null | undefined): boolean
⋮----
function buildChat(
  request: ResolvedExecutionRequestV1,
  runner: Extract<RunnerSpec, { kind: "connection" }>,
  options: RunAgentOptions,
): BuiltExecution
⋮----
const skip = (field: string): void =>
⋮----
export function buildExecution(request: ResolvedExecutionRequestV1, runner: RunnerSpec): BuiltExecution
⋮----
export function buildExecutionFromWire(wire:
```

## File: src/integrations/agent/index.ts
```typescript

```

## File: src/integrations/agent/persona-fallback.ts
```typescript
import type { LoweringNotice } from "../../execution/resolved-request";
⋮----
export interface PersonaFallbackComposition {
  readonly prompt: string;
  readonly notices: readonly Readonly<LoweringNotice>[];
}
⋮----
function withTrailingNewline(value: string): string
⋮----
export function composePersonaFallbackPrompt(
  persona: string,
  command: string,
  adapter: string,
): PersonaFallbackComposition
```

## File: src/integrations/agent/profiles.ts
```typescript
import { HARNESS_REGISTRY } from "../harnesses";
import type { AkmHarness } from "../harnesses/harness";
import type { ConnectionRunner, HarnessRunner } from "./runner";
⋮----
export type AgentStdioMode = "captured" | "interactive";
⋮----
export interface AgentProfile {

  readonly name: string;

  readonly platform?: string;

  readonly bin: string;

  readonly args: readonly string[];

  readonly stdio: AgentStdioMode;

  readonly model?: string;
}
⋮----
function builtinProfiles(): Record<string, AgentProfile>
⋮----
export function getBuiltinAgentProfile(name: string): AgentProfile | undefined
⋮----
export function listBuiltinAgentProfiles(): Record<string, AgentProfile>
⋮----
export function harnessProfile(runner: HarnessRunner): AgentProfile
⋮----
export function runtimeProfile(connection: ConnectionRunner): AgentProfile
```

## File: src/integrations/agent/prompts.ts
```typescript
import reflectFeedbackFraming from "../../assets/prompts/reflect-feedback-framing.md" with { type: "text" };
import reflectLlmFramedContract from "../../assets/prompts/reflect-llm-framed-contract.md" with { type: "text" };
import reflectLlmSchemaContract from "../../assets/prompts/reflect-llm-schema-contract.md" with { type: "text" };
import reflectOutputRepair from "../../assets/prompts/reflect-output-repair.md" with { type: "text" };
import { placementTypes } from "../../core/asset/asset-placement";
import { parseRefInput } from "../../core/asset/resolve-ref";
import {
  authoringRulesForType,
  DESCRIPTION_MAX_CHARS,
  DESCRIPTION_MIN_CHARS,
  requiresDescription,
} from "../../core/authoring-rules";
import { isRecord } from "../../core/common";
import { parseEmbeddedJsonResponse, stripCodeFences, stripThinkBlocks } from "../../core/parse";
import type { Parsed } from "../../core/structured";
import type { ExecutionJsonObject } from "../../execution/json";
⋮----
export interface AgentProposalPayload {
  ref: string;
  content: string;
  frontmatter?: Record<string, unknown>;







  confidence?: number;
}
⋮----
function hintForType(type: string): string
⋮----
function knownTypeList(): string
⋮----
export interface RejectedProposalContext {

  ref: string;

  reason: string;




  contentPreview?: string;
}
⋮----
export interface ReflectPromptInput {
  ref?: string;
  type?: string;
  name?: string;

  assetContent?: string;

  feedback?: string[];

  schemaHints?: string[];

  task?: string;






  standardsContext?: string;





  avoidPatterns?: string[];





  rejectedProposals?: RejectedProposalContext[];

  outputMode?: ReflectOutputMode;







  contentBudgetChars?: number | null;
}
⋮----
export type ReflectOutputMode = "json_schema" | "framed_markdown";
⋮----
export function reflectResponseContract(mode: ReflectOutputMode, targetScoped: boolean): string
⋮----
export function buildReflectOutputRepairPrompt(mode: ReflectOutputMode, targetScoped: boolean): string
⋮----
function sourceHasNonEmptyDescription(assetContent: string | undefined): boolean
⋮----
// Match a top-level `description:` line and capture its inline value.
⋮----
/**
 * The frontmatter problems akm can see for itself, named in the prompt so the
 * model fixes them instead of having to spot them: a description split by a
 * stray period or carrying an escaped quote, no `when_to_use`, no title. A
 * missing description has its own instruction (#636).
 */
function frontmatterProblems(assetContent: string | undefined): string[]
⋮----
export interface ReflectPromptResult {

  prompt: string;
}
⋮----
export function buildReflectPrompt(input: ReflectPromptInput): ReflectPromptResult
⋮----
// #636 — synthesize-a-description instruction. Many source assets (notably
// scraped docs: `source`/`title`/`scraped`) carry frontmatter but NO
// `description`. Reflect echoes the source frontmatter, so the proposal
// inherits the missing description and the promote-time validator
// (isValidDescription, 20–400 chars) rejects it. The fix is at GENERATION
// time: when the source lacks a non-empty `description` and the type
// requires one, tell the model — unmissably — that it MUST author a valid
// `description`. (The validator/promote path is NOT changed: it must never
// fabricate content to pass itself.)
⋮----
// Cap defaults to REFLECT_CONTENT_CAP (12 000 chars) to stay well under OS
// ARG_MAX when the prompt is passed as a CLI argument — large assets (wiki
// snapshots, long runbooks) would otherwise trigger E2BIG on posix_spawn.
// A prompt on stdin or over HTTP never touches argv, so the caller passes a
// larger, context-aware `contentBudgetChars` (#952), or `null` for none; a
// number is never allowed below the flat floor, which the caller enforces.
⋮----
export interface ProposePromptInput {
  type: string;
  name: string;
  task: string;
  /** Optional extra schema hints. */
  schemaHints?: string[];
  /**
   * Standards "rulebook" for this write target — the wiki schema body (for a
   * wiki-page target) or the concatenated convention/meta fact bodies (for a
   * non-wiki asset target). Mutually exclusive by target; empty when neither
   * fires. Injected verbatim as its own prompt section before the proposal
   * contract.
   */
  standardsContext?: string;
}
⋮----
/** Optional extra schema hints. */
⋮----
/**
   * Standards "rulebook" for this write target — the wiki schema body (for a
   * wiki-page target) or the concatenated convention/meta fact bodies (for a
   * non-wiki asset target). Mutually exclusive by target; empty when neither
   * fires. Injected verbatim as its own prompt section before the proposal
   * contract.
   */
⋮----
/**
 * Build the prompt for `akm proposal new <type> <name> --task ...`. Asks the
 * model to author a brand-new asset of the given type fulfilling `task`, and
 * to return it as the JSON object of {@link RESPONSE_CONTRACT_JSON}.
 */
export function buildProposePrompt(input: ProposePromptInput): string
⋮----
/**
 * Parse agent stdout into a proposal payload. The agent contract requires a
 * single JSON object; anything else is reported as a parse error so callers
 * can map to {@link AgentFailureReason} `parse_error`.
 *
 * Resilient to two common local-LLM failure modes:
 *  1. `<think>…</think>` blocks emitted before the JSON (stripped before parsing).
 *  2. Prose preamble / postamble around the JSON object (handled by `extractEmbeddedJson`).
 */
export function parseAgentProposalPayload(stdout: string): AgentProposalPayload
⋮----
// Strip <think> blocks and fences, then attempt full parse with embedded fallback.
⋮----
// Agent output contains prose before/after the JSON object (e.g. a local
// LLM that narrates before responding). Try extracting the first balanced
// top-level `{…}` from the text rather than failing immediately.
⋮----
/**
 * The proposal in a parsed reply, or why the reply is not one: `ref` and
 * `content` must be non-empty strings. A malformed optional field is dropped,
 * never refused.
 */
export function validateProposalPayload(parsed: unknown): Parsed<AgentProposalPayload>
⋮----
// Phase 6A: extract optional `confidence` (number in [0, 1]). Clamp gently
// rather than reject — a model that returns 1.0 or 0 with extra precision
// (e.g. 1.0000001) should still surface a usable score. Anything that isn't
```

## File: src/integrations/agent/request-lowering.ts
```typescript
import { ConfigError } from "../../core/errors";
import { withSchemaInstruction } from "../../core/structured";
import type { LoweringNotice, ResolvedExecutionRequestV1 } from "../../execution/resolved-request";
import type { AgentDispatchRequest, LoweredAgentDispatch, LowerTarget } from "../harnesses/harness";
import { composeConversationFallbackPrompt } from "./conversation-fallback";
import { composePersonaFallbackPrompt } from "./persona-fallback";
⋮----
export function untranslated(adapter: string, field: string): Readonly<LoweringNotice>
⋮----
export function lowerRequest(target: LowerTarget, request: ResolvedExecutionRequestV1): LoweredAgentDispatch
⋮----
const skip = (field: string): void =>
```

## File: src/integrations/agent/resolution.ts
```typescript
import path from "node:path";
import { closestMatch } from "../../core/closest-match";
import {
  type AkmConfig,
  ambiguousDefaultAdvice,
  defaultConnection,
  defaultHarness,
  inheritedConnectionsOf,
  retiredEngineTargets,
  unusableEntryAt,
} from "../../core/config/config";
import type { ConnectionConfig, HarnessConfig } from "../../core/config/config-types";
import { apiKeyReference } from "../../core/config/credentials";
import { deepMergeConfig } from "../../core/config/deep-merge";
import { type ModelEntry, STANDARD_ALIASES } from "../../core/config/model-aliases";
import { ConfigError } from "../../core/errors";
import { type LlmInference, mergeRequestFields } from "../../core/llm-inference";
import { DURATION_UNITS, parseDuration } from "../../core/time";
import { warnOnce } from "../../core/warn";
import type { ExecutionJsonObject, ExecutionJsonValue } from "../../execution/json";
import { EXECUTION_MAX_TIMEOUT_MS } from "../../execution/limits";
import type { UnresolvedExecutionDefaults } from "../../execution/source";
import { getHarness, HARNESS_NATIVE_AGENT_IDS } from "../harnesses";
import { DEFAULT_AGENT_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS } from "./config";
import { getBuiltinAgentProfile } from "./profiles";
import type { ConnectionRunner, HarnessRunner, RunnerSpec } from "./runner";
⋮----
export interface ResolveTargetInput {
  readonly config: AkmConfig;

  readonly modelWork?: boolean;
  readonly layers: readonly UnresolvedExecutionDefaults[];
}
⋮----
function present(layer: UnresolvedExecutionDefaults, key: keyof UnresolvedExecutionDefaults): boolean
⋮----
function nearest<K extends keyof UnresolvedExecutionDefaults>(
  layers: readonly UnresolvedExecutionDefaults[],
  key: K,
): UnresolvedExecutionDefaults[K] | undefined
⋮----
export function parseTimeout(value: unknown): number | null
⋮----
export function withReasoningEffort(inference: ExecutionJsonObject): ExecutionJsonObject
⋮----
export function mergeLayerInference(
  layers: readonly UnresolvedExecutionDefaults[],
): ExecutionJsonObject | null | undefined
⋮----
type Target =
  | { readonly kind: "connection"; readonly name: string; readonly connection: ConnectionConfig }
  | { readonly kind: "harness"; readonly name: string; readonly harness: HarnessConfig };
⋮----
export function retiredEngineSelection(
  config: AkmConfig,
  name: string,
):
⋮----
function namedByLayers(
  config: AkmConfig,
  layers: readonly UnresolvedExecutionDefaults[],
  modelWork: boolean,
):
⋮----
function defaultTarget(config: AkmConfig, modelWork: boolean): Target | undefined
⋮----
function harnessesOnPlatform(config: AkmConfig, platform: string): string[]
⋮----
function harnessNamed(config: AkmConfig, selector: string):
⋮----
export function selectionNotConfigured(config: AkmConfig, kind: "connection" | "harness", name: string): ConfigError
⋮----
function selectTarget(input: ResolveTargetInput): Target
⋮----
function knownAliases(config: AkmConfig): ReadonlySet<string>
⋮----
function modelEntry(
  models: Readonly<Record<string, ModelEntry>>,
  requested: string | undefined,
  aliases: ReadonlySet<string>,
): ModelEntry | undefined
⋮----
function firstTimeout(...timeouts: readonly (number | null | undefined)[]): number | null
⋮----
function defaultTimeout(modelWork: boolean): number | null
⋮----
function layerTimeout(layers: readonly UnresolvedExecutionDefaults[]): number | null | undefined
⋮----
function connectionRunner(
  name: string,
  connection: ConnectionConfig,
  requested: string | undefined,
  aliases: ReadonlySet<string>,
  layers: readonly UnresolvedExecutionDefaults[],
  modelWork: boolean,
  inherited: boolean,
): ConnectionRunner
⋮----
function harnessAliasModel(name: string, alias: string, entry: NonNullable<HarnessConfig["models"]>[string]): string
⋮----
function harnessModel(
  name: string,
  platform: string,
  harness: HarnessConfig,
  requested: string | null | undefined,
  aliases: ReadonlySet<string>,
): string | undefined
⋮----
function harnessRunner(
  name: string,
  harness: HarnessConfig,
  requested: string | null | undefined,
  aliases: ReadonlySet<string>,
  layers: readonly UnresolvedExecutionDefaults[],
  modelWork: boolean,
): HarnessRunner
⋮----
export function resolveTarget(input: ResolveTargetInput): RunnerSpec
```

## File: src/integrations/agent/runner-dispatch.ts
```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AkmConfig } from "../../core/config/config";
import { resolveApiKey } from "../../core/config/credentials";
import { UsageError } from "../../core/errors";
import type { LlmInference } from "../../core/llm-inference";
import { collectInferredSecretValues, collectSensitiveValues, redactSensitiveText } from "../../core/redaction";
import type { ExecutionJsonObject } from "../../execution/json";
import { type ChatCompletionConfig, chatCompletion, LlmCallError } from "../../llm/client";
import { emitLlmUsage, type LlmUsageErrorCode } from "../../llm/usage-telemetry";
import { modelFromArgs } from "../harnesses/harness";
import type { BuiltExecution } from "./execution";
import { type AgentProfile, harnessProfile, runtimeProfile } from "./profiles";
import { mergeLayerInference, resolveTarget } from "./resolution";
import type { ConnectionRunner, RunnerSpec } from "./runner";
import { agentRuntime } from "./runtime";
import { type AgentFailureReason, type AgentRunResult, type RunAgentOptions, runAgent } from "./spawn";
⋮----
export interface RunExecutionOptions {

  readonly chat?: typeof chatCompletion;

  readonly onRetryAttempt?: () => void;

  readonly runAgent?: (profile: AgentProfile, opts: RunAgentOptions) => Promise<AgentRunResult>;

  readonly runSdk?: (
    profile: AgentProfile,
    opts: RunAgentOptions,
    connection: ChatCompletionConfig,
  ) => Promise<AgentRunResult>;

  readonly signal?: AbortSignal;

  readonly eventSource?: string;
}
⋮----
export function collectDispatchSensitiveValues(
  runner: RunnerSpec,
  envSource: NodeJS.ProcessEnv = process.env,
): string[]
⋮----
function redactResult(result: AgentRunResult, sensitiveValues: readonly string[]): AgentRunResult
⋮----
function llmFailureReason(error: unknown): AgentFailureReason
⋮----
type LlmCall = (connection: ChatCompletionConfig, opts: RunAgentOptions) => Promise<AgentRunResult>;
⋮----
function dispatchedModel(
⋮----
function recordDispatchUsage(execution: BuiltExecution, result: AgentRunResult): void
⋮----
export function materializeConnection(
  runner: ConnectionRunner,
  inference?: LlmInference | null,
  envSource: NodeJS.ProcessEnv = process.env,
): ChatCompletionConfig
⋮----
interface DispatchTarget {
  readonly runner: RunnerSpec;
  readonly profile?: AgentProfile;
  readonly inference?: LlmInference | null;

  readonly confined?: boolean;
}
⋮----
async function dispatchRunner(
  { runner, profile, inference, confined }: DispatchTarget,
  opts: RunAgentOptions,
  seams: RunExecutionOptions,
  llm?: LlmCall,
): Promise<AgentRunResult>
⋮----
const spawn = (spawnOpts: RunAgentOptions)
⋮----
async function inScratchDirectory(
  opts: RunAgentOptions,
  work: (opts: RunAgentOptions) => Promise<AgentRunResult>,
): Promise<AgentRunResult>
⋮----
function isConfinedAgentWork(execution: BuiltExecution): boolean
⋮----
function modelWorkAnswer(runner: RunnerSpec, result: AgentRunResult): AgentRunResult
⋮----
export async function runExecution(
  execution: BuiltExecution,
  options: RunExecutionOptions = {},
): Promise<AgentRunResult>
⋮----
// Returned rather than thrown so the redaction below covers provider bodies.
⋮----
// The LLM transport records each HTTP attempt itself.
⋮----
export interface InteractiveAgentInvocationOptions {
  readonly config: AkmConfig;
  /** What to launch, by name; omitted means the default harness. */
  readonly connection?: string;
  readonly harness?: string;
  /** The retired spelling of the two: a connection by that name, else a harness. */
  readonly engine?: string;
  /** The model it starts with, as an alias or an exact name. */
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly cwd?: string;
}
⋮----
/** What to launch, by name; omitted means the default harness. */
⋮----
/** The retired spelling of the two: a connection by that name, else a harness. */
⋮----
/** The model it starts with, as an alias or an exact name. */
⋮----
export interface InteractiveAgentInvocationResult {
  /** What was launched: the name of the harness or connection. */
  readonly engine: string;
  readonly result: AgentRunResult;
}
⋮----
/** What was launched: the name of the harness or connection. */
⋮----
/**
 * `akm agent` with no prompt: start the harness for a person to use, with the terminal
 * inherited and nothing to run (no `-p`, no empty turn). A connection has nothing
 * interactive to start, so it is refused rather than billed for an empty turn.
 */
export async function executeInteractiveAgentInvocation(
  input: InteractiveAgentInvocationOptions,
  seams: Pick<RunExecutionOptions, "runAgent"> = {},
): Promise<InteractiveAgentInvocationResult>
```

## File: src/integrations/agent/runner.ts
```typescript
import { isRecord } from "../../core/common";
import type { LlmInference } from "../../core/llm-inference";
⋮----
export interface ConnectionRunner {
  readonly kind: "connection";

  readonly name: string;
  readonly endpoint: string;
  readonly model: string;

  readonly request: Readonly<Record<string, unknown>>;

  readonly inference?: LlmInference;
  readonly apiKey?: string;




  readonly storedKey?: boolean;
  readonly contextLength?: number;
  readonly concurrency?: number;

  readonly timeoutMs: number | null;
}
⋮----
export interface HarnessRunner {
  readonly kind: "harness";
  readonly name: string;
  readonly platform: string;
  readonly bin: string;
  readonly args: readonly string[];
  readonly workspace?: string;

  readonly agent?: string;
  readonly model?: string;

  readonly timeoutMs: number | null;
}
⋮----
export type RunnerSpec = ConnectionRunner | HarnessRunner;
⋮----
export function decodeFrozenRunnerSpec(value: unknown): RunnerSpec
```

## File: src/integrations/agent/runtime-port.ts
```typescript
import type { ChatCompletionConfig } from "../../llm/client";
import type { LowerTarget } from "../harnesses/harness";
import type { AgentProfile } from "./profiles";
import type { AgentRunResult, RunAgentOptions } from "./spawn";
⋮----
export interface AgentRuntime {

  readonly lowering: LowerTarget;

  run(profile: AgentProfile, opts: RunAgentOptions, connection: ChatCompletionConfig): Promise<AgentRunResult>;

  pendingFetch(): string | undefined;

  fetch(): Promise<void>;
}
⋮----
run(profile: AgentProfile, opts: RunAgentOptions, connection: ChatCompletionConfig): Promise<AgentRunResult>;
⋮----
pendingFetch(): string | undefined;
⋮----
fetch(): Promise<void>;
```

## File: src/integrations/agent/runtime.ts
```typescript
import { opencodeRuntime } from "../harnesses/opencode/runtime";
import type { AgentRuntime } from "./runtime-port";
```

## File: src/integrations/agent/spawn.ts
```typescript
import { ConfigError } from "../../core/errors";
import { childProcessEnv } from "../../core/paths";
import { runManagedSubprocess, type StreamReadResult, streamCaptureFailure } from "../../core/subprocess";
import { getHarness } from "../harnesses";
import type { AgentDispatchRequest } from "../harnesses/harness";
import { DEFAULT_AGENT_TIMEOUT_MS } from "./config";
import type { AgentProfile, AgentStdioMode } from "./profiles";
⋮----
export type AgentFailureReason =
  | "timeout"
  | "spawn_failed"
  | "non_zero_exit"
  | "parse_error"
  | "cooldown"
  | "llm_rate_limit"
  | "llm_content_filter"
  | "llm_invalid_json"
  | "content_policy_reject"
  | "unsupported_type"
  | "no_change"
  | "quality_rejected"



  | "aborted";
⋮----
export interface RunAgentOptions {

  stdio?: AgentStdioMode;

  timeoutMs?: number | null;

  env?: Record<string, string>;

  cwd?: string;






  signal?: AbortSignal;

  dispatch?: AgentDispatchRequest;
}
⋮----
export interface AgentTokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
}
⋮----
export interface AgentRunResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  reason?: AgentFailureReason;

  llmErrorCode?: Exclude<import("../../llm/usage-telemetry").LlmUsageErrorCode, "unknown_error">;

  error?: string;

  usage?: AgentTokenUsage;

  sessionId?: string;
}
⋮----
export function buildChildEnv(options: Pick<RunAgentOptions, "env">): Record<string, string>
⋮----
function streamFailureMessage(label: string, stdout: StreamReadResult, stderr: StreamReadResult): string | undefined
⋮----
function failed(reason: AgentFailureReason, error: string, rest: Partial<AgentRunResult> =
⋮----
/**
 * Spawn the agent CLI `profile` names, with the command its harness builds from
 * `options.dispatch`, and return a structured result.
 *
 * Failure modes (see {@link AgentFailureReason}):
 *
 *   • `spawn_failed`  — the spawn call threw, or its output could not be captured.
 *   • `timeout`       — exceeded the resolved timeout.
 *   • `aborted`       — the caller's signal fired.
 *   • `non_zero_exit` — child exited with a non-zero code.
 *
 * `ok === true` requires exit code 0.
 */
export async function runAgent(profile: AgentProfile, options: RunAgentOptions =
⋮----
export interface ReadyCommand {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly stdin?: string | undefined;
}
⋮----
export async function runBuiltCommand(
  label: string,
  { argv, env, stdin }: ReadyCommand,
  options: RunAgentOptions,
  stdioMode: AgentStdioMode = options.stdio ?? "captured",
): Promise<AgentRunResult>
```

## File: src/integrations/harnesses/aider/index.ts
```typescript
import {
  type AgentDispatchRequest,
  type AkmHarness,
  type BuiltCommand,
  type HarnessSpawn,
  withoutModelFlag,
} from "../harness";
⋮----
export class AiderHarness implements AkmHarness
⋮----
build(
```

## File: src/integrations/harnesses/amazonq/index.ts
```typescript
import {
  type AgentDispatchRequest,
  type AkmHarness,
  type BuiltCommand,
  type HarnessSpawn,
  withoutLeading,
  withoutModelFlag,
} from "../harness";
⋮----
export class AmazonqHarness implements AkmHarness
⋮----
build(
```

## File: src/integrations/harnesses/claude/index.ts
```typescript
import type { SessionLogHarness } from "../../session-logs/types";
import {
  type AgentDispatchRequest,
  type AkmHarness,
  type BuiltCommand,
  type HarnessSpawn,
  modelFromArgs,
  withoutModelFlag,
} from "../harness";
import { ClaudeCodeProvider } from "./session-log";
⋮----
export class ClaudeHarness implements AkmHarness
⋮----
build(
```

## File: src/integrations/harnesses/claude/session-log.ts
```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractInlineRefMentions } from "../../session-logs/inline-refs";
import { AbstractSessionLogProvider } from "../../session-logs/provider-base";
import type {
  InlineRefMention,
  SessionData,
  SessionEvent,
  SessionLogHarness,
  SessionRef,
  SessionSummary,
} from "../../session-logs/types";
⋮----
function claudeProjectsDir(): string
⋮----
function subagentProvenance(jsonlPath: string): string
⋮----
function parseClaudeEvent(
  entry: unknown,
  sessionId: string | undefined,
  filePath: string,
  fallbackTsMs: number,
): SessionEvent | undefined
⋮----
export class ClaudeCodeProvider extends AbstractSessionLogProvider implements SessionLogHarness
⋮----
protected availabilityRoot(): string
⋮----
listSessions(input:
⋮----
readSession(ref: SessionRef): SessionData
```

## File: src/integrations/harnesses/codex/index.ts
```typescript
import type { SessionLogHarness } from "../../session-logs/types";
import {
  type AgentDispatchRequest,
  type AkmHarness,
  type BuiltCommand,
  type HarnessSpawn,
  modelFromArgs,
  withoutLeading,
  withoutModelFlag,
} from "../harness";
import { CodexProvider } from "./session-log";
⋮----
export class CodexHarness implements AkmHarness
⋮----
build(
```

## File: src/integrations/harnesses/codex/session-log.ts
```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractInlineRefMentions } from "../../session-logs/inline-refs";
import { AbstractSessionLogProvider } from "../../session-logs/provider-base";
import type {
  InlineRefMention,
  SessionData,
  SessionEvent,
  SessionLogHarness,
  SessionRef,
  SessionSummary,
} from "../../session-logs/types";
⋮----
function codexSessionsDir(): string
⋮----
interface RolloutMeta {
  startedAt?: number;

  cwd?: string;






  isAgent: boolean;
}
⋮----
function parseSessionMeta(entry: unknown): RolloutMeta | undefined
⋮----
function blockText(blocks: unknown, keep: (text: string) => boolean = () => true): string
⋮----
function toolInputText(input: unknown): string
⋮----
/**
 * Parse one rollout record into a normalized {@link SessionEvent}. The
 * conversation lives in `response_item` records; the rest (`event_msg` UI events
 * that repeat it, `turn_context`, `world_state`, token counts, compaction
 * markers) and items with nothing to read (`reasoning` is encrypted) give
 * `undefined`. Codex's `developer` messages are its own instructions, so they
 * are skipped too.
 *
 * Tool calls become `[tool:<name>] <input>` and their results `[tool_result]
 * <output>`, the shapes the Claude reader writes. A result is a `tool` event:
 * Codex has no enclosing user message to give it.
 */
function parseCodexRecord(
  entry: unknown,
  sessionId: string,
  filePath: string,
  fallbackTsMs: number,
): SessionEvent | undefined
⋮----
export class CodexProvider extends AbstractSessionLogProvider implements SessionLogHarness
⋮----
protected availabilityRoot(): string
⋮----
listSessions(input:
⋮----
readSession(ref: SessionRef): SessionData
```

## File: src/integrations/harnesses/copilot/index.ts
```typescript
import {
  type AgentDispatchRequest,
  type AkmHarness,
  type BuiltCommand,
  type HarnessSpawn,
  withoutModelFlag,
} from "../harness";
⋮----
export class CopilotHarness implements AkmHarness
⋮----
build(
```

## File: src/integrations/harnesses/gemini/index.ts
```typescript
import {
  type AgentDispatchRequest,
  type AkmHarness,
  type BuiltCommand,
  type HarnessSpawn,
  withoutModelFlag,
} from "../harness";
⋮----
export class GeminiHarness implements AkmHarness
⋮----
build(
```

## File: src/integrations/harnesses/opencode/runtime/binary.ts
```typescript
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { toErrorMessage } from "../../../../core/common";
import { fetchNpmPackageFiles, NPM_REGISTRY } from "../../../../core/npm-package";
import { getCacheDir } from "../../../../core/paths";
import { info } from "../../../../core/warn";
⋮----
export interface HostTraits {
  readonly platform: "linux" | "darwin" | "windows";
  readonly arch: "x64" | "arm64";

  readonly musl: boolean;

  readonly avx2: boolean;
}
⋮----
export function opencodePackage(
⋮----
function run(command: string, args: string[], timeout: number): SpawnSyncReturns<string>
⋮----
function hasAvx2(platform: HostTraits["platform"]): boolean
⋮----
function isMusl(): boolean
⋮----
export function detectHost(
  env: NodeJS.ProcessEnv = process.env,
  operatingSystem: NodeJS.Platform = process.platform,
  processArch: string = process.arch,
): HostTraits
⋮----
export function runtimeBinaryPath(platform: NodeJS.Platform = process.platform): string
⋮----
async function fetchForThisMachine(binary: string): Promise<string>
⋮----
export function ensureRuntimeBinary(): Promise<string>
```

## File: src/integrations/harnesses/opencode/runtime/command.ts
```typescript
import path from "node:path";
import { openAiBaseUrl } from "../../../../core/endpoint-url";
import { effectiveRequestFields } from "../../../../core/llm-inference";
import type { ChatCompletionConfig } from "../../../../llm/client";
import type { AgentDispatchRequest } from "../../harness";
⋮----
export interface RuntimeLocations {

  readonly binary: string;

  readonly directory: string;

  readonly pluginDirectory: string;

  readonly akm: readonly string[];
}
⋮----
const positiveInteger = (value: unknown): number | undefined
⋮----
function fileReference(file: string): string
⋮----
/** What OpenCode assumes of a model that states no limit. It refuses a model whose limit states only one of the two. */
⋮----
/**
 * The inline OpenCode config of a run. `keyFile` is where the connection's key is written for the run, when it has
 * one. `ambient` is the environment the process is started over: the plugin gives the commands the agent runs these
 * values back for the variables the run sets, and removes them where there is none.
 */
export function runtimeConfig(
  connection: ChatCompletionConfig,
  pluginDirectory: string,
  keyFile: string,
  ambient: Readonly<Record<string, string>> = {},
): Record<string, unknown>
⋮----
export function runtimeEnv(config: Record<string, unknown>, where: RuntimeLocations): Record<string, string>
⋮----
const at = (...parts: string[]): string
⋮----
export function runtimePrepareArgv(binary: string): string[]
⋮----
export function runtimeArgv(
  connection: ChatCompletionConfig,
  dispatch: AgentDispatchRequest,
  binary: string,
  session: string,
): string[]
```

## File: src/integrations/harnesses/opencode/runtime/index.ts
```typescript
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import akmPlugin from "../../../../assets/opencode/akm-plugin.js" with { type: "text" };
import { toErrorMessage, writeFileAtomic } from "../../../../core/common";
import {
  createLockPayload,
  probeLock,
  reclaimStaleLock,
  releaseLock,
  tryAcquireLockSync,
} from "../../../../core/file-lock";
import { PORTABLE_INFERENCE_KEYS } from "../../../../core/llm-inference";
import { openDatabase } from "../../../../storage/database";
import { resolveAkmInvocation } from "../../../../tasks/resolve-akm-bin";
import type { AgentRuntime } from "../../../agent/runtime-port";
import {
  type AgentRunResult,
  buildChildEnv,
  type ReadyCommand,
  type RunAgentOptions,
  runBuiltCommand,
} from "../../../agent/spawn";
import type { LowerTarget } from "../../harness";
import { akmOpencodeDatabasePath, akmRuntimeDir } from "../roots";
import { v2SessionTokens } from "../session-log-v2";
import { ensureRuntimeBinary, OPENCODE_RUNTIME_VERSION, runtimeBinaryPath } from "./binary";
import { type RuntimeLocations, runtimeArgv, runtimeConfig, runtimeEnv, runtimePrepareArgv } from "./command";
⋮----
function writeKeyFile(file: string, key: string): void
⋮----
function installPlugin(directory: string): string
⋮----
async function prepareDatabase(directory: string, command: ReadyCommand, opts: RunAgentOptions): Promise<void>
⋮----
const prepared = (): boolean
⋮----
function sessionRecord(sessionId: string): Pick<AgentRunResult, "sessionId" | "usage">
⋮----
async fetch()
async run(profile, opts, connection)
```

## File: src/integrations/harnesses/opencode/agent-builder.ts
```typescript
import { asRecord, parseJsonc } from "../../../core/common";
import { warnOnce } from "../../../core/warn";
import {
  type AgentDispatchRequest,
  type BuiltCommand,
  type HarnessBuilder,
  type HarnessSpawn,
  modelFromArgs,
  withoutLeading,
  withoutModelFlag,
} from "../harness";
import { detectOpencodeMajor, isOpencode2 } from "./version";
⋮----
function modelWorkConfig(): string
⋮----
function userConfig(content: string): Record<string, unknown> | undefined
⋮----
function jsoncObject(content: string): Record<string, unknown> | undefined
⋮----
function withEnvReferences(content: string): string
⋮----
const replaced = (escaped: boolean): string
⋮----
build(
```

## File: src/integrations/harnesses/opencode/index.ts
```typescript
import type { SessionLogHarness } from "../../session-logs/types";
import type { AkmHarness } from "../harness";
import { opencodeBuilder } from "./agent-builder";
import { OpenCodeProvider } from "./session-log";
import { isOpencode2, OPENCODE_BIN } from "./version";
⋮----
export class OpencodeHarness implements AkmHarness
```

## File: src/integrations/harnesses/opencode/plugin-layout.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { tryParseJson } from "../../../core/common";
import type { PluginHarness } from "../../../sources/types";
⋮----
export interface OpenCodeFlavor {
  harness: Extract<PluginHarness, "opencode" | "opencode-v2">;

  pkg: "akm-opencode" | "akm-opencode-v2";

  major: 1 | 2;

  configKeys: readonly string[];




  globalConfigOnly: boolean;

  cacheFolder: (spec: string) => string;

  nodeModulesDir: (folder: string) => string | undefined;

  refresh: (spec: string) => string[];





  replacesCache: boolean;
}
⋮----
export function newestBuildDir(folder: string): string | undefined
⋮----
export function readPackageVersion(file: string): string | undefined
```

## File: src/integrations/harnesses/opencode/roots.ts
```typescript
import os from "node:os";
import path from "node:path";
import { getDataDir } from "../../../core/paths";
⋮----
function xdgRoot(name: string, fallback: readonly string[], env: NodeJS.ProcessEnv): string
⋮----
function opencodeDataDir(env: NodeJS.ProcessEnv = process.env): string
⋮----
export function opencodeCacheDir(env: NodeJS.ProcessEnv = process.env): string
⋮----
export function opencodeConfigDir(env: NodeJS.ProcessEnv = process.env): string
⋮----
export function databaseIn(directory: string): string
⋮----
export function akmRuntimeDir(): string
⋮----
export function opencodeDatabasePath(env: NodeJS.ProcessEnv = process.env): string
⋮----
export function akmOpencodeDatabasePath(): string
```

## File: src/integrations/harnesses/opencode/session-log-v1.ts
```typescript
import type { Database } from "../../../storage/database";
import { extractInlineRefMentions } from "../../session-logs/inline-refs";
import type { InlineRefMention, SessionEvent } from "../../session-logs/types";
⋮----
export interface OpenCodeSessionMeta {
  sessionId: string;
  startedAt?: number;
  endedAt?: number;
  projectHint?: string;
  title?: string;
}
⋮----
export interface OpenCodeSessionRead {
  meta: OpenCodeSessionMeta;
  events: SessionEvent[];
  inlineRefs: InlineRefMention[];
}
⋮----
type SessionRow = {
  id: string;
  title: string | null;
  directory: string | null;
  time_created: number | null;
  time_updated: number | null;
};
⋮----
export function toMeta(r: Partial<SessionRow>, sessionId: string): OpenCodeSessionMeta
⋮----
export function listV1Sessions(db: Database, sinceMs: number): OpenCodeSessionMeta[]
⋮----
export function readV1Session(db: Database, harness: string, sessionId: string, filePath: string): OpenCodeSessionRead
```

## File: src/integrations/harnesses/opencode/session-log-v2.ts
```typescript
import { asRecord, tryParseJson } from "../../../core/common";
import type { Database } from "../../../storage/database";
import { extractInlineRefMentions } from "../../session-logs/inline-refs";
import type { InlineRefMention, SessionEvent } from "../../session-logs/types";
import { MODEL_WORK_AGENT } from "./agent-builder";
import { type OpenCodeSessionMeta, type OpenCodeSessionRead, toMeta } from "./session-log-v1";
⋮----
type Json = Record<string, unknown>;
⋮----
function asNumber(v: unknown): number | undefined
⋮----
function toolInputText(input: unknown): string
⋮----
/** Tool output blocks as text: text blocks verbatim, file blocks as a `[file: uri]` marker. */
function toolContentText(content: unknown): string
⋮----
function structuredErrorText(err: unknown): string
⋮----
export function opencodeMessageEvents(
  messages: readonly unknown[],
  harness: string,
  sessionId: string,
  filePath: string,
):
⋮----
const push = (role: SessionEvent["role"], text: string, ts: number | undefined) =>
⋮----
export function hasV2Tables(db: Database): boolean
⋮----
type V2SessionRow = {
  id: string;
  title: string | null;
  directory: string | null;
  time_created: number | null;
  time_updated: number | null;
};
⋮----
export function listV2Sessions(db: Database, sinceMs: number): OpenCodeSessionMeta[]
⋮----
export function v2SessionTokens(
  db: Database,
  sessionId: string,
):
⋮----
export function readV2Session(db: Database, harness: string, sessionId: string, filePath: string): OpenCodeSessionRead
```

## File: src/integrations/harnesses/opencode/session-log.ts
```typescript
import fs from "node:fs";
import { toErrorMessage } from "../../../core/common";
import { warnOnce } from "../../../core/warn";
import { type Database, openDatabase } from "../../../storage/database";
import { openSqliteReadSnapshot } from "../../../storage/sqlite-read-snapshot";
import { AbstractSessionLogProvider } from "../../session-logs/provider-base";
import type { SessionData, SessionLogHarness, SessionRef, SessionSummary } from "../../session-logs/types";
import { akmOpencodeDatabasePath, databaseIn, opencodeDatabasePath } from "./roots";
import { listV1Sessions, readV1Session, V1_TABLES } from "./session-log-v1";
import { hasV2Tables, listV2Sessions, readV2Session } from "./session-log-v2";
⋮----
type Layout = "v2" | "v1" | "unsupported";
⋮----
function layoutOf(db: Database): Layout
⋮----
export class OpenCodeProvider extends AbstractSessionLogProvider implements SessionLogHarness
⋮----
protected availabilityRoot(): string
⋮----
override isAvailable(): boolean
⋮----
async listSessions(
    input: { sinceMs?: number; location?: string; isolatedSnapshot?: boolean } = {},
): Promise<SessionSummary[]>
⋮----
async readSession(ref: SessionRef): Promise<SessionData>
```

## File: src/integrations/harnesses/opencode/version.ts
```typescript
import { warnOnce } from "../../../core/warn";
import { defaultWhich, probeVersion } from "../../agent/detect";
⋮----
interface OpencodeVersionInfo {

  readonly reportedMajor?: number;

  readonly version: string;

  readonly runnable: boolean;
}
⋮----
type OpencodeVersionProbe = (bin: string) => string | undefined;
⋮----
const defaultProbe: OpencodeVersionProbe = (bin)
⋮----
export function _setOpencodeVersionProbeForTests(fake?: OpencodeVersionProbe): void
⋮----
function lookup(bin: string): string | undefined
⋮----
function parseOpencodeMajor(versionOutput: string): number | undefined
⋮----
export function resolveOpencodeBin(): string
⋮----
export function detectOpencodeMajor(bin: string): OpencodeVersionInfo
⋮----
export function isOpencode2(bin: string): boolean
```

## File: src/integrations/harnesses/openhands/index.ts
```typescript
import type { AgentDispatchRequest, AkmHarness, BuiltCommand, HarnessSpawn } from "../harness";
⋮----
export class OpenhandsHarness implements AkmHarness
⋮----
build(
```

## File: src/integrations/harnesses/pi/index.ts
```typescript
import {
  type AgentDispatchRequest,
  type AkmHarness,
  type BuiltCommand,
  type HarnessSpawn,
  withoutModelFlag,
} from "../harness";
⋮----
export class PiHarness implements AkmHarness
⋮----
build(
```

## File: src/integrations/harnesses/harness.ts
```typescript
import type { LoweringNotice } from "../../execution/resolved-request";
import type { SessionLogHarness } from "../session-logs/types";
⋮----
export interface LowerTarget {

  readonly id: string;

  readonly systemPrompt: boolean;

  readonly nativeAgent: boolean;

  readonly confinable: boolean;

  readonly inference?: readonly string[];
}
⋮----
export interface HarnessSpawn {
  readonly bin: string;
  readonly args: readonly string[];
}
⋮----
export interface AgentDispatchRequest {

  prompt?: string;

  agent?: string;

  systemPrompt?: string;

  model?: string;

  modelWork?: boolean;
}
⋮----
export interface LoweredAgentDispatch {
  readonly dispatch: Readonly<AgentDispatchRequest>;
  readonly notices: readonly Readonly<LoweringNotice>[];
}
⋮----
export interface BuiltCommand {

  readonly argv: readonly string[];

  readonly env?: Readonly<Record<string, string>>;

  readonly stdin?: string;
}
⋮----
export interface HarnessProfileDefaults {

  readonly bin: string;

  readonly args: readonly string[];
}
⋮----
export interface AkmHarness extends LowerTarget {

  readonly id: string;
  readonly displayName: string;





  readonly setupDetectionDir?: string;
  readonly profile: HarnessProfileDefaults;




  readonly confinableInstalled?: (bin: string) => boolean;





  readonly models?: Readonly<Record<string, string>>;





  readonly identityEnv?: readonly string[];






  readonly presenceEnv?: readonly string[];
  readonly sessionLogProvider?: () => SessionLogHarness;

  build(spawn: HarnessSpawn, request: AgentDispatchRequest): BuiltCommand;
}
⋮----
build(spawn: HarnessSpawn, request: AgentDispatchRequest): BuiltCommand;
⋮----
export type HarnessBuilder = Pick<AkmHarness, "build">;
⋮----
export function modelFromArgs(args: readonly string[]): string | undefined
⋮----
export function withoutModelFlag(args: readonly string[]): string[]
⋮----
export function withoutLeading(args: readonly string[], subcommand: string): string[]
```

## File: src/integrations/harnesses/index.ts
```typescript
import type { SessionLogHarness } from "../session-logs/types";
⋮----
import { AiderHarness } from "./aider";
import { AmazonqHarness } from "./amazonq";
import { ClaudeHarness } from "./claude";
import { CodexHarness } from "./codex";
import { CopilotHarness } from "./copilot";
import { GeminiHarness } from "./gemini";
import type { AkmHarness } from "./harness";
import { OpencodeHarness } from "./opencode";
import { OpenhandsHarness } from "./openhands";
import { PiHarness } from "./pi";
⋮----
type SessionLogCapable = AkmHarness & { readonly sessionLogProvider: () => SessionLogHarness };
⋮----
export function getHarness(id: string): AkmHarness | undefined
```

## File: src/integrations/session-logs/index.ts
```typescript
import { getHarness, SESSION_LOG_HARNESSES } from "../harnesses";
import type {
  InlineRefMention,
  SessionData,
  SessionEvent,
  SessionLogHarness,
  SessionRef,
  SessionSummary,
} from "./types";
⋮----
export function getAvailableHarnesses(): SessionLogHarness[]
```

## File: src/integrations/session-logs/inline-refs.ts
```typescript
import type { InlineRefMention } from "./types";
⋮----
export function extractInlineRefMentions(text: string, ts?: number): InlineRefMention[]
```

## File: src/integrations/session-logs/pre-filter.ts
```typescript
import type { SessionData, SessionEvent } from "./types";
⋮----
export interface PreFilterStats {
  inputCount: number;
  outputCount: number;

  droppedByRule: Record<string, number>;

  truncatedCount: number;

  totalChars: number;





  budgetDroppedCount: number;
}
⋮----
export interface PreFilterResult {
  events: SessionEvent[];
  stats: PreFilterStats;
}
⋮----
export interface PreFilterOptions {
  akmReadOnlyOps?: ReadonlySet<string>;
  maxEventTextLength?: number;







  maxTotalChars?: number;
}
⋮----
function classifyEvent(
  event: SessionEvent,
  akmReadOnlyOps: ReadonlySet<string>,
  maxLen: number,
):
⋮----
// Rule 2-5: noise patterns
⋮----
// Rule 6: bare system events that are pure boilerplate (no engineering content).
// Heuristic: role=system AND short, OR role=system AND just contains `caveat`/`reminder` markers.
⋮----
function decodeXmlEntities(text: string): string
⋮----
function diceSimilarity(a: string, b: string): number
⋮----
const bigrams = (s: string): Map<string, number> =>
⋮----
function dedupeTaskNotifications(kept: readonly SessionEvent[]): SessionEvent[]
⋮----
export function preFilterSession(data: SessionData, options: PreFilterOptions =
⋮----
type KeptEvent = { event: SessionEvent; truncated: boolean; chars: number };
```

## File: src/integrations/session-logs/provider-base.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import type { SessionData, SessionLogHarness, SessionRef, SessionSummary } from "./types";
⋮----
export abstract class AbstractSessionLogProvider implements SessionLogHarness
⋮----
protected abstract availabilityRoot(): string;
⋮----
abstract listSessions(input?: {
    sinceMs?: number;
    location?: string;
    isolatedSnapshot?: boolean;
  }): SessionSummary[] | Promise<SessionSummary[]>;
abstract readSession(ref: SessionRef): SessionData | Promise<SessionData>;
⋮----
isAvailable(): boolean
⋮----
protected statSafe(target: string): fs.Stats | undefined
⋮----
protected *walkFiles(dir: string, matches: (fileName: string) => boolean): Generator<string>
⋮----
protected sessionRef(input: {
    sessionId: string;
    filePath: string;
    startedAt?: number;
    endedAt?: number;
    projectHint?: string;
    title?: string;
}): SessionSummary
⋮----
protected listSessionsFromFiles(input: {
    sinceMs: number;
enumerate: ()
```

## File: src/integrations/session-logs/types.ts
```typescript
export interface SessionEvent {
  harness: string;
  text: string;
  ts?: number;
  sessionId?: string;
  role?: "user" | "assistant" | "system" | "tool" | "unknown";
  filePath?: string;
}
⋮----
export interface SessionRef {

  harness: string;

  sessionId: string;

  filePath: string;
}
⋮----
export interface SessionSummary extends SessionRef {

  startedAt?: number;

  endedAt?: number;

  projectHint?: string;

  title?: string;
}
⋮----
export interface InlineRefMention {
  kind: "remember" | "feedback";

  ref?: string;

  text: string;

  ts?: number;
}
⋮----
export interface SessionData {
  ref: SessionSummary;
  events: SessionEvent[];
  inlineRefs: InlineRefMention[];
}
⋮----
export interface SessionLogHarness {
  readonly name: string;

  isAvailable(): boolean;








  listSessions(input?: {
    sinceMs?: number;
    location?: string;
    isolatedSnapshot?: boolean;
  }): SessionSummary[] | Promise<SessionSummary[]>;






  readSession(ref: SessionRef): SessionData | Promise<SessionData>;
}
⋮----
isAvailable(): boolean;
⋮----
listSessions(input?: {
    sinceMs?: number;
    location?: string;
    isolatedSnapshot?: boolean;
  }): SessionSummary[] | Promise<SessionSummary[]>;
⋮----
readSession(ref: SessionRef): SessionData | Promise<SessionData>;
```

## File: src/integrations/github.ts
```typescript
function readGithubTokenFromEnv(): string | undefined
⋮----
function readGithubTokenFromGhCli(): string | undefined
⋮----
function resolveGithubToken(): string | undefined
⋮----
export function githubHeaders(url?: string): HeadersInit
⋮----
export function asRecord(value: unknown): Record<string, unknown>
⋮----
export function asString(value: unknown): string | undefined
```

## File: src/integrations/lockfile.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { writeFileAtomic } from "../core/common";
import { ConfigError, rethrowIfTestIsolationError, TransientError } from "../core/errors";
import { createLockPayload, probeLock, reclaimStaleLock, releaseLock, tryAcquireLockSync } from "../core/file-lock";
import { classifyPathAccess, describeInaccessiblePath } from "../core/path-access";
import { getDataDir, getLockfileLockPath, getLockfilePath } from "../core/paths";
import { warn } from "../core/warn";
import type { InstallKind } from "../registry/types";
⋮----
export interface LockfileEntry {

  id: string;

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
export function _setLockAcquireTimeoutMsForTests(ms: number | undefined): void
⋮----
async function acquireLockSentinel(): Promise<() => void>
⋮----
export function readLockfile(): LockfileEntry[]
⋮----
function assertLockfilePathReadable(target: string): void
⋮----
function readLockfileOrThrow(): LockfileEntry[]
⋮----
export function lockContentRootFor(bundleId: string | undefined, type: string): string | undefined
⋮----
function writeLockfileUnlocked(entries: LockfileEntry[]): void
⋮----
export async function writeLockfile(entries: LockfileEntry[]): Promise<void>
⋮----
export async function upsertLockEntry(entry: LockfileEntry): Promise<void>
⋮----
export async function renameLockEntry(oldId: string, newId: string): Promise<boolean>
⋮----
export async function removeLockEntry(id: string): Promise<void>
⋮----
export function isValidLockfileEntry(value: unknown): value is LockfileEntry
```
