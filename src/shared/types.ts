import { z } from 'zod';

export const ABSTRACTION_LEVELS = ['primitive', 'feature', 'discipline', 'architecture', 'spec'] as const;

const PatternBodySchema = z.object({
  description: z.string().describe('1-2 sentence prose describing the pattern'),
  capability: z.string().optional().describe('Free-form kebab-case slug naming the capability (e.g. "document-upload")'),
  abstractionLevel: z.enum(ABSTRACTION_LEVELS).optional().describe('Reusability layer this pattern operates at'),
  domain: z.string().optional().describe('Broad area (frontend-web, ai-integration, etc.) — see glossary for canonical list'),
  fileEvidence: z.array(z.string()).optional().default([]).describe('File paths from the project that demonstrate this pattern'),
}).passthrough();

/**
 * Pattern records are tolerant of two shapes on input:
 * - Legacy: a plain string (the description). Auto-upgraded via z.preprocess.
 * - New: a structured object with optional capability/abstractionLevel/domain tags.
 *
 * After parse, every pattern is in the structured object form.
 */
export const PatternRecordSchema = z.preprocess(
  (val) => (typeof val === 'string' ? { description: val, fileEvidence: [] } : val),
  PatternBodySchema,
);

export const ProjectSchema = z.object({
  path: z.string().describe('Absolute path to the project directory'),
  description: z.string().optional().default('').describe('Human-readable project description'),
  tags: z.array(z.string()).optional().default([]).describe('Searchable tags'),
  patterns: z.record(z.string(), PatternRecordSchema).optional().default({}).describe('Named patterns with structured tags'),
  git: z.string().optional().describe('Git remote URL'),
  links: z.record(z.string(), z.string()).optional().default({}).describe('External links (linear, figma, notion, etc.)'),
}).passthrough();

export const ClusterMemberSchema = z.object({
  project: z.string().describe('Project name as registered'),
  patternKey: z.string().describe('Pattern key within that project'),
  summary: z.string().describe('One-line summary of how this member implements the capability'),
});

export const ClusterSchema = z.object({
  kind: z.literal('cluster').optional().describe('Discriminator; absence implies "cluster" for back-compat with legacy caches'),
  capability: z.string().describe('Cluster name, e.g. "Document upload"'),
  description: z.string().describe('One-line summary of the cluster'),
  members: z.array(ClusterMemberSchema),
  similarities: z.string().describe('Natural-language description of what cluster members share'),
  differences: z.string().describe('Natural-language description of how cluster members diverge'),
  consolidationNote: z.string().optional().describe('Optional reuse / consolidation suggestion'),
  provider: z.string().optional().describe('Provider that produced this item (anthropic, openai, gemini, ollama)'),
  model: z.string().optional().describe('Model id that produced this item'),
});

export const StandalonePatternSchema = z.object({
  kind: z.literal('standalone').describe('Discriminator'),
  capability: z.string().describe('Capability name as standalone'),
  description: z.string().describe('One-line summary of what this pattern does'),
  member: ClusterMemberSchema.describe('The single pattern this entry represents'),
  rationale: z.string().describe('Why this pattern stands alone — what makes it its own category'),
  closestRelative: z.string().describe('The nearest related pattern in the registry and why it does not fit'),
  notes: z.string().optional().describe('Optional extra notes'),
  provider: z.string().optional().describe('Provider that produced this item (anthropic, openai, gemini, ollama)'),
  model: z.string().optional().describe('Model id that produced this item'),
});

export const AnalysisItemSchema = z.union([StandalonePatternSchema, ClusterSchema]);

export const AnalysisSchema = z.object({
  generatedAt: z.string().describe('ISO timestamp of when this analysis was generated'),
  registryFingerprint: z.string().describe('sha256 of canonical patterns JSON at generation time'),
  projectFingerprints: z.record(z.string(), z.string()).describe('Per-project pattern fingerprints — used to compute changed-projects diff on staleness check'),
  clusters: z.array(AnalysisItemSchema).describe('Mixed array of multi-member clusters and standalone patterns'),
}).passthrough();

export const RegistrySchema = z.object({
  projects: z.record(z.string(), ProjectSchema),
  analysis: AnalysisSchema.optional().describe('Cached cross-project pattern clustering analysis'),
}).passthrough();

export type Project = z.infer<typeof ProjectSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Cluster = z.infer<typeof ClusterSchema>;
export type StandalonePattern = z.infer<typeof StandalonePatternSchema>;
export type AnalysisItem = z.infer<typeof AnalysisItemSchema>;
export type ClusterMember = z.infer<typeof ClusterMemberSchema>;
export type Pattern = z.infer<typeof PatternBodySchema>;
export type AbstractionLevel = (typeof ABSTRACTION_LEVELS)[number];

/**
 * Returns the description of a pattern record. Patterns parsed via PatternRecordSchema
 * are always in object form, so this is just `p.description` — but exporting it here
 * lets call sites express intent without reaching into the type.
 */
export function patternDescription(p: Pattern): string {
  return p.description;
}

export function patternHasTags(p: Pattern): boolean {
  return !!(p.capability && p.abstractionLevel && p.domain);
}

export function isStandalone(item: AnalysisItem): item is StandalonePattern {
  return item.kind === 'standalone';
}

export function isCluster(item: AnalysisItem): item is Cluster {
  return item.kind !== 'standalone';
}
