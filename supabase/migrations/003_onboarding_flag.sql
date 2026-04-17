-- 003_onboarding_flag.sql
-- Adds onboarding_completed to track whether the post-signup flow is done.
-- Existing users are considered complete so they are not forced through again.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Mark all existing users as already onboarded so the flag only triggers
-- for net-new sign-ups going forward.
UPDATE users SET onboarding_completed = TRUE WHERE onboarding_completed = FALSE;
