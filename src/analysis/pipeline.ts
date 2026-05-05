import type { AnalysisItem, Registry } from '../shared/types.js';
import { loadGlossary, saveGlossary } from '../shared/glossary.js';
import { getProvider, type ProviderId } from './providers/index.js';
import { backfillTags } from './agents/backfill.js';
import { collectTaggedPatterns, group } from './grouper.js';
import { normalizeGlossary, type NormalizerDecision } from './agents/glossary-normalizer.js';
import { writeAllProse } from './agents/writer.js';

export type PipelineEvent =
  | { type: 'agent-start'; agent: 'tagger' | 'normalizer' | 'grouper' | 'writer'; total?: number }
  | { type: 'agent-progress'; agent: 'tagger' | 'writer'; current?: string; done: number; total: number }
  | { type: 'agent-done'; agent: 'tagger' | 'normalizer' | 'grouper' | 'writer'; elapsedSec: number; meta?: Record<string, unknown> }
  | { type: 'complete'; items: AnalysisItem[] }
  | { type: 'error'; error: string };

export interface PipelineOptions {
  registry: Registry;
  /** Provider for the Tagger pass (cheap model fine — Sonnet/Haiku). */
  taggerProvider: ProviderId;
  taggerModel?: string;
  /** Provider for Normalizer + Writer (capability-heavy work — Sonnet+ recommended). */
  writerProvider: ProviderId;
  writerModel?: string;
  /** If true, re-tag every pattern even if already tagged. */
  forceTag?: boolean;
  signal?: AbortSignal;
  /** Live event stream — used by SSE endpoint to push to UI. */
  onEvent?: (event: PipelineEvent) => void;
}

/**
 * The new analyze pipeline:
 *   1. Tagger — backfill any missing capability/abstractionLevel/domain tags.
 *   2. Normalizer — consolidate duplicate slugs in the glossary.
 *   3. Grouper — pure data: bucket patterns by (capability, abstractionLevel),
 *      apply multi-project rule, emit cluster/standalone shells.
 *   4. Writer — narrow per-item LLM call for prose (similarities, differences,
 *      consolidationNote / rationale, closestRelative).
 *
 * Returns the final AnalysisItem[]. Caller is responsible for calling
 * writeAnalysis() to persist + emit staleness.
 */
export async function runPipeline(opts: PipelineOptions): Promise<AnalysisItem[]> {
  const emit = opts.onEvent ?? (() => {});
  const signal = opts.signal;

  // 1. Tagger
  emit({ type: 'agent-start', agent: 'tagger' });
  const tagStart = Date.now();
  const taggerResult = await backfillTags({
    provider: opts.taggerProvider,
    model: opts.taggerModel,
    concurrency: 4,
    force: opts.forceTag,
    signal,
    onProgress: (p) => emit({
      type: 'agent-progress',
      agent: 'tagger',
      done: p.tagged,
      total: p.total,
      current: p.current ? `${p.current.project}/${p.current.patternKey}` : undefined,
    }),
  });
  emit({
    type: 'agent-done',
    agent: 'tagger',
    elapsedSec: Math.round((Date.now() - tagStart) / 1000),
    meta: {
      tagged: taggerResult.tagged,
      alreadyTagged: taggerResult.alreadyTagged,
      total: taggerResult.total + taggerResult.alreadyTagged,
      errors: taggerResult.errors.length,
      newCapabilities: taggerResult.newCanonicalCapabilities.length,
      newDomains: taggerResult.newCanonicalDomains.length,
    },
  });

  if (signal?.aborted) throw new Error('aborted');

  // Reload registry + glossary because backfillTags persisted both.
  const { loadRegistry } = await import('../shared/registry.js');
  const registry = loadRegistry();
  let glossary = loadGlossary();
  const entries = collectTaggedPatterns(registry);

  // 2. Normalizer (only run when there are capabilities to deduplicate)
  emit({ type: 'agent-start', agent: 'normalizer' });
  const normStart = Date.now();
  let normalizerDecision: NormalizerDecision | undefined;
  if (glossary.capabilities.length > 1) {
    const writer = await getProvider(opts.writerProvider);
    const result = await normalizeGlossary(writer, glossary, entries, { model: opts.writerModel, signal });
    glossary = result.updated;
    normalizerDecision = result.decision;
    saveGlossary(glossary);
  }
  emit({
    type: 'agent-done',
    agent: 'normalizer',
    elapsedSec: Math.round((Date.now() - normStart) / 1000),
    meta: {
      summary: normalizerDecision?.summary ?? 'skipped (capabilities < 2)',
      capabilityAliases: normalizerDecision ? Object.keys(normalizerDecision.capabilityAliases).length : 0,
      domainAliases: normalizerDecision ? Object.keys(normalizerDecision.domainAliases).length : 0,
    },
  });

  if (signal?.aborted) throw new Error('aborted');

  // 3. Grouper (pure)
  emit({ type: 'agent-start', agent: 'grouper' });
  const groupStart = Date.now();
  const grouperResult = group(registry, glossary);
  emit({
    type: 'agent-done',
    agent: 'grouper',
    elapsedSec: Math.round((Date.now() - groupStart) / 1000),
    meta: {
      itemCount: grouperResult.items.length,
      clusterCount: grouperResult.items.filter((i) => i.kind !== 'standalone').length,
      standaloneCount: grouperResult.items.filter((i) => i.kind === 'standalone').length,
      untaggedCount: grouperResult.untaggedCount,
    },
  });

  if (signal?.aborted) throw new Error('aborted');

  // 4. Writer (per-item, parallel)
  emit({ type: 'agent-start', agent: 'writer', total: grouperResult.items.length });
  const writeStart = Date.now();
  const writerProvider = await getProvider(opts.writerProvider);
  const items = await writeAllProse(grouperResult.items, {
    provider: writerProvider,
    model: opts.writerModel,
    concurrency: 4,
    signal,
    onProgress: (p) => emit({
      type: 'agent-progress',
      agent: 'writer',
      done: p.written,
      total: p.total,
      current: p.current ? `${p.current.kind}: ${p.current.capability}` : undefined,
    }),
  });
  emit({
    type: 'agent-done',
    agent: 'writer',
    elapsedSec: Math.round((Date.now() - writeStart) / 1000),
    meta: { itemCount: items.length },
  });

  emit({ type: 'complete', items });
  return items;
}
