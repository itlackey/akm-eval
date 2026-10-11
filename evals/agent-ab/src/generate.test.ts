import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publicFixture } from "./fakes.ts";
import { generate, harmonize, install, isFictional, leftovers, libraryOf, prove, restoreNumbers } from "./generate.ts";
import { GENERATED, generatorSha256, outputsSha256, privateAssetsProblem, publicInputsSha256, readGenerated } from "./inputs.ts";
import { taskNames } from "./run.ts";

const EVAL_DIR = join(import.meta.dir, "..");

describe("harmonize", () => {
  test("gives a port that is also a number the number's replacement, and leaves the rest", () => {
    const map = { ports: { "6060": "4255", "8080": "7096" }, numbers: { "6060": "4918", "15": "16" } };
    expect(harmonize(map)).toEqual(["6060"]);
    expect(map.ports).toEqual({ "6060": "4918", "8080": "7096" });
    expect(map.numbers).toEqual({ "6060": "4918", "15": "16" });
  });

  test("does nothing when there is no overlap", () => {
    const map = { ports: { "9000": "5000" }, numbers: { "30": "25" } };
    expect(harmonize(map)).toEqual([]);
  });
});

describe("restoreNumbers", () => {
  const publicToml = ['name = "a/b"', "timeout_sec = 600.0", "budget_tokens = 25000", 'description = "30-day retention"', ""].join("\n");
  const privateToml = ['name = "a/c"', "timeout_sec = 864.0", "budget_tokens = 17913", 'description = "25-day retention"', ""].join("\n");

  test("puts back the lines that only set a number and keeps the rewritten text", () => {
    expect(restoreNumbers(publicToml, privateToml)).toBe(['name = "a/c"', "timeout_sec = 600.0", "budget_tokens = 25000", 'description = "25-day retention"', ""].join("\n"));
  });

  test("refuses a rewrite that changed the number of lines", () => {
    expect(() => restoreNumbers(publicToml, "one line")).toThrow("number of lines");
  });
});

