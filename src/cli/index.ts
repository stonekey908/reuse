#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { loadRegistry, saveRegistry } from '../shared/registry.js';
import { searchProjects } from '../shared/search.js';

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
        console.log(`    Patterns: ${Object.keys(project.patterns).join(', ')}`);
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
    project.patterns[key] = description;

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

program.parse();
