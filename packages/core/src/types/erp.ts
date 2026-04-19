/**
 * Economic Reality Profile (ERP)
 *
 * Durable economic context per user. Loaded once at the start of every
 * conversation and injected into the system prompt ahead of the live UFM.
 *
 * Spec: v0.5_final/v0.5_spec_final.md § Economic Reality Profile
 */

export type ErpCurrencyRisk   = 'low' | 'moderate' | 'elevated' | 'high' | 'severe';
export type ErpPoliticalRisk  = 'low' | 'moderate' | 'elevated' | 'high' | 'severe';

export type ErpIncomeRange =
  | 'under_500_month'
  | '500_2k_month'
  | '2k_10k_month'
  | '10k_50k_month'
  | 'over_50k_month'
  | 'undisclosed';

export type ErpRiskTolerance = 'preservation' | 'cautious' | 'balanced' | 'growth' | 'aggressive';
export type ErpTimeHorizon   = 'immediate' | 'short' | 'medium' | 'long' | 'mixed';
export type ErpSeedSource    = 'onboarding' | 'inference' | 'manual' | 'backfill';

export interface EconomicRealityProfile {
  user_id:               string;

  /** ISO 3166-1 alpha-2 country code */
  location_country:      string;
  /** Free-text region/city, optional */
  location_region:       string | null;

  /** ISO 4217 currency code */
  local_currency:        string;
  currency_risk:         ErpCurrencyRisk;

  /** Annual % inflation, derived or self-reported */
  inflation_context_pct: number | null;

  political_risk:        ErpPoliticalRisk;
  income_range:          ErpIncomeRange;
  risk_tolerance:        ErpRiskTolerance;
  time_horizon:          ErpTimeHorizon;

  seed_source:           ErpSeedSource;
  last_seeded_at:        string;       // ISO timestamp
  last_enriched_at:      string | null;

  created_at:            string;
  updated_at:            string;
}

/** Subset writable by callers (onboarding agent, manual settings, inference). */
export type EconomicRealityProfileInput = Partial<
  Omit<EconomicRealityProfile, 'user_id' | 'created_at' | 'updated_at' | 'last_seeded_at'>
> & {
  /** When omitted, repository sets to NOW() on insert. */
  last_seeded_at?: string;
};
