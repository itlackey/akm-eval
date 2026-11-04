// Copies the memories of other evals' corpora that the cases use into assets/bundle/base/memories, and records where each came from in assets/bundle/sources.json:
//   - the memories of distill's `lesson-worthy` cases (a failure with a cause and a fix that worked) and consolidate's `single` pool notes (a note on its own subject), as good sources;
//   - the memories of distill's `dated-status` cases (a status as of a date), as ephemeral ones.
// The real memories (memories.ts) are beside them. Nothing here calls a model.
//
//   bun evals/drain-judge/src/sources.ts

import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const EVALS = resolve(import.meta.dir, "..", "..");
const BUNDLE = resolve(import.meta.dir, "..", "assets", "bundle");
const OUT = join(BUNDLE, "base", "memories");
mkdirSync(OUT, { recursive: true });

const sourcesFile = join(BUNDLE, "sources.json");
const sources: Record<string, { origin: string; from: string; kind: string }> = existsSync(sourcesFile) ? JSON.parse(readFileSync(sourcesFile, "utf8")) : {};

const distill: { id: string; class: string }[] = JSON.parse(readFileSync(join(EVALS, "distill", "assets", "cases.json"), "utf8"));
for (const c of distill.filter((c) => c.class === "lesson-worthy" || c.class === "dated-status")) {
  const dir = join(EVALS, "distill", "assets", "bundles", c.id, "memories");
  for (const f of readdirSync(dir)) {
    copyFileSync(join(dir, f), join(OUT, f));
    sources[f] = { origin: "corpus", from: `evals/distill/assets/bundles/${c.id}/memories/${f}`, kind: c.class === "dated-status" ? "ephemeral" : "good" };
  }
}
const pool = join(EVALS, "consolidate", "assets", "pool");
const labels: { clusters: { kind: string; notes: string[] }[] } = JSON.parse(readFileSync(join(pool, "labels.json"), "utf8"));
for (const cl of labels.clusters.filter((c) => c.kind === "single")) {
  for (const n of cl.notes) {
    copyFileSync(join(pool, "memories", `${n}.md`), join(OUT, `${n}.md`));
    sources[`${n}.md`] = { origin: "corpus", from: `evals/consolidate/assets/pool/memories/${n}.md`, kind: "good" };
  }
}
writeFileSync(sourcesFile, `${JSON.stringify(Object.fromEntries(Object.entries(sources).sort()), null, 2)}\n`);
console.log(`sources: ${Object.keys(sources).length} memories`);
