import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BenchmarkRuntimeError, MemoryBackendUnavailableError } from "../src/core/errors.ts";
import {
  buildAkmSearchQuery,
  buildFrontmatterBlock,
  clampSearchLimit,
  createAkmBackend,
  firstSentencesCapped,
  metadataToTags,
  resolveAkmCommand,
  satisfiesCaretZeroNine,
  slugifyDocId,
  stripFrontmatterAndOptionalHeading,
  synthesizeFrontmatter,
} from "../src/memory/backends/akm.ts";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fakeAkmPath = path.resolve(rootDir, "tests/fixtures/fake-akm.ts");

const tempDirs: string[] = [];
const envKeysToRestore = [
  "AKM_EVAL_AKM_CMD",
  "FAKE_AKM_LOG",
  "FAKE_AKM_VERSION",
  "FAKE_AKM_SKELETON_COUNT",
  "FAKE_AKM_INDEX_DELTA",
] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of envKeysToRestore) savedEnv[key] = process.env[key];

afterEach(() => {
  for (const key of envKeysToRestore) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function useFakeAkm(): { workDir: string; logPath: string } {
  const workDir = tempDir("akm-eval-akm-runtime-");
  const logPath = path.join(tempDir("akm-eval-akm-log-"), "invocations.jsonl");
  process.env.AKM_EVAL_AKM_CMD = JSON.stringify(["bun", fakeAkmPath]);
  process.env.FAKE_AKM_LOG = logPath;
  return { workDir, logPath };
}

function readInvocations(logPath: string): string[][] {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => (JSON.parse(line) as { argv: string[] }).argv);
}

// ── Deterministic frontmatter synthesis rule ─────────────────────────────────

describe("akm backend: deterministic frontmatter synthesis", () => {
  test("description is the first sentence(s), capped at 250 chars", () => {
    expect(firstSentencesCapped("Hello world. This is a second sentence.")).toBe(
      "Hello world. This is a second sentence.",
    );
    expect(firstSentencesCapped("Hello world. This is a second sentence.", 12)).toBe(
      "Hello world.",
    );
    expect(firstSentencesCapped("No terminal punctuation at all")).toBe(
      "No terminal punctuation at all",
    );
    expect(firstSentencesCapped("A".repeat(300)).length).toBe(250);
    expect(firstSentencesCapped("A".repeat(300)).endsWith("…")).toBe(true);
  });

  test("description accumulates whole sentences up to the cap, never a partial trailing sentence", () => {
    const text = `Short first sentence. ${"B".repeat(300)} more.`;
    const description = firstSentencesCapped(text);
    expect(description).toBe("Short first sentence.");
    expect(description.length).toBeLessThanOrEqual(250);
  });

  test("sentence splitting keeps trailing quotes/brackets attached to their sentence (LoCoMo turn shape)", () => {
    const text = 'Alice said, "this is a quoted sentence." Bob replied, "ok!"';
    expect(firstSentencesCapped(text, 40)).toBe('Alice said, "this is a quoted sentence."');
  });

  test("empty/whitespace-only body yields an empty description", () => {
    expect(firstSentencesCapped("")).toBe("");
    expect(firstSentencesCapped("   \n  ")).toBe("");
  });

  test("metadataToTags emits one key:value tag per non-empty metadata entry", () => {
    expect(metadataToTags({ sessionNumber: 3, speaker: "Alice", dateTime: "2024-01-01" })).toEqual([
      "sessionNumber:3",
      "speaker:Alice",
      "dateTime:2024-01-01",
    ]);
    // `undefined` sits outside MemoryDocument['metadata']'s declared value
    // type, but it does reach this function at runtime from JSON-sourced pack
    // config and dataset rows, so the guard against it is deliberate and
    // tested here. The cast keeps that intent explicit instead of silently
    // widening the production signature to accept it.
    const untypedMetadata = {
      dropped: null,
      alsoDropped: undefined,
      empty: "   ",
      kept: false,
    } as unknown as NonNullable<Parameters<typeof metadataToTags>[0]>;
    expect(metadataToTags(untypedMetadata)).toEqual(["kept:false"]);
    expect(metadataToTags(undefined)).toEqual([]);
  });

  test("synthesizeFrontmatter combines description + sourceId tag + metadata tags + an id-derived heading", () => {
    const fm = synthesizeFrontmatter({
      id: "D1:3",
      text: "This is the distinctive first sentence. Body prose continues after it.",
      metadata: { speaker: "Alice", sessionNumber: 1 },
    });
    // Both sentences fit comfortably under the 250-char cap, so both are kept.
    expect(fm.description).toBe(
      "This is the distinctive first sentence. Body prose continues after it.",
    );
    expect(fm.tags).toEqual(["sourceId:D1:3", "speaker:Alice", "sessionNumber:1"]);
    expect(fm.heading).toBe("D1:3");
  });

  test("buildFrontmatterBlock omits empty fields and JSON-encodes values for a lossless bulk-write round trip", () => {
    expect(buildFrontmatterBlock({ description: "", tags: [], heading: "x" })).toBe("---\n---");
    const block = buildFrontmatterBlock({
      description: 'A "quoted" description.',
      tags: ["sourceId:a:b", "k:v"],
      heading: "x",
    });
    expect(block).toBe(
      '---\ndescription: "A \\"quoted\\" description."\ntags: ["sourceId:a:b","k:v"]\n---',
    );
  });

  test("slugifyDocId is deterministic, flat (no slash), and collision-resistant", () => {
    const a = slugifyDocId("D1:3");
    const b = slugifyDocId("D1:3");
    const c = slugifyDocId("D1:4");
    expect(a).toBe(b);
    expect(a).not.toContain("/");
    expect(a).not.toBe(c);
    expect(slugifyDocId("")).not.toBe("");
  });

  test("stripFrontmatterAndOptionalHeading removes the frontmatter block and the injected H1", () => {
    const raw = '---\ndescription: "x"\n---\n\n# doc-A\n\nBody text here.\n';
    expect(stripFrontmatterAndOptionalHeading(raw)).toBe("Body text here.\n");
  });

  test("clampSearchLimit enforces akm's own [1, 200] range", () => {
    expect(clampSearchLimit(5)).toBe(5);
    expect(clampSearchLimit(0)).toBe(1);
    expect(clampSearchLimit(-3)).toBe(1);
    expect(clampSearchLimit(500)).toBe(200);
    expect(clampSearchLimit(Number.NaN)).toBe(1);
  });

  test("satisfiesCaretZeroNine matches only the 0.9.x line", () => {
    expect(satisfiesCaretZeroNine("0.9.1")).toBe(true);
    expect(satisfiesCaretZeroNine("0.9.0")).toBe(true);
    expect(satisfiesCaretZeroNine("0.10.0")).toBe(false);
    expect(satisfiesCaretZeroNine("1.0.0")).toBe(false);
    expect(satisfiesCaretZeroNine("not-a-version")).toBe(false);
  });

  test("buildAkmSearchQuery strips filler words but keeps content words and their order", () => {
    expect(buildAkmSearchQuery("What is the name of Melanie's dog?")).toBe("name Melanie's dog?");
    expect(buildAkmSearchQuery("When is Anna getting married?")).toBe("Anna getting married?");
    expect(buildAkmSearchQuery("sourdough starter")).toBe("sourdough starter");
  });

  test("buildAkmSearchQuery falls back to the original text when stripping would leave nothing", () => {
    expect(buildAkmSearchQuery("What is the of")).toBe("What is the of");
    expect(buildAkmSearchQuery("")).toBe("");
  });

  test("buildAkmSearchQuery is deterministic and case-preserving on kept tokens", () => {
    const q = "Where did Caroline's team go?";
    expect(buildAkmSearchQuery(q)).toBe(buildAkmSearchQuery(q));
    expect(buildAkmSearchQuery(q)).toContain("Caroline's");
  });
});

// ── AKM_EVAL_AKM_CMD resolution ──────────────────────────────────────────────

describe("akm backend: command resolution", () => {
  test('defaults to ["akm"] when AKM_EVAL_AKM_CMD is unset', () => {
    process.env.AKM_EVAL_AKM_CMD = undefined;
    expect(resolveAkmCommand(process.env)).toEqual({ ok: true, cmd: ["akm"] });
  });

  test("parses a JSON array override", () => {
    const resolution = resolveAkmCommand({
      AKM_EVAL_AKM_CMD: '["bun","/path/to/cli.ts"]',
    } as NodeJS.ProcessEnv);
    expect(resolution).toEqual({ ok: true, cmd: ["bun", "/path/to/cli.ts"] });
  });

  test("reports a failure (does not throw) for malformed JSON", () => {
    const resolution = resolveAkmCommand({ AKM_EVAL_AKM_CMD: "not json" } as NodeJS.ProcessEnv);
    expect(resolution.ok).toBe(false);
    if (!resolution.ok) expect(resolution.detail).toContain("JSON array");
  });

  test("reports a failure for an empty array or non-string entries", () => {
    expect(resolveAkmCommand({ AKM_EVAL_AKM_CMD: "[]" } as NodeJS.ProcessEnv).ok).toBe(false);
    expect(resolveAkmCommand({ AKM_EVAL_AKM_CMD: "[1,2]" } as NodeJS.ProcessEnv).ok).toBe(false);
  });
});

// ── Runtime behavior against a fake akm CLI (real subprocess, no mocking) ───

describe("akm backend: dispatch against a fake akm CLI subprocess", () => {
  test("a malformed AKM_EVAL_AKM_CMD fails healthCheck with a warn detail, and add/search/reset reject with MemoryBackendUnavailableError", async () => {
    process.env.AKM_EVAL_AKM_CMD = "not json";
    const workDir = tempDir("akm-eval-akm-badcmd-");
    const backend = createAkmBackend(rootDir, workDir);

    const health = backend.healthCheck();
    expect(health.status).toBe("warn");
    expect(health.detail).toContain("JSON array");

    await expect(backend.reset()).rejects.toBeInstanceOf(MemoryBackendUnavailableError);
    await expect(backend.add([{ id: "a", text: "x" }])).rejects.toBeInstanceOf(
      MemoryBackendUnavailableError,
    );
    await expect(backend.search({ text: "x", topK: 1 })).rejects.toBeInstanceOf(
      MemoryBackendUnavailableError,
    );
  });

  test("healthCheck reports ok against the fake CLI, and warn for a version outside ^0.9", async () => {
    const { workDir } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    const health = backend.healthCheck();
    expect(health.status).toBe("ok");
    expect(health.detail).toContain("0.9.1");

    process.env.FAKE_AKM_VERSION = "0.10.0";
    const backendNewVersion = createAkmBackend(rootDir, tempDir("akm-eval-akm-newver-"));
    const badHealth = backendNewVersion.healthCheck();
    expect(badHealth.status).toBe("warn");
    expect(badHealth.detail).toContain("^0.9");
  });

  test("reset() creates the hermetic bundle and establishes a genuinely empty (not skeleton) baseline", async () => {
    const { workDir } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();
    expect(fs.existsSync(path.join(workDir, "bundle"))).toBe(true);
    expect(fs.existsSync(path.join(workDir, "config", "config.json"))).toBe(true);
    const config = JSON.parse(fs.readFileSync(path.join(workDir, "config", "config.json"), "utf8"));
    expect(config.semanticSearchMode).toBe("off");
    expect(config.registries).toEqual([]);

    // akm's own `bundle create` seeds a real, searchable `facts/` skeleton
    // (verified live against 0.9.1). reset() must strip it so the baseline
    // entryCount is genuinely 0, not the seeded-skeleton count.
    expect(fs.existsSync(path.join(workDir, "bundle", "facts"))).toBe(false);
    const info = JSON.parse(
      fs.readFileSync(path.join(workDir, "data", "fake-index-count.json"), "utf8"),
    );
    expect(info.entryCount).toBe(0);
  });

  test("add() with a single document dispatches `remember`, not the bulk file-write path", async () => {
    const { workDir, logPath } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();
    await backend.add([{ id: "doc-1", text: "A single distinctive sentence about apricots." }]);

    const invocations = readInvocations(logPath);
    const rememberCalls = invocations.filter((argv) => argv[0] === "remember");
    expect(rememberCalls.length).toBe(1);
    expect(rememberCalls[0]).toContain("--description");
    expect(rememberCalls[0]).toContain("A single distinctive sentence about apricots.");

    // `akm remember` indexes on write, so the single-document path must NOT
    // pay for a second full reindex: the only `index --full` in this run is
    // the one reset() issues to establish its baseline.
    expect(invocations.filter((argv) => argv[0] === "index").length).toBe(1);

    const bulkFile = fs.readdirSync(path.join(workDir, "bundle", "memories"));
    expect(bulkFile.length).toBe(1);
  });

  test("add() with multiple documents writes files directly and never calls `remember`", async () => {
    const { workDir, logPath } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();
    await backend.add([
      { id: "doc-1", text: "First document about kumquats." },
      { id: "doc-2", text: "Second document about durians." },
      { id: "doc-3", text: "Third document about lychees." },
    ]);

    const invocations = readInvocations(logPath);
    expect(invocations.some((argv) => argv[0] === "remember")).toBe(false);
    const indexCalls = invocations.filter((argv) => argv[0] === "index");
    // one `index --full` from reset(), one from add()
    expect(indexCalls.length).toBe(2);

    const files = fs.readdirSync(path.join(workDir, "bundle", "memories"));
    expect(files.length).toBe(3);
  });

  test("add() counts DISTINCT ids, so documents sharing an id upsert instead of tripping the mismatch guard", async () => {
    // The guard used to compare entryCount against documents.length, which
    // encoded an unstated precondition -- that ids are unique -- and reported
    // its violation as data loss. slugifyDocId maps id -> filename, so two
    // documents with one id write one file and akm holds one entry: correct
    // upsert semantics, identical to raw-vector's id-keyed Map.
    //
    // Concretely: the upstream LongMemEval dataset repeats a filler session id
    // in 13 of its 500 questions (byte-identical turns, differing only in
    // haystack_dates), and this guard threw on a run where nothing had gone
    // wrong -- expected 57, got 56.
    const { workDir } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();

    await backend.add([
      { id: "dup", text: "First copy." },
      { id: "other", text: "A different document." },
      { id: "dup", text: "First copy." },
    ]);

    const files = fs.readdirSync(path.join(workDir, "bundle", "memories"));
    expect(files.length).toBe(2);
  });

  test("add() fails loudly on an ingestion-count mismatch instead of proceeding silently (bulk path)", async () => {
    const { workDir } = useFakeAkm();
    process.env.FAKE_AKM_INDEX_DELTA = "-1"; // simulate the indexer dropping one document
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();

    await expect(
      backend.add([
        { id: "doc-1", text: "First document." },
        { id: "doc-2", text: "Second document." },
      ]),
    ).rejects.toThrow(/ingestion count mismatch/);
  });

  test("add() fails loudly on an ingestion-count mismatch instead of proceeding silently (single-doc path)", async () => {
    const { workDir } = useFakeAkm();
    process.env.FAKE_AKM_INDEX_DELTA = "-1"; // simulate the indexer dropping the one document
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();

    await expect(backend.add([{ id: "doc-only", text: "x" }])).rejects.toBeInstanceOf(
      BenchmarkRuntimeError,
    );
  });

  test("search() never sends --detail (in particular never --detail normal)", async () => {
    const { workDir, logPath } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();
    await backend.add([{ id: "doc-1", text: "A sentence about pomegranates." }]);
    await backend.search({ text: "pomegranates", topK: 5 });

    const invocations = readInvocations(logPath);
    const searchCalls = invocations.filter((argv) => argv[0] === "search");
    expect(searchCalls.length).toBe(1);
    expect(searchCalls[0]).not.toContain("--detail");
    expect(searchCalls[0]).toContain("--shape");
    expect(searchCalls[0]).toContain("agent");
  });

  test("search() maps id back to the original MemoryDocument.id, carries the akm ref in metadata, and returns body text", async () => {
    const { workDir } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();
    await backend.add([
      { id: "D1:3", text: "A sentence about starfruit.", metadata: { speaker: "Alice" } },
    ]);

    const results = await backend.search({ text: "starfruit", topK: 5 });
    expect(results.length).toBe(1);
    expect(results[0]?.id).toBe("D1:3");
    expect(results[0]?.metadata?.ref).toBe(`memories/${slugifyDocId("D1:3")}`);
    expect(results[0]?.text).toContain("A sentence about starfruit.");
    expect(results[0]?.text).not.toContain("---");
    expect(typeof results[0]?.score).toBe("number");
  });

  test("search() throws on a hit that is not this instance's own bookkeeping (contamination signal, not pre-existing content)", async () => {
    const { workDir } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();
    // Write a memory file directly, bypassing this backend's add() entirely,
    // so it is never recorded in the instance's ref -> sourceId map. Since
    // reset() strips akm's seeded skeleton, this hermetic bundle should only
    // ever contain documents this instance added itself — an unrecognized
    // ref is a contamination signal the backend must refuse to paper over.
    fs.mkdirSync(path.join(workDir, "bundle", "memories"), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, "bundle", "memories", "external-doc.md"),
      "---\ntype: memory\ndescription: An externally written memory about jackfruit.\n---\n\n# external-doc\n\nBody text.\n",
      "utf8",
    );

    await expect(backend.search({ text: "jackfruit", topK: 5 })).rejects.toThrow(/never added/);
  });

  test("reset() isolates state: a document added before reset() is not findable after it", async () => {
    const { workDir } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();
    await backend.add([{ id: "doc-1", text: "A sentence about dragonfruit." }]);
    expect((await backend.search({ text: "dragonfruit", topK: 5 })).length).toBe(1);

    await backend.reset();
    expect((await backend.search({ text: "dragonfruit", topK: 5 })).length).toBe(0);
  });

  test("add()/search() before reset() fail loudly rather than operating on an uninitialized bundle", async () => {
    const { workDir } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await expect(backend.add([{ id: "a", text: "x" }])).rejects.toBeInstanceOf(
      BenchmarkRuntimeError,
    );
    await expect(backend.search({ text: "x", topK: 1 })).rejects.toBeInstanceOf(
      BenchmarkRuntimeError,
    );
  });

  test("add([]) is a no-op and does not invoke the akm CLI", async () => {
    const { workDir, logPath } = useFakeAkm();
    const backend = createAkmBackend(rootDir, workDir);
    await backend.reset();
    const before = readInvocations(logPath).length;
    await backend.add([]);
    expect(readInvocations(logPath).length).toBe(before);
  });
});

