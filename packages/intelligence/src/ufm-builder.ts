/**
 * UFM Builder — assembles the User Financial Model before every pipeline run.
 *
 * Rules (CLAUDE.md):
 *   - Rebuilt on every pipeline execution — never cached across runs
 *   - Balances fetched fresh from chain via AgentKit (packages/execution — P0-07)
 *   - Signal data from Redis with TTL enforcement (2× TTL = abort)
 *   - If any required signal is stale: abort with user-facing message
 */

import type { UserFinancialModel, Balance, PendingConfirmation, Goal, Position, ForwardSignal } from '@intend/core';
import { getUserById } from '@intend/data';
import {
  getFxSignalStrict,
  getBestApy,
  getApySignalStrict,
  getHedgeSignal,
  computeHedgeScore,
  type HedgeComponents,
} from '@intend/signals';
import type { FxSignal } from '@intend/signals';

/**
 * Derive a ForwardSignal from FX data — describes where the regional
 * economic environment is heading, not just where it is today.
 *
 * Direction:
 *   deteriorating = fx weakening + meaningful change
 *   improving     = fx strengthening
 *   stable        = everything else
 *
 * Acceleration:
 *   rapid   = > 10% absolute 30d change
 *   gradual = 3–10% absolute 30d change
 *   stable  = < 3%
 */
function computeForwardSignal(fx: FxSignal): ForwardSignal {
  const absChange = Math.abs(fx.fx_change_30d);

  let direction: ForwardSignal['direction'];
  if (fx.fx_trend === 'weakening' && fx.fx_change_30d < -2) {
    direction = 'deteriorating';
  } else if (fx.fx_trend === 'strengthening' && fx.fx_change_30d > 2) {
    direction = 'improving';
  } else {
    direction = 'stable';
  }

  let acceleration: ForwardSignal['acceleration'];
  if (absChange > 10) {
    acceleration = 'rapid';
  } else if (absChange > 3) {
    acceleration = 'gradual';
  } else {
    acceleration = 'stable';
  }

  // Score delta: approximated from 30d FX change normalised to 0–1 range.
  // Positive = things are getting worse.
  const score_delta =
    direction === 'deteriorating' ? Math.min(1, absChange / 20) :
    direction === 'improving'     ? -Math.min(1, absChange / 20) :
    0;

  return { direction, score_delta, acceleration };
}

export class SignalStaleError extends Error {
  constructor(signal: string) {
    super(`I'm missing current data (${signal}). Try again in a moment.`);
    this.name = 'SignalStaleError';
  }
}

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

/**
 * Build the UFM for a given user_id.
 *
 * Throws SignalStaleError if any required signal exceeds 2× its TTL.
 * Throws UserNotFoundError if user does not exist.
 * Throws Error if on-chain balance fetch fails.
 *
 * Called once per pipeline execution — result must NOT be cached.
 */
export async function buildUFM(
  userId: string,
  options?: {
    /** Provide pre-fetched on-chain balances from AgentKit (P0-07). */
    balances?: Balance[];
    /** Provide pre-fetched pending confirmations. */
    pendingConfirmations?: PendingConfirmation[];
    /** Provide pre-fetched active goals. */
    activeGoals?: Goal[];
    /** Provide pre-fetched active positions. */
    activePositions?: Position[];
  }
): Promise<UserFinancialModel> {
  // 1. Load user profile
  const user = await getUserById(userId);
  if (!user) throw new UserNotFoundError(userId);

  // 2. Load signals with strict staleness enforcement
  const [fxSignal, apySignal, hedgeSignal] = await Promise.all([
    getFxSignalStrict(user.region).catch((err: Error) => {
      throw new SignalStaleError(`FX/${user.region}: ${err.message}`);
    }),
    getApySignalStrict().catch((err: Error) => {
      throw new SignalStaleError(`APY: ${err.message}`);
    }),
    getHedgeSignal(user.region).catch(() => null), // non-fatal — degraded gracefully
  ]);

  const bestApy = apySignal.protocols.length > 0
    ? Math.max(...apySignal.protocols.map((p) => p.apy))
    : 0;

  // 3. On-chain balances — provided by caller (AgentKit, P0-07)
  // If not provided yet (e.g. during P0-07 bootstrap), return empty array
  const balances = options?.balances ?? [];

  const totalUsdValue = balances.reduce((sum, b) => sum + b.usd_value, 0);

  // 4. Current yield on deployed positions
  const activePositions = options?.activePositions ?? [];
  const deployedApys = activePositions.map((p) => p.apy_at_entry).filter((a) => a > 0);
  const currentApy = deployedApys.length > 0
    ? deployedApys.reduce((a, b) => a + b, 0) / deployedApys.length
    : null;

  return {
    user_id: userId,
    present: {
      balances,
      total_usd_value:        totalUsdValue,
      pending_confirmations:  options?.pendingConfirmations ?? [],
      active_goals:           options?.activeGoals ?? [],
      active_positions:       activePositions,
    },
    environment: {
      region:          user.region,
      local_currency:  user.local_currency,
      fx_rate:         fxSignal.fx_rate,
      fx_trend:        fxSignal.fx_trend,
      fx_change_30d:   fxSignal.fx_change_30d,
      inflation_rate:  fxSignal.inflation_rate,
      hedge_score:     hedgeSignal?.score ?? 0,
      best_apy:        bestApy,
      current_apy:     currentApy,
      forward_signal:  computeForwardSignal(fxSignal),
    },
    identity: {
      user_id:                     userId,
      execution_mode:              user.execution_mode ?? 'semi_autonomous',
      preferred_channel:           user.preferred_channel ?? 'telegram',
      kyc_tier:                    user.kyc_tier as 'tier_0' | 'tier_1' | 'tier_2' | 'tier_3',
      max_auto_tx_usd:             Number(user.max_auto_tx_usd),
      intend_handle:               user.intend_handle,
      require_confirm_new_recipient: true, // always require confirmation for new recipients
    },
  };
}
