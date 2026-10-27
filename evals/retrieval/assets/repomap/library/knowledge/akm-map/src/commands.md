---
description: "Repo map of akm src/commands at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/commands

## src/commands/

### src/commands/completions.ts

- `type AnyCmd = Record<string, any>;`
- `interface FlagValueRule`
- `function resolveRuleValues(rule: FlagValueRule): string[]`
- `function buildFlagValueCaseBody(rules: FlagValueRule[]): string`
- `interface CommandInfo`
- `function walkCommandTree(cmd: AnyCmd, parentPath = ""): CommandInfo[]`
- `export function generateBashCompletions(cmd: AnyCmd): string`
- `export function installBashCompletions(script: string): string`
- `function resolveInstallPath(): string`
- `function isDir(p: string): boolean`

### src/commands/config-cli.ts

- `export function getConfigValue(config: AkmConfig, key: string): unknown`
- `export function setConfigValue(config: AkmConfig, key: string, rawValue: string): AkmConfig`
- `export function unsetConfigValue(config: AkmConfig, key: string): AkmConfig`
- `export function listConfig(config: AkmConfig): Record<string, unknown>`
- `function redactConfigValue(value: unknown, path: string[] = []): unknown`
- `function isRegistryUrlPath(path: string[]): boolean`
- `export interface ConfigDiffRow`
- `function flattenConfigLeaves(value: unknown, prefix: string[], out: Map<string, unknown>): void`
- `function diffConfigs(local: unknown, other: unknown): ConfigDiffRow[]`
- `export function akmConfigDiff(ref: string):`

### src/commands/feedback-cli.ts

