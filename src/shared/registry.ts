import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RegistrySchema, type Registry } from './types.js';

export function getRegistryDir(): string {
  return process.env.REUSE_HOME || path.join(os.homedir(), '.reuse');
}

export function getRegistryPath(): string {
  return path.join(getRegistryDir(), 'registry.json');
}

export function loadRegistry(): Registry {
  const filePath = getRegistryPath();
  if (!fs.existsSync(filePath)) {
    return { projects: {} };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const result = RegistrySchema.safeParse(raw);
  if (result.success) return result.data;

  // If the raw registry has an `analysis` field that fails validation, retry
  // without it and log a clear warning. This protects the user's projects from
  // a stale `dist/` running an older schema, instead of throwing on every read.
  if (raw && typeof raw === 'object' && 'analysis' in raw) {
    const { analysis: _droppedAnalysis, ...rest } = raw as Record<string, unknown>;
    const retry = RegistrySchema.safeParse(rest);
    if (retry.success) {
      const issues = result.error.issues
        .filter((i) => i.path[0] === 'analysis')
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      console.warn(`[reuse] cached analysis failed to parse and was ignored. Re-run \`reuse analyze --refresh\` to regenerate. Validation issues: ${issues || 'unknown'}`);
      return retry.data;
    }
  }
  // Re-throw if the failure is in projects (the actually critical data)
  throw result.error;
}

export function saveRegistry(registry: Registry): void {
  const dir = getRegistryDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2));
}
