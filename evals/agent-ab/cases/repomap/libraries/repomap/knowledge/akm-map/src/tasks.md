---
description: "Repo map of akm src/tasks at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/tasks

## src/tasks/

### src/tasks/activation-config.ts

- `export function canonicalSchedulerRef(ref: string): string`
- `export function schedulerEnabledRefs(config: AkmConfig): readonly string[] | undefined`
- `export function isSchedulerRefEnabled(config: AkmConfig, ref: string): boolean`
- `export function revokeSchedulerActivationsForBundle(config: AkmConfig, bundleId: string): AkmConfig`
- `export function isSchedulerBundleActive(config: AkmConfig, bundleId: string): boolean`
- `export function setSchedulerRefEnabled`
- `export function enabledRefsFromInstalled`
- `function installedEntryRef(entry: InstalledSchedulerBinding, config: AkmConfig): string | undefined`
- `function hasBackingFile(config: AkmConfig, bundle: string, conceptId: string): boolean`
- `function bundleOf(ref: string): string | undefined`

### src/tasks/command-executable.ts

- `export function findAkmExecutableIndex(command: readonly string[]): number | undefined`
- `export function findBareAkmExecutableIndex(command: readonly string[]): number | undefined`
- `function findEnvCommandIndex(command: readonly string[]): number | undefined`
- `function envOptionOperandCount(option: string): 0 | 1 | undefined`
- `function isEnvironmentAssignment(value: string): boolean`
- `function isEnvExecutable(value: string | undefined): boolean`
- `function isAbsolutePath(value: string): boolean`
- `function isBareAkm(value: string | undefined): boolean`
- `function isAkmExecutable(value: string | undefined): boolean`

### src/tasks/embedded.ts

- `export interface EmbeddedTask`
- `export function listEmbeddedTasks(): EmbeddedTask[]`

### src/tasks/frozen-script.ts

- `export interface FrozenScriptSnapshot`
- `export interface MaterializedFrozenScript`
- `export function materializeFrozenScript(script: FrozenScriptSnapshot): MaterializedFrozenScript`
- `export function frozenScriptCommand(script: FrozenScriptSnapshot, materializedPath: string): string[]`
- `export function cleanupFrozenScript(materialized: MaterializedFrozenScript): void`

### src/tasks/log-redaction.ts

- `export type TaskLogRedactionConfig = Pick<AkmConfig, "connections" | "embedding" | "search">;`
- `export function collectTaskLogSensitiveValues(input:`
- `const addDeclared = (value: string | undefined): void =>`

### src/tasks/resolve-akm-bin.ts

- `export interface ResolvedAkmInvocation`
- `export function isBunStandaloneMain(mainPath: string | undefined = runtimeMainPath): boolean`
- `export function resolveAkmInvocation`
- `export function isCheckoutInvocation(argv: readonly string[]): boolean`
- `function resolveCheckoutEntry`
- `function absoluteInvocationPath(value: string): string`
- `function isPublicPackageLauncher(file: string): boolean`
- `function isCheckoutLauncher(file: string): boolean`
- `export function resolveNpmGlobalRoot(nodePath: string, env: NodeJS.ProcessEnv): string | undefined`
- `function resolveAssociatedNpmCli(nodePath: string): string | undefined`

### src/tasks/schedule-gates.ts

- `export function assertTaskScheduleInputsSatisfyContract`
- `export function assertTaskScheduleCronValid`

### src/tasks/schedule.ts

