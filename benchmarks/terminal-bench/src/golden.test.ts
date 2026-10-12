import { join } from "node:path";
import { goldenSuite } from "../../../lib/harbor/golden-suite.ts";
import { MEASUREMENT } from "./measurement.ts";

// The golden files are in ../golden/: seven of the tasks of the pinned dataset, with the trials Harbor left for them, as the collector reads
// them from Harbor's job folder (the verifier's reward, the exception, the akm calls of the agent, the tokens, the cost and the times). They
// cover a task both arms pass, one only the control passes, an agent that ran out of time (verified, and not), a setup that failed, a trial
// the plugin was not live in, a task Harbor ran for the control only, and one it never started. cases.jsonl is a copy of those tasks, as
// ASSETS.lock names them, so a change to the lock does not move them. See lib/harbor/golden-suite.ts, which the two Harbor evals share,
// and lib/golden.ts.
goldenSuite(MEASUREMENT, join(import.meta.dir, "..", "golden"));
