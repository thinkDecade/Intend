import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { resolveAssets } from '../asset-resolver.js';
import { checkPermission } from '../permission-gate.js';
import { makePlanId, makeStep, rateTransparency, feeSummary } from './helpers.js';

export async function buildInvestPlan(
  intention: IntentionObject,
  ufm:       UserFinancialModel,
  network:   'mainnet' | 'testnet' = 'testnet'
): Promise<ExecutionPlan> {
  const assetTo    = intention.parameters.asset_to ?? 'ETH';
  const amountRaw  = intention.parameters.amount ?? 100;
  const amountUsd  = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;
  const permission = checkPermission(amountUsd, ufm, 'INVEST');

  if (!permission.allowed) throw new Error(permission.reason ?? 'Permission denied');

  const resolution = resolveAssets('USDC', amountUsd, ufm, network);
  const steps      = [];

  // Convert holding → USDC if needed
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

  // USDC → target asset
  // Large orders ($10k+): inform user about potential split
  const protocol = amountUsd >= 10_000 ? 'uniswap_v3' : 'aerodrome';
  const action   = protocol === 'uniswap_v3'
    ? 'exact_input_single'
    : 'swap_exact_tokens_for_tokens';

  steps.push(makeStep({
    name:        `Buy ${assetTo}`,
    protocol,
    action,
    description: `Swap $${resolution.net_amount_usd.toFixed(2)} USDC → ${assetTo}`,
    args: {
      asset_from: 'USDC',
      asset:      assetTo,
      amount:     resolution.net_amount_usd.toFixed(6),
    },
    network,
  }));

  const fees   = feeSummary(amountUsd, steps.length);
  const fxRate = ufm.environment.fx_rate ?? 1;

  const preview = rateTransparency({
    mid_market_rate: 1 / fxRate,
    spread_pct:      0.40,
    amount_from:     resolution.net_amount_usd,
    asset_from:      'USDC',
    asset_to:        assetTo,
  });

  return {
    plan_id:   makePlanId(),
    intention,
    user_id:   ufm.user_id ?? '',
    steps,
    confirmation_preview:
      `Invest $${amountUsd.toFixed(2)} in ${assetTo}\n\n` +
      `${preview}\n\n` +
      `Fees: $${fees.total_usd.toFixed(2)}` +
      (amountUsd >= 10_000
        ? '\n\nNote: Large order — will split to minimise price impact'
        : ''),
    fees,
    timing_estimate_seconds: steps.length * 15,
    slippage_tolerance: 0.005,
    status: 'pending',
  };
}
