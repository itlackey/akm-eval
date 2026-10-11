import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Sandbox, akmBuild } from "./akm.ts";
import { type CachedIndex, type IndexSpec, cachedIndex, digest, digestTree } from "./index-cache.ts";

const dirs: string[] = [];
// The cache asks which akm this process runs from AKM_BIN, so the tests set it and put it back.
const akmBin = process.env.AKM_BIN;
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  if (akmBin === undefined) delete process.env.AKM_BIN;
  else process.env.AKM_BIN = akmBin;
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "index-cache-"));
  dirs.push(d);
  return d;
};

/** An akm that answers `akm info` from files in its data folder, which a build writes: how many assets, when built, and whether it embedded. */
const FAKE_AKM = `
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const data = process.env.AKM_DATA_DIR as string;
const read = (name: string) => (existsSync(join(data, name)) ? readFileSync(join(data, name), "utf8") : undefined);
if (process.argv[2] === "info") console.log(JSON.stringify({ ok: true, indexStats: { entryCount: Number(read("entries")), lastBuiltAt: read("built-at"), hasEmbeddings: read("embeddings") !== "none" } }));
else { console.error("unknown command"); process.exit(1); }
`;

/** What a collection of three files looks like to the cache. */
const files = (extra: Record<string, string> = {}): Record<string, string> => ({
  "skills/a/SKILL.md": digest("a"),
  "skills/b/SKILL.md": digest("b"),
  "skills/c/SKILL.md": digest("c"),
  ...extra,
});

function setup() {
  const root = tmp();
  const script = join(root, "fake-akm.ts");
  writeFileSync(script, FAKE_AKM);
  process.env.AKM_BIN = `bun ${script}`; // an akm that is not in a git checkout: no build
  const builds: { fresh: boolean }[] = [];
  /** An index to build: it marks the data folder as akm would, with the count and the time it built. */
  const build = async (sandbox: Sandbox): Promise<number> => {
    builds.push({ fresh: !existsSync(join(sandbox.dir, "data", "index.db")) });
    writeFileSync(join(sandbox.dir, "data", "index.db"), "an index");
    writeFileSync(join(sandbox.dir, "data", "state.db"), "what akm logged of the searches");
    writeFileSync(join(sandbox.dir, "data", "entries"), "3");
    writeFileSync(join(sandbox.dir, "data", "built-at"), `build ${builds.length}`);
    return 3;
  };
  const log: string[] = [];
  const open = (spec: Partial<IndexSpec> = {}, make = build): Promise<CachedIndex> =>
    cachedIndex({ name: "skillret-public", version: "0.9.99", files: files(), root: join(root, "cache"), cmd: ["bun", script], log: (l) => void log.push(l), ...spec }, make);
  const folder = join(realpathSync(root), "cache", "skillret-public");
  return { root, script, builds, build, log, open, folder };
}

