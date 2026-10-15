import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { CORPUS_OPTIONS, type Recipient, confirmCases, renamed, resolveCorpora } from "./corpus.ts";

const LIB = import.meta.dir;
const REPO = resolve(LIB, "..");

// A folder with a space in its name, so a path that is not quoted somewhere fails here.
const dirs: string[] = [];
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "corpus key- test "));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const put = (file: string, text: string): string => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, text);
  return file;
};
const messageOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "did not throw";
};

describe("resolveCorpora", () => {
  const PUBLIC = "/checkout/evals/retrieval/assets";
  /** A run of the eval `retrieval` in a temporary repository root. */
  const setup = () => {
    const root = temp();
    const resolveIn = (values: { corpus?: string; cases?: string }, extra: { rewrite?: boolean; eval?: string } = {}) =>
      resolveCorpora({ eval: extra.eval ?? "retrieval", values, publicFolder: PUBLIC, rewrite: extra.rewrite, root });
    return { root, resolveIn };
  };

  test("public is the default, and nothing is looked for in private/", () => {
    const { root, resolveIn } = setup();
    expect(resolveIn({})).toEqual([{ name: "public", folder: PUBLIC, rewrite: false, seed: null, flag: "--corpus public" }]);
    expect(resolveIn({ corpus: "public" })).toEqual(resolveIn({}));
    expect(existsSync(join(root, "private"))).toBe(false);
  });

  test("custom is the rewrite in private/<eval>/assets, with the seed of the generated.json beside or inside it", () => {
    const { root, resolveIn } = setup();
    const priv = join(root, "private", "retrieval");
    const custom = { name: "custom", folder: join(priv, "assets"), rewrite: true, flag: "--corpus custom" };
    expect(resolveIn({ corpus: "custom" })).toEqual([{ ...custom, seed: null }]);
    put(join(priv, "generated.json"), '{"seed":"5"}');
    expect(resolveIn({ corpus: "custom" })).toEqual([{ ...custom, seed: "5" }]);
    put(join(priv, "assets", "generated.json"), '{"seed":"11"}');
    expect(resolveIn({ corpus: "custom" })).toEqual([{ ...custom, seed: "11" }]);
    put(join(priv, "assets", "generated.json"), '{"seed":"forty-two"}');
    expect(resolveIn({ corpus: "custom" })[0].seed).toBe("5"); // a generated.json with no seed is not one
  });

  test("--cases DIR alone is a custom corpus of your own, with no seed. DIR is from the repository root", () => {
    const { root, resolveIn } = setup();
    expect(resolveIn({ cases: "notes" })).toEqual([{ name: "custom", folder: join(root, "notes"), rewrite: false, seed: null, flag: "--cases notes" }]);
    expect(resolveIn({ corpus: "custom", cases: join(root, "notes") })[0].folder).toBe(join(root, "notes"));
    // a folder is a corpus of your own even when it is the one the rewrite is in
    put(join(root, "private", "retrieval", "assets", "generated.json"), '{"seed":"11"}');
    expect(resolveIn({ cases: "private/retrieval/assets" })[0]).toMatchObject({ rewrite: false, seed: null });
  });

  test("all is public and then the rewrite, or the folder of --cases", () => {
    const { root, resolveIn } = setup();
    expect(resolveIn({ corpus: "all" }).map((c) => [c.name, c.folder, c.flag])).toEqual([
      ["public", PUBLIC, "--corpus public"],
      ["custom", join(root, "private", "retrieval", "assets"), "--corpus all"],
    ]);
    expect(resolveIn({ corpus: "all", cases: "notes" }).map((c) => [c.name, c.folder, c.flag])).toEqual([
      ["public", PUBLIC, "--corpus public"],
      ["custom", join(root, "notes"), "--cases notes"],
    ]);
  });

  test("an eval with no rewrite (promotion) says so when --corpus custom or all has no --cases, and takes --cases", () => {
    const { root, resolveIn } = setup();
    const promotion = { eval: "promotion", rewrite: false };
    const says = "promotion has no rewrite: its custom corpus is a folder of your own cases. Use --cases DIR";
    expect(messageOf(() => resolveIn({ corpus: "custom" }, promotion))).toBe(says);
    expect(messageOf(() => resolveIn({ corpus: "all" }, promotion))).toBe(says);
    expect(resolveIn({ cases: "night" }, promotion)).toEqual([{ name: "custom", folder: join(root, "night"), rewrite: false, seed: null, flag: "--cases night" }]);
    expect(resolveIn({}, promotion)[0].name).toBe("public");
  });

  test("legacy corpus names accept unambiguous aliases and ask for a folder when needed", () => {
    const { root, resolveIn } = setup();
    const own = "--corpus own was renamed in 0.2: use --cases DIR for a folder of your own";
    expect(resolveIn({ corpus: "private" })).toEqual(resolveIn({ corpus: "custom" }));
    expect(messageOf(() => resolveIn({ corpus: "own" }))).toBe(own);
    expect(messageOf(() => resolveIn({ corpus: "own-feedback" }))).toBe("--corpus own-feedback was renamed in 0.2: use --cases DIR for a folder of your own");
    expect(resolveIn({ corpus: "own", cases: "night" })).toEqual(resolveIn({ cases: "night" }));
    // an eval with no rewrite does not offer one
    expect(messageOf(() => resolveIn({ corpus: "private" }, { rewrite: false }))).toContain("Use --cases DIR");
    expect(renamed("private", "--corpus custom")).toBe("--corpus private was renamed in 0.2: use --corpus custom");
    for (const value of ["public", "custom", "all", "bogus", undefined]) expect(renamed(value, "x")).toBeUndefined();
    expect(existsSync(join(root, "private"))).toBe(false);
  });

  test("a value that is not a corpus, --cases with public, and an empty --cases are refused", () => {
    const { resolveIn } = setup();
    expect(messageOf(() => resolveIn({ corpus: "bogus" }))).toBe('--corpus must be public, custom or all, not "bogus"');
    expect(messageOf(() => resolveIn({ corpus: "constructor" }))).toBe('--corpus must be public, custom or all, not "constructor"');
    expect(messageOf(() => resolveIn({ corpus: "public", cases: "notes" }))).toBe("--cases is a custom corpus: use it alone, or with --corpus custom");
    expect(messageOf(() => resolveIn({ cases: "  " }))).toBe("--cases needs a folder");
  });

  test("fail ends the run with the message", () => {
    const stopped: string[] = [];
    const run = () =>
      resolveCorpora({
        eval: "retrieval",
        values: { corpus: "own" },
        publicFolder: PUBLIC,
        root: temp(),
        fail: (message) => {
          stopped.push(message);
          throw new Error("stopped");
        },
      });
    expect(messageOf(run)).toBe("stopped");
    expect(stopped).toEqual(["--corpus own was renamed in 0.2: use --cases DIR for a folder of your own"]);
  });
});

