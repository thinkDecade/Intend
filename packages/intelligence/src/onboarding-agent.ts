/**
 * Onboarding Agent — replaces the static 6-step wizard with a conversational
 * flow that builds the Economic Reality Profile (ERP) as it talks.
 *
 * State machine:
 *   greeting   → ask where they live + day-to-day currency
 *   location   → extract location/currency, ask income comfort range
 *   income     → extract income range, ask risk + horizon
 *   risk       → extract risk + horizon, finalise ERP, signal wallet reveal
 *   wallet     → wallet revealed by client, ask first intent
 *   intent     → capture first intent, signal completion
 *   done       → onboarding complete
 *
 * Each turn calls `generateObject` with a small Zod schema so we get both:
 *   1. The next agent message to display
 *   2. Any ERP fields confidently extracted from the user's reply
 *
 * The server action layer persists ERP fields incrementally via
 * `seedERPFromOnboarding` (data layer).
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type {
  ErpIncomeRange,
  ErpRiskTolerance,
  ErpTimeHorizon,
} from '@intend/core';
import { withFallback } from './model-router.js';

// ── State ──────────────────────────────────────────────────────────────────

export type OnboardingState =
  | 'greeting'
  | 'location'
  | 'income'
  | 'risk'
  | 'wallet'
  | 'intent'
  | 'done';

export interface OnboardingHistoryEntry {
  role:    'user' | 'assistant';
  content: string;
}

/** Partial ERP slots that can be extracted from a single conversation turn. */
export interface ExtractedErpSlots {
  location_country?:  string;            // ISO alpha-2
  location_region?:   string | null;
  local_currency?:    string;            // ISO 4217
  income_range?:      ErpIncomeRange;
  risk_tolerance?:    ErpRiskTolerance;
  time_horizon?:      ErpTimeHorizon;
}

export interface OnboardingTurnResult {
  /** Agent message to render to the user. */
  message:        string;
  /** ERP slots confidently extracted from the user's reply. Persist these. */
  extracted:      ExtractedErpSlots;
  /** State the agent moves into AFTER this turn. */
  next_state:     OnboardingState;
  /**
   * If true, the client should reveal the wallet address before the next user
   * input — the agent has already woven the reveal into `message`.
   */
  reveal_wallet?: boolean;
  /** If true, onboarding is complete — caller should mark the user done. */
  finished?:      boolean;
}

// ── Extraction schemas (per state) ─────────────────────────────────────────

const LocationSchema = z.object({
  message: z.string().describe('Warm, one-paragraph reply that confirms what was understood and asks the next question.'),
  extracted: z.object({
    location_country: z.string().nullable().describe('ISO 3166-1 alpha-2 country code if confidently extracted, else null'),
    location_region:  z.string().nullable().describe('City or region if mentioned, else null'),
    local_currency:   z.string().nullable().describe('ISO 4217 code if confidently inferable from country, else null'),
  }),
});

const IncomeSchema = z.object({
  message:   z.string(),
  extracted: z.object({
    income_range: z.enum([
      'under_500_month', '500_2k_month', '2k_10k_month',
      '10k_50k_month', 'over_50k_month', 'undisclosed',
    ]).nullable(),
  }),
});

const RiskSchema = z.object({
  message:   z.string(),
  extracted: z.object({
    risk_tolerance: z.enum(['preservation', 'cautious', 'balanced', 'growth', 'aggressive']).nullable(),
    time_horizon:   z.enum(['immediate', 'short', 'medium', 'long', 'mixed']).nullable(),
  }),
});

const PlainSchema = z.object({
  message: z.string(),
});

// ── Per-state instructions ────────────────────────────────────────────────

