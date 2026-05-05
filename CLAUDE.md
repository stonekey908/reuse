# Reuse — Codebase Registry

Personal codebase registry with MCP server, CLI, and web UI. Lets AI assistants
search and reference patterns across registered projects.

**Repo:** https://github.com/stonekey908/reuse
**Linear project:** [Reuse — Codebase Registry](https://linear.app/stonekey/project/reuse-codebase-registry-500aa5874d03)

## Architecture

- Shared registry module (`~/.reuse/registry.json`) consumed by three interfaces:
  MCP server (stdio), CLI (`reuse` global command), Vite + React web UI.
- Multi-provider analysis runner (`src/analysis/providers/`) — Anthropic, OpenAI,
  Gemini, Ollama, all configured via `.env.local`.
- Two-level analysis output: 12 canonical themes (`src/shared/themes.ts`) →
  capability clusters / standalones → pattern members. Cached in registry,
  fingerprinted for staleness detection.
- Three-eval ladder: E0 scout (`scripts/scout-eval.mjs`), E1 snapshot
  (`reuse eval`), E2 LLM-as-judge (`reuse eval --quality`).

## Current Phase

**Phase: Stable on main, project marked Completed in Linear.**
All planned work shipped. No active tickets.

## Known Issues

None. Latest analysis run on the 92-pattern registry produced 51 themed items
with full coverage across all 12 themes; no parse errors, no truncation.

## Known Gotchas

- **Web bundle stale after server-side changes** → `npm run build` runs both
  `tsc` (server) and `vite build` (web); bare `tsc` only builds the server,
  leaving `dist-web/` unchanged → Always run `npm run build` (not bare `tsc`)
  whenever the diff touches `src/web/`.
- **MCP server holds dist code in memory** → process spawned at Claude Code
  startup; rebuilt dist isn't picked up live → After changing
  `src/mcp/server.ts`, restart Claude Code to re-spawn the MCP server.
- **Anthropic SDK refuses non-streaming requests at 64k max_tokens** → SDK
  client-side guard for "operations that may take longer than 10 minutes" →
  Anthropic provider uses `client.messages.stream()` + `finalMessage()` so the
  request always streams, regardless of model.
- **`max_tokens` is OUTPUT not context** → 1M-context Sonnet still caps OUTPUT
  at 64k → Each model carries its own `maxOutputTokens` in
  `src/analysis/providers/*.ts`; provider clients pass it through.
- **Output truncation looks like JSON parse failure** → Old behaviour: model
  hits cap mid-string, parser fails, retry hits same cap, user sees
  `JsonParseError` → New `OutputTruncatedError` thrown when provider stop
  signal indicates `max_tokens` / `length` / `MAX_TOKENS`. Runner does not
  retry; UI surfaces actionable hint.
- **Stale path in registry** → user moved/renamed project folder; MCP
  `read_project_file` returns "not found" while `list_projects` /
  `extract_patterns` succeed → Check `~/.reuse/registry.json` `projects.<name>.path`
  matches the actual on-disk location; update directly or via `update_project`.
- **`update_project` strips structured pattern tags (pre-fix)** → Old MCP
  schema was `Record<string, string>` → Now uses `PatternInputSchema`
  (string | structured object). Restart Claude Code after MCP rebuild for the
  new schema to take effect.

## Last Session

**Date:** 2026-05-05
**Who:** Claude session
**What was done:**
- MCP server: structured-pattern schema for `register_project` / `update_project`
  (accepts string OR `{description, capability, abstractionLevel, domain, fileEvidence}`)
- Scout improvements: `userFacingScreens` field, scored `suggestedFilesToRead`
  (NOISE_DIRS demoted, capability folders + screen entry points promoted),
  9-step `SCOUT_INSTRUCTIONS` with CAPABILITY-WALK and NOT-A-PATTERN steps
- Scout eval (`scripts/scout-eval.mjs`) — 100% / 98% / 0% across 4 ground-truth repos
- Per-model `maxOutputTokens` (Sonnet 64k, Opus 32k, GPT-5.x 128k, Gemini 65k)
- Anthropic provider switched to streaming to clear the 10-minute long-request guard
- `OutputTruncatedError` propagated from all 4 providers, surfaced in UI as
  `OUTPUT_TRUNCATED` with hint
- Prompt OUTPUT BUDGET block (per-field char/sentence caps) so output stays
  dense without truncating
- 12 canonical themes (`src/shared/themes.ts`) — empirically grounded against
  92-pattern registry + cross-referenced with awesome-nodejs / awesome-react /
  CNCF Cloud Native Landscape
- Two-level theme tree in Analysis tab with collapsible sections + Expand all /
  Collapse all toggle
- README updated for structured patterns, capability-walk scout, three-eval ladder,
  two-level theme tree
- Screenshots regenerated with `scripts/capture-screenshots.mjs` (puppeteer-core
  + DOM-mask), analysis-tab screenshot uses the collapsed view so no project
  data leaks
- GitHub repo metadata updated (description + 15 topics) via `gh repo edit`
- Linear: STO-2180 → Done, STO-2179 → Done, STO-2189 → Canceled (multi-agent
  reverted; structured-schema piece survived)

**What's next:**
- Nothing planned. Project is stable and shipped.
- If something surfaces: re-open the project in Linear and create a new ticket.

**Branch:** main
**Blockers:** None
**Claude session ID (reference only):** 3f6deb5c-73e9-4e8d-b510-4ac5f6352d97

## How to Resume

1. Run `npm install && npm run build` to refresh local artefacts.
2. `reuse serve` — web UI on http://localhost:3210.
3. To run the scout eval: `node scripts/scout-eval.mjs` (needs
   `ANTHROPIC_API_KEY` in `.env.local`).
4. To re-capture screenshots: `npm install --no-save puppeteer-core` then
   `node scripts/capture-screenshots.mjs`.
