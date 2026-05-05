#!/usr/bin/env node
/**
 * Score the user's actual cached analysis (the real registry's clusters) against
 * the E2 judge rubric. Reuses the same prompt + parser as scripts/eval-quality.js
 * but operates on ~/.reuse/registry.json instead of the small fixture.
 *
 * Useful when the analysis has been run on the real registry (80+ patterns) and
 * you want concrete feedback on what the model produced — coverage gaps, weak
 * prose, granularity issues — without burning another full analysis run.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../dist/shared/registry.js';
import { collectPatterns } from '../dist/analysis/prompt.js';
import { runnerFromProvider } from '../dist/analysis/runner.js';
import {
  buildJudgePrompt,
  parseJudgeReport,
  renderReport,
  reportFilename,
} from '../dist/analysis/eval-quality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(repoRoot, 'eval-results');

const log = (msg) => console.log(`[eval-cached] ${msg}`);

function pickJudgeProvider() {
  const argProvider = process.env.REUSE_JUDGE_PROVIDER;
  const argModel = process.env.REUSE_JUDGE_MODEL;
  if (argProvider && argModel) return { provider: argProvider, model: argModel };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', model: 'claude-sonnet-4-6' };
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', model: 'gpt-5.4' };
  if (process.env.GOOGLE_API_KEY) return { provider: 'gemini', model: 'gemini-2.5-pro' };
  return { provider: 'ollama', model: 'qwen2.5-coder:14b' };
}

async function main() {
  const registry = loadRegistry();
  if (!registry.analysis) {
    throw new Error('No cached analysis found in ~/.reuse/registry.json. Run an analysis first.');
  }
  const patterns = collectPatterns(registry);
  const clusters = registry.analysis.clusters;
  log(`fixture: ${patterns.length} patterns across ${Object.keys(registry.projects).length} projects`);
  log(`scoring ${clusters.length} cached items (generated ${registry.analysis.generatedAt})`);

  const judge = pickJudgeProvider();
  log(`judge: ${judge.provider}/${judge.model}`);
  const judgeRunner = await runnerFromProvider(judge.provider, judge.model);

  const judgePrompt = buildJudgePrompt(clusters, patterns);
  const start = Date.now();
  const rawJudge = await judgeRunner(judgePrompt);
  const elapsedSec = Math.round((Date.now() - start) / 1000);
  log(`judge done in ${elapsedSec}s`);

  let report;
  try {
    report = parseJudgeReport(rawJudge);
  } catch (err) {
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'last-cached-judge-raw.txt'), rawJudge);
    throw new Error(`Failed to parse judge output: ${err.message}. Raw written to eval-results/last-cached-judge-raw.txt`);
  }

  const meta = {
    generatedAt: new Date(),
    fixtureName: '~/.reuse/registry.json (real registry)',
    patternCount: patterns.length,
    projectCount: Object.keys(registry.projects).length,
    analysisElapsedSec: 0,
    judgeElapsedSec: elapsedSec,
  };
  const markdown = renderReport(report, clusters, meta);
  fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, `cached-${reportFilename(meta.generatedAt)}`);
  fs.writeFileSync(outPath, markdown);
  log(`report written to ${outPath}`);
  log(`overall score: ${report.overall.toFixed(1)} / 5`);
}

main().catch((err) => {
  console.error(`[eval-cached] failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
