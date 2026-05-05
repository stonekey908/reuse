import { describe, it, expect } from 'vitest';
import {
  ClaudeNotFoundError,
  JsonParseError,
  parseClusters,
  runAnalysis,
  stripCodeFences,
  type ClaudeRunner,
} from '../../src/analysis/runner';
import type { Registry } from '../../src/shared/types';

const validResponse = JSON.stringify({
  clusters: [
    {
      capability: 'Document upload',
      description: 'Cross-project upload pipelines',
      members: [
        { project: 'foo', patternKey: 'upload-flow', summary: 'Visible queue with retry' },
      ],
      similarities: 'Both surface progress to the user.',
      differences: 'foo retries automatically, bar does not.',
    },
  ],
});

const registry: Registry = {
  projects: {
    foo: { path: '/tmp/foo', patterns: { 'upload-flow': { description: 'Visible queue with retry', fileEvidence: [] } } },
  },
};

describe('stripCodeFences', () => {
  it('returns text unchanged when no fences', () => {
    expect(stripCodeFences('plain text')).toBe('plain text');
  });

  it('strips ```json ... ``` fences', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare ``` ... ``` fences', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('handles trailing whitespace', () => {
    expect(stripCodeFences('  ```json\n{"a":1}\n```  ')).toBe('{"a":1}');
  });
});

describe('parseClusters', () => {
  it('parses a {clusters: [...]} response', () => {
    const result = parseClusters(validResponse);
    expect(result).toHaveLength(1);
    expect(result[0].capability).toBe('Document upload');
  });

  it('parses a bare cluster array', () => {
    const arrayResponse = JSON.stringify(JSON.parse(validResponse).clusters);
    const result = parseClusters(arrayResponse);
    expect(result).toHaveLength(1);
  });

  it('parses through markdown fences', () => {
    const fenced = '```json\n' + validResponse + '\n```';
    expect(parseClusters(fenced)).toHaveLength(1);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseClusters('not json')).toThrow();
  });

  it('throws on JSON that does not match the schema', () => {
    expect(() => parseClusters(JSON.stringify({ clusters: [{ capability: 'X' }] }))).toThrow();
  });
});

describe('runAnalysis', () => {
  it('returns clusters on first valid response', async () => {
    const calls: string[] = [];
    const runner: ClaudeRunner = async (prompt) => {
      calls.push(prompt);
      return validResponse;
    };
    const result = await runAnalysis({ registry, runner });
    expect(result).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain('IMPORTANT');
  });

  it('retries once with a strict prompt on parse failure', async () => {
    const calls: string[] = [];
    const runner: ClaudeRunner = async (prompt) => {
      calls.push(prompt);
      return calls.length === 1 ? 'not json at all' : validResponse;
    };
    const result = await runAnalysis({ registry, runner });
    expect(result).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[0]).not.toContain('IMPORTANT');
    expect(calls[1]).toContain('IMPORTANT');
  });

  it('throws JsonParseError after second failure with raw output attached', async () => {
    const runner: ClaudeRunner = async () => 'still not json';
    await expect(runAnalysis({ registry, runner })).rejects.toMatchObject({
      name: 'JsonParseError',
      rawOutput: 'still not json',
    });
  });

  it('propagates ClaudeNotFoundError without retrying', async () => {
    let callCount = 0;
    const runner: ClaudeRunner = async () => {
      callCount += 1;
      throw new ClaudeNotFoundError();
    };
    await expect(runAnalysis({ registry, runner })).rejects.toBeInstanceOf(ClaudeNotFoundError);
    expect(callCount).toBe(1);
  });

  it('seeds prior clusters into the prompt when registry already has analysis', async () => {
    const withPrior: Registry = {
      ...registry,
      analysis: {
        generatedAt: '2026-05-04T00:00:00.000Z',
        registryFingerprint: 'a'.repeat(64),
        projectFingerprints: { foo: 'b'.repeat(64) },
        clusters: [
          {
            capability: 'PriorCluster',
            description: 'a prior cluster',
            members: [],
            similarities: '',
            differences: '',
          },
        ],
      },
    };
    const calls: string[] = [];
    const runner: ClaudeRunner = async (p) => { calls.push(p); return validResponse; };
    await runAnalysis({ registry: withPrior, runner });
    expect(calls[0]).toContain('PriorCluster');
  });
});

describe('JsonParseError', () => {
  it('exposes raw output on the error instance', () => {
    const err = new JsonParseError('raw stuff', new Error('boom'));
    expect(err.rawOutput).toBe('raw stuff');
    expect(err.name).toBe('JsonParseError');
    expect(err.message).toContain('boom');
  });
});

describe('ClaudeNotFoundError', () => {
  it('has a helpful message', () => {
    const err = new ClaudeNotFoundError();
    expect(err.name).toBe('ClaudeNotFoundError');
    expect(err.message).toContain('claude.com/claude-code');
  });
});
