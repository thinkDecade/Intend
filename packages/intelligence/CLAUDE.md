# INTEND — Intelligence Agent Context

> Read /CLAUDE.md first. This file adds intelligence-layer specifics.
> This agent owns: packages/core/src/types/* and packages/intelligence/src/*

---

## What This Agent Builds

The reasoning brain of Intend. Everything that requires an LLM or produces structured output from natural language lives here. The intelligence layer is what makes Intend feel like a world-class financial concierge rather than a chatbot.

**This agent's deliverables:**
- `packages/core/src/types/` — all shared TypeScript types (UFM, IntentionObject, ExecutionPlan, enums)
- `packages/intelligence/src/model-router.ts` — withFallback provider switching
- `packages/intelligence/src/context-interpreter.ts` — generateObject + Zod classification
- `packages/intelligence/src/ufm-builder.ts` — live UFM assembly
- `packages/intelligence/src/system-prompt.ts` — prompt template with UFM injection slot
- `packages/intelligence/src/confirmation.ts` — preview message generation
- `packages/intelligence/src/notifications.ts` — push message generation
- `/.openclaw/workspace/WORKSPACE.md` — agent behaviour definition for OpenClaw

---

## The Model Router

Implement exactly this pattern. No deviation.

```typescript
// packages/intelligence/src/model-router.ts
import { anthropic } from '@ai-sdk/anthropic';
import { openai }    from '@ai-sdk/openai';
import { google }    from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';

const groq = createGroq();
export type ModelTier = 'primary' | 'fallback1' | 'fallback2' | 'fast';

export function getModel(tier: ModelTier = 'primary') {
  switch (tier) {
    case 'primary':   return anthropic('claude-sonnet-4-6');
    case 'fallback1': return openai('gpt-4o');
    case 'fallback2': return google('gemini-1.5-pro');
    case 'fast':      return groq('llama-3.3-70b-versatile');
  }
}

export async function withFallback<T>(
  fn: (model: ReturnType<typeof getModel>) => Promise<T>
): Promise<T> {
  const tiers: ModelTier[] = ['primary', 'fallback1', 'fallback2', 'fast'];
  for (const tier of tiers) {
    try {
      return await Promise.race([
        fn(getModel(tier)),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('timeout')), 10000)
        )
      ]);
    } catch (err) {
      if (tier === 'fast') throw err;
      console.warn(`Model ${tier} failed, trying next`, err);
    }
  }
  throw new Error('All model providers exhausted');
}
```

**Acceptance test for model router:**
Disable the Claude API key. `withFallback` must fall through to GPT-4o and respond within 10 seconds. Response must be functionally identical to what Claude would return.

---

## The IntentionObject Schema (Zod)

This is the output of every Context Interpreter call. Get this right — everything downstream depends on it.

```typescript
// packages/core/src/types/intention.ts
import { z } from 'zod';

export const IntentionSchema = z.object({
  primitive: z.enum([
    'PROTECT', 'GROW', 'INVEST', 'SAVE',
    'MOVE', 'SPEND', 'EARN', 'CONVERT'
  ]),
  intent_confidence:   z.number().min(0).max(1),
  parameters: z.object({
    asset_from:        z.string().nullable(),
    asset_to:          z.string().nullable(),
    amount:            z.union([z.number(), z.literal('all')]).nullable(),
    amount_confidence: z.number().min(0).max(1),
    recipient_raw:     z.string().nullable(),
    goal_name:         z.string().nullable(),
    timing:            z.enum(['immediate', 'scheduled']).nullable(),
    recurrence:        z.enum(['once', 'monthly']).nullable(),
  }),
  clarification_needed:   z.boolean(),
  clarification_question: z.string().nullable(),
  raw_input:              z.string(),
  interpreted_at:         z.string(), // ISO timestamp
});

export type IntentionObject = z.infer<typeof IntentionSchema>;
```

**Classification threshold:** `intent_confidence >= 0.75` to proceed without clarification. Below 0.75: set `clarification_needed = true` and write exactly one clarifying question in `clarification_question`.

---

## The User Financial Model (UFM)

The UFM is injected into every LLM call as structured JSON. It is what makes responses feel intelligent — Claude reasons about a specific person's real situation, not in a vacuum.

```typescript
// packages/core/src/types/ufm.ts
export interface UserFinancialModel {
  user_id: string;
  present: {
    balances: Array<{
      asset: string;
      chain: string;
      amount: number;
      usd_value: number;
      protocol: string | null;   // 'aave_v3', 'morpho', null for wallet
      apy: number | null;
    }>;
    total_usd_value: number;
    pending_confirmations: PendingConfirmation[];
    active_goals: Goal[];
    active_positions: Position[];
  };
  environment: {
    region: string;              // ISO country code
    local_currency: string;      // 'GHS', 'TRY', 'BRL', etc.
    fx_rate: number;             // local currency per USD
    fx_trend: 'weakening' | 'stable' | 'strengthening';
    fx_change_30d: number;       // percentage, negative = weakening
    inflation_rate: number;      // annual percentage
    hedge_score: number;         // 0.0 to 1.0
    best_apy: number;            // best available yield rate
    current_apy: number | null;  // user's current yield if deployed
  };
  identity: {
    automation_level: 'suggest' | 'assisted' | 'autonomous';
    preferred_channel: 'telegram' | 'whatsapp' | 'web';
    kyc_tier: 0 | 1 | 2 | 3;
    max_auto_tx_usd: number;
    intend_handle: string | null;
  };
}
```

**UFM building rules:**
- Rebuilt on every pipeline execution — never cached across pipeline runs
- Balances fetched fresh from chain via AgentKit (never use cached balances)
- Signal data (FX, APY, hedge score) from Upstash Redis with TTL enforcement
- If any required signal is stale beyond 2× TTL: abort with "I'm missing current data. Try again in a moment."

---

## The System Prompt Template

```typescript
// packages/intelligence/src/system-prompt.ts
export function buildSystemPrompt(ufm: UserFinancialModel): string {
  return `You are Intend — a world-class financial concierge.
You operate on behalf of ${ufm.identity.intend_handle ?? 'this user'}.

Their current financial context:
${JSON.stringify(ufm, null, 2)}

Your role:
- Interpret their intention from natural language
- Present clear, outcome-focused execution plans
- Never use DeFi jargon without immediate plain-language translation
- Always disclose fees before executing
- Confirm before every execution — no exceptions

Rules you never break:
1. Never reveal or reference private keys, seed phrases, or vault credentials.
2. Never execute a transaction without explicit user confirmation.
3. Never guarantee returns — use 'historically', 'typically', 'expected to'.
4. Never name a protocol in user-facing messages (say 'a yield protocol', never 'Aave V3').
5. Never use chain names in user-facing messages (say 'in your wallet', never 'on Base').
6. Always show fees before execution. Never bury them.
7. If confidence < 0.75, ask exactly one clarifying question.
8. Never provide financial advice. Present facts and options.

Your voice:
- Warm but not effusive. Confident but not arrogant.
- Direct. One idea per sentence.
- Use numbers, not adjectives: '$47.20 earned' not 'a good return'.
- Short messages. No preambles. No 'Great question!'.`;
}
```

**Critical:** The UFM is injected as structured JSON in the system prompt slot only. User message goes in the user turn only. These must never be mixed — this is the prompt injection defense.

---

## Confirmation Preview Rules

Every confirmation message generated by the Confirmation Engine must satisfy all of these:

| Rule | Example |
|------|---------|
| Outcome language, not mechanism | "Your $500 is earning 5.8% annually" NOT "deposited to Morpho" |
| Fee always disclosed | "Fee: $0.44 total" — never hidden |
| Amount in user's reference currency | Show local currency equivalent when relevant |
| Timing estimate always included | "About 30 seconds" / "Usually within 5 minutes" |
| No protocol names | "a yield protocol" not "Aave V3" |
| No chain names | "in your wallet" not "on Base" |
| No guarantees | "historically" / "typically" / "expected to" — never "will" or "guaranteed" |
| Slippage floor for DEX operations | "Minimum you receive: X" |

**WebApp:** Use `streamText()` — streaming preview renders token by token.
**Telegram/WhatsApp:** Use `generateText()` — complete message delivered at once.

---

## WORKSPACE.md

The OpenClaw WORKSPACE.md defines Intend's agent behaviour at the runtime level. It must include:

1. Identity — who Intend is and how it communicates
2. Primitive recognition patterns — trigger phrases per primitive
3. Context injection rules — how UFM is used in reasoning
4. Conversation boundaries — what Intend never does
5. Tone and voice rules — matching the Brand Identity document

Keep WORKSPACE.md focused on behaviour, not implementation. OpenClaw reads it at gateway startup. Restart gateway after every edit: `systemctl --user restart openclaw-gateway`

**Critical OpenClaw note:** Never run `openclaw doctor --fix` without verifying model config afterward. Working backup at `~/.openclaw/openclaw.json.working-backup`. After any config restore, re-set: `config.channels.telegram.dmPolicy = 'open'`

---

## The 8 Primitive Boundaries (Classification Critical)

The Context Interpreter must distinguish these correctly:

```
GROW vs SAVE:      SAVE has a named goal, target, or deadline. GROW is undirected.
GROW vs INVEST:    GROW = yield on stables. INVEST = conviction on a specific asset.
CONVERT vs INVEST: CONVERT = exchange intent ("swap"). INVEST = holding intent ("I'm bullish").
CONVERT vs PROTECT: PROTECT has fear/preservation language. CONVERT is neutral exchange.
MOVE vs SPEND:     MOVE = person-to-person. SPEND = person-to-merchant/service.
EARN:              System-triggered (inbound detected) OR user says money just arrived.
```

When ambiguous: ask exactly one clarifying question. Never guess and proceed when confidence < 0.75.

---

## Signal Freshness (Enforce in UFM Builder)

| Signal | Max Age | Source |
|--------|---------|--------|
| FX rates | 4 hours | ExchangeRate-API |
| Inflation | 24 hours | TradingEconomics |
| Hedge score | 4 hours | Computed from FX + inflation |
| APY (Aave, Morpho) | 6 hours | DefiLlama |
| Asset prices | 15 minutes | CoinGecko |
| Gas estimates | 5 minutes | Base RPC (never cached for execution) |

If staleness > 2× TTL on any required signal: return error to pipeline, do not proceed.

---

## Test Coverage Requirements

This package handles financial classification. 90% test coverage minimum on:
- `context-interpreter.ts` — all 8 primitives, ambiguous cases, clarification triggering
- `ufm-builder.ts` — all signal freshness scenarios including stale data handling
- `model-router.ts` — fallback chain, timeout behaviour

Test the 50-message classification set: 5 messages per primitive, minimum 40/50 correct classifications with confidence > 0.80.

---

*Intelligence Agent · packages/intelligence/ + packages/core/types/*
