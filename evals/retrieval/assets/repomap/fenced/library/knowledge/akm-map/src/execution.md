---
description: "Repo map of akm src/execution at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  execution/
    input-contract.ts
    json.ts
    limits.ts
    notices.ts
    record.ts
    resolved-request.ts
    source.ts
    target-ref.ts
```

# Files

## File: src/execution/input-contract.ts
```typescript
import { createHash } from "node:crypto";
import type { UsageError } from "../core/errors";
import { validateJsonSchemaSubset } from "../core/json-schema";
⋮----
export interface InputDeclaration {

  readonly schema: Readonly<Record<string, unknown>>;
  readonly default?: unknown;
  readonly required: boolean;
}
⋮----
export type InputContract = Readonly<Record<string, InputDeclaration>>;
⋮----
export interface InputFlag {
  name: string;
  value: string | boolean;
}
⋮----
export type TaskInputBinding =
  | Readonly<{ kind: "literal"; name: string; value: unknown }>
  | Readonly<{ kind: "reference"; name: string; from: string; schema: Readonly<Record<string, unknown>> }>;
⋮----
export interface InputFlagDiagnostics {

  unknownFlag(name: string, declared: readonly string[]): UsageError;

  invalidValue(name: string, detail: string): UsageError;

  contractViolation(errors: readonly string[]): UsageError;

  duplicateNonArray(name: string): UsageError;

  malformedJson(name: string): UsageError;
}
⋮----
unknownFlag(name: string, declared: readonly string[]): UsageError;
⋮----
invalidValue(name: string, detail: string): UsageError;
⋮----
contractViolation(errors: readonly string[]): UsageError;
⋮----
duplicateNonArray(name: string): UsageError;
⋮----
malformedJson(name: string): UsageError;
⋮----
export function applyInputDefaults(contract: InputContract, values: Record<string, unknown>): Record<string, unknown>
⋮----
export function validateInputs(
  contract: InputContract,
  values: Record<string, unknown>,
  options?: { readonly pathRoot?: string },
): string[]
⋮----
export function materializeInputFlags(
  contract: InputContract,
  flags: readonly InputFlag[],
  diagnostics: InputFlagDiagnostics,
): Record<string, unknown>
⋮----
function materializeFlagValues(
  name: string,
  values: readonly (string | boolean)[],
  schema: Readonly<Record<string, unknown>> | undefined,
  diagnostics: InputFlagDiagnostics,
): unknown
⋮----
function coerceFlagValue(
  name: string,
  raw: string | boolean,
  schema: Readonly<Record<string, unknown>> | undefined,
  diagnostics: InputFlagDiagnostics,
): unknown
⋮----
function schemaTypes(schema: Readonly<Record<string, unknown>> | undefined): string[]
⋮----
function parseJsonFlag(name: string, raw: string, diagnostics: InputFlagDiagnostics): unknown
⋮----
function isRecord(value: unknown): value is Record<string, unknown>
⋮----
export function canonicalInputJson(value: unknown): string
⋮----
export function canonicalInputHash(value: unknown): string
⋮----
function sortInputJsonKeys(value: unknown): unknown
```

## File: src/execution/json.ts
```typescript
import { snapshotStrictRecord } from "./record";
⋮----
export type ExecutionJsonPrimitive = string | number | boolean | null;
export interface ExecutionJsonObject {
  readonly [key: string]: ExecutionJsonValue;
}
export interface ExecutionJsonArray extends ReadonlyArray<ExecutionJsonValue> {}
export type ExecutionJsonValue = ExecutionJsonPrimitive | ExecutionJsonArray | ExecutionJsonObject;
⋮----
function fail(path: string, detail: string): never
⋮----
export function cloneExecutionJson(
  value: unknown,
  path = "execution value",
  ancestors: ReadonlySet<object> = new Set(),
): ExecutionJsonValue
⋮----
export function cloneExecutionJsonObject(value: unknown, path: string): ExecutionJsonObject
⋮----
export function sortExecutionJson(value: ExecutionJsonValue): ExecutionJsonValue
```

## File: src/execution/limits.ts
```typescript

