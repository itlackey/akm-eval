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
import { readManifest } from "../../../lib/manifest.ts";
import { canonical, endpointDisplay, recordedEngine, withoutEngineSettings } from "../../../lib/provenance.ts";

export { canonical };

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

/** The evals that run in a container with Harbor. Their summaries hold the job as `config`, not an akm config, and no engine table. */
export const HARBOR = ["agent-ab", "terminal-bench"];

/**
 * The keys of an agent of the Harbor job that another axis owns: the model (the model axis), the akm and plugin under test and where their
 * tarballs and the library are (the build, and the cases through assets_sha256). The rest of the job is the config: the settings of both arms.
 * `library_assets` is the count the akm on this machine made of the library, a fact about the run and not a setting; summaries written
 * before it was left out of the job's digest hold it, and they must still compare.
 */
const AGENT_KWARGS_OWNED = ["akm_cli_version", "akm_plugin_version", "packages_dir", "akm_package", "plugin_package", "libraries_dir", "library_assets"];

function harborAgent(agent: unknown): unknown {
  if (!isObject(agent)) return agent;
  const { model_name: _model, kwargs, ...rest } = agent;
  if (!isObject(kwargs)) return rest;
  const own = Object.fromEntries(Object.entries(kwargs).filter(([k]) => !AGENT_KWARGS_OWNED.includes(k)));
  const { opencode_config, ...others } = own;
  const { small_model: _small, ...opencode } = isObject(opencode_config) ? opencode_config : ({} as Row);
  return { ...rest, kwargs: { ...others, ...(opencode_config === undefined ? {} : { opencode_config: opencode }) } };
}

/**
 * A digest of what a Harbor summary records of how its job was set up: the job (`config`, secrets redacted) without the datasets and the
 * attempts (the cases: assets_sha256), the model of each agent (the model axis) and the akm under test (the build axis), and with the
 * AKM_* settings of the akm arm (`akm_env`), which is how a config is swept. Null when the summary has no config or no akm_env.
 */
function harborConfigDigest(s: Row): string | null {
  if (!isObject(s.config) || !isObject(s.akm_env)) return null;
  const { datasets: _datasets, n_attempts: _attempts, agents, ...job } = s.config;
  return sha256(canonical({ ...job, agents: Array.isArray(agents) ? agents.map(harborAgent) : agents ?? null, akm_env: s.akm_env }));
}

/** The model and endpoint of a Harbor run, as the table of engines the other evals record: opencode is the one engine. A host with no scheme is a legacy summary, which does not say which deployment. */
function harborEngine(s: Row): string | null {
  if (!isObject(s.engine) || typeof s.engine.model !== "string") return null;
  const endpoint = s.engine.endpoint ?? null;
  if (endpoint !== null && !(typeof endpoint === "string" && endpoint.includes("://"))) return null;
  return canonical({ opencode: recordedEngine({ model: s.engine.model, endpoint, endpoint_id: s.engine.endpoint_id }) });
}

/** The akm version of a run; for a Harbor run with the plugin's, which it installs beside akm and which the build includes. */
function akmVersionOf(s: Row): string | null {
  const version = text(s.akm_version);
  const plugin = HARBOR.includes(s.eval) && isObject(s.akm_install) ? text(s.akm_install.plugin_version) : null;
  return version !== null && plugin !== null ? `${version} (plugin ${plugin})` : version;
}

/**
 * A digest of the akm config a summary records, without the model's settings (those are the model axis). Null when the summary has no
 * config. The configs have secrets redacted, so the digest holds none.
 */
export const configDigest = (config: unknown): string | null => (isObject(config) ? sha256(canonical(withoutEngineSettings(config))) : null);

