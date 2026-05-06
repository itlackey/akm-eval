export interface TauBenchRunEntry {
  task_id: number;
  reward: number;
  info: Record<string, unknown>;
  traj: Array<Record<string, unknown>>;
  trial: number;
}

export interface ParsedTauBenchRawOutput {
  entries: TauBenchRunEntry[];
  totalTasks: number;
  passedTasks: number;
  failedTasks: number;
  averageReward: number;
  trials: number;
  errorCount: number;
}

export function parseTauBenchRawOutput(value: unknown): ParsedTauBenchRawOutput {
  if (!Array.isArray(value)) {
    throw new Error('tau-bench raw output must be an array');
  }

  const entries = value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error('tau-bench raw entry must be an object');
    }
    const raw = entry as Record<string, unknown>;
    if (
      typeof raw.task_id !== 'number' ||
      typeof raw.reward !== 'number' ||
      typeof raw.trial !== 'number' ||
      typeof raw.info !== 'object' ||
      raw.info === null ||
      !Array.isArray(raw.traj)
    ) {
      throw new Error(`tau-bench raw entry is malformed: ${JSON.stringify(entry)}`);
    }
    return raw as unknown as TauBenchRunEntry;
  });

  const totalTasks = entries.length;
  const passedTasks = entries.filter((entry) => entry.reward >= 1 - 1e-6).length;
  const failedTasks = totalTasks - passedTasks;
  const averageReward = totalTasks === 0 ? 0 : entries.reduce((sum, entry) => sum + entry.reward, 0) / totalTasks;
  const trials = new Set(entries.map((entry) => entry.trial)).size;
  const errorCount = entries.filter((entry) => typeof entry.info.error === 'string' && entry.info.error.length > 0).length;

  return {
    entries,
    totalTasks,
    passedTasks,
    failedTasks,
    averageReward: Number(averageReward.toFixed(6)),
    trials,
    errorCount,
  };
}
