import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMON, FIRST, GENERIC_LABELS, INVENTED_TOOLS, KEEP_NUMBERS, PLAIN, SURNAMES, TECH, TOOLS } from "./lexicon.ts";
import { type Options, type RewriteMap, Rewriter, main, place, run, shiftDate, spread } from "./rewrite.ts";

const SCRIPT = join(import.meta.dir, "rewrite.ts");

/** Rewrite a set of texts as one run. */
function rewriteAll(texts: string[], seed = "1", minCount = 2, options: Options = {}): { out: string[]; map: Rewriter["map"] } {
  const r = new Rewriter(seed, undefined, { minCount, ...options });
  for (const t of texts) r.collect(t);
  r.finish();
  return { out: texts.map((t) => r.rewrite(t)), map: r.map };
}

const NOTE_A = `# Priya Sharma

Priya Sharma leads the Acme Corp platform team. Ask Priya about Zephyr, or Marcus Delgado.
Zephyr runs on Python and Docker. Reach her at priya.sharma@acme.dev or at https://wiki.acme.dev/people.
`;
const NOTE_B = `Marcus said the Zephyr deploy to orion.lab.acme.dev (192.168.1.50:8443) failed on 2025-03-12.
We asked Marcus to restart it on port 9000. Request 3f2b8c1a-9d4e-4b6a-8c5d-1e2f3a4b5c6d, commit
9fceb02d0ae598e95dc970b74767f19372d61724. We asked Priya about Acme Corp. The review is due 2025-03-19.
`;

describe("consistency", () => {
  test("the same seed gives the same output and map, and another seed gives a different one", () => {
    const a = rewriteAll([NOTE_A, NOTE_B], "42");
    const b = rewriteAll([NOTE_A, NOTE_B], "42");
    const c = rewriteAll([NOTE_A, NOTE_B], "43");
    expect(b.out).toEqual(a.out);
    expect(JSON.stringify(b.map)).toBe(JSON.stringify(a.map));
    expect(c.out).not.toEqual(a.out);
  });

  test("the same original gets the same replacement in every file", () => {
    const { out, map } = rewriteAll([NOTE_A, NOTE_B]);
    const acme = map.words.acme;
    const priya = map.words.priya;
    expect(acme).toBeString();
    expect(acme).not.toBe("acme");
    for (const text of out) expect(text.toLowerCase()).not.toContain("acme");
    expect(out[0]).toContain(`${priya[0].toUpperCase()}${priya.slice(1)} `);
    expect(out[1]).toContain(`${priya[0].toUpperCase()}${priya.slice(1)} about`);
    // the word is renamed inside hostnames, emails and URLs too
    expect(out[0]).toContain(`@${acme}.dev`);
    expect(out[1]).toContain(`.lab.${acme}.dev`);
  });

  test("the map records every replacement so labels can be rewritten to match", () => {
    const { map } = rewriteAll([NOTE_A, NOTE_B]);
    expect(Object.keys(map.words)).toEqual(expect.arrayContaining(["acme", "priya", "sharma", "marcus", "zephyr"]));
    expect(Object.keys(map.hostWords)).toEqual(["orion"]); // only ever a hostname label
    expect(map.hosts["orion.lab.acme.dev"]).toBe(`${map.hostWords.orion}.lab.${map.words.acme}.dev`);
    expect(Object.keys(map.ips)).toEqual(["192.168.1.50"]);
    expect(Object.keys(map.ports).sort()).toEqual(["8443", "9000"]);
    expect(Object.keys(map.uuids)).toEqual(["3f2b8c1a-9d4e-4b6a-8c5d-1e2f3a4b5c6d"]);
    expect(Object.keys(map.hex)).toEqual(["9fceb02d0ae598e95dc970b74767f19372d61724"]);
  });
});

describe("structured values", () => {
  const text = `Host 192.168.1.50:8443, 10.20.30.40 and 172.20.4.9. Public 52.14.7.9 and 8.8.8.8 and 127.0.0.1.
uuid 3F2B8C1A-9D4E-4B6A-8C5D-1E2F3A4B5C6D and 3f2b8c1a-9d4e-4b6a-8c5d-1e2f3a4b5c6d.
sha 9fceb02d0ae598e95dc970b74767f19372d61724 short ba3213e. Listening on localhost:3000 and port 5432.
`;
  const { out, map } = rewriteAll([text]);
  const rewritten = out[0];

  test("IP addresses stay in their address class and well-known ones are kept", () => {
    expect(map.ips["192.168.1.50"]).toMatch(/^192\.168\.\d+\.\d+$/);
    expect(map.ips["10.20.30.40"]).toMatch(/^10\.\d+\.\d+\.\d+$/);
    expect(map.ips["172.20.4.9"]).toMatch(/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/);
    expect(map.ips["52.14.7.9"]).not.toBeUndefined();
    expect(map.ips["8.8.8.8"]).toBeUndefined();
    expect(map.ips["127.0.0.1"]).toBeUndefined();
    expect(rewritten).toContain("8.8.8.8");
    expect(rewritten).toContain("127.0.0.1");
    expect(rewritten).not.toContain("192.168.1.50");
  });

  test("ports in URLs and after 'port' are rewritten; well-known ports are kept", () => {
    expect(rewritten).not.toContain(":8443");
    expect(rewritten).not.toContain("localhost:3000");
    expect(rewritten).toContain("port 5432");
    expect(map.ports["8443"]).toMatch(/^\d{4,5}$/);
  });

  test("UUIDs and long hex ids keep their shape and case", () => {
    const upper = rewritten.match(/uuid ([0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}) and/)?.[1];
    const lower = rewritten.match(/and ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./)?.[1];
    expect(upper).toBeString();
    expect(lower).toBeString();
    expect(upper?.toLowerCase()).toBe(lower as string); // the same uuid in two cases
    expect(upper).not.toContain("3F2B8C1A");
    expect(upper?.[14]).toBe("4"); // version nibble is kept
    const hex = rewritten.match(/sha ([0-9a-f]+) short/)?.[1];
    expect(hex).toHaveLength(40);
    expect(hex).not.toBe("9fceb02d0ae598e95dc970b74767f19372d61724");
    expect(rewritten).toContain("short ba3213e"); // short ids are not long hex ids
  });

  test("dates move by one seeded number of days, so gaps and order are kept", () => {
    const dates = "Start 2025-03-05, then March 12, 2025, then 19 March 2025, then 2025/03/26 and Mar 31 2025.";
    const r = rewriteAll([dates], "9");
    const found = [...r.out[0].matchAll(/(\d{4})-(\d{2})-(\d{2})|([A-Z][a-z]+ \d{1,2}, \d{4})|(\d{1,2} [A-Z][a-z]+ \d{4})|(\d{4}\/\d{2}\/\d{2})|(Mar|Jan|Feb|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2} \d{4}/g)];
    expect(found).toHaveLength(5);
    const shifted = (s: string, days: number): string => shiftDate(s, days) as string;
    const shift = r.map.dateShiftDays;
    expect(Math.abs(shift)).toBeGreaterThanOrEqual(30);
    expect(r.out[0]).toBe(`Start ${shifted("2025-03-05", shift)}, then ${shifted("March 12, 2025", shift)}, then ${shifted("19 March 2025", shift)}, then ${shifted("2025/03/26", shift)} and ${shifted("Mar 31 2025", shift)}.`);
    expect(shiftDate("2025-03-05", 7)).toBe("2025-03-12");
    expect(shiftDate("2025-12-30", 3)).toBe("2026-01-02");
    expect(shiftDate("March 5th, 2025", 1)).toBe("March 6th, 2025");
    expect(shiftDate("2025-02-30", 1)).toBeNull(); // not a real date
  });

  test("a four-part version number is not an IP address", () => {
    const text = "Version 1.2.3.4 shipped, see build 5.6.7.8, pin requests==2.31.0.1 or >= 3.4.5.6.";
    expect(rewriteAll([text], "1", 2, { keepValues: true }).out[0]).toBe(text);
    const r = rewriteAll([text]);
    expect(r.map.ips).toEqual({});
    expect(r.out[0]).toMatch(/^Version 1\.2\.3\.4 shipped, see build 5\.6\.7\.8, pin requests==2\.\d\d\.0\.1 or >= 3\.4\.5\.6\.$/);
  });
});

