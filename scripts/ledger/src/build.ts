import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { type LedgerRun, latestGroups, object, presentRun, sampleVerdicts } from "./data";
import { comparisonColumns } from "./comparison";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
function option(name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}
const reports = resolve(option("--results", "reports"));
const output = resolve(option("--output", ".site-output"));
const git = Bun.spawnSync(["git", "-C", reports, "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
const sourceRevision = option("--source-revision", git.exitCode === 0 ? git.stdout.toString().trim() : "main");
function* summaries(folder: string): Generator<string> {
  for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) yield* summaries(join(folder, entry.name));
    else if (entry.isFile() && entry.name === "summary.json") yield join(folder, entry.name);
  }
}
const runs: LedgerRun[] = [];
const verdicts = new Map<string, ReturnType<typeof sampleVerdicts>>();
let excluded = 0;
for (const file of summaries(reports)) {
  const summary: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (object(summary).corpus !== "public" || object(summary).status !== "complete") {
    excluded++;
    continue;
  }
  let samples: unknown[] | null = null;
  try {
    samples = readFileSync(join(dirname(file), "samples.jsonl"), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const path = relative(reports, dirname(file)).split("\\").join("/");
  const run = presentRun({ summary, samples, path, sourceRevision });
  if (!run) {
    excluded++;
    continue;
  }
  runs.push(run);
  verdicts.set(run.id, sampleVerdicts(samples));
}
if (!runs.length)
  throw new Error("No completed public reports found. Point --results at akm-eval's published reports directory.");
runs.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
const groups = latestGroups(runs, verdicts);
const dataset = {
  source_revision: sourceRevision,
  source_repository: "itlackey/akm-eval",
  latest_collection_date: runs[0]!.date,
  excluded_reports: excluded,
  runs: runs.map(({ cohort_key: _cohort, ...run }) => run),
  latest_groups: groups,
  columns: comparisonColumns(runs),
};
mkdirSync(join(output, "assets"), { recursive: true });
mkdirSync(join(output, "assets/vendor"), { recursive: true });
for (const [source, target] of [
  ["dist/js/tabulator.min.js", "tabulator.min.js"],
  ["dist/css/tabulator.min.css", "tabulator.min.css"],
  ["LICENSE", "tabulator.LICENSE"],
]) writeFileSync(join(output, "assets/vendor", target!), readFileSync(new URL(`./node_modules/tabulator-tables/${source}`, import.meta.url)));
for (const file of ["index.html", "assets/styles.css", "assets/ledger.js"]) {
  const original = readFileSync(new URL(`../../../site/${file}`, import.meta.url), "utf8");
  const version = encodeURIComponent(sourceRevision);
  const content = file === "index.html" ? original
    .replace('<html lang="en">', `<html lang="en" data-revision="${version}">`)
    .replace('./assets/styles.css"', `./assets/styles.css?v=${version}"`)
    .replace('./assets/ledger.js"', `./assets/ledger.js?v=${version}"`)
    .replace('./assets/vendor/tabulator.min.css"', `./assets/vendor/tabulator.min.css?v=${version}"`)
    .replace('./assets/vendor/tabulator.min.js"', `./assets/vendor/tabulator.min.js?v=${version}"`) : original;
  writeFileSync(join(output, file), content);
}
writeFileSync(join(output, "data.json"), `${JSON.stringify(dataset)}\n`);
writeFileSync(join(output, ".nojekyll"), "");
console.log(
  JSON.stringify({
    output,
    runs: runs.length,
    recorded_rows: runs.reduce((sum, r) => sum + (r.recorded ?? 0), 0),
    suites: new Set(runs.map((r) => r.suite)).size,
    latest_collection: dataset.latest_collection_date,
    source_revision: sourceRevision,
    excluded,
  }),
);
