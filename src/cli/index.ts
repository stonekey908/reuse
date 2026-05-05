#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { loadRegistry, saveRegistry } from '../shared/registry.js';
import { searchProjects } from '../shared/search.js';
import { getStaleness, writeAnalysis } from '../analysis/cache.js';
import {
  ClaudeNotFoundError,
  JsonParseError,
  runAnalysis,
} from '../analysis/runner.js';
import type { Analysis, AnalysisItem } from '../shared/types.js';
import { backfillTags } from '../analysis/agents/backfill.js';
import type { ProviderId } from '../analysis/providers/index.js';

const program = new Command();

program
  .name('reuse')
  .description('Codebase registry — reference patterns across your projects')
  .version('0.1.0');

program
  .command('list')
  .description('List all registered projects')
  .action(() => {
    const registry = loadRegistry();
    const entries = Object.entries(registry.projects);

    if (entries.length === 0) {
      console.log('No projects registered. Use "reuse add <name> <path>" to register one.');
      return;
    }

    for (const [name, project] of entries) {
      console.log(`\n  ${name}`);
      console.log(`    Path: ${project.path}`);
      if (project.description) console.log(`    Desc: ${project.description}`);
      if (project.tags?.length) console.log(`    Tags: ${project.tags.join(', ')}`);
      if (project.patterns && Object.keys(project.patterns).length > 0) {
        const taggedCount = Object.values(project.patterns).filter((p) => p.capability).length;
        const total = Object.keys(project.patterns).length;
        const tagSuffix = taggedCount > 0 ? `  (${taggedCount}/${total} tagged)` : '';
        console.log(`    Patterns: ${Object.keys(project.patterns).join(', ')}${tagSuffix}`);
      }
      if (project.git) console.log(`    Git:  ${project.git}`);
    }
    console.log();
  });

program
  .command('search <query>')
  .description('Search projects by keyword')
  .action((query: string) => {
    const registry = loadRegistry();
    const results = searchProjects(registry, query);

    if (results.length === 0) {
      console.log(`No matches for "${query}".`);
      return;
    }

    for (const result of results) {
      console.log(`\n  ${result.name} (matched: ${result.matchedOn.join(', ')})`);
      console.log(`    ${result.project.description || 'No description'}`);
      console.log(`    Path: ${result.project.path}`);
    }
    console.log();
  });

program
  .command('add <name> <projectPath>')
  .description('Register a new project')
  .option('-d, --description <desc>', 'Project description')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-g, --git <url>', 'Git remote URL')
  .action((name: string, projectPath: string, opts: { description?: string; tags?: string; git?: string }) => {
    const registry = loadRegistry();

    if (registry.projects[name]) {
      console.error(`Project "${name}" already exists.`);
      process.exit(1);
    }

    const resolvedPath = path.resolve(projectPath);
    if (!fs.existsSync(resolvedPath)) {
      console.error(`Path does not exist: ${resolvedPath}`);
      process.exit(1);
    }

    registry.projects[name] = {
      path: resolvedPath,
      description: opts.description || '',
      tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : [],
      patterns: {},
      git: opts.git,
      links: {},
    };

    saveRegistry(registry);
    console.log(`Registered "${name}" at ${resolvedPath}`);
  });

program
  .command('remove <name>')
  .description('Unregister a project (does not delete files)')
  .action((name: string) => {
    const registry = loadRegistry();

    if (!registry.projects[name]) {
      console.error(`Project "${name}" not found.`);
      process.exit(1);
    }

    delete registry.projects[name];
    saveRegistry(registry);
    console.log(`Removed "${name}" from registry.`);
  });

program
  .command('tag <name> <tags...>')
  .description('Add tags to a project')
  .action((name: string, tags: string[]) => {
    const registry = loadRegistry();
    const project = registry.projects[name];

    if (!project) {
      console.error(`Project "${name}" not found.`);
      process.exit(1);
    }

    const existing = new Set(project.tags || []);
    for (const tag of tags) existing.add(tag);
    project.tags = [...existing];

    saveRegistry(registry);
    console.log(`Tags for "${name}": ${project.tags.join(', ')}`);
  });

