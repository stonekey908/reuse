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
- **Aim for HIGH-LEVEL capability names, not strategy names.** Cluster names must be the problem domain ("Document upload", "AI provider integration", "Encryption", "CLI tooling conventions") — never an implementation strategy or a single project's specific approach. Implementation specifics (kebab-case, AES-GCM, tus, chunked, claude -p) belong in member summaries and the differences section, NOT in the cluster header.
- **Strategy diversity is a STRENGTH of a cluster, not a reason to split.** When members address the same problem via different strategies (multi-provider routing vs CLI shell-out vs single-provider direct call), they belong in the SAME cluster — that's exactly the consolidation insight the developer wants. Spell out the divergent strategies in the differences field. Splitting strategies into separate clusters destroys the comparison.
- **Don't force unrelated patterns together.** A cluster must reflect a genuine shared capability, not a vague umbrella. If consolidating two patterns requires you to write "skip — divergence is fundamental" in the consolidationNote, they belong in separate clusters. Singletons are fine when justified.
- "similarities" and "differences" must be substantive prose — at least two sentences each — citing concrete shared mechanisms or concrete divergences. Never write "they are similar" or "Single member." placeholders.
- For genuine singletons: write similarities as a one-sentence rationale ("what makes this pattern its own category") and differences as a one-sentence note on what the closest related pattern in the registry is and why it doesn't fit.
- "consolidationNote" is optional. Include it ONLY when there is a concrete reuse suggestion. End every consolidationNote with a parenthetical effort/payoff judgment: "(low effort, high reuse)", "(medium effort, medium reuse)", or "(skip — divergence is fundamental)". When relevant, name the proposed API surface (e.g. an "upload(stream, opts) → progress events" function shape).

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
