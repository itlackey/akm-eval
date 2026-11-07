import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jobConfig } from "./harbor.ts";
import { SHARED_NETWORK_COMPOSE, freeSubnets, networkPlan, singleService } from "./network.ts";

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
