# Reuse

A personal codebase registry that lets AI assistants reference patterns across your projects.

Register your projects with descriptions, tags, and notable patterns. Any MCP-compatible AI (Claude Code, Claude Desktop, Cursor) can then search your registry and read code from referenced projects to adapt patterns for your current work.

The AI reads your code to understand the *approach*, then uses its own judgment in the current context. Sometimes it replicates the pattern, sometimes it adapts it, sometimes it says "I see how you did it there, but here's a better fit for this project."

## Quick Start

```bash
# Install
git clone https://github.com/stonekey908/reuse.git
cd reuse
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

Add to your global Claude config (`~/.claude.json`):

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

Then in any Claude session:

> "Search my projects for file upload patterns"

Claude will use the Reuse MCP to find and reference your code, then adapt the approach for your current project.

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
| `reuse add <name> <path>` | Register a project (`-d` description, `-t` tags, `-g` git URL) |
| `reuse remove <name>` | Unregister a project |
| `reuse tag <name> <tags...>` | Add tags |
| `reuse pattern <name> <key> <desc>` | Add a notable pattern |
| `reuse serve` | Start the web UI (default port 3210) |

## Web UI

Run `reuse serve` and open `http://localhost:3210` to visually manage your project registry — add, edit, remove projects and see all metadata at a glance.

## How It Works

```
You register:
  "schoolsync" → path, description, tags, notable patterns

AI receives prompt:
  "I want file upload like my photos app"

AI calls Reuse MCP tools:
  1. search_projects("file upload") → finds photos-app
  2. get_project_details("photos-app") → sees the upload pattern
  3. search_project_code("photos-app", "upload") → finds relevant files
  4. read_project_file("photos-app", "src/Upload/index.tsx") → reads the code
  5. Adapts the approach for the current project
```

## Registry

Projects are stored in `~/.reuse/registry.json`. Each project has:

- **path** — absolute path to the project directory
- **description** — what the project does
- **tags** — searchable keywords
- **patterns** — named patterns with descriptions (e.g., "encryption": "E2E encryption using libsodium")
- **git** — remote repository URL
- **links** — external links (Linear, Figma, Notion, etc.)

## Security

- File access is scoped to registered projects only — the MCP server cannot read arbitrary paths
- Path traversal is blocked (resolved paths must stay within the project directory)
- Files over 100KB are rejected to prevent context flooding
- The registry is read/write, but project files are read-only
