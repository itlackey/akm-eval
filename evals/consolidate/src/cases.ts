// What a case of the consolidate eval is, and how the cases are read and checked: the pair of notes with the labels that say what a right
// result is, `parseCases`, `claimProblems`, and which cases a run takes. generate.ts makes the private cases with it, run.ts reads the cases
// with it, and the scorer (score.ts) takes the case type and the relations from it. It imports nothing, so neither the scorer's digest nor the
// generator's takes in the collector.

export type Side = "a" | "b";

export const RELATIONS = ["duplicate", "subsumed", "supersedes", "contradicts", "overlap", "unrelated"] as const;
export type Relation = (typeof RELATIONS)[number];

export interface Note {
  name: string; // the memory's name: it is written to memories/<name>.md
  text: string; // the whole file: frontmatter and body
}

export interface Claim {
  side: Side | "both";
  text: string; // word for word in the note or notes of that side, and in no other
}

export interface Case {
  id: string;
  relation: Relation;
  older: Side | null; // which note is older, or null when they are from the same day
  safe: Side[]; // the sides that can be retired without losing a claim the other lacks
  claims: Claim[]; // the claims that decide it
  why: string;
  a: Note;
  b: Note;
  canary?: string;
}

/** The files of an assets folder that a per-case run reads, and that `generate` reads from the public one: assets_sha256 and generated.json digest them. */
export const INPUT_FILES = ["cases.jsonl"];

export const isSide = (x: unknown): x is Side => x === "a" || x === "b";

export function parseCases(text: string, where = "cases"): Case[] {
  const cases: Case[] = [];
  text.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    const at = `${where}:${i + 1}`;
    let c: Case;
    try {
      c = JSON.parse(line) as Case;
    } catch {
      throw new Error(`${at} is not valid JSON`);
    }
    if (typeof c.id !== "string" || !c.id) throw new Error(`${at} has no string "id"`);
    if (!RELATIONS.includes(c.relation)) throw new Error(`${at} has relation "${c.relation}", expected one of ${RELATIONS.join(", ")}`);
    if (c.older !== null && !isSide(c.older)) throw new Error(`${at} has older "${c.older}", expected a, b or null`);
    if (!Array.isArray(c.safe) || !c.safe.every(isSide)) throw new Error(`${at} has a "safe" that is not a list of a and b`);
    if (!Array.isArray(c.claims) || !c.claims.every((k) => (isSide(k?.side) || k?.side === "both") && typeof k.text === "string" && k.text)) throw new Error(`${at} has a bad "claims" list`);
    for (const side of ["a", "b"] as const) {
      const note = c[side];
      if (typeof note?.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(note.name)) throw new Error(`${at} has no usable name for note ${side}`);
      if (typeof note.text !== "string" || !note.text) throw new Error(`${at} has no text for note ${side}`);
    }
    if (c.a.name === c.b.name) throw new Error(`${at} gives both notes the name ${c.a.name}`);
    const problems = claimProblems(c);
    if (problems.length > 0) throw new Error(`${at}: ${problems[0]}`);
    cases.push(c);
  });
  if (cases.length === 0) throw new Error(`${where} has no cases`);
  return cases;
}

/** Where a case's claims are not where they say. Each must be in the text of its side and of no other. */
export function claimProblems(c: Case): string[] {
  const problems: string[] = [];
  for (const claim of c.claims) {
    const inA = c.a.text.includes(claim.text);
    const inB = c.b.text.includes(claim.text);
    const want = claim.side === "both" ? [true, true] : claim.side === "a" ? [true, false] : [false, true];
    if (inA !== want[0] || inB !== want[1]) {
      const found = inA && inB ? "both notes" : inA ? "note a only" : inB ? "note b only" : "neither note";
      problems.push(`the claim "${claim.text.slice(0, 60)}" is meant for ${claim.side === "both" ? "both notes" : `note ${claim.side} only`} but is in ${found}`);
    }
  }
  return problems;
}

/**
 * The cases a run uses. Without a limit, all of them. With one, N cases taking the first of each relation in turn,
 * so a short run covers as many relations as it can, in the order of RELATIONS. They come back in file order.
 */
export function selectCases(cases: Case[], limit?: number): Case[] {
  if (limit === undefined || limit >= cases.length) return cases;
  const queues = RELATIONS.map((r) => cases.filter((c) => c.relation === r));
  const picked = new Set<Case>();
  for (let round = 0; picked.size < limit; round++) {
    for (const q of queues) if (picked.size < limit && q[round]) picked.add(q[round]);
  }
  return cases.filter((c) => picked.has(c));
}
