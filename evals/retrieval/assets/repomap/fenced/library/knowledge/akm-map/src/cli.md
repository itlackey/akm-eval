---
description: "Repo map of akm src/cli at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  cli/
    clack.ts
    confirm.ts
    invocation.ts
    parse-args.ts
    selection.ts
    shared.ts
    unknown-flags.ts
```

# Files

## File: src/cli/clack.ts
```typescript
import {
  cancel as realCancel,
  confirm as realConfirm,
  intro as realIntro,
  isCancel as realIsCancel,
  log as realLog,
  multiselect as realMultiselect,
  note as realNote,
  outro as realOutro,
  password as realPassword,
  select as realSelect,
  spinner as realSpinner,
  text as realText,
} from "@clack/prompts";
⋮----
type Clack = typeof clack;
⋮----
type FakeFn = (...args: never[]) => unknown;
⋮----
export interface ClackFakeForTests {
  intro?: FakeFn;
  outro?: FakeFn;
  cancel?: FakeFn;
  confirm?: FakeFn;
  select?: FakeFn;
  multiselect?: FakeFn;
  text?: FakeFn;
  password?: FakeFn;
  spinner?: FakeFn;
  note?: FakeFn;
  isCancel?: (value: unknown) => boolean;
  log?: Partial<Record<keyof Clack["log"], FakeFn>>;
}
⋮----
export function _setClackForTests(fake?: ClackFakeForTests): void
⋮----
function bind<K extends keyof typeof realFns>(name: K): Clack[K]
⋮----
function bindLog<K extends keyof Clack["log"]>(name: K): Clack["log"][K]
```

## File: src/cli/confirm.ts
```typescript
import { UsageError } from "../core/errors";
⋮----
export interface ConfirmDestructiveOptions {




  yes: boolean;
}
⋮----
export async function confirmDestructive(message: string, opts: ConfirmDestructiveOptions): Promise<boolean>
```

## File: src/cli/invocation.ts
```typescript
function getFlagValueFrom(argv: readonly string[], flag: string): string | undefined
⋮----
function hasFlagIn(argv: readonly string[], flag: string): boolean
⋮----
function getAllFlagValuesFrom(argv: readonly string[], flag: string): string[]
⋮----
function passthroughArgsFrom(argv: readonly string[]): string[]
⋮----
export interface ParsedInvocation {

  readonly argv: readonly string[];

  readonly userArgs: readonly string[];

  getFlagValue(flag: string): string | undefined;

  hasFlag(flag: string): boolean;

  getAllFlagValues(flag: string): string[];

