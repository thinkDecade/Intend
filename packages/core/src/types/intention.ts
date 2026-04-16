import { z } from 'zod';

export const IntentionSchema = z.object({
  primitive: z.enum([
    'PROTECT', 'GROW', 'INVEST', 'SAVE',
    'MOVE', 'SPEND', 'EARN', 'CONVERT',
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
 * PROTECT is always semi_autonomous regardless of user setting — hardcoded in permission-gate.
 */
export type ExecutionMode = 'autonomous' | 'semi_autonomous';

/** @deprecated Use ExecutionMode instead */
export type AutomationLevel = ExecutionMode;
