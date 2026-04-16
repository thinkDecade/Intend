/**
 * On-chain balance reader — Base chain
 *
 * RULE: Balances fetched fresh from chain for every UFM build.
 * Never use cached balance values for execution decisions.
 *
 * Supported assets (v0.5, Base):
 *   Native: ETH
 *   ERC-20: USDC, USDT, WETH, WBTC, DAI, XAUT
 */

import type { CdpEvmWalletProvider } from '@coinbase/agentkit';
import type { Balance } from '@intend/core';
import { getAssetPrice } from '@intend/signals';

type IntendNetwork = 'base' | 'base-sepolia';

// ERC-20 token addresses per network
const TOKEN_ADDRESSES: Record<IntendNetwork, Record<string, `0x${string}`>> = {
  'base': {
    USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    WETH: '0x4200000000000000000000000000000000000006',
    WBTC: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9',
    DAI:  '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    XAUT: '0x68B5f8D1cD3Bf8eEa11F0f2A0c17Cb2E74e9E7a', // placeholder — verify via EthSkills
  },
  'base-sepolia': {
    USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    WETH: '0x4200000000000000000000000000000000000006',
  },
};

// Token decimals
const TOKEN_DECIMALS: Record<string, number> = {
  USDC: 6, USDT: 6, WETH: 18, WBTC: 8, DAI: 18, XAUT: 6, ETH: 18,
};

// Minimal ERC-20 ABI for balanceOf
const ERC20_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs:  [{ name: 'account', type: 'address' }],
    outputs: [{ name: '',        type: 'uint256' }],
  },
] as const;

function fromDecimals(raw: bigint, decimals: number): number {
  return Number(raw) / Math.pow(10, decimals);
}

/**
 * Read all on-chain balances for a wallet.
 * Returns a Balance[] array suitable for UFM.present.balances.
 *
 * @param provider  - Active CdpEvmWalletProvider
 * @param network   - Which network to read from
 */
export async function readBalances(
  provider: CdpEvmWalletProvider,
  network: IntendNetwork = 'base-sepolia',
): Promise<Balance[]> {
  const address = provider.getAddress() as `0x${string}`;
  const tokens = TOKEN_ADDRESSES[network] ?? {};
  const balances: Balance[] = [];

  // 1. Native ETH balance
  const ethRaw = await provider.getBalance();
  const ethAmount = fromDecimals(ethRaw, 18);
  if (ethAmount > 0) {
    const ethPrice = await getAssetPrice('ETH').then((s) => s.usd_price).catch(() => 0);
    balances.push({
      asset:    'ETH',
      chain:    network,
      amount:   ethAmount,
      usd_value: ethAmount * ethPrice,
      protocol: null,
      apy:      null,
    });
  }

  // 2. ERC-20 balances — fetch in parallel
  const erc20Reads = Object.entries(tokens).map(async ([symbol, tokenAddress]) => {
    try {
      const raw = await provider.readContract({
        address:      tokenAddress,
        abi:          ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args:         [address],
      });

      const decimals = TOKEN_DECIMALS[symbol] ?? 18;
      const amount = fromDecimals(raw as bigint, decimals);
      if (amount <= 0) return null;

      // Stables are $1. Others fetch from signal engine.
      const isStable = ['USDC', 'USDT', 'DAI'].includes(symbol);
      const usdPrice = isStable
        ? 1.0
        : await getAssetPrice(symbol).then((s) => s.usd_price).catch(() => 0);

      return {
        asset:     symbol,
        chain:     network,
        amount,
        usd_value: amount * usdPrice,
        protocol:  null,
        apy:       null,
      } satisfies Balance;
    } catch {
      // Non-fatal — token may not exist on this network
      return null;
    }
  });

  const erc20Results = await Promise.all(erc20Reads);
  for (const b of erc20Results) {
    if (b) balances.push(b);
  }

  return balances;
}
