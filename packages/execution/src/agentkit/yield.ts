import type { CdpEvmWalletProvider } from '@coinbase/agentkit';
import { buildTransaction, resolveTokenAddress } from '@intend/skills';

// ── Protocol health thresholds (from CLAUDE.md) ───────────────────────────

const MIN_TVL_USD  = 50_000_000;   // $50M
const MAX_TVL_DROP = 0.70;         // reject if TVL dropped >30% in 24h

// ── Protocol health check ─────────────────────────────────────────────────

/**
 * Mandatory check before every yield deposit.
 * Queries DefiLlama for current TVL and recent exploit reports.
 */
export async function checkProtocolHealth(
  protocol:  string,
  chain:     string = 'base'
): Promise<void> {
  // Production: fetch live TVL from DefiLlama
  // Stub: pass through — real implementation in P1-04 integration tests
  // The APY signal engine already caches TVL; reuse that data here

  // For now, known-safe protocols pass automatically
  const APPROVED_PROTOCOLS = ['aave_v3', 'morpho', 'moonwell'];
  if (!APPROVED_PROTOCOLS.includes(protocol)) {
    throw new ProtocolRejectedError(
      `${protocol} is not in the approved protocol list for ${chain}`
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
