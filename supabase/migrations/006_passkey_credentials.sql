-- ============================================================
-- 006 — Passkey Credentials (Phase 13)
-- ------------------------------------------------------------
-- WebAuthn credentials per user. Email OTP remains the default;
-- passkeys are an opt-in stronger second auth path. A user may
-- register multiple authenticators (laptop Touch ID + phone
-- biometric + hardware key) — each gets its own row.
--
-- We also persist the in-flight challenge per user. WebAuthn
-- requires the server to verify that the response came from the
-- same challenge it issued. 5-min TTL enforced in the verify
-- handler (we just store ts and check there).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.passkey_credentials (
  -- Surrogate id — handy for inline-keyboard callbacks etc.
  credential_id_pk    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  user_id             UUID NOT NULL
                        REFERENCES public.users(user_id)
                        ON DELETE CASCADE,

  -- WebAuthn credential identifier (base64url string emitted by the authenticator).
  -- Looked up at every assertion, so unique + indexed.
  credential_id       TEXT NOT NULL UNIQUE,

  -- Public key bytes (CBOR-encoded COSE key) — verified against the assertion signature.
  public_key          BYTEA NOT NULL,

  -- Anti-cloning counter. Incremented on every assertion; if a value comes
  -- back lower than what we have, the credential may be cloned → reject.
  counter             BIGINT NOT NULL DEFAULT 0,

  -- Authenticator transports (usb / nfc / ble / internal / hybrid)
  -- so the browser can hint to the user where to look.
  transports          TEXT[] NOT NULL DEFAULT '{}',

  -- Optional human label so the user can see "MacBook Touch ID" in settings
  -- and revoke individual credentials.
  device_label        TEXT,

  -- Provenance + audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user
  ON public.passkey_credentials(user_id);

-- ── In-flight WebAuthn challenges ─────────────────────────────
-- Per-user, single-use. We overwrite on every new ceremony.
-- The challenge is consumed (deleted) by the verify handler.
CREATE TABLE IF NOT EXISTS public.passkey_challenges (
  user_id             UUID PRIMARY KEY
                        REFERENCES public.users(user_id)
                        ON DELETE CASCADE,
  challenge           TEXT NOT NULL,
  ceremony            TEXT NOT NULL CHECK (ceremony IN ('register','authenticate')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passkey_challenges  ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically; these policies cover the
-- anon-key WebApp client (which never reads these tables — auth flows
-- always go through server actions / route handlers running with the
-- service role). Locking down by default is the right posture.
-- auth.uid() resolves to users.webapp_uid, NOT users.user_id directly.
-- Use the same subquery shape as 001's per-user policies + 005 (ERP).
CREATE POLICY passkey_credentials_owner_select
  ON public.passkey_credentials FOR SELECT
  USING (
    user_id IN (SELECT user_id FROM public.users WHERE webapp_uid = auth.uid())
  );

CREATE POLICY passkey_challenges_owner_all
  ON public.passkey_challenges FOR ALL
  USING (
    user_id IN (SELECT user_id FROM public.users WHERE webapp_uid = auth.uid())
  );

-- ── Comments ──────────────────────────────────────────────────
COMMENT ON TABLE public.passkey_credentials IS 'Phase 13: WebAuthn credentials. One row per registered authenticator per user. Email OTP remains primary; passkeys are equal-prominence at signup.';
COMMENT ON TABLE public.passkey_challenges  IS 'Phase 13: In-flight WebAuthn challenges. Single-use, per-user, consumed by verify handler.';
