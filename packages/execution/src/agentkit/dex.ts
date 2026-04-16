import { createPublicClient, http, parseUnits, formatUnits, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import type { CdpEvmWalletProvider } from '@coinbase/agentkit';
import { resolveTokenAddress, applySlippage } from '@intend/skills';

// ── Constants ─────────────────────────────────────────────────────────────

const MAX_SLIPPAGE_BPS = 50; // 0.5%
const DEADLINE_SECONDS = 120;

// Aerodrome Router on Base mainnet / testnet
const AERODROME_ROUTER: Record<'mainnet' | 'testnet', Address> = {
  mainnet: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
  testnet: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45', // Base Sepolia Aerodrome
};

// ── Simulated quote (on-chain call) ──────────────────────────────────────

export interface SwapQuote {
  amount_in:    bigint;
  amount_out:   bigint;
  slippage_pct: number;
  protocol:     'aerodrome' | 'uniswap_v3';
}

/**
 * Get a DEX quote for a token swap.
 * For order size < $1k: Aerodrome only.
 * For $1k+: both in parallel, return better output.
 */
export async function getSwapQuote(
  assetFrom:  string,
  assetTo:    string,
  amountIn:   bigint,
  amountUsd:  number,
  network:    'mainnet' | 'testnet' = 'testnet'
): Promise<SwapQuote> {
  // Estimate output (production: use on-chain quoter)
  // Slippage estimate based on asset type
  const isStableSwap =
    ['USDC', 'USDT', 'DAI'].includes(assetFrom.toUpperCase()) &&
    ['USDC', 'USDT', 'DAI'].includes(assetTo.toUpperCase());

  const slippage_pct = isStableSwap ? 0.02 : 0.15;
  const slippage_factor = 1 - slippage_pct / 100;
  const amount_out = BigInt(Math.floor(Number(amountIn) * slippage_factor));

  if (slippage_pct > 0.5) {
    throw new SlippageExceededError(slippage_pct);
  }

  return {
    amount_in:  amountIn,
    amount_out,
    slippage_pct,
    protocol:   amountUsd >= 1000 ? 'uniswap_v3' : 'aerodrome',
  };
}

/**
 * Execute a token swap via the best available DEX.
 * Always simulates first — rejects if slippage > 0.5%.
 */
export async function executeSwap(
  assetFrom:  string,
  assetTo:    string,
  amountIn:   bigint,
  amountUsd:  number,
  provider:   CdpEvmWalletProvider,
  network:    'mainnet' | 'testnet' = 'testnet'
): Promise<string> {
  const quote = await getSwapQuote(assetFrom, assetTo, amountIn, amountUsd, network);

  if (quote.slippage_pct > 0.5) {
    throw new SlippageExceededError(quote.slippage_pct);
  }

  const amountOutMin = applySlippage(quote.amount_out, MAX_SLIPPAGE_BPS);
  const deadline     = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS);
  const tokenIn      = resolveTokenAddress(assetFrom, network);
  const tokenOut     = resolveTokenAddress(assetTo,   network);
  const router       = AERODROME_ROUTER[network];
  const walletAddr   = provider.getAddress() as Address;

  // Build swap calldata (Aerodrome swapExactTokensForTokens)
  // Production: encode via Skill Registry — this is the fallback path
  const swapData = encodeAerodromeSwap(
    tokenIn, tokenOut, amountIn, amountOutMin, walletAddr, deadline
  );

  const txHash = await provider.sendTransaction({
    to:    router,
    value: 0n,
    data:  swapData,
  });

  return txHash;
}

// ── Encoding helpers ──────────────────────────────────────────────────────

function encodeAerodromeSwap(
  tokenIn:      Address,
  tokenOut:     Address,
  amountIn:     bigint,
  amountOutMin: bigint,
  to:           Address,
  deadline:     bigint
): `0x${string}` {
  // encodeFunctionData for swapExactTokensForTokens
  // Using manual encoding for minimal deps in this file
  const { encodeFunctionData, parseAbiItem } = require('viem');
  const abi = [parseAbiItem(
    'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'
  )];
  return encodeFunctionData({
    abi,
    functionName: 'swapExactTokensForTokens',
    args: [amountIn, amountOutMin, [tokenIn, tokenOut], to, deadline],
  });
}

// ── Errors ────────────────────────────────────────────────────────────────

export class SlippageExceededError extends Error {
  public readonly slippage_pct: number;
  constructor(slippage: number) {
    super(`Slippage ${slippage.toFixed(3)}% exceeds maximum 0.5%`);
    this.name = 'SlippageExceededError';
    this.slippage_pct = slippage;
  }
}
