import { describe, expect, test } from "bun:test";
import { isLocalJudge, localModelError } from "./local-model.ts";

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
