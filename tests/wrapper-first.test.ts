import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("wrapper-first operator surface", () => {
  test("ships the expected bin wrappers", () => {
    for (const relativePath of [
      "bin/akm-eval",
      "bin/_akm_eval_cli_image.sh",
      "bin/build-image",
      "bin/doctor",
      "bin/eval",
      "bin/beam-eval",
      "bin/matrix",
      "bin/report",
      "bin/summary",
      "bin/compare",
      "bin/downloads",
      "bin/beam-doctor",
      "docker/akm-eval.Dockerfile",
      "docker/akm-eval-entrypoint.sh",
    ]) {
      expect(fs.existsSync(path.resolve(rootDir, relativePath))).toBe(true);
    }
  });

  test("cli image wrapper exports project root into the container", () => {
    const wrapperPath = path.resolve(rootDir, "bin/_akm_eval_cli_image.sh");
    const content = fs.readFileSync(wrapperPath, "utf8");
    expect(content).toContain("AKM_EVAL_PROJECT_ROOT");
    expect(content).toContain("AKM_EVAL_CLI_IMAGE_TAG");
    expect(content).toContain("docker image inspect");
  });
});
