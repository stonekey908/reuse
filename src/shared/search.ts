import type { Registry, Project } from './types.js';

export interface SearchResult {
  name: string;
  project: Project;
  matchedOn: string[];
}

export function searchProjects(registry: Registry, query: string): SearchResult[] {
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const [name, project] of Object.entries(registry.projects)) {
    const matchedOn: string[] = [];

    if (name.toLowerCase().includes(q)) {
      matchedOn.push('name');
    }

    if (project.description?.toLowerCase().includes(q)) {
      matchedOn.push('description');
    }

    if (project.tags?.some((tag) => tag.toLowerCase().includes(q))) {
      matchedOn.push('tags');
    }

    if (project.patterns) {
      for (const [patternName, pattern] of Object.entries(project.patterns)) {
        if (patternName.toLowerCase().includes(q) || pattern.description.toLowerCase().includes(q)) {
          matchedOn.push(`pattern:${patternName}`);
        }
      }
    }

    if (matchedOn.length > 0) {
      results.push({ name, project, matchedOn });
    }
  }

  return results;
}
