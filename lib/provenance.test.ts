import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { engineConfig } from "./akm/akm.ts";
import { canonical, credentialField, endpointHost, endpointDigest, endpointIdentity, endpointOrigin, engineSettings, redactActors, redactConfig, sameEndpoint, sha256File, sha256Files, sha256Json, sha256Text, withoutEngineSettings } from "./provenance.ts";

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
  test("removes URL credentials from nested fields and arrays without changing the rest of the URL or ordinary strings", () => {
    const url = "https://demo%40user:demo-password@registry.example:8443/bundle?token=demo-token&api%5Fkey=demo-key&branch=main&token=other-token#readme";
    const config = { registry: { url }, urls: [url, "$REGISTRY_URL", "ordinary text", "https://example.com/path?branch=main"] };
    const safe = "https://registry.example:8443/bundle?token=<redacted>&api%5Fkey=<redacted>&branch=main&token=<redacted>#readme";
    expect(redactConfig(config)).toEqual({ registry: { url: safe }, urls: [safe, "$REGISTRY_URL", "ordinary text", "https://example.com/path?branch=main"] });
    expect(config.registry.url).toBe(url);
  });

  test("replaces the value of every credential field (credentialField), in any case, at any depth, and leaves the rest", () => {
    const config = {
      engines: { m: { apiKey: "sk-1", API_KEY: "sk-2", Token: "t", maxTokens: 5, model: "x", endpoint: "https://h.example/v1", timeoutMs: 5 } },
      list: [{ api_key: "k", secret: { inner: "s" }, name: "n" }, ["x-api-key", "kept"]],
      headers: { Authorization: "Bearer b", "Set-Cookie": "c", Accept: "*/*" },
      dbPassword: "p",
    };
    expect(redactConfig(config)).toEqual({
      engines: { m: { apiKey: "<redacted>", API_KEY: "<redacted>", Token: "<redacted>", maxTokens: 5, model: "x", endpoint: "<MODEL_BASE_URL>/v1", timeoutMs: 5 } },
      list: [{ api_key: "<redacted>", secret: "<redacted>", name: "n" }, ["x-api-key", "kept"]],
      headers: { Authorization: "<redacted>", "Set-Cookie": "<redacted>", Accept: "*/*" },
      dbPassword: "<redacted>",
    });
  });

  test("writes the host of every endpoint field as <MODEL_BASE_URL> and keeps its path, whatever the field is called and however deep it is", () => {
    const config = {
      embedding: { provider: "openai", endpoint: "https://embed.example.test/v1/embeddings", model: "e" },
      engines: { m: { endpoint: "http://192.168.0.9:8102/v1/chat/completions?api_key=k", model: "x" } },
      settings: { list: [{ baseUrl: "https://u:p@gw.example:8443/v1" }, { model_endpoint: "http://localhost:8080" }], OPENAI_BASE_URL: "http://lab.internal:1" },
      registries: [{ url: "https://registry.example/index.json" }],
      note: "https://embed.example.test is a string, not an endpoint field",
      endpointNote: 7,
    };
    const shown = redactConfig(config);
    expect(shown).toEqual({
      embedding: { provider: "openai", endpoint: "<MODEL_BASE_URL>/v1/embeddings", model: "e" },
      engines: { m: { endpoint: "<MODEL_BASE_URL>/v1/chat/completions?api_key=<redacted>", model: "x" } },
      settings: { list: [{ baseUrl: "<MODEL_BASE_URL>/v1" }, { model_endpoint: "<MODEL_BASE_URL>" }], OPENAI_BASE_URL: "<MODEL_BASE_URL>" },
      registries: [{ url: "https://registry.example/index.json" }],
      note: "https://embed.example.test is a string, not an endpoint field",
      endpointNote: 7,
    });
    expect(redactConfig(shown)).toEqual(shown); // a config already written this way stays so
  });

  test("keeps a $NAME or ${NAME} reference, which holds no secret, and redacts a value that only looks like one", () => {
    expect(redactConfig({ apiKey: "$MODEL_API_KEY", auth: "${AUTH_VALUE}", token: "sk-$ABC", secret: "$ not-a-name", other: "$X" })).toEqual({ apiKey: "$MODEL_API_KEY", auth: "${AUTH_VALUE}", token: "<redacted>", secret: "<redacted>", other: "$X" });
  });

  test("does not change the config it is given", () => {
    const config = { engines: { m: { apiKey: "sk-1" } } };
    const copy = JSON.stringify(config);
    const redacted = redactConfig(config);
    expect(JSON.stringify(config)).toBe(copy);
    expect(redacted.engines).not.toBe(config.engines);
  });

  test("credentialField is that rule", () => {
    for (const name of ["apiKey", "x-api-key", "--api-key", "accessToken", "client_secret", "password", "Authorization", "SESSION_COOKIE", "OPENAI_API_KEY", "HF_TOKEN", "auth", "GH_PAT", "dbPass", "MYSQL_PWD"]) expect([name, credentialField(name)]).toEqual([name, true]);
    for (const name of ["keyword", "keyboard", "maxTokens", "max_tokens", "tokenizer", "author", "bypass", "path", "model", "DATABASE_URL", "timeoutMs"]) expect([name, credentialField(name)]).toEqual([name, false]);
  });
});

