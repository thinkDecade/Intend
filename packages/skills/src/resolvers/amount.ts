import { parseUnits, maxUint256 } from 'viem';
import { resolveToken } from './token.js';

/** Convert a human-readable amount string to Wei (bigint). */
export function toWei(
  amount: string | number | bigint,
  symbol: string,
  network: 'mainnet' | 'testnet'
): bigint {
  if (typeof amount === 'bigint') return amount;
  if (amount === 'max' || amount === '-1') return maxUint256;

  const token = resolveToken(symbol, network);
  return parseUnits(String(amount), token.decimals);
}

/** Convert Wei back to a human decimal string (for logging only). */
export function fromWei(
  amount: bigint,
  decimals: number,
  precision = 6
): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac  = amount % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, precision);
  return `${whole}.${fracStr}`;
}

/** Apply a percentage slippage tolerance (bps). Returns minimum output. */
export function applySlippage(amount: bigint, slippageBps: number): bigint {
  return (amount * BigInt(10000 - slippageBps)) / 10000n;
}
