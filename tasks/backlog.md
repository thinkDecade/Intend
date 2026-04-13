# INTEND — Task Backlog

> Orchestrator manages this file.
> Agents move tasks to in_progress.md when claimed.
> See tasks/README.md for protocol.

---

## Phase 0 — Foundation (Week 1)

All Phase 0 tasks must complete before any Phase 1 task begins.
Phase 0 gate: all 9 infrastructure criteria pass 100%.

---

### [P0-01] Turborepo monorepo initialisation
**Agent:** Channels Agent
**Priority:** P0 — Day 1
**Definition of done:** `yarn dev` runs without errors on all apps. TypeScript strict mode active across all packages. ESLint configured.
**Dependencies:** None

---

### [P0-02] Supabase schema migration
**Agent:** Channels Agent
**Priority:** P0 — Day 1
**Definition of done:** All 14 tables exist. RLS active on all. Append-only triggers verified: attempt `UPDATE event_log` → rejected. All enums, indexes, and views created.
**Note:** Schema is complete at `supabase/migrations/001_initial_schema.sql` — do not modify, just run it.
**Dependencies:** P0-01

---

### [P0-03] Upstash Redis setup
**Agent:** Channels Agent
**Priority:** P0 — Day 1
**Definition of done:** Redis client configured in `packages/data/src/redis.ts`. Set/get/delete verified in integration test. TTL expiry verified.
**Dependencies:** P0-01

---

### [P0-04] Model router implementation
**Agent:** Intelligence Agent
**Priority:** P0 — Day 2
**Definition of done:** `withFallback()` implemented with all 4 providers. Unit test: revoke Claude API key → GPT-4o responds within 10 seconds → response functionally identical.
**Dependencies:** P0-01

---

### [P0-05] Context Interpreter with Zod schema
**Agent:** Intelligence Agent
**Priority:** P0 — Day 2
**Definition of done:** `generateObject()` call with IntentionSchema. 50-message test set runs. Minimum 40/50 classified correctly at confidence > 0.80.
**Dependencies:** P0-04

---

### [P0-06] UFM Builder
**Agent:** Intelligence Agent
**Priority:** P0 — Day 2
**Definition of done:** UFM assembled for test user with all required fields populated. Signal freshness enforcement working — stale signal returns error, not stale data.
**Dependencies:** P0-03, P0-05

---

### [P0-07] AgentKit CDP wallet setup
**Agent:** Execution Agent
**Priority:** P0 — Day 3
**Definition of done:** AgentKit installed. CDP API key configured. Test wallet created on Base Sepolia. ETH + USDC balance reads verified. Address stored in wallets table.
**Dependencies:** P0-02

---

### [P0-08] Signal Engines (FX, APY, prices, gas)
**Agent:** Execution Agent
**Priority:** P0 — Day 3
**Definition of done:** All four signal types fetch successfully and cache to Redis with correct TTLs. FX: 4h TTL. APY: 6h TTL. Prices: 15min TTL. Gas: 5min TTL.
**Dependencies:** P0-03

---

### [P0-09] Hedge score computation
**Agent:** Execution Agent
**Priority:** P0 — Day 3
**Definition of done:** Hedge scores computed for Turkey (TRY) > 0.70, UK (GBP) < 0.25, Brazil (BRL) between 0.40 and 0.65. Scores match expected thresholds.
**Dependencies:** P0-08

---

### [P0-10] OpenClaw gateway + WORKSPACE.md
**Agent:** Intelligence Agent
**Priority:** P0 — Day 4
**Definition of done:** Health check returns `{"ok":true,"status":"live"}`. Agent responds in Telegram. WORKSPACE.md loaded (confirmed in gateway logs). Model routes through Vercel AI SDK.
**Dependencies:** P0-04, P0-06

---

### [P0-11] Telegram bot scaffold
**Agent:** Channels Agent
**Priority:** P0 — Day 4
**Definition of done:** Bot receives a message and runs the full pipeline. Returns response. `/balance` shows test wallet balance. HMAC webhook verification active.
**Dependencies:** P0-07, P0-10

---

### [P0-12] Session Manager
**Agent:** Channels Agent
**Priority:** P0 — Day 5
**Definition of done:** Session created on first message. State persists in Redis. Send second message 25 minutes later — session still active with correct state. Supabase durable backup syncing.
**Dependencies:** P0-03, P0-11

---

### [P0-13] Atomicity Wrapper
**Agent:** Execution Agent
**Priority:** P0 — Day 5
**Definition of done:** Rollback test: simulate failure at step 2 of 3. Test wallet balance unchanged. event_log shows `execution_rolled_back`. No phantom records in positions table.
**Dependencies:** P0-07

---

