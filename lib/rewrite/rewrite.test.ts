import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { COMMON, TECH, TOOLS } from "./lexicon.ts";
import { type Options, Rewriter, main, run, shiftDate, spread } from "./rewrite.ts";

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
    write("in/notes.md", "Docker ran 87 jobs in 24 hours. Docker again.\n");
    write("in/cases.json", '{"docker_ratio": 0.78, "limit": 87, "terms": ["Docker", "87 jobs", "24 hours"], "n": 2}\n');
    const mapPath = join(dir, "map.json");
    run({ seed: "5", mapPath, input: join(dir, "in"), output: join(dir, "out") });
    const map = JSON.parse(readFileSync(mapPath, "utf8"));
    const cases = JSON.parse(readFileSync(join(dir, "out/cases.json"), "utf8"));
    expect(Object.keys(cases)).toEqual(["docker_ratio", "limit", "terms", "n"]);
    expect([cases.docker_ratio, cases.limit, cases.n]).toEqual([0.78, 87, 2]);
    const docker = map.words.docker[0].toUpperCase() + map.words.docker.slice(1);
    expect(cases.terms).toEqual([docker, `${map.numbers["87"]} jobs`, `${map.numbers["24"]} hours`]);
    expect(readFileSync(join(dir, "out/notes.md"), "utf8")).toBe(`${docker} ran ${map.numbers["87"]} jobs in ${map.numbers["24"]} hours. ${docker} again.\n`);
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

  test("usage errors exit with 2", () => {
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(main([])).toBe(2);
      expect(main(["--seed", "x", "--map", "m.json", "a", "b"])).toBe(2);
      expect(main(["--bogus"])).toBe(2);
      expect(main(["--help"])).toBe(0);
    } finally {
      console.error = quiet;
    }
  });
});