describe("engineSettings", () => {
  const nulls = { model: null, endpoint: null, temperature: null, enableThinking: null, timeoutMs: null };

  test("reads the engine that defaults.llmEngine names, with its endpoint as <MODEL_BASE_URL>: no host, no path, no credentials (#65)", () => {
    const url = "https://user:pw@gateway.example:8443/k-DUMMYSECRET0123/v1/chat/completions?key=abc";
    const config = { engines: { other: { model: "no" }, m: { kind: "llm", model: "the-model", endpoint: url, temperature: 0, enableThinking: false, timeoutMs: 600000 } }, defaults: { llmEngine: "m" } };
    const settings = { model: "the-model", endpoint: "<MODEL_BASE_URL>", temperature: 0, enableThinking: false, timeoutMs: 600000 };
    expect(engineSettings(config)).toEqual({ engine: "m", ...settings, engines: { m: settings } });
    expect(JSON.stringify(engineSettings(config))).not.toMatch(/pw|abc|DUMMYSECRET|k-DUMMY|\/v1|gateway/);
  });

  test("reads what engineConfig writes", () => {
    const settings = { model: "the-model", endpoint: "<MODEL_BASE_URL>", temperature: null, enableThinking: null, timeoutMs: 600000 };
    expect(engineSettings(engineConfig("http://localhost:8080/v1", "the-model", true))).toEqual({ engine: "model", ...settings, engines: { model: settings } });
  });

  test("records every engine the config uses, those a strategy, a process or a gate is routed to, and not one nothing names (R02)", () => {
    const config = {
      defaults: { llmEngine: "m", engine: "agent" },
      engines: {
        m: { model: "a", endpoint: "https://a.example/v1" },
        worker: { model: "w", endpoint: "https://worker.example/deployment-A/v1", temperature: 0.2 },
        judge: { model: "j", endpoint: "https://judge.example/v1", timeoutMs: 5 },
        agent: { model: "ag" },
        unused: { model: "u" },
      },
      improve: { strategies: { night: { engine: "judge", processes: { distill: { engine: "worker" }, reflect: { qualityGate: { engine: "judge" } } } } } },
    };
    const s = engineSettings(config);
    expect(s.engine).toBe("m");
    expect(Object.keys(s.engines)).toEqual(["agent", "judge", "m", "worker"]);
    expect(s.engines.worker).toEqual({ model: "w", endpoint: "<MODEL_BASE_URL>", temperature: 0.2, enableThinking: null, timeoutMs: null });
    // another deployment path of the routed engine on the same host is the same engine: only the host is recorded
    const moved = engineSettings({ ...config, engines: { ...config.engines, worker: { ...config.engines.worker, endpoint: "https://worker.example/deployment-B/v1" } } });
    expect(moved.engines.worker).toEqual(s.engines.worker);
    // the same engines in another order of keys are the same settings
    expect(JSON.stringify(engineSettings({ engines: Object.fromEntries(Object.entries(config.engines).reverse()), improve: config.improve, defaults: config.defaults }))).toBe(JSON.stringify(s));
  });

  test("is null for what the config does not set, or that is not a URL", () => {
    const none = { engine: null, ...nulls, engines: {} };
    expect(engineSettings({})).toEqual(none);
    expect(engineSettings(null)).toEqual(none);
    expect(engineSettings({ defaults: {}, engines: { m: { model: "x" } } })).toEqual(none);
    expect(engineSettings({ defaults: { llmEngine: "gone" }, engines: {} })).toEqual({ ...none, engine: "gone" });
    expect(engineSettings({ defaults: { llmEngine: "m" }, engines: { m: { endpoint: "not a url" } } })).toMatchObject({ endpoint: null });
    expect(engineSettings({ defaults: { llmEngine: "constructor" }, engines: {} })).toEqual({ ...none, engine: "constructor" });
  });
});



