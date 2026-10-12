import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { engineConfig } from "../../../lib/akm/akm.ts";
import { endpointHost, sha256Files } from "../../../lib/provenance.ts";
import { assetsDigest, generateInto, privateAssetsProblem, replaceDir, runInputs } from "./inputs.ts";

const dirs: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), "consolidate-inputs-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const put = (dir: string, files: Record<string, string>) => {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
};
const read = (dir: string, path: string) => readFileSync(join(dir, path), "utf8");
const seedOf = (dir: string) => JSON.parse(read(dir, "generated.json"));

describe("assetsDigest", () => {
  test("is lib/provenance's digest of the paths relative to the folder, so another checkout of the same files gives the same one", () => {
    const [a, b] = [put(temp(), { "cases.jsonl": "one\n", "library/x.md": "two" }), put(temp(), { "cases.jsonl": "one\n", "library/x.md": "two" })];
    const files = ["cases.jsonl", "library/x.md"];
    expect(assetsDigest(a, files)).toBe(assetsDigest(b, files));
    expect(assetsDigest(a, files)).toMatch(/^[0-9a-f]{64}$/);
    const here = process.cwd();
    process.chdir(a);
    try {
      expect(assetsDigest(a, files)).toBe(sha256Files(files));
    } finally {
      process.chdir(here);
    }
    expect(process.cwd()).toBe(here);
  });

  test("changes with a file's content, a file added or dropped, and the order of the paths does not matter", () => {
    const dir = put(temp(), { "a.txt": "1", "b.txt": "2" });
    const both = assetsDigest(dir, ["a.txt", "b.txt"]);
    expect(assetsDigest(dir, ["b.txt", "a.txt"])).toBe(both);
    expect(assetsDigest(dir, ["a.txt"])).not.toBe(both);
    writeFileSync(join(dir, "b.txt"), "changed");
    expect(assetsDigest(dir, ["a.txt", "b.txt"])).not.toBe(both);
  });

  test("puts the working folder back when a file is missing", () => {
    const here = process.cwd();
    expect(() => assetsDigest(temp(), ["no-such-file.txt"])).toThrow();
    expect(process.cwd()).toBe(here);
  });
});

describe("privateAssetsProblem", () => {
  test("is null when the file the run reads is there, and says how to make the assets when it is not", () => {
    expect(privateAssetsProblem("consolidate", put(temp(), { "assets/cases.jsonl": "x\n" }), "cases.jsonl")).toBeNull();
    expect(privateAssetsProblem("consolidate", temp(), "cases.jsonl")).toBe("the private assets are missing (private/consolidate/assets/cases.jsonl). Make them with: ./generate-assets --only consolidate");
    expect(privateAssetsProblem("nightly", temp(), "items.jsonl")).toContain("./generate-assets --only nightly");
  });
});

describe("replaceDir", () => {
  test("puts the new folder where the old one was, and removes the old one", () => {
    const base = temp();
    put(base, { "next/new.txt": "new", "target/old.txt": "old" });
    replaceDir(join(base, "next"), join(base, "target"));
    expect(readdirSync(base).sort()).toEqual(["target"]);
    expect(readdirSync(join(base, "target"))).toEqual(["new.txt"]);
  });

  test("makes the folder when there was none, and puts the old one back when the new one cannot be moved", () => {
    const base = put(temp(), { "next/new.txt": "new" });
    replaceDir(join(base, "next"), join(base, "target"));
    expect(read(base, "target/new.txt")).toBe("new");
    put(base, { "target/old.txt": "old" });
    expect(() => replaceDir(join(base, "no-such-folder"), join(base, "target"))).toThrow();
    expect(read(base, "target/old.txt")).toBe("old");
    expect(readdirSync(base).sort()).toEqual(["target"]);
  });
});

