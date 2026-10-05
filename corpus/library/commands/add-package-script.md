---
name: add-package-script
type: command
description: "Add or ensure a script entry exists in a project's root package.json scripts block. Accepts a script name and command via $ARGUMENTS in the format 'name: command'."
when_to_use: Use when you need to add a npm/bun script shortcut to a project's package.json, regardless of whether the project is currently mounted in the working directory.
parameters:
  - ARGUMENTS
updated: 2026-06-04
---

# Add Package Script

Add or ensure a script entry in the root `package.json` `"scripts"` block.

`$ARGUMENTS` should be in the format `<script-name>: <command>`.

Example: `test:all: bun test && bun run ui:test`

## Step 1 — Parse Arguments

Parse `$ARGUMENTS` into a script name and command value. The format is:

```
<script-name>: <command>
```

- `<script-name>` — the key to add under `"scripts"` (e.g., `test:all`)
- `<command>` - the value (e.g., `bun test && bun run ui:test`)

If the format is ambiguous, ask the user to clarify.

## Step 2 — Locate the Project Root

Determine the target project root directory:

1. If `$ARGUMENTS` includes an explicit path (e.g., `--path /some/dir`), use that.
2. Otherwise, search upward from the current working directory for a file named `package.json` that contains a `"scripts"` block. Stop at the first match.
3. If none is found, ask the user for the project root path.

## Step 3 — Read and Update package.json

Read the root `package.json` and inspect the `"scripts"` object:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const pkgPath = path.resolve('$PROJECT_ROOT/package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
const existing = pkg.scripts['$SCRIPT_NAME'];
if (existing === '$SCRIPT_COMMAND') {
  console.log('Already present: $SCRIPT_NAME = $SCRIPT_COMMAND');
  process.exit(0);
}
if (existing && existing !== '$SCRIPT_COMMAND') {
  console.log('Exists with different value: $SCRIPT_NAME = ' + existing);
  console.log('Would you like to overwrite it? (yes/no)');
  process.exit(2);
}
pkg.scripts['$SCRIPT_NAME'] = '$SCRIPT_COMMAND';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Added $SCRIPT_NAME = $SCRIPT_COMMAND');
"
```

Handle the exit codes:
- `0` — already correct, report as-is
- `2` — conflict, ask user before overwriting
- Otherwise — success

## Step 4 — Verify

Run a quick sanity check:

```bash
node -e "const p = require('$PROJECT_ROOT/package.json'); console.log('test:all' in (p.scripts || {}));"
```

Confirm the result to the user.
