---
description: "Repo map of akm src/output at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/output

## src/output/

### src/output/cli-hints.ts

### src/output/command-registry.ts

- `export interface CommandRegistryEntry<H>`
- `export interface CommandRegistry<H>`
- `export function createCommandRegistry<H>(): CommandRegistry<H>`

### src/output/context.ts

- `export type OutputFormat = "json" | "yaml" | "text" | "jsonl" | "md" | "html";`
- `export type DetailLevel = "brief" | "normal" | "full";`
- `export type ShapeMode = "human" | "agent";`
- `export interface OutputMode`
- `export interface OutputDefaults`
- `export type DetailValue = DetailLevel | "agent";`
- `function parseOutputFormat(value: string | undefined): OutputFormat | undefined`
- `export function parseDetailLevel(value: string | undefined): DetailValue | undefined`
- `export function parseFlagValue(argv: string[], flag: string): string | undefined`
- `export function hasBooleanFlag(argv: string[], flag: string): boolean`
- `export function getHyphenatedArg<T = string>(args: unknown, key: string): T | undefined`
- `export function getHyphenatedBoolean(args: unknown, key: string): boolean`
- `export function resolveOutputMode(argv: string[], defaults: OutputDefaults | undefined`
- `export function initOutputMode(argv: string[], defaults: OutputDefaults | undefined`
- `export function getOutputMode(): OutputMode`
- `export function resetOutputMode(): void`

### src/output/format-exempt.ts

- `export function isFormatExemptCommand(commandPath: readonly string[]): boolean`
- `export function formatExemptSurfaces():`

### src/output/generic-render.ts

- `type TableRow = Record<string, unknown>;`
- `function isTabular(value: unknown): value is TableRow[]`
- `function tableColumns(rows: readonly TableRow[]): string[]`
- `function displayScalar(value: unknown): string`
- `function escapeCell(text: string): string`
- `function markdownTable(rows: readonly TableRow[]): string[]`
- `function markdownValue(value: unknown, depth: number): string[]`
- `export function renderGenericMarkdown(command: string, value: unknown): string`
- `function htmlTable(rows: readonly TableRow[]): string`
- `function htmlValue(value: unknown, depth: number): string`
- `export function renderGenericHtml(command: string, value: unknown): string`
- `export function flattenForText(value: unknown, path: string, lines: string[]): void`
- `export function renderGenericText(command: string, value: unknown): string`

### src/output/html-render.ts

- `export function resolveTemplatePath(command: string): string`
- `export function renderHtml(templatePath: string, replacements: Record<string, string>): string`
- `function readTemplate(templatePath: string): string`
- `export function escapeHtml(value: string): string`
- `export function isoTimeTag(iso: string): string`
- `export function deliverRendered(content: string, outputPath: string | undefined): void`

### src/output/render-registry.ts

- `export type DocumentRendererHandler = (result: unknown, detail: DetailLevel) => string | null;`
- `export function registerMdRenderer(command: string, handler: DocumentRendererHandler): void`
- `export function getMdRendererHandler(command: string): DocumentRendererHandler | undefined`

### src/output/renderers.ts

- `export interface ExecHints`
- `export function extractCommentTags(filePath: string): ExecHints`
- `export function detectExecHints(filePath: string): ExecHints`
- `export function resolveExecHints(stashEntry: IndexDocument | undefined, filePath: string): ExecHints`
- `function deriveName(ctx: RenderContext): string`
- `function extractParameters(template: string): string[] | undefined`
- `function readFrontmatterTags(value: unknown): string[] | undefined`
- `export function registerBuiltinRenderers(): void`

### src/output/shapes.ts

- `export type OutputCommandName = string;`
- `function withResultsAlias(command: OutputCommandName, shaped: unknown): unknown`
- `export function shapeForCommand`

### src/output/stdout.ts

- `export function writeStdout(document: string): void`
- `export function stdoutText(document: string): string`

### src/output/text.ts

- `export function outputJsonl(command: string, shaped: unknown): void`
- `export function formatPlain(command: OutputCommandName, result: unknown, detail: DetailLevel): string | null`

## src/output/shapes/

### src/output/shapes/curate.ts

- `function shapeCurateItem`
- `export function shapeCurateOutput`

### src/output/shapes/env-list.ts

### src/output/shapes/events.ts

- `const handler = (result: unknown, detail: Parameters<typeof shapeEventsOutput>[1])`

### src/output/shapes/helpers.ts

- `export function shapeProposalProducerOutput`
- `export function shapeProposalEntry(entry: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>`
- `export function shapeProposalListOutput(result: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>`
- `export function shapeProposalShowOutput(result: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>`
- `export function shapeProposalAcceptOutput`
- `export function shapeProposalRejectOutput`
- `export function shapeProposalDiffOutput(result: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>`
- `export function shapeEventsOutput(result: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>`
- `export function shapeEventEntry(entry: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>`
- `export function shapeSearchOutput`
- `export function shapeSearchHit(hit: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>`
- `export function shapeSearchHitForAgent(hit: Record<string, unknown>): Record<string, unknown>`
- `export function capDescription(hit: Record<string, unknown>, limit: number): Record<string, unknown>`
- `export function truncateDescription(description: string, limit: number): string`
- `export function shapeShowOutput`
- `export function pickFields(source: Record<string, unknown>, fields: string[]): Record<string, unknown>`

