# INTEND — Session Handover
> Last updated: 2026-04-19 (v0.5_updated, Phases 9–14 complete)
> For: the next Claude session picking up post-v0.5_updated work
> Read CLAUDE.md → BUILD_PLAN.md → this file. Earlier Phase-8 history is preserved below for archaeology.

---

## v0.5_updated — Phases 9–14 (this cycle)

Five phases shipped on top of the Phase-8 product baseline. Live code is on `main`; Netlify auto-deploys.

| Phase | What landed | Key files |
|-------|-------------|-----------|
| 9 — ERP schema + retrieval | `economic_reality_profile` table (7 dimensions + reserved `vector(1536)` for v0.6), backfill from `users.region`/`local_currency`, repo `getERP`/`upsertERP`, system prompt injects ERP ahead of UFM | `supabase/migrations/005*.sql`, `packages/data/src/repositories/erp.ts`, `packages/intelligence/src/system-prompt.ts` |
| 10 — Onboarding rebuild | Onboarding moved from settings form to a conversational agent at `/onboard`; first-intent surfaced post-completion via sessionStorage hand-off into ChatPanel | `apps/web/src/app/onboard/*`, `apps/web/src/app/onboard/actions.ts` |
| 11 — Skill verification pipeline | SHA-256 manifest pinning per playbook; `skills:verify`/`skills:hash` scripts; `setSkillAuditHook` contract; execution dispatcher emits `event_log.event_type='skill_invoked'` after every `buildTransaction` | `packages/skills/scripts/{verify,hash}.mjs`, `packages/skills/src/audit.ts`, `packages/execution/src/action-dispatcher.ts` |
| 12 — Telegram parity | `users.telegram_id` (BIGINT) + `whatsapp_id` writable from settings; `/connect` 6-digit code consumed by `linkTelegram`/`unlinkTelegram` server actions; cross-channel e2e smoke covers ERP roundtrip, link consumption, telegram→user resolution, session persistence | `apps/web/src/app/app/actions.ts`, `apps/web/src/app/app/settings/settings-form.tsx`, `tests/cross-channel.e2e.ts` |
| 13 — Passkey auth | `006_passkey_credentials.sql` (credentials + single-use challenges, RLS); five `/api/auth/passkey/*` routes; login page passkey button at equal prominence with OTP; settings `PasskeySection`; dashboard `PasskeyNudge` (7-day suppression). `generateLink → verifyOtp` bridge mints the Supabase session server-side; per-email surrogate prevents enumeration; counter check prevents authenticator cloning | `supabase/migrations/006_passkey_credentials.sql`, `packages/data/src/repositories/passkeys.ts`, `apps/web/src/app/api/auth/passkey/**`, `apps/web/src/app/login/page.tsx`, `apps/web/src/app/app/settings/passkey-section.tsx`, `apps/web/src/app/app/_components/PasskeyNudge.tsx` |
| 14 — Doc + handover | This file, `DOCUMENTATION.md` (passkey + ERP sections), `apps/CLAUDE.md` (channel surface), `CLAUDE.md` (v0.5_updated framing + four-active-primitives table + wipe-script note), `tasks/done.md` entries | docs only |

### Build status (end of this cycle)
- `npx turbo run build` — all 10 packages green; web build: 17 routes incl. all 5 passkey endpoints.
- Tests: `tests/cross-channel.e2e.ts` smoke passes locally; full suite is the Security + QA agent's responsibility.

### Operational note — environment reset
- `scripts/wipe-users.sql` + `scripts/wipe-users.ts` — clears auth.users, all user-derived application tables, and per-user Redis namespaces (`intend:session:*`, `intend:link_code:*`, `intend:plan:*`, `intend:balances:*`, `intend:protect:cooldown:*`, `onboard:*`).
- The TypeScript half handles auth + Redis. Application-table truncation runs through the SQL file because the `event_log` append-only `BEFORE UPDATE/DELETE` trigger blocks both PostgREST deletes and the `ON DELETE SET NULL` cascade out of `users`. `TRUNCATE … CASCADE` bypasses the trigger.
- Used at the close of this cycle to start the demo run from a clean slate. **Telegram bot has no in-process user state** — Redis was already empty (0 `intend:session:telegram:*` keys at wipe time), so no bot restart required.

