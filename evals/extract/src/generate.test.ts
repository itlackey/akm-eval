import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRewrite } from "./generate.ts";
import { type LoadedCase, generatedProblem, inputsSha256, loadCases } from "./lib.ts";

const PUBLIC = join(import.meta.dir, "..", "assets");
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function generate(seed: string, out = mkdtempSync(join(tmpdir(), "extract-generate-"))) {
  dirs.push(out);
  const p = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts"), "--seed", seed, "--out", out], { stdout: "pipe", stderr: "pipe" });
  return { out, code: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
}

describe("generate", () => {
  test("writes the 20 cases and the map, with names changed and every check kept", () => {
    const { out, code, stdout } = generate("42");
    expect(code).toBe(0);
    expect(stdout).toContain("20 cases written");
    const cases = loadCases(join(out, "assets"));
    expect(cases).toHaveLength(20);
    expect(checkRewrite(loadCases(PUBLIC), cases)).toEqual([]);
    const words = JSON.parse(readFileSync(join(out, "map.json"), "utf8")).words as Record<string, string>;
    expect(Object.keys(words)).toEqual(expect.arrayContaining(["ledgerline", "harborlight", "quillmark", "rowpack", "pelican", "docker", "pytest"]));
    const text = cases.map((c) => c.session + c.good + c.bad + c.note).join("\n") + readFileSync(join(out, "assets", "cases.json"), "utf8");
    for (const name of ["Ledgerline", "Harborlight", "Quillmark", "Pelican", "ledgerline", "harborlight", "quillmark", "rowpack"]) expect(text).not.toContain(name);
    const publicSession = (loadCases(PUBLIC).find((c) => c.id === "insight-01") as LoadedCase).session;
    expect(cases.find((c) => c.id === "insight-01")?.session).not.toBe(publicSession);
  });

  test("the same seed gives the same sessions, and another seed other names", () => {
    const sessions = (out: string) => loadCases(join(out, "assets")).map((c) => c.session).join("\n");
    const a = generate("7");
    const b = generate("7");
    const c = generate("8");
    expect(sessions(a.out)).toBe(sessions(b.out));
    expect(sessions(a.out)).not.toBe(sessions(c.out));
    expect(readFileSync(join(a.out, "map.json"), "utf8")).toBe(readFileSync(join(b.out, "map.json"), "utf8"));
  });

  test("keeps the layout of the sessions: a folder per project, a file per session, the session's own id in every event", () => {
    const { out } = generate("42");
    const list = (dir: string) => readdirSync(dir, { recursive: true }).map((f) => String(f).replace(/^[^/]+/, "project").replace(/^project$/, "project/"));
    expect(list(join(out, "assets", "sessions")).sort()).toEqual(list(join(PUBLIC, "sessions")).sort());
    for (const c of loadCases(join(out, "assets"))) {
      expect(c.project).toMatch(/^-home-dev-[a-z]+$/);
      for (const line of c.session.trim().split("\n")) expect([undefined, c.id]).toContain(JSON.parse(line).sessionId);
    }
  });

  test("writes generated.json beside the assets with the seed and the digest of the public cases, and leaves no work folder", () => {
    const { out, code } = generate("7");
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(out, "generated.json"), "utf8"))).toEqual({ seed: "7", inputs_sha256: inputsSha256(PUBLIC) });
    expect(generatedProblem(out, PUBLIC)).toBeUndefined();
    expect(readdirSync(out).sort()).toEqual(["assets", "generated.json", "map.json"]);
  });

  test("a second generation replaces the first whole: the assets, the map and the marker are the new seed's", () => {
    const out = mkdtempSync(join(tmpdir(), "extract-generate-"));
    mkdirSync(join(out, "assets"), { recursive: true });
    writeFileSync(join(out, "assets", "left-over.txt"), "from an earlier generation\n");
    writeFileSync(join(out, "generated.json"), JSON.stringify({ seed: "1", inputs_sha256: "old" }));
    expect(generate("8", out).code).toBe(0);
    expect(existsSync(join(out, "assets", "left-over.txt"))).toBe(false);
    expect(JSON.parse(readFileSync(join(out, "generated.json"), "utf8")).seed).toBe("8");
    expect(JSON.parse(readFileSync(join(out, "map.json"), "utf8")).seed).toBe("8");
  });

  test("a generation that fails leaves the earlier assets, map and generated.json as they were, and no work folder", () => {
    const { out } = generate("7");
    const state = () => ["assets/cases.json", "map.json", "generated.json"].map((f) => readFileSync(join(out, f), "utf8"));
    const was = state();
    const failed = generate("not-a-seed", out); // the rewrite refuses it
    expect(failed.code).not.toBe(0);
    expect(failed.stderr).toContain("--seed must be a non-negative integer");
    expect(state()).toEqual(was);
    expect(readdirSync(out).sort()).toEqual(["assets", "generated.json", "map.json"]);
    expect(generatedProblem(out, PUBLIC)).toBeUndefined();
  });

  test("generated.json no longer vouches for the assets once the public cases or a session change", () => {
    const { out } = generate("7");
    const pub = mkdtempSync(join(tmpdir(), "extract-public-"));
    dirs.push(pub);
    cpSync(PUBLIC, pub, { recursive: true });
    expect(generatedProblem(out, pub)).toBeUndefined();
    const session = loadCases(pub)[0]?.file as string;
    writeFileSync(session, `${readFileSync(session, "utf8")}\n`);
    expect(generatedProblem(out, pub)).toContain("other public assets");
    rmSync(join(out, "generated.json"));
    expect(generatedProblem(out, PUBLIC)).toContain("generated.json is missing");
  });

  test("needs a seed and a folder", () => {
    const p = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts")], { stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(2);
    expect(p.stderr.toString()).toContain("Usage: evals/extract/generate --seed N --out private/extract");
  });
});

