import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ALIASES, type Alias, type CorpusConfig, corpusRecord, defaultConfig, parseCorpusConfig, privacyError, readCorpusConfig, resolveCorpora, rewriteConfig, writeRewriteConfig } from "./corpus.ts";
import { type ModelEntry, resolveModel } from "./models.ts";

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
const putJson = (file: string, value: unknown): string => put(file, `${JSON.stringify(value)}\n`);
const messageOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "did not throw";
};

const SEED = "18446744073709551615";
const REWRITE: CorpusConfig = { kind: "rewrite", private: false, seed: SEED, generated: "assets/generated.json" };

describe("the corpus config", () => {
  test("an own corpus and a rewrite are read as written", () => {
    expect(parseCorpusConfig({ kind: "own", private: true }, "c.json")).toEqual({ kind: "own", private: true });
    expect(parseCorpusConfig({ kind: "own", private: false }, "c.json")).toEqual({ kind: "own", private: false });
    expect(parseCorpusConfig(REWRITE, "c.json")).toEqual(REWRITE);
  });

  test("anything that is not sound is refused with what is wrong, and an unknown key is one", () => {
    const refusals: [unknown, string][] = [
      [[], "c.json: must hold an object"],
      [null, "c.json: must hold an object"],
      [{ kind: "own", private: true, privat: true }, 'c.json: unknown key "privat". The keys of a corpus config are kind, private, seed, generated'],
      [{ kind: "own", private: true, api_key: "k" }, 'c.json: unknown key "api_key". The keys of a corpus config are kind, private, seed, generated'],
      [{ private: true }, 'c.json: kind must be "rewrite" or "own"'],
      [{ kind: "public", private: false }, 'c.json: kind must be "rewrite" or "own"'],
      [{ kind: "own" }, "c.json: private must be true or false"],
      [{ kind: "own", private: "yes" }, "c.json: private must be true or false"],
      [{ kind: "own", private: true, seed: "1" }, 'c.json: only a "rewrite" has a seed and a generated.json'],
      [{ kind: "rewrite", private: false, generated: "generated.json" }, 'c.json: a "rewrite" needs seed, an integer from 0 to 18446744073709551615 written as text'],
      [{ kind: "rewrite", private: false, seed: 42, generated: "generated.json" }, 'c.json: a "rewrite" needs seed, an integer from 0 to 18446744073709551615 written as text'],
      [{ kind: "rewrite", private: false, seed: "18446744073709551616", generated: "generated.json" }, 'c.json: a "rewrite" needs seed, an integer from 0 to 18446744073709551615 written as text'],
      [{ kind: "rewrite", private: false, seed: "-1", generated: "generated.json" }, 'c.json: a "rewrite" needs seed, an integer from 0 to 18446744073709551615 written as text'],
      [{ kind: "rewrite", private: false, seed: "1" }, 'c.json: a "rewrite" needs generated, the path of its generated.json from this file, with no .. in it'],
      [{ kind: "rewrite", private: false, seed: "1", generated: "../generated.json" }, 'c.json: a "rewrite" needs generated, the path of its generated.json from this file, with no .. in it'],
      [{ kind: "rewrite", private: false, seed: "1", generated: "/etc/generated.json" }, 'c.json: a "rewrite" needs generated, the path of its generated.json from this file, with no .. in it'],
      [{ kind: "rewrite", private: false, seed: "1", generated: "C:\\generated.json" }, 'c.json: a "rewrite" needs generated, the path of its generated.json from this file, with no .. in it'],
    ];
    for (const [json, message] of refusals) expect([JSON.stringify(json), messageOf(() => parseCorpusConfig(json, "c.json"))]).toEqual([JSON.stringify(json), message]);
  });

  test("the reader names a file that is not JSON, and a rewrite whose generated.json is missing or holds another seed", () => {
    const dir = temp();
    const bad = put(join(dir, "bad", "corpus.json"), "{ not json");
    expect(messageOf(() => readCorpusConfig(bad)).startsWith(`${bad} is not JSON (`)).toBe(true);

    const file = putJson(join(dir, "a", "corpus.json"), REWRITE);
    expect(messageOf(() => readCorpusConfig(file))).toBe(`${file}: assets/generated.json is missing or holds no seed, so the rewrite it describes is not there. Make it again with ./generate-assets`);
    putJson(join(dir, "a", "assets", "generated.json"), { seed: "7", inputs_sha256: "x" });
    expect(messageOf(() => readCorpusConfig(file))).toBe(`${file}: seed is ${SEED}, but assets/generated.json says 7, so the assets were made again since. Run ./generate-assets again`);
    putJson(join(dir, "a", "assets", "generated.json"), { seed: SEED, inputs_sha256: "x" });
    expect(readCorpusConfig(file)).toEqual(REWRITE);
  });

  test("a config that is missing is private for an own corpus and not for a rewrite", () => {
    expect(defaultConfig("own")).toEqual({ kind: "own", private: true });
    expect(defaultConfig("rewrite")).toEqual({ kind: "rewrite", private: false });
  });
});

