/**
 * Atomicity Wrapper
 *
 * Every on-chain execution goes through here. No exceptions.
 *
 * Guarantees:
 *   - Balance snapshot stored before any step executes
 *   - Any step failure triggers reverse rollback of all completed steps
 *   - Balance verified from chain after rollback (never assumed)
 *   - event_log records every stage transition (append-only)
 *   - intents.status tracks the full lifecycle
 *
 * Rollback rules (execution/CLAUDE.md):
 *   - DEX swap fails: tx reverted on-chain, no funds moved — verify via chain read
 *   - Approval tx fails: no swap attempted — confirm via allowance check
 *   - Yield deposit fails: tokens back in wallet — verify balance
 *   - After ANY rollback: read balance from chain, never assume intact
 */

import { updateIntentStatus, logEvent } from '@intend/data';

// ── Types ─────────────────────────────────────────────────────────────────

export interface StepResult {
  tx_hash?: string;
  data?: Record<string, unknown>;
}

export interface AtomicStep {
  /** Human-readable label for logging (internal only). */
  name: string;
  /** Execute the step. Throw on failure. */
  execute: () => Promise<StepResult>;
  /**
   * Undo this step if a later step fails.
   * If omitted, the step is assumed non-reversible (e.g. already-mined approval).
   */
  rollback?: () => Promise<void>;
}

export interface AtomicityContext {
  intent_id: string;
  user_id:   string;
  channel:   'telegram' | 'whatsapp' | 'web';
  steps:     AtomicStep[];
  /**
   * Snapshot of user balances BEFORE execution begins.
   * Stored in intents.rollback_state. Used to detect phantom balance loss.
   * Map of asset → amount (e.g. { USDC: 847.00, ETH: 0.23 })
   */
  balance_snapshot: Record<string, number>;
  /**
   * Called after rollback to verify user balance is intact.
   * MUST read from chain — never use cached values.
   * If provided, a balance mismatch after rollback is escalated as a critical error.
   */
  verifyBalance?: () => Promise<Record<string, number>>;
}

export interface AtomicResult {
  success: true;
  steps_completed: number;
  tx_hashes: string[];
}

export class AtomicityError extends Error {
  constructor(
    message: string,
    public readonly failed_step: string,
    public readonly rolled_back: boolean,
    public readonly balance_verified: boolean,
  ) {
    super(message);
    this.name = 'AtomicityError';
  }
}

export class BalanceMismatchError extends Error {
  constructor(
    public readonly asset: string,
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(
      `CRITICAL: Balance mismatch after rollback — ${asset}: expected ${expected}, got ${actual}. ` +
      `Manual review required for intent.`
    );
    this.name = 'BalanceMismatchError';
  }
}

// ── Core ──────────────────────────────────────────────────────────────────

/**
 * Execute a sequence of steps atomically.
 *
 * On any step failure:
 *   1. Run rollbacks for completed steps in reverse order
 *   2. Verify balance from chain (if verifyBalance provided)
 *   3. Mark intent as failed in DB
 *   4. Log execution_rolled_back event
 *   5. Throw AtomicityError
 *
 * On full success:
 *   1. Mark intent as complete in DB
 *   2. Log execution_complete event
 *   3. Return AtomicResult
 */
