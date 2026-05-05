import { loadRegistry, saveRegistry } from '../../shared/registry.js';
import {
  loadGlossary,
  recordCapabilityProposal,
  recordDomainProposal,
  saveGlossary,
} from '../../shared/glossary.js';
import { getProvider, type ProviderId } from '../providers/index.js';
import {
  buildTaggerPrompt,
  extractFileEvidence,
  parseTagResult,
  type TagResult,
} from './tagger.js';

export interface TaggerProgress {
  total: number;
  tagged: number;
  current?: { project: string; patternKey: string };
  errors: Array<{ project: string; patternKey: string; error: string }>;
}

export interface BackfillOptions {
  provider: ProviderId;
  model?: string;
  /** Concurrency cap. Default 4. */
  concurrency?: number;
  /** Re-tag every pattern even if already tagged. Default false. */
  force?: boolean;
  /** Cancellation. Aborted patterns are recorded as errors. */
  signal?: AbortSignal;
  /** Fired after each pattern finishes (success or failure). */
  onProgress?: (p: TaggerProgress) => void;
}

export interface BackfillResult {
  total: number;
  tagged: number;
  alreadyTagged: number;
  errors: Array<{ project: string; patternKey: string; error: string }>;
  newCanonicalDomains: string[];
  newCanonicalCapabilities: string[];
}

/**
 * Walks every pattern in the registry, calls the Tagger agent (in parallel up
 * to `concurrency`), persists tags + file evidence, and accumulates new domain
 * / capability proposals into the glossary.
 *
 * The actual normalization of proposals (which become canonical, which alias)
 * is the Glossary Normalizer agent's job (Wave 3) — this function just records
 * raw proposals so they're visible in the glossary file for debugging.
 */
export async function backfillTags(opts: BackfillOptions): Promise<BackfillResult> {
  const provider = await getProvider(opts.provider);
  const concurrency = opts.concurrency ?? 4;
  const force = opts.force ?? false;

  const registry = loadRegistry();
  let glossary = loadGlossary();

  // Build the work list.
  type WorkItem = {
    project: string;
    patternKey: string;
    description: string;
    siblingKeys: string[];
  };
  const work: WorkItem[] = [];
  let alreadyTagged = 0;
  for (const [project, p] of Object.entries(registry.projects)) {
    const keys = Object.keys(p.patterns ?? {});
    for (const patternKey of keys) {
      const pattern = p.patterns![patternKey];
      if (!force && pattern.capability && pattern.abstractionLevel && pattern.domain) {
        alreadyTagged += 1;
        continue;
      }
      work.push({
        project,
        patternKey,
        description: pattern.description,
        siblingKeys: keys.filter((k) => k !== patternKey),
      });
    }
  }

  const progress: TaggerProgress = {
    total: work.length,
    tagged: 0,
    errors: [],
  };
  opts.onProgress?.(progress);

  if (work.length === 0) {
    return {
      total: 0,
      tagged: 0,
      alreadyTagged,
      errors: [],
      newCanonicalDomains: [],
      newCanonicalCapabilities: [],
    };
  }

  // Bounded parallel runner — manual semaphore over the work queue.
  let cursor = 0;
  const newDomains = new Set<string>();
  const newCapabilities = new Set<string>();

  async function worker() {
    while (cursor < work.length) {
      if (opts.signal?.aborted) return;
      const idx = cursor++;
      const item = work[idx];
      progress.current = { project: item.project, patternKey: item.patternKey };
      opts.onProgress?.(progress);
      try {
        const prompt = buildTaggerPrompt(item, glossary);
        const raw = await provider.complete(prompt, { model: opts.model, signal: opts.signal });
        const tag: TagResult = parseTagResult(raw);

        // Apply the tags to the registry.
        const fileEvidence = extractFileEvidence(item.description);
        const target = registry.projects[item.project].patterns![item.patternKey];
        target.capability = tag.capability;
        target.abstractionLevel = tag.abstractionLevel;
        target.domain = tag.domain;
        if (fileEvidence.length > 0 && (!target.fileEvidence || target.fileEvidence.length === 0)) {
          target.fileEvidence = fileEvidence;
        }

        // Track proposed new slugs for the glossary (Normalizer will canonicalize later).
        if (tag.proposedNewDomain) {
          newDomains.add(tag.proposedNewDomain);
          glossary = recordDomainProposal(glossary, tag.proposedNewDomain);
        }
        if (tag.proposedNewCapability) {
          newCapabilities.add(tag.proposedNewCapability);
          glossary = recordCapabilityProposal(glossary, tag.proposedNewCapability);
        } else if (!glossary.capabilities.includes(tag.capability)) {
          // Even non-proposed capabilities should join the canonical list for future runs.
          glossary = recordCapabilityProposal(glossary, tag.capability);
        }

        progress.tagged += 1;
      } catch (err) {
        progress.errors.push({
          project: item.project,
          patternKey: item.patternKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      opts.onProgress?.(progress);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, work.length) }, () => worker()));

  // Persist registry + glossary changes (best-effort on partial completion).
  saveRegistry(registry);
  saveGlossary(glossary);

  return {
    total: work.length,
    tagged: progress.tagged,
    alreadyTagged,
    errors: progress.errors,
    newCanonicalDomains: Array.from(newDomains),
    newCanonicalCapabilities: Array.from(newCapabilities),
  };
}
