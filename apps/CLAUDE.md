# INTEND — Channels Agent Context

> Read /CLAUDE.md first. This file adds channel-layer specifics.
> This agent owns: apps/web/* + apps/bot/* + apps/whatsapp/* + packages/data/src/*

---

## What This Agent Builds

Every surface the user touches. The Telegram bot that receives their messages. The WebApp they open on their laptop. The WhatsApp handler when they message from their phone. The database repositories that persist everything. The session management that keeps state across messages and channels.

**This agent's deliverables:**
- `apps/bot/src/` — Telegram bot handlers, commands, message pipeline
- `apps/whatsapp/src/` — WhatsApp Cloud API webhooks and templates
- `apps/web/` — Next.js 14 App Router: landing page + /app dashboard
- `packages/data/src/` — Supabase + Upstash clients + all repository classes
- `supabase/migrations/001_initial_schema.sql` — already complete, do not modify without coordination

---

## The Channel Architecture Principle

All three channels share one backend. A user is the same person regardless of channel. Session state, financial state, and conversation history are unified.

```
Telegram message → Channel Normalizer → Agent Pipeline → Response
WhatsApp message → Channel Normalizer → Agent Pipeline → Response
WebApp message   → Channel Normalizer → Agent Pipeline → Response (streamed)
```

The Channel Normalizer strips channel-specific formatting and produces:
```typescript
interface NormalizedMessage {
  user_id:  string;
  channel:  'telegram' | 'whatsapp' | 'web';
  text:     string;
  metadata: {
    telegram_message_id?: number;
    whatsapp_message_id?: string;
    webapp_session_id?: string;
  };
}
```

---

## Session Architecture

### Redis (Primary — fast)
```
Key:  session:{channel}:{user_id}
TTL:  30 minutes from last activity
Data: {
  state: 'idle' | 'clarifying' | 'confirming' | 'executing' | 'conflict',
  pending_plan: ExecutionPlan | null,
  parked_intent_id: string | null,
  new_message_held: string | null,
  history: Array<{ role: 'user' | 'assistant', content: string, ts: string }>,
  active_lane_ids: string[]
}
```

### Supabase sessions table (Durable backup)
- Synced on every state change
- Used for: Redis eviction recovery, cross-channel handoff, audit
- Schema already live in `supabase/migrations/001_initial_schema.sql`

### Cross-channel state handoff
When a user switches from Telegram to WebApp mid-conversation:
1. WebApp loads session from Supabase (Redis may be channel-specific)
2. State reconstructed — conversation continues without loss
3. No context lost. No "please repeat your request."

---

## Telegram Bot Specification

### Commands

| Command | Behaviour |
|---------|-----------|
| `/start` | Create user record. Create wallet via AgentKit CDP. Send welcome message. |
| `/balance` | Show wallet balances across all assets with USD values. Read-only, no LLM call. |
| `/portfolio` | Show active GROW/INVEST positions + SAVE goals with current values. |
| `/history` | Last 10 completed intents. Paginated via inline keyboard. |
| `/help` | Summary of what Intend can do + example phrases per primitive. |
| `/settings` | Automation level, spend limits, notification preferences, linked channels. |
| `/connect` | Generate 6-digit channel link code. TTL: 5 minutes. |
| `/cancel` | Cancel any pending confirmation. Clear CONFIRMING state. Return to IDLE. |

### Inline Keyboard Rules

Every confirmation uses Telegram inline keyboards. Never ask users to type "yes" or "no".

```typescript
// Primary action: clear labelling with exact amount
{ text: "Protect $1,200 →", callback_data: "confirm:{intent_id}" }

// Always include cancel
{ text: "Cancel", callback_data: "cancel:{intent_id}" }
```

### Message Format Rules
- Bold for amounts, asset names, key numbers
- Never use markdown tables in Telegram — they render poorly on mobile
- Numbers: `$1,200.00` not `$1200`
- Percentages: `5.8%` not `5.823%`
- Max confirmation message: 400 characters
- Max notification message: 180 characters

### Confirmation Reminder Sequence

```
T+5min:   Gentle reminder with [Confirm] [Cancel] buttons
T+20min:  Direct reminder with urgency ("expires in 20 minutes")
T+35min:  Final reminder ("expires in 5 minutes")
T+40min:  Expiry — plan cancelled, nothing moved, soft message
```

The `intend-cron` PM2 process runs the reminder scheduler. Three rows in `confirmation_reminders` table per CONFIRMING intent. The scheduler queries for `is_sent = FALSE AND scheduled_for <= NOW()` every minute.

---

## WhatsApp Handler Specification

### Setup Status
- Meta Business Account: must be created at developers.facebook.com
- WhatsApp Cloud API application: submit Week 1 (NOT the Business App path)
- Sandbox: available immediately — develop and test against sandbox from day 1
- Production approval: 2–7 business days typical
- If not approved by Week 3: code is ready, not user-facing. Zero product impact.

### Webhook Verification
```typescript
// HMAC verification on every incoming webhook — mandatory
function verifyWebhookSignature(req: Request): boolean {
  const signature = req.headers['x-hub-signature-256'];
  const expected = `sha256=${hmac(WEBHOOK_SECRET, req.rawBody)}`;
  return timingSafeEqual(signature, expected);
}
```

### Message Templates

Pre-approved Meta templates required for business-initiated messages. Interactive replies to user messages do not require templates.

| Template Name | Use Case | Variables |
|--------------|----------|-----------|
| `intend_inbound_alert` | EARN notification | `{{1}}` = amount, `{{2}}` = asset |
| `intend_reminder_gentle` | T+5min reminder | `{{1}}` = primitive name |
| `intend_reminder_urgent` | T+20min reminder | none |
| `intend_execution_complete` | Any completion | `{{1}}` = action, `{{2}}` = amount, `{{3}}` = detail |
| `intend_claim_received` | MOVE claim | `{{1}}` = sender, `{{2}}` = amount, `{{3}}` = claim URL |

### WhatsApp Constraints
- Quick Reply buttons: max 3 per message, label max 20 characters
- List messages: max 10 items (for showing protocol options)
- 6-character address confirmation: use a text prompt — "Reply with the last 6 characters of the address to confirm."
- Session window: 24-hour free-form after user initiates. Templates required outside window.

---

## WebApp — Screen Specification

### Public Routes (no auth)

```
/          Landing page — static, served from CDN
           Sections: hero, product explanation, 6 global personas,
           how it works (3 steps), early access CTA
           Note: new landing page being designed separately

/login     Supabase Auth magic link → email → 6-digit OTP → /app
```

### Authenticated Routes (Supabase JWT required)

```
/app                Main dashboard
  Left panel:       Navigation: Overview, Goals, Positions, History, Settings
  Center:           Chat interface — streaming confirmation previews
  Right panel:      Balance by asset, active positions, active goals, recent txs

/app/goals          All SAVE goals — card per goal with progress bar,
                    current/target amount, APY, projected completion date

/app/positions      All GROW + INVEST positions
                    GROW: protocol, asset, amount, APY, yield earned
                    INVEST: asset, amount, cost basis, unrealised P&L
                    Withdraw/sell actions inline

/app/history        All intents, reverse chronological
                    Filterable by: primitive, date range, status
                    Each row: primitive badge, description, amount,
                    status, date, tx_hash (links to basescan.org)

/app/settings       Profile, channels, automation level, spend limits,
                    notification preferences, KYC tier

/claim/{token}      Claim page for MOVE transfers to non-users
                    Public — token validates access
                    Options: create account, bank payout, crypto wallet
```

### Streaming Confirmation Preview Component

The most important UI component. Renders when Intend presents an execution plan.

- **Stream:** Text renders token by token using Vercel AI SDK `streamText()`
- **Buttons:** Rendered only after streaming completes — never mid-stream
- **Primary action:** Full-width Amber (#C8943A) button
- **Large amounts (> $500):** Dual confirmation — primary button then secondary "Are you sure?"
- **Crypto checkout > $200:** Inline text input for 6-char address confirmation — primary button disabled until correct input

---

## Database Repositories (packages/data/src/repositories/)

One repository file per domain entity. Each exports typed async functions. Never raw SQL in app code — always through repository functions.

```typescript
// Example structure:
packages/data/src/repositories/
  users.ts          // createUser, getUserById, updateAutomationLevel, linkChannel
  intents.ts        // createIntent, updateIntentStatus, getIntentsByUser
  sessions.ts       // getSession, upsertSession, clearPendingPlan
  positions.ts      // createPosition, closePosition, getActivePositions
  life_horizons.ts  // createGoal, updateGoalProgress, getActiveGoals
  claims.ts         // createClaim, claimFunds, expireClaim
  event_log.ts      // insertEvent (INSERT only — never UPDATE/DELETE)
  revenue_events.ts // insertRevenue (INSERT only — never UPDATE/DELETE)
```

### Supabase Client Setup

```typescript
// packages/data/src/supabase.ts
import { createClient } from '@supabase/supabase-js';

// Server-side: service role key — bypasses RLS
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // Never expose to client
);

// Client-side WebApp: anon key — RLS enforces user isolation
export const supabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

**Critical:** Service role key bypasses RLS entirely. Only use server-side. Never in browser or any client-facing code. `NEXT_PUBLIC_` prefix means it ships to the browser — never put service role key in any `NEXT_PUBLIC_` variable.

### Redis Client Setup

```typescript
// packages/data/src/redis.ts
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url:   process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
```

---

## Key Redis Namespaces (This Agent Uses)

```
session:{channel}:{user_id}     TTL: 30 minutes
user:{id}:balances              TTL: 2 minutes (UI display only)
```

This agent reads but does not write:
```
signal:*            Written by Signals package (Execution agent)
user:{id}:ufm       Written by Intelligence agent
```

---

## Channel Identity Linking

```typescript
// /connect command flow:
// 1. User runs /connect on Telegram
// 2. Generate 6-digit code, store in Redis with TTL: 5 minutes
//    Key: link_code:{code}, Value: { telegram_id, generated_at }
// 3. User enters code in WebApp settings
// 4. WebApp calls: UPDATE users SET telegram_id = ? WHERE webapp_uid = ?
// 5. Session state now accessible from both channels
```

---

## Environment Variables This Agent Needs

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=         # Server only
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=           # For HMAC verification

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_WEBHOOK_SECRET=           # For HMAC verification

# Next.js
NEXTAUTH_URL=
NEXTAUTH_SECRET=
```

All values from GCP Secret Manager. Never in .env files committed to repo.

---

## Test Coverage Requirements

90% minimum test coverage on:
- Session state machine — all transitions (IDLE → CLARIFYING → CONFIRMING → EXECUTING)
- Cross-channel state handoff — start on Telegram, continue on WebApp
- Webhook HMAC verification — valid and invalid signatures
- Confirmation reminder scheduler — T+5, T+20, T+35, T+40 timing
- Repository functions — all critical paths with test database

**Critical test:** Start a SAVE goal creation on Telegram, switch to WebApp. Verify the session loads correctly and the conversation continues with no context loss.

---

*Channels Agent · apps/* + packages/data/*
