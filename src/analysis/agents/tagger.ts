import { z } from 'zod';
import type { Provider } from '../providers/index.js';
import { stripCodeFences } from '../runner.js';
import { ABSTRACTION_LEVELS, type AbstractionLevel } from '../../shared/types.js';
import type { Glossary } from '../../shared/glossary.js';

export const TagResultSchema = z.object({
  capability: z.string().describe('Canonical or newly proposed kebab-case capability slug'),
  abstractionLevel: z.enum(ABSTRACTION_LEVELS),
  domain: z.string().describe('Canonical or newly proposed kebab-case domain slug'),
  proposedNewDomain: z.string().nullable().describe('If domain was not in canonical list, the proposed slug; else null'),
  proposedNewCapability: z.string().nullable().describe('If capability was not in canonical list, the proposed slug; else null'),
  reasoning: z.string().max(160).describe('≤16-word justification for the chosen tags'),
});

export type TagResult = z.infer<typeof TagResultSchema>;

export interface TagInput {
  project: string;
  patternKey: string;
  description: string;
  /** Sibling patterns in the same project, for context (key only). */
  siblingKeys?: string[];
}

export function buildTaggerPrompt(input: TagInput, glossary: Glossary): string {
  const canonicalDomains = glossary.domains.join(', ');
  const canonicalCapabilities = glossary.capabilities.length > 0
    ? glossary.capabilities.join(', ')
    : '(none yet — propose new slugs as needed)';

  const siblingsLine = input.siblingKeys && input.siblingKeys.length > 0
    ? `Sibling patterns in the same project: ${input.siblingKeys.join(', ')}`
    : 'No sibling patterns in the same project.';

  return `You are tagging a single software-pattern record so that a downstream deterministic grouper can cluster it correctly across projects. Return strict JSON only.

Pattern:
  project: ${input.project}
  key: ${input.patternKey}
  description: ${input.description}

${siblingsLine}

CANONICAL DOMAIN LIST (pick from this if any fits): ${canonicalDomains}
CANONICAL CAPABILITY LIST (pick from this if any fits): ${canonicalCapabilities}

Rules:
- Pick the SINGLE most accurate \`capability\` slug. Capability = the user-facing problem this pattern solves (e.g. "document-upload", "react-context-domain-state", "test-coverage-discipline"). NOT the mechanism (e.g. "uses-react-context" is a mechanism, not a capability).
- Pick the SINGLE most accurate \`abstractionLevel\`:
  • "primitive"     — reusable infrastructure (modal-shell, theme-tokens, CLI-arg-parser)
  • "feature"       — concrete consumer of primitives (barcode-scanner-modal, upload-queue-card)
  • "discipline"    — engineering discipline applied to a capability (testing, error handling, monitoring)
  • "architecture"  — top-level structural choice (monorepo layout, agent-pipeline shape)
  • "spec"          — non-executable artifact (mockup, design doc, prompt-as-markdown)
- Pick the SINGLE most accurate \`domain\` from the CANONICAL DOMAIN LIST.
- If NONE of the canonical list fits well, you may propose ONE new slug with a ≤16-word justification. Otherwise leave the "proposedNew..." fields null.
- Slugs are lowercase, kebab-case, ≤4 words. No vendor names, no project names.
- "fileEvidence" is NOT your responsibility — leave it to the caller.

Return strict JSON, no markdown fences, no prose:
{
  "capability": "kebab-slug",
  "abstractionLevel": "primitive" | "feature" | "discipline" | "architecture" | "spec",
  "domain": "kebab-slug",
  "proposedNewDomain": "kebab-slug" | null,
  "proposedNewCapability": "kebab-slug" | null,
  "reasoning": "≤16 words"
}`;
}

export function parseTagResult(raw: string): TagResult {
  const cleaned = stripCodeFences(raw);
  const parsed = JSON.parse(cleaned);
  return TagResultSchema.parse(parsed);
}

export async function tagPattern(
  provider: Provider,
  input: TagInput,
  glossary: Glossary,
  opts: { model?: string; signal?: AbortSignal } = {},
): Promise<TagResult> {
  const prompt = buildTaggerPrompt(input, glossary);
  const raw = await provider.complete(prompt, { model: opts.model, signal: opts.signal });
  return parseTagResult(raw);
}

/**
 * Extract file paths mentioned in a pattern description. Cheap regex — covers
 * absolute paths starting with `/`, relative-from-project (`/src/...`), and
 * monorepo-package paths (`/packages/foo/...`). Used to populate fileEvidence
 * without an LLM call.
 */
export function extractFileEvidence(description: string): string[] {
  const matches = description.matchAll(/\/[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+/g);
  const found = new Set<string>();
  for (const m of matches) {
    // Strip trailing punctuation (sentence terminators that the regex consumed).
    const cleaned = m[0].replace(/[.,;:]+$/, '');
    if (cleaned.length > 1) found.add(cleaned);
  }
  return Array.from(found).slice(0, 6);
}

export type AbstractionLevelType = AbstractionLevel; // re-export for callers
