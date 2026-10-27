---
description: "Repo map of akm src/core at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
````
src/
  core/
    adapter/
      adapters/
        agent-skills-adapter.ts
        akm-adapter.ts
        akm-lint.ts
        akm-metadata.ts
        akm-task-adapter.ts
        akm-workflow-adapter.ts
        claude-adapter.ts
        dotenv-adapter.ts
        generic-files-adapter.ts
        index.ts
        llm-wiki-adapter.ts
        okf-adapter.ts
        opencode-adapter.ts
        shared.ts
        tool-dir-shared.ts
        website-snapshot-adapter.ts
      adapter-ids.ts
      bundle-adapter.ts
      detect-adapter.ts
      execution-source.ts
      recognize-match.ts
      registry.ts
      types.ts
      validate-context.ts
    asset/
      akm-markdown.ts
      asset-create.ts
      asset-placement.ts
      asset-ref.ts
      asset-serialize.ts
      frontmatter-lint.ts
      frontmatter.ts
      markdown-fragments.ts
      markdown-link-targets.ts
      markdown.ts
      memory-archive.ts
      resolve-ref.ts
      stash-meta.ts
    config/
      schema/
        connections.ts
        embedding.ts
        experimental.ts
        feedback.ts
        harnesses.ts
        improve-processes.ts
        improve.ts
        index-config.ts
        output.ts
        primitives.ts
        scheduler.ts
        search.ts
        setup.ts
        sources-bundles.ts
        workflow.ts
      config-io.ts
      config-schema.ts
      config-sources.ts
      config-types.ts
      config-version.ts
      config-walker.ts
      config.ts
      convert-engine-references.ts
      convert-engines-shared.ts
      convert-engines.ts
      convert-models-overlay.ts
      credentials.ts
      deep-merge.ts
      engine-semantics.ts
      experimental.ts
      migrate-keys.ts
      model-aliases.ts
      models-file.ts
      retired-engines.ts
      unusable-entries.ts
    standards/
      resolve-standards-context.ts
      resolve-stash-standards.ts
      resolve-type-conventions.ts
    state/
      migrations.ts
    abort-deadline.ts
    assert.ts
    authoring-rules.ts
    best-effort.ts
    bundle-id.ts
    bundle-rename.ts
    closest-match.ts
    common.ts
    concurrent.ts
    content-safety.ts
    endpoint-url.ts
    env-secret-ref.ts
    errors.ts
    events-types.ts
    events.ts
    extra-params.ts
    file-change.ts
    file-lock.ts
    git-message.ts
    improve-result.ts
    improve-types.ts
    json-schema.ts
    lesson-lint.ts
    llm-inference.ts
    logs-db.ts
    loopback.ts
    mutation-target.ts
    network-policy.ts
    non-task-input.ts
    npm-package.ts
    parent-watchdog.ts
    parse.ts
    path-access.ts
    paths.ts
    platform.ts
    recognition-util.ts
    redaction.ts
    ref-token.ts
    registry-url.ts
    run-lock.ts
    secret-value.ts
    sensitive-marker-path.ts
    state-db-scope.ts
    state-db.ts
    structured.ts
    subprocess.ts
    system-error.ts
    tar.ts
    text-truncation.ts
    time.ts
    trash.ts
    tty.ts
    type-presentation.ts
    warn.ts
    write-provenance.ts
    write-source.ts
````

# Files

