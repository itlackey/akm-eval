// Restore the three q018 judgments lost when duplicate files were removed. Run from the repository root after loading .env.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { grade, makeJudge } from "../../../evals/retrieval/src/label.ts";
import { parseQueries, parseQrels } from "../../../evals/retrieval/src/lib.ts";
import { refOfFile } from "../../../evals/retrieval/src/library.ts";
import { useJudge } from "../../../lib/models.ts";

const root = resolve(import.meta.dir, "../../..");
const library = join(root, "corpus/library");
const qrels = join(root, "evals/retrieval/assets/qrels.jsonl");
const query = parseQueries(readFileSync(join(root, "evals/retrieval/assets/queries.jsonl"), "utf8")).find((q) => q.id === "q018");
if (!query) throw new Error("q018 is missing");
const paths = ["agents/content-moderator", "agents/semantic-search", "commands/search"].map((path) => `skills/ai-skills/llm-delegation-tool/examples/${path}.md`);
const assets = new Map(paths.map((path) => {
  const text = readFileSync(join(library, path), "utf8");
  const ref = refOfFile(path, () => text);
  if (!ref) throw new Error(`No asset ref for ${path}`);
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  const metadata = front ? Bun.YAML.parse(front) as Record<string, unknown> : {};
  return [ref, { asset: { ref, type: ref.split("/")[0] as string, name: path.split("/").at(-1) as string, description: String(metadata.description ?? ""), path }, text }] as const;
}));
const done = new Set(parseQrels(readFileSync(qrels, "utf8")).filter((row) => row.id === query.id).map((row) => row.ref));
const judge = useJudge({});
const result = await grade([...assets.keys()].filter((ref) => !done.has(ref)).map((ref) => ({ id: query.id, query: query.query, ref })), (ref) => {
  const found = assets.get(ref);
  if (!found) throw new Error(`Missing ${ref}`);
  return found;
}, makeJudge(judge.baseUrl, judge.apiKey, judge.name), qrels, { model: judge.name, concurrency: 1, log: console.log });
console.log(JSON.stringify(result));
if (result.failed || result.gaveUp || result.stopped) process.exit(1);
