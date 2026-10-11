// The refs akm gives the files of a library, worked out from the files alone; the domain mix of the judged set; and the files a SKILL.md names.
// library.test.ts uses them on the public library: no two files may claim one ref, every ref a judgment names must be a file, and a skill
// must name files that exist. mix.ts prints the domain mix.
//
// akm gives a file a ref from where it sits and what it says. The rules below reproduce what akm 0.9.26 did with the public library as it
// was when the qrels were made: all of the 245 refs the qrels name, the 17 refs that two files claimed, and the 259 assets by type (35 skills,
// 111 knowledge notes, 58 scripts, 25 commands, 24 agents and 6 workflows). The 14 assets that no judgment names are the only ones whose ref
// akm could give otherwise than this file does.

import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

/** The folders of a library that akm reads, and the type of what is in each. A file anywhere else (a README at the root) is not an asset. */
const FOLDER_TYPE: Record<string, string> = { agents: "agents", commands: "commands", knowledge: "knowledge", memories: "memories", lessons: "lessons", facts: "facts", workflows: "workflows", scripts: "scripts", skills: "skills" };
/** The extensions akm reads as scripts. */
const SCRIPT_EXTENSIONS = new Set([".ts", ".py", ".sh"]);

const frontMatterOf = (text: string): { front: string; body: string } => {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  return m ? { front: m[1] ?? "", body: text.slice(m[0].length) } : { front: "", body: text };
};

/**
 * The folder of the ref akm gives a note: what the note says comes before where it sits. A `tools` field is an agent, the steps of a workflow
 * (or a file in `workflows/`) a workflow, an `agent` field or an `$ARGUMENTS` or a `$1` to `$3` (not followed by a digit or a comma, as in a price) in the body a command. Otherwise the note keeps the
 * type of the folder it is in, and a note in `skills/` or `scripts/` is knowledge.
 */
function noteFolder(path: string, text: string): string {
  const { front, body } = frontMatterOf(text);
  const top = path.split("/")[0] as string;
  if (/^tools\s*:/m.test(front)) return "agents";
  if (top === "workflows") return "workflows";
  if (/^agent\s*:/m.test(front) || /\$ARGUMENTS|\$[1-3](?![\d,.])/.test(body)) return "commands";
  return top === "skills" || top === "scripts" ? "knowledge" : (FOLDER_TYPE[top] as string);
}

/**
 * The ref akm gives the file at `path` (relative to the library), or null when akm does not read it as an asset. `read` gives the file's text,
 * and is called only for a Markdown file that is not a `SKILL.md`.
 *
 * - `skills/<x>/SKILL.md` is the skill `skills/<x>`.
 * - A script (`.ts`, `.py`, `.sh`) is `scripts/<path>` with its extension, so `skills/<x>/scripts/a.ts` is `scripts/skills/<x>/scripts/a.ts`.
 * - Another Markdown file is `<folder>/<path>` without `.md`, the folder being noteFolder's, so `skills/<x>/references/a.md` is
 *   `knowledge/skills/<x>/references/a`, and so is `knowledge/skills/<x>/references/a.md`. That is how two files come to claim one ref.
 */
export function refOfFile(path: string, read: () => string): string | null {
  const top = path.split("/")[0] as string;
  if (path.split("/").some((part) => part.startsWith(".")) || !(top in FOLDER_TYPE)) return null;
  const ext = extname(path);
  if (SCRIPT_EXTENSIONS.has(ext)) return `scripts/${top === "scripts" ? path.slice("scripts/".length) : path}`;
  if (ext !== ".md") return null;
  if (basename(path) === "SKILL.md") return top === "skills" ? dirname(path) : null;
  const folder = noteFolder(path, read());
  const name = path.slice(0, -".md".length);
  return `${folder}/${name.startsWith(`${folder}/`) ? name.slice(folder.length + 1) : name}`;
}

