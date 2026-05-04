import React, { useState, useEffect } from 'react';
import ProjectList from './components/ProjectList';
import ProjectForm from './components/ProjectForm';
import AnalysisTab from './components/AnalysisTab';

interface Project {
  path: string;
  description?: string;
  tags?: string[];
  patterns?: Record<string, string>;
  git?: string;
  links?: Record<string, string>;
}

interface Registry {
  projects: Record<string, Project>;
}

type TabKey = 'projects' | 'analysis';

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.4rem 0.875rem',
  background: active ? '#111' : 'transparent',
  color: active ? '#fff' : '#666',
  border: active ? '1px solid #111' : '1px solid #ddd',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: active ? 600 : 500,
});

export default function App() {
  const [registry, setRegistry] = useState<Registry>({ projects: {} });
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('projects');
  const [highlightedProject, setHighlightedProject] = useState<string | null>(null);

  const handleJumpToProject = (projectName: string) => {
    setTab('projects');
    setHighlightedProject(projectName);
  };

  const fetchRegistry = async () => {
    const res = await fetch('/api/projects');
    const data = await res.json();
    setRegistry(data);
  };

  useEffect(() => {
    fetchRegistry();
  }, []);

  const handleAdd = async (name: string, project: Project) => {
    await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, ...project }),
    });
    setShowForm(false);
    fetchRegistry();
  };

  const handleUpdate = async (name: string, project: Partial<Project>) => {
    await fetch(`/api/projects/${name}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    setEditingProject(null);
    fetchRegistry();
  };

  const handleDelete = async (name: string) => {
    await fetch(`/api/projects/${name}`, { method: 'DELETE' });
    fetchRegistry();
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Reuse</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#888' }}>Codebase Registry</p>
        </div>
        {tab === 'projects' && (
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              padding: '0.5rem 1rem',
              background: showForm ? '#666' : '#111',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            {showForm ? 'Cancel' : '+ Add Project'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button onClick={() => setTab('projects')} style={tabButtonStyle(tab === 'projects')}>
          Projects
        </button>
        <button onClick={() => setTab('analysis')} style={tabButtonStyle(tab === 'analysis')}>
          Analysis
        </button>
      </div>

      {tab === 'projects' && (
        <>
          {showForm && (
            <ProjectForm
              onSubmit={handleAdd}
              onCancel={() => setShowForm(false)}
            />
          )}

          <ProjectList
            projects={registry.projects}
            editingProject={editingProject}
            highlightedProject={highlightedProject}
            onClearHighlight={() => setHighlightedProject(null)}
            onEdit={setEditingProject}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        </>
      )}

      {tab === 'analysis' && <AnalysisTab onJumpToProject={handleJumpToProject} />}
    </div>
  );
}
