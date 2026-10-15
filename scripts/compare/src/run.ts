#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { comparePair, loadRun, renderPair } from "./lib.ts";

const USAGE = `Usage: scripts/compare/run A B [--json FILE] [--md FILE]

Show stored quality, performance, usage and settings for two saved runs.
A and B are results folders or their summary.json files. Legacy, stopped and
mismatched runs remain readable. Numeric deltas are B minus A; missing values
stay blank. Runs no models, never rescores, and never
changes the saved results.

  --json FILE  also save the report as JSON
  --md FILE    also save the printed table as Markdown
  --help       show this help`;
try {
  const { values, positionals } = parseArgs({ args: Bun.argv.slice(2), allowPositionals: true, strict: true,
    options: { json: { type: "string" }, md: { type: "string" }, help: { type: "boolean", short: "h" } } });
  if (values.help) console.log(USAGE);
  else {
    if (positionals.length !== 2) throw new Error(`give two results folders\n\n${USAGE}`);
    const report = comparePair(loadRun(positionals[0]!), loadRun(positionals[1]!));
    const markdown = renderPair(report);
    console.log(markdown);
    for (const [file, content] of [[values.json, `${JSON.stringify(report, null, 2)}\n`], [values.md, markdown]]) {
      if (!file) continue;
      const path = resolve(file);
      if (existsSync(path) && [report.a.dir, report.b.dir].some(dir => path === resolve(dir) || path.startsWith(`${resolve(dir)}/`)))
        throw new Error("report output would overwrite an existing source artifact");
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content!);
    }
  }
} catch (error) {
  console.error(`compare: ${(error as Error).message}`);
  process.exitCode = 2;
}