describe("cachedIndex", () => {
  test("builds a new index the first time, and uses it as it is the second time, without building", async () => {
    const s = setup();
    const first = await s.open();
    expect(first.state).toBe("cold");
    expect(first.entries).toBe(3);
    expect(s.builds).toEqual([{ fresh: true }]);
    expect(first.sandbox.dir).toBe(s.folder);
    expect(first.sandbox.env.AKM_BUNDLE_DIR).toBe(join(s.folder, "bundle"));
    expect(JSON.parse(readFileSync(join(first.sandbox.dir, "config", "config.json"), "utf8"))).toMatchObject({ semanticSearchMode: "auto" });
    first.release();

    const second = await s.open();
    expect(second.state).toBe("warm");
    expect(second.entries).toBe(3);
    expect(s.builds).toHaveLength(1);
    expect(second.sandbox.dir).toBe(first.sandbox.dir);
    second.release();
    expect(s.log).toEqual([`  the index skillret-public is kept from an earlier run: it was built by akm 0.9.99 (${second.builtBy.akm_bin}) at build 1.`]);
  });

  test("keeps the config that the build wrote, such as bundles that are indexed where they are", async () => {
    const s = setup();
    const first = await s.open({}, async (sandbox) => {
      writeFileSync(join(sandbox.dir, "config", "config.json"), JSON.stringify({ semanticSearchMode: "auto", bundles: { notes: { path: "/somewhere" } } }));
      return s.build(sandbox);
    });
    first.release();
    const second = await s.open();
    second.release();
    expect(second.state).toBe("warm");
    expect(JSON.parse(readFileSync(join(s.folder, "config", "config.json"), "utf8")).bundles).toEqual({ notes: { path: "/somewhere" } });
  });

  test("keeps the index and drops what akm logged of the searches of the run before", async () => {
    const s = setup();
    const first = await s.open();
    mkdirSync(join(first.sandbox.dir, "state"), { recursive: true });
    writeFileSync(join(first.sandbox.dir, "state", "events.jsonl"), "{}");
    mkdirSync(join(first.sandbox.dir, "cache", "logs"), { recursive: true });
    first.release();
    const second = await s.open();
    second.release();
    expect(second.state).toBe("warm");
    expect(existsSync(join(s.folder, "data", "index.db"))).toBe(true);
    expect(existsSync(join(s.folder, "data", "state.db"))).toBe(false);
    expect(existsSync(join(s.folder, "state", "events.jsonl"))).toBe(false);
    expect(existsSync(join(s.folder, "cache", "logs"))).toBe(false);
  });

  test("builds a new index from nothing when a file changed, is gone or is new, because akm does not update an index to what a new one is", async () => {
    const s = setup();
    const { "skills/c/SKILL.md": _gone, ...fewer } = files();
    for (const [spec, why] of [
      [{ files: files({ "skills/b/SKILL.md": digest("b, edited") }) }, "1 of its 3 files changed or are gone, and 0 are new"],
      [{ files: fewer }, "1 of its 3 files changed or are gone, and 0 are new"],
      [{ files: files({ "skills/d/SKILL.md": digest("d") }) }, "0 of its 3 files changed or are gone, and 1 are new"],
    ] as const) {
      (await s.open()).release(); // the collection of three files, kept, or built again after the case before
      const before = s.builds.length;
      const index = await s.open(spec);
      expect(index.state).toBe("cold");
      expect(s.builds.length).toBe(before + 1);
      expect(s.builds[before]).toEqual({ fresh: true }); // from nothing
      expect(s.log[s.log.length - 1]).toBe(`  the index skillret-public in the cache cannot be reused: ${why}. Building a new one.`);
      index.release();
      // and the collection that it was built from is the one that is kept
      const again = await s.open(spec);
      expect(again.state).toBe("warm");
      again.release();
    }
  });

  test("never uses an index of another akm, of other settings, or of another folder", async () => {
    const s = setup();
    (await s.open()).release();
    for (const spec of [{ version: "0.9.100" }, { extra: "bundles indexed in place" }]) {
      const index = await s.open(spec);
      expect(index.state).toBe("cold");
      index.release();
    }
    expect(s.log.filter((l) => l.includes("akm, its build, its embedding model or the index's folder is not the same"))).toHaveLength(2);

    // a copy of the cache in another place is not the index that akm made, because akm recorded the paths
    const moved = tmp();
    cpSync(join(s.root, "cache"), join(moved, "cache"), { recursive: true });
    const other = await cachedIndex({ name: "skillret-public", version: "0.9.100", files: files(), extra: "bundles indexed in place", root: join(moved, "cache"), cmd: ["bun", s.script], log: (l) => void s.log.push(l) }, s.build);
    expect(other.state).toBe("cold");
    other.release();
  });

  test("removes an index that was not finished, and one whose build failed, and builds a new one", async () => {
    const s = setup();
    await expect(s.open({}, async (sandbox) => { writeFileSync(join(sandbox.dir, "data", "index.db"), "half"); throw new Error("akm ran out of memory"); })).rejects.toThrow("akm ran out of memory");
    expect(existsSync(s.folder)).toBe(false);
    expect(existsSync(`${s.folder}.lock`)).toBe(false);

    // a folder with an index and no state.json is one that a killed run left behind
    mkdirSync(join(s.folder, "data"), { recursive: true });
    writeFileSync(join(s.folder, "data", "index.db"), "half an index");
    const index = await s.open();
    expect(index.state).toBe("cold");
    expect(s.builds).toEqual([{ fresh: true }]);
    expect(s.log.join("\n")).toContain("cannot be reused: it was not finished");
    index.release();
  });

  test("builds a new index when the state was kept before the build of akm was recorded", async () => {
    const s = setup();
    (await s.open()).release();
    const { builtBy: _builtBy, ...old } = JSON.parse(readFileSync(join(s.folder, "state.json"), "utf8"));
    writeFileSync(join(s.folder, "state.json"), JSON.stringify(old));
    const index = await s.open();
    expect(index.state).toBe("cold");
    expect(s.builds).toEqual([{ fresh: true }, { fresh: true }]);
    expect(s.log[s.log.length - 1]).toContain("cannot be reused: it was not finished, or it was kept before the build of akm was recorded");
    index.release();
  });

  test("fails when what akm says of a new index is not what the build said", async () => {
    const s = setup();
    await expect(s.open({}, async (sandbox) => { await s.build(sandbox); return 4; })).rejects.toThrow("akm indexed 4 assets, and says the index holds 3");
    expect(existsSync(s.folder)).toBe(false);
  });

  test("writes state.json last, after the build", async () => {
    const s = setup();
    let during: boolean | undefined;
    const index = await s.open({}, async (sandbox) => {
      during = existsSync(join(sandbox.dir, "state.json"));
      return s.build(sandbox);
    });
    expect(during).toBe(false);
    expect(JSON.parse(readFileSync(join(index.sandbox.dir, "state.json"), "utf8"))).toMatchObject({ files: files(), entries: 3, builtAt: "build 1" });
    expect(existsSync(join(index.sandbox.dir, "state.json.tmp"))).toBe(false);
    index.release();
  });

  describe("the akm that built the index", () => {
    /** A checkout of akm: a repository with one commit, whose cli.ts is the fake akm. `commit()` makes another build of it. */
    const checkout = () => {
      const dir = tmp();
      const git = (...args: string[]) => Bun.spawnSync(["git", "-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { stdout: "pipe", stderr: "pipe" });
      const cli = join(dir, "cli.ts");
      let commits = 0;
      writeFileSync(cli, FAKE_AKM);
      for (const args of [["init", "-q"], ["add", "."], ["commit", "-q", "-m", "first"]]) expect(git(...args).exitCode).toBe(0);
      return {
        cli,
        sha: () => git("rev-parse", "--short", "HEAD").stdout.toString().trim(),
        commit: () => {
          writeFileSync(cli, `${FAKE_AKM}// ${++commits}\n`);
          expect(git("commit", "-q", "-a", "-m", "next").exitCode).toBe(0);
        },
      };
    };

    test.skipIf(!Bun.which("git"))("does not let two builds of akm that print the same version share an index", async () => {
      const s = setup();
      const akm = checkout();
      process.env.AKM_BIN = `bun ${akm.cli}`;
      const spec = { cmd: ["bun", akm.cli] };
      const first = await s.open(spec);
      first.release();
      const before = akm.sha();
      expect(first.state).toBe("cold");
      expect(first.builtBy).toEqual({ version: "0.9.99", ...akmBuild(), builtAt: "build 1" });
      expect(first.builtBy.akm_build).toBe(before);
      const again = await s.open(spec); // the same build
      again.release();
      expect(again.state).toBe("warm");
      expect(s.builds).toHaveLength(1);

      akm.commit();
      const after = akm.sha();
      expect(after).not.toBe(before);
      const other = await s.open(spec); // another build, the same version, the same command
      other.release();
      expect(other.state).toBe("cold");
      expect(s.builds).toEqual([{ fresh: true }, { fresh: true }]); // from nothing
      expect(other.builtBy).toEqual({ version: "0.9.99", ...akmBuild(), builtAt: "build 2" });
      expect(other.builtBy.akm_build).toBe(after);
      const bin = other.builtBy.akm_bin;
      expect(s.log[s.log.length - 1]).toBe(
        `  the index skillret-public in the cache cannot be reused: akm, its build, its embedding model or the index's folder is not the same: it was built by akm 0.9.99 build ${before} (${bin}), and this run is akm 0.9.99 build ${after} (${bin}). Building a new one.`,
      );
      const last = await s.open(spec); // and the build that is kept is the one that was built last
      last.release();
      expect(last.state).toBe("warm");
    });

    test.skipIf(!Bun.which("git"))("says on a reuse that the checkout has changes that are not committed", async () => {
      const s = setup();
      const akm = checkout();
      process.env.AKM_BIN = `bun ${akm.cli}`;
      const spec = { cmd: ["bun", akm.cli] };
      (await s.open(spec)).release();
      expect(s.log).toHaveLength(0);
      writeFileSync(akm.cli, `${FAKE_AKM}// not committed\n`);
      // the build is now `<sha>-dirty`, so this run is another build and the index is made again
      const dirty = await s.open(spec);
      dirty.release();
      expect(dirty.state).toBe("cold");
      expect(dirty.builtBy.akm_build).toBe(`${akm.sha()}-dirty`);
      expect(s.log).toHaveLength(1); // the line that says the earlier index cannot be reused
      const kept = await s.open(spec);
      kept.release();
      expect(kept.state).toBe("warm");
      expect(s.log[s.log.length - 1]).toContain(`was built by akm 0.9.99 build ${akm.sha()}-dirty (`);
      expect(s.log[s.log.length - 1]).toContain("The checkout has changes that are not committed");
    });

    test("uses the index of an akm that is not a checkout again, since its version is all that tells it apart", async () => {
      const s = setup();
      const first = await s.open();
      first.release();
      expect(first.builtBy).toEqual({ version: "0.9.99", akm_bin: akmBuild().akm_bin, akm_build: null, builtAt: "build 1" });
      const second = await s.open();
      second.release();
      expect(second.state).toBe("warm");
      expect(second.builtBy).toEqual(first.builtBy);
      expect(s.builds).toHaveLength(1);
      const release = await s.open({ version: "0.9.100" }); // a release, not the same one
      release.release();
      expect(release.state).toBe("cold");
    });

    test("does not use the index that another akm command built, when neither is a checkout", async () => {
      const s = setup();
      (await s.open()).release();
      const other = join(s.root, "other-akm.ts");
      writeFileSync(other, FAKE_AKM);
      process.env.AKM_BIN = `bun ${other}`;
      const index = await s.open({ cmd: ["bun", other] });
      index.release();
      expect(index.state).toBe("cold");
      expect(index.builtBy.akm_bin).toBe(akmBuild().akm_bin);
    });

    test("keeps who built the index in state.json, and gives it back when the index is kept", async () => {
      const s = setup();
      const first = await s.open();
      first.release();
      const saved = JSON.parse(readFileSync(join(s.folder, "state.json"), "utf8"));
      expect(saved.builtBy).toEqual(first.builtBy);
      expect(Object.keys(saved.builtBy)).toEqual(["version", "akm_bin", "akm_build", "builtAt"]);
      expect(saved.builtBy).toEqual({ version: "0.9.99", ...akmBuild(), builtAt: saved.builtAt });
      const second = await s.open();
      second.release();
      expect(second.state).toBe("warm");
      expect(second.builtBy).toEqual(saved.builtBy);
      expect(s.log[s.log.length - 1]).toBe(`  the index skillret-public is kept from an earlier run: it was built by akm 0.9.99 (${saved.builtBy.akm_bin}) at build 1.`);
    });
  });

  test("builds a new index when akm does not say what the kept one was built as, says so, and reports it as rebuilt", async () => {
    const s = setup();
    for (const [change, said] of [
      [{ entries: "2" }, "akm says the index holds 2 assets, and it was built with 3"],
      [{ "built-at": "someone indexed it again" }, "akm says the index was built at someone indexed it again, and it was built at build "],
      [{ embeddings: "none" }, "akm says the index holds no embeddings"],
    ] as const) {
      (await s.open()).release();
      for (const [name, content] of Object.entries(change)) writeFileSync(join(s.folder, "data", name), content);
      const before = s.builds.length;
      const index = await s.open();
      expect(index.state).toBe("rebuilt");
      expect(s.builds.length).toBe(before + 1);
      expect(s.builds[before]).toEqual({ fresh: true }); // from nothing: the first index was thrown away
      expect(s.log[s.log.length - 1]).toContain(`the index of an earlier run is not what it was built as, and a new one is built from scratch. akm said: ${said}`);
      expect(s.log[s.log.length - 1]).toContain(`The earlier index was built by akm 0.9.99 (${index.builtBy.akm_bin}) at build ${s.builds.length - 1}.`);
      index.release();
      const next = await s.open(); // and what was rebuilt is kept
      expect(next.state).toBe("warm");
      next.release();
      rmSync(s.folder, { recursive: true });
    }
  });

  test("fails when the new index fails too, and keeps nothing", async () => {
    const s = setup();
    (await s.open()).release();
    writeFileSync(join(s.folder, "data", "entries"), "2");
    await expect(s.open({}, async () => { throw new Error("still wrong"); })).rejects.toThrow("still wrong");
    expect(existsSync(s.folder)).toBe(false);
    expect(existsSync(`${s.folder}.lock`)).toBe(false);
  });

  test("lets one run use an index at a time, and takes over the lock of a run that was killed", async () => {
    const s = setup();
    const index = await s.open();
    await expect(s.open()).rejects.toThrow(`another run is using the index in ${s.folder}.lock (pid ${process.pid})`);
    // a failed attempt does not let go of the lock the other run holds
    expect(existsSync(`${s.folder}.lock`)).toBe(true);
    index.release();
    expect(existsSync(`${s.folder}.lock`)).toBe(false);

    const dead = Bun.spawnSync(["true"]).pid;
    writeFileSync(`${s.folder}.lock`, String(dead));
    const again = await s.open();
    expect(again.state).toBe("warm");
    again.release();
  });

  test("keeps the indexes of two collections apart", async () => {
    const s = setup();
    const a = await s.open({ name: "skillret-public" });
    const b = await s.open({ name: "skillret-private" });
    expect(a.sandbox.dir).not.toBe(b.sandbox.dir);
    a.release();
    b.release();
  });

  test("runs the akm command it is given", async () => {
    const s = setup();
    const index = await s.open();
    expect(index.sandbox.cmd).toEqual(["bun", s.script]);
    index.release();
  });

  test("does not let git climb out of the index's folder, since the repository ignores the folder and akm would find no asset", async () => {
    const s = setup();
    const index = await s.open();
    expect(index.sandbox.env.GIT_CEILING_DIRECTORIES).toBe(index.sandbox.dir);
    index.release();
  });

  // akm lists the files of a bundle that is in a git repository with this command, in the bundle's folder.
  test.skipIf(!Bun.which("git"))("makes git list the bundle although a repository above it ignores the folder of the index", async () => {
    const s = setup();
    const repo = tmp();
    expect(Bun.spawnSync(["git", "init", "-q"], { cwd: repo }).exitCode).toBe(0);
    writeFileSync(join(repo, ".gitignore"), "/cache/\n");
    const index = await s.open({ root: join(repo, "cache") }, async (sandbox) => {
      mkdirSync(join(sandbox.dir, "bundle", "skills", "a"), { recursive: true });
      writeFileSync(join(sandbox.dir, "bundle", "skills", "a", "SKILL.md"), "a");
      return s.build(sandbox);
    });
    const list = (env: Record<string, string>) => Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "."], { cwd: join(index.sandbox.dir, "bundle"), env });
    const { GIT_CEILING_DIRECTORIES: _ceiling, ...without } = index.sandbox.env;
    expect(list(without).stdout.toString()).toBe(""); // the repository ignores it: nothing to index
    expect(list(index.sandbox.env).exitCode).not.toBe(0); // git does not find the repository, and akm walks the folder itself
    index.release();
  });
});

describe("digestTree", () => {
  test("hashes the content of every file under a folder, by path, and follows links", () => {
    const root = tmp();
    mkdirSync(join(root, "a", "b"), { recursive: true });
    writeFileSync(join(root, "a", "b", "one.md"), "one");
    writeFileSync(join(root, "two.md"), "two");
    const outside = tmp();
    writeFileSync(join(outside, "three.md"), "three");
    symlinkSync(join(outside, "three.md"), join(root, "link.md"));
    symlinkSync(outside, join(root, "linked-folder"));
    expect(digestTree(root)).toEqual({
      "a/b/one.md": digest("one"),
      "two.md": digest("two"),
      "link.md": digest("three"),
      "linked-folder/three.md": digest("three"),
    });
    expect(digest("one")).toMatch(/^[0-9a-f]{64}$/);
  });
});