describe("./generate-assets", () => {
  /** A repository of its own: generate-assets, this repository's lib/, and fake generate scripts. */
  const repo = () => {
    const root = temp();
    copyFileSync(join(REPO, "generate-assets"), join(root, "generate-assets"));
    chmodSync(join(root, "generate-assets"), 0o755);
    symlinkSync(LIB, join(root, "lib"));
    const generate = (group: string, name: string, body: string) => {
      const file = put(join(root, group, name, "generate"), `#!/usr/bin/env bash\nset -euo pipefail\nseed="$2"\nout="$4"\n${body}\n`);
      chmodSync(file, 0o755);
    };
    return { root, generate };
  };
  const run = (root: string, ...args: string[]) => {
    const r = Bun.spawnSync(["bash", join(root, "generate-assets"), ...args], { cwd: root, env: { ...process.env, TMPDIR: tmpdir() }, stdout: "pipe", stderr: "pipe" });
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };
  const NESTED = 'mkdir -p "$out/assets"\nprintf \'{"seed":"%s"}\\n\' "$seed" > "$out/assets/generated.json"';

  test("makes each set and writes nothing else: no corpus.json, and what --corpus custom then reads is the set with its seed", () => {
    const { root, generate } = repo();
    generate("evals", "nested", NESTED);
    generate("benchmarks", "beside", 'mkdir -p "$out/assets"\nprintf \'{"seed":"%s"}\\n\' "$seed" > "$out/generated.json"');
    const r = run(root, "--seed", "42");
    expect([r.code, r.err]).toEqual([0, ""]);
    expect(readdirSync(join(root, "private", "nested")).sort()).toEqual(["assets"]);
    expect(readdirSync(join(root, "private", "beside")).sort()).toEqual(["assets", "generated.json"]);
    for (const name of ["nested", "beside"]) {
      const [c] = resolveCorpora({ eval: name, values: { corpus: "custom" }, publicFolder: "/p", root });
      expect([c.folder, c.rewrite, c.seed]).toEqual([join(root, "private", name, "assets"), true, "42"]);
    }
  });

  test("a generate that fails fails the run, and the others are made", () => {
    const { root, generate } = repo();
    generate("evals", "broken", "exit 1");
    generate("evals", "fine", NESTED);
    const r = run(root, "--seed", "42");
    expect(r.code).toBe(1);
    expect(r.err).toContain("generate-assets: failed: broken\n");
    expect(existsSync(join(root, "private", "fine", "assets", "generated.json"))).toBe(true);
  });
});

