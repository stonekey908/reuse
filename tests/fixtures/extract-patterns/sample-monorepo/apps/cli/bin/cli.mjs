#!/usr/bin/env node
// Plain ESM CLI binary that boots the local web app and opens a browser.
// Pattern of interest: CLI distribution that launches a local web UI on demand,
// using `open` to surface the browser without the user typing a URL.

import { spawn } from 'node:child_process';
import open from 'open';
import { startWatcher } from '@sample/watcher';

const projectPath = process.argv[2] ?? process.cwd();
console.log(`[sample-cli] booting web on ${projectPath}…`);

const server = spawn('node', ['../web/.next/standalone/server.js'], { stdio: 'inherit' });

startWatcher(projectPath, () => {
  console.log('[sample-cli] file change detected — re-analysing.');
});

await new Promise((r) => setTimeout(r, 1500));
await open('http://localhost:3000');

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
