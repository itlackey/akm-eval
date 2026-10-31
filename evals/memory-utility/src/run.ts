import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { akmBuild, createSandbox, dirtyFingerprint, removeSandbox, runAkm, useAkm } from "../../../lib/akm/akm.ts";
import { parseOverrides } from "../../../lib/akm/overrides.ts";
import { buildManifest, caseDigests, corpusFolderOf, HARNESS_VERSION, REPO_ROOT } from "../../../lib/manifest.ts";
import { endpointDigest, engineSettings, redactActors, redactConfig, sha256Json } from "../../../lib/provenance.ts";
import { useModel } from "../../../lib/models.ts";
import { fail, gitCommit, slug } from "../../../lib/cli.ts";
import { clearRunning, makeResultsDir } from "../../../lib/results.ts";
import { repeatRuns } from "../../../lib/repeat.ts";
import { CORPUS_OPTIONS, announceCases, resolveCorpora } from "../../../lib/corpus.ts";
import { loadCases } from "./inputs.ts";
import { collect, configFor, pending, type Options } from "./collect.ts";
import { ARMS, PROMPT, readerSettings } from "./protocol.ts";
import { MEASUREMENT } from "./measurement.ts";
import { makeRow, summarize } from "./score.ts";

const usage = `Usage: evals/memory-utility/run [options]

  --model ID           Reader and native inference model (MODEL_NAME otherwise).
  --akm COMMAND        AKM command, not a package spec.
  --corpus public|custom|all  public (default); custom/all require cases.
  --cases DIR          Custom cases.json directory; no automatic rewrite.
  --limit N            Select first N independent cases (default all).
  --label NAME         Results label (model name by default).
  --semantic           Require semantic retrieval and full embedding coverage.
  --config-patch FILE  Existing native AKM config patch, including embedding engine.
  --context-tokens N   Memory budget estimated as characters/4 (default 1024).
  --search-limit N     Candidate search hits before context packing (default 10).
  --timeout-ms N       Per AKM command / reader request timeout (default 120000).
  --seed TEXT          Reproducible counterbalanced arm order (default 1).
  --repeat N           Separate independent collections (default one).
  --help               Show this help; no model or AKM calls.
`;
/** The results label, as every eval takes it: --label as given (letters, digits, dot, dash, underscore), else the model name as a slug. */
export function resultsLabel(given: string | undefined, model: string): string {
  const label = given ?? slug(model);
  if (!/^[A-Za-z0-9._-]+$/.test(label)) fail("--label may use letters, digits, dot, dash and underscore");
  return label;
}
function positive(text: string | undefined, fallback: number, name: string): number {
  if (text === undefined) return fallback;
  const n = Number(text); if (!Number.isInteger(n) || n < 1) fail(`${name} must be a positive integer`); return n;
}
async function main() {
  const { values: v } = parseArgs({ strict: true, options: {
    help: { type: "boolean", short: "h" }, model: { type: "string" }, akm: { type: "string" }, ...CORPUS_OPTIONS, limit: { type: "string" }, label: { type: "string" },
    semantic: { type: "boolean" }, "config-patch": { type: "string" }, "context-tokens": { type: "string" }, "search-limit": { type: "string" }, "timeout-ms": { type: "string" }, seed: { type: "string" }, repeat: { type: "string" },
  } });
  if (v.help) { console.log(usage); return; }
  const corpora = resolveCorpora({ eval: MEASUREMENT.eval, values: v, publicFolder: join(REPO_ROOT, "evals/memory-utility/assets"), rewrite: false, fail })
    .map(corpus => ({ ...corpus, cases: loadCases(corpus.folder).slice(0, positive(v.limit, Number.MAX_SAFE_INTEGER, "--limit")) }));
  useAkm(v, fail); const model = useModel(v, fail); const baseLabel = resultsLabel(v.label, model.name);
  await announceCases(v, [{ role: "model", name: model.name, baseUrl: model.baseUrl }]);
  const o: Options = { endpoint: { baseUrl: model.baseUrl, apiKey: model.apiKey, model: model.name, chat: model.chat }, provider: model.provider,
    overrides: parseOverrides(v, "", fail), semantic: !!v.semantic, contextTokens: positive(v["context-tokens"], 1024, "--context-tokens"), searchLimit: positive(v["search-limit"], 10, "--search-limit"), timeoutMs: positive(v["timeout-ms"], 120000, "--timeout-ms"), seed: v.seed ?? "1" };
  const config = configFor(o), build = akmBuild();
  const probe = createSandbox("memory-utility-version");
  let version: string;
  try {
    const result = await runAkm(probe, ["--version"], { timeoutMs: 30000 });
    if (result.code !== 0) fail("AKM version probe failed"); version = result.stdout.trim();
  } finally { removeSandbox(probe); }
  console.log(`Reader/inference destination: ${new URL(model.baseUrl).origin} (no corpus is published). Read README before interpreting scores.`);
  const collectorCommit = gitCommit(REPO_ROOT), collectorFingerprint = dirtyFingerprint(REPO_ROOT);
  for (const { name: corpus, folder, cases } of corpora) {
    console.log(`memory-utility (${corpus}) | ${cases.length} cases × 3 arms | ${model.name} | AKM ${version} | ${o.semantic ? "semantic" : "keyword"} | ${o.contextTokens} estimated context tokens | one sequential case at a time`);
    const selected = cases.map(c => c.id), digests = caseDigests(MEASUREMENT, cases);
    const evalSettings = { context_tokens_estimated: o.contextTokens, search_limit: o.searchLimit, search_mode: o.semantic ? "semantic" : "keyword", reader_settings_sha256: sha256Json(readerSettings(model.chat)), reader_endpoint_sha256: endpointDigest(model.baseUrl), embedding_settings_sha256: sha256Json(redactConfig(config.embedding ?? null)), embedding_endpoint_sha256: endpointDigest(config.embedding?.endpoint), embedding_model: config.embedding?.model ?? config.embedding?.localModel ?? null, prompt_sha256: sha256Json(PROMPT), corpus_input_sha256: sha256Json(Object.fromEntries(Object.entries(digests).map(([id, d]) => [id, d.input_sha256]))), corpus_labels_sha256: sha256Json(Object.fromEntries(Object.entries(digests).map(([id, d]) => [id, d.label_sha256]))), ordering: "six counterbalanced permutations; seed offsets case ordinal" };
    await repeatRuns(v.repeat ? positive(v.repeat, 1, "--repeat") : undefined, baseLabel, async label => {
      const resultParent = corpus === "public" ? join(REPO_ROOT, "evals/memory-utility/results") : join(REPO_ROOT, "private/memory-utility/results");
      const dir = makeResultsDir(resultParent, label), start = performance.now();
      const raw = cases.map((c, i) => pending(c, i, o.seed));
      let status = "running", abortedReason: string | null = null;
      const save = () => {
        const rows = cases.map((c, i) => makeRow(c, raw[i]!));
        const summary = { eval: MEASUREMENT.eval, version: MEASUREMENT.version, scoring_version: MEASUREMENT.scoringVersion ?? MEASUREMENT.version, harness_version: HARNESS_VERSION, date: new Date().toISOString(), label, corpus, corpus_folder: corpus === "custom" ? corpusFolderOf(folder) : null,
          git_commit: collectorCommit, collector_fingerprint: collectorFingerprint, model: model.name, akm_version: version, ...build,
          limit: v.limit ? Number(v.limit) : null, seed: o.seed, timeout_ms: o.timeoutMs, search_mode: evalSettings.search_mode, config: redactConfig(config), reader_settings: readerSettings(model.chat),
          assets_sha256: sha256Json(digests), status, aborted_reason: abortedReason, wall_seconds: (performance.now() - start) / 1000,
          ...summarize(rows), manifest: buildManifest({ measurement: MEASUREMENT, corpus, cases: digests, config,
            akm: { version, bin: build.akm_bin, build: build.akm_build, build_fingerprint: build.akm_build_fingerprint },
            engines: { ...engineSettings(config).engines, reader: { model: model.name, endpoint: "<MODEL_BASE_URL>", endpoint_sha256: endpointDigest(model.baseUrl), temperature: readerSettings(model.chat).temperature, enableThinking: null, timeoutMs: o.timeoutMs } },
            settings: { strategy: "bakeoff-memory-inference", config_patch_sha256: o.overrides.configPatch?.sha256 ?? null, timeout_ms: o.timeoutMs, seed: o.seed }, eval_settings: evalSettings,
            completion: { selected, scored: rows.filter(r => ARMS.every(a => r.arms[a].evaluated)).map(r => r.id), errored: rows.filter(r => ARMS.some(a => r.raw.arms[a].state === "error")).map(r => r.id) } }) };
        // akm stamps notes with the OS login (human:<login>); published results must not carry it, as in lib/run.ts.
        writeFileSync(join(dir, "samples.jsonl"), rows.map(r => JSON.stringify(redactActors(r))).join("\n") + "\n");
        writeFileSync(join(dir, "summary.json"), JSON.stringify(redactActors(summary), null, 2) + "\n");
        return { ...summary, results_dir: dir };
      };
      const stop = (signal: string) => { status = "aborted"; abortedReason = signal; save(); clearRunning(dir); process.exit(signal === "SIGINT" ? 130 : 143); };
      const interrupt = () => stop("SIGINT"), terminate = () => stop("SIGTERM");
      process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
      save();
      try {
        for (let i = 0; i < cases.length; i++) {
          await collect(cases[i]!, raw[i]!, o, save);
          console.log(`  ${i + 1}/${cases.length} ${cases[i]!.id}: ${ARMS.map(a => `${a}=${raw[i]!.arms[a].state}`).join(" ")}`);
        }
        status = "complete";
      } catch (e) { status = "aborted"; abortedReason = String(e); process.exitCode = 1; }
      finally { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); clearRunning(dir); }
      const result = save(); console.log(`Results: ${dir}`); return result;
    });
  }
}
if (import.meta.main) main().catch(e => { console.error(String(e)); process.exitCode = 2; });
