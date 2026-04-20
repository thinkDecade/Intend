/**
 * Strategy router — v0.5 (4 primitives active).
 *
 * Active primitives:
 *   STORE    — view / hold (no on-chain plan; handled conversationally upstream)
 *   SEND     — USDC transfer on Base (person OR merchant; merged "Send/Spend")
 *   CONVERT  — swap between assets via Aerodrome / Uniswap V3 on Base
 *   ALLOCATE — deploy idle capital to a yield protocol (Aave / Morpho on Base).
 *              Subsumes the old GROW / SAVE / INVEST / EARN intents — for v0.5
 *              all of those land in the same yield-supply plan.
 *
 * Deprecated legacy primitives — kept in the enum for one cycle so older
 * `intents` rows still validate, but the router rejects them with a precise
 * "use the new primitive instead" error:
 *   PROTECT, MOVE, SPEND, GROW, SAVE, EARN, INVEST
 */
import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { buildSendPlan }    from './send.js';
import { buildConvertPlan } from './convert.js';
import { buildGrowPlan }    from './grow.js';
import type { MoveRecipientType } from './move.js';
import type { SpendResult }       from './spend.js';

export { buildSendPlan, buildConvertPlan, buildGrowPlan };
export type { MoveRecipientType, SpendResult };

/** Primitives the user CAN reach in v0.5. Used by error messages. */
const ACTIVE_PRIMITIVES = ['STORE', 'SEND', 'CONVERT', 'ALLOCATE'] as const;

/** Old-spec primitives that are categorically dropped. */
const DEPRECATED_PRIMITIVES = new Set([
  'PROTECT', 'MOVE', 'SPEND', 'GROW', 'SAVE', 'EARN', 'INVEST',
]);

/** Thrown when a user requests a primitive not yet active in this version. */
export class PrimitiveDisabledError extends Error {
  constructor(public readonly primitive: string) {
    super(
      `That's not something I do yet. Right now I can hold and show you your ` +
      `balance, send funds to anyone, convert between assets, or allocate idle ` +
      `funds to earn yield — what would you like to do?`,
    );
    this.name = 'PrimitiveDisabledError';
  }
}

export interface StrategyContext {
  network:         'mainnet' | 'testnet';
  // SEND
  recipientType?:    MoveRecipientType;
  resolvedAddress?:  string;
  ensName?:          string | null;
  isNewRecipient?:   boolean;
}

/**
 * Route an intention to the correct strategy generator.
 * Called by the bot pipeline after interpretIntent().
 *
 * STORE is handled conversationally (balance read) and never reaches this
 * router — if it does, that's a pipeline bug, so we surface it loudly.
 */
export async function generatePlan(
  intention: IntentionObject,
  ufm:       UserFinancialModel,
  ctx:       StrategyContext,
): Promise<ExecutionPlan> {
  const { primitive } = intention;
  const network = ctx.network ?? 'testnet';

  if (primitive === 'STORE') {
    throw new Error(
      '[strategy] STORE has no execution plan — handle it in the conversational layer.',
    );
  }

  if (DEPRECATED_PRIMITIVES.has(primitive)) {
    throw new PrimitiveDisabledError(primitive);
  }

  if (primitive === 'SEND') {
    return buildSendPlan(intention, ufm, ctx.recipientType ?? 'claim', network);
  }

  if (primitive === 'CONVERT') {
    return buildConvertPlan(intention, ufm, network);
  }

  if (primitive === 'ALLOCATE') {
    // v0.5: every ALLOCATE intent (yield, save-toward-goal, invest, earn-on-
    // inbound) routes to the yield-supply builder. Differentiation between
    // sub-modes (named goals, conviction holds, etc.) is a v0.6+ concern.
    return buildGrowPlan(intention, ufm, network);
  }

  throw new Error(
    `[strategy] Unknown primitive '${String(primitive)}'. Active: ${ACTIVE_PRIMITIVES.join(', ')}.`,
  );
}
