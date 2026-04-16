/**
 * intend-cron — Confirmation reminder scheduler
 *
 * PM2 process: intend-cron
 * Runs every 60 seconds. Responsibilities:
 *   1. Send due confirmation reminders (T+5, T+20, T+35)
 *   2. Expire intents that have been in 'confirmed' state > 40 minutes
 *
 * Designed to be idempotent — safe to restart at any time.
 */

import TelegramBot from 'node-telegram-bot-api';
import { getDueReminders, markReminderSent, getExpiredIntents, logEvent, getSupabase } from '@intend/data';

const TOKEN = process.env['TELEGRAM_BOT_TOKEN'];
if (!TOKEN) throw new Error('[intend-cron] TELEGRAM_BOT_TOKEN is required');

// Send-only bot instance — no polling, no webhooks
const bot = new TelegramBot(TOKEN);

const POLL_INTERVAL_MS = 60_000; // 1 minute

// ── Reminder sender ───────────────────────────────────────────────────────

async function sendDueReminders(): Promise<void> {
  const due = await getDueReminders();
  if (due.length === 0) return;

  console.log(`[intend-cron] ${due.length} reminder(s) due`);

  for (const reminder of due) {
    try {
      if (reminder.channel === 'telegram' && reminder.telegram_id) {
        await bot.sendMessage(reminder.telegram_id, reminder.message_text, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: 'Confirm', callback_data: `confirm:${reminder.intent_id}` },
              { text: 'Cancel',  callback_data: `cancel:${reminder.intent_id}` },
            ]],
          },
        });
      }
      // WhatsApp reminders — P1-18 (WhatsApp handler)

      await markReminderSent(reminder.reminder_id);

      await logEvent({
        user_id:    reminder.user_id,
        event_type: 'reminder_sent',
        source:     reminder.channel,
        event_data: { reminder_number: reminder.reminder_number, primitive: reminder.primitive },
        intent_id:  reminder.intent_id,
      });

      console.log(`[intend-cron] Sent reminder #${reminder.reminder_number} for intent ${reminder.intent_id}`);
    } catch (err) {
      console.error(`[intend-cron] Failed to send reminder ${reminder.reminder_id}:`, err);
      // Continue — don't let one failure block the rest
    }
  }
}

// ── Expiry handler ────────────────────────────────────────────────────────

async function expireStaleIntents(): Promise<void> {
  const expired = await getExpiredIntents();
  if (expired.length === 0) return;

  console.log(`[intend-cron] ${expired.length} intent(s) expiring`);

  for (const intent of expired) {
    try {
      // Cancel in DB
      await getSupabase()
        .from('intents')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('intent_id', intent.intent_id);

      // Mark all unsent reminders for this intent as sent (suppress future sends)
      await getSupabase()
        .from('confirmation_reminders')
        .update({ is_sent: true, sent_at: new Date().toISOString() })
        .eq('intent_id', intent.intent_id)
        .eq('is_sent', false);

      await logEvent({
        user_id:    intent.user_id,
        event_type: 'plan_expired',
        source:     intent.channel as 'telegram' | 'whatsapp' | 'web',
        event_data: {},
        intent_id:  intent.intent_id,
      });

      // Notify user — soft message, nothing moved
      if (intent.channel === 'telegram' && intent.telegram_id) {
        await bot.sendMessage(
          intent.telegram_id,
          'Your plan expired — nothing was moved. Tell me what you\'d like to do.',
        );
      }

      console.log(`[intend-cron] Expired intent ${intent.intent_id}`);
    } catch (err) {
      console.error(`[intend-cron] Failed to expire intent ${intent.intent_id}:`, err);
    }
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  try {
    await sendDueReminders();
    await expireStaleIntents();
  } catch (err) {
    console.error('[intend-cron] Tick error:', err);
  }
}

console.log('[intend-cron] Starting — polling every 60s');

// Run immediately on startup, then on interval
tick();
setInterval(tick, POLL_INTERVAL_MS);
