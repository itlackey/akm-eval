set -euo pipefail
node --input-type=module -e '
import { register } from "node:module";
register("file:///opt/akm/cli/node_modules/akm-cli/dist/text-import-hook.mjs");
const { createProposal } = await import("file:///opt/akm/cli/node_modules/akm-cli/dist/commands/proposal/repository.js");
createProposal(process.env.AKM_BUNDLE_DIR, { ref: "knowledge/larch-retention", source: "propose", payload: { content: "---\ndescription: Larch log retention\n---\n# larch-retention\nLarch keeps request logs for 60 days and audit logs for 400 days.\n", frontmatter: { description: "Larch log retention" } } });
'
node --input-type=module -e '
import { register } from "node:module";
register("file:///opt/akm/cli/node_modules/akm-cli/dist/text-import-hook.mjs");
const { createProposal } = await import("file:///opt/akm/cli/node_modules/akm-cli/dist/commands/proposal/repository.js");
createProposal(process.env.AKM_BUNDLE_DIR, { ref: "knowledge/tallow-ports", source: "propose", payload: { content: "---\ndescription: Tallow service ports by environment\n---\n# tallow-ports\nTallow listens on TCP 7499 in production and 7422 in staging. Its metrics side-port is 7431 in both.\n", frontmatter: { description: "Tallow service ports by environment" } } });
'
