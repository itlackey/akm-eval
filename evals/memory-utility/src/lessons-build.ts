// build-lessons: runs akm's real distill on the notes of every case and keeps the pending lessons as assets/lessons.json, the fixture of
// `run --lessons`. One sandbox per case holds all its notes (as the answer libraries do); distill runs on one note at a time, as the distill
// eval runs it (`akm improve memories/<name> --strategy distill-only`). Nothing is accepted: a lesson counts if it is pending, which is what a
// person would be shown. A note whose distill command fails stops the build, so the fixture never hides an error as "no lesson".
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { createSandbox, removeSandbox, runAkm, runAkmJson, useAkm, writeConfig } from "../../../lib/akm/akm.ts";
import { OVERRIDE_OPTIONS, parseOverrides } from "../../../lib/akm/overrides.ts";
import { exitMessage, fail, hideEndpoint } from "../../../lib/cli.ts";
import { useModel } from "../../../lib/models.ts";
import { STATES, STRATEGY, configFor } from "../../distill/src/collect.ts";
import { loadCases, type Case } from "./inputs.ts";
import { LESSONS_FILE, type LessonCase, makeFixture, pendingLessons, sourceDigest } from "./lessons.ts";
import { place, sandboxRelative } from "./collect.ts";
import { sourceFiles } from "./protocol.ts";

const ASSETS = resolve(import.meta.dir, "..", "assets");
const usage = `Usage: evals/memory-utility/build-lessons --model ID [--akm COMMAND] [--semantic] [--config-patch FILE] [--cases DIR] [--timeout-ms N]
Writes <cases folder>/${LESSONS_FILE}: the lessons akm's distill queues for each case's notes. Needs a model; run once per akm build and model.`;

/** One case: distill on each note in a sandbox of the case's notes; the pending lessons and what happened to each note. */
export async function buildCase(c: Case, cfg: Record<string, any>, hide: (s: string) => string, timeoutMs: number): Promise<LessonCase> {
  const sandbox = createSandbox("memory-utility-lessons", { keepModelKey: true });
  const source = sourceFiles(c);
  const files: Record<string, string> = {}, notes: LessonCase["notes"] = {};
  let rejectedBefore = 0;
  try {
    writeConfig(sandbox, cfg); place(sandbox, source);
    await runAkmJson(sandbox, ["index", "--full"], { timeoutMs });
    for (const file of Object.keys(source)) {
      const name = file.replace(/^memories\//, "").replace(/\.md$/, "");
      const r = await runAkm(sandbox, ["improve", `memories/${name}`, "--strategy", STRATEGY, "--no-sync", "--require-engines", "--json-to-stdout", "--format", "json"], { timeoutMs });
      if (r.code !== 0 || r.timedOut) throw new Error(`${c.id} ${name}: ${sandboxRelative(hide(exitMessage(r.code, r.stderr, r.stdout)), sandbox.dir)}`);
      const listed = [];
      for (const status of STATES) listed.push({ status, ...(await runAkmJson<{ proposals?: unknown[] }>(sandbox, ["proposal", "list", "--status", status, "--detail", "full"], { timeoutMs })) });
      const found = pendingLessons(listed);
      const fresh = Object.keys(found.files).filter(p => !(p in files));
      for (const p of fresh) files[p] = found.files[p]!;
      notes[file] = fresh.length ? "lesson" : found.rejected > rejectedBefore ? "rejected" : "none";
      rejectedBefore = found.rejected;
    }
    return { source_sha256: sourceDigest(c), notes, files };
  } finally { removeSandbox(sandbox); }
}

async function main() {
  const { values: v } = parseArgs({ strict: true, options: { help: { type: "boolean", short: "h" }, model: { type: "string" }, akm: { type: "string" }, cases: { type: "string" }, "timeout-ms": { type: "string" }, ...OVERRIDE_OPTIONS } });
  if (v.help) { console.log(usage); return; }
  useAkm(v, fail); const model = useModel(v, fail);
  const folder = v.cases ? resolve(v.cases) : ASSETS;
  const cases = loadCases(folder);
  const timeoutMs = v["timeout-ms"] ? Number(v["timeout-ms"]) : 15 * 60_000;
  const overrides = parseOverrides(v, STRATEGY, fail);
  const cfg = configFor({ baseUrl: model.baseUrl, model: model.name, hasKey: model.hasKey, provider: model.provider, overrides });
  const probe = createSandbox("memory-utility-version");
  let version: string;
  try { version = (await runAkm(probe, ["--version"], { timeoutMs: 30000 })).stdout.trim(); } finally { removeSandbox(probe); }
  console.log(`build-lessons: ${cases.length} cases | ${model.name} at ${new URL(model.baseUrl).origin} | AKM ${version}`);
  const hide = (s: string) => hideEndpoint(s, model.baseUrl);
  const out: Record<string, LessonCase> = {};
  for (const c of cases) {
    out[c.id] = await buildCase(c, cfg, hide, timeoutMs);
    console.log(`  ${c.id}: ${Object.keys(out[c.id]!.files).length} lessons from ${c.notes.length} notes`);
  }
  writeFileSync(join(folder, LESSONS_FILE), JSON.stringify(makeFixture({ akm_version: version, model: model.name, strategy: STRATEGY }, out), null, 2) + "\n");
  console.log(`wrote ${join(folder, LESSONS_FILE)}`);
}
if (import.meta.main) main().catch(e => { console.error(String(e)); process.exit(1); });
