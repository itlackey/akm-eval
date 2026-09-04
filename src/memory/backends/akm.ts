import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BenchmarkRuntimeError, MemoryBackendUnavailableError } from "../../core/errors.ts";
import type {
  MemoryBackend,
  MemoryDocument,
  MemoryHealth,
  MemoryQuery,
  MemorySearchResult,
} from "../types.ts";

/**
 * Real akm CLI memory backend.
 *
 * Every operation shells out to the akm CLI (subprocess form, verified live
 * against akm 0.9.1 — see docs/memory-backends.md for the full trace of
 * verified commands and gotchas this file leans on). Nothing here is
 * simulated: `add`/`search`/`reset` are real `akm remember` / `akm search`
 * / `akm bundle create` + `akm index --full` invocations against a
 * per-instance hermetic akm install, and `healthCheck` genuinely probes the
 * configured akm binary rather than guessing.
 *
 * ## Hermetic root
 *
 * The constructor is given (or invents) a `workDir` and pins all five
 * AKM_* directory env vars underneath it:
 *
 *   <workDir>/bundle  -> AKM_BUNDLE_DIR
 *   <workDir>/config  -> AKM_CONFIG_DIR
 *   <workDir>/data    -> AKM_DATA_DIR
 *   <workDir>/cache   -> AKM_CACHE_DIR
 *   <workDir>/state   -> AKM_STATE_DIR
 *
 * `AKM_FORCE_INIT_TMP_STASH=1` is always set on the child env: `bun test`
 * sets `BUN_TEST=1` on the whole process tree, and akm's
 * `akm bundle create --dir <tmp>` refuses to persist a stash dir under a
 * temp path while a test-runner sentinel is present (verified in akm's own
 * `src/commands/sources/init.ts`). Harmless outside test runs.
 *
 * Before any akm command runs, this backend writes its own
 * `<configDir>/config.json` with `semanticSearchMode: "off"` and
 * `registries: []` — akm's own DEFAULT_CONFIG ships two live registry URLs
 * (github raw + skills.sh), so leaving config.json unwritten would leave a
 * hermetic install pointed at the network even though no command here uses
 * `--from registry`. `configVersion` is pinned to `"0.9.0"`, the schema
 * version this adapter was built and verified against (independent of the
 * akm-cli package semver, which was 0.9.1 at verification time).
 *
 * ## The retrieval ceiling — why `add()` synthesizes frontmatter
 *
 * Verified empirically (see docs/memory-backends.md): akm's FTS and
 * embedding index covers ONLY name, frontmatter `description`, tags,
 * aliases, hints, and in-body markdown headings — never body prose. A term
 * that appears only in a document's body text is unretrievable, full stop.
 * So `add()` cannot just dump `MemoryDocument.text` into a file; it must
 * synthesize the frontmatter/heading surface akm actually indexes. The rule
 * (deterministic, no LLM — see `synthesizeFrontmatter` below):
 *
 *   description = first non-empty sentence(s) of the body, capped at 250 chars
 *   tags        = one `key:value` tag per `MemoryDocument.metadata` entry,
 *                 plus a `sourceId:<doc.id>` tag carrying the original id
 *   heading     = an H1 built from `doc.id`
 *
 * This is the declared synthesis rule and it sets the ceiling of every
 * retrieval metric measured against this backend: a document whose only
 * distinctive term lives past the first sentence of its body, and outside
 * its metadata, will not be retrievable by that term. The bundled
 * integration test asserts exactly this boundary against the real CLI.
 *
 * ## `reset()` strips akm's own seeded skeleton before establishing baseline
 *
 * Verified live against 0.9.1: `akm bundle create` does not produce an empty
 * bundle. It seeds a real, indexed, searchable "conventions" skeleton
 * (`facts/conventions/**`, 12 entries at verification time) documenting
 * akm's own authoring conventions. Left in place, that seeded corpus is
 * indistinguishable from ingested documents: it counts toward
 * `indexStats.entryCount` (so the ingestion-count guard's baseline silently
 * includes it), it is searchable by ordinary queries (`akm search "work"`
 * matches `facts/conventions/assets/workflow`), and any such hit has no
 * entry in this instance's `sourceIndex` — exactly the "hit this instance
 * did not add" case `mapHit` now treats as a hard contamination signal (see
 * below) rather than silently falling back to the akm `ref` as `id`. So
 * `reset()` deletes `<bundleDir>/facts` immediately after `bundle create`
 * and before the baseline `index --full`, making the post-reset baseline
 * genuinely 0 and guaranteeing every subsequent search hit traces back to a
 * document this instance itself wrote. This is verified against 0.9.1's
 * seeded layout specifically (all seeded content lives under `facts/`;
 * `README.md` and `.meta/index.md` are not indexed) — a future akm version
 * that seeds content elsewhere would need this updated accordingly, which is
 * exactly why `mapHit`'s hard-throw fallback exists as defense in depth.
 *
 * ## MemorySearchResult.id is the ORIGINAL document id, not the akm ref
 *
 * A deliberate, documented deviation worth flagging: akm's own `ref` is a
 * stable, freshly-minted identity (`memories/<name>`) that has no relation
 * to the caller's `MemoryDocument.id` (e.g. LoCoMo's `dia_id`). Every other
 * backend in this repo (see `raw-vector.ts`) returns
 * `MemorySearchResult.id === MemoryDocument.id`, and
 * `src/memory/retrieval-metrics.ts#scoreRetrieval` keys precision/recall/MRR
 * on exact equality between `result.id` and the corpus's relevant-id list
 * (e.g. LoCoMo's `question.evidence`, which is a list of `dia_id`s). Mapping
 * `id: ref` here — the literal field name akm's `--shape agent` hit
 * exposes — would silently zero out every retrieval metric for this
 * backend, not because retrieval failed, but because of an id-namespace
 * mismatch. That is exactly the kind of misleading number the project's
 * trust policy rules out. So: `search()` recovers the original document id
 * per hit from this backend instance's own `ref -> sourceId` bookkeeping
 * (populated during `add()`), and carries the akm `ref` forward at
 * `metadata.ref` instead, where it stays available for anyone who wants to
 * `akm show <ref>` a hit by hand.
 *
 * ## `MemorySearchResult.score` is not a calibrated relevance score here
 *
 * Verified live against 0.9.1 with `semanticSearchMode: "off"` (this
 * backend's hermetic default): every hit's `score` in `--shape agent` output
 * is a constant `1`, regardless of query or rank — there is no ranking
 * signal in it under keyword-only search. It is carried straight through
 * unmodified rather than normalized away, because it is a real field on the
 * real akm response (not synthesized), but it must never be compared against
 * another backend's score in the same table: `raw-vector`'s `score` is a
 * genuine cosine similarity in `[0,1]`; akm's is not. A future config that
 * flips `semanticSearchMode` to `"auto"` may see non-constant scores; this
 * comment describes the shipped hermetic default only.
 *
 * ## The declared query-transform (part of the same retrieval ceiling)
 *
 * akm's FTS is a strict conjunctive AND over every token of the query — no
 * OR, no stemming exposed through the CLI (`src/indexer/search/fts-query.ts`
 * in akm's own source). Passing a raw natural-language question straight
 * through (e.g. LoCoMo's "What is the name of Melanie's dog?") means every
 * filler word ("what", "is", "the", "of") must ALSO appear in the target
 * document's synthesized description/tags/heading, which it typically does
 * not — measured empirically at a ~100% zero-hit rate on LoCoMo-shaped
 * questions against a small hermetic corpus. `search()` therefore applies
 * `buildAkmSearchQuery` (below): a fixed, deterministic English stopword
 * strip before the query reaches `akm search`. This is a genuine, measured
 * improvement (the same probe corpus drops from 6/6 to 1/6 zero-hit after
 * stripping), not a full fix — a content-word mismatch between question
 * phrasing and the synthesized description (e.g. "go" vs "went") is still
 * an AND-conjunctive failure this transform cannot repair. That residual
 * ceiling is why callers must track and disclose a zero-hit-query count
 * alongside every akm-backed run rather than relying on this transform
 * alone (see `docs/memory-backends.md` and the locomo/longmemeval adapters'
 * `result.json.metadata` for the disclosed counters).
 *
 * `semanticSearchMode: "auto"` + `AKM_EMBED_DETERMINISTIC=1` was evaluated
 * as an alternative and rejected for the shipped default: verified live, it
 * does NOT reliably fix the zero-hit problem (the same probe corpus was
 * still 4/6 zero-hit after forcing a full reindex so embeddings existed) —
 * the deterministic embedder is a crude shared-vocabulary hash, not a
 * semantic model, and short QA-style text does not reliably survive it. It
 * also introduces a correctness trap of its own: `akm remember` (the
 * single-document path) indexes FTS on write but does NOT build embeddings
 * on write, verified live — only a subsequent `index --full` does. This
 * backend's single-doc `add()` path deliberately skips that extra
 * `index --full` (see `rememberSingle` below) as a real cost optimization,
 * which would silently leave single-document adds without embeddings under
 * `"auto"`. Keeping `semanticSearchMode: "off"` avoids depending on that
 * distinction. Revisit if a future need justifies the added complexity.
 */

