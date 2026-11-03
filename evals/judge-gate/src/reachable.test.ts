import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCases } from "./lib.ts";
import { loadAkm, rebuilt } from "./reachable.ts";

// These tests run akm's own applyReflectPatch, so they need a checkout of akm with its dependencies installed: AKM_CHECKOUT=DIR bun test.
const checkout = process.env.AKM_CHECKOUT;

describe.skipIf(!checkout)("the candidates are what akm's reflect writes", () => {
  const cases = parseCases(readFileSync(join(import.meta.dir, "..", "assets", "cases.jsonl"), "utf8"));

  test("every case's candidate is applyReflectPatch's output for the patch it stands for", async () => {
    const akm = await loadAkm(checkout as string);
    expect(cases.filter((c) => rebuilt(akm, c) !== c.candidate).map((c) => c.id)).toEqual([]);
  });

  test("a candidate that akm would not write is found", async () => {
    const akm = await loadAkm(checkout as string);
    const c = cases[0] as (typeof cases)[number];
    const dated = c.candidate.replace(/^updated:.*$/m, "updated: 2099-01-01");
    expect(dated).not.toBe(c.candidate);
    expect(rebuilt(akm, { ...c, candidate: dated })).toBe(c.candidate);
    const body = c.candidate.replace(/\n---\n/, "\n---\n\nAn added introduction.\n");
    expect(rebuilt(akm, { ...c, candidate: body })).toBe(c.candidate);
  });
});
