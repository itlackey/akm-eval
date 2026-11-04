// A bun preload for harvesting cases: `bun --preload capture.ts <akm checkout>/src/cli.ts improve ...`. It wraps the `run` of akm's
// `distill.lesson` judge, so every call distill makes appends the judge's exact input and the verdict akm routed on to
// `$AKM_DATA_DIR/judge-capture.jsonl`. The input is the object akm's pipeline built, not a prompt read back. Nothing else of akm changes.

import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";

const src = dirname(Bun.argv[1] ?? "");
const { lessonQualityJudge } = await import(join(src, "commands", "improve", "stage.ts"));
const out = join(process.env.AKM_DATA_DIR ?? ".", "judge-capture.jsonl");
const run = lessonQualityJudge.run.bind(lessonQualityJudge);
lessonQualityJudge.run = async (input: unknown, call: unknown) => {
  const result = await run(input, call);
  appendFileSync(out, `${JSON.stringify({ input, result })}\n`);
  return result;
};
