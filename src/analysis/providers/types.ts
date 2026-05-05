export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama';

export interface ProviderModel {
  id: string;
  label: string;
  /** Input-side context window (prompt + history). */
  contextWindow: number;
  /** Output-side cap — max tokens the model will emit in one response.
   *  Distinct from contextWindow: a 1M-context model can still cap output
   *  at ~32-64k. Used to set max_tokens / max_completion_tokens / maxOutputTokens. */
  maxOutputTokens: number;
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
  signal?: AbortSignal;
}

export class CancelledError extends Error {
  constructor() {
    super('Run cancelled by user.');
    this.name = 'CancelledError';
  }
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

/**
 * Thrown when a provider stops generating because it hit the output-token cap
 * (Anthropic stop_reason: "max_tokens", OpenAI finish_reason: "length",
 * Gemini finishReason: "MAX_TOKENS", Ollama done_reason: "length").
 *
 * The runner needs to distinguish this from a JSON-parse failure caused by
 * malformed output — retrying a truncated response with the same budget will
 * just truncate again, so we surface a specific actionable error to the UI
 * instead of looping the runner.
 */
export class OutputTruncatedError extends Error {
  constructor(
    public readonly provider: ProviderId,
    public readonly model: string,
    public readonly outputChars: number,
    public readonly partial: string,
  ) {
    super(
      `${provider}/${model} stopped generating because it hit the output-token cap (${Math.round(outputChars / 4)} tokens emitted). ` +
      `The registry has grown beyond what fits in one response. Try a model with a larger output budget, or split the analysis.`,
    );
    this.name = 'OutputTruncatedError';
  }
}
