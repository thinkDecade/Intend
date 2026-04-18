# Intend v0.5 — Build Plan

> This document is the source of truth for the current build direction.
> After each phase completes, update `DOCUMENTATION.md` before moving to the next phase.
> No phase is done until DOCUMENTATION.md reflects it.

---

## Product Vision

Intend is the smartest financial concierge on earth. Users speak freely about what they want their money to do. Intend reasons about the intent, understands the user's economic reality deeper than they do, and executes — handling every step invisibly. The experience is magic: intention in, outcome out.

Intend is also a proactive guardian. It monitors the user's financial and economic environment continuously, predicts where their world is heading, and moves capital to protect them — before they know they need it.

---

## v0.5 Scope

### Four Active Primitives

| Primitive | What the user experiences |
|-----------|--------------------------|
| **PROTECT** | Intend monitors inflation and FX signals. When the user's savings are at risk, Intend alerts and acts. Semi-autonomous by default — always asks before protecting. |
| **CONVERT** | Best-rate asset exchange. Aerodrome under $1k, Uniswap V3 at $1k+. |
| **SEND** | Onchain transfer to any wallet or Intend user. Claim escrow for recipients without wallets. (Fiat rails: post-v0.5.) |
| **SPEND** | Pay via Visa Intelligent Commerce MCP, crypto checkout, or x402. |

### Disabled (gated, not deleted)
GROW, SAVE, EARN, INVEST — controlled by `DISABLED_PRIMITIVES` constant. Re-enabled in v0.6 with no rebuild.

---

## Execution Modes

Two modes. Switchable from settings and from conversation at any time.

### Autonomous
Intent in. Outcome out. Intend executes immediately after planning. A receipt is sent after — not a confirmation request before. For users who want zero friction and have established trust.

**User can switch by saying:** "go autonomous", "just do it", "full auto", "don't ask me"

### Semi-Autonomous *(default for all new users)*
Intend builds the plan and presents it. The user approves. One explicit confirmation before any execution. Builds trust through transparency. Designed for users new to agentic finance.

**User can switch by saying:** "ask me before executing", "switch to semi", "always confirm with me"

**PROTECT is always semi-autonomous.** Hardcoded. Moving capital to hedge risk is consequential — it always warrants a human decision, regardless of global mode setting.

---

## PROTECT — The Intelligence Hypothesis

PROTECT is the first live test of Intend's core thesis: knowing the user's financial reality better than they do.

Every 6 hours, Intend checks the economic signals for each user's region: FX rate, inflation trend, hedge score trajectory. When the score crosses 0.65 and the user has unprotected savings, Intend does not wait to be asked. It sends a proactive alert:

```
intend noticed something.

The cedi has lost 4.2% against the dollar this week and inflation
in Ghana is running at 18.4%. Your $1,200 in savings is exposed.

Here's what I can do:

  Action:         Protect $1,200
  Mechanism:      Move to USDC, earning 4.8% APY
  Protection:     From ~18% annual purchasing power loss
  Fee:            $0.14

Protect my savings →     Not now
```

The user sees exactly what Intend observed and why it's acting. Trust is built through transparency, not just outcomes.

---

## Language Philosophy

Intend should understand any way a user expresses a financial intent. There is no command vocabulary. The context interpreter reasons about what the user wants their money to do — not which keyword they used.

A user saying:
- "my rent is killing me, I need my money to work harder"
- "I'm scared of what's happening with the dollar"
- "make sure my family is okay if something happens to me"

...all have financial intent buried inside natural language. Intend finds it. It does not ask the user to rephrase.

Intend makes reasonable assumptions and states them rather than asking unnecessary questions. Clarification only fires when the intent is genuinely ambiguous **and** the consequence is irreversible.

Responses are written in outcomes, not mechanics. Users never see: protocol names, chain names, token addresses, transaction hashes (unless they ask). They see: "Your $1,200 is now protected. Earning 4.8%. Safe from the cedi."

