#!/usr/bin/env bun
// Seeded, consistent rewrite of incidental identifiers. See README.md.
//
//   bun lib/rewrite/rewrite.ts --seed N --map <mapping.json> <in> <out>
//
// <in> is a file or a folder. The same original always gets the same replacement
// across every file in one run, and the mapping is written out so labels, cases and
// queries can be rewritten to match (pass the same --map again).

import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { COMMON, FIRST, GENERIC_LABELS, KEEP_IPS, KEEP_PORTS, MONTHS_DAYS, SURNAMES, TECH, USER_CONTENT_DOMAINS, WELL_KNOWN_DOMAINS } from "./lexicon.ts";

export interface RewriteMap {
  version: 1;
  seed: string;
  dateShiftDays: number;
  // Lowercase original word -> lowercase replacement. Applies to whole words and to
  // the parts of hostnames and identifiers (acme-corp, AcmeClient, ACME_URL).
  words: Record<string, string>;
  // Words seen only as hostname labels (garden in garden.acme.io): renamed inside
  // hostnames, never in prose, where the same word may be an ordinary one.
  hostWords: Record<string, string>;
  // Informational: full hostname -> rewritten hostname.
  hosts: Record<string, string>;
  ips: Record<string, string>;
  ports: Record<string, string>;
  uuids: Record<string, string>; // lowercase keys
  hex: Record<string, string>; // lowercase keys
}

// ---------------------------------------------------------------------------
// Seeded randomness. Every replacement is a pure function of
// (seed, kind, original, attempt), so it does not depend on processing order.

class Stream {
  private buf: Buffer;
  private pos = 0;
  private counter = 0;

  constructor(
    private seed: string,
    private kind: string,
    private key: string,
    private attempt = 0,
  ) {
    this.buf = this.refill();
  }

  private refill(): Buffer {
    return createHash("sha256").update(`${this.seed}\0${this.kind}\0${this.key}\0${this.attempt}\0${this.counter++}`).digest();
  }

  private byte(): number {
    if (this.pos >= this.buf.length) {
      this.buf = this.refill();
      this.pos = 0;
    }
    return this.buf[this.pos++];
  }

  /** A number in [0, n). */
  next(n: number): number {
    const v = ((this.byte() << 24) | (this.byte() << 16) | (this.byte() << 8) | this.byte()) >>> 0;
    return v % n;
  }

  hex(length: number): string {
    let out = "";
    while (out.length < length) out += this.byte().toString(16).padStart(2, "0");
    return out.slice(0, length);
  }
}

export function normalizeSeed(value: string): string {
  if (!/^\d{1,20}$/.test(value)) throw new UsageError(`--seed must be a non-negative integer, got "${value}"`);
  return BigInt(value).toString();
}

// ---------------------------------------------------------------------------
// Finding structured values. Each kind is matched with a regex. Matches never overlap:
// an earlier kind claims its characters first.

type HitKind = "host" | "ip" | "port" | "uuid" | "hex" | "date";
interface Hit {
  kind: HitKind;
  start: number;
  end: number;
  text: string;
}

const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IP4 = `(?:${OCTET}\\.){3}${OCTET}`;
const IP4_FULL = new RegExp(`^${IP4}$`);
const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const TLDS = "com|net|org|io|dev|app|ai|co|xyz|tech|cloud|info|biz|edu|gov|lan|local|internal";

