import { GoogleGenAI } from '@google/genai';
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
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', contextWindow: 1_000_000, maxOutputTokens: 65_536, notes: 'Reasoning-first; latest preview.' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (preview)', contextWindow: 1_000_000, maxOutputTokens: 65_536, notes: 'Fast preview model from the Gemini 3 line.' },
  { id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash-Lite (preview)', contextWindow: 1_000_000, maxOutputTokens: 65_536, notes: 'Cost-efficient.' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', contextWindow: 2_000_000, maxOutputTokens: 65_536, notes: 'Stable; very large context.' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', contextWindow: 1_000_000, maxOutputTokens: 65_536, notes: 'Fast and capable.' },
];

const DEFAULT_MODEL = 'gemini-2.5-pro';
const ENV_KEY = 'GOOGLE_API_KEY';

export function buildGeminiProvider(): Provider {
  const apiKey = process.env[ENV_KEY];
  const info: ProviderInfo = {
    id: 'gemini',
    label: 'Google Gemini',
    envKey: ENV_KEY,
    models: MODELS,
    available: !!apiKey,
  };

  const complete = async (prompt: string, opts: CompleteOptions = {}): Promise<string> => {
    if (!apiKey) throw new ProviderNotConfiguredError('gemini', ENV_KEY);
    const modelId = opts.model || DEFAULT_MODEL;
    const model = MODELS.find((m) => m.id === modelId);
    if (model && prompt.length / 4 > model.contextWindow * 0.8) {
      throw new ContextWindowExceededError('gemini', modelId, prompt.length, model.contextWindow);
    }

    const client = new GoogleGenAI({ apiKey });
    const maxOutputTokens = model?.maxOutputTokens ?? 32_000;
    const response = await client.models.generateContent({
      model: modelId,
      contents: prompt,
      config: { abortSignal: opts.signal, maxOutputTokens },
    });

    const text = response.text;
    if (!text) throw new Error(`Gemini returned no text content.`);
    const finishReason = response.candidates?.[0]?.finishReason as string | undefined;
    if (finishReason === 'MAX_TOKENS') {
      throw new OutputTruncatedError('gemini', modelId, text.length, text);
    }
    return text;
  };

  return { info, complete };
}
