---
description: "Repo map of akm src/execution at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/execution

## src/execution/

### src/execution/input-contract.ts

- `export interface InputDeclaration`
- `export type InputContract = Readonly<Record<string, InputDeclaration>>;`
- `export interface InputFlag`
- `export type TaskInputBinding`
- `export interface InputFlagDiagnostics`
- `export function applyInputDefaults(contract: InputContract, values: Record<string, unknown>): Record<string, unknown>`
- `export function validateInputs`
- `export function materializeInputFlags`
- `function materializeFlagValues`
- `function coerceFlagValue`
- `function schemaTypes(schema: Readonly<Record<string, unknown>> | undefined): string[]`
- `function parseJsonFlag(name: string, raw: string, diagnostics: InputFlagDiagnostics): unknown`
- `function isRecord(value: unknown): value is Record<string, unknown>`
- `export function canonicalInputJson(value: unknown): string`
- `export function canonicalInputHash(value: unknown): string`
- `function sortInputJsonKeys(value: unknown): unknown`

### src/execution/json.ts

- `export type ExecutionJsonPrimitive = string | number | boolean | null;`
- `export interface ExecutionJsonObject`
- `export interface ExecutionJsonArray extends ReadonlyArray<ExecutionJsonValue> {}`
- `export type ExecutionJsonValue = ExecutionJsonPrimitive | ExecutionJsonArray | ExecutionJsonObject;`
- `function fail(path: string, detail: string): never`
- `export function cloneExecutionJson`
- `export function cloneExecutionJsonObject(value: unknown, path: string): ExecutionJsonObject`
- `export function sortExecutionJson(value: ExecutionJsonValue): ExecutionJsonValue`

### src/execution/limits.ts

### src/execution/notices.ts

- `export type Notice = Readonly<LoweringNotice>;`
- `export type NoticeSink = (notices: readonly Notice[]) => void;`
- `export function mergeNotices<T extends Notice>`
- `export function noticeSet(forward?: NoticeSink)`
- `const add: NoticeSink = (notices) =>`
- `const list = (): readonly Notice[]`
- `export type NoticeSet = ReturnType<typeof noticeSet>;`

### src/execution/record.ts

- `export type StrictRecordSnapshot = Readonly<Record<PropertyKey, unknown>>;`
- `export interface StrictRecordSnapshotOptions`
- `export function snapshotStrictRecord`
- `export function assertSnapshotKeys`
- `export function requireSnapshotField(value: StrictRecordSnapshot, key: string, path: string): unknown`

### src/execution/resolved-request.ts

- `export interface ResolvedCommandContent`
- `export interface ResolvedPersonaContent`
- `export interface ResolvedTargetSelection`
- `export interface ResolvedModelSelection`
- `export interface ResolvedRuntimeSettings`
- `export interface LoweringNotice`
- `export interface ResolvedConversationMessage`
- `export interface ResolvedExecutionRequestV1`
- `export type ResolvedExecutionRequestInput = Omit<ResolvedExecutionRequestV1, "schemaVersion">;`
- `function pick(value: object, keys: readonly string[]): Record<string, unknown>`
- `function requireRecord(value: unknown, path: string): Record<string, unknown>`
- `export function createResolvedCommand(input:`
- `export function createInlineResolvedCommand(input:`
- `export function createResolvedPersona(source: AdapterRenderedPersonaSource): ResolvedPersonaContent`
- `export function createResolvedExecutionRequest(input: ResolvedExecutionRequestInput): ResolvedExecutionRequestV1`
- `export function decodeResolvedExecutionRequest(value: unknown): ResolvedExecutionRequestV1`
- `export function canonicalResolvedExecutionRequest(request: ResolvedExecutionRequestV1): string`

### src/execution/source.ts

- `export interface ExecutionSourceIdentity`
- `export function warnRetiredEngineKey(): void`
- `export interface UnresolvedExecutionDefaults`
- `export interface ConfiguredExecutionSettings`
- `export function executionDefaultsOf(settings: ConfiguredExecutionSettings | undefined): UnresolvedExecutionDefaults`
- `interface AdapterRenderedExecutionSourceBase`
- `export interface AdapterRenderedCommandSource extends AdapterRenderedExecutionSourceBase`
- `export interface AdapterRenderedPersonaSource extends AdapterRenderedExecutionSourceBase`
- `export type AdapterRenderedExecutionSource = AdapterRenderedCommandSource | AdapterRenderedPersonaSource;`
- `function requireRecord(value: unknown, path: string): Record<string, unknown>`
- `export function requireStableExecutionSelector(value: unknown, path: string): string`
- `export function isPortableExecutionAgentSelector(value: string): boolean`
- `export function executionPersonaMatchesSelector(selector: string, personaRef: string): boolean`
- `function identityFrom(value: unknown, path: string): Readonly<ExecutionSourceIdentity>`
- `export function createExecutionSourceIdentity(input: ExecutionSourceIdentity): Readonly<ExecutionSourceIdentity>`
- `export function decodeExecutionSourceIdentity`
- `export function cloneUnresolvedExecutionDefaults`
- `const present = (key: string): boolean`
- `export interface CreateAdapterRenderedExecutionSourceInput`
- `export function createAdapterRenderedExecutionSource`
- `export function createAdapterRenderedExecutionSource`
- `export function createAdapterRenderedExecutionSource`
- `export function createAdapterRenderedExecutionSource`

### src/execution/target-ref.ts

- `export type TargetRefKind = "command" | "script" | "task" | "workflow";`
- `export interface ClassifiedTargetRef`
- `function targetRefInvalid(value: string): UsageError`
- `export function classifyTargetRef(value: string): ClassifiedTargetRef`
