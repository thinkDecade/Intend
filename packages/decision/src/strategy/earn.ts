import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { makePlanId, makeStep, feeSummary } from './helpers.js';

/**
 * EARN: detected inbound transfer → route to best yield automatically.
 * Called by the EARN detection service when an incoming transfer is confirmed.
 */
export async function buildEarnPlan(
  intention:    IntentionObject,
  ufm:          UserFinancialModel,
  inboundAsset: string,
  inboundAmount: number,
  network:      'mainnet' | 'testnet' = 'testnet'
): Promise<ExecutionPlan> {
  const bestApy = ufm.environment.best_apy ?? 0.05;
  const steps   = [];

  // If the inbound asset is already a stablecoin, deposit directly.
  // Otherwise convert to USDC first.
  const isStable = ['USDC', 'USDT', 'DAI'].includes(inboundAsset.toUpperCase());

  if (!isStable) {
    steps.push(makeStep({
      name:        `Convert ${inboundAsset} → USDC`,
      protocol:    'aerodrome',
      action:      'swap_exact_tokens_for_tokens',
      description: `Swap ${inboundAmount} ${inboundAsset} to USDC`,
      args: { asset_from: inboundAsset, asset: 'USDC', amount: String(inboundAmount) },
      network,
    }));
  }

  steps.push(makeStep({
    name:        'Grow inbound funds',
    protocol:    'aave_v3',
    action:      'supply',
    description: `Supply inbound USDC to Aave V3 — earning ~${(bestApy * 100).toFixed(1)}% APY`,
    args: { asset: 'USDC', amount: String(inboundAmount) },
    network,
  }));

  const fees = feeSummary(inboundAmount, steps.length);

  return {
    plan_id:   makePlanId(),
    intention,
    user_id:   ufm.user_id ?? '',
    steps,
    confirmation_preview:
      `You received ${inboundAmount} ${inboundAsset}\n\n` +
      `Route it to Aave V3 to earn ~${(bestApy * 100).toFixed(1)}% APY?\n` +
      `Fees: $${fees.total_usd.toFixed(2)}`,
    fees,
    timing_estimate_seconds: steps.length * 15,
    slippage_tolerance: 0.005,
    status: 'pending',
  };
}
