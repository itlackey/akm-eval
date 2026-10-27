---
description: "Repo map of akm src/tasks at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  tasks/
    backends/
      cron.ts
      exec-utils.ts
      index.ts
      launchd.ts
      schtasks.ts
      types.ts
    model/
      invocation.ts
    prepare/
      prepare-script-target.ts
      prepare-support.ts
      prepare.ts
      prepared-execution.ts
      script-capture.ts
    run/
      attempt-lifecycle.ts
      load-task.ts
      provenance.ts
      run-command-task.ts
      run-native-task.ts
      run-task.ts
      run-workflow-task.ts
      task-history.ts
      task-log.ts
      task-result.ts
    source/
      bounded-document.ts
      parse-task-source.ts
      project-v4.ts
      task-input-diagnostics.ts
      task-source-v4.ts
    activation-config.ts
    command-executable.ts
    embedded.ts
    frozen-script.ts
    log-redaction.ts
    resolve-akm-bin.ts
    schedule-gates.ts
    schedule.ts
    scheduler-binding.ts
    scheduler-invocation.ts
    scheduler-lock.ts
    scheduler-sync.ts
    source-v3.ts
    standalone-script-entry.ts
    task-id.ts
    task-run-reserved-flags.ts
```

# Files

## File: src/tasks/backends/cron.ts
```typescript
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "../../core/errors";
import { getTaskLogDir } from "../../core/paths";
import { resolveAkmInvocation } from "../resolve-akm-bin";
import { parseSchedule, translateToCron } from "../schedule";
import { type SchedulerBinding, schedulerBindingNativeId, schedulerLogicalBindingId } from "../scheduler-binding";
import {
  buildScheduledInvocation,
  type ParsedScheduledInvocation,
  parseScheduledInvocationArgv,
  type ScheduledRowEnvironment,
  scheduledRowEnvironmentEntries,
  scheduledRowEnvironmentFrom,
} from "../scheduler-invocation";
import { type NodeFs, nodeFs, throwIfNotOk } from "./exec-utils";
import type { InstalledSchedulerBinding, SchedulerBackend, SchedulerInstallOptions } from "./types";
⋮----
export type CronExecResult = {
  status: number;
  stdout: string;
  stderr: string;

  enoent?: boolean;
};
⋮----
export interface CronExec {

  read(): CronExecResult;

  write(content: string): CronExecResult;
}
⋮----
read(): CronExecResult;
⋮----
write(content: string): CronExecResult;
⋮----
export type CronFs = Pick<NodeFs, "ensureDir"> &
  Partial<Pick<NodeFs, "writeFile">> & {

    readFile?(file: string): string;
  };
⋮----
readFile?(file: string): string;
⋮----
export interface CronBackendOptions {
  exec?: CronExec;
  fs?: CronFs;

  logDir?: string;

  akmArgv?: string[];

