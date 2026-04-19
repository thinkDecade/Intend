-- ============================================================
-- INTEND — Apply pending migrations (005, 005a, 006)
--
-- Paste this into the Supabase SQL Editor and run once. All
-- statements are idempotent: re-running is a no-op.
--
-- Brings the live DB to the state expected by the v0.5_updated
-- code (ERP repo, onboarding agent, passkey routes).
-- ============================================================


-- ============================================================
-- 005 — Economic Reality Profile
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

DO $$ BEGIN CREATE TYPE erp_currency_risk  AS ENUM ('low','moderate','elevated','high','severe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE erp_political_risk AS ENUM ('low','moderate','elevated','high','severe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE erp_income_range   AS ENUM
  ('under_500_month','500_2k_month','2k_10k_month','10k_50k_month','over_50k_month','undisclosed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE erp_risk_tolerance AS ENUM
  ('preservation','cautious','balanced','growth','aggressive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE erp_time_horizon   AS ENUM
  ('immediate','short','medium','long','mixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE erp_seed_source    AS ENUM
  ('onboarding','inference','manual','backfill');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS economic_reality_profile (
  user_id              UUID PRIMARY KEY REFERENCES users (user_id) ON DELETE CASCADE,
  location_country     VARCHAR(8)  NOT NULL,
  location_region      TEXT,
  local_currency       VARCHAR(8)  NOT NULL,
  currency_risk        erp_currency_risk  NOT NULL DEFAULT 'moderate',
  inflation_context_pct NUMERIC(6,2),
  political_risk       erp_political_risk NOT NULL DEFAULT 'moderate',
  income_range         erp_income_range   NOT NULL DEFAULT 'undisclosed',
  risk_tolerance       erp_risk_tolerance NOT NULL DEFAULT 'balanced',
  time_horizon         erp_time_horizon   NOT NULL DEFAULT 'medium',
  seed_source          erp_seed_source    NOT NULL DEFAULT 'inference',
  last_seeded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_enriched_at     TIMESTAMPTZ,
  erp_embedding        vector(1536),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_erp_country  ON economic_reality_profile (location_country);
CREATE INDEX IF NOT EXISTS idx_erp_currency ON economic_reality_profile (local_currency);

CREATE OR REPLACE FUNCTION erp_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_erp_updated_at ON economic_reality_profile;
CREATE TRIGGER trg_erp_updated_at
  BEFORE UPDATE ON economic_reality_profile
  FOR EACH ROW EXECUTE FUNCTION erp_set_updated_at();

ALTER TABLE economic_reality_profile ENABLE ROW LEVEL SECURITY;

-- webapp_uid is UUID (matches the rest of 001's policies); auth.uid() is UUID too.
-- The original 005 had a stray ::text cast that produced "operator does not exist: uuid = text".
DROP POLICY IF EXISTS erp_select_own ON economic_reality_profile;
CREATE POLICY erp_select_own ON economic_reality_profile
  FOR SELECT
  USING (
    user_id IN (SELECT user_id FROM users WHERE webapp_uid = auth.uid())
  );

COMMENT ON TABLE  economic_reality_profile IS 'Durable economic context per user. Loaded once per session, injected into system prompt ahead of UFM.';
COMMENT ON COLUMN economic_reality_profile.erp_embedding IS 'Reserved for v0.6 semantic memory. Nullable until populated by enrichment pipeline.';


-- ============================================================
-- 005a — Backfill ERP from existing users
-- (no-op when there are no users — safe after a wipe)
-- ============================================================

INSERT INTO economic_reality_profile (
  user_id, location_country, local_currency,
  currency_risk, political_risk,
  income_range, risk_tolerance, time_horizon,
  seed_source, last_seeded_at
)
SELECT
  u.user_id,
  COALESCE(u.region, 'GH'),
  COALESCE(u.local_currency, 'GHS'),
  CASE COALESCE(u.region, 'GH')
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


-- ============================================================
-- 006 — Passkey credentials + challenges
-- ============================================================

CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  credential_id_pk    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  credential_id       TEXT NOT NULL UNIQUE,
  public_key          BYTEA NOT NULL,
  counter             BIGINT NOT NULL DEFAULT 0,
  transports          TEXT[] NOT NULL DEFAULT '{}',
  device_label        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user
  ON public.passkey_credentials(user_id);

CREATE TABLE IF NOT EXISTS public.passkey_challenges (
  user_id     UUID PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
  challenge   TEXT NOT NULL,
  ceremony    TEXT NOT NULL CHECK (ceremony IN ('register','authenticate')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_challenges  ENABLE ROW LEVEL SECURITY;

-- Re-runnable: drop-then-create. Note the auth.uid() ↔ users mapping
-- goes via webapp_uid (NOT user_id directly) — same shape as 001's
-- per-user policies and ERP above. Without the subquery these would
-- never match a real row even though the types align.
-- All passkey routes run server-side under the service role anyway,
-- which bypasses RLS — the policies are belt-and-braces.
DROP POLICY IF EXISTS passkey_credentials_owner_select ON public.passkey_credentials;
CREATE POLICY passkey_credentials_owner_select
  ON public.passkey_credentials FOR SELECT
  USING (
    user_id IN (SELECT user_id FROM public.users WHERE webapp_uid = auth.uid())
  );

DROP POLICY IF EXISTS passkey_challenges_owner_all ON public.passkey_challenges;
CREATE POLICY passkey_challenges_owner_all
  ON public.passkey_challenges FOR ALL
  USING (
    user_id IN (SELECT user_id FROM public.users WHERE webapp_uid = auth.uid())
  );

COMMENT ON TABLE public.passkey_credentials IS 'Phase 13: WebAuthn credentials. One row per registered authenticator per user. Email OTP remains primary; passkeys are equal-prominence at signup.';
COMMENT ON TABLE public.passkey_challenges  IS 'Phase 13: In-flight WebAuthn challenges. Single-use, per-user, consumed by verify handler.';


-- ============================================================
-- Verification — should print: erp / passkey_credentials / passkey_challenges all present, all 0 rows.
-- ============================================================
DO $$
DECLARE
  t TEXT;
  n BIGINT;
  candidates TEXT[] := ARRAY[
    'economic_reality_profile',
    'passkey_credentials',
    'passkey_challenges'
  ];
BEGIN
  FOREACH t IN ARRAY candidates LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
      RAISE NOTICE '✓ % present (% rows)', rpad(t, 28), n;
    ELSE
      RAISE WARNING '✗ % MISSING', t;
    END IF;
  END LOOP;
END $$;
