import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProjectSchema, RegistrySchema } from '../src/shared/types';
import { loadRegistry, saveRegistry } from '../src/shared/registry';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Registry Types', () => {
  it('validates a valid project', () => {
    const project = {
      path: '/Users/test/my-app',
      description: 'A test application',
      tags: ['react', 'typescript'],
      patterns: {
        auth: 'JWT-based authentication with refresh tokens',
      },
      git: 'https://github.com/test/my-app',
      links: {
        linear: 'https://linear.app/team/project/MY-APP',
      },
    };
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('validates a minimal project (only path required)', () => {
    const project = { path: '/Users/test/my-app' };
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('rejects a project without path', () => {
    const project = { description: 'No path' };
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it('validates a full registry', () => {
    const registry = {
      projects: {
        'my-app': {
          path: '/Users/test/my-app',
          description: 'A test app',
          tags: [],
          patterns: {},
        },
      },
    };
    expect(RegistrySchema.safeParse(registry).success).toBe(true);
  });

  it('validates an empty registry', () => {
    const registry = { projects: {} };
    expect(RegistrySchema.safeParse(registry).success).toBe(true);
  });

  it('validates a registry without an analysis field (no migration needed)', () => {
    const registry = {
      projects: {
        foo: { path: '/tmp/foo', patterns: { auth: 'JWT' } },
      },
    };
    expect(RegistrySchema.safeParse(registry).success).toBe(true);
  });

  it('validates a registry with a populated analysis field', () => {
    const registry = {
      projects: {
        foo: { path: '/tmp/foo', patterns: { auth: 'JWT' } },
      },
      analysis: {
        generatedAt: '2026-05-04T12:00:00.000Z',
        registryFingerprint: 'a'.repeat(64),
        projectFingerprints: { foo: 'b'.repeat(64) },
        clusters: [
          {
            capability: 'Authentication',
            description: 'Auth flows across projects',
            members: [{ project: 'foo', patternKey: 'auth', summary: 'JWT' }],
            similarities: 'Both use tokens.',
            differences: 'One is JWT, other is session.',
          },
        ],
      },
    };
    expect(RegistrySchema.safeParse(registry).success).toBe(true);
  });

  it('validates an analysis with a mix of cluster and standalone items', () => {
    const registry = {
      projects: { foo: { path: '/tmp/foo', patterns: { a: 'A', b: 'B' } } },
      analysis: {
        generatedAt: '2026-05-04T12:00:00.000Z',
        registryFingerprint: 'a'.repeat(64),
        projectFingerprints: { foo: 'b'.repeat(64) },
        clusters: [
          {
            kind: 'cluster',
            capability: 'Multi A',
            description: 'two of a thing',
            members: [
              { project: 'foo', patternKey: 'a', summary: 'one' },
              { project: 'foo', patternKey: 'b', summary: 'two' },
            ],
            similarities: 'similar',
            differences: 'different',
          },
          {
            kind: 'standalone',
            capability: 'Lonely',
            description: 'one of a kind',
            member: { project: 'foo', patternKey: 'a', summary: 'lonely' },
            rationale: 'no peers',
            closestRelative: 'no relatives in registry',
          },
        ],
      },
    };
    expect(RegistrySchema.safeParse(registry).success).toBe(true);
  });

  it('auto-upgrades legacy string-shape patterns to the structured Pattern object', () => {
    // A registry written by the OLD code uses `patterns: Record<string, string>`.
    // The schema's z.preprocess wraps each string into the structured Pattern shape.
    const legacy = {
      projects: {
        foo: { path: '/tmp/foo', patterns: { 'auth-flow': 'JWT auth' } },
      },
    };
    const parsed = RegistrySchema.parse(legacy);
    const pattern = parsed.projects.foo.patterns?.['auth-flow'];
    expect(pattern).toBeDefined();
    expect(pattern!.description).toBe('JWT auth');
    expect(pattern!.fileEvidence).toEqual([]);
    expect(pattern!.capability).toBeUndefined();
  });

  it('accepts the new structured Pattern shape with capability tags', () => {
    const tagged = {
      projects: {
        foo: {
          path: '/tmp/foo',
          patterns: {
            'auth-flow': {
              description: 'JWT auth',
              capability: 'authentication',
              abstractionLevel: 'feature',
              domain: 'frontend-web',
              fileEvidence: ['/src/auth.ts'],
            },
          },
        },
      },
    };
    const parsed = RegistrySchema.parse(tagged);
    const pattern = parsed.projects.foo.patterns?.['auth-flow'];
    expect(pattern?.capability).toBe('authentication');
    expect(pattern?.abstractionLevel).toBe('feature');
    expect(pattern?.domain).toBe('frontend-web');
    expect(pattern?.fileEvidence).toEqual(['/src/auth.ts']);
  });

  it('rejects a Pattern with an unknown abstractionLevel', () => {
    const bad = {
      projects: {
        foo: { path: '/tmp/foo', patterns: { x: { description: 'x', abstractionLevel: 'bogus' } } },
      },
    };
    expect(RegistrySchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a standalone item missing rationale or closestRelative', () => {
    const registry = {
      projects: { foo: { path: '/tmp/foo' } },
      analysis: {
        generatedAt: '2026-05-04T12:00:00.000Z',
        registryFingerprint: 'a'.repeat(64),
        projectFingerprints: {},
        clusters: [
          {
            kind: 'standalone',
            capability: 'X',
            description: 'x',
            member: { project: 'foo', patternKey: 'a', summary: 's' },
            // missing rationale + closestRelative
          },
        ],
      },
    };
    expect(RegistrySchema.safeParse(registry).success).toBe(false);
  });
});

describe('Registry Read/Write', () => {
  const testDir = path.join(os.tmpdir(), 'reuse-test-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.REUSE_HOME = testDir;
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.REUSE_HOME;
  });

  it('returns empty registry when no file exists', () => {
    const registry = loadRegistry();
    expect(registry.projects).toEqual({});
  });

  it('saves and loads a registry', () => {
    const registry = {
      projects: {
        'test-app': {
          path: '/Users/test/app',
          description: 'Test',
          tags: ['react'],
          patterns: {},
          links: {},
        },
      },
    };
    saveRegistry(registry);
    const loaded = loadRegistry();
    expect(loaded.projects['test-app'].path).toBe('/Users/test/app');
    expect(loaded.projects['test-app'].tags).toEqual(['react']);
  });

  it('creates the directory if it does not exist', () => {
    const registry = { projects: {} };
    saveRegistry(registry);
    expect(fs.existsSync(path.join(testDir, 'registry.json'))).toBe(true);
  });
});
