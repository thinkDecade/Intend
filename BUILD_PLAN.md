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

### Phase 0 — Foundation

- [ ] Push all untracked source files to `v0.5` remote (50+ TypeScript files)
- [ ] Fix env var mismatches: CDP key names, price API key name
- [ ] Add `execution_mode` column to `users` table via Supabase migration
- [ ] Add `DISABLED_PRIMITIVES = ['GROW','SAVE','EARN','INVEST']` constant to `packages/decision/src/strategy/index.ts`
- [ ] Rename `MOVE` → `SEND` in all user-facing text: formatter, UI copy, confirmation messages (types unchanged)
- [ ] Replace `vercel.json` with `netlify.toml`
- [ ] Update DOCUMENTATION.md

---

### Phase 1 — Execution Modes

- [ ] Collapse `AutomationLevel` type to `ExecutionMode: 'autonomous' | 'semi_autonomous'`
- [ ] Update permission gate: autonomous mode skips confirmation, generates receipt instead
- [ ] Add mode-switch intent detection to context interpreter — highest priority pass, runs before primitive classification
- [ ] Mode-switch updates session state in Redis immediately + persists to `users` table
- [ ] PROTECT mode hardcoded to `semi_autonomous` in permission gate regardless of user's global setting
- [ ] Update settings page UI — clear toggle with plain English explanation of both modes
- [ ] Update DOCUMENTATION.md

---

### Phase 2 — Language Aperture

- [ ] Rewrite context interpreter prompt from classification to open reasoning: "What does this person want their money to do?" — structured output preserved, reasoning path widened
- [ ] Add assumptions layer: Intend states assumptions rather than asking for clarification. Example: "I'm reading this as: protect your GHS savings from depreciation. Here's my plan." Clarification only fires if intent is ambiguous AND consequence irreversible.
- [ ] Test with indirect, emotional, and vague financial statements
- [ ] Update DOCUMENTATION.md

---

### Phase 3 — PROTECT Intelligence

- [ ] Add `forward_signal` to UFM — hedge score trend (current vs 30-day trajectory), not just point-in-time
- [ ] All strategy plans have access to `ufm.forward_signal` — can surface timing context in confirmation messages
- [ ] Build `apps/bot/src/proactive-monitor.ts` — polls every 6 hours, checks hedge score per user region, checks for unprotected exposure, fires alert when threshold crossed
- [ ] Build proactive alert message format (see example above) — shows what Intend observed, what's at risk, proposed action
- [ ] Wire to `intend-cron` PM2 process alongside existing reminder scheduler
- [ ] Update DOCUMENTATION.md

---

### Phase 4 — OpenClaw Refactor

- [ ] Update `/.openclaw/workspace/WORKSPACE.md` — define agent lanes (Intelligence, Decision, Execution), handoff JSON schema, session state contract, which model each lane uses
- [ ] Refactor `apps/bot/src/pipeline.ts` → thin normalizer + OpenClaw gateway client (~60 lines, down from ~200)
- [ ] Refactor `apps/web/src/app/api/chat/route.ts` → same gateway, unified session with Telegram
- [ ] Run `openclaw doctor --fix` and verify `dmPolicy = 'open'`
- [ ] Update DOCUMENTATION.md

---

### Phase 5 — Critical Fixes

- [ ] Fix `apps/web/src/app/api/confirm/route.ts` — after marking intent confirmed, call `dispatch()` (web execution gap)
- [ ] Populate `balance_snapshot` before dispatch in `action-dispatcher.ts`
- [ ] Build missing `packages/execution/src/conflict-resolver.ts`
- [ ] Implement real `checkProtocolHealth()` in `agentkit/yield.ts` using DefiLlama TVL API (≥$10M threshold)
- [ ] Update DOCUMENTATION.md

---

### Phase 6 — Netlify Deployment

- [ ] Configure `netlify.toml` at root
- [ ] Set all env vars in Netlify dashboard (migrate from Vercel)
- [ ] Update `apps/web/next.config.mjs` if needed for Netlify runtime
- [ ] Deploy and verify: all four routes, auth flow, chat, API endpoints
- [ ] Update DNS if domain needs rewiring
- [ ] Update DOCUMENTATION.md

---

### Phase 7 — Landing Page + Final Polish

- [ ] Update landing page — 4 primitives, dual execution mode messaging, PROTECT intelligence angle
- [ ] Remove WhatsApp "coming soon" (replaced with honest "Telegram + Web for v0.5")
- [ ] Full end-to-end smoke test: Telegram + Web, both execution modes, all 4 primitives
- [ ] Update DOCUMENTATION.md

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
