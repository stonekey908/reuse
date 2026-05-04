// MCP server bundled inside the monorepo. Exposes the analyzer + graph engine to
// any Claude Code session over stdio.
//
// Pattern of interest: bundled-MCP-server — ship the MCP integration alongside
// the app rather than as a separate repo, so the analyzer it wraps can be
// imported as a workspace dep.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { GraphNode } from '@sample/shared';

export function createSampleMcpServer(): McpServer {
  const server = new McpServer({ name: 'sample', version: '0.1.0' });

  server.tool(
    'list_nodes',
    'List nodes in the analyzed project graph.',
    { layer: z.string().optional() },
    async ({ layer }) => {
      const nodes: GraphNode[] = [];
      // ... resolve from analyzer cache
      const filtered = layer ? nodes.filter((n) => n.layer === layer) : nodes;
      return { content: [{ type: 'text' as const, text: JSON.stringify(filtered) }] };
    },
  );

  return server;
}

export async function fetchInitialGraph(): Promise<GraphNode[]> {
  return [];
}
