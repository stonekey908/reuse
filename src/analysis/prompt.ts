import type { AnalysisItem, Registry } from '../shared/types.js';

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
  priorClusters?: AnalysisItem[];
  patterns: PatternEntry[];
  strict?: boolean;
}): string {
  const priorSection = priorClusters && priorClusters.length > 0
    ? `Previous analysis items from the last run (preserve these names where the meaning still applies; rename only if meaning has genuinely shifted; drop items whose patterns are gone):
${priorClusters.map((c) => `  - "${c.capability}" (${c.kind === 'standalone' ? 'standalone' : 'cluster'}) — ${c.description}`).join('\n')}

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
- Each pattern joins exactly one item — either a multi-member cluster or a standalone pattern.
- Reuse a previous item's name when the meaning still applies. Drop items whose patterns are gone.
- **There are TWO output shapes**, distinguished by a "kind" field:
  - **\`kind: "cluster"\`** — two or more patterns sharing a capability. Has \`members[]\`, \`similarities\`, \`differences\`, optional \`consolidationNote\`.
  - **\`kind: "standalone"\`** — a single pattern that genuinely doesn't fit any multi-member cluster. Has a single \`member\`, plus \`rationale\` (why it stands alone) and \`closestRelative\` (the nearest registered pattern + why it doesn't fit).
- **Aim for HIGH-LEVEL capability names, not strategy names.** Capability names must be the problem domain ("Document upload", "AI provider integration", "Encryption") — never an implementation strategy or a single project's specific approach. Implementation specifics (kebab-case, AES-GCM, tus, chunked, claude -p) belong in member summaries and the differences section, NOT in the capability header.
- **Strategy diversity is a STRENGTH of a cluster, not a reason to split.** When members address the same problem via different strategies (multi-provider routing vs CLI shell-out vs single-provider direct call), they belong in the SAME cluster. Spell out the divergent strategies in the differences field. Splitting strategies into separate clusters destroys the comparison.
- **Don't force unrelated patterns together.** A cluster must reflect a genuine shared capability, not a vague umbrella. If consolidating two patterns requires writing "skip — divergence is fundamental" in the consolidationNote, they belong as standalone items, not in one cluster.
- For multi-member clusters: \`similarities\` and \`differences\` must be substantive prose — at least two sentences each — citing concrete shared mechanisms or concrete divergences. Never write "they are similar" or "Single member." placeholders.
- For standalone items: \`rationale\` is one sentence on what makes this pattern its own category. \`closestRelative\` is one sentence naming the nearest registered pattern (by project + key) and why it doesn't share enough to cluster. NEVER use the rationale or closestRelative fields to say "single member" — they exist precisely to replace those placeholders.
- \`consolidationNote\` is optional and ONLY applies to clusters. Include it when there is a concrete reuse suggestion. End every consolidationNote with a parenthetical effort/payoff judgment: "(low effort, high reuse)", "(medium effort, medium reuse)", or "(skip — divergence is fundamental)". When relevant, name the proposed API surface (e.g. an "upload(stream, opts) → progress events" function shape).

Return strict JSON matching exactly this shape (the array can mix both kinds):
{
  "clusters": [
    {
      "kind": "cluster",
      "capability": "string — short capability name like 'Document upload'",
      "description": "string — one-line summary of what unites this cluster",
      "members": [
        { "project": "project name", "patternKey": "pattern key", "summary": "1-line summary of how this member implements the capability" }
      ],
      "similarities": "string — what cluster members share, in natural language (≥2 sentences)",
      "differences": "string — how cluster members diverge, in natural language (≥2 sentences)",
      "consolidationNote": "string (optional) — concrete reuse / consolidation suggestion ending with effort/payoff judgment"
    },
    {
      "kind": "standalone",
      "capability": "string — short capability name",
      "description": "string — one-line summary of what this pattern does",
      "member": { "project": "project name", "patternKey": "pattern key", "summary": "1-line summary" },
      "rationale": "string — one sentence on why this stands alone as its own category",
      "closestRelative": "string — name the nearest registered pattern (by project + key) and why it doesn't share enough to cluster"
    }
  ]
}${strictSuffix}`;
}
