# Intend — Autonomous Financial Agent

> *Finance was built around products. Intend rebuilds it around intentions.*

Intend is an intent-based autonomous financial agent that executes financial outcomes on behalf of users — entirely onchain. Users state what they want in plain language. Intend handles everything else.

**Intend is built to be global.** A user in Lagos, Accra, Istanbul, or New York gets the same intelligence — calibrated to their specific economic reality. Local currency, local inflation rate, local risk profile. The superpower is adaptation.

**Built for DoraHacks Galactica WDK Hackathon 2026** · [Try it on Telegram →](https://t.me/intend_auto_bot) · [Landing Page →](https://intendfinance.netlify.app) · [GitHub →](https://github.com/thinkDecade/Intend)

---

## Demo Video

🎬 **[Watch the 5-minute technical overview →](#)**

---

## Eligibility Checklist

| Requirement | Status | Evidence |
|---|---|---|
| Correct use of WDK | ✅ | 6 WDK modules integrated — wallet-evm, wallet-btc, lending-aave-evm, bridge-usdt0, swap-velora, fiat-moonpay |
| USDt / self-deployed ERC-20 | ✅ | iUSDT + iXAUT self-deployed on Arbitrum Sepolia + Ethereum Sepolia. Real USDT/XAUT addresses in mainnet config |
| Agentic framework (not raw LLM) | ✅ | OpenClaw v2026.3.13 — autonomous agent runtime. Claude is the reasoning engine inside it |
| Public GitHub repo | ✅ | https://github.com/thinkDecade/Intend |
| Technical overview video | ✅ | [Link above](#) |

---

## The Agentic Framework

**Intend uses OpenClaw as its agent runtime** — this is not a wrapper around an LLM API call.

OpenClaw is an open-source autonomous agent platform that provides:
- **Persistent agent sessions** — maintains context across multi-turn conversations
- **Tool execution** — agent calls shell commands, reads files, executes scripts
- **Workspace system** — WORKSPACE.md defines agent identity, rules, and objectives
- **Channel integration** — native Telegram bot polling and message routing
- **Cron scheduling** — intelligence engine runs every 30 minutes automatically
- **WDK skill** — loaded globally, giving agent 41 financial capabilities

Claude Sonnet 4.6 is the **reasoning engine** inside OpenClaw — it interprets user intentions, selects strategies, and orchestrates tool calls. OpenClaw handles everything else.

**Agent execution flow:**
```
User message (Telegram)
      ↓
OpenClaw Gateway — session management, context, tool routing
      ↓
Claude Sonnet 4.6 — intent parsing, strategy selection, response
      ↓
Shell execution — onboarding.js, executor.js, intelligence.js, faucet.js
      ↓
Tether WDK — wallet signing, Aave supply, USDT0 bridge, MoonPay
      ↓
Blockchain — real on-chain transaction
      ↓
User — plain language confirmation + Etherscan link
```

---

## The Problem

Managing money intelligently requires constant attention — monitoring exchange rates, choosing yield strategies, timing remittances, protecting against inflation. For most people, especially those in emerging economies, this cognitive burden is too high.

- Traditional banks offer no onchain access
- DeFi protocols require technical expertise
- Crypto wallets hold value but offer no intelligence

**1.4 billion people** in emerging markets — and billions more in developed ones — need a smarter financial layer. Intend is that layer. Every user gets the same powerful agent, adapted to their context:

- A user in **Nigeria** gets HEDGE alerts when NGN depreciates
- A user in **Ghana** gets GHS-denominated yield projections  
- A user in **Turkey** gets triggered when inflation hits 31%
- A user in **New York** gets the same Aave yield — just without the currency risk overlay

Same agent. Different context. Universal access.

---

## Three Core Objectives

**HEDGE** — Protect purchasing power from currency depreciation, inflation, and geopolitical risk. Move to USDT or Tether Gold (XAUT).

**YIELD** — Deploy idle capital into secure onchain yield via Aave V3. Never chase APY — pursue sustainable growth.

**TRANSFER** — Move capital to any address. Cross-border, instant, onchain.

Priority: `HEDGE > YIELD > TRANSFER`

---

## WDK Integration

| WDK Module | Status | Usage |
|---|---|---|
| `wdk-wallet-evm` | ✅ Live | Non-custodial EVM wallet per user on signup |
| `wdk-wallet-btc` | ✅ Live | Bitcoin address from same mnemonic — true multi-chain |
| `wdk-protocol-lending-aave-evm` | ✅ Live | YIELD — supply iUSDT/USDT to Aave V3, earn APY |
| `wdk-protocol-bridge-usdt0-evm` | 🔄 Wired | Cross-chain USDT0 bridge |
| `wdk-protocol-swap-velora-evm` | 🔄 Wired | Swap ETH → USDT before yield deployment |
| `wdk-protocol-fiat-moonpay` | 🔄 Wired | Fiat onramp via card |

**All wallets are non-custodial.** The AI agent never sees private keys.

---

## Sandbox Mode

New users automatically enter **Sandbox Mode** — a safe testnet environment:

- Auto-credited with **1,000 iUSDT** + **1 iXAUT** (test Tether Gold)
- All three objectives available: YIELD, HEDGE, TRANSFER
- Real transaction flows, zero risk
- Say *"I'm ready to go live"* to switch to mainnet

**Testnet contracts (self-deployed ERC-20):**

| Token | Network | Address |
|---|---|---|
| iUSDT | Ethereum Sepolia | `0x993034D6f6D942AA5491FaC8F1071d60D7b34107` |
| iUSDT | Arbitrum Sepolia | `0xe24De1f763fAf5d2cFB54147AAd14Fe538999958` |
| iXAUT | Ethereum Sepolia | `0x9fDCf3e51299eE502F369010ecf79a9683057351` |
| iXAUT | Arbitrum Sepolia | `0x993034D6f6D942AA5491FaC8F1071d60D7b34107` |

**Live testnet transactions:**
- YIELD: [0x3250ac...](https://sepolia.etherscan.io/tx/0x3250ac2abda044b4a8441d8cc0940f0be9ebfbf15d9e176a4376911d5d3a1b7c)
- TRANSFER: [0xd496c5...](https://sepolia.etherscan.io/tx/0xd496c5c6372a226021a633648641b58be2518d413b452fb0991d0e3590a5b2a7)

---

## Intelligence Engine

Runs every 30 minutes via cron. Writes `LIVE_CONTEXT.md`:

- **Yields** — DefiLlama (single-asset stablecoins, filtered for LP risk)
- **Political risk** — Polymarket (geopolitical events, >$200K volume)
- **Inflation** — 9 countries, HEDGE_ALERT at 10%+
- **FX rates** — Live GHS, NGN, KES, ZAR
- **Chain routing** — Gas 40% + TVL 35% + Settlement 25%

No numbers hardcoded. No numbers invented.

---

## Security

- **AES-256-GCM** — all mnemonics encrypted at rest (JSON + DB)
- **Environment key** — encryption key in systemd env only, never in code
- **Agent air-gap** — Claude never sees private keys or seed phrases
- **Hard WORKSPACE rule** — agent cannot be prompted to expose mnemonics
```
Agent (Claude) — addresses only, never keys
      ↓
executor.js — decrypts mnemonic in memory
      ↓
WalletAccountEvm — signs, disposes immediately
      ↓
Blockchain
```

---

## OTC Desk

For users where MoonPay is unavailable (Ghana, Nigeria):
- User requests buy/sell → order routed to trade desk
- Desk sets live GHS/USD rate → user pays Mobile Money → receives USDT
- Supports MTN MoMo (Ghana), expanding to NGN bank transfer

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Runtime | OpenClaw v2026.3.13 |
| AI Engine | Claude Sonnet 4.6 |
| Wallets | Tether WDK (wdk-wallet-evm, wdk-wallet-btc) |
| Yield | Aave V3 (wdk-protocol-lending-aave-evm) |
| Interface | Telegram Bot (@intend_auto_bot) |
| Intelligence | DefiLlama, Polymarket, open.er-api.com |
| Database | PostgreSQL |
| Security | AES-256-GCM, systemd env key |
| Infrastructure | GCP Linux, Ubuntu 24, Node.js v22 |
| Hosting | Netlify (intendfinance.netlify.app) |

---

## Architecture
```
┌─────────────────────────────────────────────────────┐
│                    User (Telegram)                   │
└─────────────────────────┬───────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│           OpenClaw Gateway (Agent Runtime)           │
│  Session management · Tool execution · WDK skill     │
└─────────────────────────┬───────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│         Claude Sonnet 4.6 (Reasoning Engine)         │
│  Intent parsing · Strategy selection · LIVE_CONTEXT  │
└──────┬──────────────┬──────────────┬────────────────┘
       ↓              ↓              ↓
┌──────────┐  ┌──────────────┐  ┌──────────────────┐
│onboarding│  │  executor.js │  │ intelligence.js   │
│EVM+BTC   │  │  YIELD/HEDGE │  │ DefiLlama yields  │
│wallets   │  │  /TRANSFER   │  │ FX · Polymarket   │
│+ faucet  │  │  via WDK     │  │ → LIVE_CONTEXT.md │
└──────────┘  └──────┬───────┘  └──────────────────┘
                     ↓
┌─────────────────────────────────────────────────────┐
│                  Tether WDK                          │
│  wdk-wallet-evm · wdk-protocol-lending-aave-evm     │
│  wdk-wallet-btc · wdk-protocol-bridge-usdt0-evm     │
└─────────────────────────┬───────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────┐
│         Blockchain (Arbitrum / Ethereum Sepolia)     │
│         Real on-chain transactions + Etherscan       │
└─────────────────────────────────────────────────────┘
```

---

## Repository Structure
```
Intend/
├── agent/
│   ├── onboarding.js        # Wallet creation — EVM + BTC, AES-256 encrypted
│   ├── executor.js          # WDK execution — YIELD (Aave), HEDGE, TRANSFER
│   ├── intelligence.js      # Live data → LIVE_CONTEXT.md (30min cron)
│   ├── faucet.js            # Sandbox faucet — auto-credits new users
│   ├── otc-desk.js          # P2P onramp/offramp — Mobile Money ↔ USDT
│   ├── crypto.js            # AES-256-GCM encryption utilities
│   ├── db.js                # PostgreSQL — users, positions, orders, events
│   ├── deploy-test-usdt.js  # Testnet iUSDT/iXAUT deployer
│   └── testnet-config.json  # Testnet contract addresses
├── landing/                 # Netlify landing page (intendfinance.netlify.app)
└── assets/                  # Brand assets
```

---

## Running Locally
```bash
git clone https://github.com/thinkDecade/Intend.git
cd Intend/agent && npm install

export INTEND_ENCRYPTION_KEY=<32-byte-hex>
export INTEND_TESTNET=true
export INTEND_FAUCET_KEY=<deployer-private-key>

# Run intelligence engine
node intelligence.js

# Check balance
node executor.js balance '{"userId":"<id>","chain":"arbitrum"}'

# Start agent (requires OpenClaw)
systemctl --user start openclaw-gateway
```

---

Built by **thinkDecade** — shipped in 72 hours.

> *"You define the outcome. Intend figures out how to achieve it."*
