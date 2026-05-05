import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildScoutReport, buildScoutReportForProject } from '../../src/analysis/scout';
import type { Project, Registry } from '../../src/shared/types';

type Expected = {
  expectedModules: Array<{ name: string; fileFragment: string; concern: string }>;
  expectedReadmeKeywords: string[];
  expectedPackageJsonKeys: string[];
};

const fixtureDir = path.resolve(__dirname, '../fixtures/extract-patterns');
const monorepoPath = path.join(fixtureDir, 'sample-monorepo');

const fixtureProject: Project = {
  path: monorepoPath,
  description: 'Turborepo fixture for extract_patterns eval',
  tags: ['turborepo', 'fixture'],
  patterns: {},
  links: {},
};

const expected: Expected = JSON.parse(
  fs.readFileSync(path.join(fixtureDir, 'expected.json'), 'utf-8'),
);

describe('scout: deterministic Layer 1 quality', () => {
  it('captures the README at the project root', () => {
    const report = buildScoutReportForProject('sample-monorepo', fixtureProject);
    expect('filename' in report.readme).toBe(true);
    if ('filename' in report.readme) {
      expect(report.readme.filename).toBe('README.md');
      for (const kw of expected.expectedReadmeKeywords) {
        expect(report.readme.excerpt).toContain(kw);
      }
    }
  });

  it('captures the root package.json with the expected fields', () => {
    const report = buildScoutReportForProject('sample-monorepo', fixtureProject);
    expect('note' in report.packageJson).toBe(false);
    for (const key of expected.expectedPackageJsonKeys) {
      expect(report.packageJson).toHaveProperty(key);
    }
    expect(report.packageJson).toHaveProperty('workspaces');
  });

  it('directoryTree visits every workspace package directory', () => {
    const report = buildScoutReportForProject('sample-monorepo', fixtureProject);
    for (const mod of expected.expectedModules) {
      expect(report.directoryTree).toContain(mod.name.split('/')[1]);
    }
    // And the root workspace folders themselves
    expect(report.directoryTree).toContain('apps/');
    expect(report.directoryTree).toContain('packages/');
  });

  it('suggestedFilesToRead is non-empty (regression: codeview returned empty)', () => {
    const report = buildScoutReportForProject('sample-monorepo', fixtureProject);
    expect(report.suggestedFilesToRead.length).toBeGreaterThan(0);
  });

  it('suggestedFilesToRead covers a file from EVERY workspace module', () => {
    const report = buildScoutReportForProject('sample-monorepo', fixtureProject);
    const missing: string[] = [];
    for (const mod of expected.expectedModules) {
      const hit = report.suggestedFilesToRead.some((p) => p.includes(mod.fileFragment));
      if (!hit) missing.push(`${mod.name} (${mod.concern}) — expected ${mod.fileFragment}`);
    }
    if (missing.length > 0) {
      throw new Error(
        `Scout missed ${missing.length} of ${expected.expectedModules.length} workspace modules. ` +
        `suggestedFilesToRead = [${report.suggestedFilesToRead.join(', ')}]\n  - ${missing.join('\n  - ')}`,
      );
    }
    expect(missing).toEqual([]);
  });

  it('paths in suggestedFilesToRead use forward slashes (cross-platform)', () => {
    const report = buildScoutReportForProject('sample-monorepo', fixtureProject);
    for (const p of report.suggestedFilesToRead) {
      expect(p).not.toContain('\\');
    }
  });

  it('populates userFacingScreens from the fixture web app', () => {
    const report = buildScoutReportForProject('sample-monorepo', fixtureProject);
    expect(Array.isArray(report.userFacingScreens)).toBe(true);
    // The fixture has apps/web/src/page.tsx — should be surfaced.
    expect(report.userFacingScreens.some((s) => s.endsWith('/page.tsx'))).toBe(true);
  });

  it('SCOUT_INSTRUCTIONS now teach capability-walk and design-doc filtering', () => {
    const report = buildScoutReportForProject('sample-monorepo', fixtureProject);
    const joined = report.instructions.join('\n');
    expect(joined).toContain('CAPABILITY-WALK');
    expect(joined).toContain('userFacingScreens');
    expect(joined).toContain('NOT-A-PATTERN');
    expect(joined).toContain('design docs');
  });

  it('returns a friendly error when the project is missing from the registry', () => {
    const registry: Registry = { projects: {} };
    const result = buildScoutReport('does-not-exist', registry);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not found');
  });

  it('returns a friendly error when the project path no longer exists', () => {
    const registry: Registry = {
      projects: {
        ghost: { ...fixtureProject, path: '/tmp/does-not-exist-' + Date.now() },
      },
    };
    const result = buildScoutReport('ghost', registry);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('does not exist');
  });
});
