#!/usr/bin/env bun
/*
  Compare PDF

  Usage (CLI):
    bun run compare-pdf.ts <pdfA> <pdfB>

  Output:
    - Writes `.reviews/compare-pdf.<timestamp>.md`
*/

import { mkdir } from "fs/promises";
import { $ } from "bun";
import { resolve } from "path";

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function pdfInfo(pdf: string): Promise<Record<string, string>> {
  try {
    const result = await $`pdfinfo ${pdf}`.text();
    const info: Record<string, string> = {};
    for (const line of result.split("\n")) {
      const idx = line.indexOf(":");
      if (idx > 0) info[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return info;
  } catch {
    return {};
  }
}

async function pdfFonts(pdf: string): Promise<string[]> {
  try {
    const result = await $`pdffonts ${pdf}`.text();
    const lines = result.split("\n").slice(2).filter((l) => l.trim().length);
    return lines.map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
  } catch {
    return [];
  }
}

async function runCompare(pdfA: string, pdfB: string): Promise<string> {
  const timestamp = nowStamp();
  await mkdir(".reviews", { recursive: true });
  const reportPath = `.reviews/compare-pdf.${timestamp}.md`;

  const infoA = await pdfInfo(pdfA);
  const infoB = await pdfInfo(pdfB);
  const fontsA = new Set(await pdfFonts(pdfA));
  const fontsB = new Set(await pdfFonts(pdfB));

  const addedFonts = [...fontsB].filter((f) => !fontsA.has(f));
  const removedFonts = [...fontsA].filter((f) => !fontsB.has(f));

  const lines: string[] = [];
  lines.push("# Compare PDF Report");
  lines.push("");
  lines.push(`- PDF A: \`${resolve(pdfA)}\``);
  lines.push(`- PDF B: \`${resolve(pdfB)}\``);
  lines.push(`- Generated: ${timestamp}`);
  lines.push("");

  lines.push("## Core Metadata");
  lines.push("");
  const keys = ["Pages", "Page size", "PDF version", "Encrypted"]; // minimal
  for (const key of keys) {
    const a = infoA[key] ?? "(missing)";
    const b = infoB[key] ?? "(missing)";
    const marker = a === b ? "=" : "!";
    lines.push(`- ${key}: A=${a} | B=${b} | ${marker}`);
  }
  lines.push("");

  lines.push("## Fonts");
  lines.push("");
  lines.push(`- Added in B: ${addedFonts.length ? addedFonts.join(", ") : "none"}`);
  lines.push(`- Removed in B: ${removedFonts.length ? removedFonts.join(", ") : "none"}`);
  lines.push("");

  lines.push("## Next Actions");
  lines.push("");
  lines.push("- If metadata differs unexpectedly, inspect layout regressions.");
  lines.push("- If fonts changed, re-run preflight and visual review.");

  await Bun.write(reportPath, lines.join("\n") + "\n");
  return `GO | wrote ${reportPath}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pdfA = args[0];
  const pdfB = args[1];
  if (!pdfA || !pdfB || args.includes("--help")) {
    console.log("Usage: compare-pdf.ts <pdfA> <pdfB>");
    process.exit(1);
  }
  const result = await runCompare(pdfA, pdfB);
  console.log(result);
}

if (import.meta.main) {
  await main();
}
