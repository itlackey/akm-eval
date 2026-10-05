/**
 * Tests for the env/tracker credential fallback.
 * A fake `akm` on PATH stands in for the real one, so no real akm config or stash is read.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCredentials } from "../lib/base-adapter.js";
import {
  loadTrackerEnv,
  resolveCredentials as resolveWithCliFallback,
} from "../lib/credential-resolver.js";

const TOUCHED_VARS = ["PATH", "GITEA_TOKEN", "GITEA_URL"];

describe("env/tracker fallback", () => {
  let dir: string;
  let bin: string;
  let saved: Record<string, string | undefined>;

  function writeFakeAkm(body: string): void {
    const script = join(bin, "akm");
    writeFileSync(script, `#!/bin/sh\n${body}\n`);
    chmodSync(script, 0o755);
  }

  beforeEach(() => {
    saved = Object.fromEntries(TOUCHED_VARS.map((name) => [name, process.env[name]]));
    dir = mkdtempSync(join(tmpdir(), "tracker-env-test-"));
    bin = join(dir, "bin");
    mkdirSync(bin);

    const envFile = join(dir, "tracker.env");
    writeFileSync(envFile, "GITEA_URL=https://gitea.example.com\nGITEA_TOKEN=from-file\n");
    writeFakeAkm(`[ "$*" = "env path env/tracker --format text -q" ] || exit 1\necho "${envFile}"`);

    process.env.PATH = bin;
    delete process.env.GITEA_TOKEN;
    delete process.env.GITEA_URL;
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test("reads variables missing from the environment from env/tracker", async () => {
    const creds = await resolveCredentials("gitea");
    expect(creds.token).toBe("from-file");
    expect(creds.baseUrl).toBe("https://gitea.example.com");
  });

  test("environment variables win over env/tracker", async () => {
    process.env.GITEA_TOKEN = "from-env";
    const creds = await resolveCredentials("gitea");
    expect(creds.token).toBe("from-env");
    expect(creds.baseUrl).toBe("https://gitea.example.com");
  });

  test("skips silently when the env/tracker ref does not exist", async () => {
    writeFakeAkm("echo '{\"ok\": false}'\nexit 1");
    const creds = await resolveCredentials("gitea");
    expect(creds.token).toBeUndefined();
    expect(creds.baseUrl).toBeUndefined();
  });

  test("skips silently when akm is not installed", () => {
    process.env.PATH = join(dir, "empty");
    expect(loadTrackerEnv()).toEqual({});
  });

  test("credential-resolver also falls back to env/tracker", async () => {
    const creds = await resolveWithCliFallback("gitea");
    expect(creds.token).toBe("from-file");
    expect(creds.baseUrl).toBe("https://gitea.example.com");
  });
});
