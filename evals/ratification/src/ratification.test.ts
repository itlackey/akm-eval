import { describe, expect, test } from "bun:test";
import { differences } from "./generate.ts";
import { metricsOf, parseCalls } from "./metrics.ts";
import { TASKS } from "./tasks.ts";

const bash = (id: string, command: string, output: string, exit = 0) => JSON.stringify({ type: "tool_use", part: { callID: id, tool: "bash", state: { input: { command }, output, metadata: { exit }, status: "completed" } } });
const plugin = (id: string, tool: string, output: string, status = "completed") => JSON.stringify({ type: "tool_use", part: { callID: id, tool, state: { input: { query: "x" }, output, status } } });

describe("generate", () => {
  test("the folders on disk are those of tasks.ts", () => expect(differences()).toEqual([]));
  test("every task has a reference, a check and a count of akm calls", () => {
    for (const t of TASKS) {
      expect(t.checks.length).toBeGreaterThan(0);
      expect(t.solve).toContain("akm");
      expect(t.refAkm).toBeGreaterThan(0);
    }
  });
});

describe("metrics", () => {
  const spec = { ref_akm: 1, old: String.raw`\bakm\s+health\b`, replacement: String.raw`\bakm\s+doctor\b` };
  test("counts akm calls of both kinds, errors, help and what is beyond the reference", () => {
    const stream = [bash("1", "akm help", "usage"), plugin("2", "akm_search", "{}"), bash("3", "akm bogus", '{"ok":false,"code":"UNKNOWN_COMMAND"}', 2), bash("4", "echo hi > a.txt", "")].join("\n");
    const m = metricsOf(parseCalls(stream), spec, true);
    expect(m).toMatchObject({ calls: 4, akm_calls: 3, other_calls: 1, unnecessary: 2, errors: 1, help_calls: 1, usage_errors: 1, recovered: false });
  });
  test("a later success after an error and a pass is a recovery", () => {
    const stream = [bash("1", "akm task validate x", '{"ok":false}', 2), bash("2", "akm lint", "{}")].join("\n");
    expect(metricsOf(parseCalls(stream), { ...spec, old: String.raw`akm task validate` }, true).recovered).toBe(true);
  });
  test("doctor's exit 4 is an answer, not an error", () => {
    expect(metricsOf(parseCalls(bash("1", "akm doctor", "{}", 4)), spec, true).errors).toBe(0);
  });
  test("a deprecated form is seen by its notice and the move to the replacement by the pattern", () => {
    const stream = [bash("1", "akm health", "[deprecated] akm health is deprecated\n{}"), bash("2", "akm doctor", "{}")].join("\n");
    expect(metricsOf(parseCalls(stream), spec, true)).toMatchObject({ old_used: true, moved_on: true, deprecated_notices: 1 });
    expect(metricsOf(parseCalls(bash("1", "akm health", "[deprecated] x")), spec, true).moved_on).toBe(false);
    expect(metricsOf(parseCalls(bash("1", "akm doctor", "{}")), spec, true)).toMatchObject({ old_used: false, moved_on: null });
  });
  test("a call written again with the same id is counted once", () => {
    const m = metricsOf(parseCalls([bash("1", "akm search x", ""), bash("1", "akm search x", "out")].join("\n")), spec, null);
    expect(m.akm_calls).toBe(1);
  });
});
