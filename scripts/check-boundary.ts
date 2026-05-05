import fs from 'node:fs';
import path from 'node:path';

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"]@akm\/bench['"]/, 
  /from\s+['"]akm-bench\/src(?:\/[^'"]*)?['"]/, 
  /require\(\s*['"]@akm\/bench['"]\s*\)/,
  /require\(\s*['"]akm-bench\/src(?:\/[^'"]*)?['"]\s*\)/,
  /import\(\s*['"]@akm\/bench['"]\s*\)/,
  /import\(\s*['"]akm-bench\/src(?:\/[^'"]*)?['"]\s*\)/,
];

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

export interface BoundaryViolation {
  file: string;
  line: number;
  text: string;
}

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') {
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
    const lines = fs.readFileSync(file, 'utf8').split('\n');
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
    console.error('Boundary violations detected:');
    for (const violation of violations) {
      console.error(`- ${violation.file}:${violation.line} ${violation.text}`);
    }
  } else {
    console.log('Boundary check passed.');
  }
  return violations;
}

if (import.meta.main) {
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const violations = runBoundaryCheck(rootDir);
  process.exit(violations.length === 0 ? 0 : 1);
}
