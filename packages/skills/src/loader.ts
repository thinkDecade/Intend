import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';
import type { SkillPlaybook } from './types.js';

// __dirname is available in CommonJS (NodeNext without "type":"module")
const PLAYBOOKS_DIR = join(__dirname, '..', 'playbooks');
const MANIFEST_PATH = join(__dirname, '..', 'manifest.json');

const cache = new Map<string, SkillPlaybook>();

// ── Manifest ───────────────────────────────────────────────────────────────

interface ManifestEntry {
  skill:        string;
  chain:        string;
  version:      string;
  sha256:       string;
  source_repo:  string;
  commit:       string;
  external?:    boolean;
}
interface Manifest {
  manifest_version: number;
  generated_for:    string;
  comment?:         string;
  playbooks:        Record<string, ManifestEntry>;
}

let manifestCache: Manifest | null = null;
function readManifest(): Manifest {
  if (manifestCache) return manifestCache;
  let raw: string;
  try {
    raw = readFileSync(MANIFEST_PATH, 'utf8');
  } catch {
    throw new Error(`[skills] manifest.json missing at ${MANIFEST_PATH}`);
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error(`[skills] manifest.json is not valid JSON`); }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`[skills] manifest.json is not an object`);
  }
  const m = parsed as Manifest;
  if (!m.playbooks || typeof m.playbooks !== 'object') {
    throw new Error(`[skills] manifest.json missing "playbooks" map`);
  }
  manifestCache = m;
  return m;
}

export class SkillVerificationError extends Error {
  constructor(
    public readonly file:       string,
    public readonly expected:   string,
    public readonly actual:     string,
    public readonly reason:     'unpinned' | 'mismatch' | 'missing_manifest',
  ) {
    super(
      reason === 'unpinned'        ? `[skills] Refusing to load unpinned playbook: ${file}` :
      reason === 'missing_manifest'? `[skills] Manifest missing — refusing to load: ${file}` :
      `[skills] SHA-256 mismatch on ${file}\n  expected: ${expected}\n  actual:   ${actual}`,
    );
    this.name = 'SkillVerificationError';
  }
}

/** Optional escape hatch for local development only. */
const SKIP_VERIFY = process.env['INTEND_SKILLS_SKIP_VERIFY'] === '1';

// ── Loader ─────────────────────────────────────────────────────────────────

export function loadPlaybook(protocol: string, chain: string): SkillPlaybook {
  const key = `${protocol}:${chain}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const fileName = `${protocol}_${chain}.json`;
  const filePath = join(PLAYBOOKS_DIR, fileName);

  let buf: Buffer;
  try {
    buf = readFileSync(filePath);
  } catch {
    throw new Error(`[loader] Playbook not found: ${filePath}`);
  }

  // ── SHA-256 verification against manifest ──────────────────────────────
  if (!SKIP_VERIFY) {
    let manifest: Manifest;
    try { manifest = readManifest(); }
    catch (err) {
      throw new SkillVerificationError(fileName, '', '', 'missing_manifest');
    }
    const entry = manifest.playbooks[fileName];
    if (!entry) {
      throw new SkillVerificationError(fileName, '', '', 'unpinned');
    }
    const actual = createHash('sha256').update(buf).digest('hex');
    if (actual !== entry.sha256.toLowerCase()) {
      throw new SkillVerificationError(fileName, entry.sha256, actual, 'mismatch');
    }
  } else if (process.env['NODE_ENV'] === 'production') {
    throw new Error('[skills] INTEND_SKILLS_SKIP_VERIFY is forbidden in production');
  }

  let playbook: unknown;
  try {
    playbook = JSON.parse(buf.toString('utf8'));
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
  manifestCache = null;
}

// ── Public manifest helpers (used by CLI + audit logger) ──────────────────

export interface ManifestSummary {
  file:    string;
  skill:   string;
  chain:   string;
  version: string;
  sha256:  string;
  source:  string;
  commit:  string;
  external: boolean;
}

export function listManifest(): ManifestSummary[] {
  const m = readManifest();
  return Object.entries(m.playbooks).map(([file, e]) => ({
    file,
    skill:    e.skill,
    chain:    e.chain,
    version:  e.version,
    sha256:   e.sha256,
    source:   e.source_repo,
    commit:   e.commit,
    external: !!e.external,
  }));
}

export function getManifestEntry(skill: string, chain: string): ManifestSummary | null {
  const file = `${skill}_${chain}.json`;
  const m = readManifest();
  const e = m.playbooks[file];
  if (!e) return null;
  return {
    file, skill: e.skill, chain: e.chain, version: e.version,
    sha256: e.sha256, source: e.source_repo, commit: e.commit, external: !!e.external,
  };
}
