/**
 * Hedge Score Computation
 *
 * Formula from CLAUDE.md — do not modify without explicit direction.
 *
 * Score ranges:
 *   0.00–0.40  none      — No action
 *   0.40–0.65  monitor   — PROTECT recommended
 *   0.65–0.85  suggest   — PROTECT actively suggested
 *   > 0.85     emergency — Notify immediately
 */

import { cacheSet, cacheGet, keys, TTL, MAX_AGE_MS, isFresh } from '@intend/data';
import { getFxSignal } from './fx.js';
import type { FxSignal, HedgeSignal } from './types.js';

export interface HedgeComponents {
  fx_change_30d: number;      // percentage, negative = weakening
  fx_volatility_30d: number;  // percentage
  inflation_rate: number;     // annual percentage
}

export function computeHedgeScore(signals: HedgeComponents): number {
  const fx_component         = Math.max(0, -signals.fx_change_30d / 20);
  const inflation_component  = Math.max(0, (signals.inflation_rate - 5) / 75);
  const volatility_component = signals.fx_volatility_30d / 15;

  return Math.min(
    1.0,
    (fx_component         * 0.40) +
    (inflation_component  * 0.40) +
    (volatility_component * 0.20),
  );
}

function scoreToTier(score: number): HedgeSignal['tier'] {
  if (score > 0.85) return 'emergency';
  if (score > 0.65) return 'suggest';
  if (score > 0.40) return 'monitor';
  return 'none';
}

/**
 * Get the hedge signal for a region. Computes from FX signal + formula.
 * Cached separately with 4h TTL.
 */
export async function getHedgeSignal(region: string): Promise<HedgeSignal> {
  const cacheKey = keys.hedgeScore(region);
  const cached = await cacheGet<HedgeSignal>(cacheKey);

  if (cached && isFresh(cached.fetched_at, MAX_AGE_MS.HEDGE_SCORE)) {
    return cached.data;
  }

  const fx: FxSignal = await getFxSignal(region);

  const score = computeHedgeScore({
    fx_change_30d:    fx.fx_change_30d,
    fx_volatility_30d: fx.fx_volatility_30d,
    inflation_rate:   fx.inflation_rate,
  });

  const signal: HedgeSignal = {
    region,
    score,
    tier: scoreToTier(score),
    fetched_at: Date.now(),
  };

  await cacheSet(cacheKey, signal, TTL.HEDGE_SCORE);
  return signal;
}

/**
 * Strict variant — throws if beyond 2× TTL.
 */
export async function getHedgeSignalStrict(region: string): Promise<HedgeSignal> {
  const cached = await cacheGet<HedgeSignal>(keys.hedgeScore(region));
  if (!cached) return getHedgeSignal(region);

  const ageMs = Date.now() - cached.fetched_at;
  if (!isFresh(cached.fetched_at, MAX_AGE_MS.HEDGE_SCORE)) {
    throw new Error(
      `Hedge signal for ${region} is stale (age ${Math.round(ageMs / 60000)}min). ` +
      `I'm missing current data. Try again in a moment.`
    );
  }
  return cached.data;
}