describe("endpointIdentity, the sanitized endpoint for corpus destination reporting", () => {
  test("keeps the scheme, host, port and path, so two deployments on one host differ", () => {
    expect(endpointIdentity("https://gateway.example/deployment-A/v1")).toBe("https://gateway.example/deployment-A/v1");
    expect(endpointIdentity("https://gateway.example/deployment-A/v1")).not.toBe(endpointIdentity("https://gateway.example/deployment-B/v1"));
    expect(endpointIdentity("http://localhost:8080/v1/")).toBe("http://localhost:8080/v1");
    expect(endpointIdentity("HTTPS://Gateway.Example/v1")).toBe("https://gateway.example/v1");
  });

  test("drops credentials and the fragment, redacts credential parameters, and orders the query", () => {
    const id = endpointIdentity("https://user:DUMMY_PASS@gateway.example/v1?api_key=DUMMY_QUERY_SECRET&api-version=2024-10#frag");
    expect(id).toBe("https://gateway.example/v1?api-version=2024-10&api_key=<redacted>");
    expect(id).not.toContain("DUMMY");
    expect(endpointIdentity("https://gateway.example/v1?api_key=OTHER&api-version=2024-10")).toBe(id); // a key change alone is the same endpoint
    expect(endpointIdentity("https://gateway.example/v1?api-version=2025-01&api_key=x")).not.toBe(id);
  });

  test("is null for a value that is not a URL", () => {
    for (const v of [undefined, null, "", "  ", "not a url", 42]) expect(endpointIdentity(v)).toBeNull();
  });
});

describe("endpointHost (#65)", () => {
  test("a result records <MODEL_BASE_URL> for an endpoint: no scheme, host, port, path, query or credentials", () => {
    expect(endpointHost("https://user:pw@Gateway.Example:8443/k-DUMMYSECRET0123/v1?api_key=abc#f")).toBe("<MODEL_BASE_URL>");
    expect(endpointHost("http://localhost:8080/v1/")).toBe("<MODEL_BASE_URL>");
    expect(endpointHost("<MODEL_BASE_URL>/chat/completions")).toBe("<MODEL_BASE_URL>"); // an endpoint a redacted config already names so
    for (const v of [undefined, null, "", "not a url", 7]) expect(endpointHost(v)).toBeNull();
  });

  test("endpointOrigin is the scheme, host and port, for what is printed to the person who runs the eval", () => {
    expect(endpointOrigin("https://user:pw@Gateway.Example:8443/k-DUMMYSECRET0123/v1?api_key=abc#f")).toBe("https://gateway.example:8443");
    expect(endpointOrigin("http://localhost:8080/v1/")).toBe("http://localhost:8080");
    for (const v of [undefined, null, "", "not a url", 7]) expect(endpointOrigin(v)).toBeNull();
  });
});