// ── End-to-end wiring through the real CLI entrypoint ────────────────────────

describe("akm backend: workDir threading through src/cli.ts run", () => {
  test("`akm-eval run` with memory.backend akm creates its hermetic root under <outputDir>/.akm-memory", () => {
    const logPath = path.join(tempDir("akm-eval-akm-cli-log-"), "invocations.jsonl");
    const outputDir = tempDir("akm-eval-akm-cli-output-");
    const configDir = tempDir("akm-eval-akm-cli-config-");

    // Derive the config under test from the committed three-arm config, so
    // this test still exercises that file's real shape, but pin
    // `datasetPath` at a path that does not exist. Without that pin the
    // longmemeval adapter resolves its dataset by DOWNLOADING the official
    // LongMemEval haystack from Hugging Face, which would make `bun test`
    // network-dependent, slow, and destructive to the operator's dataset
    // cache. The adapter resolves the dataset strictly AFTER `memory.reset()`
    // (see src/packs/longmemeval/adapter.ts), so the run still gets far
    // enough to build the hermetic akm root this test is about, then dies on
    // the missing dataset instead of on the network.
    const committedConfig = JSON.parse(
      fs.readFileSync(path.resolve(rootDir, "config/common/longmemeval-akm-ab.json"), "utf8"),
    ) as { packs: Array<{ config?: Record<string, unknown> }> };
    const firstPack = committedConfig.packs[0];
    if (!firstPack) throw new Error("committed config has no packs");
    firstPack.config = {
      ...firstPack.config,
      datasetPath: path.join(configDir, "no-such-longmemeval-dataset.json"),
    };
    const configPath = path.join(configDir, "longmemeval-akm-ab.json");
    fs.writeFileSync(configPath, JSON.stringify(committedConfig), "utf8");

    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        path.resolve(rootDir, "src/cli.ts"),
        "run",
        "--pack",
        "longmemeval",
        "--variant",
        "akm-memory",
        "--config",
        configPath,
        "--out",
        outputDir,
      ],
      cwd: rootDir,
      env: {
        ...process.env,
        AKM_EVAL_AKM_CMD: JSON.stringify(["bun", fakeAkmPath]),
        FAKE_AKM_LOG: logPath,
      },
    });

    // The run goes on to fail at dataset resolution (deliberately, see
    // above), but memory.reset() — and therefore the hermetic root under this
    // run's own outputDir — must have been created and used before that
    // failure.
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("LongMemEval dataset not found");
    const hermeticBundleDir = path.join(outputDir, ".akm-memory", "bundle");
    expect(fs.existsSync(hermeticBundleDir)).toBe(true);

    const invocations = readInvocations(logPath);
    expect(
      invocations.some(
        (argv) => argv[0] === "bundle" && argv[1] === "create" && argv.includes(hermeticBundleDir),
      ),
    ).toBe(true);
  });
});
