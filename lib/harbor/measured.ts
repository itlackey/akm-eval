// Which files of lib/harbor are the collector and which the scorer of the evals that run an agent in Harbor (evals/agent-ab,
// benchmarks/terminal-bench). Their measurement.ts files list these beside their own. This file only lists: it is in neither part.
//
// The collector is harbor.ts (the job, the akm arm, the pins, the model and the endpoint), trials.ts (what Harbor's folders are read into),
// akm_opencode.py (the akm arm itself, which Harbor starts by its name) and the lockfiles the arm installs akm-cli and the plugin from. The
// Python file and the lockfiles are not imported by any TypeScript, so they are listed here as entry points, and the files harbor.ts
// imports are covered by it. The scorer is score.ts, and report.ts which it imports.

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..", "..");
const LOCKS = "lib/harbor/locks";

/** The package.json and package-lock.json of every release the arm has a lockfile for, so a new pin's lockfile is covered as soon as it is committed. */
function lockfiles(): string[] {
  const folders = readdirSync(join(ROOT, LOCKS), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  return folders.flatMap((folder) => ["package.json", "package-lock.json"].map((file) => `${LOCKS}/${folder}/${file}`));
}

/** The entry points of the collector in lib/harbor. */
export const HARBOR_COLLECTOR: string[] = ["lib/harbor/harbor.ts", "lib/harbor/akm_opencode.py", ...lockfiles()];

/** The entry point of the scorer in lib/harbor. */
export const HARBOR_SCORER: string[] = ["lib/harbor/score.ts"];