### [P0-14] Confirmation Reminder Scheduler (intend-cron)
**Agent:** Channels Agent
**Priority:** P0 — Day 5
**Definition of done:** CONFIRMING intent created → 3 reminder rows in confirmation_reminders. Gentle reminder delivered at exactly T+5min. Scheduler queries `scheduled_for <= NOW()` correctly.
**Dependencies:** P0-12

---

### [P0-15] WhatsApp Meta Business Account + sandbox
**Agent:** Channels Agent
**Priority:** P0 — Day 5
**Definition of done:** Meta Business Account created at developers.facebook.com. Cloud API application submitted (not Business App path). Sandbox test message sent and received.
**Dependencies:** None

---

### [P0-16] Security hardening
**Agent:** Security + QA Agent
**Priority:** P0 — Day 6–7
**Definition of done:** gitleaks pre-commit hook installed and tested (attempt commit with fake API key pattern → rejected). HMAC verification active on Telegram webhooks. Environment variable audit complete — no secrets in code.
**Dependencies:** P0-11

---

### [P0-GATE] Phase 0 acceptance gate
**Agent:** Security + QA Agent
**Priority:** P0 — End of Day 7
**Definition of done:** All 9 infrastructure criteria in the acceptance gate pass 100%. Sign off in tasks/done.md. Phase 1 may begin.
**Dependencies:** P0-01 through P0-16

---

## Phase 1 — Primitive Build (Week 2)

Phase 1 tasks may begin only after Phase 0 gate passes.

---

### [P1-01] Skill Registry + all 6 JSON playbooks
**Agent:** Execution Agent
**Priority:** P1 — Day 8
**Definition of done:** Registry routes to correct playbook for each protocol. All 6 playbooks validate against schema. `buildTransaction()` produces valid ABI-encoded unsigned transactions for Aave V3 supply and Uniswap V3 swap.
**Dependencies:** P0-GATE

---

### [P1-02] Asset Resolution Engine
**Agent:** Execution Agent
**Priority:** P1 — Day 8
**Definition of done:** ETH → USDC, WBTC → USDC, EURC → USDC conversion paths all produce correct `net_amount_available` with slippage calculated. Hard reject tested for slippage > 0.5%.
**Dependencies:** P1-01

---

### [P1-03] PROTECT primitive — full flow
**Agent:** Execution Agent (strategy) + Intelligence Agent (confirmation)
**Priority:** P1 — Day 8
**Definition of done:** Full PROTECT flow on Base Sepolia. TRY scenario (hedge_score > 0.65): message → classification → plan → confirmation preview → user confirms → Aave V3 supply → tx_hash returned → positions table updated → event_log complete.
**Dependencies:** P1-02

---

### [P1-04] GROW primitive — full flow
**Agent:** Execution Agent
**Priority:** P1 — Day 9
**Definition of done:** $100 USDC → protocol scoring → Morpho or Aave V3 deposit on testnet → receipt token verified → withdrawal tested and returns correct amount + accrued yield.
**Dependencies:** P1-02

---

### [P1-05] CONVERT primitive — full flow
**Agent:** Execution Agent
**Priority:** P1 — Day 9
**Definition of done:** ETH → USDC on testnet DEX. Slippage simulation runs. Rate transparency preview shows all 4 numbers (mid-market, spread, your rate, minimum received). Tx executes.
**Dependencies:** P1-02

---

### [P1-06] MOVE primitive — intend-to-intend path
**Agent:** Execution Agent
**Priority:** P1 — Day 10
**Definition of done:** $50 USDC from test wallet A to test wallet B. Balance A: -$50. Balance B: +$50. event_log complete. Corridor routing logic implemented.
**Dependencies:** P1-02

---

### [P1-07] MOVE primitive — claim flow
**Agent:** Execution Agent + Channels Agent (claim page)
**Priority:** P1 — Day 10
**Definition of done:** $50 to non-Intend email. Claim URL generated. Visit URL. Claim to wallet. Funds received. T+72h simulation: auto-return executes. Sender balance restored.
**Dependencies:** P1-06

---

### [P1-08] SAVE primitive — full flow
**Agent:** Execution Agent
**Priority:** P1 — Day 11
**Definition of done:** Create 'Test Fund' goal with $500 target. $100 deposit. Progress query returns correct amount and trajectory. Withdrawal returns correct amount. Goal status updates.
**Dependencies:** P1-04

---

### [P1-09] EARN primitive — detection and routing
**Agent:** Execution Agent + Channels Agent
**Priority:** P1 — Day 11
**Definition of done:** Simulate incoming $20 USDC transfer on Base Sepolia. Notification delivered within 60 seconds. User taps "Grow it" → routes to GROW flow with amount pre-filled.
**Dependencies:** P1-04

---

### [P1-10] INVEST primitive — full flow
**Agent:** Execution Agent
**Priority:** P1 — Day 12
**Definition of done:** Buy $50 ETH equivalent. Position created with correct cost basis. Portfolio query shows P&L calculation. Sell executes and returns USDC to wallet.
**Dependencies:** P1-05

