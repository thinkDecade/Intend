import type { UserFinancialModel, IntentionObject, ExecutionPlan, ExecutionStep } from '@intend/core';
import { resolveAssets } from '../asset-resolver.js';
import { checkPermission } from '../permission-gate.js';
import { makePlanId, makeStep, feeSummary } from './helpers.js';

// Protocol scoring weights (from CLAUDE.md)
// Score = (net_apy × 0.50) + (tvl_score × 0.25) + (age_score × 0.15) + (audit_score × 0.10)

interface ProtocolOption {
  name:        string;
  protocol:    string;
  action:      string;
  net_apy:     number;
  tvl_usd:     number;
  age_months:  number;
  audit_score: number;
}

const PROTOCOL_REGISTRY: ProtocolOption[] = [
  { name: 'Aave V3',  protocol: 'aave_v3', action: 'supply', net_apy: 0, tvl_usd: 500_000_000, age_months: 24, audit_score: 1.0 },
  { name: 'Morpho',   protocol: 'morpho',  action: 'supply', net_apy: 0, tvl_usd: 200_000_000, age_months: 18, audit_score: 0.9 },
];

function scoreProtocol(p: ProtocolOption, bestApy: number): number {
  const net_apy     = (p.net_apy || bestApy) - 0.004 - 0.0001; // minus intend spread + gas annualized
  const tvl_score   = p.tvl_usd > 500_000_000 ? 1.0 : p.tvl_usd > 100_000_000 ? 0.7 : 0;
  const age_score   = p.age_months > 24 ? 1.0 : p.age_months > 12 ? 0.7 : 0;
  const audit_score = p.audit_score;

  if (tvl_score === 0 || age_score === 0) return -1; // reject

  return (net_apy * 0.50) + (tvl_score * 0.25) + (age_score * 0.15) + (audit_score * 0.10);
}

export async function buildGrowPlan(
  intention: IntentionObject,
  ufm:       UserFinancialModel,
  network:   'mainnet' | 'testnet' = 'testnet'
): Promise<ExecutionPlan> {
  const amountRaw  = intention.parameters.amount ?? 100;
  const amountUsd  = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;
  const permission = checkPermission(amountUsd, ufm, 'GROW');

  if (!permission.allowed) throw new Error(permission.reason ?? 'Permission denied');

  const bestApy    = ufm.environment.best_apy ?? 0.05;
  const bestProto  = PROTOCOL_REGISTRY
    .map(p => ({ ...p, score: scoreProtocol(p, bestApy) }))
    .filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (!bestProto) throw new Error('No eligible protocol found for GROW');

  const resolution = resolveAssets('USDC', amountUsd, ufm, network);
  const steps: ExecutionStep[] = [];

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
    name:        `Deposit to ${bestProto.name}`,
    protocol:    bestProto.protocol,
    action:      bestProto.action,
    description: `Supply $${resolution.net_amount_usd.toFixed(2)} USDC to ${bestProto.name} — earning ~${(bestApy * 100).toFixed(1)}% APY`,
    args: { asset: 'USDC', amount: resolution.net_amount_usd.toFixed(6) },
    network,
  }));

  const fees = feeSummary(amountUsd, steps.length);

  return {
    plan_id:   makePlanId(),
    intention,
    user_id:   ufm.user_id ?? '',
    steps,
    confirmation_preview:
      `Grow $${amountUsd.toFixed(2)}\n\n` +
      `Protocol: ${bestProto.name}\n` +
      `APY: ~${(bestApy * 100).toFixed(1)}%\n` +
      `After fees: $${resolution.net_amount_usd.toFixed(2)}\n` +
      `Estimated annual yield: $${(resolution.net_amount_usd * bestApy).toFixed(2)}`,
    fees,
    timing_estimate_seconds: steps.length * 15,
    slippage_tolerance: 0.005,
    status: 'pending',
  };
}
