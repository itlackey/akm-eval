// Makes the bad source memories, and the notes a duplicate repeats, from the good memories of assets/bundle/base (memories.ts, sources.ts): a model (the one under test, at temperature 0)
// rewrites each real memory as a status snapshot (ephemeral), as a retired approach (stale), and as a knowledge note in other words (the note a duplicate repeats).
// These sources are constructed, not real; what akm does with them afterwards (promote pass, drain) is capture.ts.
//
//   bun evals/drain-judge/src/variants.ts --model ID [--bases N]

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { completionsUrl } from "../../../lib/akm/akm.ts";
import { useModel } from "../../../lib/models.ts";

const BUNDLE = resolve(import.meta.dir, "..", "assets", "bundle");
const LOCK = `${process.env.HOME}/.cache/shredder-eval.lock`;

const { values } = parseArgs({ options: { model: { type: "string" }, only: { type: "string" }, bases: { type: "string" } } });
const model = useModel(values, (m) => {
  console.error(m);
  process.exit(2);
});

const SYSTEM = "You write short notes for a developer's knowledge base. Reply with one JSON object and nothing else.";
const PROMPTS = {
  ephemeral: `Below is a durable note. Write a DIFFERENT note about the same subject, as a point-in-time STATUS REPORT of work on it that is out of date within days. Give it a date in October or November 2026, and base it on {flavour}. Do not state the general lesson of the original. 80 to 140 words in the body. Use realistic names and numbers; if you name a commit, use a random 7-character hex hash.
Reply: {"description": "<one sentence>", "body": "<markdown>"}`,
  stale: `Below is a durable note. Write a DIFFERENT note about the same subject that records an approach that has since been RETIRED: what the team used to do, the date in 2026 it was retired, and the approach that replaced it (name it). The note is kept only for history and says so. 80 to 140 words in the body.
Reply: {"description": "<one sentence>", "body": "<markdown>"}`,
  reference: `Below is a durable note. Write a knowledge-base reference note that states every fact of it (every identifier, number, command, version and condition) in entirely different words and a different structure. Do not reuse any run of five words from the original. 80 to 200 words in the body.
Reply: {"description": "<one sentence>", "body": "<markdown>"}`,
};

const FLAVOURS = [
  "the rollout: which environment it is in, what percent is rolled out and who approved it",
  "test and CI counts: how many pass and fail, which runs, on a named branch",
  "an open ticket or pull request and who it is waiting on",
  "the version or build now deployed and what is pending",
  "a checklist (N of M items done) and the next step",
  "an incident or investigation under way: what has been ruled out so far and what is being tried next",
];
async function ask(kind: keyof typeof PROMPTS, note: string, temperature = 0, flavour = 0): Promise<{ description: string; body: string }> {
  const body = JSON.stringify({
    model: model.name, temperature, max_tokens: 1500, reasoning_effort: "none",
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: `${PROMPTS[kind].replace("{flavour}", FLAVOURS[flavour % FLAVOURS.length] as string)}\n\n--- note ---\n${note}\n--- end ---` }],
  });
  const proc = Bun.spawn(["flock", LOCK, "curl", "-s", "-m", "600", completionsUrl(model.baseUrl), "-H", `Authorization: Bearer ${model.apiKey}`, "-H", "content-type: application/json", "-d", body], { stdout: "pipe" });
  const out = JSON.parse(await new Response(proc.stdout).text());
  const text: string = out.choices[0].message.content ?? "";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json);
  if (typeof parsed.description !== "string" || typeof parsed.body !== "string") throw new Error("no description and body");
  return parsed;
}

const describe = (note: string): string => {
  try {
    return String((Bun.YAML.parse(/^---\n([\s\S]*?)\n---\n/.exec(note)?.[1] ?? "") as { description?: string }).description ?? "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
};
const FRONT = /^---\n([\s\S]*?)\n---\n/;
/** The memory's frontmatter with its description replaced (the folded lines of the old one go), and the new body. */
function rewrite(note: string, description: string, body: string): string {
  const front = FRONT.exec(note)?.[1] ?? "";
  const lines = front.split("\n");
  const out: string[] = [];
  let skipping = false;
  for (const l of lines) {
    if (/^description:/.test(l)) {
      skipping = true;
      out.push(`description: ${JSON.stringify(description)}`);
    } else if (skipping && /^\s/.test(l)) continue;
    else {
      skipping = false;
      out.push(l);
    }
  }
  return `---\n${out.join("\n")}\n---\n\n${body.trim()}\n`;
}

const sourcesFile = join(BUNDLE, "sources.json");
const sources: Record<string, { origin: string; from: string; kind: string }> = JSON.parse(readFileSync(sourcesFile, "utf8"));
// The good memories, real ones first, are the bases; the first `--bases N` of them are rewritten.
const bases = Object.entries(sources)
  .filter(([, v]) => v.kind === "good")
  .sort(([a, x], [b, y]) => (x.origin === y.origin ? a.localeCompare(b) : x.origin === "real" ? -1 : 1))
  .map(([f]) => f)
  .slice(0, Number(values.bases ?? 30));
mkdirSync(join(BUNDLE, "dup", "memories"), { recursive: true });
mkdirSync(join(BUNDLE, "dup", "knowledge"), { recursive: true });
const baseOf = (f: string) => f.replace(/\.md$/, "");
for (const f of bases.filter((f) => !values.only || f.startsWith(values.only))) {
  const memory = readFileSync(join(BUNDLE, "base", "memories", f), "utf8");
  // The model reads the description and the body, not the frontmatter akm stamped (its dates and provenance are not the note's subject).
  const note = `${describe(memory)}\n\n${memory.replace(/^---\n[\s\S]*?\n---\n/, "").trim()}`;
  const name = baseOf(f);
  mkdirSync(dirname(join(BUNDLE, "dup", "memories", f)), { recursive: true });
  copyFileSync(join(BUNDLE, "base", "memories", f), join(BUNDLE, "dup", "memories", f));
  for (const [kind, file] of [["ephemeral", `${name}-status.md`], ["stale", `${name}-legacy.md`], ["reference", `${name}-reference.md`]] as const) {
    const where = kind === "reference" ? join("dup", "knowledge", file) : join("base", "memories", file);
    if (existsSync(join(BUNDLE, where))) continue;
    try {
      // Temperature 0; a reply that is not the JSON asked for is asked again, twice, a little warmer.
      const flavour = bases.indexOf(f);
      const v = await ask(kind, note, 0, flavour).catch(() => ask(kind, note, 0.4, flavour)).catch(() => ask(kind, note, 0.7, flavour));
      mkdirSync(dirname(join(BUNDLE, where)), { recursive: true });
      // A knowledge note holds a description and a body; the memory's other fields are not a note's.
      writeFileSync(join(BUNDLE, where), kind === "reference" ? `---\ndescription: ${JSON.stringify(v.description)}\n---\n\n${v.body.trim()}\n` : rewrite(memory, v.description, v.body));
      if (kind !== "reference") sources[file] = { origin: "constructed", from: f, kind };
      else sources[`dup/knowledge/${file}`] = { origin: "constructed", from: f, kind: "reference" };
      console.log(`${file}: ok`);
    } catch (e) {
      console.log(`${file}: ${(e as Error).message}`);
    }
  }
  writeFileSync(sourcesFile, `${JSON.stringify(Object.fromEntries(Object.entries(sources).sort()), null, 2)}\n`);
}