// ── Tunables ─────────────────────────────────────────────────────────────────

const DEFAULT_AKM_COMMAND = ["akm"];
/** Schema version (`configVersion`) this adapter is written and verified against. */
const HERMETIC_CONFIG_VERSION = "0.9.0";
/** akm's own `search --limit` hard cap (verified: akm silently clamps to this). */
const MAX_SEARCH_LIMIT = 200;
/** Cap on the body text returned per search hit, applied after frontmatter/heading stripping. */
const MAX_RESULT_TEXT_CHARS = 20_000;
/** Cap on the synthesized `description` frontmatter field. */
const MAX_SYNTHESIZED_DESCRIPTION_CHARS = 250;
/** Tag prefix carrying the original `MemoryDocument.id` through akm's tag surface. */
const SOURCE_ID_TAG_PREFIX = "sourceId:";

// ── akm command resolution ──────────────────────────────────────────────────

export interface AkmCommandResolution {
  ok: true;
  cmd: string[];
}

export interface AkmCommandFailure {
  ok: false;
  detail: string;
}

/**
 * Resolve the akm CLI invocation from `AKM_EVAL_AKM_CMD` — a JSON array of
 * strings, e.g. `["akm"]` or `["bun", "/home/user/akm/src/cli.ts"]`. Defaults
 * to `["akm"]`. Never throws: a malformed env var is reported as a failed
 * resolution so callers (in particular `doctor`, which health-checks every
 * registered backend regardless of which one a run actually selected) can
 * surface a warning instead of crashing.
 */
