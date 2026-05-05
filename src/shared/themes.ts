/**
 * Top-level themes used to group analysis items in the UI.
 *
 * The existing per-pattern `domain` field describes the implementation layer
 * (frontend-web, backend-api, etc.). A `theme` is a different axis — the
 * functional capability area (data storage, LLM, image processing, …).
 * Both can coexist on the same item.
 *
 * Slugs are kebab-case so they survive copy/paste and JSON round-trips.
 * Labels are the human-friendly section header rendered in the UI.
 */
export const ANALYSIS_THEMES = [
  { id: 'ai-llm', label: 'AI & LLM integration', description: 'Provider routing, prompt construction, tool registries, vision/multimodal, agents, MCP servers, output-format registries.' },
  { id: 'data-storage-sync', label: 'Data storage & sync', description: 'Local persistence, offline-first merge, multi-tenancy, embedded databases, document/blob storage.' },
  { id: 'cloud-backend', label: 'Cloud functions & backend', description: 'Cloud Functions, scheduled jobs, hardened API proxies, server-side processing pipelines.' },
  { id: 'image-media', label: 'Image & media processing', description: 'Camera/library pick, compression, OCR, label scanning, video, audio.' },
  { id: 'ui-design-system', label: 'UI & design system', description: 'Modals, themes, animations, navigation patterns, decorative overlays, component primitives.' },
  { id: 'state-background', label: 'State & background processing', description: 'Context providers, background tasks, session registries, scheduled fetch, lifecycle.' },
  { id: 'security-encryption', label: 'Security & encryption', description: 'At-rest encryption, key derivation, opaque IDs, permission gating, audit-safe identifiers.' },
  { id: 'networking-realtime', label: 'Networking & realtime', description: 'SSE, websockets, push notifications, HTTP hooks, transports.' },
  { id: 'distribution-cli', label: 'Distribution & CLI', description: 'Copy-paste component registries, bundled MCPs, command launchers, CLI-launches-local-UI.' },
  { id: 'dev-tooling', label: 'Dev tooling & analysis', description: 'File watchers, AST parsers, framework detectors, graph snapshots, code analyzers.' },
  { id: 'testing-quality', label: 'Testing & quality', description: 'Test discipline, visual UAT, mocks-as-layer, coverage patterns.' },
  { id: 'docs-spec', label: 'Documentation & spec', description: 'Wiki taxonomies, methodology-as-code, in-app help, reusable design-doc templates.' },
  { id: 'observability-errors', label: 'Observability & errors', description: 'Token/cost sparklines, typed error codes, service health inference, structured logging.' },
  { id: 'platform-integration', label: 'Platform integration', description: 'OAuth, share intents, native bridges, Expo config plugins, OS-specific shells.' },
  { id: 'monetisation', label: 'Monetisation', description: 'Paywalls, freemium, quota tracking, billing, usage caps.' },
  { id: 'misc', label: 'Other', description: 'Patterns that genuinely do not fit any other theme.' },
] as const;

export type AnalysisThemeId = (typeof ANALYSIS_THEMES)[number]['id'];

export const ANALYSIS_THEME_IDS = ANALYSIS_THEMES.map((t) => t.id) as readonly AnalysisThemeId[];

export function themeLabel(id: AnalysisThemeId | string): string {
  return ANALYSIS_THEMES.find((t) => t.id === id)?.label ?? id;
}
