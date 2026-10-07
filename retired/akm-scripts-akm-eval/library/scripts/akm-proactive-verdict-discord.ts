#!/usr/bin/env bun
/**
 * AKM proactive-improve verdict → Discord
 *
 * Runs the real-query retrieval suite (fresh run for a real delta vs the T0
 * baseline), then the kill-criterion verdict runner, and posts the PASS /
 * FAIL / INCONCLUSIVE verdict + key metrics + recommendation to Discord.
 *
 * Env: DISCORD_WEBHOOK_ID, DISCORD_WEBHOOK_TOKEN (inject via: akm env run fwdslsh)
 * Run: akm env run fwdslsh -- bun ~/akm/scripts/akm-proactive-verdict-discord.ts [--dry-run] [--no-suite]
 *   --dry-run   print the embed JSON instead of posting
 *   --no-suite  skip the fresh suite run (use the latest existing eval run)
 *
 * Answers "is improve actually improving the stash, or burning GPU cycles?"
 * See docs/akm-eval.md (Proactive-improve kill-criterion) and
 * memory:akm-improve-success-metric.
 */

import { spawnSync } from "node:child_process";

const DRY_RUN = process.argv.includes("--dry-run");
const NO_SUITE = process.argv.includes("--no-suite");
const REPO = `${process.env.HOME}/code/github/itlackey/akm`;
const STASH = `${process.env.HOME}/akm`;
const WEBHOOK = `https://discord.com/api/webhooks/${process.env.DISCORD_WEBHOOK_ID}/${process.env.DISCORD_WEBHOOK_TOKEN}`;
const EVAL_RUN = `${REPO}/scripts/akm-eval/bin/akm-eval-run`;
const VERDICT = `${REPO}/scripts/akm-eval/bin/akm-eval-proactive-verdict`;

function hostname(): string {
  const r = spawnSync("hostname", ["-s"], { encoding: "utf8" });
  return (r.stdout ?? "").trim() || "unknown";
}

// 1. Fresh suite run so the retrieval-quality delta is meaningful (vs T0 baseline).
if (!NO_SUITE) {
  const suite = spawnSync(EVAL_RUN, ["--suite", "real-query", "--mode", "baseline", "--stash", STASH], {
    encoding: "utf8",
    timeout: 1_200_000,
  });
  if (suite.status !== 0) {
    console.error(`[verdict-discord] suite run failed (status ${suite.status}); proceeding with latest existing run.`);
    console.error((suite.stderr ?? "").slice(-2000));
  }
}

// 2. Verdict (JSON). Exit codes: PASS=0, FAIL=1, INCONCLUSIVE=3 — capture regardless.
const res = spawnSync(VERDICT, ["--stash", STASH, "--format", "json"], { encoding: "utf8", timeout: 300_000 });
const raw = (res.stdout ?? "").trim();
let v: any;
try {
  v = JSON.parse(raw);
} catch {
  console.error(`[verdict-discord] could not parse verdict JSON (status ${res.status}). stderr:\n${res.stderr}`);
  process.exit(1);
}

const verdict: string = v.verdict ?? "UNKNOWN";
const pro = v.metrics?.acceptByCohort?.proactive ?? {};
const rea = v.metrics?.acceptByCohort?.reactive ?? {};
const rq = v.metrics?.retrievalQuality ?? {};
const th = v.thresholds ?? {};
const pct = (x: any) => (typeof x === "number" ? `${(x * 100).toFixed(1)}%` : "n/a");

const COLOR: Record<string, number> = {
  PASS: 0x2ecc71, // green
  FAIL: 0xe74c3c, // red
  INCONCLUSIVE: 0xf1c40f, // yellow
  UNKNOWN: 0x95a5a6,
};
const EMOJI: Record<string, string> = { PASS: "✅", FAIL: "🛑", INCONCLUSIVE: "🟡", UNKNOWN: "❔" };

const embed = {
  title: `${EMOJI[verdict] ?? "❔"} AKM proactive-improve verdict: ${verdict}`,
  description: v.recommendation ?? "(no recommendation)",
  color: COLOR[verdict] ?? COLOR.UNKNOWN,
  fields: [
    {
      name: "Accept rate (proactive vs reactive)",
      value: `${pct(pro.acceptRate)} (${pro.decided ?? 0} decided) vs ${pct(rea.acceptRate)} — threshold ≥ ${th.acceptRatio ?? "?"}× reactive`,
      inline: false,
    },
    {
      name: "Proactive reversion",
      value: `${pct(pro.reversionRate)} — threshold ≤ ${pct(th.maxReversion)}`,
      inline: true,
    },
    {
      name: "Retrieval-quality delta",
      value: `${typeof rq.delta === "number" ? rq.delta.toFixed(3) : "n/a"} — threshold ≥ ${th.minRetrievalDelta ?? 0}`,
      inline: true,
    },
    {
      name: "Decided proactive proposals",
      value: `${pro.decided ?? 0} (need ≥ ${th.minDecided ?? 30} to decide)`,
      inline: true,
    },
    ...(Array.isArray(v.breaches) && v.breaches.length
      ? [{ name: "Breaches", value: v.breaches.map((b: string) => `• ${b}`).join("\n").slice(0, 1000), inline: false }]
      : []),
  ],
  footer: { text: `${hostname()} · treatment=${v.cohorts?.treatmentRefs ?? "?"} control=${v.cohorts?.controlRefs ?? "?"} · akm-eval` },
  timestamp: v.generatedAt ?? new Date().toISOString(),
};

const payload = { username: "akm-eval", embeds: [embed] };

if (DRY_RUN) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (!process.env.DISCORD_WEBHOOK_ID || !process.env.DISCORD_WEBHOOK_TOKEN) {
  console.error("[verdict-discord] missing DISCORD_WEBHOOK_ID / DISCORD_WEBHOOK_TOKEN (run via: akm env run fwdslsh -- ...)");
  process.exit(1);
}

const post = await fetch(WEBHOOK, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
if (!post.ok) {
  console.error(`[verdict-discord] Discord POST failed: ${post.status} ${await post.text()}`);
  process.exit(1);
}
console.log(`[verdict-discord] posted verdict=${verdict} to Discord.`);
