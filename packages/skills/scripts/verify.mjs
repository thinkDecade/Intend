#!/usr/bin/env node
// Verify every playbook on disk matches its pinned SHA-256 in manifest.json.
// Exits non-zero on any drift, missing entry, or unexpected extra file.

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '..');
const PLAYBOOKS_DIR = join(ROOT, 'playbooks');
const MANIFEST_PATH = join(ROOT, 'manifest.json');

function red(s)   { return `\x1b[31m${s}\x1b[0m`; }
function green(s) { return `\x1b[32m${s}\x1b[0m`; }
function yellow(s){ return `\x1b[33m${s}\x1b[0m`; }
function dim(s)   { return `\x1b[2m${s}\x1b[0m`; }

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
} catch (err) {
  console.error(red(`✗ Cannot read manifest: ${MANIFEST_PATH}`));
  console.error(String(err));
  process.exit(2);
}

const pinned = manifest.playbooks ?? {};
const onDisk = readdirSync(PLAYBOOKS_DIR).filter(f => f.endsWith('.json'));

let failed = 0;
const seen = new Set();

for (const file of onDisk) {
  seen.add(file);
  const entry = pinned[file];
  const buf   = readFileSync(join(PLAYBOOKS_DIR, file));
  const hash  = createHash('sha256').update(buf).digest('hex');

  if (!entry) {
    console.error(red(`✗ UNPINNED  ${file}`));
    console.error(dim(`           sha256 ${hash}`));
    failed++;
    continue;
  }
  if (entry.sha256.toLowerCase() !== hash) {
    console.error(red(`✗ MISMATCH  ${file}`));
    console.error(dim(`           expected ${entry.sha256}`));
    console.error(dim(`           actual   ${hash}`));
    failed++;
    continue;
  }
  const tag = entry.external ? yellow('[external]') : dim('[internal]');
  console.log(`${green('✓')} ${file.padEnd(40)} ${tag} ${dim(entry.version)}`);
}

for (const file of Object.keys(pinned)) {
  if (!seen.has(file)) {
    console.error(red(`✗ MISSING   ${file} (in manifest, not on disk)`));
    failed++;
  }
}

if (failed > 0) {
  console.error(red(`\n${failed} verification failure(s).`));
  console.error(dim(`Regenerate with: yarn workspace @intend/skills skills:hash`));
  process.exit(1);
}

console.log(green(`\nAll ${onDisk.length} playbook(s) verified against manifest v${manifest.manifest_version}.`));
