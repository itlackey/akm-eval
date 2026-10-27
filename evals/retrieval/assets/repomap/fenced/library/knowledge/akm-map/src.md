---
description: "Repo map of akm src at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# Directory Structure
```
src/
  api.ts
  cli.ts
  globals.d.ts
  runtime.ts
  version.ts
```

# Files

## File: src/api.ts
```typescript
import { renderOutput } from "./cli/shared";
import { runCurate } from "./commands/read/search-cli";
import { loadConfig } from "./core/config/config";
import { UsageError } from "./core/errors";
import { withQuiet } from "./core/warn";
import { installLlmUsagePersistenceIfAbsent } from "./llm/usage-persist";
import { resolveOutputMode } from "./output/context";
import { stdoutText } from "./output/stdout";
import type { RecallOptions } from "./sources/types";
⋮----
export interface CurateOptions extends RecallOptions {

  limit?: number;

  type?: string;

  format?: "text" | "json";
}
⋮----
export async function curate(query: string, options: CurateOptions =
```

## File: src/cli.ts
```typescript
import fs from "node:fs";
import { type ArgsDef, type CommandDef, defineCommand, parseArgs, renderUsage, runCommand, showUsage } from "citty";
import {
  type CittyArgsDefinitionForScan,
  findCittyTopLevelCommandIndex,
  getParsedInvocation,
  parseAllFlagValues,
  resolveHelpMigrateVersionArg,
  setParsedInvocation,
} from "./cli/invocation";
import {
  defineGroupCommand,
  EXIT_CODES,
  emitJsonError,
  GLOBAL_OUTPUT_ARGS,
  output,
  runWithJsonErrors,
  withoutHiddenArgs,
} from "./cli/shared";
import { assertKnownFlags, type FlagScanCommand } from "./cli/unknown-flags";
import { agentCommand, lintCommand } from "./commands/agent/contribute-cli";
import { commandCommand } from "./commands/command/command-cli";
import { generateBashCompletions, installBashCompletions } from "./commands/completions";
import { configCommand } from "./commands/config-cli";
import { envCommand } from "./commands/env/env-cli";
import { secretCommand } from "./commands/env/secret-cli";
import { feedbackCommand } from "./commands/feedback-cli";
import { akmHealth } from "./commands/health";
import { closestMatch } from "./core/closest-match";
⋮----
import type { WindowSpec } from "./commands/health/types";
import { parseWindowSpec } from "./commands/health/windows";
import { improveCommand } from "./commands/improve/improve-cli";
import { metricsCommand } from "./commands/metrics/metrics-cli";
import { migrateCommand } from "./commands/migrate-cli";
import { modelsCommand } from "./commands/models-cli";
import { logCommand } from "./commands/observability-cli";
import { proposalCommand } from "./commands/proposal/proposal-cli";
import { rememberCommand } from "./commands/read/remember-cli";
import { curateCommand, searchCommand, showCommand } from "./commands/read/search-cli";
import { registryCommand } from "./commands/registry-cli";
import { bundleCommand } from "./commands/sources/bundle-cli";
import { renderMigrationHelp } from "./commands/sources/migration-help";
import { cloneCommand, syncCommand, upgradeCommand } from "./commands/sources/sources-cli";
import { importKnowledgeCommand, indexCommand, infoCommand } from "./commands/sources/stash-cli";
import { taskCommand } from "./commands/tasks/tasks-cli";
import { uiCommand } from "./commands/ui/ui-cli";
import { workflowCommand } from "./commands/workflow-cli";
import { DEFAULT_CONFIG, loadConfig } from "./core/config/config";
import { UsageError, type UsageErrorCode } from "./core/errors";
import { launcherPidFromEnv } from "./core/file-lock";
import { startParentDeathWatchdog } from "./core/parent-watchdog";
import { getConfigPath } from "./core/paths";
import { DURATION_UNITS, parseDuration } from "./core/time";
import { plainize } from "./core/tty";
import { info, isQuiet, setQuiet, setVerbose, warn } from "./core/warn";
import { installLlmUsagePersistenceIfAbsent } from "./llm/usage-persist";
import { EMBEDDED_HINTS, EMBEDDED_HINTS_FULL } from "./output/cli-hints";
import { getOutputMode, initOutputMode, parseDetailLevel } from "./output/context";
import { isFormatExemptCommand } from "./output/format-exempt";
import { consumeSchedulerContextArg } from "./tasks/scheduler-invocation";
import { pkgVersion } from "./version";
⋮----
function applyEarlyStderrFlags(argv: string[]): void
⋮----
function printSetupTtyHint(result: {
  bundleDir?: string;
  configPath?: string;
  runs?: { modelCalls: string; agentWork: string; embeddings: string };
}): void
/**
 * Module Naming:
 * - sources/*           : Asset operations (search, show, add, clone)
 * - sources/providers/* : Runtime data source providers (filesystem, git, website, npm)
 * - registry/*          : Discovery from remote registries (npm, GitHub)
 * - installed-stashes   : Unified source operations (list, remove, update)
 */
⋮----
async run(
⋮----
run(
⋮----
function commandHelpTopic(name: string, command: AnyCittyCommand): AnyCittyCommand
⋮----
async run()
⋮----
async defaultRun()
⋮----
function renderExitCodesHelp(): string
⋮----
export function isTaskRunWithId(argv: readonly string[]): boolean
⋮----
export function shouldBypassConfigStartup(argv: readonly string[]): boolean
⋮----
export function isInfoCommand(argv: readonly string[]): boolean
⋮----
type AnyCittyCommand = CommandDef<any>;
⋮----
function isCittyCliError(error: unknown): error is Error
⋮----
function findCittySubCommandByName(
  subCommands: Record<string, AnyCittyCommand>,
  name: string,
): AnyCittyCommand | undefined
⋮----
function resolveDeepestCittyCommand(cmd: AnyCittyCommand, rawArgs: readonly string[]): AnyCittyCommand
⋮----
function resolveCittyCommandPath(
  cmd: AnyCittyCommand,
  rawArgs: readonly string[],
  path: readonly string[] = [],
): string[]
⋮----
function buildUsageParentForPath(path: readonly string[]): AnyCittyCommand
⋮----
function firstSentence(text: string): string
⋮----
function topLevelCommandDescription(name: string): string
⋮----
function formatCommandRows(names: readonly string[]): string
⋮----
function renderCommandSections(): string
⋮----
async function renderSectionedRootHelp(): Promise<string>
⋮----
function findUnknownCommandAttempt(
  rawArgs: readonly string[],
):
⋮----
function closestCommandMatch(attempted: string, candidates: readonly string[]): string | undefined
⋮----
function cittyCliErrorUsageCode(error: Error &
⋮----
function toUsageErrorFromCliError(error: Error, rawArgs: readonly string[]): UsageError
⋮----
/** Normalize citty's private CLIError for the real entrypoint and in-process test harness. */
export function normalizeCittyCliError(error: unknown, rawArgs: readonly string[]): unknown
⋮----
/**
 * The CLI's real startup sequence, extracted into a function so error paths
 * can `return` early — top-level `return` is a syntax error in an ES module,
 * and this used to rely on `emitJsonError`'s `never` return type (a
 * synchronous `process.exit`) to stop execution instead. Now that
 * `emitJsonError` (src/cli/shared.ts, R-067) only records `process.exitCode`
 * and returns, every direct call site here needs its own explicit `return;`
 * to stop the rest of startup from running after a fatal early error.
 */
export async function runCli(): Promise<void>
⋮----
// Mint the ParsedInvocation singleton from the (normalized) argv — the ONE
// place argv is parsed for the whole process (plan §10.7 / chunk-9 WI-9.9).
// Every out-of-cli.ts command module reads argv state through
// `getParsedInvocation()` from here on instead of re-scanning process.argv.
⋮----
// Resolve output mode once at startup from the (normalized) argv and persisted
// config. All subsequent output() calls read from this in-memory singleton.
// `initOutputMode` can throw a UsageError when --format/--detail values are
// invalid; surface it through the same JSON-error path the rest of the CLI uses
// rather than letting the raw exception escape with a stack trace.
⋮----
// Off the bypass allowlist, every command reads config here exactly as
// it always has: an invalid config.json throws, `emitJsonError` reports
// it, and the command never runs — no side effect of its own body ever
// happens (a lock taken, a network call made, a database opened
// read-write). `akm info` is the ONE exception (see `assembleInfo`'s
// doc comment, src/commands/sources/info.ts): only ITS read is
// best-effort, falling back to `DEFAULT_CONFIG.output` instead of
// throwing. Scoped narrowly on purpose — an earlier version of this fix
// made the read best-effort for every command, which silently changed
// outcomes across the CLI (some commands that should refuse at exit 78
// ran anyway; `health`/`index`/`config set`/`feedback` still failed,
// but only after already taking a lock, opening a database read-write,
// or making a network call).
⋮----
// D7 — every command that renders through output() honours all six --format
// values. The declared exempt set (src/output/format-exempt.ts) does not
// render an envelope at all, so warn rather than pretend: silently ignoring
// the flag is what made the old md/html behaviour so hard to discover. A
// warning, not an error, because the flag is harmless here and scripts that
// pass --format globally to a mixed batch of commands should still work.
```

