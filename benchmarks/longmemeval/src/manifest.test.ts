import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";
import { DATA_FILE } from "./dataset.ts";
import { writePublicAssets } from "./fakes.ts";
import { generate, install, runRewrite } from "./generate.ts";
import { GENERATED, OUTPUTS, digestFiles, readGenerated } from "./manifest.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "lme-manifest-"));
  dirs.push(d);
  return d;
};

const quiet = async <T>(f: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};

/** Every file under `dir` by its path from `dir`, with its bytes: two snapshots that are equal are byte-identical trees. */
function snapshot(dir: string): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) walk(path);
      else found[relative(dir, path)] = readFileSync(path).toString("base64");
    }
  };
  walk(dir);
  return found;
}

/** A public assets folder, and a private folder next to it that `generate` made from it under `seed`. */
async function made(seed = "111", root = tmp()) {
  const pub = join(root, "public");
  writePublicAssets(pub);
  const out = join(root, "private", "longmemeval");
  await quiet(() => generate({ seed, out, publicAssets: pub }));
  return { root, pub, out };
}

// One generation, copied for the tests that only read or edit a finished tree.
const sharedRoot = mkdtempSync(join(tmpdir(), "lme-manifest-shared-"));
afterAll(() => rmSync(sharedRoot, { recursive: true, force: true }));
let shared: ReturnType<typeof made> | undefined;
async function copyOfMade() {
  const from = await (shared ??= made("111", sharedRoot));
  const root = tmp();
  cpSync(from.root, root, { recursive: true });
  return { root, pub: join(root, "public"), out: join(root, "private", "longmemeval") };
}

const mapPath = (args: string[]): string => args[args.indexOf("--map") + 1];
const outputFolder = (args: string[]): string => args[args.length - 1];

