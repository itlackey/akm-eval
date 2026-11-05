#!/usr/bin/env bun
// The split corpus of the selection suite (assets/selection-split/README.md): the public library as two bundles, a team's and a general one, with
// the selection keys written into the frontmatter of the team's assets, and the public queries repeated once for each selection. It is written at
// run time from assets/selection-split/split.json and the public library, queries and qrels, so there is no second copy of the library in the
// repository. A test pins the digest of what it writes.
//
//   evals/retrieval/split [DIR]     default DIR: .cache/selection-split

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Fatal, fail } from "../../../lib/cli.ts";
import { filesUnder, manifestSha256 } from "./inputs.ts";
import { sha256File } from "../../../lib/provenance.ts";
import { type Qrel, type Query, gradesByQuery, isTask, parseQrels, parseQueries } from "./lib.ts";
import { RELEVANT } from "./score.ts";

export interface SplitConfig {
  /** The selection key akm takes on the command line (`channel`) and the frontmatter key that carries it (`scope_channel`), for a team and a project. Until akm#1412 these are the scope keys akm filters on; then they become `team` and `project`. */
  keys: { team: { select: string; frontmatter: string }; project: { select: string; frontmatter: string } };
  /** A folder name in a path to the team that owns its assets (print: publishing). */
  teams: Record<string, string>;
  /** The assets of one team (its value, such as publishing) whose text names a project get the project key. */
  project: { team: string; value: string; contains: string };
  /** A few general assets that carry another team's value, to tell a conflicting asset from one with the key missing. */
  conflict: { value: string; files: string[] };
  /** A team value no asset has. */
  absent: string;
  selections: string[];
}

export const MARKER = ".selection-split";
const TYPE_DIRS = ["knowledge", "commands", "agents", "workflows"];

/** The team of a path or a ref: the first folder in it that a team owns. */
const teamOf = (config: SplitConfig, path: string): string | undefined => path.split("/").slice(0, -1).map((d) => config.teams[d]).find((t) => t !== undefined);
const bundleOf = (config: SplitConfig, path: string): "team" | "general" => (teamOf(config, path) === undefined ? "general" : "team");

/**
 * The ref the qrels give a Markdown file: the spelling akm printed before akm#1432 (see oldSpelling in akm.ts). akm picks a note's type from the
 * file, so a note under a skill can be a command or an agent; the ref the qrels use is taken when the qrels name one, else the usual one.
 */
export function refOf(path: string, known: ReadonlySet<string>): string {
  if (path.endsWith("/SKILL.md")) return path.slice(0, -"/SKILL.md".length);
  const bare = path.replace(/\.md$/, "");
  const typed = TYPE_DIRS.includes(bare.split("/")[0] as string);
  const candidates = typed ? [bare] : TYPE_DIRS.map((t) => `${t}/${bare}`);
  return candidates.find((c) => known.has(c)) ?? (typed ? bare : `knowledge/${bare}`);
}

/** Writes `---`'s keys after the opening line, or returns the text as it is when it has no frontmatter. */
function withKeys(text: string, keys: Record<string, string>): string {
  if (!text.startsWith("---\n") || Object.keys(keys).length === 0) return text;
  return `---\n${Object.entries(keys).map(([k, v]) => `${k}: ${v}\n`).join("")}${text.slice(4)}`;
}

