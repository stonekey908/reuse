import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getStaleness, writeAnalysis } from '../../src/analysis/cache';
import { loadRegistry } from '../../src/shared/registry';
import type { Cluster, Registry } from '../../src/shared/types';

const sampleClusters: Cluster[] = [
  {
    capability: 'Document upload',
    description: 'Cross-project upload pipelines',
    members: [{ project: 'foo', patternKey: 'upload', summary: 'queue with retry' }],
    similarities: 'Both surface progress.',
    differences: 'foo retries.',
  },
];

const baseRegistry: Registry = {
  projects: {
    foo: { path: '/tmp/foo', patterns: { upload: { description: 'queue with retry', fileEvidence: [] } } },
    bar: { path: '/tmp/bar', patterns: { state: { description: 'XState flow', fileEvidence: [] } } },
  },
};

describe('writeAnalysis', () => {
  const testDir = path.join(os.tmpdir(), 'reuse-cache-test-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.REUSE_HOME = testDir;
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.REUSE_HOME;
  });

  it('persists analysis to the registry on disk', () => {
    writeAnalysis(baseRegistry, sampleClusters);
    const reloaded = loadRegistry();
    expect(reloaded.analysis).toBeDefined();
    expect(reloaded.analysis!.clusters).toHaveLength(1);
    expect(reloaded.analysis!.clusters[0].capability).toBe('Document upload');
  });

  it('populates generatedAt with an ISO timestamp', () => {
    const before = Date.now();
    const updated = writeAnalysis(baseRegistry, sampleClusters);
    const after = Date.now();
    const t = Date.parse(updated.analysis!.generatedAt);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it('populates per-project fingerprints for every project', () => {
    const updated = writeAnalysis(baseRegistry, sampleClusters);
    const fingerprints = updated.analysis!.projectFingerprints;
    expect(Object.keys(fingerprints).sort()).toEqual(['bar', 'foo']);
    expect(fingerprints.foo).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprints.bar).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprints.foo).not.toBe(fingerprints.bar);
  });
});

describe('getStaleness', () => {
  it('returns stale=true when no analysis exists', () => {
    const result = getStaleness(baseRegistry);
    expect(result.stale).toBe(true);
    expect(result.cachedFingerprint).toBeUndefined();
    expect(result.changedProjects).toBeUndefined();
  });

  it('returns stale=false when fingerprint matches cached', () => {
    const cached = withCachedAnalysis(baseRegistry);
    const result = getStaleness(cached);
    expect(result.stale).toBe(false);
    expect(result.changedProjects).toBeUndefined();
  });

  it('flags an added project', () => {
    const cached = withCachedAnalysis(baseRegistry);
    const modified: Registry = {
      ...cached,
      projects: {
        ...cached.projects,
        baz: { path: '/tmp/baz', patterns: { 'new-thing': { description: 'something', fileEvidence: [] } } },
      },
    };
    const result = getStaleness(modified);
    expect(result.stale).toBe(true);
    expect(result.changedProjects).toEqual({ added: ['baz'], removed: [], changed: [] });
  });

  it('flags a removed project', () => {
    const cached = withCachedAnalysis(baseRegistry);
    const { bar: _bar, ...rest } = cached.projects;
    const modified: Registry = { ...cached, projects: rest };
    const result = getStaleness(modified);
    expect(result.changedProjects).toEqual({ added: [], removed: ['bar'], changed: [] });
  });

  it('flags a changed project (pattern edited)', () => {
    const cached = withCachedAnalysis(baseRegistry);
    const modified: Registry = {
      ...cached,
      projects: {
        ...cached.projects,
        foo: { ...cached.projects.foo, patterns: { upload: { description: 'completely different', fileEvidence: [] } } },
      },
    };
    const result = getStaleness(modified);
    expect(result.changedProjects).toEqual({ added: [], removed: [], changed: ['foo'] });
  });

  it('flags multiple changes across categories at once', () => {
    const cached = withCachedAnalysis(baseRegistry);
    const modified: Registry = {
      ...cached,
      projects: {
        foo: { ...cached.projects.foo, patterns: { upload: { description: 'edited', fileEvidence: [] } } },
        baz: { path: '/tmp/baz', patterns: { k: { description: 'v', fileEvidence: [] } } },
      },
    };
    const result = getStaleness(modified);
    expect(result.changedProjects).toEqual({
      added: ['baz'],
      removed: ['bar'],
      changed: ['foo'],
    });
  });

  it('does not flag projects when only description/tags/links change', () => {
    const cached = withCachedAnalysis(baseRegistry);
    const modified: Registry = {
      ...cached,
      projects: {
        ...cached.projects,
        foo: {
          ...cached.projects.foo,
          description: 'edited description',
          tags: ['new', 'tags'],
          links: { github: 'https://example.com' },
        },
      },
    };
    const result = getStaleness(modified);
    expect(result.stale).toBe(false);
  });
});

function withCachedAnalysis(registry: Registry): Registry {
  const testDir = path.join(os.tmpdir(), 'reuse-cache-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(testDir, { recursive: true });
  const original = process.env.REUSE_HOME;
  process.env.REUSE_HOME = testDir;
  try {
    const updated = writeAnalysis(registry, sampleClusters);
    return updated;
  } finally {
    fs.rmSync(testDir, { recursive: true, force: true });
    if (original) process.env.REUSE_HOME = original;
    else delete process.env.REUSE_HOME;
  }
}
