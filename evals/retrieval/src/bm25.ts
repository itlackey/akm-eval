// A plain BM25 over text, with no dependencies. label.ts uses it so the judged pool is not only akm's own view.

export interface Doc {
  ref: string;
  text: string;
}

const tokens = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

export class Bm25 {
  private readonly tf: Map<string, number>[];
  private readonly len: number[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;

  constructor(
    private readonly docs: Doc[],
    private readonly k1 = 1.2,
    private readonly b = 0.75,
  ) {
    const all = docs.map((d) => tokens(d.text));
    this.len = all.map((t) => t.length);
    this.avgLen = this.len.reduce((a, c) => a + c, 0) / Math.max(docs.length, 1);
    this.tf = all.map((ts) => {
      const counts = new Map<string, number>();
      for (const t of ts) counts.set(t, (counts.get(t) ?? 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return counts;
    });
  }

  /** The refs of the k best documents for the query, best first. Documents with no query term are left out. */
  search(query: string, k: number): string[] {
    const terms = [...new Set(tokens(query))].filter((t) => this.df.has(t));
    const n = this.docs.length;
    const scored = this.docs.map((d, i) => {
      let score = 0;
      for (const t of terms) {
        const f = this.tf[i].get(t) ?? 0;
        if (f === 0) continue;
        const df = this.df.get(t) as number;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.len[i]) / this.avgLen));
      }
      return { ref: d.ref, score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((x, y) => y.score - x.score || (x.ref < y.ref ? -1 : 1))
      .slice(0, k)
      .map((s) => s.ref);
  }
}
