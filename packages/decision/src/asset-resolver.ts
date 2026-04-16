import type { UserFinancialModel } from '@intend/core';
import { resolveToken } from '@intend/skills';

// ── Types ─────────────────────────────────────────────────────────────────

export type ConversionRoute =
  | 'direct'        // already the right asset
  | 'stable_swap'   // stablecoin-to-stablecoin (near-zero slippage)
  | 'via_usdc'      // volatile → USDC → target
  | 'via_weth';     // volatile → WETH → target

export interface ConversionPath {
  route:           ConversionRoute;
  from_asset:      string;
  to_asset:        string;
  estimated_slip:  number;  // percentage, e.g. 0.05 = 0.05%
  protocol:        'aerodrome' | 'uniswap_v3';
}

export interface ResolvedAsset {
  asset:               string;
  amount_usd:          number;
  amount_raw:          string;   // human-readable with decimals
  conversion_required: boolean;
  conversion_path?:    ConversionPath;
}

export interface AssetResolutionResult {
  selected_assets:     ResolvedAsset[];
  net_amount_usd:      number;   // after conversion costs
  cost_breakdown: {
    conversion_fees_usd: number;
    gas_estimate_usd:    number;
    total_cost_usd:      number;
    total_cost_pct:      number;
  };
}

// ── Hard limits ────────────────────────────────────────────────────────────

const MAX_SLIPPAGE_PCT   = 0.5;   // reject if slippage > 0.5%
const MAX_COST_PCT       = 1.5;   // warn if total cost > 1.5%
const STABLE_SWAP_SLIP   = 0.02;  // 0.02% typical for stable pairs
const VOLATILE_SWAP_SLIP = 0.15;  // 0.15% estimate for volatile pairs

// ── Stable assets (no meaningful slippage risk) ───────────────────────────

const STABLECOINS = new Set(['USDC', 'USDT', 'DAI', 'sUSDe', 'USDY']);
const GOLD        = new Set(['XAUT', 'PAXG']);

// ── Main resolver ─────────────────────────────────────────────────────────

/**
 * Given a requested amount and target asset, determine which of the user's
 * balances to use and how to convert them.
 *
 * Preference order (from CLAUDE.md):
 * 1. Target asset already held — direct, no conversion
 * 2. Other stablecoins — stable swap, near-zero slippage
 * 3. Most liquid volatile assets — deepest Base pool
 * 4. FIFO for equal liquidity
 */
