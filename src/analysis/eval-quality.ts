import { z } from 'zod';
import type { Cluster } from '../shared/types.js';
import type { PatternEntry } from './prompt.js';
import { stripCodeFences } from './runner.js';

export const RubricSchema = z.object({
  coherence: z.number().min(1).max(5),
  similarity_quality: z.number().min(1).max(5),
  difference_quality: z.number().min(1).max(5),
  consolidation_usefulness: z.number().min(1).max(5),
  granularity: z.number().min(1).max(5),
});

export const JudgeReportSchema = z.object({
  overall: z.number().min(1).max(5),
  rubric: RubricSchema,
  weaknesses: z.array(z.object({
    cluster_name: z.string(),
    issue: z.string(),
    evidence: z.string(),
  })),
  suggestions: z.array(z.string()),
});

export type JudgeReport = z.infer<typeof JudgeReportSchema>;

export function buildJudgePrompt(clusters: Cluster[], patterns: PatternEntry[]): string {
  return `You are a strict reviewer with deep code-reuse-domain expertise. Below is a clustering of patterns across multiple software projects, produced by another LLM. Your job is to score the output against a rubric and surface concrete, actionable weaknesses.

Score each rubric item 1-5 (1 = poor, 5 = excellent):
- coherence: do the members of each cluster genuinely share the same capability?
- similarity_quality: are the "similarities" prose substantive and specific, or boilerplate ("they are similar")?
- difference_quality: are the "differences" prose substantive and specific?
- consolidation_usefulness: when consolidationNote is present, is it concrete and actionable? (Score 5 if the absence of consolidationNote is appropriate for the cluster.)
- granularity: are cluster names at a consistently high-level abstraction (e.g. "Document upload", "Encryption") rather than project-specific or overly specific names?

Return strict JSON, no prose, no markdown fences:
{
  "overall": <1-5>,
  "rubric": {
    "coherence": <1-5>,
    "similarity_quality": <1-5>,
    "difference_quality": <1-5>,
    "consolidation_usefulness": <1-5>,
    "granularity": <1-5>
  },
  "weaknesses": [
    { "cluster_name": "<exact capability>", "issue": "specific problem", "evidence": "verbatim quote from the cluster output" }
  ],
  "suggestions": [ "actionable prompt or rubric improvement" ]
}

Patterns analyzed (${patterns.length}):
${JSON.stringify(patterns, null, 2)}

Cluster output to score (${clusters.length} clusters):
${JSON.stringify(clusters, null, 2)}`;
}

export function parseJudgeReport(raw: string): JudgeReport {
  const cleaned = stripCodeFences(raw);
  const parsed = JSON.parse(cleaned);
  return JudgeReportSchema.parse(parsed);
}

export type ReportMeta = {
  generatedAt: Date;
  fixtureName: string;
  patternCount: number;
  projectCount: number;
  analysisElapsedSec: number;
  judgeElapsedSec: number;
};

export function renderReport(report: JudgeReport, clusters: Cluster[], meta: ReportMeta): string {
  const date = meta.generatedAt.toISOString();
  const lines: string[] = [];
  lines.push(`# Cluster quality report — ${date}`);
  lines.push('');
  lines.push(`**Fixture:** \`${meta.fixtureName}\` — ${meta.patternCount} patterns across ${meta.projectCount} projects`);
  lines.push(`**Timing:** analysis ${meta.analysisElapsedSec}s · judge ${meta.judgeElapsedSec}s`);
  lines.push(`**Clusters produced:** ${clusters.length}`);
  lines.push('');

  lines.push('## Overall score');
  lines.push('');
  lines.push(`**${report.overall.toFixed(1)} / 5**`);
  lines.push('');

  lines.push('## Rubric');
  lines.push('');
  lines.push('| Dimension | Score |');
  lines.push('|---|---|');
  lines.push(`| Cluster coherence | ${report.rubric.coherence} |`);
  lines.push(`| Similarity quality | ${report.rubric.similarity_quality} |`);
  lines.push(`| Difference quality | ${report.rubric.difference_quality} |`);
  lines.push(`| Consolidation usefulness | ${report.rubric.consolidation_usefulness} |`);
  lines.push(`| Granularity / abstraction level | ${report.rubric.granularity} |`);
  lines.push('');

  lines.push('## Weaknesses');
  lines.push('');
  if (report.weaknesses.length === 0) {
    lines.push('_None flagged._');
  } else {
    for (const w of report.weaknesses) {
      lines.push(`### ${w.cluster_name}`);
      lines.push('');
      lines.push(`**Issue:** ${w.issue}`);
      lines.push('');
      lines.push(`**Evidence:**`);
      lines.push('');
      lines.push('> ' + w.evidence.replace(/\n/g, '\n> '));
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## Suggestions');
  lines.push('');
  if (report.suggestions.length === 0) {
    lines.push('_None._');
  } else {
    for (const s of report.suggestions) {
      lines.push(`- ${s}`);
    }
  }
  lines.push('');

  lines.push('## Cluster names (for quick reference)');
  lines.push('');
  for (const c of clusters) {
    lines.push(`- **${c.capability}** (${c.members.length} ${c.members.length === 1 ? 'member' : 'members'})`);
  }
  lines.push('');

  return lines.join('\n');
}

export function reportFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}-${hh}${min}.md`;
}
