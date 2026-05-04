// Next.js app router root page. Demonstrates a streaming server component that
// resolves data from the MCP-server package and renders a layered visualisation.
//
// Pattern of interest: streaming server component with progressive enhancement —
// initial frame ships before data resolves; data hydrates in place.

import { Suspense } from 'react';
import { fetchInitialGraph } from '@sample/mcp-server/client';
import { GraphView } from './GraphView';

export default async function Page() {
  const initialGraph = await fetchInitialGraph();
  return (
    <main>
      <h1>Architecture map</h1>
      <Suspense fallback={<div>Loading graph…</div>}>
        <GraphView initialGraph={initialGraph} />
      </Suspense>
    </main>
  );
}
