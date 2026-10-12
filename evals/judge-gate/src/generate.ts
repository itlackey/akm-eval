#!/usr/bin/env bun
// judge-gate generate: makes the private cases from the public ones with lib/rewrite.
//
//   evals/judge-gate/generate --seed N --out private/judge-gate
//
// Every case's text goes through one rewrite map: the proposal's source, candidate and feedback first, then
// the reason for its label, so a name changes the same way in all of them and each case's diff is kept. The reason
// may not add names to the map: a word that the texts did not make a name must stay a word in it, so what the reason
// quotes stays in the texts. Then each case is checked against the public one. Everything is made in a folder beside
// the assets and moved into place only when every check passes, so a failed run leaves the assets and the map of the
// run before as they were. generated.json, beside the cases, holds the seed they were made with.

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CASES, GENERATED } from "./inputs.ts";
import { type Case, parseCases } from "./lib.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

const dirOf = (base: string, i: number) => join(base, String(i + 1).padStart(4, "0"));

/** One folder per case, one file per text, so the rewrite sees real lines and not JSON escapes. */
export function explode(cases: Case[], corpusDir: string, labelsDir: string): void {
  cases.forEach((c, i) => {
    const corpus = dirOf(corpusDir, i);
    const labels = dirOf(labelsDir, i);
    mkdirSync(corpus, { recursive: true });
    mkdirSync(labels, { recursive: true });
    writeFileSync(join(corpus, "id.txt"), c.id);
    writeFileSync(join(corpus, "source.md"), c.source);
    writeFileSync(join(corpus, "candidate.md"), c.candidate);
    writeFileSync(join(corpus, "feedback.txt"), c.feedback);
    writeFileSync(join(labels, "reason.txt"), c.labelReason ?? "");
  });
}

/** The cases again, with the rewritten texts. The label, the severity, the set, the kind and the canary are kept. */
export function assemble(cases: Case[], corpusDir: string, labelsDir: string): Case[] {
  const read = (dir: string, name: string) => {
    const file = join(dir, name);
    if (!existsSync(file)) throw new Error(`the rewrite did not write ${file}`);
    return readFileSync(file, "utf8");
  };
  return cases.map((c, i) => {
    const corpus = dirOf(corpusDir, i);
    const labels = dirOf(labelsDir, i);
    return {
      ...c,
      id: read(corpus, "id.txt"),
      labelReason: read(labels, "reason.txt"),
      feedback: read(corpus, "feedback.txt"),
      source: read(corpus, "source.md"),
      candidate: read(corpus, "candidate.md"),
    };
  });
}

/** The lines that differ between two texts: the lines of each that are not in their longest run in common. 0 for texts that are the same. */
export function changedLines(a: string, b: string): number {
  const [x, y] = [a.split("\n"), b.split("\n")];
  let row = new Array<number>(y.length + 1).fill(0);
  for (let i = x.length - 1; i >= 0; i--) {
    const next = new Array<number>(y.length + 1).fill(0);
    for (let j = y.length - 1; j >= 0; j--) next[j] = x[i] === y[j] ? row[j + 1] + 1 : Math.max(row[j], next[j + 1]);
    row = next;
  }
  return x.length + y.length - 2 * row[0];
}

/** What a label reason quotes, in order: 'single', "double" and `backtick` spans. An apostrophe inside a word does not open or close a quote, and a quote may hold one. */
export function quotedFacts(reason: string): string[] {
  const quotes = /(?<![\p{L}\p{N}])'((?:[^'\n]|(?<=[\p{L}\p{N}])'(?=[\p{L}\p{N}]))+?)'(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])"([^"\n]+?)"(?![\p{L}\p{N}])|`([^`\n]+?)`/gu;
  return [...reason.matchAll(quotes)].map((m) => (m[1] ?? m[2] ?? m[3]).trim()).filter((f) => f.length >= 2);
}

