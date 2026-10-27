---
description: "Repo map of akm src/commands at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
`````
src/
  commands/
    agent/
      agent-dispatch.ts
      agent-support.ts
      contribute-cli.ts
    command/
      builtin-action.ts
      command-cli.ts
      command-execution.ts
      execution-source-loader.ts
      portable-template.ts
    env/
      child-env.ts
      env-binding.ts
      env-cli.ts
      env.ts
      secret-cli.ts
      secret.ts
    health/
      accept-rate.ts
      archive-usage.ts
      checks.ts
      config-skew.ts
      connections-and-harnesses-check.ts
      data-dir-usage.ts
      egress.ts
      html-report.ts
      improve-metrics.ts
      llm-usage.ts
      md-report.ts
      plugin-staleness.ts
      renderers.ts
      report-view-model.ts
      scheduler-binary.ts
      semantic-search-check.ts
      stash-exposure.ts
      task-runs.ts
      type-directory-check.ts
      types-checks.ts
      types-improve.ts
      types-metrics.ts
      types-result.ts
      types-runs.ts
      types-windows.ts
      types.ts
      version-drift.ts
      windows.ts
    improve/
      consolidate/
        chunking.ts
        continuity-check.ts
        coverage.ts
        pair-pass.ts
        sanitize.ts
      distill/
        content-repair.ts
        lesson-update.ts
      memory/
        derived-ref.ts
        memory-belief.ts
        memory-improve.ts
      autonomy-gate.ts
      consolidate.ts
      content-hash.ts
      distill-guards.ts
      distill-promotion-policy.ts
      distill.ts
      eligibility.ts
      encoding-salience.ts
      execution.ts
      extract-cli.ts
      extract-prompt.ts
      extract.ts
      feedback-valence.ts
      improve-cli.ts
      improve-report.ts
      improve-result-file.ts
      improve-run-types.ts
      improve-session.ts
      improve-strategies.ts
      improve-usage-report.ts
      improve.ts
      ledger.ts
      locks.ts
      loop-stages.ts
      outcome-loop.ts
      planner.ts
      preparation.ts
      proactive-maintenance.ts
      reflect-noise.ts
      reflect.ts
      retrieval-queries.ts
      retrieval-scope.ts
      salience.ts
      session-asset.ts
      stage.ts
    lint/
      base-linter.ts
      env-key-rules.ts
      index.ts
      markdown-insertion.ts
      types.ts
    metrics/
      collect.ts
      html-report.ts
      md-report.ts
      metrics-cli.ts
      report-view.ts
      types.ts
    proposal/
      validators/
        proposal-quality-validators.ts
        proposal-validators.ts
        proposals.ts
      diff-format.ts
      drain.ts
      proposal-cli.ts
      proposal-types.ts
      proposal.ts
      propose-cli.ts
      propose.ts
      repository.ts
    read/
      curate.ts
      knowledge.ts
      registry-search.ts
      remember-cli.ts
      search-cli.ts
      search.ts
      show.ts
    sources/
      add-cli.ts
      bundle-cli.ts
      bundle-config-ops.ts
      info.ts
      init.ts
      installed-stashes.ts
      migration-help.ts
      plugin-upgrade.ts
      schema-repair.ts
      self-update.ts
      source-add.ts
      source-clone.ts
      source-manage.ts
      sources-cli.ts
      stash-cli.ts
      stash-skeleton.ts
    tasks/
      explain.ts
      tasks-cli.ts
      tasks.ts
    ui/
      api.ts
      document-source.ts
      git-read.ts
      open-browser.ts
      proposal-actions.ts
      redact.ts
      server.ts
      ui-cli.ts
      workspace-actions.ts
    workflow/
      plan.ts
    completions.ts
    config-cli.ts
    feedback-cli.ts
    health.ts
    log.ts
    migrate-cli.ts
    migration-tool.ts
    models-cli.ts
    observability-cli.ts
    registry-cli.ts
    remember.ts
    targets.ts
    url-checker.ts
    workflow-cli.ts
`````

# Files

## File: src/commands/agent/agent-dispatch.ts
`````typescript
import type { AkmConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { warn } from "../../core/warn";
import type { LoweringNotice } from "../../execution/resolved-request";
import { isPortableExecutionAgentSelector, type UnresolvedExecutionDefaults } from "../../execution/source";
import { executeInteractiveAgentInvocation } from "../../integrations/agent/runner-dispatch";
import { executeCommandInvocation, type PrepareCommandInvocationOptions } from "../command/command-execution";
⋮----
export interface AkmAgentDispatchOptions {
  prompt?: string;

  agentRef?: string;
  agentConfig?: AkmConfig;
  timeoutMs?: number;




  cwd?: string;

  selection?: Pick<
    UnresolvedExecutionDefaults,
    "connection" | "harness" | "engine" | "model" | "inference" | "outputSchema"
  >;
}
⋮----
export interface AkmAgentDispatchSeams {
  readonly executeCommand?: (options: PrepareCommandInvocationOptions) => Promise<AkmAgentDispatchResult>;
  readonly executeInteractive?: typeof executeInteractiveAgentInvocation;
}
⋮----
export interface AkmAgentDispatchResult {
  schemaVersion: 2;
  ok: boolean;
  shape: "agent-result";
  engine: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  error?: string;
  reason?: string;

  sessionId?: string;

  warnings?: readonly string[];

  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
function canonicalCurrent(options: AkmAgentDispatchOptions): UnresolvedExecutionDefaults
⋮----
function rejectInvalidAgentRef(agentRef: string | undefined): void
⋮----
async function delegateCanonicalCommand(
  options: AkmAgentDispatchOptions,
  seams: AkmAgentDispatchSeams,
  action: { readonly content: string },
): Promise<AkmAgentDispatchResult>
⋮----
export async function akmAgentDispatch(
  options: AkmAgentDispatchOptions,
  seams: AkmAgentDispatchSeams = {},
): Promise<AkmAgentDispatchResult>
`````

## File: src/commands/agent/agent-support.ts
`````typescript
import type { AgentFailureReason, AgentRunResult } from "../../integrations/agent";
⋮----
export function baseFailureFields(
  result: AgentRunResult,
  fallbackReason: AgentFailureReason = "non_zero_exit",
):
⋮----
export function isEnoentFailure(result: Pick<AgentRunResult, "reason" | "error">): boolean
⋮----
export function enoentHintMessage(binName: string): string
`````

## File: src/commands/agent/contribute-cli.ts
`````typescript
import fs from "node:fs";
import { defineCommand } from "citty";
import { getStringArg, parsePositiveIntFlag } from "../../cli/parse-args";
import { RETIRED_ENGINE_ARG, SELECTION_ARGS, selectionFromArgs } from "../../cli/selection";
import { EXIT_CODES, GLOBAL_OUTPUT_ARGS, output, runWithJsonErrors } from "../../cli/shared";
import { loadConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { getHyphenatedBoolean } from "../../output/context";
import { akmLint } from "../lint/index";
import { akmAgentDispatch } from "./agent-dispatch";
⋮----
export function readPromptStdin(read: () => string = () => fs.readFileSync(0, "utf8")): string
⋮----
async run(
`````

## File: src/commands/command/builtin-action.ts
`````typescript
import { UsageError } from "../../core/errors";
import { assertSnapshotKeys, snapshotStrictRecord } from "../../execution/record";
⋮----
export type ParsedBuiltinCommandAction =
  | Readonly<{ kind: "stored"; ref: string; arguments?: string }>
  | Readonly<{ kind: "inline"; content: string; arguments?: string }>;
⋮----
export function parseBuiltinCommandAction(value: unknown): ParsedBuiltinCommandAction
`````

## File: src/commands/command/command-cli.ts
`````typescript
import { getStringArg, parsePositiveIntFlag } from "../../cli/parse-args";
import { RETIRED_ENGINE_ARG, SELECTION_ARGS, selectionFromArgs } from "../../cli/selection";
import { defineGroupCommand, defineJsonCommand, EXIT_CODES, output } from "../../cli/shared";
import { loadConfig } from "../../core/config/config";
import { isVerbose, setVerbose, warn, warnVerbose } from "../../core/warn";
import type { UnresolvedExecutionDefaults } from "../../execution/source";
import { lookupBundleRefReadonly } from "../../indexer/indexer";
import {
  dispatchPreparedCommandInvocation,
  inspectPreparedCommandInvocation,
  prepareCommandInvocation,
} from "./command-execution";
⋮----
function exactStringArg(args: unknown, key: string): string | undefined
⋮----
async run(
`````

## File: src/commands/command/command-execution.ts
`````typescript
import type { AkmConfig } from "../../core/config/config-types";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { UsageError } from "../../core/errors";
import { mergeNotices } from "../../execution/notices";
import {
  createInlineResolvedCommand,
  createResolvedCommand,
  createResolvedPersona,
  type LoweringNotice,
  type ResolvedCommandContent,
} from "../../execution/resolved-request";
import {
  type AdapterRenderedCommandSource,
  type AdapterRenderedExecutionSource,
  type AdapterRenderedPersonaSource,
  isPortableExecutionAgentSelector,
  type UnresolvedExecutionDefaults,
} from "../../execution/source";
import { recordIndexedShowUsage } from "../../indexer/usage/show-usage";
import { resolveUsageEventSource, type UsageEventSource } from "../../indexer/usage/usage-events";
import {
  buildExecution,
  currentLayer,
  type ExecutionFieldProvenance,
  type ExecutionLayer,
  type ResolvedExecution,
  resolveExecution,
  shippedAlias,
} from "../../integrations/agent/execution";
import { type RunExecutionOptions, runExecution } from "../../integrations/agent/runner-dispatch";
import type { AgentRunResult } from "../../integrations/agent/spawn";
import { parseBuiltinCommandAction } from "./builtin-action";
import {
  type ExecutionSourceLookup,
  type LoadAdapterExecutionSourceOptions,
  loadAdapterExecutionSource,
} from "./execution-source-loader";
import { applyPortableCommandArguments } from "./portable-template";
⋮----
export type CommandExecutionSourceLoader = (
  ref: string,
  kind: "command" | "persona",
  options?: LoadAdapterExecutionSourceOptions,
) => Promise<AdapterRenderedExecutionSource>;
⋮----
export interface PrepareCommandInvocationOptions {
  readonly action: unknown;
  readonly config: AkmConfig;
  readonly sourceLoader?: CommandExecutionSourceLoader;

  readonly sourceLookup?: ExecutionSourceLookup;
  readonly invocationDefaults?: UnresolvedExecutionDefaults;
  readonly current?: UnresolvedExecutionDefaults;

  readonly inlineContentMode?: "portable-template" | "literal";
}
⋮----
export type PreparedCommandInvocation = ResolvedExecution;
⋮----
export interface CommandDispatchResult {
  readonly schemaVersion: 2;
  readonly ok: boolean;
  readonly shape: "agent-result";
  readonly engine: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly error?: string;
  readonly reason?: string;

  readonly sessionId?: string;
  readonly warnings?: readonly string[];
  readonly notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export interface CommandDiagnosticProvenance {
  readonly field: string;
  readonly layer: string;
  readonly kind: ExecutionFieldProvenance["kind"];
  readonly via: ExecutionFieldProvenance["via"];
}
⋮----
export interface CommandDiagnosticNotice {
  readonly code: string;
  readonly severity: "info" | "warning";
  readonly adapter: string;
  readonly field?: string;
  readonly message: string;
}
⋮----
export interface CommandDryRunResult {
  readonly schemaVersion: 1;
  readonly shape: "command-dry-run";
  readonly ok: true;
  readonly dryRun: true;
  readonly engine: string;
  readonly provenance: readonly Readonly<CommandDiagnosticProvenance>[];
  readonly notices: readonly Readonly<CommandDiagnosticNotice>[];
}
⋮----
export interface DispatchPreparedCommandOptions {
  readonly runAgent?: RunExecutionOptions["runAgent"];
  readonly runSdk?: RunExecutionOptions["runSdk"];
  readonly signal?: RunExecutionOptions["signal"];
  readonly chat?: RunExecutionOptions["chat"];










  readonly eventSource?: UsageEventSource;
}
⋮----
function runOptionsFor(options: DispatchPreparedCommandOptions): RunExecutionOptions
⋮----
function own(value: object, key: PropertyKey): boolean
⋮----
function selectAgent(
  command: UnresolvedExecutionDefaults,
  invocationDefaults: UnresolvedExecutionDefaults | undefined,
  current: UnresolvedExecutionDefaults | undefined,
):
⋮----
function defaultSourceLoader(
  ref: string,
  kind: "command" | "persona",
  options?: LoadAdapterExecutionSourceOptions,
): Promise<AdapterRenderedExecutionSource>
⋮----
function qualifyCommandSelectedPersona(selector: string, command: AdapterRenderedCommandSource | undefined): string
⋮----
export async function prepareCommandInvocation(
  options: PrepareCommandInvocationOptions,
): Promise<PreparedCommandInvocation>
⋮----
function compareText(left: string, right: string): number
⋮----
function canonicalDiagnosticProvenanceField(field: string): string | undefined
⋮----
function canonicalDiagnosticNoticeField(field: string | null | undefined): string | undefined
⋮----
function diagnosticProvenance(
  provenance: ResolvedExecution["provenance"],
): readonly Readonly<CommandDiagnosticProvenance>[]
⋮----
function safeDiagnosticToken(value: string): boolean
⋮----
function safeDiagnosticNotice(notice: Readonly<LoweringNotice>): Readonly<CommandDiagnosticNotice> | undefined
⋮----
function diagnosticNotices(notices: readonly Readonly<LoweringNotice>[]): readonly Readonly<CommandDiagnosticNotice>[]
⋮----
export function inspectPreparedCommandInvocation(prepared: PreparedCommandInvocation): CommandDryRunResult
⋮----
function resultEnvelope(
  result: AgentRunResult,
  engine: string,
  warnings: readonly string[],
  notices: readonly Readonly<LoweringNotice>[],
): CommandDispatchResult
⋮----
export async function dispatchPreparedCommandInvocation(
  prepared: PreparedCommandInvocation,
  options: DispatchPreparedCommandOptions = {},
): Promise<CommandDispatchResult>
⋮----
// options.eventSource is only a FALLBACK — an ambient AKM_EVENT_SOURCE still
// wins. Absent, the default is "user".
⋮----
export async function executeCommandInvocation(
  options: PrepareCommandInvocationOptions,
  dispatchOptions: DispatchPreparedCommandOptions = {},
): Promise<CommandDispatchResult>
`````

## File: src/commands/command/execution-source-loader.ts
`````typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BundleAdapter } from "../../core/adapter/bundle-adapter";
import { adapterForId } from "../../core/adapter/registry";
import type { BundleComponent } from "../../core/adapter/types";
import { type BundleRef, parseBundleRef } from "../../core/asset/asset-ref";
import { isContainedResolvedPath, isWithin } from "../../core/common";
import { loadConfig } from "../../core/config/config";
import { bundleComponentConfig, bundlesToSourceEntries } from "../../core/config/config-sources";
import type { AkmConfig } from "../../core/config/config-types";
import { ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { warnOnce } from "../../core/warn";
import type {
  AdapterRenderedCommandSource,
  AdapterRenderedExecutionSource,
  AdapterRenderedPersonaSource,
} from "../../execution/source";
import { type IndexEntry, lookupBundleRef } from "../../indexer/indexer";
import { deriveInstallations } from "../../indexer/installations";
import { resolveEntryContentDir, resolveSourceEntries } from "../../indexer/search/search-source";
import { buildFileContext, type FileContext } from "../../indexer/walk/file-context";
⋮----
export type ExecutionSourceLookup = (ref: BundleRef) => Promise<IndexEntry | null>;
⋮----
export interface LoadAdapterExecutionSourceOptions {
  readonly config?: AkmConfig;
  readonly lookup?: ExecutionSourceLookup;
  readonly adapterFor?: (id: string) => BundleAdapter | undefined;

  readonly fileContext?: (stashRoot: string, file: string) => FileContext;
}
⋮----
async function defaultLookup(ref: BundleRef): Promise<IndexEntry | null>
⋮----
async function effectiveConfig(config: AkmConfig | undefined): Promise<AkmConfig>
⋮----
function realDirectory(value: string, label: string): string
⋮----
function realRegularFile(value: string, label: string): string
⋮----
function isLexicallyWithin(candidate: string, root: string): boolean
⋮----
function implicitComponentForEntry(entry: IndexEntry, config: AkmConfig): BundleComponent | undefined
⋮----
function componentForEntry(entry: IndexEntry, config: AkmConfig, realRoot: string): BundleComponent
⋮----
function expectedIndexedType(kind: "command" | "persona"): string
⋮----
function assertRenderedIdentity(source: AdapterRenderedExecutionSource, entry: IndexEntry, content: string): void
⋮----
export async function loadAdapterExecutionSource(
  refInput: string,
  expectedKind: "command",
  options?: LoadAdapterExecutionSourceOptions,
): Promise<AdapterRenderedCommandSource>;
export async function loadAdapterExecutionSource(
  refInput: string,
  expectedKind: "persona",
  options?: LoadAdapterExecutionSourceOptions,
): Promise<AdapterRenderedPersonaSource>;
export async function loadAdapterExecutionSource(
  refInput: string,
  expectedKind: "command" | "persona",
  options: LoadAdapterExecutionSourceOptions = {},
): Promise<AdapterRenderedExecutionSource>
`````

## File: src/commands/command/portable-template.ts
`````typescript
import { warn } from "../../core/warn";
⋮----
export interface AppliedPortableCommandArguments {
  readonly template: string;
  readonly argumentInput?: string;
  readonly content: string;
}
⋮----
export function validatePortableCommandTemplate(template: string, source: string): void
⋮----
export function applyPortableCommandArguments(
  template: string,
  argumentInput: string | undefined,
  source: string,
): AppliedPortableCommandArguments
`````

## File: src/commands/env/child-env.ts
`````typescript
export interface ChildEnvOptions {
  clean: boolean;
  inherit: string[];
}
⋮----
export function buildChildEnv(
  parentEnv: NodeJS.ProcessEnv,
  options: ChildEnvOptions,
): Record<string, string | undefined>
`````

## File: src/commands/env/env-binding.ts
`````typescript
import { isInstalledBundle, makeEnvRef, resolveEnvPath, resolveRefOwner } from "../../core/env-secret-ref";
import { NotFoundError, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { substituteRefTokens } from "../../core/ref-token";
import { readValue } from "../../core/secret-value";
import { warnOnce } from "../../core/warn";
import { loadEnv } from "./env";
⋮----
export interface ResolvedEnvBinding {

  ref: string;

  values: Record<string, string>;

  keys: string[];

  secretValues: string[];
}
⋮----
export function resolveRefToken(
  ref: string,
):
⋮----
export interface ResolveEnvBindingOptions {

  only?: string[];

  except?: string[];

  warn?: (message: string) => void;
}
⋮----
export function resolveEnvBinding(target: string, options: ResolveEnvBindingOptions =
`````

## File: src/commands/env/env-cli.ts
`````typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getParsedInvocation } from "../../cli/invocation";
import { getStringArg } from "../../cli/parse-args";
import { defineGroupCommand, defineJsonCommand, output } from "../../cli/shared";
import { writeFileAtomic } from "../../core/common";
import {
  listEnvsRecursive,
  makeEnvRef,
  resolveEnvPath,
  resolveEnvWriteTarget,
  sensitiveMarkerPath,
  withEnvSecretWrite,
} from "../../core/env-secret-ref";
import { ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { readStdin } from "../../runtime";
import { buildChildEnv } from "./child-env";
⋮----
async run()
⋮----
async run(
⋮----
async function runEnvInjected(
  target: string,
  opts: { only?: string[]; except?: string[]; clean?: boolean; inherit?: string[] },
): Promise<void>
⋮----
function parseKeyListFlag(raw: string | undefined): string[] | undefined
`````

## File: src/commands/env/env.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { scanEnvKeyNames, writeFileAtomic } from "../../core/common";
import { sensitiveMarkerPath } from "../../core/sensitive-marker-path";
⋮----
export function listKeys(envPath: string):
⋮----
export function loadEnv(envPath: string): Record<string, string>
⋮----
export function buildShellExportScript(envPath: string): string
⋮----
/** Create an empty env file (does nothing if it already exists). */
export function createEnv(envPath: string): void
⋮----
/**
 * Write (create or overwrite) an env file with the given text content,
 * atomically at mode 0600. Used to ingest an existing `.env` file
 * (`env create --from-file` / `--from-stdin`).
 */
export function writeEnv(envPath: string, content: string): void
⋮----
/** Remove an env file (and its `.sensitive` marker, if present). Returns true if it existed. */
export function removeEnv(envPath: string): boolean
⋮----
function ensureParentDir(filePath: string): void
`````

## File: src/commands/env/secret-cli.ts
`````typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getParsedInvocation } from "../../cli/invocation";
import { getStringArg } from "../../cli/parse-args";
import { defineGroupCommand, defineJsonCommand, output } from "../../cli/shared";
import { deriveCanonicalAssetName } from "../../core/asset/asset-placement";
import { loadConfig } from "../../core/config/config";
import {
  makeSecretRef,
  resolveSecretPath,
  resolveSecretWriteTarget,
  sensitiveMarkerPath,
  withEnvSecretWrite,
} from "../../core/env-secret-ref";
import { ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { resolveSourceEntries } from "../../indexer/search/search-source";
import { isFileOrFileSymlink } from "../../indexer/walk/walker";
import { readStdin } from "../../runtime";
import { buildChildEnv } from "./child-env";
⋮----
function parseKeyListFlag(raw: string | undefined): string[] | undefined
⋮----
function listSecretsRecursive(): Array<
⋮----
const walk = (dir: string): void =>
⋮----
async run()
⋮----
async run(
`````

## File: src/commands/env/secret.ts
`````typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { safeRealpath, writeFileAtomic } from "../../core/common";
import {
  createLockPayload,
  type LockOwnership,
  probeLock,
  reclaimStaleLock,
  releaseLock,
  tryAcquireLockSync,
} from "../../core/file-lock";
import { getDataDir } from "../../core/paths";
import { sleepSync } from "../../runtime";
⋮----
export function withSecretLock<T>(secretPath: string, fn: () => T): T
⋮----
export function secretLockPath(secretPath: string, platform = process.platform): string
⋮----
function ensureParentDir(filePath: string): void
⋮----
export function setSecret(secretPath: string, value: Buffer): void
`````

## File: src/commands/health/accept-rate.ts
`````typescript
import { resolveStashDir } from "../../core/common";
import { isProceduralRejection } from "../proposal/proposal-types";
import { listProposals, listProposalsReadOnly, type ProposalsContext } from "../proposal/repository";
⋮----
export interface AcceptRateEntry {

  source: string;

  total: number;

  accepted: number;

  rejected: number;

  pending: number;

  acceptRate: number | null;
}
⋮----
export function computeAcceptRateBySource(stashDir?: string, ctx?: ProposalsContext): AcceptRateEntry[]
⋮----
const countProposals = (statuses: Array<"pending" | "accepted" | "rejected">, includeArchive: boolean) =>
`````

## File: src/commands/health/archive-usage.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { MEMORY_ARCHIVE_REL } from "../../core/asset/memory-archive";
import { toPosix } from "../../core/common";
import { checkGitPathSafety, isGitBackedStash } from "../../sources/providers/git-stash";
import { MAX_WALK_ENTRIES, sizeOfPath } from "./data-dir-usage";
import type { HealthCheckResult } from "./types";
⋮----
export function collectArchiveUsageAdvisory(stashDir: string): HealthCheckResult | undefined
`````

## File: src/commands/health/checks.ts
`````typescript
import { EXTRACT_INFRASTRUCTURE_SKIP_REASONS } from "../../core/improve-types";
import { listPendingStateMigrations, type StateDatabaseMigrationReport } from "../../core/state-db";
import type { ExtractOutcomeCount } from "../../storage/repositories/extract-sessions-repository";
import {
  STATE_DB_FREELIST_WARN_RATIO,
  type StateDbFreelistInfo,
  type StateDbIntegrityResult,
} from "../../storage/state-db-integrity";
import { type SemanticSearchState, semanticSearchCheck } from "./semantic-search-check";
import { ACTIVE_RUN_WARN_MS, type HealthCheckResult, type ImproveHealthMetrics, TASK_FAIL_RATE_WARN } from "./types";
⋮----
export interface HealthCheckContext {
  stateDbPath: string;
  since: string;

  tableNames: string[];

  missingTables: string[];

  probe: { ok: boolean; durationMs: number | null; error?: string; skipped?: boolean };

  stateDbIntegrity: StateDbIntegrityResult;

  stateDbFreelist: StateDbFreelistInfo;

  stateDbMigrations: StateDatabaseMigrationReport;

  taskRowCount: number;

  taskFailRate: number;

  stuckActiveRuns: number;

  stuckActiveTasks: { taskId: string; ageMs: number }[];





  worstTaskFailRate: { taskId: string; rate: number; rows: number } | null;






  agentFailureReasonCounts: Record<string, number>;







  sessionExtractionLedger: { since: string; rows: ExtractOutcomeCount[] };
  autoAccept: ImproveHealthMetrics["autoAccept"];

  connectionsAndHarnesses: HealthCheckResult;

  semanticSearch: SemanticSearchState;







  versionDrift: HealthCheckResult;






  schedulerBinaryDrift: HealthCheckResult;
}
⋮----
export type HealthCheckChannel = "hard" | "advisory";
⋮----
export interface HealthCheck {
  name: string;
  channel: HealthCheckChannel;
  run(ctx: HealthCheckContext): HealthCheckResult;
}
⋮----
run(ctx: HealthCheckContext): HealthCheckResult;
⋮----
export interface PendingStateMigrationsCheckDependencies {
  listPendingStateMigrations?: (dbPath?: string) => string[];
}
⋮----
export function runPendingStateMigrationsCheck(
  stateDbPath: string,
  deps: PendingStateMigrationsCheckDependencies = {},
): HealthCheckResult
⋮----
export function appliedStateMigrationsCheck(
  stateDbPath: string,
  report: StateDatabaseMigrationReport,
): HealthCheckResult
⋮----
export function dominantAgentFailureReason(
  counts: Record<string, number>,
):
⋮----
const reasonFor = (row: (typeof rows)[number])
`````

## File: src/commands/health/config-skew.ts
`````typescript
import { readTextFile } from "../../core/common";
import { CURRENT_CONFIG_VERSION } from "../../core/config/config-schema";
import { compareConfigVersion } from "../../core/config/config-version";
import type { HealthCheckResult } from "./types";
⋮----
export function collectConfigSkewAdvisory(configPath: string): HealthCheckResult | undefined
`````

## File: src/commands/health/connections-and-harnesses-check.ts
`````typescript
import { spawnSync } from "node:child_process";
import { type AkmConfig, ambiguousDefaultAdvice, loadConfig } from "../../core/config/config";
import { defaultWhich, probeVersion, type WhichFn } from "../../integrations/agent/detect";
import { resolveTarget } from "../../integrations/agent/resolution";
import { type ChatCompletionConfig, probeEndpointOnce } from "../../llm/client";
import { type TargetRow, targetRows } from "../targets";
import type { HealthCheckResult } from "./types";
⋮----
export interface ReachabilityResult {
  reachable: boolean;
  error?: string;
}
export type ReachabilityProbe = (connection: Pick<ChatCompletionConfig, "endpoint">) => Promise<ReachabilityResult>;
⋮----
export interface ConnectionsAndHarnessesCheckDependencies {
  loadConfig?: () => AkmConfig;

  probeReachable?: ReachabilityProbe;
  spawnSync?: typeof spawnSync;
  which?: WhichFn;
  env?: NodeJS.ProcessEnv;
}
⋮----
async function probeConnections(config: AkmConfig, probe: ReachabilityProbe): Promise<Map<string, ReachabilityResult>>
⋮----
function harnessVersions(config: AkmConfig, which: WhichFn, spawn: typeof spawnSync): Map<string, string | undefined>
⋮----
function problems(rows: readonly TargetRow[], ambiguous: string | undefined): string[]
⋮----
/** The check for a table. `unknown` when nothing is configured: there is nothing to be wrong. */
export function connectionsAndHarnessesCheck(
  rows: readonly TargetRow[],
  probed: boolean,
  ambiguous?: string,
): HealthCheckResult
⋮----
export async function runConnectionsAndHarnessesCheck(
  deps: ConnectionsAndHarnessesCheckDependencies = {},
): Promise<HealthCheckResult>
`````

## File: src/commands/health/data-dir-usage.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import type { HealthCheckResult } from "./types";
⋮----
function liveDbBytesFor(name: string, sizes: ReadonlyMap<string,
⋮----
export interface WalkResult {
  bytes: number;

  files: number;
  truncated: boolean;
}
⋮----
export function sizeOfPath(
  root: string,
  budget: { remaining: number },
  onFile?: (filePath: string, bytes: number) => void,
): WalkResult
⋮----
function formatBytes(bytes: number): string
⋮----
interface DataDirSubdirUsage {
  name: string;
  bytes: number;
  percent: number;
}
⋮----
export function collectDataDirUsageAdvisory(dataDir: string): HealthCheckResult | undefined
`````

## File: src/commands/health/egress.ts
`````typescript
import { redactCredentialPatterns } from "../../core/redaction";
import { formatRegistryUrl } from "../../core/registry-url";
import type { HealthCheckResult } from "./types";
⋮----
export interface EgressConfigView {
  registries?: Array<{ url?: string; name?: string; enabled?: boolean }>;


  bundles?: Record<string, { path?: string; git?: string; website?: { url?: string }; npm?: string } | undefined>;
  connections?: Record<string, { endpoint?: string } | undefined>;
  embedding?: { endpoint?: string };
}
⋮----
export function collectEgressAdvisory(config: EgressConfigView | undefined): HealthCheckResult | undefined
`````

## File: src/commands/health/html-report.ts
`````typescript
import { escapeHtml, isoTimeTag } from "../../output/html-render";
import { pkgVersion } from "../../version";
import {
  buildHealthReportViewModel,
  compact,
  fmtMs,
  type HealthHtmlReportOptions,
  type HealthReportViewModel,
  humanize,
  num,
  type PendingProposalLike,
  type TrendDirection,
} from "./report-view-model";
import type { AkmHealthResult } from "./types";
⋮----
function trendClass(direction: TrendDirection): string
⋮----
function trendLabel(direction: TrendDirection): string
⋮----
function deltaPill(deltas: HealthReportViewModel["deltas"], key: string, lowerIsBetter = false): string
⋮----
type Priority = "P1" | "P2" | "P3";
⋮----
interface ActionItem {

  key: string;
  prio: Priority;
  cls: "warn" | "fail";
  title: string;

  descHtml: string;

  remedy?: string;
}
⋮----
function actionItemCard(item: ActionItem): string
⋮----
function passCard(title: string, desc: string): string
⋮----
// ── Status badges (presentation constants) ───────────────────────────────────
⋮----
// ── ECharts delivery ─────────────────────────────────────────────────────────
⋮----
/** Always CDN — see the module docstring's chunk-9 WI-9.4d note. Shared with the metrics dashboard. */
export function buildEchartsTag(): string
⋮----
/**
 * Build the time-slice `<option>`s for the report's filter bar, DERIVED from
 * the actual report window (`vm.sliceCandidates`) so the choices always make
 * sense (the old hard-coded 1d–21d list was useless on a 24h or 7d report).
 * "All" is the default; the sub-window options carry their cutoff in
 * milliseconds (consumed by filteredRuns), largest first.
 */
function buildSliceOptions(vm: HealthReportViewModel): string
⋮----
function renderSinceHuman(vm: HealthReportViewModel): string
⋮----
function renderStatusBadgeHtml(vm: HealthReportViewModel): string
⋮----
function renderExecSummary(vm: HealthReportViewModel): string
⋮----
const li = (k: string, vHtml: string) => `<li><span class="k">$
const trendLi = (k: string, d: TrendDirection)
⋮----
/**
 * Color is a health SIGNAL, not decoration: green/yellow/red where a card has
 * a meaningful threshold; "neutral" for purely-informational counts. Cards
 * are ordered by operator priority (failures first, informational counts
 * last).
 */
function renderKpiCards(vm: HealthReportViewModel): string
⋮----
const kpiCard = (color: string, label: string, value: string, sub: string, valueStyle = "")
⋮----
// #576: real LLM work — duration leads, tokens compact, not a GPU proxy.
⋮----
function renderSummaryRowsHtml(vm: HealthReportViewModel): string
⋮----
/**
 * Merge + de-duplicate advisories and the old "what to watch" cards (built
 * from the same VM data — invalid rows, sem-blocked, proposals, tail-latency,
 * failed-runs, …) into ONE prioritized list (P1/P2/P3 + a remediation command
 * per item), keyed so each concern appears exactly once.
 */
function renderActionItems(vm: HealthReportViewModel): string
⋮----
const pushItem = (item: ActionItem) =>
⋮----
// Hard advisories from the health check engine (own remediation in message).
⋮----
// Failed runs in window.
⋮----
// Semantic search blocked or unavailable.
⋮----
// Pending proposals to drain.
⋮----
// High tail latency.
⋮----
// Stale freshness.
⋮----
function renderProposalRowsHtml(vm: HealthReportViewModel): string
⋮----
export function buildHealthHtmlReplacements(
  result: AkmHealthResult,
  opts: HealthHtmlReportOptions,
): Record<string, string>
`````

## File: src/commands/health/improve-metrics.ts
`````typescript
import type { readEvents } from "../../core/events";
import { decodeImproveResult } from "../../core/improve-result";
import type { Database } from "../../storage/database";
import { type ImproveRunSummaryRow, queryImproveRuns } from "../../storage/repositories/improve-runs-repository";
import { decodeTaskHistoryMetadata, type TaskHistoryRow } from "../../storage/repositories/task-history-repository";
import type { ImproveHealthMetrics, ImproveRunSummary } from "./types";
⋮----
export function roundRate(value: number): number
⋮----
export function taskFailureDetail(row: TaskHistoryRow): Record<string, unknown> | undefined
⋮----
export function isAgentTaskHistoryRow(row: TaskHistoryRow): boolean
⋮----
export function countAgentFailureReasons(agentFailures: readonly TaskHistoryRow[]): Record<string, number>
⋮----
function decodeImproveResultRow(
  row: Pick<ImproveRunSummaryRow, "id" | "started_at" | "result_json">,
): Record<string, unknown> | undefined
⋮----
export function emptyImproveMetrics(): ImproveHealthMetrics
⋮----
function toFiniteNumber(value: unknown): number
⋮----
function applyAction(metrics: ImproveHealthMetrics, action: Record<string, unknown>): void
⋮----
function projectRunMetrics(result: Record<string, unknown>): ImproveHealthMetrics
⋮----
function finalizeImproveMetrics(metrics: ImproveHealthMetrics): void
⋮----
function mergeImproveMetrics(dst: ImproveHealthMetrics, src: ImproveHealthMetrics): void
⋮----
function compareImproveRunRecency(a: ImproveRunSummaryRow, b: ImproveRunSummaryRow): number
⋮----
export function summarizeImproveRuns(
  db: Database,
  since: string,
  until?: string,
):
⋮----
export function projectImproveRunSummary(
  row: ImproveRunSummaryRow,
  wallTimeMs: number,
  taskId: string,
): ImproveRunSummary
⋮----
export function computeWallTimeStats(durationsMs: number[]): ImproveHealthMetrics["wallTime"]
⋮----
const pick = (q: number)
⋮----
export function buildImproveSkipSummary(events: ReturnType<typeof readEvents>["events"]):
⋮----
export function computeWindowProposalCoverage(
  db: Database,
  since: string,
  until?: string,
): ImproveHealthMetrics["coverage"]
`````

## File: src/commands/health/llm-usage.ts
`````typescript
import { readEvents } from "../../core/events";
import { LLM_USAGE_EVENT } from "../../llm/usage-persist";
import { decodeLlmUsageRecord, type LlmUsageRecord } from "../../llm/usage-telemetry";
import type { LlmUsageAggregate, LlmUsageCrossTabRow, LlmUsageStageAggregate } from "./types";
⋮----
function emptyLlmUsageStageAggregate(): LlmUsageStageAggregate
⋮----
export function emptyLlmUsageAggregate(): LlmUsageAggregate
⋮----
export function summarizeLlmUsage(events: ReturnType<typeof readEvents>["events"]): LlmUsageAggregate
⋮----
export function readLlmUsageAggregate(
  stateDbPath: string,
  since: string,
  until?: string,
  readOnly = false,
): LlmUsageAggregate
⋮----
export function summarizeLlmUsageRecordsCrossTab(records: Iterable<LlmUsageRecord>): LlmUsageCrossTabRow[]
⋮----
export function summarizeLlmUsageCrossTab(events: ReturnType<typeof readEvents>["events"]): LlmUsageCrossTabRow[]
`````

## File: src/commands/health/md-report.ts
`````typescript
import type { DeltaEntry, ImproveRunSummary, WindowResult } from "./types";
import { INTERESTING_DELTA_PATHS, readNumericPath } from "./windows";
⋮----
function padRight(s: string, width: number): string
⋮----
function renderTable(headers: string[], rows: string[][]): string
⋮----
export function renderRunsDetailMd(runs: ImproveRunSummary[]): string
⋮----
export function renderWindowCompareMd(windows: WindowResult[], deltas: Record<string, DeltaEntry> | undefined): string
`````

## File: src/commands/health/plugin-staleness.ts
`````typescript
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  OPENCODE_V1,
  OPENCODE_V2,
  type OpenCodeFlavor,
  readPackageVersion,
} from "../../integrations/harnesses/opencode/plugin-layout";
import { opencodeCacheDir } from "../../integrations/harnesses/opencode/roots";
import { isExactSemver, isSemverRange, maxSatisfying, satisfiesRange } from "../../registry/semver";
import type { HealthCheckResult } from "./types";
⋮----
function claudePluginsDir(): string
⋮----
function defaultOpencodeCacheRoot(): string
⋮----
interface BundledAkm {

  spec?: string;
  version: string;
}
⋮----
interface OpencodePluginLocation {
  flavor: OpenCodeFlavor;

  advisory: string;

  label: string;

  remedy: string;

  folders: (cacheRoot: string) => { spec?: string; folder: string }[];
}
⋮----
/**
 * The bundled `akm-cli` of each cached copy of `plugin`: its `package.json` is read, never executed,
 * mirroring {@link detectInstalledPlugins}'s manifest read. Copies with no bundled akm-cli are skipped.
 */
function findBundledAkm(plugin: OpencodePluginLocation, cacheRoot: string): BundledAkm[]
⋮----
function buildOpencodeBundledAdvisory(
  plugin: OpencodePluginLocation,
  bundled: BundledAkm,
  cliVersion: string,
): HealthCheckResult
⋮----
interface DetectedPlugin {
  harness: "claude";
  marketplace: string;
  pluginName: string;
  version: string;
  pluginDir: string;
}
⋮----
function detectInstalledPlugins(pluginsRoot: string): DetectedPlugin[]
⋮----
function readVersionRange(pluginDir: string): string | undefined
⋮----
export type ListRemoteTagsFn = (marketplaceDir: string) => string[] | undefined;
⋮----
const realListRemoteTags: ListRemoteTagsFn = (marketplaceDir) =>
⋮----
/** Options for {@link collectPluginStalenessAdvisories}. */
export interface PluginStalenessOptions {
  /** Root of the Claude plugin tree (contains `cache/` and `marketplaces/`). Defaults to `claudePluginsDir()`. */
  pluginsRoot?: string;
  /** The running akm-cli version to check plugin compatibility against. */
  cliVersion: string;
  /**
   * Whether check 2 may ask the remote for tags (`akm health --probe`, on by
   * default; `--no-probe` passes `false`). Defaults to `true` here so callers
   * that inject `listRemoteTags` need not repeat it; `health.ts` always passes it.
   */
  probe?: boolean;
  /** Injectable remote-tag lister; defaults to the real `git ls-remote`. */
  listRemoteTags?: ListRemoteTagsFn;
  /** Root of OpenCode's package cache. Defaults to `defaultOpencodeCacheRoot()`. */
  opencodeCacheRoot?: string;
}
⋮----
/** Root of the Claude plugin tree (contains `cache/` and `marketplaces/`). Defaults to `claudePluginsDir()`. */
⋮----
/** The running akm-cli version to check plugin compatibility against. */
⋮----
/**
   * Whether check 2 may ask the remote for tags (`akm health --probe`, on by
   * default; `--no-probe` passes `false`). Defaults to `true` here so callers
   * that inject `listRemoteTags` need not repeat it; `health.ts` always passes it.
   */
⋮----
/** Injectable remote-tag lister; defaults to the real `git ls-remote`. */
⋮----
/** Root of OpenCode's package cache. Defaults to `defaultOpencodeCacheRoot()`. */
⋮----
/**
 * Build one `plugin-version` advisory per detected `akm` harness plugin,
 * plus one `opencode-plugin-version` advisory when the
 * OpenCode plugin's bundled `akm-cli` is found — it shares the host's
 * databases in-process, so its lag matters the same way a stale Claude
 * plugin's does. Returns `[]` when neither is installed — the benign,
 * common case.
 */
export function collectPluginStalenessAdvisories(options: PluginStalenessOptions): HealthCheckResult[]
⋮----
function buildAdvisory(
  plugin: DetectedPlugin,
  cliVersion: string,
  pluginsRoot: string,
  listRemoteTags: ListRemoteTagsFn,
  probe: boolean,
): HealthCheckResult
⋮----
// Point 2: newest available vs. installed, via the marketplace clone's remote.
`````

## File: src/commands/health/renderers.ts
`````typescript
import { renderHtml, resolveTemplatePath } from "../../output/html-render";
import { registerMdRenderer } from "../../output/render-registry";
import { buildHealthHtmlReplacements } from "./html-report";
import { renderRunsDetailMd, renderWindowCompareMd } from "./md-report";
import type { AkmHealthResult } from "./types-result";
⋮----
function isHealthResult(value: unknown): value is AkmHealthResult
⋮----
export function renderHealthHtml(result: unknown): string | null
`````

## File: src/commands/health/report-view-model.ts
`````typescript
import {
  type AkmHealthResult,
  type DeltaEntry,
  type HealthCheckResult,
  type ImproveRunSummary,
  TASK_FAIL_RATE_WARN,
} from "./types";
⋮----
export interface PendingProposalLike {
  ref: string;
  source: string;
  createdAt: string;
}
⋮----
export interface HealthHtmlReportOptions {

  window: string;

  compare: string;

  comparisonMode?: "duration" | "custom";

  proposals: PendingProposalLike[];






  deltas?: Record<string, DeltaEntry>;
}
⋮----
export function num(value: number): string
⋮----
export function compact(value: number): string
⋮----
export function humanize(raw: string): string
⋮----
export function fmtMs(ms: number): string
⋮----
export function pct(rate: number, digits: number): string
⋮----
export type TrendDirection = "up" | "down" | "flat";
⋮----
function coercePct(raw: number | string | undefined): number | undefined
⋮----
// ── Per-run reshape (port of collect.py reshape_run) ─────────────────────────
⋮----
/**
 * Fields the HTML report actually reads — either server-side
 * (`html-report.ts`'s `vm.latest`/`vm.lastRun`) or client-side (the `RUNS`
 * array embedded via `%%RUNS_JS_CONST%%`, consumed by
 * `src/assets/templates/html/health.html`'s chart/table script). A per-run
 * counter that neither reads does not belong here, even though the
 * underlying `ImproveRunSummary` may still carry it for `--group-by run` /
 * the Markdown renderer (see `./types-runs.ts`, `./md-report.ts`).
 */
export interface ReportRun {
  id: string;
  resultStatus: "valid" | "invalid";
  resultComplete: boolean;
  taskId: string;
  strategy: string | null;
  startedAt: string;
  completedAt: string;
  wallTimeMs: number;
  ok: boolean;
  consDurationMs: number;
  miDurationMs: number;
  otherMs: number;
  promoted: number;
  merged: number;
  deleted: number;
  contradicted: number;
  judgedNoAction: number;
  miWritten: number;
  distillByReason: Record<string, number>;
  reflectOk: number;
  reflectFailed: number;
  derived: number;
  eligible: number;
  lintFlagged: number;
  lintFixed: number;
}
⋮----
function reshapeRun(r: ImproveRunSummary): ReportRun
⋮----
function compareRuns(a: ReportRun, b: ReportRun): number
⋮----
function classify(deltas: Record<string, DeltaEntry>, metricKeys: string[], lowerIsBetter = false): TrendDirection
⋮----
export interface TrendBlock {
  decisionQuality: TrendDirection;
  outputVolume: TrendDirection;
  latency: TrendDirection;
  overall: "improving" | "degrading" | "mixed";
}
⋮----
function buildTrend(deltas: Record<string, DeltaEntry>): TrendBlock
⋮----
export interface SemSearchStatus {

  label: string;
  status: HealthCheckResult["status"];

  detail: string;
}
⋮----
function readSemSearch(hardChecks: HealthCheckResult[]): SemSearchStatus
⋮----
export function windowToMs(window: string): number
⋮----
function computeSliceCandidates(window: string): Array<[number, string]>
⋮----
export type SummaryRow = [label: string, value: string, trend: TrendDirection, tooltip?: string];
⋮----
export interface HealthReportViewModel {

  window: string;
  compare: string;
  comparisonMode: "duration" | "custom";
  sinceIso: string;
  reportDate: string;
  reportTitle: string;
  generatedAt: string;
  isStale: boolean;


  runs: ReportRun[];
  invalidRuns: ReportRun[];
  lastRun: ReportRun | undefined;

  latest: ReportRun | undefined;
  totalRuns: number;
  failedRuns: number;


  status: AkmHealthResult["status"];
  failOk: boolean;

  statusLabel: string;


  consolidation: AkmHealthResult["improve"]["consolidation"];
  memoryInference: AkmHealthResult["improve"]["memoryInference"];
  wallTime: AkmHealthResult["improve"]["wallTime"];
  coverage: AkmHealthResult["improve"]["coverage"];
  llm: AkmHealthResult["metrics"]["llmUsage"];
  memorySummary: AkmHealthResult["improve"]["memorySummary"];
  includedResultRows: number;
  skippedInvalidResultRows: number;
  invoked: number;
  completed: number;
  miWritten: number;


  completionRate: string;
  completionPct: number;
  taskFailRate: string;
  agentFailRate: string;
  miYieldRate: string;
  medianDurMin: string;
  p95DurMin: string;
  avgPromoted: string;
  chunkFail: string;
  llmTokensCompact: string;


  trend: TrendBlock;
  deltas: Record<string, DeltaEntry>;


  sem: SemSearchStatus;


  proposals: PendingProposalLike[];

  proposalsBySource: Array<[string, number]>;


  concerns: string[];
  trendClause: string;
  verdictWord: string;
  verdictRest: string;


  summaryRows: SummaryRow[];


  sliceCandidates: Array<[number, string]>;


  distillReasons: string[];


  advisories: HealthCheckResult[];
}
⋮----
interface RunsPhase {
  runs: ReportRun[];
  invalidRuns: ReportRun[];
}
⋮----
function partitionRuns(result: AkmHealthResult): RunsPhase
⋮----
type AggregatesPhase = Pick<
  HealthReportViewModel,
  | "consolidation"
  | "memoryInference"
  | "wallTime"
  | "coverage"
  | "llm"
  | "memorySummary"
  | "includedResultRows"
  | "skippedInvalidResultRows"
  | "invoked"
  | "completed"
  | "miWritten"
  | "completionRate"
  | "completionPct"
  | "taskFailRate"
  | "agentFailRate"
  | "miYieldRate"
  | "medianDurMin"
  | "p95DurMin"
  | "avgPromoted"
  | "chunkFail"
  | "llmTokensCompact"
  | "totalRuns"
  | "failedRuns"
>;
⋮----
function buildAggregatesPhase(result: AkmHealthResult, runsPhase: RunsPhase): AggregatesPhase
⋮----
type MetaPhase = Pick<
  HealthReportViewModel,
  "sinceIso" | "reportDate" | "reportTitle" | "generatedAt" | "isStale" | "lastRun" | "latest"
>;
⋮----
function buildMetaPhase(result: AkmHealthResult, runs: ReportRun[]): MetaPhase
⋮----
type VerdictPhase = Pick<
  HealthReportViewModel,
  "status" | "failOk" | "statusLabel" | "concerns" | "trendClause" | "verdictWord" | "verdictRest"
>;
⋮----
function buildVerdictPhase(
  result: AkmHealthResult,
  trend: TrendBlock,
  sem: SemSearchStatus,
  proposals: PendingProposalLike[],
  failedRuns: number,
): VerdictPhase
⋮----
function computeDistillReasons(runs: ReportRun[]): string[]
⋮----
function groupProposalsBySource(proposals: PendingProposalLike[]): Array<[string, number]>
⋮----
function buildSummaryRows(aggregates: AggregatesPhase, trend: TrendBlock): SummaryRow[]
⋮----
export function buildHealthReportViewModel(
  result: AkmHealthResult,
  opts: HealthHtmlReportOptions,
): HealthReportViewModel
`````

## File: src/commands/health/scheduler-binary.ts
`````typescript
import { spawnSync } from "node:child_process";
import { selectBackend } from "../../tasks/backends";
import type { SchedulerBackend } from "../../tasks/backends/types";
import { pkgVersion } from "../../version";
import type { HealthCheckResult } from "./types";
⋮----
export interface SchedulerBinaryDriftDependencies {

  backend?: SchedulerBackend;

  spawnSync?: typeof spawnSync;

  cliVersion?: string;
}
⋮----
export async function collectSchedulerBinaryAdvisory(
  probe: boolean,
  deps: SchedulerBinaryDriftDependencies = {},
): Promise<HealthCheckResult>
`````

## File: src/commands/health/semantic-search-check.ts
`````typescript
import { getDbPath } from "../../core/paths";
import { SEMANTIC_SEARCH_META_KEY, type SemanticSearchRecord } from "../../indexer/walk/index-context";
import { LOCAL_EMBEDDING_RUNTIME } from "../../llm/embedders/local";
import { closeDatabase, openReadonlyExistingDatabase } from "../../storage/repositories/index-connection";
import { getEmbeddableEntryCount } from "../../storage/repositories/index-entries-repository";
import { getMeta } from "../../storage/repositories/index-meta-repository";
import { getEmbeddingCount } from "../../storage/repositories/index-vec-repository";
import type { HealthCheckResult } from "./types";
⋮----
export interface SemanticSearchState {

  mode?: string;

  index?: { record?: SemanticSearchRecord; builtAt?: string; entryCount: number; embeddingCount: number };

  error?: string;
}
⋮----
export function readSemanticSearchState(mode: string | undefined): SemanticSearchState
⋮----
export function semanticSearchCheck(state: SemanticSearchState): HealthCheckResult
⋮----
const result = (
    status: HealthCheckResult["status"],
    message: string,
    evidence?: Record<string, unknown>,
): HealthCheckResult => (
`````

## File: src/commands/health/stash-exposure.ts
`````typescript
import { spawnSync } from "node:child_process";
import type { HealthCheckResult } from "./types";
⋮----
export type GitRunner = (stashDir: string, args: string[]) => { ok: boolean; stdout: string };
⋮----
const realGit: GitRunner = (stashDir, args) =>
⋮----
/**
 * Build the `stash-git-exposure` advisory, or `undefined` when there is nothing
 * to warn about (not a git repo, no tracked env/secret assets, or no remote).
 */
export function collectStashExposureAdvisory(
  stashDir: string,
  git: GitRunner = realGit,
): HealthCheckResult | undefined
⋮----
// Not a git work tree → nothing to expose.
`````

## File: src/commands/health/task-runs.ts
`````typescript
import type { Database } from "../../storage/database";
import { queryImproveRuns } from "../../storage/repositories/improve-runs-repository";
import { queryTaskHistory } from "../../storage/repositories/task-history-repository";
import { projectImproveRunSummary } from "./improve-metrics";
import type { ImproveRunSummary } from "./types";
⋮----
interface ImproveTaskRun {
  taskId: string;
  startMs: number;
  endMs: number;
}
⋮----
function loadImproveTaskRuns(db: Database, since: string, until?: string): ImproveTaskRun[]
⋮----
export function matchImproveTaskId(startedAt: string, completedAt: string, taskRuns: ImproveTaskRun[]): string
⋮----
export function buildPerRunSummaries(db: Database, since: string, until?: string): ImproveRunSummary[]
`````

## File: src/commands/health/type-directory-check.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import type { HealthCheckResult } from "./types";
⋮----
export interface TypeDirectoryEntry {
  filePath: string;
  type: string;
}
⋮----
export interface TypeDirectoryDisagreement {
  path: string;
  resolved: string;
  expected: string;

  winner: string;

  knownGoodOverride: boolean;
}
⋮----
export type ReadFileFn = (absPath: string) => string | undefined;
⋮----
const realReadFile: ReadFileFn = (absPath) =>
⋮----
function declaredTypeForPath(absPath: string):
⋮----
function explainOverride(
  resolvedType: string,
  content: string,
):
⋮----
export function collectTypeDirectoryDisagreements(
  entries: readonly TypeDirectoryEntry[],
  readFile: ReadFileFn = realReadFile,
): TypeDirectoryDisagreement[]
⋮----
export function buildTypeDirectoryAdvisory(
  entries: readonly TypeDirectoryEntry[],
  readFile: ReadFileFn = realReadFile,
  displayPath: (absPath: string) => string = (p) => p,
): HealthCheckResult | undefined
`````

## File: src/commands/health/types-checks.ts
`````typescript
export interface HealthCheckResult {
  name: string;
  kind: "deterministic" | "heuristic";
  status: "pass" | "warn" | "fail" | "unknown";
  message: string;
  confidence: "high" | "medium" | "low";
  evidence?: Record<string, unknown>;
}
`````

## File: src/commands/health/types-improve.ts
`````typescript
export interface ImproveResultRowAccounting {

  total: number;

  included: number;

  skipped: { invalid: number };
}
⋮----
export interface ImproveHealthMetrics {

  invoked: number;

  completed: number;

  skipped: number;





  skipReasons: Record<string, number>;

  resultRows?: ImproveResultRowAccounting;

  actions: {
    reflect: { ok: number; failed: number; cooldown: number; skipped: number };
    distill: {
      queued: number;
      llmFailed: number;

      judgeRejected: number;

      validatorRejected: number;
      configDisabled: number;

      skipped: number;
      skippedByReason: Record<string, number>;
    };
    memoryPrune: number;
    memoryInference: number;
    error: number;
  };
  autoAccept: {

    promoted: number;

    validationFailed: number;
  };

  memorySummary: { eligible: number; derived: number };
  consolidation: {
    processed: number;
    promoted: number;
    merged: number;
    deleted: number;
    contradicted: number;

    judgedNoAction: number;
    failedChunks: number;
    totalChunks: number;
    durationMs: number;
  };
  memoryInference: {

    considered: number;

    freshAttempts: number;
    written: number;




    noChange: number;
    skippedNoFacts: number;

    yieldRate: number;
    durationMs: number;
  };

  wallTime: { medianMs: number; p95Ms: number };





  coverage: { acceptedProposals: number; distinctRefs: number };
}
`````

## File: src/commands/health/types-metrics.ts
`````typescript
export interface HealthMetrics {
  taskFailRate: number;
  agentFailureRate: number;






  agentFailureReasonCounts: Record<string, number>;
  stuckActiveRuns: number;





  llmUsage: LlmUsageAggregate;
}
⋮----
export interface LlmUsageAggregate {

  calls: number;
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;

  failures: number;

  byStage: Record<string, LlmUsageStageAggregate>;

  byProcess: Record<string, LlmUsageStageAggregate>;

  byEngine: Record<string, LlmUsageStageAggregate>;
}
⋮----
export interface LlmUsageStageAggregate {
  calls: number;
  totalDurationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;

  failures: number;
}
⋮----
export interface LlmUsageCrossTabRow extends LlmUsageStageAggregate {

  process: string;

  engine: string;

  model: string;
}
`````

## File: src/commands/health/types-result.ts
`````typescript
import type { AcceptRateEntry } from "./accept-rate";
import type { HealthCheckResult } from "./types-checks";
import type { ImproveHealthMetrics } from "./types-improve";
import type { HealthMetrics } from "./types-metrics";
import type { ImproveRunSummary } from "./types-runs";
import type { DeltaEntry, WindowResult } from "./types-windows";
⋮----
export interface HealthReportContext {

  window: string;

  compare: string;

  comparisonMode: "duration" | "custom";

  pendingProposals: { ref: string; source: string; createdAt: string }[];




  acceptRateBySource: AcceptRateEntry[];
}
⋮----
export interface AkmHealthResult {
  schemaVersion: 3;
  ok: boolean;
  status: "pass" | "warn" | "fail";
  since: string;
  hardChecks: HealthCheckResult[];
  advisories: HealthCheckResult[];
  metrics: HealthMetrics;
  improve: ImproveHealthMetrics;
  runs?: ImproveRunSummary[];
  windows?: WindowResult[];
  deltas?: Record<string, DeltaEntry>;
  report?: HealthReportContext;
}
`````

## File: src/commands/health/types-runs.ts
`````typescript
import type { ImproveHealthMetrics } from "./types-improve";
⋮----
export interface ImproveRunSummary {
  id: string;
  startedAt: string;
  completedAt: string;
  wallTimeMs: number;
  ok: boolean;

  resultStatus?: "valid" | "invalid";

  resultComplete?: boolean;
  strategy: string | null;
  scope: { mode: string; value?: string };






  taskId: string;
  actions: ImproveHealthMetrics["actions"];
  memorySummary: ImproveHealthMetrics["memorySummary"];
  consolidation: ImproveHealthMetrics["consolidation"];
  memoryInference: ImproveHealthMetrics["memoryInference"];
  orphansPurged: number;
  lintFixed: number;
  lintFlagged: number;
}
`````

## File: src/commands/health/types-windows.ts
`````typescript
import type { ImproveHealthMetrics } from "./types-improve";
import type { HealthMetrics } from "./types-metrics";
⋮----
export interface WindowSpec {
  name: string;
  since: string;
  until?: string;
}
⋮----
export interface WindowResult {
  name: string;
  since: string;
  until: string;

  runs: number;
  improve: ImproveHealthMetrics;
  metrics: HealthMetrics;
}
⋮----
export interface DeltaEntry {
  from: number;
  to: number;
  pctChange: number | string;
}
`````

## File: src/commands/health/types.ts
`````typescript

`````

## File: src/commands/health/version-drift.ts
`````typescript
import { pkgVersion } from "../../version";
import { checkForUpdate } from "../sources/self-update";
import type { HealthCheckResult } from "./types";
⋮----
export interface VersionDriftDependencies {

  checkForUpdate?: typeof checkForUpdate;

  cliVersion?: string;
}
⋮----
export async function collectVersionDriftAdvisory(
  probe: boolean,
  deps: VersionDriftDependencies = {},
): Promise<HealthCheckResult>
`````

## File: src/commands/health/windows.ts
`````typescript
import { UsageError } from "../../core/errors";
import { readEvents } from "../../core/events";
import { DURATION_UNITS, parseDuration } from "../../core/time";
import type { Database } from "../../storage/database";
import { queryTaskHistory, type TaskHistoryRow } from "../../storage/repositories/task-history-repository";
import {
  buildImproveSkipSummary,
  computeWallTimeStats,
  computeWindowProposalCoverage,
  countAgentFailureReasons,
  isAgentTaskHistoryRow,
  roundRate,
  summarizeImproveRuns,
  taskFailureDetail,
} from "./improve-metrics";
import { readLlmUsageAggregate } from "./llm-usage";
import { buildPerRunSummaries } from "./task-runs";
import {
  ACTIVE_RUN_WARN_MS,
  type DeltaEntry,
  type HealthMetrics,
  IMPROVE_COMPLETED_EVENT,
  type ImproveHealthMetrics,
  type ImproveRunSummary,
  type WindowResult,
  type WindowSpec,
} from "./types";
⋮----
export function resolveWindowCompare(duration: string, now: () => number = () => Date.now()): WindowSpec[]
⋮----
export function parseWindowSpec(raw: string): WindowSpec
⋮----
export function readNumericPath(obj: unknown, path: string): number
⋮----
export function computeDeltas(first: WindowResult, last: WindowResult): Record<string, DeltaEntry>
⋮----
interface WindowMetricsBundle {
  improve: ImproveHealthMetrics;
  metrics: HealthMetrics;
  runs: number;
}
⋮----
export interface TaskWindowRates {
  taskFailRate: number;
  agentFailureRate: number;
  agentFailureReasonCounts: Record<string, number>;
  stuckActiveRuns: number;

  stuckActiveRows: TaskHistoryRow[];
}
⋮----
export function computeTaskWindowRates(taskRows: readonly TaskHistoryRow[], now: () => number): TaskWindowRates
⋮----
export interface ImproveWindowSummary {
  improve: ImproveHealthMetrics;
  runCount: number;

  perRunSummaries: ImproveRunSummary[];
}
⋮----
export function buildImproveWindowSummary(
  db: Database,
  stateDbPath: string,
  since: string,
  until: string,
  readOnly = false,
): ImproveWindowSummary
⋮----
const eventsBeforeUntil = (type: string)
⋮----
export function buildWindowMetrics(
  db: Database,
  stateDbPath: string,
  since: string,
  until: string,
  now: () => number = () => Date.now(),
  readOnly = false,
): WindowMetricsBundle
`````

## File: src/commands/improve/consolidate/chunking.ts
`````typescript
import fs from "node:fs";
import type { MemoryEntry } from "../consolidate";
import { contentHash, stripFrontmatterBody } from "../content-hash";
⋮----
export function computeSafeChunkSize(contextLength: number, bodyTruncation: number, maxChunkSize?: number): number
⋮----
export function buildChunkPrompt(
  sourceName: string,
  memories: MemoryEntry[],
  chunkIndex: number,
  totalChunks: number,
  bodyTruncation: number,
  pendingProposalBodyHashes: Set<string> = new Set(),
): string
`````

## File: src/commands/improve/consolidate/continuity-check.ts
`````typescript
import type { AkmConfig } from "../../../core/config/config";
import { type SearchLocalInput, searchLocal } from "../../../indexer/search/db-search";
import type { SearchExecutionMode } from "../../../sources/types";
import type { ContinuityRiskRank, RetirementContinuityRisk } from "../../proposal/proposal-types";
import { stripFrontmatterBody } from "../content-hash";
import { type LedgerAccess, stripBundle } from "../ledger";
import { loadRetrievalQueries } from "../retrieval-queries";
⋮----
export interface ContinuityHit {
  ref: string;
}
⋮----
export interface ContinuitySearchResult {
  hits: readonly ContinuityHit[];
  mode: SearchExecutionMode;










  forcedKeywordOnly?: boolean;
}
⋮----
export type ContinuitySearch = (query: string) => Promise<ContinuitySearchResult>;
⋮----
export function createContinuitySearch(stashDir: string, config: AkmConfig): ContinuitySearch
⋮----
function rankOf(hits: readonly ContinuityHit[], conceptId: string): number | undefined
⋮----
function normalizedBody(raw: string): string
⋮----
export async function checkRetirementContinuity(args: {
  stashDir: string;
  config: AkmConfig;

  retiredRef: string;
  successorRef: string;

  retiredRaw: string;
  successorRaw: string;
  ledgerAccess: LedgerAccess;

  search?: ContinuitySearch;
}): Promise<RetirementContinuityRisk | undefined>
`````

## File: src/commands/improve/consolidate/coverage.ts
`````typescript
import fs from "node:fs";
import type { Database } from "../../../storage/database";
import { closeDatabase, openExistingDatabase } from "../../../storage/repositories/index-connection";
import { getEntryById, getEntryIdByFilePath } from "../../../storage/repositories/index-entries-repository";
import { getNeighborsByEntryId } from "../../../storage/repositories/index-vec-repository";
import { stripFrontmatterBody } from "../content-hash";
import { PAIR_NEIGHBOR_FETCH_K } from "./pair-pass";
⋮----
export function wordShingles(text: string): Set<string>
⋮----
export function shingleContainment(memory: ReadonlySet<string>, doc: string): number
⋮----
export interface CoveringKnowledge {

  ref: string;

  containment: number;
}
⋮----
export type CoveringKnowledgeFinder = (filePath: string, body: string) => CoveringKnowledge | undefined;
⋮----
export interface KnowledgeNeighbour {

  ref: string;
  description: string;

  body: string;
}
⋮----
function knowledgeNeighbours(db: Database, bundleId: string, filePath: string): KnowledgeNeighbour[]
⋮----
/**
 * The best-covering knowledge doc among the {@link PAIR_NEIGHBOR_FETCH_K}
 * knowledge docs in `bundleId` nearest to the memory. `filePath` is the
 * memory's indexed file; a memory the index does not know has no stored
 * vector and so no candidates.
 */
export function findCoveringKnowledge(
  db: Database,
  bundleId: string,
  filePath: string,
  body: string,
): CoveringKnowledge | undefined
⋮----
/** Knowledge docs a reviewer is shown for a promotion, nearest first. */
⋮----
/**
 * The knowledge notes nearest to the memory at `memoryPath`, for the drain's
 * judge to compare a promotion against: the nearest {@link NEIGHBOUR_NOTE_COUNT}
 * of the same candidates the coverage gate reads. The memory's bundle is the one
 * the index recorded for it. Empty when the index has no vector for the memory
 * or cannot be opened; never throws.
 */
export function nearestKnowledgeNotes(
  memoryPath: string,
): Array<
⋮----
/**
 * The gate for one run, holding its own read handle on `index.db` for the
 * promotions that run emits; `undefined` when there is no bundle or no index
 * to look in. A lookup that throws counts as "not known to be covered".
 */
export function openKnowledgeCoverage(
  bundleId: string | undefined,
):
`````

## File: src/commands/improve/consolidate/pair-pass.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import consolidatePairPrompt from "../../../assets/prompts/consolidate-pair.md" with { type: "text" };
import consolidatePairCheckPrompt from "../../../assets/prompts/consolidate-pair-check.md" with { type: "text" };
import consolidatePairSameAge from "../../../assets/prompts/consolidate-pair-same-age.md" with { type: "text" };
import consolidatePairTerms from "../../../assets/prompts/consolidate-pair-terms.md" with { type: "text" };
import { parseFrontmatter } from "../../../core/asset/frontmatter";
import { conceptIdFromTypeName } from "../../../core/asset/resolve-ref";
import { asNonEmptyString } from "../../../core/common";
import { concurrentMap } from "../../../core/concurrent";
import type { AkmConfig } from "../../../core/config/config";
import type { ConsolidatePairJudgeLabel, ConsolidatePairPassResult } from "../../../core/improve-types";
import { parseEmbeddedJsonResponse } from "../../../core/parse";
import { DERIVED_SUFFIX } from "../../../core/recognition-util";
import { warnOnce } from "../../../core/warn";
import { sameScope, scopeFromFrontmatter } from "../../../indexer/passes/metadata";
import type { RunnerSpec } from "../../../integrations/agent/runner";
import type { ChatCompletionConfig, ChatCompletionOptions, ChatMessage } from "../../../llm/client";
import { runGit } from "../../../sources/providers/git-install";
import type { Database } from "../../../storage/database";
import {
  closeDatabase,
  openExistingDatabase,
  openReadonlyExistingDatabase,
} from "../../../storage/repositories/index-connection";
import { getAllEntries, getEntryById } from "../../../storage/repositories/index-entries-repository";
import { getNeighborsByEntryId, hasStoredEmbedding } from "../../../storage/repositories/index-vec-repository";
import {
  EXPIRED_GATE_REASON,
  isRetireProposal,
  PAIR_PASS_GATE,
  type RetirementMetadata,
  type RetireReason,
  STALE_TARGET_GATE_REASON,
} from "../../proposal/proposal-types";
import {
  createRetireProposal,
  listProposalsReadOnly,
  type ProposalsContext,
  proposalContentHash,
  recordGateDecision,
} from "../../proposal/repository";
import type { AkmConsolidateOptions } from "../consolidate";
import { contentHash, stripFrontmatterBody } from "../content-hash";
import { loadLedgerSnapshot, PAIR_PASS_LEDGER_SOURCE, recordLedgerAttempt, stripBundle } from "../ledger";
import { isInRetrievalScope, loadRetrievalScope } from "../retrieval-scope";
import { callStage } from "../stage";
import { type ContinuitySearch, checkRetirementContinuity, createContinuitySearch } from "./continuity-check";
⋮----
type RetireJudgeLabel = "duplicate" | "subsumed" | "supersedes";
⋮----
function isRetireLabel(label: ConsolidatePairJudgeLabel): label is RetireJudgeLabel
⋮----
interface RawPairJudgeResponse {
  onlyInA?: unknown;
  onlyInB?: unknown;
  confidence?: unknown;
  reason?: unknown;
}
⋮----
export interface PairJudgeVerdict {

  onlyInA: string[];

  onlyInB: string[];
  relation: ConsolidatePairJudgeLabel;
  redundant: "A" | "B" | null;
  confidence: number;
  reason: string;
}
⋮----
export function parsePairJudgeResponse(raw: string): PairJudgeVerdict | undefined
⋮----
function claimList(value: unknown): string[] | undefined
⋮----
export interface PairAsset {
  ref: string;
  type: string;
  name: string;
  filePath: string;
  entryId: number;
}
⋮----
function isFlatName(name: string): boolean
⋮----
export function isOwnTwinOrParent(a: PairAsset, b: PairAsset): boolean
⋮----
export function loadPairPassPool(db: Database, bundleId: string): PairAsset[]
⋮----
function repoRelativeKey(stashDir: string, filePath: string): string
⋮----
export function loadGitFirstAddedMap(stashDir: string): ReadonlyMap<string, number> | undefined
⋮----
function createdMsOf(
  asset: PairAsset,
  gitFirstAdded: ReadonlyMap<string, number> | undefined,
  stashDir: string,
): number
⋮----
export interface Initiator extends PairAsset {

  backlog: boolean;

  newMaterial: boolean;

  bodyHash: string;
}
⋮----
export interface PairCandidate {
  initiator: Initiator;
  other: PairAsset;
  cosine: number;
}
⋮----
function pairKey(a: string, b: string): string
⋮----
function rejectedPairKey(retiredRef: string, successorRef: string, retiredHash: string, successorHash: string): string
⋮----
export function loadRejectedPairKeys(stashDir: string, proposalsCtx: ProposalsContext | undefined): Set<string>
⋮----
export function selectInitiators(
  pool: PairAsset[],
  opts: AkmConsolidateOptions,
  stashDir: string,
  gitFirstAdded: ReadonlyMap<string, number> | undefined,
):
⋮----
export function selectCandidates(
  db: Database,
  initiators: Initiator[],
  bundleId: string,
  unvectored?: Set<string>,
): PairCandidate[]
⋮----
/** @internal exported for unit tests. */
export interface PairSide {
  asset: PairAsset;
  frontmatter: Record<string, unknown>;
  raw: string;
  createdIso: string;
  updatedIso: string;
}
⋮----
function loadSide(
  asset: PairAsset,
  gitFirstAdded: ReadonlyMap<string, number> | undefined,
  stashDir: string,
): PairSide | undefined
⋮----
function sideSection(label: string, side: PairSide): string[]
⋮----
/** Lexical attention hints only: equal token sets do not prove equal claims. */
function exclusiveTerms(side: PairSide, other: PairSide): string
⋮----
const tokens = (note: PairSide)
⋮----
function termHints(lines: string[]): string
⋮----
function orderByAge(x: PairSide, y: PairSide):
⋮----
export function buildPairUserPrompt(older: PairSide, newer: PairSide): string
⋮----
export function tombstoneReason(label: "duplicate" | "subsumed" | "supersedes"): Exclude<RetireReason, "promoted">
⋮----
export interface PairDecision {
  retired: PairSide;
  successor: PairSide;
}
⋮----
export function decideRetirement(
  label: ConsolidatePairJudgeLabel,
  redundant: "A" | "B" | null,
  older: PairSide,
  newer: PairSide,
  only: { onlyInA: string[]; onlyInB: string[] },
): PairDecision | undefined
⋮----
export type PairJudgeChat = (
  connection: ChatCompletionConfig,
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
) => Promise<string>;
⋮----
interface PairPassContext {
  opts: AkmConsolidateOptions;
  config: AkmConfig;
  stashDir: string;
  llmRunner: RunnerSpec;
  gitFirstAdded: ReadonlyMap<string, number> | undefined;
  labelCounts: Record<ConsolidatePairJudgeLabel, number>;
  perInitiatorProposed: Set<string>;
  retired: string[];
  warnings: string[];
  chat?: PairJudgeChat;






  continuitySearch: ContinuitySearch;








  rejectedPairKeys: ReadonlySet<string>;









  retiredThisRun: Set<string>;
}
⋮----
function checkSection(label: string, side: PairSide): string
⋮----
async function confirmNothingLost(ctx: PairPassContext, retired: PairSide, successor: PairSide): Promise<boolean>
⋮----
async function judgeOne(ctx: PairPassContext, candidate: PairCandidate): Promise<
⋮----
const scopesStillFresh = (): boolean
⋮----
const emptyLabelCounts = (): Record<ConsolidatePairJudgeLabel, number> => (
⋮----
export async function runConsolidatePairPass(
  opts: AkmConsolidateOptions,
  config: AkmConfig,
  stashDir: string,
  bundleId: string | undefined,
  warnings: string[],

  seams: { chat?: PairJudgeChat; continuitySearch?: ContinuitySearch } = {},
): Promise<ConsolidatePairPassResult>
⋮----
const isPendingBlocked = (c: PairCandidate): boolean
⋮----
const isNewOrChanged = (i: Initiator): boolean
`````

## File: src/commands/improve/consolidate/sanitize.ts
`````typescript
import { parse as yamlParse } from "yaml";
import { assembleAssetFromString, serializeFrontmatter } from "../../../core/asset/asset-serialize";
import { parseFrontmatter } from "../../../core/asset/frontmatter";
⋮----
function recoverMalformedFrontmatter(raw: string): string | null
⋮----
export function stripOuterCodeFence(raw: string):
⋮----
interface SanitizedMergedContent {
  content: string;
  frontmatter: Record<string, unknown>;
}
⋮----
/**
 * Model output as an asset: fence stripped, `<think>` removed, frontmatter
 * re-serialized through the YAML library (the lenient parser recovers what the
 * strict one rejects), or a reason it is unusable.
 */
export function sanitizeMergedContent(
  raw: string,
):
⋮----
// A leading fence alone is recovered when frontmatter follows; a trailing
// one alone is more likely a body code block, so it is not.
⋮----
// A line or two of preamble before the frontmatter is tolerated; a `---`
// further in is more likely a section divider.
⋮----
/**
 * Normalize a leaked `updated` placeholder in place: a Date becomes
 * `YYYY-MM-DD`; `today`/`now`/`{today}`-style templates and maps like
 * `{today: null}` become today's date; real dates, unknown strings and empty
 * values are left alone (visible in the diff, never invented).
 */
export function normalizeUpdatedField(fm: Record<string, unknown>): void
`````

## File: src/commands/improve/distill/content-repair.ts
`````typescript
import { assembleAssetFromString, serializeFrontmatterQuoted } from "../../../core/asset/asset-serialize";
import { parseFrontmatter } from "../../../core/asset/frontmatter";
import { repairTruncatedDescription } from "../../../core/text-truncation";
import {
  isValidDescription,
  isValidWhenToUse,
  lessonQualityIssues,
} from "../../proposal/validators/proposal-quality-validators";
⋮----
export interface DistillValidationFinding {
  kind: string;
  field: string;
  message: string;
}
⋮----
export function autoRepairLessonFrontmatter(content: string, inputRef: string): string
⋮----
const stripMd = (l: string)
// Leaked frontmatter lines in the body would yield `description: "description: …"`.
const isYamlLike = (l: string)
⋮----
/**
 * Swap a conditional description ("When X, do Y") with a declarative
 * when_to_use — mis-fielded, as the description validator says — when both
 * then pass; this recovers most `^when` rejections at no LLM cost.
 */
export function autoSwapDescriptionWhenToUse(content: string, inputRef: string):
⋮----
/** Complete a description cut mid-sentence from its own text or the body (#556); a complete one is untouched. */
export function repairLessonDescriptionTruncation(content: string): string
⋮----
export function collectLessonQualityFindings(content: string, inputRef: string): DistillValidationFinding[]
`````

## File: src/commands/improve/distill/lesson-update.ts
`````typescript
import { parseEmbeddedJsonResponse } from "../../../core/parse";
⋮----
export interface UpdateCandidate {
  ref: string;

  body: string;
}
⋮----
export function buildLessonUpdatePrompt(memory: string, feedback: string[], candidates: UpdateCandidate[]): string
⋮----
/** The writer's chosen update, or `null` for `none` and for any reply that names no listed lesson, no new fact or no body. */
export function parseLessonUpdate<T extends UpdateCandidate>(
  raw: string,
  candidates: readonly T[],
):
⋮----
const normalizeLine = (line: string): string
⋮----
const bodyLines = (body: string): string[]
⋮----
/**
 * What an update does to a lesson's body: the existing lines it no longer holds (compared by words, in any case
 * and spacing, anywhere in the new body) and the lines it adds.
 */
export function diffLessonBody(existingBody: string, mergedBody: string):
`````

## File: src/commands/improve/memory/derived-ref.ts
`````typescript
import { conceptIdFromTypeName, parseRefInput } from "../../../core/asset/resolve-ref";
import { asNonEmptyString } from "../../../core/common";
import { DERIVED_SUFFIX } from "../../../core/recognition-util";
⋮----
export function parseMemoryName(value: string | undefined): string | undefined
⋮----
export function parseMemoryRef(value: string | undefined): string | undefined
⋮----
export function memoryIdentityRef(name: string): string
⋮----
export function isDerivedMemory(name: string, frontmatter: Record<string, unknown>): boolean
⋮----
export function resolveParentRef(name: string, frontmatter: Record<string, unknown>): string | undefined
`````

## File: src/commands/improve/memory/memory-belief.ts
`````typescript
import { mutateFrontmatter } from "../../../core/asset/frontmatter";
⋮----
export function readEdgeList(value: unknown): string[]
⋮----
export function writeSupersededEdge(filePath: string, supersededByRef: string): void
`````

## File: src/commands/improve/memory/memory-improve.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { assembleAsset } from "../../../core/asset/asset-serialize";
import { mutateFrontmatter, parseFrontmatter } from "../../../core/asset/frontmatter";
import { MEMORY_ARCHIVE_REL } from "../../../core/asset/memory-archive";
import { conceptIdFromTypeName } from "../../../core/asset/resolve-ref";
import { asNonEmptyString, groupBy, stringArray, toPosix } from "../../../core/common";
import type {
  ArchivedMemoryCleanupRecord,
  MemoryBeliefState,
  MemoryBeliefStateTransition,
  MemoryConsolidationCandidate,
  MemoryContradictionCandidate,
  MemoryPruneCandidate,
  MemoryPruneReason,
  RelativeDateCandidate,
} from "../../../core/improve-types";
import { DERIVED_SUFFIX } from "../../../core/recognition-util";
import { warn } from "../../../core/warn";
import { recordWrittenPath } from "../../../core/write-provenance";
import { walkMarkdownFiles } from "../../../indexer/walk/walker";
import { checkGitPathSafety, isGitBackedStash } from "../../../sources/providers/git-stash";
import { contentHash } from "../content-hash";
import { isDerivedMemory, memoryIdentityRef, parseMemoryName, resolveParentRef } from "./derived-ref";
⋮----
export interface MemoryCleanupPlan {
  analyzedDerived: number;
  pruneCandidates: MemoryPruneCandidate[];
  contradictionCandidates: MemoryContradictionCandidate[];
  beliefStateTransitions: MemoryBeliefStateTransition[];
  consolidationCandidates: MemoryConsolidationCandidate[];
  relativeDateCandidates: RelativeDateCandidate[];
}
⋮----
export interface MemoryBeliefTransitionLogRecord extends MemoryBeliefStateTransition {
  appliedAt: string;
}
⋮----
export interface MemoryCleanupApplyResult {
  archived: ArchivedMemoryCleanupRecord[];
  beliefStateTransitions: MemoryBeliefStateTransition[];
  transitionLogPath?: string;
  transitionLogEntries?: number;
  warnings?: string[];

  relativeDatesResolved?: number;
}
⋮----
export interface MemoryCleanupOptions {
  parentRef?: string;
}
⋮----
interface DerivedMemoryRecord {
  ref: string;
  name: string;
  filePath: string;
  parentRef: string;
  title: string;
  description: string;
  tags: string[];
  searchHints: string[];
  body: string;
  canonicalName: boolean;
  signalScore: number;
  fingerprint: string;
  signalKey?: string;
  supersededBy: string[];
  contradictedBy: string[];
  currentBeliefRefs: string[];
  obsolete: boolean;
  beliefState: Exclude<MemoryBeliefState, "archived">;
}
⋮----
interface PlannedPrune extends MemoryPruneCandidate {
  filePath: string;
}
⋮----
interface FamilyContradictionResolution {
  contradictionCandidates: MemoryContradictionCandidate[];
  transitions: MemoryBeliefStateTransition[];
}
⋮----
export function analyzeMemoryCleanup(stashDir: string, options: MemoryCleanupOptions =
⋮----
const planPrune = (record: DerivedMemoryRecord, reason: MemoryPruneReason, survivorRef?: string) =>
⋮----
const planBeliefTransition = (
    record: DerivedMemoryRecord,
    toState: Exclude<MemoryBeliefState, "archived">,
    reason: MemoryBeliefStateTransition["reason"],
    currentBeliefRefs: string[] = [],
) =>
⋮----
export function applyMemoryCleanup(stashDir: string, plan: MemoryCleanupPlan): MemoryCleanupApplyResult
⋮----
if (resolvedBody === (fm.content ?? "")) continue; // no change
⋮----
function formatApplyWarning(stage: string, ref: string, error: unknown): string
⋮----
function resolveRelativeDates(text: string, referenceDate: Date): string
⋮----
function resolveFamilyContradictions(family: DerivedMemoryRecord[]): FamilyContradictionResolution
⋮----
const reachableSinkRefsForComponent = (index: number): string[] =>
⋮----
function stronglyConnectedComponents(
  refs: string[],
  edges: Map<string, string[]>,
):
⋮----
const visit = (ref: string) =>
⋮----
export function derivedTwinPath(filePath: string, refType: string): string | undefined
⋮----
function isRetireCandidate(candidate: MemoryPruneCandidate): boolean
⋮----
function resolvePreviousBeliefState(
  candidate: MemoryPruneCandidate,
  filePath: string,
): Exclude<MemoryBeliefState, "archived">
⋮----
export function archiveCleanupCandidate(
  stashDir: string,
  candidate: MemoryPruneCandidate,
  filePath: string,
): ArchivedMemoryCleanupRecord
⋮----
export interface ArchivePurgeResult {

  purgedDirs: number;

  purgedFiles: number;
}
⋮----
export function purgeGracedArchive(stashDir: string, now: Date = new Date()): ArchivePurgeResult
⋮----
function listFilesRecursive(target: string): string[]
⋮----
function persistBeliefStateTransition(filePath: string, transition: MemoryBeliefStateTransition): void
⋮----
function appendBeliefStateTransitionLog(stashDir: string, transitions: MemoryBeliefStateTransition[]): string
⋮----
function priorBeliefStateForArchive(candidate: MemoryPruneCandidate): Exclude<MemoryBeliefState, "archived">
⋮----
function createArchiveDir(stashDir: string, ref: string, archivedAt: string): string
⋮----
function sanitizeRef(ref: string): string
⋮----
function collectDerivedMemories(stashDir: string, parentRefFilter?: string): DerivedMemoryRecord[]
⋮----
// parentRef is the 0.9.0 `memories/<name>` conceptId (Group-C item 2), so
// the canonical-child test compares the minted conceptId of the suffix-
// stripped name against it rather than slicing a fixed `memory:` prefix.
⋮----
function isActiveLikeBeliefState(state: Exclude<MemoryBeliefState, "archived">): state is "active" | "asserted"
⋮----
function isFrozenHistoricalBeliefState(state: Exclude<MemoryBeliefState, "archived">): state is "deprecated"
⋮----
function resolveBeliefState(frontmatter: Record<string, unknown>): Exclude<MemoryBeliefState, "archived">
⋮----
function refArray(value: unknown): string[]
⋮----
function buildFingerprint(
  title: string,
  description: string,
  tags: string[],
  searchHints: string[],
  body: string,
): string
⋮----
function normalizeBody(value: string): string
⋮----
function normalizeSignal(value: string | undefined): string | undefined
⋮----
function normalizeList(values: string[]): string[]
⋮----
function computeSignalScore(
  title: string,
  description: string,
  tags: string[],
  searchHints: string[],
  body: string,
): number
⋮----
function sortRecordsForSurvival(records: DerivedMemoryRecord[]): DerivedMemoryRecord[]
⋮----
function compareRecords(a: DerivedMemoryRecord, b: DerivedMemoryRecord): number
⋮----
function compareCandidates(a: MemoryPruneCandidate, b: MemoryPruneCandidate): number
⋮----
function compareContradictionCandidates(a: MemoryContradictionCandidate, b: MemoryContradictionCandidate): number
⋮----
function compareBeliefTransitions(a: MemoryBeliefStateTransition, b: MemoryBeliefStateTransition): number
⋮----
function compareConsolidationCandidates(a: MemoryConsolidationCandidate, b: MemoryConsolidationCandidate): number
⋮----
function firstExistingRef(
  refs: string[],
  byRef: Map<string, DerivedMemoryRecord>,
  selfRef: string,
): string | undefined
⋮----
function sameStringArray(a: string[], b: string[]): boolean
⋮----
function extractHeading(content: string): string | undefined
⋮----
function firstNonEmpty(values: Array<string | undefined>): string | undefined
⋮----
function toMemoryName(memoriesDir: string, filePath: string): string | undefined
`````

## File: src/commands/improve/autonomy-gate.ts
`````typescript
import type { ImproveProfileConfig } from "../../core/config/config";
import {
  type ExperimentalConfigHolder,
  IMPROVE_AUTONOMY_CONFIG_KEY,
  isImproveAutonomyEnabled,
} from "../../core/config/experimental";
⋮----
export type AutonomyLane = (typeof AUTONOMY_LANES)[number];
⋮----
export interface GatedLane {
  lane: AutonomyLane;

  configKey: string;

  reason: string;
}
⋮----
function gatedLane(lane: AutonomyLane): GatedLane
⋮----
export function describeGatedLanes(lanes: readonly AutonomyLane[]): GatedLane[]
⋮----
export function configuredDirectAutonomyLanes(): AutonomyLane[]
⋮----
export function isAutonomyLaneAllowed(_lane: AutonomyLane, config: ExperimentalConfigHolder | undefined): boolean
⋮----
export function applyAutonomyGate(
  strategy: ImproveProfileConfig,
  config: ExperimentalConfigHolder | undefined,
):
`````

## File: src/commands/improve/consolidate.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import consolidateSystemPrompt from "../../assets/prompts/consolidate-system.md" with { type: "text" };
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { assembleAssetFromString, serializeFrontmatter } from "../../core/asset/asset-serialize";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { conceptIdFromTypeName, displayRef, parseRefInput } from "../../core/asset/resolve-ref";
import type { AkmConfig, ImproveProfileConfig } from "../../core/config/config";
import { loadConfig } from "../../core/config/config";
import type { ConsolidateOpKind, ConsolidateResult } from "../../core/improve-types";
import { parseEmbeddedJsonResponse } from "../../core/parse";
import { openStateDatabase } from "../../core/state-db";
import { warn, warnVerbose } from "../../core/warn";
import { type ResolvedWriteTarget, resolveWriteTarget } from "../../core/write-source";
import { type NoticeSink, noticeSet } from "../../execution/notices";
import { deriveInstallations } from "../../indexer/installations";
import { resolveSourceEntries } from "../../indexer/search/search-source";
import { USAGE_EVENT_RETENTION_DAYS } from "../../indexer/usage/usage-events";
import type { RunnerSpec } from "../../integrations/agent/runner";
import { cosineSimilarity, embedBatch, resolveEmbeddingModelId } from "../../llm/embedder";
import { effectiveEmbedding } from "../../llm/embedders/connection";
import type { Database } from "../../storage/database";
import { getBodyEmbeddings, upsertBodyEmbeddings } from "../../storage/repositories/embeddings-repository";
import {
  closeDatabase,
  openExistingDatabase,
  openReadonlyExistingDatabase,
} from "../../storage/repositories/index-connection";
import { getAllEntries } from "../../storage/repositories/index-entries-repository";
import { listProposals, listProposalsReadOnly, type ProposalsContext, proposalContent } from "../proposal/repository";
import { hasSupersededStatus, validateProposalFrontmatter } from "../proposal/validators/proposal-quality-validators";
import { buildChunkPrompt, computeSafeChunkSize, DEFAULT_CONTEXT_LENGTH_TOKENS } from "./consolidate/chunking";
import { type CoveringKnowledgeFinder, openKnowledgeCoverage } from "./consolidate/coverage";
import { runConsolidatePairPass } from "./consolidate/pair-pass";
import { sanitizeMergedContent } from "./consolidate/sanitize";
import { contentHash } from "./content-hash";
import { resolveImproveStrategy, resolveProcessEnabled } from "./improve-strategies";
import { isContentDrivenRow, isLedgerBlocked, ledgerKey, loadLedgerSnapshot, recordLedgerAttempt } from "./ledger";
import { isInRetrievalScope, loadRetrievalScope } from "./retrieval-scope";
import { callStage, mintProposal, stageRunner } from "./stage";
⋮----
export interface MemoryEntry {
  name: string;
  filePath: string;
  description: string;
  tags: string[];
  stashDir: string;
}
⋮----
export interface ConsolidatePromoteOp {
  op: "promote";
  ref: string;
  knowledgeRef: string;
  reason: string;

  description?: string;

  confidence?: number | null;
}
⋮----
interface RawChunkPlan {
  operations?: unknown[];
  warnings?: unknown[];
}
⋮----
function parsePlan(raw: string)
⋮----
export function isValidOp(op: unknown): op is ConsolidatePromoteOp
⋮----
export function mergePlans(chunks: ConsolidatePromoteOp[][]): ConsolidatePromoteOp[]
⋮----
export function isConsolidationEligibleMemoryName(name: string): boolean
⋮----
export interface AkmConsolidateOptions {

  improveProfile?: ImproveProfileConfig;

  target?: string;

  writeTarget?: ResolvedWriteTarget;

  dryRun?: boolean;
  stashDir?: string;
  config?: AkmConfig;

  llmRunner?: RunnerSpec | null;
  onNotices?: NoticeSink;

  maxChunkSize?: number;

  limit?: number;

  sourceRun?: string;
  proposalsCtx?: ProposalsContext;




  signal?: AbortSignal;

  existingKnowledgeBodyHashes?: Set<string>;
}
⋮----
interface ClusterEmbedTelemetry {
  embedMs: number;
  cacheHits: number;
  cacheMisses: number;
}
⋮----
async function clusterMemoriesBySimilarity(
  memories: MemoryEntry[],
  config: AkmConfig,
  stateDb?: Database,
  signal?: AbortSignal,
): Promise<
⋮----
function loadPendingConsolidateProposalHashes(stashDir: string, proposalsCtx?: ProposalsContext): Set<string>
⋮----
function loadRejectedPromotionBodyHashes(stashDir: string, proposalsCtx?: ProposalsContext): Set<string>
⋮----
export function loadExistingKnowledgeBodyHashes(targetRoot: string): Set<string>
⋮----
const visit = (dir: string): void =>
⋮----
function canonicalXref(ref: string): string
⋮----
export function makeConsolidateResult(
  overrides: Partial<ConsolidateResult> & { target: string; durationMs: number },
): ConsolidateResult
⋮----
function resolveConsolidationWriteTarget(opts: AkmConsolidateOptions, config: AkmConfig): ResolvedWriteTarget
⋮----
export async function akmConsolidate(opts: AkmConsolidateOptions =
⋮----
type SkipEntry = { ref: string; skips: Array<{ op: ConsolidateOpKind | "unknown"; reason: string }> };
⋮----
interface ConsolidateAccounting {
  judgedNoAction: number;
  failedChunkMemories: number;
  totalChunksFailed: number;
  skipReasons: SkipEntry[];
  skipReasonByRef: Map<string, SkipEntry>;

  judgedNoActionRefs: Set<string>;

  judgedRefs: Set<string>;
}
⋮----
function pushSkipReason(acc: ConsolidateAccounting, op: ConsolidateOpKind | "unknown", ref: string, reason: string)
⋮----
export interface ConsolidationPoolSnapshot {

  poolSize: number;

  candidatePoolSize: number;

  dedupPoolSize: number;
  memories: MemoryEntry[];

  prefilteredAlreadyPromoted: number;




  judgedUnchanged: number;

  outsideRetrievalScope: number;
}
⋮----
interface ConsolidationSourceOwner {
  bundleId: string;
  sourceRoot: string;
  excludedSourceRoots: ReadonlySet<string>;
}
⋮----
function resolveConsolidationSourceOwner(
  opts: AkmConsolidateOptions,
  stashDir: string,
): ConsolidationSourceOwner | undefined
⋮----
const mtimeMsOf = (memory: MemoryEntry): number =>
⋮----
export function inspectConsolidationPool(
  opts: AkmConsolidateOptions,
  stashDir: string,
  warnings: string[],
  existingKnowledgeBodyHashes: Set<string> = new Set(),
  access?: { readOnly?: boolean },
): ConsolidationPoolSnapshot
⋮----
async function judgeConsolidationChunks(args: {
  chunks: MemoryEntry[][];
  opts: AkmConsolidateOptions;
  sourceName: string;
  bodyTruncation: number;
  pendingProposalBodyHashes: Set<string>;
  warnings: string[];
  acc: ConsolidateAccounting;
}): Promise<ConsolidatePromoteOp[][]>
⋮----
const memRef = (m: MemoryEntry)
const failChunk = (message: string, chunk: MemoryEntry[]) =>
const skipRemaining = (from: number) =>
⋮----
async function planConsolidation(
  opts: AkmConsolidateOptions,
  config: AkmConfig,
  stashDir: string,
  memories: MemoryEntry[],
  warnings: string[],
  stateDb: Database | undefined,
  acc: ConsolidateAccounting,
)
⋮----
const slice = (list: MemoryEntry[])
⋮----
async function consolidate(
  opts: AkmConsolidateOptions,
  config: AkmConfig,
  stashDir: string,
  startMs: number,
  stateDb: Database | undefined,
): Promise<ConsolidateResult>
⋮----
const plural = (n: number) => `memor$
⋮----
const summary = () => (
⋮----
export interface PromoteContext {
  config: AkmConfig;
  stashDir: string;
  sourceRun: string;
  proposalsCtx?: ProposalsContext;
  target: ResolvedWriteTarget;
  memoryByRef: Map<string, MemoryEntry>;
  promoted: string[];
  promotedSourceRefs: Set<string>;
  existingKnowledgeBodyHashes: Set<string>;




  coveringKnowledge?: CoveringKnowledgeFinder;
  promotionFailures: { count: number };
  warnings: string[];
  pushSkipReason: (op: ConsolidateOpKind | "unknown", ref: string, reason: string) => void;
}
⋮----
function bodyHashOf(memory: MemoryEntry | undefined):
⋮----
function conceptIdForRef(ref: string): string | undefined
⋮----
function normalizeSlugForDedup(ref: string): string
⋮----
export async function emitPromotionProposal(op: ConsolidatePromoteOp, ctx: PromoteContext): Promise<void>
⋮----
const skip = (reason: string, message: string): void =>
⋮----
function loadMemoriesForSource(
  source: ConsolidationSourceOwner | undefined,
  warnings: string[],
  readOnly: boolean,
): MemoryEntry[]
`````

## File: src/commands/improve/content-hash.ts
`````typescript
import { createHash } from "node:crypto";
import { computeNormalizedContentHash, parseFrontmatter } from "../../core/asset/frontmatter";
⋮----
export function stripFrontmatterBody(raw: string): string
⋮----
export function contentHash(content: string | Uint8Array, mode: "raw" | "body" | "normalized" = "raw"): string
`````

## File: src/commands/improve/distill-guards.ts
`````typescript
export interface ClsConfig {
  enabled?: boolean;
  adjacentCount?: number;
}
⋮----
export function buildClsContext(adjacentItems: Array<
`````

## File: src/commands/improve/distill-promotion-policy.ts
`````typescript
import { assembleAsset } from "../../core/asset/asset-serialize";
import { parseFrontmatter, readFrontmatterDate } from "../../core/asset/frontmatter";
import { parseRefInput } from "../../core/asset/resolve-ref";
⋮----
export interface PromotionFeedbackEvent {
  metadata?: Record<string, unknown>;
}
⋮----
export interface PromotionPolicyInput {
  inputRef: string;
  assetContent: string | null;
  feedbackEvents: readonly PromotionFeedbackEvent[];
}
⋮----
export interface MemoryPromotionAssessment {
  applicable: boolean;
  promote: boolean;
  score: number;
  threshold: number;
  knowledgeRef: string;
  content?: string;
  blockedBy: string[];
  positiveSignals: string[];
  negativeSignals: string[];
  modelName?: string;
}
⋮----
interface PromotionFeatures {
  positiveFeedback: number;
  negativeFeedback: number;
  hasCuratedQuality: boolean;
  confidenceBoost: number;
  hasSource: boolean;
  hasObservedAt: boolean;
  hasDescription: boolean;
  hasTags: boolean;
  substantiveBody: boolean;
  tentativeLanguage: boolean;
}
⋮----
interface PromotionModelConfig {
  name: string;
  positiveWeight: number;
  repeatedPositiveWeight: number;
  noPositivePenalty: number;
  singlePositivePenalty: number;
  negativeWeight: number;
  curatedWeight: number;
  confidenceWeight: number;
  sourceWeight: number;
  observedAtWeight: number;
  descriptionWeight: number;
  tagWeight: number;
  substantiveBodyWeight: number;
  tentativePenalty: number;
}
⋮----
function hasNonEmptyList(value: unknown): boolean
⋮----
function hasConflictMarkers(metadata: Record<string, unknown>): boolean
⋮----
function hasTentativeLanguage(text: string): boolean
⋮----
function scoreConfidence(confidence: unknown): number
⋮----
function deriveDescription(body: string, description: string | undefined): string | undefined
⋮----
export function deriveKnowledgeRef(inputRef: string): string
⋮----
function collectPromotionFeatures(input: PromotionPolicyInput):
⋮----
function buildKnowledgeContent(input: PromotionPolicyInput): string
⋮----
function assessWithWeightedModel(
  input: PromotionPolicyInput,
  model: PromotionModelConfig,
  threshold: number,
): MemoryPromotionAssessment
⋮----
export function assessMemoryKnowledgePromotionCandidate(input: PromotionPolicyInput): MemoryPromotionAssessment
`````

## File: src/commands/improve/distill.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import distillKnowledgeSystemPrompt from "../../assets/prompts/distill-knowledge-system.md" with { type: "text" };
import distillLessonSystemPrompt from "../../assets/prompts/distill-lesson-system.md" with { type: "text" };
import { assetPathForName, stashDirFor } from "../../core/asset/asset-placement";
import { assembleAsset, assembleAssetFromString, serializeFrontmatterQuoted } from "../../core/asset/asset-serialize";
import { parseFrontmatter, writeSalienceToFrontmatter } from "../../core/asset/frontmatter";
import { stripMarkdownFences } from "../../core/asset/markdown";
import { conceptIdFromTypeName, parseRefInput } from "../../core/asset/resolve-ref";
import { authoringRulesForType } from "../../core/authoring-rules";
import { isWithin, resolveStashDir } from "../../core/common";
import type { AkmConfig, ImproveProfileConfig } from "../../core/config/config";
import { getImproveProcessConfig, loadConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { appendEvent, type EventsContext, readEvents } from "../../core/events";
import type { AkmDistillResult, DistillOutcome } from "../../core/improve-types";
import { lintLessonContent } from "../../core/lesson-lint";
import { parseEmbeddedJsonResponse } from "../../core/parse";
import { getDbPath } from "../../core/paths";
import { resolveStandardsContext } from "../../core/standards/resolve-standards-context";
import { withStateDb } from "../../core/state-db";
import { warn, warnVerbose } from "../../core/warn";
import { recordWrittenPath } from "../../core/write-provenance";
import { type NoticeSet, noticeSet } from "../../execution/notices";
import type { ConfiguredExecutionSettings } from "../../execution/source";
import { resolveAssetPath } from "../../indexer/walk/path-resolver";
import type { RunnerSpec } from "../../integrations/agent/runner";
import type { chatCompletion } from "../../llm/client";
import { closeDatabase, openReadonlyExistingDatabase } from "../../storage/repositories/index-connection";
import { getAllEntries } from "../../storage/repositories/index-entries-repository";
import type { EligibilitySource } from "../proposal/proposal-types";
import { listProposals, type Proposal, type ProposalsContext } from "../proposal/repository";
import { detectDoubleFrontmatter, isValidDescription } from "../proposal/validators/proposal-quality-validators";
import { akmSearch } from "../read/search";
import {
  autoRepairLessonFrontmatter,
  autoSwapDescriptionWhenToUse,
  collectLessonQualityFindings,
  type DistillValidationFinding,
  repairLessonDescriptionTruncation,
} from "./distill/content-repair";
import {
  buildLessonUpdatePrompt,
  DISTILL_LESSON_UPDATE_JSON_SCHEMA,
  diffLessonBody,
  parseLessonUpdate,
  type UpdateCandidate,
} from "./distill/lesson-update";
import { buildClsContext, DEFAULT_CLS_ADJACENT_COUNT } from "./distill-guards";
import { assessMemoryKnowledgePromotionCandidate, deriveKnowledgeRef } from "./distill-promotion-policy";
import { buildRefVocabulary, scoreEncodingSalience } from "./encoding-salience";
import { resolveImproveStrategy, resolveProcessEnabled } from "./improve-strategies";
import { recordLedgerAttempt } from "./ledger";
import { computeSalience, upsertAssetSalience } from "./salience";
import {
  callStage,
  LESSON_REJECT_MAX_SCORE,
  mintProposal,
  type QualityJudgeResult,
  rejectedProposalContext,
  resolveQualityGateJudge,
  runLessonQualityJudge,
  stageRunner,
} from "./stage";
⋮----
export function isDistillRefusedInputType(type: string): boolean
⋮----
export interface AkmDistillOptions {

  ref: string;

  improveProfile?: ImproveProfileConfig;

  proposalKind?: "lesson" | "knowledge" | "auto";
  stashDir?: string;
  config?: AkmConfig;

  llmRunner?: RunnerSpec | null;

  run?: ConfiguredExecutionSettings;

  signal?: AbortSignal;

  chat?: typeof chatCompletion;

  ctx?: ProposalsContext;

  eventsCtx?: EventsContext;

  readEventsFn?: typeof readEvents;

  lookupFn?: (ref: string) => Promise<string | null>;

  sourceRun?: string;

  excludeFeedbackFromRefs?: readonly string[];
  excludeTags?: string[];
  includeTags?: string[];

  fetchRelatedFn?: (query: string, n: number) => Promise<RelatedAsset[]>;

  eligibilitySource?: EligibilitySource;

  itemRef?: string;
}
⋮----
interface RelatedAsset {
  ref: string;
  content: string;
  path?: string;
}
⋮----
export function deriveLessonRef(inputRef: string): string
⋮----
const clean = (value: string): string
⋮----
// ── Output contract ──────────────────────────────────────────────────────────
//
// The client sends a response schema `strict: true`, and a strict provider
// (OpenAI's) rejects an object whose `required` leaves out any of its
// properties, so every property is required and "none" is an empty array (#1046).
⋮----
interface StructuredDistillPayload {
  reason?: unknown;
  decision?: unknown;
  description?: unknown;
  when_to_use?: unknown;
  body?: unknown;
  tags?: unknown;
  sources?: unknown;
}
⋮----
export function assembleStructuredDistillMarkdown(
  payload: StructuredDistillPayload,
  kind: "lesson" | "knowledge",
): string | null
⋮----
const text = (value: unknown): string
const list = (value: unknown): string[]
⋮----
function answeredNone(raw: string):
⋮----
function validateKnowledgeContent(content: string, inputRef: string): DistillValidationFinding[]
⋮----
// A present description must be a real summary (not `---` or a heading fragment).
⋮----
interface BuildPromptInput {
  inputRef: string;
  assetContent: string | null;
  feedback: { ts: string; eventType: string; metadata?: Record<string, unknown> }[];
  proposalKind?: "lesson" | "knowledge";
  /** Recent reviewer rejections for this ref ("don't repeat this"). */
  rejectedProposals?: Array<{ reason: string; contentPreview?: string }>;
  /** Stash authoring standards for the output. */
  standardsContext?: string;
}
⋮----
/** Recent reviewer rejections for this ref ("don't repeat this"). */
⋮----
/** Stash authoring standards for the output. */
⋮----
/**
 * The distill user prompt. Feedback is rendered as "What worked" / "What
 * failed" contrast when it carries signals, else as a flat event list.
 */
export function buildDistillPrompt(input: BuildPromptInput): string
⋮----
// Source frontmatter is not evidence; fed verbatim, models copied it into the body.
⋮----
const flat = (event: BuildPromptInput["feedback"][number]): string
⋮----
type DistillKind = "lesson" | "knowledge";
⋮----
interface DistillRun {
  options: AkmDistillOptions;
  inputRef: string;

  ledgerRef: string;
  stash: string;
  config: AkmConfig;
  profile: ImproveProfileConfig;
  runner?: RunnerSpec;

  judgeRunner?: RunnerSpec;
  notices: NoticeSet;
  eligMeta: { eligibilitySource?: EligibilitySource };

  exclusion?: { filteredFeedbackCount: number; feedbackFullyFiltered: boolean };
  asset: { path: string | null; content: string | null };
  vocabulary: Set<string>;
  related: (query: string, n: number) => Promise<RelatedAsset[]>;
  lookup: (ref: string) => Promise<string | null>;
}
⋮----
function emitDistill(run: Pick<DistillRun, "ledgerRef" | "eligMeta" | "options">, meta: Record<string, unknown>): void
⋮----
function skipDistill(
  run: DistillRun,
  proposalRef: string,
  kind: DistillKind,
  skipReason: string,
  message: string,
): AkmDistillResult
⋮----
function exclusionMeta(run: DistillRun, forResult: boolean): Record<string, unknown>
⋮----
export async function akmDistill(options: AkmDistillOptions): Promise<AkmDistillResult>
⋮----
async function distill(
  run: DistillRun,
  targetKind: NonNullable<AkmDistillOptions["proposalKind"]>,
  kind: DistillKind,
  outputRef: string,
  feedbackEvents: ReturnType<typeof readEvents>["events"],
): Promise<AkmDistillResult>
⋮----
function feedbackLines(feedback: BuildPromptInput["feedback"]): string[]
⋮----
/** Whether a file already holds the lesson `ref` in the stash the proposal would be filed in. */
function lessonExists(run: DistillRun, ref: string): boolean
⋮----
function assembleDistilledContent(
  run: DistillRun,
  raw: string,
  kind: DistillKind,
  outputRef: string,
):
⋮----
function qualityGateEnabled(run: DistillRun): boolean
⋮----
async function judgeAndQueue(
  run: DistillRun,
  out: {
    ref: string;
    kind: DistillKind;
    content: string;
    source: string | null;
    descriptionSwapped?: number;

    feedback?: string[];

    promotion?: boolean;
  },
): Promise<AkmDistillResult>
⋮----
async function proposeLessonUpdate(
  run: DistillRun,
  feedback: string[],
  finding: string,
  related?: RelatedAsset[],
): Promise<AkmDistillResult | undefined>
⋮----
function rejectDistilled(
  run: DistillRun,
  proposalRef: string,
  content: string,
  score: number,
  reason: string,
  meta: Record<string, unknown>,
): AkmDistillResult
⋮----
export function writeQualityRejection(args: {
  stash: string;
  inputRef: string;
  proposalRef: string;
  content: string;
  score: number;
  reason: string;

  meta?: Record<string, unknown>;
  eligibilitySource?: EligibilitySource;
  eventsCtx?: EventsContext;
  proposalsCtx?: ProposalsContext;
  sourceRun?: string;

  ledgerRef?: string;
}): AkmDistillResult
⋮----
interface PromotionPlan {
  knowledgeRef: string;
  content: string;

  existing: string | null;
}
⋮----
async function planPromotion(
  run: DistillRun,
  feedbackEvents: ReturnType<typeof readEvents>["events"],
): Promise<PromotionPlan | null>
⋮----
async function promoteToKnowledge(run: DistillRun, plan: PromotionPlan): Promise<AkmDistillResult>
⋮----
async function loadInput(
  lookup: (ref: string) => Promise<string | null>,
  inputRef: string,
): Promise<DistillRun["asset"]>
⋮----
function loadRefVocabulary(): Set<string>
⋮----
function stampInputSalience(run: DistillRun): void
⋮----
function persistOutputEncodingSalience(run: DistillRun, ref: string, body: string): void
⋮----
function readDistillFeedback(run: DistillRun): ReturnType<typeof readEvents>["events"]
⋮----
async function buildDistillMessages(
  run: DistillRun,
  feedback: BuildPromptInput["feedback"],
  kind: DistillKind,
  outputRef: string,
): Promise<
⋮----
// CLS context is supplemental.
⋮----
async function defaultLookup(ref: string, stashDir: string): Promise<string | null>
⋮----
async function fetchRelatedAssets(query: string, n: number): Promise<RelatedAsset[]>
`````

## File: src/commands/improve/eligibility.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { parseBundleRef } from "../../core/asset/asset-ref";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { conceptIdFromTypeName, parseRefInput, resolveRef, typeNameFromConceptId } from "../../core/asset/resolve-ref";
import { closestMatch } from "../../core/closest-match";
import type { AkmConfig, ImproveProfileConfig } from "../../core/config/config";
import { loadConfig } from "../../core/config/config";
import { ConfigError, NotFoundError, rethrowIfTestIsolationError, UsageError } from "../../core/errors";
import type { ImproveEligibleRef, ImproveIndexSnapshot } from "../../core/improve-types";
import { isPathAbsent } from "../../core/path-access";
import { getDbPath } from "../../core/paths";
import { KNOWN_TYPES } from "../../core/recognition-util";
import { warn } from "../../core/warn";
import { deriveInstallations, deriveWritableBundleIds } from "../../indexer/installations";
import { resolveSourceEntries, type SearchSource } from "../../indexer/search/search-source";
import { resolveAssetPath } from "../../indexer/walk/path-resolver";
import type { Database } from "../../storage/database";
import {
  closeDatabase,
  openExistingDatabase,
  openReadonlyExistingDatabase,
} from "../../storage/repositories/index-connection";
import { getAllEntries } from "../../storage/repositories/index-entries-repository";
import { hasCurrentEntriesTable } from "../../storage/repositories/index-entry-schema";
import { getUtilityScoresByIds } from "../../storage/repositories/index-utility-repository";
import { SqliteReadSnapshotUnavailableError } from "../../storage/sqlite-read-snapshot";
import { isDistillRefusedInputType } from "./distill";
import { isStrategyFilteredForAllPasses } from "./improve-strategies";
import { parseMemoryRef } from "./memory/derived-ref";
⋮----
type Scope = { mode: "all" | "type" | "ref"; value?: string };
⋮----
export function assetTypeOf(ref: string): string
⋮----
/**
 * Run `fn` against index.db — the live index, or a non-mutating snapshot for
 * a dry run. `undefined` when there is none or the read fails (best-effort).
 */
export function withIndexDb<T>(readOnly: boolean, fn: (db: Database) => T): T | undefined
⋮----
/**
 * The index for candidate selection, or `undefined` when it is absent. An
 * index without a readable `entries` table needs a rebuild and says so.
 */
function openEligibilityDb(readOnly: boolean): Database | undefined
⋮----
function unreadableSnapshot(readOnly: boolean, error: unknown): ImproveIndexSnapshot | undefined
⋮----
export function resolveImproveScope(scope: string | undefined): Scope
⋮----
export function dedupeRefs(refs: ImproveEligibleRef[]): ImproveEligibleRef[]
⋮----
type EligibleRefs = {
  plannedRefs: ImproveEligibleRef[];
  memorySummary: { eligible: number; derived: number };




  strategyFilteredRefs: ImproveEligibleRef[];

  indexSnapshot?: ImproveIndexSnapshot;
};
⋮----
function runBundleIdOf(
  sources: readonly SearchSource[],
  installations: readonly { id: string }[],
  stashDir: string | undefined,
): string | undefined
⋮----
export async function collectEligibleRefs(
  scope: Scope,
  stashDir?: string,
  improveProfile?: ImproveProfileConfig,
  config?: AkmConfig,
): Promise<EligibleRefs>
⋮----
export async function collectEligibleRefsReadOnly(
  scope: Scope,
  stashDir?: string,
  improveProfile?: ImproveProfileConfig,
  config?: AkmConfig,
): Promise<EligibleRefs>
⋮----
async function collectEligibleRefsFromIndex(
  scope: Scope,
  stashDir: string | undefined,
  improveProfile: ImproveProfileConfig | undefined,
  readOnly: boolean,
  configOverride?: AkmConfig,
): Promise<EligibleRefs>
⋮----
const empty = (indexSnapshot?: ImproveIndexSnapshot): EligibleRefs => (
⋮----
const isCandidateBundle = (bundleId: string | undefined): boolean
⋮----
function warnUnmatchedTypeScope(value: string, indexed: ReturnType<typeof getAllEntries>): void
⋮----
export function memoryCleanupParentRef(scope: Scope, stashDir?: string): string | undefined
⋮----
export function isLessonCandidate(ref: string): boolean
⋮----
export function isDistillCandidateRef(ref: string, stashDir?: string): boolean
⋮----
export function shouldDistillMemoryRef(ref: string, stashDir?: string): boolean
⋮----
export function shouldAnalyzeMemoryCleanup(
  scope: Scope,
  eligibleMemories: number,
  primaryStashDir: string | undefined,
): boolean
⋮----
export function buildUtilityMap(refs: ImproveEligibleRef[], readOnly = false): Map<string, number>
⋮----
export async function findAssetFilePath(
  ref: string,
  stashDir?: string,
  writableBundleIds?: Set<string>,
): Promise<string | null>
`````

## File: src/commands/improve/encoding-salience.ts
`````typescript
export interface EncodingSalienceInputs {
  body: string;
  type: string;

  existingRefVocabulary: Set<string>;

  revisionCount: number;
}
⋮----
export interface EncodingSalienceResult {

  score: number;
  novelty: number;
  magnitude: number;
  predictionError: number;
}
⋮----
function tokenizeBody(text: string): string[]
⋮----
function tokenizeRef(ref: string): string[]
⋮----
function bigrams(tokens: string[]): string[]
⋮----
export function buildRefVocabulary(refs: string[]): Set<string>
⋮----
function computeNovelty(body: string, type: string, vocab: Set<string>): number
⋮----
function computeMagnitude(body: string): number
⋮----
function computePredictionError(revisionCount: number): number
⋮----
export function scoreEncodingSalience(inputs: EncodingSalienceInputs): EncodingSalienceResult
`````

## File: src/commands/improve/execution.ts
`````typescript
import type { AkmConfig } from "../../core/config/config";
import { IMPROVE_ENGINE_PROCESSES } from "../../core/config/engine-semantics";
import type { StandardAlias } from "../../core/config/model-aliases";
import { ConfigError } from "../../core/errors";
import type { LoweringNotice } from "../../execution/resolved-request";
import { type ConfiguredExecutionSettings, executionDefaultsOf } from "../../execution/source";
import { buildExecution, currentLayer, resolveExecution, shippedAlias } from "../../integrations/agent/execution";
import type { RunnerSpec } from "../../integrations/agent/runner";
⋮----
type ImproveExecutionLayer = ConfiguredExecutionSettings;
⋮----
export interface ResolveImproveExecutionOptions {
  config: AkmConfig;

  processName: string;

  alias: StandardAlias;

  process?: (typeof IMPROVE_ENGINE_PROCESSES)[number];




  index?: ImproveExecutionLayer;

  current?: ImproveExecutionLayer;

  run?: ImproveExecutionLayer;
}
⋮----
export interface ResolvedImproveExecution {
  runner: RunnerSpec;
  notices: readonly Readonly<LoweringNotice>[];
}
⋮----
export function resolveImproveExecution(options: ResolveImproveExecutionOptions): ResolvedImproveExecution | null
`````

## File: src/commands/improve/extract-cli.ts
`````typescript
import { getStringArg } from "../../cli/parse-args";
import { RETIRED_ENGINE_ARG, SELECTION_ARGS, selectionFromArgs } from "../../cli/selection";
import { defineJsonCommand, EXIT_CODES, output } from "../../cli/shared";
import { loadConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { getAvailableHarnesses } from "../../integrations/session-logs";
import { type AkmExtractResult, akmExtract, resolveStandaloneExtractPlan } from "./extract";
⋮----
async run(
`````

## File: src/commands/improve/extract-prompt.ts
`````typescript
import promptTemplate from "../../assets/prompts/extract-session.md" with { type: "text" };
import { escapeJsonStringControls, stripCodeFences, stripThinkBlocks } from "../../core/parse";
import type { InlineRefMention, SessionData, SessionEvent } from "../../integrations/session-logs/types";
⋮----
export interface ExtractPromptInput {
  data: SessionData;

  events: SessionEvent[];

  inlineRefs: InlineRefMention[];





  standardsContext?: string;
}
⋮----
function formatAlreadyPreserved(inlineRefs: InlineRefMention[]): string
⋮----
export function fenceTranscript(text: string): string
⋮----
function formatTranscript(events: SessionEvent[]): string
⋮----
export function buildExtractPrompt(input: ExtractPromptInput): string
⋮----
// ── Parser ──────────────────────────────────────────────────────────────────
⋮----
export interface ExtractCandidate {
  type: "memory" | "lesson" | "knowledge";
  name: string;
  description: string;
  when_to_use?: string;
  body: string;
  confidence: number;
  evidence: string;
}
⋮----
export interface ExtractPayload {
  candidates: ExtractCandidate[];

  dropped?: string[];
  rationale_if_empty?: string;

  parseFailure?: {
    code: "empty_response" | "no_json_object" | "invalid_json_object" | "invalid_payload";
    message: string;
  };
}
⋮----
function failedExtractPayload(
  code: NonNullable<ExtractPayload["parseFailure"]>["code"],
  message: string,
): ExtractPayload
⋮----
function parseFirstJsonObject(stdout: string):
⋮----
/** The candidate the model wrote when the contract keeps it, else the first rule it breaks. */
function readCandidate(c: Record<string, unknown>):
⋮----
export function parseExtractPayload(stdout: string): ExtractPayload
`````

## File: src/commands/improve/extract.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import type { SelectionFlags } from "../../cli/selection";
import { assembleAsset } from "../../core/asset/asset-serialize";
import { conceptIdFromTypeName } from "../../core/asset/resolve-ref";
import { resolveStashDir, timestampForFilename } from "../../core/common";
import type { AkmConfig, ImproveProcessConfig, ImproveProfileConfig } from "../../core/config/config";
import { getImproveProcessConfig, loadConfig } from "../../core/config/config";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { ConfigError, UsageError } from "../../core/errors";
import { appendEvent, type EventsContext } from "../../core/events";
import {
  createLockPayload,
  type LockOwnership,
  probeLock,
  reclaimStaleLock,
  releaseLock,
  tryAcquireLockSync,
} from "../../core/file-lock";
import type { AkmExtractResult, ExtractedSessionResult } from "../../core/improve-types";
import { EXTRACT_INFRASTRUCTURE_SKIP_REASONS } from "../../core/improve-types";
import { redactErrorBody } from "../../core/redaction";
import { resolveStashStandards } from "../../core/standards/resolve-stash-standards";
import { resolveTypeConventions, typeConventionRef } from "../../core/standards/resolve-type-conventions";
import { getStateDbPath, openStateDatabase } from "../../core/state-db";
import { repairTruncatedDescription } from "../../core/text-truncation";
import { DURATION_UNITS, parseDuration } from "../../core/time";
import { warn, warnVerbose } from "../../core/warn";
import { noticeSet } from "../../execution/notices";
import type { LoweringNotice } from "../../execution/resolved-request";
import { indexWrittenAssets } from "../../indexer/index-written-assets";
import type { RunnerSpec } from "../../integrations/agent/runner";
import { getAvailableHarnesses } from "../../integrations/session-logs";
import { preFilterSession } from "../../integrations/session-logs/pre-filter";
import type { SessionData, SessionLogHarness, SessionRef, SessionSummary } from "../../integrations/session-logs/types";
import type { ChatCompletionConfig, ChatMessage } from "../../llm/client";
import { isRefused } from "../../llm/structured";
import type { Database } from "../../storage/database";
import {
  type ExtractedSessionRow,
  getExtractedSessionsMap,
  getLastExtractRunAt,
  shouldSkipAlreadyExtractedSession,
  upsertExtractedSession,
} from "../../storage/repositories/extract-sessions-repository";
import { type ImproveLedgerRow, listImproveLedgerRows } from "../../storage/repositories/improve-ledger-repository";
import { getStateProposal } from "../../storage/repositories/proposals-repository";
import { openSqliteReadSnapshot } from "../../storage/sqlite-read-snapshot";
import type { ProposalsContext } from "../proposal/repository";
import { contentHash } from "./content-hash";
import { resolveImproveExecution } from "./execution";
import {
  buildExtractPrompt,
  EXTRACT_JSON_SCHEMA,
  type ExtractCandidate,
  type ExtractPayload,
  parseExtractPayload,
} from "./extract-prompt";
import { cloneAndFreeze, resolveImproveStrategy, resolveProcessEnabled } from "./improve-strategies";
import { isLedgerBlocked, ledgerKey, readLedgerDb } from "./ledger";
import {
  buildSessionSummaryPrompt,
  parseSessionSummary,
  SESSION_SUMMARY_JSON_SCHEMA,
  type SessionSummaryGenerator,
  sessionMeetsDurationGate,
  writeSessionAsset,
} from "./session-asset";
import { callStage, callStageLoop, mintProposal } from "./stage";
⋮----
function resolveDefaultSinceMs(
  harnessName: string,
  now: number,
  opts: { stateDb?: Database; stateDbPath?: string; skipTracking?: boolean },
): number
⋮----
function extractSessionLockPath(harness: string, sessionId: string, stateDbPath: string): string
⋮----
function extractSessionLockIsUnavailable(harness: string, sessionId: string, stateDbPath: string): boolean
⋮----
function acquireExtractSessionLock(lockPath: string):
⋮----
export interface AkmExtractOptions {

  type: string;

  location?: string;

  sessionId?: string;

  since?: string;
  dryRun?: boolean;
  stashDir?: string;
  config?: AkmConfig;

  llmRunner?: RunnerSpec;

  resolvedPlan?: ResolvedExtractPlan;

  harnesses?: SessionLogHarness[];

  chat?: (
    config: ChatCompletionConfig,
    messages: ChatMessage[],
    options?: { timeoutMs?: number | null; responseSchema?: Record<string, unknown>; signal?: AbortSignal },
  ) => Promise<string>;

  ctx?: ProposalsContext;

  eventsCtx?: EventsContext;
  sourceRun?: string;

  improveProfile?: ImproveProfileConfig;
  signal?: AbortSignal;

  force?: boolean;

  skipTracking?: boolean;

  stateDb?: Database;

  stateDbPath?: string;

  generateSessionSummary?: SessionSummaryGenerator;
}
⋮----
export interface ResolvedExtractPlan {
  strategy: string;
  engine: string;
  enabled: boolean;
  process: Readonly<ImproveProcessConfig>;
  runner: Readonly<RunnerSpec> | null;
  embeddingConfig: Readonly<AkmConfig["embedding"]>;
  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export function resolveStandaloneExtractPlan(
  config: AkmConfig,
  selection: SelectionFlags & { strategy?: string; timeoutMs?: number | null },
): ResolvedExtractPlan
⋮----
type ExtractSessionOutcome = Omit<ExtractedSessionResult, "engine">;
type PreFilterStats = ExtractedSessionResult["preFilter"];
⋮----
function sessionOutcome(
  sessionId: string,
  harness: string,
  fields: Partial<ExtractSessionOutcome>,
): ExtractSessionOutcome
⋮----
function preFilterStats(filtered: ReturnType<typeof preFilterSession>): PreFilterStats
⋮----
function emptyExtractResult(args: {
  ok: boolean;
  dryRun: boolean;
  type: string;
  warning: string;
  startMs: number;
  llmRunner?: RunnerSpec;
}): AkmExtractResult
⋮----
export function parseSinceArg(value: string | undefined, now: number = Date.now()): number
⋮----
/**
 * Assemble candidate metadata once in the authoritative Markdown that acceptance
 * publishes. The payload projection is for proposal readers, not another write path.
 */
function buildCandidateProposal(
  candidate: ExtractCandidate,
  sourceRef: SessionSummary,
  sessionAssetRef?: string,
):
⋮----
// Complete a description the model cut mid-sentence (no-op for valid ones).
⋮----
// With no published session asset, keep the known native session identity in
// the existing structured provenance channel, never invent an AKM asset ref.
// The identity, not the log's absolute path, so published notes carry no local paths.
⋮----
function canonicalSegment(value: string): string
⋮----
export function deriveExtractCandidateRef(candidate: ExtractCandidate, sourceRef: SessionSummary): string
⋮----
function resolveExtractStandards(stashDir: string): string
⋮----
export function hashSessionContent(data: SessionData): string
⋮----
function sessionTriagePasses(data: SessionData, minScore: number): boolean
⋮----
const count = (predicate: (e: SessionData["events"][number])
⋮----
type Triage = { enabled: boolean; minScore: number };
⋮----
interface SessionGateOptions {
  maxTotalChars: number | undefined;
  minContentChars: number;
  triage: Triage;
}
⋮----
async function runPreLlmSessionGates(
  harness: SessionLogHarness,
  sessionRef: SessionRef,
  prior: ExtractedSessionRow | undefined,
  force: boolean,
  gates: SessionGateOptions,
): Promise<
  | { skip: ExtractSessionOutcome }
  | { data: SessionData; filtered: ReturnType<typeof preFilterSession>; contentHash: string }
> {
  const { sessionId } = sessionRef;
  let data: SessionData;
  try {
    data = await harness.readSession(sessionRef);
⋮----
type ExtractEligibleGate = Exclude<Awaited<ReturnType<typeof runPreLlmSessionGates>>, { skip: ExtractSessionOutcome }>;
⋮----
type ExtractSessionPlan =
  | { kind: "skip"; summary: SessionSummary; result: ExtractSessionOutcome }
  | { kind: "model"; summary: SessionSummary; gate: ExtractEligibleGate };
⋮----
function lockedConcurrentResult(harness: string, summary: SessionSummary): ExtractSessionOutcome
⋮----
async function planExtractSessions(args: {
  candidates: SessionSummary[];
  options: AkmExtractOptions;
  harness: SessionLogHarness;
  seenMap: Map<string, ExtractedSessionRow>;
  gates: SessionGateOptions;
  maxSessionsPerRun: number;
  locking: boolean;
}): Promise<
⋮----
const lockUnavailable = (summary: SessionSummary)
⋮----
interface ExtractRun {
  options: AkmExtractOptions;
  harness: SessionLogHarness;
  stashDir: string;
  config: AkmConfig;
  llmRunner: RunnerSpec;
  notices: ReturnType<typeof noticeSet>;
  sourceRun: string;
  dryRun: boolean;
  gates: SessionGateOptions;
  maxSessionsPerRun: number;
  effectiveSince: string | undefined;
  sessionIndexing: { enabled: boolean; minDurationMinutes: number; generate: SessionSummaryGenerator };

  standardsContext: string;
}
⋮----
type SessionExtraction =
  | { kind: "success"; payload: ExtractPayload; attempts: number }
  | { kind: "unavailable" }
  | { kind: "malformed"; raw: string; attempts: number; failure: NonNullable<ExtractPayload["parseFailure"]> };
⋮----
async function extractFromSession(run: ExtractRun, prompt: string): Promise<SessionExtraction>
⋮----
async function maybeWriteSessionAsset(
  run: ExtractRun,
  data: SessionData,
): Promise<
⋮----
async function processSession(
  run: ExtractRun,
  sessionRef: SessionRef,
  gate: ExtractEligibleGate,
): Promise<ExtractSessionOutcome>
⋮----
function persistedExtractOutcome(result: ExtractSessionOutcome): ExtractedSessionRow["outcome"]
⋮----
interface ExtractLoopTally {
  sessions: ExtractedSessionResult[];
  processedCount: number;
  skippedCount: number;
  triageEvaluated: number;
  triagePassed: number;
  triagedOut: number;
  allProposalIds: string[];
  deferred: number;
}
⋮----
async function runExtractSessionLoop(
  run: ExtractRun,
  planned: { plans: ExtractSessionPlan[]; deferredCandidates: SessionSummary[] },
  seenMap: Map<string, ExtractedSessionRow>,
  stateDb: Database | undefined,
  tracking: boolean,
  topLevelWarnings: string[],
): Promise<ExtractLoopTally>
⋮----
const account = (result: ExtractSessionOutcome): ExtractedSessionResult =>
const accountAndRecord = (summary: SessionSummary, result: ExtractSessionOutcome): void =>
⋮----
const refillModelSlot = async (): Promise<void> =>
⋮----
function recordSessionOutcome(
  stateDb: Database | undefined,
  enabled: boolean,
  harness: string,
  summary: SessionSummary,
  result: ExtractedSessionResult,
  sourceRun: string,
): void
⋮----
function resolveExtractRun(
  options: AkmExtractOptions,
  config: AkmConfig,
  process: Readonly<ImproveProcessConfig> | undefined,
): Omit<ExtractRun, "options" | "harness" | "stashDir" | "config" | "sourceRun" | "dryRun" | "standardsContext">
⋮----
const generate: SessionSummaryGenerator = async (data) =>
⋮----
async function discoverExtractCandidates(
  options: AkmExtractOptions,
  harness: SessionLogHarness,
  effectiveSince: string | undefined,
  startMs: number,
  dryRun: boolean,
  llmRunner: RunnerSpec,
): Promise<
⋮----
function loadSeenMapReadOnly(
  options: AkmExtractOptions,
  harness: string,
  candidates: SessionSummary[],
  warnings: string[],
): Map<string, ExtractedSessionRow>
⋮----
export async function akmExtract(options: AkmExtractOptions): Promise<AkmExtractResult>
⋮----
// best-effort
⋮----
// Every skip reason is counted; infrastructure failures also get a warning line.
⋮----
export interface CountNewExtractCandidatesOptions {

  since?: string;
  harnesses?: SessionLogHarness[];
  stateDb?: Database;

  stateDbPath?: string;

  improveProfile?: ImproveProfileConfig;

  readOnly?: boolean;
}
⋮----
export async function countNewExtractCandidates(
  _config: AkmConfig,
  options: CountNewExtractCandidatesOptions = {},
): Promise<number>
`````

## File: src/commands/improve/feedback-valence.ts
`````typescript
export interface FeedbackCounts {
  positive: number;
  negative: number;
}
⋮----
export interface ValenceScore {





  valence: number;

  magnitude: number;





  attention: number;
}
⋮----
export function computeValenceScore(counts: FeedbackCounts): ValenceScore
`````

## File: src/commands/improve/improve-cli.ts
`````typescript
import path from "node:path";
import { defineCommand } from "citty";
import { findCittyTopLevelCommandIndex, getStringArg, hasSubcommand, parsePositiveIntFlag } from "../../cli/parse-args";
import { SELECTION_ARGS, selectionFromArgs } from "../../cli/selection";
import { defineJsonCommand, GLOBAL_OUTPUT_ARGS, output, runWithJsonErrors } from "../../cli/shared";
import { type AssetRef, isFullRefInput, parseRefInput } from "../../core/asset/resolve-ref";
import type { AkmConfig } from "../../core/config/config";
import { loadConfig } from "../../core/config/config";
import { collectCredentialValues } from "../../core/config/credentials";
import { ConfigError, UsageError } from "../../core/errors";
import { resolveMutationTarget } from "../../core/mutation-target";
import { getRunLogDir } from "../../core/paths";
import { redactSensitiveText } from "../../core/redaction";
import { clearLogFile, setLogFile, warnOnce } from "../../core/warn";
import { resolveWriteTarget } from "../../core/write-source";
import { getOutputMode } from "../../output/context";
import { deliverRendered } from "../../output/html-render";
import { readStdin } from "../../runtime";
import { akmImprove, IMPROVE_TARGET_FLAG, resolveImproveReadSource } from "./improve";
import { runImproveReportQuery } from "./improve-report";
import {
  buildImproveRunId,
  recordImproveRunResult,
  recordTerminatedImproveRun,
  type TerminationReason,
} from "./improve-result-file";
import { runImproveSession } from "./improve-session";
import { type ResolvedImprovePlan, resolveImprovePlan, resolveImproveStrategy } from "./improve-strategies";
import { formatUsageReportTable } from "./improve-usage-report";
import { renderReflectPromptPreview } from "./reflect";
import { resolveQualityGateJudge, runReflectQualityJudge } from "./stage";
⋮----
export function _setAkmImproveForTests(fake?: typeof akmImprove): void
⋮----
async function runShowPromptCli(
  refArg: string,
  parsedRef: AssetRef,
  taskArg: string | undefined,
  targetArg: string | undefined,
  resolvedPlan: ResolvedImprovePlan,
): Promise<void>
⋮----
run(
⋮----
async run(
⋮----
setup(context)
cleanup(context)
⋮----
const persistTerminated = (reason: TerminationReason, errorMessage?: string): void =>
`````

## File: src/commands/improve/improve-report.ts
`````typescript
import { NotFoundError, UsageError } from "../../core/errors";
import { type EventsContext, readEvents } from "../../core/events";
import { decodeImproveResult } from "../../core/improve-result";
import { withStateDb } from "../../core/state-db";
import { LLM_USAGE_EVENT } from "../../llm/usage-persist";
import {
  getImproveRunById,
  getLatestImproveRun,
  queryImproveRuns,
} from "../../storage/repositories/improve-runs-repository";
import { parseHealthSince } from "../health";
import { summarizeLlmUsageCrossTab } from "../health/llm-usage";
import type { LlmUsageCrossTabRow } from "../health/types";
import type { UsageReportNoCallRow } from "./improve-usage-report";
⋮----
export interface ImproveReportUsage {
  byProcessEngineModel: LlmUsageCrossTabRow[];
  noCalls: UsageReportNoCallRow[];
}
⋮----
export interface ImproveReportResult {
  mode: "run" | "since";
  runId?: string;
  runIds?: string[];
  since?: string;
  strategy?: string;
  usageReport: ImproveReportUsage;
  notes?: string[];
}
⋮----
function crossTabFromEvents(
  startedAt: string,
  completedAt: string | null,
  eventsCtx?: EventsContext,
): LlmUsageCrossTabRow[]
⋮----
interface ReportableRunRow {
  started_at: string;
  completed_at: string | null;
  result_json: string;
}
⋮----
function usageReportForRow(
  row: ReportableRunRow,
  eventsCtx?: EventsContext,
):
⋮----
function mergeCrossTabRow(merged: Map<string, LlmUsageCrossTabRow>, row: LlmUsageCrossTabRow): void
⋮----
export function runImproveReportQuery(options:
`````

## File: src/commands/improve/improve-result-file.ts
`````typescript
import crypto from "node:crypto";
import { decodeImproveResult } from "../../core/improve-result";
import { redactSensitiveValue } from "../../core/redaction";
import { withImmediateTransaction, withStateDb } from "../../core/state-db";
import { recordImproveRun } from "../../storage/repositories/improve-runs-repository";
import type { AkmImproveResult } from "./improve";
⋮----
export function buildImproveRunId(now: Date = new Date()): string
⋮----
export function recordImproveRunResult(
  stashDir: string,
  runId: string,
  result: AkmImproveResult,
  startedAt?: string,
  sensitiveValues: readonly string[] = [],
): void
⋮----
export type TerminationReason = "SIGTERM" | "SIGINT" | "SIGHUP" | "exception" | string;
⋮----
export function recordTerminatedImproveRun(
  stashDir: string,
  runId: string,
  startedAt: string,
  reason: TerminationReason,
  ctx: {
    scopeMode?: "all" | "type" | "ref";
    scopeValue?: string | null;
    dryRun?: boolean;
    strategy: string;
    errorMessage?: string;
    sensitiveValues?: readonly string[];
  },
): void
`````

## File: src/commands/improve/improve-run-types.ts
`````typescript
import type { AkmConfig, ImproveProfileConfig } from "../../core/config/config";
import type { EventsContext } from "../../core/events";
import type {
  AkmDistillResult,
  AkmReflectResult,
  ConsolidateResult,
  ImproveActionResult,
  ImproveEligibleRef,
  ImproveExecutionPlan,
  ImprovePlanGate,
} from "../../core/improve-types";
import type { ResolvedWriteTarget } from "../../core/write-source";
import type { EnsureIndexOptions } from "../../indexer/ensure-index";
import type { MemoryInferenceResult, runMemoryInferencePass } from "../../indexer/passes/memory-inference";
import type { SessionLogHarness } from "../../integrations/session-logs/types";
import type { saveGitStash } from "../../sources/providers/git";
import type { drainProposals } from "../proposal/drain";
import type { DeadUrl, DeadUrlCoverage } from "../url-checker";
import type { akmDistill } from "./distill";
import type { collectEligibleRefs, resolveImproveScope } from "./eligibility";
import type { AkmExtractResult, countNewExtractCandidates } from "./extract";
import type { ResolvedImprovePlan } from "./improve-strategies";
import type { applyMemoryCleanup } from "./memory/memory-improve";
import type { akmReflect } from "./reflect";
⋮----
export type ImproveScope = ReturnType<typeof resolveImproveScope>;
⋮----
type ReflectFn = (options: NonNullable<Parameters<typeof akmReflect>[0]>) => Promise<AkmReflectResult>;
type DistillFn = (options: NonNullable<Parameters<typeof akmDistill>[0]>) => Promise<AkmDistillResult>;
⋮----
export interface AkmImproveOptions {
  scope?: string;
  task?: string;
  dryRun?: boolean;
  target?: string;

  writeTarget?: ResolvedWriteTarget;

  sourceName?: string;
  stashDir?: string;
  config?: AkmConfig;

  resolvedPlan?: ResolvedImprovePlan;

  runId?: string;

  timeoutMs?: number;
  limit?: number;

  skipIfLocked?: boolean;

  strategy?: string;

  repairValidationFailures?: boolean;

  requireFeedbackSignal?: boolean;

  sync?: { enabled?: boolean; push?: boolean };

  onBudgetHardKill?: () => void;

  collectEligibleRefsFn?: typeof collectEligibleRefs;
  runImprovePreparationStageFn?: typeof import("./preparation").runImprovePreparationStage;
  runImproveLoopStageFn?: typeof import("./loop-stages").runImproveLoopStage;
  runImprovePostLoopStageFn?: typeof import("./loop-stages").runImprovePostLoopStage;
  reflectFn?: ReflectFn;
  distillFn?: DistillFn;
  memoryInferenceFn?: typeof runMemoryInferencePass;
  extractCandidateCountFn?: (...args: Parameters<typeof countNewExtractCandidates>) => number | Promise<number>;

  extractHarnesses?: SessionLogHarness[];
  ensureIndexFn?: (stashDir: string, options?: EnsureIndexOptions) => Promise<unknown>;
  reindexFn?: (options: { stashDir: string; signal?: AbortSignal }) => Promise<unknown>;
  drainProposalsFn?: typeof drainProposals;
  saveGitStashFn?: typeof saveGitStash;
}
⋮----
export interface ImprovePreparationResult {
  actions: ImproveActionResult[];
  cleanupWarnings: string[];
  appliedCleanup?: ReturnType<typeof applyMemoryCleanup>;
  memoryIndexHealth?: { lineCount: number; overBudget: boolean };
  extract?: AkmExtractResult[];

  actionableRefs: ImproveEligibleRef[];

  signalBearingSet: Set<string>;
  validationFailures: Array<{ ref: string; reason: string }>;
  schemaRepairs: Array<{
    ref: string;
    reason: string;
    outcome: "queued" | "skipped" | "error";
    proposalId?: string;
    error?: string;
  }>;
  lintSummary?: { fixed: number; flagged: number };

  loopRefs: ImproveEligibleRef[];

  distillCooledRefs: Set<string>;

  distillOnlyRefs: ImproveEligibleRef[];
  coverageGaps: string[];
  recentErrors: Record<string, string[]>;
  consolidation: ConsolidateResult;
  proactiveMaintenance?: { selected: number; dueTotal: number; neverReflected: number; selectedRefs: string[] };
  planning: {
    gates: ImprovePlanGate[];
    proactive?: ImproveExecutionPlan["proactive"];
    consolidation: ImproveExecutionPlan["consolidation"];
    extract: { wouldRun: boolean; reason: string };
  };
}
⋮----
export interface ImproveLoopResult {
  reflectsWithErrorContext: number;
  memoryRefsForInference: Set<string>;
}
⋮----
export interface ImprovePostLoopResult {
  allWarnings: string[];
  deadUrls?: DeadUrl[];

  deadUrlCoverage?: DeadUrlCoverage;
  memoryInference?: MemoryInferenceResult;
  maintenanceActions?: ImproveActionResult[];
  memoryInferenceDurationMs: number;
  orphansPurged?: number;
  proposalsExpired?: number;
}
⋮----
export interface ImproveMaintenanceResult {
  memoryInference?: MemoryInferenceResult;
  actions?: ImproveActionResult[];
  memoryInferenceDurationMs: number;
  orphansPurged?: number;
  proposalsExpired?: number;
}
⋮----
export interface ConsolidationPassResult {
  consolidation: ConsolidateResult;
  plan: ImproveExecutionPlan["consolidation"];
}
⋮----
export interface ImproveLoopState {
  eventsCtx?: EventsContext;
  budgetSignal?: AbortSignal;

  primaryStashDir: string | undefined;
  scope: ImproveScope;
  options: AkmImproveOptions;
  reflectFn: ReflectFn;
  distillFn: DistillFn;
  improveProfile: ImproveProfileConfig;
  resolvedPlan: ResolvedImprovePlan;
  startMs: number;
  budgetMs: number;
  loopRefs: ImproveEligibleRef[];
  actions: ImproveActionResult[];
  signalBearingSet: Set<string>;
  distillCooledRefs: Set<string>;
  distillOnlyRefs: ImproveEligibleRef[];
  recentErrors: Record<string, string[]>;
}
`````

## File: src/commands/improve/improve-session.ts
`````typescript
import type { TerminationReason } from "./improve-result-file";
⋮----
export interface SignalSource {
  once(signal: string, handler: () => void): unknown;
  removeListener(signal: string, handler: () => void): unknown;
}
⋮----
once(signal: string, handler: ()
removeListener(signal: string, handler: ()
⋮----
export interface RunImproveSessionOptions<T> {

  runWork: () => Promise<T>;
}
⋮----
export interface RunImproveSessionDeps {

  signalSource: SignalSource;

  exit: (code: number) => never;






  onTerminate: (reason: TerminationReason) => void;

  ack?: (message: string) => void;
}
⋮----
export async function runImproveSession<T>(opts: RunImproveSessionOptions<T>, deps: RunImproveSessionDeps): Promise<T>
⋮----
const makeSignalHandler = (sig: keyof typeof SIGNAL_TABLE) => () =>
`````

## File: src/commands/improve/improve-strategies.ts
`````typescript
import consolidate from "../../assets/improve-strategies/consolidate.json" with { type: "json" };
import defaultStrategy from "../../assets/improve-strategies/default.json" with { type: "json" };
import { conceptIdFromTypeName, parseRefInput } from "../../core/asset/resolve-ref";
import {
  type AkmConfig,
  ambiguousDefaultAdvice,
  type ImproveProcessConfig,
  type ImproveProfileConfig,
} from "../../core/config/config";
import { ImproveProfileConfigSchema } from "../../core/config/config-schema";
import { deepMergeConfig } from "../../core/config/deep-merge";
import {
  BUILTIN_IMPROVE_STRATEGY_NAMES,
  IMPROVE_ENGINE_PROCESSES,
  IMPROVE_PROCESS_NAMES,
  REMOVED_IMPROVE_STRATEGY_NAMES,
} from "../../core/config/engine-semantics";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { ConfigError } from "../../core/errors";
import type { LoweringNotice } from "../../execution/resolved-request";
import type { ConfiguredExecutionSettings } from "../../execution/source";
import type { RunnerSpec } from "../../integrations/agent/runner";
import { applyAutonomyGate, type GatedLane } from "./autonomy-gate";
import { resolveImproveExecution } from "./execution";
import { stripBundle } from "./ledger";
⋮----
export type ImproveStrategyConfig = ImproveProfileConfig;
⋮----
export interface SelectedStrategy {
  name: string;
  config: ImproveStrategyConfig;
}
⋮----
export function resolveProcessEnabled(
  processName: keyof NonNullable<ImproveProfileConfig["processes"]> | string,
  strategy: ImproveProfileConfig,
): boolean
⋮----
function stripBundlePrefix(value: string): string
⋮----
export function shouldSkipRef(
  ref: string,
  processName: "reflect" | "distill" | "consolidate",
  strategy: ImproveProfileConfig,
):
⋮----
export function eligibleRefCount(
  refs: readonly { ref: string }[],
  process: string,
  strategy: ImproveProfileConfig,
): number | undefined
⋮----
export function isStrategyFilteredForAllPasses(ref: string, strategy: ImproveProfileConfig): boolean
⋮----
export function resolveImproveStrategy(name: string | undefined, config: AkmConfig): SelectedStrategy
⋮----
export type ImproveProcessName = (typeof IMPROVE_PROCESS_NAMES)[number];
⋮----
export interface ResolvedImproveProcess {
  enabled: boolean;
  config: Readonly<ImproveProcessConfig>;
  runner: RunnerSpec | null;
  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export type EngineUnavailableProcessName = ImproveProcessName | "triage.judgment";
⋮----
export interface EngineUnavailableProcess {
  process: EngineUnavailableProcessName;
  configKey: string;
  reason: string;
}
⋮----
export interface ResolvedImprovePlan {

  config: Readonly<AkmConfig>;
  strategy: Readonly<SelectedStrategy>;
  processes: Readonly<Record<ImproveProcessName, ResolvedImproveProcess>>;
  triageJudgment: RunnerSpec | null;
  triageJudgmentNotices?: readonly Readonly<LoweringNotice>[];

  run?: Readonly<ConfiguredExecutionSettings>;





  autonomyGated: readonly GatedLane[];
  engineUnavailable: readonly EngineUnavailableProcess[];
}
⋮----
export interface ProcessRoutingRow {
  process: EngineUnavailableProcessName;
  enabled: boolean;

  engine?: string;

  model?: string;

  engineKind?: RunnerSpec["kind"];

  notices: readonly Readonly<LoweringNotice>[];

  unavailable?: { configKey: string; reason: string };

  eligibleRefs?: number;
}
⋮----
export function projectResolvedProcessRouting(plan: ResolvedImprovePlan): ProcessRoutingRow[]
⋮----
export function cloneAndFreeze<T>(value: T): Readonly<T>
⋮----
const freeze = (item: unknown): void =>
⋮----
export interface ImprovePlanOptions {
  repairValidationFailures?: boolean;

  run?: ConfiguredExecutionSettings;
}
⋮----
export function resolveImprovePlan(
  name: string | undefined,
  config: AkmConfig,
  options: ImprovePlanOptions = {},
): ResolvedImprovePlan
⋮----
function buildImprovePlan(
  strategy: SelectedStrategy,
  config: AkmConfig,
  options: ImprovePlanOptions,
): Omit<ResolvedImprovePlan, "autonomyGated">
`````

## File: src/commands/improve/improve-usage-report.ts
`````typescript
import type { DistillSkippedAggregate, ImproveActionResult, ImproveEligibleRef } from "../../core/improve-types";
import type { LlmUsageCrossTabRow } from "../health/types";
import type { AutonomyLane, GatedLane } from "./autonomy-gate";
import {
  eligibleRefCount,
  type ImproveProcessName,
  MODEL_CALLING_PROCESSES,
  type ProcessRoutingRow,
  projectResolvedProcessRouting,
  type ResolvedImprovePlan,
} from "./improve-strategies";
⋮----
export interface UsageReportNoCallRow {
  process: string;
  engine?: string;
  reason: string;
}
⋮----
export interface ImproveUsageReport {
  byProcessEngineModel: readonly LlmUsageCrossTabRow[];
  noCalls: readonly UsageReportNoCallRow[];
}
⋮----
function dominantReason(counts: Record<string, number>): string | undefined
⋮----
export function deriveNoCallReason(args: {
  row: Pick<ProcessRoutingRow, "enabled" | "unavailable"> & { process: ImproveProcessName };
  autonomyGated: readonly GatedLane[];
  strategyFilteredRefsCount: number;

  eligibleRefs?: number;

  skipReasonCounts?: Record<string, number>;
}): string | undefined
⋮----
function countReflectSkipReasons(actions: readonly ImproveActionResult[]): Record<string, number>
⋮----
export function buildImproveUsageReport(args: {
  resolvedPlan: ResolvedImprovePlan;
  byProcessEngineModel: readonly LlmUsageCrossTabRow[];
  strategyFilteredRefsCount: number;
  loopRefs: readonly ImproveEligibleRef[];
  persistedActions: readonly ImproveActionResult[];
  distillSkippedAggregate?: DistillSkippedAggregate;
}): ImproveUsageReport | undefined
⋮----
function renderFixedWidthTable(headers: readonly string[], rows: readonly (readonly string[])[]): string[]
⋮----
const renderRow = (cells: readonly string[]): string
⋮----
export function formatUsageReportTable(usageReport: ImproveUsageReport, notes?: readonly string[]): string
`````

## File: src/commands/improve/improve.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { type AssetRef, parseRefInput } from "../../core/asset/resolve-ref";
import { type AkmConfig, bundlesToSourceEntries, loadConfig } from "../../core/config/config";
import { collectCredentialValues } from "../../core/config/credentials";
import { ConfigError, rethrowIfTestIsolationError, UsageError } from "../../core/errors";
import { appendEvent, type EventsContext } from "../../core/events";
import type { LockOwnership } from "../../core/file-lock";
import type {
  AkmImproveResult,
  ImproveActionMode,
  ImproveActionResult,
  ImproveEligibleRef,
  ImproveIndexSnapshot,
  ImproveMemoryCleanupResult,
} from "../../core/improve-types";
import { classifyImproveAction, foldDistillSkipped } from "../../core/improve-types";
import { resolveMutationTarget } from "../../core/mutation-target";
import { getDbPath, getStashLocksDir, getStateDbPathInDataDir } from "../../core/paths";
import { redactSensitiveText } from "../../core/redaction";
import { openStateDatabase } from "../../core/state-db";
import { info, warn, warnVerbose } from "../../core/warn";
import { beginWriteProvenance, relativeWrittenPath, type WriteProvenanceJournal } from "../../core/write-provenance";
import { resolveWorkingStashTarget, resolveWritable, resolveWriteTarget } from "../../core/write-source";
import { type Notice, noticeSet } from "../../execution/notices";
import { ensureIndex } from "../../indexer/ensure-index";
import { indexWrittenAssets } from "../../indexer/index-written-assets";
import { akmIndex } from "../../indexer/indexer";
import { countPendingMemoriesNeedingDecision } from "../../indexer/passes/memory-inference";
import { resolveEntryContentDir, resolveSourceEntries } from "../../indexer/search/search-source";
import { installLlmUsagePersistence } from "../../llm/usage-persist";
import { type LlmUsageRecord, withLlmStage } from "../../llm/usage-telemetry";
import {
  GitStashPushError,
  isGitBackedStash,
  listGitChangedPaths,
  resolveWritableOverride,
  saveGitStash,
} from "../../sources/providers/git";
import type { Database } from "../../storage/database";
import { closeDatabase, openExistingDatabase } from "../../storage/repositories/index-connection";
import { withIndexDb } from "../../storage/repositories/index-db";
import { getEntryCount } from "../../storage/repositories/index-entries-repository";
import { openSqliteReadSnapshot, SqliteReadSnapshotUnavailableError } from "../../storage/sqlite-read-snapshot";
import { summarizeLlmUsageRecordsCrossTab } from "../health/llm-usage";
import { type DrainResult, drainProposals } from "../proposal/drain";
import type { EligibilitySource } from "../proposal/proposal-types";
import { type AcceptCommitCollector, commitCollectedAccepts } from "../proposal/repository";
import { type AutonomyLane, describeGatedLanes, isAutonomyLaneAllowed } from "./autonomy-gate";
import { akmDistill } from "./distill";
import {
  collectEligibleRefs,
  collectEligibleRefsReadOnly,
  memoryCleanupParentRef,
  resolveImproveScope,
  shouldAnalyzeMemoryCleanup,
} from "./eligibility";
import type {
  AkmImproveOptions,
  ImprovePostLoopResult,
  ImprovePreparationResult,
  ImproveScope,
} from "./improve-run-types";
import {
  eligibleRefCount,
  projectResolvedProcessRouting,
  resolveImprovePlan,
  resolveImproveStrategy,
} from "./improve-strategies";
import { buildImproveUsageReport } from "./improve-usage-report";
import { improveLockPath, releaseImproveLock, tryAcquireImproveLock } from "./locks";
import { runImproveLoopStage, runImprovePostLoopStage } from "./loop-stages";
import {
  analyzeMemoryCleanup,
  type MemoryCleanupPlan,
  purgeGracedArchive,
  RETIRE_GRACE_DAYS,
} from "./memory/memory-improve";
import { buildImproveExecutionPlan } from "./planner";
import { CONSOLIDATION_CONFIG_KEYS, pickDefined, recordImproveSkip, runImprovePreparationStage } from "./preparation";
import { akmReflect } from "./reflect";
import { errMessage } from "./stage";
⋮----
export function renderSyncCommitMessage(
  template: string,
  result: {
    scope: { mode: string; value?: string };
    plannedRefs: unknown[];
    triage?: { promoted: number; rejected: number; deferred: number; failed: number; skippedByCap: number };
    runId?: string;
  },
  nowMs: number,
): string
⋮----
/**
 * How long the loop waits for its first model response before printing one
 * "still waiting" line (#957): a dead endpoint otherwise looks like a slow run.
 * Armed when the loop starts, not at run start.
 */
⋮----
export function armBudgetWatchdog(
  budgetMs: number,
  controller: AbortController,
  deps?: {
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
exitFn?: (code: number)
⋮----
export async function akmImprove(options: AkmImproveOptions =
⋮----
let clearBudgetTimer = (): void =>
let clearFirstResponseHeartbeat = (): void =>
⋮----
const closeJournal = () =>
⋮----
let disposeLlmUsageSink = (): void =>
⋮----
const releaseRunLock = (): void =>
const teardown = () =>
⋮----
clearFirstResponseHeartbeat = ()
⋮----
function describeRunWrittenPaths(setup: ImproveRunSetup, writtenPaths: readonly string[]): string[]
⋮----
interface ImproveReadSource {
  selector?: string;
  source: { name: string; path: string };
}
⋮----
export function resolveImproveReadSource(
  config: AkmConfig,
  scopedRef: AssetRef | undefined,
  explicitTarget: string | undefined,
  fallbackStashDir?: string,
): ImproveReadSource
⋮----
function resolveImproveRunSetup(options: AkmImproveOptions)
⋮----
type ImproveRunSetup = ReturnType<typeof resolveImproveRunSetup>;
⋮----
function recordImproveFailure(err: unknown, run: ImproveRunSetup, eventsCtx: EventsContext): void
⋮----
function countUndecidedPendingMemories(stashDir: string): number
⋮----
function probeEntryCount(): number | undefined
⋮----
async function runIndexBootstrapPass(
  run: ImproveRunSetup,
  signal: AbortSignal,
): Promise<
⋮----
async function indexAndCollect(run: ImproveRunSetup): Promise<
⋮----
export function buildLockSkippedResult(
  strategyName: string,
  scope: ImproveScope,
  runId: string | undefined,
): AkmImproveResult
⋮----
async function runDryPlanningStage(
  run: ImproveRunSetup,
  collected: Awaited<ReturnType<typeof indexAndCollect>>,
  initialCleanupWarnings: string[],
): Promise<AkmImproveResult>
⋮----
function preparationArgs(
  run: ImproveRunSetup,
  collected: Awaited<ReturnType<typeof indexAndCollect>>,
  initialCleanupWarnings: string[],
)
⋮----
export function buildDryRunResult(
  run: ImproveRunSetup,
  collected: Awaited<ReturnType<typeof indexAndCollect>>,
  preparation?: ImprovePreparationResult,
): AkmImproveResult
⋮----
function buildResultExecutionPlan(
  run: ImproveRunSetup,
  preparation: ImprovePreparationResult,
  collected: Pick<
    Awaited<ReturnType<typeof indexAndCollect>>,
    "plannedRefs" | "strategyFilteredRefs" | "indexSnapshot"
  >,
  dryRun: boolean,
)
⋮----
async function runTriagePrePass(run: ImproveRunSetup): Promise<DrainResult | undefined>
⋮----
export function resolveSyncPathSet(input: {
  repoDir: string;
  assetPrefix: string;
  changedPaths: readonly string[];
  initialPaths: ReadonlySet<string>;
  writtenPaths: readonly string[];
  provenance: boolean;
}):
⋮----
const inScope = (relativePath: string): boolean
⋮----
type ImproveSyncOutcome = NonNullable<AkmImproveResult["sync"]>;
⋮----
function syncsStash(run: ImproveRunSetup): boolean
⋮----
function runStashSync(
  run: ImproveRunSetup,
  eventsCtx: EventsContext,
  phase: "pre-run" | "end-of-run",
  input: {
    message: string;
    push?: boolean;
scopePaths: (target:
⋮----
const record = (metadata: Record<string, unknown>)
⋮----
function syncBeforeRun(run: ImproveRunSetup, eventsCtx: EventsContext): ImproveSyncOutcome | undefined
⋮----
function makeCommitStashBatch(deps: {
  run: ImproveRunSetup;
getInitialGitPaths: ()
⋮----
async function runImproveStageSequence(
  run: ImproveRunSetup,
  collected: Awaited<ReturnType<typeof indexAndCollect>>,
  preEnsureCleanupWarnings: string[],
  eventsCtx: EventsContext,
)
⋮----
function finalizeImproveResult(args: {
  run: ImproveRunSetup;
  seq: Awaited<ReturnType<typeof runImproveStageSequence>>;
  collected: Awaited<ReturnType<typeof indexAndCollect>>;
  triageDrain?: DrainResult;
  ensureIndexDurationMs?: number;
  eventsCtx: EventsContext;
  usageRecords: readonly LlmUsageRecord[];
}): AkmImproveResult
⋮----
const countMode = (mode: ImproveActionMode)
⋮----
function collectImproveNotices(resolvedPlan: ImproveRunSetup["resolvedPlan"], carriers: readonly unknown[])
⋮----
const collect = (carrier: unknown): void =>
⋮----
function emitImproveCompletedEvent(
  result: AkmImproveResult,
  durations: {
    memoryInferenceDurationMs: number;
    totalDurationMs: number;
    warningCount: number;
    orphansPurged: number;
  },
  eventsCtx?: EventsContext,
): void
⋮----
function shapeMemoryCleanup(plan: MemoryCleanupPlan): ImproveMemoryCleanupResult
`````

## File: src/commands/improve/ledger.ts
`````typescript
import fs from "node:fs";
import type { EventsContext } from "../../core/events";
import { getStateDbPath, withImmediateTransaction, withStateDb } from "../../core/state-db";
import { warn } from "../../core/warn";
import type { Database } from "../../storage/database";
import {
  type ImproveLedgerOutcome,
  type ImproveLedgerRow,
  isContentDrivenRow,
  isLedgerBlocked,
  listImproveLedgerRows,
  PAIR_PASS_LEDGER_SOURCE,
  recordImproveLedger,
} from "../../storage/repositories/improve-ledger-repository";
import { openSqliteReadSnapshot } from "../../storage/sqlite-read-snapshot";
import type { ProposalsContext } from "../proposal/repository";
⋮----
export function stateKey(ref: string, itemRef?: string): string
⋮----
export function stripBundle(ref: string): string
⋮----
export interface LedgerAccess {
  proposalsCtx?: ProposalsContext;
  eventsCtx?: EventsContext;

  readOnly?: boolean;
}
⋮----
function ledgerDbPath(access: LedgerAccess | undefined): string | undefined
⋮----
function withLedgerDb<T>(access: LedgerAccess | undefined, fn: (db: Database) => T): T | undefined
⋮----
export interface LedgerAttemptInput {
  stashDir: string;

  ref: string;
  source: string;
  outcome: ImproveLedgerOutcome;
  detail?: string;
  proposalId?: string;

  contentHash?: string;
}
⋮----
export function recordLedgerAttempt(
  access: LedgerAccess | undefined,
  inputs: LedgerAttemptInput | readonly LedgerAttemptInput[],
): void
⋮----
export type LedgerSnapshot = ReadonlyMap<string, ImproveLedgerRow>;
⋮----
export function ledgerKey(source: string, ref: string): string
⋮----
export function readLedgerDb<T>(access: LedgerAccess | undefined, fn: (db: Database) => T): T | undefined
⋮----
export function loadLedgerSnapshot(
  access: LedgerAccess | undefined,
  stashDir: string,
  sources: readonly string[],
): LedgerSnapshot
⋮----
export function ledgerRowFor(
  snapshot: LedgerSnapshot,
  source: string,
  ref: string,
  itemRef?: string,
): ImproveLedgerRow | undefined
⋮----
export function lastAttemptByRef(
  snapshot: LedgerSnapshot,
  source: string,
  candidates: readonly { ref: string; itemRef?: string }[],
): Map<string, string>
`````

## File: src/commands/improve/locks.ts
`````typescript
import path from "node:path";
import { TransientError } from "../../core/errors";
import { appendEvent, type EventsContext } from "../../core/events";
import { type LockOwnership, releaseLock } from "../../core/file-lock";
import { formatLockHolderPid, tryAcquireRunLock } from "../../core/run-lock";
import { warn } from "../../core/warn";
⋮----
export type ImproveLockAcquisition = { state: "acquired"; ownership: LockOwnership } | { state: "skipped" };
⋮----
export function improveLockPath(lockBaseDir: string): string
⋮----
export function tryAcquireImproveLock(
  lockPath: string,
  skipIfLocked: boolean | undefined,
  eventsCtx?: EventsContext,
): ImproveLockAcquisition
⋮----
const acquire = ()
⋮----
function tryAcquireImproveLockUnlocked(
  lockPath: string,
  skipIfLocked: boolean | undefined,
  onRecovered: (event: Parameters<typeof appendEvent>[0]) => void,
): ImproveLockAcquisition
⋮----
export function releaseImproveLock(ownership: LockOwnership): void
`````

## File: src/commands/improve/loop-stages.ts
`````typescript
import fs from "node:fs";
import { parseRefInput } from "../../core/asset/resolve-ref";
import { daysToMs } from "../../core/common";
import { type AkmConfig, type ImproveProfileConfig, loadConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { appendEvent, type EventsContext } from "../../core/events";
import type { AkmDistillResult, ImproveActionResult, ImproveEligibleRef } from "../../core/improve-types";
import { openLogsDatabase, purgeOldTaskLogs } from "../../core/logs-db";
import { getDbPath, getTaskLogDir } from "../../core/paths";
import { withStateDb } from "../../core/state-db";
import { info } from "../../core/warn";
import { indexWrittenAssets } from "../../indexer/index-written-assets";
import {
  countPendingMemoriesNeedingDecision,
  type MemoryInferenceResult,
  runMemoryInferencePass,
} from "../../indexer/passes/memory-inference";
import { resolveSourceEntries } from "../../indexer/search/search-source";
import type { Database } from "../../storage/database";
import { purgeOldEvents } from "../../storage/repositories/events-repository";
import { purgeOldImproveRuns } from "../../storage/repositories/improve-runs-repository";
import { closeDatabase, openIndexDatabase } from "../../storage/repositories/index-connection";
import {
  getLiveRefSnapshot,
  isRefLiveInSnapshot,
  type LiveRefSnapshot,
} from "../../storage/repositories/index-entries-repository";
import {
  clearAssetOutcomeMissing,
  countAssetOutcomeMissing,
  deleteAssetOutcomeMissingBefore,
  listAssetOutcomeMissingState,
  stampAssetOutcomeMissing,
} from "../../storage/repositories/outcome-repository";
import {
  clearAssetSalienceMissing,
  countAssetSalienceMissing,
  deleteAssetSalienceMissingBefore,
  listAssetSalienceMissingState,
  stampAssetSalienceMissing,
} from "../../storage/repositories/salience-repository";
import { readFreelistInfo, STATE_DB_VACUUMED_EVENT, vacuumIfReclaimable } from "../../storage/state-db-integrity";
import { purgeOldRunLogFiles, purgeOldTaskLogFiles } from "../../tasks/run/task-log";
import { expireStaleProposals, purgeOrphanProposals } from "../proposal/repository";
import { checkDeadUrls, type DeadUrl, type DeadUrlCoverage } from "../url-checker";
import { isDistillCandidateRef } from "./eligibility";
import type {
  AkmImproveOptions,
  ImproveLoopResult,
  ImproveLoopState,
  ImproveMaintenanceResult,
  ImprovePostLoopResult,
  ImproveScope,
} from "./improve-run-types";
import { type ResolvedImprovePlan, shouldSkipRef } from "./improve-strategies";
import { type ImproveLedgerOutcome, recordLedgerAttempt, stateKey, stripBundle } from "./ledger";
import type { applyMemoryCleanup } from "./memory/memory-improve";
import {
  hasOnlyBarePositiveFeedback,
  isDeprecatedOrSuperseded,
  isFlaggedSinceLastEdit,
  pushRecentError,
} from "./preparation";
import type { AkmReflectOptions } from "./reflect";
import { recordNoOp, resetConsecutiveNoOps } from "./salience";
import { attributeStage, errMessage } from "./stage";
⋮----
export interface ImproveLoopEnv {
  scope: ImproveScope;
  options: AkmImproveOptions;
  primaryStashDir?: string;
  reflectFn: ImproveLoopState["reflectFn"];
  distillFn: ImproveLoopState["distillFn"];
  signalBearingSet: Set<string>;
  distillCooledRefs: Set<string>;

  distillOnlyRefSet: Set<string>;

  recentErrors: Record<string, string[]>;
  eventsCtx?: EventsContext;
  improveProfile: ImproveProfileConfig;
  resolvedPlan: ResolvedImprovePlan;
  budgetSignal?: AbortSignal;

  skipDistillDueToRequirePlannedRefs: boolean;
  remainingBudgetMs: () => number;
}
⋮----
export function prepareImproveLoopEnv(args: ImproveLoopState): ImproveLoopEnv
⋮----
export interface LoopRefTally {
  actions: ImproveActionResult[];

  reflectsWithErrorContext: number;
  recentErrorPushes: { originator: string; message: string }[];

  memoryRefsForInference: string[];
}
⋮----
function recordLoopAttempt(
  planned: ImproveEligibleRef,
  env: ImproveLoopEnv,
  source: "reflect" | "distill",
  outcome: ImproveLedgerOutcome,
  detail?: string,
): void
⋮----
function recordPlasticity(env: ImproveLoopEnv, planned: ImproveEligibleRef, outcome: "noop" | "changed" | undefined)
⋮----
function recordSkip(tally: LoopRefTally, ref: string, reason: string, event?:
⋮----
export async function processImproveLoopRef(planned: ImproveEligibleRef, env: ImproveLoopEnv): Promise<LoopRefTally>
⋮----
async function runLoopReflectPass(planned: ImproveEligibleRef, env: ImproveLoopEnv, tally: LoopRefTally)
⋮----
async function runLoopDistillPass(
  planned: ImproveEligibleRef,
  refType: string,
  isDistillOnly: boolean,
  env: ImproveLoopEnv,
  tally: LoopRefTally,
)
⋮----
export async function runImproveLoopStage(args: ImproveLoopState): Promise<ImproveLoopResult>
⋮----
export async function runImprovePostLoopStage(args: {
  scope: ImproveScope;
  options: AkmImproveOptions;
  primaryStashDir?: string;
  actionableRefs: ImproveEligibleRef[];
  appliedCleanup?: Awaited<ReturnType<typeof applyMemoryCleanup>>;
  cleanupWarnings: string[];
  memoryRefsForInference: Set<string>;
  eventsCtx?: EventsContext;
  budgetSignal?: AbortSignal;
  improveProfile?: ImproveProfileConfig;
  resolvedPlan?: ResolvedImprovePlan;
}): Promise<ImprovePostLoopResult>
⋮----
export interface IndexDbCell {
  current?: Database;
}
⋮----
export interface MaintenanceCtx {
  config: AkmConfig;
  sources: ReturnType<typeof resolveSourceEntries>;
  primaryStashDir: string;
  eventsCtx?: EventsContext;
  budgetSignal?: AbortSignal;
  improveProfile?: ImproveProfileConfig;
  resolvedPlan?: ResolvedImprovePlan;
  memoryInferenceFn: typeof runMemoryInferencePass;
}
⋮----
export async function runImproveMaintenancePasses(args: {
  options: AkmImproveOptions;
  primaryStashDir?: string;
  actionableRefs: ImproveEligibleRef[];
  memoryRefsForInference: Set<string>;
  allWarnings: string[];
  budgetSignal?: AbortSignal;
  eventsCtx?: EventsContext;
  improveProfile?: ImproveProfileConfig;
  resolvedPlan?: ResolvedImprovePlan;
}): Promise<ImproveMaintenanceResult>
⋮----
const openIndexDb = ()
⋮----
interface LlmPassOutcome<T> {
  result?: T;
  durationMs: number;
  warnings: string[];
}
⋮----
async function timedLlmPass<T>(label: string, run: () => Promise<T>): Promise<LlmPassOutcome<T>>
⋮----
export async function runMemoryInferenceMaintenancePass(
  ctx: MaintenanceCtx,
  dbCell: IndexDbCell,
  memoryRefsForInference: Set<string>,
): Promise<
⋮----
// Sentinel refs (`<domain>/_<marker>`) label maintenance events; never parsed as assets.
⋮----
function runProposalHygienePass(ctx: MaintenanceCtx):
⋮----
export function runRetentionPurgePass(ctx: MaintenanceCtx):
⋮----
const report = (eventType: string, ref: string, purgedCount: number, what: string) =>
⋮----
function isStateRefLive(snapshot: LiveRefSnapshot, storedRef: string): boolean
⋮----
interface StateGcTable {
  rows: ReadonlyArray<{ asset_ref: string; missing_since: number | null }>;
  stamp: (refs: string[], now: number) => number;
  clear: (refs: string[]) => number;
  deleteOlderThan: (cutoffMs: number) => number;
  countPending: () => number;
}
⋮----
export function runOrphanStateGcPass(
  ctx: MaintenanceCtx,
  dbCell: IndexDbCell,
):
⋮----
const sweep = (table: StateGcTable) =>
`````

## File: src/commands/improve/outcome-loop.ts
`````typescript
import type { Database } from "../../storage/database";
import {
  type AssetOutcomeRow,
  getAllAssetOutcomes,
  getAssetOutcome,
  getOutcomeScoresByRef,
  upsertAssetOutcome,
} from "../../storage/repositories/outcome-repository";
⋮----
export interface OutcomeUpdateInputs {
  ref: string;

  currentRetrievalCount: number;

  lastRetrievedAt: number;

  acceptedChangeCount: number;
  negativeFeedbackCount: number;

  valence?: number;

  utilityScore?: number;
  now?: number;
}
⋮----
export interface OutcomeUpdateResult {
  outcomeScore: number;
  isNewRow: boolean;
}
⋮----
export interface OutcomeProjection extends OutcomeUpdateResult {
  expectedRetrievalRate: number;
}
⋮----
export function projectAssetOutcome(
  existing: AssetOutcomeRow | undefined,
  inputs: OutcomeUpdateInputs,
): OutcomeProjection
⋮----
export function updateAssetOutcome(db: Database, inputs: OutcomeUpdateInputs): OutcomeUpdateResult
⋮----
export function outcomeScoreToSalience(outcomeScore: number, maxScore: number): number
`````

## File: src/commands/improve/planner.ts
`````typescript
import { conceptIdFromTypeName } from "../../core/asset/resolve-ref";
import type { ImproveEligibleRef, ImproveExecutionPlan, ImprovePlanGate } from "../../core/improve-types";
import type { ProcessRoutingRow } from "./improve-strategies";
import { parseMemoryName } from "./memory/derived-ref";
⋮----
export interface EffectiveRefSelection {
  loopRefs: ImproveEligibleRef[];
  distillOnlyRefs: ImproveEligibleRef[];
  limitRemoved: number;
}
⋮----
type MemoryCleanupProjectionInput =
  | {
      mode: "estimate";
      plannedRefs: readonly ImproveEligibleRef[];
      candidateRefs: readonly string[];
      allowApply: boolean;
    }
  | {
      mode: "execution";
      plannedRefs: readonly ImproveEligibleRef[];
      archivedRefs: readonly string[];
      allowApply: boolean;
    };
⋮----
export interface MemoryCleanupProjection {
  postCleanupRefs: ImproveEligibleRef[];
  gate: ImprovePlanGate;
}
⋮----
function canonicalMemoryConceptRef(ref: string): string | undefined
⋮----
export function projectMemoryCleanup(input: MemoryCleanupProjectionInput): MemoryCleanupProjection
⋮----
export function selectEffectiveImproveRefs(args: {
  rankedRefs: readonly ImproveEligibleRef[];
  distillOnlyRefs: readonly ImproveEligibleRef[];
  limit?: number;
}): EffectiveRefSelection
⋮----
export interface ImprovePlanProjectionInput {
  dryRun: boolean;
  snapshot: ImproveExecutionPlan["snapshot"];
  rawInScope: number;
  selectedRefs: readonly ImproveEligibleRef[];
  effectiveRefs: readonly ImproveEligibleRef[];
  distillOnlyRefs: ReadonlySet<string>;
  configuredLimits: { cli?: number; profile?: number; reflect?: number };
  effectiveLimit?: number;
  gates: readonly ImprovePlanGate[];
  processes: readonly ProcessRoutingRow[];
  proactive?: ImproveExecutionPlan["proactive"];
  consolidation: ImproveExecutionPlan["consolidation"];
  stageConfig: {
    extract: { enabled: boolean; reason: string };
    memoryInference: { enabled: boolean; reason: string };
  };
  triage: ImproveExecutionPlan["triage"];
}
⋮----
export function buildImproveExecutionPlan(input: ImprovePlanProjectionInput): ImproveExecutionPlan
`````

## File: src/commands/improve/preparation.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { daysToMs } from "../../core/common";
import type { ImproveProfileConfig } from "../../core/config/config";
import { loadConfig } from "../../core/config/config";
import { ConfigError, rethrowIfTestIsolationError } from "../../core/errors";
import { appendEvent, type EventsContext, readEvents } from "../../core/events";
import type {
  ConsolidateResult,
  ImproveActionResult,
  ImproveEligibleRef,
  ImproveExecutionPlan,
  ImprovePlanGate,
} from "../../core/improve-types";
import { withStateDb } from "../../core/state-db";
import { info, warn } from "../../core/warn";
import { countUsageEventsByType, USAGE_EVENT_RETENTION_DAYS } from "../../indexer/usage/usage-events";
import { getAvailableHarnesses } from "../../integrations/session-logs";
import type { SessionLogHarness } from "../../integrations/session-logs/types";
import type { Database } from "../../storage/database";
import { getZeroResultSearches } from "../../storage/repositories/index-entries-repository";
import { getRetrievalCounts } from "../../storage/repositories/index-utility-repository";
import { listStateProposals } from "../../storage/repositories/proposals-repository";
import { akmLint } from "../lint/index";
import type { EligibilitySource } from "../proposal/proposal-types";
import { runSchemaRepairPass } from "../sources/schema-repair";
import { isAutonomyLaneAllowed } from "./autonomy-gate";
import {
  akmConsolidate,
  type ConsolidationPoolSnapshot,
  inspectConsolidationPool,
  loadExistingKnowledgeBodyHashes,
  makeConsolidateResult,
} from "./consolidate";
import { computeSafeChunkSize, DEFAULT_CONTEXT_LENGTH_TOKENS } from "./consolidate/chunking";
import { contentHash } from "./content-hash";
import {
  assetTypeOf,
  buildUtilityMap,
  dedupeRefs,
  findAssetFilePath,
  isDistillCandidateRef,
  isLessonCandidate,
  withIndexDb,
} from "./eligibility";
import { akmExtract, countNewExtractCandidates, type ResolvedExtractPlan } from "./extract";
import { computeValenceScore } from "./feedback-valence";
import type {
  AkmImproveOptions,
  ConsolidationPassResult,
  ImprovePreparationResult,
  ImproveScope,
} from "./improve-run-types";
import type { ResolvedImprovePlan } from "./improve-strategies";
import {
  isLedgerBlocked,
  type LedgerSnapshot,
  lastAttemptByRef,
  ledgerRowFor,
  loadLedgerSnapshot,
  stateKey,
} from "./ledger";
import { applyMemoryCleanup, type MemoryCleanupPlan } from "./memory/memory-improve";
import {
  getAllAssetOutcomes,
  getAssetOutcome,
  getOutcomeScoresByRef,
  OUTCOME_SCORE_MAX,
  outcomeScoreToSalience,
  projectAssetOutcome,
  updateAssetOutcome,
} from "./outcome-loop";
import { projectMemoryCleanup, selectEffectiveImproveRefs } from "./planner";
import { DEFAULT_DUE_DAYS, DEFAULT_MAX_PER_RUN, selectProactiveMaintenanceRefs } from "./proactive-maintenance";
import { isInRetrievalScope, loadRetrievalScope } from "./retrieval-scope";
import {
  computeSalience,
  getAssetSalience,
  getLastUseMsByRef,
  isContentEncodingRow,
  SALIENCE_NO_OP_DAMPEN_FACTOR,
  SALIENCE_NO_OP_DAMPEN_THRESHOLD,
  upsertAssetSalience,
} from "./salience";
import { attributeStage, errMessage } from "./stage";
⋮----
type Salience = ReturnType<typeof computeSalience>;
type FeedbackSignal = { hasSignal: boolean; positive: number; negative: number };
⋮----
const keyOf = (r: ImproveEligibleRef): string
⋮----
function withRunState<T>(
  eventsCtx: EventsContext | undefined,
  persist: boolean,
  fn: (db: Database) => T,
): T | undefined
⋮----
function fileSize(filePath: string | undefined): number | undefined
⋮----
export function pickDefined<T extends object, K extends keyof T>(
  source: T | undefined,
  keys: readonly K[],
): Partial<Pick<T, K>>
⋮----
export function recordImproveSkip(
  eventsCtx: EventsContext | undefined,
  ref: string | undefined,
  metadata: Record<string, unknown>,
): void
⋮----
export function pushRecentError(recentErrors: Record<string, string[]>, originator: string, msg: string): void
⋮----
function planConsolidationPass(args: {
  options: AkmImproveOptions;
  primaryStashDir?: string;
  improveProfile?: ImproveProfileConfig;
  resolvedPlan: ResolvedImprovePlan;
  eventsCtx?: EventsContext;
  existingKnowledgeBodyHashes?: Set<string>;
}):
⋮----
async function runConsolidationPass(args: ImprovePreparationStageArgs): Promise<ConsolidationPassResult>
⋮----
interface ExtractPassPlan {
  availableHarnesses: SessionLogHarness[];
  minNewSessions: number;
  newCandidateCount?: number;
  belowMinNewSessions: boolean;
  wouldRun: boolean;
  reason: string;
}
⋮----
async function inspectExtractPass(args: ImprovePreparationStageArgs, readOnly: boolean): Promise<ExtractPassPlan>
⋮----
async function runSessionExtractPass(
  args: ImprovePreparationStageArgs,
  plan: ExtractPassPlan,
): Promise<
⋮----
export async function runValidationAndRepairPass(args: {
  postCleanupRefs: ImproveEligibleRef[];
  options: AkmImproveOptions;
  startMs: number;
  budgetMs: number;
  primaryStashDir?: string;
  resolvedPlan: ResolvedImprovePlan;
  repairValidationFailures: boolean;
  schemaRepairFn?: typeof runSchemaRepairPass;
}): Promise<
⋮----
const validate = async (candidate: ImproveEligibleRef): Promise<string | undefined> =>
⋮----
export interface ImprovePreparationStageArgs {
  scope: ImproveScope;
  options: AkmImproveOptions;
  plannedRefs: ImproveEligibleRef[];
  memoryCleanupPlan?: MemoryCleanupPlan;
  primaryStashDir?: string;
  memorySummary: { eligible: number; derived: number };
  reindexFn: (options: { stashDir: string; signal?: AbortSignal }) => Promise<unknown>;
  startMs: number;
  budgetMs: number;
  eventsCtx?: EventsContext;

  initialCleanupWarnings?: string[];
  improveProfile: ImproveProfileConfig;
  resolvedPlan: ResolvedImprovePlan;

  strategyName: string;
  budgetSignal?: AbortSignal;

  planOnly?: boolean;
}
⋮----
export async function runImprovePreparationStage(args: ImprovePreparationStageArgs): Promise<ImprovePreparationResult>
⋮----
function assessMemoryIndex(
  primaryStashDir: string | undefined,
  warnings: string[],
):
⋮----
function isSignalEvent(metadata: unknown): boolean
⋮----
export function isFlaggedSinceLastEdit(candidate: ImproveEligibleRef, eventsCtx?: EventsContext): boolean
⋮----
export function isDeprecatedOrSuperseded(candidate: ImproveEligibleRef): boolean
⋮----
export function hasOnlyBarePositiveFeedback(candidate: ImproveEligibleRef, eventsCtx?: EventsContext): boolean
⋮----
const hasText = (value: unknown): boolean
⋮----
interface SignalDeltaSnapshot {
  feedbackSinceCutoff: string;
  nowIso: string;

  latestFeedbackTs: Map<string, string>;





  latestNegativeTs: Map<string, string>;
  ledger: LedgerSnapshot;

  lastReflectAttemptAt: Map<string, string>;
  lastDistillAttemptAt: Map<string, string>;

  feedback: Map<string, FeedbackSignal>;
}
⋮----
export function buildSnapshotManifest(args: {
  postCleanupRefs: ImproveEligibleRef[];
  validationFailureRefs: Set<string>;
  eventsCtx?: EventsContext;
  stashDir?: string;
  readOnly?: boolean;
}): SignalDeltaSnapshot
⋮----
export function partitionBySignalDelta(args: {
  scope: ImproveScope;
  options: AkmImproveOptions;
  postCleanupRefs: ImproveEligibleRef[];
  validationFailureRefs: Set<string>;
  snapshot: Pick<SignalDeltaSnapshot, "latestFeedbackTs" | "latestNegativeTs" | "ledger" | "nowIso">;
}):
⋮----
const deltaPasses = (candidate: ImproveEligibleRef, source: "reflect" | "distill"): boolean =>
⋮----
async function selectLoopCandidates(
  args: ImprovePreparationStageArgs,
  postCleanupRefs: ImproveEligibleRef[],
  validationFailureRefs: Set<string>,
  actions: ImproveActionResult[],
  persist: boolean,
)
⋮----
const effectiveScore = (ref: string): number =>
⋮----
// Skip observability: every candidate that did not survive into the loop pool is reported skipped.
⋮----
function fetchRetrievalSignals(
  options: AkmImproveOptions,
  signalFiltered: ImproveEligibleRef[],
  noFeedbackCandidates: ImproveEligibleRef[],
  eventsCtx: EventsContext | undefined,
  persist: boolean,
):
⋮----
function selectProactiveMaintenanceLane(
  args: ImprovePreparationStageArgs,
  candidates: ImproveEligibleRef[],
  snapshot: SignalDeltaSnapshot,
  retrieval: { retrievalCounts: Map<string, number>; lastUseMs: Map<string, number> },
  persist: boolean,
):
⋮----
function scoreSalience(
  args: ImprovePreparationStageArgs,
  mergedRefs: ImproveEligibleRef[],
  feedback: Map<string, FeedbackSignal>,
  retrievalCounts: Map<string, number>,
  persist: boolean,
): Map<string, Salience>
⋮----
function updateOutcomeScores(args: {
  mergedRefs: ImproveEligibleRef[];
  feedback: Map<string, FeedbackSignal>;
  retrievalCounts: Map<string, number>;
  lastUseMsByRef: Map<string, number>;
  utilityMap: Map<string, number>;
  primaryStashDir?: string;
  eventsCtx?: EventsContext;
  persist: boolean;
}): Map<string, number>
⋮----
const inputsFor = (r: ImproveEligibleRef, accepted: number) =>
⋮----
async function dropRefsMissingOnDisk(
  sorted: ImproveEligibleRef[],
  options: AkmImproveOptions,
  eventsCtx: EventsContext | undefined,
  persist: boolean,
): Promise<
`````

## File: src/commands/improve/proactive-maintenance.ts
`````typescript
import type { ImproveEligibleRef } from "../../core/improve-types";
import { assetTypeOf } from "./eligibility";
import { computeSalience } from "./salience";
⋮----
export interface ProactiveSelectorParams {

  candidates: ImproveEligibleRef[];

  lastReflectTs: Map<string, string>;

  lastDistillTs: Map<string, string>;
  retrievalCounts: Map<string, number>;

  lastUseMs?: Map<string, number>;
  sizeBytesOf?: (ref: ImproveEligibleRef) => number | undefined;
  dueDays?: number;
  maxPerRun?: number;
  now?: number;
}
⋮----
export interface ProactiveScoredRef {
  ref: ImproveEligibleRef;
  type: string;

  staleDays: number;
  neverReflected: boolean;
  retrievalFreq: number;
  sizeBytes: number;
  priority: number;
  due: boolean;
}
⋮----
export interface ProactiveSelectionResult {

  selected: ImproveEligibleRef[];
  dueTotal: number;
  neverReflected: number;
  scored: ProactiveScoredRef[];
}
⋮----
function staleness(
  ref: string,
  lastReflectTs: Map<string, string>,
  lastDistillTs: Map<string, string>,
  dueDays: number,
  now: number,
):
⋮----
export function selectProactiveMaintenanceRefs(params: ProactiveSelectorParams): ProactiveSelectionResult
`````

## File: src/commands/improve/reflect-noise.ts
`````typescript
import { parse as yamlParse } from "yaml";
import { parseFrontmatter } from "../../core/asset/frontmatter";
⋮----
export type ReflectChangeKind = "noop" | "cosmetic" | "substantive";
⋮----
export function classifyReflectChange(sourceContent: string, candidateContent: string): ReflectChangeKind
⋮----
export type ReflectDefect = "placeholder_added" | "meta_commentary_added" | "frontmatter_copied_into_body";
⋮----
export interface ReflectDefectFilter {

  placeholders?: readonly string[];

  metaCommentary?: readonly string[];

  frontmatterKeys?: readonly string[];
}
⋮----
export function findReflectDefect(
  sourceContent: string,
  candidateContent: string,
  filter: ReflectDefectFilter = {},
): ReflectDefect | undefined
⋮----
function escapeRegExp(text: string): string
⋮----
function gainsPhrases(phrases: readonly string[], source: string, candidate: string): boolean
⋮----
function frontmatterCopiedIntoBody(source: string, candidate: string, keys: readonly string[]): boolean
⋮----
const keyLines = (text: string)
⋮----
function provenanceValues(content: string): string[]
⋮----
function lettersAndDigits(text: string): string
⋮----
export function splitFrontmatter(raw: string):
⋮----
/** A level-1 heading line (`# text`) anywhere in a body: what reflect's title adds only when none is there. */
export function bodyHasH1(body: string): boolean
⋮----
/** Frontmatter text, fenced code blocks, and prose lines (an unclosed fence counts as prose). */
function parseSections(text: string):
⋮----
/** CRLF → LF, no trailing spaces per line, no trailing newlines. */
export function normalizeTrailingWhitespace(text: string): string
⋮----
/** Canonical frontmatter (parsed YAML, keys sorted) plus the normalized body; equal forms differ only cosmetically. */
export function cosmeticNormalForm(text: string): string
⋮----
fmCanonical = fmText; // unparsable: any real edit still registers
⋮----
function stableStringify(value: unknown): string
⋮----
/** Headings, setext underlines, thematic breaks and table rows never absorb the next line. */
⋮----
/** List items and blockquotes allow lazy continuation. */
⋮----
type LogicalKind = "blank" | "verbatim" | "terminal" | "continuable" | "prose";
⋮----
/**
 * A markdown body for cosmetic comparison: fence language hints dropped (code
 * kept verbatim), indented code verbatim, hard-wrapped prose joined into the
 * preceding prose/list/quote line, inner whitespace runs collapsed, blank runs
 * collapsed and trimmed.
 */
export function normalizeMarkdownBody(body: string): string
⋮----
const push = (line: string, kind: LogicalKind) =>
⋮----
function collapseInnerWhitespace(line: string): string
`````

## File: src/commands/improve/reflect.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { assetPathForName, stashDirFor } from "../../core/asset/asset-placement";
import { serializeFrontmatter } from "../../core/asset/asset-serialize";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { type AssetRef, parseRefInput } from "../../core/asset/resolve-ref";
import { DESCRIPTION_MAX_CHARS, requiresDescription } from "../../core/authoring-rules";
import { isWithin, resolveStashDir, safeRealpath } from "../../core/common";
import type { AkmConfig, ImproveProfileConfig } from "../../core/config/config";
import { loadConfig } from "../../core/config/config";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { generatedContentRejection } from "../../core/content-safety";
import { ConfigError, UsageError } from "../../core/errors";
import { appendEvent, type EventsContext, readEvents } from "../../core/events";
import type { AkmReflectFailure, AkmReflectResult } from "../../core/improve-types";
import { lintLessonContent } from "../../core/lesson-lint";
import { parseEmbeddedJsonResponse } from "../../core/parse";
import { resolveStandardsContext } from "../../core/standards/resolve-standards-context";
import type { Parsed } from "../../core/structured";
import { warnOnce } from "../../core/warn";
import { type Notice, noticeSet } from "../../execution/notices";
import type { ConfiguredExecutionSettings } from "../../execution/source";
import { lookup } from "../../indexer/indexer";
import type { AgentFailureReason } from "../../integrations/agent";
import {
  buildReflectOutputRepairPrompt,
  buildReflectPrompt,
  REFLECT_CONTENT_CAP,
  type ReflectOutputMode,
  type ReflectPromptInput,
} from "../../integrations/agent/prompts";
import type { RunnerSpec } from "../../integrations/agent/runner";
import { getHarness } from "../../integrations/harnesses";
import { type ChatMessage, type chatCompletion, isJsonSchemaKnownUnsupported } from "../../llm/client";
import { isRefused, structuredLoop } from "../../llm/structured";
import type { StructuredOutcome } from "../../llm/structured-call";
import { enoentHintMessage, isEnoentFailure } from "../agent/agent-support";
import type { EligibilitySource } from "../proposal/proposal-types";
import type { CreateProposalInput, ProposalsContext } from "../proposal/repository";
import { isValidDescription } from "../proposal/validators/proposal-quality-validators";
import { CHARS_PER_TOKEN, DEFAULT_CONTEXT_LENGTH_TOKENS } from "./consolidate/chunking";
import { contentHash } from "./content-hash";
import { findAssetFilePath } from "./eligibility";
import { resolveImproveExecution } from "./execution";
import { recordLedgerAttempt } from "./ledger";
import {
  bodyHasH1,
  classifyReflectChange,
  findReflectDefect,
  type ReflectDefectFilter,
  splitFrontmatter,
} from "./reflect-noise";
import {
  callStageOnce,
  errMessage,
  mintProposal,
  type QualityJudgeResult,
  rejectedProposalContext,
  resolveQualityGateJudge,
  runReflectQualityJudge,
} from "./stage";
⋮----
export interface AkmReflectOptions {

  improveProfile?: ImproveProfileConfig;

  ref?: string;

  task?: string;

  llmRunner?: RunnerSpec | null;

  run?: ConfiguredExecutionSettings;
  timeoutMs?: number;

  signal?: AbortSignal;
  stashDir?: string;

  target?: NonNullable<CreateProposalInput["target"]>;

  ctx?: ProposalsContext;

  eventsCtx?: EventsContext;

  avoidPatterns?: string[];

  chat?: typeof chatCompletion;
  config?: AkmConfig;

  eventSource?: "user" | "improve";

  defectFilter?: ReflectDefectFilter;

  assetContent?: string;

  eligibilitySource?: EligibilitySource;

  itemRef?: string;
}
⋮----
function readOnlyEventsContext(ctx?: EventsContext): EventsContext
⋮----
function readRecentFeedback(ref?: string, eventsCtx?: EventsContext, assetContent?: string): string[]
⋮----
function buildSchemaHints(type: string, content: string | undefined): string[]
⋮----
function lenientRefType(ref: string | undefined): string
⋮----
/**
 * A description derived from existing metadata (title, first heading, first
 * prose sentence) that passes `isValidDescription`, or `undefined`. Never
 * free-form invention.
 */
function deriveDescriptionFromAsset(title: unknown, body: string, targetRef: string): string | undefined
⋮----
// A bare title/heading reads poorly as a description: prefer the sentence form.
⋮----
function firstProseSentence(body: string): string
⋮----
/** What a reflect reply changes; a field it leaves out stays as the source has it. */
interface ReflectPatch {
  description?: string;
  when_to_use?: string;
  /** The text of a level-1 heading, added only to a body that has none. */
  title?: string;
}
⋮----
/** The text of a level-1 heading, added only to a body that has none. */
⋮----
/** The body with `# title` and one blank line inserted at its first non-blank line; the rest is untouched. */
function withH1(body: string, title: string): string
⋮----
/**
 * The asset with the patch applied, or `undefined` when the patch changes
 * nothing (or there is no asset to patch). The body is the source's own, byte
 * for byte; the one thing akm adds to it is a `# title` heading it lacks, with
 * one blank line after it (#1183). A
 * required description that neither the source nor the patch has is derived
 * from the asset's own text (#636). Only the changed keys' frontmatter lines are
 * rewritten: every other line is kept as it is, so a source whose YAML the
 * parser reads only in part (a broken description beside a list) loses nothing.
 */
export function applyReflectPatch(
  patch: ReflectPatch,
  sourceContent: string,
  targetRef: string,
):
⋮----
// A fence that is opened and never closed (`---` fused onto the last value)
// would leave the old block in the body under a new one: a person fixes it.
⋮----
// The heading and one blank line go in at the body's first non-blank line, in
// the body's own line ending; every other byte of the body stays where it was.
⋮----
// Only a source that already has frontmatter but no description gets one:
// injecting a whole block, or overwriting an authored one, is out of scope.
⋮----
function patchFrontmatterLines(fmText: string, changes: Record<string, unknown>): string
⋮----
function wantsJsonSchemaOutput(connection:
⋮----
export interface RunReflectIterationOptions {
  prompt: string | undefined;
  runner: RunnerSpec;
  timeoutMs?: number | null;
  signal?: AbortSignal;





  responseSchema?: Record<string, unknown>;
  chat?: typeof chatCompletion;
  maxTokens?: number;
  outputMode: ReflectOutputMode;

  targetRef?: string;
  onNotices?: (notices: readonly Notice[]) => void;

  environment?: Record<string, string>;
}
⋮----
export interface ReflectTelemetry {
  outputMode: ReflectOutputMode;
  repairAttempts: number;
}
⋮----
interface ReflectFailureFields {
  reason: AgentFailureReason;
  error: string;
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
}
⋮----
export type ReflectIteration =
  | { ok: true; payload: ReflectPayload; durationMs: number; telemetry: ReflectTelemetry }
  | ({ ok: false; durationMs: number; telemetry: ReflectTelemetry } & ReflectFailureFields);
⋮----
function parseReflectConfidence(value: unknown): number
⋮----
export interface ReflectPayload {
  ref: string;
  confidence: number;
  patch: ReflectPatch;
}
⋮----
function parseReflectFrontmatterPatch(value: unknown): ReflectPatch
⋮----
function parseSchemaReflectOutput(raw: string, targetRef: string | undefined): ReflectPayload
⋮----
function parseFramedReflectOutput(raw: string, targetRef: string | undefined): ReflectPayload
⋮----
const header = (prefix: string)
⋮----
/** A failure only a message describes, as a process that printed it and exited would have: what a connection reports. */
function messageFailure(error: string, reason: AgentFailureReason, stdout = "", exitCode = 1): ReflectFailureFields
⋮----
/** How a failed dispatch is reported: an agent as it ran (exit code, streams, reason), a connection by its message. */
function dispatchFailure(
  outcome: Extract<StructuredOutcome, { ok: false }>,
  runner: RunnerSpec,
  signal: AbortSignal | undefined,
): ReflectFailureFields
⋮----
/**
 * One reflect call on a connection or a harness (errors captured, never thrown except
 * configuration). A connection and a harness are sent the same request, with the reply's
 * schema as the output schema, and its reply is held to the same contract: an
 * unparseable reply gets one repair turn within the original deadline, then
 * fails. A failed agent dispatch is reported as it ran, with its exit code and
 * stderr; an LLM call has only its message.
 */
export async function runReflectIteration(opts: RunReflectIterationOptions): Promise<ReflectIteration>
⋮----
const parse = (raw: string): Parsed<ReflectPayload> =>
const failed = (failure: ReflectFailureFields): ReflectIteration => (
⋮----
const call = (callMessages: ChatMessage[], repairTimeoutMs?: number): Promise<StructuredOutcome>
⋮----
interface ReflectRun {
  options: AkmReflectOptions;
  stash: string;
  config: AkmConfig;
  runnerSpec: RunnerSpec;
  engineName: string;
  notices: ReturnType<typeof noticeSet>;
  emitInvoked: () => void;
  emitFailed: (reason: AgentFailureReason, subreason: string, ref?: string, extra?: Record<string, unknown>) => void;
}
⋮----
function reflectEmitters(options: AkmReflectOptions): Pick<ReflectRun, "emitInvoked" | "emitFailed">
⋮----
const emitInvoked = (): void =>
const emitFailed: ReflectRun["emitFailed"] = (reason, subreason, ref, extra) =>
⋮----
function reflectFailure(run: ReflectRun, failure: ReflectFailureFields): AkmReflectFailure
⋮----
function refusal(reason: AgentFailureReason, error: string): ReflectFailureFields
⋮----
function exitCodeMeta(failure: Pick<ReflectFailureFields, "exitCode">): Record<string, unknown>
⋮----
function unsupportedTypeFailure(
  ref: string,
  type: string,
  detail: string,
  emitFailed: ReflectRun["emitFailed"],
):
⋮----
function fileOutsideLayoutFailure(
  ref: string,
  file: string,
  writes: string,
  emitFailed: ReflectRun["emitFailed"],
):
⋮----
async function resolveReflectSource(
  options: AkmReflectOptions,
  stash: string,
  emitFailed: ReflectRun["emitFailed"],
): Promise<
⋮----
function resolveReflectRunner(options: AkmReflectOptions):
⋮----
function promptInArgv(runner: Extract<RunnerSpec,
⋮----
function computeReflectContentBudgetChars(
  promptInput: ReflectPromptInput,
  runnerSpec: RunnerSpec,
): number | null | undefined
⋮----
interface ReflectPromptSources {
  feedback: string[];
  schemaHints: string[];
  rejectedProposals: ReturnType<typeof rejectedProposalContext>;
  standardsContext: string;
}
⋮----
function gatherReflectPromptSources(
  options: AkmReflectOptions,
  stash: string,
  parsedRef: AssetRef | undefined,
  assetContent: string | undefined,
): ReflectPromptSources
⋮----
/** The exact prompt reflect sends, shared by dispatch and `--show-prompt`. */
function buildReflectPromptText(args: {
  options: AkmReflectOptions;
  parsedRef: AssetRef | undefined;
  assetContent: string | undefined;
  sources: ReflectPromptSources;
  runnerSpec: RunnerSpec;
}):
⋮----
// A connection that rejects JSON Schema gets the framed contract; a harness gets the JSON object.
⋮----
async function dispatchReflect(args: {
  run: ReflectRun;
  parsedRef: AssetRef | undefined;
  assetContent: string | undefined;
  sources: ReflectPromptSources;
  agentEnv: Record<string, string>;
}): Promise<ReflectIteration>
⋮----
async function finalizeReflectProposal(args: {
  run: ReflectRun;
  payload: ReflectPayload;
  assetContent: string;

  dispatch: Pick<Extract<ReflectIteration, { ok: true }>, "durationMs" | "telemetry">;
  judge: { enabled: boolean; skippedNoJudge: boolean; runner: RunnerSpec | undefined };
  feedback: string[];
}): Promise<AkmReflectResult>
⋮----
const refuse = (detail: string, metadata: Record<string, unknown>, message: string): AkmReflectResult =>
⋮----
export async function renderReflectPromptPreview(
  options: AkmReflectOptions,
): Promise<
⋮----
export async function akmReflect(options: AkmReflectOptions =
`````

## File: src/commands/improve/retrieval-queries.ts
`````typescript
import { nonTaskInput } from "../../core/non-task-input";
import { listRetrievalQueries } from "../../indexer/usage/usage-events";
import { type LedgerAccess, readLedgerDb, stripBundle } from "./ledger";
⋮----
export function usableRetrievalQueries(raw: readonly string[]): string[]
⋮----
export function loadRetrievalQueries(access: LedgerAccess | undefined, ref: string): string[]
`````

## File: src/commands/improve/retrieval-scope.ts
`````typescript
import fs from "node:fs";
import { daysToMs } from "../../core/common";
import { warn } from "../../core/warn";
import { listUsedEntryRefs, USAGE_EVENT_RETENTION_DAYS } from "../../indexer/usage/usage-events";
import { listImproveLedgerRows } from "../../storage/repositories/improve-ledger-repository";
import { listProposalRefSources } from "../../storage/repositories/proposals-repository";
import { type LedgerAccess, PAIR_PASS_LEDGER_SOURCE, readLedgerDb, stripBundle } from "./ledger";
⋮----
export interface RetrievalScope {

  used: ReadonlySet<string>;

  processed: ReadonlySet<string>;

  sinceMs: number;
}
⋮----
export function loadRetrievalScope(
  access: LedgerAccess | undefined,
  stashDir: string | undefined,
): RetrievalScope | undefined
⋮----
export function isInRetrievalScope(scope: RetrievalScope | undefined, ref: string, filePath?: string): boolean
`````

## File: src/commands/improve/salience.ts
`````typescript
import type { ImproveEligibleRef } from "../../core/improve-types";
import type { Database as IndexDatabase } from "../../storage/database";
import { getAllEntries } from "../../storage/repositories/index-entries-repository";
import { getUtilityScoresByIds } from "../../storage/repositories/index-utility-repository";
import type { AssetSalienceRow } from "../../storage/repositories/salience-repository";
import { WARM_START_CAP } from "./outcome-loop";
⋮----
export interface SalienceInputs {
  ref: string;

  type: string;

  encodingSalience?: number;

  retrievalFreq: number;

  lastUseMs?: number;

  utilityScore?: number;

  outcomeSalience?: number;
  maxOutcomeScore?: number;
  sizeBytes?: number;
  now?: number;
}
⋮----
export type EncodingSource = "content" | "type-stub";
⋮----
export interface SalienceVector {
  encoding: number;
  outcome: number;
  retrieval: number;
  rankScore: number;

  encodingSource?: EncodingSource;
}
⋮----
const clamp01 = (value: number)
⋮----
export function computeSalience(inputs: SalienceInputs): SalienceVector
⋮----
export function isContentEncodingRow(row: AssetSalienceRow): boolean
⋮----
export function getLastUseMsByRef(
  indexDb: IndexDatabase,
  candidates: readonly Pick<ImproveEligibleRef, "ref" | "itemRef">[],
): Map<string, number>
`````

## File: src/commands/improve/session-asset.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { stashDirFor } from "../../core/asset/asset-placement";
import { assembleAsset } from "../../core/asset/asset-serialize";
import { conceptIdFromTypeName } from "../../core/asset/resolve-ref";
import { parseEmbeddedJsonResponse } from "../../core/parse";
import { recordWrittenPath } from "../../core/write-provenance";
import { preFilterSession } from "../../integrations/session-logs/pre-filter";
import type { SessionData, SessionEvent } from "../../integrations/session-logs/types";
import { fenceTranscript } from "./extract-prompt";
⋮----
export interface SessionAssetFrontmatter {
  name: string;
  type: "session";
  harness: string;
  session_id: string;
  started?: string;
  ended?: string;
  project?: string;
  log_path: string;
  access: string;
  tags: string[];
}
⋮----
export interface SessionSummaryResult {

  summary: string;
  keyTopics: string[];
  tags?: string[];
}
⋮----
export type SessionSummaryGenerator = (data: SessionData) => Promise<SessionSummaryResult | undefined>;
⋮----
function renderTranscriptForSummary(events: SessionEvent[], maxChars = 12_000): string
⋮----
export function buildSessionSummaryPrompt(data: SessionData): string
⋮----
/** The summary JSON, tolerating prose around it; `undefined` when nothing usable parses. */
export function parseSessionSummary(raw: string): SessionSummaryResult | undefined
⋮----
/** Long enough to index (`<= 0` disables; a missing timestamp is no evidence of a trivial session). */
export function sessionMeetsDurationGate(data: SessionData, minDurationMinutes: number): boolean
⋮----
/** How an agent reads and parses the raw log at `log_path`, per harness (`cat` otherwise). */
export function buildSessionAccessInstructions(harness: string, logPath: string, sessionId: string): string
⋮----
function isoOrUndefined(ms: number | undefined): string | undefined
⋮----
/** Default session-name slug: `<harness>-session-<yyyy-mm-dd>-<shortId>`. */
export function buildSessionAssetName(harness: string, sessionId: string, startedAtMs?: number): string
⋮----
/** The session asset: frontmatter plus `## Summary` and `## Key topics`. */
export function buildSessionAssetContent(
  data: SessionData,
  summary: SessionSummaryResult,
):
⋮----
export function resolveSessionAssetPath(stashDir: string, harness: string, sessionId: string): string
⋮----
export interface WriteSessionAssetResult {
  written: boolean;
  filePath?: string;

  ref?: string;

  logPath?: string;
}
⋮----
export async function writeSessionAsset(
  data: SessionData,
  stashDir: string,
  generate: SessionSummaryGenerator,
): Promise<WriteSessionAssetResult>
`````

## File: src/commands/improve/stage.ts
`````typescript
import type { AkmConfig, ImproveProfileConfig } from "../../core/config/config";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { ConfigError } from "../../core/errors";
import type { EventsContext } from "../../core/events";
import { effectiveRequestFields, thinkingSetting } from "../../core/llm-inference";
import { parseEmbeddedJsonResponse } from "../../core/parse";
import type { Parsed } from "../../core/structured";
import { warn } from "../../core/warn";
import type { NoticeSink } from "../../execution/notices";
import type { ConfiguredExecutionSettings, UnresolvedExecutionDefaults } from "../../execution/source";
import type { RejectedProposalContext } from "../../integrations/agent/prompts";
import type { RunnerSpec } from "../../integrations/agent/runner";
import type { ChatCompletionConfig, ChatCompletionOptions, ChatMessage } from "../../llm/client";
import { isRefused, type StructuredLoopOptions, type StructuredLoopResult, structuredLoop } from "../../llm/structured";
import { type CallStructuredRequest, callStructured, type StructuredOutcome } from "../../llm/structured-call";
import { currentLlmStage, withLlmStage } from "../../llm/usage-telemetry";
import { isProceduralRejection } from "../proposal/proposal-types";
import {
  type CreateProposalInput,
  createProposal,
  listProposalsReadOnly,
  type Proposal,
  type ProposalGateDecision,
  type ProposalsContext,
  proposalContentHash,
  recordGateDecision,
} from "../proposal/repository";
import { resolveImproveExecution } from "./execution";
import type { ImproveProcessName, ResolvedImprovePlan } from "./improve-strategies";
⋮----
export function errMessage(e: unknown): string
⋮----
export function stageRunner(
  frozen: { llmRunner?: RunnerSpec | null },
  config: AkmConfig,
  processName: ImproveProcessName,
  onNotices?: NoticeSink,
): RunnerSpec | undefined
⋮----
export interface StageLlmCall {
  runner: RunnerSpec;
  prompt: string;
  system?: string;

  history?: ChatMessage[];
  request?: CallStructuredRequest;

  parse?: (raw: string) => unknown;

  current?: UnresolvedExecutionDefaults;
  onNotices?: NoticeSink;
}
⋮----
export function callStageLoop<T>(
  call: StageLlmCall,
  parse: (raw: string) => Parsed<T>,
  correct?: StructuredLoopOptions<T>["correct"],
): Promise<StructuredLoopResult<T>>
⋮----
export async function callStage(call: StageLlmCall): Promise<StructuredOutcome>
⋮----
export async function callStageOnce(call: StageLlmCall): Promise<StructuredOutcome>
⋮----
const dispatch = ()
⋮----
export function attributeStage<T>(
  plan: ResolvedImprovePlan | undefined,
  process: keyof typeof STAGE_LABELS,
  fn: () => T,
): T
⋮----
export function rejectedProposalContext(
  stash: string,
  ref: string | undefined,
  ctx?: ProposalsContext,
  eventsCtx?: EventsContext,
): RejectedProposalContext[]
⋮----
export function mintProposal(
  stash: string,
  proposalsCtx: ProposalsContext | undefined,
  input: CreateProposalInput,
  verdict: {
    judged?: Pick<QualityJudgeResult, "criteria" | "reason">;
    review?: Omit<ProposalGateDecision, "outcome" | "decidedAt">;
  } = {},
): Proposal
⋮----
export function stageJudgedProposal(
  stash: string,
  proposal: Proposal,
  judged?: Pick<QualityJudgeResult, "criteria" | "reason">,
  proposalsCtx?: ProposalsContext,
): Proposal
⋮----
export interface QualityJudgeResult {
  pass: boolean;
  score: number;
  reason: string;
  reviewNeeded?: boolean;

  criteria?: Record<string, number>;
}
⋮----
type QualityJudgeChat = (
  connection: ChatCompletionConfig,
  messages: ChatMessage[],
  options?: ChatCompletionOptions,
) => Promise<string>;
⋮----
function gateNamesAJudge(gate: object): boolean
⋮----
export function resolveQualityGateJudge(
  config: AkmConfig,
  profile: ImproveProfileConfig | undefined,
  processName: "reflect" | "distill",
  onNotices?: NoticeSink,
  run?: ConfiguredExecutionSettings,
): RunnerSpec | undefined
⋮----
export interface QualityJudgeOptions {
  related?: Array<{ ref: string; content: string }>;

  feedback?: string[];

  extending?: string;

  ref?: string;

  llmRunner?: RunnerSpec;

  runnerSelectionFrozen?: true;
  timeoutMs?: number | null;
  signal?: AbortSignal;
  onNotices?: NoticeSink;
}
⋮----
export function buildJudgePrompt(
  lessonContent: string,
  sourceContent: string,
  related?: Array<{ ref: string; content: string }>,
  feedback?: string[],
  extending?: string,
): string
⋮----
// The window distill generates from (buildDistillPrompt): grounding can reject, so the judge reads all of it.
⋮----
function boundedDocument(content: string, maxChars = 6000): string
⋮----
function buildChangedRegion(sourceContent: string, candidateContent: string): string
⋮----
/** How a judge on a harness reads an asset: OpenCode has akm's `akm_show` tool; any other harness runs the CLI. */
type JudgeReadTool = "akm_show" | "akm show";
⋮----
function reflectJudgeToolRules(ref: string | undefined, tool: JudgeReadTool): string
⋮----
export function buildReflectJudgePrompt(
  candidateContent: string,
  sourceContent: string,
  feedback: string[],
  tools?: { ref?: string; tool: JudgeReadTool },
): string
⋮----
/**
 * `grounding` is scored with the other lesson criteria but left out of their
 * mean. A lesson criterion scored {@link LESSON_REJECT_MAX_SCORE} or less is a
 * rejection whatever the mean says: the mean would hide it (4 and 1 average
 * 2.5, a review), and a reviewer was reading every lesson that was not rejected,
 * 17 of 19 of them bad on 2026-10-05. The rubric reserves 1-2 for a lesson that
 * records what was done instead of a rule, repeats an asset the library holds,
 * or states what neither its source nor its feedback does. The judge is shown
 * the feedback the writer saw, so a statement it supports is not an invention.
 */
⋮----
/**
 * Read a judge response: the per-criterion shape (averaged here, `grounding`
 * aside; `lowest` is the lowest score in that mean) or the older `{"score"}`
 * shape. Only the expected criteria are read; any missing or out-of-range
 * (1..5) value is a parse failure, extra keys are ignored.
 */
function parseJudgeResponse(
  raw: string,
  keys: readonly string[],
):
⋮----
const inRange = (value: unknown): value is number
⋮----
export function judgeResponseSchema(keys: readonly string[]): Record<string, unknown>
⋮----
/**
 * The quality judge. No runner, an unparseable verdict or a provider failure
 * never passes content: it comes back as review with score -1 (no verdict), for
 * a person. Bands: every criterion in the mean
 * >= 4 passes, otherwise a mean >= 2.5 is review and a lower one reject; a
 * lesson criterion (`grounding` included) of {@link LESSON_REJECT_MAX_SCORE}
 * or less rejects whatever the mean is.
 * Temperature is set to 0, which reduces run-to-run variation but does not
 * remove it: on some servers (llama.cpp batching, for one) the same request can
 * score a point apart, so the routing rules are chosen with that margin in mind.
 */
async function runQualityJudge(
  feature: "lesson_quality_gate" | "proposal_quality_gate",
  config: AkmConfig,
  prompt: string,
  keys: readonly string[],
  chat: QualityJudgeChat | undefined,
  options: QualityJudgeOptions,
): Promise<QualityJudgeResult>
⋮----
// Off unless the judge's own connection enables thinking (a slower, separate judge, #1011).
⋮----
export function runLessonQualityJudge(
  config: AkmConfig,
  lessonContent: string,
  sourceContent: string,
  chat: QualityJudgeChat | undefined,
  options: QualityJudgeOptions = {},
): Promise<QualityJudgeResult>
⋮----
export function runReflectQualityJudge(
  config: AkmConfig,
  candidateContent: string,
  sourceContent: string,
  feedback: string[],
  chat: QualityJudgeChat | undefined,
  options: QualityJudgeOptions = {},
): Promise<QualityJudgeResult>
`````

## File: src/commands/lint/base-linter.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { isScalar, parseDocument } from "yaml";
import { assetPathCandidatesForName, assetPathForName, stashDirFor } from "../../core/asset/asset-placement";
import { BUNDLE_REF_RE } from "../../core/asset/asset-ref";
import {
  removeFrontmatterListValues,
  rewriteFrontmatterListValue,
  spliceFrontmatterLine,
} from "../../core/asset/frontmatter";
import { checkUnquotedDescriptionColon } from "../../core/asset/frontmatter-lint";
import { isArchivedRelPath } from "../../core/asset/memory-archive";
import { conceptIdFromTypeName, typeNameFromConceptId } from "../../core/asset/resolve-ref";
import { localDateStamp } from "../../core/common";
import { containsRedactedContent, REDACTED_CONTENT_MARKER } from "../../core/content-safety";
import { DERIVED_SUFFIX } from "../../core/recognition-util";
import { findFenceRegions } from "./markdown-insertion";
import type { LintContext, LintIssue } from "./types";
⋮----
function foldDescriptionLines(lines: string[]): string
⋮----
function recoverMalformedDescription(firstSegment: string, continuation: string[]): string | null
⋮----
function fixUnquotedColon(raw: string): string | null
⋮----
function checkMissingUpdated(data: Record<string, unknown>, frontmatterText: string | null): boolean
⋮----
function fixMissingUpdated(raw: string, mtime: Date): string
⋮----
function checkStalePath(body: string): string[]
⋮----
// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop
⋮----
// ── fence-strip helper ────────────────────────────────────────────────────────
⋮----
/**
 * Returns `body` with all fenced code block lines replaced by empty strings,
 * so that ref-shaped tokens inside ``` examples are not flagged as broken refs.
 */
function stripFencedBlocks(body: string): string
⋮----
// ── missing-ref helpers ───────────────────────────────────────────────────────
⋮----
/**
 * Map from ref type to relative path pattern within stashRoot. Returns null to
 * skip (type is unresolvable by the slug walker).
 *
 * Path layout is owned by the placement layer: we resolve through
 * `assetPathForName(type, stashDirFor(type), name)` so the linter and the
 * rest of the CLI agree on where an asset lives.
 *
 * Exported for contract testing — see header CONTRACT block.
 */
export function refToRelPath(refType: string, refName: string): string | null
⋮----
if (!typeDir) return null; // unknown type — skip
// assetPathForName returns a path rooted at the type dir we pass in,
// i.e. "<typeDir>/<...>" — exactly the stash-relative path this helper has
// always returned.
⋮----
/**
 * Returns true if `relPath` resolves to a real file (or multi-file directory
 * primary) in ANY of the provided stash roots.
 *
 * Exported for contract testing — see header CONTRACT block.
 */
export function refExistsInAnyStash(relPath: string, refType: string, refName: string, stashRoots: string[]): boolean
⋮----
// #884: an asset `analyzeMemoryCleanup` pruned, or (alpha.9) a consolidate
// pair-pass `retire` proposal or a promotion's source memory retired, was
⋮----
function refPathCandidates(refType: string, typeDir: string, refName: string): string[]
⋮----
function memoryArchiveHasRef(refType: string, refName: string, stashRoots: string[]): boolean
⋮----
export function resolveRefPathInStash(relPath: string, refType: string, refName: string, root: string): string | null
⋮----
function isNonRefName(refName: string): boolean
⋮----
function localRefMissingRelPath(refType: string, refName: string, allRoots: string[]): string | null
⋮----
function scanBundleRefs(scanBody: string, allRoots: string[]): Array<
⋮----
function classifyConceptRef(rawConceptId: string, allRoots: string[]): string | null
⋮----
function legacyTypeSlugParts(rawConceptId: string):
⋮----
function checkMissingRefs(
  body: string,
  stashRoot: string,
  extraStashRoots: string[] = [],
): Array<
⋮----
function checkMissingRefsInList(
  values: string[],
  stashRoot: string,
  extraStashRoots: string[] = [],
): Array<
⋮----
function dedupeMissing(
  rows: Array<{ ref: string; resolvedRelPath: string }>,
): Array<
⋮----
function extractFrontmatterRefs(data: Record<string, unknown>, body: string): string[] | null
⋮----
function readRefsArray(value: unknown): string[] | null
⋮----
function readRefStringOrArray(value: unknown): string[] | null
⋮----
function parseInnerFrontmatterBlock(body: string): Record<string, unknown> | null
⋮----
export function runBaseChecks(ctx: LintContext): LintIssue[]
⋮----
const shouldRun = (issueType: string)
⋮----
const flushIfModified = (): void =>
⋮----
function runMissingRefChecks(
  ctx: LintContext,
  raw: string,
  shouldRun: (issueType: string) => boolean,
  pendingFixes: LintIssue[],
):
`````

## File: src/commands/lint/env-key-rules.ts
`````typescript
import fs from "node:fs";
import { listKeys } from "../env/env";
import type { LintIssue } from "./types";
⋮----
export function isDangerousEnvKey(key: string): boolean
⋮----
function collectSuppressedKeys(envPath: string): Set<string>
⋮----
export function checkEnvForDangerousKeys(envPath: string, relPath: string, envRef: string): LintIssue[]
`````

## File: src/commands/lint/index.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import {
  factDiagnostics,
  matchWorkflowPlaceholder,
  memoryOrphanStubApplies,
  nameOrTypeDiagnostics,
  ORPHANED_STUB_DETAIL,
  taskDiagnostics,
  workflowFrontendDiagnostics,
} from "../../core/adapter/adapters/akm-lint";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { adapterForId } from "../../core/adapter/registry";
import type { Diagnostic } from "../../core/adapter/types";
import { createValidateContext } from "../../core/adapter/validate-context";
import { stashDirFor } from "../../core/asset/asset-placement";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { conceptIdForStashFile, displayRefForConceptId } from "../../core/asset/resolve-ref";
import { deriveBundleIds } from "../../core/bundle-id";
import { compareCodePoints, isAkmRegistryCachePath, resolveStashDir } from "../../core/common";
import type { AkmConfig } from "../../core/config/config";
import { loadConfig, primaryBundlePath } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import type { FileChange } from "../../core/file-change";
import { warn } from "../../core/warn";
import { resolveSourceEntries, type SearchSource } from "../../indexer/search/search-source";
import { TASK_EXTENSION, TASK_NEAR_MISS_EXTENSION, taskExtensionDetail } from "../../tasks/source-v3";
import { resolveWorkflowSourceDomains } from "../../workflows/source-files";
import { runBaseChecks } from "./base-linter";
import { checkEnvForDangerousKeys } from "./env-key-rules";
import { isAdvisoryLintIssue, type LintContext, type LintIssue, type LintIssueType } from "./types";
⋮----
export interface AkmLintResult {
  ok: boolean;
  fixed: LintIssue[];
  flagged: LintIssue[];





  warnings: LintIssue[];
  summary: { fixed: number; flagged: number; warnings: number };
}
⋮----
export interface AkmLintOptions {
  fix?: boolean;





  pruneDanglingEdges?: boolean;
  dir?: string;
  config?: AkmConfig;
  typeFilter?: string;
}
⋮----
function collectTaskFiles(dir: string): string[]
⋮----
function isTaskFileName(fileName: string): boolean
⋮----
function isNearMissTaskFileName(fileName: string): boolean
⋮----
function collectMarkdownFiles(dir: string, caseInsensitive = false): string[]
⋮----
function collectWorkflowFiles(dir: string): string[]
⋮----
interface WorkflowLintOwnership {
  files: string[];
  issues: LintIssue[];
}
⋮----
function resolveWorkflowLintOwnership(stashRoot: string, files: readonly string[]): WorkflowLintOwnership
⋮----
function matchesAdapterExtension(fileName: string, extensions: readonly string[]): boolean
⋮----
function collectAdapterFiles(root: string, extensions: readonly string[]): string[]
⋮----
const walk = (dir: string): void =>
⋮----
export function diagnosticToLintIssue(diag: Diagnostic): LintIssue
⋮----
async function lintViaAdapter(
  adapterId: string,
  stashRoot: string,
  extraStashRoots: string[],
  sources: SearchSource[],
  cfg: AkmConfig,
  options: AkmLintOptions,
): Promise<AkmLintResult>
⋮----
function lintIssueDedupeKey(issue: LintIssue): string
⋮----
function collectEnvFiles(dir: string): string[]
⋮----
function runEnvDangerousKeyPass(
  stashRoot: string,
  extraStashRoots: string[],
  sources: SearchSource[],
  cfg: AkmConfig,
): LintIssue[]
⋮----
function assertFixTargetWritable(stashRoot: string, sources: SearchSource[]): void
⋮----
function isFileDeletion(issue: LintIssue): boolean
⋮----
export function lintSkillDirectory(subdirPath: string, stashRoot: string): LintIssue[]
⋮----
function appendMemoryStubIssue(ctx: LintContext, issues: LintIssue[]): void
⋮----
function appendWorkflowStubIssue(ctx: LintContext, issues: LintIssue[]): void
⋮----
export function lintAssetFile(ctx: LintContext, subdir: string): LintIssue[]
⋮----
function lintAkmSweep(
  stashRoot: string,
  extraStashRoots: string[],
  cfg: AkmConfig,
  sources: SearchSource[],
  options: AkmLintOptions,
): AkmLintResult
⋮----
export async function akmLint(options: AkmLintOptions =
`````

## File: src/commands/lint/markdown-insertion.ts
`````typescript
function looksLikeTableRow(line: string): boolean
⋮----
// Must contain at least one pipe.
⋮----
// Exclude lines that are obviously not table rows: headings, list items
// starting with `- |` are rare but possible; we lean permissive here
// because the separator-row check below is the real gate.
⋮----
/**
 * Given the start line of a candidate table (the header row), return the
 * **exclusive** end line — the first line after the table that is NOT part
 * of it (either a blank line, EOF, or a line that doesn't look like a table
 * row). Returns -1 if the candidate is not actually a table.
 *
 * @param lines       Full body as a `string[]`.
 * @param headerLine  0-based index of the candidate header row.
 */
export function findEndOfTable(lines: string[], headerLine: number): number
⋮----
// Walk forward through data rows. A blank line, EOF, or a line that does
// not look like a table row terminates the table.
⋮----
/**
 * If `lineIdx` falls inside a markdown pipe table, return the exclusive end
 * line of that table. Otherwise return -1.
 *
 * "Inside" includes the header row, the separator row, and any data row.
 */
export function isInsideTable(lines: string[], lineIdx: number): number
⋮----
if (lines[i]!.trim() === "") return -1; // blank line — out of any table
⋮----
// Continue scanning backwards — this row looks like a table row but
// the table doesn't start here (could be a data row).
⋮----
// ── Fenced code block detection ───────────────────────────────────────────────
⋮----
/**
 * Match a fenced code block opener/closer: ```` ``` ```` or `~~~`, with
 * optional leading whitespace and optional language identifier. The fence
 * character must repeat at least three times; the matched group is the
 * fence character + repeat count so we can detect matching closers.
 */
⋮----
interface FenceRegion {
  /** 0-based inclusive line of the opening fence. */
  start: number;
  /** 0-based inclusive line of the closing fence (or last line if unterminated). */
  end: number;
}
⋮----
/** 0-based inclusive line of the opening fence. */
⋮----
/** 0-based inclusive line of the closing fence (or last line if unterminated). */
⋮----
/**
 * Return all fenced-code-block regions in `lines`. A fence is considered
 * unterminated if EOF is reached without a matching closer — in that case
 * the region extends to the last line. This matches CommonMark behaviour
 * and means "EOF closes any open fence" so we still treat the tail as a
 * no-insert region (otherwise a fixer could inject content into what the
 * author meant as a multi-line code sample).
 */
export function findFenceRegions(lines: string[]): FenceRegion[]
⋮----
// Opening fence
⋮----
openFence = fence[0]!; // ``` or ~~~
⋮----
// Inside a fence — only a matching fence character closes it, and the
// closer must be at least as long. Per CommonMark we ignore any info
// string on the closer (`match[3]` is allowed but typically empty).
⋮----
// Unterminated fence — extends to EOF.
⋮----
/**
 * If `lineIdx` falls inside any fenced code block, return the exclusive
 * end line (one past the closing fence). Otherwise return -1.
 */
export function isInsideCodeFence(lines: string[], lineIdx: number): number
⋮----
// ── HTML table detection ─────────────────────────────────────────────────────
⋮----
/**
 * If `lineIdx` falls inside an HTML `<table>…</table>` block, return the
 * exclusive end line (one past the `</table>`). Otherwise return -1.
 *
 * We do a deliberately simple scan: detect `<table` on any prior line (case
 * insensitive, allowing attributes) and require a `</table>` on or after
 * `lineIdx`. Nested tables are NOT supported — that's a markdown
 * anti-pattern and we'd rather under-detect than over-detect.
 */
export function isInsideHtmlTable(lines: string[], lineIdx: number): number
⋮----
// Closing tag before lineIdx — table already finished, reset.
⋮----
// We're after a `<table` opener — find the matching `</table>`.
⋮----
// Unterminated table — extend to EOF so we don't inject into malformed HTML.
⋮----
// ── Indented code block detection ────────────────────────────────────────────
⋮----
/**
 * Per CommonMark, an indented code block is a sequence of lines indented by
 * 4+ spaces (or one tab), preceded by a blank line. We use a simplified
 * detection: if `lineIdx` is indented 4+ spaces / starts with a tab AND
 * either is the first line of the body or follows a blank line, treat it
 * as part of an indented code block and skip to the next non-indented
 * non-blank line.
 *
 * Returns the exclusive end of the code block if `lineIdx` is inside one,
 * otherwise -1.
 */
export function isInsideIndentedCode(lines: string[], lineIdx: number): number
⋮----
const isIndented = (s: string) => /^(
⋮----
// Walk backwards: every line above must be either indented or blank, and
// we must eventually hit a blank line (or BOF) before any non-indented
// non-blank line. If we find a non-indented non-blank line first, this
// isn't an indented code block (it's just a continuation of a list item
// or paragraph).
⋮----
return -1; // probably a list continuation, not a code block
⋮----
// Walked all the way to BOF without a blank line — but lineIdx > 0
// means there was a non-indented non-blank line above, which would
// have returned -1 already. This branch is for safety only.
⋮----
// Walk forwards to find the end of the block.
⋮----
// A blank line MAY terminate the block, but per CommonMark a single
// blank line followed by more indented lines is still part of the
// same block. Peek ahead.
⋮----
break; // block ends at the blank line
⋮----
// ── Composite: find a safe insertion point ───────────────────────────────────
⋮----
/**
 * Given a proposed 0-based insertion line, return an adjusted 0-based line
 * that is guaranteed to fall outside of any markdown table, HTML table,
 * fenced code block, or indented code block.
 *
 * Strategy: if the proposed line falls inside a no-insert region, push it
 * to the line immediately AFTER that region. We never push it before —
 * most callouts are forward references to surrounding content, so
 * post-region is the safer choice (and prevents the very bug this helper
 * exists to fix: a callout landing between the header separator and the
 * first data row).
 *
 * The check is iterative: pushing past one region may land inside another
 * (e.g. table immediately followed by code fence), so we re-check until a
 * stable safe point is reached or we hit EOF. The iteration is bounded by
 * line count to guarantee termination.
 *
 * @param lines                Body as a `string[]`.
 * @param proposedLineNumber   0-based index where the caller wants to insert.
 * @returns                    0-based safe insertion index (may equal `lines.length`).
 */
export function findSafeInsertionPoint(lines: string[], proposedLineNumber: number): number
⋮----
// Iterate at most `lines.length` times — each iteration that finds a
// region only moves `target` forward, so we cannot loop forever.
⋮----
// Defensive fallback — should be unreachable given the guard above.
⋮----
/**
 * Convenience wrapper that operates on a raw string (splits on `\r?\n` and
 * accepts 0-based line numbers). Returns the adjusted 0-based line.
 *
 * Useful when a caller has the markdown as a single string and only wants
 * to know "where can I safely splice in N more lines?"
 */
export function findSafeInsertionPointInText(content: string, proposedLineNumber: number): number
`````

## File: src/commands/lint/types.ts
`````typescript
export type LintIssueType =
  | "unquoted-colon"
  | "missing-updated"
  | "orphaned-stub"
  | "placeholder-stub"
  | "missing-name-or-type"
  | "missing-type"
  | "stale-path"
  | "missing-skill-md"
  | "invalid-task-yaml"
  | "missing-ref"
  | "redacted-content"
  | "dangerous-env-key"
  | "invalid-workflow-structure"
  | "missing-category"








  | "lint-failed"







  | "uncited-raw"
  | "missing-description"
  | "broken-xref"
  | "broken-source"







  | "workflow-warning"











  | "adapter-diagnostic";
⋮----
export function isAdvisoryLintIssue(issue:
⋮----
export interface LintIssue {
  file: string;
  issue: LintIssueType;
  detail: string;

  fixed: boolean | "failed";








  line?: number;
}
⋮----
export interface LintContext {
  filePath: string;
  relPath: string;
  raw: string;
  data: Record<string, unknown>;
  body: string;
  frontmatter: string | null;
  fix: boolean;

  pruneDanglingEdges?: boolean;
  stashRoot: string;

  extraStashRoots?: string[];





  lintSkip?: string[];
}
`````

## File: src/commands/metrics/collect.ts
`````typescript
import type { EventEnvelope } from "../../core/events-types";
import type { UsageEventRow } from "../../indexer/usage/usage-events";
import { decodeLlmUsageRecord } from "../../llm/usage-telemetry";
import type { UtilityWithRef } from "../../storage/repositories/index-utility-repository";
import type { AssetOutcomeRow } from "../../storage/repositories/outcome-repository";
import { decodeTaskHistoryMetadata, type TaskHistoryRow } from "../../storage/repositories/task-history-repository";
import { computeWallTimeStats } from "../health/improve-metrics";
import type { LlmUsageAggregate } from "../health/types-metrics";
import { computeValenceScore } from "../improve/feedback-valence";
import type {
  AkmMetricsResult,
  MetricsAssetUsage,
  MetricsDailyUsage,
  MetricsFeedbackAsset,
  MetricsIndexRun,
  MetricsLlmRow,
  MetricsNegativeFeedback,
  MetricsOutcomeAsset,
  MetricsQueryCount,
  MetricsTaskSummary,
  MetricsUsageRow,
  MetricsUtilityAsset,
} from "./types";
⋮----
export interface MetricsInput {
  window: { since: string; until: string };

  source: string;

  top: number;

  includeRows: boolean;
  usage: UsageEventRow[];

  selects: Array<{ ts: string; ref: string }>;

  utility: UtilityWithRef[] | undefined;
  outcomes: AssetOutcomeRow[];
  llm: LlmUsageAggregate;
  llmRows: MetricsLlmRow[];
  indexRuns: MetricsIndexRun[];
  tasks: TaskHistoryRow[];
  proposals: AkmMetricsResult["proposals"];
  workflows: AkmMetricsResult["workflows"];

  notes: string[];
}
⋮----
export function retentionNotes(args: {
  sinceIso: string;
  nowMs: number;
  usageRetentionDays: number;
  eventRetentionDays: number;
}): string[]
⋮----
export function usageCreatedAtToIso(createdAt: string): string
⋮----
function parseMetadata(text: string | null): Record<string, unknown>
⋮----
function finiteNumber(value: unknown): number | undefined
⋮----
export function toUsageRow(row: UsageEventRow): MetricsUsageRow
⋮----
export function llmRowsFromEvents(events: EventEnvelope[]): MetricsLlmRow[]
⋮----
export function indexRunsFromEvents(events: Array<
⋮----
function median(values: number[]): number | null
⋮----
function mean(values: number[]): number | null
⋮----
function byCountThenKey<T extends
⋮----
function buildUsage(input: MetricsInput, rows: MetricsUsageRow[]): AkmMetricsResult["usage"]
⋮----
const isUnit = (row: MetricsUsageRow)
⋮----
const bump = (at: string, field: keyof Omit<MetricsDailyUsage, "day">) =>
⋮----
const asset = (ref: string): MetricsAssetUsage =>
const touch = (entry: MetricsAssetUsage, at: string) =>
⋮----
const toQueryCount = (
    query: string,
    entry: { count: number; results: number[]; lastAt: string },
): MetricsQueryCount => (
⋮----
function buildFeedback(top: number, rows: MetricsUsageRow[]): AkmMetricsResult["feedback"]
⋮----
function buildUtility(input: MetricsInput): AkmMetricsResult["utility"]
⋮----
function taskDurationMs(row: TaskHistoryRow): number | undefined
⋮----
function buildTasks(top: number, rows: TaskHistoryRow[]): AkmMetricsResult["tasks"]
⋮----
function buildIndex(top: number, runs: MetricsIndexRun[]): AkmMetricsResult["index"]
⋮----
export function buildMetricsResult(input: MetricsInput): AkmMetricsResult
`````

## File: src/commands/metrics/html-report.ts
`````typescript
import { escapeHtml, isoTimeTag, renderHtml, resolveTemplatePath } from "../../output/html-render";
import { pkgVersion } from "../../version";
import { buildEchartsTag } from "../health/html-report";
import { isMetricsResult } from "./report-view";
import type { AkmMetricsResult, MetricsLlmRow, MetricsUsageRow } from "./types";
⋮----
type PageUsageRow = Omit<MetricsUsageRow, "query"> & { query?: string; q?: number };
⋮----
type PageData = Omit<AkmMetricsResult, "rows"> & {
  rows: { usage: PageUsageRow[]; llm: MetricsLlmRow[]; queries: string[] };
};
⋮----
function toPageData(result: AkmMetricsResult): PageData
⋮----
function islandJson(value: unknown): string
⋮----
export function buildMetricsHtmlReplacements(result: AkmMetricsResult): Record<string, string>
⋮----
export function renderMetricsHtml(result: unknown): string | null
`````

## File: src/commands/metrics/md-report.ts
`````typescript
import type { DetailLevel } from "../../output/context";
import { registerMdRenderer } from "../../output/render-registry";
import { buildMetricsView, isMetricsResult, type MetricsViewTable } from "./report-view";
⋮----
function cell(value: string): string
⋮----
function renderTable(table: MetricsViewTable): string[]
⋮----
const row = (cells: string[]) => `| $
⋮----
export function renderMetricsMd(result: unknown, detail: DetailLevel): string | null
`````

## File: src/commands/metrics/metrics-cli.ts
`````typescript
import fs from "node:fs";
import { defineJsonCommand, output } from "../../cli/shared";
import { parseBundleRef } from "../../core/asset/asset-ref";
import { loadConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { readEvents } from "../../core/events";
import { getDbPath } from "../../core/paths";
import { getStateDbPath, listPendingStateMigrations } from "../../core/state-db";
import { lookupBundleRefsReadonly } from "../../indexer/indexer";
import { USAGE_EVENT_RETENTION_DAYS } from "../../indexer/usage/usage-events";
import { LLM_USAGE_EVENT } from "../../llm/usage-persist";
import { getOutputMode, type OutputMode } from "../../output/context";
import { type Database, openDatabase } from "../../storage/database";
import { closeDatabase, openReadonlyExistingDatabase } from "../../storage/repositories/index-connection";
import { listUtilityWithRefs, type UtilityWithRef } from "../../storage/repositories/index-utility-repository";
import {
  countProposalsByStatus,
  listIndexCompletedEvents,
  listLowestOutcomeAssets,
  listSelectEvents,
  listUsageEventRows,
  type MetricsQueryFilter,
  summarizeWorkflowRuns,
} from "../../storage/repositories/metrics-repository";
import { queryTaskHistory } from "../../storage/repositories/task-history-repository";
import { applyReadonlyPragmas } from "../../storage/sqlite-pragmas";
import { parseHealthSince } from "../health";
import { computeAcceptRateBySource } from "../health/accept-rate";
import { emptyLlmUsageAggregate, summarizeLlmUsage } from "../health/llm-usage";
import {
  buildMetricsResult,
  DEFAULT_EVENT_RETENTION_DAYS,
  indexRunsFromEvents,
  llmRowsFromEvents,
  type MetricsInput,
  retentionNotes,
} from "./collect";
import type { AkmMetricsResult } from "./types";
⋮----
export interface AkmMetricsOptions {

  since?: string;

  includeRows?: boolean;
  now?: () => number;





  indexSnapshot?: boolean;
}
⋮----
export function metricsIncludeRows(mode: Pick<OutputMode, "format" | "detail">): boolean
⋮----
async function durableSelects(
  selects: Array<{ ts: string; ref: string }>,
  indexSnapshot = true,
): Promise<Array<
⋮----
function readUtility():
⋮----
function readEventRetention():
⋮----
function readAcceptRate(stateDb: Database, notes: string[]): AkmMetricsResult["proposals"]["acceptRateBySource"]
⋮----
export async function akmMetrics(options: AkmMetricsOptions =
⋮----
async run(
`````

## File: src/commands/metrics/report-view.ts
`````typescript
import type { DetailLevel } from "../../output/context";
import type { AkmMetricsResult } from "./types";
⋮----
export interface MetricsViewTable {
  title: string;
  headers: string[];
  rows: string[][];

  hideWhenEmpty?: boolean;
}
⋮----
export interface MetricsViewSection {
  title: string;
  facts: Array<[label: string, value: string]>;
  tables: MetricsViewTable[];
}
⋮----
export interface MetricsView {
  window: string;
  filters: string;
  sections: MetricsViewSection[];
  notes: string[];
}
⋮----
export function isMetricsResult(value: unknown): value is AkmMetricsResult
⋮----
const int = (n: number): string
const dash = (v: string | undefined): string
/** A fraction as a percentage; `null` (zero denominator) is `n/a`, never `NaN`. */
const pct = (n: number | null): string => (n === null ? "n/a" : `$
const ms = (n: number | null): string => (n === null ? "n/a" : `$
const fixed = (n: number | null, digits: number): string
⋮----
function sourceFacts(counts: Record<string, number>): string
⋮----
function llmRows(group: Record<string, AkmMetricsResult["llm"]["byEngine"][string]>): string[][]
⋮----
export function buildMetricsView(r: AkmMetricsResult, detail: DetailLevel): MetricsView
⋮----
const cut = <T>(items: T[]): T[]
⋮----
function utilityHeaders(): string[]
⋮----
function utilityRow(u: AkmMetricsResult["utility"]["lowest"][number]): string[]
`````

## File: src/commands/metrics/types.ts
`````typescript
import type { AcceptRateEntry } from "../health/accept-rate";
import type { LlmUsageAggregate } from "../health/types-metrics";
⋮----
export interface MetricsUsageRow {
  id: number;

  at: string;
  eventType: string;

  ref?: string;
  query?: string;
  signal?: "positive" | "negative";
  source: string;

  resultCount?: number;

  totalMs?: number;
  reason?: string;
  tags?: string[];
}
⋮----
export interface MetricsLlmRow {

  day: string;
  stage?: string;
  process?: string;
  engine?: string;
  model?: string;
  outcome: "success" | "error";
  calls: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;

  totalTokens: number;
  reasoningTokens: number;
}
⋮----
export interface MetricsDailyUsage {

  day: string;
  search: number;
  show: number;
  curate: number;
  feedback: number;
}
⋮----
export interface MetricsAssetUsage {
  ref: string;
  shows: number;
  searchHits: number;
  selects: number;
  positive: number;
  negative: number;
  lastUsedAt?: string;
}
⋮----
export interface MetricsQueryCount {
  query: string;
  count: number;

  avgResults: number | null;
  lastAt: string;
}
⋮----
export interface MetricsFeedbackAsset {
  ref: string;
  positive: number;
  negative: number;

  valence: number;
  lastAt: string;
}
⋮----
export interface MetricsNegativeFeedback {
  ref: string;
  at: string;
  reason?: string;
  tags?: string[];
}
⋮----
export interface MetricsUtilityAsset {
  ref: string;
  utility: number;
  showCount: number;
  searchCount: number;
  selectRate: number;
  lastUsedAt?: string;
}
⋮----
export interface MetricsOutcomeAsset {
  ref: string;
  outcomeScore: number;
  retrievalCount: number;
  negativeFeedbackCount: number;
  acceptedChangeCount: number;
}
⋮----
export interface MetricsTaskSummary {
  taskId: string;
  runs: number;
  failed: number;
  medianMs: number | null;
}
⋮----
export interface MetricsIndexRun {
  at: string;
  mode: "full" | "incremental";
  totalMs: number;
}
⋮----
export interface AkmMetricsResult {
  schemaVersion: 1;
  window: { since: string; until: string };
  filters: { source: string };
  usage: {
    totals: {
      searches: number;
      shows: number;
      curates: number;
      selects: number;
      zeroResultSearches: number;
      distinctAssets: number;
      distinctQueries: number;
    };

    selectRate: number | null;

    searchMedianMs: number | null;
    daily: MetricsDailyUsage[];
    topAssets: MetricsAssetUsage[];
    topQueries: MetricsQueryCount[];
    zeroResultQueries: MetricsQueryCount[];
    bySource: Record<string, number>;
  };
  feedback: {
    totals: { positive: number; negative: number };
    byAsset: MetricsFeedbackAsset[];
    byTag: Record<string, { positive: number; negative: number }>;
    recentNegative: MetricsNegativeFeedback[];
  };
  utility: {

    count: number;

    histogram: Array<{ bucket: string; count: number }>;
    lowest: MetricsUtilityAsset[];
    highest: MetricsUtilityAsset[];

    neverUsed: number;
  };
  outcomes: { lowestOutcome: MetricsOutcomeAsset[] };
  llm: LlmUsageAggregate;
  index: { runs: number; medianMs: number | null; recent: MetricsIndexRun[] };
  tasks: { runs: number; failed: number; failRate: number | null; byTask: MetricsTaskSummary[] };
  proposals: { byStatus: Record<string, number>; acceptRateBySource: AcceptRateEntry[] };
  workflows: { runs: number; byStatus: Record<string, number>; tokens: number; byModel: Record<string, number> };





  rows?: { usage: MetricsUsageRow[]; llm: MetricsLlmRow[] };
  notes: string[];
}
`````

## File: src/commands/proposal/validators/proposal-quality-validators.ts
`````typescript
import { parseFrontmatter } from "../../../core/asset/frontmatter";
import { parseRefInput } from "../../../core/asset/resolve-ref";
import {
  DESCRIPTION_MAX_CHARS,
  DESCRIPTION_MIN_CHARS,
  WHEN_TO_USE_MAX_CHARS,
  WHEN_TO_USE_MIN_CHARS,
} from "../../../core/authoring-rules";
import {
  containsRedactedContent,
  containsReflectPromptScaffolding,
  REDACTED_CONTENT_MARKER,
  REFLECT_AVOID_PATTERNS_HEADING,
} from "../../../core/content-safety";
import { proposalContent } from "../../../core/file-change";
import { detectTruncatedDescription, TRUNCATION_TRAILING_WORDS } from "../../../core/text-truncation";
import { REFLECT_TRUNCATION_MARKER } from "../../../integrations/agent/prompts";
import { splitFrontmatter } from "../../improve/reflect-noise";
import type { ProposalValidator } from "../proposal-types";
⋮----
function refNameTail(inputRef: string): string
⋮----
export interface DescriptionValidationOptions {

  skipRefTailCheck?: boolean;
}
⋮----
export function isValidDescription(
  value: unknown,
  inputRef: string,
  options: DescriptionValidationOptions = {},
):
⋮----
export function isValidWhenToUse(value: unknown, inputRef: string):
⋮----
export function detectDoubleFrontmatter(content: string):
⋮----
export function validateProposalFrontmatter(fm: Record<string, unknown>):
⋮----
export function hasSupersededStatus(frontmatter: Record<string, unknown> | undefined): boolean
⋮----
export type ReflectSizeOutcome =
  | { ok: true }
  | { ok: false; code: "EXCESSIVE_SHRINKAGE" | "EXCESSIVE_EXPANSION"; ratio: number };
⋮----
export function checkReflectSize(sourceBody: string | undefined, proposedBody: string): ReflectSizeOutcome
⋮----
appliesTo(_proposal, ctx)
validate(proposal)
⋮----
export function lessonQualityIssues(
  fm: Record<string, unknown>,
  content: string,
  inputRef: string,
): Array<
⋮----
appliesTo(proposal, ctx)
validate(proposal, ctx)
⋮----
appliesTo(proposal)
⋮----
function advisory(validator: ProposalValidator): ProposalValidator
`````

## File: src/commands/proposal/validators/proposal-validators.ts
`````typescript
import { parseFrontmatter } from "../../../core/asset/frontmatter";
import { parseRefInput } from "../../../core/asset/resolve-ref";
import { proposalContent } from "../../../core/file-change";
import { lintLessonContent } from "../../../core/lesson-lint";
import { parseTaskSource } from "../../../tasks/source/parse-task-source";
import { compileWorkflowSource } from "../../../workflows/compile";
import type {
  Proposal,
  ProposalValidationContext,
  ProposalValidationFinding,
  ProposalValidationReport,
  ProposalValidator,
} from "../proposal-types";
import { defaultProposalQualityValidators } from "./proposal-quality-validators";
⋮----
validate(proposal, ctx)
⋮----
type CanonicalProposalValidator = (proposal: Proposal, ctx: ProposalValidationContext) => ProposalValidationFinding[];
⋮----
lesson(proposal)
task(proposal, ctx)
workflow(proposal)
⋮----
export function hasCanonicalProposalValidator(type: string): boolean
⋮----
appliesTo(_proposal, ctx)
⋮----
export function runProposalValidators(
  proposal: Proposal,
  validators: ProposalValidator[] = defaultProposalValidators,
  initialContext: Partial<ProposalValidationContext> = {},
): ProposalValidationReport
`````

## File: src/commands/proposal/validators/proposals.ts
`````typescript
import { repairTruncatedDescription } from "../../../core/text-truncation";
import { splitFrontmatter } from "../../improve/reflect-noise";
import { isRetireProposal, type Proposal, type ProposalValidationReport } from "../proposal-types";
import { runProposalValidators } from "./proposal-validators";
⋮----
export function validateProposal(proposal: Proposal): ProposalValidationReport
⋮----
export function repairProposalContent(content: string): string
`````

## File: src/commands/proposal/diff-format.ts
`````typescript
export function formatUnifiedDiff(left: string, right: string, label: string): string
⋮----
export function formatNewAssetDiff(ref: string, content: string): string
⋮----
export function formatRetireDiff(ref: string, existing: string | null, successorRef?: string): string
⋮----
if (removed[removed.length - 1] === "") removed.pop(); // the newline ending the file is not a line of its own
`````

## File: src/commands/proposal/drain.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { assetPathForName, stashDirFor } from "../../core/asset/asset-placement";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { parseRefInput } from "../../core/asset/resolve-ref";
import type { AkmConfig } from "../../core/config/config";
import { appendEvent, type EventsContext } from "../../core/events";
import { escapeJsonStringControls, stripCodeFences, stripThinkBlocks } from "../../core/parse";
import { info, warn } from "../../core/warn";
import { type Notice, noticeSet } from "../../execution/notices";
import type { LoweringNotice } from "../../execution/resolved-request";
import { buildExecution, resolveExecution } from "../../integrations/agent/execution";
import type { RunnerSpec } from "../../integrations/agent/runner";
import type { RunExecutionOptions } from "../../integrations/agent/runner-dispatch";
import { callStructured } from "../../llm/structured-call";
import {
  NEIGHBOUR_EXCERPT_CHARS,
  NEIGHBOUR_NOTE_COUNT,
  nearestKnowledgeNotes,
  shingleContainment,
  wordShingles,
} from "../improve/consolidate/coverage";
import { errMessage } from "../improve/stage";
import { akmProposalAccept, akmProposalReject, type ProposalRejectResult } from "./proposal";
import { isRetireProposal, PAIR_PASS_GATE, STALE_TARGET_GATE_REASON } from "./proposal-types";
import {
  type AcceptCommitCollector,
  commitCollectedAccepts,
  listProposals,
  listProposalsReadOnly,
  type Proposal,
  preflightProposalPromotion,
  proposalContent,
  proposalContentHash,
  readFreshProposalTarget,
  recordGateDecision,
} from "./repository";
⋮----
export type DrainDeferReason = "needs-judgment" | "proactive-needs-review";
⋮----
export interface DrainOptions {
  stashDir: string;

  target?: string;

  config?: AkmConfig;

  applyMode: "queue" | "promote";

  maxAccepts: number;

  dryRun: boolean;

  excludeIds?: Set<string>;

  judgment?: RunnerSpec | null;

  signal?: AbortSignal;
  eventsCtx?: EventsContext;





  commitCollector?: AcceptCommitCollector;
}
⋮----
export interface DrainResult {
  promoted: string[];
  rejected: string[];

  deferred: Array<{ id: string; reason: DrainDeferReason }>;

  skippedByCap: string[];

  staged: string[];

  failed: Array<{ id: string; reason: string; detail: string }>;
  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export type PromoteFn = typeof akmProposalAccept;
export type RejectFn = (
  options: Parameters<typeof akmProposalReject>[0],
) => ProposalRejectResult | Promise<ProposalRejectResult>;
⋮----
export interface JudgmentVerdict {
  decision: "accept" | "reject" | "defer";
  reason: string;
}
⋮----
export interface JudgmentSeams {
  chat?: RunExecutionOptions["chat"];
}
⋮----
export function isPromotionProposal(proposal: Proposal): boolean
⋮----
export function isEmptyDiff(proposal: Proposal): boolean
⋮----
function categorizeDrainFailure(message: string, fallback: string): string
⋮----
type AcceptOutcome = "promoted" | "rejected" | { message: string };
⋮----
async function acceptProposal(
  opts: DrainOptions,
  proposal: Proposal | undefined,
  id: string,
  reason: string,
  promoteFn: PromoteFn,
  rejectFn: RejectFn,
  judgeReason?: string,
): Promise<AcceptOutcome>
⋮----
async function rejectProposal(
  opts: DrainOptions,
  id: string,
  reason: string,
  gateReason: string,
  rejectFn: RejectFn,
  judgeReason?: string,
): Promise<string | undefined>
⋮----
export function fencedBlock(text: string): string[]
⋮----
/** The judgment prompt: the proposal, the live asset it would overwrite, same-ref siblings, and for a promotion the nearest knowledge notes. */
export function buildJudgmentPrompt(
  proposal: Proposal,
  reason: DrainDeferReason,
  ctx: {
    liveAsset: string | undefined;
    siblings: Proposal[];
    neighbours?: ReturnType<typeof nearestKnowledgeNotes>;
  },
): string
⋮----
// A promotion (a memory proposed as a new knowledge note) must also be durable.
⋮----
/** A verdict from raw runner output (the first JSON object), or null. */
export function parseJudgmentVerdict(raw: string): JudgmentVerdict | null
⋮----
/** Why a judged item is still deferred: a stable token and, for a model defer, its words. */
interface DeferNote {
  reason: "judgment-deferred" | "judgment-parse-failure" | "judgment-error" | "judgment-not-promotion";
  judgeReason?: string;
}
⋮----
/** Dispatch the judgment prompt on the frozen runner: one model call, under the model-work tool policy. */
async function dispatchJudgment(
  runner: RunnerSpec,
  prompt: string,
  seams: JudgmentSeams,
  signal: AbortSignal | undefined,
): Promise<
⋮----
/**
 * The judgment tier: the runner only judges; the drain performs the accept
 * (under `applyMode` and the remaining accept budget) or the reject. A defer, an
 * unparseable verdict or a runner error leaves the item undecided.
 */
async function runJudgmentTier(
  opts: DrainOptions & { judgment: RunnerSpec },
  result: DrainResult,
  pending: Proposal[],
  acceptBudget: number,
  promoteFn: PromoteFn,
  rejectFn: RejectFn,
  seams: JudgmentSeams,
  deferNotes: Map<string, DeferNote>,
): Promise<void>
⋮----
function promotionNeighbours(
  stashDir: string,
  proposal: Proposal,
  acceptedPromotions: readonly Proposal[],
): ReturnType<typeof nearestKnowledgeNotes>
⋮----
/** The live asset a proposal would overwrite, if any. */
function readLiveAssetContent(stashDir: string, ref: string): string | undefined
⋮----
export async function drainProposals(
  opts: DrainOptions,
  promoteFn: PromoteFn = akmProposalAccept,
  rejectFn: RejectFn = akmProposalReject,
  judgmentSeams: JudgmentSeams = {},
): Promise<DrainResult>
⋮----
async function drainPending(
  opts: DrainOptions,
  promoteFn: PromoteFn,
  rejectFn: RejectFn,
  judgmentSeams: JudgmentSeams,
): Promise<DrainResult>
⋮----
function emitDrainEvents(opts: DrainOptions, result: DrainResult): void
`````

## File: src/commands/proposal/proposal-cli.ts
`````typescript
import { parsePositiveIntFlag } from "../../cli/parse-args";
import { defineGroupCommand, defineJsonCommand, EXIT_CODES, output } from "../../cli/shared";
import { resolveStashDir } from "../../core/common";
import { loadConfig } from "../../core/config/config";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { ConfigError, UsageError } from "../../core/errors";
import { mergeNotices } from "../../execution/notices";
import type { LoweringNotice } from "../../execution/resolved-request";
import { installLlmUsagePersistenceIfAbsent } from "../../llm/usage-persist";
import { withLlmStage } from "../../llm/usage-telemetry";
import { resolveImproveExecution } from "../improve/execution";
import { extractCommand } from "../improve/extract-cli";
import { resolveImproveStrategy } from "../improve/improve-strategies";
import { drainProposals } from "./drain";
import {
  akmProposalAccept,
  akmProposalAcceptMany,
  akmProposalDiff,
  akmProposalList,
  akmProposalReject,
  akmProposalReopen,
  akmProposalRevert,
  akmProposalShow,
  bulkAdjudicateProposals,
} from "./proposal";
import { proposalWaitingSince } from "./proposal-types";
import { proposeCommand } from "./propose-cli";
⋮----
function parseBulkFilterFlags(args: Record<string, unknown>):
⋮----
function parseProposalStatus(raw: string | undefined): "pending" | "accepted" | "rejected" | "reverted" | undefined
⋮----
run(
⋮----
async run(
`````

## File: src/commands/proposal/proposal-types.ts
`````typescript
import type { StashEntryScope } from "../../core/adapter/types";
import type { AssetRef } from "../../core/asset/resolve-ref";
import type { FileChange } from "../../core/file-change";
⋮----
export type EligibilitySource =
  | "signal-delta"
  | "high-salience"
  | "proactive"
  | "scope"
  | "forgetting-safety"
  | "replay"
  | "unknown";
⋮----
export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];
⋮----
export function isValidProposalSource(source: string): source is ProposalSource
⋮----
export function isAutomatedProposalSource(source: string): source is (typeof AUTOMATED_PROPOSAL_SOURCES)[number]
⋮----
export type ProposalStatus = "pending" | "accepted" | "rejected" | "reverted";
⋮----
export interface ProposalPayload {

  content: string;
  frontmatter?: Record<string, unknown>;
}
⋮----
export interface ProposalFeedbackFix {
  reason: string;
  source: string;
}
⋮----
export interface ProposalReview {
  outcome: "accepted" | "rejected";
  reason?: string;
  decidedAt: string;
}
⋮----
export interface ProposalReviewHistoryEntry {

  review?: ProposalReview;
  gateDecision?: ProposalGateDecision;
  reopenedAt: string;

  reopenReason?: string;
}
⋮----
export type ProposalGateDecisionOutcome = "auto-accepted" | "deferred" | "staged" | "auto-rejected";
⋮----
export interface ProposalGateDecision {
  outcome: ProposalGateDecisionOutcome;


















  reason: string;

  measured?: number;
  thresholds?: { maxDiffLines?: number; minContentLines?: number };

  contentHash?: string;

  scores?: Record<string, number>;

  judgeReason?: string;
  gate?: string;
  decidedAt: string;
}
⋮----
export type RetireReason = "duplicate" | "subsumed" | "superseded" | "promoted";
⋮----
export interface RetirementMetadata {

  judgedScope?: StashEntryScope;

  retiredRef: string;

  successorRef: string;

  cosine: number;

  judgeLabel: "duplicate" | "subsumed" | "supersedes";

  judgeReason: string;






  onlyInRetired?: string[];
  onlyInSuccessor?: string[];

  retiredContentHash: string;

  successorContentHash: string;

  reason: Exclude<RetireReason, "promoted">;






  continuityRisk?: RetirementContinuityRisk;
}
⋮----
export interface ContinuityRiskRank {
  query: string;
  retiredRank: number;

  successorRank: number | null;
}
⋮----
export interface RetirementContinuityRisk {

  failingQueries: number;
  ranks: ContinuityRiskRank[];







  unverifiedQueries?: number;
}
⋮----
export interface RetiredArchiveRecord {
  dirs: string[];
}
⋮----
export interface RetireAcceptIntent {
  assetPath: string;
  backupContent: string;
}
⋮----
export interface Proposal {
  id: string;

  ref: string;
  status: ProposalStatus;
  source: ProposalSource | string;

  sourceRun?: string;
  createdAt: string;
  updatedAt: string;
  payload: ProposalPayload;

  changes: FileChange[];





  proposedTarget?: { source: string; root: string };

  beforeHash?: string;





  beforeHashNormalized?: string;
  review?: ProposalReview;

  reviewHistory?: ProposalReviewHistoryEntry[];

  confidence?: number;
  gateDecision?: ProposalGateDecision;

  feedback?: ProposalFeedbackFix;

  backupContent?: string;

  acceptedTarget?: { source: string; root: string; path: string; contentHash: string };
  eligibilitySource?: EligibilitySource;

  retirement?: RetirementMetadata;

  retiredArchive?: RetiredArchiveRecord;







  promotionSource?: string;








  promotionSourceHash?: string;







  retireAcceptIntent?: RetireAcceptIntent;
}
⋮----
export function proposalWaitingSince(proposal: Pick<Proposal, "createdAt" | "reviewHistory">): string
⋮----
export function isRetireProposal(proposal: Pick<Proposal, "changes">): boolean
⋮----
export function isProceduralRejection(proposal: Pick<Proposal, "gateDecision" | "review">): boolean
⋮----
export interface ProposalValidationFinding {
  kind: string;
  message: string;

  severity?: "warn";
}
⋮----
export interface ProposalValidationReport {
  ok: boolean;
  findings: ProposalValidationFinding[];
}
⋮----
export interface ProposalValidationContext {
  parsedRef?: AssetRef;
  stop?: boolean;

  source?: {
    content?: string;
    frontmatter?: Record<string, unknown>;
  };
}
⋮----
export interface ProposalValidator {
  name: string;
  appliesTo(proposal: Proposal, ctx: ProposalValidationContext): boolean;
  validate(proposal: Proposal, ctx: ProposalValidationContext): ProposalValidationFinding[];
}
⋮----
appliesTo(proposal: Proposal, ctx: ProposalValidationContext): boolean;
validate(proposal: Proposal, ctx: ProposalValidationContext): ProposalValidationFinding[];
`````

## File: src/commands/proposal/proposal.ts
`````typescript
import { resolveStashDir } from "../../core/common";
import type { AkmConfig } from "../../core/config/config";
import { loadConfig } from "../../core/config/config";
import { NotFoundError } from "../../core/errors";
import type { ResolvedWriteTarget } from "../../core/write-source";
import { resolveWriteTarget } from "../../core/write-source";
import { withAssetMutationLease } from "../../indexer/index-writer-lock";
import { isRetireProposal, proposalWaitingSince, type RetirementMetadata } from "./proposal-types";
import {
  type AcceptCommitCollector,
  commitCollectedAccepts,
  diffProposal,
  listProposals,
  type Proposal,
  type ProposalGateDecision,
  type ProposalsContext,
  preflightProposalPromotion,
  promoteProposal,
  proposalContent,
  rejectProposalDurably,
  reopenProposals,
  resolveProposalId,
  revertProposal,
} from "./repository";
import { validateProposal } from "./validators/proposals";
⋮----
function resolveStash(stashDir?: string): string
⋮----
interface ResolvedProposalQueue {
  stashDir: string;
  target?: ResolvedWriteTarget;
}
⋮----
function resolveProposalQueue(
  stashDir: string | undefined,
  queue: string | undefined,
  config?: AkmConfig,
): ResolvedProposalQueue
⋮----
export interface ProposalListOptions {
  stashDir?: string;
  queue?: string;
  config?: AkmConfig;
  status?: "pending" | "accepted" | "rejected" | "reverted";
  ref?: string;
  type?: string;
  includeArchive?: boolean;

  generator?: string;
}
⋮----
export interface ProposalListResult {
  schemaVersion: 1;
  totalCount: number;
  proposals: Proposal[];
}
⋮----
export function listPendingProposals(stashDir?: string): Proposal[]
⋮----
export function akmProposalList(options: ProposalListOptions =
⋮----
export interface ProposalShowOptions {
  stashDir?: string;
  queue?: string;
  config?: AkmConfig;
  id: string;
}
⋮----
export interface ProposalShowResult {
  schemaVersion: 1;
  proposal: Proposal;
  validation: { ok: boolean; findings: { kind: string; message: string }[] };
}
⋮----
export function akmProposalShow(options: ProposalShowOptions): ProposalShowResult
⋮----
export interface ProposalAcceptOptions {
  stashDir?: string;
  id: string;
  queue?: string;
  target?: string;

  config?: AkmConfig;

  ctx?: ProposalsContext;

  gateDecision?: Omit<ProposalGateDecision, "decidedAt"> & { decidedAt?: string };

  commitCollector?: AcceptCommitCollector;
}
⋮----
export interface ProposalAcceptResult {
  schemaVersion: 1;
  ok: true;
  id: string;
  ref: string;
  assetPath: string;
  proposal: Proposal;
}
⋮----
export async function akmProposalAccept(options: ProposalAcceptOptions): Promise<ProposalAcceptResult>
⋮----
export interface ProposalAcceptFailure {
  schemaVersion: 1;
  ok: false;
  id: string;
  error: string;
}
⋮----
export async function akmProposalAcceptMany(
  options: Omit<ProposalAcceptOptions, "id" | "commitCollector"> & { ids: readonly string[] },
): Promise<Array<ProposalAcceptResult | ProposalAcceptFailure>>
⋮----
export interface ProposalRejectOptions {
  stashDir?: string;
  id: string;
  queue?: string;
  reason?: string;
  ctx?: ProposalsContext;
  config?: AkmConfig;

  gateDecision?: Omit<ProposalGateDecision, "decidedAt"> & { decidedAt?: string };
}
⋮----
export interface ProposalRejectResult {
  schemaVersion: 1;
  ok: true;
  id: string;
  ref: string;
  reason?: string;
  proposal: Proposal;
}
⋮----
export async function akmProposalReject(options: ProposalRejectOptions): Promise<ProposalRejectResult>
⋮----
export interface ProposalReopenOptions {
  stashDir?: string;

  ids: readonly string[];
  queue?: string;

  reason?: string;
  ctx?: ProposalsContext;
  config?: AkmConfig;
}
⋮----
export interface ProposalReopenResult {
  schemaVersion: 1;
  ok: true;
  id: string;
  ref: string;
  reason?: string;
  proposal: Proposal;
}
⋮----
export async function akmProposalReopen(options: ProposalReopenOptions): Promise<ProposalReopenResult[]>
⋮----
export interface ProposalDiffOptions {
  stashDir?: string;
  id: string;
  queue?: string;
  target?: string;
  config?: AkmConfig;
}
⋮----
export interface ProposalDiffResult {
  schemaVersion: 1;
  id: string;
  ref: string;
  isNew: boolean;
  unified: string;
  targetPath?: string;

  op?: "delete";







  retirement?: Pick<
    RetirementMetadata,
    "retiredRef" | "successorRef" | "judgeLabel" | "judgeReason" | "cosine" | "continuityRisk"
  >;

  note?: string;
}
⋮----
function retireDiffFields(
  retirement: RetirementMetadata | undefined,
): Pick<ProposalDiffResult, "op" | "retirement" | "note">
⋮----
export function akmProposalDiff(options: ProposalDiffOptions): ProposalDiffResult
⋮----
export interface ProposalRevertOptions {
  stashDir?: string;

  id: string;

  queue?: string;

  target?: string;

  config?: AkmConfig;

  ctx?: ProposalsContext;
}
⋮----
export interface ProposalRevertResult {
  schemaVersion: 1;
  ok: true;
  id: string;
  ref: string;
  assetPath: string;
  proposal: Proposal;
}
⋮----
export async function akmProposalRevert(options: ProposalRevertOptions): Promise<ProposalRevertResult>
⋮----
export interface BulkAdjudicateOptions {
  stashDir?: string;
  queue?: string;

  action: "accept" | "reject";

  generator: string;

  maxDiffLines?: number;

  olderThanMs?: number;

  dryRun?: boolean;

  target?: string;

  reason?: string;
  config?: AkmConfig;
}
⋮----
export interface BulkAdjudicateResult {

  count: number;

  results: Array<
    ProposalAcceptResult | ProposalRejectResult | { id: string; ref: string; source: string; dryRun: true }
  >;






  skippedForContinuityRisk: number;
}
⋮----
function retiredTargetLineCount(
  stashDir: string,
  config: AkmConfig,
  proposal: Proposal,
  queueTarget?: ResolvedWriteTarget,
): number
⋮----
export async function bulkAdjudicateProposals(options: BulkAdjudicateOptions): Promise<BulkAdjudicateResult>
⋮----
const isContinuityExcluded = (p: Proposal): boolean
`````

## File: src/commands/proposal/propose-cli.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { defineCommand } from "citty";
import { getStringArg, parsePositiveIntFlag } from "../../cli/parse-args";
import { RETIRED_ENGINE_ARG, SELECTION_ARGS, selectionFromArgs } from "../../cli/selection";
import { EXIT_CODES, GLOBAL_OUTPUT_ARGS, output, runWithJsonErrors } from "../../cli/shared";
import { assertFlatAssetName, combineCreatePath, normalizeCreateSubPath } from "../../core/asset/asset-create";
import { UsageError } from "../../core/errors";
import { akmPropose } from "./propose";
⋮----
async run(
`````

## File: src/commands/proposal/propose.ts
`````typescript
import type { SelectionFlags } from "../../cli/selection";
import { placementTypes, stashDirFor } from "../../core/asset/asset-placement";
import { parseRefInput } from "../../core/asset/resolve-ref";
import { resolveStashDir } from "../../core/common";
import type { AkmConfig } from "../../core/config/config";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { generatedContentRejection } from "../../core/content-safety";
import { UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { resolveStandardsContext } from "../../core/standards/resolve-standards-context";
import { resolveWriteTarget } from "../../core/write-source";
import type { LoweringNotice } from "../../execution/resolved-request";
import { deriveEntryProvenance } from "../../indexer/installations";
import type { AgentFailureReason, AgentRunResult } from "../../integrations/agent";
import { buildExecution, currentLayer, resolveExecution, shippedAlias } from "../../integrations/agent/execution";
import {
  type AgentProposalPayload,
  buildProposePrompt,
  PROPOSAL_JSON_SCHEMA,
  validateProposalPayload,
} from "../../integrations/agent/prompts";
import { runExecution } from "../../integrations/agent/runner-dispatch";
import { isRefused, jsonParser, type StructuredLoopResult, structuredLoop } from "../../llm/structured";
import { outcomeOf } from "../../llm/structured-call";
import { baseFailureFields, enoentHintMessage, isEnoentFailure } from "../agent/agent-support";
import {
  type CreateProposalInput,
  createProposal,
  type Proposal,
  type ProposalsContext,
  resolveProposalQueueTarget,
} from "./repository";
⋮----
export interface AkmProposeOptions {
  type: string;
  name: string;
  task: string;

  selection?: SelectionFlags;
  timeoutMs?: number;

  bundle?: string;
  stashDir?: string;
  agentConfig?: AkmConfig;
  ctx?: ProposalsContext;

  onDispatchReady?: () => void;
}
⋮----
export interface AkmProposeFailure {
  schemaVersion: 2;
  ok: false;
  reason: AgentFailureReason;
  error: string;
  type: string;
  name: string;
  engine: string;
  exitCode: number | null;
  stdout?: string;
  stderr?: string;
  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export interface AkmProposeSuccess {
  schemaVersion: 2;
  ok: true;
  proposal: Proposal;
  ref: string;
  engine: string;
  durationMs: number;
  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export type AkmProposeResult = AkmProposeSuccess | AkmProposeFailure;
⋮----
function failureEnvelope(
  result: AgentRunResult,
  type: string,
  name: string,
  engine: string,
  notices: readonly Readonly<LoweringNotice>[],
  fallbackReason: AgentFailureReason = "non_zero_exit",
): AkmProposeFailure
⋮----
function noticeFields(notices: readonly Readonly<LoweringNotice>[]):
⋮----
interface ProposalDispatchResult {

  result: AgentRunResult;

  reply: StructuredLoopResult<AgentProposalPayload>;

  durationMs: number;
  engineName: string;
  engineBin?: string;
  notices: readonly Readonly<LoweringNotice>[];
}
⋮----
async function dispatchProposalPrompt(
  prompt: string,
  config: AkmConfig,
  options: AkmProposeOptions,
  onDispatchReady: () => void,
): Promise<ProposalDispatchResult>
⋮----
const corrected = (content: string)
⋮----
function proposeItemRef(bundleId: string, type: string, name: string): string
⋮----
function emitProposeInvoked(bundleId: string, options: AkmProposeOptions): void
⋮----
export async function akmPropose(options: AkmProposeOptions): Promise<AkmProposeResult>
`````

## File: src/commands/proposal/repository.ts
`````typescript
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse as parseYaml } from "yaml";
import { ensureAkmMarkdownType } from "../../core/asset/akm-markdown";
import { assetPathForName, placementTypes, stashDirFor } from "../../core/asset/asset-placement";
import { isBundleSlug, parseBundleRef } from "../../core/asset/asset-ref";
import { assembleAsset, serializeFrontmatter } from "../../core/asset/asset-serialize";
import {
  carryForwardBookkeepingFrontmatter,
  parseFrontmatter,
  replaceFrontmatterBlocks,
} from "../../core/asset/frontmatter";
import { type AssetRef, conceptIdFromTypeName, parseRefInput } from "../../core/asset/resolve-ref";
import { type AkmConfig, loadConfig } from "../../core/config/config";
import { ConfigError, NotFoundError, rethrowIfTestIsolationError, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { type FileChange, proposalContent } from "../../core/file-change";
import type { MemoryPruneCandidate } from "../../core/improve-types";
import { canonicalBundleIdForTarget, resolveBundleWriteTarget } from "../../core/mutation-target";
import { getStateDbPath, withImmediateTransaction, withStateDb } from "../../core/state-db";
import { warn } from "../../core/warn";
import { recordWrittenPath } from "../../core/write-provenance";
import {
  assertAkmAssetWrite,
  commitAcceptedPaths,
  commitWriteTargetBoundary,
  prepareWriteTargetForMutation,
  type ResolvedWriteTarget,
  resolveWriteTarget,
  type WriteTargetSource,
} from "../../core/write-source";
import { withAssetMutationLease } from "../../indexer/index-writer-lock";
import { indexWrittenAssets } from "../../indexer/index-written-assets";
import { deriveInstallations } from "../../indexer/installations";
import { sameScope, scopeFromFrontmatter } from "../../indexer/passes/metadata";
import { resolveSourceEntries } from "../../indexer/search/search-source";
import type { Database } from "../../storage/database";
import { insertEventOnce } from "../../storage/repositories/events-repository";
import {
  CONSOLIDATE_LEDGER_SOURCE,
  forgetImproveLedgerDecision,
  type ImproveLedgerOutcome,
  PAIR_PASS_LEDGER_SOURCE,
  recordImproveLedger,
  recordImproveLedgerDecision,
  reopenImproveLedgerDecision,
} from "../../storage/repositories/improve-ledger-repository";
import {
  getStateProposal,
  listStateProposalIdsByPrefix,
  listStateProposals,
  upsertProposal,
} from "../../storage/repositories/proposals-repository";
import { openSqliteReadSnapshot } from "../../storage/sqlite-read-snapshot";
import { pkgVersion } from "../../version";
import { contentHash } from "../improve/content-hash";
import { writeSupersededEdge } from "../improve/memory/memory-belief";
import { archiveCleanupCandidate, derivedTwinPath } from "../improve/memory/memory-improve";
import { runBaseChecks } from "../lint/base-linter";
import type { LintIssue, LintIssueType } from "../lint/types";
import { formatNewAssetDiff, formatRetireDiff, formatUnifiedDiff } from "./diff-format";
import {
  ASSET_MISSING_GATE_REASON,
  type EligibilitySource,
  EXPIRED_GATE_REASON,
  isAutomatedProposalSource,
  isRetireProposal,
  isValidProposalSource,
  PROPOSAL_SOURCES,
  type Proposal,
  type ProposalFeedbackFix,
  type ProposalGateDecision,
  type ProposalPayload,
  type ProposalSource,
  type ProposalStatus,
  proposalWaitingSince,
  type RetireAcceptIntent,
  type RetirementMetadata,
  STALE_TARGET_GATE_REASON,
} from "./proposal-types";
import {
  canonicalOnlyProposalValidators,
  hasCanonicalProposalValidator,
  runProposalValidators,
} from "./validators/proposal-validators";
import { repairProposalContent, validateProposal } from "./validators/proposals";
⋮----
type GateDecisionInput = Omit<ProposalGateDecision, "decidedAt"> & { decidedAt?: string };
⋮----
type ProposalRejectionReason =
  | "invalid_ref"
  | "unknown_type"
  | "empty_content"
  | "missing_description"
  | "invalid_canonical_structure"
  | "cross_bundle";
⋮----
export interface OrphanPurgeResult {
  checked: number;
  rejected: number;
  durationMs: number;
  byType: Record<string, number>;
  orphans: Array<{ id: string; ref: string; reason: string }>;
}
⋮----
export interface ExpireStaleResult {
  checked: number;
  expired: number;
  durationMs: number;
  retentionDays: number;
  expiredProposals: Array<{ id: string; ref: string; ageDays: number }>;
}
⋮----
function withProposalContent(p: Proposal, content: string): Proposal
⋮----
export interface ProposalsContext {

  now?: () => number;

  randomUUID?: () => string;

  dbPath?: string;





  db?: Database;

  actorId?: () => string;
}
⋮----
export interface CreateProposalInput {
  ref: string;

  target?: { source: string; root: string };






  itemRef?: string;

  source: ProposalSource | string;

  sourceRun?: string;
  payload: ProposalPayload;





  attemptedRefs?: readonly string[];

  confidence?: number;

  eligibilitySource?: EligibilitySource;





  promotionSource?: string;

  promotionSourceHash?: string;

  feedback?: ProposalFeedbackFix;
}
⋮----
function nowIso(ctx?: ProposalsContext): string
⋮----
function withProposalsDb<T>(ctx: ProposalsContext | undefined, fn: (db: Database) => T): T
⋮----
interface ProposalRefIdentity {
  conceptId: string;
  bundle?: string;
}
⋮----
function isRetiredProposalConceptId(conceptId: string): boolean
⋮----
function proposalRefIdentity(ref: string): ProposalRefIdentity | undefined
⋮----
function filterRefIdentity(ref: string): ProposalRefIdentity
⋮----
function proposalMatchesRef(proposalRef: string, filter: ProposalRefIdentity): boolean
⋮----
function proposalDurableRef(parsedRef: AssetRef, target: NonNullable<CreateProposalInput["target"]>): string
⋮----
function resolveCreateProposalTarget(
  stashDir: string,
  explicit: CreateProposalInput["target"] | undefined,
  bundle: string | undefined,
): NonNullable<CreateProposalInput["target"]>
⋮----
export function resolveProposalQueueTarget(
  stashDir: string,
  config: AkmConfig = loadConfig(),
): NonNullable<CreateProposalInput["target"]>
⋮----
function otherOwningBundle(itemRef: string, target:
⋮----
export function createProposal(stashDir: string, input: CreateProposalInput, ctx?: ProposalsContext): Proposal
⋮----
const rejectProposal = (reason: ProposalRejectionReason, message: string): never =>
⋮----
export interface CreateRetireProposalInput {

  ref: string;

  source: ProposalSource | string;
  sourceRun?: string;
  target?: { source: string; root: string };

  confidence?: number;
  retirement: RetirementMetadata;
}
⋮----
export function createRetireProposal(
  stashDir: string,
  input: CreateRetireProposalInput,
  ctx?: ProposalsContext,
): Proposal
⋮----
type ListProposalsOptions = { includeArchive?: boolean; status?: ProposalStatus; ref?: string; type?: string };
⋮----
function queryProposals(db: Database, stashDir: string, options: ListProposalsOptions): Proposal[]
⋮----
export function listProposals(
  stashDir: string,
  options: ListProposalsOptions = {},
  ctx?: ProposalsContext,
): Proposal[]
⋮----
export function listProposalsReadOnly(
  stashDir: string,
  options: ListProposalsOptions = {},
  ctx?: ProposalsContext,
): Proposal[]
⋮----
export function getProposal(stashDir: string, id: string, ctx?: ProposalsContext): Proposal
⋮----
function requireProposal(db: Database, stashDir: string, id: string): Proposal
⋮----
export function resolveProposalId(stashDir: string, idOrRef: string, ctx?: ProposalsContext): Proposal
⋮----
export function resolveProposalIdIn(db: Database, stashDir: string, idOrRef: string): Proposal
⋮----
const newest = (status?: string): Proposal | undefined
⋮----
function ledgerOutcomeForDecision(
  status: "accepted" | "rejected" | "reverted",
  gateDecision?: Pick<ProposalGateDecision, "outcome" | "reason">,
): ImproveLedgerOutcome
⋮----
function decisionLedgerSubject(proposal: Proposal):
⋮----
export function archiveProposal(
  stashDir: string,
  id: string,
  status: "accepted" | "rejected",
  reason: string | undefined,
  ctx?: ProposalsContext,
  gateDecision?: GateDecisionInput,
): Proposal
⋮----
export function recordGateDecision(
  stashDir: string,
  id: string,
  decision: GateDecisionInput,
  ctx?: ProposalsContext,
): Proposal | undefined
⋮----
export function purgeOrphanProposals(
  stashDir: string,
  sourceDirs: string[],
  ctx?: ProposalsContext,
): OrphanPurgeResult
⋮----
export function expireStaleProposals(stashDir: string, config: AkmConfig, ctx?: ProposalsContext): ExpireStaleResult
⋮----
export function proposalContentHash(proposal: Proposal): string
⋮----
function persistProposalDecision(
  stashDir: string,
  proposal: Proposal,
  decision:
    | {
        operation: "accept";
        target: ResolvedWriteTarget;
        assetPath: string;
        content: string;
        existed: boolean;
        backupContent?: string;
        eventMetadata?: Record<string, unknown>;
        gateDecision?: GateDecisionInput;
        decidedAt: string;
      }
    | { operation: "revert"; assetPath: string; decidedAt: string },
  ctx?: ProposalsContext,
): Proposal
⋮----
export function rejectProposalDurably(
  stashDir: string,
  proposalId: string,
  reason?: string,
  ctx?: ProposalsContext,
  gateDecision?: GateDecisionInput,
): Proposal
⋮----
function writeProposalAssetFile(assetPath: string, content: string): void
⋮----
async function indexWrittenProposalAsset(target: ResolvedWriteTarget, assetPath: string): Promise<void>
⋮----
export interface PromoteResult {
  proposal: Proposal;
  assetPath: string;
  ref: string;
}
⋮----
function resolveRecordedProposalTarget(
  config: AkmConfig,
  proposalId: string,
  binding: { source: string; root: string },
  explicitTarget?: string,
): ResolvedWriteTarget
⋮----
function resolveProposalWriteTarget(
  config: AkmConfig,
  proposal: Proposal,
  explicitTarget?: string,
  queueTarget?: ResolvedWriteTarget,
): ResolvedWriteTarget
⋮----
const named = (target: ResolvedWriteTarget): ResolvedWriteTarget => (
⋮----
function resolveActorId(ctx?: ProposalsContext): string
⋮----
function isPlainRecord(value: unknown): value is Record<string, unknown>
⋮----
function stampProposalProvenance(
  content: string,
  proposal: Proposal,
  gateDecision: GateDecisionInput | undefined,
  ctx: ProposalsContext | undefined,
  nowIsoStr: string,
): string
⋮----
const human = () => `human:$
⋮----
export async function promoteProposal(
  stashDir: string,
  config: AkmConfig,
  id: string,
  options: {
    target?: string;
    queueTarget?: ResolvedWriteTarget;
    eventMetadata?: Record<string, unknown>;
    gateDecision?: GateDecisionInput;

    commitCollector?: AcceptCommitCollector;
  } = {},
  ctx?: ProposalsContext,
): Promise<PromoteResult>
⋮----
function promotionLintBlockers(
  raw: string,
  assetPath: string,
  targetRoot: string,
  refType: string,
  config: AkmConfig,
): LintIssue[]
⋮----
export interface ProposalPromotionPreflight {
  proposal: Proposal;
  repairedContent: string;
  ref: AssetRef;
  target: ResolvedWriteTarget;
  assetPath: string;
  stampedContent: string;
}
⋮----
export function preflightProposalPromotion(
  config: AkmConfig,
  proposal: Proposal,
  options: { target?: string; queueTarget?: ResolvedWriteTarget; gateDecision?: GateDecisionInput } = {},
  ctx?: ProposalsContext,
): ProposalPromotionPreflight
⋮----
export function readFreshProposalTarget(
  proposal: Proposal,
  assetPath: string,
  stampedContent: string,
): Buffer | undefined
⋮----
function acceptedAssetPath(proposal: Proposal, target: ResolvedWriteTarget, ref: AssetRef): string
⋮----
function requireAcceptedTarget(proposal: Proposal): NonNullable<Proposal["acceptedTarget"]>
⋮----
function acceptCommitMessage(proposal: Proposal): string
⋮----
export type AcceptCommitCollector = Array<{ target: ResolvedWriteTarget; proposal: Proposal; paths: string[] }>;
⋮----
function commitAccept(
  collector: AcceptCommitCollector | undefined,
  target: ResolvedWriteTarget,
  proposal: Proposal,
  paths: string[],
): void
⋮----
export function commitCollectedAccepts(collector: AcceptCommitCollector, label: string): void
⋮----
function retirePromotionSource(mutationTarget: ResolvedWriteTarget, accepted: Proposal, paths: string[]): void
⋮----
async function promoteProposalWithLease(
  stashDir: string,
  config: AkmConfig,
  id: string,
  options: {
    target?: string;
    queueTarget?: ResolvedWriteTarget;
    eventMetadata?: Record<string, unknown>;
    gateDecision?: GateDecisionInput;

    commitCollector?: AcceptCommitCollector;
  },
  ctx?: ProposalsContext,
): Promise<PromoteResult>
⋮----
function findRetireArchiveDirsByProposalId(stashRoot: string, proposalId: string): string[] | undefined
⋮----
function alreadyArchivedOriginalPaths(stashRoot: string, dirs: string[]): Set<string>
⋮----
function recordRetireAcceptIntent(
  stashDir: string,
  proposalId: string,
  intent: RetireAcceptIntent,
  ctx?: ProposalsContext,
): Proposal
⋮----
function persistRetireAcceptance(
  stashDir: string,
  proposal: Proposal,
  info: {
    targetName: string;
    targetRoot: string;
    assetPath: string;
    contentHash: string;
    archiveDirs: string[];
    backupContent: string;
    gateDecision?: GateDecisionInput;
    eventMetadata?: Record<string, unknown>;
  },
  ctx?: ProposalsContext,
): Proposal
⋮----
function assertRetirementStillFresh(
  proposalId: string,
  proposalRef: string,
  retirement: RetirementMetadata,
  targetSource: WriteTargetSource,
  retiredCurrentBytes: Buffer,
): void
⋮----
/**
 * Accept a `retire` proposal (0.9.17-alpha.9, the consolidate pair pass): no
 * new content is written. It is a
 * three-phase, resume-safe sequence: (1) record intent — `backupContent`
 * and the exact files about to move — on the still-pending proposal; (2)
 * move each file into the recoverable cleanup archive
 * (`archiveCleanupCandidate`), skipping any the tombstone scan shows a prior,
 * crashed attempt already moved; (3) finalize via
 * {@link persistRetireAcceptance}. A `supersedes` judgement writes the
 * supersede edge on the retired (older) side AFTER intent is recorded —
 * recording it first means a crash before the edge
 * write can never cause a resume to re-read the file and capture its own
 * edge into `backupContent`), so the archived copy still preserves it. A
 * target already gone with no recorded intent (raced with something else)
 * fails cleanly with a `UsageError`, the same clean-error idiom every other
 * staleness check in this file uses — never an unhandled throw.
 */
async function retireProposalWithLease(
  stashDir: string,
  config: AkmConfig,
  proposal: Proposal,
  options: {
    target?: string;
    queueTarget?: ResolvedWriteTarget;
    eventMetadata?: Record<string, unknown>;
    gateDecision?: GateDecisionInput;

    commitCollector?: AcceptCommitCollector;
  },
  ctx?: ProposalsContext,
): Promise<PromoteResult>
⋮----
export interface RevertResult {
  proposal: Proposal;
  assetPath: string;
  ref: string;
}
⋮----
export async function revertProposal(
  stashDir: string,
  config: AkmConfig,
  id: string,
  options: { target?: string; queueTarget?: ResolvedWriteTarget } = {},
  ctx?: ProposalsContext,
): Promise<RevertResult>
⋮----
async function unretireProposalWithLease(
  stashDir: string,
  config: AkmConfig,
  proposal: Proposal,
  options: { target?: string; queueTarget?: ResolvedWriteTarget },
  ctx?: ProposalsContext,
): Promise<RevertResult>
⋮----
interface PendingRestore {
    dirAbs: string;
    auditPath: string;
    originalAbs: string;
    archivedAbs: string;

    alreadyDone: boolean;

    fromBackup: boolean;
  }
⋮----
async function revertProposalWithLease(
  stashDir: string,
  config: AkmConfig,
  id: string,
  options: { target?: string; queueTarget?: ResolvedWriteTarget },
  ctx?: ProposalsContext,
): Promise<RevertResult>
⋮----
export interface ReopenOptions {
  queueTarget?: ResolvedWriteTarget;

  reason?: string;
}
⋮----
function staleRefusal(check: () => void): string | undefined
⋮----
function reopenRefusal(config: AkmConfig, proposal: Proposal, queueTarget?: ResolvedWriteTarget): string | undefined
⋮----
function retireHeldRefs(proposal: Proposal): string[]
⋮----
function retireConflict(proposal: Proposal, held: Map<string, string>): string | undefined
⋮----
export function reopenProposals(
  stashDir: string,
  config: AkmConfig,
  ids: readonly string[],
  options: ReopenOptions = {},
  ctx?: ProposalsContext,
): Proposal[]
⋮----
export interface ProposalDiff {

  existing: string | null;
  proposed: string;

  unified: string;
  isNew: boolean;
  targetPath?: string;
}
⋮----
export function diffProposal(
  stashDir: string,
  config: AkmConfig,
  id: string,
  options: { target?: string; queueTarget?: ResolvedWriteTarget } = {},
  ctx?: ProposalsContext,
): ProposalDiff
⋮----
export function diffLoadedProposal(
  config: AkmConfig,
  proposal: Proposal,
  options: { target?: string; queueTarget?: ResolvedWriteTarget } = {},
): ProposalDiff
⋮----
function resolveAssetFilePathSafe(source: WriteTargetSource, ref: AssetRef): string | undefined
`````

## File: src/commands/read/curate.ts
`````typescript
import { parseBundleRef } from "../../core/asset/asset-ref";
import { typeNameFromConceptId } from "../../core/asset/resolve-ref";
import { loadConfig } from "../../core/config/config";
import { rethrowIfTestIsolationError, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { nonTaskInput } from "../../core/non-task-input";
import { redactCredentialPatterns } from "../../core/redaction";
import { withStateDbTelemetry } from "../../core/state-db";
import { matchBeliefFilter, searchHitContent } from "../../indexer/search/db-search";
import {
  type AttributionProjection,
  copySearchHitAttribution,
  getSearchHitAttribution,
  usageEventAttributionMetadata,
} from "../../indexer/search/search-attribution";
import { insertUsageEvent, type UsageEventSource } from "../../indexer/usage/usage-events";
import { estimateTokenCount } from "../../llm/embedders/remote";
import { rerankDocuments } from "../../llm/rerank-client";
import { truncateDescription } from "../../output/shapes/helpers";
import type {
  RecallOptions,
  RegistrySearchResultHit,
  SearchExecutionMode,
  SearchResponse,
  ShowResponse,
  SourceSearchHit,
} from "../../sources/types";
import { TELEMETRY_BUSY_TIMEOUT_MS, withIndexDb } from "../../storage/repositories/index-db";
import {
  findEntryIdByRef,
  getEntryIdByFilePath,
  getItemRefById,
} from "../../storage/repositories/index-entries-repository";
import { akmSearch, normalizeScopeFilters, parseBeliefFilterMode, parseSearchSource } from "./search";
import { akmShowUnified } from "./show";
⋮----
export type CurateSupportRef = {
  ref: string;
  type?: string;
  reason: string;
  beliefState?: string;
};
⋮----
export type CuratedStashItem = {
  source: "local";
  type: string;
  name: string;
  ref: string;
  path: string;
  editable: boolean;
  editHint?: string;
  description?: string;
  preview?: string;
  keys?: string[];
  parameters?: string[];
  run?: string;
  supportRefs?: CurateSupportRef[];
  followUp: string;
  reason: string;
  score?: number;
  beliefState?: string;
};
⋮----
export type CuratedRegistryItem = {
  source: "registry";
  type: "registry";
  name: string;
  id: string;
  description?: string;
  followUp: string;
  reason: string;
  score?: number;
};
⋮----
export type CuratedItem = CuratedStashItem | CuratedRegistryItem;
⋮----
export interface CurateResponse {
  query: string;
  summary: string;
  items: CuratedItem[];
  warnings?: string[];
  searchMode?: SearchExecutionMode;
  tip?: string;
}
⋮----
export interface CurateOptions extends RecallOptions {
  query: string;
  type?: string;
  limit?: number;
  source?: ReturnType<typeof parseSearchSource>;




  searchResponse?: SearchResponse;





  eventSource?: UsageEventSource;

  attributionProjection?: AttributionProjection;








  skipLogging?: boolean;
}
⋮----
function logCurateEvent(
  rawQuery: string,
  result: CurateResponse,
  eventSource: UsageEventSource = "user",
  attributionProjection: AttributionProjection = "full",
): void
⋮----
export async function akmCurate(options: CurateOptions): Promise<CurateResponse>
⋮----
export async function curateSearchResults(
  query: string,
  result: SearchResponse,
  limit: number,
  selectedType?: string,
  eventSource?: UsageEventSource,
  recall?: RecallOptions,
): Promise<CurateResponse>
⋮----
export interface PackedCurateItem {
  ref: string;
  tokens: number;
  content: string;
  beliefState?: string;
  reason?: string;
}
⋮----
export interface CuratePackResult {
  query: string;
  budget: number;
  tokens: number;
  items: PackedCurateItem[];
}
⋮----
export async function packCuratedHits(result: CurateResponse, budgetTokens: number): Promise<CuratePackResult>
⋮----
function evidenceRef(item:
⋮----
async function enrichCuratedStashHit(
  query: string,
  hit: SourceSearchHit,
  selectedRefs: Set<string>,
  eventSource?: UsageEventSource,
  recall?: RecallOptions,
): Promise<CuratedStashItem | undefined>
⋮----
function buildCuratedRegistryItem(query: string, hit: RegistrySearchResultHit): CuratedRegistryItem
⋮----
function firstNonEmpty(values: Array<string | undefined>): string | undefined
⋮----
function buildCuratedPreview(shown: ShowResponse | undefined, hit: SourceSearchHit): string | undefined
⋮----
function buildCuratedReason(query: string, type: string): string
⋮----
function buildCurateSummary(query: string, items: CuratedItem[]): string
⋮----
function rerankTopN(config: ReturnType<typeof loadConfig>): number
⋮----
async function maybeRerankCuratedStashHits(query: string, hits: SourceSearchHit[]): Promise<SourceSearchHit[]>
⋮----
function rerankDocumentTexts(hits: SourceSearchHit[]): string[]
⋮----
async function buildCurateSupportRefs(
  links: ShowResponse["links"],
  selectedRefs: Set<string>,
  ownerRef: string,
  recall?: RecallOptions,
): Promise<CurateSupportRef[]>
⋮----
function supportRefType(ref: string): string | undefined
`````

## File: src/commands/read/knowledge.ts
`````typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { parse as yamlParse } from "yaml";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { normalizeAkmMarkdown } from "../../core/asset/akm-markdown";
import { assertFlatAssetName, combineCreatePath, normalizeCreateSubPath } from "../../core/asset/asset-create";
import { assetPathForName, stashDirFor } from "../../core/asset/asset-placement";
import { assembleAsset } from "../../core/asset/asset-serialize";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { type AssetRef, conceptIdFromTypeName, parseRefInput } from "../../core/asset/resolve-ref";
import { isHttpUrl, isWithin, resolveStashDir, tryReadStdinText } from "../../core/common";
import { loadConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { resolveBundleWriteTarget, resolveMutationTarget } from "../../core/mutation-target";
import { resolveStashStandards } from "../../core/standards/resolve-stash-standards";
import { warn } from "../../core/warn";
import {
  commitWriteTargetBoundary,
  formatRefForMessage,
  type ResolvedWriteTarget,
  recordWriteTargetPath,
  resolveWriteTarget,
  writeAssetToSource,
} from "../../core/write-source";
import { withAssetMutationLease } from "../../indexer/index-writer-lock";
import { indexWrittenAssets } from "../../indexer/index-written-assets";
import { deriveInstallations, slugForPath } from "../../indexer/installations";
import { resolveSourceEntries, type SearchSource } from "../../indexer/search/search-source";
import { storeSecretResolver } from "../../sources/snapshot-fetchers/secret-seam";
import {
  fetchWebsiteMarkdownSnapshot,
  shouldAllowPrivateWebsiteUrlForTests,
} from "../../sources/snapshot-fetchers/website-ingest";
import { writeSupersededEdge } from "../improve/memory/memory-belief";
import { refToRelPath, resolveRefPathInStash } from "../lint/base-linter";
⋮----
export function normalizeMarkdownAssetName(name: string | undefined, fallback: string): string
⋮----
// `--path`/`--name` create semantics are shared across all asset-creating
// commands; re-exported here so existing `./knowledge` importers keep working.
⋮----
function slugifyAssetName(value: string, fallbackPrefix: string): string
⋮----
/**
 * Derive a slug-style asset name from `content` and an optional `preferred`
 * hint (e.g. a URL-derived page title or the source filename stem).
 */
export function inferAssetName(content: string, fallbackPrefix: string, preferred?: string): string
⋮----
// ── Content reading ──────────────────────────────────────────────────────────
⋮----
/**
 * Read knowledge content from a local file path or stdin (`"-"`).
 *
 * Returns the raw text and an optional `preferredName` derived from the
 * source filename stem (used as a slug fallback when no `--name` flag was
 * supplied).
 */
export function readKnowledgeContent(source: string):
⋮----
export async function readKnowledgeInput(
  source: string,
  options?: { stashDir?: string; allowPrivateHosts?: boolean },
): Promise<
⋮----
interface ParsedWriteRef {





  ref: string;

  type: string;

  name: string;

  origin?: string;
}
⋮----
function parseWriteRef(raw: string, flag: "--xref" | "--supersedes"): ParsedWriteRef
⋮----
function parseWriteRefs(rawRefs: string[], flag: "--xref" | "--supersedes"): ParsedWriteRef[]
⋮----
interface WriteRefRoot {
  path: string;
  source?: SearchSource;
  bundleId: string;
  mutable: boolean;
}
⋮----
function resolveWriteRefRoots(target?: string, targetFlag?: string):
⋮----
function rootsForWriteRef(parsed: ParsedWriteRef, roots: WriteRefRoot[]): WriteRefRoot[]
⋮----
function canonicalWriteRef(parsed: ParsedWriteRef, bundleId: string): string
⋮----
function isFailOpenRefType(type: string, name: string): boolean
⋮----
function locateWriteRefInRoot(type: string, name: string, root: string): string | null
⋮----
function unresolvedRefsError(flag: "--xref" | "--supersedes", unresolved: ParsedWriteRef[]): UsageError
⋮----
export function resolveXrefsForWrite(rawXrefs: string[], target?: string, targetFlag?: string): string[]
⋮----
export function mergeXrefsIntoContent(content: string, xrefs: string[]): string
⋮----
function isParseableYamlMapping(frontmatter: string): boolean
⋮----
export interface SupersededTarget {




  ref: string;

  filePath: string;

  stashRoot: string;





  writable: boolean;

  reason?: string;
}
⋮----
export function resolveSupersedesWriteTarget(
  rawRefs: string[],
  target?: string,
  targetFlag?: string,
): string | undefined
⋮----
export function resolveSupersedesForWrite(rawRefs: string[], target?: string, targetFlag?: string): SupersededTarget[]
⋮----
interface MarkdownAssetWriteOptions {
  type: "knowledge" | "memory";
  content: string;
  name?: string;
  fallbackPrefix: string;
  preferredName?: string;
  force?: boolean;

  expectedContentHash?: string;

  target?: string;

  targetFlag?: string;





  path?: string;









  supersedes?: SupersededTarget[];
}
⋮----
interface MarkdownAssetWriteResult {
  ref: string;
  path: string;
  stashDir: string;
  hint?: string;
  unchanged?: true;
  superseded?: Array<{ ref: string; applied: boolean; reason?: string }>;
}
⋮----
export async function writeMarkdownAsset(options: MarkdownAssetWriteOptions): Promise<MarkdownAssetWriteResult>
`````

## File: src/commands/read/registry-search.ts
`````typescript
import { DEFAULT_CONFIG, type RegistryConfigEntry } from "../../core/config/config";
import {
  formatRegistryCredentialWarning,
  formatRegistryError,
  formatRegistryLabel,
  hasRegistryUrlCredentials,
  redactCredentialBearingUrls,
} from "../../core/registry-url";
import { warn } from "../../core/warn";
import { resolveRegistryProviderFactory } from "../../registry/factory";
import type { RegistrySearchHit, RegistrySearchResponse } from "../../registry/types";
⋮----
export interface RegistrySearchOptions {
  limit?: number;

  registries?: RegistryConfigEntry[];
}
⋮----
export async function searchRegistry(query: string, options?: RegistrySearchOptions): Promise<RegistrySearchResponse>
⋮----
// resolveRegistries() already filters by enabled; explicit registries are filtered here
⋮----
// Resolve and search all providers concurrently
⋮----
// Merge results grouped by provider
// Each provider batch is normalized to [0, 1] before merging so that raw
// scores from different providers (e.g. static-index can exceed 1.85 while
// skills-sh uses installs-relative scoring) are comparable in the merged list.
⋮----
export function resolveRegistries(configRegistries?: RegistryConfigEntry[]): RegistryConfigEntry[]
⋮----
function createProvider(entry: RegistryConfigEntry, warnings: string[])
⋮----
function normalizeScores(hits: Array<
⋮----
function clampLimit(limit: number | undefined): number
⋮----
function isCompleteHit(hit: RegistrySearchHit | undefined | null): hit is RegistrySearchHit
`````

## File: src/commands/read/remember-cli.ts
`````typescript
import { getStringArg } from "../../cli/parse-args";
import { defineJsonCommand, output, parseAllFlagValues } from "../../cli/shared";
import { UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { resolveUsageEventSource, type UsageEventSource } from "../../indexer/usage/usage-events";
import type { SourceSearchHit } from "../../sources/types";
import {
  buildMemoryFrontmatter,
  parseDuration,
  readMemoryContent,
  runAutoHeuristics,
  runLlmEnrich,
  synthesizeMemoryDescription,
} from "../remember";
import {
  assertFlatAssetName,
  inferAssetName,
  resolveSupersedesForWrite,
  resolveSupersedesWriteTarget,
  resolveXrefsForWrite,
  writeMarkdownAsset,
} from "./knowledge";
import { akmSearch } from "./search";
⋮----
async function fetchSimilarMemories(
  query: string,
  excludeRef: string,
  eventSource: UsageEventSource,
): Promise<Array<
⋮----
async run(
`````

## File: src/commands/read/search-cli.ts
`````typescript
import { getParsedInvocation } from "../../cli/invocation";
import { parsePositiveIntFlag } from "../../cli/parse-args";
import { defineJsonCommand, output, parseAllFlagValues } from "../../cli/shared";
import { parseBundleRef } from "../../core/asset/asset-ref";
import { parseMetaRef } from "../../core/asset/stash-meta";
import { UsageError } from "../../core/errors";
import { resolveUsageEventSource, type UsageEventSource } from "../../indexer/usage/usage-events";
import { getOutputMode, type OutputMode } from "../../output/context";
import { deliverRendered } from "../../output/html-render";
import type { FragmentContextMode, ShowDetailLevel } from "../../sources/types";
import { akmCurate, type CuratePackResult, type CurateResponse, packCuratedHits } from "./curate";
import { akmSearch, parseBeliefFilterMode, parseScopeFilterFlags, parseSearchSource } from "./search";
import { akmShowUnified } from "./show";
⋮----
async run(
⋮----
// Repeatable; citty exposes only the last `--filter` value, so read all
// occurrences directly from argv (same pattern as `--tag`).
⋮----
export async function runCurate(
  args: {
    query?: string;
    type?: string;
    limit?: string;
    from?: string;
    filters?: string[];
    belief?: string;

    eventSource?: UsageEventSource;
  },
  outputMode: Pick<OutputMode, "detail" | "shape">,
): Promise<CurateResponse>
⋮----
function formatCuratePackText(packed: CuratePackResult): string
⋮----
function rejectExtraShowPositionals(positionals: unknown, ref: string): void
⋮----
export function parseFragmentContextMode(raw: string | undefined): FragmentContextMode
`````

## File: src/commands/read/search.ts
`````typescript
import { type AkmConfig, getSources, loadConfig } from "../../core/config/config";
import { rethrowIfTestIsolationError, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { redactCredentialPatterns } from "../../core/redaction";
import { withStateDbTelemetry } from "../../core/state-db";
import type { StashEntryScope } from "../../indexer/passes/metadata";
import { resolveReadSources } from "../../indexer/read-preflight";
import { searchLocal } from "../../indexer/search/db-search";
import {
  type AttributionProjection,
  getSearchHitAttribution,
  usageEventAttributionMetadata,
} from "../../indexer/search/search-attribution";
import { insertUsageEvent, type UsageEventSource } from "../../indexer/usage/usage-events";
import type {
  AkmSearchType,
  BeliefFilterMode,
  RegistrySearchResultHit,
  SearchExecutionMode,
  SearchResponse,
  SearchSource,
  SourceSearchHit,
} from "../../sources/types";
import { TELEMETRY_BUSY_TIMEOUT_MS, withIndexDb } from "../../storage/repositories/index-db";
import { getEntryIdByFilePath, getItemRefById } from "../../storage/repositories/index-entries-repository";
import { searchRegistry } from "./registry-search";
⋮----
function duplicateConceptWarnings(hits: SourceSearchHit[], defaultBundle?: string): string[]
⋮----
interface SearchEventLoggingInput {
  skipLogging?: boolean;
  readOnly?: boolean;
  eventSource?: UsageEventSource;
  attributionProjection?: AttributionProjection;
}
⋮----
export async function akmSearch(input: {
  query: string;
  type?: AkmSearchType;
  limit?: number;
  source?: SearchSource | string;







  filters?: StashEntryScope;





  includeProposed?: boolean;







  belief?: BeliefFilterMode;





  includeSessions?: boolean;





  skipLogging?: boolean;





  readOnly?: boolean;





  eventSource?: UsageEventSource;

  attributionProjection?: AttributionProjection;
}): Promise<SearchResponse>
⋮----
// Primary stash directory — used for DB path lookups and as the default
// stash root. Empty when a pure registry search skipped local resolution
// entirely (safe: registry-only responses never read `stashDir`).
⋮----
// Expose the filtered source list to downstream search calls.
⋮----
function usageSearchMode(mode: SearchExecutionMode | undefined): "semantic" | "keyword"
⋮----
function maybeLogSearchEvent(
  input: SearchEventLoggingInput,
  query: string,
  response: SearchResponse,
  mode?: "semantic" | "keyword",
): void
⋮----
function resolveEntryIds(
  db: import("../../storage/database").Database,
  hits: SourceSearchHit[],
): Array<
⋮----
function logSearchEvent(
  rawQuery: string,
  response: SearchResponse,
  mode: "semantic" | "keyword" = "keyword",
  eventSource: UsageEventSource = "user",
  attributionProjection: AttributionProjection = "full",
): void
⋮----
function assertNamedSourceExists(config: AkmConfig, namedSourceName: string): void
⋮----
function normalizeLimit(limit?: number): number
⋮----
export function parseSearchSource(source: SearchSource | string | undefined): SearchSource | string
⋮----
export function parseBeliefFilterMode(value: string | undefined): BeliefFilterMode
⋮----
export function normalizeScopeFilters(raw: StashEntryScope | undefined): StashEntryScope | undefined
⋮----
export function parseScopeFilterFlags(values: string[], flagName = "--filter"): StashEntryScope | undefined
⋮----
export function entryMatchesScopeFilters(
  scope: StashEntryScope | undefined,
  filters: StashEntryScope | undefined,
): boolean
`````

## File: src/commands/read/show.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { recognizeMatch } from "../../core/adapter/recognize-match";
import { assetPathForName, stashDirFor } from "../../core/asset/asset-placement";
import { type BundleRef, makeBundleRef, parseBundleRef } from "../../core/asset/asset-ref";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { extractSection, markdownFragmentSlugs, markdownToc } from "../../core/asset/markdown";
import {
  buildMarkdownLeadContext,
  fragmentForSelector,
  MARKDOWN_FRAGMENT_CONTEXT_DEFAULT_MAX_CHARS,
} from "../../core/asset/markdown-fragments";
import { displayRef, displayRefForConceptId, typeNameFromConceptId } from "../../core/asset/resolve-ref";
import { META_DIR, type MetaRef, parseMetaRef, readMetaFile } from "../../core/asset/stash-meta";
import { asNonEmptyString, isContainedResolvedPath } from "../../core/common";
import { loadConfig } from "../../core/config/config";
import { NotFoundError, rethrowIfDataDirUnreadable, rethrowIfTestIsolationError, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { SCRIPT_EXTENSIONS } from "../../core/recognition-util";
import { presentationFor } from "../../core/type-presentation";
import { warn, warnOnce } from "../../core/warn";
import {
  lookupBundleRef,
  lookupBundleRefWithResolution,
  lookupBundleRefWithResolutionReadonly,
} from "../../indexer/indexer";
import {
  applyCuratedFrontmatter,
  applyProvenanceFrontmatter,
  type IndexDocument,
  projectMarkdownFragmentContent,
  type StashEntryScope,
} from "../../indexer/passes/metadata";
import { ensurePrimaryIndexForRead, resolveReadSources } from "../../indexer/read-preflight";
import { applyEntryFilters } from "../../indexer/search/db-search";
import {
  buildEditHint,
  findSourceForPath,
  isEditable,
  resolveSourceEntries,
  type SearchSource,
} from "../../indexer/search/search-source";
import { recentShowCount, recordShowUsage } from "../../indexer/usage/show-usage";
import type { UsageEventSource } from "../../indexer/usage/usage-events";
import {
  buildFileContext,
  buildRenderContext,
  type FileContext,
  getRenderer,
  type MatchResult,
} from "../../indexer/walk/file-context";
import { resolveSourcesForOrigin } from "../../registry/origin-resolve";
import type {
  FragmentContextMode,
  RecallOptions,
  ShowDetailLevel,
  ShowLinkGroup,
  ShowResponse,
} from "../../sources/types";
import { withIndexDb } from "../../storage/repositories/index-db";
import { getEntryById, getEntryIdByFilePath } from "../../storage/repositories/index-entries-repository";
import { getIndexedMarkdownFragment } from "../../storage/repositories/index-fts-repository";
import { readEntryLinks } from "../../storage/repositories/index-links-repository";
import { buildWorkflowAction } from "../../workflows/renderer";
⋮----
export async function akmShowUnified(input: {
  ref: string;
  detail?: ShowDetailLevel;

  contextMode?: FragmentContextMode;

  maxContextChars?: number;







  scope?: StashEntryScope;

  recall?: RecallOptions;





  eventSource?: UsageEventSource;

  skipLogging?: boolean;





  readOnly?: boolean;
}): Promise<ShowResponse>
⋮----
async function showStashMeta(metaRef: MetaRef, readOnly = false): Promise<ShowResponse>
⋮----
function hasAnyScopeKey(scope: StashEntryScope): boolean
⋮----
function validateFragmentContextRequest(input: {
  ref: string;
  contextMode?: FragmentContextMode;
  maxContextChars?: number;
}): void
⋮----
function enforceScopeOrThrow(filePath: string, ref: string, scope: StashEntryScope): void
⋮----
export async function showLocal(input: {
  ref: string;
  detail?: ShowDetailLevel;
  stashDir?: string;
  recall?: RecallOptions;
  contextMode?: FragmentContextMode;
  maxContextChars?: number;
  readOnly?: boolean;
}): Promise<ShowResponse>
⋮----
function showLinks(itemRef: string, defaultBundle: string | undefined, readOnly = false): Pick<ShowResponse, "links">
⋮----
function groupLinks(
  part: "outgoing" | "incoming" | "unresolved",
  rows: Array<{ kind: string; ref: string }>,
): Partial<Record<typeof part, Record<string, ShowLinkGroup>>>
⋮----
function warnSensitiveFragmentUnsupported(ref: BundleRef): void
⋮----
interface UnrecognizedScriptSource {
  extension: string;
  path: string;
  sourceRoot: string;
}
⋮----
function findUnrecognizedScriptSource(
  assetParts: ReturnType<typeof typeNameFromConceptId>,
  sources: readonly SearchSource[],
): UnrecognizedScriptSource | undefined
⋮----
export async function showByRef(ref: string): Promise<
⋮----
function throwIndexedPathNotFound(error: unknown, ref: string): never
⋮----
type IndexedEntry = NonNullable<Awaited<ReturnType<typeof lookupBundleRef>>>;
⋮----
function rendererForIndexedEntry(entry: IndexedEntry, _file: FileContext): string | null | undefined
⋮----
function indexedMatch(entry: IndexedEntry, renderer: string): MatchResult
⋮----
function buildIndexedProjectionResponse(
  entry: IndexedEntry,
  assetPath: string,
  fragment: string | undefined,
  indexedFragmentContent?: string,
): ShowResponse
⋮----
function applyMarkdownFragment(
  response: ShowResponse,
  raw: string,
  fragment: string,
  name: string,
  indexedFragmentContent?: string,
): void
⋮----
function applyMarkdownResponsePayload(response: ShowResponse, content: string): void
⋮----
function requireMarkdownSection(
  content: string,
  fragment: string,
  name: string,
):
⋮----
function buildBriefResponse(full: ShowResponse, assetPath?: string): ShowResponse
⋮----
function buildSummaryResponse(full: ShowResponse, assetPath?: string): ShowResponse
⋮----
function fragmentResponseProjection(full: ShowResponse): Partial<ShowResponse>
`````

## File: src/commands/sources/add-cli.ts
`````typescript
import { getStringArg, parsePositiveIntFlag } from "../../cli/parse-args";
import { defineJsonCommand, output } from "../../cli/shared";
import { VALID_ADAPTER_IDS } from "../../core/adapter/adapter-ids";
import { UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { warn } from "../../core/warn";
import { akmUpdate } from "./installed-stashes";
import { akmAdd } from "./source-add";
import { addStash, removeStash } from "./source-manage";
⋮----
export function buildWebsiteOptions(args: Record<string, unknown>):
⋮----
export function shouldWarnOnPlainHttp(ref: string): boolean
⋮----
async run(
`````

## File: src/commands/sources/bundle-cli.ts
`````typescript
import { defineGroupCommand, defineJsonCommand, output } from "../../cli/shared";
import { renameBundle } from "../../core/bundle-rename";
import { NotFoundError, TransientError, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { warn } from "../../core/warn";
import type { SourceKind } from "../../sources/types";
import { akmTasksSync } from "../tasks/tasks";
import { addCommand } from "./add-cli";
import { akmInit } from "./init";
import { akmListSources, akmRemove, akmUpdate } from "./installed-stashes";
⋮----
function parseKindFilter(raw: string | undefined): SourceKind[] | undefined
⋮----
async run(
⋮----
export function isSkippableBundleUpdateLock(error: unknown): error is TransientError
`````

## File: src/commands/sources/bundle-config-ops.ts
`````typescript
import path from "node:path";
import type { AkmConfig, BundleConfigEntry } from "../../core/config/config";
import { bundleKeyForContentRoot, primaryBundlePath } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { deriveBundleId } from "../../indexer/installations";
⋮----
export interface BundleInsertPosition {
  before?: string;
  after?: string;
}
⋮----
export function placeBundle(
  bundles: Record<string, BundleConfigEntry>,
  key: string,
  entry: BundleConfigEntry,
  position: BundleInsertPosition = {},
): Record<string, BundleConfigEntry>
⋮----
export function withPrimaryBundle(config: AkmConfig, stashDir: string): AkmConfig
⋮----
export function bundleKeyForPath(config: AkmConfig, resolvedPath: string): string | undefined
⋮----
export function bundleKeyForUrl(config: AkmConfig, url: string): string | undefined
⋮----
export function nextBundleKey(
  bundles: Record<string, BundleConfigEntry>,
  preferredName: string | undefined,
  seedLocator: string,
): string
`````

## File: src/commands/sources/info.ts
`````typescript
import path from "node:path";
import { placementTypes } from "../../core/asset/asset-placement";
import { resolveStashDir } from "../../core/common";
import type { AkmConfig } from "../../core/config/config";
import { DEFAULT_CONFIG, getSources, loadConfig } from "../../core/config/config";
import { ConfigError } from "../../core/errors";
import { classifyPathAccess, describeInaccessiblePath } from "../../core/path-access";
import { getCacheDir, getConfigDir, getDataDir, getDefaultStashDir, getStateDir } from "../../core/paths";
import { formatRegistryUrl } from "../../core/registry-url";
import { error } from "../../core/warn";
import type { InfoResponse } from "../../sources/types";
import type { Database } from "../../storage/database";
import { closeDatabase, openReadonlyExistingDatabase } from "../../storage/repositories/index-connection";
import { getEntryCount, getEntryCountByType } from "../../storage/repositories/index-entries-repository";
import { countLinksByKind } from "../../storage/repositories/index-links-repository";
import { getMeta } from "../../storage/repositories/index-meta-repository";
import { isSqliteContentionError } from "../../storage/sqlite-transaction";
import { pkgVersion } from "../../version";
import { type TargetRow, targetRows } from "../targets";
⋮----
export function assembleInfo(options?:
⋮----
// Asset types (copy into a mutable array — `placementTypes()` returns readonly)
⋮----
// Registries (strip sensitive fields like apiKey from options)
⋮----
// Stash providers — the unified `bundles` source list, which
// already includes the primary (`defaultBundle`) stash first.
⋮----
// Data directory. `getDataDir()` can itself throw (e.g. TEST_ISOLATION_MISSING
// when NODE_ENV=test leaks into a real invocation — a JS test runner's
// child process — with no XDG_DATA_HOME/AKM_DATA_DIR override), caught
// here so that failure degrades only `dataDir`/`indexStats` rather than
// the whole report. Always attempted, even when `options.dbPath` (a
// test-only override, see the param doc above) means it is not needed to
// resolve the index path below — `dataDir` is its own reported field.
⋮----
// Index stats. `options.dbPath` overrides the resolved path outright;
// otherwise it is derived from `dataDir` above, so a data dir that failed
// to resolve degrades index stats the same way rather than retrying (and
// re-throwing) `getDataDir()` a second time.
⋮----
function safeTargets(config: AkmConfig): TargetRow[]
⋮----
function safePath(fn: () => string): string
⋮----
function readIndexStats(resolvedPath: string): InfoResponse["indexStats"]
⋮----
function describeIndexReadFailure(err: unknown): string
`````

## File: src/commands/sources/init.ts
`````typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stashDirNames } from "../../core/asset/asset-placement";
import { mutateConfig } from "../../core/config/config";
import { assertSafeStashDir, getConfigPath, getDefaultStashDir } from "../../core/paths";
import { warnOnce } from "../../core/warn";
import { primaryBundlePath, withPrimaryBundle } from "./bundle-config-ops";
import { copyStashSkeleton, ensureStashGitignore, scaffoldStashMeta } from "./stash-skeleton";
⋮----
function assertInitSandbox(stashDir: string, dirExplicitlyProvided: boolean): void
⋮----
export interface InitResponse {
  bundleDir: string;
  created: boolean;
  configPath: string;





  defaultBundleUpdated: boolean;






  previousBundleDir?: string;
}
⋮----
export function _setAkmInitForTests(fake?: typeof akmInitReal): void
⋮----
export async function akmInit(options?: {
  dir?: string;
  setDefault?: boolean;

  persistConfig?: boolean;
}): Promise<InitResponse>
⋮----
async function akmInitReal(options?: {
  dir?: string;
  setDefault?: boolean;
  persistConfig?: boolean;
}): Promise<InitResponse>
⋮----
function ensureGitRepo(dir: string): void
`````

## File: src/commands/sources/installed-stashes.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { isWithin, resolveStashDir } from "../../core/common";
import type { AkmConfig, BundleConfigEntry } from "../../core/config/config";
import { bundleComponentConfig, getSources, loadConfig, resolveSecret } from "../../core/config/config";
import { AkmError, ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { isPathAbsent } from "../../core/path-access";
import { getDbPath, getRegistryCacheDir } from "../../core/paths";
import { warn } from "../../core/warn";
import { withAssetMutationLease } from "../../indexer/index-writer-lock";
import { akmIndex } from "../../indexer/indexer";
import type { LockfileEntry } from "../../integrations/lockfile";
import { readLockfile, upsertLockEntry } from "../../integrations/lockfile";
import { parseRegistryRef, resolveRegistryArtifact } from "../../registry/resolve";
import type { InstalledBundle, InstallKind } from "../../registry/types";
import { getCachePaths, parseGitRepoUrl, runGit, syncMirroredRepo } from "../../sources/providers/git";
import { replaceDirectory } from "../../sources/providers/git-install";
import type { SourceLockData } from "../../sources/providers/install-types";
import { installRevisionDir, isDirectory } from "../../sources/providers/provider-utils";
import { syncFromRef } from "../../sources/providers/sync-from-ref";
import { createWebsiteProvider } from "../../sources/providers/website";
import { storeSecretResolver } from "../../sources/snapshot-fetchers/secret-seam";
import { ensureWebsiteMirror } from "../../sources/snapshot-fetchers/website-ingest";
import type {
  RemoveResponse,
  SourceComponent,
  SourceDescriptor,
  SourceEntry,
  SourceKind,
  SourceListResponse,
  SourceLock,
  UpdatePlainSyncedItem,
  UpdateResponse,
  UpdateResultItem,
  UpdateSkippedItem,
} from "../../sources/types";
import type { Database } from "../../storage/database";
import { closeDatabase, openReadonlyExistingDatabase } from "../../storage/repositories/index-connection";
import { getAllEntries } from "../../storage/repositories/index-entries-repository";
import { removeInstalledRegistryEntry } from "./source-add";
import { removeStash } from "./source-manage";
⋮----
interface ManagedInstall {
  bundleKey: string;
  installId: string;
  source: InstallKind;
  ref: string;
  localRoot: string;
  installedAt: string;
  resolvedVersion?: string;
  resolvedRevision?: string;
  writable: boolean;
  componentRoot: string;
  requiredRoots: string[];
  credential?: string;
}
⋮----
function listManagedInstalls(config: AkmConfig): ManagedInstall[]
⋮----
/** Resolve an `akm bundle remove`/`akm bundle update` target to a managed install, if any. */
function resolveManagedTarget(config: AkmConfig, target: string): ManagedInstall | undefined
⋮----
function describeBundleSource(entry: BundleConfigEntry): SourceDescriptor
⋮----
/**
 * Per-component `{ adapter, detected }` disclosure (#908/#909): `adapter` is
 * the EFFECTIVE adapter (explicit config, or auto-detected via the same
 * ordered probe `akm index` uses) and `detected` is `true` exactly when no
 * explicit `adapter` was configured. Before this, an auto-detected adapter
 * was invisible on `akm bundle list` — a mixed-layout bundle silently
 * shadowed by a narrower adapter (#908) gave no sign a choice had even been
 * made. `bundleRoot` is the bundle's resolved content root (lock `localRoot`
 * or its plain `path`), or `undefined` when neither is known yet (an
 * unresolved registry/website source) — detection is skipped in that case
 * rather than probing a path that may not exist.
 */
function describeComponents(entry: BundleConfigEntry, bundleRoot: string | undefined): SourceComponent[]
⋮----
// No explicit component at all — the implicit single component every
// bundle gets (`deriveInstallations` applies the same
// "main"-shaped default at index time).
⋮----
function describeLock(entry: LockfileEntry | undefined): SourceLock | null
⋮----
interface BundleCounts {
  itemCount: number;
  byType: Record<string, number>;
}
⋮----
function readBundleCounts(): Map<string, BundleCounts>
⋮----
export async function akmListSources(input?:
⋮----
export async function akmRemove(input:
⋮----
// ── akmUpdate helpers ────────────────────────────────────────────────────────
⋮----
type IndexResult = Awaited<ReturnType<typeof akmIndex>>;
type ConfiguredSource = ReturnType<typeof getSources>[number];
⋮----
type UpdateIndexSummary = Pick<IndexResult, "mode" | "totalEntries" | "directoriesScanned" | "directoriesSkipped"> & {
  scanComplete?: boolean;
  verification?: IndexResult["verification"];
};
⋮----
function readCurrentIndexSummary(): UpdateIndexSummary
⋮----
function buildUpdateResponse(
  stashDir: string,
  target: string | undefined,
  all: boolean,
  processed: UpdateResponse["processed"],
  opts: {
    plainSynced?: UpdatePlainSyncedItem[];
    skipped?: UpdateSkippedItem[];
    index: UpdateIndexSummary;
  },
): UpdateResponse
⋮----
function incompleteFilesystemOutcome(id: string): UpdateSkippedItem
⋮----
interface StagedUpdate {
  publish(): void;
  cleanup(): void;
}
⋮----
publish(): void;
cleanup(): void;
⋮----
function createStagingParent(parent: string): string
⋮----
function bundleComponent(config: AkmConfig, id: string):
⋮----
function gitOrThrow(repoDir: string, args: string[]): string
⋮----
function fastForwardCheckout(liveRepo: string, stagedRepo: string): void
⋮----
function reindexAfterUpdate(stashDir: string): Promise<IndexResult>
⋮----
function publishAndIndex(stashDir: string, publish: () => Promise<void> | void): Promise<IndexResult>
⋮----
function managedCredential(managed: ManagedInstall): string | undefined
⋮----
async function unchangedManagedItem(managed: ManagedInstall, force: boolean): Promise<UpdateResultItem | undefined>
⋮----
async function stageManagedUpdate(
  managed: ManagedInstall,
  force: boolean,
): Promise<
⋮----
staged:
⋮----
const toLive = (candidate: string): string
⋮----
async function syncGitPlainSource(
  config: AkmConfig,
  gitSource: ConfiguredSource,
  stashDir: string,
): Promise<
⋮----
// A writable mirror may carry local commits: pull into a copy, then
// fast-forward the live checkout to it.
⋮----
async function syncWebsitePlainSource(
  websiteSource: ConfiguredSource,
  stashDir: string,
): Promise<
⋮----
/** Sync a git-mirrored (plain) source and return an UpdateResponse (single-target path). */
async function updateGitSource(
  config: AkmConfig,
  stashDir: string,
  target: string,
  all: boolean,
  gitSource: ConfiguredSource,
): Promise<UpdateResponse>
⋮----
/** Re-crawl a website (plain) source and return an UpdateResponse (single-target path). */
async function updateWebsiteSource(
  stashDir: string,
  target: string,
  all: boolean,
  websiteSource: ConfiguredSource,
): Promise<UpdateResponse>
⋮----
/** Reconcile a filesystem source's current bytes without provider hydration. */
async function updateFilesystemSource(
  stashDir: string,
  target: string,
  all: boolean,
  filesystemSource: ConfiguredSource,
): Promise<UpdateResponse>
⋮----
function managedInstallViewOfPlainNpm(config: AkmConfig, npmSource: ConfiguredSource): ManagedInstall
⋮----
/**
 * Sync a single registry-managed install and return the processed record:
 * fetch into staging, publish, write its lock entry, reindex.
 *
 * Read-only installs are keyed by resolved revision. An unchanged revision
 * returns early: nothing is fetched or published. After a real change the new
 * <rev> directory is published, the previous <rev> directory is kept, and older
 * ones are pruned, unless another bundle or lock entry still references them.
 * Those directories are a re-fetchable cache (local and writable installs never
 * take this path), so none of this prompts.
 */
async function updateManagedInstall(
  managed: ManagedInstall,
  force: boolean,
  stashDir: string,
): Promise<
⋮----
// Preserve the original source classification. syncFromRef() re-derives the
// source type from the ref scheme (e.g. "github:" → source: "github"), but
⋮----
/**
 * After a real revision change, keep the previous `<rev>` directory (a process
 * may still be running from it) and remove every older sibling in the install's
 * directory, unless another configured or locked bundle still uses it.
 */
function pruneOlderRevisions(previousRoot: string, currentCacheDir: string): void
⋮----
function referencesRoot(target: string, config: AkmConfig, locks: LockfileEntry[]): boolean
⋮----
function isRootAtOrBelow(candidate: string, root: string): boolean
⋮----
// ── akmUpdate dispatcher ─────────────────────────────────────────────────────
⋮----
export async function akmUpdate(input?: {
  target?: string;
  all?: boolean;
  force?: boolean;
  stashDir?: string;
}): Promise<UpdateResponse>
⋮----
// Registry-managed install (lock-backed) — re-download from its locator.
⋮----
// Plain git / website source (bundles without a lock) — provider re-sync.
⋮----
function sourceKindForInstall(source: InstallKind): SourceKind
⋮----
function updateFailureOutcome(id: string, kind: SourceKind, error: unknown): UpdateSkippedItem
⋮----
function selectManagedTargets(
  config: AkmConfig,
  installs: ManagedInstall[],
  target: string | undefined,
  all: boolean,
): ManagedInstall[]
⋮----
function cleanupDirectoryBestEffort(target: string, context: string): void
⋮----
function directoryExists(target: string): boolean
`````

## File: src/commands/sources/migration-help.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import embeddedChangelog from "../../../CHANGELOG.md" with { type: "text" };
import { getDirname } from "../../runtime";
⋮----
function releaseNotesDir(): string
⋮----
function loadChangelog(): string | undefined
⋮----
function loadReleaseNote(version: string): string | undefined
⋮----
function isSafeVersionComponent(version: string): boolean
⋮----
function normalizeRequestedVersion(input: string): string
⋮----
function versionCandidates(requested: string): string[]
⋮----
function resolveLatestVersion(changelog: string): string | undefined
⋮----
function extractChangelogSection(changelog: string, version: string): string | undefined
⋮----
function escapeRegexString(value: string): string
⋮----
function fallbackGuide(version: string): string
⋮----
export function renderMigrationHelp(versionInput: string, changelogText = loadChangelog()): string
⋮----
export function listBundledReleaseVersions(): string[]
`````

## File: src/commands/sources/plugin-upgrade.ts
`````typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IS_WINDOWS, parseJsonc } from "../../core/common";
import { moveToTrash } from "../../core/trash";
import {
  OPENCODE_V1,
  OPENCODE_V2,
  type OpenCodeFlavor,
  readPackageVersion,
} from "../../integrations/harnesses/opencode/plugin-layout";
import { opencodeCacheDir, opencodeConfigDir } from "../../integrations/harnesses/opencode/roots";
import { detectOpencodeMajor, OPENCODE_BIN, resolveOpencodeBin } from "../../integrations/harnesses/opencode/version";
import { semverOrder } from "../../runtime";
import type {
  PluginUpgradeEntry,
  UpgradeChannel,
  UpgradeCheckResponse,
  UpgradeLockstep,
  UpgradeResponse,
} from "../../sources/types";
⋮----
type CommandFailure = { ok: false; missing: boolean; error: string };
type CommandResult = { ok: true; stdout: string } | CommandFailure;
⋮----
function runCommand(command: string, args: string[], timeoutMs: number, opts?:
⋮----
function parseJson(text: string): unknown
⋮----
function skipped(harness: PluginUpgradeEntry["harness"], message: string): PluginUpgradeEntry
⋮----
function failed(harness: PluginUpgradeEntry["harness"], message: string): PluginUpgradeEntry
⋮----
function refreshed(harness: PluginUpgradeEntry["harness"], from: string | undefined, to: string | undefined)
⋮----
function unknownRefresh(harness: PluginUpgradeEntry["harness"], from: string | undefined): PluginUpgradeEntry
⋮----
type Detected = { entry: PluginUpgradeEntry } | { version: string | undefined; ref: string | undefined };
⋮----
function claudePluginVersion():
⋮----
function detectClaudeCode(): Detected
⋮----
function upgradeClaudeCode(dryRun: boolean, next: boolean): PluginUpgradeEntry
⋮----
function refreshClaudeCode(dryRun: boolean, from: string | undefined): PluginUpgradeEntry
⋮----
function codexPluginVersion():
⋮----
/** The ref `[marketplaces.akm-plugins]` follows in Codex's config.toml; undefined when it names none (the default branch). */
function codexMarketplaceRef(): string | undefined
⋮----
function upgradeCodex(dryRun: boolean, next: boolean): PluginUpgradeEntry
⋮----
function refreshCodex(dryRun: boolean, from: string | undefined): PluginUpgradeEntry
⋮----
const nextSpec = (flavor: OpenCodeFlavor) => `$
⋮----
export interface OpenCodeCache {
  dir: string;
  version: string | undefined;
}
⋮----
export type OpenCodeLatest = { version: string; akmCli: string | undefined } | { error: string };
⋮----
function entrySpec(entry: unknown): string | undefined
⋮----
const namesPackage = (spec: string, pkg: string) => spec === pkg || spec.startsWith(`$
⋮----
export function openCodeConfigSpec(flavor: OpenCodeFlavor):
⋮----
function openCodeV2Cached(): boolean
⋮----
/**
 * The cached plugin OpenCode installed on first use, or undefined when there is
 * none. OpenCode names the folder after the spec it resolved, so a bare package
 * lands in `@latest` and `<pkg>@next` in `@next`.
 */
export function detectOpenCodeCache(tag: UpgradeChannel, flavor: OpenCodeFlavor): OpenCodeCache | undefined
⋮----
export function lookupOpenCodeLatest(tag: UpgradeChannel, flavor: OpenCodeFlavor): OpenCodeLatest
⋮----
export function usesHostCache(pid: string, procRoot = "/proc"): boolean
⋮----
function openCodeRunning(): boolean | undefined
⋮----
const notFollowingNext = (flavor: OpenCodeFlavor)
⋮----
function otherSpecNote(flavor: OpenCodeFlavor, spec: string): string
⋮----
function upgradeOpenCode(dryRun: boolean, target: OpenCodeTarget): PluginUpgradeEntry
⋮----
// From a temp dir, so no project's opencode.json is read.
⋮----
// OpenCode 2 starts its background service for this command and answers "Plugin is not configured" until
⋮----
function withChannelNote(entry: PluginUpgradeEntry, ref: string | undefined, howToSwitch: string): PluginUpgradeEntry
⋮----
export interface OpenCodeTarget {
  flavor: OpenCodeFlavor;
  cache: OpenCodeCache | undefined;
  latest: OpenCodeLatest | undefined;

  tag: UpgradeChannel;

  spec: string;

  notFollowingNext: boolean;

  skip?: string;
}
⋮----
export function upgradePlugins(opts: {
  dryRun: boolean;
  next: boolean;
  openCode: OpenCodeTarget[];
}): PluginUpgradeEntry[]
⋮----
export function applyLockstep<T extends UpgradeCheckResponse>(
  check: T,
  latest: OpenCodeLatest | undefined,
  tag: UpgradeChannel,
  pkg: OpenCodeFlavor["pkg"],
): T &
⋮----
function lockstepSource(targets: OpenCodeTarget[]): OpenCodeTarget | undefined
⋮----
const readable = (t: OpenCodeTarget): t is OpenCodeTarget &
⋮----
export interface UpgradeRunDependencies {
  checkForUpdate: (currentVersion: string, channel: UpgradeChannel) => Promise<UpgradeCheckResponse>;
  performUpgrade: (
    check: UpgradeCheckResponse,
    opts: { force: boolean; skipPostUpgrade: boolean; targetVersion?: string },
  ) => Promise<UpgradeResponse>;
}
⋮----
export type UpgradeRunResult =
  | { mode: "check"; result: UpgradeCheckResponse & { plugins: PluginUpgradeEntry[] } }
  | { mode: "upgrade"; result: UpgradeResponse & { plugins: PluginUpgradeEntry[] }; failed: boolean };
⋮----
function resolveOpenCodeTarget(
  next: boolean,
  flavor: OpenCodeFlavor,
  configured: { spec: string; key: string } | undefined,
): OpenCodeTarget
⋮----
const leftAlone = (skip: string): OpenCodeTarget => (
⋮----
function resolveOpenCodeTargets(next: boolean): OpenCodeTarget[]
⋮----
export async function runUpgrade(
  args: { check: boolean; force: boolean; skipPostUpgrade: boolean; next?: boolean },
  currentVersion: string,
  deps: UpgradeRunDependencies,
): Promise<UpgradeRunResult>
`````

## File: src/commands/sources/schema-repair.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { assembleAsset } from "../../core/asset/asset-serialize";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { parseRefInput } from "../../core/asset/resolve-ref";
import { authoringRulesForType } from "../../core/authoring-rules";
import { ConfigError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { parseEmbeddedJsonResponse } from "../../core/parse";
import { resolveStandardsContext } from "../../core/standards/resolve-standards-context";
import { info } from "../../core/warn";
import type { LoweringNotice } from "../../execution/resolved-request";
import { resolveAssetPath } from "../../indexer/walk/path-resolver";
import type { RunnerSpec } from "../../integrations/agent/runner";
import type { ChatMessage, chatCompletion } from "../../llm/client";
import { callStructured } from "../../llm/structured-call";
import { isLedgerBlocked, ledgerKey, loadLedgerSnapshot } from "../improve/ledger";
import { createProposal } from "../proposal/repository";
⋮----
export interface SchemaRepairFailure {
  ref: string;
  reason: string;
}
⋮----
export type SchemaRepairOutcome = "queued" | "skipped" | "error";
⋮----
export interface SchemaRepairRecord {
  ref: string;
  reason: string;
  outcome: SchemaRepairOutcome;

  proposalId?: string;
  error?: string;

  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export interface SchemaRepairOptions {

  startMs: number;

  budgetMs: number;

  llmRunner?: RunnerSpec;

  stashDir?: string;

  findFilePath?: (ref: string, stashDir?: string) => Promise<string | null> | string | null;

  isLessonCandidateFn?: (ref: string) => boolean;

  chatFn?: typeof chatCompletion;
}
⋮----
interface EligibleSchemaRepair {
  failure: SchemaRepairFailure;
  frontmatter: ReturnType<typeof parseFrontmatter>;
  fieldList: string;
  messages: ChatMessage[];
}
⋮----
async function classifySchemaRepairs(args: {
  failures: SchemaRepairFailure[];
  startMs: number;
  budgetMs: number;
  stashDir: string;
  findFilePath: NonNullable<SchemaRepairOptions["findFilePath"]>;
  isLessonCandidateFn: NonNullable<SchemaRepairOptions["isLessonCandidateFn"]>;
  repairs: SchemaRepairRecord[];
}): Promise<
⋮----
export async function runSchemaRepairPass(
  failures: SchemaRepairFailure[],
  options: SchemaRepairOptions,
): Promise<
⋮----
const noticeFields = ():
⋮----
function defaultIsLessonCandidate(ref: string): boolean
⋮----
async function defaultFindFilePath(ref: string, stashDir?: string): Promise<string | null>
`````

## File: src/commands/sources/self-update.ts
`````typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  fetchWithRetry,
  IS_WINDOWS,
  ResponseTooLargeError,
  readBodyWithByteCap,
  readChunkWithDeadline,
} from "../../core/common";
import { ConfigError } from "../../core/errors";
import { warn } from "../../core/warn";
import { githubHeaders } from "../../integrations/github";
import { getDirname, mainPath, semverOrder } from "../../runtime";
import type { UpgradeChannel, UpgradeCheckResponse, UpgradeResponse } from "../../sources/types";
import { resolveNpmGlobalRoot } from "../../tasks/resolve-akm-bin";
import { runMigrationTool } from "../migration-tool";
⋮----
export type InstallMethod = UpgradeCheckResponse["installMethod"];
⋮----
export interface SelfUpdateDependencies {
  execPath: string;
  runMigrationTool: typeof runMigrationTool;
}
⋮----
export async function streamResponseToFile(
  response: Response,
  destination: string,
  maxBytes: number,
  limits?: { stallTimeoutMs?: number; totalTimeoutMs?: number },
): Promise<
⋮----
export interface InstallSignals {
  bunMain: string | undefined;
  importMetaDir: string | undefined;
  hasAkmVersion: boolean;

  npmGlobalRoot?: string;
}
⋮----
export function getInstallSignals(): InstallSignals
⋮----
function resolveNpmGlobalRootForThisProcess(): string | undefined
⋮----
function isUnderDirectory(dir: string, root: string): boolean
⋮----
const real = (value: string): string =>
⋮----
/** The package that depends on this akm: the directory holding the `node_modules` it lives in. */
function packageLocalRoot(importMetaDir: string): string
⋮----
// AKM_VERSION ambient type is declared in globals.d.ts
⋮----
export function detectInstallMethod(signals?: InstallSignals): InstallMethod
⋮----
export function getAkmBinaryName(): string
⋮----
async function lookupNextVersion(fetchOptions?:
⋮----
/**
 * The newest release. With `channel: "next"` that includes prereleases: the
 * `next` dist-tag when it is newer than the latest stable release, else the
 * stable release (a prerelease older than a stable one is never a target).
 * A binary install downloads the GitHub release tagged `v<version>`, which a
 * prerelease has too, so the version is all the install step needs.
 */
export async function checkForUpdate(
  currentVersion: string,
  fetchOptions?: { timeout?: number; retries?: number },
  channel: UpgradeChannel = "latest",
): Promise<UpgradeCheckResponse>
⋮----
/**
 * Whether the operator has asked to bypass upgrade checksum verification.
 *
 * Deliberately NOT a CLI flag (C6): STABILITY.md states checksum verification
 * is not optional, so the recovery hatch for a genuinely broken `checksums.txt`
 * is this internal, undocumented-on-purpose env var — not something
 * discoverable in `--help` or offered by tab completion.
 *
 * Extracted rather than read inline so `performUpgrade` stays under the
 * function-size bar (`scripts/lint-src-fn-size.ts`), whose baseline only
 * shrinks.
 */
function checksumBypassRequested(): boolean
⋮----
export async function performUpgrade(
  check: UpgradeCheckResponse,
  opts?: { force?: boolean; skipPostUpgrade?: boolean; targetVersion?: string },
  dependencies?: Partial<SelfUpdateDependencies>,
): Promise<UpgradeResponse>
⋮----
async function runMigrationStep(runTool: typeof runMigrationTool): Promise<NonNullable<UpgradeResponse["migration"]>>
⋮----
function runPostUpgradeTasks(akmBin: string, opts:
⋮----
/**
 * The package-manager arm of {@link performUpgrade}: install → post-install
 * version verification → post-upgrade tasks.
 * Extracted whole so performUpgrade stays under its fn-size baseline.
 */
async function runPackageManagerUpgrade(input: {
  packageManagerCommand: NonNullable<ReturnType<typeof getPackageManagerUpgradeCommand>>;
  currentVersion: string;
  latestVersion: string | undefined;
  installMethod: InstallMethod;
  skipPostUpgrade: boolean;
  runTool: typeof runMigrationTool;
}): Promise<UpgradeResponse>
⋮----
// The install could not change what runs, so the migrator on disk is
// still the right one: run it, then say so, or an operator reading the
// EACCES will assume the migration is stuck behind it (#895).
⋮----
// The package manager exiting 0 does not prove it delivered
// `latestVersion`: a lagging `@latest` dist-tag (partial publish,
// registry mirror lag) "succeeds" while leaving the old version on PATH.
⋮----
function readInstalledCliVersion(akmBin: string): string | undefined
⋮----
function removeFileBestEffort(filePath: string): void
⋮----
// Cleanup is best-effort; the primary operation determines success.
⋮----
function parseChecksumForFile(checksumsText: string, filename: string): string | undefined
⋮----
function normalizePathSeparators(value: string | undefined): string
⋮----
function getInstalledPackageName(): string
⋮----
function resolveNodePackageManagerCommand(name: "npm" | "pnpm"): string
⋮----
export function getPackageManagerUpgradeCommand(
  installMethod: InstallMethod,
  packageName = getInstalledPackageName(),
  version = "latest",
):
`````

## File: src/commands/sources/source-add.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { isBundleSlug } from "../../core/asset/asset-ref";
import { slugForRegistryId, validateExplicitBundleName } from "../../core/bundle-id";
import { isHttpUrl, resolveStashDir } from "../../core/common";
import type { AkmConfig, BundleConfigEntry, SourceConfigEntry } from "../../core/config/config";
import {
  bundleEntryToSourceEntry,
  getSources,
  installedSourceDescriptor,
  loadConfig,
  mutateConfig,
  resolveSecret,
} from "../../core/config/config";
import { ConfigError, UsageError } from "../../core/errors";
import { akmIndex } from "../../indexer/indexer";
import { deriveBundleId } from "../../indexer/installations";
import { readLockfile, removeLockEntry, upsertLockEntry } from "../../integrations/lockfile";
import { parseRegistryRef } from "../../registry/resolve";
import type { InstalledBundle } from "../../registry/types";
import { detectStashRoot } from "../../sources/providers/provider-utils";
import { syncFromRef } from "../../sources/providers/sync-from-ref";
import { storeSecretResolver } from "../../sources/snapshot-fetchers/secret-seam";
import {
  ensureWebsiteMirror,
  shouldAllowPrivateWebsiteUrlForTests,
  validateWebsiteInputUrl,
} from "../../sources/snapshot-fetchers/website-ingest";
import type { AddResponse } from "../../sources/types";
import { revokeSchedulerActivationsForBundle } from "../../tasks/activation-config";
import {
  type BundleInsertPosition,
  bundleKeyForPath,
  bundleKeyForUrl,
  nextBundleKey,
  placeBundle,
} from "./bundle-config-ops";
⋮----
export async function akmAdd(
  input: {
    ref: string;
    name?: string;
    options?: Record<string, unknown>;
    writable?: boolean;

    credential?: string;

    adapter?: string;
  } & BundleInsertPosition,
): Promise<AddResponse>
⋮----
async function addLocalSource(
  ref: string,
  sourcePath: string,
  stashDir: string,
  explicitName?: string,
  explicitAdapter?: string,
  position: BundleInsertPosition = {},
): Promise<AddResponse>
⋮----
async function addWebsiteSource(
  ref: string,
  stashDir: string,
  name?: string,
  options?: Record<string, unknown>,
  position: BundleInsertPosition = {},
): Promise<AddResponse>
⋮----
const numberOption = (value: unknown): number | undefined
⋮----
// An explicit `--name` is a contract (D6) — validated strictly and used
// as-is, never silently substituted. A DERIVED default (no --name) keeps
// the forgiving `deriveBundleId` fallback, so a dotted hostname or a
// URL collision still mints a usable id instead of erroring.
⋮----
// Merge onto the existing descriptor rather than replacing it: re-running
// `bundle add` for a URL that already has a bundle would otherwise drop
// respectRobots / refresh, silently restoring default robots enforcement
// and changing what the next update fetches. Explicitly-passed maxPages /
// maxDepth still win over the stored values.
⋮----
async function addRegistryStash(
  ref: string,
  stashDir: string,
  explicitName?: string,
  writable?: boolean,
  position: BundleInsertPosition = {},
  credentialRef?: string,
): Promise<AddResponse>
⋮----
export function upsertInstalledRegistryEntry(
  entry: InstalledBundle,
  position: BundleInsertPosition = {},
  credential?: string,
  explicitName?: string,
):
⋮----
export async function removeInstalledRegistryEntry(id: string): Promise<AkmConfig>
⋮----
function findInstalledBundleKey(bundles: Record<string, BundleConfigEntry>, installId: string): string | undefined
⋮----
function resolveInstalledBundleKey(
  bundles: Record<string, BundleConfigEntry>,
  installId: string,
  stashRoot: string,
  explicitName?: string,
): string
⋮----
function toReadableId(resolvedPath: string): string
⋮----
// Keep this list limited to widely-used git hosts for the non-breaking
// "repo-like URL" fast-path; everything else continues to default to website snapshots.
⋮----
export function shouldAddAsWebsiteUrl(ref: string): boolean
⋮----
function isLikelyGitRepositoryUrl(ref: string): boolean
⋮----
function toWebsiteName(siteUrl: string): string
`````

## File: src/commands/sources/source-clone.ts
`````typescript
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { adapterForId } from "../../core/adapter/registry";
import { placementSpecFor, stashDirFor } from "../../core/asset/asset-placement";
import { isBundleSlug } from "../../core/asset/asset-ref";
import { serializeFrontmatter } from "../../core/asset/asset-serialize";
import { parseFrontmatter, replaceFrontmatterBlocks } from "../../core/asset/frontmatter";
import { conceptIdFromTypeName, displayRef, parseQualifiedRefInput } from "../../core/asset/resolve-ref";
import { isWithin, safeRealpath } from "../../core/common";
import { loadConfig } from "../../core/config/config";
import { ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { defaultBundleForTarget } from "../../core/mutation-target";
import { warn } from "../../core/warn";
import {
  commitWriteTargetBoundary,
  prepareWriteTargetForMutation,
  type ResolvedWriteTarget,
  resolveWriteTarget,
} from "../../core/write-source";
import { withAssetMutationLease } from "../../indexer/index-writer-lock";
import { indexWrittenAssets } from "../../indexer/index-written-assets";
import { resolveAdapterConceptOwner } from "../../indexer/lookup/adapter-concept-owner";
import { findSourceForPath, resolveSourceEntries, type SearchSource } from "../../indexer/search/search-source";
import { buildFileContext } from "../../indexer/walk/file-context";
import { isFileOrFileSymlink } from "../../indexer/walk/walker";
import { isRemoteOrigin, resolveSourcesForLocator, resolveSourcesForOrigin } from "../../registry/origin-resolve";
import { syncFromRef } from "../../sources/providers/sync-from-ref";
import { resolveAssetPath } from "../../sources/resolve";
import { inferAssetName } from "../read/knowledge";
⋮----
export interface CloneOptions {

  sourceRef: string;

  newName?: string;

  force?: boolean;

  dest?: string;

  target?: string;
}
⋮----
export interface CloneResponse {
  source: {
    path: string;
    registryId?: string;
  };
  destination: {
    path: string;
    ref?: string;
  };
  overwritten: boolean;
  remoteFetched?: { origin: string; stashRoot: string; cacheDir: string };
}
⋮----
function destinationRef(
  config: ReturnType<typeof loadConfig> | undefined,
  target: ResolvedWriteTarget | undefined,
  type: string,
  name: string,
): string | undefined
⋮----
export async function akmClone(options: CloneOptions): Promise<CloneResponse>
⋮----
// Validate destName to prevent path traversal (parsed.name is already
// validated by the ref parser, but newName comes directly from user input).
// Run whenever newName is provided, including empty string.
⋮----
function resolveOpaqueAsset(source: SearchSource, conceptId: string):
⋮----
function placementTypeForOpaque(sourceRef: string, sourcePath: string, indexedType: string | undefined): string
⋮----
function slugName(conceptId: string): string
⋮----
function stampCloneOrigin(filePath: string, originRef: string | undefined): void
⋮----
function lstatIfExists(filePath: string): fs.Stats | undefined
⋮----
function assertNoDestinationSymlinkParent(root: string, destination: string): void
⋮----
function materializeFileLinks(root: string): void
⋮----
function listTreeFiles(root: string): string[]
`````

## File: src/commands/sources/source-manage.ts
`````typescript
import path from "node:path";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { validateExplicitBundleName } from "../../core/bundle-id";
import { isRemoteUrl } from "../../core/common";
import type { BundleConfigEntry, SourceConfigEntry } from "../../core/config/config";
import { bundleEntryToSourceEntry, bundlesToSourceEntries, getSources, mutateConfig } from "../../core/config/config";
import { ConfigError, UsageError } from "../../core/errors";
import { revokeSchedulerActivationsForBundle } from "../../tasks/activation-config";
import {
  type BundleInsertPosition,
  bundleKeyForPath,
  bundleKeyForUrl,
  nextBundleKey,
  placeBundle,
} from "./bundle-config-ops";
⋮----
export interface SourceAddResult {
  sources: SourceConfigEntry[];
  added: boolean;
  entry?: SourceConfigEntry;
  message?: string;
}
⋮----
export interface SourceRemoveResult {
  sources: SourceConfigEntry[];
  removed: boolean;
  entry?: SourceConfigEntry;
  message?: string;
}
⋮----
export function addStash(
  opts: {
    target: string;
    name?: string;
    providerType?: string;
    options?: Record<string, unknown>;
    writable?: boolean;
    credential?: string;
  } & BundleInsertPosition,
): SourceAddResult
⋮----
function urlBundleDescriptor(
  providerType: string,
  locator: string,
  options: Record<string, unknown> | undefined,
  writable: boolean,
  credential?: string,
): BundleConfigEntry
⋮----
export function removeStash(target: string): SourceRemoveResult
`````

## File: src/commands/sources/sources-cli.ts
`````typescript
import { defineCommand } from "citty";
import {
  defineJsonCommand,
  EXIT_CODES,
  GLOBAL_OUTPUT_ARGS,
  output,
  outputWithExitCode,
  runWithJsonErrors,
} from "../../cli/shared";
import { loadConfig } from "../../core/config/config";
import { appendEvent } from "../../core/events";
import { resolveWritableOverride, saveGitStash } from "../../sources/providers/git";
import { pkgVersion } from "../../version";
import { runUpgrade } from "./plugin-upgrade";
import { checkForUpdate, performUpgrade } from "./self-update";
import { akmClone } from "./source-clone";
⋮----
async run(
⋮----
async function runSyncBody(args:
`````

## File: src/commands/sources/stash-cli.ts
`````typescript
import path from "node:path";
import { defineCommand } from "citty";
⋮----
import { defineJsonCommand, GLOBAL_OUTPUT_ARGS, output, parseAllFlagValues, runWithJsonErrors } from "../../cli/shared";
import { assertFlatAssetName } from "../../core/asset/asset-create";
import { placementTypes } from "../../core/asset/asset-placement";
import { parseFrontmatter } from "../../core/asset/frontmatter";
import { isHttpUrl, resolveStashDir } from "../../core/common";
import { loadConfig } from "../../core/config/config";
import { appendEvent } from "../../core/events";
import { resolveBundleWriteTarget } from "../../core/mutation-target";
import { getRunLogDir } from "../../core/paths";
import { clearLogFile, info, isVerbose, setLogFile } from "../../core/warn";
import { resolveWriteTarget } from "../../core/write-source";
import { releaseIndexRebuildLock, tryAcquireIndexRebuildLock } from "../../indexer/index-rebuild-lock";
import { akmIndex } from "../../indexer/indexer";
import { getOutputMode } from "../../output/context";
import { pkgVersion } from "../../version";
import {
  inferAssetName,
  mergeXrefsIntoContent,
  readKnowledgeInput,
  resolveSupersedesForWrite,
  resolveSupersedesWriteTarget,
  resolveXrefsForWrite,
  writeMarkdownAsset,
} from "../read/knowledge";
import { assembleInfo } from "./info";
⋮----
async run(
⋮----
const abort = (): void
⋮----
// Resolve the stash dir once at the `akm index` command boundary and
// thread it into the indexer (WI-9.10 CLI-wide sweep) — the indexer leaf
// no longer reads the ambient `resolveStashDir()`.
⋮----
// Non-verbose, non-text (JSON/yaml/etc) mode: silence used to be
// total until the run finished (#954) — a stalled
// run looked identical to "nothing written". Phase-start
⋮----
run()
`````

## File: src/commands/sources/stash-skeleton.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { getDirname } from "../../runtime";
⋮----
export function copyStashSkeleton(stashDir: string): void
⋮----
function copySkeletonDir(srcDir: string, destDir: string): void
⋮----
export function scaffoldStashMeta(stashDir: string): void
⋮----
export function ensureStashGitignore(stashDir: string): void
`````

## File: src/commands/tasks/explain.ts
`````typescript
import fs from "node:fs";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { makeBundleRef, parseBundleRef } from "../../core/asset/asset-ref";
import { loadConfig } from "../../core/config/config";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { ConfigError, NotFoundError } from "../../core/errors";
import {
  applyInputDefaults,
  type InputContract,
  type InputDeclaration,
  type InputFlag,
  materializeInputFlags,
} from "../../execution/input-contract";
import { createInlineResolvedCommand } from "../../execution/resolved-request";
import { isPortableExecutionAgentSelector, type UnresolvedExecutionDefaults } from "../../execution/source";
import { lookupBundleRefReadonly } from "../../indexer/indexer";
import { resolveAdapterConceptOwner } from "../../indexer/lookup/adapter-concept-owner";
import {
  currentLayer,
  type ResolvedExecution,
  resolveExecution,
  shippedAlias,
} from "../../integrations/agent/execution";
import { isSchedulerRefEnabled } from "../../tasks/activation-config";
import type { PreparableTaskDocument } from "../../tasks/prepare/prepared-execution";
import { parseTaskSource } from "../../tasks/source/parse-task-source";
import { projectTaskSourceV4 } from "../../tasks/source/project-v4";
import { TASK_INPUT_DIAGNOSTICS } from "../../tasks/source/task-input-diagnostics";
import { validateTaskConceptId, validateTaskId } from "../../tasks/task-id";
import { detectSecretShapedParams } from "../../workflows/exec/param-secrets";
import { prepareCommandInvocation } from "../command/command-execution";
import { parseTaskRef, resolveTaskReadBundle, taskIdForAdapter } from "./tasks";
⋮----
export interface TaskExplainOptions {
  readonly target?: string;
  readonly inputFlags?: readonly InputFlag[];
}
⋮----
type SuppliedValueProvenance = "default" | "flag";
⋮----
interface SuppliedInputRow {
  readonly value: unknown;
  readonly provenance: SuppliedValueProvenance;
  readonly redacted?: boolean;
}
⋮----
interface ScheduleInputRow {
  readonly value: unknown;
  readonly provenance: "schedule-binding";
  readonly redacted?: boolean;
}
⋮----
interface InputDeclarationRow {
  readonly type?: string;
  readonly enum?: readonly unknown[];
  readonly required: boolean;
  readonly default?: unknown;
  readonly redacted?: boolean;
}
⋮----
interface ScheduleBindingRow {
  readonly ordinal: number;
  readonly cron: string;
  readonly enabled: boolean;
  readonly source: string;
  readonly inputs: Readonly<Record<string, ScheduleInputRow>>;
}
⋮----
interface ExecutionSettingsSection {
  readonly engine?: Readonly<{ name: string; kind: string; platform?: string | null }>;
  readonly model?: unknown;
  readonly timeoutMs?: number | null;
  readonly provenance: Readonly<Record<string, Readonly<{ layer: string; kind: string; via: string }>>>;

  readonly problem?: string;
}
⋮----
export interface TaskExplainEnvelope {
  readonly ref: string;
  readonly taskId: string;
  readonly bundleName: string;
  readonly sourcePath: string;
  readonly sourceVersion: 3 | 4;
  readonly name?: string;
  readonly description?: string;
  readonly target: Readonly<{ kind: string; ref?: string }>;
  readonly inputDeclarations: Readonly<Record<string, InputDeclarationRow>>;
  readonly suppliedInputs: Readonly<Record<string, SuppliedInputRow>>;
  readonly execution: ExecutionSettingsSection;
  readonly schedule: readonly ScheduleBindingRow[];
}
⋮----
function isSecretShapedValue(name: string, value: unknown): boolean
⋮----
function redactIfSecretShaped(name: string, value: unknown): Readonly<
⋮----
function declarationType(schema: Readonly<Record<string, unknown>>): string | undefined
⋮----
function declarationEnum(schema: Readonly<Record<string, unknown>>): readonly unknown[] | undefined
⋮----
function redactEnum(
  name: string,
  values: readonly unknown[],
): Readonly<
⋮----
function buildInputDeclarations(contract: InputContract): Record<string, InputDeclarationRow>
⋮----
function buildSuppliedInputs(
  defaultedInputs: Readonly<Record<string, unknown>>,
  materializedInputs: Readonly<Record<string, unknown>>,
): Record<string, SuppliedInputRow>
⋮----
function targetSection(document: PreparableTaskDocument): Readonly<
⋮----
function isCommandTarget(document: PreparableTaskDocument): boolean
⋮----
function currentExecutionValues(document: PreparableTaskDocument, bundleName: string): Record<string, unknown>
⋮----
function qualifyInBundle(ref: string, bundleName: string): string
⋮----
function storedCommandRef(document: PreparableTaskDocument): string | undefined
⋮----
async function resolveExecutionSettings(
  document: PreparableTaskDocument,
  bundleName: string,
): Promise<ExecutionSettingsSection>
⋮----
export async function akmTaskExplain(ref: string, options: TaskExplainOptions =
`````

## File: src/commands/tasks/tasks-cli.ts
`````typescript
import { defineCommand } from "citty";
import { getParsedInvocation } from "../../cli/invocation";
import { parsePositiveIntFlag } from "../../cli/parse-args";
import { RETIRED_ENGINE_ARG, SELECTION_ARGS, selectionFromArgs } from "../../cli/selection";
import {
  defineGroupCommand,
  defineJsonCommand,
  EXIT_CODES,
  GLOBAL_OUTPUT_ARGS,
  output,
  outputWithExitCode,
  runWithJsonErrors,
} from "../../cli/shared";
import { UsageError } from "../../core/errors";
import type { InputFlag } from "../../execution/input-contract";
import { TASK_RUN_BOOLEAN_FLAGS, TASK_RUN_VALUE_FLAGS } from "../../tasks/task-run-reserved-flags";
import { akmTaskExplain } from "./explain";
import {
  akmTasksAdd,
  akmTasksDisable,
  akmTasksDoctor,
  akmTasksEnable,
  akmTasksHistory,
  akmTasksPrune,
  akmTasksRun,
  akmTasksSync,
  akmTasksSyncPlan,
} from "./tasks";
⋮----
function hasFlagNamed(name: string): boolean
⋮----
function rejectExplainScheduledFlag(): void
⋮----
export function parseTaskInputFlags(rawArgs: readonly string[], id: string): InputFlag[]
⋮----
async run(
⋮----
export function resolveTaskHistoryId(positional: string | undefined, flag: string | undefined): string | undefined
⋮----
export function taskSyncDryRunExitCode(preview: {
  hasRemovals: boolean;
  failures?: readonly unknown[];
}): number | undefined
⋮----
async run()
⋮----
export function taskPruneExitCode(result:
`````

## File: src/commands/tasks/tasks.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { stringify as yamlStringify } from "yaml";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { assetPathForName } from "../../core/asset/asset-placement";
import { makeBundleRef, parseBundleRef } from "../../core/asset/asset-ref";
import { type AssetRef, conceptIdFromTypeName, isFullRefInput } from "../../core/asset/resolve-ref";
import { isWithin, resolveStashDir } from "../../core/common";
import {
  defaultConnection,
  defaultHarness,
  loadConfig,
  mutateConfig,
  resetConfigCache,
} from "../../core/config/config";
import { bundleKeyForContentRoot, resolveConfiguredSources } from "../../core/config/config-sources";
import type { AkmConfig } from "../../core/config/config-types";
import { IMPROVE_AUTONOMY_CONFIG_KEY, isImproveAutonomyEnabled } from "../../core/config/experimental";
import { ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { getTaskLogDir } from "../../core/paths";
import { warn } from "../../core/warn";
import {
  assertBundleNotDisabled,
  commitWriteTargetBoundary,
  isWriteCapableSourceKind,
  prepareWriteTargetForMutation,
  type ResolvedWriteTarget,
  resolveWorkingStashTarget,
  resolveWriteTarget,
  writeAssetToSource,
} from "../../core/write-source";
import type { InputFlag } from "../../execution/input-contract";
import { deriveInstallations } from "../../indexer/installations";
import { retiredEngineSelection } from "../../integrations/agent/resolution";
import { resolveSourcesForOrigin } from "../../registry/origin-resolve";
import { resolveAssetPath } from "../../sources/resolve";
import { enabledRefsFromInstalled, schedulerEnabledRefs, setSchedulerRefEnabled } from "../../tasks/activation-config";
import { backendNameForPlatform, selectBackend } from "../../tasks/backends";
import type { InstalledSchedulerBinding, SchedulerBackend, SchedulerInstallOptions } from "../../tasks/backends/types";
import { prepareTaskV3Execution } from "../../tasks/prepare/prepare";
import type { PrepareTaskV3ExecutionContext } from "../../tasks/prepare/prepared-execution";
import { isCheckoutInvocation, type ResolvedAkmInvocation, resolveAkmInvocation } from "../../tasks/resolve-akm-bin";
import { activeTaskSources, resolveBundleAsset } from "../../tasks/run/load-task";
import { createExecutionProvenanceContext } from "../../tasks/run/provenance";
import { runTask } from "../../tasks/run/run-task";
import { readTaskHistory } from "../../tasks/run/task-history";
import { exitCodeForStatus, type RunTaskOptions, type TaskRunResult } from "../../tasks/run/task-result";
import { parseSchedule, SCHEDULE_SUPPORTED_SUBSET_HINT } from "../../tasks/schedule";
import {
  compileTaskSchedulerBindings,
  type SchedulerBinding,
  schedulerBindingNativeId,
} from "../../tasks/scheduler-binding";
import { readLegacySchedulerContext, scheduledRowEnvironment } from "../../tasks/scheduler-invocation";
import { withSchedulerLock } from "../../tasks/scheduler-lock";
import {
  compileSchedulerSources,
  installedRowNativeId,
  installedRowOwner,
  installedRowScope,
  planSchedulerSync,
  renderSchedulerPlanPreview,
  type SchedulerBundleScope,
  type SchedulerPlanPreview,
  type SchedulerSourceFailure,
  type SchedulerSyncOperation,
  type SchedulerSyncPlan,
  scheduledInvocationBundle,
} from "../../tasks/scheduler-sync";
import { parseTaskSource } from "../../tasks/source/parse-task-source";
import { projectTaskSourceV4 } from "../../tasks/source/project-v4";
import type { TaskV3SourceDocument } from "../../tasks/source-v3";
import { normaliseTaskConceptId, normaliseTaskId } from "../../tasks/task-id";
import { applyAutonomyGate, configuredDirectAutonomyLanes, describeGatedLanes } from "../improve/autonomy-gate";
import { resolveImproveStrategy } from "../improve/improve-strategies";
⋮----
export interface TasksAddInput {
  id: string;
  schedule: string;




  target?: string;
  workflow?: string;
  prompt?: string;





  command?: string | string[];

  connection?: string;
  harness?: string;

  engine?: string;
  model?: string;
  timeoutMs?: number;
  params?: string;
  name?: string;
  description?: string;
  when_to_use?: string;
  tags?: string[];
  disabled?: boolean;
  force?: boolean;

  rebind?: boolean;
}
⋮----
export interface TasksAddResult {
  id: string;
  ref: string;
  path: string;
  bundleDir: string;
  schedule: string;
  enabled: boolean;
  backend: string;
  target: TaskV3SourceDocument["target"];
}
⋮----
export interface TaskMutationDeps {
  backend?: SchedulerBackend;
  writeAsset?: typeof writeAssetToSource;
  commitBoundary?: typeof commitWriteTargetBoundary;
  schedulerRuntime?: () => PreparedSchedulerRuntime;
}
⋮----
export interface PreparedSchedulerRuntime {
  binding: string[];
  via?: ResolvedAkmInvocation["via"];
}
⋮----
type SchedulerDeps = Pick<TaskMutationDeps, "backend" | "schedulerRuntime">;
⋮----
export async function akmTasksAdd(input: TasksAddInput, deps: TaskMutationDeps =
⋮----
function assertTaskAddTargetShape(input: TasksAddInput): void
⋮----
export interface TasksRunResultEnvelope {
  ok: boolean;
  result: TaskRunResult;
  exitCode: number;
}
⋮----
export async function akmTasksRun(
  id: string,
  options: { scheduled?: boolean; target?: string; inputFlags?: readonly InputFlag[] } = {},
): Promise<TasksRunResultEnvelope>
⋮----
export interface TasksActivationResult {
  readonly ref: string;
  readonly enabled: boolean;
  readonly changed: boolean;
  readonly sync: TasksSyncResult;
}
⋮----
function resolveTaskActivation(
  ref: string,
  target: string | undefined,
  requireSchedulable: boolean,
):
⋮----
async function ensureSchedulerChoice(deps:
⋮----
function initializeSchedulerChoice(
  installed: readonly InstalledSchedulerBinding[],
  config: AkmConfig,
  options: { write: boolean },
): readonly string[]
⋮----
export async function akmTasksEnable(
  ref: string,
  options: { target?: string } = {},
  deps: SchedulerDeps = {},
): Promise<TasksActivationResult>
⋮----
export async function akmTasksDisable(
  ref: string,
  options: { target?: string } = {},
  deps: SchedulerDeps = {},
): Promise<TasksActivationResult>
⋮----
async function setTaskActivation(
  resolved: { qualifiedRef: string; bundleName: string },
  enabled: boolean,
  deps: SchedulerDeps,
): Promise<TasksActivationResult>
⋮----
export interface TasksHistoryResult {
  rows: TaskRunResult[];
}
⋮----
export async function akmTasksHistory(input: {
  id?: string;
  limit?: number;
  target?: string;
}): Promise<TasksHistoryResult>
⋮----
export interface TasksSyncResult {
  installed: string[];

  updated: string[];
  removed: string[];
  unchanged: string[];
  skipped: { id: string; reason: string }[];
  backend: string;







  failures: { path: string; ref?: string; reason: string }[];

  warnings?: string[];
}
⋮----
export async function akmTasksSync(
  deps: SchedulerDeps = {},
  bundleTarget?: string,
  options: { rebind?: boolean } = {},
): Promise<TasksSyncResult>
⋮----
const applied = (ids: readonly string[])
⋮----
export async function akmTasksSyncPlan(
  deps: SchedulerDeps = {},
  bundleTarget?: string,
  options: { rebind?: boolean } = {},
): Promise<SchedulerPlanPreview>
⋮----
async function buildSchedulerSyncPlan(
  deps: SchedulerDeps,
  bundleTarget: string | undefined,
  options: { rebind?: boolean; dryRun?: boolean },
): Promise<
⋮----
function prepareSchedulerRuntime(deps: SchedulerDeps):
⋮----
async function listInstalledRows(sched: SchedulerBackend): Promise<InstalledSchedulerBinding[]>
⋮----
function installedRowBundleDir(row: InstalledSchedulerBinding): string | undefined
⋮----
function bundleScope(bundleName: string, stashDir: string): SchedulerBundleScope
⋮----
function installedSchedulerBundle(config: AkmConfig, row: InstalledSchedulerBinding): string | undefined
⋮----
export type TasksPruneReason = "invalid-context" | "dead-bundle-path";
⋮----
export interface TasksPruneResult {
  readonly backend: string;
  readonly dryRun: boolean;
  readonly preview: SchedulerPlanPreview;
  readonly removed: readonly string[];
}
⋮----
function classifyPruneCandidate(entry: InstalledSchedulerBinding): TasksPruneReason | undefined
⋮----
export async function akmTasksPrune(
  deps: { backend?: SchedulerBackend } = {},
  options: { yes?: boolean; id?: readonly string[] } = {},
): Promise<TasksPruneResult>
⋮----
const prune = async (): Promise<TasksPruneResult> =>
⋮----
function pruneOperations(
  installed: readonly InstalledSchedulerBinding[],
  requestedIds: readonly string[],
): Extract<SchedulerSyncOperation,
⋮----
export interface TasksDoctorResult {
  backend: string;
  akm: { argv: string[]; via: string };
  caller: { argv: string[]; via: string };
  bindings: Array<{
    argv: string[];

    contextPath?: string;
    taskIds: string[];
    status: string[];
  }>;
  remediation?: "akm task sync --rebind";
  logDir: string;
  engine: { defaultEngine?: string; available: string[] };
  scheduleSubset: string;
  warnings: string[];









  improveAutonomy?: {
    enabled: boolean;
    configKey: string;
    gatedLanes: { lane: string; reason: string }[];
  };
  improveTriage?: {
    defaultStrategy: string;
    enabled: boolean;
    applyMode: string;
  };
}
⋮----
export async function akmTasksDoctor(
  deps: { backend?: SchedulerBackend; resolveInvocation?: typeof resolveAkmInvocation } = {},
): Promise<TasksDoctorResult>
⋮----
function groupInstalledBindings(entries: readonly InstalledSchedulerBinding[]): TasksDoctorResult["bindings"]
⋮----
function inspectInstalledBinding(entry: InstalledSchedulerBinding): string[]
⋮----
function taskAssetRef(id: string): AssetRef
⋮----
function resolveTaskBundle(target: string | undefined)
⋮----
function taskProjectionAssetResolver(
  config: AkmConfig,
  bundleName: string,
  bundleRoot: string,
): NonNullable<PrepareTaskV3ExecutionContext["resolveAsset"]>
⋮----
export function resolveTaskReadBundle(
  refBundle: string | undefined,
  flagBundle: string | undefined,
): Pick<ResolvedWriteTarget, "source">
⋮----
function isPrimaryStashPath(candidate: string): boolean
⋮----
function errorMessage(cause: unknown): string
⋮----
interface RenderInput {
  id: string;
  schedule: string;
  workflow?: string;
  prompt?: string;
  command?: string | string[];
  connection?: string;
  harness?: string;
  model?: string;
  timeoutMs?: number;
  params?: string;
  name?: string;
  description?: string;
  when_to_use?: string;
  tags?: string[];
}
⋮----
function jsonSchemaTypeOf(value: unknown): string
⋮----
function renderInputsFromParams(params: Record<string, unknown>): Record<string, unknown>
⋮----
function renderTaskYaml(input: RenderInput): string
⋮----
function assertInlineTaskPrompt(input: string): void
⋮----
function parseJsonObjectArg(raw: string): Record<string, unknown>
⋮----
export function parseTaskRef(input: string):
⋮----
export function taskIdForAdapter(parsedId: string, adapterId: string): string
`````

## File: src/commands/ui/api.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { parsePositiveIntFlag } from "../../cli/parse-args";
import { parseBundleRef } from "../../core/asset/asset-ref";
import { parseMarkdownToc, uniqueHeadingSlugs } from "../../core/asset/markdown";
import { markdownLinkTargets } from "../../core/asset/markdown-link-targets";
import { typeNameFromConceptId } from "../../core/asset/resolve-ref";
import { resolveStashDir } from "../../core/common";
import { getConfigValueSource, loadConfig } from "../../core/config/config";
import { NotFoundError, UsageError } from "../../core/errors";
import { getConfigPath, getDataDir, getDbPath } from "../../core/paths";
import { getStateDbPath, listPendingStateMigrations } from "../../core/state-db";
import { DURATION_UNITS, parseDuration } from "../../core/time";
import { resolveWriteTarget } from "../../core/write-source";
import { findSourceForPath, resolveSourceEntries } from "../../indexer/search/search-source";
import { type Database, openDatabase } from "../../storage/database";
import { listRecentImproveRuns } from "../../storage/repositories/improve-runs-repository";
import { closeDatabase, openReadonlyExistingDatabase } from "../../storage/repositories/index-connection";
import { getEntryIdByFilePath, getItemRefById } from "../../storage/repositories/index-entries-repository";
import { getEmbeddingCount } from "../../storage/repositories/index-vec-repository";
import {
  countFeedbackBySignal,
  listFeedbackEventRows,
  listUsageEventRows,
} from "../../storage/repositories/metrics-repository";
import { listStateProposals } from "../../storage/repositories/proposals-repository";
import { applyReadonlyPragmas } from "../../storage/sqlite-pragmas";
import { pkgVersion } from "../../version";
import { listConfig } from "../config-cli";
import { akmHealth } from "../health";
import { computeAcceptRateBySource } from "../health/accept-rate";
import { akmMetrics } from "../metrics/metrics-cli";
import { isRetireProposal, type Proposal, proposalWaitingSince } from "../proposal/proposal-types";
import { diffLoadedProposal, resolveProposalIdIn } from "../proposal/repository";
import { validateProposal } from "../proposal/validators/proposals";
import { akmSearch, normalizeScopeFilters, parseBeliefFilterMode } from "../read/search";
import { akmShowUnified } from "../read/show";
import { assembleInfo } from "../sources/info";
import { akmListSources } from "../sources/installed-stashes";
import { readDocumentSource } from "./document-source";
import { readBundleGitStatus, readFileRevision, readRecentCommits } from "./git-read";
import { isSecretEnvName, redactForUi } from "./redact";
⋮----
export interface UiServerInfo {
  startedAt: string;
  host: string;
  port: number;
}
⋮----
type Query = URLSearchParams;
type Handler = (query: Query, info: UiServerInfo) => unknown | Promise<unknown>;
⋮----
function limitParam(query: Query, fallback = DEFAULT_LIST_LIMIT): number
⋮----
function flag(query: Query, name: string): boolean
⋮----
function withReadonlyStateDb<T>(fn: (db: Database) => T, fallback: T): T
⋮----
function tryStashDir(): string | null
⋮----
async function section<T>(errors: Record<string, string>, name: string, fn: () => T | Promise<T>): Promise<T | null>
⋮----
function meta(_query: Query, info: UiServerInfo)
⋮----
function summarizeImproveRun(row: ReturnType<typeof listRecentImproveRuns>[number])
⋮----
function usageByDay(db: Database, nowMs: number)
⋮----
async function overview(query: Query)
⋮----
async function bundles()
⋮----
interface ConfigEntry {
  path: string;
  value: unknown;

  source: string | null;
}
⋮----
function configLeaves(value: unknown, prefix: string[], out: Array<
⋮----
function configSource(path: string[]): string | null
⋮----
function config()
⋮----
const named = (entries: unknown)
⋮----
// ── /api/proposals ───────────────────────────────────────────────────────────
⋮----
export function proposalSummary(proposal: Proposal)
⋮----
function proposals(query: Query)
⋮----
function targetsSensitiveAsset(proposal: Proposal): boolean
⋮----
function capSide(text: string | null):
⋮----
function proposalDiffView(proposal: Proposal)
⋮----
function proposalDetail(id: string)
⋮----
async function changes(query: Query)
⋮----
async function search(query: Query)
⋮----
// `--from <name>` narrows to one configured bundle; absent means every local bundle, as `akm search` does.
⋮----
/** The durable `bundle//conceptId` of the indexed asset at `filePath`, the key feedback rows use. */
function durableRefForPath(filePath: string): string | null
⋮----
function feedbackFor(durableRef: string | null)
⋮----
// Metadata is optional.
⋮----
// `created_at` is SQLite's `YYYY-MM-DD HH:MM:SS` in UTC.
⋮----
async function asset(query: Query)
⋮----
async function assetHistory(query: Query)
⋮----
/** What {@link handleApiRequest} returns for a path that is not an API route. */
⋮----
export async function handleApiRequest(pathname: string, query: Query, info: UiServerInfo): Promise<unknown>
`````

## File: src/commands/ui/document-source.ts
`````typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { assetPathForName, stashDirFor } from "../../core/asset/asset-placement";
import { parseRefInput } from "../../core/asset/resolve-ref";
import { loadConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { resolveBundleWriteTarget } from "../../core/mutation-target";
import { assertAkmAssetWrite } from "../../core/write-source";
import { closeDatabase, openReadonlyExistingDatabase } from "../../storage/repositories/index-connection";
import { getEntryIdByFilePath, getItemRefById } from "../../storage/repositories/index-entries-repository";
import { akmShowUnified } from "../read/show";
import { redactUrlsInText } from "./redact";
⋮----
export async function readDocumentSource(ref: string): Promise<
`````

## File: src/commands/ui/git-read.ts
`````typescript
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
⋮----
function git(repoDir: string, args: string[]): Promise<string | null>
⋮----
export function isGitRoot(dir: string): boolean
⋮----
export interface GitCommitSummary {
  sha: string;
  time: string;
  subject: string;
}
⋮----
export interface BundleGitStatus {
  branch: string | null;
  upstream: string | null;

  ahead: number | null;

  behind: number | null;

  dirtyPaths: number;
  lastCommit: GitCommitSummary | null;
}
⋮----
export async function readBundleGitStatus(repoDir: string): Promise<BundleGitStatus | null>
⋮----
/** What made a commit, judged from its subject: the subjects akm itself writes, else `other`. */
export type ChangeOrigin = "improve-sync" | "accept" | "remember" | "sync" | "other";
⋮----
export function classifyCommitOrigin(subject: string): ChangeOrigin
⋮----
export interface StashCommit extends GitCommitSummary {
  shortSha: string;
  author: string;
  origin: ChangeOrigin;
  paths: string[];
  pathCount: number;
}
⋮----
export async function readRecentCommits(repoDir: string, limit: number, file?: string): Promise<StashCommit[] | null>
⋮----
export async function readFileRevision(repoDir: string, file: string, sha: string)
`````

## File: src/commands/ui/open-browser.ts
`````typescript
import { spawn } from "node:child_process";
⋮----
export function browserOpener(url: string, platform: NodeJS.Platform = process.platform): [string, string[]]
⋮----
export function openBrowser(url: string): Promise<boolean>
`````

## File: src/commands/ui/proposal-actions.ts
`````typescript
import { AkmError, TransientError, UsageError } from "../../core/errors";
import { acquireAssetMutationLease } from "../../indexer/index-writer-lock";
import {
  akmProposalAccept,
  akmProposalAcceptMany,
  akmProposalReject,
  type ProposalAcceptFailure,
  type ProposalAcceptResult,
} from "../proposal/proposal";
import { proposalSummary } from "./api";
import { type GitCommitSummary, readBundleGitStatus } from "./git-read";
⋮----
export type WriteRoute = { kind: "accept"; id: string } | { kind: "reject"; id: string } | { kind: "accept-many" };
⋮----
export function matchWriteRoute(pathname: string): WriteRoute | null
⋮----
export interface ProposalActionError {
  status: number;
  code: string;
  message: string;
}
⋮----
function codeForMessage(message: string): string | null
⋮----
export function classifyProposalError(error: unknown): ProposalActionError
⋮----
function bodyObject(body: unknown): Record<string, unknown>
⋮----
function rejectReason(body: unknown): string
⋮----
function batchIds(body: unknown): string[]
⋮----
// ── Execution ────────────────────────────────────────────────────────────────
⋮----
/**
 * Fail fast when another writer holds the asset-mutation lease. The accept and
 * reject functions would wait up to ten minutes for it, which in a browser is a
 * hung button; the probe turns a held lease into an immediate, retryable 409.
 */
export async function assertWriteLeaseFree(purpose: string): Promise<void>
⋮----
type CommitSummary = GitCommitSummary & { repo: string };
⋮----
/**
 * The commit an accept just made, if any. The accept functions do not return it,
 * so read the head commit of each accepted proposal's repository and keep one
 * that carries akm's accept subject and is newer than the request. `null` for a
 * bundle that is not a git repository (nothing was committed).
 */
async function acceptCommit(accepted: ProposalAcceptResult[], startedMs: number): Promise<CommitSummary | null>
⋮----
function acceptedView(result: ProposalAcceptResult)
⋮----
function failedView(failure: ProposalAcceptFailure)
⋮----
export async function handleWriteRequest(route: WriteRoute, body: unknown): Promise<unknown>
`````

## File: src/commands/ui/redact.ts
`````typescript
import { isApiKeyReference } from "../../core/config/schema/primitives";
import { REDACTED, redactUrlCredentials } from "../../core/redaction";
⋮----
export function redactUrlsInText(text: string): string
⋮----
export function scrubUrlCredentials(value: unknown): unknown
⋮----
export function redactForUi(value: unknown, inSecretBag = false): unknown
⋮----
export function isSecretEnvName(name: string): boolean
`````

## File: src/commands/ui/server.ts
`````typescript
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import appJs from "../../assets/ui/app.js" with { type: "text" };
import assetJs from "../../assets/ui/asset.js" with { type: "text" };
import bundlesJs from "../../assets/ui/bundles.js" with { type: "text" };
import changesJs from "../../assets/ui/changes.js" with { type: "text" };
import chartsJs from "../../assets/ui/charts.js" with { type: "text" };
import configJs from "../../assets/ui/config.js" with { type: "text" };
import diffJs from "../../assets/ui/diff.js" with { type: "text" };
import diffViewJs from "../../assets/ui/diff-view.js" with { type: "text" };
import editorJs from "../../assets/ui/editor.js" with { type: "text" };
import indexHtml from "../../assets/ui/index.html" with { type: "text" };
import libJs from "../../assets/ui/lib.js" with { type: "text" };
import markdownJs from "../../assets/ui/markdown.js" with { type: "text" };
import overviewJs from "../../assets/ui/overview.js" with { type: "text" };
import proposalActionsJs from "../../assets/ui/proposal-actions.js" with { type: "text" };
import proposalsJs from "../../assets/ui/proposals.js" with { type: "text" };
import searchJs from "../../assets/ui/search.js" with { type: "text" };
import stylesCss from "../../assets/ui/styles.css" with { type: "text" };
import { AkmError } from "../../core/errors";
import { getDirname } from "../../runtime";
import { handleApiRequest, NO_SUCH_ROUTE, type UiServerInfo } from "./api";
import { classifyProposalError, handleWriteRequest, matchWriteRoute } from "./proposal-actions";
import { scrubUrlCredentials } from "./redact";
import {
  classifyWorkspaceError,
  handleWorkspaceAction,
  matchWorkspaceAction,
  type WorkspaceAction,
} from "./workspace-actions";
⋮----
export interface UiServerOptions {

  host?: string;

  port?: number;

  token?: string;
}
⋮----
export interface UiServer extends UiServerInfo {
  token: string;

  url: string;
  close(): Promise<void>;
}
⋮----
close(): Promise<void>;
⋮----
function isWildcardHost(host: string): boolean
⋮----
function isLoopbackHost(host: string): boolean
⋮----
function urlHost(host: string): string
⋮----
export function isLoopbackBind(host: string): boolean
⋮----
function hostAllowed(header: string | undefined, host: string, port: number): boolean
⋮----
function tokenMatches(given: string | null | undefined, expected: string): boolean
⋮----
function sendJson(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extra: Record<string, string> = {},
): void
⋮----
function sendError(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  status: number,
  code: string,
  error: string,
  extra: Record<string, string> = {},
): void
⋮----
function originAllowed(origin: string | undefined, hostHeader: string | undefined): boolean
⋮----
function isJsonContentType(header: string | undefined): boolean
⋮----
function readBody(req: http.IncomingMessage, limit: number): Promise<string | null>
⋮----
function statusFor(error: unknown): number
⋮----
function readUiAsset(urlPath: string):
⋮----
// Not on disk: fall back to the embedded copy below.
⋮----
export async function startUiServer(options: UiServerOptions =
⋮----
async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>
⋮----
async function handleWrite(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    route: NonNullable<ReturnType<typeof matchWriteRoute>> | { workspace: WorkspaceAction },
): Promise<void>
`````

## File: src/commands/ui/ui-cli.ts
`````typescript
import { defineJsonCommand } from "../../cli/shared";
import { UsageError } from "../../core/errors";
import { info, warn } from "../../core/warn";
import { openBrowser } from "./open-browser";
import { isLoopbackBind, startUiServer } from "./server";
⋮----
function parsePort(raw: string | undefined): number
⋮----
async run(
⋮----
const stop = () =>
`````

## File: src/commands/ui/workspace-actions.ts
`````typescript
import { execFile } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { parseRefInput } from "../../core/asset/resolve-ref";
import {
  getConfigValueSource,
  loadConfig,
  mutateConfig,
  resetConfigCache,
  sanitizeConfigForWrite,
} from "../../core/config/config";
import { AkmError, type AkmErrorKind, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { resolveAkmInvocation } from "../../tasks/resolve-akm-bin";
import { setConfigValue, unsetConfigValue } from "../config-cli";
import { writeMarkdownAsset } from "../read/knowledge";
import { readDocumentSource } from "./document-source";
import { assertWriteLeaseFree, classifyProposalError, type ProposalActionError } from "./proposal-actions";
import { redactForUi, redactUrlsInText } from "./redact";
⋮----
export type WorkspaceAction =
  | "feedback"
  | "bundle-add"
  | "bundle-remove"
  | "bundle-update"
  | "bundle-settings"
  | "document-save"
  | "knowledge-create";
⋮----
export function matchWorkspaceAction(path: string): WorkspaceAction | null
⋮----
function object(value: unknown): Record<string, unknown>
⋮----
function text(body: Record<string, unknown>, key: string): string
⋮----
function positional(body: Record<string, unknown>, key: string): string
⋮----
function preserveUnrelatedConfig(config = loadConfig())
⋮----
class CommandError extends AkmError
⋮----
constructor(
    message: string,
    readonly code: string,
    exitCode: string | number | null | undefined,
)
hint()
⋮----
export function parseCommandResponse(stdout: string, expectedShape: string): unknown
⋮----
export function classifyWorkspaceError(error: unknown): ProposalActionError
⋮----
async function command(args: string[], input?: string, userFeedback = false): Promise<unknown>
⋮----
function settings(body: Record<string, unknown>)
⋮----
export async function handleWorkspaceAction(action: WorkspaceAction, value: unknown): Promise<unknown>
`````

## File: src/commands/workflow/plan.ts
`````typescript
import { loadConfig } from "../../core/config/config";
import { NotFoundError } from "../../core/errors";
import type { TaskInputBinding } from "../../execution/input-contract";
import type { LoweringNotice } from "../../execution/resolved-request";
import { buildExecutionFromWire } from "../../integrations/agent/execution";
import type { WorkflowStepOrchestrationSummary } from "../../sources/types";
import { freezeWorkflow } from "../../workflows/freeze/freeze";
import { computePlanHash } from "../../workflows/ir/plan-hash";
import type {
  FrozenChildWorkflowTarget,
  FrozenWorkflowCommandTarget,
  FrozenWorkflowEnvironmentBinding,
  FrozenWorkflowTarget,
  WorkflowPlan,
  WorkflowPlanStep,
  WorkflowUnitNode,
} from "../../workflows/plan";
import { resolveOrchestrationRefs, summarizeStepOrchestration } from "../../workflows/renderer";
import { loadWorkflowAsset } from "../../workflows/runtime/workflow-asset-loader";
⋮----
function stepUnit(step: WorkflowPlanStep): WorkflowUnitNode | undefined
⋮----
function projectEnvironmentBinding(binding: FrozenWorkflowEnvironmentBinding): Record<string, unknown>
⋮----
function projectInputBinding(binding: TaskInputBinding): Record<string, unknown>
⋮----
function childExpansion(target: FrozenChildWorkflowTarget): Record<string, unknown>
⋮----
function stepExpansion(frozenTarget: FrozenWorkflowTarget | undefined): Record<string, unknown>
⋮----
function stepOrchestration(
  step: WorkflowPlanStep,
  plan: Pick<WorkflowPlan, "defaults">,
): WorkflowStepOrchestrationSummary | undefined
⋮----
function projectStep(
  step: WorkflowPlanStep,
  sequenceIndex: number,
  orchestration?: WorkflowStepOrchestrationSummary,
): Record<string, unknown>
⋮----
function collectLoweringNotices(plan: WorkflowPlan, config: ReturnType<typeof loadConfig>): LoweringNotice[]
⋮----
const lower = (target: FrozenWorkflowCommandTarget): void =>
⋮----
function unresolvedRefs(
  steps: readonly WorkflowPlanStep[],
  orchestrations: ReadonlyArray<WorkflowStepOrchestrationSummary | undefined>,
): string[]
⋮----
function unresolvedInChildren(plan: WorkflowPlan): string[]
⋮----
function failOnUnresolved(ref: string, unresolved: readonly string[]): void
⋮----
export async function akmWorkflowPlan(ref: string): Promise<Record<string, unknown>>
`````

## File: src/commands/completions.ts
`````typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { placementTypes } from "../core/asset/asset-placement";
⋮----
type AnyCmd = Record<string, any>;
⋮----
interface FlagValueRule {

  paths?: string[];
  values: string[] | (() => string[]);
}
⋮----
function resolveRuleValues(rule: FlagValueRule): string[]
⋮----
function buildFlagValueCaseBody(rules: FlagValueRule[]): string
⋮----
// ── Command tree walker ──────────────────────────────────────────────────────
⋮----
interface CommandInfo {
  path: string; // e.g. "registry search"
  subcommands: string[];
  flags: string[];
  valueFlags: string[];
}
⋮----
path: string; // e.g. "registry search"
⋮----
function walkCommandTree(cmd: AnyCmd, parentPath = ""): CommandInfo[]
⋮----
// `meta.hidden` (e.g. `migrate`, S11) is excluded from completion the same
// way citty's own `renderUsage` excludes it from a rendered COMMANDS list —
// a hidden command still runs, it just isn't suggested.
⋮----
export function generateBashCompletions(cmd: AnyCmd): string
⋮----
export function installBashCompletions(script: string): string
⋮----
function resolveInstallPath(): string
⋮----
function isDir(p: string): boolean
`````

## File: src/commands/config-cli.ts
`````typescript
import { isDeepStrictEqual } from "node:util";
import { defineGroupCommand, defineJsonCommand, output } from "../cli/shared";
import { isRecord } from "../core/common";
import {
  type AkmConfig,
  DEFAULT_CONFIG,
  getConfigValueSource,
  loadConfig,
  mutateConfig,
  parseAndValidateConfigText,
  resolveConfigRefSource,
  unusableEntryAt,
} from "../core/config/config";
import { configGet, configSet, configUnset, unknownKeyHint } from "../core/config/config-walker";
import { isEnvReference } from "../core/config/schema/primitives";
import { UsageError } from "../core/errors";
import { getConfigPath } from "../core/paths";
import { formatRegistryUrl } from "../core/registry-url";
⋮----
export function getConfigValue(config: AkmConfig, key: string): unknown
⋮----
export function setConfigValue(config: AkmConfig, key: string, rawValue: string): AkmConfig
⋮----
export function unsetConfigValue(config: AkmConfig, key: string): AkmConfig
⋮----
export function listConfig(config: AkmConfig): Record<string, unknown>
⋮----
function redactConfigValue(value: unknown, path: string[] = []): unknown
⋮----
function isRegistryUrlPath(path: string[]): boolean
⋮----
export interface ConfigDiffRow {
  path: string;
  local: unknown;
  other: unknown;
}
⋮----
function flattenConfigLeaves(value: unknown, prefix: string[], out: Map<string, unknown>): void
⋮----
function diffConfigs(local: unknown, other: unknown): ConfigDiffRow[]
⋮----
export function akmConfigDiff(ref: string):
⋮----
run()
⋮----
run(
`````

## File: src/commands/feedback-cli.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { defineJsonCommand, output, parseAllFlagValues } from "../cli/shared";
import { assetPathForName, stashDirFor } from "../core/asset/asset-placement";
import { makeBundleRef, parseBundleRef } from "../core/asset/asset-ref";
import { assembleAsset, serializeFrontmatter } from "../core/asset/asset-serialize";
import { parseFrontmatter, parseFrontmatterBlock, spliceFrontmatterLine } from "../core/asset/frontmatter";
import { type AssetRef, conceptIdFromTypeName, parseRefInput, typeNameFromConceptId } from "../core/asset/resolve-ref";
import { isWithin, resolveStashDir, safeRealpath, writeFileAtomic } from "../core/common";
import { loadConfig } from "../core/config/config";
import { ConfigError, NotFoundError, UsageError } from "../core/errors";
import { appendEvent } from "../core/events";
import { resolveMutationTarget } from "../core/mutation-target";
import { isPathAbsent } from "../core/path-access";
import { getDbPath } from "../core/paths";
import { getStateDbPath, withStateDb } from "../core/state-db";
import { warn } from "../core/warn";
import { withWriteTargetMutation } from "../core/write-source";
import { recomputeUtilityScores } from "../indexer/indexer";
import { resolveSourceEntries } from "../indexer/search/search-source";
import { insertUsageEventStrict, resolveUsageEventSource } from "../indexer/usage/usage-events";
import { resolveSourcesForOrigin } from "../registry/origin-resolve";
import type { Database } from "../storage/database";
import { closeDatabase, openExistingDatabase } from "../storage/repositories/index-connection";
import {
  findEntryIdByRef,
  getEntryFilePathById,
  getItemRefById,
} from "../storage/repositories/index-entries-repository";
import { getUtilityScore } from "../storage/repositories/index-utility-repository";
import { contentHash } from "./improve/content-hash";
import { readEdgeList } from "./improve/memory/memory-belief";
import { akmProposalAccept } from "./proposal/proposal";
import { createProposal, recordGateDecision, rejectProposalDurably } from "./proposal/repository";
⋮----
function validateFeedbackTags(raw: string[]): string[]
⋮----
function appendLessonStrength(refInput: AssetRef, feedbackRef: string):
⋮----
function buildLessonStrengthUpdate(rawBytes: Buffer, feedbackRef: string):
⋮----
interface RecordFeedbackUsageResult {
  utilityResult: { previousUtility: number; nextUtility: number } | undefined;

  countsTowardRanking: boolean;

  rankingSkippedReason: string | undefined;
}
⋮----
function recordFeedbackUsage(
  indexDb: Database,
  entryId: number,
  durableEntryRef: string,
  signal: "positive" | "negative",
  metadataStr: string | undefined,
): RecordFeedbackUsageResult
⋮----
function judgedTextHash(itemRef: string, filePath: string | undefined): string | undefined
⋮----
function startLines(text: string, needle: string): number[]
⋮----
export function applyExactReplacements(
  text: string,
  pairs: ReadonlyArray<{ old: string; new: string }>,
  file: string,
): string
⋮----
function assertFrontmatterStillParses(before: string, after: string, file: string): void
⋮----
export function assertProposalWritesFile(itemRef: string, root: string, filePath: string): void
⋮----
type HistoryMark = { supersededBy: string } | { outdated: true };
⋮----
function resolveSuccessorRef(db: Database, input: string, itemRef: string): string
⋮----
function frontmatterMapping(text: string): Record<string, unknown> | undefined
⋮----
function historyMarkChanges(
  data: Record<string, unknown>,
  mark: HistoryMark,
):
⋮----
function topLevelKeyLine(lines: string[], key: string): number
⋮----
function setBeliefState(text: string, state: string): string
⋮----
function setSupersededBy(text: string, list: string[], ref: string): string
⋮----
const item = (value: string) => `- $
⋮----
// A flow list, a scalar or no value: this one key is written out as a block list.
⋮----
export function applyHistoryMark(raw: string, mark: HistoryMark, file: string): string
⋮----
async run(
`````

## File: src/commands/health.ts
`````typescript
import fs from "node:fs";
import path from "node:path";
import { daysToMs, resolveStashDir } from "../core/common";
import { loadConfig } from "../core/config/config";
import { ConfigError, rethrowIfTestIsolationError, UsageError } from "../core/errors";
import { classifyPathAccess, describeInaccessiblePath } from "../core/path-access";
import { getConfigPath, getDataDir, getDbPath, getStateDbPathInDataDir } from "../core/paths";
import {
  listExistingTableNames,
  listPendingStateMigrations,
  openStateDatabaseWithReport,
  withStateDb,
} from "../core/state-db";
import { DURATION_UNITS, parseDuration, parseSinceToIso } from "../core/time";
import { probeLlmEndpoint } from "../llm/client";
import { type Database, openDatabase } from "../storage/database";
import { insertEvent } from "../storage/repositories/events-repository";
import { getExtractOutcomeCountsSince } from "../storage/repositories/extract-sessions-repository";
import { closeDatabase, openReadonlyExistingDatabase } from "../storage/repositories/index-connection";
import { getAllEntries } from "../storage/repositories/index-entries-repository";
import { queryTaskHistory } from "../storage/repositories/task-history-repository";
import { applyReadonlyPragmas } from "../storage/sqlite-pragmas";
import { getStateDbFreelistInfo, runStateDbIntegrityCheck } from "../storage/state-db-integrity";
import { pkgVersion } from "../version";
import { collectArchiveUsageAdvisory } from "./health/archive-usage";
import {
  HEALTH_CHECKS,
  type HealthCheckContext,
  runPendingStateMigrationsCheck,
  SESSION_EXTRACTION_LEDGER_WINDOW_DAYS,
} from "./health/checks";
import { collectConfigSkewAdvisory } from "./health/config-skew";
import { runConnectionsAndHarnessesCheck } from "./health/connections-and-harnesses-check";
import { collectDataDirUsageAdvisory } from "./health/data-dir-usage";
import { collectEgressAdvisory, type EgressConfigView } from "./health/egress";
import { emptyImproveMetrics, roundRate } from "./health/improve-metrics";
import { emptyLlmUsageAggregate, readLlmUsageAggregate } from "./health/llm-usage";
import { collectPluginStalenessAdvisories } from "./health/plugin-staleness";
import { collectSchedulerBinaryAdvisory } from "./health/scheduler-binary";
import { readSemanticSearchState } from "./health/semantic-search-check";
import { collectStashExposureAdvisory, type GitRunner } from "./health/stash-exposure";
import { buildTypeDirectoryAdvisory } from "./health/type-directory-check";
import {
  type AkmHealthResult,
  type DeltaEntry,
  type HealthCheckResult,
  type HealthMetrics,
  type ImproveRunSummary,
  MIN_ROWS_FOR_WORST_TASK_FAIL_RATE,
  type WindowResult,
  type WindowSpec,
} from "./health/types";
import { collectVersionDriftAdvisory } from "./health/version-drift";
import {
  buildImproveWindowSummary,
  buildWindowMetrics,
  computeDeltas,
  computeTaskWindowRates,
  resolveWindowCompare,
} from "./health/windows";
⋮----
export interface AkmHealthOptions {
  since?: string;

  groupBy?: "run";
  windowCompare?: string;
  windows?: WindowSpec[];





  now?: () => number;








  stateDbPath?: string;

  stashDir?: string;






  stashExposureGit?: GitRunner;





  probe?: boolean;






  readOnly?: boolean;
}
⋮----
export function parseHealthSince(since?: string): string
⋮----
// Unit grammar is the CLI-wide canonical map: `m` = minutes, `M` = months.
// (Historically `--since 5m` meant 5 months here; it now means 5 minutes,
// with `5M` for months — unified with consolidate / `--window-compare`.)
// Not lower-cased: case distinguishes `m` (minutes) from `M` (months).
⋮----
function validateAkmHealthOptions(options: AkmHealthOptions): void
⋮----
export function probeStateDbRoundTrip(stateDbPath: string):
⋮----
interface TaskHistoryPhase {
  tableNames: string[];
  missingTables: string[];
  probe: ReturnType<typeof probeStateDbRoundTrip>;
  stateDbIntegrity: ReturnType<typeof runStateDbIntegrityCheck>;
  stateDbFreelist: ReturnType<typeof getStateDbFreelistInfo>;
  taskRowCount: number;
  stuckActiveRuns: number;
  stuckActiveTasks: { taskId: string; ageMs: number }[];
  taskFailRate: number;
  worstTaskFailRate: { taskId: string; rate: number; rows: number } | null;
  agentFailureRate: number;
  agentFailureReasonCounts: Record<string, number>;
}
⋮----
function dedupeStuckActiveTasks(
  rows: { task_id: string; started_at: string }[],
  now: () => number,
):
⋮----
function computeWorstTaskFailRate(
  rows: { task_id: string; status: string }[],
):
⋮----
function gatherTaskHistoryPhase(
  db: Database,
  since: string,
  stateDbPath: string,
  now: () => number,
  readOnly: boolean,
): TaskHistoryPhase
⋮----
function gatherEgressConfigView(): EgressConfigView | undefined
⋮----
function gatherSemanticSearchMode(): string | undefined
⋮----
function gatherSessionExtractionLedgerPhase(
  db: Database,
  now: () => number,
): HealthCheckContext["sessionExtractionLedger"]
⋮----
function gatherAncillaryAdvisories(
  db: Database,
  options: AkmHealthOptions,
  egressConfigView: EgressConfigView | undefined,
): HealthCheckResult[]
⋮----
function detectTypeDirectoryDisagreements(stashRoot: string): HealthCheckResult | undefined
⋮----
function detectIndexStateGenerationMismatch(stateDb: Database): HealthCheckResult | undefined
⋮----
interface WindowComparePhaseResult {
  windowResults: WindowResult[] | undefined;
  deltas: Record<string, DeltaEntry> | undefined;
}
⋮----
function resolveWindowComparePhase(
  options: AkmHealthOptions,
  db: Database,
  stateDbPath: string,
  now: () => number,
): WindowComparePhaseResult
⋮----
function degradedStateDbReport(hardCheck: HealthCheckResult, options: AkmHealthOptions): AkmHealthResult
⋮----
function unreadableStateDbCheck(detail: string): HealthCheckResult
⋮----
function readOnlyStateDbUnavailable(stateDbPath: string): HealthCheckResult | undefined
⋮----
export async function akmHealth(options: AkmHealthOptions =
`````

## File: src/commands/log.ts
`````typescript
import { makeBundleRef, parseBundleRef } from "../core/asset/asset-ref";
import { loadConfig } from "../core/config/config";
import { UsageError } from "../core/errors";
import { type EventsContext, readEvents } from "../core/events";
import type { EventEnvelope } from "../core/events-types";
import { parseSinceToIso } from "../core/time";
⋮----
export interface EventsListOptions {
  since?: string;
  type?: string;
  ref?: string;
  excludeTags?: string[];
  includeTags?: string[];

  limit?: number;





  run?: string;

  ctx?: EventsContext;
}
⋮----
function parseSinceFlag(since: string | undefined):
⋮----
export interface EventsListResult {
  schemaVersion: 1;
  totalCount: number;
  ref?: string;
  type?: string;
  since?: string;

  sinceOffset?: number;

  limit?: number;

  run?: string;
  nextOffset: number;
  events: EventEnvelope[];
}
⋮----
function validateRef(ref: string | undefined): string | undefined
⋮----
function validateRunId(run: string | undefined): string | undefined
⋮----
export function akmEventsList(options: EventsListOptions =
`````

## File: src/commands/migrate-cli.ts
`````typescript
import { defineGroupCommand, defineJsonCommand, EXIT_CODES, outputWithExitCode } from "../cli/shared";
import { runMigrationTool } from "./migration-tool";
⋮----
export type RunMigrationTool = typeof runMigrationTool;
⋮----
export async function runMigrateSubcommand(
  command: "migrate-status" | "migrate-apply",
  args: readonly string[],
  runTool: RunMigrationTool = runMigrationTool,
): Promise<void>
⋮----
run()
⋮----
run(
`````

## File: src/commands/migration-tool.ts
`````typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { NotFoundError } from "../core/errors";
⋮----
function migrationEntryPoint(): string | undefined
⋮----
export interface MigrationToolResult {
  status: number;
  stdout: string;
  stderr: string;
}
⋮----
export async function runMigrationTool(args: readonly string[]): Promise<MigrationToolResult>
`````

## File: src/commands/models-cli.ts
`````typescript
import { defineGroupCommand, defineJsonCommand, GLOBAL_OUTPUT_ARGS, output } from "../cli/shared";
import {
  type AkmConfig,
  type ConnectionConfig,
  defaultConnection,
  loadConfig,
  mutateConfig,
} from "../core/config/config";
import { resolveApiKey } from "../core/config/credentials";
import { entryModel, entryWithModel } from "../core/config/model-aliases";
import { ConfigError, UsageError } from "../core/errors";
import { redactUrlCredentials } from "../core/redaction";
import { warn } from "../core/warn";
import { selectionNotConfigured } from "../integrations/agent/resolution";
import { listEndpointModels } from "../llm/model-list";
⋮----
function targetConnection(config: AkmConfig, name: string | undefined):
⋮----
async function availableModels(name: string, connection: ConnectionConfig, probe: boolean): Promise<string[]>
⋮----
const probes = (args: object): boolean => (args as
⋮----
async defaultRun(
⋮----
async run(
`````

## File: src/commands/observability-cli.ts
`````typescript
import { parsePositiveIntFlag } from "../cli/parse-args";
import { defineJsonCommand, output, parseAllFlagValues } from "../cli/shared";
import { UsageError } from "../core/errors";
import { akmEventsList } from "./log";
⋮----
function rejectExtraLogPositionals(positionals: unknown): void
⋮----
run(
`````

## File: src/commands/registry-cli.ts
`````typescript
import { defineGroupCommand, defineJsonCommand, output } from "../cli/shared";
import type { RegistryConfigEntry } from "../core/config/config";
import { getEffectiveRegistries, loadUserConfig, mutateConfig } from "../core/config/config";
import { NotFoundError, UsageError } from "../core/errors";
import {
  formatRegistryLabel,
  formatRegistryUrl,
  hasRegistryUrlCredentials,
  registryEntryForOutput,
} from "../core/registry-url";
import { warn } from "../core/warn";
⋮----
async run()
⋮----
async run(
`````

## File: src/commands/remember.ts
`````typescript
import { serializeFrontmatter } from "../core/asset/asset-serialize";
import { DESCRIPTION_MAX_CHARS } from "../core/authoring-rules";
import { toErrorMessage, tryReadStdinText } from "../core/common";
import { loadConfig } from "../core/config/config";
import { SHIPPED_ALIAS } from "../core/config/model-aliases";
import { ConfigError, UsageError } from "../core/errors";
import { parseEmbeddedJsonResponse } from "../core/parse";
import { DURATION_UNITS, parseDuration as parseDurationSpec } from "../core/time";
import { warn } from "../core/warn";
import { noticeSet } from "../execution/notices";
import type { LoweringNotice } from "../execution/resolved-request";
import type { StashEntryScope } from "../indexer/passes/metadata";
import { SCOPE_KEYS } from "../indexer/passes/metadata";
import { callStructured } from "../llm/structured-call";
import { withLlmStage } from "../llm/usage-telemetry";
import { resolveImproveExecution } from "./improve/execution";
⋮----
export interface MemoryFrontmatterFields {
  description?: string;
  tags?: string[];
  source?: string;







  xrefs?: string[];
  observed_at?: string;
  expires?: string;
  subjective?: boolean;
  scope?: StashEntryScope;





  captureMode?: "hot" | "background";






  beliefState?: string;
}
⋮----
export function parseDuration(s: string): number
⋮----
export function buildMemoryFrontmatter(fields: MemoryFrontmatterFields): string
⋮----
export function readMemoryContent(contentArg: string | undefined): string
⋮----
function splitIntoSentences(text: string): string[]
⋮----
/**
 * Deterministically synthesize a `description` from a memory body when the
 * caller didn't supply one (#834): `akm remember`'s hot-capture path used to
 * write memories with no `description:` and no `tags:`, and akm's indexer
 * covers only synthesized frontmatter/headings — never body prose — so those
 * memories were retrievable only by whatever words survived into the
 * auto-generated filename. This closes that gap at write time.
 *
 * Skips a leading markdown heading line (if any) so the description reads as
 * prose rather than repeating the title, then accumulates whole sentences
 * from the body until the next one would exceed `capChars`, hard-truncating
 * only if the very first sentence alone is over the cap. Pure, deterministic,
 * no LLM call — `akm remember` must stay a fast local write.
 */
export function synthesizeMemoryDescription(body: string, capChars = DESCRIPTION_MAX_CHARS): string
⋮----
/**
 * Result of running `--auto` heuristics on a memory body.
 *
 * `tags` is always an array (possibly empty) so callers can accumulate
 * without null-checks. The caller is responsible for giving CLI-supplied
 * values precedence over heuristic-derived ones.
 */
export interface HeuristicResult {
  tags: string[];
  source?: string;
  observed_at?: string;
  subjective?: boolean;
}
⋮----
/**
 * Run heuristic analysis on memory body text. Returns derived metadata
 * fields without modifying any files. Pure TS, zero network, zero latency.
 */
export function runAutoHeuristics(body: string): HeuristicResult
⋮----
// Fenced code block present → tag "code"
⋮----
// ISO date token or obvious relative date phrase → observed
⋮----
function detectObservedAt(body: string): string | undefined
⋮----
// Normalise the matched phrase: lowercase, collapse internal whitespace,
// so "last  week" matches the lookup table key.
⋮----
/**
 * Result of an `--enrich` LLM call.
 *
 * `tags` is always an array (possibly empty). `description` and
 * `observed_at` (the memory's `observed` date) are optional — only populated when
 * the model returns them in the expected shape. No connection or harness, a provider failure, a timeout, or
 * invalid JSON yields `{ tags: [] }` with a warning. Invalid configuration is
 * a hard pre-write error.
 */
export interface EnrichmentResult {
  tags: string[];
  description?: string;
  observed_at?: string;

  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export function parseEnrichObserved(parsed: Record<string, unknown>): string | undefined
⋮----
export async function runLlmEnrich(body: string): Promise<EnrichmentResult>
`````

## File: src/commands/targets.ts
`````typescript
import {
  type AkmConfig,
  ambiguousDefaultAdvice,
  type ConnectionConfig,
  defaultConnection,
  defaultHarness,
  type HarnessConfig,
} from "../core/config/config";
import { readCredential } from "../core/config/credentials";
import { IMPROVE_ENGINE_PROCESSES } from "../core/config/engine-semantics";
import { SHIPPED_ALIAS } from "../core/config/model-aliases";
import { envReferenceName } from "../core/config/schema/primitives";
import { ConfigError } from "../core/errors";
import { redactUrlCredentials } from "../core/redaction";
import { defaultWhich, type WhichFn } from "../integrations/agent/detect";
import { resolveTarget } from "../integrations/agent/resolution";
import type { RunnerSpec } from "../integrations/agent/runner";
import { DEFAULT_LOCAL_MODEL } from "../llm/embedder";
import { effectiveEmbedding } from "../llm/embedders/connection";
import { resolveIndexPassExecution } from "../llm/index-passes";
import { resolveImproveExecution } from "./improve/execution";
⋮----
export type KeyState = "env-set" | "env-unset" | "credentials" | "none";
⋮----
export interface ConnectionRow {
  readonly type: "connection";
  readonly name: string;
  readonly default: boolean;
  readonly endpoint: string;
  readonly key: KeyState;

  readonly reachable?: boolean;
  readonly error?: string;
}
⋮----
export interface HarnessRow {
  readonly type: "harness";
  readonly name: string;
  readonly default: boolean;
  readonly platform: string;

  readonly bin: string;

  readonly installed: boolean;

  readonly modelWork?: false;

  readonly version?: string;
}
⋮----
export interface ProcessOverride {

  readonly name: string;

  readonly kind: "connection" | "harness" | null;

  readonly target: string | null;
  readonly model: string | null;
}
⋮----
export type ProcessName =
  | "improve"
  | "judges"
  | "agents"
  | "extract"
  | "enrich"
  | "index"
  | "embedding"
  | "curate-rerank";
⋮----
export interface ProcessRow {
  readonly type: "process";
  readonly process: ProcessName;

  readonly kind: "connection" | "harness" | "endpoint" | "local" | null;
  readonly target: string | null;
  readonly model: string | null;

  readonly overrides?: readonly ProcessOverride[];

  readonly problem?: string;
}
⋮----
export type TargetRow = ConnectionRow | HarnessRow | ProcessRow;
⋮----
export interface TargetsInput {
  readonly config: AkmConfig;
  readonly env?: NodeJS.ProcessEnv;
  readonly which?: WhichFn;

  readonly reachability?: ReadonlyMap<string, { reachable: boolean; error?: string }>;

  readonly versions?: ReadonlyMap<string, string | undefined>;
}
⋮----
function keyState(connection: ConnectionConfig, name: string, env: NodeJS.ProcessEnv): KeyState
⋮----
function connectionRows(input: TargetsInput): ConnectionRow[]
⋮----
function harnessBin(config: AkmConfig, name: string, harness: HarnessConfig): string
⋮----
function harnessRows(input: TargetsInput): HarnessRow[]
⋮----
type Resolution = { readonly runner?: RunnerSpec; readonly problem?: string };
⋮----
function attempt(resolve: () => RunnerSpec | null | undefined): Resolution
⋮----
const sameTarget = (a: Resolution, b: Resolution): boolean
⋮----
function runnerRow(
  process: ProcessName,
  base: Resolution,
  variants: ReadonlyArray<readonly [string, Resolution]> = [],
  ambiguous?: string,
): ProcessRow
⋮----
function embeddingRow(config: AkmConfig, ambiguous: string | undefined): ProcessRow
⋮----
function rerankRow(config: AkmConfig): ProcessRow
⋮----
function processRows(config: AkmConfig): ProcessRow[]
⋮----
const improve = (processName: string, alias: keyof typeof SHIPPED_ALIAS, rest: object =
⋮----
export function targetRows(input: TargetsInput): TargetRow[]
`````

## File: src/commands/url-checker.ts
`````typescript
import { concurrentMap } from "../core/concurrent";
import type { DeadUrl, DeadUrlCoverage } from "../core/improve-types";
import { systemErrorCode } from "../core/system-error";
⋮----
export interface DeadUrlCheckResult {
  deadUrls: DeadUrl[];
  coverage: DeadUrlCoverage;
}
⋮----
interface CheckOutcome {
  dead?: DeadUrl;
  skipped?: boolean;
}
⋮----
export async function checkDeadUrls(
  _stashDir: string,
  entries: Array<{ ref: string; body: string }>,
): Promise<DeadUrlCheckResult>
`````

## File: src/commands/workflow-cli.ts
`````typescript
import { getStringArg } from "../cli/parse-args";
import { defineGroupCommand, defineJsonCommand, EXIT_CODES, output, outputWithExitCode } from "../cli/shared";
import { armAbortDeadline } from "../core/abort-deadline";
import { assertFlatAssetName, combineCreatePath, normalizeCreateSubPath } from "../core/asset/asset-create";
import { NotFoundError, TransientError, type TransientErrorCode, UsageError } from "../core/errors";
import { warn } from "../core/warn";
import { assertWorkflowMarkdownName, createWorkflowAsset, getWorkflowTemplate } from "../workflows/authoring/authoring";
import type { WorkflowParameterFlag } from "../workflows/ir/params";
import { WORKFLOW_MAX_TIMEOUT_MS } from "../workflows/resource-limits";
import {
  abandonWorkflowRun,
  getWorkflowStatus,
  listWorkflowRuns,
  resolveWorkflowRunTarget,
  resumeWorkflowRun,
} from "../workflows/runtime/runs";
import { akmWorkflowPlan } from "./workflow/plan";
⋮----
async run(
⋮----
const interrupt = (signal: "SIGINT" | "SIGTERM") =>
const onSigint = ()
const onSigterm = ()
⋮----
const skip = (reason: "lock-held" | "state-db-contended", message: string) =>
⋮----
export function parseWorkflowParameterFlags(rawArgs: readonly string[], target: string): WorkflowParameterFlag[]
⋮----
function parseIntegerFlag(
  raw: string | undefined,
  name: string,
  minimum: number,
  maximum?: number,
): number | undefined
⋮----
function parseWorkflowTimeout(raw: string | undefined): number | undefined
`````
