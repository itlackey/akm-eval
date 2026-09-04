import fs from "node:fs";
import path from "node:path";
import { type ProbeArtifact, gradePairedProbe } from "../../src/probes/paired-grade.ts";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const controlDir = option("--control");
const candidateDir = option("--candidate");
const outputPath = option("--out");
if (!controlDir || !candidateDir || !outputPath) {
  console.error(
    "usage: bun scripts/probes/paired-grade.ts --control <probe-dir> --candidate <probe-dir> --out <verdict.json>",
  );
  process.exit(2);
}

const read = (dir: string, pack: string): ProbeArtifact =>
  JSON.parse(fs.readFileSync(path.join(dir, `${pack}.json`), "utf8")) as ProbeArtifact;
const verdict = gradePairedProbe(
  { locomo: read(controlDir, "locomo"), longmemeval: read(controlDir, "longmemeval") },
  { locomo: read(candidateDir, "locomo"), longmemeval: read(candidateDir, "longmemeval") },
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(verdict, null, 2)}\n`);
console.log(JSON.stringify(verdict, null, 2));
if (!verdict.passed) process.exitCode = 1;
