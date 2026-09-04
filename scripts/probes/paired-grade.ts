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
const expectedControlVersion = option("--expected-control-version");
const expectedCandidateCommit = option("--expected-candidate-commit");
const expectedControlCommit = option("--expected-control-commit");
if (
  !controlDir ||
  !candidateDir ||
  !outputPath ||
  !expectedControlVersion ||
  !expectedCandidateCommit
) {
  console.error(
    "usage: bun scripts/probes/paired-grade.ts --control <probe-dir> --candidate <probe-dir> --out <verdict.json> --expected-control-version 0.9.13 --expected-candidate-commit <40hex>",
  );
  process.exit(2);
}

const read = (dir: string, pack: string): ProbeArtifact =>
  JSON.parse(fs.readFileSync(path.join(dir, `${pack}.json`), "utf8")) as ProbeArtifact;
const verdict = gradePairedProbe(
  { locomo: read(controlDir, "locomo"), longmemeval: read(controlDir, "longmemeval") },
  { locomo: read(candidateDir, "locomo"), longmemeval: read(candidateDir, "longmemeval") },
  0.005,
  {
    expectedControlVersion,
    expectedCandidateCommit,
    ...(expectedControlCommit ? { expectedControlCommit } : {}),
  },
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(verdict, null, 2)}\n`);
console.log(JSON.stringify(verdict, null, 2));
if (!verdict.passed) process.exitCode = 1;
