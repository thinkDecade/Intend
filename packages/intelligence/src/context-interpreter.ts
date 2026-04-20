/**
 * Context Interpreter
 *
 * Two responsibilities:
 *   1. detectModeSwitch — fast regex check for execution mode change requests.
 *      Runs BEFORE the LLM call. Returns the new mode or null if not a switch.
 *
 *   2. interpretIntent — reasons about what the user wants their money to do,
 *      then maps to a structured IntentionObject.
 *
 * Design decisions:
 *   - Mode-switch detection is regex-only (no LLM) — fast, reliable, no latency
 *   - Intent reasoning uses open-ended LLM reasoning before committing to a primitive
 *   - `interpreted_at` is always injected by code, never the LLM
 *   - UFM injected via system prompt only — never mixed into the user turn (injection defence)
 *   - Assumptions layer: Intend states what it understood rather than asking unnecessary questions
 *   - Clarification fires ONLY when intent is genuinely ambiguous AND consequence is irreversible
 */

import { generateObject } from 'ai';
import { IntentionSchema, type IntentionObject, type UserFinancialModel, type ExecutionMode, type EconomicRealityProfile } from '@intend/core';
import { withFallback } from './model-router.js';
import { buildSystemPrompt } from './system-prompt.js';

// ── LLM schema — IntentionSchema without interpreted_at (injected by code) ─

const LLMSchema = IntentionSchema.omit({ interpreted_at: true });

// ── Mode-switch patterns ──────────────────────────────────────────────────

const AUTONOMOUS_PATTERNS = [
  /\bgo\s+autonomous\b/i,
  /\bfull\s+auto\b/i,
  /\bjust\s+do\s+it\b/i,
  /\bdon'?t\s+ask\s+me\b/i,
  /\bexecute\s+automatically\b/i,
  /\bauto\s+mode\b/i,
  /\bno\s+confirmation\b/i,
  /\bexecute\s+without\s+asking\b/i,
  /\bjust\s+execute\b/i,
  /\bautonomous\s+mode\b/i,
];

const SEMI_AUTONOMOUS_PATTERNS = [
  /\bask\s+me\s+before\b/i,
  /\bswitch\s+to\s+semi\b/i,
  /\bsemi.?autonomous\b/i,
  /\balways\s+confirm\b/i,
  /\bask\s+for\s+permission\b/i,
  /\bwait\s+for\s+(my\s+)?confirmation\b/i,
  /\bconfirm\s+(before|first)\b/i,
  /\bcheck\s+with\s+me\b/i,
  /\bdon'?t\s+execute\s+automatically\b/i,
  /\bneed\s+to\s+approve\b/i,
];

/**
 * Detect whether the user is requesting an execution mode change.
 * Returns the new ExecutionMode, or null if this is a regular intent message.
 *
 * Called BEFORE interpretIntent — if this returns non-null, skip the LLM call
 * and handle the mode switch directly in the pipeline.
 */
export function detectModeSwitch(rawInput: string): ExecutionMode | null {
  if (AUTONOMOUS_PATTERNS.some(p => p.test(rawInput))) return 'autonomous';
  if (SEMI_AUTONOMOUS_PATTERNS.some(p => p.test(rawInput))) return 'semi_autonomous';
  return null;
}

// ── Intent reasoning instruction ──────────────────────────────────────────

