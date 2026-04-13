# INTEND — Root Agent Context

> Read this file completely before touching any code.
> Every agent in this project reads this file first.

---

## What Intend Is

Intend is an autonomous financial agent. Users express financial intentions in natural language. Intend interprets the intention, builds an execution plan, confirms with the user, and executes across DeFi and payment infrastructure — handling all intermediate steps invisibly.

**The product taglines (never change these):**
- Product: "Your money, executing your intentions."
- Brand: "Finance, built around your intentions."

**The vision (verbatim, do not rephrase):**
Finance was built around products. Intend rebuilds it around intentions. For centuries people have had to adapt themselves to financial systems. Intend reverses that relationship. You define the outcome. Intend figures out how to achieve it.

---

## The Five Design Principles (Never Violate)

1. **Outcome over instrument** — Users never hear: stake, liquidity pool, DeFi, blockchain, Base, Arbitrum, Aave, Morpho, Aerodrome, or any protocol/chain name. They hear what happens to their money. Always.

2. **Asset agnosticism** — Users state intentions. Intend reads what they hold, determines the optimal conversion path, executes it. A user with ETH who says "send $300 to my brother" never thinks about converting ETH first.

3. **Infrastructure neutrality** — Zero chain bias. Zero protocol preference. Routes through whatever delivers the best outcome at execution time.

4. **Live data only** — FX rates, APY, gas, asset prices — all fetched fresh before every execution. Hard staleness limits enforced. Never use cached values for execution.

5. **Confirmation before execution** — Every on-chain action requires explicit user confirmation. No exceptions. Not even at automation_level = 'autonomous'.

---

## The Eight Financial Primitives

| Primitive | What it does |
|-----------|-------------|
| PROTECT | Move capital to safety from currency/inflation risk |
| GROW | Deploy idle capital to yield-generating positions |
| MOVE | Transfer value to another person — any asset, any destination |
| CONVERT | Exchange one asset for another at best available rate |
| SAVE | Goal-based capital accumulation with named target |
| EARN | Detect and intelligently route incoming value |
| INVEST | Acquire assets the user wants to hold with conviction |
| SPEND | Execute payments via Visa MCP, x402, or Crypto Checkout |

All 8 primitives ship in v0.5 at "v1 basic level" — happy path works end-to-end. No half-built edge cases.

---

## Chain Strategy — Base Only

**Everything runs on Base. One chain. No bridges. No cross-chain complexity in v0.5.**

- Primary execution chain: Base (mainnet) / Base Sepolia (testnet)
- No Arbitrum in v0.5. No USDT0 bridge. No cross-chain routing.
- Arbitrum is a Phase 2 decision driven by data when AUM justifies it.
- The Skill Registry architecture makes adding a new chain a config change, not a rebuild.

---

## The Tech Stack

```
Language:           TypeScript 5.x strict mode + Node.js v22
AI Model Interface: Vercel AI SDK v4+
  Primary:          Claude Sonnet 4.6 (claude-sonnet-4-6)
  Fallback 1:       GPT-4o (openai)
  Fallback 2:       Gemini 1.5 Pro (google)
  Fast fallback:    Llama 3.3 via Groq
Agent Orchestration: OpenClaw + WORKSPACE.md
Onchain Execution:  Coinbase AgentKit (CDP wallets, Base-native)
Wallet Policy:      Open Wallet Standard (OWS)
Database:           Supabase (PostgreSQL 16) — 14 tables, RLS on all
Cache:              Upstash Redis
WebApp:             Next.js 14 App Router
Telegram:           node-telegram-bot-api
WhatsApp:           WhatsApp Cloud API (Meta)
Compute:            GCP Compute Engine — Ubuntu 24 (intend-server)
Build System:       Turborepo monorepo
CI/CD:              GitHub Actions
```

**DEX:** Aerodrome (primary) + Uniswap V3 (secondary) — both on Base
**Yield:** Aave V3 Base (primary) → Morpho Base (secondary) → Moonwell Base (tertiary)
**Payment Rails:** Visa Intelligent Commerce MCP (Rail 1) + x402 (Rail 2) + Crypto Checkout (Rail 3)

