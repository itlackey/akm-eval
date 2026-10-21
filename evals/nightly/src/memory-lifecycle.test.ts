// Opt-in public-CLI path checks, not a measurement of model reasoning quality.
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type Sandbox, akmBuild, createSandbox, removeSandbox, runAkm, writeConfig } from "../../../lib/akm/akm.ts";
import { indexedRef, indexedRefs } from "../../../lib/akm/indexed-refs.ts";
import { extractConfig } from "../../extract/src/collect.ts";
import { consolidateConfig } from "../../consolidate/src/collect.ts";
import { embedderEnv } from "../../consolidate/src/sandbox.ts";
import { type ChatRequest, promptOf, schemaOf, startStub } from "../../../scripts/smoke/src/lib.ts";

const REAL = process.env.AKM_EVAL_REAL_AKM === "1";
const TIMEOUT = 30_000;
const CLAIM = "The Vela worker requires a signed checkpoint before replay.";
const EVIDENCE = "Operator confirmed checkpoint receipt VELA-481 at 2026-10-18T14:03:00Z.";
const SESSION = "vela-checkpoint-481";
const TAIL = "Recovery must also retain the amber receipt in /srv/vela/receipts for 17 days.";
const LONG = `${(`${CLAIM}\n`).repeat(240)}\n`;

// These same assertions read intermediate content in the real tests below. They
// intentionally do not search the surrounding success/proposal metadata.
function contains(stage: string, content: unknown, required: string[]): void {
  if (typeof content !== "string") throw new Error(`${stage}: missing content`);
  for (const claim of required) if (!content.includes(claim)) throw new Error(`${stage}: missing ${claim}`);
}

