// docker/entrypoint copies the image's tree into the working folder only on first use and when the image's revision differs. These tests run it
// against folders that stand in for /opt/akm-eval and /opt/akm-models (AKM_EVAL_IMAGE_ROOT and AKM_EVAL_MODEL_ROOT), so they need no image and no Docker.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ENTRYPOINT = resolve(import.meta.dir, "entrypoint");

const roots: string[] = [];
afterEach(() => {
  for (const d of roots.splice(0)) rmSync(d, { recursive: true, force: true });
});

interface Folders {
  image: string;
  models: string;
  work: string;
}

/** An image tree and a model folder as the Dockerfile leaves them, at revision `revision`, and an empty working folder. */
function folders(revision = "rev-1"): Folders {
  const root = mkdtempSync(join(tmpdir(), "entrypoint-test-"));
  roots.push(root);
  const [image, models, work] = ["image", "models", "work"].map((name) => join(root, name));
  for (const dir of [join(image, "docker"), join(image, "lib"), join(models, "bge"), work]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(image, ".akm-eval-revision"), `${revision}\n`);
  writeFileSync(join(image, "docker", "usage.txt"), "usage of the image\n");
  writeFileSync(join(image, "lib", "code.ts"), "image code 1\n");
  writeFileSync(join(models, "bge", "model.bin"), "model\n");
  return { image, models, work };
}

/** The entrypoint run in the working folder with `args`. */
function run({ image, models, work }: Folders, ...args: string[]) {
  const proc = Bun.spawnSync(["bash", ENTRYPOINT, ...args], {
    cwd: work,
    stdin: "ignore",
    env: { ...process.env, AKM_EVAL_IMAGE_ROOT: image, AKM_EVAL_MODEL_ROOT: models },
  });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

const read = (...path: string[]): string => readFileSync(join(...path), "utf8");

describe("docker/entrypoint", () => {
  test("a first run copies the image tree, writes the revision and seeds the model, then runs the command with HOME in the folder", () => {
    const f = folders();
    writeFileSync(join(f.work, ".env"), "KEY=1\n"); // the configuration files may be there before the first run
    writeFileSync(join(f.work, "models.json"), "{}\n");
    const r = run(f, "printenv", "HOME");
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe(join(realpathSync(f.work), ".home"));
    expect(read(f.work, "lib", "code.ts")).toBe("image code 1\n");
    expect(read(f.work, ".akm-eval-revision")).toBe("rev-1\n");
    expect(read(f.work, ".cache", "models", "bge", "model.bin")).toBe("model\n");
    expect(read(f.work, ".env")).toBe("KEY=1\n");
    expect(read(f.work, "models.json")).toBe("{}\n");
  });

  test("a second run with the same revision does not overwrite or restore what was changed in the folder", () => {
    const f = folders();
    expect(run(f, "true").code).toBe(0);
    writeFileSync(join(f.work, "lib", "code.ts"), "edited\n");
    rmSync(join(f.work, "docker", "usage.txt"));
    expect(run(f, "true").code).toBe(0);
    expect(read(f.work, "lib", "code.ts")).toBe("edited\n");
    expect(existsSync(join(f.work, "docker", "usage.txt"))).toBe(false);
  });

  test("a changed image revision copies again, over edits, and keeps the results and the configuration", () => {
    const f = folders();
    expect(run(f, "true").code).toBe(0);
    writeFileSync(join(f.work, "lib", "code.ts"), "edited\n");
    mkdirSync(join(f.work, "evals", "x", "results", "run-1"), { recursive: true });
    writeFileSync(join(f.work, "evals", "x", "results", "run-1", "summary.json"), "{}\n");
    writeFileSync(join(f.work, ".env"), "KEY=1\n");
    writeFileSync(join(f.image, ".akm-eval-revision"), "rev-2\n");
    writeFileSync(join(f.image, "lib", "code.ts"), "image code 2\n");
    expect(run(f, "true").code).toBe(0);
    expect(read(f.work, "lib", "code.ts")).toBe("image code 2\n");
    expect(read(f.work, ".akm-eval-revision")).toBe("rev-2\n");
    expect(read(f.work, "evals", "x", "results", "run-1", "summary.json")).toBe("{}\n");
    expect(read(f.work, ".env")).toBe("KEY=1\n");
  });

  test("a copy that fails keeps the old revision, so the next run copies again", () => {
    const f = folders();
    expect(run(f, "true").code).toBe(0);
    writeFileSync(join(f.image, ".akm-eval-revision"), "rev-2\n");
    writeFileSync(join(f.image, "lib", "code.ts"), "image code 2\n");
    writeFileSync(join(f.image, "models.json"), "{}\n");
    mkdirSync(join(f.work, "models.json")); // cp cannot overwrite a folder with a file
    expect(run(f, "true").code).not.toBe(0);
    expect(read(f.work, ".akm-eval-revision")).toBe("rev-1\n");
    rmSync(join(f.work, "models.json"), { recursive: true });
    expect(run(f, "true").code).toBe(0);
    expect(read(f.work, ".akm-eval-revision")).toBe("rev-2\n");
    expect(read(f.work, "lib", "code.ts")).toBe("image code 2\n");
  });

  test("a folder that holds other files and no revision is refused with exit 2, and nothing is copied", () => {
    const f = folders();
    writeFileSync(join(f.work, "notes.txt"), "mine\n");
    const r = run(f, "true");
    expect(r.code).toBe(2);
    expect(r.err).toContain("mount an empty working folder");
    expect(readdirSync(f.work)).toEqual(["notes.txt"]);
  });

  test("--help, and no command at all, print the usage text and copy nothing", () => {
    for (const args of [["--help"], []]) {
      const f = folders();
      const r = run(f, ...args);
      expect(r.code).toBe(0);
      expect(r.out).toBe("usage of the image\n");
      expect(readdirSync(f.work)).toEqual([]);
    }
  });
});