export function resolveAkmCommand(
  env: NodeJS.ProcessEnv = process.env,
): AkmCommandResolution | AkmCommandFailure {
  const raw = env.AKM_EVAL_AKM_CMD;
  if (raw === undefined || raw.trim().length === 0) {
    return { ok: true, cmd: [...DEFAULT_AKM_COMMAND] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      ok: false,
      detail: `AKM_EVAL_AKM_CMD must be a JSON array of strings (e.g. ["akm"] or ["bun","/home/user/akm/src/cli.ts"]); failed to parse: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((entry) => typeof entry === "string" && entry.length > 0)
  ) {
    return {
      ok: false,
      detail: "AKM_EVAL_AKM_CMD must be a non-empty JSON array of non-empty strings.",
    };
  }

  return { ok: true, cmd: parsed as string[] };
}

// ── Hermetic directory layout ────────────────────────────────────────────────

export interface AkmHermeticDirs {
  bundleDir: string;
  configDir: string;
  dataDir: string;
  cacheDir: string;
  stateDir: string;
}

export function deriveHermeticDirs(workDir: string): AkmHermeticDirs {
  return {
    bundleDir: path.join(workDir, "bundle"),
    configDir: path.join(workDir, "config"),
    dataDir: path.join(workDir, "data"),
    cacheDir: path.join(workDir, "cache"),
    stateDir: path.join(workDir, "state"),
  };
}

function ensureHermeticDirs(dirs: AkmHermeticDirs): void {
  for (const dir of Object.values(dirs)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hermeticConfigJson(): string {
  return `${JSON.stringify({ configVersion: HERMETIC_CONFIG_VERSION, semanticSearchMode: "off", registries: [] }, null, 2)}\n`;
}

function writeHermeticConfig(dirs: AkmHermeticDirs): void {
  fs.writeFileSync(path.join(dirs.configDir, "config.json"), hermeticConfigJson(), "utf8");
}

/**
 * akm 0.9.1 reads roughly four dozen distinct `AKM_*` environment variables
 * (verified: `grep -rhoE '\bAKM_[A-Z0-9_]+' src | sort -u` against the akm
 * source), only five of which this backend deliberately pins (the four
 * hermetic directories plus `AKM_FORCE_INIT_TMP_STASH`). Spreading
 * `...process.env` unfiltered would let an operator's ambient shell — stray
 * `AKM_DEBUG`/`AKM_VERBOSE` (which break `parseJsonStdout` by adding
 * non-JSON stdout noise), `AKM_SKILL_DIRS`/`AKM_SKIP_DIRS` (which change what
 * gets indexed and trip the ingestion-count guard), `AKM_REGISTRY_URL`,
 * `AKM_EMBED_API_KEY`, `AKM_LLM_BASE_URL`, `AKM_SQLITE_JOURNAL_MODE`, etc. —
 * silently change what a "hermetic" run measures. Every ambient `AKM_*` is
 * stripped first; the five pinned vars are then set unconditionally so this
 * backend's own choices always win regardless of strip order.
 */
function buildHermeticEnv(dirs: AkmHermeticDirs): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^AKM_/.test(key)) continue;
    env[key] = value;
  }
  return {
    ...env,
    AKM_BUNDLE_DIR: dirs.bundleDir,
    AKM_CONFIG_DIR: dirs.configDir,
    AKM_DATA_DIR: dirs.dataDir,
    AKM_CACHE_DIR: dirs.cacheDir,
    AKM_STATE_DIR: dirs.stateDir,
    AKM_FORCE_INIT_TMP_STASH: "1",
  };
}

// ── Subprocess plumbing ──────────────────────────────────────────────────────

interface AkmInvocation {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** `spawnSync`'s own error (e.g. ENOENT when the command isn't on PATH), if the process never ran at all. */
  spawnError?: string;
}

/**
 * Resolve the cwd to spawn the akm command from.
 *
 * When `cmd`'s last entry is an existing file on disk — the
 * `["bun", "/path/to/cli.ts"]` source-checkout form `AKM_EVAL_AKM_CMD`
 * documents — bun's own module resolution needs to walk up from THAT file's
 * own directory tree to find its `node_modules`/`bun.lock`. Spawning it with
 * akm-eval's own rootDir as cwd instead fails with
 * `ENOENT while resolving package '<dep>'`, even though the akm CLI itself
 * is perfectly reachable — verified empirically against a source checkout
 * with no host-global akm install (`bun /path/to/cli.ts --version` succeeds
 * with cwd inside that checkout, fails with cwd set to an unrelated
 * project). A bare command (`["akm"]`, an installed binary) has no such
 * dependency-resolution concern, so it keeps the caller-supplied cwd.
 */
export function resolveAkmCwd(cmd: string[], fallbackCwd: string): string {
  const last = cmd[cmd.length - 1];
  if (last) {
    try {
      if (fs.statSync(last).isFile()) return path.dirname(last);
    } catch {
      // Not an existing file path (e.g. a bare command like "akm") — fall through.
    }
  }
  return fallbackCwd;
}

function invokeAkm(
  cmd: string[],
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd: string,
): AkmInvocation {
  const [command, ...prefixArgs] = cmd;
  const result = spawnSync(command as string, [...prefixArgs, ...args], {
    cwd: resolveAkmCwd(cmd, cwd),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    success: result.status === 0 && !result.error,
    exitCode: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    spawnError: result.error ? result.error.message : undefined,
  };
}

function describeFailure(action: string, invocation: AkmInvocation): string {
  const detail =
    invocation.spawnError ||
    invocation.stderr.trim() ||
    invocation.stdout.trim() ||
    `exit code ${invocation.exitCode ?? "unknown"}`;
  return `${action} failed (exit ${invocation.exitCode ?? "unknown"}): ${detail}`;
}

function parseJsonStdout<T>(action: string, invocation: AkmInvocation): T {
  try {
    return JSON.parse(invocation.stdout) as T;
  } catch (error) {
    throw new BenchmarkRuntimeError(
      `${action} returned output that was not valid JSON (${error instanceof Error ? error.message : String(error)}). ` +
        `stdout: ${invocation.stdout.slice(0, 500)}`,
    );
  }
}

// ── Version probe ────────────────────────────────────────────────────────────

/** `^0.9` in npm-caret terms on a 0.x base: major 0, minor exactly 9 (any patch). */
export function satisfiesCaretZeroNine(version: string): boolean {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  return Number(match[1]) === 0 && Number(match[2]) === 9;
}

/**
 * A cheap health probe: `<cmd> --version` plus `<cmd> info --format json`
 * against a scratch hermetic root that need not be (and is not) a
 * `bundle create`-initialized bundle — verified live that `akm info` works
 * against any existing, empty `AKM_BUNDLE_DIR`. Never throws; always returns
 * a `MemoryHealth`, warn-with-actionable-detail on any failure.
 */
export function probeAkmHealth(cmd: string[], scratchDir: string, cwd: string): MemoryHealth {
  const dirs = deriveHermeticDirs(scratchDir);
  try {
    ensureHermeticDirs(dirs);
    writeHermeticConfig(dirs);
  } catch (error) {
    return {
      status: "warn",
      detail: `could not prepare a scratch hermetic root at ${scratchDir} for the akm health probe: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const env = buildHermeticEnv(dirs);

  const versionResult = invokeAkm(cmd, ["--version"], env, cwd);
  if (!versionResult.success) {
    return {
      status: "warn",
      detail: `akm CLI not reachable via ${JSON.stringify(cmd)} (set AKM_EVAL_AKM_CMD to override). ${describeFailure("akm --version", versionResult)}`,
    };
  }

  const version = versionResult.stdout.trim();
  if (!satisfiesCaretZeroNine(version)) {
    return {
      status: "warn",
      detail:
        `akm CLI at ${JSON.stringify(cmd)} reports version "${version}", which does not satisfy the pinned range ^0.9. ` +
        `This adapter targets akm-cli 0.9.x / configVersion ${HERMETIC_CONFIG_VERSION}.`,
    };
  }

  const infoResult = invokeAkm(cmd, ["info", "--format", "json"], env, cwd);
  if (!infoResult.success) {
    return {
      status: "warn",
      detail: `akm CLI ${version} responded to --version but \`akm info --format json\` failed. ${describeFailure("akm info", infoResult)}`,
    };
  }

  return {
    status: "ok",
    detail: `akm CLI ${version} reachable via ${JSON.stringify(cmd)}; \`akm info --format json\` responded successfully.`,
  };
}

// ── Deterministic frontmatter synthesis (the declared retrieval ceiling) ────

export interface SynthesizedFrontmatter {
  description: string;
  tags: string[];
  heading: string;
}

/**
 * Split `text` into sentence-shaped chunks on `.`/`!`/`?`, swallowing any
 * immediately-trailing closing quotes/brackets/repeated terminators into the
 * same sentence (so `Alice said, "hi there."` ends the sentence at the
 * closing quote, not the period) — a real shape in LoCoMo's
 * `speaker said, "text."` turn formatting, not an edge case.
 */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === "." || ch === "!" || ch === "?") {
      let end = i + 1;
      while (end < text.length && /["'”’)\]!?.]/.test(text.charAt(end))) end += 1;
      sentences.push(text.slice(start, end));
      while (end < text.length && /\s/.test(text.charAt(end))) end += 1;
      start = end;
      i = end;
      continue;
    }
    i += 1;
  }
  if (start < text.length) sentences.push(text.slice(start));
  return sentences;
}

/**
 * First non-empty sentence(s) of `text`, capped at `capChars`. Accumulates
 * whole sentences until the next one would exceed the cap, then stops; if
 * the very first sentence alone exceeds the cap, hard-truncates it. Pure,
 * deterministic, no LLM — this is the synthesis rule that sets akm's
 * retrieval ceiling for every document this backend ingests.
 */
export function firstSentencesCapped(
  text: string,
  capChars = MAX_SYNTHESIZED_DESCRIPTION_CHARS,
): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  let out = "";
  for (const raw of splitIntoSentences(trimmed)) {
    const sentence = raw.trim();
    if (!sentence) continue;
    const candidate = out ? `${out} ${sentence}` : sentence;
    if (candidate.length > capChars) {
      if (!out) {
        return `${candidate.slice(0, Math.max(0, capChars - 1)).trimEnd()}…`;
      }
      break;
    }
    out = candidate;
  }
  return out;
}

