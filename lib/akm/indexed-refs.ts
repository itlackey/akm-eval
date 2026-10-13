// Read the refs AKM actually indexed without recording artificial search usage.
// This uses the entries(file_path, concept_id) index schema shared by 0.9.26 and
// 0.10.261003-beta; a changed schema fails explicitly instead of guessing refs.
import { Database } from "bun:sqlite";
import { isAbsolute, join, relative } from "node:path";
import type { Sandbox } from "./akm.ts";

/** Bundle-relative file path to AKM's indexed concept ID, after `akm index`. */
export function indexedRefs(sandbox: Sandbox): Map<string, string> {
  const db = new Database(join(sandbox.env.AKM_DATA_DIR as string, "index.db"), { readonly: true });
  try {
    const rows = db.query("SELECT file_path, concept_id FROM entries").all() as { file_path: string; concept_id: string }[];
    const refs = new Map<string, string>();
    for (const row of rows) {
      const path = relative(join(sandbox.dir, "bundle"), row.file_path);
      if (isAbsolute(path) || path === ".." || path.startsWith("../") || row.concept_id.includes("#")) continue;
      const previous = refs.get(path);
      if (previous !== undefined && previous !== row.concept_id) throw new Error(`AKM indexed multiple refs for ${path}`);
      refs.set(path, row.concept_id);
    }
    return refs;
  } finally {
    db.close();
  }
}

/** Ref for the exact planted file; a missing entry is a setup error. */
export function indexedRef(refs: Map<string, string>, path: string): string {
  const ref = refs.get(path);
  if (!ref) throw new Error(`AKM did not index the planted file ${path}`);
  return ref;
}
