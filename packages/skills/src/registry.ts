import { loadPlaybook } from './loader.js';
import { encodeAction } from './encoder.js';
import type { SkillRequest, BuildTransactionResult, SkillPlaybook } from './types.js';

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
  return encodeAction(playbook, req.action, req);
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
  ].filter(p => {
    try { loadPlaybook(p, chain); return true; }
    catch { return false; }
  });
}
