import React, { useEffect, useRef } from 'react';
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
  highlightedProject?: string | null;
  onClearHighlight?: () => void;
  onEdit: (name: string | null) => void;
  onUpdate: (name: string, project: Partial<Project>) => void;
  onDelete: (name: string) => void;
}

export default function ProjectList({
  projects,
  editingProject,
  highlightedProject,
  onClearHighlight,
  onEdit,
  onUpdate,
  onDelete,
}: Props) {
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!highlightedProject) return;
    const el = refs.current[highlightedProject];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = setTimeout(() => {
      onClearHighlight?.();
    }, 2400);
    return () => clearTimeout(timer);
  }, [highlightedProject, onClearHighlight]);

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
      {entries.map(([name, project]) => {
        const isHighlighted = highlightedProject === name;
        return (
          <div
            key={name}
            ref={(el) => { refs.current[name] = el; }}
            style={{
              borderRadius: 8,
              transition: 'box-shadow 240ms ease, outline 240ms ease',
              outline: isHighlighted ? '2px solid #111' : '2px solid transparent',
              outlineOffset: 2,
            }}
          >
            <ProjectCard
              name={name}
              project={project}
              isEditing={editingProject === name}
              onEdit={() => onEdit(editingProject === name ? null : name)}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          </div>
        );
      })}
    </div>
  );
}
