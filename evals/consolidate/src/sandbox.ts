// What the consolidate and nightly collectors share about the sandbox akm runs in: how old the notes of a pair are, and how akm embeds
// them. It is collector code (see measurement.ts): a change here changes what akm is given. Neither eval's scorer imports it.

import { semanticConfig } from "../../../lib/akm/akm.ts";

type Side = "a" | "b";

/**
 * How many days old each note is. The older one is 3 days old, the newer 1, and a pair from the same day is 2 each. akm dates a
 * note by its file time when the bundle is not a git repository. All of these are within a week, so akm treats both as new material
 * and pairs them at its ordinary cosine floor.
 */
export function noteAges(older: Side | null): Record<Side, number> {
  if (older === null) return { a: 2, b: 2 };
  return older === "a" ? { a: 3, b: 1 } : { a: 1, b: 3 };
}

/**
 * akm pairs notes by the cosine of their embeddings, and a pair below 0.93 is never judged. Its deterministic embedder hashes the
 * words, so the eval needs no embedding model and every run pairs the same notes. It is akm's own switch for reproducible benchmarks.
 */
export const EMBEDDER_ENV = { AKM_EMBED_DETERMINISTIC: "1" };

/** The embedders a run can use: akm's word-hash one (the default), or its built-in model, which is what a real bundle runs. */
export const EMBEDDERS = ["deterministic", "real"] as const;
export type Embedder = (typeof EMBEDDERS)[number];

/** What the embedder needs in akm's environment: the deterministic one is a switch, and the real one needs nothing. */
export const embedderEnv = (embedder: Embedder): Record<string, string> => (embedder === "real" ? {} : EMBEDDER_ENV);

/** What a run gives createSandbox. A semantic sandbox points akm at the repository's .cache/ for the real embedder's model. */
export const sandboxOptions = (embedder: Embedder): { keepModelKey: true; semantic: boolean } => ({ keepModelKey: true, semantic: embedder === "real" });

/**
 * Turns semantic search on in the config, as the pair pass needs. The real embedder is set as semanticConfig of lib/akm sets it:
 * akm's built-in model, and the long wait for a query's embedding. The deterministic one needs no embedding settings.
 */
export function withEmbedder(config: Record<string, any>, embedder: Embedder): Record<string, any> {
  config.semanticSearchMode = "auto";
  if (embedder === "real") config.embedding = semanticConfig().embedding;
  return config;
}
