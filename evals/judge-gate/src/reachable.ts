// Is a case's candidate what akm's reflect would write? Reflect keeps the body and rewrites the lines of the fields in its patch (description,
// when_to_use, and a title heading the body lacks); `applyReflectPatch` of the akm under test builds the candidate. This file calls that
// function, loaded from an akm checkout, so the candidate is akm's output and not a copy of its rules.
//
//   bun evals/judge-gate/src/reachable.ts --akm ~/code/akm [--cases DIR] [--rebuild]
//
// Without --rebuild it lists the cases whose candidate is not what akm writes for the patch the candidate stands for, and exits 1 if there
// are any. --rebuild writes akm's output into the candidates instead.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES } from "./inputs.ts";

/** What akm's reflect patches: the `description` and `when_to_use` values, and the text of a title heading the body lacks. */
export interface ReflectPatch {
  description?: string;
  when_to_use?: string;
  title?: string;
}

/** The parts of an akm checkout this file uses. */
export interface Akm {
  applyReflectPatch(patch: ReflectPatch, source: string, ref: string): { content: string } | undefined;
  parseFrontmatter(content: string): { data: Record<string, unknown> };
  splitFrontmatter(raw: string): { fmText: string | null; body: string };
  bodyHasH1(body: string): boolean;
}

/** akm's reflect code, from the checkout at `dir` (its dependencies are installed there). */
export async function loadAkm(dir: string): Promise<Akm> {
  const at = (file: string) => import(join(resolve(dir), "src", file));
  const [reflect, frontmatter, noise] = await Promise.all([at("commands/improve/reflect.ts"), at("core/asset/frontmatter.ts"), at("commands/improve/reflect-noise.ts")]);
  return { applyReflectPatch: reflect.applyReflectPatch, parseFrontmatter: frontmatter.parseFrontmatter, splitFrontmatter: noise.splitFrontmatter, bodyHasH1: noise.bodyHasH1 };
}

/** The patch a candidate stands for: the new values of `description` and `when_to_use`, and the title it adds as a heading. Nothing else of the candidate counts. */
export function patchOf(akm: Akm, source: string, candidate: string): ReflectPatch {
  const data = (text: string): Record<string, unknown> => (akm.splitFrontmatter(text).fmText === null ? {} : akm.parseFrontmatter(text).data);
  const before = data(source);
  const after = data(candidate);
  const patch: ReflectPatch = {};
  for (const key of ["description", "when_to_use"] as const) {
    const value = after[key];
    if (typeof value === "string" && value.trim() !== "" && value !== before[key]) patch[key] = value.trim();
  }
  const body = akm.splitFrontmatter(candidate).body;
  if (!akm.bodyHasH1(akm.splitFrontmatter(source).body) && akm.bodyHasH1(body)) patch.title = /^#[ \t]+(.+?)\s*$/m.exec(body)?.[1];
  return patch;
}

/** What akm's reflect writes for the patch the candidate stands for; the source itself when that patch changes nothing. */
export function rebuilt(akm: Akm, c: { source: string; candidate: string; ref?: string }): string {
  return akm.applyReflectPatch(patchOf(akm, c.source, c.candidate), c.source, c.ref ?? "")?.content ?? c.source;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { akm: { type: "string" }, cases: { type: "string" }, rebuild: { type: "boolean" } } });
  if (!values.akm) {
    console.error("reachable: --akm DIR (an akm checkout) is needed");
    process.exit(2);
  }
  const file = join(values.cases ? resolve(values.cases) : join(import.meta.dir, "..", "assets"), CASES);
  const akm = await loadAkm(values.akm);
  const cases = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { id: string; source: string; candidate: string; ref?: string });
  const off = cases.filter((c) => rebuilt(akm, c) !== c.candidate);
  if (values.rebuild) {
    for (const c of off) c.candidate = rebuilt(akm, c);
    writeFileSync(file, cases.map((c) => JSON.stringify(c)).join("\n") + "\n");
    console.log(`reachable: rebuilt ${off.length} of ${cases.length} candidates through applyReflectPatch`);
  } else {
    for (const c of off) console.error(`reachable: ${c.id} is not what akm writes for its patch`);
    console.log(`reachable: ${cases.length - off.length} of ${cases.length} candidates are what akm writes`);
    if (off.length > 0) process.exit(1);
  }
}
