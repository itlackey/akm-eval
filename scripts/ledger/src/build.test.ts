// Integration: launches the real Bun build process against a filesystem report fixture.
import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("rebuilds from newly published data, retains stopped public evidence and skips private samples, and emits only the public site", () => {
  const root = mkdtempSync(join(tmpdir(), "eval-ledger-build-"));
  try {
    const reports = join(root, "reports"),
      output = join(root, "out");
    function save(name: string, overrides: Record<string, unknown> = {}) {
      const folder = join(reports, "version", "new-suite", name);
      mkdirSync(folder, { recursive: true });
      writeFileSync(
        join(folder, "summary.json"),
        JSON.stringify({
          eval: "new-suite",
          corpus: "public",
          status: "complete",
          label: name,
          date: "2026-10-12T01:00:00Z",
          akm_version: "version",
          n_scored: 1,
          n_errored: 0,
          metrics: { new_metric: 1 },
          config: { apiKey: "PRIVATE_CONFIG_TOKEN" },
          ...overrides,
        }),
      );
      writeFileSync(
        join(folder, "samples.jsonl"),
        overrides.corpus === "custom" ? "not JSON" : '{"id":"a","correct":true}\n',
      );
    }
    function build() {
      const child = Bun.spawnSync(
        [
          process.execPath,
        new URL("./build.ts", import.meta.url).pathname,
          "--results",
          reports,
          "--output",
          output,
          "--source-revision",
          "revision",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      expect(child.stderr.toString()).toBe("");
      expect(child.exitCode).toBe(0);
      return JSON.parse(readFileSync(join(output, "data.json"), "utf8"));
    }
    save("first");
    save("private", { corpus: "custom" });
    save("partial", { status: "aborted" });
    expect(build().runs).toHaveLength(2);
    save("new", { date: "2026-10-13T02:00:00Z" });
    const dataset = build();
    expect(dataset.runs).toHaveLength(3);
    expect(dataset.runs.find((r: any) => r.label === "partial").role).toBe("Diagnostic");
    expect(dataset.latest_collection_date).toBe("2026-10-13T02:00:00Z");
    expect(dataset.excluded_reports).toBe(1);
    expect(readFileSync(join(output, "data.json"), "utf8")).not.toContain("PRIVATE_CONFIG_TOKEN");
    const html = readFileSync(join(output, "index.html"), "utf8");
    expect(html).toContain('href="./assets/styles.css?v=revision"');
    expect(html).toContain('src="./assets/ledger.js?v=revision"');
    expect(html).toContain('src="./assets/vendor/tabulator.min.js?v=revision"');
    expect(readFileSync(join(output, "assets/vendor/tabulator.min.js"), "utf8")).toContain("Tabulator");
    expect(readFileSync(join(output, "assets/vendor/tabulator.LICENSE"), "utf8")).toContain("MIT");
    expect(html).toContain('data-revision="revision"');
    expect(html).not.toContain(".lab.");
    expect(readFileSync(join(output, ".nojekyll"), "utf8")).toBe("");
    expect(dataset.latest_groups).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
