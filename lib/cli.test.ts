import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Fatal, exitMessage, fail, failureMessage, generateArgs, gitCommit, hideEndpoint, slug } from "./cli.ts";

const dirs: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "cli-test-"));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const thrown = (fn: () => unknown): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  throw new Error("did not throw");
};

describe("Fatal and fail", () => {
  test("fail throws a Fatal with the message and the exit code, 2 unless it is given another", () => {
    const e = thrown(() => fail("--limit must be a positive integer"));
    expect(e).toBeInstanceOf(Fatal);
    expect(e).toBeInstanceOf(Error);
    expect((e as Fatal).message).toBe("--limit must be a positive integer");
    expect((e as Fatal).code).toBe(2);
    expect((thrown(() => fail("Harbor exited 3", 1)) as Fatal).code).toBe(1);
  });

  test("an error that is not a Fatal is not one", () => {
    expect(new Error("x") instanceof Fatal).toBe(false);
  });
});

describe("gitCommit", () => {
  const git = (dir: string, ...args: string[]) => {
    const done = Bun.spawnSync(["git", "-C", dir, "-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { stdout: "pipe", stderr: "pipe" });
    expect(done.exitCode).toBe(0);
    return done.stdout.toString().trim();
  };

  test("is the short commit of the checkout, with -dirty when a tracked file has changes", () => {
    const dir = tmp();
    git(dir, "init", "-q");
    writeFileSync(join(dir, "a.txt"), "one\n");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "one");
    const sha = git(dir, "rev-parse", "--short", "HEAD");
    expect(gitCommit(dir)).toBe(sha);
    writeFileSync(join(dir, "untracked.txt"), "not tracked\n");
    expect(gitCommit(dir)).toBe(sha);
    writeFileSync(join(dir, "a.txt"), "two\n");
    expect(gitCommit(dir)).toBe(`${sha}-dirty`);
  });

  test("keeps the image source revision when its managed working folder has no Git metadata", () => {
    const dir = tmp();
    writeFileSync(join(dir, ".akm-eval-revision"), "container-source-dirty\n");
    expect(gitCommit(dir)).toBe("container-source-dirty");
  });

  test("is unknown for a folder that is not a checkout, and for a repository with no commit", () => {
    expect(gitCommit(tmp())).toBe("unknown");
    const empty = tmp();
    git(empty, "init", "-q");
    expect(gitCommit(empty)).toBe("unknown");
  });
});

describe("slug", () => {
  test("keeps lower case letters and digits, and writes every other run as one dash", () => {
    expect(slug("openai/gpt-6-luna")).toBe("openai-gpt-6-luna");
    expect(slug("Qwen3 Coder 480B_A35B")).toBe("qwen3-coder-480b-a35b");
    expect(slug("a///b   c")).toBe("a-b-c");
  });

  test("drops the dashes at the ends", () => {
    expect(slug("--Model.v2--")).toBe("model-v2");
    expect(slug("")).toBe("");
    expect(slug("///")).toBe("");
  });
});

describe("hideEndpoint", () => {
  test("writes the base URL as <MODEL_BASE_URL> in every string, with or without a closing slash, and leaves the rest alone", () => {
    expect(hideEndpoint("failed: http://localhost:8080/v1/chat/completions refused", "http://localhost:8080/v1")).toBe("failed: <MODEL_BASE_URL>/chat/completions refused");
    expect(hideEndpoint("failed: http://localhost:8080/v1/chat/completions", "http://localhost:8080/v1/")).toBe("failed: <MODEL_BASE_URL>/chat/completions");
    expect(hideEndpoint("a http://host:8080/v1 b http://host:8080/v1", "http://host:8080/v1/")).toBe("a <MODEL_BASE_URL> b <MODEL_BASE_URL>");
    expect(hideEndpoint("failed: http://host:1/v1/chat/completions", "http://host:1/v1/")).toBe("failed: <MODEL_BASE_URL>/chat/completions");
    expect(hideEndpoint("nothing to hide", "http://localhost:8080/v1")).toBe("nothing to hide");
    const config = { engines: { model: { endpoint: "https://u:p@host.example/v1?k=1/chat/completions", model: "m", timeoutMs: 600000, think: false, tags: ["https://u:p@host.example/v1?k=1", "x"], none: null } } };
    expect(hideEndpoint(config, "https://u:p@host.example/v1?k=1")).toEqual({ engines: { model: { endpoint: "<MODEL_BASE_URL>/chat/completions", model: "m", timeoutMs: 600000, think: false, tags: ["<MODEL_BASE_URL>", "x"], none: null } } });
    expect(config.engines.model.endpoint).toContain("u:p@"); // a copy
  });

  test("hides the endpoint of a base URL that has a query as akm names it, with /chat/completions before the query", () => {
    const base = "https://user:SYNTH_PASSWORD@gw.example:8443/v1?api_key=SYNTH_KEY&api-version=2024-10-21";
    const endpoint = "https://user:SYNTH_PASSWORD@gw.example:8443/v1/chat/completions?api_key=SYNTH_KEY&api-version=2024-10-21";
    expect(hideEndpoint(`akm exited 78: request to ${endpoint} was refused`, base)).toBe("akm exited 78: request to <MODEL_BASE_URL>/chat/completions was refused");
    expect(hideEndpoint(`${base} and ${endpoint}`, base)).toBe("<MODEL_BASE_URL> and <MODEL_BASE_URL>/chat/completions");
    expect(hideEndpoint(`request to ${endpoint}`, `${base.replace("?", "/?")}`)).toBe("request to <MODEL_BASE_URL>/chat/completions"); // a slash before the query
    const full = "https://gw.example/v1/chat/completions?api_key=SYNTH_KEY";
    expect(hideEndpoint(`request to ${full}`, full)).toBe("request to <MODEL_BASE_URL>");
  });

  test("leaves the text alone when there is no endpoint, and does not put the mark between its characters", () => {
    expect(hideEndpoint("anything", "")).toBe("anything");
    expect(hideEndpoint("abc", "///")).toBe("abc");
    expect(hideEndpoint({ a: ["abc"] }, "")).toEqual({ a: ["abc"] });
  });
});

describe("failureMessage", () => {
  test("is what akm said, as the command that failed and its exit code", () => {
    expect(failureMessage("akm improve", 78, JSON.stringify({ ok: false, error: "unreachable: <MODEL_BASE_URL>/chat/completions refused" }))).toBe("akm improve failed (exit 78): unreachable: <MODEL_BASE_URL>/chat/completions refused");
    expect(failureMessage("akm proposal drain", 1, "a\nb\nc\nd\n")).toBe("akm proposal drain failed (exit 1): b | c | d");
    expect(failureMessage("akm index", 70, "plain text error\n")).toBe("akm index failed (exit 70): plain text error");
  });

  test("adds the code akm gives its error, and reads stdout when stderr is empty", () => {
    expect(failureMessage("akm improve", 78, JSON.stringify({ ok: false, error: "No engine configured", code: "LLM_NOT_CONFIGURED" }))).toBe("akm improve failed (exit 78): No engine configured (LLM_NOT_CONFIGURED)");
    expect(failureMessage("akm improve", 1, JSON.stringify({ error: "x", code: 7 }))).toBe("akm improve failed (exit 1): x");
    expect(failureMessage("akm improve", 1, "", "a\nb\nc\nd")).toBe("akm improve failed (exit 1): b | c | d");
    expect(failureMessage("akm improve", 1, "stderr says\n", "stdout says")).toBe("akm improve failed (exit 1): stderr says");
    expect(failureMessage("akm improve", 1, "")).toBe("akm improve failed (exit 1): ");
  });

  test("takes the last lines of a stderr that is JSON without an error, or is not an object", () => {
    expect(failureMessage("akm x", 2, '{"ok":false}')).toBe('akm x failed (exit 2): {"ok":false}');
    expect(failureMessage("akm x", 2, "null")).toBe("akm x failed (exit 2): null");
    expect(failureMessage("akm x", 2, '{"error": 5}')).toBe('akm x failed (exit 2): {"error": 5}');
  });

  test("stops at 400 characters", () => {
    expect(failureMessage("akm x", 1, "y".repeat(1000))).toHaveLength(400);
    expect(failureMessage("akm x", 1, JSON.stringify({ error: "y".repeat(1000) }))).toHaveLength(400);
  });
});

describe("exitMessage", () => {
  test("reads the error akm prints as JSON on stderr, with its code", () => {
    expect(exitMessage(78, '{\n  "ok": false,\n  "error": "Required engine credential K is not set.",\n  "code": "INVALID_CONFIG_FILE"\n}\n', "")).toBe("akm exited 78: Required engine credential K is not set. (INVALID_CONFIG_FILE)");
    expect(exitMessage(78, JSON.stringify({ ok: false, error: "engine unreachable", code: "LLM_NOT_CONFIGURED" }), "")).toBe("akm exited 78: engine unreachable (LLM_NOT_CONFIGURED)");
    expect(exitMessage(70, '{"ok": false, "error": "JSON Parse error"}', "")).toBe("akm exited 70: JSON Parse error");
  });

  test("falls back to the last lines of what it printed", () => {
    expect(exitMessage(1, "a\nb\nc\nd", "")).toBe("akm exited 1: b | c | d");
    expect(exitMessage(70, "line 1\nline 2\nline 3\nline 4", "")).toBe("akm exited 70: line 2 | line 3 | line 4");
    expect(exitMessage(1, "", "only stdout")).toBe("akm exited 1: only stdout");
    expect(exitMessage(1, "", "a\nb\nc\nd")).toBe("akm exited 1: b | c | d");
    expect(exitMessage(1, "plain text error\n", "")).toBe("akm exited 1: plain text error");
  });

  test("says why a killed akm died", () => {
    expect(exitMessage(137, "akm timed out after 900s", "")).toBe("akm exited 137: akm timed out after 900s");
  });

  test("stops at 300 characters", () => {
    expect(exitMessage(1, "y".repeat(1000), "")).toHaveLength(300);
    expect(exitMessage(1, JSON.stringify({ error: "y".repeat(1000) }), "")).toHaveLength(300);
  });
});

describe("generateArgs", () => {
  const usage = "Usage: evals/x/generate --seed N --out private/x";
  const quiet = <T>(f: () => T): { value: T; out: string; err: string } => {
    const out: string[] = [];
    const err: string[] = [];
    const [log, error] = [console.log, console.error];
    console.log = (line: string) => out.push(line);
    console.error = (line: string) => err.push(line);
    try {
      return { value: f(), out: out.join("\n"), err: err.join("\n") };
    } finally {
      [console.log, console.error] = [log, error];
    }
  };

  test("--seed and --out are what the script gets", () => {
    expect(generateArgs(["--seed", "7", "--out", "private/x"], usage)).toEqual({ seed: "7", out: "private/x" });
  });

  test("--help and -h print the usage to stdout and end with 0, whatever else is given", () => {
    for (const argv of [["--help"], ["-h"], ["--seed", "7", "--help"]]) {
      const r = quiet(() => generateArgs(argv, usage));
      expect([r.value, r.err]).toEqual([0, ""]);
      expect(r.out).toStartWith(`${usage}\n\nMakes this eval's private corpus`);
    }
  });

  test("an unknown flag, a missing value or a seed the script refuses prints the usage to stderr and ends with 2, with no stack trace", () => {
    for (const argv of [["--bogus"], ["--seed", "7"], ["--out", "o"], []]) {
      const r = quiet(() => generateArgs(argv, usage));
      expect([r.value, r.out]).toEqual([2, ""]);
      expect(r.err).toContain(usage);
      expect(r.err).not.toContain("    at ");
    }
    expect(quiet(() => generateArgs(["--seed", "x", "--out", "o"], usage, (s) => /^\d+$/.test(s))).value).toBe(2);
  });
});
