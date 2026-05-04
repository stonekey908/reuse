import React from 'react';

interface Props {
  projectCounts: Array<{ name: string; count: number }>;
  selected: Set<string>;
  onToggle: (project: string) => void;
  onClear: () => void;
}

const chipBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.25rem',
  padding: '0.2rem 0.625rem',
  borderRadius: 12,
  fontSize: '0.75rem',
  cursor: 'pointer',
  border: '1px solid #e6e6e6',
  background: '#f4f4f4',
  color: '#333',
  userSelect: 'none' as const,
};

const chipActive: React.CSSProperties = {
  ...chipBase,
  background: '#111',
  color: '#fff',
  border: '1px solid #111',
};

const countStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  opacity: 0.7,
};

export default function ProjectFilterChips({ projectCounts, selected, onToggle, onClear }: Props) {
  if (projectCounts.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.875rem', alignItems: 'center' }}>
      <span style={{ fontSize: '0.7rem', color: '#888', marginRight: '0.25rem' }}>Filter by project:</span>
      {projectCounts.map(({ name, count }) => {
        const isActive = selected.has(name);
        return (
          <button
            key={name}
            onClick={() => onToggle(name)}
            style={isActive ? chipActive : chipBase}
            aria-pressed={isActive}
          >
            <span>{name}</span>
            <span style={countStyle}>{count}</span>
          </button>
        );
      })}
      {selected.size > 0 && (
        <button
          onClick={onClear}
          style={{ ...chipBase, background: 'transparent', borderColor: 'transparent', color: '#888' }}
        >
          clear
        </button>
      )}
    </div>
  );
}