// scheme://[userinfo@]host[:port]  (groups: 1 = prefix, 2 = host, 3 = :port). Only schemes
// that carry a hostname: others, like slack:// or discord://, carry tokens there.
const SCHEMES = "https?|ftps?|sftp|ssh|git|wss?|redis|rediss|postgres(?:ql)?|mysql|mariadb|mongodb(?:\\+srv)?|amqps?|smtps?|imaps?|ldaps?|grpc|nats|kafka|tcp|udp";
const URL_RE = new RegExp(`(\\b(?:${SCHEMES}):\\/\\/(?:[^\\s/?#@]*@)?)(${IP4}|[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?)(?![A-Za-z0-9_-])(:\\d{1,5}\\b)?`, "g");
const UUID_RE = /(?<![0-9A-Za-z-])[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?![0-9A-Za-z-])/g;
const HEX_RE = /\b[0-9A-Fa-f]{16,}\b/g;
const ISO_RE = /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const SLASH_RE = /(?<![\d/])(\d{4})\/(\d{2})\/(\d{2})(?![\d/])/g;
const MDY_RE = new RegExp(`\\b(${MONTH})(\\.?)(\\s+)(\\d{1,2})((?:st|nd|rd|th)?)(,?\\s+)(\\d{4})\\b`, "g");
const DMY_RE = new RegExp(`\\b(\\d{1,2})((?:st|nd|rd|th)?)(\\s+)(${MONTH})(\\.?)(,?\\s+)(\\d{4})\\b`, "g");
const IP_RE = new RegExp(`(?<![\\w.])(${IP4})(?!\\w|\\.\\d)(:\\d{1,5}\\b)?`, "g");
const HOST_RE = new RegExp(`(?:(?<=@)|(?<![\\w./@-]))((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS}))(?![\\w-]|\\.\\w)(:\\d{1,5}\\b)?`, "g");
const PORT_CTX_RE = /(?:\b[Pp][Oo][Rr][Tt][Ss]?\b["']?\s*[:=]?\s*["']?|--port(?:=|\s+)|\blocalhost:|\b0\.0\.0\.0:)(\d{2,5})\b/g;
const VERSION_BEFORE_RE = /(?:\b(?:version|ver\.?|release|build)\s*:?\s*|[=!<>~]=\s*|[\^~]\s*)$/i;

const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function touches(claimed: Uint8Array, start: number, end: number): boolean {
  for (let i = start; i < end; i++) if (claimed[i]) return true;
  return false;
}

function findStructured(text: string): { hits: Hit[]; claimed: Uint8Array } {
  const claimed = new Uint8Array(text.length);
  const hits: Hit[] = [];
  const add = (kind: HitKind, start: number, end: number): void => {
    for (let i = start; i < end; i++) if (claimed[i]) return;
    claimed.fill(1, start, end);
    hits.push({ kind, start, end, text: text.slice(start, end) });
  };
  for (const m of text.matchAll(URL_RE)) {
    const hostStart = m.index + m[1].length;
    add(IP4_FULL.test(m[2]) ? "ip" : "host", hostStart, hostStart + m[2].length);
    if (m[3]) add("port", hostStart + m[2].length + 1, hostStart + m[2].length + m[3].length);
  }
  for (const m of text.matchAll(UUID_RE)) {
    const digits = m[0].replace(/-/g, "");
    if (!/^(.)\1*$/.test(digits)) add("uuid", m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(HEX_RE)) {
    if (/\d/.test(m[0]) && /[a-fA-F]/.test(m[0]) && !/^(.)\1*$/.test(m[0])) add("hex", m.index, m.index + m[0].length);
  }
  for (const re of [ISO_RE, SLASH_RE, MDY_RE, DMY_RE]) {
    for (const m of text.matchAll(re)) if (shiftDate(m[0], 1) !== null) add("date", m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(IP_RE)) {
    if (VERSION_BEFORE_RE.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    add("ip", m.index, m.index + m[1].length);
    if (m[2]) add("port", m.index + m[1].length + 1, m.index + m[1].length + m[2].length);
  }
  for (const m of text.matchAll(HOST_RE)) {
    add("host", m.index, m.index + m[1].length);
    if (m[2]) add("port", m.index + m[1].length + 1, m.index + m[1].length + m[2].length);
  }
  for (const m of text.matchAll(PORT_CTX_RE)) {
    add("port", m.index + m[0].length - m[1].length, m.index + m[0].length);
  }
  hits.sort((a, b) => a.start - b.start);
  return { hits, claimed };
}

// ---------------------------------------------------------------------------
// Dates. Every date moves by the same number of days, so gaps and order are kept.

function validDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2199) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDays(y: number, m: number, d: number, delta: number): [number, number, number] {
  const dt = new Date(Date.UTC(y, m - 1, d) + delta * 86_400_000);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

function monthNumber(name: string): number {
  return MONTH_FULL.findIndex((full) => full.startsWith(name.slice(0, 3))) + 1;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
}

const p2 = (n: number): string => String(n).padStart(2, "0");

/** The date text moved by `delta` days in the same format, or null if it is not a real date. */
export function shiftDate(text: string, delta: number): string | null {
  let m = /^(\d{4})([-/])(\d{2})\2(\d{2})$/.exec(text);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[3]), Number(m[4])];
    if (!validDate(y, mo, d)) return null;
    const [ny, nm, nd] = addDays(y, mo, d, delta);
    return `${String(ny).padStart(4, "0")}${m[2]}${p2(nm)}${m[2]}${p2(nd)}`;
  }
  const named = (month: string, dayText: string, yearText: string) => {
    const [mo, d, y] = [monthNumber(month), Number(dayText), Number(yearText)];
    if (!validDate(y, mo, d)) return null;
    const [ny, nm, nd] = addDays(y, mo, d, delta);
    const abbreviated = (month.length === 3 && month !== "May") || month === "Sept";
    const name = abbreviated ? MONTH_FULL[nm - 1].slice(0, month === "Sept" && nm === 9 ? 4 : 3) : MONTH_FULL[nm - 1];
    const day = dayText.length === 2 && dayText.startsWith("0") ? p2(nd) : String(nd);
    return { name, day, ny, nd };
  };
  m = new RegExp(`^(${MONTH})(\\.?)(\\s+)(\\d{1,2})((?:st|nd|rd|th)?)(,?\\s+)(\\d{4})$`).exec(text);
  if (m) {
    const r = named(m[1], m[4], m[7]);
    return r && `${r.name}${m[2]}${m[3]}${r.day}${m[5] ? ordinal(r.nd) : ""}${m[6]}${r.ny}`;
  }
  m = new RegExp(`^(\\d{1,2})((?:st|nd|rd|th)?)(\\s+)(${MONTH})(\\.?)(,?\\s+)(\\d{4})$`).exec(text);
  if (m) {
    const r = named(m[4], m[1], m[7]);
    return r && `${r.day}${m[2] ? ordinal(r.nd) : ""}${m[3]}${r.name}${m[5]}${m[6]}${r.ny}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Words. A word is a part of a name, like Acme in Acme Corp, AcmeClient or acme-corp.

const TOKEN_RE = /[A-Za-z][A-Za-z0-9]*/g;
const HUMP_RE = /[A-Z][a-z0-9]+|[A-Z]+(?![a-z])|[a-z0-9]+/g;
const FIRST_SET = new Set(FIRST);
const SURNAME_SET = new Set(SURNAMES);

const baseOf = (word: string): string => word.replace(/\d+$/, "");

function isKnownWord(word: string): boolean {
  const b = baseOf(word);
  return COMMON.has(word) || COMMON.has(b) || TECH.has(word) || TECH.has(b) || MONTHS_DAYS.has(b);
}

/** Could this word be renamed at all? It must not be a common or well-known word. */
function eligible(word: string): boolean {
  return baseOf(word).length >= 3 && !isKnownWord(word);
}

function matchCase(original: string, replacement: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase();
  if (/^[A-Z]/.test(original)) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function isSentenceStart(text: string, index: number): boolean {
  let j = index - 1;
  while (j >= 0 && (text[j] === " " || text[j] === "\t")) j--;
  const marked = j >= 0 && "*_`\"'([".includes(text[j]); // directly after an opening mark
  while (j >= 0 && " \t*_`\"'([".includes(text[j])) j--;
  if (j < 0 || marked) return true;
  const c = text[j];
  if ("\n\r.!?:|".includes(c)) return true; // after a sentence, a label, or a table cell
  if ("-\u2013\u2014>#+".includes(c)) {
    // a dash set off by spaces, or a list marker or heading mark at the start of a line
    const before = text[j - 1] ?? "\n";
    return " \t\n\r-#>+*".includes(before);
  }
  return false;
}

const SMALL_WORDS = new Set("a an the and or but of to in on at for with from by vs via as is it its into over per than".split(" "));

/** A line in Title Case, such as a heading: every word is capitalised or a small word. */
function isTitleLine(tokens: string[]): boolean {
  return tokens.length >= 3 && tokens.every((w) => /^[A-Z]/.test(w) || SMALL_WORDS.has(w));
}

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "sir"]);

/**
 * Is the word the second half of a Title Case phrase of ordinary words, like "the Metrics
 * Collector"? A sentence that opens with a verb ("Ask Priya") is not such a phrase.
 */
function followsTitleWord(text: string, lineStart: number, previous: RegExpMatchArray | undefined, current: RegExpMatchArray): boolean {
  if (!previous || !/^[A-Z]/.test(previous[0])) return false;
  const gap = text.slice(lineStart + previous.index + previous[0].length, lineStart + current.index);
  const p = previous[0].toLowerCase();
  return /^[ \t]+$/.test(gap) && isKnownWord(p) && !TITLES.has(p) && !isSentenceStart(text, lineStart + previous.index);
}

const COMMON_ENDING = /(?:tion|sion|ment|ness|ity|ities|able|ible|ical|ology|ance|ence|ship|ful|less|ics|ings?|ized|ised|ated|ally|ively|ously|ably|ibly|fully)s?$/;

/** Long words with an ordinary English ending are common words, not names. */
function hasCommonEnding(word: string): boolean {
  const base = baseOf(word);
  return base.length >= 7 && (COMMON_ENDING.test(base) || (base.length >= 8 && base.endsWith("ly")));
}

interface Stat {
  count: number; // every occurrence, in any case or position
  cap: number; // seen as a plain capitalised word (Acme, not AcmeClient)
  mid: number; // ...somewhere other than the start of a sentence
  lower: number; // seen as a lowercase word or part of a slug, which marks a common word
}

interface Found {
  words: Map<string, Stat>;
  forced: Set<string>; // words from email addresses: names, renamed everywhere
  hostForced: Set<string>; // words from hostname labels: renamed inside hostnames only
  hosts: Set<string>;
  ips: Set<string>;
  ports: Set<string>;
  uuids: Set<string>;
  hex: Set<string>;
}

const emptyFound = (): Found => ({ words: new Map(), forced: new Set(), hostForced: new Set(), hosts: new Set(), ips: new Set(), ports: new Set(), uuids: new Set(), hex: new Set() });

const EMAIL_LOCAL_RE = /([A-Za-z0-9._%+-]+)@(?=[A-Za-z0-9-]+\.[A-Za-z])/g;

/** The word in a hostname or email part such as "orion" or "node01", if it may be renamed. */
function renamable(part: string): { word: string; digits: string } | undefined {
  const m = /^([A-Za-z]+)(\d*)$/.exec(part);
  return m && eligible(m[1].toLowerCase()) && !GENERIC_LABELS.has(m[1].toLowerCase()) ? { word: m[1], digits: m[2] } : undefined;
}

/** Number of trailing labels that are never renamed: all of them for a well-known domain, else the TLD. */
function protectedLabels(labels: string[]): number {
  if (labels.length < 2) return 0;
  const domain = labels.slice(-2).join(".").toLowerCase();
  if (WELL_KNOWN_DOMAINS.has(domain)) return labels.length;
  return USER_CONTENT_DOMAINS.has(domain) ? 2 : 1;
}

// ---------------------------------------------------------------------------

export interface Options {
  /** A capitalised word must be seen this many times to count as a name. Default 2. */
  minCount?: number;
}

export class Rewriter {
  readonly map: RewriteMap;
  private found = emptyFound();
  private minCount: number;

  constructor(seed: string, existing?: RewriteMap, options: Options = {}) {
    this.minCount = options.minCount ?? 2;
    if (existing) {
      if (existing.seed !== seed) throw new UsageError(`the map was made with seed ${existing.seed}, not ${seed}`);
      this.map = existing;
      this.map.words ??= {};
      this.map.hostWords ??= {};
      this.map.hosts ??= {};
      this.map.ips ??= {};
      this.map.ports ??= {};
      this.map.uuids ??= {};
      this.map.hex ??= {};
    } else {
      const shift = new Stream(seed, "date", "shift");
      const days = 30 + shift.next(700);
      this.map = { version: 1, seed, dateShiftDays: shift.next(2) ? days : -days, words: {}, hostWords: {}, hosts: {}, ips: {}, ports: {}, uuids: {}, hex: {} };
    }
  }

  /** Pass 1: read a text so its names and values are known. Call finish() after all texts. */
  collect(text: string): void {
    const { hits, claimed } = findStructured(text);
    const f = this.found;
    for (const h of hits) {
      const lower = h.text.toLowerCase();
      if (h.kind === "host") {
        f.hosts.add(lower);
        const labels = lower.split(".");
        for (const label of labels.slice(0, labels.length - protectedLabels(labels))) {
          for (const part of label.split("-")) {
            const r = renamable(part);
            if (r) f.hostForced.add(r.word.toLowerCase());
          }
        }
      } else if (h.kind === "ip") {
        if (!keepIp(h.text)) f.ips.add(h.text);
      } else if (h.kind === "port") {
        if (!keepPort(h.text)) f.ports.add(h.text);
      } else if (h.kind === "uuid") f.uuids.add(lower);
      else if (h.kind === "hex") f.hex.add(lower);
    }
    // The words in an email address are names. A lowercase word proves a word is common
    // everywhere except there and in paths (priya@acme.dev, github.com/acme/tool).
    const email = new Uint8Array(text.length);
    for (const m of text.matchAll(EMAIL_LOCAL_RE)) {
      email.fill(1, m.index, m.index + m[1].length);
      for (const part of m[1].split(/[._%+-]/)) {
        const r = renamable(part);
        if (r) f.forced.add(r.word.toLowerCase());
      }
    }
    let lineStart = 0;
    for (const line of text.split("\n")) {
      const lineTokens = [...line.matchAll(TOKEN_RE)].filter((m) => !touches(claimed, lineStart + m.index, lineStart + m.index + m[0].length));
      const title = /^\s{0,3}#{1,6}\s/.test(line) || isTitleLine(lineTokens.map((m) => m[0])) || (lineTokens.length === 1 && line.trim() === lineTokens[0][0]);
      let prev: RegExpMatchArray | undefined;
      for (const m of lineTokens) {
        const previous = prev;
        prev = m;
        const start = lineStart + m.index;
        const token = m[0];
        const lowerToken = token.toLowerCase();
        if (isKnownWord(lowerToken)) continue;
        const humps = token.match(HUMP_RE) ?? [];
        for (const hump of humps) {
          const key = hump.toLowerCase();
          let s = f.words.get(key);
          if (!s) f.words.set(key, (s = { count: 0, cap: 0, mid: 0, lower: 0 }));
          s.count++;
        }
        if (humps.length !== 1) continue; // identifiers like AcmeClient only count as occurrences
        const s = f.words.get(lowerToken) as Stat;
        if (/^[A-Z][a-z0-9]+$/.test(token) && !title && !followsTitleWord(text, lineStart, previous, m)) {
          s.cap++;
          if (!isSentenceStart(text, start)) s.mid++;
        } else if (token === lowerToken && !email[start] && !"/@".includes(text[start - 1] ?? " ") && !"/@".includes(text[start + token.length] ?? " ")) {
          s.lower++;
        }
      }
      lineStart += line.length + 1;
    }
  }

  /** Pass 2: give every original that has no replacement yet a replacement. */
  finish(): void {
    const { map, found: f, minCount } = this;
    const taken = new Set([...Object.keys(map.words), ...Object.values(map.words), ...Object.keys(map.hostWords), ...Object.values(map.hostWords)]);

    const names = new Set<string>(f.forced);
    // A hostname word is a name when the text also writes it as one: capitalized mid-sentence and never in lowercase.
    for (const w of f.hostForced) {
      const s = f.words.get(w);
      if (s && s.cap >= 1 && s.mid >= 1 && s.lower === 0) names.add(w);
    }
    for (const [word, s] of f.words) {
      const person = FIRST_SET.has(baseOf(word)) || SURNAME_SET.has(baseOf(word)); // not blocked by slugs like priya-sharma
      if (s.cap >= 1 && s.mid >= 1 && s.count >= minCount && (s.lower === 0 || person) && /^[a-z]+\d*$/.test(word) && eligible(word) && !hasCommonEnding(word)) names.add(word);
    }
    const fresh = [...names].filter((w) => own(map.words, w) === undefined).sort(byCode);
    for (const w of fresh) taken.add(w);
    for (const w of fresh) {
      const r = this.makeWord(w, taken);
      map.words[w] = r;
      taken.add(r);
    }
    // A hostname word that is not also a name in the text is renamed inside hostnames only.
    const hostOnly = [...f.hostForced].filter((w) => own(map.words, w) === undefined && own(map.hostWords, w) === undefined).sort(byCode);
    for (const w of hostOnly) taken.add(w);
    for (const w of hostOnly) {
      const r = this.makeWord(w, taken);
      map.hostWords[w] = r;
      taken.add(r);
    }

    this.assign(f.ips, map.ips, "ip", (o, s) => makeIp(o, s));
    this.assign(f.ports, map.ports, "port", (o, s) => makePort(o, s));
    this.assign(f.uuids, map.uuids, "uuid", (o, s) => makeUuid(o, s));
    this.assign(f.hex, map.hex, "hex", (o, s) => s.hex(o.length));
    for (const h of [...f.hosts].sort(byCode)) {
      const r = this.rewriteHost(h);
      if (r !== h) map.hosts[h] = r;
    }
  }

  private assign(originals: Set<string>, table: Record<string, string>, kind: string, make: (original: string, s: Stream) => string): void {
    const taken = new Set([...Object.keys(table), ...Object.values(table), ...originals]);
    for (const o of [...originals].sort(byCode)) {
      if (own(table, o) !== undefined) continue;
      for (let attempt = 0; ; attempt++) {
        const r = make(o, new Stream(this.map.seed, kind, o, attempt));
        if (!taken.has(r)) {
          table[o] = r;
          taken.add(r);
          break;
        }
      }
    }
  }

  private makeWord(key: string, taken: Set<string>): string {
    const base = baseOf(key);
    const digits = key.slice(base.length);
    const pool = FIRST_SET.has(base) ? FIRST : SURNAME_SET.has(base) ? SURNAMES : null;
    for (let attempt = 0; ; attempt++) {
      const s = new Stream(this.map.seed, "word", key, attempt);
      const word = (pool && attempt < 50 ? pool[s.next(pool.length)] : pseudoWord(s, base.length)) + digits;
      if (!taken.has(word) && !isKnownWord(word)) return word;
    }
  }

  /** Pass 3: rewrite a text. Everything in it must have been collected first. */
  rewrite(text: string): string {
    const { hits, claimed } = findStructured(text);
    const edits: Array<[number, number, string]> = [];
    for (const h of hits) {
      const r = this.replacement(h);
      if (r !== h.text) edits.push([h.start, h.end, r]);
    }
    for (const m of text.matchAll(TOKEN_RE)) {
      if (touches(claimed, m.index, m.index + m[0].length)) continue;
      const r = this.rewriteToken(m[0]);
      if (r !== m[0]) edits.push([m.index, m.index + m[0].length, r]);
    }
    edits.sort((a, b) => a[0] - b[0]);
    let out = "";
    let last = 0;
    for (const [start, end, r] of edits) {
      out += text.slice(last, start) + r;
      last = end;
    }
    return out + text.slice(last);
  }

  private replacement(h: Hit): string {
    const m = this.map;
    switch (h.kind) {
      case "host":
        return this.rewriteHost(h.text);
      case "ip":
        return own(m.ips, h.text) ?? h.text;
      case "port":
        return own(m.ports, h.text) ?? h.text;
      case "uuid":
        return matchHexCase(h.text, own(m.uuids, h.text.toLowerCase()));
      case "hex":
        return matchHexCase(h.text, own(m.hex, h.text.toLowerCase()));
      case "date":
        return shiftDate(h.text, m.dateShiftDays) ?? h.text;
    }
  }

  private rewriteToken(token: string): string {
    const humps = token.match(HUMP_RE) ?? [];
    const replaced = humps.map((h) => {
      const r = own(this.map.words, h.toLowerCase());
      return r === undefined ? h : matchCase(h, r);
    });
    return replaced.join("");
  }

  private rewriteHost(host: string): string {
    const known = own(this.map.hosts, host.toLowerCase());
    if (known !== undefined) return known;
    const labels = host.split(".");
    const end = labels.length - protectedLabels(labels.map((l) => l.toLowerCase()));
    for (let i = 0; i < end; i++) {
      labels[i] = labels[i]
        .split("-")
        .map((part) => {
          const r = renamable(part);
          const key = r?.word.toLowerCase();
          const replacement = key && (own(this.map.words, key) ?? own(this.map.hostWords, key));
          return r && replacement ? matchCase(r.word, replacement) + r.digits : part;
        })
        .join("-");
    }
    return labels.join(".");
  }
}

// ---------------------------------------------------------------------------
// Replacement makers

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A table lookup that ignores Object.prototype, so a word like "constructor" is not found by accident. */
const own = (table: Record<string, string>, key: string): string | undefined => (Object.hasOwn(table, key) ? table[key] : undefined);

const CONSONANTS = "bdfgklmnprstvz";
const VOWELS = "aeiou";

function pseudoWord(s: Stream, length: number): string {
  let out = "";
  let vowel = s.next(4) === 0;
  while (out.length < length) {
    out += vowel ? VOWELS[s.next(VOWELS.length)] : CONSONANTS[s.next(CONSONANTS.length)];
    vowel = !vowel;
  }
  return out;
}

function matchHexCase(original: string, replacement: string | undefined): string {
  if (replacement === undefined) return original;
  return /[A-F]/.test(original) && !/[a-f]/.test(original) ? replacement.toUpperCase() : replacement;
}

function makeUuid(original: string, s: Stream): string {
  const digits = s.hex(32);
  let n = 0;
  return [...original].map((c, i) => (c === "-" || i === 14 || i === 19 ? c : digits[n++])).join("");
}

function keepIp(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    KEEP_IPS.has(ip) ||
    a === 127 ||
    a === 0 ||
    a === 255 ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

const PUBLIC_FIRST_OCTETS = Array.from({ length: 213 }, (_, i) => i + 11).filter((a) => ![100, 127, 169, 172, 192, 198, 203].includes(a));

function makeIp(original: string, s: Stream): string {
  const [a, b] = original.split(".").map(Number);
  const host = () => 1 + s.next(254);
  if (a === 10) return `10.${s.next(256)}.${s.next(256)}.${host()}`;
  if (a === 172 && b >= 16 && b <= 31) return `172.${16 + s.next(16)}.${s.next(256)}.${host()}`;
  if (a === 192 && b === 168) return `192.168.${s.next(256)}.${host()}`;
  if (a === 100 && b >= 64 && b <= 127) return `100.${64 + s.next(64)}.${s.next(256)}.${host()}`;
  return `${PUBLIC_FIRST_OCTETS[s.next(PUBLIC_FIRST_OCTETS.length)]}.${s.next(256)}.${s.next(256)}.${host()}`;
}

function keepPort(port: string): boolean {
  const n = Number(port);
  return n < 1024 || n > 65535 || KEEP_PORTS.has(n);
}

function makePort(original: string, s: Stream): string {
  const [lo, hi] = Number(original) < 10000 ? [1024, 9999] : [10000, 59999];
  return String(lo + s.next(hi - lo + 1));
}

// ---------------------------------------------------------------------------
// Files

export class UsageError extends Error {}

const isText = (buf: Buffer): boolean => {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
};

function listFiles(root: string, skip: Set<string>): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort(byCode)) {
      if (name === ".git") continue;
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isSymbolicLink() || skip.has(full)) continue;
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push(full);
    }
  };
  walk(root);
  return out;
}

