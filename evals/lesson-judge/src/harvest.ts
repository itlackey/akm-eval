// Collects real inputs of `distill.lesson`: runs akm's distill (`akm improve memories/<name> --strategy distill-only`) on the memories of the distill
// eval's cases, in a sandbox each, with the akm under test patched by capture.ts to write down the judge's exact input and verdict. Every captured input is
// what akm's pipeline built for the judge on that run. The cases are made from them by hand-labelling (assets/ADJUDICATION.md); this file labels nothing.
//
//   flock ~/.cache/shredder-eval.lock bun evals/lesson-judge/src/harvest.ts --akm "bun /path/to/akm/src/cli.ts" --model ID --out FILE [--ids a,b] [--feedback]
//
// --feedback FILE records `[negative]`/`[positive]` lines against a memory first, as `akm feedback` does: {"<case id>": [{"signal": "negative", "reason": "..."}]}.
// --scripted FILE puts a stand-in for the writer in place of the model, for the kinds real runs do not produce: {"<case id>[#variant]": {"lesson": {...}}} answers
// the writer with that lesson, {"update": {"add": ["line"]}} has it answer NONE and then extend the library's lesson by those lines, and every judge call is
// answered with a pass. akm's own pipeline still builds the judge's input (search, frontmatter, feedback lines, its pre-judge gates), so the only
// hand-written part of such a case is the writer's reply, and its judge verdict is meaningless.

import { appendFileSync, cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { akmVersion, createSandbox, removeSandbox, runAkm, runAkmJson, useAkm, useConfigForm, writeConfig } from "../../../lib/akm/akm.ts";
import { hideEndpoint } from "../../../lib/cli.ts";
import { useModel } from "../../../lib/models.ts";
import { configFor, memoryRef, trimImprove } from "../../distill/src/collect.ts";
import { loadCases } from "../../distill/src/lib.ts";

const { values } = parseArgs({ options: { akm: { type: "string" }, model: { type: "string" }, out: { type: "string" }, ids: { type: "string" }, feedback: { type: "string" }, scripted: { type: "string" } } });
const fail = (m: string): never => {
  console.error(`harvest: ${m}`);
  process.exit(2);
};
if (!values.akm || !values.out) fail("--akm COMMAND and --out FILE are needed");
const out = values.out as string;
useAkm(values, fail);
const scripts: Record<string, { lesson?: Record<string, unknown>; update?: { add: string[] }; none?: string }> = values.scripted ? JSON.parse(readFileSync(values.scripted, "utf8")) : {};
let current = "";
const server = values.scripted ? Bun.serve({ port: 0, fetch: (req) => scriptedModel(req, scripts[current] ?? {}) }) : undefined;
const { baseUrl, name: model, hasKey, provider } = server ? { baseUrl: `http://127.0.0.1:${server.port}/v1`, name: "scripted", hasKey: false, provider: "openai" } : useModel(values, fail);
const probe = createSandbox("lesson-judge-probe");
const version = await akmVersion(probe).finally(() => removeSandbox(probe));
useConfigForm(version);

const capture = resolve(import.meta.dir, "capture.ts");
// `--feedback FILE`: {"<case id>": [{"signal": "negative", "reason": "..."}]}, recorded before distill runs.
const feedback: Record<string, { signal: string; reason?: string }[]> = values.feedback ? JSON.parse(readFileSync(values.feedback, "utf8")) : {};
const ids = values.ids ? new Set(values.ids.split(",")) : undefined;
const all = loadCases(resolve(import.meta.dir, "../../distill/assets"));
// A scripted key is a distill case id, and may name a variant of it after a `#`; each key is one run of that case's memory.
const runs = values.scripted ? Object.keys(scripts).filter((k) => !ids || ids.has(k)).map((key) => ({ key, c: all.find((c) => c.id === key.split("#")[0]) ?? fail(`--scripted: no distill case ${key}`) })) : all.filter((c) => !ids || ids.has(c.id)).map((c) => ({ key: c.id, c }));
if (!existsSync(out)) writeFileSync(out, "");

for (const { key, c } of runs) {
  current = key;
  const sandbox = createSandbox("lesson-judge", { keepModelKey: true });
  // The preload is run by the same command line akm is: `bun --preload capture.ts <cli.ts>`.
  const words = sandbox.cmd;
  sandbox.cmd = [words[0] as string, "--preload", capture, ...words.slice(1)];
  try {
    writeConfig(sandbox, configFor({ baseUrl, model, hasKey, provider }));
    cpSync(c.dir, join(sandbox.dir, "bundle"), { recursive: true });
    const fb = feedback[key] ?? feedback[c.id] ?? [];
    if (fb.length) await runAkmJson(sandbox, ["index"], { timeoutMs: 600_000 });
    for (const f of fb) await runAkm(sandbox, ["feedback", memoryRef(c), f.signal === "positive" ? "--positive" : "--negative", ...(f.reason ? ["--reason", f.reason] : [])], { timeoutMs: 600_000 });
    const run = await runAkm(sandbox, ["improve", memoryRef(c), "--strategy", "distill-only", "--no-sync", "--require-engines", "--json-to-stdout", "--format", "json"], { timeoutMs: 900_000 });
    let improve: unknown = null;
    try {
      improve = JSON.parse(run.stdout);
    } catch {}
    const file = join(sandbox.env.AKM_DATA_DIR as string, "judge-capture.jsonl");
    const captured = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    const row = { case: key, class: c.class, akm: version, exit: run.code, seconds: Number((run.ms / 1000).toFixed(1)), feedback: fb, improve: hideEndpoint(trimImprove(improve), baseUrl), captured };
    appendFileSync(out, `${JSON.stringify(row)}\n`);
    console.log(`${key.padEnd(16)} exit ${run.code} ${String(row.seconds).padStart(6)}s  judge calls ${captured.length}  ${(row.improve.actions[0]?.result as any)?.outcome ?? ""}`);
  } finally {
    removeSandbox(sandbox);
  }
}
server?.stop(true);

/** The stand-in model of --scripted: an OpenAI-style chat completion whose content depends on which of distill's calls it is. */
function scriptedModel(req: Request, script: { lesson?: Record<string, unknown>; update?: { add: string[] }; none?: string }): Promise<Response> {
  return req.json().then((body: any) => {
    const prompt = String(body.messages?.at(-1)?.content ?? "");
    let content: unknown;
    if (prompt.startsWith("You are evaluating a lesson")) content = { scores: { reusable: 5, nonRedundancy: 5, grounding: 5 }, reason: "scripted" };
    else if (prompt.startsWith("A lesson written from the memory below would repeat")) {
      // The update writer: the lesson it extends is in the prompt, and the script adds its lines to the end.
      const found = /Existing lesson ref: (\S+)\n```\n([\s\S]*?)\n```/.exec(prompt);
      content = script.update && found ? { reason: "scripted", new_facts: script.update.add, decision: "update", ref: found[1], body: `${found[2]}\n${script.update.add.join("\n")}` } : { reason: "scripted", new_facts: [], decision: "none", ref: "", body: "" };
    } else if (script.lesson) content = { decision: "lesson", reason: "scripted", tags: [], ...script.lesson };
    else content = { decision: "none", reason: script.none ?? "A lesson in the library already states this rule.", description: "", when_to_use: "", body: "", tags: [] };
    const reply = { id: "scripted", object: "chat.completion", model: "scripted", choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
    return new Response(JSON.stringify(reply), { headers: { "content-type": "application/json" } });
  });
}
