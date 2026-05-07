import path from 'node:path';
import { describe, expect, test } from 'bun:test';
import { buildStarterConfig } from '../src/setup.ts';

describe('setup starter config', () => {
  test('builds a truthful mixed-provider starter config for selected packs', () => {
    const rootDir = '/workspace/akm-eval';
    const configPath = path.resolve(rootDir, 'config/examples/runs/setup-starter.json');
    const config = buildStarterConfig({
      rootDir,
      configPath,
      packs: ['locomo', 'tau-bench', 'terminal-bench'],
      primaryProvider: 'openai-compatible',
      openAI: {
        baseURL: 'https://api.openai.com/v1',
        apiKey: '{env:OPENAI_API_KEY}',
        defaultModel: 'gpt-4o-mini',
      },
      opencode: {
        configPath: 'config/opencode.json',
        defaultModel: 'opencode/gpt-4.1-mini',
      },
    });

    expect(config.version).toBe(1);
    expect(config.defaults?.memoryBackend).toBe('none');
    expect(config.runs).toHaveLength(3);
    expect(config.providers?.['openai-compatible']?.type).toBe('openai-compatible');
    expect(config.providers?.['openai-compatible']?.baseURL).toBe('https://api.openai.com/v1');
    expect(config.providers?.['openai-compatible']?.defaultModel).toBe('gpt-4o-mini');
    expect(config.providers?.['openai-compatible']?.timeout).toBeUndefined();
    expect(config.providers?.opencode).toEqual({
      type: 'opencode',
      configPath: 'config/opencode.json',
      defaultModel: 'opencode/gpt-4.1-mini',
    });

    const locomo = config.runs.find((run) => run.pack === 'locomo');
    expect(locomo?.agentProvider).toBe('openai-compatible');
    expect(locomo?.agentProviderConfig?.type).toBe('openai-compatible');
    expect(locomo?.packConfig).toEqual({
      smoke: true,
      maxSamples: 1,
      maxQuestions: 5,
      topK: 5,
      maxContextTokens: 16000,
    });

    const tauBench = config.runs.find((run) => run.pack === 'tau-bench');
    expect(tauBench?.agentProvider).toBe('openai-compatible');
    expect(tauBench?.agentProviderConfig?.type).toBe('openai-compatible');
    expect(tauBench?.packConfig).toEqual({
      env: 'retail',
      smoke: true,
      taskSplit: 'test',
      numTrials: 1,
      maxConcurrency: 1,
      agentStrategy: 'tool-calling',
      userStrategy: 'llm',
    });

    const terminalBench = config.runs.find((run) => run.pack === 'terminal-bench');
    expect(terminalBench?.agentProvider).toBe('opencode');
    expect(terminalBench?.agentProviderConfig?.type).toBe('opencode');
    expect(terminalBench?.agentProviderConfig?.configPath).toBe('config/opencode.json');
    expect(terminalBench?.packConfig).toEqual({
      smoke: true,
      taskIds: ['hello-world'],
      nConcurrent: 1,
      nAttempts: 1,
      dataset: 'terminal-bench-core==0.1.1',
    });
  });

  test('allows blank API keys for local openai-compatible endpoints and points longmemeval at the repo dataset', () => {
    const rootDir = '/workspace/akm-eval';
    const configPath = path.resolve(rootDir, 'config/examples/runs/local-starter.json');
    const config = buildStarterConfig({
      rootDir,
      configPath,
      packs: ['longmemeval', 'tau-bench'],
      primaryProvider: 'openai-compatible',
      openAI: {
        baseURL: 'http://192.168.0.99:1234/v1',
        apiKey: '',
        defaultModel: 'qwen/qwen3.5-9b',
        timeout: 600000,
      },
    });

    expect(config.providers?.['openai-compatible']).toEqual({
      type: 'openai-compatible',
      baseURL: 'http://192.168.0.99:1234/v1',
      apiKey: '',
      defaultModel: 'qwen/qwen3.5-9b',
      timeout: 600000,
    });
    const longMemEval = config.runs.find((run) => run.pack === 'longmemeval');
    expect(longMemEval?.packConfig).toEqual({
      datasetPath: 'datasets/longmemeval/dataset.json',
      evaluatorCommand: 'python scripts/longmemeval-evaluator.py',
      smoke: true,
      maxQuestions: 5,
      questionCategories: ['single-session', 'multi-session'],
    });
    const locomo = buildStarterConfig({
      rootDir,
      configPath,
      packs: ['locomo'],
      primaryProvider: 'openai-compatible',
      openAI: {
        baseURL: 'http://192.168.0.99:1234/v1',
        apiKey: '',
        defaultModel: 'qwen/qwen3.5-9b',
        timeout: 600000,
      },
    }).runs[0];
    expect(locomo?.packConfig).toEqual({
      smoke: true,
      maxSamples: 1,
      maxQuestions: 5,
      topK: 5,
      maxContextTokens: 8000,
    });
  });

  test('omits longmemeval datasetPath when setup skips repo-managed downloads', () => {
    const rootDir = '/workspace/akm-eval';
    const configPath = path.resolve(rootDir, 'config/examples/runs/no-download-starter.json');
    const config = buildStarterConfig({
      rootDir,
      configPath,
      packs: ['longmemeval'],
      primaryProvider: 'openai-compatible',
      preferRepoManagedDatasetPaths: false,
      openAI: {
        baseURL: 'http://192.168.0.99:1234/v1',
        apiKey: '',
        defaultModel: 'qwen/qwen3.5-9b',
      },
    });

    expect(config.runs[0]?.packConfig).toEqual({
      evaluatorCommand: 'python scripts/longmemeval-evaluator.py',
      smoke: true,
      maxQuestions: 5,
      questionCategories: ['single-session', 'multi-session'],
    });
  });

  test('builds a beam starter config with explicit repo path', () => {
    const rootDir = '/workspace/akm-eval';
    const configPath = path.resolve(rootDir, 'config/examples/runs/beam-starter.json');
    const config = buildStarterConfig({
      rootDir,
      configPath,
      packs: ['beam'],
      primaryProvider: 'opencode',
      opencode: {
        configPath: 'config/opencode.json',
        defaultModel: 'opencode/gpt-4.1-mini',
      },
      beamRepoPath: '../vendor/BEAM',
    });

    expect(config.runs).toHaveLength(1);
    expect(config.runs[0]?.pack).toBe('beam');
    expect(config.runs[0]?.agentProvider).toBe('opencode');
    expect(config.runs[0]?.agentProviderConfig?.type).toBe('opencode');
    expect(config.runs[0]?.packConfig).toEqual({
      repoPath: '../vendor/BEAM',
      pythonBin: 'python3.11',
      chatSizes: ['100K'],
      smoke: true,
      maxConversations: 1,
      maxQuestionsPerType: 1,
    });
  });
});