### src/output/shapes/migrate.ts

- `const identity: OutputShapeEntry["handler"] = (result)`

### src/output/shapes/passthrough.ts

- `function makeStampHandler(command: string)`

### src/output/shapes/registry.ts

- `export type OutputShapeHandler = (result: unknown, detail: DetailLevel, shape: ShapeMode) => unknown;`
- `export interface OutputShapeEntry`
- `export function registerOutputShape(command: string, handler: OutputShapeHandler): void`
- `export function registerOutputShapes(entries: Iterable<OutputShapeEntry>): void`
- `export function deregisterOutputShape(command: string): void`
- `export function getOutputShapeHandler(command: string): OutputShapeHandler | undefined`

### src/output/shapes/search.ts

### src/output/shapes/secret-list.ts

### src/output/shapes/show.ts

## src/output/shapes/proposal/

### src/output/shapes/proposal/accept.ts

### src/output/shapes/proposal/diff.ts

### src/output/shapes/proposal/list.ts

### src/output/shapes/proposal/producer.ts

- `const handler = (result: unknown, detail: Parameters<typeof shapeProposalProducerOutput>[1])`

### src/output/shapes/proposal/reject.ts

### src/output/shapes/proposal/reopen.ts

### src/output/shapes/proposal/show.ts

## src/output/text/

### src/output/text/add.ts

### src/output/text/bundle-create.ts

### src/output/text/bundle-rename.ts

### src/output/text/bundle-show.ts

### src/output/text/clone.ts

### src/output/text/command-format.ts

- `export function formatInfoPlain(r: Record<string, unknown>): string`
- `export function formatConfigPlain(r: Record<string, unknown>): string`
- `const walk = (obj: Record<string, unknown>, prefix: string): void =>`
- `export function formatFeedbackPlain(r: Record<string, unknown>): string`
- `export function formatRememberPlain(r: Record<string, unknown>): string`
- `export function formatImportPlain(r: Record<string, unknown>): string`
- `export function formatSyncPlain(r: Record<string, unknown>): string`
- `export function formatRegistryListPlain(r: Record<string, unknown>): string`
- `export function formatRegistryAddPlain(r: Record<string, unknown>): string`
- `export function formatRegistryRemovePlain(r: Record<string, unknown>): string`
- `export function formatEnvListPlain(r: Record<string, unknown>): string`
- `export function formatEnvCreatePlain(r: Record<string, unknown>): string`
- `export function formatEnvExportPlain(r: Record<string, unknown>): string`
- `export function formatEnvRemovePlain(r: Record<string, unknown>): string`
- `export function formatEventsPlain(r: Record<string, unknown>): string`
- `export function formatEventLine(event: Record<string, unknown>): string`
- `export function formatSearchPlain(r: Record<string, unknown>, detail: DetailLevel): string`
- `export function formatCuratePlain(r: Record<string, unknown>, detail: DetailLevel): string`
- `export function formatInitPlain(r: Record<string, unknown>): string`
- `export function formatIndexPlain(r: Record<string, unknown>): string`
- `export function formatListPlain(r: Record<string, unknown>): string`
- `export function formatModelsPlain(r: Record<string, unknown>): string`
- `export function formatModelsSetPlain(r: Record<string, unknown>): string`
- `export function formatBundleShowPlain(r: Record<string, unknown>): string`
- `export function formatAddPlain(r: Record<string, unknown>): string`
- `function formatDeclarativeAddPlain(r: Record<string, unknown>): string`
- `export function formatRemovePlain(r: Record<string, unknown>): string`
- `export function formatBundleRenamePlain(r: Record<string, unknown>): string`
- `export function formatUpdatePlain(r: Record<string, unknown>): string`
- `function formatUpgradePluginLines(r: Record<string, unknown>): string[]`
- `export function formatUpgradePlain(r: Record<string, unknown>): string | null`
- `function formatUpgradeHead(r: Record<string, unknown>): string | null`
- `export function formatClonePlain(r: Record<string, unknown>): string`

### src/output/text/config.ts

### src/output/text/curate.ts

### src/output/text/env.ts

### src/output/text/events.ts

### src/output/text/feedback.ts

### src/output/text/health-format.ts

- `interface HealthCheckLike`
- `function evidenceLines(evidence: Record<string, unknown> | undefined): string[]`
- `function checkStatusEntry(check: HealthCheckLike, detail: DetailLevel): StatusEntry`
- `function renderCheckSection(title: string, checks: readonly HealthCheckLike[], detail: DetailLevel): string[]`
- `export function formatHealthPlain(r: Record<string, unknown>, detail: DetailLevel): string | null`

### src/output/text/health.ts

### src/output/text/helpers.ts

### src/output/text/import.ts

### src/output/text/improve-report.ts

- `function formatImproveReportPlain(result: Record<string, unknown>): string | null`

### src/output/text/index.ts

### src/output/text/info.ts

