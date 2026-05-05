import { z } from 'zod';
import { stripCodeFences } from '../runner.js';
import type { AnalysisItem, Cluster, StandalonePattern } from '../../shared/types.js';
import type { Provider } from '../providers/index.js';

export const ClusterProseSchema = z.object({
  description: z.string().describe('One-line summary of what unites this cluster'),
  similarities: z.string(),
  differences: z.string(),
  consolidationNote: z.string().optional(),
});

export const StandaloneProseSchema = z.object({
  description: z.string(),
  rationale: z.string(),
  closestRelative: z.string(),
  notes: z.string().optional(),
});

export type ClusterProse = z.infer<typeof ClusterProseSchema>;
export type StandaloneProse = z.infer<typeof StandaloneProseSchema>;

export function buildClusterWriterPrompt(cluster: Cluster, otherCapabilities: string[]): string {
  const memberLines = cluster.members.map((m) =>
    `  - ${m.project}/${m.patternKey}: ${m.summary}`,
  ).join('\n');
  const peers = otherCapabilities.slice(0, 8).join(', ') || '(none)';

  return `You are writing the prose fields for a SINGLE pattern cluster. The cluster has been pre-determined by a deterministic grouper (capability + abstraction level + multi-project rule). Your only job: produce 'description', 'similarities', 'differences', and an optional 'consolidationNote'.

Cluster:
  capability: ${cluster.capability}
  members:
${memberLines}

Other capabilities in the registry (for context, do NOT mix them into this cluster's prose): ${peers}

Rules:
- 'description' is one line summarising what unites these members.
- 'similarities' is ≥2 substantive sentences naming concrete shared mechanisms among members. No filler ("they are similar"). No mention of mechanism that isn't actually shared.
- 'differences' is ≥2 substantive sentences naming concrete divergences. State which members diverge on what axis.
- 'consolidationNote' is optional. Include only when there's a concrete reuse opportunity. End with a parenthetical effort/payoff judgment: "(low effort, high reuse)", "(medium effort, medium reuse)", or "(skip — divergence is fundamental)". When you propose a shared module, name its API surface.

Return strict JSON, no markdown fences:
{
  "description": "...",
  "similarities": "...",
  "differences": "...",
  "consolidationNote": "..." | undefined
}`;
}

export function buildStandaloneWriterPrompt(standalone: StandalonePattern, otherCapabilities: string[]): string {
  const peers = otherCapabilities.slice(0, 8).join(', ') || '(none)';
  return `You are writing the prose fields for a SINGLE standalone pattern (one that doesn't have other registry patterns sharing its capability + abstraction level). Your only job: produce 'description', 'rationale', and 'closestRelative'.

Standalone pattern:
  capability: ${standalone.capability}
  pattern: ${standalone.member.project}/${standalone.member.patternKey}: ${standalone.member.summary}

Other capabilities in the registry: ${peers}

Rules:
- 'description' is one line summarising what this pattern does.
- 'rationale' is ONE sentence explaining what makes this its own category — what user-facing problem it solves that no other registry pattern solves at this abstraction level.
- 'closestRelative' is ONE sentence naming the nearest registered pattern (project + key from the other-capabilities context if you can identify it) and why it doesn't share enough capability to cluster.
- NEVER write "Single member." or boilerplate placeholder text.

Return strict JSON, no markdown fences:
{
  "description": "...",
  "rationale": "...",
  "closestRelative": "..."
}`;
}

export function parseClusterProse(raw: string): ClusterProse {
  return ClusterProseSchema.parse(JSON.parse(stripCodeFences(raw)));
}

export function parseStandaloneProse(raw: string): StandaloneProse {
  return StandaloneProseSchema.parse(JSON.parse(stripCodeFences(raw)));
}

export interface WriteOptions {
  provider: Provider;
  model?: string;
  signal?: AbortSignal;
  /** Concurrency for per-item writer calls. Default 4. */
  concurrency?: number;
  onProgress?: (p: { written: number; total: number; current?: { capability: string; kind: 'cluster' | 'standalone' } }) => void;
}

export async function writeAllProse(
  items: AnalysisItem[],
  opts: WriteOptions,
): Promise<AnalysisItem[]> {
  const provider = opts.provider;
  const concurrency = opts.concurrency ?? 4;
  const otherCapabilities = Array.from(new Set(items.map((i) => i.capability)));

  let cursor = 0;
  let written = 0;
  const results: AnalysisItem[] = items.map((i) => ({ ...i }));

  async function worker() {
    while (cursor < items.length) {
      if (opts.signal?.aborted) return;
      const idx = cursor++;
      const item = items[idx];
      opts.onProgress?.({ written, total: items.length, current: { capability: item.capability, kind: item.kind === 'standalone' ? 'standalone' : 'cluster' } });
      try {
        if (item.kind === 'standalone') {
          const prompt = buildStandaloneWriterPrompt(item, otherCapabilities.filter((c) => c !== item.capability));
          const raw = await provider.complete(prompt, { model: opts.model, signal: opts.signal });
          const prose = parseStandaloneProse(raw);
          results[idx] = { ...item, ...prose };
        } else {
          const prompt = buildClusterWriterPrompt(item, otherCapabilities.filter((c) => c !== item.capability));
          const raw = await provider.complete(prompt, { model: opts.model, signal: opts.signal });
          const prose = parseClusterProse(raw);
          results[idx] = { ...item, ...prose };
        }
      } catch (err) {
        // Leave the original placeholder prose in place; record the error in description.
        results[idx] = { ...item, description: `Writer failed: ${err instanceof Error ? err.message : String(err)}` };
      }
      written += 1;
      opts.onProgress?.({ written, total: items.length });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
