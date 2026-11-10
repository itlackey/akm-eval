// The cards of the cli-ratification pilot: fourteen small tasks, three for each of the first four task families of the design
// (apply project knowledge, persist a decision, repair lookup, resume workflow) and two regression cards for akm#1472 and akm#1473.
// Names and values are drawn from a seeded generator, so they are fixed and reviewable; generate.ts writes them out as Harbor tasks
// and libraries, and a test regenerates them and compares, so a card is changed here and nowhere else.
//
// A card holds what the agent is given (the instruction, the working directory's files, the library akm is seeded from, and the hidden
// plant script and reference recipe that go with the library) and what only the verifier knows (tests/expected.json). The instruction
// asks for one outcome and never names a command.

import { createHash } from "node:crypto";

export type Family = "apply" | "persist" | "repair" | "resume" | "regression";
export type Files = Record<string, string>;

/** The seed of every draw. Changing it changes every card: a new version of the eval. */
export const SEED = "cli-ratification/1";

export interface Card {
  id: string;
  family: Family;
  /** The project whose directory the agent starts in. */
  project: "orchid" | "quill";
  description: string;
  instruction: string;
  /** The files of the working directory, /work/<project>. */
  workspace: Files;
  /** The files of the library akm is seeded from; `.plant.sh` and `.solve.sh` are hidden and are not assets. */
  library: Files;
  /** Files a plant script adds to the bundle after the seed (path from the bundle, text): the verifier's `known` and `preserved` include them. */
  planted: Files;
  /** The verifier's checks, in order (verify.mjs). `preserved` and the other generated parts are added by `expectedOf`. */
  checks: Record<string, unknown>[];
  /** What the trace must show for the answer to be AKM-mediated: values that must appear in the output of an akm call, before the answer is written; and patterns of akm commands, one of which must have run. */
  evidence: string[];
  commands: string[];
  /** The informed reference's recipe: the library's hidden `.solve.sh`. */
  solve: string;
}