### src/output/text/lint-format.ts

- `function glyphFor(fixed: LintIssue["fixed"]):`
- `function locationOf(issue: LintIssue): string`
- `function issueEntry(issue: LintIssue): StatusEntry`
- `function renderIssueSection(title: string, issues: readonly LintIssue[]): string[]`
- `export function formatLintPlain(r: Record<string, unknown>): string | null`

### src/output/text/lint.ts

### src/output/text/list.ts

### src/output/text/metrics.ts

- `const flat = (s: string): string`
- `function renderTable(table: MetricsViewTable): string[]`
- `` const line = (r: string[]) => `  $ ``
- `export function formatMetricsPlain(result: Record<string, unknown>, detail: DetailLevel): string | null`

### src/output/text/migrate.ts

- `interface MigrationPlanResult`
- `function planGlyph(status: string): string`
- `export function formatMigratePlain(result: unknown): string | null`

### src/output/text/models.ts

### src/output/text/proposal-format.ts

- `function appendLoweringNotices(lines: string[], result: Record<string, unknown>): void`
- `export function formatProposalProducerPlain(command: string, r: Record<string, unknown>): string`
- `export function formatGateDecisionSummary(raw: unknown): string`
- `function formatGateThresholdComparison(d: Record<string, unknown>): string`
- `export function formatProposalListPlain(r: Record<string, unknown>): string`
- `function retireVerdictLines(retirement: Record<string, unknown>): string[]`
- `export function formatProposalShowPlain(r: Record<string, unknown>): string`
- `export function formatProposalAcceptPlain(r: Record<string, unknown>): string`
- `export function formatProposalRejectPlain(r: Record<string, unknown>): string`
- `export function formatProposalReopenPlain(r: Record<string, unknown>): string`
- `export function formatProposalReopenBatchPlain(r: Record<string, unknown>): string`
- `export function formatProposalDrainPlain(r: Record<string, unknown>): string`
- `export function formatProposalDiffPlain(r: Record<string, unknown>): string`

### src/output/text/registry-commands.ts

### src/output/text/registry.ts

- `export type TextFormatterHandler = (result: Record<string, unknown>, detail: DetailLevel) => string | null;`
- `export interface TextFormatterEntry`
- `export function registerTextFormatter(command: string, handler: TextFormatterHandler): void`
- `export function registerTextFormatters(entries: Iterable<TextFormatterEntry>): void`
- `export function deregisterTextFormatter(command: string): void`
- `export function getTextFormatterHandler(command: string): TextFormatterHandler | undefined`

### src/output/text/remember.ts

### src/output/text/remove.ts

### src/output/text/search.ts

### src/output/text/show-directives.ts

- `export function appendShowDirectives(lines: string[], r: Record<string, unknown>): void`
- `function isCommandOutputSkill(lines: string[]): boolean`

### src/output/text/show-format.ts

- `export function formatShowPlain(r: Record<string, unknown>, detail: DetailLevel): string | null`

### src/output/text/show.ts

### src/output/text/status-list.ts

- `export interface StatusEntry`
- `export function renderStatusEntries(entries: readonly StatusEntry[]): string[]`
- `export function summarizeCounts(counts: Record<string, number>, order: readonly string[]): string`

### src/output/text/sync.ts

### src/output/text/targets-table.ts

- `type Row = Record<string, unknown>;`
- `const text = (value: unknown): string`
- `const yesNo = (value: unknown): string`
- `function table(headers: readonly string[], cells: readonly (readonly string[])[]): string[]`
- `const line = (row: readonly string[])`
- `function reachable(row: Row): string`
- `function runsOn(row: Row): string`
- `function override(entry: Row): string`
- `function notes(row: Row): string`
- `interface Column`
- `function section(title: string, columns: readonly Column[], rows: readonly Row[]): string[]`
- `export function renderTargetsTable(rows: readonly unknown[]): string[]`
- `const of = (type: string)`

### src/output/text/update.ts

### src/output/text/upgrade.ts

### src/output/text/workflow-format.ts

- `export function formatWorkflowListPlain(result: Record<string, unknown>): string`
- `function renderChildNode(child: Record<string, unknown>, depth: number, lines: string[]): void`
- `function renderOrchestrationLines(value: unknown, prefix: string): string[]`
- `export function formatWorkflowStatusPlain(result: Record<string, unknown>): string | null`
- `function renderLoweringNoticeLine(value: unknown): string | null`
- `export function formatWorkflowRunPlain(result: Record<string, unknown>): string | null`
- `export function formatWorkflowCreatePlain(r: Record<string, unknown>): string | null`
- `export function formatWorkflowResumePlain(r: Record<string, unknown>): string`
- `function formatInputBindingsList(bindings: readonly Record<string, unknown>[]): string`
- `function renderPlanStepLines(step: Record<string, unknown>, ordinal: number, lines: string[], prefix = "  "): void`
- `export function formatWorkflowPlanPlain(result: Record<string, unknown>): string | null`

### src/output/text/workflow.ts

## src/output/text/proposal/

### src/output/text/proposal/producer.ts

### src/output/text/proposal/proposal.ts
