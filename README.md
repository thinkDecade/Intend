# Intend
### Autonomous Financial Concierge

> *Finance was built around products. Intend rebuilds it around intentions.*

Intend is an autonomous AI agent that turns financial intentions into on-chain outcomes. You tell Intend what you want to achieve — protect your savings, grow your money, send funds abroad. Intend figures out how, executes it, and monitors results. No dashboards. No protocols. No manual steps.

**Intend is global by design.** A user in Lagos, Accra, Istanbul, or New York gets the same intelligence — calibrated to their specific economic reality. Local currency. Local inflation rate. Local risk profile. The superpower is adaptation.

[Try it on Telegram →](https://t.me/intend_auto_bot) · [Landing Page →](https://intendfinance.netlify.app)

---

## The Problem

Managing money intelligently requires constant attention — monitoring exchange rates, choosing yield strategies, timing remittances, protecting against inflation. This cognitive burden is too high for most people.

- Traditional banks offer no onchain access and impose friction-heavy cross-border rails
- DeFi protocols are powerful but require technical expertise most people don't have
- Crypto wallets hold value but offer zero intelligence or autonomous execution

The result: billions of people leave money idle, exposed to inflation, or locked out of global financial markets entirely.

---

## The Intend Approach

Intend operates on a single interaction model: **state an intention, watch it execute.**
```
User: "I want to protect my savings"
Intend: Your cedis have lost 40% in two years. Moving to USDT locks in today's value.
        Estimated fee: ~$0.03
        Reply Activate to proceed.
User: Activate
Intend: ✅ Done. Your purchasing power is protected.
        View transaction → [Etherscan]
```

No mention of chains. No protocol names. No DeFi jargon. Just an outcome.

---

## Three Core Objectives

Every user intention maps to one of three irreducible financial primitives:

### HEDGE — Protect Your Money
Preserve purchasing power against currency depreciation, inflation, and geopolitical risk.
- Tier 1: Move to USDT when local currency weakens vs USD
- Tier 2: Move to Tether Gold (XAUT) when USD itself weakens vs hard assets
- Triggered by: live FX signals, inflation data, Polymarket political risk score

### YIELD — Grow Your Money
Deploy idle capital into secure, risk-adjusted on-chain yield via Aave V3.
- Never chases APY — pursues sustainable, risk-calibrated growth
- Live yield data from DefiLlama, filtered for single-asset stablecoins only
- Chain routing scored dynamically: gas efficiency 40% + TVL 35% + settlement 25%

### TRANSFER — Move Your Money
Move capital cross-border to local currency — instant, on-chain, at real exchange rates.
- Live FX conversion (GHS, NGN, KES, ZAR)
- Routes via optimal chain based on live scoring

**Priority:** `HEDGE > YIELD > TRANSFER` — capital protection always overrides growth.

---

## Intelligence Engine

Intend runs a live intelligence engine every 30 minutes that writes `LIVE_CONTEXT.md` — the agent reads this before every financial response. **No numbers are hardcoded. No numbers are invented.**
```
HEDGE_ALERT=true
POLYMARKET_RISK=45/100
BEST_YIELD_APY=17.98%
AAVE_V3_TVL=$58.20B

FX RATES (live)
- 1 USD = GHS 10.94
- 1 USD = NGN 1358.16
- 1 USD = KES 129.51

INFLATION SIGNALS
- Nigeria (NGN): 15.1% ⚠️ HEDGE ACTIVE
- Argentina (ARS): 32.4% ⚠️ HEDGE ACTIVE
- Turkey (TRY): 31.5% ⚠️ HEDGE ACTIVE
- Ghana (GHS): 3.3%

TOP YIELD OPPORTUNITIES
1. yo-protocol USDC on Base: 17.98% APY | TVL $32M
2. wildcat-protocol USDC: 15% APY | TVL $30M
```

---

## Wallet Architecture

Every Intend user gets a **true multi-chain, non-custodial wallet** created from a single mnemonic:

- **EVM address** — Ethereum, Arbitrum, Base, and any EVM-compatible chain
- **Bitcoin address** — native BTC wallet from the same seed

All mnemonics are encrypted at rest using AES-256-GCM. The encryption key lives in a systemd environment variable — never in code, never in files, never accessible to the AI agent.

**The agent is fully air-gapped from private keys.** Claude sees wallet addresses. It never sees mnemonics or private keys. Signing happens in `executor.js`, which decrypts the mnemonic in memory, signs, and disposes immediately.
```
Claude (agent) ──── sees addresses only
      ↓
executor.js ──────── decrypts in memory
      ↓
WalletAccountEvm ─── signs + disposes
      ↓
Blockchain
```

---

## Sandbox Mode

New users enter **Sandbox Mode** automatically — a fully functional testnet environment:

- Wallet created and auto-credited with **1,000 iUSDT** and **1 iXAUT** (test Tether Gold)
- All three objectives available to test: YIELD, HEDGE, TRANSFER
- Real transaction flows, verifiable on Etherscan — zero financial risk
- When ready: *"I'm ready to go live"* switches to mainnet

This lets users experience the full product — real flows, real confirmations, real Etherscan links — before committing real capital.

---

## OTC Desk

For users in regions where card-based onramps are unavailable (Ghana, Nigeria, and expanding):

- User requests buy/sell via the Telegram bot
- Order routed to trade desk Telegram group in real time
- Desk sets a live GHS/USD rate and sends Mobile Money payment details
- User pays via MTN MoMo → USDT released to their Intend wallet

This makes Intend accessible to users who are completely outside the traditional crypto onramp ecosystem.

---

## Architecture
```
┌─────────────────────────────────────────────────────┐
│                    User (Telegram)                   │
└─────────────────────────┬───────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│         OpenClaw (Autonomous Agent Runtime)          │
│  Persistent sessions · Tool execution · WDK skill    │
└─────────────────────────┬───────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│              Claude Sonnet 4.6                       │
│   Intent parsing · Strategy selection · Execution    │
│   Reads LIVE_CONTEXT.md before every response        │
└────┬──────────────┬──────────────┬──────────────────┘
     ↓              ↓              ↓
┌─────────┐  ┌────────────┐  ┌──────────────┐
│onboard  │  │executor.js │  │intelligence  │
│EVM+BTC  │  │YIELD/HEDGE │  │DefiLlama     │
│AES-256  │  │/TRANSFER   │  │FX · Polymark │
│+ faucet │  │via WDK     │  │→LIVE_CONTEXT │
└─────────┘  └─────┬──────┘  └──────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│                  Tether WDK                          │
│  wdk-wallet-evm  ·  wdk-wallet-btc                  │
│  wdk-protocol-lending-aave-evm                       │
│  wdk-protocol-bridge-usdt0-evm                       │
└─────────────────────────┬───────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│            Blockchain (Arbitrum / Ethereum)          │
└─────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Runtime | OpenClaw v2026.3.13 |
| AI Engine | Claude Sonnet 4.6 |
| Wallet Infrastructure | Tether WDK (wdk-wallet-evm, wdk-wallet-btc) |
| Yield Protocol | Aave V3 via wdk-protocol-lending-aave-evm |
| Cross-chain | USDT0 bridge via wdk-protocol-bridge-usdt0-evm |
| Fiat Onramp | MoonPay via wdk-protocol-fiat-moonpay |
| User Interface | Telegram Bot API |
| Intelligence | DefiLlama, Polymarket, open.er-api.com |
| Database | PostgreSQL (users, positions, orders, events) |
| Security | AES-256-GCM, systemd environment key |
| Infrastructure | GCP Linux VM, Ubuntu 24, Node.js v22 |
| Hosting | Netlify (intendfinance.netlify.app) |

---

## Repository Structure
```
Intend/
├── agent/
│   ├── onboarding.js        # Multi-chain wallet creation (EVM + BTC)
│   ├── executor.js          # WDK execution engine (YIELD, HEDGE, TRANSFER)
│   ├── intelligence.js      # Live data engine → LIVE_CONTEXT.md
│   ├── faucet.js            # Sandbox auto-funding for new users
│   ├── otc-desk.js          # P2P onramp/offramp (Mobile Money ↔ USDT)
│   ├── crypto.js            # AES-256-GCM encryption
│   ├── db.js                # PostgreSQL interface
│   ├── deploy-test-usdt.js  # Testnet token deployer
│   └── testnet-config.json  # Testnet contract addresses
├── landing/                 # intendfinance.netlify.app
└── assets/
```

---

## Running Locally
```bash
git clone https://github.com/thinkDecade/Intend.git
cd Intend/agent && npm install

export INTEND_ENCRYPTION_KEY=<32-byte-hex>
export INTEND_TESTNET=true
export INTEND_FAUCET_KEY=<deployer-private-key>

# Start intelligence engine
node intelligence.js

# Check wallet balance
node executor.js balance '{"userId":"<telegramId>","chain":"arbitrum"}'

# Start agent (requires OpenClaw)
systemctl --user start openclaw-gateway
```

---

## Roadmap

**Phase 1 — MVP (current)**
Sandbox testnet · YIELD, HEDGE, TRANSFER · OTC desk · Multi-chain wallets · Live intelligence

**Phase 2 — Mainnet**
Real USDT on Arbitrum · Tether Gold (XAUT) live · Velora swaps · USDT0 bridge · Scheduled intentions

**Phase 3 — Scale**
Multi-agent architecture · Mobile app · Additional offramp regions · White-label API for African fintechs

---

> *"For centuries people have had to adapt themselves to financial systems. Intend reverses that relationship. You define the outcome. Intend figures out how to achieve it."*
