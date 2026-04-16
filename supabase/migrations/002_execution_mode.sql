-- Migration 002: execution_mode column
--
-- Replaces the three-value automation_level ('suggest'|'assisted'|'autonomous')
-- with a clean two-value execution_mode ('semi_autonomous'|'autonomous').
--
-- semi_autonomous (default): Intend presents a plan and waits for explicit confirmation.
-- autonomous:                Intend executes immediately; receipt sent after.
--
-- PROTECT is always semi_autonomous regardless of this setting (enforced in code).

-- 1. Add the new column with a safe default
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS execution_mode TEXT
    NOT NULL DEFAULT 'semi_autonomous'
    CHECK (execution_mode IN ('semi_autonomous', 'autonomous'));

-- 2. Migrate existing values from automation_level
UPDATE users SET execution_mode = 'autonomous'     WHERE automation_level = 'autonomous';
UPDATE users SET execution_mode = 'semi_autonomous' WHERE automation_level IN ('suggest', 'assisted');

-- 3. Keep automation_level for backward compat during transition; mark deprecated
COMMENT ON COLUMN users.automation_level IS 'Deprecated: use execution_mode instead.';
COMMENT ON COLUMN users.execution_mode   IS
  'Controls execution behaviour. semi_autonomous = confirms before acting. autonomous = executes immediately.';
