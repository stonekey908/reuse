import * as fs from 'fs';
import * as path from 'path';
import type { Project, Registry } from '../shared/types.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.vite', '.turbo',
  '.cache', 'coverage', '.nuxt', 'out', '.output', '__pycache__',
  '.pytest_cache', '.mypy_cache', 'vendor', 'target',
]);

const INTERESTING_DIRS = new Set([
  'src', 'packages', 'apps', 'lib', 'components', 'hooks', 'utils',
  'services', 'features', 'modules', 'server', 'app', 'pages',
]);

const SRC_FILE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.swift', '.kt']);

const README_CANDIDATES = ['README.md', 'readme.md', 'README.MD', 'README.txt', 'README'];

export interface TreeNode {
  name: string;
  type: 'dir' | 'file';
  size?: number;
  children?: TreeNode[];
}

export function walkTree(dir: string, maxDepth = 4, depth = 0): TreeNode[] {
  if (depth >= maxDepth) return [];
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return []; }

  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        type: 'dir',
        children: walkTree(full, maxDepth, depth + 1),
      });
    } else if (entry.isFile()) {
      let size = 0;
      try { size = fs.statSync(full).size; } catch { /* ignore */ }
      nodes.push({ name: entry.name, type: 'file', size });
    }
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function formatTree(nodes: TreeNode[], indent = 0): string {
  const lines: string[] = [];
  const pad = '  '.repeat(indent);
  for (const node of nodes) {
    if (node.type === 'dir') {
      lines.push(`${pad}${node.name}/`);
      if (node.children && node.children.length) {
        lines.push(formatTree(node.children, indent + 1));
      }
    } else {
      const sizeStr = node.size !== undefined ? ` (${formatSize(node.size)})` : '';
      lines.push(`${pad}${node.name}${sizeStr}`);
    }
  }
  return lines.filter(Boolean).join('\n');
}

export function pickRepresentativeFiles(_projectRoot: string, tree: TreeNode[]): string[] {
  const suggestions: string[] = [];

  function scan(nodes: TreeNode[], prefix: string) {
    for (const node of nodes) {
      if (node.type === 'file') {
        const ext = path.extname(node.name);
        if (!SRC_FILE_EXTS.has(ext)) continue;
        if ((node.size ?? 0) < 120) continue;
        if ((node.size ?? 0) > 40 * 1024) continue;
        suggestions.push(path.join(prefix, node.name));
      } else if (node.type === 'dir' && node.children) {
        const deeper = path.join(prefix, node.name);
        if (INTERESTING_DIRS.has(node.name) || prefix.includes('src') || prefix.includes('packages') || prefix.includes('apps')) {
          scan(node.children, deeper);
        } else if (prefix === '') {
          scan(node.children, deeper);
        }
      }
    }
  }

  scan(tree, '');
  suggestions.sort((a, b) => a.split(path.sep).length - b.split(path.sep).length);
  return suggestions.slice(0, 20).map((p) => p.split(path.sep).join('/'));
}

function readSafely(filePath: string, maxBytes = 8 * 1024): string | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return null;
    const buf = fs.readFileSync(filePath);
    const text = buf.toString('utf-8');
    if (text.length > maxBytes) return text.slice(0, maxBytes) + '\n…[truncated]';
    return text;
  } catch { return null; }
}

export interface ScoutReport {
  project: {
    name: string;
    path: string;
    description?: string;
    tags?: string[];
    existingPatterns: Record<string, string>;
  };
  readme: { filename: string; excerpt: string } | { note: string };
  packageJson: Record<string, unknown> | { note: string };
  directoryTree: string;
  suggestedFilesToRead: string[];
  instructions: string[];
}

export type ScoutOutcome =
  | { ok: true; report: ScoutReport }
  | { ok: false; error: string };

const SCOUT_INSTRUCTIONS = [
  '1. Review the README excerpt and package.json to understand what this project is and what stack it uses.',
  '2. Scan the directory tree for distinctive structure (custom hooks, monorepo packages, analyzer modules, etc).',
  '3. Use read_project_file to open 3-6 of the suggestedFilesToRead that look most interesting for extracting reusable ideas.',
  '4. Identify 5-8 genuinely reusable patterns. Each should be: non-obvious, transferable to other projects, and worth referencing rather than reinventing.',
  '5. Skip patterns that are obvious to any React/Next.js/Node developer, or that just restate boilerplate.',
  '6. Call update_project with a `patterns` object: { "kebab-case-name": "1-2 sentence description referencing exact file paths (e.g. /packages/foo/src/bar.ts)" }.',
  '7. Good pattern names describe WHAT: "multi-ai-provider-abstraction", "theme-system-with-presets", "chunked-file-upload-with-retry". Avoid generic names like "utils" or "helpers".',
];

export function buildScoutReportForProject(projectName: string, project: Project): ScoutReport {
  let readme: { filename: string; excerpt: string } | { note: string } = {
    note: 'No README found at project root.',
  };
  for (const n of README_CANDIDATES) {
    const p = path.join(project.path, n);
    if (fs.existsSync(p)) {
      const excerpt = readSafely(p, 6 * 1024);
      if (excerpt) {
        readme = { filename: n, excerpt };
        break;
      }
    }
  }

  let packageSummary: Record<string, unknown> | { note: string } = { note: 'No package.json found.' };
  const pkgPath = path.join(project.path, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      packageSummary = {
        name: raw.name,
        version: raw.version,
        type: raw.type,
        scripts: raw.scripts,
        dependencies: raw.dependencies,
        devDependencies: raw.devDependencies,
        workspaces: raw.workspaces,
      };
    } catch { /* malformed; leave note */ }
  }

  const tree = walkTree(project.path, 4);
  const treeText = formatTree(tree);
  const suggested = pickRepresentativeFiles(project.path, tree);

  return {
    project: {
      name: projectName,
      path: project.path,
      description: project.description,
      tags: project.tags,
      existingPatterns: project.patterns ?? {},
    },
    readme,
    packageJson: packageSummary,
    directoryTree: treeText,
    suggestedFilesToRead: suggested,
    instructions: SCOUT_INSTRUCTIONS,
  };
}

export function buildScoutReport(projectName: string, registry: Registry): ScoutOutcome {
  const project = registry.projects[projectName];
  if (!project) {
    return { ok: false, error: `Project "${projectName}" not found. Use list_projects.` };
  }
  if (!fs.existsSync(project.path)) {
    return { ok: false, error: `Path does not exist: ${project.path}` };
  }
  return { ok: true, report: buildScoutReportForProject(projectName, project) };
}
