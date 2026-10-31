import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { defaultOverrides } from "../../../lib/akm/overrides.ts";
import { promptOf, startStub } from "../../../scripts/smoke/src/lib.ts";
import { loadCases } from "./inputs.ts";
import { collect, pending, type Options } from "./collect.ts";
import { makeRow } from "./score.ts";

// Explicit opt-in only; an unsupported selected build FAILS, never silently skips.
describe.skipIf(process.env.AKM_EVAL_REAL_AKM !== "1")("memory-utility real AKM + scripted model", () => {
  const c = loadCases(join(import.meta.dir, "../assets"))[0]!;
  for (const mode of ["derived", "no-change", "malformed"] as const) test(mode, async () => {
    const generationPrompts: string[] = [];
    const stub = startStub(req => {
      const prompt = promptOf(req);
      if (prompt.startsWith("Answer the request using only")) {
        const ref = /<document ref="([^"]+)">\n[^<]*Cedar image worker runs on host willow-07/.exec(prompt)?.[1];
        return JSON.stringify({ answers: { host: ref ? "willow-07" : null }, citations: { host: ref ? [{ ref, quote: "Cedar image worker runs on host willow-07" }] : [] } });
      }
      generationPrompts.push(prompt);
      if (mode === "malformed") return "not JSON";
      return JSON.stringify(mode === "no-change" ? { noChange: true, title: "", description: "", content: "", tags: [], searchHints: [] } : {
        noChange: false, title: "Cedar worker placement", description: "The Cedar image worker runs on host willow-07.", content: "The Cedar image worker runs on host willow-07.", tags: ["cedar", "worker", "placement"], searchHints: ["Cedar image worker", "worker host", "Cedar placement"],
      });
    });
    try {
      const o: Options = { endpoint: { baseUrl: stub.url, apiKey: "", model: "scripted" }, provider: "openai", overrides: defaultOverrides(""), semantic: false, contextTokens: 1024, searchLimit: 10, timeoutMs: 30000, seed: "1" };
      const raw = await collect(c, pending(c, 0, o.seed), o), row = makeRow(c, raw);
      expect(raw.inference.outcome, raw.inference.error ?? "").toBe(mode === "malformed" ? "error" : mode === "derived" ? "output" : "no-change");
      expect(raw.arms.source.state, raw.arms.source.error ?? "").toBe("complete");
      expect(row.arms.source.correct).toBe(true);
      expect(row.arms.none.correct).toBe(false);
      expect(raw.arms.inferred.state, raw.arms.inferred.error ?? "").toBe(mode === "malformed" ? "error" : "complete");
      if (mode !== "malformed") expect(row.arms.inferred.correct).toBe(true);
      expect(generationPrompts.length).toBeGreaterThan(0);
      for (const p of generationPrompts) { expect(p).not.toContain(c.question); expect(p).not.toContain('"values"'); expect(p).not.toContain('"citations"'); }
      expect(stub.unexpected()).toEqual([]);
    } finally { stub.stop(); }
  }, 120000);
});
