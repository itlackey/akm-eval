---
description: "Repo map of akm src/workflows at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  workflows/
    authoring/
      authoring.ts
    exec/
      child-invocation.ts
      child-workflow.ts
      dispatch-redaction.ts
      environment.ts
      exec-unit.ts
      frozen-judge.ts
      native-executor.ts
      param-secrets.ts
      run-workflow.ts
      scheduler.ts
      step-work.ts
      unit-dispatch.ts
      unit-writer.ts
    freeze/
      targets/
        child-workflow.ts
        command.ts
        shell.ts
      environment.ts
      freeze.ts
      step-values.ts
      task-bindings.ts
    ir/
      params.ts
      plan-hash.ts
    program/
      expressions.ts
    runtime/
      agent-identity.ts
      run-plan.ts
      runs.ts
      workflow-asset-loader.ts
    compile.ts
    concurrency-policy.ts
    parser.ts
    plan.ts
    renderer.ts
    resource-limits.ts
    source-files.ts
    validate-summary.ts
```

# Files

## File: src/workflows/authoring/authoring.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import workflowTemplate from "../../assets/workflows/workflow-template.md" with { type: "text" };
import { ensureAkmMarkdownType } from "../../core/asset/akm-markdown";
import { makeBundleRef } from "../../core/asset/asset-ref";
import { isWithin, writeFileAtomic } from "../../core/common";
import { loadConfig } from "../../core/config/config";
import { UsageError } from "../../core/errors";
import { defaultBundleForTarget } from "../../core/mutation-target";
import { canonicalizeWorkflowName, WORKFLOW_EXTENSIONS } from "../../core/recognition-util";
import { warn } from "../../core/warn";
import { prepareWriteTargetForMutation, resolveWriteTarget, withWriteTargetMutation } from "../../core/write-source";
import { checkWorkflowPlan, compileWorkflowSource } from "../compile";
import type { WorkflowError } from "../plan";
⋮----
export function getWorkflowTemplate(): string
⋮----
export function buildWorkflowTemplate(name?: string): string
⋮----
function validateWorkflowContent(content: string, sourcePath: string): void
⋮----
export function assertWorkflowMarkdownName(name: string): void
⋮----
export function createWorkflowAsset(input:
⋮----
function readWorkflowSource(source: string, bundleDir: string): string
⋮----
function normalizeWorkflowName(name: string): string
⋮----
function humanizeWorkflowName(name: string): string
⋮----
export function formatWorkflowErrors(path: string, errors: WorkflowError[]): string
⋮----
function findExistingWorkflowPaths(typeRoot: string, normalizedName: string): string[]
⋮----
function renderWorkflowTemplate(title: string): string
```

## File: src/workflows/exec/child-invocation.ts
```typescript
import { createHash } from "node:crypto";
import { canonicalJson } from "../ir/plan-hash";
⋮----
export interface ChildInvocationKeyInput {
  readonly parentRunId: string;

  readonly parentUnitId: string;

  readonly unitInputHash: string;
}
⋮----
export function computeChildInvocationKey(input: ChildInvocationKeyInput): string
```

## File: src/workflows/exec/child-workflow.ts
```typescript
import { randomUUID } from "node:crypto";
import { TransientError } from "../../core/errors";
import { type WorkflowRunRow, withWorkflowRunsRepo } from "../../storage/repositories/workflow-runs-repository";
import { validateWorkflowParams } from "../ir/params";
import { canonicalPlanJson } from "../ir/plan-hash";
import type { FrozenChildWorkflowTarget } from "../plan";
import { frozenStepRows } from "../runtime/run-plan";
import { computeChildInvocationKey } from "./child-invocation";
import type { UnitOutcome } from "./step-work";
import type { UnitDispatcher, UnitDispatchRequest } from "./unit-dispatch";
⋮----
export interface DriveChildWorkflowContext {
  readonly runId: string;
  readonly signal?: AbortSignal;
  readonly dispatcher?: UnitDispatcher;
  readonly maxConcurrency?: number;
  readonly eventSource?: string;
  readonly bundleRootOverride?: string;

  readonly workflowRef?: string;
  readonly params?: Record<string, unknown>;
  readonly evidence?: Record<string, Record<string, unknown> | undefined>;
}
⋮----
export interface ChildWorkflowDriveOptions {
  readonly target: string;
  readonly signal?: AbortSignal;
  readonly dispatcher?: UnitDispatcher;
  readonly maxConcurrency?: number;
  readonly eventSource?: string;
  readonly bundleRootOverride?: string;
}
⋮----
async function driveWithRealEngine(options: ChildWorkflowDriveOptions): Promise<void>
⋮----
export interface DriveChildWorkflowInput {

  readonly request: UnitDispatchRequest;
  readonly target: FrozenChildWorkflowTarget;
  readonly ctx: DriveChildWorkflowContext;
  readonly childParams: Readonly<Record<string, unknown>>;

  readonly inputHash: string;
  readonly dispatcher: UnitDispatcher;
}
⋮----
async function childFinalOutput(childRunId: string): Promise<unknown>
⋮----
function errorMessage(err: unknown): string
⋮----
function isLeaseBusyError(err: unknown): boolean
⋮----
function childWorkflowFailedMessage(input: {
  childRunId: string;
  childRef: string;
  childStepId: string;
  parentStepId: string;
}): string
⋮----
function precheckAndDeriveInvocationKey(
  input: Pick<DriveChildWorkflowInput, "request" | "target" | "ctx" | "childParams" | "inputHash">,
):
⋮----
async function publishChildRun(
  input: Pick<DriveChildWorkflowInput, "request" | "target" | "ctx" | "childParams">,
  invocationKey: string,
): Promise<
⋮----
async function driveChildRun(
  input: Pick<DriveChildWorkflowInput, "request" | "target" | "ctx">,
  childRow: WorkflowRunRow,
): Promise<
⋮----
export async function driveChildWorkflowUnit(input: DriveChildWorkflowInput): Promise<UnitOutcome>
```

## File: src/workflows/exec/dispatch-redaction.ts
```typescript
import { collectInferredSecretValues, collectSensitiveValues, redactSensitiveValue } from "../../core/redaction";
import type { RunnerSpec } from "../../integrations/agent/runner";
import { collectDispatchSensitiveValues } from "../../integrations/agent/runner-dispatch";
⋮----
export interface DispatchSecretSources {
  runner?: RunnerSpec;

  sensitiveValues?: readonly string[];
}
⋮----
export function collectWorkflowDispatchSensitiveValues(dispatch: DispatchSecretSources): string[]
⋮----
function stringifySensitiveNumbers(value: unknown, sensitiveValues: readonly string[]): unknown
⋮----
export function redactUnitOutcome<T extends { failureReason?: string }>(
  outcome: T,
  sensitiveValues: readonly string[],
): T
```

## File: src/workflows/exec/environment.ts
```typescript
import { resolveEnvBinding } from "../../commands/env/env-binding";
import type { FrozenWorkflowEnvironmentBinding } from "../plan";
⋮----
export interface MaterializedFrozenWorkflowEnvironment {
  readonly values: Record<string, string>;

  readonly sensitiveValues: string[];
}
⋮----
export function materializeFrozenWorkflowEnvironment(
  descriptors: readonly FrozenWorkflowEnvironmentBinding[],
): MaterializedFrozenWorkflowEnvironment
```

## File: src/workflows/exec/exec-unit.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { childProcessEnv } from "../../core/paths";
import {
  type ManagedSubprocessResult,
  runManagedSubprocess,
  type SpawnFn,
  type StreamReadResult,
  streamCaptureFailure,
} from "../../core/subprocess";
import { warn } from "../../core/warn";
import type { WorkflowExecSpec } from "../plan";
import {
  type ExecContextLimits,
  execContextLimits,
  utf8Bytes,
  WORKFLOW_EXEC_OUTPUT_TRUNCATED_MARKER,
  WORKFLOW_MAX_EXEC_OUTPUT_BYTES,
  WORKFLOW_UNIT_DIAGNOSTIC_CLIP,
} from "../resource-limits";
import type { UnitDispatchResult } from "./unit-dispatch";
⋮----
export interface RunExecUnitInput {

  unitId: string;
  exec: WorkflowExecSpec;




  baseDir: string;

  env?: Record<string, string>;






  context?: Record<string, string>;






  hasOutputSchema?: boolean;

  timeoutMs: number | null;
  signal?: AbortSignal;

  spawnFn?: SpawnFn;

  platform?: string;

  eventSource?: string;
}
⋮----
export async function runExecUnit(input: RunExecUnitInput): Promise<UnitDispatchResult>
⋮----
// stdout is the artifact; retention is bounded (discarding past the cap, never killing).
⋮----
/** Warn about an unfinished stderr drain on an otherwise successful unit (its stdout artifact is whole). */
function reportStderrCaptureFailure(input: RunExecUnitInput, display: string, result: ManagedSubprocessResult): void
⋮----
/** The sentence naming what the retention cap discarded, shared by both reports below. */
function truncationNote(read: StreamReadResult): string
⋮----
/** The captured stdout, with a truncation block naming both byte counts when the cap discarded some. */
function markTruncatedStdout(result: ManagedSubprocessResult): string
⋮----
/** The output-cap failure for a unit with an `output:` schema: no partial text, byte counts in the message. */
function outputLimitFailure(
  input: RunExecUnitInput,
  display: string,
  result: ManagedSubprocessResult,
): UnitDispatchResult
⋮----
function checkExecContextSize(input: RunExecUnitInput): UnitDispatchResult | undefined
⋮----
function contextTooLarge(
  input: RunExecUnitInput,
  what: string,
  names: string,
  limits: ExecContextLimits,
): UnitDispatchResult
⋮----
type ResolvedCwd = { ok: true; path: string } | { ok: false; failureReason: string; error: string };
⋮----
async function resolveExecCwd(input: RunExecUnitInput): Promise<ResolvedCwd>
⋮----
async function isExistingDirectory(candidate: string): Promise<boolean>
⋮----
function childEnv(
  bindings: Record<string, string> | undefined,
  context: Record<string, string> | undefined,
  eventSource: string | undefined,
): Record<string, string>
⋮----
function describeCommand(command: readonly string[]): string
⋮----
function stderrTail(stderr: string): string
⋮----
/** Strip trailing line terminators, matching shell `$(…)` command substitution. */
function stripTrailingNewlines(text: string): string
```

## File: src/workflows/exec/frozen-judge.ts
```typescript
import { warn } from "../../core/warn";
import { mergeNotices } from "../../execution/notices";
import type { LoweringNotice } from "../../execution/resolved-request";
import type { FrozenWorkflowCommandTarget } from "../plan";
import { resolveRunBundleRoot } from "../runtime/workflow-asset-loader";
import type { JudgeCallIdentity, SummaryJudge } from "../validate-summary";
import { dispatchWorkflowExecution, type UnitDispatcher, type UnitDispatchRequest } from "./unit-dispatch";
⋮----
export interface JudgeOwner {
  runId: string;
  stepId: string;
}
⋮----
export function gateNodeId(stepId: string): string
⋮----
export function resolveJudgeCwd(
  target: FrozenWorkflowCommandTarget | null | undefined,
  workflowRef: string,
): string | undefined
⋮----
function dispatchIdentity(owner: JudgeOwner, identity: JudgeCallIdentity | undefined): JudgeCallIdentity
⋮----
function warnLoweringNotices(notices: readonly Readonly<LoweringNotice>[] | undefined): void
⋮----
export function frozenSummaryJudge(
  target: FrozenWorkflowCommandTarget | null | undefined,
  signal: AbortSignal | undefined,
  dispatcher: UnitDispatcher | undefined,
  owner: JudgeOwner,
  eventSource?: string,
  cwd?: string,
): SummaryJudge | null
```

## File: src/workflows/exec/native-executor.ts
```typescript
import { resolveRefToken } from "../../commands/env/env-binding";
import { isInstalledBundle } from "../../core/env-secret-ref";
import { NotFoundError } from "../../core/errors";
import { validateJsonSchemaSubset } from "../../core/json-schema";
import { substituteRefTokens } from "../../core/ref-token";
import { warn } from "../../core/warn";
import { mergeNotices } from "../../execution/notices";
import type { LoweringNotice } from "../../execution/resolved-request";
import { type Dispatched, isRefused, jsonParser, structuredLoop } from "../../llm/structured";
import {
  type WorkflowRunUnitAttemptRowV4,
  type WorkflowRunUnitRow,
  withWorkflowRunsConnection,
  withWorkflowRunsRepo,
} from "../../storage/repositories/workflow-runs-repository";
import type { WorkflowBudget, WorkflowExecSpec, WorkflowPlanStep } from "../plan";
import { WORKFLOW_UNIT_DIAGNOSTIC_CLIP } from "../resource-limits";
import { resolveRunBundleRoot } from "../runtime/workflow-asset-loader";
⋮----
import { driveChildWorkflowUnit } from "./child-workflow";
⋮----
import { collectWorkflowDispatchSensitiveValues, redactUnitOutcome } from "./dispatch-redaction";
import { materializeFrozenWorkflowEnvironment } from "./environment";
⋮----
import { runExecUnit } from "./exec-unit";
import { secretShapedParamValues } from "./param-secrets";
import { scheduleUnits } from "./scheduler";
⋮----
import {
  clip,
  computeStepWorkList,
  type GateFeedback,
  reduceEmptyStep,
  reduceStepOutcomes,
  type StepWorkUnit,
  stepOutputsFromEvidence,
  type UnitOutcome,
  unitOutcomeFromRow,
} from "./step-work";
import {
  dispatchWorkflowExecution,
  type UnitDispatcher,
  type UnitDispatchRequest,
  type UnitDispatchResult,
} from "./unit-dispatch";
⋮----
import { enqueueUnitWrite } from "./unit-writer";
⋮----
export interface StepExecutionContext {
  runId: string;
  workflowRef: string;
  params: Record<string, unknown>;

