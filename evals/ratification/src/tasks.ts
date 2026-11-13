// The tasks of the ratification suite, as data. generate.ts writes them as Harbor tasks (tasks/<id>/) and libraries (libraries/<id>/), and a
// test regenerates them and compares. Every task is one everyday akm job given to a fresh agent; the verifier (verify/verify.mjs) reads the
// state the agent left behind, never what it said. The forms are those of akm 0.10.261120 (STABILITY.md, docs/reference/cli.md at akm origin/main).
//
// `solve` is the reference: the minimal command sequence. The reference arm runs it, and `refAkm` (how many akm calls it makes) is what
// "unnecessary" means in the report: akm calls beyond it. `old` and `replacement` are patterns of the command an agent is likely to reach for
// first and of the form that replaces it; they tell the report whether a deprecated or removed form was used and whether the agent moved on to
// the replacement.

export interface Check {
  type: string;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  family: string;
  description: string;
  instruction: string;
  /** Files the agent starts with in /work, by path relative to it. */
  workspace: Record<string, string>;
  /** The task's library, by path: added to the shared base library. Hidden files are `.plant.sh` (run once after the seed) and `.solve.sh`. */
  library: Record<string, string>;
  solve: string;
  refAkm: number;
  /** A form the task invites that akm deprecated or removed (a regex), and the form that replaces it. Empty for a task that has none. */
  old: string;
  replacement: string;
  checks: Check[];
}

const note = (name: string, description: string, body: string): [string, string] => [`knowledge/${name}.md`, `---\ndescription: ${description}\n---\n# ${name}\n${body}\n`];

/** The notes every library holds: a small bundle of made-up services, with distractors for the lookup tasks. */
export const BASE: Record<string, string> = Object.fromEntries([
  note("tallow-ports", "Tallow service ports by environment", "Tallow listens on TCP 7421 in production and 7422 in staging. Its metrics side-port is 7431 in both."),
  note("tallow-deploy", "How and when Tallow is deployed", "Deploys run on Tuesdays at 14:00 UTC. Roll back with `tallowctl rollback --to <build>`."),
  note("larch-retention", "Larch log retention", "Larch keeps request logs for 45 days and audit logs for 400 days."),
  note("larch-oncall", "Larch on-call rota", "The Larch on-call rota rotates every Monday. Escalate to the platform lead after 30 minutes."),
  note("sedge-cache", "Sedge cache settings", "Sedge caches responses for 90 seconds. Purge with `sedgectl purge --all`."),
  note("sedge-limits", "Sedge rate limits", "Sedge allows 600 requests per minute per client; bursts up to 100."),
  note("nettle-queue", "Nettle queue sizing", "Nettle runs 8 workers per queue and retries a failed job 3 times."),
  ["tasks/stamp-release.yml", 'version: 4\nname: Stamp release\ndescription: Writes the release stamp for the current build\nrun: printf "stamp-4417\\n" > /work/release.stamp\n'],
]);

const PLANT_HEAD = `set -euo pipefail\n`;

/** A node script, run by a plant script, that queues a pending proposal the way akm's own improve stages do (akm has no command that does it without a model; under Node the text-import hook must be registered first, as akm's own Node entry does). */
const queue = (ref: string, description: string, content: string) => `node --input-type=module -e '
import { register } from "node:module";
register("file:///opt/akm/cli/node_modules/akm-cli/dist/text-import-hook.mjs");
const { createProposal } = await import("file:///opt/akm/cli/node_modules/akm-cli/dist/commands/proposal/repository.js");
createProposal(process.env.AKM_BUNDLE_DIR, { ref: ${JSON.stringify(ref)}, source: "propose", payload: { content: ${JSON.stringify(content)}, frontmatter: { description: ${JSON.stringify(description)} } } });
'\n`;

const ids = `ids() { akm proposal list --format json | node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const p of j.proposals)console.log(p.id+" "+p.ref)'; }\n`;

