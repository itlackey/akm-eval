import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { sha256Files } from "../../../lib/provenance.ts";
import { DATA_FILE } from "./dataset.ts";
import { writePublicAssets } from "./fakes.ts";
import { generate, install, runRewrite } from "./generate.ts";
import { GENERATED, GENERATOR_CODE, MANIFEST_VERSION, OUTPUTS, digestFiles, generatorSha256, inputsSha256, outputsSha256, readGenerated, treeProblem } from "./manifest.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
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
  test("writes the questions, rewrite.json, the map and a versioned manifest beside them, and nothing else", async () => {
    const { pub, out } = await made("222");
    expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json"]);
    expect(readdirSync(join(out, "assets")).sort()).toEqual([DATA_FILE, "rewrite.json"]);
    const manifest = JSON.parse(readFileSync(join(out, GENERATED), "utf8"));
    expect(Object.keys(manifest).sort()).toEqual(["generator_sha256", "inputs_sha256", "outputs_sha256", "sample_seed", "seed", "version"]);
    expect(manifest).toEqual({
      version: MANIFEST_VERSION,
      seed: "222",
      sample_seed: null,
      inputs_sha256: inputsSha256(pub),
      generator_sha256: generatorSha256(),
      outputs_sha256: outputsSha256(out),
    });
    for (const key of ["inputs_sha256", "generator_sha256", "outputs_sha256"]) expect(manifest[key]).toMatch(/^[0-9a-f]{64}$/);
    // the map is the one of this seed, and rewrite.json leaves the seed out
    expect(JSON.parse(readFileSync(join(out, "map.json"), "utf8")).seed).toBe("222");
    expect(JSON.parse(readFileSync(join(out, "assets", "rewrite.json"), "utf8"))).not.toHaveProperty("seed");
    expect(treeProblem(out, pub)).toBeUndefined();
    expect(existsSync(join(out, ".staging"))).toBe(false);
  });

  test("the same seed gives the same assets and manifest, and another seed gives other ones", async () => {
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
      // and the earlier tree is still one that a private run accepts, with its own seed
      expect(treeProblem(out, pub)).toBeUndefined();
      expect(readGenerated(out)?.seed).toBe("111");
    });
  }

  test("a failure with no tree before leaves nothing behind that a run could take for assets", async () => {
    const root = tmp();
    const pub = join(root, "public");
    writePublicAssets(pub);
    const out = join(root, "private", "longmemeval");
    await expect(quiet(() => generate({ seed: "222", out, publicAssets: pub, rewrite: failures[0][1] }))).rejects.toThrow("map.json holds seed 999");
    expect(readdirSync(out)).toEqual([]);
    expect(treeProblem(out, pub)).toContain("have no generated.json");
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
    expect(treeProblem(out, pub)).toBeUndefined();
    expect(readdirSync(out).sort()).toEqual(["assets", GENERATED, "map.json", "results"]);
  });

  test("a failure while the files move puts the earlier ones back", async () => {
    const { pub, out } = await made("111");
    const before = snapshot(out);
    // a staged tree with no manifest: the assets and the map move in, and the last move fails
    const staged = tmp();
    mkdirSync(join(staged, "assets"));
    writeFileSync(join(staged, "assets", DATA_FILE), "[]");
    writeFileSync(join(staged, "map.json"), "{}");
    expect(() => install(staged, out)).toThrow();
    expect(snapshot(out)).toEqual(before);
    expect(existsSync(join(out, ".old"))).toBe(false);
    expect(treeProblem(out, pub)).toBeUndefined();
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

describe("treeProblem", () => {
  test("vouches for the tree generate made", async () => {
    const { pub, out } = await copyOfMade();
    expect(treeProblem(out, pub)).toBeUndefined();
    expect(readGenerated(out)).toMatchObject({ version: 1, seed: "111", sample_seed: null });
  });

  test("refuses a tree with no manifest, one that is not valid, one of another version, and says to make the assets again", async () => {
    const { pub, out } = await copyOfMade();
    const manifest = JSON.parse(readFileSync(join(out, GENERATED), "utf8"));
    const cases: [string, string | undefined][] = [
      ["missing", undefined],
      ["not JSON", "{ nope"],
      ["not an object", "null"],
      ["another version", JSON.stringify({ ...manifest, version: MANIFEST_VERSION + 1 })],
      ["no version", JSON.stringify({ ...manifest, version: undefined })],
      ["a seed that is not an integer", JSON.stringify({ ...manifest, seed: "abc" })],
      ["a seed that is a number", JSON.stringify({ ...manifest, seed: 111 })],
      ["no sample_seed", JSON.stringify({ ...manifest, sample_seed: undefined })],
      ["a digest that is not one", JSON.stringify({ ...manifest, generator_sha256: "abc" })],
      ["no outputs digest", JSON.stringify({ ...manifest, outputs_sha256: undefined })],
    ];
    for (const [what, text] of cases) {
      if (text === undefined) rmSync(join(out, GENERATED), { force: true });
      else writeFileSync(join(out, GENERATED), text);
      const problem = treeProblem(out, pub, "private/longmemeval");
      expect(problem, what).toContain("the private assets in private/longmemeval/ have no generated.json that this run reads");
      expect(problem, what).toContain("Make them again with: ./generate-assets --only longmemeval");
    }
  });

  test("refuses a tree made from another public dataset than the lock pins now", async () => {
    const { pub, out } = await copyOfMade();
    const lock = readFileSync(join(pub, "ASSETS.lock"), "utf8");
    writeFileSync(join(pub, "ASSETS.lock"), lock.replace("r".repeat(40), "s".repeat(40)));
    expect(treeProblem(out, pub)).toContain("made from another public dataset than the one ASSETS.lock pins now (inputs_sha256");
    writeFileSync(join(pub, "ASSETS.lock"), lock);
    expect(treeProblem(out, pub)).toBeUndefined();
  });

  test("refuses a tree made by a generator that has changed since: any of its files, lib/rewrite included", async () => {
    const { pub, out } = await copyOfMade();
    // a copy of the generator's files is the same generator: the digest is of the files, wherever they are
    const root = tmp();
    for (const file of GENERATOR_CODE) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      cpSync(join(ROOT, file), join(root, file));
    }
    expect(generatorSha256(root)).toBe(generatorSha256());
    expect(treeProblem(out, pub, out, root)).toBeUndefined();
    expect(GENERATOR_CODE).toContain("lib/rewrite/rewrite.ts");
    expect(GENERATOR_CODE).toContain("lib/rewrite/lexicon.ts");
    expect(GENERATOR_CODE).toContain("benchmarks/longmemeval/src/generate.ts");
    for (const file of GENERATOR_CODE) {
      const path = join(root, file);
      const text = readFileSync(path, "utf8");
      writeFileSync(path, `${text}\n// changed\n`);
      expect(treeProblem(out, pub, out, root), file).toContain("made by a generator that has changed since");
      writeFileSync(path, text);
    }
    expect(treeProblem(out, pub, out, root)).toBeUndefined();
  });

  test("refuses a manifest that names another generator, with the inputs and the files as generate wrote them", async () => {
    const { pub, out } = await copyOfMade();
    const manifest = JSON.parse(readFileSync(join(out, GENERATED), "utf8"));
    expect(manifest.generator_sha256).toBe(generatorSha256());
    for (const old of ["0".repeat(64), "f".repeat(64)]) {
      writeFileSync(join(out, GENERATED), JSON.stringify({ ...manifest, generator_sha256: old }));
      expect(readGenerated(out)?.generator_sha256).toBe(old); // a digest in the right format, so only the comparison can refuse it
      expect(treeProblem(out, pub, "private/longmemeval")).toBe(
        "the private assets in private/longmemeval/ were made by a generator that has changed since: lib/rewrite, its lexicon, or generate.ts, dataset.ts or manifest.ts of this benchmark (generator_sha256 in generated.json differs). Make them again with: ./generate-assets --only longmemeval",
      );
    }
    writeFileSync(join(out, GENERATED), JSON.stringify(manifest));
    expect(treeProblem(out, pub)).toBeUndefined();
  });

  test("refuses outputs that are not the ones generate wrote: edited, replaced or missing", async () => {
    const { pub, out } = await copyOfMade();
    for (const name of OUTPUTS) {
      const path = join(out, name);
      const text = readFileSync(path);
      writeFileSync(path, Buffer.concat([text, Buffer.from(" ")]));
      expect(treeProblem(out, pub), name).toContain("are not the ones generate wrote");
      rmSync(path);
      expect(treeProblem(out, pub), name).toContain(`lack ${name}`);
      writeFileSync(path, text);
      expect(treeProblem(out, pub), name).toBeUndefined();
    }
    // assets from one generation under the map and the manifest of another
    const other = await made("222");
    writeFileSync(join(out, "map.json"), readFileSync(join(other.out, "map.json")));
    expect(treeProblem(out, pub)).toContain("are not the ones generate wrote");
  });
});

describe("digests", () => {
  test("are over files by their names in the folder, so the same files elsewhere give the same digest", async () => {
    const { out } = await copyOfMade();
    const elsewhere = tmp();
    cpSync(out, elsewhere, { recursive: true });
    expect(outputsSha256(elsewhere)).toBe(outputsSha256(out));
    const cwd = process.cwd();
    process.chdir(out);
    try {
      expect(outputsSha256(out)).toBe(sha256Files(OUTPUTS));
      expect(digestFiles(out, ["map.json"])).toBe(sha256Files(["map.json"]));
    } finally {
      process.chdir(cwd);
    }
    writeFileSync(join(elsewhere, "map.json"), "{}");
    expect(outputsSha256(elsewhere)).not.toBe(outputsSha256(out));
  });

  test("the generator digest covers files that exist", () => {
    for (const file of GENERATOR_CODE) expect(existsSync(join(ROOT, file)), file).toBe(true);
    expect(generatorSha256()).toMatch(/^[0-9a-f]{64}$/);
  });
});