/** What a summary says about how its run was made, as text: null is "none recorded". Field by field the policy compares these. */
export interface Identity {
  eval: string | null;
  /** `public` or `custom`. A summary from before the corpora were renamed (`private`, `own`) reads as the custom corpus of its kind. */
  corpus: string | null;
  /** `public`, `rewrite` (the public cases rewritten from a seed) or `own` (your notes): the kind a custom corpus records, or the kind the old name of an older summary stood for. */
  corpus_kind: string | null;
  collection: string | null;
  mode: string | null;
  /** The run read a rewrite of the public cases, so its seed is evidence it should record. */
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
  /** Settings that change what a run measures and belong to its scope, such as the embedder of consolidate and nightly (#69): a digest, null for none. */
  hints: string | null;
  /** The summary carries a valid manifest (see lib/manifest.ts). A summary without one is legacy. */
  manifest: boolean;
  /** The collector of the run, "version sha256", when it has a manifest. A collector of version 0 is a legacy run's, known only by its harness_sha256. */
  collector: string | null;
  /** The scorer of the run, "version sha256", when it has a manifest. The scorer is not an axis: a run is scored again. */
  scorer: string | null;
  harness_version: string | null;
  /** The `input_sha256` of each case of the run as JSON, when it has a manifest: what each case presents to akm. */
  case_inputs: string | null;
}

const text = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : typeof x === "number" && Number.isFinite(x) ? String(x) : null);

/**
 * The corpus a summary names, as the policy compares it. A run reads `public` or `custom` (lib/corpus.ts), and a custom corpus records its
 * kind, `rewrite` or `own`. A summary written before that says `private` (a rewrite), or `own` (distill's `own-feedback` too), and reads as the
 * custom corpus of that kind, so an old run and a new one on the same corpus have the same scope.
 */
export function corpusOf(s: Row): { name: string | null; kind: string | null } {
  const name = text(s.corpus);
  if (name === "private") return { name: "custom", kind: "rewrite" };
  if (name === "own" || name === "own-feedback") return { name: "custom", kind: "own" };
  return { name, kind: text(s.corpus_kind) ?? (name === "public" ? "public" : null) };
}

/**
 * What a summary says about how its run was made. A summary with a manifest (lib/manifest.ts) is read from it: the akm, the config, the
 * engines, the settings and the hints. One without is legacy, and is read from the fields every summary has. Either way an engine's
 * endpoint is its host and the digest of its identity, never its path (#65).
 */
