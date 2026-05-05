import React, { useEffect, useMemo, useRef, useState } from 'react';
import StalenessBanner from './StalenessBanner';
import ClusterCard from './ClusterCard';
import StandalonePatternCard from './StandalonePatternCard';
import AnalysisToolbar, { type SortMode } from './AnalysisToolbar';
import ProjectFilterChips from './ProjectFilterChips';
import ProviderPicker, { type ProviderId, type ProviderInfo, type RunMode } from './ProviderPicker';
import { ANALYSIS_THEMES, themeLabel } from '../../shared/themes';

type ClusterMember = { project: string; patternKey: string; summary: string };
type Cluster = {
  kind?: 'cluster';
  theme?: string;
  capability: string;
  description: string;
  members: ClusterMember[];
  similarities: string;
  differences: string;
  consolidationNote?: string;
};
type StandalonePattern = {
  kind: 'standalone';
  theme?: string;
  capability: string;
  description: string;
  member: ClusterMember;
  rationale: string;
  closestRelative: string;
  notes?: string;
};
type AnalysisItem = Cluster | StandalonePattern;

type Analysis = {
  generatedAt: string;
  registryFingerprint: string;
  projectFingerprints: Record<string, string>;
  clusters: AnalysisItem[];
};

type AnalysisResponse = {
  analysis: Analysis | null;
  stale: boolean;
  changedProjects?: { added: string[]; removed: string[]; changed: string[] };
};

type ProjectsResponse = {
  projects: Record<string, { patterns?: Record<string, string> }>;
};

const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.875rem',
  fontWeight: 500,
};

const stopButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#a02020',
};

const runningPulseStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#fff',
  marginRight: '0.5rem',
  animation: 'reuse-pulse 1s ease-in-out infinite',
};

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

const errorStyle: React.CSSProperties = {
  marginTop: '1rem',
  background: '#fff0f0',
  border: '1px solid #f5c0c0',
  color: '#a02020',
  borderRadius: 6,
  padding: '0.75rem 1rem',
  fontSize: '0.85rem',
};

interface Props {
  onJumpToProject?: (project: string) => void;
}

function itemMembers(item: AnalysisItem): ClusterMember[] {
  return item.kind === 'standalone' ? [item.member] : item.members;
}

function matchesQuery(item: AnalysisItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (item.capability.toLowerCase().includes(q)) return true;
  if (item.description.toLowerCase().includes(q)) return true;
  for (const m of itemMembers(item)) {
    if (m.project.toLowerCase().includes(q)) return true;
    if (m.patternKey.toLowerCase().includes(q)) return true;
  }
  return false;
}

function matchesProjectFilter(item: AnalysisItem, selectedProjects: Set<string>): boolean {
  if (selectedProjects.size === 0) return true;
  for (const m of itemMembers(item)) {
    if (selectedProjects.has(m.project)) return true;
  }
  return false;
}

function compareItems(a: AnalysisItem, b: AnalysisItem, mode: SortMode): number {
  if (mode === 'alpha') return a.capability.localeCompare(b.capability);
  if (mode === 'member-count') return itemMembers(b).length - itemMembers(a).length;
  if (mode === 'consolidation-first') {
    const aHas = a.kind !== 'standalone' && !!a.consolidationNote;
    const bHas = b.kind !== 'standalone' && !!b.consolidationNote;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return 0;
  }
  return 0;
}

/**
 * Group analysis items by their `theme` field and render each group as a
 * collapsible section. Items without a theme (legacy cache or model omission)
 * land under "Other".
 */
