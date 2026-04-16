/**
 * Gas Signal Engine — Base chain
 *
 * CRITICAL RULE (CLAUDE.md):
 *   Gas estimates for display/UFM: cached with 5-minute TTL
 *   Gas estimates for EXECUTION: ALWAYS fetched fresh from RPC — NEVER use cache
 *
 * Source: Base RPC (BASE_RPC_URL or BASE_SEPOLIA_RPC_URL)
 * TTL: 5 minutes
 * Max age: 10 minutes (2× TTL)
 */

import { cacheSet, cacheGet, keys, TTL, MAX_AGE_MS, isFresh } from '@intend/data';
import type { GasSignal } from './types.js';

// Gas limits per operation type (estimated)
const GAS_LIMITS = {
  erc20_transfer: 65_000,
  dex_swap:       250_000,
  yield_deposit:  350_000,
} as const;

const ETH_GWEI = 1e9;
const ETH_USD_FALLBACK = 3200; // used only if price fetch fails

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const rpcUrl = process.env['BASE_RPC_URL'];
  if (!rpcUrl) throw new Error('[gas] BASE_RPC_URL is not set');

  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!res.ok) throw new Error(`[gas] RPC responded ${res.status}`);
  const body = await res.json() as JsonRpcResponse<T>;
  if (body.error) throw new Error(`[gas] RPC error: ${body.error.message}`);
  return body.result;
}

async function fetchFreshGasSignal(ethPriceUsd: number): Promise<GasSignal> {
  // Fetch baseFee from latest block
  const feeHistory = await rpcCall<{
    baseFeePerGas: string[];
    reward: string[][];
  }>('eth_feeHistory', [4, 'latest', [50]]);

  const latestBaseFee = parseInt(feeHistory.baseFeePerGas.at(-1) ?? '0', 16);
  const rewards = feeHistory.reward.map((r) => parseInt(r[0] ?? '0', 16));
  const medianReward = rewards.sort((a, b) => a - b)[Math.floor(rewards.length / 2)] ?? 0;

  const baseFeeGwei  = latestBaseFee / ETH_GWEI;
  const priorityGwei = medianReward  / ETH_GWEI;
  const maxFeeGwei   = baseFeeGwei * 1.5 + priorityGwei;

  const totalFeeGwei = baseFeeGwei + priorityGwei;
  const ethPerGwei   = 1e-9;

  const usdPerGas = totalFeeGwei * ethPerGwei * ethPriceUsd;

  return {
    base_fee_gwei:             baseFeeGwei,
    priority_fee_gwei:         priorityGwei,
    max_fee_gwei:              maxFeeGwei,
    estimated_transfer_usd:    usdPerGas * GAS_LIMITS.erc20_transfer,
    estimated_swap_usd:        usdPerGas * GAS_LIMITS.dex_swap,
    estimated_yield_usd:       usdPerGas * GAS_LIMITS.yield_deposit,
    fetched_at:                Date.now(),
  };
}

/**
 * Get gas estimates for display purposes (cached, 5-min TTL).
 */
export async function getGasSignal(ethPriceUsd?: number): Promise<GasSignal> {
  const cacheKey = keys.gas();
  const cached = await cacheGet<GasSignal>(cacheKey);

  if (cached && isFresh(cached.fetched_at, MAX_AGE_MS.GAS)) {
    return cached.data;
  }

  const price = ethPriceUsd ?? ETH_USD_FALLBACK;

  let signal: GasSignal;
  try {
    signal = await fetchFreshGasSignal(price);
  } catch (err) {
    if (cached) return cached.data;
    throw err;
  }

  await cacheSet(cacheKey, signal, TTL.GAS);
  return signal;
}

/**
 * Get gas estimates fresh from RPC — ALWAYS for execution.
 * NEVER use cached gas values when constructing a transaction.
 */
export async function getFreshGasForExecution(ethPriceUsd: number): Promise<GasSignal> {
  return fetchFreshGasSignal(ethPriceUsd);
}
