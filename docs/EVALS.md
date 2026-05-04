# Analysis & Evals

Reuse can cluster patterns across all your registered projects by capability and surface consolidation opportunities. The clustering output has two evals to keep its quality honest as the prompt evolves.

This document covers: what the analysis does, what each eval does, how to run them, and how to iterate when output quality drifts.

## The clustering analysis

`analyze_patterns` (MCP tool) and `reuse analyze` (CLI) both produce the same output: a list of capability clusters across the registry. Each cluster has a capability name (e.g. "Document upload"), members (the per-project patterns that join it), a similarities paragraph, a differences paragraph, and an optional consolidation note with an effort/payoff judgment.

The analysis runs `claude -p` once with all your patterns inline. Results are cached to the registry; `GET /api/analysis` and the web Analysis tab show a staleness banner when patterns have changed since the last run. The cache is keyed on a sha256 fingerprint over canonical-sorted patterns, so unrelated edits (description, tags, links) don't trigger a re-run.

**Typical timing:** 30-90s for the small fixture (~16 patterns); 3-6 min for a full registry (~70+ patterns).

## E1 — Snapshot eval

**What it does.** Runs the analysis pipeline against a small fixed registry (`tests/fixtures/analysis/registry.json` — 5 projects, 16 patterns) and asserts the output matches a fuzzy-match expectation file (`expected-clusters.json`). Catches regressions in the parser, JSON validation, fingerprint logic, and prompt regressions when run in real mode.

**Two modes.**

- **Mocked (default).** Replays a recorded `claude -p` response from `recorded-response.json`. Instant, deterministic, free. Runs as part of `npm test`.
- **Real.** Invokes `claude -p` against the fixture. Slower (30-90s), costs CLI quota, gated behind `RUN_LLM_EVALS=1`.

**How to run.**

```bash
# Mocked — runs as part of the normal test suite
npm test

# Real
RUN_LLM_EVALS=1 npm test

# Or via the CLI
reuse eval
```

**What "pass" means.** For each expected cluster, the actual output must (a) include a cluster whose capability name contains one of the expected keywords, (b) include all required members, and (c) have at least the minimum member count. Every fixture pattern must be assigned to exactly one cluster.

**When it fails.** The error message lists each missing keyword, missing required member, and unassigned pattern. Real-mode failures are usually one of: prompt drift (the model now produces a slightly different cluster shape — update the recorded response or expected clusters), or an actual regression in the prompt.

## E2 — LLM-as-judge eval

**What it does.** Runs the analysis on the same fixture, then a **second** `claude -p` call scores the output against a rubric. Catches subjective quality issues E1 can't: clusters that technically validate but have shallow prose, vague consolidation notes, or wrong abstraction level.

**Rubric** (each scored 1-5):
- Cluster coherence
- Similarity quality
- Difference quality
- Consolidation usefulness
- Granularity / abstraction level

**How to run.**

```bash
# Either of these works
npm run eval:quality
reuse eval --quality
```

The script writes a markdown report to `eval-results/YYYY-MM-DD-HHMM.md` and prints the overall score to stdout. The directory is gitignored except for `.gitkeep`.

**How to read the report.**

