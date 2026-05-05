#!/usr/bin/env node
// scout-eval — measure the quality of the MCP scout (extract_patterns)
// independently of the analysis pipeline.
//
// For each ground-truth project we:
//   1. Build the scout report (deterministic; no LLM).
//   2. Ask Opus 4.7 to extract patterns FROM ONLY the scout report
//      (README excerpt + package.json + tree + suggestedFilesToRead +
//      userFacingScreens + instructions). No file reads — this is testing
//      the scout's signal density, not the AI's tool use.
//   3. Ask Opus 4.7 (separate call, judge role) to score the proposals
//      against the hand-curated ground-truth capabilities for that project.
//
// Scores per project:
//   - coverage:  ground-truth capabilities the proposals touched (0..1)
//   - precision: proposals that are real reusable patterns, not noise (0..1)
//   - noise:     proposals that are design-docs/mockups/PRDs (lower = better)
//
// Run: node scripts/scout-eval.mjs
//
// Requires: ANTHROPIC_API_KEY in env or .env.local.

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { buildScoutReportForProject } from '../dist/analysis/scout.js';

const REGISTRY_PATH = path.join(process.env.HOME, '.reuse/registry.json');

// Hand-curated ground truth: for each project, the capabilities a careful
// human reader would expect to see named as patterns. These were chosen by
// reading the README + screens — not by looking at existing patterns — so
// they reflect "what should the scout enable the AI to find?"
const GROUND_TRUTH = {
  jenkins: [
    'multimodal image-to-AI flow (camera/library → compress → Gemini multimodal)',
    'Gemini Cloud Function proxy with quota / rate limit / endpoint allowlist',
    'in-flight AI response recovery so users can leave & return',
    'global toast system as a Context provider',
    'centralised error-message catalogue',
    'firebase JS SDK on RN for Expo Go compatibility',
    'tested gemini service (heavy unit tests on prompt/response)',
    'reusable barcode/label scan modal',
  ],
  schoolsync: [
    'document upload + AI extraction pipeline (multi-stage with clarification loop)',
    'storage mutex serialising concurrent writes per data type',
    'field-level two-way merge for offline-first sync',
    'Gmail HTML extraction pipeline',
    'background fetch + scheduled server-side sync',
    'visible upload queue surfaced as first-class UI',
    'encrypted local-first storage (libsodium + secure-store)',
    'context-per-domain architecture (many narrow contexts)',
    'share-intent ingestion from other apps',
    'structured prompt library (typed TS constants)',
  ],
  trendlens: [
    'Anthropic tool registry with domain handlers (large declarative tool[] array)',
    'fleet of financial data-source services (many providers behind one façade)',
    '5-layer LLM derivation tree (macro → mechanism → segment → opportunity → vehicles)',
    'interactive derivation tree canvas UI',
    'background-task provider pattern (tasks survive route changes)',
    'first-class mocks folder (develop without real API keys)',
    'visual UAT screenshot script',
    'methodology + glossary as code (imported by prompts and UI)',
    'embedded SQLite via Drizzle for a fully-local Next.js app',
  ],
  secondbrain: [
    'AI knowledge-base linter (FINDING:{json}-per-line protocol)',
    'output-format registry (report/cheat/summary/deck/infographic via buildPrompt)',
    'in-app help as a typed TS content module (prepended to LLM prompts)',
    'typed job error codes with friendly UI messages',
    'nested multi-tenant projects with cascade delete',
    'multi-provider model routing (Claude / Gemini / Ollama with per-job-type model)',
    'wiki taxonomy folders (concepts / entities / sources / synthesis / queries / outputs)',
    'bundled MCP server in the same repo',
    'timestamped backup tarballs before risky operations',
    'puppeteer demo-gif capture pipeline',
  ],
};

const EXTRACT_PROMPT = (report) => `You are a senior engineer reading a scouting report for a codebase you have never seen. Identify the reusable patterns that another engineer would want to find when starting a similar project.

You can ONLY use the information in this scouting report. You do NOT have file-read access — work strictly from the README excerpt, package.json, directory tree, suggestedFilesToRead, and userFacingScreens.

Follow the instructions in the report, especially the CAPABILITY-WALK and NOT-A-PATTERN guidance.

Return a JSON object: { "patterns": [{ "name": "kebab-case", "capability": "kebab-case", "description": "1-2 sentences referencing exact paths" }, ...] }. Aim for 6-10 patterns. NO prose outside the JSON.

SCOUT REPORT:
${JSON.stringify(report, null, 2)}`;

