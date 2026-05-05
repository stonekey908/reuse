import { canonicalCapability, canonicalDomain, type Glossary } from '../shared/glossary.js';
import type {
  AnalysisItem,
  ClusterMember,
  Pattern,
  Registry,
} from '../shared/types.js';

/**
 * The Grouper takes a tagged registry + glossary and produces partially-filled
 * AnalysisItems (clusters + standalones). No LLM. No similarities/differences
 * prose yet — that's the Writer agent's job in the analyze pipeline.
 *
 * Grouping rules (enforced in code, not prose):
 * 1. Patterns with no capability tag are emitted as standalones with a
 *    "needs-tagging" rationale, so they're visible but flagged.
 * 2. Patterns are normalised through the glossary (alias resolution).
 * 3. Patterns are grouped by canonicalCapability ALONE. abstractionLevel is
 *    surfaced as metadata on each member, not as a grouping axis — splitting
 *    primitive-vs-feature for the same capability creates orphan standalones
 *    sharing a slug, which is more confusing than informative.
 * 4. A group becomes a cluster IF it has ≥2 members. Single-project clusters
 *    are valid signals (internal duplication is a real finding); they're
 *    surfaced but the prose can flag them. Singletons remain standalones.
 */

export interface PatternEntry {
  project: string;
  patternKey: string;
  pattern: Pattern;
}

export interface GrouperResult {
  items: AnalysisItem[];
  /** Untagged patterns surfaced as a separate count for the UI. */
  untaggedCount: number;
}

function memberFromEntry(e: PatternEntry): ClusterMember {
  return {
    project: e.project,
    patternKey: e.patternKey,
    summary: e.pattern.description,
  };
}

export function collectTaggedPatterns(registry: Registry): PatternEntry[] {
  const out: PatternEntry[] = [];
  for (const project of Object.keys(registry.projects).sort()) {
    const p = registry.projects[project];
    for (const patternKey of Object.keys(p.patterns ?? {}).sort()) {
      out.push({ project, patternKey, pattern: p.patterns![patternKey] });
    }
  }
  return out;
}

export function group(registry: Registry, glossary: Glossary): GrouperResult {
  const all = collectTaggedPatterns(registry);
  const untagged: PatternEntry[] = [];
  const buckets = new Map<string, { capability: string; entries: PatternEntry[] }>();

  for (const entry of all) {
    const { capability, abstractionLevel, domain } = entry.pattern;
    if (!capability || !abstractionLevel || !domain) {
      untagged.push(entry);
      continue;
    }
    const canonCap = canonicalCapability(glossary, capability);
    const canonDomain = canonicalDomain(glossary, domain);
    let bucket = buckets.get(canonCap);
    if (!bucket) {
      bucket = { capability: canonCap, entries: [] };
      buckets.set(canonCap, bucket);
    }
    bucket.entries.push({
      ...entry,
      pattern: { ...entry.pattern, capability: canonCap, domain: canonDomain },
    });
  }

  const items: AnalysisItem[] = [];

  for (const bucket of buckets.values()) {
    const { capability, entries } = bucket;

    // ≥2 members → cluster, regardless of project span. The Writer prose calls
    // out single-project clusters as internal-duplication findings.
    if (entries.length >= 2) {
      items.push({
        kind: 'cluster',
        capability,
        description: capability, // placeholder; Writer overwrites
        members: entries.map(memberFromEntry),
        similarities: '',
        differences: '',
      });
      continue;
    }

    // Singleton → standalone.
    const e = entries[0];
    items.push({
      kind: 'standalone',
      capability,
      description: capability, // placeholder; Writer overwrites
      member: memberFromEntry(e),
      rationale: '',
      closestRelative: '',
    });
  }

  // Untagged patterns — surface them as standalones with a clear flag so they're not invisible.
  for (const e of untagged) {
    items.push({
      kind: 'standalone',
      capability: e.pattern.capability ?? 'untagged',
      description: 'Pattern has not been tagged yet — run `reuse tag-patterns` to assign capability + abstractionLevel + domain.',
      member: memberFromEntry(e),
      rationale: 'Awaiting Tagger agent run.',
      closestRelative: 'Cannot compare without tags.',
    });
  }

  return { items, untaggedCount: untagged.length };
}
