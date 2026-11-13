set -euo pipefail
node -e '
const D = require("/opt/akm/cli/node_modules/better-sqlite3");
const db = new D(process.env.AKM_DATA_DIR + "/state.db");
db.prepare("INSERT INTO task_history(task_id,status,started_at) VALUES(?,?,?)").run("nightly-backup", "active", new Date(Date.now() - 3 * 3600 * 1000).toISOString());
'
