#!/usr/bin/env bun
// longmemeval generate: makes the private dataset from the public one with lib/rewrite.
//
//   benchmarks/longmemeval/generate --seed N --out private/longmemeval
//
// The text of each question (the question, the answer and every turn of every session) goes through one
// rewrite map, so a name or a place changes the same way in the sessions, the question and the answer.
// Numbers and versions are kept (--keep-values): the answers count days, times and items in the sessions.
// Tool and product names are renamed, and the check below shows the answers stay in their evidence, for the
// answers that are in their evidence word for word. rewrite.json says how many questions that is.
// Dates move back by whole calendar years, the sessions' and the ones written in the chats, so month and day agree.

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

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthNumber = (name: string): number => MONTH_NAMES.indexOf(name.slice(0, 3).toLowerCase()) + 1;
const p2 = (n: number): string => String(n).padStart(2, "0");

interface DateForm {
  re: RegExp;
  /** The year, month and day of a match. */
  read: (m: RegExpExecArray) => [number, number, number];
  /** The match again with this year and day. The month, the spelling and the separators stay. */
  write: (m: RegExpExecArray, year: number, day: number) => string;
}

// The four ways lib/rewrite finds a date in a text, with the same patterns, so that the two agree on what a date is. A test runs
// lib/rewrite and shiftTextDates on the same texts and fails when they disagree about one.
const DATE_FORMS: DateForm[] = [
  { re: /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?!\d)/g, read: (m) => [Number(m[1]), Number(m[2]), Number(m[3])], write: (m, y, d) => `${y}-${m[2]}-${p2(d)}` },
  { re: /(?<![\d/])(\d{4})\/(\d{2})\/(\d{2})(?![\d/])/g, read: (m) => [Number(m[1]), Number(m[2]), Number(m[3])], write: (m, y, d) => `${y}/${m[2]}/${p2(d)}` },
  {
    re: new RegExp(`\\b(${MONTH})(\\.?)(\\s+)(\\d{1,2})((?:st|nd|rd|th)?)(,?\\s+)(\\d{4})\\b`, "g"),
    read: (m) => [Number(m[7]), monthNumber(m[1]), Number(m[4])],
    write: (m, y, d) => `${m[1]}${m[2]}${m[3]}${m[4].length === 2 && m[4].startsWith("0") ? p2(d) : d}${m[5]}${m[6]}${y}`,
  },
  {
    re: new RegExp(`\\b(\\d{1,2})((?:st|nd|rd|th)?)(\\s+)(${MONTH})(\\.?)(,?\\s+)(\\d{4})\\b`, "g"),
    read: (m) => [Number(m[7]), monthNumber(m[4]), Number(m[1])],
    write: (m, y, d) => `${m[1].length === 2 && m[1].startsWith("0") ? p2(d) : d}${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}${y}`,
  },
];

/** Is it a real date, in the years lib/rewrite treats as dates (1900 to 2199)? */
function isRealDate(y: number, mo: number, d: number): boolean {
  if (y < 1900 || y > 2199) return false;
  const when = new Date(Date.UTC(y, mo - 1, d));
  return when.getUTCFullYear() === y && when.getUTCMonth() === mo - 1 && when.getUTCDate() === d;
}

/**
 * Every date written in full in the text (2023-05-20, 2023/05/20, May 20th, 2023, 20 May 2023) moved back by whole calendar years: the
 * same month and day, as a session's date moves with shiftYears, and not by a count of days, which is a day off past a 29th of
 * February. A 29th of February with no equivalent becomes the 28th. A bare year, or a month and a year, is not a date here and is not moved.
 */
export function shiftTextDates(text: string, years: number): string {
  const claimed = new Uint8Array(text.length);
  const edits: { start: number; end: number; text: string }[] = [];
  for (const form of DATE_FORMS) {
    for (const m of text.matchAll(form.re)) {
      const [start, end] = [m.index, m.index + m[0].length];
      const [y, mo, d] = form.read(m);
      if (!isRealDate(y, mo, d) || claimed.subarray(start, end).some(Boolean)) continue; // not a date, which lib/rewrite leaves alone too
      claimed.fill(1, start, end);
      const leap = new Date(Date.UTC(y - years, 1, 29)).getUTCMonth() === 1;
      edits.push({ start, end, text: form.write(m, y - years, mo === 2 && d === 29 && !leap ? 28 : d) });
    }
  }
  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
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

const evidenceText = (q: Question): string => {
  const ids = new Set(q.answer_session_ids);
  return q.haystack_sessions
    .filter((_, i) => ids.has(q.haystack_session_ids[i]))
    .flatMap((turns) => turns.map((t) => t.content))
    .join("\n")
    .toLowerCase();
};

/**
 * Is the answer of the original question in its evidence sessions word for word? Only then can the evidence check below say anything.
 * An answer that is counted from the sessions (how many days, how many times) or put in other words is not, and the check lets it pass.
 */
export const evidenceChecked = (original: Question): boolean => evidenceText(original).includes(String(original.answer).toLowerCase());

/** How many of the questions the evidence check covers (see evidenceChecked). */
export const evidenceCoverage = (questions: Question[]): { questions: number; checked: number } => ({ questions: questions.length, checked: questions.filter(evidenceChecked).length });

/** Is the answer still in the evidence sessions of the rewritten question, if it was in them in the original? True for a question the check does not cover (see evidenceChecked). */
export function evidenceKept(original: Question, rewritten: Question): boolean {
  return !evidenceChecked(original) || evidenceText(rewritten).includes(String(rewritten.answer).toLowerCase());
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
  const texts = questions.map((q) => shiftTextDates(explodeQuestion(q), yearsBack));
  texts.forEach((text, i) => writeFileSync(join(work, "in", `q${String(i + 1).padStart(4, "0")}.txt`), text));

  const keep = commonWords(texts);
  // The dates are moved above, by calendar years, so the rewrite moves none by a count of days.
  const initial = { version: 1, seed, dateShiftDays: 0, words: Object.fromEntries(keep.map((w) => [w, w])), hosts: {}, ips: {}, ports: {}, uuids: {}, hex: {} };
  writeFileSync(map, JSON.stringify(initial));
  console.log(rewrite(["--seed", seed, "--map", map, "--keep-values", join(work, "in"), join(work, "out")]).split("\n").pop());
  const finalMap = JSON.parse(readFileSync(map, "utf8")) as { words: Record<string, string> };

  const names = readdirSync(join(work, "out")).sort();
  if (names.length !== questions.length) throw new Error(`the rewrite wrote ${names.length} files for ${questions.length} questions`);
  const rewritten = questions.map((q, i) => assembleQuestion(q, readFileSync(join(work, "out", names[i]), "utf8"), yearsBack));
  const lost = questions.filter((q, i) => !evidenceKept(q, rewritten[i])).map((q) => q.question_id);
  const coverage = evidenceCoverage(questions);
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
    // The check covers the questions whose answer is in the evidence word for word. The others (counted or put in other words) pass it unchecked.
    evidence_check: coverage,
    words_kept: keep.length,
    words_renamed: Object.keys(finalMap.words).length - keep.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
  writeFileSync(join(assets, "rewrite.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  rmSync(work, { recursive: true, force: true });
  console.log(`longmemeval: ${rewritten.length} questions written to ${join(values.out, "assets", DATA_FILE)} (${provenance.words_renamed} names and words renamed, ${keep.length} ordinary words kept; the evidence check covers ${coverage.checked} of them)`);
}

if (import.meta.main) await main();
