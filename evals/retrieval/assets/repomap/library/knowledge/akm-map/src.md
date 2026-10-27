---
description: "Repo map of akm src at f8f97704: its directories, files and top-level symbols."
generated_from: git:itlackey/akm@f8f97704
---

# src

## src/

### src/api.ts

- `export interface CurateOptions extends RecallOptions`
- `export async function curate(query: string, options: CurateOptions`

### src/cli.ts

- `function applyEarlyStderrFlags(argv: string[]): void`
- `function printSetupTtyHint(result:`
- `function commandHelpTopic(name: string, command: AnyCittyCommand): AnyCittyCommand`
- `function renderExitCodesHelp(): string`
- `export function isTaskRunWithId(argv: readonly string[]): boolean`
- `export function shouldBypassConfigStartup(argv: readonly string[]): boolean`
- `export function isInfoCommand(argv: readonly string[]): boolean`
- `type AnyCittyCommand = CommandDef<any>;`
- `function isCittyCliError(error: unknown): error is Error`
- `function findCittySubCommandByName`
- `function resolveDeepestCittyCommand(cmd: AnyCittyCommand, rawArgs: readonly string[]): AnyCittyCommand`
- `function resolveCittyCommandPath`
- `function buildUsageParentForPath(path: readonly string[]): AnyCittyCommand`
- `function firstSentence(text: string): string`
- `function topLevelCommandDescription(name: string): string`
- `function formatCommandRows(names: readonly string[]): string`
- `function renderCommandSections(): string`
- `async function renderSectionedRootHelp(): Promise<string>`
- `function findUnknownCommandAttempt`
- `function closestCommandMatch(attempted: string, candidates: readonly string[]): string | undefined`
- `function cittyCliErrorUsageCode(error: Error &`
- `function toUsageErrorFromCliError(error: Error, rawArgs: readonly string[]): UsageError`
- `export function normalizeCittyCliError(error: unknown, rawArgs: readonly string[]): unknown`
- `export async function runCli(): Promise<void>`

### src/globals.d.ts

### src/runtime.ts

- `export interface Subprocess`
- `export interface SpawnOptions`
- `export interface SpawnSyncResult`
- `export interface SpawnSyncOptions`
- `export function spawn(cmd: string[], options: SpawnOptions`
- `export function spawnSync(cmd: string[], options: SpawnSyncOptions`
- `function nodeSpawnAdapter(cmd: string[], options: SpawnOptions): Subprocess`
- `function signalNumber(signal: NodeJS.Signals): number`
- `function Writable_toWeb(w: import("node:stream").Writable): unknown`
- `function stdioFor(mode: "inherit" | "pipe" | "ignore" | undefined): "inherit" | "pipe" | "ignore"`
- `export async function readStdin(): Promise<Buffer>`
- `function stdinIterator(): AsyncIterable<Uint8Array>`
- `function writeStreamChunk(out: WriteStream, chunk: Uint8Array): Promise<void>`
- `function endWriteStream(out: WriteStream): Promise<void>`
- `export async function writeResponseToFileCapped`
- `export function sha256Hex(data: string | Uint8Array): string`
- `export function md5Hex(data: string | Uint8Array): string`
- `export function semverOrder(a: string, b: string): -1 | 0 | 1`
- `export function getDirname(importMetaUrl: string): string`
- `export function statfsType(path: string): number | undefined`
- `export function sleepSync(ms: number): void`
- `export function requestGc(): void`
- `export function sleep(ms: number): Promise<void>`
- `interface BunGlobal`
- `function bunGlobal(): BunGlobal`
- `function toBuffer(data: Uint8Array | Buffer | string | null | undefined): Buffer`

### src/version.ts
