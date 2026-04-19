/**
 * Strategy router — v0.5_updated.
 *
 * Active primitives in v0.5:
 *   STORE — view / hold (no on-chain plan; handled conversationally upstream)
 *   SEND  — USDC transfer on Base (person OR merchant; merged "Send/Spend")
 *
 * Gated primitives (interpreter does not emit; router rejects):
 *   CONVERT  → v0.6
 *   ALLOCATE → v0.7
 *
 * Deprecated legacy primitives — kept in the enum for one cycle so older
 * `intents` rows still validate, but the router rejects them with a
 * "coming soon" error pointing the user back at SEND/STORE:
 *   PROTECT, MOVE, SPEND, GROW, SAVE, EARN, INVEST
 */
import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { buildSendPlan }    from './send.js';
import type { MoveRecipientType } from './move.js';
import type { SpendResult }       from './spend.js';

export { buildSendPlan };
export type { MoveRecipientType, SpendResult };

/** Primitives the user CAN reach in v0.5. Used by error messages. */
const ACTIVE_PRIMITIVES = ['STORE', 'SEND'] as const;

/** Primitives that exist in the spec but ship in a later version. */
const GATED_PRIMITIVES  = new Set(['CONVERT', 'ALLOCATE']);

/** Old-spec primitives that are categorically dropped. */
const DEPRECATED_PRIMITIVES = new Set([
  'PROTECT', 'MOVE', 'SPEND', 'GROW', 'SAVE', 'EARN', 'INVEST',
]);

/** Thrown when a user requests a primitive not yet active in this version. */
export class PrimitiveDisabledError extends Error {
  constructor(public readonly primitive: string) {
    const friendly = GATED_PRIMITIVES.has(primitive)
      ? `${primitive.charAt(0)}${primitive.slice(1).toLowerCase()} is coming in the next version. ` +
        `Right now I can hold and show you your balance, or send funds to anyone.`
      : `That's not something I do yet. Right now I can hold and show you your ` +
        `balance, or send funds to anyone — what would you like to do?`;
    super(friendly);
    this.name = 'PrimitiveDisabledError';
  }
}

export interface StrategyContext {
  network:         'mainnet' | 'testnet';
  // SEND
  recipientType?:  MoveRecipientType;
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

  if (GATED_PRIMITIVES.has(primitive) || DEPRECATED_PRIMITIVES.has(primitive)) {
    throw new PrimitiveDisabledError(primitive);
  }

  if (primitive === 'SEND') {
    return buildSendPlan(intention, ufm, ctx.recipientType ?? 'claim', network);
  }

  throw new Error(
    `[strategy] Unknown primitive '${String(primitive)}'. Active: ${ACTIVE_PRIMITIVES.join(', ')}.`,
  );
}