describe("custom-case destinations", () => {
  const model: Recipient = { role: "model", name: "qwen3-8b", baseUrl: "https://gateway.example/v1" };
  const judge: Recipient = { role: "judge", name: "qwen3-32b", baseUrl: "https://gateway.example/v1" };
  const report = async (to: Recipient[], values: { cases?: string; yes?: boolean } = { cases: "~/notes/distill" }) => {
    const shown: string[] = [];
    await confirmCases(values, to, { log: line => shown.push(line) });
    return shown;
  };

  test("reports the folder, model, judge and endpoints without a confirmation", async () => {
    expect(await report([model, judge])).toEqual([
      "The cases in ~/notes/distill will be sent to:",
      "  model  qwen3-8b at https://gateway.example/v1",
      "  judge  qwen3-32b at https://gateway.example/v1",
    ]);
    expect((await report([model])).length).toBe(2);
    expect((await report([judge]))[1]).toBe("  judge  qwen3-32b at https://gateway.example/v1");
  });

  test("destination reporting removes credentials and queries", async () => {
    const at = async (baseUrl: string | undefined) => (await report([{ role: "model", name: "m", baseUrl }]))[1];
    expect(await at("HTTPS://user:SYNTH-pass@Gateway.example:8443/deployment-A/v1/?api_key=SYNTH-key#frag")).toBe("  model  m at https://gateway.example:8443/deployment-A/v1");
    expect(await at("http://localhost:8080")).toBe("  model  m at http://localhost:8080");
    expect(await at(undefined)).toBe("  model  m at its provider's own endpoint");
    expect(await at("not a url SYNTH-secret")).toBe("  model  m at an endpoint that is not a URL");
  });

  test("-y and --yes remain accepted and preserve destination reporting", async () => {
    for (const flag of ["-y", "--yes"]) {
      const { values } = parseArgs({ args: ["--cases", "notes", flag], options: CORPUS_OPTIONS, strict: true });
      expect(values).toEqual({ cases: "notes", yes: true });
      expect(await report([model], values)).toEqual(await report([model], { cases: "notes" }));
    }
  });

  test("public/rewrite runs and calls with no recipients have no destination report", async () => {
    expect(await report([model, judge], {})).toEqual([]);
    expect(await report([], { cases: "notes" })).toEqual([]);
  });
});

describe("every eval and benchmark that takes --corpus", () => {
  const runs = [
    ...["evals", "benchmarks"].flatMap((group) =>
      readdirSync(join(REPO, group))
        .map((name) => join(REPO, group, name, "src", "run.ts"))
        .filter((file) => existsSync(file)),
    ),
    join(REPO, "evals", "retrieval", "src", "label.ts"),
  ];

  test("the scan finds the runs, so it cannot pass by finding none", () => {
    expect(runs.length).toBeGreaterThanOrEqual(14);
  });

  test("old corpus names never launch a model while setup is missing", async () => {
    const cwd = temp(); // a folder with no .env in it
    const env = { ...process.env, AKM_BIN: "/nonexistent/akm-for-this-test" };
    const stop = async (file: string, old: string) => {
      const proc = Bun.spawn(["bun", file, "--corpus", old], { cwd, env, stdout: "pipe", stderr: "pipe" });
      const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
      return { file, old, code, err };
    };
    const tries = runs.flatMap((file) => ["own", "own-feedback"].map((old) => [file, old] as const));
    for (let i = 0; i < tries.length; i += 8) {
      for (const done of await Promise.all(tries.slice(i, i + 8).map(([file, old]) => stop(file, old)))) {
        expect([done.file, done.old, done.code]).toEqual([done.file, done.old, 2]);
        expect(done.err, `${done.file} ${done.old}`).toContain(`--corpus ${done.old} was renamed in 0.2: use `);
      }
    }
  }, 120_000);
});

describe("every run that sends --cases reports its destinations before setup", () => {
  const sourceOf = (file: string): string => readFileSync(file, "utf8");
  const runs = [
    ...["evals", "benchmarks"].flatMap((group) =>
      readdirSync(join(REPO, group))
        .map((name) => join(REPO, group, name, "src", "run.ts"))
        .filter((file) => existsSync(file)),
    ),
    join(REPO, "evals", "retrieval", "src", "label.ts"),
  ].map((file) => ({ file: file.slice(REPO.length + 1), source: sourceOf(file) }));
  // The runs that take --cases and send it to no model.
  const SENDS_NONE = ["evals/retrieval/src/run.ts"];
  const takesCases = (source: string) => /\.\.\.CORPUS_OPTIONS/.test(source);

  test("the scan finds the runs that take --cases", () => {
    expect(runs.filter((r) => takesCases(r.source)).length).toBeGreaterThanOrEqual(13);
    expect(runs.find((r) => r.file === "benchmarks/skillret/src/run.ts")?.source).not.toMatch(/confirmCases|\.\.\.CORPUS_OPTIONS/); // skillret takes no --cases
  });

  test("each calls confirmCases once, in main, before it makes a sandbox or asks akm for its version", () => {
    const wrong: string[] = [];
    for (const { file, source } of runs.filter((r) => takesCases(r.source))) {
      const calls = source.split("confirmCases(").length - 1;
      if (SENDS_NONE.includes(file)) {
        if (calls !== 0) wrong.push(`${file}: sends nothing to a model but reports recipients`);
        continue;
      }
      const main = source.slice(Math.max(source.indexOf("async function main"), 0));
      const asked = main.indexOf("confirmCases(");
      const firstUse = Math.min(...["createSandbox(", "openSandbox(", "akmArm(", "akmVersion(", "labelCollection("].map((use) => (main.indexOf(use) < 0 ? Infinity : main.indexOf(use))));
      if (calls !== 1) wrong.push(`${file}: calls confirmCases ${calls} times`);
      else if (asked > firstUse) wrong.push(`${file}: reports recipients after it has made a sandbox`);
    }
    expect(wrong).toEqual([]);
  });
});
