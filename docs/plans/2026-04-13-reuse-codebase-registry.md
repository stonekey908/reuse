# Reuse — Codebase Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal codebase registry with MCP server, CLI, and web UI so any AI assistant can search and reference patterns across the user's projects.

**Architecture:** A shared registry module (reads/writes `~/.reuse/registry.json`) consumed by three interfaces: an MCP server (stdio transport for AI clients), a CLI (global `reuse` command), and a Vite+React web UI (served locally via `reuse serve`). The MCP server provides both read tools (search, browse, read code) and write tools (register, update projects). File access is scoped to registered projects only.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk` ^1.29.0, Zod 4, Commander.js, Vite + React + Tailwind CSS, Vitest

---

## Project Structure

```
reuse/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── index.html                  # Vite entry (web UI)
├── src/
│   ├── shared/
│   │   ├── types.ts            # Registry types
│   │   ├── registry.ts         # Read/write ~/.reuse/registry.json
│   │   └── search.ts           # Search logic across projects
│   ├── mcp/
│   │   ├── server.ts           # MCP tool definitions
│   │   └── stdio.ts            # MCP stdio entry point
│   ├── cli/
│   │   ├── index.ts            # CLI entry point
│   │   └── serve.ts            # Express server for web UI API
│   └── web/
│       ├── main.tsx            # React entry
│       ├── App.tsx             # Main app component
│       └── components/
│           ├── ProjectList.tsx
│           ├── ProjectCard.tsx
│           └── ProjectForm.tsx
├── tests/
│   ├── registry.test.ts
│   ├── search.test.ts
│   └── mcp.test.ts
└── docs/
    └── plans/
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `.gitignore`

**Step 1: Initialize git**

```bash
cd /Users/you/reuse
git init
```

**Step 2: Create package.json**

```json
{
  "name": "reuse",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "reuse": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsc && vite build",
    "build:server": "tsc",
    "dev": "vite",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.29.0",
    "commander": "^13.1.0",
    "cors": "^2.8.5",
    "express": "^5.1.0",
    "zod": "^3.24.4"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.2",
    "@types/react-dom": "^19.1.2",
    "@vitejs/plugin-react": "^4.4.1",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.3",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "tailwindcss": "^4.1.4",
    "typescript": "^5.8.3",
    "vite": "^6.3.2",
    "vitest": "^3.1.1"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["src/web/**/*", "node_modules", "dist"]
}
```

**Step 4: Create tsconfig.node.json** (for Vite config)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: Create .gitignore**

```
node_modules/
dist/
*.tsbuildinfo
.env
.env.local
```

**Step 6: Install dependencies**

```bash
npm install
```

**Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold reuse project with dependencies"
```

---

### Task 2: Registry Types

**Files:**
- Create: `src/shared/types.ts`
- Create: `tests/registry.test.ts` (type validation tests)

**Step 1: Write the failing test**

Create `tests/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { ProjectSchema, RegistrySchema } from '../src/shared/types';

