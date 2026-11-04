// A harness judge must not read the operator's own setup. The operator's HOME is planted with a CLAUDE.md, skills, an AGENTS.md and an opencode config
// that each hold a canary, and the sandbox is made in a TMPDIR inside that HOME (opencode looks in every folder above its working folder too, which is
// how a run in ~/.cache/... found ~/.claude/skills). A local server stands in for the model, and the opencode that akm would start in the sandbox is run
// against it: with the HOME of the caller the canaries reach the model's request, with isolateHome they do not, and the request offers it no tool.
// Runs only where opencode is installed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSandbox, removeSandbox, writeOpencodeConfig } from "./akm.ts";
import { opencodeConfig } from "../judge.ts";

const CANARIES = ["CANARY-CLAUDE-MD", "CANARY-SKILL", "CANARY-AGENTS-SKILL", "CANARY-AGENTS-MD", "CANARY-OPENCODE-INSTRUCTIONS", "CANARY-CONFIG-CONTENT"];
let operator: string;
const kept = { HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, CONTENT: process.env.OPENCODE_CONFIG_CONTENT };
const restore = (name: string, value: string | undefined) => (value === undefined ? delete process.env[name] : (process.env[name] = value));
beforeAll(() => {
  operator = mkdtempSync(join(tmpdir(), "operator-home-"));
  const put = (path: string, text: string) => {
    mkdirSync(join(operator, path, ".."), { recursive: true });
    writeFileSync(join(operator, path), text);
  };
  put(".claude/CLAUDE.md", "CANARY-CLAUDE-MD\n");
  put(".claude/skills/canary/SKILL.md", "---\nname: canary\ndescription: CANARY-SKILL\n---\nbody\n");
  put(".agents/skills/canary2/SKILL.md", "---\nname: canary2\ndescription: CANARY-AGENTS-SKILL\n---\nbody\n");
  put("AGENTS.md", "CANARY-AGENTS-MD\n");
  put(".config/opencode/instructions.md", "CANARY-OPENCODE-INSTRUCTIONS\n");
  put(".config/opencode/opencode.json", JSON.stringify({ instructions: [join(operator, ".config/opencode/instructions.md")], mcp: { canary: { type: "local", command: ["true"] } } }));
  mkdirSync(join(operator, "tmp"));
  process.env.HOME = operator;
  process.env.TMPDIR = join(operator, "tmp");
  process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ instructions: ["CANARY-CONFIG-CONTENT"] });
});
afterAll(() => {
  restore("HOME", kept.HOME);
  restore("TMPDIR", kept.TMPDIR);
  restore("OPENCODE_CONFIG_CONTENT", kept.CONTENT);
  rmSync(operator, { recursive: true, force: true });
});

describe("isolateHome", () => {
  test("gives akm a HOME and a cache folder inside the sandbox, and without it passes the caller's HOME through", () => {
    const plain = createSandbox("isolation-plain");
    const isolated = createSandbox("isolation", { isolateHome: true });
    try {
      expect(plain.env.HOME).toBe(operator);
      expect(plain.env.OPENCODE_DISABLE_PROJECT_CONFIG).toBeUndefined();
      expect(isolated.env.HOME).toBe(join(isolated.dir, "home"));
      expect(isolated.env.XDG_CACHE_HOME).toBe(join(isolated.dir, "xdg-cache"));
      expect(isolated.env).toMatchObject({ OPENCODE_DISABLE_PROJECT_CONFIG: "1", OPENCODE_DISABLE_CLAUDE_CODE: "1" });
      expect(isolated.env.OPENCODE_CONFIG_CONTENT).toBeUndefined(); // the caller's is not passed
    } finally {
      removeSandbox(plain);
      removeSandbox(isolated);
    }
  });

  test.skipIf(!Bun.which("opencode"))("what the operator keeps reaches opencode's request without it, and does not with it", async () => {
    const requests: string[] = [];
    const server = Bun.serve({
      port: 0,
      async fetch(req) {
        requests.push(await req.text());
        const chunk = (c: object) => `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 1, model: "m", choices: [c] })}\n\n`;
        const body = chunk({ index: 0, delta: { role: "assistant", content: "OK" } }) + chunk({ index: 0, delta: {}, finish_reason: "stop" }) + "data: [DONE]\n\n";
        return new Response(body, { headers: { "content-type": "text/event-stream" } });
      },
    });
    const seenBy = async (isolateHome: boolean): Promise<string[]> => {
      requests.length = 0;
      const sandbox = createSandbox("isolation", { isolateHome });
      try {
        expect(sandbox.dir).toStartWith(operator); // opencode looks above its working folder, and this one is inside the operator's HOME
        writeOpencodeConfig(sandbox, opencodeConfig(`http://127.0.0.1:${server.port}/v1`, "m", false));
        const run = Bun.spawn(["opencode", "run", "--model", "eval/m", "Say OK."], { env: sandbox.env, cwd: sandbox.dir, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
        const [, stderr, code] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text(), run.exited]);
        expect([isolateHome, code, stderr.includes("Error")]).toEqual([isolateHome, 0, false]);
        expect(requests.length).toBeGreaterThan(0);
        return [...requests];
      } finally {
        removeSandbox(sandbox);
      }
    };
    try {
      // Control: ~/.claude/CLAUDE.md and the AGENTS.md above the sandbox reach the model. (The skills do not, since the config offers no tool to load one; and the opencode
      // config in ~/.config and OPENCODE_CONFIG_CONTENT do not, even then: the sandbox sets XDG_CONFIG_HOME and passes no OPENCODE_ variable.)
      const open = (await seenBy(false)).join("\n");
      for (const canary of ["CANARY-CLAUDE-MD", "CANARY-AGENTS-MD"]) expect(open).toContain(canary);
      const closed = await seenBy(true);
      for (const canary of CANARIES) expect(closed.join("\n")).not.toContain(canary);
      for (const body of closed) expect(JSON.parse(body).tools ?? []).toEqual([]); // no tool to read a file by its path
    } finally {
      server.stop(true);
    }
  }, 120_000);
});
