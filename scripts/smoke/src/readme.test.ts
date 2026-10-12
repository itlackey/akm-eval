// The root README says, eval by eval, which flags it takes, and COMPATIBILITY.md which akm it needs. These tests check both against the
// code, so they cannot drift without a test failing: every run script's --help is run and compared with them. Nothing here needs akm or
// Docker. A run script that starts uv has its help tests skipped on a machine without uv; none does now.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const read = (file: string): string => readFileSync(join(ROOT, file), "utf8");
const README = read("README.md");

/** The flags every run script lists and the table leaves out, and --help, which a script takes and does not always list. */
const COMMON = ["--corpus", "--limit", "--label"];
const LEFT_OUT = [...COMMON, "--help"];

/** A help run by uv can install packages first, from the network. */
const HELP_TIMEOUT_MS = 120_000;

/** Does the run script start uv? */
const needsUv = (folder: string): boolean => /\buv run\b/.test(read(`${folder}/run`));
const HAS_UV = Bun.which("uv") !== null;
/** The test function for a check of --help: skipped for a script that needs uv on a machine that has none. The rest of the table is still checked. */
const helpTest = (folder: string) => (needsUv(folder) && !HAS_UV ? test.skip : test);

/**
 * What the seven evals that run a model through akm all record in summary.json, as the README says under its table. Each is found in
 * the source of each of them as a key, or, for the three that arrive in a spread, as that spread.
 */
const MODEL_EVALS = ["evals/judge-gate", "evals/reflect", "evals/distill", "evals/consolidate", "evals/extract", "evals/nightly", "evals/promotion"];
const COMMON_RECORDED = ["model", "akm_version", "akm_bin", "akm_build", "limit", "strategy", "config_patch", "config", "engine", "assets_sha256", "seed", "n_errored", "metrics"];

interface Row {
  folder: string;
  flags: string[];
}

const ticks = (cell: string): string[] => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** The rows of the first table of `markdown` whose header starts with `| Folder |`: folder, question, flags. A cell has no pipe in it. */
export function tableRows(markdown: string): Row[] {
  const lines = markdown.split("\n");
  const at = lines.findIndex((l) => l.startsWith("| Folder |"));
  if (at < 0) return [];
  const rows: Row[] = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length !== 3) throw new Error(`a row of the table has ${cells.length} cells, not 3: ${line.slice(0, 80)}`);
    rows.push({ folder: ticks(cells[0])[0] ?? cells[0], flags: ticks(cells[2]) });
  }
  return rows;
}

