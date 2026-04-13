# INTEND — Security + QA Agent Context

> Read /CLAUDE.md first. This file adds security and QA specifics.
> This agent owns: tests/* (all test files)
> This agent reviews: every other package — but NEVER modifies source code.

---

## What This Agent Does

Reviews every module built by other agents before it ships. Writes and runs the test suite. Validates all rollback scenarios. Executes the acceptance gate. Owns the risk register. The product handles real user money — this agent's job is to make sure no user ever loses funds due to a bug.

**This agent never modifies source code directly.** It:
1. Writes tests in `/tests/`
2. Reviews work in `tasks/review.md` with specific findings
3. Flags blockers in `tasks/blocked.md`
4. Signs off completed work in `tasks/done.md`
5. Runs the full acceptance gate before any production deploy

---

## Live Threat Intelligence — Read Before Every Review

These are real incidents from the current threat landscape. Several are directly relevant to Intend's exact stack.

### CRITICAL: OpenClaw is an Active Infostealer Target

**Source:** rekt.news/identity-theft-2 — February 2026

OpenClaw — the exact runtime Intend uses — is now a primary infostealer target. RedLine, Lumma, and Vidar variants all updated to sweep `.openclaw/` directories. What they steal:

- `openclaw.json` — gateway authentication token. Steal this = remote access to the agent
- `soul.md`, `AGENTS.md`, `MEMORY.md` — complete behavioral blueprint of the AI assistant
- Cryptographic signing keys stored in `.openclaw/`

Over 30,000 exposed OpenClaw instances were found on Shodan between January and February 2026. CVE-2026-25253 documented. Anthropic, Microsoft, and Coinbase all issued advisories.

**Mandatory checks for every security review:**
```
□ OpenClaw gateway bound to 127.0.0.1 only — never 0.0.0.0
□ GCP firewall: port 18789 blocked externally — localhost only
□ ~/.openclaw/ directory permissions: 700 (owner only)
□ ~/.openclaw/openclaw.json not readable by any other system user
□ Server not listed on Shodan — verify at shodan.io before launch
□ GCP external firewall: only ports 22, 80, 443 open
□ WORKSPACE.md contains no secrets, credentials, or private data
□ Test: external curl to port 18789 on server external IP must FAIL
```

---

### CRITICAL: AI-Generated Code Oracle Error — Moonwell / Aave V3 / Base

**Source:** rekt.news/moonwell-rekt — February 2026

A governance proposal on Moonwell (which uses Aave V3 on Base — exactly Intend's primary yield protocol) was co-authored by Claude Opus 4.6. The AI-generated code had one missing multiplication in a cbETH oracle configuration. A $2,200 asset was reported at $1.12. Liquidation bots drained $1.78 million in four minutes. The commit passed GitHub Copilot review and human review without the math error being caught.

**The lesson:** AI-generated code that touches price calculations must be reviewed by a human who verifies the math, not just that the code compiles and runs.

**Mandatory price sanity check — add to every execution path:**
```typescript
// Add to: packages/execution/src/agentkit/yield.ts
//         packages/skills/resolvers/amount.ts

interface PriceRange { min: number; max: number; }

const PRICE_SANITY_RANGES: Record<string, PriceRange> = {
  'ETH':   { min: 500,   max: 20000  },
  'WBTC':  { min: 10000, max: 500000 },
  'cbETH': { min: 500,   max: 25000  }, // must track ETH — not raw cbETH/ETH ratio
  'USDC':  { min: 0.95,  max: 1.05   },
  'USDT':  { min: 0.95,  max: 1.05   },
  'EURC':  { min: 0.90,  max: 1.15   },
  'XAUT':  { min: 1000,  max: 10000  },
};

function validatePrice(asset: string, price: number): void {
  const range = PRICE_SANITY_RANGES[asset];
  if (!range) return; // unknown asset — log but do not block
  if (price < range.min || price > range.max) {
    throw new PriceSanityError(
      `${asset} price ${price} outside safe range [${range.min}, ${range.max}]. Aborting.`
    );
  }
}
// Call before EVERY execution that uses a price feed.
// If check fails: abort execution, log to event_log, surface message to user.
```

**Pool depth check — add to DEX routing:**
```typescript
// Before routing any swap:
const poolTVL = await getPoolTVL(selectedPool);
if (poolTVL < tradeSize * 10) {
  throw new InsufficientLiquidityError(
    `Pool TVL ($${poolTVL}) is less than 10x trade size ($${tradeSize}). Risk of severe price impact.`
  );
}
```

**Flag in code review:** Any commit co-authored by an AI model that touches price feeds, oracle configurations, or financial math calculations must include a comment documenting the human math verification. Missing this comment = block merge.

---

### HIGH: Private Key Compromise = Full Protocol Control

**Source:** rekt.news/iotex-rekt — February 2026

IoTeX lost $4.4 million when a single compromised admin private key gave an attacker full control. A single key was the only lock on the door.

**Mandatory key security audit:**
```
□ No private keys in any file that could reach git (gitleaks enforced)
□ GCP service account: least privilege — not project owner
□ SSH: key-pair only — password authentication disabled
□ Rotate all API keys immediately if any suspicion of exposure
□ AgentKit CDP: spending policies enforced at wallet level
□ Telegram bot token: if compromised, attacker can impersonate Intend to users
□ Supabase service role key: bypasses all RLS — treat as highest-privilege secret
□ Document rotation procedure for every secret before launch
```

---

### HIGH: Supply Cap Donation Exploit — 9-Month Patience Attack

**Source:** rekt.news/venus-protocol-rekt4 — March 2026

An attacker spent 9 months building a position in Venus Protocol, then exploited a known donation attack vector to bypass supply caps, extracting $3.7 million. The protocol had been rekt four times.

**What this means:**
- Protocol health checks must run before EVERY execution — not just at startup
- Never assume protocol-level checks are the final defense
- TVL monitoring catches acute attacks. Slow position-building attacks require monitoring
- DefiLlama exploit feed must be checked on every yield protocol execution

---

### HIGH: Price Impact Catastrophe — Wrong Pool Selected

**Source:** rekt.news/price-impact-kills — March 2026

A $50 million trade was routed through a $73K pool. Every contract performed correctly. The router just picked the wrong pool. Price impact made the trade nearly worthless.

**What this means for Intend's DEX routing:**
- simulateSwap must run against the actual pool that will execute — not an approximation
- Pool depth check is mandatory before any swap (see code above)
- The 0.5% slippage limit is a floor, not a replacement for pool selection logic

---

### MEDIUM: DPRK IT Workers — Insider Threat

**Source:** rekt.news/digital-parasites — February 2026 + SEAL Frameworks

North Korean operatives are infiltrating crypto projects through remote work, contributing code while exfiltrating data over months.

**Currently:** Solo build. Low risk. **Post-raise:** Read the SEAL DPRK IT Workers framework before hiring any remote contributors: frameworks.securityalliance.org/dprk-it-workers/overview

---

## The SEAL Frameworks Reference

Security Alliance (SEAL) maintains the most comprehensive Web3 security framework library. Read before every review cycle.

**Live reference:** frameworks.securityalliance.org

| Framework | When to Read |
|-----------|--------------|
| AI Security | Before every intelligence layer review |
| Wallet Security | Before every execution layer review |
| Incident Management | Before launch — read once, internalize |
| Operational Security | Before Phase 1 completion |
| Monitoring | Before Phase 1 completion |
| Infrastructure | Before production deploy |
| DevSecOps | Before Phase 1 completion |
| Supply Chain | Before every new dependency added |
| DPRK IT Workers | When team expands post-raise |

**Emergency:** SEAL 911 — securityalliance.org/sos — 24/7 crypto incident response.

---

## Security Checklist (Run After Every Module Review)

### SEAL AI Security Framework
```
□ Prompt injection: user input never concatenated into system prompt
□ UFM injected only in defined system prompt slot
□ generateObject() with Zod schema on ALL LLM outputs — no raw JSON.parse
□ Agent cannot execute without explicit user confirmation
□ OpenClaw gateway: localhost only — verify 127.0.0.1 binding
□ ~/.openclaw/ permissions: 700
□ WORKSPACE.md contains no secrets
□ Skill schema validation before any ClawHub skill activation
□ AI-generated math commits: require human math verification comment
□ Test: injection attempt → no transaction, safe clarification response
```

### SEAL Wallet Security Framework
```
□ User private keys never on intend-server
□ AgentKit CDP keys in Coinbase TEE
□ No private keys in database, logs, environment files, API responses
□ gitleaks active — test with fake key pattern
□ Card credentials: vault_token_id only
□ Telegram bot token treated as a secret
□ Supabase service role key: server-side only — never NEXT_PUBLIC_
```

### Price / Oracle Safety (Moonwell Lesson)
```
□ validatePrice() runs before every execution using a price feed
□ simulateSwap runs against actual pool
□ Pool TVL > 10× trade size before routing
□ DEX quote max 30 seconds old at execution time
□ If price sanity fails: abort + log + user message
□ AI-generated oracle/price code: human math audit documented in commit
```

### Payment / Crypto Security
```
□ Full address shown — never truncated
□ ENS: both name AND resolved address shown
□ 6-char confirmation for amounts > $200 to new addresses
□ 3 failed confirmations = hard cancel
□ Invoice re-fetched at execution (not just confirmation)
□ Address change between preview and execution = ABORT
```

### Transaction / Atomicity
```
□ Atomicity wrapper on all multi-step executions
□ Rollback tested at each step
□ Balance verified from chain after rollback
□ event_log INSERT on every execution step
□ event_log: no UPDATE or DELETE paths exist
```

### SEAL Infrastructure / DevSecOps
```
□ GCP firewall: only 22, 80, 443 external. 18789 absent.
□ SSH: key-pair only
□ Server not indexed on Shodan
□ Secrets in GCP Secret Manager only
□ HMAC verification on all webhooks
□ Rate limiting on all public API routes
□ CORS: owned domains only
□ npm audit before every deploy
□ All npm packages reviewed before adding
```

### SEAL Monitoring
```
□ DefiLlama exploit feed monitored
□ TVL alert: >30% drop in 24h triggers pause
□ Protocol health check before EVERY execution
□ Disk alert at 70%
□ Error rate monitoring active
□ Large transaction anomaly detection active
```

### Database Security
```
□ RLS on all 14 Supabase tables — tested
□ event_log UPDATE/DELETE: trigger blocks — tested
□ revenue_events UPDATE/DELETE: trigger blocks — tested
□ Monetary amounts as NUMERIC — never FLOAT
□ telegram_id / user_id as BIGINT — not INT
```

---

## The Full Acceptance Gate

### Gate 1: Infrastructure

| Criterion | Test | Pass |
|-----------|------|------|
| Gateway healthy | `curl http://127.0.0.1:18789/health` = `{"ok":true}` | |
| Gateway localhost-only | `curl http://EXTERNAL_IP:18789/health` must FAIL | |
| ~/.openclaw/ permissions | `ls -la ~/.openclaw/` = 700 | |
| GCP firewall | Only 22, 80, 443 external. 18789 absent. | |
| Telegram bot responds | `/start` → welcome within 5 seconds | |
| Supabase — 14 tables | `SELECT tablename FROM pg_tables WHERE schemaname='public'` = 14 | |
| Append-only enforcement | Attempt `UPDATE event_log` → must fail | |
| Redis working | Set, read, TTL expiry all verified | |
| Model fallback | Revoke Claude key → GPT-4o within 10s | |
| Atomicity rollback | Fail at step 2 → balance unchanged, rolled_back in log | |
| gitleaks clean | Fake key commit → rejected | |
| Disk < 70% | `df -h /dev/root` | |
| Not on Shodan | Check shodan.io for port 18789 on external IP — no results | |

### Gate 2: Classification

| Criterion | Test | Pass |
|-----------|------|------|
| All 8 primitives | 50 messages (5 per primitive). Min 40/50 at confidence > 0.80. | |
| Ambiguous handled | 5 ambiguous → clarifying question, no crashes | |
| Prompt injection | Injection string → no tx, safe response | |

### Gate 3: Execution (Base Sepolia)

| Primitive | Test | Pass |
|-----------|------|------|
| PROTECT | TRY scenario → Aave V3 → tx_hash. Price sanity check ran. | |
| GROW | $100 → Morpho → receipt → withdrawal correct. Health check ran. | |
| MOVE | $50 A→B. Balances correct. event_log complete. | |
| MOVE claim | Email → URL → claim → receive. Auto-return works. | |
| CONVERT | ETH → USDC. 4-number preview. Slippage ≤ 0.5%. Pool depth checked. | |
| SAVE | Goal created. Deposit. Progress correct. Withdrawal correct. | |
| EARN | Incoming $20 → notification within 60s → GROW route works. | |
| INVEST | Buy $50. Cost basis. P&L query. Sell returns USDC. | |
| SPEND | 10 USDC. 6-char confirmation. tx_hash as receipt. | |

### Gate 4: Safety and Security

| Criterion | Test | Pass |
|-----------|------|------|
| Zero fund incidents | All event_logs: zero fund-loss execution errors | |
| Prompt injection blocked | Injection → no tx | |
| 6-char confirmation | 3 wrong attempts → hard cancel | |
| Price sanity fires | cbETH at $1.12 → execution aborted | |
| Pool depth fires | Pool < 10× trade → warning surfaced | |
| Address change abort | Address changes between preview/execute → ABORT | |
| Private keys absent | Search all logs/responses for key patterns. Zero. | |
| OpenClaw unexposed | External curl to 18789 fails | |

### Gate 5: Channel and UX

| Criterion | Test | Pass |
|-----------|------|------|
| Cross-channel sync | PROTECT on Telegram → continue on WebApp | |
| Reminder timing | T+5, T+20, T+35, T+40 fire correctly | |
| Conflict resolution | New intent during CONFIRMING → CONFLICT → park/resume works | |
| Jargon audit | Zero forbidden terms in any message | |
| WhatsApp | Approved or application submitted | |

---

## Rollback Test Protocol

For every new execution path:

**Test 1 — Failure at step 1:** No transaction sent. Balance unchanged. `execution_rolled_back` in event_log.
**Test 2 — Failure at last step:** All intermediate steps rolled back. Starting balance restored.
**Test 3 — Network failure mid-execution:** RPC timeout caught. Rollback completes. No stuck states.
**Test 4 — Price sanity failure:** Invalid price detected pre-flight. Execution never starts. Clear user message.

All rollback tests must verify: balance via chain read (not cache), no phantom positions, `sessions.state = 'idle'`, complete rollback trail in event_log.

---

## Jargon Audit

Zero occurrences permitted in any user-facing message:

```
FORBIDDEN               USE INSTEAD
─────────────────────────────────────────────────────
Aave, Morpho, Aerodrome  → "a yield protocol" / "a market"
Uniswap, Curve           → "the exchange"
Base, mainnet            → "your wallet" / "in your account"
DeFi, blockchain         → describe the outcome
stake, staking           → "earn yield" / "put to work"
liquidity pool           → describe outcome
smart contract           → invisible infrastructure
bridge                   → invisible infrastructure
guaranteed, will         → "historically" / "typically"
We're excited            → state facts, no enthusiasm
```

---

## Forbidden Code Patterns

```typescript
// ❌ User input in prompt
const prompt = `User said: ${userMessage}`;

// ❌ Private key in code
const privateKey = "0xabcd...";

// ❌ Float for money
const amount: number = 1.1;

// ❌ UPDATE on event_log
await db.from('event_log').update({ ... });

// ❌ Cached balance for execution
const bal = await redis.get(`user:${id}:balances`);
await executeWith(bal);

// ❌ Raw LLM output without Zod
const plan = JSON.parse(await model.generate(prompt));

// ❌ Service role key client-side
process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY

// ❌ Float in DB for money
amount FLOAT  // must be NUMERIC(36,18)

// ❌ Swap without slippage simulation
await executeSwap(params);  // simulateSwap must run first

// ❌ Price used without sanity check
await executeYield(rawPrice);  // validatePrice() must run first

// ❌ Gateway on external interface
host: '0.0.0.0'  // must be '127.0.0.1'

// ❌ AI-generated oracle/price math without human math review comment
// Any commit co-authored by AI touching price feeds: block merge unless verified
```

---

## Incident Response Playbook

**Step 1 — Contain (< 5 minutes):**
```bash
pm2 stop all
# Do NOT restart until rollback is confirmed complete
```

**Step 2 — Assess (< 15 minutes):**
Check `event_log` for `execution_started` without matching `execution_complete`. Identify affected wallets. Check AgentKit for pending transactions.

**Step 3 — Communicate (< 30 minutes):**
"We've detected an issue and paused operations. We'll update you in [X] minutes." Never say "your funds are safe" until verified via chain read.

**Step 4 — Contact SEAL 911:**
securityalliance.org/sos — 24/7 crypto incident response. Bring: timeline, tx hashes, error logs, affected wallets.

**Step 5 — Document:**
Full timeline in `tasks/blocked.md` with prefix `[INCIDENT]`. Preserve all logs.

---

## Live Resources (Monitor Regularly)

| Resource | URL | What to Monitor |
|----------|-----|-----------------|
| rekt.news | rekt.news | New exploits — especially Base, Aave, agent hacks |
| SEAL Frameworks | frameworks.securityalliance.org | Framework updates |
| SEAL Radar | radar.securityalliance.org | Active threat advisories |
| SEAL 911 | securityalliance.org/sos | Emergency incident response |
| EthSkills Security | ethskills.com/security/SKILL.md | Solidity security patterns |
| DefiLlama Hacks | defillama.com/hacks | Protocol exploit feed |
| NVD CVEs | nvd.nist.gov | New CVEs: openclaw, node.js, next.js |

---

## How to File a Review Finding

```markdown
## REVIEW: [module] — [PASS / FAIL / CONDITIONAL PASS]
Reviewer: Security + QA Agent
Date: [date]

### CRITICAL (blocks merge):
- [finding with file:line]

### HIGH (must fix before production):
- [finding with file:line]

### Security Checklist: [items with pass/fail]

### Decision: [APPROVED / APPROVED WITH CONDITIONS / REJECTED]
```

## How to File a Blocker

```markdown
## BLOCKED: [description]
Agent: Security + QA
Date: [date]
Blocking: [task]
Context: [what was found]
Needs: [what unblocks it]
Escalate to: thinkDecade
```

---

*Security + QA Agent · tests/ (owns) · all packages (reviews)*
*Threat intelligence: SEAL Frameworks (frameworks.securityalliance.org) + rekt.news*
