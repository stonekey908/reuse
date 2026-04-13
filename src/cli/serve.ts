import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRegistry, saveRegistry } from '../shared/registry.js';
import { searchProjects } from '../shared/search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startServer(port: number) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // API routes
  app.get('/api/projects', (_req, res) => {
    const registry = loadRegistry();
    res.json(registry);
  });

  app.post('/api/projects', (req, res) => {
    const registry = loadRegistry();
    const { name, ...project } = req.body;

    if (!name || !project.path) {
      res.status(400).json({ error: 'name and path are required' });
      return;
    }

    if (registry.projects[name]) {
      res.status(409).json({ error: `Project "${name}" already exists` });
      return;
    }

    registry.projects[name] = project;
    saveRegistry(registry);
    res.status(201).json({ name, ...project });
  });

  app.put('/api/projects/:name', (req, res) => {
    const registry = loadRegistry();
    const { name } = req.params;

    if (!registry.projects[name]) {
      res.status(404).json({ error: `Project "${name}" not found` });
      return;
    }

    registry.projects[name] = { ...registry.projects[name], ...req.body };
    saveRegistry(registry);
    res.json({ name, ...registry.projects[name] });
  });

  app.delete('/api/projects/:name', (req, res) => {
    const registry = loadRegistry();
    const { name } = req.params;

    if (!registry.projects[name]) {
      res.status(404).json({ error: `Project "${name}" not found` });
      return;
    }

    delete registry.projects[name];
    saveRegistry(registry);
    res.status(204).send();
  });

  app.get('/api/search', (req, res) => {
    const query = req.query.q as string;
    if (!query) {
      res.status(400).json({ error: 'query parameter "q" is required' });
      return;
    }

    const registry = loadRegistry();
    const results = searchProjects(registry, query);
    res.json(results);
  });

  // Serve static frontend (built Vite output)
  const staticDir = path.resolve(__dirname, '../../dist-web');
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });

  app.listen(port, () => {
    console.log(`\n  Reuse registry UI running at http://localhost:${port}\n`);
  });
}