describe('Registry Types', () => {
  it('validates a valid project', () => {
    const project = {
      path: '/Users/test/my-app',
      description: 'A test application',
      tags: ['react', 'typescript'],
      patterns: {
        auth: 'JWT-based authentication with refresh tokens',
      },
      git: 'https://github.com/test/my-app',
      links: {
        linear: 'https://linear.app/team/project/MY-APP',
      },
    };
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('validates a minimal project (only path required)', () => {
    const project = { path: '/Users/test/my-app' };
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it('rejects a project without path', () => {
    const project = { description: 'No path' };
    expect(ProjectSchema.safeParse(project).success).toBe(false);
  });

  it('validates a full registry', () => {
    const registry = {
      projects: {
        'my-app': {
          path: '/Users/test/my-app',
          description: 'A test app',
          tags: [],
          patterns: {},
        },
      },
    };
    expect(RegistrySchema.safeParse(registry).success).toBe(true);
  });

  it('validates an empty registry', () => {
    const registry = { projects: {} };
    expect(RegistrySchema.safeParse(registry).success).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/registry.test.ts
```
Expected: FAIL — module not found

**Step 3: Write the types**

Create `src/shared/types.ts`:

```typescript
import { z } from 'zod';

export const ProjectSchema = z.object({
  path: z.string().describe('Absolute path to the project directory'),
  description: z.string().optional().default('').describe('Human-readable project description'),
  tags: z.array(z.string()).optional().default([]).describe('Searchable tags'),
  patterns: z.record(z.string(), z.string()).optional().default({}).describe('Named patterns with descriptions'),
  git: z.string().optional().describe('Git remote URL'),
  links: z.record(z.string(), z.string()).optional().default({}).describe('External links (linear, figma, notion, etc.)'),
});

export const RegistrySchema = z.object({
  projects: z.record(z.string(), ProjectSchema),
});

export type Project = z.infer<typeof ProjectSchema>;
export type Registry = z.infer<typeof RegistrySchema>;
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/registry.test.ts
```
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/shared/types.ts tests/registry.test.ts
git commit -m "feat: add registry types with zod validation"
```

---

### Task 3: Registry Read/Write

**Files:**
- Create: `src/shared/registry.ts`
- Modify: `tests/registry.test.ts`

**Step 1: Write the failing tests**

Add to `tests/registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadRegistry, saveRegistry, getRegistryPath } from '../src/shared/registry';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Registry Read/Write', () => {
  const testDir = path.join(os.tmpdir(), 'reuse-test-' + Date.now());
  const originalHome = process.env.HOME;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.REUSE_HOME = testDir;
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.REUSE_HOME;
  });

  it('returns empty registry when no file exists', () => {
    const registry = loadRegistry();
    expect(registry.projects).toEqual({});
  });

  it('saves and loads a registry', () => {
    const registry = {
      projects: {
        'test-app': {
          path: '/Users/test/app',
          description: 'Test',
          tags: ['react'],
          patterns: {},
          links: {},
        },
      },
    };
    saveRegistry(registry);
    const loaded = loadRegistry();
    expect(loaded.projects['test-app'].path).toBe('/Users/test/app');
    expect(loaded.projects['test-app'].tags).toEqual(['react']);
  });

  it('creates the .reuse directory if it does not exist', () => {
    const registry = { projects: {} };
    saveRegistry(registry);
    expect(fs.existsSync(path.join(testDir, 'registry.json'))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/registry.test.ts
```
Expected: FAIL — module not found

**Step 3: Implement registry read/write**

Create `src/shared/registry.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RegistrySchema, type Registry } from './types.js';

export function getRegistryDir(): string {
  return process.env.REUSE_HOME || path.join(os.homedir(), '.reuse');
}

export function getRegistryPath(): string {
  return path.join(getRegistryDir(), 'registry.json');
}

export function loadRegistry(): Registry {
  const filePath = getRegistryPath();
  if (!fs.existsSync(filePath)) {
    return { projects: {} };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return RegistrySchema.parse(raw);
}

export function saveRegistry(registry: Registry): void {
  const dir = getRegistryDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2));
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/registry.test.ts
```
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/shared/registry.ts tests/registry.test.ts
git commit -m "feat: add registry read/write with file persistence"
```

---

### Task 4: Search Logic

**Files:**
- Create: `src/shared/search.ts`
- Create: `tests/search.test.ts`

**Step 1: Write the failing tests**

Create `tests/search.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { searchProjects } from '../src/shared/search';
import type { Registry } from '../src/shared/types';

const testRegistry: Registry = {
  projects: {
    'schoolsync': {
      path: '/Users/test/schoolsync',
      description: 'School communication app for parents and teachers',
      tags: ['react-native', 'expo', 'firebase', 'encryption'],
      patterns: {
        'e2e-encryption': 'End-to-end encryption using libsodium',
        'file-upload': 'Chunked upload with progress and retry',
      },
      links: {},
    },
    'wine-analyzer': {
      path: '/Users/test/wineanalyzer',
      description: 'AI wine label scanner and cellar management',
      tags: ['react-native', 'expo', 'supabase', 'ai', 'camera'],
      patterns: {
        'camera-scan': 'Real-time label scanning with ML Kit',
      },
      links: {},
    },
    'gts-trade': {
      path: '/Users/test/gts-trade',
      description: 'Trading platform with real-time data',
      tags: ['nextjs', 'supabase', 'websockets'],
      patterns: {
        'real-time': 'WebSocket-based live data feeds',
      },
      links: {},
    },
  },
};

describe('searchProjects', () => {
  it('finds projects by tag', () => {
    const results = searchProjects(testRegistry, 'encryption');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('schoolsync');
  });

  it('finds projects by description keyword', () => {
    const results = searchProjects(testRegistry, 'wine');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('wine-analyzer');
  });

  it('finds projects by pattern name', () => {
    const results = searchProjects(testRegistry, 'upload');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('schoolsync');
  });

  it('finds projects by pattern description', () => {
    const results = searchProjects(testRegistry, 'libsodium');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('schoolsync');
  });

  it('finds projects by name', () => {
    const results = searchProjects(testRegistry, 'gts');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('gts-trade');
  });

  it('returns multiple matches', () => {
    const results = searchProjects(testRegistry, 'react-native');
    expect(results.length).toBe(2);
  });

  it('is case-insensitive', () => {
    const results = searchProjects(testRegistry, 'FIREBASE');
    expect(results.length).toBe(1);
  });

  it('returns empty for no matches', () => {
    const results = searchProjects(testRegistry, 'nonexistent');
    expect(results.length).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/search.test.ts
```
Expected: FAIL

**Step 3: Implement search**

Create `src/shared/search.ts`:

```typescript
import type { Registry, Project } from './types.js';

export interface SearchResult {
  name: string;
  project: Project;
  matchedOn: string[];
}

export function searchProjects(registry: Registry, query: string): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const [name, project] of Object.entries(registry.projects)) {
    const matchedOn: string[] = [];

    if (name.toLowerCase().includes(q)) {
      matchedOn.push('name');
    }

    if (project.description?.toLowerCase().includes(q)) {
      matchedOn.push('description');
    }

    if (project.tags?.some((tag) => tag.toLowerCase().includes(q))) {
      matchedOn.push('tags');
    }

    if (project.patterns) {
      for (const [patternName, patternDesc] of Object.entries(project.patterns)) {
        if (patternName.toLowerCase().includes(q) || patternDesc.toLowerCase().includes(q)) {
          matchedOn.push(`pattern:${patternName}`);
        }
      }
    }

    if (matchedOn.length > 0) {
      results.push({ name, project, matchedOn });
    }
  }

  return results;
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/search.test.ts
```
Expected: ALL PASS

**Step 5: Commit**

```bash
git add src/shared/search.ts tests/search.test.ts
git commit -m "feat: add project search across names, tags, descriptions, and patterns"
```

---

### Task 5: MCP Server — Read Tools

**Files:**
- Create: `src/mcp/server.ts`
- Create: `tests/mcp.test.ts`

**Step 1: Write the failing tests**

Create `tests/mcp.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createReuseServer } from '../src/mcp/server';
import { saveRegistry } from '../src/shared/registry';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('MCP Server', () => {
  const testDir = path.join(os.tmpdir(), 'reuse-mcp-test-' + Date.now());
  const projectDir = path.join(testDir, 'sample-project');

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    process.env.REUSE_HOME = testDir;

    // Create a sample project to reference
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'src', 'upload.ts'),
      'export function uploadFile(file: File) { /* chunked upload */ }'
    );
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify({ name: 'sample-project', version: '1.0.0' })
    );

    saveRegistry({
      projects: {
        'sample-project': {
          path: projectDir,
          description: 'A sample project for testing',
          tags: ['typescript', 'upload'],
          patterns: { 'file-upload': 'Chunked file upload with progress' },
          links: {},
        },
      },
    });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    delete process.env.REUSE_HOME;
  });

  it('creates a server instance', () => {
    const server = createReuseServer();
    expect(server).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/mcp.test.ts
```
Expected: FAIL

**Step 3: Implement the MCP server with read tools**

Create `src/mcp/server.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadRegistry, saveRegistry } from '../shared/registry.js';
import { searchProjects } from '../shared/search.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export function createReuseServer(): McpServer {
  const server = new McpServer({
    name: 'reuse',
    version: '0.1.0',
  });

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
    'Get full details for a specific registered project including all patterns, links, and metadata',
    {
      name: z.string().describe('Project name as registered (e.g. "schoolsync")'),
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

      // Check if path exists and gather basic file info
      let fileInfo: { exists: boolean; fileCount?: number; topLevelDirs?: string[] } = { exists: false };
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
    'Search for a pattern in a registered project\'s codebase using ripgrep. Only searches within registered projects.',
    {
      project: z.string().describe('Project name as registered'),
      pattern: z.string().describe('Search pattern (regex supported)'),
      fileGlob: z.string().optional().describe('Optional file glob filter (e.g. "*.ts", "*.tsx")'),
    },
    async ({ project: projectName, pattern, fileGlob }) => {
      const registry = loadRegistry();
      const project = registry.projects[projectName];

      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project "${projectName}" not found.` }] };
      }

      if (!fs.existsSync(project.path)) {
        return { content: [{ type: 'text' as const, text: `Project path does not exist: ${project.path}` }] };
      }

      try {
        const globArg = fileGlob ? `--glob "${fileGlob}"` : '';
        const cmd = `rg --no-heading --line-number --max-count 50 ${globArg} "${pattern}" "${project.path}" 2>/dev/null || true`;
        const output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 1024 * 1024 });

        // Make paths relative to project root for readability
        const relative = output
          .split('\n')
          .filter(Boolean)
          .map((line) => line.replace(project.path + '/', ''))
          .join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: relative || `No matches for "${pattern}" in ${projectName}`,
          }],
        };
      } catch {
        return { content: [{ type: 'text' as const, text: `Search failed. Is ripgrep (rg) installed?` }] };
      }
    }
  );

  server.tool(
    'read_project_file',
    'Read a specific file from a registered project. Path must be relative to the project root. Only reads from registered projects.',
    {
      project: z.string().describe('Project name as registered'),
      filePath: z.string().describe('File path relative to project root (e.g. "src/components/Upload/index.tsx")'),
    },
    async ({ project: projectName, filePath }) => {
      const registry = loadRegistry();
      const project = registry.projects[projectName];

      if (!project) {
        return { content: [{ type: 'text' as const, text: `Project "${projectName}" not found.` }] };
      }

      const fullPath = path.resolve(project.path, filePath);

      // Security: ensure resolved path is within the project directory
      if (!fullPath.startsWith(path.resolve(project.path))) {
        return { content: [{ type: 'text' as const, text: `Access denied: path escapes project directory.` }] };
      }

      if (!fs.existsSync(fullPath)) {
        return { content: [{ type: 'text' as const, text: `File not found: ${filePath}` }] };
      }

      const stat = fs.statSync(fullPath);
      if (stat.size > 100 * 1024) {
        return { content: [{ type: 'text' as const, text: `File too large (${Math.round(stat.size / 1024)}KB). Use search_project_code to find specific sections.` }] };
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      return {
        content: [{
          type: 'text' as const,
          text: `File: ${filePath}\n\n${content}`,
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
      patterns: z.record(z.string(), z.string()).optional().describe('Named patterns with descriptions'),
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

      // Try to auto-detect git remote if not provided
      let gitUrl = git;
      if (!gitUrl) {
        try {
          gitUrl = execSync('git remote get-url origin', { cwd: projectPath, encoding: 'utf-8' }).trim();
        } catch { /* no git remote, that's fine */ }
      }

      registry.projects[name] = {
        path: projectPath,
        description: description || '',
        tags: tags || [],
        patterns: patterns || {},
        git: gitUrl,
        links: links || {},
      };

      saveRegistry(registry);

      return {
        content: [{
          type: 'text' as const,
          text: `Registered "${name}" at ${projectPath}${gitUrl ? ` (git: ${gitUrl})` : ''}`,
        }],
      };
    }
  );

  server.tool(
    'update_project',
    'Update an existing project\'s metadata (description, tags, patterns, links). Only provided fields are updated.',
    {
      name: z.string().describe('Project name to update'),
      description: z.string().optional().describe('New description'),
      tags: z.array(z.string()).optional().describe('Replace tags'),
      patterns: z.record(z.string(), z.string()).optional().describe('Merge new patterns (existing keys are overwritten)'),
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
      if (patterns !== undefined) project.patterns = { ...project.patterns, ...patterns };
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
      name: z.string().describe('Project name to remove'),
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
        return { content: [{ type: 'text' as const, text: `Search timed out or failed.` }] };
      }
    }
  );

  return server;
}
```

Note: `os` import needed at top of file:
```typescript
import * as os from 'os';
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/mcp.test.ts
```
Expected: PASS

**Step 5: Commit**

```bash
git add src/mcp/server.ts tests/mcp.test.ts
git commit -m "feat: add MCP server with read and write tools"
```

---

### Task 6: MCP Stdio Entry Point

**Files:**
- Create: `src/mcp/stdio.ts`

**Step 1: Create the stdio entry point**

Create `src/mcp/stdio.ts`:

```typescript
#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createReuseServer } from './server.js';

async function main() {
  const server = createReuseServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[reuse-mcp] Server running on stdio');
}

main().catch((err) => {
  console.error(`[reuse-mcp] Fatal: ${err}`);
  process.exit(1);
});
```

**Step 2: Build and verify**

```bash
npx tsc
node dist/mcp/stdio.js
```
Expected: prints `[reuse-mcp] Server running on stdio` to stderr and waits for input

**Step 3: Commit**

```bash
git add src/mcp/stdio.ts
git commit -m "feat: add MCP stdio entry point"
```

---

### Task 7: CLI

**Files:**
- Create: `src/cli/index.ts`

**Step 1: Implement the CLI**

Create `src/cli/index.ts`:

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
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
  .command('add <name> <path>')
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

    const resolvedPath = require('path').resolve(projectPath);
    const fs = require('fs');
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
```

**Step 2: Build and test manually**

```bash
npx tsc
node dist/cli/index.js --help
node dist/cli/index.js list
```
Expected: Help output, then "No projects registered" message

**Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add CLI with list, search, add, remove, tag, pattern, serve commands"
```

---

### Task 8: Web UI API Server

**Files:**
- Create: `src/cli/serve.ts`

**Step 1: Implement the API server**

Create `src/cli/serve.ts`:

```typescript
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRegistry, saveRegistry } from '../shared/registry.js';
import { searchProjects } from '../shared/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startServer(port: number) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // API routes
  app.get('/api/projects', (_req, res) => {
    const registry = loadRegistry();
    res.json(registry);
  });

  app.post('/api/projects', (req, res) => {
    const registry = loadRegistry();
    const { name, ...project } = req.body;

    if (!name || !project.path) {
      res.status(400).json({ error: 'name and path are required' });
      return;
    }

    if (registry.projects[name]) {
      res.status(409).json({ error: `Project "${name}" already exists` });
      return;
    }

    registry.projects[name] = project;
    saveRegistry(registry);
    res.status(201).json({ name, ...project });
  });

  app.put('/api/projects/:name', (req, res) => {
    const registry = loadRegistry();
    const { name } = req.params;

    if (!registry.projects[name]) {
      res.status(404).json({ error: `Project "${name}" not found` });
      return;
    }

    registry.projects[name] = { ...registry.projects[name], ...req.body };
    saveRegistry(registry);
    res.json({ name, ...registry.projects[name] });
  });

  app.delete('/api/projects/:name', (req, res) => {
    const registry = loadRegistry();
    const { name } = req.params;

    if (!registry.projects[name]) {
      res.status(404).json({ error: `Project "${name}" not found` });
      return;
    }

    delete registry.projects[name];
    saveRegistry(registry);
    res.status(204).send();
  });

  app.get('/api/search', (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'query parameter "q" is required' });
      return;
    }

    const registry = loadRegistry();
    const results = searchProjects(registry, query);
    res.json(results);
  });

  // Serve static frontend (built Vite output)
  const staticDir = path.resolve(__dirname, '../../dist-web');
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  app.listen(port, () => {
    console.log(`\n  Reuse registry UI running at http://localhost:${port}\n`);
  });
}
```

**Step 2: Build and verify**

```bash
npx tsc
```
Expected: Compiles without errors

**Step 3: Commit**

```bash
git add src/cli/serve.ts
git commit -m "feat: add express API server for web UI"
```

---

### Task 9: Vite + React Web Frontend

**Files:**
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `src/web/main.tsx`
- Create: `src/web/App.tsx`
- Create: `src/web/components/ProjectList.tsx`
- Create: `src/web/components/ProjectCard.tsx`
- Create: `src/web/components/ProjectForm.tsx`

**Step 1: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist-web',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3210',
    },
  },
});
```

**Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reuse — Codebase Registry</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/web/main.tsx"></script>
  </body>
</html>
```

**Step 3: Create src/web/main.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 4: Create src/web/App.tsx**

```tsx
import React, { useState, useEffect } from 'react';
import ProjectList from './components/ProjectList';
import ProjectForm from './components/ProjectForm';

interface Project {
  path: string;
  description?: string;
  tags?: string[];
  patterns?: Record<string, string>;
  git?: string;
  links?: Record<string, string>;
}

interface Registry {
  projects: Record<string, Project>;
}

export default function App() {
  const [registry, setRegistry] = useState<Registry>({ projects: {} });
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);

  const fetchRegistry = async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setRegistry(data);
  };

  useEffect(() => {
    fetchRegistry();
  }, []);

  const handleAdd = async (name: string, project: Project) => {
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...project }),
    });
    setShowForm(false);
    fetchRegistry();
  };

  const handleUpdate = async (name: string, project: Partial<Project>) => {
    await fetch(`/api/projects/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    setEditingProject(null);
    fetchRegistry();
  };

  const handleDelete = async (name: string) => {
    await fetch(`/api/projects/${name}`, { method: 'DELETE' });
    fetchRegistry();
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Reuse</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            padding: '0.5rem 1rem',
            background: '#111',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          {showForm ? 'Cancel' : '+ Add Project'}
        </button>
      </div>

      {showForm && (
        <ProjectForm
          onSubmit={handleAdd}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ProjectList
        projects={registry.projects}
        editingProject={editingProject}
        onEdit={setEditingProject}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />
    </div>
  );
}
```

**Step 5: Create src/web/components/ProjectCard.tsx**

```tsx
import React, { useState } from 'react';

interface Project {
  path: string;
  description?: string;
  tags?: string[];
  patterns?: Record<string, string>;
  git?: string;
  links?: Record<string, string>;
}

interface Props {
  name: string;
  project: Project;
  isEditing: boolean;
  onEdit: () => void;
  onUpdate: (name: string, project: Partial<Project>) => void;
  onDelete: (name: string) => void;
}

export default function ProjectCard({ name, project, isEditing, onEdit, onUpdate, onDelete }: Props) {
  const [description, setDescription] = useState(project.description || '');
  const [tags, setTags] = useState((project.tags || []).join(', '));

  if (isEditing) {
    return (
      <div style={{ border: '2px solid #111', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>{name}</h3>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.375rem', marginTop: '0.25rem', borderRadius: 4, border: '1px solid #ccc' }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          Tags (comma-separated)
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '0.375rem', marginTop: '0.25rem', borderRadius: 4, border: '1px solid #ccc' }}
          />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
          <button
            onClick={() => onUpdate(name, { description, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })}
            style={{ padding: '0.375rem 0.75rem', background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Save
          </button>
          <button
            onClick={onEdit}
            style={{ padding: '0.375rem 0.75rem', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ margin: 0 }}>{name}</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={onEdit} style={{ padding: '0.25rem 0.5rem', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem' }}>
            Edit
          </button>
          <button onClick={() => onDelete(name)} style={{ padding: '0.25rem 0.5rem', background: '#fee', border: '1px solid #fcc', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', color: '#c00' }}>
            Remove
          </button>
        </div>
      </div>

      {project.description && <p style={{ margin: '0.5rem 0 0', color: '#555' }}>{project.description}</p>}
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#888', fontFamily: 'monospace' }}>{project.path}</p>

      {project.git && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
          <a href={project.git} target="_blank" rel="noreferrer" style={{ color: '#06c' }}>{project.git}</a>
        </p>
      )}

      {project.tags && project.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {project.tags.map((tag) => (
            <span key={tag} style={{ background: '#f0f0f0', padding: '0.125rem 0.5rem', borderRadius: 12, fontSize: '0.75rem' }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {project.patterns && Object.keys(project.patterns).length > 0 && (
        <div style={{ marginTop: '0.5rem' }}>
          {Object.entries(project.patterns).map(([key, desc]) => (
            <div key={key} style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              <strong>{key}:</strong> <span style={{ color: '#555' }}>{desc}</span>
            </div>
          ))}
        </div>
      )}

      {project.links && Object.keys(project.links).length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          {Object.entries(project.links).map(([key, url]) => (
            <a key={key} href={url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#06c' }}>
              {key}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 6: Create src/web/components/ProjectList.tsx**

```tsx
import React from 'react';
import ProjectCard from './ProjectCard';

interface Project {
  path: string;
  description?: string;
  tags?: string[];
  patterns?: Record<string, string>;
  git?: string;
  links?: Record<string, string>;
}

interface Props {
  projects: Record<string, Project>;
  editingProject: string | null;
  onEdit: (name: string | null) => void;
  onUpdate: (name: string, project: Partial<Project>) => void;
  onDelete: (name: string) => void;
}

export default function ProjectList({ projects, editingProject, onEdit, onUpdate, onDelete }: Props) {
  const entries = Object.entries(projects);

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>
        <p>No projects registered yet.</p>
        <p style={{ fontSize: '0.875rem' }}>Click "+ Add Project" to register your first codebase.</p>
      </div>
    );
  }

  return (
    <div>
      {entries.map(([name, project]) => (
        <ProjectCard
          key={name}
          name={name}
          project={project}
          isEditing={editingProject === name}
          onEdit={() => onEdit(editingProject === name ? null : name)}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
```

**Step 7: Create src/web/components/ProjectForm.tsx**

```tsx
import React, { useState } from 'react';

interface Project {
  path: string;
  description?: string;
  tags?: string[];
  patterns?: Record<string, string>;
  git?: string;
  links?: Record<string, string>;
}

interface Props {
  onSubmit: (name: string, project: Project) => void;
  onCancel: () => void;
}

export default function ProjectForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [git, setGit] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(name, {
      path,
      description,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      patterns: {},
      git: git || undefined,
      links: {},
    });
  };

  const inputStyle = { display: 'block', width: '100%', padding: '0.375rem', marginTop: '0.25rem', borderRadius: 4, border: '1px solid #ccc', boxSizing: 'border-box' as const };
  const labelStyle = { display: 'block', marginBottom: '0.75rem', fontSize: '0.875rem' };

  return (
    <form onSubmit={handleSubmit} style={{ border: '2px solid #111', borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
      <h3 style={{ margin: '0 0 1rem' }}>Register Project</h3>

      <label style={labelStyle}>
        Name *
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="my-app" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Path *
        <input value={path} onChange={(e) => setPath(e.target.value)} required placeholder="/Users/you/projects/my-app" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this project do?" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Tags (comma-separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="react, typescript, auth" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Git URL
        <input value={git} onChange={(e) => setGit(e.target.value)} placeholder="https://github.com/you/my-app" style={inputStyle} />
      </label>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Register
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
```

**Step 8: Build and test**

```bash
npx tsc
npx vite build
```
Expected: TypeScript compiles, Vite builds to `dist-web/`

**Step 9: Commit**

```bash
git add index.html vite.config.ts src/web/ src/cli/serve.ts
git commit -m "feat: add web UI for managing project registry"
```

---

### Task 10: Integration — Global MCP Config & npm link

**Step 1: Add shebang and build the project**

Ensure `src/mcp/stdio.ts` and `src/cli/index.ts` have `#!/usr/bin/env node` at the top.

```bash
npm run build:server
```

**Step 2: Link globally for CLI access**

```bash
npm link
```

Now `reuse` command is available globally.

**Step 3: Add to global Claude MCP config**

The user should add to their `.claude.json` or global MCP settings:

```json
{
  "mcpServers": {
    "reuse": {
      "command": "npx",
      "args": ["tsx", "/Users/you/reuse/src/mcp/stdio.ts"]
    }
  }
}
```

Or after build:

```json
{
  "mcpServers": {
    "reuse": {
      "command": "node",
      "args": ["/Users/you/reuse/dist/mcp/stdio.js"]
    }
  }
}
```

**Step 4: Test end-to-end**

```bash
# CLI
reuse add schoolsync /Users/you/schoolsync -d "School communication app" -t "react-native,expo,firebase"
reuse list
reuse search encryption

# Web UI
reuse serve
# Open http://localhost:3210

# MCP — will be tested when Claude connects to the server
```

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: integration — global MCP config, npm link, end-to-end verification"
```

---

### Task 11: README & GitHub Prep

**Files:**
- Create: `README.md`

**Step 1: Create README.md**

```markdown
# Reuse

A personal codebase registry that lets AI assistants reference patterns across your projects.

Register your projects with descriptions, tags, and notable patterns. Any MCP-compatible AI (Claude Code, Claude Desktop, Cursor) can then search your registry and read code from referenced projects to adapt patterns for your current work.

## Quick Start

```bash
# Install
npm install
npm run build
npm link

# Register a project
reuse add my-app ~/projects/my-app -d "My awesome app" -t "react,typescript"

# Add a notable pattern
reuse pattern my-app auth "JWT auth with refresh tokens and role-based access"

# Search
reuse search auth

# Web UI
reuse serve
# → http://localhost:3210
```

## MCP Setup

Add to your global Claude MCP config:

```json
{
  "mcpServers": {
    "reuse": {
      "command": "node",
      "args": ["/path/to/reuse/dist/mcp/stdio.js"]
    }
  }
}
```

Then in any Claude session: "search my projects for file upload patterns" — Claude will use the Reuse MCP to find and reference your code.

## MCP Tools

| Tool | Description |
|------|-------------|
| `list_projects` | Browse all registered projects |
| `search_projects` | Search by keyword across names, descriptions, tags, patterns |
| `get_project_details` | Full details for a specific project |
| `search_project_code` | Grep within a project's codebase |
| `read_project_file` | Read a file from a registered project |
| `register_project` | Add a project to the registry |
| `update_project` | Update project metadata |
| `remove_project` | Unregister a project |
| `find_local_project` | Search filesystem for a project folder |

## CLI Commands

| Command | Description |
|---------|-------------|
| `reuse list` | List registered projects |
| `reuse search <query>` | Search projects |
| `reuse add <name> <path>` | Register a project |
| `reuse remove <name>` | Unregister a project |
| `reuse tag <name> <tags...>` | Add tags |
| `reuse pattern <name> <key> <desc>` | Add a pattern |
| `reuse serve` | Start the web UI |
```

**Step 2: Commit and push**

```bash
git add README.md
git commit -m "docs: add README with setup and usage instructions"
git remote add origin <github-url>
git push -u origin main
```

---

## Summary

| Task | What | Estimate |
|------|------|----------|
| 1 | Project scaffolding | 5 min |
| 2 | Registry types (Zod schemas) | 10 min |
| 3 | Registry read/write | 10 min |
| 4 | Search logic | 10 min |
| 5 | MCP server (all 9 tools) | 20 min |
| 6 | MCP stdio entry point | 5 min |
| 7 | CLI (7 commands) | 15 min |
| 8 | Web UI API server | 10 min |
| 9 | React frontend (4 components) | 20 min |
| 10 | Integration & testing | 10 min |
| 11 | README & GitHub | 5 min |

**Total: ~11 tasks, medium complexity**
