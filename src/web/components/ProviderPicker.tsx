import React from 'react';

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'ollama';
export type RunMode = 'reset' | 'append';

export interface ProviderModel {
  id: string;
  label: string;
  contextWindow: number;
  notes?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  envKey: string;
  models: ProviderModel[];
  available: boolean;
}

interface Props {
  providers: ProviderInfo[];
  selectedProvider: ProviderId | null;
  selectedModel: string | null;
  onProviderChange: (provider: ProviderId) => void;
  onModelChange: (model: string) => void;
  mode: RunMode;
  onModeChange: (mode: RunMode) => void;
  hasExistingAnalysis: boolean;
}

const selectStyle: React.CSSProperties = {
  padding: '0.4rem 0.625rem',
  borderRadius: 6,
  border: '1px solid #ccc',
  fontSize: '0.85rem',
  background: '#fff',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 600,
  color: '#888',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  marginRight: '0.5rem',
};

const radioStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.3rem',
  fontSize: '0.8rem',
  color: '#444',
  cursor: 'pointer',
};

export default function ProviderPicker({
  providers,
  selectedProvider,
  selectedModel,
  onProviderChange,
  onModelChange,
  mode,
  onModeChange,
  hasExistingAnalysis,
}: Props) {
  const provider = providers.find((p) => p.id === selectedProvider) ?? null;
  const model = provider?.models.find((m) => m.id === selectedModel) ?? null;

  return (
    <div
      style={{
        marginBottom: '0.875rem',
        padding: '0.75rem 0.875rem',
        background: '#fafafa',
        border: '1px solid #e6e6e6',
        borderRadius: 8,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.625rem',
        alignItems: 'center',
      }}
    >
      <span style={labelStyle}>Provider</span>
      <select
        value={selectedProvider ?? ''}
        onChange={(e) => onProviderChange(e.target.value as ProviderId)}
        style={selectStyle}
      >
        {providers.map((p) => (
          <option key={p.id} value={p.id} disabled={!p.available}>
            {p.label}{p.available ? '' : ` (set ${p.envKey})`}
          </option>
        ))}
      </select>

      <span style={labelStyle}>Model</span>
      <select
        value={selectedModel ?? ''}
        onChange={(e) => onModelChange(e.target.value)}
        style={selectStyle}
        disabled={!provider || provider.models.length === 0}
      >
        {provider?.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      {hasExistingAnalysis && (
        <span style={{ display: 'inline-flex', gap: '0.625rem', alignItems: 'center', marginLeft: '0.5rem', paddingLeft: '0.625rem', borderLeft: '1px solid #ddd' }}>
          <span style={labelStyle}>Re-run mode</span>
          <label style={radioStyle}>
            <input
              type="radio"
              name="run-mode"
              checked={mode === 'reset'}
              onChange={() => onModeChange('reset')}
            />
            Reset
          </label>
          <label style={radioStyle}>
            <input
              type="radio"
              name="run-mode"
              checked={mode === 'append'}
              onChange={() => onModeChange('append')}
            />
            Append
          </label>
        </span>
      )}

      {model?.notes && (
        <span style={{ flexBasis: '100%', fontSize: '0.75rem', color: '#888', marginTop: '0.25rem' }}>
          {model.notes} · {model.contextWindow.toLocaleString()} token context.
        </span>
      )}
    </div>
  );
}
