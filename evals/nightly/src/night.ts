// The planted night, as files: loading it from an assets folder, which items a run plants, what the night's files are, and the checks that the
// items still hold what they say. generate.ts and build.ts make the night with it and run.ts reads it. It is in neither part of the
// measurement (see measurement.ts).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { claimProblems } from "../../consolidate/src/cases.ts";
import { caseProblems } from "../../reflect/src/lib.ts";
import { listFiles } from "./library.ts";
import { type Feedback, type Item, KINDS, applyFix, parseItems, reflectCase, refOf } from "./items.ts";

export { AKM_FOLDER, listFiles, readLibrary } from "./library.ts";

/** The planted night: the items, and the text of every library file. */
export interface Night {
  items: Item[];
  files: Map<string, string>;
}

/** The night in `assets`: its items, and the library files they name. Every file belongs to one item, and every item's file is there. */
export function loadNight(assets: string): Night {
  const file = join(assets, "items.jsonl");
  const items = parseItems(readFileSync(file, "utf8"), file);
  const library = join(assets, "library");
  const files = new Map<string, string>();
  for (const path of listFiles(library)) files.set(path, readFileSync(join(library, path), "utf8"));
  const owner = new Map<string, string>();
  for (const item of items) {
    for (const path of item.files) {
      if (!files.has(path)) throw new Error(`${file}: ${item.id} names ${path}, which is not in ${library}`);
      if (owner.has(path)) throw new Error(`${file}: ${path} belongs to both ${owner.get(path)} and ${item.id}`);
      owner.set(path, item.id);
    }
    for (const f of item.feedback) if (!item.files.some((p) => refOf(p) === f.ref)) throw new Error(`${file}: ${item.id} has feedback on ${f.ref}, which is not one of its files`);
  }
  for (const path of files.keys()) if (!owner.has(path)) throw new Error(`${file}: ${path} is in ${library} and belongs to no item`);
  return { items, files };
}

/** An item as the measurement holds it as a case: the item with the text of its library files, which are part of what akm is given. */
export type Planted = Item & { texts: Record<string, string> };

export const planted = (items: Item[], files: Map<string, string>): Planted[] => items.map((item) => ({ ...item, texts: Object.fromEntries(item.files.map((path) => [path, files.get(path) as string])) }));

/**
 * The items a run plants. Without a limit, all of them. With one, N items, taking the first of each kind in turn, in the order
 * of KINDS, so a short night holds as many kinds as it can. They come back in file order.
 */
export function selectItems(items: Item[], limit?: number): Item[] {
  if (limit === undefined || limit >= items.length) return items;
  const queues = KINDS.map((k) => items.filter((i) => i.kind === k)).filter((q) => q.length > 0);
  const picked = new Set<Item>();
  for (let round = 0; picked.size < limit; round++) {
    for (const q of queues) if (picked.size < limit && q[round]) picked.add(q[round] as Item);
  }
  return items.filter((i) => picked.has(i));
}

/** The files of an assets folder that a night reads, relative to it: items.jsonl and the library. assets_sha256 and generated.json digest them. */
export function nightFiles(assets: string): string[] {
  return ["items.jsonl", ...listFiles(join(assets, "library")).map((p) => `library/${p}`)];
}

/** What is wrong with the night's items and files: the planted defects, deciding claims, fixes and phrases must still hold. Empty when it is right. */
export function nightProblems(night: Night): string[] {
  const problems: string[] = [];
  const text = (path: string) => night.files.get(path) as string;
  for (const item of night.items) {
    const say = (message: string) => problems.push(`${item.id}: ${message}`);
    if (item.kind === "pair") {
      const c = { id: item.id, relation: item.relation, older: item.older, safe: item.safe, claims: item.claims, why: "", a: { name: refOf(item.a), text: text(item.a) }, b: { name: refOf(item.b), text: text(item.b) } };
      for (const p of claimProblems(c)) say(p);
    } else if (item.kind === "reflect" || item.kind === "silent") {
      for (const p of caseProblems(reflectCase(item, text(item.path)))) say(p);
    } else if (item.kind === "fix") {
      const fix = item.feedback.find((f) => f.fix)?.fix as NonNullable<Feedback["fix"]>;
      fix.replace.forEach((old, i) => {
        const at = text(item.path).split(old).length - 1;
        if (at !== 1) say(`--replace #${i + 1} is in the note ${at} times, and akm needs it once`);
      });
      if (applyFix(text(item.path), fix) === text(item.path)) say("the fix changes nothing");
    }
  }
  return problems;
}
