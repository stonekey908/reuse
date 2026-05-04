import type { Cluster, Registry } from '../shared/types.js';

export type PatternEntry = {
  project: string;
  key: string;
  description: string;
};

export function collectPatterns(registry: Registry): PatternEntry[] {
  const out: PatternEntry[] = [];
  for (const name of Object.keys(registry.projects).sort()) {
    const project = registry.projects[name];
    const patterns = project.patterns ?? {};
    for (const key of Object.keys(patterns).sort()) {
      out.push({ project: name, key, description: patterns[key] });
    }
  }
  return out;
}

export function buildPrompt({
  priorClusters,
  patterns,
  strict = false,
}: {
  priorClusters?: Cluster[];
  patterns: PatternEntry[];
  strict?: boolean;
}): string {
  const priorSection = priorClusters && priorClusters.length > 0
    ? `Previous clusters from the last analysis (preserve these names where the meaning still applies; rename only if meaning has genuinely shifted; drop clusters with no remaining members):
${priorClusters.map((c) => `  - "${c.capability}" — ${c.description}`).join('\n')}

`
    : '';

  const projectCount = new Set(patterns.map((p) => p.project)).size;
  const patternsList = patterns.map((p) => `  ${JSON.stringify(p)}`).join('\n');

  const strictSuffix = strict
    ? '\n\nIMPORTANT: Return ONLY the raw JSON object — no markdown fences, no prose, no commentary. The first character must be `{` and the last must be `}`.'
    : '';

  return `You are clustering reusable software patterns across a developer's project registry. Your job is to group patterns by capability and explain in plain English where members are alike and where they diverge, so the developer can spot consolidation opportunities.

${priorSection}Current patterns (${patterns.length} patterns across ${projectCount} projects):
${patternsList}

Rules:
- Each pattern joins exactly one cluster.
- Reuse a previous cluster name when the meaning still applies. Drop clusters that no longer have members.
- A cluster with a single member is fine if no other pattern fits.
- "similarities" and "differences" must be substantive prose — not boilerplate like "they are similar". If members truly differ only in surface detail, say so.
- "consolidationNote" is optional. Only include it when there is a real, concrete reuse suggestion (e.g. "extract X into a shared package").

Return strict JSON matching exactly this shape:
{
  "clusters": [
    {
      "capability": "string — short capability name like 'Document upload'",
      "description": "string — one-line summary of what unites this cluster",
      "members": [
        { "project": "project name", "patternKey": "pattern key", "summary": "1-line summary of how this member implements the capability" }
      ],
      "similarities": "string — what cluster members share, in natural language",
      "differences": "string — how cluster members diverge, in natural language",
      "consolidationNote": "string (optional) — concrete reuse / consolidation suggestion, only if applicable"
    }
  ]
}${strictSuffix}`;
}