describe("generate", () => {
  test("writes the questions, rewrite.json, the map and generated.json beside them, and nothing else", async () => {
    const { out } = await made("222");
    expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json"]);
    expect(readdirSync(join(out, "assets")).sort()).toEqual([DATA_FILE, "rewrite.json"]);
    expect(JSON.parse(readFileSync(join(out, GENERATED), "utf8"))).toEqual({ seed: "222" });
    // the map is the one of this seed, and rewrite.json leaves the seed out
    expect(JSON.parse(readFileSync(join(out, "map.json"), "utf8")).seed).toBe("222");
    expect(JSON.parse(readFileSync(join(out, "assets", "rewrite.json"), "utf8"))).not.toHaveProperty("seed");
    expect(existsSync(join(out, ".staging"))).toBe(false);
  });

  test("the same seed gives the same assets and generated.json, and another seed gives other ones", async () => {
    const [a, b, c] = [await made("7"), await made("7"), await made("8")];
    const [x, y, z] = [a, b, c].map((m) => snapshot(m.out));
    expect(x).toEqual(y);
    expect(x[`assets/${DATA_FILE}`]).not.toBe(z[`assets/${DATA_FILE}`]);
    expect(readGenerated(c.out)?.seed).toBe("8");
  });

  // Each of these breaks the generation after the rewrite has run and the tree is staged. Whatever fails, the earlier tree stays as it was.
  const failures: [string, (args: string[]) => string, string][] = [
    [
      "the map ends up with another seed than the manifest (the last check)",
      (args) => {
        const printed = runRewrite(args);
        writeFileSync(mapPath(args), JSON.stringify({ ...JSON.parse(readFileSync(mapPath(args), "utf8")), seed: "999" }));
        return printed;
      },
      "map.json holds seed 999, and this run's seed is 222",
    ],
    [
      "the rewrite takes an answer out of its evidence",
      (args) => {
        const printed = runRewrite(args);
        const file = join(outputFolder(args), "q0001.txt");
        const text = readFileSync(file, "utf8");
        const at = text.indexOf("@@session");
        writeFileSync(file, text.slice(0, at) + text.slice(at).replaceAll("BLUE42", "RED"));
        return printed;
      },
      "the rewrite took the answer out of the evidence of 1 questions (q-secret)",
    ],
    [
      "the rewrite leaves out a question",
      (args) => {
        const printed = runRewrite(args);
        rmSync(join(outputFolder(args), "q0003.txt"));
        return printed;
      },
      "the rewrite wrote 2 files for 3 questions",
    ],
    [
      "the rewrite changes the shape of a question",
      (args) => {
        const printed = runRewrite(args);
        const file = join(outputFolder(args), "q0002.txt");
        writeFileSync(file, readFileSync(file, "utf8").replace("@@answer", "<<user>>"));
        return printed;
      },
      "question q-cats: expected @@answer at block 1",
    ],
    [
      "the rewrite itself fails",
      (args) => {
        runRewrite(args);
        throw new Error("lib/rewrite failed: out of memory");
      },
      "lib/rewrite failed: out of memory",
    ],
  ];

  for (const [name, rewrite, message] of failures) {
    test(`a generation that fails late leaves the earlier assets, map and manifest byte for byte as they were: ${name}`, async () => {
      const { pub, out } = await made("111");
      mkdirSync(join(out, "results"), { recursive: true });
      writeFileSync(join(out, "results", "kept.txt"), "a results folder is not the generator's\n");
      const before = snapshot(out);
      await expect(quiet(() => generate({ seed: "222", out, publicAssets: pub, rewrite }))).rejects.toThrow(message);
      expect(snapshot(out)).toEqual(before);
      expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json", "results"]); // no staging or old folder is left
      expect(readGenerated(out)?.seed).toBe("111"); // the earlier tree is still there, with its own seed
    });
  }

  test("a failure with no tree before leaves nothing behind that a run could take for assets", async () => {
    const root = tmp();
    const pub = join(root, "public");
    writePublicAssets(pub);
    const out = join(root, "private", "longmemeval");
    await expect(quiet(() => generate({ seed: "222", out, publicAssets: pub, rewrite: failures[0][1] }))).rejects.toThrow("map.json holds seed 999");
    expect(readdirSync(out)).toEqual([]);
    expect(readGenerated(out)).toBeUndefined();
  });

  test("a second generation replaces the first whole: the assets, the map and the manifest are the new seed's", async () => {
    const { pub, out } = await made("111");
    mkdirSync(join(out, "results"), { recursive: true });
    writeFileSync(join(out, "results", "kept.txt"), "kept\n");
    writeFileSync(join(out, "assets", "left-over.txt"), "from an earlier generation\n");
    await quiet(() => generate({ seed: "222", out, publicAssets: pub }));
    expect(existsSync(join(out, "assets", "left-over.txt"))).toBe(false);
    expect(readFileSync(join(out, "results", "kept.txt"), "utf8")).toBe("kept\n");
    expect(readGenerated(out)?.seed).toBe("222");
    expect(JSON.parse(readFileSync(join(out, "map.json"), "utf8")).seed).toBe("222");
    expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json", "results"]);
  });

  test("a failure while the files move puts the earlier ones back", async () => {
    const { out } = await made("111");
    const before = snapshot(out);
    // a staged tree with no manifest: the assets and the map move in, and the last move fails
    const staged = tmp();
    mkdirSync(join(staged, "assets"));
    writeFileSync(join(staged, "assets", DATA_FILE), "[]");
    writeFileSync(join(staged, "map.json"), "{}");
    expect(() => install(staged, out)).toThrow();
    expect(snapshot(out)).toEqual(before);
    expect(existsSync(join(out, ".old"))).toBe(false);
  });

  test("refuses a seed that is not a non-negative integer, and changes nothing", async () => {
    const { pub, out } = await made("111");
    const before = snapshot(out);
    for (const seed of ["", "-1", "1.5", "abc", "123456789012345678901"]) await expect(generate({ seed, out, publicAssets: pub })).rejects.toThrow("the seed must be a non-negative integer");
    expect(snapshot(out)).toEqual(before);
  });

  test("asks for a seed and an output folder", () => {
    const run = Bun.spawnSync(["bun", join(import.meta.dir, "generate.ts")], { stdout: "pipe", stderr: "pipe" });
    expect(run.exitCode).toBe(2);
    expect(run.stderr.toString()).toContain("Usage: benchmarks/longmemeval/generate --seed N --out private/longmemeval");
  });
});

describe("readGenerated", () => {
  test("reads the seed of a tree generate made, and nothing from a file that is missing, not JSON or holds no seed", async () => {
    const { out } = await copyOfMade();
    expect(readGenerated(out)).toEqual({ seed: "111" });
    for (const text of ["{ nope", "null", JSON.stringify({ seed: "abc" }), JSON.stringify({ seed: 111 }), "{}"]) {
      writeFileSync(join(out, GENERATED), text);
      expect(readGenerated(out), text).toBeUndefined();
    }
    rmSync(join(out, GENERATED));
    expect(readGenerated(out)).toBeUndefined();
  });
});

describe("digestFiles", () => {
  test("is over files by their names in the folder, so the same files elsewhere give the same digest", async () => {
    const { out } = await copyOfMade();
    const elsewhere = tmp();
    cpSync(out, elsewhere, { recursive: true });
    expect(digestFiles(elsewhere, OUTPUTS)).toBe(digestFiles(out, OUTPUTS));
    const cwd = process.cwd();
    process.chdir(out);
    try {
      expect(digestFiles(out, OUTPUTS)).toBe(sha256Files(OUTPUTS));
      expect(digestFiles(out, ["map.json"])).toBe(sha256Files(["map.json"]));
    } finally {
      process.chdir(cwd);
    }
    writeFileSync(join(elsewhere, "map.json"), "{}");
    expect(digestFiles(elsewhere, OUTPUTS)).not.toBe(digestFiles(out, OUTPUTS));
  });
});
