/**
 * Agent Pipeline — Telegram
 *
 * Message → mode-switch check → interpretIntent → buildUFM → generatePlan → send preview
 *
 * Mode-switch intents are intercepted before the LLM call (fast regex, no latency).
 * Disabled primitives surface a friendly "coming soon" message via PrimitiveDisabledError.
 */

import { isAddress } from 'viem';
import type TelegramBot from 'node-telegram-bot-api';
import { interpretIntent, generateConfirmationMessage, buildUFM, detectModeSwitch, loadERP } from '@intend/intelligence';
import type { EconomicRealityProfile } from '@intend/core';
import { getOrCreateWallet, readBalances } from '@intend/execution';
import { getActivePositions, getActiveGoals, getPendingConfirmations, logEvent, createIntent, scheduleReminders, updateUserSettings, getUserByTelegramId } from '@intend/data';
import { generatePlan, PrimitiveDisabledError } from '@intend/decision';
import type { UserFinancialModel, IntentionObject, ExecutionMode } from '@intend/core';
import { getSession, saveSession, addToHistory } from './session.js';
import { truncate, bold } from './formatter.js';

const CONFIRMATION_MAX = 400;
const NETWORK: 'mainnet' | 'testnet' = process.env['NODE_ENV'] === 'production' ? 'mainnet' : 'testnet';

// Mode-switch confirmation messages — written in outcomes, not mechanics
const MODE_MESSAGES: Record<ExecutionMode, string> = {
  autonomous:     `Got it. I'll execute from now on — you'll receive a receipt after each action. Say "ask me first" any time to switch back.`,
  semi_autonomous: `Got it. I'll always show you the plan and wait for your confirmation before anything moves.`,
};

async function handleModeSwitch(
  bot:       TelegramBot,
  chatId:    number,
  userId:    string,
  telegramId: bigint,
  newMode:   ExecutionMode,
): Promise<void> {
  // Update DB
  await updateUserSettings(userId, { execution_mode: newMode });

  // Update session so it takes effect immediately
  const session = await getSession(telegramId, userId);
  await saveSession(telegramId, session);

  await logEvent({
    user_id:    userId,
    event_type: 'execution_mode_changed',
    source:     'telegram',
    event_data: { new_mode: newMode },
  });

  await bot.sendMessage(chatId, MODE_MESSAGES[newMode], { parse_mode: 'Markdown' });
}

async function buildStrategyContext(
  intention: IntentionObject,
  ufm:       UserFinancialModel,
) {
  const recipientRaw     = intention.parameters.recipient_raw ?? '';
  const resolvedAddress  = isAddress(recipientRaw) ? recipientRaw : '';
  const isNewRecipient   = resolvedAddress !== '';

  let goalId: string | undefined;
  if (intention.primitive === 'SAVE') {
    const goalName = intention.parameters.goal_name;
    const matched  = goalName
      ? ufm.present.active_goals.find(g => g.name.toLowerCase() === goalName.toLowerCase())
      : ufm.present.active_goals[0];
    goalId = matched?.id;
  }

  const inboundAmount = typeof intention.parameters.amount === 'number'
    ? intention.parameters.amount
    : 0;

  return {
    network:        NETWORK,
    recipientType:  'claim' as const,
    ...(goalId ? { goalId } : {}),
    inboundAsset:   intention.parameters.asset_from ?? 'USDC',
    inboundAmount,
    resolvedAddress,
    isNewRecipient,
  };
}

