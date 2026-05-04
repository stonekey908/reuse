import { describe, it, expect } from 'vitest';
import { computeRegistryFingerprint } from '../src/shared/fingerprint';
import type { Registry } from '../src/shared/types';

const baseRegistry: Registry = {
  projects: {
    foo: {
      path: '/tmp/foo',
      description: 'Foo app',
      tags: ['react'],
      patterns: {
        'auth-flow': 'JWT auth with refresh tokens',
        'upload-queue': 'Visible upload queue with retry',
      },
      links: {},
    },
    bar: {
      path: '/tmp/bar',
      description: 'Bar app',
      tags: [],
      patterns: {
        'state-machine': 'XState-driven UI flow',
      },
      links: {},
    },
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

describe('computeRegistryFingerprint', () => {
  it('is deterministic across runs', () => {
    const a = computeRegistryFingerprint(baseRegistry);
    const b = computeRegistryFingerprint(baseRegistry);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is independent of project insertion order', () => {
    const reordered: Registry = {
      projects: {
        bar: baseRegistry.projects.bar,
        foo: baseRegistry.projects.foo,
      },
    };
    expect(computeRegistryFingerprint(reordered)).toBe(
      computeRegistryFingerprint(baseRegistry),
    );
  });

  it('is independent of pattern key insertion order', () => {
    const reordered = clone(baseRegistry);
    reordered.projects.foo.patterns = {
      'upload-queue': 'Visible upload queue with retry',
      'auth-flow': 'JWT auth with refresh tokens',
    };
    expect(computeRegistryFingerprint(reordered)).toBe(
      computeRegistryFingerprint(baseRegistry),
    );
  });

  it('changes when a pattern is added', () => {
    const modified = clone(baseRegistry);
    modified.projects.foo.patterns!['new-pattern'] = 'Something new';
    expect(computeRegistryFingerprint(modified)).not.toBe(
      computeRegistryFingerprint(baseRegistry),
    );
  });

  it('changes when a pattern is removed', () => {
    const modified = clone(baseRegistry);
    delete modified.projects.foo.patterns!['upload-queue'];
    expect(computeRegistryFingerprint(modified)).not.toBe(
      computeRegistryFingerprint(baseRegistry),
    );
  });

  it("changes when a pattern's description is edited", () => {
    const modified = clone(baseRegistry);
    modified.projects.foo.patterns!['auth-flow'] = 'OAuth2 with PKCE';
    expect(computeRegistryFingerprint(modified)).not.toBe(
      computeRegistryFingerprint(baseRegistry),
    );
  });

  it('changes when a new project is registered', () => {
    const modified = clone(baseRegistry);
    modified.projects.baz = {
      path: '/tmp/baz',
      description: 'New',
      tags: [],
      patterns: { foo: 'bar' },
      links: {},
    };
    expect(computeRegistryFingerprint(modified)).not.toBe(
      computeRegistryFingerprint(baseRegistry),
    );
  });

  it('does NOT change when only description, tags, links, or git change', () => {
    const baseline = computeRegistryFingerprint(baseRegistry);

    const descChanged = clone(baseRegistry);
    descChanged.projects.foo.description = 'Totally different description';
    expect(computeRegistryFingerprint(descChanged)).toBe(baseline);

    const tagsChanged = clone(baseRegistry);
    tagsChanged.projects.foo.tags = ['react', 'mobile', 'new-tag'];
    expect(computeRegistryFingerprint(tagsChanged)).toBe(baseline);

    const linksChanged = clone(baseRegistry);
    linksChanged.projects.foo.links = { github: 'https://example.com' };
    expect(computeRegistryFingerprint(linksChanged)).toBe(baseline);

    const gitChanged = clone(baseRegistry);
    gitChanged.projects.foo.git = 'https://github.com/example/foo';
    expect(computeRegistryFingerprint(gitChanged)).toBe(baseline);
  });

  it('handles a project with no patterns field', () => {
    const registry: Registry = {
      projects: {
        empty: { path: '/tmp/empty', description: '', tags: [], links: {} },
      },
    };
    const hash = computeRegistryFingerprint(registry);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles an empty registry', () => {
    expect(computeRegistryFingerprint({ projects: {} })).toMatch(/^[a-f0-9]{64}$/);
  });
});