/** One `key:value` tag per non-empty `MemoryDocument.metadata` entry. */
export function metadataToTags(metadata?: MemoryDocument["metadata"]): string[] {
  if (!metadata) return [];
  const tags: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    tags.push(`${key}:${value}`);
  }
  return tags;
}

export function synthesizeFrontmatter(doc: MemoryDocument): SynthesizedFrontmatter {
  return {
    description: firstSentencesCapped(doc.text),
    tags: [`${SOURCE_ID_TAG_PREFIX}${doc.id}`, ...metadataToTags(doc.metadata)],
    heading: doc.id.replace(/\r?\n/g, " ").trim() || "untitled",
  };
}

/** Frontmatter block for the bulk (direct file-write) path. JSON-valued so it round-trips losslessly without a YAML parser. */
export function buildFrontmatterBlock(fm: SynthesizedFrontmatter): string {
  const lines: string[] = [];
  if (fm.description) lines.push(`description: ${JSON.stringify(fm.description)}`);
  if (fm.tags.length > 0) lines.push(`tags: ${JSON.stringify(fm.tags)}`);
  return lines.length > 0 ? `---\n${lines.join("\n")}\n---` : "---\n---";
}

/** Deterministic, collision-resistant flat asset name for a document id. */
export function slugifyDocId(id: string): string {
  const base = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const hash = createHash("sha1").update(id).digest("hex").slice(0, 8);
  return base ? `${base}-${hash}` : `doc-${hash}`;
}

