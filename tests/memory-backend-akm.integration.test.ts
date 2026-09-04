import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
/**
 * REAL integration test for the akm memory backend — no fake CLI, no mocking,
 * no docker. Every assertion below is on the output of a real akm 0.9.x
 * subprocess.
 *
 * The CLI under test is resolved from `AKM_EVAL_AKM_CMD` — the same env var
 * production uses — falling back to a sibling akm source checkout when it is
 * unset. Per this repo's trust policy ("no silent fallback when an official
 * harness or evaluator is unavailable"), this suite **fails, it does not
 * skip**, when no real akm CLI can be reached: a malformed `AKM_EVAL_AKM_CMD`,
 * no reachable akm at all, or a real subprocess call that errors are all real
 * environment gaps, not silent passes.
 *
 * ## The ONE place that gate is relaxed: hosted CI, keyed on `AKM_EVAL_AKM_CMD`
 *
 * `bun test` (this repo's CI entry point — see .github/workflows/ci-pr.yml)
 * picks up every `*.test.ts` file by default, and the hosted PR job has no
 * docker daemon, no akm CLI, and no sibling akm checkout to fall back to.
 * Combined with the fail-not-skip policy above, an ungated version of this
 * file would fail CI on every PR through no fault of the PR's own changes. So
 * the `describe` below is `skipIf`'d on exactly one compound condition:
 *
 *     running in CI  AND  `AKM_EVAL_AKM_CMD` is not set
 *
 * Both halves matter, and gating on the env var ALONE (the shape this file
 * briefly had) is wrong: it silently skips local `bun test` runs too, on
 * machines where a real akm CLI is sitting right there — turning the repo's
 * only live-akm coverage into a no-op that reports green. That is the "silent
 * fallback" the trust policy exists to prevent.
 *
 * Consequences, all deliberate:
 *   - local `bun test`, no env var  -> RUNS against the sibling checkout;
 *                                      throws (does not skip) if none exists
 *   - local `bun test`, env var set -> RUNS against whatever it names
 *   - hosted CI, no env var         -> skipped (the keyed gate)
 *   - hosted CI, env var set        -> RUNS for real; a CI job that
 *                                      provisions a real akm opts itself in
 *                                      just by setting the var
 *
 * To pin a specific akm CLI locally:
 *
 *   AKM_EVAL_AKM_CMD='["bun","/home/user/akm/src/cli.ts"]' bun test tests/memory-backend-akm.integration.test.ts
 *
 * `AKM_EVAL_SIBLING_CLI` overrides just the sibling-checkout fallback path
 * (for a checkout kept somewhere other than the default), which also makes the
 * throw-when-nothing-is-reachable branch directly exercisable by pointing it
 * at a path that does not exist.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAkmBackend, resolveAkmCommand, slugifyDocId } from "../src/memory/backends/akm.ts";
import type { MemoryDocument } from "../src/memory/types.ts";

/**
 * Default when `AKM_EVAL_AKM_CMD` is unset: a sibling akm source checkout,
 * resolved RELATIVE TO THIS REPO rather than to one machine's home directory.
 * The previous absolute `/home/user/akm/src/cli.ts` only ever existed on the
 * machine this suite was written on, so everywhere else the fallback could not
 * fire and the suite failed with "no akm CLI" even when a checkout sat right
 * next to the repo. `AKM_EVAL_SIBLING_CLI` still overrides.
 */
const SIBLING_AKM_CLI =
  process.env.AKM_EVAL_SIBLING_CLI ??
  path.resolve(import.meta.dirname, "..", "..", "akm", "src", "cli.ts");

setDefaultTimeout(120_000);

const AKM_EVAL_AKM_CMD_SET =
  typeof process.env.AKM_EVAL_AKM_CMD === "string" &&
  process.env.AKM_EVAL_AKM_CMD.trim().length > 0;
/**
 * Hosted-CI detection. `CI` is set by GitHub Actions (and essentially every
 * other hosted runner); `GITHUB_ACTIONS` is checked too so the intent stays
 * legible against this repo's actual workflows.
 */
const IS_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
/** The suite-level gate — see the file header comment for why BOTH halves are required. */
const SKIP_SUITE = IS_CI && !AKM_EVAL_AKM_CMD_SET;

