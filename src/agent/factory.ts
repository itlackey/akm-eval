import type { AgentProviderConfig } from '../core/types.ts';
import { OpencodeAgentRunner } from './opencode-runner.ts';
import { OpenAICompatibleRunner } from './openai-compatible-runner.ts';
import type { AgentRunner } from './types.ts';

export function createAgentRunner(
  providerType: string,
  providerConfig: AgentProviderConfig,
  model: string,
): AgentRunner {
  if (providerType === 'opencode') {
    return new OpencodeAgentRunner(providerConfig, model);
  }
  if (providerType === 'openai-compatible') {
    return new OpenAICompatibleRunner(providerConfig, model);
  }
  throw new Error(`Unsupported provider type: ${providerType}`);
}
