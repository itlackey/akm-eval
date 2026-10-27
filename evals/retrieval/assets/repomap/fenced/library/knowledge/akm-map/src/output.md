---
description: "Repo map of akm src/output at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  output/
    shapes/
      proposal/
        accept.ts
        diff.ts
        list.ts
        producer.ts
        reject.ts
        reopen.ts
        show.ts
      curate.ts
      env-list.ts
      events.ts
      helpers.ts
      migrate.ts
      passthrough.ts
      registry.ts
      search.ts
      secret-list.ts
      show.ts
    text/
      proposal/
        producer.ts
        proposal.ts
      add.ts
      bundle-create.ts
      bundle-rename.ts
      bundle-show.ts
      clone.ts
      command-format.ts
      config.ts
      curate.ts
      env.ts
      events.ts
      feedback.ts
      health-format.ts
      health.ts
      helpers.ts
      import.ts
      improve-report.ts
      index.ts
      info.ts
      lint-format.ts
      lint.ts
      list.ts
      metrics.ts
      migrate.ts
      models.ts
      proposal-format.ts
      registry-commands.ts
      registry.ts
      remember.ts
      remove.ts
      search.ts
      show-directives.ts
      show-format.ts
      show.ts
      status-list.ts
      sync.ts
      targets-table.ts
      update.ts
      upgrade.ts
      workflow-format.ts
      workflow.ts
    cli-hints.ts
    command-registry.ts
    context.ts
    format-exempt.ts
    generic-render.ts
    html-render.ts
    render-registry.ts
    renderers.ts
    shapes.ts
    stdout.ts
    text.ts
