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

    // The Anthropic SDK requires streaming for any request whose budget
    // (model + max_tokens) could plausibly exceed the 10-minute non-stream
    // ceiling. At 64k output on Sonnet that always trips the guard, so we
    // stream unconditionally and accumulate the text deltas. Same final
    // result as messages.create, just streamed.
    const stream = client.messages.stream(
      {
        model: modelId,
        max_tokens: maxOutputTokens,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: opts.signal },
    );

    const final = await stream.finalMessage();

    const textBlock = final.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error(`Anthropic returned no text content. Stop reason: ${final.stop_reason}`);
    }
    if (final.stop_reason === 'max_tokens') {
      throw new OutputTruncatedError('anthropic', modelId, textBlock.text.length, textBlock.text);
    }
    return textBlock.text;
  };

  return { info, complete };
}
