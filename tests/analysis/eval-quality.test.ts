import { describe, it, expect } from 'vitest';
import {
  buildJudgePrompt,
  parseJudgeReport,
  renderReport,
  reportFilename,
  type JudgeReport,
  type ReportMeta,
} from '../../src/analysis/eval-quality';
import type { Cluster } from '../../src/shared/types';

const sampleClusters: Cluster[] = [
  {
    capability: 'Document upload',
    description: 'Cross-project upload pipelines.',
    members: [
      { project: 'foo', patternKey: 'chunked-upload', summary: 'chunked with retry' },
      { project: 'bar', patternKey: 'drag-drop', summary: 'web dropzone' },
    ],
    similarities: 'Both move bytes to storage.',
    differences: 'foo is mobile, bar is web.',
    consolidationNote: 'Could share an interface.',
  },
];

const samplePatterns = [
  { project: 'foo', key: 'chunked-upload', description: 'Chunked uploads with retry' },
  { project: 'bar', key: 'drag-drop', description: 'Drag-drop web dropzone' },
];

const sampleJudgeReport: JudgeReport = {
  overall: 4,
  rubric: {
    coherence: 5,
    similarity_quality: 3,
    difference_quality: 4,
    consolidation_usefulness: 4,
    granularity: 5,
  },
  weaknesses: [
    {
      cluster_name: 'Document upload',
      issue: 'similarities prose is shallow',
      evidence: 'Both move bytes to storage.',
    },
  ],
  suggestions: ['Ask the model for at least 2 sentences in similarities, citing concrete shared mechanisms.'],
};

const sampleMeta: ReportMeta = {
  generatedAt: new Date('2026-05-04T12:34:00.000Z'),
  fixtureName: 'tests/fixtures/analysis/registry.json',
  patternCount: 18,
  projectCount: 5,
  analysisElapsedSec: 60,
  judgeElapsedSec: 20,
};

describe('buildJudgePrompt', () => {
  it('contains the rubric definitions and required JSON shape', () => {
    const prompt = buildJudgePrompt(sampleClusters, samplePatterns);
    expect(prompt).toContain('coherence');
    expect(prompt).toContain('similarity_quality');
    expect(prompt).toContain('difference_quality');
    expect(prompt).toContain('consolidation_usefulness');
    expect(prompt).toContain('granularity');
    expect(prompt).toContain('"overall"');
    expect(prompt).toContain('"rubric"');
    expect(prompt).toContain('"weaknesses"');
    expect(prompt).toContain('"suggestions"');
  });

  it('embeds the actual cluster JSON for the judge to inspect', () => {
    const prompt = buildJudgePrompt(sampleClusters, samplePatterns);
    expect(prompt).toContain('"capability": "Document upload"');
    expect(prompt).toContain('"chunked-upload"');
  });

  it('embeds the patterns list', () => {
    const prompt = buildJudgePrompt(sampleClusters, samplePatterns);
    expect(prompt).toContain('"chunked-upload"');
    expect(prompt).toContain('"drag-drop"');
  });
});

describe('parseJudgeReport', () => {
  const valid = JSON.stringify(sampleJudgeReport);

  it('parses a clean response', () => {
    const parsed = parseJudgeReport(valid);
    expect(parsed.overall).toBe(4);
    expect(parsed.rubric.coherence).toBe(5);
    expect(parsed.weaknesses).toHaveLength(1);
  });

  it('strips markdown fences', () => {
    const fenced = '```json\n' + valid + '\n```';
    expect(parseJudgeReport(fenced).overall).toBe(4);
  });

  it('rejects scores outside 1-5', () => {
    const bad = JSON.stringify({ ...sampleJudgeReport, overall: 7 });
    expect(() => parseJudgeReport(bad)).toThrow();
  });

  it('rejects missing rubric dimensions', () => {
    const bad = JSON.stringify({
      ...sampleJudgeReport,
      rubric: { ...sampleJudgeReport.rubric, granularity: undefined },
    });
    expect(() => parseJudgeReport(bad)).toThrow();
  });

  it('rejects malformed weaknesses', () => {
    const bad = JSON.stringify({
      ...sampleJudgeReport,
      weaknesses: [{ cluster_name: 'X' }],
    });
    expect(() => parseJudgeReport(bad)).toThrow();
  });
});

describe('renderReport', () => {
  it('contains all required markdown sections', () => {
    const md = renderReport(sampleJudgeReport, sampleClusters, sampleMeta);
    expect(md).toContain('# Cluster quality report');
    expect(md).toContain('## Overall score');
    expect(md).toContain('**4.0 / 5**');
    expect(md).toContain('## Rubric');
    expect(md).toContain('Cluster coherence');
    expect(md).toContain('Granularity / abstraction level');
    expect(md).toContain('## Weaknesses');
    expect(md).toContain('## Suggestions');
    expect(md).toContain('## Item names (for quick reference)');
  });

  it('quotes verbatim weakness evidence as a markdown blockquote', () => {
    const md = renderReport(sampleJudgeReport, sampleClusters, sampleMeta);
    expect(md).toContain('> Both move bytes to storage.');
  });

  it('includes timing meta', () => {
    const md = renderReport(sampleJudgeReport, sampleClusters, sampleMeta);
    expect(md).toContain('analysis 60s');
    expect(md).toContain('judge 20s');
  });

  it('handles an empty weaknesses array', () => {
    const md = renderReport({ ...sampleJudgeReport, weaknesses: [] }, sampleClusters, sampleMeta);
    expect(md).toContain('_None flagged._');
  });
});

describe('reportFilename', () => {
  it('returns YYYY-MM-DD-HHMM.md format', () => {
    const name = reportFilename(new Date('2026-05-04T13:07:00.000Z'));
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2}-\d{4}\.md$/);
  });

  it('produces different filenames for different minutes', () => {
    const a = reportFilename(new Date('2026-05-04T13:07:00.000Z'));
    const b = reportFilename(new Date('2026-05-04T13:08:00.000Z'));
    expect(a).not.toBe(b);
  });
});
