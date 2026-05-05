#!/usr/bin/env node
// Capture web-UI screenshots for the README, masking real project names
// in the analysis section so we don't leak the user's portfolio.
//
// Strategy: render the live web UI against the real registry, then use
// Puppeteer to walk the DOM and substitute every occurrence of a real
// project name with a generic alias (project-a, project-b, …) BEFORE
// the screenshot is taken. The on-disk registry is never modified.
//
// Run: node scripts/capture-screenshots.mjs
//   - Boots `reuse serve` on port 3211
//   - Captures: analysis tab (full page) + projects tab + register modal
//   - Writes PNGs to docs/screenshots/
//
// Requires Chrome installed (uses the system Chrome via puppeteer-core).
//
// First run, install puppeteer-core (kept out of devDependencies because of
// its ~50MB install footprint):
//   npm install --no-save puppeteer-core

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const PORT = 3211;
const BASE = `http://localhost:${PORT}`;
const OUT_DIR = path.resolve('docs/screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const REGISTRY_PATH = path.join(process.env.HOME, '.reuse/registry.json');
const reg = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const realNames = Object.keys(reg.projects).sort();
const ALIAS_MAP = Object.fromEntries(
  realNames.map((n, i) => [n, `project-${String.fromCharCode(97 + i)}`]),
);

// Brand names / capitalisations / former names that show up in descriptions
// but are not the registry key itself. Mapped to a generic placeholder so
// the screenshot doesn't reveal the app brand.
const EXTRA_MASK = {
  VinoVeritas: 'wine-app',
  Jenkins: 'project-c',
  WikiLM: 'wiki-app',
  TrendLens: 'project-h',
  Trendlens: 'project-h',
  SecondBrain: 'project-g',
  Lookout: 'project-d',
  CodeView: 'project-b',
  Codeview: 'project-b',
  CarGuide: 'project-a',
  Carguide: 'project-a',
  RetroModern: 'project-e',
  SchoolSync: 'project-f',
  Schoolsync: 'project-f',
  'wine-analyzer': 'wine-app',
  'wineanalyzer': 'wine-app',
  'wineAnalyzer': 'wine-app',
  'WineAnalyzer': 'wine-app',
  'WineAnalyzerApp': 'wine-app',
};
const FULL_MAP = { ...ALIAS_MAP, ...EXTRA_MASK };

console.log('Aliases applied to screenshots:');
for (const [real, alias] of Object.entries(ALIAS_MAP)) console.log(`  ${real.padEnd(20)} → ${alias}`);

async function waitForServer(url, ms = 30_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status < 500) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not come up at ${url}`);
}

async function main() {
  // Boot the server. We use `node dist/cli/index.js serve` to avoid
  // depending on `npm link` having been run in this env.
  const server = spawn('node', ['dist/cli/index.js', 'serve', '-p', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => process.stderr.write(`[server] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));

  try {
    await waitForServer(BASE + '/api/projects');
    console.log('Server up at', BASE);

    const browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
    });
    const page = await browser.newPage();

    // Inject a DOM masking function that walks every text node and replaces
    // real project names with their alias.
    const maskScript = (aliases) => `
      (function () {
        const map = ${JSON.stringify(aliases)};
        function maskNode(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            let text = node.nodeValue;
            for (const [real, alias] of Object.entries(map)) {
              text = text.split(real).join(alias);
            }
            if (text !== node.nodeValue) node.nodeValue = text;
            return;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Mask href/title/aria-label too
            for (const attr of ['title', 'aria-label', 'data-project']) {
              const v = node.getAttribute && node.getAttribute(attr);
              if (v) {
                let masked = v;
                for (const [real, alias] of Object.entries(map)) masked = masked.split(real).join(alias);
                if (masked !== v) node.setAttribute(attr, masked);
              }
            }
            for (const child of node.childNodes) maskNode(child);
          }
        }
        maskNode(document.body);
        // Re-mask after each React render (mutation observer)
        if (window.__reuseMaskObserver) window.__reuseMaskObserver.disconnect();
        const obs = new MutationObserver((muts) => {
          for (const m of muts) for (const n of m.addedNodes) maskNode(n);
        });
        obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        window.__reuseMaskObserver = obs;
      })();
    `;

    async function capture(targetPath, fileName, opts = {}) {
      const { scrollToAnalysisTab = false, collapseAllThemes = false } = opts;
      await page.goto(BASE + targetPath, { waitUntil: 'networkidle0' });
      // Give React time to paint and any analysis tab to load.
      await new Promise((r) => setTimeout(r, 800));
      if (scrollToAnalysisTab) {
        await page.evaluate(() => {
          const tabs = Array.from(document.querySelectorAll('button, a'));
          const analysisTab = tabs.find((el) => el.textContent && /analysis/i.test(el.textContent.trim()));
          if (analysisTab) analysisTab.click();
        });
        await new Promise((r) => setTimeout(r, 600));
      }
      if (collapseAllThemes) {
        await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('button'));
          const collapse = btns.find((b) => b.textContent && /collapse all/i.test(b.textContent.trim()));
          if (collapse) collapse.click();
        });
        await new Promise((r) => setTimeout(r, 400));
      }
      await page.evaluate(maskScript(FULL_MAP));
      await new Promise((r) => setTimeout(r, 200));
      const out = path.join(OUT_DIR, fileName);
      await page.screenshot({ path: out, fullPage: true });
      console.log('wrote', out);
    }

    await capture('/', '10-projects-tab.png');
    await capture('/', '11-analysis-tab.png', { scrollToAnalysisTab: true });
    await capture('/', '12-analysis-themes-collapsed.png', { scrollToAnalysisTab: true, collapseAllThemes: true });

    await browser.close();
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 200));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
