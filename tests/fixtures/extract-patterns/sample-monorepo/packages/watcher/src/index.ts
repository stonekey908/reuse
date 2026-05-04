// File watcher that honors the analyzed project's own .gitignore rules.
//
// Pattern of interest: gitignore-aware-file-watcher — combines chokidar with
// the `ignore` npm package so the watcher mirrors what `git status` would
// consider tracked. Saves a re-analyze every time the user runs a build
// that touches generated files.

import chokidar, { type FSWatcher } from 'chokidar';
import ignore, { type Ignore } from 'ignore';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function loadGitignore(projectRoot: string): Ignore {
  const ig = ignore();
  const candidates = ['.gitignore', '.git/info/exclude'];
  for (const rel of candidates) {
    const p = path.join(projectRoot, rel);
    if (fs.existsSync(p)) ig.add(fs.readFileSync(p, 'utf-8'));
  }
  // Always ignore VCS internals and node_modules even if .gitignore is missing.
  ig.add(['.git', 'node_modules', 'dist', '.next']);
  return ig;
}

export function startWatcher(projectRoot: string, onChange: (file: string) => void): FSWatcher {
  const ig = loadGitignore(projectRoot);
  const watcher = chokidar.watch(projectRoot, {
    persistent: true,
    ignoreInitial: true,
    ignored: (file) => {
      const rel = path.relative(projectRoot, file);
      if (!rel) return false;
      return ig.ignores(rel);
    },
  });
  watcher.on('all', (_event, file) => onChange(file));
  return watcher;
}
