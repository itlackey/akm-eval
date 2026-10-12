import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chain, checkListed, importClosure } from "./closure.ts";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A repository with the given files, from the repository root. */
function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "closure-test-"));
  dirs.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

describe("the files a set of entry points reaches", () => {
  test("follows static imports, re-exports, dynamic imports and require, to the end, and each file once", () => {
    const root = repo({
      "a/entry.ts": 'import { b } from "./b.ts";\nexport * from "../lib/star.ts";\nexport { c } from "../lib/c.ts";\nconst d = await import("../lib/dyn.ts");\nconst e = require("../lib/req.ts");\nimport "../lib/effect.ts";\n',
      "a/b.ts": 'import { entry } from "./entry.ts";\nimport { deep } from "../lib/deep/index.ts";\nexport const b = entry;\n', // a cycle
      "lib/star.ts": "export const star = 1;\n",
      "lib/c.ts": 'export const c = 1;\nexport { deeper } from "./deeper.ts";\n',
      "lib/deeper.ts": "export const deeper = 1;\n",
      "lib/dyn.ts": "export const dyn = 1;\n",
      "lib/req.ts": "module.exports = 1;\n",
      "lib/effect.ts": "console.log(1);\n",
      "lib/deep/index.ts": "export const deep = 1;\n",
      "lib/unrelated.ts": "export const unrelated = 1;\n",
    });
    const closure = importClosure(["a/entry.ts"], root);
    expect(closure.files).toEqual(["a/b.ts", "a/entry.ts", "lib/c.ts", "lib/deep/index.ts", "lib/deeper.ts", "lib/dyn.ts", "lib/effect.ts", "lib/req.ts", "lib/star.ts"]);
    expect(chain(closure, "lib/deeper.ts")).toBe("a/entry.ts -> lib/c.ts -> lib/deeper.ts");
    expect(chain(closure, "a/entry.ts")).toBe("a/entry.ts");
  });

  test("resolves a path without its extension and a folder to its index, and covers a json file without reading it", () => {
    const root = repo({
      "a/entry.ts": 'import x from "./x";\nimport y from "../lib/folder";\nimport data from "./data.json";\n',
      "a/x.ts": "export default 1;\n",
      "lib/folder/index.ts": "export default 2;\n",
      "a/data.json": '{"import": "./nothing.ts"}',
    });
    expect(importClosure(["a/entry.ts"], root).files).toEqual(["a/data.json", "a/entry.ts", "a/x.ts", "lib/folder/index.ts"]);
  });

  test("does not take a name in a comment or a string, a type-only import, a package or a node module for an import", () => {
    const root = repo({
      "a/entry.ts": [
        '// import { gone } from "./comment.ts";',
        "/* import { gone } from './block.ts'; */",
        "const s = 'import x from \"./string.ts\"';",
        'import type { T } from "./types.ts";',
        'import { type U } from "./only-types.ts";',
        'import { readFileSync } from "node:fs";',
        'import { Database } from "bun:sqlite";',
        'import yaml from "yaml";',
        "export const x = 1;",
      ].join("\n"),
    });
    expect(importClosure(["a/entry.ts"], root).files).toEqual(["a/entry.ts"]);
  });

  test("reads a script that starts with a shebang line, and follows what it imports (#73)", () => {
    const root = repo({
      "a/entry.ts": '#!/usr/bin/env bun\n// a script\nimport { b } from "./b.ts";\nexport const x = b;\n',
      "a/b.ts": '#!/usr/bin/env node\r\nimport { c } from "../lib/c.ts";\r\nexport const b = c;\r\n', // a line feed and a carriage return both end the line
      "lib/c.ts": "#!/usr/bin/env bun\nexport const c = 1;\n", // a shebang and nothing else to follow
      "a/only.ts": "#!/usr/bin/env bun",
    });
    expect(importClosure(["a/entry.ts"], root).files).toEqual(["a/b.ts", "a/entry.ts", "lib/c.ts"]);
    expect(importClosure(["a/only.ts"], root).files).toEqual(["a/only.ts"]);
    // a script of this repository that starts with one, and the lexicon it imports
    expect(importClosure(["lib/rewrite/rewrite.ts"], join(import.meta.dir, "..")).files).toContain("lib/rewrite/lexicon.ts");
    // only the first line is a shebang: a later line that starts with #! is still a syntax error, and says so
    expect(() => importClosure(["a/late.ts"], repo({ "a/late.ts": 'import { x } from "./x.ts";\n#!/usr/bin/env bun\n', "a/x.ts": "export const x = 1;\n" }))).toThrow("a/late.ts: its imports cannot be read");
  });

  test("stops at the files it is told to leave to another part, with what they import", () => {
    const root = repo({
      "a/collect.ts": 'import { makeRow } from "./score.ts";\nimport { run } from "../lib/run.ts";\n',
      "a/score.ts": 'import { check } from "./checks.ts";\n',
      "a/checks.ts": "export const check = 1;\n",
      "lib/run.ts": "export const run = 1;\n",
    });
    expect(importClosure(["a/collect.ts"], root, new Set(["a/score.ts"])).files).toEqual(["a/collect.ts", "lib/run.ts"]);
    expect(importClosure(["a/collect.ts"], root).files).toEqual(["a/checks.ts", "a/collect.ts", "a/score.ts", "lib/run.ts"]);
  });

  test("names an import that does not exist, one that leaves the repository, a listed file that is missing and a file it cannot read", () => {
    const root = repo({
      "a/gone.ts": 'import { x } from "./nowhere.ts";\n',
      "a/out.ts": 'import { x } from "../../outside.ts";\n',
      "a/broken.ts": "import { from ;;; \n",
    });
    expect(() => importClosure(["a/gone.ts"], root)).toThrow("a/gone.ts imports ./nowhere.ts, which does not exist");
    expect(() => importClosure(["a/out.ts"], root)).toThrow("a/out.ts imports ../../outside.ts, which is outside the repository");
    expect(() => importClosure(["a/missing.ts"], root)).toThrow("a/missing.ts is listed in a measurement and does not exist");
    expect(() => importClosure(["a/broken.ts"], root)).toThrow("a/broken.ts: its imports cannot be read");
    expect(() => checkListed("../x.ts", root)).toThrow("a measured file is named from the repository root, with forward slashes");
  });

  test("follows what a Python file imports from the repository: relative imports, and modules next to it", () => {
    const root = repo({
      "py/main.py": ["from __future__ import annotations", "import os, json", "import helper", "from . import sibling, nothing_here", "from .pkg import thing", "from ..up import rise", "import urllib.request as req  # import not_this"].join("\n"),
      "py/helper.py": "import deeper\n",
      "py/deeper.py": "X = 1\n",
      "py/sibling.py": "Y = 1\n",
      "py/pkg/__init__.py": "thing = 1\n",
      "up.py": "rise = 1\n",
      "py/json.py": "# a module of the repository that has the name of a standard one is what runs\n",
      "py/unused.py": "Z = 1\n",
    });
    expect(importClosure(["py/main.py"], root).files).toEqual(["py/deeper.py", "py/helper.py", "py/json.py", "py/main.py", "py/pkg/__init__.py", "py/sibling.py", "up.py"]);
    expect(() => importClosure(["py/bad.py"], repo({ "py/bad.py": "from .nowhere import x\n" }))).toThrow("py/bad.py imports nowhere, which does not exist in the repository");
  });
});
