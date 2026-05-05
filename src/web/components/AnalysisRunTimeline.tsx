import React from 'react';

export type AgentName = 'tagger' | 'normalizer' | 'grouper' | 'writer';

export interface AgentState {
  status: 'pending' | 'running' | 'done' | 'error';
  total?: number;
  done?: number;
  current?: string;
  elapsedSec?: number;
  meta?: Record<string, unknown>;
}

interface Props {
  agents: Record<AgentName, AgentState>;
  errorMsg?: string;
  onStop: () => void;
}

const ORDER: { name: AgentName; label: string; description: string }[] = [
  { name: 'tagger', label: 'Tagger', description: 'tagging patterns with capability + abstraction level + domain' },
  { name: 'normalizer', label: 'Glossary Normalizer', description: 'consolidating duplicate slugs in the glossary' },
  { name: 'grouper', label: 'Grouper', description: 'deterministic grouping (no LLM)' },
  { name: 'writer', label: 'Writer', description: 'writing similarities + differences + consolidation per group' },
];

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '0.625rem 0.875rem',
  borderRadius: 6,
  background: '#fafafa',
  border: '1px solid #e6e6e6',
  marginBottom: '0.4rem',
  gap: '0.625rem',
};

const dotBase: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: '50%',
  flexShrink: 0,
};

function statusDot(status: AgentState['status']): React.CSSProperties {
  if (status === 'done') return { ...dotBase, background: '#2a8e2a' };
  if (status === 'error') return { ...dotBase, background: '#a02020' };
  if (status === 'running') return { ...dotBase, background: '#d99a00', animation: 'reuse-pulse 1s ease-in-out infinite' };
  return { ...dotBase, background: '#d0d0d0' };
}

function progressText(s: AgentState): string {
  if (s.status === 'pending') return 'pending…';
  if (s.status === 'error') return 'failed';
  const elapsed = s.elapsedSec !== undefined ? `${s.elapsedSec}s` : '…';
  if (s.total !== undefined && s.done !== undefined) {
    return `${elapsed} · ${s.done}/${s.total}`;
  }
  return elapsed;
}

function metaSummary(name: AgentName, meta?: Record<string, unknown>): string | null {
  if (!meta) return null;
  if (name === 'tagger') {
    const tagged = meta.tagged ?? 0;
    const total = meta.total ?? 0;
    const errors = meta.errors ?? 0;
    return `${tagged}/${total} tagged${errors ? `, ${errors} errors` : ''}`;
  }
  if (name === 'normalizer') {
    const a = (meta.capabilityAliases as number) ?? 0;
    const d = (meta.domainAliases as number) ?? 0;
    if (typeof meta.summary === 'string' && meta.summary.length > 0) return meta.summary;
    return `${a} capability aliases · ${d} domain aliases`;
  }
  if (name === 'grouper') {
    const c = meta.clusterCount ?? 0;
    const s = meta.standaloneCount ?? 0;
    const u = meta.untaggedCount ?? 0;
    return `${c} clusters · ${s} standalones${u ? ` · ${u} untagged` : ''}`;
  }
  if (name === 'writer') {
    const i = meta.itemCount ?? 0;
    return `${i} items written`;
  }
  return null;
}

export default function AnalysisRunTimeline({ agents, errorMsg, onStop }: Props) {
  return (
    <div style={{ marginBottom: '1rem', padding: '0.875rem', border: '1px solid #e0e0e0', borderRadius: 8, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Analysis pipeline</div>
        <button
          onClick={onStop}
          style={{ padding: '0.3rem 0.75rem', background: '#a02020', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500 }}
        >
          Stop
        </button>
      </div>
      <style>{`@keyframes reuse-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }`}</style>
      {ORDER.map(({ name, label, description }) => {
        const state = agents[name];
        const meta = metaSummary(name, state.meta);
        return (
          <div key={name} style={rowStyle}>
            <span style={statusDot(state.status)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: '0.7rem', color: '#888' }}>{description}</div>
              {state.current && (
                <div style={{ fontSize: '0.7rem', color: '#555', fontFamily: 'ui-monospace, monospace', marginTop: '0.15rem' }}>
                  {state.current}
                </div>
              )}
              {meta && state.status === 'done' && (
                <div style={{ fontSize: '0.7rem', color: '#444', marginTop: '0.15rem' }}>{meta}</div>
              )}
            </div>
            <span style={{ fontSize: '0.7rem', color: '#666', minWidth: '5rem', textAlign: 'right' }}>{progressText(state)}</span>
          </div>
        );
      })}
      {errorMsg && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#fff0f0', border: '1px solid #f5c0c0', color: '#a02020', borderRadius: 4, fontSize: '0.8rem' }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}

export function emptyAgentStates(): Record<AgentName, AgentState> {
  return {
    tagger: { status: 'pending' },
    normalizer: { status: 'pending' },
    grouper: { status: 'pending' },
    writer: { status: 'pending' },
  };
}
