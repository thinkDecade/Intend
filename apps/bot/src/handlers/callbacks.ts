/**
 * Inline keyboard callback handlers
 *
 * Callbacks: confirm:{intent_id} | cancel:{intent_id} | park:{key} | finish_first | cancel_pending
 */

import type TelegramBot from 'node-telegram-bot-api';
import { getSession, saveSession } from '../session.js';
import { logEvent, getSupabase } from '@intend/data';
import { getOrCreateWallet, dispatch } from '@intend/execution';
import { runPipeline } from '../pipeline.js';

const NETWORK: 'base' | 'base-sepolia' = process.env['NODE_ENV'] === 'production' ? 'base' : 'base-sepolia';

async function resolveUserId(telegramId: number): Promise<string | null> {
  const { data } = await getSupabase()
    .from('users')
    .select('user_id')
    .eq('telegram_id', telegramId.toString())
    .single();
  return data ? (data as { user_id: string }).user_id : null;
}

export async function handleCallback(
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery,
): Promise<void> {
  const chatId = query.message!.chat.id;
  const telegramId = BigInt(query.from.id);
  const data = query.data ?? '';

  await bot.answerCallbackQuery(query.id);

  const userId = await resolveUserId(query.from.id);
  if (!userId) return;

  const session = await getSession(telegramId, userId);

  // ── confirm:{intent_id} ─────────────────────────────────────────────────
  if (data.startsWith('confirm:')) {
    const intentId = data.slice('confirm:'.length);

    if (session.state !== 'confirming' || session.pending_plan?.plan_id !== intentId) {
      await bot.sendMessage(chatId, 'This confirmation has expired.');
      return;
    }

    const plan = session.pending_plan;
    session.state = 'executing';
    await saveSession(telegramId, session);

    await bot.sendMessage(chatId, '⏳ On it…');

    await logEvent({
      user_id: userId, event_type: 'intent_confirmed', source: 'telegram',
      event_data: {}, intent_id: intentId,
    });

    await getSupabase()
      .from('intents')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('intent_id', intentId);

    // ── Dispatch plan through execution layer ───────────────────────────────
    let dispatchResult;
    try {
      const { provider } = await getOrCreateWallet(userId, NETWORK);
      dispatchResult = await dispatch(plan, provider, 'telegram');
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Execution failed.';
      session.state = 'idle';
      session.pending_plan = null;
      await saveSession(telegramId, session);
      await bot.editMessageText(`Something went wrong: ${errMsg}`, {
        chat_id: chatId, message_id: query.message!.message_id,
      });
      return;
    }

    session.state = 'idle';
    session.pending_plan = null;
    await saveSession(telegramId, session);

    if (dispatchResult.success) {
      const txRef = dispatchResult.tx_hashes[0]
        ? `\n\nTx: \`${dispatchResult.tx_hashes[0]}\`` : '';
      await bot.editMessageText(
        `Done.${txRef}`,
        { chat_id: chatId, message_id: query.message!.message_id, parse_mode: 'Markdown' }
      );
    } else {
      await bot.editMessageText(
        `Execution failed: ${dispatchResult.error ?? 'Unknown error'}`,
        { chat_id: chatId, message_id: query.message!.message_id }
      );
    }
    return;
  }

  // ── cancel:{intent_id} ──────────────────────────────────────────────────
  if (data.startsWith('cancel:')) {
    const intentId = data.slice('cancel:'.length);

    session.state = 'idle';
    session.pending_plan = null;
    await saveSession(telegramId, session);

    await getSupabase()
      .from('intents')
      .update({ status: 'cancelled' })
      .eq('intent_id', intentId);

    await logEvent({
      user_id: userId, event_type: 'intent_cancelled', source: 'telegram',
      event_data: { reason: 'user_declined' }, intent_id: intentId,
    });

    await bot.editMessageText('Cancelled. What would you like to do?', {
      chat_id: chatId, message_id: query.message!.message_id,
    });
    return;
  }

  // ── park:{key} ──────────────────────────────────────────────────────────
  if (data.startsWith('park:')) {
    const parkedId = session.pending_plan?.plan_id ?? null;
    const held = session.new_message_held;

    session.state = 'idle';
    session.parked_intent_id = parkedId;
    session.pending_plan = null;
    session.new_message_held = null;
    await saveSession(telegramId, session);

    await bot.sendMessage(chatId, 'Parked. Let\'s handle your new request.');

    // Re-run the held message through the pipeline
    if (held) {
      const fakeMsg = { ...query.message!, text: held, from: query.message!.from! };
      await runPipeline(bot, fakeMsg as TelegramBot.Message, userId);
    }
    return;
  }

  // ── finish_first ────────────────────────────────────────────────────────
  if (data === 'finish_first') {
    session.state = 'confirming';
    await saveSession(telegramId, session);
    await bot.sendMessage(chatId, 'OK — finish your pending confirmation first, then tell me your new request.');
    return;
  }

  // ── cancel_pending ───────────────────────────────────────────────────────
  if (data === 'cancel_pending') {
    const intentId = session.pending_plan?.plan_id ?? null;
    const held = session.new_message_held;

    session.state = 'idle';
    session.pending_plan = null;
    session.new_message_held = null;
    await saveSession(telegramId, session);

    if (intentId) {
      await logEvent({
        user_id: userId, event_type: 'intent_cancelled', source: 'telegram',
        event_data: { reason: 'replaced_by_new' }, intent_id: intentId,
      });
    }

    await bot.sendMessage(chatId, 'Cancelled. Handling your new request now.');

    if (held) {
      const fakeMsg = { ...query.message!, text: held, from: query.message!.from! };
      await runPipeline(bot, fakeMsg as TelegramBot.Message, userId);
    }
  }
}
