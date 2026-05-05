import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';
import { ABSTRACTION_LEVELS } from './types.js';

/**
 * The glossary persists at ~/.reuse/glossary.json (or $REUSE_HOME/glossary.json).
 *
 * - `domains` and `capabilities` are the canonical lists. The Tagger agent picks
 *   from these by default and may propose additions.
 * - `aliases` records merges decided by the Glossary Normalizer agent (e.g.
 *   `pwa-companion` → `frontend-web`). Lookup is `aliases.domain[<input>]` returning
 *   the canonical slug, undefined if no alias.
 * - The user may hand-edit this file. Plain-file authority.
 */
export const GlossarySchema = z.object({
  domains: z.array(z.string()),
  capabilities: z.array(z.string()),
  aliases: z.object({
    domain: z.record(z.string(), z.string()).default({}),
    capability: z.record(z.string(), z.string()).default({}),
  }).default({ domain: {}, capability: {} }),
}).passthrough();

export type Glossary = z.infer<typeof GlossarySchema>;

/**
 * Starter domain list, derived from the user's actual 70-pattern registry.
 * Marked as the seed, not the ceiling: the Tagger may propose new ones; the
 * Glossary Normalizer agent decides whether to merge or accept as canonical.
 */
export const STARTER_DOMAINS = [
  'frontend-web',
  'frontend-mobile',
  'frontend-native',
  'backend-api',
  'backend-data',
  'ai-integration',
  'build-tooling',
  'dev-tooling',
  'infra-system',
  'design-system',
  'design-spec',
  'testing-discipline',
  'docs-content',
  'distribution',
] as const;

export const STARTER_CAPABILITIES: string[] = [];

export { ABSTRACTION_LEVELS };

export function getGlossaryDir(): string {
  return process.env.REUSE_HOME || path.join(os.homedir(), '.reuse');
}

export function getGlossaryPath(): string {
  return path.join(getGlossaryDir(), 'glossary.json');
}

export function defaultGlossary(): Glossary {
  return {
    domains: [...STARTER_DOMAINS],
    capabilities: [...STARTER_CAPABILITIES],
    aliases: { domain: {}, capability: {} },
  };
}

export function loadGlossary(): Glossary {
  const filePath = getGlossaryPath();
  if (!fs.existsSync(filePath)) return defaultGlossary();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const result = GlossarySchema.safeParse(raw);
    if (result.success) return result.data;
    console.warn(`[reuse] glossary failed to parse, using starter defaults. ${result.error.issues.length} validation issue(s).`);
    return defaultGlossary();
  } catch (err) {
    console.warn(`[reuse] glossary read error, using starter defaults: ${err instanceof Error ? err.message : String(err)}`);
    return defaultGlossary();
  }
}

export function saveGlossary(glossary: Glossary): void {
  const dir = getGlossaryDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getGlossaryPath(), JSON.stringify(glossary, null, 2));
}

/**
 * Returns the canonical slug for a domain. Applies aliases first, then accepts
 * as canonical if already in the list, otherwise returns the input unchanged
 * (Tagger will surface unknown slugs to the Normalizer for merge decisions).
 */
export function canonicalDomain(glossary: Glossary, slug: string): string {
  const aliased = glossary.aliases.domain[slug];
  if (aliased) return aliased;
  return slug;
}

export function canonicalCapability(glossary: Glossary, slug: string): string {
  const aliased = glossary.aliases.capability[slug];
  if (aliased) return aliased;
  return slug;
}

/**
 * Records a new domain proposal in the glossary. The Normalizer agent decides
 * later whether it stays canonical or gets aliased to an existing one.
 */
export function recordDomainProposal(glossary: Glossary, slug: string): Glossary {
  if (glossary.domains.includes(slug)) return glossary;
  if (glossary.aliases.domain[slug]) return glossary;
  return { ...glossary, domains: [...glossary.domains, slug] };
}

export function recordCapabilityProposal(glossary: Glossary, slug: string): Glossary {
  if (glossary.capabilities.includes(slug)) return glossary;
  if (glossary.aliases.capability[slug]) return glossary;
  return { ...glossary, capabilities: [...glossary.capabilities, slug] };
}
