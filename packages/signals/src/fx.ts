/**
 * FX Signal Engine
 *
 * Sources:
 *   - Current rates:  ExchangeRate-API (EXCHANGE_RATE_API_KEY)
 *   - Inflation:      Static lookup table with quarterly updates
 *     (TradingEconomics API deferred — Phase 2 data enrichment)
 *
 * TTL: 4 hours (CLAUDE.md signal freshness)
 * Max age before abort: 8 hours (2× TTL)
 */

import { cacheSet, cacheGet, keys, TTL, MAX_AGE_MS, isFresh } from '@intend/data';
import type { FxSignal } from './types.js';

// ── Static inflation table (updated quarterly) ───────────────────────────
// Source: IMF / TradingEconomics. Phase 2 will auto-refresh from API.
const INFLATION_TABLE: Record<string, number> = {
  TR: 65.0, AR: 140.0, NG: 28.0, GH: 40.0, KE: 6.5,
  ZA: 5.5,  BR: 4.8,   EG: 35.0, PK: 20.0, BD: 9.0,
  GB: 2.6,  US: 3.2,   EU: 2.4,  JP: 2.8,  DE: 2.3,
  CA: 2.9,  AU: 3.6,   SG: 2.5,  AE: 4.0,  IN: 5.5,
};

export class FxFetchError extends Error {
  constructor(msg: string) { super(msg); this.name = 'FxFetchError'; }
}

export class FxStaleError extends Error {
  constructor(region: string, ageMs: number) {
    super(
      `FX signal for ${region} is stale (age ${Math.round(ageMs / 60000)}min). ` +
      `I'm missing current data. Try again in a moment.`
    );
    this.name = 'FxStaleError';
  }
}

interface ExchangeRateResponse {
  result: string;
  conversion_rates: Record<string, number>;
}

async function fetchFxRates(): Promise<Record<string, number>> {
  const apiKey = process.env['EXCHANGE_RATE_API_KEY'];
  if (!apiKey) throw new FxFetchError('EXCHANGE_RATE_API_KEY is not set');

  const res = await fetch(
    `https://v6.exchangerate-api.com/v6/${apiKey}/latest/USD`,
    { signal: AbortSignal.timeout(8_000) }
  );

  if (!res.ok) throw new FxFetchError(`ExchangeRate-API responded ${res.status}`);

  const body = await res.json() as ExchangeRateResponse;
  if (body.result !== 'success') throw new FxFetchError(`ExchangeRate-API error: ${body.result}`);

  return body.conversion_rates;
}

/** Currency code per region (ISO 3166-1 → ISO 4217) */
const CURRENCY_MAP: Record<string, string> = {
  TR: 'TRY', AR: 'ARS', NG: 'NGN', GH: 'GHS', KE: 'KES',
  ZA: 'ZAR', BR: 'BRL', EG: 'EGP', PK: 'PKR', BD: 'BDT',
  GB: 'GBP', US: 'USD', DE: 'EUR', EU: 'EUR', JP: 'JPY',
  CA: 'CAD', AU: 'AUD', SG: 'SGD', AE: 'AED', IN: 'INR',
};

/**
 * Get the FX signal for a given region.
 * Returns cached value if fresh. Refreshes from API if stale.
 * Throws FxStaleError if cache is beyond 2× TTL and API fetch fails.
 */
export async function getFxSignal(region: string): Promise<FxSignal> {
  const currency = CURRENCY_MAP[region] ?? 'USD';
  const cacheKey = keys.fx(region, currency);

  const cached = await cacheGet<FxSignal>(cacheKey);
  if (cached && isFresh(cached.fetched_at, MAX_AGE_MS.FX)) {
    return cached.data;
  }

  // Stale or missing — fetch fresh
  let rates: Record<string, number>;
  try {
    rates = await fetchFxRates();
  } catch (err) {
    // If we have stale data that's not yet at 2× TTL, use it
    if (cached) {
      const ageMs = Date.now() - cached.fetched_at;
      if (ageMs < MAX_AGE_MS.FX) return cached.data;
    }
    throw err;
  }

  const currentRate = rates[currency] ?? 1;

  // Approximate 30d trend from current rate vs cached rate
  // Phase 2 will use historical API endpoint for accurate 30d change
  const previousRate = cached?.data.fx_rate ?? currentRate;
  const fx_change_30d = previousRate !== 0
    ? ((previousRate - currentRate) / previousRate) * 100
    : 0;

  const trend: FxSignal['fx_trend'] =
    fx_change_30d < -2  ? 'weakening' :
    fx_change_30d > 2   ? 'strengthening' :
    'stable';

  const signal: FxSignal = {
    region,
    local_currency: currency,
    fx_rate:          currentRate,
    fx_trend:         trend,
    fx_change_30d:    fx_change_30d,
    fx_volatility_30d: Math.abs(fx_change_30d) * 0.3, // approximation
    inflation_rate:   INFLATION_TABLE[region] ?? 4.0,
    fetched_at:       Date.now(),
  };

  await cacheSet(cacheKey, signal, TTL.FX);
  return signal;
}

/**
 * Get FX signal from cache only. Throws FxStaleError if beyond max age.
 * Used by UFM builder with strict staleness enforcement.
 */
export async function getFxSignalStrict(region: string): Promise<FxSignal> {
  const currency = CURRENCY_MAP[region] ?? 'USD';
  const cached = await cacheGet<FxSignal>(keys.fx(region, currency));

  if (!cached) {
    // Not in cache — fetch live
    return getFxSignal(region);
  }

  const ageMs = Date.now() - cached.fetched_at;
  if (!isFresh(cached.fetched_at, MAX_AGE_MS.FX)) {
    throw new FxStaleError(region, ageMs);
  }

  return cached.data;
}