const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/**
 * Strip a leading `---...---` frontmatter block and, if present, the H1
 * heading line this backend injects, returning the document body as close
 * to the original `MemoryDocument.text` as the round trip allows. Purely
 * structural (looks for the delimiter shape, never parses YAML values), so
 * it works identically on files written by this backend's own bulk path and
 * on files written by `akm remember`'s CLI-side YAML serializer.
 */
export function stripFrontmatterAndOptionalHeading(raw: string): string {
  const withoutFrontmatter = raw.replace(FRONTMATTER_BLOCK, "");
  const lines = withoutFrontmatter.split(/\r?\n/);
  let idx = 0;
  while (idx < lines.length && lines[idx]?.trim().length === 0) idx += 1;
  if (idx < lines.length && /^#\s+\S/.test(lines[idx] ?? "")) {
    idx += 1;
    while (idx < lines.length && lines[idx]?.trim().length === 0) idx += 1;
    return lines.slice(idx).join("\n");
  }
  return withoutFrontmatter.replace(/^\r?\n+/, "");
}

export function clampSearchLimit(topK: number): number {
  if (!Number.isFinite(topK) || topK <= 0) return 1;
  return Math.min(Math.floor(topK), MAX_SEARCH_LIMIT);
}

/**
 * Fixed, deterministic English stopword/filler-word list for
 * `buildAkmSearchQuery`. Deliberately small and conservative (function words
 * only, no domain vocabulary) so it never strips a term a document's
 * synthesized description might actually need to match on.
 */
const AKM_QUERY_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "what",
  "who",
  "whom",
  "which",
  "when",
  "where",
  "why",
  "how",
  "do",
  "does",
  "did",
  "doing",
  "has",
  "have",
  "had",
  "of",
  "on",
  "in",
  "at",
  "to",
  "for",
  "from",
  "by",
  "with",
  "about",
  "as",
  "into",
  "through",
  "and",
  "or",
  "but",
  "if",
  "so",
  "than",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "i",
  "you",
  "he",
  "she",
  "they",
  "we",
  "him",
  "her",
  "them",
  "his",
  "their",
  "our",
  "my",
  "your",
  "not",
  "no",
]);

/**
 * Deterministically strip filler words from a raw natural-language query
 * before it reaches `akm search`, mitigating (not eliminating — see the
 * class header comment above) akm's conjunctive-AND FTS ceiling. Pure, no
 * LLM, order-preserving. Falls back to the original text if stripping would
 * leave nothing (an all-stopword query, or one with no alphabetic tokens at
 * all) so a search is never sent empty.
 */
