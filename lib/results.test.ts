import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RUNNING, clearRunning, makeResultsDir, markRunning } from "./results.ts";

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

  test("makes the parent folder, and skips a name that a file or a folder already holds", () => {
    const parent = join(tmp(), "not", "yet");
    const first = makeResultsDir(parent, "run");
    expect(existsSync(first)).toBe(true);
    writeFileSync(`${first}-2`, "a file"); // -2 is taken by a file, -3 by a folder
    mkdirSync(`${first}-3`);
    expect(makeResultsDir(parent, "run")).toBe(`${first}-4`);
  });

  test("an error that is not a taken name is thrown, not retried", () => {
    const blocked = join(tmp(), "a file");
    writeFileSync(blocked, "");
    expect(() => makeResultsDir(blocked, "run")).toThrow();
  });

  test("runs that start together get a folder each: the folder is made by the call that claims the name", async () => {
    const parent = tmp();
    const script = join(parent, "claim.ts");
    writeFileSync(script, `import { makeResultsDir } from ${JSON.stringify(join(import.meta.dir, "results.ts"))};\nconsole.log(makeResultsDir(${JSON.stringify(join(parent, "results"))}, "x"));\n`);
    const claims = await Promise.all(
      Array.from({ length: 8 }, async () => {
        const proc = Bun.spawn(["bun", script], { stdout: "pipe", stderr: "pipe" });
        const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
        return { dir: out.trim(), err, code };
      }),
    );
    expect(claims.map((c) => [c.code, c.err])).toEqual(claims.map(() => [0, ""]));
    const dirs = claims.map((c) => c.dir);
    expect(new Set(dirs).size).toBe(8);
    for (const dir of dirs) expect(existsSync(dir)).toBe(true);
  }, 60_000);
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

describe("markRunning", () => {
  test("marks a folder that already exists with this process's pid, and clearRunning takes the mark off again", () => {
    const dir = tmp();
    expect(existsSync(join(dir, RUNNING))).toBe(false);
    markRunning(dir);
    expect(readFileSync(join(dir, RUNNING), "utf8").trim()).toBe(String(process.pid));
    markRunning(dir); // twice is fine
    clearRunning(dir);
    expect(existsSync(join(dir, RUNNING))).toBe(false);
  });
});

describe("the .running marker of a run in its own process", () => {
  /** Runs a script that makes a results folder under `parent`, or marks `parent` itself when `resume` is set, then does `after`; resolves with the folder and the process once it printed the folder. */
  async function start(parent: string, after: string, resume = false) {
    const script = join(parent, "run.ts");
    const make = resume ? `(markRunning(${JSON.stringify(parent)}), ${JSON.stringify(parent)})` : `makeResultsDir(${JSON.stringify(parent)}, "x")`;
    writeFileSync(script, `import { makeResultsDir, markRunning } from ${JSON.stringify(join(import.meta.dir, "results.ts"))};\nconsole.log(${make});\n${after}`);
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

  test("a folder marked by markRunning, as a resumed run does, holds the pid while the run is alive and is gone after the end", async () => {
    const parent = tmp();
    const { dir, proc } = await start(parent, "await Bun.sleep(300);", true);
    expect(dir).toBe(parent);
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
