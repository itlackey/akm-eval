// The numbers in assets/README.md and ADJUDICATION.md are the cases'.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CASES, HELD_OUT } from "./inputs.ts";
import { parseCases } from "./lib.ts";

const dir = join(import.meta.dir, "..", "assets");
const read = (f: string) => readFileSync(join(dir, f), "utf8");
const scored = parseCases(read(CASES));
const held = parseCases(read(HELD_OUT));
const all = [...scored, ...held];
const n = (cs: typeof all, category: string) => cs.filter((c) => c.category === category).length;

describe("the assets README", () => {
  const readme = read("README.md");
  test("counts the cases", () => {
    expect(readme).toContain(`${all.length} consolidate promotions`);
    expect(readme).toContain(`${all.filter((c) => c.label === "good").length} are good and ${all.filter((c) => c.label === "bad").length} are bad: ephemeral ${n(all, "ephemeral")}, duplicate ${n(all, "duplicate")} and stale ${n(all, "stale")}`);
    expect(readme).toContain(`${scored.length} are scored, and ${held.length} are held out`);
    expect(readme).toContain(`\`heldout.jsonl\` holds ${held.length} cases`);
  });

  test("counts the sources", () => {
    const of = (set: string, category?: string) => all.filter((c) => c.set === set && (!category || c.category === category)).length;
    expect(readme).toContain(`| \`extract-run\` (\`real\`) | ${of("extract-run", "good")} good, ${of("extract-run", "ephemeral")} ephemeral |`);
    expect(readme).toContain(`| \`distill-corpus\` (\`corpus\`) | ${of("distill-corpus", "good")} good, ${of("distill-corpus", "ephemeral")} ephemeral |`);
    expect(readme).toContain(`| \`consolidate-pool\` (\`corpus\`) | ${of("consolidate-pool")} good |`);
    expect(readme).toContain(`| \`hand-written-duplicate\` (\`hand-written\`) | ${of("hand-written-duplicate")} |`);
    expect(readme).toContain(`| \`hand-written-ephemeral\`, \`hand-written-stale\` (\`hand-written\`) | ${of("hand-written-ephemeral")} each |`);
    expect(of("hand-written-stale")).toBe(of("hand-written-ephemeral"));
    expect(readme).toContain(`${all.filter((c) => c.origin === "hand-written").length} of the ${all.filter((c) => c.label === "bad").length} bad cases are notes written for the eval`);
  });
});

describe("the held-out part", () => {
  test("is whole families", () => {
    const families = new Set(held.map((c) => c.family));
    expect(scored.filter((c) => families.has(c.family))).toEqual([]);
  });
  test("has every category", () => {
    for (const category of ["good", "ephemeral", "duplicate", "stale"]) expect(n(held, category)).toBeGreaterThan(0);
  });
});

describe("the adjudication log", () => {
  const log = read("ADJUDICATION.md");
  test("counts the scored and held-out cases of each category", () => {
    for (const category of ["good", "ephemeral", "duplicate", "stale"]) expect(log).toContain(`| ${category} | ${n(scored, category)} | ${n(held, category)} |`);
  });
  test("names only cases that exist", () => {
    const ids = new Set(all.map((c) => c.id));
    const named = [...log.matchAll(/`((?:good|ephemeral|duplicate|stale)-[a-z0-9-]+)`/g)].map((m) => m[1] as string);
    expect(named.filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe("every case", () => {
  test("has a reason for its label", () => {
    expect(all.filter((c) => c.labelReason.trim().length < 20).map((c) => c.id)).toEqual([]);
  });
  test("is a promotion the drain sends for the reason it gives, and none carries a name from the machine that made it", () => {
    for (const c of all) {
      expect(c.input.reason).toBe("needs-judgment");
      expect(c.input.liveAsset).toBeUndefined();
      expect(JSON.stringify(c)).not.toContain("founder3");
    }
  });
  test("names no note by the kind it was written to be: the judge reads the refs", () => {
    // The library's own notes (the promotion eval's) are left as they are.
    const ours = new Set(Object.keys(JSON.parse(read("bundle/sources.json"))).filter((f) => f.startsWith("dup/knowledge/")).map((f) => f.replace(/^dup\//, "").replace(/\.md$/, "")));
    const named = (ref: string) => /-(status|legacy|reference)$/.test(ref);
    expect(all.filter((c) => named(c.input.proposal.ref) || (c.input.neighbours ?? []).some((n) => ours.has(n.ref) && named(n.ref))).map((c) => c.id)).toEqual([]);
    expect(all.filter((c) => c.category === "duplicate" && !ours.has(c.input.neighbours?.[0]?.ref ?? "")).map((c) => c.id)).toEqual([]);
  });
});
