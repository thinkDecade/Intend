-- ============================================================
-- INTEND v0.5 — PRODUCTION DATABASE SCHEMA
-- Migration: 001_initial_schema
-- Chain scope: Base only
-- ============================================================
-- RULES:
--   1. Never ALTER TABLE manually — always add a new migration
--   2. event_log is append-only — no UPDATE or DELETE ever
--   3. revenue_events is append-only — same rule
--   4. All monetary amounts stored as NUMERIC(36,18) — never FLOAT
--   5. All timestamps are TIMESTAMPTZ — always UTC
--   6. UUIDs generated via gen_random_uuid() — never application-side
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- fuzzy text search on intents


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE channel_type AS ENUM (
  'telegram',
  'whatsapp',
  'web'
);

CREATE TYPE conversation_state AS ENUM (
  'idle',
  'clarifying',
  'confirming',
  'executing',
  'conflict',
  'parallel'
);

CREATE TYPE primitive_type AS ENUM (
  'PROTECT',
  'GROW',
  'INVEST',
  'SAVE',
  'MOVE',
  'SPEND',
  'EARN',
  'CONVERT'
);

CREATE TYPE intent_status AS ENUM (
  'pending',        -- awaiting clarification
  'confirmed',      -- user confirmed, queued for execution
  'executing',      -- transaction in flight
  'complete',       -- successfully executed
  'failed',         -- execution failed, rolled back
  'cancelled',      -- user cancelled or timed out
  'parked'          -- user set aside to handle later
);

CREATE TYPE position_status AS ENUM (
  'active',
  'withdrawing',
  'closed',
  'failed'
);

CREATE TYPE claim_status AS ENUM (
  'pending',        -- waiting for recipient to claim
  'claimed',        -- recipient has claimed
  'expired',        -- 72 hours elapsed, funds returned
  'returned'        -- funds returned to sender
);

CREATE TYPE kyc_tier AS ENUM (
  'tier_0',         -- phone verification only
  'tier_1',         -- name + country self-declaration
  'tier_2',         -- full document verification
  'tier_3'          -- enhanced due diligence
);

CREATE TYPE automation_level AS ENUM (
  'suggest',        -- Level 1: suggest only, no autonomous execution
  'assisted',       -- Level 2: autonomous up to $500, user confirms above
  'autonomous'      -- Level 3: full autonomous within hard limits
);

CREATE TYPE chain_id AS ENUM (
  'base',           -- primary execution chain
  'base_sepolia'    -- testnet
);

CREATE TYPE wallet_provider AS ENUM (
  'agentkit_cdp',   -- Coinbase AgentKit CDP
  'ows'             -- Open Wallet Standard
);

CREATE TYPE protocol_type AS ENUM (
  'wallet',         -- bare wallet, no protocol
  'aave_v3',        -- Aave V3 lending (Base)
  'aerodrome',      -- Aerodrome DEX (Base)
  'morpho',         -- Morpho lending (Base)
  'moonwell',       -- Moonwell lending (Base)
  'uniswap_v3',     -- Uniswap V3 (Base)
  'x402'            -- x402 micropayment
);

CREATE TYPE asset_symbol AS ENUM (
  -- Stablecoins
  'USDT',
  'USDC',
  'DAI',
  -- Hard assets
  'ETH',
  'BTC',
  'WBTC',
  -- Gold-backed
  'XAUT',
  'PAXG',
  -- Yield-bearing stables
  'sUSDe',
  'USDY',
  -- DeFi
  'WETH',
  -- Local fiat (off-chain delivery)
  'GHS',
  'NGN',
  'KES',
  'USD'
);

CREATE TYPE event_type AS ENUM (
  -- Intent lifecycle
  'intent_created',
  'intent_clarified',
  'intent_confirmed',
  'intent_cancelled',
  'intent_parked',
  'intent_resumed',
  -- Execution lifecycle
  'execution_started',
  'execution_step_complete',
  'execution_step_failed',
  'execution_complete',
  'execution_rolled_back',
  -- Position lifecycle
  'position_opened',
  'position_updated',
  'position_closed',
  -- User lifecycle
  'user_created',
  'wallet_created',
  'channel_linked',
  'kyc_updated',
  'automation_level_changed',
  -- Financial events
  'inbound_detected',
  'claim_created',
  'claim_claimed',
  'claim_expired',
  'claim_returned',
  'fee_charged',
  -- Signal events
  'hedge_score_updated',
  'protect_alert_triggered',
  -- System events
  'confirmation_sent',
  'reminder_sent',
  'plan_expired',
  'model_fallback_used',
  -- x402
  'x402_payment_sent',
  'x402_payment_received'
);