export function buildAkmSearchQuery(rawText: string): string {
  const tokens = rawText.split(/\s+/).filter((token) => token.length > 0);
  const kept = tokens.filter((token) => {
    const bare = token.replace(/[^a-zA-Z0-9']/g, "");
    return bare.length === 0 || !AKM_QUERY_STOPWORDS.has(bare.toLowerCase());
  });
  const transformed = kept.join(" ").trim();
  return transformed.length > 0 ? transformed : rawText;
}

// ── Search hit shape (--shape agent) ─────────────────────────────────────────

interface AgentSearchHit {
  name?: unknown;
  ref?: unknown;
  type?: unknown;
  path?: unknown;
  description?: unknown;
  score?: unknown;
  estimatedTokens?: unknown;
}

/**
 * #937 adds safe, opaque Markdown fragment selectors to ordinary search refs.
 * The evaluator only accepts the selector form AKM emits; a general `#...`
 * suffix is never treated as proof that an otherwise unknown hit is ours.
 */
const AKM_FRAGMENT_REF = /^(?<parent>[^#]+)#akm-fragment-[1-9][0-9]*-[a-f0-9]{12}$/;

// ── Runtime ──────────────────────────────────────────────────────────────────

interface PreparedWrite {
  doc: MemoryDocument;
  name: string;
  frontmatter: SynthesizedFrontmatter;
  ref: string;
  filePath: string;
}

interface SourceRecord {
  sourceId: string;
  metadata?: MemoryDocument["metadata"];
}

/** Test/probe-only projection for the generated storage name/path. It never
 * changes caller identity, synthesized tags, heading, body, or metadata. */
export interface AkmBackendOptions {
  storageNameForDocument?: (document: MemoryDocument, index: number) => string;
}

function safeStorageName(name: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new BenchmarkRuntimeError(
      `storageNameForDocument must return a safe flat lowercase name, got ${JSON.stringify(name)}`,
    );
  }
  return name;
}

class AkmRuntime {
  private readonly dirs: AkmHermeticDirs;
  private readonly env: NodeJS.ProcessEnv;
  private readonly cmdResolution: AkmCommandResolution | AkmCommandFailure;
  private ready = false;
  private readonly sourceIndex = new Map<string, SourceRecord>();

  constructor(
    private readonly workDir: string,
    private readonly cwd: string,
    env: NodeJS.ProcessEnv = process.env,
    private readonly options: AkmBackendOptions = {},
  ) {
    this.cmdResolution = resolveAkmCommand(env);
    this.dirs = deriveHermeticDirs(workDir);
    this.env = buildHermeticEnv(this.dirs);
  }

  private requireCmd(): string[] {
    if (!this.cmdResolution.ok) {
      throw new MemoryBackendUnavailableError("akm", this.cmdResolution.detail);
    }
    return this.cmdResolution.cmd;
  }

  private requireReady(): void {
    if (!this.ready) {
      throw new BenchmarkRuntimeError(
        "akm memory backend used before reset(); call reset() first to create the hermetic bundle.",
      );
    }
  }

  private run(cmd: string[], args: string[]): AkmInvocation {
    return invokeAkm(cmd, args, this.env, this.cwd);
  }

  private readEntryCount(cmd: string[]): number {
    const infoResult = this.run(cmd, ["info", "--format", "json"]);
    if (!infoResult.success) {
      throw new BenchmarkRuntimeError(describeFailure("akm info", infoResult));
    }
    const info = parseJsonStdout<{ indexStats?: { entryCount?: number } }>("akm info", infoResult);
    return typeof info.indexStats?.entryCount === "number" ? info.indexStats.entryCount : 0;
  }

  private runIndexFull(cmd: string[]): number {
    const indexResult = this.run(cmd, ["index", "--full", "--format", "json"]);
    if (!indexResult.success) {
      throw new BenchmarkRuntimeError(describeFailure("akm index --full", indexResult));
    }
    const response = parseJsonStdout<{ totalEntries?: number }>("akm index --full", indexResult);
    return typeof response.totalEntries === "number"
      ? response.totalEntries
      : this.readEntryCount(cmd);
  }

  healthCheck(): MemoryHealth {
    if (!this.cmdResolution.ok) {
      return { status: "warn", detail: this.cmdResolution.detail };
    }
    return probeAkmHealth(
      this.cmdResolution.cmd,
      path.join(this.workDir, ".health-probe"),
      this.cwd,
    );
  }

  /**
   * `akm bundle create` seeds a real, searchable "conventions" skeleton
   * under `facts/` (verified live against 0.9.1 — see the class header
   * comment). Delete it so the hermetic bundle actually starts empty: no
   * seeded content in the ingestion-count baseline, and no seeded content
   * ever reachable by `search()`. Safe to call unconditionally — `rmSync`
   * with `force: true` is a no-op if the directory does not exist (e.g. a
   * future akm version that ships no skeleton at all).
   */
  private stripSeededSkeleton(): void {
    fs.rmSync(path.join(this.dirs.bundleDir, "facts"), { recursive: true, force: true });
  }

  /**
   * Tear down and recreate the hermetic root, then `akm bundle create
   * --dir <bundleDir> --set-default`, strip akm's own seeded skeleton
   * content (see `stripSeededSkeleton`), and `akm index --full`. This is the
   * documented per-instance/per-call cost of `reset()` — every call spawns
   * two akm subprocesses and rebuilds the bundle from scratch. Callers that
   * reset once per corpus sample (e.g. the locomo pack) pay this cost once
   * per sample; that is expected, not a bug.
   */
  async reset(): Promise<void> {
    const cmd = this.requireCmd();
    this.ready = false;
    this.sourceIndex.clear();

    fs.rmSync(this.workDir, { recursive: true, force: true });
    ensureHermeticDirs(this.dirs);
    writeHermeticConfig(this.dirs);

    const createResult = this.run(cmd, [
      "bundle",
      "create",
      "--dir",
      this.dirs.bundleDir,
      "--set-default",
      "--format",
      "json",
    ]);
    if (!createResult.success) {
      throw new BenchmarkRuntimeError(describeFailure("akm bundle create", createResult));
    }

    this.stripSeededSkeleton();
    this.runIndexFull(cmd);
    this.ready = true;
  }

  private prepareWrite(doc: MemoryDocument, index: number): PreparedWrite {
    const name = safeStorageName(
      this.options.storageNameForDocument?.(doc, index) ?? slugifyDocId(doc.id),
    );
    const frontmatter = synthesizeFrontmatter(doc);
    return {
      doc,
      name,
      frontmatter,
      ref: `memories/${name}`,
      filePath: path.join(this.dirs.bundleDir, "memories", `${name}.md`),
    };
  }

  private rememberSingle(cmd: string[], write: PreparedWrite): void {
    const content = `# ${write.frontmatter.heading}\n\n${write.doc.text}`;
    const args = ["remember", content, "--name", write.name, "--force", "--format", "json"];
    if (write.frontmatter.description) args.push("--description", write.frontmatter.description);
    for (const tag of write.frontmatter.tags) args.push("--tag", tag);

    const result = this.run(cmd, args);
    if (!result.success) {
      throw new BenchmarkRuntimeError(describeFailure(`akm remember ("${write.doc.id}")`, result));
    }
    const response = parseJsonStdout<{ ok?: boolean; ref?: string }>("akm remember", result);
    if (!response.ok || typeof response.ref !== "string" || !response.ref) {
      throw new BenchmarkRuntimeError(
        `akm remember for document "${write.doc.id}" did not return an ok ref. Response: ${result.stdout.slice(0, 500)}`,
      );
    }
    write.ref = response.ref;
  }

  /**
   * Bulk path: write every document as a `.md` file directly (one
   * synthesized frontmatter block + H1 heading + body each), then a single
   * `akm index --full` picks all of them up — one reindex instead of N
   * `akm remember` calls, each of which reindexes on write.
   */
  private writeBulk(writes: PreparedWrite[]): void {
    const memoriesDir = path.join(this.dirs.bundleDir, "memories");
    fs.mkdirSync(memoriesDir, { recursive: true });
    for (const write of writes) {
      const block = buildFrontmatterBlock(write.frontmatter);
      const content = `${block}\n\n# ${write.frontmatter.heading}\n\n${write.doc.text}\n`;
      fs.writeFileSync(write.filePath, content, "utf8");
    }
  }

  async add(documents: MemoryDocument[]): Promise<void> {
    const cmd = this.requireCmd();
    this.requireReady();
    if (documents.length === 0) return;

    const before = this.readEntryCount(cmd);
    const writes = documents.map((doc, index) => this.prepareWrite(doc, index));
    const names = new Map<string, string>();
    for (const write of writes) {
      const existing = names.get(write.name);
      if (existing !== undefined && existing !== write.doc.id) {
        throw new BenchmarkRuntimeError(
          `storageNameForDocument collision: ${JSON.stringify(existing)} and ${JSON.stringify(write.doc.id)} both map to ${JSON.stringify(write.name)}`,
        );
      }
      names.set(write.name, write.doc.id);
    }

    if (writes.length === 1) {
      // No `akm index` call here in the common case: `akm remember` indexes
      // on write, verified live against 0.9.1 (`akm info`'s
      // indexStats.entryCount increments and the new asset is immediately
      // searchable without any index pass). The bulk branch below does need
      // one, because files written directly to the bundle bypass the CLI
      // entirely.
      const only = writes[0];
      if (only === undefined)
        throw new BenchmarkRuntimeError("akm add(): writes[0] missing on the single-document path");
      this.rememberSingle(cmd, only);
    } else {
      this.writeBulk(writes);
      this.runIndexFull(cmd);
    }

    // Distinct ids, NOT documents.length. `slugifyDocId` maps a document id to
    // a filename, so two documents sharing an id write the same file and akm
    // ends up holding one entry for them -- correct upsert semantics, and the
    // same thing raw-vector's id-keyed Map does. Counting documents instead
    // encoded an unstated precondition (ids are unique) and reported its
    // violation as data loss: the upstream LongMemEval dataset repeats a
    // filler session id in 13 of its 500 questions (identical turns, differing
    // only in haystack_dates), which made this throw on a run where nothing
    // had actually gone wrong. The assertion still fails loudly for the case
    // it exists to catch -- a document that failed to write or index.
    const expectedDistinctIds = new Set(documents.map((document) => document.id)).size;
    const expected = before + expectedDistinctIds;
    let after = this.readEntryCount(cmd);
    if (after !== expected && writes.length === 1) {
      // Verified live against 0.9.1: `akm remember`'s index-on-write does
      // NOT reliably apply for the first document written into a bundle
      // whose most recent `index --full` ran against zero markdown files —
      // exactly the state `reset()` leaves things in after stripping akm's
      // seeded skeleton (see the class header comment). A second single-doc
      // `remember` in the same session, once the index already holds a real
      // entry, indexes on write correctly with no such gap. Rather than pay
      // an extra `index --full` on every single-doc add() to work around a
      // quirk that only bites the first one, retry with an explicit
      // reindex ONLY on a mismatch, then re-check before failing loudly.
      this.runIndexFull(cmd);
      after = this.readEntryCount(cmd);
    }
    if (after !== expected) {
      throw new BenchmarkRuntimeError(
        `akm ingestion count mismatch after add(): expected entryCount ${expected} (before=${before} + ${expectedDistinctIds} distinct id(s) across ${documents.length} document(s)), got ${after}. Some documents may have failed to write or index; refusing to proceed silently.`,
      );
    }

    for (const write of writes) {
      this.sourceIndex.set(write.ref, { sourceId: write.doc.id, metadata: write.doc.metadata });
    }
  }

  private readHitText(hitPath: unknown): string {
    if (typeof hitPath !== "string" || !hitPath) {
      throw new BenchmarkRuntimeError(
        "akm search hit is missing a usable `path`; cannot read its content.",
      );
    }
    let raw: string;
    try {
      raw = fs.readFileSync(hitPath, "utf8");
    } catch (error) {
      throw new BenchmarkRuntimeError(
        `failed to read akm search hit content at ${hitPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const body = stripFrontmatterAndOptionalHeading(raw);
    return body.length > MAX_RESULT_TEXT_CHARS ? `${body.slice(0, MAX_RESULT_TEXT_CHARS)}…` : body;
  }

  /**
   * `reset()` strips akm's seeded skeleton and every `add()` records its own
   * writes in `sourceIndex`, so in the steady state a hit whose `ref` is
   * unknown to this instance is not "pre-existing content" to shrug off — it
   * is a contamination signal: either the seeded-skeleton strip missed
   * something (a future akm version seeding content outside `facts/`), or
   * something else wrote into this hermetic bundle. Falling back to `ref` as
   * `id` would silently hand the caller a foreign id in the same namespace as
   * the corpus's real ids (e.g. LoCoMo `dia_id`s), which is exactly the kind
   * of misleading number the project's trust policy rules out — so this
   * throws instead.
   */
  private readFragmentHitText(cmd: string[], ref: string): string {
    const result = this.run(cmd, ["show", ref, "--format", "json"]);
    if (!result.success) {
      throw new BenchmarkRuntimeError(describeFailure(`akm show ("${ref}")`, result));
    }
    const response = parseJsonStdout<{ content?: unknown }>("akm show", result);
    if (typeof response.content !== "string") {
      throw new BenchmarkRuntimeError(
        `akm show for fragment hit "${ref}" did not return string content; refusing to substitute the parent document.`,
      );
    }
    return response.content.length > MAX_RESULT_TEXT_CHARS
      ? `${response.content.slice(0, MAX_RESULT_TEXT_CHARS)}…`
      : response.content;
  }

  private mapHit(hit: AgentSearchHit, cmd: string[]): MemorySearchResult {
    const ref = typeof hit.ref === "string" ? hit.ref : "";
    if (!ref) {
      throw new BenchmarkRuntimeError(
        `akm search returned a hit without a \`ref\` (name=${JSON.stringify(hit.name)}). This should never happen with --shape agent; never call akm search with --detail normal, which is documented to silently drop ref.`,
      );
    }

    const fragmentMatch = AKM_FRAGMENT_REF.exec(ref);
    const parentRef = fragmentMatch?.groups?.parent ?? ref;
    const known = this.sourceIndex.get(parentRef);
    if (!known) {
      throw new BenchmarkRuntimeError(
        `akm search returned a hit (ref=${ref}) that this instance never added. This hermetic bundle should contain only documents this backend instance wrote via add() — reset() strips akm's own seeded skeleton content, so an unrecognized ref here is a contamination signal, not pre-existing content to fall back on.`,
      );
    }
    const text = fragmentMatch ? this.readFragmentHitText(cmd, ref) : this.readHitText(hit.path);

    return {
      id: known.sourceId,
      score: typeof hit.score === "number" ? hit.score : 0,
      text,
      metadata: {
        ...(known.metadata as Record<string, string | number | boolean | null> | undefined),
        ref,
        ...(typeof hit.name === "string" ? { akmName: hit.name } : {}),
        ...(typeof hit.type === "string" ? { akmType: hit.type } : {}),
      },
    };
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const cmd = this.requireCmd();
    this.requireReady();

    const limit = clampSearchLimit(query.topK);
    if (Number.isFinite(query.topK) && query.topK > MAX_SEARCH_LIMIT) {
      console.warn(
        `akm backend: search topK=${query.topK} exceeds akm's own --limit cap of ${MAX_SEARCH_LIMIT}; clamping to ` +
          `${MAX_SEARCH_LIMIT}. A topK sweep that crosses this boundary will silently compare mismatched effective limits.`,
      );
    }
    const akmQuery = buildAkmSearchQuery(query.text);
    const result = this.run(cmd, [
      "search",
      akmQuery,
      "--limit",
      String(limit),
      "--shape",
      "agent",
      "--format",
      "json",
    ]);
    if (!result.success) {
      throw new BenchmarkRuntimeError(describeFailure(`akm search ("${akmQuery}")`, result));
    }

    const response = parseJsonStdout<{ hits?: AgentSearchHit[] }>("akm search", result);
    const hits = Array.isArray(response.hits) ? response.hits : [];
    return hits.map((hit) => this.mapHit(hit, cmd));
  }
}

// ── Public factory ───────────────────────────────────────────────────────────

/**
 * A unique-but-not-yet-created scratch work dir under the OS temp dir. Not
 * `fs.mkdtempSync`, deliberately: that creates the directory as a side
 * effect of merely resolving a path, and `createAkmBackend()` (with no
 * explicit `workDir`) is called on every `doctor` invocation just to compute
 * status — accumulating an abandoned empty temp directory per call would be
 * pure waste. Directory creation is deferred to wherever it is actually
 * needed (`reset()` / the health probe), both of which already `mkdir -p`.
 */
function generateScratchWorkDir(): string {
  return path.join(os.tmpdir(), `akm-eval-akm-${randomBytes(8).toString("hex")}`);
}

export function createAkmBackend(
  rootDir = process.cwd(),
  workDir?: string,
  options?: AkmBackendOptions,
): MemoryBackend {
  const resolvedWorkDir = workDir ?? generateScratchWorkDir();
  const runtime = new AkmRuntime(resolvedWorkDir, rootDir, process.env, options);

  return {
    id: "akm",
    kind: "external",
    add: (documents: MemoryDocument[]) => runtime.add(documents),
    search: (query: MemoryQuery) => runtime.search(query),
    reset: () => runtime.reset(),
    healthCheck: () => runtime.healthCheck(),
  };
}

export function getAkmBackendDoctorDetail(rootDir = process.cwd()) {
  const detail = createAkmBackend(rootDir).healthCheck();
  return {
    status: detail.status,
    detail: detail.detail,
  } as const;
}