export const TASKS: Task[] = [
  {
    id: "find--prod-port",
    family: "find",
    description: "Find and read the production port of a service in akm and write it down",
    instruction: "Find out which TCP port the tallow service listens on in production, and write only that number to /work/answer.txt.",
    workspace: {},
    library: {},
    solve: `cd /work\nakm search "tallow port production"\nakm show knowledge/tallow-ports\nprintf '7421\\n' > /work/answer.txt\n`,
    refAkm: 2,
    old: "",
    replacement: "",
    checks: [{ type: "file_equals", path: "/work/answer.txt", text: "7421" }],
  },
  {
    id: "remember--retention",
    family: "remember",
    description: "Save a fact as a memory with a description and tags",
    instruction: 'Save this fact to akm as a memory: Larch request logs are now kept for 60 days (changed on 2026-11-02). Give the memory the description "Larch retention change" and the tags retention and larch.',
    workspace: {},
    library: {},
    solve: `cd /work\nakm remember "Larch request logs are now kept for 60 days (changed on 2026-11-02)." --description "Larch retention change" --tag retention --tag larch\n`,
    refAkm: 1,
    old: "",
    replacement: "",
    checks: [{ type: "memory", contains: "60 days", description: "Larch retention change", tags: ["retention", "larch"] }],
  },
  {
    id: "import--handoff",
    family: "import",
    description: "Import a local document into akm as knowledge",
    instruction: 'The file /work/inbox/handoff-2026-11.md is a handoff note. Add it to akm as a knowledge document, so that a search for "handoff" finds it.',
    workspace: { "inbox/handoff-2026-11.md": "# Handoff, November\n\nhandoff-marker-9f3a\n\nThe nettle queue migration is half done. The remaining jobs are listed in the board.\n" },
    library: {},
    solve: `cd /work\nakm import /work/inbox/handoff-2026-11.md\n`,
    refAkm: 1,
    old: "",
    replacement: "",
    checks: [{ type: "knowledge", contains: "handoff-marker-9f3a", search: "handoff" }, { type: "file_exists", path: "/work/inbox/handoff-2026-11.md" }],
  },
  {
    id: "feedback--stale-note",
    family: "feedback",
    description: "Flag a wrong note with negative feedback and a reason",
    instruction: "The akm note knowledge/tallow-deploy says deploys run on Tuesdays. They moved to Thursdays. Tell akm the note is wrong, with that as the reason, so that it is flagged.",
    workspace: {},
    library: {},
    solve: `cd /work\nakm feedback knowledge/tallow-deploy --negative --reason "Deploys moved from Tuesdays to Thursdays; the note says Tuesdays."\n`,
    refAkm: 1,
    old: "",
    replacement: "",
    checks: [{ type: "feedback", ref: "knowledge/tallow-deploy", signal: "negative", reason: "thursday" }],
  },
  {
    id: "run--stamp-release",
    family: "run",
    description: "Run a task asset by ref",
    instruction: "akm holds a task that stamps the release. Run that task now, through akm. Do not create the stamp file by hand.",
    workspace: {},
    library: {},
    solve: `cd /work\nakm search "stamp release" --type task\nakm run tasks/stamp-release\n`,
    refAkm: 2,
    old: String.raw`\bakm\s+task\s+run\b`,
    replacement: String.raw`\bakm\s+run\b`,
    checks: [{ type: "file_equals", path: "/work/release.stamp", text: "stamp-4417" }, { type: "task_ran", id: "stamp-release" }],
  },
  {
    id: "doctor--stuck-run",
    family: "doctor",
    description: "Inspect akm health and report the one problem it names",
    instruction: "Check akm's own health. If it reports a task run that has been stuck, write that task's id to /work/health.txt. If nothing is stuck, write ok.",
    workspace: {},
    library: {
      ".plant.sh": `${PLANT_HEAD}node -e '
const D = require("/opt/akm/cli/node_modules/better-sqlite3");
const db = new D(process.env.AKM_DATA_DIR + "/state.db");
db.prepare("INSERT INTO task_history(task_id,status,started_at) VALUES(?,?,?)").run("nightly-backup", "active", new Date(Date.now() - 3 * 3600 * 1000).toISOString());
'\n`,
    },
    solve: `cd /work\nakm doctor || true\nprintf 'nightly-backup\\n' > /work/health.txt\n`,
    refAkm: 1,
    old: String.raw`\bakm\s+health\b`,
    replacement: String.raw`\bakm\s+doctor\b`,
    checks: [{ type: "file_equals", path: "/work/health.txt", text: "nightly-backup" }],
  },
  {
    id: "proposal--review",
    family: "proposal",
    description: "Review two pending proposals: accept the one the changelog confirms, reject the other",
    instruction: "akm has two pending proposals that change notes. /work/changelog.md lists what really changed. Accept the proposal that matches the changelog and reject the other one, with a short reason.",
    workspace: { "changelog.md": "# Changes since October\n\n- 2026-11-02: Larch request-log retention raised from 45 to 60 days.\n- 2026-11-05: Sedge cache TTL checked, unchanged.\n" },
    library: {
      ".plant.sh": `${PLANT_HEAD}${queue("knowledge/larch-retention", "Larch log retention", "---\ndescription: Larch log retention\n---\n# larch-retention\nLarch keeps request logs for 60 days and audit logs for 400 days.\n")}${queue("knowledge/tallow-ports", "Tallow service ports by environment", "---\ndescription: Tallow service ports by environment\n---\n# tallow-ports\nTallow listens on TCP 7499 in production and 7422 in staging. Its metrics side-port is 7431 in both.\n")}`,
    },
    solve: `cd /work\n${ids}akm proposal list\nfor line in $(ids | cut -d' ' -f1); do akm proposal diff "$line" >> /tmp/diffs.txt; done\nGOOD=$(ids | grep larch-retention | cut -d' ' -f1)\nBAD=$(ids | grep tallow-ports | cut -d' ' -f1)\nakm proposal accept "$GOOD"\nakm proposal reject "$BAD" --reason "Not in the changelog" --yes\n`,
    refAkm: 5,
    old: "",
    replacement: "",
    checks: [
      { type: "proposal", ref: "knowledge/larch-retention", status: "accepted" },
      { type: "proposal", ref: "knowledge/tallow-ports", status: "rejected" },
      { type: "file_contains", path: "$BUNDLE/knowledge/larch-retention.md", text: "60 days" },
      { type: "file_contains", path: "$BUNDLE/knowledge/tallow-ports.md", text: "7421" },
    ],
  },
  {
    id: "clone--canary-note",
    family: "recover",
    description: "Clone a note under a new name and edit the copy (the obvious command is deprecated)",
    instruction: "Clone the akm note knowledge/tallow-ports as knowledge/tallow-ports-canary. The original must stay as it is. In the clone only, change the production port from 7421 to 7430.",
    workspace: {},
    library: {},
    solve: `cd /work\nakm import knowledge/tallow-ports --asset-ref --name tallow-ports-canary\nsed -i 's/7421/7430/' "$AKM_BUNDLE_DIR/knowledge/tallow-ports-canary.md"\n`,
    refAkm: 1,
    old: String.raw`\bakm\s+clone\b`,
    replacement: String.raw`\bakm\s+import\b.*--asset-ref`,
    checks: [
      { type: "file_contains", path: "$BUNDLE/knowledge/tallow-ports-canary.md", text: "7430" },
      { type: "file_absent_text", path: "$BUNDLE/knowledge/tallow-ports-canary.md", text: "7421" },
      { type: "file_contains", path: "$BUNDLE/knowledge/tallow-ports.md", text: "7421" },
      { type: "file_absent_text", path: "$BUNDLE/knowledge/tallow-ports.md", text: "7430" },
      { type: "akm_show", ref: "knowledge/tallow-ports-canary", text: "7430" },
    ],
  },
  {
    id: "validate--draft-task",
    family: "recover",
    description: "Check whether a draft task file is valid (the documented-looking `task validate` no longer exists)",
    instruction: "Check whether /work/drafts/nightly.yml is a valid akm task file. Write valid or invalid to /work/validity.txt. Do not add anything to the akm bundle.",
    workspace: { "drafts/nightly.yml": 'version: 4\nname: Nightly\nschedule: "0 4 * * *"\n' },
    library: {},
    solve: `cd /work\nakm import /work/drafts/nightly.yml --type task || true\nprintf 'invalid\\n' > /work/validity.txt\n`,
    refAkm: 1,
    old: String.raw`\bakm\s+task\s+validate\b`,
    replacement: String.raw`\bakm\s+(import|lint)\b`,
    checks: [{ type: "file_equals", path: "/work/validity.txt", text: "invalid" }, { type: "bundle_lacks", glob: "tasks/nightly*" }],
  },
];

/** The expected.json of a task: what the verifier checks. */
export const expectedOf = (t: Task) => ({ id: t.id, checks: t.checks });
