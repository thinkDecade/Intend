# INTEND — Tasks In Review

> Agent moves task here when work is complete and ready for Security + QA review.

---

## [P1-15] WebApp /app — Chat + Portfolio
Agent: Channels Agent
Completed: 2026-04-14
Branch: v0.5

**Deliverables:**

### Auth
- `apps/web/src/middleware.ts` — session refresh via `getUser()` + auth guard: `/app` → redirect `/login`, `/login` (authenticated) → redirect `/app`
- `apps/web/src/app/login/page.tsx` — email → 6-digit OTP flow (2-step, no page reload)
- `apps/web/src/app/login/actions.ts` — `signInWithOtp()`, `verifyOtp()`, `signOut()` server actions

### App Shell
- `apps/web/src/app/app/layout.tsx` — auth check + three-panel shell (nav | chat | portfolio)
- `apps/web/src/app/app/_components/NavPanel.tsx` — left nav with active route highlighting + sign out
- `apps/web/src/app/app/actions.ts` — `signOut()` server action for nav

### Chat Interface
- `apps/web/src/app/app/page.tsx` — server component: fetches initial portfolio data, renders two panels
- `apps/web/src/app/app/_components/ChatPanel.tsx` — full streaming chat client component
  - SSE stream reader (fetch + ReadableStream)
  - Message rendering with blinking cursor during stream
  - ConfirmationCard: amber primary button, dual-confirm for amounts > $500
  - Confirm/Cancel sends to `/api/confirm`
  - Empty state with example intentions
- `apps/web/src/app/api/chat/route.ts` — streaming POST endpoint
  - Auth guard via Supabase getUser()
  - buildUFM → interpretIntent → generatePlan → streamConfirmationMessage
  - SSE events: `text` | `plan` | `error` | `done`
  - Clarification questions streamed inline (no plan event)

### Portfolio Panel
- `apps/web/src/app/app/_components/PortfolioPanel.tsx` — right panel client component
  - Total value, wallet balances, yield positions, savings goals with progress bars
  - Refresh button → `/api/portfolio`
- `apps/web/src/app/api/portfolio/route.ts` — GET endpoint for portfolio data

### Confirm/Cancel
- `apps/web/src/app/api/confirm/route.ts` — POST endpoint: marks intent confirmed/cancelled in DB

### Sub-pages
- `apps/web/src/app/app/goals/page.tsx` — goals list with progress bars
- `apps/web/src/app/app/positions/page.tsx` — active positions
- `apps/web/src/app/app/history/page.tsx` — intent history with primitive badges + status
- `apps/web/src/app/app/settings/page.tsx` — account info stub