describe("leftovers", () => {
  const dir = mkdtempSync(join(tmpdir(), "agent-ab-left-"));
  const file = (name: string, text: string) => {
    writeFileSync(join(dir, name), text);
    return join(dir, name);
  };
  const map = { words: { drillbit: "dubatuvo", akm: "akm", s3: "t3" } };

  test("finds a renamed word that is still there, in any case and inside an identifier", () => {
    expect(leftovers(map, [file("a.txt", "run Drillbit now")])).toEqual([`drillbit in ${join(dir, "a.txt")}`]);
    expect(leftovers(map, [file("b.txt", "DRILLBIT_HOST=x")])).toHaveLength(1);
  });

  test("ignores a word inside a longer word, one in a URL, a word kept as it is and a short word", () => {
    expect(leftovers(map, [file("c.txt", "see https://drillbit.example/docs and drillbits, akm show, s3")])).toEqual([]);
  });

  test("passes a clean file", () => {
    expect(leftovers(map, [file("d.txt", "dubatuvo scale")])).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("the public tasks", () => {
  test("six name made-up tools, and each of them has a library", () => {
    const tasks = taskNames(join(EVAL_DIR, "tasks"));
    const fictional = tasks.filter((t) => isFictional(join(EVAL_DIR, "tasks", t)));
    expect(fictional).toHaveLength(6);
    expect(fictional.every((t) => t.startsWith("drillbit--") || t.startsWith("inkwell--"))).toBe(true);
    expect(new Set(fictional.map((t) => libraryOf(join(EVAL_DIR, "tasks", t))))).toEqual(new Set(["drillbit", "inkwell"]));
  });

  // The three inkwell verifiers run pytest through uv, which needs the network, so they are proven by `generate` and by
  // Harbor's oracle and nop agents (see the README) and not here.
  test("each one with a shell verifier is passed by its solution and not by the workspace it starts with", () => {
    const shell = taskNames(join(EVAL_DIR, "tasks")).filter((t) => existsSync(join(EVAL_DIR, "tasks", t, "tests", "verify.sh")));
    expect(shell).toHaveLength(6);
    for (const t of shell) expect(prove(t, join(EVAL_DIR, "tasks", t))).toEqual({ task: t, problems: [] });
  });
});

describe("generate", () => {
  const fixture = publicFixture;

  test("keeps the sound task, leaves out the three that fail the proof, and keeps the plumbing as it was", () => {
    const from = fixture();
    const out = mkdtempSync(join(tmpdir(), "agent-ab-out-"));
    try {
      const r = generate({ seed: "7", out, from });
      expect(r.kept).toHaveLength(1);
      expect(r.kept[0]).toMatch(/^[a-z]+--scale$/);
      expect(r.kept[0]).not.toContain("drillbit");
      expect(r.leftOut.map((t) => t.why.join(" "))).toEqual(
        expect.arrayContaining([
          expect.stringContaining("the answer did not change"),
          expect.stringContaining("the solution does not pass the verifier"),
          expect.stringContaining('does not contain "--tier"'),
        ]),
      );
      expect(r.problems).toEqual([]);

      const dir = join(out, "assets", "tasks", r.kept[0]);
      expect(readFileSync(join(dir, "environment", "Dockerfile"), "utf8")).toBe("FROM ubuntu:24.04\nRUN pip install pytest==8.4.1\n");
      expect(readFileSync(join(dir, "tests", "test.sh"), "utf8")).toContain("pytest runs here");
      const toml = readFileSync(join(dir, "task.toml"), "utf8");
      expect(toml).toContain("timeout_sec = 600.0");
      const library = readdirSync(join(out, "assets", "libraries"));
      expect(library).toHaveLength(1);
      expect(library[0]).not.toBe("drillbit");
      expect(toml).toContain(`AKM_TASK_STASH = "${library[0]}"`);
      expect(readFileSync(join(dir, "instruction.md"), "utf8")).not.toContain("drillbit");
      expect(existsSync(join(out, "map.json"))).toBe(true);
      expect(existsSync(join(out, ".work"))).toBe(false);
    } finally {
      rmSync(from, { recursive: true, force: true });
      rmSync(out, { recursive: true, force: true });
    }
  });

  test("the same seed gives the same private tasks", () => {
    const from = fixture();
    const [a, b] = [mkdtempSync(join(tmpdir(), "agent-ab-out-")), mkdtempSync(join(tmpdir(), "agent-ab-out-"))];
    try {
      const one = generate({ seed: "7", out: a, from });
      const two = generate({ seed: "7", out: b, from });
      expect(two.kept).toEqual(one.kept);
      expect(readFileSync(join(b, "assets", "tasks", one.kept[0], "solution", "solve.sh"), "utf8")).toBe(readFileSync(join(a, "assets", "tasks", one.kept[0], "solution", "solve.sh"), "utf8"));
    } finally {
      for (const d of [from, a, b]) rmSync(d, { recursive: true, force: true });
    }
  });
});

/** Every file under `dir` by relative path, with its bytes, so two trees can be compared exactly. */
function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else out[join(d, e.name).slice(dir.length + 1)] = readFileSync(join(d, e.name)).toString("base64");
    }
  };
  walk(dir);
  return out;
}

describe("generate puts the private tasks in place only when they are sound", () => {
  const made: string[] = [];
  afterEach(() => {
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  const tmp = (): string => {
    const d = mkdtempSync(join(tmpdir(), "agent-ab-swap-"));
    made.push(d);
    return d;
  };
  /** A public folder, and an output folder that already holds a corpus generated from it with seed 7. */
  function withPrevious(): { from: string; out: string; before: Record<string, string> } {
    const from = publicFixture();
    made.push(from);
    const out = tmp();
    expect(generate({ seed: "7", out, from }).installed).toBe(true);
    return { from, out, before: tree(out) };
  }
  const brokenVerifier = "#!/usr/bin/env bash\nexit 1\n";

  test("writes generated.json: the version, the seed and the digests of the inputs, the generator and the outputs, which match the tree", () => {
    const from = publicFixture();
    made.push(from);
    const out = tmp();
    const r = generate({ seed: "7", out, from });
    expect(r.installed).toBe(true);
    const assets = join(out, "assets");
    expect(JSON.parse(readFileSync(join(assets, GENERATED), "utf8"))).toEqual({
      version: 1,
      seed: "7",
      inputs_sha256: publicInputsSha256(from),
      generator_sha256: generatorSha256(),
      outputs_sha256: outputsSha256(assets),
    });
    expect(readGenerated(assets)).toBeDefined();
    expect(privateAssetsProblem(assets, from)).toBeUndefined();
    expect(readdirSync(out).sort()).toEqual(["assets", "map.json"]); // no staging, work or old folder left behind
  }, 60_000);

  test("a verifier that always fails keeps no task, writes nothing, and leaves the assets and the map of the run before byte for byte as they were", () => {
    const { from, out, before } = withPrevious();
    for (const t of taskNames(join(from, "tasks"))) writeFileSync(join(from, "tasks", t, "tests", "verify.sh"), brokenVerifier);
    const r = generate({ seed: "9", out, from }); // another seed: a map that was written would differ
    expect(r.kept).toEqual([]);
    expect(r.installed).toBe(false);
    expect(tree(out)).toEqual(before);
    expect(readdirSync(out).sort()).toEqual(["assets", "map.json"]);
  }, 60_000);

  test("with nothing before it, a run that keeps no task leaves no assets, no tasks folder and no map", () => {
    const from = publicFixture();
    made.push(from);
    for (const t of taskNames(join(from, "tasks"))) writeFileSync(join(from, "tasks", t, "tests", "verify.sh"), brokenVerifier);
    const out = tmp();
    const r = generate({ seed: "7", out, from });
    expect(r.installed).toBe(false);
    expect(readdirSync(out)).toEqual([]);
  }, 60_000);

  test("a verification that fails late, on the last task, after the others were made, leaves the run before as it was", () => {
    const { from, out, before } = withPrevious();
    // The tasks are made in name order and drillbit--wrong is the last: its solution no longer even runs.
    writeFileSync(join(from, "tasks", "drillbit--wrong", "solution", "solve.sh"), "#!/bin/bash\nexit 1\n");
    expect(() => generate({ seed: "9", out, from })).toThrow("solve.sh failed");
    expect(tree(out)).toEqual(before);
    expect(readdirSync(out).sort()).toEqual(["assets", "map.json"]);
  }, 60_000);

  test("a renamed word left in a kept task is a problem, nothing is put in place, and the run before stays", () => {
    const { from, out, before } = withPrevious();
    mkdirSync(join(from, "tasks", "drillbit--scale", "environment", "workspace"), { recursive: true });
    writeFileSync(join(from, "tasks", "drillbit--scale", "environment", "workspace", "blob.bin"), Buffer.from("drillbit\0binary, which the rewrite does not read"));
    const r = generate({ seed: "9", out, from });
    expect(r.kept).toHaveLength(1);
    expect(r.problems).toEqual([expect.stringMatching(/^drillbit in assets\/tasks\/[a-z]+--scale\/environment\/workspace\/blob\.bin$/)]);
    expect(r.installed).toBe(false);
    expect(tree(out)).toEqual(before);
  }, 60_000);

  test("a good run after a bad one replaces the assets and the map together", () => {
    const { from, out, before } = withPrevious();
    const r = generate({ seed: "9", out, from });
    expect(r.installed).toBe(true);
    const now = tree(out);
    expect(now["map.json"]).not.toBe(before["map.json"]);
    expect(JSON.parse(readFileSync(join(out, "assets", GENERATED), "utf8")).seed).toBe("9");
    expect(privateAssetsProblem(join(out, "assets"), from)).toBeUndefined();
  }, 60_000);

  test("install puts back what it moved when a later move fails", () => {
    const out = tmp();
    mkdirSync(join(out, "assets"));
    writeFileSync(join(out, "assets", "x"), "old");
    writeFileSync(join(out, "map.json"), "old map");
    const staging = tmp();
    mkdirSync(join(staging, "assets"));
    writeFileSync(join(staging, "assets", "x"), "new"); // and no map.json to move after the assets
    const before = tree(out);
    expect(() => install(staging, out)).toThrow();
    expect(tree(out)).toEqual(before);
    expect(existsSync(join(out, ".old"))).toBe(false);
  }, 60_000);
});

describe("privateAssetsProblem", () => {
  const made: string[] = [];
  afterEach(() => {
    for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
  });
  function generated(): { from: string; assets: string } {
    const from = publicFixture();
    const out = mkdtempSync(join(tmpdir(), "agent-ab-stale-"));
    made.push(from, out);
    expect(generate({ seed: "7", out, from }).installed).toBe(true);
    return { from, assets: join(out, "assets") };
  }

  test("is nothing for assets as generate wrote them", () => {
    const { from, assets } = generated();
    expect(privateAssetsProblem(assets, from, "private/agent-ab/assets")).toBeUndefined();
  }, 60_000);

  test("refuses assets with no manifest, or one in another format", () => {
    const { from, assets } = generated();
    const manifest = JSON.parse(readFileSync(join(assets, GENERATED), "utf8"));
    rmSync(join(assets, GENERATED));
    expect(privateAssetsProblem(assets, from, "private/agent-ab/assets")).toBe(
      "the private assets in private/agent-ab/assets/ have no generated.json in its current format, so nothing says what they were made from (an older generate, or a generate that stopped). Make them again with: ./generate-assets --only agent-ab",
    );
    writeFileSync(join(assets, GENERATED), JSON.stringify({ ...manifest, version: 2 }));
    expect(privateAssetsProblem(assets, from)).toContain("current format");
    writeFileSync(join(assets, GENERATED), JSON.stringify({ seed: manifest.seed, inputs_sha256: manifest.inputs_sha256 })); // an older generate's
    expect(privateAssetsProblem(assets, from)).toContain("current format");
    writeFileSync(join(assets, GENERATED), "{not json");
    expect(privateAssetsProblem(assets, from)).toContain("current format");
  }, 60_000);

  test("refuses assets made from public tasks or libraries that have changed since", () => {
    const { from, assets } = generated();
    writeFileSync(join(from, "libraries", "drillbit", "skills", "drillbit", "SKILL.md"), "---\ndescription: another\n---\n# drillbit\n");
    expect(privateAssetsProblem(assets, from, "private/agent-ab/assets")).toContain("were made from public tasks or libraries that have changed since");
  }, 60_000);

  test("a public task with real tools is not an input: adding one does not make the assets stale", () => {
    const { from, assets } = generated();
    mkdirSync(join(from, "tasks", "real--task"), { recursive: true });
    writeFileSync(join(from, "tasks", "real--task", "task.toml"), '[metadata]\ntools = "real"\n');
    expect(privateAssetsProblem(assets, from)).toBeUndefined();
  }, 60_000);

  test("refuses assets that are not what generate wrote: a task changed, a file added, one removed", () => {
    const { from, assets } = generated();
    const task = join(assets, "tasks", readdirSync(join(assets, "tasks"))[0]);
    const instruction = join(task, "instruction.md");
    const text = readFileSync(instruction, "utf8");
    writeFileSync(instruction, `${text}\nan edit`);
    expect(privateAssetsProblem(assets, from, "private/agent-ab/assets")).toContain("are not what generate wrote");
    writeFileSync(instruction, text);
    expect(privateAssetsProblem(assets, from)).toBeUndefined();
    writeFileSync(join(assets, "libraries", "stray.md"), "added");
    expect(privateAssetsProblem(assets, from)).toContain("are not what generate wrote");
    rmSync(join(assets, "libraries", "stray.md"));
    rmSync(instruction);
    expect(privateAssetsProblem(assets, from)).toContain("are not what generate wrote");
  }, 60_000);

  test("refuses assets with no tasks folder, as the run did before", () => {
    const { from, assets } = generated();
    rmSync(join(assets, "tasks"), { recursive: true });
    expect(privateAssetsProblem(assets, from, "private/agent-ab/assets")).toBe("the private assets are missing (private/agent-ab/assets/tasks). Make them with: ./generate-assets --only agent-ab");
  }, 60_000);
});
