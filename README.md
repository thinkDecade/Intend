# Intend
### Autonomous Financial Concierge

> *Finance was built around products. Intend rebuilds it around intentions.*

Intend is an autonomous AI agent that turns financial intentions into on-chain outcomes. You tell Intend what you want — protect your savings, grow your money, send funds abroad. Intend figures out how, executes it, and monitors results. No dashboards. No protocols. No manual steps.

**Intend is global by design.** A user in Lagos, Accra, Istanbul, or New York gets the same intelligence — calibrated to their specific economic reality. Local currency. Local inflation rate. Local risk profile. The superpower is adaptation.

[Try it on Telegram →](https://t.me/intend_auto_bot) · [Landing Page →](https://intendfinance.netlify.app)

---

## The Problem

Managing money intelligently requires constant attention — monitoring exchange rates, choosing yield strategies, timing remittances, protecting against inflation. This cognitive burden is too high for most people.

- Traditional banks offer no onchain access and impose friction-heavy cross-border rails
- DeFi protocols are powerful but require technical expertise most people don't have
- Crypto wallets hold value but offer zero intelligence or autonomous execution

---

## The Solution

State an intention. Watch it execute.
```
User:   I want to protect my savings
Intend: The cedi has lost 40% in two years. Moving to USDT locks in today's value.
        Estimated fee: ~$0.03. Reply Activate to proceed.
User:   Activate
Intend: ✅ Done. Your purchasing power is protected.
        View transaction → [Etherscan]
```

No chain names. No protocol jargon. Just an outcome.

---

## Three Core Objectives

### 🛡 HEDGE — Protect Your Money
Preserve purchasing power against currency depreciation, inflation, and geopolitical risk.
- Tier 1: Move to USDT when local currency weakens vs USD
- Tier 2: Move to Tether Gold (XAUT) when USD itself weakens vs hard assets
- Triggered by live FX signals, inflation data, Polymarket political risk scores

### 📈 YIELD — Grow Your Money
Deploy idle capital into secure onchain yield via Aave V3.
- Live yield data from DefiLlama — single-asset stablecoins only, filtered for LP risk
- Chain routing scored dynamically: gas efficiency 40% + TVL 35% + settlement 25%

### 🌍 TRANSFER — Move Your Money
Move capital cross-border at real exchange rates, instantly, onchain.
- Live FX conversion (GHS, NGN, KES, ZAR)
- Optimal chain routing based on live fee scoring

**Priority:** `HEDGE > YIELD > TRANSFER`

---

## Sandbox Mode

Every new user starts in **Sandbox Mode** — a fully functional testnet environment for safe exploration before committing real capital.

### Why Sandbox?
Intend is a new way to manage money. Autonomous execution is powerful — and like anything powerful, it's worth understanding before real funds are involved. The sandbox gives users:
- The full product experience with zero financial risk
- Real transaction flows with verifiable on-chain confirmations
- Confidence before going live

### How It Works
On signup, every user is automatically credited with:
- **100,000 iUSDT** — sandbox equivalent of USDT (1:1 mapped to real USDT)
- **100,000 iXAUT** — sandbox equivalent of Tether Gold (1:1 mapped to real XAUT)

These are self-deployed ERC-20 tokens on Ethereum Sepolia and Arbitrum Sepolia. Every flow executes identically to mainnet. The only difference: test tokens, zero risk.

The faucet also sends 0.01 ETH per chain to cover gas — users never need to source testnet ETH themselves.

### Testnet Contracts
| Token | Network | Address |
|---|---|---|
| iUSDT | Ethereum Sepolia | `0x993034D6f6D942AA5491FaC8F1071d60D7b34107` |
| iUSDT | Arbitrum Sepolia | `0xe24De1f763fAf5d2cFB54147AAd14Fe538999958` |
| iXAUT | Ethereum Sepolia | `0x9fDCf3e51299eE502F369010ecf79a9683057351` |
| iXAUT | Arbitrum Sepolia | `0x993034D6f6D942AA5491FaC8F1071d60D7b34107` |

### Live Testnet Transactions
- YIELD: [0x3250ac...](https://sepolia.etherscan.io/tx/0x3250ac2abda044b4a8441d8cc0940f0be9ebfbf15d9e176a4376911d5d3a1b7c)
- TRANSFER: [0xd496c5...](https://sepolia.etherscan.io/tx/0xd496c5c6372a226021a633648641b58be2518d413b452fb0991d0e3590a5b2a7)

### Going Live
When a user is ready: *"I'm ready to go live"* — Intend reveals their mainnet wallet address for funding. Once funded, all executions route to mainnet automatically.

---

## Autonomous vs Semi-Autonomous

Intend operates in two modes, chosen during onboarding and switchable at any time.

### ⚡ Autonomous Mode
The agent executes the moment a user states an intention. No confirmation step. No waiting.
```
User:   Grow my money
Intend: Done.
        100,000 iUSDT deployed at 17.46% APY. Your money is working.
        View transaction → [Etherscan]
```

### 👀 Semi-Autonomous Mode
The agent proposes every action before executing. User approves with "Activate".
```
User:   Grow my money
Intend: 17.46% APY. Hands-free.
        iUSDT goes into a secured lending position — earns while you sleep.
        Estimated fee: ~$0.03
        Reply Activate to proceed, or Cancel to hold off.
User:   Activate
Intend: ✅ 100,000 iUSDT deployed at 17.46% APY.
```

Switch anytime: *"automate my account"* or *"pause automation"*

---

## Onboarding Flow
```
Intend: Hi. I'm Intend. I manage money around what you want.
        What should I call you?
User:   Kofi
Intend: Nice to meet you, Kofi. Let's get you set up.
Intend: You don't manage money here. You decide what you want. I make it happen.
Intend: 🛡 Protect it. 📈 Grow it. 🌍 Move it. Just tell me.
Intend: We'll start in a safe environment. Nothing here is real. You can explore freely.
Intend: When you're ready, we'll go live.
Intend: Good to go? 👇
User:   Yes
Intend: Before we begin — I need a place to operate your money.
        I'll set that up for you. It takes a second.
        Setting things up… Preparing your environment… Securing your access…
        Done.
Intend: You're ready. 🎉
        💎 Crypto & Stablecoins: 0x...
        ₿ Bitcoin: bc1q...
        Sandbox: 100,000 iUSDT + 100,000 iXAUT loaded.
Intend: ⚡ Autonomous or 👀 Semi-autonomous?
```

---

## Intelligence Engine

Runs every 30 minutes. Writes `LIVE_CONTEXT.md` — agent reads this before every financial response. No numbers hardcoded. No numbers invented.
```
HEDGE_ALERT=true | BEST_YIELD_APY=17.46% | AAVE_V3_TVL=$58.88B

FX RATES (live)
- 1 USD = GHS 10.94  - 1 USD = NGN 1358.16
- 1 USD = KES 129.51 - 1 USD = ZAR 16.80

INFLATION SIGNALS
- Nigeria: 15.1% ⚠️  - Turkey: 31.5% ⚠️  - Argentina: 32.4% ⚠️

TOP YIELD
1. yo-protocol USDC on Base: 17.46% APY | TVL $33M
```

---

## Security

- **AES-256-GCM** — all mnemonics encrypted at rest (JSON + DB)
- **Environment key** — encryption key in systemd env only, never in code
- **Agent air-gap** — Claude never sees private keys or seed phrases
- **Hard rule** — agent cannot be prompted to expose mnemonics
```
Claude (agent) ── addresses only, never keys
      ↓
executor.js ───── decrypts mnemonic in memory
      ↓
WalletAccountEvm ─ signs, disposes immediately
      ↓
Blockchain
```

---

## WDK Integration

| WDK Module | Status | Usage |
|---|---|---|
| `wdk-wallet-evm` | ✅ Live | Non-custodial EVM wallet per user |
| `wdk-wallet-btc` | ✅ Live | Bitcoin address from same mnemonic |
| `wdk-protocol-lending-aave-evm` | ✅ Live | YIELD — supply USDT to Aave V3 |
| `wdk-protocol-bridge-usdt0-evm` | 🔄 Wired | Cross-chain USDT0 bridge |
| `wdk-protocol-swap-velora-evm` | 🔄 Wired | ETH → USDT swap |
| `wdk-protocol-fiat-moonpay` | 🔄 Wired | Fiat onramp/offramp |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent Runtime | OpenClaw v2026.3.13 |
| AI Engine | Claude Sonnet 4.6 |
| Wallets | Tether WDK (wdk-wallet-evm, wdk-wallet-btc) |
| Yield | Aave V3 via wdk-protocol-lending-aave-evm |
| Interface | Telegram Bot (@intend_auto_bot) |
| Intelligence | DefiLlama, Polymarket, open.er-api.com |
| Database | PostgreSQL |
| Security | AES-256-GCM, systemd env key |
| Infrastructure | GCP Linux VM, Ubuntu 24, Node.js v22 |
| Hosting | Netlify (intendfinance.netlify.app) |

---

## Repository Structure
```
Intend/
├── agent/
│   ├── onboarding.js        # Multi-chain wallet creation (EVM + BTC)
│   ├── executor.js          # WDK execution — YIELD, HEDGE, TRANSFER
│   ├── intelligence.js      # Live data engine → LIVE_CONTEXT.md
│   ├── faucet.js            # Sandbox faucet — 100k iUSDT + iXAUT + ETH gas
│   ├── moonpay.js           # MoonPay onramp/offramp widget URLs
│   ├── otc-desk.js          # P2P Mobile Money ↔ USDT
│   ├── crypto.js            # AES-256-GCM encryption
│   ├── db.js                # PostgreSQL interface
│   ├── deploy-test-usdt.js  # Testnet token deployer
│   └── testnet-config.json  # iUSDT + iXAUT contract addresses
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
export MOONPAY_API_KEY=<moonpay-api-key>

node intelligence.js                                              # run intelligence engine
node executor.js balance '{"userId":"<id>","chain":"arbitrum"}'   # check balance
systemctl --user start openclaw-gateway                           # start agent
```

---

## Roadmap

**Phase 1 — Sandbox (now):** Testnet · YIELD + HEDGE + TRANSFER · Autonomous + Semi-auto · OTC desk · Live intelligence

**Phase 2 — Mainnet:** Real USDT · Tether Gold · Velora swaps · USDT0 bridge · Scheduled intentions

**Phase 3 — Scale:** Multi-agent architecture · Mobile app · More offramp regions · White-label API

---

Built by **thinkDecade**.

> *"You define the outcome. Intend figures out how to achieve it."*
