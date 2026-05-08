import path from 'node:path';

export type CliCommand =
  | 'compare'
  | 'doctor'
  | 'downloads'
  | 'matrix'
  | 'report'
  | 'run'
  | 'summary';

const WRAPPER_COMMANDS: Record<string, CliCommand> = {
  'akm-eval': 'run',
  compare: 'compare',
  doctor: 'doctor',
  downloads: 'downloads',
  eval: 'run',
  matrix: 'matrix',
  report: 'report',
  summary: 'summary',
};

export function resolveWrapperCommand(entryPath: string | undefined): CliCommand | undefined {
  if (!entryPath) {
    return undefined;
  }

  return WRAPPER_COMMANDS[path.basename(entryPath)];
}

export function normalizeCliArgs(argv: string[]): string[] {
  const [, entryPath, ...args] = argv;
  const wrapperCommand = resolveWrapperCommand(entryPath);

  if (!wrapperCommand) {
    return args;
  }

  if (wrapperCommand === 'run') {
    const firstArg = args[0];
    if (
      firstArg === undefined ||
      firstArg === 'run' ||
      firstArg === 'doctor' ||
      firstArg === 'list' ||
      firstArg === 'matrix' ||
      firstArg === 'compare' ||
      firstArg === 'report' ||
      firstArg === 'summary' ||
      firstArg === 'downloads'
    ) {
      return args;
    }
  }

  return [wrapperCommand, ...args];
}

export function createUsageLines(): string[] {
  return [
    'Usage:',
    '  bin/doctor [--pack <id>]',
    '  bin/akm-eval list packs',
    '  bin/akm-eval list variants',
    '  bin/eval --pack <id> --variant <id> --config <path> [--out <dir>]',
    '  bin/matrix --config <path>',
    '  bin/compare --baseline <dir> --candidate <dir> [--out <path>] [--format markdown|json]',
    '  bin/report --run <dir> [--format markdown|json]',
    '  bin/summary --runs <dir> [--format markdown|json]',
    '  bin/downloads [DatasetName]',
    '  bun run setup:legacy',
  ];
}
