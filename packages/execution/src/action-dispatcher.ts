import type { CdpEvmWalletProvider } from '@coinbase/agentkit';
import type { ExecutionPlan, ExecutionStep } from '@intend/core';
import { buildTransaction } from '@intend/skills';
import type { SkillRequest } from '@intend/skills';
import { executeAtomic, type AtomicStep } from './atomicity-wrapper.js';
import { getSupabase } from '@intend/data';

// ── Types ─────────────────────────────────────────────────────────────────

export interface DispatchResult {
  success:    boolean;
  tx_hashes:  string[];
  error?:     string;
}

// ── Main dispatcher ───────────────────────────────────────────────────────

/**
 * Takes a confirmed ExecutionPlan and dispatches every step through
 * AgentKit → Atomicity Wrapper → Base chain.
 *
 * This is the only function that signs and broadcasts transactions.
 * Strategy Generators never touch keys directly.
 */
export async function dispatch(
  plan:     ExecutionPlan,
  provider: CdpEvmWalletProvider,
  channel:  'telegram' | 'whatsapp' | 'web'
): Promise<DispatchResult> {
  const walletAddress = provider.getAddress() as `0x${string}`;
  const tx_hashes: string[] = [];

  const atomicSteps: AtomicStep[] = plan.steps.map(step =>
    buildAtomicStep(step, walletAddress, provider, tx_hashes, channel)
  );

  try {
    await executeAtomic({
      intent_id:        plan.plan_id,
      user_id:          plan.user_id,
      channel,
      steps:            atomicSteps,
      balance_snapshot: {}, // populated by caller before dispatch in production
    });

    return { success: true, tx_hashes };
  } catch (err) {
    return {
      success:   false,
      tx_hashes,
      error:     err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Step builder ──────────────────────────────────────────────────────────

function buildAtomicStep(
  step:          ExecutionStep,
  walletAddress: `0x${string}`,
  provider:      CdpEvmWalletProvider,
  tx_hashes:     string[],
  channel:       string
): AtomicStep {
  return {
    name: step.name,

    execute: async () => {
      const network: 'mainnet' | 'testnet' =
        (step.network as 'mainnet' | 'testnet') ?? 'testnet';

      const req: SkillRequest = {
        protocol: step.protocol ?? 'erc20_transfer',
        action:   step.action   ?? 'transfer',
        chain:    'base',
        network,
        args:     (step.args ?? {}) as Record<string, string | number | bigint>,
        from:     walletAddress,
      };

      const unsignedTxs = await buildTransaction(req);
      const hashes: string[] = [];

      for (const utx of unsignedTxs) {
        // AgentKit signs and broadcasts — keys never leave Coinbase TEE
        const txHash = await provider.sendTransaction({
          to:    utx.to,
          value: utx.value,
          data:  utx.data,
        });

        hashes.push(txHash);
        tx_hashes.push(txHash);
      }

      const lastHash = hashes.at(-1);
      return lastHash ? { tx_hash: lastHash } : {};
    },

    // Rollback: re-read chain state — don't assume
    rollback: async () => {
      // Rollback is protocol-specific:
      // - DEX swaps: already reverted by EVM if tx failed
      // - Deposits: call withdraw
      // The atomicity wrapper handles balance verification post-rollback
      await logRollbackAttempt(step.name, channel);
    },
  };
}

async function logRollbackAttempt(stepName: string, channel: string): Promise<void> {
  try {
    const db = getSupabase();
    await db.from('event_log').insert({
      event_type: 'execution_rolled_back',
      source:     channel,
      event_data: { step: stepName, reason: 'rollback_initiated' },
    });
  } catch {
    // Non-fatal — atomicity wrapper also logs
  }
}
