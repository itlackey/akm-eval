#!/usr/bin/env bun
/**
 * A fake `akm` CLI standing in for the real one in unit tests, invoked as
 * `AKM_EVAL_AKM_CMD=["bun","<abs path to this file>"]`.
 *
 * Implements just enough of the surface `src/memory/backends/akm.ts`
 * actually calls (`--version`, `bundle create`, `index --full`, `info`,
 * `remember`, `search`) to exercise the backend's real dispatch/verification
 * logic end to end against a real subprocess, without needing the real akm
 * CLI installed. Reads/writes real files under the AKM_BUNDLE_DIR /
 * AKM_DATA_DIR the backend already pins, so its state is genuinely driven by
 * what's on disk rather than an in-memory mock.
 *
 * Test-controlled knobs (all optional):
 *   FAKE_AKM_LOG            - path to append one JSON line per invocation to
 *   FAKE_AKM_VERSION        - version string to report (default "0.9.1")
 *   FAKE_AKM_SKELETON_COUNT - "fact" skeleton files `bundle create` seeds (default 3)
 *   FAKE_AKM_INDEX_DELTA    - integer added to the true file count `index --full` reports,
 *                             to simulate a broken indexer (ingestion-count-mismatch test)
 */
import fs from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);

function logInvocation(): void {
  const logPath = process.env.FAKE_AKM_LOG;
  if (!logPath) return;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify({ argv })}\n`, "utf8");
}

function bundleDir(): string {
  const dir = process.env.AKM_BUNDLE_DIR;
  if (!dir) throw new Error("fake-akm: AKM_BUNDLE_DIR is not set");
  return dir;
}

function dataDir(): string {
  const dir = process.env.AKM_DATA_DIR;
  if (!dir) throw new Error("fake-akm: AKM_DATA_DIR is not set");
  return dir;
}

function indexCountPath(): string {
  return path.join(dataDir(), "fake-index-count.json");
}

function readIndexCount(): number {
  try {
    const raw = fs.readFileSync(indexCountPath(), "utf8");
    const parsed = JSON.parse(raw) as { entryCount?: number };
    return typeof parsed.entryCount === "number" ? parsed.entryCount : 0;
  } catch {
    return 0;
  }
}

function countMarkdownFiles(dir: string): number {
  let count = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countMarkdownFiles(full);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}

function flagValue(name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

function allFlagValues(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name) values.push(argv[i + 1] ?? "");
  }
  return values;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string, code = 1): never {
  process.stderr.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(code);
}

// ── Frontmatter (deliberately YAML-block-list style, NOT the JSON-flow style
//    this repo's own bulk writer uses, so tests exercise both shapes) ───────

function writeMemoryFile(
  filePath: string,
  description: string | undefined,
  tags: string[],
  heading: string,
  body: string,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const lines = ["---", "type: memory"];
  if (description) lines.push(`description: ${description}`);
  if (tags.length > 0) {
    lines.push("tags:");
    for (const tag of tags) lines.push(`  - ${tag}`);
  }
  lines.push("---", "", `# ${heading}`, "", body, "");
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
}

function parseFrontmatter(raw: string): { description: string; tags: string[] } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { description: "", tags: [] };
  const block = match[1] ?? "";
  const lines = block.split(/\r?\n/);
  let description = "";
  const tags: string[] = [];
  let inTags = false;
  for (const line of lines) {
    if (inTags) {
      const item = line.match(/^\s*-\s*(.+)$/);
      if (item) {
        tags.push(item[1]?.trim());
        continue;
      }
      inTags = false;
    }
    const descMatch = line.match(/^description:\s*(.*)$/);
    if (descMatch) {
      description = descMatch[1]?.trim();
      continue;
    }
    if (/^tags:\s*$/.test(line)) {
      inTags = true;
    }
  }
  return { description, tags };
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdVersion(): void {
  process.stdout.write(`${process.env.FAKE_AKM_VERSION ?? "0.9.1"}\n`);
}