/**
 * Resolve the akm invocation under test, and pin it on the environment so the
 * backend picks it up. Throws — never skips — when nothing real is reachable.
 */
function useRealAkm(): string[] {
  if (AKM_EVAL_AKM_CMD_SET) {
    const resolution = resolveAkmCommand(process.env);
    if (!resolution.ok) {
      throw new Error(`AKM_EVAL_AKM_CMD is set but unusable: ${resolution.detail}`);
    }
    return resolution.cmd;
  }

  if (fs.existsSync(SIBLING_AKM_CLI)) {
    const cmd = ["bun", SIBLING_AKM_CLI];
    process.env.AKM_EVAL_AKM_CMD = JSON.stringify(cmd);
    return cmd;
  }

  throw new Error(
    `akm integration test requires a real akm CLI satisfying ^0.9. Set AKM_EVAL_AKM_CMD (e.g. '["akm"]' for an installed binary), or provide a sibling akm source checkout at ${SIBLING_AKM_CLI}. This test fails rather than skips: an absent akm CLI is a real environment gap, not a pass.`,
  );
}

// Saved at module load, before `useRealAkm()` can mutate it, and restored in
// `afterAll` below so this file never leaks a pinned `AKM_EVAL_AKM_CMD` into
// whatever test file bun runs next in the same process.
const savedAkmEvalAkmCmd = process.env.AKM_EVAL_AKM_CMD;

