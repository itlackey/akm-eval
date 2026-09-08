import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";

interface DatasetSource {
  name: string;
  url: string;
  targetPath: string;
  sha256: string;
}

const DATASETS: DatasetSource[] = [
  {
    name: "LongMemEval",
    url: "https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/98d7416c24c778c2fee6e6f3006e7a073259d48f/longmemeval_s_cleaned.json",
    targetPath: "datasets/longmemeval/dataset.json",
    sha256: "d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442",
  },
  {
    name: "LoCoMo",
    url: "https://raw.githubusercontent.com/snap-research/locomo/3eb6f2c585f5e1699204e3c3bdf7adc5c28cb376/data/locomo10.json",
    targetPath: "datasets/locomo/locomo10.json",
    sha256: "79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4",
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function download(source: DatasetSource): Promise<void> {
  const targetPath = path.resolve(process.cwd(), source.targetPath);

  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    const actualSha256 = await fileSha256(targetPath);
    if (actualSha256 !== source.sha256) {
      throw new Error(
        `${source.name} already exists at ${source.targetPath}, but its SHA-256 is ${actualSha256}; expected ${source.sha256}. Move the unexpected file aside and rerun the download.`,
      );
    }
    console.log(
      `[skip] ${source.name} already exists and is verified at ${source.targetPath} (${formatBytes(stats.size)})`,
    );
    return;
  }

  console.log(`[downloading] ${source.name} from ${source.url}`);

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${source.name}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const contentLength = Number(response.headers.get("content-length") ?? "0");
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`Response body is not readable for ${source.name}`);
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const partialPath = `${targetPath}.partial-${process.pid}`;
  const output = fs.createWriteStream(partialPath, { flags: "wx" });
  const hash = createHash("sha256");
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      if (!output.write(value)) await once(output, "drain");
      received += value.length;
      if (contentLength > 0) {
        const pct = ((received / contentLength) * 100).toFixed(1);
        process.stdout.write(
          `\r  ${pct}% (${formatBytes(received)} / ${formatBytes(contentLength)})`,
        );
      } else {
        process.stdout.write(`\r  ${formatBytes(received)}`);
      }
    }
    output.end();
    await once(output, "finish");
    const actualSha256 = hash.digest("hex");
    if (actualSha256 !== source.sha256) {
      throw new Error(
        `Downloaded ${source.name} has SHA-256 ${actualSha256}; expected ${source.sha256}. The partial file was discarded.`,
      );
    }
    fs.renameSync(partialPath, targetPath);
  } catch (error) {
    output.destroy();
    fs.rmSync(partialPath, { force: true });
    throw error;
  }

  process.stdout.write("\n");
  console.log(
    `[saved] ${source.name} -> ${source.targetPath} (${formatBytes(received)}, SHA-256 ${source.sha256})`,
  );
}

export async function runDownloadsCommand(args: string[]): Promise<number> {
  const specificDataset = args[0];

  const sources = specificDataset
    ? DATASETS.filter((dataset) => dataset.name.toLowerCase() === specificDataset.toLowerCase())
    : DATASETS;

  if (sources.length === 0) {
    console.error(`Unknown dataset: ${specificDataset}`);
    console.error(`Available datasets: ${DATASETS.map((dataset) => dataset.name).join(", ")}`);
    return 1;
  }

  console.log(`Downloading ${sources.length} dataset(s)...\n`);

  for (const source of sources) {
    await download(source);
    console.log("");
  }

  console.log("Done! All requested datasets are ready.");
  return 0;
}
