// The seeded draws of the benchmark: the private library and its queries, a --limit run, and the queries that akm curate is checked on.
// They are the same on every machine. The draw is also what decides which queries the collector asks curate about, so this file is part of the
// collector (see measurement.ts); dataset.ts uses it to draw the corpora.

/** Seeds every draw: the private skills, the private queries, --limit and the curate check. It is recorded in summary.json. */
export const SEED = 42;

/** mulberry32: a small seeded generator, so a draw is the same on every machine. */
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

/** `n` of the items, drawn at random under the seed and kept in their order. */
export function draw<T>(items: T[], n: number, seed: number): T[] {
  if (n > items.length) throw new Error(`cannot draw ${n} of ${items.length}`);
  const random = mulberry32(seed);
  const order = items.map((_, i) => i);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(random() * (order.length - i));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => items[i]);
}

/** How many queries `akm curate` is checked on. It returns search's ranking, so it is asked of a sample, not of every query. */
export const CURATE_CHECK = 200;

/** The queries akm curate is asked about: CURATE_CHECK of them drawn at random under the seed, in file order. All of them when there are fewer. */
export const curateSample = <T>(queries: T[]): T[] => draw(queries, Math.min(CURATE_CHECK, queries.length), SEED);