// ---- the draws -------------------------------------------------------------------------------------------------------------

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Draw {
  private next: () => number;
  private used = new Set<string>();
  constructor(key: string) {
    this.next = mulberry32(parseInt(createHash("sha256").update(`${SEED}|${key}`).digest("hex").slice(0, 8), 16));
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  /** An item of `pool` not drawn before from this draw, so a card's names and values differ. */
  pick<T>(pool: readonly T[]): T {
    for (let i = 0; i < 100; i++) {
      const x = pool[this.int(0, pool.length - 1)];
      const key = JSON.stringify(x);
      if (!this.used.has(key)) {
        this.used.add(key);
        return x;
      }
    }
    throw new Error("the pool is exhausted");
  }
  hex(n = 4): string {
    return Array.from({ length: n }, () => "0123456789abcdef"[this.int(0, 15)]).join("");
  }
  /** A number of `digits` digits that was not drawn before. */
  num(digits: number): number {
    for (let i = 0; i < 100; i++) {
      const n = this.int(10 ** (digits - 1), 10 ** digits - 1);
      if (!this.used.has(String(n))) {
        this.used.add(String(n));
        return n;
      }
    }
    throw new Error("no number left");
  }
}

const SERVICES = ["gantry", "tallow", "wicket", "sconce", "brindle", "pannier", "oriel", "vellum", "quoin", "fescue", "lintel", "thrum", "corbel", "spandrel", "cresset", "ferrule"] as const;
const TREES = ["cedar", "birch", "alder", "larch", "rowan", "aspen", "hazel", "maple"] as const;
const COMPASS = ["east", "west", "north", "south", "central"] as const;
const WORDS = ["kestrel", "heron", "plover", "wren", "osprey", "merlin", "tern", "ibis", "finch", "swift"] as const;
const STEPS = ["build", "stage", "publish", "notify", "archive", "verify", "seal", "rollout"] as const;

const region = (d: Draw) => `${d.pick(TREES)}-${d.pick(COMPASS)}`;
const port = (d: Draw) => d.num(4);

// ---- notes -----------------------------------------------------------------------------------------------------------------

interface Note {
  dir?: "memories" | "knowledge";
  name: string;
  description: string;
  tags?: string[];
  project?: string;
  body: string;
}

/** A note as an asset file: frontmatter akm reads, then the body. The name and body never say which project a note belongs to. */
const note = (n: Note): [string, string] => [
  `${n.dir ?? "memories"}/${n.name}.md`,
  `---\ndescription: ${n.description}\ntags: [${(n.tags ?? ["deployment"]).join(", ")}]\n${n.project ? `project: ${n.project}\n` : ""}---\n${n.body}\n`,
];
const files = (...pairs: [string, string][]): Files => Object.fromEntries(pairs);

const READMEs = (project: string, s: string) => `# ${project}\n\nThe \`${s}\` service and its deployment files.\n`;

/** A shell recipe step: the first hit of a search, shown, and the first match of a pattern in it. */
const lookup = (query: string, filter: string, pattern: string, type = "memory") =>
  `$(akm show "$(akm search ${JSON.stringify(query)} --type ${type} --filter ${filter} --limit 1 --format json | node -pe '(j=>(j.results??j.hits)[0].ref)(JSON.parse(require("fs").readFileSync(0,"utf8")))')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content' | grep -oE ${JSON.stringify(pattern)} | tail -1)`;

const solve = (project: string, body: string) => `#!/bin/bash\n# The informed reference: written by someone who knows the commands. Run by the reference agent, never given to a model.\nset -euo pipefail\ncd /work/${project}\n${body}`;

// ---- family 1: apply project knowledge ---------------------------------------------------------------------------------------

function applyServiceJson(): Card {
  const d = new Draw("apply-service-json");
  const s = d.pick(SERVICES), other = d.pick(SERVICES);
  const [po, pq, pOld] = [port(d), port(d), port(d)];
  const [ro, rq, rOld] = [region(d), region(d), region(d)];
  const [h1, h2, h3, h4, h5, h6] = [d.hex(), d.hex(), d.hex(), d.hex(), d.hex(), d.hex()];
  const library = files(
    note({ name: `listen-port-${h1}`, description: `Approved listen port of the ${s} service`, project: "orchid", body: `The approved listen port for the ${s} service is ${po}.` }),
    note({ name: `listen-port-${h2}`, description: `Approved listen port of the ${s} service`, project: "quill", body: `The approved listen port for the ${s} service is ${pq}.` }),
    note({ name: `deploy-region-${h3}`, description: `Approved deployment region of the ${s} service`, project: "orchid", body: `The ${s} service is deployed in the region ${ro}.` }),
    note({ name: `deploy-region-${h4}`, description: `Approved deployment region of the ${s} service`, project: "quill", body: `The ${s} service is deployed in the region ${rq}.` }),
    note({ name: `listen-port-${h5}`, description: `Approved listen port of the ${other} service`, project: "orchid", body: `The approved listen port for the ${other} service is ${port(d)}.` }),
    note({ dir: "knowledge", name: `service-file-format-${h6}`, description: "How service files are written", body: "Service files are flat JSON objects. A port is written as an integer, and the name of a place as a string." }),
  );
  const q = (what: string) => `approved ${what} ${s}`;
  return {
    id: "apply--service-json", family: "apply", project: "orchid",
    description: `Write service.json for ${s} from the project's approved port and region`,
    instruction: `You are working in /work/orchid. Prepare service.json for the ${s} service using this project's approved listen port and deployment region. The file should contain only listen_port as an integer and region as a string. Leave the existing application files and shared knowledge intact. In REPORT.md, identify the source you relied on and anything uncertain.`,
    workspace: files(["README.md", READMEs("orchid", s)], [`app/${s}.conf`, `service ${s}\nworkers 2\n`], ["archive/service-2025-q4.json", `${JSON.stringify({ listen_port: pOld, region: rOld })}\n`]),
    library, planted: {},
    checks: [
      { type: "json-file", file: "service.json", exact: { listen_port: po, region: ro } },
      { type: "absent", file: "service.json", tokens: [String(pq), rq, String(pOld), rOld] },
    ],
    evidence: [String(po), ro], commands: [],
    solve: solve("orchid", `port=${lookup(q("listen port"), "project=orchid", "[0-9]{4,5}")}\nregion=${lookup(q("deployment region"), "project=orchid", "[a-z]+-[a-z]+")}\nprintf '{"listen_port": %s, "region": "%s"}\\n' "$port" "$region" > service.json\n`),
  };
}

function applyDeployEnv(): Card {
  const d = new Draw("apply-deploy-env");
  const s = d.pick(SERVICES);
  const [no, nq] = [d.int(120, 199), d.int(200, 299)];
  const win = () => `${String(d.int(0, 5)).padStart(2, "0")}:${d.pick(["00", "15", "30", "45"])}`;
  const [wo, wq] = [win(), win()];
  const channel = `#ops-${d.pick(WORDS)}`;
  const [h1, h2, h3, h4, h5] = [d.hex(), d.hex(), d.hex(), d.hex(), d.hex()];
  const library = files(
    note({ name: `replicas-${h1}`, description: `How many replicas of the ${s} service run`, project: "orchid", body: `The ${s} service runs ${no} replicas.` }),
    note({ name: `replicas-${h2}`, description: `How many replicas of the ${s} service run`, project: "quill", body: `The ${s} service runs ${nq} replicas.` }),
    note({ name: `backup-window-${h3}`, description: `When the ${s} service is backed up`, project: "orchid", body: `The ${s} service is backed up daily at ${wo} UTC.` }),
    note({ name: `backup-window-${h4}`, description: `When the ${s} service is backed up`, project: "quill", body: `The ${s} service is backed up daily at ${wq} UTC.` }),
    note({ name: `alert-channel-${h5}`, description: `Where alerts of the ${s} service go`, body: `Alerts of the ${s} service go to the chat channel ${channel}, for every project.` }),
  );
  return {
    id: "apply--deploy-env", family: "apply", project: "quill",
    description: `Write deploy.env for ${s} from the project's replicas and backup window and the shared alert channel`,
    instruction: `You are working in /work/quill. Write deploy.env for the ${s} service with REPLICAS (a number), BACKUP_WINDOW (as HH:MM, UTC understood) and ALERT_CHANNEL set to what this project has agreed. One KEY=value per line and no other lines. Leave the existing files intact. In REPORT.md, identify the sources you relied on and anything uncertain.`,
    workspace: files(["README.md", READMEs("quill", s)], ["Makefile", `deploy:\n\t@echo deploying ${s}\n`]),
    library, planted: {},
    checks: [
      { type: "lines-file", file: "deploy.env", unquote: true, lines: [`REPLICAS=${nq}`, `BACKUP_WINDOW=${wq}`, `ALERT_CHANNEL=${channel}`] },
      { type: "absent", file: "deploy.env", tokens: [String(no), wo] },
    ],
    evidence: [String(nq), wq, channel], commands: [],
    solve: solve("quill", `replicas=${lookup(`${s} replicas`, "project=quill", "[0-9]+")}\nwindow=${lookup(`${s} backed up`, "project=quill", "[0-9]{2}:[0-9]{2}")}\nchannel=${lookup(`alerts ${s} chat channel`, "project=", "#[a-z-]+")}\nprintf 'REPLICAS=%s\\nBACKUP_WINDOW=%s\\nALERT_CHANNEL=%s\\n' "$replicas" "$window" "$channel" > deploy.env\n`),
  };
}

function applyLimitsJson(): Card {
  const d = new Draw("apply-limits-json");
  const s = d.pick(SERVICES);
  const lim = () => ({ cpu: `${d.pick([250, 500, 750, 1000, 1500])}m`, memory: `${d.pick([128, 256, 512, 1024, 2048])}Mi`, timeout_secs: d.int(100, 900) });
  const [lo, lq] = [lim(), lim()];
  const [h1, h2, h3] = [d.hex(), d.hex(), d.hex()];
  const doc = (l: ReturnType<typeof lim>) => `Resource limits of the ${s} service.\n\nIts CPU is capped at ${l.cpu}. Its memory is capped at ${l.memory}. A request that runs longer than ${l.timeout_secs} seconds is cut off.`;
  const library = files(
    note({ dir: "knowledge", name: `limits-${h1}`, description: `Resource limits of the ${s} service`, project: "orchid", body: doc(lo) }),
    note({ dir: "knowledge", name: `limits-${h2}`, description: `Resource limits of the ${s} service`, project: "quill", body: doc(lq) }),
    note({ dir: "knowledge", name: `limits-file-format-${h3}`, description: "How a limits file is written", body: "A limits file is a flat JSON object: cpu and memory are strings with their unit, and the timeout is a whole number of seconds." }),
  );
  return {
    id: "apply--limits-json", family: "apply", project: "orchid",
    description: `Write limits.json for ${s} from the project's resource limits document`,
    instruction: `You are working in /work/orchid. Write limits.json for the ${s} service from this project's resource limits. The file holds cpu (string), memory (string) and timeout_secs (integer), and nothing else. Leave the existing files intact. In REPORT.md, identify the source you relied on and anything uncertain.`,
    workspace: files(["README.md", READMEs("orchid", s)], [`app/${s}.conf`, `service ${s}\nworkers 4\n`]),
    library, planted: {},
    checks: [
      { type: "json-file", file: "limits.json", exact: lo },
      { type: "absent", file: "limits.json", tokens: [lq.cpu, lq.memory] },
    ],
    evidence: [lo.cpu, lo.memory, `${lo.timeout_secs}`], commands: [],
    solve: solve("orchid", `text=$(akm show "$(akm search "${s} resource limits" --type knowledge --filter project=orchid --limit 1 --format json | node -pe '(j=>(j.results??j.hits)[0].ref)(JSON.parse(require("fs").readFileSync(0,"utf8")))')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content')\ncpu=$(printf '%s' "$text" | grep -oE '[0-9]+m' | head -1)\nmem=$(printf '%s' "$text" | grep -oE '[0-9]+Mi' | head -1)\nsecs=$(printf '%s' "$text" | grep -oE '[0-9]+ seconds' | grep -oE '[0-9]+')\nprintf '{"cpu": "%s", "memory": "%s", "timeout_secs": %s}\\n' "$cpu" "$mem" "$secs" > limits.json\n`),
  };
}

// ---- family 2: persist a decision --------------------------------------------------------------------------------------------

/** `known` (the files the task gave) is added by expectedOf. */
const persistChecks = (project: "orchid" | "quill", value: string, query: string, extra: { tags?: string[] } = {}) => [{ type: "persisted", value, project, query, types: ["memories", "knowledge"], tags: extra.tags ?? [] }];

function persistCard(o: { id: string; project: "orchid" | "quill"; seed: string; value: (d: Draw, s: string) => string; decision: (s: string, v: string) => string; topic: string; stale: (s: string, d: Draw) => string; tag?: string }): Card {
  const d = new Draw(o.seed);
  const s = d.pick(SERVICES);
  const value = o.value(d, s);
  const [h1, h2] = [d.hex(), d.hex()];
  const library = files(
    note({ name: `${o.topic.replace(/ /g, "-")}-${h1}`, description: `${o.topic} of the ${s} service`, project: o.project, body: o.stale(s, d) }),
    note({ name: `${o.topic.replace(/ /g, "-")}-${h2}`, description: `${o.topic} of the ${s} service`, project: o.project === "orchid" ? "quill" : "orchid", body: o.stale(s, d) }),
  );
  const query = `${s} ${o.topic}`;
  const card: Card = {
    id: o.id, family: "persist", project: o.project,
    description: `Record the decision about the ${s} service's ${o.topic}`,
    instruction: `You are working in /work/${o.project}. ${o.decision(s, value)} Record this decision so that anyone working on this project later can find it${o.tag ? `. Tag it \`${o.tag}\`` : ""}. In REPORT.md, say where you recorded it.`,
    workspace: files(["README.md", READMEs(o.project, s)]),
    library, planted: {},
    checks: [],
    evidence: [], commands: ["akm\\s+(remember|import|index|clone|proposal)"],
    solve: "",
  };
  card.checks = persistChecks(o.project, value, query, { tags: o.tag ? [o.tag] : [] });
  card.solve = solve(o.project, `akm remember ${JSON.stringify(o.decision(s, value))} --tag ${o.tag ?? "decision"} --supersedes memories/${o.topic.replace(/ /g, "-")}-${h1} --name ${o.id.replace(/^persist--/, "")}-${d.hex()} >/dev/null\n`);
  return card;
}

const persistCanary = () =>
  persistCard({ id: "persist--canary-share", project: "orchid", seed: "persist-canary-share", topic: "canary share", value: (d) => String(d.int(11, 49)), decision: (s, v) => `The team has just decided that the ${s} service's canary share is ${v} percent.`, stale: (s, d) => `When the ${s} service launched, its canary share was ${d.int(2, 9)} percent.` });
const persistStaging = () =>
  persistCard({ id: "persist--staging-host", project: "quill", seed: "persist-staging-host", topic: "staging host", value: (d) => `${d.pick(WORDS)}-${d.int(100, 999)}.stage.internal`, decision: (s, v) => `The team has just decided that the ${s} service's staging host is now ${v}.`, stale: (s, d) => `The staging host of the ${s} service is ${d.pick(WORDS)}-${d.int(100, 999)}.stage.internal.` });
const persistAddress = () =>
  persistCard({ id: "persist--release-address", project: "orchid", seed: "persist-release-address", topic: "release notes address", value: (d, s) => `${s}-${d.pick(WORDS)}@example.com`, decision: (s, v) => `The team has just decided that release notes of the ${s} service go to ${v}.`, stale: (s, d) => `Release notes of the ${s} service go to ${s}-${d.pick(WORDS)}@example.com.`, tag: "decision" });

// ---- family 3: repair lookup -------------------------------------------------------------------------------------------------

function repairStaleIndex(): Card {
  const d = new Draw("repair-stale-index");
  const s = d.pick(SERVICES);
  const days = d.int(20, 60);
  const [h1, h2, h3] = [d.hex(), d.hex(), d.hex()];
  const library = files(
    note({ name: `key-storage-${h1}`, description: `Where the ${s} gateway keeps its keys`, project: "orchid", body: `The ${s} gateway keeps its keys in the sealed vault.` }),
    note({ name: `gateway-port-${h2}`, description: `The ${s} gateway port`, project: "orchid", body: `The ${s} gateway listens on port ${port(d)}.` }),
  );
  const planted = files(note({ name: `key-rotation-${h3}`, description: `How often the ${s} gateway rotates its keys`, project: "orchid", body: `The ${s} gateway rotates its keys every ${days} days.` }));
  const [path, text] = Object.entries(planted)[0];
  return {
    id: "repair--stale-index", family: "repair", project: "orchid",
    description: `A note filed today is missing from search`,
    instruction: `You are working in /work/orchid. The note about the ${s} gateway's key rotation was filed today, but a search for “${s} key rotation” does not find it. Make that search find it. Do not change or delete any note. In REPORT.md, say what was wrong.`,
    workspace: files(["README.md", READMEs("orchid", s)]),
    library: { ...library, ".plant.sh": `#!/bin/bash\n# The note is filed straight into the bundle after the last index.\nset -euo pipefail\ncat > "$AKM_BUNDLE_DIR/${path}" <<'NOTE'\n${text}NOTE\n` },
    planted,
    checks: [{ type: "lookup", query: `${s} key rotation`, ref: path.replace(/\.md$/, "") }],
    evidence: [], commands: ["akm\\s+index"],
    solve: solve("orchid", `akm index >/dev/null\n`),
  };
}

function repairExcludedType(): Card {
  const d = new Draw("repair-excluded-type");
  const s = d.pick(SERVICES);
  const [h1, h2, h3] = [d.hex(), d.hex(), d.hex()];
  const order = [d.pick(WORDS), d.pick(WORDS)].join(", then ");
  const gold = `runbook-${h1}`;
  const library: Files = {
    ...files(
      note({ name: gold, description: `Runbook of the ${s} service`, project: "quill", body: `To restart the ${s} service, stop its workers first, then its queue, then bring up ${order}.` }),
      note({ name: `runbook-${h2}`, description: `Runbook of the ${d.pick(SERVICES)} service`, project: "quill", body: `To restart this service, drain the pool and wait ${d.int(20, 90)} seconds.` }),
      note({ dir: "knowledge", name: `oncall-${h3}`, description: "The on-call handover routine", project: "quill", body: "The on-call engineer hands over at the start of each shift and reads the open incidents first." }),
    ),
    ".plant.sh": `#!/bin/bash\n# Memories are left out of every search by default.\nset -euo pipefail\nakm config set search.defaultExcludeTypes '["memory"]' --silent\n`,
  };
  return {
    id: "repair--excluded-type", family: "repair", project: "quill",
    description: `Searches find no notes of one kind`,
    instruction: `You are working in /work/quill. A search for “${s} runbook” finds nothing, although the library holds notes about it. Make that search find the ${s} runbook again. Do not change or delete any note. In REPORT.md, say what was wrong.`,
    workspace: files(["README.md", READMEs("quill", s)]),
    library, planted: {},
    checks: [{ type: "lookup", query: `${s} runbook`, ref: `memories/${gold}` }, { type: "project-config", paths: { orchid: ["/work/orchid"], quill: ["/work/quill"] } }],
    evidence: [], commands: ["akm\\s+config\\s+(set|unset)"],
    solve: solve("quill", `akm config unset search.defaultExcludeTypes >/dev/null\n`),
  };
}

function repairProjectFilter(): Card {
  const d = new Draw("repair-project-filter");
  const s = d.pick(SERVICES);
  const [h1, h2] = [d.hex(), d.hex()];
  const gold = `deploy-checklist-${h1}`;
  const library = files(
    note({ dir: "knowledge", name: gold, description: `Deploy checklist of the ${s} service`, project: "orchid", body: `Before deploying ${s}: freeze the queue, take a backup, then ship.` }),
    note({ dir: "knowledge", name: `deploy-checklist-${h2}`, description: `Deploy checklist of the ${s} service`, project: "quill", body: `Before deploying ${s}: announce the window, then ship.` }),
  );
  const typo = `{"orchid":{"paths":["/work/orchid"],"filters":{"project":["orchd"]}},"quill":{"paths":["/work/quill"]}}`;
  return {
    id: "repair--project-filter", family: "repair", project: "orchid",
    description: `Searches from the project's directory find nothing`,
    instruction: `You are working in /work/orchid. A search for “${s} deploy checklist” from this directory finds nothing, though the library holds this project's checklist. Make that search work from here again. Do not change or delete any note, and keep this directory registered as the Orchid project. In REPORT.md, say what was wrong.`,
    workspace: files(["README.md", READMEs("orchid", s)]),
    library: { ...library, ".plant.sh": `#!/bin/bash\n# The project's filter names a project that does not exist.\nset -euo pipefail\nakm config set projects '${typo}' --silent\n` },
    planted: {},
    checks: [{ type: "lookup", query: `${s} deploy checklist`, ref: `knowledge/${gold}` }, { type: "project-config", paths: { orchid: ["/work/orchid"], quill: ["/work/quill"] } }],
    evidence: [], commands: ["akm\\s+config\\s+(set|unset)"],
    solve: solve("orchid", `akm config unset projects.orchid.filters >/dev/null
`),
  };
}

// ---- family 4: resume workflow -----------------------------------------------------------------------------------------------

function resumeCard(o: { id: string; project: "orchid" | "quill"; steps: number; failAt: number }): Card {
  const d = new Draw(o.id);
  const name = `${d.pick(SERVICES)}-release`;
  const ids = Array.from({ length: o.steps }, () => d.pick(STEPS));
  const dir = `/work/${o.project}/.${name}`;
  const exec = (id: string, flaky: boolean) => `      exec:\n        command: ["sh", "-c", "${flaky ? `[ -f ${dir}/attempted ] || { touch ${dir}/attempted; echo 'upstream busy' >&2; exit 1; }; ` : ""}echo ${id} >> ${dir}/receipts.log; echo ${id} done"]`;
  const wf = `---\ntype: workflow\ndescription: Release the ${name.replace("-release", "")} service in ${o.steps} steps\nupdated: 2026-11-07\nsteps:\n${ids.map((id, i) => `  - id: ${id}\n    unit:\n${exec(id, i === o.failAt - 1)}`).join("\n")}\n---\n\n# ${name}\n\n${ids.map((id) => `## ${id}\n\nRun the ${id} step of the release.\n`).join("\n")}`;
  return {
    id: o.id, family: "resume", project: o.project,
    description: `Finish the stopped run of the ${name} workflow`,
    instruction: `You are working in /work/${o.project}. The ${name} workflow was started earlier and stopped before it finished. Finish that same run, so that every step of it has completed, without redoing any step that already completed. In REPORT.md, give the id of the run you finished.`,
    workspace: files(["README.md", `# ${o.project}\n\nRelease tooling.\n`]),
    library: { ...files([`workflows/${name}.md`, wf]), ".plant.sh": `#!/bin/bash\n# A first run, which stops at step ${o.failAt}.\nset -euo pipefail\nmkdir -p ${dir}\nakm workflow run workflows/${name} >/dev/null || true\n` },
    planted: {},
    checks: [
      { type: "receipts", file: `${dir}/receipts.log`, lines: ids },
      { type: "workflow-completed", ref: `workflows/${name}` },
    ],
    evidence: [], commands: ["akm\\s+workflow\\s+(resume|run)"],
    solve: solve(o.project, `id=$(akm workflow list --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).runs.find((r) => r.workflowRef.endsWith("workflows/${name}") && r.status !== "completed").id')\nakm workflow resume "$id" >/dev/null\nakm workflow run "$id" >/dev/null\n`),
  };
}

// ---- regression cards ----------------------------------------------------------------------------------------------------------

/**
 * A cross-project lookup from another project's directory, the situation akm#1472 is about (a flag that overrides the project made
 * akm print the configured selection). The card checks the outcome only: the display defect is deterministic, and akm's own contract
 * test is what detects it. The trace shows which route the agent took.
 */
function regressionCrossProject(): Card {
  const d = new Draw("regression-1472-selection");
  const s = d.pick(SERVICES);
  const [po, pq] = [`${d.pick(WORDS)}-`, `${d.pick(WORDS)}-`];
  const [h1, h2] = [d.hex(), d.hex()];
  const library = files(
    note({ name: `tag-prefix-${h1}`, description: `Release tag prefix of the ${s} service`, project: "orchid", body: `The release tag prefix of the ${s} service is \`${po}\`.` }),
    note({ name: `tag-prefix-${h2}`, description: `Release tag prefix of the ${s} service`, project: "quill", body: `The release tag prefix of the ${s} service is \`${pq}\`.` }),
  );
  return {
    id: "regression--1472-cross-project", family: "regression", project: "orchid",
    description: `akm#1472 route: a lookup for the other project from this project's directory`,
    instruction: `You are working in /work/orchid, but this request is for the Quill project. Find Quill's release tag prefix for the ${s} service, looking only at notes marked for Quill, and write it to tag.txt. Leave the existing files intact. In REPORT.md, say how you made the lookup.`,
    workspace: files(["README.md", READMEs("orchid", s)]),
    library, planted: {},
    checks: [{ type: "text-file", file: "tag.txt", text: pq }, { type: "absent", file: "tag.txt", tokens: [po] }],
    evidence: [pq], commands: [],
    solve: solve("orchid", `out=$(akm search "${s} release tag prefix" --project quill --filter project=quill --format json)\nakm show "$(printf '%s' "$out" | node -pe '(j=>(j.results??j.hits)[0].ref)(JSON.parse(require("fs").readFileSync(0,"utf8")))')" --format json | node -pe 'JSON.parse(require("fs").readFileSync(0,"utf8")).content' | grep -oE '\`[^\`]+\`' | tr -d '\`' | head -1 > tag.txt\n`),
  };
}

/** akm#1473: `curate --pack` ignored --format, so JSON Lines came out as a pretty-printed array. */
function regressionPack(): Card {
  const d = new Draw("regression-1473-pack");
  const s = d.pick(SERVICES);
  const topic = `${s} drain procedure`;
  const [h1, h2, h3, h4] = [d.hex(), d.hex(), d.hex(), d.hex()];
  const gold = `drain-procedure-${h1}`;
  const library = files(
    note({ name: gold, description: `Drain procedure of the ${s} service`, project: "orchid", body: `To drain the ${s} service, close its intake, wait ${d.int(30, 120)} seconds for open requests, then stop the workers.` }),
    note({ name: `drain-procedure-${h2}`, description: `Drain procedure of the ${s} service`, project: "orchid", body: `After a drain of the ${s} service, check that its queue is empty before the restart.` }),
    note({ name: `restart-order-${h3}`, description: `Restart order of the ${d.pick(SERVICES)} service`, project: "quill", body: "Restart the queue first, then the workers." }),
    note({ name: `oncall-${h4}`, description: "On-call handover", body: "The on-call engineer reads the open incidents first." }),
  );
  return {
    id: "regression--1473-pack", family: "regression", project: "orchid",
    description: `akm#1473: a packed context in JSON Lines`,
    instruction: `You are working in /work/orchid. Assemble this project's knowledge about the ${topic} into one context bundle of at most 1500 tokens, and save it as context.jsonl in JSON Lines: one JSON object per line, each with ref and content. Leave the existing files intact. In REPORT.md, say how you made it.`,
    workspace: files(["README.md", READMEs("orchid", s)]),
    library, planted: {},
    checks: [{ type: "jsonl-file", file: "context.jsonl", refs: [`memories/${gold}`], max_chars: 8000 }],
    evidence: [], commands: ["akm\\s+(curate|show)"],
    solve: solve("orchid", `akm curate "${topic}" --pack 1500 --format jsonl > raw.out\n# a build that ignores --format prints one pretty-printed array; either shape becomes one object per line\nnode -e 'const t=require("fs").readFileSync("raw.out","utf8");let r;try{r=JSON.parse(t)}catch{r=t.split("\\n").filter(Boolean).map((l)=>JSON.parse(l))}for(const x of Array.isArray(r)?r:[r])console.log(JSON.stringify({ref:x.ref,content:x.content}))' > context.jsonl\nrm raw.out\n`),
  };
}

// ---- all of them -----------------------------------------------------------------------------------------------------------------

export const CARDS = (): Card[] => [
  applyServiceJson(), applyDeployEnv(), applyLimitsJson(),
  persistCanary(), persistStaging(), persistAddress(),
  repairStaleIndex(), repairExcludedType(), repairProjectFilter(),
  resumeCard({ id: "resume--release-3", project: "orchid", steps: 3, failAt: 2 }),
  resumeCard({ id: "resume--release-4", project: "quill", steps: 4, failAt: 3 }),
  resumeCard({ id: "resume--release-last", project: "orchid", steps: 3, failAt: 3 }),
  regressionCrossProject(), regressionPack(),
];

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const hidden = (path: string) => path.split("/").some((p) => p.startsWith("."));

/** What only the verifier knows: the checks, and the hashes of the files the agent must leave as they are. */
export function expectedOf(c: Card) {
  const given = Object.entries({ ...c.library, ...c.planted }).filter(([p]) => !hidden(p));
  // A persist card seeds notes holding the old value. Recording the decision may legitimately edit their metadata (`remember --supersedes`
  // demotes the note it corrects), so only their text is held to account.
  const bundle = Object.fromEntries(given.filter(() => c.family !== "persist").map(([p, t]) => [p, sha256(t)]));
  const bodies = Object.fromEntries(given.filter(() => c.family === "persist").map(([p, t]) => [p, sha256(t.replace(/^---\n[\s\S]*?\n---\n/, ""))]));
  const workspace = Object.fromEntries(Object.entries(c.workspace).map(([p, t]) => [p, sha256(t)]));
  const known = Object.fromEntries(given.map(([p]) => [p, true]));
  const checks = c.checks.map((k) => (k.type === "persisted" ? { ...k, known } : k));
  return { card: c.id, family: c.family, project: c.project, workdir: `/work/${c.project}`, checks: [...checks, { type: "preserved", workspace, bundle, bodies }] };
}
