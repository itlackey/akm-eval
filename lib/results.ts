// Where a run writes its results: a new folder `<UTC date>-<label>` under the eval's results folder. Every eval and benchmark
// makes it here, so every one marks it the same way: while the process that writes the folder is alive, the folder holds a
// `.running` file with that process's pid. `kill $(cat <dir>/.running)` stops the run, and a script that waits for a run can
// poll for the file to be gone. A folder without `.running` and without summary.json is a run that died without cleaning up
// (SIGKILL, power cut): `kill -0 $(cat <dir>/.running)` tells a stale file from a live run.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const RUNNING = ".running";

const marked = new Set<string>();

function clearMarkers(): void {
  for (const dir of marked) rmSync(join(dir, RUNNING), { force: true });
  marked.clear();
}

let armed = false;

/** Removes the markers when the process exits, however it ends, and on SIGINT and SIGTERM, which skip the exit event unless something handles them. */
function arm(): void {
  if (armed) return;
  armed = true;
  process.on("exit", clearMarkers);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const onSignal = () => {
      if (process.listenerCount(signal) > 1) return; // something else handles this signal, so the process lives on: the exit event clears the markers
      clearMarkers();
      process.off(signal, onSignal);
      process.kill(process.pid, signal); // end the way the signal ends a process
    };
    process.on(signal, onSignal);
  }
}

/** A new folder `<UTC date>-<label>` under `parent`, with `-2`, `-3` and so on when the name is taken, holding the `.running` marker. */
export function makeResultsDir(parent: string, label: string): string {
  const base = join(parent, `${new Date().toISOString().slice(0, 10)}-${label}`);
  let dir = base;
  for (let n = 2; existsSync(dir); n++) dir = `${base}-${n}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, RUNNING), `${process.pid}\n`);
  marked.add(dir);
  arm();
  return dir;
}