/** Every file under `dir`, relative to it, in a stable order. */
export function filesOf(dir: string, below = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(dir, below), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const path = below ? `${below}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...filesOf(dir, path));
    else if (e.isFile()) out.push(path);
  }
  return out;
}

/** Ref to the files of `library` that claim it. An asset has one file, so a ref with more is the instability of akm#1050. Files that are not assets have no ref. */
export function libraryRefs(library: string): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  for (const path of filesOf(library)) {
    const ref = refOfFile(path, () => readFileSync(join(library, path), "utf8"));
    if (ref !== null) refs.set(ref, [...(refs.get(ref) ?? []), path]);
  }
  return refs;
}

// --- The domain mix --------------------------------------------------------------------------------------------

/** Folders under agents/, commands/, knowledge/ and workflows/ that belong to the group of a skill with another name. */
const GROUP_OF_FOLDER: Record<string, string> = { playwright: "e2e-testing" };
/** An asset that sits loose in its type folder belongs to the group its name says. */
const GROUP_OF_NAME: [RegExp, string][] = [
  [/^report-/, "reports"],
  [/^playwright-/, "e2e-testing"],
  [/^print-/, "print"],
  [/github|^implement-tasks$|^add-package-script$/, "dev-workflow"],
];

/**
 * The group of a ref, for the table of the domain mix. A ref of a skill, or of a file inside one (`skills/x`, `knowledge/skills/x/references/a`,
 * `scripts/skills/x/scripts/a.ts`), belongs to the top-level group of the skill: the folder of skills it is in (`ai-skills`, `coding`, `print`), or
 * the skill itself when it stands alone (`notify`). Any other asset belongs to the folder it sits in under its type, else to the group its name says.
 */
export function groupOf(ref: string): string {
  const parts = ref.split("/");
  const skills = parts.indexOf("skills");
  if (skills !== -1 && skills <= 2) return parts[skills + 1] as string;
  if (parts.length > 2) return GROUP_OF_FOLDER[parts[1] as string] ?? (parts[1] as string);
  return GROUP_OF_NAME.find(([re]) => re.test(parts[1] as string))?.[1] ?? "other";
}

export interface MixRow {
  group: string;
  assets: number;
  rows: number;
  relevant: number;
}

/** The domain mix: for each group, the assets of the library, the graded pairs whose asset is in it, and how many of those pairs are relevant (grade 2 or 3). */
export function domainMix(refs: Iterable<string>, qrels: { ref: string; grade: number }[]): MixRow[] {
  const by = new Map<string, MixRow>();
  const row = (group: string): MixRow => {
    const found = by.get(group) ?? { group, assets: 0, rows: 0, relevant: 0 };
    by.set(group, found);
    return found;
  };
  for (const ref of refs) row(groupOf(ref)).assets++;
  for (const q of qrels) {
    const r = row(groupOf(q.ref));
    r.rows++;
    if (q.grade >= 2) r.relevant++;
  }
  return [...by.values()].sort((a, b) => b.rows - a.rows || b.assets - a.assets || (a.group < b.group ? -1 : 1));
}

const pct = (n: number, of: number): string => (of === 0 ? "-" : `${((100 * n) / of).toFixed(1)}%`);

/** The table of the domain mix as the retrieval README prints it, with the share of all graded rows of each group and a total. */
export function mixTable(mix: MixRow[]): string {
  const total = mix.reduce((t, r) => ({ assets: t.assets + r.assets, rows: t.rows + r.rows, relevant: t.relevant + r.relevant }), { assets: 0, rows: 0, relevant: 0 });
  const lines = ["| Group | Assets | Graded rows | Share of rows | Relevant rows |", "|---|---:|---:|---:|---:|"];
  for (const r of mix) lines.push(`| ${r.group} | ${r.assets} | ${r.rows} | ${pct(r.rows, total.rows)} | ${r.relevant} |`);
  lines.push(`| all | ${total.assets} | ${total.rows} | 100.0% | ${total.relevant} |`);
  return lines.join("\n");
}

// --- The paths a skill names -----------------------------------------------------------------------------------

/**
 * The relative paths into its own folders that the text of a SKILL.md names: a file under `references/`, `assets/`, `scripts/`, `lib/`, `config/` or
 * `examples/`. A path with a wildcard, a variable or a placeholder is not a file, and one followed by a line range (`examples/guide.md:1-19`)
 * cites a file of another project.
 */
export function pathsNamedBy(text: string): string[] {
  return [...text.matchAll(/(?<![\w./$<{-])((?:references|assets|scripts|lib|config|examples)\/[\w./@-]*\w)(?![\w@*{}$-]|[./]\w|:\d)/g)].map((m) => m[1] as string);
}
