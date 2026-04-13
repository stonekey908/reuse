import React from 'react';
import ProjectCard from './ProjectCard';

interface Project {
  path: string;
  description?: string;
  tags?: string[];
  patterns?: Record<string, string>;
  git?: string;
  links?: Record<string, string>;
}

interface Props {
  projects: Record<string, Project>;
  editingProject: string | null;
  onEdit: (name: string | null) => void;
  onUpdate: (name: string, project: Partial<Project>) => void;
  onDelete: (name: string) => void;
}

export default function ProjectList({ projects, editingProject, onEdit, onUpdate, onDelete }: Props) {
  const entries = Object.entries(projects);

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#888' }}>
        <p style={{ fontSize: '1.1rem' }}>No projects registered yet.</p>
        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Click "+ Add Project" to register your first codebase.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {entries.map(([name, project]) => (
        <ProjectCard
          key={name}
          name={name}
          project={project}
          isEditing={editingProject === name}
          onEdit={() => onEdit(editingProject === name ? null : name)}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
