---
description: "Repo map of akm src/workflows at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/workflows

## src/workflows/

### src/workflows/compile.ts

- `export interface WorkflowSourceError`
- `export type WorkflowCompileResult = { ok: true; plan: WorkflowPlan } | { ok: false; errors: WorkflowSourceError[] };`
- `export interface CompileWorkflowSourceOptions`
- `export function compileWorkflowSource(source: string, options: CompileWorkflowSourceOptions): WorkflowCompileResult`
- `export function workflowStepInstructions(step: WorkflowPlanStep): string`
- `export type WorkflowPlanCheck = { ok: true; warnings: WorkflowError[] } | { ok: false; errors: WorkflowError[] };`
- `export function checkWorkflowPlan(plan: WorkflowPlan): WorkflowPlanCheck`
- `const check = (text: string, line: number, label: string, paramsAllowed: boolean): void =>`
- `function workflowWarnings(plan: WorkflowPlan): WorkflowError[]`
- `const scan = (text: string | undefined, label: string): void =>`

### src/workflows/concurrency-policy.ts

- `export function cpuDerivedUnitConcurrency(cpuCount = os.cpus()?.length ?? 4): number`
- `export function clampMaxConcurrency(value: number): number`
- `export function workflowMaxConcurrency(configured?: number, cpuCount = os.cpus()?.length ?? 4): number`
- `export function defaultLlmEngineConcurrency(endpoint: string | undefined, configured?: number): number`
- `export function defaultMapConcurrency(configured?: number): number`

### src/workflows/parser.ts

- `interface WorkflowInstructionBlock`
- `export type WorkflowParseResult = { ok: true; plan: WorkflowPlan } | { ok: false; errors: WorkflowError[] };`
- `type ProgramUnit = WorkflowUnitSettings &`
- `type ProgramDefaults = NonNullable<WorkflowPlan["defaults"]>;`
- `type ProgramGate = { maxLoops?: number };`
- `type ProgramMap = { over: string; concurrency?: number; reducer?: WorkflowReducer; unit?: ProgramUnit };`
- `interface ProgramStep`
- `type LlmInvocationOverrides = import("../core/llm-inference").LlmInference;`
- `type Path = Array<string | number>;`
- `interface RangedNode`
- `interface Ctx`
- `export interface WorkflowParseOptions`
- `export function parseWorkflow(markdown: string, source: WorkflowParseOptions): WorkflowParseResult`
- `const lineAt = (p: Path): number =>`
- `function stepSpec(step: ProgramStep, section: StepSection | undefined): WorkflowStepSpec`
- `function checkCanonicalXrefs(value: unknown, line: number, errors: WorkflowError[]): void`
- `interface StepSection`
- `function bindStepSections`
- `function findGateSubsection`
- `function findNextHeadingAtOrAboveLevel`
- `function sliceLines(lines: string[], startLineInclusive: number, endLineInclusive: number): string`
- `function sliceProseLines(lines: string[], startLineInclusive: number, endLineInclusive: number): string`
- `function checkEnvelopeFields(ctx: Ctx, root: Record<string, unknown>, fmEndLine: number): void`
- `function checkActorStamp(ctx: Ctx, value: unknown, path: Path, label: string): void`
- `function readTags(ctx: Ctx, value: unknown, fmEndLine: number): string[] | undefined`
- `function checkXrefs(ctx: Ctx, value: unknown, fmEndLine: number): void`
- `function parseParams(ctx: Ctx, raw: unknown): Record<string, Record<string, unknown>> | undefined`
- `function parseDefaults(ctx: Ctx, raw: unknown): ProgramDefaults | undefined`
- `function parseBudget(ctx: Ctx, raw: unknown): WorkflowBudget | undefined`
- `function parseSteps(ctx: Ctx, raw: unknown): ProgramStep[]`
- `function parseUnit`
- `function parseChildWorkflowRef`
- `function parseExec(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): WorkflowExec | undefined`
- `function parseExecPassEnv(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): string[] | undefined`
- `function parseExecCommand(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): string[] | undefined`
- `function parseExecCwd(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): string | undefined`
- `function parseMap(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): ProgramMap | undefined`
- `function parseInputs(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): string[] | undefined`
- `function parseGate(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): ProgramGate | undefined`
- `function parseEngineName(ctx: Ctx, raw: unknown, path: Path, label: string): string | undefined`
- `function parseRetry(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): WorkflowRetry | undefined`
- `function parseTimeoutField(ctx: Ctx, raw: unknown, path: Path, label: string): number | null | undefined`
- `function checkTimeoutCeiling(ctx: Ctx, timeoutMs: number, path: Path, label: string, raw: string): number | undefined`
- `function parseEnumField`
- `function parseLlmOverrides(ctx: Ctx, raw: unknown, path: Path, label: string): LlmInvocationOverrides | undefined`
- `function parseSchemaObject(ctx: Ctx, raw: unknown, path: Path, label: string): Record<string, unknown> | undefined`
- `function checkSchemaDefinition(ctx: Ctx, schema: Record<string, unknown>, path: Path, label: string): void`
- `function checkReferenceSyntax(ctx: Ctx, text: string, path: Path, label: string): void`
- `function checkUnknownKeys`
- `function describeError(cause: unknown): string`
- `function yamlErrorMessage(message: string): string`
- `function sortErrors(errors: WorkflowError[]): WorkflowError[]`

