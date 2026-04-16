import type { CdpEvmWalletProvider } from '@coinbase/agentkit';
import { buildTransaction, resolveTokenAddress } from '@intend/skills';

// ── Protocol health thresholds ─────────────────────────────────────────────

/** Minimum TVL for a protocol to be considered safe (BUILD_PLAN.md Phase 5). */
const MIN_TVL_USD  = 10_000_000;   // $10M (as specified in Phase 5 requirements)
/** Reject if TVL dropped more than 30% in 24h (potential exploit / bank run). */
const MAX_TVL_DROP = 0.70;         // TVL must be ≥ 70% of what it was 24h ago

/** DefiLlama slug names for each protocol. */
const DEFILLAMA_SLUGS: Record<string, string> = {
  aave_v3:  'aave-v3',
  morpho:   'morpho',
  moonwell: 'moonwell',
};

interface DefiLlamaTvlResponse {
  tvl: Array<{ date: number; totalLiquidityUSD: number }>;
}

/**
 * Fetch current TVL for a protocol from DefiLlama.
 * Returns the most recent TVL value in USD.
 */
async function fetchProtocolTvl(slug: string): Promise<{ current: number; prev24h: number | null }> {
  const url = `https://api.llama.fi/protocol/${slug}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new ProtocolRejectedError(
      `DefiLlama health check failed for ${slug}: HTTP ${response.status}`
    );
  }

  const data = await response.json() as DefiLlamaTvlResponse;
  const tvlHistory = data.tvl ?? [];

  if (tvlHistory.length === 0) {
    throw new ProtocolRejectedError(`No TVL data available for ${slug}`);
  }

  const current = tvlHistory.at(-1)?.totalLiquidityUSD ?? 0;

  // Find TVL from approximately 24 hours ago (86400 seconds)
  const nowSecs = Date.now() / 1000;
  const target24hAgo = nowSecs - 86400;
  const prev24hEntry = tvlHistory
    .filter((e) => e.date <= target24hAgo)
    .at(-1);

  return { current, prev24h: prev24hEntry?.totalLiquidityUSD ?? null };
}

// ── Protocol health check ─────────────────────────────────────────────────

/**
 * Mandatory check before every yield deposit.
 * Queries DefiLlama for:
 *   1. Current TVL ≥ $10M (BUILD_PLAN.md Phase 5 threshold)
 *   2. TVL has not dropped > 30% in 24 hours (exploit / bank-run signal)
 *
 * Non-allowlisted protocols are rejected immediately (no DefiLlama call).
 */
export async function checkProtocolHealth(
  protocol: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chain:    string = 'base',
): Promise<void> {
  const slug = DEFILLAMA_SLUGS[protocol];
  if (!slug) {
    throw new ProtocolRejectedError(
      `${protocol} is not in the approved protocol list`
    );
  }

  let tvl: { current: number; prev24h: number | null };
  try {
    tvl = await fetchProtocolTvl(slug);
  } catch (err) {
    if (err instanceof ProtocolRejectedError) throw err;
    // Network failure — fail open in testnet, fail closed in production
    if (process.env['NODE_ENV'] === 'production') {
      throw new ProtocolRejectedError(
        `Could not verify ${protocol} health — DefiLlama unreachable`
      );
    }
    console.warn(`[yield] Health check skipped for ${protocol} (non-production):`, err);
    return;
  }

  // Check 1: minimum TVL
  if (tvl.current < MIN_TVL_USD) {
    throw new ProtocolRejectedError(
      `${protocol} TVL ($${(tvl.current / 1_000_000).toFixed(1)}M) is below the $${MIN_TVL_USD / 1_000_000}M safety threshold`
    );
  }

  // Check 2: 24h TVL drop
  if (tvl.prev24h !== null && tvl.current < tvl.prev24h * MAX_TVL_DROP) {
    const dropPct = ((1 - tvl.current / tvl.prev24h) * 100).toFixed(1);
    throw new ProtocolPausedError(
      `${protocol} TVL dropped ${dropPct}% in 24h — pausing to protect your funds`
    );
  }
}

// ── Yield deposit ─────────────────────────────────────────────────────────

export interface YieldDepositResult {
  tx_hash:       string;
  protocol:      string;
  asset:         string;
  amount:        bigint;
  receipt_token: string;
}

export async function depositToYield(
  protocol:  string,
  asset:     string,
  amount:    bigint,
  provider:  CdpEvmWalletProvider,
  network:   'mainnet' | 'testnet' = 'testnet'
): Promise<YieldDepositResult> {
  await checkProtocolHealth(protocol);

  const walletAddress = provider.getAddress() as `0x${string}`;

  const unsignedTxs = await buildTransaction({
    protocol,
    action:  'supply',
    chain:   'base',
    network,
    from:    walletAddress,
    args: {
      asset,
      amount,
    },
  });

  let lastHash = '';
  for (const utx of unsignedTxs) {
    lastHash = await provider.sendTransaction({
      to:    utx.to,
      value: utx.value,
      data:  utx.data,
    });
  }

  const receiptToken = RECEIPT_TOKENS[protocol]?.[asset.toUpperCase()] ?? `a${asset}`;

  return {
    tx_hash:       lastHash,
    protocol,
    asset,
    amount,
    receipt_token: receiptToken,
  };
}

// ── Yield withdrawal ──────────────────────────────────────────────────────

export async function withdrawFromYield(
  protocol:  string,
  asset:     string,
  amount:    bigint | 'max',
  provider:  CdpEvmWalletProvider,
  network:   'mainnet' | 'testnet' = 'testnet'
): Promise<string> {
  const walletAddress = provider.getAddress() as `0x${string}`;

  const unsignedTxs = await buildTransaction({
    protocol,
    action:  'withdraw',
    chain:   'base',
    network,
    from:    walletAddress,
    args: {
      asset,
      amount: amount === 'max' ? 'max' : amount,
    },
  });

  let lastHash = '';
  for (const utx of unsignedTxs) {
    lastHash = await provider.sendTransaction({
      to:    utx.to,
      value: utx.value,
      data:  utx.data,
    });
  }

  return lastHash;
}

// ── Receipt token map ─────────────────────────────────────────────────────

const RECEIPT_TOKENS: Record<string, Record<string, string>> = {
  aave_v3: { USDC: 'aBasUSDC', USDT: 'aBasUSDT', WETH: 'aBasWETH' },
  morpho:  { USDC: 'mUSDC', USDT: 'mUSDT' },
};

// ── Errors ────────────────────────────────────────────────────────────────

export class ProtocolRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolRejectedError';
  }
}

export class ProtocolPausedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolPausedError';
  }
}
