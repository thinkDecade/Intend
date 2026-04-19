/**
 * SEND strategy — v0.5_updated.
 *
 * Send/Spend is the merged primitive that ships in v0.5: USDC transfers on
 * Base, person-to-person OR person-to-merchant. The execution plan is the
 * same in both cases — an ERC-20 transfer with optional asset conversion
 * to USDC first.
 *
 * For v0.5 we route through the existing MOVE pipeline (which already
 * handles asset resolution, fee transparency, and permission gating).
 * MOVE/SPEND/PROTECT live on as deprecated primitives that the strategy
 * router rejects; SEND is the single user-facing surface.
 */
import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { buildMovePlan, type MoveRecipientType } from './move.js';

export async function buildSendPlan(
  intention:     IntentionObject,
  ufm:           UserFinancialModel,
  recipientType: MoveRecipientType = 'claim',
  network:       'mainnet' | 'testnet' = 'testnet',
): Promise<ExecutionPlan> {
  return buildMovePlan(intention, ufm, recipientType, network);
}