/** The akm cell, the second, of each eval's row in COMPATIBILITY.md, by folder. */
export function compatibilityAkm(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of markdown.split("\n")) {
    if (!/^\| `(evals|benchmarks)\//.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    out.set(ticks(cells[0])[0] ?? cells[0], cells[1] ?? "");
  }
  return out;
}

/** The flags a `--help` text lists: those of its synopsis (up to the first blank line) and those that start an entry of its options. */
export function helpFlags(help: string): string[] {
  const found = new Set<string>();
  for (const m of (help.split(/\n\s*\n/)[0] ?? "").matchAll(/--[a-z][a-z-]*/g)) found.add(m[0]);
  for (const line of help.split("\n")) {
    const m = /^ {1,4}(?:-\w, )?(--[a-z][a-z-]*)/.exec(line);
    if (m) found.add(m[1]);
  }
  return [...found].sort();
}

/** The values `--corpus` takes in a `--help` text, `all` left out. */
export function helpCorpora(help: string): string[] {
  const m = /--corpus ([a-z|,{}-]+)/.exec(help);
  return (m?.[1] ?? "").split(/[|,{}]/).filter((v) => v && v !== "all").sort();
}

const rows = tableRows(README);
const AKM = compatibilityAkm(read("COMPATIBILITY.md"));

/** Each run script's --help, started together, except one that needs uv when there is none. A script that prints no help is an error that says why: a uv that cannot fetch PyYAML, for one. */
const helps = new Map(
  rows
    .filter((r) => HAS_UV || !needsUv(r.folder))
    .map((r) => {
      const proc = Bun.spawn(["bash", join(ROOT, r.folder, "run"), "--help"], { cwd: ROOT, stdin: "ignore", stdout: "pipe", stderr: "pipe", env: process.env });
      const help = (async () => {
        const [text, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
        if (!text.trim()) throw new Error(`${r.folder}/run --help printed no help (exit ${code}): ${err.trim().slice(-300)}`);
        return text;
      })();
      help.catch(() => {}); // the test that awaits it reports the error
      return [r.folder, help] as const;
    }),
);

/** Where else the summary of an eval is written from: the Harbor evals' report is in lib/harbor, and nightly takes the fields about its inputs from consolidate. */
const ALSO_FROM: Record<string, string[]> = { "evals/agent-ab": ["lib/harbor"], "benchmarks/terminal-bench": ["lib/harbor"], "evals/nightly": ["evals/consolidate/src"] };

/** The source of an eval, without its tests and fakes: what its summary.json is written from. */
function sourceOf(folder: string): string {
  const roots = [join(ROOT, folder, "src"), ...(ALSO_FROM[folder] ?? []).map((r) => join(ROOT, r))];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|py)$/.test(name) && !/(\.test\.ts|^test_.*\.py|^fakes\.ts)$/.test(name)) files.push(path);
    }
  };
  for (const root of roots) if (existsSync(root)) walk(root);
  return files.map((f) => readFileSync(f, "utf8")).join("\n");
}

/** Does the source write `key` into an object, as a property or a shorthand? akm_bin, akm_build, strategy and config_patch come in a spread. */
export function writes(src: string, key: string): boolean {
  if ((key === "akm_bin" || key === "akm_build") && src.includes("akmBuild(")) return true;
  if ((key === "strategy" || key === "config_patch") && src.includes("overrideSummary(")) return true;
  return new RegExp(`(?:^|[\\s{,"'])${key}["']?\\s*[:,}]`, "m").test(src);
}

describe("the table in the root README", () => {
  test("lists every eval and benchmark that has a run script, once", () => {
    const withRun = ["evals", "benchmarks"].flatMap((parent) => readdirSync(join(ROOT, parent)).filter((n) => existsSync(join(ROOT, parent, n, "run"))).map((n) => `${parent}/${n}`));
    expect(rows.map((r) => r.folder).sort()).toEqual(withRun.sort());
  });

  for (const row of rows) {
    describe(row.folder, () => {
      helpTest(row.folder)("lists the flags that its run --help lists, besides the common ones, and no other", async () => {
        const flags = helpFlags(await helps.get(row.folder)!);
        for (const c of COMMON) expect(flags).toContain(c);
        expect(flags.filter((f) => !LEFT_OUT.includes(f))).toEqual([...row.flags].sort());
      }, HELP_TIMEOUT_MS);

      helpTest(row.folder)("takes --corpus public|custom, as the README says every run does", async () => {
        expect(helpCorpora(await helps.get(row.folder)!)).toEqual(["custom", "public"]);
      }, HELP_TIMEOUT_MS);

      helpTest(row.folder)("COMPATIBILITY.md says 'or later' when the run stops on an older akm, with the version the help names", async () => {
        const akm = AKM.get(row.folder) ?? "";
        const said = /Needs akm (\S+) or later/.exec(await helps.get(row.folder)!);
        if (said) {
          expect(akm).toContain(said[1]);
          expect(akm).toContain("or later");
        } else {
          expect(akm).not.toContain("or later");
        }
        expect(akm.length).toBeGreaterThan(0);
      }, HELP_TIMEOUT_MS);
    });
  }

  test("says under the table what the seven evals that run a model through akm all record, and each of them writes it", () => {
    const line = README.split("\n").find((l) => l.startsWith("- **What a summary records.**")) ?? "";
    expect(line).not.toBe("");
    for (const key of COMMON_RECORDED) expect(line).toContain(`\`${key}\``);
    for (const folder of MODEL_EVALS) {
      const src = sourceOf(folder);
      const missing = COMMON_RECORDED.filter((k) => !writes(src, k));
      expect({ folder, missing }).toEqual({ folder, missing: [] });
    }
  });

  test("keeps the flags of the run scripts and of Harbor apart: --akm there is not a command", () => {
    const harbor = rows.filter((r) => r.folder.endsWith("agent-ab") || r.folder.endsWith("terminal-bench"));
    expect(harbor).toHaveLength(2);
    for (const r of harbor) expect(r.flags).toContain("--akm-env");
    expect(rows.filter((r) => r.flags.includes("--akm-env")).map((r) => r.folder).sort()).toEqual(harbor.map((r) => r.folder).sort());
  });
});

describe("the checks of the table", () => {
  test("writes() wants a key as a property or a shorthand, not as any word of the source", () => {
    expect(writes('const s = { metrics: columns(), status: "complete" };', "metrics")).toBe(true);
    expect(writes("return { model, limit };", "limit")).toBe(true);
    expect(writes('{ "seed": 1 }', "seed")).toBe(true);
    expect(writes("// metrics are scored per case\nconst status = 1;", "metrics")).toBe(false);
    expect(writes('const msg = "the model said no";', "model")).toBe(false);
    expect(writes("const outcome = status;", "status")).toBe(false);
  });

  test("a flag that the help gained, lost or renamed, or a corpus it dropped, is not what the table has", () => {
    const help = "Usage: x/run [--corpus public|private] [--limit N] [--label NAME] [--model ID]\n\n  --model  the model\n  --akm  the akm";
    expect(helpFlags(help)).toEqual(["--akm", "--corpus", "--label", "--limit", "--model"]);
    expect(helpFlags(help.replace("--model ID", "--models FILE"))).not.toEqual(helpFlags(help));
    expect(helpCorpora(help)).toEqual(["private", "public"]);
    expect(helpCorpora(help.replace("public|private", "public"))).toEqual(["public"]);
  });
});

describe("the documents that point at each other", () => {
  const docs = ["README.md", "COMPATIBILITY.md", "reports/README.md"];

  test("every relative link in them goes to a file or folder that exists", () => {
    const bad: string[] = [];
    for (const doc of docs) {
      for (const m of read(doc).matchAll(/\]\(([^)\s#]+)(?:#[^)]*)?\)/g)) {
        const target = m[1];
        if (/^[a-z]+:/.test(target)) continue;
        if (!existsSync(resolve(ROOT, dirname(doc), target))) bad.push(`${doc} -> ${target}`);
      }
    }
    expect(bad).toEqual([]);
  });

  test("the README links COMPATIBILITY.md and reports/README.md, and says what each folder of scripts/ is", () => {
    expect(README).toContain("(COMPATIBILITY.md)");
    expect(README).toContain("reports/README.md");
    for (const name of readdirSync(join(ROOT, "scripts"))) expect(README).toContain(`scripts/${name}`);
  });

  test("COMPATIBILITY.md has a row for every eval and benchmark in the table, and no other", () => {
    const folders = read("COMPATIBILITY.md")
      .split("\n")
      .filter((l) => /^\| `(evals|benchmarks)\//.test(l))
      .map((l) => ticks(l.split("|")[1])[0]);
    expect(folders.sort()).toEqual(rows.map((r) => r.folder).sort());
  });

  test("the README names every workflow file, and the workflows run what the README says", () => {
    for (const name of readdirSync(join(ROOT, ".github", "workflows"))) expect(README).toContain(name);
    expect(read(".github/workflows/check.yml")).toContain("scripts/check");
    expect(read(".github/workflows/akm-smoke.yml")).toContain("scripts/smoke/run");
    expect(read(".github/workflows/check.yml")).toContain("bun-version: 1.4.2");
  });
});