program
  .command('pattern <name> <key> <description>')
  .description('Add or update a named pattern for a project')
  .action((name: string, key: string, description: string) => {
    const registry = loadRegistry();
    const project = registry.projects[name];

    if (!project) {
      console.error(`Project "${name}" not found.`);
      process.exit(1);
    }

    if (!project.patterns) project.patterns = {};
    project.patterns[key] = { description, fileEvidence: [] };

    saveRegistry(registry);
    console.log(`Pattern "${key}" added to "${name}".`);
  });

program
  .command('serve')
  .description('Start the web UI for managing the registry')
  .option('-p, --port <port>', 'Port number', '3210')
  .action(async (opts: { port: string }) => {
    const { startServer } = await import('./serve.js');
    startServer(parseInt(opts.port, 10));
  });

// ─── Analysis & Evals ───

function printAnalysis(analysis: Analysis, source: 'cached' | 'fresh'): void {
  const items = analysis.clusters;
  const clusterCount = items.filter((i) => i.kind !== 'standalone').length;
  const standaloneCount = items.filter((i) => i.kind === 'standalone').length;
  console.log();
  console.log(`  ${clusterCount} cluster${clusterCount === 1 ? '' : 's'} · ${standaloneCount} standalone · ${source} · generated ${analysis.generatedAt}`);
  console.log();
  for (const item of items) {
    printItem(item);
  }
}

function printItem(item: AnalysisItem): void {
  if (item.kind === 'standalone') {
    console.log(`  ▏ ${item.capability}  (standalone)`);
    console.log(`     ${item.description}`);
    console.log(`       · ${item.member.project}/${item.member.patternKey}  —  ${item.member.summary}`);
    console.log(`     Rationale:        ${item.rationale}`);
    console.log(`     Closest relative: ${item.closestRelative}`);
    if (item.notes) console.log(`     Notes: ${item.notes}`);
    console.log();
    return;
  }
  console.log(`  ▍ ${item.capability}  (${item.members.length} ${item.members.length === 1 ? 'pattern' : 'patterns'})`);
  console.log(`     ${item.description}`);
  for (const m of item.members) {
    console.log(`       · ${m.project}/${m.patternKey}  —  ${m.summary}`);
  }
  console.log(`     Similarities: ${item.similarities}`);
  console.log(`     Differences:  ${item.differences}`);
  if (item.consolidationNote) {
    console.log(`     → Consolidate: ${item.consolidationNote}`);
  }
  console.log();
}

