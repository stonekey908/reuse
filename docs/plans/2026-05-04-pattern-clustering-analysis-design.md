# Pattern Clustering Analysis — Design

**Date:** 2026-05-04
**Status:** Approved, ready for implementation
**Linear epic:** [STO-2149](https://linear.app/stonekey/issue/STO-2149/pattern-clustering-analysis-cross-project-capability-grouping-with) (Wave 1: STO-2150–2153 · Wave 2: STO-2154–2155 · Wave 3: STO-2156–2157)

## Goal

Surface duplication and consolidation opportunities across registered projects' patterns. Today the registry stores patterns per project, but there's no view across them — so two projects with near-identical "document upload" patterns are invisible to each other. This feature clusters patterns across the whole registry by capability and explains in plain English where they're the same and where they diverge.

## Architecture

**`claude -p` shell-out from the Express backend.** No Anthropic API key needed; uses the user's logged-in Claude Code CLI. Web button hits `POST /api/analysis/run`, server collects every project's patterns, prompts `claude -p` with the previous cluster names plus the current pattern set, parses returned JSON, validates with Zod, caches to the registry.

**Cached, fingerprinted, with staleness detection.** Result lives on the registry under a new top-level `analysis` key (timestamp, sha256 fingerprint of canonical patterns JSON, cluster array). On UI load we recompute the fingerprint and compare — match shows green, mismatch shows amber "patterns changed since last run, re-run to refresh" with an added/changed/removed project diff hint.

**Dynamic cluster evolution.** The prompt seeds the model with prior clusters so names stay stable across re-runs unless meaning genuinely shifts. New patterns either join an existing cluster or spawn a new one; clusters with no remaining patterns are dropped. Schema-validated server-side; one retry on parse failure.

## Data model

```ts
// added to RegistrySchema
analysis: z.object({
  generatedAt: z.string(),              // ISO timestamp
  registryFingerprint: z.string(),       // sha256 of canonical {project: sortedPatterns}
  clusters: z.array(z.object({
    capability: z.string(),              // e.g. "Document upload"
    description: z.string(),             // 1-line cluster summary
    members: z.array(z.object({
      project: z.string(),
      patternKey: z.string(),
      summary: z.string(),
    })),
    similarities: z.string(),            // natural language
    differences: z.string(),             // natural language
    consolidationNote: z.string().optional(),
  })),
}).optional();
```

## Surfaces

**MCP tool** (`analyze_patterns`) — same prompt + parsing as the backend, callable from any Claude session. Caches to the same registry slot.

**Backend endpoint** — `POST /api/analysis/run` (force re-run), `GET /api/analysis` (read cached + staleness verdict).

**Web UI** — new "Analysis" tab in the existing Vite + React app:
- Header: status pill (`Up to date · {date}` / `Stale — {N} projects changed` / `No analysis run yet`) + "Run analysis" button.
- Body: cluster cards. Each card shows capability name, member projects (with their pattern key), similarities paragraph, differences paragraph, optional consolidation note.
- Empty state directs to backfill if any project has empty patterns.

**CLI** — `reuse analyze [--refresh]`, `reuse eval [--quality]`. Both surface in `reuse --help`.

## Evals

**E1 — Snapshot tests.** Fixture registry at `tests/fixtures/analysis/` (5-6 projects, ~20 patterns, known correct clusters). Two modes:
- **Mocked** (default in `npm test`) — uses recorded `claude -p` response. Instant, deterministic.
- **Real** (`RUN_LLM_EVALS=1 npm test`) — actually invokes `claude -p`. Runs in CI on PRs touching `src/analysis/**`, `src/mcp/server.ts`, or the prompt file.

**E2 — LLM-as-judge.** `npm run eval:quality` runs analysis on the fixture, then a second `claude -p` call scores the output against a rubric (cluster coherence, similarity/difference quality, consolidation usefulness). Writes `eval-results/YYYY-MM-DD-HHMM.md`. Manual only — never in CI.

## Help / docs

- `reuse --help` gets a new "Analysis & Evals" section.
- New `docs/EVALS.md` covers what each eval does, when it runs, how to run manually, how to read the report, how to update fixtures.
- README links to `docs/EVALS.md` under a new "Analysis & Evals" heading.

## Backfill (prerequisite, already done)

Projects without patterns are invisible to clustering. As of 2026-05-04 all 9 registered projects have patterns. New registrations will continue to be prompted via the existing `register_project` → `extract_patterns` → `update_project` flow.

## Implementation waves

**Wave 1 — Foundation slice (vertical: schema → backend → UI).**
1. Schema + fingerprint hash + Zod additions.
2. Backend `claude -p` shell-out, prompt module, JSON parse with retry, cache writes.
3. Web Analysis tab: button, staleness banner, cluster cards.
4. MCP `analyze_patterns` tool reusing the same prompt + parser.

**Wave 2 — Quality.**
5. E1 snapshot eval (fixture + mocked + real modes + CI gating).
6. E2 LLM-as-judge eval (rubric + markdown report writer).

**Wave 3 — UX & docs.**
7. CLI `reuse analyze` + `reuse eval` commands; help text updates.
8. `docs/EVALS.md` + README updates.

## Out of scope

- Auto re-running analysis on registry write (manual button only).
- Cross-pattern code similarity (we're clustering by description, not AST).
- Hosting the backend remotely (local-only; `claude -p` requires the user's machine).
- Editing/merging clusters from the UI.

## Risks

- **`claude -p` not on PATH** — fail loudly with an actionable error pointing at install docs.
- **JSON parse failures** — one retry with a stricter prompt; second failure surfaces raw output and an "open a bug" prompt.
- **Cluster name churn across re-runs** — mitigated by seeding prior clusters in the prompt; eval E2 catches if it regresses.
- **Long pattern sets exceeding `claude -p` context** — currently small (~70 patterns, well under 10KB). Revisit if registry grows past ~50 projects.
