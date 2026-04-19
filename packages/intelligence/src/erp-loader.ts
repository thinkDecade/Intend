/**
 * ERP Loader — fetches the Economic Reality Profile at the start of every
 * conversation and, if missing, derives a sensible default from the user's
 * region + local_currency so the agent always has stable economic grounding.
 *
 * Called once per session by the orchestration layer (web/telegram/whatsapp
 * pipelines). The result is injected into the system prompt by
 * buildSystemPrompt() ahead of the live UFM.
 *
 * Spec: v0.5_final/v0.5_spec_final.md § Economic Reality Profile
 */

import {
  getERP,
  upsertERP,
  getUserById,
  type UserRow,
} from '@intend/data';
import type {
  EconomicRealityProfile,
  ErpCurrencyRisk,
  ErpPoliticalRisk,
} from '@intend/core';

/**
 * Country → (currency_risk, political_risk) lookup. Mirrors the backfill in
 * migration 005a so client-side derivation matches what we'd write to DB.
 * Conservative defaults ('moderate'/'moderate') for any country not listed.
 */
const COUNTRY_RISK: Record<string, { currency: ErpCurrencyRisk; political: ErpPoliticalRisk }> = {
  AR: { currency: 'severe',   political: 'elevated' },
  TR: { currency: 'severe',   political: 'elevated' },
  NG: { currency: 'high',     political: 'elevated' },
  GH: { currency: 'high',     political: 'moderate' },
  EG: { currency: 'high',     political: 'elevated' },
  PK: { currency: 'high',     political: 'high'     },
  KE: { currency: 'elevated', political: 'moderate' },
  ZA: { currency: 'elevated', political: 'moderate' },
  BR: { currency: 'elevated', political: 'moderate' },
  IN: { currency: 'moderate', political: 'moderate' },
  PH: { currency: 'moderate', political: 'moderate' },
  ID: { currency: 'moderate', political: 'moderate' },
  MX: { currency: 'moderate', political: 'moderate' },
  US: { currency: 'low',      political: 'low'      },
  GB: { currency: 'low',      political: 'low'      },
  EU: { currency: 'low',      political: 'low'      },
  SG: { currency: 'low',      political: 'low'      },
  AE: { currency: 'low',      political: 'low'      },
};

function deriveDefault(user: UserRow): EconomicRealityProfile {
  const country  = (user.region || 'GH').toUpperCase();
  const currency = (user.local_currency || 'GHS').toUpperCase();
  const risk     = COUNTRY_RISK[country] ?? { currency: 'moderate' as const, political: 'moderate' as const };
  const now      = new Date().toISOString();

  return {
    user_id:               user.user_id,
    location_country:      country,
    location_region:       null,
    local_currency:        currency,
    currency_risk:         risk.currency,
    inflation_context_pct: null,
    political_risk:        risk.political,
    income_range:          'undisclosed',
    risk_tolerance:        'balanced',
    time_horizon:          'medium',
    seed_source:           'inference',
    last_seeded_at:        now,
    last_enriched_at:      null,
    created_at:            now,
    updated_at:            now,
  };
}

export class ErpUserNotFoundError extends Error {
  constructor(userId: string) {
    super(`ERP loader: user not found: ${userId}`);
    this.name = 'ErpUserNotFoundError';
  }
}

/**
 * Load the ERP for a user. If no row exists yet, derive one from the user
 * profile, persist it (so future calls are consistent), and return the
 * inferred profile. The agent always receives a non-null ERP.
 *
 * Pass `persistOnDerive: false` to skip the write — useful in read-only
 * contexts (signal probes, test fixtures, dry-run pipelines).
 */
export async function loadERP(
  userId: string,
  options?: { persistOnDerive?: boolean },
): Promise<EconomicRealityProfile> {
  const existing = await getERP(userId);
  if (existing) return existing;

  const user = await getUserById(userId);
  if (!user) throw new ErpUserNotFoundError(userId);

  const derived = deriveDefault(user);

  if (options?.persistOnDerive !== false) {
    try {
      const persisted = await upsertERP(userId, {
        location_country:      derived.location_country,
        location_region:       derived.location_region,
        local_currency:        derived.local_currency,
        currency_risk:         derived.currency_risk,
        inflation_context_pct: derived.inflation_context_pct,
        political_risk:        derived.political_risk,
        income_range:          derived.income_range,
        risk_tolerance:        derived.risk_tolerance,
        time_horizon:          derived.time_horizon,
        seed_source:           'inference',
      });
      return persisted;
    } catch (err) {
      // Persistence failure is non-fatal — return derived in-memory copy so
      // the conversation can proceed. The next call will retry the write.
      console.warn(`[erp-loader] persist failed for ${userId}, returning in-memory derivation`, err);
      return derived;
    }
  }

  return derived;
}