function selected(stage: string, refs: string[], required: string, forbidden: string[] = []): void {
  // Only one configured fixture bundle; search may omit that default identity.
  const id = (ref: string) => ref.replace(/^fixture\/\//, "");
  if (!refs.map(id).includes(id(required)) || forbidden.some((ref) => refs.map(id).includes(id(ref)))) throw new Error(`${stage}: incorrect evidence selection: ${JSON.stringify(refs)}`);
}

test("lifecycle assertions reject missing/corrupted evidence despite ok:true", () => {
  const good = { ok: true, content: `${CLAIM}\n${EVIDENCE}\n${SESSION}` };
  for (const stage of ["proposal payload", "accepted Markdown", "indexed show", "recovered archive", "model request"]) {
    expect(() => contains(stage, good.content, [CLAIM, EVIDENCE, SESSION])).not.toThrow();
    for (const missing of [CLAIM, EVIDENCE, SESSION]) {
      const damaged = { ...good, content: good.content.replace(missing, "CORRUPTED"), metadata: good.content };
      expect(() => contains(stage, damaged.content, [CLAIM, EVIDENCE, SESSION])).toThrow(`${stage}: missing`);
    }
    expect(() => contains(stage, undefined, [CLAIM])).toThrow(`${stage}: missing content`);
  }
  expect(() => selected("current", [], "corrected")).toThrow("incorrect evidence selection");
  expect(() => selected("current", ["corrected", "superseded"], "corrected", ["superseded"])).toThrow("incorrect evidence selection");
});

// Keep raw commands, complete model requests, settings and controlled files in
// nightly's existing gitignored results directory. Sandboxes are always removed.
const results = join(import.meta.dir, "..", "results", `memory-lifecycle-${new Date().toISOString().replaceAll(":", "-")}`);
async function isolated(name: string, answer: (req: ChatRequest) => unknown, run: (s: Sandbox, cli: Cli, requests: ChatRequest[]) => Promise<void>): Promise<void> {
  const requests: ChatRequest[] = [];
  const stub = startStub((req) => { requests.push(req); return JSON.stringify(answer(req)); });
  const s = createSandbox(`memory-lifecycle-${name}`);
  // HOME/CODEX_HOME and all native session locations are private to this test,
  // in addition to lib/akm's isolated data/config/bundle directories.
  s.env.HOME = s.dir;
  s.env.CODEX_HOME = join(s.dir, "codex");
  s.env.XDG_CACHE_HOME = join(s.dir, "xdg-cache");
  s.env.AKM_CLAUDE_PROJECTS_DIR = join(s.dir, "projects");
  Object.assign(s.env, embedderEnv("deterministic"));
  const config = consolidateConfig(stub.url, "scripted-lifecycle", false);
  config.engines.consolidate.supportsJsonSchema = true;
  config.engines.consolidate.timeoutMs = 5_000;
  config.bundles = { fixture: { path: join(s.dir, "bundle"), writable: true } };
  config.defaultBundle = "fixture";
  config.defaultWriteTarget = "fixture";
  config.improve = { strategies: { "extract-only": extractConfig(stub.url, "scripted-lifecycle", false).improve.strategies["extract-only"] } };
  config.engines.model = { ...config.engines.consolidate };
  writeConfig(s, config);
  const out = join(results, name);
  mkdirSync(out, { recursive: true });
  const cli: Cli = async (args, stdin, allowFailure = false) => {
    const result = await runAkm(s, args[0] === "--version" ? args : [...args, "--format", "json"], { stdin, timeoutMs: TIMEOUT });
    appendFileSync(join(out, "commands.jsonl"), `${JSON.stringify({ args, ...result })}\n`);
    if (!allowFailure) {
      expect(result.timedOut, args.join(" ")).toBe(false);
      expect(result.code, `${args.join(" ")}: ${result.stderr}`).toBe(0);
    }
    const value = args[0] === "--version" ? result.stdout.trim() : result.stdout ? JSON.parse(result.stdout) : null;
    return { ...result, value };
  };
  const started = performance.now();
  let error: string | null = null;
  try {
    await cli(["--version"]);
    await run(s, cli, requests);
    expect(stub.unexpected()).toEqual([]);
    for (const r of requests) {
      const keys = schemaOf(r)?.required;
      if (keys) expect(keys.some((k) => ["candidates", "onlyInA", "missing", "operations"].includes(k)), "unexpected model process").toBe(true);
    }
  } catch (e) {
    error = String(e);
    throw e;
  } finally {
    try {
      writeFileSync(join(out, "requests.json"), JSON.stringify(requests, null, 2));
      for (const folder of ["bundle", "config", "data", "state", "projects"]) {
        if (existsSync(join(s.dir, folder))) cpSync(join(s.dir, folder), join(out, folder), { recursive: true });
      }
      writeFileSync(join(out, "completion.json"), JSON.stringify({ ...akmBuild(), command: s.cmd, seconds: (performance.now() - started) / 1000, error, requests: requests.length, unexpected: stub.unexpected() }, null, 2));
    } finally {
      stub.stop();
      removeSandbox(s);
    }
    console.info(`memory lifecycle ${name}: ${error ? "FAIL" : "PASS"}; evidence ${out}`);
  }
}

type Cli = (args: string[], stdin?: string, allowFailure?: boolean) => Promise<Awaited<ReturnType<typeof runAkm>> & { value: any }>;
const pairRequest = (r: ChatRequest) => schemaOf(r)?.required?.includes("onlyInA");
const checkRequest = (r: ChatRequest) => schemaOf(r)?.required?.includes("missing");
function duplicateReply(r: ChatRequest): unknown {
  if (pairRequest(r)) return { reason: "Both notes state the same checkpoint requirement.", onlyInA: [], onlyInB: [], confidence: 0.99,
    ...(schemaOf(r)?.required?.includes("relation") ? { relation: "duplicate", redundant: null, stale: null } : {}),
  };
  if (checkRequest(r)) return { missing: [] };
  if (schemaOf(r)?.required?.includes("operations")) return { operations: [] };
  return {}; // endpoint capability probe; unexpected process calls fail below
}
const improve = async (cli: Cli) => (await cli(["improve", "--strategy", "consolidate", "--no-sync", "--require-engines", "--timeout-ms", "20000", "--json-to-stdout"])).value;
const proposals = async (cli: Cli, status = "pending") => (await cli(["proposal", "list", "--status", status, "--detail", "full"])).value.proposals as any[];
const refFor = (s: Sandbox, name: string) => indexedRef(indexedRefs(s), `memories/${name}.md`);
const pathFor = (s: Sandbox, name: string) => join(s.dir, "bundle", "memories", `${name}.md`);
const refsOf = (value: any): string[] => (value.hits ?? value.items ?? []).map((h: any) => h.ref);
async function remember(cli: Cli, name: string, body: string, extra: string[] = []): Promise<void> {
  await cli(["remember", "--name", name, "--description", CLAIM, "--tag", "checkpoint", ...extra], body);
}
async function pair(s: Sandbox, cli: Cli, a = LONG, b = LONG, scopes: [string[], string[]] = [[], []]): Promise<void> {
  await remember(cli, "vela-a", a, scopes[0]);
  await remember(cli, "vela-b", b, scopes[1]);
  for (const [name, age] of [["vela-a", 3], ["vela-b", 1]] as const) {
    const date = new Date(Date.now() - age * 86_400_000);
    utimesSync(pathFor(s, name), date, date);
  }
  await cli(["index", "--full"]);
}

describe.skipIf(!REAL)("real AKM memory lifecycle (AKM_EVAL_REAL_AKM=1; AKM_BIN selects build)", () => {
  test("session evidence survives extraction, acceptance, improvement and recall (#1196)", async () => {
    await isolated("extraction", (r) => schemaOf(r)?.required?.includes("candidates") ? {
      candidates: [{ type: "memory", name: "vela-checkpoint", description: CLAIM, when_to_use: "", body: CLAIM, confidence: 0.97, evidence: EVIDENCE }], rationale_if_empty: "",
    } : duplicateReply(r), async (s, cli, requests) => {
      const project = join(s.dir, "projects", "vela");
      mkdirSync(project, { recursive: true });
      const sessionFile = join(project, `${SESSION}.jsonl`);
      const content = `${CLAIM}\n${EVIDENCE}`;
      const messages = [content, "Confirmed. Preserve this checkpoint requirement for future replay operations."];
      writeFileSync(sessionFile, messages.map((text, i) => JSON.stringify({ type: i ? "assistant" : "user", sessionId: SESSION, cwd: join(s.dir, "vela"), uuid: `vela-message-${i}`, timestamp: "2026-10-18T14:03:00Z", message: { role: i ? "assistant" : "user", content: text } })).join("\n") + "\n");
      const extracted = (await cli(["proposal", "extract", "--type", "claude", "--location", join(s.dir, "projects"), "--session-id", SESSION, "--strategy", "extract-only"])).value;
      const session = extracted.sessions.find((v: any) => v.sessionId === SESSION);
      expect(session.skipped).not.toBe(true);
      expect(session.candidateCount).toBe(1);
      expect(session.proposalIds).toHaveLength(1);
      const extractionRequests = requests.filter((r) => schemaOf(r)?.required?.includes("candidates"));
      expect(extractionRequests).toHaveLength(1);
      contains("extraction request", promptOf(extractionRequests[0]), [CLAIM, EVIDENCE]);
      const pending = (await proposals(cli))[0];
      expect(pending.id).toBe(session.proposalIds[0]);
      expect(pending.status).toBe("pending");
      contains("pending evidence metadata", JSON.stringify(pending.payload.frontmatter), [EVIDENCE]);
      await cli(["proposal", "accept", pending.id]);
      expect((await proposals(cli, "accepted")).map((p) => p.id)).toEqual([pending.id]);
      const path = join(s.dir, "bundle", `${pending.ref.split("//").at(-1)}.md`);
      const markdown = readFileSync(path, "utf8");
      await cli(["index", "--full"]);
      const db = new Database(join(s.env.AKM_DATA_DIR, "index.db"), { readonly: true });
      let indexed: { document_json: string } | null;
      try { indexed = db.query<{ document_json: string }, [string]>("SELECT document_json FROM entries WHERE file_path = ?").get(path); }
      finally { db.close(); }
      const shown = (await cli(["show", pending.ref, "--detail", "full"])).value;
      selected("search", refsOf((await cli(["search", "checkpoint", "--type", "memory"])).value), pending.ref);
      // Force real improvement work rather than a successful singleton no-op.
      const duplicate = join(dirname(path), "vela-checkpoint-copy.md");
      cpSync(path, duplicate);
      for (const [file, age] of [[path, 1], [duplicate, 3]] as const) {
        const when = new Date(Date.now() - age * 86_400_000);
        utimesSync(file, when, when);
      }
      await cli(["index", "--full"]);
      const improved = await improve(cli);
      expect(improved.consolidation.pairPass.pairsJudged).toBeGreaterThan(0);
      const retirement = (await proposals(cli)).find((p) => p.source === "consolidate-pair");
      expect(retirement?.gateDecision.outcome).toBe("staged");
      await cli(["proposal", "accept", retirement.id]);
      expect(existsSync(duplicate)).toBe(false);
      selected("curate", refsOf((await cli(["curate", "checkpoint", "--type", "memory"])).value), pending.ref);
      contains("pending serialized payload", pending.payload.content, [CLAIM, EVIDENCE, SESSION]);
      contains("accepted Markdown", markdown, [CLAIM, EVIDENCE, SESSION]);
      contains("indexed document", indexed?.document_json, [CLAIM, EVIDENCE, SESSION]);
      contains("indexed show", shown.content, [CLAIM, EVIDENCE, SESSION]);
      contains("post-improve Markdown", readFileSync(path, "utf8"), [CLAIM, EVIDENCE, SESSION]);
      for (const r of requests.filter((r) => pairRequest(r) || checkRequest(r))) contains("extracted evidence in improvement request", promptOf(r), [CLAIM, EVIDENCE, SESSION]);
    });
  }, 120_000);

  test("a complete long duplicate retires, archives and recovers without duplicate application (#1195)", async () => {
    await isolated("duplicate-recovery", duplicateReply, async (s, cli, requests) => {
      await pair(s, cli, `${LONG}${TAIL}`, `${LONG}${TAIL}`);
      const result = await improve(cli);
      expect(result.consolidation.pairPass.pairsJudged).toBeGreaterThan(0);
      const judged = requests.filter(pairRequest);
      const checked = requests.filter(checkRequest);
      expect(judged.length).toBeGreaterThan(0);
      expect(checked.length).toBeGreaterThan(0);
      for (const r of [...judged, ...checked]) contains("complete assessment request", promptOf(r), [TAIL]);
      const pending = (await proposals(cli)).filter((p) => p.source === "consolidate-pair");
      expect(pending).toHaveLength(1);
      const p = pending[0];
      expect(p.status).toBe("pending");
      expect(p.gateDecision.outcome).toBe("staged");
      const retired = join(s.dir, "bundle", `${p.retirement.retiredRef.split("//").at(-1)}.md`);
      const survivor = join(s.dir, "bundle", `${p.retirement.successorRef.split("//").at(-1)}.md`);
      contains("staged content still live", readFileSync(retired, "utf8"), [TAIL]);
      await cli(["proposal", "accept", p.id]);
      expect(existsSync(retired)).toBe(false);
      contains("accepted survivor", readFileSync(survivor, "utf8"), [CLAIM, TAIL]);
      const accepted = (await proposals(cli, "accepted")).find((v) => v.id === p.id);
      expect(accepted.retiredArchive.dirs).toHaveLength(1);
      const archive = join(s.dir, "bundle", accepted.retiredArchive.dirs[0]);
      const tombstone = readFileSync(join(archive, "cleanup.md"), "utf8");
      contains("archive audit", tombstone, [p.id, "duplicate"]);
      const archived = readdirSync(archive, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".md") && f !== "cleanup.md");
      expect(archived).toHaveLength(1);
      contains("recoverable archive", readFileSync(join(archive, archived[0]), "utf8"), [CLAIM, TAIL]);
      await cli(["proposal", "accept", p.id]);
      expect((await proposals(cli, "accepted")).filter((v) => v.id === p.id)).toHaveLength(1);
      expect(existsSync(retired)).toBe(false);
      expect(readdirSync(join(s.dir, "bundle", ".akm", "memory-cleanup", "archive"))).toHaveLength(1);
      await cli(["proposal", "revert", p.id]);
      contains("recovered Markdown", readFileSync(retired, "utf8"), [CLAIM, TAIL]);
      expect((await proposals(cli, "reverted")).filter((v) => v.id === p.id)).toHaveLength(1);
      await cli(["index", "--full"]);
      contains("recovered show", (await cli(["show", p.retirement.retiredRef, "--detail", "full"])).value.content, [CLAIM, TAIL]);
    });
  }, 120_000);

  test("the second assessment sees a distinct tail and prevents unattended retirement (#1195)", async () => {
    await isolated("distinct-tail", (r) => checkRequest(r) ? { missing: [TAIL] } : duplicateReply(r), async (s, cli, requests) => {
      await pair(s, cli, `${LONG}${TAIL}`, LONG);
      await improve(cli); // deliberately wrong first judgment; second must get full evidence
      expect(requests.filter(pairRequest).length).toBeGreaterThan(0);
      expect(requests.filter(checkRequest).length).toBeGreaterThan(0);
      for (const r of requests.filter((r) => pairRequest(r) || checkRequest(r))) contains("tail assessment request", promptOf(r), [TAIL]);
      const pending = (await proposals(cli)).filter((p) => p.source === "consolidate-pair");
      expect(pending).toHaveLength(1);
      expect(pending[0].gateDecision?.outcome).not.toBe("staged");
      await cli(["proposal", "drain", "--promote", "--yes", "--strategy", "consolidate"]);
      expect(await proposals(cli, "accepted")).toHaveLength(0);
      contains("tail after drain", readFileSync(pathFor(s, "vela-a"), "utf8"), [CLAIM, TAIL]);
      await cli(["index", "--full"]);
      contains("tail recall", (await cli(["show", refFor(s, "vela-a"), "--detail", "full"])).value.content, [TAIL]);
    });
  }, 120_000);

  for (const same of [false, true]) test(`${same ? "same scope consolidates" : "different scopes stay separate"} (#1197)`, async () => {
    await isolated(same ? "same-scope" : "separate-scopes", duplicateReply, async (s, cli, requests) => {
      await pair(s, cli, LONG, LONG, [["--user", "alice", "--agent", "loom"], ["--user", same ? "alice" : "bob", "--agent", "loom"]]);
      await improve(cli);
      const pending = (await proposals(cli)).filter((p) => p.source === "consolidate-pair");
      if (!same) {
        expect(requests.filter(pairRequest)).toHaveLength(0);
        expect(pending).toHaveLength(0);
        for (const [name, user] of [["vela-a", "alice"], ["vela-b", "bob"]]) {
          contains("separate scoped content", readFileSync(pathFor(s, name), "utf8"), [CLAIM, `scope_user: ${user}`, "scope_agent: loom"]);
          contains("scoped show", (await cli(["show", refFor(s, name), "--filter", `user=${user}`, "--detail", "full"])).value.content, [CLAIM]);
        }
      } else {
        expect(pending).toHaveLength(1);
        expect(pending[0].gateDecision.outcome).toBe("staged");
        await cli(["proposal", "accept", pending[0].id]);
        const kept = join(s.dir, "bundle", `${pending[0].retirement.successorRef.split("//").at(-1)}.md`);
        contains("scope after consolidation", readFileSync(kept, "utf8"), ["scope_user: alice", "scope_agent: loom", CLAIM]);
      }
    });
  }, 120_000);

  for (const command of ["search", "curate"]) test(`${command}: current correction and historical evidence (#1199)`, async () => {
    await isolated(`beliefs-${command}`, duplicateReply, async (s, cli) => {
      const old = "The Vela worker uses queue cobalt. Source: receipt VELA-100.";
      const current = "The Vela worker now uses queue amber instead of cobalt. Source: receipt VELA-200.";
      await remember(cli, "vela-old", old, ["--user", "alice"]);
      await cli(["index", "--full"]);
      const oldRef = refFor(s, "vela-old");
      await remember(cli, "vela-current", current, ["--user", "alice", "--supersedes", oldRef]);
      await cli(["index", "--full"]);
      const currentRef = refFor(s, "vela-current");
      contains("superseded content", readFileSync(pathFor(s, "vela-old"), "utf8"), [old, "superseded"]);
      const normal = (await cli([command, "Vela", "--type", "memory", "--filter", "user=alice", "--belief", "current"])).value;
      selected(`${command} current`, refsOf(normal), currentRef, [oldRef]);
      const history = (await cli([command, "Vela", "--type", "memory", "--filter", "user=alice", "--belief", "historical"])).value;
      selected(`${command} historical`, refsOf(history), oldRef, [currentRef]);
      contains("historical source", (await cli(["show", oldRef, "--filter", "user=alice", "--detail", "full"])).value.content, [old]);
      contains("current source", (await cli(["show", currentRef, "--detail", "full"])).value.content, [current]);
    });
  }, 120_000);

  for (const mode of ["off", "auto"]) test(`ineligible neighbors cannot starve Alice (${mode}) (#1198)`, async () => {
    await isolated(`starvation-${mode}`, duplicateReply, async (s, cli) => {
      const dir = join(s.dir, "bundle", "memories");
      mkdirSync(dir, { recursive: true });
      // Direct native Markdown fixtures keep this adversarial corpus cheap.
      for (let n = 0; n < 121; n++) writeFileSync(join(dir, `bob-${n}.md`), `---\ndescription: quartz quartz quartz\nscope_user: bob\n---\nquartz quartz quartz\n`);
      await remember(cli, "alice", "Quartz records Alice's unique eligible checkpoint receipt VELA-901.", ["--user", "alice"]);
      await cli(["index", "--full"]);
      const wanted = refFor(s, "alice");
      await cli(["config", "set", "semanticSearchMode", mode]);
      const result = (await cli(["search", "quartz", "--filter", "user=alice", "--type", "memory", "--limit", "1"])).value;
      expect(refsOf(result)).toEqual([wanted]);
      expect(result.searchMode).toBe(mode === "off" ? "keyword" : "semantic");
    });
  }, 120_000);

  test("failed judgment and stale acceptance preserve content (#1195 / #1197)", async () => {
    await isolated("failed-judgment", (r) => pairRequest(r) ? "not a judgment" : duplicateReply(r), async (s, cli) => {
      await pair(s, cli);
      const result = await improve(cli);
      expect(result.consolidation.pairPass.failedJudgments).toBeGreaterThan(0);
      expect((await proposals(cli)).filter((p) => p.source === "consolidate-pair")).toHaveLength(0);
      for (const name of ["vela-a", "vela-b"]) contains("failed judgment content", readFileSync(pathFor(s, name), "utf8"), [CLAIM]);
    });
    await isolated("stale-acceptance", duplicateReply, async (s, cli) => {
      await pair(s, cli);
      await improve(cli);
      const p = (await proposals(cli)).find((p) => p.source === "consolidate-pair");
      expect(p).toBeDefined();
      const target = join(s.dir, "bundle", `${p.retirement.retiredRef.split("//").at(-1)}.md`);
      appendFileSync(target, `\n${TAIL}\n`);
      const failed = await cli(["proposal", "accept", p.id], undefined, true);
      expect(failed.code).not.toBe(0);
      expect(failed.stderr).toContain("stale");
      contains("stale acceptance content", readFileSync(target, "utf8"), [CLAIM, TAIL]);
      expect((await proposals(cli, "accepted")).filter((v) => v.id === p.id)).toHaveLength(0);
      expect((await proposals(cli)).filter((v) => v.id === p.id)).toHaveLength(1);
    });
  }, 120_000);

  test("interrupted accept acknowledgment resumes without a second archive", async () => {
    await isolated("interrupted-acceptance", duplicateReply, async (s, cli) => {
      const git = (...args: string[]) => {
        const result = Bun.spawnSync(["git", "-C", join(s.dir, "bundle"), ...args], { env: s.env, stdout: "pipe", stderr: "pipe" });
        expect(result.exitCode, result.stderr.toString()).toBe(0);
      };
      git("init", "--initial-branch=main");
      git("config", "user.name", "Lifecycle fixture");
      git("config", "user.email", "lifecycle@example.invalid");
      await pair(s, cli, `${LONG}${TAIL}`, `${LONG}${TAIL}`);
      git("add", "memories");
      git("commit", "-m", "Plant lifecycle memories");
      await improve(cli);
      const p = (await proposals(cli)).find((p) => p.source === "consolidate-pair");
      expect(p?.gateDecision.outcome).toBe("staged");
      // The disposable bundle's ref-transaction hook kills the AKM invocation after archival/intent
      // persistence, before acceptance is finalized. It kills only the processes between git and
      // this test process (the akm command, plus any wrapper AKM_BIN adds), and nothing if this
      // test process is not among git's ancestors. No product fault hook, private repository API,
      // race timing, or developer git hook is used.
      const hook = join(s.dir, "bundle", ".git", "hooks", "reference-transaction");
      s.env.LIFECYCLE_TEST_PID = String(process.pid);
      writeFileSync(hook, [
        "#!/bin/sh",
        '[ "$1" = prepared ] || exit 0',
        'pid=$(ps -o ppid= -p "$PPID" | tr -d " ")',
        "chain=",
        'while [ -n "$pid" ] && [ "$pid" -gt 1 ] && [ "$pid" != "$LIFECYCLE_TEST_PID" ]; do',
        '  chain="$chain $pid"',
        '  pid=$(ps -o ppid= -p "$pid" | tr -d " ")',
        "done",
        '[ "$pid" = "$LIFECYCLE_TEST_PID" ] && [ -n "$chain" ] || exit 1',
        "printf interrupted > ../accept-interrupted.marker",
        "kill -KILL $chain",
        "exit 1",
        "",
      ].join("\n"), { mode: 0o755 });
      const interrupted = await cli(["proposal", "accept", p.id], undefined, true);
      expect(existsSync(join(s.dir, "accept-interrupted.marker"))).toBe(true);
      expect(interrupted.code).not.toBe(0);
      expect(interrupted.timedOut).toBe(false);
      rmSync(hook);
      expect((await proposals(cli)).filter((v) => v.id === p.id)).toHaveLength(1);
      const archiveRoot = join(s.dir, "bundle", ".akm", "memory-cleanup", "archive");
      const beforeResume = readdirSync(archiveRoot);
      expect(beforeResume).toHaveLength(1);
      contains("interrupted audit", readFileSync(join(archiveRoot, beforeResume[0], "cleanup.md"), "utf8"), [p.id]);
      await cli(["proposal", "accept", p.id]);
      await cli(["proposal", "accept", p.id]);
      expect(readdirSync(archiveRoot)).toEqual(beforeResume);
      const accepted = (await proposals(cli, "accepted")).filter((v) => v.id === p.id);
      expect(accepted).toHaveLength(1);
      expect(accepted[0].retiredArchive.dirs).toHaveLength(1);
      const archive = join(s.dir, "bundle", accepted[0].retiredArchive.dirs[0]);
      const archived = readdirSync(archive, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".md") && f !== "cleanup.md");
      expect(archived).toHaveLength(1);
      contains("interrupted archive", readFileSync(join(archive, archived[0]), "utf8"), [CLAIM, TAIL]);
      await cli(["proposal", "revert", p.id]);
      const original = join(s.dir, "bundle", `${p.retirement.retiredRef.split("//").at(-1)}.md`);
      contains("interrupted recovery", readFileSync(original, "utf8"), [CLAIM, TAIL]);
    });
  }, 120_000);
});
