// The four judge evals (judge-gate, lesson-judge, pair-judge, drain-judge) put their judge on a harness through the one path of lib/judge.ts. For each: with a
// harness the sandbox has a HOME and an opencode config of its own and the harness in its akm config, a case asks akm for the harness with the model under
// test, and without one nothing changes.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Sandbox, removeSandbox } from "./akm/akm.ts";
import * as drain from "../evals/drain-judge/src/collect.ts";
import * as gate from "../evals/judge-gate/src/collect.ts";
import * as lesson from "../evals/lesson-judge/src/collect.ts";
import * as pair from "../evals/pair-judge/src/collect.ts";

const dirs: string[] = [];
const boxes: Sandbox[] = [];
afterEach(() => {
  for (const b of boxes.splice(0)) removeSandbox(b);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const EVALS = [
  { name: "judge-gate", open: gate.openSandbox, judgeCase: gate.judgeCase },
  { name: "lesson-judge", open: lesson.openSandbox, judgeCase: lesson.judgeCase },
  { name: "pair-judge", open: pair.openSandbox, judgeCase: pair.judgeCase },
  { name: "drain-judge", open: drain.openSandbox, judgeCase: drain.judgeCase },
] as const;

const URL = "http://localhost:9/v1";

for (const e of EVALS) {
  describe(e.name, () => {
    test("on a harness the sandbox has a HOME and an opencode config of its own, and the akm config names the harness", () => {
      const box = e.open(URL, "the-model", true, undefined, "openai", "opencode");
      boxes.push(box);
      expect(box.env.HOME).toBe(join(box.dir, "home"));
      expect(box.env.OPENCODE_DISABLE_CLAUDE_CODE).toBe("1");
      expect(box.env.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("1");
      const akmConfig = JSON.parse(readFileSync(join(box.env.AKM_CONFIG_DIR!, "config.json"), "utf8"));
      expect(akmConfig.harnesses).toEqual({ opencode: {} });
      const oc = JSON.parse(readFileSync(join(box.env.XDG_CONFIG_HOME!, "opencode", "opencode.json"), "utf8"));
      expect(Object.keys(oc.provider)).toEqual(["eval"]);
      expect(oc.provider.eval.models["the-model"].options).toEqual({ reasoningEffort: "none" });
      expect(oc.permission).toEqual({ "*": "deny" });
    });

    test("its run takes --harness opencode and says so in its usage", () => {
      const done = Bun.spawnSync(["bun", join(import.meta.dir, "..", "evals", e.name, "src", "run.ts"), "--help"], { stdout: "pipe", stderr: "pipe" });
      expect(done.exitCode).toBe(0);
      expect(done.stdout.toString()).toContain("[--harness opencode]");
      expect(done.stdout.toString()).toContain("  --harness opencode  put the judge on the opencode harness");
    });

    test("on a connection the sandbox keeps the caller's HOME, and has no harness and no opencode config", () => {
      const box = e.open(URL, "the-model", true);
      boxes.push(box);
      expect(box.env.HOME).toBe(process.env.HOME);
      expect(JSON.parse(readFileSync(join(box.env.AKM_CONFIG_DIR!, "config.json"), "utf8")).harnesses).toBeUndefined();
      expect(existsSync(join(box.dir, "xdg-config", "opencode"))).toBe(false);
    });

    test("a case asks akm for the harness with the model under test, and for the default connection when the run has no harness", async () => {
      const dir = mkdtempSync(join(tmpdir(), "harness-judge-"));
      dirs.push(dir);
      const script = join(dir, "fake.ts");
      const log = join(dir, "args.json");
      writeFileSync(script, `await Bun.stdin.text(); await Bun.write(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2))); process.exit(1);`);
      const box = e.open(URL, "the-model", false);
      boxes.push(box);
      const sandbox = { ...box, cmd: ["bun", script] };
      const c = { id: "c", input: {}, label: "good", mode: "new", kind: "x", origin: "real", a: { ref: "a", body: "" }, b: { ref: "b", body: "" }, safe: ["a"], source: "", candidate: "", feedback: "", category: "good" } as never;
      await e.judgeCase(c, { sandbox, baseUrl: URL, harness: "opencode", model: "the-model", timeoutMs: 5000 });
      const withHarness = JSON.parse(readFileSync(log, "utf8"));
      expect(withHarness.slice(2)).toEqual(["--harness", "opencode", "--model", "eval/the-model", "--format", "json"]);
      await e.judgeCase(c, { sandbox, baseUrl: URL, timeoutMs: 5000 });
      expect(JSON.parse(readFileSync(log, "utf8")).slice(2)).toEqual(["--format", "json"]);
    });
  });
}