describe("what is left alone", () => {
  const text = `# Deployment Guide

Install Node and run npm test. The Dockerfile uses Python, SQL and JSON on Linux, over HTTP.
Call UserService.getUser() from src/lib/parser.test.ts and read package.json and config.yaml.
Open https://github.com/sst/tool and https://api.example.com/v1 or http://localhost/docs.
Run git commit and npm install. Meanwhile the Team shipped it. TypeScript and Markdown help.
Send mail to noreply@github.com or git@github.com:owner/repo.git. Next, make a signal for the Matrix room.
`;
  test("the keep list, hosts and ordinary words are not renamed", () => {
    const { out, map } = rewriteAll([text, text]);
    expect(out[0]).toBe(text);
    expect(Object.keys(map.words)).toEqual([]);
  });

  test("common words are not renamed even when capitalised and repeated", () => {
    const r = rewriteAll(["Use the Report tool. The Report is long. Read the Report. See the report too."]);
    expect(Object.keys(r.map.words)).toEqual([]);
  });

  test("a name must be seen --min-count times, and mid-sentence at least once", () => {
    const once = "We met Delgado at the office.";
    expect(Object.keys(rewriteAll([once]).map.words)).toEqual([]);
    expect(Object.keys(rewriteAll([once], "1", 1).map.words)).toEqual(["delgado"]);
    const onlyAtSentenceStart = "Zebulon came. Zebulon left. Zebulon slept.";
    expect(Object.keys(rewriteAll([onlyAtSentenceStart]).map.words)).toEqual([]);
  });

  test("a name is renamed inside identifiers, part by part, in every case", () => {
    const r = rewriteAll(["Ask Acme about it. We met Acme and Acme again. AcmeClient wraps ACME_URL and Acmes."]);
    const z = r.map.words.acme;
    const cap = z[0].toUpperCase() + z.slice(1);
    expect(r.out[0]).toBe(`Ask ${cap} about it. We met ${cap} and ${cap} again. ${cap}Client wraps ${z.toUpperCase()}_URL and Acmes.`);
  });

  test("a person name in a slug is still renamed, because it is on the name lists", () => {
    const r = rewriteAll(["We met Priya Sharma. Ask Priya Sharma. See [[priya-sharma]]."]);
    expect(Object.keys(r.map.words).sort()).toEqual(["priya", "sharma"]);
    expect(r.out[0]).toContain(`[[${r.map.words.priya}-${r.map.words.sharma}]]`);
  });

  test("a word that also appears in lowercase is a common word", () => {
    const r = rewriteAll(["The Harvest is near. We like the Harvest. A good harvest helps."]);
    expect(Object.keys(r.map.words)).toEqual([]);
  });

  test("words that are also properties of every object are not mistaken for renamed words", () => {
    const code = "class Client {\n  constructor(private url: string) {}\n  toString() { return this.valueOf(); }\n}\n";
    const r = rewriteAll([code, code]);
    expect(r.out[0]).toBe(code);
    // ...and a saved map that lists no such word keeps them too
    const again = new Rewriter("1", { ...r.map });
    again.collect(code);
    again.finish();
    expect(again.rewrite(code)).toBe(code);
  });

  test("an ordinary word in a hostname is renamed in the hostname only, not in prose", () => {
    const text = "The garden service at garden.acme.io stores the release history.\nWater the garden in the evening.\n";
    const { out, map } = rewriteAll([text]);
    expect(out[0]).not.toContain("garden.acme.io");
    expect(out[0]).toContain("The garden service at ");
    expect(out[0]).toContain("Water the garden in the evening.");
    expect(map.hostWords.garden).toBeDefined();
    expect(map.words.garden).toBeUndefined();
  });

  test("a name seen in prose and in a hostname gets the same replacement in both", () => {
    const text = "We moved Orion to new disks. Ask about Orion before noon.\nIt answers at orion.example.net today.\n";
    const { out, map } = rewriteAll([text]);
    const r = map.words.orion;
    expect(r).toBeDefined();
    expect(out[0]).toContain(`${r[0].toUpperCase()}${r.slice(1)} to new disks`);
    expect(out[0]).toContain(`${r}.example.net`);
    expect(map.hostWords.orion).toBeUndefined();
  });

  test("hosts under a well-known domain are kept; hosts under a user-content domain lose the name", () => {
    const r = rewriteAll(["See https://learn.microsoft.com/x and https://tara.github.io/site and https://unknown-corp.example.org."]);
    expect(r.out[0]).toContain("https://learn.microsoft.com/x");
    expect(r.out[0]).toContain(".github.io/site");
    expect(r.out[0]).not.toContain("tara.github.io");
    expect(r.out[0]).toContain("https://unknown-corp.example.org");
  });
});

/** The numbers of a text, as written. */
const numbersIn = (text: string): string[] => text.match(/\d[\d,]*(?:\.\d+)*/g) ?? [];

