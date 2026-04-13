# INTEND — Execution Agent Context

> Read /CLAUDE.md first. This file adds execution-layer specifics.
> This agent owns: packages/execution/src/* + packages/decision/src/* + packages/skills/* + packages/signals/src/*

---

## What This Agent Builds

The onchain execution layer. Every transaction that moves real money runs through code this agent writes. The Strategy Generator that selects protocols. The Skill Registry that executes against them. The Atomicity Wrapper that guarantees rollback. The Signal engines that feed live data into decisions.

This is the most critical layer in the product. A bug here means user funds at risk.

**This agent's deliverables:**
- `packages/skills/` — Skill Registry + all 8 JSON protocol playbooks
- `packages/decision/src/asset-resolver.ts` — Asset Resolution Engine
- `packages/decision/src/strategy/` — Strategy Generator per primitive (8 files)
- `packages/decision/src/permission-gate.ts` — automation level enforcement
- `packages/decision/src/conflict-resolver.ts` — parallel execution + conflict logic
- `packages/execution/src/atomicity-wrapper.ts` — snapshot + rollback
- `packages/execution/src/action-dispatcher.ts` — routes to AgentKit or payment rails
- `packages/execution/src/agentkit/` — wallets.ts, dex.ts, yield.ts
- `packages/execution/src/payments/` — visa-mcp.ts, x402.ts, crypto-checkout.ts
- `packages/signals/src/` — all signal engines + hedge score computation

---

## The Skill Registry (Build This First)

Protocol execution is JSON-playbook-based. The Strategy Generator never calls a protocol directly — it calls the registry, which routes to the correct playbook.

### Directory Structure

```
packages/skills/
├── registry.ts          skill catalogue + routing
├── loader.ts            install / validate / version check
├── encoder.ts           ABI encoding → unsigned transaction
├── resolvers/
│   ├── token.ts         symbol → address + decimals
│   ├── amount.ts        human amount → Wei
│   └── quote.ts         DEX quotes, fee tiers
└── playbooks/
    ├── aave_v3_base.json
    ├── morpho_base.json
    ├── aerodrome_base.json
    ├── uniswap_v3_base.json
    ├── lido_base.json
    └── erc20_transfer.json
```

### Playbook Format

Every protocol playbook follows this JSON schema. This pattern is forward-compatible with Nethermind DeFi Skills when they ship Base support.

```json
{
  "protocol": "aave_v3",
  "chain": "base",
  "version": "1.0.0",
  "contract": "0x18cd499e3d7ed42feba981ac9236a278e4cdc2ee",
  "actions": {
    "supply": {
      "function": "supply(address,uint256,address,uint16)",
      "payload_args": [
        { "name": "asset",       "source": "token_address" },
        { "name": "amount",      "source": "amount_wei" },
        { "name": "onBehalfOf",  "source": "from_address" },
        { "name": "referralCode","value": 0 }
      ],
      "approvals": [{ "token": "asset", "spender": "contract" }]
    },
    "withdraw": {
      "function": "withdraw(address,uint256,address)",
      "payload_args": [
        { "name": "asset",  "source": "token_address" },
        { "name": "amount", "source": "amount_wei_or_max" },
        { "name": "to",     "source": "from_address" }
      ]
    }
  }
}
```

### Registry Interface

```typescript
// packages/skills/registry.ts
interface SkillRequest {
  protocol: string;     // 'aave_v3'
  action:   string;     // 'supply'
  chain:    string;     // 'base'
  args:     Record<string, string | number>;
  from:     string;     // user wallet address
}

interface UnsignedTransaction {
  to:       string;
  value:    string;
  data:     string;
  chain_id: number;
}

// Strategy Generator ALWAYS calls this — never the protocol directly
async function buildTransaction(
  req: SkillRequest
): Promise<UnsignedTransaction[]>
// Returns approval tx (if needed) + action tx in order
// AgentKit signs and broadcasts — registry never touches keys
```

---

## The Atomicity Wrapper

Every execution goes through this. No exceptions.

```typescript
// packages/execution/src/atomicity-wrapper.ts
interface AtomicityContext {
  intent_id: string;
  user_id:   string;
  steps:     ExecutionStep[];
}

interface ExecutionStep {
  name:    string;
  execute: () => Promise<StepResult>;
  rollback?: () => Promise<void>;
}

async function executeAtomic(ctx: AtomicityContext): Promise<void> {
  // 1. Snapshot current balance → store in intents.rollback_state
  // 2. Set intents.status = 'executing'
  // 3. INSERT event_log 'execution_started'
  // 4. Execute each step in sequence
  // 5. On ANY failure: run all completed rollbacks in reverse
  // 6. On rollback complete: verify user balance is intact
  // 7. UPDATE intents.status = 'failed', INSERT event_log 'execution_rolled_back'
  // 8. Only on full success: UPDATE intents.status = 'complete'
}
```

**Rollback rules:**
- If a DEX swap fails: no funds moved (tx reverted) — verify via chain read
- If an approval tx fails: no swap attempted — confirm via allowance check
- If a yield deposit fails: tokens are back in wallet — verify balance
- After any rollback: read balance from chain before messaging user — never assume

---

## The Asset Resolution Engine

Runs before every Strategy Generator call. Determines what the user holds and the optimal conversion path to what the execution requires.

```typescript
// packages/decision/src/asset-resolver.ts

interface AssetResolutionResult {
  selected_assets: Array<{
    asset: string;
    chain: string;
    amount: number;
    conversion_required: boolean;
    conversion_path?: ConversionPath;
  }>;
  net_amount_available: number;  // USD value after all conversion costs
  cost_breakdown: {
    conversion_fees: number;
    gas_estimate: number;        // sponsored, shown for transparency only
    total_cost_usd: number;
    total_cost_pct: number;
  };
}

// Selection priority when user hasn't specified an asset:
// 1. Stablecoins in required denomination (no conversion)
// 2. Stablecoins in other denominations (stable swap, near-zero slippage)
// 3. Most liquid assets for conversion (deepest Base pool)
// 4. FIFO for equal liquidity
```

**Hard limits:**
- Slippage > 0.5% on any conversion: reject, surface message to user
- Total conversion cost > 1.5% of amount: warn user, offer smaller amount

---

## Protocol Health Check (Mandatory Before Every Execution)

```typescript
// packages/execution/src/agentkit/yield.ts

async function checkProtocolHealth(protocol: string): Promise<void> {
  const tvl = await defiLlama.getTVL(protocol, 'base');
  if (tvl < 50_000_000) {
    throw new ProtocolRejectedError(`${protocol} TVL below threshold: $${tvl}`);
  }
  const tvl24hAgo = await defiLlama.getTVL(protocol, 'base', { hoursAgo: 24 });
  if (tvl < tvl24hAgo * 0.70) {
    throw new ProtocolPausedError(`${protocol} TVL dropped >30% in 24h — pausing`);
  }
  const exploits = await defiLlama.getRecentExploits(protocol);
  if (exploits.length > 0) {
    throw new ProtocolExploitedError(`${protocol} exploit detected`);
  }
}
```

This runs before **every** yield deposit and before **every** DEX swap that routes through a yield protocol. Never skip it.

---

## DEX Execution

### Routing Logic

```
Order size < $1,000:   Aerodrome primary, Uniswap V3 fallback
Order size $1,000+:    Fetch both quotes in parallel, use higher output
Stable-to-stable:      Aerodrome stable pools (near-zero slippage)
XAUT/gold:             Uniswap V3 XAUT/USDC (deeper gold liquidity)
Large order > $10,000: Auto-split into chunks to reduce price impact
```

### Slippage Protection

```typescript
// ALWAYS run simulateSwap before execution
const simulated = await simulateSwap(params);
if (simulated.slippage_pct > 0.005) { // 0.5% hard limit
  throw new SlippageExceededError(simulated.slippage_pct);
}

// Set amountOutMinimum = preview × 0.995 in every swap tx
// Set deadline = Math.floor(Date.now() / 1000) + 120 (2 min)
```

---

## Payment Rails

### Rail 1 — Visa Intelligent Commerce MCP

```typescript
// packages/execution/src/payments/visa-mcp.ts
// Trusted Agent setup must be complete before any Visa payment
// Store: vault_token_id only — NEVER card data, NEVER card numbers
// All SPEND requires explicit confirmation — no automation exception
```

### Rail 2 — x402

```typescript
// packages/execution/src/payments/x402.ts
// Detect HTTP 402 response → parse payment instructions
// Build USDC transfer on Base → include payment proof in memo
// Retry original request with payment proof header
// Store in x402_events table
```

### Rail 3 — Crypto Checkout

```typescript
// packages/execution/src/payments/crypto-checkout.ts

// SECURITY RULES — all mandatory:
// 1. Validate address checksum (EVM) or resolve ENS before showing preview
// 2. For amounts > $200 to new addresses: require 6-char confirmation
// 3. ENS: show both name AND resolved address in confirmation
// 4. Invoice (Commerce/BTCPay): re-fetch at execution time, not just preview
// 5. If address changed between preview and execution: ABORT immediately
// 6. Never truncate destination address in any message
```

---

## Strategy Generator — Per Primitive

Each primitive has a dedicated strategy file in `packages/decision/src/strategy/`.

### PROTECT Strategy

```typescript
// hedge_score → strategy tier selection:
// 0.00–0.40: No action unless explicitly requested
// 0.40–0.65: USDC + Aave V3 Base yield
// 0.65–0.85: Split: stable yield + XAUT gold
// > 0.85:    Maximum protection, fastest path
```

### GROW Strategy — Protocol Scoring

```typescript
// Score = (net_apy × 0.50) + (tvl_score × 0.25) + (age_score × 0.15) + (audit_score × 0.10)
// net_apy = gross_apy - intend_spread(0.40%) - gas_cost_annualized
// tvl_score: > $500M = 1.0 | > $100M = 0.7 | < $100M = rejected
// age_score: > 2 years = 1.0 | > 1 year = 0.7 | < 6 months = rejected
```

### MOVE Strategy — Corridor Routing

```typescript
// If sender holds EURC and destination is EUR corridor: use EURC directly (saves ~0.3-0.5%)
// If sender holds other assets: convert to USDC → offramp
// Rate lock: 3 minutes. If price moves > 2% during lock: notify user
// Always confirm offramp partner health before routing
```

### CONVERT Strategy — Tiered Routing

```typescript
// < $1,000:   Aerodrome + Uniswap V3 parallel quotes
// $1,000-10K: Uniswap V3 for liquid pairs
// > $10,000:  Auto-split (show user the split option)
```

---

## Hedge Score Formula

```typescript
// packages/signals/src/hedge-score.ts

function computeHedgeScore(signals: {
  fx_change_30d: number;      // percentage, negative = weakening
  fx_volatility_30d: number;  // percentage
  inflation_rate: number;     // annual percentage
}): number {
  const fx_component         = Math.max(0, -signals.fx_change_30d / 20);
  const inflation_component  = Math.max(0, (signals.inflation_rate - 5) / 75);
  const volatility_component = signals.fx_volatility_30d / 15;

  return Math.min(1.0,
    (fx_component         * 0.40) +
    (inflation_component  * 0.40) +
    (volatility_component * 0.20)
  );
}

// Thresholds:
// 0.00–0.40: No action
// 0.40–0.65: PROTECT recommended
// 0.65–0.85: PROTECT actively suggested
// > 0.85:    Emergency — notify immediately
```

---

## Database Writes (This Agent's Responsibility)

This agent's code writes to these tables on every execution:

```
event_log            INSERT on every step (append-only — NEVER UPDATE/DELETE)
intents              UPDATE status through lifecycle
positions            INSERT on yield/investment deployment
revenue_events       INSERT on every fee event (append-only)
parallel_lanes       INSERT/UPDATE/DELETE for parallel execution tracking
```

**event_log entry for every execution step:**
```typescript
await db.event_log.insert({
  user_id,
  event_type: 'execution_step_complete',
  source: channel,
  event_data: {
    step: 'deposit',
    protocol: 'aave_v3',
    asset: 'USDC',
    amount: 847.00,
    tx_hash: '0x...',
  },
  intent_id,
});
```

---

## Signal Freshness (Signals Package)

| Signal | Max Age | Action if Stale |
|--------|---------|-----------------|
| Asset prices (ETH, BTC, etc.) | 1 minute for execution | Refresh immediately |
| DEX quotes | Real-time | Always on-demand, never cached |
| APY data | 6 hours | Refresh before yield operations |
| TVL data | 6 hours | Refresh before protocol health check |
| Gas estimates | 5 minutes | Fetch fresh from RPC, never use cached for tx |
| FX rates (MOVE) | 3 minutes (rate lock) | Refresh and notify user if > 2% change |

**Gas estimates for execution (not display):** Always fetch fresh from Base RPC. Never use cached gas for transaction construction.

---

## Test Coverage Requirements

90% minimum test coverage on:
- `atomicity-wrapper.ts` — all rollback scenarios (failure at each step)
- `asset-resolver.ts` — ETH→USDC, WBTC→USDC, EURC→USDC conversion paths
- `strategy/*.ts` — all 8 primitives, edge cases
- `signals/hedge-score.ts` — all 4 threshold scenarios
- All skill playbook encoder output — verify ABI encoding is correct

**Critical test:** Simulate failure at step 2 of a 3-step PROTECT execution. Verify atomicity wrapper rolls back, user balance is unchanged, event_log shows `execution_rolled_back`.

---

## EthSkills Integration

Install via ClawHub before starting build:
```bash
clawhub install ethskills
```

Read before working on any protocol integration:
- `https://ethskills.com/addresses/SKILL.md` — verified contract addresses
- `https://ethskills.com/building-blocks/SKILL.md` — DeFi lego patterns
- `https://ethskills.com/security/SKILL.md` — security patterns and audit checklist

---

*Execution Agent · packages/execution/ + packages/decision/ + packages/skills/ + packages/signals/*
