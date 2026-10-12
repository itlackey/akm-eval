import { join } from "node:path";
import { goldenSuite } from "../../../lib/harbor/golden-suite.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: six of the tasks of the public set, with the trials Harbor left for them, as the collector reads
// them from Harbor's job folder (the verifier's reward, the exception, the akm calls of the agent, the tokens and the times). They cover a
// task the akm arm passes in every attempt and the control fails, an akm call through the shell, an attempt that ran out of time and was
// verified all the same, a trial the plugin was not live in, a control whose setup ran out of time in every attempt, a control that left no
// log, and a task Harbor never started. cases.jsonl is a copy of those tasks, so a change to the tasks does not move them. See
// lib/harbor/golden-suite.ts, which the two Harbor evals share, and lib/golden.ts.
goldenSuite(MEASUREMENT, join(import.meta.dir, "..", "golden"));