## File: src/core/adapter/adapters/agent-skills-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import type { FileContext } from "../../../indexer/walk/file-context";
import { parseFrontmatter } from "../../asset/frontmatter";
import { toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import type { BundleAdapter } from "../bundle-adapter";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { hashContent, nonEmptyString, readTags } from "./shared";
⋮----
function skillPackage(relPath: string):
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
function skillFieldDiagnostics(relPath: string, dirName: string, data: Record<string, unknown>): Diagnostic[]
⋮----
interface ManifestScanResult {

  containsManifest: boolean;

  diagnostics: Diagnostic[];
}
⋮----
function missingManifestDiagnostic(dir: string): Diagnostic
⋮----
async function scanPackageCandidate(
  dir: string,
  entries: readonly string[],
  ctx: ValidateContext,
  depth: number,
): Promise<ManifestScanResult>
⋮----
async function missingManifestDiagnostics(ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
async function validate(_c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
looksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapters/akm-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import type { AdapterRenderedExecutionSource } from "../../../execution/source";
import {
  applyPostContributorFields,
  applyPreContributorFields,
  extractPackageMetadata,
  getMarkdownFragmentContent,
  hasMarkdownFragmentContent,
  setMarkdownFragmentContent,
} from "../../../indexer/passes/metadata";
import type { FileContext } from "../../../indexer/walk/file-context";
import {
  assetPathCandidatesForName,
  deriveCanonicalAssetNameFromStashRoot,
  placementTypes,
  stashDirFor,
  stashDirNames,
} from "../../asset/asset-placement";
import { parseFrontmatter } from "../../asset/frontmatter";
import type { FileChange } from "../../file-change";
import { sensitiveMarkerPath } from "../../sensitive-marker-path";
import type { BundleAdapter } from "../bundle-adapter";
import { executionDefaultsFromFrontmatter, renderMarkdownExecutionSource } from "../execution-source";
import { recognizeMatch } from "../recognize-match";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { perTypeValidateChecks, skillDirectoryDiagnostics } from "./akm-lint";
import { applyFoldedMetadata, foldRecognizedMetadata } from "./akm-metadata";
import { hashContent, type ParsedForValidate, RESERVED_FILES, runBaseValidateChecks } from "./shared";
⋮----
function isReservedFileName(name: string): boolean
⋮----
function akmStashAbstains(root: string, absPath: string): boolean
⋮----
function stashDirToType(stashDir: string): string | undefined
⋮----
function indexDocumentFromEntry(
  entry: IndexDocument,
  base: Pick<IndexDocument, "ref" | "bundle" | "component" | "conceptId" | "path" | "hash" | "adapterId" | "type">,
  rendererName: string,
): IndexDocument
⋮----
function conceptIdForRecognizedType(root: string, filePath: string, type: string): string | undefined
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
function renderExecutionSource(c: BundleComponent, file: FileContext): AdapterRenderedExecutionSource | null
⋮----
function buildOverlayContext(root: string, relPathInput: string, raw: string): FileContext
⋮----
async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
directoryList(_c: BundleComponent): string[]
⋮----
looksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapters/akm-lint.ts
````typescript
import path from "node:path";
import { isDangerousEnvKey } from "../../../commands/lint/env-key-rules";
import { backendNameForPlatform } from "../../../tasks/backends";
import { assertTaskScheduleCronValid, assertTaskScheduleInputsSatisfyContract } from "../../../tasks/schedule-gates";
import { parseTaskSource } from "../../../tasks/source/parse-task-source";
import { taskSourceErrorDetail } from "../../../tasks/source-v3";
import { checkWorkflowPlan, compileWorkflowSource } from "../../../workflows/compile";
import { conceptIdForStashFile } from "../../asset/resolve-ref";
import { isAkmRegistryCachePath, scanEnvKeyNames } from "../../common";
import type { BundleComponent, Diagnostic, ValidateContext } from "../types";
⋮----
function checkMissingNameOrType(data: Record<string, unknown>, frontmatter: string | null): string | null
⋮----
function checkInvalidTypeValue(data: Record<string, unknown>, allowedTypes: readonly string[]): string | null
⋮----
function suggestSlug(filePath: string): string
⋮----
// ── name/type linter (CommandLinter / AgentLinter) ───────────────────────────
⋮----
/** Reproduce CommandLinter/AgentLinter's extra checks (`command-linter.ts` / `agent-linter.ts`). */
export function nameOrTypeDiagnostics(
  relPath: string,
  data: Record<string, unknown>,
  frontmatter: string | null,
  allowedTypes: readonly string[],
): Diagnostic[]
⋮----
function collectSuppressedKeys(raw: string): Set<string>
⋮----
/**
 * env/secret dangerous-key scan (`lint/index.ts:191-218` + `env-key-rules.ts#checkEnvForDangerousKeys`),
 * keyed on `type` and preserving the `.env`-suffix narrowness (see file header).
 * Reads the overlay `raw`, not disk.
 *
 * The emitted `Ref:` comes from `conceptIdForStashFile` — the one place that
 * spells a diagnostic ref the way `akm show` accepts it. It used to be
 * hand-built as `env:<base>` / `secret:<base>`, a colon grammar the 0.9.0 ref
 * parser rejects outright — a dead-end ref on a *security* finding.
 */
export function dangerousEnvKeyDiagnostics(type: string | undefined, relPath: string, raw: string): Diagnostic[]
⋮----
export async function skillDirectoryDiagnostics(
  relPath: string,
  seen: Set<string>,
  ctx: ValidateContext,
  skillDirs: ReadonlySet<string> = AKM_SKILL_DIRS,
): Promise<Diagnostic[]>
⋮----
export interface PerTypeCheckArgs {
  type: string | undefined;
  relPath: string;
  raw: string;

  data: Record<string, unknown>;

  frontmatter: string | null;

  body: string;

  ext: string;
  ctx: ValidateContext;
}
⋮----
export async function perTypeValidateChecks(args: PerTypeCheckArgs): Promise<Diagnostic[]>
⋮----
export function factDiagnostics(relPath: string, data: Record<string, unknown>): Diagnostic[]
⋮----
export function taskDiagnostics(relPath: string, raw: string): Diagnostic[]
⋮----
export function matchWorkflowPlaceholder(body: string): string | null
⋮----
export function workflowStructureDiagnostics(
  relPath: string,
  raw: string,
  parsePath: string,
): WorkflowFrontendDiagnostic[]
⋮----
function lineOf(err:
⋮----
export type WorkflowFrontendDiagnostic = Diagnostic & {
  issue: "invalid-workflow-structure" | "workflow-warning";
};
⋮----
export interface WorkflowFrontendDiagnostics {
  errors: WorkflowFrontendDiagnostic[];
  warnings: WorkflowFrontendDiagnostic[];
}
⋮----
export function workflowFrontendDiagnostics(
  relPath: string,
  raw: string,
  parsePath: string,
): WorkflowFrontendDiagnostics
⋮----
function workflowDiagnostics(relPath: string, raw: string, body: string): Diagnostic[]
⋮----
export function memoryOrphanStubApplies(data: Record<string, unknown>, body: string): boolean
⋮----
async function memoryDiagnostics(
  relPath: string,
  data: Record<string, unknown>,
  body: string,
  ctx: ValidateContext,
): Promise<Diagnostic[]>
````

## File: src/core/adapter/adapters/akm-metadata.ts
````typescript
import type { ParsedBuiltinCommandAction } from "../../../commands/command/builtin-action";
import { scanEnvKeyNames } from "../../../commands/env/env";
import type { IndexDocument } from "../../../indexer/passes/metadata";
import type { FileContext } from "../../../indexer/walk/file-context";
import { parseTaskSource } from "../../../tasks/source/parse-task-source";
import { compileWorkflowSource, workflowStepInstructions } from "../../../workflows/compile";
import { parseFrontmatter, readFrontmatterDate } from "../../asset/frontmatter";
import type { TocHeading } from "../../asset/markdown";
import { parseMarkdownToc } from "../../asset/markdown";
import { nonEmptyString } from "./shared";
⋮----
export interface FoldedMetadata {
  tags?: string[];
  searchHints?: string[];
  description?: string;
  confidence?: number;
  source?: string;
  toc?: TocHeading[];
  parameters?: Array<{ name: string; description?: string }>;

  uses?: string[];
}
⋮----
function extractDescriptionFromComments(content: string): string | null
⋮----
/**
 * Reproduce `applyFrontmatterDescriptionAndTags` (`output/renderers.ts:668-684`):
 * set description/source/confidence from frontmatter (only when not already set)
 * and merge frontmatter `tags:` onto the folded tags. Returns nothing — mutates
 * `out`.
 */
function applyFrontmatterDescriptionAndTags(fm: Record<string, unknown>, out: FoldedMetadata): void
⋮----
function storedCommandRef(action: ParsedBuiltinCommandAction | undefined): string | undefined
⋮----
function finalizeHints(out: FoldedMetadata, hints: Set<string>): void
⋮----
export function foldRecognizedMetadata(rendererName: string, file: FileContext): FoldedMetadata
⋮----
export function applyFoldedMetadata(entry: IndexDocument, folded: FoldedMetadata): void
````

## File: src/core/adapter/adapters/akm-task-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import type { FileContext } from "../../../indexer/walk/file-context";
import { readBoundedTaskSourceYaml } from "../../../tasks/source/bounded-document";
import { parseTaskSource, peekTaskSourceVersion } from "../../../tasks/source/parse-task-source";
import {
  TASK_EXTENSION,
  TASK_NEAR_MISS_EXTENSION,
  taskExtensionDetail,
  taskSourceErrorDetail,
} from "../../../tasks/source-v3";
import { toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import type { BundleAdapter } from "../bundle-adapter";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { hashContent } from "./shared";
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
async function validate(_c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
/** Tasks live anywhere under the component root. */
directoryList(): string[]
⋮----
/**
   * Install-time probe (§1.2): a root holding a top-level, valid task source
   * v4 `.yml` file, or a task v2/v3 file that `akm migrate apply` has yet to
   * convert (the runtime refuses those, so without this the migrator and
   * `akm task sync` would not find them in a bundle whose adapter config does
   * not record). The full parser keeps this disjoint from unrelated YAML and
   * prevents probe semantics from drifting from validation semantics.
   */
looksLikeRoot(root: string): boolean
⋮----
function isLegacyTaskDocument(yaml: string, filePath: string): boolean
````

## File: src/core/adapter/adapters/akm-workflow-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import type { FileContext } from "../../../indexer/walk/file-context";
import { parseFrontmatter } from "../../asset/frontmatter";
import { toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import type { BundleAdapter } from "../bundle-adapter";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { perTypeValidateChecks } from "./akm-lint";
import { hashContent, nonEmptyString, type ParsedForValidate, readTags, runBaseValidateChecks } from "./shared";
⋮----
function conceptIdOf(relPath: string): string
⋮----
/** `README.md` (case-insensitive) is documentation, never the typed asset — mirrors the akm matcher stack's D-R6 reserved-file exclusion (`TYPED_DIR_DOC_FILES`). */
function isReservedDocFile(fileName: string): boolean
⋮----
function isWorkflowFile(raw: string): boolean
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
function hasTopLevelWorkflowFile(root: string, entries: fs.Dirent[]): boolean
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
/** Workflows live anywhere under the component root. */
directoryList(): string[]
⋮----
looksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapters/claude-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import type { BundleAdapter } from "../bundle-adapter";
import { makeToolDirAdapter, type ToolDirLayout } from "./tool-dir-shared";
⋮----
function dirExists(p: string): boolean
⋮----
function claudeLooksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapters/dotenv-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import type { FileContext } from "../../../indexer/walk/file-context";
import { assetPathCandidatesForName, typeForStashDir } from "../../asset/asset-placement";
import { scanEnvKeyNames, toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import { sensitiveMarkerPath } from "../../sensitive-marker-path";
import type { BundleAdapter } from "../bundle-adapter";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { dangerousEnvKeyDiagnostics } from "./akm-lint";
import { hashContent } from "./shared";
⋮----
type DotenvType = "env" | "secret";
⋮----
function classify(relPath: string): DotenvType | null
⋮----
function hasSensitiveMarker(absPath: string, type: DotenvType): boolean
⋮----
function conceptIdForPath(type: DotenvType, relativePath: string): string
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
async function validate(_c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
directoryList(): string[]
⋮----
looksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapters/generic-files-adapter.ts
````typescript
import path from "node:path";
import type { FileContext } from "../../../indexer/walk/file-context";
import { parseFrontmatter } from "../../asset/frontmatter";
import { toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import { SCRIPT_EXTENSIONS } from "../../recognition-util";
import type { BundleAdapter } from "../bundle-adapter";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { hashContent, nonEmptyString, RESERVED_FILES, readTags, runBaseValidateChecks } from "./shared";
⋮----
type GenericType = "script" | "document" | "file";
⋮----
function isReserved(base: string): boolean
⋮----
function classify(ext: string): GenericType
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
looksLikeRoot(): boolean
````

## File: src/core/adapter/adapters/index.ts
````typescript
import { ADAPTER_ID_TABLE } from "../adapter-ids";
import type { BundleAdapter } from "../bundle-adapter";
import { agentSkillsAdapter } from "./agent-skills-adapter";
import { akmAdapter } from "./akm-adapter";
import { akmTaskAdapter } from "./akm-task-adapter";
import { akmWorkflowAdapter } from "./akm-workflow-adapter";
import { claudeAdapter } from "./claude-adapter";
import { dotenvAdapter } from "./dotenv-adapter";
import { genericFilesAdapter } from "./generic-files-adapter";
import { llmWikiAdapter } from "./llm-wiki-adapter";
import { okfAdapter } from "./okf-adapter";
import { opencodeAdapter } from "./opencode-adapter";
import { websiteSnapshotAdapter } from "./website-snapshot-adapter";
````

## File: src/core/adapter/adapters/llm-wiki-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { FileContext } from "../../../indexer/walk/file-context";
import { parseFrontmatter, parseFrontmatterBlock } from "../../asset/frontmatter";
import { markdownLinkTargets } from "../../asset/markdown-link-targets";
import { toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import type { BundleAdapter } from "../bundle-adapter";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { hashContent, nonEmptyString } from "./shared";
⋮----
function conceptIdOf(relPath: string): string
⋮----
/** The parsed wiki frontmatter fields the adapter reads (list-valued keys need a real YAML parse). */
interface WikiPageFrontmatter {
  description?: string;
  pageKind?: string;
  xrefs: string[];
  sources: string[];
  wikiRole?: string;
}
⋮----
/**
 * Parse a wiki page's frontmatter with a real YAML parser so list-valued keys
 * (`xrefs:`, `sources:`) round-trip (the project's hand-rolled `parseFrontmatter`
 * deliberately drops YAML lists — see `wiki.ts#parsePageFrontmatterYaml`).
 * Tolerant: malformed YAML / no frontmatter yields empty fields.
 */
function parseWikiFrontmatter(raw: string): WikiPageFrontmatter
⋮----
function isReservedRootFile(relPath: string): boolean
⋮----
function firstSegment(relPath: string): string
⋮----
function resolveXref(xref: string, bundleId: string): string | null
⋮----
/**
 * Resolve a page body's bundle-relative markdown links to component-root-relative
 * conceptIds. `/`-rooted links resolve from the component root; standard relative
 * links resolve against the linking page's own directory. External schemes,
 * anchors, non-`.md` targets, and links escaping the component root are dropped
 * (tolerant, §9). First-appearance order; duplicates collapse.
 */
⋮----
if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // external scheme
⋮----
/** Resolve a page's `xrefs` + body links into deduped target conceptIds (links = relationships, §9). */
⋮----
const push = (conceptId: string) =>
⋮----
/** Resolve a page's `sources:` entries (`raw/<slug>[.md]`) to raw conceptIds (citation edges). */
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
interface WikiValidateItem {
  relPath: string;
  conceptId: string;
  kind: "page" | "raw";
  fm: WikiPageFrontmatter;
  body: string;
}
⋮----
async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
/** The wiki owns its whole root (schema/index/log at root plus pages/ + raw/); one component. */
directoryList(_c: BundleComponent): string[]
⋮----
/** Install-time probe (§1.2): a root is an LLM Wiki when it has a root `schema.md` AND a `pages/` directory. */
looksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapters/okf-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import type { FileContext } from "../../../indexer/walk/file-context";
import { parseFrontmatter } from "../../asset/frontmatter";
import { markdownLinkTargets } from "../../asset/markdown-link-targets";
import { isRecord, toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import type { BundleAdapter } from "../bundle-adapter";
import type {
  BundleComponent,
  Diagnostic,
  IndexDocument,
  OkfSourceEntry,
  OkfVerifiedEntry,
  ValidateContext,
} from "../types";
import { hashContent, nonEmptyString, RESERVED_FILES, readTags, runBaseValidateChecks } from "./shared";
⋮----
function parseActorMapping(value: unknown): OkfVerifiedEntry | undefined
⋮----
function parseVerified(value: unknown): OkfVerifiedEntry[] | undefined
⋮----
function parseOkfSources(value: unknown): OkfSourceEntry[] | undefined
⋮----
function parseLifecycleStatus(value: unknown): "draft" | "stable" | "deprecated" | undefined
⋮----
function isReservedFileName(name: string): boolean
⋮----
export function resolveOkfLinks(body: string, fileRelPath: string): string[]
⋮----
// Drop anything that escapes the component root.
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
// `okf` owns `.md` only (extensions: [".md"]). No directory gate anywhere.
⋮----
// §5.1 BINDING: `type` from FRONTMATTER; default `knowledge` when absent.
⋮----
async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
/** OKF concepts live anywhere under the component root (§5). */
directoryList(_c: BundleComponent): string[]
⋮----
/**
   * Install-time probe. A root index is sufficient; an index-less root is also
   * OKF when it contains at least one conformant concept with a non-empty open
   * `type`. More-specific native adapters run before this portable baseline.
   */
looksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapters/opencode-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import type { BundleAdapter } from "../bundle-adapter";
import { makeToolDirAdapter, type ToolDirLayout } from "./tool-dir-shared";
⋮----
function fileExists(p: string): boolean
⋮----
function dirExists(p: string): boolean
⋮----
function opencodeLooksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapters/shared.ts
````typescript
import { createHash } from "node:crypto";
import { parseFrontmatter } from "../../asset/frontmatter";
import { checkUnquotedDescriptionColon } from "../../asset/frontmatter-lint";
import type { FileChange } from "../../file-change";
import type { BundleComponent, Diagnostic, ValidateContext } from "../types";
⋮----
export function hashContent(content: string): string
⋮----
export function nonEmptyString(value: unknown): string | undefined
⋮----
export function readTags(value: unknown): string[] | undefined
⋮----
function checkMissingUpdated(data: Record<string, unknown>, frontmatterText: string | null): boolean
⋮----
function findStalePathCandidates(body: string): string[]
⋮----
// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop
⋮----
/** See file header: same intent as `markdown-insertion.ts#findFenceRegions`, not byte-identical. */
function stripFencedBlocksSimple(body: string): string
⋮----
// Ref-token grammar — copied from `base-linter.ts`'s `BUNDLE_REF_RE`
⋮----
function isNonRefConceptId(conceptId: string): boolean
⋮----
function extractProseRefTokens(text: string): string[]
⋮----
function refTokenFromListValue(value: string): string | null
⋮----
function readRefStringOrArray(value: unknown): string[] | null
⋮----
export interface ParsedForValidate {
  data: Record<string, unknown>;
  content: string;
  frontmatter: string | null;
}
⋮----
export async function runBaseValidateChecks(
  relPath: string,
  parsed: ParsedForValidate,
  componentRoot: string,
  ctx: ValidateContext,
): Promise<Diagnostic[]>
⋮----
export async function validateChangesWithBaseChecks(
  c: BundleComponent,
  changes: FileChange[],
  ctx: ValidateContext,
): Promise<Diagnostic[]>
````

## File: src/core/adapter/adapters/tool-dir-shared.ts
````typescript
import path from "node:path";
import type { AdapterRenderedExecutionSource } from "../../../execution/source";
import type { FileContext } from "../../../indexer/walk/file-context";
import { parseFrontmatter } from "../../asset/frontmatter";
import { toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import type { BundleAdapter } from "../bundle-adapter";
import { executionDefaultsFromFrontmatter, renderMarkdownExecutionSource } from "../execution-source";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { skillDirectoryDiagnostics } from "./akm-lint";
import { hashContent, nonEmptyString, RESERVED_FILES, readTags, runBaseValidateChecks } from "./shared";
⋮----
export interface ToolDirLayout {
  adapterId: string;

  componentId: string;

  instructionFile: string;

  instructionConceptId: string;

  commandDirs: ReadonlySet<string>;

  agentDirs: ReadonlySet<string>;

  skillDirs: ReadonlySet<string>;
}
⋮----
type ToolDirType = "instruction" | "command" | "agent" | "skill";
⋮----
interface ToolDirClassification {
  type: ToolDirType;
  conceptId: string;
  name: string;
}
⋮----
function isReserved(base: string): boolean
⋮----
function classify(relPath: string, layout: ToolDirLayout): ToolDirClassification | null
⋮----
/** recognize() for a tool-dir adapter: derive the open `type`, project the OKF-shaped fields. */
export function recognizeToolDir(layout: ToolDirLayout, c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
// For a skill, `name` is the frontmatter `name` (== dir name); otherwise the
// basename-derived concept name.
⋮----
export function readCandidatesToolDir(layout: ToolDirLayout, c: BundleComponent, conceptId: string)
⋮----
function nameOrSignalDiagnostics(
  type: "command" | "agent",
  relPath: string,
  data: Record<string, unknown>,
  body: string,
): Diagnostic[]
⋮----
export async function validateToolDir(
  layout: ToolDirLayout,
  c: BundleComponent,
  changes: FileChange[],
  ctx: ValidateContext,
): Promise<Diagnostic[]>
⋮----
export function renderToolDirExecutionSource(
  layout: ToolDirLayout,
  c: BundleComponent,
  file: FileContext,
): AdapterRenderedExecutionSource | null
⋮----
export function makeToolDirAdapter(layout: ToolDirLayout, looksLikeRoot: (root: string) => boolean): BundleAdapter
````

## File: src/core/adapter/adapters/website-snapshot-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { FileContext } from "../../../indexer/walk/file-context";
import { parseFrontmatter, parseFrontmatterBlock } from "../../asset/frontmatter";
import { toPosix } from "../../common";
import type { FileChange } from "../../file-change";
import type { BundleAdapter } from "../bundle-adapter";
import type { BundleComponent, Diagnostic, IndexDocument, ValidateContext } from "../types";
import { hashContent, nonEmptyString, runBaseValidateChecks } from "./shared";
⋮----
interface SnapshotFrontmatter {
  title?: string;
  description?: string;
  sourceUrl?: string;
  tags: string[];
}
⋮----
function parseSnapshotFrontmatter(raw: string): SnapshotFrontmatter
⋮----
function isSnapshotPage(relPath: string): boolean
⋮----
function isReTypeGated(fm: SnapshotFrontmatter): boolean
⋮----
function conceptIdOf(relPath: string): string
⋮----
function recognize(c: BundleComponent, file: FileContext): IndexDocument | null
⋮----
async function validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>
⋮----
readCandidates(c: BundleComponent, conceptId: string)
⋮----
// The snapshot is READ-ONLY (Mode A). Export (Mode B) routes content through
// the DESTINATION adapter, which owns placement.
⋮----
/**
   * Install-time probe (§1.2): a root carrying the snapshot provenance
   * `manifest.json` (`{url, fetchedAt}`). No other bundle root carries this
   * exact marker, so the probe is unambiguous.
   */
looksLikeRoot(root: string): boolean
````

## File: src/core/adapter/adapter-ids.ts
````typescript

````

## File: src/core/adapter/bundle-adapter.ts
````typescript
import type { AdapterRenderedExecutionSource } from "../../execution/source";
⋮----
import type { FileContext } from "../../indexer/walk/file-context";
import type { FileChange } from "../file-change";
import type { BundleComponent, BundleInstallation, Diagnostic, IndexDocument, ValidateContext } from "./types";
⋮----
export interface AdapterReadCandidate {
  path: string;

  conceptId: string;
}
⋮----
export interface BundleAdapter {
  readonly id: string;

  readonly version: string;

  readonly extensions: readonly string[];



  recognize(c: BundleComponent, file: FileContext): IndexDocument | null;










  index?(inst: BundleInstallation, c: BundleComponent): AsyncIterable<IndexDocument>;



  affectedItems?(c: BundleComponent, changedPaths: string[]): string[];







  validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>;





  renderExecutionSource?(c: BundleComponent, file: FileContext): AdapterRenderedExecutionSource | null;





  readCandidates?(c: BundleComponent, conceptId: string): AdapterReadCandidate[];



  directoryList?(c: BundleComponent): string[];

  looksLikeRoot?(root: string): boolean;








}
⋮----
recognize(c: BundleComponent, file: FileContext): IndexDocument | null;
⋮----
index?(inst: BundleInstallation, c: BundleComponent): AsyncIterable<IndexDocument>;
⋮----
affectedItems?(c: BundleComponent, changedPaths: string[]): string[];
⋮----
validate(c: BundleComponent, changes: FileChange[], ctx: ValidateContext): Promise<Diagnostic[]>;
⋮----
renderExecutionSource?(c: BundleComponent, file: FileContext): AdapterRenderedExecutionSource | null;
⋮----
readCandidates?(c: BundleComponent, conceptId: string): AdapterReadCandidate[];
⋮----
directoryList?(c: BundleComponent): string[];
⋮----
looksLikeRoot?(root: string): boolean;
````

## File: src/core/adapter/detect-adapter.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { adapterForId, getAdapters } from "./registry";
import type { BundleComponent } from "./types";
⋮----
function hasExtraAkmContent(root: string, winnerId: string): boolean
⋮----
export function detectAdapterId(root: string, fallback = "akm"): string
````

## File: src/core/adapter/execution-source.ts
````typescript
import { createHash } from "node:crypto";
import { isMap, isScalar, parseDocument, visit } from "yaml";
import {
  cloneExecutionJson,
  cloneExecutionJsonObject,
  type ExecutionJsonObject,
  type ExecutionJsonValue,
} from "../../execution/json";
import { type StrictRecordSnapshot, snapshotStrictRecord } from "../../execution/record";
import {
  type AdapterRenderedCommandSource,
  type AdapterRenderedExecutionSource,
  type AdapterRenderedPersonaSource,
  createAdapterRenderedExecutionSource,
  type ExecutionSourceIdentity,
  type UnresolvedExecutionDefaults,
  warnRetiredEngineKey,
} from "../../execution/source";
import { UsageError } from "../errors";
import { warnOnce } from "../warn";
⋮----
interface ParsedExecutionMarkdown {
  readonly content: string;
  readonly data: Readonly<Record<string, unknown>>;
}
⋮----
function nextLine(text: string, start: number):
⋮----
export function parseExecutionMarkdown(raw: string, filePath?: string): ParsedExecutionMarkdown
⋮----
function own(data: StrictRecordSnapshot, key: string): boolean
⋮----
function requireMetadataMapping(value: unknown, path: string): StrictRecordSnapshot
⋮----
function nullableString(value: unknown, path: string): string | null
⋮----
function nullableObject(value: unknown, path: string): ExecutionJsonObject | null
⋮----
function nullableTimeout(value: unknown, path: string): string | number | null
⋮----
export function executionDefaultsFromFrontmatter(
  data: Readonly<Record<string, unknown>>,
  options: {
    readonly kind: "command" | "persona";
    readonly allowTopLevelEngine?: boolean;
  },
): UnresolvedExecutionDefaults
⋮----
type DefaultsProjection =
  | UnresolvedExecutionDefaults
  | ((data: Readonly<Record<string, unknown>>) => UnresolvedExecutionDefaults);
⋮----
export interface RenderMarkdownExecutionSourceInput {
  readonly kind: "command" | "persona";

  readonly raw: string;
  readonly identity: Omit<ExecutionSourceIdentity, "hash">;
  readonly defaults?: DefaultsProjection;
}
⋮----
export function renderMarkdownExecutionSource(
  input: RenderMarkdownExecutionSourceInput & { readonly kind: "command" },
): AdapterRenderedCommandSource;
export function renderMarkdownExecutionSource(
  input: RenderMarkdownExecutionSourceInput & { readonly kind: "persona" },
): AdapterRenderedPersonaSource;
export function renderMarkdownExecutionSource(
  input: RenderMarkdownExecutionSourceInput,
): AdapterRenderedExecutionSource;
export function renderMarkdownExecutionSource(
  input: RenderMarkdownExecutionSourceInput,
): AdapterRenderedExecutionSource
````

## File: src/core/adapter/recognize-match.ts
````typescript
import type { AssetMatcher, FileContext, MatchResult } from "../../indexer/walk/file-context";
import { directoryMatcher, extensionMatcher, parentDirHintMatcher, smartMdMatcher } from "../../indexer/walk/matchers";
⋮----
function winningMatch(hits: Array<
⋮----
export function recognizeMatch(file: FileContext): MatchResult | null
````

## File: src/core/adapter/registry.ts
````typescript
import { BUILTIN_ADAPTERS } from "./adapters";
import type { BundleAdapter } from "./bundle-adapter";
⋮----
export function getAdapters(): BundleAdapter[]
⋮----
export function adapterForId(id: string): BundleAdapter | undefined
````

## File: src/core/adapter/types.ts
````typescript
import type { TocHeading } from "../asset/markdown";
⋮----
export type BundleId = string;
⋮----
export type ComponentId = string;
⋮----
export type ItemRef = string;
⋮----
export interface BundleInstallation {
  id: BundleId;

  revision?: string;

  source?: string;
  components: BundleComponent[];
}
⋮----
export interface BundleComponent {
  id: ComponentId;

  adapter: string;

  root: string;
  writable: boolean;
}
⋮----
export interface StashIntent {
  when?: string;
  input?: string;
  output?: string;
}
⋮----
export interface AssetParameter {
  name: string;
  type?: string;
  description?: string;
  required?: boolean;
  default?: string;
}
⋮----
export interface StashEntryScope {
  user?: string;
  agent?: string;
  run?: string;
  channel?: string;
}
⋮----
export type ScopeKey = keyof StashEntryScope;
⋮----
export interface IndexDocument {


  ref?: ItemRef;
  bundle?: BundleId;

  component?: ComponentId;

  conceptId?: string;

  path?: string;
  hash?: string;
  adapterId?: string;





  ownsPresentation?: boolean;



  type: string;

  name: string;

  description?: string;

  tags?: string[];

  hints?: string[];

  content?: string;







  contentTruncated?: boolean;


  examples?: string[];
  searchHints?: string[];
  intent?: StashIntent;
  filename?: string;










  quality?: "generated" | "curated" | "enriched" | "proposed" | (string & {});
  confidence?: number;
  source?: "package" | "frontmatter" | "comments" | "filename" | "manual" | "llm";
  aliases?: string[];
  toc?: TocHeading[];
  usage?: string[];

  run?: string;

  setup?: string;

  cwd?: string;

  fileSize?: number;

  parameters?: AssetParameter[];





  scope?: StashEntryScope;





  wikiRole?: "schema" | "index" | "log" | "raw" | "page";





  pageKind?: string;

  xrefs?: string[];

  sources?: string[];








  category?: string;
  beliefState?: "active" | "asserted" | "deprecated" | "superseded" | "contradicted" | "archived" | (string & {});
  supersededBy?: string[];
  contradictedBy?: string[];
  currentBeliefRefs?: string[];






  captureMode?: "hot" | "background";





  whenToUse?: string;





  lessonStrength?: number;




  evidenceSources?: string[];

  evidence?: string;








  derivedFrom?: string;

  pinned?: boolean;

  updated?: string;

  links?: string[];

  uses?: string[];
















  provenance?: OkfProvenance;

  lifecycleStatus?: "draft" | "stable" | "deprecated";

  staleAfter?: string;

  okfVersion?: string;

  documentJson?: unknown;
}
⋮----
export interface OkfSourceEntry {
  resource: string;
  id?: string;
  title?: string;
  author?: string;
  usage_count?: number;
  last_modified?: string;
}
⋮----
export interface OkfVerifiedEntry {
  by: string;
  at?: string;
}
⋮----
export interface OkfProvenance {
  sources?: OkfSourceEntry[];
  generatedBy?: string;
  generatedAt?: string;
  verified?: OkfVerifiedEntry[];
}
⋮----
export interface ValidateContext {




  readFile(path: string): Promise<string | Uint8Array | null>;
  list(dir: string): Promise<string[]>;

  resolveRef(ref: string): Promise<{ exists: boolean; path?: string }>;
}
⋮----
readFile(path: string): Promise<string | Uint8Array | null>;
list(dir: string): Promise<string[]>;
⋮----
resolveRef(ref: string): Promise<
⋮----
export interface Diagnostic {
  file: string;
  issue: string;
  detail: string;

  fixed: boolean | "failed";









  line?: number;
}
````

## File: src/core/adapter/validate-context.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { assetPathForName, stashDirFor } from "../asset/asset-placement";
import { typeNameFromConceptId } from "../asset/resolve-ref";
import { toPosix } from "../common";
import type { FileChange } from "../file-change";
import type { ValidateContext } from "./types";
⋮----
type OverlayValue = string | null;
⋮----
function buildOverlay(root: string, changes: readonly FileChange[]): Map<string, OverlayValue>
⋮----
function readDisk(absPath: string): string | null
⋮----
function existsOnDiskOrOverlay(relPath: string, root: string, overlay: Map<string, OverlayValue> | null): boolean
⋮----
function refEscapesBundle(conceptId: string): boolean
⋮----
function candidateRelPaths(conceptId: string): string[]
⋮----
function stripFragment(ref: string): string
⋮----
function stripBundlePrefix(ref: string): string
⋮----
export interface ValidateContextOptions {

  root: string;

  extraRoots?: readonly string[];

  changes?: readonly FileChange[];
}
⋮----
export function createValidateContext(options: ValidateContextOptions): ValidateContext
⋮----
async function readFile(p: string): Promise<string | Uint8Array | null>
⋮----
async function list(dir: string): Promise<string[]>
⋮----
async function resolveRef(ref: string): Promise<
````

## File: src/core/asset/akm-markdown.ts
````typescript
import { isDeepStrictEqual } from "node:util";
import { parse as parseYaml } from "yaml";
import { localDateStamp } from "../common";
import { UsageError } from "../errors";
import { serializeFrontmatter } from "./asset-serialize";
import { parseFrontmatterBlock, replaceFrontmatterLine, spliceFrontmatterLine } from "./frontmatter";
⋮----
export function ensureAkmMarkdownType(content: string, type: string, now: Date = new Date()): string
⋮----
export function normalizeAkmMarkdown(content: string, type: string, now: Date = new Date()): string
⋮----
function documentLineEnding(text: string): "\r\n" | "\n"
⋮----
function parsesTo(text: string, intended: Record<string, unknown>): boolean
````

## File: src/core/asset/asset-create.ts
````typescript
import { UsageError } from "../errors";
⋮----
export function normalizeCreateSubPath(subPath: string | undefined): string
⋮----
/**
 * Enforce that an explicit, user-supplied name is a flat (single-segment)
 * name. A `/` in the name is rejected with guidance to use `--path`. Applied
 * at the command layer to the user's name only — system-derived names may nest.
 */
export function assertFlatAssetName(name: string | undefined): void
⋮----
/**
 * Combine a normalised `--path` subdirectory with a flat base name into the
 * nested asset name the path resolver expects. `subPath` may be `""`.
 */
export function combineCreatePath(subPath: string, baseName: string): string
````

## File: src/core/asset/asset-placement.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { toPosix } from "../common";
import { type KnownType, SCRIPT_EXTENSIONS, WORKFLOW_EXTENSIONS } from "../recognition-util";
⋮----
export interface AssetSpec {
  stashDir: string;
  isRelevantFile: (fileName: string) => boolean;
  toCanonicalName: (typeRoot: string, filePath: string) => string | undefined;
  toAssetPath: (typeRoot: string, name: string) => string;
}
⋮----
type _BuiltinPlacementKeysAreKnownTypes = keyof typeof BUILTIN_PLACEMENT_SPECS extends KnownType ? true : never;
⋮----
export function placementSpecFor(type: string): AssetSpec | undefined
⋮----
export function placementSpecList(): readonly AssetSpec[]
⋮----
export function placementTypes(): readonly string[]
⋮----
export function stashDirFor(type: string): string | undefined
⋮----
export function typeForStashDir(stashDir: string): string | undefined
⋮----
export function stashDirNames(): string[]
⋮----
export function registerAssetSpec(type: string, spec: AssetSpec): void
⋮----
export function deregisterAssetSpec(type: string): void
⋮----
export function isRelevantAssetFile(assetType: string, fileName: string): boolean
⋮----
export function deriveCanonicalAssetName(assetType: string, typeRoot: string, filePath: string): string | undefined
⋮----
export function deriveCanonicalAssetNameFromStashRoot(
  assetType: string,
  stashRoot: string,
  filePath: string,
): string | undefined
⋮----
export function assetPathForName(assetType: string, typeRoot: string, name: string): string
⋮----
export function assetPathCandidatesForName(assetType: string, typeRoot: string, name: string): string[]
````

## File: src/core/asset/asset-ref.ts
````typescript
import path from "node:path";
import { UsageError } from "../errors";
⋮----
function validateName(name: string): void
⋮----
function normalizeName(name: string): string
⋮----
export interface BundleRef {

  bundle?: string;

  conceptId: string;

  fragment?: string;
}
⋮----
export function isBundleSlug(s: string): boolean
⋮----
/** NFC-normalize + traversal/null-byte/drive-letter guard + path-normalize a concept id. */
function normalizeConceptId(raw: string): string
⋮----
/**
 * Build a fully-qualified (or short) bundle ref string from its components.
 *
 * Examples:
 *   makeBundleRef(undefined, "knowledge/http-caching")   → "knowledge/http-caching"
 *   makeBundleRef("core", "knowledge/http-caching")      → "core//knowledge/http-caching"
 *   makeBundleRef("core", "skills/review", "usage")      → "core//skills/review#usage"
 */
export function makeBundleRef(bundle: string | undefined, conceptId: string, fragment?: string): string
````

## File: src/core/asset/asset-serialize.ts
````typescript
import { stringify as yamlStringify } from "yaml";
⋮----
export function serializeFrontmatter(frontmatter: Record<string, unknown>): string
⋮----
export function serializeFrontmatterQuoted(frontmatter: Record<string, unknown>): string
⋮----
export function assembleAsset(frontmatter: Record<string, unknown>, body: string): string
⋮----
export function assembleAssetFromString(serializedFm: string, body: string): string
````

## File: src/core/asset/frontmatter-lint.ts
````typescript
import { isScalar, parseDocument } from "yaml";
⋮----
export function checkUnquotedDescriptionColon(frontmatterText: string | null): string | null
````

## File: src/core/asset/frontmatter.ts
````typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { asNonEmptyString, existingFileMode, writeFileAtomic } from "../common";
import { recordWrittenPath } from "../write-provenance";
import { assembleAsset, assembleAssetFromString, serializeFrontmatter } from "./asset-serialize";
⋮----
export interface SalienceSubSignals {
  novelty: number;
  magnitude: number;
  predictionError: number;
}
⋮----
export function parseFrontmatter(raw: string):
⋮----
export type FrontmatterDateKey = "observed" | "started" | "ended";
⋮----
export function readFrontmatterDate(fm: Record<string, unknown>, key: FrontmatterDateKey): string | undefined
⋮----
function normalizeYamlValues(value: unknown): unknown
⋮----
function parseFrontmatterLenient(frontmatter: string): Record<string, unknown>
⋮----
/**
 * Read a file, parse its frontmatter, let `mutator` compute the next
 * frontmatter object, and write the reassembled asset back to disk.
 *
 * This is the shared read→parse→mutate→write primitive. The `mutator` receives
 * the parsed result and returns either the next frontmatter object (to write)
 * or `null` to skip the write entirely (e.g. for idempotent no-ops). The body
 * content is preserved from the parse.
 *
 * A frontmatter mutation is a METADATA edit, not a content edit: when the file
 * already has a frontmatter block, only that block is replaced and the body
 * bytes are kept verbatim (routing through `assembleAsset` would strip the
 * body's leading blank lines and force a trailing newline, silently reshaping
 * assets whose writer used a different separator style). A file gaining its
 * FIRST frontmatter block goes through the canonical `assembleAsset` shape.
 *
 * @returns `true` if a write occurred, `false` if the mutator returned `null`.
 */
export function mutateFrontmatter(
  filePath: string,
  mutator: (parsed: ReturnType<typeof parseFrontmatter>) => Record<string, unknown> | null,
): boolean
⋮----
export function parseFrontmatterBlock(
  raw: string,
):
⋮----
// Empty frontmatter (---\n---): the content-bearing regex above requires at
// least one character between the fences. Handle the degenerate case so
// callers can reconstruct `---\nkey: val\n---\n\nbody` from a previously
// empty-frontmatter file without corrupting it by wrapping the entire raw
// string as body content.
⋮----
function countLines(text: string): number
⋮----
/**
 * Insert one `key: value` line just before the closing `---` of an existing
 * frontmatter block, leaving every other byte — YAML comments, quoting, key
 * order, line endings — untouched. Returns null when `raw` has no well-formed
 * block, so callers can fall back to a parse-and-serialize path.
 *
 * This is the source-preserving way to ADD a field to user-authored
 * frontmatter: round-tripping the mapping through the YAML serializer drops
 * comments and normalizes formatting, which is unacceptable for a write that
 * only needs to contribute one line. Shared by `ensureAkmMarkdownType`
 * (adding `type:` and `updated:` on write) and lint's `--fix` for
 * `missing-updated`. The new line takes the block's own line ending.
 */
export function spliceFrontmatterLine(raw: string, line: string): string | null
⋮----
// Alternating [line, eol, line, eol, …, line]: joining the parts back
// reproduces `raw` byte for byte, CRLF and all.
⋮----
/**
 * Replace the top-level `key:` line of an existing frontmatter block with
 * `line`, leaving every other byte untouched — the counterpart to
 * {@link spliceFrontmatterLine} for correcting a field's value in place.
 *
 * Only that one physical line is replaced, so a value that continues onto
 * further lines (a block sequence, a folded scalar) would be left dangling:
 * the caller must check that the result still parses to what it meant. Returns
 * null when `raw` has no well-formed block or no such line.
 */
export function replaceFrontmatterLine(raw: string, key: string, line: string): string | null
⋮----
/**
 * Replace the top-level blocks of `keys` in an existing frontmatter block with
 * `lines`, leaving every other byte untouched — the counterpart to
 * {@link spliceFrontmatterLine} for a write that owns whole keys, such as the
 * provenance stamp's `generated`, `verified` and `provenance`.
 *
 * A key's block is its `key:` line and the lines directly under it that
 * continue it: indented lines and `- ` items. Every such block is removed
 * wherever it sits, and `lines` are added just before the closing `---`, in the
 * block's own line ending. A block with a blank line or a comment inside it is
 * not removed whole, so the caller must check that the result still parses to
 * what it meant. Returns null when `raw` has no well-formed block.
 */
export function replaceFrontmatterBlocks(
  raw: string,
  keys: readonly string[],
  lines: readonly string[],
): string | null
⋮----
// One of the keys: drop its line and the lines that continue it.
⋮----
/**
 * Strip one layer of matching quotes — frontmatter list items are often quoted
 * refs. Written as an explicit char compare rather than a backreference regex
 * on purpose: `scripts/lint-repository-sql.ts`'s comment/string stripper has no
 * regex-literal awareness, so a literal holding an ODD number of quote
 * characters desyncs its state machine and corrupts every match after it.
 */
function unquote(value: string): string
⋮----
/**
 * Remove specific VALUES from one frontmatter list key, preserving every other
 * byte — the counterpart to {@link spliceFrontmatterLine} for the
 * `akm lint --prune-dangling-edges` repair (#884).
 *
 * Handles the three spellings a belief channel appears in: a block sequence
 * (`contradictedBy:\n  - a`), an inline flow (`contradictedBy: [a, b]`), and a
 * bare scalar (`contradictedBy: a`). When every value under the key is removed
 * the key itself goes too — an empty `contradictedBy: []` is not the same
 * assertion as no edge at all.
 *
 * Returns the rewritten source, or `null` when `raw` has no well-formed
 * frontmatter block or nothing matched, so the caller can leave the file
 * untouched and report the finding unfixed. Deliberately source-preserving:
 * these are user-authored memories, and a repair must not silently reformat
 * the frontmatter it was not asked to touch.
 */
export function removeFrontmatterListValues(raw: string, key: string, values: readonly string[]): string | null
⋮----
// Inline flow: contradictedBy: [a, b]
⋮----
// Bare scalar: contradictedBy: a
⋮----
// Block sequence: the key line, then `  - value` items.
⋮----
export function rewriteFrontmatterListValue(
  raw: string,
  key: string,
  replacements: ReadonlyMap<string, string>,
): string | null
⋮----
// Bare scalar: xrefs: a
⋮----
// Block sequence: the key line, then `  - value` items.
⋮----
export function parseYamlScalar(value: string): unknown
⋮----
function sha256Hex(content: string): string
⋮----
export function computeNormalizedContentHash(raw: string): string
⋮----
export function carryForwardBookkeepingFrontmatter(proposedRaw: string, liveRaw: string): string
⋮----
export function writeSalienceToFrontmatter(raw: string, score: number, inputs: SalienceSubSignals): string
⋮----
function roundTo2dp(n: number): number
````

## File: src/core/asset/markdown-fragments.ts
````typescript
import { createHash } from "node:crypto";
import { markdownHeadingSlug, parseMarkdownToc } from "./markdown";
⋮----
export interface MarkdownFragment {
  fragmentId: string;
  ordinal: number;
  startLine: number;
  endLine: number;

  headingSlug?: string;
  text: string;
  hash: string;
}
⋮----
function hash(text: string): string
⋮----
function uniqueSlugs(body: string): Map<number, string>
⋮----
interface Piece {
  lines: string[];
  startLine: number;
  headingSlug?: string;
}
⋮----
function textOf(lines: readonly string[]): string
⋮----
function splitPiece(piece: Piece, maxChars: number): Piece[]
⋮----
export function splitMarkdownFragmentStats(
  body: string,
  maxChars = MARKDOWN_FRAGMENT_MAX_CHARS,
):
⋮----
export function splitMarkdownFragments(body: string, maxChars = MARKDOWN_FRAGMENT_MAX_CHARS): MarkdownFragment[]
⋮----
export function fragmentForSelector(body: string, selector: string): MarkdownFragment | undefined
⋮----
export interface MarkdownLeadContext {
  content: string;
  truncated: boolean;
}
⋮----
export function buildMarkdownLeadContext(
  fragments: readonly MarkdownFragment[],
  selectedOrdinal: number,
  maxChars = MARKDOWN_FRAGMENT_CONTEXT_DEFAULT_MAX_CHARS,
): MarkdownLeadContext
````

## File: src/core/asset/markdown-link-targets.ts
````typescript
import { Marked } from "marked";
⋮----
export function markdownLinkTargets(body: string, references: boolean): string[]
````

## File: src/core/asset/markdown.ts
````typescript
import { parseFrontmatter } from "./frontmatter";
⋮----
export interface TocHeading {
  level: number;
  text: string;
  line: number;
}
⋮----
export interface KnowledgeToc {
  headings: TocHeading[];
  totalLines: number;
}
⋮----
export function markdownHeadingSlug(heading: string): string
⋮----
export function markdownFragmentSlugs(content: string): string[]
⋮----
/** One addressable heading: `slug` is what `<ref>#<slug>` selects, `startLine` its 1-based file line. */
export interface MarkdownTocEntry {
  level: number;
  text: string;
  slug: string;
  startLine: number;
}
⋮----
/**
 * The headings `extractSection` can select, with the slug it resolves each by.
 * A heading with no sluggable text has no selector, so it is left out.
 */
export function markdownToc(content: string): MarkdownTocEntry[]
⋮----
/** One slug per heading, in order; a heading with no sluggable text gets "". */
export function uniqueHeadingSlugs(headings: TocHeading[]): string[]
⋮----
// ── Parsing ─────────────────────────────────────────────────────────────────
⋮----
export function parseMarkdownToc(content: string): KnowledgeToc
⋮----
// Fenced code blocks follow CommonMark, so headings inside them are skipped:
// a fence opens with 3+ backticks or tildes indented at most 3 spaces (a
// backtick fence's info string has no backtick) and closes only on a line of
// the same character, at least as long, followed by nothing but whitespace.
⋮----
// ── Extraction ──────────────────────────────────────────────────────────────
⋮----
export function extractSection(
  content: string,
  heading: string,
):
⋮----
export function stripMarkdownFences(raw: string): string
````

## File: src/core/asset/memory-archive.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
⋮----
export function resetMemoryArchiveCache(): void
⋮----
export function archivedOriginalPaths(root: string): Set<string>
⋮----
export function isArchivedRelPath(relPath: string, root: string): boolean
````

## File: src/core/asset/resolve-ref.ts
````typescript
import { NotFoundError, UsageError } from "../errors";
import {
  deriveCanonicalAssetNameFromStashRoot,
  placementSpecFor,
  stashDirFor,
  typeForStashDir,
} from "./asset-placement";
import { type BundleRef, isBundleSlug, parseBundleRef } from "./asset-ref";
⋮----
export interface AssetRef {
  type: string;
  name: string;
  origin?: string;
}
⋮----
export interface RefResolutionBundle {
  id: string;
  hasConcept(conceptId: string): boolean;
}
⋮----
hasConcept(conceptId: string): boolean;
⋮----
export interface RefContext {
  bundles: readonly RefResolutionBundle[];
  defaultBundle?: string;
  only?: string;
}
⋮----
export type ResolvedRef = BundleRef & { bundle: string };
⋮----
export function resolveRef(input: string | BundleRef, ctx: RefContext): ResolvedRef
⋮----
function notFound(conceptId: string, triedForms: string[], ctx: RefContext): NotFoundError
⋮----
export interface DisplayRefItem {

  type: string;

  name: string;




  conceptId?: string;





  bundleId?: string;
}
⋮----
export function conceptIdFromTypeName(type: string, name: string): string
⋮----
export function conceptIdForStashFile(type: string, stashRoot: string, filePath: string): string
⋮----
export function displayRef(item: DisplayRefItem, defaultBundleId?: string): string
⋮----
export function displayRefForConceptId(
  conceptId: string,
  bundleId: string | undefined,
  defaultBundleId?: string,
): string
⋮----
export interface AssetRefParts {
  type: string;
  name: string;
}
⋮----
export function typeNameFromConceptId(conceptId: string): AssetRefParts | undefined
⋮----
function opaqueRefParts(conceptId: string, allowRoot = false): AssetRefParts | undefined
⋮----
export function parseRefInput(raw: string, originGiven = false): AssetRef
⋮----
export function parseQualifiedRefInput(raw: string): AssetRef
⋮----
export function isFullRefInput(raw: string): boolean
````

## File: src/core/asset/stash-meta.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { isWithin } from "../common";
import { UsageError } from "../errors";
⋮----
export interface MetaRef {

  origin?: string;

  name: string;
}
⋮----
export interface ResolvedMetaFile {
  path: string;
  content: string;
}
⋮----
export function parseMetaRef(ref: string): MetaRef | null
⋮----
function assertSafeMetaName(name: string): void
⋮----
function metaCandidates(name: string): string[]
⋮----
export function resolveMetaFilePath(sourceRoot: string, name: string): string | null
⋮----
export function readMetaFile(sourceRoot: string, name: string): ResolvedMetaFile | null
⋮----
function isSafeRegularMetaFile(sourceRoot: string, metaRoot: string, filePath: string): boolean
⋮----
function statOrNull(filePath: string): fs.Stats | null
⋮----
function metaPathEscape(): UsageError
````

## File: src/core/config/schema/connections.ts
````typescript
import { z } from "zod";
import { WORKFLOW_MAX_TIMEOUT_MS } from "../../../workflows/resource-limits";
import {
  connectionEndpoint,
  engineName,
  envReferenceApiKey,
  nonEmptyString,
  positiveInt,
  retiredApiKeyFile,
} from "./primitives";
````

## File: src/core/config/schema/embedding.ts
````typescript
import { z } from "zod";
import { envReferenceApiKey, positiveInt } from "./primitives";
````

## File: src/core/config/schema/experimental.ts
````typescript
import { z } from "zod";
````

## File: src/core/config/schema/feedback.ts
````typescript
import { z } from "zod";
````

## File: src/core/config/schema/harnesses.ts
````typescript
import { z } from "zod";
import { HARNESS_CONFIG_PLATFORMS } from "../../../integrations/harnesses";
import { ModelAliasesSchema, timeoutMsField } from "./connections";
import { engineName, nonEmptyString } from "./primitives";
⋮----
export function harnessNameProblem(name: string, harness:
````

## File: src/core/config/schema/improve-processes.ts
````typescript
import { z } from "zod";
import { IMPROVE_PROCESS_NAMES } from "../engine-semantics";
import { nonEmptyString, positiveInt } from "./primitives";
⋮----
function rejectExcludeRefPrefixesOutsideReflect(value: Record<string, unknown>, ctx: z.RefinementCtx): void
````

## File: src/core/config/schema/improve.ts
````typescript
import { z } from "zod";
import { ImproveProfileConfigSchema } from "./improve-processes";
import { engineName, LlmInvocationOverridesSchema, nonEmptyString, nonNegativeNumber, positiveInt } from "./primitives";
````

## File: src/core/config/schema/index-config.ts
````typescript
import { z } from "zod";
import { LlmInvocationOverridesSchema, nonEmptyString, positiveInt } from "./primitives";
⋮----
type IndexConfigOutput = {
  [key: string]: unknown;
  connection?: string;
  model?: string;
  timeoutMs?: number | null;
  llm?: z.infer<typeof LlmInvocationOverridesSchema>;
  memory?: z.infer<typeof IndexPassConfigSchema>;
};
````

## File: src/core/config/schema/output.ts
````typescript
import { z } from "zod";
````

## File: src/core/config/schema/primitives.ts
````typescript
import { z } from "zod";
import { validateExtraParams } from "../../extra-params";
import { redactUrlCredentials } from "../../redaction";
import { isSecretRefToken } from "../../ref-token";
import { warnOnce } from "../../warn";
import { ENGINE_NAME_PATTERN_SOURCE } from "../engine-semantics";
⋮----
export function isApiKeyReference(value: string): boolean
⋮----
export function isEnvReference(value: string): boolean
⋮----
export function envReferenceName(value: string): string | undefined
````

## File: src/core/config/schema/scheduler.ts
````typescript
import { z } from "zod";
import { nonEmptyString } from "./primitives";
````

## File: src/core/config/schema/search.ts
````typescript
import { z } from "zod";
import { envReferenceApiKey, httpUrl, nonEmptyString, positiveInt } from "./primitives";
````

## File: src/core/config/schema/setup.ts
````typescript
import { z } from "zod";
````

## File: src/core/config/schema/sources-bundles.ts
````typescript
import { z } from "zod";
⋮----
import { VALID_ADAPTER_IDS } from "../../adapter/adapter-ids";
import { isBundleSlug } from "../../asset/asset-ref";
import { httpUrl, isApiKeyReference, nonEmptyString, positiveInt } from "./primitives";
````

## File: src/core/config/schema/workflow.ts
````typescript
import { z } from "zod";
import { positiveInt } from "./primitives";
````

## File: src/core/config/config-io.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { sleepSync } from "../../runtime";
import { isChmodUnsupported, readTextFile, stripJsonComments, writeFileAtomic } from "../common";
import { ConfigError } from "../errors";
import { createLockPayload, probeLock, reclaimStaleLock, releaseLock, tryAcquireLockSync } from "../file-lock";
import { getCacheDir, getConfigDir } from "../paths";
⋮----
export function readConfigText(configPath: string): string | undefined
⋮----
export function parseConfigText(text: string, sourcePath?: string): Record<string, unknown>
⋮----
function describeJsonRoot(value: unknown): string
⋮----
export function writeConfigAtomic(configPath: string, config: Record<string, unknown>): void
⋮----
export interface ConfigBackupResult {

  timestamped: string;

  latest: string;
}
⋮----
export function backupExistingConfig(configPath: string, now = new Date()): ConfigBackupResult | undefined
⋮----
export function copyToConfigBackups(source: string, name: (stamp: string) => string, now = new Date()): string
⋮----
function chmodIfSupported(target: string, mode: number): void
⋮----
function pruneOldBackups(backupDir: string): void
⋮----
function isTimestampedConfigBackup(name: string): boolean
⋮----
export function pruneToNewest(dir: string, keep: number, select: (entry: fs.Dirent) => boolean): void
⋮----
export function getConfigLockPath(): string
⋮----
function sleepSyncMs(ms: number): void
⋮----
export function acquireConfigLock(): () => void
⋮----
export function withConfigLock<T>(fn: () => T): T
````

## File: src/core/config/config-schema.ts
````typescript
import { z } from "zod";
import { BUILTIN_IMPROVE_STRATEGY_NAMES, REMOVED_IMPROVE_STRATEGY_NAMES } from "./engine-semantics";
import { ConnectionsSchema } from "./schema/connections";
import { EmbeddingConnectionConfigSchema } from "./schema/embedding";
import { ExperimentalConfigSchema } from "./schema/experimental";
import { FeedbackConfigSchema } from "./schema/feedback";
import { HarnessesSchema } from "./schema/harnesses";
import { ImproveConfigSchema } from "./schema/improve";
import { IndexConfigSchema } from "./schema/index-config";
import { OutputConfigSchema } from "./schema/output";
import { CURRENT_CONFIG_VERSION, nonEmptyString, nonNegativeNumber } from "./schema/primitives";
import { SchedulerConfigSchema } from "./schema/scheduler";
import { SearchConfigSchema } from "./schema/search";
import { SetupConfigSchema } from "./schema/setup";
import { BundlesConfigSchema, RegistryConfigEntrySchema } from "./schema/sources-bundles";
import { WorkflowConfigSchema } from "./schema/workflow";
⋮----
// `defaultBundle`, when present, must name a configured bundle.
⋮----
export type AkmConfigParsed = z.output<typeof AkmConfigSchema>;
⋮----
export interface ConfigValidationIssue {
  path: string;
  message: string;
}
⋮----
export function validateConfigShape(
  raw: unknown,
):
⋮----
export function listTopLevelConfigKeys(): string[]
````

## File: src/core/config/config-sources.ts
````typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "../errors";
import type { AkmConfig, BundleConfigEntry, ConfiguredSource, SourceConfigEntry, SourceSpec } from "./config-types";
⋮----
export function bundleComponentConfig(
  bundle: BundleConfigEntry | undefined,
):
⋮----
export function bundleContentRoot(entryPath: string, componentRoot?: string): string
⋮----
export function bundlePhysicalContentRoot(entryPath: string, componentRoot?: string): string
⋮----
export function isBundleEnabled(config: AkmConfig, bundleId: string): boolean
⋮----
export function bundleSourceId(config: AkmConfig, bundleId: string): string
⋮----
export function filesystemBundleSourceId(contentRoot: string): string
⋮----
function hashBundleSourceIdentity(identity: Readonly<Record<string, unknown>>): string
⋮----
export function primaryBundlePath(config: AkmConfig): string | undefined
⋮----
export function bundleContentRoots(config: AkmConfig):
⋮----
export function bundleKeyForContentRoot(config: AkmConfig, resolvedContentRoot: string): string | undefined
⋮----
export function bundlesToSourceEntries(config: AkmConfig): SourceConfigEntry[] | undefined
⋮----
export function bundleEntryToSourceEntry(
  key: string,
  bundle: BundleConfigEntry,
  isPrimary = false,
): SourceConfigEntry | undefined
⋮----
export function installedSourceDescriptor(
  source: string,
  ref: string | undefined,
  stashRoot: string,
): BundleConfigEntry
⋮----
function normalizeInstalledGitRef(source: string, ref: string): string
⋮----
/**
 * Produce a stable internal identifier for a provider projection. Current
 * bundle-derived entries always carry `name`; the hash protects manually
 * constructed internal values.
 */
function deriveBundleName(entry: SourceConfigEntry): string
⋮----
export function parseSourceSpec(entry: SourceConfigEntry): SourceSpec | undefined
⋮----
export function resolveConfiguredSources(config: AkmConfig): ConfiguredSource[]
⋮----
export function resolveActiveConfiguredSources(config: AkmConfig): ConfiguredSource[]
⋮----
function toConfiguredSource(persisted: SourceConfigEntry, isPrimary: boolean): ConfiguredSource | undefined
````

## File: src/core/config/config-types.ts
````typescript
import type { z } from "zod";
⋮----
import { VALID_HARNESS_IDS } from "../../integrations/harnesses";
⋮----
export type HarnessId = (typeof VALID_HARNESS_IDS)[number];
⋮----
export type EmbeddingConnectionConfig = z.infer<typeof import("./config-schema").EmbeddingConnectionConfigSchema> & {
  readonly credentialName?: string;
};
⋮----
export type ConnectionConfig = z.infer<typeof import("./config-schema").ConnectionSchema>;
⋮----
export type HarnessConfig = NonNullable<z.infer<typeof import("./config-schema").HarnessesSchema>[string]>;
⋮----
export type ImproveProcessConfig = z.infer<typeof import("./config-schema").ImproveProcessConfigSchema>;
⋮----
export type ImproveProfileConfig = z.infer<typeof import("./config-schema").ImproveProfileConfigSchema>;
⋮----
export type RegistryConfigEntry = z.infer<typeof import("./config-schema").RegistryConfigEntrySchema>;
⋮----
export type BundleConfigEntry = z.infer<typeof import("./config-schema").BundleConfigEntrySchema>;
⋮----
export type SourceSpec =
  | { type: "filesystem"; path: string }
  | { type: "git"; url: string; ref?: string }
  | { type: "npm"; package: string; version?: string }
  | { type: "github"; owner: string; repo: string; ref?: string }
  | { type: "website"; url: string; maxPages?: number }
  | { type: "local"; path: string };
⋮----
export interface ConfiguredSource {

  name: string;

  type: string;

  source: SourceSpec;

  enabled?: boolean;

  writable?: boolean;

  primary?: boolean;

  options?: Record<string, unknown>;

  adapterId?: string;

  componentRoot?: string;
}
⋮----
export type SourceConfigEntry = z.infer<typeof import("./config-schema").SourceConfigEntrySchema>;
⋮----
export type OutputConfig = z.infer<typeof import("./config-schema").OutputConfigSchema>;
⋮----
export type IndexPassConfig = z.infer<typeof import("./config-schema").IndexPassConfigSchema>;
⋮----
export type IndexConfig = z.infer<typeof import("./config-schema").IndexConfigSchema>;
⋮----
export type ImproveConfig = z.infer<typeof import("./config-schema").ImproveConfigSchema>;
⋮----
export type ImproveWhere = z.infer<typeof import("./config-schema").ImproveWhereSchema>;
⋮----
export type SchedulerConfig = z.infer<typeof import("./config-schema").SchedulerConfigSchema>;
⋮----
export type AkmConfig = Partial<import("./config-schema").AkmConfigParsed> &
  Pick<import("./config-schema").AkmConfigParsed, "semanticSearchMode">;
````

## File: src/core/config/config-version.ts
````typescript
export function compareConfigVersion(
  a: string | number | undefined,
  b: string | number | undefined,
): -1 | 0 | 1 | undefined
⋮----
function normalize(value: string | number | undefined): number[] | undefined
````

## File: src/core/config/config-walker.ts
````typescript
import { z } from "zod";
import { isRecord } from "../common";
import { UsageError } from "../errors";
import { hasRegistryUrlCredentials, REGISTRY_CREDENTIALS_UNSUPPORTED } from "../registry-url";
import { warnOnce } from "../warn";
import { AkmConfigBaseSchema, type AkmConfigShape, listTopLevelConfigKeys } from "./config-schema";
import { deepMergeConfig } from "./deep-merge";
import { isEnvReference } from "./schema/primitives";
⋮----
type Path = string[];
⋮----
function parsePath(dotted: string): Path
⋮----
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny
⋮----
export function isOpaqueSchema(schema: z.ZodTypeAny): boolean
⋮----
export function resolveSchemaAt(path: Path, config?: Record<string, unknown>, raw?: string): z.ZodTypeAny | undefined
⋮----
function selectUnionObjectOption(
  candidates: z.ZodTypeAny[],
  segment: string,
  existing: unknown,
  raw?: string,
): z.ZodObject<z.ZodRawShape> | undefined
⋮----
export function configGet(config: Record<string, unknown>, dotted: string): unknown
⋮----
export function configSet(config: Record<string, unknown>, dotted: string, raw: string): Record<string, unknown>
⋮----
function isTriageJudgmentPath(path: Path): boolean
⋮----
export function configUnset(config: Record<string, unknown>, dotted: string): Record<string, unknown>
⋮----
function isCredentialPath(path: Path): boolean
⋮----
function rejectApiKeyPath(path: Path, raw: string, dotted: string): void
⋮----
function holdsLiteralApiKey(value: unknown): boolean
⋮----
function rejectLiteralApiKeyInWholeObjectSet(path: Path, raw: string, dotted: string): void
⋮----
function rejectRegistryCredentialValue(value: unknown, dotted: string): void
⋮----
function bestEffortJsonValue(raw: string): unknown
⋮----
function coerceForSchema(schema: z.ZodTypeAny, raw: string, key: string): unknown
⋮----
function setPath(config: Record<string, unknown>, path: Path, value: unknown): Record<string, unknown>
⋮----
function unsetPath(config: Record<string, unknown>, path: Path): Record<string, unknown>
⋮----
export function unknownKeyHint(): string
````

## File: src/core/config/config.ts
````typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { isBundleSlug } from "../asset/asset-ref";
import { deriveBundleId } from "../bundle-id";
import { isRecord, resolveStashDir } from "../common";
import { ConfigError, UsageError } from "../errors";
import { isRefToken, substituteRefTokens } from "../ref-token";
import { formatRegistryLabel, hasRegistryUrlCredentials } from "../registry-url";
import {
  acquireConfigLock,
  backupExistingConfig,
  parseConfigText,
  readConfigText,
  withConfigLock,
  writeConfigAtomic,
} from "./config-io";
import { AkmConfigSchema, CURRENT_CONFIG_VERSION } from "./config-schema";
import {
  bundleComponentConfig,
  bundleContentRoot,
  bundleContentRoots,
  bundleSourceId,
  bundlesToSourceEntries,
  filesystemBundleSourceId,
  isBundleEnabled,
} from "./config-sources";
import type {
  AkmConfig,
  BundleConfigEntry,
  ConnectionConfig,
  HarnessConfig,
  ImproveProcessConfig,
  ImproveProfileConfig,
  RegistryConfigEntry,
  SourceConfigEntry,
} from "./config-types";
import { isOpaqueSchema, resolveSchemaAt } from "./config-walker";
import { convertEngineConfig, type EngineTarget } from "./convert-engines";
import { fileFlatCredentials, writeCredential } from "./credentials";
import { deepMergeConfig, isPlainObject } from "./deep-merge";
import { documentEndpoint, planKeyMoves } from "./migrate-keys";
import { modelsFileExists, readModelsFile, retireModelsFile } from "./models-file";
import { type EngineTargets, rememberEngineTargets, rememberedEngineTargets } from "./retired-engines";
import { dropUnusableEntries, findUnusableEntries, type UnusableEntry } from "./unusable-entries";
⋮----
import { getConfigPath } from "../paths";
import { warn, warnOnce } from "../warn";
⋮----
export function resetConfigCache(): void
⋮----
export function inheritedConnectionsOf(config: AkmConfig): ReadonlySet<string>
⋮----
export function isInheritedConnection(name: string): boolean
⋮----
export function loadUserConfig(): AkmConfig
⋮----
function runConfigFilePipeline(text: string, sourcePath?: string): Record<string, unknown>
⋮----
function readConfigFile(text: string, sourcePath?: string): Record<string, unknown>
⋮----
function modelsOverlay(): unknown
⋮----
function inheritedEntries(
  document: Record<string, unknown>,
  configPath: string,
):
⋮----
export function retiredEngineTargets(): EngineTargets
⋮----
function readRetiredEngines(raw: Record<string, unknown>, sourcePath?: string): Record<string, unknown>
⋮----
export function liftRetiredSecretRef(value: string): string | undefined
⋮----
function readRetiredSecretRefs(node: unknown, keyPath: readonly string[], sourcePath?: string): unknown
⋮----
function readConfigVersion(raw: Record<string, unknown>, sourcePath?: string): Record<string, unknown>
⋮----
function buildEffectiveConfig(liftedLocalRaw: Record<string, unknown>, sourcePath?: string): AkmConfig
⋮----
export function unknownConfigKeyPaths(
  root: Record<string, unknown>,
  node: Record<string, unknown> = root,
  prefix: readonly string[] = [],
): string[][]
⋮----
function warnUnknownConfigKeys(raw: Record<string, unknown>, sourcePath?: string): void
⋮----
function deleteConfigPath(node: Record<string, unknown>, keyPath: readonly string[]): void
⋮----
function isPlainConfigObject(value: unknown): value is Record<string, unknown>
⋮----
function assertUniquePhysicalBundleRoots(config: AkmConfig, sourcePath?: string): void
⋮----
export function parseAndValidateConfigText(text: string, sourcePath?: string): AkmConfig
⋮----
interface ConfigLayer {

  ref: string | undefined;

  raw: Record<string, unknown>;
}
⋮----
function collectExtendsLayers(localRaw: Record<string, unknown>, configPath: string | undefined): ConfigLayer[]
⋮----
function resolveExtendsChain(
  localRaw: Record<string, unknown>,
  configPath: string | undefined,
): Record<string, unknown>
⋮----
function sanitizeInheritedConfig(raw: Record<string, unknown>, label: string): Record<string, unknown>
⋮----
function expandExtendsHomePath(p: string): string
⋮----
function looksLikeBundleAssetRef(ref: string): boolean
⋮----
function resolveConfigRefSource(
  ref: string,
  context: Record<string, unknown>,
  fromConfigPath: string | undefined,
  containmentRoot?: string,
):
⋮----
function resolveConfigFileRefSource(
  ref: string,
  fromConfigPath: string | undefined,
  containmentRoot?: string,
):
⋮----
function resolveConfigBundleRefSource(
  ref: string,
  context: Record<string, unknown>,
  outerContainmentRoot?: string,
):
⋮----
function assertConfigExtendsPhysicalContainment(root: string, candidate: string, ref: string): void
⋮----
export function getConfigValueSource(dotted: string): string
⋮----
function hasRawPath(raw: unknown, segments: string[]): boolean
⋮----
export function getSources(config: AkmConfig): SourceConfigEntry[]
⋮----
export function getEffectiveRegistries(config: AkmConfig): RegistryConfigEntry[]
⋮----
type NamedKeys<T> = keyof {
  [K in keyof T as string extends K ? never : number extends K ? never : K]: unknown;
};
export type ImproveProcessName = NamedKeys<NonNullable<ImproveProfileConfig["processes"]>>;
⋮----
export function getImproveProcessConfig(
  processName: ImproveProcessName,
  selected?: ImproveProfileConfig,
): ImproveProcessConfig | undefined
⋮----
function defaultEntry<T>(entries: Record<string, T> | undefined):
⋮----
export function ambiguousDefaultAdvice(config: AkmConfig): string | undefined
⋮----
export function defaultConnection(config: AkmConfig):
⋮----
export function defaultHarness(config: AkmConfig):
⋮----
export function loadConfig(): AkmConfig
⋮----
export function saveConfig(config: AkmConfig): void
⋮----
function saveConfigReal(config: AkmConfig): void
⋮----
export function validateCompleteConfig(config: AkmConfig): AkmConfig
⋮----
export interface ConfigMutationResult {













  config: AkmConfig;
  written: boolean;
}
⋮----
function pruneUnchangedInheritedFields(before: unknown, after: unknown, localRaw: unknown): unknown
⋮----
function applyEdit(
  target: Record<string, unknown>,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  unremoved: string[][] = [],
  at: readonly string[] = [],
): void
⋮----
function followKeyOrder(target: Record<string, unknown>, order: Record<string, unknown>): void
⋮----
function editedConfigFile(
  document: Record<string, unknown> | undefined,
  current: AkmConfig,
  next: AkmConfig,
  persistTopLevelKeys: readonly (keyof AkmConfig)[] = [],
  unremoved: string[][] = [],
): Record<string, unknown>
⋮----
function refuseRemovalFromRetiredForm(
  unremoved: readonly string[][],
  document: Record<string, unknown> | undefined,
  converted: Record<string, unknown> | undefined,
): void
⋮----
function configWriteBody(
  localRaw: Record<string, unknown> | undefined,
  current: AkmConfig,
  next: AkmConfig,
  persistTopLevelKeys: readonly (keyof AkmConfig)[] = [],
): AkmConfig
⋮----
export function unusableEntryAt(
  key: string,
): (UnusableEntry &
⋮----
export interface ConfigFileNormalization {

  readonly keys: readonly string[];
  readonly changed: boolean;
  readonly applied: boolean;
  readonly backupPath?: string;

  readonly credentials?: readonly string[];

  readonly credentialsBackupPath?: string;

  readonly modelsFileBackupPath?: string;

  readonly engineTargets?: Readonly<Record<string, EngineTarget>>;

  readonly notes?: readonly string[];
}
⋮----
export interface NormalizeConfigOptions {
  readonly apply: boolean;
  readonly resolveFromStore?: SecretStoreResolver;
}
⋮----
function keepUnusableEntries(
  body: Record<string, unknown>,
  localRaw: Record<string, unknown>,
  current: AkmConfig,
  notes: string[],
): void
⋮----
export function normalizeConfigFile(configPath: string, options: NormalizeConfigOptions): ConfigFileNormalization
⋮----
export function mutateConfig(
  mutate: (current: AkmConfig) => AkmConfig,
  options?: { absentNoop?: boolean },
): ConfigMutationResult
⋮----
export async function mutateConfigWithPrecommit<T>(
  mutate: (current: AkmConfig) => AkmConfig,
  precommit: (next: AkmConfig) => Promise<T>,
  options?: { persistTopLevelKeys?: readonly (keyof AkmConfig)[] },
): Promise<ConfigMutationResult &
⋮----
export function schedulerSourceIdFor(config: AkmConfig, bundleId: string): string | undefined
⋮----
export function sanitizeConfigForWrite(config: AkmConfig, options?:
⋮----
export function updateConfig(partial: Partial<AkmConfig>): AkmConfig
⋮----
export type SecretStoreResolver = (ref: string) => string | null;
⋮----
export function resolveSecret(value: string | undefined, resolveFromStore?: SecretStoreResolver): string | undefined
````

## File: src/core/config/convert-engine-references.ts
````typescript
import { isDeepStrictEqual } from "node:util";
import { isRecord } from "../common";
import { type Conversion, type Dict, type EngineTarget, objectAt, str } from "./convert-engines-shared";
⋮----
export type Retarget = (holder: unknown, where: string, harnessOk?: boolean) => void;
⋮----
export function retargeter(conversion: Conversion, target: (engine: string) => EngineTarget | undefined): Retarget
⋮----
export function moveStrategyExecution(improve: Dict, conversion: Conversion, retarget: Retarget): void
⋮----
const hoist = (holder: unknown, from: string, place: string, destination: () => Dict): void =>
const processEntry = (name: string)
⋮----
export function improveStrategyDefault(out: Dict, defaults: Dict, improve: unknown): void
⋮----
export function dropJudgeEngine(out: Dict, conversion: Conversion): void
⋮----
export function convertIndexEngines(out: Dict, conversion: Conversion, retarget: Retarget): void
````

## File: src/core/config/convert-engines-shared.ts
````typescript
import { isRecord } from "../common";
import { normalizeExtraParamKey } from "../extra-params";
import { inferenceWireFields, type LlmInference } from "../llm-inference";
⋮----
export type Dict = Record<string, unknown>;
⋮----
export type EngineTarget = { readonly connection: string } | { readonly harness: string };
⋮----
export interface Entries {
  readonly connections: Dict;
  readonly harnesses: Dict;
}
⋮----
export interface Conversion {
  readonly notes: string[];
  changed: boolean;
}
⋮----
export const str = (value: unknown): string | undefined
⋮----
export const asDict = (value: unknown): Dict => (isRecord(value) ? (value as Dict) :
⋮----
export function wireFieldsOf(inference: LlmInference, where: string, notes: string[]): Dict
⋮----
export function objectAt(holder: Dict, key: string): Dict
````

## File: src/core/config/convert-engines.ts
````typescript
import { isRecord } from "../common";
import type { LlmInference } from "../llm-inference";
import {
  convertIndexEngines,
  dropJudgeEngine,
  improveStrategyDefault,
  moveStrategyExecution,
  retargeter,
} from "./convert-engine-references";
import {
  asDict,
  type Conversion,
  type Dict,
  type EngineTarget,
  type Entries,
  str,
  wireFieldsOf,
} from "./convert-engines-shared";
import { foldEngineModels, foldModelsOverlay, type OwnModels } from "./convert-models-overlay";
import { deepMergeConfig } from "./deep-merge";
import { isEnvReference } from "./schema/primitives";
⋮----
export interface ConvertEnginesOptions {

  readonly modelsOverlay?: unknown;




  readonly inherited?: { readonly connections?: Dict; readonly harnesses?: Dict };

  readonly env?: NodeJS.ProcessEnv;
}
⋮----
export interface EngineKey {

  readonly engine: string;

  readonly connection: string;
  readonly field: "apiKey" | "apiKeyFile";
}
⋮----
export interface ConvertEnginesResult {
  readonly config: Dict;
  readonly notes: string[];

  readonly changed: boolean;

  readonly keys: readonly EngineKey[];

  readonly targets: Readonly<Record<string, EngineTarget>>;
}
⋮----
function implicitKeyVariables(name: string, defaults: Dict): string[]
⋮----
interface Converted {
  readonly connections: Dict;
  readonly harnesses: Dict;

  readonly runtimes: Map<string, string | undefined>;

  readonly keyHolders: Array<{ engine: string; field: EngineKey["field"] }>;

  readonly ownModelOf: Array<{ kind: "connections" | "harnesses"; engine: string; model: string }>;
}
⋮----
interface Naming {
  readonly defaultConnection: string | undefined;
  readonly defaultHarness: string | undefined;
  readonly connectionName: (name: string) => string;
  readonly harnessName: (name: string) => string;
  readonly connections: Dict;
  readonly harnesses: Dict;
  readonly keys: readonly EngineKey[];

  readonly target: (engine: string) => EngineTarget | undefined;
}
⋮----
function runtimeEngine(name: string, engine: Dict, converted: Converted, conversion: Conversion): void
⋮----
function agentEngineToHarness(name: string, engine: Dict, converted: Converted): void
⋮----
function carryEngineKey(
  name: string,
  engine: Dict,
  connection: Dict,
  defaults: Dict,
  env: NodeJS.ProcessEnv | undefined,
  converted: Converted,
  conversion: Conversion,
): void
⋮----
function llmEngineToConnection(
  name: string,
  engine: Dict,
  defaults: Dict,
  env: NodeJS.ProcessEnv | undefined,
  converted: Converted,
  conversion: Conversion,
): void
⋮----
function convertEngines(
  engines: Dict,
  defaults: Dict,
  env: NodeJS.ProcessEnv | undefined,
  conversion: Conversion,
): Converted
⋮----
function renameMap(
  names: readonly string[],
  taken: readonly string[],
  from: string | undefined,
): (name: string) => string
⋮----
function nameDefaults(defaults: Dict, converted: Converted, conversion: Conversion, written: Entries): Naming
⋮----
const renamed = (entries: Dict, name: (engine: string)
⋮----
const target = (engine: string): EngineTarget | undefined =>
⋮----
function mergeWritten(out: Dict, naming: Naming): Entries
⋮----
function ownModelsOf(converted: Converted, naming: Naming): OwnModels
⋮----
export function convertEngineConfig(raw: Dict, options: ConvertEnginesOptions =
````

## File: src/core/config/convert-models-overlay.ts
````typescript
import { getHarness } from "../../integrations/harnesses";
import { isRecord } from "../common";
import type { LlmInference } from "../llm-inference";
import { type Conversion, type Dict, type Entries, str, wireFieldsOf } from "./convert-engines-shared";
import { modelForEveryAlias } from "./model-aliases";
⋮----
const allAliases = (model: string | undefined): Dict | undefined
⋮----
function modelEntry(model: string, fields: Dict): unknown
⋮----
function modelsOf(entry: Dict): Dict
⋮----
const hasModel = (entry: unknown, alias: string): boolean
⋮----
function overlayRows(modelsOverlay: unknown): Array<
⋮----
const rank = (column: string): number
⋮----
export type OwnModels = { readonly connections: Map<string, string>; readonly harnesses: Map<string, string> };
⋮----
export interface ModelsFold {
  readonly conversion: Conversion;
  readonly merged: Entries;

  readonly written: Entries;

  readonly inherited: Entries;
  readonly ownModels: OwnModels;

  readonly renamed: {
    readonly runtime: readonly string[];
    readonly connection: (engine: string) => string | undefined;
  };
}
⋮----
export function foldModelsOverlay(modelsOverlay: unknown, fold: ModelsFold): void
⋮----
const configNames = (own: Dict, base: Dict, name: string, alias: string): boolean
const platformOf = (name: string): string
⋮----
export function foldEngineModels(merged: Entries, ownModels: OwnModels): void
````

## File: src/core/config/credentials.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { isRecord, writeFileAtomic } from "../common";
import { sameEndpoint } from "../endpoint-url";
import { ConfigError } from "../errors";
import { getConfigDir } from "../paths";
import { collectSensitiveValues, redactUrlCredentials } from "../redaction";
import { warnOnce } from "../warn";
import { isInheritedConnection } from "./config";
import { copyToConfigBackups } from "./config-io";
import type { AkmConfig } from "./config-types";
import { envReferenceName, isEnvReference } from "./schema/primitives";
⋮----
export type CredentialSlot = { readonly connection: string } | { readonly service: "embedding" | "curateRerank" };
⋮----
export interface StoredCredential {
  readonly key: string;
  readonly endpoint: string;
}
⋮----
function storePath(): string
⋮----
function namespaceOf(slot: CredentialSlot):
⋮----
function describeSlot(slot: CredentialSlot): string
⋮----
type StoreRead = { readonly entries: Record<string, unknown> } | { readonly problem: string };
⋮----
function readStore(): StoreRead
⋮----
function writeStore(entries: Record<string, unknown>): void
⋮----
function groupOf(entries: Record<string, unknown>, group: (typeof NAMESPACES)[number]): Record<string, unknown>
⋮----
function isStoredCredential(value: unknown): value is StoredCredential
⋮----
export function storedCredential(slot: CredentialSlot): StoredCredential | undefined
⋮----
export function readCredential(slot: CredentialSlot, endpoint: string, storedKey?: boolean): string | undefined
⋮----
function writableStore(): Record<string, unknown>
⋮----
export function writeCredential(slot: CredentialSlot, key: string, endpoint: string): void
⋮----
export function storedCredentials(): Array<
⋮----
export type SlotStanding = "free" | "same" | "different";
⋮----
export function slotStanding(
  slot: CredentialSlot,
  key: string,
  endpoint: string,
  ahead?: { readonly key: string; readonly endpoint: string },
): SlotStanding
⋮----
export function fileFlatCredentials(
  endpointOf: (slot: CredentialSlot) => string | undefined,
  apply: boolean,
  pending: ReadonlyArray<{ readonly slot: CredentialSlot; readonly value: string; readonly endpoint: string }> = [],
):
⋮----
const rank = (name: string): number =>
⋮----
export function resolveApiKey(
  apiKey: string | undefined,
  slot: CredentialSlot,
  endpoint: string,
  env: NodeJS.ProcessEnv = process.env,
  quiet = false,
  storedKey?: boolean,
): string | undefined
⋮----
export function apiKeyReference(apiKey: string | undefined): string | undefined
⋮----
export function collectCredentialValues(
  config: Pick<AkmConfig, "connections" | "embedding" | "search">,
  env: NodeJS.ProcessEnv = process.env,
): string[]
````

## File: src/core/config/deep-merge.ts
````typescript
type ConfigObject = Record<string, unknown>;
⋮----
export function isPlainObject(value: unknown): value is ConfigObject
⋮----
function copyConfigValue(value: unknown): unknown
⋮----
export function deepMergeConfig(base: ConfigObject, override: ConfigObject): ConfigObject
````

## File: src/core/config/engine-semantics.ts
````typescript

````

## File: src/core/config/experimental.ts
````typescript
export interface ExperimentalConfigHolder {
  experimental?: { improveAutonomy?: boolean | undefined } | undefined;
}
⋮----
export function isImproveAutonomyEnabled(config: ExperimentalConfigHolder | undefined): boolean
````

## File: src/core/config/migrate-keys.ts
````typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isRecord } from "../common";
import { sameEndpoint } from "../endpoint-url";
import { redactUrlCredentials } from "../redaction";
import { isSecretRefToken } from "../ref-token";
import type { ConvertEnginesResult } from "./convert-engines";
import { type CredentialSlot, slotStanding } from "./credentials";
import { isEnvReference } from "./schema/primitives";
⋮----
type Dict = Record<string, unknown>;
⋮----
export interface MovedKey {

  readonly slot: CredentialSlot;
  readonly endpoint: string;

  readonly name: string;
  readonly value: string;

  readonly from: string;
}
⋮----
export interface KeyMovePlan {

  readonly config: Dict;
  readonly moves: readonly MovedKey[];
  readonly notes: readonly string[];
}
⋮----
export interface KeyMoveOptions {

  readonly resolveSecretRef?: (ref: string) => string | undefined;
}
⋮----
function readKeyFile(file: string): string | undefined
⋮----
/** A key held in the config itself: the literal, or the secret it references. */
function heldValue(value: string, options: KeyMoveOptions): string | undefined
⋮----
interface Candidate {
  readonly name: string;
  readonly slot: CredentialSlot;
  /** The endpoint of the block the key belongs to; none, and the key cannot be filed. */
  readonly endpoint: string | undefined;
  /** The endpoint the key was written for, when its source says one: an engine's own, read before anything the file says in the current form overlaid it. */
  readonly owner?: string | undefined;
  readonly from: string;
  /** The value, or why there is none. */
  readonly read: () => string | undefined;
  /** What it was read from, for a note when it cannot be. */
  readonly source: string;
  /** Remove it from the document, once it is filed. */
  readonly remove?: () => void;
  /** Put it back on the connection, when it is not filed: the conversion did not carry it. */
  readonly restore?: () => void;
  /** Where it stays when it is not filed, for the note: on the connection as the key it was, or where the document holds it. */
  readonly stays: string;
}
⋮----
/** The endpoint of the block the key belongs to; none, and the key cannot be filed. */
⋮----
/** The endpoint the key was written for, when its source says one: an engine's own, read before anything the file says in the current form overlaid it. */
⋮----
/** The value, or why there is none. */
⋮----
/** What it was read from, for a note when it cannot be. */
⋮----
/** Remove it from the document, once it is filed. */
⋮----
/** Put it back on the connection, when it is not filed: the conversion did not carry it. */
⋮----
/** Where it stays when it is not filed, for the note: on the connection as the key it was, or where the document holds it. */
⋮----
/** The keys of the converted document that are not `$VAR` references. */
function documentCandidates(config: Dict, options: KeyMoveOptions): Candidate[]
⋮----
export function documentEndpoint(config: Dict, slot: CredentialSlot): string | undefined
⋮----
function engineCandidates(
  original: Dict,
  converted: ConvertEnginesResult,
  config: Dict,
  options: KeyMoveOptions,
): Candidate[]
⋮----
export function planKeyMoves(
  original: Dict,
  converted: ConvertEnginesResult,
  options: KeyMoveOptions = {},
): KeyMovePlan
````

## File: src/core/config/model-aliases.ts
````typescript
export type StandardAlias = (typeof STANDARD_ALIASES)[number];
⋮----
export function modelForEveryAlias(model: string): Record<StandardAlias, string>
⋮----
export type ModelEntry = string | { readonly model: string; readonly [field: string]: unknown };
⋮----
export function entryModel(entry: ModelEntry): string
⋮----
export function entryWithModel(entry: ModelEntry | undefined, model: string): ModelEntry
````

## File: src/core/config/models-file.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { getConfigDir } from "../paths";
import { copyToConfigBackups } from "./config-io";
⋮----
function modelsFilePath(): string
⋮----
export function readModelsFile(): unknown
⋮----
export function modelsFileExists(): boolean
⋮----
export function retireModelsFile(now = new Date()): string
````

## File: src/core/config/retired-engines.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { isRecord } from "../common";
import { getDataDir } from "../paths";
import type { EngineTarget } from "./convert-engines-shared";
⋮----
export type EngineTargets = Readonly<Record<string, EngineTarget>>;
⋮----
function rememberedPath(): string
⋮----
function targetOf(value: unknown): EngineTarget | undefined
⋮----
export function rememberedEngineTargets(): EngineTargets
⋮----
export function rememberEngineTargets(targets: EngineTargets): void
⋮----
export function forgetEngineTargets(): void
````

## File: src/core/config/unusable-entries.ts
````typescript
import type { ZodError } from "zod";
import { isRecord } from "../common";
import { warnOnce } from "../warn";
import { ConnectionSchema } from "./schema/connections";
import { HarnessSchema, harnessNameProblem } from "./schema/harnesses";
import { engineName } from "./schema/primitives";
⋮----
type Dict = Record<string, unknown>;
⋮----
function firstIssue(error: ZodError): string
⋮----
function nameProblem(name: string): string | undefined
⋮----
function connectionProblem(name: string, entry: unknown): string | undefined
⋮----
function harnessProblem(name: string, entry: unknown): string | undefined
⋮----
export interface UnusableEntry {
  readonly kind: "connection" | "harness";
  readonly name: string;

  readonly why: string;
}
⋮----
export function findUnusableEntries(raw: Dict): UnusableEntry[]
⋮----
const check = (
    entries: unknown,
    kind: UnusableEntry["kind"],
    problem: (name: string, entry: unknown) => string | undefined,
): void =>
⋮----
export function dropUnusableEntries(raw: Dict, sourcePath?: string): Dict
````

## File: src/core/standards/resolve-standards-context.ts
````typescript
import { typeNameFromConceptId } from "../asset/resolve-ref";
import { resolveStashStandards } from "./resolve-stash-standards";
import { resolveTypeConventions, typeConventionRef } from "./resolve-type-conventions";
⋮----
function refType(ref: string | undefined): string | undefined
⋮----
export function resolveStandardsContext(ref: string | undefined, stashRoot: string): string
⋮----
// Soft, type-scoped guidance — clearly labeled and kept separate from the
// HARD (validator-enforced) rules that `authoringRulesForType` injects
// downstream. These facts are advice only; they never weaken the gate.
````

## File: src/core/standards/resolve-stash-standards.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "../asset/frontmatter";
⋮----
function collectMarkdownFiles(dir: string): string[]
⋮----
function toFactRef(factsRoot: string, absPath: string): string
⋮----
export function resolveStashStandards(stashRoot: string): string
⋮----
if (!trimmed) continue; // skip stub facts with frontmatter but no body
````

## File: src/core/standards/resolve-type-conventions.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { placementTypes } from "../asset/asset-placement";
import { parseFrontmatter } from "../asset/frontmatter";
⋮----
export function typeConventionRef(type: string): string
⋮----
export function resolveTypeConventions(stashRoot: string, type: string | undefined): string
⋮----
// Basename MUST be a known asset type — never resolve an arbitrary file.
⋮----
return ""; // missing dir/file or read error → degrade to empty
````

## File: src/core/state/migrations.ts
````typescript
import { assertMigrationRegistry, type Migration } from "../../storage/sqlite-migrations";
⋮----
export type StateMigrationSafety = "additive" | "data-preserving-rebuild" | "historical-destructive";
⋮----
function assertStateMigrationSafetyRegistry(): void
⋮----
export function getStateMigrationSafety(migrationId: string): StateMigrationSafety
````

## File: src/core/abort-deadline.ts
````typescript
export interface AbortDeadlineOptions {

  timeoutMs: number | null | undefined;

  reason: string;

  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}
⋮----
export interface AbortDeadline {

  disarm(): void;

  timedOut(): boolean;
}
⋮----
disarm(): void;
⋮----
timedOut(): boolean;
⋮----
export function armAbortDeadline(controller: AbortController, options: AbortDeadlineOptions): AbortDeadline
````

## File: src/core/assert.ts
````typescript
export function assertNever(x: never, context?: string): never
````

## File: src/core/authoring-rules.ts
````typescript
export function requiresDescription(type: string): boolean
⋮----
export function authoringRulesForType(type: string): string
````

## File: src/core/best-effort.ts
````typescript
import { isVerbose, warnVerbose } from "./warn";
⋮----
export function bestEffort<T>(fn: () => T, context?: string): T | undefined
⋮----
export async function bestEffortAsync<T>(fn: () => Promise<T>, context?: string): Promise<T | undefined>
````

## File: src/core/bundle-id.ts
````typescript
import crypto from "node:crypto";
import path from "node:path";
import { isBundleSlug } from "./asset/asset-ref";
import { UsageError } from "./errors";
⋮----
export function slugForPath(sourcePath: string): string
⋮----
export function slugForRegistryId(registryId: string): string
⋮----
function slugify(name: string): string
⋮----
/**
 * Enforce the `--name` contract on every add path (D6): an explicit name is
 * not a silent hint that may fall back to a derived id — it is a request
 * that either succeeds exactly or fails loudly, before anything is written.
 *
 * `existingKeyForThisInstall` is the bundle key this exact source (path/URL/
 * registry id) is already configured under, if any. Re-adding that same
 * source under a *different* explicit name is rejected in favor of
 * `akm bundle rename`, which is the one command allowed to change a bundle's
 * key. A caller with no existing install for this source (the common case)
 * omits it.
 */
export function validateExplicitBundleName(
  bundles: Readonly<Record<string, unknown>>,
  name: string,
  existingKeyForThisInstall?: string,
): void
⋮----
export function deriveBundleId(registryId: string | undefined, sourcePath: string, usedIds: Set<string>): string
⋮----
export function deriveBundleIds(sources: readonly
⋮----
function ensureUniqueId(preferred: string, sourcePath: string, used: Set<string>): string
⋮----
export function shortHash(input: string): string
````

## File: src/core/bundle-rename.ts
````typescript
import fs from "node:fs";
import type { TasksSyncResult } from "../commands/tasks/tasks";
import { readLockfile, renameLockEntry } from "../integrations/lockfile";
import {
  closeDatabase,
  openIndexDatabase,
  openReadonlyExistingDatabase,
} from "../storage/repositories/index-connection";
import { getFilePathsByBundle, renameEntriesBundleId } from "../storage/repositories/index-entries-repository";
import { countProposalsForBundleRename, renameProposalsBundleRef } from "../storage/repositories/proposals-repository";
import {
  countTaskHistoryTargetRefs,
  renameTaskHistoryTargetRefs,
} from "../storage/repositories/task-history-repository";
import { countWorkflowRunRefsForRename, renameWorkflowRunRefs } from "../storage/repositories/workflow-runs-repository";
import { selectBackend } from "../tasks/backends";
import type { InstalledSchedulerBinding, SchedulerBackend } from "../tasks/backends/types";
import { bundleRefToString, parseBundleRef } from "./asset/asset-ref";
import { validateExplicitBundleName } from "./bundle-id";
import type { AkmConfig, BundleConfigEntry } from "./config/config";
import { loadConfig, mutateConfig } from "./config/config";
import { NotFoundError, UsageError } from "./errors";
import { getDbPath } from "./paths";
import { getStateDbPath, withStateDb } from "./state-db";
⋮----
export interface BundleRenamePlan {
  oldId: string;
  newId: string;
  config: {
    defaultBundleChanges: boolean;
    defaultWriteTargetChanges: boolean;

    schedulerRefs: string[];
  };
  lock: { present: boolean };
  index: { entries: number };
  state: { proposalRefs: number; proposalTargets: number; taskHistoryRefs: number; workflowRunRefs: number };





  activeWorkflowRuns: Array<{ id: string; workflowRef: string; status: string }>;

  contentRefs: string[];







  nativeSchedulerRows: string[];
}
⋮----
export interface BundleRenameResult extends BundleRenamePlan {

  applied: boolean;











  taskSync?: { ok: boolean; result: TasksSyncResult } | { ok: false; error: string };
}
⋮----
function validateRename(config: AkmConfig, oldId: string, newId: string): void
⋮----
function bundleOfRef(ref: string): string | undefined
⋮----
function schedulerRefsToRewrite(config: AkmConfig, oldId: string): string[]
⋮----
function renameBundleInConfig(config: AkmConfig, oldId: string, newId: string): AkmConfig
⋮----
function filesStillMentioning(filePaths: string[], oldId: string): string[]
⋮----
function invocationNamesBundle(invocation: readonly string[] | undefined, bundleId: string): boolean
⋮----
async function nativeSchedulerRowsNamingBundle(sched: SchedulerBackend, oldId: string): Promise<string[]>
⋮----
async function buildPlan(
  config: AkmConfig,
  oldId: string,
  newId: string,
  sched: SchedulerBackend,
): Promise<BundleRenamePlan>
⋮----
function taskSyncErrorMessage(cause: unknown): string
⋮----
async function removeStaleNativeSchedulerRows(sched: SchedulerBackend, oldId: string): Promise<void>
⋮----
export async function renameBundle(
  oldId: string,
  newId: string,
  options: { dryRun?: boolean } = {},
  deps: {
    backend?: SchedulerBackend;
syncTasks: (newId: string, sched: SchedulerBackend)
````

## File: src/core/closest-match.ts
````typescript
function editDistance(a: string, b: string): number
⋮----
export function closestMatch(attempted: string, candidates: readonly string[], threshold: number): string | undefined
````

## File: src/core/common.ts
````typescript
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "./errors";
import { getConfigPath, getDefaultStashDir, getRegistryCacheDir, getRegistryIndexCacheDir } from "./paths";
⋮----
export function isHttpUrl(value: string | undefined): boolean
⋮----
export function isRemoteUrl(value: string | undefined): boolean
⋮----
export function readTextFileDescriptorWithLimit(
  fd: number,
  maxBytes: number,
  label = "File",
  displayPath = "(open file)",
): string
⋮----
export function readTextFile(filePath: string, label = "File"): string
⋮----
export function stripJsonComments(text: string): string
⋮----
export function existingFileMode(filePath: string): number
⋮----
export function writeFileAtomic(target: string, content: string | Buffer, mode?: number): void
⋮----
export function resolveStashDir(env: NodeJS.ProcessEnv = process.env): string
⋮----
function validateStashDir(raw: string): string
⋮----
function isValidDirectory(dir: string): boolean
⋮----
function readStashDirFromConfig(): string | undefined
⋮----
export function toPosix(input: string): string
⋮----
export function compareCodePoints(left: string, right: string): number
⋮----
export function hasErrnoCode(error: unknown, code: string): boolean
⋮----
export function isChmodUnsupported(error: unknown): boolean
⋮----
export function isWithin(candidate: string, root: string): boolean
⋮----
export function isAkmRegistryCachePath(filePath: string): boolean
⋮----
export function isContainedResolvedPath(resolvedCandidate: string, resolvedRoot: string): boolean
⋮----
// Compare the first SEGMENT, not a string prefix: `..data` and `...v2` are
// legal directory names, and only a leading `..` segment means the candidate
// climbed out of the root. Both separators, because `path.relative` answers
// in the host's spelling while callers may hold either.
⋮----
/**
 * Resolve symlinks on `p`, walking up to the closest existing ancestor when
 * `p` itself does not exist.  This ensures that comparisons between an
 * existing directory and a not-yet-created child path inside it are
 * consistent even when the directory hierarchy contains symlinks (e.g.
 * macOS /tmp → /private/tmp, or a HOME that is itself a symlink).
 */
export function safeRealpath(p: string): string
⋮----
// Path doesn't exist — resolve symlinks on the nearest existing ancestor
// and reconstruct the full path from there.
⋮----
// Reached filesystem root without finding an existing entry.
⋮----
// parent also doesn't exist; keep walking up
⋮----
function normalizeFsPathForComparison(value: string): string
⋮----
export async function fetchWithTimeout(
  url: string,
  opts?: RequestInit,
  timeoutMs: number | null = 30_000,
  signal?: AbortSignal,
): Promise<Response>
⋮----
const abortExternal = (): void
⋮----
export function shouldRetry(status: number): boolean
⋮----
export function backoffDelay(attempt: number, baseDelay = 500, maxDelayMs = DEFAULT_RETRY_MAX_DELAY_MS): number
⋮----
export function computeRetryDelay(
  response: Response,
  attempt: number,
  options?: { baseDelay?: number; maxDelayMs?: number },
): number
⋮----
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: { timeout?: number; retries?: number; baseDelay?: number; maxDelayMs?: number },
): Promise<Response>
⋮----
export function abortableDelay(ms: number, signal?: AbortSignal | null, abortMessage = "Aborted"): Promise<void>
⋮----
const onAbort = () =>
⋮----
export function tryReadStdinText(): string | undefined
⋮----
export class ResponseTooLargeError extends Error
⋮----
constructor(url: string, maxBytes: number, observedBytes: number | null)
⋮----
export class BodyReadTimeoutError extends Error
⋮----
constructor(url: string, timeoutMs: number)
⋮----
export interface BodyReadLimits {

  bodyTimeoutMs?: number;

  signal?: AbortSignal;
}
⋮----
function bodyAbortError(signal: AbortSignal | undefined, url: string): Error
⋮----
export async function readChunkWithDeadline<T>(
  reader: ReadableStreamDefaultReader<T>,
  deadlineAt: number | null,
  signal: AbortSignal | undefined,
  url: string,
  timeoutMs: number,
): Promise<Awaited<ReturnType<ReadableStreamDefaultReader<T>["read"]>>>
⋮----
type ReadResult = Awaited<ReturnType<ReadableStreamDefaultReader<T>["read"]>>;
⋮----
const cleanup = (): void =>
⋮----
export async function readBodyWithByteCap(
  response: Response,
  maxBytes = DEFAULT_RESPONSE_BYTE_CAP,
  limits?: BodyReadLimits,
): Promise<string>
⋮----
/**
 * Parse a Response body as JSON with a byte-count cap. A cheap wrapper
 * around {@link readBodyWithByteCap}; prefer this for registry index
 * fetches, GitHub API responses, and any other untrusted JSON source.
 */
export async function jsonWithByteCap<T = unknown>(
  response: Response,
  maxBytes = DEFAULT_RESPONSE_BYTE_CAP,
  limits?: BodyReadLimits,
): Promise<T>
⋮----
export function toErrorMessage(error: unknown): string
⋮----
// ── Date / timestamp utilities ───────────────────────────────────────────────
⋮----
/**
 * Return today's date in ISO-8601 format (`YYYY-MM-DD`).
 * Consolidates the `new Date().toISOString().slice(0, 10)` pattern that
 * appears at multiple call sites.
 */
export function todayIso(): string
⋮----
/**
 * `YYYY-MM-DD` in LOCAL time — deliberately not {@link todayIso}, which is
 * UTC and can differ near midnight. This is the spelling the `updated:`
 * frontmatter stampers share (`core/asset/akm-markdown.ts` on write,
 * `commands/lint/base-linter.ts` on `--fix`), so the field's format has one
 * definition even though the two stampers pick different instants (now vs
 * file mtime).
 */
export function localDateStamp(d: Date): string
⋮----
export function timestampForFilename(): string
⋮----
export function asNonEmptyString(value: unknown): string | undefined
⋮----
export function scanEnvKeyNames(text: string): string[]
⋮----
export function wellFormedUnicode(value: string): boolean
⋮----
export function isRecord(value: unknown): value is Record<string, unknown>
⋮----
export function asRecord(value: unknown): Record<string, unknown> | undefined
⋮----
function stripTrailingCommas(text: string): string
⋮----
/**
 * Parse JSONC: comments stripped by {@link stripJsonComments}, and trailing
 * commas (`[a, b,]`, `{"k": 1,}`) tolerated, as OpenCode's own `.jsonc` reader does.
 */
export function parseJsonc(text: string): unknown
⋮----
export function tryParseJson(raw: string): unknown
⋮----
export function stringArray(value: unknown): string[]
⋮----
export function isProcessAlive(pid: unknown): boolean
⋮----
export function daysToMs(days: number): number
⋮----
export function groupBy<T>(values: T[], keyFn: (value: T) => string): Map<string, T[]>
````

## File: src/core/concurrent.ts
````typescript
export function serializeByKey<T>(
  chains: Map<string, Promise<unknown>>,
  key: string,
  fn: () => Promise<T>,
): Promise<T>
⋮----
export async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = 1,
  opts?: { signal?: AbortSignal },
): Promise<Array<R | undefined>>
⋮----
async function worker(): Promise<void>
````

## File: src/core/content-safety.ts
````typescript
export function containsRedactedContent(content: string): boolean
⋮----
export function containsReflectPromptScaffolding(content: string): boolean
⋮----
export function generatedContentRejection(content: string): string | undefined
````

## File: src/core/endpoint-url.ts
````typescript
function parse(endpoint: string): URL | undefined
⋮----
function basePathname(url: URL): string
⋮----
function withPathname(url: URL, pathname: string): string
⋮----
// A bare host serializes with a "/" the endpoint never had.
⋮----
/** The base of an OpenAI-compatible endpoint: the URL without `/chat/completions`, `/embeddings` or a trailing slash. */
export function openAiBaseUrl(endpoint: string): string
⋮----
/** The URL of one operation (`chat/completions`, `models`) of the endpoint. */
export function openAiOperationUrl(endpoint: string, operation: "chat/completions" | "models"): string
⋮----
export function sameEndpoint(a: string, b: string): boolean
````

## File: src/core/env-secret-ref.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { type ConceptOwnerMatch, resolveConceptOwner } from "../indexer/lookup/adapter-concept-owner";
import { type SearchSource as IndexSearchSource, resolveSourceEntries } from "../indexer/search/search-source";
import { isFileOrFileSymlink } from "../indexer/walk/walker";
import { resolveSourcesForOrigin } from "../registry/origin-resolve";
import { assertFlatAssetName, combineCreatePath, normalizeCreateSubPath } from "./asset/asset-create";
import { assetPathForName, deriveCanonicalAssetName } from "./asset/asset-placement";
import { makeBundleRef, parseBundleRef } from "./asset/asset-ref";
import type { AssetRef } from "./asset/resolve-ref";
import { conceptIdFromTypeName, displayRef, parseRefInput, typeNameFromConceptId } from "./asset/resolve-ref";
import { isWithin } from "./common";
import { type AkmConfig, loadConfig } from "./config/config";
import { NotFoundError, UsageError } from "./errors";
import { resolveMutationTarget } from "./mutation-target";
import { sensitiveMarkerPath } from "./sensitive-marker-path";
import { formatRefForMessage, type ResolvedWriteTarget, withWriteTargetMutation } from "./write-source";
⋮----
export function listEnvsRecursive(
  listKeysFn: (envPath: string) => { keys: string[] },
  config: AkmConfig = loadConfig(),
): Array<
⋮----
const walk = (dir: string): void =>
⋮----
export function parseEnvRef(ref: string): AssetRef
⋮----
export function parseSecretRef(ref: string): AssetRef
⋮----
export function makeSecretRef(name: string, source?: IndexSearchSource): string
⋮----
function displayDefaultBundle(source?: IndexSearchSource, config: AkmConfig = loadConfig()): string | undefined
⋮----
export function resolveSecretPath(ref: string):
⋮----
export interface EnvWriteResolution {
  name: string;
  absPath: string;
  target: ResolvedWriteTarget;
  parsedRef: AssetRef;
  ref: string;
}
⋮----
export function resolveEnvWriteTarget(
  ref: string,
  writeTarget: string | undefined,
  create?: { subPath?: string },
): EnvWriteResolution
⋮----
export interface SecretWriteResolution {
  name: string;
  absPath: string;
  target: ResolvedWriteTarget;
  ref: string;
}
⋮----
export function resolveSecretWriteTarget(
  ref: string,
  writeTarget: string | undefined,
  create?: { subPath?: string },
): SecretWriteResolution
⋮----
export function withEnvSecretWrite<T>(
  target: ResolvedWriteTarget,
  ref: { type: "env" | "secret"; name: string },
  op: "Update" | "Remove",
  paths: string[],
  mutate: () => T,
): T
````

## File: src/core/errors.ts
````typescript
export type ConfigErrorCode =
  | "CONFIG_DIR_UNRESOLVABLE"
  | "STASH_DIR_NOT_FOUND"
  | "STASH_DIR_NOT_A_DIRECTORY"
  | "STASH_DIR_UNREADABLE"




  | "DATA_DIR_UNREADABLE"



  | "DATA_DIR_NOT_WRITABLE"
  | "INDEX_SCHEMA_INCOMPATIBLE"
  | "LLM_NOT_CONFIGURED"
  | "AGENT_NOT_CONFIGURED"

  | "SELECTION_NOT_CONFIGURED"
  | "INVALID_CONFIG_FILE"
  | "UNKNOWN_IMPROVE_STRATEGY"




  | "UNSAFE_STASH_DIR"




  | "TEST_ISOLATION_MISSING"


  | "UNSUPPORTED_PLATFORM"



  | "UPGRADE_BLOCKED"



  | "SECRET_REFERENCE_UNRESOLVED"


  | "REGISTRY_URL_INVALID";
⋮----
export type UsageErrorCode =
  | "INVALID_FLAG_VALUE"
  | "INVALID_SOURCE_VALUE"
  | "INVALID_FORMAT_VALUE"
  | "INVALID_DETAIL_VALUE"
  | "INVALID_JSON_CONFIG_VALUE"
  | "INVALID_JSON_ARGUMENT"
  | "MISSING_REQUIRED_ARGUMENT"
  | "MISSING_OR_AMBIGUOUS_TARGET"
  | "TARGET_NOT_UPDATABLE"
  | "PATH_ESCAPE_VIOLATION"
  | "RESOURCE_ALREADY_EXISTS"

  | "ASSET_CONTENT_CHANGED"
  | "TASK_SCHEMA_VERSION_UNSUPPORTED"
  | "INVALID_PROPOSAL"
  | "NON_INTERACTIVE_REQUIRES_YES"



  | "UNKNOWN_COMMAND"




  | "UNKNOWN_FLAG"






  | "COMPOSITION_INVALID"



  | "TASK_SOURCE_INVALID"




  | "TARGET_REF_INVALID"


  | "WORKFLOW_SOURCE_INVALID"


  | "INPUT_BINDING_INVALID"



  | "TASK_TARGET_UNSUPPORTED";
⋮----
export type TransientErrorCode =



  | "RUN_LEASE_HELD"






  | "STATE_DB_CONTENDED"












  | "INDEX_DB_CONTENDED"









  | "IMPROVE_LOCK_HELD"



  | "LOCKFILE_CONTENDED"



  | "ASSET_MUTATION_LEASE_HELD"



  | "SCHEDULER_LOCK_HELD"



  | "REGISTRY_UNREACHABLE";
⋮----
export type NotFoundErrorCode =
  | "ASSET_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  | "WORKFLOW_NOT_FOUND"
  | "PROPOSAL_NOT_FOUND"
  | "FILE_NOT_FOUND"
  | "IMPROVE_RUN_NOT_FOUND"


  | "REGISTRY_NOT_FOUND"




  | "REGISTRY_RESPONSE_INVALID";
⋮----
export type AkmErrorKind = "config" | "usage" | "not-found" | "transient";
⋮----
export abstract class AkmError extends Error
⋮----
abstract hint(): string | undefined;
⋮----
export class ConfigError extends AkmError
⋮----
constructor(msg: string, code: ConfigErrorCode = "INVALID_CONFIG_FILE", hint?: string)
hint(): string | undefined
⋮----
export class UsageError extends AkmError
⋮----
constructor(msg: string, code: UsageErrorCode = "INVALID_FLAG_VALUE", hint?: string)
⋮----
export class TransientError extends AkmError
⋮----
constructor(msg: string, code: TransientErrorCode, hint?: string)
⋮----
export class NotFoundError extends AkmError
⋮----
constructor(msg: string, code: NotFoundErrorCode = "ASSET_NOT_FOUND", hint?: string)
⋮----
export function isTestIsolationError(err: unknown): boolean
⋮----
export function rethrowIfTestIsolationError(err: unknown): void
⋮----
export function isDataDirUnreadableError(err: unknown): err is ConfigError
⋮----
export function rethrowIfDataDirUnreadable(err: unknown): void
````

## File: src/core/events-types.ts
````typescript
export interface EventEnvelope {
  schemaVersion: 1;
  id: number;
  ts: string;
  eventType: string;
  ref?: string;
  metadata?: Record<string, unknown>;
}
````

## File: src/core/events.ts
````typescript
import fs from "node:fs";
import { type Database, openDatabase } from "../storage/database";
import { insertEvent, readStateEvents } from "../storage/repositories/events-repository";
import { rethrowIfTestIsolationError } from "./errors";
import type { EventEnvelope } from "./events-types";
import { getStateDbPath, openStateDatabase, withStateDb } from "./state-db";
import { borrowScopedStateDb } from "./state-db-scope";
import { isReadOnlyFilesystemError } from "./system-error";
import { error } from "./warn";
⋮----
export type EventType =
  | "add"
  | "remove"
  | "update"
  | "remember"
  | "import"

  | "sync"
  | "feedback"




  | "promoted"
  | "rejected"
  | "reflect_invoked"
  | "propose_invoked"
  | "distill_invoked"
  | "workflow_started"

  | "workflow_step_completed"






  | "workflow_step_updated"
  | "workflow_finished"

  | "workflow_abandoned"





  | "workflow_unit_started"
  | "workflow_unit_finished"
  | "search"
  | "show"


  | "select"

  | "improve_skipped"





  | "proactive_selected"

  | "reflect_completed"
  | "improve_completed"

  | "proposal_orphan_purge"

  | "events_purged"

  | "proposal_creation_rejected"

  | "improve_reflect_outcome"

  | "llm_usage"

  | "llm_usage_summary"









  | "improve_salience_rank_change"





  | "extract_triaged"






  | "state_db_vacuumed"





  | "index_db_vacuumed"

  | "index_completed"











  | "asset_state_gc"
  | string;
⋮----
export interface AppendEventInput {
  eventType: EventType;

  ref?: string;

  metadata?: Record<string, unknown>;
}
⋮----
export interface EventsContext {

  now?: () => number;





  dbPath?: string;












  db?: Database;





  readOnly?: boolean;

  readOnlySnapshotUnavailable?: boolean;
}
⋮----
function resolveDbPath(ctx?: EventsContext): string
⋮----
function resolveNow(ctx?: EventsContext): () => number
⋮----
export function appendEvent(input: AppendEventInput, ctx?: EventsContext): void
⋮----
export interface ReadEventsOptions {

  since?: string;






  sinceOffset?: number;

  type?: string;

  ref?: string;

  excludeTags?: string[];

  includeTags?: string[];






  runId?: string;







  limit?: number;
}
⋮----
export interface ReadEventsResult {
  events: EventEnvelope[];






  nextOffset: number;
}
⋮----
export function readEvents(options: ReadEventsOptions =
````

## File: src/core/extra-params.ts
````typescript
function protectedKeyRemedy(normalized: string): string | undefined
⋮----
export interface ExtraParamsIssue {
  path: (string | number)[];
  message: string;
}
⋮----
export function normalizeExtraParamKey(key: string): string
⋮----
/** Validate provider extras without allowing them to override AKM fields or carry credentials. */
export function validateExtraParams(value: unknown): ExtraParamsIssue[]
⋮----
const visit = (entry: unknown, path: (string | number)[]): void =>
⋮----
export function formatExtraParamsIssue(label: string, issue: ExtraParamsIssue): string
````

## File: src/core/file-change.ts
````typescript
export type FileChangeOp = "create" | "update" | "delete";
⋮----
export function proposalContent(p:
⋮----
export interface FileChange {
  /**
   * Stash-relative path of the target file.
   *
   * For proposal-minted changes this is the mint-time resolution against the
   * proposal's OWN stash and is informational — the accept path re-resolves
   * the write target from config at apply time (and records the result on
   * `Proposal.acceptedTarget`).
   */
  path: string;
  /**
   * Content expected on disk BEFORE the change applies.
   *
   * Not populated (or persisted) at proposal-mint time — the mint-time
   * before-state is summarised by `Proposal.beforeHash` instead. The unified
   * transaction engine captures its own live `before` when a transaction
   * starts, for hash-verified rollback.
   */
  before?: string;
  /** Content the change writes. Absent for `op: "delete"`. */
  after?: string;
  op: FileChangeOp;
}
⋮----
/**
   * Stash-relative path of the target file.
   *
   * For proposal-minted changes this is the mint-time resolution against the
   * proposal's OWN stash and is informational — the accept path re-resolves
   * the write target from config at apply time (and records the result on
   * `Proposal.acceptedTarget`).
   */
⋮----
/**
   * Content expected on disk BEFORE the change applies.
   *
   * Not populated (or persisted) at proposal-mint time — the mint-time
   * before-state is summarised by `Proposal.beforeHash` instead. The unified
   * transaction engine captures its own live `before` when a transaction
   * starts, for hash-verified rollback.
   */
⋮----
/** Content the change writes. Absent for `op: "delete"`. */
````

## File: src/core/file-lock.ts
````typescript
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { isProcessAlive, MAX_LOCK_METADATA_BYTES, readTextFileDescriptorWithLimit } from "./common";
⋮----
export type LockProbeResult =
  | { state: "absent" }
  | {
      state: "held";
      holderPid: number;
      launcherPid?: number;
      ageMs: number;
      rawContent: string;
      identity: LockFileIdentity;
    }
  | {
      state: "stale";
      reason: "pid_dead" | "unreadable" | "invalid_pid";
      holderPid?: number;
      launcherPid?: number;
      ageMs?: number;
      rawContent?: string;
      identity?: LockFileIdentity;
    }
  | { state: "inaccessible"; code?: string };
⋮----
export interface ReclaimStaleLockOptions {

  afterQuarantineVerified?: () => void;
}
⋮----
export interface LockFileIdentity {
  dev: number;
  ino: number;
  size: number;
  mtimeMs: number;
}
⋮----
export interface LockOwnership {
  lockPath: string;
  rawContent: string;
  identity: LockFileIdentity;
}
⋮----
function readLockSnapshot(lockPath: string):
⋮----
function sameIdentity(left: LockFileIdentity, right: LockFileIdentity): boolean
⋮----
function releaseLockRaw(lockPath: string): void
⋮----
export function tryAcquireLockSync(lockPath: string, payload: string): LockOwnership | undefined
⋮----
export function launcherPidFromEnv(): number | undefined
⋮----
export function createLockPayload(metadata: Record<string, unknown> =
⋮----
export function probeLock(lockPath: string): LockProbeResult
⋮----
export function reclaimStaleLock(
  lockPath: string,
  probe: Extract<LockProbeResult, { state: "stale" }>,
  options?: ReclaimStaleLockOptions,
): boolean
⋮----
export function releaseLock(ownership: LockOwnership): void
⋮----
function extractLockIdentity(content: string):
````

## File: src/core/git-message.ts
````typescript
export function sanitizeCommitMessage(input: string): string
⋮----
// 1. Strip NULs outright.
⋮----
// 2. Replace CR/LF + other C0 control characters (0x00-0x1F, 0x7F) with a
//    space. Tab (0x09) is included intentionally — commit subjects should
//    be a single visual line.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional sanitization
⋮----
// 3. Collapse whitespace runs and trim.
````

## File: src/core/improve-result.ts
````typescript
import { cloneExecutionJsonObject } from "../execution/json";
import { isRecord } from "./common";
import { IMPROVE_PROCESS_NAMES } from "./config/engine-semantics";
import type { AkmImproveResult } from "./improve-types";
⋮----
export type ImproveResultEnvelope = AkmImproveResult;
⋮----
export interface DecodedImproveResult {
  envelope: ImproveResultEnvelope;
  strategy: string;
}
⋮----
function fail(message: string): never
⋮----
function requireExactFields(value: Record<string, unknown>, allowed: Set<string>): void
⋮----
function requireNumber(value: Record<string, unknown>, field: string, path: string): void
⋮----
function requireCount(value: Record<string, unknown>, field: string, path: string): void
⋮----
function validateLoweringNotices(value: unknown): void
⋮----
function validateConsolidationPlan(value: unknown): void
⋮----
function validateProactivePlan(value: unknown): void
⋮----
function validateProcessRoutingRows(value: unknown): void
⋮----
function validateImprovePlan(value: unknown, dryRun: boolean, plannedRefNames: readonly string[]): void
⋮----
function validateCommon(value: Record<string, unknown>): void
⋮----
export function decodeImproveResult(input: string | unknown): DecodedImproveResult
````

## File: src/core/improve-types.ts
````typescript
import type { LlmUsageCrossTabRow } from "../commands/health/types";
import type { EngineUnavailableProcess, ProcessRoutingRow } from "../commands/improve/improve-strategies";
import type { EligibilitySource, Proposal } from "../commands/proposal/proposal-types";
import type { LoweringNotice } from "../execution/resolved-request";
import type { MemoryInferenceResult } from "../indexer/passes/memory-inference";
import type { RunnerSpec } from "../integrations/agent/runner";
import type { AgentFailureReason } from "../integrations/agent/spawn";
import { assertNever } from "./assert";
⋮----
export type MemoryPruneReason = "duplicate-derived" | "superseded-derived" | "obsolete-derived";
⋮----
export type RetireArchiveReason = "duplicate" | "subsumed" | "superseded" | "promoted";
export type MemoryBeliefState = "active" | "asserted" | "deprecated" | "superseded" | "contradicted" | "archived";
⋮----
export interface MemoryPruneCandidate {
  ref: string;

  parentRef?: string;
  reason: MemoryPruneReason | RetireArchiveReason;
  survivorRef?: string;

  proposalId?: string;

  successorRefs?: string[];
}
⋮----
export interface MemoryConsolidationCandidate {
  parentRef: string;
  signal: string;
  refs: string[];
  suggestedSurvivorRef: string;
}
⋮----
export interface MemoryContradictionCandidate {
  ref: string;
  parentRef: string;
  reason: "contradicted-derived";
  contradictedByRef: string;
  contradictedByRefs: string[];
  currentBeliefRefs: string[];
}
⋮----
export interface MemoryBeliefStateTransition {
  ref: string;
  parentRef: string;
  fromState: Exclude<MemoryBeliefState, "archived">;
  toState: Exclude<MemoryBeliefState, "archived">;
  reason: "contradicted-derived" | "belief-refresh";
  relatedRef?: string;
  relatedRefs?: string[];
  currentBeliefRefs?: string[];
}
⋮----
export interface RelativeDateCandidate {
  ref: string;
  filePath: string;
  matches: string[];
}
⋮----
export interface DeadUrl {
  ref: string;
  url: string;
  status: number | "error" | "timeout";
}
⋮----
export interface DeadUrlCoverage {
  checked: number;
  total: number;
  skipped: number;
}
⋮----
export interface ArchivedMemoryCleanupRecord {
  ref: string;
  parentRef?: string;
  reason: MemoryPruneReason | RetireArchiveReason;
  beliefState: "archived";
  previousBeliefState: Exclude<MemoryBeliefState, "archived">;
  survivorRef?: string;
  originalPath: string;
  archivedPath: string;
  auditPath: string;
  archivedAt: string;

  proposalId?: string;

  successorRefs?: string[];






  retiredAt?: string;
}
⋮----
export interface ImproveEligibleRef {
  ref: string;
  reason: "scope-ref" | "scope-type" | "memory-cleanup" | "strategy_filtered_all_passes";






  filePath?: string;






  itemRef?: string;






  eligibilitySource?: EligibilitySource;
}
⋮----
export type ImprovePlanLane = EligibilitySource | "distill-only";
⋮----
export interface ImprovePlanGate {

  name: "profile" | "cleanup" | "validation" | "retrieval" | "signal" | "disk" | "limit";
  removed: number;
  reason: string;
}
⋮----
export interface ImproveIndexSnapshot {
  status: "ready" | "missing" | "incompatible" | "unknown";
  reason: string;
}
⋮----
export interface ImproveExecutionPlan {

  mode: "estimate" | "execution";

  dispatch: boolean;

  snapshot: ImproveIndexSnapshot;
  candidates: {

    rawInScope: number;

    selected: number;

    effective: number;
  };
  limits: {

    configured: { cli?: number; profile?: number; reflect?: number };

    effective?: number;

    additiveReplayAllowance: number;

    totalCeiling?: number;
  };
  gates: ImprovePlanGate[];
  effectiveRefs: Array<{ ref: string; lane: ImprovePlanLane; reason: ImproveEligibleRef["reason"] }>;









  processes: ProcessRoutingRow[];
  proactive?: {
    configured: { dueDays?: number; maxPerRun?: number };
    effective: { dueDays: number; maxPerRun: number };
    candidatePool: number;
    dueTotal: number;
    neverReflected: number;
    selected: number;
    selectedRefs: string[];
  };
  consolidation: {
    configured: {
      enabled?: boolean;
      limit?: number;
      maxChunkSize?: number;
    };
    effective: { enabled: boolean; limit?: number; chunkSize: number };
    poolSize: number;
    candidatePoolSize: number;
    gates: {
      profile: { passed: boolean; reason: string };
      delta: { passed: boolean; reason: string };
    };
    wouldRun: boolean;
    reason: string;
    estimatedChunks: number;
  };
  stages: Array<{
    name: "consolidation" | "extract" | "memory-inference";
    wouldRun: boolean;
    reason: string;
  }>;
  triage: {
    enabled: boolean;

    configuredMode: "queue" | "promote";

    mode: "queue" | "promote";
    maxAcceptsPerRun: number;
  };
}
⋮----
export type ImproveActionMode =
  | "reflect"
  | "reflect-failed"
  | "reflect-cooldown"
  | "reflect-skipped"
  | "reflect-guard-rejected"
  | "distill"
  | "distill-skipped"
  | "memory-prune"
  | "memory-inference"
  | "error";
⋮----
export type ImproveActionClass = "accepted" | "rejected" | "skipped" | "error" | "noop";
⋮----
export function classifyImproveAction(mode: ImproveActionMode): ImproveActionClass
⋮----
export type ConsolidateOpKind = "merge" | "delete" | "promote" | "contradict";
⋮----
export interface ConsolidateResult {
  schemaVersion: 1;
  ok: boolean;
  shape: "consolidate-result";
  dryRun: boolean;
  previewOnly: boolean;
  target: string;
  processed: number;
  merged: number;
  deleted: number;
  promoted: string[];

  failedPromotions?: number;

  contradicted: number;





  mergeFloorViolations?: number;













  failedChunks?: number;

  totalChunks?: number;







  judgedNoAction?: number;






  skipReasons?: Array<{
    ref: string;
    skips: Array<{ op: ConsolidateOpKind | "unknown"; reason: string }>;
  }>;












  mergedSecondaries?: number;









  failedChunkMemories?: number;

  deferredMemories?: number;







  prefilteredAlreadyPromoted?: number;

  planned?: { op: ConsolidateOpKind }[];
  warnings: string[];
  durationMs: number;

  notices?: readonly Readonly<LoweringNotice>[];






  perfTelemetry?: ConsolidatePerfTelemetry;

  pairPass?: ConsolidatePairPassResult;
}
⋮----
export type ConsolidatePairJudgeLabel =
  | "duplicate"
  | "subsumed"
  | "supersedes"
  | "contradicts"
  | "overlap"
  | "unrelated";
⋮----
export interface ConsolidatePairPassResult {

  initiators: number;

  initiatorsBacklog: number;

  pairsConsidered?: number;

  pairsJudged: number;

  labelCounts: Record<ConsolidatePairJudgeLabel, number>;

  retired: string[];

  failedJudgments: number;
}
⋮----
export interface ConsolidatePerfTelemetry {




  dedupPoolSize?: number;




  llmPoolSize?: number;





  embedMs?: number;




  embedCacheHits?: number;




  embedCacheMisses?: number;





  estimatedBudgetFractionUsed?: number;
}
⋮----
export type DistillOutcome =
  | "queued"
  | "skipped"
  | "config_disabled"
  | "llm_failed"
  | "validation_failed"
  | "quality_rejected"
  | "review_needed";
⋮----
export interface AkmDistillResult {
  schemaVersion: 1;
  ok: boolean;
  outcome: DistillOutcome;

  inputRef: string;

  proposalRef: string;

  proposalKind?: "lesson" | "knowledge";




  proposalId?: string;

  updatesExisting?: true;

  message?: string;

  skipReason?: string;

  findings?: { kind: string; field: string; message: string }[];





  proposal?: Proposal;






  filteredFeedbackCount?: number;







  feedbackFullyFiltered?: boolean;






  score?: number;



  reason?: string;





  rejectedContent?: string;






  descriptionSwapped?: number;

  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export interface ExtractedSessionResult {
  sessionId: string;
  harness: string;
  candidateCount: number;

  proposalIds: string[];

  previewRefs?: string[];

  blockedCount?: number;

  failedCount?: number;

  failedRejectedCount?: number;

  rationaleIfEmpty?: string;

  preFilter: { inputCount: number; outputCount: number; truncatedCount: number };
  warnings: string[];
  skipped?: boolean;
  skipReason?:
    | "read_failed"
    | "llm_unavailable"
    | "malformed_model_output"
    | "exception"
    | "already_extracted"
    | "too_short"
    | "triaged_out"
    | "locked_concurrent";

  sessionAssetRef?: string;

  sessionLogPath?: string;






  contentHash?: string;

  notices?: readonly Readonly<LoweringNotice>[];











  engine: string;
}
⋮----
export interface AkmExtractResult {
  schemaVersion: 1;










  ok: boolean;
  shape: "extract-result";
  dryRun: boolean;
  type: string;
  sessionsProcessed: number;
  sessionsSkipped: number;

  candidatesCreated: number;

  proposals: string[];
  sessions: ExtractedSessionResult[];
  warnings: string[];
  durationMs: number;

  notices?: readonly Readonly<LoweringNotice>[];








  skipReasons?: Partial<Record<NonNullable<ExtractedSessionResult["skipReason"]>, number>>;









  engine?: string;

  engineKind?: RunnerSpec["kind"];
}
⋮----
export interface AkmReflectFailure {
  schemaVersion: 2;
  ok: false;
  reason: AgentFailureReason;
  error: string;
  ref?: string;
  engine?: string;
  exitCode: number | null;
  stdout?: string;
  stderr?: string;

  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export interface AkmReflectSuccess {
  schemaVersion: 2;
  ok: true;
  proposal: Proposal;
  ref: string;
  engine: string;
  durationMs: number;

  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export type AkmReflectResult = AkmReflectSuccess | AkmReflectFailure;
⋮----
export interface ImproveActionResult {
  ref: string;
  mode: ImproveActionMode;
  result:
    | AkmReflectResult
    | AkmDistillResult
    | MemoryInferenceResult
    | { ok: true; pruned: boolean; reason: MemoryPruneCandidate["reason"] }
    | { ok: true; reason: string }
    | { ok: false; error: string };
}
⋮----
export interface DistillSkippedAggregate {

  total: number;

  byReason: Record<string, number>;






  samples: Array<{ ref: string; reason: string }>;
}
⋮----
export function foldDistillSkipped(actions: ImproveActionResult[]):
⋮----
export interface ImproveMemoryCleanupResult {
  analyzedDerived: number;
  pruneCandidates: MemoryPruneCandidate[];
  contradictionCandidates: MemoryContradictionCandidate[];
  beliefStateTransitions: MemoryBeliefStateTransition[];
  consolidationCandidates: MemoryConsolidationCandidate[];
  relativeDateCandidates?: RelativeDateCandidate[];
  archived?: ArchivedMemoryCleanupRecord[];
  transitionLogPath?: string;
  transitionLogEntries?: number;
  warnings?: string[];
}
⋮----
export interface AkmImproveResult {
  schemaVersion: 2;
  ok: boolean;

  strategy: string;
  scope: {
    mode: "all" | "type" | "ref";
    value?: string;
  };
  dryRun: boolean;

  notices?: readonly Readonly<LoweringNotice>[];




  skipped?: { reason: string };
  guidance?: string;
  memorySummary: {
    eligible: number;
    derived: number;
  };
  memoryCleanup?: ImproveMemoryCleanupResult;
  plannedRefs: ImproveEligibleRef[];

  plan?: ImproveExecutionPlan;














  strategyFilteredRefs?: ImproveEligibleRef[];














  skippedProcesses?: readonly Readonly<EngineUnavailableProcess>[];
  actions?: ImproveActionResult[];








  distillSkipped?: DistillSkippedAggregate;
  validationFailures?: Array<{ ref: string; reason: string }>;
  schemaRepairs?: Array<{
    ref: string;
    reason: string;
    outcome: "queued" | "skipped" | "error";
    proposalId?: string;
    error?: string;
  }>;
  consolidation?: ConsolidateResult;





  extract?: AkmExtractResult[];
  lintSummary?: { fixed: number; flagged: number };
  memoryIndexHealth?: { lineCount: number; overBudget: boolean };
  coverageGaps?: string[];
  deadUrls?: DeadUrl[];





  deadUrlCoverage?: DeadUrlCoverage;

  reflectsWithErrorContext?: number;
  memoryInference?: MemoryInferenceResult;







  memoryInferenceDurationMs?: number;








  ensureIndexDurationMs?: number;

  orphansPurged?: number;




  proposalsExpired?: number;

  reflectCooldownActions?: number;

  reflectSkippedActions?: number;






  reflectGuardRejectedActions?: number;




  gateAutoAcceptFailedCount?: number;






  triage?: { promoted: number; rejected: number; deferred: number; failed: number; skippedByCap: number };








  proactiveMaintenance?: { selected: number; dueTotal: number; neverReflected: number; selectedRefs: string[] };






  runId?: string;






  sync?: { committed: boolean; pushed: boolean; skipped: boolean; reason?: string };






  preRunSync?: { committed: boolean; pushed: boolean; skipped: boolean; reason?: string };











  writtenPaths?: string[];

  terminated?: { reason: string; at: string; errorMessage?: string };

















  usageReport?: {
    byProcessEngineModel: readonly Readonly<LlmUsageCrossTabRow>[];
    noCalls: readonly Readonly<{ process: string; engine?: string; reason: string }>[];
  };
}
````

## File: src/core/json-schema.ts
````typescript
import { isRecord } from "./common";
⋮----
export function validateJsonSchemaSubset(
  value: unknown,
  schema: Record<string, unknown>,
  options?: { readonly redactValues?: boolean },
): string[]
⋮----
export interface SchemaDefinitionIssue {

  path: Array<string | number>;

  pointer: string;

  keyword: string;






  kind: "malformed" | "unsupported";
  message: string;
}
⋮----
export function checkJsonSchemaDefinition(schema: Record<string, unknown>): SchemaDefinitionIssue[]
⋮----
function pointerFor(path: ReadonlyArray<string | number>): string
⋮----
function pushIssue(
  issues: SchemaDefinitionIssue[],
  path: ReadonlyArray<string | number>,
  keyword: string,
  kind: SchemaDefinitionIssue["kind"],
  message: string,
): void
⋮----
function isSupportedEnumValue(value: unknown): value is string | number | boolean | null
⋮----
function checkDefinitionNode(
  schema: Record<string, unknown>,
  path: Array<string | number>,
  issues: SchemaDefinitionIssue[],
  depth: number,
): void
⋮----
type JsonTypeName = "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";
⋮----
function typeOf(value: unknown): JsonTypeName
⋮----
function matchesType(actual: JsonTypeName, expected: string): boolean
⋮----
interface EvalCtx {
  errors: string[];
  depth: number;






  redactValues: boolean;
}
⋮----
function branchErrors(value: unknown, schema: Record<string, unknown>, path: string, ctx: EvalCtx): string[]
⋮----
function combinatorBranches(schema: Record<string, unknown>, keyword: string): Record<string, unknown>[]
⋮----
function summarizeBranchFailures(failures: Array<
⋮----
function validateCombinators(value: unknown, schema: Record<string, unknown>, path: string, ctx: EvalCtx): void
⋮----
function validateNode(value: unknown, schema: Record<string, unknown>, path: string, ctx: EvalCtx): void
````

## File: src/core/lesson-lint.ts
````typescript
import { parseFrontmatter } from "./asset/frontmatter";
⋮----
export interface LessonLintFinding {

  kind: "missing-description" | "missing-when_to_use" | "empty-description" | "empty-when_to_use";

  field: "description" | "when_to_use";

  message: string;
}
⋮----
export interface LessonLintReport {

  path: string;

  findings: LessonLintFinding[];
}
⋮----
function isNonEmptyString(value: unknown): value is string
⋮----
export function lintLessonContent(raw: string, pathForMessages: string): LessonLintReport
````

## File: src/core/llm-inference.ts
````typescript
import type { z } from "zod";
import { isPlainObject } from "./config/deep-merge";
import type { LlmInvocationOverridesSchema } from "./config/schema/primitives";
import { warnOnce } from "./warn";
⋮----
export type LlmInference = z.infer<typeof LlmInvocationOverridesSchema>;
⋮----
export function thinkingSetting(request: Readonly<Record<string, unknown>>): boolean | undefined
⋮----
export function inferenceWireFields(inference: LlmInference | undefined): Record<string, unknown>
⋮----
export function mergeRequestFields(
  base: Readonly<Record<string, unknown>>,
  over: Readonly<Record<string, unknown>>,
): Record<string, unknown>
⋮----
function withoutOwnedFields(request: Record<string, unknown>): Record<string, unknown>
⋮----
export function effectiveRequestFields(
  request: Readonly<Record<string, unknown>> | undefined,
  inference: LlmInference | null | undefined,
): Record<string, unknown>
````

## File: src/core/logs-db.ts
````typescript
import path from "node:path";
import type { Database, SqlValue } from "../storage/database";
import { openManagedDatabase } from "../storage/managed-db";
import {
  assertMigrationRegistry,
  type Migration,
  runMigrations as runSqliteMigrations,
} from "../storage/sqlite-migrations";
import { getDataDir } from "./paths";
⋮----
export function getLogsDbPath(): string
⋮----
export function openLogsDatabase(dbPath?: string): Database
⋮----
export function runMigrations(db: Database): void
⋮----
export type TaskLogStream = "stdout" | "stderr";
⋮----
export type TaskLogLevel = "info" | "warn" | "error";
⋮----
export interface TaskLogRow {
  id: number;
  ts: string;
  task_id: string;
  run_id: string;
  stream: TaskLogStream;
  level: TaskLogLevel;
  line: string;
}
⋮----
export function buildTaskRunId(taskId: string, startedAtIso: string): string
⋮----
export interface TaskLogLineInput {
  stream?: TaskLogStream;
  level?: TaskLogLevel;
  line: string;
}
⋮----
export function insertTaskLogLines(
  db: Database,
  input: { taskId: string; runId: string; ts: string; lines: readonly TaskLogLineInput[] },
): number
⋮----
export interface QueryTaskLogsOptions {

  taskId?: string;

  runId?: string;

  stream?: TaskLogStream;

  since?: string;

  until?: string;

  limit?: number;
}
⋮----
export function queryTaskLogs(db: Database, options: QueryTaskLogsOptions =
⋮----
/**
 * Bulk membership check: which of `runIds` have at least one log row?
 * Used by `akm health` to compute the log-backing rate from the database
 * instead of `fs.existsSync` over scattered files. Chunked to stay under
 * SQLite's bound-parameter ceiling.
 */
export function getLoggedRunIds(db: Database, runIds: readonly string[]): Set<string>
⋮----
// ── Retention ────────────────────────────────────────────────────────────────
⋮----
/**
 * Delete task_logs rows older than `retentionDays` (default: 90). Mirrors
 * `purgeOldEvents` / `purgeOldImproveRuns` in state-db.ts — same default, same
 * return shape (rows deleted), same disabled-when-non-positive semantics.
 * Wired into the improve maintenance pass alongside the state.db purges.
 */
export function purgeOldTaskLogs(db: Database, retentionDays = 90): number
````

## File: src/core/loopback.ts
````typescript
import { isIP } from "node:net";
⋮----
export function isLoopbackHost(host: string): boolean
⋮----
/** True when `endpoint` points at this machine (see {@link isLoopbackHost}). */
export function isLoopbackEndpoint(endpoint: string | undefined): boolean
⋮----
// An unparseable endpoint is treated as local: guessing "remote" here would
⋮----
export function defaultConcurrencyForEndpoint(endpoint: string | undefined): 1 | 2
````

## File: src/core/mutation-target.ts
````typescript
import path from "node:path";
import { deriveInstallations } from "../indexer/installations";
import { resolveSourceEntries, type SearchSource } from "../indexer/search/search-source";
import { type AssetRef, displayRef } from "./asset/resolve-ref";
import type { AkmConfig } from "./config/config";
import { UsageError } from "./errors";
import {
  prepareWriteTargetForMutation,
  type ResolvedWriteTarget,
  resolveWorkingStashTarget,
  resolveWriteTarget,
  type WriteTargetOptions,
} from "./write-source";
⋮----
export interface ResolvedMutationTarget {
  target: ResolvedWriteTarget;

  ref: AssetRef;

  displayRef: string;
}
⋮----
interface CanonicalSource {
  bundleId: string;
  source: SearchSource;
}
⋮----
function canonicalSources(config: AkmConfig): CanonicalSource[]
⋮----
function targetForCanonicalSource(
  config: AkmConfig,
  canonical: CanonicalSource,
  options: WriteTargetOptions,
): ResolvedWriteTarget
⋮----
export function canonicalBundleIdForTarget(config: AkmConfig, target: ResolvedWriteTarget): string
⋮----
export function resolveBundleWriteTarget(
  config: AkmConfig,
  bundleId: string,
  options: WriteTargetOptions = {},
): ResolvedWriteTarget
⋮----
function resolveExplicitMutationTarget(
  config: AkmConfig,
  explicitTarget: string,
  options: WriteTargetOptions,
): ResolvedWriteTarget
⋮----
export function resolveMutationTarget(
  config: AkmConfig,
  ref: AssetRef,
  explicitTarget?: string,
  options: WriteTargetOptions & { allowedAdapters?: readonly string[] } = {},
): ResolvedMutationTarget
⋮----
export function defaultBundleForTarget(config: AkmConfig): string | undefined
````

## File: src/core/network-policy.ts
````typescript
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
⋮----
export type HostnameResolver = (hostname: string) => Promise<string[]>;
⋮----
export type NetworkAddressClass =
  | "public"
  | "loopback"
  | "private"
  | "link-local"
  | "metadata"
  | "reserved"
  | "invalid";
⋮----
export function bareHostname(hostname: string): string
⋮----
export async function resolveHostnameAddresses(hostname: string, resolver?: HostnameResolver): Promise<string[]>
⋮----
async function defaultResolveHostname(hostname: string): Promise<string[]>
⋮----
export function classifyNetworkHostname(hostname: string): NetworkAddressClass
⋮----
export function classifyNetworkAddress(address: string): NetworkAddressClass
⋮----
function classifyIpv4(address: string): NetworkAddressClass
⋮----
function classifyIpv6(address: string): NetworkAddressClass
⋮----
function inIpv6Range(value: bigint, prefix: string, bits: number): boolean
⋮----
function parseIpv6Words(address: string): number[] | null
⋮----
function ipv6Value(address: string): bigint | null
⋮----
function embeddedIpv4Address(words: number[]): string | null
⋮----
function ipv4FromHextets(high: number, low: number): string
````

## File: src/core/non-task-input.ts
````typescript
export function nonTaskInput(query: string): string | undefined
````

## File: src/core/npm-package.ts
````typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeResponseToFileCapped } from "../runtime";
import { fetchWithRetry, isRecord } from "./common";
import { extractTarGzMembers } from "./tar";
⋮----
function sha512Integrity(file: string): Promise<string>
⋮----
export async function verifyIntegrity(file: string, expected: string): Promise<void>
⋮----
async function registryDocument(url: string): Promise<
⋮----
export async function fetchNpmPackageFiles(
  name: string,
  version: string,
  directory: string,
  files: ReadonlyArray<{ member: string; file: string }>,
): Promise<void>
⋮----
const partial = (file: string): string => path.join(directory, `.$
````

## File: src/core/parent-watchdog.ts
````typescript
export function isReparented(initialPpid: number, currentPpid: number): boolean
⋮----
export interface ParentDeathWatchdogOptions {

  initialPpid: number;

  onOrphaned: () => void;

  intervalMs?: number;

  getPpid?: () => number;

  setIntervalFn?: typeof setInterval;

  clearIntervalFn?: typeof clearInterval;
}
⋮----
export interface ParentDeathWatchdog {

  stop(): void;
}
⋮----
stop(): void;
⋮----
export function startParentDeathWatchdog(options: ParentDeathWatchdogOptions): ParentDeathWatchdog
````

## File: src/core/parse.ts
````typescript
export function stripThinkBlocks(raw: string): string
⋮----
/**
 * Strips markdown code fences (``` or ~~~, with optional language tag).
 * Handles fences with trailing spaces. Returns trimmed content.
 */
export function stripCodeFences(raw: string): string
⋮----
/**
 * Escapes unescaped control characters (actual \n, \r, \t bytes) inside JSON
 * string values. Prevents `JSON.parse` failures from embedded newlines in
 * local-LLM output.
 */
export function escapeJsonStringControls(raw: string): string
⋮----
/**
 * Full pipeline: stripThinkBlocks → stripCodeFences → escapeJsonStringControls
 * → JSON.parse. Returns `undefined` on parse failure.
 */
export function parseJsonResponse<T = unknown>(raw: string): T | undefined
⋮----
/**
 * Attempts `parseJsonResponse` first. On failure, scans for the first
 * balanced `{ }` or `[ ]` structure in the text and attempts to parse that
 * substring. Returns `undefined` if no valid JSON structure is found.
 *
 * Object-preferring: a `{…}` object found first is returned immediately;
 * a top-level array (`[…]`) is only a fallback, returned if no object is
 * found. Preserves the historical behaviour every current caller (all in
 * `src/`) relies on.
 *
 * An array-preferring mode (`expect: "array"`, for callers that specifically
 * expect a JSON array) existed here for batched LLM entity-graph extraction
 * (#635) and was removed with it in 0.9.17-alpha.9 — every remaining caller
 * calls this with no options, so it was dead weight, not a live choice.
 */
export function parseEmbeddedJsonResponse<T = unknown>(raw: string): T | undefined
⋮----
// Scan only *top-level* balanced structures: once a `{…}`/`[…]` is matched we
// jump `start` past its closing bracket rather than re-scanning its interior.
⋮----
if (end === -1) continue; // never balanced — let the next opener try
⋮----
// Fallback, returned only if no object is found.
⋮----
// Skip past this balanced structure so we don't descend into it.
````

## File: src/core/path-access.ts
````typescript
import fs from "node:fs";
⋮----
export type PathAccess = "present" | "absent" | "inaccessible";
⋮----
export interface PathAccessResult {
  access: PathAccess;

  code?: string;
}
⋮----
function errnoOf(error: unknown): string | undefined
⋮----
export function classifyPathAccess(target: string): PathAccessResult
⋮----
export function isPathAbsent(target: string): boolean
⋮----
export function describeInaccessiblePath(target: string, code?: string): string
````

## File: src/core/paths.ts
````typescript
import os from "node:os";
import path from "node:path";
import { shortHash } from "./bundle-id";
import { ConfigError } from "./errors";
import { IS_WINDOWS } from "./platform";
import { warnOnce } from "./warn";
⋮----
function isUnderBunTest(env: NodeJS.ProcessEnv): boolean
⋮----
export function isTransientStashPath(p: string): boolean
⋮----
function testIsolationError(): ConfigError
⋮----
export function getConfigDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string
⋮----
export function getConfigPath(env: NodeJS.ProcessEnv = process.env): string
⋮----
export function getCacheDir(env: NodeJS.ProcessEnv = process.env): string
⋮----
function homelessFallbackDir(kind: string): string
⋮----
export function getDataDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string
⋮----
export function getDbPath(env: NodeJS.ProcessEnv = process.env): string
⋮----
export function getIndexWriterLockPath(): string
⋮----
export function getIndexRebuildLockPath(): string
⋮----
export function getStateDbPathInDataDir(): string
⋮----
export function getLockfilePath(): string
⋮----
export function getLockfileLockPath(): string
⋮----
export function getRegistryCacheDir(): string
⋮----
export function getRegistryIndexCacheDir(): string
⋮----
export function getStateDir(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string
⋮----
export function getStashStateKey(stashDir: string): string
⋮----
function stashScopedDir(base: string, stashDir: string): string
⋮----
export function getUnresolvedSourcesDir(stashDir: string): string
⋮----
export function getStashLocksDir(stashDir: string): string
⋮----
export function akmLocations(): Record<string, string>
⋮----
export function childProcessEnv(): Record<string, string>
⋮----
export function getTaskLogDir(): string
⋮----
export function getRunLogDir(kind: "improve" | "index"): string
⋮----
export function getDefaultStashDir(env: NodeJS.ProcessEnv = process.env): string
⋮----
export function assertSafeStashDir(stashDir: string, env: NodeJS.ProcessEnv = process.env): void
````

## File: src/core/platform.ts
````typescript

````

## File: src/core/recognition-util.ts
````typescript
export function canonicalizeWorkflowName(name: string): string
⋮----
export type KnownType = (typeof KNOWN_TYPES)[number];
⋮----
export function isKnownType(type: string): type is KnownType
````

## File: src/core/redaction.ts
````typescript
function normalizedQueryKey(key: string): string
⋮----
function collectCredentialParameters(params: URLSearchParams, values?: Set<string>): boolean
⋮----
function addEncodedCredentialVariants(rawValue: string, values?: Set<string>): void
⋮----
function collectEncodedCredentialParameters(raw: string, values?: Set<string>): boolean
⋮----
function collectCredentialFragment(fragment: string, values?: Set<string>): boolean
⋮----
function inspectCredentialBearingUrl(value: string, values?: Set<string>): boolean
⋮----
export function isInferredSecretName(name: string): boolean
⋮----
export function collectInferredSecretValues(env: NodeJS.ProcessEnv): string[]
⋮----
export function collectSensitiveValues(rawValues: Iterable<string | undefined>): string[]
⋮----
interface NormalizedText {
  text: string;
  starts: Int32Array;
  sourceLength: number;
}
⋮----
function utf8SequenceLength(firstByte: number): number
⋮----
function normalizeEncodedText(value: string, plusAsSpace: boolean): NormalizedText
⋮----
const append = (decoded: string, start: number): void =>
⋮----
function addMappedMatches(coverageDelta: Int32Array, haystack: NormalizedText, needle: string): void
⋮----
function addPlainMatches(coverageDelta: Int32Array, text: string, needle: string): void
⋮----
function identifierWords(identifier: string): string[]
⋮----
function isCredentialLikeKeyName(identifier: string): boolean
⋮----
/**
 * Redact `NAME=value` / `NAME: value` pairs whose name is credential-shaped
 * (see {@link isCredentialLikeKeyName}).
 *
 * Not a plain `input.replace(re, fn)`: the greedy unquoted-value alternative
 * happily matches straight through a NESTED assignment when a non-credential
 * name comes first with no separator of its own — `"config: DB_PASSWORD=…"`
 * matches name `config` with value `DB_PASSWORD=…` (one contiguous
 * whitespace-free run), and a plain global replace treats that as ONE
 * consumed, non-matching span and never revisits `DB_PASSWORD=…` on its own,
 * silently leaking the credential. Rejecting a non-credential candidate here
 * instead rewinds the scan to one character past where IT started, so the
 * engine keeps looking and still finds the real assignment nested inside.
 */
function redactNamedCredentialValues(input: string): string
⋮----
/**
 * Redact credential-shaped substrings from arbitrary text by pattern alone —
 * unlike {@link redactSensitiveText}, which requires the exact secret value
 * up front, this catches credentials no caller ever knew to list. No
 * truncation is applied; callers that need a length cap (e.g.
 * {@link redactErrorBody}) apply it themselves.
 *
 * Targets:
 *  - `Bearer <token>` headers echoed back by a provider
 *  - `sk-…` / `sk_…` style API keys (OpenAI / Anthropic-shaped)
 *  - `key-…` / `key_…` shorthand keys
 *  - `"api_key": "…"` / `"apiKey": "…"` JSON fields
 *  - Discord webhook URLs (`discord.com/api/webhooks/<id>/<token>`) — the id
 *    is kept, only the token segment is redacted
 *  - Slack incoming-webhook URLs (`hooks.slack.com/services/<team>/<channel>/<token>`)
 *    — the team/channel ids are kept, only the trailing token is redacted
 *  - PEM private-key blocks (`-----BEGIN … PRIVATE KEY-----…-----END … PRIVATE KEY-----`)
 *    — the BEGIN/END markers are kept, only the body is redacted
 *  - JWTs (`eyJ…….…….…`)
 *  - GitHub tokens (`ghp_`/`gho_`/`ghs_`/`ghu_`/`ghr_…`)
 *  - Slack tokens (`xoxa-`/`xoxb-`/`xoxp-`/`xoxr-…`)
 *  - AWS access key ids (`AKIA…`)
 *  - `scheme://user:pass@host` URLs — the scheme and host are kept, only the
 *    userinfo is redacted
 *  - `NAME=value` / `NAME: value` where `NAME` names a credential by shape
 *    (password, passwd, secret, token, auth, credential(s), api/private key
 *    — see {@link isCredentialLikeKeyName}) — the name is kept, only the
 *    value is redacted
 */
export function redactCredentialPatterns(input: string): string
⋮----
// Bearer tokens (case-insensitive)
⋮----
// sk-/sk_ style keys
⋮----
// key-/key_ shorthand keys
⋮----
// JSON-style "api_key": "...", "apiKey": "...", "api-key": "..."
⋮----
// Discord webhook URLs: keep the webhook id, redact the token segment.
⋮----
// Slack incoming-webhook URLs: keep the team/channel ids, redact the token.
⋮----
// PEM private-key blocks: keep the BEGIN/END markers, redact the body.
⋮----
// JWTs: three dot-separated base64url segments; the header always
// starts "eyJ" (base64 of `{"`).
⋮----
// GitHub tokens (ghp_/gho_/ghs_/ghu_/ghr_...)
⋮----
// Slack tokens (xoxa-/xoxb-/xoxp-/xoxr-...)
⋮----
// AWS access key ids
⋮----
// URLs carrying `user:pass@` userinfo: keep the scheme and host.
⋮----
// NAME=value / NAME: value for credential-shaped names. Not a plain
// `.replace()` in the chain above — see `redactNamedCredentialValues`.
⋮----
/**
 * Replace exact sensitive values in text.
 *
 * Every match is located against the ORIGINAL text and the result is emitted
 * once, so overlapping matches merge into a single `[REDACTED]` and no needle
 * can ever match inside a token an earlier needle produced.
 *
 * That last property is load-bearing. This function used to take a `replaceAll`
 * fast path that chained over a *mutating* accumulator, which meant any needle
 * drawn from the letters of `[REDACTED]` re-matched the tokens already injected
 * and the output grew geometrically: `redactSensitiveText("a".repeat(50),
 * ["a","E","D","T","C","R"])` returned 32,450 characters — 649x the input. On a
 * path where the needle set is derived from configuration or the environment,
 * that is a memory-exhaustion hazard reachable from ordinary command output.
 * The encoded-form path never had the bug because it always worked this way.
 */
/** Max characters of a provider error body worth surfacing in a message. */
⋮----
/**
 * Make an HTTP error body safe to put in an error message: pattern-redact
 * credential shapes, then clip. Provider bodies can echo the credential that
 * was sent and can be megabytes of HTML, and these messages travel — into
 * `--json` output and agent transcripts.
 *
 * Lives here rather than beside one transport because every HTTP client in the
 * codebase needs it; the embeddings transport originally lacked it and leaked
 * raw 10 MB bodies into error messages.
 */
export function redactErrorBody(input: string): string
⋮----
/**
 * The spellings a JSON encoder gives a value inside a string literal: the
 * `JSON.stringify` form, and the ASCII-only form with non-ASCII as `\uXXXX`
 * (what Python's `json.dumps` writes). Empty for a value that needs no escaping.
 */
function jsonEscapedSpellings(value: string): string[]
⋮----
export function redactSensitiveText(text: string, sensitiveValues: Iterable<string>): string
⋮----
const addMatchesForMode = (plusAsSpace: boolean): void =>
⋮----
/** Recursively redact string leaves before a structured value crosses a durable/output boundary. */
export function redactSensitiveValue<T>(value: T, sensitiveValues: Iterable<string>): T
⋮----
const redact = (entry: unknown): unknown =>
⋮----
export function redactUrlCredentials(value: string): string
````

## File: src/core/ref-token.ts
````typescript
import { parseBundleRef } from "./asset/asset-ref";
import { typeNameFromConceptId } from "./asset/resolve-ref";
⋮----
function isRefBody(body: string, isBundleInstalled?: (bundle: string) => boolean): boolean
⋮----
export function isRefToken(value: string): boolean
⋮----
export function isSecretRefToken(value: string): boolean
⋮----
export interface RefTokenResolution {
  values: Record<string, string>;

  missing: string[];

  secretValues: string[];
}
⋮----
export function substituteRefTokens(
  values: Record<string, string>,
  resolve: (ref: string) => { kind: "secret"; value: string } | { kind: "path"; path: string } | undefined,
  isBundleInstalled?: (bundle: string) => boolean,
): RefTokenResolution
````

## File: src/core/registry-url.ts
````typescript
import { toErrorMessage } from "./common";
⋮----
export interface RegistryUrlDescriptor {
  url: string;
  name?: string;
}
⋮----
type RegistryUrlScanMode = "strict" | "diagnostic";
⋮----
interface RegistryUrlStart {
  start: number;
  authorityStart: number;
}
⋮----
interface UserinfoSpan {
  start: number;
  end: number;
}
⋮----
type StrictInspectionReason = "credentials" | "malformed-encoding" | "inspection-limit";
⋮----
interface StrictInspection {
  unsafe: boolean;
  reason?: StrictInspectionReason;
}
⋮----
interface StrictWalkState {
  candidates: number;
  decodedBytes: number;
  reason?: StrictInspectionReason;
}
⋮----
interface PercentDecodeResult {
  value: string;
  valid: boolean;
}
⋮----
export function hasRegistryUrlCredentials(raw: string): boolean
⋮----
export function formatRegistryUrl(raw: string): string
⋮----
export function formatRegistryLabel(entry: RegistryUrlDescriptor): string
⋮----
export function formatRegistryCredentialWarning(entry: RegistryUrlDescriptor): string
⋮----
export function registryEntryForOutput<T extends RegistryUrlDescriptor>(entry: T): T
⋮----
export function redactCredentialBearingUrls(message: string): string
⋮----
export function formatRegistryError(error: unknown): string
⋮----
function inspectStrictRegistryUrl(raw: string): StrictInspection
⋮----
function inspectParsedStrictUrl(parsed: URL, state: StrictWalkState, depth: number): void
⋮----
function inspectAuthoredStrictComponent(
  raw: string,
  state: StrictWalkState,
  depth: number,
  queryEncoded: boolean,
): void
⋮----
function inspectStrictComponent(raw: string, state: StrictWalkState, depth: number): void
⋮----
function unseenCandidateIndices(
  decoded: string,
  starts: RegistryUrlStart[],
  seenCandidateKeys: Set<string>,
): Set<number>
⋮----
function inspectStrictUrlCandidates(
  decoded: string,
  starts: RegistryUrlStart[],
  unseenIndices: Set<number>,
  state: StrictWalkState,
  depth: number,
): boolean
⋮----
function everyPercentEscapeIsCovered(raw: string, ranges: Array<
⋮----
function inspectDecodedCandidateUserinfo(raw: string, state: StrictWalkState, depth: number): number
⋮----
function strictAuthoritySlice(raw: string): string
⋮----
function decodePercentSafely(raw: string, mode: "component" | "query"): PercentDecodeResult
⋮----
function splitAuthoredFieldComponents(raw: string): string[]
⋮----
function findStrictComponentUserinfoSpan(raw: string, urlStart: RegistryUrlStart): UserinfoSpan | undefined
⋮----
function trimStrictCandidateSuffix(raw: string): string
⋮----
function hasCredentialLikeUrlEvidence(raw: string): boolean
⋮----
function looksLikeStrictUrlComponent(raw: string): boolean
⋮----
function decodePercentForEvidence(raw: string): string
⋮----
function stripMalformedPercentForEvidence(raw: string): string
⋮----
function redactDetectedUserinfo(raw: string, mode: RegistryUrlScanMode): string
⋮----
function registryUrlStarts(raw: string): RegistryUrlStart[]
⋮----
function findUserinfoSpan(
  raw: string,
  urlStart: RegistryUrlStart,
  mode: RegistryUrlScanMode,
): UserinfoSpan | undefined
⋮----
function userinfoSpan(authorityStart: number, lastAt: number): UserinfoSpan | undefined
⋮----
function looksLikeDiagnosticHostPrefix(raw: string): boolean
⋮----
function parseWholeHttpUrl(raw: string): URL | undefined
````

## File: src/core/run-lock.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { ConfigError } from "./errors";
import { createLockPayload, type LockOwnership, probeLock, reclaimStaleLock, tryAcquireLockSync } from "./file-lock";
import { describeInaccessiblePath } from "./path-access";
⋮----
export interface RunLockHolder {
  pid: number | null;
  startedAt: string | null;

  launcherPid: number | null;
}
⋮----
export function formatLockHolderPid(holder: Pick<RunLockHolder, "pid" | "launcherPid">): string
⋮----
export type RunLockAcquireResult =
  | { state: "acquired"; ownership: LockOwnership }
  | { state: "held"; holder: RunLockHolder };
⋮----
export interface RunLockReclaimInfo {
  holderPid: number | null;
  lockedAt: string | null;
  ageMs: number | null;
  reason: string;
}
⋮----
export interface TryAcquireRunLockOptions {

  label: string;

  payloadMetadata?: Record<string, unknown>;

  onReclaimed?: (info: RunLockReclaimInfo) => void;
}
⋮----
function parseLockPayload(
  rawContent: string | undefined,
):
⋮----
function holderOf(lock:
⋮----
export function tryAcquireRunLock(lockPath: string, options: TryAcquireRunLockOptions): RunLockAcquireResult
⋮----
const lockPayload = () => createLockPayload(
````

## File: src/core/secret-value.ts
````typescript
import fs from "node:fs";
⋮----
export function readValue(secretPath: string): string
````

## File: src/core/sensitive-marker-path.ts
````typescript
export function sensitiveMarkerPath(assetPath: string, type: "env" | "secret"): string
````

## File: src/core/state-db-scope.ts
````typescript
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import type { Database } from "../storage/database";
import { getStateDbPath, openStateDatabase } from "./state-db";
⋮----
interface StateDbScope {

  readonly dbPath: string;

  db: Database | undefined;

  closed: boolean;
}
⋮----
function installExitBackstop(): void
⋮----
function closeAllStateDbScopes(): void
⋮----
function closeScope(scope: StateDbScope): void
⋮----
export function borrowScopedStateDb(dbPath?: string): Database | undefined
⋮----
export async function withStateDbScope<T>(fn: () => Promise<T>, opts?:
⋮----
export function openScopedStateDbCount(): number
````

## File: src/core/state-db.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { type Database, openDatabase, type SqlValue } from "../storage/database";
import { openManagedDatabase, withManagedDb } from "../storage/managed-db";
import {
  assertMigrationLedger,
  type Migration,
  type MigrationLedgerState,
  runMigrations,
} from "../storage/sqlite-migrations";
import { applyReadonlyPragmas } from "../storage/sqlite-pragmas";
import { pkgVersion } from "../version";
import { getDataDir } from "./paths";
import { getStateMigrationSafety, STATE_MIGRATIONS } from "./state/migrations";
import { warnOnce } from "./warn";
⋮----
export function getStateDbPath(): string
⋮----
function warnNewerStateLedger(ledger: MigrationLedgerState): void
⋮----
function backupBeforeDestructiveMigration(
  db: Database,
  dbPath: string,
  pending: readonly Migration[],
): string | undefined
⋮----
export interface StateDatabaseMigrationReport {
  applied: string[];
  backupPath?: string;
}
⋮----
function migrateStateDatabase(db: Database, dbPath: string): StateDatabaseMigrationReport
⋮----
function openAndMigrate(dbPath: string): StateDatabaseMigrationReport &
⋮----
export function openStateDatabase(dbPath: string = getStateDbPath()): Database
⋮----
export function openStateDatabaseWithReport(
  dbPath: string = getStateDbPath(),
): StateDatabaseMigrationReport &
⋮----
export function listPendingStateMigrations(dbPath: string = getStateDbPath()): string[]
⋮----
export interface HistoricalStateUpgradeResult {

  upgraded: boolean;

  applied: string[];

  safetyCopyPath?: string;
}
⋮----
export function upgradeHistoricalStateDatabase(dbPath: string = getStateDbPath()): HistoricalStateUpgradeResult
⋮----
export function withStateDb<T>(fn: (db: Database) => T, opts?:
⋮----
export function withStateDbTelemetry(fn: (db: Database) => void, busyTimeoutMs = 250): void
⋮----
export function listExistingTableNames(db: Database, names: readonly string[]): Array<
````

## File: src/core/structured.ts
````typescript
export type Parsed<T> =
  | { ok: true; value: T }
  | {
      ok: false;

      errors: string[];

      reason?: "parse_error" | "validation_error";
    };
⋮----
export function withSchemaInstruction(prompt: string, schema: unknown): string
````

## File: src/core/subprocess.ts
````typescript
import { spawn as runtimeSpawn } from "../runtime";
⋮----
export interface SpawnedSubprocess {
  exitCode: number | null;
  exited: Promise<number>;
  stdout?: ReadableStream<Uint8Array> | null;
  stderr?: ReadableStream<Uint8Array> | null;
  stdin?: WritableStream<Uint8Array> | null;

  pid?: number;
  kill(signal?: number | string): void;
}
⋮----
kill(signal?: number | string): void;
⋮----
export type SpawnFn = (
  cmd: string[],
  options: {
    stdin?: "inherit" | "pipe" | "ignore";
    stdout?: "inherit" | "pipe" | "ignore";
    stderr?: "inherit" | "pipe" | "ignore";
    env?: Record<string, string>;
    cwd?: string;
    detached?: boolean;
    windowsVerbatimArguments?: boolean;
  },
) => SpawnedSubprocess;
⋮----
export function spawnsOwnProcessGroup(platform: NodeJS.Platform = process.platform): boolean
⋮----
export function buildSpawnOptions(
  opts: Pick<RunManagedSubprocessOptions, "capture" | "stdin" | "env" | "cwd" | "windowsVerbatimArguments">,
  platform: NodeJS.Platform = process.platform,
): Parameters<SpawnFn>[1]
⋮----
export function killGroup(proc: SpawnedSubprocess, signal: "SIGINT" | "SIGTERM" | "SIGKILL"): void
⋮----
function groupRunning(proc: SpawnedSubprocess): boolean
⋮----
export function scheduleKillLadder(
  proc: SpawnedSubprocess,
  opts: { onKill: () => void; setTimeoutFn: typeof setTimeout; graceMs?: number },
): void
⋮----
const afterGrace = (run: () => void): void =>
⋮----
const terminate = (): void =>
⋮----
interface LiveGroupChild {
  proc: SpawnedSubprocess;

  terminate: () => void;
}
⋮----
function removeSignalGuard(): void
⋮----
function registerLiveGroupChild(child: LiveGroupChild): () => void
⋮----
function installSignalGuard(): void
⋮----
const handler = (): void =>
⋮----
export interface StreamReadResult {
  text: string;
  timedOut: boolean;
  error?: unknown;






  overflowed: boolean;





  bytesRead: number;

  retainedBytes: number;
}
⋮----
export function streamCaptureFailure(stdout: StreamReadResult, stderr: StreamReadResult): string | undefined
⋮----
function errorText(error: unknown): string
⋮----
function utf8BoundaryAtOrBefore(value: Uint8Array, limit: number): number
⋮----
export async function readStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  opts?: {
    timeoutMs?: number;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;













    maxBytes?: number;











    armTimeoutAfter?: Promise<unknown>;
  },
): Promise<StreamReadResult>
⋮----
/**
   * Common per-chunk accumulate. Uncapped it appends everything. Capped, it
   * appends until the cap and then only COUNTS — the caller's loop keeps reading
   * either way, which is the whole point.
   */
const absorb = (value: Uint8Array): void =>
⋮----
// Already past the cap: discard. Never resume retaining — a gap in the
// middle would splice two disjoint regions into one string.
⋮----
/* ignore */
⋮----
const arm = () =>
⋮----
// The drain already finished while the deadline was still waiting to be
// armed; a timer started now would belong to nobody.
⋮----
export interface RunManagedSubprocessOptions {





  capture: boolean;

  env?: Record<string, string>;

  cwd?: string;

  stdin?: string;

  timeoutMs: number | null;





  maxOutputBytes?: number;

  signal?: AbortSignal;

  graceMs?: number;





  windowsVerbatimArguments?: boolean;

  spawnFn?: SpawnFn;

  setTimeoutFn?: typeof setTimeout;

  clearTimeoutFn?: typeof clearTimeout;

  onSpawn?: (proc: SpawnedSubprocess) => void;
}
⋮----
export interface ManagedSubprocessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: Error;
  stdoutRead: StreamReadResult;
  stderrRead: StreamReadResult;
}
⋮----
/**
 * Drain deadline for a run with no wall budget, counted from the child's EXIT
 * (never from capture — see {@link runManagedSubprocess}). It bounds only the
 * window in which a descendant can keep an inherited pipe open after the leader
 * is gone, so it can be generous without ever capping the run itself.
 */
⋮----
/**
 * Drain deadline for a run WITH a wall budget, counted from the moment the
 * pipe's owner left — the child exited, or (a child that survived its own kill
 * ladder) the budget expired. Anything still holding the fd open then is a
 * background descendant, not the command, so this is the same 2 s the old
 * capture-anchored deadline allowed past the budget; only its starting point
 * moved earlier.
 */
⋮----
function toError(err: unknown): Error
⋮----
/**
 * Spawn `cmd` and manage its lifecycle: process-group spawn, hard timeout and
 * cooperative abort (both via the SIGINT→SIGTERM→SIGKILL {@link scheduleKillLadder}),
 * bounded output capture, and an optional stdin payload. Never throws for a
 * spawn/exit failure — those surface as {@link ManagedSubprocessResult.spawnError}.
 */
export async function runManagedSubprocess(
  cmd: string[],
  opts: RunManagedSubprocessOptions,
): Promise<ManagedSubprocessResult>
⋮----
// Refuse to spawn at all when the caller's signal is already aborted.
⋮----
// A termination signal to this process takes the own-group child down too.
⋮----
// Hard timeout: SIGINT now, SIGTERM and SIGKILL after each grace period if ignored.
// Skipped entirely when timeoutMs is null.
⋮----
// Settles when a bounded run's wall budget expires — the second way (after
// the child's own exit) a captured pipe can stop belonging to a live command.
// See the drain-deadline note below.
⋮----
// Cooperative cancel: same ladder, flagged separately so the caller can tell
// a budget/user abort from a wall-clock expiry.
⋮----
const onAbort = () =>
⋮----
// A signal that aborted between the pre-spawn check and here fires the
// listener directly (the "abort" event would otherwise never re-dispatch).
````

## File: src/core/system-error.ts
````typescript
export function systemErrorCode(error: unknown): string | undefined
⋮----
export function isReadOnlyFilesystemError(error: unknown): boolean
````

## File: src/core/tar.ts
````typescript
import fs from "node:fs";
import { pipeline } from "node:stream";
import zlib from "node:zlib";
⋮----
class ByteReader
⋮----
constructor(source: AsyncIterable<Buffer>)
⋮----
async read(max: number): Promise<Buffer | undefined>
⋮----
async exact(count: number): Promise<Buffer>
⋮----
async skip(count: number): Promise<void>
⋮----
const field = (header: Buffer, start: number, end: number): string =>
⋮----
export async function extractTarGzMembers(
  archive: string,
  members: ReadonlyMap<string, string>,
): Promise<Map<string, number>>
⋮----
async function extractFrom(
  reader: ByteReader,
  archive: string,
  members: ReadonlyMap<string, string>,
): Promise<Map<string, number>>
````

## File: src/core/text-truncation.ts
````typescript
export function detectTruncatedDescription(description: string): string | null
⋮----
// ── Post-generation repair pass (issue #556) ─────────────────────────────────
⋮----
/**
 * Minimum length (chars) for a repaired description to be considered usable.
 * Mirrors the floor in `isValidDescription` (≥20). Kept local so this module
 * stays dependency-free of the validators (avoids an import cycle).
 */
⋮----
/** Maximum length (chars) for a repaired description. Mirrors `isValidDescription` (≤400). */
⋮----
/**
 * Strip trailing truncation fragments from a candidate clause: repeatedly drop
 * a hanging-connector word and/or trailing `,` `;` `:` `+` and ellipses until
 * the clause no longer looks truncated. PURE — no fabrication, only removal.
 *
 * Returns the trimmed-to-last-complete-token clause (may be empty if the whole
 * thing was connectors/punctuation).
 */
function stripTrailingTruncationFragment(clause: string): string
⋮----
// Loop because a tail can stack: "… related to the" → drop "the" → drop "to".
⋮----
// Drop a trailing hanging-connector word (and any punctuation glued to it).
⋮----
// Remove just the final word token (keep preceding text).
⋮----
/**
 * Split prose into sentences on `.`/`!`/`?` boundaries (followed by whitespace
 * or end). Keeps the terminating punctuation. Deliberately simple — good enough
 * for the short, single-paragraph descriptions/bodies this repair operates on.
 */
function splitSentences(text: string): string[]
⋮----
/**
 * True when `candidate` is a self-contained, non-truncated clause of acceptable
 * length. Used to gate repair outputs without importing the full validator
 * (which would create a cycle). The full `isValidDescription` still runs
 * downstream — this is only the truncation/length subset the repair targets.
 */
function isUsableClause(candidate: string): boolean
⋮----
// Must contain at least one word character (not pure punctuation).
⋮----
/** Append a period when the clause lacks terminal sentence punctuation. PURE. */
function ensureTerminalPunctuation(clause: string): string
⋮----
/**
 * Deterministically repair an LLM-generated description that was sliced
 * mid-sentence (issue #556). The repair NEVER fabricates new claims:
 *
 *   1. If the description is not truncated, it is returned **byte-identical**
 *      (zero behaviour change for already-valid descriptions).
 *   2. Otherwise:
 *      a. **trim-to-last-complete-clause** — strip the trailing
 *         truncation-indicator word(s)/punctuation; if a complete earlier
 *         sentence survives, use the longest non-truncated prefix.
 *      b. **swap-in first body sentence** — if (a) yields nothing usable and a
 *         `body` is provided, use the first clean, complete sentence of the
 *         body.
 *      c. **fallback** — if neither produces a usable, non-truncated clause,
 *         return the original string unchanged so the existing validation
 *         rejects it exactly as before (no regression, no fabrication).
 *
 * @param description The raw description (possibly truncated).
 * @param body Optional asset body to source a clean completion sentence from.
 */
export function repairTruncatedDescription(description: string, body?: string): string
⋮----
.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") // drop any frontmatter
.replace(/```[\s\S]*?```/g, " ") // drop fenced code
.replace(/`[^`]*`/g, " "); // drop inline code spans
````

## File: src/core/time.ts
````typescript
import { UsageError } from "./errors";
⋮----
export function parseDuration(spec: string, units: Readonly<Record<string, number>> = DURATION_UNITS): number | null
⋮----
// ── Since-flag parsing ───────────────────────────────────────────────────────
⋮----
/**
 * Parse a user-supplied `--since` value and return an ISO-8601 timestamp
 * string (e.g. `"2026-01-15T10:30:00.000Z"`).
 *
 * Accepted input formats:
 *   - ISO-8601 timestamp (preferred): `"2026-04-01T00:00:00Z"`
 *   - Plain date: `"2026-04-01"` (interpreted as start-of-day UTC)
 *   - Epoch milliseconds (pure digit string): `"1744329600000"`
 *   - Any other value parseable by `new Date()`
 *
 * Callers that need a different wire format (e.g. SQLite `"YYYY-MM-DD HH:MM:SS"`)
 * should convert the returned ISO string themselves.
 *
 * @throws {UsageError} when `since` is empty or cannot be parsed as a date.
 */
export function parseSinceToIso(since: string): string
````

## File: src/core/trash.ts
````typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
⋮----
function homeDir(): string
⋮----
function moveToXdgTrash(target: string): void
⋮----
export function moveToTrash(target: string, tools: ReadonlyArray<readonly string[]> = LINUX_TRASH_TOOLS): void
````

## File: src/core/tty.ts
````typescript
export function shouldDecorate(): boolean
⋮----
[/\u{1F44B}\s*/gu, ""], // wave (with trailing space)
⋮----
[/\u{1F4DA}\s*/gu, ""], // books
⋮----
/**
 * If decoration is disabled, replace known emoji with ASCII fallbacks and
 * strip any remaining pictograph code points. If decoration is enabled,
 * return the input unchanged.
 */
export function plainize(text: string): string
⋮----
// Catch-all for unmapped pictographs. Future-proof when new emoji are added
// to call sites without updating the explicit map.
⋮----
// Collapse runs of whitespace introduced by emoji removal, but preserve
// intentional leading indentation. Only collapses interior runs.
````

## File: src/core/type-presentation.ts
````typescript
import { isKnownType, type KnownType } from "./recognition-util";
⋮----
export interface Presentation {

  label: string;





  renderer?: string;




  action?: (ref: string) => string;





  fragmentRef?: boolean;
}
⋮----
function shellQuote(value: string): string
⋮----
function buildWorkflowAction(ref: string): string
⋮----
export function presentationFor(type: string | undefined): Presentation
⋮----
export function allowsFragmentRef(type: string): boolean
````

## File: src/core/warn.ts
````typescript
import fs from "node:fs";
import path from "node:path";
⋮----
export type WarnSinkForTests = (level: "info" | "warn" | "error" | "warnVerbose", args: unknown[]) => void;
⋮----
export function _setWarnSinkForTests(fake?: WarnSinkForTests): void
⋮----
export function setQuiet(value: boolean): void
⋮----
export function resetQuiet(): void
⋮----
export function isQuiet(): boolean
⋮----
export async function withQuiet<T>(fn: () => Promise<T>): Promise<T>
⋮----
export function setVerbose(value: boolean): void
⋮----
export function resetVerbose(): void
⋮----
export function isVerbose(): boolean
⋮----
export function setLogFile(filePath: string): void
⋮----
export function clearLogFile(): void
⋮----
function appendToLogFile(level: "INFO" | "WARN" | "ERROR", args: unknown[]): void
⋮----
export function info(...args: unknown[]): void
⋮----
export function warn(...args: unknown[]): void
⋮----
export function warnOnce(key: string, ...args: unknown[]): void
⋮----
export function _resetWarnOnceForTests(): void
⋮----
export function error(...args: unknown[]): void
⋮----
export function warnVerbose(...args: unknown[]): void
````

## File: src/core/write-provenance.ts
````typescript
import path from "node:path";
⋮----
interface JournalState {
  readonly touched: Set<string>;
}
⋮----
export interface WriteProvenanceJournal {

  writtenPaths(): string[];




  end(): string[];
}
⋮----
writtenPaths(): string[];
⋮----
end(): string[];
⋮----
export function beginWriteProvenance(): WriteProvenanceJournal
⋮----
const snapshot = (): string[]
⋮----
export function isWriteProvenanceActive(): boolean
⋮----
export function recordWrittenPath(filePath: string | undefined | null): void
⋮----
export function relativeWrittenPath(root: string, absolutePath: string): string | undefined
````

## File: src/core/write-source.ts
````typescript
import fs from "node:fs";
import path from "node:path";
import { withAssetMutationLeaseSync } from "../indexer/index-writer-lock";
import { lockContentRootFor } from "../integrations/lockfile";
import {
  GitStashPushError,
  getCachePaths,
  inspectGitUpstream,
  isGitBackedStash,
  parseGitRepoUrl,
  runGit,
  saveGitStash,
} from "../sources/providers/git";
import { listIgnoredExactPaths } from "../sources/providers/git-stash";
import { detectAdapterId } from "./adapter/detect-adapter";
import { normalizeAkmMarkdown } from "./asset/akm-markdown";
import { assetPathForName, stashDirFor } from "./asset/asset-placement";
import type { AssetRef } from "./asset/resolve-ref";
import { conceptIdFromTypeName, displayRef } from "./asset/resolve-ref";
import { deriveBundleId } from "./bundle-id";
import { existingFileMode, isWithin, resolveStashDir, writeFileAtomic } from "./common";
import type { AkmConfig, ConfiguredSource, SourceConfigEntry } from "./config/config";
import { bundleKeyForContentRoot, resolveActiveConfiguredSources, resolveConfiguredSources } from "./config/config";
import { ConfigError, UsageError } from "./errors";
import { sanitizeCommitMessage } from "./git-message";
import { warn, warnOnce } from "./warn";
import { recordWrittenPath } from "./write-provenance";
⋮----
export interface WriteTargetSource {

  readonly kind: string;

  readonly name: string;

  readonly path: string;

  readonly repoPath?: string;

  readonly adapterId?: string;
}
⋮----
export interface ResolvedWriteTarget {

  selector?: string;

  source: WriteTargetSource;
  config: SourceConfigEntry;
}
⋮----
export function resolveWritable(entry: Pick<SourceConfigEntry, "type" | "writable">): boolean
⋮----
export function isSourceWriteActivated(source:
⋮----
export function isWriteCapableSourceKind(kind: string): kind is "filesystem" | "git"
⋮----
export interface WriteTargetOptions {
  requireWritable?: boolean;





  flag?: string;
}
⋮----
export function assertBundleNotDisabled(akmConfig: AkmConfig, name: string): void
⋮----
export function resolveWriteTarget(
  akmConfig: AkmConfig,
  explicitTarget?: string,
  options: WriteTargetOptions = {},
): ResolvedWriteTarget
⋮----
export function resolveWorkingStashTarget(
  akmConfig: AkmConfig,
  options: { requireWritable?: boolean } = {},
): ResolvedWriteTarget
⋮----
function adaptConfiguredSource(runtime: ConfiguredSource): ResolvedWriteTarget
⋮----
export function resolveGitContentRoot(repoPath: string): string
⋮----
function pathFromConfiguredSource(runtime: ConfiguredSource): string | undefined
⋮----
export function assertAkmAssetWrite(source: WriteTargetSource, allowedAdapters: readonly string[] = ["akm"]): void
⋮----
export function prepareWriteTargetForMutation(
  target: ResolvedWriteTarget,
  options: { allowedAdapters?: readonly string[] } = {},
): ResolvedWriteTarget
⋮----
export async function writeAssetToSource(
  source: WriteTargetSource,
  config: SourceConfigEntry,
  ref: AssetRef,
  content: string,
): Promise<
⋮----
export async function deleteAssetFromSource(
  source: WriteTargetSource,
  config: SourceConfigEntry,
  ref: AssetRef,
): Promise<
⋮----
function ensureWritable(source: WriteTargetSource, config: SourceConfigEntry): void
⋮----
function assertSupportedKind(source: WriteTargetSource): void
⋮----
function resolveAssetFilePath(source: WriteTargetSource, ref: AssetRef): string
⋮----
/** Distinct `/home/<user>` / `/Users/<user>` prefixes in `content`, first-seen order. */
export function findAbsoluteHomePaths(content: string): string[]
⋮----
/** `[origin//]conceptId` for a commit subject, each component sanitized against CR/LF/NUL smuggling. */
export function formatRefForMessage(ref: AssetRef): string
⋮----
// ── Boundary commit ─────────────────────────────────────────────────────────
⋮----
/**
 * Absolute paths written to a git target since its last boundary commit, keyed
 * by repository root. This is what lets the boundary `git add` exactly the
 * operation's files and nothing else in the checkout.
 */
⋮----
function repoDirFor(source: WriteTargetSource): string
⋮----
/** Record a path the git target's next boundary commit must include. */
export function recordWriteTargetPath(source: WriteTargetSource, filePath: string): void
⋮----
function lstatOrNull(filePath: string): fs.Stats | null
⋮----
function assertWritePathsInsideSource(source: WriteTargetSource, filePaths: readonly string[]): void
⋮----
export function withWriteTargetMutation<T>(
  target: ResolvedWriteTarget,
  paths: string[],
  options: { purpose: string; message: string },
  mutate: () => T,
): T
⋮----
export function commitWriteTargetBoundary(
  target: ResolvedWriteTarget,
  message: string,
  options?: { push?: boolean; paths?: string[]; filesystem?: boolean; body?: string[] },
): void
⋮----
const toRepoRelative = (filePath: string): string
⋮----
export function commitAcceptedPaths(
  target: ResolvedWriteTarget,
  message: string,
  paths: string[],
  body?: string[],
): void
````
