#!/usr/bin/env ts-node
/**
 * Secret audit script — scan source files for hardcoded credentials.
 *
 * Usage:  npx ts-node scripts/audit-secrets.ts
 * Output: list of suspicious lines, or "clean" if nothing found.
 *
 * Run as part of CI and pre-release checklist.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

const ROOT = join(__dirname, '..');

// Directories to skip entirely
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.turbo', 'coverage',
]);

// File extensions to scan
const SCAN_EXTS = new Set([
  '.ts', '.js', '.mjs', '.cjs', '.json', '.env', '.yaml', '.yml', '.toml',
]);

// Skip these files (known-safe)
const SKIP_FILES = new Set([
  '.env.example',
  '.gitleaks.toml',
  'audit-secrets.ts',
  'yarn.lock',
]);

interface SecretPattern {
  name:  string;
  regex: RegExp;
}

const PATTERNS: SecretPattern[] = [
  { name: 'Anthropic API key',       regex: /sk-ant-[A-Za-z0-9\-_]{20,}/                     },
  { name: 'OpenAI API key',          regex: /sk-[A-Za-z0-9]{20,}/                              },
  { name: 'Google AI key',           regex: /AIza[A-Za-z0-9\-_]{35}/                           },
  { name: 'Supabase service key',    regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_\-]{40,}/ },
  { name: 'Upstash token',           regex: /AX[A-Za-z0-9_\-]{30,}/                            },
  { name: 'Telegram bot token',      regex: /\d{8,10}:[A-Za-z0-9_\-]{35}/                     },
  { name: 'CDP API secret (inline)', regex: /CDP_API_KEY_SECRET\s*=\s*[A-Za-z0-9/+]{10,}/     },
  { name: 'CDP wallet secret (inline)', regex: /CDP_WALLET_SECRET\s*=\s*[A-Za-z0-9/+]{10,}/  },
  { name: 'Private key (hex)',       regex: /0x[0-9a-fA-F]{62,66}/                             },
  { name: 'Generic secret assignment', regex: /(?:secret|password|passwd|api_key)\s*=\s*['"][^'"]{8,}['"]/i },
];

interface Finding {
  file:    string;
  line:    number;
  pattern: string;
  excerpt: string;
}

function scanFile(filePath: string): Finding[] {
  const findings: Finding[] = [];
  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return findings;
  }

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const pat of PATTERNS) {
      if (pat.regex.test(line)) {
        findings.push({
          file:    relative(ROOT, filePath),
          line:    i + 1,
          pattern: pat.name,
          excerpt: line.trim().slice(0, 80),
        });
      }
    }
  }
  return findings;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (SCAN_EXTS.has(extname(entry)) && !SKIP_FILES.has(entry)) {
      files.push(full);
    }
  }
  return files;
}

// ── Main ──────────────────────────────────────────────────────────────────

const files   = walk(ROOT);
const allFindings: Finding[] = [];

for (const file of files) {
  allFindings.push(...scanFile(file));
}

if (allFindings.length === 0) {
  console.log('\n✓ Secret audit clean — no hardcoded credentials found.\n');
  process.exit(0);
} else {
  console.error(`\n✗ Secret audit found ${allFindings.length} issue(s):\n`);
  for (const f of allFindings) {
    console.error(`  ${f.file}:${f.line} [${f.pattern}]`);
    console.error(`    ${f.excerpt}\n`);
  }
  console.error('  Remove or rotate credentials before committing.\n');
  process.exit(1);
}