export async function executeAtomic(ctx: AtomicityContext): Promise<AtomicResult> {
  const { intent_id, user_id, channel, steps, balance_snapshot } = ctx;

  if (steps.length === 0) throw new Error('[atomicity] No steps provided');

  // ── 1. Store snapshot + set status = executing ──────────────────────────
  await updateIntentStatus(intent_id, 'executing', {
    rollback_state: { balance_snapshot, steps: steps.map((s) => s.name) },
  });

  // ── 2. Log execution_started ────────────────────────────────────────────
  await logEvent({
    user_id,
    event_type: 'execution_started',
    source:     channel,
    event_data: {
      total_steps:      steps.length,
      step_names:       steps.map((s) => s.name),
      balance_snapshot,
    },
    intent_id,
  });

  // ── 3. Execute steps in sequence ─────────────────────────────────────────
  const completed: Array<{ step: AtomicStep; result: StepResult }> = [];
  const tx_hashes: string[] = [];

  for (const step of steps) {
    let result: StepResult;
    try {
      result = await step.execute();
      if (result.tx_hash) tx_hashes.push(result.tx_hash);

      completed.push({ step, result });

      await logEvent({
        user_id,
        event_type: 'execution_step_complete',
        source:     channel,
        event_data: {
          step:    step.name,
          tx_hash: result.tx_hash ?? null,
          data:    result.data ?? null,
        },
        intent_id,
      });
    } catch (err) {
      const stepErr = err instanceof Error ? err : new Error(String(err));

      await logEvent({
        user_id,
        event_type: 'execution_step_failed',
        source:     channel,
        event_data: {
          step:  step.name,
          error: stepErr.message,
          completed_before: completed.map((c) => c.step.name),
        },
        intent_id,
      });

      // ── 4. Rollback completed steps in REVERSE order ──────────────────
      const rollbackErrors: string[] = [];
      for (const done of [...completed].reverse()) {
        if (!done.step.rollback) continue;
        try {
          await done.step.rollback();
        } catch (rbErr) {
          rollbackErrors.push(
            `${done.step.name}: ${rbErr instanceof Error ? rbErr.message : String(rbErr)}`
          );
        }
      }

      // ── 5. Verify balance from chain after rollback ───────────────────
      let balanceVerified = false;
      if (ctx.verifyBalance) {
        try {
          const postRollback = await ctx.verifyBalance();

          // Check for critical mismatch — any asset below snapshot is a problem
          for (const [asset, expected] of Object.entries(balance_snapshot)) {
            const actual = postRollback[asset] ?? 0;
            // Allow small tolerance for gas spent (0.001 ETH)
            const tolerance = asset === 'ETH' ? 0.002 : 0;
            if (actual < expected - tolerance) {
              await logEvent({
                user_id,
                event_type: 'execution_rolled_back',
                source:     channel,
                event_data: {
                  step:              step.name,
                  rollback_errors:   rollbackErrors,
                  balance_mismatch:  { asset, expected, actual },
                  critical:          true,
                },
                intent_id,
              });
              await updateIntentStatus(intent_id, 'failed');
              throw new BalanceMismatchError(asset, expected, actual);
            }
          }

          balanceVerified = true;
        } catch (verifyErr) {
          if (verifyErr instanceof BalanceMismatchError) throw verifyErr;
          // Balance read failed — log and continue, don't mask original error
          rollbackErrors.push(`balance_verify: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
        }
      }

      // ── 6. Log execution_rolled_back ──────────────────────────────────
      await logEvent({
        user_id,
        event_type: 'execution_rolled_back',
        source:     channel,
        event_data: {
          failed_step:      step.name,
          error:            stepErr.message,
          rollback_errors:  rollbackErrors,
          balance_verified: balanceVerified,
        },
        intent_id,
      });

      // ── 7. Update intent status = failed ─────────────────────────────
      await updateIntentStatus(intent_id, 'failed');

      throw new AtomicityError(
        `Step "${step.name}" failed: ${stepErr.message}`,
        step.name,
        rollbackErrors.length === 0,
        balanceVerified,
      );
    }
  }

  // ── 8. All steps complete — mark intent as complete ─────────────────────
  const lastTxHash = tx_hashes.at(-1);
  await updateIntentStatus(intent_id, 'complete', {
    ...(lastTxHash ? { tx_hash: lastTxHash } : {}),
  });

  await logEvent({
    user_id,
    event_type: 'execution_complete',
    source:     channel,
    event_data: {
      steps_completed: steps.length,
      tx_hashes,
    },
    intent_id,
  });

  return {
    success:         true,
    steps_completed: steps.length,
    tx_hashes,
  };
}