- `export type ScheduleBackend = "cron" | "launchd" | "schtasks";`
- `export interface ScheduleSpec`
- `export interface ScheduleFields`
- `export type ScheduleField`
- `function substituteNamedTokens(raw: string, fieldName: "month" | "day-of-week"): string`
- `const indexOf = (token: string): number | undefined =>`
- `export function parseSchedule(input: string, backend: ScheduleBackend): ScheduleSpec`
- `function expandAlias(raw: string): string`
- `function parseCronFields(cron: string, original: string): ScheduleFields`
- `function parseField`
- `export function translateToCron(spec: ScheduleSpec): string`
- `export interface LaunchdTrigger`
- `export interface LaunchdCalendar`
- `export function translateToLaunchd(spec: ScheduleSpec): LaunchdTrigger`
- `function expandFieldValues`
- `function expandListLikeField(field: ScheduleField, limit:`
- `function rejectStepInsideCalendar(field: ScheduleField, name: string, spec: ScheduleSpec): void`
- `export type SchtasksTrigger`
- `export function translateToSchtasks(spec: ScheduleSpec): SchtasksTrigger`
- `function minuteValuesTrigger(minutes: number[], spec: ScheduleSpec): SchtasksTrigger`
- `function rejectDomDowCombination(spec: ScheduleSpec, backend: string): void`

### src/tasks/scheduler-binding.ts

- `export type SchedulerLogicalSource = Readonly<`
- `export interface SchedulerBinding`
- `export interface SchedulerSourceSchedule`
- `export interface CompileTaskSchedulerBindingsInput`
- `export interface InstalledSchedulerBinding`
- `export interface SchedulerInstallOptions`
- `export interface SchedulerBackend`
- `export function compileTaskSchedulerBindings(input: CompileTaskSchedulerBindingsInput): readonly SchedulerBinding[]`
- `function schedulerInputFlagTail(inputs: Readonly<Record<string, unknown>> | undefined): readonly string[]`
- `function schedulerInputFlagValueText(value: unknown): string`
- `export function schedulerNativeBindingId(id: string): string`
- `export function schedulerBindingNativeId(binding: SchedulerBinding): string`
- `export function schedulerLogicalBindingId(nativeId: string, invocation: readonly string[]): string`
- `function digestBindingId(kind: "task" | "workflow", ref: string, ordinal: number): string`
- `function assertQualifiedRef(value: string, kind: "task" | "workflow"): string`
- `function freezeBinding(binding: SchedulerBinding): SchedulerBinding`

### src/tasks/scheduler-invocation.ts

- `type ScheduledTaskContextKey = (typeof SCHEDULED_TASK_CONTEXT_KEYS)[number];`
- `export type ScheduledRowEnvironment = Readonly<Partial<Record<ScheduledTaskContextKey, string>>>;`
- `export function scheduledTaskContextEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string>`
- `export function scheduledRowEnvironment(env: NodeJS.ProcessEnv = process.env): ScheduledRowEnvironment`
- `export function scheduledRowEnvironmentEntries(environment: ScheduledRowEnvironment | undefined): [string, string][]`
- `export function scheduledRowEnvironmentFrom`
- `export interface ParsedScheduledInvocation`
- `export function buildScheduledInvocation(akmArgv: readonly string[], invocation: readonly string[]): string[]`
- `export function parseScheduledInvocationArgv(argv: readonly string[]): ParsedScheduledInvocation | undefined`
- `export function readLegacySchedulerContext(file: string): Record<string, string>`
- `export function consumeSchedulerContextArg(argv: string[], env: NodeJS.ProcessEnv = process.env): string[]`
- `function parsePublicSchedulerInvocation`
- `function isValidSchedulerInputFlagTail(tail: readonly string[]): boolean`
- `function invalidSchedulerInvocation(): ConfigError`

### src/tasks/scheduler-lock.ts

- `export function schedulerLockPath(): string`
- `export async function withSchedulerLock<T>(fn: () => Promise<T>): Promise<T>`
- `const acquire = () => tryAcquireLockSync(lockPath, createLockPayload`

### src/tasks/scheduler-sync.ts

