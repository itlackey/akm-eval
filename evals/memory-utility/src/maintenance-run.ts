import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { akmBuild, akmVersion, createSandbox, dirtyFingerprint, removeSandbox, useAkm, useConfigForm, writtenConfigForm } from "../../../lib/akm/akm.ts";
import { fail, gitCommit, slug } from "../../../lib/cli.ts";
import { REPO_ROOT } from "../../../lib/manifest.ts";
import { useModel } from "../../../lib/models.ts";
import { endpointDigest, redactActors, redactConfig, sha256Json } from "../../../lib/provenance.ts";
import { clearRunning, makeResultsDir } from "../../../lib/results.ts";
import { effectiveConfig } from "../../nightly/src/collect.ts";
import { collectHistory, EVAL, pendingHistory, scoreHistory, SCORING_VERSION, VERSION, type History } from "./maintenance.ts";
import { PROMPT, readerSettings } from "./protocol.ts";

const usage = `Usage: bash evals/memory-utility/run-maintenance [options]

  --model ID       Model for both native maintenance and the reader (MODEL_NAME otherwise).
  --akm COMMAND    AKM command (AKM_BIN otherwise).
  --label NAME     Results label (defaults to model name).
  --timeout-ms N   Reader/command timeout and per-cycle improve budget (default 120000 ms).

Runs only the three public development histories; no release claims or custom corpus.`;

async function main() {
  const { values: v } = parseArgs({ strict: true, options: {
    help: { type: "boolean", short: "h" }, model: { type: "string" }, akm: { type: "string" }, label: { type: "string" }, "timeout-ms": { type: "string" },
  } });
  if (v.help) { console.log(usage); return; }
  const timeoutMs = Number(v["timeout-ms"] ?? 120_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) fail("--timeout-ms must be a positive integer");
  const histories: History[] = JSON.parse(readFileSync(join(import.meta.dir, "../assets/maintenance-histories.json"), "utf8"));
  useAkm(v, fail);
  const model = useModel(v, fail);
  const label = slug(v.label ?? model.name) || EVAL;
  const probe = createSandbox(`${EVAL}-version`, { isolateHome: true });
  let version: string;
  try {
    version = await akmVersion(probe);
    useConfigForm(version);
  } finally { removeSandbox(probe); }
  const writerConfig = effectiveConfig({ ...model, model: model.name });
  const o = { endpoint: { ...model, model: model.name }, semantic: false, contextTokens: 1024, searchLimit: 10, timeoutMs };
  const dir = makeResultsDir(join(import.meta.dir, "../results", EVAL), label);
  const pending = histories.map(pendingHistory);
  const start = performance.now();
  const identity = {
    eval: EVAL, version: VERSION, scoring_version: SCORING_VERSION, corpus: "public-development", label,
    git_commit: gitCommit(REPO_ROOT), collector_fingerprint: dirtyFingerprint(REPO_ROOT),
    akm_version: version, ...akmBuild(), config_form: writtenConfigForm(),
    assets_sha256: sha256Json(histories), reader_prompt_sha256: sha256Json(PROMPT),
    model: model.name, endpoint_sha256: endpointDigest(model.baseUrl), writer_config: redactConfig(writerConfig),
    writer_embedder: "deterministic", reader_search_mode: "keyword", reader_settings: readerSettings(model.chat),
    context_tokens_estimated: o.contextTokens, search_limit: o.searchLimit, timeout_ms: timeoutMs,
  };
  let status: "running" | "complete" | "incomplete" = "running";
  let interruption: string | null = null;
  let results = pending.map(scoreHistory);
  const save = () => {
    results = pending.map(scoreHistory);
    const changed = pending.filter(h => h.maintained !== null && sha256Json(h.originals) !== sha256Json(h.maintained)).length;
    const deltas = results.map(r => r.delta);
    const summary = {
      ...identity, status, interruption, date: new Date().toISOString(), wall_seconds: (performance.now() - start) / 1000,
      histories_planned: pending.length, histories_with_different_final_library: changed,
      questions_planned: results.reduce((n, r) => n + r.n, 0),
      mean_paired_delta: status === "complete" && deltas.every(d => d !== null) ? deltas.reduce<number>((n, d) => n + (d ?? 0), 0) / deltas.length : null,
      histories: results.map(({ questions: _, ...r }) => r),
    };
    const write = (name: string, content: string) => {
      const path = join(dir, name);
      writeFileSync(`${path}.tmp`, content);
      renameSync(`${path}.tmp`, path);
    };
    write("samples.jsonl", pending.map((raw, i) => JSON.stringify(redactActors({ ...results[i], raw }))).join("\n") + "\n");
    write("summary.json", JSON.stringify(redactActors(summary), null, 2) + "\n");
    return summary;
  };
  const stop = (signal: string) => { status = "incomplete"; interruption = signal; save(); process.exit(signal === "SIGINT" ? 130 : 143); };
  const interrupt = () => stop("SIGINT"), terminate = () => stop("SIGTERM");
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  console.log(`Results: ${dir}\nReader and maintenance destination: ${new URL(model.baseUrl).origin}`);
  save();
  try {
    for (const [i, raw] of pending.entries()) {
      console.log(`  ${raw.id}`);
      await collectHistory(raw, histories[i]!.initial.length, writerConfig, o, save);
    }
    status = "complete";
  } catch (e) {
    status = "incomplete";
    interruption = e instanceof Error ? e.message : String(e);
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
    clearRunning(dir);
  }
  const summary = save();
  console.log(`  histories with a different final library: ${summary.histories_with_different_final_library}/${summary.histories_planned}`);
  for (const h of summary.histories) {
    console.log(`  ${h.id}: originals ${h.correct.originals}/${h.n}, maintained ${h.correct.maintained}/${h.n}, ${h.operational_failures} operational failures${h.unsupported ? " (unsupported native report)" : ""}`);
  }
  if (status !== "complete" || results.some(h => h.incomplete || h.operational_failures || h.unsupported)) process.exitCode = 1;
}

if (import.meta.main) main().catch((e) => { console.error(String(e)); process.exitCode = 2; });