describe("numbers", () => {
  const text = "The queue held 18 jobs, then 21, 24 and 19. Retention is 30 days, 1,081 requests came in; 85% hit, up from 62%. Took 512ms and 4,096 bytes for 12345 rows. A score of 0.65 beat 0.85.";

  test("a number keeps its order, its number of digits, its commas, its decimals and its unit", () => {
    const { out, map } = rewriteAll([text]);
    const before = numbersIn(text).filter((n) => n !== "512" && n !== "4,096");
    const after = numbersIn(out[0]).filter((n) => n !== "512" && n !== "4,096");
    expect(after).not.toEqual(before);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].length).toBe(before[i].length);
      for (let j = 0; j < before.length; j++) {
        const [a, b, x, y] = [before[i], before[j], after[i], after[j]].map((n) => Number(n.replace(/,/g, "")));
        if (a.toString().length === b.toString().length) expect(Math.sign(x - y)).toBe(Math.sign(a - b));
      }
    }
    expect(out[0]).toMatch(/ (\d{2}) days, \d,\d{3} requests came in; \d{2}% hit, up from \d{2}%\. Took 512ms and 4,096 bytes for \d{5} rows\. A score of 0\.\d{2} beat 0\.\d{2}\.$/);
    expect(map.numbers["1081"]).toMatch(/^\d{4}$/);
    expect(map.numbers["1081"]).not.toBe("1081");
  });

  test("the numbers of one run differ, keep their order and stay in their range, whatever they are", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const values = [...new Set(Array.from({ length: 40 }, (_, i) => 10 + ((i * 7919 + seed * 104729) % 90)))].sort((a, b) => a - b);
      const fixed = new Set(values.filter((_, i) => i % 9 === 4));
      const out = spread(values, fixed, 10, 99, (v) => 0.65 + ((v * seed) % 7) / 10);
      expect(new Set(out).size).toBe(values.length);
      expect([...out].sort((a, b) => a - b)).toEqual(out);
      expect(Math.min(...out)).toBeGreaterThanOrEqual(10);
      expect(Math.max(...out)).toBeLessThanOrEqual(99);
      values.forEach((v, i) => fixed.has(v) && expect(out[i]).toBe(v));
    }
    // a percentage stays a percentage
    const { out } = rewriteAll([Array.from({ length: 30 }, (_, i) => `${11 + i * 3}%`).join(" ")]);
    for (const n of numbersIn(out[0])) expect(Number(n)).toBeLessThanOrEqual(99);
    // and most numbers change
    const many = Array.from({ length: 30 }, (_, i) => String(100 + i * 31));
    const changed = numbersIn(rewriteAll([many.join(" ")]).out[0]).filter((n, i) => n !== many[i]);
    expect(changed.length).toBeGreaterThan(20);
  });

  test("single digits, years, step, section and list numbers, ranges, times and codes with a meaning stay", () => {
    const kept = `Step 12 and Phase 3.1, see §4.2 and #123. 2026 and 1999. Wait 10-20 minutes at 10:30. HTTP 404 and 503, exit code 137, 100% of 1024 and 0.05. 7 retries, 0.9 and v2.
1. first
12. second
## 3.9 Resolved
3.1 Fixed stage
`;
    const { out, map } = rewriteAll([`${kept}\nIt took 33 days.`]);
    expect(out[0]).toBe(`${kept}\nIt took ${map.numbers["33"]} days.`);
    expect(Object.keys(map.numbers)).toEqual(["33"]); // the only number that may change
    expect(map.numbers["33"]).not.toBe("33");
  });

  test("a number at the start of a wrapped line is a number, and a list number is not", () => {
    const wrapped = "when the queue depth reaches\n87. It returns 429.\n\n1. first step\n2. second step\n12. a long list continues here\n";
    const { out } = rewriteAll([wrapped, "87 jobs"]);
    expect(out[0]).not.toContain("\n87. It");
    expect(out[0]).toContain("12. a long list");
    expect(out[0]).toContain("429");
    expect(numbersIn(out[1])[0]).toBe(numbersIn(out[0])[0]);
  });

  test("the same number is the same in every text, and the same seed gives the same numbers", () => {
    const a = rewriteAll(["We saw 87 errors in 4,500 requests.", "Another 87 errors. Then 4500 more."], "3");
    expect(numbersIn(a.out[0])[0]).toBe(numbersIn(a.out[1])[0]);
    expect(numbersIn(a.out[0])[1].replace(",", "")).toBe(numbersIn(a.out[1])[1]);
    const b = rewriteAll(["We saw 87 errors in 4,500 requests.", "Another 87 errors. Then 4500 more."], "3");
    expect(b.out).toEqual(a.out);
    expect(rewriteAll(["We saw 87 errors in 4,500 requests."], "4").out).not.toEqual([a.out[0]]);
  });

  test("--keep-values keeps numbers and versions, and the rest is still rewritten", () => {
    const note = "Acme ran 87 jobs on 0.9.15 at 2025-03-05. Ask Acme about Acme. docker v1.17.3 uses port 8443.";
    const { out, map } = rewriteAll([note], "1", 2, { keepValues: true });
    expect(out[0]).toContain("ran 87 jobs on 0.9.15 at ");
    expect(out[0]).toContain(" v1.17.3 uses port ");
    expect(out[0]).not.toContain("Acme");
    expect(out[0]).not.toContain("2025-03-05");
    expect(out[0]).not.toContain("docker");
    expect(map.numbers).toEqual({});
  });

  test("a port and a bare number are one number: port 8080 and 8080 get the same replacement", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const text = "The service listens on port 8080. Open 8080 in the browser, or localhost:8080, or http://example.org:8080/x. Then 8080 again.";
      const { out, map } = rewriteAll([text], String(seed));
      const found = out[0].match(/\b\d{4}\b/g) as string[];
      expect(found).toHaveLength(5);
      expect(new Set(found).size).toBe(1);
      expect(found[0]).not.toBe("8080");
      expect(map.ports["8080"]).toBe(found[0]);
      expect(map.numbers["8080"]).toBe(found[0]); // one table: a bare 8080 in a label gets it too
    }
  });

  test("a port stays in the range of ports, keeps its digits, keeps its order, and no two ports become one", () => {
    const ports = [1030, 1100, 2999, 3000, 3001, 4000, 5000, 5173, 7777, 8000, 8080, 8081, 8443, 9000, 9999, 10001, 20000, 30000, 31337, 40000, 50000, 60000, 65000, 65535];
    for (let seed = 1; seed <= 40; seed++) {
      const text = ports.map((n) => `Listening on port ${n}.`).join("\n");
      const { map } = rewriteAll([text], String(seed));
      const images = ports.map((n) => Number(map.ports[String(n)] ?? n));
      expect(new Set(images).size).toBe(ports.length);
      ports.forEach((n, i) => {
        expect(String(images[i]).length).toBe(String(n).length);
        expect(images[i]).toBeGreaterThanOrEqual(1024);
        expect(images[i]).toBeLessThanOrEqual(65535);
      });
      expect([...images].sort((a, b) => a - b)).toEqual(images);
    }
  });

  test("a port that is kept as a port is kept as a number, and so are years and sizes that look like ports", () => {
    const text = "The database listens on port 5432, and 5432 rows loaded. The cache on localhost:6379 held 6379 keys. Port 8192 and 8192 bytes. Port 2000 in 2000.";
    const { out, map } = rewriteAll([text, "port 8443 and 8443 requests"]);
    expect(out[0]).toBe(text);
    expect(map.numbers["5432"]).toBeUndefined();
    expect(map.numbers["8192"]).toBeUndefined();
    expect(map.ports["8192"]).toBe("8192"); // written, so a later run does not choose another
    expect(out[1]).not.toContain("8443");
  });

  test("a later run gives a port the image of the same number, and a port of its own otherwise", () => {
    const first = new Rewriter("7");
    first.collect("It served 8081 requests, then 4242.");
    first.finish();
    const map = JSON.parse(JSON.stringify(first.map)) as RewriteMap;
    const second = new Rewriter("7", map);
    second.collect("Listening on port 8081 and on port 9191.");
    second.finish();
    expect(second.map.ports["8081"]).toBe(map.numbers["8081"]);
    const out = second.rewrite("Listening on port 8081 and on port 9191.");
    expect(out).toBe(`Listening on port ${map.numbers["8081"]} and on port ${map.ports["9191"]}.`);
    expect(Number(map.ports["9191"])).toBeGreaterThanOrEqual(1024);
    expect(map.ports["9191"]).not.toBe("9191");
    expect(map.numbers["9191"]).toBeUndefined(); // a number the map did not have is left alone
  });

  test("amounts and codes that mean something stay: 7 days, 12 months, 24 hours, 60 minutes, 365 days, exit codes 64 to 78", () => {
    const kept = "Rotate every 7 days, over 12 months, 24 hours a day, 60 minutes an hour, 365 days a year. Exit code 64 is usage, 75 is temp failure, 78 is config, 69 is unavailable.";
    const { out, map } = rewriteAll([`${kept} Then 44 and 52 and 83 and 91 retries.`]);
    expect(out[0].startsWith(kept)).toBe(true);
    expect(Object.keys(map.numbers).sort()).toEqual(["44", "52", "83", "91"]);
    for (const n of [7, 12, 24, 60, 365, ...Array.from({ length: 15 }, (_, i) => 64 + i)]) expect(KEEP_NUMBERS.has(n)).toBe(true);
  });

  test("decimals of different lengths keep their order, whatever the number of places", () => {
    const sizes = ["8.125", "8.25", "8.375", "8.5", "8.75", "8.8125"];
    const small = ["0.25", "0.3", "0.35", "0.5", "0.65", "0.8", "0.875", "0.9"];
    for (let seed = 1; seed <= 60; seed++) {
      const text = `Trim sizes ${sizes.join(", ")}. Thresholds ${small.join(", ")}.`;
      const found = rewriteAll([text], String(seed)).out[0].match(/\d+\.\d+/g) as string[];
      expect(found).toHaveLength(sizes.length + small.length);
      const after = [found.slice(0, sizes.length), found.slice(sizes.length)];
      [sizes, small].forEach((before, g) => {
        before.forEach((b, i) => {
          expect(after[g][i].length).toBe(b.length); // the same number of places
          expect(after[g][i].split(".")[0]).toBe(b.split(".")[0]);
          if (i > 0) expect(Number(after[g][i])).toBeGreaterThan(Number(after[g][i - 1]));
        });
      });
    }
  });

  test("a trim size stays smaller than trim plus bleed when they have a different number of places", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { out } = rewriteAll(["Trim 8.25 in, bleed 0.125 in, trim plus bleed 8.375 in."], String(seed));
      const [trim, , total] = (out[0].match(/\d+\.\d+/g) as string[]).map(Number);
      expect(total).toBeGreaterThan(trim);
    }
  });

  test("a version keeps its integer order next to a decimal order, and no two become one", () => {
    const versions = ["3.9.1", "3.10.2", "3.11.0", "3.125.7", "3.4.0", "3.25.1"];
    const order = (x: number[], y: number[]): number => Math.sign(x[1] - y[1] || x[2] - y[2]);
    for (let seed = 1; seed <= 30; seed++) {
      const { out, map } = rewriteAll([versions.join(" ")], String(seed));
      const after = out[0].split(" ").map((v) => v.split(".").map(Number));
      const before = versions.map((v) => v.split(".").map(Number));
      for (let i = 0; i < versions.length; i++) for (let j = 0; j < versions.length; j++) expect(order(after[i], after[j])).toBe(order(before[i], before[j]));
      expect(new Set(after.map((v) => v.join("."))).size).toBe(versions.length);
      expect(Object.keys(map.numbers).every((k) => versions.includes(k))).toBe(true);
    }
  });

  test("in a dense group there is little room: most values move by little, and the order, the range and the difference hold", () => {
    const dense = Array.from({ length: 35 }, (_, i) => 25 + i);
    const sparse = Array.from({ length: 30 }, (_, i) => 100 + i * 31);
    const near = (values: number[]): number => {
      let count = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const after = numbersIn(rewriteAll([values.join(" ")], String(seed)).out[0]).map(Number);
        expect(new Set(after).size).toBe(values.length);
        expect([...after].sort((a, b) => a - b)).toEqual(after);
        expect(Math.min(...after)).toBeGreaterThanOrEqual(10 ** (String(values[0]).length - 1));
        expect(Math.max(...after)).toBeLessThanOrEqual(10 ** String(values[0]).length - 1);
        count += values.filter((v, i) => Math.abs(after[i] - v) <= 2).length;
      }
      return count / (20 * values.length);
    };
    expect(near(dense)).toBeGreaterThan(near(sparse)); // the README says so: a dense group cannot move far
    // all the 2-digit values between two numbers that stay: nothing can move at all
    const packed = Array.from({ length: 37 }, (_, i) => 24 + i); // 24 and 60 stay, and so do the 35 between
    expect(rewriteAll([packed.join(" ")], "5").out[0]).toBe(packed.join(" "));
  });

  test("a labels-only run leaves a number the corpus did not have, even when the corpus had no number to change", () => {
    const first = new Rewriter("9");
    first.collect("Step 3 ran 7 retries on 24 hours of data, exit code 75.");
    first.finish();
    expect(first.map.numbers).toEqual({});
    expect(first.map.numbersAssigned).toBe(true);
    const labels = new Rewriter("9", JSON.parse(JSON.stringify(first.map)) as RewriteMap);
    labels.collect("87 minutes, not 53 minutes");
    labels.finish();
    expect(labels.rewrite("87 minutes, not 53 minutes")).toBe("87 minutes, not 53 minutes");
    expect(labels.map.numbers).toEqual({});
  });

  test("a map started from an empty file has decided nothing: the first run that reads a number decides them", () => {
    const start = new Rewriter("9");
    start.collect("\n");
    start.finish();
    expect(start.map.numbersAssigned).toBe(false);
    const corpus = new Rewriter("9", JSON.parse(JSON.stringify(start.map)) as RewriteMap);
    corpus.collect("It took 87 minutes.");
    corpus.finish();
    expect(corpus.map.numbersAssigned).toBe(true);
    expect(corpus.map.numbers["87"]).toBeString();
  });

  test("a corpus read with --keep-values has decided its numbers: labels read without the flag keep theirs", () => {
    const first = new Rewriter("9", undefined, { keepValues: true });
    first.collect("The run took 87 minutes.");
    first.finish();
    expect(first.map.numbersAssigned).toBe(true);
    const labels = new Rewriter("9", JSON.parse(JSON.stringify(first.map)) as RewriteMap);
    labels.collect("87 minutes");
    labels.finish();
    expect(labels.rewrite("87 minutes")).toBe("87 minutes");
  });

  test("a map from before the flag has decided its numbers when it has any, and not when it has none", () => {
    const legacy = (numbers: Record<string, string>): RewriteMap => ({ version: 1, seed: "9", dateShiftDays: 40, words: {}, hostWords: {}, hosts: {}, ips: {}, ports: {}, uuids: {}, hex: {}, numbers });
    const withNumbers = new Rewriter("9", legacy({ "87": "91" }));
    expect(withNumbers.map.numbersAssigned).toBe(true);
    withNumbers.collect("87 and 53");
    withNumbers.finish();
    expect(withNumbers.rewrite("87 and 53")).toBe("91 and 53");
    const empty = new Rewriter("9", legacy({}));
    expect(empty.map.numbersAssigned).toBe(false);
    empty.collect("It took 87 minutes.");
    empty.finish();
    expect(empty.map.numbers["87"]).toBeString();
    expect(empty.map.numbersAssigned).toBe(true);
  });

  test("place keeps multiples of a step and the range of a slot, and leaves a stretch as it is when it cannot be placed", () => {
    // 0.25 and 0.375 as fractions at three places (250 in steps of 10, and 375), then 0.5, which stays
    const slots = [{ value: 250, step: 10 }, { value: 375 }, { value: 500, fixed: true }];
    for (let t = 0; t < 50; t++) {
      const out = place(slots, 100, 999, (s) => 0.65 + ((s.value * (t + 1)) % 7) / 10);
      expect(out[0] % 10).toBe(0);
      expect(out[0]).toBeLessThan(out[1]);
      expect(out[1]).toBeLessThan(500);
      expect(out[2]).toBe(500);
    }
    // a slot that may only be in [1024, 65535]
    const ports = place([{ value: 1030, min: 1024, max: 65535 }, { value: 1500 }], 1000, 9999, () => 0.65);
    expect(ports[0]).toBeGreaterThanOrEqual(1024);
    expect(ports[0]).toBeLessThan(ports[1]);
    // no room: three values in a space for two stay as they are
    expect(place([{ value: 10 }, { value: 11 }, { value: 12, max: 11 }], 10, 99, () => 1.3)).toEqual([10, 11, 12]);
  });
});

