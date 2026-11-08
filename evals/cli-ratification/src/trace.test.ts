// The trace: which calls the agent made, whether the answer came through akm, and the cost of getting there.

import { describe, expect, test } from "bun:test";
import { type Call, mediated, parseCalls, traceOf } from "./trace.ts";

let t = 1_000;
/** One tool_use event of opencode's stream. */
const event = (tool: string, input: Record<string, unknown>, output = "", exit: number | null = 0, callID = `c${t}`) =>
  JSON.stringify({ type: "tool_use", timestamp: (t += 1_000), sessionID: "s", part: { type: "tool", tool, callID, state: { status: "completed", input, output, metadata: { exit }, time: { start: t, end: t + 5 } } } });
const bash = (command: string, output = "", exit: number | null = 0) => event("bash", { command }, output, exit);
const stream = (...lines: string[]) => lines.join("\n");
const calls = (...lines: string[]): Call[] => parseCalls(stream(...lines)).calls;

const APPLY = { evidence: ["4382", "cedar-east"], commands: [] };

describe("reading the stream", () => {
  test("a call is counted once however many events it has, and the last one tells what it ran", () => {
    const pending = JSON.stringify({ type: "tool_use", timestamp: 5, sessionID: "s", part: { type: "tool", tool: "bash", callID: "x", state: { status: "pending", input: {} } } });
    const done = bash("akm search relay", "{}", 0).replace(/"callID":"c\d+"/, '"callID":"x"');
    const read = parseCalls(stream("not json", pending, done, event("read", { filePath: "/a" }, "text")));
    expect(read.calls.map((c) => [c.tool, c.input])).toEqual([["bash", "akm search relay"], ["read", '{"filePath":"/a"}']]);
    expect(read.first).toBe(5);
    expect(read.calls[0].exit).toBe(0);
  });
});

describe("AKM-mediated", () => {
  const show = bash("akm show memories/port-1 --format json", '{"content": "The port is 4382."}');
  const region = bash("akm search region --filter project=orchid", "deployed in cedar-east");
  const write = bash(`echo '{"listen_port": 4382, "region": "cedar-east"}' > service.json`);

  test("evidence arrived through akm calls before the answer was written", () => {
    expect(mediated(calls(show, region, write), APPLY)).toBe(true);
  });
  test("one value from akm and the other guessed or read from raw files is not mediated", () => {
    expect(mediated(calls(show, write), APPLY)).toBe(false);
  });
  test("raw-file scraping after `akm --version` passes the verifier and is not mediated", () => {
    const scrape = bash("cat /opt/akm/bundle/memories/*.md", "port 4382 region cedar-east");
    expect(mediated(calls(bash("akm --version", "0.10.261111-beta"), scrape, write), APPLY)).toBe(false);
  });
  test("evidence that comes after the answer was written does not count", () => {
    expect(mediated(calls(write, show, region), APPLY)).toBe(false);
  });
  test("a task about commands needs one of them to have run, and a mention is not a run", () => {
    const spec = { evidence: [], commands: ["akm\\s+(remember|import)"] };
    expect(mediated(calls(bash('akm remember "canary 17 percent" --tag decision', "{}")), spec)).toBe(true);
    expect(mediated(calls(bash("echo akm remember; cat notes.md", "")), spec)).toBe(false);
    expect(mediated(calls(bash("cat > memories/x.md <<EOF\nEOF", "")), spec)).toBe(false);
  });
  test("a task with neither cannot be judged", () => {
    expect(mediated(calls(show), { evidence: [], commands: [] })).toBeNull();
  });
});

describe("the figures of a trial", () => {
  test("calls and seconds to the first useful operation, help, invalid and repeated commands, output", () => {
    const run = parseCalls(stream(
      bash("ls /work/orchid", "README.md"),
      bash("akm -h", "x".repeat(300)),
      bash("akm search relay", '{"hits": []}'),
      bash("akm serch relay", '{"ok": false, "code": "UNKNOWN_COMMAND"}', 2),
      bash("akm search relay", '{"hits": []}'),
      bash("akm show memories/port-1", "The port is 4382."),
      bash("cat /usr/lib/node_modules/akm-cli/docs/guide.md", "docs"),
    ));
    const trace = traceOf(run.calls, run.first, APPLY);
    expect(trace).toMatchObject({ calls: 7, akm_calls: 5, help_calls: 1, help_chars: 300, doc_reads: 1, invalid: 1, repeated: 1, first_useful_calls: 6 });
    expect(trace.first_useful_seconds).toBe(5);
    expect(trace.akm_chars).toBe(300 + '{"hits": []}'.length * 2 + '{"ok": false, "code": "UNKNOWN_COMMAND"}'.length + "The port is 4382.".length);
  });

  test("help is any akm command asking for it and nothing that only mentions it", () => {
    const help = ["akm help", "akm hints", "akm --verbose help search", "akm search --help", "akm workflow run -h", "akm config set -h && echo"];
    const not = ["echo akm help", "akm search helpdesk", "cat akm.txt"];
    const trace = (cmds: string[]) => { const r = parseCalls(stream(...cmds.map((c) => bash(c, "out")))); return traceOf(r.calls, r.first, APPLY); };
    expect(trace(help).help_calls).toBe(help.length);
    expect(trace(not).help_calls).toBe(0);
  });

  test("reads of the package's shipped files count whichever tool read them", () => {
    const r = parseCalls(stream(event("read", { filePath: "/root/.nvm/lib/node_modules/akm-cli/docs/guides/getting-started.md" }, "..."), bash("ls /opt/akm/cli/node_modules/akm-cli/dist", "x"), bash("ls /work", "x")));
    expect(traceOf(r.calls, r.first, APPLY).doc_reads).toBe(2);
  });

  test("no useful operation is null, not zero", () => {
    const r = parseCalls(stream(bash("akm search nothing", "{}")));
    expect(traceOf(r.calls, r.first, APPLY)).toMatchObject({ first_useful_calls: null, first_useful_seconds: null });
  });
});
