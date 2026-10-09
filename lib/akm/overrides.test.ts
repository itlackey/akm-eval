import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { OVERRIDE_OPTIONS, defaultOverrides, deepMerge, loadConfigPatch, overrideSummary, overridesUsage, parseOverrides, patchedConfig } from "./overrides.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "overrides-test-"));
  dirs.push(d);
  return d;
};
const fail = (message: string): never => {
  throw new Error(message);
};

describe("deepMerge", () => {
  test("merges objects and replaces arrays and scalars, as akm's own config merge does", () => {
    const base = { a: { x: 1, y: { z: 1 }, list: [1, 2, 3] }, keep: "k", scalar: 1 };
    const patch = { a: { y: { w: 2 }, list: [9] }, scalar: { now: "an object" }, added: true };
    expect(deepMerge(base, patch)).toEqual({ a: { x: 1, y: { z: 1, w: 2 }, list: [9] }, keep: "k", scalar: { now: "an object" }, added: true });
  });

  test("a null in the patch replaces the value, and a patch value that is not an object replaces an object", () => {
    expect(deepMerge({ a: { b: 1 }, c: { d: 1 } }, { a: null, c: "gone" })).toEqual({ a: null, c: "gone" });
  });

  test("changes neither input, and the result shares nothing with them", () => {
    const base = { a: { list: [{ n: 1 }] } };
    const patch = { b: { list: [{ n: 2 }] } };
    const out = deepMerge(base, patch) as { a: { list: { n: number }[] }; b: { list: { n: number }[] } };
    out.a.list[0]!.n = 99;
    out.b.list[0]!.n = 99;
    expect(base).toEqual({ a: { list: [{ n: 1 }] } });
    expect(patch).toEqual({ b: { list: [{ n: 2 }] } });
  });

  test("refuses a key that would reach the prototype", () => {
    expect(() => deepMerge({}, JSON.parse('{"__proto__": {"polluted": true}}'))).toThrow("unsafe key");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("loadConfigPatch", () => {
  test("reads a file from the root, with its path from the root and the SHA-256 of its bytes", () => {
    const root = tmp();
    mkdirSync(join(root, "patches"));
    const text = '{ "improve": { "strategies": { "x": { "engine": "model" } } } }\n';
    writeFileSync(join(root, "patches", "x.json"), text);
    expect(loadConfigPatch("patches/x.json", root)).toEqual({ path: "patches/x.json", sha256: createHash("sha256").update(text).digest("hex"), patch: { improve: { strategies: { x: { engine: "model" } } } } });
  });

  test("an absolute path inside the root is recorded relative to it, and one outside it with the ../ that leads there", () => {
    const root = tmp();
    const outside = tmp();
    writeFileSync(join(root, "a.json"), "{}");
    writeFileSync(join(outside, "b.json"), "{}");
    expect(loadConfigPatch(join(root, "a.json"), root).path).toBe("a.json");
    expect(loadConfigPatch(join(outside, "b.json"), root).path.startsWith("../")).toBe(true);
  });

  test("says what is wrong with a file that is missing, is not JSON, or is not an object", () => {
    const root = tmp();
    writeFileSync(join(root, "bad.json"), "{ nope");
    writeFileSync(join(root, "list.json"), "[1]");
    expect(() => loadConfigPatch("missing.json", root)).toThrow(`--config-patch: cannot read ${join(root, "missing.json")}`);
    expect(() => loadConfigPatch("bad.json", root)).toThrow("is not JSON");
    expect(() => loadConfigPatch("list.json", root)).toThrow("must hold a JSON object");
  });
});

describe("parseOverrides", () => {
  const parse = (args: string[]) => parseArgs({ args, options: OVERRIDE_OPTIONS, strict: true }).values;

  test("without the flags, the eval's own strategy and no patch", () => {
    expect(parseOverrides(parse([]), "reflect-only", fail)).toEqual(defaultOverrides("reflect-only"));
    expect(parseOverrides(parse([]), "reflect-only", fail)).toEqual({ strategy: "reflect-only", configPatch: null });
  });

  test("--strategy replaces the strategy, and --config-patch loads the file from the root", () => {
    const root = tmp();
    writeFileSync(join(root, "p.json"), '{"a":1}');
    const o = parseOverrides(parse(["--strategy", " thorough ", "--config-patch", "p.json"]), "default", fail, root);
    expect(o.strategy).toBe("thorough");
    expect(o.configPatch).toMatchObject({ path: "p.json", patch: { a: 1 } });
  });

  test("ends the run through fail for an empty strategy and for a patch it cannot use", () => {
    expect(() => parseOverrides(parse(["--strategy", "  "]), "default", fail)).toThrow("--strategy needs a strategy name");
    expect(() => parseOverrides(parse(["--config-patch", "no-such-patch.json"]), "default", fail, tmp())).toThrow("--config-patch: cannot read");
  });

  test("a flag without its value is a parse error, and the usage text names the eval's default", () => {
    expect(() => parse(["--strategy"])).toThrow();
    expect(overridesUsage("reflect-only")).toContain("in place of reflect-only");
  });
});

describe("patchedConfig and overrideSummary", () => {
  test("without a patch the config is returned as it is, and with one the patch is merged into it", () => {
    const config = { engines: { m: { model: "a" } }, defaults: { improveStrategy: "s" } };
    expect(patchedConfig(config, defaultOverrides("s"))).toBe(config);
    const o = { strategy: "s", configPatch: { path: "p.json", sha256: "abc", patch: { engines: { m: { model: "b" } }, extra: [1] } } };
    expect(patchedConfig(config, o)).toEqual({ engines: { m: { model: "b" } }, defaults: { improveStrategy: "s" }, extra: [1] });
    expect(config.engines.m.model).toBe("a");
  });

  test("the summary fields are the strategy and the patch's path and SHA-256, without the patch itself", () => {
    expect(overrideSummary(defaultOverrides("default"))).toEqual({ strategy: "default", config_patch: null });
    expect(overrideSummary({ strategy: "x", configPatch: { path: "p.json", sha256: "abc", patch: { big: true } } })).toEqual({ strategy: "x", config_patch: { path: "p.json", sha256: "abc" } });
  });
});
