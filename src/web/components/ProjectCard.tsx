import React, { useState } from 'react';

type PatternValue = string | {
  description: string;
  capability?: string;
  abstractionLevel?: string;
  domain?: string;
  fileEvidence?: string[];
};

function patternDescription(p: PatternValue): string {
  return typeof p === 'string' ? p : p.description;
}

function patternIsTagged(p: PatternValue): boolean {
  return typeof p !== 'string' && !!(p.capability && p.abstractionLevel && p.domain);
}

interface Project {
  path: string;
  description?: string;
  tags?: string[];
  patterns?: Record<string, PatternValue>;
  git?: string;
  links?: Record<string, string>;
}

interface Props {
  name: string;
  project: Project;
  isEditing: boolean;
  onEdit: () => void;
  onUpdate: (name: string, project: Partial<Project>) => void;
  onDelete: (name: string) => void;
}

const cardStyle: React.CSSProperties = {
  border: '1px solid #e0e0e0',
  borderRadius: 8,
  padding: '1rem 1.25rem',
  background: '#fff',
};

const editCardStyle: React.CSSProperties = {
  ...cardStyle,
  border: '2px solid #111',
};

const inputStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.375rem 0.5rem',
  marginTop: '0.25rem',
  borderRadius: 4,
  border: '1px solid #ccc',
  fontSize: '0.875rem',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.5rem',
  fontSize: '0.8rem',
  color: '#555',
};

const sectionLabel: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#333',
  marginTop: '0.75rem',
  marginBottom: '0.25rem',
};

const tagStyle: React.CSSProperties = {
  background: '#f0f0f0',
  padding: '0.125rem 0.5rem',
  borderRadius: 12,
  fontSize: '0.75rem',
  color: '#444',
};

const kvRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginBottom: '0.375rem',
  alignItems: 'center',
};

const kvInputStyle: React.CSSProperties = {
  ...inputStyle,
  marginTop: 0,
};

