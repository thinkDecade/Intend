import type { UserFinancialModel } from '@intend/core';
import type { IntentionObject, ExecutionPlan, ExecutionStep } from '@intend/core';
import { resolveAssets } from '../asset-resolver.js';
import { checkPermission } from '../permission-gate.js';
import { makePlanId, makeStep, rateTransparency, feeSummary } from './helpers.js';

// ── Hedge tiers (from CLAUDE.md) ──────────────────────────────────────────
// 0.00–0.40: No action
// 0.40–0.65: USDC + Aave V3 yield
// 0.65–0.85: Split — stable yield + XAUT gold
// > 0.85:    Maximum protection — fastest path

export async function buildProtectPlan(
  intention: IntentionObject,
  ufm:       UserFinancialModel,
  network:   'mainnet' | 'testnet' = 'testnet'
): Promise<ExecutionPlan> {
  const hedgeScore  = ufm.environment.hedge_score ?? 0;
  const amountRaw   = intention.parameters.amount ?? ufm.present.total_usd_value * 0.5;
  const amountUsd   = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;
  const permission  = checkPermission(amountUsd, ufm, 'PROTECT');

  if (!permission.allowed) {
    throw new Error(permission.reason ?? 'Permission denied');
  }

  const steps: ExecutionStep[] = [];

  // ── Determine protection strategy based on hedge score ────────────────

  if (hedgeScore < 0.40 && !intention.parameters.amount) {
    throw new Error(
      `Your currency risk score is low (${(hedgeScore * 100).toFixed(0)}%). ` +
      `No protection needed right now.`
    );
  }

  if (hedgeScore <= 0.65) {
    // Tier 1: Convert to USDC + Aave V3 supply
    const resolution = resolveAssets('USDC', amountUsd, ufm, network);

    for (const asset of resolution.selected_assets) {
      if (asset.conversion_required) {
        steps.push(makeStep({
          name:        `Convert ${asset.asset} → USDC`,
          protocol:    asset.conversion_path?.protocol ?? 'aerodrome',
          action:      'swap_exact_tokens_for_tokens',
          description: `Swap ${asset.amount_raw} ${asset.asset} to USDC`,
          args: {
            asset_from: asset.asset,
            asset:      'USDC',
            amount:     asset.amount_raw,
          },
          network,
        }));
      }
    }

    steps.push(makeStep({
      name:        'Deposit USDC to Aave V3',
      protocol:    'aave_v3',
      action:      'supply',
      description: `Supply $${resolution.net_amount_usd.toFixed(2)} USDC to Aave V3 — earning ~${ufm.environment.best_apy?.toFixed(1) ?? '?'}% APY`,
      args: {
        asset:  'USDC',
        amount: resolution.net_amount_usd.toFixed(6),
      },
      network,
    }));

  } else if (hedgeScore <= 0.85) {
    // Tier 2: 70% stable yield + 30% XAUT gold
    const stableUsd = amountUsd * 0.70;
    const goldUsd   = amountUsd * 0.30;
    const stableRes = resolveAssets('USDC', stableUsd, ufm, network);
    const goldRes   = resolveAssets('XAUT', goldUsd,   ufm, network);

    for (const asset of stableRes.selected_assets) {
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
      name:        'Deposit USDC to Aave V3',
      protocol:    'aave_v3',
      action:      'supply',
      description: `Supply $${stableRes.net_amount_usd.toFixed(2)} USDC to Aave V3`,
      args: { asset: 'USDC', amount: stableRes.net_amount_usd.toFixed(6) },
      network,
    }));

    for (const asset of goldRes.selected_assets) {
      if (asset.conversion_required) {
        steps.push(makeStep({
          name:        `Convert ${asset.asset} → XAUT`,
          protocol:    'uniswap_v3',
          action:      'exact_input_single',
          description: `Swap ${asset.amount_raw} ${asset.asset} to XAUT (gold)`,
          args: { asset_from: asset.asset, asset: 'XAUT', amount: asset.amount_raw },
          network,
        }));
      }
    }

  } else {
    // Tier 3: Emergency — 100% to USDC as fast as possible
    const resolution = resolveAssets('USDC', amountUsd, ufm, network);

    for (const asset of resolution.selected_assets) {
      if (asset.conversion_required) {
        steps.push(makeStep({
          name:        `Emergency convert ${asset.asset} → USDC`,
          protocol:    'aerodrome',
          action:      'swap_exact_tokens_for_tokens',
          description: `Swap ${asset.amount_raw} ${asset.asset} to USDC`,
          args: { asset_from: asset.asset, asset: 'USDC', amount: asset.amount_raw },
          network,
        }));
      }
    }

    // Yield on what remains after conversion
    steps.push(makeStep({
      name:        'Deposit USDC to Aave V3',
      protocol:    'aave_v3',
      action:      'supply',
      description: `Supply $${resolution.net_amount_usd.toFixed(2)} USDC to Aave V3`,
      args: { asset: 'USDC', amount: resolution.net_amount_usd.toFixed(6) },
      network,
    }));
  }

  const fees = feeSummary(amountUsd, steps.length);

  return {
    plan_id:   makePlanId(),
    intention,
    user_id:   ufm.user_id ?? '',
    steps,
    confirmation_preview: buildPreview(hedgeScore, amountUsd, ufm, fees.total_usd),
    fees,
    timing_estimate_seconds: steps.length * 15,
    slippage_tolerance: 0.005,
    status: 'pending',
  };
}

function buildPreview(
  score:     number,
  amountUsd: number,
  ufm:       UserFinancialModel,
  feesUsd:   number
): string {
  const tier = score > 0.85
    ? 'Emergency protection'
    : score > 0.65
    ? 'Strong protection (yield + gold)'
    : 'Protection (yield)';

  const apy = ufm.environment.best_apy ?? 0;
  return (
    `${tier}\n\n` +
    `Protecting $${amountUsd.toFixed(2)} · ` +
    `Earning ~${apy.toFixed(1)}% APY on stable portion\n` +
    `Total fees: $${feesUsd.toFixed(2)}`
  );
}