describe("versions", () => {
  const compare = (a: string, b: string): number => {
    const parse = (v: string) => v.replace(/^v/, "").split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
    const [x, y] = [parse(a), parse(b)];
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      if (x[i] === y[i]) continue;
      if (x[i] === undefined) return 1; // 0.9.0 comes after 0.9.0-rc.13
      if (y[i] === undefined) return -1;
      return x[i] < y[i] ? -1 : 1;
    }
    return 0;
  };
  const versions = ["1.4.2", "1.17.3", "1.17.9", "1.18.0", "1.18.12", "1.25.1", "2.0.0", "2.13.4", "0.9.15", "0.9.26", "0.9.31", "0.9.0-rc.13", "0.9.0-rc.15", "0.9.0-rc.21", "0.9.0", "0.12.40", "0.12.7"];

  test("an upgrade stays an upgrade", () => {
    const { out, map } = rewriteAll([versions.map((v) => (v.startsWith("0") ? `v${v}` : v)).join(" and ")]);
    const after = out[0].split(" and ").map((v) => v.replace(/^v/, ""));
    expect(after).not.toEqual(versions);
    versions.forEach((a, i) => {
      expect(after[i].replace(/\d/g, "9").replace(/-.*/, "").length).toBe(a.replace(/\d/g, "9").replace(/-.*/, "").length);
      versions.forEach((b, j) => expect(Math.sign(compare(after[i], after[j]))).toBe(Math.sign(compare(a, b))));
    });
    expect(Object.keys(map.numbers).every((k) => versions.includes(k))).toBe(true);
  });

  test("a version series is renamed the same way in 1.17.3, 1.17.x and 1.17", () => {
    const { out } = rewriteAll(["Bun 1.17.3 and 1.17.x and 1.17 and 1.17.9."]);
    const [a, b, c, d] = out[0].match(/\d+\.\d+(?:\.[\dx]+)?/g) as string[];
    expect(a.split(".").slice(0, 2)).toEqual(b.split(".").slice(0, 2));
    expect(a.split(".").slice(0, 2)).toEqual(c.split(".").slice(0, 2));
    expect(a.split(".").slice(0, 2)).toEqual(d.split(".").slice(0, 2));
    expect(a).not.toBe("1.17.3");
  });
});