  envPath?: string | false;
}
⋮----
const BEGIN = (id: string) => `# akm:task $
const END = (id: string) => `# akm:task $
⋮----
export function CRON_BACKEND(options: CronBackendOptions =
⋮----
const lineFor = (task: SchedulerBinding, opts?: SchedulerInstallOptions)
⋮----
install(task, opts)
uninstall(nativeId)
setEnabled(nativeId, enabled)
list()
expectedSignature(task, opts)
⋮----
export interface CronWrapperScript {
  readonly path: string;
  readonly content: string;
}
⋮----
export interface CronLineResult {
  readonly line: string;
  readonly wrapper?: CronWrapperScript;
}
⋮----
function buildCronLineParts(
  task: SchedulerBinding,
  akmArgv: string[],
  logDir: string,
  environment: ScheduledRowEnvironment | undefined,
): CronLineResult
⋮----
// #951: truncate (not append) so this bootstrap safety-net file always
// holds exactly the latest run's raw output. akm's own per-run log
// (src/tasks/run/task-log.ts) keeps history.
⋮----
function quoteForShellScript(part: string): string
⋮----
export function buildCronLine(
  task: SchedulerBinding,
  akmArgv: string[],
  logDir: string,
  environment?: ScheduledRowEnvironment,
): string
⋮----
export function cronBlockBody(cronLine: string, enabled: boolean): string
⋮----
export function renderBlock(id: string, cronLine: string, enabled: boolean): string
⋮----
export function listBlocks(existing: string): Array<
⋮----
interface ParsedCronBlock {
  id: string;
  body: string;
  start: number;
  end: number;
}
⋮----
function parseBlocks(existing: string): ParsedCronBlock[]
⋮----
function malformedBlockError(id: string): ConfigError
⋮----
export function extractInstalledTarget(body: string): string | undefined
⋮----
export function extractCronInvocation(body: string): ParsedScheduledInvocation | undefined
⋮----
export function extractCronWrapperInvocation(
  body: string,
  readFile: (file: string) => string,
): ParsedScheduledInvocation | undefined
⋮----
function splitCronShellWords(value: string): string[]
⋮----
/** Collapse incidental whitespace so signature comparison ignores it. */
function normalizeSignature(body: string): string
⋮----
function cronIsDisabled(body: string): boolean
⋮----
export function upsertBlock(existing: string, id: string, block: string): string
⋮----
export function removeBlock(existing: string, id: string): string
⋮----
/**
 * akm's managed environment section: one `PATH=` line directly above the
 * first akm task block. Cron applies an environment assignment to every
 * command line after it, which is why the line sits immediately above akm's
 * own rows rather than at the top of the crontab; it is plain text a person
 * can edit with `crontab -e`, rewritten on every akm crontab write and
 * removed together with the last akm task block.
 */
export function renderEnvBlock(envPath: string): string
⋮----
export function upsertEnvBlock(existing: string, envPath: string | undefined): string
⋮----
export function removeEnvBlock(existing: string): string
⋮----
function dedupeSearchPath(value: string): string
⋮----
export function toggleBlock(existing: string, id: string, enabled: boolean): string
⋮----
function quoteForCron(part: string): string
⋮----
function assertCronValue(value: string): string
⋮----
function assertPortableCronLine(line: string): void
⋮----
function readCrontab(exec: CronExec): string
⋮----
// The spawn itself failed to find the binary (ENOENT) — the only case
// where "install/PATH the crontab binary" is the correct remedy.
⋮----
function writeCrontab(exec: CronExec, content: string): void
⋮----
function replaceCrontab(exec: CronExec, existing: string, next: string): void
⋮----
function defaultCronExec(): CronExec
⋮----
const run = (args: string[], input?: string): CronExecResult =>
```

## File: src/tasks/backends/exec-utils.ts
```typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { ConfigError } from "../../core/errors";
⋮----
export interface ExecResult {
  status: number;
  stdout: string;
  stderr: string;
}
⋮----
export interface NodeExec {
  run(args: string[]): ExecResult;
}
⋮----
run(args: string[]): ExecResult;
⋮----
export type BackendExec<Extra = unknown> = NodeExec & Extra;
⋮----
export function nodeExec(): NodeExec
⋮----
run(args: string[])
⋮----
export interface NodeFs {
  writeFile(file: string, content: string): void;
  ensureDir(dir: string): void;
}
⋮----
writeFile(file: string, content: string): void;
ensureDir(dir: string): void;
⋮----
export function nodeFs(): NodeFs
⋮----
writeFile(file: string, content: string)
ensureDir(dir: string)
⋮----
export function spawnCommand(args: string[]): ExecResult
⋮----
export interface ThrowIfNotOkOptions {

  isOk?: (result: ExecResult) => boolean;

  message: (result: ExecResult) => string;

  hint?: string;
}
⋮----
export function throwIfNotOk(result: ExecResult, options: ThrowIfNotOkOptions): ExecResult
⋮----
export function runOrThrow(exec: NodeExec, args: string[], options: ThrowIfNotOkOptions): ExecResult
⋮----
export function decodeCommandOutput(output: string | Buffer | null | undefined): string
⋮----
export function normalizeXmlForUtf16File(xml: string): string
⋮----
function decodeUtf16Be(output: Buffer): string
⋮----
/**
 * Escape a string for safe embedding in an XML attribute or text node.
 */
export function escapeXml(s: string): string
```

## File: src/tasks/backends/index.ts
```typescript
import type { ScheduleBackend } from "../schedule";
import { CRON_BACKEND, type CronBackendOptions } from "./cron";
import { LAUNCHD_BACKEND, type LaunchdBackendOptions } from "./launchd";
import { SCHTASKS_BACKEND, type SchtasksBackendOptions } from "./schtasks";
import type { SchedulerBackend } from "./types";
⋮----
export interface SelectBackendOptions {
  platform?: NodeJS.Platform;
  cron?: CronBackendOptions;
  launchd?: LaunchdBackendOptions;
  schtasks?: SchtasksBackendOptions;
}
⋮----
export function selectBackend(options: SelectBackendOptions =
⋮----
export function backendNameForPlatform(platform: NodeJS.Platform = process.platform): ScheduleBackend
```

## File: src/tasks/backends/launchd.ts
```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import launchdTemplate from "../../assets/backends/launchd-template.xml" with { type: "text" };
import { hasErrnoCode } from "../../core/common";
import { ConfigError } from "../../core/errors";
import { getTaskLogDir } from "../../core/paths";
import { warn } from "../../core/warn";
import { resolveAkmInvocation } from "../resolve-akm-bin";
import { type LaunchdTrigger, parseSchedule, translateToLaunchd } from "../schedule";
import { type SchedulerBinding, schedulerBindingNativeId, schedulerLogicalBindingId } from "../scheduler-binding";
import {
  buildScheduledInvocation,
  type ParsedScheduledInvocation,
  parseScheduledInvocationArgv,
  type ScheduledRowEnvironment,
  scheduledRowEnvironmentEntries,
  scheduledRowEnvironmentFrom,
} from "../scheduler-invocation";
import { type BackendExec, escapeXml, type NodeFs, nodeExec, nodeFs, runOrThrow } from "./exec-utils";
import type { InstalledSchedulerBinding, SchedulerBackend, SchedulerInstallOptions } from "./types";
⋮----
export type LaunchdExec = BackendExec<{ uid(): number }>;
⋮----
export type LaunchdFs = NodeFs & {
  readFile(file: string): string;
  removeFile(file: string): void;
  replaceFile(source: string, destination: string): void;
  list(dir: string): string[];
  exists(file: string): boolean;
};
⋮----
readFile(file: string): string;
removeFile(file: string): void;
replaceFile(source: string, destination: string): void;
list(dir: string): string[];
exists(file: string): boolean;
⋮----
export interface LaunchdBackendOptions {
  exec?: LaunchdExec;
  fs?: LaunchdFs;

  agentsDir?: string;

  logDir?: string;

  akmArgv?: string[];

  envPath?: string | false;
}
⋮----
export function LAUNCHD_BACKEND(options: LaunchdBackendOptions =
⋮----
const plistPath = (nativeId: string) => path.join(agentsDir, `$
const label = (nativeId: string) => `$
const target = (nativeId: string) => `gui/$
const setEnableState = (nativeId: string, enabled: boolean) =>
const bootout = (nativeId: string)
const xmlFor = (task: SchedulerBinding, opts?: SchedulerInstallOptions)
⋮----
install(task, opts)
uninstall(nativeId)
setEnabled(nativeId, enabled)
list()
expectedSignature(task, opts)
⋮----
function launchdFingerprint(raw: string, enabled: boolean, loaded: boolean): string
⋮----
export function extractPlistInvocation(xml: string): ParsedScheduledInvocation | undefined
⋮----
function decodeXmlEntities(value: string): string
⋮----
// ── XML builder (exported for tests) ────────────────────────────────────────
⋮----
function renderPlistEnvironment(envPath: string | undefined, environment: ScheduledRowEnvironment | undefined): string
⋮----
export function buildPlistXml(
  task: SchedulerBinding,
  akmArgv: string[],
  logDir: string,
  environment?: ScheduledRowEnvironment,
  envPath?: string,
): string
⋮----
function renderLaunchdTrigger(trigger: LaunchdTrigger): string
⋮----
function renderCalendar(calendar: NonNullable<LaunchdTrigger["calendar"]>, indent: string): string[]
⋮----
export function parseLaunchdLoadedLabels(output: string): Set<string>
⋮----
function readDisabledLabels(exec: LaunchdExec): Set<string>
⋮----
function isServiceNotFoundResult(result:
⋮----
function defaultAgentsDir(): string
⋮----
function defaultLaunchdExec(): LaunchdExec
⋮----
uid()
⋮----
function defaultLaunchdFs(): LaunchdFs
⋮----
readFile(file)
removeFile(file)
replaceFile(source, destination)
list(dir)
exists(file)
```

## File: src/tasks/backends/schtasks.ts
```typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import schtasksTemplate from "../../assets/backends/schtasks-template.xml" with { type: "text" };
import { ConfigError } from "../../core/errors";
import { getTaskLogDir } from "../../core/paths";
import { resolveAkmInvocation } from "../resolve-akm-bin";
import { parseSchedule, type SchtasksTrigger, translateToSchtasks } from "../schedule";
import { type SchedulerBinding, schedulerBindingNativeId, schedulerLogicalBindingId } from "../scheduler-binding";
import {
  buildScheduledInvocation,
  type ParsedScheduledInvocation,
  parseScheduledInvocationArgv,
  type ScheduledRowEnvironment,
  scheduledRowEnvironmentEntries,
  scheduledRowEnvironmentFrom,
} from "../scheduler-invocation";
import {
  type BackendExec,
  escapeXml,
  type NodeFs,
  nodeExec,
  nodeFs,
  normalizeXmlForUtf16File,
  runOrThrow,
} from "./exec-utils";
import type { InstalledSchedulerBinding, SchedulerBackend, SchedulerInstallOptions } from "./types";
⋮----
export type SchtasksExec = BackendExec;
⋮----
export type SchtasksFs = NodeFs & {
  removeFile(file: string): void;
  tmpdir(): string;
};
⋮----
removeFile(file: string): void;
tmpdir(): string;
⋮----
export interface SchtasksBackendOptions {
  exec?: SchtasksExec;
  fs?: SchtasksFs;

  akmArgv?: string[];

  logDir?: string;

  folderPrefix?: string;

  userSid?: string;
}
⋮----
export function SCHTASKS_BACKEND(options: SchtasksBackendOptions =
⋮----
const taskName = (nativeId: string) => `$
const xmlFor = (task: SchedulerBinding, opts?: SchedulerInstallOptions)
const queryXml = (nativeId: string)
⋮----
install(task, opts)
uninstall(nativeId)
setEnabled(nativeId, enabled)
list()
expectedSignature(task, opts)
⋮----
export function extractSchtasksTarget(xml: string): string | undefined
⋮----
export function extractSchtasksInvocation(xml: string): ParsedScheduledInvocation | undefined
⋮----
function findPowerShellInvocationOperator(script: string): number | undefined
⋮----
function parsePowerShellSingleQuotedArgs(script: string, start: number): string[]
⋮----
// ── XML builder (exported for tests) ────────────────────────────────────────
⋮----
export interface BuildSchtasksXmlOptions {
  /** Task folder prefix (e.g. `\\akm\\`). Used to build the <URI>. */
  folderPrefix?: string;
  /** Override the clock used to find the next StartBoundary (tests). */
  now?: () => Date;
  /** Bootstrap argv. Defaults to the positional akmArgv. */
  binding?: string[];
  /** The environment the row sets, as `$env:` assignments ahead of the call operator. */
  environment?: ScheduledRowEnvironment;
  /** Current Windows user SID embedded in the principal. */
  userSid: string;
}
⋮----
/** Task folder prefix (e.g. `\\akm\\`). Used to build the <URI>. */
⋮----
/** Override the clock used to find the next StartBoundary (tests). */
⋮----
/** Bootstrap argv. Defaults to the positional akmArgv. */
⋮----
/** The environment the row sets, as `$env:` assignments ahead of the call operator. */
⋮----
/** Current Windows user SID embedded in the principal. */
⋮----
export function buildSchtasksXml(
  task: SchedulerBinding,
  akmArgv: string[],
  logDir: string,
  options: BuildSchtasksXmlOptions,
): string
⋮----
// The boundary changes on reinstall, and enabled state can change via
// /Change. Keep both outside the stored definition fingerprint so no-op
// sync stays stable.
⋮----
interface NativeDailyTrigger {
  kind: "daily";
  atHour: number;
  atMinute: number;
  repeatEveryMinutes?: number;
}
⋮----
interface NativeWeeklyTrigger {
  kind: "weekly";
  atHour: number;
  atMinute: number;
  daysOfWeek: number[];
}
⋮----
interface NativeMonthlyTrigger {
  kind: "monthly";
  atHour: number;
  atMinute: number;
  daysOfMonth: number[];
  months: number[];
}
⋮----
type NativeSchtasksTrigger = NativeDailyTrigger | NativeWeeklyTrigger | NativeMonthlyTrigger;
⋮----
function renderSchtasksTrigger(trigger: SchtasksTrigger, now: Date): string
⋮----
function expandNativeTriggers(trigger: SchtasksTrigger): NativeSchtasksTrigger[]
⋮----
function renderNativeTrigger(trigger: NativeSchtasksTrigger, startBoundary: string): string
⋮----
function formatMinuteDuration(minutes: number): string
⋮----
function nextStartBoundary(trigger: NativeSchtasksTrigger, now: Date): Date
⋮----
function formatStartBoundary(d: Date): string
⋮----
// Local-time ISO-8601 (no zone suffix) — Task Scheduler interprets a bare
// boundary in the registering user's timezone, which matches what a user
⋮----
const pad = (value: number)
⋮----
function quoteArg(s: string): string
⋮----
function quotePowerShell(value: string): string
⋮----
function isMissingTaskResult(result:
⋮----
function taskXmlSignature(xml: string): string
⋮----
function taskXmlEnabled(xml: string): boolean
⋮----
function decodeXml(value: string): string
⋮----
function resolveCurrentUserSid(exec: SchtasksExec): string
⋮----
function defaultSchtasksFs(): SchtasksFs
⋮----
writeFile(file, content)
removeFile(file)
tmpdir()
```

## File: src/tasks/backends/types.ts
```typescript

```

## File: src/tasks/model/invocation.ts
```typescript
import type { TaskInputBinding } from "../../execution/input-contract";
⋮----
export type TaskInvocationCaller =
  | Readonly<{ readonly kind: "cli" }>
  | Readonly<{ readonly kind: "schedule"; readonly cron: string }>
  | Readonly<{ readonly kind: "workflow"; readonly workflowRef: string; readonly stepId: string }>;
⋮----
export interface TaskInvocationOverrides {
  readonly connection?: string | null;
  readonly harness?: string | null;
  readonly engine?: string | null;
  readonly model?: string | null;
  readonly timeout?: string | number | null;
  readonly env?: Readonly<Record<string, string | number | boolean>>;
}
⋮----
export interface TaskInvocation {
  readonly taskRef: string;
  readonly caller: TaskInvocationCaller;
  readonly overrides?: TaskInvocationOverrides;

  readonly inputs?: readonly TaskInputBinding[];
}
⋮----
export type ExecutionProvenanceContext = Readonly<{
  eventSource: "user" | "task";
  scheduled: boolean;
}>;
```

## File: src/tasks/prepare/prepare-script-target.ts
```typescript
import type { TaskV3ScriptInterpreter } from "./prepared-execution";
import { captureScriptTarget } from "./script-capture";
⋮----
export interface PreparedScriptTarget {
  readonly ref: string;
  readonly interpreter: TaskV3ScriptInterpreter;
  readonly extension: string;

  readonly bytesBase64: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly cwd: string;
}
⋮----
export interface PrepareScriptTargetInput {

  readonly ref: string;
  readonly file: string;
  readonly bundleRoot: string;
  readonly readFile: (file: string, bundleRoot?: string) => Uint8Array;
}
⋮----
export function prepareScriptTarget(input: PrepareScriptTargetInput): PreparedScriptTarget
```

## File: src/tasks/prepare/prepare-support.ts
```typescript
import type { PreparedCommandInvocation } from "../../commands/command/command-execution";
import { type BundleRef, makeBundleRef, parseBundleRef } from "../../core/asset/asset-ref";
import { COMPOSITION_INVALID_MULTI_JOB_HINT, ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { DURATION_UNITS, parseDuration } from "../../core/time";
import { warn } from "../../core/warn";
import { isPortableExecutionAgentSelector, type UnresolvedExecutionDefaults } from "../../execution/source";
import { buildExecution } from "../../integrations/agent/execution";
import { resolveAssetPath } from "../../sources/resolve";
import { checkWorkflowPlan, compileWorkflowSource } from "../../workflows/compile";
import { detectSecretShapedParams } from "../../workflows/exec/param-secrets";
import { isInferredSecretName } from "../log-redaction";
import { SCHEDULED_TASK_CONTEXT_KEYS } from "../scheduler-invocation";
import type { TaskV3Environment, TaskV3HostShell, TaskV3SourceDocument } from "../source-v3";
import type { PrepareTaskV3ExecutionContext, TaskV3PreparedBase } from "./prepared-execution";
⋮----
function own(value: object | undefined, key: PropertyKey): boolean
⋮----
export function environmentSnapshot(environment: TaskV3Environment | undefined): Readonly<Record<string, string>>
⋮----
export function commandEnvironmentSnapshot(
  environment: Readonly<Record<string, string>>,
  schedulerContext: PrepareTaskV3ExecutionContext["schedulerContext"],
): Readonly<Record<string, string>>
⋮----
function normalizeTimeout(value: string | number | null | undefined): number | null | undefined
⋮----
export function qualifyOwnedRef(
  ref: string,
  context: PrepareTaskV3ExecutionContext,
):
⋮----
export function currentExecutionValues(
  document: TaskV3SourceDocument,
  context: PrepareTaskV3ExecutionContext,
  environment: Readonly<Record<string, string>>,
): UnresolvedExecutionDefaults
⋮----
export function base(
  document: TaskV3SourceDocument,
  context: PrepareTaskV3ExecutionContext,
  environment: Readonly<Record<string, string>>,
): TaskV3PreparedBase
⋮----
export async function resolvedOwnedAsset(
  qualified: string,
  type: "workflow" | "script",
  context: PrepareTaskV3ExecutionContext,
): Promise<Readonly<
⋮----
export function defaultTaskShell(platform: NodeJS.Platform): TaskV3HostShell
⋮----
export function validatePreparedCommand(
  invocation: PreparedCommandInvocation,
  context: PrepareTaskV3ExecutionContext,
): PreparedCommandInvocation
⋮----
export function validateWorkflowRuntimeSource(
  file: string,
  workspaceRoot: string,
  readFile: (file: string, bundleRoot?: string) => Uint8Array,
): void
```

## File: src/tasks/prepare/prepare.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { prepareCommandInvocation } from "../../commands/command/command-execution";
import { UsageError } from "../../core/errors";
import { warn } from "../../core/warn";
import type { TaskV3SourceDocument } from "../source-v3";
import {
  base,
  commandEnvironmentSnapshot,
  currentExecutionValues,
  defaultTaskShell,
  environmentSnapshot,
  qualifyOwnedRef,
  resolvedOwnedAsset,
  validatePreparedCommand,
  validateWorkflowRuntimeSource,
} from "./prepare-support";
import type { PreparedTaskV3Execution, PrepareTaskV3ExecutionContext } from "./prepared-execution";
import { captureScriptTarget } from "./script-capture";
⋮----
export async function prepareTaskV3Execution(
  document: TaskV3SourceDocument,
  context: PrepareTaskV3ExecutionContext,
): Promise<PreparedTaskV3Execution>
```

## File: src/tasks/prepare/prepared-execution.ts
```typescript
import type {
  PrepareCommandInvocationOptions,
  PreparedCommandInvocation,
  prepareCommandInvocation,
} from "../../commands/command/command-execution";
import type { AkmConfig } from "../../core/config/config-types";
import type { SCHEDULED_TASK_CONTEXT_KEYS } from "../scheduler-invocation";
import type { TaskV3HostShell, TaskV3SourceDocument } from "../source-v3";
⋮----
export type PreparableTaskDocument = TaskV3SourceDocument;
⋮----
export type TaskV3ScriptInterpreter =
  | "sh"
  | "bun"
  | "bun-standalone"
  | "node"
  | "powershell"
  | "cmd"
  | "python"
  | "ruby"
  | "go"
  | "perl"
  | "php"
  | "lua"
  | "rscript"
  | "swift"
  | "kotlin";
⋮----
export interface TaskV3PreparedBase {
  readonly taskId: string;
  readonly taskRef: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly timeoutMs?: number | null;
  readonly redact: readonly string[];
}
⋮----
export interface PreparedTaskV3Command extends TaskV3PreparedBase {
  readonly kind: "command";
  readonly invocation: PreparedCommandInvocation;
}
⋮----
export interface PreparedTaskV3Workflow extends TaskV3PreparedBase {
  readonly kind: "workflow";
  readonly ref: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly maxSteps?: number;
  readonly maxRetries?: number;
}
⋮----
export interface PreparedTaskV3Shell extends TaskV3PreparedBase {
  readonly kind: "shell";
  readonly command: string;
  readonly shell: TaskV3HostShell;
  readonly cwd: string;
}
⋮----
export interface PreparedTaskV3Script extends TaskV3PreparedBase {
  readonly kind: "script";
  readonly sourceRef: string;
  readonly interpreter: TaskV3ScriptInterpreter;
  readonly extension: string;

  readonly bytesBase64: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly cwd: string;
}
⋮----
export type PreparedTaskV3Execution =
  | PreparedTaskV3Command
  | PreparedTaskV3Workflow
  | PreparedTaskV3Shell
  | PreparedTaskV3Script;
⋮----
export interface PrepareTaskV3ExecutionContext {
  readonly taskId: string;
  readonly taskRef: string;
  readonly bundleName: string;
  readonly bundleRoot: string;
  readonly config: AkmConfig;





  readonly schedulerContext?: Readonly<Partial<Record<(typeof SCHEDULED_TASK_CONTEXT_KEYS)[number], string>>>;
  readonly prepareCommand?: typeof prepareCommandInvocation;
  readonly commandSourceLoader?: PrepareCommandInvocationOptions["sourceLoader"];
  readonly resolveAsset?: (input: {
    readonly bundle: string;
    readonly type: "workflow" | "script";
    readonly name: string;
    readonly ref: string;
  }) => Promise<string | Readonly<{ file: string; bundleRoot: string }>>;
  readonly readFile?: (file: string, bundleRoot?: string) => Uint8Array;

  readonly platform?: NodeJS.Platform;
}
```

## File: src/tasks/prepare/script-capture.ts
```typescript
import { createHash } from "node:crypto";
import path from "node:path";
import { UsageError } from "../../core/errors";
import { isBunStandaloneMain } from "../resolve-akm-bin";
import type { TaskV3ScriptInterpreter } from "./prepared-execution";
⋮----
function interpreterFromShebang(bytes: Uint8Array | undefined): TaskV3ScriptInterpreter | undefined
⋮----
function nodeStripsTypeScript(): boolean
⋮----
export function scriptInterpreter(extension: string, ref: string, bytes?: Uint8Array): TaskV3ScriptInterpreter
⋮----
export interface CapturedScriptTarget {
  readonly interpreter: TaskV3ScriptInterpreter;
  readonly extension: string;

  readonly bytesBase64: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly cwd: string;
}
⋮----
export function captureScriptTarget(
  ref: string,
  file: string,
  bundleRoot: string,
  readFile: (file: string, bundleRoot?: string) => Uint8Array,
): CapturedScriptTarget
```

## File: src/tasks/run/attempt-lifecycle.ts
```typescript
import { AkmError, rethrowIfTestIsolationError } from "../../core/errors";
import { withStateDb } from "../../core/state-db";
import { reserveTaskHistoryAttempt } from "../../storage/repositories/task-history-repository";
import { validateTaskId } from "../task-id";
import { appendHistory } from "./task-history";
import { persistRunLog, resolveTaskLogPath } from "./task-log";
import type { TaskAttemptFailureReason, TaskRunResult } from "./task-result";
⋮----
interface ReservedTaskAttempt {
  startedAt: Date;
  historyReserved: boolean;
}
⋮----
export function reserveTaskAttempt(taskId: string, requestedStartedAt: Date): ReservedTaskAttempt
⋮----
export function finishAttempt(startedAt: Date, observedFinishedAt: Date): Date
⋮----
function safeTaskAttemptErrorCode(failure: unknown): string
⋮----
export function recordTaskAttemptFailure(input: {
  taskId: string;
  reason: TaskAttemptFailureReason;
  failure: unknown;
  startedAt: Date;
  finishedAt?: Date;
  logDir?: string;

  historyReserved?: boolean;
}): void
```

## File: src/tasks/run/load-task.ts
```typescript
import fs from "node:fs";
import { detectAdapterId } from "../../core/adapter/detect-adapter";
import { makeBundleRef } from "../../core/asset/asset-ref";
import { conceptIdFromTypeName } from "../../core/asset/resolve-ref";
import { resolveStashDir } from "../../core/common";
import { loadConfig } from "../../core/config/config";
import { bundleKeyForContentRoot } from "../../core/config/config-sources";
import type { AkmConfig } from "../../core/config/config-types";
import { ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { assertBundleNotDisabled } from "../../core/write-source";
import {
  applyInputDefaults,
  type InputContract,
  materializeInputFlags,
  type TaskInputBinding,
  validateInputs,
} from "../../execution/input-contract";
import type { ExecutionJsonObject } from "../../execution/json";
import { resolveAdapterConceptOwner, resolveConceptOwner } from "../../indexer/lookup/adapter-concept-owner";
import { resolveSourceEntries, type SearchSource } from "../../indexer/search/search-source";
import { resolveSourcesForOrigin } from "../../registry/origin-resolve";
import { resolveAssetPath } from "../../sources/resolve";
import type { TaskInvocation } from "../model/invocation";
import { prepareTaskV3Execution } from "../prepare/prepare";
import type { PreparedTaskV3Execution } from "../prepare/prepared-execution";
import { scheduledTaskContextEnv } from "../scheduler-invocation";
import { parseTaskSource } from "../source/parse-task-source";
import { projectTaskSourceV4 } from "../source/project-v4";
import { TASK_INPUT_DIAGNOSTICS } from "../source/task-input-diagnostics";
import { validateTaskConceptId, validateTaskId } from "../task-id";
import type { RunTaskOptions } from "./task-result";
⋮----
export function activeTaskSources(config: AkmConfig): SearchSource[]
⋮----
export function resolveBundleAsset(
  config: AkmConfig,
  { bundle, type, name }: { bundle: string; type: string; name: string },
):
⋮----
export async function loadPreparedTask(id: string, options: RunTaskOptions): Promise<PreparedTaskV3Execution>
```

## File: src/tasks/run/provenance.ts
```typescript
import type { ExecutionProvenanceContext } from "../model/invocation";
⋮----
export function createExecutionProvenanceContext(scheduled: boolean): ExecutionProvenanceContext
⋮----
export function resolveProvenanceContext(
  explicit: ExecutionProvenanceContext | undefined,
  scheduled: boolean,
): ExecutionProvenanceContext
```

## File: src/tasks/run/run-command-task.ts
```typescript
import type { CommandDispatchResult, DispatchPreparedCommandOptions } from "../../commands/command/command-execution";
import { dispatchPreparedCommandInvocation } from "../../commands/command/command-execution";
import type { TaskLogLineInput } from "../../core/logs-db";
import type { LoweringNotice } from "../../execution/resolved-request";
import type { RunExecutionOptions } from "../../integrations/agent/runner-dispatch";
import type { ExecutionProvenanceContext } from "../model/invocation";
import type { PreparedTaskV3Command } from "../prepare/prepared-execution";
import { finishAttempt } from "./attempt-lifecycle";
import { DEFAULT_SCHEDULED_TASK_TIMEOUT_MS } from "./run-workflow-task";
import { appendHistory } from "./task-history";
import { persistRunLog, scrubTaskOutput, streamLines } from "./task-log";
import type { TaskRunResult, TaskRunStatus } from "./task-result";
⋮----
export async function runPreparedCommandTask(input: {
  task: PreparedTaskV3Command;
  logPath: string;
  startedAt: Date;
now: ()
⋮----
function renderPromptLog(input: {
  task: PreparedTaskV3Command;
  engineName: string;
  result: CommandDispatchResult;
  warnings?: readonly string[];
  notices?: readonly Readonly<LoweringNotice>[];
}):
```

## File: src/tasks/run/run-native-task.ts
```typescript
import path from "node:path";
import { assertNever } from "../../core/assert";
import type { TaskLogLineInput } from "../../core/logs-db";
import { childProcessEnv } from "../../core/paths";
import { runManagedSubprocess, type SpawnFn, streamCaptureFailure } from "../../core/subprocess";
import { cleanupFrozenScript, frozenScriptCommand, materializeFrozenScript } from "../frozen-script";
import type { ExecutionProvenanceContext } from "../model/invocation";
import type { PreparedTaskV3Script, PreparedTaskV3Shell } from "../prepare/prepared-execution";
import { resolveAkmInvocation } from "../resolve-akm-bin";
import { finishAttempt } from "./attempt-lifecycle";
import { DEFAULT_SCHEDULED_TASK_TIMEOUT_MS } from "./run-workflow-task";
import { appendHistory } from "./task-history";
import { persistRunLog, streamLines } from "./task-log";
import type { TaskRunResult, TaskRunStatus } from "./task-result";
⋮----
export function shellExecutable(
  shell: PreparedTaskV3Shell["shell"],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string
⋮----
export function shellCommand(
  task: Pick<PreparedTaskV3Shell, "command" | "shell">,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string[]
⋮----
function withExitCodePropagation(command: string): string
⋮----
function resolveLeadingBareAkmCommand(command: string, shell: PreparedTaskV3Shell["shell"]): string
⋮----
function quoteShellArgument(value: string, shell: PreparedTaskV3Shell["shell"]): string
⋮----
export async function runNativeTask(input: {
  task: PreparedTaskV3Shell | PreparedTaskV3Script;
  logPath: string;
  startedAt: Date;
now: ()
⋮----
const forwardTerminationSignal = (signal: NodeJS.Signals): void =>
const onSigterm = ()
const onSigint = ()
```

## File: src/tasks/run/run-task.ts
```typescript
import { runWorkflowSteps } from "../../workflows/exec/run-workflow";
import { recordTaskAttemptFailure, reserveTaskAttempt } from "./attempt-lifecycle";
import { loadPreparedTask } from "./load-task";
import { resolveProvenanceContext } from "./provenance";
import { runPreparedCommandTask } from "./run-command-task";
import { runNativeTask } from "./run-native-task";
import { runWorkflowTask } from "./run-workflow-task";
import { resolveTaskLogPath } from "./task-log";
import type { RunTaskOptions, TaskRunResult } from "./task-result";
⋮----
export async function runTask(id: string, options: RunTaskOptions): Promise<TaskRunResult>
```

## File: src/tasks/run/run-workflow-task.ts
```typescript
import { armAbortDeadline } from "../../core/abort-deadline";
import { assertNever } from "../../core/assert";
import { AkmError } from "../../core/errors";
import type { TaskLogLineInput } from "../../core/logs-db";
import type { WorkflowRunStatus, WorkflowRunSummary } from "../../sources/types";
import type { runWorkflowSteps } from "../../workflows/exec/run-workflow";
import type { ExecutionProvenanceContext } from "../model/invocation";
import type { PreparedTaskV3Workflow } from "../prepare/prepared-execution";
import { finishAttempt } from "./attempt-lifecycle";
import { appendHistory } from "./task-history";
import { persistRunLog, scrubTaskOutput } from "./task-log";
import type { TaskRunResult, TaskRunStatus } from "./task-result";
⋮----
export async function runWorkflowTask(input: {
  task: PreparedTaskV3Workflow;
  logPath: string;
  startedAt: Date;
now: ()
⋮----
function mapWorkflowStatus(status: WorkflowRunStatus | undefined): TaskRunStatus
⋮----
function renderWorkflowLog(input: {
  task: PreparedTaskV3Workflow;
  detail?: WorkflowRunSummary;
  error?: Error;
  warnings?: readonly string[];

  timedOutAfterMs?: number;
}):
```

## File: src/tasks/run/task-history.ts
```typescript
import { rethrowIfTestIsolationError } from "../../core/errors";
import { withStateDb } from "../../core/state-db";
import { warn } from "../../core/warn";
import {
  decodeTaskHistoryMetadata,
  finalizeTaskHistoryAttempt,
  getTaskHistory,
  getTaskHistoryRuns,
  queryTaskHistory,
  type TaskHistoryRow,
  upsertTaskHistory,
} from "../../storage/repositories/task-history-repository";
import type { TaskRunResult, TaskRunStatus } from "./task-result";
⋮----
export function appendHistory(result: TaskRunResult, historyReserved = false): void
⋮----
export interface ReadHistoryOptions {
  id?: string;
  limit?: number;
}
⋮----
export function readTaskHistory(options: ReadHistoryOptions =
⋮----
function decodeTaskHistoryRows(rows: TaskHistoryRow[]): TaskRunResult[]
⋮----
function taskHistoryRowToResult(row: TaskHistoryRow): TaskRunResult
```

## File: src/tasks/run/task-log.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../../core/config/config";
import { rethrowIfTestIsolationError } from "../../core/errors";
import {
  buildTaskRunId,
  insertTaskLogLines,
  openLogsDatabase,
  type TaskLogLevel,
  type TaskLogLineInput,
  type TaskLogStream,
} from "../../core/logs-db";
import { getRunLogDir, getTaskLogDir } from "../../core/paths";
import { redactCredentialPatterns, redactSensitiveText } from "../../core/redaction";
import { collectTaskLogSensitiveValues } from "../log-redaction";
import type { PreparedTaskV3Execution } from "../prepare/prepared-execution";
⋮----
function taskLogPath(logDir: string, taskId: string, startedAtIso: string): string
⋮----
export function resolveTaskLogPath(logDir: string | undefined, taskId: string, startedAtIso: string): string
⋮----
/**
 * Delete per-run flat log files (`<logDir>/<taskId>/<timestamp>.log`) older
 * than `retentionDays` (#951). These files are a transitional human-readable
 * tail only — the durable record lives in logs.db, already purged by
 * {@link purgeOldTaskLogs} in ../../core/logs-db — so deleting an old file
 * here loses nothing that isn't already retained (and separately purged)
 * there.
 *
 * Bounded by construction: only ever reads/deletes inside `logDir` (defaults
 * to {@link getTaskLogDir}), one level of `<taskId>` subdirectories, `.log`
 * files only. A missing/unreadable directory is a no-op, not an error —
 * mirrors the best-effort contract the rest of this module holds for log
 * persistence.
 */
export function purgeOldTaskLogFiles(logDir: string | undefined, retentionDays = 90): number
⋮----
export function purgeOldRunLogFiles(retentionDays = 90): number
⋮----
export function scrubDbLines(
  dbLines: readonly TaskLogLineInput[],
  scrub: (text: string) => string,
): TaskLogLineInput[]
⋮----
export function streamLines(text: string, stream: TaskLogStream, level: TaskLogLevel): TaskLogLineInput[]
⋮----
function taskLogSensitiveValues(
  redactNames: readonly string[] | undefined,
  environment?: Readonly<Record<string, string>>,
): string[]
⋮----
export function scrubTaskOutput(task: PreparedTaskV3Execution, text: string): string
⋮----
export function persistRunLog(input: {
  taskId: string;
  startedAtIso: string;
  finishedAtIso: string;
  logPath: string;
  fileText: string;
  dbLines: readonly TaskLogLineInput[];

  redactNames?: readonly string[] | undefined;

  environment?: Readonly<Record<string, string>> | undefined;
}): void
⋮----
const scrub = (text: string): string
```

## File: src/tasks/run/task-result.ts
```typescript
import type { SpawnFn } from "../../core/subprocess";
import type { InputFlag } from "../../execution/input-contract";
import type { LoweringNotice } from "../../execution/resolved-request";
import type { RunExecutionOptions } from "../../integrations/agent/runner-dispatch";
import type { runWorkflowSteps } from "../../workflows/exec/run-workflow";
import type { ExecutionProvenanceContext, TaskInvocation } from "../model/invocation";
import type { PreparedTaskV3Script, PreparedTaskV3Shell } from "../prepare/prepared-execution";
⋮----
export type TaskRunStatus = "completed" | "blocked" | "failed" | "active";
⋮----
export type TaskAttemptFailureReason =
  | "invalid_task_id"
  | "task_load_failed"
  | "task_parse_failed"
  | "task_dispatch_failed";
⋮----
export interface TaskRunResult {
  id: string;
  status: TaskRunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  log: string;
  target:
    | { kind: "workflow"; ref: string }
    | { kind: "command"; engine: string | null }
    | { kind: "shell"; cmd?: string[] }
    | { kind: "script"; cmd?: string[] }
    | { kind: "unknown" };

  detail?: { runId?: string; reason?: string; error?: string; exitCode?: number | null };

  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export interface RunTaskOptions {








  bundleDir: string;

  bundleName?: string;

  adapterId?: string;

  runAgentImpl?: RunExecutionOptions["runAgent"];




  runWorkflowStepsImpl?: typeof runWorkflowSteps;

  now?: () => Date;

  logDir?: string;

  spawnFn?: SpawnFn;




  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;

  scheduled?: boolean;







  provenance?: ExecutionProvenanceContext;

  beforeNativeDispatch?: (task: PreparedTaskV3Shell | PreparedTaskV3Script) => void;









  inputFlags?: readonly InputFlag[];










  captureTaskInvocation?: (invocation: TaskInvocation) => void;
}
⋮----
export function exitCodeForStatus(status: TaskRunStatus): number
```

## File: src/tasks/source/bounded-document.ts
```typescript
import { types as utilTypes } from "node:util";
import { isAlias, isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";
import { wellFormedUnicode } from "../../core/common";
import { UsageError } from "../../core/errors";
import { DURATION_UNITS, parseDuration } from "../../core/time";
import type { ExecutionJsonObject, ExecutionJsonValue } from "../../execution/json";
import { EXECUTION_MAX_TIMEOUT_MS } from "../../execution/limits";
import { type StrictRecordSnapshot, snapshotStrictRecord } from "../../execution/record";
import { WORKFLOW_ENV_VAR_NAME_PATTERN } from "../../workflows/resource-limits";
⋮----
export interface BoundedDocumentContext {
  readonly filePath: string;







  readonly sourceLabel: string;
  readonly lineAt?: (fieldPath: readonly (string | number)[]) => number | undefined;
}
⋮----
interface CloneState {
  nodes: number;
}
⋮----
export function own(value: object, key: string): boolean
⋮----
export function utf8Bytes(value: string): number
⋮----
export function sourceError(
  ctx: Pick<BoundedDocumentContext, "filePath" | "sourceLabel" | "lineAt">,
  fieldPath: readonly (string | number)[],
  detail: string,
): never
⋮----
export function cloneBoundedJson(
  value: unknown,
  ctx: BoundedDocumentContext,
  fieldPath: readonly (string | number)[],
  state: CloneState,
  depth = 0,
  ancestors: ReadonlySet<object> = new Set(),
): ExecutionJsonValue
⋮----
export function asRecord(
  value: ExecutionJsonValue,
  ctx: BoundedDocumentContext,
  fieldPath: readonly (string | number)[],
): ExecutionJsonObject
⋮----
export function checkKeys(
  value: ExecutionJsonObject,
  allowed: readonly string[],
  ctx: BoundedDocumentContext,
  fieldPath: readonly (string | number)[],
): void
⋮----
export function presentJsonValue(
  value: ExecutionJsonValue | undefined,
  ctx: BoundedDocumentContext,
  fieldPath: readonly (string | number)[],
): ExecutionJsonValue
⋮----
export function stringField(
  value: unknown,
  ctx: BoundedDocumentContext,
  fieldPath: readonly (string | number)[],
  options: { nonempty?: boolean; nullable?: boolean } = {},
): string | null
⋮----
export function noGithubExpression(
  value: string,
  ctx: BoundedDocumentContext,
  fieldPath: readonly (string | number)[],
): void
⋮----
export function parseEnvironment(
  value: ExecutionJsonValue,
  ctx: BoundedDocumentContext,
): Readonly<Record<string, string | number | boolean>>
⋮----
export function parseStringArray(
  value: unknown,
  ctx: BoundedDocumentContext,
  fieldPath: readonly (string | number)[],
  options: { max?: number; pattern?: RegExp } = {},
): readonly string[]
⋮----
export function parseTimeout(value: unknown, ctx: BoundedDocumentContext): string | number | null
⋮----
export function yamlProblem(message: string): string
⋮----
export interface BoundedTaskSourceYamlInput {
  readonly yaml: string;
  readonly filePath: string;
}
⋮----
export interface BoundedTaskSourceYamlResult {
  readonly root: unknown;
  readonly lineAt: (fieldPath: readonly (string | number)[]) => number | undefined;
}
⋮----
export interface BoundedTaskYamlOptions {
  readonly filePath: string;
  readonly sourceLabel: string;
  readonly lineCounter?: LineCounter;
}
⋮----
export function yamlAstError(options: BoundedTaskYamlOptions, node: unknown, detail: string): never
⋮----
export function assertBoundedTaskYamlDocument(
  document: ReturnType<typeof parseDocument>,
  options: BoundedTaskYamlOptions,
): void
⋮----
export function readBoundedTaskSourceYaml(
  input: BoundedTaskSourceYamlInput,
  options: { readonly sourceLabel: string },
): BoundedTaskSourceYamlResult
⋮----
const lineAt = (fieldPath: readonly (string | number)[]): number | undefined =>
```

## File: src/tasks/source/parse-task-source.ts
```typescript
import { UsageError } from "../../core/errors";
import { readBoundedTaskSourceYaml } from "./bounded-document";
import { parseTaskSourceV4Document, TASK_SOURCE_V4_VERSION, type TaskSourceV4Document } from "./task-source-v4";
⋮----
export type ParsedTaskSource = Readonly<{ version: 4; v4: TaskSourceV4Document }>;
⋮----
export interface ParseTaskSourceInput {
  readonly yaml: string;
  readonly filePath: string;
}
⋮----
export function peekTaskSourceVersion(root: unknown): number | undefined
⋮----
function legacyVersionError(filePath: string, version: number): UsageError
⋮----
function unsupportedVersionError(filePath: string, version: number): UsageError
⋮----
export function v4ScheduleHasRetiredEnabledKey(root: unknown): boolean
⋮----
export function parseTaskSource(input: ParseTaskSourceInput): ParsedTaskSource
```

## File: src/tasks/source/project-v4.ts
```typescript
import type { PreparableTaskDocument } from "../prepare/prepared-execution";
import type { TaskV3AkmOptions } from "../source-v3";
import type { TaskSourceV4Document } from "./task-source-v4";
⋮----
function projectAkm(document: TaskSourceV4Document): Readonly<TaskV3AkmOptions> | undefined
⋮----
export function projectTaskSourceV4(document: TaskSourceV4Document): PreparableTaskDocument
```

## File: src/tasks/source/task-input-diagnostics.ts
```typescript
import { UsageError } from "../../core/errors";
import type { InputFlagDiagnostics } from "../../execution/input-contract";
⋮----
function invalidTaskInput(name: string, detail: string): UsageError
```

## File: src/tasks/source/task-source-v4.ts
```typescript
import { type ParsedBuiltinCommandAction, parseBuiltinCommandAction } from "../../commands/command/builtin-action";
import { UsageError } from "../../core/errors";
import {
  checkJsonSchemaDefinition,
  JSON_SCHEMA_SUBSET_SUPPORTED_KEYWORDS,
  validateJsonSchemaSubset,
} from "../../core/json-schema";
import { DURATION_UNITS, parseDuration } from "../../core/time";
import { warn, warnOnce } from "../../core/warn";
import {
  applyInputDefaults,
  INPUT_NAME_PATTERN,
  type InputContract,
  type InputDeclaration,
  validateInputs,
} from "../../execution/input-contract";
import type { ExecutionJsonObject, ExecutionJsonValue } from "../../execution/json";
import { EXECUTION_MAX_TIMEOUT_MS } from "../../execution/limits";
import { warnRetiredEngineKey } from "../../execution/source";
import { classifyTargetRef } from "../../execution/target-ref";
import { detectSecretShapedParams } from "../../workflows/exec/param-secrets";
import { WORKFLOW_ENV_VAR_NAME_PATTERN, WORKFLOW_MAX_SCHEMA_BYTES } from "../../workflows/resource-limits";
import { TASK_V3_HOST_SHELLS, TASK_V3_MAX_SCHEDULES, type TaskV3Environment, type TaskV3HostShell } from "../source-v3";
import { TASK_RUN_RESERVED_FLAG_NAMES } from "../task-run-reserved-flags";
import {
  asRecord,
  type BoundedDocumentContext,
  checkKeys,
  cloneBoundedJson,
  noGithubExpression,
  own,
  parseEnvironment,
  parseStringArray,
  presentJsonValue,
  readBoundedTaskSourceYaml,
  sourceError,
  stringField,
  TASK_V3_MAX_REDACT_NAMES,
  utf8Bytes,
} from "./bounded-document";
⋮----
export type TaskSourceV4UsesTarget =
  | Readonly<{ kind: "builtin-command"; ref: "akm/command" }>
  | Readonly<{ kind: "command" | "script" | "workflow"; ref: string }>;
⋮----
export type TaskSourceV4Target =
  | Readonly<{
      kind: "uses";
      uses: TaskSourceV4UsesTarget;
      with?: ExecutionJsonObject;
      command?: ParsedBuiltinCommandAction;
    }>
  | Readonly<{
      kind: "run";
      run: string;
      shell?: TaskV3HostShell;
      workingDirectory?: string;
    }>;
⋮----
export interface TaskSourceV4ScheduleBinding {
  readonly cron: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly source: string;
  readonly ordinal: number;
}
⋮----
export interface TaskSourceV4Execution {
  readonly agent?: string | null;
  readonly connection?: string | null;
  readonly harness?: string | null;

  readonly engine?: string | null;
  readonly model?: string | null;
  readonly inference?: ExecutionJsonObject | null;
  readonly timeout?: string | number | null;
  readonly redact?: readonly string[];
  readonly maxSteps?: number;
  readonly maxRetries?: number;
}
⋮----
export interface TaskSourceV4Document {
  readonly version: typeof TASK_SOURCE_V4_VERSION;
  readonly name?: string;
  readonly description?: string;
  readonly when_to_use?: string;
  readonly tags?: readonly string[];
  readonly inputs?: InputContract;
  readonly output?: Readonly<Record<string, unknown>>;
  readonly target: TaskSourceV4Target;
  readonly env?: TaskV3Environment;
  readonly execution: TaskSourceV4Execution;
  readonly schedule: readonly TaskSourceV4ScheduleBinding[];
  readonly manualOnly: boolean;
  readonly source: Readonly<{ path: string }>;
}
⋮----
export interface ParseTaskSourceV4DocumentOptions {
  readonly filePath: string;

  readonly lineAt?: (fieldPath: readonly (string | number)[]) => number | undefined;
}
⋮----
export interface ParseTaskSourceV4Input extends Omit<ParseTaskSourceV4DocumentOptions, "lineAt"> {
  readonly yaml: string;
}
⋮----
function ctxFrom(options: ParseTaskSourceV4DocumentOptions): BoundedDocumentContext
⋮----
function looksLikeGithubActionLocator(value: string): boolean
⋮----
export function classifyTaskSourceV4Uses(value: string): TaskSourceV4UsesTarget
⋮----
function nullableSelectorTopLevel(value: unknown, ctx: BoundedDocumentContext, key: string): string | null
⋮----
function parseTimeoutTopLevel(value: unknown, ctx: BoundedDocumentContext): string | number | null
⋮----
function parseTarget(input: ExecutionJsonObject, ctx: BoundedDocumentContext): TaskSourceV4Target
⋮----
function parseExecutionControls(input: ExecutionJsonObject, ctx: BoundedDocumentContext): TaskSourceV4Execution
⋮----
function stripDeclarationAnnotations(declInput: ExecutionJsonObject):
⋮----
function parseInputDeclaration(name: string, raw: ExecutionJsonValue, ctx: BoundedDocumentContext): InputDeclaration
⋮----
function parseInputDeclarations(value: ExecutionJsonValue, ctx: BoundedDocumentContext): InputContract
⋮----
function parseOutputSchema(value: ExecutionJsonValue, ctx: BoundedDocumentContext): Readonly<Record<string, unknown>>
⋮----
function targetConsumesOutputSchema(target: TaskSourceV4Target): boolean
⋮----
function checkScheduleEntryRunnable(
  inputs: Readonly<Record<string, unknown>>,
  contract: InputContract,
  ctx: BoundedDocumentContext,
  entryPath: readonly (string | number)[],
): void
⋮----
function parseScheduleEntry(
  entryRaw: ExecutionJsonValue,
  index: number,
  contract: InputContract,
  ctx: BoundedDocumentContext,
): TaskSourceV4ScheduleBinding
⋮----
function parseSchedule(
  input: ExecutionJsonObject,
  contract: InputContract,
  ctx: BoundedDocumentContext,
): readonly TaskSourceV4ScheduleBinding[]
⋮----
function checkTopLevelKeys(input: ExecutionJsonObject, ctx: BoundedDocumentContext): void
⋮----
export function parseTaskSourceV4Document(
  value: unknown,
  options: ParseTaskSourceV4DocumentOptions,
): TaskSourceV4Document
⋮----
export function parseTaskSourceV4(input: ParseTaskSourceV4Input): TaskSourceV4Document
```

## File: src/tasks/activation-config.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { assetPathForName, stashDirFor } from "../core/asset/asset-placement";
import { bundleRefToString, makeBundleRef, parseBundleRef } from "../core/asset/asset-ref";
import { typeNameFromConceptId } from "../core/asset/resolve-ref";
import { type AkmConfig, mutateConfig, schedulerSourceIdFor } from "../core/config/config";
import { bundleComponentConfig, bundleContentRoots, isBundleEnabled } from "../core/config/config-sources";
import { UsageError } from "../core/errors";
import { warnOnce } from "../core/warn";
import type { InstalledSchedulerBinding } from "./scheduler-binding";
⋮----
export function canonicalSchedulerRef(ref: string): string
⋮----
export function schedulerEnabledRefs(config: AkmConfig): readonly string[] | undefined
⋮----
export function isSchedulerRefEnabled(config: AkmConfig, ref: string): boolean
⋮----
export function revokeSchedulerActivationsForBundle(config: AkmConfig, bundleId: string): AkmConfig
⋮----
export function isSchedulerBundleActive(config: AkmConfig, bundleId: string): boolean
⋮----
export function setSchedulerRefEnabled(
  ref: string,
  enabled: boolean,
):
⋮----
export function enabledRefsFromInstalled(
  installed: readonly InstalledSchedulerBinding[],
  config: AkmConfig,
): readonly string[]
⋮----
function installedEntryRef(entry: InstalledSchedulerBinding, config: AkmConfig): string | undefined
⋮----
function hasBackingFile(config: AkmConfig, bundle: string, conceptId: string): boolean
⋮----
function bundleOf(ref: string): string | undefined
```

## File: src/tasks/command-executable.ts
```typescript
export function findAkmExecutableIndex(command: readonly string[]): number | undefined
⋮----
export function findBareAkmExecutableIndex(command: readonly string[]): number | undefined
⋮----
function findEnvCommandIndex(command: readonly string[]): number | undefined
⋮----
function envOptionOperandCount(option: string): 0 | 1 | undefined
⋮----
function isEnvironmentAssignment(value: string): boolean
⋮----
function isEnvExecutable(value: string | undefined): boolean
⋮----
function isAbsolutePath(value: string): boolean
⋮----
function isBareAkm(value: string | undefined): boolean
⋮----
function isAkmExecutable(value: string | undefined): boolean
```

## File: src/tasks/embedded.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { getDirname } from "../runtime";
import { parseTaskSource } from "./source/parse-task-source";
⋮----
export interface EmbeddedTask {





  id: string;

  label: string;

  command: string;

  schedule: string;

  description: string;

  enabled: boolean;

  yaml: string;
}
⋮----
export function listEmbeddedTasks(): EmbeddedTask[]
```

## File: src/tasks/frozen-script.ts
```typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assertNever } from "../core/assert";
import type { TaskV3ScriptInterpreter } from "./prepare/prepared-execution";
import { STANDALONE_FROZEN_SCRIPT_ARG } from "./standalone-script-entry";
⋮----
export interface FrozenScriptSnapshot {
  readonly sourceRef: string;
  readonly interpreter: TaskV3ScriptInterpreter;
  readonly extension: string;
  readonly bytesBase64: string;
  readonly byteLength: number;
  readonly sha256: string;
}
⋮----
export interface MaterializedFrozenScript {
  readonly directory: string;
  readonly file: string;
}
⋮----
export function materializeFrozenScript(script: FrozenScriptSnapshot): MaterializedFrozenScript
⋮----
export function frozenScriptCommand(script: FrozenScriptSnapshot, materializedPath: string): string[]
⋮----
export function cleanupFrozenScript(materialized: MaterializedFrozenScript): void
```

## File: src/tasks/log-redaction.ts
```typescript
import type { AkmConfig } from "../core/config/config-types";
import { collectCredentialValues } from "../core/config/credentials";
import { collectInferredSecretValues, collectSensitiveValues } from "../core/redaction";
⋮----
export type TaskLogRedactionConfig = Pick<AkmConfig, "connections" | "embedding" | "search">;
⋮----
export function collectTaskLogSensitiveValues(input: {
  env: NodeJS.ProcessEnv;
  config?: TaskLogRedactionConfig | undefined;
  declaredNames?: readonly string[] | undefined;
}): string[]
⋮----
const addDeclared = (value: string | undefined): void =>
```

## File: src/tasks/resolve-akm-bin.ts
```typescript
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigError } from "../core/errors";
import { mainPath as runtimeMainPath } from "../runtime";
⋮----
export interface ResolvedAkmInvocation {

  argv: string[];

  via: "npm" | "standalone" | "checkout";
}
⋮----
export function isBunStandaloneMain(mainPath: string | undefined = runtimeMainPath): boolean
⋮----
export function resolveAkmInvocation(
  options: {
    env?: NodeJS.ProcessEnv;
    cliEntryUrl?: string;
    runtime?: "bun" | "node";
    execPath?: string;
    mainPath?: string;
    launcherPath?: string;
    nodePath?: string;
  } = {},
): ResolvedAkmInvocation
⋮----
export function isCheckoutInvocation(argv: readonly string[]): boolean
⋮----
function resolveCheckoutEntry(
  moduleUrl: string,
  runtime: "bun" | "node",
  mainPath: string | undefined,
): string | undefined
⋮----
function absoluteInvocationPath(value: string): string
⋮----
function isPublicPackageLauncher(file: string): boolean
⋮----
function isCheckoutLauncher(file: string): boolean
⋮----
export function resolveNpmGlobalRoot(nodePath: string, env: NodeJS.ProcessEnv): string | undefined
⋮----
function resolveAssociatedNpmCli(nodePath: string): string | undefined
```

## File: src/tasks/schedule-gates.ts
```typescript
import { UsageError } from "../core/errors";
import { applyInputDefaults, validateInputs } from "../execution/input-contract";
import { parseSchedule, type ScheduleBackend } from "./schedule";
import type { ParsedTaskSource } from "./source/parse-task-source";
⋮----
export function assertTaskScheduleInputsSatisfyContract(
  v4: Pick<ParsedTaskSource["v4"], "inputs" | "schedule">,
  refLabel: string,
): void
⋮----
export function assertTaskScheduleCronValid(
  v4: Pick<ParsedTaskSource["v4"], "schedule">,
  backend: ScheduleBackend,
): void
```

## File: src/tasks/schedule.ts
```typescript
import { UsageError } from "../core/errors";
⋮----
export type ScheduleBackend = "cron" | "launchd" | "schtasks";
⋮----
export interface ScheduleSpec {

  raw: string;

  cron: string;

  fields: ScheduleFields;
}
⋮----
export interface ScheduleFields {
  minute: ScheduleField;
  hour: ScheduleField;
  dom: ScheduleField;
  month: ScheduleField;
  dow: ScheduleField;
}
⋮----
export type ScheduleField =
  | { kind: "star" }
  | { kind: "value"; value: number }
  | { kind: "step"; step: number }
  | { kind: "rangeStep"; start: number; end: number; step: number }





  | { kind: "list"; values: number[] };
⋮----
function substituteNamedTokens(raw: string, fieldName: "month" | "day-of-week"): string
⋮----
const indexOf = (token: string): number | undefined =>
⋮----
export function parseSchedule(input: string, backend: ScheduleBackend): ScheduleSpec
⋮----
function expandAlias(raw: string): string
⋮----
function parseCronFields(cron: string, original: string): ScheduleFields
⋮----
function parseField(
  rawInput: string,
  name: "minute" | "hour" | "day-of-month" | "month" | "day-of-week",
  limit: { min: number; max: number },
  original: string,
): ScheduleField
⋮----
export function translateToCron(spec: ScheduleSpec): string
⋮----
export interface LaunchdTrigger {

  calendar?: LaunchdCalendar;

  calendars?: LaunchdCalendar[];
}
⋮----
export interface LaunchdCalendar {
  Minute?: number;
  Hour?: number;
  Day?: number;
  Month?: number;
  Weekday?: number;
}
⋮----
export function translateToLaunchd(spec: ScheduleSpec): LaunchdTrigger
⋮----
function expandFieldValues(
  field: Extract<ScheduleField, { kind: "step" | "rangeStep" }>,
  limit: { min: number; max: number },
): number[]
⋮----
function expandListLikeField(field: ScheduleField, limit:
⋮----
function rejectStepInsideCalendar(field: ScheduleField, name: string, spec: ScheduleSpec): void
⋮----
export type SchtasksTrigger =
  | { kind: "minute"; everyMinutes: number }
  | { kind: "minuteValues"; minutes: number[] }
  | { kind: "hour"; everyHours: number; atMinute: number }
  | { kind: "hourValues"; hours: number[]; atMinute: number }
  | { kind: "daily"; atHour: number; atMinute: number }
  | { kind: "weekly"; atHour: number; atMinute: number; daysOfWeek: number[] }
  | { kind: "monthly"; atHour: number; atMinute: number; daysOfMonth: number[]; months: number[] };
⋮----
export function translateToSchtasks(spec: ScheduleSpec): SchtasksTrigger
⋮----
function minuteValuesTrigger(minutes: number[], spec: ScheduleSpec): SchtasksTrigger
⋮----
function rejectDomDowCombination(spec: ScheduleSpec, backend: string): void
```

## File: src/tasks/scheduler-binding.ts
```typescript
import { createHash } from "node:crypto";
import { bundleRefToString, parseBundleRef } from "../core/asset/asset-ref";
import { UsageError } from "../core/errors";
import { canonicalInputJson } from "../execution/input-contract";
import type { ScheduleBackend } from "./schedule";
import type { ScheduledRowEnvironment } from "./scheduler-invocation";
import { normaliseTaskConceptId } from "./task-id";
⋮----
export type SchedulerLogicalSource = Readonly<{
  kind: "task" | "workflow";
  ref: string;
}>;
⋮----
export interface SchedulerBinding {

  readonly id: string;

  readonly nativeId?: string;
  readonly logicalSource: SchedulerLogicalSource;
  readonly cron: string;
  readonly source: string;
  readonly ordinal: number;
  readonly enabled: boolean;

  readonly invocation: readonly string[];
}
⋮----
export interface SchedulerSourceSchedule {
  readonly cron: string;
  readonly source: string;
  readonly ordinal: number;

  readonly inputs?: Readonly<Record<string, unknown>>;
}
⋮----
export interface CompileTaskSchedulerBindingsInput {
  readonly id: string;
  readonly qualifiedRef: string;
  readonly schedules: readonly SchedulerSourceSchedule[];
}
⋮----
export interface InstalledSchedulerBinding {
  readonly id: string;

  readonly nativeId?: string;

  readonly enabled?: boolean;

  readonly binding: readonly string[];

  readonly environment?: ScheduledRowEnvironment;

  readonly contextPath?: string;

  readonly signature?: string;

  readonly target?: string;

  readonly invocation?: readonly string[];





  readonly ownerBundlePath?: string;
}
⋮----
export interface SchedulerInstallOptions {

  readonly binding?: readonly string[];

  readonly environment?: ScheduledRowEnvironment;
}
⋮----
export interface SchedulerBackend {
  readonly name: ScheduleBackend;

  install(binding: SchedulerBinding, opts?: SchedulerInstallOptions): Promise<void> | void;

  uninstall(nativeId: string): Promise<void> | void;
  setEnabled(nativeId: string, enabled: boolean): Promise<void> | void;
  list(): Promise<InstalledSchedulerBinding[]> | InstalledSchedulerBinding[];

  expectedSignature?(binding: SchedulerBinding, opts?: SchedulerInstallOptions): string;
}
⋮----
install(binding: SchedulerBinding, opts?: SchedulerInstallOptions): Promise<void> | void;
⋮----
uninstall(nativeId: string): Promise<void> | void;
setEnabled(nativeId: string, enabled: boolean): Promise<void> | void;
list(): Promise<InstalledSchedulerBinding[]> | InstalledSchedulerBinding[];
⋮----
expectedSignature?(binding: SchedulerBinding, opts?: SchedulerInstallOptions): string;
⋮----
export function compileTaskSchedulerBindings(input: CompileTaskSchedulerBindingsInput): readonly SchedulerBinding[]
⋮----
function schedulerInputFlagTail(inputs: Readonly<Record<string, unknown>> | undefined): readonly string[]
⋮----
function schedulerInputFlagValueText(value: unknown): string
⋮----
export function schedulerNativeBindingId(id: string): string
⋮----
export function schedulerBindingNativeId(binding: SchedulerBinding): string
⋮----
export function schedulerLogicalBindingId(nativeId: string, invocation: readonly string[]): string
⋮----
function digestBindingId(kind: "task" | "workflow", ref: string, ordinal: number): string
⋮----
function assertQualifiedRef(value: string, kind: "task" | "workflow"): string
⋮----
function freezeBinding(binding: SchedulerBinding): SchedulerBinding
```

## File: src/tasks/scheduler-invocation.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { bundleRefToString, parseBundleRef } from "../core/asset/asset-ref";
import { resolveStashDir } from "../core/common";
import { ConfigError } from "../core/errors";
import { INPUT_NAME_PATTERN } from "../execution/input-contract";
import { normaliseTaskConceptId } from "./task-id";
⋮----
type ScheduledTaskContextKey = (typeof SCHEDULED_TASK_CONTEXT_KEYS)[number];
⋮----
export type ScheduledRowEnvironment = Readonly<Partial<Record<ScheduledTaskContextKey, string>>>;
⋮----
export function scheduledTaskContextEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string>
⋮----
export function scheduledRowEnvironment(env: NodeJS.ProcessEnv = process.env): ScheduledRowEnvironment
⋮----
export function scheduledRowEnvironmentEntries(environment: ScheduledRowEnvironment | undefined): [string, string][]
⋮----
export function scheduledRowEnvironmentFrom(
  variables: Readonly<Record<string, string>>,
): ScheduledRowEnvironment | undefined
⋮----
export interface ParsedScheduledInvocation {

  binding: string[];

  invocation: string[];

  target?: string;

  contextPath?: string;

  environment?: ScheduledRowEnvironment;
}
⋮----
export function buildScheduledInvocation(akmArgv: readonly string[], invocation: readonly string[]): string[]
⋮----
export function parseScheduledInvocationArgv(argv: readonly string[]): ParsedScheduledInvocation | undefined
⋮----
export function readLegacySchedulerContext(file: string): Record<string, string>
⋮----
export function consumeSchedulerContextArg(argv: string[], env: NodeJS.ProcessEnv = process.env): string[]
⋮----
function parsePublicSchedulerInvocation(
  invocation: readonly string[],
):
⋮----
function isValidSchedulerInputFlagTail(tail: readonly string[]): boolean
⋮----
function invalidSchedulerInvocation(): ConfigError
```

## File: src/tasks/scheduler-lock.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { TransientError } from "../core/errors";
import { createLockPayload, probeLock, reclaimStaleLock, releaseLock, tryAcquireLockSync } from "../core/file-lock";
import { getStateDir } from "../core/paths";
⋮----
export function schedulerLockPath(): string
⋮----
export async function withSchedulerLock<T>(fn: () => Promise<T>): Promise<T>
⋮----
const acquire = () => tryAcquireLockSync(lockPath, createLockPayload(
```

## File: src/tasks/scheduler-sync.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { makeBundleRef, parseBundleRef } from "../core/asset/asset-ref";
import { compareCodePoints, toPosix } from "../core/common";
import type { AkmConfig } from "../core/config/config-types";
import { prepareTaskV3Execution } from "./prepare/prepare";
import type { PrepareTaskV3ExecutionContext } from "./prepare/prepared-execution";
import type { ScheduleBackend } from "./schedule";
import { assertTaskScheduleCronValid, assertTaskScheduleInputsSatisfyContract } from "./schedule-gates";
import {
  compileTaskSchedulerBindings,
  type InstalledSchedulerBinding,
  type SchedulerBinding,
  type SchedulerInstallOptions,
  schedulerBindingNativeId,
  schedulerNativeBindingId,
} from "./scheduler-binding";
import { parseTaskSource } from "./source/parse-task-source";
import { projectTaskSourceV4 } from "./source/project-v4";
import { taskSourceErrorDetail } from "./source-v3";
⋮----
export interface SchedulerSourceFailure {
  readonly path: string;
  readonly ref?: string;
  readonly reason: string;
}
⋮----
export interface CompileSchedulerSourcesInput {
  readonly sourceRoot: string;
  readonly adapterId: string;
  readonly bundleName: string;
  readonly backend: ScheduleBackend;

  readonly config?: AkmConfig;

  readonly resolveAsset?: PrepareTaskV3ExecutionContext["resolveAsset"];

  readonly enabledRefs?: ReadonlySet<string>;
}
⋮----
export interface CompiledSchedulerSources {
  readonly desired: readonly SchedulerBinding[];
  readonly failures: readonly SchedulerSourceFailure[];
}
⋮----
export async function compileSchedulerSources(input: CompileSchedulerSourcesInput): Promise<CompiledSchedulerSources>
⋮----
async function compileTaskSources(
  input: CompileSchedulerSourcesInput,
  desired: SchedulerBinding[],
  failures: SchedulerSourceFailure[],
): Promise<void>
⋮----
function taskSourceFiles(sourceRoot: string, adapterId: string): string[]
⋮----
function sourceRef(bundleName: string, conceptId: string): string | undefined
⋮----
function listDirectory(dir: string): string[]
⋮----
function walkFiles(dir: string): string[]
⋮----
const visit = (directory: string): void =>
⋮----
function statOrUndefined(file: string): fs.Stats | undefined
⋮----
export interface SchedulerBundleScope {
  readonly bundleName: string;








  readonly bundlePath?: string;

  readonly adapterId?: string;
}
⋮----
export interface SchedulerSyncPlanInput {
  readonly desired: readonly SchedulerBinding[];
  readonly installed: readonly InstalledSchedulerBinding[];
  readonly scopes: readonly SchedulerBundleScope[];
  readonly expectedSignature?: (binding: SchedulerBinding, options?: SchedulerInstallOptions) => string;

  readonly installOptions?: SchedulerInstallOptions;

  readonly rebind?: boolean;

  readonly extraRemovals?: readonly InstalledSchedulerBinding[];

  readonly keepRefs?: ReadonlySet<string>;
}
⋮----
export type SchedulerSyncOperation =
  | Readonly<{
      kind: "install" | "update";
      binding: SchedulerBinding;
      options?: SchedulerInstallOptions;

      installedSignature?: string;

      expectedSignature?: string;
    }>
  | Readonly<{
      kind: "remove";
      id: string;
      nativeId: string;

      ownerBundlePath?: string;

      reason?: "invalid-context" | "dead-bundle-path";
    }>;
⋮----
export interface SchedulerSyncPlan {
  readonly desired: readonly SchedulerBinding[];
  readonly installed: readonly string[];
  readonly updated: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: readonly string[];

  readonly operations: readonly SchedulerSyncOperation[];
  readonly failures: readonly SchedulerSourceFailure[];
}
⋮----
export function installedRowNativeId(row: InstalledSchedulerBinding): string
⋮----
export function scheduledInvocationBundle(invocation: readonly string[] | undefined): string | undefined
⋮----
export function installedRowScope(
  row: InstalledSchedulerBinding,
  scopes: readonly SchedulerBundleScope[],
): SchedulerBundleScope | undefined
⋮----
export function planSchedulerSync(input: SchedulerSyncPlanInput): SchedulerSyncPlan
⋮----
function installOptionsFor(
  input: SchedulerSyncPlanInput,
  current: InstalledSchedulerBinding | undefined,
): SchedulerInstallOptions | undefined
⋮----
function installedRowRef(row: InstalledSchedulerBinding, scope: SchedulerBundleScope): string | undefined
⋮----
export function installedRowOwner(row: InstalledSchedulerBinding): string
⋮----
function foreignRowMessage(nativeId: string, row: InstalledSchedulerBinding): string
⋮----
export interface SchedulerPlanPreviewOperation {
  readonly id: string;
  readonly kind: "install" | "update" | "remove";

  readonly nativeId?: string;

  readonly ownerBundlePath?: string;

  readonly reason?: "invalid-context" | "dead-bundle-path";

  readonly installedFingerprint?: string;

  readonly expectedFingerprint?: string;
}
⋮----
export interface SchedulerPlanPreview {
  readonly backend: string;
  readonly dryRun: true;
  readonly adds: readonly SchedulerPlanPreviewOperation[];
  readonly updates: readonly SchedulerPlanPreviewOperation[];
  readonly removes: readonly SchedulerPlanPreviewOperation[];
  readonly unchanged: readonly string[];

  readonly hasRemovals: boolean;
  readonly failures: readonly SchedulerSourceFailure[];
}
⋮----
export function renderSchedulerPlanPreview(
  backend: string,
  operations: readonly SchedulerSyncOperation[],
  unchanged: readonly string[] = [],
  failures: readonly SchedulerSourceFailure[] = [],
): SchedulerPlanPreview
⋮----
function errorMessage(cause: unknown): string
```

## File: src/tasks/source-v3.ts
```typescript
import type { ParsedBuiltinCommandAction } from "../commands/command/builtin-action";
import type { ExecutionJsonObject } from "../execution/json";
import { TASK_V3_MAX_SCHEDULES } from "./source/bounded-document";
⋮----
export function taskExtensionDetail(relPath: string): string
⋮----
/** Closed authoring vocabulary. Arbitrary GitHub `{0}` shell templates are not accepted. */
⋮----
export type TaskV3HostShell = (typeof TASK_V3_HOST_SHELLS)[number];
⋮----
export type TaskV3UsesTarget =
  | Readonly<{ kind: "builtin-command"; ref: "akm/command" }>
  | Readonly<{ kind: "command" | "workflow" | "script"; ref: string }>;
⋮----
export type TaskV3Environment = Readonly<Record<string, string | number | boolean>>;
⋮----
export interface TaskV3AkmOptions {
  readonly schedule?: string;
  readonly enabled?: boolean;
  readonly description?: string;
  readonly when_to_use?: string;
  readonly tags?: readonly string[];
  readonly agent?: string | null;
  readonly connection?: string | null;
  readonly harness?: string | null;
  readonly engine?: string | null;
  readonly model?: string | null;
  readonly inference?: ExecutionJsonObject | null;
  readonly outputSchema?: ExecutionJsonObject | null;
  readonly timeout?: string | number | null;
  readonly redact?: readonly string[];
  readonly maxSteps?: number;
  readonly maxRetries?: number;
}
⋮----
export type TaskV3Target =
  | Readonly<{
      kind: "uses";
      uses: TaskV3UsesTarget;
      with?: ExecutionJsonObject;
      command?: ParsedBuiltinCommandAction;
    }>
  | Readonly<{
      kind: "run";
      run: string;
      shell?: TaskV3HostShell;
      workingDirectory?: string;
    }>;
⋮----
interface PreparableTaskTriggerPlan {
  readonly manual: boolean;
  readonly schedules: readonly Readonly<{ cron: string; source: string; ordinal: number }>[];
}
⋮----
export interface TaskV3SourceDocument {
  readonly version: 3;
  readonly name?: string;
  readonly target: TaskV3Target;
  readonly env?: TaskV3Environment;
  readonly akm?: Readonly<TaskV3AkmOptions>;
  readonly triggers: PreparableTaskTriggerPlan;
  readonly source: Readonly<{ path: string }>;
}
⋮----
export function taskSourceErrorDetail(cause: unknown): string
```

## File: src/tasks/standalone-script-entry.ts
```typescript

```

## File: src/tasks/task-id.ts
```typescript
import { UsageError } from "../core/errors";
⋮----
export function validateTaskId(id: string): string
⋮----
export function normaliseTaskId(raw: string): string
⋮----
export function validateTaskConceptId(id: string): string
⋮----
export function normaliseTaskConceptId(raw: string): string
```

## File: src/tasks/task-run-reserved-flags.ts
```typescript

```
