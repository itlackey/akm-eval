import fs from 'node:fs';
import path from 'node:path';

export interface DatasetDownloadOptions {
  name: string;
  url: string;
  targetPath: string;
  extract?: boolean; // for .zip, .tar.gz (future expansion)
}

function getCacheDir(name: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp';
  return path.resolve(home, '.cache', 'akm-eval', 'datasets', name);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function downloadDataset(options: DatasetDownloadOptions): Promise<string> {
  const cacheDir = getCacheDir(options.name);
  const cachePath = path.join(cacheDir, options.targetPath);

  if (fs.existsSync(cachePath)) {
    return cachePath;
  }

  fs.mkdirSync(path.dirname(cachePath), { recursive: true });

  const response = await fetch(options.url);
  if (!response.ok) {
    throw new Error(
      `Failed to download dataset "${options.name}" from ${options.url}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`Response body is not readable for dataset "${options.name}"`);
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
      process.stderr.write(`\rDownloading ${options.name}: ${pct}% (${formatBytes(received)} / ${formatBytes(contentLength)})`);
    } else {
      process.stderr.write(`\rDownloading ${options.name}: ${formatBytes(received)}`);
    }
  }

  process.stderr.write(`\n`);

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  fs.writeFileSync(cachePath, buffer);

  return cachePath;
}