export function identityOf(s: Row): Identity {
  const reading = readManifest(s);
  const m = reading.kind === "manifest" ? reading.manifest : null;
  // the settings of every engine the run used, by name; a summary that records only the default engine's does not say what a routed one used
  const harbor = HARBOR.includes(s.eval);
  const recorded = (engines: Row): string => canonical(Object.fromEntries(Object.entries(engines).map(([name, e]) => [name, recordedEngine(e)])));
  const engine = harbor ? harborEngine(s) : m ? recorded(m.engines) : isObject(s.engine) && isObject(s.engine.engines) ? recorded(s.engine.engines) : null;
  const embedder = text(s.embedder);
  const hints = { ...(embedder === null ? {} : { embedder }), ...(m?.treatment_hints ?? {}) };
  const part = (p: { version: number; sha256: string }): string => `${p.version} ${p.sha256}`;
  const corpus = corpusOf(s);
  return {
    eval: text(s.eval),
    corpus: corpus.name,
    corpus_kind: corpus.kind,
    collection: text(s.collection),
    mode: text(s.mode),
    private: corpus.kind === "rewrite",
    akm_version: m && !harbor ? m.akm.version : akmVersionOf(s),
    akm_build: m && !harbor ? m.akm.build : text(s.akm_build),
    akm_build_fingerprint: m && !harbor ? m.akm.build_fingerprint : text(s.akm_build_fingerprint),
    akm_bin: m && !harbor ? m.akm.bin : text(s.akm_bin),
    strategy: m ? m.settings.strategy : text(s.strategy),
    config_patch: m ? m.settings.config_patch_sha256 : isObject(s.config_patch) ? text(s.config_patch.sha256) : null,
    timeout_ms: m ? text(m.settings.timeout_ms) : text(s.timeout_ms),
    config: harbor ? harborConfigDigest(s) : m ? m.config.sha256 : configDigest(s.config),
    model: text(s.model),
    engine,
    assets_sha256: text(s.assets_sha256),
    seed: m ? m.settings.seed : text(s.seed),
    harness_sha256: text(s.harness_sha256),
    git_commit: text(s.git_commit),
    limit: text(s.limit),
    hints: Object.keys(hints).length === 0 ? null : canonical(hints),
    manifest: m !== null,
    collector: m ? part(m.collector) : null,
    scorer: m ? part(m.scorer) : null,
    harness_version: m ? String(m.harness_version) : null,
    case_inputs: m ? canonical(Object.fromEntries(Object.entries(m.cases).map(([id, c]) => [id, c.input_sha256]))) : null,
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
  { name: "corpus_kind", axis: "scope", label: "the kind of the custom corpus (a rewrite of the public cases from a seed, or your own)", values: corpusKinds },
  { name: "collection", axis: "scope", label: "the collection" },
  { name: "mode", axis: "scope", label: "the mode (consolidate --pool is another set of cases)" },
  // Runs with --embedder real and --embedder deterministic pair notes in different spaces: whatever the treatment, they are not the same measurement (#69).
  { name: "hints", axis: "scope", label: "the settings that change what a run measures (the embedder)" },
  { name: "akm_version", axis: "build", label: "the akm version" },
  { name: "akm_build", axis: "build", label: "the akm build", none: "release" },
  { name: "akm_build_fingerprint", axis: "build", label: "the uncommitted changes and installed dependencies of the akm build (akm_build_fingerprint)", none: "none" },
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

/** The kind of each run's corpus, unless the runs read different corpora (public and custom): the corpus field says so, and the kind would say it a second time. */
function corpusKinds(ms: Member[]): (string | null)[] {
  const same = new Set(ms.map((m) => m.identity.corpus)).size === 1;
  return ms.map((m) => (same ? m.identity.corpus_kind : null));
}

/** The harness axis is not one field: the digest of the eval's code, else the commit it ran from, which must be clean to identify it. */
const HARNESS: Field = { name: "harness", axis: "harness", label: "the eval's code", evidence: () => true, values: harnessValues, gap: "is not identified" };

/** A commit that identifies the eval's code: not missing, not "unknown", and not a tree with changes that are not committed. */
const cleanCommit = (c: string | null): c is string => c !== null && c !== "unknown" && !c.endsWith("-dirty");

/** The harness of each member: the digest of the eval's code when every member has one, else the commit when it is clean, else null. */
function harnessValues(ms: Member[]): (string | null)[] {
  if (ms.every((m) => m.identity.harness_sha256 !== null)) return ms.map((m) => `digest ${m.identity.harness_sha256}`);
  return ms.map((m) => (cleanCommit(m.identity.git_commit) ? `commit ${m.identity.git_commit}` : null));
}

const short = (v: string): string => v.replace(/\b[0-9a-f]{64}\b/g, (h) => h.slice(0, 12));

/** Engines as a message names them: by name, then each setting that is set. An endpoint is its host and the start of its digest, never its path (#65). */
function engineText(v: string): string {
  try {
    const engines = Object.entries(JSON.parse(v) as Row);
    const one = (e: Row) =>
      [e.model === null || e.model === undefined ? null : `model ${e.model}`, e.endpoint === null && e.endpoint_id === null ? null : `endpoint ${endpointDisplay(e)}`, ...["temperature", "enableThinking", "timeoutMs"].map((k) => (e[k] === null || e[k] === undefined ? null : `${k} ${e[k]}`))]
        .filter((x) => x !== null)
        .join(", ") || "none";
    return engines.length === 0 ? "none" : engines.map(([name, e]) => `${name}: ${one(e)}`).join("; ");
  } catch {
    return v;
  }
}

/** Hints as a message names them: `embedder real`. */
function hintsText(v: string): string {
  try {
    return Object.entries(JSON.parse(v) as Row).map(([k, x]) => `${k} ${x}`).join(", ") || "none";
  } catch {
    return v;
  }
}

/** The harness of each member when every run has a manifest: the collector's version and digest, and the harness version. A legacy collector (version 0) with no digest of its code is unidentified. */
function collectorValues(ms: Member[]): (string | null)[] {
  return ms.map((m) => {
    const [version, sha] = (m.identity.collector ?? "").split(" ");
    return version === "0" && /^0+$/.test(sha ?? "") ? null : `collector ${m.identity.collector} (harness ${m.identity.harness_version})`;
  });
}

export interface CheckOptions {
  /**
   * Read the harness from the manifest: the collector's version and digest, and the harness version, when every run has a manifest. Another scorer
   * is no difference, since a run is scored again (scripts/rescore); and the cases are compared one by one by their digests, so
   * `assets_sha256` is not compared. Off by default: the harness is then the digest of the eval's whole code.
   */
  manifest?: boolean;
  /**
   * With `manifest`: compare the input of every case the runs share (their `input_sha256`), and name the cases that differ as a difference of
   * the `inputs` axis. For a caller that takes its numbers from the summaries and so cannot leave a case out (scripts/matrix). scripts/compare
   * leaves out the cases whose input differs, up to a share of them, and does not set it.
   */
  caseInputs?: boolean;
}

/**
 * Checks the runs of a comparison against the treatment. `members` are all the runs of all sides, in the order of the sides (the
 * baseline's first). A field of an undeclared axis must have one value among all of them; a field of a declared axis only among the
 * runs of each side, since the sides are meant to differ there. A run that lacks evidence for an undeclared axis is a gap.
 * The messages do not depend on the order of the runs within a side.
 */
export function checkMembers(members: Member[], treatment: Axis[], options: CheckOptions = {}): PolicyResult {
  const out: PolicyResult = { treatment, mismatches: [], gaps: [], treated: [] };
  const byManifest = options.manifest === true && members.every((m) => m.identity.manifest);
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

  const fields: Field[] = [...FIELDS.filter((f) => !(byManifest && f.name === "assets_sha256")), byManifest ? { ...HARNESS, values: collectorValues, gap: "is not identified (a run from before harness-v3 with no harness_sha256)" } : HARNESS];
  for (const f of fields) {
    const display = (v: string | null): string => (v === null ? (f.none ?? "none") : f.name === "engine" ? engineText(v) : f.name === "hints" ? hintsText(v) : short(v));
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
    if (all.missing.length > 0) out.gaps.push({ axis: f.axis, field: f.name, message: `${f.label} ${f.gap ?? "is not recorded"} in ${who(all.missing)}${f.name === "harness" && !byManifest ? " (no harness_sha256, and git_commit is missing or has changes that are not committed)" : ""}` });
  }
  if (byManifest && options.caseInputs === true) {
    const differ = casesWithOtherInputs(members);
    if (differ.length > 0) {
      const ids = differ.length <= 5 ? differ.join(", ") : `${differ.slice(0, 5).join(", ")} and ${differ.length - 5} more`;
      const finding: Finding = { axis: "inputs", field: "case_inputs", message: `the cases were not given the same input in every run (input_sha256) for ${differ.length} case${differ.length === 1 ? "" : "s"}: ${ids}. A case with another input is another case` };
      (treatment.includes("inputs") ? out.treated : out.mismatches).push(finding);
    }
  }
  return out;
}

/** The ids of the cases that every run has and that some run was given another input for, from the manifests. */
function casesWithOtherInputs(members: Member[]): string[] {
  const inputs = members.map((m) => JSON.parse(m.identity.case_inputs ?? "{}") as Record<string, string>);
  return Object.keys(inputs[0] ?? {})
    .filter((id) => inputs.every((x) => id in x) && new Set(inputs.map((x) => x[id])).size > 1)
    .sort();
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
