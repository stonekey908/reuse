import Anthropic from '@anthropic-ai/sdk';
import {
  ContextWindowExceededError,
  ProviderNotConfiguredError,
  type CompleteOptions,
  type Provider,
  type ProviderInfo,
  type ProviderModel,
} from './types.js';

const MODELS: ProviderModel[] = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', contextWindow: 200_000, notes: 'Most capable. Slowest. Best for prompt-tuning rounds.' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (1M ctx)', contextWindow: 1_000_000, notes: 'Recommended default. 30-50% faster than Sonnet 4.5, 1M context.' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', contextWindow: 200_000, notes: 'Fastest. Cheaper. Quality may be coarser on rich prose.' },
];

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const ENV_KEY = 'ANTHROPIC_API_KEY';

export function buildAnthropicProvider(): Provider {
  const apiKey = process.env[ENV_KEY];
  const info: ProviderInfo = {
    id: 'anthropic',
    label: 'Anthropic',
    envKey: ENV_KEY,
    models: MODELS,
    available: !!apiKey,
  };

  const complete = async (prompt: string, opts: CompleteOptions = {}): Promise<string> => {
    if (!apiKey) throw new ProviderNotConfiguredError('anthropic', ENV_KEY);
    const modelId = opts.model || DEFAULT_MODEL;
    const model = MODELS.find((m) => m.id === modelId);
    if (model && prompt.length / 4 > model.contextWindow * 0.8) {
      throw new ContextWindowExceededError('anthropic', modelId, prompt.length, model.contextWindow);
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 16_000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error(`Anthropic returned no text content. Stop reason: ${response.stop_reason}`);
    }
    return textBlock.text;
  };

  return { info, complete };
}
