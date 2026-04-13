#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createReuseServer } from './server.js';

async function main() {
  const server = createReuseServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[reuse-mcp] Server running on stdio');
}

main().catch((err) => {
  console.error(`[reuse-mcp] Fatal: ${err}`);
  process.exit(1);
});
