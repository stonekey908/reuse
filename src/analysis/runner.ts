import { spawn } from 'child_process';
import { z } from 'zod';
import {
  AnalysisItemSchema,
  type AnalysisItem,
  type Registry,
} from '../shared/types.js';
import { buildPrompt, collectPatterns } from './prompt.js';

export class ClaudeNotFoundError extends Error {
  constructor() {
    super('Claude Code CLI not found on PATH. Install: https://claude.com/claude-code');
    this.name = 'ClaudeNotFoundError';
  }
}

export class JsonParseError extends Error {
  constructor(public readonly rawOutput: string, cause?: unknown) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to parse Claude output as JSON: ${causeMsg}`);
    this.name = 'JsonParseError';
  }
}

export type ClaudeRunner = (prompt: string) => Promise<string>;

/**
 * Model used by `claude -p` for analysis. Defaults to sonnet — clustering is
 * a structured-output task, doesn't need Opus-level reasoning, and Opus is
 * 3-5x slower for this prompt size. Override with REUSE_CLAUDE_MODEL.
 */
const CLAUDE_MODEL = process.env.REUSE_CLAUDE_MODEL || 'sonnet';

export const defaultClaudeRunner: ClaudeRunner = (prompt) => {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--model', CLAUDE_MODEL, prompt], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new ClaudeNotFoundError());
        return;
      }
      reject(err);
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`claude -p exited with code ${code}: ${stderr.trim()}`));
        return;
      }
      resolve(stdout);
    });
  });
};

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

export async function runAnalysis({
  registry,
  runner = defaultClaudeRunner,
}: {
  registry: Registry;
  runner?: ClaudeRunner;
}): Promise<AnalysisItem[]> {
  const priorClusters = registry.analysis?.clusters;
  const patterns = collectPatterns(registry);

  const firstPrompt = buildPrompt({ priorClusters, patterns });
  const firstOutput = await runner(firstPrompt);

  try {
    return parseClusters(firstOutput);
  } catch {
    const retryPrompt = buildPrompt({ priorClusters, patterns, strict: true });
    const retryOutput = await runner(retryPrompt);
    try {
      return parseClusters(retryOutput);
    } catch (err) {
      throw new JsonParseError(retryOutput, err);
    }
  }
}