const JUDGE_PROMPT = (project, groundTruth, proposals) => `You are evaluating the output of a pattern-extraction system. Compare the proposed patterns against the ground-truth capabilities a careful human would have identified.

PROJECT: ${project}

GROUND-TRUTH CAPABILITIES (what we expect to be named):
${groundTruth.map((g, i) => `${i + 1}. ${g}`).join('\n')}

PROPOSED PATTERNS:
${JSON.stringify(proposals, null, 2)}

Score the proposals on three dimensions:

1. COVERAGE — for each of the ${groundTruth.length} ground-truth capabilities, did ANY proposed pattern address it? Allow loose semantic matches (different name, same idea). Output array of booleans, one per ground-truth item.

2. PRECISION — for each proposed pattern, is it a real reusable pattern (true) or noise / restating-framework-conventions / a design-doc (false)? Output array of booleans, one per proposed pattern.

3. NOISE — count of proposed patterns that are design docs / mockups / PRDs / HTML mockups (i.e. things that describe intent rather than reusable code).

Return JSON only: { "coverage_hits": [bool, ...], "precision_hits": [bool, ...], "noise_count": <number>, "notes": "<one short paragraph>" }`;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callClaude(prompt) {
  const res = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  // Strip code fences.
  return text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY. Add it to .env.local.');
    process.exit(1);
  }
  const reg = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));

  const summary = [];
  for (const [name, gt] of Object.entries(GROUND_TRUTH)) {
    const project = reg.projects[name];
    if (!project) {
      console.error(`SKIP ${name}: not in registry`);
      continue;
    }
    process.stdout.write(`\n=== ${name} ===\n`);
    const report = buildScoutReportForProject(name, project);
    process.stdout.write(`scout: tree=${report.directoryTree.split('\n').length} lines, suggested=${report.suggestedFilesToRead.length}, screens=${report.userFacingScreens.length}\n`);

    process.stdout.write('extracting... ');
    const extractRaw = await callClaude(EXTRACT_PROMPT(report));
    let proposals;
    try { proposals = JSON.parse(extractRaw); }
    catch { console.error('extract parse failed:', extractRaw.slice(0, 200)); continue; }
    process.stdout.write(`${proposals.patterns.length} patterns\n`);

    process.stdout.write('judging... ');
    const judgeRaw = await callClaude(JUDGE_PROMPT(name, gt, proposals.patterns));
    let judgment;
    try { judgment = JSON.parse(judgeRaw); }
    catch { console.error('judge parse failed:', judgeRaw.slice(0, 200)); continue; }

    const coverage = judgment.coverage_hits.filter(Boolean).length / gt.length;
    const precision = judgment.precision_hits.filter(Boolean).length / proposals.patterns.length;
    const noiseRate = judgment.noise_count / proposals.patterns.length;

    process.stdout.write(`coverage=${(coverage * 100).toFixed(0)}% precision=${(precision * 100).toFixed(0)}% noise=${(noiseRate * 100).toFixed(0)}%\n`);
    process.stdout.write(`judge notes: ${judgment.notes}\n`);

    summary.push({ project: name, coverage, precision, noiseRate, proposals: proposals.patterns.length, gtCount: gt.length });
  }

  console.log('\n=== SUMMARY ===');
  console.log('project'.padEnd(15), 'coverage'.padEnd(10), 'precision'.padEnd(10), 'noise'.padEnd(10), 'proposed/gt');
  for (const r of summary) {
    console.log(
      r.project.padEnd(15),
      `${(r.coverage * 100).toFixed(0)}%`.padEnd(10),
      `${(r.precision * 100).toFixed(0)}%`.padEnd(10),
      `${(r.noiseRate * 100).toFixed(0)}%`.padEnd(10),
      `${r.proposals}/${r.gtCount}`,
    );
  }
  const avgCov = summary.reduce((s, r) => s + r.coverage, 0) / summary.length;
  const avgPre = summary.reduce((s, r) => s + r.precision, 0) / summary.length;
  console.log('average'.padEnd(15), `${(avgCov * 100).toFixed(0)}%`.padEnd(10), `${(avgPre * 100).toFixed(0)}%`);
}

main().catch((e) => { console.error(e); process.exit(1); });
