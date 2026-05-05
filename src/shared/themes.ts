/**
 * Top-level themes used to group analysis items in the UI.
 *
 * The existing per-pattern `domain` field describes the implementation layer
 * (frontend-web, backend-api, etc.). A `theme` is a different axis — the
 * functional capability area (data storage, LLM, image processing, …).
 * Both can coexist on the same item.
 *
 * The theme list below is empirically grounded — it was refined by looking
 * at the actual cross-project pattern distribution rather than guessing
 * a taxonomy. The 12 themes (plus "misc" catch-all) reflect what actually
 * shows up in a typical multi-app personal registry. If a theme would have
 * 1-2 patterns across many registries, it gets folded into a parent
 * (e.g. encryption → data-storage-sync; platform-integration → distribution-cli
 * or realtime-messaging based on usage).
 *
 * Slugs are kebab-case so they survive copy/paste and JSON round-trips.
 * Labels are the human-friendly section header rendered in the UI.
 */
export const ANALYSIS_THEMES = [
  { id: 'ai-llm', label: 'AI & LLM', description: 'AI provider routing, prompt construction & libraries, multimodal/vision, tool registries, agents, MCP servers, output-format registries, AI clarification loops, knowledge linters.' },
  { id: 'ui-components', label: 'UI components & interaction', description: 'Modals, navigation shells, themes & presets, animation tokens, haptics, decorative overlays, component primitives, design-system distribution, live theme labs.' },
  { id: 'data-storage-sync', label: 'Data storage, sync & encryption', description: 'Local persistence, offline-first merge, concurrent-write coordination, embedded databases, multi-tenancy, at-rest encryption, backup snapshots.' },
  { id: 'cloud-backend', label: 'Cloud functions & backend services', description: 'Cloud Functions, hardened API proxies (with quotas / rate limits / endpoint allowlists), scheduled server-side jobs, multi-source data fleets.' },
  { id: 'state-background', label: 'State, context & background work', description: 'Domain-sliced contexts, background tasks that survive route changes, session registries, in-flight response recovery, scheduled fetch.' },
  { id: 'realtime-messaging', label: 'Realtime, messaging & notifications', description: 'SSE broadcasters, websockets, web push (VAPID), HTTP hooks, JSONL/transcript watchers, toasts, share intents, native bridge messaging.' },
  { id: 'image-media', label: 'Image & media processing', description: 'Camera/library pick, image compression, OCR / label scanning, barcode capture, multimodal image-to-AI flows.' },
  { id: 'dev-tooling', label: 'Dev tooling & code analysis', description: 'AST parsers, framework / role detectors, file watchers, git-keyed snapshots, layout engines, capture scripts, layered-source-agent pipelines.' },
  { id: 'distribution-cli', label: 'Distribution & local CLIs', description: 'Copy-paste component registries, bundled MCP servers, CLI-launches-local-UI, double-click launchers, single-command dev orchestrators, build-tooling shims.' },
  { id: 'testing-quality', label: 'Testing & quality discipline', description: 'Heavy-tested AI services, tested context providers, one-test-per-component discipline, mocks-as-layer, visual UAT screenshot baselines.' },
  { id: 'docs-spec', label: 'Documentation & spec artefacts', description: 'Wiki taxonomy folders, methodology / glossary as code, in-app help as a typed module, design-doc templates, HTML mockups as canonical spec, demo-gif capture.' },
  { id: 'observability-errors', label: 'Observability & error handling', description: 'Token/cost sparklines, typed job error codes with friendly UI messages, background-service health inference, structured logging.' },
  { id: 'misc', label: 'Other', description: 'Patterns that genuinely do not fit any of the themes above (monetisation design docs, one-off platform shims, etc.).' },
] as const;

export type AnalysisThemeId = (typeof ANALYSIS_THEMES)[number]['id'];

export const ANALYSIS_THEME_IDS = ANALYSIS_THEMES.map((t) => t.id) as readonly AnalysisThemeId[];

export function themeLabel(id: AnalysisThemeId | string): string {
  return ANALYSIS_THEMES.find((t) => t.id === id)?.label ?? id;
}
