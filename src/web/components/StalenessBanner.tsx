import React from 'react';

type ChangedProjects = {
  added: string[];
  removed: string[];
  changed: string[];
};

interface Props {
  hasAnalysis: boolean;
  stale: boolean;
  generatedAt?: string;
  changedProjects?: ChangedProjects;
}

const baseStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: '0.625rem 0.875rem',
  borderRadius: 8,
  fontSize: '0.85rem',
  marginBottom: '1rem',
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  display: 'inline-block',
  marginRight: '0.5rem',
  flexShrink: 0,
};

export function formatRelativeDate(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  return then.toLocaleDateString();
}

export function summariseChanges(changed?: ChangedProjects): string | null {
  if (!changed) return null;
  const parts: string[] = [];
  if (changed.added.length > 0) parts.push(`${changed.added.length} added`);
  if (changed.changed.length > 0) parts.push(`${changed.changed.length} changed`);
  if (changed.removed.length > 0) parts.push(`${changed.removed.length} removed`);
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

export default function StalenessBanner({ hasAnalysis, stale, generatedAt, changedProjects }: Props) {
  if (!hasAnalysis) {
    return (
      <div style={{ ...baseStyle, background: '#f5f5f5', border: '1px solid #e0e0e0', color: '#555' }}>
        <span><span style={{ ...dotStyle, background: '#999' }} />No analysis run yet.</span>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>Click <em>Run analysis</em> to cluster patterns across your registry.</span>
      </div>
    );
  }

  if (!stale) {
    return (
      <div style={{ ...baseStyle, background: '#f0f9f0', border: '1px solid #c6e6c6', color: '#2a5e2a' }}>
        <span><span style={{ ...dotStyle, background: '#2a8e2a' }} />Up to date{generatedAt ? ` · ran ${formatRelativeDate(generatedAt)}` : ''}.</span>
      </div>
    );
  }

  const summary = summariseChanges(changedProjects);
  return (
    <div style={{ ...baseStyle, background: '#fff7e6', border: '1px solid #f3d99a', color: '#7a5500' }}>
      <span>
        <span style={{ ...dotStyle, background: '#d99a00' }} />
        Patterns changed since the last analysis{summary ? ` (${summary})` : ''}.
        {generatedAt ? <span style={{ color: '#999', marginLeft: '0.5rem', fontSize: '0.75rem' }}>last run {formatRelativeDate(generatedAt)}</span> : null}
      </span>
      <span style={{ fontSize: '0.75rem', color: '#a07700' }}>Click <em>Re-run analysis</em> to refresh.</span>
    </div>
  );
}
