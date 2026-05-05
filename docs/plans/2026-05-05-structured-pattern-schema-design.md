# Structured pattern schema + multi-agent analysis — Design

**Date:** 2026-05-05
**Status:** Draft, awaiting approval before implementation
**Branch (working):** `feat/STO-multi-provider-runner`

## Goal

Stop chasing prompt tuning for the clustering analysis. The 4.0/5 ceiling is structural, not a prompt problem: pattern records in the registry don't carry the metadata the analysis needs (capability, abstraction level, domain). Every analysis run re-derives that metadata from prose, which is fragile.

Fix: add structured metadata at *inception* (when patterns are created), make analysis a deterministic group-by operation on that metadata, and split the remaining LLM work into narrow agents with frontend transparency.

## Context — what we proved

Six rounds of prompt tuning on the clustering analysis hit a 4.0/5 ceiling on Opus 4.7, with the same fundamental issues recurring across versions:

- Single-project clusters (e.g. "Codebase Analysis Pipeline" = 4 codeview members) — clusters by mechanism not capability.
- Mixed abstraction levels (modal-shell-primitive grouped with feature-specific barcode-scanner-modal).
- Discipline patterns clustered with the capability they exercise (test-coverage discipline mixed with multi-provider routing).
- Mechanism-not-capability bundling (React Context cluster mixing toast UX + provider count + test rig).

Each prompt rule fixed one symptom but new ones surfaced. The root cause: **the analyzer is asked to infer capability + level + domain from prose every run.** Patterns themselves carry no structured tags.

## Architecture

### Layer 1 — structured pattern schema

Each pattern in the registry gains four fields, set at inception by `extract_patterns`:

```ts
type Pattern = {
  // existing
  description: string;       // 1-2 sentence prose
  // new
  capability: string;        // free-form kebab-slug, normalized at analysis time
                             //   e.g. "document-upload", "react-context-domain-state"
  abstractionLevel:
    | "primitive"            // reusable infrastructure (modal shell, theme tokens)
    | "feature"              // concrete consumer of primitives (barcode scanner)
    | "discipline"           // testing, error handling, monitoring
    | "architecture"         // top-level structural choice
    | "spec";                // non-executable artifact (mockup, design doc)
  domain: string;            // broad area, also normalized
                             //   suggested set below; AI may propose new ones
  fileEvidence: string[];    // file paths from the project that demonstrate the pattern
};
```

`capability` and `domain` are intentionally free-form — a controlled vocabulary won't cover the long tail. We normalize at analysis time via the **glossary file** (Layer 2).

### Domain taxonomy — starter set

Based on inventory of the user's actual 70 patterns:

