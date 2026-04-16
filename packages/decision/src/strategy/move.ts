import { randomUUID } from 'crypto';
import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { resolveAssets } from '../asset-resolver.js';
import { checkPermission, checkRecipientPermission } from '../permission-gate.js';
import { makePlanId, makeStep, rateTransparency, feeSummary } from './helpers.js';

export type MoveRecipientType = 'intend_user' | 'crypto_address' | 'claim';

export async function buildMovePlan(
  intention:     IntentionObject,
  ufm:           UserFinancialModel,
  recipientType: MoveRecipientType = 'claim',
  network:       'mainnet' | 'testnet' = 'testnet'
): Promise<ExecutionPlan> {
  const amountRaw     = intention.parameters.amount ?? 50;
  const amountUsd     = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;
  const assetFrom     = intention.parameters.asset_from    ?? 'USDC';
  const recipientRaw  = intention.parameters.recipient_raw ?? '';
  const permission    = checkPermission(amountUsd, ufm, 'MOVE');
  const recipPerm     = checkRecipientPermission(ufm, recipientType !== 'intend_user');

  if (!permission.allowed) throw new Error(permission.reason ?? 'Permission denied');

  const resolution = resolveAssets('USDC', amountUsd, ufm, network);
  const steps = [];

  // Convert if needed
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

  if (recipientType === 'intend_user' || recipientType === 'crypto_address') {
    // Direct ERC-20 transfer
    steps.push(makeStep({
      name:        `Send $${amountUsd.toFixed(2)} USDC`,
      protocol:    'erc20_transfer',
      action:      'transfer',
      description: `Transfer ${resolution.net_amount_usd.toFixed(2)} USDC to ${recipientRaw}`,
      args: {
        asset:  'USDC',
        amount: resolution.net_amount_usd.toFixed(6),
        to:     recipientRaw,
      },
      network,
    }));
  } else {
    // Claim flow: funds sent to escrow / claim URL generated
    const claimToken = randomUUID();
    steps.push(makeStep({
      name:        'Create claim',
      protocol:    'erc20_transfer',
      action:      'transfer',
      description: `Send ${resolution.net_amount_usd.toFixed(2)} USDC to claim escrow`,
      args: {
        asset:       'USDC',
        amount:      resolution.net_amount_usd.toFixed(6),
        claim_token: claimToken,
        recipient:   recipientRaw,
        expires_in:  '259200', // 72 hours in seconds
      },
      network,
    }));
  }

  const fees = feeSummary(amountUsd, steps.length);
  const fxRate = ufm.environment.fx_rate ?? 1;

  const preview = rateTransparency({
    mid_market_rate: fxRate,
    spread_pct:      0.40,
    amount_from:     amountUsd,
    asset_from:      assetFrom,
    asset_to:        'USDC',
  });

  return {
    plan_id:   makePlanId(),
    intention,
    user_id:   ufm.user_id ?? '',
    steps,
    confirmation_preview:
      `Send $${amountUsd.toFixed(2)} to ${recipientRaw || 'recipient'}\n\n` +
      (assetFrom !== 'USDC' ? `${preview}\n\n` : '') +
      `They receive: $${resolution.net_amount_usd.toFixed(2)}\n` +
      `Fees: $${fees.total_usd.toFixed(2)}` +
      (recipientType === 'claim' ? '\n\nClaim link sent to recipient' : ''),
    fees,
    timing_estimate_seconds: steps.length * 15,
    slippage_tolerance: 0.005,
    status: 'pending',
  };
}
