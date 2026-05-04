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
