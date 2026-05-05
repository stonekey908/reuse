import { canonicalCapability, canonicalDomain, type Glossary } from '../shared/glossary.js';
import type {
  AbstractionLevel,
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
 * 3. Patterns are grouped by (canonicalCapability, abstractionLevel) tuple.
 * 4. A group becomes a cluster ONLY IF it has ≥2 members AND those members
 *    span ≥2 distinct projects. Otherwise each member becomes a standalone.
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

function distinctProjects(entries: PatternEntry[]): Set<string> {
  return new Set(entries.map((e) => e.project));
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

/** Builds a (capability, abstractionLevel) key for grouping. */
function groupKey(capability: string, level: AbstractionLevel): string {
  return `${capability}::${level}`;
}

export function group(registry: Registry, glossary: Glossary): GrouperResult {
  const all = collectTaggedPatterns(registry);
  const untagged: PatternEntry[] = [];
  const buckets = new Map<string, { capability: string; level: AbstractionLevel; entries: PatternEntry[] }>();

  for (const entry of all) {
    const { capability, abstractionLevel, domain } = entry.pattern;
    if (!capability || !abstractionLevel || !domain) {
      untagged.push(entry);
      continue;
    }
    const canonCap = canonicalCapability(glossary, capability);
    const canonDomain = canonicalDomain(glossary, domain);
    const key = groupKey(canonCap, abstractionLevel);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { capability: canonCap, level: abstractionLevel, entries: [] };
      buckets.set(key, bucket);
    }
    bucket.entries.push({
      ...entry,
      pattern: { ...entry.pattern, capability: canonCap, domain: canonDomain },
    });
  }

  const items: AnalysisItem[] = [];

  for (const bucket of buckets.values()) {
    const { capability, level, entries } = bucket;
    const projects = distinctProjects(entries);

    // Multi-member, ≥2 projects → cluster (Writer fills in prose later).
    if (entries.length >= 2 && projects.size >= 2) {
      items.push({
        kind: 'cluster',
        capability,
        description: `${capability} (${level})`, // placeholder; Writer overwrites
        members: entries.map(memberFromEntry),
        similarities: '',
        differences: '',
      });
      continue;
    }

    // Otherwise — single member or single project — emit standalones (one per entry).
    for (const e of entries) {
      items.push({
        kind: 'standalone',
        capability,
        description: `${capability} (${level})`, // placeholder; Writer overwrites
        member: memberFromEntry(e),
        rationale: '',
        closestRelative: '',
      });
    }
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
