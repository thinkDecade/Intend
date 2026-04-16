import { generateText, streamText } from 'ai';
import type { ExecutionPlan, UserFinancialModel } from '@intend/core';
import { withFallback, getModel } from './model-router.js';
import { buildSystemPrompt } from './system-prompt.js';

const CONFIRMATION_RULES = `
Generate a confirmation preview message for the execution plan below.

Rules — all must be satisfied:
1. Outcome language only — describe what happens to money, never mechanisms.
2. No protocol names (say 'a yield protocol', not 'Aave V3').
3. No chain names (say 'in your wallet', not 'on Base').
4. Always disclose total fee on its own line: "Fee: $X.XX total"
5. Always include timing: "About 30 seconds" / "Usually within 5 minutes"
6. Use 'historically', 'typically', 'expected to' — never 'will' or 'guaranteed'.
7. For DEX operations: include "Minimum you receive: X"
8. Show local currency equivalent where the user would find it helpful.
9. End with exactly one yes/no question asking for confirmation.
10. Maximum 5 lines total.
`;

/**
 * Generate a one-shot confirmation preview (Telegram / WhatsApp).
 * Returns complete message — no streaming.
 */
export async function generateConfirmationMessage(
  plan: ExecutionPlan,
  ufm: UserFinancialModel,
): Promise<string> {
  const result = await withFallback((model) =>
    generateText({
      model,
      system: buildSystemPrompt(ufm),
      prompt: `${CONFIRMATION_RULES}\n\nExecution plan:\n${JSON.stringify(plan, null, 2)}`,
    })
  );
  return result.text;
}

/**
 * Stream a confirmation preview for the WebApp.
 * Returns an async iterable text stream — pipe to SSE response.
 *
 * Uses primary model directly; WebApp error boundary handles failure.
 */
export async function streamConfirmationMessage(
  plan: ExecutionPlan,
  ufm: UserFinancialModel,
): Promise<AsyncIterable<string>> {
  const { textStream } = streamText({
    model: getModel('primary'),
    system: buildSystemPrompt(ufm),
    prompt: `${CONFIRMATION_RULES}\n\nExecution plan:\n${JSON.stringify(plan, null, 2)}`,
  });
  return textStream;
}
