import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { runAnalysis, type ClaudeRunner } from '../../src/analysis/runner';
import type { Cluster, Registry } from '../../src/shared/types';

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

function findCluster(clusters: Cluster[], expected: ExpectedCluster): Cluster | undefined {
  const lowerKeywords = expected.capabilityKeywords.map((k) => k.toLowerCase());
  return clusters.find((c) => {
    const lowerName = c.capability.toLowerCase();
    return lowerKeywords.some((k) => lowerName.includes(k));
  });
}

function memberKey(m: { project: string; patternKey: string }): string {
  return `${m.project}::${m.patternKey}`;
}

function diagnoseClusters(clusters: Cluster[], expected: ExpectedClustersFile): string[] {
  const failures: string[] = [];

  for (const expectedCluster of expected.clusters) {
    const actual = findCluster(clusters, expectedCluster);
    if (!actual) {
      failures.push(
        `MISSING cluster matching keywords [${expectedCluster.capabilityKeywords.join(', ')}]. Got capability names: ${clusters.map((c) => c.capability).join(' | ')}`,
      );
      continue;
    }
    if (actual.members.length < expectedCluster.minMembers) {
      failures.push(
        `Cluster "${actual.capability}" has ${actual.members.length} member(s); expected at least ${expectedCluster.minMembers}.`,
      );
    }
    const actualKeys = new Set(actual.members.map(memberKey));
    for (const required of expectedCluster.requiredMembers) {
      if (!actualKeys.has(memberKey(required))) {
        failures.push(
          `Cluster "${actual.capability}" missing required member ${memberKey(required)}. Got: [${[...actualKeys].join(', ')}]`,
        );
      }
    }
  }

  // Membership check — every fixture pattern is assigned to exactly one cluster
  const fixtureRegistry = loadFixtureRegistry();
  const fixturePatterns: string[] = [];
  for (const [project, p] of Object.entries(fixtureRegistry.projects)) {
    for (const key of Object.keys(p.patterns ?? {})) {
      fixturePatterns.push(memberKey({ project, patternKey: key }));
    }
  }

  const assigned: Record<string, number> = {};
  for (const cluster of clusters) {
    for (const m of cluster.members) {
      const k = memberKey(m);
      assigned[k] = (assigned[k] ?? 0) + 1;
    }
  }
  for (const fp of fixturePatterns) {
    if (!assigned[fp]) failures.push(`Pattern ${fp} is not assigned to any cluster.`);
    if (assigned[fp] > 1) failures.push(`Pattern ${fp} is assigned to ${assigned[fp]} clusters (must be exactly 1).`);
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
    const recorded = JSON.parse(loadRecordedResponse()).clusters as Cluster[];
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
