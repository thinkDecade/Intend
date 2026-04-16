# INTEND v0.5 — Technical Documentation

> Last updated: 2026-04-16 (Phases 2–5 complete)
> Status: Active build — Phase 6 (Netlify deploy) + Phase 7 (landing page) remaining
> Web: https://intendfinance.netlify.app
> Build Plan: `BUILD_PLAN.md` (source of truth for current build direction)

---

> **Documentation rule:** This file is updated after every phase in BUILD_PLAN.md completes.
> No phase is done until this file reflects it.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture](#2-architecture)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Tech Stack](#4-tech-stack)
5. [Core Types (packages/core)](#5-core-types)
6. [Intelligence Layer (packages/intelligence)](#6-intelligence-layer)
7. [Decision Layer (packages/decision)](#7-decision-layer)
8. [Execution Layer (packages/execution)](#8-execution-layer)
9. [Signal Engines (packages/signals)](#9-signal-engines)
10. [Skill Registry (packages/skills)](#10-skill-registry)
11. [Data Layer (packages/data)](#11-data-layer)
12. [Web Application (apps/web)](#12-web-application)
13. [Telegram Bot (apps/bot)](#13-telegram-bot)
14. [WhatsApp Handler (apps/whatsapp)](#14-whatsapp-handler)
15. [Database Schema (supabase)](#15-database-schema)
16. [Authentication Flow](#16-authentication-flow)
17. [Brand Identity](#17-brand-identity)
18. [Deployment & Infrastructure](#18-deployment--infrastructure)
19. [Environment Variables](#19-environment-variables)
20. [Security Model](#20-security-model)
21. [Known Gaps & Phase 2](#21-known-gaps--phase-2)
22. [Build & Deploy Checklist](#22-build--deploy-checklist)

---

## 1. Product Overview

Intend is the smartest financial concierge on earth. Users speak freely about what they want their money to do — in any phrasing, any language. Intend reasons about the intent, understands the user's economic reality deeper than they do, and executes — handling every step invisibly. It is also a proactive guardian: monitoring economic signals continuously, predicting threats to the user's capital, and moving to protect them before they know they need it.

**Tagline:** "Your money, executing your intentions."

### v0.5 Active Primitives

| Primitive | User experience | Execution |
|-----------|----------------|-----------|
| **PROTECT** | Proactive inflation/FX monitoring. Alerts and acts when savings are at risk. Always semi-autonomous. | Hedge score → USDC + Aave V3 (Base) |
| **CONVERT** | Best-rate asset exchange, zero jargon | Aerodrome <$1k · Uniswap V3 ≥$1k |
| **SEND** | Onchain transfer to any wallet or Intend user. Claim escrow for non-users. | ERC-20 transfer · escrow claim (fiat rails: post-v0.5) |
| **SPEND** | Pay anywhere. Card, crypto, open payments. | Visa MCP · crypto checkout · x402 |

### Disabled in v0.5 (gated, not deleted)
GROW, SAVE, EARN, INVEST — controlled by `DISABLED_PRIMITIVES` constant in `packages/decision/src/strategy/index.ts`. Re-enabled in v0.6.

### Execution Modes

| Mode | Behaviour | Default |
|------|-----------|---------|
| **Semi-Autonomous** | Plan presented, user confirms before execution | ✅ All new users |
| **Autonomous** | Intent in, outcome out — receipt sent after execution | Opt-in via settings or conversation |

PROTECT is hardcoded semi-autonomous regardless of user's global mode setting.

Mode is switchable mid-conversation: "go autonomous", "ask me before executing", etc.

### Chain Strategy

Everything runs on **Base** (mainnet) / **Base Sepolia** (testnet). One chain. No bridges. No cross-chain complexity in v0.5. Arbitrum is a Phase 2 decision driven by data when AUM justifies it.

---

## 2. Architecture

### Data Flow

```
User Message (Telegram / WhatsApp / WebApp)
  |
  v
Channel Normalizer
  |
  v
interpretIntent(message, ufm)       <-- packages/intelligence
  |  Returns: IntentionObject (Zod-validated)
  v
buildUFM(userId, options)            <-- packages/intelligence
  |  Returns: UserFinancialModel (live signals)
  v
generatePlan(intention, ufm, ctx)    <-- packages/decision
  |  Returns: ExecutionPlan (steps + fees + timing)
  v
streamConfirmationMessage(plan, ufm) <-- packages/intelligence
  |  Returns: AsyncIterable<string> (streamed preview)
  v
User Confirmation (inline button / web confirm)
  |
  v
executeAtomic(steps, context)        <-- packages/execution
  |  Returns: AtomicResult (all-or-nothing)
  v
updateIntentStatus() + logEvent()    <-- packages/data
```

### Layer Boundaries

```
+-----------------+     +--------------------+     +------------------+
|  INTELLIGENCE   | --> |     DECISION       | --> |    EXECUTION     |
|  (LLM + UFM)   |     |  (Strategy Routes) |     |  (AgentKit/DeFi) |
+-----------------+     +--------------------+     +------------------+
        |                        |                         |
        v                        v                         v
+-----------------+     +--------------------+     +------------------+
|    SIGNALS      |     |      SKILLS        |     |      DATA        |
|  (FX/APY/Gas)   |     |  (JSON Playbooks)  |     | (Supabase+Redis) |
+-----------------+     +--------------------+     +------------------+
```

---

## 3. Monorepo Structure

```
intend/
├── apps/
│   ├── web/                 Next.js 14 App Router — dashboard + API
│   │   ├── src/app/
│   │   │   ├── page.tsx               Landing page
│   │   │   ├── login/                 OTP auth flow
│   │   │   ├── auth/callback/         Supabase auth exchange
│   │   │   ├── app/                   Authenticated dashboard
│   │   │   │   ├── page.tsx           Chat interface
│   │   │   │   ├── goals/             SAVE goals view
│   │   │   │   ├── positions/         GROW/INVEST positions
│   │   │   │   ├── history/           Intent history
│   │   │   │   ├── settings/          User preferences
│   │   │   │   └── _components/       ChatPanel, NavPanel, TopBar, RightPanel, AppShell
│   │   │   ├── api/
│   │   │   │   ├── chat/              SSE streaming chat endpoint
│   │   │   │   ├── confirm/           Intent confirmation
│   │   │   │   ├── portfolio/         Balance + positions summary
│   │   │   │   └── claim/             MOVE claim processing
│   │   │   └── claim/[token]/         Public claim page
│   │   └── middleware.ts              Auth guard + redirects
│   ├── bot/                 Telegram bot
│   │   └── src/
│   │       ├── index.ts               Bot initialization + polling
│   │       ├── pipeline.ts            Message → Plan → Confirm pipeline
│   │       ├── session.ts             Redis + Supabase session state
│   │       ├── formatter.ts           Telegram markdown utilities
│   │       ├── cron.ts                Reminder scheduler
│   │       └── handlers/
│   │           ├── commands.ts        /start, /balance, /portfolio, etc.
│   │           └── callbacks.ts       Confirm/cancel inline keyboard
│   └── whatsapp/            WhatsApp Cloud API handler (skeleton)
│       └── src/index.ts               Webhook verify + message handler
│
├── packages/
│   ├── core/                Shared TypeScript types
│   │   └── src/types/
│   │       ├── intention.ts           IntentionSchema (Zod), IntentionObject, Primitive
│   │       ├── ufm.ts                 UserFinancialModel, Balance, Goal, Position
│   │       └── execution.ts           ExecutionPlan, ExecutionStep, ExecutionStatus
│   │
│   ├── intelligence/        LLM reasoning layer
│   │   └── src/
│   │       ├── model-router.ts        4-tier fallback chain (Claude → OpenRouter)
│   │       ├── context-interpreter.ts interpretIntent() — Zod classification
│   │       ├── ufm-builder.ts         buildUFM() — live signal assembly
│   │       ├── system-prompt.ts       buildSystemPrompt() — UFM injection template
│   │       └── confirmation.ts        generateConfirmationMessage() / streamConfirmationMessage()
│   │
│   ├── decision/            Strategy generators
│   │   └── src/strategy/
│   │       ├── index.ts               generatePlan() — routes to 8 strategies
│   │       ├── protect.ts             Hedge score tiers → USDC/XAUT
│   │       ├── grow.ts                Protocol scoring → best yield
│   │       ├── convert.ts             Asset swap routing
│   │       ├── move.ts                Person-to-person (claim-based)
│   │       ├── save.ts                Goal-linked deposit
│   │       ├── earn.ts                Inbound value routing
│   │       ├── invest.ts              Conviction asset acquisition
│   │       └── spend.ts               Payment rails (Visa/x402/crypto)
│   │
│   ├── execution/           On-chain execution
│   │   └── src/
│   │       ├── agentkit/wallets.ts    CDP wallet create/load
│   │       ├── agentkit/balances.ts   On-chain balance reads
│   │       ├── agentkit/dex.ts        Aerodrome/Uniswap swap execution
│   │       ├── agentkit/yield.ts      Aave V3/Morpho supply/withdraw
│   │       ├── atomicity-wrapper.ts   All-or-nothing with rollback
│   │       └── payments/
│   │           ├── crypto-checkout.ts Direct transfer + claim payout
│   │           └── visa-mcp.ts        Visa MCP (Phase 2 placeholder)
│   │
│   ├── signals/             Market data engines
│   │   └── src/
│   │       ├── fx.ts                  FX rates + inflation (ExchangeRate-API)
│   │       ├── apy.ts                 Yield rates (DefiLlama)
│   │       ├── prices.ts             Asset prices (CoinMarketCap)
│   │       ├── gas.ts                 Gas estimates (Base RPC)
│   │       ├── hedge-score.ts         Inflation/FX risk scoring
│   │       └── types.ts              FxSignal, ApySignal, PriceSignal, GasSignal
│   │
│   ├── skills/              Protocol playbooks
│   │   ├── src/registry.ts            Playbook loader + resolver
│   │   └── playbooks/
│   │       ├── aave_v3_base.json      Supply, withdraw, borrow
│   │       ├── morpho_base.json       Supply, withdraw
│   │       ├── aerodrome_base.json    Swap (primary DEX)
│   │       ├── uniswap_v3_base.json   Swap (secondary DEX)
│   │       ├── lido_base.json         Stake, unstake (XAUT hedge)
│   │       └── erc20_transfer_base.json  ERC-20 transfer
│   │
│   └── data/                Database + cache layer
│       └── src/
│           ├── supabase.ts            getSupabase() — service role client
│           ├── redis.ts               getRedis() — Upstash client + TTL helpers
│           └── repositories/
│               ├── users.ts           getUserById/ByEmail/ByTelegram, createUser, updateUserSettings
│               ├── intents.ts         createIntent, updateIntentStatus, getPendingConfirmations
│               ├── sessions.ts        getSession, upsertSession, clearPendingPlan
│               ├── positions.ts       getActivePositions, createPosition, closePosition
│               ├── goals.ts           getActiveGoals, createGoal, updateGoalProgress
│               ├── claims.ts          createClaim, claimFunds, expireClaim
│               ├── event-log.ts       insertEvent (append-only)
│               ├── reminders.ts       scheduleReminders, markSent
│               └── revenue-events.ts  insertRevenue (append-only)
│
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql     14 tables, 9 enums, full RLS
│   ├── templates/
│   │   └── magic_link.html            Branded OTP email template
│   └── config.toml                    Auth + SMTP + email templates
│
├── vercel.json              Monorepo deploy config
├── turbo.json               Build pipeline (10 packages)
├── package.json             Yarn workspaces root
├── CLAUDE.md                Agent context (orchestrator)
└── DOCUMENTATION.md         This file
```

---

## 4. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript (strict mode) | 5.x |
| Runtime | Node.js | 22+ |
| AI Model Interface | Vercel AI SDK | 4+ |
| Primary LLM | Claude Sonnet 4.6 (Anthropic) | claude-sonnet-4-6 |
| Fallback LLMs | OpenRouter (GPT-OSS-120B, Nemotron-120B, GPT-OSS-20B) | Free tier |
| On-chain Execution | Coinbase AgentKit (CDP wallets, Base-native) | Latest |
| Database | Supabase (PostgreSQL 16) | Hosted |
| Cache | Upstash Redis (REST) | Serverless |
| Web Framework | Next.js 14 App Router | 14.x |
| Hosting | Vercel (web) + GCP Compute Engine (bot) | - |
| Monorepo | Turborepo | Latest |
| Package Manager | Yarn | 1.22.22 |
| DEX | Aerodrome (primary) + Uniswap V3 (secondary) | Base |
| Yield | Aave V3 (primary) + Morpho (secondary) + Moonwell (tertiary) | Base |
| Payments | Visa MCP (Phase 2) + x402 + Crypto Checkout | - |
| Email | Resend SMTP | Transactional |
| Telegram | node-telegram-bot-api | Polling |
| WhatsApp | WhatsApp Cloud API (Meta) | Webhook |

---

## 5. Core Types

### IntentionObject (Zod-validated)

```typescript
{
  primitive: 'PROTECT' | 'GROW' | 'INVEST' | 'SAVE' | 'MOVE' | 'SPEND' | 'EARN' | 'CONVERT',
  intent_confidence: number,          // 0-1, >= 0.75 to proceed
  parameters: {
    asset_from: string | null,
    asset_to: string | null,
    amount: number | 'all' | null,
    amount_confidence: number,
    recipient_raw: string | null,
    goal_name: string | null,
    timing: 'immediate' | 'scheduled' | null,
    recurrence: 'once' | 'monthly' | null,
  },
  clarification_needed: boolean,
  clarification_question: string | null,
  raw_input: string,
  interpreted_at: string,             // ISO timestamp, injected by code
}
```

### UserFinancialModel (UFM)

The UFM is rebuilt on every pipeline execution and injected into the LLM system prompt. Never cached across pipeline runs.

```typescript
{
  user_id: string,
  present: {
    balances: Balance[],              // On-chain balances (AgentKit)
    total_usd_value: number,
    pending_confirmations: PendingConfirmation[],
    active_goals: Goal[],
    active_positions: Position[],
  },
  environment: {
    region: string,                   // ISO country code
    local_currency: string,           // GHS, TRY, BRL, etc.
    fx_rate: number,                  // Local currency per USD
    fx_trend: 'weakening' | 'stable' | 'strengthening',
    fx_change_30d: number,            // Percentage (negative = weakening)
    inflation_rate: number,           // Annual %
    hedge_score: number,              // 0.0–1.0 (live, from hedge-score engine)
    best_apy: number,                 // Best available yield
    current_apy: number | null,       // User's current yield if deployed
    // Phase 3 — PROTECT Intelligence
    forward_signal: {                 // Where the economic environment is heading
      direction: 'deteriorating' | 'stable' | 'improving',
      score_delta: number,            // Positive = getting worse
      acceleration: 'rapid' | 'gradual' | 'stable',
    } | null,
  },
  identity: {
    execution_mode: 'autonomous' | 'semi_autonomous',  // (was: automation_level)
    preferred_channel: 'telegram' | 'whatsapp' | 'web',
    kyc_tier: 'tier_0' | 'tier_1' | 'tier_2' | 'tier_3',
    max_auto_tx_usd: number,
    intend_handle: string | null,
    require_confirm_new_recipient: boolean,
  },
}
```

### ExecutionPlan

```typescript
{
  plan_id: string,
  intention: IntentionObject,
  user_id: string,
  steps: ExecutionStep[],             // Ordered on-chain actions
  confirmation_preview: string,       // Human-readable preview
  fees: {
    gas_usd: number,
    protocol_fee_usd: number,
    intend_fee_usd: number,           // 0.4% standard
    total_usd: number,
  },
  timing_estimate_seconds: number,
  slippage_tolerance: number,         // e.g. 0.005 = 0.5%
  minimum_received: number | null,
  status: ExecutionStatus,
  tx_hash: string | null,
}
```

---

## 6. Intelligence Layer

### Model Router (4-tier fallback)

| Tier | Model | Provider | Timeout | Cost |
|------|-------|----------|---------|------|
| primary | claude-sonnet-4-6 | Anthropic | 15s | Pay-per-token |
| fallback1 | openai/gpt-oss-120b:free | OpenRouter | 30s | Free |
| fallback2 | nvidia/nemotron-3-super-120b:free | OpenRouter | 30s | Free |
| fast | openai/gpt-oss-20b:free | OpenRouter | 20s | Free |

**Key functions:**
- `getModel(tier)` — returns LanguageModel for a specific tier
- `withFallback(fn)` — executes with automatic provider switching
- `tierAvailable(tier)` — checks if env vars are configured
- `logModelRouterStatus()` — startup diagnostics

### Context Interpreter

Two exported functions:

**`detectModeSwitch(rawInput)`** — pure regex, runs before any LLM call. Returns `'autonomous' | 'semi_autonomous' | null`. Used in pipeline.ts and web chat route to intercept mode changes instantly with zero latency.

Triggers: "go autonomous", "full auto", "just do it", "don't ask me", "ask me before", "switch to semi", "always confirm", etc.

**`interpretIntent(rawInput, ufm)`** — open reasoning approach. Asks "What does this person want their money to do?" rather than matching keywords. Uses `generateObject()` with Zod validation.

**Active primitives (v0.5):** PROTECT, CONVERT, MOVE, SPEND. Disabled: GROW, SAVE, EARN, INVEST.

**Assumptions layer:** Intend states what it understood rather than asking for missing parameters. Clarification only fires when: (1) primitive itself is genuinely ambiguous AND (2) consequence is irreversible.

**Confidence threshold:** >= 0.75 to proceed, < 0.75 triggers exactly one clarifying question.

### UFM Builder

`buildUFM(userId, options?)` assembles the UserFinancialModel with live market signals.

**Required signals:**
- FX signal: `getFxSignalStrict(region)` — rates + inflation
- APY signal: `getApySignalStrict()` — best yields
- Hedge signal: `getHedgeSignal(region)` — non-fatal, degrades gracefully

**Computed:** `forward_signal` (Phase 3) — derived from FX trend + 30d rate of change. No historical data needed.

**`hedge_score`** is now live (was a `0` placeholder before Phase 3). Populated from `getHedgeSignal()`.

**Staleness enforcement:** If FX or APY exceeds 2x TTL, throws `SignalStaleError`. Hedge signal failure is non-fatal (returns score 0).

### Confirmation Engine

- `generateConfirmationMessage(plan, ufm)` — one-shot for Telegram/WhatsApp
- `streamConfirmationMessage(plan, ufm)` — streaming for WebApp (token-by-token SSE)

**Rules:** Outcome language only, no protocol/chain names, fees always disclosed, timing estimate, no guarantees, max 5 lines.

---

## 7. Decision Layer

`generatePlan(intention, ufm, ctx)` routes to one of 8 strategy generators:

| Strategy | Key Logic |
|----------|-----------|
| **PROTECT** | Hedge score tiers: 0.4-0.65 → USDC+yield, 0.65-0.85 → split stable+gold, >0.85 → max protection |
| **GROW** | Protocol scoring: (net_apy x 0.50) + (tvl_score x 0.25) + (age_score x 0.15) + (audit_score x 0.10) |
| **CONVERT** | Best rate routing across Aerodrome (primary) + Uniswap V3 (secondary) |
| **MOVE** | Claim-based transfers: create claim link, recipient claims via web/wallet/bank |
| **SAVE** | Goal-linked deposit to yield protocol, progress tracking via life_horizons table |
| **EARN** | Inbound value detection, auto-route to best yield or user-specified destination |
| **INVEST** | Conviction asset acquisition via DEX swap |
| **SPEND** | Three rails: Visa MCP (Phase 2), x402 micropayments, crypto checkout |

All strategies return an `ExecutionPlan` with steps, fees, timing, and confirmation preview.

---

## 8. Execution Layer

### AgentKit Integration (Coinbase CDP)

- **Wallets:** `createWallet()`, `loadWallet()`, `getOrCreateWallet()` — CDP-managed keys in TEE
- **Balances:** `readBalances(address, network)` — fresh on-chain reads
- **DEX:** `executeSwap()`, `getSwapQuote()` — Aerodrome + Uniswap V3 on Base
- **Yield:** `depositToYield()`, `withdrawFromYield()` — Aave V3, Morpho

### Atomicity Wrapper

`executeAtomic(steps, context)` — all-or-nothing execution with rollback snapshots on failure.

### dispatch() — Action Dispatcher

`dispatch(plan, provider, channel, balanceSnapshot?)` — dispatches a confirmed ExecutionPlan through the atomicity wrapper.

- `balanceSnapshot` is now a required parameter (Phase 5 fix) — caller must read fresh on-chain balances before dispatch
- Web confirm route reads balances → builds snapshot → passes to dispatch
- Telegram callback does the same in `handlers/callbacks.ts`

### Conflict Resolver (Phase 5)

`packages/execution/src/conflict-resolver.ts`

- `checkConflict(incoming, activePlans)` — detects asset overlap between plans
- `assertNoConflict(incoming, activePlans)` — throws `PlanConflictError` with user-facing message if conflict found
- `extractConsumedAssets(plan)` — extracts source asset list from plan steps
- `PlanConflictError` — thrown with: "Your Send plan is currently executing — wait for it to complete"

### Protocol Health Check (Phase 5)

`checkProtocolHealth(protocol, chain)` in `agentkit/yield.ts` — now live with DefiLlama API.

Checks before every yield deposit:
1. **TVL ≥ $10M** — rejects if below threshold
2. **TVL drop guard** — rejects if TVL dropped >30% in 24h (exploit/bank-run signal)
3. **Allowlist** — only `aave_v3`, `morpho`, `moonwell` pass
4. **Testnet fallback** — network errors pass in non-production; fail closed in production

### Payment Rails

- **Crypto Checkout:** Direct transfer + claim-based payouts, 6-char address confirmation on >$200 transactions
- **Visa MCP:** Phase 2 placeholder
- **x402:** Micropayment protocol integration

---

## 9. Signal Engines

| Signal | Source API | TTL | Max Age (2x) | Key |
|--------|-----------|-----|-------------|-----|
| FX rates | ExchangeRate-API | 4h | 8h | `intend:fx:{region}:{currency}` |
| APY/Yield | DefiLlama | 6h | 12h | `intend:apy:protocols` |
| Prices | CoinMarketCap | 15m | 30m | `intend:price:{asset}` |
| Gas | Base RPC | 5m | 10m | `intend:gas:base` |
| Hedge Score | Computed | 4h | 8h | `intend:hedge:{region}` |
| Plan Cache | Redis (short-lived) | 40m | — | `intend:plan:{intent_id}` |
| Protect Cooldown | Redis flag | 24h | — | `intend:protect:cooldown:{user_id}` |

**Staleness rule:** Display uses cached values within TTL. Execution ALWAYS fetches fresh (prices, gas). If any signal exceeds 2x TTL during pipeline, abort with user-facing message.

### Hedge Score Formula

```
fx_component = max(0, -fx_change_30d / 20) x 0.40
inflation_component = max(0, (inflation_rate - 5) / 75) x 0.40
volatility_component = (fx_volatility_30d / 15) x 0.20
score = min(1.0, sum)
```

Tiers: 0-0.40 none, 0.40-0.65 monitor, 0.65-0.85 suggest PROTECT, >0.85 emergency.

---

## 10. Skill Registry

JSON playbooks define protocol interactions without TypeScript changes:

| Playbook | Protocol | Actions |
|----------|----------|---------|
| `aave_v3_base.json` | Aave V3 | supply, withdraw, borrow, repay |
| `morpho_base.json` | Morpho | supply, withdraw |
| `aerodrome_base.json` | Aerodrome | swap |
| `uniswap_v3_base.json` | Uniswap V3 | swap, quote |
| `lido_base.json` | Lido | stake, unstake |
| `erc20_transfer_base.json` | ERC-20 | transfer |

Adding a new protocol = adding a JSON file. Zero TypeScript changes.

---

## 11. Data Layer

### Supabase Client

`getSupabase()` returns a server-side client using the service role key (bypasses RLS). Client-side uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with RLS enforced.

### Redis Client (Upstash)

`getRedis()` returns the Upstash REST client. Cache helpers:
- `cacheSet(key, value, ttlSeconds)` — stores with `{ data, fetched_at }` envelope
- `cacheGet(key)` — retrieves with staleness metadata
- `isFresh(fetched_at, maxAgeMs)` — checks if within acceptable age

### Repositories

| Repository | Key Functions |
|------------|---------------|
| **users.ts** | `getUserById`, `getUserByEmail`, `getUserByTelegramId`, `createUser`, `updateUserSettings`, `updateLastActive` |
| **intents.ts** | `createIntent`, `updateIntentStatus`, `getPendingConfirmations` |
| **sessions.ts** | `getSession`, `upsertSession`, `clearPendingPlan` |
| **positions.ts** | `getActivePositions`, `createPosition`, `closePosition` |
| **goals.ts** | `getActiveGoals`, `createGoal`, `updateGoalProgress` (table: `life_horizons`) |
| **claims.ts** | `createClaim`, `claimFunds`, `expireClaim` |
| **event-log.ts** | `insertEvent` (append-only, never UPDATE/DELETE) |
| **reminders.ts** | `scheduleReminders`, `markSent`, `getUpcomingReminders` |
| **revenue-events.ts** | `insertRevenue` (append-only) |

---

## 12. Web Application

**Framework:** Next.js 14 App Router
**Deployed to:** Vercel (https://intend-web.vercel.app)
**Animation Library:** framer-motion v12.38+ (scroll-triggered animations, parallax)

### Landing Page (`/`)

Premium dark-themed landing page inspired by awsmd.com design patterns. Client component using framer-motion for scroll-triggered animations, parallax hero, and staggered reveals.

**Sections:**
1. **Sticky Nav** — Glassmorphism (`backdrop-filter: blur(16px)`), logo + nav links + CTA button
2. **Hero** — Full-viewport, parallax scroll (via `useScroll`/`useTransform`), animated badge, large serif headline with italic accent, dual CTAs (primary + ghost), decorative gradient orb
3. **Vision** — Centered text block with the brand story, staggered fade-in
4. **How It Works** — Three numbered step cards (`01`, `02`, `03`) with hover lift, large serif numerals
5. **Stats Bar** — Four-column metrics grid (8 primitives, 3 channels, <1s interpretation, 0 protocol knowledge)
6. **Capabilities** — 4-column card grid of all 8 financial primitives with arrow-on-hover effect
7. **Showcase** — Simulated chat conversation demonstrating the PROTECT flow with plan preview card
8. **Channels** — Three-card grid (Telegram, Web, WhatsApp)
9. **Bottom CTA** — Brand tagline with large serif type and primary CTA
10. **Footer** — Brand, links, copyright, version

**Design Tokens:**
- Font: `Instrument Serif` (italic, for headings/numerals) + system sans + Geist Mono
- Colors: warm dark palette (`#1A1612` bg, `#D4A24A` accent gold, `#F5F0E6` text)
- All CSS classes prefixed `lp-` to avoid collision with app dashboard styles
- Responsive breakpoints: 1024px, 768px, 480px

**Animation Architecture:**
- `fade` variant: opacity 0→1 + y 32→0, staggered via `custom` prop
- `stagger` variant: 0.12s delay between children
- Hero parallax: `useScroll` tracks section, `useTransform` maps to Y offset + opacity fade
- All sections use `whileInView` with `viewport={{ once: true }}` for one-shot reveals

### Routes

| Route | Type | Auth | Purpose |
|-------|------|------|---------|
| `/` | Static | None | Premium landing page (framer-motion animations) |
| `/login` | Static | None | OTP auth (email + 6-digit code) |
| `/auth/callback` | Dynamic | None | Supabase auth exchange + user creation |
| `/app` | Dynamic | JWT | Main dashboard with chat interface |
| `/app/goals` | Dynamic | JWT | SAVE goals with progress bars |
| `/app/positions` | Dynamic | JWT | GROW/INVEST positions table |
| `/app/history` | Dynamic | JWT | Intent history (filterable) |
| `/app/settings` | Dynamic | JWT | Preferences, automation toggle, sign out |
| `/claim/[token]` | Dynamic | Token | Public MOVE claim page |

### API Routes

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | SSE streaming chat — interpret intent, generate plan, stream preview |
| `/api/confirm` | POST | Confirm or cancel an execution plan |
| `/api/portfolio` | GET | Balance + positions + goals summary |
| `/api/claim` | POST | Process a MOVE claim |

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **ChatPanel** | `_components/ChatPanel.tsx` | Full chat interface with streaming, plan preview cards, confirm/cancel |
| **NavPanel** | `_components/NavPanel.tsx` | Left sidebar icon navigation |
| **TopBar** | `_components/TopBar.tsx` | Header with greeting + initials |
| **RightPanel** | `_components/RightPanel.tsx` | Context-aware sidebar (balances, stats) |
| **AppShell** | `_components/AppShell.tsx` | Layout wrapper with collapsible panel |

### Middleware

`middleware.ts` runs on every request:
- Refreshes Supabase session via `getUser()`
- Redirects unauthenticated users from `/app/*` to `/login`
- Redirects authenticated users from `/login` and `/` to `/app`
- Passes `next` param for post-login redirect

---

## 13. Telegram Bot

**Process:** PM2 (`intend-bot`) on GCP Compute Engine
**Mode:** Long polling (not webhooks)

### Commands

| Command | Behavior |
|---------|----------|
| `/start` | Create user + wallet via AgentKit, welcome message |
| `/balance` | Read-only balance display (no LLM call) |
| `/portfolio` | Active GROW/INVEST positions + SAVE goals |
| `/history` | Last 10 intents, paginated inline keyboard |
| `/help` | Primitive summary + example phrases |
| `/settings` | Automation level, spend limits |
| `/connect` | 6-digit channel link code (TTL: 5min) |
| `/cancel` | Cancel pending confirmation |

### Pipeline

```
Message
  → Step 0: detectModeSwitch() [regex, no LLM — handles "go autonomous", "ask me first"]
  → getUserByTelegramId → loadSession(redis)
  → buildUFM(userId, { balances, positions, goals, pending })
  → interpretIntent(text, ufm)    [open reasoning, assumptions layer]
  → generatePlan(intention, ufm, ctx)
  → checkPermission() [semi: always confirm, PROTECT: always confirm, autonomous: skip]
  → generateConfirmationMessage(plan, ufm)
  → Send preview with [Confirm] [Cancel] inline keyboard
```

### Proactive Monitor (Phase 3)

`apps/bot/src/proactive-monitor.ts` — PROTECT intelligence module.

**Invocation:** Wired to `intend-cron` process, runs every 6 hours (30s warmup delay on startup).

**Algorithm:**
1. Load all active users with Telegram linked (`getAllActiveUsersWithTelegram()`)
2. Group by region — one signal fetch per region (not per user)
3. For each region: `getHedgeSignal(region)` + `getFxSignal(region)`
4. If `hedge_score >= 0.65`: check 24h cooldown per user (`intend:protect:cooldown:{userId}`)
5. If no cooldown: fire proactive alert via Telegram with `protect_alert:accept` / `protect_alert:dismiss` buttons
6. Set 24h cooldown in Redis after alert sent

**Alert message format:**
- Shows FX change % and/or inflation rate
- "Protect my savings →" and "Not now" inline keyboard
- Cooldown key: `intend:protect:cooldown:{userId}` — 24h TTL

**Callback handling:**
- `protect_alert:accept` → pipeline with synthetic message `"protect my savings"`
- `protect_alert:dismiss` → "No problem — I'll keep watching."

### Session State Machine

```
IDLE → CLARIFYING → CONFIRMING → EXECUTING → IDLE
                        |
                    CONFLICT (new message during confirmation)
```

### Confirmation Reminders

| Time | Action |
|------|--------|
| T+5min | Gentle reminder + buttons |
| T+20min | Direct "expires in 20 minutes" |
| T+35min | Final "expires in 5 minutes" |
| T+40min | Auto-expire, cancel plan |

---

## 14. WhatsApp Handler

**Status:** Webhook skeleton complete. Full pipeline integration is Phase 2 (P1-18).

- GET `/webhook` — Meta verification challenge
- POST `/webhook` — Incoming message events with HMAC verification
- Message templates pre-defined for business-initiated messages (5 templates)

---

## 15. Database Schema

**PostgreSQL 16 via Supabase** — 14 tables, 9 custom enums, RLS on all tables.

### Tables

| Table | Purpose | Key Constraints |
|-------|---------|-----------------|
| `users` | User accounts, KYC, automation settings | Unique: telegram_id, whatsapp_id, email, phone |
| `wallets` | AgentKit CDP wallets per chain | FK: user_id |
| `sessions` | Conversation state (Redis backup) | State machine enum |
| `intents` | Full intent lifecycle | Status enum, FK: user_id |
| `positions` | Yield/investment positions | Status: active/withdrawing/closed/failed |
| `life_horizons` | SAVE goals with progress tracking | on_track, projected_date |
| `claims` | MOVE transfers (claim-based) | 72h expiry, status enum |
| `confirmation_reminders` | T+5/20/35/40 reminder schedule | FK: intent_id |
| `kyc_records` | Identity verification audit | FK: user_id |
| `x402_events` | Micropayment tracking | - |
| `signal_snapshots` | Cached market signal history | - |
| `revenue_events` | Intend fee tracking | **Append-only** |
| `event_log` | Complete audit trail | **Append-only** |
| `parallel_lanes` | Concurrent intent execution | - |

### Critical Rules

- **Monetary amounts:** `NUMERIC(36,18)` — never FLOAT
- **Timestamps:** `TIMESTAMPTZ` (UTC always)
- **IDs:** `UUID DEFAULT gen_random_uuid()`
- **telegram_id:** `BIGINT` (not INT)
- **Append-only tables:** `event_log`, `revenue_events` — DB trigger prevents UPDATE/DELETE
- **Migrations:** Numbered SQL files only, never manual ALTER TABLE

---

## 16. Authentication Flow

### OTP Flow (Primary)

```
1. User enters email on /login
2. signInWithOtp() → Supabase sends email with 6-digit code + magic link
3a. User enters 6-digit code → verifyOtp() → session created → redirect /app
3b. User clicks magic link → /auth/callback → exchangeCodeForSession → redirect /app
4. On successful auth, ensureUserRecord() creates a row in `users` table if not exists
5. Middleware refreshes session on every request
```

### User Auto-Creation (3 fallback points)

1. **Auth callback** (`/auth/callback/route.ts`) — creates after magic link click
2. **verifyOtp action** (`/login/actions.ts`) — creates after 6-digit code entry
3. **App layout** (`/app/layout.tsx`) — fallback for users with auth but no DB row

### Email Template

Custom branded email via Resend SMTP: dark background (#1A1612), amber OTP code (#D4A24A), Georgia italic "intend" wordmark. Template at `supabase/templates/magic_link.html`.

---

## 17. Brand Identity

### Color Palette

| Name | Hex | Usage |
|------|-----|-------|
| Cinder | `#1A1612` | Primary dark background |
| Ember | `#252019` | Card/panel backgrounds |
| Bark | `#302A23` | Tertiary/nav backgrounds |
| Parchment | `#F5F0E6` | Primary text |
| Clay | `#A0907E` | Secondary/muted text |
| Stone | `#7D6F62` | Tertiary text |
| Amber | `#D4A24A` | Brand accent (buttons, highlights) |
| Harvest | `#E0B35C` | Accent hover state |

### Typography

- **Display/Logo:** Georgia, serif (italic, letter-spacing: 0.2em)
- **Product UI:** system-ui, -apple-system, sans-serif
- **Code/Numbers:** 'Geist Mono', 'Courier New', monospace

### Design Principles

- Bold, vibrant, classy with a touch of warmth
- No oversaturation — amber used sparingly as accent
- Dark-on-amber for primary buttons (Cinder text on Amber background)
- Warm ambient glow (subtle radial gradient)

---

## 18. Deployment & Infrastructure

### Netlify (Web App)

- **URL:** https://intendfinance.netlify.app
- **Framework:** Next.js 14 (via `@netlify/plugin-nextjs`)
- **Build command:** `npx turbo build --filter=@intend/web`
- **Publish dir:** `apps/web/.next`
- **Config:** `netlify.toml` at repo root
- **Note:** Replaces Vercel. All env vars migrated to Netlify dashboard.

### GCP Compute Engine (Bot + Services)

- **IP:** 34.63.81.169
- **User:** thinkdecade (passwordless sudo)
- **Zone:** us-central1-a
- **PM2 processes:**

| Process | Script | Purpose |
|---------|--------|---------|
| `intend-bot` | `apps/bot/dist/index.js` | Telegram bot (long-polling) |
| `intend-cron` | `apps/bot/dist/cron.js` | Reminder scheduler + PROTECT proactive monitor |
| `intend-whatsapp` | `apps/whatsapp/dist/index.js` | WhatsApp webhook stub (v0.6) |

### Supabase (Database)

- **Project:** intend-v0.5-staging
- **Ref:** otlnqhgixnnppktrzxmj
- **URL:** https://otlnqhgixnnppktrzxmj.supabase.co
- **PostgreSQL:** 16
- **Auth:** Magic link + OTP, Resend SMTP

### Upstash Redis (Cache)

- **URL:** https://thankful-bull-98526.upstash.io
- **Usage:** Signal caching, session state, rate limiting

---

## 19. Environment Variables

### Required for Web App (Netlify)

| Variable | Purpose | Set |
|----------|---------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | Client-side Supabase URL | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client-side Supabase key | Yes |
| `NEXT_PUBLIC_SITE_URL` | Base URL for auth redirects | Yes |
| `SUPABASE_URL` | Server-side Supabase URL | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin key (bypasses RLS) | Yes |
| `ANTHROPIC_API_KEY` | Claude Sonnet 4.6 | Yes |
| `OPENROUTER_API_KEY` | Fallback LLMs (free tier) | Yes |
| `UPSTASH_REDIS_REST_URL` | Redis cache | Yes |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth | Yes |

### Required for Bot (GCP)

All of the above plus:

| Variable | Purpose |
|----------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram API |
| `TELEGRAM_WEBHOOK_SECRET` | HMAC verification |
| `CDP_API_KEY_ID` | Coinbase AgentKit |
| `CDP_API_KEY_SECRET` | Coinbase AgentKit |
| `CDP_WALLET_SECRET` | Wallet encryption |
| `EXCHANGE_RATE_API_KEY` | FX signal engine |
| `COINMARKETCAP_API_KEY` | Price signal engine |
| `BASE_SEPOLIA_RPC_URL` | Testnet RPC |
| `RESEND_API_KEY` | Transactional email |

---

## 20. Security Model

| Rule | Implementation |
|------|----------------|
| User private keys never touch servers | AgentKit CDP manages keys in Coinbase TEE |
| Prompt injection defense | UFM in system prompt only, user input in user slot only |
| All LLM outputs validated | Zod schema via `generateObject()` — rejects malformed |
| Confirmation before execution | Every on-chain action requires explicit user confirm |
| Credential protection | Pre-commit hook (gitleaks) rejects credential patterns |
| RLS enforcement | Service role server-only, anon key client-only |
| Webhook verification | HMAC (Telegram + WhatsApp) |
| Large transaction safety | 6-char address confirmation for crypto > $200 |
| Append-only audit | event_log + revenue_events: DB triggers prevent UPDATE/DELETE |

---

## 21. Known Gaps & Post-v0.5

### Working Now (Phases 0–5 complete)

- 4 active primitives: PROTECT, CONVERT, MOVE (Send), SPEND
- 4 gated primitives: GROW, SAVE, EARN, INVEST (friendly "coming in next version" message)
- Two execution modes: Autonomous + Semi-Autonomous, switchable via settings and conversation
- PROTECT hardcoded semi-autonomous (invariant)
- PROTECT proactive monitor: hedge score threshold, 6h poll, 24h cooldown, FX/inflation alert
- `forward_signal` in UFM — economic trajectory context
- Mode-switch detection: regex pre-filter before LLM (zero latency)
- Open reasoning context interpreter + assumptions layer
- Live `hedge_score` in UFM (was placeholder 0)
- Web confirm route now dispatches (Plan cached in Redis 40min, dynamic import of execution layer)
- `balance_snapshot` populated before dispatch (Telegram + Web)
- Conflict resolver: `checkConflict()`, `assertNoConflict()`, `PlanConflictError`
- `checkProtocolHealth()`: live DefiLlama TVL check, ≥$10M + 30% drop guard
- 3 channels: Web (live), Telegram (live), WhatsApp (skeleton)
- OTP auth + branded emails
- Streaming chat with plan preview
- Settings persistence (execution mode toggle)

### Remaining (Phases 6–7)

| Item | Phase | Notes |
|------|-------|-------|
| Netlify env vars | Phase 6 | Set in Netlify dashboard — requires Supabase/Redis/AI keys |
| DNS verification | Phase 6 | `intendfinance.netlify.app` already live, custom domain pending |
| Landing page update | Phase 7 | 4 primitives (not 8), dual execution mode, PROTECT intelligence |
| WhatsApp "coming soon" | Phase 7 | Replace "connected" with honest state |
| End-to-end smoke test | Phase 7 | Both channels, both modes, all 4 primitives |
| OpenClaw gateway wiring | Post-Phase 4 | WORKSPACE.md updated; HTTP gateway requires VM SSH access |
| On-chain balance display | v0.6 | `/api/portfolio` returns 0 for wallet balance |
| History page filtering | v0.6 | No date range or primitive filter UI |
| Cross-channel handoff | v0.6 | Redis → Supabase sync exists but untested end-to-end |

### Post-v0.5 (Explicitly Deferred)

- SEND fiat rails (Flutterwave NGN/GHS, Wise GBP/CNY) — depends on funding
- WhatsApp full pipeline (stub exists)
- GROW, SAVE, EARN, INVEST primitives
- KYC Tier 2/3
- Yellow Card crypto-to-fiat Africa corridor
- Arbitrum yield layer
- Mobile app

---

## 22. Build & Deploy Checklist

Run after every major change:

```bash
# 1. Build all packages
npx turbo build --force

# 2. Verify all 10 packages succeed
# Expected: "@intend/core, intelligence, decision, execution,
#            signals, skills, data, web, bot, whatsapp — 10 successful"

# 3. Deploy to Vercel
npx vercel deploy --prod --yes

# 4. Push Supabase config (if auth/email changed)
echo "Y" | npx supabase config push --project-ref otlnqhgixnnppktrzxmj

# 5. Update this documentation
# Add to the todo list after every major build

# 6. Test auth flow
# Visit https://intend-web.vercel.app/login
# Enter email → receive OTP → enter code → land on /app

# 7. Test chat
# Send a message in the chat → verify streaming response
```

---

## Statistics

| Metric | Count |
|--------|-------|
| Total packages | 10 (7 library + 3 app) |
| Database tables | 14 |
| Custom enums | 9 |
| Financial primitives | 8 |
| Protocol playbooks | 6 |
| LLM provider tiers | 4 |
| Signal engines | 5 |
| Repository files | 9 |
| Web routes | 9 pages + 4 API |
| Telegram commands | 8 |
| Vercel env vars | 9 |
| Supported chain | 1 (Base) + 1 testnet |

---

*INTEND v0.5 | Base | thinkDecade*
*Documentation auto-updated as part of the build checklist.*
