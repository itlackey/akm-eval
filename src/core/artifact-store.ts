import fs from "node:fs";
import path from "node:path";

export class ArtifactStore {
  constructor(public readonly baseDir: string) {}

  ensureDir(): void {
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  writeJson(relativePath: string, value: unknown): string {
    const target = path.resolve(this.baseDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return target;
  }

  writeText(relativePath: string, value: string): string {
    const target = path.resolve(this.baseDir, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, value, "utf8");
    return target;
  }
}