describe("the config of a rewrite generate made", () => {
  test("is found where the eval's generate puts generated.json: in assets/ (retrieval, judge-gate, agent-ab) or beside it (the others)", () => {
    const dir = temp();
    expect(rewriteConfig(dir)).toBeUndefined();
    putJson(join(dir, "generated.json"), { seed: "5" });
    expect(rewriteConfig(dir)).toEqual({ kind: "rewrite", private: false, seed: "5", generated: "generated.json" });
    putJson(join(dir, "assets", "generated.json"), { seed: "6" });
    expect(rewriteConfig(dir)).toEqual({ kind: "rewrite", private: false, seed: "6", generated: "assets/generated.json" });
  });

  test("a generated.json with no seed, or a seed that is not a seed, is not one", () => {
    const dir = temp();
    putJson(join(dir, "generated.json"), { inputs_sha256: "x" });
    expect(rewriteConfig(dir)).toBeUndefined();
    putJson(join(dir, "generated.json"), { seed: "forty-two" });
    expect(rewriteConfig(dir)).toBeUndefined();
    put(join(dir, "generated.json"), "not json");
    expect(rewriteConfig(dir)).toBeUndefined();
  });

  test("writeRewriteConfig writes corpus.json beside the assets, replaces an old one, and leaves nothing else", () => {
    const dir = temp();
    putJson(join(dir, "assets", "generated.json"), { seed: SEED });
    expect(writeRewriteConfig(dir)).toEqual(REWRITE);
    expect(JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8"))).toEqual(REWRITE);
    expect(readdirSync(dir).sort()).toEqual(["assets", "corpus.json"]);
    putJson(join(dir, "assets", "generated.json"), { seed: "9" });
    expect(writeRewriteConfig(dir).seed).toBe("9");
    expect(JSON.parse(readFileSync(join(dir, "corpus.json"), "utf8")).seed).toBe("9");
    put(join(dir, "corpus.json"), "not json");
    expect(writeRewriteConfig(dir).seed).toBe("9");
    expect(readCorpusConfig(join(dir, "corpus.json"))).toEqual({ ...REWRITE, seed: "9" });
  });

  test("a corpus.json that says private: true stays private when the assets are made again", () => {
    const dir = temp();
    putJson(join(dir, "generated.json"), { seed: "3" });
    putJson(join(dir, "corpus.json"), { kind: "rewrite", private: true, seed: "2", generated: "generated.json" });
    expect(writeRewriteConfig(dir)).toEqual({ kind: "rewrite", private: true, seed: "3", generated: "generated.json" });
  });

  test("refuses a folder with no generated.json", () => {
    const dir = temp();
    expect(messageOf(() => writeRewriteConfig(dir))).toBe(`${dir} has no generated.json with a seed (assets/generated.json or generated.json), so there is no rewrite to describe`);
    expect(existsSync(join(dir, "corpus.json"))).toBe(false);
  });
});

describe("resolveCorpora", () => {
  const PUBLIC = "/checkout/evals/retrieval/assets";
  /** A run of the eval `retrieval` in a temporary repository root. `warnings` collects the lines printed. */
  const setup = () => {
    const root = temp();
    const warnings: string[] = [];
    const resolveIn = (values: { corpus?: string; cases?: string }, extra: { default?: "rewrite" | "own"; aliases?: Record<string, Alias>; eval?: string } = {}) =>
      resolveCorpora({ eval: extra.eval ?? "retrieval", values, publicFolder: PUBLIC, default: extra.default ?? "rewrite", aliases: extra.aliases, root, warn: (line) => warnings.push(line) });
    return { root, warnings, resolveIn };
  };

  test("public is the default, and it is not private", () => {
    const { root, warnings, resolveIn } = setup();
    expect(resolveIn({})).toEqual([{ name: "public", folder: PUBLIC, config: { kind: "public", private: false }, configFile: null, flag: "--corpus public" }]);
    expect(resolveIn({ corpus: "public" })).toEqual(resolveIn({}));
    expect(warnings).toEqual([]);
    expect(existsSync(join(root, "private"))).toBe(false);
  });

  test("custom reads the default of the eval: the rewrite at private/<eval>/assets, or own at private/<eval>/own", () => {
    const { root, resolveIn } = setup();
    const rewrite = resolveIn({ corpus: "custom" });
    expect(rewrite).toEqual([{ name: "custom", folder: join(root, "private", "retrieval", "assets"), config: { kind: "rewrite", private: false }, configFile: null, flag: "--corpus custom" }]);
    const own = resolveIn({ corpus: "custom" }, { default: "own" });
    expect(own).toEqual([{ name: "custom", folder: join(root, "private", "retrieval", "own"), config: { kind: "own", private: true }, configFile: null, flag: "--corpus custom" }]);
  });

  test("the config of a rewrite is private/<eval>/corpus.json beside its assets, or else the seed in the generated.json found there", () => {
    const { root, resolveIn } = setup();
    const priv = join(root, "private", "retrieval");
    putJson(join(priv, "assets", "generated.json"), { seed: "11" });
    expect(resolveIn({ corpus: "custom" })[0].config).toEqual({ kind: "rewrite", private: false, seed: "11", generated: "assets/generated.json" });
    expect(resolveIn({ corpus: "custom" })[0].configFile).toBeNull();
    writeRewriteConfig(priv);
    const [c] = resolveIn({ corpus: "custom" });
    expect(c.config).toEqual({ kind: "rewrite", private: false, seed: "11", generated: "assets/generated.json" });
    expect(c.configFile).toBe(join(priv, "corpus.json"));
  });

  test("--cases DIR alone is a custom corpus. DIR is from the repository root, and corpus.json is read from DIR", () => {
    const { root, warnings, resolveIn } = setup();
    expect(resolveIn({ cases: "notes" })).toEqual([{ name: "custom", folder: join(root, "notes"), config: { kind: "own", private: true }, configFile: null, flag: "--cases notes" }]);
    putJson(join(root, "notes", "corpus.json"), { kind: "own", private: false });
    expect(resolveIn({ cases: "notes" })).toEqual([{ name: "custom", folder: join(root, "notes"), config: { kind: "own", private: false }, configFile: join(root, "notes", "corpus.json"), flag: "--cases notes" }]);
    expect(resolveIn({ corpus: "custom", cases: join(root, "notes") })[0].folder).toBe(join(root, "notes"));
    expect(warnings).toEqual([]);
  });

  test("a folder called assets takes the corpus.json beside it, and the one inside it wins", () => {
    const { root, resolveIn } = setup();
    putJson(join(root, "mine", "corpus.json"), { kind: "own", private: false });
    expect(resolveIn({ cases: "mine/assets" })[0].config).toEqual({ kind: "own", private: false });
    putJson(join(root, "mine", "assets", "corpus.json"), { kind: "own", private: true });
    expect(resolveIn({ cases: "mine/assets" })[0].config).toEqual({ kind: "own", private: true });
  });

  test("no other folder takes a corpus.json from the one above it: own notes next to a rewrite stay private", () => {
    const { root, resolveIn } = setup();
    const priv = join(root, "private", "retrieval");
    putJson(join(priv, "assets", "generated.json"), { seed: "11" });
    writeRewriteConfig(priv);
    expect(readCorpusConfig(join(priv, "corpus.json")).private).toBe(false);
    const own = resolveIn({ corpus: "custom", cases: "private/retrieval/own" })[0];
    expect(own.config).toEqual({ kind: "own", private: true });
    expect(own.configFile).toBeNull();
    expect(resolveIn({ cases: "private/retrieval/assets/library" })[0].config).toEqual({ kind: "own", private: true });
  });

  test("all is public and then the default custom corpus, or the folder of --cases", () => {
    const { root, resolveIn } = setup();
    expect(resolveIn({ corpus: "all" }).map((c) => [c.name, c.folder, c.flag])).toEqual([
      ["public", PUBLIC, "--corpus public"],
      ["custom", join(root, "private", "retrieval", "assets"), "--corpus all"],
    ]);
    expect(resolveIn({ corpus: "all", cases: "notes" }).map((c) => [c.name, c.folder, c.flag])).toEqual([
      ["public", PUBLIC, "--corpus public"],
      ["custom", join(root, "notes"), "--cases notes"],
    ]);
    expect(resolveIn({ corpus: "all" }, { default: "own" })[1].folder).toBe(join(root, "private", "retrieval", "own"));
  });

  test("--corpus private and --corpus own still work, each with a line that names the new form", () => {
    const { root, warnings, resolveIn } = setup();
    const priv = resolveIn({ corpus: "private" });
    expect(priv).toEqual([{ name: "custom", folder: join(root, "private", "retrieval", "assets"), config: { kind: "rewrite", private: false }, configFile: null, flag: "--corpus private" }]);
    expect(warnings).toEqual(["retrieval: --corpus private is now --corpus custom. The old value works for one more release."]);
    warnings.length = 0;
    const own = resolveIn({ corpus: "own" });
    expect(own).toEqual([{ name: "custom", folder: join(root, "private", "retrieval", "own"), config: { kind: "own", private: true }, configFile: null, flag: "--corpus own" }]);
    expect(warnings).toEqual(["retrieval: --corpus own is now --corpus custom --cases private/retrieval/own. The old value works for one more release."]);
  });

  test("the new form of an alias is --corpus custom when the eval's default is that corpus, and its other aliases are named too", () => {
    const { root, warnings, resolveIn } = setup();
    resolveIn({ corpus: "own" }, { default: "own", eval: "promotion", aliases: { own: ALIASES.own } });
    expect(warnings).toEqual(["promotion: --corpus own is now --corpus custom. The old value works for one more release."]);
    warnings.length = 0;
    const feedback = resolveIn({ corpus: "own-feedback" }, { eval: "distill", aliases: { ...ALIASES, "own-feedback": { folder: "own/assets-feedback", kind: "own" } } });
    expect(warnings).toEqual(["distill: --corpus own-feedback is now --corpus custom --cases private/distill/own/assets-feedback. The old value works for one more release."]);
    expect(feedback[0].folder).toBe(join(root, "private", "distill", "own", "assets-feedback"));
  });

  test("--corpus own --cases DIR, which promotion took, reads DIR as an own corpus. No other old value takes --cases", () => {
    const { root, warnings, resolveIn } = setup();
    const [c] = resolveIn({ corpus: "own", cases: "night" });
    expect([c.name, c.folder, c.config, c.flag]).toEqual(["custom", join(root, "night"), { kind: "own", private: true }, "--corpus own --cases night"]);
    expect(warnings).toEqual(["retrieval: --corpus own is now --corpus custom --cases night. The old value works for one more release."]);
    expect(messageOf(() => resolveIn({ corpus: "private", cases: "night" }))).toBe("--cases is a custom corpus: it does not go with --corpus private. Use --corpus custom --cases DIR");
  });

  test("a value that is not a corpus, --cases with public, and an empty --cases are refused", () => {
    const { resolveIn } = setup();
    expect(messageOf(() => resolveIn({ corpus: "bogus" }))).toBe('--corpus must be public, custom or all, not "bogus"');
    expect(messageOf(() => resolveIn({ corpus: "constructor" }))).toBe('--corpus must be public, custom or all, not "constructor"');
    expect(messageOf(() => resolveIn({ corpus: "private" }, { aliases: { own: ALIASES.own } }))).toBe('--corpus must be public, custom or all, not "private"');
    expect(messageOf(() => resolveIn({ corpus: "public", cases: "notes" }))).toBe("--cases is a custom corpus: use it alone, or with --corpus custom");
    expect(messageOf(() => resolveIn({ cases: "  " }))).toBe("--cases needs a folder");
  });

  test("a corpus.json that is not sound ends the run with fail, and names the file", () => {
    const { root } = setup();
    const file = putJson(join(root, "notes", "corpus.json"), { kind: "own", private: true, privat: false });
    const stopped: string[] = [];
    const run = () =>
      resolveCorpora({
        eval: "retrieval",
        values: { cases: "notes" },
        publicFolder: PUBLIC,
        default: "rewrite",
        root,
        fail: (message) => {
          stopped.push(message);
          throw new Error("stopped");
        },
      });
    expect(messageOf(run)).toBe("stopped");
    expect(stopped).toEqual([`${file}: unknown key "privat". The keys of a corpus config are kind, private, seed, generated`]);
  });
});

describe("the privacy guard", () => {
  const GATEWAY = "https://gateway.example/v1";
  const ENV = { MODEL_BASE_URL: GATEWAY, MODEL_API_KEY: "gw-key", MODEL_NAME: "my-model" };
  const entries: Record<string, ModelEntry> = { mine: { base_url: "http://localhost:8080/v1", private: true }, other: { base_url: "https://api.example.com/v1" } };
  const model = (id: string, role: "model" | "judge" = "model") => resolveModel(role, id, ENV, entries);

  const corpora = (config: CorpusConfig, configFile: string | null = null, flag = "--cases notes") => [
    { name: "public" as const, folder: "/p", config: { kind: "public" as const, private: false }, configFile: null, flag: "--corpus public" },
    { name: "custom" as const, folder: "/c", config, configFile, flag },
  ];

  test("a private corpus refuses a model that models.json does not mark private, and says why and what to do", () => {
    expect(privacyError(corpora(defaultConfig("own")), { model: model("other") })).toBe(
      '--cases notes sends your notes to other, which is not marked "private": true in models.json. The corpus is private: it has no corpus.json, and an own corpus without one is private. Mark the model in models.json if you run it or its provider does not keep or train on what it gets, or choose another with --model.',
    );
    expect(privacyError(corpora(defaultConfig("own")), { model: model("my-model") })).toContain('sends your notes to my-model, which is not marked "private": true in models.json.');
    expect(privacyError(corpora(defaultConfig("own")), { model: model("mine") })).toBeUndefined();
  });

  test("it names the corpus.json that says private, and the noun the eval gives", () => {
    expect(privacyError(corpora({ kind: "rewrite", private: true, seed: "1", generated: "generated.json" }, "/x/corpus.json", "--corpus custom"), { model: model("other") }, "memories")).toBe(
      '--corpus custom sends your memories to other, which is not marked "private": true in models.json. The corpus is private: /x/corpus.json says "private": true. Mark the model in models.json if you run it or its provider does not keep or train on what it gets, or choose another with --model.',
    );
  });

  test("a judge is refused too, even when the model is marked", () => {
    expect(privacyError(corpora(defaultConfig("own")), { model: model("mine"), judge: model("other", "judge") })).toBe(
      '--cases notes sends your notes to the judge other, which is not marked "private": true in models.json. The corpus is private: it has no corpus.json, and an own corpus without one is private. Mark the judge in models.json if you run it or its provider does not keep or train on what it gets, or choose another with --judge-model.',
    );
    expect(privacyError(corpora(defaultConfig("own")), { model: model("mine"), judge: model("mine", "judge") })).toBeUndefined();
    expect(privacyError(corpora(defaultConfig("own")), { judge: model("other", "judge") })?.startsWith("--cases notes sends your notes to the judge other,")).toBe(true);
  });

  test("a corpus that is not private lets any model through: the public cases, a rewrite, and an own corpus whose corpus.json says private: false", () => {
    const unmarked = { model: model("other"), judge: model("other", "judge") };
    expect(privacyError(corpora({ kind: "public", private: false }).slice(0, 1), unmarked)).toBeUndefined();
    expect(privacyError(corpora(defaultConfig("rewrite")), unmarked)).toBeUndefined();
    expect(privacyError(corpora({ kind: "own", private: false }, "/x/corpus.json"), unmarked)).toBeUndefined();
  });

  test("--corpus all refuses the whole run when its custom corpus is private", () => {
    expect(privacyError(corpora(defaultConfig("own"), null, "--corpus all"), { model: model("other") })?.startsWith("--corpus all sends your notes to other,")).toBe(true);
  });

  test("an old --corpus own is guarded as the custom corpus it is", () => {
    const root = temp();
    const resolved = resolveCorpora({ eval: "promotion", values: { corpus: "own" }, publicFolder: "/p", default: "own", aliases: { own: ALIASES.own }, root, warn: () => {} });
    expect(privacyError(resolved, { model: model("other") })?.startsWith("--corpus own sends your notes to other,")).toBe(true);
    expect(privacyError(resolved, { model: model("mine") })).toBeUndefined();
  });
});

describe("what a summary records", () => {
  test("the name, the kind and the private flag, and never the folder", () => {
    const [pub, custom] = resolveCorpora({ eval: "e", values: { corpus: "all" }, publicFolder: "/p", default: "own", root: temp() });
    expect(corpusRecord(pub)).toEqual({ corpus: "public", corpus_kind: "public", corpus_private: false });
    expect(corpusRecord(custom)).toEqual({ corpus: "custom", corpus_kind: "own", corpus_private: true });
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
  const BESIDE = 'mkdir -p "$out/assets"\nprintf \'{"seed":"%s"}\\n\' "$seed" > "$out/generated.json"';

  test("writes corpus.json beside the assets of each set it made, for generated.json in assets/ and beside it", () => {
    const { root, generate } = repo();
    generate("evals", "nested", NESTED);
    generate("benchmarks", "beside", BESIDE);
    const r = run(root, "--seed", "42");
    expect([r.code, r.err]).toEqual([0, ""]);
    expect(JSON.parse(readFileSync(join(root, "private", "nested", "corpus.json"), "utf8"))).toEqual({ kind: "rewrite", private: false, seed: "42", generated: "assets/generated.json" });
    expect(JSON.parse(readFileSync(join(root, "private", "beside", "corpus.json"), "utf8"))).toEqual({ kind: "rewrite", private: false, seed: "42", generated: "generated.json" });
    // what the run then reads
    expect(readCorpusConfig(join(root, "private", "nested", "corpus.json")).seed).toBe("42");
    const [c] = resolveCorpora({ eval: "beside", values: { corpus: "custom" }, publicFolder: "/p", default: "rewrite", root });
    expect([c.folder, c.configFile, c.config]).toEqual([join(root, "private", "beside", "assets"), join(root, "private", "beside", "corpus.json"), { kind: "rewrite", private: false, seed: "42", generated: "generated.json" }]);
  });

  test("a set made again with another seed gets the new seed, and a corpus.json marked private stays private", () => {
    const { root, generate } = repo();
    generate("evals", "nested", NESTED);
    expect(run(root, "--seed", "1").code).toBe(0);
    const file = join(root, "private", "nested", "corpus.json");
    putJson(file, { ...JSON.parse(readFileSync(file, "utf8")), private: true });
    expect(run(root, "--seed", "2").code).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ kind: "rewrite", private: true, seed: "2", generated: "assets/generated.json" });
    expect(readdirSync(join(root, "private", "nested")).sort()).toEqual(["assets", "corpus.json"]);
  });

  test("a generate that fails gets no corpus.json, and one that makes no generated.json fails the run", () => {
    const { root, generate } = repo();
    generate("evals", "broken", "exit 1");
    generate("evals", "nofile", 'mkdir -p "$out/assets"');
    generate("evals", "fine", NESTED);
    const r = run(root, "--seed", "42");
    expect(r.code).toBe(1);
    expect(r.err).toContain(`generate-assets: ${join("evals", "nofile", "generate")} made the assets, but private/nofile/corpus.json could not be written for them\n`);
    expect(r.err).toContain("generate-assets: failed: broken nofile\n");
    expect(existsSync(join(root, "private", "broken", "corpus.json"))).toBe(false);
    expect(existsSync(join(root, "private", "nofile", "corpus.json"))).toBe(false);
    expect(existsSync(join(root, "private", "fine", "corpus.json"))).toBe(true);
  });
});