describe("tool names", () => {
  test("a tool or a product is renamed in every form", () => {
    const text = "Use Docker and docker today. DOCKER_HOST is set; docker-compose and DockerClient run. GitHub and GitHubActions, github, qwen and Qwen3 too. akm_search and AkmIndex.";
    const { out, map } = rewriteAll([text, "docker again, with GitHub Actions."]);
    for (const name of ["docker", "github", "qwen", "akm"]) {
      expect(map.words[name]).toBeString();
      expect(map.words[name]).toHaveLength(name.length);
      expect(out.join(" ").toLowerCase()).not.toContain(name);
    }
    const r = map.words;
    const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
    expect(out[0]).toBe(`Use ${cap(r.docker)} and ${r.docker} today. ${r.docker.toUpperCase()}_HOST is set; ${r.docker}-compose and ${cap(r.docker)}Client run. ${cap(r.github)} and ${cap(r.github)}Actions, ${r.github}, ${r.qwen} and ${cap(r.qwen)}3 too. ${r.akm}_search and ${cap(r.akm)}Index.`);
    expect(out[1]).toBe(`${r.docker} again, with ${cap(r.github)} Actions.`);
  });

  test("an identifier written in lowercase follows the identifier", () => {
    const { out, map } = rewriteAll(["Call assertAkmAssetWrite first.", "The term is assertakmassetwrite."]);
    expect(out[0]).toBe(`Call assert${map.words.akm[0].toUpperCase()}${map.words.akm.slice(1)}AssetWrite first.`);
    expect(out[1]).toBe(`The term is assert${map.words.akm}assetwrite.`);
  });

  test("languages, formats, protocols, operating systems, core commands and ordinary words are kept", () => {
    const kept = "Python TypeScript Rust Go bash SQL YAML JSON Markdown PDF HTTP TLS SSH MCP Linux macOS Windows Ubuntu git grep npm curl jq cron make node Next Signal Apple Notion Zoom promise string Dockerfile";
    const { out, map } = rewriteAll([kept, kept]);
    expect(out[0]).toBe(kept);
    expect(map.words).toEqual({});
  });

  test("the lists do not overlap", () => {
    expect([...TOOLS].filter((w) => TECH.has(w) || COMMON.has(w))).toEqual([]);
    expect([...PLAIN].filter((w) => TOOLS.has(w) || GENERIC_LABELS.has(w))).toEqual([]);
    expect([...INVENTED_TOOLS].filter((w) => !TOOLS.has(w))).toEqual([]);
  });

  test("a tool that is also a given name gets a pseudo-word, not a person (gemma)", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { map } = rewriteAll(["Run Gemma locally. We tried Gemma and gemma again."], String(seed));
      expect(map.words.gemma).toHaveLength(5);
      expect(FIRST).not.toContain(map.words.gemma);
      expect(SURNAMES).not.toContain(map.words.gemma);
    }
    // a person still gets a person
    const { map } = rewriteAll(["We met Priya Sharma. Ask Priya Sharma."]);
    expect(FIRST).toContain(map.words.priya);
    expect(SURNAMES).toContain(map.words.sharma);
  });

  test("the keys of the PDF standards and headings that look like names are not renamed (Trapped, Takeaways)", () => {
    const text = "### Trapped White Space\n\nThe pdfmark sets /Trapped /False, and /OutputIntent and /GTS_PDFXVersion in /DOCINFO.\n\n## Key Takeaways\n\n- The Executive Takeaways come first. Read the Takeaways. The Takeaway is short.\n- The East and West regions. Archive the Areas. Press Play to continue.\n";
    const { out, map } = rewriteAll([text, text]);
    expect(out[0]).toBe(text);
    expect(map.words).toEqual({});
  });

  test("a capitalised word of three letters is not a name unless it is on the name lists", () => {
    const text = "We met Zeb at the desk. Ask Zeb about it. Zeb agreed, and Eli too. Ask Eli. We saw Eli again.";
    expect(Object.keys(rewriteAll([text]).map.words)).toEqual(["eli"]);
  });
});