/** A word of a label reason, without the punctuation around it. */
const bare = (word: string): string => word.replace(/^[("'`[{<“‘]+|[)"'`\]}>”’.,;:!?]+$/gu, "");

/** Does a word of a reason look like a fact: a number, a version, a path, a flag, an id, an identifier? Prose words do not. */
const technical = (word: string): boolean => word.length >= 3 && /[0-9]|[/_@#~]|^--|[a-z][A-Z]/.test(word);

const wordsOf = (text: string): string[] => text.split(/\s+/).filter(Boolean);

/** The negative lines of a feedback: orderFeedback and akm's judge key on the `[negative]` prefix. */
const negatives = (feedback: string): number => feedback.split("\n").filter((l) => l.startsWith("[negative]")).length;

/**
 * What the rewrite must keep, case by case: the label, the severity, the set and the kind; as many lines in the source, the candidate
 * and the feedback, and as many negative feedback lines; the same number of changed lines between the source and the candidate, so the
 * diff is as big as it was; and every fact that the reason for the label names and that the revision holds. Those are what the reason
 * quotes and the numbers, versions, paths and identifiers among its words. A rewrite that changes none of these keeps the case as hard
 * as it was and its label as true. Returns what changed.
 */
export function checkRewrite(before: Case[], after: Case[]): string[] {
  const problems: string[] = [];
  if (before.length !== after.length) return [`${after.length} cases were written, and there are ${before.length}`];
  const ids = new Set<string>();
  before.forEach((b, i) => {
    const a = after[i];
    const note = (message: string) => problems.push(`${b.id}: ${message}`);
    for (const key of ["kind", "set", "label", "severity", "canary"] as const) if (a[key] !== b[key]) note(`its ${key} came back as ${JSON.stringify(a[key])}, and the public one has ${JSON.stringify(b[key])}`);
    if (!a.id.trim() || ids.has(a.id)) note(`its id ${JSON.stringify(a.id)} is empty or taken`);
    ids.add(a.id);
    for (const key of ["source", "candidate", "feedback"] as const) {
      const [had, has] = [b[key].split("\n").length, a[key].split("\n").length];
      if (had !== has) note(`its ${key} has ${has} lines, and the public one has ${had}`);
    }
    if (negatives(a.feedback) !== negatives(b.feedback)) note(`its feedback has ${negatives(a.feedback)} negative lines, and the public one has ${negatives(b.feedback)}`);
    const [diffBefore, diffAfter] = [changedLines(b.source, b.candidate), changedLines(a.source, a.candidate)];
    if (diffBefore !== diffAfter) note(`its source and candidate differ in ${diffAfter} lines, and the public ones in ${diffBefore}`);
    const [was, now] = [[b.source, b.candidate, b.feedback].join("\n"), [a.source, a.candidate, a.feedback].join("\n")];
    const lost = (fact: string, rewritten: string) => note(`the fact "${rewritten}" that its reason names (it was "${fact}") is no longer in its texts`);
    const [quotedBefore, quotedAfter] = [quotedFacts(b.labelReason), quotedFacts(a.labelReason)];
    if (quotedBefore.length !== quotedAfter.length) note(`its reason quotes ${quotedAfter.length} facts, and the public one's quotes ${quotedBefore.length}`);
    else quotedBefore.forEach((fact, k) => was.includes(fact) && !now.includes(quotedAfter[k]) && lost(fact, quotedAfter[k]));
    const [wordsBefore, wordsAfter] = [wordsOf(b.labelReason), wordsOf(a.labelReason)];
    if (wordsBefore.length !== wordsAfter.length) note(`its reason has ${wordsAfter.length} words, and the public one's has ${wordsBefore.length}`);
    else wordsBefore.forEach((word, k) => technical(bare(word)) && was.includes(bare(word)) && !now.includes(bare(wordsAfter[k])) && lost(bare(word), bare(wordsAfter[k])));
  });
  return problems;
}

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe" });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

export interface Made {
  /** The rewritten cases that were written: none when the checks found problems. */
  count: number;
  /** What the checks found. When there are any, nothing was written, and the assets and the map of an earlier run are as they were. */
  problems: string[];
  /** The last line of the rewrite's own summary. */
  summary: string;
}

/**
 * Makes the private cases in `out`/assets and the map in `out`/map.json from the public cases in `publicAssets`. The work is done in
 * folders beside them, which are removed at the end, and the cases and the map replace the old ones only when every check passes. A
 * rewrite that fails throws, and leaves what was there too. The labels go through the rewrite with --min-count 1000000, so a reason
 * cannot make a new name. `rewrite` stands in for lib/rewrite in tests.
 */
export function generate(opts: { seed: string; out: string; publicAssets?: string; rewrite?: (args: string[]) => string }): Made {
  const run = opts.rewrite ?? rewrite;
  const publicAssets = opts.publicAssets ?? join(EVAL_DIR, "assets");
  const work = join(opts.out, ".work");
  const staging = join(opts.out, ".assets-new");
  const assets = join(opts.out, "assets");
  const map = join(work, "map.json");
  const cases = parseCases(readFileSync(join(publicAssets, CASES), "utf8"), join(publicAssets, CASES));
  rmSync(work, { recursive: true, force: true });
  rmSync(staging, { recursive: true, force: true });
  try {
    explode(cases, join(work, "corpus"), join(work, "labels"));
    run(["--seed", opts.seed, "--map", map, join(work, "corpus"), join(work, "corpus-out")]);
    const summary = (run(["--map", map, "--min-count", "1000000", join(work, "labels"), join(work, "labels-out")]).split("\n").pop() ?? "").replace(map, join(opts.out, "map.json"));

    const rewritten = assemble(cases, join(work, "corpus-out"), join(work, "labels-out"));
    const text = `${rewritten.map((c) => JSON.stringify(c)).join("\n")}\n`;
    let problems: string[];
    try {
      parseCases(text, "the rewritten cases"); // the labels and the severities are still there, and so on
      problems = checkRewrite(cases, rewritten);
    } catch (e) {
      problems = [(e as Error).message];
    }
    if (problems.length > 0) return { count: 0, problems, summary };

    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, CASES), text);
    writeFileSync(join(staging, GENERATED), `${JSON.stringify({ seed: opts.seed }, null, 2)}\n`);
    rmSync(assets, { recursive: true, force: true });
    renameSync(staging, assets);
    renameSync(map, join(opts.out, "map.json"));
    return { count: rewritten.length, problems, summary };
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
}

function main(): void {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined) {
    console.error("Usage: evals/judge-gate/generate --seed N --out private/judge-gate");
    process.exit(2);
  }
  const made = generate({ seed: values.seed, out: resolve(values.out) });
  if (made.problems.length > 0) {
    const more = made.problems.length > 10 ? `\n  and ${made.problems.length - 10} more` : "";
    console.error(`judge-gate: the rewrite changed ${made.problems.length} thing${made.problems.length === 1 ? "" : "s"} it must keep, so nothing was written:\n  ${made.problems.slice(0, 10).join("\n  ")}${more}`);
    process.exit(1);
  }
  console.log(`judge-gate: ${made.count} cases written to ${join(values.out, "assets", CASES)}`);
  console.log(made.summary);
}

if (import.meta.main) main();
