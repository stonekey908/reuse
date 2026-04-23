import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReuseServer } from '../src/mcp/server';
import { saveRegistry } from '../src/shared/registry';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

describe('MCP Server', () => {
  const testDir = path.join(os.tmpdir(), 'reuse-mcp-test-' + Date.now());
  const projectDir = path.join(testDir, 'sample-project');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.REUSE_HOME = testDir;

    // Create a sample project with enough shape for extract_patterns to chew on
    fs.mkdirSync(path.join(projectDir, 'src', 'upload'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'src', 'lib'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'upload', 'chunked.ts'),
      `// Chunked uploader with retry + progress.
// Splits files into 2MB chunks, retries failed chunks 3 times with backoff.
export async function uploadFile(file: File, opts: { onProgress?: (pct: number) => void } = {}) {
  const CHUNK = 2 * 1024 * 1024;
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const slice = file.slice(offset, offset + CHUNK);
    await fetch('/upload', { method: 'POST', body: slice });
    opts.onProgress?.(Math.round((offset + CHUNK) / file.size * 100));
  }
}
`
    );
    fs.writeFileSync(
      path.join(projectDir, 'src', 'lib', 'retry.ts'),
      `// Exponential backoff utility used throughout the app.
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { if (i === attempts - 1) throw e; await new Promise(r => setTimeout(r, 2 ** i * 100)); }
  }
  throw new Error('unreachable');
}
`
    );
    fs.writeFileSync(
      path.join(projectDir, 'README.md'),
      `# Sample Project

A demo of chunked file uploads with retry logic.

## Features
- Chunked upload
- Exponential-backoff retry
- Progress callback
`
    );
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({
        name: 'sample-project',
        version: '1.0.0',
        scripts: { build: 'tsc' },
        dependencies: { typescript: '^5.0.0' },
      }, null, 2)
    );

    saveRegistry({
      projects: {
        'sample-project': {
          path: projectDir,
          description: 'A sample project for testing',
          tags: ['typescript', 'upload'],
          patterns: {},
          links: {},
        },
      },
    });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.REUSE_HOME;
  });

  it('creates a server instance', () => {
    const server = createReuseServer();
    expect(server).toBeDefined();
  });

  async function wireUpClient() {
    const server = createReuseServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
    return { client, server };
  }

  it('exposes the extract_patterns tool', async () => {
    const { client } = await wireUpClient();
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain('extract_patterns');
    expect(names).toContain('register_project');
    expect(names).toContain('update_project');
  });

  it('extract_patterns returns a scouting report', async () => {
    const { client } = await wireUpClient();

    const result = await client.callTool({
      name: 'extract_patterns',
      arguments: { name: 'sample-project' },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ text: string }>)[0].text;
    const report = JSON.parse(text);

    // Basic project metadata echoed
    expect(report.project.name).toBe('sample-project');
    expect(report.project.path).toBe(projectDir);

    // README excerpt captured
    expect(report.readme.filename).toBe('README.md');
    expect(report.readme.excerpt).toContain('Chunked upload');

    // package.json parsed
    expect(report.packageJson.name).toBe('sample-project');
    expect(report.packageJson.scripts.build).toBe('tsc');

    // Tree includes src/
    expect(report.directoryTree).toContain('src/');
    expect(report.directoryTree).toContain('upload/');
    expect(report.directoryTree).toContain('chunked.ts');

    // Suggested files are source files under src/
    expect(Array.isArray(report.suggestedFilesToRead)).toBe(true);
    expect(report.suggestedFilesToRead.some((p: string) => p.includes('upload/chunked.ts'))).toBe(true);
    expect(report.suggestedFilesToRead.some((p: string) => p.includes('lib/retry.ts'))).toBe(true);

    // Instructions present to guide the AI
    expect(Array.isArray(report.instructions)).toBe(true);
    expect(report.instructions.length).toBeGreaterThan(3);
    expect(report.instructions.join('\n')).toContain('update_project');
  });

  it('extract_patterns errors gracefully for unknown project', async () => {
    const { client } = await wireUpClient();
    const result = await client.callTool({
      name: 'extract_patterns',
      arguments: { name: 'does-not-exist' },
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('not found');
  });

  it('register_project nudges the AI toward extract_patterns when none supplied', async () => {
    const { client } = await wireUpClient();

    // Create a fresh path for this test
    const newProjectDir = path.join(testDir, 'another-project');
    fs.mkdirSync(newProjectDir, { recursive: true });

    const result = await client.callTool({
      name: 'register_project',
      arguments: {
        name: 'another-project',
        projectPath: newProjectDir,
        description: 'Demo without patterns',
      },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).toContain('extract_patterns');
  });

  it('register_project does NOT nudge when patterns are supplied', async () => {
    const { client } = await wireUpClient();

    const newProjectDir = path.join(testDir, 'with-patterns');
    fs.mkdirSync(newProjectDir, { recursive: true });

    const result = await client.callTool({
      name: 'register_project',
      arguments: {
        name: 'with-patterns',
        projectPath: newProjectDir,
        description: 'Already has patterns',
        patterns: { 'chunked-upload': 'Chunked uploads with retry' },
      },
    });

    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text).not.toContain('extract_patterns');
  });
});
