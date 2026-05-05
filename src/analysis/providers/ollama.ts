import {
  ProviderNotConfiguredError,
  type CompleteOptions,
  type Provider,
  type ProviderInfo,
  type ProviderModel,
} from './types.js';

// Static fallback list — we'll merge with whatever Ollama actually has installed.
// Context windows reflect each model's maximum capacity.
const KNOWN_MODELS: ProviderModel[] = [
  { id: 'qwen2.5-coder:14b', label: 'Qwen2.5 Coder 14B', contextWindow: 128_000, notes: 'Code-focused; good at structured output.' },
  { id: 'qwen2.5-coder:7b', label: 'Qwen2.5 Coder 7B', contextWindow: 128_000, notes: 'Smaller / faster.' },
  { id: 'qwen3-coder:30b', label: 'Qwen3 Coder 30B', contextWindow: 256_000 },
  { id: 'gemma3:9b', label: 'Gemma3 9B', contextWindow: 65_536 },
  { id: 'gemma3:4b', label: 'Gemma3 4B', contextWindow: 65_536 },
  { id: 'llama3.3:70b', label: 'Llama 3.3 70B', contextWindow: 128_000, notes: 'Heavyweight; needs serious hardware.' },
];

const ENV_KEY = 'OLLAMA_BASE_URL';
const DEFAULT_BASE_URL = 'http://localhost:11434';
// Override Ollama's 4096 default which would truncate our ~7k-token prompt.
const DEFAULT_NUM_CTX = 32_768;

async function probeOllama(baseUrl: string): Promise<{ available: boolean; installed: string[] }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { available: false, installed: [] };
    const json = (await res.json()) as { models?: Array<{ name: string }> };
    return { available: true, installed: (json.models ?? []).map((m) => m.name) };
  } catch {
    return { available: false, installed: [] };
  }
}

export async function buildOllamaProvider(): Promise<Provider> {
  const baseUrl = process.env[ENV_KEY] || DEFAULT_BASE_URL;
  const probe = await probeOllama(baseUrl);

  // Build the model list: any installed model the user has, plus our known list of recommended ones.
  // De-dupe by id; preserve "installed" tags first.
  const installedMap = new Map<string, ProviderModel>();
  for (const id of probe.installed) {
    const known = KNOWN_MODELS.find((m) => m.id === id);
    installedMap.set(id, known ?? { id, label: id, contextWindow: 32_768, notes: 'Installed locally.' });
  }
  for (const m of KNOWN_MODELS) {
    if (!installedMap.has(m.id)) installedMap.set(m.id, m);
  }
  const models = Array.from(installedMap.values());

  const info: ProviderInfo = {
    id: 'ollama',
    label: 'Ollama (local)',
    envKey: ENV_KEY,
    models,
    available: probe.available,
  };

  const complete = async (prompt: string, opts: CompleteOptions = {}): Promise<string> => {
    if (!probe.available) throw new ProviderNotConfiguredError('ollama', ENV_KEY);
    const modelId = opts.model || models[0]?.id || 'qwen2.5-coder:14b';

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelId,
        prompt,
        stream: false,
        options: { num_ctx: DEFAULT_NUM_CTX },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama API error ${res.status}: ${errText.slice(0, 300)}`);
    }
    const json = (await res.json()) as { response?: string; error?: string };
    if (json.error) throw new Error(`Ollama error: ${json.error}`);
    if (!json.response) throw new Error(`Ollama returned no response field.`);
    return json.response;
  };

  return { info, complete };
}
