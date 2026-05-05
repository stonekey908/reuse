import OpenAI from 'openai';
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
  { id: 'gpt-5.5', label: 'GPT-5.5', contextWindow: 1_000_000, notes: '1M context. Most capable in the GPT-5 series.' },
  { id: 'gpt-5.4', label: 'GPT-5.4', contextWindow: 400_000, notes: 'Strong default; slightly cheaper than 5.5.' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', contextWindow: 400_000, notes: 'Fast and cheap.' },
  { id: 'gpt-5.4-nano', label: 'GPT-5.4 nano', contextWindow: 400_000, notes: 'Lowest latency / cost.' },
];

const DEFAULT_MODEL = 'gpt-5.4';
const ENV_KEY = 'OPENAI_API_KEY';

export function buildOpenAIProvider(): Provider {
  const apiKey = process.env[ENV_KEY];
  const info: ProviderInfo = {
    id: 'openai',
    label: 'OpenAI',
    envKey: ENV_KEY,
    models: MODELS,
    available: !!apiKey,
  };

  const complete = async (prompt: string, opts: CompleteOptions = {}): Promise<string> => {
    if (!apiKey) throw new ProviderNotConfiguredError('openai', ENV_KEY);
    const modelId = opts.model || DEFAULT_MODEL;
    const model = MODELS.find((m) => m.id === modelId);
    if (model && prompt.length / 4 > model.contextWindow * 0.8) {
      throw new ContextWindowExceededError('openai', modelId, prompt.length, model.contextWindow);
    }

    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create(
      {
        model: modelId,
        // Headroom for ~100-pattern clusters; OpenAI silently caps at the
        // model's max output budget if this is too high.
        max_completion_tokens: 32_000,
        messages: [{ role: 'user', content: prompt }],
      },
      { signal: opts.signal },
    );

    const choice = response.choices[0];
    const text = choice?.message?.content;
    if (!text) throw new Error(`OpenAI returned no content. Finish reason: ${choice?.finish_reason}`);
    if (choice?.finish_reason === 'length') {
      throw new OutputTruncatedError('openai', modelId, text.length, text);
    }
    return text;
  };

  return { info, complete };
}