describe("generateInto", () => {
  const writeSet = (text: string) => (stage: { assets: string; map: string }) => {
    put(stage.assets, { "cases.jsonl": text });
    writeFileSync(stage.map, `${text}-map`);
    return [];
  };

  test("moves the assets and the map into place, writes generated.json last, and leaves no temporary folder", () => {
    const out = join(temp(), "private", "consolidate"); // the folder does not exist yet
    expect(generateInto(out, "42", writeSet("first"))).toEqual([]);
    expect(readdirSync(out).sort()).toEqual(["assets", "generated.json", "map.json"]);
    expect(read(out, "assets/cases.jsonl")).toBe("first");
    expect(read(out, "map.json")).toBe("first-map");
    expect(seedOf(out)).toEqual({ seed: "42" });
  });

  test("a new set replaces the old assets, map and marker, and drops files of the old assets", () => {
    const out = join(temp(), "c");
    generateInto(out, "1", (stage) => (put(stage.assets, { "cases.jsonl": "first", "old-only.txt": "x" }), writeFileSync(stage.map, "m1"), []));
    generateInto(out, "2", writeSet("second"));
    expect(readdirSync(join(out, "assets"))).toEqual(["cases.jsonl"]);
    expect(read(out, "assets/cases.jsonl")).toBe("second");
    expect(seedOf(out)).toEqual({ seed: "2" });
  });

  test("when the checks find problems it returns them and leaves the previous set as it was", () => {
    const out = join(temp(), "c");
    generateInto(out, "1", writeSet("first"));
    const problems = generateInto(out, "2", (stage) => {
      writeSet("second")(stage);
      return ["a claim is gone"];
    });
    expect(problems).toEqual(["a claim is gone"]);
    expect(read(out, "assets/cases.jsonl")).toBe("first");
    expect(read(out, "map.json")).toBe("first-map");
    expect(seedOf(out)).toEqual({ seed: "1" });
    expect(readdirSync(out).sort()).toEqual(["assets", "generated.json", "map.json"]);
  });

  test("when making the set throws it removes the temporary folder and leaves the previous set as it was", () => {
    const out = join(temp(), "c");
    generateInto(out, "1", writeSet("first"));
    expect(() =>
      generateInto(out, "2", (stage) => {
        writeSet("second")(stage);
        throw new Error("lib/rewrite failed");
      }),
    ).toThrow("lib/rewrite failed");
    expect(read(out, "assets/cases.jsonl")).toBe("first");
    expect(seedOf(out)).toEqual({ seed: "1" });
    expect(readdirSync(out).sort()).toEqual(["assets", "generated.json", "map.json"]);
  });

  test("a first run that fails leaves no assets, no map and no marker, which a private run refuses", () => {
    const out = join(temp(), "c");
    expect(generateInto(out, "1", () => ["broken"])).toEqual(["broken"]);
    expect(readdirSync(out)).toEqual([]);
    expect(privateAssetsProblem("consolidate", out, "cases.jsonl")).toContain("assets are missing");
  });

  test("a stale temporary folder from a run that died is cleared first", () => {
    const out = put(temp(), { ".new/assets/stale.txt": "x", ".new/map.json": "stale" });
    generateInto(out, "1", writeSet("first"));
    expect(existsSync(join(out, ".new"))).toBe(false);
    expect(readdirSync(join(out, "assets"))).toEqual(["cases.jsonl"]);
  });
});

describe("runInputs", () => {
  const base = "http://localhost:8080/v1";
  const hide = (text: string) => text.split(base).join("<MODEL_BASE_URL>");

  test("holds the redacted config, the engine's settings, the digest of the files and the seed", () => {
    const config = engineConfig(base, "the-model", true, "consolidate");
    Object.assign(config.engines.consolidate, { temperature: 0, enableThinking: false, apiKey: "sk-secret" });
    const assets = put(temp(), { "cases.jsonl": "x\n" });
    const inputs = runInputs(config, hide, { dir: assets, files: ["cases.jsonl"] }, "7");
    expect(inputs.assets_sha256).toBe(assetsDigest(assets, ["cases.jsonl"]));
    expect(inputs.seed).toBe("7");
    expect(inputs.engine).toEqual({ engine: "consolidate", model: "the-model", endpoint: endpointHost("http://localhost:8080/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000, engines: { consolidate: { model: "the-model", endpoint: endpointHost("http://localhost:8080/v1/chat/completions"), temperature: 0, enableThinking: false, timeoutMs: 600_000 } } });
    expect(JSON.stringify(inputs)).not.toContain("sk-secret");
    expect((inputs.config as any).engines.consolidate).toMatchObject({ apiKey: "<redacted>", endpoint: "<MODEL_BASE_URL>/chat/completions", temperature: 0 });
    expect((inputs.config as any).defaults).toEqual({ llmEngine: "consolidate" });
  });

  test("redacts a $VARIABLE key reference too, writes the endpoint as <MODEL_BASE_URL>, and has no seed for the public assets", () => {
    const config = engineConfig(base, "m", true, "consolidate");
    const inputs = runInputs(config, hide, { dir: put(temp(), { "a.txt": "1" }), files: ["a.txt"] }, null);
    expect(inputs.seed).toBeNull();
    expect(JSON.stringify(inputs.config)).toContain('"apiKey":"<redacted>"');
    expect(JSON.stringify(inputs.config)).not.toContain("localhost");
    expect(config.engines.consolidate.endpoint).toBe(`${base}/chat/completions`); // the config that was written is not changed
  });
});
