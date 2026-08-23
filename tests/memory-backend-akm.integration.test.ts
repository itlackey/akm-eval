/**
 * REAL integration test for the akm memory backend — no fake CLI, no mocking,
 * no docker. Every assertion below is on the output of a real akm 0.9.x
 * subprocess.
 *
 * The CLI under test is resolved from `AKM_EVAL_AKM_CMD` — the same env var
 * production uses — falling back to a sibling akm source checkout when it is
 * unset. Per this repo's trust policy ("no silent fallback when an official
 * harness or evaluator is unavailable"), this test **fails, it does not
 * skip**, when no real akm CLI can be reached.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createAkmBackend, resolveAkmCommand, slugifyDocId } from '../src/memory/backends/akm.ts';
import type { MemoryDocument } from '../src/memory/types.ts';

/** Default when `AKM_EVAL_AKM_CMD` is unset: a sibling akm source checkout. */
const SIBLING_AKM_CLI = '/home/user/akm/src/cli.ts';

setDefaultTimeout(120_000);

/**
 * Resolve the akm invocation under test, and pin it on the environment so the
 * backend picks it up. Throws — never skips — when nothing real is reachable.
 */
function useRealAkm(): string[] {
  const preset = process.env.AKM_EVAL_AKM_CMD;
  if (preset !== undefined && preset.trim().length > 0) {
    const resolution = resolveAkmCommand(process.env);
    if (!resolution.ok) {
      throw new Error(`AKM_EVAL_AKM_CMD is set but unusable: ${resolution.detail}`);
    }
    return resolution.cmd;
  }

  if (fs.existsSync(SIBLING_AKM_CLI)) {
    const cmd = ['bun', SIBLING_AKM_CLI];
    process.env.AKM_EVAL_AKM_CMD = JSON.stringify(cmd);
    return cmd;
  }

  throw new Error(
    'akm integration test requires a real akm CLI satisfying ^0.9. Set AKM_EVAL_AKM_CMD (e.g. ' +
      `'["akm"]' for an installed binary), or provide a sibling akm source checkout at ${SIBLING_AKM_CLI}. ` +
      'This test fails rather than skips: an absent akm CLI is a real environment gap, not a pass.',
  );
}

// Saved at module load, before `useRealAkm()` can mutate it, and restored in
// `afterAll` below so this file never leaks a pinned `AKM_EVAL_AKM_CMD` into
// whatever test file bun runs next in the same process.
const savedAkmEvalAkmCmd = process.env.AKM_EVAL_AKM_CMD;