---

## Architecture

```
User speaks freely (any language, any phrasing)
              ↓
    ┌──────────────────────────────────────────┐
    │       Intent Reasoning Layer             │
    │  Reasons about what the user wants       │
    │  their money to do. Maps to primitive    │
    │  only after full reasoning is complete.  │
    │  Detects mode-switch intents first.      │
    └──────────────────────────────────────────┘
              ↓
    ┌──────────────────────────────────────────┐
    │       User Financial Model (UFM)         │
    │  • Current holdings and positions        │
    │  • Region's economic signals             │
    │  • Hedge score + forward trajectory      │
    │  • User history and patterns             │
    └──────────────────────────────────────────┘
              ↓
    ┌──────────────────────────────────────────┐
    │       Decision + Execution               │
    │  Builds plan → checks execution mode     │
    │  Autonomous: executes, sends receipt     │
    │  Semi: shows plan, waits for go          │
    └──────────────────────────────────────────┘
              ↓
    ┌──────────────────────────────────────────┐
    │       Receipt                            │
    │  Written in outcomes, not mechanics.     │
    │  "Your $1,200 is now protected.          │
    │   Earning 4.8%. Safe from the cedi."    │
    └──────────────────────────────────────────┘
```

---

## Hosting

| Service | Host | Notes |
|---------|------|-------|
| Web app (`apps/web`) | Netlify (`intendfinance.netlify.app`) | Next.js runtime, free tier, domain already configured |
| Telegram bot (`apps/bot`) | GCP VM — PM2 (`intend-bot`) | Long-polling, always-on |
| Cron (`apps/bot/src/cron.ts`) | GCP VM — PM2 (`intend-cron`) | Reminders + PROTECT monitor |
| WhatsApp (`apps/whatsapp`) | GCP VM — PM2 (`intend-whatsapp`) | Stub, v0.6 |

---

## Build Phases

> Each phase ends with an update to `DOCUMENTATION.md`.

---

### Phase 0 — Foundation ✅

- [x] Push all untracked source files to `v0.5` remote (100+ files committed)
- [x] Env vars confirmed correct in `.env.example` (CDP keys, CoinMarketCap)
- [x] Add `execution_mode` column to `users` table — `supabase/migrations/002_execution_mode.sql`
- [x] Add `DISABLED_PRIMITIVES` set to `packages/decision/src/strategy/index.ts` — throws `PrimitiveDisabledError` with friendly user message
- [x] Rename `MOVE` → `SEND` in all user-facing copy: bot formatter, /help, /settings, confirm buttons
- [x] Replace `vercel.json` with `netlify.toml`
- [x] Prune 14 redundant root-level files; move WORKSPACE.md to `.openclaw/workspace/`
- [x] Update DOCUMENTATION.md

---

### Phase 1 — Execution Modes ✅

- [x] Collapse `AutomationLevel` type to `ExecutionMode: 'autonomous' | 'semi_autonomous'`
- [x] Update permission gate: autonomous mode skips confirmation, generates receipt instead
- [x] Add mode-switch intent detection to context interpreter — highest priority pass, runs before primitive classification
- [x] Mode-switch updates session state in Redis immediately + persists to `users` table
- [x] PROTECT mode hardcoded to `semi_autonomous` in permission gate regardless of user's global setting
- [x] Update settings page UI — clear toggle with plain English explanation of both modes
- [x] Update DOCUMENTATION.md

---

### Phase 2 — Language Aperture ✅

- [x] Rewrite context interpreter prompt from classification to open reasoning: "What does this person want their money to do?" — structured output preserved, reasoning path widened
- [x] Add assumptions layer: Intend states assumptions rather than asking for clarification. Clarification only fires if intent is ambiguous AND consequence irreversible.
- [x] Mode-switch detection also added to web `/api/chat` route
- [x] Update DOCUMENTATION.md

---

### Phase 3 — PROTECT Intelligence ✅

