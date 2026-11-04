// What akm sends `proposal.judgment` for a promotion, made by akm's own code. A bundle (memories and knowledge notes) goes into a sandbox and is indexed; consolidate's
// `emitPromotionProposal` mints a promotion for each memory, with the coverage gate on; and `drainProposals` of the akm under test then builds the judge's input
// exactly as the drain does (live asset, same-ref proposals, nearest notes), with the judge's `run` replaced by a recorder that defers. So the input is akm's, not a copy of its rules.
//
//   bun evals/drain-judge/src/capture.ts --akm ~/code/akm [--bundle DIR (one group of assets/bundle)] [--out FILE]
//
// Not modelled: consolidate's planner (a model chooses which memories to promote; here every memory is a candidate), and the nearest notes of promotions accepted earlier in the same drain.

import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createSandbox, removeSandbox, runAkm } from "../../../lib/akm/akm.ts";

/** What the drain sends the judge, as `akm judge proposal.judgment` reads it. */
export interface JudgmentInput {
  proposal: { ref: string; source: string; content: string };
  reason: "needs-judgment" | "proactive-needs-review";
  liveAsset?: string;
  siblings: { id: string; source: string; content: string }[];
  neighbours?: { ref: string; description: string; excerpt: string }[];
}

/** One memory of a bundle group: the input the drain built for its promotion, or why it built none. */
export interface Captured {
  /** The group of assets/bundle the memory is in, and its ref (`memories/<name>`). */
  bundle: string;
  memory: string;
  /** The proposal's ref, and the id of its proposal. */
  ref?: string;
  input?: JudgmentInput;
  /** consolidate's skip reason (`dedup_covered_by_knowledge`, ...) when the promote pass minted no proposal. */
  skipped?: string;
}

/**
 * The bundles the eval ships, one folder each under assets/bundle, with `memories/<name>.md` and `knowledge/<name>.md`. Each is promoted in a sandbox of its own, on top of the
 * knowledge library of the promotion eval: `base` holds the good and bad memories, `dup` the good memories again with the notes that repeat them, so those notes are
 * neighbours of the duplicates' promotions only (each duplicate also sees the other families' notes, as a library holds notes on other subjects).
 */
export const BUNDLE = join(import.meta.dir, "..", "assets", "bundle");
export const LIBRARY = join(import.meta.dir, "..", "..", "promotion", "assets", "library", "knowledge");

