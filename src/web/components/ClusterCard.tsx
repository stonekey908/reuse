import React from 'react';

type ClusterMember = {
  project: string;
  patternKey: string;
  summary: string;
};

type Cluster = {
  capability: string;
  description: string;
  members: ClusterMember[];
  similarities: string;
  differences: string;
  consolidationNote?: string;
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: '1rem 1.25rem',
  background: '#fff',
};

const sectionLabel: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginTop: '0.875rem',
  marginBottom: '0.25rem',
};

const memberChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  background: '#f4f4f4',
  borderRadius: 12,
  padding: '0.2rem 0.625rem',
  fontSize: '0.75rem',
  color: '#333',
  border: '1px solid #e6e6e6',
  cursor: 'pointer',
  font: 'inherit',
};

const consolidationStyle: React.CSSProperties = {
  marginTop: '0.875rem',
  background: '#fffbe6',
  border: '1px solid #ffe58f',
  borderRadius: 6,
  padding: '0.625rem 0.75rem',
  fontSize: '0.8rem',
  color: '#7a5500',
};

export default function ClusterCard({ cluster, onMemberClick }: { cluster: Cluster; onMemberClick?: (project: string) => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#111' }}>{cluster.capability}</h3>
        <span style={{ fontSize: '0.75rem', color: '#888' }}>
          {cluster.members.length} {cluster.members.length === 1 ? 'pattern' : 'patterns'}
        </span>
      </div>
      <p style={{ margin: '0.25rem 0 0', color: '#555', fontSize: '0.875rem' }}>{cluster.description}</p>

      <div style={sectionLabel}>Members</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {cluster.members.map((m) => (
          <button
            key={`${m.project}::${m.patternKey}`}
            style={memberChipStyle}
            title={`${m.summary}\n\nClick to open ${m.project} in Projects tab`}
            onClick={() => onMemberClick?.(m.project)}
          >
            <strong style={{ color: '#111' }}>{m.project}</strong>
            <span style={{ color: '#aaa' }}>·</span>
            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{m.patternKey}</span>
          </button>
        ))}
      </div>

      <div style={sectionLabel}>Similarities</div>
      <p style={{ margin: 0, fontSize: '0.875rem', color: '#333', lineHeight: 1.5 }}>{cluster.similarities}</p>

      <div style={sectionLabel}>Differences</div>
      <p style={{ margin: 0, fontSize: '0.875rem', color: '#333', lineHeight: 1.5 }}>{cluster.differences}</p>

      {cluster.consolidationNote && (
        <div style={consolidationStyle}>
          <strong style={{ color: '#7a5500' }}>Consolidation idea:</strong> {cluster.consolidationNote}
        </div>
      )}
    </div>
  );
}
