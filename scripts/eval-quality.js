#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultClaudeRunner,
  runAnalysis,
  runnerFromProvider,
} from '../dist/analysis/runner.js';
import {
  collectPatterns,
} from '../dist/analysis/prompt.js';
import {
  buildJudgePrompt,
  parseJudgeReport,
  renderReport,
  reportFilename,
} from '../dist/analysis/eval-quality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fixturePath = path.join(repoRoot, 'tests/fixtures/analysis/registry.json');
const reportsDir = path.join(repoRoot, 'eval-results');

const log = (msg) => console.log(`[eval-quality] ${msg}`);

async function pickAnalysisRunner() {
  if (process.env.REUSE_ANALYSIS_PROVIDER && process.env.REUSE_ANALYSIS_MODEL) {
    return await runnerFromProvider(process.env.REUSE_ANALYSIS_PROVIDER, process.env.REUSE_ANALYSIS_MODEL);
  }
  return defaultClaudeRunner;
}

async function pickJudgeRunner() {
  if (process.env.REUSE_JUDGE_PROVIDER && process.env.REUSE_JUDGE_MODEL) {
    return await runnerFromProvider(process.env.REUSE_JUDGE_PROVIDER, process.env.REUSE_JUDGE_MODEL);
  }
  // Strong-judge defaults — pick the most capable available model so the rubric
  // is reliable. User can override via env if they want to economize.
  if (process.env.ANTHROPIC_API_KEY) return await runnerFromProvider('anthropic', 'claude-opus-4-7');
  if (process.env.GOOGLE_API_KEY) return await runnerFromProvider('gemini', 'gemini-3.1-pro-preview');
  if (process.env.OPENAI_API_KEY) return await runnerFromProvider('openai', 'gpt-5.5');
  return defaultClaudeRunner;
}

async function main() {
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found at ${fixturePath}`);
  }
  const registry = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const patterns = collectPatterns(registry);
  const projectCount = Object.keys(registry.projects).length;

  const analysisRunner = await pickAnalysisRunner();
  const judgeRunner = await pickJudgeRunner();
  const analysisLabel = process.env.REUSE_ANALYSIS_PROVIDER && process.env.REUSE_ANALYSIS_MODEL
    ? `${process.env.REUSE_ANALYSIS_PROVIDER}/${process.env.REUSE_ANALYSIS_MODEL}`
    : 'default (Anthropic Sonnet 4.6)';
  const judgeLabel = process.env.REUSE_JUDGE_PROVIDER && process.env.REUSE_JUDGE_MODEL
    ? `${process.env.REUSE_JUDGE_PROVIDER}/${process.env.REUSE_JUDGE_MODEL}`
    : 'auto-strong (Opus 4.7 / Gemini 3.1 Pro / GPT-5.5)';

  log(`fixture: ${patterns.length} patterns across ${projectCount} projects`);
  log(`analysis runner: ${analysisLabel}`);
  log(`judge runner: ${judgeLabel}`);
  log('running analysis…');
  const analysisStart = Date.now();
  const clusters = await runAnalysis({ registry, runner: analysisRunner });
  const analysisElapsedSec = Math.round((Date.now() - analysisStart) / 1000);
  log(`analysis done in ${analysisElapsedSec}s — ${clusters.length} clusters`);

  log('scoring with judge…');
  const judgePrompt = buildJudgePrompt(clusters, patterns);
  const judgeStart = Date.now();
  const rawJudge = await judgeRunner(judgePrompt);
  const judgeElapsedSec = Math.round((Date.now() - judgeStart) / 1000);
  log(`judge done in ${judgeElapsedSec}s`);

  let judgeReport;
  try {
    judgeReport = parseJudgeReport(rawJudge);
  } catch (err) {
    log('FAILED to parse judge output — dumping raw output to eval-results/last-judge-raw.txt');
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'last-judge-raw.txt'), rawJudge);
    throw err;
  }

  const meta = {
    generatedAt: new Date(),
    fixtureName: 'tests/fixtures/analysis/registry.json',
    patternCount: patterns.length,
    projectCount,
    analysisElapsedSec,
    judgeElapsedSec,
  };
  const markdown = renderReport(judgeReport, clusters, meta);
  fs.mkdirSync(reportsDir, { recursive: true });
  const filename = reportFilename(meta.generatedAt);
  const outPath = path.join(reportsDir, filename);
  fs.writeFileSync(outPath, markdown);
  log(`report written to ${outPath}`);
  log(`overall score: ${judgeReport.overall.toFixed(1)} / 5`);
}

main().catch((err) => {
  console.error(`[eval-quality] failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