describe("replacement words", () => {
  const everyTool = [...TOOLS].filter((t) => /^[a-z]+\d*$/.test(t)).join(" ");

  test("a made-up word is never an ordinary word, a name on the lists, a tool or a generic label", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { map } = rewriteAll([everyTool], String(seed));
      for (const [original, replacement] of Object.entries(map.words)) {
        const base = replacement.replace(/\d+$/, "");
        expect(replacement.length).toBe(original.length);
        expect(replacement).not.toBe(original);
        for (const list of [PLAIN, COMMON, TECH, TOOLS, GENERIC_LABELS]) expect(list.has(base)).toBe(false);
        if (!FIRST.includes(base)) expect(SURNAMES).not.toContain(base);
        expect(FIRST).not.toContain(base);
      }
    }
  });

  test("a replacement is not a word the text already has", () => {
    const first = rewriteAll(["Jira and jira again."], "11").map.words.jira;
    expect(first).toHaveLength(4);
    const again = rewriteAll([`Jira and jira again. The ${first} was ready.`], "11").map.words.jira;
    expect(again).not.toBe(first);
    expect(again).toHaveLength(4);
  });

  test("a word of one letter, which has few candidates, still gets a replacement when the text uses them all", () => {
    const letters = "bdfgklmnprstvz".split("").filter((l) => l !== "s");
    const { map } = rewriteAll([`S3 is a service. ${letters.join(" ")} a e i o u`]);
    expect(map.words.s3).toMatch(/^[a-z]3$/);
    expect(map.words.s3).not.toBe("s3");
  });
});

describe("--tools keep", () => {
  const text = "Run Docker and docker-compose with uv run, or open vim. Ask Docker about uv. GitHub Actions call DockerClient on jenkins.acme.dev. Ledgerline and Drillbit are internal. Ask Priya Sharma, or Priya Sharma.";

  test("the real tools stay in every form, and the made-up tools and the names are still renamed", () => {
    const { out, map } = rewriteAll([text, text], "1", 2, { tools: "keep" });
    expect(map.tools).toBe("keep");
    expect(Object.keys(map.words).sort()).toEqual(["drillbit", "ledgerline", "priya", "sharma"]);
    for (const kept of ["Run Docker and docker-compose with uv run, or open vim.", "Ask Docker about uv.", "GitHub Actions call DockerClient on jenkins."]) expect(out[0]).toContain(kept);
    expect(out[0]).not.toMatch(/Ledgerline|Drillbit|Priya|Sharma|acme/i);
    // the default renames them all
    const renamed = rewriteAll([text, text], "1", 2);
    expect(renamed.map.tools).toBe("rename");
    for (const tool of ["docker", "uv", "vim", "github", "jenkins"]) expect(renamed.map.words[tool] ?? renamed.map.hostWords[tool]).toBeString();
  });

  test("a real tool that the text writes like a name is kept too", () => {
    const { out, map } = rewriteAll(["Ask Kubernetes about it. We met Kubernetes and Terraform. Kubernetes again, Terraform again."], "1", 2, { tools: "keep" });
    expect(map.words).toEqual({});
    expect(out[0]).toContain("Ask Kubernetes about it.");
  });

  test("a saved map keeps its mode: a later run inherits it, and another mode is refused", () => {
    const first = rewriteAll([text], "1", 2, { tools: "keep" });
    const saved = () => JSON.parse(JSON.stringify(first.map)) as RewriteMap;
    const labels = new Rewriter("1", saved());
    labels.collect("Docker and Priya");
    labels.finish();
    expect(labels.rewrite("Docker uses vim")).toBe("Docker uses vim");
    expect(() => new Rewriter("1", saved(), { tools: "rename" })).toThrow("--tools keep");
    expect(new Rewriter("1", saved(), { tools: "keep" }).map.tools).toBe("keep");
    const old = saved();
    delete old.tools;
    expect(() => new Rewriter("1", old, { tools: "keep" })).toThrow("--tools rename");
    expect(new Rewriter("1", old).map.tools).toBe("rename");
  });

  test("only keep and rename are modes", () => {
    expect(() => new Rewriter("1", undefined, { tools: "some" as never })).toThrow("--tools");
  });
});

