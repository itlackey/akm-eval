import fs from "node:fs";
import path from "node:path";

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"]@akm\/bench['"]/,
  /from\s+['"]akm-bench\/src(?:\/[^'"]*)?['"]/,
  /require\(\s*['"]@akm\/bench['"]\s*\)/,
  /require\(\s*['"]akm-bench\/src(?:\/[^'"]*)?['"]\s*\)/,
  /import\(\s*['"]@akm\/bench['"]\s*\)/,
  /import\(\s*['"]akm-bench\/src(?:\/[^'"]*)?['"]\s*\)/,
];

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/**
 * Directories the walker must never descend into.
 *
 * The boundary check only ever looks for forbidden imports in this repo's own
 * source. Output trees are not source, so reading them is pure cost -- and
 * actively harmful: `runs/` holds per-run artifacts written by `bin/eval`
 * inside a container running as root, so the walker hits EACCES on a clean
 * tree and fails the gate for a reason that has nothing to do with
 * boundaries. `datasets/` is worse still on cost alone
 * (`datasets/longmemeval/dataset.json` is 277MB).
 */
export const SKIP_DIRS = new Set([".git", "node_modules", "runs", "datasets", ".akm"]);

export interface BoundaryViolation {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (CODE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

export function findBoundaryViolations(rootDir: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  for (const file of walk(rootDir)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (FORBIDDEN_IMPORT_PATTERNS.some((pattern) => pattern.test(line))) {
        violations.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
  return violations;
}

export function runBoundaryCheck(rootDir: string): BoundaryViolation[] {
  const violations = findBoundaryViolations(rootDir);
  if (violations.length > 0) {
    console.error("Boundary violations detected:");
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line} ${violation.text}`);
    }
  } else {
    console.log("Boundary check passed.");
  }
  return violations;
}

if (import.meta.main) {
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const violations = runBoundaryCheck(rootDir);
  process.exit(violations.length === 0 ? 0 : 1);
}