program
  .command('analyze')
  .description('Cluster patterns across all registered projects (cached; uses claude -p)')
  .option('-r, --refresh', 'Force a re-run even if the cached analysis is fresh')
  .action(async (opts: { refresh?: boolean }) => {
    try {
      const registry = loadRegistry();
      const staleness = getStaleness(registry);
      const useCache = !opts.refresh && registry.analysis && !staleness.stale;

      if (useCache) {
        printAnalysis(registry.analysis!, 'cached');
        return;
      }

      const patternCount = Object.values(registry.projects).reduce(
        (sum, p) => sum + Object.keys(p.patterns ?? {}).length,
        0,
      );
      const projectCount = Object.keys(registry.projects).length;
      console.log(`\n  Running clustering analysis on ${patternCount} patterns across ${projectCount} projects (typically 3–6 min for the full registry)…\n`);

      const clusters = await runAnalysis({ registry });
      const updated = writeAnalysis(registry, clusters);
      printAnalysis(updated.analysis!, 'fresh');
    } catch (err) {
      if (err instanceof ClaudeNotFoundError) {
        console.error(`\n  ${err.message}\n`);
        process.exit(2);
      }
      if (err instanceof JsonParseError) {
        console.error(`\n  ${err.message}`);
        console.error(`\n  Raw output (first 500 chars):\n${err.rawOutput.slice(0, 500)}\n`);
        process.exit(3);
      }
      console.error(`\n  analyze failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    }
  });

function runChild(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: env ? { ...process.env, ...env } : process.env,
    });
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

program
  .command('tag-patterns')
  .description('Tag every pattern in the registry with capability/abstractionLevel/domain via the Tagger agent')
  .option('-p, --provider <id>', 'Provider id (anthropic | openai | gemini | ollama)', 'anthropic')
  .option('-m, --model <id>', 'Model id (defaults to provider default)')
  .option('-c, --concurrency <n>', 'Parallel tagger calls', '4')
  .option('--force', 'Re-tag patterns even if they already have tags', false)
  .action(async (opts: { provider: string; model?: string; concurrency: string; force?: boolean }) => {
    console.log(`\n  Running Tagger across all registered patterns via ${opts.provider}${opts.model ? `/${opts.model}` : ''} (concurrency=${opts.concurrency}${opts.force ? ', force re-tag' : ''})…\n`);
    const result = await backfillTags({
      provider: opts.provider as ProviderId,
      model: opts.model,
      concurrency: parseInt(opts.concurrency, 10),
      force: opts.force,
      onProgress: (p) => {
        if (p.current) process.stdout.write(`  ${p.tagged}/${p.total} · ${p.current.project}/${p.current.patternKey}\r`);
      },
    });
    console.log('\n');
    console.log(`  Tagged: ${result.tagged} / ${result.total}`);
    console.log(`  Already tagged (skipped): ${result.alreadyTagged}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.length}`);
      for (const e of result.errors.slice(0, 5)) console.log(`    - ${e.project}/${e.patternKey}: ${e.error}`);
    }
    if (result.newCanonicalDomains.length > 0) {
      console.log(`  Newly proposed domains: ${result.newCanonicalDomains.join(', ')}`);
    }
    if (result.newCanonicalCapabilities.length > 0) {
      console.log(`  Newly proposed capabilities: ${result.newCanonicalCapabilities.length} entries (see ~/.reuse/glossary.json)`);
    }
  });

program
  .command('eval')
  .description('Run an eval. Default: clustering snapshot (E1). Flags: --quality for cluster judge (E2), --extract for extract_patterns scout snapshot, --extract --quality for extract judge.')
  .option('-q, --quality', 'Run the LLM-as-judge eval (slower; writes a markdown report to eval-results/)')
  .option('-e, --extract', 'Eval the extract_patterns scout instead of the clustering analysis')
  .action(async (opts: { quality?: boolean; extract?: boolean }) => {
    if (opts.extract && opts.quality) {
      console.log('\n  Running extract_patterns LLM-as-judge eval — invokes claude -p twice (extraction + judge), expect ~1-2 min.\n');
      const code = await runChild('npm', ['run', 'eval:extract']);
      process.exit(code);
      return;
    }
    if (opts.extract) {
      console.log('\n  Running extract_patterns scout snapshot (deterministic, fast)…\n');
      const code = await runChild('npx', ['vitest', 'run', 'tests/analysis/scout.test.ts']);
      process.exit(code);
      return;
    }
    if (opts.quality) {
      console.log('\n  Running clustering LLM-as-judge eval — invokes claude -p twice (analysis + judge), expect ~2-3 min total.\n');
      const code = await runChild('npm', ['run', 'eval:quality']);
      process.exit(code);
      return;
    }
    console.log('\n  Running clustering snapshot eval against the fixture (real claude -p, ~30-90s)…\n');
    const code = await runChild('npx', ['vitest', 'run', 'tests/analysis/snapshot.test.ts'], { RUN_LLM_EVALS: '1' });
    process.exit(code);
  });

program.parse();