/** Promotes every memory of `bundle` (plus the knowledge library) through the akm checkout at `akmDir`, and records the judge's input for each. */
export async function capture(akmDir: string, bundle: string, withLibrary = true): Promise<{ captured: Captured[]; embedder: string }> {
  const group = basename(bundle);
  const sandbox = createSandbox("drain-judge", { semantic: true });
  const stash = sandbox.env.AKM_BUNDLE_DIR;
  const saved = { ...process.env };
  try {
    for (const dir of ["memories", "knowledge"]) mkdirSync(join(stash, dir), { recursive: true });
    if (withLibrary) cpSync(LIBRARY, join(stash, "knowledge"), { recursive: true });
    for (const dir of ["memories", "knowledge"]) {
      try {
        cpSync(join(bundle, dir), join(stash, dir), { recursive: true });
      } catch {} // a bundle may have no knowledge folder
    }
    const index = await runAkm(sandbox, ["index", "--full", "--format", "json"], { timeoutMs: 30 * 60_000 });
    if (index.code !== 0) throw new Error(`akm index failed (exit ${index.code}): ${index.stderr.trim().slice(-300)}`);
    Object.assign(process.env, sandbox.env); // akm's modules, loaded below, read the sandbox's folders from the environment
    const at = (file: string) => import(join(resolve(akmDir), "src", file));
    const [consolidate, coverage, drain, config, writeSource, indexRepo, conn, proposals] = await Promise.all([
      at("commands/improve/consolidate.ts"),
      at("commands/improve/consolidate/coverage.ts"),
      at("commands/proposal/drain.ts"),
      at("core/config/config.ts"),
      at("core/write-source.ts"),
      at("storage/repositories/index-entries-repository.ts"),
      at("storage/repositories/index-connection.ts"),
      at("commands/proposal/repository.ts"),
    ]);
    const cfg = config.loadConfig();
    const db = conn.openExistingDatabase();
    const entries = indexRepo.getAllEntries(db, "memory").filter((e: any) => !e.entry.name.endsWith(".derived"));
    const bundleId: string | undefined = entries[0]?.bundleId;
    conn.closeDatabase(db);
    const memoryByRef = new Map<string, any>();
    for (const e of entries) {
      memoryByRef.set(`memories/${e.entry.name}`, { name: e.entry.name, filePath: e.filePath, description: e.entry.description ?? "", tags: e.entry.tags ?? [], stashDir: stash });
    }
    const cover = coverage.openKnowledgeCoverage(bundleId);
    // Without the gate a duplicate the gate would skip reaches the judge, and every case would still look reachable.
    if (!cover) throw new Error("consolidate's coverage gate did not open (no bundle or no index): a duplicate it would skip would reach the judge");
    const skips = new Map<string, string>();
    const warnings: string[] = [];
    const promoted: string[] = [];
    const ctx = {
      config: cfg, stashDir: stash, sourceRun: "drain-judge", target: writeSource.resolveWriteTarget(cfg), memoryByRef, promoted, promotedSourceRefs: new Set<string>(),
      existingKnowledgeBodyHashes: consolidate.loadExistingKnowledgeBodyHashes(stash), coveringKnowledge: cover.find,
      promotionFailures: { count: 0 }, warnings, pushSkipReason: (_op: string, ref: string, reason: string) => skips.set(ref, reason),
    };
    try {
      for (const ref of [...memoryByRef.keys()].sort()) {
        // consolidate's plan op with the fields a planner leaves empty: the memory's own description is kept.
        await consolidate.emitPromotionProposal({ op: "promote", ref, knowledgeRef: `knowledge/${memoryByRef.get(ref).name}`, reason: "", description: "", confidence: null }, ctx);
      }
    } finally {
      cover.close();
    }
    const pending = proposals.listProposals(stash, { status: "pending" }) as any[];
    const inputs = new Map<string, JudgmentInput>();
    const original = drain.judgmentJudge.run;
    drain.judgmentJudge.run = async (input: JudgmentInput) => {
      inputs.set(input.proposal.ref, structuredClone(input));
      return { outcome: "verdict", verdict: { decision: "defer", reason: "recorded" } };
    };
    try {
      const runner = { kind: "connection", name: "recorder", endpoint: "http://recorder.invalid/v1/chat/completions", model: "recorder", request: {}, timeoutMs: 1000 };
      await drain.drainProposals({ stashDir: stash, applyMode: "queue", maxAccepts: 0, dryRun: true, config: cfg, judgment: runner }, undefined, undefined, {});
    } finally {
      drain.judgmentJudge.run = original;
    }
    const bySource = new Map(pending.map((p) => [p.promotionSource, p]));
    const captured: Captured[] = [...memoryByRef.keys()].map((ref) => {
      const p = bySource.get(ref);
      if (p && inputs.has(p.ref)) return { bundle: group, memory: ref, ref: p.ref, input: inputs.get(p.ref)! };
      return { bundle: group, memory: ref, skipped: skips.get(ref) ?? (p ? "not-judged" : "not-minted") };
    });
    return { captured, embedder: `${cfg.embedding?.localModel ?? "none"}` };
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    removeSandbox(sandbox);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { akm: { type: "string" }, bundle: { type: "string" }, out: { type: "string" } } });
  if (!values.akm) {
    console.error("capture: --akm DIR (an akm checkout) is needed");
    process.exit(2);
  }
  const groups = values.bundle ? [resolve(values.bundle)] : readdirSync(BUNDLE, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(BUNDLE, e.name));
  const results = [];
  for (const g of groups) results.push(await capture(values.akm, g));
  const captured = results.flatMap((r) => r.captured);
  const embedder = results[0]?.embedder ?? "none";
  const lines = captured.map((c) => JSON.stringify(c)).join("\n") + "\n";
  if (values.out) {
    mkdirSync(dirname(resolve(values.out)), { recursive: true });
    writeFileSync(values.out, lines);
  }
  console.log(`capture: ${captured.filter((c) => c.input).length} of ${captured.length} memories reached judgment (embedder ${embedder}); skipped: ${JSON.stringify(Object.fromEntries(captured.filter((c) => c.skipped).map((c) => [c.memory, c.skipped])))}`);
}
