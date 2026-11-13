// The tests of lib/judge.ts, against a fake akm that answers `judge --list` and `judge <name>` from the FAKE_* variables.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Sandbox, sandboxIn, useConfigForm } from "./akm/akm.ts";
import { callJudge, requireJudge, routeOf } from "./judge.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** An akm whose `judge --list` names reflect.quality at FAKE_SCHEMA (none when it is "none", no judge command when FAKE_NOJUDGE is set), and whose `judge reflect.quality` prints FAKE_OUT, or sleeps for FAKE_HANG. */
const FAKE = `
// \`judge\` moved under \`doctor\` in 0.10.261119, and 0.11 has only the new spelling: with FAKE_NEW the fake answers \`doctor judge\` alone, else \`judge\` alone.
let words = process.argv.slice(2);
if ((words[0] === "doctor") !== Boolean(process.env.FAKE_NEW)) { console.error("Unknown command " + words[0]); process.exit(2); }
if (words[0] === "doctor") words = words.slice(1);
const [a, b] = words;
if (a === "judge" && b === "--list") {
  if (process.env.FAKE_NOJUDGE) { console.error("Unknown command judge"); process.exit(2); }
  const schema = process.env.FAKE_SCHEMA;
  console.log(JSON.stringify({ judges: [{ name: "reflect.quality", ...(schema === "none" ? {} : { schemaVersion: Number(schema ?? 2) }) }, { name: "other" }] }));
  process.exit(0);
}
await Bun.stdin.text();
if (process.env.FAKE_ARGS) await Bun.write(process.env.FAKE_ARGS, JSON.stringify(process.argv.slice(2)));
if (process.env.FAKE_HANG) await Bun.sleep(60000);
console.log(process.env.FAKE_OUT ?? "");
process.exit(Number(process.env.FAKE_CODE ?? 0));
`;

function sandbox(env: Record<string, string> = {}): Sandbox {
  const dir = mkdtempSync(join(tmpdir(), "judge-lib-"));
  dirs.push(dir);
  const script = join(dir, "fake.ts");
  writeFileSync(script, FAKE);
  const box = sandboxIn(join(dir, "box"));
  return { ...box, cmd: ["bun", script], env: { ...box.env, ...env } };
}

const envelope = (outcome: string, rest: Record<string, unknown>) => JSON.stringify({ judge: "reflect.quality", schemaVersion: 2, runner: { kind: "connection", name: "judge", model: null }, outcome, ...rest });

describe("callJudge", () => {
  test("asks for the default connection unless the call names a harness, and then for it and its model", async () => {
    const box = sandbox({ FAKE_OUT: envelope("verdict", { verdict: { pass: true, score: 5 } }), FAKE_ARGS: join(tmpdir(), `judge-args-${process.pid}.json`) });
    dirs.push(box.env.FAKE_ARGS!);
    const args = async () => JSON.parse(await Bun.file(box.env.FAKE_ARGS!).text());
    await callJudge(box, "reflect.quality", {}, { timeoutMs: 5000 });
    expect(await args()).toEqual(["judge", "reflect.quality", "--format", "json"]);
    await callJudge(box, "reflect.quality", {}, { timeoutMs: 5000, harness: { name: "opencode", model: "eval/m" } });
    expect(await args()).toEqual(["judge", "reflect.quality", "--harness", "opencode", "--model", "eval/m", "--format", "json"]);
  });

  test("returns the envelope of a verdict, and of a judge that gave none (error, unparseable)", async () => {
    const verdict = await callJudge(sandbox({ FAKE_OUT: envelope("verdict", { verdict: { pass: true, score: 5 } }) }), "reflect.quality", {}, { timeoutMs: 5000 });
    expect(verdict).toMatchObject({ envelope: { outcome: "verdict", schemaVersion: 2, verdict: { pass: true, score: 5 } } });
    for (const outcome of ["error", "unparseable"]) {
      const none = await callJudge(sandbox({ FAKE_OUT: envelope(outcome, { reason: "no reply" }), FAKE_CODE: "1" }), "reflect.quality", {}, { timeoutMs: 5000 });
      expect(none).toMatchObject({ envelope: { outcome, reason: "no reply" } });
    }
  });

  test("anything else is akm failing, with the message masked by hide: a crash, text that is not JSON, JSON that is not an envelope, a verdict outcome with no verdict", async () => {
    const hide = (t: string) => t.replaceAll("http://host/v1", "<URL>");
    const cases: Record<string, string>[] = [
      { FAKE_OUT: "boom http://host/v1", FAKE_CODE: "70" },
      { FAKE_OUT: "[1, 2]" },
      { FAKE_OUT: "null" },
      { FAKE_OUT: envelope("verdict", {}) },
      { FAKE_OUT: envelope("weird", { reason: "x" }) },
      { FAKE_OUT: envelope("error", { verdict: { pass: true } }) },
    ];
    for (const env of cases) {
      const call = await callJudge(sandbox(env), "reflect.quality", {}, { timeoutMs: 5000, hide });
      expect(call).toMatchObject({ error: expect.stringMatching(/^akm exited \d+:/), timedOut: false });
      expect("envelope" in call).toBe(false);
    }
    expect(await callJudge(sandbox(cases[0]), "reflect.quality", {}, { timeoutMs: 5000, hide })).toMatchObject({ error: "akm exited 70: boom <URL>" });
  });

  test("a call past the time limit is killed and says so", async () => {
    const call = await callJudge(sandbox({ FAKE_HANG: "1" }), "reflect.quality", {}, { timeoutMs: 300 });
    expect(call).toMatchObject({ timedOut: true, error: expect.stringContaining("timed out") });
  });
});