  passthroughArgs(): string[];
}
⋮----
getFlagValue(flag: string): string | undefined;
⋮----
hasFlag(flag: string): boolean;
⋮----
getAllFlagValues(flag: string): string[];
⋮----
passthroughArgs(): string[];
⋮----
function createParsedInvocation(argv: readonly string[]): ParsedInvocation
⋮----
export function setParsedInvocation(argv: readonly string[]): ParsedInvocation
⋮----
export function getParsedInvocation(): ParsedInvocation
⋮----
export function _resetParsedInvocationForTests(): void
⋮----
export function parseAllFlagValues(flag: string): string[]
⋮----
export interface CittyArgDefinitionForScan {
  readonly type?: string;
  readonly alias?: string | readonly string[];
}
⋮----
export type CittyArgsDefinitionForScan = Record<string, CittyArgDefinitionForScan>;
⋮----
export function cittyComparableName(name: string): string
⋮----
export function toAliasArray(alias: CittyArgDefinitionForScan["alias"]): readonly string[]
⋮----
function isCittyValueFlag(flag: string, argsDef: CittyArgsDefinitionForScan): boolean
⋮----
export function findCittyTopLevelCommandIndex(rawArgs: readonly string[], argsDef: CittyArgsDefinitionForScan): number
⋮----
export function findCittyTopLevelCommand(
  rawArgs: readonly string[],
  argsDef: CittyArgsDefinitionForScan,
): string | undefined
⋮----
export function resolveHelpMigrateVersionArg(version: string | undefined): string | undefined
⋮----
function wasHelpMigrateFlagValueConsumedAsVersion(
  version: string,
  flagValue: string,
  flagName: "--format" | "--detail",
): boolean
```

## File: src/cli/parse-args.ts
```typescript
import { UsageError } from "../core/errors";
⋮----
export function hasSubcommand(args: Record<string, unknown>, validSet: Set<string>): boolean
⋮----
export function parsePositiveIntFlag(raw: string | undefined, flagName = "--limit"): number | undefined
⋮----
export function getStringArg(args: unknown, key: string): string | undefined
```

## File: src/cli/selection.ts
```typescript
import type { ArgsDef } from "citty";
import { UsageError } from "../core/errors";
import { warnOnce } from "../core/warn";
import type { ConfiguredExecutionSettings } from "../execution/source";
import { getStringArg } from "./parse-args";
⋮----
export type SelectionFlags = Pick<ConfiguredExecutionSettings, "connection" | "harness" | "model" | "engine">;
⋮----
export function selectionFromArgs(args: unknown): SelectionFlags
```

## File: src/cli/shared.ts
```typescript
import { type ArgsDef, type CommandContext, type CommandDef, defineCommand } from "citty";
import { stringify as yamlStringify } from "yaml";
import { renderHealthHtml } from "../commands/health/renderers";
import { renderMetricsHtml } from "../commands/metrics/html-report";
import { assertNever } from "../core/assert";
import { AkmError, UsageError } from "../core/errors";
import { getOutputMode, type OutputFormat, type OutputMode } from "../output/context";
import { renderGenericHtml, renderGenericMarkdown, renderGenericText } from "../output/generic-render";
import { deliverRendered } from "../output/html-render";
import { getMdRendererHandler } from "../output/render-registry";
import { shapeForCommand } from "../output/shapes";
import { formatPlain, outputJsonl } from "../output/text";
import { parseAllFlagValues } from "./invocation";
import { hasSubcommand } from "./parse-args";
⋮----
function classifyExitCode(error: unknown): number
⋮----
function extractHint(error: unknown): string | undefined
⋮----
export function emitJsonError(error: unknown): void
⋮----
export async function runWithJsonErrors(fn: (() => void) | (() => Promise<void>)): Promise<void>
⋮----
export type JsonCommandDef<T extends ArgsDef = ArgsDef> = Omit<CommandDef<T>, "run"> & {

  run?: (context: CommandContext<T>) => void | Promise<void>;
};
⋮----
export function withoutHiddenArgs<T extends object>(command: T): T
⋮----
export function defineJsonCommand<const T extends ArgsDef = ArgsDef>(def: JsonCommandDef<T>): CommandDef<T>
⋮----
function bareGroupUsageError<T extends ArgsDef>(meta: CommandDef<T>["meta"], subcommandSet: Set<string>): never
⋮----
export function defineGroupCommand<const T extends ArgsDef = ArgsDef>(def: {
  meta: CommandDef<T>["meta"];
  args?: T;





  subCommands: Record<string, CommandDef<any>>;

defaultRun?: (context: CommandContext<T>)
⋮----
export function outputWithExitCode(command: string, result: object, exitCode: number | undefined): void
⋮----
export function output(command: string, result: unknown): void
⋮----
type DocumentOutputMode = Pick<OutputMode, "detail" | "shape"> & { format: Exclude<OutputFormat, "jsonl"> };
⋮----
export function renderOutput(command: string, result: unknown, mode: DocumentOutputMode): string
```

## File: src/cli/unknown-flags.ts
```typescript
import { closestMatch } from "../core/closest-match";
import { UsageError } from "../core/errors";
import { warn } from "../core/warn";
import {
  type CittyArgsDefinitionForScan,
  cittyComparableName,
  findCittyTopLevelCommandIndex,
  toAliasArray,
} from "./invocation";
⋮----
export interface FlagScanCommand {
  readonly args?: Record<
    string,
    { readonly type?: string; readonly alias?: string | readonly string[]; readonly hidden?: boolean }
  >;
  readonly subCommands?: Record<string, FlagScanCommand> | undefined;
}
⋮----
interface KnownArgs {

  readonly names: ReadonlySet<string>;

  readonly valueFlags: ReadonlySet<string>;

  readonly booleanFlags: ReadonlySet<string>;

  readonly displayNames: readonly string[];

  readonly path: readonly string[];







  readonly resolved: boolean;
}
⋮----
function collectKnownArgs(root: FlagScanCommand, rawArgs: readonly string[]): KnownArgs
⋮----
function throwUnknownFlag(shown: string, attempted: string, known: KnownArgs): never
⋮----
function warnUnknownFlag(shown: string, known: KnownArgs): void
⋮----
export function assertKnownFlags(root: FlagScanCommand, rawArgs: readonly string[]): void
⋮----
// `--no-foo` is citty's negation of the BOOLEAN `--foo`. Resolving it
// against a value flag would accept `--no-limit`, which citty's own `--no-`
// preprocessing force-sets to `limit: false` (no type check, before
// parseArgs runs) — a boolean reaching a string parser, i.e. an internal
// error (exit 70) instead of the usage error (exit 2) this is here to give.
⋮----
// `workflow run` owns one deliberately dynamic namespace: long options
// become exact-name workflow parameters and are checked against the
// frozen plan before a run is inserted. Short flags remain strict.
⋮----
// Skip a declared value flag's value so `--reason "--x"` is not scanned.
```