- `export interface SchedulerSourceFailure`
- `export interface CompileSchedulerSourcesInput`
- `export interface CompiledSchedulerSources`
- `export async function compileSchedulerSources(input: CompileSchedulerSourcesInput): Promise<CompiledSchedulerSources>`
- `async function compileTaskSources`
- `function taskSourceFiles(sourceRoot: string, adapterId: string): string[]`
- `function sourceRef(bundleName: string, conceptId: string): string | undefined`
- `function listDirectory(dir: string): string[]`
- `function walkFiles(dir: string): string[]`
- `const visit = (directory: string): void =>`
- `function statOrUndefined(file: string): fs.Stats | undefined`
- `export interface SchedulerBundleScope`
- `export interface SchedulerSyncPlanInput`
- `export type SchedulerSyncOperation`
- `export interface SchedulerSyncPlan`
- `export function installedRowNativeId(row: InstalledSchedulerBinding): string`
- `export function scheduledInvocationBundle(invocation: readonly string[] | undefined): string | undefined`
- `export function installedRowScope`
- `export function planSchedulerSync(input: SchedulerSyncPlanInput): SchedulerSyncPlan`
- `function installOptionsFor`
- `function installedRowRef(row: InstalledSchedulerBinding, scope: SchedulerBundleScope): string | undefined`
- `export function installedRowOwner(row: InstalledSchedulerBinding): string`
- `function foreignRowMessage(nativeId: string, row: InstalledSchedulerBinding): string`
- `export interface SchedulerPlanPreviewOperation`
- `export interface SchedulerPlanPreview`
- `export function renderSchedulerPlanPreview`
- `function errorMessage(cause: unknown): string`

### src/tasks/source-v3.ts

- `export function taskExtensionDetail(relPath: string): string`
- `export type TaskV3HostShell = (typeof TASK_V3_HOST_SHELLS)[number];`
- `export type TaskV3UsesTarget`
- `export type TaskV3Environment = Readonly<Record<string, string | number | boolean>>;`
- `export interface TaskV3AkmOptions`
- `export type TaskV3Target`
- `interface PreparableTaskTriggerPlan`
- `export interface TaskV3SourceDocument`
- `export function taskSourceErrorDetail(cause: unknown): string`

### src/tasks/standalone-script-entry.ts

### src/tasks/task-id.ts

- `export function validateTaskId(id: string): string`
- `export function normaliseTaskId(raw: string): string`
- `export function validateTaskConceptId(id: string): string`
- `export function normaliseTaskConceptId(raw: string): string`

### src/tasks/task-run-reserved-flags.ts

## src/tasks/backends/

### src/tasks/backends/cron.ts

- `export type CronExecResult =`
- `export interface CronExec`
- `export type CronFs = Pick<NodeFs, "ensureDir"> &`
- `export interface CronBackendOptions`
- `` const BEGIN = (id: string) => `# akm:task $ ``
- `` const END = (id: string) => `# akm:task $ ``
- `export function CRON_BACKEND(options: CronBackendOptions`
- `const lineFor = (task: SchedulerBinding, opts?: SchedulerInstallOptions)`
- `export interface CronWrapperScript`
- `export interface CronLineResult`
- `function buildCronLineParts`
- `function quoteForShellScript(part: string): string`
- `export function buildCronLine`
- `export function cronBlockBody(cronLine: string, enabled: boolean): string`
- `export function renderBlock(id: string, cronLine: string, enabled: boolean): string`
- `export function listBlocks(existing: string): Array<`
- `interface ParsedCronBlock`
- `function parseBlocks(existing: string): ParsedCronBlock[]`
- `function malformedBlockError(id: string): ConfigError`
- `export function extractInstalledTarget(body: string): string | undefined`
- `export function extractCronInvocation(body: string): ParsedScheduledInvocation | undefined`
- `export function extractCronWrapperInvocation`
- `function splitCronShellWords(value: string): string[]`
- `function normalizeSignature(body: string): string`
- `function cronIsDisabled(body: string): boolean`
- `export function upsertBlock(existing: string, id: string, block: string): string`
- `export function removeBlock(existing: string, id: string): string`
- `export function renderEnvBlock(envPath: string): string`
- `export function upsertEnvBlock(existing: string, envPath: string | undefined): string`
- `export function removeEnvBlock(existing: string): string`
- `function dedupeSearchPath(value: string): string`
- `export function toggleBlock(existing: string, id: string, enabled: boolean): string`
- `function quoteForCron(part: string): string`
- `function assertCronValue(value: string): string`
- `function assertPortableCronLine(line: string): void`
- `function readCrontab(exec: CronExec): string`
- `function writeCrontab(exec: CronExec, content: string): void`
- `function replaceCrontab(exec: CronExec, existing: string, next: string): void`
- `function defaultCronExec(): CronExec`
- `const run = (args: string[], input?: string): CronExecResult =>`