### Config fixes
- `apps/web/next.config.mjs` — transpilePackages: added `@intend/decision`, `@intend/signals`
- `apps/web/tsconfig.json` — target: ES2022 (was ES2017, broke BigInt in skills)
- `packages/decision/package.json` — removed stray `@intend/skills` dependency (not imported)
- `packages/data/src/repositories/users.ts` — added `getUserByWebAppUid()` + `getUserByEmail()`
- `apps/web/src/app/globals.css` — Intend design system (amber #C8943A, dark theme, CSS variables)

**Design decisions:**
- No external CSS framework — plain CSS with CSS variables for portability
- `text/event-stream` SSE (not AI SDK `toDataStream`) — allows including plan metadata in stream
- Confirmation executes asynchronously (web marks intent confirmed, execution layer picks it up)
- `exactOptionalPropertyTypes` compliance throughout client components

**Verified:** `yarn typecheck` 10/10 packages pass

---

## [P1-01 through P1-13] Phase 1 Primitives + Pipeline Wiring
Agent: Execution Agent + Channels Agent
Completed: 2026-04-14
Branch: v0.5

**Deliverables:**

### Skill Registry (P1-01)
- `packages/skills/src/types.ts` — SkillPlaybook, SkillAction, SkillRequest, BuildTransactionResult, contract_from_arg
- `packages/skills/src/loader.ts` — loadPlaybook(), clearPlaybookCache(), JSON validation
- `packages/skills/src/encoder.ts` — encodeAction() with ABI encoding via viem
- `packages/skills/src/registry.ts` — buildTransaction(), getPlaybook(), listProtocols()
- `packages/skills/src/resolvers/token.ts` — symbol→address for Base mainnet + Sepolia (USDC, USDT, WETH, WBTC, DAI, XAUT, cbBTC)
- `packages/skills/src/resolvers/amount.ts` — toWei(), fromWei(), applySlippage() via viem parseUnits
- Playbooks: `aave_v3_base.json`, `morpho_base.json`, `aerodrome_base.json`, `uniswap_v3_base.json`, `lido_base.json`, `erc20_transfer_base.json`

### Asset Resolver + Permission Gate (P1-02)
- `packages/decision/src/asset-resolver.ts` — resolveAssets(), candidate ranking, MAX_SLIPPAGE_PCT=0.5%, MAX_COST_PCT=1.5%
- `packages/decision/src/permission-gate.ts` — checkPermission(), KYC tier limits (tier_0=$100 → tier_3=$100K)

### Strategy Generators (P1-03 through P1-10) — all 8 primitives
- `packages/decision/src/strategy/helpers.ts` — makePlanId(), makeStep(), rateTransparency(), feeSummary()
- `packages/decision/src/strategy/protect.ts` — hedge score tier routing (4 tiers)
- `packages/decision/src/strategy/grow.ts` — protocol scoring formula + yield deployment
- `packages/decision/src/strategy/convert.ts` — tiered DEX routing with rate transparency
- `packages/decision/src/strategy/move.ts` — EVM + ENS + claim link routing
- `packages/decision/src/strategy/save.ts` — goal-based Aave V3 deposit
- `packages/decision/src/strategy/earn.ts` — inbound routing to best yield
- `packages/decision/src/strategy/invest.ts` — conviction buy with market/limit framing
- `packages/decision/src/strategy/spend.ts` — USDC transfer + 6-char address confirmation for >$200
- `packages/decision/src/strategy/index.ts` — generatePlan() router

### Action Dispatcher (P1-11)
- `packages/execution/src/action-dispatcher.ts` — dispatch() → buildTransaction() → provider.sendTransaction()
- Wired to atomicity wrapper with channel, balance_snapshot

### Pipeline + Execution Wiring (P1-12, P1-13)
- `apps/bot/src/pipeline.ts` — generatePlan() replaces stub, buildStrategyContext() for per-primitive context
- `apps/bot/src/handlers/callbacks.ts` — confirm: callback → dispatch() → AgentKit → Base chain
- Conflict resolution fully operational: park / finish_first / cancel_pending all handled
- `'all'` amount → ufm.present.total_usd_value resolved in all 8 primitives
- `exactOptionalPropertyTypes` compliance across all packages

**Verified:** `yarn typecheck` 10/10 packages pass

---

## [P0-04] Model router implementation
Agent: Intelligence Agent
Completed: 2026-04-13
Branch: v0.5

**Deliverables:**
- `packages/intelligence/src/model-router.ts` — `withFallback()` + `getModel()` for all 4 tiers
- `packages/intelligence/src/system-prompt.ts` — UFM-injected system prompt builder
- `packages/intelligence/src/context-interpreter.ts` — `interpretIntent()` via `generateObject()` + Zod
- `packages/intelligence/src/confirmation.ts` — `generateConfirmationMessage()` + `streamConfirmationMessage()`
- `packages/intelligence/src/ufm-builder.ts` — wired stub (awaits P0-03 + P0-08)
- `packages/intelligence/src/index.ts` — exports all of the above
- `packages/core/src/types/intention.ts` — `IntentionSchema` (Zod) + `IntentionObject`
- `packages/core/src/types/ufm.ts` — `UserFinancialModel` interface
- `packages/core/src/types/execution.ts` — `ExecutionPlan` type

**Pinned AI SDK versions:**
- `ai@4.3.19` + `@ai-sdk/anthropic@^1.2.12`, `@ai-sdk/openai@^1.3.24`, `@ai-sdk/google@^1.2.22`, `@ai-sdk/groq@^1.2.9`
- All versions compatible with `@ai-sdk/provider@1.x` (LanguageModelV1)

**Verified:**
- `yarn typecheck` — 10/10 packages pass

## [P0-05] Context Interpreter with Zod schema
Agent: Intelligence Agent
Completed: 2026-04-13
Branch: v0.5

**Deliverables:**
- Context Interpreter implemented in `packages/intelligence/src/context-interpreter.ts`
- `IntentionSchema` (Zod) implemented in `packages/core/src/types/intention.ts`
- All 8 primitives in enum, all parameters typed, confidence threshold documented
- Prompt injection defence: UFM in system prompt only, raw_input in user turn only
- `clarification_needed` set when `intent_confidence < 0.75`

**Note:** Full 50-message acceptance test requires live API keys. Architecture is complete and type-safe.

## [P0-03] Upstash Redis setup
Agent: Channels Agent
Completed: 2026-04-13
Branch: v0.5

**Deliverables:**
- `packages/data/src/redis.ts` — singleton client, TTL constants, MAX_AGE_MS, typed cacheSet/cacheGet/cacheDel, isFresh helper, key helpers
- `packages/data/src/supabase.ts` — server-side singleton client
- `packages/data/src/repositories/users.ts` — getUserById, getUserByTelegramId, getUserByWhatsAppId, updateLastActive
- `packages/data/src/repositories/event-log.ts` — logEvent (append-only INSERT)
- `packages/data/src/repositories/intents.ts` — createIntent, updateIntentStatus, getPendingConfirmations
- `packages/data/src/repositories/positions.ts` — getActivePositions, insertPosition, closePosition
- `packages/data/src/repositories/goals.ts` — getActiveGoals, createGoal, updateGoalBalance

**Verified:** `yarn typecheck` 10/10 pass

## [P0-08] Signal Engines (FX, APY, prices, gas)
Agent: Execution Agent
Completed: 2026-04-13
Branch: v0.5

**Deliverables:**
- `packages/signals/src/types.ts` — FxSignal, ApySignal, PriceSignal, GasSignal, HedgeSignal interfaces
- `packages/signals/src/fx.ts` — ExchangeRate-API + Redis cache (4h TTL), strict staleness guard
- `packages/signals/src/apy.ts` — DefiLlama yields API + Redis cache (6h TTL), getBestApy helper
- `packages/signals/src/prices.ts` — CoinGecko + Redis cache (15min TTL), batch price fetch, stable shortcut
- `packages/signals/src/gas.ts` — Base RPC eth_feeHistory, display cache (5min), fresh-for-execution guard
- `packages/signals/src/hedge-score.ts` — CLAUDE.md formula verbatim, tier classification, Redis cache (4h)

**Verified:** `yarn typecheck` 10/10 pass

## [P0-09] Hedge score computation
Agent: Execution Agent
Completed: 2026-04-13
Branch: v0.5

**Deliverables:**
- Implemented in `packages/signals/src/hedge-score.ts`
- Formula: fx_component(0.40) + inflation_component(0.40) + volatility_component(0.20)
- All 4 tiers: none / monitor / suggest / emergency
- Acceptance thresholds: TR (TRY) > 0.70 ✓, GB (GBP) < 0.25 ✓, BR (BRL) 0.40–0.65 ✓

## [P0-16] Security hardening
Agent: Security + QA Agent
Completed: 2026-04-14
Branch: v0.5

**Deliverables:**
- `packages/core/src/security/hmac.ts` — shared HMAC utility
  - `verifyTelegramWebhook()` — token header comparison (timingSafeEqual)
  - `verifyWhatsAppWebhook()` — X-Hub-Signature-256 HMAC-SHA256 (timingSafeEqual)
  - `signPayload()` — generic HMAC for internal service calls
- `apps/bot/src/index.ts` — refactored to use shared `verifyTelegramWebhook()`, removed local duplicate
- `apps/whatsapp/src/index.ts` — full webhook server with HMAC verification on every POST, Meta challenge handler on GET
- `.gitleaks.toml` — extends gitleaks default ruleset + Intend-specific patterns (Supabase JWT, CDP keys, Telegram token, Upstash token)
- `scripts/pre-commit` — hook script: runs `gitleaks protect --staged` if available, falls back to regex scan
- `scripts/install-hooks.sh` — one-command hook installer (`bash scripts/install-hooks.sh`)
- `scripts/audit-secrets.ts` — source tree secret scanner, 10 patterns, CI-ready (`exit 1` on findings)
- `package.json` — `yarn audit:secrets` + `yarn setup:hooks` scripts

**Security rules verified in code:**
  - `timingSafeEqual` used in all HMAC comparisons (no timing oracle)
  - No secrets in any source file (audit-secrets scan confirmed clean)
  - Service role key never in any NEXT_PUBLIC_ variable
  - User input never concatenated into prompts (UFM in system slot only)
  - All LLM outputs parsed via Zod schema

**Verified:** `yarn typecheck` 10/10 pass

## [P0-14] Confirmation Reminder Scheduler (intend-cron)
Agent: Channels Agent
Completed: 2026-04-14
Branch: v0.5

**Deliverables:**
- `packages/data/src/repositories/reminders.ts`
  - `scheduleReminders()` — inserts 3 rows (T+5, T+20, T+35) on intent entering CONFIRMING
  - `getDueReminders()` — queries `is_sent = FALSE AND scheduled_for <= NOW()` with intents JOIN (only sends if intent still `confirmed`)
  - `markReminderSent()` — idempotent `is_sent = TRUE` update
  - `getExpiredIntents()` — finds `confirmed` intents where `confirmed_at < NOW() - 40min`
- `apps/bot/src/cron.ts` — `intend-cron` PM2 process
  - 60-second poll loop, runs immediately on startup
  - Sends due reminders via Telegram with [Confirm] [Cancel] inline keyboard
  - Expires stale intents: cancels DB record, suppresses remaining reminders, sends soft user message
  - `logEvent()` on every reminder sent and every expiry
  - Per-intent error isolation — one failure never blocks the rest
- `apps/bot/src/pipeline.ts` — `scheduleReminders()` called when plan enters CONFIRMING state
- `apps/bot/package.json` — `dev:cron` + `start:cron` scripts

**Verified:** `yarn typecheck` 10/10 pass

## [P0-13] Atomicity Wrapper
Agent: Execution Agent
Completed: 2026-04-14
Branch: v0.5

**Deliverables:**
- `packages/execution/src/atomicity-wrapper.ts` — `executeAtomic()` with full step lifecycle
  - Balance snapshot stored in `intents.rollback_state` before execution
  - `intents.status` tracked: `executing` → `complete` / `failed`
  - `event_log` records: `execution_started`, `execution_step_complete`, `execution_step_failed`, `execution_rolled_back`, `execution_complete`
  - Completed steps rolled back in reverse order on any failure
  - Post-rollback balance verification via optional `verifyBalance()` callback
  - ETH gas tolerance (0.002 ETH) in balance mismatch check
  - `AtomicityError` — step name, rollback status, verification status
  - `BalanceMismatchError` — critical escalation when post-rollback balance < snapshot
- Exported from `packages/execution/src/index.ts`

**Verified:** `yarn typecheck` 10/10 pass

## [P0-10] OpenClaw gateway + WORKSPACE.md
Agent: Intelligence Agent
Completed: 2026-04-14
Branch: v0.5

**Deliverables:**
- `.openclaw/workspace/WORKSPACE.md` — full agent behaviour definition
  - Identity + voice
  - All 8 primitive recognition patterns with disambiguation rules
  - Rate transparency rules (CONVERT / MOVE)
  - Confidence threshold rules
  - UFM context injection rules
  - Conversation boundaries (8 rules)
  - Confirmation rules (format + security)
  - Conflict resolution flow
  - Automation level matrix
- Gateway health check, PM2, and server config documented in CLAUDE.md

**Note:** Gateway startup (`openclaw doctor --fix`, `systemctl --user restart openclaw-gateway`) runs on intend-server (34.63.81.169) — requires live server. WORKSPACE.md content is complete.

## [P0-11] Telegram bot scaffold
Agent: Channels Agent
Completed: 2026-04-14
Branch: v0.5

**Deliverables:**
- `apps/bot/src/index.ts` — bot entry point, polling (dev) + webhook (prod), HMAC verification
- `apps/bot/src/pipeline.ts` — full agent pipeline: UFM → interpretIntent → confirmation preview → inline keyboard
- `apps/bot/src/session.ts` — session state machine, Redis primary + Supabase durable backup
- `apps/bot/src/formatter.ts` — Telegram message formatting helpers
- `apps/bot/src/handlers/commands.ts` — all 8 commands: /start /balance /portfolio /history /help /settings /connect /cancel
- `apps/bot/src/handlers/callbacks.ts` — inline keyboard: confirm / cancel / park / finish_first / cancel_pending
- Conflict resolution UI — parallel intent detection with 3-option inline keyboard
- `apps/bot/package.json` — all @intend/* workspace deps wired

**Verified:** `yarn typecheck` 10/10 pass

## [P0-07] AgentKit CDP wallet setup
Agent: Execution Agent
Completed: 2026-04-13
Branch: v0.5

**Deliverables:**
- `packages/execution/src/agentkit/wallets.ts` — `createWallet`, `loadWallet`, `getOrCreateWallet` via `CdpEvmWalletProvider`
- `packages/execution/src/agentkit/balances.ts` — `readBalances` (ETH + ERC-20 via `readContract`)
- Token addresses for Base mainnet + Base Sepolia (USDC, USDT, WETH, WBTC, DAI, XAUT)
- `.env.example` corrected: `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET` (AgentKit 0.10.x naming)
- `packages/execution/src/index.ts` — exports all AgentKit functions

**Verified:** `yarn typecheck` 10/10 pass

## [P0-06] UFM Builder
Agent: Intelligence Agent
Completed: 2026-04-13
Branch: v0.5

**Deliverables:**
- `packages/intelligence/src/ufm-builder.ts` — fully wired to @intend/data + @intend/signals
- Strict staleness enforcement: any stale signal → SignalStaleError with user-facing message
- Accepts pre-fetched balances from AgentKit caller (P0-07 hook point)
- UserNotFoundError for unknown users
- `yarn typecheck` 10/10 pass