function cmdBundleCreate(): void {
  const dir = flagValue("--dir");
  if (!dir) {
    fail("bundle create requires --dir");
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  const skeletonCount = Number(process.env.FAKE_AKM_SKELETON_COUNT ?? "3");
  const factsDir = path.join(dir, "facts");
  fs.mkdirSync(factsDir, { recursive: true });
  for (let i = 0; i < skeletonCount; i += 1) {
    const skeletonPath = path.join(factsDir, `skeleton-${i}.md`);
    if (!fs.existsSync(skeletonPath)) {
      fs.writeFileSync(
        skeletonPath,
        `---\ntype: fact\ndescription: skeleton fact ${i}\n---\n\n# skeleton ${i}\n`,
        "utf8",
      );
    }
  }
  printJson({
    bundleDir: dir,
    created: true,
    configPath: path.join(process.env.AKM_CONFIG_DIR ?? "", "config.json"),
    shape: "bundle-create",
    schemaVersion: 1,
  });
}

/**
 * Recompute and persist the index count from what is actually on disk.
 * Called by `index --full` AND by `remember`, because the real akm CLI
 * indexes on write: after `akm remember`, `akm info`'s
 * `indexStats.entryCount` has already incremented and the new asset is
 * searchable with no separate index pass (verified live against 0.9.1).
 *
 * No skeleton-vs-real-document gating here: the real backend's `reset()`
 * deletes the `facts/` skeleton `cmdBundleCreate` seeds (below) before it
 * ever calls `index --full`, so by the time this runs at reset()-baseline
 * time the skeleton is already gone from disk and `trueCount` is a
 * trustworthy 0 with no gating needed. `FAKE_AKM_INDEX_DELTA` therefore
 * applies unconditionally, matching the real indexer-drops-a-document
 * scenario these tests simulate.
 */
function refreshIndexCount(): number {
  const trueCount = countMarkdownFiles(bundleDir());
  const delta = Number(process.env.FAKE_AKM_INDEX_DELTA ?? "0");
  const reported = Math.max(0, trueCount + delta);
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(indexCountPath(), JSON.stringify({ entryCount: reported }), "utf8");
  return reported;
}

function cmdIndexFull(): void {
  printJson({ totalEntries: refreshIndexCount(), mode: "full", stashDir: bundleDir() });
}

function cmdInfo(): void {
  printJson({
    schemaVersion: 1,
    version: process.env.FAKE_AKM_VERSION ?? "0.9.1",
    bundleDir: bundleDir(),
    indexStats: { entryCount: readIndexCount(), byType: {} },
    shape: "info",
  });
}

function cmdRemember(): void {
  // `remember <content> --name <name> [--description <d>] [--tag <t>]* [--force]`
  const content = argv[1] ?? "";
  const name = flagValue("--name");
  if (!name) fail("remember requires --name");
  if (name.includes("/")) fail("Asset --name must be a flat name without '/'.", 2);
  const description = flagValue("--description");
  const tags = allFlagValues("--tag");

  // Content is `# heading\n\n<body>` as written by the backend's single-doc path.
  const headingMatch = content.match(/^#\s+(.*)\r?\n\r?\n([\s\S]*)$/);
  const heading = headingMatch?.[1] ?? name;
  const body = headingMatch?.[2] ?? content;

  const filePath = path.join(bundleDir(), "memories", `${name}.md`);
  writeMemoryFile(filePath, description, tags, heading, body);
  refreshIndexCount(); // the real CLI indexes on write — see refreshIndexCount()
  printJson({
    ok: true,
    ref: `memories/${name}`,
    path: filePath,
    shape: "remember",
    schemaVersion: 1,
  });
}

interface FakeHit {
  name: string;
  ref: string;
  type: string;
  path: string;
  description: string;
  score: number;
  estimatedTokens: number;
}

function walkMemoryFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMemoryFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

function cmdSearch(): void {
  const query = (argv[1] ?? "").trim().toLowerCase();
  const limitRaw = flagValue("--limit");
  const limit = limitRaw ? Math.max(1, Math.min(200, Number(limitRaw))) : 20;
  // Deliberately mirrors the real akm ceiling: only description/tags/heading
  // are searched, never full body prose.
  const memoriesDir = path.join(bundleDir(), "memories");
  const hits: FakeHit[] = [];
  for (const filePath of walkMemoryFiles(memoriesDir)) {
    const raw = fs.readFileSync(filePath, "utf8");
    const { description, tags } = parseFrontmatter(raw);
    const headingMatch = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n+#\s+(.*)$/m);
    const heading = headingMatch?.[1] ?? "";
    const haystack = `${description} ${tags.join(" ")} ${heading}`.toLowerCase();
    if (!query || haystack.includes(query)) {
      const name = path.basename(filePath, ".md");
      hits.push({
        name,
        ref: `memories/${name}`,
        type: "memory",
        path: filePath,
        description,
        score: 1,
        estimatedTokens: Math.max(1, Math.ceil(raw.length / 4)),
      });
    }
  }
  hits.sort((a, b) => a.name.localeCompare(b.name));

  const detail = flagValue("--detail");
  const shaped = hits.slice(0, limit).map((hit) => {
    if (detail === "normal") {
      // Mirrors the real, documented bug: --detail normal silently drops ref.
      const { ref: _droppedRef, ...rest } = hit;
      return rest;
    }
    return hit;
  });

  if (shaped.length === 0) {
    printJson({
      hits: [],
      tip: "No matching stash assets were found. Try a different query or run 'akm index' to rebuild.",
    });
  } else {
    printJson({ hits: shaped });
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

logInvocation();

if (argv.includes("--version") || argv.includes("-v")) {
  cmdVersion();
} else if (argv[0] === "bundle" && argv[1] === "create") {
  cmdBundleCreate();
} else if (argv[0] === "index") {
  cmdIndexFull();
} else if (argv[0] === "info") {
  cmdInfo();
} else if (argv[0] === "remember") {
  cmdRemember();
} else if (argv[0] === "search") {
  cmdSearch();
} else {
  fail(`fake-akm: unhandled command: ${argv.join(" ")}`, 2);
}