/** Splits a relative path into [stem, extension] parts. Only stems are rewritten, never extensions. */
function pathParts(rel: string): Array<[string, string]> {
  const parts = rel.split(sep);
  return parts.map((p, i) => {
    const ext = i === parts.length - 1 ? extname(p) : "";
    return [p.slice(0, p.length - ext.length), ext];
  });
}

export interface RunOptions extends Options {
  seed?: string;
  mapPath: string;
  input: string;
  output: string;
}

export interface RunResult {
  files: number;
  copied: number;
  map: RewriteMap;
}

export function run(opts: RunOptions): RunResult {
  const input = resolve(opts.input);
  const output = resolve(opts.output);
  const mapPath = resolve(opts.mapPath);
  if (!existsSync(input)) throw new UsageError(`input not found: ${opts.input}`);
  const inIsDir = lstatSync(input).isDirectory();
  if (output === input || output.startsWith(input + sep)) throw new UsageError("the output must be outside the input");

  let existing: RewriteMap | undefined;
  if (existsSync(mapPath)) {
    existing = JSON.parse(readFileSync(mapPath, "utf8")) as RewriteMap;
    if (existing.version !== 1) throw new UsageError(`unsupported map version in ${opts.mapPath}`);
  }
  const seed = opts.seed !== undefined ? normalizeSeed(opts.seed) : existing?.seed;
  if (seed === undefined) throw new UsageError("--seed is required when the map does not exist yet");

  const rewriter = new Rewriter(seed, existing, opts);
  const sources = inIsDir ? listFiles(input, new Set([mapPath])) : [input];
  const files = sources.map((full) => {
    const rel = inIsDir ? relative(input, full) : relative(dirname(input), full);
    const data = readFileSync(full);
    return { full, rel, data, text: isText(data) ? data.toString("utf8") : null, mode: lstatSync(full).mode & 0o777 };
  });

  for (const f of files) {
    if (f.text !== null) rewriter.collect(f.text);
    for (const [stem] of pathParts(f.rel)) rewriter.collect(stem);
  }
  rewriter.finish();

  const written = new Set<string>();
  let copied = 0;
  for (const f of files) {
    const rel = pathParts(f.rel)
      .map(([stem, ext]) => rewriter.rewrite(stem) + ext)
      .join(sep);
    const target = inIsDir ? join(output, rel) : output;
    if (written.has(target)) throw new Error(`two inputs would be written to ${target}`);
    written.add(target);
    mkdirSync(dirname(target), { recursive: true });
    if (f.text === null) copied++;
    writeFileSync(target, f.text === null ? f.data : rewriter.rewrite(f.text));
    chmodSync(target, f.mode);
  }

  mkdirSync(dirname(mapPath), { recursive: true });
  writeFileSync(mapPath, `${JSON.stringify(sortedMap(rewriter.map), null, 2)}\n`);
  return { files: files.length, copied, map: rewriter.map };
}

