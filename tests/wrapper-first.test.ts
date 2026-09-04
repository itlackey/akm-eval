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
      "bin/_akm_eval_image_lib.sh",
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
      "bin/probe",
      "bin/probe-pair",
      "bin/memory-eval",
      ".dockerignore",
      ".env.example",
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
    expect(content).toContain("volume-nocopy");
    expect(content).toContain("target=$WORKSPACE_DIR,readonly");
    expect(content).toContain("AKM_EVAL_DATASETS_WRITABLE");
    expect(content).not.toContain("/var/run/docker.sock");
    expect(content).not.toContain("compgen -e");
  });

  test("keeps image dependencies outside the runtime checkout mount", () => {
    const dockerfile = fs.readFileSync(path.resolve(rootDir, "docker/akm-eval.Dockerfile"), "utf8");
    expect(dockerfile).toContain("AKM_EVAL_APP_ROOT=/opt/akm-eval");
    expect(dockerfile).toContain("bun install --frozen-lockfile");
    expect(dockerfile).not.toContain("|| bun install");
    expect(dockerfile).not.toContain("COPY . .");
    expect(dockerfile).not.toContain("ARG AKM_CLI_VERSION=0.9.10");

    const entrypoint = fs.readFileSync(
      path.resolve(rootDir, "docker/akm-eval-entrypoint.sh"),
      "utf8",
    );
    expect(entrypoint).toContain("NODE_PATH");

    const dockerignore = fs.readFileSync(path.resolve(rootDir, ".dockerignore"), "utf8");
    for (const excluded of ["**", "config/*.local.json"]) {
      expect(dockerignore).toContain(excluded);
    }
    for (const included of ["!src/**", "!scripts/**", "!bin/**"]) {
      expect(dockerignore).toContain(included);
    }

    const pythonRequirements = fs
      .readFileSync(path.resolve(rootDir, "requirements-smoke.txt"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
    expect(pythonRequirements.length).toBeGreaterThan(4);
    expect(pythonRequirements.every((line) => /^[A-Za-z0-9_.-]+==[^=]+$/.test(line))).toBe(true);
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

function runOperatorWrapperWithStubDocker(
  wrapper: string,
  args: string[] = [],
  extraEnv: Record<string, string> = {},
): { invocations: string[][]; forbiddenCalls: string[]; status: number | null } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-operator-stub-"));
  stubDirs.push(dir);
  const logPath = path.join(dir, "docker-argv.log");
  const forbiddenLogPath = path.join(dir, "forbidden.log");
  fs.writeFileSync(
    path.join(dir, "docker"),
    [
      "#!/usr/bin/env bash",
      `printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}`,
      'if [ "$1" = "info" ]; then printf "%s\\n" "[name=seccomp]"; fi',
      "exit 0",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  for (const command of ["bun", "npm", "npx", "jq", "python", "python3", "uv", "akm", "realpath"]) {
    fs.writeFileSync(
      path.join(dir, command),
      `#!/usr/bin/env bash\nprintf '%s\\n' ${JSON.stringify(command)} >> ${JSON.stringify(forbiddenLogPath)}\nexit 97\n`,
      { mode: 0o755 },
    );
  }

  const result = spawnSync("bash", [path.resolve(rootDir, wrapper), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH ?? ""}`,
      AKM_EVAL_WORKSPACE_DIR: rootDir,
      AKM_EVAL_BUILD_IF_MISSING: "0",
      ...extraEnv,
    },
  });

  const lines = fs.existsSync(logPath)
    ? fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean)
    : [];
  const forbiddenCalls = fs.existsSync(forbiddenLogPath)
    ? fs.readFileSync(forbiddenLogPath, "utf8").split("\n").filter(Boolean)
    : [];
  return {
    invocations: lines.map((line) => line.split(" ")),
    forbiddenCalls,
    status: result.status,
  };
}

describe("docker-first operator wrappers", () => {
  test("probe refuses an implicit target before starting Docker", () => {
    const result = runOperatorWrapperWithStubDocker("bin/probe");
    expect(result.status).toBe(2);
    expect(result.invocations).toEqual([]);
    expect(result.forbiddenCalls).toEqual([]);
  });

  test("probe selects the requested AKM image without host Bun/npm/jq", () => {
    const result = runOperatorWrapperWithStubDocker("bin/probe", [
      "--akm-version",
      "0.9.14-beta.1",
    ]);
    expect(result.status).toBe(0);
    expect(result.forbiddenCalls).toEqual([]);
    expect(
      result.invocations.flat().some((arg) => arg.startsWith("akm-eval-core:akm-0.9.14-beta.1-")),
    ).toBe(true);
  });

  test("probe-pair and memory-eval enter Docker before using tool dependencies", () => {
    for (const [wrapper, args] of [
      [
        "bin/probe-pair",
        [
          "--control",
          "control",
          "--candidate",
          "candidate",
          "--expected-control-version",
          "0.9.13",
          "--expected-candidate-commit",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ],
      ],
      ["bin/memory-eval", ["longmemeval", "--akm-version", "0.9.14-beta.1", "--dry-run"]],
    ] as const) {
      const result = runOperatorWrapperWithStubDocker(wrapper, [...args]);
      expect(result.status).toBe(0);
      expect(result.forbiddenCalls).toEqual([]);
      expect(result.invocations.some((argv) => argv[0] === "run")).toBe(true);
    }
  });

  test("help is host-only and generic commands select an AKM-free runtime image", () => {
    for (const wrapper of ["bin/probe", "bin/probe-pair", "bin/memory-eval"]) {
      const help = runOperatorWrapperWithStubDocker(wrapper, ["--help"]);
      expect(help.status).toBe(0);
      expect(help.invocations).toEqual([]);
      expect(help.forbiddenCalls).toEqual([]);
    }

    const generic = runOperatorWrapperWithStubDocker("bin/probe-pair", [
      "--control",
      "control",
      "--candidate",
      "candidate",
      "--expected-control-version",
      "0.9.13",
      "--expected-candidate-commit",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
    expect(generic.invocations.flat().some((arg) => arg.startsWith("akm-eval-core:runtime-"))).toBe(
      true,
    );
  });

  test("passes opted-in secrets by name and ignores unrelated credentials", () => {
    const result = runOperatorWrapperWithStubDocker("bin/probe-pair", ["--control", "c"], {
      OPENAI_API_KEY: "known-secret-value",
      UNRELATED_API_KEY: "must-not-be-forwarded",
    });
    const flattened = result.invocations.flat();
    expect(flattened).toContain("OPENAI_API_KEY");
    expect(flattened.join(" ")).not.toContain("known-secret-value");
    expect(flattened).not.toContain("UNRELATED_API_KEY");
    expect(flattened.join(" ")).not.toContain("must-not-be-forwarded");
  });

  test("mounts external datasets read-only and propagates the normalized path name", () => {
    const datasetDir = fs.mkdtempSync(path.join(os.tmpdir(), "akm-eval-dataset-"));
    stubDirs.push(datasetDir);
    const result = runOperatorWrapperWithStubDocker("bin/probe-pair", ["--control", "c"], {
      AKM_EVAL_DATASET_DIR: datasetDir,
    });
    const flattened = result.invocations.flat();
    expect(flattened).toContain("AKM_EVAL_DATASET_DIR");
    expect(flattened).toContain(`type=bind,source=${datasetDir},target=${datasetDir},readonly`);
  });

  test("mounts the checkout read-only while keeping only run artifacts writable", () => {
    const result = runOperatorWrapperWithStubDocker("bin/probe-pair", ["--control", "c"]);
    const flattened = result.invocations.flat();
    expect(flattened).toContain(`type=bind,source=${rootDir},target=${rootDir},readonly`);
    expect(flattened).toContain(`type=bind,source=${rootDir}/runs,target=${rootDir}/runs`);
    expect(flattened).toContain(
      `type=bind,source=${rootDir}/datasets,target=${rootDir}/datasets,readonly`,
    );
  });
});

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