const tempDirs: string[] = [];
afterAll(() => {
  if (savedAkmEvalAkmCmd === undefined) delete process.env.AKM_EVAL_AKM_CMD;
  else process.env.AKM_EVAL_AKM_CMD = savedAkmEvalAkmCmd;
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
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
// the retrieval-ceiling boundary this test exists to prove, not an
// incidental detail.
const LONG_FIRST_SENTENCE =
  'This opening sentence exists purely to occupy space so that the description synthesis cap is reached before any ' +
  'later sentence in this same document body is considered, and it says nothing distinctive on its own at all here.';
expect(LONG_FIRST_SENTENCE.length).toBeGreaterThan(180);
expect(LONG_FIRST_SENTENCE.length).toBeLessThan(250);

const BODY_ONLY_TERM = 'flibbernotch';
const DESCRIPTION_TERM = 'zorblaxxterm';
const TAG_TERM = 'q0uartzcrystal';
const HEADING_TERM = 'uniquewombatid';

const documents: MemoryDocument[] = [
  {
    id: 'alpha',
    text: `The ${DESCRIPTION_TERM} project kicked off today with a short planning session.`,
  },
  {
    id: 'beta',
    // The distinctive term is real body prose, past the sentence(s) that
    // make it into the synthesized description — akm's retrieval ceiling
    // says this term must NOT be findable by search.
    text: `${LONG_FIRST_SENTENCE} Somewhere much later in this note someone in passing mentioned ${BODY_ONLY_TERM} once.`,
  },
  {
    id: 'gamma',
    text: 'A short note with nothing distinctive in its own sentence.',
    metadata: { topic: TAG_TERM },
  },
  {
    id: `delta-${HEADING_TERM}`,
    text: 'Another short note whose only distinctive term lives in its own document id.',
  },
  {
    id: 'epsilon',
    text: 'DATE: 2024-01-01\nCONVERSATION:\nAlice said, "this is a routine, unremarkable conversational turn."',
    metadata: { speaker: 'Alice', sessionNumber: 1 },
  },
];

describe('akm backend: REAL integration against a live akm CLI (no fakes)', () => {
  test('round-trips reset -> add(5 docs) -> search against the real akm CLI, proving the retrieval ceiling', async () => {
    useRealAkm();
    const workDir = tempDir('akm-eval-akm-integration-');
    const backend = createAkmBackend(process.cwd(), workDir);

    const health = backend.healthCheck();
    expect(health.status).toBe('ok');
    expect(health.detail).toMatch(/^akm CLI 0\.9\./);

    await backend.reset();
    await backend.add(documents);

    // ── The description-term document IS retrievable ──────────────────────
    const descriptionHits = await backend.search({ text: DESCRIPTION_TERM, topK: 10 });
    expect(descriptionHits.length).toBe(1);
    expect(descriptionHits[0]!.id).toBe('alpha');
    expect(descriptionHits[0]!.metadata?.ref).toBe(`memories/${slugifyDocId('alpha')}`);
    expect(descriptionHits[0]!.text).toContain(DESCRIPTION_TERM);
    expect(typeof descriptionHits[0]!.score).toBe('number');
    expect(descriptionHits[0]!.score).toBeGreaterThan(0);

    // ── The body-only-prose document is NOT retrievable: the declared ceiling ──
    const bodyOnlyHits = await backend.search({ text: BODY_ONLY_TERM, topK: 10 });
    expect(bodyOnlyHits.length).toBe(0);

    // ── A term that lives only in a synthesized tag IS retrievable ────────
    const tagHits = await backend.search({ text: TAG_TERM, topK: 10 });
    expect(tagHits.length).toBe(1);
    expect(tagHits[0]!.id).toBe('gamma');

    // ── A term that lives only in the id-derived H1 heading IS retrievable ─
    const headingHits = await backend.search({ text: HEADING_TERM, topK: 10 });
    expect(headingHits.length).toBe(1);
    expect(headingHits[0]!.id).toBe(`delta-${HEADING_TERM}`);

    // ── reset() genuinely tears down state against the real CLI too ───────
    await backend.reset();
    expect((await backend.search({ text: DESCRIPTION_TERM, topK: 10 })).length).toBe(0);
  });

  test('single-document add() goes through `akm remember`, which indexes on write with no separate index pass', async () => {
    useRealAkm();
    const backend = createAkmBackend(process.cwd(), tempDir('akm-eval-akm-integration-single-'));

    await backend.reset();
    // The bulk branch is only taken for >1 document, so this exercises the
    // `akm remember` branch — which the backend deliberately does NOT follow
    // with `akm index --full`, because the real CLI indexes on write. If that
    // ever stops being true, this search returns zero hits and this test
    // fails loudly rather than the ceiling silently dropping to nothing.
    await backend.add([{ id: 'solo', text: `A single note mentioning ${DESCRIPTION_TERM} in its first sentence.` }]);

    const hits = await backend.search({ text: DESCRIPTION_TERM, topK: 10 });
    expect(hits.length).toBe(1);
    expect(hits[0]!.id).toBe('solo');
    expect(hits[0]!.metadata?.ref).toBe(`memories/${slugifyDocId('solo')}`);
    expect(hits[0]!.text).toContain(DESCRIPTION_TERM);
  });
});
