import React, { useState } from 'react';

interface Project {
  path: string;
  description?: string;
  tags?: string[];
  patterns?: Record<string, string>;
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

const tagStyle: React.CSSProperties = {
  background: '#f0f0f0',
  padding: '0.125rem 0.5rem',
  borderRadius: 12,
  fontSize: '0.75rem',
  color: '#444',
};

export default function ProjectCard({ name, project, isEditing, onEdit, onUpdate, onDelete }: Props) {
  const [description, setDescription] = useState(project.description || '');
  const [tags, setTags] = useState((project.tags || []).join(', '));

  if (isEditing) {
    return (
      <div style={editCardStyle}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>{name}</h3>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', color: '#555' }}>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
        </label>
        <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.8rem', color: '#555' }}>
          Tags (comma-separated)
          <input value={tags} onChange={(e) => setTags(e.target.value)} style={inputStyle} />
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => onUpdate(name, { description, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) })}
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
          {Object.entries(project.patterns).map(([key, desc]) => (
            <div key={key} style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
              <strong style={{ color: '#333' }}>{key}:</strong> <span style={{ color: '#666' }}>{desc}</span>
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