## File: src/globals.d.ts
```typescript

```

## File: src/runtime.ts
```typescript
import { type ChildProcess, spawn as nodeSpawn, spawnSync as nodeSpawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, statfsSync, type WriteStream } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { ResponseTooLargeError, readChunkWithDeadline } from "./core/common";
⋮----
export interface Subprocess {
  readonly stdout: ReadableStream<Uint8Array> | null;
  readonly stderr: ReadableStream<Uint8Array> | null;
  readonly stdin: WritableStream<Uint8Array> | null;
  readonly exited: Promise<number>;
  readonly exitCode: number | null;






  readonly signalCode?: string | null;
  readonly pid?: number;
  kill(signal?: number | string): void;
}
⋮----
kill(signal?: number | string): void;
⋮----
export interface SpawnOptions {
  stdin?: "inherit" | "pipe" | "ignore";
  stdout?: "inherit" | "pipe" | "ignore";
  stderr?: "inherit" | "pipe" | "ignore";
  env?: Record<string, string>;
  cwd?: string;
  detached?: boolean;








  windowsVerbatimArguments?: boolean;
}
⋮----
export interface SpawnSyncResult {
  success: boolean;
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
}
⋮----
export interface SpawnSyncOptions {
  cwd?: string;
  env?: Record<string, string>;
}
⋮----
export function spawn(cmd: string[], options: SpawnOptions =
⋮----
export function spawnSync(cmd: string[], options: SpawnSyncOptions =
⋮----
function nodeSpawnAdapter(cmd: string[], options: SpawnOptions): Subprocess
⋮----
get stdout()
get stderr()
get stdin()
⋮----
get exitCode()
get signalCode()
⋮----
kill(signal?: number | string)
⋮----
function signalNumber(signal: NodeJS.Signals): number
⋮----
function Writable_toWeb(w: import("node:stream").Writable): unknown
⋮----
function stdioFor(mode: "inherit" | "pipe" | "ignore" | undefined): "inherit" | "pipe" | "ignore"
⋮----
export async function readStdin(): Promise<Buffer>
⋮----
function stdinIterator(): AsyncIterable<Uint8Array>
⋮----
function writeStreamChunk(out: WriteStream, chunk: Uint8Array): Promise<void>
⋮----
function endWriteStream(out: WriteStream): Promise<void>
⋮----
export async function writeResponseToFileCapped(
  filePath: string,
  res: Response,
  options?: { maxBytes?: number; bodyTimeoutMs?: number; stallTimeoutMs?: number; signal?: AbortSignal },
): Promise<void>
⋮----
export function sha256Hex(data: string | Uint8Array): string
⋮----
export function md5Hex(data: string | Uint8Array): string
⋮----
export function semverOrder(a: string, b: string): -1 | 0 | 1
⋮----
export function getDirname(importMetaUrl: string): string
⋮----
export function statfsType(path: string): number | undefined
⋮----
export function sleepSync(ms: number): void
⋮----
export function requestGc(): void
⋮----
export function sleep(ms: number): Promise<void>
⋮----
interface BunGlobal {
  spawn(cmd: string[], options: SpawnOptions): Subprocess;
  spawnSync(
    cmd: string[],
    options: SpawnSyncOptions,
  ): { success: boolean; exitCode: number | null; stdout: Uint8Array | Buffer; stderr: Uint8Array | Buffer };
  stdin: { stream(): AsyncIterable<Uint8Array> };
  write(path: string, data: Response): Promise<number>;
  semver: { order(a: string, b: string): -1 | 0 | 1 };
  resolveSync(spec: string, from: string): string;
  sleepSync(ms: number): void;
  sleep(ms: number): Promise<void>;
  main: string;
}
⋮----
spawn(cmd: string[], options: SpawnOptions): Subprocess;
spawnSync(
    cmd: string[],
    options: SpawnSyncOptions,
):
stdin:
write(path: string, data: Response): Promise<number>;
semver:
resolveSync(spec: string, from: string): string;
sleepSync(ms: number): void;
sleep(ms: number): Promise<void>;
⋮----
function bunGlobal(): BunGlobal
⋮----
function toBuffer(data: Uint8Array | Buffer | string | null | undefined): Buffer
```

## File: src/version.ts
```typescript
import fs from "node:fs";
import path from "node:path";
import { getDirname } from "./runtime";
```