### src/workflows/plan.ts

- `export interface SourceRef`
- `export interface WorkflowError`
- `export type WorkflowOnError = "fail" | "continue";`
- `export type WorkflowReducer = "collect" | "vote";`
- `export type WorkflowRuntimeKind = "connection" | "harness" | "exec";`
- `export interface WorkflowRetry`
- `export interface WorkflowBudget`
- `export interface WorkflowUnitSettings`
- `export interface WorkflowExec`
- `export interface WorkflowStepSpec`
- `export interface WorkflowExecSpec`
- `export type FrozenLegacyField = Readonly<Record<string, unknown>>;`
- `export type FrozenWorkflowEnvironmentBinding`
- `export interface FrozenWorkflowCommandTarget`
- `export interface FrozenWorkflowShellTarget`
- `export interface FrozenChildWorkflowTarget`
- `export type FrozenWorkflowTarget = FrozenWorkflowCommandTarget | FrozenWorkflowShellTarget | FrozenChildWorkflowTarget;`
- `export interface WorkflowUnitNode`
- `export interface WorkflowMapNode`
- `export type WorkflowExecNode = WorkflowUnitNode | WorkflowMapNode;`
- `export interface WorkflowGateNode`
- `export interface WorkflowPlanStep`
- `export interface WorkflowPlan`

### src/workflows/renderer.ts

- `function shellQuote(value: string): string`
- `export function buildWorkflowAction(ref: string): string`
- `function deriveName(ctx: RenderContext): string`
- `function loadPlan(ctx: RenderContext): WorkflowPlan`
- `function projectParameters(plan: WorkflowPlan): WorkflowParameter[] | undefined`
- `export function summarizeStepOrchestration`
- `const named = (settings: typeof unit | undefined): string | undefined`
- `function frozenDispatch(step: WorkflowPlanStep):`
- `export function resolveOrchestrationRefs(summary: WorkflowStepOrchestrationSummary): WorkflowStepOrchestrationSummary`
- `const note = (ref: string, where: WorkflowStepRef["in"]): void =>`
- `const tokens = (values: string[], where: "argv" | "cwd"): void =>`
- `function projectStepDefinitions(plan: WorkflowPlan): WorkflowStepDefinition[]`

### src/workflows/resource-limits.ts

- `export interface ExecContextLimits`
- `export function execContextLimits(platform: string = process.platform): ExecContextLimits`
- `export function clip(text: string, max: number): string`
- `export function utf8Bytes(value: string): number`
- `export function jsonBytes(value: unknown): number`

### src/workflows/source-files.ts