1. Glance at the **overall score** and the per-rubric table. Anything below 4/5 is worth investigating.
2. Read the **weaknesses** section. Each entry has a `cluster_name`, `issue` (the judge's critique), and `evidence` (verbatim quote from the cluster output).
3. Read the **suggestions** section — the judge's proposed prompt improvements. These are usually concrete and actionable.

**Iterating on the prompt.**

```
1. npm run eval:quality      # baseline
2. Read the report
3. Edit src/analysis/prompt.ts
4. npm run eval:quality      # measure
5. Compare reports — was the change a real improvement or did another rubric dimension drop?
6. Repeat or revert
```

E2 is **manual only — never CI.** It's slow, non-deterministic, and the goal is exploratory tuning, not regression gating. E1 covers regression in CI.

## Extract-patterns eval (input-side)

The clustering analysis is only as good as the patterns the registry contains. If `extract_patterns` misses a major module in a project, the clustering can't recover from it. The extract eval guards the input side.

**Two layers:**

- **Layer 1 — scout snapshot (deterministic, fast).** The `extract_patterns` MCP tool is a synchronous scout that returns a directory tree, README, package.json, and a `suggestedFilesToRead` list. Layer 1 asserts that for a Turborepo-shaped fixture (`tests/fixtures/extract-patterns/sample-monorepo/`), the scout covers a representative file from every workspace module — apps and packages alike. This is the layer where the codeview MCP-server gap from STO-2158 lived.
- **Layer 2 — judge eval (LLM-in-the-loop, manual).** Sends the scout report to `claude -p` with the extraction instructions, gets back proposed patterns, then a second `claude -p` scores against ground-truth concerns from the fixture's `expected.json`. Writes a dated `extract-YYYY-MM-DD-HHMM.md` report.

**How to run.**

```bash
# Layer 1 — scout snapshot (runs as part of npm test too)
reuse eval --extract

# Layer 2 — LLM-as-judge
reuse eval --extract --quality
# or:
npm run eval:extract
```

**Updating the fixture.** When the fixture monorepo grows, add the new module to `tests/fixtures/extract-patterns/expected.json` under `expectedModules` with the fileFragment that scout's `suggestedFilesToRead` should match.

## Updating fixtures

The fixture is in `tests/fixtures/analysis/`:

- `registry.json` — the projects + patterns the eval runs against. Edit when you want to test a new clustering scenario.
- `recorded-response.json` — what `claude -p` "would" return for that fixture. **If you change `registry.json`, re-record this** by running the analysis once with `RUN_LLM_EVALS=1 npm test`, copying the produced output into the file, and committing.
- `expected-clusters.json` — fuzzy-match assertions. Edit if the registry change adds or removes a capability you want to test.

Keep the fixture small (5-6 projects, 15-20 patterns). It's not meant to mirror your real registry — it's meant to exercise the clustering pipeline with known overlap.

## Troubleshooting

**`claude -p` not on PATH.** The eval and the analysis endpoint both shell out to the Claude Code CLI. Install it from <https://claude.com/claude-code> and verify with `claude --version`. If `claude` is on PATH for your shell but not for the server, ensure your terminal launches with the right PATH (check `~/.zshrc` / `~/.bashrc` and `launchctl` config if you're on macOS).

**JSON parse failed.** The model returned non-JSON output twice in a row. The `JsonParseError` includes the raw output (first 500 chars in the CLI, full output in the `eval-results/last-judge-raw.txt` dump for E2). Common causes: prompt drift instructed the model to produce prose around the JSON; model decided to "explain" before answering; model truncated mid-token. Tighten the prompt's "return strict JSON only" line.

**Eval ran but the score is suspiciously high or low.** Check timing: `reuse eval --quality` logs `analysis Xs · judge Ys`. If both are very fast (< 10s combined), the runner may not actually be invoking `claude -p` — verify the script printed `[eval-quality] running analysis (claude -p, ~30-90s on the fixture)…` and not just exited.

**Stale cache.** The cache lives in `~/.reuse/registry.json` under the `analysis` key. Force a re-run with `reuse analyze --refresh` or hit `POST /api/analysis/run` from the web UI.

**Fixture drifted.** If E1 mocked passes but real-mode fails, the model has shifted but the recorded response hasn't. Re-record per the instructions above. If E1 real-mode also fails, the prompt itself regressed — read the diff and tune.

## See also

- `docs/plans/2026-05-04-pattern-clustering-analysis-design.md` — the design doc for the feature.
- `src/analysis/prompt.ts` — the cluster prompt; iterate here when E2 surfaces issues.
- `src/analysis/eval-quality.ts` — the judge rubric; tighten when score saturates at the same value across iterations (likely a structural issue, not a prompt issue).
