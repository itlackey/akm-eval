// `--strategy NAME` and `--config-patch FILE`, for the evals that run an akm improve strategy: they let a run use another strategy,
// or another config, than the eval's own, to measure it against the default. Each eval parses the two with parseOverrides, writes its
// config through patchedConfig, passes `strategy` to akm, and puts overrideSummary in its summary.json.
//
//   const overrides = parseOverrides(values, "reflect-only", fail);
//   writeConfig(sandbox, patchedConfig(reflectConfig(...), overrides));
//   await runAkmJson(sandbox, ["improve", ref, "--strategy", overrides.strategy]);

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");

export interface ConfigPatch {
  /** The patch file, from the repository root. */
  path: string;
  /** The SHA-256 of the file's bytes, so two runs with the same path can be told apart. */
  sha256: string;
  patch: Record<string, unknown>;
}

export interface Overrides {
  strategy: string;
  configPatch: ConfigPatch | null;
}

/** The two options, for parseArgs. */
export const OVERRIDE_OPTIONS = { strategy: { type: "string" }, "config-patch": { type: "string" } } as const;

/** The two lines of an eval's usage text. `def` is the strategy the eval runs without --strategy. */
export const overridesUsage = (def: string): string =>
  `  --strategy      the akm improve strategy to run in place of ${def}. A strategy of the config patch works, or one akm ships.
  --config-patch  FILE: a JSON file deep-merged into the config the eval writes, after it. A relative FILE is from the repository root.`;

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isPlainObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

const copy = (x: unknown): unknown => {
  if (Array.isArray(x)) return x.map(copy);
  if (!isPlainObject(x)) return x;
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, copy(v)]));
};

/** akm's own merge (core/config/deep-merge.ts): objects merge, arrays and scalars in `patch` replace. Neither input changes. */
export function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = copy(base) as Record<string, unknown>;
  for (const [key, next] of Object.entries(patch)) {
    if (UNSAFE_KEYS.has(key)) throw new TypeError(`unsafe key in the config patch: ${key}`);
    const current = out[key];
    out[key] = isPlainObject(current) && isPlainObject(next) ? deepMerge(current, next) : copy(next);
  }
  return out;
}

/** Reads a config patch. A relative `file` is from `root`, the repository root. Throws with a message when it cannot be used. */
export function loadConfigPatch(file: string, root = ROOT): ConfigPatch {
  const path = resolve(root, file);
  let bytes: Buffer;
  try {
    bytes = readFileSync(path);
  } catch {
    throw new Error(`--config-patch: cannot read ${path}`);
  }
  let patch: unknown;
  try {
    patch = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    throw new Error(`--config-patch: ${path} is not JSON (${(e as Error).message})`);
  }
  if (!isPlainObject(patch)) throw new Error(`--config-patch: ${path} must hold a JSON object`);
  return { path: relative(root, path), sha256: createHash("sha256").update(bytes).digest("hex"), patch };
}

/** The strategy and config patch of a run, from parsed options. `def` is the eval's own strategy. `fail` ends the run with a message. */
export function parseOverrides(values: { strategy?: string; "config-patch"?: string }, def: string, fail: (message: string) => never, root = ROOT): Overrides {
  if (values.strategy !== undefined && !values.strategy.trim()) fail("--strategy needs a strategy name");
  let configPatch: ConfigPatch | null = null;
  if (values["config-patch"] !== undefined) {
    try {
      configPatch = loadConfigPatch(values["config-patch"], root);
    } catch (e) {
      fail((e as Error).message);
    }
  }
  return { strategy: values.strategy?.trim() ?? def, configPatch };
}

/** The run's own strategy and no patch, for a caller that sets none. */
export const defaultOverrides = (def: string): Overrides => ({ strategy: def, configPatch: null });

/** The eval's config with the patch merged into it. Without a patch, the config as it is. */
export function patchedConfig<C extends Record<string, any>>(config: C, overrides: Overrides): C {
  return overrides.configPatch ? (deepMerge(config, overrides.configPatch.patch) as C) : config;
}

/** The two fields every summary.json records, so runs are comparable. Spread it into the summary. */
export const overrideSummary = (o: Overrides): { strategy: string; config_patch: { path: string; sha256: string } | null } => ({
  strategy: o.strategy,
  config_patch: o.configPatch ? { path: o.configPatch.path, sha256: o.configPatch.sha256 } : null,
});