| Domain | Examples |
|---|---|
| `frontend-web` | Next.js page, web React component |
| `frontend-mobile` | RN screens, Expo modules |
| `frontend-native` | SwiftUI, AppKit (lookout's macOS bits) |
| `backend-api` | Express/Hono routes, Cloud Functions |
| `backend-data` | DB schemas, persistence layers |
| `ai-integration` | Provider abstractions, prompt assembly |
| `build-tooling` | Bundlers, Expo plugins, monorepo config |
| `dev-tooling` | CLIs, watchers, REPL launchers |
| `infra-system` | Process monitoring, IPC, OS-level interop |
| `design-system` | Themes, tokens, animation libs |
| `design-spec` | Mockups, design docs, non-executable artifacts |
| `testing-discipline` | Test patterns, eval frameworks |
| `docs-content` | Knowledge bases, markdown wikis |
| `distribution` | How the package gets to users (shadcn-style, .command launchers) |

This is a **starter set** stored in `src/analysis/glossary.ts`. The AI may propose new domain slugs; the glossary tracks them and lets the user merge synonyms.

### Layer 2 — deterministic grouping + glossary

`analyze_patterns` no longer asks an LLM to cluster. It:

1. Loads patterns with their `capability` + `abstractionLevel` + `domain` tags.
2. Reads the **glossary file** at `~/.reuse/glossary.json`:
   ```ts
   {
     capabilities: { "doc-upload": "document-upload", ... },  // alias → canonical
     domains: { "mobile-rn": "frontend-mobile", ... },
   }
   ```
3. Normalizes each pattern's tags via the glossary.
4. Groups patterns by `capability` slug — pure data operation.
5. Filters: groups with members from only one project become standalones (Layer 1's hard rule, now enforced in code not prose).
6. Filters: groups whose members span more than one `abstractionLevel` are split per level (e.g. a `document-upload` group with both `primitive` and `feature` members becomes two clusters).

Result: a clean grouped structure, deterministic and reproducible. No LLM drift on the *clustering* step.

### Layer 3 — multi-agent for the writing step

Once groups are determined, we still want similarities/differences/consolidation prose. Three narrow agents:

| Agent | Input | Output | Cost |
|---|---|---|---|
| **Tagger** | A single pattern (description + project context) | `{ capability, abstractionLevel, domain, fileEvidence }` | Tiny prompt, cheap. Sonnet 4.6 or Haiku 4.5. Runs N times (one per pattern). |
| **Glossary normalizer** | Set of new tags + existing glossary | Updated glossary with proposed merges | Runs once per analyze. |
| **Writer** | A single group (≥2 patterns, same capability+level) | similarities, differences, consolidationNote | Smaller context = better output. Runs once per group. |

The `Writer` job is much smaller than today's monolithic prompt — it sees only the patterns in *one* group, not all 70. Higher quality + faster.

### Frontend transparency — SSE agent stream

User-facing requirement: **see which agent is doing what.**

- Server side: replace the synchronous `POST /api/analysis/run` with an SSE endpoint `GET /api/analysis/run`. Server emits events as agents fire:
  ```
  event: agent-start
  data: { "agent": "tagger", "totalPatterns": 70 }

  event: tagger-progress
  data: { "tagged": 12, "totalPatterns": 70, "currentPattern": "schoolsync/visible-upload-queue-ui" }

  event: agent-done
  data: { "agent": "tagger", "elapsedSec": 31 }

  event: agent-start
  data: { "agent": "grouper" }

  event: agent-done
  data: { "agent": "grouper", "elapsedSec": 0, "groupCount": 18 }

  event: agent-start
  data: { "agent": "writer", "groupCount": 18 }

  event: writer-progress
  data: { "written": 3, "totalGroups": 18, "currentGroup": "Document upload" }

  event: complete
  data: { "analysis": { ... } }
  ```

- Frontend: `EventSource` consumes the stream. UI shows a vertical timeline:
  ```
  ✓ Tagger      31s  · 70 / 70 patterns tagged
  ✓ Grouper     0s   · 18 groups identified
  ⟳ Writer      4m   · 7 / 18 groups written  ← live updating
    Multi-Provider AI · React Context state · Document upload …
  ```

Old synchronous endpoint kept for the MCP tool (which doesn't have a UI to stream into).

## Implementation waves

### Wave 1 — schema + glossary (~2 hr)

- Extend `ProjectSchema.patterns` from `Record<string, string>` to `Record<string, Pattern>` (Pattern as defined above).
- Backward-compat: a string value is treated as `{ description: <string>, capability: undefined, ... }` so existing registries load.
- New file `src/analysis/glossary.ts` + persisted glossary at `~/.reuse/glossary.json`.
- Schema migration test.

### Wave 2 — tagger agent + bulk backfill (~2 hr)

- `src/analysis/agents/tagger.ts` — narrow prompt, takes one pattern, returns `{ capability, abstractionLevel, domain, fileEvidence }`.
- Backfill flow: walk every existing pattern, run tagger, save tags. ~70 calls × Haiku/Sonnet, parallelizable. ~3-5 min total.
- New CLI command `reuse tag` to trigger backfill manually.
- New MCP tool `tag_pattern` for AI sessions to propose tags during pattern creation.

### Wave 3 — grouper + glossary normalizer (~1 hr)

- `src/analysis/grouper.ts` — pure function: takes tagged patterns, applies glossary normalization, groups by capability+abstractionLevel+multi-project rule. No LLM.
- `src/analysis/agents/glossary-normalizer.ts` — runs once before grouping, proposes merges (e.g. `doc-upload` and `document-upload` → same).

### Wave 4 — writer agent + analyze pipeline (~2 hr)

- `src/analysis/agents/writer.ts` — narrow prompt: takes one group, returns its similarities/differences/consolidation prose.
- Rewrite `runAnalysis` to: tag (if missing) → glossary normalize → group → write per group → assemble.
- The existing prompt rule churn is replaced by deterministic logic + per-group narrow LLM calls.

### Wave 5 — SSE streaming + frontend timeline (~2 hr)

- New `GET /api/analysis/run` (SSE) alongside existing `POST /api/analysis/run` (synchronous, for MCP).
- `src/web/components/AnalysisRunTimeline.tsx` — replaces the simple "Running…" pulsing-dot button when a run is active. Shows agent-by-agent progress.
- Stop button calls `POST /api/analysis/cancel` as before.

### Wave 6 — re-run on the real registry, validate (~30 min + LLM time)

- Restart server, kick off a fresh run from the UI, watch the timeline.
- Compare resulting analysis to current 4.0/5 baseline. Hypothesis: 4.5+/5 because clustering is now deterministic and writer agents have narrow context.
- Update tests + docs.

## Out of scope

- Multi-model writer agents (different writer for different groups). Could be a follow-up.
- Per-cluster history (every Writer call cached so re-runs only re-process changed groups). Performance optimization, defer.
- UI editing of capability tags. Future.

## Risks

- **Glossary drift** — new patterns propose new slugs. Mitigation: glossary is small + the normalizer agent surfaces merges for user review.
- **Tagger inconsistency** — same pattern tagged differently by different tagger runs. Mitigation: include the project context + already-tagged sibling patterns in the tagger prompt for stability.
- **SSE complexity** — Express SSE + reconnect handling. Mitigation: simple unidirectional stream, no reconnect logic v1, fall back to one-shot endpoint if SSE fails.
- **Backfill cost** — 70 tagger calls. On Haiku, ~$0.50 total. On Sonnet, ~$2. Acceptable.

## See also

- `docs/EVALS.md` — eval framework, will need updating for the per-group writer.
- `docs/plans/2026-05-04-pattern-clustering-analysis-design.md` — original design (single-LLM clustering). This doc supersedes that approach.
