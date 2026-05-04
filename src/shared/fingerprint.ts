import { createHash } from 'crypto';
import type { Registry } from './types.js';

function canonicalize(registry: Registry): string {
  const projectNames = Object.keys(registry.projects).sort();
  const canonical: Record<string, Record<string, string>> = {};
  for (const name of projectNames) {
    const project = registry.projects[name];
    const patterns = project.patterns ?? {};
    const patternKeys = Object.keys(patterns).sort();
    const sortedPatterns: Record<string, string> = {};
    for (const key of patternKeys) {
      sortedPatterns[key] = patterns[key];
    }
    canonical[name] = sortedPatterns;
  }
  return JSON.stringify(canonical);
}

export function computeRegistryFingerprint(registry: Registry): string {
  return createHash('sha256').update(canonicalize(registry)).digest('hex');
}