---

### [P1-11] SPEND Rail 3 — Crypto Checkout
**Agent:** Execution Agent
**Priority:** P1 — Day 12
**Definition of done:** Pay 10 USDC to validated address. Checksum validation works. 6-char confirmation required and enforced. tx_hash returned as receipt. ENS resolution tested.
**Dependencies:** P1-05

---

### [P1-12] All 8 primitives end-to-end from Telegram
**Agent:** Channels Agent + Execution Agent
**Priority:** P1 — Day 13
**Definition of done:** All 8 primitives reachable via natural language from Telegram. Each produces a tx_hash or equivalent completion signal. Happy path verified for each.
**Dependencies:** P1-03 through P1-11

---

### [P1-13] Conflict resolution
**Agent:** Intelligence Agent + Channels Agent
**Priority:** P1 — Day 13
**Definition of done:** Send PROTECT confirmation. Before confirming, send MOVE intent. CONFLICT state surfaces correctly. "Park" option works — MOVE proceeds, PROTECT resumes after. "Finish first" option works.
**Dependencies:** P1-12

---

### [P1-14] First private beta user
**Agent:** Orchestrator
**Priority:** P1 — Day 14
**Definition of done:** First real user completes at least one intention end-to-end. Transaction verified on testnet. $100 cap enforced. Feedback documented in tasks/.
**Dependencies:** P1-12

---

## Phase 1 — Polish and Channels (Week 3)

---

### [P1-15] WebApp /app route — chat + portfolio
**Agent:** Channels Agent
**Priority:** P1 — Day 15
**Definition of done:** User can log in, see balance, send a message that executes a primitive, and see the confirmation preview stream in real time — all in the browser.
**Dependencies:** P1-12

---

### [P1-16] Cross-channel state sync
**Agent:** Channels Agent
**Priority:** P1 — Day 15
**Definition of done:** Start SAVE goal creation on Telegram. Switch to WebApp. Continue in same session. No context lost. Verified with 3 different test cases.
**Dependencies:** P1-15

---

### [P1-17] WebApp goals + positions + history pages
**Agent:** Channels Agent
**Priority:** P1 — Day 16–17
**Definition of done:** Goals page renders all active goals with correct amounts, progress, APY. Positions page renders active positions. History shows last 50 intents with filters working. tx_hash links to basescan.org.
**Dependencies:** P1-15

---

### [P1-18] WhatsApp handler — all 8 primitives
**Agent:** Channels Agent
**Priority:** P1 — Day 17
**Definition of done:** WhatsApp message → pipeline → response. PROTECT happy path verified on WhatsApp sandbox. All 8 primitives accessible.
**Dependencies:** P1-12

---

### [P1-19] SPEND Visa MCP integration — sandbox
**Agent:** Execution Agent
**Priority:** P1 — Day 18
**Definition of done:** Test merchant payment initiated via Visa MCP sandbox. Trusted Agent setup flow works. Authorisation code received and logged.
**Dependencies:** P1-12

---

### [P1-20] End-to-end security audit
**Agent:** Security + QA Agent
**Priority:** P1 — Day 19
**Definition of done:** All items in Security Checklist pass. gitleaks scan clean. HMAC verification verified. Prompt injection test passes. Address validation tested. 6-char confirmation tested. Private key search returns zero matches.
**Dependencies:** P1-19

---

### [P1-21] Full test suite
**Agent:** Security + QA Agent
**Priority:** P1 — Day 19
**Definition of done:** Test suite achieves >= 90% coverage on financial logic (intelligence, decision, execution packages). All rollback scenarios confirmed. All error states tested.
**Dependencies:** P1-20

---

### [P1-22] Expand private beta to 5–10 users
**Agent:** Orchestrator
**Priority:** P1 — Day 20
**Definition of done:** 5+ additional users onboarded. All complete at least one intention. Zero fund incidents. Feedback documented.
**Dependencies:** P1-21

---

### [P1-GATE] v0.5 Final Acceptance Gate
**Agent:** Security + QA Agent
**Priority:** P1 — Day 21
**Definition of done:** All 5 acceptance gate categories pass 100%. All 10 success metrics verified. Sign off in tasks/done.md. v0.5 complete.
**Dependencies:** P1-22

---

## Icebox (Phase 2+)

Tasks explicitly deferred from v0.5. Do not begin without explicit direction.

- Proactive monitoring loop
- Arbitrum yield layer expansion
- Multiple offramp partners per corridor
- Visa interchange revenue activation
- KYC Tier 2 and Tier 3
- 1inch aggregation
- Li.Fi cross-chain routing
- BENJI / BUIDL tokenized RWAs
- Mobile app (iOS / Android)
- Scheduled and conditional intentions
- BTCPay Server full integration

---

*Last updated: April 2026 · Orchestrator manages this file*
