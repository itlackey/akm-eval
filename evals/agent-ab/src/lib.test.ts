import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { goldText, libraryProblems, nudges, specOf, staleTokens } from "./lib.ts";
import { taskNames } from "./run.ts";

const EVAL_DIR = join(import.meta.dir, "..");
const TASKS = join(EVAL_DIR, "tasks");
const LIBRARIES = join(EVAL_DIR, "libraries");

describe("the public tasks", () => {
  const tasks = taskNames(TASKS);

  test("each declares the literals its verifier looks for, and its gold ref holds every one", () => {
    for (const t of tasks) {
      expect(specOf(join(TASKS, t)).tokens.length).toBeGreaterThan(0);
      expect({ task: t, problems: libraryProblems(join(TASKS, t), LIBRARIES) }).toEqual({ task: t, problems: [] });
    }
  });

  test("each declares only literals that its verifier or its solution has", () => {
    for (const t of tasks) expect({ task: t, stale: staleTokens(join(TASKS, t)) }).toEqual({ task: t, stale: [] });
  });

  test("none tells the agent to use akm or to consult a skill, and none names its gold ref", () => {
    for (const t of tasks) expect({ task: t, nudges: nudges(join(TASKS, t)) }).toEqual({ task: t, nudges: [] });
  });

  test("the az-cli skill and its memory teach one form for several tags, the one the az verifier accepts", () => {
    const skill = readFileSync(join(LIBRARIES, "az-cli", "skills", "az-cli", "SKILL.md"), "utf8");
    const memory = readFileSync(join(LIBRARIES, "az-cli", "memories", "compound-tag-filter.md"), "utf8");
    const repeated = /az resource list [^\n`]*--tag \S+ --tag \S+/;
    expect(skill).toMatch(repeated);
    expect(memory).toMatch(repeated);
    // A JMESPath filter on two tags is the form the verifier rejects.
    for (const text of [skill, memory]) expect(text).not.toMatch(/--query "\[\?[^"]*&&/);
  });
});

describe("a task and its library", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-ab-lib-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const put = (rel: string, text: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  };
  const toml = (stash: string, ref: string, tokens: string[]) =>
    `[metadata]\ngold_ref = "${ref}"\nlibrary_tokens = [${tokens.map((t) => JSON.stringify(t)).join(", ")}]\n\n[environment.env]\nAKM_TASK_STASH = "${stash}"\n`;

  put("libraries/tool/skills/tool/SKILL.md", "# tool\n\nRun `tool scale <name> --replicas <n>`.\n");
  put("libraries/tool/skills/tool/.stash.json", '{"entries":[{"searchHints":["tool --secret-flag"]}]}');
  put("libraries/tool/knowledge/notes.md", "Use --verbose to see more.\n");
  const libraries = join(root, "libraries");

  test("reads the files of a folder ref without akm's index, and the .md file of a file ref", () => {
    expect(goldText(libraries, "tool", "skills/tool")).toContain("--replicas");
    expect(goldText(libraries, "tool", "skills/tool")).not.toContain("--secret-flag");
    expect(goldText(libraries, "tool", "knowledge/notes")).toContain("--verbose");
    expect(goldText(libraries, "tool", "skills/none")).toBeUndefined();
  });

  test("passes when the gold ref holds every token", () => {
    put("tasks/a/task.toml", toml("tool", "skills/tool", ["scale", "--replicas"]));
    expect(libraryProblems(join(root, "tasks", "a"), libraries)).toEqual([]);
  });

  test("names each token the gold ref lacks, including one only akm's index has", () => {
    put("tasks/b/task.toml", toml("tool", "skills/tool", ["scale", "--env-file", "--secret-flag"]));
    expect(libraryProblems(join(root, "tasks", "b"), libraries)).toEqual([
      'the gold ref skills/tool does not contain "--env-file", which the verifier looks for',
      'the gold ref skills/tool does not contain "--secret-flag", which the verifier looks for',
    ]);
  });

  test("names a gold ref that is not in the library", () => {
    put("tasks/c/task.toml", toml("tool", "skills/other", ["scale"]));
    expect(libraryProblems(join(root, "tasks", "c"), libraries)).toEqual(["the gold ref skills/other is not in the library tool"]);
  });

  test("a task that declares no tokens has nothing to check", () => {
    put("tasks/d/task.toml", '[metadata]\ntools = "fictional"\n');
    expect(libraryProblems(join(root, "tasks", "d"), libraries)).toEqual([]);
    expect(specOf(join(root, "tasks", "d")).tokens).toEqual([]);
  });

  test("finds a declared token that neither the verifier nor the solution has", () => {
    put("tasks/e/task.toml", toml("tool", "skills/tool", ["scale", "--replicas", "--gone"]));
    put("tasks/e/tests/verify.sh", 'FLAGS=([--replicas]=4)\n[ "$1" = scale ]\n');
    put("tasks/e/solution/solve.sh", "echo tool scale x --replicas 4\n");
    expect(staleTokens(join(root, "tasks", "e"))).toEqual(["--gone"]);
  });

  test("finds what points the agent at akm, a skill or the ref, in the instruction and the starting files", () => {
    put("tasks/f/task.toml", toml("tool", "skills/tool", ["scale"]));
    put("tasks/f/instruction.md", "Scale the cluster. Run `akm search` first.\n");
    put("tasks/f/environment/workspace/README.md", "Consult the tool skill for the syntax.\n");
    put("tasks/f/environment/workspace/note.txt", "ref: skills/tool\n");
    put("tasks/f/environment/workspace/runbook.txt", "scale the cluster\n");
    expect(nudges(join(root, "tasks", "f"))).toEqual(['instruction.md says "akm"', 'environment/workspace/README.md says "Consult"', 'environment/workspace/note.txt says "skills"']);
  });

  test("finds the gold ref when it is not under a word that already says skill", () => {
    put("tasks/h/task.toml", toml("tool", "knowledge/notes", ["verbose"]));
    put("tasks/h/instruction.md", "Read knowledge/notes and then scale the cluster.\n");
    expect(nudges(join(root, "tasks", "h"))).toEqual(['instruction.md says "knowledge/notes"']);
  });

  test("a clean instruction and workspace have none", () => {
    put("tasks/g/task.toml", toml("tool", "skills/tool", ["scale"]));
    put("tasks/g/instruction.md", "Scale the cluster to 4 replicas.\n");
    put("tasks/g/environment/workspace/runbook.txt", "scale the cluster\n");
    expect(nudges(join(root, "tasks", "g"))).toEqual([]);
  });
});