function sortedMap(map: RewriteMap): RewriteMap {
  const sortKeys = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => byCode(a, b)));
  return { ...map, words: sortKeys(map.words), hosts: sortKeys(map.hosts), ips: sortKeys(map.ips), ports: sortKeys(map.ports), uuids: sortKeys(map.uuids), hex: sortKeys(map.hex) };
}

// ---------------------------------------------------------------------------
// CLI

const USAGE = `Usage: bun lib/rewrite/rewrite.ts --seed <n> --map <mapping.json> [--min-count <n>] <in> <out>

Rewrites incidental identifiers (names, hostnames, URLs, IPs, ports, UUIDs, long hex
ids, dates) in <in>, a file or a folder, and writes the result to <out>.

  --seed <n>        the seed, a non-negative integer. Optional when --map already exists.
  --map <file>      the mapping. Read if it exists, and always written at the end.
                    Pass the same file to rewrite labels, cases and queries to match.
  --min-count <n>   how many times a capitalised word must appear to count as a name
                    (default 2).
`;

function parseArgs(argv: string[]): RunOptions {
  const positional: string[] = [];
  const opts: Partial<RunOptions> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new UsageError(`${a} needs a value`);
      return v;
    };
    if (a === "--seed") opts.seed = value();
    else if (a === "--map") opts.mapPath = value();
    else if (a === "--min-count") opts.minCount = Number(value());
    else if (a === "-h" || a === "--help") throw new UsageError("");
    else if (a.startsWith("--")) throw new UsageError(`unknown option ${a}`);
    else positional.push(a);
  }
  if (opts.minCount !== undefined && !(opts.minCount >= 1)) throw new UsageError("--min-count must be 1 or more");
  if (!opts.mapPath) throw new UsageError("--map is required");
  if (positional.length !== 2) throw new UsageError("expected <in> and <out>");
  return { ...opts, mapPath: opts.mapPath, input: positional[0], output: positional[1] };
}

export function main(argv: string[]): number {
  try {
    const opts = parseArgs(argv);
    const { files, copied, map } = run(opts);
    const n = (o: Record<string, string>) => Object.keys(o).length;
    console.log(`rewrite: ${files} file${files === 1 ? "" : "s"} written to ${opts.output} (${copied} copied unchanged)`);
    console.log(
      `rewrite: map ${opts.mapPath}: ${n(map.words)} words, ${n(map.hostWords)} hostname words, ${n(map.hosts)} hosts, ${n(map.ips)} ips, ${n(map.ports)} ports, ${n(map.uuids)} uuids, ${n(map.hex)} hex ids, dates ${map.dateShiftDays > 0 ? "+" : ""}${map.dateShiftDays} days`,
    );
    return 0;
  } catch (e) {
    if (e instanceof UsageError) {
      if (e.message) console.error(`rewrite: ${e.message}\n`);
      console.error(USAGE);
      return e.message ? 2 : 0;
    }
    console.error(`rewrite: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
