// The files a measured part covers: the files an eval lists, and every file of the repository that they import, and that those import.
// The listed files are the entry points. An edit to a file that is only reached through an import (a helper in lib/ that decides which
// variables akm gets, say) changes what the part does as much as an edit to a listed file, so it changes the digest too. See
// lib/manifest.ts and the README's "How results stay comparable".
//
// What is followed: relative imports of TypeScript and JavaScript (`import ... from "./x.ts"`, `export ... from`, `import("./x.ts")`,
// `require("./x.ts")`), read with bun's own parser, so a name in a comment or a string is not an import and a type-only import, which is
// gone when the file runs, is not followed. A relative import of a file that is not code (a .json) is covered and not read. For Python,
// `from .x import y`, `from . import x`, and `import x` where x is a module next to the file. What is not followed: packages (their
// versions are in the lockfiles), a path built at run time (`join(import.meta.dir, "x.json")`), and a file read or a script run by its
// name. List such a file as an entry point.

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, posix } from "node:path";

/** Checks that a listed file is named from the repository root with forward slashes, and exists. Throws a message naming it. */
export function checkListed(file: string, root: string): void {
  if (isAbsolute(file) || file.split("/").includes("..") || file.includes("\\")) throw new Error(`${file}: a measured file is named from the repository root, with forward slashes`);
  if (!existsSync(join(root, file))) throw new Error(`${file} is listed in a measurement and does not exist`);
}

/** The files a set of entry points reaches, with how each was reached. */
export interface Closure {
  /** The entry points and every file they import, from the repository root, in order. */
  files: string[];
  /** For each file, the file that first imported it, or null for an entry point. */
  from: Map<string, string | null>;
}

/** The path of a file from an entry point, for a message: `a.ts -> b.ts -> c.ts`. */
export function chain(closure: Closure, file: string): string {
  const path: string[] = [];
  for (let at: string | null | undefined = file; at != null; at = closure.from.get(at)) path.unshift(at);
  return path.join(" -> ");
}

const CODE: Record<string, "ts" | "tsx" | "js" | "jsx"> = { ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js", ".cjs": "js", ".jsx": "jsx" };
const EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs", ".json"];

const isFile = (root: string, rel: string): boolean => {
  try {
    return statSync(join(root, rel)).isFile();
  } catch {
    return false;
  }
};

/** The file a relative import names: as written, with an extension, or the index of a folder. */
function resolveFile(root: string, rel: string): string | null {
  for (const candidate of [rel, ...EXTENSIONS.map((e) => rel + e), ...EXTENSIONS.map((e) => `${rel}/index${e}`)]) if (isFile(root, candidate)) return candidate;
  return null;
}

/** The files a TypeScript or JavaScript file imports, as the specifiers it writes: only relative ones. */
function scriptImports(file: string, text: string, loader: "ts" | "tsx" | "js" | "jsx"): string[] {
  try {
    return new Bun.Transpiler({ loader }).scanImports(text).map((i) => i.path).filter((p) => p.startsWith("./") || p.startsWith("../"));
  } catch (e) {
    throw new Error(`${file}: its imports cannot be read, so the files it covers cannot be listed (${(e as Error).message.split("\n")[0]})`);
  }
}

/** The first word of each item of "a, b as c, (d)": the names an import statement brings in. */
const importedNames = (list: string): string[] => list.replace(/[()]/g, " ").split(",").map((item) => item.trim().split(/\s+/)[0] ?? "").filter((name) => /^[\w.]+$/.test(name));

/** The files a Python file imports that sit in the repository: a relative import, or a module next to the file. */
function pythonImports(root: string, file: string, text: string): string[] {
  const found: string[] = [];
  const module = (base: string, dotted: string, mustExist: boolean): void => {
    const rel = posix.join(base, ...dotted.split("."));
    const hit = [`${rel}.py`, `${rel}/__init__.py`].find((c) => isFile(root, c));
    if (hit) found.push(hit);
    else if (mustExist) throw new Error(`${file} imports ${dotted}, which does not exist in the repository`);
  };
  const dir = posix.dirname(file);
  for (const m of text.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n#]*)/gm)) {
    const [, dots = "", name = "", names = ""] = m;
    let base = dir;
    for (let i = 1; i < dots.length; i++) base = posix.dirname(base);
    if (dots !== "" && isFile(root, posix.join(base, "__init__.py"))) found.push(posix.join(base, "__init__.py"));
    if (name !== "") module(base, name, dots !== "");
    else for (const each of importedNames(names)) module(base, each, false); // `from . import x`: x is a module here, or a name in __init__.py
  }
  for (const m of text.matchAll(/^[ \t]*import[ \t]+([^\n#]*)/gm)) for (const each of importedNames(m[1] ?? "")) module(dir, each, false);
  return found;
}

/**
 * The entry points and every file of the repository they import, followed to the end. A file named in `stop` is neither included nor
 * followed: it belongs to another part. Throws a message naming a relative import that goes nowhere, or leaves the repository.
 */
export function importClosure(entries: string[], root: string, stop: ReadonlySet<string> = new Set()): Closure {
  const from = new Map<string, string | null>();
  const queue: string[] = [];
  for (const file of [...entries].sort()) {
    checkListed(file, root);
    from.set(file, null);
    queue.push(file);
  }
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    const ext = posix.extname(at);
    const loader = CODE[ext];
    if (loader === undefined && ext !== ".py") continue; // a file that is not code is covered and not read
    const text = readFileSync(join(root, at), "utf8");
    const reached: string[] = [];
    if (loader !== undefined) {
      for (const spec of scriptImports(at, text, loader)) {
        const rel = posix.normalize(posix.join(posix.dirname(at), spec));
        if (rel.startsWith("../") || rel === "..") throw new Error(`${at} imports ${spec}, which is outside the repository`);
        const hit = resolveFile(root, rel);
        if (hit === null) throw new Error(`${at} imports ${spec}, which does not exist`);
        reached.push(hit);
      }
    } else reached.push(...pythonImports(root, at, text));
    for (const hit of reached.sort()) {
      if (from.has(hit) || stop.has(hit)) continue;
      from.set(hit, at);
      queue.push(hit);
    }
  }
  return { files: [...from.keys()].sort(), from };
}
