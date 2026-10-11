// The comparison policy that scripts/compare and scripts/matrix share: which differences between runs a comparison may contain, and
// what a comparison needs to know of its runs before its numbers can be used for a conclusion. It reads summaries and nothing else.
// See ../README.md ("The comparison policy").
//
// Runs differ along five axes: build (the akm), config (strategy, config patch, the akm config, the time limit), model (the model and
// the settings of its engine), inputs (the cases and the private seed) and harness (this repository's code, as the eval ran it). A
// comparison declares the axes that are its treatment, the thing it measures. Every other axis must be the same in every run, in every
// run of a repeat set and not only the first, and the policy says so when it is not: a mismatch is a refusal ("not comparable"). An
// axis that cannot be checked, because a run does not record the evidence for it, makes the comparison exploratory: it is computed and
// shown, and it is not a conclusion.

import { createHash } from "node:crypto";
import { ENGINE_KEYS } from "../../../lib/provenance.ts";

export const AXES = ["build", "config", "model", "inputs", "harness"] as const;
export type Axis = (typeof AXES)[number];

/** A refusal or a bad input, with a message for the person at the command line. */
export class PolicyError extends Error {}

/** `build` or `build,config`: the axes of a --treatment. */
export function parseAxes(text: string): Axis[] {
  const words = text.split(",").map((w) => w.trim()).filter(Boolean);
  const bad = words.filter((w) => !(AXES as readonly string[]).includes(w));
  if (words.length === 0 || bad.length > 0) throw new PolicyError(`a treatment is one or more of ${AXES.join(", ")}, separated by commas${bad.length > 0 ? `; not ${bad.join(", ")}` : ""}`);
  return AXES.filter((a) => words.includes(a));
}

