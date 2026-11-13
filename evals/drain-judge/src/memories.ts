// Makes the source memories of the cases: akm's own extract, with the model under test as its engine, run on the sessions of the extract eval that hold something
// to keep, and each proposal it queues accepted into a bundle. Each memory is the file akm wrote, with the frontmatter extract stamps.
//
//   bun evals/drain-judge/src/memories.ts --model ID [--akm COMMAND]      (AKM_BIN or --akm runs akm; see ../README.md, "How the cases were made")

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmVersion, createSandbox, extractSessionsArgs, removeSandbox, runAkm, runAkmJson, useAkm, useConfigForm, writeConfig } from "../../../lib/akm/akm.ts";
import { useModel } from "../../../lib/models.ts";
import { STRATEGY, extractConfig } from "../../extract/src/collect.ts";

const EXTRACT = resolve(import.meta.dir, "..", "..", "extract", "assets");
const BUNDLE = resolve(import.meta.dir, "..", "assets", "bundle");
const OUT = join(BUNDLE, "base", "memories");
const KEEP = new Set(["insight", "preference", "buried"]);

const { values } = parseArgs({ options: { model: { type: "string" }, akm: { type: "string" }, only: { type: "string" } } });
const fail = (m: string): never => {
  console.error(m);
  process.exit(2);
};
useAkm(values, fail);
const model = useModel(values, fail);
const probe = createSandbox("drain-judge-memories");
useConfigForm(await akmVersion(probe));
removeSandbox(probe);

const cases: { id: string; class: string }[] = JSON.parse(readFileSync(join(EXTRACT, "cases.json"), "utf8")).filter((c: any) => KEEP.has(c.class));
const sessions = new Map<string, { project: string; file: string }>();
for (const project of readdirSync(join(EXTRACT, "sessions"))) for (const f of readdirSync(join(EXTRACT, "sessions", project))) sessions.set(f.replace(/\.jsonl$/, ""), { project, file: join(EXTRACT, "sessions", project, f) });

mkdirSync(OUT, { recursive: true });
const sourcesFile = join(BUNDLE, "sources.json");
const made: Record<string, { origin: string; from: string; kind: string }> = (() => {
  try {
    return JSON.parse(readFileSync(sourcesFile, "utf8"));
  } catch {
    return {};
  }
})();
for (const c of cases.filter((c) => !values.only || c.id === values.only)) {
  const s = sessions.get(c.id)!;
  const sandbox = createSandbox("drain-judge-memories", { keepModelKey: true });
  try {
    writeConfig(sandbox, extractConfig(model.baseUrl, model.name, model.hasKey, model.provider));
    const projects = join(sandbox.dir, "projects");
    mkdirSync(join(projects, s.project), { recursive: true });
    cpSync(s.file, join(projects, s.project, `${c.id}.jsonl`));
    sandbox.env.AKM_CLAUDE_PROJECTS_DIR = projects;
    const r = await runAkm(sandbox, ["proposal", "extract", ...extractSessionsArgs("claude"), "--location", projects, "--session-id", c.id, "--strategy", STRATEGY, "--format", "json"], { timeoutMs: 15 * 60_000 });
    const listed = await runAkmJson<{ proposals?: { id: string; ref: string; source: string }[] }>(sandbox, ["proposal", "list", "--status", "pending", "--detail", "full"]);
    const mine = (listed.proposals ?? []).filter((p) => p.source === "extract" && p.ref.includes("memories/"));
    if (mine.length > 0) await runAkm(sandbox, ["proposal", "accept", ...mine.map((p) => p.id)], { timeoutMs: 5 * 60_000 });
    const dir = join(sandbox.env.AKM_BUNDLE_DIR, "memories");
    const files = (function walk(d: string): string[] {
      try {
        return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
      } catch {
        return [];
      }
    })(dir);
    for (const f of files) {
      const name = f.slice(dir.length + 1);
      mkdirSync(join(OUT, name, ".."), { recursive: true });
      writeFileSync(join(OUT, name), readFileSync(f).toString().replaceAll(/human:\S+/g, "human:user"));
      made[name] = { origin: "real", from: `evals/extract/assets/sessions: ${c.id} (${c.class})`, kind: "good" };
    }
    console.log(`${c.id}: ${r.code === 0 ? "ok" : `exit ${r.code}`}, ${mine.length} proposal(s), ${files.length} memory file(s)`);
  } catch (e) {
    console.log(`${c.id}: ${(e as Error).message}`);
  } finally {
    removeSandbox(sandbox);
  }
}
writeFileSync(sourcesFile, `${JSON.stringify(Object.fromEntries(Object.entries(made).sort()), null, 2)}\n`);