- `export interface WorkflowSourceFile`
- `interface WorkflowSourceCandidate`
- `interface WorkflowSourceCandidateInspection`
- `export interface WorkflowSourceDomainResolution`
- `export abstract class WorkflowSourceRejectionError extends UsageError`
- `export class WorkflowSourceCollisionError extends WorkflowSourceRejectionError`
- `export class WorkflowSourceIdentityError extends UsageError`
- `export class WorkflowSourceNameError extends WorkflowSourceRejectionError`
- `export class WorkflowSourceLinkIdentityError extends WorkflowSourceRejectionError`
- `export class WorkflowSourceLinkResolutionError extends WorkflowSourceRejectionError`
- `export function workflowNameForConceptId(adapterId: string, conceptId: string): string | undefined`
- `export function workflowNameForSourcePath`
- `export function listWorkflowSourceFiles(sourceRoot: string, adapterId: string, name: string): WorkflowSourceFile[]`
- `export function resolveWorkflowSourceDomains`
- `function inspectWorkflowSourceDomain`
- `function pickWorkflowSource`
- `function inspectWorkflowSourceCandidate`
- `export function resolveUniqueWorkflowSource`
- `export function assertIndexedWorkflowSourceIdentity`
- `function normalizeName(name: string): string`
- `function isSafeRelativeName(name: string): boolean`
- `function isWithinResolved(candidate: string, root: string): boolean`

### src/workflows/validate-summary.ts

- `export interface ValidateSummaryInput`
- `export interface ValidateSummaryResult`
- `export interface JudgeCallIdentity`
- `export type SummaryJudge = (prompt: { system: string; user: string }, identity?: JudgeCallIdentity) => Promise<string>;`
- `export interface JudgeVerdict`
- `export function parseJudgeVerdict(raw: string): JudgeVerdict | undefined`
- `function buildUserPrompt(input: ValidateSummaryInput): string`
- `export async function validateStepSummary`
- `function interruptionReason(signal: AbortSignal): Error`

## src/workflows/authoring/

### src/workflows/authoring/authoring.ts

- `export function getWorkflowTemplate(): string`
- `export function buildWorkflowTemplate(name?: string): string`
- `function validateWorkflowContent(content: string, sourcePath: string): void`
- `export function assertWorkflowMarkdownName(name: string): void`
- `export function createWorkflowAsset(input:`
- `function readWorkflowSource(source: string, bundleDir: string): string`
- `function normalizeWorkflowName(name: string): string`
- `function humanizeWorkflowName(name: string): string`
- `export function formatWorkflowErrors(path: string, errors: WorkflowError[]): string`
- `function findExistingWorkflowPaths(typeRoot: string, normalizedName: string): string[]`
- `function renderWorkflowTemplate(title: string): string`

## src/workflows/exec/

### src/workflows/exec/child-invocation.ts

- `export interface ChildInvocationKeyInput`
- `export function computeChildInvocationKey(input: ChildInvocationKeyInput): string`

### src/workflows/exec/child-workflow.ts

- `export interface DriveChildWorkflowContext`
- `export interface ChildWorkflowDriveOptions`
- `async function driveWithRealEngine(options: ChildWorkflowDriveOptions): Promise<void>`
- `export interface DriveChildWorkflowInput`
- `async function childFinalOutput(childRunId: string): Promise<unknown>`
- `function errorMessage(err: unknown): string`
- `function isLeaseBusyError(err: unknown): boolean`
- `function childWorkflowFailedMessage(input:`
- `function precheckAndDeriveInvocationKey`
- `async function publishChildRun`
- `async function driveChildRun`
- `export async function driveChildWorkflowUnit(input: DriveChildWorkflowInput): Promise<UnitOutcome>`

### src/workflows/exec/dispatch-redaction.ts

- `export interface DispatchSecretSources`
- `export function collectWorkflowDispatchSensitiveValues(dispatch: DispatchSecretSources): string[]`
- `function stringifySensitiveNumbers(value: unknown, sensitiveValues: readonly string[]): unknown`
- `export function redactUnitOutcome<T extends { failureReason?: string }>`

### src/workflows/exec/environment.ts

- `export interface MaterializedFrozenWorkflowEnvironment`
- `export function materializeFrozenWorkflowEnvironment`

