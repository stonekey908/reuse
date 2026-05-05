export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama';

export interface ProviderModel {
  id: string;
  label: string;
  contextWindow: number;
  notes?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  envKey: string;
  models: ProviderModel[];
  available: boolean;
}

export interface CompleteOptions {
  model?: string;
}

export interface Provider {
  readonly info: ProviderInfo;
  complete(prompt: string, opts?: CompleteOptions): Promise<string>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(public readonly provider: ProviderId, public readonly envKey: string) {
    super(`Provider "${provider}" is not configured. Set ${envKey} in .env (or OLLAMA_BASE_URL for ollama).`);
    this.name = 'ProviderNotConfiguredError';
  }
}

export class ContextWindowExceededError extends Error {
  constructor(provider: ProviderId, model: string, promptChars: number, contextWindow: number) {
    super(
      `Prompt is too large for ${provider}/${model}: ~${Math.round(promptChars / 4)} tokens > ${contextWindow} token context window. ` +
      `Try a model with a larger context window, or reduce the registry size.`,
    );
    this.name = 'ContextWindowExceededError';
  }
}
