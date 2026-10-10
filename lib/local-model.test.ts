import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isLocalJudge, isLocalModelId, localModelError } from "./local-model.ts";

describe("isLocalJudge", () => {
  const dns = (table: Record<string, string[]>) => async (host: string) => {
    if (!(host in table)) throw new Error(`ENOTFOUND ${host}`);
    return table[host];
  };

  test("takes this machine and the private network, and a name that resolves only there", async () => {
    const resolve = dns({ "gateway.home.arpa": ["192.168.1.50"], "judge.internal": ["10.0.0.7", "172.20.1.1"] });
    for (const url of ["http://localhost:8080/v1", "http://127.0.0.1:8080/v1", "http://[::1]:8080/v1", "http://10.0.0.5/v1", "http://172.16.0.1/v1", "http://172.31.255.254:9000/v1", "http://192.168.1.20:8080/v1/chat/completions", "https://gateway.home.arpa/v1", "http://judge.internal/v1"]) {
      expect([url, await isLocalJudge(url, resolve)]).toEqual([url, true]);
    }
  });

  test("refuses public addresses, names that resolve to any public address, and names that do not resolve", async () => {
    const resolve = dns({ "api.openai.com": ["162.159.140.245"], "localhost.example.com": ["93.184.216.34"], "mixed.example": ["192.168.1.60", "93.184.216.34"] });
    const refused = [
      "https://api.openai.com/v1",
      "http://8.8.8.8/v1",
      "http://11.0.0.1/v1",
      "http://172.15.0.1/v1",
      "http://172.32.0.1/v1",
      "http://192.169.0.1/v1",
      "https://localhost.example.com/v1",
      "http://10.1.2.3.example.com/v1", // does not resolve
      "https://mixed.example/v1", // one public address is enough to refuse
      "http://localhost@example.com/v1", // the host is example.com, which does not resolve here
      "localhost:8080/v1", // no scheme
      "not a url",
      "",
    ];
    for (const url of refused) expect([url, await isLocalJudge(url, resolve)]).toEqual([url, false]);
  });
});


describe("localModelError", () => {
  test("is undefined for a local URL, and otherwise names the flag, the data, the receiver and the variable to fix", async () => {
    expect(await localModelError("http://127.0.0.1:8080/v1", "MODEL_BASE_URL", "--corpus own", "notes", "model")).toBeUndefined();
    const refusal = await localModelError("http://8.8.8.8/v1", "MODEL_BASE_URL", "--corpus own", "notes", "model");
    expect(refusal).toStartWith("--corpus own sends your notes to the model, so MODEL_BASE_URL must be localhost");
  });
});

describe("isLocalModelId", () => {
  test("takes the gateway's local model classes and an id with no backend", () => {
    for (const id of ["chat/qwen3.8-27b", "fast/qwen3.6-35b-a3b", "embed/qwen3-embedding-0.6b", "chat/qwen-27b-q2", "qwen3.6-35b-a3b"]) {
      expect([id, isLocalModelId(id)]).toEqual([id, true]);
    }
  });

  test("refuses every other prefix, the cloud ones, a host-named id and any it does not know", () => {
    for (const id of ["freellm/gpt-oss:120b", "freellm/auto", "openai/gpt-5.6-terra", "anthropic/claude-x", "groq/llama", "chat2/x", "chatty/x", "fast-cloud/x", "rocksteady-4060-gpu0/qwen3.8-27b", "splinter-b70/qwen3.8-27b", "krang-a770/x", "Org/Model-1", "/x", "chat.evil/x", "x/chat/qwen"]) {
      expect([id, isLocalModelId(id)]).toEqual([id, false]);
    }
  });
});

describe("localModelError for a gateway model", () => {
  const url = "http://127.0.0.1:8080/v1"; // the gateway is on the local network, so its URL passes whichever backend an id names
  const ask = (gatewayId?: string) => localModelError(url, "MODEL_BASE_URL", "--corpus own", "notes", "model", gatewayId);

  test("lets a local backend through, and a model with no gateway id (a line of models.json) is judged by its URL alone", async () => {
    expect(await ask("chat/qwen3.8-27b")).toBeUndefined();
    expect(await ask("fast/qwen3.6-35b-a3b")).toBeUndefined();
    expect(await ask(undefined)).toBeUndefined();
  });

  test("refuses a cloud backend behind the local gateway, naming the backend and the flag", async () => {
    const refusal = await ask("freellm/gpt-oss:120b");
    expect(refusal).toStartWith('--corpus own sends your notes to the model, but the gateway sends "freellm/gpt-oss:120b" to freellm');
  });

  test("a local backend does not make a public URL local", async () => {
    expect(await localModelError("http://8.8.8.8/v1", "MODEL_BASE_URL", "--corpus own", "notes", "model", "chat/x")).toContain("must be localhost");
  });
});

describe("every eval that reads your own notes", () => {
  const EVALS = join(import.meta.dir, "..", "evals");
  const runFiles = readdirSync(EVALS).map((name) => ({ name, file: join(EVALS, name, "src", "run.ts") })).filter((r) => existsSync(r.file));
  // An own-style corpus is one a run.ts names by a string of "own" ("own", "own-feedback"), as its corpus or as the private/<eval>/own folder it reads.
  const readsOwn = (source: string) => /["'`]own(-[a-z-]+)?["'`]/.test(source);
  // The evals that read an own corpus and send none of it to a model, so there is nothing to guard. Each says why.
  const NOTHING_SENT = { retrieval: "scores akm's search of your notes with the qrels you labelled: no model sees a note (the labelling tool, label.ts, calls the guard)" } as Record<string, string>;

  test("the scan finds the own corpora, so it cannot pass by finding none", () => {
    const found = runFiles.filter((r) => readsOwn(readFileSync(r.file, "utf8"))).map((r) => r.name);
    for (const name of ["promotion", "distill", "retrieval"]) expect(found).toContain(name);
  });

  test("each calls localModelError, unless it sends none to a model", () => {
    const unguarded = runFiles.filter((r) => {
      const source = readFileSync(r.file, "utf8");
      return readsOwn(source) && !(r.name in NOTHING_SENT) && !source.includes("localModelError(");
    });
    expect(unguarded.map((r) => `${r.name}: reads an own corpus but never calls localModelError (lib/local-model.ts)`)).toEqual([]);
  });

  test("each passes the gateway id of its model to the guard, so a cloud model behind the gateway is refused", () => {
    const blind = runFiles.filter((r) => {
      const source = readFileSync(r.file, "utf8");
      return readsOwn(source) && !(r.name in NOTHING_SENT) && !/localModelError\([^\n]*gatewayId\)/.test(source);
    });
    expect(blind.map((r) => `${r.name}: calls localModelError without the model's gatewayId (lib/models.ts)`)).toEqual([]);
  });

  test("an exemption is kept only while its eval still reads an own corpus and still calls no guard", () => {
    for (const name of Object.keys(NOTHING_SENT)) {
      const source = readFileSync(join(EVALS, name, "src", "run.ts"), "utf8");
      expect([name, readsOwn(source) && !source.includes("localModelError(")]).toEqual([name, true]);
    }
  });
});