---

## What This Session Accomplished (Phase 8)

This session took Intend from a deployed but basic v0.5 shell to a fully working product experience. Everything below was built, fixed, and pushed to `main`. Netlify auto-deploys on push — latest code is live at https://intendfinance.netlify.app.

---

## 1. Onboarding Flow — COMPLETE

**Problem:** New users landed straight in the dashboard with no context.

**What was built:**
- `apps/web/src/app/onboard/page.tsx` — server component, checks auth, loads `dbUser`, redirects if already onboarded
- `apps/web/src/app/onboard/onboard-flow.tsx` — 6-step framer-motion `AnimatePresence` wizard:
  1. Welcome — brand intro, capabilities
  2. Profile — display name, local currency, execution mode
  3. Account — glass card showing email, mode, wallet note
  4. Fund — crypto/fiat deposit tabs
  5. First Intent — suggestion chips + free text → saves to `sessionStorage['intend:first_intent']`
  6. Channels — Telegram deeplink `https://t.me/intend_auto_bot`, WhatsApp coming soon
- `apps/web/src/app/onboard/actions.ts` — `saveOnboardingProfile()` and `completeOnboarding()` server actions

**Database migrations pushed to Supabase:**
- `supabase/migrations/003_onboarding_flag.sql` — added `onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE` to `users` table
- `supabase/migrations/004_reset_onboarding.sql` — reset all existing users to `FALSE` so they go through the new flow

**Routing:**
- Both `verifyOtp()` (6-digit OTP path) and `ensureUserRecord()` (magic link path) now check `onboarding_completed` and route to `/onboard` if false
- Middleware allows authenticated users at `/onboard`
- On completion, `markOnboardingComplete()` sets flag → redirects to `/app`
- ChatPanel picks up `sessionStorage['intend:first_intent']` on mount and fires it automatically after 600ms

---

## 2. Full WebApp UI Redesign — COMPLETE

**Problem:** The existing app UI didn't match the reference design.

**Design system (all in `apps/web/src/app/globals.css`):**
- Font stack: Outfit (display), Plus Jakarta Sans (body), JetBrains Mono (mono) — loaded via `apps/web/src/app/fonts.ts`
- Palette: `--accent: #D4A24A` (gold), `--parchment: #F5F0E6`, `--cinder: #1A1612`
- Dark mode via `html.dark` class, toggled by NavPanel, persisted to `localStorage['intend-theme']`
- CSS namespace prefixes: `lp-` (landing), `ob-` (onboarding), `app-nav-*`, `app-shell-*`

**Key component changes:**

| Component | File | What Changed |
|-----------|------|-------------|
| AppShell | `_components/AppShell.tsx` | Theme state owner, mouse-edge RealityPanel trigger, userId passed down |
| NavPanel | `_components/NavPanel.tsx` | "Take Intend with you" section with Telegram (gold pill, active) + WhatsApp (dimmed, soon) pills; Settings + Profile footer row with icons |
| RealityPanel | `_components/RealityPanel.tsx` | Right slide-in: 2×2 macro grid (Avg Inflation, Hedge Score, Real Yield, FX Trend), animated insight feed, purchasing power progress bar, dismiss X button |
| ChatPanel | `_components/ChatPanel.tsx` | Gold empty state, REQUEST_TX/INTEND_AGENT role labels, `intend://` input prefix, action chips [Add funds][Pay][Transfer][Clear], sessionStorage persistence |

---

## 3. Intelligent Agent Conversations — COMPLETE

**Problem:** All messages (including "hi") went through financial intent classification. No conversation history. Agent gave wrong/robotic responses to casual messages.

**What was fixed in `apps/web/src/app/api/chat/route.ts`:**
- Added `history?: HistoryMessage[]` to request body (capped at last 20 messages)
- Split into two paths based on `intent_confidence`:
  - **Conversational** (`< 0.75`): `streamText()` with full history + `buildConversationalSystemPrompt()` — warm persona, no plan generation
  - **Financial** (`>= 0.75`): existing `generatePlan()` → `streamConfirmationMessage()` → plan SSE event
- Added `buildConversationalSystemPrompt(ufm, displayName)` — warm financial concierge persona
- Removed a broken `buildUFM` re-export at the bottom that caused a compile error

