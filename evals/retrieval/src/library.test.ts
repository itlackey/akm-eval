import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { isTask, parseQrels, parseQueries } from "./lib.ts";
import { domainMix, filesOf, groupOf, libraryRefs, mixTable, pathsNamedBy, refOfFile } from "./library.ts";
import { publicMix } from "./mix.ts";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
const LIBRARY = join(ROOT, "corpus", "library");
const ASSETS = join(ROOT, "evals", "retrieval", "assets");
const BOOKS = join(ASSETS, "books");

const text = (path: string): string => readFileSync(path, "utf8");
const refs = (note: string, path: string): string | null => refOfFile(path, () => note);

describe("refOfFile", () => {
  test("a skill is its folder, and a note or a script of a skill keeps the whole path", () => {
    expect(refs("", "skills/print/pagedjs/SKILL.md")).toBe("skills/print/pagedjs");
    expect(refs("# Notes", "skills/ai-skills/agent-cli-tools/references/codex.md")).toBe("knowledge/skills/ai-skills/agent-cli-tools/references/codex");
    expect(refs("", "skills/print/print-utilities/scripts/compare-pdf.ts")).toBe("scripts/skills/print/print-utilities/scripts/compare-pdf.ts");
    expect(refs("", "scripts/skills/coding/technical-debt-workflow/run_pilot.py")).toBe("scripts/skills/coding/technical-debt-workflow/run_pilot.py");
    expect(refs("# Rubric", "scripts/skills/coding/technical-debt-workflow/evaluations/rubric.md")).toBe("knowledge/scripts/skills/coding/technical-debt-workflow/evaluations/rubric");
  });

  test("a note in a type folder keeps the type of its folder", () => {
    expect(refs("# Guide", "knowledge/print/guide.md")).toBe("knowledge/print/guide");
    expect(refs("# Writer", "agents/writing/content-writer.md")).toBe("agents/writing/content-writer");
    expect(refs("# Build", "commands/print/build-pdf.md")).toBe("commands/print/build-pdf");
    expect(refs("# Flow", "workflows/coding/lifecycle.md")).toBe("workflows/coding/lifecycle");
    expect(refs("# Lesson", "lessons/dont-crowd-the-pan.md")).toBe("lessons/dont-crowd-the-pan");
  });

  test("what a note says comes before where it sits", () => {
    expect(refs("---\ntools:\n  - search\n---\n# A", "knowledge/x/a.md")).toBe("agents/knowledge/x/a");
    expect(refs("---\ntools:\n  - search\n---\n# A", "agents/a.md")).toBe("agents/a");
    expect(refs("Run it with $ARGUMENTS", "skills/s/references/commands.md")).toBe("commands/skills/s/references/commands");
    expect(refs("Move $1 to $2", "skills/s/references/mv.md")).toBe("commands/skills/s/references/mv");
    expect(refs("---\nagent: build\n---\n# Run", "commands/run.md")).toBe("commands/run");
    expect(refs("It costs $10 a month", "skills/s/references/price.md")).toBe("knowledge/skills/s/references/price");
    expect(refs("---\ndescription: tools: are listed below\n---\n# A", "agents/a.md")).toBe("agents/a");
  });

  test("a file that is not an asset has no ref", () => {
    expect(refs("# Library", "README.md")).toBeNull();
    expect(refs("{}", "skills/s/config.json")).toBeNull();
    expect(refs("", "skills/s/assets/.gitkeep")).toBeNull();
    expect(refs("", "skills/s/scripts/delegate.mjs")).toBeNull();
  });

  test("the two files that akm#1050 is about claim one ref, the original and its projection", () => {
    const a = refs("# Config", "skills/ai-skills/opencode-extensions/references/config.md");
    const b = refs("# Config", "knowledge/skills/ai-skills/opencode-extensions/references/config.md");
    expect(a).toBe("knowledge/skills/ai-skills/opencode-extensions/references/config");
    expect(b).toBe(a);
  });
});

describe("pathsNamedBy", () => {
  test("finds a file under one of the skill's folders, in a list, a sentence or a command", () => {
    expect(pathsNamedBy("- `references/print-quality-checklist.md` - Visual review\nSee references/foo.md.\n  --standards-file references/print-standards.md \\")).toEqual([
      "references/print-quality-checklist.md",
      "references/foo.md",
      "references/print-standards.md",
    ]);
    expect(pathsNamedBy("python scripts/analyze_metrics.py /path/in.pdf")).toEqual(["scripts/analyze_metrics.py"]);
  });

  test("leaves out a folder, a wildcard, a variable, a placeholder, a path of another folder and a citation of another project", () => {
    expect(pathsNamedBy("the references/ folder, scripts/*.py, $TEMP_DIR/pages/a.png, ${DIR}/scripts/a.sh, <skill>/references/a.md, tests/auth.setup.ts")).toEqual([]);
    expect(pathsNamedBy("(`packages/cli/README.md:55-61`, `examples/guide/07-setup.md:1-19`)")).toEqual([]);
  });
});