type Row = Record<string, any>;
const isObject = (x: unknown): x is Row => typeof x === "object" && x !== null && !Array.isArray(x);
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** JSON with the keys of every object in order, so the same value always gives the same text. */
export function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (isObject(x)) return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}`;
  return JSON.stringify(x) ?? "null";
}

function withoutEngineSettings(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(withoutEngineSettings);
  if (!isObject(x)) return x;
  return Object.fromEntries(
    Object.entries(x).map(([key, value]) => {
      if (key === "engines" && isObject(value)) return [key, Object.fromEntries(Object.entries(value).map(([name, e]) => [name, isObject(e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !(ENGINE_KEYS as readonly string[]).includes(k))) : e]))];
      return [key, withoutEngineSettings(value)];
    }),
  );
}

/**
 * A digest of the akm config a summary records, without the model's settings (those are the model axis). Null when the summary has no
 * config. The configs have secrets redacted, so the digest holds none.
 */
export const configDigest = (config: unknown): string | null => (isObject(config) ? sha256(canonical(withoutEngineSettings(config))) : null);

/** What a summary says about how its run was made, as text: null is "none recorded". Field by field the policy compares these. */
export interface Identity {
  eval: string | null;
  corpus: string | null;
  collection: string | null;
  mode: string | null;
  /** The run read private assets, so its seed is evidence it should record. */
  private: boolean;
  akm_version: string | null;
  akm_build: string | null;
  /** What the akm checkout holds beyond its commit (a digest), null for a clean checkout or a release. */
  akm_build_fingerprint: string | null;
  akm_bin: string | null;
  strategy: string | null;
  config_patch: string | null;
  timeout_ms: string | null;
  config: string | null;
  model: string | null;
  engine: string | null;
  assets_sha256: string | null;
  seed: string | null;
  harness_sha256: string | null;
  git_commit: string | null;
  limit: string | null;
}

const text = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : null);

export function identityOf(s: Row): Identity {
  // the settings of every engine the run used, by name; a summary that records only the default engine's does not say what a routed one used
  const engine = isObject(s.engine) && isObject(s.engine.engines) ? canonical(s.engine.engines) : null;
  return {
    eval: text(s.eval),
    corpus: text(s.corpus),
    collection: text(s.collection),
    mode: text(s.mode),
    private: s.corpus === "private",
    akm_version: text(s.akm_version),
    akm_build: text(s.akm_build),
    akm_build_fingerprint: text(s.akm_build_fingerprint),
    akm_bin: text(s.akm_bin),
    strategy: text(s.strategy),
    config_patch: isObject(s.config_patch) ? text(s.config_patch.sha256) : null,
    timeout_ms: text(s.timeout_ms),
    config: configDigest(s.config),
    model: text(s.model),
    engine,
    assets_sha256: text(s.assets_sha256),
    seed: text(s.seed),
    harness_sha256: text(s.harness_sha256),
    git_commit: text(s.git_commit),
    limit: text(s.limit),
  };
}

// ---- the checks -------------------------------------------------------------------------------------------------------------

/** A run, or the runs of one side of a comparison, with the name its messages use. `side` is "A", "the baseline" and so on. */
export interface Member {
  side: string;
  /** Tells a run from the others of its side, such as its results folder. Only used when a side has more than one run. */
  name: string;
  identity: Identity;
}

export interface Finding {
  axis: Axis | "scope";
  field: string;
  message: string;
}

export interface PolicyResult {
  treatment: Axis[];
  /** Differences on an axis that is not the treatment, or among the repeats of one side: the runs do not measure the same thing. */
  mismatches: Finding[];
  /** Evidence an undeclared axis needs and a run does not record: the runs may differ in a way the summaries do not show. */
  gaps: Finding[];
  /** What differs on a declared axis: the treatment. */
  treated: Finding[];
}

interface Field {
  name: keyof Identity | "harness";
  axis: Axis | "scope";
  label: string;
  /** How a null reads in a message. */
  none?: string;
  /** The field is evidence: a run that does not record it (where this returns true) leaves the axis unchecked. Without it a null is a value. */
  evidence?: (i: Identity) => boolean;
  /** Compared among the runs of one side only, never across sides. */
  within?: boolean;
  /** The value of each member, for a field that is not one field of the identity. */
  values?: (ms: Member[]) => (string | null)[];
  /** What a message says of a run that lacks the evidence: "<label> is not recorded in A". */
  gap?: string;
}

const FIELDS: Field[] = [
  { name: "eval", axis: "scope", label: "the eval" },
  { name: "corpus", axis: "scope", label: "the corpus" },
  { name: "collection", axis: "scope", label: "the collection" },
  { name: "mode", axis: "scope", label: "the mode (consolidate --pool is another set of cases)" },
  { name: "akm_version", axis: "build", label: "the akm version" },
  { name: "akm_build", axis: "build", label: "the akm build", none: "release" },
  { name: "akm_build_fingerprint", axis: "build", label: "the uncommitted changes of the akm build (akm_build_fingerprint)", none: "none" },
  { name: "akm_bin", axis: "build", label: "the akm command (akm_bin)" },
  { name: "strategy", axis: "config", label: "the strategy" },
  { name: "config_patch", axis: "config", label: "the config patch" },
  { name: "timeout_ms", axis: "config", label: "the time limit (timeout_ms)" },
  { name: "config", axis: "config", label: "the akm config", evidence: () => true },
  { name: "model", axis: "model", label: "the model" },
  { name: "engine", axis: "model", label: "the engine settings (model, endpoint, temperature, thinking, time limit of each engine used)", evidence: () => true },
  { name: "assets_sha256", axis: "inputs", label: "the cases (assets_sha256)", evidence: () => true },
  { name: "seed", axis: "inputs", label: "the seed of the private assets", evidence: (i) => i.private },
  { name: "limit", axis: "inputs", label: "the --limit", within: true },
];

/** The harness axis is not one field: the digest of the eval's code, else the commit it ran from, which must be clean to identify it. */
const HARNESS: Field = { name: "harness", axis: "harness", label: "the eval's code", evidence: () => true, values: harnessValues, gap: "is not identified" };

/** The fields a summary of an eval may leave out because the eval has no such thing (the Harbor evals write no akm config and no engine). */
export type Skip = readonly string[];

/** A commit that identifies the eval's code: not missing, not "unknown", and not a tree with changes that are not committed. */
const cleanCommit = (c: string | null): c is string => c !== null && c !== "unknown" && !c.endsWith("-dirty");

/** The harness of each member: the digest of the eval's code when every member has one, else the commit when it is clean, else null. */
function harnessValues(ms: Member[]): (string | null)[] {
  if (ms.every((m) => m.identity.harness_sha256 !== null)) return ms.map((m) => `digest ${m.identity.harness_sha256}`);
  return ms.map((m) => (cleanCommit(m.identity.git_commit) ? `commit ${m.identity.git_commit}` : null));
}

const short = (v: string): string => v.replace(/\b[0-9a-f]{64}\b/g, (h) => h.slice(0, 12));
function engineText(v: string): string {
  try {
    const engines = Object.entries(JSON.parse(v) as Row);
    const one = (e: Row) => Object.entries(e).filter(([, x]) => x !== null).map(([k, x]) => `${k} ${x}`).join(", ") || "none";
    return engines.length === 0 ? "none" : engines.map(([name, e]) => `${name}: ${one(e)}`).join("; ");
  } catch {
    return v;
  }
}

/**
 * Checks the runs of a comparison against the treatment. `members` are all the runs of all sides, in the order of the sides (the
 * baseline's first). A field of an undeclared axis must have one value among all of them; a field of a declared axis only among the
 * runs of each side, since the sides are meant to differ there. A run that lacks evidence for an undeclared axis is a gap.
 * The messages do not depend on the order of the runs within a side.
 */
export function checkMembers(members: Member[], treatment: Axis[], skip: Skip = []): PolicyResult {
  const out: PolicyResult = { treatment, mismatches: [], gaps: [], treated: [] };
  const sides = [...new Set(members.map((m) => m.side))];
  /** "A", or "the baseline and the config", or "the baseline r2 and r3" when only some of the runs of a side are meant. */
  const who = (group: Member[]): string => {
    const names: string[] = [];
    for (const side of sides) {
      const mine = members.filter((m) => m.side === side);
      const here = mine.filter((m) => group.includes(m));
      if (here.length === 0) continue;
      names.push(here.length === mine.length ? side : `${side} ${here.map((m) => m.name).sort().join(" and ")}`);
    }
    return names.join(" and ");
  };

  const analyse = (f: Field, ms: Member[]) => {
    const values = f.values ? f.values(ms) : ms.map((m) => m.identity[f.name as keyof Identity] as string | null);
    const missing: Member[] = [];
    const groups = new Map<string | null, Member[]>();
    ms.forEach((m, i) => {
      if (values[i] === null && f.evidence) {
        if (f.evidence(m.identity)) missing.push(m);
        return;
      }
      groups.set(values[i], [...(groups.get(values[i]) ?? []), m]);
    });
    const ordered = [...groups.entries()].sort(([va, a], [vb, b]) => sides.indexOf(a[0].side) - sides.indexOf(b[0].side) || String(va).localeCompare(String(vb)));
    return { missing, groups: ordered };
  };

  const fields: Field[] = [...FIELDS.filter((f) => !skip.includes(f.name)), HARNESS];
  for (const f of fields) {
    const display = (v: string | null): string => (v === null ? (f.none ?? "none") : f.name === "engine" ? engineText(v) : short(v));
    const describe = (groups: [string | null, Member[]][]) => groups.map(([v, ms]) => `${display(v)} in ${who(ms)}`).join(", ");
    const declared = f.axis !== "scope" && treatment.includes(f.axis);
    const among = (ms: Member[], where: string) => {
      const { groups } = analyse(f, ms);
      if (groups.length > 1) out.mismatches.push({ axis: f.axis, field: f.name, message: `${f.label} differs among the repeats of ${where}: ${describe(groups)}` });
    };
    if (f.within || declared) {
      for (const side of sides) among(members.filter((m) => m.side === side), side);
    }
    if (f.within) continue;
    const all = analyse(f, members);
    if (declared) {
      if (all.groups.length > 1) out.treated.push({ axis: f.axis, field: f.name, message: `${f.label} differs: ${describe(all.groups)}` });
      continue;
    }
    if (all.groups.length > 1) out.mismatches.push({ axis: f.axis, field: f.name, message: `${f.label} differs: ${describe(all.groups)}` });
    if (all.missing.length > 0) out.gaps.push({ axis: f.axis, field: f.name, message: `${f.label} ${f.gap ?? "is not recorded"} in ${who(all.missing)}${f.name === "harness" ? " (no harness_sha256, and git_commit is missing or has changes that are not committed)" : ""}` });
  }
  return out;
}

/** One summary line per finding. */
export const messages = (findings: Finding[]): string[] => [...new Set(findings.map((f) => f.message))];

// ---- completion -------------------------------------------------------------------------------------------------------------

/** Why a run's numbers cover less than the run set out to do. `aborted` when the run says it gave up; else the summary does not show that it finished. */
export interface Incomplete {
  aborted: boolean;
  detail: string;
}

const count = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * Null when the summary says the run finished everything it set out to do: `status: "complete"`, no result missing from the `completion`
 * a Harbor run records, and (without a --limit) every case run. A summary that records no status is not known to have finished.
 */
export function incompleteOf(s: Row): Incomplete | null {
  if (s.status === "aborted") return { aborted: true, detail: typeof s.aborted_reason === "string" && s.aborted_reason !== "" ? s.aborted_reason : "no reason recorded" };
  if (s.status === undefined || s.status === null) return { aborted: false, detail: "the summary records no status, so the run is not known to have finished" };
  if (s.status !== "complete") return { aborted: false, detail: `the summary's status is ${JSON.stringify(s.status)}, not "complete"` };
  const missing = count(s.completion?.missing);
  if (missing !== null && missing > 0) {
    const expected = count(s.completion?.expected);
    return { aborted: false, detail: `${missing}${expected !== null ? ` of ${expected}` : ""} expected result${missing === 1 ? " is" : "s are"} missing` };
  }
  const [run, cases] = [count(s.n_run), count(s.n_cases)];
  if (run !== null && cases !== null && run < cases && (s.limit === undefined || s.limit === null)) return { aborted: false, detail: `it ran ${run} of ${cases} cases` };
  return null;
}

/** "was cut short: reason" or "is not complete: reason", to follow a subject. `prefix` names a run inside a repeat. */
export const incompleteClause = (i: Incomplete, prefix = ""): string => `${i.aborted ? "was cut short" : "is not complete"}: ${prefix}${i.detail}`;
