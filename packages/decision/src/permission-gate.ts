import type { UserFinancialModel } from '@intend/core';

// ── Types ─────────────────────────────────────────────────────────────────

export interface PermissionCheck {
  allowed:               boolean;
  reason?:               string;
  /** True when the tx is allowed but the user must explicitly confirm before execution */
  requires_confirmation: boolean;
}

// ── KYC tier limits ───────────────────────────────────────────────────────
// NOTE: KYC gating is disabled in v0.5 for frictionless onboarding. The
// tier limits table is retained for re-activation in a future version.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _KYC_TX_LIMITS: Record<string, number> = {
  tier_0: 100,
  tier_1: 1_000,
  tier_2: 10_000,
  tier_3: 100_000,
};

/**
 * Primitives that are always semi_autonomous regardless of the user's global execution_mode.
 * PROTECT moves real capital to hedge real risk — always warrants a human decision.
 */
const ALWAYS_CONFIRM_PRIMITIVES = new Set(['PROTECT']);

// ── Gate ──────────────────────────────────────────────────────────────────

export function checkPermission(
  amountUsd:  number,
  ufm:        UserFinancialModel,
  primitive:  string
): PermissionCheck {
  const { execution_mode, max_auto_tx_usd } = ufm.identity;

  // 1. KYC gate — disabled in v0.5. Re-enable by checking _KYC_TX_LIMITS.

  // 2. Primitives that always require confirmation regardless of mode
  if (ALWAYS_CONFIRM_PRIMITIVES.has(primitive)) {
    return { allowed: true, requires_confirmation: true };
  }

  // 3. Execution mode
  if (execution_mode === 'autonomous') {
    // Check per-transaction limit
    if (amountUsd > max_auto_tx_usd) {
      return {
        allowed:               true,
        requires_confirmation:  true,
        reason: `This amount exceeds your auto-execute limit of $${max_auto_tx_usd.toLocaleString()}. I need your confirmation.`,
      };
    }
    // Fully autonomous — execute immediately, receipt sent after
    return { allowed: true, requires_confirmation: false };
  }

  // semi_autonomous (default) — always present plan and wait for confirmation
  return { allowed: true, requires_confirmation: true };
}

export function checkRecipientPermission(
  ufm:          UserFinancialModel,
  isNewAddress: boolean
): PermissionCheck {
  if (isNewAddress && ufm.identity.require_confirm_new_recipient === true) {
    return {
      allowed:               true,
      requires_confirmation:  true,
      reason: 'New recipient — confirmation required per your security settings.',
    };
  }
  return { allowed: true, requires_confirmation: true }; // always confirm SEND
}