describe("the public library", () => {
  const byRef = libraryRefs(LIBRARY);

  test("no two files resolve to one akm ref", () => {
    const claimed = [...byRef].filter(([, files]) => files.length > 1).map(([ref, files]) => `${ref}: ${files.join(", ")}`);
    expect(claimed).toEqual([]);
  });

  test("holds no projection of a skill: a file in agents/, commands/, knowledge/ or scripts/ under skills/ is not a copy of a file of skills/, and sits under a skill", () => {
    const projected = filesOf(LIBRARY).filter((p) => /^(agents|commands|knowledge|scripts)\/skills\//.test(p));
    expect(projected.length).toBeGreaterThan(0); // the technical debt skill's scripts and evaluation notes
    const problems: string[] = [];
    for (const path of projected) {
      const rest = path.split("/").slice(2).join("/");
      if (existsSync(join(LIBRARY, "skills", rest))) problems.push(`${path} is a copy of skills/${rest}`);
      const folders = rest.split("/").slice(0, -1);
      const owner = folders.map((_, i) => folders.slice(0, i + 1).join("/")).some((dir) => existsSync(join(LIBRARY, "skills", dir, "SKILL.md")));
      if (!owner) problems.push(`${path} sits under no skill`);
    }
    expect(problems).toEqual([]);
  });

  test("every asset the qrels grade, and every asset a query expects, is a file of the library", () => {
    const qrels = parseQrels(text(join(ASSETS, "qrels.jsonl")));
    const queries = parseQueries(text(join(ASSETS, "queries.jsonl")));
    const named = new Set([...qrels.map((r) => r.ref), ...queries.flatMap((q) => q.expected ?? [])]);
    expect([...named].filter((ref) => !byRef.has(ref))).toEqual([]);
  });

  test("every task query has a row in the qrels, and no row is of a query that is not in the file", () => {
    const qrels = parseQrels(text(join(ASSETS, "qrels.jsonl")));
    const queries = parseQueries(text(join(ASSETS, "queries.jsonl")));
    const graded = new Set(qrels.map((r) => r.id));
    expect(queries.filter((q) => isTask(q) && !graded.has(q.id)).map((q) => q.id)).toEqual([]);
    expect([...graded].filter((id) => !queries.some((q) => q.id === id))).toEqual([]);
  });

  test("the books' library has no two files for one ref either, and its judgments name files", () => {
    const books = libraryRefs(join(BOOKS, "library"));
    expect([...books].filter(([, files]) => files.length > 1)).toEqual([]);
    const named = new Set([...parseQrels(text(join(BOOKS, "qrels.jsonl"))).map((r) => r.ref)]);
    expect([...named].filter((ref) => !books.has(ref))).toEqual([]);
  });

  test("holds the assets by type that the READMEs count", () => {
    // akm counted 259 when the qrels were made: 35 skills, 111 knowledge notes, 58 scripts, 25 commands, 24 agents and 6 workflows. Since then 5 agents
    // and 2 commands that were copies of knowledge notes under refs of their own, and a script copy, were removed from the library.
    const count = (type: string) => [...byRef.keys()].filter((r) => r.startsWith(`${type}/`)).length;
    expect(["skills", "knowledge", "scripts", "commands", "agents", "workflows"].map(count)).toEqual([35, 111, 57, 23, 19, 6]);
  });
});

describe("the skills of the public library", () => {
  const skills = filesOf(LIBRARY).filter((p) => p.startsWith("skills/") && p.endsWith("/SKILL.md"));

  test("a SKILL.md names only files that exist", () => {
    // A relative path in a skill is the skill's own folder, else the library's root. These do not name a file of the library: the scripts and
    // settings of the PDF layout pipeline, which its SKILL.md says are not part of the library, and a path in a project the skill cites with
    // a line number (`examples/guide.md:1-19`).
    const outside: Record<string, RegExp> = { "skills/print/pdf-layout-reviewer/SKILL.md": /^(scripts|config)\// };
    const missing: string[] = [];
    for (const skill of skills) {
      const dir = dirname(skill);
      const body = text(join(LIBRARY, skill));
      for (const named of pathsNamedBy(body)) {
        if (outside[skill]?.test(named)) continue;
        if (!existsSync(join(LIBRARY, dir, named)) && !existsSync(join(LIBRARY, named))) missing.push(`${skill}: ${named}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("the pdf-review and pdf-layout-reviewer references are in their skills", () => {
    for (const path of [
      "skills/print/pdf-review/references/print-quality-checklist.md",
      "skills/print/pdf-review/references/ttrpg-standards.md",
      "skills/print/pdf-layout-reviewer/references/print-standards.md",
      "skills/print/pdf-layout-reviewer/references/common-issues.md",
      "skills/print/pdf-layout-reviewer/references/vlm-prompts.md",
    ]) expect(existsSync(join(LIBRARY, path))).toBe(true);
  });

  test("the README names every skill, and none that the library leaves out", () => {
    const readme = text(join(LIBRARY, "README.md"));
    const names = skills.map((p) => dirname(p).slice("skills/".length));
    expect(readme).toContain(`Each of the ${names.length} skills`);
    expect(names.filter((name) => !readme.includes(name.split("/").pop() as string))).toEqual([]);
    for (const left of ["application-security-review", "ux-dom-audit", "agent-team-reporting"]) expect(names.some((n) => n.endsWith(left))).toBe(false);
  });

  test("no file names the private bundle the library came from, and no name in the front matter is a path", () => {
    const files = filesOf(LIBRARY).filter((p) => !p.endsWith(".icc"));
    expect(files.filter((p) => /\bakm-shared\b/.test(text(join(LIBRARY, p))))).toEqual([]);
    const front = (p: string) => /^---\r?\n([\s\S]*?)\r?\n---/.exec(text(join(LIBRARY, p)))?.[1] ?? "";
    expect(files.filter((p) => p.endsWith(".md") && /^name:\s*\S*\//m.test(front(p)))).toEqual([]);
  });
});

describe("the domain mix", () => {
  test("groupOf puts an asset of a skill in the top-level group of the skill, and any other asset with its folder or its name", () => {
    expect(groupOf("skills/print/pagedjs")).toBe("print");
    expect(groupOf("skills/notify")).toBe("notify");
    expect(groupOf("knowledge/skills/ai-skills/opencode-extensions/references/config")).toBe("ai-skills");
    expect(groupOf("scripts/skills/coding/technical-debt-workflow/run_pilot.py")).toBe("coding");
    expect(groupOf("knowledge/scripts/skills/coding/technical-debt-workflow/evaluations/rubric")).toBe("coding");
    expect(groupOf("commands/skills/ai-skills/agent-cli-tools/references/goose")).toBe("ai-skills");
    expect(groupOf("scripts/skills/e2e-testing/references/playwright-auth-fixture.ts")).toBe("e2e-testing");
    expect(groupOf("agents/print/qa-coordinator")).toBe("print");
    expect(groupOf("agents/playwright/test-coverage-judge")).toBe("e2e-testing");
    expect(groupOf("commands/coding/technical-debt/assess-technical-debt")).toBe("coding");
    expect(groupOf("agents/report-writer")).toBe("reports");
    expect(groupOf("workflows/print-spread-qa-loop")).toBe("print");
    expect(groupOf("commands/implement-tasks")).toBe("dev-workflow");
    expect(groupOf("workflows/research-to-knowledge")).toBe("other");
  });

  test("counts the assets and the pairs of each group, the most graded group first", () => {
    const mix = domainMix(["skills/a/one", "skills/a/two", "skills/b", "agents/print/x"], [
      { ref: "skills/a/one", grade: 3 },
      { ref: "knowledge/skills/a/two/references/r", grade: 1 },
      { ref: "skills/b", grade: 2 },
      { ref: "skills/a/two", grade: 0 },
    ]);
    expect(mix).toEqual([
      { group: "a", assets: 2, rows: 3, relevant: 1 },
      { group: "b", assets: 1, rows: 1, relevant: 1 },
      { group: "print", assets: 1, rows: 0, relevant: 0 },
    ]);
    expect(mixTable(mix).split("\n")).toEqual([
      "| Group | Assets | Graded rows | Share of rows | Relevant rows |",
      "|---|---:|---:|---:|---:|",
      "| a | 2 | 3 | 75.0% | 1 |",
      "| b | 1 | 1 | 25.0% | 1 |",
      "| print | 1 | 0 | 0.0% | 0 |",
      "| all | 4 | 4 | 100.0% | 2 |",
    ]);
  });

  test("a library with no graded pair prints no share", () => {
    expect(mixTable(domainMix(["skills/a"], [])).split("\n").at(-1)).toBe("| all | 1 | 0 | 100.0% | 0 |");
  });

  test("covers every asset of the library and every graded pair of the qrels", () => {
    const mix = publicMix();
    expect(mix.reduce((n, r) => n + r.assets, 0)).toBe(libraryRefs(LIBRARY).size);
    const pairs = new Set(parseQrels(text(join(ASSETS, "qrels.jsonl"))).map((r) => `${r.id}\t${r.ref}`));
    expect(mix.reduce((n, r) => n + r.rows, 0)).toBe(pairs.size);
  });

  test("the table in the README is the one mix.ts prints", () => {
    const readme = text(join(ROOT, "evals", "retrieval", "README.md"));
    expect(readme).toContain(mixTable(publicMix()));
  });
});