function ThemedAnalysisList({
  items,
  onMemberClick,
}: {
  items: AnalysisItem[];
  onMemberClick?: (project: string) => void;
}) {
  // Preserve canonical theme order from ANALYSIS_THEMES; bucket per theme.
  const buckets = useMemo(() => {
    const map = new Map<string, AnalysisItem[]>();
    for (const t of ANALYSIS_THEMES) map.set(t.id, []);
    map.set('misc', map.get('misc') ?? []);
    for (const item of items) {
      const themeId = item.theme && map.has(item.theme) ? item.theme : 'misc';
      map.get(themeId)!.push(item);
    }
    return Array.from(map.entries()).filter(([, arr]) => arr.length > 0);
  }, [items]);

  // Collapse only "misc" by default; everything else expanded so the user
  // sees the structure on first render.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => ({ misc: true }));

  if (buckets.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {buckets.map(([themeId, themeItems]) => {
        const isCollapsed = !!collapsed[themeId];
        return (
          <section key={themeId} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setCollapsed((prev) => ({ ...prev, [themeId]: !prev[themeId] }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid #e5e5e5',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '1rem',
                fontWeight: 600,
                color: '#111',
              }}
              aria-expanded={!isCollapsed}
            >
              <span style={{ fontFamily: 'monospace', color: '#888', fontSize: '0.875rem', width: '1ch' }}>
                {isCollapsed ? '▸' : '▾'}
              </span>
              <span>{themeLabel(themeId)}</span>
              <span style={{ marginLeft: 'auto', color: '#888', fontWeight: 400, fontSize: '0.875rem' }}>
                {themeItems.length} item{themeItems.length === 1 ? '' : 's'}
              </span>
            </button>
            {!isCollapsed && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {themeItems.map((item) =>
                  item.kind === 'standalone' ? (
                    <StandalonePatternCard
                      key={`standalone-${themeId}-${item.capability}`}
                      item={item}
                      onMemberClick={onMemberClick}
                    />
                  ) : (
                    <ClusterCard
                      key={`cluster-${themeId}-${item.capability}`}
                      cluster={item}
                      onMemberClick={onMemberClick}
                    />
                  ),
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default function AnalysisTab({ onJumpToProject }: Props) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [emptyPatternProjects, setEmptyPatternProjects] = useState<{ empty: number; total: number }>({ empty: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortMode>('default');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(
    () => (typeof window !== 'undefined' ? (localStorage.getItem('reuse:provider') as ProviderId | null) : null),
  );
  const [selectedModel, setSelectedModel] = useState<string | null>(
    () => (typeof window !== 'undefined' ? localStorage.getItem('reuse:model') : null),
  );
  const [runMode, setRunMode] = useState<RunMode>(
    () => (typeof window !== 'undefined' && localStorage.getItem('reuse:runMode') === 'append' ? 'append' : 'reset'),
  );

  const fetchAnalysis = async () => {
    const res = await fetch('/api/analysis');
    const json: AnalysisResponse = await res.json();
    setData(json);
  };

  const fetchProviders = async () => {
    const res = await fetch('/api/providers');
    if (!res.ok) return;
    const json: { providers: ProviderInfo[] } = await res.json();
    setProviders(json.providers);

    // Pick a sensible default if none selected yet, or if the saved selection is unavailable.
    const savedProvider = selectedProvider;
    const savedAvailable = json.providers.find((p) => p.id === savedProvider)?.available;
    if (!savedProvider || !savedAvailable) {
      const firstAvail = json.providers.find((p) => p.available && p.models.length > 0);
      if (firstAvail) {
        setSelectedProvider(firstAvail.id);
        setSelectedModel(firstAvail.models[0].id);
      }
    } else if (!selectedModel) {
      const provider = json.providers.find((p) => p.id === savedProvider);
      if (provider?.models[0]) setSelectedModel(provider.models[0].id);
    }
  };

  useEffect(() => {
    if (selectedProvider && typeof window !== 'undefined') localStorage.setItem('reuse:provider', selectedProvider);
  }, [selectedProvider]);
  useEffect(() => {
    if (selectedModel && typeof window !== 'undefined') localStorage.setItem('reuse:model', selectedModel);
  }, [selectedModel]);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('reuse:runMode', runMode);
  }, [runMode]);

  const fetchEmptyPatternStats = async () => {
    const res = await fetch('/api/projects');
    const json: ProjectsResponse = await res.json();
    const total = Object.keys(json.projects).length;
    let empty = 0;
    for (const project of Object.values(json.projects)) {
      if (!project.patterns || Object.keys(project.patterns).length === 0) empty += 1;
    }
    setEmptyPatternProjects({ empty, total });
  };

  useEffect(() => {
    fetchAnalysis();
    fetchEmptyPatternStats();
    fetchProviders();
  }, []);

  const runAnalysis = async () => {
    if (!selectedProvider || !selectedModel) {
      setError('Pick a provider and model before running.');
      return;
    }
    setRunning(true);
    setError(null);
    setRawOutput(null);
    setElapsedSec(0);
    const startedAt = Date.now();
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    const abort = new AbortController();
    abortControllerRef.current = abort;

    try {
      const res = await fetch('/api/analysis/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, model: selectedModel, mode: runMode }),
        signal: abort.signal,
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.code === 'CANCELLED') {
          // Cancellation is not an error — just refresh to show the existing analysis state.
          await fetchAnalysis();
          return;
        }
        setError(json.error || 'Analysis failed.');
        if (json.code === 'PROVIDER_NOT_CONFIGURED') {
          setError(`${json.error}\n\nAdd ${json.envKey} to your .env and restart the server.`);
        }
        if (json.code === 'CLAUDE_NOT_FOUND' && json.hint) setError(`${json.error}\n\n${json.hint}`);
        if (json.code === 'JSON_PARSE_FAILED' && json.rawOutput) setRawOutput(json.rawOutput);
        if (json.code === 'OUTPUT_TRUNCATED') {
          if (json.partial) setRawOutput(json.partial);
          if (json.hint) setError(`${json.error}\n\n${json.hint}`);
        }
        return;
      }
      setData(json);
    } catch (err) {
      // AbortError on the client side fires when the user clicks Stop — treat as cancellation.
      if (err instanceof Error && (err.name === 'AbortError' || /abort/i.test(err.message))) {
        await fetchAnalysis();
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      abortControllerRef.current = null;
      setRunning(false);
    }
  };

  const stopAnalysis = async () => {
    // Tell the server first so the spawned API call gets aborted server-side,
    // then abort the client fetch so the UI returns immediately.
    try {
      await fetch('/api/analysis/cancel', { method: 'POST' });
    } catch {
      /* ignore */
    }
    abortControllerRef.current?.abort();
  };

  const hasAnalysis = !!data?.analysis;
  const stale = data?.stale ?? true;
  const generatedAt = data?.analysis?.generatedAt;
  const clusters = data?.analysis?.clusters ?? [];

  const projectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of clusters) {
      for (const m of itemMembers(item)) {
        counts[m.project] = (counts[m.project] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clusters]);

  const visibleClusters = useMemo(() => {
    const filtered = clusters.filter((item) => matchesQuery(item, query) && matchesProjectFilter(item, selectedProjects));
    if (sort === 'default') return filtered;
    return [...filtered].sort((a, b) => compareItems(a, b, sort));
  }, [clusters, query, selectedProjects, sort]);

  const toggleProject = (name: string) => {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const clearProjects = () => setSelectedProjects(new Set());

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Pattern clusters</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#888' }}>
            Groups patterns across your registry by capability, with similarities and differences in plain English.
          </p>
        </div>
        {running ? (
          <button onClick={stopAnalysis} style={stopButtonStyle} title="Cancel the in-flight analysis">
            <span style={runningPulseStyle} />Stop · {formatElapsed(elapsedSec)}
          </button>
        ) : (
          <button onClick={runAnalysis} style={buttonStyle}>
            {hasAnalysis ? 'Re-run analysis' : 'Run analysis'}
          </button>
        )}
      </div>
      <style>{`@keyframes reuse-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>

      <ProviderPicker
        providers={providers}
        selectedProvider={selectedProvider}
        selectedModel={selectedModel}
        onProviderChange={(p) => {
          setSelectedProvider(p);
          // Auto-select first model when provider changes
          const firstModel = providers.find((info) => info.id === p)?.models[0]?.id ?? null;
          setSelectedModel(firstModel);
        }}
        onModelChange={setSelectedModel}
        mode={runMode}
        onModeChange={setRunMode}
        hasExistingAnalysis={hasAnalysis}
      />

      <StalenessBanner
        hasAnalysis={hasAnalysis}
        stale={stale}
        generatedAt={generatedAt}
        changedProjects={data?.changedProjects}
      />

      {emptyPatternProjects.empty > 0 && (
        <div style={{
          marginBottom: '1rem',
          background: '#fff7e6',
          border: '1px solid #f3d99a',
          color: '#7a5500',
          borderRadius: 8,
          padding: '0.625rem 0.875rem',
          fontSize: '0.85rem',
        }}>
          <strong>Heads-up:</strong> {emptyPatternProjects.empty} of {emptyPatternProjects.total} projects have no patterns. Backfill before running for accurate results — projects with empty patterns are invisible to the clustering analysis.
        </div>
      )}

      {error && (
        <div style={errorStyle}>
          <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{error}</pre>
          {rawOutput && (
            <details style={{ marginTop: '0.5rem' }}>
              <summary style={{ cursor: 'pointer', fontSize: '0.75rem' }}>Show raw Claude output</summary>
              <pre style={{
                marginTop: '0.5rem',
                background: '#fff',
                border: '1px solid #f5c0c0',
                borderRadius: 4,
                padding: '0.5rem',
                fontSize: '0.7rem',
                overflow: 'auto',
                maxHeight: '20rem',
              }}>{rawOutput}</pre>
            </details>
          )}
        </div>
      )}

      {clusters.length > 0 && (
        <>
          <AnalysisToolbar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            resultCount={visibleClusters.length}
            totalCount={clusters.length}
          />
          <ProjectFilterChips
            projectCounts={projectCounts}
            selected={selectedProjects}
            onToggle={toggleProject}
            onClear={clearProjects}
          />
          <ThemedAnalysisList items={visibleClusters} onMemberClick={onJumpToProject} />
          {visibleClusters.length === 0 && (
            <p style={{ color: '#888', fontSize: '0.875rem', textAlign: 'center', padding: '2rem 0' }}>
              No clusters match the current filters. Clear search or filter chips to see all.
            </p>
          )}
        </>
      )}

      {hasAnalysis && clusters.length === 0 && (
        <p style={{ color: '#888', fontSize: '0.875rem' }}>The last run produced no clusters. Try re-running the analysis.</p>
      )}
    </div>
  );
}
