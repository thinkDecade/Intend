/**
 * Confirmation reminder repository
 *
 * Schema: confirmation_reminders (reminder_id, intent_id, user_id, channel,
 *         reminder_number, scheduled_for, sent_at, is_sent, message_text, created_at)
 *
 * Three rows per CONFIRMING intent — T+5, T+20, T+35.
 * Expiry at T+40 is handled separately by the cron (intent → cancelled).
 */

import { getSupabase } from '../supabase.js';

export type ReminderChannel = 'telegram' | 'whatsapp' | 'web';

export interface ReminderRow {
  reminder_id:     string;
  intent_id:       string;
  user_id:         string;
  channel:         ReminderChannel;
  reminder_number: 1 | 2 | 3;
  scheduled_for:   string;
  sent_at:         string | null;
  is_sent:         boolean;
  message_text:    string;
  created_at:      string;
}

export interface DueReminder extends ReminderRow {
  // Joined from users
  telegram_id: string | null;
  whatsapp_id: string | null;
  // Joined from intents
  primitive:   string;
}

// Reminder texts (max 180 chars per notification rule)
const REMINDER_TEXTS: Record<1 | 2 | 3, string> = {
  1: '⏳ Still waiting on your confirmation. Tap *Confirm* to proceed or *Cancel* to dismiss.',
  2: '⚠️ Your plan expires in *20 minutes*. Confirm now or it will be cancelled automatically.',
  3: '🔴 *Final reminder* — expires in 5 minutes. Confirm or it will cancel.',
};

const OFFSETS_MINUTES: Record<1 | 2 | 3, number> = { 1: 5, 2: 20, 3: 35 };

/**
 * Insert 3 reminder rows for a newly CONFIRMING intent.
 * Call this immediately after a confirmation preview is sent.
 */
export async function scheduleReminders(
  intentId: string,
  userId: string,
  channel: ReminderChannel,
  confirmedAt: Date = new Date(),
): Promise<void> {
  const rows = ([1, 2, 3] as const).map((n) => ({
    intent_id:       intentId,
    user_id:         userId,
    channel,
    reminder_number: n,
    scheduled_for:   new Date(confirmedAt.getTime() + OFFSETS_MINUTES[n] * 60_000).toISOString(),
    message_text:    REMINDER_TEXTS[n],
    is_sent:         false,
  }));

  const { error } = await getSupabase()
    .from('confirmation_reminders')
    .insert(rows);

  if (error) throw new Error(`[reminders] scheduleReminders: ${error.message}`);
}

/**
 * Fetch all unsent reminders whose scheduled_for <= NOW()
 * and whose intent is still in 'confirmed' status.
 *
 * Uses the view / query from the schema: is_sent = FALSE AND scheduled_for <= NOW()
 * with JOIN on intents to skip already-executed or cancelled intents.
 */
export async function getDueReminders(): Promise<DueReminder[]> {
  const { data, error } = await getSupabase()
    .from('confirmation_reminders')
    .select(`
      reminder_id, intent_id, user_id, channel,
      reminder_number, scheduled_for, sent_at, is_sent, message_text, created_at,
      users!inner ( telegram_id, whatsapp_id ),
      intents!inner ( primitive, status )
    `)
    .eq('is_sent', false)
    .lte('scheduled_for', new Date().toISOString())
    .eq('intents.status', 'confirmed')
    .order('scheduled_for', { ascending: true });

  if (error) throw new Error(`[reminders] getDueReminders: ${error.message}`);

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const users  = r['users']  as Record<string, unknown>;
    const intents = r['intents'] as Record<string, unknown>;
    return {
      reminder_id:     r['reminder_id'] as string,
      intent_id:       r['intent_id'] as string,
      user_id:         r['user_id'] as string,
      channel:         r['channel'] as ReminderChannel,
      reminder_number: r['reminder_number'] as 1 | 2 | 3,
      scheduled_for:   r['scheduled_for'] as string,
      sent_at:         r['sent_at'] as string | null,
      is_sent:         r['is_sent'] as boolean,
      message_text:    r['message_text'] as string,
      created_at:      r['created_at'] as string,
      telegram_id:     users['telegram_id'] as string | null,
      whatsapp_id:     users['whatsapp_id'] as string | null,
      primitive:       intents['primitive'] as string,
    };
  });
}

/** Mark a reminder as sent. */
export async function markReminderSent(reminderId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('confirmation_reminders')
    .update({ is_sent: true, sent_at: new Date().toISOString() })
    .eq('reminder_id', reminderId);

  if (error) throw new Error(`[reminders] markReminderSent: ${error.message}`);
}

/**
 * Fetch all intents that have been in 'confirmed' status for > 40 minutes
 * and have not yet been executed. These should be expired.
 */
export async function getExpiredIntents(): Promise<Array<{ intent_id: string; user_id: string; channel: string; telegram_id: string | null }>> {
  const cutoff = new Date(Date.now() - 40 * 60_000).toISOString();

  const { data, error } = await getSupabase()
    .from('intents')
    .select('intent_id, user_id, channel, users!inner ( telegram_id )')
    .eq('status', 'confirmed')
    .lt('confirmed_at', cutoff);

  if (error) throw new Error(`[reminders] getExpiredIntents: ${error.message}`);

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as Record<string, unknown>;
    const users = r['users'] as Record<string, unknown>;
    return {
      intent_id:   r['intent_id'] as string,
      user_id:     r['user_id'] as string,
      channel:     r['channel'] as string,
      telegram_id: users['telegram_id'] as string | null,
    };
  });
}
