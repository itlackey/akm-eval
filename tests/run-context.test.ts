import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';
import { createRunContext } from '../src/core/run-context.ts';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('run context metadata', () => {
  test('derives repoCommit and runnerType for new runs when available', () => {
    const expectedCommit = Bun.spawnSync({
      cmd: ['git', 'rev-parse', 'HEAD'],
      cwd: rootDir,
      stdout: 'pipe',
      stderr: 'pipe',
    }).stdout
      .toString()
      .trim();

    const context = createRunContext(
      rootDir,
      { version: 1, runs: [] },
      {
        pack: 'locomo',
        variant: 'baseline',
        agentProvider: 'openai-compatible',
        agentProviderConfig: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
        },
      },
    );

    expect(context.run.metadata?.repoCommit).toBe(expectedCommit);
    expect(context.run.metadata?.runnerType).toBe('openai-compatible');
  });

  test('preserves explicit metadata values', () => {
    const context = createRunContext(
      rootDir,
      { version: 1, runs: [] },
      {
        pack: 'locomo',
        variant: 'baseline',
        metadata: {
          repoCommit: 'manual-commit',
          runnerType: 'manual-runner',
        },
        agentProvider: 'openai-compatible',
        agentProviderConfig: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
        },
      },
    );

    expect(context.run.metadata?.repoCommit).toBe('manual-commit');
    expect(context.run.metadata?.runnerType).toBe('manual-runner');
  });

  test('derives model from run agentModel first', () => {
    const context = createRunContext(
      rootDir,
      { version: 1, runs: [] },
      {
        pack: 'locomo',
        variant: 'baseline',
        agentModel: 'custom/model',
        agentProvider: 'openai-compatible',
        agentProviderConfig: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          defaultModel: 'provider/default-model',
        },
      },
    );

    expect(context.run.metadata?.model).toBe('custom/model');
  });

  test('falls back to provider default model when run agentModel is absent', () => {
    const context = createRunContext(
      rootDir,
      { version: 1, runs: [] },
      {
        pack: 'locomo',
        variant: 'baseline',
        agentProvider: 'openai-compatible',
        agentProviderConfig: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          defaultModel: 'provider/default-model',
        },
      },
    );

    expect(context.run.metadata?.model).toBe('provider/default-model');
  });

  test('preserves explicit metadata model', () => {
    const context = createRunContext(
      rootDir,
      { version: 1, runs: [] },
      {
        pack: 'locomo',
        variant: 'baseline',
        metadata: {
          model: 'manual-model',
        },
        agentProvider: 'openai-compatible',
        agentProviderConfig: {
          type: 'openai-compatible',
          baseURL: 'https://api.openai.com/v1',
          defaultModel: 'provider/default-model',
        },
      },
    );

    expect(context.run.metadata?.model).toBe('manual-model');
  });
});
