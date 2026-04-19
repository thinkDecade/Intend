-- ============================================================
-- INTEND — Full user wipe
-- DANGER: deletes ALL user-scoped data from the database.
-- Run from Supabase SQL Editor (service role context) or psql.
--
-- What this does:
--   * TRUNCATE every table that holds user-derived rows, in dependency
--     order, with CASCADE. TRUNCATE bypasses BEFORE DELETE triggers,
--     so the append-only guards on event_log / revenue_events do
--     not block this script (which is intentional — we want a clean
--     slate, not an audit append).
--   * Leaves the schema, enums, RLS policies, and append-only triggers
--     intact. Migrations table is NOT touched.
--   * Does NOT delete from auth.users — that is handled by
--     scripts/wipe-users.ts (uses the admin SDK).
-- ============================================================

BEGIN;

-- Truncate every table that exists. Skips silently if a migration
-- hasn't been applied yet (e.g. 005 ERP or 006 passkeys not deployed).
-- CASCADE handles dependency order across whatever does exist.
DO $$
DECLARE
  t TEXT;
  candidates TEXT[] := ARRAY[
    'parallel_lanes',
    'event_log',
    'revenue_events',
    'signal_snapshots',
    'x402_events',
    'kyc_records',
    'confirmation_reminders',
    'claims',
    'life_horizons',
    'positions',
    'intents',
    'sessions',
    'wallets',
    'passkey_challenges',
    'passkey_credentials',
    'economic_reality_profile',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY candidates LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE %I RESTART IDENTITY CASCADE', t);
      RAISE NOTICE 'truncated %', t;
    ELSE
      RAISE NOTICE 'skipped % (table does not exist)', t;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verify counts (should all be zero). Tolerant of missing tables —
-- builds the UNION dynamically from whatever exists in `public`.
DO $$
DECLARE
  t TEXT;
  candidates TEXT[] := ARRAY[
    'users','wallets','sessions','intents','positions','life_horizons',
    'claims','confirmation_reminders','kyc_records','x402_events',
    'signal_snapshots','revenue_events','event_log','parallel_lanes',
    'economic_reality_profile','passkey_credentials','passkey_challenges'
  ];
  n BIGINT;
BEGIN
  FOREACH t IN ARRAY candidates LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('SELECT count(*) FROM %I', t) INTO n;
      RAISE NOTICE '% = %', rpad(t, 28), n;
    END IF;
  END LOOP;
END $$;
