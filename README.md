# Intend - An Autonomou Financial Conciege
### Finance, built around users intentions!

> 

Intend is an autonomous financial concierge that turns financial intentions into outcomes. You tell Intend what you want — e.g, protect savings, grow money, send funds abroad. Intend figures out how, executes it. 

https://intendfinance.netlify.app

---

## The Problem - Managing money is a full time job and crypto makes it even harder!

For most of history, people have had to chase a moving world with static money, adjusting, reacting, trying to stay ahead of forces they don’t control. But today, change is no longer gradual. It is sudden, global, and unforgiving. Inflation erodes hard earned wealth silently, currencies collapse overnight, and entire economies shift in ways no individual can predict or respond to in time. And yet, the burden remains the same:  You either manage your money yourself
or you leave it to chance, hoping the world doesn’t move against you. That is the flaw. Today, you’re forced to choose between two imperfect systems.

1. Traditional Finance (Passive, but Restricted)

In the legacy world, your money is passive in all the wrong ways.

- Inflationary Decay — It sits still while its value quietly erodes

- Velocity Bottlenecks — It moves slowly when you need it fast

- Institutional Walls — It’s locked behind systems you don’t control

2. Onchain Finance (Powerful, but Overwhelming)

Onchain finance improved access at global scale, but pushed the burden of execution entirely onto the user.

- Guideless Opportunity : Infinite paths, no clear direction

- Fragmentation : Disconnected tools, chains, and interfaces

- Manual Execution : Every decision, every action, is on you

More access didn’t simplify things. It just multiplied the maintenance.

An overwhelmingly changing world, with unbearably complex financial systems left for the everyday person to navigate.

An impossible task. There should be a better way!




## INTEND - money, finally adapting and moving when it needs to, autonomously.

Intend is an autonomous financial concierge that translates financial intentions into actionable outcomes. It operates through a self-controlled wallet, enabling users to fund, manage, and direct resources according to their goals, through natural language. The ultimate aim is for Intend to have full context of a users realities, and executive proactive financial actions to the benefit of the user. 

Intend is being built around three irreducible financial primitives:
•	HEDGE — Protect user money
•	YIELD — Grow user money
•	TRANSFER — Move user money

## Three Core Objectives/Primitive

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

---
## System Architecture

Every user message flows through the following layers.

<img width="839" height="698" alt="image" src="https://github.com/user-attachments/assets/0bbc1e0d-32fb-4b83-aedc-321007e6fb75" />



---

## User Journey

From first message to live execution — including the sandbox-first approach.


<img width="346" height="659" alt="image" src="https://github.com/user-attachments/assets/01e2e912-f040-463f-9f62-9179d6d7c80f" />


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

<img width="1124" height="629" alt="image" src="https://github.com/user-attachments/assets/a2e721f0-da18-41f4-b11e-c0ab04c684f0" />


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

### 👀 Semi-Autonomous Mode
The agent proposes every action before executing. User approves with "Activate".

Switch anytime: *"automate my account"* or *"pause automation"*

<img width="541" height="632" alt="image" src="https://github.com/user-attachments/assets/ec6452e9-7d83-455b-8f75-fec47895812d" />

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

## Roadmap :  From intention to inevitability
Intend will power everyday financial needs, autonomously.

Phase 01
Foundation : Intent → Execution (Single-Agent MVP)

A fully functional intent-driven financial agent that can interpret user intent and execute HEDGE, YIELD, and TRANSFER end-to-end onchain with sandbox baked in.

Phase 02 : Intelligence - Context-Aware Autonomy

Intend evolves from reactive execution to context-aware financial intelligence, capable of proactive decision-making and persistent-autonomous operation.

Phase 03 : Decomposition Multi-Agent System

Transition from a single agent to a modular, specialized multi-agent architecture enabling scale, parallelism, and system intelligence.

Phase 04: Expansion - Financial Network & Liquidity Layer

Intend becomes a financial coordination layer, deeply integrated with liquidity providers, FX partners, and institutional rails.

Phase 05 : Autonomy - Predictive Financial Intelligence

Intend becomes a fully autonomous financial intelligence system that anticipates user needs and acts ahead of explicit intent.
---


> *"A future where humans have the option not to worry about how their finances are managed, is a future filled with abundant freedom - Intend is built to enable that!."*
