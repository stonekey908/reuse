import { z } from 'zod';
import type { ScoutReport } from './scout.js';
import { stripCodeFences } from './runner.js';

export const ExtractedPatternsSchema = z.object({
  patterns: z.record(z.string(), z.string()),
});

export type ExtractedPatterns = z.infer<typeof ExtractedPatternsSchema>;

export const ExtractRubricSchema = z.object({
  coverage: z.number().min(1).max(5),
  specificity: z.number().min(1).max(5),
  name_quality: z.number().min(1).max(5),
  file_path_accuracy: z.number().min(1).max(5),
});

export const ExtractJudgeReportSchema = z.object({
  overall: z.number().min(1).max(5),
  rubric: ExtractRubricSchema,
  missed_concerns: z.array(z.object({
    concern: z.string(),
    expected_module: z.string(),
    note: z.string(),
  })),
  weak_patterns: z.array(z.object({
    pattern_key: z.string(),
    issue: z.string(),
  })),
  suggestions: z.array(z.string()),
});

export type ExtractJudgeReport = z.infer<typeof ExtractJudgeReportSchema>;

export type ExpectedModule = {
  name: string;
  fileFragment: string;
  concern: string;
};

export function buildExtractionPrompt(report: ScoutReport): string {
  return `You are a senior engineer scouting a codebase for reusable patterns. Given this scouting report, identify 5-8 distinctive named patterns.

Each pattern should be:
- Non-obvious (not boilerplate any developer would reinvent).
- Transferable to other projects.
- Worth referencing rather than reinventing.

Return strict JSON, no prose, no markdown fences:
{
  "patterns": {
    "kebab-case-name": "1-2 sentence description referencing exact file paths (e.g. /packages/foo/src/bar.ts)"
  }
}

Scouting report:
${JSON.stringify(report, null, 2)}`;
}

export function buildExtractJudgePrompt(
  patterns: ExtractedPatterns,
  expectedModules: ExpectedModule[],
): string {
  return `You are a strict reviewer scoring an LLM's pattern-extraction output for a fixture monorepo. The fixture has known modules with known reusable concerns. Your job is to grade coverage against those concerns and surface concrete weaknesses.

Score each rubric item 1-5 (1 = poor, 5 = excellent):
- coverage: did the AI find at least one pattern per known module concern?
- specificity: are the descriptions specific (file paths, mechanisms) or generic?
- name_quality: are pattern names descriptive kebab-case ("gitignore-aware-file-watcher") or generic ("utils", "helpers")?
- file_path_accuracy: do the descriptions reference real file paths from the report (not invented paths)?

Return strict JSON:
{
  "overall": <1-5>,
  "rubric": {
    "coverage": <1-5>,
    "specificity": <1-5>,
    "name_quality": <1-5>,
    "file_path_accuracy": <1-5>
  },
  "missed_concerns": [
    { "concern": "<from ground truth>", "expected_module": "<module name>", "note": "<why this isn't covered>" }
  ],
  "weak_patterns": [
    { "pattern_key": "<as returned>", "issue": "<specific problem>" }
  ],
  "suggestions": [ "<actionable instruction tweak>" ]
}

Ground-truth modules (each must be covered by at least one pattern):
${JSON.stringify(expectedModules, null, 2)}

AI-extracted patterns to score:
${JSON.stringify(patterns, null, 2)}`;
}

export function parseExtractedPatterns(raw: string): ExtractedPatterns {
  const cleaned = stripCodeFences(raw);
  return ExtractedPatternsSchema.parse(JSON.parse(cleaned));
}

export function parseExtractJudgeReport(raw: string): ExtractJudgeReport {
  const cleaned = stripCodeFences(raw);
  return ExtractJudgeReportSchema.parse(JSON.parse(cleaned));
}

export type ExtractReportMeta = {
  generatedAt: Date;
  fixturePath: string;
  patternCount: number;
  extractElapsedSec: number;
  judgeElapsedSec: number;
};

export function renderExtractReport(
  judge: ExtractJudgeReport,
  patterns: ExtractedPatterns,
  meta: ExtractReportMeta,
): string {
  const lines: string[] = [];
  lines.push(`# Extract-patterns quality report — ${meta.generatedAt.toISOString()}`);
  lines.push('');
  lines.push(`**Fixture:** \`${meta.fixturePath}\``);
  lines.push(`**Timing:** extraction ${meta.extractElapsedSec}s · judge ${meta.judgeElapsedSec}s`);
  lines.push(`**Patterns extracted:** ${meta.patternCount}`);
  lines.push('');

  lines.push('## Overall score');
  lines.push('');
  lines.push(`**${judge.overall.toFixed(1)} / 5**`);
  lines.push('');

  lines.push('## Rubric');
  lines.push('');
  lines.push('| Dimension | Score |');
  lines.push('|---|---|');
  lines.push(`| Coverage | ${judge.rubric.coverage} |`);
  lines.push(`| Specificity | ${judge.rubric.specificity} |`);
  lines.push(`| Name quality | ${judge.rubric.name_quality} |`);
  lines.push(`| File-path accuracy | ${judge.rubric.file_path_accuracy} |`);
  lines.push('');

  lines.push('## Missed concerns');
  lines.push('');
  if (judge.missed_concerns.length === 0) {
    lines.push('_All ground-truth concerns covered._');
  } else {
    for (const m of judge.missed_concerns) {
      lines.push(`- **${m.concern}** (${m.expected_module}) — ${m.note}`);
    }
  }
  lines.push('');

  lines.push('## Weak patterns');
  lines.push('');
  if (judge.weak_patterns.length === 0) {
    lines.push('_None flagged._');
  } else {
    for (const w of judge.weak_patterns) {
      lines.push(`- **${w.pattern_key}** — ${w.issue}`);
    }
  }
  lines.push('');

  lines.push('## Suggestions');
  lines.push('');
  if (judge.suggestions.length === 0) {
    lines.push('_None._');
  } else {
    for (const s of judge.suggestions) lines.push(`- ${s}`);
  }
  lines.push('');

  lines.push('## Extracted patterns (verbatim)');
  lines.push('');
  for (const [key, desc] of Object.entries(patterns.patterns)) {
    lines.push(`- **${key}**: ${desc}`);
  }
  lines.push('');

  return lines.join('\n');
}

export function extractReportFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `extract-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.md`;
}