### src/workflows/exec/exec-unit.ts

- `export interface RunExecUnitInput`
- `export async function runExecUnit(input: RunExecUnitInput): Promise<UnitDispatchResult>`
- `function reportStderrCaptureFailure(input: RunExecUnitInput, display: string, result: ManagedSubprocessResult): void`
- `function truncationNote(read: StreamReadResult): string`
- `function markTruncatedStdout(result: ManagedSubprocessResult): string`
- `function outputLimitFailure`
- `function checkExecContextSize(input: RunExecUnitInput): UnitDispatchResult | undefined`
- `function contextTooLarge`
- `type ResolvedCwd = { ok: true; path: string } | { ok: false; failureReason: string; error: string };`
- `async function resolveExecCwd(input: RunExecUnitInput): Promise<ResolvedCwd>`
- `async function isExistingDirectory(candidate: string): Promise<boolean>`
- `function childEnv`
- `function describeCommand(command: readonly string[]): string`
- `function stderrTail(stderr: string): string`
- `function stripTrailingNewlines(text: string): string`

### src/workflows/exec/frozen-judge.ts

- `export interface JudgeOwner`
- `export function gateNodeId(stepId: string): string`
- `export function resolveJudgeCwd`
- `function dispatchIdentity(owner: JudgeOwner, identity: JudgeCallIdentity | undefined): JudgeCallIdentity`
- `function warnLoweringNotices(notices: readonly Readonly<LoweringNotice>[] | undefined): void`
- `export function frozenSummaryJudge`

### src/workflows/exec/native-executor.ts

- `export interface StepExecutionContext`
- `export interface StepExecutionResult`
- `class DispatchBudget`
- `type UnitReuseDecision = { kind: "reuse"; row: WorkflowRunUnitRow } | { kind: "dispatch" };`
- `function classifyUnitReuse(workUnit: StepWorkUnit, completedRows: CompletedRowIndex | undefined): UnitReuseDecision`
- `type CompletedRowIndex = Map<string, WorkflowRunUnitRow[]>;`
- `function indexCompletedRows(rows: Iterable<WorkflowRunUnitRow>): CompletedRowIndex`
- `export function executeStepPlan(plan: WorkflowPlanStep, ctx: StepExecutionContext): Promise<StepExecutionResult>`
- `function openDispatchBudget`
- `const onUpstreamAbort = ()`
- `type StepDispatchPrerequisites`
- `async function prepareStepDispatchPrerequisites(input:`
- `async function executeStepPlanInConnection`
- `interface RunUnitInput`
- `async function runUnit(input: RunUnitInput): Promise<UnitOutcome>`
- `const attemptIdFor = (_attempt: number): string`
- `interface JournaledAttemptInput`
- `function journaledUnitResultJson(outcome: UnitOutcome): string | null`
- `async function reserveJournaledDispatch`
- `async function finishJournaledDispatch(input:`
- `async function dispatchJournaledAttempt(input: JournaledAttemptInput): Promise<UnitOutcome>`
- `function parseExecJson(raw: string): unknown`
- `interface UnitTransportFailure`
- `async function dispatchUnit`
- `const dispatchOnce = async (feedback?: string): Promise<Dispatched<UnitTransportFailure>> =>`
- `const transportFailed = (failure: UnitTransportFailure): UnitOutcome =>`
- `const captured = (): Partial<UnitOutcome> =>`
- `const validate = (candidate: unknown) =>`
- `export const defaultUnitDispatcher: UnitDispatcher = async (request, feedback) =>`
- `function substituteExecRefs`
- `function reuseCompletedUnit(unitId: string, row: WorkflowRunUnitRow, hasSchema: boolean): UnitOutcome`
- `function failedStep`
- `function message(err: unknown): string`

### src/workflows/exec/param-secrets.ts

- `function keyLooksSecret(key: string): boolean`
- `function valueLooksSecret(value: string): boolean`
- `export function detectSecretShapedParams(params: Record<string, unknown>): string[]`
- `export function secretShapedParamValues(params: Record<string, unknown>): string[]`
- `function walkSecretShaped`
- `const walk = (value: unknown, path: string, key: string | null): void =>`

