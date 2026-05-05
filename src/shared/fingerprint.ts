import { createHash } from 'crypto';
import type { Project, Registry } from './types.js';

/**
 * Canonicalises a project's patterns for fingerprinting.
 * IMPORTANT: only the description participates in the hash. Tag fields
 * (capability, abstractionLevel, domain, fileEvidence) are intentionally
 * excluded so that backfilling tags onto an existing pattern does NOT
 * invalidate cached analyses — the underlying pattern semantic is
 * unchanged.
 */
function sortedPatterns(project: Project): Record<string, string> {
  const patterns = project.patterns ?? {};
  const sortedKeys = Object.keys(patterns).sort();
  const out: Record<string, string> = {};
  for (const key of sortedKeys) out[key] = patterns[key].description;
  return out;
}

export function computeProjectFingerprint(project: Project): string {
  return createHash('sha256').update(JSON.stringify(sortedPatterns(project))).digest('hex');
}

export function computeProjectFingerprints(registry: Registry): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of Object.keys(registry.projects).sort()) {
    out[name] = computeProjectFingerprint(registry.projects[name]);
  }
  return out;
}

export function computeRegistryFingerprint(registry: Registry): string {
  return createHash('sha256').update(JSON.stringify(computeProjectFingerprints(registry))).digest('hex');
}
