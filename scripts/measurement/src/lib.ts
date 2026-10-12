// The logic of scripts/measurement, without the command line: checking MEASUREMENT.lock against the files of every eval that declares a
// measurement, and bumping a part of an eval. See the README's "How results stay comparable".

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIRST_VERSION, LOCK_FILE, type Lock, type LockPart, loadMeasurement, measuredEvals, nextVersion, readLock, resolvedParts } from "../../../lib/manifest.ts";

export const CHANGELOG = "MEASUREMENT_CHANGELOG.md";

export type Part = "collector" | "scorer";
export const PARTS: readonly Part[] = ["collector", "scorer"];

const HEAD = ["| date | eval | part | version | reason | sha256 |", "|---|---|---|---|---|---|"];

/** The rows of the changelog, as [eval, part, version]. The version is read as the text of its column. */
function changelogRows(root: string): [string, string, string][] {
  const file = join(root, CHANGELOG);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()))
    .map((c): [string, string, string] => [c[2] ?? "", c[3] ?? "", c[4] ?? ""]);
}

/** One line per thing wrong, each saying what to run. Empty when the lock matches the files of every eval. */
export function checkLock(root: string): string[] {
  let lock: Lock;
  try {
    lock = readLock(root);
  } catch (e) {
    return [(e as Error).message];
  }
  const problems: string[] = [];
  const declared = measuredEvals(root);
  const rows = changelogRows(root);
  for (const name of declared) {
    const entry = lock.evals[name];
    let now: ReturnType<typeof resolvedParts>;
    try {
      const m = loadMeasurement(name, root);
      if (!m) continue;
      if (!entry) {
        problems.push(`${name} declares a measurement and ${LOCK_FILE} has no entry for it. Add it: scripts/measurement/run bump ${name} collector --reason "first lock entry"`);
        continue;
      }
      now = resolvedParts(m, root);
    } catch (e) {
      const message = (e as Error).message;
      problems.push(message.startsWith(`${name}: `) ? message : `${name}: ${message}`);
      continue;
    }
    for (const part of PARTS) {
      const locked = entry[part];
      const files = now[part].files;
      if (now[part].sha256 !== locked.sha256 || files.join("\n") !== locked.files.join("\n")) {
        const added = files.filter((f) => !locked.files.includes(f));
        const dropped = locked.files.filter((f) => !files.includes(f));
        const covers = [added.length > 0 ? `now also covers ${added.join(", ")}` : "", dropped.length > 0 ? `no longer covers ${dropped.join(", ")}` : ""].filter(Boolean).join("; ");
        problems.push(
          `${name}: the ${part} changed since ${LOCK_FILE} was written (lock ${locked.sha256.slice(0, 12)}, files now ${now[part].sha256.slice(0, 12)}${covers === "" ? "" : `; ${covers}`}). ` +
            `A change to the ${part} is a measurement change. Bump it with the reason, and write "no score change" if the scores are the same: scripts/measurement/run bump ${name} ${part} --reason "..."`,
        );
      } else if (!rows.some(([e, p, v]) => e === name && p === part && v === locked.version)) {
        problems.push(`${name}: ${CHANGELOG} has no entry for the ${part} at version ${locked.version}. Use scripts/measurement/run bump, which writes it.`);
      }
    }
  }
  for (const name of Object.keys(lock.evals)) if (!declared.includes(name)) problems.push(`${LOCK_FILE} has an entry for ${name}, which declares no measurement (it has no src/measurement.ts)`);
  return problems;
}

function writeLock(root: string, lock: Lock): void {
  const evals = Object.fromEntries(Object.keys(lock.evals).sort().map((name) => [name, lock.evals[name]]));
  writeFileSync(join(root, LOCK_FILE), `${JSON.stringify({ lock_version: lock.lock_version, harness_version: lock.harness_version, evals }, null, 2)}\n`);
}

/** Appends a row to the changelog, creating the file's table when there is none. */
function appendChangelog(root: string, row: { date: string; name: string; part: string; version: string; reason: string; sha256: string }): void {
  const file = join(root, CHANGELOG);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const line = `| ${row.date} | ${row.name} | ${row.part} | ${row.version} | ${row.reason.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim()} | ${row.sha256.slice(0, 12)} |`;
  const base = text.includes(HEAD[0]) ? text.replace(/\n*$/, "\n") : `${text.replace(/\n*$/, "\n")}\n${HEAD.join("\n")}\n`;
  writeFileSync(file, `${base}${line}\n`);
}

export interface BumpOptions {
  /** The date of the changelog entry, YYYY-MM-DD. Today by default. */
  date?: string;
}

/**
 * Records a change to a part of an eval: the minor number of the version goes up by one ("0.1" to "0.2"), the lock takes the digest and
 * files as they are now, and the changelog gets a row with the reason. An eval with no entry gets one, with both parts at version 0.1.
 * `harness` raises the harness version, a whole number, for a deliberate break of every eval. Returns what it did, for the command to print.
 */
export function bump(root: string, name: string, part: Part | "harness", reason: string, options: BumpOptions = {}): string {
  if (reason.trim() === "") throw new Error("a bump needs --reason: say what changed and whether the scores change (or \"no score change\")");
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const lock = readLock(root);
  if (part === "harness") {
    lock.harness_version += 1;
    writeLock(root, lock);
    appendChangelog(root, { date, name: "all", part: "harness", version: String(lock.harness_version), reason, sha256: "-" });
    return `harness_version is now ${lock.harness_version}`;
  }
  const m = loadMeasurement(name, root);
  if (!m) throw new Error(`${name} declares no measurement: it has no src/measurement.ts. See lib/manifest.ts for the contract.`);
  const now = resolvedParts(m, root);
  const made = (p: Part, version: string): LockPart => ({ version, sha256: now[p].sha256, files: now[p].files });
  const entry = lock.evals[name];
  if (!entry) {
    lock.evals[name] = { collector: made("collector", FIRST_VERSION), scorer: made("scorer", FIRST_VERSION) };
    writeLock(root, lock);
    for (const p of PARTS) appendChangelog(root, { date, name, part: p, version: FIRST_VERSION, reason, sha256: now[p].sha256 });
    return `${name}: first lock entry, collector and scorer at version ${FIRST_VERSION}`;
  }
  if (entry[part].sha256 === now[part].sha256 && entry[part].files.join("\n") === now[part].files.join("\n")) throw new Error(`${name}: the ${part} has not changed since the lock was written, so there is nothing to bump`);
  const next = nextVersion(entry[part].version);
  entry[part] = made(part, next);
  writeLock(root, lock);
  appendChangelog(root, { date, name, part, version: next, reason, sha256: now[part].sha256 });
  return `${name}: ${part} is now version ${next}`;
}

/** A line for each eval that declares a measurement: its parts, their versions and whether the lock is current. */
export function listLock(root: string): string[] {
  const lock = readLock(root);
  return measuredEvals(root).map((name) => {
    const m = loadMeasurement(name, root);
    const entry = lock.evals[name];
    if (!m || !entry) return `${name}: not in ${LOCK_FILE}`;
    const now = resolvedParts(m, root);
    const state = (p: Part) => `${p} v${entry[p].version}${now[p].sha256 === entry[p].sha256 ? "" : " (changed, not bumped)"}`;
    return `${name}: ${state("collector")}, ${state("scorer")}`;
  });
}
