import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("required smoke skips publication changes and still runs for harness changes or dispatch", () => {
  const workflow = readFileSync(new URL("../.github/workflows/akm-smoke.yml", import.meta.url), "utf8");
  const block = workflow.match(/name: Check whether eval code changed[\s\S]*?run: \|\n([\s\S]*?)(?=\n      -)/)?.[1];
  expect(block).toBeDefined();
  const script = block!.split("\n").map(line => line.replace(/^          /, "")).join("\n");
  const dir = mkdtempSync(join(tmpdir(), "smoke-scope-")); dirs.push(dir);
  const git = (...args: string[]) => { const p = Bun.spawnSync(["git", ...args], { cwd: dir, stdout: "pipe", stderr: "pipe" }); expect(p.exitCode).toBe(0); return p.stdout.toString().trim(); };
  git("init"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.invalid");
  writeFileSync(join(dir, "initial"), "initial"); git("add", "."); git("commit", "-qm", "initial");
  let base = git("rev-parse", "HEAD");
  for (const [file, wanted] of [["reports/run/summary.json", "false"], ["scripts/ledger/src/data.ts", "false"], ["site/index.html", "false"], ["lib/harbor/harbor.ts", "true"]]) {
    mkdirSync(dirname(join(dir, file!)), { recursive: true }); writeFileSync(join(dir, file!), "fixture");
    git("add", "."); git("commit", "-qm", "fixture"); const head = git("rev-parse", "HEAD");
    const output = join(dir, ".git", "output"); writeFileSync(output, "");
    const result = Bun.spawnSync(["bash", "-c", script], { cwd: dir, env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", BASE_SHA: base, HEAD_SHA: head, GITHUB_OUTPUT: output } });
    expect(result.exitCode).toBe(0); expect(readFileSync(output, "utf8").trim()).toBe(`run=${wanted}`); base = head;
  }
  const output = join(dir, ".git", "output"); writeFileSync(output, "");
  expect(Bun.spawnSync(["bash", "-c", script], { cwd: dir, env: { ...process.env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_OUTPUT: output } }).exitCode).toBe(0);
  expect(readFileSync(output, "utf8").trim()).toBe("run=true");
});