### src/workflows/exec/run-workflow.ts

- `export interface RunWorkflowOptions`
- `export interface ExecutedStepReport`
- `export interface RunWorkflowResult`
- `export async function runWorkflowSteps(options: RunWorkflowOptions): Promise<RunWorkflowResult>`
- `async function runWorkflowAttempt`
- `export function workflowRunLockPath(runId: string): string`
- `export async function findLiveLockedRunOfRef(target: string): Promise<`
- `function acquireWorkflowRunLock(runId: string): LockOwnership`
- `async function workflowSourceDriftWarning`
- `async function completedRunResult(runId: string): Promise<RunWorkflowResult>`
- `function workflowSummaryJudge`
- `async function seedRunAccountingFromJournal(runId: string): Promise<`
- `async function loadAuthoritativeRunPlan`
- `async function recoverGateLoopState`
- `interface StepDriveContext`
- `interface StepGateLoopOutcome`
- `async function executeStepSubgraph`
- `async function runStepGateLoop`
- `const outcome = (rest: Omit<StepGateLoopOutcome, "unitsDispatched" | "tokensUsed">): StepGateLoopOutcome =>`
- `async function driveRun`

### src/workflows/exec/scheduler.ts

- `export function maxUnitConcurrency(cpuCount?: number, configured?: number): number`
- `export interface ScheduleOptions`
- `export async function scheduleUnits<T, R>`

### src/workflows/exec/step-work.ts

- `export interface UnitOutcome`
- `export interface GateFeedback`
- `export interface WorkListInput`
- `export interface StepWorkUnit`
- `export interface StepWorkList`
- `export type ComputeWorkListResult = { ok: true; list: StepWorkList } | { ok: false; error: string };`
- `function validateFanOutItems(stepId: string, items: unknown[]): string | undefined`
- `function occurrenceSuffixedUnitIds(nodeId: string, items: readonly unknown[]): string[]`
- `function resolveStepReference(reference: string, scope: ExpressionScope): ResolveReferenceResult`
- `type TaskInputBindingsResolution`
- `function resolveTaskInputBindings`
- `export function computeStepWorkList(plan: WorkflowPlanStep, input: WorkListInput): ComputeWorkListResult`
- `interface StepWorkUnitContext`
- `function buildStepWorkUnit(ctx: StepWorkUnitContext, unitId: string, item: unknown, index: number): StepWorkUnit`
- `function buildExecContextEnv(args:`
- `function computeUnitInputHash(ctx: StepWorkUnitContext, item: unknown): string`
- `export interface BuildUnitPromptInput`
- `export function buildUnitPrompt(input: BuildUnitPromptInput): string`
- `export function unitIdFor(nodeId: string, item: unknown, isFanOut: boolean, collisionSafe = false): string`
- `export function projectStepOutput(evidence: Record<string, unknown>): unknown`
- `export function stepOutputsFromEvidence`
- `function stepTemplate(stepPlan: WorkflowPlanStep): WorkflowUnitNode | undefined`
- `export function referencedStepIds(plan: WorkflowPlan): Set<string>`
- `const note = (reference: string): void =>`
- `export function validateStepArtifact(plan: WorkflowPlanStep, evidence: Record<string, unknown>): string | undefined`
- `export function unitSchemaWarning(plan: WorkflowPlanStep, units: readonly UnitOutcome[]): string | undefined`
- `export function buildArtifactSummary(stepId: string, units: UnitOutcome[], evidence: Record<string, unknown>): string`
- `function unitOutputValue(unit: UnitOutcome): unknown`
- `export function buildEvidence`
- `export interface ExecutedStepOutcome`
- `function firstFailureDiagnostic(failed: UnitOutcome[]): string`
- `export function reduceStepOutcomes`
- `export function reduceEmptyStep(plan: WorkflowPlanStep, reducer: WorkflowReducer): ExecutedStepOutcome`
- `export function unitOutcomeFromRow(unitId: string, row: WorkflowRunUnitRow, hasSchema: boolean): UnitOutcome`
- `export function gateUnitId(stepId: string, loop: number): string`
- `export function effectiveGateMaxLoops(stepPlan: WorkflowPlanStep): number`
- `export function activeGateLoop(rows: WorkflowRunUnitRow[], stepId: string): number`
- `export function recoverGateFeedback`
- `function gateLoopOf(unitId: string, stepId: string): number | undefined`
- `type GateVerdict`
- `function parseGateVerdict(row: WorkflowRunUnitRow): GateVerdict`
- `function gateCorruptionMessage(row: WorkflowRunUnitRow, why: string): string`
- `export interface GateUnitRef`
- `export async function journalGateEvaluationStart(gate: GateUnitRef): Promise<GateUnitRef>`
- `export async function journalGateEvaluationFinish`
- `export interface FinalizeStepInput`
- `export type FinalizeStepResult`
- `function judgeFailureNotes(runId: string, stepId: string, cause: string): string`
- `export interface JudgeFailureBlock`
- `export async function blockStepForJudgeFailure(input: JudgeFailureBlock): Promise<string>`
- `async function blockFinalizedStep(input: FinalizeStepInput, cause: string): Promise<FinalizeStepResult>`
- `function childWorkflowBlockedNotes`
- `export interface ChildWorkflowBlock`
- `export async function blockStepForChildWorkflow(input: ChildWorkflowBlock): Promise<string>`
- `async function blockFinalizedStepForChildWorkflow`
- `export async function finalizeExecutedStep(input: FinalizeStepInput): Promise<FinalizeStepResult>`
- `function safeJson(value: unknown): string`