```

# Files

## File: src/output/shapes/proposal/accept.ts
```typescript
import { shapeProposalAcceptOutput } from "../helpers";
import type { OutputShapeEntry } from "../registry";
```

## File: src/output/shapes/proposal/diff.ts
```typescript
import { shapeProposalDiffOutput } from "../helpers";
import type { OutputShapeEntry } from "../registry";
```

## File: src/output/shapes/proposal/list.ts
```typescript
import { shapeProposalListOutput } from "../helpers";
import type { OutputShapeEntry } from "../registry";
```

## File: src/output/shapes/proposal/producer.ts
```typescript
import { shapeProposalProducerOutput } from "../helpers";
import type { OutputShapeEntry } from "../registry";
⋮----
const handler = (result: unknown, detail: Parameters<typeof shapeProposalProducerOutput>[1])
```

## File: src/output/shapes/proposal/reject.ts
```typescript
import { shapeProposalRejectOutput } from "../helpers";
import type { OutputShapeEntry } from "../registry";
```

## File: src/output/shapes/proposal/reopen.ts
```typescript
import { shapeProposalRejectOutput } from "../helpers";
import type { OutputShapeEntry } from "../registry";
```

## File: src/output/shapes/proposal/show.ts
```typescript
import { shapeProposalShowOutput } from "../helpers";
import type { OutputShapeEntry } from "../registry";
```

## File: src/output/shapes/curate.ts
```typescript
import type { DetailLevel, ShapeMode } from "../context";
import { capDescription, NORMAL_DESCRIPTION_LIMIT, pickFields } from "./helpers";
import type { OutputShapeEntry } from "./registry";
⋮----
function shapeCurateItem(
  item: Record<string, unknown>,
  detail: DetailLevel,
  shape: ShapeMode,
): Record<string, unknown>
⋮----
export function shapeCurateOutput(
  result: Record<string, unknown>,
  detail: DetailLevel,
  shape: ShapeMode,
): Record<string, unknown>
```

## File: src/output/shapes/env-list.ts
```typescript
import type { OutputShapeEntry } from "./registry";
```

## File: src/output/shapes/events.ts
```typescript
import { shapeEventsOutput } from "./helpers";
import type { OutputShapeEntry } from "./registry";
⋮----
const handler = (result: unknown, detail: Parameters<typeof shapeEventsOutput>[1])
```

## File: src/output/shapes/helpers.ts
```typescript
import type { DetailLevel, ShapeMode } from "../context";
⋮----
export function shapeProposalProducerOutput(
  result: Record<string, unknown>,
  detail: DetailLevel,
): Record<string, unknown>
⋮----
export function shapeProposalEntry(entry: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>
⋮----
export function shapeProposalListOutput(result: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>
⋮----
export function shapeProposalShowOutput(result: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>
⋮----
export function shapeProposalAcceptOutput(
  result: Record<string, unknown>,
  detail: DetailLevel,
): Record<string, unknown>
⋮----
export function shapeProposalRejectOutput(
  result: Record<string, unknown>,
  detail: DetailLevel,
): Record<string, unknown>
⋮----
export function shapeProposalDiffOutput(result: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>
⋮----
export function shapeEventsOutput(result: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>
⋮----
export function shapeEventEntry(entry: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>
⋮----
export function shapeSearchOutput(
  result: Record<string, unknown>,
  detail: DetailLevel,
  shape: ShapeMode = "human",
): Record<string, unknown>
⋮----
export function shapeSearchHit(hit: Record<string, unknown>, detail: DetailLevel): Record<string, unknown>
⋮----
export function shapeSearchHitForAgent(hit: Record<string, unknown>): Record<string, unknown>
⋮----
export function capDescription(hit: Record<string, unknown>, limit: number): Record<string, unknown>
⋮----
export function truncateDescription(description: string, limit: number): string
⋮----
export function shapeShowOutput(
  result: Record<string, unknown>,
  detail: DetailLevel,
  shape: ShapeMode = "human",
): Record<string, unknown>
⋮----
export function pickFields(source: Record<string, unknown>, fields: string[]): Record<string, unknown>
```

## File: src/output/shapes/migrate.ts
```typescript
import type { OutputShapeEntry } from "./registry";
⋮----
const identity: OutputShapeEntry["handler"] = (result)
```

## File: src/output/shapes/passthrough.ts
```typescript
import type { OutputShapeEntry } from "./registry";
⋮----
function makeStampHandler(command: string)
```

## File: src/output/shapes/registry.ts
```typescript
import { createCommandRegistry } from "../command-registry";
import type { DetailLevel, ShapeMode } from "../context";
⋮----
export type OutputShapeHandler = (result: unknown, detail: DetailLevel, shape: ShapeMode) => unknown;
⋮----
export interface OutputShapeEntry {
  command: string;
  handler: OutputShapeHandler;
}
⋮----
export function registerOutputShape(command: string, handler: OutputShapeHandler): void
⋮----
export function registerOutputShapes(entries: Iterable<OutputShapeEntry>): void
⋮----
export function deregisterOutputShape(command: string): void
⋮----
export function getOutputShapeHandler(command: string): OutputShapeHandler | undefined
```

## File: src/output/shapes/search.ts
```typescript
import { shapeSearchOutput } from "./helpers";
import type { OutputShapeEntry } from "./registry";
```

## File: src/output/shapes/secret-list.ts
```typescript
import type { OutputShapeEntry } from "./registry";
```

## File: src/output/shapes/show.ts
```typescript
import { shapeShowOutput } from "./helpers";
import type { OutputShapeEntry } from "./registry";
```

## File: src/output/text/proposal/producer.ts
```typescript
import { formatProposalProducerPlain } from "../helpers";
import type { TextFormatterEntry } from "../registry";
```

## File: src/output/text/proposal/proposal.ts
```typescript
import {
  formatProposalAcceptPlain,
  formatProposalDiffPlain,
  formatProposalDrainPlain,
  formatProposalListPlain,
  formatProposalRejectPlain,
  formatProposalReopenBatchPlain,
  formatProposalReopenPlain,
  formatProposalShowPlain,
} from "../helpers";
import type { TextFormatterEntry } from "../registry";
```

## File: src/output/text/add.ts
```typescript
import { formatAddPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/bundle-create.ts
```typescript
import { formatInitPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/bundle-rename.ts
```typescript
import { formatBundleRenamePlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/bundle-show.ts
```typescript
import { formatBundleShowPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/clone.ts
```typescript
import { formatClonePlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/command-format.ts
```typescript
import { formatRegistryUrl } from "../../core/registry-url";
import type { IndexResponse } from "../../indexer/indexer";
import type { DetailLevel } from "../context";
import { renderTargetsTable } from "./targets-table";
⋮----
export function formatInfoPlain(r: Record<string, unknown>): string
⋮----
export function formatConfigPlain(r: Record<string, unknown>): string
⋮----
// Recursive flattener: prints `key=value` lines, and nested objects as
⋮----
const walk = (obj: Record<string, unknown>, prefix: string): void =>
⋮----
export function formatFeedbackPlain(r: Record<string, unknown>): string
⋮----
export function formatRememberPlain(r: Record<string, unknown>): string
⋮----
export function formatImportPlain(r: Record<string, unknown>): string
⋮----
export function formatSyncPlain(r: Record<string, unknown>): string
⋮----
export function formatRegistryListPlain(r: Record<string, unknown>): string
⋮----
export function formatRegistryAddPlain(r: Record<string, unknown>): string
⋮----
export function formatRegistryRemovePlain(r: Record<string, unknown>): string
⋮----
export function formatEnvListPlain(r: Record<string, unknown>): string
⋮----
export function formatEnvCreatePlain(r: Record<string, unknown>): string
⋮----
export function formatEnvExportPlain(r: Record<string, unknown>): string
⋮----
export function formatEnvRemovePlain(r: Record<string, unknown>): string
⋮----
export function formatEventsPlain(r: Record<string, unknown>): string
⋮----
export function formatEventLine(event: Record<string, unknown>): string
⋮----
export function formatSearchPlain(r: Record<string, unknown>, detail: DetailLevel): string
⋮----
// Optional quality marker (e.g. "curated" / "proposed").
⋮----
lines.push(""); // blank line between hits
⋮----
export function formatCuratePlain(r: Record<string, unknown>, detail: DetailLevel): string
⋮----
export function formatInitPlain(r: Record<string, unknown>): string
⋮----
export function formatIndexPlain(r: Record<string, unknown>): string
⋮----
export function formatListPlain(r: Record<string, unknown>): string
⋮----
export function formatModelsPlain(r: Record<string, unknown>): string
⋮----
export function formatModelsSetPlain(r: Record<string, unknown>): string
⋮----
/** Render a single `SourceEntry` — `akm bundle show <name>`'s detail view of one `list` row. */
export function formatBundleShowPlain(r: Record<string, unknown>): string
⋮----
export function formatAddPlain(r: Record<string, unknown>): string
⋮----
function formatDeclarativeAddPlain(r: Record<string, unknown>): string
⋮----
export function formatRemovePlain(r: Record<string, unknown>): string
⋮----
export function formatBundleRenamePlain(r: Record<string, unknown>): string
⋮----
export function formatUpdatePlain(r: Record<string, unknown>): string
⋮----
function formatUpgradePluginLines(r: Record<string, unknown>): string[]
⋮----
export function formatUpgradePlain(r: Record<string, unknown>): string | null
⋮----
function formatUpgradeHead(r: Record<string, unknown>): string | null
⋮----
export function formatClonePlain(r: Record<string, unknown>): string
```

## File: src/output/text/config.ts
```typescript
import { formatConfigPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/curate.ts
```typescript
import { formatCuratePlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/env.ts
```typescript
import { formatEnvCreatePlain, formatEnvExportPlain, formatEnvListPlain, formatEnvRemovePlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/events.ts
```typescript
import { formatEventsPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/feedback.ts
```typescript
import { formatFeedbackPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/health-format.ts
```typescript
import type { DetailLevel } from "../context";
import { flattenForText } from "../generic-render";
import { renderStatusEntries, type StatusEntry, summarizeCounts } from "./status-list";
import { renderTargetsTable } from "./targets-table";
⋮----
interface HealthCheckLike {
  name: string;
  kind?: string;
  status?: string;
  message?: string;
  confidence?: string;
  evidence?: Record<string, unknown>;
}
⋮----
function evidenceLines(evidence: Record<string, unknown> | undefined): string[]
⋮----
function checkStatusEntry(check: HealthCheckLike, detail: DetailLevel): StatusEntry
⋮----
function renderCheckSection(title: string, checks: readonly HealthCheckLike[], detail: DetailLevel): string[]
⋮----
export function formatHealthPlain(r: Record<string, unknown>, detail: DetailLevel): string | null
⋮----
// Everything else (metrics, improve, and the optional runs/windows/deltas/
// report datasets) is a nested scalar tree, not the array-of-records shape
// this formatter exists to fix — keep the existing dotted-path convention
// for it rather than inventing a second one.
```

## File: src/output/text/health.ts
```typescript
import { formatHealthPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/helpers.ts
```typescript

```

## File: src/output/text/import.ts
```typescript
import { formatImportPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/improve-report.ts
```typescript
import { formatUsageReportTable, type ImproveUsageReport } from "../../commands/improve/improve-usage-report";
import type { TextFormatterEntry } from "./registry";
⋮----
function formatImproveReportPlain(result: Record<string, unknown>): string | null
```

## File: src/output/text/index.ts
```typescript
import { formatIndexPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/info.ts
```typescript
import { formatInfoPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/lint-format.ts
```typescript
import type { LintIssue } from "../../commands/lint/types";
import { renderStatusEntries, type StatusEntry } from "./status-list";
⋮----
function glyphFor(fixed: LintIssue["fixed"]):
⋮----
function locationOf(issue: LintIssue): string
⋮----
function issueEntry(issue: LintIssue): StatusEntry
⋮----
function renderIssueSection(title: string, issues: readonly LintIssue[]): string[]
⋮----
export function formatLintPlain(r: Record<string, unknown>): string | null
```

## File: src/output/text/lint.ts
```typescript
import { formatLintPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/list.ts
```typescript
import { formatListPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/metrics.ts
```typescript
import { buildMetricsView, isMetricsResult, type MetricsViewTable } from "../../commands/metrics/report-view";
import type { DetailLevel } from "../context";
import type { TextFormatterEntry } from "./registry";
⋮----
const flat = (s: string): string
⋮----
function renderTable(table: MetricsViewTable): string[]
⋮----
const line = (r: string[]) => `  $
⋮----
export function formatMetricsPlain(result: Record<string, unknown>, detail: DetailLevel): string | null
```

## File: src/output/text/migrate.ts
```typescript
import type { TextFormatterEntry } from "./registry";
⋮----
interface MigrationPlanResult {
  status: string;
  blockers?: string[];
  configFile?: { credentials?: string[]; notes?: string[] };
  taskFiles?: { changed: number; skipped: number; blocked: number };
  assetEngineKeys?: { changed: number; skipped: number; notes?: string[] };
  backupPath?: string;
  applied?: number;
}
⋮----
function planGlyph(status: string): string
⋮----
export function formatMigratePlain(result: unknown): string | null
```

## File: src/output/text/models.ts
```typescript
import { formatModelsPlain, formatModelsSetPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/proposal-format.ts
```typescript
function appendLoweringNotices(lines: string[], result: Record<string, unknown>): void
⋮----
export function formatProposalProducerPlain(command: string, r: Record<string, unknown>): string
⋮----
export function formatGateDecisionSummary(raw: unknown): string
⋮----
/**
 * Reconstruct the drain threshold comparison when both operands are present.
 * Returns the empty string when the decision lacks either operand.
 */
function formatGateThresholdComparison(d: Record<string, unknown>): string
⋮----
export function formatProposalListPlain(r: Record<string, unknown>): string
⋮----
// NEW-1: `akm reflect` and `akm distill` are internal improve-pipeline
// process names (src/commands/improve/{reflect,distill}.ts), not
// registered top-level commands (see the subCommands map in src/cli.ts) —
// an agent following this hint would run a command that does not exist.
// The real ways to queue a proposal are `akm improve <ref>` (which runs
// the reflect/distill/consolidate pipeline internally) and
// `akm proposal new`.
⋮----
// #577: surface the gate verdict inline so the queue explains itself.
⋮----
// A retire proposal's continuityRisk excludes it from bulk accept —
// visible in the default list, not just `proposal show`, since the owner
// reviews the backlog list-first. `list`'s default (brief) shape
// projects a `continuityRisk: true` marker instead of the full
// `retirement` object (only present from `--detail normal` up), so both
// shapes are checked here.
⋮----
function retireVerdictLines(retirement: Record<string, unknown>): string[]
⋮----
export function formatProposalShowPlain(r: Record<string, unknown>): string
⋮----
// alpha.9: a consolidate retire proposal writes no content (`payload.content`
// is empty by design) — this is the reason a reviewer needs instead. `diff`
// shows the body being retired.
⋮----
// Partition findings by severity. `severity: "warn"` findings are
// non-blocking (the validator reports `ok: true` for a warn-only proposal),
⋮----
export function formatProposalAcceptPlain(r: Record<string, unknown>): string
⋮----
export function formatProposalRejectPlain(r: Record<string, unknown>): string
⋮----
export function formatProposalReopenPlain(r: Record<string, unknown>): string
⋮----
export function formatProposalReopenBatchPlain(r: Record<string, unknown>): string
⋮----
export function formatProposalDrainPlain(r: Record<string, unknown>): string
⋮----
export function formatProposalDiffPlain(r: Record<string, unknown>): string
```

## File: src/output/text/registry-commands.ts
```typescript
import { formatRegistryAddPlain, formatRegistryListPlain, formatRegistryRemovePlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/registry.ts
```typescript
import { createCommandRegistry } from "../command-registry";
import type { DetailLevel } from "../context";
⋮----
export type TextFormatterHandler = (result: Record<string, unknown>, detail: DetailLevel) => string | null;
⋮----
export interface TextFormatterEntry {
  command: string;
  handler: TextFormatterHandler;
}
⋮----
export function registerTextFormatter(command: string, handler: TextFormatterHandler): void
⋮----
export function registerTextFormatters(entries: Iterable<TextFormatterEntry>): void
⋮----
export function deregisterTextFormatter(command: string): void
⋮----
export function getTextFormatterHandler(command: string): TextFormatterHandler | undefined
```

## File: src/output/text/remember.ts
```typescript
import { formatRememberPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/remove.ts
```typescript
import { formatRemovePlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/search.ts
```typescript
import { formatSearchPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/show-directives.ts
```typescript
import { conceptIdFromTypeName } from "../../core/asset/resolve-ref";
⋮----
export function appendShowDirectives(lines: string[], r: Record<string, unknown>): void
⋮----
/**
 * Detect whether a skill's rendered content primarily teaches CLI commands
 * rather than YAML schema. Used to select the right APPLY directive variant.
 *
 * Heuristic: count code-block lines that start with known shell command
 * prefixes vs lines that look like YAML key-value pairs. If CLI lines
 * outnumber YAML lines (and there is at least one CLI line), treat the
 * skill as command-output.
 */
function isCommandOutputSkill(lines: string[]): boolean
```

## File: src/output/text/show-format.ts
```typescript
import type { MarkdownTocEntry } from "../../core/asset/markdown";
import type { DetailLevel } from "../context";
import { appendShowDirectives } from "./show-directives";
⋮----
export function formatShowPlain(r: Record<string, unknown>, detail: DetailLevel): string | null
```

## File: src/output/text/show.ts
```typescript
import { formatShowPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/status-list.ts
```typescript
export interface StatusEntry {

  severityRank: number;

  glyph: string;

  headline: string;

  detailLines?: string[];
}
⋮----
export function renderStatusEntries(entries: readonly StatusEntry[]): string[]
⋮----
export function summarizeCounts(counts: Record<string, number>, order: readonly string[]): string
```

## File: src/output/text/sync.ts
```typescript
import { formatSyncPlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/targets-table.ts
```typescript
type Row = Record<string, unknown>;
⋮----
const text = (value: unknown): string
const yesNo = (value: unknown): string
⋮----
function table(headers: readonly string[], cells: readonly (readonly string[])[]): string[]
⋮----
const line = (row: readonly string[])
⋮----
function reachable(row: Row): string
⋮----
function runsOn(row: Row): string
⋮----
function override(entry: Row): string
⋮----
function notes(row: Row): string
⋮----
interface Column {
  readonly header: string;
  readonly cell: (row: Row) => string;
  readonly field?: string;
}
⋮----
function section(title: string, columns: readonly Column[], rows: readonly Row[]): string[]
⋮----
export function renderTargetsTable(rows: readonly unknown[]): string[]
⋮----
const of = (type: string)
```

## File: src/output/text/update.ts
```typescript
import { formatUpdatePlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/upgrade.ts
```typescript
import { formatUpgradePlain } from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/text/workflow-format.ts
```typescript
export function formatWorkflowListPlain(result: Record<string, unknown>): string
⋮----
function renderChildNode(child: Record<string, unknown>, depth: number, lines: string[]): void
⋮----
function renderOrchestrationLines(value: unknown, prefix: string): string[]
⋮----
export function formatWorkflowStatusPlain(result: Record<string, unknown>): string | null
⋮----
function renderLoweringNoticeLine(value: unknown): string | null
⋮----
export function formatWorkflowRunPlain(result: Record<string, unknown>): string | null
⋮----
export function formatWorkflowCreatePlain(r: Record<string, unknown>): string | null
⋮----
export function formatWorkflowResumePlain(r: Record<string, unknown>): string
⋮----
function formatInputBindingsList(bindings: readonly Record<string, unknown>[]): string
⋮----
function renderPlanStepLines(step: Record<string, unknown>, ordinal: number, lines: string[], prefix = "  "): void
⋮----
export function formatWorkflowPlanPlain(result: Record<string, unknown>): string | null
```

## File: src/output/text/workflow.ts
```typescript
import {
  formatWorkflowCreatePlain,
  formatWorkflowListPlain,
  formatWorkflowPlanPlain,
  formatWorkflowResumePlain,
  formatWorkflowRunPlain,
  formatWorkflowStatusPlain,
} from "./helpers";
import type { TextFormatterEntry } from "./registry";
```

## File: src/output/cli-hints.ts
```typescript
import EMBEDDED_HINTS_FULL from "../assets/hints/cli-hints-full.md" with { type: "text" };
import EMBEDDED_HINTS from "../assets/hints/cli-hints-short.md" with { type: "text" };
```

## File: src/output/command-registry.ts
```typescript
export interface CommandRegistryEntry<H> {
  command: string;
  handler: H;
}
⋮----
export interface CommandRegistry<H> {




  register(command: string, handler: H): void;




  registerAll(entries: Iterable<CommandRegistryEntry<H>>): void;




  deregister(command: string): void;




  get(command: string): H | undefined;
}
⋮----
register(command: string, handler: H): void;
⋮----
registerAll(entries: Iterable<CommandRegistryEntry<H>>): void;
⋮----
deregister(command: string): void;
⋮----
get(command: string): H | undefined;
⋮----
export function createCommandRegistry<H>(): CommandRegistry<H>
⋮----
register(command: string, handler: H): void
registerAll(entries: Iterable<CommandRegistryEntry<H>>): void
deregister(command: string): void
get(command: string): H | undefined
```

## File: src/output/context.ts
```typescript
import { UsageError } from "../core/errors";
⋮----
export type OutputFormat = "json" | "yaml" | "text" | "jsonl" | "md" | "html";
⋮----
export type DetailLevel = "brief" | "normal" | "full";
⋮----
export type ShapeMode = "human" | "agent";
⋮----
export interface OutputMode {
  format: OutputFormat;
  detail: DetailLevel;
  shape: ShapeMode;




  outputPath?: string;
}
⋮----
export interface OutputDefaults {
  format?: OutputFormat | "json" | "yaml" | "text";
  detail?: DetailLevel | "brief" | "normal" | "full";
}
⋮----
export type DetailValue = DetailLevel | "agent";
⋮----
function parseOutputFormat(value: string | undefined): OutputFormat | undefined
⋮----
export function parseDetailLevel(value: string | undefined): DetailValue | undefined
⋮----
export function parseFlagValue(argv: string[], flag: string): string | undefined
⋮----
export function hasBooleanFlag(argv: string[], flag: string): boolean
⋮----
export function getHyphenatedArg<T = string>(args: unknown, key: string): T | undefined
⋮----
export function getHyphenatedBoolean(args: unknown, key: string): boolean
⋮----
export function resolveOutputMode(argv: string[], defaults: OutputDefaults | undefined =
⋮----
export function initOutputMode(argv: string[], defaults: OutputDefaults | undefined =
⋮----
export function getOutputMode(): OutputMode
⋮----
export function resetOutputMode(): void
```

## File: src/output/format-exempt.ts
```typescript
export function isFormatExemptCommand(commandPath: readonly string[]): boolean
⋮----
export function formatExemptSurfaces():
```

## File: src/output/generic-render.ts
```typescript
import { escapeHtml } from "./html-render";
⋮----
type TableRow = Record<string, unknown>;
⋮----
function isTabular(value: unknown): value is TableRow[]
⋮----
function tableColumns(rows: readonly TableRow[]): string[]
⋮----
function displayScalar(value: unknown): string
⋮----
function escapeCell(text: string): string
⋮----
function markdownTable(rows: readonly TableRow[]): string[]
⋮----
function markdownValue(value: unknown, depth: number): string[]
⋮----
export function renderGenericMarkdown(command: string, value: unknown): string
⋮----
function htmlTable(rows: readonly TableRow[]): string
⋮----
function htmlValue(value: unknown, depth: number): string
⋮----
/**
 * Render a shaped envelope as a self-contained HTML document.
 *
 * Self-contained matters: the output is routinely redirected to a file and
 * opened directly, so it carries its own minimal styling and references
 * nothing external.
 */
export function renderGenericHtml(command: string, value: unknown): string
⋮----
// ── Text ─────────────────────────────────────────────────────────────────────
⋮----
/**
 * Flatten `value` onto `lines` as `dotted.path=value` entries — the exact
 * algorithm `formatConfigPlain` (`src/output/text/command-format.ts`)
 * already established as this CLI's real plain-text house style for `akm
 * config list`. Arrays serialize as one compact-JSON line rather than
 * index-per-line (`items.0.name=…`), matching that same precedent instead of
 * inventing a second convention: the arrays that reach this generic
 * fallback are typically short id/tag lists, where one JSON-array line reads
 * better than N extra `path.0=`, `path.1=`, … lines.
 *
 * Exported so command-specific text formatters (e.g. `formatHealthPlain` in
 * `src/output/text/health-format.ts`) can reuse the SAME scalar-tree
 * convention for the parts of their envelope that are plain nested
 * scalars/objects, while overriding just the parts that need bespoke
 * handling (arrays of status-bearing records, where this function's
 * one-JSON-line-per-array behavior is the exact defect those formatters
 * exist to fix). Reuse beats a second flattener.
 */
export function flattenForText(value: unknown, path: string, lines: string[]): void
⋮----
export function renderGenericText(command: string, value: unknown): string
```

## File: src/output/html-render.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import healthTemplate from "../assets/templates/html/health.html" with { type: "text" };
import metricsTemplate from "../assets/templates/html/metrics.html" with { type: "text" };
import { getDirname } from "../runtime";
import { writeStdout } from "./stdout";
⋮----
export function resolveTemplatePath(command: string): string
⋮----
export function renderHtml(templatePath: string, replacements: Record<string, string>): string
⋮----
function readTemplate(templatePath: string): string
⋮----
export function escapeHtml(value: string): string
⋮----
export function isoTimeTag(iso: string): string
⋮----
export function deliverRendered(content: string, outputPath: string | undefined): void
```

## File: src/output/render-registry.ts
```typescript
import type { DetailLevel } from "./context";
⋮----
export type DocumentRendererHandler = (result: unknown, detail: DetailLevel) => string | null;
⋮----
export function registerMdRenderer(command: string, handler: DocumentRendererHandler): void
⋮----
export function getMdRendererHandler(command: string): DocumentRendererHandler | undefined
```

## File: src/output/renderers.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { listKeys as listVaultKeys } from "../commands/env/env";
import { parseFrontmatter, readFrontmatterDate } from "../core/asset/frontmatter";
import { asNonEmptyString, hasErrnoCode } from "../core/common";
import type { IndexDocument } from "../indexer/passes/metadata";
import { extractCommentMetadata } from "../indexer/passes/metadata";
import type { AssetRenderer, RenderContext } from "../indexer/walk/file-context";
import { registerRenderer } from "../indexer/walk/file-context";
import type { ShowResponse, SourceSearchHit } from "../sources/types";
import { buildWorkflowAction, workflowMdRenderer } from "../workflows/renderer";
⋮----
export interface ExecHints {
  run?: string;
  setup?: string;
  cwd?: string;
}
⋮----
export function extractCommentTags(filePath: string): ExecHints
⋮----
export function detectExecHints(filePath: string): ExecHints
⋮----
export function resolveExecHints(stashEntry: IndexDocument | undefined, filePath: string): ExecHints
⋮----
function deriveName(ctx: RenderContext): string
⋮----
function extractParameters(template: string): string[] | undefined
⋮----
function readFrontmatterTags(value: unknown): string[] | undefined
⋮----
buildShowResponse(ctx: RenderContext): ShowResponse
⋮----
enrichSearchHit(hit: SourceSearchHit, _stashDir: string): void
⋮----
export function registerBuiltinRenderers(): void
```

## File: src/output/shapes.ts
```typescript
import type { DetailLevel, ShapeMode } from "./context";
import { curateShapes } from "./shapes/curate";
import { envListShapes } from "./shapes/env-list";
import { eventsShapes } from "./shapes/events";
import { migrateShapes } from "./shapes/migrate";
import { passthroughShapes } from "./shapes/passthrough";
import { proposalAcceptShapes } from "./shapes/proposal/accept";
import { proposalDiffShapes } from "./shapes/proposal/diff";
import { proposalListShapes } from "./shapes/proposal/list";
import { proposalProducerShapes } from "./shapes/proposal/producer";
import { proposalRejectShapes } from "./shapes/proposal/reject";
import { proposalReopenShapes } from "./shapes/proposal/reopen";
import { proposalShowShapes } from "./shapes/proposal/show";
import { getOutputShapeHandler, type OutputShapeEntry, registerOutputShapes } from "./shapes/registry";
import { searchShapes } from "./shapes/search";
import { secretListShapes } from "./shapes/secret-list";
import { showShapes } from "./shapes/show";
⋮----
export type OutputCommandName = string;
⋮----
function withResultsAlias(command: OutputCommandName, shaped: unknown): unknown
⋮----
export function shapeForCommand(
  command: OutputCommandName,
  result: unknown,
  detail: DetailLevel,
  shape: ShapeMode = "human",
): unknown
```

## File: src/output/stdout.ts
```typescript
export function writeStdout(document: string): void
⋮----
export function stdoutText(document: string): string
```

## File: src/output/text.ts
```typescript
import type { DetailLevel } from "./context";
import type { OutputCommandName } from "./shapes";
import { writeStdout } from "./stdout";
import { addFormatters } from "./text/add";
import { bundleCreateFormatters } from "./text/bundle-create";
import { bundleRenameFormatters } from "./text/bundle-rename";
import { bundleShowFormatters } from "./text/bundle-show";
import { cloneFormatters } from "./text/clone";
import { configFormatters } from "./text/config";
import { curateFormatters } from "./text/curate";
import { envFormatters } from "./text/env";
import { eventsFormatters } from "./text/events";
import { feedbackFormatters } from "./text/feedback";
import { healthFormatters } from "./text/health";
import { importFormatters } from "./text/import";
import { improveReportFormatters } from "./text/improve-report";
import { indexFormatters } from "./text/index";
import { infoFormatters } from "./text/info";
import { lintFormatters } from "./text/lint";
import { listFormatters } from "./text/list";
import { metricsFormatters } from "./text/metrics";
import { migrateFormatters } from "./text/migrate";
import { modelsFormatters } from "./text/models";
import { proposalProducerFormatters } from "./text/proposal/producer";
import { proposalFormatters } from "./text/proposal/proposal";
import { getTextFormatterHandler, registerTextFormatters, type TextFormatterEntry } from "./text/registry";
import { registryCommandFormatters } from "./text/registry-commands";
import { rememberFormatters } from "./text/remember";
import { removeFormatters } from "./text/remove";
import { searchFormatters } from "./text/search";
import { showFormatters } from "./text/show";
import { syncFormatters } from "./text/sync";
import { updateFormatters } from "./text/update";
import { upgradeFormatters } from "./text/upgrade";
import { workflowFormatters } from "./text/workflow";
⋮----
export function outputJsonl(command: string, shaped: unknown): void
⋮----
export function formatPlain(command: OutputCommandName, result: unknown, detail: DetailLevel): string | null
```