const tempDirs: string[] = [];
afterAll(() => {
  // biome-ignore lint/performance/noDelete: process.env coerces assigned values to strings, so `= undefined` would store "undefined"; delete is the only correct restore.
  if (savedAkmEvalAkmCmd === undefined) delete process.env.AKM_EVAL_AKM_CMD;
  else process.env.AKM_EVAL_AKM_CMD = savedAkmEvalAkmCmd;
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

// A first sentence long enough on its own to sit right under the 250-char
// synthesis cap, so the *second* sentence (carrying the distinctive
// "flibbernotch" term) is pushed out of the synthesized description. This is
// the synthesis boundary this test exercises, not an incidental detail.
const LONG_FIRST_SENTENCE =
  "This opening sentence exists purely to occupy space so that the description synthesis cap is reached before any " +
  "later sentence in this same document body is considered, and it says nothing distinctive on its own at all here.";
expect(LONG_FIRST_SENTENCE.length).toBeGreaterThan(180);
expect(LONG_FIRST_SENTENCE.length).toBeLessThan(250);

const BODY_ONLY_TERM = "flibbernotch";
const DESCRIPTION_TERM = "zorblaxxterm";
const TAG_TERM = "q0uartzcrystal";
const HEADING_TERM = "uniquewombatid";

const documents: MemoryDocument[] = [
  {
    id: "alpha",
    text: `The ${DESCRIPTION_TERM} project kicked off today with a short planning session.`,
  },
  {
    id: "beta",
    // The distinctive term is real body prose, past the sentence(s) that
    // make it into the synthesized description. Through akm 0.9.1 this term
    // was unfindable — the "retrieval ceiling" this suite was written to
    // prove. akm 0.9.2 (itlackey/akm#819) lifted it: body prose is now
    // retrievable, so the assertion below guards the FIX, not the ceiling.
    text: `${LONG_FIRST_SENTENCE} Somewhere much later in this note someone in passing mentioned ${BODY_ONLY_TERM} once.`,
  },
  {
    id: "gamma",
    text: "A short note with nothing distinctive in its own sentence.",
    metadata: { topic: TAG_TERM },
  },
  {
    id: `delta-${HEADING_TERM}`,
    text: "Another short note whose only distinctive term lives in its own document id.",
  },
  {
    id: "epsilon",
    text: 'DATE: 2024-01-01\nCONVERSATION:\nAlice said, "this is a routine, unremarkable conversational turn."',
    metadata: { speaker: "Alice", sessionNumber: 1 },
  },
];

function expectKnownSearchRef(ref: unknown, id: string): void {
  const parent = `memories/${slugifyDocId(id)}`;
  expect(ref).toMatch(new RegExp(`^${parent}(?:#akm-fragment-[1-9][0-9]*-[a-f0-9]{12})?$`));
}

// Skipped ONLY in hosted CI with no AKM_EVAL_AKM_CMD provisioned; locally this
// always runs and fails (never skips) if no akm CLI is reachable. See the file
// header comment for why both halves of the condition are required.
describe.skipIf(SKIP_SUITE)(
  "akm backend: REAL integration against a live akm CLI (no fakes)",
  () => {
    test("round-trips reset -> add(5 docs) -> search against the real akm CLI, across every synthesized retrieval surface", async () => {
      useRealAkm();
      const workDir = tempDir("akm-eval-akm-integration-");
      const backend = createAkmBackend(process.cwd(), workDir);

      const health = backend.healthCheck();
      expect(health.status).toBe("ok");
      expect(health.detail).toMatch(/^akm CLI 0\.9\./);

      await backend.reset();
      await backend.add(documents);

      // ── The description-term document IS retrievable ──────────────────────
      const descriptionHits = await backend.search({ text: DESCRIPTION_TERM, topK: 10 });
      expect(descriptionHits.length).toBe(1);
      const descriptionHit = descriptionHits[0];
      if (!descriptionHit) throw new Error("descriptionHits[0] missing despite length === 1");
      expect(descriptionHit.id).toBe("alpha");
      expectKnownSearchRef(descriptionHit.metadata?.ref, "alpha");
      expect(descriptionHit.text).toContain(DESCRIPTION_TERM);
      expect(typeof descriptionHit.score).toBe("number");
      expect(descriptionHit.score).toBeGreaterThan(0);

      // ── Body-only prose IS retrievable (akm >= 0.9.2, itlackey/akm#819) ───
      // Measured on this corpus: against 0.9.1 this search returned 0 hits;
      // against 0.9.2-alpha.2 it returns exactly the document that carries the
      // term in its body. Asserting the hit's identity — not just a non-zero
      // count — is what keeps this from passing on indiscriminate matching.
      const bodyOnlyHits = await backend.search({ text: BODY_ONLY_TERM, topK: 10 });
      expect(bodyOnlyHits.length).toBe(1);
      const bodyOnlyHit = bodyOnlyHits[0];
      if (!bodyOnlyHit) throw new Error("bodyOnlyHits[0] missing despite length === 1");
      expect(bodyOnlyHit.id).toBe("beta");
      expect(bodyOnlyHit.score).toBeGreaterThan(0);

      // ── A term that lives only in a synthesized tag IS retrievable ────────
      const tagHits = await backend.search({ text: TAG_TERM, topK: 10 });
      expect(tagHits.length).toBe(1);
      expect(tagHits[0]?.id).toBe("gamma");

      // ── A term that lives only in the id-derived H1 heading IS retrievable ─
      const headingHits = await backend.search({ text: HEADING_TERM, topK: 10 });
      expect(headingHits.length).toBe(1);
      expect(headingHits[0]?.id).toBe(`delta-${HEADING_TERM}`);

      // ── reset() genuinely tears down state against the real CLI too ───────
      await backend.reset();
      expect((await backend.search({ text: DESCRIPTION_TERM, topK: 10 })).length).toBe(0);
    });

    test("single-document add() goes through `akm remember`, which indexes on write with no separate index pass", async () => {
      useRealAkm();
      const backend = createAkmBackend(process.cwd(), tempDir("akm-eval-akm-integration-single-"));

      await backend.reset();
      // The bulk branch is only taken for >1 document, so this exercises the
      // `akm remember` branch — which the backend deliberately does NOT follow
      // with `akm index --full`, because the real CLI indexes on write. If that
      // ever stops being true, this search returns zero hits and this test
      // fails loudly rather than the ceiling silently dropping to nothing.
      await backend.add([
        { id: "solo", text: `A single note mentioning ${DESCRIPTION_TERM} in its first sentence.` },
      ]);

      const hits = await backend.search({ text: DESCRIPTION_TERM, topK: 10 });
      expect(hits.length).toBe(1);
      const soloHit = hits[0];
      if (!soloHit) throw new Error("hits[0] missing despite length === 1");
      expect(soloHit.id).toBe("solo");
      expectKnownSearchRef(soloHit.metadata?.ref, "solo");
      expect(soloHit.text).toContain(DESCRIPTION_TERM);
    });
  },
);
