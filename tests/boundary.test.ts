import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';
import { findBoundaryViolations } from '../scripts/check-boundary.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('boundary checker', () => {
  test('passes repository sources', () => {
    const violations = findBoundaryViolations(rootDir);
    expect(violations).toEqual([]);
  });
});
