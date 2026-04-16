/**
 * Price Signal Engine
 *
 * Source: CoinMarketCap API (COINMARKETCAP_API_KEY — required)
 * TTL: 15 minutes
 * Max age: 30 minutes (2× TTL)
 *
 * For execution: always fetch fresh via getAssetPriceStrict().
 * For display/UFM: cached prices within TTL are fine.
 */

import { cacheSet, cacheGet, keys, TTL, MAX_AGE_MS, isFresh } from '@intend/data';
import type { PriceSignal } from './types.js';

// CoinMarketCap symbols for tracked assets
const CMC_SYMBOLS: Record<string, string> = {
  ETH:  'ETH',
  WETH: 'ETH',   // WETH tracks ETH 1:1
  BTC:  'BTC',
  WBTC: 'BTC',   // WBTC tracks BTC 1:1
  XAUT: 'XAUT',
  PAXG: 'PAXG',
};

// Stable assets — always $1.00, no API call needed
const STABLE_PRICES: Record<string, number> = {
  USDC: 1.00, USDT: 1.00, DAI: 1.00,
};

interface CmcQuote {
  price: number;
  last_updated: string;
}

interface CmcEntry {
  symbol: string;
  quote: { USD: CmcQuote };
}

interface CmcResponse {
  data: Record<string, CmcEntry>;
}

async function fetchCmcPrices(symbols: string[]): Promise<Record<string, number>> {
  const apiKey = process.env['COINMARKETCAP_API_KEY'];
  if (!apiKey) throw new Error('[prices] COINMARKETCAP_API_KEY is not set');

  // Deduplicate symbols (WETH and ETH both map to ETH)
  const unique = [...new Set(symbols)];
  const qs = unique.join(',');

  const res = await fetch(
    `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${qs}&convert=USD`,
    {
      headers: {
        'X-CMC_PRO_API_KEY': apiKey,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8_000),
    },
  );

  if (!res.ok) throw new Error(`CoinMarketCap responded ${res.status}`);
  const body = await res.json() as CmcResponse;

  const result: Record<string, number> = {};
  for (const [symbol, entry] of Object.entries(body.data)) {
    result[symbol] = entry.quote.USD.price;
  }
  return result;
}

/**
 * Get USD price for a single asset.
 * Returns cached value if fresh, fetches from CoinMarketCap if stale.
 */
export async function getAssetPrice(asset: string): Promise<PriceSignal> {
  if (asset in STABLE_PRICES) {
    return { asset, usd_price: STABLE_PRICES[asset]!, fetched_at: Date.now() };
  }

  const cacheKey = keys.price(asset);
  const cached = await cacheGet<PriceSignal>(cacheKey);

  if (cached && isFresh(cached.fetched_at, MAX_AGE_MS.PRICES)) {
    return cached.data;
  }

  const cmcSymbol = CMC_SYMBOLS[asset];
  if (!cmcSymbol) throw new Error(`[prices] Unknown asset: ${asset}`);

  let prices: Record<string, number>;
  try {
    prices = await fetchCmcPrices([cmcSymbol]);
  } catch (err) {
    if (cached) return cached.data; // serve stale on fetch failure
    throw err;
  }

  const usd_price = prices[cmcSymbol];
  if (usd_price === undefined) throw new Error(`[prices] No price returned for ${asset}`);

  const signal: PriceSignal = { asset, usd_price, fetched_at: Date.now() };
  await cacheSet(cacheKey, signal, TTL.PRICES);
  return signal;
}

/**
 * Get prices for multiple assets in a single CoinMarketCap call.
 * Stables resolved locally. Non-stables batched into one request.
 */
export async function getAssetPrices(assets: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const toFetch: string[] = [];

  for (const asset of assets) {
    if (asset in STABLE_PRICES) {
      result[asset] = STABLE_PRICES[asset]!;
      continue;
    }
    const cached = await cacheGet<PriceSignal>(keys.price(asset));
    if (cached && isFresh(cached.fetched_at, MAX_AGE_MS.PRICES)) {
      result[asset] = cached.data.usd_price;
    } else {
      toFetch.push(asset);
    }
  }

  if (toFetch.length > 0) {
    // Map each asset to its CMC symbol, deduplicate for the API call
    const cmcSymbols = [...new Set(toFetch.map((a) => CMC_SYMBOLS[a]).filter(Boolean) as string[])];
    const prices = await fetchCmcPrices(cmcSymbols);

    for (const asset of toFetch) {
      const cmcSymbol = CMC_SYMBOLS[asset];
      if (!cmcSymbol || !(cmcSymbol in prices)) continue;
      const usd_price = prices[cmcSymbol]!;
      result[asset] = usd_price;
      await cacheSet(keys.price(asset), { asset, usd_price, fetched_at: Date.now() }, TTL.PRICES);
    }
  }

  return result;
}

/**
 * Strict variant — throws if signal is beyond 2× TTL.
 * Always use this before execution, never for display.
 */
export async function getAssetPriceStrict(asset: string): Promise<PriceSignal> {
  if (asset in STABLE_PRICES) {
    return { asset, usd_price: STABLE_PRICES[asset]!, fetched_at: Date.now() };
  }

  const cached = await cacheGet<PriceSignal>(keys.price(asset));
  if (!cached) return getAssetPrice(asset);

  if (!isFresh(cached.fetched_at, MAX_AGE_MS.PRICES)) {
    throw new Error(
      `Price signal for ${asset} is stale. I'm missing current data. Try again in a moment.`
    );
  }
  return cached.data;
}
