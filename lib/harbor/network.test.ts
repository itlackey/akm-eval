import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jobConfig } from "./harbor.ts";
import { SHARED_NETWORK_COMPOSE, freeSubnets, networkPlan, prepareNetworks, singleService } from "./network.ts";

test("counts the built-in pool subnets that no network or route overlaps", () => {
  expect(freeSubnets([])).toBe(31);
  expect(freeSubnets(["172.17.0.0/16", "172.18.0.0/16"])).toBe(29);
  expect(freeSubnets(["192.168.0.0/24", "192.168.122.0/24"])).toBe(29); // the /20 of the LAN and the /20 of virbr0
  expect(freeSubnets(["10.0.0.0/8", "garbage"])).toBe(31);
});

test("the job names the shared overlay only when asked, and the plan reads it back", () => {
  const base = { name: "j", model: "openai/m", jobsDir: "/jobs", attempts: 1, librariesDir: "/l", datasets: [], concurrency: 3 };
  expect((jobConfig(base) as any).environment).toEqual({ type: "docker", delete: true });
  const shared = jobConfig({ ...base, sharedNetwork: true }) as any;
  expect(shared.environment.extra_docker_compose).toEqual([SHARED_NETWORK_COMPOSE]);
  expect(networkPlan(shared)).toEqual({ shared: true, concurrency: 3, trialsDir: "/jobs/j" });
  expect(networkPlan(jobConfig(base)).shared).toBe(false);
});

test("a task folder with a compose file of its own is not single-service", () => {
  const dir = mkdtempSync(join(tmpdir(), "net-"));
  try {
    mkdirSync(join(dir, "a", "environment"), { recursive: true });
    mkdirSync(join(dir, "b", "environment"), { recursive: true });
    expect(singleService(dir)).toBe(true);
    writeFileSync(join(dir, "b", "environment", "docker-compose.yaml"), "services: {}\n");
    expect(singleService(dir)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("refuses a width above the free subnets of Docker's built-in pools, since each trial has a network of its own", () => {
  // a host with no pools of its own, one network on 172.17.0.0/16 and a route on 192.168.0.0/24: 31 pool subnets, 2 taken
  const out = (cmd: string[]) => (cmd[1] === "network" && cmd[2] === "ls" ? "n1\n" : cmd[1] === "network" ? "172.17.0.0/16\n" : "default via 192.168.0.1\n192.168.0.0/24 dev eth0\n");
  const host = { sh: (cmd: string[]) => ({ ok: true, out: out(cmd) }), ownPools: () => false };
  const plan = (concurrency: number) => ({ shared: false, concurrency, trialsDir: "/jobs/j" });
  expect(() => prepareNetworks(plan(29), host)).not.toThrow();
  expect(() => prepareNetworks(plan(1000), host)).toThrow("1000 concurrent trials each need a Docker network");
  expect(() => prepareNetworks(plan(1000), { ...host, ownPools: () => true })).not.toThrow(); // the daemon's own pools: not counted
});
