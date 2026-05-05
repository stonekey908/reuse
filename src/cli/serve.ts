import express, { type Express } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadRegistry, saveRegistry } from '../shared/registry.js';
import { searchProjects } from '../shared/search.js';
import { getStaleness, writeAnalysis } from '../analysis/cache.js';
import {
  ClaudeNotFoundError,
  JsonParseError,
  defaultClaudeRunner,
  runAnalysis,
  runnerFromProvider,
  type ClaudeRunner,
} from '../analysis/runner.js';
import {
  listProviders,
  ProviderNotConfiguredError,
  ContextWindowExceededError,
  type ProviderId,
} from '../analysis/providers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type CreateAppOptions = {
  runner?: ClaudeRunner;
  serveStatic?: boolean;
};

export function createApp(options: CreateAppOptions = {}): Express {
  const { runner = defaultClaudeRunner, serveStatic = true } = options;
  const app = express();
  app.use(cors());
  app.use(express.json());

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

  app.get('/api/analysis', (_req, res) => {
    const registry = loadRegistry();
    const staleness = getStaleness(registry);
    res.json({
      analysis: registry.analysis ?? null,
      stale: staleness.stale,
      changedProjects: staleness.changedProjects,
    });
  });

  app.get('/api/providers', async (_req, res) => {
    try {
      const infos = await listProviders();
      res.json({ providers: infos });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/analysis/run', async (req, res) => {
    const started = Date.now();
    const body = (req.body ?? {}) as {
      provider?: ProviderId;
      model?: string;
      mode?: 'reset' | 'append';
    };
    const mode = body.mode === 'append' ? 'append' : 'reset';
    try {
      const registry = loadRegistry();
      const patternCount = Object.values(registry.projects).reduce(
        (sum, p) => sum + Object.keys(p.patterns ?? {}).length,
        0,
      );

      // Pick runner: explicit provider/model from request, else fall back to default (Anthropic).
      let chosenRunner: ClaudeRunner = runner;
      let providerLabel = 'default';
      if (body.provider) {
        chosenRunner = await runnerFromProvider(body.provider, body.model);
        providerLabel = `${body.provider}${body.model ? `/${body.model}` : ''}`;
      }

      console.log(`[analysis] starting run — ${patternCount} patterns across ${Object.keys(registry.projects).length} projects · ${providerLabel} · mode=${mode}`);
      const clusters = await runAnalysis({
        registry,
        runner: chosenRunner,
        tag: body.provider ? { provider: body.provider, model: body.model || 'default' } : undefined,
      });
      const updated = writeAnalysis(registry, clusters, mode);
      const staleness = getStaleness(updated);
      console.log(`[analysis] done in ${Math.round((Date.now() - started) / 1000)}s — ${clusters.length} new items (${updated.analysis!.clusters.length} total in cache)`);
      res.json({
        analysis: updated.analysis,
        stale: staleness.stale,
        changedProjects: staleness.changedProjects,
      });
    } catch (err) {
      console.log(`[analysis] failed after ${Math.round((Date.now() - started) / 1000)}s — ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof ProviderNotConfiguredError) {
        res.status(400).json({
          error: err.message,
          code: 'PROVIDER_NOT_CONFIGURED',
          provider: err.provider,
          envKey: err.envKey,
        });
        return;
      }
      if (err instanceof ContextWindowExceededError) {
        res.status(400).json({ error: err.message, code: 'CONTEXT_WINDOW_EXCEEDED' });
        return;
      }
      if (err instanceof ClaudeNotFoundError) {
        res.status(500).json({
          error: err.message,
          code: 'CLAUDE_NOT_FOUND',
          hint: 'Install Claude Code CLI from https://claude.com/claude-code and ensure `claude` is on your PATH.',
        });
        return;
      }
      if (err instanceof JsonParseError) {
        res.status(502).json({
          error: err.message,
          code: 'JSON_PARSE_FAILED',
          rawOutput: err.rawOutput,
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message, code: 'ANALYSIS_FAILED' });
    }
  });

  if (serveStatic) {
    const staticDir = path.resolve(__dirname, '../../dist-web');
    app.use(express.static(staticDir));
    app.get('{*path}', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  return app;
}

export function startServer(port: number) {
  const app = createApp();
  app.listen(port, () => {
    console.log(`\n  Reuse registry UI running at http://localhost:${port}\n`);
  });
}
