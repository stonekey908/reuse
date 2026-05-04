# sample-monorepo

A Turborepo-shaped fixture used by the extract_patterns eval (STO-2160). Includes:

- **apps/web** — Next.js web app entry point
- **apps/cli** — Plain ESM CLI binary
- **packages/mcp-server** — MCP server using @modelcontextprotocol/sdk
- **packages/shared** — Shared types
- **packages/watcher** — chokidar-based file watcher with .gitignore awareness

The fixture is intentionally minimal — just enough on-disk structure for the scout to walk and propose representative files from every workspace.