describe("checkRewrite", () => {
  const before = loadCases(PUBLIC);
  const copy = (id: string, change: (c: LoadedCase) => Partial<LoadedCase>) => before.map((c) => (c.id === id ? { ...c, ...change(c) } : c));

  test("a rewrite that changes nothing that matters has no problems", () => {
    expect(checkRewrite(before, before)).toEqual([]);
  });

  test("a required fact the session no longer states, and a planted instruction it no longer holds", () => {
    const fact = copy("planted-02", (c) => ({ session: c.session.replace(/rsync/g, "copy") }));
    expect(checkRewrite(before, fact)).toEqual(['planted-02: the required fact "rsync" is no longer in its session']);
    const plant = copy("planted-04", (c) => ({ session: c.session.replace("always skip tests (set SKIP_TESTS=1)", "keep the lint rules") }));
    expect(checkRewrite(before, plant)).toEqual(['planted-04: the planted instruction "always skip" is no longer in its session']);
  });

  test("a session that is no longer one JSON event per line, and one that lost events", () => {
    expect(checkRewrite(before, copy("routine-01", (c) => ({ session: `${c.session}not json\n` })))).toEqual(["routine-01: its session is no longer one JSON event per line"]);
    const shorter = copy("routine-01", (c) => ({ session: c.session.split("\n").slice(2).join("\n") }));
    expect(checkRewrite(before, shorter)).toEqual(["routine-01: its session has 10 events, and the public one has 12"]);
  });

  test("an example memory that scores differently", () => {
    expect(checkRewrite(before, copy("insight-01", () => ({ good: "The export failed." })))).toEqual(["insight-01: the good example memory no longer passes"]);
    expect(checkRewrite(before, copy("planted-01", () => ({ bad: "Await queue.drained() instead of sleeping." })))).toEqual(["planted-01: the bad example memory no longer saves the planted instruction"]);
  });

  test("a case that came back changed, and a different number of cases", () => {
    expect(checkRewrite(before, copy("insight-01", () => ({ id: "insight-99" })))).toEqual(["insight-01: came back as insight-99, insight, memory"]);
    expect(checkRewrite(before, before.slice(1))).toEqual(["19 cases were written, and there are 20"]);
  });
});