**ChatPanel (`_components/ChatPanel.tsx`):**
- `messagesRef` keeps stable ref to messages for history snapshots
- History captured before optimistic UI update (before setMessages)
- Messages saved to `sessionStorage['intend:chat_messages']` on every change (streaming excluded)
- Restored from sessionStorage on mount — survives client-side navigation between `/app` pages
- Clear button removes both state and sessionStorage entry

---

## 4. Email Authentication — COMPLETE (and painful)

**The saga:** Three separate bugs, fixed in order.

### Bug 1: Wrong type in `admin.generateLink`
`type: 'email'` → changed to `type: 'magiclink'` (TypeScript type system fix)

### Bug 2: Double-request rate limit ("0 seconds" error)
**Root cause:** Code called `admin.generateLink` first, then Resend failed, then fell back to `signInWithOtp` — Supabase saw two requests for the same email and blocked the second.

**Fix in `apps/web/src/app/login/actions.ts`:** Two completely separate paths, never both run:
```
PATH A (RESEND_API_KEY set):
  1. admin.generateLink → generates OTP without triggering Supabase email send
  2. Resend sends branded email
  3. If Resend fails → fall back to supabase.auth.signInWithOtp (safe because admin.generateLink
     doesn't count against Supabase's email rate limiter)

PATH B (no RESEND_API_KEY):
  1. supabase.auth.signInWithOtp only
```

### Bug 3: Resend sandbox restriction
**Error:** "You can only send testing emails to your own email address (thinkdecade@gmail.com)"

**Root cause:** Resend free tier sandbox mode — can only send to the Resend account owner until a domain is verified.

**Fix:** `RESEND_FROM_EMAIL` env var added — when a domain is verified in Resend and this is set, branded email activates with no code change. Until then, Resend fails gracefully and PATH A falls back to Supabase's SMTP.

**Gmail SMTP configured in Supabase dashboard:**
- Authentication → Email → SMTP Settings → custom SMTP enabled
- `smtp.gmail.com:587`, username: `thinkdecade@gmail.com`, Gmail App Password in password field
- This is what actually delivers emails now. 500 emails/day. Works for all recipients.

### Bug 4: `verifyOtp` wrong token type
Fixed: now tries `type: 'email'` first, then `type: 'magiclink'` as fallback, so verification works regardless of which path generated the token.

### Bug 5: New users bypassed onboarding
`verifyOtp()` always redirected to `/app`. Fixed: now checks `onboarding_completed` and routes to `/onboard` if false (matching what `auth/callback` already did).

---

## 5. Other Fixes

- Telegram link: corrected to `https://t.me/intend_auto_bot` everywhere (was `@IntendFinanceBot` in some places)
- `markOnboardingComplete(userId)` added to `packages/data/src/repositories/users.ts`
- `onboarding_completed: boolean` added to `UserRow` interface in same file

---

## Current State of Key Files

```
apps/web/src/app/
├── login/actions.ts              ← Two-path email auth (PATH A/B), verifyOtp with onboarding routing
├── auth/callback/route.ts        ← ensureUserRecord() routes new users to /onboard
├── middleware.ts                 ← Allows /onboard for authenticated users
├── onboard/
│   ├── page.tsx                  ← Server component, auth check
│   ├── onboard-flow.tsx          ← 6-step framer-motion wizard
│   └── actions.ts                ← saveOnboardingProfile, completeOnboarding
├── app/
│   ├── _components/
│   │   ├── AppShell.tsx          ← Theme owner, RealityPanel trigger
│   │   ├── NavPanel.tsx          ← Channel pills, footer row
│   │   ├── RealityPanel.tsx      ← Right slide-in macro panel
│   │   └── ChatPanel.tsx         ← History, persistence, action chips
│   └── api/
│       └── chat/route.ts         ← Conversational/financial split, history threading
├── globals.css                   ← Full design system (2400+ lines)
└── fonts.ts                      ← Outfit, Plus Jakarta Sans, JetBrains Mono

packages/data/src/repositories/
└── users.ts                      ← markOnboardingComplete() added, UserRow has onboarding_completed

supabase/migrations/
├── 003_onboarding_flag.sql       ← onboarding_completed column
└── 004_reset_onboarding.sql      ← Reset all users (already applied to Supabase)
```