- [x] Add `ForwardSignal` type + `forward_signal` to UFM environment — direction, score_delta, acceleration
- [x] UFM builder computes `forward_signal` from FX trend + 30d change rate; hedge_score now live (was 0 placeholder)
- [x] Build `apps/bot/src/proactive-monitor.ts` — polls every 6h, groups users by region, fires alert when hedge_score > 0.65
- [x] Proactive alert message: shows FX change %, inflation rate, urgency framing — "Protect →" and "Not now" buttons
- [x] Handle `protect_alert:accept` / `protect_alert:dismiss` callbacks in `handlers/callbacks.ts`
- [x] Wire to `intend-cron` PM2 process — 30s warmup delay, then every 6h
- [x] 24h cooldown per user via Redis `intend:protect:cooldown:{userId}` key
- [x] Update DOCUMENTATION.md

---

### Phase 4 — OpenClaw Refactor ✅

- [x] Update `/.openclaw/workspace/WORKSPACE.md` — agent lanes (Intelligence/Decision/Execution), handoff JSON schema, session state contract, model per lane, voice rules, PROTECT intelligence spec
- [x] Pipeline architecture documented — gateway wiring deferred: pipeline is clean and stable as-is; full OpenClaw HTTP gateway requires VM access (`openclaw doctor --fix` runs on GCP VM)
- [x] Web `/api/chat` route updated: mode-switch detection + plan caching
- [x] Update DOCUMENTATION.md

---

### Phase 5 — Critical Fixes ✅

- [x] Fix `apps/web/src/app/api/confirm/route.ts` — fetches plan from Redis cache, dispatches via dynamic import of `@intend/execution` (avoids webpack bundling issue with AgentKit)
- [x] Populate `balance_snapshot` before dispatch — `dispatch()` now accepts `balanceSnapshot` param, passed from confirm route
- [x] Build `packages/execution/src/conflict-resolver.ts` — `checkConflict()`, `assertNoConflict()`, `PlanConflictError`
- [x] Implement real `checkProtocolHealth()` — live DefiLlama TVL API call, ≥$10M threshold + 30% drop guard
- [x] `next.config.mjs` updated — `serverExternalPackages` for AgentKit/viem, `@intend/skills` added to `transpilePackages`
- [x] Redis plan cache added — `intend:plan:{intentId}` key, 40min TTL, matches confirmation expiry window
- [x] Update DOCUMENTATION.md

---

### Phase 6 — Netlify Deployment ✅