### src/tasks/backends/exec-utils.ts

- `export interface ExecResult`
- `export interface NodeExec`
- `export type BackendExec<Extra = unknown> = NodeExec & Extra;`
- `export function nodeExec(): NodeExec`
- `export interface NodeFs`
- `export function nodeFs(): NodeFs`
- `export function spawnCommand(args: string[]): ExecResult`
- `export interface ThrowIfNotOkOptions`
- `export function throwIfNotOk(result: ExecResult, options: ThrowIfNotOkOptions): ExecResult`
- `export function runOrThrow(exec: NodeExec, args: string[], options: ThrowIfNotOkOptions): ExecResult`
- `export function decodeCommandOutput(output: string | Buffer | null | undefined): string`
- `export function normalizeXmlForUtf16File(xml: string): string`
- `function decodeUtf16Be(output: Buffer): string`
- `export function escapeXml(s: string): string`

### src/tasks/backends/index.ts

- `export interface SelectBackendOptions`
- `export function selectBackend(options: SelectBackendOptions`
- `export function backendNameForPlatform(platform: NodeJS.Platform = process.platform): ScheduleBackend`

### src/tasks/backends/launchd.ts

- `export type LaunchdExec = BackendExec<{ uid(): number }>;`
- `export type LaunchdFs = NodeFs &`
- `export interface LaunchdBackendOptions`
- `export function LAUNCHD_BACKEND(options: LaunchdBackendOptions`
- `` const plistPath = (nativeId: string) => path.join(agentsDir, `$ ``
- `` const label = (nativeId: string) => `$ ``
- `` const target = (nativeId: string) => `gui/$ ``
- `const setEnableState = (nativeId: string, enabled: boolean) =>`
- `const bootout = (nativeId: string)`
- `const xmlFor = (task: SchedulerBinding, opts?: SchedulerInstallOptions)`
- `function launchdFingerprint(raw: string, enabled: boolean, loaded: boolean): string`
- `export function extractPlistInvocation(xml: string): ParsedScheduledInvocation | undefined`
- `function decodeXmlEntities(value: string): string`
- `function renderPlistEnvironment(envPath: string | undefined, environment: ScheduledRowEnvironment | undefined): string`
- `export function buildPlistXml`
- `function renderLaunchdTrigger(trigger: LaunchdTrigger): string`
- `function renderCalendar(calendar: NonNullable<LaunchdTrigger["calendar"]>, indent: string): string[]`
- `export function parseLaunchdLoadedLabels(output: string): Set<string>`
- `function readDisabledLabels(exec: LaunchdExec): Set<string>`
- `function isServiceNotFoundResult(result:`
- `function defaultAgentsDir(): string`
- `function defaultLaunchdExec(): LaunchdExec`
- `function defaultLaunchdFs(): LaunchdFs`

### src/tasks/backends/schtasks.ts

- `export type SchtasksExec = BackendExec;`
- `export type SchtasksFs = NodeFs &`
- `export interface SchtasksBackendOptions`
- `export function SCHTASKS_BACKEND(options: SchtasksBackendOptions`
- `` const taskName = (nativeId: string) => `$ ``
- `const xmlFor = (task: SchedulerBinding, opts?: SchedulerInstallOptions)`
- `const queryXml = (nativeId: string)`
- `export function extractSchtasksTarget(xml: string): string | undefined`
- `export function extractSchtasksInvocation(xml: string): ParsedScheduledInvocation | undefined`
- `function findPowerShellInvocationOperator(script: string): number | undefined`
- `function parsePowerShellSingleQuotedArgs(script: string, start: number): string[]`
- `export interface BuildSchtasksXmlOptions`
- `export function buildSchtasksXml`
- `interface NativeDailyTrigger`
- `interface NativeWeeklyTrigger`
- `interface NativeMonthlyTrigger`
- `type NativeSchtasksTrigger = NativeDailyTrigger | NativeWeeklyTrigger | NativeMonthlyTrigger;`
- `function renderSchtasksTrigger(trigger: SchtasksTrigger, now: Date): string`
- `function expandNativeTriggers(trigger: SchtasksTrigger): NativeSchtasksTrigger[]`
- `function renderNativeTrigger(trigger: NativeSchtasksTrigger, startBoundary: string): string`
- `function formatMinuteDuration(minutes: number): string`
- `function nextStartBoundary(trigger: NativeSchtasksTrigger, now: Date): Date`
- `function formatStartBoundary(d: Date): string`
- `const pad = (value: number)`
- `function quoteArg(s: string): string`
- `function quotePowerShell(value: string): string`
- `function isMissingTaskResult(result:`
- `function taskXmlSignature(xml: string): string`
- `function taskXmlEnabled(xml: string): boolean`
- `function decodeXml(value: string): string`
- `function resolveCurrentUserSid(exec: SchtasksExec): string`
- `function defaultSchtasksFs(): SchtasksFs`

### src/tasks/backends/types.ts

## src/tasks/model/

### src/tasks/model/invocation.ts

- `export type TaskInvocationCaller`
- `export interface TaskInvocationOverrides`
- `export interface TaskInvocation`
- `export type ExecutionProvenanceContext = Readonly<`

## src/tasks/prepare/

### src/tasks/prepare/prepare-script-target.ts

- `export interface PreparedScriptTarget`
- `export interface PrepareScriptTargetInput`
- `export function prepareScriptTarget(input: PrepareScriptTargetInput): PreparedScriptTarget`

### src/tasks/prepare/prepare-support.ts

- `function own(value: object | undefined, key: PropertyKey): boolean`
- `export function environmentSnapshot(environment: TaskV3Environment | undefined): Readonly<Record<string, string>>`
- `export function commandEnvironmentSnapshot`
- `function normalizeTimeout(value: string | number | null | undefined): number | null | undefined`
- `export function qualifyOwnedRef`
- `export function currentExecutionValues`
- `export function base`
- `export async function resolvedOwnedAsset`
- `export function defaultTaskShell(platform: NodeJS.Platform): TaskV3HostShell`
- `export function validatePreparedCommand`
- `export function validateWorkflowRuntimeSource`

### src/tasks/prepare/prepare.ts

- `export async function prepareTaskV3Execution`

### src/tasks/prepare/prepared-execution.ts

- `export type PreparableTaskDocument = TaskV3SourceDocument;`
- `export type TaskV3ScriptInterpreter`
- `export interface TaskV3PreparedBase`
- `export interface PreparedTaskV3Command extends TaskV3PreparedBase`
- `export interface PreparedTaskV3Workflow extends TaskV3PreparedBase`
- `export interface PreparedTaskV3Shell extends TaskV3PreparedBase`
- `export interface PreparedTaskV3Script extends TaskV3PreparedBase`
- `export type PreparedTaskV3Execution`
- `export interface PrepareTaskV3ExecutionContext`

### src/tasks/prepare/script-capture.ts

- `function interpreterFromShebang(bytes: Uint8Array | undefined): TaskV3ScriptInterpreter | undefined`
- `function nodeStripsTypeScript(): boolean`
- `export function scriptInterpreter(extension: string, ref: string, bytes?: Uint8Array): TaskV3ScriptInterpreter`
- `export interface CapturedScriptTarget`
- `export function captureScriptTarget`

## src/tasks/run/

### src/tasks/run/attempt-lifecycle.ts

- `interface ReservedTaskAttempt`
- `export function reserveTaskAttempt(taskId: string, requestedStartedAt: Date): ReservedTaskAttempt`
- `export function finishAttempt(startedAt: Date, observedFinishedAt: Date): Date`
- `function safeTaskAttemptErrorCode(failure: unknown): string`
- `export function recordTaskAttemptFailure(input:`

### src/tasks/run/load-task.ts

- `export function activeTaskSources(config: AkmConfig): SearchSource[]`
- `export function resolveBundleAsset`
- `export async function loadPreparedTask(id: string, options: RunTaskOptions): Promise<PreparedTaskV3Execution>`

### src/tasks/run/provenance.ts

- `export function createExecutionProvenanceContext(scheduled: boolean): ExecutionProvenanceContext`
- `export function resolveProvenanceContext`

### src/tasks/run/run-command-task.ts

- `export async function runPreparedCommandTask(input:`
- `function renderPromptLog(input:`

### src/tasks/run/run-native-task.ts

- `export function shellExecutable`
- `export function shellCommand`
- `function withExitCodePropagation(command: string): string`
- `function resolveLeadingBareAkmCommand(command: string, shell: PreparedTaskV3Shell["shell"]): string`
- `function quoteShellArgument(value: string, shell: PreparedTaskV3Shell["shell"]): string`
- `export async function runNativeTask(input:`
- `const forwardTerminationSignal = (signal: NodeJS.Signals): void =>`
- `const onSigterm = ()`
- `const onSigint = ()`

### src/tasks/run/run-task.ts

- `export async function runTask(id: string, options: RunTaskOptions): Promise<TaskRunResult>`

### src/tasks/run/run-workflow-task.ts

- `export async function runWorkflowTask(input:`
- `function mapWorkflowStatus(status: WorkflowRunStatus | undefined): TaskRunStatus`
- `function renderWorkflowLog(input:`

### src/tasks/run/task-history.ts

- `export function appendHistory(result: TaskRunResult, historyReserved = false): void`
- `export interface ReadHistoryOptions`
- `export function readTaskHistory(options: ReadHistoryOptions`
- `function decodeTaskHistoryRows(rows: TaskHistoryRow[]): TaskRunResult[]`
- `function taskHistoryRowToResult(row: TaskHistoryRow): TaskRunResult`

### src/tasks/run/task-log.ts

- `function taskLogPath(logDir: string, taskId: string, startedAtIso: string): string`
- `export function resolveTaskLogPath(logDir: string | undefined, taskId: string, startedAtIso: string): string`
- `export function purgeOldTaskLogFiles(logDir: string | undefined, retentionDays = 90): number`
- `export function purgeOldRunLogFiles(retentionDays = 90): number`
- `export function scrubDbLines`
- `export function streamLines(text: string, stream: TaskLogStream, level: TaskLogLevel): TaskLogLineInput[]`
- `function taskLogSensitiveValues`
- `export function scrubTaskOutput(task: PreparedTaskV3Execution, text: string): string`
- `export function persistRunLog(input:`
- `const scrub = (text: string): string`

### src/tasks/run/task-result.ts

- `export type TaskRunStatus = "completed" | "blocked" | "failed" | "active";`
- `export type TaskAttemptFailureReason`
- `export interface TaskRunResult`
- `export interface RunTaskOptions`
- `export function exitCodeForStatus(status: TaskRunStatus): number`

## src/tasks/source/

### src/tasks/source/bounded-document.ts

- `export interface BoundedDocumentContext`
- `interface CloneState`
- `export function own(value: object, key: string): boolean`
- `export function utf8Bytes(value: string): number`
- `export function sourceError`
- `export function cloneBoundedJson`
- `export function asRecord`
- `export function checkKeys`
- `export function presentJsonValue`
- `export function stringField`
- `export function noGithubExpression`
- `export function parseEnvironment`
- `export function parseStringArray`
- `export function parseTimeout(value: unknown, ctx: BoundedDocumentContext): string | number | null`
- `export function yamlProblem(message: string): string`
- `export interface BoundedTaskSourceYamlInput`
- `export interface BoundedTaskSourceYamlResult`
- `export interface BoundedTaskYamlOptions`
- `export function yamlAstError(options: BoundedTaskYamlOptions, node: unknown, detail: string): never`
- `export function assertBoundedTaskYamlDocument`
- `export function readBoundedTaskSourceYaml`
- `const lineAt = (fieldPath: readonly (string | number)[]): number | undefined =>`

### src/tasks/source/parse-task-source.ts

- `export type ParsedTaskSource = Readonly<{ version: 4; v4: TaskSourceV4Document }>;`
- `export interface ParseTaskSourceInput`
- `export function peekTaskSourceVersion(root: unknown): number | undefined`
- `function legacyVersionError(filePath: string, version: number): UsageError`
- `function unsupportedVersionError(filePath: string, version: number): UsageError`
- `export function v4ScheduleHasRetiredEnabledKey(root: unknown): boolean`
- `export function parseTaskSource(input: ParseTaskSourceInput): ParsedTaskSource`

### src/tasks/source/project-v4.ts

- `function projectAkm(document: TaskSourceV4Document): Readonly<TaskV3AkmOptions> | undefined`
- `export function projectTaskSourceV4(document: TaskSourceV4Document): PreparableTaskDocument`

### src/tasks/source/task-input-diagnostics.ts

- `function invalidTaskInput(name: string, detail: string): UsageError`

### src/tasks/source/task-source-v4.ts

- `export type TaskSourceV4UsesTarget`
- `export type TaskSourceV4Target`
- `export interface TaskSourceV4ScheduleBinding`
- `export interface TaskSourceV4Execution`
- `export interface TaskSourceV4Document`
- `export interface ParseTaskSourceV4DocumentOptions`
- `export interface ParseTaskSourceV4Input extends Omit<ParseTaskSourceV4DocumentOptions, "lineAt">`
- `function ctxFrom(options: ParseTaskSourceV4DocumentOptions): BoundedDocumentContext`
- `function looksLikeGithubActionLocator(value: string): boolean`
- `export function classifyTaskSourceV4Uses(value: string): TaskSourceV4UsesTarget`
- `function nullableSelectorTopLevel(value: unknown, ctx: BoundedDocumentContext, key: string): string | null`
- `function parseTimeoutTopLevel(value: unknown, ctx: BoundedDocumentContext): string | number | null`
- `function parseTarget(input: ExecutionJsonObject, ctx: BoundedDocumentContext): TaskSourceV4Target`
- `function parseExecutionControls(input: ExecutionJsonObject, ctx: BoundedDocumentContext): TaskSourceV4Execution`
- `function stripDeclarationAnnotations(declInput: ExecutionJsonObject):`
- `function parseInputDeclaration(name: string, raw: ExecutionJsonValue, ctx: BoundedDocumentContext): InputDeclaration`
- `function parseInputDeclarations(value: ExecutionJsonValue, ctx: BoundedDocumentContext): InputContract`
- `function parseOutputSchema(value: ExecutionJsonValue, ctx: BoundedDocumentContext): Readonly<Record<string, unknown>>`
- `function targetConsumesOutputSchema(target: TaskSourceV4Target): boolean`
- `function checkScheduleEntryRunnable`
- `function parseScheduleEntry`
- `function parseSchedule`
- `function checkTopLevelKeys(input: ExecutionJsonObject, ctx: BoundedDocumentContext): void`
- `export function parseTaskSourceV4Document`
- `export function parseTaskSourceV4(input: ParseTaskSourceV4Input): TaskSourceV4Document`
