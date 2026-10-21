// A fake akm for the tests of the bakeoff eval: a script that answers the commands the collector runs, the way akm 0.9.26 does, from a plan the
// test sets in FAKE_PLAN. It keeps its state in the sandbox, logs every call to FAKE_LOG, and writes the files akm writes (a derived memory,
// an enriched memory, a session asset) into the bundle. It is not code of the eval: only tests import it.
//
// FAKE_PLAN is a JSON object. What each process does is looked up by the name of the file it reads, or by the process for a pool:
//   infer[<memory name>]     { derived: <file text> } | { noChange: true } | { skip: true } | { nothing: true } | { provider: true } | { crash: true } | { slow: true }
//   legacyInference          true: the memoryInference result has no noChange counter, as before akm#1208
//   noInference              true: the improve result has no memoryInference, as when the pass did not run
//   enrich[<memory name>]    { file: <memory file text>, say?: <the line akm prints on stderr> } | { crash: true }
//   repair[<lesson ref>]     { outcome: "queued", content } | { outcome: "error", error } | { crash: true }
//   session[<session id>]    { asset: <session asset text> } | { skip: <skipReason> } | { none: true } | { crash: true }
//   promote                  { refs: [<memory ref queued>], planned?: [<memory ref planned, default refs>], skipped?: { <ref>: <reason> }, failedChunks?: n, warnings?: [...], provider?: true } | { crash: true }

export const FAKE_AKM = `
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
const args = process.argv.slice(2);
const [cmd, ...rest] = args;
const plan = JSON.parse(process.env.FAKE_PLAN ?? "{}");
const bundle = process.env.AKM_BUNDLE_DIR;
const stateFile = process.env.AKM_STATE_DIR + "/fake.json";
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : { proposals: [] };
const save = () => writeFileSync(stateFile, JSON.stringify(state));
const out = (o) => console.log(JSON.stringify(o));
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const config = JSON.parse(readFileSync(process.env.AKM_CONFIG_DIR + "/config.json", "utf8"));
const engine = config.engines?.bakeoff ?? {};
const stdin = args.includes("--enrich") ? await Bun.stdin.text() : null;
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ args, cwd: process.cwd(), bundle, model: engine.model ?? null, temperature: engine.temperature ?? null, thinking: engine.enableThinking ?? null, autonomy: config.experimental?.improveAutonomy ?? null, key: process.env.MODEL_API_KEY ?? null, projects: process.env.AKM_CLAUDE_PROJECTS_DIR ?? null, stdin, strategy: flag("--strategy") ? config.improve?.strategies?.[flag("--strategy")] ?? null : null }) + "\\n");
const put = (path, text) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); };
const usage = (process_, failures = 0) => ({ byProcessEngineModel: [{ process: process_, engine: "bakeoff", model: plan.served ?? "served-model", calls: 1, failures }] });
const crash = () => { console.error(JSON.stringify({ error: "boom", code: "INTERNAL" })); process.exit(70); };

if (cmd === "--version") console.log("akm 0.9.99-test");
else if (cmd === "index") out({ ok: true });
else if (cmd === "improve") {
  const strategy = flag("--strategy");
  if (strategy === "bakeoff-memory-inference") {
    const dir = join(bundle, "memories");
    const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && !f.endsWith(".derived.md")).map((f) => f.slice(0, -3)) : [];
    const result = { considered: names.length, splitParents: 0, writtenFacts: 0, ...(plan.legacyInference ? {} : { noChange: 0 }), skippedNoFacts: 0 };
    let provider = false;
    for (const name of names) {
      const p = plan.infer?.[name] ?? { skip: true };
      if (p.crash) crash();
      if (p.slow) await new Promise((resolve) => setTimeout(resolve, 30000));
      if (p.provider) { provider = true; result.skippedNoFacts++; }
      else if (p.noChange) result.noChange++;
      else if (p.nothing) result.considered--;
      else if (p.skip) result.skippedNoFacts++;
      else { put(join(dir, name + ".derived.md"), p.derived); result.splitParents++; result.writtenFacts++; }
    }
    out({ ok: true, ...(plan.noInference ? {} : { memoryInference: result }), usageReport: usage("memoryInference", provider ? 1 : 0) });
  } else if (strategy === "bakeoff-schema-repair") {
    const ref = rest[0];
    const p = plan.repair?.[ref] ?? { outcome: "error", error: "LLM returned unparseable JSON for schema repair" };
    if (p.crash) crash();
    if (p.outcome === "queued") { state.proposals.push({ id: "prop-" + (state.proposals.length + 1), ref: "bundle//" + ref, source: "schema-repair", status: "pending", payload: { content: p.content } }); save(); }
    out({ ok: true, validationFailures: [{ ref, reason: "missing description" }], schemaRepairs: [p.outcome === "queued" ? { ref, outcome: "queued", proposalId: "prop-" + state.proposals.length } : { ref, outcome: p.outcome, error: p.error }], usageReport: usage("validation") });
  } else if (strategy === "bakeoff-consolidate-promote") {
    const p = plan.promote ?? { refs: [] };
    if (p.crash) crash();
    for (const ref of p.refs ?? []) state.proposals.push({ id: "prop-" + (state.proposals.length + 1), ref: "bundle//knowledge/" + ref.split("/")[1], source: "consolidate", status: "pending", promotionSource: ref, payload: { content: "x" } });
    state.proposals.push({ id: "prop-pair", ref: "bundle//memories/other", source: "consolidate-pair", status: "pending", payload: { content: "y" } });
    save();
    out({ ok: true, consolidation: { ok: true, totalChunks: 1, failedChunks: p.failedChunks ?? 0, warnings: p.warnings ?? ["Anti-collapse: injected 1 random cluster member(s)"], planned: (p.planned ?? p.refs ?? []).map((ref) => ({ op: "promote", ref, knowledgeRef: "knowledge/" + ref.split("/")[1] })), skipReasons: Object.entries(p.skipped ?? {}).map(([ref, reason]) => ({ ref, skips: [{ op: "promote", reason }] })) }, usageReport: usage("consolidate", p.provider ? 1 : 0) });
  } else { console.error("unexpected strategy " + strategy); process.exit(1); }
}
else if (cmd === "remember") {
  const name = flag("--name");
  const p = plan.enrich?.[name] ?? { file: "---\\n---\\n" + stdin };
  if (p.crash) crash();
  if (p.say) console.error(p.say);
  put(join(bundle, "memories", name + ".md"), p.file);
  out({ ok: true, ref: "bundle//memories/" + name, path: join(bundle, "memories", name + ".md"), shape: "remember" });
}
else if (cmd === "proposal" && rest[0] === "extract") {
  const id = flag("--session-id");
  const p = plan.session?.[id] ?? { none: true };
  if (p.crash) crash();
  if (p.asset) put(join(bundle, "sessions", "claude", id + ".md"), p.asset);
  out({ ok: true, sessions: [{ sessionId: id, candidateCount: 0, proposalIds: [], ...(p.skip ? { skipped: true, skipReason: p.skip } : {}) }], warnings: [] });
}
else if (cmd === "proposal" && rest[0] === "list") out({ totalCount: state.proposals.length, proposals: state.proposals });
else { console.error("unexpected " + args.join(" ")); process.exit(1); }
`;
