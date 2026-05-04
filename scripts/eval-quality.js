#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultClaudeRunner,
  runAnalysis,
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

async function main() {
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture not found at ${fixturePath}`);
  }
  const registry = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
  const patterns = collectPatterns(registry);
  const projectCount = Object.keys(registry.projects).length;

  log(`fixture: ${patterns.length} patterns across ${projectCount} projects`);
  log('running analysis (claude -p, ~30-90s on the fixture)...');
  const analysisStart = Date.now();
  const clusters = await runAnalysis({ registry });
  const analysisElapsedSec = Math.round((Date.now() - analysisStart) / 1000);
  log(`analysis done in ${analysisElapsedSec}s — ${clusters.length} clusters`);

  log('scoring with judge (claude -p, second call)...');
  const judgePrompt = buildJudgePrompt(clusters, patterns);
  const judgeStart = Date.now();
  const rawJudge = await defaultClaudeRunner(judgePrompt);
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