const VOICE = `You are Intend's onboarding concierge. Voice rules:
- Warm but not effusive. Confident but not arrogant.
- Direct. One idea per sentence. Maximum 3 sentences per reply.
- Never use DeFi jargon (no "wallet" yet — that comes later, no "DeFi", "stablecoin", "blockchain", "yield protocol", "Aave", "Base").
- Never make financial promises. Never say "will earn" — say "typically" or "historically".
- No preambles ("Great!", "Awesome!", "I'd love to..."). Just say the next thing.`;

const STATE_PROMPTS: Record<Exclude<OnboardingState, 'done'>, string> = {
  greeting: `${VOICE}

You are sending the FIRST message in onboarding. The user just signed up.
Welcome them in one short sentence. Then ask where they're based and what
currency they think in day-to-day. Combine into one warm question.

Set extracted to all-nulls (no user reply to parse yet).`,

  location: `${VOICE}

The user has just told you where they're based. Acknowledge their location
in ONE short sentence (no flattery). Then ask about their income comfort
range — frame it as an optional question that helps Intend tailor advice.
Offer the bands: "<$500/mo", "$500–$2k/mo", "$2k–$10k/mo", "$10k–$50k/mo",
">$50k/mo", or "rather not say".

Extract:
- location_country: ISO alpha-2 (e.g. "GH", "AR", "US"). Null if unclear.
- location_region: city/state mentioned, else null.
- local_currency: ISO 4217 if confidently inferable from country, else null.
  (GH→GHS, AR→ARS, NG→NGN, US→USD, GB→GBP, EU country→EUR, etc.)`,

  income: `${VOICE}

The user has just told you about their income (or declined). Acknowledge in
ONE short sentence (no flattery, no judgment). Then ask about risk + time
horizon together: "How would you describe yourself — preserve what I have,
cautious, balanced, growth-focused, or aggressive? And are you thinking
months or years?"

Extract:
- income_range: one of under_500_month | 500_2k_month | 2k_10k_month |
  10k_50k_month | over_50k_month | undisclosed. Use undisclosed if they
  declined or were unclear.`,

  risk: `${VOICE}

The user has just told you about their risk tolerance and/or time horizon.
This is the final ERP question. Acknowledge in ONE short sentence. Then say
exactly this (substituting nothing): "Your account is ready. I've set up a
secure place for your money — your private keys are held in a hardware
enclave, never on Intend's servers. Take a second to look at it on the right.
When you're ready, tell me what you want your money to do first."

Extract:
- risk_tolerance: one of preservation | cautious | balanced | growth | aggressive.
- time_horizon: one of immediate (days) | short (weeks–3mo) | medium (3–18mo) |
  long (18mo+) | mixed.`,

  wallet: `${VOICE}

The user has just seen their account/wallet reveal and is replying. They
might be acknowledging it, asking a question, or stating their first intent.
Reply briefly. If they haven't yet stated an intention, gently prompt for
one ("what do you want your money to do first — protect it, send some
somewhere, exchange it, or pay for something?"). If they did state one,
acknowledge in one sentence and tell them you're taking them to the
dashboard now.`,

  intent: `${VOICE}

The user has just stated their first intention. Acknowledge in one sentence
and tell them you're loading the dashboard so they can see the plan.`,
};

// ── Public API ────────────────────────────────────────────────────────────

export interface RunOnboardingTurnInput {
  state:        OnboardingState;
  history:      OnboardingHistoryEntry[];
  /** The user's latest reply. Empty string for the initial greeting turn. */
  user_message: string;
}

/**
 * Run one turn of the onboarding conversation.
 *
 * The orchestrator (server action) is responsible for:
 *   - Persisting `extracted` slots via seedERPFromOnboarding
 *   - Provisioning the wallet silently after the `location` turn
 *   - Setting `reveal_wallet` flag in the UI when next_state === 'wallet'
 *   - Calling markOnboardingComplete when finished === true
 */
