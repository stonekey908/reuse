import 'dotenv/config';
import { buildAnthropicProvider } from './anthropic.js';
import { buildOpenAIProvider } from './openai.js';
import { buildGeminiProvider } from './gemini.js';
import { buildOllamaProvider } from './ollama.js';
import type { Provider, ProviderId, ProviderInfo } from './types.js';

export * from './types.js';

let cache: { providers: Map<ProviderId, Provider>; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

async function build(): Promise<Map<ProviderId, Provider>> {
  const providers = new Map<ProviderId, Provider>();
  providers.set('anthropic', buildAnthropicProvider());
  providers.set('openai', buildOpenAIProvider());
  providers.set('gemini', buildGeminiProvider());
  providers.set('ollama', await buildOllamaProvider());
  return providers;
}

export async function listProviders(): Promise<ProviderInfo[]> {
  if (!cache || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    cache = { providers: await build(), loadedAt: Date.now() };
  }
  return Array.from(cache.providers.values()).map((p) => p.info);
}

export async function getProvider(id: ProviderId): Promise<Provider> {
  if (!cache || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
    cache = { providers: await build(), loadedAt: Date.now() };
  }
  const p = cache.providers.get(id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export function getDefaultProviderAndModel(infos: ProviderInfo[]): { provider: ProviderId; model: string } | null {
  const pref: ProviderId[] = ['anthropic', 'openai', 'gemini', 'ollama'];
  for (const id of pref) {
    const info = infos.find((i) => i.id === id);
    if (info?.available && info.models.length > 0) {
      return { provider: id, model: info.models[0].id };
    }
  }
  return null;
}