describe("files", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rewrite-test-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const write = (rel: string, content: string | Buffer) => {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
    return full;
  };

  test("file names are rewritten with the same map, so links between files still resolve", () => {
    write("in/people/priya-sharma.md", NOTE_A);
    write("in/notes/2025-03-12-standup.md", `${NOTE_B}\nSee [Priya](../people/priya-sharma.md).\n`);
    run({ seed: "5", mapPath: join(dir, "map.json"), input: join(dir, "in"), output: join(dir, "out") });
    const map = JSON.parse(readFileSync(join(dir, "map.json"), "utf8"));
    const person = `${map.words.priya}-${map.words.sharma}`;
    expect(existsSync(join(dir, "out/people", `${person}.md`))).toBe(true);
    const shifted = shiftDate("2025-03-12", map.dateShiftDays) as string;
    const note = join(dir, "out/notes", `${shifted}-standup.md`);
    expect(existsSync(note)).toBe(true);
    expect(readFileSync(note, "utf8")).toContain(`(../people/${person}.md)`);
    expect(existsSync(join(dir, "out/people/priya-sharma.md"))).toBe(false);
  });

  test("binary files and permissions are copied unchanged", () => {
    const bin = Buffer.from([0, 1, 2, 255, 254, 0x41, 0x63, 0x6d, 0x65]);
    write("in/data.bin", bin);
    const script = write("in/run.sh", "#!/bin/sh\necho Acme\n");
    chmodSync(script, 0o755);
    const result = run({ seed: "5", mapPath: join(dir, "map.json"), input: join(dir, "in"), output: join(dir, "out") });
    expect(result.copied).toBe(1);
    expect(readFileSync(join(dir, "out/data.bin")).equals(bin)).toBe(true);
    expect(statSync(join(dir, "out/run.sh")).mode & 0o111).not.toBe(0);
  });

  test("a saved map rewrites other files to match, without a seed", () => {
    write("in/corpus/notes.md", NOTE_A + NOTE_B);
    write("in/labels/q.jsonl", '{"q": "Who leads Acme Corp?", "a": "Priya Sharma", "host": "orion.lab.acme.dev"}\n');
    const mapPath = join(dir, "map.json");
    run({ seed: "5", mapPath, input: join(dir, "in/corpus"), output: join(dir, "out/corpus") });
    run({ mapPath, input: join(dir, "in/labels"), output: join(dir, "out/labels") });
    const map = JSON.parse(readFileSync(mapPath, "utf8"));
    const w = map.words;
    const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
    const label = readFileSync(join(dir, "out/labels/q.jsonl"), "utf8");
    expect(label).toBe(`{"q": "Who leads ${cap(w.acme)} Corp?", "a": "${cap(w.priya)} ${cap(w.sharma)}", "host": "${map.hostWords.orion}.lab.${w.acme}.dev"}\n`);
    expect(JSON.parse(label).host).toBe(map.hosts["orion.lab.acme.dev"]);
  });

  test("a single file can be rewritten", () => {
    const file = write("note.md", NOTE_A);
    run({ seed: "5", mapPath: join(dir, "map.json"), input: file, output: join(dir, "out.md") });
    expect(readFileSync(join(dir, "out.md"), "utf8")).not.toContain("Acme");
  });

  test("the map file inside the input is not rewritten, and the output must be outside the input", () => {
    write("in/note.md", NOTE_A);
    const mapPath = join(dir, "in/map.json");
    run({ seed: "5", mapPath, input: join(dir, "in"), output: join(dir, "out") });
    expect(existsSync(join(dir, "out/map.json"))).toBe(false);
    expect(() => run({ seed: "5", mapPath, input: join(dir, "in"), output: join(dir, "in/out") })).toThrow("outside");
  });

  test("a map made with another seed is refused", () => {
    write("in/note.md", NOTE_A);
    const mapPath = join(dir, "map.json");
    run({ seed: "5", mapPath, input: join(dir, "in"), output: join(dir, "out") });
    expect(() => run({ seed: "6", mapPath, input: join(dir, "in"), output: join(dir, "out2") })).toThrow("seed");
    expect(() => run({ mapPath: join(dir, "none.json"), input: join(dir, "in"), output: join(dir, "out3") })).toThrow("--seed");
  });

  test("a .json file is rewritten string by string: its keys and its numbers stay", () => {
    write("in/notes.md", "Docker ran 87 jobs in 41 hours. Docker again.\n");
    write("in/cases.json", '{"docker_ratio": 0.78, "limit": 87, "terms": ["Docker", "87 jobs", "41 hours"], "n": 2}\n');
    const mapPath = join(dir, "map.json");
    run({ seed: "5", mapPath, input: join(dir, "in"), output: join(dir, "out") });
    const map = JSON.parse(readFileSync(mapPath, "utf8"));
    const cases = JSON.parse(readFileSync(join(dir, "out/cases.json"), "utf8"));
    expect(Object.keys(cases)).toEqual(["docker_ratio", "limit", "terms", "n"]);
    expect([cases.docker_ratio, cases.limit, cases.n]).toEqual([0.78, 87, 2]);
    const docker = map.words.docker[0].toUpperCase() + map.words.docker.slice(1);
    expect(cases.terms).toEqual([docker, `${map.numbers["87"]} jobs`, `${map.numbers["41"]} hours`]);
    expect(readFileSync(join(dir, "out/notes.md"), "utf8")).toBe(`${docker} ran ${map.numbers["87"]} jobs in ${map.numbers["41"]} hours. ${docker} again.\n`);
  });

  test("a saved map rewrites the numbers it has and leaves the others as they are", () => {
    write("in/corpus/a.md", "It took 87 minutes.\n");
    write("in/labels/q.txt", "87 minutes, not 53 minutes.\n");
    const mapPath = join(dir, "map.json");
    run({ seed: "5", mapPath, input: join(dir, "in/corpus"), output: join(dir, "out/corpus") });
    run({ mapPath, input: join(dir, "in/labels"), output: join(dir, "out/labels") });
    const map = JSON.parse(readFileSync(mapPath, "utf8"));
    expect(readFileSync(join(dir, "out/labels/q.txt"), "utf8")).toBe(`${map.numbers["87"]} minutes, not 53 minutes.\n`);
    expect(map.numbers["87"]).not.toBe("87");
  });

  test("the map file lists its hostname words in order, however many runs made it", () => {
    write("in/corpus/a.md", "The node answers at orion.acme.dev and at zeta.acme.dev.\n");
    write("in/labels/b.md", "See atlas.acme.dev and borealis.acme.dev.\n");
    const mapPath = join(dir, "map.json");
    run({ seed: "5", mapPath, input: join(dir, "in/corpus"), output: join(dir, "out/corpus") });
    run({ mapPath, input: join(dir, "in/labels"), output: join(dir, "out/labels") });
    const keys = Object.keys(JSON.parse(readFileSync(mapPath, "utf8")).hostWords);
    expect(keys).toEqual(["acme", "atlas", "borealis", "orion", "zeta"]);
    expect(keys).toEqual([...keys].sort());
  });

  test("a map from a --tools keep run is not used by a --tools rename run", () => {
    write("in/note.md", "Run Docker and ask Priya Sharma about Priya Sharma.\n");
    const mapPath = join(dir, "map.json");
    run({ seed: "5", mapPath, input: join(dir, "in"), output: join(dir, "out"), tools: "keep" });
    expect(JSON.parse(readFileSync(mapPath, "utf8")).tools).toBe("keep");
    expect(readFileSync(join(dir, "out/note.md"), "utf8")).toStartWith("Run Docker and ask ");
    expect(() => run({ mapPath, input: join(dir, "in"), output: join(dir, "out2"), tools: "rename" })).toThrow("--tools keep");
  });

  test("64-bit seeds work", () => {
    write("in/note.md", NOTE_A);
    const mapPath = join(dir, "map.json");
    run({ seed: "18446744073709551615", mapPath, input: join(dir, "in"), output: join(dir, "out") });
    expect(JSON.parse(readFileSync(mapPath, "utf8")).seed).toBe("18446744073709551615");
  });
});

