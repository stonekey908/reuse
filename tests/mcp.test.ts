import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReuseServer } from '../src/mcp/server';
import { saveRegistry } from '../src/shared/registry';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('MCP Server', () => {
  const testDir = path.join(os.tmpdir(), 'reuse-mcp-test-' + Date.now());
  const projectDir = path.join(testDir, 'sample-project');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.REUSE_HOME = testDir;

    // Create a sample project to reference
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'upload.ts'),
      'export function uploadFile(file: File) { /* chunked upload */ }'
    );
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'sample-project', version: '1.0.0' })
    );

    saveRegistry({
      projects: {
        'sample-project': {
          path: projectDir,
          description: 'A sample project for testing',
          tags: ['typescript', 'upload'],
          patterns: { 'file-upload': 'Chunked file upload with progress' },
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
});