---

## Infrastructure State

| Service | Status | Notes |
|---------|--------|-------|
| Netlify | ✅ Live | https://intendfinance.netlify.app — auto-deploys on `main` push |
| Supabase | ✅ Live | Project: `intend-v0.5-staging`, ref: `otlnqhgixnnppktrzxmj` |
| Supabase SMTP | ✅ Gmail | smtp.gmail.com:587, from: thinkdecade@gmail.com |
| Upstash Redis | ✅ Live | Signal cache, session state, plan cache |
| GCP VM | ⚠️ Stale | Telegram bot running but hasn't had `git pull` since Phase 7 |

**Netlify env vars set:**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `RESEND_API_KEY`,
`CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`,
`EXCHANGE_RATE_API_KEY`, `COINMARKETCAP_API_KEY`, `BASE_SEPOLIA_RPC_URL`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`

**Not yet set (optional — for branded email):**
`RESEND_FROM_EMAIL` — add when a domain is verified in Resend (resend.com/domains)

---

## What's Working End-to-End (Tested This Session)

- ✅ New user signs up → gets OTP email (via Gmail SMTP) → enters code → routed to `/onboard`
- ✅ Onboarding 6-step flow completes → `onboarding_completed = true` in DB → redirected to `/app`
- ✅ First intent from onboarding auto-fires in chat on `/app` mount
- ✅ Casual messages ("hi", "how are you") get warm conversational responses, not financial plans
- ✅ Financial messages ("grow $500", "send $300 to Kwame") get plan generation flow
- ✅ Conversation history persists across screen switches (sessionStorage)
- ✅ Dark/light mode toggle persists across sessions

---

## What Needs Doing Next

### High priority
1. **`/app/profile` page** — referenced in NavPanel footer but doesn't exist yet. Either build a basic profile page or redirect to `/app/settings` for now.
2. **GCP VM update** — SSH to `thinkdecade@34.63.81.169`, run `cd ~/intend && git pull origin main && pm2 restart all`. Bot hasn't picked up Phase 8 changes.
3. **On-chain balance display** — `/api/portfolio` returns 0 for wallet balance. AgentKit wallet read needs to be wired.

### Medium priority
4. **Custom email domain** — verify a domain at resend.com/domains → add `RESEND_FROM_EMAIL=Intend <hello@yourdomain.com>` to Netlify → branded gold email template activates
5. **History page filtering** — date range + primitive filter UI not built yet
6. **WhatsApp full pipeline** — webhook stub exists at `apps/whatsapp/`, pipeline not wired

### Known gaps (not blockers)
- Cross-channel handoff (Telegram → Web) exists in code but untested end-to-end
- GROW, SAVE, EARN, INVEST gated (friendly message shown) — re-enable in v0.6
- `/claim/[token]` page exists but MOVE claim flow not testable without on-chain execution

---

## Git State

- Branch: `main`
- Latest commit: `4e526eb` — "docs: update DOCUMENTATION.md and BUILD_PLAN.md for Phase 8"
- All Phase 8 work committed and pushed
- No uncommitted changes

---

## How to Continue

```bash
# Pull latest
git pull origin main

# Type-check (no build needed for most changes)
node node_modules/typescript/bin/tsc -p apps/web/tsconfig.json --noEmit

# Commit pattern used this session
git commit -m "$(cat <<'EOF'
type: short description

Longer explanation if needed.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

git push origin main
# Netlify deploys automatically — usually 2-3 minutes
```

---

## Key Decisions Made This Session

1. **No separate signup page** — OTP flow handles both new and returning users; `onboarding_completed` flag distinguishes them
2. **sessionStorage for chat persistence** — simpler than lifting state to a context/provider; survives client-side navigation, clears on tab close (intentional)
3. **Two-path email auth** — never let PATH A and PATH B both run in the same request; prevents double-hit rate limit errors
4. **Gmail SMTP as interim email solution** — no custom domain needed, 500/day limit, zero code involvement; swap to Resend when domain is ready
5. **`messagesRef` for history** — avoids stale closure in `sendMessage` without adding `messages` as a `useCallback` dependency

---

*INTEND Phase 8 · 2026-04-18 · thinkDecade*
