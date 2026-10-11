import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { engineConfig } from "./akm/akm.ts";
import { engineSettings, harnessSha256, redactConfig, sha256File, sha256Files, sha256Text } from "./provenance.ts";

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

describe("redactConfig and the credentials of an export", () => {
  const LEAKS = ["DUMMY_QUERY_SECRET", "DUMMY_USER_PASSWORD", "DUMMY_HEADER_SECRET", "DUMMY_FRAGMENT_SECRET", "DUMMY_PAIR_SECRET", "DUMMY_NAMED_SECRET", "DUMMY_LINE_SECRET", "DUMMY_OAUTH_SECRET"];
  const noLeaks = (value: unknown) => {
    const text = JSON.stringify(value);
    for (const leak of LEAKS) expect(text).not.toContain(leak);
  };

  test("an endpoint loses its user name and password, and the value of every authentication parameter of its query, and keeps scheme, host, port, path and the rest of the query", () => {
    const endpoint = "https://user:DUMMY_USER_PASSWORD@gateway.example:8443/v1/chat/completions?api_key=DUMMY_QUERY_SECRET&model=m&ok=1#DUMMY_FRAGMENT_SECRET";
    const redacted = redactConfig({ engines: { model: { endpoint, model: "m" } } });
    expect(redacted.engines.model.endpoint).toBe("https://gateway.example:8443/v1/chat/completions?api_key=<redacted>&model=m&ok=1");
    noLeaks(redacted);
    expect(redactConfig("https://gateway.example/v1/chat/completions?api_key=DUMMY_QUERY_SECRET")).toBe("https://gateway.example/v1/chat/completions?api_key=<redacted>");
    expect(redactConfig("https://u:DUMMY_USER_PASSWORD@host.example/")).toBe("https://host.example/");
    expect(redactConfig("https://DUMMY_USER_PASSWORD@host.example/")).toBe("https://host.example/");
    expect(redactConfig("http://localhost:8080/v1/chat/completions")).toBe("http://localhost:8080/v1/chat/completions");
  });

  test("masks api_key, apikey, key, token, access_token, auth, sig, signature, password and secret in a query, in any case, and nothing else", () => {
    const names = ["api_key", "apikey", "key", "token", "access_token", "auth", "sig", "signature", "password", "secret", "API_KEY", "ApiKey", "Access_Token", "SIGNATURE", "X-Amz-Signature", "client_secret"];
    for (const name of names) expect(redactConfig(`https://h.example/p?a=1&${name}=DUMMY_QUERY_SECRET&b=2`)).toBe(`https://h.example/p?a=1&${name}=<redacted>&b=2`);
    expect(redactConfig("https://h.example/p?api%5Fkey=DUMMY_QUERY_SECRET")).toBe("https://h.example/p?api%5Fkey=<redacted>");
    expect(redactConfig("https://h.example/p?model=m&maxTokens=5&tokenizer=t&author=a&design=d")).toBe("https://h.example/p?model=m&maxTokens=5&tokenizer=t&author=a&design=d");
  });

  test("a $NAME reference stays, as the value of a field and of a query parameter", () => {
    expect(redactConfig({ endpoint: "https://h.example/v1?api_key=$MODEL_API_KEY&token=$OTHER_TOKEN", apiKey: "$MODEL_API_KEY", headers: { "X-Api-Key": "$OTHER_KEY", Authorization: "Bearer sk-1" } })).toEqual({
      endpoint: "https://h.example/v1?api_key=$MODEL_API_KEY&token=$OTHER_TOKEN",
      apiKey: "$MODEL_API_KEY",
      headers: { "X-Api-Key": "$OTHER_KEY", Authorization: "<redacted>" },
    });
  });

  test("redacts every engine, not only the default one, and a URL in an array", () => {
    const redacted = redactConfig({
      engines: {
        one: { endpoint: "https://a:DUMMY_USER_PASSWORD@one.example/v1?key=DUMMY_QUERY_SECRET", apiKey: "$ONE_KEY", model: "m1" },
        two: { endpoint: "https://two.example/v1?token=DUMMY_QUERY_SECRET", apiKey: "DUMMY_HEADER_SECRET", model: "m2" },
        three: { nested: [{ deeper: { url: "wss://x:DUMMY_USER_PASSWORD@three.example:9/ws?sig=DUMMY_QUERY_SECRET", password: "DUMMY_HEADER_SECRET" } }] },
      },
      defaults: { llmEngine: "one" },
      registries: ["https://DUMMY_USER_PASSWORD@registry.example/index.json?access_token=DUMMY_QUERY_SECRET", "https://plain.example/index.json"],
    });
    noLeaks(redacted);
    expect(redacted.engines.one).toEqual({ endpoint: "https://one.example/v1?key=<redacted>", apiKey: "$ONE_KEY", model: "m1" });
    expect(redacted.engines.two).toEqual({ endpoint: "https://two.example/v1?token=<redacted>", apiKey: "<redacted>", model: "m2" });
    expect(redacted.engines.three.nested[0].deeper).toEqual({ url: "wss://three.example:9/ws?sig=<redacted>", password: "<redacted>" });
    expect(redacted.registries).toEqual(["https://registry.example/index.json?access_token=<redacted>", "https://plain.example/index.json"]);
    expect(redacted.defaults).toEqual({ llmEngine: "one" });
  });

  test("redacts a credential header however it is written: a field of an object, a line, a pair or a name and value", () => {
    const redacted = redactConfig({
      headers: { Authorization: "Bearer DUMMY_HEADER_SECRET", "X-Api-Key": "DUMMY_HEADER_SECRET", "api-key": "DUMMY_HEADER_SECRET", "Proxy-Authorization": "Basic DUMMY_HEADER_SECRET", Cookie: "s=DUMMY_HEADER_SECRET", "Content-Type": "application/json", Accept: "*/*" },
      extraHeaders: ["Authorization: Bearer DUMMY_LINE_SECRET", "x-api-key=DUMMY_LINE_SECRET", "Accept: */*", ["Authorization", "Bearer DUMMY_PAIR_SECRET"], ["Accept", "text/plain"], { name: "X-Api-Key", value: "DUMMY_NAMED_SECRET" }, { name: "Accept", value: "text/plain" }],
    });
    noLeaks(redacted);
    expect(redacted.headers).toEqual({ Authorization: "<redacted>", "X-Api-Key": "<redacted>", "api-key": "<redacted>", "Proxy-Authorization": "<redacted>", Cookie: "<redacted>", "Content-Type": "application/json", Accept: "*/*" });
    expect(redacted.extraHeaders).toEqual(["Authorization: <redacted>", "x-api-key=<redacted>", "Accept: */*", ["Authorization", "<redacted>"], ["Accept", "text/plain"], { name: "X-Api-Key", value: "<redacted>" }, { name: "Accept", value: "text/plain" }]);
  });

  test("redacts a field whose name ends in key, token, secret or password, in any case, at any depth, and keeps the fields that only contain one", () => {
    const redacted = redactConfig({
      access_token: "DUMMY_OAUTH_SECRET",
      oauth: { clientSecret: "DUMMY_OAUTH_SECRET", client_secret: "DUMMY_OAUTH_SECRET", refreshToken: "DUMMY_OAUTH_SECRET", dbPassword: "DUMMY_OAUTH_SECRET", "X-API-KEY": "DUMMY_OAUTH_SECRET", scope: "read", tokenizer: "t", maxTokens: 5, max_tokens: 6, keyboard: "us", password_hint: "pet" },
      list: [{ apiKey: "DUMMY_OAUTH_SECRET" }, [{ secret: { inner: "DUMMY_OAUTH_SECRET" } }]],
    });
    noLeaks(redacted);
    expect(redacted.access_token).toBe("<redacted>");
    expect(redacted.oauth).toEqual({ clientSecret: "<redacted>", client_secret: "<redacted>", refreshToken: "<redacted>", dbPassword: "<redacted>", "X-API-KEY": "<redacted>", scope: "read", tokenizer: "t", maxTokens: 5, max_tokens: 6, keyboard: "us", password_hint: "pet" });
    expect(redacted.list).toEqual([{ apiKey: "<redacted>" }, [{ secret: "<redacted>" }]]);
  });

  test("a config written to a file holds none of the dummy secrets after it is redacted, and the config it was given is unchanged", () => {
    const config = { engines: { m: { endpoint: "https://u:DUMMY_USER_PASSWORD@h.example/v1?api_key=DUMMY_QUERY_SECRET", headers: { Authorization: "Bearer DUMMY_HEADER_SECRET" } } } };
    const before = JSON.stringify(config);
    noLeaks(redactConfig(config));
    expect(JSON.stringify(config)).toBe(before);
    expect(before).toContain("DUMMY_QUERY_SECRET");
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

describe("harnessSha256", () => {
  const REPO = resolve(import.meta.dir, "..");
  /** A small repository: the shared lib/, two evals, and every kind of file the digest counts or leaves out. */
  const REPOSITORY: Record<string, string> = {
    "lib/a.ts": "export const a = 1;\n",
    "lib/sub/b.ts": "export const b = 2;\n",
    "lib/env.sh": "load_env() { :; }\n",
    "lib/a.test.ts": "test one\n",
    "lib/README.md": "the lib\n",
    "evals/x/src/run.ts": "export const run = 1;\n",
    "evals/x/src/lib.ts": "export const score = 1;\n",
    "evals/x/src/helper.py": "VALUE = 1\n",
    "evals/x/src/lib.test.ts": "test two\n",
    "evals/x/src/test_helper.py": "def test(): pass\n",
    "evals/x/src/fakes.ts": "export const fake = 1;\n",
    "evals/x/src/fixtures/case.ts": "export const fixture = 1;\n",
    "evals/x/src/node_modules/dep/index.ts": "export const dep = 1;\n",
    "evals/x/src/package.json": "{}\n",
    "evals/x/README.md": "the eval\n",
    "evals/y/src/run.ts": "export const other = 1;\n",
  };
  const roots: string[] = [];
  /** The repository above on disk, with `changes` applied: a file's new text. */
  const checkout = (changes: Record<string, string> = {}): string => {
    const root = mkdtempSync(join(tmpdir(), "harness-test-"));
    roots.push(root);
    for (const [path, text] of Object.entries({ ...REPOSITORY, ...changes })) {
      mkdirSync(join(root, dirname(path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  };
  const digest = (root: string, also: string[] = []): string => harnessSha256(join(root, "evals", "x", "src"), { root, also: also.map((dir) => join(root, dir)) });
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });

  test("is one sha256 that does not depend on where the checkout is", () => {
    const [one, two] = [checkout(), checkout()];
    expect(digest(one)).toMatch(/^[0-9a-f]{64}$/);
    expect(digest(two)).toBe(digest(one));
  });

  test("is the same for the code of this repository in two checkout paths, and is the one the runners write", () => {
    const copy = (): string => {
      const root = mkdtempSync(join(tmpdir(), "harness-real-"));
      roots.push(root);
      for (const folder of ["lib", join("evals", "retrieval", "src")]) cpSync(join(REPO, folder), join(root, folder), { recursive: true, filter: (from) => !from.split(sep).includes("node_modules") });
      return root;
    };
    const [one, two] = [copy(), copy()];
    const at = (root: string) => harnessSha256(join(root, "evals", "retrieval", "src"), { root });
    expect(at(two)).toBe(at(one));
    expect(harnessSha256(join(REPO, "evals", "retrieval", "src"))).toBe(at(one));
    expect(harnessSha256(join(REPO, "evals", "distill", "src"))).not.toBe(at(one)); // another eval is another digest
  });

  test("changes with an edit to the eval's own code, to a file of lib/, to lib/env.sh, and with a file added, renamed or dropped", () => {
    const base = digest(checkout());
    const changes: Record<string, string>[] = [
      { "evals/x/src/lib.ts": "export const score = 2;\n" },
      { "evals/x/src/run.ts": "export const run = 2;\n" },
      { "evals/x/src/helper.py": "VALUE = 2\n" },
      { "evals/x/src/new.ts": "export const added = 1;\n" },
      { "lib/a.ts": "export const a = 2;\n" },
      { "lib/sub/b.ts": "export const b = 3;\n" },
      { "lib/env.sh": "load_env() { return 1; }\n" },
      { "lib/added.ts": "export const added = 1;\n" },
    ];
    for (const change of changes) expect(digest(checkout(change))).not.toBe(base);
    const renamed = checkout();
    renameSync(join(renamed, "evals", "x", "src", "lib.ts"), join(renamed, "evals", "x", "src", "scoring.ts"));
    expect(digest(renamed)).not.toBe(base);
    const dropped = checkout();
    rmSync(join(dropped, "lib", "a.ts"));
    expect(digest(dropped)).not.toBe(base);
  });

  test("does not change with an edit to a test, a test double, a fixture, a dependency, a README or a file that is not code", () => {
    const base = digest(checkout());
    const changes: Record<string, string>[] = [
      { "evals/x/src/lib.test.ts": "test edited\n" },
      { "evals/x/src/test_helper.py": "def test(): return 1\n" },
      { "evals/x/src/fakes.ts": "export const fake = 2;\n" },
      { "evals/x/src/fixtures/case.ts": "export const fixture = 2;\n" },
      { "evals/x/src/node_modules/dep/index.ts": "export const dep = 2;\n" },
      { "evals/x/src/package.json": '{"edited":true}\n' },
      { "evals/x/README.md": "the eval, edited\n" },
      { "lib/a.test.ts": "test edited\n" },
      { "lib/README.md": "the lib, edited\n" },
      { "evals/y/src/run.ts": "export const other = 2;\n" },
      { "evals/x/src/new.test.ts": "a test added\n", "lib/new.test.ts": "a test added\n", "evals/x/src/NOTES.md": "notes\n" },
    ];
    for (const change of changes) expect(digest(checkout(change))).toBe(base);
  });

  test("counts the src folders of the evals whose code an eval imports, when it names them", () => {
    const base = digest(checkout(), ["evals/y/src"]);
    expect(base).not.toBe(digest(checkout()));
    expect(digest(checkout({ "evals/y/src/run.ts": "export const other = 2;\n" }), ["evals/y/src"])).not.toBe(base);
    expect(digest(checkout({ "evals/y/src/run.ts": "export const other = 2;\n" }))).toBe(digest(checkout()));
  });

  test("refuses a folder that is not inside the repository", () => {
    const root = checkout();
    expect(() => harnessSha256(tmpdir(), { root })).toThrow("is not inside the repository");
    expect(() => harnessSha256(root, { root })).toThrow("is not inside the repository");
    expect(() => digest(root, ["../elsewhere"])).toThrow("is not inside the repository");
  });

  test("makes the manifest that bakeoff's harness_sha256 makes: path from the root, content digest, sorted (the same digest as in test_bakeoff.py)", () => {
    const root = mkdtempSync(join(tmpdir(), "harness-golden-"));
    roots.push(root);
    const src = join(root, "evals", "bakeoff", "src");
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "helper.py"), "X = 1\n");
    writeFileSync(join(src, "bakeoff.py"), "print('a')\n");
    writeFileSync(join(src, "test_bakeoff.py"), "ignored\n");
    expect(harnessSha256(src, { root })).toBe("aa0d380a5736fa683bc2cb7aa9dec98f860df640d388f41e0a0eeed36a5a5129");
  });
});
