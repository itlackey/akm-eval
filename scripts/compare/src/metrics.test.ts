import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { scores } from "../../ledger/src/presentation.ts";
import { comparisonFields } from "../../ledger/src/comparison.ts";
// The former matrix's recorded summaries remain fixtures for shared metric presentation.
for (const name of readdirSync(join(import.meta.dir, "fixtures/recorded"))) {
  test(`recorded ${name} retains readable quality metrics`, () => {
    const summary = JSON.parse(readFileSync(join(import.meta.dir, "fixtures/recorded", name), "utf8"));
    const result = scores(summary);
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(s => s.value !== null)).toBe(true);
    expect(comparisonFields(summary, null, result).quality_metric).toBeString();
  });
}