```

## File: src/execution/notices.ts
```typescript
import { type ExecutionJsonObject, sortExecutionJson } from "./json";
import type { LoweringNotice } from "./resolved-request";
⋮----
export type Notice = Readonly<LoweringNotice>;
export type NoticeSink = (notices: readonly Notice[]) => void;
⋮----
export function mergeNotices<T extends Notice>(
  ...groups: readonly (readonly T[] | undefined)[]
): readonly T[] | undefined
⋮----
export function noticeSet(forward?: NoticeSink)
⋮----
const add: NoticeSink = (notices) =>
const list = (): readonly Notice[]
⋮----
export type NoticeSet = ReturnType<typeof noticeSet>;
```

## File: src/execution/record.ts
```typescript
export type StrictRecordSnapshot = Readonly<Record<PropertyKey, unknown>>;
⋮----
export interface StrictRecordSnapshotOptions {

  readonly allowedSymbols?: ReadonlySet<symbol>;
}
⋮----
export function snapshotStrictRecord(
  value: unknown,
  path: string,
  options: StrictRecordSnapshotOptions = {},
): StrictRecordSnapshot
⋮----
export function assertSnapshotKeys(
  value: StrictRecordSnapshot,
  allowed: readonly string[],
  path: string,
  allowedSymbols: ReadonlySet<symbol> = new Set(),
): void
⋮----
export function requireSnapshotField(value: StrictRecordSnapshot, key: string, path: string): unknown
```

## File: src/execution/resolved-request.ts
```typescript
import { type ExecutionJsonObject, type ExecutionJsonValue, sortExecutionJson } from "./json";
import {
  type AdapterRenderedCommandSource,
  type AdapterRenderedPersonaSource,
  decodeExecutionSourceIdentity,
  type ExecutionSourceIdentity,
} from "./source";
⋮----
export interface ResolvedCommandContent {

  readonly template: string;

  readonly argumentInput?: string;

  readonly content: string;

  readonly source: Readonly<ExecutionSourceIdentity> | null;
}
⋮----
export interface ResolvedPersonaContent {
  readonly content: string;

  readonly source: Readonly<ExecutionSourceIdentity>;
}
⋮----
export interface ResolvedTargetSelection {
  readonly name: string;
  readonly kind: "connection" | "harness";

  readonly platform?: string;
}
⋮----
export interface ResolvedModelSelection {

  readonly model: string;

  readonly alias?: string;
}
⋮----
export interface ResolvedRuntimeSettings {
  readonly timeoutMs?: number | null;
  readonly workspace?: string | null;
  readonly environment?: Readonly<Record<string, string>> | null;
}
⋮----
export interface LoweringNotice {
  readonly code: string;
  readonly severity: "info" | "warning";
  readonly adapter: string;
  readonly field?: string | null;
  readonly message: string;
  readonly details?: ExecutionJsonObject | null;
}
⋮----
export interface ResolvedConversationMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}
⋮----
export interface ResolvedExecutionRequestV1 {
  readonly schemaVersion: typeof RESOLVED_EXECUTION_SCHEMA_VERSION;
  readonly command: ResolvedCommandContent;

  readonly conversation?: readonly Readonly<ResolvedConversationMessage>[];

  readonly agent?: string | null;
  readonly persona?: ResolvedPersonaContent | null;
  readonly target: Readonly<ResolvedTargetSelection>;
  readonly model?: Readonly<ResolvedModelSelection> | null;
  readonly inference?: ExecutionJsonObject | null;
  readonly outputSchema?: ExecutionJsonObject | null;

  readonly modelWork: boolean;
  readonly runtime: Readonly<ResolvedRuntimeSettings>;
}
⋮----
export type ResolvedExecutionRequestInput = Omit<ResolvedExecutionRequestV1, "schemaVersion">;
⋮----
function pick(value: object, keys: readonly string[]): Record<string, unknown>
⋮----
function requireRecord(value: unknown, path: string): Record<string, unknown>
⋮----
export function createResolvedCommand(input: {
  readonly source: AdapterRenderedCommandSource;
  readonly argumentInput?: string;
  readonly content: string;
}): ResolvedCommandContent
⋮----
export function createInlineResolvedCommand(input: {
  readonly template: string;
  readonly argumentInput?: string;
  readonly content: string;
}): ResolvedCommandContent
⋮----
export function createResolvedPersona(source: AdapterRenderedPersonaSource): ResolvedPersonaContent
⋮----
export function createResolvedExecutionRequest(input: ResolvedExecutionRequestInput): ResolvedExecutionRequestV1
⋮----
export function decodeResolvedExecutionRequest(value: unknown): ResolvedExecutionRequestV1
⋮----
export function canonicalResolvedExecutionRequest(request: ResolvedExecutionRequestV1): string
```

## File: src/execution/source.ts
```typescript
import { warnOnce } from "../core/warn";
import { cloneExecutionJsonObject, type ExecutionJsonObject } from "./json";
⋮----
export interface ExecutionSourceIdentity {

