import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNNING, clearRunning, makeResultsDir } from "./results.ts";

const parents: string[] = [];
const tmp = () => {
  const dir = mkdtempSync(join(tmpdir(), "results-lib-test-"));
  parents.push(dir);
  return dir;
};
afterEach(() => {
  for (const d of parents.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("makeResultsDir", () => {
  test("makes <date>-<label> and a numbered sibling when the name is taken, each marked with this process's pid", () => {
    const parent = tmp();
    const first = makeResultsDir(parent, "run");
    const second = makeResultsDir(parent, "run");
    expect(first).toMatch(/\/\d{4}-\d{2}-\d{2}-run$/);
    expect(second).toBe(`${first}-2`);
    for (const dir of [first, second]) expect(readFileSync(join(dir, RUNNING), "utf8").trim()).toBe(String(process.pid));
  });
});

describe("clearRunning", () => {
  test("removes the marker of a folder whose run is done, and only that folder's", () => {
    const parent = tmp();
    const done = makeResultsDir(parent, "done");
    const going = makeResultsDir(parent, "going");
    clearRunning(done);
    expect(existsSync(join(done, RUNNING))).toBe(false);
    expect(existsSync(join(going, RUNNING))).toBe(true);
    clearRunning(done); // twice is fine
  });
});

describe("the .running marker of a run in its own process", () => {
  /** Runs a script that makes a results folder under `parent`, then does `after`; resolves with the folder and the process once it printed the folder. */
  async function start(parent: string, after: string) {
    const script = join(parent, "run.ts");
    writeFileSync(script, `import { makeResultsDir } from ${JSON.stringify(join(import.meta.dir, "results.ts"))};\nconsole.log(makeResultsDir(${JSON.stringify(parent)}, "x"));\n${after}`);
    const proc = Bun.spawn(["bun", script], { stdout: "pipe", stderr: "pipe" });
    const reader = proc.stdout.getReader();
    let out = "";
    while (!out.includes("\n")) out += new TextDecoder().decode((await reader.read()).value);
    return { dir: out.trim(), proc };
  }

  test("holds the pid while the run is alive and is gone after a normal end", async () => {
    const parent = tmp();
    const { dir, proc } = await start(parent, "await Bun.sleep(300);");
    expect(readFileSync(join(dir, RUNNING), "utf8").trim()).toBe(String(proc.pid));
    expect(await proc.exited).toBe(0);
    expect(existsSync(join(dir, RUNNING))).toBe(false);
  });

  test("is gone after process.exit with a failure code", async () => {
    const { dir, proc } = await start(tmp(), "process.exit(3);");
    expect(await proc.exited).toBe(3);
    expect(existsSync(join(dir, RUNNING))).toBe(false);
  });

  test("kill of the pid in the file stops the run and removes the file", async () => {
    const { dir, proc } = await start(tmp(), "await Bun.sleep(60_000);");
    process.kill(Number(readFileSync(join(dir, RUNNING), "utf8")), "SIGTERM");
    await proc.exited;
    expect(proc.signalCode).toBe("SIGTERM");
    expect(existsSync(join(dir, RUNNING))).toBe(false);
  });
});
