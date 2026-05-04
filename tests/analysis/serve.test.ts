import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Server } from 'http';
import { createApp } from '../../src/cli/serve';
import { saveRegistry } from '../../src/shared/registry';
import { ClaudeNotFoundError } from '../../src/analysis/runner';
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

const validResponse = JSON.stringify({ clusters: sampleClusters });

const baseRegistry: Registry = {
  projects: {
    foo: { path: '/tmp/foo', patterns: { upload: 'queue with retry' } },
    bar: { path: '/tmp/bar', patterns: { state: 'XState flow' } },
  },
};

async function startTestServer(runner: (prompt: string) => Promise<string>): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const app = createApp({ runner, serveStatic: false });
  return new Promise((resolve) => {
    const server: Server = app.listen(0, () => {
      const address = server.address();
      if (typeof address === 'string' || !address) {
        throw new Error('unexpected address');
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      resolve({
        baseUrl,
        close: () =>
          new Promise<void>((closeResolve, closeReject) => {
            server.close((err) => (err ? closeReject(err) : closeResolve()));
          }),
      });
    });
  });
}

describe('analysis endpoints', () => {
  const testDir = path.join(os.tmpdir(), 'reuse-serve-test-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.REUSE_HOME = testDir;
    saveRegistry(baseRegistry);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.REUSE_HOME;
  });

  it('GET /api/analysis returns null + stale=true when no analysis cached', async () => {
    const { baseUrl, close } = await startTestServer(async () => validResponse);
    try {
      const res = await fetch(`${baseUrl}/api/analysis`);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.analysis).toBeNull();
      expect(body.stale).toBe(true);
    } finally {
      await close();
    }
  });

  it('POST /api/analysis/run runs analysis, caches it, returns clusters', async () => {
    const { baseUrl, close } = await startTestServer(async () => validResponse);
    try {
      const res = await fetch(`${baseUrl}/api/analysis/run`, { method: 'POST' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.analysis.clusters).toHaveLength(1);
      expect(body.analysis.clusters[0].capability).toBe('Document upload');
      expect(body.stale).toBe(false);

      const after = await fetch(`${baseUrl}/api/analysis`).then((r) => r.json());
      expect(after.stale).toBe(false);
      expect(after.analysis.clusters[0].capability).toBe('Document upload');
    } finally {
      await close();
    }
  });

  it('GET /api/analysis flags stale=true with changedProjects after a pattern edit', async () => {
    const { baseUrl, close } = await startTestServer(async () => validResponse);
    try {
      await fetch(`${baseUrl}/api/analysis/run`, { method: 'POST' });

      const modified: Registry = {
        projects: {
          ...baseRegistry.projects,
          foo: { path: '/tmp/foo', patterns: { upload: 'totally different now' } },
        },
      };
      saveRegistry({ ...modified, analysis: JSON.parse(fs.readFileSync(path.join(testDir, 'registry.json'), 'utf-8')).analysis });

      const res = await fetch(`${baseUrl}/api/analysis`);
      const body = await res.json();
      expect(body.stale).toBe(true);
      expect(body.changedProjects).toEqual({ added: [], removed: [], changed: ['foo'] });
    } finally {
      await close();
    }
  });

  it('POST /api/analysis/run returns 500 with CLAUDE_NOT_FOUND when claude is missing', async () => {
    const { baseUrl, close } = await startTestServer(async () => {
      throw new ClaudeNotFoundError();
    });
    try {
      const res = await fetch(`${baseUrl}/api/analysis/run`, { method: 'POST' });
      const body = await res.json();
      expect(res.status).toBe(500);
      expect(body.code).toBe('CLAUDE_NOT_FOUND');
      expect(body.hint).toContain('claude.com/claude-code');
    } finally {
      await close();
    }
  });

  it('POST /api/analysis/run returns 502 with raw output when JSON parse fails twice', async () => {
    const { baseUrl, close } = await startTestServer(async () => 'definitely not json');
    try {
      const res = await fetch(`${baseUrl}/api/analysis/run`, { method: 'POST' });
      const body = await res.json();
      expect(res.status).toBe(502);
      expect(body.code).toBe('JSON_PARSE_FAILED');
      expect(body.rawOutput).toBe('definitely not json');
    } finally {
      await close();
    }
  });
});