-- ============================================================
-- TABLE: users
-- One row per person. Identity is unified across all channels.
-- ============================================================

CREATE TABLE users (
  user_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Channel identifiers (set when user first contacts via each channel)
  telegram_id       BIGINT UNIQUE,
  whatsapp_id       VARCHAR(32) UNIQUE,    -- WhatsApp phone number in E.164
  webapp_uid        UUID UNIQUE,           -- Supabase Auth UUID

  -- Primary contact (at least one must be set)
  phone_number      VARCHAR(20) UNIQUE,    -- E.164 format, e.g. +233244123456
  email             VARCHAR(128) UNIQUE,

  -- Profile
  display_name      VARCHAR(128),
  intend_handle     VARCHAR(64) UNIQUE,    -- @handle for identity resolution

  -- Regional context
  region            VARCHAR(8)  NOT NULL DEFAULT 'GH',   -- ISO 3166-1 alpha-2
  local_currency    asset_symbol NOT NULL DEFAULT 'GHS',
  timezone          VARCHAR(64) NOT NULL DEFAULT 'Africa/Accra',
  preferred_language VARCHAR(8) NOT NULL DEFAULT 'en',

  -- Agent settings
  automation_level  automation_level NOT NULL DEFAULT 'suggest',
  kyc_tier          kyc_tier NOT NULL DEFAULT 'tier_0',
  preferred_channel channel_type,

  -- Hard limits (user-configurable, but only via deliberate settings action)
  max_auto_tx_usd   NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  require_confirm_new_recipient BOOLEAN NOT NULL DEFAULT TRUE,

  -- Consent
  terms_accepted_at TIMESTAMPTZ,
  terms_version     VARCHAR(16),           -- e.g. 'v1.0'
  aml_accepted_at   TIMESTAMPTZ,

  -- Metadata
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at    TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,

  -- Constraints
  CONSTRAINT users_at_least_one_contact
    CHECK (
      telegram_id IS NOT NULL OR
      whatsapp_id IS NOT NULL OR
      webapp_uid IS NOT NULL OR
      phone_number IS NOT NULL OR
      email IS NOT NULL
    )
);

-- Indexes
CREATE INDEX idx_users_telegram_id ON users (telegram_id) WHERE telegram_id IS NOT NULL;
CREATE INDEX idx_users_whatsapp_id ON users (whatsapp_id) WHERE whatsapp_id IS NOT NULL;
CREATE INDEX idx_users_phone ON users (phone_number) WHERE phone_number IS NOT NULL;
CREATE INDEX idx_users_handle ON users (intend_handle) WHERE intend_handle IS NOT NULL;
CREATE INDEX idx_users_region ON users (region);
CREATE INDEX idx_users_last_active ON users (last_active_at DESC);


-- ============================================================
-- TABLE: wallets
-- One row per chain per user. Multiple wallets per user allowed.
-- ============================================================

CREATE TABLE wallets (
  wallet_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,

  chain             chain_id NOT NULL,
  address           VARCHAR(64) NOT NULL,
  provider          wallet_provider NOT NULL DEFAULT 'agentkit_cdp',

  -- OWS-specific fields (populated when provider = 'ows')
  ows_wallet_id     VARCHAR(128) UNIQUE,   -- OWS local wallet identifier
  ows_policy_ids    TEXT[],                -- Applied OWS policy IDs

  -- AgentKit CDP fields
  cdp_wallet_id     VARCHAR(128) UNIQUE,

  is_primary        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, chain)
);

-- Indexes
CREATE INDEX idx_wallets_user_id ON wallets (user_id);
CREATE INDEX idx_wallets_address ON wallets (address);
CREATE INDEX idx_wallets_chain ON wallets (chain);


-- ============================================================
-- TABLE: sessions
-- Active conversation state per channel per user.
-- Redis is primary; this table is durable backup.
-- ============================================================

