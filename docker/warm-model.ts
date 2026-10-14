// Build-time setup only: download and verify the pinned native embedding model.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSandbox, removeSandbox, runAkmJson } from "../lib/akm/akm.ts";
const sandbox = createSandbox("image-model-setup", { semantic: true });
try {
  mkdirSync(join(sandbox.dir, "bundle", "memories"), { recursive: true });
  writeFileSync(join(sandbox.dir, "bundle", "memories", "setup.md"), "# Setup fixture\n\nA local embedding setup fixture.\n");
  const result = await runAkmJson<{ verification?: { embeddingCount?: number } }>(sandbox, ["index", "--full"], { timeoutMs: 1_800_000 });
  if (result.verification?.embeddingCount !== 1) throw new Error(`native embedding setup failed: ${JSON.stringify(result)}`);
} finally { removeSandbox(sandbox); }
