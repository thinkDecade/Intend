-- Migration 005: Economic Reality Profile (ERP)
--
-- The ERP captures the durable economic context of a user — the things that
-- rarely change session-to-session but heavily shape what advice is sensible:
-- where they live, what currency erodes their savings, how exposed they are to
-- political/economic shocks, what income range they sit in, how much risk
-- they're willing to tolerate, how long they're investing for.
--
-- The ERP is loaded once at the start of every conversation (Telegram, WebApp,
-- WhatsApp) and injected into the system prompt ahead of the live UFM. This
-- gives the agent stable "who is this person, economically" grounding before
-- it sees the volatile balance / FX / APY snapshot.
--
-- Spec reference: v0.5_final/v0.5_spec_final.md § Economic Reality Profile
--
-- Backfill: 005a (separate file) seeds existing users from their region +
-- local_currency. The seed_source column tracks how the row was created.
--
-- pgvector: enabled here so v0.6 can attach an erp_embedding without another
-- migration. The column is nullable and populated lazily.

-- ── Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ── Enums ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE erp_currency_risk AS ENUM ('low', 'moderate', 'elevated', 'high', 'severe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE erp_political_risk AS ENUM ('low', 'moderate', 'elevated', 'high', 'severe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE erp_income_range AS ENUM (
    'under_500_month',
    '500_2k_month',
    '2k_10k_month',
    '10k_50k_month',
    'over_50k_month',
    'undisclosed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE erp_risk_tolerance AS ENUM ('preservation', 'cautious', 'balanced', 'growth', 'aggressive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE erp_time_horizon AS ENUM ('immediate', 'short', 'medium', 'long', 'mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE erp_seed_source AS ENUM ('onboarding', 'inference', 'manual', 'backfill');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS economic_reality_profile (
  user_id              UUID PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,

  -- 1. Location
  location_country     VARCHAR(8)  NOT NULL,        -- ISO 3166-1 alpha-2
  location_region      TEXT,                        -- city / state, optional

  -- 2. Currency exposure
  local_currency       VARCHAR(8)  NOT NULL,        -- ISO 4217
  currency_risk        erp_currency_risk NOT NULL DEFAULT 'moderate',

  -- 3. Inflation context (annual %, derived from signals or self-reported)
  inflation_context_pct NUMERIC(6,2),

  -- 4. Political / macro risk
  political_risk       erp_political_risk NOT NULL DEFAULT 'moderate',

  -- 5. Income range (banded — never store exact figures here)
  income_range         erp_income_range NOT NULL DEFAULT 'undisclosed',

  -- 6. Risk tolerance (self-declared in onboarding)
  risk_tolerance       erp_risk_tolerance NOT NULL DEFAULT 'balanced',

  -- 7. Time horizon (primary investing horizon)
  time_horizon         erp_time_horizon NOT NULL DEFAULT 'medium',

  -- Provenance + freshness
  seed_source          erp_seed_source NOT NULL DEFAULT 'inference',
  last_seeded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_enriched_at     TIMESTAMPTZ,

  -- Reserved for v0.6 — semantic memory over conversation history
  erp_embedding        vector(1536),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_country  ON economic_reality_profile (location_country);
CREATE INDEX IF NOT EXISTS idx_erp_currency ON economic_reality_profile (local_currency);

-- updated_at trigger
CREATE OR REPLACE FUNCTION erp_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erp_updated_at ON economic_reality_profile;
CREATE TRIGGER trg_erp_updated_at
  BEFORE UPDATE ON economic_reality_profile
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE economic_reality_profile ENABLE ROW LEVEL SECURITY;

-- Users can read only their own ERP (auth.uid() must equal users.webapp_uid).
DROP POLICY IF EXISTS erp_select_own ON economic_reality_profile;
CREATE POLICY erp_select_own ON economic_reality_profile
  FOR SELECT
  USING (
    user_id IN (
      SELECT user_id FROM users WHERE webapp_uid = auth.uid()
    )
  );

-- Service role bypasses RLS (used by intelligence/erp-loader and backfill).
-- No INSERT/UPDATE/DELETE policy for end users — writes go through service role.

COMMENT ON TABLE  economic_reality_profile IS 'Durable economic context per user. Loaded once per session, injected into system prompt ahead of UFM.';
COMMENT ON COLUMN economic_reality_profile.erp_embedding IS 'Reserved for v0.6 semantic memory. Nullable until populated by enrichment pipeline.';
