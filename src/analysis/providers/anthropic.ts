import Anthropic from '@anthropic-ai/sdk';
import {
  ContextWindowExceededError,
  OutputTruncatedError,
  ProviderNotConfiguredError,
  type CompleteOptions,
  type Provider,
  type ProviderInfo,
  type ProviderModel,
} from './types.js';

const MODELS: ProviderModel[] = [
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7', contextWindow: 200_000, maxOutputTokens: 32_000, notes: 'Most capable. Slowest. Best for prompt-tuning rounds.' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (1M ctx)', contextWindow: 1_000_000, maxOutputTokens: 64_000, notes: 'Recommended default. 1M context, 64k output.' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', contextWindow: 200_000, maxOutputTokens: 64_000, notes: 'Fastest. Cheaper. Quality may be coarser on rich prose.' },
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
    const maxOutputTokens = model?.maxOutputTokens ?? 32_000;
    const response = await client.messages.create(
      {
        model: modelId,
        // Each model carries its own output-token cap (Opus 32k, Sonnet/Haiku
        // 64k). Distinct from contextWindow — the 1M Sonnet still caps OUTPUT
        // at 64k, which is what truncated the analysis JSON pre-fix.
        max_tokens: maxOutputTokens,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: opts.signal },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error(`Anthropic returned no text content. Stop reason: ${response.stop_reason}`);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new OutputTruncatedError('anthropic', modelId, textBlock.text.length, textBlock.text);
    }
    return textBlock.text;
  };

  return { info, complete };
}