  evidence: Record<string, Record<string, unknown> | undefined>;





  gateLoop?: number;

  gateFeedback?: GateFeedback;
  signal?: AbortSignal;

  dispatcher?: UnitDispatcher;

  eventSource?: string;





  unitsDispatched?: number;







  budget?: WorkflowBudget;





  tokensUsed?: number;

  maxConcurrency?: number;




  bundleRootOverride?: string;
}
⋮----
export interface StepExecutionResult {
  ok: boolean;
  units: UnitOutcome[];

  notices?: readonly Readonly<LoweringNotice>[];

  evidence: Record<string, unknown>;

  summary: string;




  unitsDispatched: number;






  tokensUsed?: number;

  artifactSchemaFailure?: true;






  childBlocked?: {
    childRunId: string;
    childRef: string;
    childStepId: string | null;
  };
}
⋮----
class DispatchBudget
⋮----
constructor(
    alreadyDispatched: number,
    opts?: { tokensUsed?: number; budget?: WorkflowBudget; onExceeded?: () => void },
)
⋮----
tryConsume(): boolean
⋮----
addTokens(tokens: number): void
⋮----
private exceed(message: string): void
⋮----
type UnitReuseDecision = { kind: "reuse"; row: WorkflowRunUnitRow } | { kind: "dispatch" };
⋮----
function classifyUnitReuse(workUnit: StepWorkUnit, completedRows: CompletedRowIndex | undefined): UnitReuseDecision
⋮----
type CompletedRowIndex = Map<string, WorkflowRunUnitRow[]>;
⋮----
function indexCompletedRows(rows: Iterable<WorkflowRunUnitRow>): CompletedRowIndex
⋮----
/**
 * Execute one step plan natively. Never throws for unit-level failures. The
 * whole step shares one state.db connection scope ({@link withWorkflowRunsConnection}).
 */
export function executeStepPlan(plan: WorkflowPlanStep, ctx: StepExecutionContext): Promise<StepExecutionResult>
⋮----
/**
 * Open the step's dispatch budget and the abort signal it trips: with a
 * declared budget, dispatch runs under an AbortController chained onto
 * `ctx.signal`. The caller must call `unchainSignal` when dispatch finishes.
 */
function openDispatchBudget(
  ctx: StepExecutionContext,
  dispatched: number,
):
⋮----
const onUpstreamAbort = ()
⋮----
unchainSignal = ()
⋮----
onExceeded = ()
⋮----
type StepDispatchPrerequisites =
  | {
      ok: true;

      cwd?: string;
      env?: Record<string, string>;
      sensitiveValues?: readonly string[];
    }
  | { ok: false; result: StepExecutionResult };
⋮----
async function prepareStepDispatchPrerequisites(input: {
  plan: WorkflowPlanStep;
  ctx: StepExecutionContext;
  workUnits: readonly StepWorkUnit[];
  willDispatch: boolean;
  dispatched: number;
}): Promise<StepDispatchPrerequisites>
⋮----
async function executeStepPlanInConnection(
  plan: WorkflowPlanStep,
  ctx: StepExecutionContext,
): Promise<StepExecutionResult>
⋮----
interface RunUnitInput {
  plan: WorkflowPlanStep;

  workUnit: StepWorkUnit;

  cwd?: string;
  env?: Record<string, string>;

  sensitiveValues?: readonly string[];
  ctx: StepExecutionContext;




  signal?: AbortSignal;
  dispatcher: UnitDispatcher;




  reuse: UnitReuseDecision;

  budget: DispatchBudget;
}
⋮----
async function runUnit(input: RunUnitInput): Promise<UnitOutcome>
⋮----
const attemptIdFor = (_attempt: number): string
⋮----
interface JournaledAttemptInput {
  plan: WorkflowPlanStep;
  workUnit: StepWorkUnit;
  ctx: StepExecutionContext;
  dispatcher: UnitDispatcher;
  request: UnitDispatchRequest;

