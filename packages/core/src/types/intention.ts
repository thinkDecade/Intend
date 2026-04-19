import { z } from 'zod';

// v0.5_updated primitives.
// Active in v0.5:        STORE (Store & Manage), SEND (Send/Spend merged).
// Follow-up (gated):     CONVERT (v0.6), ALLOCATE (v0.7).
// Legacy (deprecated):   PROTECT, MOVE, SPEND, GROW, SAVE, EARN, INVEST.
//
// Legacy values stay in the enum so existing rows in `intents` keep
// validating, but the interpreter no longer emits them and the strategy
// router rejects them with PrimitiveDisabledError. They will be removed
// after a one-cycle deprecation pass.
export const IntentionSchema = z.object({
  primitive: z.enum([
    'STORE', 'SEND', 'CONVERT', 'ALLOCATE',
    // legacy — interpreter does not emit, router rejects
    'PROTECT', 'GROW', 'INVEST', 'SAVE', 'MOVE', 'SPEND', 'EARN',
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

export type Primitive = IntentionObject['primitive'];
export type Channel = 'telegram' | 'whatsapp' | 'web';

/**
 * Execution mode — controls whether Intend executes immediately or waits for user confirmation.
 *
 * autonomous:    Intent in, outcome out. Executes immediately, sends receipt after.
 * semi_autonomous: Shows plan, waits for one explicit confirmation before executing.
 *
 * v0.5_updated default: 'semi_autonomous' (Assisted mode) — every transaction
 * shows a plan and waits for explicit confirmation. Autonomous mode is gated
 * to v0.5.9 per the spec roadmap.
 */
export type ExecutionMode = 'autonomous' | 'semi_autonomous';

/** @deprecated Use ExecutionMode instead */
export type AutomationLevel = ExecutionMode;