- `function validateFeedbackTags(raw: string[]): string[]`
- `function appendLessonStrength(refInput: AssetRef, feedbackRef: string):`
- `function buildLessonStrengthUpdate(rawBytes: Buffer, feedbackRef: string):`
- `interface RecordFeedbackUsageResult`
- `function recordFeedbackUsage`
- `function judgedTextHash(itemRef: string, filePath: string | undefined): string | undefined`
- `function startLines(text: string, needle: string): number[]`
- `export function applyExactReplacements`
- `function assertFrontmatterStillParses(before: string, after: string, file: string): void`
- `export function assertProposalWritesFile(itemRef: string, root: string, filePath: string): void`
- `type HistoryMark = { supersededBy: string } | { outdated: true };`
- `function resolveSuccessorRef(db: Database, input: string, itemRef: string): string`
- `function frontmatterMapping(text: string): Record<string, unknown> | undefined`
- `function historyMarkChanges`
- `function topLevelKeyLine(lines: string[], key: string): number`
- `function setBeliefState(text: string, state: string): string`
- `function setSupersededBy(text: string, list: string[], ref: string): string`
- `` const item = (value: string) => `- $ ``
- `export function applyHistoryMark(raw: string, mark: HistoryMark, file: string): string`

### src/commands/health.ts

- `export interface AkmHealthOptions`
- `export function parseHealthSince(since?: string): string`
- `function validateAkmHealthOptions(options: AkmHealthOptions): void`
- `export function probeStateDbRoundTrip(stateDbPath: string):`
- `interface TaskHistoryPhase`
- `function dedupeStuckActiveTasks`
- `function computeWorstTaskFailRate`
- `function gatherTaskHistoryPhase`
- `function gatherEgressConfigView(): EgressConfigView | undefined`
- `function gatherSemanticSearchMode(): string | undefined`
- `function gatherSessionExtractionLedgerPhase`
- `function gatherAncillaryAdvisories`
- `function detectTypeDirectoryDisagreements(stashRoot: string): HealthCheckResult | undefined`
- `function detectIndexStateGenerationMismatch(stateDb: Database): HealthCheckResult | undefined`
- `interface WindowComparePhaseResult`
- `function resolveWindowComparePhase`
- `function degradedStateDbReport(hardCheck: HealthCheckResult, options: AkmHealthOptions): AkmHealthResult`
- `function unreadableStateDbCheck(detail: string): HealthCheckResult`
- `function readOnlyStateDbUnavailable(stateDbPath: string): HealthCheckResult | undefined`
- `export async function akmHealth(options: AkmHealthOptions`

### src/commands/log.ts

- `export interface EventsListOptions`
- `function parseSinceFlag(since: string | undefined):`
- `export interface EventsListResult`
- `function validateRef(ref: string | undefined): string | undefined`
- `function validateRunId(run: string | undefined): string | undefined`
- `export function akmEventsList(options: EventsListOptions`

### src/commands/migrate-cli.ts

- `export type RunMigrationTool = typeof runMigrationTool;`
- `export async function runMigrateSubcommand`

### src/commands/migration-tool.ts

- `function migrationEntryPoint(): string | undefined`
- `export interface MigrationToolResult`
- `export async function runMigrationTool(args: readonly string[]): Promise<MigrationToolResult>`

### src/commands/models-cli.ts

- `function targetConnection(config: AkmConfig, name: string | undefined):`
- `async function availableModels(name: string, connection: ConnectionConfig, probe: boolean): Promise<string[]>`
- `const probes = (args: object): boolean => (args as`

### src/commands/observability-cli.ts

- `function rejectExtraLogPositionals(positionals: unknown): void`

### src/commands/registry-cli.ts

### src/commands/remember.ts

- `export interface MemoryFrontmatterFields`
- `export function parseDuration(s: string): number`
- `export function buildMemoryFrontmatter(fields: MemoryFrontmatterFields): string`
- `export function readMemoryContent(contentArg: string | undefined): string`
- `function splitIntoSentences(text: string): string[]`
- `export function synthesizeMemoryDescription(body: string, capChars = DESCRIPTION_MAX_CHARS): string`
- `export interface HeuristicResult`
- `export function runAutoHeuristics(body: string): HeuristicResult`
- `function detectObservedAt(body: string): string | undefined`
- `export interface EnrichmentResult`
- `export function parseEnrichObserved(parsed: Record<string, unknown>): string | undefined`
- `export async function runLlmEnrich(body: string): Promise<EnrichmentResult>`

### src/commands/targets.ts

- `export type KeyState = "env-set" | "env-unset" | "credentials" | "none";`
- `export interface ConnectionRow`
- `export interface HarnessRow`
- `export interface ProcessOverride`
- `export type ProcessName`
- `export interface ProcessRow`
- `export type TargetRow = ConnectionRow | HarnessRow | ProcessRow;`
- `export interface TargetsInput`
- `function keyState(connection: ConnectionConfig, name: string, env: NodeJS.ProcessEnv): KeyState`
- `function connectionRows(input: TargetsInput): ConnectionRow[]`
- `function harnessBin(config: AkmConfig, name: string, harness: HarnessConfig): string`
- `function harnessRows(input: TargetsInput): HarnessRow[]`
- `type Resolution = { readonly runner?: RunnerSpec; readonly problem?: string };`
- `function attempt(resolve: () => RunnerSpec | null | undefined): Resolution`
- `const sameTarget = (a: Resolution, b: Resolution): boolean`
- `function runnerRow`
- `function embeddingRow(config: AkmConfig, ambiguous: string | undefined): ProcessRow`
- `function rerankRow(config: AkmConfig): ProcessRow`
- `function processRows(config: AkmConfig): ProcessRow[]`
- `const improve = (processName: string, alias: keyof typeof SHIPPED_ALIAS, rest: object`
- `export function targetRows(input: TargetsInput): TargetRow[]`

### src/commands/url-checker.ts

- `export interface DeadUrlCheckResult`
- `interface CheckOutcome`
- `export async function checkDeadUrls`

### src/commands/workflow-cli.ts

- `const interrupt = (signal: "SIGINT" | "SIGTERM") =>`
- `const onSigint = ()`
- `const onSigterm = ()`
- `const skip = (reason: "lock-held" | "state-db-contended", message: string) =>`
- `export function parseWorkflowParameterFlags(rawArgs: readonly string[], target: string): WorkflowParameterFlag[]`
- `function parseIntegerFlag`
- `function parseWorkflowTimeout(raw: string | undefined): number | undefined`

## src/commands/agent/

### src/commands/agent/agent-dispatch.ts

- `export interface AkmAgentDispatchOptions`
- `export interface AkmAgentDispatchSeams`
- `export interface AkmAgentDispatchResult`
- `function canonicalCurrent(options: AkmAgentDispatchOptions): UnresolvedExecutionDefaults`
- `function rejectInvalidAgentRef(agentRef: string | undefined): void`
- `async function delegateCanonicalCommand`
- `export async function akmAgentDispatch`

### src/commands/agent/agent-support.ts

- `export function baseFailureFields`
- `export function isEnoentFailure(result: Pick<AgentRunResult, "reason" | "error">): boolean`
- `export function enoentHintMessage(binName: string): string`

### src/commands/agent/contribute-cli.ts

- `export function readPromptStdin(read: () => string = () => fs.readFileSync(0, "utf8")): string`

## src/commands/command/

### src/commands/command/builtin-action.ts

- `export type ParsedBuiltinCommandAction`
- `export function parseBuiltinCommandAction(value: unknown): ParsedBuiltinCommandAction`

### src/commands/command/command-cli.ts

- `function exactStringArg(args: unknown, key: string): string | undefined`

### src/commands/command/command-execution.ts

- `export type CommandExecutionSourceLoader =`
- `export interface PrepareCommandInvocationOptions`
- `export type PreparedCommandInvocation = ResolvedExecution;`
- `export interface CommandDispatchResult`
- `export interface CommandDiagnosticProvenance`
- `export interface CommandDiagnosticNotice`
- `export interface CommandDryRunResult`
- `export interface DispatchPreparedCommandOptions`
- `function runOptionsFor(options: DispatchPreparedCommandOptions): RunExecutionOptions`
- `function own(value: object, key: PropertyKey): boolean`
- `function selectAgent`
- `function defaultSourceLoader`
- `function qualifyCommandSelectedPersona(selector: string, command: AdapterRenderedCommandSource | undefined): string`
- `export async function prepareCommandInvocation`
- `function compareText(left: string, right: string): number`
- `function canonicalDiagnosticProvenanceField(field: string): string | undefined`
- `function canonicalDiagnosticNoticeField(field: string | null | undefined): string | undefined`
- `function diagnosticProvenance`
- `function safeDiagnosticToken(value: string): boolean`
- `function safeDiagnosticNotice(notice: Readonly<LoweringNotice>): Readonly<CommandDiagnosticNotice> | undefined`
- `function diagnosticNotices(notices: readonly Readonly<LoweringNotice>[]): readonly Readonly<CommandDiagnosticNotice>[]`
- `export function inspectPreparedCommandInvocation(prepared: PreparedCommandInvocation): CommandDryRunResult`
- `function resultEnvelope`
- `export async function dispatchPreparedCommandInvocation`
- `export async function executeCommandInvocation`

### src/commands/command/execution-source-loader.ts

- `export type ExecutionSourceLookup = (ref: BundleRef) => Promise<IndexEntry | null>;`
- `export interface LoadAdapterExecutionSourceOptions`
- `async function defaultLookup(ref: BundleRef): Promise<IndexEntry | null>`
- `async function effectiveConfig(config: AkmConfig | undefined): Promise<AkmConfig>`
- `function realDirectory(value: string, label: string): string`
- `function realRegularFile(value: string, label: string): string`
- `function isLexicallyWithin(candidate: string, root: string): boolean`
- `function implicitComponentForEntry(entry: IndexEntry, config: AkmConfig): BundleComponent | undefined`
- `function componentForEntry(entry: IndexEntry, config: AkmConfig, realRoot: string): BundleComponent`
- `function expectedIndexedType(kind: "command" | "persona"): string`
- `function assertRenderedIdentity(source: AdapterRenderedExecutionSource, entry: IndexEntry, content: string): void`
- `export async function loadAdapterExecutionSource`
- `export async function loadAdapterExecutionSource`
- `export async function loadAdapterExecutionSource`

### src/commands/command/portable-template.ts

- `export interface AppliedPortableCommandArguments`
- `export function validatePortableCommandTemplate(template: string, source: string): void`
- `export function applyPortableCommandArguments`

## src/commands/env/

### src/commands/env/child-env.ts

- `export interface ChildEnvOptions`
- `export function buildChildEnv`

### src/commands/env/env-binding.ts

- `export interface ResolvedEnvBinding`
- `export function resolveRefToken`
- `export interface ResolveEnvBindingOptions`
- `export function resolveEnvBinding(target: string, options: ResolveEnvBindingOptions`

### src/commands/env/env-cli.ts

- `async function runEnvInjected`
- `function parseKeyListFlag(raw: string | undefined): string[] | undefined`

### src/commands/env/env.ts

- `export function listKeys(envPath: string):`
- `export function loadEnv(envPath: string): Record<string, string>`
- `export function buildShellExportScript(envPath: string): string`
- `export function createEnv(envPath: string): void`
- `export function writeEnv(envPath: string, content: string): void`
- `export function removeEnv(envPath: string): boolean`
- `function ensureParentDir(filePath: string): void`

### src/commands/env/secret-cli.ts

- `function parseKeyListFlag(raw: string | undefined): string[] | undefined`
- `function listSecretsRecursive(): Array<`
- `const walk = (dir: string): void =>`

### src/commands/env/secret.ts

- `export function withSecretLock<T>(secretPath: string, fn: () => T): T`
- `export function secretLockPath(secretPath: string, platform = process.platform): string`
- `function ensureParentDir(filePath: string): void`
- `export function setSecret(secretPath: string, value: Buffer): void`

## src/commands/health/

### src/commands/health/accept-rate.ts

- `export interface AcceptRateEntry`
- `export function computeAcceptRateBySource(stashDir?: string, ctx?: ProposalsContext): AcceptRateEntry[]`
- `const countProposals = (statuses: Array<"pending" | "accepted" | "rejected">, includeArchive: boolean) =>`

### src/commands/health/archive-usage.ts

- `export function collectArchiveUsageAdvisory(stashDir: string): HealthCheckResult | undefined`

### src/commands/health/checks.ts

- `export interface HealthCheckContext`
- `export type HealthCheckChannel = "hard" | "advisory";`
- `export interface HealthCheck`
- `export interface PendingStateMigrationsCheckDependencies`
- `export function runPendingStateMigrationsCheck`
- `export function appliedStateMigrationsCheck`
- `export function dominantAgentFailureReason`
- `const reasonFor = (row: (typeof rows)[number])`

### src/commands/health/config-skew.ts

- `export function collectConfigSkewAdvisory(configPath: string): HealthCheckResult | undefined`

### src/commands/health/connections-and-harnesses-check.ts

- `export interface ReachabilityResult`
- `export type ReachabilityProbe = (connection: Pick<ChatCompletionConfig, "endpoint">) => Promise<ReachabilityResult>;`
- `export interface ConnectionsAndHarnessesCheckDependencies`
- `async function probeConnections(config: AkmConfig, probe: ReachabilityProbe): Promise<Map<string, ReachabilityResult>>`
- `function harnessVersions(config: AkmConfig, which: WhichFn, spawn: typeof spawnSync): Map<string, string | undefined>`
- `function problems(rows: readonly TargetRow[], ambiguous: string | undefined): string[]`
- `export function connectionsAndHarnessesCheck`
- `export async function runConnectionsAndHarnessesCheck`

### src/commands/health/data-dir-usage.ts

- `function liveDbBytesFor(name: string, sizes: ReadonlyMap<string,`
- `export interface WalkResult`
- `export function sizeOfPath`
- `function formatBytes(bytes: number): string`
- `interface DataDirSubdirUsage`
- `export function collectDataDirUsageAdvisory(dataDir: string): HealthCheckResult | undefined`

### src/commands/health/egress.ts

- `export interface EgressConfigView`
- `export function collectEgressAdvisory(config: EgressConfigView | undefined): HealthCheckResult | undefined`

### src/commands/health/html-report.ts

- `function trendClass(direction: TrendDirection): string`
- `function trendLabel(direction: TrendDirection): string`
- `function deltaPill(deltas: HealthReportViewModel["deltas"], key: string, lowerIsBetter = false): string`
- `type Priority = "P1" | "P2" | "P3";`
- `interface ActionItem`
- `function actionItemCard(item: ActionItem): string`
- `function passCard(title: string, desc: string): string`
- `export function buildEchartsTag(): string`
- `function buildSliceOptions(vm: HealthReportViewModel): string`
- `function renderSinceHuman(vm: HealthReportViewModel): string`
- `function renderStatusBadgeHtml(vm: HealthReportViewModel): string`
- `function renderExecSummary(vm: HealthReportViewModel): string`
- `` const li = (k: string, vHtml: string) => `<li><span class="k">$ ``
- `const trendLi = (k: string, d: TrendDirection)`
- `function renderKpiCards(vm: HealthReportViewModel): string`
- `const kpiCard = (color: string, label: string, value: string, sub: string, valueStyle = "")`
- `function renderSummaryRowsHtml(vm: HealthReportViewModel): string`
- `function renderActionItems(vm: HealthReportViewModel): string`
- `const pushItem = (item: ActionItem) =>`
- `function renderProposalRowsHtml(vm: HealthReportViewModel): string`
- `export function buildHealthHtmlReplacements`

### src/commands/health/improve-metrics.ts

- `export function roundRate(value: number): number`
- `export function taskFailureDetail(row: TaskHistoryRow): Record<string, unknown> | undefined`
- `export function isAgentTaskHistoryRow(row: TaskHistoryRow): boolean`
- `export function countAgentFailureReasons(agentFailures: readonly TaskHistoryRow[]): Record<string, number>`
- `function decodeImproveResultRow`
- `export function emptyImproveMetrics(): ImproveHealthMetrics`
- `function toFiniteNumber(value: unknown): number`
- `function applyAction(metrics: ImproveHealthMetrics, action: Record<string, unknown>): void`
- `function projectRunMetrics(result: Record<string, unknown>): ImproveHealthMetrics`
- `function finalizeImproveMetrics(metrics: ImproveHealthMetrics): void`
- `function mergeImproveMetrics(dst: ImproveHealthMetrics, src: ImproveHealthMetrics): void`
- `function compareImproveRunRecency(a: ImproveRunSummaryRow, b: ImproveRunSummaryRow): number`
- `export function summarizeImproveRuns`
- `export function projectImproveRunSummary`
- `export function computeWallTimeStats(durationsMs: number[]): ImproveHealthMetrics["wallTime"]`
- `const pick = (q: number)`
- `export function buildImproveSkipSummary(events: ReturnType<typeof readEvents>["events"]):`
- `export function computeWindowProposalCoverage`

### src/commands/health/llm-usage.ts

- `function emptyLlmUsageStageAggregate(): LlmUsageStageAggregate`
- `export function emptyLlmUsageAggregate(): LlmUsageAggregate`
- `export function summarizeLlmUsage(events: ReturnType<typeof readEvents>["events"]): LlmUsageAggregate`
- `export function readLlmUsageAggregate`
- `export function summarizeLlmUsageRecordsCrossTab(records: Iterable<LlmUsageRecord>): LlmUsageCrossTabRow[]`
- `export function summarizeLlmUsageCrossTab(events: ReturnType<typeof readEvents>["events"]): LlmUsageCrossTabRow[]`

### src/commands/health/md-report.ts

- `function padRight(s: string, width: number): string`
- `function renderTable(headers: string[], rows: string[][]): string`
- `export function renderRunsDetailMd(runs: ImproveRunSummary[]): string`
- `export function renderWindowCompareMd(windows: WindowResult[], deltas: Record<string, DeltaEntry> | undefined): string`

### src/commands/health/plugin-staleness.ts

- `function claudePluginsDir(): string`
- `function defaultOpencodeCacheRoot(): string`
- `interface BundledAkm`
- `interface OpencodePluginLocation`
- `function findBundledAkm(plugin: OpencodePluginLocation, cacheRoot: string): BundledAkm[]`
- `function buildOpencodeBundledAdvisory`
- `interface DetectedPlugin`
- `function detectInstalledPlugins(pluginsRoot: string): DetectedPlugin[]`
- `function readVersionRange(pluginDir: string): string | undefined`
- `export type ListRemoteTagsFn = (marketplaceDir: string) => string[] | undefined;`
- `const realListRemoteTags: ListRemoteTagsFn = (marketplaceDir) =>`
- `export interface PluginStalenessOptions`
- `export function collectPluginStalenessAdvisories(options: PluginStalenessOptions): HealthCheckResult[]`
- `function buildAdvisory`

### src/commands/health/renderers.ts

- `function isHealthResult(value: unknown): value is AkmHealthResult`
- `export function renderHealthHtml(result: unknown): string | null`

### src/commands/health/report-view-model.ts

- `export interface PendingProposalLike`
- `export interface HealthHtmlReportOptions`
- `export function num(value: number): string`
- `export function compact(value: number): string`
- `export function humanize(raw: string): string`
- `export function fmtMs(ms: number): string`
- `export function pct(rate: number, digits: number): string`
- `export type TrendDirection = "up" | "down" | "flat";`
- `function coercePct(raw: number | string | undefined): number | undefined`
- `export interface ReportRun`
- `function reshapeRun(r: ImproveRunSummary): ReportRun`
- `function compareRuns(a: ReportRun, b: ReportRun): number`
- `function classify(deltas: Record<string, DeltaEntry>, metricKeys: string[], lowerIsBetter = false): TrendDirection`
- `export interface TrendBlock`
- `function buildTrend(deltas: Record<string, DeltaEntry>): TrendBlock`
- `export interface SemSearchStatus`
- `function readSemSearch(hardChecks: HealthCheckResult[]): SemSearchStatus`
- `export function windowToMs(window: string): number`
- `function computeSliceCandidates(window: string): Array<[number, string]>`
- `export type SummaryRow = [label: string, value: string, trend: TrendDirection, tooltip?: string];`
- `export interface HealthReportViewModel`
- `interface RunsPhase`
- `function partitionRuns(result: AkmHealthResult): RunsPhase`
- `type AggregatesPhase = Pick<`
- `function buildAggregatesPhase(result: AkmHealthResult, runsPhase: RunsPhase): AggregatesPhase`
- `type MetaPhase = Pick<`
- `function buildMetaPhase(result: AkmHealthResult, runs: ReportRun[]): MetaPhase`
- `type VerdictPhase = Pick<`
- `function buildVerdictPhase`
- `function computeDistillReasons(runs: ReportRun[]): string[]`
- `function groupProposalsBySource(proposals: PendingProposalLike[]): Array<[string, number]>`
- `function buildSummaryRows(aggregates: AggregatesPhase, trend: TrendBlock): SummaryRow[]`
- `export function buildHealthReportViewModel`

### src/commands/health/scheduler-binary.ts

- `export interface SchedulerBinaryDriftDependencies`
- `export async function collectSchedulerBinaryAdvisory`

### src/commands/health/semantic-search-check.ts

- `export interface SemanticSearchState`
- `export function readSemanticSearchState(mode: string | undefined): SemanticSearchState`
- `export function semanticSearchCheck(state: SemanticSearchState): HealthCheckResult`
- `const result =`

### src/commands/health/stash-exposure.ts

- `export type GitRunner = (stashDir: string, args: string[]) => { ok: boolean; stdout: string };`
- `const realGit: GitRunner = (stashDir, args) =>`
- `export function collectStashExposureAdvisory`

### src/commands/health/task-runs.ts

- `interface ImproveTaskRun`
- `function loadImproveTaskRuns(db: Database, since: string, until?: string): ImproveTaskRun[]`
- `export function matchImproveTaskId(startedAt: string, completedAt: string, taskRuns: ImproveTaskRun[]): string`
- `export function buildPerRunSummaries(db: Database, since: string, until?: string): ImproveRunSummary[]`

### src/commands/health/type-directory-check.ts

- `export interface TypeDirectoryEntry`
- `export interface TypeDirectoryDisagreement`
- `export type ReadFileFn = (absPath: string) => string | undefined;`
- `const realReadFile: ReadFileFn = (absPath) =>`
- `function declaredTypeForPath(absPath: string):`
- `function explainOverride`
- `export function collectTypeDirectoryDisagreements`
- `export function buildTypeDirectoryAdvisory`

### src/commands/health/types-checks.ts

- `export interface HealthCheckResult`

### src/commands/health/types-improve.ts

- `export interface ImproveResultRowAccounting`
- `export interface ImproveHealthMetrics`

### src/commands/health/types-metrics.ts

- `export interface HealthMetrics`
- `export interface LlmUsageAggregate`
- `export interface LlmUsageStageAggregate`
- `export interface LlmUsageCrossTabRow extends LlmUsageStageAggregate`

### src/commands/health/types-result.ts

- `export interface HealthReportContext`
- `export interface AkmHealthResult`

### src/commands/health/types-runs.ts

- `export interface ImproveRunSummary`

### src/commands/health/types-windows.ts

- `export interface WindowSpec`
- `export interface WindowResult`
- `export interface DeltaEntry`

### src/commands/health/types.ts

### src/commands/health/version-drift.ts

- `export interface VersionDriftDependencies`
- `export async function collectVersionDriftAdvisory`

### src/commands/health/windows.ts

- `export function resolveWindowCompare(duration: string, now: () => number = () => Date.now()): WindowSpec[]`
- `export function parseWindowSpec(raw: string): WindowSpec`
- `export function readNumericPath(obj: unknown, path: string): number`
- `export function computeDeltas(first: WindowResult, last: WindowResult): Record<string, DeltaEntry>`
- `interface WindowMetricsBundle`
- `export interface TaskWindowRates`
- `export function computeTaskWindowRates(taskRows: readonly TaskHistoryRow[], now: () => number): TaskWindowRates`
- `export interface ImproveWindowSummary`
- `export function buildImproveWindowSummary`
- `const eventsBeforeUntil = (type: string)`
- `export function buildWindowMetrics`

## src/commands/improve/

### src/commands/improve/autonomy-gate.ts

- `export type AutonomyLane = (typeof AUTONOMY_LANES)[number];`
- `export interface GatedLane`
- `function gatedLane(lane: AutonomyLane): GatedLane`
- `export function describeGatedLanes(lanes: readonly AutonomyLane[]): GatedLane[]`
- `export function configuredDirectAutonomyLanes(): AutonomyLane[]`
- `export function isAutonomyLaneAllowed(_lane: AutonomyLane, config: ExperimentalConfigHolder | undefined): boolean`
- `export function applyAutonomyGate`

### src/commands/improve/consolidate.ts

- `export interface MemoryEntry`
- `export interface ConsolidatePromoteOp`
- `interface RawChunkPlan`
- `function parsePlan(raw: string)`
- `export function isValidOp(op: unknown): op is ConsolidatePromoteOp`
- `export function mergePlans(chunks: ConsolidatePromoteOp[][]): ConsolidatePromoteOp[]`
- `export function isConsolidationEligibleMemoryName(name: string): boolean`
- `export interface AkmConsolidateOptions`
- `interface ClusterEmbedTelemetry`
- `async function clusterMemoriesBySimilarity`
- `function loadPendingConsolidateProposalHashes(stashDir: string, proposalsCtx?: ProposalsContext): Set<string>`
- `function loadRejectedPromotionBodyHashes(stashDir: string, proposalsCtx?: ProposalsContext): Set<string>`
- `export function loadExistingKnowledgeBodyHashes(targetRoot: string): Set<string>`
- `const visit = (dir: string): void =>`
- `function canonicalXref(ref: string): string`
- `export function makeConsolidateResult`
- `function resolveConsolidationWriteTarget(opts: AkmConsolidateOptions, config: AkmConfig): ResolvedWriteTarget`
- `export async function akmConsolidate(opts: AkmConsolidateOptions`
- `type SkipEntry = { ref: string; skips: Array<{ op: ConsolidateOpKind | "unknown"; reason: string }> };`
- `interface ConsolidateAccounting`
- `function pushSkipReason(acc: ConsolidateAccounting, op: ConsolidateOpKind | "unknown", ref: string, reason: string)`
- `export interface ConsolidationPoolSnapshot`
- `interface ConsolidationSourceOwner`
- `function resolveConsolidationSourceOwner`
- `const mtimeMsOf = (memory: MemoryEntry): number =>`
- `export function inspectConsolidationPool`
- `async function judgeConsolidationChunks(args:`
- `const memRef = (m: MemoryEntry)`
- `const failChunk = (message: string, chunk: MemoryEntry[]) =>`
- `const skipRemaining = (from: number) =>`
- `async function planConsolidation`
- `const slice = (list: MemoryEntry[])`
- `async function consolidate`
- `` const plural = (n: number) => `memor$ ``
- `const summary = () =>`
- `export interface PromoteContext`
- `function bodyHashOf(memory: MemoryEntry | undefined):`
- `function conceptIdForRef(ref: string): string | undefined`
- `function normalizeSlugForDedup(ref: string): string`
- `export async function emitPromotionProposal(op: ConsolidatePromoteOp, ctx: PromoteContext): Promise<void>`
- `const skip = (reason: string, message: string): void =>`
- `function loadMemoriesForSource`

### src/commands/improve/content-hash.ts

- `export function stripFrontmatterBody(raw: string): string`
- `export function contentHash(content: string | Uint8Array, mode: "raw" | "body" | "normalized" = "raw"): string`

### src/commands/improve/distill-guards.ts

- `export interface ClsConfig`
- `export function buildClsContext(adjacentItems: Array<`

### src/commands/improve/distill-promotion-policy.ts

- `export interface PromotionFeedbackEvent`
- `export interface PromotionPolicyInput`
- `export interface MemoryPromotionAssessment`
- `interface PromotionFeatures`
- `interface PromotionModelConfig`
- `function hasNonEmptyList(value: unknown): boolean`
- `function hasConflictMarkers(metadata: Record<string, unknown>): boolean`
- `function hasTentativeLanguage(text: string): boolean`
- `function scoreConfidence(confidence: unknown): number`
- `function deriveDescription(body: string, description: string | undefined): string | undefined`
- `export function deriveKnowledgeRef(inputRef: string): string`
- `function collectPromotionFeatures(input: PromotionPolicyInput):`
- `function buildKnowledgeContent(input: PromotionPolicyInput): string`
- `function assessWithWeightedModel`
- `export function assessMemoryKnowledgePromotionCandidate(input: PromotionPolicyInput): MemoryPromotionAssessment`

### src/commands/improve/distill.ts

- `export function isDistillRefusedInputType(type: string): boolean`
- `export interface AkmDistillOptions`
- `interface RelatedAsset`
- `export function deriveLessonRef(inputRef: string): string`
- `const clean = (value: string): string`
- `interface StructuredDistillPayload`
- `export function assembleStructuredDistillMarkdown`
- `const text = (value: unknown): string`
- `const list = (value: unknown): string[]`
- `function answeredNone(raw: string):`
- `function validateKnowledgeContent(content: string, inputRef: string): DistillValidationFinding[]`
- `interface BuildPromptInput`
- `export function buildDistillPrompt(input: BuildPromptInput): string`
- `const flat = (event: BuildPromptInput["feedback"][number]): string`
- `type DistillKind = "lesson" | "knowledge";`
- `interface DistillRun`
- `function emitDistill(run: Pick<DistillRun, "ledgerRef" | "eligMeta" | "options">, meta: Record<string, unknown>): void`
- `function skipDistill`
- `function exclusionMeta(run: DistillRun, forResult: boolean): Record<string, unknown>`
- `export async function akmDistill(options: AkmDistillOptions): Promise<AkmDistillResult>`
- `async function distill`
- `function feedbackLines(feedback: BuildPromptInput["feedback"]): string[]`
- `function lessonExists(run: DistillRun, ref: string): boolean`
- `function assembleDistilledContent`
- `function qualityGateEnabled(run: DistillRun): boolean`
- `async function judgeAndQueue`
- `async function proposeLessonUpdate`
- `function rejectDistilled`
- `export function writeQualityRejection(args:`
- `interface PromotionPlan`
- `async function planPromotion`
- `async function promoteToKnowledge(run: DistillRun, plan: PromotionPlan): Promise<AkmDistillResult>`
- `async function loadInput`
- `function loadRefVocabulary(): Set<string>`
- `function stampInputSalience(run: DistillRun): void`
- `function persistOutputEncodingSalience(run: DistillRun, ref: string, body: string): void`
- `function readDistillFeedback(run: DistillRun): ReturnType<typeof readEvents>["events"]`
- `async function buildDistillMessages`
- `async function defaultLookup(ref: string, stashDir: string): Promise<string | null>`
- `async function fetchRelatedAssets(query: string, n: number): Promise<RelatedAsset[]>`

### src/commands/improve/eligibility.ts

- `type Scope = { mode: "all" | "type" | "ref"; value?: string };`
- `export function assetTypeOf(ref: string): string`
- `export function withIndexDb<T>(readOnly: boolean, fn: (db: Database) => T): T | undefined`
- `function openEligibilityDb(readOnly: boolean): Database | undefined`
- `function unreadableSnapshot(readOnly: boolean, error: unknown): ImproveIndexSnapshot | undefined`
- `export function resolveImproveScope(scope: string | undefined): Scope`
- `export function dedupeRefs(refs: ImproveEligibleRef[]): ImproveEligibleRef[]`
- `type EligibleRefs =`
- `function runBundleIdOf`
- `export async function collectEligibleRefs`
- `export async function collectEligibleRefsReadOnly`
- `async function collectEligibleRefsFromIndex`
- `const empty = (indexSnapshot?: ImproveIndexSnapshot): EligibleRefs =>`
- `const isCandidateBundle = (bundleId: string | undefined): boolean`
- `function warnUnmatchedTypeScope(value: string, indexed: ReturnType<typeof getAllEntries>): void`
- `export function memoryCleanupParentRef(scope: Scope, stashDir?: string): string | undefined`
- `export function isLessonCandidate(ref: string): boolean`
- `export function isDistillCandidateRef(ref: string, stashDir?: string): boolean`
- `export function shouldDistillMemoryRef(ref: string, stashDir?: string): boolean`
- `export function shouldAnalyzeMemoryCleanup`
- `export function buildUtilityMap(refs: ImproveEligibleRef[], readOnly = false): Map<string, number>`
- `export async function findAssetFilePath`

### src/commands/improve/encoding-salience.ts

- `export interface EncodingSalienceInputs`
- `export interface EncodingSalienceResult`
- `function tokenizeBody(text: string): string[]`
- `function tokenizeRef(ref: string): string[]`
- `function bigrams(tokens: string[]): string[]`
- `export function buildRefVocabulary(refs: string[]): Set<string>`
- `function computeNovelty(body: string, type: string, vocab: Set<string>): number`
- `function computeMagnitude(body: string): number`
- `function computePredictionError(revisionCount: number): number`
- `export function scoreEncodingSalience(inputs: EncodingSalienceInputs): EncodingSalienceResult`

### src/commands/improve/execution.ts

- `type ImproveExecutionLayer = ConfiguredExecutionSettings;`
- `export interface ResolveImproveExecutionOptions`
- `export interface ResolvedImproveExecution`
- `export function resolveImproveExecution(options: ResolveImproveExecutionOptions): ResolvedImproveExecution | null`

### src/commands/improve/extract-cli.ts

### src/commands/improve/extract-prompt.ts

- `export interface ExtractPromptInput`
- `function formatAlreadyPreserved(inlineRefs: InlineRefMention[]): string`
- `export function fenceTranscript(text: string): string`
- `function formatTranscript(events: SessionEvent[]): string`
- `export function buildExtractPrompt(input: ExtractPromptInput): string`
- `export interface ExtractCandidate`
- `export interface ExtractPayload`
- `function failedExtractPayload`
- `function parseFirstJsonObject(stdout: string):`
- `function readCandidate(c: Record<string, unknown>):`
- `export function parseExtractPayload(stdout: string): ExtractPayload`

### src/commands/improve/extract.ts

- `function resolveDefaultSinceMs`
- `function extractSessionLockPath(harness: string, sessionId: string, stateDbPath: string): string`
- `function extractSessionLockIsUnavailable(harness: string, sessionId: string, stateDbPath: string): boolean`
- `function acquireExtractSessionLock(lockPath: string):`
- `export interface AkmExtractOptions`
- `export interface ResolvedExtractPlan`
- `export function resolveStandaloneExtractPlan`
- `type ExtractSessionOutcome = Omit<ExtractedSessionResult, "engine">;`
- `type PreFilterStats = ExtractedSessionResult["preFilter"];`
- `function sessionOutcome`
- `function preFilterStats(filtered: ReturnType<typeof preFilterSession>): PreFilterStats`
- `function emptyExtractResult(args:`
- `export function parseSinceArg(value: string | undefined, now: number = Date.now()): number`
- `function buildCandidateProposal`
- `function canonicalSegment(value: string): string`
- `export function deriveExtractCandidateRef(candidate: ExtractCandidate, sourceRef: SessionSummary): string`
- `function resolveExtractStandards(stashDir: string): string`
- `export function hashSessionContent(data: SessionData): string`
- `function sessionTriagePasses(data: SessionData, minScore: number): boolean`
- `const count = (predicate: (e: SessionData["events"][number])`
- `type Triage = { enabled: boolean; minScore: number };`
- `interface SessionGateOptions`
- `async function runPreLlmSessionGates`
- `type ExtractEligibleGate = Exclude<Awaited<ReturnType<typeof runPreLlmSessionGates>>, { skip: ExtractSessionOutcome }>;`
- `type ExtractSessionPlan`
- `function lockedConcurrentResult(harness: string, summary: SessionSummary): ExtractSessionOutcome`
- `async function planExtractSessions(args:`
- `const lockUnavailable = (summary: SessionSummary)`
- `interface ExtractRun`
- `type SessionExtraction`
- `async function extractFromSession(run: ExtractRun, prompt: string): Promise<SessionExtraction>`
- `async function maybeWriteSessionAsset`
- `async function processSession`
- `function persistedExtractOutcome(result: ExtractSessionOutcome): ExtractedSessionRow["outcome"]`
- `interface ExtractLoopTally`
- `async function runExtractSessionLoop`
- `const account = (result: ExtractSessionOutcome): ExtractedSessionResult =>`
- `const accountAndRecord = (summary: SessionSummary, result: ExtractSessionOutcome): void =>`
- `const refillModelSlot = async (): Promise<void> =>`
- `function recordSessionOutcome`
- `function resolveExtractRun`
- `const generate: SessionSummaryGenerator = async (data) =>`
- `async function discoverExtractCandidates`
- `function loadSeenMapReadOnly`
- `export async function akmExtract(options: AkmExtractOptions): Promise<AkmExtractResult>`
- `export interface CountNewExtractCandidatesOptions`
- `export async function countNewExtractCandidates`

### src/commands/improve/feedback-valence.ts

- `export interface FeedbackCounts`
- `export interface ValenceScore`
- `export function computeValenceScore(counts: FeedbackCounts): ValenceScore`

### src/commands/improve/improve-cli.ts

- `export function _setAkmImproveForTests(fake?: typeof akmImprove): void`
- `async function runShowPromptCli`
- `const persistTerminated = (reason: TerminationReason, errorMessage?: string): void =>`

### src/commands/improve/improve-report.ts

- `export interface ImproveReportUsage`
- `export interface ImproveReportResult`
- `function crossTabFromEvents`
- `interface ReportableRunRow`
- `function usageReportForRow`
- `function mergeCrossTabRow(merged: Map<string, LlmUsageCrossTabRow>, row: LlmUsageCrossTabRow): void`
- `export function runImproveReportQuery(options:`

### src/commands/improve/improve-result-file.ts

- `export function buildImproveRunId(now: Date = new Date()): string`
- `export function recordImproveRunResult`
- `export type TerminationReason = "SIGTERM" | "SIGINT" | "SIGHUP" | "exception" | string;`
- `export function recordTerminatedImproveRun`

### src/commands/improve/improve-run-types.ts

- `export type ImproveScope = ReturnType<typeof resolveImproveScope>;`
- `type ReflectFn = (options: NonNullable<Parameters<typeof akmReflect>[0]>) => Promise<AkmReflectResult>;`
- `type DistillFn = (options: NonNullable<Parameters<typeof akmDistill>[0]>) => Promise<AkmDistillResult>;`
- `export interface AkmImproveOptions`
- `export interface ImprovePreparationResult`
- `export interface ImproveLoopResult`
- `export interface ImprovePostLoopResult`
- `export interface ImproveMaintenanceResult`
- `export interface ConsolidationPassResult`
- `export interface ImproveLoopState`

### src/commands/improve/improve-session.ts

- `export interface SignalSource`
- `export interface RunImproveSessionOptions<T>`
- `export interface RunImproveSessionDeps`
- `export async function runImproveSession<T>(opts: RunImproveSessionOptions<T>, deps: RunImproveSessionDeps): Promise<T>`
- `const makeSignalHandler = (sig: keyof typeof SIGNAL_TABLE) => () =>`

### src/commands/improve/improve-strategies.ts

- `export type ImproveStrategyConfig = ImproveProfileConfig;`
- `export interface SelectedStrategy`
- `export function resolveProcessEnabled`
- `function stripBundlePrefix(value: string): string`
- `export function shouldSkipRef`
- `export function eligibleRefCount`
- `export function isStrategyFilteredForAllPasses(ref: string, strategy: ImproveProfileConfig): boolean`
- `export function resolveImproveStrategy(name: string | undefined, config: AkmConfig): SelectedStrategy`
- `export type ImproveProcessName = (typeof IMPROVE_PROCESS_NAMES)[number];`
- `export interface ResolvedImproveProcess`
- `export type EngineUnavailableProcessName = ImproveProcessName | "triage.judgment";`
- `export interface EngineUnavailableProcess`
- `export interface ResolvedImprovePlan`
- `export interface ProcessRoutingRow`
- `export function projectResolvedProcessRouting(plan: ResolvedImprovePlan): ProcessRoutingRow[]`
- `export function cloneAndFreeze<T>(value: T): Readonly<T>`
- `const freeze = (item: unknown): void =>`
- `export interface ImprovePlanOptions`
- `export function resolveImprovePlan`
- `function buildImprovePlan`

### src/commands/improve/improve-usage-report.ts

- `export interface UsageReportNoCallRow`
- `export interface ImproveUsageReport`
- `function dominantReason(counts: Record<string, number>): string | undefined`
- `export function deriveNoCallReason(args:`
- `function countReflectSkipReasons(actions: readonly ImproveActionResult[]): Record<string, number>`
- `export function buildImproveUsageReport(args:`
- `function renderFixedWidthTable(headers: readonly string[], rows: readonly (readonly string[])[]): string[]`
- `const renderRow = (cells: readonly string[]): string`
- `export function formatUsageReportTable(usageReport: ImproveUsageReport, notes?: readonly string[]): string`

### src/commands/improve/improve.ts

- `export function renderSyncCommitMessage`
- `export function armBudgetWatchdog`
- `export async function akmImprove(options: AkmImproveOptions`
- `let clearBudgetTimer = (): void =>`
- `let clearFirstResponseHeartbeat = (): void =>`
- `const closeJournal = () =>`
- `let disposeLlmUsageSink = (): void =>`
- `const releaseRunLock = (): void =>`
- `const teardown = () =>`
- `function describeRunWrittenPaths(setup: ImproveRunSetup, writtenPaths: readonly string[]): string[]`
- `interface ImproveReadSource`
- `export function resolveImproveReadSource`
- `function resolveImproveRunSetup(options: AkmImproveOptions)`
- `type ImproveRunSetup = ReturnType<typeof resolveImproveRunSetup>;`
- `function recordImproveFailure(err: unknown, run: ImproveRunSetup, eventsCtx: EventsContext): void`
- `function countUndecidedPendingMemories(stashDir: string): number`
- `function probeEntryCount(): number | undefined`
- `async function runIndexBootstrapPass`
- `async function indexAndCollect(run: ImproveRunSetup): Promise<`
- `export function buildLockSkippedResult`
- `async function runDryPlanningStage`
- `function preparationArgs`
- `export function buildDryRunResult`
- `function buildResultExecutionPlan`
- `async function runTriagePrePass(run: ImproveRunSetup): Promise<DrainResult | undefined>`
- `export function resolveSyncPathSet(input:`
- `const inScope = (relativePath: string): boolean`
- `type ImproveSyncOutcome = NonNullable<AkmImproveResult["sync"]>;`
- `function syncsStash(run: ImproveRunSetup): boolean`
- `function runStashSync`
- `const record = (metadata: Record<string, unknown>)`
- `function syncBeforeRun(run: ImproveRunSetup, eventsCtx: EventsContext): ImproveSyncOutcome | undefined`
- `function makeCommitStashBatch(deps:`
- `async function runImproveStageSequence`
- `function finalizeImproveResult(args:`
- `const countMode = (mode: ImproveActionMode)`
- `function collectImproveNotices(resolvedPlan: ImproveRunSetup["resolvedPlan"], carriers: readonly unknown[])`
- `const collect = (carrier: unknown): void =>`
- `function emitImproveCompletedEvent`
- `function shapeMemoryCleanup(plan: MemoryCleanupPlan): ImproveMemoryCleanupResult`

### src/commands/improve/ledger.ts

- `export function stateKey(ref: string, itemRef?: string): string`
- `export function stripBundle(ref: string): string`
- `export interface LedgerAccess`
- `function ledgerDbPath(access: LedgerAccess | undefined): string | undefined`
- `function withLedgerDb<T>(access: LedgerAccess | undefined, fn: (db: Database) => T): T | undefined`
- `export interface LedgerAttemptInput`
- `export function recordLedgerAttempt`
- `export type LedgerSnapshot = ReadonlyMap<string, ImproveLedgerRow>;`
- `export function ledgerKey(source: string, ref: string): string`
- `export function readLedgerDb<T>(access: LedgerAccess | undefined, fn: (db: Database) => T): T | undefined`
- `export function loadLedgerSnapshot`
- `export function ledgerRowFor`
- `export function lastAttemptByRef`

### src/commands/improve/locks.ts

- `export type ImproveLockAcquisition = { state: "acquired"; ownership: LockOwnership } | { state: "skipped" };`
- `export function improveLockPath(lockBaseDir: string): string`
- `export function tryAcquireImproveLock`
- `const acquire = ()`
- `function tryAcquireImproveLockUnlocked`
- `export function releaseImproveLock(ownership: LockOwnership): void`

### src/commands/improve/loop-stages.ts

- `export interface ImproveLoopEnv`
- `export function prepareImproveLoopEnv(args: ImproveLoopState): ImproveLoopEnv`
- `export interface LoopRefTally`
- `function recordLoopAttempt`
- `function recordPlasticity(env: ImproveLoopEnv, planned: ImproveEligibleRef, outcome: "noop" | "changed" | undefined)`
- `function recordSkip(tally: LoopRefTally, ref: string, reason: string, event?:`
- `export async function processImproveLoopRef(planned: ImproveEligibleRef, env: ImproveLoopEnv): Promise<LoopRefTally>`
- `async function runLoopReflectPass(planned: ImproveEligibleRef, env: ImproveLoopEnv, tally: LoopRefTally)`
- `async function runLoopDistillPass`
- `export async function runImproveLoopStage(args: ImproveLoopState): Promise<ImproveLoopResult>`
- `export async function runImprovePostLoopStage(args:`
- `export interface IndexDbCell`
- `export interface MaintenanceCtx`
- `export async function runImproveMaintenancePasses(args:`
- `const openIndexDb = ()`
- `interface LlmPassOutcome<T>`
- `async function timedLlmPass<T>(label: string, run: () => Promise<T>): Promise<LlmPassOutcome<T>>`
- `export async function runMemoryInferenceMaintenancePass`
- `function runProposalHygienePass(ctx: MaintenanceCtx):`
- `export function runRetentionPurgePass(ctx: MaintenanceCtx):`
- `const report = (eventType: string, ref: string, purgedCount: number, what: string) =>`
- `function isStateRefLive(snapshot: LiveRefSnapshot, storedRef: string): boolean`
- `interface StateGcTable`
- `export function runOrphanStateGcPass`
- `const sweep = (table: StateGcTable) =>`

### src/commands/improve/outcome-loop.ts

- `export interface OutcomeUpdateInputs`
- `export interface OutcomeUpdateResult`
- `export interface OutcomeProjection extends OutcomeUpdateResult`
- `export function projectAssetOutcome`
- `export function updateAssetOutcome(db: Database, inputs: OutcomeUpdateInputs): OutcomeUpdateResult`
- `export function outcomeScoreToSalience(outcomeScore: number, maxScore: number): number`

### src/commands/improve/planner.ts

- `export interface EffectiveRefSelection`
- `type MemoryCleanupProjectionInput`
- `export interface MemoryCleanupProjection`
- `function canonicalMemoryConceptRef(ref: string): string | undefined`
- `export function projectMemoryCleanup(input: MemoryCleanupProjectionInput): MemoryCleanupProjection`
- `export function selectEffectiveImproveRefs(args:`
- `export interface ImprovePlanProjectionInput`
- `export function buildImproveExecutionPlan(input: ImprovePlanProjectionInput): ImproveExecutionPlan`

### src/commands/improve/preparation.ts

- `type Salience = ReturnType<typeof computeSalience>;`
- `type FeedbackSignal = { hasSignal: boolean; positive: number; negative: number };`
- `const keyOf = (r: ImproveEligibleRef): string`
- `function withRunState<T>`
- `function fileSize(filePath: string | undefined): number | undefined`
- `export function pickDefined<T extends object, K extends keyof T>`
- `export function recordImproveSkip`
- `export function pushRecentError(recentErrors: Record<string, string[]>, originator: string, msg: string): void`
- `function planConsolidationPass(args:`
- `async function runConsolidationPass(args: ImprovePreparationStageArgs): Promise<ConsolidationPassResult>`
- `interface ExtractPassPlan`
- `async function inspectExtractPass(args: ImprovePreparationStageArgs, readOnly: boolean): Promise<ExtractPassPlan>`
- `async function runSessionExtractPass`
- `export async function runValidationAndRepairPass(args:`
- `const validate = async (candidate: ImproveEligibleRef): Promise<string | undefined> =>`
- `export interface ImprovePreparationStageArgs`
- `export async function runImprovePreparationStage(args: ImprovePreparationStageArgs): Promise<ImprovePreparationResult>`
- `function assessMemoryIndex`
- `function isSignalEvent(metadata: unknown): boolean`
- `export function isFlaggedSinceLastEdit(candidate: ImproveEligibleRef, eventsCtx?: EventsContext): boolean`
- `export function isDeprecatedOrSuperseded(candidate: ImproveEligibleRef): boolean`
- `export function hasOnlyBarePositiveFeedback(candidate: ImproveEligibleRef, eventsCtx?: EventsContext): boolean`
- `const hasText = (value: unknown): boolean`
- `interface SignalDeltaSnapshot`
- `export function buildSnapshotManifest(args:`
- `export function partitionBySignalDelta(args:`
- `const deltaPasses = (candidate: ImproveEligibleRef, source: "reflect" | "distill"): boolean =>`
- `async function selectLoopCandidates`
- `const effectiveScore = (ref: string): number =>`
- `function fetchRetrievalSignals`
- `function selectProactiveMaintenanceLane`
- `function scoreSalience`
- `function updateOutcomeScores(args:`
- `const inputsFor = (r: ImproveEligibleRef, accepted: number) =>`
- `async function dropRefsMissingOnDisk`

### src/commands/improve/proactive-maintenance.ts

- `export interface ProactiveSelectorParams`
- `export interface ProactiveScoredRef`
- `export interface ProactiveSelectionResult`
- `function staleness`
- `export function selectProactiveMaintenanceRefs(params: ProactiveSelectorParams): ProactiveSelectionResult`

### src/commands/improve/reflect-noise.ts

- `export type ReflectChangeKind = "noop" | "cosmetic" | "substantive";`
- `export function classifyReflectChange(sourceContent: string, candidateContent: string): ReflectChangeKind`
- `export type ReflectDefect = "placeholder_added" | "meta_commentary_added" | "frontmatter_copied_into_body";`
- `export interface ReflectDefectFilter`
- `export function findReflectDefect`
- `function escapeRegExp(text: string): string`
- `function gainsPhrases(phrases: readonly string[], source: string, candidate: string): boolean`
- `function frontmatterCopiedIntoBody(source: string, candidate: string, keys: readonly string[]): boolean`
- `const keyLines = (text: string)`
- `function provenanceValues(content: string): string[]`
- `function lettersAndDigits(text: string): string`
- `export function splitFrontmatter(raw: string):`
- `export function bodyHasH1(body: string): boolean`
- `function parseSections(text: string):`
- `export function normalizeTrailingWhitespace(text: string): string`
- `export function cosmeticNormalForm(text: string): string`
- `function stableStringify(value: unknown): string`
- `type LogicalKind = "blank" | "verbatim" | "terminal" | "continuable" | "prose";`
- `export function normalizeMarkdownBody(body: string): string`
- `const push = (line: string, kind: LogicalKind) =>`
- `function collapseInnerWhitespace(line: string): string`

### src/commands/improve/reflect.ts

- `export interface AkmReflectOptions`
- `function readOnlyEventsContext(ctx?: EventsContext): EventsContext`
- `function readRecentFeedback(ref?: string, eventsCtx?: EventsContext, assetContent?: string): string[]`
- `function buildSchemaHints(type: string, content: string | undefined): string[]`
- `function lenientRefType(ref: string | undefined): string`
- `function deriveDescriptionFromAsset(title: unknown, body: string, targetRef: string): string | undefined`
- `function firstProseSentence(body: string): string`
- `interface ReflectPatch`
- `function withH1(body: string, title: string): string`
- `export function applyReflectPatch`
- `function patchFrontmatterLines(fmText: string, changes: Record<string, unknown>): string`
- `function wantsJsonSchemaOutput(connection:`
- `export interface RunReflectIterationOptions`
- `export interface ReflectTelemetry`
- `interface ReflectFailureFields`
- `export type ReflectIteration`
- `function parseReflectConfidence(value: unknown): number`
- `export interface ReflectPayload`
- `function parseReflectFrontmatterPatch(value: unknown): ReflectPatch`
- `function parseSchemaReflectOutput(raw: string, targetRef: string | undefined): ReflectPayload`
- `function parseFramedReflectOutput(raw: string, targetRef: string | undefined): ReflectPayload`
- `const header = (prefix: string)`
- `function messageFailure(error: string, reason: AgentFailureReason, stdout = "", exitCode = 1): ReflectFailureFields`
- `function dispatchFailure`
- `export async function runReflectIteration(opts: RunReflectIterationOptions): Promise<ReflectIteration>`
- `const parse = (raw: string): Parsed<ReflectPayload> =>`
- `const failed = (failure: ReflectFailureFields): ReflectIteration =>`
- `const call = (callMessages: ChatMessage[], repairTimeoutMs?: number): Promise<StructuredOutcome>`
- `interface ReflectRun`
- `function reflectEmitters(options: AkmReflectOptions): Pick<ReflectRun, "emitInvoked" | "emitFailed">`
- `const emitInvoked = (): void =>`
- `const emitFailed: ReflectRun["emitFailed"] = (reason, subreason, ref, extra) =>`
- `function reflectFailure(run: ReflectRun, failure: ReflectFailureFields): AkmReflectFailure`
- `function refusal(reason: AgentFailureReason, error: string): ReflectFailureFields`
- `function exitCodeMeta(failure: Pick<ReflectFailureFields, "exitCode">): Record<string, unknown>`
- `function unsupportedTypeFailure`
- `function fileOutsideLayoutFailure`
- `async function resolveReflectSource`
- `function resolveReflectRunner(options: AkmReflectOptions):`
- `function promptInArgv(runner: Extract<RunnerSpec,`
- `function computeReflectContentBudgetChars`
- `interface ReflectPromptSources`
- `function gatherReflectPromptSources`
- `function buildReflectPromptText(args:`
- `async function dispatchReflect(args:`
- `async function finalizeReflectProposal(args:`
- `const refuse = (detail: string, metadata: Record<string, unknown>, message: string): AkmReflectResult =>`
- `export async function renderReflectPromptPreview`
- `export async function akmReflect(options: AkmReflectOptions`

### src/commands/improve/retrieval-queries.ts

- `export function usableRetrievalQueries(raw: readonly string[]): string[]`
- `export function loadRetrievalQueries(access: LedgerAccess | undefined, ref: string): string[]`

### src/commands/improve/retrieval-scope.ts

- `export interface RetrievalScope`
- `export function loadRetrievalScope`
- `export function isInRetrievalScope(scope: RetrievalScope | undefined, ref: string, filePath?: string): boolean`

### src/commands/improve/salience.ts

- `export interface SalienceInputs`
- `export type EncodingSource = "content" | "type-stub";`
- `export interface SalienceVector`
- `const clamp01 = (value: number)`
- `export function computeSalience(inputs: SalienceInputs): SalienceVector`
- `export function isContentEncodingRow(row: AssetSalienceRow): boolean`
- `export function getLastUseMsByRef`

### src/commands/improve/session-asset.ts

- `export interface SessionAssetFrontmatter`
- `export interface SessionSummaryResult`
- `export type SessionSummaryGenerator = (data: SessionData) => Promise<SessionSummaryResult | undefined>;`
- `function renderTranscriptForSummary(events: SessionEvent[], maxChars = 12_000): string`
- `export function buildSessionSummaryPrompt(data: SessionData): string`
- `export function parseSessionSummary(raw: string): SessionSummaryResult | undefined`
- `export function sessionMeetsDurationGate(data: SessionData, minDurationMinutes: number): boolean`
- `export function buildSessionAccessInstructions(harness: string, logPath: string, sessionId: string): string`
- `function isoOrUndefined(ms: number | undefined): string | undefined`
- `export function buildSessionAssetName(harness: string, sessionId: string, startedAtMs?: number): string`
- `export function buildSessionAssetContent`
- `export function resolveSessionAssetPath(stashDir: string, harness: string, sessionId: string): string`
- `export interface WriteSessionAssetResult`
- `export async function writeSessionAsset`

### src/commands/improve/stage.ts

- `export function errMessage(e: unknown): string`
- `export function stageRunner`
- `export interface StageLlmCall`
- `export function callStageLoop<T>`
- `export async function callStage(call: StageLlmCall): Promise<StructuredOutcome>`
- `export async function callStageOnce(call: StageLlmCall): Promise<StructuredOutcome>`
- `const dispatch = ()`
- `export function attributeStage<T>`
- `export function rejectedProposalContext`
- `export function mintProposal`
- `export function stageJudgedProposal`
- `export interface QualityJudgeResult`
- `type QualityJudgeChat =`
- `function gateNamesAJudge(gate: object): boolean`
- `export function resolveQualityGateJudge`
- `export interface QualityJudgeOptions`
- `export function buildJudgePrompt`
- `function boundedDocument(content: string, maxChars = 6000): string`
- `function buildChangedRegion(sourceContent: string, candidateContent: string): string`
- `type JudgeReadTool = "akm_show" | "akm show";`
- `function reflectJudgeToolRules(ref: string | undefined, tool: JudgeReadTool): string`
- `export function buildReflectJudgePrompt`
- `function parseJudgeResponse`
- `const inRange = (value: unknown): value is number`
- `export function judgeResponseSchema(keys: readonly string[]): Record<string, unknown>`
- `async function runQualityJudge`
- `export function runLessonQualityJudge`
- `export function runReflectQualityJudge`

## src/commands/improve/consolidate/

### src/commands/improve/consolidate/chunking.ts

- `export function computeSafeChunkSize(contextLength: number, bodyTruncation: number, maxChunkSize?: number): number`
- `export function buildChunkPrompt`

### src/commands/improve/consolidate/continuity-check.ts

- `export interface ContinuityHit`
- `export interface ContinuitySearchResult`
- `export type ContinuitySearch = (query: string) => Promise<ContinuitySearchResult>;`
- `export function createContinuitySearch(stashDir: string, config: AkmConfig): ContinuitySearch`
- `function rankOf(hits: readonly ContinuityHit[], conceptId: string): number | undefined`
- `function normalizedBody(raw: string): string`
- `export async function checkRetirementContinuity(args:`

### src/commands/improve/consolidate/coverage.ts

- `export function wordShingles(text: string): Set<string>`
- `export function shingleContainment(memory: ReadonlySet<string>, doc: string): number`
- `export interface CoveringKnowledge`
- `export type CoveringKnowledgeFinder = (filePath: string, body: string) => CoveringKnowledge | undefined;`
- `export interface KnowledgeNeighbour`
- `function knowledgeNeighbours(db: Database, bundleId: string, filePath: string): KnowledgeNeighbour[]`
- `export function findCoveringKnowledge`
- `export function nearestKnowledgeNotes`
- `export function openKnowledgeCoverage`

### src/commands/improve/consolidate/pair-pass.ts

- `type RetireJudgeLabel = "duplicate" | "subsumed" | "supersedes";`
- `function isRetireLabel(label: ConsolidatePairJudgeLabel): label is RetireJudgeLabel`
- `interface RawPairJudgeResponse`
- `export interface PairJudgeVerdict`
- `export function parsePairJudgeResponse(raw: string): PairJudgeVerdict | undefined`
- `function claimList(value: unknown): string[] | undefined`
- `export interface PairAsset`
- `function isFlatName(name: string): boolean`
- `export function isOwnTwinOrParent(a: PairAsset, b: PairAsset): boolean`
- `export function loadPairPassPool(db: Database, bundleId: string): PairAsset[]`
- `function repoRelativeKey(stashDir: string, filePath: string): string`
- `export function loadGitFirstAddedMap(stashDir: string): ReadonlyMap<string, number> | undefined`
- `function createdMsOf`
- `export interface Initiator extends PairAsset`
- `export interface PairCandidate`
- `function pairKey(a: string, b: string): string`
- `function rejectedPairKey(retiredRef: string, successorRef: string, retiredHash: string, successorHash: string): string`
- `export function loadRejectedPairKeys(stashDir: string, proposalsCtx: ProposalsContext | undefined): Set<string>`
- `export function selectInitiators`
- `export function selectCandidates`
- `export interface PairSide`
- `function loadSide`
- `function sideSection(label: string, side: PairSide): string[]`
- `function exclusiveTerms(side: PairSide, other: PairSide): string`
- `const tokens = (note: PairSide)`
- `function termHints(lines: string[]): string`
- `function orderByAge(x: PairSide, y: PairSide):`
- `export function buildPairUserPrompt(older: PairSide, newer: PairSide): string`
- `export function tombstoneReason(label: "duplicate" | "subsumed" | "supersedes"): Exclude<RetireReason, "promoted">`
- `export interface PairDecision`
- `export function decideRetirement`
- `export type PairJudgeChat =`
- `interface PairPassContext`
- `function checkSection(label: string, side: PairSide): string`
- `async function confirmNothingLost(ctx: PairPassContext, retired: PairSide, successor: PairSide): Promise<boolean>`
- `async function judgeOne(ctx: PairPassContext, candidate: PairCandidate): Promise<`
- `const scopesStillFresh = (): boolean`
- `const emptyLabelCounts = (): Record<ConsolidatePairJudgeLabel, number> =>`
- `export async function runConsolidatePairPass`
- `const isPendingBlocked = (c: PairCandidate): boolean`
- `const isNewOrChanged = (i: Initiator): boolean`

### src/commands/improve/consolidate/sanitize.ts

- `function recoverMalformedFrontmatter(raw: string): string | null`
- `export function stripOuterCodeFence(raw: string):`
- `interface SanitizedMergedContent`
- `export function sanitizeMergedContent`
- `export function normalizeUpdatedField(fm: Record<string, unknown>): void`

## src/commands/improve/distill/

### src/commands/improve/distill/content-repair.ts

- `export interface DistillValidationFinding`
- `export function autoRepairLessonFrontmatter(content: string, inputRef: string): string`
- `const stripMd = (l: string)`
- `const isYamlLike = (l: string)`
- `export function autoSwapDescriptionWhenToUse(content: string, inputRef: string):`
- `export function repairLessonDescriptionTruncation(content: string): string`
- `export function collectLessonQualityFindings(content: string, inputRef: string): DistillValidationFinding[]`

### src/commands/improve/distill/lesson-update.ts

- `export interface UpdateCandidate`
- `export function buildLessonUpdatePrompt(memory: string, feedback: string[], candidates: UpdateCandidate[]): string`
- `export function parseLessonUpdate<T extends UpdateCandidate>`
- `const normalizeLine = (line: string): string`
- `const bodyLines = (body: string): string[]`
- `export function diffLessonBody(existingBody: string, mergedBody: string):`

## src/commands/improve/memory/

### src/commands/improve/memory/derived-ref.ts

- `export function parseMemoryName(value: string | undefined): string | undefined`
- `export function parseMemoryRef(value: string | undefined): string | undefined`
- `export function memoryIdentityRef(name: string): string`
- `export function isDerivedMemory(name: string, frontmatter: Record<string, unknown>): boolean`
- `export function resolveParentRef(name: string, frontmatter: Record<string, unknown>): string | undefined`

### src/commands/improve/memory/memory-belief.ts

- `export function readEdgeList(value: unknown): string[]`
- `export function writeSupersededEdge(filePath: string, supersededByRef: string): void`

### src/commands/improve/memory/memory-improve.ts

- `export interface MemoryCleanupPlan`
- `export interface MemoryBeliefTransitionLogRecord extends MemoryBeliefStateTransition`
- `export interface MemoryCleanupApplyResult`
- `export interface MemoryCleanupOptions`
- `interface DerivedMemoryRecord`
- `interface PlannedPrune extends MemoryPruneCandidate`
- `interface FamilyContradictionResolution`
- `export function analyzeMemoryCleanup(stashDir: string, options: MemoryCleanupOptions`
- `const planPrune = (record: DerivedMemoryRecord, reason: MemoryPruneReason, survivorRef?: string) =>`
- `const planBeliefTransition =`
- `export function applyMemoryCleanup(stashDir: string, plan: MemoryCleanupPlan): MemoryCleanupApplyResult`
- `function formatApplyWarning(stage: string, ref: string, error: unknown): string`
- `function resolveRelativeDates(text: string, referenceDate: Date): string`
- `function resolveFamilyContradictions(family: DerivedMemoryRecord[]): FamilyContradictionResolution`
- `const reachableSinkRefsForComponent = (index: number): string[] =>`
- `function stronglyConnectedComponents`
- `const visit = (ref: string) =>`
- `export function derivedTwinPath(filePath: string, refType: string): string | undefined`
- `function isRetireCandidate(candidate: MemoryPruneCandidate): boolean`
- `function resolvePreviousBeliefState`
- `export function archiveCleanupCandidate`
- `export interface ArchivePurgeResult`
- `export function purgeGracedArchive(stashDir: string, now: Date = new Date()): ArchivePurgeResult`
- `function listFilesRecursive(target: string): string[]`
- `function persistBeliefStateTransition(filePath: string, transition: MemoryBeliefStateTransition): void`
- `function appendBeliefStateTransitionLog(stashDir: string, transitions: MemoryBeliefStateTransition[]): string`
- `function priorBeliefStateForArchive(candidate: MemoryPruneCandidate): Exclude<MemoryBeliefState, "archived">`
- `function createArchiveDir(stashDir: string, ref: string, archivedAt: string): string`
- `function sanitizeRef(ref: string): string`
- `function collectDerivedMemories(stashDir: string, parentRefFilter?: string): DerivedMemoryRecord[]`
- `function isActiveLikeBeliefState(state: Exclude<MemoryBeliefState, "archived">): state is "active" | "asserted"`
- `function isFrozenHistoricalBeliefState(state: Exclude<MemoryBeliefState, "archived">): state is "deprecated"`
- `function resolveBeliefState(frontmatter: Record<string, unknown>): Exclude<MemoryBeliefState, "archived">`
- `function refArray(value: unknown): string[]`
- `function buildFingerprint`
- `function normalizeBody(value: string): string`
- `function normalizeSignal(value: string | undefined): string | undefined`
- `function normalizeList(values: string[]): string[]`
- `function computeSignalScore`
- `function sortRecordsForSurvival(records: DerivedMemoryRecord[]): DerivedMemoryRecord[]`
- `function compareRecords(a: DerivedMemoryRecord, b: DerivedMemoryRecord): number`
- `function compareCandidates(a: MemoryPruneCandidate, b: MemoryPruneCandidate): number`
- `function compareContradictionCandidates(a: MemoryContradictionCandidate, b: MemoryContradictionCandidate): number`
- `function compareBeliefTransitions(a: MemoryBeliefStateTransition, b: MemoryBeliefStateTransition): number`
- `function compareConsolidationCandidates(a: MemoryConsolidationCandidate, b: MemoryConsolidationCandidate): number`
- `function firstExistingRef`
- `function sameStringArray(a: string[], b: string[]): boolean`
- `function extractHeading(content: string): string | undefined`
- `function firstNonEmpty(values: Array<string | undefined>): string | undefined`
- `function toMemoryName(memoriesDir: string, filePath: string): string | undefined`

## src/commands/lint/

### src/commands/lint/base-linter.ts

- `function foldDescriptionLines(lines: string[]): string`
- `function recoverMalformedDescription(firstSegment: string, continuation: string[]): string | null`
- `function fixUnquotedColon(raw: string): string | null`
- `function checkMissingUpdated(data: Record<string, unknown>, frontmatterText: string | null): boolean`
- `function fixMissingUpdated(raw: string, mtime: Date): string`
- `function checkStalePath(body: string): string[]`
- `function stripFencedBlocks(body: string): string`
- `export function refToRelPath(refType: string, refName: string): string | null`
- `export function refExistsInAnyStash(relPath: string, refType: string, refName: string, stashRoots: string[]): boolean`
- `function refPathCandidates(refType: string, typeDir: string, refName: string): string[]`
- `function memoryArchiveHasRef(refType: string, refName: string, stashRoots: string[]): boolean`
- `export function resolveRefPathInStash(relPath: string, refType: string, refName: string, root: string): string | null`
- `function isNonRefName(refName: string): boolean`
- `function localRefMissingRelPath(refType: string, refName: string, allRoots: string[]): string | null`
- `function scanBundleRefs(scanBody: string, allRoots: string[]): Array<`
- `function classifyConceptRef(rawConceptId: string, allRoots: string[]): string | null`
- `function legacyTypeSlugParts(rawConceptId: string):`
- `function checkMissingRefs`
- `function checkMissingRefsInList`
- `function dedupeMissing`
- `function extractFrontmatterRefs(data: Record<string, unknown>, body: string): string[] | null`
- `function readRefsArray(value: unknown): string[] | null`
- `function readRefStringOrArray(value: unknown): string[] | null`
- `function parseInnerFrontmatterBlock(body: string): Record<string, unknown> | null`
- `export function runBaseChecks(ctx: LintContext): LintIssue[]`
- `const shouldRun = (issueType: string)`
- `const flushIfModified = (): void =>`
- `function runMissingRefChecks`

### src/commands/lint/env-key-rules.ts

- `export function isDangerousEnvKey(key: string): boolean`
- `function collectSuppressedKeys(envPath: string): Set<string>`
- `export function checkEnvForDangerousKeys(envPath: string, relPath: string, envRef: string): LintIssue[]`

### src/commands/lint/index.ts

- `export interface AkmLintResult`
- `export interface AkmLintOptions`
- `function collectTaskFiles(dir: string): string[]`
- `function isTaskFileName(fileName: string): boolean`
- `function isNearMissTaskFileName(fileName: string): boolean`
- `function collectMarkdownFiles(dir: string, caseInsensitive = false): string[]`
- `function collectWorkflowFiles(dir: string): string[]`
- `interface WorkflowLintOwnership`
- `function resolveWorkflowLintOwnership(stashRoot: string, files: readonly string[]): WorkflowLintOwnership`
- `function matchesAdapterExtension(fileName: string, extensions: readonly string[]): boolean`
- `function collectAdapterFiles(root: string, extensions: readonly string[]): string[]`
- `const walk = (dir: string): void =>`
- `export function diagnosticToLintIssue(diag: Diagnostic): LintIssue`
- `async function lintViaAdapter`
- `function lintIssueDedupeKey(issue: LintIssue): string`
- `function collectEnvFiles(dir: string): string[]`
- `function runEnvDangerousKeyPass`
- `function assertFixTargetWritable(stashRoot: string, sources: SearchSource[]): void`
- `function isFileDeletion(issue: LintIssue): boolean`
- `export function lintSkillDirectory(subdirPath: string, stashRoot: string): LintIssue[]`
- `function appendMemoryStubIssue(ctx: LintContext, issues: LintIssue[]): void`
- `function appendWorkflowStubIssue(ctx: LintContext, issues: LintIssue[]): void`
- `export function lintAssetFile(ctx: LintContext, subdir: string): LintIssue[]`
- `function lintAkmSweep`
- `export async function akmLint(options: AkmLintOptions`

### src/commands/lint/markdown-insertion.ts

- `function looksLikeTableRow(line: string): boolean`
- `export function findEndOfTable(lines: string[], headerLine: number): number`
- `export function isInsideTable(lines: string[], lineIdx: number): number`
- `interface FenceRegion`
- `export function findFenceRegions(lines: string[]): FenceRegion[]`
- `export function isInsideCodeFence(lines: string[], lineIdx: number): number`
- `export function isInsideHtmlTable(lines: string[], lineIdx: number): number`
- `export function isInsideIndentedCode(lines: string[], lineIdx: number): number`
- `const isIndented = (s: string) => /^`
- `export function findSafeInsertionPoint(lines: string[], proposedLineNumber: number): number`
- `export function findSafeInsertionPointInText(content: string, proposedLineNumber: number): number`

### src/commands/lint/types.ts

- `export type LintIssueType`
- `export function isAdvisoryLintIssue(issue:`
- `export interface LintIssue`
- `export interface LintContext`

## src/commands/metrics/

### src/commands/metrics/collect.ts

- `export interface MetricsInput`
- `export function retentionNotes(args:`
- `export function usageCreatedAtToIso(createdAt: string): string`
- `function parseMetadata(text: string | null): Record<string, unknown>`
- `function finiteNumber(value: unknown): number | undefined`
- `export function toUsageRow(row: UsageEventRow): MetricsUsageRow`
- `export function llmRowsFromEvents(events: EventEnvelope[]): MetricsLlmRow[]`
- `export function indexRunsFromEvents(events: Array<`
- `function median(values: number[]): number | null`
- `function mean(values: number[]): number | null`
- `function byCountThenKey<T extends`
- `function buildUsage(input: MetricsInput, rows: MetricsUsageRow[]): AkmMetricsResult["usage"]`
- `const isUnit = (row: MetricsUsageRow)`
- `const bump = (at: string, field: keyof Omit<MetricsDailyUsage, "day">) =>`
- `const asset = (ref: string): MetricsAssetUsage =>`
- `const touch = (entry: MetricsAssetUsage, at: string) =>`
- `const toQueryCount =`
- `function buildFeedback(top: number, rows: MetricsUsageRow[]): AkmMetricsResult["feedback"]`
- `function buildUtility(input: MetricsInput): AkmMetricsResult["utility"]`
- `function taskDurationMs(row: TaskHistoryRow): number | undefined`
- `function buildTasks(top: number, rows: TaskHistoryRow[]): AkmMetricsResult["tasks"]`
- `function buildIndex(top: number, runs: MetricsIndexRun[]): AkmMetricsResult["index"]`
- `export function buildMetricsResult(input: MetricsInput): AkmMetricsResult`

### src/commands/metrics/html-report.ts

- `type PageUsageRow = Omit<MetricsUsageRow, "query"> & { query?: string; q?: number };`
- `type PageData = Omit<AkmMetricsResult, "rows"> &`
- `function toPageData(result: AkmMetricsResult): PageData`
- `function islandJson(value: unknown): string`
- `export function buildMetricsHtmlReplacements(result: AkmMetricsResult): Record<string, string>`
- `export function renderMetricsHtml(result: unknown): string | null`

### src/commands/metrics/md-report.ts

- `function cell(value: string): string`
- `function renderTable(table: MetricsViewTable): string[]`
- `` const row = (cells: string[]) => `| $ ``
- `export function renderMetricsMd(result: unknown, detail: DetailLevel): string | null`

### src/commands/metrics/metrics-cli.ts

- `export interface AkmMetricsOptions`
- `export function metricsIncludeRows(mode: Pick<OutputMode, "format" | "detail">): boolean`
- `async function durableSelects`
- `function readUtility():`
- `function readEventRetention():`
- `function readAcceptRate(stateDb: Database, notes: string[]): AkmMetricsResult["proposals"]["acceptRateBySource"]`
- `export async function akmMetrics(options: AkmMetricsOptions`

### src/commands/metrics/report-view.ts

- `export interface MetricsViewTable`
- `export interface MetricsViewSection`
- `export interface MetricsView`
- `export function isMetricsResult(value: unknown): value is AkmMetricsResult`
- `const int = (n: number): string`
- `const dash = (v: string | undefined): string`
- `` const pct = (n: number | null): string => (n === null ? "n/a" : `$ ``
- `` const ms = (n: number | null): string => (n === null ? "n/a" : `$ ``
- `const fixed = (n: number | null, digits: number): string`
- `function sourceFacts(counts: Record<string, number>): string`
- `function llmRows(group: Record<string, AkmMetricsResult["llm"]["byEngine"][string]>): string[][]`
- `export function buildMetricsView(r: AkmMetricsResult, detail: DetailLevel): MetricsView`
- `const cut = <T>(items: T[]): T[]`
- `function utilityHeaders(): string[]`
- `function utilityRow(u: AkmMetricsResult["utility"]["lowest"][number]): string[]`

### src/commands/metrics/types.ts

- `export interface MetricsUsageRow`
- `export interface MetricsLlmRow`
- `export interface MetricsDailyUsage`
- `export interface MetricsAssetUsage`
- `export interface MetricsQueryCount`
- `export interface MetricsFeedbackAsset`
- `export interface MetricsNegativeFeedback`
- `export interface MetricsUtilityAsset`
- `export interface MetricsOutcomeAsset`
- `export interface MetricsTaskSummary`
- `export interface MetricsIndexRun`
- `export interface AkmMetricsResult`

## src/commands/proposal/

### src/commands/proposal/diff-format.ts

- `export function formatUnifiedDiff(left: string, right: string, label: string): string`
- `export function formatNewAssetDiff(ref: string, content: string): string`
- `export function formatRetireDiff(ref: string, existing: string | null, successorRef?: string): string`

### src/commands/proposal/drain.ts

- `export type DrainDeferReason = "needs-judgment" | "proactive-needs-review";`
- `export interface DrainOptions`
- `export interface DrainResult`
- `export type PromoteFn = typeof akmProposalAccept;`
- `export type RejectFn =`
- `export interface JudgmentVerdict`
- `export interface JudgmentSeams`
- `export function isPromotionProposal(proposal: Proposal): boolean`
- `export function isEmptyDiff(proposal: Proposal): boolean`
- `function categorizeDrainFailure(message: string, fallback: string): string`
- `type AcceptOutcome = "promoted" | "rejected" | { message: string };`
- `async function acceptProposal`
- `async function rejectProposal`
- `export function fencedBlock(text: string): string[]`
- `export function buildJudgmentPrompt`
- `export function parseJudgmentVerdict(raw: string): JudgmentVerdict | null`
- `interface DeferNote`
- `async function dispatchJudgment`
- `async function runJudgmentTier`
- `function promotionNeighbours`
- `function readLiveAssetContent(stashDir: string, ref: string): string | undefined`
- `export async function drainProposals`
- `async function drainPending`
- `function emitDrainEvents(opts: DrainOptions, result: DrainResult): void`

### src/commands/proposal/proposal-cli.ts

- `function parseBulkFilterFlags(args: Record<string, unknown>):`
- `function parseProposalStatus(raw: string | undefined): "pending" | "accepted" | "rejected" | "reverted" | undefined`

### src/commands/proposal/proposal-types.ts

- `export type EligibilitySource`
- `export type ProposalSource = (typeof PROPOSAL_SOURCES)[number];`
- `export function isValidProposalSource(source: string): source is ProposalSource`
- `export function isAutomatedProposalSource(source: string): source is (typeof AUTOMATED_PROPOSAL_SOURCES)[number]`
- `export type ProposalStatus = "pending" | "accepted" | "rejected" | "reverted";`
- `export interface ProposalPayload`
- `export interface ProposalFeedbackFix`
- `export interface ProposalReview`
- `export interface ProposalReviewHistoryEntry`
- `export type ProposalGateDecisionOutcome = "auto-accepted" | "deferred" | "staged" | "auto-rejected";`
- `export interface ProposalGateDecision`
- `export type RetireReason = "duplicate" | "subsumed" | "superseded" | "promoted";`
- `export interface RetirementMetadata`
- `export interface ContinuityRiskRank`
- `export interface RetirementContinuityRisk`
- `export interface RetiredArchiveRecord`
- `export interface RetireAcceptIntent`
- `export interface Proposal`
- `export function proposalWaitingSince(proposal: Pick<Proposal, "createdAt" | "reviewHistory">): string`
- `export function isRetireProposal(proposal: Pick<Proposal, "changes">): boolean`
- `export function isProceduralRejection(proposal: Pick<Proposal, "gateDecision" | "review">): boolean`
- `export interface ProposalValidationFinding`
- `export interface ProposalValidationReport`
- `export interface ProposalValidationContext`
- `export interface ProposalValidator`

### src/commands/proposal/proposal.ts

- `function resolveStash(stashDir?: string): string`
- `interface ResolvedProposalQueue`
- `function resolveProposalQueue`
- `export interface ProposalListOptions`
- `export interface ProposalListResult`
- `export function listPendingProposals(stashDir?: string): Proposal[]`
- `export function akmProposalList(options: ProposalListOptions`
- `export interface ProposalShowOptions`
- `export interface ProposalShowResult`
- `export function akmProposalShow(options: ProposalShowOptions): ProposalShowResult`
- `export interface ProposalAcceptOptions`
- `export interface ProposalAcceptResult`
- `export async function akmProposalAccept(options: ProposalAcceptOptions): Promise<ProposalAcceptResult>`
- `export interface ProposalAcceptFailure`
- `export async function akmProposalAcceptMany`
- `export interface ProposalRejectOptions`
- `export interface ProposalRejectResult`
- `export async function akmProposalReject(options: ProposalRejectOptions): Promise<ProposalRejectResult>`
- `export interface ProposalReopenOptions`
- `export interface ProposalReopenResult`
- `export async function akmProposalReopen(options: ProposalReopenOptions): Promise<ProposalReopenResult[]>`
- `export interface ProposalDiffOptions`
- `export interface ProposalDiffResult`
- `function retireDiffFields`
- `export function akmProposalDiff(options: ProposalDiffOptions): ProposalDiffResult`
- `export interface ProposalRevertOptions`
- `export interface ProposalRevertResult`
- `export async function akmProposalRevert(options: ProposalRevertOptions): Promise<ProposalRevertResult>`
- `export interface BulkAdjudicateOptions`
- `export interface BulkAdjudicateResult`
- `function retiredTargetLineCount`
- `export async function bulkAdjudicateProposals(options: BulkAdjudicateOptions): Promise<BulkAdjudicateResult>`
- `const isContinuityExcluded = (p: Proposal): boolean`

### src/commands/proposal/propose-cli.ts

### src/commands/proposal/propose.ts

- `export interface AkmProposeOptions`
- `export interface AkmProposeFailure`
- `export interface AkmProposeSuccess`
- `export type AkmProposeResult = AkmProposeSuccess | AkmProposeFailure;`
- `function failureEnvelope`
- `function noticeFields(notices: readonly Readonly<LoweringNotice>[]):`
- `interface ProposalDispatchResult`
- `async function dispatchProposalPrompt`
- `const corrected = (content: string)`
- `function proposeItemRef(bundleId: string, type: string, name: string): string`
- `function emitProposeInvoked(bundleId: string, options: AkmProposeOptions): void`
- `export async function akmPropose(options: AkmProposeOptions): Promise<AkmProposeResult>`

### src/commands/proposal/repository.ts

- `type GateDecisionInput = Omit<ProposalGateDecision, "decidedAt"> & { decidedAt?: string };`
- `type ProposalRejectionReason`
- `export interface OrphanPurgeResult`
- `export interface ExpireStaleResult`
- `function withProposalContent(p: Proposal, content: string): Proposal`
- `export interface ProposalsContext`
- `export interface CreateProposalInput`
- `function nowIso(ctx?: ProposalsContext): string`
- `function withProposalsDb<T>(ctx: ProposalsContext | undefined, fn: (db: Database) => T): T`
- `interface ProposalRefIdentity`
- `function isRetiredProposalConceptId(conceptId: string): boolean`
- `function proposalRefIdentity(ref: string): ProposalRefIdentity | undefined`
- `function filterRefIdentity(ref: string): ProposalRefIdentity`
- `function proposalMatchesRef(proposalRef: string, filter: ProposalRefIdentity): boolean`
- `function proposalDurableRef(parsedRef: AssetRef, target: NonNullable<CreateProposalInput["target"]>): string`
- `function resolveCreateProposalTarget`
- `export function resolveProposalQueueTarget`
- `function otherOwningBundle(itemRef: string, target:`
- `export function createProposal(stashDir: string, input: CreateProposalInput, ctx?: ProposalsContext): Proposal`
- `const rejectProposal = (reason: ProposalRejectionReason, message: string): never =>`
- `export interface CreateRetireProposalInput`
- `export function createRetireProposal`
- `type ListProposalsOptions = { includeArchive?: boolean; status?: ProposalStatus; ref?: string; type?: string };`
- `function queryProposals(db: Database, stashDir: string, options: ListProposalsOptions): Proposal[]`
- `export function listProposals`
- `export function listProposalsReadOnly`
- `export function getProposal(stashDir: string, id: string, ctx?: ProposalsContext): Proposal`
- `function requireProposal(db: Database, stashDir: string, id: string): Proposal`
- `export function resolveProposalId(stashDir: string, idOrRef: string, ctx?: ProposalsContext): Proposal`
- `export function resolveProposalIdIn(db: Database, stashDir: string, idOrRef: string): Proposal`
- `const newest = (status?: string): Proposal | undefined`
- `function ledgerOutcomeForDecision`
- `function decisionLedgerSubject(proposal: Proposal):`
- `export function archiveProposal`
- `export function recordGateDecision`
- `export function purgeOrphanProposals`
- `export function expireStaleProposals(stashDir: string, config: AkmConfig, ctx?: ProposalsContext): ExpireStaleResult`
- `export function proposalContentHash(proposal: Proposal): string`
- `function persistProposalDecision`
- `export function rejectProposalDurably`
- `function writeProposalAssetFile(assetPath: string, content: string): void`
- `async function indexWrittenProposalAsset(target: ResolvedWriteTarget, assetPath: string): Promise<void>`
- `export interface PromoteResult`
- `function resolveRecordedProposalTarget`
- `function resolveProposalWriteTarget`
- `const named = (target: ResolvedWriteTarget): ResolvedWriteTarget =>`
- `function resolveActorId(ctx?: ProposalsContext): string`
- `function isPlainRecord(value: unknown): value is Record<string, unknown>`
- `function stampProposalProvenance`
- `` const human = () => `human:$ ``
- `export async function promoteProposal`
- `function promotionLintBlockers`
- `export interface ProposalPromotionPreflight`
- `export function preflightProposalPromotion`
- `export function readFreshProposalTarget`
- `function acceptedAssetPath(proposal: Proposal, target: ResolvedWriteTarget, ref: AssetRef): string`
- `function requireAcceptedTarget(proposal: Proposal): NonNullable<Proposal["acceptedTarget"]>`
- `function acceptCommitMessage(proposal: Proposal): string`
- `export type AcceptCommitCollector = Array<{ target: ResolvedWriteTarget; proposal: Proposal; paths: string[] }>;`
- `function commitAccept`
- `export function commitCollectedAccepts(collector: AcceptCommitCollector, label: string): void`
- `function retirePromotionSource(mutationTarget: ResolvedWriteTarget, accepted: Proposal, paths: string[]): void`
- `async function promoteProposalWithLease`
- `function findRetireArchiveDirsByProposalId(stashRoot: string, proposalId: string): string[] | undefined`
- `function alreadyArchivedOriginalPaths(stashRoot: string, dirs: string[]): Set<string>`
- `function recordRetireAcceptIntent`
- `function persistRetireAcceptance`
- `function assertRetirementStillFresh`
- `async function retireProposalWithLease`
- `export interface RevertResult`
- `export async function revertProposal`
- `async function unretireProposalWithLease`
- `interface PendingRestore`
- `async function revertProposalWithLease`
- `export interface ReopenOptions`
- `function staleRefusal(check: () => void): string | undefined`
- `function reopenRefusal(config: AkmConfig, proposal: Proposal, queueTarget?: ResolvedWriteTarget): string | undefined`
- `function retireHeldRefs(proposal: Proposal): string[]`
- `function retireConflict(proposal: Proposal, held: Map<string, string>): string | undefined`
- `export function reopenProposals`
- `export interface ProposalDiff`
- `export function diffProposal`
- `export function diffLoadedProposal`
- `function resolveAssetFilePathSafe(source: WriteTargetSource, ref: AssetRef): string | undefined`

## src/commands/proposal/validators/

### src/commands/proposal/validators/proposal-quality-validators.ts

- `function refNameTail(inputRef: string): string`
- `export interface DescriptionValidationOptions`
- `export function isValidDescription`
- `export function isValidWhenToUse(value: unknown, inputRef: string):`
- `export function detectDoubleFrontmatter(content: string):`
- `export function validateProposalFrontmatter(fm: Record<string, unknown>):`
- `export function hasSupersededStatus(frontmatter: Record<string, unknown> | undefined): boolean`
- `export type ReflectSizeOutcome`
- `export function checkReflectSize(sourceBody: string | undefined, proposedBody: string): ReflectSizeOutcome`
- `export function lessonQualityIssues`
- `function advisory(validator: ProposalValidator): ProposalValidator`

### src/commands/proposal/validators/proposal-validators.ts

- `type CanonicalProposalValidator = (proposal: Proposal, ctx: ProposalValidationContext) => ProposalValidationFinding[];`
- `export function hasCanonicalProposalValidator(type: string): boolean`
- `export function runProposalValidators`

### src/commands/proposal/validators/proposals.ts

- `export function validateProposal(proposal: Proposal): ProposalValidationReport`
- `export function repairProposalContent(content: string): string`

## src/commands/read/

### src/commands/read/curate.ts

- `export type CurateSupportRef =`
- `export type CuratedStashItem =`
- `export type CuratedRegistryItem =`
- `export type CuratedItem = CuratedStashItem | CuratedRegistryItem;`
- `export interface CurateResponse`
- `export interface CurateOptions extends RecallOptions`
- `function logCurateEvent`
- `export async function akmCurate(options: CurateOptions): Promise<CurateResponse>`
- `export async function curateSearchResults`
- `export interface PackedCurateItem`
- `export interface CuratePackResult`
- `export async function packCuratedHits(result: CurateResponse, budgetTokens: number): Promise<CuratePackResult>`
- `function evidenceRef(item:`
- `async function enrichCuratedStashHit`
- `function buildCuratedRegistryItem(query: string, hit: RegistrySearchResultHit): CuratedRegistryItem`
- `function firstNonEmpty(values: Array<string | undefined>): string | undefined`
- `function buildCuratedPreview(shown: ShowResponse | undefined, hit: SourceSearchHit): string | undefined`
- `function buildCuratedReason(query: string, type: string): string`
- `function buildCurateSummary(query: string, items: CuratedItem[]): string`
- `function rerankTopN(config: ReturnType<typeof loadConfig>): number`
- `async function maybeRerankCuratedStashHits(query: string, hits: SourceSearchHit[]): Promise<SourceSearchHit[]>`
- `function rerankDocumentTexts(hits: SourceSearchHit[]): string[]`
- `async function buildCurateSupportRefs`
- `function supportRefType(ref: string): string | undefined`

### src/commands/read/knowledge.ts

- `export function normalizeMarkdownAssetName(name: string | undefined, fallback: string): string`
- `function slugifyAssetName(value: string, fallbackPrefix: string): string`
- `export function inferAssetName(content: string, fallbackPrefix: string, preferred?: string): string`
- `export function readKnowledgeContent(source: string):`
- `export async function readKnowledgeInput`
- `interface ParsedWriteRef`
- `function parseWriteRef(raw: string, flag: "--xref" | "--supersedes"): ParsedWriteRef`
- `function parseWriteRefs(rawRefs: string[], flag: "--xref" | "--supersedes"): ParsedWriteRef[]`
- `interface WriteRefRoot`
- `function resolveWriteRefRoots(target?: string, targetFlag?: string):`
- `function rootsForWriteRef(parsed: ParsedWriteRef, roots: WriteRefRoot[]): WriteRefRoot[]`
- `function canonicalWriteRef(parsed: ParsedWriteRef, bundleId: string): string`
- `function isFailOpenRefType(type: string, name: string): boolean`
- `function locateWriteRefInRoot(type: string, name: string, root: string): string | null`
- `function unresolvedRefsError(flag: "--xref" | "--supersedes", unresolved: ParsedWriteRef[]): UsageError`
- `export function resolveXrefsForWrite(rawXrefs: string[], target?: string, targetFlag?: string): string[]`
- `export function mergeXrefsIntoContent(content: string, xrefs: string[]): string`
- `function isParseableYamlMapping(frontmatter: string): boolean`
- `export interface SupersededTarget`
- `export function resolveSupersedesWriteTarget`
- `export function resolveSupersedesForWrite(rawRefs: string[], target?: string, targetFlag?: string): SupersededTarget[]`
- `interface MarkdownAssetWriteOptions`
- `interface MarkdownAssetWriteResult`
- `export async function writeMarkdownAsset(options: MarkdownAssetWriteOptions): Promise<MarkdownAssetWriteResult>`

### src/commands/read/registry-search.ts

- `export interface RegistrySearchOptions`
- `export async function searchRegistry(query: string, options?: RegistrySearchOptions): Promise<RegistrySearchResponse>`
- `export function resolveRegistries(configRegistries?: RegistryConfigEntry[]): RegistryConfigEntry[]`
- `function createProvider(entry: RegistryConfigEntry, warnings: string[])`
- `function normalizeScores(hits: Array<`
- `function clampLimit(limit: number | undefined): number`
- `function isCompleteHit(hit: RegistrySearchHit | undefined | null): hit is RegistrySearchHit`

### src/commands/read/remember-cli.ts

- `async function fetchSimilarMemories`

### src/commands/read/search-cli.ts

- `export async function runCurate`
- `function formatCuratePackText(packed: CuratePackResult): string`
- `function rejectExtraShowPositionals(positionals: unknown, ref: string): void`
- `export function parseFragmentContextMode(raw: string | undefined): FragmentContextMode`

### src/commands/read/search.ts

- `function duplicateConceptWarnings(hits: SourceSearchHit[], defaultBundle?: string): string[]`
- `interface SearchEventLoggingInput`
- `export async function akmSearch(input:`
- `function usageSearchMode(mode: SearchExecutionMode | undefined): "semantic" | "keyword"`
- `function maybeLogSearchEvent`
- `function resolveEntryIds`
- `function logSearchEvent`
- `function assertNamedSourceExists(config: AkmConfig, namedSourceName: string): void`
- `function normalizeLimit(limit?: number): number`
- `export function parseSearchSource(source: SearchSource | string | undefined): SearchSource | string`
- `export function parseBeliefFilterMode(value: string | undefined): BeliefFilterMode`
- `export function normalizeScopeFilters(raw: StashEntryScope | undefined): StashEntryScope | undefined`
- `export function parseScopeFilterFlags(values: string[], flagName = "--filter"): StashEntryScope | undefined`
- `export function entryMatchesScopeFilters`

### src/commands/read/show.ts

- `export async function akmShowUnified(input:`
- `async function showStashMeta(metaRef: MetaRef, readOnly = false): Promise<ShowResponse>`
- `function hasAnyScopeKey(scope: StashEntryScope): boolean`
- `function validateFragmentContextRequest(input:`
- `function enforceScopeOrThrow(filePath: string, ref: string, scope: StashEntryScope): void`
- `export async function showLocal(input:`
- `function showLinks(itemRef: string, defaultBundle: string | undefined, readOnly = false): Pick<ShowResponse, "links">`
- `function groupLinks`
- `function warnSensitiveFragmentUnsupported(ref: BundleRef): void`
- `interface UnrecognizedScriptSource`
- `function findUnrecognizedScriptSource`
- `export async function showByRef(ref: string): Promise<`
- `function throwIndexedPathNotFound(error: unknown, ref: string): never`
- `type IndexedEntry = NonNullable<Awaited<ReturnType<typeof lookupBundleRef>>>;`
- `function rendererForIndexedEntry(entry: IndexedEntry, _file: FileContext): string | null | undefined`
- `function indexedMatch(entry: IndexedEntry, renderer: string): MatchResult`
- `function buildIndexedProjectionResponse`
- `function applyMarkdownFragment`
- `function applyMarkdownResponsePayload(response: ShowResponse, content: string): void`
- `function requireMarkdownSection`
- `function buildBriefResponse(full: ShowResponse, assetPath?: string): ShowResponse`
- `function buildSummaryResponse(full: ShowResponse, assetPath?: string): ShowResponse`
- `function fragmentResponseProjection(full: ShowResponse): Partial<ShowResponse>`

## src/commands/sources/

### src/commands/sources/add-cli.ts

- `export function buildWebsiteOptions(args: Record<string, unknown>):`
- `export function shouldWarnOnPlainHttp(ref: string): boolean`

### src/commands/sources/bundle-cli.ts

- `function parseKindFilter(raw: string | undefined): SourceKind[] | undefined`
- `export function isSkippableBundleUpdateLock(error: unknown): error is TransientError`

### src/commands/sources/bundle-config-ops.ts

- `export interface BundleInsertPosition`
- `export function placeBundle`
- `export function withPrimaryBundle(config: AkmConfig, stashDir: string): AkmConfig`
- `export function bundleKeyForPath(config: AkmConfig, resolvedPath: string): string | undefined`
- `export function bundleKeyForUrl(config: AkmConfig, url: string): string | undefined`
- `export function nextBundleKey`

### src/commands/sources/info.ts

- `export function assembleInfo(options?:`
- `function safeTargets(config: AkmConfig): TargetRow[]`
- `function safePath(fn: () => string): string`
- `function readIndexStats(resolvedPath: string): InfoResponse["indexStats"]`
- `function describeIndexReadFailure(err: unknown): string`

### src/commands/sources/init.ts

- `function assertInitSandbox(stashDir: string, dirExplicitlyProvided: boolean): void`
- `export interface InitResponse`
- `export function _setAkmInitForTests(fake?: typeof akmInitReal): void`
- `export async function akmInit(options?:`
- `async function akmInitReal(options?:`
- `function ensureGitRepo(dir: string): void`

### src/commands/sources/installed-stashes.ts

- `interface ManagedInstall`
- `function listManagedInstalls(config: AkmConfig): ManagedInstall[]`
- `function resolveManagedTarget(config: AkmConfig, target: string): ManagedInstall | undefined`
- `function describeBundleSource(entry: BundleConfigEntry): SourceDescriptor`
- `function describeComponents(entry: BundleConfigEntry, bundleRoot: string | undefined): SourceComponent[]`
- `function describeLock(entry: LockfileEntry | undefined): SourceLock | null`
- `interface BundleCounts`
- `function readBundleCounts(): Map<string, BundleCounts>`
- `export async function akmListSources(input?:`
- `export async function akmRemove(input:`
- `type IndexResult = Awaited<ReturnType<typeof akmIndex>>;`
- `type ConfiguredSource = ReturnType<typeof getSources>[number];`
- `type UpdateIndexSummary = Pick<IndexResult, "mode" | "totalEntries" | "directoriesScanned" | "directoriesSkipped"> &`
- `function readCurrentIndexSummary(): UpdateIndexSummary`
- `function buildUpdateResponse`
- `function incompleteFilesystemOutcome(id: string): UpdateSkippedItem`
- `interface StagedUpdate`
- `function createStagingParent(parent: string): string`
- `function bundleComponent(config: AkmConfig, id: string):`
- `function gitOrThrow(repoDir: string, args: string[]): string`
- `function fastForwardCheckout(liveRepo: string, stagedRepo: string): void`
- `function reindexAfterUpdate(stashDir: string): Promise<IndexResult>`
- `function publishAndIndex(stashDir: string, publish: () => Promise<void> | void): Promise<IndexResult>`
- `function managedCredential(managed: ManagedInstall): string | undefined`
- `async function unchangedManagedItem(managed: ManagedInstall, force: boolean): Promise<UpdateResultItem | undefined>`
- `async function stageManagedUpdate`
- `const toLive = (candidate: string): string`
- `async function syncGitPlainSource`
- `async function syncWebsitePlainSource`
- `async function updateGitSource`
- `async function updateWebsiteSource`
- `async function updateFilesystemSource`
- `function managedInstallViewOfPlainNpm(config: AkmConfig, npmSource: ConfiguredSource): ManagedInstall`
- `async function updateManagedInstall`
- `function pruneOlderRevisions(previousRoot: string, currentCacheDir: string): void`
- `function referencesRoot(target: string, config: AkmConfig, locks: LockfileEntry[]): boolean`
- `function isRootAtOrBelow(candidate: string, root: string): boolean`
- `export async function akmUpdate(input?:`
- `function sourceKindForInstall(source: InstallKind): SourceKind`
- `function updateFailureOutcome(id: string, kind: SourceKind, error: unknown): UpdateSkippedItem`
- `function selectManagedTargets`
- `function cleanupDirectoryBestEffort(target: string, context: string): void`
- `function directoryExists(target: string): boolean`

### src/commands/sources/migration-help.ts

- `function releaseNotesDir(): string`
- `function loadChangelog(): string | undefined`
- `function loadReleaseNote(version: string): string | undefined`
- `function isSafeVersionComponent(version: string): boolean`
- `function normalizeRequestedVersion(input: string): string`
- `function versionCandidates(requested: string): string[]`
- `function resolveLatestVersion(changelog: string): string | undefined`
- `function extractChangelogSection(changelog: string, version: string): string | undefined`
- `function escapeRegexString(value: string): string`
- `function fallbackGuide(version: string): string`
- `export function renderMigrationHelp(versionInput: string, changelogText = loadChangelog()): string`
- `export function listBundledReleaseVersions(): string[]`

### src/commands/sources/plugin-upgrade.ts

- `type CommandFailure = { ok: false; missing: boolean; error: string };`
- `type CommandResult = { ok: true; stdout: string } | CommandFailure;`
- `function runCommand(command: string, args: string[], timeoutMs: number, opts?:`
- `function parseJson(text: string): unknown`
- `function skipped(harness: PluginUpgradeEntry["harness"], message: string): PluginUpgradeEntry`
- `function failed(harness: PluginUpgradeEntry["harness"], message: string): PluginUpgradeEntry`
- `function refreshed(harness: PluginUpgradeEntry["harness"], from: string | undefined, to: string | undefined)`
- `function unknownRefresh(harness: PluginUpgradeEntry["harness"], from: string | undefined): PluginUpgradeEntry`
- `type Detected = { entry: PluginUpgradeEntry } | { version: string | undefined; ref: string | undefined };`
- `function claudePluginVersion():`
- `function detectClaudeCode(): Detected`
- `function upgradeClaudeCode(dryRun: boolean, next: boolean): PluginUpgradeEntry`
- `function refreshClaudeCode(dryRun: boolean, from: string | undefined): PluginUpgradeEntry`
- `function codexPluginVersion():`
- `function codexMarketplaceRef(): string | undefined`
- `function upgradeCodex(dryRun: boolean, next: boolean): PluginUpgradeEntry`
- `function refreshCodex(dryRun: boolean, from: string | undefined): PluginUpgradeEntry`
- `` const nextSpec = (flavor: OpenCodeFlavor) => `$ ``
- `export interface OpenCodeCache`
- `export type OpenCodeLatest = { version: string; akmCli: string | undefined } | { error: string };`
- `function entrySpec(entry: unknown): string | undefined`
- `` const namesPackage = (spec: string, pkg: string) => spec === pkg || spec.startsWith(`$ ``
- `export function openCodeConfigSpec(flavor: OpenCodeFlavor):`
- `function openCodeV2Cached(): boolean`
- `export function detectOpenCodeCache(tag: UpgradeChannel, flavor: OpenCodeFlavor): OpenCodeCache | undefined`
- `export function lookupOpenCodeLatest(tag: UpgradeChannel, flavor: OpenCodeFlavor): OpenCodeLatest`
- `export function usesHostCache(pid: string, procRoot = "/proc"): boolean`
- `function openCodeRunning(): boolean | undefined`
- `const notFollowingNext = (flavor: OpenCodeFlavor)`
- `function otherSpecNote(flavor: OpenCodeFlavor, spec: string): string`
- `function upgradeOpenCode(dryRun: boolean, target: OpenCodeTarget): PluginUpgradeEntry`
- `function withChannelNote(entry: PluginUpgradeEntry, ref: string | undefined, howToSwitch: string): PluginUpgradeEntry`
- `export interface OpenCodeTarget`
- `export function upgradePlugins(opts:`
- `export function applyLockstep<T extends UpgradeCheckResponse>`
- `function lockstepSource(targets: OpenCodeTarget[]): OpenCodeTarget | undefined`
- `const readable = (t: OpenCodeTarget): t is OpenCodeTarget &`
- `export interface UpgradeRunDependencies`
- `export type UpgradeRunResult`
- `function resolveOpenCodeTarget`
- `const leftAlone = (skip: string): OpenCodeTarget =>`
- `function resolveOpenCodeTargets(next: boolean): OpenCodeTarget[]`
- `export async function runUpgrade`

### src/commands/sources/schema-repair.ts

- `export interface SchemaRepairFailure`
- `export type SchemaRepairOutcome = "queued" | "skipped" | "error";`
- `export interface SchemaRepairRecord`
- `export interface SchemaRepairOptions`
- `interface EligibleSchemaRepair`
- `async function classifySchemaRepairs(args:`
- `export async function runSchemaRepairPass`
- `const noticeFields = ():`
- `function defaultIsLessonCandidate(ref: string): boolean`
- `async function defaultFindFilePath(ref: string, stashDir?: string): Promise<string | null>`

### src/commands/sources/self-update.ts

- `export type InstallMethod = UpgradeCheckResponse["installMethod"];`
- `export interface SelfUpdateDependencies`
- `export async function streamResponseToFile`
- `export interface InstallSignals`
- `export function getInstallSignals(): InstallSignals`
- `function resolveNpmGlobalRootForThisProcess(): string | undefined`
- `function isUnderDirectory(dir: string, root: string): boolean`
- `const real = (value: string): string =>`
- `function packageLocalRoot(importMetaDir: string): string`
- `export function detectInstallMethod(signals?: InstallSignals): InstallMethod`
- `export function getAkmBinaryName(): string`
- `async function lookupNextVersion(fetchOptions?:`
- `export async function checkForUpdate`
- `function checksumBypassRequested(): boolean`
- `export async function performUpgrade`
- `async function runMigrationStep(runTool: typeof runMigrationTool): Promise<NonNullable<UpgradeResponse["migration"]>>`
- `function runPostUpgradeTasks(akmBin: string, opts:`
- `async function runPackageManagerUpgrade(input:`
- `function readInstalledCliVersion(akmBin: string): string | undefined`
- `function removeFileBestEffort(filePath: string): void`
- `function parseChecksumForFile(checksumsText: string, filename: string): string | undefined`
- `function normalizePathSeparators(value: string | undefined): string`
- `function getInstalledPackageName(): string`
- `function resolveNodePackageManagerCommand(name: "npm" | "pnpm"): string`
- `export function getPackageManagerUpgradeCommand`

### src/commands/sources/source-add.ts

- `export async function akmAdd`
- `async function addLocalSource`
- `async function addWebsiteSource`
- `const numberOption = (value: unknown): number | undefined`
- `async function addRegistryStash`
- `export function upsertInstalledRegistryEntry`
- `export async function removeInstalledRegistryEntry(id: string): Promise<AkmConfig>`
- `function findInstalledBundleKey(bundles: Record<string, BundleConfigEntry>, installId: string): string | undefined`
- `function resolveInstalledBundleKey`
- `function toReadableId(resolvedPath: string): string`
- `export function shouldAddAsWebsiteUrl(ref: string): boolean`
- `function isLikelyGitRepositoryUrl(ref: string): boolean`
- `function toWebsiteName(siteUrl: string): string`

### src/commands/sources/source-clone.ts

- `export interface CloneOptions`
- `export interface CloneResponse`
- `function destinationRef`
- `export async function akmClone(options: CloneOptions): Promise<CloneResponse>`
- `function resolveOpaqueAsset(source: SearchSource, conceptId: string):`
- `function placementTypeForOpaque(sourceRef: string, sourcePath: string, indexedType: string | undefined): string`
- `function slugName(conceptId: string): string`
- `function stampCloneOrigin(filePath: string, originRef: string | undefined): void`
- `function lstatIfExists(filePath: string): fs.Stats | undefined`
- `function assertNoDestinationSymlinkParent(root: string, destination: string): void`
- `function materializeFileLinks(root: string): void`
- `function listTreeFiles(root: string): string[]`

### src/commands/sources/source-manage.ts

- `export interface SourceAddResult`
- `export interface SourceRemoveResult`
- `export function addStash`
- `function urlBundleDescriptor`
- `export function removeStash(target: string): SourceRemoveResult`

### src/commands/sources/sources-cli.ts

- `async function runSyncBody(args:`

### src/commands/sources/stash-cli.ts

- `const abort = (): void`

### src/commands/sources/stash-skeleton.ts

- `export function copyStashSkeleton(stashDir: string): void`
- `function copySkeletonDir(srcDir: string, destDir: string): void`
- `export function scaffoldStashMeta(stashDir: string): void`
- `export function ensureStashGitignore(stashDir: string): void`

## src/commands/tasks/

### src/commands/tasks/explain.ts

- `export interface TaskExplainOptions`
- `type SuppliedValueProvenance = "default" | "flag";`
- `interface SuppliedInputRow`
- `interface ScheduleInputRow`
- `interface InputDeclarationRow`
- `interface ScheduleBindingRow`
- `interface ExecutionSettingsSection`
- `export interface TaskExplainEnvelope`
- `function isSecretShapedValue(name: string, value: unknown): boolean`
- `function redactIfSecretShaped(name: string, value: unknown): Readonly<`
- `function declarationType(schema: Readonly<Record<string, unknown>>): string | undefined`
- `function declarationEnum(schema: Readonly<Record<string, unknown>>): readonly unknown[] | undefined`
- `function redactEnum`
- `function buildInputDeclarations(contract: InputContract): Record<string, InputDeclarationRow>`
- `function buildSuppliedInputs`
- `function targetSection(document: PreparableTaskDocument): Readonly<`
- `function isCommandTarget(document: PreparableTaskDocument): boolean`
- `function currentExecutionValues(document: PreparableTaskDocument, bundleName: string): Record<string, unknown>`
- `function qualifyInBundle(ref: string, bundleName: string): string`
- `function storedCommandRef(document: PreparableTaskDocument): string | undefined`
- `async function resolveExecutionSettings`
- `export async function akmTaskExplain(ref: string, options: TaskExplainOptions`

### src/commands/tasks/tasks-cli.ts

- `function hasFlagNamed(name: string): boolean`
- `function rejectExplainScheduledFlag(): void`
- `export function parseTaskInputFlags(rawArgs: readonly string[], id: string): InputFlag[]`
- `export function resolveTaskHistoryId(positional: string | undefined, flag: string | undefined): string | undefined`
- `export function taskSyncDryRunExitCode(preview:`
- `export function taskPruneExitCode(result:`

### src/commands/tasks/tasks.ts

- `export interface TasksAddInput`
- `export interface TasksAddResult`
- `export interface TaskMutationDeps`
- `export interface PreparedSchedulerRuntime`
- `type SchedulerDeps = Pick<TaskMutationDeps, "backend" | "schedulerRuntime">;`
- `export async function akmTasksAdd(input: TasksAddInput, deps: TaskMutationDeps`
- `function assertTaskAddTargetShape(input: TasksAddInput): void`
- `export interface TasksRunResultEnvelope`
- `export async function akmTasksRun`
- `export interface TasksActivationResult`
- `function resolveTaskActivation`
- `async function ensureSchedulerChoice(deps:`
- `function initializeSchedulerChoice`
- `export async function akmTasksEnable`
- `export async function akmTasksDisable`
- `async function setTaskActivation`
- `export interface TasksHistoryResult`
- `export async function akmTasksHistory(input:`
- `export interface TasksSyncResult`
- `export async function akmTasksSync`
- `const applied = (ids: readonly string[])`
- `export async function akmTasksSyncPlan`
- `async function buildSchedulerSyncPlan`
- `function prepareSchedulerRuntime(deps: SchedulerDeps):`
- `async function listInstalledRows(sched: SchedulerBackend): Promise<InstalledSchedulerBinding[]>`
- `function installedRowBundleDir(row: InstalledSchedulerBinding): string | undefined`
- `function bundleScope(bundleName: string, stashDir: string): SchedulerBundleScope`
- `function installedSchedulerBundle(config: AkmConfig, row: InstalledSchedulerBinding): string | undefined`
- `export type TasksPruneReason = "invalid-context" | "dead-bundle-path";`
- `export interface TasksPruneResult`
- `function classifyPruneCandidate(entry: InstalledSchedulerBinding): TasksPruneReason | undefined`
- `export async function akmTasksPrune`
- `const prune = async (): Promise<TasksPruneResult> =>`
- `function pruneOperations`
- `export interface TasksDoctorResult`
- `export async function akmTasksDoctor`
- `function groupInstalledBindings(entries: readonly InstalledSchedulerBinding[]): TasksDoctorResult["bindings"]`
- `function inspectInstalledBinding(entry: InstalledSchedulerBinding): string[]`
- `function taskAssetRef(id: string): AssetRef`
- `function resolveTaskBundle(target: string | undefined)`
- `function taskProjectionAssetResolver`
- `export function resolveTaskReadBundle`
- `function isPrimaryStashPath(candidate: string): boolean`
- `function errorMessage(cause: unknown): string`
- `interface RenderInput`
- `function jsonSchemaTypeOf(value: unknown): string`
- `function renderInputsFromParams(params: Record<string, unknown>): Record<string, unknown>`
- `function renderTaskYaml(input: RenderInput): string`
- `function assertInlineTaskPrompt(input: string): void`
- `function parseJsonObjectArg(raw: string): Record<string, unknown>`
- `export function parseTaskRef(input: string):`
- `export function taskIdForAdapter(parsedId: string, adapterId: string): string`

## src/commands/ui/

### src/commands/ui/api.ts

- `export interface UiServerInfo`
- `type Query = URLSearchParams;`
- `type Handler = (query: Query, info: UiServerInfo) => unknown | Promise<unknown>;`
- `function limitParam(query: Query, fallback = DEFAULT_LIST_LIMIT): number`
- `function flag(query: Query, name: string): boolean`
- `function withReadonlyStateDb<T>(fn: (db: Database) => T, fallback: T): T`
- `function tryStashDir(): string | null`
- `async function section<T>(errors: Record<string, string>, name: string, fn: () => T | Promise<T>): Promise<T | null>`
- `function meta(_query: Query, info: UiServerInfo)`
- `function summarizeImproveRun(row: ReturnType<typeof listRecentImproveRuns>[number])`
- `function usageByDay(db: Database, nowMs: number)`
- `async function overview(query: Query)`
- `async function bundles()`
- `interface ConfigEntry`
- `function configLeaves(value: unknown, prefix: string[], out: Array<`
- `function configSource(path: string[]): string | null`
- `function config()`
- `const named = (entries: unknown)`
- `export function proposalSummary(proposal: Proposal)`
- `function proposals(query: Query)`
- `function targetsSensitiveAsset(proposal: Proposal): boolean`
- `function capSide(text: string | null):`
- `function proposalDiffView(proposal: Proposal)`
- `function proposalDetail(id: string)`
- `async function changes(query: Query)`
- `async function search(query: Query)`
- `function durableRefForPath(filePath: string): string | null`
- `function feedbackFor(durableRef: string | null)`
- `async function asset(query: Query)`
- `async function assetHistory(query: Query)`
- `export async function handleApiRequest(pathname: string, query: Query, info: UiServerInfo): Promise<unknown>`

### src/commands/ui/document-source.ts

- `export async function readDocumentSource(ref: string): Promise<`

### src/commands/ui/git-read.ts

- `function git(repoDir: string, args: string[]): Promise<string | null>`
- `export function isGitRoot(dir: string): boolean`
- `export interface GitCommitSummary`
- `export interface BundleGitStatus`
- `export async function readBundleGitStatus(repoDir: string): Promise<BundleGitStatus | null>`
- `export type ChangeOrigin = "improve-sync" | "accept" | "remember" | "sync" | "other";`
- `export function classifyCommitOrigin(subject: string): ChangeOrigin`
- `export interface StashCommit extends GitCommitSummary`
- `export async function readRecentCommits(repoDir: string, limit: number, file?: string): Promise<StashCommit[] | null>`
- `export async function readFileRevision(repoDir: string, file: string, sha: string)`

### src/commands/ui/open-browser.ts

- `export function browserOpener(url: string, platform: NodeJS.Platform = process.platform): [string, string[]]`
- `export function openBrowser(url: string): Promise<boolean>`

### src/commands/ui/proposal-actions.ts

- `export type WriteRoute = { kind: "accept"; id: string } | { kind: "reject"; id: string } | { kind: "accept-many" };`
- `export function matchWriteRoute(pathname: string): WriteRoute | null`
- `export interface ProposalActionError`
- `function codeForMessage(message: string): string | null`
- `export function classifyProposalError(error: unknown): ProposalActionError`
- `function bodyObject(body: unknown): Record<string, unknown>`
- `function rejectReason(body: unknown): string`
- `function batchIds(body: unknown): string[]`
- `export async function assertWriteLeaseFree(purpose: string): Promise<void>`
- `type CommitSummary = GitCommitSummary & { repo: string };`
- `async function acceptCommit(accepted: ProposalAcceptResult[], startedMs: number): Promise<CommitSummary | null>`
- `function acceptedView(result: ProposalAcceptResult)`
- `function failedView(failure: ProposalAcceptFailure)`
- `export async function handleWriteRequest(route: WriteRoute, body: unknown): Promise<unknown>`

### src/commands/ui/redact.ts

- `export function redactUrlsInText(text: string): string`
- `export function scrubUrlCredentials(value: unknown): unknown`
- `export function redactForUi(value: unknown, inSecretBag = false): unknown`
- `export function isSecretEnvName(name: string): boolean`

### src/commands/ui/server.ts

- `export interface UiServerOptions`
- `export interface UiServer extends UiServerInfo`
- `function isWildcardHost(host: string): boolean`
- `function isLoopbackHost(host: string): boolean`
- `function urlHost(host: string): string`
- `export function isLoopbackBind(host: string): boolean`
- `function hostAllowed(header: string | undefined, host: string, port: number): boolean`
- `function tokenMatches(given: string | null | undefined, expected: string): boolean`
- `function sendJson`
- `function sendError`
- `function originAllowed(origin: string | undefined, hostHeader: string | undefined): boolean`
- `function isJsonContentType(header: string | undefined): boolean`
- `function readBody(req: http.IncomingMessage, limit: number): Promise<string | null>`
- `function statusFor(error: unknown): number`
- `function readUiAsset(urlPath: string):`
- `export async function startUiServer(options: UiServerOptions`
- `async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void>`
- `async function handleWrite`

### src/commands/ui/ui-cli.ts

- `function parsePort(raw: string | undefined): number`
- `const stop = () =>`

### src/commands/ui/workspace-actions.ts

- `export type WorkspaceAction`
- `export function matchWorkspaceAction(path: string): WorkspaceAction | null`
- `function object(value: unknown): Record<string, unknown>`
- `function text(body: Record<string, unknown>, key: string): string`
- `function positional(body: Record<string, unknown>, key: string): string`
- `function preserveUnrelatedConfig(config = loadConfig())`
- `class CommandError extends AkmError`
- `export function parseCommandResponse(stdout: string, expectedShape: string): unknown`
- `export function classifyWorkspaceError(error: unknown): ProposalActionError`
- `async function command(args: string[], input?: string, userFeedback = false): Promise<unknown>`
- `function settings(body: Record<string, unknown>)`
- `export async function handleWorkspaceAction(action: WorkspaceAction, value: unknown): Promise<unknown>`

## src/commands/workflow/

### src/commands/workflow/plan.ts

- `function stepUnit(step: WorkflowPlanStep): WorkflowUnitNode | undefined`
- `function projectEnvironmentBinding(binding: FrozenWorkflowEnvironmentBinding): Record<string, unknown>`
- `function projectInputBinding(binding: TaskInputBinding): Record<string, unknown>`
- `function childExpansion(target: FrozenChildWorkflowTarget): Record<string, unknown>`
- `function stepExpansion(frozenTarget: FrozenWorkflowTarget | undefined): Record<string, unknown>`
- `function stepOrchestration`
- `function projectStep`
- `function collectLoweringNotices(plan: WorkflowPlan, config: ReturnType<typeof loadConfig>): LoweringNotice[]`
- `const lower = (target: FrozenWorkflowCommandTarget): void =>`
- `function unresolvedRefs`
- `function unresolvedInChildren(plan: WorkflowPlan): string[]`
- `function failOnUnresolved(ref: string, unresolved: readonly string[]): void`
- `export async function akmWorkflowPlan(ref: string): Promise<Record<string, unknown>>`
