// An end-to-end check of what a run writes: one real producer, evals/distill's runCorpus (imported, not changed), against a fake akm,
// with a MODEL_BASE_URL that carries a key in its query and a user name and password before the host. Whatever the run writes to
// its results folder, the dummy secrets must not be in it, while the fake akm did get them in its config, so the check can fail.

import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { distillConfig } from "../evals/distill/src/lib.ts";
import { runCorpus } from "../evals/distill/src/run.ts";
import { useModel } from "./models.ts";

const QUERY_SECRET = "DUMMY_QUERY_SECRET";
const USER_PASSWORD = "DUMMY_USER_PASSWORD";
const MODEL_KEY = "DUMMY_MODEL_KEY";
const BASE_URL = `https://dummy-user:${USER_PASSWORD}@gateway.example:8443/v1?api_key=${QUERY_SECRET}`;
const SECRETS = [QUERY_SECRET, USER_PASSWORD, MODEL_KEY];

/** A fake akm for distill. `improve` logs the endpoint and the key it was given, and fails for the case whose bundle says so, naming the endpoint as akm does. */
const FAKE_AKM = `
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const env = process.env;
if (args[0] === "--version") { console.log("0.9.99-test"); process.exit(0); }
if (args[0] === "improve") {
  const config = JSON.parse(readFileSync(join(env.AKM_CONFIG_DIR, "config.json"), "utf8"));
  const endpoint = config.engines.model.endpoint;
  appendFileSync(env.FAKE_LOG, JSON.stringify({ endpoint, apiKey: config.engines.model.apiKey, modelKey: env.MODEL_API_KEY ?? null }) + "\\n");
  if (JSON.parse(readFileSync(join(env.AKM_BUNDLE_DIR, "fake.json"), "utf8")).fail) {
    console.error(JSON.stringify({ ok: false, error: "request to " + endpoint + " was refused", code: "FAKE" }));
    process.exit(78);
  }
  console.log(JSON.stringify({ ok: true, actions: [{ mode: "distill", result: { outcome: "skipped", skipReason: "nothing_reusable" } }] }));
  process.exit(0);
}
if (args[0] === "proposal" && args[1] === "list") { console.log(JSON.stringify({ totalCount: 0, proposals: [] })); process.exit(0); }
console.error("unexpected " + args.join(" "));
process.exit(1);
`;

const dirs: string[] = [];
let saved: Record<string, string | undefined> = {};
let log: string;

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), "provenance-e2e-fake-"));
  dirs.push(root);
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  log = join(root, "calls.jsonl");
  saved = { AKM_BIN: process.env.AKM_BIN, FAKE_LOG: process.env.FAKE_LOG, MODEL_API_KEY: process.env.MODEL_API_KEY };
  process.env.AKM_BIN = `bun ${script}`; // the fake this test wrote, whatever the caller has
  process.env.FAKE_LOG = log;
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
afterEach(() => {
  for (const d of dirs.splice(1)) rmSync(d, { recursive: true, force: true });
  rmSync(log, { force: true });
});

/** An assets folder of two cases that expect no lesson: akm answers the first, and fails the second with an error that names its endpoint. */
function assets(): { assets: string; results: string } {
  const root = mkdtempSync(join(tmpdir(), "provenance-e2e-"));
  dirs.push(root);
  const folder = join(root, "assets");
  const cases = ["a-answers", "b-fails"].map((id) => {
    mkdirSync(join(folder, "bundles", id, "memories"), { recursive: true });
    writeFileSync(join(folder, "bundles", id, "memories", "m.md"), `---\ndescription: d\n---\nThe memory of ${id}.\n`);
    writeFileSync(join(folder, "bundles", id, "fake.json"), JSON.stringify({ fail: id === "b-fails" }));
    return { id, class: "dated-status", expect: "none", note: "n" };
  });
  writeFileSync(join(folder, "cases.json"), JSON.stringify(cases));
  return { assets: folder, results: join(root, "results") };
}

/** Every file under a folder, with its path under it and its text. */
function filesUnder(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files[join(entry.parentPath, entry.name).slice(dir.length + 1)] = readFileSync(join(entry.parentPath, entry.name), "utf8");
  }
  return files;
}

describe("what a run writes holds no endpoint credential", () => {
  test("evals/distill with a MODEL_BASE_URL that has a key in its query and a user name and password writes none of them", async () => {
    const stop = (message: string): never => {
      throw new Error(message);
    };
    const env: Record<string, string | undefined> = { MODEL_BASE_URL: BASE_URL, MODEL_NAME: "the-model", MODEL_API_KEY: MODEL_KEY };
    const settings = useModel({}, stop, env, {}); // as the eval does, from the environment and not from models.json
    expect(settings.baseUrl).toBe(BASE_URL);
    process.env.MODEL_API_KEY = env.MODEL_API_KEY; // useModel wrote it to env, which the eval's own process.env is
    const config = distillConfig(settings.baseUrl, settings.name, settings.hasKey);

    const folders = assets();
    const quiet = console.log;
    console.log = () => {};
    let summary;
    try {
      summary = await runCorpus("public", { config, baseUrl: settings.baseUrl, version: "0.9.99-test", model: settings.name, label: "e2e" }, folders);
    } finally {
      console.log = quiet;
    }

    // The fake akm was given the endpoint with its credentials, and the model key by name: the run really had the secrets to leak.
    const calls = readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(calls).toHaveLength(2);
    expect(calls[0].endpoint).toContain(QUERY_SECRET);
    expect(calls[0].endpoint).toContain(USER_PASSWORD);
    expect(calls[0]).toMatchObject({ apiKey: "$MODEL_API_KEY", modelKey: MODEL_KEY });

    // The run wrote its summary and its rows (and a marker of its own), one of them an error that akm worded with the endpoint.
    const written = filesUnder(summary.results_dir);
    expect(Object.keys(written)).toEqual(expect.arrayContaining(["samples.jsonl", "summary.json"]));
    const rows = written["samples.jsonl"].trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.verdict)).toEqual(["right", "error"]);
    expect(rows[1].error).toContain("request to");

    // None of it holds a secret, anywhere in any file.
    for (const [name, text] of Object.entries(written)) for (const secret of SECRETS) expect(`${name}: ${text.includes(secret)}`).toBe(`${name}: false`);

    // And the summary still says which endpoint it was: scheme, host, port and path, with the credentials gone.
    const stored = JSON.parse(written["summary.json"]);
    expect(stored.config.engines.model.endpoint).toStartWith("https://gateway.example:8443/v1?api_key=<redacted>");
    expect(stored.config.engines.model.apiKey).toBe("$MODEL_API_KEY");
    expect(stored.engine.endpoint).toBe("https://gateway.example:8443/v1?api_key=<redacted>");
    expect(stored).toMatchObject({ status: "complete", aborted_reason: null, n_errored: 1 });
    expect(existsSync(join(summary.results_dir, "summary.json"))).toBe(true);
  });
});