  attemptId: string;
  inputHash: string;
}
⋮----
function journaledUnitResultJson(outcome: UnitOutcome): string | null
⋮----
async function reserveJournaledDispatch(
  input: JournaledAttemptInput,
  startedAt: string,
): Promise<WorkflowRunUnitAttemptRowV4>
⋮----
async function finishJournaledDispatch(input: {
  attempt: JournaledAttemptInput;
  durableAttempt: WorkflowRunUnitAttemptRowV4;
  finishedAt: string;
  outcome: UnitOutcome;
}): Promise<void>
⋮----
async function dispatchJournaledAttempt(input: JournaledAttemptInput): Promise<UnitOutcome>
⋮----
function parseExecJson(raw: string): unknown
⋮----
interface UnitTransportFailure {
  failureReason: string;
  error: string;
  text?: string;
}
⋮----
async function dispatchUnit(
  request: UnitDispatchRequest,
  dispatcher: UnitDispatcher,

  resolvedSecrets: Set<string>,
): Promise<UnitOutcome>
⋮----
const dispatchOnce = async (feedback?: string): Promise<Dispatched<UnitTransportFailure>> =>
const transportFailed = (failure: UnitTransportFailure): UnitOutcome => (
const captured = (): Partial<UnitOutcome> => (
⋮----
const validate = (candidate: unknown) =>
⋮----
export const defaultUnitDispatcher: UnitDispatcher = async (request, feedback) =>
⋮----
function substituteExecRefs(
  unitId: string,
  exec: WorkflowExecSpec,
):
⋮----
function reuseCompletedUnit(unitId: string, row: WorkflowRunUnitRow, hasSchema: boolean): UnitOutcome
⋮----
function failedStep(
  dispatched: number,
  reason: string,
  notices?: readonly Readonly<LoweringNotice>[],
): StepExecutionResult
⋮----
function message(err: unknown): string
```

## File: src/workflows/exec/param-secrets.ts
```typescript
function keyLooksSecret(key: string): boolean
⋮----
function valueLooksSecret(value: string): boolean
⋮----
export function detectSecretShapedParams(params: Record<string, unknown>): string[]
⋮----
export function secretShapedParamValues(params: Record<string, unknown>): string[]
⋮----
function walkSecretShaped(
  params: Record<string, unknown>,
  hit: (path: string, why: string, value: unknown) => void,
): void
⋮----
const walk = (value: unknown, path: string, key: string | null): void =>
```

## File: src/workflows/exec/run-workflow.ts
```typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TransientError, UsageError } from "../../core/errors";
import { type LockOwnership, probeLock, releaseLock } from "../../core/file-lock";
import { formatLockHolderPid, tryAcquireRunLock } from "../../core/run-lock";
import { mergeNotices } from "../../execution/notices";
import type { LoweringNotice } from "../../execution/resolved-request";
import type { WorkflowRunStepState, WorkflowRunSummary } from "../../sources/types";
import { resolveStorageLocations } from "../../storage/locations";
import { withWorkflowRunsConnection, withWorkflowRunsRepo } from "../../storage/repositories/workflow-runs-repository";
import type { WorkflowParameterFlag } from "../ir/params";
import { computePlanHash } from "../ir/plan-hash";
import type { WorkflowPlan, WorkflowPlanStep } from "../plan";
import { decodeWorkflowPlan, readRunPlan } from "../runtime/run-plan";
import {
  abandonWorkflowRun,
  getNextWorkflowStep,
  listWorkflowRuns,
  resolveWorkflowRunTarget,
  resumeWorkflowRun,
  type WorkflowNextResult,
} from "../runtime/runs";
import { loadWorkflowAsset } from "../runtime/workflow-asset-loader";
import type { SummaryJudge } from "../validate-summary";
import { frozenSummaryJudge, resolveJudgeCwd } from "./frozen-judge";
import {
  defaultUnitDispatcher,
  executeStepPlan,
  type StepExecutionResult,
  type UnitDispatcher,
} from "./native-executor";
⋮----
import {
  activeGateLoop,
  blockStepForJudgeFailure,
  effectiveGateMaxLoops,
  finalizeExecutedStep,
  type GateFeedback,
  recoverGateFeedback,
  referencedStepIds,
} from "./step-work";
⋮----
export interface RunWorkflowOptions {

  target: string;

  params?: Record<string, unknown>;

  parameterFlags?: readonly WorkflowParameterFlag[];

  maxSteps?: number;

  maxRetries?: number;
  signal?: AbortSignal;

  dispatcher?: UnitDispatcher;




  loadPlan?: (workflowRef: string) => Promise<WorkflowPlan>;

  maxConcurrency?: number;

  bundleRootOverride?: string;






  summaryJudge?: SummaryJudge | null;





  eventSource?: string;
}
⋮----
export interface ExecutedStepReport {
  stepId: string;
  ok: boolean;
  unitCount: number;
  failedUnits: number;
  summary: string;

  notices?: readonly Readonly<LoweringNotice>[];
}
⋮----
export interface RunWorkflowResult {
  run: WorkflowRunSummary;
  executed: ExecutedStepReport[];






  stepsProcessed: number;

  done?: true;

  gateRejection?: { stepId: string; missing: string[]; feedback: string };







  judgeFailure?: { stepId: string; message: string };





  childBlocked?: { stepId: string; childRunId: string; childRef: string; resume: string; resumeParentCommand: string };

  aborted?: true;

  notices?: readonly Readonly<LoweringNotice>[];







  warnings?: string[];
}
⋮----
export async function runWorkflowSteps(options: RunWorkflowOptions): Promise<RunWorkflowResult>
⋮----
async function runWorkflowAttempt(
  options: RunWorkflowOptions,
  liveEvidence: Map<string, Record<string, unknown>>,
): Promise<RunWorkflowResult>
⋮----
export function workflowRunLockPath(runId: string): string
⋮----
export async function findLiveLockedRunOfRef(target: string): Promise<
⋮----
function acquireWorkflowRunLock(runId: string): LockOwnership
⋮----
async function workflowSourceDriftWarning(
  runId: string,
  workflowRef: string,
  plan: WorkflowPlan,
): Promise<string | undefined>
⋮----
async function completedRunResult(runId: string): Promise<RunWorkflowResult>
⋮----
function workflowSummaryJudge(
  options: RunWorkflowOptions,
  stepPlan: WorkflowPlanStep,
  signal: AbortSignal | undefined,
  owner: { runId: string; stepId: string },
  workflowRef: string,
): SummaryJudge | null
⋮----
async function seedRunAccountingFromJournal(runId: string): Promise<
⋮----
async function loadAuthoritativeRunPlan(
  options: RunWorkflowOptions,
  next: WorkflowNextResult,
  stored: WorkflowPlan,
): Promise<WorkflowPlan>
⋮----
async function recoverGateLoopState(
  runId: string,
  stepPlan: WorkflowPlanStep,
): Promise<
⋮----
interface StepDriveContext {
  options: RunWorkflowOptions;
  next: WorkflowNextResult;
  plan: WorkflowPlan;
  stepPlan: WorkflowPlanStep;
  step: WorkflowRunStepState;

  evidence: Record<string, Record<string, unknown> | undefined>;







  liveEvidence: Map<string, Record<string, unknown>>;

  liveEvidenceConsumers: ReadonlySet<string>;

  executed: ExecutedStepReport[];
  summaryJudge: SummaryJudge | null;
}
⋮----
interface StepGateLoopOutcome {
  kind: "advanced" | "failed" | "gate-exhausted" | "judge-failed" | "child-blocked" | "aborted";
  gateRejection?: RunWorkflowResult["gateRejection"];
  judgeFailure?: RunWorkflowResult["judgeFailure"];




  childBlocked?: RunWorkflowResult["childBlocked"];

  unitsDispatched: number;
  tokensUsed: number;
}
⋮----
async function executeStepSubgraph(
  ctx: StepDriveContext,
  loop: { gateLoop: number; gateFeedback: GateFeedback | undefined; unitsDispatched: number; tokensUsed: number },
): Promise<StepExecutionResult>
⋮----
async function runStepGateLoop(
  ctx: StepDriveContext,
  gate: { startLoop: number; maxLoops: number; seededFeedback: GateFeedback | undefined },
  totals: { unitsDispatched: number; tokensUsed: number },
): Promise<StepGateLoopOutcome>
⋮----
const outcome = (rest: Omit<StepGateLoopOutcome, "unitsDispatched" | "tokensUsed">): StepGateLoopOutcome => (
⋮----
async function driveRun(
  options: RunWorkflowOptions,
  initial: WorkflowNextResult,

  storedPlan: WorkflowPlan | undefined,




  liveEvidence: Map<string, Record<string, unknown>>,
): Promise<RunWorkflowResult>
⋮----
// Judge-outage contract: resolve the step's frozen completion judge BEFORE
// any dispatch. An unresolvable judge (missing frozen connection or harness, no dispatcher
// for an agent judge) is verifier INFRASTRUCTURE failure — block the step
// for `akm workflow resume` instead of spending on units the gate can never
// verify. No gate loop is consumed and nothing is dispatched.
⋮----
// Nothing was dispatched, so there is no evidence to preserve — the same
// blocked write the post-execution path uses, minus the results it does
// not have.
```

## File: src/workflows/exec/scheduler.ts
```typescript
import { concurrentMap } from "../../core/concurrent";
import { cpuDerivedUnitConcurrency, workflowMaxConcurrency } from "../concurrency-policy";
⋮----
export function maxUnitConcurrency(cpuCount?: number, configured?: number): number
⋮----
export interface ScheduleOptions {

  concurrency?: number;
  signal?: AbortSignal;

  maxConcurrency?: number;

  llmConcurrency?: number;

  hostConcurrency?: number;
}
⋮----
export async function scheduleUnits<T, R>(
  items: T[],
  dispatch: (item: T, index: number) => Promise<R>,
  options: ScheduleOptions = {},
): Promise<Array<R | undefined>>
```

## File: src/workflows/exec/step-work.ts
```typescript
import { createHash } from "node:crypto";
import unitPreambleTemplate from "../../assets/prompts/workflow-unit-preamble.md" with { type: "text" };
import { UsageError } from "../../core/errors";
import { validateJsonSchemaSubset } from "../../core/json-schema";
import { parseEmbeddedJsonResponse } from "../../core/parse";
import { withSchemaInstruction } from "../../core/structured";
import { canonicalInputJson, type TaskInputBinding, validateInputs } from "../../execution/input-contract";
import type { LoweringNotice } from "../../execution/resolved-request";
import type { WorkflowRunStatus } from "../../sources/types";
import {
  type WorkflowRunUnitAttemptRowV4,
  type WorkflowRunUnitRow,
  withWorkflowRunsRepo,
} from "../../storage/repositories/workflow-runs-repository";
import { canonicalJson } from "../ir/plan-hash";
import type {
  FrozenWorkflowTarget,
  WorkflowOnError,
  WorkflowPlan,
  WorkflowPlanStep,
  WorkflowReducer,
  WorkflowRetry,
  WorkflowRuntimeKind,
  WorkflowUnitNode,
} from "../plan";
import {
  type ExpressionScope,
  parseReference,
  type ResolveReferenceResult,
  resolveReferenceString,
} from "../program/expressions";
import { clip, WORKFLOW_UNIT_DIAGNOSTIC_CLIP } from "../resource-limits";
import { completeWorkflowStep, type SummaryValidationFailure } from "../runtime/runs";
import { type JudgeCallIdentity, parseJudgeVerdict, type SummaryJudge } from "../validate-summary";
import { gateNodeId } from "./frozen-judge";
import { enqueueUnitWrite } from "./unit-writer";
⋮----
export interface UnitOutcome {
  unitId: string;
  ok: boolean;

  result?: unknown;
  text?: string;
  failureReason?: string;
  error?: string;
  tokens?: number;

  notices?: readonly Readonly<LoweringNotice>[];




  sessionId?: string;

  childRun?: {
    runId: string;
    ref: string;
    status: WorkflowRunStatus;
    currentStepId: string | null;
  };
}
⋮----
export interface GateFeedback {
  feedback: string;
  missing: string[];
}
⋮----
export interface WorkListInput {
  runId: string;
  params: Record<string, unknown>;

  stepOutputs: Record<string, unknown>;




  gateLoop?: number;

  gateFeedback?: GateFeedback;
}
⋮----
export interface StepWorkUnit {

  unitId: string;
  nodeId: string;
  index: number;

  item: unknown;
  isFanOut: boolean;

  journalBaseId: string;
  runner: WorkflowRuntimeKind;

  frozenTarget: FrozenWorkflowTarget;

  environment: WorkflowUnitNode["environment"];






  execContext?: Record<string, string>;
  model?: string;

  timeoutMs: number | null;
  schema?: Record<string, unknown>;
  retry?: WorkflowRetry;
  onError: WorkflowOnError;

  prompt: string;

  inputHash: string;

  childParams?: Readonly<Record<string, unknown>>;
}
⋮----
export interface StepWorkList {
  template: WorkflowUnitNode;
  reducer: WorkflowReducer;
  isFanOut: boolean;

  concurrency?: number;

  items: unknown[];
  units: StepWorkUnit[];
}
⋮----
export type ComputeWorkListResult = { ok: true; list: StepWorkList } | { ok: false; error: string };
⋮----
function validateFanOutItems(stepId: string, items: unknown[]): string | undefined
⋮----
function occurrenceSuffixedUnitIds(nodeId: string, items: readonly unknown[]): string[]
⋮----
function resolveStepReference(reference: string, scope: ExpressionScope): ResolveReferenceResult
⋮----
type TaskInputBindingsResolution =
  | { ok: true; values: Readonly<Record<string, unknown>> }
  | { ok: false; error: string };
⋮----
function resolveTaskInputBindings(
  bindings: readonly TaskInputBinding[] | undefined,
  stepId: string,
  scope: ExpressionScope,
): TaskInputBindingsResolution
⋮----
export function computeStepWorkList(plan: WorkflowPlanStep, input: WorkListInput): ComputeWorkListResult
⋮----
interface StepWorkUnitContext {
  plan: WorkflowPlanStep;
  input: WorkListInput;
  template: WorkflowUnitNode;
  isFanOut: boolean;
  gateLoop: number;
  resolvedInputs: Array<{ reference: string; value: unknown }>;
  runner: WorkflowRuntimeKind;
  timeoutMs: number | null;
  target: FrozenWorkflowTarget;
  frozenExec?: Extract<FrozenWorkflowTarget, { kind: "shell" }>["exec"];

  execParamsJson?: string;
  execInputsJson?: string;





  taskInputs?: Readonly<Record<string, unknown>>;
  taskInputsJson?: string;
}
⋮----
function buildStepWorkUnit(ctx: StepWorkUnitContext, unitId: string, item: unknown, index: number): StepWorkUnit
⋮----
// The composed task's resolved
// `inputBindings`, when non-empty — see StepWorkUnitContext.taskInputs.
⋮----
// Request lowering appends the schema instruction itself.
⋮----
function buildExecContextEnv(args: {
  ctx: StepWorkUnitContext;
  unitId: string;
  item: unknown;
  index: number;
}): Record<string, string>
⋮----
function computeUnitInputHash(ctx: StepWorkUnitContext, item: unknown): string
⋮----
export interface BuildUnitPromptInput {
  runId: string;
  stepId: string;
  unitId: string;
  params: Record<string, unknown>;

  item?: unknown;
  itemIndex?: number;

  inputs?: Array<{ reference: string; value: unknown }>;






  taskInputs?: Readonly<Record<string, unknown>>;
  gateFeedback?: GateFeedback;
  schema?: Record<string, unknown>;

  instructions: string;
}
⋮----
export function buildUnitPrompt(input: BuildUnitPromptInput): string
⋮----
// Declared `inputs:` context: the prior-step artifacts this step named.
⋮----
// The resolved `inputBindings` as a fenced JSON block, serialized exactly like AKM_TASK_INPUTS.
⋮----
// Gate-loop feedback (R2 max_loops): the judge's rejection is appended so
// the re-executed unit can address it — and so the input hash changes,
// making the loop's re-dispatch natural instead of a durable-row reuse.
⋮----
/**
 * Content-derived unit identity (module doc): `<node_id>:<sha256>` for a
 * fan-out item, `<node_id>:solo` otherwise. The hash is over the item's
 * canonical JSON (sorted keys — same canonicalization the vote reducer
 * counts with), so identity survives list reordering/regeneration and is
 * independent of item position. Retry attempts stack `~r<n>` on top.
 */
export function unitIdFor(nodeId: string, item: unknown, isFanOut: boolean, collisionSafe = false): string
⋮----
export function projectStepOutput(evidence: Record<string, unknown>): unknown
⋮----
export function stepOutputsFromEvidence(
  evidence: Record<string, Record<string, unknown> | undefined>,
): Record<string, unknown>
⋮----
function stepTemplate(stepPlan: WorkflowPlanStep): WorkflowUnitNode | undefined
⋮----
export function referencedStepIds(plan: WorkflowPlan): Set<string>
⋮----
const note = (reference: string): void =>
⋮----
export function validateStepArtifact(plan: WorkflowPlanStep, evidence: Record<string, unknown>): string | undefined
⋮----
export function unitSchemaWarning(plan: WorkflowPlanStep, units: readonly UnitOutcome[]): string | undefined
⋮----
export function buildArtifactSummary(stepId: string, units: UnitOutcome[], evidence: Record<string, unknown>): string
⋮----
/** A unit's contribution to the step artifact: structured result, else text, else null (failures). */
function unitOutputValue(unit: UnitOutcome): unknown
⋮----
export function buildEvidence(
  units: UnitOutcome[],
  reducer: WorkflowReducer,
  isFanOut: boolean,
): Record<string, unknown>
⋮----
// Per-unit evidence carries only what the journal can reproduce, so a fresh
// run and a resume agree byte-for-byte: a success keeps its `result`/clipped
// `text`, a failure only its `failureReason` (diagnostics stay on the unit row).
⋮----
// Promoted step artifact (`evidence.output`) — what a `steps.<id>.output`
// reference resolves to (see projectStepOutput). Values are UNCLIPPED.
⋮----
/**
 * The reduced outcome of a step's units — live or rehydrated from the journal —
 * so the same frozen plan always promotes the same artifact under the same
 * `on_error` policy and output schema.
 */
export interface ExecutedStepOutcome {
  ok: boolean;
  units: UnitOutcome[];
  evidence: Record<string, unknown>;
  summary: string;
  /** Set when `ok` is false BECAUSE the promoted artifact failed the step's
   * declared output schema (the one failure a gate loop may re-run). */
  artifactSchemaFailure?: true;
  /** Set when a unit's composed child workflow is `blocked`; the step blocks too, never gate-looping. */
  childBlocked?: {
    childRunId: string;
    childRef: string;
    childStepId: string | null;
  };
}
⋮----
/** Set when `ok` is false BECAUSE the promoted artifact failed the step's
   * declared output schema (the one failure a gate loop may re-run). */
⋮----
/** Set when a unit's composed child workflow is `blocked`; the step blocks too, never gate-looping. */
⋮----
/**
 * The first failed unit's diagnostic (e.g. an exec unit's stderr), clipped to
 * {@link WORKFLOW_UNIT_DIAGNOSTIC_CLIP}, for the step summary. A live outcome
 * carries it as `error`, a rehydrated one as `text`; both give the same summary.
 */
function firstFailureDiagnostic(failed: UnitOutcome[]): string
⋮----
/**
 * Reduce a step's terminal unit outcomes into the promoted artifact and step
 * verdict: the `on_error` policy, the reducer, the vote-tie failure, and the
 * typed-artifact schema check (`artifactSchemaFailure` marks a retryable one).
 */
export function reduceStepOutcomes(
  plan: WorkflowPlanStep,
  reducer: WorkflowReducer,
  isFanOut: boolean,
  onError: WorkflowOnError,
  units: UnitOutcome[],
): ExecutedStepOutcome
⋮----
// A blocked child workflow (the failed unit's live-only `childRun`) is
// surfaced so `finalizeExecutedStep` blocks the step instead of retrying.
⋮----
export function reduceEmptyStep(plan: WorkflowPlanStep, reducer: WorkflowReducer): ExecutedStepOutcome
⋮----
export function unitOutcomeFromRow(unitId: string, row: WorkflowRunUnitRow, hasSchema: boolean): UnitOutcome
⋮----
export function gateUnitId(stepId: string, loop: number): string
⋮----
export function effectiveGateMaxLoops(stepPlan: WorkflowPlanStep): number
⋮----
export function activeGateLoop(rows: WorkflowRunUnitRow[], stepId: string): number
⋮----
export function recoverGateFeedback(
  rows: WorkflowRunUnitRow[],
  stepId: string,
  loop: number,
): GateFeedback | undefined
⋮----
function gateLoopOf(unitId: string, stepId: string): number | undefined
⋮----
type GateVerdict =
  | { kind: "rejected"; missing: string[]; feedback: string }
  | { kind: "passed" }

  | { kind: "empty" };
⋮----
function parseGateVerdict(row: WorkflowRunUnitRow): GateVerdict
⋮----
function gateCorruptionMessage(row: WorkflowRunUnitRow, why: string): string
⋮----
export interface GateUnitRef {
  runId: string;
  workflowRef: string;
  stepId: string;

  loop: number;
  engine: string;
  model: string | null;
  runner: WorkflowRuntimeKind;
  inputHash: string;
  durableAttempt?: WorkflowRunUnitAttemptRowV4;
  tokens?: number;
}
⋮----
export async function journalGateEvaluationStart(gate: GateUnitRef): Promise<GateUnitRef>
⋮----
export async function journalGateEvaluationFinish(
  gate: GateUnitRef,
  errored: boolean,
  rejection: SummaryValidationFailure | undefined,
): Promise<void>
⋮----
export interface FinalizeStepInput {
  runId: string;
  workflowRef: string;
  stepId: string;
  stepPlan: WorkflowPlanStep;

  completionCriteria: string[];

  gateLoop: number;

  loopsRemaining: boolean;

  result: ExecutedStepOutcome;




  summaryJudge: SummaryJudge | null | undefined;

  signal?: AbortSignal;
}
⋮----
export type FinalizeStepResult =
  | { kind: "advanced" }
  | { kind: "failed"; summary: string }
  | { kind: "retry"; gateFeedback: GateFeedback }
  | { kind: "gate-exhausted"; gateRejection: { stepId: string; missing: string[]; feedback: string } }







  | { kind: "judge-failed"; summary: string }






  | { kind: "child-blocked"; summary: string };
⋮----
function judgeFailureNotes(runId: string, stepId: string, cause: string): string
⋮----
export interface JudgeFailureBlock {
  runId: string;
  stepId: string;

  cause: string;

  evidence?: Record<string, unknown>;
}
⋮----
export async function blockStepForJudgeFailure(input: JudgeFailureBlock): Promise<string>
⋮----
async function blockFinalizedStep(input: FinalizeStepInput, cause: string): Promise<FinalizeStepResult>
⋮----
function childWorkflowBlockedNotes(
  runId: string,
  stepId: string,
  childRunId: string,
  childRef: string,
  childStepId: string | null,
): string
⋮----
export interface ChildWorkflowBlock {
  runId: string;
  stepId: string;
  childRunId: string;
  childRef: string;
  childStepId: string | null;

  evidence?: Record<string, unknown>;
}
⋮----
export async function blockStepForChildWorkflow(input: ChildWorkflowBlock): Promise<string>
⋮----
async function blockFinalizedStepForChildWorkflow(
  input: FinalizeStepInput,
  childBlocked: NonNullable<ExecutedStepOutcome["childBlocked"]>,
): Promise<FinalizeStepResult>
⋮----
export async function finalizeExecutedStep(input: FinalizeStepInput): Promise<FinalizeStepResult>
⋮----
function safeJson(value: unknown): string
```

## File: src/workflows/exec/unit-dispatch.ts
```typescript
import { ConfigError } from "../../core/errors";
import { canonicalResolvedExecutionRequest, type LoweringNotice } from "../../execution/resolved-request";
import { type BuiltExecution, buildExecutionFromWire } from "../../integrations/agent/execution";
import { runExecution } from "../../integrations/agent/runner-dispatch";
import type { AgentTokenUsage } from "../../integrations/agent/spawn";
import type { FrozenWorkflowTarget } from "../plan";
⋮----
export interface UnitDispatchRequest {
  runId: string;
  stepId: string;
  unitId: string;
  nodeId: string;

  attempt?: number;

  dispatchId?: string;

  prompt: string;

  systemPrompt?: string;

  frozenTarget: FrozenWorkflowTarget;









  execContext?: Record<string, string>;
  timeoutMs: number | null;
  schema?: Record<string, unknown>;

  env?: Record<string, string>;

  sensitiveValues?: readonly string[];

  cwd?: string;
  signal?: AbortSignal;

  eventSource?: string;
}
⋮----
export interface UnitDispatchResult {
  ok: boolean;

  text: string;

  sessionId?: string;

  failureReason?: string;
  error?: string;
  usage?: AgentTokenUsage;

  notices?: readonly Readonly<LoweringNotice>[];





  sensitiveValues?: readonly string[];
}
⋮----
export type UnitDispatcher = (request: UnitDispatchRequest, feedback?: string) => Promise<UnitDispatchResult>;
⋮----
export function prepareWorkflowExecution(
  request: UnitDispatchRequest & { frozenTarget: Extract<FrozenWorkflowTarget, { kind: "command" }> },
  prompt = request.prompt,
): BuiltExecution
⋮----
function message(err: unknown): string
⋮----
export function forwardedDispatchEventSource(
  request: Pick<UnitDispatchRequest, "eventSource" | "env">,
): string | undefined
⋮----
export async function dispatchWorkflowExecution(
  request: UnitDispatchRequest,
  feedback?: string,
): Promise<UnitDispatchResult>
```

## File: src/workflows/exec/unit-writer.ts
```typescript
import { serializeByKey } from "../../core/concurrent";
import { getStateDbPath } from "../../core/state-db";
⋮----
export function enqueueUnitWrite<T>(fn: () => Promise<T>): Promise<T>
```

## File: src/workflows/freeze/targets/child-workflow.ts
```typescript
import { createHash } from "node:crypto";
import { parseBundleRef } from "../../../core/asset/asset-ref";
import { UsageError } from "../../../core/errors";
import type { TaskInputBinding } from "../../../execution/input-contract";
import { workflowParamContract } from "../../ir/params";
import { canonicalJson, canonicalPlanJson } from "../../ir/plan-hash";
import type { FrozenChildWorkflowTarget, WorkflowPlan } from "../../plan";
import { loadWorkflowAsset } from "../../runtime/workflow-asset-loader";
import {
  type BaseUnit,
  declaredParamNames,
  earlierStepIds,
  type FreezeStep,
  type ResolutionContext,
  type ResolvedDispatch,
} from "../step-values";
import { freezeTaskInputBindings } from "../task-bindings";
⋮----
export interface ChildWorkflowDispatchInput {
  readonly source: FreezeStep;
  readonly baseUnit: BaseUnit;

  readonly childRefInput: string;
  readonly context: ResolutionContext;
}
⋮----
function childWorkflowContentHash(fields: {
  readonly ref: string;
  readonly planHash: string;
  readonly inputBindings: readonly TaskInputBinding[];
}): string
⋮----
function isWorkflowRef(ref: string): boolean
⋮----
function compositionPath(refPath: readonly string[], childRef: string): string
⋮----
function assertNoCompositionCycle(stepId: string, childRef: string, refPath: readonly string[]): void
⋮----
export async function childWorkflowDispatch(input: ChildWorkflowDispatchInput): Promise<ResolvedDispatch>
```

## File: src/workflows/freeze/targets/command.ts
```typescript
import { createHash } from "node:crypto";
import { type PreparedCommandInvocation, prepareCommandInvocation } from "../../../commands/command/command-execution";
import {
  canonicalResolvedExecutionRequest,
  type ResolvedExecutionRequestV1,
} from "../../../execution/resolved-request";
import { buildExecution } from "../../../integrations/agent/execution";
import type { RunnerSpec } from "../../../integrations/agent/runner";
import type { FrozenWorkflowCommandTarget, FrozenWorkflowEnvironmentBinding } from "../../plan";
import { freezeEnvironment } from "../environment";
import {
  type BaseUnit,
  durableRequest,
  executionUnitValues,
  type FreezeStep,
  type ResolutionContext,
  type ResolvedDispatch,
  targetConcurrency,
} from "../step-values";
⋮----
export async function commandDispatch(
  source: FreezeStep,
  baseUnit: BaseUnit,
  action: unknown,
  context: ResolutionContext,
): Promise<ResolvedDispatch>
⋮----
export function commandResult(
  source: FreezeStep,
  baseUnit: BaseUnit,
  prepared: PreparedCommandInvocation,
  context: ResolutionContext,
  literals: readonly FrozenWorkflowEnvironmentBinding[] = [],
): ResolvedDispatch
```

## File: src/workflows/freeze/targets/shell.ts
```typescript
import type { FrozenWorkflowShellTarget } from "../../plan";
import { freezeEnvironment } from "../environment";
import {
  type BaseUnit,
  type FreezeStep,
  freezeExecSpec,
  type ResolutionContext,
  type ResolvedDispatch,
} from "../step-values";
⋮----
export function directShell(source: FreezeStep, baseUnit: BaseUnit, context: ResolutionContext): ResolvedDispatch
```

## File: src/workflows/freeze/environment.ts
```typescript
import { makeBundleRef, parseBundleRef } from "../../core/asset/asset-ref";
import { parseEnvRef } from "../../core/env-secret-ref";
import { UsageError } from "../../core/errors";
import { resolveConceptOwner } from "../../indexer/lookup/adapter-concept-owner";
import { resolveSourceEntries } from "../../indexer/search/search-source";
import type { FrozenWorkflowEnvironmentBinding, WorkflowExec } from "../plan";
import type { FreezeStep, ResolutionContext } from "./step-values";
⋮----
export function freezeEnvironment(
  source: FreezeStep,
  exec: WorkflowExec | undefined,
  context: ResolutionContext,
): FrozenWorkflowEnvironmentBinding[]
⋮----
function qualifyEnvRef(refInput: string, context: ResolutionContext): string
```

## File: src/workflows/freeze/freeze.ts
```typescript
import { createHash } from "node:crypto";
import type { AkmConfig } from "../../core/config/config";
import { SHIPPED_ALIAS } from "../../core/config/model-aliases";
import { UsageError } from "../../core/errors";
import { resolveExecution, shippedAlias } from "../../integrations/agent/execution";
import { checkWorkflowPlan } from "../compile";
import { defaultMapConcurrency, workflowMaxConcurrency } from "../concurrency-policy";
import { canonicalJson } from "../ir/plan-hash";
import {
  type FrozenWorkflowCommandTarget,
  WORKFLOW_PLAN_VERSION,
  type WorkflowError,
  type WorkflowExecNode,
  type WorkflowPlan,
  type WorkflowPlanStep,
  type WorkflowUnitNode,
} from "../plan";
import type { WorkflowAsset } from "../runtime/workflow-asset-loader";
import { baseUnitOf, type FreezeStep, type ResolutionContext, type ResolvedDispatch } from "./step-values";
import { childWorkflowDispatch } from "./targets/child-workflow";
import { commandDispatch, commandResult } from "./targets/command";
import { directShell } from "./targets/shell";
⋮----
export interface FrozenWorkflow {
  readonly plan: WorkflowPlan;

  readonly warnings: WorkflowError[];
}
⋮----
export async function freezeWorkflow(
  asset: WorkflowAsset,
  config: AkmConfig,
  refPath: readonly string[] = [asset.ref],
): Promise<FrozenWorkflow>
⋮----
async function resolveStep(source: FreezeStep, context: ResolutionContext): Promise<ResolvedDispatch>
⋮----
// A prose step: its body is the `akm/command` literal content (`parser.ts` `stepSpec`).
⋮----
/** The gate judge's frozen command target: a model call, so it runs where model work runs. */
function resolveJudge(source: FreezeStep, rubric: string, context: ResolutionContext): ResolvedDispatch
⋮----
function frozenRoot(
  stepId: string,
  source: FreezeStep,
  resolved: ResolvedDispatch,
  plan: WorkflowPlan,
  config: AkmConfig,
): WorkflowExecNode
```

## File: src/workflows/freeze/step-values.ts
```typescript
import type { AkmConfig } from "../../core/config/config-types";
import {
  canonicalResolvedExecutionRequest,
  decodeResolvedExecutionRequest,
  type ResolvedExecutionRequestV1,
} from "../../execution/resolved-request";
import type { UnresolvedExecutionDefaults } from "../../execution/source";
import type { RunnerSpec } from "../../integrations/agent/runner";
import { defaultLlmEngineConcurrency } from "../concurrency-policy";
import type {
  FrozenWorkflowEnvironmentBinding,
  FrozenWorkflowTarget,
  SourceRef,
  WorkflowExec,
  WorkflowExecSpec,
  WorkflowPlan,
  WorkflowStepSpec,
  WorkflowUnitSettings,
} from "../plan";
import { DEFAULT_EXEC_TIMEOUT_MS } from "../resource-limits";
import type { WorkflowAsset } from "../runtime/workflow-asset-loader";
⋮----
export type FreezeStep = WorkflowStepSpec & { readonly id: string };
⋮----
export type BaseUnit = WorkflowUnitSettings & { source: SourceRef; exec?: WorkflowExec };
⋮----
export type ChildFreezeFn = (
  asset: WorkflowAsset,
  refPath: readonly string[],
) => Promise<{ readonly plan: WorkflowPlan }>;
⋮----
export interface ResolutionContext {
  readonly asset: WorkflowAsset;
  readonly config: AkmConfig;

  readonly plan: WorkflowPlan;

  readonly refPath: readonly string[];
  readonly freezeChild: ChildFreezeFn;
}
⋮----
export interface ResolvedDispatch {
  readonly target: FrozenWorkflowTarget;
  readonly environment: readonly FrozenWorkflowEnvironmentBinding[];
  readonly unit: BaseUnit;
  readonly instructions: string;
}
⋮----
export function baseUnitOf(source: FreezeStep): BaseUnit
⋮----
export function freezeExecSpec(source: FreezeStep, exec: WorkflowExec, context: ResolutionContext): WorkflowExecSpec
⋮----
export function targetConcurrency(runner: RunnerSpec): number | undefined
⋮----
export function durableRequest(request: ResolvedExecutionRequestV1): ResolvedExecutionRequestV1
⋮----
export function executionUnitValues(
  unit: WorkflowUnitSettings | WorkflowPlan["defaults"],
): UnresolvedExecutionDefaults
⋮----
export function earlierStepIds(plan: WorkflowPlan, stepId: string): ReadonlySet<string>
⋮----
export function declaredParamNames(plan: WorkflowPlan): ReadonlySet<string>
```

## File: src/workflows/freeze/task-bindings.ts
```typescript
import { isRecord } from "../../core/common";
import { UsageError } from "../../core/errors";
import { type InputContract, type TaskInputBinding, validateInputs } from "../../execution/input-contract";
import { parseReference } from "../program/expressions";
⋮----
export interface FreezeTaskInputBindingsInput {

  readonly stepId: string;

  readonly targetRef: string;

  readonly with: Readonly<Record<string, unknown>> | undefined;

  readonly contract: InputContract;

  readonly earlierStepIds: ReadonlySet<string>;

  readonly declaredParamNames: ReadonlySet<string>;
}
⋮----
function inputBindingInvalid(message: string): UsageError
⋮----
function unknownBindingNameError(
  stepId: string,
  targetRef: string,
  name: string,
  declaredNames: readonly string[],
): UsageError
⋮----
export function freezeTaskInputBindings(input: FreezeTaskInputBindingsInput): readonly TaskInputBinding[]
⋮----
function finalizeBindings(
  stepId: string,
  targetRef: string,
  contract: InputContract,
  byName: Map<string, TaskInputBinding>,
): readonly TaskInputBinding[]
⋮----
function normalizeOneEntry(
  stepId: string,
  targetRef: string,
  name: string,
  value: unknown,
  schema: Readonly<Record<string, unknown>>,
  earlierStepIds: ReadonlySet<string>,
  declaredParamNames: ReadonlySet<string>,
): TaskInputBinding
```

## File: src/workflows/ir/params.ts
```typescript
import { UsageError } from "../../core/errors";
import {
  applyInputDefaults,
  type InputContract,
  type InputDeclaration,
  type InputFlag,
  type InputFlagDiagnostics,
  materializeInputFlags,
  validateInputs,
} from "../../execution/input-contract";
⋮----
export interface WorkflowParameterPlan {
  readonly params?: readonly string[];
  readonly paramSchemas?: Readonly<Record<string, Record<string, unknown>>>;
}
⋮----
export type WorkflowParameterFlag = InputFlag;
⋮----
function contractFromPlan(plan: WorkflowParameterPlan): InputContract
⋮----
function invalidParameter(name: string, message: string): UsageError
⋮----
export function materializeWorkflowParameterFlags(
  plan: WorkflowParameterPlan,
  flags: readonly WorkflowParameterFlag[],
): Record<string, unknown>
⋮----
export function applyWorkflowParamDefaults(
  plan: WorkflowParameterPlan,
  params: Record<string, unknown>,
): Record<string, unknown>
⋮----
export function validateWorkflowParams(plan: WorkflowParameterPlan, params: Record<string, unknown>): string[]
```

## File: src/workflows/ir/plan-hash.ts
```typescript
import { createHash } from "node:crypto";
⋮----
export function computePlanHash(plan: unknown): string
⋮----
export function canonicalPlanJson(plan: unknown): string
⋮----
export function canonicalJson(value: unknown): string
⋮----
function sortKeys(value: unknown): unknown
```

## File: src/workflows/program/expressions.ts
```typescript
export type ExpressionAst =
  | { kind: "param"; name: string }
  | { kind: "stepOutput"; stepId: string; path: Array<string | number> };
⋮----
export interface ExpressionScope {
  params: Record<string, unknown>;

  stepOutputs: Record<string, unknown>;
}
⋮----
export interface ResolutionError {

  reference: string;
  message: string;
}
⋮----
export type ResolveReferenceResult = { ok: true; value: unknown } | { ok: false; error: ResolutionError };
⋮----
export function parseReference(source: string):
⋮----
function readIdent(text: string, start: number):
⋮----
function parsePath(
  text: string,
  start: number,
):
⋮----
export function resolveReference(expr: ExpressionAst, scope: ExpressionScope): ResolveReferenceResult
⋮----
const fail = (message: string): ResolveReferenceResult => (
⋮----
export function resolveReferenceString(text: string, scope: ExpressionScope): ResolveReferenceResult
⋮----
function finish(
  value: unknown,
  reference: string,
  fail: (message: string) => ResolveReferenceResult,
): ResolveReferenceResult
⋮----
export function formatReference(expr: ExpressionAst): string
```

## File: src/workflows/runtime/agent-identity.ts
```typescript
import { HARNESS_REGISTRY } from "../../integrations/harnesses";
⋮----
export interface AgentIdentity {
  harness: string | null;
  sessionId: string | null;
}
⋮----
interface IdentityMarker {
  harnessId: string;
  envKeys: readonly string[];
}
⋮----
function deriveMarkers(
  pick: (h: (typeof HARNESS_REGISTRY)[number]) => readonly string[] | undefined,
): IdentityMarker[]
⋮----
function firstNonEmpty(env: NodeJS.ProcessEnv, keys: readonly string[]): string | null
⋮----
export function resolveAgentIdentity(env: NodeJS.ProcessEnv = process.env): AgentIdentity
```

## File: src/workflows/runtime/run-plan.ts
```typescript
import { UsageError } from "../../core/errors";
import { warnOnce } from "../../core/warn";
import type { TaskInputBinding } from "../../execution/input-contract";
import { decodeResolvedExecutionRequest, type ResolvedExecutionRequestV1 } from "../../execution/resolved-request";
import { decodeFrozenRunnerSpec, type RunnerSpec } from "../../integrations/agent/runner";
import type { WorkflowRunRow } from "../../storage/repositories/workflow-runs-repository";
import {
  type FrozenLegacyField,
  type FrozenWorkflowCommandTarget,
  type FrozenWorkflowEnvironmentBinding,
  type FrozenWorkflowTarget,
  WORKFLOW_PLAN_VERSION,
  type WorkflowExecNode,
  type WorkflowExecSpec,
  type WorkflowGateNode,
  type WorkflowMapNode,
  type WorkflowPlan,
  type WorkflowPlanStep,
  type WorkflowUnitNode,
} from "../plan";
⋮----
export type RunPlanRead = { ok: true; plan: WorkflowPlan } | { ok: false; problem: string; newer: boolean };
⋮----
export function readRunPlan(
  row: Pick<WorkflowRunRow, "id" | "plan_json" | "plan_ir_version"> & { workflow_ref?: string },
): RunPlanRead
⋮----
export interface FrozenStepRowDefinition {
  stepId: string;
  stepTitle: string;
  instructions: string;
  completionJson: string | null;
  sequenceIndex: number;
}
⋮----
/** Project persisted spine rows from the plan at publication time. */
export function frozenStepRows(plan: WorkflowPlan): FrozenStepRowDefinition[]
⋮----
export interface DecodeWorkflowPlanOptions {
  /** The run's workflow ref: lets an older plan's read set supply `sourceHash`. */
  readonly workflowRef?: string;
}
⋮----
/** The run's workflow ref: lets an older plan's read set supply `sourceHash`. */
⋮----
/** Decode a stored plan (any release's) into the one plan type. */
export function decodeWorkflowPlan(input: unknown, options: DecodeWorkflowPlanOptions =
⋮----
/** Plans frozen before irVersion 6 recorded the source hash inside `sourceReadSet`. */
function legacySourceHash(readSet: unknown, workflowRef: string | undefined): string | undefined
⋮----
function decodeStep(value: unknown, index: number): WorkflowPlanStep
⋮----
function decodeNode(value: unknown, stepId: string): WorkflowExecNode
⋮----
function decodeUnit(node: Record<string, unknown>, stepId: string): WorkflowUnitNode
⋮----
function decodeGate(value: unknown, stepId: string): WorkflowGateNode
⋮----
function decodeTarget(value: unknown, label: string): FrozenWorkflowTarget
⋮----
function decodeCommandTarget(target: Record<string, unknown>, label: string): FrozenWorkflowCommandTarget
⋮----
function legacyField(source: Record<string, unknown>, key: string):
⋮----
function decodeExec(value: unknown, label: string): WorkflowExecSpec
⋮----
function decodeInputBindings(value: unknown, label: string): readonly TaskInputBinding[] | undefined
⋮----
function decodeEnvironmentBinding(value: unknown, label: string): FrozenWorkflowEnvironmentBinding
⋮----
const strings = (items: unknown): string[]
⋮----
function positiveInteger(value: unknown): number | undefined
⋮----
function string(value: unknown, label: string): string
⋮----
function record(value: unknown, label: string): Record<string, unknown>
⋮----
function fail(message: string): never
```

## File: src/workflows/runtime/runs.ts
```typescript
import { randomUUID } from "node:crypto";
import { parseBundleRef } from "../../core/asset/asset-ref";
import { loadConfig } from "../../core/config/config";
import { ConfigError, NotFoundError, UsageError } from "../../core/errors";
import { appendEvent } from "../../core/events";
import { warn } from "../../core/warn";
import type {
  WorkflowRunStatus,
  WorkflowRunStepState,
  WorkflowRunStepStatus,
  WorkflowRunSummary,
  WorkflowStepOrchestrationSummary,
} from "../../sources/types";
import { insertEventOnce } from "../../storage/repositories/events-repository";
import {
  type WorkflowRunRow,
  type WorkflowRunStepRow,
  type WorkflowRunsRepository,
  type WorkflowRunUnitRow,
  type WorkflowRunUnitStatus,
  withWorkflowRunsRepo,
} from "../../storage/repositories/workflow-runs-repository";
import { frozenSummaryJudge, resolveJudgeCwd } from "../exec/frozen-judge";
import { detectSecretShapedParams } from "../exec/param-secrets";
import { freezeWorkflow } from "../freeze/freeze";
import {
  applyWorkflowParamDefaults,
  materializeWorkflowParameterFlags,
  validateWorkflowParams,
  type WorkflowParameterFlag,
} from "../ir/params";
import { canonicalPlanJson, computePlanHash } from "../ir/plan-hash";
import type { WorkflowPlan, WorkflowRuntimeKind } from "../plan";
import { resolveOrchestrationRefs, summarizeStepOrchestration } from "../renderer";
import { clip, WORKFLOW_UNIT_DIAGNOSTIC_CLIP } from "../resource-limits";
import { type SummaryJudge, validateStepSummary } from "../validate-summary";
import { resolveAgentIdentity } from "./agent-identity";
import { decodeWorkflowPlan, frozenStepRows, readRunPlan } from "./run-plan";
import { canonicalizeWorkflowRefInput, loadWorkflowAsset } from "./workflow-asset-loader";
⋮----
export interface WorkflowRunDetail {
  run: WorkflowRunSummary;
  workflow: {
    ref: string;
    title: string;
    steps: WorkflowRunStepState[];
  };





  warnings?: string[];





  units?: WorkflowUnitDiagnostic[];





  children?: WorkflowChildRunNode[];
}
⋮----
export interface WorkflowChildRunNode {
  runId: string;
  workflowRef: string;
  workflowTitle: string;
  status: WorkflowRunStatus;

  spawnedByUnitId: string;

  stepId: string | null;
  currentStepId: string | null;
  createdAt: string;
  updatedAt: string;

  resume?: { command: string; then: string };

  children?: WorkflowChildRunNode[];
}
⋮----
export interface WorkflowUnitDiagnostic {
  unitId: string;
  nodeId: string;
  stepId: string | null;

  phase: string | null;
  status: WorkflowRunUnitStatus;
  attempts: number;
  tokens: number | null;

  failureReason: string | null;
  sessionId: string | null;





  diagnostic: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  engine: string | null;





  orchestration?: WorkflowStepOrchestrationSummary;

  runtimeKind: WorkflowRuntimeKind | null;
  platform: string | null;
}
⋮----
function runtimeKindOf(runner: string | null): WorkflowRuntimeKind | null
⋮----
function toUnitDiagnostic(row: WorkflowRunUnitRow): WorkflowUnitDiagnostic
⋮----
export interface WorkflowNextResult {
  run: WorkflowRunSummary;
  workflow: {
    ref: string;
    title: string;
    steps: WorkflowRunStepState[];
  };
  step: WorkflowRunStepState | null;
  done?: true;
  autoStarted?: true;





  startWarnings?: string[];
}
⋮----
export interface CompleteWorkflowStepInput {
  runId: string;
  stepId: string;
  status: Exclude<WorkflowRunStepStatus, "pending">;
  notes?: string;
  evidence?: Record<string, unknown>;





  summary?: string;





  summaryJudge?: SummaryJudge | null;

  signal?: AbortSignal;
}
⋮----
export interface SummaryValidationFailure {
  ok: false;
  runId: string;
  stepId: string;
  missing: string[];
  feedback: string;
}
⋮----
export async function startWorkflowRun(
  ref: string,
  params: Record<string, unknown> = {},
  options?: {
    agentHarness?: string | null;
    agentSessionId?: string | null;
    parameterFlags?: readonly WorkflowParameterFlag[];
  },
): Promise<WorkflowRunDetail>
⋮----
function decodeStatusPlan(planJson: string | null | undefined): WorkflowPlan | undefined
⋮----
export async function getWorkflowStatus(runId: string, opts?:
⋮----
export async function listWorkflowRuns(input?: {
  workflowRef?: string;
  activeOnly?: boolean;

  includeChildren?: boolean;
}): Promise<
⋮----
export async function getNextWorkflowStep(
  specifier: string,
  params?: Record<string, unknown>,
  options?: { parameterFlags?: readonly WorkflowParameterFlag[] },
): Promise<WorkflowNextResult>
⋮----
function projectNextResult(run: WorkflowRunRow, steps: WorkflowRunStepRow[]): WorkflowNextResult
⋮----
export async function resumeWorkflowRun(runId: string): Promise<WorkflowRunDetail>
⋮----
export async function abandonWorkflowRun(runId: string): Promise<WorkflowRunDetail>
⋮----
export async function completeWorkflowStep(
  input: CompleteWorkflowStepInput,
): Promise<WorkflowRunDetail | SummaryValidationFailure>
⋮----
async function resolveRunSpecifier(
  repo: WorkflowRunsRepository,
  specifier: string,
  params?: Record<string, unknown>,
  parameterFlags?: readonly WorkflowParameterFlag[],
): Promise<
⋮----
function interruptionReason(signal: AbortSignal): Error
⋮----
async function canonicalizeWorkflowSpecifier(specifier: string): Promise<string>
⋮----
async function workflowRunRefSet(canonicalRef: string, exactRef: string): Promise<string[]>
⋮----
function findRunByIdOrPrefix(repo: WorkflowRunsRepository, specifier: string): WorkflowRunRow | undefined
⋮----
export async function resolveWorkflowRunTarget(specifier: string): Promise<string | undefined>
⋮----
function readWorkflowRunOrPrefix(repo: WorkflowRunsRepository, specifier: string): WorkflowRunRow
⋮----
function readWorkflowRun(repo: WorkflowRunsRepository, runId: string): WorkflowRunRow
⋮----
function requireRunPlan(run: WorkflowRunRow): WorkflowPlan
⋮----
function readWorkflowRunSteps(repo: WorkflowRunsRepository, runId: string): WorkflowRunStepRow[]
⋮----
function buildWorkflowRunDetail(
  repo: WorkflowRunsRepository,
  run: WorkflowRunRow,
  steps: WorkflowRunStepRow[],
): WorkflowRunDetail
⋮----
function childRunTree(
  repo: WorkflowRunsRepository,
  rootRunId: string,
  forRunId: string,
): WorkflowChildRunNode[] | undefined
⋮----
function toChildRunNode(repo: WorkflowRunsRepository, rootRunId: string, row: WorkflowRunRow): WorkflowChildRunNode
⋮----
// the parent STEP that spawned it, resolved via the real journaled
// unit row — null when that unit row is gone.
⋮----
function toWorkflowRunSummary(run: WorkflowRunRow): WorkflowRunSummary
⋮----
function toWorkflowRunStepState(step: WorkflowRunStepRow): WorkflowRunStepState
⋮----
function resolveCurrentStep(run: WorkflowRunRow, steps: WorkflowRunStepRow[]): WorkflowRunStepRow | undefined
⋮----
function deriveRunState(steps: WorkflowRunStepRow[]):
⋮----
function parseJsonObject(value: string | null): Record<string, unknown> | undefined
⋮----
function parseJsonArray(value: string | null): string[] | undefined
```

## File: src/workflows/runtime/workflow-asset-loader.ts
```typescript
import { createHash } from "node:crypto";
import fs from "node:fs";
import { type BundleRef, makeBundleRef, parseBundleRef } from "../../core/asset/asset-ref";
import { loadConfig } from "../../core/config/config";
import { COMPOSITION_INVALID_MULTI_JOB_HINT, NotFoundError, UsageError } from "../../core/errors";
import { canonicalizeWorkflowName } from "../../core/recognition-util";
import { resolveConceptOwner } from "../../indexer/lookup/adapter-concept-owner";
import { resolveSourceEntries } from "../../indexer/search/search-source";
import { resolveSourcesForOrigin } from "../../registry/origin-resolve";
import { compileWorkflowSource } from "../compile";
import type { WorkflowPlan } from "../plan";
⋮----
export type WorkflowAsset = {
  ref: string;
  path: string;
  adapterId?: string;

  title: string;

  plan: WorkflowPlan;

  sourceHash: string;
};
⋮----
export function canonicalWorkflowRunRef(bundle: string | undefined, canonicalName: string): string
⋮----
export function parseWorkflowRefInput(ref: string): BundleRef
⋮----
export async function canonicalizeWorkflowRefInput(ref: string): Promise<string>
⋮----
type ResolvedWorkflowAsset = {
  assetPath: string;
  sourcePath: string;
  adapterId: string;
  canonicalName: string;
  fullRef: string;
};
⋮----
function resolveWorkflowAsset(ref: string): ResolvedWorkflowAsset
⋮----
export function resolveRunBundleRoot(ref: string): string
⋮----
export async function loadWorkflowAsset(ref: string): Promise<WorkflowAsset>
```

## File: src/workflows/compile.ts
```typescript
import path from "node:path";
import { parseWorkflow } from "./parser";
import type { WorkflowError, WorkflowPlan, WorkflowPlanStep } from "./plan";
import { formatReference, parseReference } from "./program/expressions";
⋮----
export interface WorkflowSourceError {
  code: string;
  message: string;
  path: string;

  line: number;
}
⋮----
export type WorkflowCompileResult = { ok: true; plan: WorkflowPlan } | { ok: false; errors: WorkflowSourceError[] };
⋮----
export interface CompileWorkflowSourceOptions {
  path: string;

  title?: string;
}
⋮----
export function compileWorkflowSource(source: string, options: CompileWorkflowSourceOptions): WorkflowCompileResult
⋮----
export function workflowStepInstructions(step: WorkflowPlanStep): string
⋮----
// A prose step is `akm/command` with its body as literal content.
⋮----
export type WorkflowPlanCheck = { ok: true; warnings: WorkflowError[] } | { ok: false; errors: WorkflowError[] };
⋮----
/** Cross-step reference validation plus the non-fatal advisories. Pure. */
export function checkWorkflowPlan(plan: WorkflowPlan): WorkflowPlanCheck
⋮----
const check = (text: string, line: number, label: string, paramsAllowed: boolean): void =>
⋮----
function workflowWarnings(plan: WorkflowPlan): WorkflowError[]
⋮----
const scan = (text: string | undefined, label: string): void =>
```

## File: src/workflows/concurrency-policy.ts
```typescript
import os from "node:os";
import { isLoopbackEndpoint } from "../core/loopback";
import { WORKFLOW_MAX_CONCURRENCY } from "./resource-limits";
⋮----
export function cpuDerivedUnitConcurrency(cpuCount = os.cpus()?.length ?? 4): number
⋮----
export function clampMaxConcurrency(value: number): number
⋮----
export function workflowMaxConcurrency(configured?: number, cpuCount = os.cpus()?.length ?? 4): number
⋮----
export function defaultLlmEngineConcurrency(endpoint: string | undefined, configured?: number): number
⋮----
export function defaultMapConcurrency(configured?: number): number
```

## File: src/workflows/parser.ts
```typescript
import { LineCounter, parseDocument } from "yaml";
import { bundleRefToString, parseBundleRef } from "../core/asset/asset-ref";
import { parseFrontmatterBlock } from "../core/asset/frontmatter";
import { parseMarkdownToc } from "../core/asset/markdown";
import { isRecord } from "../core/common";
import { formatExtraParamsIssue, validateExtraParams } from "../core/extra-params";
import { checkJsonSchemaDefinition, JSON_SCHEMA_SUBSET_SUPPORTED_KEYWORDS } from "../core/json-schema";
import { warnOnce } from "../core/warn";
import { INPUT_NAME_PATTERN } from "../execution/input-contract";
import { warnRetiredEngineKey } from "../execution/source";
import { classifyTargetRef } from "../execution/target-ref";
import {
  type SourceRef,
  WORKFLOW_PLAN_VERSION,
  type WorkflowBudget,
  type WorkflowError,
  type WorkflowExec,
  type WorkflowOnError,
  type WorkflowPlan,
  type WorkflowPlanStep,
  type WorkflowReducer,
  type WorkflowRetry,
  type WorkflowStepSpec,
  type WorkflowUnitSettings,
} from "./plan";
import { parseReference } from "./program/expressions";
import {
  jsonBytes,
  utf8Bytes,
  WORKFLOW_ENGINE_NAME_PATTERN,
  WORKFLOW_ENV_VAR_NAME_PATTERN,
  WORKFLOW_MAX_CONCURRENCY,
  WORKFLOW_MAX_ENGINE_NAME_LENGTH,
  WORKFLOW_MAX_EXTRA_PARAMS_BYTES,
  WORKFLOW_MAX_INSTRUCTION_BYTES,
  WORKFLOW_MAX_SCHEMA_BYTES,
  WORKFLOW_MAX_SOURCE_BYTES,
  WORKFLOW_MAX_TIMEOUT_MS,
} from "./resource-limits";
⋮----
interface WorkflowInstructionBlock {
  text: string;
  source: SourceRef;
}
⋮----
export type WorkflowParseResult = { ok: true; plan: WorkflowPlan } | { ok: false; errors: WorkflowError[] };
⋮----
type ProgramUnit = WorkflowUnitSettings & {
  exec?: WorkflowExec;

  workflow?: string;
  with?: Record<string, unknown>;
  source: SourceRef;
};
type ProgramDefaults = NonNullable<WorkflowPlan["defaults"]>;
type ProgramGate = { maxLoops?: number };
type ProgramMap = { over: string; concurrency?: number; reducer?: WorkflowReducer; unit?: ProgramUnit };
interface ProgramStep {
  id: string;
  unit?: ProgramUnit;
  map?: ProgramMap;
  inputs?: string[];
  output?: Record<string, unknown>;
  gate?: ProgramGate;
  source: SourceRef;
}
⋮----
type LlmInvocationOverrides = import("../core/llm-inference").LlmInference;
⋮----
type Path = Array<string | number>;
⋮----
interface RangedNode {
  range?: [number, number, number] | null;
}
⋮----
interface Ctx {
  readonly filePath: string;
  readonly errors: WorkflowError[];
  lineAt(path: Path): number;
  lineAtOffset(offset: number): number;
  refAt(path: Path): SourceRef;
  nodeAt(path: Path): unknown;
  err(path: Path, message: string): void;
  errAtLine(line: number, message: string): void;
}
⋮----
lineAt(path: Path): number;
lineAtOffset(offset: number): number;
refAt(path: Path): SourceRef;
nodeAt(path: Path): unknown;
err(path: Path, message: string): void;
errAtLine(line: number, message: string): void;
⋮----
export interface WorkflowParseOptions {
  path: string;

  title?: string;
}
⋮----
export function parseWorkflow(markdown: string, source: WorkflowParseOptions): WorkflowParseResult
⋮----
const lineAt = (p: Path): number =>
⋮----
/** The authored step as the plan carries it. A prose step is inline `akm/command` literal content. */
function stepSpec(step: ProgramStep, section: StepSection | undefined): WorkflowStepSpec
⋮----
/** `xrefs` entries must be canonical asset refs. */
function checkCanonicalXrefs(value: unknown, line: number, errors: WorkflowError[]): void
⋮----
if (!Array.isArray(value)) return; // shape already flagged by checkXrefs
⋮----
interface StepSection {
  headingLine: number;
  instructions?: WorkflowInstructionBlock;
  gateRubric?: WorkflowInstructionBlock;
}
⋮----
function bindStepSections(
  headings: { level: number; text: string; line: number }[],
  lines: string[],
  bodyStartLine: number,
  totalLines: number,
  path: string,
  declaredIds: Set<string>,
  errors: WorkflowError[],
):
⋮----
function findGateSubsection(
  headings: { level: number; text: string; line: number }[],
  stepHeadingIndex: number,
  sectionEnd: number,
  path: string,
  stepId: string,
  errors: WorkflowError[],
):
⋮----
function findNextHeadingAtOrAboveLevel(
  headings: { level: number; line: number }[],
  fromIndex: number,
  level: number,
  totalLines: number,
): number
⋮----
function sliceLines(lines: string[], startLineInclusive: number, endLineInclusive: number): string
⋮----
function sliceProseLines(lines: string[], startLineInclusive: number, endLineInclusive: number): string
⋮----
function checkEnvelopeFields(ctx: Ctx, root: Record<string, unknown>, fmEndLine: number): void
⋮----
function checkActorStamp(ctx: Ctx, value: unknown, path: Path, label: string): void
⋮----
function readTags(ctx: Ctx, value: unknown, fmEndLine: number): string[] | undefined
⋮----
function checkXrefs(ctx: Ctx, value: unknown, fmEndLine: number): void
⋮----
function parseParams(ctx: Ctx, raw: unknown): Record<string, Record<string, unknown>> | undefined
⋮----
function parseDefaults(ctx: Ctx, raw: unknown): ProgramDefaults | undefined
⋮----
function parseBudget(ctx: Ctx, raw: unknown): WorkflowBudget | undefined
⋮----
function parseSteps(ctx: Ctx, raw: unknown): ProgramStep[]
⋮----
function parseUnit(
  ctx: Ctx,
  raw: unknown,
  path: Path,
  stepLabel: string,
  allowWorkflow = true,
): ProgramUnit | undefined
⋮----
// Same decoder uniqueness requirement as `inputs` above: duplicates linted
// clean and then failed the run with an unlocated frozen-plan error.
⋮----
function parseChildWorkflowRef(
  ctx: Ctx,
  raw: unknown,
  path: Path,
  stepLabel: string,
  allowed: boolean,
): string | undefined
⋮----
function parseExec(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): WorkflowExec | undefined
⋮----
function parseExecPassEnv(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): string[] | undefined
⋮----
function parseExecCommand(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): string[] | undefined
⋮----
function parseExecCwd(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): string | undefined
⋮----
function parseMap(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): ProgramMap | undefined
⋮----
function parseInputs(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): string[] | undefined
⋮----
// The frozen-plan decoder requires uniqueness (validateStringArray(..., true)),
// so duplicates parsed and linted clean and then failed the run with an
// unlocated "Invalid frozen workflow plan". Reject them here, on the entry.
⋮----
function parseGate(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): ProgramGate | undefined
⋮----
// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------
⋮----
/**
 * Connection and harness names must already satisfy the frozen-plan grammar
 * (`WORKFLOW_ENGINE_NAME_PATTERN`, max 63 chars) at parse time — the decoder
 * enforces the same bound on persisted plans, and a name that only fails there
 * surfaces as an unlocated "Invalid frozen workflow plan" at `workflow run`.
 */
function parseEngineName(ctx: Ctx, raw: unknown, path: Path, label: string): string | undefined
⋮----
function parseRetry(ctx: Ctx, raw: unknown, path: Path, stepLabel: string): WorkflowRetry | undefined
⋮----
function parseTimeoutField(ctx: Ctx, raw: unknown, path: Path, label: string): number | null | undefined
⋮----
/**
 * Timeouts freeze into `IrInvocation.timeoutMs`, whose decoder bound is
 * `WORKFLOW_MAX_TIMEOUT_MS` (setTimeout's 32-bit signed ceiling). Enforce the
 * same ceiling here so an oversized duration fails with a line anchor instead
 * of an unlocated decode error at `workflow run`.
 */
function checkTimeoutCeiling(ctx: Ctx, timeoutMs: number, path: Path, label: string, raw: string): number | undefined
⋮----
function parseEnumField(
  ctx: Ctx,
  raw: unknown,
  path: Path,
  label: string,
  allowed: readonly string[],
): string | undefined
⋮----
function parseLlmOverrides(ctx: Ctx, raw: unknown, path: Path, label: string): LlmInvocationOverrides | undefined
⋮----
function parseSchemaObject(ctx: Ctx, raw: unknown, path: Path, label: string): Record<string, unknown> | undefined
⋮----
/**
 * Validate an author-declared schema AS a schema (`output:` and `params`
 * declarations). The runtime enforces only a JSON Schema subset
 * (`core/json-schema.ts`); a typo'd `type` or a keyword the subset ignores
 * would silently constrain nothing at run time — a gate depending on a no-op
 * schema is worse than a loud failure here, so both are parse ERRORS.
 */
function checkSchemaDefinition(ctx: Ctx, schema: Record<string, unknown>, path: Path, label: string): void
⋮----
function checkReferenceSyntax(ctx: Ctx, text: string, path: Path, label: string): void
⋮----
function checkUnknownKeys(
  ctx: Ctx,
  obj: Record<string, unknown>,
  path: Path,
  allowed: readonly string[],
  label: string,
  hint: (key: string) => string = () => "",
): void
⋮----
// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
⋮----
function describeError(cause: unknown): string
⋮----
/** Strip the yaml package's multi-line code frame down to the first line. */
function yamlErrorMessage(message: string): string
⋮----
function sortErrors(errors: WorkflowError[]): WorkflowError[]
```

## File: src/workflows/plan.ts
```typescript
import type { LlmInference as LlmInvocationOverrides } from "../core/llm-inference";
import type { TaskInputBinding } from "../execution/input-contract";
import type { ResolvedExecutionRequestV1 } from "../execution/resolved-request";
import type { RunnerSpec } from "../integrations/agent/runner";
⋮----
export interface SourceRef {
  path: string;
  start: number;
  end: number;
}
⋮----
export interface WorkflowError {

  code?: string;
  line: number;
  message: string;
}
⋮----
export type WorkflowOnError = "fail" | "continue";
export type WorkflowReducer = "collect" | "vote";
export type WorkflowRuntimeKind = "connection" | "harness" | "exec";
⋮----
export interface WorkflowRetry {
  max: number;
  on: string[];
}
⋮----
export interface WorkflowBudget {
  maxTokens?: number;
  maxUnits?: number;
}
⋮----
export interface WorkflowUnitSettings {
  connection?: string;
  harness?: string;

  engine?: string;
  model?: string;
  llm?: LlmInvocationOverrides;

  timeoutMs?: number | null;
  onError?: WorkflowOnError;
  retry?: WorkflowRetry;

  output?: Record<string, unknown>;

  env?: string[];
}
⋮----
export interface WorkflowExec {
  command: string[];
  cwd?: string;
  passEnv?: string[];
}
⋮----
export interface WorkflowStepSpec {
  uses?: string;

  workflow?: string;
  with?: Record<string, unknown>;
  exec?: WorkflowExec;
  unit?: WorkflowUnitSettings;
  map?: { over: string; concurrency?: number; reducer?: WorkflowReducer };
  inputs?: string[];

  instructions?: string;
  source: SourceRef;
}
⋮----
export interface WorkflowExecSpec {
  command: [string, ...string[]];
  cwd?: string;
  passEnv?: string[];
  timeoutMs: number | null;
}
⋮----
export type FrozenLegacyField = Readonly<Record<string, unknown>>;
⋮----
export type FrozenWorkflowEnvironmentBinding =
  | { readonly kind: "literal"; readonly name: string; readonly value: string }
  | { readonly kind: "pass-through"; readonly name: string }

  | {
      readonly kind: "env-ref";
      readonly ref: string;
      readonly precedence: number;

      readonly owner?: FrozenLegacyField;
      readonly keys?: readonly string[];
      readonly secretNames?: readonly string[];
    };
⋮----
export interface FrozenWorkflowCommandTarget {
  readonly kind: "command";
  readonly ref: string | null;
  readonly contentHash: string;
  readonly request: ResolvedExecutionRequestV1;
  readonly runner: RunnerSpec;

  readonly concurrency?: number;





  readonly cwdIdentity?: FrozenLegacyField;

  readonly inputBindings?: readonly TaskInputBinding[];
}
⋮----
export interface FrozenWorkflowShellTarget {
  readonly kind: "shell";
  readonly contentHash: string;
  readonly exec: WorkflowExecSpec;

  readonly cwdIdentity?: FrozenLegacyField;
  readonly inputBindings?: readonly TaskInputBinding[];
}
⋮----
export interface FrozenChildWorkflowTarget {
  readonly kind: "child-workflow";
  readonly ref: string;

  readonly planHash: string;
  readonly frozenPlan: WorkflowPlan;
  readonly contentHash: string;

  readonly via?: "direct" | "task";
  readonly taskRef?: string;
  readonly inputBindings?: readonly TaskInputBinding[];
}
⋮----
export type FrozenWorkflowTarget = FrozenWorkflowCommandTarget | FrozenWorkflowShellTarget | FrozenChildWorkflowTarget;
⋮----
export interface WorkflowUnitNode {
  readonly kind: "unit";
  readonly id: string;
  readonly instructions: string;

  readonly inputs?: string[];
  readonly schema?: Record<string, unknown>;
  readonly retry?: WorkflowRetry;
  readonly onError: WorkflowOnError;
  readonly env?: string[];
  readonly source?: SourceRef;
  readonly frozenTarget: FrozenWorkflowTarget;
  readonly environment: readonly FrozenWorkflowEnvironmentBinding[];
}
⋮----
export interface WorkflowMapNode {
  readonly kind: "map";
  readonly id: string;
  readonly over: string;
  readonly template: WorkflowUnitNode;
  readonly concurrency: number;
  readonly reducer: WorkflowReducer;
  readonly source?: SourceRef;
}
⋮----
export type WorkflowExecNode = WorkflowUnitNode | WorkflowMapNode;
⋮----
export interface WorkflowGateNode {
  readonly kind: "gate";
  readonly id: string;
  readonly stepId: string;

  readonly criteria: string[];
  readonly maxLoops: number;

  readonly frozenJudge: FrozenWorkflowCommandTarget | null;
}
⋮----
export interface WorkflowPlanStep {
  readonly stepId: string;

  readonly title: string;
  readonly sequenceIndex: number;

  readonly spec?: WorkflowStepSpec;

  readonly root?: WorkflowExecNode;

  readonly outputSchema?: Record<string, unknown>;
  readonly gate: WorkflowGateNode;
}
⋮----
export interface WorkflowPlan {
  readonly irVersion: number;
  readonly title: string;
  readonly params?: string[];
  readonly paramSchemas?: Record<string, Record<string, unknown>>;
  readonly budget?: WorkflowBudget;

  readonly execution?: { readonly maxConcurrency: number };

  readonly sourceHash?: string;
  readonly steps: WorkflowPlanStep[];

  readonly defaults?: Omit<WorkflowUnitSettings, "retry" | "output" | "env">;
  readonly description?: string;

  readonly preamble?: string;
}
```

## File: src/workflows/renderer.ts
```typescript
import { displayRef } from "../core/asset/resolve-ref";
import { isInstalledBundle, resolveRefOwner } from "../core/env-secret-ref";
import { UsageError } from "../core/errors";
import { substituteRefTokens } from "../core/ref-token";
import type { AssetRenderer, RenderContext } from "../indexer/walk/file-context";
import type {
  ShowResponse,
  WorkflowParameter,
  WorkflowStepDefinition,
  WorkflowStepOrchestrationSummary,
  WorkflowStepRef,
} from "../sources/types";
import { compileWorkflowSource, workflowStepInstructions } from "./compile";
import type { WorkflowExec, WorkflowPlan, WorkflowPlanStep } from "./plan";
⋮----
function shellQuote(value: string): string
⋮----
export function buildWorkflowAction(ref: string): string
⋮----
function deriveName(ctx: RenderContext): string
⋮----
function loadPlan(ctx: RenderContext): WorkflowPlan
⋮----
function projectParameters(plan: WorkflowPlan): WorkflowParameter[] | undefined
⋮----
/**
 * Compact, show-facing orchestration summary for one step. Field mapping:
 * `engine` (the connection or harness a unit names), `model` and `timeoutMs` merge the run-level `defaults` exactly like the
 * compiler does (per-unit override wins), `fanOut.over` carries the raw
 * reference string.
 * Returns undefined when the step declares nothing worth summarizing.
 *
 * ## exec units
 *
 * An `exec` unit runs a shell command and names no connection or harness — the parser rejects
 * `connection`/`harness`/`model`/`llm` alongside `exec:`. Merging the run's default
 * into its summary would make `show` state something untrue about what will run, so the
 * two fields are suppressed and the argv is projected instead, under `exec`
 * (field presence carries the dispatch kind, exactly like `fanOut`
 * carries the step kind).
 *
 * `timeoutMs` still merges the defaults: an exec unit really does inherit
 * `defaults.timeout`, so that number stays true for it.
 *
 * The argv is shown IN FULL, never clipped. It is authored literally in the
 * asset — the `${{ … }}` interpolation language is gone, so nothing in it is
 * resolved from the environment, from a secret ref, or from a prior step's
 * output — which makes it (a) safe to display, since every byte is already
 * visible in the workflow file `show` is rendering, and (b) pointless to clip:
 * the whole finding this projection answers is `show` describing something
 * other than what runs, and a truncated argv is that same bug in miniature.
 * It is far smaller than the step `instructions` this same projection
 * already carries whole.
 */
export function summarizeStepOrchestration(
  step: WorkflowPlanStep,
  defaults: WorkflowPlan["defaults"],
): WorkflowStepOrchestrationSummary | undefined
⋮----
const named = (settings: typeof unit | undefined): string | undefined
⋮----
function frozenDispatch(step: WorkflowPlanStep):
⋮----
export function resolveOrchestrationRefs(summary: WorkflowStepOrchestrationSummary): WorkflowStepOrchestrationSummary
⋮----
const note = (ref: string, where: WorkflowStepRef["in"]): void =>
const tokens = (values: string[], where: "argv" | "cwd"): void =>
⋮----
function projectStepDefinitions(plan: WorkflowPlan): WorkflowStepDefinition[]
⋮----
buildShowResponse(ctx: RenderContext): ShowResponse
```

## File: src/workflows/resource-limits.ts
```typescript
import { EXECUTION_MAX_TIMEOUT_MS } from "../execution/limits";
⋮----
export interface ExecContextLimits {

  readonly perVarBytes: number;

  readonly totalBytes: number;

  readonly source: string;
}
⋮----
export function execContextLimits(platform: string = process.platform): ExecContextLimits
⋮----
export function clip(text: string, max: number): string
⋮----
export function utf8Bytes(value: string): number
⋮----
export function jsonBytes(value: unknown): number
```

## File: src/workflows/source-files.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { compareCodePoints, toPosix } from "../core/common";
import { UsageError, type UsageErrorCode } from "../core/errors";
import { canonicalizeWorkflowName, WORKFLOW_EXTENSIONS } from "../core/recognition-util";
import { warnOnce } from "../core/warn";
⋮----
export interface WorkflowSourceFile {

  path: string;

  realPath: string;

  relativePath: string;
  canonicalName: string;
}
⋮----
interface WorkflowSourceCandidate {
  path: string;
  relativePath: string;
  lowerExtension: string;
  extensionlessStem: string;
}
⋮----
interface WorkflowSourceCandidateInspection {
  source?: WorkflowSourceFile;
  issues: WorkflowSourceRejectionError[];
}
⋮----
export interface WorkflowSourceDomainResolution {
  canonicalName: string;

  sourcePaths: readonly string[];

  source?: WorkflowSourceFile;

  rejection?: WorkflowSourceRejectionError;
}
⋮----
export abstract class WorkflowSourceRejectionError extends UsageError
⋮----
protected constructor(message: string, code: UsageErrorCode, sourcePaths: readonly string[])
⋮----
export class WorkflowSourceCollisionError extends WorkflowSourceRejectionError
⋮----
constructor(canonicalName: string, sourcePaths: readonly string[])
⋮----
export class WorkflowSourceIdentityError extends UsageError
⋮----
constructor(ref: string, indexedPath: string, authoritativePath: string)
⋮----
export class WorkflowSourceNameError extends WorkflowSourceRejectionError
⋮----
constructor(sourcePath: string, nestedSuffix: string)
⋮----
export class WorkflowSourceLinkIdentityError extends WorkflowSourceRejectionError
⋮----
constructor(sourcePath: string, targetPath: string)
⋮----
export class WorkflowSourceLinkResolutionError extends WorkflowSourceRejectionError
⋮----
constructor(sourcePath: string)
⋮----
export function workflowNameForConceptId(adapterId: string, conceptId: string): string | undefined
⋮----
export function workflowNameForSourcePath(
  sourceRoot: string,
  adapterId: string,
  sourcePath: string,
): string | undefined
⋮----
export function listWorkflowSourceFiles(sourceRoot: string, adapterId: string, name: string): WorkflowSourceFile[]
⋮----
export function resolveWorkflowSourceDomains(
  sourceRoot: string,
  adapterId: string,
  sourcePaths: readonly string[],
): WorkflowSourceDomainResolution[]
⋮----
function inspectWorkflowSourceDomain(
  candidates: readonly WorkflowSourceCandidate[],
  canonicalName: string,
  realRoot: string,
): WorkflowSourceFile[]
⋮----
function pickWorkflowSource(
  adapterId: string,
  canonicalName: string,
  sources: readonly WorkflowSourceFile[],
): WorkflowSourceFile | undefined
⋮----
function inspectWorkflowSourceCandidate(
  candidate: WorkflowSourceCandidate,
  canonicalName: string,
  realRoot: string,
): WorkflowSourceCandidateInspection
⋮----
export function resolveUniqueWorkflowSource(
  sourceRoot: string,
  adapterId: string,
  name: string,
): WorkflowSourceFile | undefined
⋮----
export function assertIndexedWorkflowSourceIdentity(
  ref: string,
  indexedPath: string,
  authoritative: WorkflowSourceFile,
): void
⋮----
function normalizeName(name: string): string
⋮----
function isSafeRelativeName(name: string): boolean
⋮----
function isWithinResolved(candidate: string, root: string): boolean
```

## File: src/workflows/validate-summary.ts
```typescript
import validateSummaryJudgePrompt from "../assets/prompts/validate-summary-judge.md" with { type: "text" };
import { parseJsonResponse } from "../core/parse";
⋮----
export interface ValidateSummaryInput {
  stepTitle: string;
  completionCriteria: string[];
  summary: string;
}
⋮----
export interface ValidateSummaryResult {
  complete: boolean;

  missing: string[];

  feedback?: string;

  skipped?: boolean;
}
⋮----
export interface JudgeCallIdentity {
  runId: string;
  stepId: string;

  unitId: string;

  attempt?: number;

  dispatchId?: string;

  recordTokens?: (tokens: number) => void;
}
⋮----
export type SummaryJudge = (prompt: { system: string; user: string }, identity?: JudgeCallIdentity) => Promise<string>;
⋮----
export interface JudgeVerdict {
  complete: boolean;
  missing?: unknown;
  feedback?: unknown;
}
⋮----
export function parseJudgeVerdict(raw: string): JudgeVerdict | undefined
⋮----
function buildUserPrompt(input: ValidateSummaryInput): string
⋮----
export async function validateStepSummary(
  input: ValidateSummaryInput,
  judge: SummaryJudge | undefined,
  signal?: AbortSignal,
): Promise<ValidateSummaryResult>
⋮----
function interruptionReason(signal: AbortSignal): Error
```
