import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  defaultGlossary,
  loadGlossary,
  saveGlossary,
  canonicalDomain,
  canonicalCapability,
  recordDomainProposal,
  recordCapabilityProposal,
  STARTER_DOMAINS,
} from '../src/shared/glossary';

describe('glossary', () => {
  const testDir = path.join(os.tmpdir(), 'reuse-glossary-test-' + Date.now());

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.REUSE_HOME = testDir;
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.REUSE_HOME;
  });

  it('loads the starter glossary when no file exists', () => {
    const g = loadGlossary();
    expect(g.domains).toEqual([...STARTER_DOMAINS]);
    expect(g.capabilities).toEqual([]);
    expect(g.aliases.domain).toEqual({});
    expect(g.aliases.capability).toEqual({});
  });

  it('persists and reloads a glossary', () => {
    const g = defaultGlossary();
    g.domains.push('mobile-pwa');
    g.aliases.domain['rn-app'] = 'frontend-mobile';
    saveGlossary(g);

    const reloaded = loadGlossary();
    expect(reloaded.domains).toContain('mobile-pwa');
    expect(reloaded.aliases.domain['rn-app']).toBe('frontend-mobile');
  });

  it('canonicalDomain applies aliases', () => {
    const g = defaultGlossary();
    g.aliases.domain['rn-app'] = 'frontend-mobile';
    expect(canonicalDomain(g, 'rn-app')).toBe('frontend-mobile');
    expect(canonicalDomain(g, 'frontend-web')).toBe('frontend-web');
    expect(canonicalDomain(g, 'unknown')).toBe('unknown');
  });

  it('canonicalCapability applies aliases', () => {
    const g = defaultGlossary();
    g.aliases.capability['doc-upload'] = 'document-upload';
    expect(canonicalCapability(g, 'doc-upload')).toBe('document-upload');
    expect(canonicalCapability(g, 'document-upload')).toBe('document-upload');
  });

  it('recordDomainProposal adds new but ignores duplicates and aliases', () => {
    const g = defaultGlossary();
    const a = recordDomainProposal(g, 'mobile-pwa');
    expect(a.domains).toContain('mobile-pwa');
    const b = recordDomainProposal(a, 'mobile-pwa');
    expect(b.domains.filter((d) => d === 'mobile-pwa').length).toBe(1);
    const aliased = { ...b, aliases: { ...b.aliases, domain: { 'old-name': 'mobile-pwa' } } };
    const c = recordDomainProposal(aliased, 'old-name');
    expect(c.domains).not.toContain('old-name');
  });

  it('recordCapabilityProposal grows the canonical list', () => {
    const g = defaultGlossary();
    expect(g.capabilities).toEqual([]);
    const a = recordCapabilityProposal(g, 'document-upload');
    expect(a.capabilities).toEqual(['document-upload']);
    const b = recordCapabilityProposal(a, 'multi-provider-ai');
    expect(b.capabilities).toEqual(['document-upload', 'multi-provider-ai']);
  });

  it('falls back to starter on a malformed glossary file (does not throw)', () => {
    fs.writeFileSync(path.join(testDir, 'glossary.json'), '{ this is: not json');
    const g = loadGlossary();
    expect(g.domains).toEqual([...STARTER_DOMAINS]);
  });
});