export async function runPipeline(
  bot:    TelegramBot,
  msg:    TelegramBot.Message,
  userId: string,
): Promise<void> {
  const chatId    = msg.chat.id;
  const telegramId = BigInt(msg.from!.id);
  const text       = msg.text ?? '';

  // ── 0. Mode-switch detection (pre-LLM, regex only) ───────────────────────
  const newMode = detectModeSwitch(text);
  if (newMode !== null) {
    await handleModeSwitch(bot, chatId, userId, telegramId, newMode);
    return;
  }

  const session = await getSession(telegramId, userId);

  // ── Conflict check — pending confirmation exists ──────────────────────────
  if (session.state === 'confirming' && session.pending_plan) {
    session.state            = 'conflict';
    session.new_message_held = text;
    await saveSession(telegramId, session);

    const primitive = session.pending_plan.intention.primitive;
    // Surface MOVE as "Send" to user
    const label = primitive === 'MOVE' ? 'Send' : primitive.charAt(0) + primitive.slice(1).toLowerCase();

    await bot.sendMessage(chatId,
      `You have a pending *${label}* waiting for confirmation.\n\nWant to park it and handle your new request first?`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: `Park ${label}, continue`,  callback_data: `park:${session.pending_plan.intention.interpreted_at}` },
            { text: 'Finish first',             callback_data: 'finish_first' },
            { text: 'Cancel pending',           callback_data: 'cancel_pending' },
          ]],
        },
      }
    );
    return;
  }

  // ── 1. Build UFM + load ERP ───────────────────────────────────────────────
  let ufm: UserFinancialModel;
  let erp: EconomicRealityProfile | null = null;
  try {
    const network    = process.env['NODE_ENV'] === 'production' ? 'base' : 'base-sepolia';
    const { provider } = await getOrCreateWallet(userId, network as 'base' | 'base-sepolia');
    const [balances, positions, goals, pending, erpLoaded] = await Promise.all([
      readBalances(provider, network as 'base' | 'base-sepolia'),
      getActivePositions(userId),
      getActiveGoals(userId),
      getPendingConfirmations(userId),
      loadERP(userId).catch((err: Error) => {
        // ERP loader failure is non-fatal — agent still has UFM grounding.
        console.warn(`[pipeline] loadERP failed for ${userId}:`, err.message);
        return null;
      }),
    ]);
    erp = erpLoaded;

    ufm = await buildUFM(userId, {
      balances,
      activePositions: positions.map((p) => ({
        id:           p.position_id,
        asset:        p.asset,
        protocol:     p.protocol,
        amount:       p.amount_deposited,
        usd_value:    p.amount_current,
        apy_at_entry: p.apy_at_entry ?? 0,
        opened_at:    p.opened_at,
      })),
      activeGoals: goals.map((g) => ({
        id:          g.horizon_id,
        name:        g.goal_name,
        target_usd:  g.target_amount,
        current_usd: g.current_amount,
        apy:         null,
        created_at:  g.created_at,
      })),
      pendingConfirmations: pending.map((p) => ({
        intent_id:  p.intent_id,
        primitive:  p.primitive,
        summary:    p.raw_input,
        created_at: p.created_at,
        expires_at: new Date(Date.parse(p.created_at) + 40 * 60 * 1000).toISOString(),
      })),
    });
  } catch (err) {
    await bot.sendMessage(chatId, err instanceof Error ? err.message : 'Something went wrong.');
    return;
  }

  // ── 2. Interpret intent ───────────────────────────────────────────────────
  addToHistory(session, 'user', text);

  let interpretation;
  try {
    interpretation = await interpretIntent(text, ufm, erp);
  } catch {
    await bot.sendMessage(chatId, "I couldn't understand that. Could you rephrase?");
    return;
  }

  const { intention, needs_clarification, clarification_question } = interpretation;

  // ── 3. Clarification ──────────────────────────────────────────────────────
  if (needs_clarification && clarification_question) {
    addToHistory(session, 'assistant', clarification_question);
    session.state = 'clarifying';
    await saveSession(telegramId, session);
    await bot.sendMessage(chatId, clarification_question, { parse_mode: 'Markdown' });
    await logEvent({
      user_id:    userId, event_type: 'intent_clarified', source: 'telegram',
      event_data: { primitive: intention.primitive, question: clarification_question },
    });
    return;
  }

  // ── 4. Record intent ──────────────────────────────────────────────────────
  const intentRow = await createIntent(userId, 'telegram', intention);
  await logEvent({
    user_id:    userId, event_type: 'intent_created', source: 'telegram',
    event_data: { primitive: intention.primitive, confidence: intention.intent_confidence },
    intent_id:  intentRow.intent_id,
  });

  // ── 5. Generate execution plan ────────────────────────────────────────────
  let plan;
  try {
    const stratCtx = await buildStrategyContext(intention, ufm);
    const generated = await generatePlan(intention, ufm, stratCtx);
    plan = { ...generated, plan_id: intentRow.intent_id, created_at: intentRow.created_at };
  } catch (err) {
    // Friendly message for disabled primitives
    const msg2 = err instanceof PrimitiveDisabledError
      ? err.message
      : err instanceof Error ? err.message : 'Could not build a plan for that.';
    await bot.sendMessage(chatId, msg2);
    return;
  }

  // ── 6. Autonomous mode: execute immediately ───────────────────────────────
  const requiresConfirmation = ufm.identity.execution_mode === 'semi_autonomous'
    || ['PROTECT'].includes(intention.primitive);

  if (!requiresConfirmation) {
    // Autonomous path — execute, send receipt
    // (Full dispatch wiring is Phase 5 — this stub acknowledges the intent)
    const receipt = `✓ Executing your ${intention.primitive.toLowerCase()} now. I'll let you know when it's done.`;
    await bot.sendMessage(chatId, receipt, { parse_mode: 'Markdown' });
    return;
  }

  // ── 7. Semi-autonomous path: show confirmation preview ────────────────────
  let preview: string;
  try {
    preview = await generateConfirmationMessage(plan, ufm, erp);
    preview = truncate(preview, CONFIRMATION_MAX);
  } catch {
    const label = intention.primitive === 'MOVE' ? 'send' : intention.primitive.toLowerCase();
    preview = `Ready to ${label} — shall I proceed?`;
  }

  addToHistory(session, 'assistant', preview);
  session.state        = 'confirming';
  session.pending_plan = plan;
  await saveSession(telegramId, session);

  await scheduleReminders(intentRow.intent_id, userId, 'telegram').catch((err: Error) =>
    console.error('[pipeline] Failed to schedule reminders:', err.message)
  );

  // Label MOVE as "Send" in the confirm button
  const actionLabel = intention.primitive === 'MOVE' ? 'Send' : intention.primitive.charAt(0) + intention.primitive.slice(1).toLowerCase();

  await bot.sendMessage(chatId, preview, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [[
        { text: `✓ ${actionLabel}`,  callback_data: `confirm:${intentRow.intent_id}` },
        { text: 'Cancel',            callback_data: `cancel:${intentRow.intent_id}` },
      ]],
    },
  });
}
