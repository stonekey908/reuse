import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runAnalysis, type ClaudeRunner } from '../../src/analysis/runner';
import type { AnalysisItem, Registry } from '../../src/shared/types';

type ExpectedCluster = {
  capabilityKeywords: string[];
  minMembers: number;
  requiredMembers: Array<{ project: string; patternKey: string }>;
};

type ExpectedClustersFile = {
  clusters: ExpectedCluster[];
};

const fixtureDir = path.resolve(__dirname, '../fixtures/analysis');

function loadFixtureRegistry(): Registry {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, 'registry.json'), 'utf-8'));
}

function loadRecordedResponse(): string {
  return fs.readFileSync(path.join(fixtureDir, 'recorded-response.json'), 'utf-8');
}

function loadExpectedClusters(): ExpectedClustersFile {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, 'expected-clusters.json'), 'utf-8'));
}

function itemMembers(item: AnalysisItem): Array<{ project: string; patternKey: string }> {
  return item.kind === 'standalone' ? [item.member] : item.members;
}

function findCluster(items: AnalysisItem[], expected: ExpectedCluster): AnalysisItem | undefined {
  const lowerKeywords = expected.capabilityKeywords.map((k) => k.toLowerCase());
  return items.find((c) => {
    const lowerName = c.capability.toLowerCase();
    return lowerKeywords.some((k) => lowerName.includes(k));
  });
}

function memberKey(m: { project: string; patternKey: string }): string {
  return `${m.project}::${m.patternKey}`;
}

function diagnoseClusters(items: AnalysisItem[], expected: ExpectedClustersFile): string[] {
  const failures: string[] = [];

  for (const expectedCluster of expected.clusters) {
    const actual = findCluster(items, expectedCluster);
    if (!actual) {
      failures.push(
        `MISSING cluster matching keywords [${expectedCluster.capabilityKeywords.join(', ')}]. Got capability names: ${items.map((c) => c.capability).join(' | ')}`,
      );
      continue;
    }
    const members = itemMembers(actual);
    if (members.length < expectedCluster.minMembers) {
      failures.push(
        `Cluster "${actual.capability}" has ${members.length} member(s); expected at least ${expectedCluster.minMembers}.`,
      );
    }
    const actualKeys = new Set(members.map(memberKey));
    for (const required of expectedCluster.requiredMembers) {
      if (!actualKeys.has(memberKey(required))) {
        failures.push(
          `Cluster "${actual.capability}" missing required member ${memberKey(required)}. Got: [${[...actualKeys].join(', ')}]`,
        );
      }
    }
  }

  // Membership check — every fixture pattern is assigned to exactly one item
  const fixtureRegistry = loadFixtureRegistry();
  const fixturePatterns: string[] = [];
  for (const [project, p] of Object.entries(fixtureRegistry.projects)) {
    for (const key of Object.keys(p.patterns ?? {})) {
      fixturePatterns.push(memberKey({ project, patternKey: key }));
    }
  }

  const assigned: Record<string, number> = {};
  for (const item of items) {
    for (const m of itemMembers(item)) {
      const k = memberKey(m);
      assigned[k] = (assigned[k] ?? 0) + 1;
    }
  }
  for (const fp of fixturePatterns) {
    if (!assigned[fp]) failures.push(`Pattern ${fp} is not assigned to any item.`);
    if (assigned[fp] > 1) failures.push(`Pattern ${fp} is assigned to ${assigned[fp]} items (must be exactly 1).`);
  }

  return failures;
}

describe('snapshot eval (E1)', () => {
  it('mocked: recorded response satisfies the fuzzy-match expectations', async () => {
    const recorded = loadRecordedResponse();
    const runner: ClaudeRunner = async () => recorded;
    const clusters = await runAnalysis({ registry: loadFixtureRegistry(), runner });
    const expected = loadExpectedClusters();
    const failures = diagnoseClusters(clusters, expected);
    if (failures.length > 0) {
      throw new Error(`Snapshot failures:\n  - ${failures.join('\n  - ')}`);
    }
    expect(failures).toEqual([]);
  });

  it('mocked: returns the same number of clusters as the recorded response', async () => {
    const recorded = JSON.parse(loadRecordedResponse()).clusters as AnalysisItem[];
    const runner: ClaudeRunner = async () => loadRecordedResponse();
    const clusters = await runAnalysis({ registry: loadFixtureRegistry(), runner });
    expect(clusters).toHaveLength(recorded.length);
  });

  it.runIf(process.env.RUN_LLM_EVALS === '1')(
    'real: live claude -p run satisfies fuzzy-match expectations',
    async () => {
      const clusters = await runAnalysis({ registry: loadFixtureRegistry() });
      const expected = loadExpectedClusters();
      const failures = diagnoseClusters(clusters, expected);
      if (failures.length > 0) {
        const namesLine = `Capabilities: ${clusters.map((c) => c.capability).join(' | ')}`;
        throw new Error(`Real-mode snapshot failures:\n${namesLine}\n  - ${failures.join('\n  - ')}`);
      }
      expect(failures).toEqual([]);
    },
    600_000,
  );
});
