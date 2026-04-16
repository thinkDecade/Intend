import { readFileSync } from 'fs';
import { join } from 'path';
import type { SkillPlaybook } from './types.js';

// __dirname is available in CommonJS (NodeNext without "type":"module")
const PLAYBOOKS_DIR = join(__dirname, '..', 'playbooks');

const cache = new Map<string, SkillPlaybook>();

export function loadPlaybook(protocol: string, chain: string): SkillPlaybook {
  const key = `${protocol}:${chain}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const filePath = join(PLAYBOOKS_DIR, `${protocol}_${chain}.json`);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`[loader] Playbook not found: ${filePath}`);
  }

  let playbook: unknown;
  try {
    playbook = JSON.parse(raw);
  } catch {
    throw new Error(`[loader] Invalid JSON in playbook: ${filePath}`);
  }

  validatePlaybook(playbook, filePath);
  const pb = playbook as SkillPlaybook;
  cache.set(key, pb);
  return pb;
}

function validatePlaybook(pb: unknown, filePath: string): void {
  if (!pb || typeof pb !== 'object') {
    throw new Error(`[loader] Playbook is not an object: ${filePath}`);
  }
  const p = pb as Record<string, unknown>;
  for (const field of ['protocol', 'chain', 'version', 'contract', 'actions']) {
    if (!p[field]) {
      throw new Error(`[loader] Playbook missing "${field}" field: ${filePath}`);
    }
  }
}

/** Clear the cache — useful in tests. */
export function clearPlaybookCache(): void {
  cache.clear();
}