describe("the doctor spelling", () => {
  test("goes through `doctor judge` on an akm from 0.10.261119, for a call and for the list, and through `judge` before", async () => {
    const out = envelope("verdict", { verdict: { pass: true, score: 5 } });
    useConfigForm("0.10.261120");
    try {
      const box = sandbox({ FAKE_NEW: "1", FAKE_OUT: out, FAKE_ARGS: join(tmpdir(), `judge-args-new-${process.pid}.json`) });
      dirs.push(box.env.FAKE_ARGS!);
      expect((await callJudge(box, "reflect.quality", {}, { timeoutMs: 5000 })).envelope).toBeDefined();
      expect(JSON.parse(await Bun.file(box.env.FAKE_ARGS!).text())).toEqual(["doctor", "judge", "reflect.quality", "--format", "json"]);
      await requireJudge(box, "reflect.quality", 2);
      await expect(requireJudge(sandbox({ FAKE_NEW: "1", FAKE_SCHEMA: "1" }), "reflect.quality", 2)).rejects.toThrow("has schemaVersion 1");
    } finally {
      useConfigForm("0.9.99");
    }
    expect((await callJudge(sandbox({ FAKE_OUT: out }), "reflect.quality", {}, { timeoutMs: 5000 })).envelope).toBeDefined();
  });
});

describe("requireJudge", () => {
  test("accepts a judge at the version asked for", async () => {
    await requireJudge(sandbox(), "reflect.quality", 2);
  });

  test("refuses any other schemaVersion, or none, and says which", async () => {
    await expect(requireJudge(sandbox({ FAKE_SCHEMA: "1" }), "reflect.quality", 2)).rejects.toThrow("has schemaVersion 1, and this eval reads 2");
    await expect(requireJudge(sandbox({ FAKE_SCHEMA: "3" }), "reflect.quality", 2)).rejects.toThrow("has schemaVersion 3, and this eval reads 2");
    await expect(requireJudge(sandbox({ FAKE_SCHEMA: "none" }), "reflect.quality", 2)).rejects.toThrow("has schemaVersion none");
  });

  test("refuses an akm with no such judge, or no `akm judge` at all", async () => {
    await expect(requireJudge(sandbox(), "distill.lesson", 1)).rejects.toThrow("has no `akm judge distill.lesson`");
    await expect(requireJudge(sandbox({ FAKE_NOJUDGE: "1" }), "reflect.quality", 2)).rejects.toThrow("has no `akm judge reflect.quality`");
  });
});

describe("routeOf", () => {
  test("is pass, else review when the verdict asks for one, else reject", () => {
    expect(routeOf({ pass: true })).toBe("pass");
    expect(routeOf({ pass: true, reviewNeeded: true })).toBe("pass");
    expect(routeOf({ pass: false, reviewNeeded: true })).toBe("review");
    expect(routeOf({ pass: false })).toBe("reject");
  });
});