---

## Monorepo Structure

```
intend/
├── apps/
│   ├── web/              Next.js 14 — landing page + /app dashboard
│   ├── bot/              Telegram bot (PM2 process: intend-bot)
│   └── whatsapp/         WhatsApp Cloud API handler (PM2: intend-whatsapp)
├── packages/
│   ├── core/             Shared TypeScript types — UFM, IntentionObject, ExecutionPlan
│   ├── intelligence/     Context Interpreter, UFM Builder, Model Router, Confirmation Engine
│   ├── decision/         Strategy Generator, Asset Resolver, Permission Gate, all 8 primitives
│   ├── execution/        Atomicity Wrapper, AgentKit integration, payment rails
│   ├── skills/           Skill Registry — JSON playbooks for all protocols
│   ├── signals/          FX, APY, price, gas engines + hedge score computation
│   └── data/             Supabase + Upstash clients + repository pattern per domain
├── supabase/migrations/  001_initial_schema.sql (14 tables, complete)
├── tasks/                Agent task coordination (backlog, in_progress, review, done)
├── .env.example          All variables documented, no values committed
├── turbo.json
└── CLAUDE.md             ← You are reading this
```

---

## File Ownership — Agent Boundaries

**CRITICAL: Never edit files owned by another agent without explicit coordination.**

```
ORCHESTRATOR:
  /CLAUDE.md  /tasks/*  /turbo.json  /.env.example  /package.json

INTELLIGENCE AGENT:
  /packages/core/src/types/*
  /packages/intelligence/src/*
  /.openclaw/workspace/WORKSPACE.md

EXECUTION AGENT:
  /packages/execution/src/*
  /packages/decision/src/*
  /packages/skills/*
  /packages/signals/src/*

CHANNELS AGENT:
  /apps/web/*
  /apps/bot/*
  /apps/whatsapp/*
  /packages/data/src/*
  /supabase/migrations/*

SECURITY + QA AGENT:
  /tests/*  (owns all test files)
  Reviews all other packages — never modifies source
```

---

## Agent Communication Protocol

Agents coordinate through the `/tasks/` directory:

```
tasks/backlog.md      Orchestrator writes tasks here
tasks/in_progress.md  Agent claims a task by moving it here
tasks/review.md       Agent marks work ready for Security + QA review
tasks/done.md         Security + QA signs off and moves here
tasks/blocked.md      Any agent flags a blocker here with context
```

**Task claim format:**
```
## [TASK-ID] Task Name
Agent: [agent name]
Started: [timestamp]
Branch: [git branch name]
```

---

## Critical Operational Rules

### OpenClaw
```bash
# NEVER run without verifying model config afterward:
openclaw doctor --fix

# Working backup always available at:
~/.openclaw/openclaw.json.working-backup

# Health check:
curl http://127.0.0.1:18789/health

# After any config restore, re-set:
config.channels.telegram.dmPolicy = 'open'
```

### Server (intend-server)
```
IP:       34.63.81.169
User:     thinkdecade (passwordless sudo via /etc/sudoers.d/thinkdecade)
Zone:     us-central1-a
Project:  project-0bdfa9c5-6e4b-47e9-bbf
```

```bash
# PM2 processes:
pm2 list
pm2 logs intend-bot --lines 50
pm2 restart intend-api

# Disk (alert at 70%):
df -h /dev/root

# Gateway:
systemctl --user status openclaw-gateway
systemctl --user restart openclaw-gateway
```

### Git / Security
- Pre-commit hook (gitleaks) rejects any commit with credential patterns
- Never commit `.env` files with values — `.env.example` only
- Staging before production — no exceptions, not for a small fix
- `supabase/migrations/` — numbered SQL files only, never manual ALTER TABLE

### Disk Hygiene
- Weekly journal vacuum cron already configured at `/etc/cron.d/journal-vacuum`
- PM2 log rotation configured
- No snap packages installed

