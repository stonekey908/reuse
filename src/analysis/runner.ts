import { z } from 'zod';
import {
  AnalysisItemSchema,
  type AnalysisItem,
  type Registry,
} from '../shared/types.js';
import { buildPrompt, collectPatterns } from './prompt.js';
import { getProvider, type ProviderId } from './providers/index.js';
import { OutputTruncatedError } from './providers/types.js';

export { OutputTruncatedError } from './providers/types.js';

export class ClaudeNotFoundError extends Error {
  constructor() {
    super('Claude Code CLI not found on PATH. Install: https://claude.com/claude-code');
    this.name = 'ClaudeNotFoundError';
  }
}

export class JsonParseError extends Error {
  constructor(public readonly rawOutput: string, cause?: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to parse provider output as JSON: ${causeMsg}`);
    this.name = 'JsonParseError';
  }
}

export type ClaudeRunner = (prompt: string) => Promise<string>;

const FENCED_BLOCK = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/;

export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(FENCED_BLOCK);
  return match ? match[1].trim() : trimmed;
}

const ResponseShapeSchema = z.union([
  z.object({ clusters: z.array(AnalysisItemSchema) }),
  z.array(AnalysisItemSchema),
]);

export function parseClusters(raw: string): AnalysisItem[] {
  const cleaned = stripCodeFences(raw);
  const parsed = JSON.parse(cleaned);
  const validated = ResponseShapeSchema.parse(parsed);
  return Array.isArray(validated) ? validated : validated.clusters;
}

/**
 * Wraps a Provider as a ClaudeRunner so existing tests + MCP tool keep working.
 */
export async function runnerFromProvider(provider: ProviderId, model?: string, signal?: AbortSignal): Promise<ClaudeRunner> {
  const p = await getProvider(provider);
  return async (prompt: string) => p.complete(prompt, { model, signal });
}

export const defaultClaudeRunner: ClaudeRunner = async (prompt) => {
  // Default = whichever provider is configured, picking Anthropic Sonnet first.
  const p = await getProvider('anthropic');
  return p.complete(prompt);
};

export interface RunAnalysisOpts {
  registry: Registry;
  runner?: ClaudeRunner;
  /** Provider/model to tag the produced items with. Optional — defaults to no tag. */
  tag?: { provider: string; model: string };
}

export async function runAnalysis({
  registry,
  runner = defaultClaudeRunner,
  tag,
}: RunAnalysisOpts): Promise<AnalysisItem[]> {
  const priorClusters = registry.analysis?.clusters;
  const patterns = collectPatterns(registry);

  const firstPrompt = buildPrompt({ priorClusters, patterns });

  // OutputTruncatedError must propagate as-is — retrying with the same budget
  // just truncates again, so we surface the actionable error instead of
  // looping into a misleading JsonParseError.
  let firstOutput: string;
  try {
    firstOutput = await runner(firstPrompt);
  } catch (err) {
    if (err instanceof OutputTruncatedError) throw err;
    throw err;
  }

  let items: AnalysisItem[];
  try {
    items = parseClusters(firstOutput);
  } catch {
    const retryPrompt = buildPrompt({ priorClusters, patterns, strict: true });
    let retryOutput: string;
    try {
      retryOutput = await runner(retryPrompt);
    } catch (err) {
      if (err instanceof OutputTruncatedError) throw err;
      throw err;
    }
    try {
      items = parseClusters(retryOutput);
    } catch (err) {
      throw new JsonParseError(retryOutput, err);
    }
  }

  if (tag) {
    items = items.map((item) => ({ ...item, provider: tag.provider, model: tag.model }));
  }
  return items;
}