### src/workflows/exec/unit-dispatch.ts

- `export interface UnitDispatchRequest`
- `export interface UnitDispatchResult`
- `export type UnitDispatcher = (request: UnitDispatchRequest, feedback?: string) => Promise<UnitDispatchResult>;`
- `export function prepareWorkflowExecution`
- `function message(err: unknown): string`
- `export function forwardedDispatchEventSource`
- `export async function dispatchWorkflowExecution`

### src/workflows/exec/unit-writer.ts

- `export function enqueueUnitWrite<T>(fn: () => Promise<T>): Promise<T>`

## src/workflows/freeze/

### src/workflows/freeze/environment.ts

- `export function freezeEnvironment`
- `function qualifyEnvRef(refInput: string, context: ResolutionContext): string`

### src/workflows/freeze/freeze.ts

- `export interface FrozenWorkflow`
- `export async function freezeWorkflow`
- `async function resolveStep(source: FreezeStep, context: ResolutionContext): Promise<ResolvedDispatch>`
- `function resolveJudge(source: FreezeStep, rubric: string, context: ResolutionContext): ResolvedDispatch`
- `function frozenRoot`

### src/workflows/freeze/step-values.ts

- `export type FreezeStep = WorkflowStepSpec & { readonly id: string };`
- `export type BaseUnit = WorkflowUnitSettings & { source: SourceRef; exec?: WorkflowExec };`
- `export type ChildFreezeFn =`
- `export interface ResolutionContext`
- `export interface ResolvedDispatch`
- `export function baseUnitOf(source: FreezeStep): BaseUnit`
- `export function freezeExecSpec(source: FreezeStep, exec: WorkflowExec, context: ResolutionContext): WorkflowExecSpec`
- `export function targetConcurrency(runner: RunnerSpec): number | undefined`
- `export function durableRequest(request: ResolvedExecutionRequestV1): ResolvedExecutionRequestV1`
- `export function executionUnitValues`
- `export function earlierStepIds(plan: WorkflowPlan, stepId: string): ReadonlySet<string>`
- `export function declaredParamNames(plan: WorkflowPlan): ReadonlySet<string>`

### src/workflows/freeze/task-bindings.ts

- `export interface FreezeTaskInputBindingsInput`
- `function inputBindingInvalid(message: string): UsageError`
- `function unknownBindingNameError`
- `export function freezeTaskInputBindings(input: FreezeTaskInputBindingsInput): readonly TaskInputBinding[]`
- `function finalizeBindings`
- `function normalizeOneEntry`