CREATE TABLE sessions (
  session_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  channel           channel_type NOT NULL,

  -- Conversation state machine
  state             conversation_state NOT NULL DEFAULT 'idle',

  -- CLARIFYING state data
  pending_intent_id UUID,                  -- FK set after intents row created
  missing_field     VARCHAR(64),           -- which field triggered clarification
  clarification_q   TEXT,                  -- the question asked
  clarified_at      TIMESTAMPTZ,

  -- CONFIRMING state data
  pending_plan      JSONB,                 -- full ExecutionPlan object
  plan_expires_at   TIMESTAMPTZ,
  reminders_sent    SMALLINT NOT NULL DEFAULT 0,
  last_reminder_at  TIMESTAMPTZ,

  -- CONFLICT state data
  parked_intent_id  UUID,                  -- FK to parked intent
  new_message_held  TEXT,                  -- message held during conflict

  -- Parallel lanes
  active_lane_ids   UUID[],               -- lane_ids currently running

  -- Conversation history (last 10 turns, kept in sync with Redis)
  history           JSONB NOT NULL DEFAULT '[]'::JSONB,
  -- Schema: [{ role: "user"|"assistant", content: "...", ts: ISO }]

  -- Session metadata
  last_active       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, channel)
);

-- Indexes
CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_state ON sessions (state) WHERE state != 'idle';
CREATE INDEX idx_sessions_plan_expires ON sessions (plan_expires_at)
  WHERE plan_expires_at IS NOT NULL;


-- ============================================================
-- TABLE: intents
-- Full lifecycle record for every intention across all channels.
-- ============================================================

CREATE TABLE intents (
  intent_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,

  -- Origin
  channel           channel_type NOT NULL,
  raw_input         TEXT NOT NULL,           -- exactly what the user said
  raw_input_language VARCHAR(8) DEFAULT 'en',

  -- Classification
  primitive         primitive_type NOT NULL,
  intent_confidence NUMERIC(4,3) NOT NULL,   -- 0.000 to 1.000
  intention_object  JSONB NOT NULL,          -- full IntentionObject

  -- Execution
  execution_plan    JSONB,                   -- ExecutionPlan when generated
  status            intent_status NOT NULL DEFAULT 'pending',

  -- Transaction results (populated on complete or failed)
  tx_hashes         TEXT[],                 -- all tx hashes in order
  execution_result  JSONB,                  -- final state, amounts, fees
  execution_error   TEXT,                   -- plain-language error if failed

  -- Rollback tracking
  rollback_required BOOLEAN NOT NULL DEFAULT FALSE,
  rollback_complete BOOLEAN NOT NULL DEFAULT FALSE,
  rollback_state    JSONB,                  -- snapshot before execution

  -- Parallel execution
  lane_id           UUID,                   -- which parallel lane if any
  capital_reserved  NUMERIC(36,18),         -- USDT amount locked for this intent

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at      TIMESTAMPTZ,
  executed_at       TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ,

  -- Model metadata
  model_used        VARCHAR(64),            -- which AI model classified this
  model_tier        VARCHAR(16)             -- 'primary'|'fallback1'|'fallback2'|'fast'
);

-- Indexes
CREATE INDEX idx_intents_user_id ON intents (user_id);
CREATE INDEX idx_intents_status ON intents (status)
  WHERE status NOT IN ('complete', 'cancelled');
CREATE INDEX idx_intents_primitive ON intents (primitive);
CREATE INDEX idx_intents_created ON intents (created_at DESC);
CREATE INDEX idx_intents_channel ON intents (channel);
CREATE INDEX idx_intents_raw_input_trgm ON intents
  USING gin (raw_input gin_trgm_ops);    -- fuzzy search on intent history


-- ============================================================
-- TABLE: positions
-- Active yield, investment, and staking positions on Base.
-- ============================================================

