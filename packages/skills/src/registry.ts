import { loadPlaybook } from './loader.js';
import { encodeAction } from './encoder.js';
import { getManifestEntry } from './loader.js';
import { emitSkillAudit, hashArgs } from './audit.js';
import type { SkillRequest, BuildTransactionResult, SkillPlaybook } from './types.js';

// ── Sandbox boundary ───────────────────────────────────────────────────────
// The Skill Registry is a PURE encoder. By contract:
//   • No filesystem access outside readFileSync of pinned playbooks.
//   • No network access — ever. Token decimals + chain IDs are static maps.
//   • No private-key access — buildTransaction returns *unsigned* txs only.
//   • No DB access — observability is delegated to an injectable audit hook
//     (see ./audit.ts) so the registry stays a leaf node in the DAG.
// The Execution Agent (AgentKit) signs and broadcasts; the Decision Agent
// stores audit rows. Anything else is a layering violation.

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Main entry point for the Skill Registry.
 *
 * Strategy Generators ALWAYS call this — never a protocol directly.
 * Returns one or more unsigned transactions (approve + action) in execution order.
 * AgentKit signs and broadcasts — the registry never touches keys.
 */
export async function buildTransaction(
  req: SkillRequest
): Promise<BuildTransactionResult> {
  const playbook = getPlaybook(req.protocol, req.chain);
  const result   = encodeAction(playbook, req.action, req);

  // Fire-and-forget audit. Never throws. Never blocks.
  const entry = getManifestEntry(req.protocol, req.chain);
  emitSkillAudit({
    skill:     req.protocol,
    chain:     req.chain,
    action:    req.action,
    version:   entry?.version ?? playbook.version,
    sha256:    entry?.sha256  ?? '',
    args_hash: hashArgs(req.args),
    ts_ms:     Date.now(),
  });

  return result;
}

/** Load and return a raw playbook (used by strategy generators for metadata). */
export function getPlaybook(protocol: string, chain = 'base'): SkillPlaybook {
  return loadPlaybook(protocol, chain);
}

/** List all available protocols for a given chain. */
export function listProtocols(chain = 'base'): string[] {
  return [
    'aave_v3',
    'morpho',
    'aerodrome',
    'uniswap_v3',
    'lido',
    'erc20_transfer',
    'eth_wallets',
    'bankrbot_usdc',
    'eth_addresses_security',
  ].filter(p => {
    try { loadPlaybook(p, chain); return true; }
    catch { return false; }
  });
}
