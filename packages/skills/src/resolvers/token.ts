import type { Address } from 'viem';
import type { TokenInfo } from '../types.js';

// ── Verified Base mainnet token addresses ──────────────────────────────────
// Source: verified on-chain. Update via new migration, never inline edit.

const BASE_MAINNET: Record<string, TokenInfo> = {
  USDC: { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,  chain_id: 8453 },
  USDT: { symbol: 'USDT', address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', decimals: 6,  chain_id: 8453 },
  DAI:  { symbol: 'DAI',  address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, chain_id: 8453 },
  WETH: { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, chain_id: 8453 },
  ETH:  { symbol: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, chain_id: 8453 },
  cbBTC:{ symbol: 'cbBTC',address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8,  chain_id: 8453 },
  WBTC: { symbol: 'WBTC', address: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', decimals: 8,  chain_id: 8453 }, // maps to cbBTC on Base
  XAUT: { symbol: 'XAUT', address: '0x9B8Df6E244526ab5F6e6400d331DB28C8fdDdb55', decimals: 6,  chain_id: 8453 },
};

// ── Base Sepolia testnet token addresses ───────────────────────────────────

const BASE_SEPOLIA: Record<string, TokenInfo> = {
  USDC: { symbol: 'USDC', address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', decimals: 6,  chain_id: 84532 },
  USDT: { symbol: 'USDT', address: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', decimals: 6,  chain_id: 84532 },
  WETH: { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, chain_id: 84532 },
  ETH:  { symbol: 'ETH',  address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18, chain_id: 84532 },
  DAI:  { symbol: 'DAI',  address: '0x7683022d84F726a96c4A6611cD31DBf5409c0Ac9', decimals: 18, chain_id: 84532 },
};

const NATIVE_ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address;

export function resolveToken(
  symbol: string,
  network: 'mainnet' | 'testnet'
): TokenInfo {
  const registry = network === 'mainnet' ? BASE_MAINNET : BASE_SEPOLIA;
  const upper = symbol.toUpperCase();
  const info = registry[upper];
  if (!info) {
    throw new Error(`[token-resolver] Unknown token "${symbol}" on ${network}`);
  }
  return info;
}

export function resolveTokenAddress(
  symbol: string,
  network: 'mainnet' | 'testnet'
): Address {
  return resolveToken(symbol, network).address;
}

export function isNativeEth(address: Address): boolean {
  return address.toLowerCase() === NATIVE_ETH.toLowerCase();
}

export function getChainId(network: 'mainnet' | 'testnet'): number {
  return network === 'mainnet' ? 8453 : 84532;
}