---

## Database — Key Facts

14 tables in Supabase (PostgreSQL 16). RLS on all tables.

**Append-only enforcement (DB trigger — never attempt UPDATE/DELETE):**
- `event_log` — complete audit trail of every system event
- `revenue_events` — every fee event

**Critical column types:**
- `telegram_id` / `user_id` — BIGINT (not INT)
- All monetary amounts — NUMERIC(36,18) — never FLOAT
- All timestamps — TIMESTAMPTZ (UTC always)

**Existing column to note:**
- `positions.apy_at_entry` — already exists in schema

Full schema: `supabase/migrations/001_initial_schema.sql`

---

## Security Rules (Non-Negotiable)

1. User private keys never touch Intend's servers
2. AgentKit CDP manages keys in Coinbase TEE
3. Card credentials: Visa vault_token_id only — never card data
4. Confirmation required before every execution — no automation exception
5. Full destination address always shown in crypto payments — never truncated
6. 6-character address confirmation for crypto payments > $200
7. ENS shows both name AND resolved address
8. Invoice re-validated at execution time, not just confirmation time
9. User input never concatenated into prompts — UFM in defined structured slot only
10. All LLM outputs parsed via Zod schema — generateObject rejects malformed responses

---

## The Skill Registry (packages/skills/)

Protocol execution is JSON-playbook-based, not hardcoded TypeScript.

```
packages/skills/playbooks/
  aave_v3_base.json       Aave V3 — supply, withdraw, borrow
  morpho_base.json        Morpho — deposit, withdraw
  aerodrome_base.json     Aerodrome — swap
  uniswap_v3_base.json    Uniswap V3 — swap
  lido_base.json          Lido — stake, wrap, unwrap
  erc20_transfer.json     ERC-20 transfer
```

Adding a new protocol = adding a JSON file. Zero TypeScript changes. Zero deployments.

EthSkills is installed via ClawHub: `clawhub install ethskills`
Provides current Ethereum knowledge including verified contract addresses.

---

## Agent Invocation

Each agent is invoked in Claude Code CLI from its primary working directory:

```bash
# ORCHESTRATOR — project root
claude --context /CLAUDE.md

# INTELLIGENCE AGENT
cd packages/intelligence && claude --context CLAUDE.md

# EXECUTION AGENT
cd packages/execution && claude --context CLAUDE.md

# CHANNELS AGENT
cd apps && claude --context CLAUDE.md

# SECURITY + QA AGENT
cd tests && claude --context CLAUDE.md
```

---

## What v0.5 Is and Is Not

**IS:** All 8 primitives working end-to-end on testnet → mainnet. Three channels (Telegram, WebApp, WhatsApp). Multi-model AI with automatic fallback. Base-only execution.

**IS NOT (explicitly deferred):**
- Proactive monitoring loop (Phase 2)
- Arbitrum yield layer (Phase 2)
- Multiple offramp partners per corridor (Phase 2)
- Visa interchange revenue activation (Phase 2)
- KYC Tier 2/3 (Phase 2)
- Mobile app (Phase 4)

---

## Funding Opportunities (Apply Now)

```
Base Batches 2026    batches.base.org    APPLY THIS WEEK
  Top 15 teams: $10K grant + 8-week program + Demo Day SF May 2026
  Min 3 teams: $50K investment from Base Ecosystem Fund
  Intend profile: AI + DeFi + payments = exactly what they want

CDP Builder Grants   Coinbase Developer Platform
  AgentKit + Onramp usage = direct qualification
  Apply after v0.5 ships on mainnet

Base Builder Grants  Retroactive, no application needed
  Ship on Base mainnet → team finds you
  1–5 ETH per cohort, 20+ cohorts run
```

---

## PRD Reference

The complete product specification is in `Intend_PRD_v2.0.docx` in the project knowledge.
Every architectural decision, every primitive specification, every acceptance criterion is there.
When in doubt about product behaviour — the PRD is the source of truth.

---

*INTEND · v0.5 · Base · thinkDecade*
