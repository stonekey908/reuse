import { z } from 'zod';

export const ProjectSchema = z.object({
  path: z.string().describe('Absolute path to the project directory'),
  description: z.string().optional().default('').describe('Human-readable project description'),
  tags: z.array(z.string()).optional().default([]).describe('Searchable tags'),
  patterns: z.record(z.string(), z.string()).optional().default({}).describe('Named patterns with descriptions'),
  git: z.string().optional().describe('Git remote URL'),
  links: z.record(z.string(), z.string()).optional().default({}).describe('External links (linear, figma, notion, etc.)'),
});

export const ClusterMemberSchema = z.object({
  project: z.string().describe('Project name as registered'),
  patternKey: z.string().describe('Pattern key within that project'),
  summary: z.string().describe('One-line summary of how this member implements the capability'),
});

export const ClusterSchema = z.object({
  capability: z.string().describe('Cluster name, e.g. "Document upload"'),
  description: z.string().describe('One-line summary of the cluster'),
  members: z.array(ClusterMemberSchema),
  similarities: z.string().describe('Natural-language description of what cluster members share'),
  differences: z.string().describe('Natural-language description of how cluster members diverge'),
  consolidationNote: z.string().optional().describe('Optional reuse / consolidation suggestion'),
});

export const AnalysisSchema = z.object({
  generatedAt: z.string().describe('ISO timestamp of when this analysis was generated'),
  registryFingerprint: z.string().describe('sha256 of canonical patterns JSON at generation time'),
  clusters: z.array(ClusterSchema),
});

export const RegistrySchema = z.object({
  projects: z.record(z.string(), ProjectSchema),
  analysis: AnalysisSchema.optional().describe('Cached cross-project pattern clustering analysis'),
});

export type Project = z.infer<typeof ProjectSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Cluster = z.infer<typeof ClusterSchema>;
export type ClusterMember = z.infer<typeof ClusterMemberSchema>;