## src/workflows/freeze/targets/

### src/workflows/freeze/targets/child-workflow.ts

- `export interface ChildWorkflowDispatchInput`
- `function childWorkflowContentHash(fields:`
- `function isWorkflowRef(ref: string): boolean`
- `function compositionPath(refPath: readonly string[], childRef: string): string`
- `function assertNoCompositionCycle(stepId: string, childRef: string, refPath: readonly string[]): void`
- `export async function childWorkflowDispatch(input: ChildWorkflowDispatchInput): Promise<ResolvedDispatch>`

### src/workflows/freeze/targets/command.ts

- `export async function commandDispatch`
- `export function commandResult`

### src/workflows/freeze/targets/shell.ts

- `export function directShell(source: FreezeStep, baseUnit: BaseUnit, context: ResolutionContext): ResolvedDispatch`

## src/workflows/ir/

### src/workflows/ir/params.ts

- `export interface WorkflowParameterPlan`
- `export type WorkflowParameterFlag = InputFlag;`
- `function contractFromPlan(plan: WorkflowParameterPlan): InputContract`
- `function invalidParameter(name: string, message: string): UsageError`
- `export function materializeWorkflowParameterFlags`
- `export function applyWorkflowParamDefaults`
- `export function validateWorkflowParams(plan: WorkflowParameterPlan, params: Record<string, unknown>): string[]`

### src/workflows/ir/plan-hash.ts

- `export function computePlanHash(plan: unknown): string`
- `export function canonicalPlanJson(plan: unknown): string`
- `export function canonicalJson(value: unknown): string`
- `function sortKeys(value: unknown): unknown`

## src/workflows/program/

### src/workflows/program/expressions.ts

- `export type ExpressionAst`
- `export interface ExpressionScope`
- `export interface ResolutionError`
- `export type ResolveReferenceResult = { ok: true; value: unknown } | { ok: false; error: ResolutionError };`
- `export function parseReference(source: string):`
- `function readIdent(text: string, start: number):`
- `function parsePath`
- `export function resolveReference(expr: ExpressionAst, scope: ExpressionScope): ResolveReferenceResult`
- `const fail = (message: string): ResolveReferenceResult =>`
- `export function resolveReferenceString(text: string, scope: ExpressionScope): ResolveReferenceResult`
- `function finish`
- `export function formatReference(expr: ExpressionAst): string`

## src/workflows/runtime/

### src/workflows/runtime/agent-identity.ts

- `export interface AgentIdentity`
- `interface IdentityMarker`
- `function deriveMarkers`
- `function firstNonEmpty(env: NodeJS.ProcessEnv, keys: readonly string[]): string | null`
- `export function resolveAgentIdentity(env: NodeJS.ProcessEnv = process.env): AgentIdentity`

### src/workflows/runtime/run-plan.ts

- `export type RunPlanRead = { ok: true; plan: WorkflowPlan } | { ok: false; problem: string; newer: boolean };`
- `export function readRunPlan`
- `export interface FrozenStepRowDefinition`
- `export function frozenStepRows(plan: WorkflowPlan): FrozenStepRowDefinition[]`
- `export interface DecodeWorkflowPlanOptions`
- `export function decodeWorkflowPlan(input: unknown, options: DecodeWorkflowPlanOptions`
- `function legacySourceHash(readSet: unknown, workflowRef: string | undefined): string | undefined`
- `function decodeStep(value: unknown, index: number): WorkflowPlanStep`
- `function decodeNode(value: unknown, stepId: string): WorkflowExecNode`
- `function decodeUnit(node: Record<string, unknown>, stepId: string): WorkflowUnitNode`
- `function decodeGate(value: unknown, stepId: string): WorkflowGateNode`
- `function decodeTarget(value: unknown, label: string): FrozenWorkflowTarget`
- `function decodeCommandTarget(target: Record<string, unknown>, label: string): FrozenWorkflowCommandTarget`
- `function legacyField(source: Record<string, unknown>, key: string):`
- `function decodeExec(value: unknown, label: string): WorkflowExecSpec`
- `function decodeInputBindings(value: unknown, label: string): readonly TaskInputBinding[] | undefined`
- `function decodeEnvironmentBinding(value: unknown, label: string): FrozenWorkflowEnvironmentBinding`
- `const strings = (items: unknown): string[]`
- `function positiveInteger(value: unknown): number | undefined`
- `function string(value: unknown, label: string): string`
- `function record(value: unknown, label: string): Record<string, unknown>`
- `function fail(message: string): never`

