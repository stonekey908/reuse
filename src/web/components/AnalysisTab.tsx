import React, { useEffect, useMemo, useState } from 'react';
import StalenessBanner from './StalenessBanner';
import ClusterCard from './ClusterCard';
import StandalonePatternCard from './StandalonePatternCard';
import AnalysisToolbar, { type SortMode } from './AnalysisToolbar';
import ProjectFilterChips from './ProjectFilterChips';

type ClusterMember = { project: string; patternKey: string; summary: string };
type Cluster = {
  kind?: 'cluster';
  capability: string;
  description: string;
  members: ClusterMember[];
  similarities: string;
  differences: string;
  consolidationNote?: string;
};
type StandalonePattern = {
  kind: 'standalone';
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

const disabledButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: '#888',
  cursor: 'not-allowed',
};

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

export default function AnalysisTab({ onJumpToProject }: Props) {
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [emptyPatternProjects, setEmptyPatternProjects] = useState<{ empty: number; total: number }>({ empty: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawOutput, setRawOutput] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortMode>('default');

  const fetchAnalysis = async () => {
    const res = await fetch('/api/analysis');
    const json: AnalysisResponse = await res.json();
    setData(json);
  };

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
  }, []);

  const runAnalysis = async () => {
    setRunning(true);
    setError(null);
    setRawOutput(null);
    try {
      const res = await fetch('/api/analysis/run', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Analysis failed.');
        if (json.code === 'CLAUDE_NOT_FOUND' && json.hint) setError(`${json.error}\n\n${json.hint}`);
        if (json.code === 'JSON_PARSE_FAILED' && json.rawOutput) setRawOutput(json.rawOutput);
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
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
        <button
          onClick={runAnalysis}
          disabled={running}
          style={running ? disabledButtonStyle : buttonStyle}
        >
          {running ? 'Running… 3–6 min for full registry' : hasAnalysis ? 'Re-run analysis' : 'Run analysis'}
        </button>
      </div>

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {visibleClusters.map((item) =>
              item.kind === 'standalone' ? (
                <StandalonePatternCard
                  key={`standalone-${item.capability}`}
                  item={item}
                  onMemberClick={onJumpToProject}
                />
              ) : (
                <ClusterCard
                  key={`cluster-${item.capability}`}
                  cluster={item}
                  onMemberClick={onJumpToProject}
                />
              ),
            )}
          </div>
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
