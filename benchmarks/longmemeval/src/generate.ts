#!/usr/bin/env bun
// longmemeval generate: makes the private dataset from the public one with lib/rewrite.
//
//   benchmarks/longmemeval/generate --seed N --out private/longmemeval
//
// The text of each question (the question, the answer and every turn of every session) goes through one
// rewrite map, so a name or a place changes the same way in the sessions, the question and the answer.
// Dates move back by whole years, so month and day still agree with dates written in the chats.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { DATA_FILE, type Question, ensureDataset, loadQuestions, readLock } from "./dataset.ts";

const EVAL_DIR = resolve(import.meta.dir, "..");
const ROOT = resolve(EVAL_DIR, "..", "..");
const REWRITE = join(ROOT, "lib", "rewrite", "rewrite.ts");

/** A word that occurs this often in lower case is an ordinary word, whatever else the rewrite makes of it. */
export const COMMON_WORD_MIN = 20;

const MARKER = /^(?:@@question|@@answer|@@session \d+|<<[A-Za-z_]+>>)$/;

/** One text file for a question. Markers on their own lines say what each part is. */
export function explodeQuestion(q: Question): string {
  const parts: [string, string][] = [
    ["@@question", q.question],
    ["@@answer", String(q.answer)],
  ];
  q.haystack_sessions.forEach((turns, i) => {
    parts.push([`@@session ${i}`, ""]);
    for (const t of turns) parts.push([`<<${t.role}>>`, t.content]);
  });
  for (const [, content] of parts) {
    if (content.split("\n").some((line) => MARKER.test(line))) throw new Error(`question ${q.question_id} has a line that looks like a marker`);
  }
  return parts.map(([marker, content]) => (marker.startsWith("@@session") ? `${marker}\n` : `${marker}\n${content}\n`)).join("");
}

function blocks(text: string): { marker: string; content: string }[] {
  const lines = (text.endsWith("\n") ? text.slice(0, -1) : text).split("\n");
  const out: { marker: string; lines: string[] }[] = [];
  for (const line of lines) {
    if (MARKER.test(line)) out.push({ marker: line, lines: [] });
    else if (out.length > 0) out[out.length - 1].lines.push(line);
  }
  return out.map((b) => ({ marker: b.marker, content: b.lines.join("\n") }));
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2023/05/20 (Sat) 02:21" moved back by whole years, with the weekday of the new date. */
export function shiftYears(date: string, years: number): string {
  const m = /^(\d{4})\/(\d{2})\/(\d{2}) \((\w{3})\) (\d{2}:\d{2})$/.exec(date);
  if (!m) throw new Error(`unexpected date format: ${date}`);
  const [y, mo, d] = [Number(m[1]) - years, Number(m[2]), Number(m[3])];
  const when = new Date(Date.UTC(y, mo - 1, d));
  if (when.getUTCMonth() !== mo - 1) throw new Error(`${date} has no equivalent ${years} year(s) earlier`);
  return `${String(y).padStart(4, "0")}/${m[2]}/${m[3]} (${WEEKDAYS[when.getUTCDay()]}) ${m[5]}`;
}

/** The question again, with the rewritten texts and the dates moved. The ids, the types and the flags are kept. */
export function assembleQuestion(original: Question, rewritten: string, years: number): Question {
  const parts = blocks(rewritten);
  const expect = (i: number, marker: RegExp | string) => {
    const part = parts[i];
    if (!part || !(typeof marker === "string" ? part.marker === marker : marker.test(part.marker))) throw new Error(`question ${original.question_id}: expected ${marker} at block ${i}, found ${part?.marker}`);
    return part.content;
  };
  const question = expect(0, "@@question");
  const answerText = expect(1, "@@answer");
  let at = 2;
  const haystack_sessions = original.haystack_sessions.map((turns, i) => {
    expect(at++, `@@session ${i}`);
    return turns.map((t) => {
      const content = expect(at, `<<${t.role}>>`);
      at++;
      return { ...t, content };
    });
  });
  if (at !== parts.length) throw new Error(`question ${original.question_id}: ${parts.length - at} blocks more than the original`);
  return {
    ...original,
    question,
    answer: typeof original.answer === "number" && Number(answerText) === original.answer ? original.answer : answerText,
    question_date: shiftYears(original.question_date, years),
    haystack_dates: original.haystack_dates.map((d) => shiftYears(d, years)),
    haystack_sessions,
  };
}

/** Is the answer still in the evidence sessions of the rewritten question, if it was in them in the original? */
export function evidenceKept(original: Question, rewritten: Question): boolean {
  const evidence = (q: Question) => {
    const ids = new Set(q.answer_session_ids);
    return q.haystack_sessions
      .filter((_, i) => ids.has(q.haystack_session_ids[i]))
      .flatMap((turns) => turns.map((t) => t.content))
      .join("\n")
      .toLowerCase();
  };
  return !evidence(original).includes(String(original.answer).toLowerCase()) || evidence(rewritten).includes(String(rewritten.answer).toLowerCase());
}

/**
 * The lower-case words that occur at least `min` times in the texts, outside of web addresses and paths.
 * lib/rewrite renames the words in a host name everywhere ("food.com" makes "food" a name), so these are
 * put in the map as words to keep.
 */
export function commonWords(texts: Iterable<string>, min = COMMON_WORD_MIN): string[] {
  const counts = new Map<string, number>();
  const word = /(?<![\w/@.-])[a-z]{3,}(?![\w/@-]|\.\w)/g;
  for (const text of texts) for (const [w] of text.matchAll(word)) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts].filter(([, n]) => n >= min).map(([w]) => w).sort();
}