### src/workflows/runtime/runs.ts

- `export interface WorkflowRunDetail`
- `export interface WorkflowChildRunNode`
- `export interface WorkflowUnitDiagnostic`
- `function runtimeKindOf(runner: string | null): WorkflowRuntimeKind | null`
- `function toUnitDiagnostic(row: WorkflowRunUnitRow): WorkflowUnitDiagnostic`
- `export interface WorkflowNextResult`
- `export interface CompleteWorkflowStepInput`
- `export interface SummaryValidationFailure`
- `export async function startWorkflowRun`
- `function decodeStatusPlan(planJson: string | null | undefined): WorkflowPlan | undefined`
- `export async function getWorkflowStatus(runId: string, opts?:`
- `export async function listWorkflowRuns(input?:`
- `export async function getNextWorkflowStep`
- `function projectNextResult(run: WorkflowRunRow, steps: WorkflowRunStepRow[]): WorkflowNextResult`
- `export async function resumeWorkflowRun(runId: string): Promise<WorkflowRunDetail>`
- `export async function abandonWorkflowRun(runId: string): Promise<WorkflowRunDetail>`
- `export async function completeWorkflowStep`
- `async function resolveRunSpecifier`
- `function interruptionReason(signal: AbortSignal): Error`
- `async function canonicalizeWorkflowSpecifier(specifier: string): Promise<string>`
- `async function workflowRunRefSet(canonicalRef: string, exactRef: string): Promise<string[]>`
- `function findRunByIdOrPrefix(repo: WorkflowRunsRepository, specifier: string): WorkflowRunRow | undefined`
- `export async function resolveWorkflowRunTarget(specifier: string): Promise<string | undefined>`
- `function readWorkflowRunOrPrefix(repo: WorkflowRunsRepository, specifier: string): WorkflowRunRow`
- `function readWorkflowRun(repo: WorkflowRunsRepository, runId: string): WorkflowRunRow`
- `function requireRunPlan(run: WorkflowRunRow): WorkflowPlan`
- `function readWorkflowRunSteps(repo: WorkflowRunsRepository, runId: string): WorkflowRunStepRow[]`
- `function buildWorkflowRunDetail`
- `function childRunTree`
- `function toChildRunNode(repo: WorkflowRunsRepository, rootRunId: string, row: WorkflowRunRow): WorkflowChildRunNode`
- `function toWorkflowRunSummary(run: WorkflowRunRow): WorkflowRunSummary`
- `function toWorkflowRunStepState(step: WorkflowRunStepRow): WorkflowRunStepState`
- `function resolveCurrentStep(run: WorkflowRunRow, steps: WorkflowRunStepRow[]): WorkflowRunStepRow | undefined`
- `function deriveRunState(steps: WorkflowRunStepRow[]):`
- `function parseJsonObject(value: string | null): Record<string, unknown> | undefined`
- `function parseJsonArray(value: string | null): string[] | undefined`

### src/workflows/runtime/workflow-asset-loader.ts

- `export type WorkflowAsset =`
- `export function canonicalWorkflowRunRef(bundle: string | undefined, canonicalName: string): string`
- `export function parseWorkflowRefInput(ref: string): BundleRef`
- `export async function canonicalizeWorkflowRefInput(ref: string): Promise<string>`
- `type ResolvedWorkflowAsset =`
- `function resolveWorkflowAsset(ref: string): ResolvedWorkflowAsset`
- `export function resolveRunBundleRoot(ref: string): string`
- `export async function loadWorkflowAsset(ref: string): Promise<WorkflowAsset>`
