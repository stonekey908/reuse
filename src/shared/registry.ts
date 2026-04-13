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
  return RegistrySchema.parse(raw);
}

export function saveRegistry(registry: Registry): void {
  const dir = getRegistryDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getRegistryPath(), JSON.stringify(registry, null, 2));
}
