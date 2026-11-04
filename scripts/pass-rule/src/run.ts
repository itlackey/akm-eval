#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { passRuleReport } from "./lib.ts";

const USAGE = `Usage: scripts/pass-rule/run [--count A,B] [--pass-at N] [--review-at N] [--reject-at N|none] RESULTS_DIR...

Routes the saved criterion scores of judge-gate and lesson-judge runs again under a pass rule, with no model call, and counts the routes
(pass, review, reject) by label and by group under the rule akm ships and under the one you give. The folders are runs of one eval
(--repeat makes one per run). With no rule flag the tried rule is the shipped one.

  --count      the criteria that count toward the pass test and the mean. Default: the judge's (need,preservation,quality; reusable,nonRedundancy).
               A lesson's grounding is scored too and counts only toward --reject-at, unless it is named here.
  --pass-at    the lowest counted criterion that passes. Default: 4.
  --review-at  the mean of the counted criteria from which a non-pass goes to a person. Default: reflect 3.5, a lesson 2.5.
  --reject-at  a criterion at or below this refuses the proposal whatever the mean is ("none" for no floor). Default: reflect none, a lesson 2.

Prints JSON. "reproduced.mismatch" lists the rows whose route under the shipped rule is not the stored one: it is empty when the runs were made by an akm with that rule.
Exits 1 when it is not.`;

const number = (flag: string, text: string): number => (Number.isFinite(Number(text)) && text.trim() !== "" ? Number(text) : fail(`${flag} must be a number`));
function fail(message: string): never {
  console.error(`pass-rule: ${message}\n\n${USAGE}`);
  process.exit(2);
}

function parse() {
  try {
    return parseArgs({ args: Bun.argv.slice(2), options: { count: { type: "string" }, "pass-at": { type: "string" }, "review-at": { type: "string" }, "reject-at": { type: "string" }, help: { type: "boolean", short: "h" } }, allowPositionals: true, strict: true });
  } catch (e) {
    return fail((e as Error).message);
  }
}
const { values, positionals } = parse();
if (values.help) console.log(USAGE);
else {
  if (positionals.length === 0) fail("name at least one results folder");
  try {
    const report = passRuleReport(positionals.map((p) => resolve(p)), (shipped) => ({
      counted: values.count !== undefined ? values.count.split(",").map((s) => s.trim()).filter(Boolean) : shipped.counted,
      passAt: values["pass-at"] !== undefined ? number("--pass-at", values["pass-at"]) : shipped.passAt,
      reviewAt: values["review-at"] !== undefined ? number("--review-at", values["review-at"]) : shipped.reviewAt,
      rejectAt: values["reject-at"] === undefined ? shipped.rejectAt : values["reject-at"] === "none" ? null : number("--reject-at", values["reject-at"]),
    }));
    console.log(JSON.stringify(report, null, 2));
    if (report.reproduced.mismatch.length > 0) {
      console.error(`pass-rule: ${report.reproduced.mismatch.length} of ${report.reproduced.rows} rows take another route under the shipped rule than the stored one. These runs were not made by an akm with the rule in lib/judge.ts, or akm's rule has changed.`);
      process.exitCode = 1;
    }
  } catch (e) {
    fail((e as Error).message);
  }
}
