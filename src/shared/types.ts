import { z } from 'zod';

export const ProjectSchema = z.object({
  path: z.string().describe('Absolute path to the project directory'),
  description: z.string().optional().default('').describe('Human-readable project description'),
  tags: z.array(z.string()).optional().default([]).describe('Searchable tags'),
  patterns: z.record(z.string(), z.string()).optional().default({}).describe('Named patterns with descriptions'),
  git: z.string().optional().describe('Git remote URL'),
  links: z.record(z.string(), z.string()).optional().default({}).describe('External links (linear, figma, notion, etc.)'),
});

export const RegistrySchema = z.object({
  projects: z.record(z.string(), ProjectSchema),
});

export type Project = z.infer<typeof ProjectSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
