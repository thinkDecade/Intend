import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { checkPermission } from '../permission-gate.js';
import { makePlanId, makeStep, rateTransparency, feeSummary } from './helpers.js';

export async function buildConvertPlan(
  intention: IntentionObject,
  ufm:       UserFinancialModel,
  network:   'mainnet' | 'testnet' = 'testnet'
): Promise<ExecutionPlan> {
  const assetFrom  = intention.parameters.asset_from ?? 'ETH';
  const assetTo    = intention.parameters.asset_to   ?? 'USDC';
  const amountRaw  = intention.parameters.amount ?? 100;
  const amountUsd  = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;
  const permission = checkPermission(amountUsd, ufm, 'CONVERT');

  if (!permission.allowed) throw new Error(permission.reason ?? 'Permission denied');

  // Routing: < $1k → Aerodrome, $1k+ → both quotes parallel, use best
  const protocol = amountUsd < 1000 ? 'aerodrome' : 'uniswap_v3';
  const action   = protocol === 'aerodrome'
    ? 'swap_exact_tokens_for_tokens'
    : 'exact_input_single';

  const fxRate   = ufm.environment.fx_rate ?? 1;
  const midRate  = 1 / fxRate; // approximate — real quote from DEX at execution

  const preview  = rateTransparency({
    mid_market_rate: midRate,
    spread_pct:      0.40, // Intend spread
    amount_from:     amountUsd / midRate,
    asset_from:      assetFrom,
    asset_to:        assetTo,
  });

  const steps = [
    makeStep({
      name:        `Swap ${assetFrom} → ${assetTo}`,
      protocol,
      action,
      description: `Convert ${assetFrom} to ${assetTo}`,
      args: {
        asset_from: assetFrom,
        asset:      assetTo,
        amount:     (amountUsd / midRate).toFixed(6),
      },
      network,
    }),
  ];

  const fees = feeSummary(amountUsd, steps.length);

  return {
    plan_id:   makePlanId(),
    intention,
    user_id:   ufm.user_id ?? '',
    steps,
    confirmation_preview: `Convert ${assetFrom} → ${assetTo}\n\n${preview}\n\nFees: $${fees.total_usd.toFixed(2)}`,
    fees,
    timing_estimate_seconds: 15,
    slippage_tolerance:      0.005,
    minimum_received:        String(amountUsd * 0.995),
    status: 'pending',
  };
}
