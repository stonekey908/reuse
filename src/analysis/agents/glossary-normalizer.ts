import { z } from 'zod';
import { stripCodeFences } from '../runner.js';
import type { Glossary } from '../../shared/glossary.js';
import type { Provider } from '../providers/index.js';
import type { PatternEntry } from '../grouper.js';

export const NormalizerDecisionSchema = z.object({
  /** Aliases to add: { from: 'doc-upload', to: 'document-upload' } */
  capabilityAliases: z.record(z.string(), z.string()).default({}),
  domainAliases: z.record(z.string(), z.string()).default({}),
  /** Slugs that should remain canonical (no merge). May be empty. */
  keepCapabilities: z.array(z.string()).default([]),
  keepDomains: z.array(z.string()).default([]),
  /** ≤30-word summary of the merges + reasoning, surfaced in the report. */
  summary: z.string().max(400),
});

export type NormalizerDecision = z.infer<typeof NormalizerDecisionSchema>;

function patternsForCapability(entries: PatternEntry[], capability: string): string[] {
  return entries
    .filter((e) => e.pattern.capability === capability)
    .map((e) => `${e.project}/${e.patternKey}: ${e.pattern.description.slice(0, 90)}`)
    .slice(0, 4);
}

export function buildNormalizerPrompt(glossary: Glossary, entries: PatternEntry[]): string {
  const capabilityRows = glossary.capabilities.map((c) => {
    const examples = patternsForCapability(entries, c);
    return `  - "${c}": ${examples.length} pattern(s)\n${examples.map((e) => `      • ${e}`).join('\n')}`;
  }).join('\n');

  const domainRows = glossary.domains.map((d) => `  - "${d}"`).join('\n');

  return `You are the Glossary Normalizer. The Tagger ran in parallel and proposed many capability/domain slugs without seeing each other's choices, so the canonical list now contains likely synonyms and overly broad slugs. Your job: decide which slugs to alias to a canonical, which to drop, and which to keep as is. Conservative bias — only merge when the underlying capability is clearly the same.

CURRENT CAPABILITY LIST (with sample patterns assigned to each):
${capabilityRows}

CURRENT DOMAIN LIST:
${domainRows}

Rules:
- A slug should be ALIASED to another when the underlying capability is the same and one is just a different phrasing (e.g. "doc-upload" → "document-upload"). Use the more specific / standard name as canonical.
- A slug is too BROAD when patterns assigned to it have unrelated user-facing problems. If "background-data-sync" has SSE broadcasting, permission queues, file syncing, and pending-response storage all under it, it's too broad — but you cannot fix this here. Note the over-broadness in the summary so the user knows; do NOT alias unrelated slugs together.
- KEEP all slugs that are well-formed unique capabilities — they go into "keepCapabilities".
- Alias map format: { "<duplicate or variant>": "<canonical kept slug>" }. The "to" slug must be in "keepCapabilities" (or already canonical).

Return strict JSON, no markdown fences:
{
  "capabilityAliases": { "alias-slug": "canonical-slug", ... },
  "domainAliases": { "alias-slug": "canonical-slug", ... },
  "keepCapabilities": [ "canonical-slug", ... ],
  "keepDomains": [ "canonical-slug", ... ],
  "summary": "≤30-word summary of what you merged and any concerns about over-broad slugs"
}`;
}

export function parseNormalizerDecision(raw: string): NormalizerDecision {
  const cleaned = stripCodeFences(raw);
  return NormalizerDecisionSchema.parse(JSON.parse(cleaned));
}

export async function normalizeGlossary(
  provider: Provider,
  glossary: Glossary,
  entries: PatternEntry[],
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<{ updated: Glossary; decision: NormalizerDecision }> {
  const prompt = buildNormalizerPrompt(glossary, entries);
  const raw = await provider.complete(prompt, { model: opts.model, signal: opts.signal });
  const decision = parseNormalizerDecision(raw);

  // Apply: aliases get added, keep* lists become the canonical lists.
  const newCapabilityAliases = { ...glossary.aliases.capability, ...decision.capabilityAliases };
  const newDomainAliases = { ...glossary.aliases.domain, ...decision.domainAliases };

  // Canonical list = explicit keep list, dropping any that are now aliased.
  const keptCaps = decision.keepCapabilities.length > 0
    ? decision.keepCapabilities.filter((c) => !newCapabilityAliases[c])
    : glossary.capabilities.filter((c) => !newCapabilityAliases[c]);
  const keptDoms = decision.keepDomains.length > 0
    ? decision.keepDomains.filter((d) => !newDomainAliases[d])
    : glossary.domains.filter((d) => !newDomainAliases[d]);

  const updated: Glossary = {
    ...glossary,
    capabilities: Array.from(new Set(keptCaps)).sort(),
    domains: Array.from(new Set(keptDoms)).sort(),
    aliases: {
      capability: newCapabilityAliases,
      domain: newDomainAliases,
    },
  };

  return { updated, decision };
}
