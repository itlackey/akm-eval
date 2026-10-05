import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Rewriter, main, run, shiftDate } from "./rewrite.ts";

const SCRIPT = join(import.meta.dir, "rewrite.ts");

/** Rewrite a set of texts as one run. */
function rewriteAll(texts: string[], seed = "1", minCount = 2): { out: string[]; map: Rewriter["map"] } {
  const r = new Rewriter(seed, undefined, { minCount });
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
    expect(Object.keys(map.words)).toEqual(expect.arrayContaining(["acme", "priya", "sharma", "marcus", "orion", "zephyr"]));
    expect(map.hosts["orion.lab.acme.dev"]).toBe(`${map.words.orion}.lab.${map.words.acme}.dev`);
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
    const r = rewriteAll(["Version 1.2.3.4 shipped, see build 5.6.7.8, pin requests==2.31.0.1 or >= 3.4.5.6."]);
    expect(r.out[0]).toBe("Version 1.2.3.4 shipped, see build 5.6.7.8, pin requests==2.31.0.1 or >= 3.4.5.6.");
  });
});

describe("what is left alone", () => {
  const text = `# Deployment Guide

Install Bun and run bun test. The Dockerfile uses Python, Docker and PostgreSQL on Linux.
Call UserService.getUser() from src/lib/parser.test.ts and read package.json and config.yaml.
Open https://github.com/sst/opencode and https://api.example.com/v1 or http://localhost/docs.
Run git commit and npm install. Meanwhile the Team shipped it. TypeScript and GitHub Actions help.
Send mail to noreply@github.com or git@github.com:owner/repo.git.
`;
  test("well-known tools, commands, file formats, hosts and ordinary words are not renamed", () => {
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

  test("hosts under a well-known domain are kept; hosts under a user-content domain lose the name", () => {
    const r = rewriteAll(["See https://learn.microsoft.com/x and https://tara.github.io/site and https://unknown-corp.example.org."]);
    expect(r.out[0]).toContain("https://learn.microsoft.com/x");
    expect(r.out[0]).toContain(".github.io/site");
    expect(r.out[0]).not.toContain("tara.github.io");
    expect(r.out[0]).toContain("https://unknown-corp.example.org");
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
    expect(label).toBe(`{"q": "Who leads ${cap(w.acme)} Corp?", "a": "${cap(w.priya)} ${cap(w.sharma)}", "host": "${w.orion}.lab.${w.acme}.dev"}\n`);
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