  readonly ref: string;
  readonly bundle: string;
  readonly adapter: string;

  readonly file: string;

  readonly hash: string;
}
⋮----
export function warnRetiredEngineKey(): void
⋮----
export interface UnresolvedExecutionDefaults {
  readonly agent?: string | null;
  readonly connection?: string | null;
  readonly harness?: string | null;

  readonly engine?: string | null;
  readonly model?: string | null;
  readonly inference?: ExecutionJsonObject | null;
  readonly outputSchema?: ExecutionJsonObject | null;

  readonly timeout?: string | number | null;
  readonly workspace?: string | null;
  readonly environment?: Readonly<Record<string, string>> | null;
}
⋮----
export interface ConfiguredExecutionSettings {
  readonly connection?: string;
  readonly harness?: string;
  readonly engine?: string;
  readonly model?: string;
  readonly llm?: object;

  readonly timeoutMs?: number | null;
}
⋮----
export function executionDefaultsOf(settings: ConfiguredExecutionSettings | undefined): UnresolvedExecutionDefaults
⋮----
interface AdapterRenderedExecutionSourceBase {
  readonly schemaVersion: typeof EXECUTION_SOURCE_SCHEMA_VERSION;
  readonly content: string;
  readonly defaults: Readonly<UnresolvedExecutionDefaults>;
  readonly identity: Readonly<ExecutionSourceIdentity>;
}
⋮----
export interface AdapterRenderedCommandSource extends AdapterRenderedExecutionSourceBase {
  readonly kind: "command";
}
⋮----
export interface AdapterRenderedPersonaSource extends AdapterRenderedExecutionSourceBase {
  readonly kind: "persona";
}
⋮----
export type AdapterRenderedExecutionSource = AdapterRenderedCommandSource | AdapterRenderedPersonaSource;
⋮----
function requireRecord(value: unknown, path: string): Record<string, unknown>
⋮----
export function requireStableExecutionSelector(value: unknown, path: string): string
⋮----
export function isPortableExecutionAgentSelector(value: string): boolean
⋮----
export function executionPersonaMatchesSelector(selector: string, personaRef: string): boolean
⋮----
function identityFrom(value: unknown, path: string): Readonly<ExecutionSourceIdentity>
⋮----
export function createExecutionSourceIdentity(input: ExecutionSourceIdentity): Readonly<ExecutionSourceIdentity>
⋮----
export function decodeExecutionSourceIdentity(
  value: unknown,
  path = "execution source identity",
): Readonly<ExecutionSourceIdentity>
⋮----
export function cloneUnresolvedExecutionDefaults(
  input: UnresolvedExecutionDefaults,
  path = "execution source defaults",
): Readonly<UnresolvedExecutionDefaults>
⋮----
const present = (key: string): boolean
⋮----
export interface CreateAdapterRenderedExecutionSourceInput {
  readonly kind: "command" | "persona";

  readonly content: string;
  readonly identity: ExecutionSourceIdentity;
  readonly defaults?: UnresolvedExecutionDefaults;
}
⋮----
export function createAdapterRenderedExecutionSource(
  input: CreateAdapterRenderedExecutionSourceInput & { readonly kind: "command" },
): AdapterRenderedCommandSource;
export function createAdapterRenderedExecutionSource(
  input: CreateAdapterRenderedExecutionSourceInput & { readonly kind: "persona" },
): AdapterRenderedPersonaSource;
export function createAdapterRenderedExecutionSource(
  input: CreateAdapterRenderedExecutionSourceInput,
): AdapterRenderedExecutionSource;
export function createAdapterRenderedExecutionSource(
  input: CreateAdapterRenderedExecutionSourceInput,
): AdapterRenderedExecutionSource
```

## File: src/execution/target-ref.ts
```typescript
import { bundleRefToString, parseBundleRef } from "../core/asset/asset-ref";
import { UsageError } from "../core/errors";
⋮----
export type TargetRefKind = "command" | "script" | "task" | "workflow";
⋮----
export interface ClassifiedTargetRef {
  readonly kind: TargetRefKind;
  readonly ref: string;
}
⋮----
function targetRefInvalid(value: string): UsageError
⋮----
export function classifyTargetRef(value: string): ClassifiedTargetRef
```
