-- Migration 005a: Backfill ERP rows for existing users
--
-- For every user that does not yet have an ERP row, create one seeded from
-- their existing region + local_currency. Currency risk and political risk
-- are inferred from the country code via a small lookup. Income range,
-- risk tolerance and time horizon get conservative defaults — onboarding
-- (Phase 10) refines them later.

INSERT INTO economic_reality_profile (
  user_id,
  location_country,
  local_currency,
  currency_risk,
  political_risk,
  income_range,
  risk_tolerance,
  time_horizon,
  seed_source,
  last_seeded_at
)
SELECT
  u.user_id,
  COALESCE(u.region, 'GH'),
  COALESCE(u.local_currency, 'GHS'),
  CASE COALESCE(u.region, 'GH')
    -- High inflation / FX-volatile economies
    WHEN 'AR' THEN 'severe'::erp_currency_risk
    WHEN 'TR' THEN 'severe'::erp_currency_risk
    WHEN 'NG' THEN 'high'::erp_currency_risk
    WHEN 'GH' THEN 'high'::erp_currency_risk
    WHEN 'EG' THEN 'high'::erp_currency_risk
    WHEN 'PK' THEN 'high'::erp_currency_risk
    WHEN 'KE' THEN 'elevated'::erp_currency_risk
    WHEN 'ZA' THEN 'elevated'::erp_currency_risk
    WHEN 'BR' THEN 'elevated'::erp_currency_risk
    WHEN 'IN' THEN 'moderate'::erp_currency_risk
    WHEN 'PH' THEN 'moderate'::erp_currency_risk
    WHEN 'ID' THEN 'moderate'::erp_currency_risk
    WHEN 'MX' THEN 'moderate'::erp_currency_risk
    WHEN 'US' THEN 'low'::erp_currency_risk
    WHEN 'GB' THEN 'low'::erp_currency_risk
    WHEN 'EU' THEN 'low'::erp_currency_risk
    WHEN 'SG' THEN 'low'::erp_currency_risk
    WHEN 'AE' THEN 'low'::erp_currency_risk
    ELSE 'moderate'::erp_currency_risk
  END,
  CASE COALESCE(u.region, 'GH')
    WHEN 'AR' THEN 'elevated'::erp_political_risk
    WHEN 'TR' THEN 'elevated'::erp_political_risk
    WHEN 'NG' THEN 'elevated'::erp_political_risk
    WHEN 'GH' THEN 'moderate'::erp_political_risk
    WHEN 'EG' THEN 'elevated'::erp_political_risk
    WHEN 'PK' THEN 'high'::erp_political_risk
    WHEN 'KE' THEN 'moderate'::erp_political_risk
    WHEN 'ZA' THEN 'moderate'::erp_political_risk
    WHEN 'BR' THEN 'moderate'::erp_political_risk
    WHEN 'US' THEN 'low'::erp_political_risk
    WHEN 'GB' THEN 'low'::erp_political_risk
    WHEN 'SG' THEN 'low'::erp_political_risk
    WHEN 'AE' THEN 'low'::erp_political_risk
    ELSE 'moderate'::erp_political_risk
  END,
  'undisclosed'::erp_income_range,
  'balanced'::erp_risk_tolerance,
  'medium'::erp_time_horizon,
  'backfill'::erp_seed_source,
  NOW()
FROM users u
LEFT JOIN economic_reality_profile e ON e.user_id = u.user_id
WHERE e.user_id IS NULL;