export function resolveAssets(
  targetAsset:  string,
  amountUsd:    number,
  ufm:          UserFinancialModel,
  network:      'mainnet' | 'testnet' = 'mainnet'
): AssetResolutionResult {
  const balances = ufm.present.balances;
  const target   = targetAsset.toUpperCase();

  // Find holdings in priority order
  const candidates = rankCandidates(balances, target);

  let remainingUsd     = amountUsd;
  const selectedAssets: ResolvedAsset[] = [];
  let totalConvFees    = 0;
  let totalGasEst      = 0;

  for (const candidate of candidates) {
    if (remainingUsd <= 0) break;

    const holdingUsd  = Number(candidate.usd_value ?? 0);
    const useUsd      = Math.min(holdingUsd, remainingUsd);
    const asset       = candidate.asset.toUpperCase();
    const needsConv   = asset !== target;
    const path        = needsConv
      ? buildConversionPath(asset, target)
      : undefined;

    if (path && path.estimated_slip > MAX_SLIPPAGE_PCT) {
      // Skip this asset — slippage too high
      continue;
    }

    const convFeePct  = path ? path.estimated_slip / 100 : 0;
    const convFeeUsd  = useUsd * convFeePct;
    const gasUsd      = needsConv ? 0.05 : 0.01; // sponsored; shown for transparency

    selectedAssets.push({
      asset,
      amount_usd:          useUsd,
      amount_raw:          toHuman(useUsd, asset, network),
      conversion_required: needsConv,
      ...(path ? { conversion_path: path } : {}),
    });

    totalConvFees += convFeeUsd;
    totalGasEst   += gasUsd;
    remainingUsd  -= useUsd;
  }

  if (remainingUsd > 0.01) {
    throw new InsufficientBalanceError(
      `Insufficient balance: need $${amountUsd.toFixed(2)}, ` +
      `available $${(amountUsd - remainingUsd).toFixed(2)}`
    );
  }

  const totalCostUsd = totalConvFees + totalGasEst;
  const totalCostPct = (totalCostUsd / amountUsd) * 100;

  return {
    selected_assets: selectedAssets,
    net_amount_usd:  amountUsd - totalConvFees,
    cost_breakdown: {
      conversion_fees_usd: totalConvFees,
      gas_estimate_usd:    totalGasEst,
      total_cost_usd:      totalCostUsd,
      total_cost_pct:      totalCostPct,
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function rankCandidates(
  balances: import('@intend/core').Balance[],
  targetAsset: string
): import('@intend/core').Balance[] {
  return [...balances].sort((a, b) => {
    const rankA = assetRank(a.asset.toUpperCase(), targetAsset);
    const rankB = assetRank(b.asset.toUpperCase(), targetAsset);
    if (rankA !== rankB) return rankA - rankB;
    return (b.usd_value ?? 0) - (a.usd_value ?? 0);
  });
}

function assetRank(asset: string, target: string): number {
  if (asset === target)              return 0;  // direct
  if (STABLECOINS.has(asset) && STABLECOINS.has(target)) return 1; // stable swap
  if (STABLECOINS.has(asset))       return 2;  // stable → volatile (via USDC)
  if (asset === 'ETH' || asset === 'WETH') return 3; // most liquid volatile
  if (GOLD.has(asset) && GOLD.has(target)) return 1; // gold swap
  return 4;                                          // other
}

function buildConversionPath(from: string, to: string): ConversionPath {
  const bothStable = STABLECOINS.has(from) && STABLECOINS.has(to);
  const bothGold   = GOLD.has(from) && GOLD.has(to);

  if (bothStable || bothGold) {
    return {
      route:          'stable_swap',
      from_asset:     from,
      to_asset:       to,
      estimated_slip: STABLE_SWAP_SLIP,
      protocol:       'aerodrome',
    };
  }

  if (from === 'ETH' || from === 'WETH') {
    return {
      route:          'direct',
      from_asset:     from,
      to_asset:       to,
      estimated_slip: VOLATILE_SWAP_SLIP,
      protocol:       'aerodrome',
    };
  }

  // Default: route via USDC
  return {
    route:          'via_usdc',
    from_asset:     from,
    to_asset:       to,
    estimated_slip: VOLATILE_SWAP_SLIP * 2, // two hops
    protocol:       'uniswap_v3',
  };
}

function toHuman(amountUsd: number, asset: string, network: 'mainnet' | 'testnet'): string {
  try {
    const token = resolveToken(asset, network);
    // Approximate: assume $1 = 1 unit for stables, $3000/ETH etc.
    // Actual quote from DEX always overrides this estimate.
    const usdPrice = getApproxPrice(asset);
    const units = amountUsd / usdPrice;
    return units.toFixed(token.decimals > 6 ? 6 : token.decimals);
  } catch {
    return amountUsd.toFixed(2);
  }
}

function getApproxPrice(asset: string): number {
  const prices: Record<string, number> = {
    USDC: 1, USDT: 1, DAI: 1, sUSDe: 1, USDY: 1,
    ETH: 3000, WETH: 3000,
    cbBTC: 65000, WBTC: 65000,
    XAUT: 2000, PAXG: 2000,
  };
  return prices[asset] ?? 1;
}

// ── Errors ────────────────────────────────────────────────────────────────

export class InsufficientBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export class SlippageExceededError extends Error {
  public readonly slippage_pct: number;
  constructor(slippage: number) {
    super(`Slippage ${slippage.toFixed(3)}% exceeds maximum ${MAX_SLIPPAGE_PCT}%`);
    this.name = 'SlippageExceededError';
    this.slippage_pct = slippage;
  }
}

export { MAX_SLIPPAGE_PCT, MAX_COST_PCT };