function KeyValueEditor({
  label,
  entries,
  onChange,
  keyPlaceholder = 'key',
  valuePlaceholder = 'value',
}: {
  label: string;
  entries: Record<string, string>;
  onChange: (entries: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const pairs = Object.entries(entries);

  const updateKey = (oldKey: string, newKey: string) => {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(entries)) {
      result[k === oldKey ? newKey : k] = v;
    }
    onChange(result);
  };

  const updateValue = (key: string, value: string) => {
    onChange({ ...entries, [key]: value });
  };

  const addEntry = () => {
    onChange({ ...entries, '': '' });
  };

  const removeEntry = (key: string) => {
    const result = { ...entries };
    delete result[key];
    onChange(result);
  };

  return (
    <div>
      <div style={sectionLabel}>{label}</div>
      {pairs.map(([key, value], i) => (
        <div key={i} style={kvRowStyle}>
          <input
            value={key}
            onChange={(e) => updateKey(key, e.target.value)}
            placeholder={keyPlaceholder}
            style={{ ...kvInputStyle, flex: '0 0 30%' }}
          />
          <input
            value={value}
            onChange={(e) => updateValue(key, e.target.value)}
            placeholder={valuePlaceholder}
            style={{ ...kvInputStyle, flex: 1 }}
          />
          <button
            onClick={() => removeEntry(key)}
            style={{ padding: '0.25rem 0.5rem', background: '#fee', border: '1px solid #fcc', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', color: '#c00', flexShrink: 0 }}
          >
            x
          </button>
        </div>
      ))}
      <button
        onClick={addEntry}
        style={{ padding: '0.2rem 0.5rem', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', marginTop: '0.25rem' }}
      >
        + Add {label.toLowerCase().replace(/s$/, '')}
      </button>
    </div>
  );
}

export default function ProjectCard({ name, project, isEditing, onEdit, onUpdate, onDelete }: Props) {
  const [formPath, setFormPath] = useState(project.path);
  const [description, setDescription] = useState(project.description || '');
  const [tags, setTags] = useState((project.tags || []).join(', '));
  const [git, setGit] = useState(project.git || '');
  // Editor surfaces only the description for editing. Structured tags
  // (capability/abstractionLevel/domain) are managed by the Tagger agent,
  // not the human editor.
  const [patterns, setPatterns] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(project.patterns ?? {})) {
      out[k] = patternDescription(v);
    }
    return out;
  });
  const [links, setLinks] = useState<Record<string, string>>({ ...project.links });

  if (isEditing) {
    return (
      <div style={editCardStyle}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>{name}</h3>

        <label style={labelStyle}>
          Path
          <input value={formPath} onChange={(e) => setFormPath(e.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Tags (comma-separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Git URL
          <input value={git} onChange={(e) => setGit(e.target.value)} placeholder="https://github.com/..." style={inputStyle} />
        </label>

        <KeyValueEditor
          label="Patterns"
          entries={patterns}
          onChange={setPatterns}
          keyPlaceholder="pattern name"
          valuePlaceholder="description"
        />

        <KeyValueEditor
          label="Links"
          entries={links}
          onChange={setLinks}
          keyPlaceholder="service (e.g. linear, notion)"
          valuePlaceholder="URL or identifier"
        />

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          <button
            onClick={() => {
              // Filter out entries with empty keys
              const cleanPatterns: Record<string, string> = {};
              for (const [k, v] of Object.entries(patterns)) {
                if (k.trim()) cleanPatterns[k.trim()] = v;
              }
              const cleanLinks: Record<string, string> = {};
              for (const [k, v] of Object.entries(links)) {
                if (k.trim()) cleanLinks[k.trim()] = v;
              }
              onUpdate(name, {
                path: formPath,
                description,
                tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
                git: git || undefined,
                patterns: cleanPatterns,
                links: cleanLinks,
              });
            }}
            style={{ padding: '0.375rem 0.75rem', background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Save
          </button>
          <button
            onClick={onEdit}
            style={{ padding: '0.375rem 0.75rem', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{name}</h3>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button onClick={onEdit} style={{ padding: '0.2rem 0.5rem', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem' }}>
            Edit
          </button>
          <button onClick={() => onDelete(name)} style={{ padding: '0.2rem 0.5rem', background: '#fee', border: '1px solid #fcc', borderRadius: 4, cursor: 'pointer', fontSize: '0.7rem', color: '#c00' }}>
            Remove
          </button>
        </div>
      </div>

      {project.description && <p style={{ margin: '0.375rem 0 0', color: '#555', fontSize: '0.875rem' }}>{project.description}</p>}
      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#999', fontFamily: 'ui-monospace, monospace' }}>{project.path}</p>

      {project.git && (
        <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem' }}>
          <a href={project.git} target="_blank" rel="noreferrer" style={{ color: '#06c', textDecoration: 'none' }}>{project.git}</a>
        </p>
      )}

      {project.tags && project.tags.length > 0 && (
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          {project.tags.map((tag) => (
            <span key={tag} style={tagStyle}>{tag}</span>
          ))}
        </div>
      )}

      {project.patterns && Object.keys(project.patterns).length > 0 && (
        <div style={{ marginTop: '0.5rem', borderTop: '1px solid #f0f0f0', paddingTop: '0.5rem' }}>
          {Object.entries(project.patterns).map(([key, value]) => (
            <div key={key} style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
              <strong style={{ color: '#333' }}>{key}:</strong>{' '}
              {patternIsTagged(value) && typeof value !== 'string' && (
                <span style={{ fontSize: '0.65rem', background: '#eef', color: '#446', padding: '0.05rem 0.35rem', borderRadius: 3, marginRight: '0.25rem' }}>
                  {value.domain} · {value.abstractionLevel}
                </span>
              )}
              <span style={{ color: '#666' }}>{patternDescription(value)}</span>
            </div>
          ))}
        </div>
      )}

      {project.links && Object.keys(project.links).length > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          {Object.entries(project.links).map(([key, url]) => (
            <a key={key} href={url} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#06c', textDecoration: 'none' }}>
              {key}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