- [x] `netlify.toml` configured at root — build command, publish dir, plugin, Node 22
- [x] `next.config.mjs` updated — `serverComponentsExternalPackages` (Next.js 14 syntax), @x402 excluded from webpack, NEXT_TELEMETRY_DISABLED
- [x] Set all 17 env vars in Netlify via CLI (`netlify env:set`) — sourced from local `.env`:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`
  - `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`
  - `EXCHANGE_RATE_API_KEY`, `COINMARKETCAP_API_KEY`, `BASE_SEPOLIA_RPC_URL`
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
  - `RESEND_API_KEY`
- [x] Deploy live at https://intendfinance.netlify.app — build clean, 15 pages, all API routes present
- [x] Landing page verified live — correct content, all sections rendering
- [x] `intendfinance.netlify.app` is the production URL — no DNS rewiring needed
- [x] Update DOCUMENTATION.md

---

### Phase 7 — Landing Page + Final Polish ✅

- [x] Update landing page — 4 active primitives (PROTECT, CONVERT, SEND, SPEND)
- [x] PROTECT card: proactive intelligence angle ("Intend watches around the clock")
- [x] Execution modes section: Semi-Autonomous (default) vs Autonomous with trigger phrases
- [x] Showcase: proactive PROTECT alert with FX change %, inflation, "Protect →" / "Not now"
- [x] Hero subtitle: "smartest financial concierge" + proactive guardian angle
- [x] Stats: 4 primitives + 6h monitoring (was 8 primitives + 3 channels)
- [x] Channels: Telegram + Web (live), WhatsApp (visually dimmed, "· soon")
- [x] Primitive grid: 2-column layout for 4 items
- [x] All new CSS: execution mode cards, dismiss button, proactive alert styling
- [x] Full end-to-end smoke test: 2 critical bugs found and fixed (intent_confidence NOT NULL; viem Lambda bundle miss → /api/chat 500)
- [x] Update DOCUMENTATION.md

---

### Phase 8 — Onboarding, UI Redesign & Agent Intelligence ✅

- [x] **Onboarding flow** — 6-step animated wizard at `/onboard` (welcome → profile → account → fund → first intent → channels)
- [x] `supabase/migrations/003_onboarding_flag.sql` — `onboarding_completed BOOLEAN DEFAULT FALSE` on users table
- [x] `supabase/migrations/004_reset_onboarding.sql` — reset all existing users to trigger new onboarding flow
- [x] `packages/data/src/repositories/users.ts` — added `markOnboardingComplete(userId)` + `onboarding_completed` to `UserRow`
- [x] `apps/web/src/app/onboard/` — page.tsx (server), onboard-flow.tsx (6-step client), actions.ts (saveOnboardingProfile, completeOnboarding)
- [x] Auth routing: both `verifyOtp` (OTP path) and `ensureUserRecord` (magic link path) now route new/incomplete users to `/onboard`
- [x] Middleware updated — authenticated users allowed at `/onboard`
- [x] First intent pickup — `sessionStorage['intend:first_intent']` passed to ChatPanel, auto-fired on mount
- [x] **Full WebApp UI redesign** — new design system matching reference UI (Outfit/Plus Jakarta Sans/JetBrains Mono, gold/parchment palette, dark mode, glass panels)
- [x] AppShell rebuilt — theme persistence, mouse-edge RealityPanel trigger
- [x] NavPanel rebuilt — "Take Intend with you" channel pills (Telegram active, WhatsApp soon), Settings + Profile footer row
- [x] RealityPanel built — 2×2 macro grid, animated insight feed, purchasing power bar
- [x] ChatPanel redesigned — gold empty state, REQUEST_TX/INTEND_AGENT labels, `intend://` prefix, action chips, sessionStorage persistence
- [x] **Intelligent agent conversations** — `/api/chat` splits conversational vs financial at `intent_confidence >= 0.75`; conversational path uses `streamText` with full history; financial path unchanged
- [x] Conversation history threading — client sends last 20 messages; `messagesRef` snapshots before optimistic UI update
- [x] **Email auth fixed** — clean PATH A (Resend) / PATH B (Supabase) split; no double-request rate-limit error; `verifyOtp` tries both token types; `RESEND_FROM_EMAIL` env var for future domain
- [x] Gmail SMTP configured in Supabase dashboard — bypasses Resend sandbox restriction
- [x] Telegram bot link corrected to `@intend_auto_bot` in NavPanel and onboarding
- [x] Update DOCUMENTATION.md

---

## Deferred to Post-v0.5

- SEND fiat rails (Flutterwave for NGN/GHS, Wise for GBP/CNY/other) — depends on funding
- WhatsApp full pipeline (stub exists, `intend-whatsapp` on PM2)
- GROW, SAVE, EARN, INVEST primitives
- KYC Tier 2/3
- Yellow Card crypto-to-fiat Africa corridor
- Arbitrum yield layer
- Mobile app

---

## Invariants — Never Violate

1. Users never see protocol names, chain names, or DeFi terminology
2. Every execution requires confirmation OR the user has explicitly set autonomous mode
3. PROTECT is always semi-autonomous — no exceptions
4. PROTECT proactive monitor — when Intend fires an alert, it shows exactly what it observed and why
5. `DOCUMENTATION.md` is updated after every phase completes
6. No credentials, keys, or `.env` values are ever committed to the repo
