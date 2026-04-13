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
  onSubmit: (name: string, project: Project) => void;
  onCancel: () => void;
}

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
  marginBottom: '0.75rem',
  fontSize: '0.8rem',
  color: '#555',
};

export default function ProjectForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [git, setGit] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(name, {
      path,
      description,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      patterns: {},
      git: git || undefined,
      links: {},
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ border: '2px solid #111', borderRadius: 8, padding: '1.25rem', marginBottom: '1.5rem', background: '#fff' }}>
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Register Project</h3>

      <label style={labelStyle}>
        Name *
        <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="my-app" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Path *
        <input value={path} onChange={(e) => setPath(e.target.value)} required placeholder="/Users/you/projects/my-app" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this project do?" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Tags (comma-separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="react, typescript, auth" style={inputStyle} />
      </label>

      <label style={labelStyle}>
        Git URL
        <input value={git} onChange={(e) => setGit(e.target.value)} placeholder="https://github.com/you/my-app" style={inputStyle} />
      </label>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 }}>
          Register
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '0.5rem 1rem', background: '#eee', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: '0.875rem' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
