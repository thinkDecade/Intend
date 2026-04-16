import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { resolveAssets } from '../asset-resolver.js';
import { checkPermission } from '../permission-gate.js';
import { makePlanId, makeStep, feeSummary } from './helpers.js';

export async function buildSavePlan(
  intention: IntentionObject,
  ufm:       UserFinancialModel,
  goalId:    string | undefined,
  network:   'mainnet' | 'testnet' = 'testnet'
): Promise<ExecutionPlan> {
  const amountRaw  = intention.parameters.amount ?? 100;
  const amountUsd  = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;
  const goalName   = intention.parameters.goal_name ?? 'Savings';
  const permission = checkPermission(amountUsd, ufm, 'SAVE');

  if (!permission.allowed) throw new Error(permission.reason ?? 'Permission denied');

  const bestApy    = ufm.environment.best_apy ?? 0.05;
  const resolution = resolveAssets('USDC', amountUsd, ufm, network);
  const steps      = [];

  for (const asset of resolution.selected_assets) {
    if (asset.conversion_required) {
      steps.push(makeStep({
        name:        `Convert ${asset.asset} → USDC`,
        protocol:    asset.conversion_path?.protocol ?? 'aerodrome',
        action:      'swap_exact_tokens_for_tokens',
        description: `Swap ${asset.amount_raw} ${asset.asset} to USDC`,
        args: { asset_from: asset.asset, asset: 'USDC', amount: asset.amount_raw },
        network,
      }));
    }
  }

  steps.push(makeStep({
    name:        `Deposit to ${goalName}`,
    protocol:    'aave_v3',
    action:      'supply',
    description:
      `Supply $${resolution.net_amount_usd.toFixed(2)} USDC to Aave V3 ` +
      `for "${goalName}" · ~${(bestApy * 100).toFixed(1)}% APY`,
    args: {
      asset:   'USDC',
      amount:  resolution.net_amount_usd.toFixed(6),
      goal_id: goalId ?? '',
    },
    network,
  }));

  const fees        = feeSummary(amountUsd, steps.length);
  const annualYield = resolution.net_amount_usd * bestApy;

  return {
    plan_id:   makePlanId(),
    intention,
    user_id:   ufm.user_id ?? '',
    steps,
    confirmation_preview:
      `Add $${amountUsd.toFixed(2)} to "${goalName}"\n\n` +
      `Earning ~${(bestApy * 100).toFixed(1)}% APY\n` +
      `Projected annual yield: +$${annualYield.toFixed(2)}\n` +
      `Fees: $${fees.total_usd.toFixed(2)}`,
    fees,
    timing_estimate_seconds: steps.length * 15,
    slippage_tolerance: 0.005,
    status: 'pending',
  };
}
