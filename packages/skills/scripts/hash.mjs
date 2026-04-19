#!/usr/bin/env node
// Regenerate manifest.json by re-hashing every playbook on disk.
// Preserves existing skill/chain/version/source_repo/commit/external metadata
// where present; uses sensible defaults for newly added playbooks.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '..');
const PLAYBOOKS_DIR = join(ROOT, 'playbooks');
const MANIFEST_PATH = join(ROOT, 'manifest.json');

let existing = { manifest_version: 1, generated_for: 'v0.5', playbooks: {} };
try { existing = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')); } catch { /* fresh */ }

const files = readdirSync(PLAYBOOKS_DIR).filter(f => f.endsWith('.json')).sort();
const next  = {};

for (const file of files) {
  const buf  = readFileSync(join(PLAYBOOKS_DIR, file));
  const hash = createHash('sha256').update(buf).digest('hex');
  const pb   = JSON.parse(buf.toString('utf8'));
  const prev = existing.playbooks?.[file] ?? {};
  next[file] = {
    skill:       prev.skill       ?? pb.protocol,
    chain:       prev.chain       ?? pb.chain,
    version:     prev.version     ?? pb.version ?? '1.0.0',
    sha256:      hash,
    source_repo: prev.source_repo ?? 'internal',
    commit:      prev.commit      ?? existing.generated_for ?? 'v0.5',
    ...(prev.external ? { external: true } : {}),
  };
}

const out = {
  manifest_version: existing.manifest_version ?? 1,
  generated_for:    existing.generated_for    ?? 'v0.5',
  comment:          existing.comment ?? 'Pinned SHA-256 of every playbook + provenance.',
  playbooks:        next,
};

writeFileSync(MANIFEST_PATH, JSON.stringify(out, null, 2) + '\n');
console.log(`Wrote ${MANIFEST_PATH} with ${files.length} entries.`);
