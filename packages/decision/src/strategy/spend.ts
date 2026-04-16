import { getAddress, isAddress } from 'viem';
import type { UserFinancialModel, IntentionObject, ExecutionPlan } from '@intend/core';
import { resolveAssets } from '../asset-resolver.js';
import { checkPermission } from '../permission-gate.js';
import { makePlanId, makeStep, feeSummary } from './helpers.js';

// ── Security constants ────────────────────────────────────────────────────
// From CLAUDE.md security rules:
// - Full destination address always shown — never truncated
// - 6-char confirmation required for > $200 to new addresses
// - ENS shows both name AND resolved address
// - Invoice re-validated at execution time

const LARGE_AMOUNT_THRESHOLD = 200; // USD

export interface SpendResult extends ExecutionPlan {
  requires_address_confirmation: boolean;
  last_6_chars?: string;
}

export async function buildSpendPlan(
  intention:        IntentionObject,
  ufm:              UserFinancialModel,
  resolvedAddress:  string,       // checksummed EVM address or ENS-resolved address
  ensName:          string | null, // null if not ENS
  isNewRecipient:   boolean,
  network:          'mainnet' | 'testnet' = 'testnet'
): Promise<SpendResult> {
  const amountRaw  = intention.parameters.amount ?? 0;
  const amountUsd  = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;
  const assetFrom  = intention.parameters.asset_from ?? 'USDC';
  const permission = checkPermission(amountUsd, ufm, 'SPEND');

  if (!permission.allowed) throw new Error(permission.reason ?? 'Permission denied');

  // Validate address checksum
  if (!isAddress(resolvedAddress)) {
    throw new Error(`Invalid address: ${resolvedAddress}`);
  }
  const checksummedAddress = getAddress(resolvedAddress);

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
    name:        `Pay ${resolution.net_amount_usd.toFixed(2)} USDC`,
    protocol:    'erc20_transfer',
    action:      'transfer',
    description: `Pay ${resolution.net_amount_usd.toFixed(2)} USDC to ${checksummedAddress}`,
    args: {
      asset:  'USDC',
      amount: resolution.net_amount_usd.toFixed(6),
      to:     checksummedAddress,
    },
    network,
  }));

  const fees = feeSummary(amountUsd, steps.length);
  const needsAddressConfirm = amountUsd > LARGE_AMOUNT_THRESHOLD && isNewRecipient;
  const last6 = checksummedAddress.slice(-6);

  // Build confirmation preview — never truncate the address
  const recipientDisplay = ensName
    ? `${ensName}\n${checksummedAddress}`
    : checksummedAddress;

  const preview =
    `Pay $${amountUsd.toFixed(2)}\n\n` +
    `To: ${recipientDisplay}\n` +
    `You send: ${resolution.net_amount_usd.toFixed(2)} USDC\n` +
    `Fees: $${fees.total_usd.toFixed(2)}` +
    (needsAddressConfirm
      ? `\n\nEnter the last 6 characters of the address to confirm:\n${last6}`
      : '');

  return {
    plan_id:   makePlanId(),
    intention,
    user_id:   ufm.user_id ?? '',
    steps,
    confirmation_preview:           preview,
    fees,
    timing_estimate_seconds:        steps.length * 15,
    slippage_tolerance:             0.005,
    status:                         'pending',
    requires_address_confirmation:  needsAddressConfirm,
    ...(needsAddressConfirm ? { last_6_chars: last6 } : {}),
  };
}
