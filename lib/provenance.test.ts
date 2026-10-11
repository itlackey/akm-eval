import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { engineConfig } from "./akm/akm.ts";
import { engineSettings, redactConfig, sha256File, sha256Files, sha256Text } from "./provenance.ts";

const dirs: string[] = [];
const files = (contents: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpdir(), "provenance-test-"));
  dirs.push(dir);
  return Object.fromEntries(Object.entries(contents).map(([name, text]) => [name, (writeFileSync(join(dir, name), text), join(dir, name))]));
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("sha256Text and sha256File", () => {
  test("are the hex SHA-256 of the text, and of the file's bytes", () => {
    expect(sha256Text("abc")).toBe(ABC);
    expect(sha256Text("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256File(files({ "a.txt": "abc" })["a.txt"])).toBe(ABC);
  });

  test("a file that is not there throws", () => {
    expect(() => sha256File(join(tmpdir(), "no-such-file-for-provenance"))).toThrow();
  });
});

describe("sha256Files", () => {
  test("does not depend on the order of the paths", () => {
    const f = files({ "a.txt": "one", "b.txt": "two", "c.txt": "three" });
    expect(sha256Files([f["c.txt"], f["a.txt"], f["b.txt"]])).toBe(sha256Files([f["a.txt"], f["b.txt"], f["c.txt"]]));
  });

  test("changes with a file's content, with a path, and with a file added or dropped", () => {
    const f = files({ "a.txt": "one", "b.txt": "two", "c.txt": "one" });
    const both = sha256Files([f["a.txt"], f["b.txt"]]);
    expect(sha256Files([f["c.txt"], f["b.txt"]])).not.toBe(both); // same content, other path
    expect(sha256Files([f["a.txt"]])).not.toBe(both);
    writeFileSync(f["b.txt"], "other");
    expect(sha256Files([f["a.txt"], f["b.txt"]])).not.toBe(both);
  });

  test("tells where one file ends from where the next begins, and is a digest of nothing for no files", () => {
    const f = files({ "a.txt": "ab", "b.txt": "c", "c.txt": "a", "d.txt": "bc" });
    expect(sha256Files([f["a.txt"], f["b.txt"]])).not.toBe(sha256Files([f["c.txt"], f["d.txt"]]));
    expect(sha256Files([])).toBe(sha256Text(""));
  });
});

describe("redactConfig", () => {
  test("replaces the value under apiKey, api_key, token and secret, in any case, at any depth, and leaves the rest", () => {
    const config = { engines: { m: { apiKey: "sk-1", API_KEY: "sk-2", Token: "t", model: "x", timeoutMs: 5 } }, list: [{ api_key: "k", secret: { inner: "s" }, name: "n" }], token: 7 };
    expect(redactConfig(config)).toEqual({
      engines: { m: { apiKey: "<redacted>", API_KEY: "<redacted>", Token: "<redacted>", model: "x", timeoutMs: 5 } },
      list: [{ api_key: "<redacted>", secret: "<redacted>", name: "n" }],
      token: "<redacted>",
    });
  });

  test("keeps a $VARIABLE reference, which holds no secret, and redacts a value that only looks like one", () => {
    expect(redactConfig({ apiKey: "$MODEL_API_KEY", token: "sk-$ABC", secret: "$ not-a-name", other: "$X" })).toEqual({ apiKey: "$MODEL_API_KEY", token: "<redacted>", secret: "<redacted>", other: "$X" });
  });

  test("does not match a key that only contains the name, and does not change the config it is given", () => {
    const config = { maxTokens: 5, tokenizer: "t", engines: { m: { apiKey: "sk-1" } } };
    const copy = JSON.stringify(config);
    const redacted = redactConfig(config);
    expect(redacted.maxTokens).toBe(5);
    expect(redacted.tokenizer).toBe("t");
    expect(JSON.stringify(config)).toBe(copy);
    expect(redacted.engines).not.toBe(config.engines);
  });
});

describe("engineSettings", () => {
  test("reads the engine that defaults.llmEngine names, with the host of its endpoint alone", () => {
    const config = { engines: { other: { model: "no" }, m: { kind: "llm", model: "the-model", endpoint: "https://user:pw@gateway.example:8443/v1/chat/completions?key=abc", temperature: 0, enableThinking: false, timeoutMs: 600000 } }, defaults: { llmEngine: "m" } };
    expect(engineSettings(config)).toEqual({ engine: "m", model: "the-model", endpoint: "gateway.example:8443", temperature: 0, enableThinking: false, timeoutMs: 600000 });
    expect(JSON.stringify(engineSettings(config))).not.toMatch(/pw|abc|chat/);
  });

  test("reads what engineConfig writes", () => {
    expect(engineSettings(engineConfig("http://localhost:8080/v1", "the-model", true))).toEqual({ engine: "model", model: "the-model", endpoint: "localhost:8080", temperature: null, enableThinking: null, timeoutMs: 600000 });
  });

  test("is null for what the config does not set, or that is not a URL", () => {
    const nulls = { engine: null, model: null, endpoint: null, temperature: null, enableThinking: null, timeoutMs: null };
    expect(engineSettings({})).toEqual(nulls);
    expect(engineSettings(null)).toEqual(nulls);
    expect(engineSettings({ defaults: {}, engines: { m: { model: "x" } } })).toEqual(nulls);
    expect(engineSettings({ defaults: { llmEngine: "gone" }, engines: {} })).toEqual({ ...nulls, engine: "gone" });
    expect(engineSettings({ defaults: { llmEngine: "m" }, engines: { m: { endpoint: "not a url" } } }).endpoint).toBeNull();
    expect(engineSettings({ defaults: { llmEngine: "constructor" }, engines: {} })).toEqual({ ...nulls, engine: "constructor" });
  });
});