export async function runOnboardingTurn(
  input: RunOnboardingTurnInput,
): Promise<OnboardingTurnResult> {
  const { state, history, user_message } = input;

  if (state === 'done') {
    return { message: '', extracted: {}, next_state: 'done', finished: true };
  }

  const promptInstruction = STATE_PROMPTS[state];
  const transcript = formatHistory(history, user_message);
  const prompt = `${promptInstruction}\n\nConversation so far:\n${transcript}\n\nProduce the next message and any extracted slots.`;

  switch (state) {
    case 'greeting': {
      // No user reply to parse — just produce the opening message.
      const result = await withFallback((model) =>
        generateObject({ model, schema: PlainSchema, prompt: `${promptInstruction}\n\nProduce the opening message.` }),
      );
      return {
        message:    result.object.message,
        extracted:  {},
        next_state: 'location',
      };
    }

    case 'location': {
      const result = await withFallback((model) =>
        generateObject({ model, schema: LocationSchema, prompt }),
      );
      const x = result.object.extracted;
      const country  = normaliseCountry(x.location_country);
      const currency = normaliseCurrency(x.local_currency);
      const extracted: ExtractedErpSlots = {};
      if (country)             extracted.location_country = country;
      if (x.location_region)   extracted.location_region  = x.location_region;
      if (currency)            extracted.local_currency   = currency;
      return {
        message:    result.object.message,
        extracted,
        next_state: 'income',
      };
    }

    case 'income': {
      const result = await withFallback((model) =>
        generateObject({ model, schema: IncomeSchema, prompt }),
      );
      return {
        message:    result.object.message,
        extracted:  { income_range: result.object.extracted.income_range ?? 'undisclosed' },
        next_state: 'risk',
      };
    }

    case 'risk': {
      const result = await withFallback((model) =>
        generateObject({ model, schema: RiskSchema, prompt }),
      );
      const x = result.object.extracted;
      return {
        message:       result.object.message,
        extracted:     {
          risk_tolerance: x.risk_tolerance ?? 'balanced',
          time_horizon:   x.time_horizon ?? 'medium',
        },
        next_state:    'wallet',
        reveal_wallet: true,
      };
    }

    case 'wallet': {
      const result = await withFallback((model) =>
        generateObject({ model, schema: PlainSchema, prompt }),
      );
      // Heuristic: if the user's reply looks like a financial intent, advance.
      const next: OnboardingState = looksLikeIntent(user_message) ? 'intent' : 'wallet';
      return {
        message:    result.object.message,
        extracted:  {},
        next_state: next,
        finished:   next === 'intent',
      };
    }

    case 'intent': {
      const result = await withFallback((model) =>
        generateObject({ model, schema: PlainSchema, prompt }),
      );
      return {
        message:    result.object.message,
        extracted:  {},
        next_state: 'done',
        finished:   true,
      };
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function formatHistory(history: OnboardingHistoryEntry[], latestUser: string): string {
  const entries = [...history];
  if (latestUser.trim()) entries.push({ role: 'user', content: latestUser.trim() });
  return entries
    .map((e) => `${e.role === 'user' ? 'User' : 'Intend'}: ${e.content}`)
    .join('\n');
}

function normaliseCountry(c: string | null): string | undefined {
  if (!c) return undefined;
  const trimmed = c.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(trimmed) ? trimmed : undefined;
}

function normaliseCurrency(c: string | null): string | undefined {
  if (!c) return undefined;
  const trimmed = c.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(trimmed) ? trimmed : undefined;
}

const INTENT_PATTERNS = [
  /\bsend\b/i, /\bpay\b/i, /\bbuy\b/i, /\bsave\b/i, /\bprotect\b/i,
  /\bswap\b/i, /\bexchange\b/i, /\bconvert\b/i, /\binvest\b/i,
  /\bgrow\b/i, /\b\$\s?\d/i, /\b\d+\s?(usd|usdc|dollar)/i,
];
function looksLikeIntent(msg: string): boolean {
  return INTENT_PATTERNS.some((p) => p.test(msg));
}
