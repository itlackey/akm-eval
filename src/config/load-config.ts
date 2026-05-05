import fs from 'node:fs';
import path from 'node:path';
import type { EvalConfig } from '../core/types.ts';
import { validateConfig } from './validate-config.ts';
import { resolveConfigPaths } from './resolve-paths.ts';

export function loadConfig(configPath: string): EvalConfig {
  const absolutePath = path.resolve(configPath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  const config = validateConfig(parsed);
  return resolveConfigPaths(config, path.dirname(absolutePath));
}
