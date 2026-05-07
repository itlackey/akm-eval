import fs from 'node:fs';
import path from 'node:path';

interface DatasetSource {
  name: string;
  url: string;
  targetPath: string;
}

const DATASETS: DatasetSource[] = [
  {
    name: 'LongMemEval',
    url: 'https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/98d7416c24c778c2fee6e6f3006e7a073259d48f/longmemeval_s_cleaned.json',
    targetPath: 'datasets/longmemeval/dataset.json',
  },
  {
    name: 'LoCoMo',
    url: 'https://raw.githubusercontent.com/snap-research/locomo/3eb6f2c585f5e1699204e3c3bdf7adc5c28cb376/data/locomo10.json',
    targetPath: 'datasets/locomo/locomo10.json',
  },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function download(source: DatasetSource): Promise<void> {
  const targetPath = path.resolve(process.cwd(), source.targetPath);

  if (fs.existsSync(targetPath)) {
    const stats = fs.statSync(targetPath);
    console.log(`[skip] ${source.name} already exists at ${source.targetPath} (${formatBytes(stats.size)})`);
    return;
  }

  console.log(`[downloading] ${source.name} from ${source.url}`);

  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(`Failed to download ${source.name}: HTTP ${response.status} ${response.statusText}`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`Response body is not readable for ${source.name}`);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (contentLength > 0) {
      const pct = ((received / contentLength) * 100).toFixed(1);
      process.stdout.write(`\r  ${pct}% (${formatBytes(received)} / ${formatBytes(contentLength)})`);
    } else {
      process.stdout.write(`\r  ${formatBytes(received)}`);
    }
  }

  process.stdout.write('\n');

  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buffer);

  console.log(`[saved] ${source.name} -> ${source.targetPath} (${formatBytes(buffer.length)})`);
}

export async function runDownloadsCommand(args: string[]): Promise<number> {
  const specificDataset = args[0];

  const sources = specificDataset
    ? DATASETS.filter((dataset) => dataset.name.toLowerCase() === specificDataset.toLowerCase())
    : DATASETS;

  if (sources.length === 0) {
    console.error(`Unknown dataset: ${specificDataset}`);
    console.error(`Available datasets: ${DATASETS.map((dataset) => dataset.name).join(', ')}`);
    return 1;
  }

  console.log(`Downloading ${sources.length} dataset(s)...\n`);

  for (const source of sources) {
    await download(source);
    console.log('');
  }

  console.log('Done! All requested datasets are ready.');
  return 0;
}
