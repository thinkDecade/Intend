/**
 * APY Signal Engine
 *
 * Source: DefiLlama Yields API (https://yields.llama.fi/pools — no API key required)
 * TTL: 6 hours
 * Max age: 12 hours (2× TTL)
 *
 * Tracked protocols on Base:
 *   - Aave V3 Base    (project: "aave-v3",  chain: "Base")
 *   - Morpho Base     (project: "morpho",   chain: "Base")
 *   - Moonwell Base   (project: "moonwell", chain: "Base")
 *
 * Filtered by project + chain + asset symbol — no hardcoded pool IDs.
 * DefiLlama pool UUIDs can change; project names are stable identifiers.
 */

import { cacheSet, cacheGet, keys, TTL, MAX_AGE_MS, isFresh } from '@intend/data';
import type { ApySignal, ProtocolApy } from './types.js';

// Protocols to track: project name as used by DefiLlama, mapped to our internal name
const TRACKED_PROTOCOLS: Array<{ llama_project: string; protocol: string }> = [
  { llama_project: 'aave-v3',  protocol: 'aave_v3'  },
  { llama_project: 'morpho',   protocol: 'morpho'   },
  { llama_project: 'moonwell', protocol: 'moonwell' },
];

// Assets to track for yield (stablecoins + ETH)
const TRACKED_ASSETS = new Set(['USDC', 'USDT', 'WETH', 'ETH', 'DAI']);

interface DefiLlamaPool {
  pool:       string;   // UUID
  chain:      string;   // e.g. "Base"
  project:    string;   // e.g. "aave-v3"
  symbol:     string;   // e.g. "USDC", "WETH-USDC" etc.
  tvlUsd:     number;
  apy:        number;
  apyBase?:   number;
  apyReward?: number;
}

interface DefiLlamaResponse {
  status: string;
  data:   DefiLlamaPool[];
}

async function fetchPoolData(): Promise<DefiLlamaPool[]> {
  const res = await fetch('https://yields.llama.fi/pools', {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`DefiLlama responded ${res.status}`);
  const body = await res.json() as DefiLlamaResponse;
  return body.data ?? [];
}

/**
 * Match a DefiLlama symbol to one of our tracked assets.
 * Handles cases like "USDC", "WETH", "WETH-USDC" (LP pools — skip).
 */
function matchAsset(symbol: string): string | null {
  // Skip LP pairs (contain hyphen)
  if (symbol.includes('-')) return null;
  const upper = symbol.toUpperCase();
  return TRACKED_ASSETS.has(upper) ? upper : null;
}

/**
 * Get APY data for all tracked Base protocol pools.
 * Returns cached value if fresh, fetches from DefiLlama if stale.
 */
export async function getApySignal(): Promise<ApySignal> {
  const cacheKey = keys.apy();
  const cached = await cacheGet<ApySignal>(cacheKey);

  if (cached && isFresh(cached.fetched_at, MAX_AGE_MS.APY)) {
    return cached.data;
  }

  let allPools: DefiLlamaPool[];
  try {
    allPools = await fetchPoolData();
  } catch (err) {
    if (cached) return cached.data; // serve stale on fetch failure
    throw err;
  }

  // Build set of llama_project names for fast lookup
  const trackedProjectMap = new Map(
    TRACKED_PROTOCOLS.map((t) => [t.llama_project, t.protocol]),
  );

  // Filter to Base chain + tracked protocols + single-asset pools with positive APY
  const protocols: ProtocolApy[] = [];
  for (const pool of allPools) {
    if (pool.chain !== 'Base') continue;

    const internalProtocol = trackedProjectMap.get(pool.project);
    if (!internalProtocol) continue;

    const asset = matchAsset(pool.symbol);
    if (!asset) continue;

    if (pool.apy <= 0 || pool.tvlUsd < 100_000) continue; // skip dust/empty pools

    protocols.push({
      protocol: internalProtocol,
      asset,
      chain:    'base',
      apy:      pool.apy,
      tvl:      pool.tvlUsd,
      pool_id:  pool.pool,
    });
  }

  // Sort by APY descending within each asset
  protocols.sort((a, b) => b.apy - a.apy);

  const signal: ApySignal = { protocols, fetched_at: Date.now() };
  await cacheSet(cacheKey, signal, TTL.APY);
  return signal;
}

/**
 * Get the best APY available across all tracked protocols for a given asset.
 */
export async function getBestApy(asset = 'USDC'): Promise<number> {
  const signal = await getApySignal();
  const apys = signal.protocols
    .filter((p) => p.asset === asset)
    .map((p) => p.apy);

  return apys.length > 0 ? Math.max(...apys) : 0;
}

/**
 * Strict variant — throws if signal is beyond 2× TTL.
 */
export async function getApySignalStrict(): Promise<ApySignal> {
  const cached = await cacheGet<ApySignal>(keys.apy());
  if (!cached) return getApySignal();

  if (!isFresh(cached.fetched_at, MAX_AGE_MS.APY)) {
    const ageH = Math.round((Date.now() - cached.fetched_at) / 3_600_000);
    throw new Error(
      `APY signal is stale (age ${ageH}h). I'm missing current data. Try again in a moment.`
    );
  }

  return cached.data;
}
