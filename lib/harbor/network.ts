// Harbor's Docker networks. By default every trial creates a bridge and a subnet from the daemon's address pools, and deletes them
// when it ends: the pools run out, an interrupted run leaks its networks, and on a host that runs Tailscale each new bridge is a link change
// that rebinds it. A single-service eval puts its trials on one external network instead (shared-network.yaml). The others are
// checked against the free subnets, and swept for leaks after the run.

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fail } from "../cli.ts";

/** The overlay that puts every trial on SHARED_NETWORK. Harbor merges it into the trial's compose files (`environment.extra_docker_compose`). */
export const SHARED_NETWORK_COMPOSE = resolve(import.meta.dir, "shared-network.yaml");
export const SHARED_NETWORK = "akm-eval-trials";

/** Docker's built-in pools: a /16 for each of 172.17 to 172.31, and the /20s of 192.168.0.0/16. */
const POOLS: [number, number][] = [
  ...Array.from({ length: 15 }, (_, i): [number, number] => [((172 << 24) | ((17 + i) << 16)) >>> 0, 16]),
  ...Array.from({ length: 16 }, (_, i): [number, number] => [((192 << 24) | (168 << 16) | (i << 12)) >>> 0, 20]),
];

function range(cidr: string): [number, number] | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(cidr);
  if (!m) return undefined;
  const start = (((+m[1]! << 24) | (+m[2]! << 16) | (+m[3]! << 8) | +m[4]!) >>> 0);
  return [start, start + 2 ** (32 - +m[5]!) - 1];
}

/** How many of Docker's built-in pool subnets overlap none of `taken` (the subnets of Docker networks and of the host's routes), which are those the daemon can still hand out. */
export function freeSubnets(taken: string[]): number {
  const used = taken.map(range).filter((r): r is [number, number] => r !== undefined);
  return POOLS.filter(([start, bits]) => {
    const end = start + 2 ** (32 - bits) - 1;
    return !used.some(([a, b]) => a <= end && b >= start);
  }).length;
}

/** Whether no task in `tasksDir` brings a compose file of its own, which is the only way a Harbor task gets a second service. */
export function singleService(tasksDir: string): boolean {
  try {
    return [...new Bun.Glob("*/environment/docker-compose.y*ml").scanSync({ cwd: tasksDir })].length === 0;
  } catch {
    return true; // no folder, no task with a second service
  }
}

function sh(cmd: string[]): { ok: boolean; out: string } {
  try {
    const r = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" });
    return { ok: r.exitCode === 0, out: r.stdout.toString() };
  } catch {
    return { ok: false, out: "" };
  }
}

const lines = (s: string): string[] => s.split("\n").map((l) => l.trim()).filter(Boolean);

function daemonHasOwnPools(): boolean {
  try {
    return "default-address-pools" in JSON.parse(readFileSync("/etc/docker/daemon.json", "utf8"));
  } catch {
    return false;
  }
}

/** What a job needs of Docker's networks, from its config. */
export function networkPlan(cfg: Record<string, any>): { shared: boolean; concurrency: number; trialsDir: string } {
  return {
    shared: (cfg.environment?.extra_docker_compose ?? []).includes(SHARED_NETWORK_COMPOSE),
    concurrency: cfg.n_concurrent_trials ?? 1,
    trialsDir: join(cfg.jobs_dir, cfg.job_name),
  };
}

/** Before Harbor starts: the shared network exists (it is never deleted), or the per-trial networks of `concurrency` trials fit in the free subnets. */
export function prepareNetworks(plan: ReturnType<typeof networkPlan>): void {
  if (plan.shared) {
    if (!sh(["docker", "network", "inspect", SHARED_NETWORK]).ok && !sh(["docker", "network", "create", SHARED_NETWORK]).ok) fail(`could not create the Docker network ${SHARED_NETWORK}`);
    return;
  }
  if (daemonHasOwnPools()) return; // its pools are not the built-in ones, so the count below would be wrong
  const nets = lines(sh(["docker", "network", "ls", "-q"]).out);
  const subnets = nets.length ? lines(sh(["docker", "network", "inspect", "--format", "{{range .IPAM.Config}}{{.Subnet}}\n{{end}}", ...nets]).out) : [];
  const routes = lines(sh(["ip", "-4", "route"]).out).map((l) => l.split(" ")[0]!);
  const free = freeSubnets([...subnets, ...routes]);
  if (plan.concurrency > free) fail(`${plan.concurrency} concurrent trials each need a Docker network, and Docker's address pools have ${free} subnets free. Remove unused networks (docker network prune), lower --concurrency, or give the daemon a larger default-address-pools in /etc/docker/daemon.json (see evals/agent-ab/README.md).`);
}

/** After Harbor exits: remove this job's per-trial networks that it left behind. `docker network rm` refuses one that still has containers. */
export function sweepNetworks(plan: ReturnType<typeof networkPlan>): void {
  if (plan.shared) return;
  let trials: string[];
  try {
    trials = [...new Bun.Glob("*__*").scanSync({ cwd: plan.trialsDir, onlyFiles: false })];
  } catch {
    return;
  }
  const ids = new Set(trials.map((t) => `__${t.split("__").pop()!.toLowerCase()}__env_default`));
  for (const net of lines(sh(["docker", "network", "ls", "--format", "{{.Name}}"]).out)) {
    if ([...ids].some((id) => net.endsWith(id))) sh(["docker", "network", "rm", net]);
  }
}
