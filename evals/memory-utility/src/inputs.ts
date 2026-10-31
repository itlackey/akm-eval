import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface Field {
  /** Accepted complete values, not substring matches. Null means unanswerable. */
  values: string[] | null;
  /** Each group is one required fact; alternatives within a group are equivalent literal evidence anchors. */
  evidence: string[][];
  outdated?: string[];
  wrong_scope?: string[];
}
export interface Case {
  id: string;
  category: string;
  common: string;
  notes: string[];
  question: string;
  fields: Record<string, Field>;
}
export const fieldsOf = (c: Case): string[] => Object.keys(c.fields).sort();
export function loadCases(folder: string): Case[] {
  const cases: unknown = JSON.parse(readFileSync(join(folder, "cases.json"), "utf8"));
  if (!Array.isArray(cases) || !cases.length) throw new Error("cases.json must be a nonempty array");
  const ids = new Set<string>();
  for (const c of cases) {
    if (!c || typeof c !== "object" || typeof c.id !== "string" || !/^[a-z0-9-]+$/.test(c.id) || ids.has(c.id)) throw new Error("case IDs must be unique lowercase slugs");
    ids.add(c.id);
    if (![c.category, c.common, c.question].every(v => typeof v === "string") || !c.question.trim() || !Array.isArray(c.notes) || !c.notes.length || !c.notes.every((v: unknown) => typeof v === "string" && v.trim())) throw new Error(`${c.id}: category/common/question/notes invalid`);
    if (!c.fields || typeof c.fields !== "object" || Array.isArray(c.fields) || !Object.keys(c.fields).length) throw new Error(`${c.id}: fields required`);
    for (const [key, field] of Object.entries(c.fields) as [string, Field][]) {
      if (!/^[a-z][a-z0-9_]*$/.test(key) || !field || !(field.values === null || Array.isArray(field.values) && field.values.length && field.values.every(v => typeof v === "string" && v.trim()))) throw new Error(`${c.id}: invalid answer field ${key}`);
      if (!Array.isArray(field.evidence) || !field.evidence.every(g => Array.isArray(g) && g.length && g.every(v => typeof v === "string" && v.trim()))) throw new Error(`${c.id}.${key}: invalid evidence groups`);
      if (field.values !== null && !field.evidence.length || field.values === null && field.evidence.length) throw new Error(`${c.id}.${key}: answerable fields need evidence, unanswerable fields must have none`);
      for (const k of ["outdated", "wrong_scope"] as const) if (field[k] !== undefined && (!Array.isArray(field[k]) || !field[k]!.every(v => typeof v === "string" && v.trim()))) throw new Error(`${c.id}.${key}: invalid ${k}`);
    }
  }
  return cases as Case[];
}
