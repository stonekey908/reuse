import * as fs from 'fs';
import * as path from 'path';
import type { Pattern, Project, Registry } from '../shared/types.js';

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.vite', '.turbo',
  '.cache', 'coverage', '.nuxt', 'out', '.output', '__pycache__',
  '.pytest_cache', '.mypy_cache', 'vendor', 'target',
]);

const INTERESTING_DIRS = new Set([
  'src', 'packages', 'apps', 'lib', 'components', 'hooks', 'utils',
  'services', 'features', 'modules', 'server', 'app', 'pages',
  'agents', 'context', 'contexts', 'store', 'stores',
]);

// Directories whose contents are usually NOT reusable patterns —
// design docs, mockups, screenshots, generated assets. These are
// demoted in suggestedFilesToRead and called out explicitly in
// SCOUT_INSTRUCTIONS so the AI does not propose
// "freemium-paywall-design-doc"-style entries.
const NOISE_DIRS = new Set([
  'docs', 'doc', 'mockups', 'mockup', 'design', 'design-handoff',
  '__screenshots__', '__snapshots__', 'screenshots', 'fixtures',
  'public', 'assets', 'static', 'examples', 'example',
]);

// File-name needles that mark a path as a route / screen entry point.
// Used by extractUserFacingScreens — order matters (more specific first).
const SCREEN_FILE_NEEDLES = ['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'route.tsx', 'route.ts'];

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

// Score a candidate file path so we can rank suggestions instead of
// returning whatever appeared first. Higher = more likely to contain
// a reusable pattern. Files in NOISE_DIRS, in __tests__/, or with
// design-doc names get a negative score and fall to the bottom.
function suggestionScore(rel: string, size: number): number {
  const lower = rel.toLowerCase();
  let score = 0;

  // Strong demotions: design docs, mockups, screenshots, assets.
  for (const noise of NOISE_DIRS) {
    if (lower.startsWith(noise + '/') || lower.includes('/' + noise + '/')) {
      score -= 100;
    }
  }
  if (lower.endsWith('.md') || lower.endsWith('.html')) score -= 100;
  if (lower.includes('__tests__') || lower.includes('.test.') || lower.includes('.spec.')) score -= 30;
  if (lower.includes('storybook') || lower.endsWith('.stories.tsx') || lower.endsWith('.stories.ts')) score -= 30;

  // Strong promotions: capability-bearing folders.
  for (const dir of ['agents', 'services', 'lib', 'hooks', 'context', 'contexts', 'workers', 'pipelines']) {
    if (lower.includes('/' + dir + '/') || lower.startsWith(dir + '/')) score += 20;
  }
  // Route/screen entry points are valuable for capability-walking.
  if (lower.endsWith('/page.tsx') || lower.endsWith('/page.ts')) score += 15;
  if (lower.endsWith('/route.tsx') || lower.endsWith('/route.ts')) score += 12;
  if (lower.includes('/(tabs)/') || lower.includes('/app/(') ) score += 12;
  if (lower.startsWith('app/') || lower.includes('/app/')) score += 6;

  // Mid-range size = likely meaningful logic, not boilerplate or massive UI dump.
  if (size >= 1024 && size <= 30 * 1024) score += 10;
  else if (size > 30 * 1024) score += 4;

  // Penalise extremely shallow scaffold files near the root.
  const depth = rel.split('/').length;
  if (depth === 1) score -= 5;

  return score;
}

export function pickRepresentativeFiles(_projectRoot: string, tree: TreeNode[]): string[] {
  const candidates: Array<{ rel: string; size: number; score: number }> = [];

  function scan(nodes: TreeNode[], prefix: string) {
    for (const node of nodes) {
      if (node.type === 'file') {
        const ext = path.extname(node.name);
        if (!SRC_FILE_EXTS.has(ext)) continue;
        if ((node.size ?? 0) < 120) continue;
        if ((node.size ?? 0) > 80 * 1024) continue;
        const rel = path.join(prefix, node.name).split(path.sep).join('/');
        const size = node.size ?? 0;
        candidates.push({ rel, size, score: suggestionScore(rel, size) });
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
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.rel.split('/').length - b.rel.split('/').length;
  });
  return candidates.slice(0, 20).map((c) => c.rel);
}

// Walk the tree and surface user-facing route / screen entry points.
// Supports Next.js App Router (app/**/page.tsx, route.tsx), Pages Router
// (pages/**/*.tsx), Expo Router (app/(tabs)/*.tsx, app/index.tsx,
// app/[id].tsx), and Vite/CRA entry (src/App.tsx, src/main.tsx).
//
// Why this matters: extracting patterns from a directory tree alone
// biases the AI toward file-named ideas. A list of screens forces
// capability-walking — for each screen, the AI can ask "what reusable
// pattern implements this?" and surface flows whose code is split
// across multiple files (e.g. image-pick → compress → CF proxy).
export function extractUserFacingScreens(tree: TreeNode[]): string[] {
  const screens: string[] = [];

  function inAppRoot(prefix: string): boolean {
    const parts = prefix.split('/').filter(Boolean);
    return parts.includes('app') || parts.includes('pages') || parts.includes('routes');
  }

  function visit(nodes: TreeNode[], prefix: string) {
    for (const node of nodes) {
      const here = path.join(prefix, node.name).split(path.sep).join('/');
      if (node.type === 'file') {
        const lower = here.toLowerCase();

        // Next.js App Router page/route files.
        if (SCREEN_FILE_NEEDLES.some((n) => lower.endsWith('/' + n))) {
          screens.push(here);
          continue;
        }

        // Generic .tsx/.jsx under app/ or pages/ are likely Expo Router or
        // Pages Router screens. Only surface them if the file lives at depth>=2
        // inside app/ to skip top-level layouts.
        if ((lower.endsWith('.tsx') || lower.endsWith('.jsx')) && inAppRoot(prefix)) {
          if (lower.endsWith('/_layout.tsx') || lower.endsWith('/_app.tsx') || lower.endsWith('/_document.tsx')) continue;
          if (lower.endsWith('/layout.tsx') || lower.endsWith('/error.tsx') || lower.endsWith('/loading.tsx') || lower.endsWith('/not-found.tsx')) continue;
          screens.push(here);
        }
      } else if (node.type === 'dir' && node.children) {
        // Don't descend into noise dirs.
        if (NOISE_DIRS.has(node.name)) continue;
        visit(node.children, here);
      }
    }
  }

  visit(tree, '');
  // Cap so the report stays readable. Sort: shorter paths first (more
  // user-facing), then alpha.
  screens.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  return screens.slice(0, 30);
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
    existingPatterns: Record<string, Pattern>;
  };
  readme: { filename: string; excerpt: string } | { note: string };
  packageJson: Record<string, unknown> | { note: string };
  directoryTree: string;
  suggestedFilesToRead: string[];
  userFacingScreens: string[];
  instructions: string[];
}

export type ScoutOutcome =
  | { ok: true; report: ScoutReport }
  | { ok: false; error: string };

const SCOUT_INSTRUCTIONS = [
  '1. Review the README excerpt and package.json to understand what this project is and what stack it uses.',
  '2. Scan the directory tree for distinctive structure (custom hooks, monorepo packages, analyzer modules, etc).',
  '3. CAPABILITY-WALK: Look at userFacingScreens. For EACH screen the user can navigate to, ask "what reusable mechanism makes this screen work?" — image upload + AI extraction, real-time chat, infinite scroll, payment flow, etc. Then trace it back through the codebase. Cross-file flows (e.g. image-pick → compress → multimodal-CF-proxy) are exactly the patterns most likely to be missed by a file-walk alone — name them as one capability even when split across many files.',
  '4. Use read_project_file to open 3-6 of the suggestedFilesToRead — bias toward files in /lib/, /services/, /hooks/, /agents/, /context/. Open whichever files implement the screens you identified in step 3.',
  '5. Identify 6-12 genuinely reusable patterns. Each should be: non-obvious, transferable to other projects, and worth referencing rather than reinventing. Cover BOTH file-named patterns (a single distinctive module) AND capability-named patterns (a flow spanning multiple files).',
  '6. NOT-A-PATTERN filter: design docs (/docs/plans/*.md), HTML mockups, screenshots, and PRDs are NOT patterns — they describe intent, not reusable code. Only include a doc as a pattern if THE DOC ITSELF is the reusable artifact (e.g. a design-doc template methodology that other projects copy). Skip patterns that just restate React/Next.js/Node conventions any developer would write the same way.',
  '7. Call update_project with a `patterns` object. Each value SHOULD be a structured object so the analysis pipeline can cluster across projects: { "kebab-case-name": { "description": "1-2 sentences referencing exact file paths (e.g. /packages/foo/src/bar.ts)", "capability": "kebab-case-capability", "abstractionLevel": "primitive | feature | discipline | architecture | spec", "domain": "frontend-mobile | frontend-web | frontend-desktop | backend-api | ai-integration | design-system | dev-tooling | distribution | infra-system | docs-content | build-tooling | testing-discipline", "fileEvidence": ["/path/to/main-file.ts", "/path/to/test.ts"] } }. A bare string is still accepted for back-compat but loses cross-project clustering.',
  '8. Good pattern names describe WHAT: "multi-ai-provider-abstraction", "theme-system-with-presets", "chunked-file-upload-with-retry". Avoid generic names like "utils" or "helpers".',
  '9. Capability slugs should be the reusable idea, not the project-specific name. Two projects implementing "chunked-upload-with-retry" should share the same capability slug so they cluster together.',
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
  const userFacingScreens = extractUserFacingScreens(tree);

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
    userFacingScreens,
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
