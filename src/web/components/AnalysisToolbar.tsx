import React from 'react';

export type SortMode = 'default' | 'alpha' | 'member-count' | 'consolidation-first';

interface Props {
  query: string;
  onQueryChange: (q: string) => void;
  sort: SortMode;
  onSortChange: (s: SortMode) => void;
  resultCount: number;
  totalCount: number;
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.4rem 0.625rem',
  borderRadius: 6,
  border: '1px solid #ccc',
  fontSize: '0.875rem',
};

const selectStyle: React.CSSProperties = {
  padding: '0.4rem 0.625rem',
  borderRadius: 6,
  border: '1px solid #ccc',
  fontSize: '0.85rem',
  background: '#fff',
};

export default function AnalysisToolbar({ query, onQueryChange, sort, onSortChange, resultCount, totalCount }: Props) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem', alignItems: 'center' }}>
      <input
        type="search"
        placeholder="Search by capability, project, or pattern key…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        style={inputStyle}
        aria-label="Search clusters"
      />
      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortMode)}
        style={selectStyle}
        aria-label="Sort"
      >
        <option value="default">Default order</option>
        <option value="alpha">A → Z</option>
        <option value="member-count">Most members first</option>
        <option value="consolidation-first">Consolidation ideas first</option>
      </select>
      <span style={{ fontSize: '0.75rem', color: '#888', minWidth: '5rem', textAlign: 'right' }}>
        {resultCount === totalCount ? `${totalCount} items` : `${resultCount} / ${totalCount}`}
      </span>
    </div>
  );
}
