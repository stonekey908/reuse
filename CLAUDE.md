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
- **`git filter-repo` refuses second run on same clone** → leaves
  `.git/filter-repo/already_ran` marker; subsequent invocations prompt
  interactively and abort under non-tty (`EOFError`) → Pipe `yes Y |` into the
  command, or delete `.git/filter-repo/`, or run from a fresh `git clone`.
- **Force-push to `main` blocked by `GH006` "protected branch hook declined"**
  → Repo has classic branch protection with force-push disabled → Toggle off
  "Do not allow force pushes" at `https://github.com/stonekey908/reuse/settings/branches`,
  push, then re-enable. Branch protection rules on `main` only — feature
  branches can be force-pushed/deleted freely.
- **Local commit identity is per-clone** → `git config user.email` writes to
  `.git/config` only, never tracked, never pushed → Set per-repo when working
  in a fresh clone if you want commits stamped with the noreply alias
  (`172332572+stonekey908@users.noreply.github.com`).

## Last Session

**Date:** 2026-05-05
**Who:** Claude session
**What was done:**
- Repo sanitisation pass — full audit for secrets, leaked paths, personal data.
  No secrets in tracked files or full git history. `.env` / `.env.local` /
  `.DS_Store` confirmed never committed; only `.env.example` (placeholders only)
  is tracked. All `/Users/...` references in tracked files are placeholders or
  `/Users/test/...` test fixtures.
- Local commit identity switched to GitHub noreply alias
  (`git config user.email 172332572+stonekey908@users.noreply.github.com`).
- Historic email scrub via `git filter-repo --mailmap` —
  `nicholas.s.elias@gmail.com` → `172332572+stonekey908@users.noreply.github.com`
  across all refs. Force-pushed rewritten `main` (required temporary disable of
  branch protection; user re-enabled after).
- Deleted 5 stale remote feature branches that still held the original email
  (`feat/STO-2150-analysis-schema-fingerprint`, `feat/STO-2159-analysis-search-nav`,
  `feat/STO-2160-extract-patterns-eval`, `feat/STO-2161-singleton-schema`,
  `feat/STO-multi-provider-runner`) — all confirmed merged into main first.
- Local cleanup: deleted backup branch + tag, expired reflog, ran
  `git gc --prune=now --aggressive`. Verified: zero refs reachable from any
  branch carry the real email.

**What's next:**
- Nothing planned. Project remains stable and shipped.
- If you want to fully scrub the original email from GitHub's internal cache
  (PR #1 merged-commit cache and the ~90-day GitHub reflog), email
  `support@github.com` and ask them to purge the cache for `stonekey908/reuse`.
  Real email may also surface on `api.github.com/users/stonekey908/events`
  for ~90 days.

**Previous session (2026-05-05 earlier):** structured-pattern MCP schema,
capability-walk scout + scout eval, per-model `maxOutputTokens`, streaming
Anthropic provider, `OutputTruncatedError`, 12 canonical themes, two-level
theme tree in Analysis tab, regenerated screenshots, GitHub repo metadata.
Tickets: STO-2180 → Done, STO-2179 → Done, STO-2189 → Canceled.

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
