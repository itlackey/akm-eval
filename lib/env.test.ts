import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { type Sandbox, createSandbox, removeSandbox } from "./akm/akm.ts";

const ROOT = join(import.meta.dir, "..");

const dirs: string[] = [];
const sandboxes: Sandbox[] = [];
afterEach(() => {
  for (const s of sandboxes.splice(0)) removeSandbox(s);
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A repository root with a copy of lib/env.sh and this .env. */
function fakeRoot(env: string): string {
  const root = mkdtempSync(join(tmpdir(), "lib-env-test-"));
  dirs.push(root);
  mkdirSync(join(root, "lib"));
  copyFileSync(join(ROOT, "lib", "env.sh"), join(root, "lib", "env.sh"));
  writeFileSync(join(root, ".env"), env);
  return root;
}

/** Sources lib/env.sh of a root with this .env, from another folder, and returns these variables as bash then exports them. `preset` is the caller's environment. */
function loadEnv(env: string, names: string[], preset: Record<string, string> = {}): Record<string, string | undefined> {
  const script = 'set -euo pipefail; cd /; source "$1/lib/env.sh"; shift; for k in "$@"; do if v=$(printenv "$k"); then printf "%s=%s\\0" "$k" "$v"; fi; done';
  const run = Bun.spawnSync(["bash", "-c", script, "bash", fakeRoot(env), ...names], { env: { PATH: process.env.PATH as string, ...preset }, stdout: "pipe", stderr: "pipe" });
  expect(run.stderr.toString()).toBe("");
  expect(run.exitCode).toBe(0);
  const out: Record<string, string | undefined> = Object.fromEntries(names.map((n) => [n, undefined]));
  for (const pair of run.stdout.toString().split("\0").filter(Boolean)) {
    const at = pair.indexOf("=");
    out[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return out;
}

describe("lib/env.sh, the .env loader of the bash scripts", () => {
  test("exports KEY=value lines, with or without export, and strips one pair of quotes", () => {
    const env = loadEnv(["# a comment", "", "PLAIN=plain", "export EXPORTED=yes", 'DOUBLE="two words"', "SINGLE='one word'", "EMPTY=", "URL=http://h/v1?a=b#frag", "HASH=a#b", "NOT A KEY=x", "1BAD=x", ""].join("\n"), [
      "PLAIN", "EXPORTED", "DOUBLE", "SINGLE", "EMPTY", "URL", "HASH", "NOT", "1BAD",
    ]);
    expect(env).toEqual({ PLAIN: "plain", EXPORTED: "yes", DOUBLE: "two words", SINGLE: "one word", EMPTY: "", URL: "http://h/v1?a=b#frag", HASH: "a#b", NOT: undefined, "1BAD": undefined });
  });

  test("reads the last line without a newline, and lines that end in CR LF", () => {
    expect(loadEnv('FIRST=1\r\nSECOND="2"\r\nLAST=3', ["FIRST", "SECOND", "LAST"])).toEqual({ FIRST: "1", SECOND: "2", LAST: "3" });
  });

  test("a variable that is already set wins, even an empty one", () => {
    const env = loadEnv("SET=from-file\nEMPTY=from-file\nNEW=from-file\n", ["SET", "EMPTY", "NEW"], { SET: "from-caller", EMPTY: "" });
    expect(env).toEqual({ SET: "from-caller", EMPTY: "", NEW: "from-file" });
  });

  test("takes a line that starts with spaces or a tab, also with export, and skips an indented comment", () => {
    const env = loadEnv(["  SPACES=1", "\tTAB=2", "  export EXPORTED=3", "   export    SPACED=4", "  # NOT=5", "\t# ALSO_NOT=6"].join("\n"), ["SPACES", "TAB", "EXPORTED", "SPACED", "NOT", "ALSO_NOT"]);
    expect(env).toEqual({ SPACES: "1", TAB: "2", EXPORTED: "3", SPACED: "4", NOT: undefined, ALSO_NOT: undefined });
  });

  test("skips a line with no =, with or without export, instead of exporting the name as its own value", () => {
    const env = loadEnv(["DEBUG", "export ALSO", "  INDENTED  ", "AFTER=1"].join("\n"), ["DEBUG", "ALSO", "INDENTED", "AFTER"]);
    expect(env).toEqual({ DEBUG: undefined, ALSO: undefined, INDENTED: undefined, AFTER: "1" });
  });

  test("takes a key that has spaces or a tab before the =, and a line with an empty key is skipped", () => {
    const env = loadEnv(["SPACED =x", "TABBED\t=y", "export  BOTH  = z", "=nothing", "  =nothing"].join("\n"), ["SPACED", "TABBED", "BOTH"]);
    expect(env).toEqual({ SPACED: "x", TABBED: "y", BOTH: " z" });
  });

  test("a setting named like a variable the loader once used inside is still exported", () => {
    const names = ["file", "line", "key", "val", "stripped"];
    expect(loadEnv(names.map((n) => `${n}=set-${n}`).join("\n"), names)).toEqual(Object.fromEntries(names.map((n) => [n, `set-${n}`])));
  });

  test("an unquoted value ends at a # that has a space before it, and a quoted value keeps its # characters", () => {
    const env = loadEnv(
      ["PLAIN=small # the local one", "TABBED=x\t# note", "TWO=a #b #c", "ONLY= # nothing", "NOSPACE=a#b #c", 'DOUBLE="a # b"', "SINGLE='a # b'", 'QUOTED_SPACES="  kept  "'].join("\n"),
      ["PLAIN", "TABBED", "TWO", "ONLY", "NOSPACE", "DOUBLE", "SINGLE", "QUOTED_SPACES"],
    );
    expect(env).toEqual({ PLAIN: "small", TABBED: "x", TWO: "a", ONLY: "", NOSPACE: "a#b", DOUBLE: "a # b", SINGLE: "a # b", QUOTED_SPACES: "  kept  " });
  });

  test("does nothing when there is no .env", () => {
    const root = fakeRoot("");
    rmSync(join(root, ".env"));
    const run = Bun.spawnSync(["bash", "-c", 'set -euo pipefail; source "$1/lib/env.sh"; echo ok', "bash", root], { env: { PATH: process.env.PATH as string }, stdout: "pipe", stderr: "pipe" });
    expect([run.exitCode, run.stdout.toString().trim(), run.stderr.toString()]).toEqual([0, "ok", ""]);
  });

  test("an AKM_BIN of .env with a quoted ~/ reaches akm's command expanded", () => {
    const { AKM_BIN } = loadEnv('AKM_BIN="bun ~/code/akm/src/cli.ts"\n', ["AKM_BIN"]);
    expect(AKM_BIN).toBe("bun ~/code/akm/src/cli.ts");
    const saved = process.env.AKM_BIN;
    process.env.AKM_BIN = AKM_BIN;
    try {
      const sandbox = createSandbox("lib-env-test");
      sandboxes.push(sandbox);
      expect(sandbox.cmd).toEqual(["bun", `${homedir()}/code/akm/src/cli.ts`]);
    } finally {
      if (saved === undefined) delete process.env.AKM_BIN;
      else process.env.AKM_BIN = saved;
    }
  });

  test("every run, generate and label script, and generate-assets, source it and carry no loader of their own", () => {
    const scripts = [...new Bun.Glob("{evals,benchmarks}/*/{run,generate}").scanSync({ cwd: ROOT }), "evals/retrieval/label", "generate-assets"].sort();
    expect(scripts.length).toBeGreaterThanOrEqual(25);
    for (const script of scripts) {
      const text = readFileSync(join(ROOT, script), "utf8");
      expect([script, text.includes("\nsource lib/env.sh\n")]).toEqual([script, true]);
      expect([script, text.includes("IFS= read -r line")]).toEqual([script, false]);
    }
  });
});
