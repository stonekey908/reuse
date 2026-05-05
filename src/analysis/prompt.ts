import type { AnalysisItem, Registry } from '../shared/types.js';
import { ANALYSIS_THEMES } from '../shared/themes.js';

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
      out.push({ project: name, key, description: patterns[key].description });
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

  const themesList = ANALYSIS_THEMES.map((t) => `  - "${t.id}" (${t.label}) — ${t.description}`).join('\n');

  return `You are clustering reusable software patterns across a developer's project registry. Your job is to group patterns by capability and explain in plain English where members are alike and where they diverge, so the developer can spot consolidation opportunities.

${priorSection}Current patterns (${patterns.length} patterns across ${projectCount} projects):
${patternsList}

OUTPUT BUDGET (read first):
- Every field must be DENSE and information-rich. Pretend each character costs you something — because at registry scale (60+ patterns) the JSON will overflow the model's response budget if you pad with filler.
- \`description\` ≤ 120 chars (one tight line — the cluster headline).
- Each member \`summary\` ≤ 100 chars. Just the distinctive mechanism, not a thesis.
- \`similarities\` and \`differences\` ≤ 2 sentences AND ≤ 280 chars total each. State the shared mechanism / divergent axes plainly. No throat-clearing ("These patterns share..."), no restating member names.
- \`rationale\` and \`closestRelative\` on standalones: 1 sentence, ≤ 200 chars each.
- \`consolidationNote\` (optional): ≤ 200 chars, ending with the effort/payoff parenthetical.
- DO NOT enumerate every micro-difference between members. Pick the ONE axis that matters and say it.

TOP-LEVEL THEMES (every cluster and standalone MUST be tagged with exactly one):
${themesList}

Rules:
- Every output item (cluster or standalone) MUST include a \`theme\` field whose value is one of the slugs above. The UI groups items into collapsible sections by theme, so this assignment determines where each cluster shows up. Pick the theme that best describes the FUNCTIONAL CAPABILITY area, not the implementation domain. When multiple themes plausibly fit, choose the one a user looking for "where do I keep my X" would scan first. Use "misc" only when nothing else applies.
- Each pattern joins exactly one item — either a multi-member cluster or a standalone pattern.
- Reuse a previous item's name when the meaning still applies. Drop items whose patterns are gone.
- **There are TWO output shapes**, distinguished by a "kind" field:
  - **\`kind: "cluster"\`** — two or more patterns sharing a capability. Has \`members[]\`, \`similarities\`, \`differences\`, optional \`consolidationNote\`.
  - **\`kind: "standalone"\`** — a single pattern that genuinely doesn't fit any multi-member cluster. Has a single \`member\`, plus \`rationale\` (why it stands alone) and \`closestRelative\` (the nearest registered pattern + why it doesn't fit).
- **THE 75% REUSABILITY TEST (the most important rule).** A cluster is coherent ONLY if you can name a single reusable code module — a library, hook, class, or shared npm package — that could plausibly implement the core shared capability for at least 75% of its members. Before emitting any cluster, mentally name that module. If you cannot, the cluster is too abstract: split it into separate clusters or standalones.
- **Self-critique any cluster with 5 or more members.** Before emitting a large cluster, ask: "Can this be broken into 2-3 smaller, more specific clusters? Are the similarities concrete enough to justify this size, or am I forcing a connection through abstract language like 'orchestration', 'system', 'management', 'flow'?" If the connection feels stretched, SPLIT. Large clusters with vague names are the #1 quality failure.
- **No junk-drawer abstractions.** Words like "Orchestration", "System", "Management", "Flow", "Components", "Tooling" in a cluster name are red flags — they often hide incoherent groupings. If your cluster name uses one of these words, run the 75% test again. "UI components" is too vague. "Modal shell primitives" is concrete.
- **Don't over-split. Two-member clusters are valuable.** The opposite failure of junk drawers is fragmenting genuinely shared capabilities into a pile of standalones. If two patterns from different projects share the same problem domain, they cluster — even if there are only two of them. Two upload-queue-UI patterns are a cluster, not two standalones. Two React-Context-domain-state patterns are a cluster. If you're emitting more than ~50% standalones for a 70+ pattern registry, you're over-splitting.
- **Symmetric closestRelative pointers MUST cluster.** Before emitting a standalone, check: if your candidate's closestRelative is pattern X, and X's closestRelative would be your candidate, then the two patterns recognise each other as the nearest neighbour — that is by definition a cluster. Cluster them. The closestRelative field exists to name patterns that are NOT close enough to share a capability; if they ARE close enough that each names the other, the standalone framing is wrong.
- **Multi-member clusters MUST span at least two distinct projects.** A "cluster" of 4 codeview submodules is not a cross-project capability cluster — it's intra-project module structure that belongs in the project's own design docs, not in this analysis. If all members come from one project, either (a) merge with related patterns from other projects to form a real cross-project cluster, or (b) demote each member to a standalone. Refuse to emit single-project-only clusters.
- **Aim for HIGH-LEVEL capability names, not strategy names.** Capability names must be the problem domain ("Document upload", "AI provider integration", "Encryption") — never an implementation strategy or a single project's specific approach. Implementation specifics (kebab-case, AES-GCM, tus, chunked, claude -p) belong in member summaries and the differences section, NOT in the capability header.
- **Strategy diversity is a STRENGTH of a cluster, not a reason to split.** When members address the same problem via different strategies (multi-provider routing vs CLI shell-out vs single-provider direct call), they belong in the SAME cluster. Spell out the divergent strategies in the differences field. Splitting strategies into separate clusters destroys the comparison.
- **Don't force unrelated patterns together.** A cluster must reflect a genuine shared capability, not a vague umbrella. If consolidating two patterns requires writing "skip — divergence is fundamental" in the consolidationNote, they belong as standalone items, not in one cluster. Likewise, if the consolidationNote admits that one or more members would NOT benefit from the proposed shared abstraction, the cluster is too broad — pull those members out as standalone items.
- **Capability names must be framework-agnostic.** Never put framework, library, or vendor names in the capability header — "shadcn-style", "expo-haptics", "tus", "AES-GCM", "claude -p" all belong in member summaries or descriptions, not in the capability name itself. Use the abstract problem name: "Component distribution via source-copy", "Haptic feedback", "Resumable file upload", "At-rest encryption".
- For multi-member clusters: \`similarities\` and \`differences\` must cite concrete shared mechanisms / concrete divergences within the OUTPUT BUDGET above. One dense sentence beats two padded ones. Never write "they are similar" or "Single member." placeholders.
- For standalone items: \`rationale\` is one tight sentence on what makes this pattern its own category. \`closestRelative\` names the nearest registered pattern (by project + key) and why it doesn't share enough to cluster. NEVER use these fields to say "single member" — they exist precisely to replace those placeholders.
- \`consolidationNote\` is optional and ONLY applies to clusters. Include it when there is a concrete reuse suggestion. End every consolidationNote with a parenthetical effort/payoff judgment: "(low effort, high reuse)", "(medium effort, medium reuse)", or "(skip — divergence is fundamental)". Name the proposed API surface in 1 short clause when relevant.

Return strict JSON matching exactly this shape (the array can mix both kinds):
{
  "clusters": [
    {
      "kind": "cluster",
      "theme": "string — required; one of the theme slugs listed above (e.g. 'ai-llm')",
      "capability": "string — short capability name like 'Document upload'",
      "description": "string — one-line summary of what unites this cluster",
      "members": [
        { "project": "project name", "patternKey": "pattern key", "summary": "1-line summary of how this member implements the capability" }
      ],
      "similarities": "string — what cluster members share (≤280 chars, ≤2 sentences)",
      "differences": "string — how cluster members diverge (≤280 chars, ≤2 sentences)",
      "consolidationNote": "string (optional) — concrete reuse / consolidation suggestion ending with effort/payoff judgment"
    },
    {
      "kind": "standalone",
      "theme": "string — required; one of the theme slugs listed above",
      "capability": "string — short capability name",
      "description": "string — one-line summary of what this pattern does",
      "member": { "project": "project name", "patternKey": "pattern key", "summary": "1-line summary" },
      "rationale": "string — one sentence on why this stands alone as its own category",
      "closestRelative": "string — name the nearest registered pattern (by project + key) and why it doesn't share enough to cluster"
    }
  ]
}

NEGATIVE EXAMPLE — DO NOT emit clusters that look like this:
  capability: "Global UI System Components"
  members: [barcode-scanner-modal, modal-shell-primitives, centralised-error-messages, atmosphere]

This is BAD because it mixes (a) an application-specific feature component, (b) a layout primitive, (c) a non-visual data constant, and (d) a decorative style. The only thing they share is being in a UI repo. There is no single reusable module that could implement all four — they FAIL the 75% test. The right output is several separate items: "Modal shell primitives" as its own multi-member cluster (collecting modal layouts), the barcode scanner as a standalone, error-message constants as a standalone or in a separate "centralised user-facing strings" cluster, and atmosphere as a standalone.

Cluster names like "Global UI System Components", "Complex State Management & UI Flow Orchestration", or "Local Development Simulation and Tooling" are signs you have given up on clustering and are dumping leftovers into a junk drawer. Refuse to emit them.${strictSuffix}`;
}
