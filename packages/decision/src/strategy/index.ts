import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { buildProtectPlan } from './protect.js';
import { buildGrowPlan }    from './grow.js';
import { buildConvertPlan } from './convert.js';
import { buildMovePlan }    from './move.js';
import { buildSavePlan }    from './save.js';
import { buildEarnPlan }    from './earn.js';
import { buildInvestPlan }  from './invest.js';
import { buildSpendPlan }   from './spend.js';
import type { MoveRecipientType } from './move.js';
import type { SpendResult }       from './spend.js';

export type { MoveRecipientType, SpendResult };

/**
 * Primitives disabled in v0.5. Strategy files remain — re-enable in v0.6 by
 * removing the primitive from this set. Zero other changes required.
 */
const DISABLED_PRIMITIVES = new Set(['GROW', 'SAVE', 'EARN', 'INVEST']);

/** Thrown when a user requests a primitive not yet active in this version. */
export class PrimitiveDisabledError extends Error {
  constructor(public readonly primitive: string) {
    super(
      `${primitive} is coming in the next version. Right now I can help you ` +
      `protect your savings, convert assets, send money, or spend.`
    );
    this.name = 'PrimitiveDisabledError';
  }
}

export interface StrategyContext {
  network:         'mainnet' | 'testnet';
  // MOVE / SEND
  recipientType?:  MoveRecipientType;
  // SAVE
  goalId?:         string;
  // EARN
  inboundAsset?:   string;
  inboundAmount?:  number;
  // SPEND
  resolvedAddress?:  string;
  ensName?:          string | null;
  isNewRecipient?:   boolean;
}

/**
 * Route an intention to the correct strategy generator.
 * Called by the bot pipeline after interpretIntent().
 *
 * Throws PrimitiveDisabledError for primitives gated in v0.5.
 */
export async function generatePlan(
  intention: IntentionObject,
  ufm:       UserFinancialModel,
  ctx:       StrategyContext
): Promise<ExecutionPlan> {
  const { primitive } = intention;
  const network = ctx.network ?? 'testnet';

  // Gate check — before routing
  if (DISABLED_PRIMITIVES.has(primitive)) {
    throw new PrimitiveDisabledError(primitive);
  }

  switch (primitive) {
    case 'PROTECT':
      return buildProtectPlan(intention, ufm, network);

    case 'CONVERT':
      return buildConvertPlan(intention, ufm, network);

    case 'MOVE':
      return buildMovePlan(
        intention,
        ufm,
        ctx.recipientType ?? 'claim',
        network
      );

    case 'SPEND':
      return buildSpendPlan(
        intention,
        ufm,
        ctx.resolvedAddress  ?? '',
        ctx.ensName          ?? null,
        ctx.isNewRecipient   ?? true,
        network
      );

    // Disabled — handled by gate above, but TypeScript needs these branches
    case 'GROW':
    case 'SAVE':
    case 'EARN':
    case 'INVEST':
      throw new PrimitiveDisabledError(primitive);

    default: {
      const _exhaustive: never = primitive;
      throw new Error(`Unknown primitive: ${String(_exhaustive)}`);
    }
  }
}

export {
  buildProtectPlan,
  buildGrowPlan,
  buildConvertPlan,
  buildMovePlan,
  buildSavePlan,
  buildEarnPlan,
  buildInvestPlan,
  buildSpendPlan,
};
