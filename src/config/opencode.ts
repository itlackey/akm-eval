/**
 * akm-eval opencode config discovery.
 *
 * Resolves the opencode config using a simple chain:
 *   1. `EVAL_OPENCODE_CONFIG` env var (absolute path).
 *   2. `config/opencode.local.json`.
 *   3. `config/opencode.json`.
 *   4. Throw.
 *
 * Packs and agent runners can import this to resolve an opencode config
 * without depending on the global CLI flow.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EvalConfigError, type LoadedOpencodeConfig, loadOpencodeConfig } from '../opencode-config.ts'

const PROJECT_ROOT = path.resolve(import.meta.dir, '..', '..')

/**
 * Resolve the opencode config using the discovery chain and load it.
 *
 *   1. `EVAL_OPENCODE_CONFIG` env var (absolute path).
 *   2. `config/opencode.local.json`.
 *   3. `config/opencode.json`.
 *   4. Throw.
 */
export function resolveOpencodeConfig(): LoadedOpencodeConfig {
  // 1. EVAL_OPENCODE_CONFIG env var wins.
  const envPath = process.env.EVAL_OPENCODE_CONFIG
  if (envPath && envPath.length > 0) {
    return loadOpencodeConfig(path.isAbsolute(envPath) ? envPath : path.resolve(envPath))
  }

  // 2. Repo-local fallbacks.
  const repoLocalPath = path.resolve(PROJECT_ROOT, 'config', 'opencode.local.json')
  if (fs.existsSync(repoLocalPath)) {
    return loadOpencodeConfig(repoLocalPath)
  }
  const repoFixturePath = path.resolve(PROJECT_ROOT, 'config', 'opencode.json')
  if (fs.existsSync(repoFixturePath)) {
    return loadOpencodeConfig(repoFixturePath)
  }

  // 3. No config found.
  throw new EvalConfigError(
    'eval run config: no opencode config found. Set EVAL_OPENCODE_CONFIG explicitly, or create config/opencode.json.',
    true,
  )
}
