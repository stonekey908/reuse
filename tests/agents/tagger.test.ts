import { describe, it, expect } from 'vitest';
import {
  buildTaggerPrompt,
  extractFileEvidence,
  parseTagResult,
} from '../../src/analysis/agents/tagger';
import { defaultGlossary } from '../../src/shared/glossary';

const sampleInput = {
  project: 'schoolsync',
  patternKey: 'modal-shell-primitives',
  description: 'Reusable CenterModal and SheetModal in /components/modals/ — composed by 8+ feature modals.',
  siblingKeys: ['visible-upload-queue-ui', 'context-per-domain-architecture'],
};

describe('buildTaggerPrompt', () => {
  it('includes the pattern + siblings + canonical domain list', () => {
    const glossary = defaultGlossary();
    const prompt = buildTaggerPrompt(sampleInput, glossary);
    expect(prompt).toContain('schoolsync');
    expect(prompt).toContain('modal-shell-primitives');
    expect(prompt).toContain('CenterModal');
    expect(prompt).toContain('frontend-mobile');
    expect(prompt).toContain('Sibling patterns');
    expect(prompt).toContain('visible-upload-queue-ui');
  });

  it('lists canonical capabilities when present', () => {
    const glossary = defaultGlossary();
    glossary.capabilities = ['document-upload', 'modal-shell'];
    const prompt = buildTaggerPrompt(sampleInput, glossary);
    expect(prompt).toContain('document-upload');
    expect(prompt).toContain('modal-shell');
  });

  it('handles a pattern with no siblings', () => {
    const prompt = buildTaggerPrompt({ ...sampleInput, siblingKeys: [] }, defaultGlossary());
    expect(prompt).toContain('No sibling patterns');
  });
});

describe('parseTagResult', () => {
  const valid = JSON.stringify({
    capability: 'modal-shell',
    abstractionLevel: 'primitive',
    domain: 'frontend-mobile',
    proposedNewDomain: null,
    proposedNewCapability: null,
    reasoning: 'Reusable layout chassis composed by feature modals.',
  });

  it('parses a clean JSON response', () => {
    const result = parseTagResult(valid);
    expect(result.capability).toBe('modal-shell');
    expect(result.abstractionLevel).toBe('primitive');
  });

  it('parses through markdown fences', () => {
    expect(parseTagResult('```json\n' + valid + '\n```').capability).toBe('modal-shell');
  });

  it('rejects an invalid abstractionLevel', () => {
    const bad = JSON.stringify({ ...JSON.parse(valid), abstractionLevel: 'bogus' });
    expect(() => parseTagResult(bad)).toThrow();
  });

  it('rejects a reasoning longer than 160 chars', () => {
    const bad = JSON.stringify({ ...JSON.parse(valid), reasoning: 'x'.repeat(200) });
    expect(() => parseTagResult(bad)).toThrow();
  });

  it('accepts proposed new domain + capability', () => {
    const proposed = JSON.stringify({
      ...JSON.parse(valid),
      domain: 'pwa-companion',
      proposedNewDomain: 'pwa-companion',
      proposedNewCapability: 'companion-app',
    });
    const result = parseTagResult(proposed);
    expect(result.proposedNewDomain).toBe('pwa-companion');
    expect(result.proposedNewCapability).toBe('companion-app');
  });
});

describe('extractFileEvidence', () => {
  it('pulls absolute-style paths from a description', () => {
    const desc = 'Reusable CenterModal and SheetModal in /components/modals/ used by /app/login.tsx.';
    const evidence = extractFileEvidence(desc);
    expect(evidence).toContain('/components/modals');
    expect(evidence).toContain('/app/login.tsx');
  });

  it('returns empty when no paths', () => {
    expect(extractFileEvidence('A reusable modal layout system, no path mentioned.')).toEqual([]);
  });

  it('caps at 6 paths', () => {
    const desc = Array.from({ length: 12 }, (_, i) => `/p${i}/file.ts`).join(' and ');
    expect(extractFileEvidence(desc).length).toBeLessThanOrEqual(6);
  });
});