CREATE TABLE positions (
  position_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  intent_id         UUID REFERENCES intents (intent_id),

  -- What and where
  primitive         primitive_type NOT NULL,  -- GROW, SAVE, INVEST
  protocol          protocol_type NOT NULL,
  asset             asset_symbol NOT NULL,
  chain             chain_id NOT NULL,

  -- Amounts
  amount_deposited  NUMERIC(36,18) NOT NULL,
  amount_current    NUMERIC(36,18) NOT NULL,  -- updated on each yield accrual sync
  yield_earned      NUMERIC(36,18) NOT NULL DEFAULT 0,

  -- Rate information
  apy_at_entry      NUMERIC(8,4),             -- APY when position was opened
  current_apy       NUMERIC(8,4),             -- updated by monitoring loop

  -- Protocol-specific data
  protocol_address  VARCHAR(64),              -- contract address
  protocol_position_id VARCHAR(128),          -- protocol's internal position ID
  receipt_token     VARCHAR(64),              -- e.g. aUSDT for Aave

  -- SAVE goal link
  goal_id           UUID,                     -- FK to life_horizons if SAVE

  -- Status
  status            position_status NOT NULL DEFAULT 'active',

  -- Timestamps
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at    TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,

  -- Closing data
  amount_withdrawn  NUMERIC(36,18),
  close_tx_hash     VARCHAR(128)
);

-- Indexes
CREATE INDEX idx_positions_user_id ON positions (user_id);
CREATE INDEX idx_positions_status ON positions (status) WHERE status = 'active';
CREATE INDEX idx_positions_protocol ON positions (protocol);
CREATE INDEX idx_positions_chain ON positions (chain);
CREATE INDEX idx_positions_goal_id ON positions (goal_id) WHERE goal_id IS NOT NULL;


-- ============================================================
-- TABLE: life_horizons
-- Named goals for the SAVE primitive.
-- ============================================================

