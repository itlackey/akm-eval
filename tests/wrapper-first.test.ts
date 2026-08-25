import { afterAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

// ── container uid ────────────────────────────────────────────────────────────

const stubDirs: string[] = [];

afterAll(() => {
  for (const dir of stubDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * Puts a fake `docker` on PATH that records the argv of every invocation and
 * answers `info` with the given SecurityOptions, then runs the real wrapper
 * against it. Nothing is containerised here -- the assertion is purely about
 * which flags the wrapper hands to docker.
 */
function runWrapperWithStubDocker(securityOptions: string): string[][] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-docker-stub-"));
  stubDirs.push(dir);
  const logPath = path.join(dir, "argv.log");
  const stubPath = path.join(dir, "docker");
  fs.writeFileSync(
    stubPath,
    [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}`,
      'if [ "$1" = "info" ]; then',
      `  printf '%s\\n' ${JSON.stringify(securityOptions)}`,
      "fi",
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );

  const result = spawnSync("bash", [path.resolve(rootDir, "bin/_akm_eval_cli_image.sh"), "true"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      AKM_EVAL_WORKSPACE_DIR: dir,
      AKM_EVAL_CONTAINER_WORKDIR: dir,
      AKM_EVAL_BUILD_IF_MISSING: "0",
    },
  });
  expect(result.status).toBe(0);

  return fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split(" "));
}

describe("cli image wrapper container uid", () => {
  test("runs the container as the invoking uid:gid so bind-mounted run artifacts stay host-owned", () => {
    // bin/eval bind-mounts the repo. As container root every file it writes
    // -- runs/<run>/**, including the akm backend's 0700 .akm-memory work dir
    // -- lands on the host owned by root, so the operator cannot delete their
    // own run output and check:boundary used to die with EACCES on it.
    const invocations = runWrapperWithStubDocker("[name=seccomp,profile=builtin]");
    const runArgs = invocations.find((argv) => argv[0] === "run");

    expect(runArgs).toBeDefined();
    const userIndex = runArgs?.indexOf("--user") ?? -1;
    expect(userIndex).toBeGreaterThanOrEqual(0);
    expect(runArgs?.[userIndex + 1]).toBe(`${process.getuid?.()}:${process.getgid?.()}`);
  });

  test("omits --user under rootless docker, where container root already maps to the invoking user", () => {
    // Under rootless docker --user would map us to an unusable subuid --
    // reintroducing the exact ownership problem the flag exists to avoid.
    const invocations = runWrapperWithStubDocker("[name=rootless]");
    const runArgs = invocations.find((argv) => argv[0] === "run");

    expect(runArgs).toBeDefined();
    expect(runArgs?.includes("--user")).toBe(false);
  });
});
