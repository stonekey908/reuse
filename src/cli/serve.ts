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
import { runPipeline, type PipelineEvent } from '../analysis/pipeline.js';

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

  // Track the in-flight analysis run so the user can cancel it from the UI.
  let inFlight: { abort: AbortController; startedAt: number } | null = null;

  app.get('/api/analysis/pipeline', async (req, res) => {
    if (inFlight) {
      res.status(409).json({ error: 'A run is already in flight.', code: 'RUN_IN_FLIGHT' });
      return;
    }
    const taggerProvider = (req.query.taggerProvider as ProviderId) || 'anthropic';
    const taggerModel = (req.query.taggerModel as string) || 'claude-sonnet-4-6';
    const writerProvider = (req.query.writerProvider as ProviderId) || taggerProvider;
    const writerModel = (req.query.writerModel as string) || 'claude-sonnet-4-6';
    const mode = req.query.mode === 'append' ? 'append' : 'reset';
    const forceTag = req.query.forceTag === '1';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: PipelineEvent) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const started = Date.now();
    const abort = new AbortController();
    inFlight = { abort, startedAt: started };
    const onClientClose = () => {
      if (!abort.signal.aborted) {
        abort.abort();
        console.log(`[pipeline] client disconnected — aborted`);
      }
    };
    req.on('close', onClientClose);

    try {
      const registry = loadRegistry();
      console.log(`[pipeline] starting tagger=${taggerProvider}/${taggerModel} writer=${writerProvider}/${writerModel} mode=${mode}`);
      const items = await runPipeline({
        registry,
        taggerProvider,
        taggerModel,
        writerProvider,
        writerModel,
        forceTag,
        signal: abort.signal,
        onEvent: send,
      });
      // Persist
      const fresh = loadRegistry(); // reload because tagger/normalizer wrote
      const updated = writeAnalysis(fresh, items, mode);
      const staleness = getStaleness(updated);
      const elapsedSec = Math.round((Date.now() - started) / 1000);
      console.log(`[pipeline] done in ${elapsedSec}s — ${items.length} items`);
      send({ type: 'agent-done', agent: 'writer', elapsedSec, meta: { itemCount: items.length, finalised: true } });
      res.write(`event: persisted\n`);
      res.write(`data: ${JSON.stringify({ analysis: updated.analysis, stale: staleness.stale, changedProjects: staleness.changedProjects })}\n\n`);
      res.end();
    } catch (err) {
      const isAbort = abort.signal.aborted ||
        (err instanceof Error && (err.name === 'AbortError' || /aborted|cancelled|canceled/i.test(err.message)));
      const elapsed = Math.round((Date.now() - started) / 1000);
      if (isAbort) {
        console.log(`[pipeline] cancelled after ${elapsed}s`);
        send({ type: 'error', error: 'Cancelled by user.' });
      } else {
        console.log(`[pipeline] failed after ${elapsed}s — ${err instanceof Error ? err.message : String(err)}`);
        send({ type: 'error', error: err instanceof Error ? err.message : String(err) });
      }
      res.end();
    } finally {
      req.off('close', onClientClose);
      inFlight = null;
    }
  });

  app.post('/api/analysis/cancel', (_req, res) => {
    if (!inFlight) {
      res.status(404).json({ error: 'No analysis run in flight.' });
      return;
    }
    const elapsed = Math.round((Date.now() - inFlight.startedAt) / 1000);
    inFlight.abort.abort();
    console.log(`[analysis] cancel requested after ${elapsed}s`);
    res.json({ ok: true, elapsedSec: elapsed });
  });

  app.get('/api/analysis/status', (_req, res) => {
    res.json({
      running: !!inFlight,
      elapsedSec: inFlight ? Math.round((Date.now() - inFlight.startedAt) / 1000) : 0,
    });
  });

  app.post('/api/analysis/run', async (req, res) => {
    if (inFlight) {
      res.status(409).json({ error: 'An analysis run is already in flight. Cancel it first or wait for it to finish.', code: 'RUN_IN_FLIGHT' });
      return;
    }
    const started = Date.now();
    const abort = new AbortController();
    inFlight = { abort, startedAt: started };
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
        chosenRunner = await runnerFromProvider(body.provider, body.model, abort.signal);
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
      const elapsed = Math.round((Date.now() - started) / 1000);
      const isAbort = abort.signal.aborted ||
        (err instanceof Error && (err.name === 'AbortError' || /aborted|cancelled|canceled/i.test(err.message)));
      if (isAbort) {
        console.log(`[analysis] cancelled after ${elapsed}s`);
        res.status(499).json({ error: 'Analysis cancelled by user.', code: 'CANCELLED', elapsedSec: elapsed });
        return;
      }
      console.log(`[analysis] failed after ${elapsed}s — ${err instanceof Error ? err.message : String(err)}`);
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
    } finally {
      inFlight = null;
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
