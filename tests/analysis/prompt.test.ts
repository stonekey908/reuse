import { describe, it, expect } from 'vitest';
import { buildPrompt, collectPatterns } from '../../src/analysis/prompt';
import type { Cluster, Registry } from '../../src/shared/types';

const registry: Registry = {
  projects: {
    bravo: {
      path: '/tmp/bravo',
      patterns: { 'foo': 'bravo foo', 'bar': 'bravo bar' },
    },
    alpha: {
      path: '/tmp/alpha',
      patterns: { 'baz': 'alpha baz' },
    },
  },
};

describe('collectPatterns', () => {
  it('returns patterns sorted by project then by key', () => {
    const result = collectPatterns(registry);
    expect(result).toEqual([
      { project: 'alpha', key: 'baz', description: 'alpha baz' },
      { project: 'bravo', key: 'bar', description: 'bravo bar' },
      { project: 'bravo', key: 'foo', description: 'bravo foo' },
    ]);
  });

  it('skips projects with no patterns', () => {
    const empty: Registry = {
      projects: { x: { path: '/tmp/x' } },
    };
    expect(collectPatterns(empty)).toEqual([]);
  });
});

describe('buildPrompt', () => {
  const patterns = collectPatterns(registry);

  it('includes every pattern in the body', () => {
    const prompt = buildPrompt({ patterns });
    expect(prompt).toContain('"project":"alpha"');
    expect(prompt).toContain('"key":"baz"');
    expect(prompt).toContain('"description":"alpha baz"');
    expect(prompt).toContain('"project":"bravo"');
    expect(prompt).toContain('"key":"bar"');
    expect(prompt).toContain('"key":"foo"');
  });

  it('includes pattern and project counts in the header', () => {
    const prompt = buildPrompt({ patterns });
    expect(prompt).toContain('3 patterns across 2 projects');
  });

  it('omits the prior-clusters section when none provided', () => {
    const prompt = buildPrompt({ patterns });
    expect(prompt).not.toContain('Previous clusters');
  });

  it('seeds the prior-clusters section when provided', () => {
    const priorClusters: Cluster[] = [
      {
        capability: 'Document upload',
        description: 'Patterns for uploading documents',
        members: [],
        similarities: '',
        differences: '',
      },
    ];
    const prompt = buildPrompt({ priorClusters, patterns });
    expect(prompt).toContain('Previous clusters');
    expect(prompt).toContain('"Document upload"');
    expect(prompt).toContain('Patterns for uploading documents');
  });

  it('adds the strict suffix only when strict mode is set', () => {
    const normal = buildPrompt({ patterns });
    const strict = buildPrompt({ patterns, strict: true });
    expect(normal).not.toContain('IMPORTANT');
    expect(strict).toContain('IMPORTANT');
    expect(strict).toContain('first character must be `{`');
  });
});