// v0.5: all four primitives ship live. The legacy primitives PROTECT / MOVE /
// SPEND / GROW / SAVE / EARN / INVEST are no longer recognised as user intents
// — if a message gestures at them, classify into the closest live primitive.
const REASONING_PREFIX = `You are Intend's intent reasoning engine. Your job is to understand
what this person wants their money to do — not to match keywords, but to genuinely reason
about their financial intention.

There are exactly four primitives in Intend. ALL four are active in this version:

  STORE    — hold, view, organise. The user wants to see their balance, check what
             they have, deposit funds, receive funds, or just leave their money
             sitting safely in their account. No transfer is happening.
               "show me my balance"           → STORE
               "what do I have"               → STORE
               "I want to add funds"          → STORE
               "where do I deposit"           → STORE
               "hold this for me"             → STORE
               "what's my wallet address"     → STORE

  SEND     — move USDC out of the user's account, to anyone, for any purpose.
             Person-to-person AND person-to-merchant collapse into one primitive
             — the destination is just an address.
               "send 50 to my sister"         → SEND
               "pay $200 to John"             → SEND
               "transfer to 0xabc..."         → SEND
               "settle this invoice"          → SEND
               "buy this with my wallet"      → SEND

  CONVERT  — explicit swap/exchange intent. The user wants to change one asset
             into another at the best available rate.
               "swap my ETH for USDC"         → CONVERT
               "exchange dollars to cedis"    → CONVERT
               "trade my BTC for stables"     → CONVERT

  ALLOCATE — deploy idle capital so it does work: yield, savings goals,
             investment positions, inflation protection. In v0.5 all of these
             land in the same yield-supply plan; we differentiate sub-modes later.
               "grow my money"                → ALLOCATE
               "earn yield on my USDC"        → ALLOCATE
               "save for a car"               → ALLOCATE
               "invest in ETH long-term"      → ALLOCATE
               "protect my savings from inflation" → ALLOCATE

Anything that smells like the OLD-spec primitives (protect, grow, save, earn, invest)
maps to ALLOCATE. Anything that smells like the OLD-spec MOVE or SPEND maps to SEND.
Do NOT emit any of: PROTECT, MOVE, SPEND, GROW, SAVE, EARN, INVEST.

Greetings, small talk, "hi", "what can you do" -> keep intent_confidence LOW
(below 0.5) and pick whichever primitive is closest; the pipeline will route
those to a conversational reply rather than a plan.

Assumptions layer — IMPORTANT:
Do NOT ask for clarification when parameters are simply missing (amount, recipient,
balance, etc.). Those are gathered in later steps. Only set clarification_needed=true
when the primitive itself is genuinely ambiguous AND the consequence is irreversible.

User message to reason about:
`;

// ── Public API ────────────────────────────────────────────────────────────

export interface InterpretResult {
  intention:              IntentionObject;
  needs_clarification:    boolean;
  clarification_question: string | null;
}

/**
 * Reason about a raw user message and produce a structured IntentionObject.
 *
 * @param rawInput - The verbatim user message
 * @param ufm      - The User Financial Model for this pipeline run
 *
 * IMPORTANT: `ufm` is injected via system prompt only. `rawInput` goes in
 * the user turn only. These must never be mixed — this is the prompt
 * injection defence described in CLAUDE.md.
 */
export async function interpretIntent(
  rawInput: string,
  ufm: UserFinancialModel,
  erp?: EconomicRealityProfile | null,
): Promise<InterpretResult> {
  const systemPrompt = buildSystemPrompt(ufm, erp);

  const result = await withFallback((model) =>
    generateObject({
      model,
      schema:  LLMSchema,
      system:  systemPrompt,
      prompt:  `${REASONING_PREFIX}${rawInput}`,
    })
  );

  const partial = result.object;

  // Inject timestamp — never trust the model to produce this correctly
  const intention: IntentionObject = {
    ...partial,
    raw_input:      rawInput,
    interpreted_at: new Date().toISOString(),
  };

  // Confidence threshold:
  //   < 0.75 → clarify (only when primitive is genuinely ambiguous)
  //   ≥ 0.75 → proceed; missing parameters are gathered downstream
  const needsClarification = partial.intent_confidence < 0.75;

  return {
    intention: {
      ...intention,
      clarification_needed: needsClarification,
    },
    needs_clarification:    needsClarification,
    clarification_question: needsClarification
      ? (partial.clarification_question ?? 'Could you tell me a bit more?')
      : null,
  };
}