CREATE TABLE life_horizons (
  horizon_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,

  -- Goal definition
  goal_name         VARCHAR(128) NOT NULL,     -- "House fund", "School fees"
  target_amount     NUMERIC(18,2) NOT NULL,    -- in USD
  target_asset      asset_symbol NOT NULL DEFAULT 'USDT',
  target_date       DATE,                      -- optional deadline

  -- Progress
  current_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  contributions     NUMERIC(18,2) NOT NULL DEFAULT 0,  -- total deposited
  yield_earned      NUMERIC(18,2) NOT NULL DEFAULT 0,  -- yield portion

  -- Trajectory (updated weekly by monitoring loop in Phase 2)
  on_track          BOOLEAN,
  projected_date    DATE,
  required_monthly  NUMERIC(10,2),             -- to stay on track

  -- Status
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_horizons_user_id ON life_horizons (user_id);
CREATE INDEX idx_horizons_active ON life_horizons (user_id)
  WHERE is_active = TRUE;


-- ============================================================
-- TABLE: claims
-- Claim-based transfers for non-user recipients.
-- ============================================================

CREATE TABLE claims (
  claim_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id         UUID NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  intent_id         UUID NOT NULL REFERENCES intents (intent_id),

  -- What is being claimed
  amount            NUMERIC(36,18) NOT NULL,
  asset             asset_symbol NOT NULL DEFAULT 'USDT',
  source_chain      chain_id NOT NULL,
  escrow_tx_hash    VARCHAR(128),              -- tx that locked funds in escrow
  escrow_address    VARCHAR(64),               -- escrow contract address

  -- Recipient info (as provided by sender)
  recipient_contact VARCHAR(128) NOT NULL,     -- phone, email, or handle
  recipient_channel VARCHAR(16),               -- 'sms' | 'telegram' | 'whatsapp'
  sender_note       VARCHAR(256),              -- optional message from sender

  -- Claim mechanics
  claim_token       VARCHAR(128) UNIQUE NOT NULL,  -- UUID v4, single-use
  claim_url         VARCHAR(256),
  status            claim_status NOT NULL DEFAULT 'pending',

  -- Delivery to claimer
  claimed_by        UUID REFERENCES users (user_id),
  delivery_method   VARCHAR(32),              -- 'intend_wallet'|'mobile_money'|'bank'
  delivery_address  VARCHAR(128),             -- phone or account number
  delivery_tx_hash  VARCHAR(128),

  -- Timing
  expires_at        TIMESTAMPTZ NOT NULL,      -- created_at + 72 hours
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at        TIMESTAMPTZ,
  returned_at       TIMESTAMPTZ,
  return_tx_hash    VARCHAR(128)
);

-- Indexes
CREATE INDEX idx_claims_sender_id ON claims (sender_id);
CREATE INDEX idx_claims_token ON claims (claim_token);
CREATE INDEX idx_claims_status ON claims (status) WHERE status = 'pending';
CREATE INDEX idx_claims_expires ON claims (expires_at)
  WHERE status = 'pending';


-- ============================================================
-- TABLE: confirmation_reminders
-- Scheduled reminders for pending confirmation flows.
-- ============================================================

CREATE TABLE confirmation_reminders (
  reminder_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id         UUID NOT NULL REFERENCES intents (intent_id),
  user_id           UUID NOT NULL REFERENCES users (user_id),
  channel           channel_type NOT NULL,

  -- Reminder schedule
  reminder_number   SMALLINT NOT NULL,         -- 1, 2, 3
  scheduled_for     TIMESTAMPTZ NOT NULL,
  sent_at           TIMESTAMPTZ,
  is_sent           BOOLEAN NOT NULL DEFAULT FALSE,

  -- Message
  message_text      TEXT NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_reminders_due ON confirmation_reminders (scheduled_for)
  WHERE is_sent = FALSE;
CREATE INDEX idx_reminders_intent ON confirmation_reminders (intent_id);


-- ============================================================
-- TABLE: kyc_records
-- KYC verification history per user.
-- ============================================================

CREATE TABLE kyc_records (
  kyc_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,

  tier              kyc_tier NOT NULL,
  status            VARCHAR(16) NOT NULL,      -- 'pending'|'approved'|'rejected'

  -- Verification method
  provider          VARCHAR(64),               -- KYC provider name
  provider_ref      VARCHAR(128),              -- provider's reference ID
  verification_type VARCHAR(32),               -- 'phone'|'selfie'|'document'|'edd'

  -- Self-declaration (tier_1)
  declared_name     VARCHAR(128),
  declared_country  VARCHAR(8),                -- ISO 3166-1 alpha-2

  -- Document verification (tier_2+)
  document_type     VARCHAR(32),               -- 'national_id'|'passport'|'drivers'
  document_country  VARCHAR(8),

  -- Result
  approved_at       TIMESTAMPTZ,
  rejected_at       TIMESTAMPTZ,
  rejection_reason  TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_kyc_user_id ON kyc_records (user_id);
CREATE INDEX idx_kyc_status ON kyc_records (status) WHERE status = 'pending';


-- ============================================================
-- TABLE: x402_events
-- Records of all x402 micropayments sent and received.
-- ============================================================

CREATE TABLE x402_events (
  event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,

  direction         VARCHAR(8) NOT NULL,       -- 'sent' | 'received'
  amount            NUMERIC(36,18) NOT NULL,
  asset             asset_symbol NOT NULL DEFAULT 'USDC',
  chain             chain_id NOT NULL DEFAULT 'base',

  -- Counterparty
  service_name      VARCHAR(128),              -- e.g. 'TradingEconomics'
  service_url       VARCHAR(256),
  endpoint          VARCHAR(256),

  -- Transaction
  tx_hash           VARCHAR(128),
  status            VARCHAR(16) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'complete' | 'failed'

  -- What was purchased/sold
  resource_type     VARCHAR(64),               -- 'signal_data'|'api_call'|'service'
  resource_id       VARCHAR(128),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at        TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_x402_user_id ON x402_events (user_id);
CREATE INDEX idx_x402_direction ON x402_events (direction);
CREATE INDEX idx_x402_created ON x402_events (created_at DESC);


-- ============================================================
-- TABLE: signal_snapshots
-- Periodic snapshots of signal state per user region.
-- Used for hedge score auditing and signal accuracy analysis.
-- ============================================================

CREATE TABLE signal_snapshots (
  snapshot_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users (user_id) ON DELETE SET NULL,
  region            VARCHAR(8) NOT NULL,
  local_currency    asset_symbol NOT NULL,

  -- Signal values at snapshot time
  fx_rate           NUMERIC(18,8),             -- local/USD
  fx_change_7d      NUMERIC(8,4),              -- % change over 7 days
  fx_change_30d     NUMERIC(8,4),              -- % change over 30 days
  fx_trend          VARCHAR(16),               -- 'weakening'|'stable'|'strengthening'

  inflation_rate    NUMERIC(8,4),              -- annual %
  real_interest_rate NUMERIC(8,4),             -- nominal - inflation

  best_apy_base     NUMERIC(8,4),              -- best safe yield on Base

  -- Computed scores
  fx_signal         NUMERIC(4,3),              -- 0.0 to 1.0
  macro_signal      NUMERIC(4,3),              -- 0.0 to 1.0
  hedge_score       NUMERIC(4,3),              -- 0.0 to 1.0

  captured_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_snapshots_user_id ON signal_snapshots (user_id);
CREATE INDEX idx_snapshots_region ON signal_snapshots (region, captured_at DESC);
CREATE INDEX idx_snapshots_captured ON signal_snapshots (captured_at DESC);


-- ============================================================
-- TABLE: revenue_events
-- Immutable record of every fee event.
-- ============================================================

CREATE TABLE revenue_events (
  event_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE RESTRICT,
  intent_id         UUID REFERENCES intents (intent_id),
  position_id       UUID REFERENCES positions (position_id),

  -- Fee classification
  primitive         primitive_type NOT NULL,
  mechanism         VARCHAR(32) NOT NULL,
  -- 'spread'|'yield_share'|'interchange'|'float_yield'|'x402'

  -- Amounts
  gross_tx_value    NUMERIC(36,18) NOT NULL,   -- total transaction size
  gross_tx_asset    asset_symbol NOT NULL,

  intend_fee_amount NUMERIC(36,18) NOT NULL,   -- Intend's portion
  intend_fee_asset  asset_symbol NOT NULL,
  intend_fee_pct    NUMERIC(8,6) NOT NULL,     -- e.g. 0.004000 = 0.40%

  user_received     NUMERIC(36,18),            -- what user got after fees
  user_received_asset asset_symbol,

  protocol_fee      NUMERIC(36,18),            -- protocol's portion (e.g. Aave reserve)
  gas_cost_sponsored NUMERIC(36,18),           -- gas Intend absorbed

  net_revenue       NUMERIC(36,18) NOT NULL,   -- intend_fee - gas_sponsored

  -- Chain context
  chain             chain_id NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO UPDATE, NO DELETE — enforced via RLS
);

-- Indexes
CREATE INDEX idx_revenue_user_id ON revenue_events (user_id);
CREATE INDEX idx_revenue_primitive ON revenue_events (primitive);
CREATE INDEX idx_revenue_created ON revenue_events (created_at DESC);
CREATE INDEX idx_revenue_mechanism ON revenue_events (mechanism);


-- ============================================================
-- TABLE: event_log
-- IMMUTABLE append-only audit trail.
-- Every action, every state change, every system event.
-- ============================================================

CREATE TABLE event_log (
  log_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users (user_id) ON DELETE SET NULL,

  event_type        event_type NOT NULL,
  source            VARCHAR(32) NOT NULL,
  -- 'telegram'|'whatsapp'|'web'|'system'|'monitoring'|'x402'

  -- Flexible payload — fully typed in application code
  event_data        JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Context
  intent_id         UUID,                      -- non-FK for immutability
  position_id       UUID,                      -- non-FK for immutability
  session_id        UUID,                      -- non-FK for immutability
  channel           channel_type,

  -- AI model context
  model_used        VARCHAR(64),
  model_tier        VARCHAR(16),
  latency_ms        INTEGER,                   -- response latency

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NEVER UPDATE OR DELETE
);

-- Indexes
CREATE INDEX idx_event_log_user_id ON event_log (user_id, created_at DESC);
CREATE INDEX idx_event_log_type ON event_log (event_type, created_at DESC);
CREATE INDEX idx_event_log_intent ON event_log (intent_id)
  WHERE intent_id IS NOT NULL;
CREATE INDEX idx_event_log_created ON event_log (created_at DESC);
-- GIN index for JSONB queries on event_data
CREATE INDEX idx_event_log_data ON event_log USING gin (event_data);


-- ============================================================
-- TABLE: parallel_lanes
-- Tracks active parallel execution lanes per user.
-- ============================================================

CREATE TABLE parallel_lanes (
  lane_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
  intent_id         UUID NOT NULL REFERENCES intents (intent_id),

  primitive         primitive_type NOT NULL,
  status            VARCHAR(16) NOT NULL DEFAULT 'running',
  -- 'running'|'awaiting_confirm'|'complete'|'failed'

  capital_reserved  NUMERIC(36,18) NOT NULL DEFAULT 0,
  capital_asset     asset_symbol NOT NULL DEFAULT 'USDT',

  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_lanes_user_id ON parallel_lanes (user_id)
  WHERE status IN ('running', 'awaiting_confirm');


-- ============================================================
-- VIEWS
-- ============================================================

-- User portfolio summary — current balances and positions
CREATE VIEW user_portfolio AS
  SELECT
    u.user_id,
    u.display_name,
    u.region,
    u.local_currency,
    u.automation_level,
    u.kyc_tier,
    -- Active positions
    COALESCE(
      json_agg(
        json_build_object(
          'position_id', p.position_id,
          'primitive', p.primitive,
          'protocol', p.protocol,
          'asset', p.asset,
          'chain', p.chain,
          'amount_current', p.amount_current,
          'current_apy', p.current_apy,
          'goal_id', p.goal_id,
          'opened_at', p.opened_at
        ) ORDER BY p.opened_at DESC
      ) FILTER (WHERE p.position_id IS NOT NULL),
      '[]'::json
    ) AS positions,
    -- Active goals
    COALESCE(
      json_agg(
        json_build_object(
          'horizon_id', h.horizon_id,
          'goal_name', h.goal_name,
          'target_amount', h.target_amount,
          'current_amount', h.current_amount,
          'target_date', h.target_date,
          'on_track', h.on_track
        ) ORDER BY h.created_at DESC
      ) FILTER (WHERE h.horizon_id IS NOT NULL AND h.is_active = TRUE),
      '[]'::json
    ) AS goals
  FROM users u
  LEFT JOIN positions p ON p.user_id = u.user_id AND p.status = 'active'
  LEFT JOIN life_horizons h ON h.user_id = u.user_id AND h.is_active = TRUE
  WHERE u.is_active = TRUE
  GROUP BY u.user_id;


-- Recent intent history (last 50 per user)
CREATE VIEW user_intent_history AS
  SELECT
    i.intent_id,
    i.user_id,
    i.channel,
    i.primitive,
    i.status,
    i.raw_input,
    i.execution_result,
    i.created_at,
    i.completed_at,
    re.intend_fee_amount,
    re.intend_fee_asset
  FROM intents i
  LEFT JOIN revenue_events re ON re.intent_id = i.intent_id
  WHERE i.status NOT IN ('parked')
  ORDER BY i.created_at DESC;


-- Pending confirmations needing reminders
CREATE VIEW pending_reminders_due AS
  SELECT
    cr.reminder_id,
    cr.intent_id,
    cr.user_id,
    cr.channel,
    cr.reminder_number,
    cr.scheduled_for,
    cr.message_text,
    u.telegram_id,
    u.whatsapp_id,
    i.status AS intent_status
  FROM confirmation_reminders cr
  JOIN users u ON u.user_id = cr.user_id
  JOIN intents i ON i.intent_id = cr.intent_id
  WHERE cr.is_sent = FALSE
    AND cr.scheduled_for <= NOW()
    AND i.status = 'confirmed';  -- only remind if still awaiting


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE intents                ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE life_horizons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmation_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE kyc_records            ENABLE ROW LEVEL SECURITY;
ALTER TABLE x402_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE parallel_lanes         ENABLE ROW LEVEL SECURITY;


-- Service role bypasses RLS entirely (used by the application server)
-- The application service role is granted full access.
-- Web client users (Supabase Auth) are restricted to their own data.

-- Users can read and update their own row only
CREATE POLICY users_own_data ON users
  FOR ALL USING (auth.uid() = webapp_uid);

-- Users can read their own wallets
CREATE POLICY wallets_own_data ON wallets
  FOR SELECT USING (
    user_id IN (SELECT user_id FROM users WHERE webapp_uid = auth.uid())
  );

-- Users can read their own intents
CREATE POLICY intents_own_data ON intents
  FOR SELECT USING (
    user_id IN (SELECT user_id FROM users WHERE webapp_uid = auth.uid())
  );

-- Users can read their own positions
CREATE POLICY positions_own_data ON positions
  FOR SELECT USING (
    user_id IN (SELECT user_id FROM users WHERE webapp_uid = auth.uid())
  );

-- Users can read their own goals
CREATE POLICY horizons_own_data ON life_horizons
  FOR SELECT USING (
    user_id IN (SELECT user_id FROM users WHERE webapp_uid = auth.uid())
  );

-- Revenue events: read only, own data
CREATE POLICY revenue_own_data ON revenue_events
  FOR SELECT USING (
    user_id IN (SELECT user_id FROM users WHERE webapp_uid = auth.uid())
  );

-- Prevent any client-side DELETE or UPDATE on append-only tables
CREATE POLICY event_log_no_modify ON event_log
  FOR UPDATE USING (FALSE);
CREATE POLICY event_log_no_delete ON event_log
  FOR DELETE USING (FALSE);

CREATE POLICY revenue_no_modify ON revenue_events
  FOR UPDATE USING (FALSE);
CREATE POLICY revenue_no_delete ON revenue_events
  FOR DELETE USING (FALSE);


-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at on life_horizons
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER life_horizons_updated_at
  BEFORE UPDATE ON life_horizons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- Update user last_active_at when a new intent is created
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET last_active_at = NOW()
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER intents_update_last_active
  AFTER INSERT ON intents
  FOR EACH ROW EXECUTE FUNCTION update_user_last_active();


-- Enforce append-only on event_log at DB level
CREATE OR REPLACE FUNCTION prevent_event_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'event_log is append-only. UPDATE and DELETE are not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_log_append_only
  BEFORE UPDATE OR DELETE ON event_log
  FOR EACH ROW EXECUTE FUNCTION prevent_event_log_modification();


-- Same protection for revenue_events
CREATE OR REPLACE FUNCTION prevent_revenue_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'revenue_events is append-only. UPDATE and DELETE are not permitted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER revenue_events_append_only
  BEFORE UPDATE OR DELETE ON revenue_events
  FOR EACH ROW EXECUTE FUNCTION prevent_revenue_modification();


-- ============================================================
-- GRANTS
-- ============================================================

-- Application service role: full access to all tables
-- (Supabase service_role key bypasses RLS — used only server-side)

-- Anon role: no direct table access — all reads go through service role
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;


-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE users IS
  'One row per person. Identity unified across Telegram, WhatsApp, and Web.';

COMMENT ON TABLE wallets IS
  'Chain addresses per user. One primary wallet per chain.';

COMMENT ON TABLE sessions IS
  'Conversation state machine durable backup. Redis is primary.';

COMMENT ON TABLE intents IS
  'Full lifecycle record for every user intention across all channels.';

COMMENT ON TABLE positions IS
  'Active yield, investment, and staking positions on Base.';

COMMENT ON TABLE life_horizons IS
  'Named financial goals for the SAVE primitive.';

COMMENT ON TABLE claims IS
  'Claim-based transfers for non-user recipients. 72-hour escrow with auto-return.';

COMMENT ON TABLE confirmation_reminders IS
  'Scheduled reminders for pending confirmation flows: 5min, 20min, 35min.';

COMMENT ON TABLE x402_events IS
  'x402 micropayment events — signal data purchases and API payments.';

COMMENT ON TABLE revenue_events IS
  'APPEND-ONLY. All fee events. Never modified after insertion.';

COMMENT ON TABLE event_log IS
  'APPEND-ONLY. Full immutable audit trail. Never modified after insertion.';

COMMENT ON TABLE parallel_lanes IS
  'Active parallel execution lanes. Tracks capital reserved per lane.';

COMMENT ON COLUMN intents.raw_input IS
  'Exact user message. Never normalized or modified.';

COMMENT ON COLUMN intents.intention_object IS
  'Structured output from Context Interpreter. Full IntentionObject JSON.';

COMMENT ON COLUMN intents.execution_plan IS
  'Generated ExecutionPlan. Null until Strategy Generator runs.';

COMMENT ON COLUMN positions.amount_current IS
  'Updated by monitoring loop. Do not read as real-time without checking last_synced_at.';

COMMENT ON COLUMN users.max_auto_tx_usd IS
  'Hard limit for autonomous execution. Only modifiable via deliberate settings action.';

-- ============================================================
-- END OF MIGRATION 001
-- ============================================================
