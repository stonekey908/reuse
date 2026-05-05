import {
  computeProjectFingerprints,
  computeRegistryFingerprint,
} from '../shared/fingerprint.js';
import { saveRegistry } from '../shared/registry.js';
import type { AnalysisItem, Registry } from '../shared/types.js';

export type ChangedProjects = {
  added: string[];
  removed: string[];
  changed: string[];
};

export type StalenessResult = {
  stale: boolean;
  currentFingerprint: string;
  cachedFingerprint?: string;
  changedProjects?: ChangedProjects;
};

export type WriteMode = 'reset' | 'append';

export function writeAnalysis(registry: Registry, clusters: AnalysisItem[], mode: WriteMode = 'reset'): Registry {
  const merged = mode === 'append' && registry.analysis
    ? [...registry.analysis.clusters, ...clusters]
    : clusters;

  const updated: Registry = {
    ...registry,
    analysis: {
      generatedAt: new Date().toISOString(),
      registryFingerprint: computeRegistryFingerprint(registry),
      projectFingerprints: computeProjectFingerprints(registry),
      clusters: merged,
    },
  };
  saveRegistry(updated);
  return updated;
}

export function getStaleness(registry: Registry): StalenessResult {
  const currentFingerprint = computeRegistryFingerprint(registry);

  if (!registry.analysis) {
    return { stale: true, currentFingerprint };
  }

  const cachedFingerprint = registry.analysis.registryFingerprint;
  if (currentFingerprint === cachedFingerprint) {
    return { stale: false, currentFingerprint, cachedFingerprint };
  }

  const currentPerProject = computeProjectFingerprints(registry);
  const cachedPerProject = registry.analysis.projectFingerprints;

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const name of Object.keys(currentPerProject)) {
    if (!(name in cachedPerProject)) {
      added.push(name);
    } else if (currentPerProject[name] !== cachedPerProject[name]) {
      changed.push(name);
    }
  }
  for (const name of Object.keys(cachedPerProject)) {
    if (!(name in currentPerProject)) {
      removed.push(name);
    }
  }

  return {
    stale: true,
    currentFingerprint,
    cachedFingerprint,
    changedProjects: {
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort(),
    },
  };
}
