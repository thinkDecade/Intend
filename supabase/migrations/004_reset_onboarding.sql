-- 004_reset_onboarding.sql
-- Reset onboarding_completed for all existing users so they experience
-- the new onboarding flow. New users created after this migration will
-- start with onboarding_completed = FALSE (the column default).

UPDATE users SET onboarding_completed = FALSE;
