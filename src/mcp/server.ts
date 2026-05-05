import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ABSTRACTION_LEVELS, type Pattern } from '../shared/types.js';
import { loadRegistry, saveRegistry } from '../shared/registry.js';
import { searchProjects } from '../shared/search.js';
import { getStaleness, writeAnalysis } from '../analysis/cache.js';
import {
  ClaudeNotFoundError,
  JsonParseError,
  defaultClaudeRunner,
  runAnalysis,
  type ClaudeRunner,
} from '../analysis/runner.js';
import { buildScoutReport } from '../analysis/scout.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, spawnSync } from 'child_process';

export type CreateReuseServerOptions = {
  runner?: ClaudeRunner;
};

function findRipgrep(): string | null {
  // Check common locations
  const candidates = [
    'rg',
    '/opt/homebrew/bin/rg',
    '/usr/local/bin/rg',
  ];
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ['--version'], { encoding: 'utf-8', timeout: 3000 });
      if (result.status === 0) return candidate;
    } catch { /* try next */ }
  }
  return null;
}

function grepFallback(projectPath: string, pattern: string, fileGlob?: string): string {
  // Node.js native recursive search as fallback when ripgrep isn't available
  const results: string[] = [];
  const regex = new RegExp(pattern, 'i');
  const maxResults = 50;

  function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (fileGlob) {
          const ext = fileGlob.replace('*', '');
          if (!entry.name.endsWith(ext)) continue;
        }
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              const relPath = fullPath.replace(projectPath + '/', '');
              results.push(`${relPath}:${i + 1}:${lines[i].trim()}`);
              if (results.length >= maxResults) return;
            }
          }
        } catch { /* skip binary/unreadable files */ }
      }
    }
  }

  walk(projectPath);
  return results.join('\n');
}

// Pattern input accepted by register_project / update_project. Callers may
// pass either a bare description string (legacy / quick form) or the
// structured object with capability/abstractionLevel/domain/fileEvidence
// tags. Both shapes normalise to the structured Pattern at write time.
const PatternInputSchema = z.union([
  z.string(),
  z.object({
    description: z.string(),
    capability: z.string().optional(),
    abstractionLevel: z.enum(ABSTRACTION_LEVELS).optional(),
    domain: z.string().optional(),
    fileEvidence: z.array(z.string()).optional(),
  }),
]);

type PatternInput = z.infer<typeof PatternInputSchema>;

function normalisePatternInput(input: PatternInput): Pattern {
  if (typeof input === 'string') {
    return { description: input, fileEvidence: [] };
  }
  return {
    description: input.description,
    capability: input.capability,
    abstractionLevel: input.abstractionLevel,
    domain: input.domain,
    fileEvidence: input.fileEvidence ?? [],
  };
}

