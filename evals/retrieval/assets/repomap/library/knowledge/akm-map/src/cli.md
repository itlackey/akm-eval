---
description: "Repo map of akm src/cli at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src/cli

## src/cli/

### src/cli/clack.ts

- `type Clack = typeof clack;`
- `type FakeFn = (...args: never[]) => unknown;`
- `export interface ClackFakeForTests`
- `export function _setClackForTests(fake?: ClackFakeForTests): void`
- `function bind<K extends keyof typeof realFns>(name: K): Clack[K]`
- `function bindLog<K extends keyof Clack["log"]>(name: K): Clack["log"][K]`

### src/cli/confirm.ts

- `export interface ConfirmDestructiveOptions`
- `export async function confirmDestructive(message: string, opts: ConfirmDestructiveOptions): Promise<boolean>`

### src/cli/invocation.ts

- `function getFlagValueFrom(argv: readonly string[], flag: string): string | undefined`
- `function hasFlagIn(argv: readonly string[], flag: string): boolean`
- `function getAllFlagValuesFrom(argv: readonly string[], flag: string): string[]`
- `function passthroughArgsFrom(argv: readonly string[]): string[]`
- `export interface ParsedInvocation`
- `function createParsedInvocation(argv: readonly string[]): ParsedInvocation`
- `export function setParsedInvocation(argv: readonly string[]): ParsedInvocation`
- `export function getParsedInvocation(): ParsedInvocation`
- `export function _resetParsedInvocationForTests(): void`
- `export function parseAllFlagValues(flag: string): string[]`
- `export interface CittyArgDefinitionForScan`
- `export type CittyArgsDefinitionForScan = Record<string, CittyArgDefinitionForScan>;`
- `export function cittyComparableName(name: string): string`
- `export function toAliasArray(alias: CittyArgDefinitionForScan["alias"]): readonly string[]`
- `function isCittyValueFlag(flag: string, argsDef: CittyArgsDefinitionForScan): boolean`
- `export function findCittyTopLevelCommandIndex(rawArgs: readonly string[], argsDef: CittyArgsDefinitionForScan): number`
- `export function findCittyTopLevelCommand`
- `export function resolveHelpMigrateVersionArg(version: string | undefined): string | undefined`
- `function wasHelpMigrateFlagValueConsumedAsVersion`

### src/cli/parse-args.ts

- `export function hasSubcommand(args: Record<string, unknown>, validSet: Set<string>): boolean`
- `export function parsePositiveIntFlag(raw: string | undefined, flagName = "--limit"): number | undefined`
- `export function getStringArg(args: unknown, key: string): string | undefined`

### src/cli/selection.ts

- `export type SelectionFlags = Pick<ConfiguredExecutionSettings, "connection" | "harness" | "model" | "engine">;`
- `export function selectionFromArgs(args: unknown): SelectionFlags`

### src/cli/shared.ts

- `function classifyExitCode(error: unknown): number`
- `function extractHint(error: unknown): string | undefined`
- `export function emitJsonError(error: unknown): void`
- `export async function runWithJsonErrors(fn: (() => void) | (() => Promise<void>)): Promise<void>`
- `export type JsonCommandDef<T extends ArgsDef = ArgsDef> = Omit<CommandDef<T>, "run"> &`
- `export function withoutHiddenArgs<T extends object>(command: T): T`
- `export function defineJsonCommand<const T extends ArgsDef = ArgsDef>(def: JsonCommandDef<T>): CommandDef<T>`
- `function bareGroupUsageError<T extends ArgsDef>(meta: CommandDef<T>["meta"], subcommandSet: Set<string>): never`
- `export function defineGroupCommand<const T extends ArgsDef = ArgsDef>(def:`
- `export function outputWithExitCode(command: string, result: object, exitCode: number | undefined): void`
- `export function output(command: string, result: unknown): void`
- `type DocumentOutputMode = Pick<OutputMode, "detail" | "shape"> & { format: Exclude<OutputFormat, "jsonl"> };`
- `export function renderOutput(command: string, result: unknown, mode: DocumentOutputMode): string`

### src/cli/unknown-flags.ts

- `export interface FlagScanCommand`
- `interface KnownArgs`
- `function collectKnownArgs(root: FlagScanCommand, rawArgs: readonly string[]): KnownArgs`
- `function throwUnknownFlag(shown: string, attempted: string, known: KnownArgs): never`
- `function warnUnknownFlag(shown: string, known: KnownArgs): void`
- `export function assertKnownFlags(root: FlagScanCommand, rawArgs: readonly string[]): void`
