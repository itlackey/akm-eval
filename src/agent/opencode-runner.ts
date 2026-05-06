import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentProviderConfig } from '../core/types.ts';
import { EvalConfigError, loadOpencodeConfig, materializeOpencodeConfig, selectProviderForModel } from '../opencode-config.ts';
import type { AgentRunOptions, AgentRunResult, AgentRunner } from './types.ts';

function parseOpencodeJsonl(stdout: string): {
  text: string;
  inputTokens: number;
  outputTokens: number;
  sawTokens: boolean;
} {
  let inputTokens = 0;
  let outputTokens = 0;
  let sawTokens = false;
const textParts: string[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      const event = JSON.parse(trimmed) as {
        type?: string;
        part?: {
          type?: string;
          text?: string;
          tokens?: { input?: number; output?: number };
        };
      };
      if (event.type === 'text' && event.part?.type === 'text' && typeof event.part.text === 'string') {
        textParts.push(event.part.text);
      }
      const tokens = event.part?.tokens;
      if (typeof tokens?.input === 'number' || typeof tokens?.output === 'number') {
        inputTokens = typeof tokens.input === 'number' ? tokens.input : 0;
        outputTokens = typeof tokens.output === 'number' ? tokens.output : 0;
        sawTokens = true;
      }
    } catch {
      // ignore malformed lines
    }
  }

  return {
    text: textParts.join(''),
    inputTokens,
    outputTokens,
    sawTokens,
  };
}

const MAX_OPENCODE_PROMPT_BYTES = 100_000;

export class OpencodeAgentRunner implements AgentRunner {
  private providerConfig: AgentProviderConfig;
  private model: string;

  constructor(providerConfig: AgentProviderConfig, model: string) {
    this.providerConfig = providerConfig;
    this.model = model;
  }

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const startedAt = Date.now();
    let isolatedDir: string | undefined;

    try {
      const configPath = this.providerConfig.configPath;
      if (!configPath) {
        return {
          ok: false,
          text: '',
          latencyMs: Date.now() - startedAt,
          error: 'opencode provider requires configPath (path to opencode.json)',
        };
      }

      const loaded = loadOpencodeConfig(path.resolve(configPath));
      const selected = selectProviderForModel(loaded, this.model);

      isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'akm-eval-opencode-'));
      const cacheHome = path.join(isolatedDir, 'cache');
      const configHome = path.join(isolatedDir, 'config');
      const opencodeConfigHome = path.join(configHome, 'opencode');
      fs.mkdirSync(cacheHome, { recursive: true });
      fs.mkdirSync(configHome, { recursive: true });
      const realOpencodeConfigDir = path.join(os.homedir(), '.config', 'opencode');
      if (fs.existsSync(realOpencodeConfigDir)) {
        fs.symlinkSync(realOpencodeConfigDir, opencodeConfigHome);
      } else {
        fs.mkdirSync(opencodeConfigHome, { recursive: true });
      }
      materializeOpencodeConfig(isolatedDir, selected, this.model);

      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        XDG_CACHE_HOME: cacheHome,
        XDG_CONFIG_HOME: configHome,
        OPENCODE_CONFIG: path.join(isolatedDir, 'opencode.json'),
      };

      const promptBytes = Buffer.byteLength(options.prompt, 'utf8');
      if (promptBytes > MAX_OPENCODE_PROMPT_BYTES) {
        return {
          ok: false,
          text: '',
          latencyMs: Date.now() - startedAt,
          error:
            `opencode prompt is too large for CLI argument transport (${promptBytes} bytes). ` +
            `Use a smaller benchmark slice or switch to an openai-compatible provider for this run.`,
        };
      }

      const args = ['run', '--format', 'json', '--model', this.model];
      const message = options.systemPrompt
        ? `System instructions:\n${options.systemPrompt}\n\nUser request:\n${options.prompt}`
        : options.prompt;
      args.push(message);

      const timeoutMs = options.timeoutMs ?? this.providerConfig.timeout ?? 120000;
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

      const proc = Bun.spawn(['opencode', ...args], {
        env,
        cwd: process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
        signal: abortController.signal,
      });

      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const exitCode = proc.exitCode ?? -1;
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startedAt;

      if (abortController.signal.aborted) {
        return {
          ok: false,
          text: stdout,
          latencyMs,
          error: `opencode run timed out after ${timeoutMs}ms`,
        };
      }

      if (exitCode !== 0) {
        return {
          ok: false,
          text: stdout,
          latencyMs,
          error: stderr || `opencode run exited with code ${exitCode}`,
        };
      }

      const parsed = parseOpencodeJsonl(stdout);
      return {
        ok: true,
        text: parsed.text || stdout,
        usage: parsed.sawTokens
          ? {
              input: parsed.inputTokens,
              output: parsed.outputTokens,
              total: parsed.inputTokens + parsed.outputTokens,
            }
          : undefined,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        text: '',
        latencyMs,
        error: message,
      };
    } finally {
      if (isolatedDir) {
        try {
          fs.rmSync(isolatedDir, { recursive: true, force: true });
        } catch {
          // best-effort cleanup
        }
      }
    }
  }
}