const jsonl = (rows: unknown[]): string => `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;

export interface Split {
  /** One digest over every file written, by path. */
  digest: string;
  /** How many assets carry each selection key. */
  tagged: { team: number; project: number; conflict: number };
  queries: number;
}

/**
 * Writes the split corpus into `out` (`library/team`, `library/general`, bundles.json, queries.jsonl, qrels.jsonl, metadata.jsonl). Only a
 * folder that this wrote before, or none, is replaced.
 */
export function generateSplit(o: { library: string; assets: string; config: SplitConfig; out: string }): Split {
  const { config, out } = o;
  if (existsSync(out)) {
    if (!existsSync(join(out, MARKER))) throw new Error(`${out} exists and was not made by evals/retrieval/split. Give another folder.`);
    rmSync(out, { recursive: true, force: true });
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, MARKER), "written by evals/retrieval/split\n");

  const qrels = parseQrels(readFileSync(join(o.assets, "qrels.jsonl"), "utf8"));
  const known = new Set(qrels.map((r) => r.ref));
  const conflict = new Set(config.conflict.files);
  const metadata: { ref: string; keys: Record<string, string> }[] = [];
  const tagged = { team: 0, project: 0, conflict: 0 };

  for (const file of filesUnder(o.library).map((f) => relative(o.library, f)).sort()) {
    if (file === "README.md") continue;
    const bundle = bundleOf(config, file);
    const team = teamOf(config, file);
    const target = join(out, "library", bundle, file);
    mkdirSync(dirname(target), { recursive: true });
    const source = join(o.library, file);
    const text = file.endsWith(".md") ? readFileSync(source, "utf8") : undefined;
    const keys: Record<string, string> = {}; // selection key to value, as the queries select it
    if (text?.startsWith("---\n")) {
      if (team !== undefined) {
        keys[config.keys.team.select] = team;
        tagged.team++;
        if (team === config.project.team && text.toLowerCase().includes(config.project.contains)) {
          keys[config.keys.project.select] = config.project.value;
          tagged.project++;
        }
      } else if (conflict.has(file)) {
        keys[config.keys.team.select] = config.conflict.value;
        tagged.conflict++;
      }
    }
    if (text === undefined || Object.keys(keys).length === 0) {
      cpSync(source, target, { dereference: true });
      continue;
    }
    const names = { [config.keys.team.select]: config.keys.team.frontmatter, [config.keys.project.select]: config.keys.project.frontmatter };
    writeFileSync(target, withKeys(text, Object.fromEntries(Object.entries(keys).map(([k, v]) => [names[k] as string, v]))));
    metadata.push({ ref: `${bundle}//${refOf(file, known)}`, keys });
  }
  for (const c of config.conflict.files) if (!existsSync(join(out, "library", "general", c))) throw new Error(`split.json names ${c} as a conflict, and the general bundle has no such file`);
  metadata.sort((a, b) => (a.ref < b.ref ? -1 : 1));
  writeFileSync(join(out, "metadata.jsonl"), jsonl(metadata));
  writeFileSync(join(out, "bundles.json"), `${JSON.stringify({ team: "akm", general: "akm" }, null, 2)}\n`);

  // The queries: every task query that has a relevant asset, once for each selection.
  const grades = gradesByQuery(qrels);
  const base = parseQueries(readFileSync(join(o.assets, "queries.jsonl"), "utf8")).filter((q) => isTask(q) && Object.values(grades.get(q.id) ?? {}).some((g) => g >= RELEVANT));
  // A skill's ref ends in the folder of the skill, which is one of the folders a team owns when the skill is named for it (skills/e2e-testing).
  const prefix = (ref: string): string => `${bundleOf(config, ref.startsWith("skills/") ? `${ref}/SKILL.md` : ref)}//${ref}`;
  // `both` selects two values of one key, which akm#1448 reads as either; before it a repeated key keeps its last value, so the hard filter is only right for it from then on.
  const selectionOf = (name: string): Query["selection"] => (name === "none" ? undefined : { [config.keys.team.select]: name === "absent" ? config.absent : name === "both" ? Object.values(config.teams) : name });
  const queries: Query[] = [];
  const rows: Qrel[] = [];
  for (const q of base) {
    for (const name of config.selections) {
      const id = `${q.id}@${name}`;
      const selection = selectionOf(name);
      queries.push({ id, query: q.query, kind: name, ...(q.expected ? { expected: q.expected.map(prefix) } : {}), ...(selection ? { selection } : {}), ...(name === "absent" ? { same_as: `${q.id}@none` } : {}) });
      for (const r of qrels) if (r.id === q.id) rows.push({ ...r, id, ref: prefix(r.ref), ...(r.alias_of ? { alias_of: prefix(r.alias_of) } : {}) });
    }
  }
  writeFileSync(join(out, "queries.jsonl"), jsonl(queries));
  writeFileSync(join(out, "qrels.jsonl"), jsonl(rows));

  const files = Object.fromEntries(filesUnder(out).map((f) => [relative(out, f), sha256File(f)]));
  return { digest: manifestSha256(files), tagged, queries: queries.length };
}

export const readConfig = (assets: string): SplitConfig => JSON.parse(readFileSync(join(assets, "split.json"), "utf8")) as SplitConfig;

if (import.meta.main) {
  try {
    const root = resolve(import.meta.dir, "..", "..", "..");
    const assets = join(root, "evals", "retrieval", "assets", "selection-split");
    const out = resolve(process.argv[2] ?? join(root, ".cache", "selection-split"));
    if (process.argv.length > 3 || process.argv[2]?.startsWith("-")) fail("Usage: evals/retrieval/split [DIR]");
    let split: Split;
    try {
      split = generateSplit({ library: join(root, "corpus", "library"), assets: join(root, "evals", "retrieval", "assets"), config: readConfig(assets), out });
    } catch (e) {
      fail((e as Error).message);
    }
    console.log(`retrieval split: ${split.queries} queries; assets tagged: ${split.tagged.team} team, ${split.tagged.project} project, ${split.tagged.conflict} conflicting`);
    console.log(`  digest ${split.digest}`);
    console.log(`  run it with: evals/retrieval/run --cases ${relative(process.cwd(), out) || out}`);
  } catch (e) {
    if (!(e instanceof Fatal)) throw e;
    console.error(`retrieval: ${e.message}`);
    process.exit(e.code);
  }
}
