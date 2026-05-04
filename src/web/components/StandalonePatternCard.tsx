import React from 'react';

type ClusterMember = {
  project: string;
  patternKey: string;
  summary: string;
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

const cardStyle: React.CSSProperties = {
  border: '1px dashed #c0c0c0',
  borderRadius: 8,
  padding: '0.875rem 1.125rem',
  background: '#fafafa',
};

const sectionLabel: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginTop: '0.75rem',
  marginBottom: '0.25rem',
};

const memberChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  background: '#fff',
  borderRadius: 12,
  padding: '0.2rem 0.625rem',
  fontSize: '0.75rem',
  color: '#333',
  border: '1px solid #e6e6e6',
  cursor: 'pointer',
  font: 'inherit',
};

const standaloneBadgeStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  background: '#eee',
  padding: '0.1rem 0.5rem',
  borderRadius: 4,
};

export default function StandalonePatternCard({ item, onMemberClick }: { item: StandalonePattern; onMemberClick?: (project: string) => void }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#333' }}>{item.capability}</h3>
        <span style={standaloneBadgeStyle}>standalone</span>
      </div>
      <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.825rem' }}>{item.description}</p>

      <div style={sectionLabel}>Pattern</div>
      <button
        style={memberChipStyle}
        title={`${item.member.summary}\n\nClick to open ${item.member.project} in Projects tab`}
        onClick={() => onMemberClick?.(item.member.project)}
      >
        <strong style={{ color: '#111' }}>{item.member.project}</strong>
        <span style={{ color: '#aaa' }}>·</span>
        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{item.member.patternKey}</span>
      </button>

      <div style={sectionLabel}>Rationale</div>
      <p style={{ margin: 0, fontSize: '0.825rem', color: '#444', lineHeight: 1.5 }}>{item.rationale}</p>

      <div style={sectionLabel}>Closest relative</div>
      <p style={{ margin: 0, fontSize: '0.825rem', color: '#444', lineHeight: 1.5 }}>{item.closestRelative}</p>

      {item.notes && (
        <>
          <div style={sectionLabel}>Notes</div>
          <p style={{ margin: 0, fontSize: '0.825rem', color: '#444', lineHeight: 1.5 }}>{item.notes}</p>
        </>
      )}
    </div>
  );
}
