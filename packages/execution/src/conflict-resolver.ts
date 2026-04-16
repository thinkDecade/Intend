/**
 * Conflict Resolver
 *
 * Detects and resolves conflicts between simultaneously executing plans.
 * A conflict occurs when two execution plans attempt to move overlapping assets.
 *
 * v0.5 scope: detection only — resolution is queue-based (serialize conflicting plans).
 * Parallel execution within a single non-conflicting plan is handled by the
 * atomicity wrapper.
 *
 * Conflict definition:
 *   Two plans conflict if they share any asset source from the same wallet.
 *   Example: Plan A moves USDC to Bob; Plan B protects USDC to yield.
 *   Both attempt to spend from the same USDC balance — conflict detected.
 *
 * Resolution (v0.5): serialize. Reject the incoming plan with a user-facing
 * message explaining what's in progress. Do not block indefinitely.
 */

import type { ExecutionPlan, ExecutionStep } from '@intend/core';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ConflictCheckResult {
  has_conflict: boolean;
  /** True if an existing plan is already executing (not just pending). */
  is_executing: boolean;
  conflicting_plan_id: string | null;
  conflicting_primitive: string | null;
  /** User-facing message explaining the conflict. */
  message: string | null;
}

export interface ActivePlanSummary {
  plan_id:   string;
  primitive: string;
  status:    'pending' | 'confirming' | 'executing';
  assets:    string[];  // assets being consumed by this plan
}

// ── Asset extraction ───────────────────────────────────────────────────────

/**
 * Extract the list of source assets that a plan will consume from the wallet.
 * Used to detect overlap between two plans.
 */
export function extractConsumedAssets(plan: ExecutionPlan): string[] {
  const assets = new Set<string>();

  for (const step of plan.steps) {
    // Convention: step.args contains asset/from-token info
    const args = step.args as Record<string, unknown>;

    // Direct asset field
    if (typeof args['asset'] === 'string') assets.add(args['asset'].toUpperCase());

    // token_in / asset_from for DEX swaps
    if (typeof args['token_in'] === 'string') assets.add(args['token_in'].toUpperCase());
    if (typeof args['asset_from'] === 'string') assets.add(args['asset_from'].toUpperCase());

    // PROTECT plans typically consume all stablecoins
    if (step.protocol === 'aave_v3' && step.action === 'supply') {
      assets.add('USDC');
      assets.add('USDT');
    }
  }

  return [...assets];
}

// ── Conflict detection ─────────────────────────────────────────────────────

/**
 * Check whether an incoming plan conflicts with any active plan.
 *
 * @param incoming    - The new plan the user wants to execute
 * @param activePlans - Plans currently in flight (pending confirmation or executing)
 */
export function checkConflict(
  incoming:    ExecutionPlan,
  activePlans: ActivePlanSummary[],
): ConflictCheckResult {
  const NO_CONFLICT: ConflictCheckResult = {
    has_conflict:          false,
    is_executing:          false,
    conflicting_plan_id:   null,
    conflicting_primitive: null,
    message:               null,
  };

  if (activePlans.length === 0) return NO_CONFLICT;

  const incomingAssets = new Set(extractConsumedAssets(incoming));

  for (const active of activePlans) {
    // Check asset overlap
    const overlap = active.assets.some((a) => incomingAssets.has(a));
    if (!overlap) continue;

    const isExecuting = active.status === 'executing';
    const primitiveLabel = active.primitive === 'MOVE' ? 'Send' : active.primitive;

    const message = isExecuting
      ? `Your ${primitiveLabel} plan is currently executing — please wait for it to complete before starting another action on the same funds.`
      : `You have a pending ${primitiveLabel} plan waiting for confirmation. Confirm or cancel it first, then I can help with this.`;

    return {
      has_conflict:          true,
      is_executing:          isExecuting,
      conflicting_plan_id:   active.plan_id,
      conflicting_primitive: active.primitive,
      message,
    };
  }

  return NO_CONFLICT;
}

// ── Serialization guard ────────────────────────────────────────────────────

/**
 * Throw if the incoming plan conflicts with any active plan.
 * Used as a guard at the start of the execution pipeline.
 */
export class PlanConflictError extends Error {
  constructor(
    message: string,
    public readonly conflicting_plan_id: string,
  ) {
    super(message);
    this.name = 'PlanConflictError';
  }
}

export function assertNoConflict(
  incoming:    ExecutionPlan,
  activePlans: ActivePlanSummary[],
): void {
  const result = checkConflict(incoming, activePlans);
  if (result.has_conflict && result.conflicting_plan_id && result.message) {
    throw new PlanConflictError(result.message, result.conflicting_plan_id);
  }
}