describe("endpointDigest and sameEndpoint", () => {
  const digest = endpointDigest("https://Gateway.Example:8443/v1");

  test("the digest is of the origin only, so a path, a login, a query, a slash or the case of the host do not change it", () => {
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    for (const same of ["https://gateway.example:8443", "https://user:pw@gateway.example:8443/k-DUMMYSECRET/v1/?api_key=abc#f"]) expect(endpointDigest(same)).toBe(digest);
    for (const other of ["https://gateway.example:8444", "http://gateway.example:8443", "https://gateway2.example:8443"]) expect(endpointDigest(other)).not.toBe(digest);
    for (const v of [undefined, null, "", "not a url", "<MODEL_BASE_URL>", 7]) expect(endpointDigest(v)).toBeNull();
  });

  test("a stored digest is compared to the digest now, a stored host by its digest, and <MODEL_BASE_URL> alone is unknown", () => {
    expect(sameEndpoint({ endpoint: "<MODEL_BASE_URL>", endpoint_sha256: digest }, digest)).toBe("same");
    expect(sameEndpoint({ endpoint: "<MODEL_BASE_URL>", endpoint_sha256: digest }, endpointDigest("https://other.example"))).toBe("different");
    expect(sameEndpoint({ endpoint: "https://gateway.example:8443" }, digest)).toBe("same"); // written before the host was hidden
    expect(sameEndpoint({ endpoint: "https://gateway.example:8443" }, endpointDigest("https://other.example"))).toBe("different");
    expect(sameEndpoint({ endpoint: "<MODEL_BASE_URL>" }, digest)).toBe("unknown");
    expect(sameEndpoint({ endpoint: "<MODEL_BASE_URL>", endpoint_sha256: null }, digest)).toBe("unknown");
    expect(sameEndpoint({ endpoint: null }, null)).toBe("same");
    expect(sameEndpoint({ endpoint: null }, digest)).toBe("different");
    expect(sameEndpoint(undefined, digest)).toBe("different");
    expect(sameEndpoint(undefined, null)).toBe("same");
  });
});

describe("canonical and withoutEngineSettings", () => {
  test("the same value gives the same text whatever the order of its keys, and the digest follows", () => {
    expect(canonical({ b: 1, a: [{ d: 2, c: 3 }] })).toBe('{"a":[{"c":3,"d":2}],"b":1}');
    expect(sha256Json({ b: 1, a: 2 })).toBe(sha256Json({ a: 2, b: 1 }));
    expect(canonical(undefined)).toBe("null");
  });

  test("leaves out the settings of the model from every engine, and nothing else", () => {
    const config = { semanticSearchMode: "off", engines: { m: { kind: "llm", provider: "openai", model: "x", endpoint: "https://h.example/v1", temperature: 0, enableThinking: false, timeoutMs: 5, apiKey: "$K" } } };
    expect(withoutEngineSettings(config)).toEqual({ semanticSearchMode: "off", engines: { m: { kind: "llm", provider: "openai", apiKey: "$K" } } });
  });
});

describe("redactActors", () => {
  test("writes every human:<login> actor id as human:<user>, at any depth, and leaves the rest of the text alone", () => {
    const note = "---\ngenerated:\n  by: human:alice\n  at: 2026-10-21T07:29:43.823Z\nverified:\n  by: \"human:jane.doe@example\"\n---\nbody by agent:opencode, not human\n";
    expect(redactActors({ before: note, proposals: [{ content: note }], n: 3, none: null, ok: true })).toEqual({
      before: note.replace("human:alice", "human:<user>").replace("human:jane.doe@example", "human:<user>"),
      proposals: [{ content: note.replace("human:alice", "human:<user>").replace("human:jane.doe@example", "human:<user>") }],
      n: 3,
      none: null,
      ok: true,
    });
    expect(JSON.stringify(redactActors({ x: ["by: human:alice\n"] }))).not.toContain("alice");
  });

  test("is idempotent, and an actor that is not a human stays", () => {
    const once = redactActors("by: human:unknown, then agent:opencode and system:akm");
    expect(once).toBe("by: human:<user>, then agent:opencode and system:akm");
    expect(redactActors(once)).toBe(once);
  });
});