function rewrite(args: string[]): string {
  const p = Bun.spawnSync(["bun", REWRITE, ...args], { stdout: "pipe", stderr: "pipe", maxBuffer: 64 * 1024 * 1024 });
  if (p.exitCode !== 0) throw new Error(`lib/rewrite failed: ${p.stderr.toString().trim() || p.stdout.toString().trim()}`);
  return p.stdout.toString().trim();
}

async function main(): Promise<void> {
  const { values } = parseArgs({ args: Bun.argv.slice(2), options: { seed: { type: "string" }, out: { type: "string" } }, strict: true });
  if (values.seed === undefined || values.out === undefined || !/^\d{1,20}$/.test(values.seed)) {
    console.error("Usage: benchmarks/longmemeval/generate --seed N --out private/longmemeval   (N is a non-negative integer)");
    process.exit(2);
  }
  const seed = BigInt(values.seed).toString();
  const yearsBack = 1 + Number(BigInt(seed) % 2n);
  const out = resolve(values.out);
  const work = join(out, ".work");
  const assets = join(out, "assets");
  const map = join(out, "map.json");

  const lock = readLock(join(EVAL_DIR, "assets"));
  const questions = loadQuestions(await ensureDataset(join(EVAL_DIR, "assets")));
  console.log(`longmemeval: rewriting ${questions.length} questions, dates back ${yearsBack} year(s)`);

  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, "in"), { recursive: true });
  const texts = questions.map(explodeQuestion);
  texts.forEach((text, i) => writeFileSync(join(work, "in", `q${String(i + 1).padStart(4, "0")}.txt`), text));

  const keep = commonWords(texts);
  const initial = { version: 1, seed, dateShiftDays: -365 * yearsBack, words: Object.fromEntries(keep.map((w) => [w, w])), hosts: {}, ips: {}, ports: {}, uuids: {}, hex: {} };
  writeFileSync(map, JSON.stringify(initial));
  console.log(rewrite(["--seed", seed, "--map", map, join(work, "in"), join(work, "out")]).split("\n").pop());
  const finalMap = JSON.parse(readFileSync(map, "utf8")) as { words: Record<string, string> };

  const names = readdirSync(join(work, "out")).sort();
  if (names.length !== questions.length) throw new Error(`the rewrite wrote ${names.length} files for ${questions.length} questions`);
  const rewritten = questions.map((q, i) => assembleQuestion(q, readFileSync(join(work, "out", names[i]), "utf8"), yearsBack));
  const lost = questions.filter((q, i) => !evidenceKept(q, rewritten[i])).map((q) => q.question_id);
  if (lost.length > 0) throw new Error(`the rewrite took the answer out of the evidence of ${lost.length} questions (${lost.slice(0, 5).join(", ")}). Nothing was written.`);

  rmSync(assets, { recursive: true, force: true });
  mkdirSync(assets, { recursive: true });
  const data = JSON.stringify(rewritten);
  await Bun.write(join(assets, DATA_FILE), data);
  // The seed is left out: with it and the public data, anyone can make this dataset again.
  const provenance = {
    derived_from: { name: lock.dataset, source: lock.source, licence: lock.licence, revision: lock.revision, sha256: lock.files[DATA_FILE].sha256 },
    tool: "lib/rewrite",
    years_back: yearsBack,
    words_kept: keep.length,
    words_renamed: Object.keys(finalMap.words).length - keep.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
  writeFileSync(join(assets, "rewrite.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  rmSync(work, { recursive: true, force: true });
  console.log(`longmemeval: ${rewritten.length} questions written to ${join(values.out, "assets", DATA_FILE)} (${provenance.words_renamed} names and words renamed, ${keep.length} ordinary words kept)`);
}

if (import.meta.main) await main();