describe("command line", () => {
  test("bun lib/rewrite/rewrite.ts --seed N --map file in out", () => {
    const dir = mkdtempSync(join(tmpdir(), "rewrite-cli-"));
    try {
      writeFileSync(join(dir, "in.md"), NOTE_A);
      const proc = Bun.spawnSync([process.execPath, SCRIPT, "--seed", "7", "--map", join(dir, "map.json"), join(dir, "in.md"), join(dir, "out.md")]);
      expect(proc.exitCode).toBe(0);
      expect(proc.stdout.toString()).toContain("1 file written");
      expect(readFileSync(join(dir, "out.md"), "utf8")).not.toContain("Acme");
      expect(existsSync(join(dir, "map.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--keep-values keeps the numbers and versions", () => {
    const dir = mkdtempSync(join(tmpdir(), "rewrite-cli-"));
    try {
      writeFileSync(join(dir, "in.md"), "Docker 1.17.3 ran 87 jobs. Docker again.\n");
      const proc = Bun.spawnSync([process.execPath, SCRIPT, "--seed", "7", "--map", join(dir, "map.json"), "--keep-values", join(dir, "in.md"), join(dir, "out.md")]);
      expect(proc.exitCode).toBe(0);
      expect(proc.stdout.toString()).toContain("0 numbers");
      const out = readFileSync(join(dir, "out.md"), "utf8");
      expect(out).toMatch(/^\w+ 1\.17\.3 ran 87 jobs\. \w+ again\.\n$/);
      expect(out).not.toContain("Docker");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("--tools keep keeps the real tools, and the map says so", () => {
    const dir = mkdtempSync(join(tmpdir(), "rewrite-cli-"));
    try {
      writeFileSync(join(dir, "in.md"), "Docker and uv run on vim. Ask Priya Sharma, or Priya Sharma.\n");
      const proc = Bun.spawnSync([process.execPath, SCRIPT, "--seed", "7", "--map", join(dir, "map.json"), "--tools", "keep", join(dir, "in.md"), join(dir, "out.md")]);
      expect(proc.exitCode).toBe(0);
      const out = readFileSync(join(dir, "out.md"), "utf8");
      expect(out).toStartWith("Docker and uv run on vim. Ask ");
      expect(out).not.toContain("Priya");
      expect(JSON.parse(readFileSync(join(dir, "map.json"), "utf8")).tools).toBe("keep");
      const again = Bun.spawnSync([process.execPath, SCRIPT, "--map", join(dir, "map.json"), "--tools", "rename", join(dir, "in.md"), join(dir, "out2.md")]);
      expect(again.exitCode).toBe(2); // the map was made with --tools keep
      expect(again.stderr.toString()).toContain("--tools keep");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("two processes give the same bytes: the output and the map, from other folders and with another locale", () => {
    const dir = mkdtempSync(join(tmpdir(), "rewrite-cli-"));
    try {
      mkdirSync(join(dir, "in/people"), { recursive: true });
      writeFileSync(join(dir, "in/people/priya-sharma.md"), NOTE_A);
      writeFileSync(join(dir, "in/standup.md"), `${NOTE_B}\nTrim 8.25 in, bleed 0.125 in, plus bleed 8.375 in; port 8080 and 8080; 87 jobs in 4,500 requests, exit code 75 after 24 hours.\n`);
      writeFileSync(join(dir, "in/cases.jsonl"), '{"q": "Who leads Acme Corp?", "a": "Priya Sharma", "host": "orion.lab.acme.dev"}\n');
      const go = (name: string, cwd: string, locale: string) => {
        mkdirSync(cwd, { recursive: true });
        const proc = Bun.spawnSync([process.execPath, SCRIPT, "--seed", "42", "--map", join(dir, `${name}.json`), join(dir, "in"), join(dir, name)], { cwd, env: { ...process.env, LC_ALL: locale, LANG: locale } });
        expect(proc.exitCode).toBe(0);
        return proc;
      };
      go("one", join(dir, "cwd-one"), "C");
      go("two", join(dir, "cwd-two/deeper"), "tr_TR.UTF-8");
      expect(readFileSync(join(dir, "one.json"))).toEqual(readFileSync(join(dir, "two.json")));
      for (const file of ["people", "standup.md", "cases.jsonl"]) {
        const [a, b] = [join(dir, "one"), join(dir, "two")].map((root) => (file === "people" ? readdirSync(join(root, file)).map((f) => readFileSync(join(root, file, f))) : [readFileSync(join(root, file))]));
        expect(b).toEqual(a);
      }
      expect(readFileSync(join(dir, "one/standup.md"), "utf8")).not.toContain("8.25");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("usage errors exit with 2", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(main([])).toBe(2);
      expect(main(["--seed", "1", "--map", "m.json", "--tools", "some", "a", "b"])).toBe(2);
      expect(main(["--seed", "1", "--map", "m.json", "--tools"])).toBe(2);
      expect(main(["--seed", "x", "--map", "m.json", "a", "b"])).toBe(2);
      expect(main(["--bogus"])).toBe(2);
      expect(main(["--help"])).toBe(0);
    } finally {
      console.error = quiet;
    }
  });
});
