/**
 * Seeded, reproducible subset sampling for benchmark packs.
 *
 * WHY THIS EXISTS
 *
 * Both memory packs used to subset with `slice(0, n)`. That is not a sample of
 * the benchmark — it is a systematic slice of whatever order the dataset file
 * happens to have, which correlates with question id, category, and authoring
 * batch. A score from it cannot be compared to a published figure, or to
 * another subset of the same benchmark, because neither is estimating the same
 * quantity. See `docs/comparability.md` rule A3.
 *
 * A seeded uniform sample fixes both halves of the problem: it is unbiased
 * with respect to file order, and it is exactly reproducible from the recorded
 * seed, so a reviewer can regenerate the identical question set.
 */

import { ConfigValidationError } from "./errors.ts";

/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG.
 *
 * Deliberately implemented here rather than using `Math.random()`: the whole
 * point is that a run is reproducible from its recorded seed, and
 * `Math.random()` cannot be seeded. Deliberately NOT a cryptographic RNG —
 * this needs to be stable across versions and platforms, which is the opposite
 * of what a crypto RNG promises.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SampleProvenance {
  /** How the subset was chosen — recorded in the run artifact so a reader can tell. */
  order: "seeded-random" | "first-n" | "full";
  seed: number | null;
  /** Items kept. */
  n: number;
  /** Items eligible before sampling — the denominator every reported figure needs. */
  total: number;
}

export interface SampleResult<T> {
  items: T[];
  provenance: SampleProvenance;
}

/**
 * Take `n` of `items`, uniformly at random under `seed`, preserving the
 * source order of whatever was selected (so downstream output stays stable and
 * diffable rather than shuffled).
 *
 * `smoke` runs are exempt and take the first `n`: a smoke run is a plumbing
 * check, not a measurement, and its provenance records `first-n` so it can
 * never be mistaken for one.
 */
export function sampleItems<T>(
  items: readonly T[],
  n: number | undefined,
  options: { seed?: number; smoke?: boolean; label: string },
): SampleResult<T> {
  const total = items.length;

  if (typeof n !== "number" || n <= 0 || n >= total) {
    return { items: [...items], provenance: { order: "full", seed: null, n: total, total } };
  }

  if (options.smoke) {
    return {
      items: items.slice(0, n),
      provenance: { order: "first-n", seed: null, n, total },
    };
  }

  if (typeof options.seed !== "number" || !Number.isInteger(options.seed)) {
    throw new ConfigValidationError([
      `${options.label}: sampling ${n} of ${total} requires an integer 'sampleSeed' in the pack config. ` +
        "Taking the first N instead is a systematic slice of the dataset's file order, not a sample of " +
        "the benchmark, and its score cannot be compared to a published figure (docs/comparability.md A3). " +
        "Set a seed to draw a reproducible random sample, or set 'smoke': true if this is a plumbing " +
        "check rather than a measurement.",
    ]);
  }

  // Partial Fisher-Yates over an index array: unbiased, and it touches only
  // `n` positions rather than shuffling the whole dataset.
  const random = mulberry32(options.seed);
  const indices = Array.from({ length: total }, (_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (total - i));
    const tmp = indices[i] as number;
    indices[i] = indices[j] as number;
    indices[j] = tmp;
  }

  const chosen = indices.slice(0, n).sort((a, b) => a - b);
  return {
    items: chosen.map((i) => items[i] as T),
    provenance: { order: "seeded-random", seed: options.seed, n, total },
  };
}
