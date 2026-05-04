#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultClaudeRunner } from '../dist/analysis/runner.js';
import { buildScoutReportForProject } from '../dist/analysis/scout.js';
import {
  buildExtractionPrompt,
  buildExtractJudgePrompt,
  parseExtractedPatterns,
  parseExtractJudgeReport,
  renderExtractReport,
  extractReportFilename,
} from '../dist/analysis/eval-extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fixtureDir = path.join(repoRoot, 'tests/fixtures/extract-patterns');
const monorepoPath = path.join(fixtureDir, 'sample-monorepo');
const expectedPath = path.join(fixtureDir, 'expected.json');
const reportsDir = path.join(repoRoot, 'eval-results');

const log = (msg) => console.log(`[eval-extract] ${msg}`);

async function main() {
  if (!fs.existsSync(monorepoPath)) throw new Error(`Fixture not found at ${monorepoPath}`);
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf-8'));
  const project = {
    path: monorepoPath,
    description: 'Turborepo fixture for extract_patterns eval',
    tags: ['turborepo', 'fixture'],
    patterns: {},
    links: {},
  };

  log('building scout report on fixture...');
  const report = buildScoutReportForProject('sample-monorepo', project);
  log(`scout: ${report.suggestedFilesToRead.length} suggested files, tree ${report.directoryTree.split('\n').length} lines`);

  log('asking claude -p to extract patterns from the report (~30-60s)...');
  const extractionPrompt = buildExtractionPrompt(report);
  const extractStart = Date.now();
  const rawPatterns = await defaultClaudeRunner(extractionPrompt);
  const extractElapsedSec = Math.round((Date.now() - extractStart) / 1000);
  log(`extraction done in ${extractElapsedSec}s`);

  let patterns;
  try {
    patterns = parseExtractedPatterns(rawPatterns);
  } catch (err) {
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'last-extract-raw.txt'), rawPatterns);
    throw new Error(`Failed to parse extraction output: ${err.message}. Raw written to eval-results/last-extract-raw.txt`);
  }
  log(`extracted ${Object.keys(patterns.patterns).length} patterns`);

  log('scoring with judge...');
  const judgePrompt = buildExtractJudgePrompt(patterns, expected.expectedModules);
  const judgeStart = Date.now();
  const rawJudge = await defaultClaudeRunner(judgePrompt);
  const judgeElapsedSec = Math.round((Date.now() - judgeStart) / 1000);
  log(`judge done in ${judgeElapsedSec}s`);

  let judge;
  try {
    judge = parseExtractJudgeReport(rawJudge);
  } catch (err) {
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(path.join(reportsDir, 'last-extract-judge-raw.txt'), rawJudge);
    throw new Error(`Failed to parse judge output: ${err.message}. Raw written to eval-results/last-extract-judge-raw.txt`);
  }

  const meta = {
    generatedAt: new Date(),
    fixturePath: 'tests/fixtures/extract-patterns/sample-monorepo',
    patternCount: Object.keys(patterns.patterns).length,
    extractElapsedSec,
    judgeElapsedSec,
  };
  const markdown = renderExtractReport(judge, patterns, meta);
  fs.mkdirSync(reportsDir, { recursive: true });
  const outPath = path.join(reportsDir, extractReportFilename(meta.generatedAt));
  fs.writeFileSync(outPath, markdown);
  log(`report written to ${outPath}`);
  log(`overall score: ${judge.overall.toFixed(1)} / 5`);
}

main().catch((err) => {
  console.error(`[eval-extract] failed: ${err instanceof Error ? err.message : String(err)}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});
