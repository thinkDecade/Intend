'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, getUserByTelegramId, updateUserSettings, getRedis, logEvent } from '@intend/data';

export async function signOut() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
  redirect('/login');
}

/** Resolve the internal users row for the authed caller, or null if none. */
async function getAuthedUser() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const dbUser = await getUserByEmail(user.email).catch(() => null);
  return dbUser;
}

export async function updateExecutionMode(formData: FormData) {
  const mode = formData.get('execution_mode') as 'autonomous' | 'semi_autonomous';
  if (mode !== 'autonomous' && mode !== 'semi_autonomous') {
    return { error: 'Invalid mode' };
  }
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  await updateUserSettings(dbUser.user_id, { execution_mode: mode });
  revalidatePath('/app/settings');
  return { success: true };
}

export async function updateProfile(formData: FormData) {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  const display_name    = (formData.get('display_name') as string | null)?.trim() || null;
  const local_currency  = (formData.get('local_currency') as string | null)?.trim().toUpperCase();
  const region          = (formData.get('region') as string | null)?.trim().toUpperCase();
  const timezone        = (formData.get('timezone') as string | null)?.trim();

  const patch: Parameters<typeof updateUserSettings>[1] = {};
  if (display_name !== undefined)   patch.display_name   = display_name;
  if (local_currency)               patch.local_currency = local_currency;
  if (region)                       patch.region         = region;
  if (timezone)                     patch.timezone       = timezone;

  if (local_currency && !/^[A-Z]{3}$/.test(local_currency)) {
    return { error: 'Currency must be a 3-letter code (e.g. USD, GHS)' };
  }
  if (region && !/^[A-Z]{2}$/.test(region)) {
    return { error: 'Region must be a 2-letter country code (e.g. US, GH)' };
  }

  await updateUserSettings(dbUser.user_id, patch);
  revalidatePath('/app/settings');
  return { success: true };
}

export async function updateLimits(formData: FormData) {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  const raw = formData.get('max_auto_tx_usd') as string | null;
  const confirmNew = formData.get('require_confirm_new_recipient') === 'on';

  const patch: Parameters<typeof updateUserSettings>[1] = {
    require_confirm_new_recipient: confirmNew,
  };

  if (raw && raw.trim() !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
      return { error: 'Amount must be between 0 and 1,000,000' };
    }
    patch.max_auto_tx_usd = n;
  }

  await updateUserSettings(dbUser.user_id, patch);
  revalidatePath('/app/settings');
  return { success: true };
}

/**
 * Called by ChatPanel when the onboarding conversation has collected
 * enough profile info. Saves extracted fields + marks onboarding done.
 */
export async function completeOnboardingFromChat(fields: {
  display_name?:   string | null;
  local_currency?: string;
  execution_mode?: 'autonomous' | 'semi_autonomous';
}) {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  const patch: Parameters<typeof updateUserSettings>[1] = {};
  if (fields.display_name !== undefined)  patch.display_name   = fields.display_name;
  if (fields.local_currency)              patch.local_currency = fields.local_currency;
  if (fields.execution_mode)              patch.execution_mode = fields.execution_mode;

  if (Object.keys(patch).length > 0) {
    await updateUserSettings(dbUser.user_id, patch);
  }

  // Mark onboarding complete
  const { getSupabase } = await import('@intend/data');
  await getSupabase()
    .from('users')
    .update({ onboarding_completed: true })
    .eq('user_id', dbUser.user_id);

  revalidatePath('/app');
  return { success: true };
}

/**
 * Consume a 6-digit code that the Telegram bot generated via `/connect`.
 * On success, links the caller's web account to their Telegram identity so
 * BOTH channels share the same user_id, ERP, UFM, and durable session row.
 */
export async function linkTelegram(formData: FormData) {
  const codeRaw = (formData.get('link_code') as string | null)?.trim() ?? '';
  if (!/^\d{6}$/.test(codeRaw)) {
    return { error: 'Enter the 6-digit code from Telegram.' };
  }

  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  // Already linked? short-circuit (idempotent UX).
  if (dbUser.telegram_id !== null) {
    return { error: 'Telegram is already linked. Use /unlink in the bot first.' };
  }

  const redis = getRedis();
  const key   = `intend:link_code:${codeRaw}`;
  const raw   = await redis.get<string | { telegram_id: number; user_id: string }>(key);

  if (!raw) {
    return { error: 'That code expired or is wrong. Run /connect in Telegram for a new one.' };
  }

  // Upstash returns parsed JSON when the value was a JSON string; handle both shapes.
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const telegramId = BigInt(parsed.telegram_id);

  // Reject if a DIFFERENT account already holds that telegram_id.
  const existing = await getUserByTelegramId(telegramId).catch(() => null);
  if (existing && existing.user_id !== dbUser.user_id) {
    return { error: 'That Telegram account is already linked to a different Intend user.' };
  }

  await updateUserSettings(dbUser.user_id, { telegram_id: telegramId });
  await redis.del(key);

  await logEvent({
    user_id:    dbUser.user_id,
    event_type: 'channel_linked',
    source:     'web',
    event_data: { channel: 'telegram', telegram_id: telegramId.toString() },
  }).catch(() => { /* observability — never block the link */ });

  revalidatePath('/app/settings');
  return { success: true };
}

/** Sever the Telegram link. Idempotent. */
export async function unlinkTelegram() {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  await updateUserSettings(dbUser.user_id, { telegram_id: null });
  await logEvent({
    user_id:    dbUser.user_id,
    event_type: 'channel_linked',     // semantic: channel-link state changed
    source:     'web',
    event_data: { channel: 'telegram', unlinked: true },
  }).catch(() => { /* swallow */ });

  revalidatePath('/app/settings');
  return { success: true };
}

export async function updatePreferredChannel(formData: FormData) {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  const ch = formData.get('preferred_channel') as string | null;
  if (ch && !['telegram', 'whatsapp', 'web'].includes(ch)) {
    return { error: 'Invalid channel' };
  }

  await updateUserSettings(dbUser.user_id, {
    preferred_channel: (ch || null) as 'telegram' | 'whatsapp' | 'web' | null,
  });
  revalidatePath('/app/settings');
  return { success: true };
}