export function createReuseServer(options: CreateReuseServerOptions = {}): McpServer {
  const { runner = defaultClaudeRunner } = options;
  const server = new McpServer({
    name: 'reuse',
    version: '0.2.0',
  });

  const rgPath = findRipgrep();

  // ─── READ TOOLS ───

  server.tool(
    'list_projects',
    'List all registered projects in the codebase registry with their descriptions, tags, and patterns',
    {},
    async () => {
      const registry = loadRegistry();
      const projects = Object.entries(registry.projects).map(([name, project]) => ({
        name,
        path: project.path,
        description: project.description,
        tags: project.tags,
        patterns: project.patterns ? Object.keys(project.patterns) : [],
        git: project.git,
        links: project.links,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ totalProjects: projects.length, projects }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'search_projects',
    'Search registered projects by keyword — matches against names, descriptions, tags, and pattern names/descriptions',
    {
      query: z.string().describe('Search keyword (e.g. "upload", "encryption", "react-native")'),
    },
    async ({ query }) => {
      const registry = loadRegistry();
      const results = searchProjects(registry, query);

      const formatted = results.map((r) => ({
        name: r.name,
        path: r.project.path,
        description: r.project.description,
        tags: r.project.tags,
        patterns: r.project.patterns,
        matchedOn: r.matchedOn,
        git: r.project.git,
        links: r.project.links,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ query, resultCount: formatted.length, results: formatted }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_project_details',
    'Get full details for a specific registered project including all patterns, links, and metadata. Use the project name from list_projects.',
    {
      name: z.string().describe('The project name exactly as registered in the registry (e.g. "schoolsync", "gts-trade")'),
    },
    async ({ name }) => {
      const registry = loadRegistry();
      const project = registry.projects[name];

      if (!project) {
        return {
          content: [{
            type: 'text' as const,
            text: `Project "${name}" not found. Use list_projects to see available projects.`,
          }],
        };
      }

      let fileInfo: { exists: boolean; topLevelDirs?: string[] } = { exists: false };
      if (fs.existsSync(project.path)) {
        const entries = fs.readdirSync(project.path, { withFileTypes: true });
        fileInfo = {
          exists: true,
          topLevelDirs: entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name),
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ name, ...project, fileInfo }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'search_project_code',
    'Search for a text pattern in a registered project\'s source code. Returns matching lines with file paths and line numbers. Case-insensitive.',
    {
      name: z.string().describe('The project name exactly as registered in the registry (e.g. "schoolsync")'),
      pattern: z.string().describe('Search pattern — text or regex (e.g. "Upload", "handleSubmit", "useState.*modal")'),
      fileGlob: z.string().optional().describe('Optional file extension filter (e.g. "*.ts", "*.tsx", "*.py")'),
    },
    async ({ name: projectName, pattern, fileGlob }) => {
      const registry = loadRegistry();
      const project = registry.projects[projectName];

      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project "${projectName}" not found. Use list_projects to see available projects.` }] };
      }

      if (!fs.existsSync(project.path)) {
        return { content: [{ type: 'text' as const, text: `Project path does not exist: ${project.path}` }] };
      }

      let output = '';

      if (rgPath) {
        // Use ripgrep with spawnSync to avoid shell escaping issues
        const args = ['--no-heading', '--line-number', '--max-count', '50', '-i'];
        if (fileGlob) {
          args.push('--glob', fileGlob);
        }
        args.push(pattern, project.path);

        const result = spawnSync(rgPath, args, {
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
          timeout: 15000,
        });

        output = (result.stdout || '').trim();
      }

      if (!output) {
        // Fallback to Node.js native search
        output = grepFallback(project.path, pattern, fileGlob);
      }

      if (!output) {
        return {
          content: [{
            type: 'text' as const,
            text: `No matches for "${pattern}" in ${projectName}`,
          }],
        };
      }

      // Make paths relative to project root
      const relative = output
        .split('\n')
        .filter(Boolean)
        .map((line) => line.replace(project.path + '/', ''))
        .join('\n');

      return {
        content: [{
          type: 'text' as const,
          text: relative,
        }],
      };
    }
  );

  server.tool(
    'read_project_file',
    'Read a specific file from a registered project. Path must be relative to the project root. Supports reading specific line ranges for large files.',
    {
      name: z.string().describe('The project name exactly as registered in the registry (e.g. "schoolsync")'),
      filePath: z.string().describe('File path relative to project root (e.g. "src/components/Upload/index.tsx")'),
      startLine: z.number().optional().describe('Start reading from this line number (1-based). Useful for large files.'),
      endLine: z.number().optional().describe('Stop reading at this line number (inclusive). Useful for large files.'),
    },
    async ({ name: projectName, filePath, startLine, endLine }) => {
      const registry = loadRegistry();
      const project = registry.projects[projectName];

      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project "${projectName}" not found.` }] };
      }

      const fullPath = path.resolve(project.path, filePath);

      // Security: ensure resolved path is within the project directory
      if (!fullPath.startsWith(path.resolve(project.path))) {
        return { content: [{ type: 'text' as const, text: 'Access denied: path escapes project directory.' }] };
      }

      if (!fs.existsSync(fullPath)) {
        return { content: [{ type: 'text' as const, text: `File not found: ${filePath}` }] };
      }

      const stat = fs.statSync(fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const lines = content.split('\n');
      const totalLines = lines.length;

      // If line range specified, return that range
      if (startLine || endLine) {
        const start = Math.max(1, startLine || 1);
        const end = Math.min(totalLines, endLine || totalLines);
        const slice = lines.slice(start - 1, end);
        const numbered = slice.map((line, i) => `${start + i}: ${line}`).join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: `File: ${filePath} (lines ${start}-${end} of ${totalLines})\n\n${numbered}`,
          }],
        };
      }

      // For large files without a range, return first 500 lines with a note
      const maxLines = 500;
      if (stat.size > 100 * 1024 || totalLines > maxLines) {
        const slice = lines.slice(0, maxLines);
        const numbered = slice.map((line, i) => `${i + 1}: ${line}`).join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: `File: ${filePath} (lines 1-${maxLines} of ${totalLines}, ${Math.round(stat.size / 1024)}KB total)\n\nShowing first ${maxLines} lines. Use startLine/endLine to read specific sections.\n\n${numbered}`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `File: ${filePath} (${totalLines} lines)\n\n${content}`,
        }],
      };
    }
  );

  server.tool(
    'extract_patterns',
    'Scout a registered project for reusable patterns. Returns a scouting report (README excerpt, package.json, directory tree, representative file list) that the AI should use to identify 5-8 distinctive named patterns. After reviewing the report (and optionally reading suggested files with read_project_file), the AI should call update_project with a `patterns` object mapping kebab-case names to 1-2 sentence descriptions referencing file paths. Prefer patterns that are non-obvious, reusable across projects, and unlikely to be reinvented without reference.',
    {
      name: z.string().describe('The project name exactly as registered in the registry'),
    },
    async ({ name: projectName }) => {
      const registry = loadRegistry();
      const outcome = buildScoutReport(projectName, registry);
      if (!outcome.ok) {
        return { content: [{ type: 'text' as const, text: outcome.error }] };
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(outcome.report, null, 2),
        }],
      };
    }
  );

  // ─── WRITE TOOLS ───

  server.tool(
    'register_project',
    'Register a new project in the codebase registry. Provide the name, path, and optional metadata.',
    {
      name: z.string().describe('Short project name (e.g. "schoolsync", "wine-analyzer")'),
      projectPath: z.string().describe('Absolute path to the project directory'),
      description: z.string().optional().describe('Human-readable description'),
      tags: z.array(z.string()).optional().describe('Searchable tags'),
      patterns: z
        .record(z.string(), PatternInputSchema)
        .optional()
        .describe('Named patterns. Each value can be a string description (legacy) or a structured object with optional capability/abstractionLevel/domain/fileEvidence tags.'),
      git: z.string().optional().describe('Git remote URL'),
      links: z.record(z.string(), z.string()).optional().describe('External links (linear, figma, etc.)'),
    },
    async ({ name, projectPath, description, tags, patterns, git, links }) => {
      const registry = loadRegistry();

      if (registry.projects[name]) {
        return { content: [{ type: 'text' as const, text: `Project "${name}" already exists. Use update_project to modify it.` }] };
      }

      if (!fs.existsSync(projectPath)) {
        return { content: [{ type: 'text' as const, text: `Path does not exist: ${projectPath}` }] };
      }

      // Auto-detect git remote if not provided
      let gitUrl = git;
      if (!gitUrl) {
        try {
          gitUrl = execSync('git remote get-url origin', { cwd: projectPath, encoding: 'utf-8' }).trim();
        } catch { /* no git remote */ }
      }

      // Patterns may arrive as bare strings or fully-tagged structured objects.
      // Both normalise to the structured Pattern shape on disk.
      const upgradedPatterns: Record<string, Pattern> = {};
      for (const [k, v] of Object.entries(patterns || {})) {
        upgradedPatterns[k] = normalisePatternInput(v);
      }

      registry.projects[name] = {
        path: projectPath,
        description: description || '',
        tags: tags || [],
        patterns: upgradedPatterns,
        git: gitUrl,
        links: links || {},
      };

      saveRegistry(registry);

      const hasPatterns = patterns && Object.keys(patterns).length > 0;
      const suggestion = hasPatterns
        ? ''
        : `\n\nNo patterns were supplied. To make this project searchable by its distinctive ideas, call extract_patterns({ name: "${name}" }) next — it returns a scouting report you can use to identify 5-8 reusable patterns, then update_project to save them.`;

      return {
        content: [{
          type: 'text' as const,
          text: `Registered "${name}" at ${projectPath}${gitUrl ? ` (git: ${gitUrl})` : ''}${suggestion}`,
        }],
      };
    }
  );

  server.tool(
    'update_project',
    'Update an existing project\'s metadata (description, tags, patterns, links). Only provided fields are updated.',
    {
      name: z.string().describe('The project name exactly as registered in the registry'),
      description: z.string().optional().describe('New description'),
      tags: z.array(z.string()).optional().describe('Replace tags'),
      patterns: z
        .record(z.string(), PatternInputSchema)
        .optional()
        .describe('Merge new patterns. Each value can be a string description or a structured object with capability/abstractionLevel/domain/fileEvidence. Existing keys are overwritten.'),
      git: z.string().optional().describe('Update git URL'),
      links: z.record(z.string(), z.string()).optional().describe('Merge new links'),
    },
    async ({ name, description, tags, patterns, git, links }) => {
      const registry = loadRegistry();
      const project = registry.projects[name];

      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project "${name}" not found.` }] };
      }

      if (description !== undefined) project.description = description;
      if (tags !== undefined) project.tags = tags;
      if (patterns !== undefined) {
        // Patterns may arrive as bare strings or structured objects. Bare strings
        // preserve any existing tags on that key (description-only update);
        // structured objects fully replace the entry with the supplied tags
        // (use this shape when re-tagging a pattern).
        const merged = { ...project.patterns };
        for (const [k, v] of Object.entries(patterns)) {
          const existing = merged[k];
          if (typeof v === 'string') {
            merged[k] = { ...(existing ?? { fileEvidence: [] }), description: v };
          } else {
            merged[k] = normalisePatternInput(v);
          }
        }
        project.patterns = merged;
      }
      if (git !== undefined) project.git = git;
      if (links !== undefined) project.links = { ...project.links, ...links };

      saveRegistry(registry);

      return {
        content: [{ type: 'text' as const, text: `Updated "${name}".` }],
      };
    }
  );

  server.tool(
    'remove_project',
    'Unregister a project from the codebase registry. Does NOT delete any files.',
    {
      name: z.string().describe('The project name exactly as registered in the registry'),
    },
    async ({ name }) => {
      const registry = loadRegistry();

      if (!registry.projects[name]) {
        return { content: [{ type: 'text' as const, text: `Project "${name}" not found.` }] };
      }

      delete registry.projects[name];
      saveRegistry(registry);

      return {
        content: [{ type: 'text' as const, text: `Removed "${name}" from registry. No files were deleted.` }],
      };
    }
  );

  server.tool(
    'find_local_project',
    'Search the local filesystem for a project folder by name. Useful for finding the path before registering.',
    {
      name: z.string().describe('Project folder name to search for'),
      searchIn: z.string().optional().describe('Directory to search in (defaults to home directory)'),
    },
    async ({ name, searchIn }) => {
      const searchDir = searchIn || os.homedir();

      try {
        const cmd = `find "${searchDir}" -maxdepth 4 -type d -name "${name}" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/Library/*" -not -path "*/.Trash/*" 2>/dev/null | head -10`;
        const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
        const paths = output.split('\n').filter(Boolean);

        return {
          content: [{
            type: 'text' as const,
            text: paths.length > 0
              ? JSON.stringify({ found: paths.length, paths }, null, 2)
              : `No directory named "${name}" found under ${searchDir}`,
          }],
        };
      } catch {
        return { content: [{ type: 'text' as const, text: 'Search timed out or failed.' }] };
      }
    }
  );

  server.tool(
    'analyze_patterns',
    'Cluster patterns across all registered projects by capability and explain similarities/differences in plain English. Cached to the registry; returns the cached result instantly when nothing has changed since the last run. Pass refresh: true to force a re-run.',
    {
      refresh: z.boolean().optional().describe('Force a re-run even if the cached analysis is fresh'),
    },
    async ({ refresh }) => {
      try {
        const registry = loadRegistry();
        const staleness = getStaleness(registry);
        const useCache = !refresh && registry.analysis && !staleness.stale;

        if (useCache) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                source: 'cached',
                generatedAt: registry.analysis!.generatedAt,
                stale: false,
                clusters: registry.analysis!.clusters,
              }, null, 2),
            }],
          };
        }

        const clusters = await runAnalysis({ registry, runner });
        const updated = writeAnalysis(registry, clusters);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              source: 'fresh',
              generatedAt: updated.analysis!.generatedAt,
              stale: false,
              previousChanges: staleness.changedProjects,
              clusters,
            }, null, 2),
          }],
        };
      } catch (err) {
        if (err instanceof ClaudeNotFoundError) {
          return {
            content: [{
              type: 'text' as const,
              text: `Claude Code CLI not found on PATH. Install it from https://claude.com/claude-code so the reuse server can shell out to \`claude -p\` for the analysis.`,
            }],
          };
        }
        if (err instanceof JsonParseError) {
          const truncated = err.rawOutput.length > 500
            ? err.rawOutput.slice(0, 500) + '… [truncated]'
            : err.rawOutput;
          return {
            content: [{
              type: 'text' as const,
              text: `Claude returned non-JSON output and the retry also failed.\n\nFirst 500 chars of raw output:\n${truncated}`,
            }],
          };
        }
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{
            type: 'text' as const,
            text: `analyze_patterns failed: ${message}`,
          }],
        };
      }
    }
  );

  return server;
}
